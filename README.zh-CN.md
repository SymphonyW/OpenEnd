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

[下载Windows版本的安装包](https://github.com/SymphonyW/OpenEnd/releases/download/v2.2.2/OpenEnd-v2.2.2-windows-amd64-installer.exe)

[本项目的博客文章](https://symphonyw.github.io/zh-cn/p/openend/)

OpenEnd 是一个面向开发者的 Windows 桌面资源管理工具，用于快速查看本机进程、端口占用和系统资源使用情况。

项目基于 Wails、Go、React、TypeScript 和 Vite 构建。它不是 Windows 任务管理器的完整替代品，而是聚焦于开发场景中的本地诊断：定位端口被哪个进程占用、查看资源消耗、并在确认后安全结束开发相关进程。

## 功能

| 模块 | 能力 |
| --- | --- |
| Dashboard | 查看 CPU、内存、进程、端口和 GPU 相关资源数据 |
| Network | 按应用和项目累计本次运行的上传、下载流量；性能页显示最近 60 秒的网络速度曲线，需管理员权限 |
| Processes | 查看进程、资源占用、可执行文件路径、启动命令和进程详情 |
| Apps & Projects | 在进程页和端口页按应用与项目分组，汇总资源和端口，支持同步手动修正归属 |
| Ports | 查看 TCP/UDP 端口占用，并映射到对应进程 |
| Cleanup | 识别并检查开发相关进程，辅助清理本地开发环境 |
| Safety | 默认保护关键 Windows 系统进程，避免误结束 |
| Logs | 记录进程和清理操作，便于回溯 |
| Settings | 配置应用行为和受保护进程规则 |

归属识别规则、手动修正方式和验证步骤见 [应用与项目](docs/project-grouping.zh-CN.md)。

网络统计只保存在内存中，退出 OpenEnd 后清空。统计范围、权限说明和验证方法见 [网络流量监控](docs/network-monitoring.zh-CN.md)。

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
