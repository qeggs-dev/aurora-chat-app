# 并行打 Windows（NSIS 安装器 + 便携 zip）与 Linux（AppImage / deb / tar.gz）
# 一次 electron-builder 调用产出同平台全部目标，Windows 与 Linux 两个进程并行，避免多次全量重打包。
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$desktop = "$root\desktop"
$startedAt = Get-Date

$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

Get-Process 'Aurora Chat' -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

Push-Location $desktop
try {
  pnpm install
  if (Test-Path "$desktop\dist") { Remove-Item -Recurse -Force "$desktop\dist" }
  Copy-Item -Recurse "$root\web\dist" "$desktop\dist"
} finally { Pop-Location }

$winOut = "$root\out\desktop-win"
$linuxOut = "$root\out\desktop-linux"
foreach ($dir in @($winOut, $linuxOut)) {
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue }
}

$winJob = Start-Job -ScriptBlock {
  param($desktop, $out)
  $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
  $env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
  Set-Location $desktop
  pnpm exec electron-builder --win nsis zip --x64 --config electron-builder.yml --config.directories.output=$out 2>&1 | Out-String
} -ArgumentList $desktop, $winOut

$linuxJob = Start-Job -ScriptBlock {
  param($desktop, $out)
  $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
  $env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
  Set-Location $desktop
  pnpm exec electron-builder --linux AppImage deb tar.gz --x64 --config electron-builder.yml --config.directories.output=$out 2>&1 | Out-String
} -ArgumentList $desktop, $linuxOut

Write-Output "parallel builds started: windows(nsis+zip) + linux(appimage+deb+tar.gz)"
Wait-Job $winJob, $linuxJob | Out-Null

foreach ($job in @(@{ Name = 'windows'; Job = $winJob }, @{ Name = 'linux'; Job = $linuxJob })) {
  $name = $job.Name
  $j = $job.Job
  $log = Receive-Job $j -Keep 2>&1 | Out-String
  $tail = ($log -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 6) -join "`n"
  if ($j.State -eq 'Failed') {
    throw "$name 打包失败：`n$tail"
  }
  Write-Output "--- $name build output (tail) ---"
  Write-Output $tail
  Remove-Job $j -Force
}

# 校验并收集 Windows 产物
$installer = Get-ChildItem $winOut -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$winZip = Get-ChildItem $winOut -Filter '*.zip' -ErrorAction SilentlyContinue | Select-Object -First 1
$winUnpacked = "$winOut\win-unpacked"
if (-not $winZip) { throw "Windows 便携 zip 未生成（$winOut）" }
$exe = Get-ChildItem $winUnpacked -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$fileCount = (Get-ChildItem $winUnpacked -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
if (-not $exe -or $fileCount -lt 20) { throw "win-unpacked 不完整：exe=$([bool]$exe) files=$fileCount" }

foreach ($file in @($installer, $winZip)) {
  if ($file) {
    Copy-Item -Force $file.FullName "$root\out\$($file.Name)"
    Write-Output "windows: $root\out\$($file.Name) ($([math]::Round($file.Length/1MB,1)) MB)"
  }
}
if (-not $installer) { Write-Warning 'Windows NSIS 安装器未生成（检查 NSIS 下载与网络）' }

# 刷新 out/desktop/win-unpacked 供本地启动调试
$stablePkg = "$root\out\desktop\win-unpacked"
$oldDesktop = "$root\out\desktop"
if (Test-Path $oldDesktop) { Remove-Item -Recurse -Force $oldDesktop -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $stablePkg | Out-Null
try {
  Copy-Item -Recurse -Force "$winUnpacked\*" $stablePkg -ErrorAction Stop
  Write-Output "win-unpacked: $stablePkg"
} catch {
  Write-Warning "无法刷新 out/desktop/win-unpacked（文件被占用），本次产物在 $winUnpacked"
}

# 校验并收集 Linux 产物
$linuxFiles = Get-ChildItem $linuxOut -File -ErrorAction SilentlyContinue | Where-Object {
  $_.Extension -in '.AppImage', '.deb', '.gz'
}
if (-not $linuxFiles) { throw "Linux 产物未生成（$linuxOut）" }
foreach ($file in $linuxFiles) {
  Copy-Item -Force $file.FullName "$root\out\$($file.Name)"
  Write-Output "linux: $root\out\$($file.Name) ($([math]::Round($file.Length/1MB,1)) MB)"
}

$elapsed = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
Write-Output "build-desktop done in ${elapsed}s (windows + linux in parallel)"
