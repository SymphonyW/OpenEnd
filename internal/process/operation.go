package process

// OperationResult is returned by process management actions.
type OperationResult struct {
	Partial     bool   `json:"partial"`
	Code        string `json:"code"`
	Success     bool   `json:"success"`
	Message     string `json:"message"`
	PID         int    `json:"pid"`
	ProcessName string `json:"processName"`
}

func IdentityChanged(pid int) OperationResult {
	return OperationResult{PID: pid, Code: "identity_changed", Message: "The process identity or port owner changed, or its creation time could not be verified. Refresh the list and confirm the current process again."}
}
