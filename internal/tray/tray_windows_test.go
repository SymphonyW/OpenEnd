//go:build windows

package tray

import (
	"os"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Uses only this test's own hidden window, icon and menu; no user processes are closed.
func TestNativeTraySmoke(t *testing.T) {
	if os.Getenv("OPENEND_TRAY_SMOKE") != "1" {
		t.Skip("set OPENEND_TRAY_SMOKE=1 in a Windows desktop session")
	}
	opened, quit := make(chan struct{}, 4), make(chan struct{}, 2)
	tray, err := Start(func() { opened <- struct{}{} }, func() { quit <- struct{}{} })
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := tray.Close(); err != nil {
			t.Error(err)
		}
	})
	if !tray.Ready() {
		t.Fatal("tray not ready after successful initialization")
	}
	// Verify the native menu exists with both real command IDs.
	getMenuItemID := user32.NewProc("GetMenuItemID")
	for index, expected := range []uintptr{menuOpen, menuQuit} {
		id, _, _ := getMenuItemID.Call(uintptr(tray.menu), uintptr(index))
		if id != expected {
			t.Fatalf("menu item %d: got %d, want %d", index, id, expected)
		}
	}
	send := user32.NewProc("SendMessageW")
	for _, event := range []uintptr{wmLeftUp, wmLeftDouble, ninKeySelect} {
		send.Call(uintptr(tray.window), wmTray, 0, event|1<<16)
		awaitCallback(t, opened)
	}
	send.Call(uintptr(tray.window), wmCommand, menuOpen, 0)
	awaitCallback(t, opened)
	select {
	case <-quit:
		t.Fatal("opening the app requested exit")
	default:
	}
	// Simulate icon loss, then the Explorer restart broadcast; do not restart Explorer.
	notifyIcon.Call(nimDelete, uintptr(unsafe.Pointer(&tray.icon)))
	send.Call(uintptr(tray.window), uintptr(tray.taskbarCreated), 0, 0)
	if !tray.Ready() {
		t.Fatal("tray was not restored after TaskbarCreated")
	}
	var bounds struct{ Left, Top, Right, Bottom int32 }
	identifier := struct {
		Size   uint32
		Window windows.Handle
		ID     uint32
		GUID   windows.GUID
	}{Window: tray.window, ID: 1}
	identifier.Size = uint32(unsafe.Sizeof(identifier))
	result, _, _ := shell32.NewProc("Shell_NotifyIconGetRect").Call(uintptr(unsafe.Pointer(&identifier)), uintptr(unsafe.Pointer(&bounds)))
	if int32(result) < 0 {
		t.Fatalf("restored icon missing from the notification area: HRESULT %#x", uint32(result))
	}
	send.Call(uintptr(tray.window), wmCommand, menuQuit, 0)
	awaitCallback(t, quit)
	if err := tray.Close(); err != nil {
		t.Fatal(err)
	}
	if tray.Ready() {
		t.Fatal("tray still ready after closing")
	}
	if exists, _, _ := user32.NewProc("IsWindow").Call(uintptr(tray.window)); exists != 0 {
		t.Fatal("tray window still exists after closing")
	}
	if err := tray.Close(); err != nil {
		t.Fatalf("closing twice: %v", err)
	}
}

func awaitCallback(t *testing.T, ch <-chan struct{}) {
	t.Helper()
	select {
	case <-ch:
	case <-time.After(3 * time.Second):
		t.Fatal("native tray action did not reach the application callback")
	}
}
