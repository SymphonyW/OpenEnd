//go:build windows && production

package main

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"sync/atomic"
	"testing"
	"time"
	"unsafe"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	win "golang.org/x/sys/windows"
)

// Run on a Windows desktop with OPENEND_TRAY_SMOKE=1 and -tags production.
// This opens only a separate test window and drives its real Wails close events.
func TestDesktopTrayLifecycle(t *testing.T) {
	if os.Getenv("OPENEND_TRAY_SMOKE") != "1" {
		t.Skip("set OPENEND_TRAY_SMOKE=1 in a Windows desktop session")
	}
	// Wails' message loop and WebView callbacks must stay on the same OS thread.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	app := NewApp()
	lock := app.singleInstanceLock()
	parentPID := os.Getenv("OPENEND_TRAY_SECOND_INSTANCE")
	if parentPID == "" {
		parentPID = fmt.Sprint(os.Getpid())
	}
	lock.UniqueId += "-test-" + parentPID
	var stopped atomic.Bool
	result := make(chan error, 1)
	err := wails.Run(&options.App{
		Title: "OpenEnd tray integration test", Width: 960, Height: 640, StartHidden: true,
		AssetServer: &assetserver.Options{Assets: assets},
		Windows:     &windows.Options{WindowClassName: "OpenEndTrayIntegrationTest"},
		OnStartup:   func(ctx context.Context) { app.ctx = ctx },
		OnDomReady: func(ctx context.Context) {
			if os.Getenv("OPENEND_TRAY_SECOND_INSTANCE") != "" {
				app.exitRequested.Store(true)
				result <- fmt.Errorf("second instance created a window")
				wailsruntime.Quit(ctx)
				return
			}
			app.startTray(ctx)
			err := checkDesktopTray(ctx, app, &stopped)
			result <- err
			if err != nil {
				app.exitRequested.Store(true)
				wailsruntime.Quit(ctx)
			}
		},
		OnBeforeClose:      app.beforeClose,
		SingleInstanceLock: lock,
		OnShutdown: func(ctx context.Context) {
			stopped.Store(true)
			app.shutdown(ctx)
		},
		Bind: []interface{}{app},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := <-result; err != nil {
		t.Fatal(err)
	}
	if !stopped.Load() || app.systemTray.Load() != nil {
		t.Fatal("explicit exit did not run shutdown and release the tray")
	}
}

func checkDesktopTray(ctx context.Context, app *App, stopped *atomic.Bool) error {
	u32 := win.NewLazySystemDLL("user32.dll")
	find := u32.NewProc("FindWindowW")
	post := u32.NewProc("PostMessageW")
	visible := u32.NewProc("IsWindowVisible")
	minimized := u32.NewProc("IsIconic")
	class, _ := win.UTF16PtrFromString("OpenEndTrayIntegrationTest")
	window, _, _ := find.Call(uintptr(unsafe.Pointer(class)), 0)
	trayClass, _ := win.UTF16PtrFromString(fmt.Sprintf("OpenEndTray-%d-1", os.Getpid()))
	trayWindow, _, _ := find.Call(uintptr(unsafe.Pointer(trayClass)), 0)
	if window == 0 || trayWindow == 0 || app.systemTray.Load() == nil {
		return fmt.Errorf("main window or tray not initialized")
	}
	wait := func(description string, predicate func() bool) error {
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			if predicate() {
				return nil
			}
			time.Sleep(20 * time.Millisecond)
		}
		return fmt.Errorf("timed out waiting for %s", description)
	}
	isVisible := func() bool { value, _, _ := visible.Call(window); return value != 0 }
	// Background test launches may not take keyboard focus. Also accept a window
	// raised above the foreground window, so it is visibly in front of other apps.
	isInFront := func() bool {
		foreground, _, _ := u32.NewProc("GetForegroundWindow").Call()
		current := window
		for count := 0; current != 0 && count < 1024; count++ {
			if current == foreground {
				return true
			}
			current, _, _ = u32.NewProc("GetWindow").Call(current, 2) // GW_HWNDNEXT.
		}
		return false
	}
	wailsruntime.WindowShow(ctx)
	if err := wait("initial window", isVisible); err != nil {
		return err
	}
	post.Call(window, 0x0010, 0, 0) // The actual title-bar close message.
	if err := wait("close hides window", func() bool { return !isVisible() }); err != nil {
		return err
	}
	if stopped.Load() || app.exitRequested.Load() || !app.systemTray.Load().Ready() {
		return fmt.Errorf("window close stopped the application instead of hiding it")
	}
	post.Call(trayWindow, 0x8001, 0, 0x0400|1<<16) // Tray click / NIN_SELECT.
	if err := wait("tray click restores window", isVisible); err != nil {
		return err
	}
	wailsruntime.WindowMinimise(ctx)
	if err := wait("minimized window", func() bool { value, _, _ := minimized.Call(window); return value != 0 }); err != nil {
		return err
	}
	post.Call(trayWindow, 0x8001, 0, 0x0401|1<<16) // Keyboard activation also restores minimised windows.
	if err := wait("restored minimized window", func() bool { value, _, _ := minimized.Call(window); return isVisible() && value == 0 }); err != nil {
		return err
	}
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	for _, state := range []string{"hidden", "minimized", "visible"} {
		switch state {
		case "hidden":
			post.Call(window, 0x0010, 0, 0)
			if err := wait("hidden before relaunch", func() bool { return !isVisible() }); err != nil {
				return err
			}
		case "minimized":
			wailsruntime.WindowMinimise(ctx)
			if err := wait("minimized before relaunch", func() bool { value, _, _ := minimized.Call(window); return value != 0 }); err != nil {
				return err
			}
		}
		launchCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		cmd := exec.CommandContext(launchCtx, executable, "-test.run=^TestDesktopTrayLifecycle$", "-test.timeout=8s")
		cmd.Env = append(os.Environ(), "OPENEND_TRAY_SECOND_INSTANCE="+fmt.Sprint(os.Getpid()))
		output, err := cmd.CombinedOutput()
		cancel()
		if err != nil {
			return fmt.Errorf("relaunch while %s: %w\n%s", state, err, output)
		}
		if err := wait("relaunch restores "+state+" window", func() bool {
			iconic, _, _ := minimized.Call(window)
			return isVisible() && iconic == 0 && isInFront()
		}); err != nil {
			iconic, _, _ := minimized.Call(window)
			foreground, _, _ := u32.NewProc("GetForegroundWindow").Call()
			return fmt.Errorf("%w (visible=%v, minimized=%v, foreground=%#x, window=%#x, child output=%s)", err, isVisible(), iconic != 0, foreground, window, output)
		}
	}
	post.Call(trayWindow, 0x0111, 2, 0) // Explicit Exit menu command.
	return wait("tray exit request", app.exitRequested.Load)
}
