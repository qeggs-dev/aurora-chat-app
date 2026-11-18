# 打 Android APK（debug 默认；-Release 需自备签名）
param([switch]$Release, [switch]$Both)
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
  if ($Both) {
    # 一次 gradle 调用同时出 debug + release，复用任务图，比跑两次 gradle 快
    .\gradlew.bat assembleDebug assembleRelease --no-daemon --console=plain
  } else {
    $task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
    .\gradlew.bat $task --no-daemon --console=plain
  }
} finally { Pop-Location }

New-Item -ItemType Directory -Force -Path "$root\out\mobile" | Out-Null
$version = (Get-Content "$root\mobile\package.json" -Raw | ConvertFrom-Json).version
$variants = if ($Both) { @('debug', 'release') } elseif ($Release) { @('release') } else { @('debug') }
foreach ($variant in $variants) {
  $apk = Get-ChildItem "$android\app\build\outputs\apk\$variant" -Filter *.apk | Select-Object -First 1
  if (-not $apk) { throw "未找到 APK（$variant）" }
  $artifact = if ($variant -eq 'release') { "aurora-chat-$version-release.apk" } else { 'aurora-chat-debug.apk' }
  Copy-Item -Force $apk.FullName "$root\out\mobile\$artifact"
  Write-Output "apk: $root\out\mobile\$artifact ($([math]::Round($apk.Length/1MB,1)) MB)"
}



