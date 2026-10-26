package network

import (
	"context"
	"encoding/json"
	"errors"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"openend/internal/process"
)

func BenchmarkMonitorProcessChurn(b *testing.B) {
	for i := 0; i < b.N; i++ {
		runtime.GC()
		var before, after runtime.MemStats
		runtime.ReadMemStats(&before)
		m := New()
		m.snapshot.State = "ready"
		m.lastSample = time.UnixMilli(1000)
		for pid := int32(1); pid <= 10000; pid++ {
			command := strings.Repeat("x", 2048) + strconv.Itoa(int(pid))
			m.processEvent(pid, 0, 1000, true, false, "worker.exe", command)
			m.processEvent(pid, 0, 2000, false, false, "", "")
		}
		m.sample(time.UnixMilli(122000))
		runtime.GC()
		runtime.ReadMemStats(&after)
		b.ReportMetric(float64(len(m.entries)), "retained-entries")
		if after.HeapAlloc > before.HeapAlloc {
			b.ReportMetric(float64(after.HeapAlloc-before.HeapAlloc), "retained-bytes")
		}
		runtime.KeepAlive(m)
	}
}

func TestIdleProcessPruningPreservesTrafficParentsAndPIDGenerations(t *testing.T) {
	m := New()
	m.snapshot.State = "ready"
	m.lastSample = time.UnixMilli(1000)
	for _, pid := range []int32{1, 2, 3, 4, 5, 6, 7, 8} {
		m.processEvent(pid, 0, 1000, true, false, "worker.exe", "worker")
	}
	m.traffic(1, 1500, 512, false, false)
	m.traffic(8, 1500, 256, true, true)
	for _, pid := range []int32{1, 2, 5, 6, 7, 8} {
		m.processEvent(pid, 0, 2000, false, false, "", "")
	}
	m.current[3].ParentPID = 5 // Keep an exited parent and its ancestors.
	m.current[5].ParentPID = 6
	m.processEvent(7, 0, 3000, true, false, "new.exe", "new")
	m.processEvent(4, 0, 120000, false, false, "", "")
	m.sample(time.UnixMilli(122000))
	if len(m.entries) != 7 || len(m.current) != 7 || m.current[2] != nil || m.current[7].Name != "new.exe" {
		t.Fatalf("unexpected retained processes: entries=%d current=%v", len(m.entries), m.current)
	}
	for _, pid := range []int32{1, 3, 4, 5, 6, 8} {
		if m.current[pid] == nil {
			t.Fatalf("lost traffic, active/recent process, or required parent %d", pid)
		}
	}
	m.traffic(4, 119000, 128, false, false) // An exit may arrive before its traffic.
	m.sample(time.UnixMilli(183000))
	s := m.Snapshot()
	if len(s.Processes) != 3 || s.DownloadBytes != 640 || s.LocalUploadBytes != 256 || s.Processes[1].PID != 4 {
		t.Fatalf("pruning lost archived or delayed traffic: %+v", s)
	}
	m.processEvent(3, 5, 184000, false, false, "", "")
	m.sample(time.UnixMilli(245000))
	if m.current[3] != nil || m.current[5] != nil || m.current[6] != nil {
		t.Fatal("unused exited ancestors were retained")
	}
	for _, e := range m.entries[len(m.entries):cap(m.entries)] {
		if e != nil {
			t.Fatal("removed entries are still reachable through the slice backing array")
		}
	}
}

func TestNetworkSummaryKeepsCountersHistoryAndStatusWithoutProcessRows(t *testing.T) {
	m := New()
	m.snapshot.State, m.snapshot.StartedAt = "ready", 1000
	m.lastSample = time.UnixMilli(1000)
	m.processEvent(1, 0, 1000, true, false, "node.exe", "node server.js")
	m.traffic(1, 1100, 1024, false, false)
	m.sample(time.UnixMilli(2000))
	m.fail(errors.New("network.traceStopped"))
	summary, full := m.Summary(), m.Snapshot()
	if len(summary.Processes) != 0 || summary.Processes == nil || len(full.Processes) != 1 || summary.Counters != full.Counters || summary.State != full.State || summary.Error != full.Error || summary.StartedAt != full.StartedAt || summary.UpdatedAt != full.UpdatedAt || len(summary.History) != len(full.History) {
		t.Fatalf("summary changed the network readings: %+v", summary)
	}
	summary.History[0].DownloadRate = 0
	if m.Summary().History[0].DownloadRate != 1024 {
		t.Fatal("summary aliases monitor history")
	}
}

func BenchmarkMonitorSnapshots(b *testing.B) {
	m := New()
	m.snapshot.State, m.snapshot.StartedAt = "ready", 1000
	m.lastSample = time.UnixMilli(1000)
	for pid := int32(1); pid <= 10000; pid++ {
		m.processEvent(pid, 0, 1000, true, false, "worker.exe", strings.Repeat("x", 2048))
		m.traffic(pid, 1100, 1024, false, false)
		m.current[pid].IconDataURL = "data:image/png;base64," + strings.Repeat("x", 512)
	}
	for second := int64(2); second <= 62; second++ {
		m.sample(time.UnixMilli(second * 1000))
	}
	for _, mode := range []struct {
		name string
		read func() Snapshot
	}{{"full", m.Snapshot}, {"summary", m.Summary}} {
		b.Run(mode.name, func(b *testing.B) {
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				data, err := json.Marshal(mode.read())
				if err != nil {
					b.Fatal(err)
				}
				b.ReportMetric(float64(len(data)), "payload-bytes")
			}
		})
	}
}

func TestSessionTotalsSurviveExitAndPIDReuse(t *testing.T) {
	m := New()
	m.snapshot.State = "ready"
	m.snapshot.StartedAt = 1000
	m.lastSample = time.UnixMilli(1000)
	m.processEvent(42, 1, 1000, true, false, "node.exe", "node server.js")
	m.traffic(42, 1100, 2048, false, false)
	m.traffic(42, 1200, 1024, true, false)
	m.traffic(42, 1300, 512, true, true)
	m.sample(time.UnixMilli(2000))
	first := m.Snapshot()
	if first.DownloadRate != 2048 || first.UploadRate != 1024 || first.LocalUploadBytes != 512 {
		t.Fatalf("incorrect counters: %+v", first.Counters)
	}
	m.processEvent(42, 1, 2100, false, false, "", "")
	m.processEvent(42, 2, 3000, true, false, "browser.exe", "")
	m.traffic(42, 3100, 4096, false, false)
	m.traffic(42, 1400, 256, false, false) // Delayed event from the old process.
	m.sample(time.UnixMilli(4000))
	s := m.Snapshot()
	if len(s.Processes) != 2 || !s.Processes[0].Exited || s.Processes[1].Exited {
		t.Fatalf("process generations were merged: %+v", s.Processes)
	}
	if s.Processes[0].DownloadBytes != 2304 || s.Processes[1].DownloadBytes != 4096 || s.DownloadBytes != 6400 {
		t.Fatalf("traffic was lost or reassigned: %+v", s)
	}
	if s.Processes[0].ID == s.Processes[1].ID {
		t.Fatal("recycled PID inherited an old identity")
	}
	// Snapshots are copies; callers cannot change the backend's accounting.
	s.Processes[0].DownloadBytes = 0
	s.History[0].DownloadRate = 0
	if m.Snapshot().Processes[0].DownloadBytes != 2304 || m.Snapshot().History[0].DownloadRate != 2048 {
		t.Fatal("snapshot aliases monitor state")
	}
	if fresh := New().Snapshot(); fresh.DownloadBytes != 0 || len(fresh.Processes) != 0 || len(fresh.History) != 0 {
		t.Fatal("new session retained traffic")
	}
}

func TestRatesHistoryAndFailureDoNotCreateFalseZeroReadings(t *testing.T) {
	m := New()
	m.snapshot.State, m.snapshot.StartedAt = "ready", 1000
	m.lastSample = time.UnixMilli(1000)
	for i := int64(1); i <= 70; i++ {
		m.traffic(1, 1000+i*1000, 1000, false, false)
		m.sample(time.UnixMilli(1000 + i*1000))
	}
	before := m.Snapshot()
	if len(before.History) != 61 || before.DownloadRate != 1000 {
		t.Fatalf("history or rate incorrect: %+v", before)
	}
	m.fail(errors.New("network.traceStopped"))
	m.sample(time.UnixMilli(100000))
	after := m.Snapshot()
	if after.State != "stale" || after.DownloadBytes != before.DownloadBytes || after.UpdatedAt != before.UpdatedAt || len(after.History) != 61 {
		t.Fatalf("failure changed last good snapshot: %+v", after)
	}
}

func TestMetadataLookupCannotOverwriteReusedPIDOrBlockAccounting(t *testing.T) {
	m := New()
	m.processEvent(10, 0, 1000, true, false, "old.exe", "")
	m.traffic(10, 1100, 100, false, false)
	m.resolve(context.Background(), func(ctx context.Context, infos []process.Info) ([]process.Info, error) {
		m.processEvent(10, 0, 2000, true, false, "new.exe", "")
		m.traffic(10, 2100, 200, false, false)
		return []process.Info{{PID: 10, CreatedAt: 1000, Name: "old.exe", ProjectPath: "old-project"}}, nil
	})
	s := m.Snapshot()
	if len(s.Processes) != 2 || s.Processes[1].ProjectPath != "" || s.Processes[1].Name != "new.exe" || s.DownloadBytes != 300 {
		t.Fatalf("metadata crossed process generations: %+v", s)
	}
	m.resolve(context.Background(), func(context.Context, []process.Info) ([]process.Info, error) {
		return nil, errors.New("rules unavailable")
	})
	if m.Snapshot().AttributionError == "" || m.Snapshot().DownloadBytes != 300 {
		t.Fatal("attribution failure hid counters or its error")
	}
}

func TestShortLivedProcessRetainsCapturedCommandAndAttribution(t *testing.T) {
	m := New()
	m.processEvent(7, 3, 1000, true, false, "node.exe", `node D:\repo\install.js`)
	m.traffic(7, 1100, 500, false, false)
	m.processEvent(7, 3, 1200, false, false, "", "")
	m.resolve(context.Background(), func(ctx context.Context, infos []process.Info) ([]process.Info, error) {
		if len(infos) != 1 || infos[0].CommandLine != `node D:\repo\install.js` {
			t.Fatal("short-lived process metadata lost")
		}
		infos[0].ProjectPath = `D:\repo`
		return infos, nil
	})
	row := m.Snapshot().Processes[0]
	if !row.Exited || row.ProjectPath != `D:\repo` || row.DownloadBytes != 500 {
		t.Fatalf("short-lived process was dropped: %+v", row)
	}
	m.resolve(context.Background(), func(ctx context.Context, infos []process.Info) ([]process.Info, error) {
		t.Fatal("exited processes with confirmed ownership should not be queried again")
		return nil, nil
	})
	if m.Snapshot().Processes[0].ProjectPath != `D:\repo` {
		t.Fatal("exited process lost its confirmed ownership")
	}
}
