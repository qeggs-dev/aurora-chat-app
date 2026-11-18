# 构建与发布

本项目的三平台安装包由 CI 构建，也可在本机手动构建。

## 下载

三平台安装包发布在 [Releases](https://github.com/qeggs-dev/aurora-chat-app/releases)（由 GitHub Actions 构建）：

| 平台 | 文件 | 说明 |
|---|---|---|
| Windows | `aurora-chat-<版本>-win-x64.exe` | NSIS 安装器（可选择安装目录、创建快捷方式） |
| Windows | `aurora-chat-<版本>-win-x64.zip` | 免安装便携版，解压后运行 Aurora Chat.exe |
| Linux | `aurora-chat-<版本>-linux-x86_64.AppImage` / `aurora-chat-<版本>-linux-amd64.deb` | AppImage 免安装（`chmod +x` 后运行）；deb 适用于 Debian/Ubuntu |
| Android | `aurora-chat-<版本>-release.apk` | release 签名；本地用 `scripts/build-mobile.ps1 -Release` 构建，CI 则附 `*-debug.apk` |

### 本地 release 签名（Android）

release APK 用本机 keystore 签名，keystore 与密码只保存在本地、**不进入仓库**（.gitignore 已忽略 mobile/android/keystore/、mobile/android/keystore.properties、*.jks）：

```
mobile/android/keystore/aurora-release.jks     # 自签名密钥，请自行备份
mobile/android/keystore.properties             # storePassword / keyAlias / keyPassword
```

构建：

```powershell
.\scripts\build-mobile.ps1 -Release
# 产物：out\mobile\aurora-chat-<版本>-release.apk
```

注意：release APK 与 debug APK 签名不同，手机上从 debug 换装 release 需要先卸载（会清数据）；发布给他人安装则直接装 release 包即可。keystore 一旦丢失，未来版本无法覆盖安装已发布的 release 包，务必备份。

本地也随时可以构建：scripts\build-all.ps1 一次产出 Windows（安装器 + 便携 zip）与 Android APK；Linux 包由 CI 的 Ubuntu runner 生成。

## 构建

```powershell
pwsh -File scripts\build-web.ps1       # 1. 构建 web 产物并分发
pwsh -File scripts\build-desktop.ps1   # 2. 桌面：out\desktop\win-unpacked + out\aurora-chat-desktop-<version>-win-x64.zip
pwsh -File scripts\build-mobile.ps1    # 3. 移动：out\mobile\aurora-chat-debug.apk
```

环境要求：Node 22+ / pnpm、JDK 17+、Android SDK（platform 36 + build-tools 36.1.0）；首次 Gradle 构建会下载 wrapper 与 AGP 依赖。

当前版本 **0.3.2**（Android `versionCode 8`）。`scripts/` 里的脚本会依次完成 web 构建、资源分发与打包，桌面 zip 与 APK 都在 `out/` 下。

## 已知限制

- **必须联网**：页面直连 `https://api.deepseek.com`（Anthropic 兼容接口），壳不代理请求；离线只能看已缓存的历史。
- **首次启动要填 API Key**：与上游一致，Key 存在 localStorage。
- **移动端导出历史 ZIP 不落盘**：WebView 不支持 `a[download]` 的 blob 下载，需要接 `@capacitor/filesystem` 或改用系统分享。
- **移动端语音**：Manifest 已声明 `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS`，Capacitor 的 `BridgeWebChromeClient` 会在首次录音时申请运行时权限。
- **签名**：未配置代码签名与 Android release keystore；`assembleRelease` 需要自行补签名配置。
- **附件跨协议**：文件附件只在「DeepSeek 的 Anthropic 兼容端点」上可用（依赖其 Files API）；切到 OpenAI Chat / Responses 预设时附件会被跳过（仅提示，不阻塞发送）。
- **记忆与压缩是本机数据**：记忆存在各设备自己的 IndexedDB（sql.js 快照），不跨设备同步；压缩摘要随会话保存在本地。
- **压缩没有 UI 标记**：自动压缩不会在聊天流里显示「已压缩 N 条」，原文仍保留在本地会话中可回看。

## 构建与验证记录（2026-11-18，改名 Aurora Chat / `com.aurorachat.app` 后重建）

| 目标 | 结果 |
| --- | --- |
| web `pnpm type` / `pnpm lint` / `rspack build` | 全绿（0 error / 0 warning），`dist/` 产物 |
| 桌面 Electron 45.3.3 | `out\desktop\win-unpacked\Aurora Chat.exe`（ProductName = Aurora Chat）启动正常；CDP 检查 `location.href = app://bundle/index.html`、窗口与页面标题「Aurora Chat」、首启弹窗 / 侧边栏 / 关于页均为 Aurora Chat，控制台无错误 |
| 桌面 zip | `out\aurora-chat-desktop-0.3.2-win-x64.zip`（157.2 MB），内含 `Aurora Chat.exe`、`LICENSE`、`LICENSE.chat-demo.txt`、`LICENSE.electron.txt`、`LICENSES.chromium.html`、`NOTICE.md` |
| 图标 / 启动屏 | `assets/brand/` 的定稿抽象极光标记（`tools/brand/gen-aurora-icons.mjs` 生成）；从重建后的 exe 抽出的 32px 图标与 APK 内 `mipmap-xxxhdpi-v4/ic_launcher.png` 均已是极光标记，不再是旧 DS 标记 |
| Android（Capacitor 8.6.2 / AGP 8.13 / Gradle 8.14.3） | `assembleDebug` 成功，`out\mobile\aurora-chat-debug.apk` 6.9 MB；`applicationId` / `namespace` = `com.aurorachat.app`、`app_name` = Aurora Chat、`versionName` = 0.3.2；已安装并在 vivo V2270A（Android 15 / SDK 36）上启动，首启声明渲染正常 |
| APK 内容 | `assets/public/` 含整份 web 产物与 `LICENSE`；`assets/capacitor.config.json` 的 `appId` = `com.aurorachat.app`、`appName` = Aurora Chat |

### 本机构建时需要绕的坑

1. **Gradle 发行包直连不可达**：`services.gradle.org` / `downloads.gradle.org` 连接超时（Java 与 Node 都连不上）。已改用 `https://mirrors.huaweicloud.com/gradle/gradle-8.14.3-bin.zip` 下载到 `.cache\`，并把 `mobile\android\gradle\wrapper\gradle-wrapper.properties` 的 `distributionUrl` 指到本地 `file:///`。
2. **JDK 版本**：Capacitor 8 的 `capacitor-android` 用 Java 21 源码，JDK 18 会报「无效的源发行版：21」。构建用 `D:\Apps\jdk-21.0.8`。
3. **Electron 二进制被 pnpm 拦**：pnpm 11 不读 `package.json` 的 `pnpm.onlyBuiltDependencies`，要在 `pnpm-workspace.yaml` 写 `allowBuilds`（`pnpm approve-builds --all` 也会写这个文件）。
4. **`ELECTRON_RUN_AS_NODE=1`**：本机环境里设了这个变量时，`Aurora Chat.exe --remote-debugging-port=…` 会被当成 Node 参数解析并以 exit 9 退出；启动前要清掉。
