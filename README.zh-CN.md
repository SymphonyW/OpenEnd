<p align="center">
  <img src="build/appicon.png" width="128" alt="OpenEnd 图标" />
</p>

<p align="center">
  <a href="https://github.com/SymphonyW/OpenEnd/releases"><img alt="Release" src="https://img.shields.io/github/v/release/SymphonyW/OpenEnd?style=for-the-badge&label=Release" /></a>
  <img alt="Platform" src="https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge" />
  <img alt="Wails" src="https://img.shields.io/badge/Wails-v2.12.0-DF0000?style=for-the-badge" />
  <img alt="Go" src="https://img.shields.io/badge/Go-1.24+-00ADD8?style=for-the-badge&logo=go&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=20232A" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-4.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="Unsigned installer" src="https://img.shields.io/badge/Installer-Unsigned-F59E0B?style=for-the-badge" />
</p>

<p align="center">
  <a href="README.md">English</a> | 简体中文
</p>

# OpenEnd

[下载Windows版本的安装包](https://github.com/SymphonyW/OpenEnd/releases/download/v2.3.1/OpenEnd-v2.3.1-windows-amd64-installer.exe)

[本项目的博客文章](https://symphonyw.github.io/zh-cn/p/openend/)

OpenEnd 是一个面向开发者的 Windows 桌面资源管理工具，用于快速查看本机进程、端口占用、系统资源，以及各应用和项目的网络流量。

项目基于 Wails、Go、React、TypeScript 和 Vite 构建。它不是 Windows 任务管理器的完整替代品，而是聚焦于开发场景中的本地诊断：定位端口被哪个进程占用、查看资源消耗、并在确认后安全结束开发相关进程。

![OpenEnd 性能页面，展示 CPU 使用率曲线、资源切换列表和系统统计数据](docs/images/performance.png)

## 功能

| 模块 | 能力 |
| --- | --- |
| 性能 | 查看 CPU、内存、GPU、显存使用情况和系统统计，支持最近 60 秒的网络速度曲线 |
| 网络 | 按应用和项目查看本次运行的累计流量、当前速度、收发占比图和前五项流量排行，支持搜索与流量范围筛选 |
| 进程 | 按名称或 PID 搜索，按 CPU 或内存排序，查看进程图标、端口、程序路径、启动命令和详情 |
| 应用与项目 | 将进程、端口和流量按应用或开发项目分组，展开查看成员，支持手动修正归属 |
| 端口 | 按端口号、进程名称、协议和连接状态筛选 TCP/UDP 端口，查看占用进程 |
| 清理 | 识别并检查开发相关进程，辅助清理本地开发环境 |
| 安全保护 | 默认保护关键 Windows 系统进程，结束进程或端口占用前需要确认 |
| 操作日志 | 记录进程和清理操作，便于回溯 |
| 设置 | 配置应用行为和受保护进程规则 |

点击窗口右上角的 **×** 会将 OpenEnd 隐藏到 Windows 系统托盘，网络监控继续运行。点击托盘图标可恢复窗口，右键选择“退出”才会结束程序并清空本次流量统计。托盘菜单根据 Windows 显示语言使用中文或英文。

OpenEnd 同时只运行一个实例。再次通过快捷方式、可执行文件或命令行启动时，会恢复并唤起已运行的窗口，包括隐藏到托盘或最小化的窗口。

归属识别规则、手动修正方式和验证步骤见 [应用与项目](docs/project-grouping.zh-CN.md)。

网络统计只保存在内存中，退出 OpenEnd 后清空。统计范围、权限说明和验证方法见 [网络流量监控](docs/network-monitoring.zh-CN.md)。

Windows 正式版启动时会自动请求管理员权限，在系统授权提示中确认后即可运行，无需再右键选择“以管理员身份运行”。取消授权时程序不会启动。

## 界面预览

**网络流量统计**

通过收发占比图和流量排行查看哪些应用或项目使用了较多流量，展开分组可查看具体进程。浅蓝色表示下载，浅绿色表示上传，右上角显示统计时间区间。

![网络页面，展示收发占比图、应用与项目流量排行，以及可展开的进程流量明细](docs/images/network.png)

<details>
<summary>进程列表</summary>

按进程名称或 PID 搜索，并按内存或 CPU 使用量排序。列表展示进程图标、资源占用、端口、所属应用或项目，以及程序路径和启动命令。

![进程列表，展示名称与 PID 筛选、内存排序、进程图标、资源占用和应用归属](docs/images/processes.png)

</details>

<details>
<summary>端口列表</summary>

按端口号、进程名称、协议或连接状态筛选，快速找到占用 TCP/UDP 端口的进程。

![端口列表，展示端口号、进程、协议和状态筛选，以及对应的占用进程](docs/images/ports.png)

</details>

<details>
<summary>应用与项目分组</summary>

按应用或项目汇总进程数量、内存占用和监听端口、UDP 端口。展开分组可查看具体端口，点击“View processes”可跳转到对应进程。

![按应用与项目分组的端口页面，展示应用图标、资源汇总、监听端口和已展开的项目](docs/images/apps-projects.png)

</details>

<details>
<summary>按端口查找与结束占用确认</summary>

例如，输入端口 `1313` 可以定位到 `hugo.exe`。结束占用前，确认窗口会展示进程创建时间、协议、PID 和程序路径，方便核对。

![搜索端口 1313 后的 hugo.exe 详情，以及结束端口占用前的确认窗口](docs/images/search-by-port.png)

</details>

## 下载

Windows 构建产物通过 GitHub Actions 生成，并以未签名安装包形式发布。

最新版本下载地址：

```text
https://github.com/SymphonyW/OpenEnd/releases
```

当前 Windows 安装包尚未接入代码签名。安装时 Windows 可能显示 SmartScreen 或“未知发布者”提示。请只从官方 GitHub Releases 页面或可信 CI artifact 下载。

## 开发

环境要求：

| 工具 | 版本 |
| --- | --- |
| Windows | 10/11 |
| Go | 1.24 或更新 |
| Node.js / npm | 推荐 Node 22.x |
| Wails CLI | v2.12.0 |

安装 Wails CLI：

```powershell
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
```

安装前端依赖：

```powershell
npm --prefix frontend install
```

启动带热重载的桌面应用：

```powershell
wails dev
```

## 构建

构建 Windows 可执行文件：

```powershell
.\scripts\build-windows.ps1
```

构建未签名 Windows 安装包：

```powershell
.\scripts\package-windows.ps1
```

构建产物输出到：

```text
build/bin/
```

完整 Windows 发布流程见 [docs/release-windows.md](docs/release-windows.md)。

## 验证

发布前建议执行：

```powershell
go test ./...
npm --prefix frontend run build
.\scripts\package-windows.ps1
```

然后在干净的 Windows 环境验证安装包：

```text
安装 -> 启动 -> 检查主要页面 -> 卸载 -> 确认快捷方式和安装文件被移除
```

## 发布

该仓库包含一个 GitHub Actions 工作流程，会在推送到 `main` 时运行，也可以手动启动：

```text
Windows Release Build
```

该 workflow 会安装 Go、Node.js、Wails 和 NSIS，构建 Windows 安装包，并上传未签名 Windows artifact。

真实证书、token、密码和私钥不得写入仓库。代码签名预留步骤见 [docs/release-windows.md](docs/release-windows.md)。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 桌面框架 | Wails |
| 后端 | Go |
| 前端 | React、TypeScript、Vite |
| 打包 | Wails Windows build、NSIS |
| CI | GitHub Actions |
