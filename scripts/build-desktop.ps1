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
  # 输出到独立目录：旧 win-unpacked 的 app.asar 可能被宿主进程占用，直接原地重建会 EBUSY
  pnpm exec electron-builder --win --dir --config electron-builder.yml --config.directories.output=../out/desktop-build
} finally { Pop-Location }

$pkg = "$root\out\desktop-build\win-unpacked"
if (-not (Test-Path $pkg)) { throw "未找到打包目录: $pkg" }

# 许可与声明随分发物走：本壳 LICENSE、NOTICE 与上游 LICENSE-UPSTREAM
Copy-Item -Force "$root\LICENSE" $pkg
Copy-Item -Force "$root\NOTICE.md" $pkg
# 上游 chat-demo 的 MIT 许可：根目录 LICENSE-UPSTREAM 是唯一副本
Copy-Item -Force "$root\LICENSE-UPSTREAM" "$pkg\LICENSE.chat-demo.txt"

# 尽量把最新产物同步回 out/desktop/win-unpacked（供本地启动/调试）；被锁时只警告
$stablePkg = "$root\out\desktop\win-unpacked"
$oldDesktop = "$root\out\desktop"
if (Test-Path $oldDesktop) { Remove-Item -Recurse -Force $oldDesktop -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path "$root\out\desktop" | Out-Null
try {
  Copy-Item -Recurse -Force $pkg $stablePkg -ErrorAction Stop
  Write-Output "win-unpacked: $stablePkg"
} catch {
  Write-Warning "无法刷新 out/desktop/win-unpacked（文件被占用），本次产物在 $pkg"
}

$version = (Get-Content "$root\desktop\package.json" -Raw | ConvertFrom-Json).version
$zip = "$root\out\dslike-chat-desktop-$version-win-x64.zip"
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path "$pkg\*" -DestinationPath $zip -CompressionLevel Optimal
Write-Output "desktop package: $pkg"
Write-Output "zip: $zip ($([math]::Round((Get-Item $zip).Length/1MB,1)) MB)"

