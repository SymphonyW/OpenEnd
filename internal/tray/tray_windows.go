//go:build windows

// Package tray owns the Windows notification icon and its message loop.
package tray

import (
	"fmt"
	"log"
	"os"
	"runtime"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	wmClose       = 0x0010
	wmDestroy     = 0x0002
	wmEndSession  = 0x0016
	wmContextMenu = 0x007b
	wmCommand     = 0x0111
	wmLeftUp      = 0x0202
	wmLeftDouble  = 0x0203
	wmRightUp     = 0x0205
	wmTray        = 0x8001
	wmShowMenu    = 0x8002
	ninSelect     = 0x0400
	ninKeySelect  = 0x0401
	menuOpen      = 1
	menuQuit      = 2
	nimAdd        = 0
	nimDelete     = 2
	nimSetFocus   = 3
	nimSetVersion = 4
)

var (
	user32                = windows.NewLazySystemDLL("user32.dll")
	shell32               = windows.NewLazySystemDLL("shell32.dll")
	kernel32              = windows.NewLazySystemDLL("kernel32.dll")
	registerClass         = user32.NewProc("RegisterClassExW")
	unregisterClass       = user32.NewProc("UnregisterClassW")
	createWindow          = user32.NewProc("CreateWindowExW")
	destroyWindow         = user32.NewProc("DestroyWindow")
	defWindowProc         = user32.NewProc("DefWindowProcW")
	getMessage            = user32.NewProc("GetMessageW")
	translateMessage      = user32.NewProc("TranslateMessage")
	dispatchMessage       = user32.NewProc("DispatchMessageW")
	postMessage           = user32.NewProc("PostMessageW")
	postQuitMessage       = user32.NewProc("PostQuitMessage")
	createPopupMenu       = user32.NewProc("CreatePopupMenu")
	appendMenu            = user32.NewProc("AppendMenuW")
	destroyMenu           = user32.NewProc("DestroyMenu")
	setMenuDefaultItem    = user32.NewProc("SetMenuDefaultItem")
	trackPopupMenu        = user32.NewProc("TrackPopupMenu")
	getCursorPos          = user32.NewProc("GetCursorPos")
	setForegroundWindow   = user32.NewProc("SetForegroundWindow")
	loadIcon              = user32.NewProc("LoadIconW")
	destroyIcon           = user32.NewProc("DestroyIcon")
	registerWindowMessage = user32.NewProc("RegisterWindowMessageW")
	changeMessageFilter   = user32.NewProc("ChangeWindowMessageFilterEx")
	notifyIcon            = shell32.NewProc("Shell_NotifyIconW")
	extractIcon           = shell32.NewProc("ExtractIconExW")
	getModuleHandle       = kernel32.NewProc("GetModuleHandleW")
	getUILanguage         = kernel32.NewProc("GetUserDefaultUILanguage")
	classSequence         atomic.Uint32
)

type windowClass struct {
	Size, Style                   uint32
	Proc                          uintptr
	ClassExtra, WindowExtra       int32
	Instance, Icon, Cursor, Brush windows.Handle
	MenuName, ClassName           *uint16
	SmallIcon                     windows.Handle
}

type point struct{ X, Y int32 }
type message struct {
	Window         windows.Handle
	ID             uint32
	WParam, LParam uintptr
	Time           uint32
	Point          point
	Private        uint32
}

type iconData struct {
	Size                       uint32
	Window                     windows.Handle
	ID, Flags, CallbackMessage uint32
	Icon                       windows.Handle
	Tip                        [128]uint16
	State, StateMask           uint32
	Info                       [256]uint16
	Version                    uint32
	InfoTitle                  [64]uint16
	InfoFlags                  uint32
	GUID                       windows.GUID
	BalloonIcon                windows.Handle
}

type Tray struct {
	window, menu   windows.Handle
	icon           iconData
	ownedIcon      bool
	taskbarCreated uint32
	onOpen, onQuit func()
	ready, closing atomic.Bool
	menuShowing    bool // Only accessed by the native message loop.
	closeOnce      sync.Once
	done           chan struct{}
}

// Start returns only after Windows has accepted the icon and both menu items.
// Callbacks run outside the native message loop so window operations cannot block it.
func Start(onOpen, onQuit func()) (*Tray, error) {
	t := &Tray{onOpen: onOpen, onQuit: onQuit, done: make(chan struct{})}
	started := make(chan error, 1)
	go t.run(started)
	if err := <-started; err != nil {
		<-t.done
		return nil, err
	}
	return t, nil
}

func (t *Tray) Ready() bool { return t.ready.Load() }

func (t *Tray) Close() error {
	t.closeOnce.Do(func() {
		t.closing.Store(true)
		t.ready.Store(false)
		select {
		case <-t.done:
			return
		default:
		}
		postMessage.Call(uintptr(t.window), wmClose, 0, 0)
	})
	select {
	case <-t.done:
		return nil
	case <-time.After(3 * time.Second):
		return fmt.Errorf("timed out stopping the system tray")
	}
}

func (t *Tray) run(started chan<- error) {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	defer close(t.done)
	instance, _, _ := getModuleHandle.Call(0)
	className, _ := windows.UTF16PtrFromString(fmt.Sprintf("OpenEndTray-%d-%d", os.Getpid(), classSequence.Add(1)))
	wc := windowClass{Proc: syscall.NewCallback(t.windowProc), Instance: windows.Handle(instance), ClassName: className}
	wc.Size = uint32(unsafe.Sizeof(wc))
	registered, _, err := registerClass.Call(uintptr(unsafe.Pointer(&wc)))
	if registered == 0 {
		started <- fmt.Errorf("register tray window: %w", err)
		return
	}
	defer unregisterClass.Call(uintptr(unsafe.Pointer(className)), instance)
	defer func() {
		t.ready.Store(false)
		if t.icon.Window != 0 {
			notifyIcon.Call(nimDelete, uintptr(unsafe.Pointer(&t.icon)))
		}
		if t.menu != 0 {
			destroyMenu.Call(uintptr(t.menu))
		}
		if t.window != 0 {
			destroyWindow.Call(uintptr(t.window))
		}
		if t.ownedIcon {
			destroyIcon.Call(uintptr(t.icon.Icon))
		}
	}()
	// A tool window owns the menu without creating another taskbar entry.
	window, _, err := createWindow.Call(0x80, uintptr(unsafe.Pointer(className)), 0, 0x80000000, 0, 0, 0, 0, 0, 0, instance, 0)
	if window == 0 {
		started <- fmt.Errorf("create tray window: %w", err)
		return
	}
	t.window = windows.Handle(window)
	if err := t.initialize(); err != nil {
		started <- err
		return
	}
	started <- nil
	var msg message
	for {
		result, _, err := getMessage.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		if int32(result) <= 0 {
			if int32(result) == -1 {
				log.Printf("OpenEnd tray message loop: %v", err)
			}
			break
		}
		translateMessage.Call(uintptr(unsafe.Pointer(&msg)))
		dispatchMessage.Call(uintptr(unsafe.Pointer(&msg)))
	}
	t.ready.Store(false)
	if !t.closing.Load() {
		go t.onOpen()
	}
}

func (t *Tray) initialize() error {
	taskbarMessage, _ := windows.UTF16PtrFromString("TaskbarCreated")
	id, _, err := registerWindowMessage.Call(uintptr(unsafe.Pointer(taskbarMessage)))
	if id == 0 {
		return fmt.Errorf("register Explorer restart message: %w", err)
	}
	t.taskbarCreated = uint32(id)
	// Permit only tray-related messages from the unelevated shell/accessibility tools.
	for _, message := range []uintptr{id, wmTray, wmCommand, wmContextMenu} {
		if ok, _, err := changeMessageFilter.Call(uintptr(t.window), message, 1, 0); ok == 0 {
			return fmt.Errorf("allow system tray message: %w", err)
		}
	}
	t.icon = iconData{Window: t.window, ID: 1, Flags: 1 | 2 | 4 | 0x80, CallbackMessage: wmTray} // MESSAGE | ICON | TIP | SHOWTIP
	t.icon.Size = uint32(unsafe.Sizeof(t.icon))
	copy(t.icon.Tip[:], syscall.StringToUTF16("OpenEnd"))
	if executable, err := os.Executable(); err == nil {
		path, _ := windows.UTF16PtrFromString(executable)
		extractIcon.Call(uintptr(unsafe.Pointer(path)), 0, 0, uintptr(unsafe.Pointer(&t.icon.Icon)), 1)
		t.ownedIcon = t.icon.Icon != 0
	}
	if t.icon.Icon == 0 {
		icon, _, err := loadIcon.Call(0, 32512) // Shared default icon for go test / development builds.
		if icon == 0 {
			return fmt.Errorf("load tray icon: %w", err)
		}
		t.icon.Icon = windows.Handle(icon)
	}
	menu, _, err := createPopupMenu.Call()
	if menu == 0 {
		return fmt.Errorf("create tray menu: %w", err)
	}
	t.menu = windows.Handle(menu)
	openLabel, quitLabel := "Open OpenEnd", "Exit"
	if language, _, _ := getUILanguage.Call(); language&0x3ff == 0x04 {
		openLabel, quitLabel = "打开 OpenEnd", "退出"
	}
	for _, item := range []struct {
		id    uintptr
		label string
	}{{menuOpen, openLabel}, {menuQuit, quitLabel}} {
		label, _ := windows.UTF16PtrFromString(item.label)
		ok, _, err := appendMenu.Call(menu, 0, item.id, uintptr(unsafe.Pointer(label)))
		if ok == 0 {
			return fmt.Errorf("add tray menu item: %w", err)
		}
	}
	setMenuDefaultItem.Call(menu, menuOpen, 0)
	return t.addIcon()
}

func (t *Tray) addIcon() error {
	ok, _, err := notifyIcon.Call(nimAdd, uintptr(unsafe.Pointer(&t.icon)))
	if ok == 0 {
		return fmt.Errorf("add system tray icon: %w", err)
	}
	t.icon.Version = 4
	notifyIcon.Call(nimSetVersion, uintptr(unsafe.Pointer(&t.icon)))
	t.ready.Store(true)
	return nil
}

func (t *Tray) windowProc(window uintptr, msg uint32, wParam, lParam uintptr) uintptr {
	switch msg {
	case wmClose:
		postQuitMessage.Call(0)
		return 0
	case wmDestroy:
		return 0
	case wmEndSession:
		if wParam != 0 {
			t.ready.Store(false)
			go t.onQuit()
		}
		return 0
	case wmCommand:
		t.selectMenu(wParam & 0xffff)
		return 0
	case wmContextMenu:
		postMessage.Call(window, wmShowMenu, 0, 0)
		return 0
	case wmShowMenu:
		if !t.menuShowing {
			t.showMenu()
		}
		return 0
	case wmTray:
		switch lParam & 0xffff {
		case wmLeftUp, wmLeftDouble, ninSelect, ninKeySelect:
			go t.onOpen()
		case wmRightUp, wmContextMenu:
			// Release Explorer's callback before entering the modal menu loop.
			postMessage.Call(window, wmShowMenu, 0, 0)
		}
		return 0
	}
	if t.taskbarCreated != 0 && msg == t.taskbarCreated {
		t.ready.Store(false)
		if err := t.addIcon(); err != nil {
			log.Printf("OpenEnd tray after Explorer restart: %v", err)
			go t.onOpen()
		}
		return 0
	}
	result, _, _ := defWindowProc.Call(window, uintptr(msg), wParam, lParam)
	return result
}

func (t *Tray) selectMenu(id uintptr) {
	switch id {
	case menuOpen:
		go t.onOpen()
	case menuQuit:
		go t.onQuit()
	}
}

func (t *Tray) showMenu() {
	t.menuShowing = true
	defer func() { t.menuShowing = false }()
	var cursor point
	if ok, _, _ := getCursorPos.Call(uintptr(unsafe.Pointer(&cursor))); ok == 0 {
		return
	}
	setForegroundWindow.Call(uintptr(t.window))
	// Return the selected command; callbacks must not block this message loop.
	id, _, _ := trackPopupMenu.Call(uintptr(t.menu), 0x100|0x80|0x02, uintptr(cursor.X), uintptr(cursor.Y), 0, uintptr(t.window), 0)
	postMessage.Call(uintptr(t.window), 0, 0, 0)
	notifyIcon.Call(nimSetFocus, uintptr(unsafe.Pointer(&t.icon)))
	t.selectMenu(id)
}
