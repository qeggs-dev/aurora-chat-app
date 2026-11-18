# 名称、声明与许可

## 名称与声明

- 对外名称：**Aurora Chat**（`appName`、页面标题、窗口标题、Android 桌面名、桌面 exe 名）。
- 维护者：**Qeggs**（GitHub: [qeggs-dev](https://github.com/qeggs-dev)）。
- 包标识：`com.aurorachat.app`（中性命名，不使用 `deepseek` 作为组织名，避免暗示官方关系）。
- 首次使用：启动后先弹「使用前请确认」，必须点「我已知悉，继续使用」才会继续；确认结果存在 `localStorage` 的 `chat-demo:disclaimer-accepted`，之后不再弹出。
- 声明入口：`设置 → 关于` 随时可看非官方声明、上游仓库链接、官方在线体验（`https://cdn.deepseek.com/chat-demo`）、上游 MIT 许可全文、图标与第三方组件说明。
- 换名称/换 URL：`web/src/i18n/{zh,en}.ts`（文案）、`web/src/components/settings/DisclaimerGate.tsx`（弹窗）、`desktop/electron-builder.yml` 与 `mobile/capacitor.config.json`（包名/产品名）。
- 内部代号（用户不可见）：`localStorage` 的 `chat-demo:*` 键、IndexedDB 的 `dslike-*` 库名、CSS 变量 `--dslike-*`、`dslike_chat.style_pkg` 资源前缀等是内部标识，改名不影响已有数据，也不会显示在界面上。

## 图标与启动屏

- 标记来源：本项目自绘的**抽象极光标记**（`assets/brand/aurora-mark.svg`、`aurora-lockup.svg`、`aurora-1024.png` 等）：深蓝底上青蓝到紫的极光弧带，不含任何字母、聊天气泡或官方元素；`assets/logo/` 是旧版 `DS` 标记的存档，不再用于应用图标与启动屏。
- 桌面：`desktop/build/icon.png`（1024×1024，由 `assets/brand/aurora-mark.svg` 渲染），electron-builder 自动转成 exe 图标。
- Android：`mipmap-*/ic_launcher*.png` 与 `drawable*/splash.png` 由同一标记渲染，自适应图标背景色 `#061029`；启动屏为深蓝底 + 居中极光标记，Android 12+ 走 `windowSplashScreenAnimatedIcon`，旧版本回落到 `drawable/**/splash.png`。
- 重新生成图标：`node tools/brand/gen-aurora-icons.mjs`（从 `assets/brand/*` 渲染桌面、Android 与启动屏资源）。

## 许可

- 本项目（壳层与修改）：MIT，版权归 Qeggs / Aurora Chat contributors，见根目录 `LICENSE`；web 仓库的 `LICENSE` 同样是本项目许可。
- 上游界面 `web/`（基于 `deepseek-ai/chat-demo`）：MIT，版权归 DeepSeek；其许可原文保存在根目录与 web 仓库的 `LICENSE-UPSTREAM`，构建时随 `dist/LICENSE-UPSTREAM` 打进 asar / APK，并在桌面包内以 `LICENSE.chat-demo.txt` 分发。
- Electron / Chromium / Capacitor / 前端依赖的第三方声明见 `NOTICE.md`；分发时务必保留 `LICENSES.chromium.html` 与 `LICENSE.electron.txt`。
- 本项目是**社区客户端**（基于 chat-demo 修改与扩展），属于非官方项目，未获 DeepSeek 背书；包标识使用中性的 `com.aurorachat.app`。
