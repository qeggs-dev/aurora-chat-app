# 构建聊天界面（web 副本），并把产物分发给两层壳
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Push-Location "$root\web"
try {
  pnpm install
  # 内置极光样式包：源文件在 tools/style-fixture，复制进 web 源码树后
  # 由 rspack 的 .zip asset/resource 规则作为静态资产打进 dist（桌面 asar / Android assets 都能 fetch）
  $builtinDir = Join-Path $PWD 'src\assets\builtin'
  New-Item -ItemType Directory -Force -Path $builtinDir | Out-Null
  Copy-Item -Force (Join-Path $root 'tools\style-fixture\aurora.zip') (Join-Path $builtinDir 'aurora.zip')
  Write-Output "builtin style pack -> web\src\assets\builtin\aurora.zip"
  $env:NODE_ENV = 'production'
  pnpm exec rspack build -c rspack.config.ts
} finally { Pop-Location }

foreach ($dst in @("$root\desktop\dist", "$root\mobile\www")) {
  if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
  Copy-Item -Recurse "$root\web\dist" $dst
}
Copy-Item -Force "$root\assets\brand\aurora-48.png" "$root\web\dist\favicon.png"
Copy-Item -Force "$root\web\LICENSE-UPSTREAM" "$root\web\dist\LICENSE-UPSTREAM"
Write-Output "web dist -> desktop\dist, mobile\www"
