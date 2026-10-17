package port

const (
	ProtocolTCP = "TCP"
	ProtocolUDP = "UDP"
)

// Info is the port occupancy row returned to the Wails frontend.
type Info struct {
	CreatedAt   int64  `json:"createdAt"`
	Port        int    `json:"port"`
	Protocol    string `json:"protocol"`
	Status      string `json:"status"`
	PID         int32  `json:"pid"`
	ProcessName string `json:"processName"`
	ProcessPath string `json:"processPath"`
	IsProtected bool   `json:"isProtected"`
}
