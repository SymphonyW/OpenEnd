//go:build windows

package tray

import (
	"os"
	"runtime"
	"sync/atomic"
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

func TestNativeTrayContextMenu(t *testing.T) {
	if os.Getenv("OPENEND_TRAY_SMOKE") != "1" {
		t.Skip("set OPENEND_TRAY_SMOKE=1 in a Windows desktop session")
	}
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	previousDPI, _, _ := user32.NewProc("SetThreadDpiAwarenessContext").Call(^uintptr(3))
	defer user32.NewProc("SetThreadDpiAwarenessContext").Call(previousDPI)
	quit := make(chan struct{}, 1)
	var opens atomic.Int32
	tray, err := Start(func() { opens.Add(1) }, func() { quit <- struct{}{} })
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		postMessage.Call(uintptr(tray.window), 0x001f, 0, 0) // WM_CANCELMODE releases an open popup on failure.
		if err := tray.Close(); err != nil {
			t.Error(err)
		}
	})
	var reply uintptr
	// Explorer's notification callback must return before the modal menu is entered.
	if ok, _, err := user32.NewProc("SendMessageTimeoutW").Call(uintptr(tray.window), wmTray, 0, wmContextMenu|1<<16, 2, 250, uintptr(unsafe.Pointer(&reply))); ok == 0 {
		t.Fatalf("tray callback blocked while opening its menu: %v", err)
	}
	var rect struct{ Left, Top, Right, Bottom int32 }
	itemRect := user32.NewProc("GetMenuItemRect")
	deadline := time.Now().Add(3 * time.Second)
	shown := false
	for time.Now().Before(deadline) {
		if ok, _, _ := itemRect.Call(uintptr(tray.window), uintptr(tray.menu), 1, uintptr(unsafe.Pointer(&rect))); ok != 0 && rect.Right > rect.Left {
			shown = true
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !shown {
		t.Fatal("right-click did not display the native Exit menu item")
	}
	// Click the actual menu item, after verifying the target belongs to this test.
	var original point
	getCursorPos.Call(uintptr(unsafe.Pointer(&original)))
	setCursor := user32.NewProc("SetCursorPos")
	t.Cleanup(func() { setCursor.Call(uintptr(original.X), uintptr(original.Y)) })
	x, y := (rect.Left+rect.Right)/2, (rect.Top+rect.Bottom)/2
	setCursor.Call(uintptr(x), uintptr(y))
	packed := uint64(uint32(x)) | uint64(uint32(y))<<32
	popup, _, _ := user32.NewProc("WindowFromPoint").Call(uintptr(packed))
	var owner uint32
	user32.NewProc("GetWindowThreadProcessId").Call(popup, uintptr(unsafe.Pointer(&owner)))
	if owner != uint32(os.Getpid()) {
		t.Fatal("the displayed menu does not receive input at its item coordinates")
	}
	t.Logf("Exit item bounds=%+v, click=(%d,%d), popup=%#x", rect, x, y, popup)
	type mouseInput struct {
		X, Y              int32
		Data, Flags, Time uint32
		Extra             uintptr
	}
	type input struct {
		Type  uint32
		Mouse mouseInput
	}
	inputs := [2]input{{Mouse: mouseInput{Flags: 2}}, {Mouse: mouseInput{Flags: 4}}}
	if sent, _, err := user32.NewProc("SendInput").Call(2, uintptr(unsafe.Pointer(&inputs[0])), unsafe.Sizeof(inputs[0])); sent != 2 {
		t.Fatalf("click Exit: %v", err)
	}
	select {
	case <-quit:
	case <-time.After(3 * time.Second):
		t.Fatalf("clicking Exit did not reach the callback (Open activations: %d)", opens.Load())
	}
}
