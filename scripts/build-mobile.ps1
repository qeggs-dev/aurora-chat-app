# 打 Android APK（debug 默认；-Release 需自备签名）
param([switch]$Release)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$android = "$root\mobile\android"

$jdk21 = 'D:\Apps\jdk-21.0.8'
$env:JAVA_HOME = if (Test-Path $jdk21) { $jdk21 } elseif ($env:JAVA_HOME) { $env:JAVA_HOME } else { throw '需要 JDK 21（Capacitor 8 使用 Java 21 源码）' }
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

Push-Location "$root\mobile"
try {
  pnpm install
  if (Test-Path "$root\mobile\www") { Remove-Item -Recurse -Force "$root\mobile\www" }
  Copy-Item -Recurse "$root\web\dist" "$root\mobile\www"
  # 许可与声明随 APK 分发：应用 LICENSE、上游 LICENSE-UPSTREAM、NOTICE
  New-Item -ItemType Directory -Force -Path "$root\mobile\www\licenses" | Out-Null
  Copy-Item -Force "$root\LICENSE" "$root\mobile\www\licenses\LICENSE-APP.txt"
  Copy-Item -Force "$root\LICENSE-UPSTREAM" "$root\mobile\www\licenses\LICENSE-UPSTREAM.txt"
  Copy-Item -Force "$root\NOTICE.md" "$root\mobile\www\licenses\NOTICE.md"
  pnpm exec cap sync android
} finally { Pop-Location }

Push-Location $android
try {
  $task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
  .\gradlew.bat $task --no-daemon --console=plain
} finally { Pop-Location }

$variant = if ($Release) { 'release' } else { 'debug' }
$apk = Get-ChildItem "$android\app\build\outputs\apk\$variant" -Filter *.apk | Select-Object -First 1
if (-not $apk) { throw "未找到 APK（$variant）" }
New-Item -ItemType Directory -Force -Path "$root\out\mobile" | Out-Null
Copy-Item -Force $apk.FullName "$root\out\mobile\aurora-chat-$variant.apk"
Write-Output "apk: $root\out\mobile\aurora-chat-$variant.apk ($([math]::Round($apk.Length/1MB,1)) MB)"



