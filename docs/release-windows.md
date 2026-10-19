# Windows Release

本文档说明 OpenEnd 的 Windows 构建、未签名安装包验证、签名预留和 GitHub Release 发布流程。

## 环境要求

| 工具 | 用途 | 建议版本 |
| --- | --- | --- |
| Windows 10/11 | 本地 Windows 构建和安装包验证 | x64 |
| Go | 编译 Wails 后端 | 1.24 或更新 |
| Node.js / npm | 构建 React 前端 | Node 22.x |
| Wails CLI | 桌面应用构建 | v2.12.0 |
| NSIS | 生成 Windows 安装包 | 最新稳定版 |
| WebView2 Runtime | 运行 Wails 应用 | Windows 11 通常已内置 |

安装 Wails CLI:

```powershell
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
```

安装 NSIS:

```powershell
winget install NSIS.NSIS --silent
```

如果手动安装 NSIS，需要把包含 `makensis.exe` 的目录加入 `PATH`。

## 本地构建

先安装前端依赖:

```powershell
Set-Location frontend
npm install
Set-Location ..
```

只构建 Windows exe:

```powershell
.\scripts\build-windows.ps1
```

等价的 Wails 命令:

```powershell
wails build -platform windows/amd64 -webview2 download -clean
```

生成 Windows 安装包:

```powershell
.\scripts\package-windows.ps1
```

等价的 Wails 命令:

```powershell
wails build -platform windows/amd64 -webview2 download -clean -nsis
```

`-webview2 download` 会让安装包按 Wails/NSIS 策略处理 WebView2 运行时。需要离线安装包时，可评估改用 `-WebView2 embed`，但产物会变大。

## 产物位置

| 产物 | 位置 |
| --- | --- |
| 应用程序 exe | `build/bin/openend.exe` |
| NSIS 安装包 | `build/bin/*installer.exe` |
| GitHub Actions artifact | `openend-windows-unsigned` |

`wails.json` 中的 `info` 会写入 Windows 文件属性和安装包元数据；当前版本号为 `2.2.0`。

安装包文件名包含产品名、版本号和架构，例如 `OpenEnd-v2.2.0-windows-amd64-installer.exe`；安装向导标题也会显示 `OpenEnd v2.2.0`。版本号自动读取 `info.productVersion`。

## 验证安装包

建议在干净的 Windows 测试机或虚拟机上验证:

1. 执行 `.\scripts\package-windows.ps1`。
2. 打开 `build/bin/*installer.exe` 并完成安装。
3. 从开始菜单或桌面快捷方式启动 OpenEnd。
4. 验证主要页面能打开，进程、端口、资源数据能正常显示。
5. 在 Windows "设置 > 应用" 中卸载。
6. 确认开始菜单/桌面快捷方式移除，安装目录不再残留核心程序文件。

发布前同时运行:

```powershell
go test ./...
npm --prefix frontend run build
```

## 未签名提示

当前产物是未签名安装包。Windows 可能显示 SmartScreen 或 "未知发布者" 提示。

处理原则:

| 场景 | 处理方式 |
| --- | --- |
| 内部自测且确认产物来源可信 | 在 SmartScreen 中选择 "更多信息"，再选择 "仍要运行" |
| 用户公开下载 | 不建议要求用户绕过提示，应接入代码签名证书后再发布 |
| 来源不明或校验不一致 | 不要运行，重新从可信 CI artifact 或 Release 下载 |

公开 Release 说明中必须标注当前安装包未签名。

## 签名预留

不要把真实证书、token、私钥、证书密码写进仓库。

后续接入代码签名时建议:

1. 购买 Windows 代码签名证书，优先确认供应商的 `signtool` 参数、时间戳 URL 和 CI 使用方式。
2. 将证书内容以 Base64 写入 GitHub Actions Secrets，例如 `WINDOWS_SIGNING_CERT_BASE64`。
3. 将证书密码写入 GitHub Actions Secrets，例如 `WINDOWS_SIGNING_CERT_PASSWORD`。
4. 在 CI 中把证书解码到临时目录，构建结束后删除临时文件。
5. 对 `build/bin/openend.exe` 签名。
6. 生成 NSIS 安装包，并对最终 `*installer.exe` 签名。
7. 如需签名卸载程序，可启用 `build/windows/installer/project.nsi` 中保留的 `#!uninstfinalize` 和 `#!finalize` 模板，并把证书路径和密码改为 CI 注入值。
8. 使用 `Get-AuthenticodeSignature` 验证签名状态。

本仓库当前只保留签名位置，不包含任何真实签名材料。

## GitHub Actions

`Windows Release Build` 会在 `main` 分支更新时自动运行，也可以手动触发。

手动触发:

1. 打开 GitHub 仓库的 "Actions"。
2. 选择 "Windows Release Build"。
3. 点击 "Run workflow"。
4. 等待 workflow 完成。
5. 下载 artifact `openend-windows-unsigned`。

workflow 会执行:

```text
checkout -> setup Go -> setup Node -> npm install -> install Wails -> install NSIS -> wails build -nsis -> upload artifact
```

## GitHub Release 发布

应用会在启动后和运行期间每隔 6 小时自动检查一次新版本。当前版本号显示在左侧菜单栏的“设置”下方；只有检测到可下载的新版本，才会在“设置”上方显示“更新”按钮。鼠标悬浮或键盘聚焦按钮时，会显示 GitHub Release 中填写的更新说明；说明较长时可以滚动阅读，按 Escape 可关闭。点击按钮通过系统浏览器下载 Windows x64 安装包，用户下载后关闭 OpenEnd，再运行安装包完成更新。不提供手动检查更新入口；自动检查失败仅记录诊断信息，并在下一次自动检查时重试。

当前版本直接读取打包进程序的 `wails.json` 中的 `info.productVersion`。发布时更新此字段，使用对应的 `vX.Y.Z` 正式版本标签，并上传 `OpenEnd-vX.Y.Z-windows-amd64-installer.exe`。安装包必须上传完成，并将该正式 Release 设为 Latest，旧版应用才能检测并提供下载。草稿、预发布、相同版本和更低版本不会提示升级。

检查使用 [GitHub 最新正式版本接口](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)，无需在应用中配置 GitHub token。发布时在 Release 正文中填写更新说明，即可显示在更新按钮的悬浮提示中。

已发布且未包含更新检查功能的旧安装包，需要用户先手动升级一次到包含此功能的版本，此后才能收到更新提醒。

当前建议使用人工确认后的 Release 流程:

1. 从成功的 Actions run 下载 `openend-windows-unsigned`。
2. 在测试机上完成安装、启动、卸载验证。
3. 创建版本标签，例如 `v0.1.0`。
4. 在 GitHub 新建 Release，上传 `build/bin/*installer.exe` 和必要的校验文件。
5. Release notes 中说明:
   - Windows 安装包当前未签名。
   - 可能出现 SmartScreen 或未知发布者提示。
   - 后续版本会接入代码签名。

接入正式代码签名后，再考虑自动创建 GitHub Release。
