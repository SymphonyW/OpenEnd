# 网络流量监控

网络页回答“本次打开 OpenEnd 后，哪个应用或项目用了多少流量”。性能页的“网络”选项显示最近 60 秒的下载、上传速度，两条曲线共用自动调整的刻度，支持鼠标查看和方向键查看采样值。

Windows 正式版启动时会自动请求管理员权限。双击程序或桌面快捷方式后，在系统授权提示中确认即可，无需再右键选择“以管理员身份运行”；取消授权时程序不会启动。开发时请从管理员终端运行 `wails dev`；未取得权限的开发运行会显示网络监控需要管理员权限的提示。统计从系统采集成功启动时开始，不能追溯启动前的流量。

| 行为 | 结果 |
| --- | --- |
| 切换页面或最小化窗口 | 后端继续采集，返回时读取最新累计值和曲线历史 |
| 点击窗口右上角的 × | 隐藏到系统托盘，后端继续采集；点击托盘图标恢复窗口 |
| 从托盘菜单选择“退出” | 停止采集并清空本次运行的累计流量 |
| 被监控进程退出 | 本次用量保留，展开分组后显示“已退出” |
| Windows 重新使用同一个进程编号 | 新建进程身份，不继承原进程的累计值 |
| 退出并重新启动 OpenEnd | 从零开始统计 |
| 缺少权限、采集停止或界面读取失败 | 明确显示状态，已有数据不会被有效的零值替代 |
| 系统丢失事件或事件格式无法识别 | 提示累计数据不完整 |

网络页按已有的应用和项目规则归类，项目以完整目录区分，应用以主程序路径区分。可搜索应用、项目、进程名或进程编号，按累计下载、累计上传、合计或当前传输速度排序，并展开分组查看进程。没有足够证据的流量保留在“未识别归属”。

默认统计 TCP、UDP 的网络收发，包含局域网。`localhost`（IPv4 回环地址、IPv6 回环地址和映射的 IPv4 回环地址）的通信在网络页单独查看，不计入性能页的网络曲线。本机通信页只展示累计值。这里统计系统上报的收发字节，不是运营商计费数据；不会额外把连接、断开和 TCP 重传事件重复加到收发量中。

代理、VPN、Docker、WSL 等可能通过共享进程或虚拟网络转发流量。统计以 Windows 可见的进程为依据，不承诺将共享流量进一步拆到容器、网页或具体请求。应用汇总之和也不等于物理网卡的唯一上网流量：转发可能同时出现在原应用和代理进程上。

统计计数、退出进程记录和最近 61 个速度采样仅保存在 Go 后端内存中，不写入 SQLite，不生成 ETL 流量文件。归属判断仍读取现有的 SQLite 配置规则。正常退出时会停止本次 ETW 会话；强制结束造成的 OpenEnd 遗留会话会在下一次启动时核对拥有者并清理，不停止其他工具的会话。

相关代码为 `internal/network`（Windows 原生 ETW 与会话统计）、`network.go`（归属判断及界面接口）、`NetworkPage.tsx`（累计列表）、`NetworkChart.tsx`（性能图表）。普通自动测试不要求管理员权限，真实采集测试需手动在管理员终端开启。

运行自动检查：

```powershell
go test ./...
npm --prefix frontend test
npm --prefix frontend run build
```

在管理员 PowerShell 中验证真实 TCP、UDP 回环收发和进程归属：

```powershell
$env:OPENEND_NETWORK_SMOKE = "1"
try {
    go test ./internal/network -run TestNativeNetworkSmoke -count=1 -v
} finally {
    Remove-Item Env:OPENEND_NETWORK_SMOKE
}
```

双击构建后的 `build/bin/openend.exe` 或安装后的快捷方式，确认系统自动弹出管理员授权提示；允许后程序启动，取消后程序不启动。开发时从管理员终端运行 `wails dev`。打开浏览器、运行两个不同目录的项目并安装依赖，检查网络页能否区分归属、依赖安装结束后累计值是否保留，切换页面后性能图表是否保留最近一分钟的数据。最后退出并重启 OpenEnd，确认累计值归零。没有取得权限的开发运行应显示权限提示，不能把采集失败显示成零流量。

系统接口依据：[网络事件](https://learn.microsoft.com/en-us/windows/win32/etw/tcpip)、[UDP 事件](https://learn.microsoft.com/en-us/windows/win32/etw/udpip)、[系统跟踪会话](https://learn.microsoft.com/en-us/windows/win32/etw/configuring-and-starting-a-systemtraceprovider-session)、[会话与实时消费模式](https://learn.microsoft.com/en-us/windows/win32/etw/logging-mode-constants)。
