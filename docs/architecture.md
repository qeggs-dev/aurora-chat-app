# Aurora Chat 架构速览（给新协作者 / 子代理）

> 目的：任何人接手前先读这一页，知道项目是什么、代码在哪、数据存哪、怎么构建验证。
> 当前版本 0.3.x（Electron 桌面壳 + Capacitor Android 壳 + 同一份 React Web 产物）。

## 1. 项目是什么

基于上游开源项目 [`deepseek-ai/chat-demo`](https://github.com/deepseek-ai/chat-demo) 的社区客户端：同一份 `web/` 产物分别装进 Electron 与 Android WebView。相比上游新增了：

- **多协议 API 预设**（anthropic messages / openai chat / openai responses）；
- **用量统计**（请求日志 + 累计统计 + 导出 + 余额）；
- **记忆**（sql.js WASM SQLite + IndexedDB 快照，模型经 `memory_write` / `memory_search` 工具读写）；
- **上下文压缩**（token 阈值触发、摘要 checkpoint）；
- **样式包**（背景/图标/字体/侧边栏标题/调色板/图片效果/卡片透视，zip 导入导出）；
- 自有 Logo 与「社区客户端」声明。

## 2. 仓库结构

```
chat-demo-shell/
├─ web/                     # React 前端（唯一源码，产物 dist/ 分发到两个壳）
│  ├─ src/
│  │  ├─ app/               # App 入口、viewport、Cordis 容器（context.ts / AppServices.tsx）与启动初始化
│  │  ├─ components/        # UI：session / sider / messages / chatInput / settings / base
│  │  ├─ services/          # 业务与数据层（见下）
│  │  ├─ i18n/              # zh.ts / en.ts（键必须成对，类型用 satisfies 校验）
│  │  └─ utils/
│  ├─ rspack.config.ts
│  └─ package.json          # scripts: type / lint / build
├─ desktop/                 # Electron 主进程 + electron-builder 配置 + 图标
│  ├─ main.js               # app://bundle 协议、单实例、外链、权限
│  ├─ electron-builder.yml
│  └─ package.json          # version 决定桌面产物名
├─ mobile/                  # Capacitor Android 工程
│  └─ android/app/build.gradle  # versionCode / versionName
├─ assets/brand/            # 自绘抽象极光标记（SVG + PNG，tools/brand/gen-aurora-icons.mjs 生成图标/启动屏）
├─ assets/logo/             # 旧版 DS 标记存档（不再用于应用图标与启动屏）
├─ scripts/                 # build-web.ps1 / build-desktop.ps1 / build-mobile.ps1
├─ docs/                    # 本文件、plugins.md（插件系统设计）
├─ out/                     # 构建产物（桌面 zip / win-unpacked / APK），不入库
└─ README.md                # 用户文档 + 样式包规范 + 安全边界
```

## 3. web/src/services 地图

| 目录 | 职责 | 关键导出 |
|---|---|---|
| `api/client.ts` | 请求入口：按当前预设选择 legacy DeepSeek 兼容路径或 provider 路径；SSE 流 → 内部事件；验证 Key | `streamChat`、`verifyApiKey`、`API_ORIGIN` |
| `api/providers/` | 三协议适配层：编译请求、解析流式事件、错误分类、基址归一化 | `createClient`、`CanonicalRequest`、`Delta` |
| `chat/` | 会话状态与流式回复：`store.ts`（streamReply/工具循环/压缩接入）、`reply.ts`（消息构造/系统提示词/applyEvent）、`compaction.ts`、`runtimeInfo.ts`、`view.ts`、`types.ts` | zustand store + actions |
| `preset/` | 预设：清单校验、zip 解析、IndexedDB、启用状态、`resolvePreset`（默认预设） | `getActivePreset`、`activatePreset`、`loadPresetConfig`、`savePresetJson` |
| `style/` | 样式包：manifest 校验、zip、IndexedDB、apply（CSS 变量/FontFace/调色板）、`effects.ts`（canvas alpha 特效）、objectURL 生命周期 | `initStylePacks`、`activateStylePack`、`useStylePackState`、`PackIcon` 相关 |
| `memory/` | sql.js 记忆库：schema/迁移、快照持久化、`runMemoryTool` | `initMemory`、`runMemoryTool`、`useMemoryState` |
| `usage/` | 用量：`events` append-only 日志 + `stats/totals` 累计、导出 JSON/CSV、余额 | `recordUsage`、`clearUsageLog`、`resetUsageStats`、`exportUsage` |
| `settings.ts` | 全局设置（API Key、主题等） | `useSettings` |
| `attachments.ts` / `history/` | 附件与本地会话持久化/归档 | — |
| `plugins/` | 内置服务的 Cordis 插件包装（Phase 1）：settings / api / presets / style / memory / usage；只转发模块公开 API，不改原模块 | 六个 `xxxPlugin` + 服务类型 |

## 4. 数据存储

| 存储 | 键/库 | 内容 |
|---|---|---|
| localStorage | `chat-demo:api-key`、`chat-demo:theme-preference`、`chat-demo:style-pack`、`chat-demo:preset`、`chat-demo:disclaimer-accepted`、`chat-demo:locale` | 指针与设置 |
| IndexedDB | `dslike-style`（packs）、`dslike-presets`（presets）、`dslike-memory`（snapshots）、`dslike-usage`（events+stats）、聊天历史库 | 各自业务数据 |
| 磁盘 | `desktop/` 打包、`out/` 产物、Android assets | 构建物 |

## 5. 关键调用链

```
UI → chat/store.streamReply
   →（可选）compaction.prepareCompaction → 摘要写入 Session.compaction
   → reply.toRequestMessages + buildSystemPrompt(system prompt + runtimeMeta)
   → api/client.streamChat → getActivePreset() 解析 → providers.createClient / legacy 兼容路径
   → 流式事件 → reply.applyEvent → 消息落库
   →（可选）工具循环：runMemoryTool → tool_result → 续写（≤3 轮）
   → usage.recordUsage（回复落定）

样式包：设置→样式→导入 zip → parse → IndexedDB → activateStylePack → applyStyleVars（CSS 变量 + FontFace + palette）
```

## 6. 构建与验证

```powershell
cd web
pnpm type        # tsc
pnpm lint        # oxlint
$env:NODE_ENV='production'; pnpm exec rspack build -c rspack.config.ts

# 三端（在 scripts/ 下）
pwsh -File scripts\build-web.ps1
pwsh -File scripts\build-desktop.ps1   # 需要 ELECTRON_RUN_AS_NODE 清空
pwsh -File scripts\build-mobile.ps1    # 需要 JAVA_HOME=D:\Apps\jdk-21.0.8
```

- Electron 二进制：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`；
- Gradle 用本地 wrapper 发行包（镜像），JDK 21；
- 验证常规手段：Electron 加 `--remote-debugging-port` + CDP 脚本；Android 用无线 adb + `localabstract:webview_devtools_remote_<pid>` 转发。

## 7. 约定

- 代码风格：无分号、单引号、2 空格、import 带 `.js` 后缀（TS 源文件里 import TS 模块也写 `.js`）；
- 提交门禁：`pnpm type`、`pnpm lint`、production build 全绿；
- 文案：zh/en 成对，键集由类型保证；
- 安全：样式包/预设都是不可信输入 → 严格白名单、只走 CSSOM、只用 blob URL、CSP；插件设计见 `docs/plugins.md`；
- 第三方测试/验证脚本放 `D:\Projects\Deepseek_Harness_Workspace\.tmp\`，不要污染仓库；
- 构建产物写 `out/`（不入库），临时 profile 放 `run/`。

## 8. Cordis 容器（Phase 1）

目标：把 `web/src/services` 的服务装配从「App 里零散调用 init」改成 Cordis 容器，为 `docs/plugins.md` 的第三方插件运行时留出扩展点。Phase 1 **只做内部容器**：不加载外部插件、不做沙箱、不迁移 UI 调用（React 组件继续直接 import 各模块，行为不变）。

- **依赖**：`cordis@4.0.0-rc.13`（锁定精确版本；运行时只 import `cosmokit`，无 Node-only 依赖，web 构建产物不含 `node:` 内置模块）。
- **创建位置**：`web/src/app/context.ts`
  - `createAppContext()`：`new Context()` 后按依赖顺序 `ctx.plugin(...)` 注册六个内置服务插件（`web/src/services/plugins/<name>.ts`）。每个插件用 `inject` 声明依赖、`ctx.provide(name, service)` 发布；服务对象是现有模块的转发（导出与内部实现都不变）。
  - `getAppContext()`：App 模块加载时创建的单例容器。
  - `start()`：等待所有服务按依赖激活；失败时抛 `AppContextStartError`，逐项给出「哪个服务、加载失败还是缺依赖、缺哪几个服务」，不会静默停在 PENDING。`services()` 返回注入了六个服务的子上下文。
  - `dispose()`：`pagehide` 时自动调用（也可手动），先释放服务作用域，再按注册逆序 dispose 六个服务。
- **React 集成**：`web/src/app/AppServices.tsx` 提供 `<AppServicesProvider context={getAppContext()}>`（包在 App 根节点）与 `useAppService('style')`，类型由 `AppServiceMap` 保证；现有组件不需要改。

| 服务 | 插件文件 | inject | 说明 |
|---|---|---|---|
| `settings` | `plugins/settings.ts` | — | `useSettings` / `getState` / 各 setter |
| `api` | `plugins/api.ts` | `settings` | `streamChat` / `verifyApiKey` / `uploadFile` 等 + `getApiKey()` |
| `presets` | `plugins/presets.ts` | — | preset store 的公开 API（init / activate / import / save / getActiveResolved …） |
| `style` | `plugins/style.ts` | `settings` | style store 与 `applyStyleVars` 的公开 API |
| `memory` | `plugins/memory.ts` | — | init / runTool / flush / list / search / write … |
| `usage` | `plugins/usage.ts` | — | init / record / list / clear / reset … |

- **启动顺序**（App.tsx 的启动 effect）：`await ctx.start()` → `initChat()`（聊天仍直连模块）→ `style.init()` → `presets.init()` → `usage.init()` → `presets` 完成后 `memory.init(预设 memory.enabled)` → 之后预设切换时 `memory.setEnabled(...)`。与 Cordis 化之前的调用顺序一致。
- **卸载顺序**（`ctx.dispose()`）：`usage` → `memory`（flush 记忆库并清掉落盘防抖定时器）→ `style` → `presets` → `api` → `settings`。style / presets 里仍被界面引用的 objectURL 不在 pagehide 时 revoke。
- **Phase 2 计划**：UI 与 service 间调用改用 `useAppService` / `ctx.*`（把模块级 import 换成服务注入，并补上 api→presets 这类真实依赖）；按 `docs/plugins.md` 做外部插件运行时（清单、安装确认、Worker RPC、iframe 挂载）；届时服务 dispose 补主题订阅 unbind 与 objectURL 释放策略。

## 9. 当前状态（2026-11-18）

- 已发布 0.3.0（桌面 zip + APK），0.3.1 正在收尾：用量日志/统计拆分与导出、图片 effects/tilt/window/zoom、默认预设与元信息；
- Cordis 内部容器 Phase 1 已完成（见 §8，`cordis-refactor`）；待做：内置演示样式包 + 详情页导出、内置默认预设、第三方插件运行时（`plugin-runtime`）；
- 设计文档：`docs/plugins.md`。
