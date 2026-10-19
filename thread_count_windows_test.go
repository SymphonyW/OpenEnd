//go:build windows

package main

import (
	"os/exec"
	"testing"
	"time"
)

func TestCollectThreadCountDuringProcessChurn(t *testing.T) {
	finished := make(chan error, 1)
	go func() {
		for i := 0; i < 10; i++ {
			if err := exec.Command("cmd.exe", "/d", "/c", "exit 0").Run(); err != nil {
				finished <- err
				return
			}
		}
		finished <- nil
	}()
	defer func() {
		if err := <-finished; err != nil {
			t.Errorf("create short-lived processes: %v", err)
		}
	}()

	start := time.Now()
	for i := 0; i < 10; i++ {
		count, err := collectThreadCount()
		if err != nil || count <= 0 {
			t.Fatalf("sample %d: thread count = %d, error = %v", i, count, err)
		}
		t.Logf("sample %d: %d threads", i, count)
	}
	t.Logf("10 samples collected in %s", time.Since(start))
}
