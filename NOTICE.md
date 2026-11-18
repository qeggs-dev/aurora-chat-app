# 许可与第三方声明（NOTICE）

本目录（Aurora Chat 的壳层工程）只包含**壳层代码**（Electron 主进程、Capacitor 配置、构建脚本）。
聊天界面本体来自上游开源项目，按 MIT 分发，版权归其作者。

## 各部分的许可

| 部分 | 来源 | 许可 | 随分发物附带 |
| --- | --- | --- | --- |
| 本项目（壳层、修改与 web fork 的改动） | 本仓库（维护者 Qeggs / [qeggs-dev](https://github.com/qeggs-dev)） | MIT（根目录 `LICENSE`；web 仓库的 `LICENSE` 同为本项目许可） | `LICENSE` 随桌面包 / APK / web 产物分发 |
| 上游聊天界面（`web/` 基于 https://github.com/deepseek-ai/chat-demo v0.1.1） | 上游项目 | MIT（原文保存为 `LICENSE-UPSTREAM`） | 桌面包内 `LICENSE.chat-demo.txt`、`dist/LICENSE-UPSTREAM`，APK `assets/public/licenses/LICENSE-UPSTREAM.txt` |
| Electron 运行时 | https://www.electronjs.org | MIT | `LICENSE.electron.txt`（electron-builder 自动放入 `win-unpacked/`） |
| Chromium 及第三方组件 | https://www.chromium.org | BSD-3-Clause 等 | `LICENSES.chromium.html`（同上） |
| Capacitor（Android 壳） | https://capacitorjs.com | MIT | `mobile/android/` 内及 `node_modules` 元数据 |
| 前端依赖（React、KaTeX、Mermaid、Prism、fflate、idb、zustand 等） | 各自项目 | 多数 MIT | 见各自包内 LICENSE；如需完整清单可用 `pnpm licenses list` 生成 |

## 商标

MIT 许可**只授予代码权利，不授予商标、名称或标识的使用权**。

- 上游项目名为 `chat-demo`，版权归 DeepSeek 所属主体；本项目是**社区客户端**（基于 chat-demo 修改与扩展），属于非官方项目，未获其背书。上游官方在线体验：`https://cdn.deepseek.com/chat-demo`（仅供对照，与本站无关）。
- 因此壳的包标识使用中性值 `com.aurorachat.app`，不使用 `deepseek` 作为包名/组织名。
- 分发时请保留上述版权与许可声明；不要把 `chat-demo` 当作自己的产品名对外发布，也不要暗示与 DeepSeek 官方存在隶属或合作关系。

## 分发清单（打包后务必人工核对）

- [ ] 桌面 `win-unpacked/`：`Aurora Chat.exe`、`resources/app.asar`（内含 `dist/LICENSE`）、`LICENSE.electron.txt`、`LICENSES.chromium.html`
- [ ] Android APK：`assets/public/LICENSE`（来自 `www/LICENSE`）
- [ ] 本目录 `LICENSE` 与 `NOTICE.md` 随 zip / 安装包一起发布

## 图标

桌面与 Android 的应用图标、Android 启动图，使用本项目自绘的**抽象极光标记**（`assets/brand/` 下的 SVG 与 PNG，由 `tools/brand/gen-aurora-icons.mjs` 渲染）：深蓝底上青蓝到紫的极光弧带，不含任何字母或官方元素。
该标记为本项目原创图形，不包含 DeepSeek 官方 logo；对外分发时仍应注意不要让名称或图形暗示与 DeepSeek 存在隶属、合作或授权关系。
