// Package network keeps per-process traffic for the current OpenEnd session only.
package network

import (
	"context"
	"sort"
	"sync"
	"time"

	"openend/internal/process"
)

type Counters struct {
	DownloadBytes      uint64  `json:"downloadBytes"`
	UploadBytes        uint64  `json:"uploadBytes"`
	LocalDownloadBytes uint64  `json:"localDownloadBytes"`
	LocalUploadBytes   uint64  `json:"localUploadBytes"`
	DownloadRate       float64 `json:"downloadRate"`
	UploadRate         float64 `json:"uploadRate"`
}

func (c Counters) hasTraffic() bool {
	return c.DownloadBytes > 0 || c.UploadBytes > 0 || c.LocalDownloadBytes > 0 || c.LocalUploadBytes > 0
}

type Row struct {
	process.Info
	Counters
	ID     uint64 `json:"id"`
	Exited bool   `json:"exited"`
}

type Sample struct {
	Time         int64   `json:"time"`
	DownloadRate float64 `json:"downloadRate"`
	UploadRate   float64 `json:"uploadRate"`
}

type Snapshot struct {
	Counters
	State            string   `json:"state"`
	Error            string   `json:"error"`
	StartedAt        int64    `json:"startedAt"`
	UpdatedAt        int64    `json:"updatedAt"`
	EventsLost       uint32   `json:"eventsLost"`
	BuffersLost      uint32   `json:"buffersLost"`
	UnparsedEvents   uint32   `json:"unparsedEvents"`
	AttributionError string   `json:"attributionError"`
	Processes        []Row    `json:"processes"`
	History          []Sample `json:"history"`
}

type entry struct {
	Row
	start      int64
	observedAt int64
	end        int64
	previous   Counters
}

type Monitor struct {
	mu         sync.Mutex
	entries    []*entry
	current    map[int32]*entry
	nextID     uint64
	snapshot   Snapshot
	lastSample time.Time
	previous   Counters
	cancel     context.CancelFunc
	stopTrace  func()
	done       chan struct{}
	closeOnce  sync.Once
}

func New() *Monitor {
	return &Monitor{current: make(map[int32]*entry), snapshot: Snapshot{State: "collecting", Processes: []Row{}, History: []Sample{}}}
}

// Start must be called once at application startup, independently of UI polling.
func (m *Monitor) Start(ctx context.Context, resolve func(context.Context, []process.Info) ([]process.Info, error)) {
	ctx, m.cancel = context.WithCancel(ctx)
	m.done = make(chan struct{})
	stop, err := startTrace(m)
	if err != nil {
		m.fail(err)
		close(m.done)
		return
	}
	m.stopTrace = stop
	m.mu.Lock()
	if m.snapshot.State == "collecting" {
		m.snapshot.State = "ready"
	}
	m.lastSample = time.Now()
	m.snapshot.StartedAt = m.lastSample.UnixMilli()
	m.mu.Unlock()
	go func() {
		defer close(m.done)
		var worker sync.WaitGroup
		worker.Add(1)
		go func() {
			defer worker.Done()
			ticker := time.NewTicker(2 * time.Second)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					m.resolve(ctx, resolve)
				}
			}
		}()
		defer worker.Wait()
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				m.sample(time.Now())
			}
		}
	}()
}

func (m *Monitor) Close() {
	m.closeOnce.Do(func() {
		if m.cancel != nil {
			m.cancel()
		}
		if m.stopTrace != nil {
			m.stopTrace()
		}
		if m.done != nil {
			<-m.done
		}
	})
}

func (m *Monitor) Snapshot() Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	s := m.summary()
	for _, e := range m.entries {
		if e.Counters.hasTraffic() {
			s.Processes = append(s.Processes, e.Row)
		}
	}
	sort.Slice(s.Processes, func(i, j int) bool { return s.Processes[i].ID < s.Processes[j].ID })
	return s
}

// Summary avoids copying session-long process metadata for the performance charts.
func (m *Monitor) Summary() Snapshot {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.summary()
}

// Caller holds mu. The history copy keeps frontend callers from changing samples.
func (m *Monitor) summary() Snapshot {
	s := m.snapshot
	s.Processes = []Row{}
	s.History = append([]Sample{}, s.History...)
	return s
}

func (m *Monitor) fail(err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.snapshot.StartedAt > 0 {
		m.snapshot.State = "stale"
	} else {
		m.snapshot.State = "unavailable"
	}
	m.snapshot.Error = err.Error()
}

func (m *Monitor) processEvent(pid, parent int32, at int64, start, rundown bool, name, command string) {
	if pid <= 0 {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	e := m.current[pid]
	if e != nil && !rundown && at < e.start {
		return
	}
	if !start {
		if e != nil && at >= e.start {
			e.Exited = true
			e.end = at
		}
		return
	}
	if e == nil || (!rundown && (e.start != at || e.Exited)) {
		if e != nil {
			e.Exited = true
			e.end = at
		}
		e = m.newEntry(pid, at)
		if rundown {
			e.start = 0
			e.CreatedAt = 0
		}
	}
	e.ParentPID = parent
	if name != "" {
		e.Name = name
	}
	if command != "" {
		e.CommandLine = command
	}
}

// Caller holds mu. IDs remain unique even when Windows recycles a PID.
func (m *Monitor) newEntry(pid int32, at int64) *entry {
	m.nextID++
	e := &entry{Row: Row{Info: process.Info{PID: pid, CreatedAt: at}, ID: m.nextID}, start: at, observedAt: at}
	m.entries = append(m.entries, e)
	m.current[pid] = e
	return e
}

func (m *Monitor) traffic(pid int32, at int64, bytes uint32, upload, local bool) {
	if bytes == 0 {
		return
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	e := m.current[pid]
	if e != nil && ((e.start > 0 && at < e.start) || (e.end > 0 && at > e.end)) {
		e = nil
		for i := len(m.entries) - 1; i >= 0; i-- {
			candidate := m.entries[i]
			if candidate.PID == pid && at >= candidate.start && (candidate.end == 0 || at <= candidate.end) {
				e = candidate
				break
			}
		}
	}
	if e == nil {
		// Do not attach unverified/late events to another generation of the PID.
		previous := m.current[pid]
		e = m.newEntry(pid, at)
		if previous != nil && at < previous.start {
			e.Exited = true
			e.end = at
			m.current[pid] = previous
		}
	}
	add := func(c *Counters) {
		switch {
		case local && upload:
			c.LocalUploadBytes += uint64(bytes)
		case local:
			c.LocalDownloadBytes += uint64(bytes)
		case upload:
			c.UploadBytes += uint64(bytes)
		default:
			c.DownloadBytes += uint64(bytes)
		}
	}
	add(&e.Counters)
	add(&m.snapshot.Counters)
}

func (m *Monitor) sample(now time.Time) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pruneIdleProcesses(now.UnixMilli())
	if m.snapshot.State != "ready" {
		return
	}
	elapsed := now.Sub(m.lastSample).Seconds()
	if elapsed <= 0 {
		return
	}
	update := func(c *Counters, previous *Counters) {
		c.DownloadRate = float64(c.DownloadBytes-previous.DownloadBytes) / elapsed
		c.UploadRate = float64(c.UploadBytes-previous.UploadBytes) / elapsed
		*previous = *c
	}
	update(&m.snapshot.Counters, &m.previous)
	for _, e := range m.entries {
		update(&e.Counters, &e.previous)
	}
	m.lastSample = now
	m.snapshot.UpdatedAt = now.UnixMilli()
	m.snapshot.History = append(m.snapshot.History, Sample{now.UnixMilli(), m.snapshot.DownloadRate, m.snapshot.UploadRate})
	if len(m.snapshot.History) > 61 {
		m.snapshot.History = m.snapshot.History[len(m.snapshot.History)-61:]
	}
}

// Caller holds mu. Keep a minute for out-of-order ETW events, and retain parents
// needed for ownership lookup. Processes with traffic remain for the whole session.
func (m *Monitor) pruneIdleProcesses(now int64) {
	cutoff := now - time.Minute.Milliseconds()
	removable := func(e *entry) bool {
		return e.Exited && e.end > 0 && e.end < cutoff && !e.Counters.hasTraffic()
	}
	var hasExpired bool
	for _, e := range m.entries {
		if removable(e) {
			hasExpired = true
			break
		}
	}
	if !hasExpired {
		return
	}
	parents := make(map[*entry]bool)
	for _, e := range m.entries {
		if removable(e) {
			continue
		}
		for parent := m.current[e.ParentPID]; parent != nil && !parents[parent]; parent = m.current[parent.ParentPID] {
			parents[parent] = true
		}
	}
	kept := m.entries[:0]
	removedCurrent := 0
	for _, e := range m.entries {
		if removable(e) && !parents[e] {
			if m.current[e.PID] == e {
				delete(m.current, e.PID)
				removedCurrent++
			}
			continue
		}
		kept = append(kept, e)
	}
	clear(m.entries[len(kept):])
	m.entries = kept
	if len(kept)*2 < cap(kept) {
		m.entries = append([]*entry(nil), kept...)
	}
	if removedCurrent > len(m.current) {
		current := make(map[int32]*entry, len(m.current))
		for pid, e := range m.current {
			current[pid] = e
		}
		m.current = current
	}
}

func (m *Monitor) resolve(ctx context.Context, resolve func(context.Context, []process.Info) ([]process.Info, error)) {
	if resolve == nil {
		return
	}
	m.mu.Lock()
	infos := make([]process.Info, 0, len(m.current))
	ids := make(map[int32]uint64, len(m.current))
	wanted := make(map[int32]bool)
	var include func(int32)
	include = func(pid int32) {
		if wanted[pid] {
			return
		}
		e := m.current[pid]
		if e == nil {
			return
		}
		wanted[pid] = true
		info := e.Info
		if info.CreatedAt == 0 {
			info.CreatedAt = e.observedAt
		}
		infos = append(infos, info)
		ids[pid] = e.ID
		include(e.ParentPID)
	}
	for pid, e := range m.current {
		if e.Counters.hasTraffic() && !(e.Exited && (e.ProjectPath != "" || e.ApplicationPath != "")) {
			include(pid)
		}
	}
	m.mu.Unlock()
	if len(infos) == 0 {
		return
	}
	resolved, err := resolve(ctx, infos)
	m.mu.Lock()
	defer m.mu.Unlock()
	if err != nil {
		m.snapshot.AttributionError = err.Error()
		return
	}
	m.snapshot.AttributionError = ""
	for _, info := range resolved {
		e := m.current[info.PID]
		if e == nil || e.ID != ids[info.PID] {
			continue
		}
		// Keep an exited process's confirmed ownership even if its directory
		// disappears later in this session. Unknown ownership may still resolve.
		if e.Exited && (e.ProjectPath != "" || e.ApplicationPath != "") {
			continue
		}
		// A process may exit and its PID may be reused during metadata lookup.
		if e.end > 0 && info.CreatedAt > e.end {
			continue
		}
		if e.observedAt > 0 && info.CreatedAt > e.observedAt+10 {
			continue
		}
		e.Info = info
	}
}
