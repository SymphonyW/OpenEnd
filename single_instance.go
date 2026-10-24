package main

import (
	"github.com/wailsapp/wails/v2/pkg/options"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) singleInstanceLock() *options.SingleInstanceLock {
	return &options.SingleInstanceLock{
		// Keep this ID stable across versions and installation locations.
		UniqueId: "97d8d27c-4de1-47c7-baf8-f4a3588e81e3",
		OnSecondInstanceLaunch: func(_ options.SecondInstanceData) {
			if a.ctx != nil && !a.exitRequested.Load() {
				if wailsruntime.WindowIsMinimised(a.ctx) {
					wailsruntime.WindowUnminimise(a.ctx)
				}
				wailsruntime.Show(a.ctx)
			}
		},
	}
}
