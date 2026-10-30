# AGENT.md

## 项目定位

本项目是一个面向开发者的桌面端本地资源管理工具，名称为 **OpenEnd**。

核心目标：帮助开发者快速查看本机进程、端口和资源占用，并安全结束无用的开发残留进程，不需要花里胡哨的界面。

本项目不是 Windows 任务管理器的完整替代品，而是专注解决以下问题：

* 哪个进程占用了某个端口
* 哪个服务还在后台运行
* 哪些进程占用了较多内存或 CPU
* 如何安全结束 Node、Python、Go、Java、Docker、WSL 等开发相关进程

## 技术栈

* 桌面框架：Wails
* 后端：Go
* 前端：React + TypeScript + Vite
* 数据库：SQLite
* 图表：ECharts 或 Recharts

不要使用 Electron。

不要使用 Vue。

不要做成 Web 后台管理系统。

## MVP 功能

第一阶段只做以下功能：

1. 系统资源总览

   * CPU 使用率
   * 内存总量
   * 已用内存
   * 可用内存
   * 进程数量
   * 端口占用数量

2. 进程管理

   * 显示 PID
   * 显示进程名
   * 显示进程路径
   * 显示启动命令
   * 显示 CPU 和内存占用
   * 支持按 PID 结束进程

3. 端口管理

   * 显示端口号
   * 显示协议 TCP / UDP
   * 显示状态
   * 显示对应 PID
   * 显示进程名称
   * 支持按端口结束进程

4. 安全保护

   * 系统关键进程默认禁止结束
   * 结束进程前必须二次确认
   * 权限不足时必须给出明确提示

5. 操作日志

   * 记录结束进程的时间
   * 记录 PID
   * 记录进程名
   * 记录端口号
   * 记录操作结果

## 暂不实现

第一阶段不要做：

* 远程服务器监控
* 多机器监控
* 用户登录
* 云同步
* 自动杀进程
* 自动清理系统缓存
* 注册表清理
* 插件系统
* 企业级告警

## 默认保护进程

以下进程默认禁止结束：

```text
System
Registry
smss.exe
csrss.exe
wininit.exe
winlogon.exe
services.exe
lsass.exe
svchost.exe
explorer.exe
dwm.exe
taskhostw.exe
RuntimeBroker.exe
SecurityHealthService.exe
MsMpEng.exe
```

## 推荐页面

```text
Dashboard
Processes
Ports
Cleanup
Logs
Settings
```

## 推荐目录结构

前端：

```text
src/
  pages/
  components/
  services/
  types/
```

Go 后端：

```text
internal/
  system/
  process/
  port/
  log/
  config/
  storage/
```

## 开发相关进程识别

优先关注以下进程：

```text
node.exe
npm
pnpm
yarn
vite
python.exe
uvicorn
go.exe
java.exe
redis-server
postgres
mysql
nginx
docker
wsl
vmmem
```

## 常见开发端口

默认关注：

```text
3000
3001
5173
5174
5000
7001
8000
8080
9000
5432
3306
6379
27017
```

## 代码要求

* Go 代码保持模块清晰。
* 前端 TypeScript 尽量不要使用 `any`。
* 危险操作必须有确认弹窗。
* 不要吞掉错误。
* 权限错误要明确提示。
* 不要生成纯静态假数据页面。
* 不要一次性实现过多功能。
* 每次修改后说明如何运行和验证。

## 推荐开发顺序

1. 初始化 Wails + React + TypeScript 项目。
2. 实现基础布局。
3. 实现系统资源总览。
4. 实现进程列表。
5. 实现端口列表。
6. 实现按 PID 结束进程。
7. 实现按端口结束进程。
8. 实现保护进程规则。
9. 实现操作日志。
10. 实现清理页。

## 验收标准

第一阶段完成后，应用必须做到：

* 可以启动桌面应用。
* 可以查看 CPU 和内存使用情况。
* 可以查看进程列表。
* 可以查看端口占用列表。
* 可以根据端口找到 PID。
* 可以根据 PID 找到进程。
* 可以手动结束非保护进程。
* 结束进程前有确认。
* 系统关键进程不能被误杀。
* 操作结果会写入日志。

## 核心原则

本项目只围绕一个目标展开：

```text
让开发者快速知道：哪个服务还活着，占了多少资源，占了哪个端口，以及是否可以安全关闭。
```
