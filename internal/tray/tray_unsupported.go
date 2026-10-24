//go:build !windows

package tray

import "errors"

type Tray struct{}

func Start(onOpen, onQuit func()) (*Tray, error) { return nil, errors.ErrUnsupported }
func (*Tray) Ready() bool                        { return false }
func (*Tray) Close() error                       { return nil }
