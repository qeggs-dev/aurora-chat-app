# DSLike Chat（chat-demo 的非官方桌面/移动壳）

给上游开源项目 [`deepseek-ai/chat-demo`](https://github.com/deepseek-ai/chat-demo) v0.1.1 加的两层壳：

- `desktop/` —— Electron 桌面壳，加载本地 `dist/`，用自定义安全协议 `app://bundle/` 提供页面（正常 origin，localStorage/IndexedDB 可用），只放行系统浏览器的外部链接。
- `mobile/` —— Capacitor Android 壳，WebView 加载打包进 assets 的同一份页面，已声明录音权限（语音输入可用），文件选择走 SAF。
- `web/` —— 上游源码副本（含 `LICENSE`），构建产物 `dist/` 会分发给两层壳。
- `scripts/` —— 一键构建脚本；`out/` —— 分发物。

## 名称与声明

- 对外名称：**DSLike Chat**（`appName`、页面标题、窗口标题、Android 桌面名、桌面 exe 名）。
- 包标识：`com.dslike.chat`（中性命名，不使用 `deepseek` 作为组织名，避免暗示官方关系）。
- 首次使用：启动后先弹「使用前请确认」，必须点「我已知悉，继续使用」才会继续；确认结果存在 `localStorage` 的 `chat-demo:disclaimer-accepted`，之后不再弹出。
- 声明入口：`设置 → 关于` 随时可看非官方声明、上游仓库链接、上游 MIT 许可全文、图标与第三方组件说明。
- 换名称/换 URL：`web/src/i18n/{zh,en}.ts`（文案）、`web/src/components/settings/DisclaimerGate.tsx`（弹窗）、`desktop/electron-builder.yml` 与 `mobile/capacitor.config.json`（包名/产品名）。

## 构建

```powershell
pwsh -File scripts\build-web.ps1       # 1. 构建 web 产物并分发
pwsh -File scripts\build-desktop.ps1   # 2. 桌面：out\desktop\win-unpacked + out\chat-demo-desktop-0.1.1-win-x64.zip
pwsh -File scripts\build-mobile.ps1    # 3. 移动：out\mobile\chat-demo-debug.apk
```

环境要求：Node 22+ / pnpm、JDK 17+、Android SDK（platform 36 + build-tools 36.1.0）；首次 Gradle 构建会下载 wrapper 与 AGP 依赖。

## 已知限制

- **必须联网**：页面直连 `https://api.deepseek.com`（Anthropic 兼容接口），壳不代理请求；离线只能看已缓存的历史。
- **首次启动要填 API Key**：与上游一致，Key 存在 localStorage。
- **移动端导出历史 ZIP 不落盘**：WebView 不支持 `a[download]` 的 blob 下载，需要接 `@capacitor/filesystem` 或改用系统分享。
- **移动端语音**：Manifest 已声明 `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS`，Capacitor 的 `BridgeWebChromeClient` 会在首次录音时申请运行时权限。
- **签名**：未配置代码签名与 Android release keystore；`assembleRelease` 需要自行补签名配置。

## 图标与启动屏

- 标记来源：DeepSeek 官方鲸鱼标记，SVG 路径取自工作区插件 `dsh_plugins/dsh-opener`（`icon.svg` / `index.js` 的 `MARK_PATH`，viewBox `0 0 23.16 17.04`）。
- 桌面：`desktop/build/icon.png`（1024×1024，蓝底 `#4D6BFE` + 白鲸），electron-builder 自动转成 exe 图标；已从 exe 抽图标核对。
- Android：`mipmap-*/ic_launcher*.png` 全部替换，自适应图标背景色改为 `#4D6BFE`；启动屏在 `styles.xml` 里配了 `windowSplashScreenBackground` + `windowSplashScreenAnimatedIcon`，Android 12+ 显示蓝底白鲸（真机已核对），旧版本回落到 `drawable/**/splash.png`。
- 重新生成图标：`node .tmp/icon-gen/gen.mjs`（resvg 渲染，输出到 `.tmp/icon-gen/out`，再复制进工程）。

## 许可

- 上游界面与 `web/`：MIT，版权归 `deepseek-ai/chat-demo` 作者，声明文件是 `web/LICENSE`（构建时随 `dist/LICENSE` 打进 asar / APK assets）。
- 本壳层代码：MIT，见根目录 `LICENSE`。
- Electron / Chromium / Capacitor / 前端依赖的第三方声明见 `NOTICE.md`；分发时务必保留 `LICENSES.chromium.html` 与 `LICENSE.electron.txt`。
- 本项目是**非官方封装**，包标识使用中性 `com.chatdemo.shell`，未获 DeepSeek 背书。

## 名称与声明

- 对外名称：**DSLike Chat**（`appName`、页面标题、窗口标题、Android 桌面名、桌面 exe 名）。
- 包标识：`com.dslike.chat`（中性命名，不使用 `deepseek` 作为组织名，避免暗示官方关系）。
- 首次使用：启动后先弹「使用前请确认」，必须点「我已知悉，继续使用」才会继续；确认结果存在 `localStorage` 的 `chat-demo:disclaimer-accepted`，之后不再弹出。
- 声明入口：`设置 → 关于` 随时可看非官方声明、上游仓库链接、上游 MIT 许可全文、图标与第三方组件说明。
- 换名称/换 URL：`web/src/i18n/{zh,en}.ts`（文案）、`web/src/components/settings/DisclaimerGate.tsx`（弹窗）、`desktop/electron-builder.yml` 与 `mobile/capacitor.config.json`（包名/产品名）。

## 构建与验证记录（2026-11-17）

| 目标 | 结果 |
| --- | --- |
| web `rspack build` | 成功，`dist/` 153 个文件 / 4.19 MB |
| 桌面 Electron 45.3.3 | `out\desktop\win-unpacked\chat-demo.exe` 启动正常；CDP 检查 `location.href = app://bundle/index.html`、标题「API 使用 demo」、localStorage/IndexedDB 可用 |
| 桌面 zip | `out\chat-demo-desktop-0.1.1-win-x64.zip` 156.7 MB，内含 `LICENSE`、`LICENSE.chat-demo.txt`、`LICENSE.electron.txt`、`LICENSES.chromium.html`、`NOTICE.md` |
| Android（Capacitor 8.6.2 / AGP 8.13 / Gradle 8.14.3） | `assembleDebug` 成功，APK 5.9 MB，已安装并在 vivo V2270A（Android 15 / SDK 35）上启动，设置弹窗与欢迎页渲染正常 |
| APK 内容 | `assets/public/` 含整份 web 产物与 `LICENSE` |

### 本机构建时需要绕的坑

1. **Gradle 发行包直连不可达**：`services.gradle.org` / `downloads.gradle.org` 连接超时（Java 与 Node 都连不上）。已改用 `https://mirrors.huaweicloud.com/gradle/gradle-8.14.3-bin.zip` 下载到 `.cache\`，并把 `mobile\android\gradle\wrapper\gradle-wrapper.properties` 的 `distributionUrl` 指到本地 `file:///`。
2. **JDK 版本**：Capacitor 8 的 `capacitor-android` 用 Java 21 源码，JDK 18 会报「无效的源发行版：21」。构建用 `D:\Apps\jdk-21.0.8`。
3. **Electron 二进制被 pnpm 拦**：pnpm 11 不读 `package.json` 的 `pnpm.onlyBuiltDependencies`，要在 `pnpm-workspace.yaml` 写 `allowBuilds`（`pnpm approve-builds --all` 也会写这个文件）。
4. **`ELECTRON_RUN_AS_NODE=1`**：本机环境里设了这个变量时，`chat-demo.exe --remote-debugging-port=…` 会被当成 Node 参数解析并以 exit 9 退出；启动前要清掉。



