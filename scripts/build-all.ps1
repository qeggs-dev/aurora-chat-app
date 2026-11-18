# 三平台一次构建：web 先构建，然后 Windows/Linux 桌面包与 Android APK 并行
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$startedAt = Get-Date

Write-Output '=== web ==='
& "$root\scripts\build-web.ps1"
if ($LASTEXITCODE -ne 0) { throw 'build-web failed' }

$desktopJob = Start-Job -ScriptBlock {
  param($script)
  # 命名开关必须直接写在调用里，字符串参数不会绑定到 switch
  & $script -ParallelTargets
  exit $LASTEXITCODE
} -ArgumentList "$root\scripts\build-desktop.ps1"

$mobileJob = Start-Job -ScriptBlock {
  param($script)
  $env:JAVA_HOME = 'D:\Apps\jdk-21.0.8'
  # 一次 gradle 调用同时产出 debug 与 release APK
  & $script -Both
  exit $LASTEXITCODE
} -ArgumentList "$root\scripts\build-mobile.ps1"

Write-Output '=== desktop + mobile (parallel) ==='
Wait-Job $desktopJob, $mobileJob | Out-Null

$failed = $false
foreach ($job in @(@{ Name = 'desktop'; Job = $desktopJob }, @{ Name = 'mobile'; Job = $mobileJob })) {
  $log = Receive-Job $job.Job -Keep 2>&1 | Out-String
  $tail = ($log -split "`n" | Where-Object { $_.Trim() } | Select-Object -Last 8) -join "`n"
  Write-Output "--- $($job.Name) (tail) ---"
  Write-Output $tail
  if ($job.Job.State -ne 'Completed') { $failed = $true }
  Remove-Job $job.Job -Force
}
if ($failed) { throw 'build-all failed: see tails above' }

$elapsed = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
Write-Output "build-all done in ${elapsed}s"
Get-ChildItem "$root\out" -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in '.zip', '.exe', '.AppImage', '.deb', '.gz' } | ForEach-Object { "$($_.Name) ($([math]::Round($_.Length/1MB,1)) MB)" }
Get-ChildItem "$root\out\mobile\*.apk" -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Name) ($([math]::Round($_.Length/1MB,1)) MB)" }
