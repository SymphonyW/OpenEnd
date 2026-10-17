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


去GitHub创建Release，把安装包拖进去


$releaseVersion = (Get-Content .\wails.json -Raw | ConvertFrom-Json).info.productVersion
Get-FileHash ".\build\bin\OpenEnd-v$releaseVersion-windows-amd64-installer.exe" -Algorithm SHA256
