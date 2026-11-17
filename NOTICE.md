# 许可与第三方声明（NOTICE）

本目录（chat-demo-shell）只包含**壳层代码**（Electron 主进程、Capacitor 配置、构建脚本）。
聊天界面本体来自上游开源项目，按 MIT 分发，版权归其作者。

## 各部分的许可

| 部分 | 来源 | 许可 | 随分发物附带 |
| --- | --- | --- | --- |
| 聊天界面 `web/`（及其产物 `dist/`） | https://github.com/deepseek-ai/chat-demo v0.1.1 | MIT（见 `web/LICENSE`，构建时复制到 `dist/LICENSE`） | `dist/LICENSE` → 打进 asar / APK assets |
| 本壳层代码 `desktop/`、`mobile/`、`scripts/` | 本仓库 | MIT（见本目录 `LICENSE`） | 与本 NOTICE 一起分发 |
| Electron 运行时 | https://www.electronjs.org | MIT | `LICENSE.electron.txt`（electron-builder 自动放入 `win-unpacked/`） |
| Chromium 及第三方组件 | https://www.chromium.org | BSD-3-Clause 等 | `LICENSES.chromium.html`（同上） |
| Capacitor（Android 壳） | https://capacitorjs.com | MIT | `mobile/android/` 内及 `node_modules` 元数据 |
| 前端依赖（React、KaTeX、Mermaid、Prism、fflate、idb、zustand 等） | 各自项目 | 多数 MIT | 见各自包内 LICENSE；如需完整清单可用 `pnpm licenses list` 生成 |

## 商标

MIT 许可**只授予代码权利，不授予商标、名称或标识的使用权**。

- 上游项目名为 `chat-demo`，版权归 DeepSeek 所属主体；本项目是**非官方封装**，未获其背书。
- 因此壳的包标识使用中性值 `com.chatdemo.shell`，不使用 `deepseek` 作为包名/组织名。
- 分发时请保留上述版权与许可声明；不要把 `chat-demo` 当作自己的产品名对外发布，也不要暗示与 DeepSeek 官方存在隶属或合作关系。

## 分发清单（打包后务必人工核对）

- [ ] 桌面 `win-unpacked/`：`chat-demo.exe`、`resources/app.asar`（内含 `dist/LICENSE`）、`LICENSE.electron.txt`、`LICENSES.chromium.html`
- [ ] Android APK：`assets/public/LICENSE`（来自 `www/LICENSE`）
- [ ] 本目录 `LICENSE` 与 `NOTICE.md` 随 zip / 安装包一起发布

## 图标

桌面与 Android 的应用图标、Android 启动图，使用 DeepSeek 官方鲸鱼标记（SVG 路径取自工作区 `dsh_plugins/dsh-opener` 的 `icon.svg` / `MARK_PATH`，viewBox 0 0 23.16 17.04）。
该标记是 DeepSeek 的品牌资产，商标权归其所有；本项目仅在本地作为界面识别使用，**不代表官方发布或背书**，对外分发前请自行确认商标使用要求。
