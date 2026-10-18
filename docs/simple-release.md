修改wails.json中的productVersion字段


执行
.\scripts\package-windows.ps1
go test ./...
npm --prefix frontend run build


提交更改


git checkout main
git pull origin main
git tag v1.0.0（版本号）
git push origin v1.0.0（版本号）


先将 Update README download links 工作流合并到默认分支。去 GitHub 创建正式 Release，发布前上传带版本号的安装包；发布后工作流会自动更新中英文 README 的直链，用户下载到的文件名保留版本号。固定名 openend-amd64-installer.exe 可一起上传，供旧链接使用。补传附件后可在 Actions 中手动运行该工作流。


$releaseVersion = (Get-Content .\wails.json -Raw | ConvertFrom-Json).info.productVersion
Get-FileHash ".\build\bin\OpenEnd-v$releaseVersion-windows-amd64-installer.exe" -Algorithm SHA256
