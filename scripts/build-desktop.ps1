# 打桌面安装包。
# - Windows 主机：构建 Windows（NSIS 安装器 + 便携 zip）。
# - Linux 主机：额外构建 Linux（AppImage / deb / tar.gz）。
# Linux 包由 GitHub Actions 的 Ubuntu runner 生成（见 .github/workflows/release.yml），
# 因为 Windows 上无法交叉构建 AppImage（mksquashfs）与 deb（fpm）。
#
# 注意：桌面壳复用 web/dist 的构建产物，请先执行 scripts/build-web.ps1（默认 -Channel release）。
# 桌面端「检查更新」固定按 OS 选安装器，渠道只影响 Android APK 选择，所以 debug 渠道的
# web 产物也能跑桌面，但正式打包前应重新构建 release 渠道。
#
# -ParallelTargets：把 NSIS 与 zip 拆成两个 electron-builder 进程并行执行
# （electron-builder 单个进程内的多个 target 基本是串行压缩；本机 20 核时拆开更快，
# 代价是各自铺一份 ~300MB 的 win-unpacked，磁盘与内存占用翻倍）。
param([switch]$ParallelTargets)

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
$zipOut = "$root\out\desktop-zip"
$linuxOut = "$root\out\desktop-linux"
foreach ($dir in @($winOut, $zipOut, $linuxOut)) {
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue }
}

function Start-ElectronBuilderJob {
  param([string]$Name, [string[]]$Targets, [string]$Out)
  Start-Job -Name $Name -ScriptBlock {
    param($desktop, $targets, $out)
    $env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
    $env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
    Set-Location $desktop
    pnpm exec electron-builder @targets --x64 --config electron-builder.yml --config.directories.output=$out 2>&1 | Out-String
  } -ArgumentList $desktop, $Targets, $Out
}

$jobs = @()
if ($ParallelTargets) {
  $jobs += Start-ElectronBuilderJob -Name 'windows-nsis' -Targets @('--win', 'nsis') -Out $winOut
  $jobs += Start-ElectronBuilderJob -Name 'windows-zip' -Targets @('--win', 'zip') -Out $zipOut
  Write-Output 'parallel windows targets: nsis + zip (separate electron-builder processes)'
} else {
  $jobs += Start-ElectronBuilderJob -Name 'windows' -Targets @('--win', 'nsis', 'zip') -Out $winOut
}

if ($IsLinux) {
  $jobs += Start-ElectronBuilderJob -Name 'linux' -Targets @('--linux', 'AppImage', 'deb', 'tar.gz') -Out $linuxOut
  Write-Output 'linux targets started'
} else {
  Write-Output 'skip linux targets on this host (GitHub Actions builds AppImage/deb on Ubuntu)'
}

Write-Output 'waiting for builder jobs...'
$jobs | Wait-Job | Out-Null

foreach ($job in $jobs) {
  $log = Receive-Job $job -Keep 2>&1 | Out-String
  $tail = ($log -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 5) -join "`n"
  if ($job.State -ne 'Completed') {
    throw "$($job.Name) 打包失败：`n$tail"
  }
  Write-Output "--- $($job.Name) (tail) ---"
  Write-Output $tail
  Remove-Job $job -Force
}

# 收集 Windows 产物：NSIS 在 winOut，zip 在 zipOut（并行模式），否则都在 winOut
$installer = Get-ChildItem $winOut -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$winZip = Get-ChildItem $winOut -Filter '*.zip' -ErrorAction SilentlyContinue | Select-Object -First 1
$winUnpacked = "$winOut\win-unpacked"
if (-not $winZip -and $ParallelTargets) {
  $winZip = Get-ChildItem $zipOut -Filter '*.zip' -ErrorAction SilentlyContinue | Select-Object -First 1
}
if (-not $winZip -and -not $ParallelTargets) { throw "Windows 便携 zip 未生成（$winOut）" }
$exe = Get-ChildItem $winUnpacked -Filter '*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
$fileCount = (Get-ChildItem $winUnpacked -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
if (-not $exe -or $fileCount -lt 20) { throw "win-unpacked 不完整：exe=$([bool]$exe) files=$fileCount" }

foreach ($file in @($installer, $winZip)) {
  if ($file) {
    Copy-Item -Force $file.FullName "$root\out\$($file.Name)"
    Write-Output "windows: $root\out\$($file.Name) ($([math]::Round($file.Length/1MB,1)) MB)"
  }
}
if ($ParallelTargets -and -not $installer) { Write-Warning 'Windows NSIS 安装器未生成（winOut）' }
if ($ParallelTargets -and -not $winZip) { Write-Warning 'Windows 便携 zip 未生成（zipOut）' }

# 刷新 out/desktop/win-unpacked 供本地启动调试（用 NSIS 那份）
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

if ($IsLinux) {
  $linuxFiles = Get-ChildItem $linuxOut -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Extension -in '.AppImage', '.deb', '.gz'
  }
  if (-not $linuxFiles) { throw "Linux 产物未生成（$linuxOut）" }
  foreach ($file in $linuxFiles) {
    Copy-Item -Force $file.FullName "$root\out\$($file.Name)"
    Write-Output "linux: $root\out\$($file.Name) ($([math]::Round($file.Length/1MB,1)) MB)"
  }
}

$elapsed = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
$mode = if ($ParallelTargets) { 'parallel nsis+zip' } else { 'single process' }
Write-Output "build-desktop done in ${elapsed}s ($mode)"
