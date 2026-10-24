//go:build !windows || (!amd64 && !arm64)

package network

import "fmt"

func startTrace(m *Monitor) (func(), error) {
	return nil, fmt.Errorf("network.unsupported")
}
