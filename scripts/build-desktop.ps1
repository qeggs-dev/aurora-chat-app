# 打 Electron 桌面包（unpacked + zip），并附带许可文件
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'

Get-Process chat-demo -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

Push-Location "$root\desktop"
try {
  pnpm install
  if (Test-Path "$root\desktop\dist") { Remove-Item -Recurse -Force "$root\desktop\dist" }
  Copy-Item -Recurse "$root\web\dist" "$root\desktop\dist"
  pnpm exec electron-builder --win --dir --config electron-builder.yml
} finally { Pop-Location }

$pkg = "$root\out\desktop\win-unpacked"
if (-not (Test-Path $pkg)) { throw "未找到打包目录: $pkg" }

# 许可与声明随分发物走：壳的 LICENSE / NOTICE + 上游 LICENSE
Copy-Item -Force "$root\LICENSE" $pkg
Copy-Item -Force "$root\NOTICE.md" $pkg
Copy-Item -Force "$root\web\LICENSE" "$pkg\LICENSE.chat-demo.txt"

$version = (Get-Content "$root\desktop\package.json" -Raw | ConvertFrom-Json).version
$zip = "$root\out\chat-demo-desktop-$version-win-x64.zip"
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path "$pkg\*" -DestinationPath $zip -CompressionLevel Optimal
Write-Output "desktop package: $pkg"
Write-Output "zip: $zip ($([math]::Round((Get-Item $zip).Length/1MB,1)) MB)"
