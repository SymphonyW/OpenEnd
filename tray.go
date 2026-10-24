package main

import (
	"context"
	"errors"
	"fmt"

	"openend/internal/tray"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) startTray(ctx context.Context) {
	a.trayOnce.Do(func() { a.initializeTray(ctx) })
}

func (a *App) initializeTray(ctx context.Context) {
	if a.exitRequested.Load() {
		return
	}
	t, err := tray.Start(func() {
		if a.exitRequested.Load() {
			return
		}
		wailsruntime.WindowShow(ctx)
	}, func() {
		if !a.exitRequested.Swap(true) {
			wailsruntime.Quit(ctx)
		}
	})
	if err != nil {
		if !a.exitRequested.Load() && !errors.Is(err, errors.ErrUnsupported) {
			wailsruntime.LogError(ctx, fmt.Sprintf("System tray unavailable: %v", err))
			_, _ = wailsruntime.MessageDialog(ctx, wailsruntime.MessageDialogOptions{
				Type: wailsruntime.WarningDialog, Title: "OpenEnd",
				Message: "System tray unavailable. Closing the window will exit OpenEnd.\n系统托盘不可用，关闭窗口将退出 OpenEnd。\n\n" + err.Error(),
			})
		}
		return
	}
	a.systemTray.Store(t)
	// A close during tray initialization must not leave a late icon behind.
	if a.exitRequested.Load() {
		a.stopTray(ctx)
	}
}

func (a *App) beforeClose(ctx context.Context) bool {
	t := a.systemTray.Load()
	if a.exitRequested.Load() || t == nil || !t.Ready() {
		a.exitRequested.Store(true)
		return false
	}
	wailsruntime.WindowHide(ctx)
	return true
}

func (a *App) stopTray(ctx context.Context) {
	a.exitRequested.Store(true)
	if t := a.systemTray.Swap(nil); t != nil {
		if err := t.Close(); err != nil {
			wailsruntime.LogError(ctx, err.Error())
		}
	}
}
