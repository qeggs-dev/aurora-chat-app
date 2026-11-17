# 构建聊天界面（web 副本），并把产物分发给两层壳
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Push-Location "$root\web"
try {
  pnpm install
  $env:NODE_ENV = 'production'
  pnpm exec rspack build -c rspack.config.ts
} finally { Pop-Location }

foreach ($dst in @("$root\desktop\dist", "$root\mobile\www")) {
  if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
  Copy-Item -Recurse "$root\web\dist" $dst
}
Write-Output "web dist -> desktop\dist, mobile\www"
