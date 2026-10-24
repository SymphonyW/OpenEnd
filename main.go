package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "OpenEnd",
		Width:     1400,
		Height:    900,
		MinWidth:  960,
		MinHeight: 640,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 1},
		Windows: &windows.Options{
			Theme: windows.Light,
			CustomTheme: &windows.ThemeSettings{
				LightModeTitleBar:          windows.RGB(255, 255, 255),
				LightModeTitleBarInactive:  windows.RGB(255, 255, 255),
				LightModeTitleText:         windows.RGB(32, 32, 32),
				LightModeTitleTextInactive: windows.RGB(98, 98, 98),
				LightModeBorder:            windows.RGB(231, 231, 231),
				LightModeBorderInactive:    windows.RGB(231, 231, 231),
			},
		},
		OnStartup:          app.startup,
		OnDomReady:         app.startTray,
		OnBeforeClose:      app.beforeClose,
		OnShutdown:         app.shutdown,
		SingleInstanceLock: app.singleInstanceLock(),
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
