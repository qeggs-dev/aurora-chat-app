# Aurora Chat × DSH 插件兼容：可行性勘察与设计

> 状态：设计稿（2026-11-18 勘察）。结论基于对**运行中 DSH 安装**（`app.asar` 内源码与文档）与 **Aurora Chat web 现有代码**的实际阅读；文中每个契约点都带 `文件:行号`，可直接对照实现。
> 本文只做设计与结论，不改任何业务代码、不 push、不改版本号。

## 0. 结论摘要

### 0.1 双方版本事实

| 项 | DSH（Host 侧） | Aurora Chat web |
|---|---|---|
| 产品版本 | `0.2.2-rc.3`（`$DSH/dsh-tools/package.json:4`） | `0.3.17`（`$AURORA/package.json:3`） |
| Cordis | 内置 vendored `@deepseek-ai/cordis@4.1.0`（`$DSH/cordis/package.json:4`，package 名 `@deepseek-ai/cordis`） | `cordis@4.0.0-rc.13`（`$AURORA/package.json:29`） |
| 运行环境 | Electron Host（Node 模式，主进程同域）+ 浏览器 Client（页面内 Cordis） | 纯浏览器（rspack 产物），Electron/Android 只是壳 |
| 插件形态 | npm 包：Host 半（Node ESM）+ 可选 Client 半（浏览器 bundle），装进 profile | 目前只有**内部** 6 个服务插件（转发层），第三方插件只有设计稿 `docs/plugins.md` |

> 证据路径约定：
> `$DSH = D:\Apps\DeepseekHarness\resources\app.asar\dsh\node_modules\@deepseek-ai`
> `$SKILL = $DSH/dsh-agent-preset/skills/dsh-doc`（随 DSH 分发的 dsh-doc 技能参考资料）
> `$AURORA = G:\work\projects\aurora-chat-app\web`
> 行号为本次勘察读取的行号；`app.asar` 内文件用宿主 `read` 工具可直接读取，行号与解包一致。

### 0.2 四条结论

1. **Cordis 层同源，可复用插件作者心智模型，但不能直接复用运行时。**
   DSH 的插件就是一个 Cordis 插件：`export function apply(ctx, config)` 或 Service 子类，依赖用 `inject` 声明，注册用 `ctx.effect()` 成对释放（`$SKILL/dsh-doc/references/host-plugin.md:58-65`；`$DSH/dsh/docs/cordis-api/fiber.md:8-37`）。Aurora 已经用同一个框架（`$AURORA/src/app/context.ts:11,141-161`），所以**接口语义可以对齐**；但 DSH 的 `ctx.tools`、`ctx.commands`、`ctx.settings`… 在 Aurora 里大部分不存在，只有 6 个薄转发服务（`$AURORA/src/app/context.ts:24-52`）。升级 cordis 到 4.1 后，Aurora **可以让 DSH 插件作者的 Host 代码在几乎不改接口的情况下加载**——前提是补齐服务。

2. **信任模型根本冲突：DSH 插件 = 完全信任的本机 Node/页面代码；Aurora 第三方插件 = 不可信 + Worker/iframe 沙箱。**
   DSH 插件直接 `import 'node:crypto'`、注册 `node:http` 语义的路由、在页面里直接渲染 React（如 `notice`：`D:\Projects\Deepseek_Harness_Workspace\dsh_plugins\notice\index.js:24,27,460-547`；Client 半 `client.js:19-22` 直接 `window.__ModuleLoader__.load(...)`）。DSH 的沙箱只约束**被工具调用的子进程**与**文件写**（`$DSH/dsh/docs/subsystems/sandbox.md:9-23`；`$DSH/dsh/docs/subsystems/tools.md:829-845` 的 `tools/pre-execute`），插件自身的 JS 没有任何代码级隔离；DSH 文档还明确反对用 iframe 承载插件 UI（`$SKILL/dsh-doc/references/practices.md:33`）。因此：
   - **DSH 的 Host 插件（Node 半）不可能原样装进 Aurora**（Aurora 没有 Node 主进程能力）；
   - **DSH 的 Client 插件（纯 UI）最接近可移植**，但要求 Aurora 提供 `window.__ModuleLoader__` 同形加载器、slot 注册表、DSH 标准 props 投影，且只能在「页面内信任模式」下渲染。

3. **Aurora 需要的不是「DSH 插件格式」，而是「DSH 契约的子集 + 自己的信任边界」。**
   建议保留 Aurora 既有插件设计（`G:\work\projects\aurora-chat-app\docs\plugins.md:5-28,33-39,41-55`：`plugin.json`、权限、Worker/iframe、首次三步确认），把 DSH 契约当作**服务命名与 API 形状的参照**，再做一个正交的兼容适配层（Phase 3）。这样 DSH 插件迁移是「换壳 + 去 Node 依赖」，而 Aurora 自己的安全模型不被 DSH 的「安装即完全信任」降级。

4. **推荐路线（详见 §6）**：
   - Phase 1：把 Aurora 的 6 个服务扩到「DSH 可用的最小子集」（6 个既有 + 7 个新增：`sessions/tools/commands/storage/slots/locale/approval`，共 13 个；`transport` 属 Phase 2），**不改 UI 调用**即可先落地并单测；
   - Phase 2：按 `docs/plugins.md` 做装载器 + Worker/iframe 沙箱 + RPC + 三确认；
   - Phase 3：DSH 兼容适配层（`dsh-shim`：把 `package.json` 的 `dsh` 字段翻译成 Aurora manifest，把白名单 `ctx.*` 映射到 RPC）；先移植 `@local/dsh-usage-total`（纯 UI）与 `@local/dsh-notice`（Host 工具 + UI 卡片）验证两端。

### 0.3 一条必须写进结论的负面事实

DSH 的插件清单里**没有权限字段**：官方模板 manifest 只有 `name/version/exports/files/dsh.bundle/dsh.client`（`$SKILL/dsh-doc/templates/decoration/package.json:1-21`），安装也只有 `plugin_manager` 的 `install_bundle`（`$SKILL/dsh-doc/references/host-plugin.md:73-75`）。本机 55 个 `@local/*` 插件包（profile `dependencies` 计数 55，全部 `link:`）的 `package.json` 全部使用 `dsh` 字段、**无一个** `cordis` 或 `permissions` 字段（对 `D:\Projects\Deepseek_Harness_Workspace\dsh_plugins\**\package.json` 的 grep：`"cordis":` 0 命中、`"permissions":` 0 命中，`"dsh"/"bundle"/"client"` 139 命中）。所以「DSH 插件兼容」在 Aurora 里**不能继承任何现成的权限声明**，权限必须由适配层从代码静态分析 + 用户确认共同生成。

---

## 1. DSH 插件契约清单

### 1.1 安装形态：profile / bundle / patch

| 概念 | 事实 | 证据 |
|---|---|---|
| profile | 一个命名组合，存于 `$DSH_HOME/profiles/<name>/`，其 `package.json` 的 `dsh.profile.bundles` 是**有序** bundle 列表，profile 的 `node_modules` 只放用户装的包 | `$DSH/dsh/docs/architecture.md:15-23`；本机实际文件 `C:\Users\Administrator-Local\.dsh\profiles\desktop\package.json`（43 个 bundle = 2 个官方 + 41 个 `@local`；55 个 dependencies 全部 `link:D:/Projects/Deepseek_Harness_Workspace/dsh_plugins/...`） |
| bundle | 一个 npm 包，`package.json.dsh.bundle.patch` 指向 YAML patch；patch 用 `insert` 插入 Loader 行 | `$DSH/dsh/docs/architecture.md:21`；`$SKILL/dsh-doc/references/host-plugin.md:5-27` |
| patch 行字段 | `id`、`name`（包名）、`config`、`disabled`、`inject`、`intercept`、`isolate`；`group: true` 可嵌套；`!!js` 表达式按 ctx 求值 | `$SKILL/dsh-doc/references/composition-reference.md:5-19` |
| 覆盖语义 | 有 `id` 无 `insert` 的 patch 覆盖已有行；`config` **整体替换不深合并**；高优先级层 `overridden` | `composition-reference.md:9-11,20` |
| 安装 | `plugin_manager` `install_bundle`（本地目录绝对路径 / tgz）；桌面 GUI 是 Plugins → Add plugin；替换已安装包需重启加载新 JS 代 | `$SKILL/dsh-doc/references/host-plugin.md:30-56,73-75`；`$SKILL/dsh-doc/references/plugin-development.md:3` |
| 显示元数据 | `locale/<lang>.json` 的 `meta.title/description/detail` + `exports["./locale/*.json"]` + `exports["./icon"]`；图标 ≤256 KiB，必须在包内 | `$SKILL/dsh-doc/references/host-plugin.md:31-52` |
| 清单字段 | **只有 `dsh`，没有 `cordis`**：`dsh.bundle.patch`、`dsh.client{platform,immediately,inject,external}` | 同上 + `$DSH/dsh/docs/subsystems/client-modules.md:94`；本机 55 个插件包 grep 结果 |

> 对 Aurora 的含义：DST 的「插件包」= npm 包 + profile 层叠 patch；Aurora 的 `docs/plugins.md` 是「单个 `plugin.json` + zip/Entry 记录」。两者在**安装与版本管理**上没有共同点，适配层只能读 `package.json` 做一次性翻译（§5.1/§5.6）。

### 1.2 Host 插件入口形态

合法形态（`$SKILL/dsh-doc/references/host-plugin.md:58-65`；`$DSH/dsh/docs/cordis-api/registry.md:58-119`）：

1. `export function apply(ctx, config) {}`，可选 `export const inject = [...]`、`export const Config`；
2. Service 子类作为 default export（`class X extends Service { constructor(ctx){ super(ctx,'x') } }`，`$DSH/dsh/docs/cordis-api/service.md:6-12`）；
3. `export default { apply(ctx, config) {} }` 对象插件。

`inject` 可以是数组（只声明依赖）或对象（依赖 + intercept config），`$DSH/dsh/docs/cordis-api/registry.md:123-150`。`Config` 是 standard-schema 校验器，激活前校验（`host-plugin.md:65`），DSH 官方包用 `@deepseek-ai/schemastery`（`$DSH/dsh-tools/package.json:57`）；本机多数 `@local` 插件只用 `apply(ctx, config)` 没有 `Config`（如 `dsh-todo-list\index.js:613`）。

真实样例：

- `change-style`：`export const inject = ['tools']`（`index.js:27`），`apply` 里 `ctx.effect(() => ctx.tools.register({...}))`（`index.js:257-258`）。
- `notice`：`inject = ['tools','webServer','sessionController','agents']`（`index.js:27`），3 条精确 HTTP 路由（`index.js:460-547`）+ 1 个工具（`index.js:567`）。
- `dsh-todo-list`：`inject = ['tools']`（`index.js:40`），4 个工具一次性注册并在 effect 里成对 dispose（`index.js:613-628`）。

### 1.3 Cordis ctx API（框架层）

| API | 语义 | 证据 |
|---|---|---|
| `ctx.effect(execute, label?)` | 注册一个带清理的副作用，`execute` 立即执行，返回的 disposer 在 fiber 卸载或手动调用时**逆序**执行；重复调用幂等；fiber 已销毁时抛 `INACTIVE_EFFECT` | `$DSH/dsh/docs/cordis-api/fiber.md:8-37` |
| `ctx.on(name, listener, options?)` | 注册监听，返回移除 disposer；`prepend`/`global` 选项 | `$DSH/dsh/docs/cordis-api/events.md:125-147,173-187` |
| `ctx.once` | 同上，只触发一次 | `events.md:149-171` |
| `ctx.emit(name, ...args)` | 同步派发，忽略返回值 | `events.md:31-49` |
| `ctx.parallel` | 等所有监听完成（并发） | `events.md:8-29` |
| `ctx.serial` | 顺序 await，遇到第一个 bail 值停止 | `events.md:51-72` |
| `ctx.bail` | 顺序同步，遇 bail 停止 | `events.md:74-95` |
| `ctx.waterfall(name, ..., next)` | 中间件：监听器拿到 `next`，调 `next()` 委派，不调即短路（否决） | `events.md:97-123`；语义说明 `$DSH/dsh/docs/cordis-primer.md:29-35` |
| `ctx.plugin(plugin, ...config)` | 在当前 ctx 加载插件，返回 Fiber（可 await 等加载完成） | `$DSH/dsh/docs/cordis-api/registry.md:35-56` |
| `ctx.inject(deps, cb)` | 等依赖就绪再跑 cb，依赖变化时卸载重跑；返回 Fiber | `registry.md:8-33` |
| `ctx.get(name, strict?)` | 读服务（不声明依赖），默认只返回活跃提供者 | `$DSH/dsh/docs/cordis-api/context.md:237-259` |
| `ctx.set(name, value)` | 只有提供者 fiber 能覆写 | `context.md:261-284` |
| `ctx.provide(name, value)` | 注册服务实现，返回注销 disposer；同 scope 重复 provide 抛错 | `context.md:286-314` |
| `ctx.accessor(name, {get,set})` | 定义计算属性，fiber 卸载时移除 | `context.md:316-338` |
| `ctx.mixin(name, mixins)` | 把服务成员直接挂到 ctx（`ctx.on` 就是这种方式混入的） | `context.md:340-364` |
| `ctx.extend(meta?)` | 派生 child context（原 ctx 不变） | `context.md:14-37` |
| `ctx.isolate(name, label?)` | 为某服务建立独立作用域（同 label 合并） | `context.md:39-66` |
| `ctx.intercept(name, config)` | 给下方插件合并该服务的 intercept config | `context.md:68-96` |
| `ctx.root` / `ctx.fiber` / `ctx.registry` / `ctx.reflect` / `ctx.events` / `ctx.logger` | 环境句柄；`ctx.logger(name)` 取具名 logger | `context.md:98-162`；`fiber.md:39-48` |
| `ctx.fiber.entry` | 当前 profile 行（config editor 用它定位要改的 patch） | `$SKILL/dsh-doc/references/configuration.md:5-10` |
| `fiber.update/restart/dispose/effectiveConfig` | 配置更新、重载、卸载、读当前配置 | `fiber.md:271-327,102-111,223-247` |
| 框架继承 API 汇总（含 `ctx.timer/interval/timeout/throttle/debounce`、`ctx.loader`） | 见 inherited 页 | `$DSH/dsh/docs/cordis-api/inherited.md:10-20` |
| 框架内部事件（`internal/plugin`、`internal/status`、`internal/service`、`internal/update`、`internal/commit`、`internal/config`、`internal/get`、`internal/set`、`internal/listener`、`internal/dispatch`、`exit`、`loader/*`） | 插件一般只读/监听 | `inherited.md:22-39` |

### 1.4 Harness 服务表（插件真正依赖的 ctx key）

下表是 DSH 0.2.2-rc.3 文档里生成的 Cordis API 目录；「关键方法」只列与插件相关者，方法签名以引用行附近为准。

| ctx key | 服务 | 关键方法 / 说明 | 证据 |
|---|---|---|---|
| `ctx.agents` | `AgentRegistry` | `get(id)`、`list()`、`create/resume`、`currentInitiator()`、`withInitiator()`、`turnBoundaryOf(session)`；Agent 句柄有 `send/followup/steer/inject/cancel/whenIdle/runMaintenance/ctx` | `$DSH/dsh/docs/subsystems/core.md:684-840`；Agent 接口 `core.md:59-145` |
| `ctx.agentLoop` | `AgentLoop` | 默认 driver 的 create/resume（扩展插件不依赖它） | `core.md:537-573` |
| `ctx.agentPresets` | `AgentPresetRegistry` | `list/register/mount/select/…`（preset 组合） | `core.md:577-680` |
| `ctx.agentDefaultModel` | 默认模型选择 | `currentSelection/saveSelection` | `core.md:512-533` |
| `ctx.sessions` | `SessionStore` | `create/prepare/enter/announce/flush/get/list/fork`、`registerMessageProjection` | `$DSH/dsh/docs/subsystems/session.md:1104-1247` |
| `ctx.sessionController` | Session 控制器（Remote 包装） | 插件常用 `projections()`、`inspect()`、`prompt()`（notice 实测：`notice/index.js:328-329,337,388`） | `session.md:876`（服务头） |
| `ctx.sessionProjections` | 投影注册表 | `register(definition)`、`onChanged`、`snapshot(session, keys?)`；`apply(state,event)` 纯函数、`view()` 返回同引用抑制发布 | `$DSH/dsh/docs/subsystems/session-projection.md:334-399`；实践 `$SKILL/dsh-doc/references/practices.md:26-28` |
| `ctx.sessionProjectionCache` | 投影缓存 | `cachedSnapshot/hydratePrepared/write/coldSnapshot` | `session-projection.md:247-326` |
| `ctx.tools` | `ToolsService` | `register(def, {when?})`、`restrict`、`get`、`executable`、`resolve`、`definitions`、`schemas`、`setExecutor`、`execute(batch)`、`guard`、`checkGuards` | `$DSH/dsh/docs/subsystems/tools.md:650-750` |
| `ctx.commands` | `CommandRuntime` | `register(definition)`、`registerFileReceiptResolver`、`list(agent)`、`find`、`execute(agent, line, …)`；命令**不进模型回合** | `$DSH/dsh/docs/subsystems/commands.md:133-196` |
| `ctx.systemPrompt` | `SystemPrompt` | `section()`、`context()`、`tools(provider)`、`variable()`、`assemble()` | `$DSH/dsh/docs/subsystems/system-prompt.md:120-206` |
| `ctx.llm` | `LlmRuntime` | 适配器/模型注册（`llm/stream` waterfall） | `$DSH/dsh/docs/subsystems/llm-streaming.md:1022` |
| `ctx.settings` | `SettingsForms` | `configure({auto})`、`describe`、`update/replace/mutate`；把插件 `Config` 投影成设置表单 | `$DSH/dsh/docs/subsystems/settings.md:27-71` |
| `ctx.settingsController` | 设置 Remote | `describe/update/replace/mutate/openSettingsDocument` | `settings.md:77-129` |
| `ctx.storage` | `Storage` hub | `mount(form, facility)`、`form(form)` | `$DSH/dsh/docs/subsystems/storage.md:182-204` |
| `ctx.storageDomain` | `DomainFacility` | `open(spec)`、`get(name)`、`closeAll()`；`domain/changed` 事件 | `storage.md:206-273` |
| `ctx.approval` | `ApprovalService` | `request(req)`（要求 session 处于打开的 turn）、`setPolicy`、`overrideOf`；只有 `allowed-once` 是授权 | `$DSH/dsh/docs/subsystems/approval.md:86-140` |
| `ctx.sandbox` | `SandboxProvider` | `confine(argv, policy, signal)`：把要 spawn 的 argv 包成受限 argv，失败即 fail-closed | `$DSH/dsh/docs/subsystems/sandbox.md:176-196` |
| `ctx.sandboxPolicy` | `SandboxPolicyService` | `resolve({session, mode?})`、`registerWritableRoot`、`overrideOf` | `sandbox.md:202-240` |
| `ctx.webServer` | `WebServer` | `register(route)`、`registerUpgrade`、`registerFallback`、`tapIndex`、`renderIndex`、`collectIndexInjections` | `$DSH/dsh/docs/subsystems/web-server.md:203-294` |
| `ctx.connection` | `HostConnectionHandle` | `createSharedFetchHandler('/api')`、`requestRejection`、`admit`、`createPeer`、`authorizeIndex`、`authenticatedUrl` | `web-server.md:120-178` |
| `ctx.clientModules` | `ClientModuleRegistry` | `graph()`、`clientPath`、`fetchBundle`、`rebuilt`、`onGraphChanged`（扫描 `dsh.client`、生成 boot 图、服务 `/plugins` 路由） | `$DSH/dsh/docs/subsystems/client-modules.md:136-203` |
| `ctx.credentials` | `CredentialProvider` | 凭据引用与解析（密钥值不进取值，`configuration.md:11`） | `$DSH/dsh/docs/subsystems/credentials.md:137` |
| `ctx.jobs` | `JobRegistry` | 后台作业（工具 `job_*` 消费） | `$DSH/dsh/docs/subsystems/jobs.md:443` |
| `ctx.subagents` | `SubagentRuntime` | 命名 provider 注册与 delegate | `$DSH/dsh/docs/subsystems/subagent.md:439` |
| `ctx.skills` | `SkillRegistry` | `skills/change` 事件 | `$DSH/dsh/docs/subsystems/skills.md:268` |
| `ctx.tokenMeter` | 用量测量 | 见子系统页 | `$DSH/dsh/docs/subsystems/token-meter.md:104` |
| `ctx.workspaceRegistry` / `ctx.workspaceFiles` | 工作区注册与文件 | 见子系统页 | `$DSH/dsh/docs/subsystems/workspace.md:445,520` |
| `ctx.web` | Web 能力 seam | 搜索/抓取 provider | `$DSH/dsh/docs/subsystems/web.md:156` |
| `ctx.fs` | 文件系统 seam | 读/写/编辑 + `fs/*` policy 事件 | `$DSH/dsh/docs/subsystems/filesystem.md:398` |
| `ctx.shell` | shell 执行 seam | 见子系统页 | `$DSH/dsh/docs/subsystems/shell.md:247` |
| `ctx.goals` / `ctx.schedule` / `ctx.planMode` / `ctx.sessionTitle` | 产品能力 | 见子系统页 | `goal.md:176`、`schedule.md:150`、`plan.md:51`、`session-title.md:166` |
| 客户端：`ctx.slots` / `ctx.locale` / `ctx.remote` / `ctx.uiRenderer` / `ctx.layout` / `ctx.sessions`(client) / `ctx.configForms` | 浏览器侧服务 | `ctx.slots.register/inject`；`ctx.remote.<ns>`；`ctx.locale.register/bind` | `$DSH/dsh/docs/subsystems/slots.md:29-52`；`$DSH/dsh/docs/subsystems/web-client.md:28-34,60-64`；`$DSH/dsh/docs/subsystems/packages.md:88,97`；usage-total `client.js:473-497` |

### 1.5 事件目录（dispatch mode 是公开契约）

派发模式定义：`emit`（同步、无返回）、`waterfall`（中间件）、`parallel`（并发 await）、`serial`（顺序 await、首个非空返回即 bail）、`bail`（同步首个 bail），`$DSH/dsh/docs/cordis-primer.md:15-25`。

| 事件 | mode | 用途 | 证据 |
|---|---|---|---|
| `agent/created` | serial | 新 Agent 就绪（插件在此按 agent 注册，用 `agent.ctx`） | `core.md:875-894`；`practices.md:19` |
| `agent/disposed` | emit | Agent 离开注册表 | `core.md:902-916` |
| `agent/status` | emit | idle/running 状态迁移 | `core.md:1069` |
| `agent/pre-step` | waterfall | 进入/拒绝一个 step，可改写消息批次 | `core.md:1014` |
| `agent/turn-stopping` | serial | 回合将停（唯一能"停回合"的扩展点） | `core.md:1092` |
| `agent/request-error` | waterfall | 请求失败后的重试钩子 | `core.md:1040` |
| `agent/inbox/{inserted,claimed,discarded}` | emit | 收件箱事实 | `core.md:948-1013` |
| `agent/assistant-stream` | emit | 流式 token 发布（仅进程内） | `core.md:852-866` |
| `agent/error` | emit | step/turn 错误 | `core.md:924-939` |
| `session/event` | emit | 每个已提交会话事件的广播 | `session.md:1408` |
| `session/created` / `session/disposed` | emit | 会话生命周期 | `session.md:1360,1386` |
| `session/flush` | parallel | 持久化检查点 | `session.md:1435` |
| `tools/pre-execute` | waterfall | allow / deny / cancel / ask（`ask` 需要审批，缺失即拒绝） | `tools.md:829-845`；决策类型 `tools.md:543-558` |
| `tools/execute` | waterfall | 包围 dispatch（超时/重试/指标），只能改 `exec.signal` | `tools.md:780-796` |
| `tools/post-execute` | waterfall | 接受/替换/阻断结果 | `tools.md:804-821` |
| `tools/result` | emit | 观察最终冻结结果 | `tools.md:880-893` |
| `tools/change` | emit | 工具注册变化 | `tools.md:762-773` |
| `commands/change` | emit | 命令注册变化 | `commands.md:208-220` |
| `system-prompt/assemble` | waterfall | 最终提示词装配（文档明确要求不要用它增删工具） | `system-prompt.md:216-234`；`practices.md:17` |
| `approval/request` | waterfall | 审批应答者链（返回 outcome 即认领，`next()` 委派） | `approval.md:152-164` |
| `settings/document-updated` | emit | 设置表单失效通知 | `settings.md:139-152` |
| `domain/changed` | emit | 存储域写入（后置通知） | `storage.md:259-272` |
| `webserver/index-inject` | emit | 收集 index.html 注入行 | `web-server.md:329-339` |
| `connection/request` | waterfall | 已认证的 `/api` 请求准入/包裹 | `web-server.md:305-318` |
| `subagent/start` / `subagent/end` / `subagent/provider-*` | emit | 子代理生命周期 | `subagent.md:628-683` |
| `goal/changed` / `goal/activation-changed` | emit | 目标状态 | `goal.md:277,294` |
| `schedule/changed` | emit | 提醒变化 | `schedule.md:282` |
| `skills/change` | emit | 技能注册变化 | `skills.md:336` |
| `llm/stream` | waterfall | 模型流拦截（适配器） | `llm-streaming.md:1236` |
| `llm/adapters-updated` / `llm/models-updated` | emit | 适配器目录变化 | `llm-streaming.md:1198,1219` |
| `fs/write-intent` / `fs/edit-intent` / `fs/delete-intent` | waterfall | 文件策略闸门 | `filesystem.md:628-706` |
| 客户端：slot 生命周期由 `ctx.slots.inject()` 跟随声明 owner 折叠/重装 | — | 不贡献到未声明的 slot 会在激活期失败 | `slots.md:19-28` |

### 1.6 注册点清单（插件能"往宿主里加什么"）

| 注册点 | API | 要点 | 证据 |
|---|---|---|---|
| 模型工具 | `ctx.tools.register(def, opts)` | 定义需 `name/description/parameters/output/execute`；`output` 必填、`timeoutMs` 校验；返回**精确 disposer** | `tools.md:650-663,161`；真实定义 `notice/index.js:567-629`、`change-style/index.js:258-356` |
| 工具策略 | `ctx.tools.guard()` / `restrict()` / `tools/pre-execute` | guard 只能收紧、无 allow 结果 | `tools.md:737-749,458-480` |
| 人类命令 | `ctx.commands.register({name, description, input?, handler})` | `name` 小写不带 `/`；handler 拿 `CommandInvocation{commandId, agent, rawInput, attachments, signal}`；结果为 `{kind:success|error, text?, sourceEventSeq?}` | `commands.md:33-91` |
| 设置页 | `ctx.settings.configure({auto}, owner?)` + `Config` | Config schema 自动投影成表单；该实例只能注册一次 | `settings.md:31-38`；`host-plugin.md:62-65` |
| 持久存储 | `ctx.storageDomain.open(spec)` | 需先有 backend + `kv` facet；`open` 后由调用方 `close()`（通常作为自己的 effect disposer） | `storage.md:206-248` |
| 会话投影 | `ctx.sessionProjections.register(def)` | `apply` 必须纯、同步、忽略事件时返回同引用；`stateVersion` 变更语义时递增；awatable 句柄 | `session-projection.md:334-356`；`practices.md:26-28` |
| 系统提示词 | `ctx.systemPrompt.section({name, order, text|provider})`、`.context()`、`.variable()` | 可被 scoped 同名 section 影子覆盖 | `system-prompt.md:124-182` |
| 每 agent 上下文 | `agent.inject(message)` | 不唤醒 agent，进入下一个被接纳的 step | `core.md:135-143`；`practices.md:18` |
| 按 agent 作用域 | `agent.ctx`（在 `agent/created` 里拿） | 卸载插件**不会**自动 dispose `agent.ctx` 的注册，必须自己持有 disposer | `practices.md:19` |
| UI（Client） | `ctx.slots.register({name, id, order, priority?, inject?}, Component)` + `ctx.slots.inject(key, cb)` | 只能注册到已声明的 slot；组件不接收 `ctx`，通过 `inject` 工厂拿数据 | `slots.md:29-52,101-132` |
| Client 本地化 | `ctx.locale.register(ns, {zh, en})` / `ctx.locale.bind(ns)` | 真实用法见 usage-total `client.js:473-475`、notice `client.js:79-85` | 同左 |
| HTTP 路由 | `ctx.webServer.register({kind:'exact'|'prefix', path, handler})` | 重复 `(kind,path)` 抛错；请求鉴权不自带，需配合 `ctx.connection.requestRejection/admit` | `web-server.md:203-241,120-178`；真实用法 `notice/index.js:460-547` |
| Host→Client RPC | `@Remote` / `@RemoteScope` 装饰器 + 生成产物 | 编译期代码生成（Typert），客户端以 `ctx.remote.<ns>.<method>` 调用；`POST /api/<ns>/<method>`，流式走 `/api/remote.mux` | `$DSH/dsh/docs/api-gateway.md:9-17,58-62,126-134` |
| 后置观测 | `tools/result`、`session/event`、`agent/*` | 只能观测，不能改历史（历史必须可重放重建） | `$DSH/dsh/docs/architecture.md:130`；`practices.md:7` |

### 1.7 Host RPC 与传输

1. **业务方法的官方 RPC**：Host 服务方法加 `@Remote('name')`，构建期生成 strict descriptor + codec；Client 侧 `ctx.remote.<namespace>.<method>` 是**普通函数**（非 Proxy），有生成类型。调用走 `POST /api/<namespace>/<method>`，payload 仅 `{args}`；流式方法 `{mode:'stream'}` 走 `/api/remote.mux` WebSocket，支持 Client→Host uplink。复杂对象不能直接过线，必须声明 `TypertLookupMap` 并有 lookup provider（如 `agent` → `agentId`）。（`$DSH/dsh/docs/api-gateway.md:9-17,58-62,126-134`）
2. **插件自定义精确路由**：`ctx.webServer.register` 注册自己的 HTTP/SSE 路由（`notice` 用 3 条：state/action/events，`index.js:460-547`）；插件自己校验 method/content-type/body 上限。鉴权方面 carrier 本身不做认证，`ctx.connection` 提供 `requestRejection/admit/authorizeIndex` 供宿主 API 路由使用（`web-server.md:102,120-178`）。
3. **Client 半如何拿数据**：两条路——(a) Typert Remote（`ctx.remote`）；(b) 插件自己的精确路由 + `fetch`/SSE（notice 的 Client 半就是轮询 + SSE，`notice/client.js:26-33`）。DSH 不提供「Worker postMessage RPC」这种形态，因为 Client 插件本身就在页面里。
4. **启动注入**：Host 把 `WebBootGraph` 写进 `window.__DSH_BOOT__`，由 `webserver/index-inject` 收集；页面启动时预取 `immediately` 行、挂 vendored Cordis Loader、按服务注入激活（`web-client.md:22-26`；`client-modules.md:9-104`）。

### 1.8 Client 插件（UI 半）契约

| 项 | 事实 | 证据 |
|---|---|---|
| 清单 | `package.json.dsh.client = { platform: 'web', immediately?: true, inject?: [包名], external?: [模块] }`，且 `exports["./client"]` 指向构建产物 | `client-modules.md:94`；模板 `$SKILL/dsh-doc/templates/decoration/package.json:13-20`；真实 `dsh-usage-total\package.json:21-30` |
| 浏览器产物格式 | 调用全局 `window.__ModuleLoader__.load({ id, factory(require) {...} })`，factory 内 `require('react')`，返回 Cordis 插件对象 `{inject:['slots'], apply(ctx){...}}` | 模板 `templates/decoration/client.js:1-22`；notice `client.js:19-22` |
| 加载路由 | `GET /plugins/??<pkg-a>/client.js,<pkg-b>/client.js&rev=<rev>`；单资源同形；`/plugins/<pkg>/assets/<path>` 供图片；首次 GET 拼接并缓存 | `client-modules.md:104` |
| UI 组合 | slot 声明式注册；组件拿到的 props 由绑定点装配：owner values、`PropsRuntime`、注入的 store/hooks/locale；**组件不接收 `ctx`** | `slots.md:85-132` |
| 标准 props（session scope） | `sessionId/useSession/useProjection/useAccess/useConversation/useInput/inputActions/useChat/useTrajectory`；root 还有 `useSessions/useSessionStatus/useWorkspaces/useRemoteAccess/usePanelInfo` | `slots.md:103-120` |
| slot 层级（节选） | `root` → `main[key=conversation]` → `main.conversation` → `conversation.composer(.bar)`（含 `.input.left/right`、`.input.overlay`、`.composer.dock`）、`conversation.chat.node`、`sidebar.*`、`shell.overlay` | `slots.md:134-217` |
| 主题与 locale | 必须用宿主 `--dsw-alias-*` token；UI 文本走 `ctx.locale`；**不允许** Host 出 HTML 再 iframe 嵌入 | `$SKILL/dsh-doc/references/practices.md:33-35`；`$SKILL/dsh-doc/references/ui-plugin.md:5-13` |
| 热更新 | 新 bundle 通过 HMR 图刷新；替换已装包需重启；Client 模块按 revision 缓存 | `client-modules.md:122-124`；`host-plugin.md:75` |

### 1.9 权限 / 沙箱模型（DSH 的真实边界）

- **插件代码本身不受沙箱约束**：Host 插件在 Electron Host 的 Node 环境执行（`architecture.md:51-53`），可以直接 `import 'node:crypto'`、读文件、发网络请求（`notice/index.js:24` 即 Node 内置模块）；Client 插件是**页面内**的同域脚本（`client.js` 直接操作 DOM、注册 React 组件）。DSH 没有 iframe/Worker 级别的插件隔离，文档还明确反对用 iframe 承载插件 UI。
- **沙箱只约束"被工具调用的执行"**：`SandboxMode = read-only | workspace-write | danger-full-access` 只约束文件效果（`sandbox.md:9-23`）；`ctx.sandbox.confine()` 把子进程 argv 包成受限 argv，失败即 fail-closed（`sandbox.md:176-196`）；`dsh-fs-sandbox` 对 fs 写/编辑按 per-call 模式隔离，读放行（`$DSH/dsh/docs/subsystems/packages.md:263`）。
- **审批是"每次调用一次授权"**：`ctx.approval.request()` 要求 session 处于打开的 turn，只有 `allowed-once` 是授权；`ask` 在没有审批通道时直接降级为拒绝（fail-closed）。`approval/request` 是 waterfall，第一个返回 outcome 的应答者认领。（`approval.md:86-88,100-140；tools.md:543-558`）
- **没有权限声明**：manifest 无 `permissions` 字段（§0.3）。用户"批准"发生在安装 bundle 时（Plugins 界面）与运行时工具审批，而不是按能力声明。

### 1.10 生命周期与卸载

1. 插件加载 = `ctx.plugin()` 创建 Fiber；所有注册都挂在 Fiber 上（`fiber.md:8-37`）。
2. 卸载 = `fiber.dispose()`：逆序执行 disposer；`ctx.effect` 返回的 disposer 幂等；卸载后 `ctx.effect` 抛 `INACTIVE_EFFECT`（`fiber.md:8-37,102-111`）。
3. 配置更新：`fiber.update(config)` 走 `internal/update` waterfall，默认重启实例；`.volatile()` 字段原地更新不重启（`$DSH/cordis/README.md:103-111`；`settings.md:9-15`）。
4. 插件自己改配置必须走 config editor：`ctx.get('configEditor').edit(ctx.fiber.entry, fn)`，禁止自己读写 profile 的 `cordis.patch.yml`（`$SKILL/dsh-doc/references/configuration.md:3-10`）。
5. HMR：base 组合启用 config-only HMR（改 patch 生效）；改 JS 代码需要 `fiber.restart()` 或重装/重启（`architecture.md:27`；`host-plugin.md:75`）。
6. 多所有者陷阱：注册在 `agent.ctx` 上的东西有两个 owner（agent 销毁 / 插件卸载），插件必须自己持有 disposer（`practices.md:8,19`）。
7. 数据不跟着插件走：DSH 没有「插件卸载即清理数据」的约定；`dsh-todo-list` 把数据放 `$DSH_HOME/plugin-data/<plugin>`（`dsh-todo-list\index.js:606-616` 注释）。

---

## 2. Aurora 服务现状

### 2.1 Cordis 容器（Phase 1 已完成）

- 入口：`createAppContext()` → `new Context()` → 按顺序 `ctx.plugin(plugin)` 六个内置服务（`$AURORA/src/app/context.ts:141-147`）；再用 `ctx.inject([六个服务名], captureServiceScope)` 得到「全部就绪」的子上下文（`:158-161`）。
- 服务类型：`AppServicePlugin<K> = { name, inject: string[], apply(ctx) }`，插件名 = 服务名 = `ctx.provide` 的名字（`$AURORA/src/services/plugins/types.ts:8-13`；`context.ts:24-35`）。
- 类型声明合并：`declare module 'cordis' { interface Context { settings... } }`（`context.ts:54-68`），并手工补了 `provide` 的 d.ts（`:62-66`，因为 4.0.0-rc.13 的 d.ts 没声明）。
- 启动：`start()` 逐个 `await fiber`，收集错误后再按 `fiber.state === 2` 判 ACTIVE，构造 `AppContextStartError`（含 missing 列表），失败时抛错并打印（`context.ts:104-112,209-259`）；`FIBER_ACTIVE = 2` 是硬编码常量（`:70-71`）。
- 卸载：先 `scopeFiber.dispose()`，再逆序 dispose 六个服务，单个失败只 console.error（`context.ts:170-187`），`pagehide` 自动触发（`:189-207`）。
- 单例与重试：`getAppContext()` 首次创建（`:286-289`）；`resetAppContext()` 换新容器（`:296-306`）。
- React 桥：`<AppServicesProvider>` + `useAppContext()` + `useAppService(name)`（`$AURORA/src/app/AppServices.tsx:18-33`）。**全仓 grep：`useAppService` 除定义外 0 处使用**——Phase 1 只搭了容器，UI 仍直接 import store。

### 2.2 六个内置服务

| 服务 | 职责 | 对外 API（转发） | inject | dispose | 证据 |
|---|---|---|---|---|---|
| `settings` | 本机设置（localStorage） | `getState/subscribe/setApiKey/setLocale/setThemePreference/setThinking/setSearch/setSiderCollapsed/acceptDisclaimer/isChineseBrowser` | — | 空 | `$AURORA/src/services/plugins/settings.ts:26-66`；设置项定义 `src/services/settings.ts:11-40` |
| `api` | 请求入口 | `API_ORIGIN/ApiError/request/streamChat/streamMessage/verifyApiKey/uploadFile/deleteFile/supportsFileUpload/getApiKey` | `settings` | 空（流由调用方 AbortSignal 负责） | `plugins/api.ts:21-58` |
| `presets` | 预设 CRUD/激活/zip | `init/getState/subscribe/activate/importZip/saveJson/createDraft/remove/getActive/getActiveResolved/loadConfig` | — | 空（objectURL 不 revoke） | `plugins/presets.ts:24-65` |
| `style` | 样式包 | `init/getState/subscribe/activate/importZip/restoreDefault/remove/applyVars` | `settings` | 空（主题订阅未 unbind） | `plugins/style.ts:20-56` |
| `memory` | sql.js 记忆库 | `tools/sections/init/setEnabled/flush/runTool/getState/subscribe/list/search/write/remove/getStats` | — | `flushMemory()`（防抖落盘） | `plugins/memory.ts:27-73` |
| `usage` | 用量 | `init/record/list/listAll/clearLog/reset/getState/subscribe` | — | 等所有进行中的写事务 | `plugins/usage.ts:23-71`（`pendingWrites` 轨道 `:44-52`） |

共同问题（Phase 1 明确留下的）：六个服务都是**模块级 zustand store 的转发**，没有状态所有权转移；`inject` 只表达了 `api→settings`、`style→settings` 两条真实依赖（`context.ts:45-52`）。

### 2.3 未服务化的业务模块（真正的服务边界）

| 模块 | 职责 | 现状 | 插件化难度 |
|---|---|---|---|
| `services/chat/**` | 会话状态、流式回复、工具循环、压缩、多窗口同步、历史归档 | zustand store（`store.ts` 52 KB）+ 纯函数模块；`initChat`、`sendMessage`、`stopReply`、`regenerateReply`、`editMessage`、`selectMessageVersion`、`continueReply`、`renameSession`、`removeSession`、`newChat`、`selectSession` 等 17 个导出（`$AURORA/src/services/chat/store.ts:160,345,408,415,478,579,630-637,646,678,736,742,820,846,879,891,929`） | **高**：它是 Aurora 的「session 层」，DSH 里对应 `ctx.sessions`+`ctx.sessionController`+`ctx.sessionProjections` 三个服务；必须做门面而不是重写 |
| `services/api/providers/**` | 三协议适配（anthropic/openai/responses）、SSE、错误分类 | 静态注册（`providers/index.ts`），无运行时注册表 | 中：抽成 provider registry 即可 |
| `services/preset/**` | 预设清单/zip/IndexedDB/解析 | 已有独立 store 与类型（`preset/types.ts:143-253`） | 低 |
| `services/style/**` | 样式包 apply/effects/editor/zip | 已有 store/类型（`style/types.ts:419-457`） | 低-中（DOM/CSS 副作用） |
| `services/memory/**` | sql.js + IndexedDB 快照 | 已有 store/schema | 低 |
| `services/usage/**` | 用量记录/统计/导出 | 已有 store（`usage/store.ts:12-54,181-291`） | 低 |
| `services/attachments.ts`、`services/chat/history/**` | 附件、会话归档导入导出 | 独立模块，直接 IndexedDB | 中 |
| `services/update/**`、`services/speech/**`、`services/markdown/**` | 更新检查、朗读、渲染 | 与插件系统关系弱 | 低（可不服务化） |

### 2.4 启动 / 卸载顺序（实际）

- 启动 effect：`bootstrapApp({start, fromServices, fromFallback})`（`$AURORA/src/app/App.tsx:133-154`）→ `start()` 成功用服务、失败退回直连模块（`bootstrap.ts:94-104`）→ `runBootstrap`：`initChat/style.init/usage.init` 并行；先订阅 presets，等 `presets.init()` 完成后按 `getMemoryEnabled()` 初始化 memory；随后 `ensureApiKey`（`bootstrap.ts:66-91`）。
- 卸载：`ctx.dispose()` 逆序六个服务；UI 层 `disposeBootstrap()` 取消预设订阅（`App.tsx:150-153`）。
- 两个容器级兜底：`AppContextStartError` 显示在顶部并支持「重试 = 换新容器」（`App.tsx:156-160,168-176`）；`bootstrapApp` 装配失败也走同一套直连初始化。
- 退出语义：`pagehide` 触发 dispose（`context.ts:189-207`），但**无 beforeunload 同步 flush**；`usage` 用 pending 集合等落盘（`plugins/usage.ts:65-67`）。

### 2.5 UI 组合现状（无 slot）

- 组件目录：`base/chatInput/files/markdown/messages/search/session/settings/sider/style-editor`（`$AURORA/src/components/`），全部**直接 import store**（如 `App.tsx:3-36` 一口气 import 了 chat store、settings、style store、preset store、usage store、memory store、toast/notice 等）。
- `SettingsDialog` 的导航是**硬编码数组** `sections: {value, label, icon}[]`（`$AURORA/src/components/settings/SettingsDialog.tsx:70-110`），内容区固定渲染 `UsageSection/StyleSection/PresetSection/AboutSection`（`:250-256`）——没有可注册的 section 列表。
- 消息操作：`AssistantMessage` 里有 `CopyButton/ReadAloudButton/BranchSwitcher` 等直接 import 的按钮（`$AURORA/src/components/messages/`），没有「工具条注册点」。
- 输入区：`ChatInput` 有语音/思考/搜索/附件按钮，但没有 dock 列表。
- 主题：`theme.ts/theme.css + data-theme`（`$AURORA/src/app/theme.ts`），无第三方主题 token 契约；样式包自己写 CSS 变量。
- i18n：`i18n/index.ts` 的键由 TypeScript 类型保证（`docs/architecture.md:105`），**外部插件无法在运行时加 key**。

### 2.6 现有插件机制（设计稿）

`docs/plugins.md` 已经定义了目标形态（未实现）：

- 包结构：`plugin.json` + `index.js`（service 型）+ `ui/index.js`（ui 型）+ 图标/LICENSE（`docs/plugins.md:5-12`）。
- manifest：`schema/id/name/version/author/description/type(service|ui)/entry/permissions/requestedSandbox(worker|iframe|none)/engines`（`:14-28`）。
- 权限在 **RPC 层**强制，未声明能力直接拒绝并记日志（`:30`）。
- 沙箱级别：worker（默认 service 型，无 DOM/localStorage/直接网络，只能走白名单 RPC）、iframe（默认 ui 型，`sandbox="allow-scripts"`，postMessage 渲染）、none（显式信任，永久标注未隔离）（`:33-39`）。
- 首次安装三步确认：风险告知 → 清单/权限勾选 → 风险自负勾选；三步确认按钮在「左/中/右」随机分配、步骤间 ≥800 ms 冷却、不能键盘 Enter 跳过；`localStorage` 记录首次完成（`:41-55`）。
- 运行时：内部六服务 Cordis 化；service 型在 Worker 里跑、宿主提供 `ctx.plugin.call(...)` 受限接口；ui 型在 iframe 里跑、postMessage RPC；崩溃/超时捕获并禁用；卸载 terminate worker/移除 iframe/删 IndexedDB/释放 objectURL（`:57-63`）。
- 阶段：`cordis-refactor`（已完成）→ `plugin-runtime`（清单/安装 UI/三确认/Worker RPC/iframe 挂载）→ `plugin-direct`（可选无隔离）（`:65-69`）。

> 结论：Aurora 的插件设计**比 DSH 更严格**（DSH 没有权限/沙箱/三确认）。兼容层要做的是「把 DSH 契约投影到这套更严格的模型」，而不是反过来。

### 2.7 可插件化的边界（按改动成本排序）

1. **纯服务（低风险）**：settings / presets / style / usage / memory / api——已是服务，补齐 schema/事件/命名空间即可。
2. **需要门面的核心（中高风险）**：chat/session 层。它是 UI 的中心状态，插件（无论 DSH 还是 Aurora 原生）都要读它；Phase 1 只能做**只读投影 + 动作转发**，不能搬状态。
3. **UI 挂载点（中风险）**：settings.section / composer.dock / message.action / sidebar.panel / shell.overlay 五处即可覆盖 `notice`、`usage-total`、`todo-list` 三类真实插件；需要把 `SettingsDialog`、`ChatInput`、`AssistantMessage`、`App` 各改一处渲染循环。
4. **模型工具（中风险）**：Aurora 目前**没有**通用工具注册：唯一的工具循环是 chat store 里硬编码的 memory 工具（`docs/architecture.md:72-81`「工具循环：runMemoryTool → tool_result → 续写（≤3 轮）」）。要做 DSH `ctx.tools` 兼容必须新写注册表 + 执行循环。
5. **不可插件化（明确排除）**：更新检查、桌面壳 IPC、Android WebView 能力、sql.js 具体实现细节——这些属于产品内核。

---

## 3. 兼容矩阵

级别定义：

- **原生**：Aurora 已有等价能力，DSH 插件代码/调用可直接工作（最多改 import）。
- **适配层**：语义不同但可用 shim 桥接；需要写映射代码，插件代码改动有限。
- **需重写**：能力在 Aurora 里不存在或环境根本不同，插件对应部分必须改写才能工作。
- **不支持**：无法在本机浏览器环境中实现，插件必须移除该能力（或只保留降级形态）。

### 3.1 Cordis 框架层

| DSH API | Aurora 对应 | 级别 | 原因 | 替代 / 适配 |
|---|---|---|---|---|
| `ctx.plugin / ctx.inject / ctx.get / ctx.provide / ctx.effect / ctx.on / ctx.emit / ctx.parallel / ctx.serial / ctx.bail / ctx.waterfall` | 同一个 Cordis，但版本 4.0.0-rc.13（`$AURORA/package.json:29`） | 原生（需升级） | 框架语义一致；rc.13 的 d.ts 缺 `provide` 声明，Aurora 手工补了类型（`$AURORA/src/app/context.ts:62-66`） | 升级到 `cordis@^4.1`（DSH 内置 4.1.0，`$DSH/cordis/package.json:4`），去掉手工 d.ts 补丁，改用 `Service` 子类 + 声明合并 |
| `ctx.isolate / ctx.intercept / ctx.extend / ctx.accessor / ctx.mixin` | 同框架 | 原生 | 同一实现 | 升级后直接可用；Aurora 服务注册应改为 `Service` 子类以自动获得 `ctx.<name>` 类型与 isolate 语义 |
| `ctx.fiber.entry / ctx.get('configEditor')` | 无 profile / 无 patch 层 | 不支持 | Aurora 没有 Cordis Loader，没有 profile patch 与可编辑的行（`$SKILL/dsh-doc/references/configuration.md:3-10` 的模型不存在） | Aurora 用插件自己的设置存储（`storage` 服务命名空间）；插件改配置走 `ctx.settings.set(pluginId, key, value)` |
| `ctx.loader / loader/* 事件 / HMR` | 无 | 不支持 | Aurora 是打包产物，没有 Cordis Loader | 插件启停 = 装载器重新 `ctx.plugin`/`fiber.dispose`；不做代码热替换 |
| `ctx.timer / ctx.logger` | 标准 Web API / console | 原生（需 shim） | timer 是 cordis-plugin-timer，Aurora 未装 | shim 里用 `setTimeout/setInterval` + 自己的 disposer 包装；logger 用 `console` + 前缀 |

### 3.2 Host 服务层（模型/会话/工具）

| DSH 服务 | Aurora 对应 | 级别 | 原因 | 替代 / 适配 |
|---|---|---|---|---|
| `ctx.tools`（注册/执行/瀑布/guard） | **不存在**（只有 chat store 内硬编码 memory 工具循环，`docs/architecture.md:72-81`） | 适配层（新服务） | API 形状可对齐，但 Aurora 没有 Agent 循环与工具结果落库语义 | Phase 1 新增 `tools` 服务：`register(def)`/`execute(batch)`；工具结果由 `sessions` 服务落到当前会话（`tool` 消息块） |
| `ctx.commands` | **不存在**（全仓无 `/命令` 机制） | 适配层（新服务） | DSH 命令是「不进模型回合」的 UI 直接执行；Aurora 可加 `ChatInput` 的 `/` 解析 | 新增 `commands` 服务，`ChatInput` 在提交前查表执行；结果用 toast/消息条展示 |
| `ctx.sessions`（事件溯源日志） | `chat/store.ts`（zustand 单一 store，17 个动作） | 适配层（门面） | Aurora 的消息是可变 store，不是 append-only 日志；没有 `seq`/`deriveMessages` | 新增 `sessions` 服务做**门面 + 事件投影**：list/get/active/send/rename/remove + `subscribe`；事件名对齐 DSH（`session/*`、`message/*`），状态仍由 store 持有 |
| `ctx.sessionProjections` | 无 | 适配层 | 投影需要「纯 fold + 同引用抑制」；Aurora 可用 zustand selector 近似 | 新增 `sessions.project()`（`defineProjection({key, schema, init, apply, view})`）并把它实现为对 `session/*` 事件的纯 fold；缓存按 session 存内存 |
| `ctx.agents` / `ctx.agentLoop` | 无（单会话流式回复，无 agent 句柄） | 需重写 | Aurora 是「当前会话 + 一个流」，没有 Agent 生命周期/收件箱/多 agent | 只提供最小 `agents.current()`（返回 `{sessionId}`）给需要「当前会话」的插件；`agent.inject()` 映射为「向当前会话追加系统消息」；多 agent/子代理不支持 |
| `ctx.systemPrompt`（section/variable/waterfall） | `chat/reply.ts` 的 `buildSystemPrompt`（静态拼接） | 适配层 | 拼接逻辑集中在一个函数，可加注册表 | 新增 `ctx.systemPrompt.section({name, order, text|provider})`，`buildSystemPrompt` 按 order 拼接；`system-prompt/assemble` waterfall 第一阶段不做 |
| `ctx.llm`（适配器 seam） | `api/providers/**`（三协议静态注册） | 适配层 | Aurora 已有更具体的 provider 层；DSH 的 `LlmAdapter/StreamChunk` 协议不同 | 新增 `api.registerProvider(id, adapter)`，adapter 形状用 Aurora 自己的 `CanonicalRequest/Delta`（`api/providers/types.ts`），不强行兼容 DSH 的 StreamChunk |
| `ctx.web`（搜索/抓取 provider） | 无独立 seam；搜索在 UI 层 | 不支持（对插件） | Aurora 没有 web 能力注册表 | 插件若需联网，必须在 manifest 声明 `network` 权限并由宿主代为请求（RPC `net.fetch`），不接受插件直连 |
| `ctx.approval` | 无（Aurora 只有首次免责声明与 API Key 确认） | 适配层（新服务） | 需要一个「一次授权」对话框 | 新增 `approval` 服务：`request({kind, title, detail, signal}) => 'allowed-once'|'denied'|'cancelled'`，UI 用现有 `Modal`；权限级别由 manifest 决定，不满足直接拒绝（fail-closed） |
| `ctx.sandbox` / `ctx.sandboxPolicy` | 无进程沙箱（浏览器无子进程） | 不支持（语义不同） | Aurora 插件跑在 Worker/iframe，不是子进程 | 用**沙箱级别**替代：`worker`/`iframe`/`none`；文件类能力没有，只有 IndexedDB 命名空间 |
| `ctx.credentials` | 无；API Key 在 `settings`（localStorage） | 适配层 | 插件不该直接读宿主 API Key | 新增 `secrets` 能力（或并入 `storage`）：插件自己的凭据存 IndexedDB 加密域（Phase 3 再定加密），宿主 Key 永不出 `settings` |
| `ctx.jobs` / `ctx.subagents` / `ctx.skills` / `ctx.goals` / `ctx.schedule` / `ctx.planMode` / `ctx.sessionTitle` / `ctx.workspaceRegistry` / `ctx.fs` / `ctx.shell` / `ctx.terminal` | 多数无；`workspaceRegistry` 对应 Aurora 的「会话即工作区」概念 | 不支持 | 这些是 DSH 产品内核，Aurora 产品形态不同 | 明确不支持；插件需去掉对应调用（Phase 3 shim 对这些 key 返回 `undefined` 并让插件 `inject` 失败而非抛错） |
| `ctx.tokenMeter` | `usage` 服务（记录每次请求 token） | 适配层 | 数据在，但形状不同 | 暴露 `usage.totals({sessionId})`；DSH 插件的 `tokenUsage` 投影由适配层从 usage 记录聚合 |

### 3.3 存储与数据

| DSH | Aurora | 级别 | 原因 | 替代 |
|---|---|---|---|---|
| `ctx.storage` + `ctx.storageDomain.open(spec)`（zod 校验、`domain/changed`、durable write chain） | IndexedDB（各模块直接开库：`dslike-style/presets/memory/usage`，`docs/architecture.md:61-65`） | 适配层（新服务） | Aurora 没有统一存储服务；但 IndexedDB 可以做命名空间 + 事件 | 新增 `storage` 服务：`open({name, version})` → `{get/put/delete/list/clear/subscribe/flush}`，物理库 `aurora-plugin-data`，key 前缀 `pluginId:namespace:`；`storage/changed` 事件 |
| `ctx.storage` 的 schema 校验（zod） | 无 zod 依赖 | 需重写 | 不引入重依赖 | 用轻量 validator（手写 `validate(spec, value)` 或 `typebox`/`zod` 二选一，需评估包体积） |
| 会话持久化（JSONL + 代际迁移） | IndexedDB 会话库（`chat/db.ts` + `history/**`） | 不支持（插件级） | 插件不该碰宿主会话存储 | 插件通过 `sessions` 服务读投影；自己的数据进 `storage` |
| `$DSH_HOME/plugin-data/<plugin>`（`dsh-todo-list\index.js:606-616`） | `storage` 命名空间 | 适配层 | 目录 → IndexedDB 前缀 | shim 把路径映射到命名空间 |

### 3.4 传输 / RPC

| DSH | Aurora | 级别 | 原因 | 替代 |
|---|---|---|---|---|
| `@Remote` / `@RemoteScope` + Typert 生成 | 无；Aurora 是纯前端 | 不支持 | Typert 需要 TS `Program` 编译期代码生成（`$DSH/dsh/docs/api-gateway.md:86-120`），Aurora 没有这套构建 | shim 对 `ctx.remote` 返回抛 `UNSUPPORTED_DSH_TYPERT` 的代理；插件改用 Aurora `transport` RPC 或 `webServer` 等价物 |
| `ctx.webServer.register`（精确 HTTP 路由/SSE） | 无本地 HTTP server；Electron 壳不暴露给页面 | 不支持 | 浏览器没有监听端口的能力；桌面壳的 `app://` 协议不应给插件用 | 用 `transport` RPC + 事件订阅替代「Client 轮询/SSE」；`notice` 的 state/action/events 三条路由分别映射为 `rpc.call('notice.state')`、`rpc.call('notice.action')`、`transport.on('notice/change')` |
| `ctx.connection`（Peer/信任/认证） | 无 | 不支持 | 单用户本机应用，无多 Peer | Aurora 用「安装确认 + 沙箱级别 + 插件权限」做信任边界 |
| Host→Client 推送（`$events`、Remote stream） | `transport.on(topic, cb)`（Phase 2） | 适配层 | 需要自己定义 envelope | 见 §5.3 |

### 3.5 UI / Client

| DSH | Aurora | 级别 | 原因 | 替代 |
|---|---|---|---|---|
| `window.__ModuleLoader__.load({id, factory(require)})` | 无（rspack 静态打包） | 适配层 | 可以**实现同形全局**：`factory(require)` 里 `require('react')` 由宿主注入 | Phase 3 在页面内信任模式提供该全局 + `require` 白名单（`react` 等），DSH Client bundle 可直接注册 |
| `ctx.slots.register/inject` + slot 层级 | 无 slot；组件直接 import | 适配层（新服务） | 需要 slot 注册表和 5 个宿主挂载点 | 新增 `slots` 服务，最小挂载点：`settings.section`、`composer.dock`、`message.action`、`sidebar.panel`、`shell.overlay` |
| DSH 标准 props（`sessionId/useSession/useProjection/useSessions/useChat/t/...`） | 无 | 适配层 | 需要在注册时把 Aurora 数据投影成 DSH 形状 | `slots.register(..., {props})` 时由宿主注入 `t`、`sessionId`、`useSession`（基于 `sessions` 服务）、`useProjection`（基于投影）；只覆盖 usage-total/notice 用到的集合（`client.js:249-261`） |
| `ctx.locale.register/bind` | `i18n/index.ts` 类型化键 | 适配层（新服务） | 类型化字典无法运行时扩展；需要命名空间 API | 新增 `locale` 服务：`register(ns, dict)`/`bind(ns)`，插件用自己的字典；宿主 `t()` 保持不变 |
| 主题 token `--dsw-*` | Aurora 自有 `theme.css` 变量 + 样式包 CSS 变量 | 需重写 | 两边 token 命名与取值不同 | 适配层提供 `--dsw-alias-*` → Aurora 变量的映射表（仅覆盖常用 surface/border/label/state 类）；插件 CSS 需按映射改写 |
| iframe 承载 UI | 设计稿支持（`docs/plugins.md:38`） | 原生（Aurora 方向） | Aurora 计划就是 iframe | DSH Client 插件在 iframe 里**不能**把 React 元素渲染进宿主树；只能整块面板挂载（`shell.overlay`/`sidebar.panel`），或提升为 `none` 信任模式在页面内渲染 |
| iframe/postMessage 渲染 | 无 | 适配层 | 需要协议 | 见 §5.3；iframe 内插件自渲染，宿主只给容器尺寸与事件 |

### 3.6 打包 / 安装 / 运行时环境

| DSH | Aurora | 级别 | 原因 | 替代 |
|---|---|---|---|---|
| `package.json.dsh.bundle.patch` + profile 层叠 | 无 | 不支持 | 没有 Loader/patch | 兼容层忽略该字段；等价物 =「安装后默认启用」，在 manifest 里 `enabled: true` |
| `package.json.dsh.client{platform,immediately,inject}` | 无 | 适配层 | 字段可读并翻译 | 映射到 Aurora manifest 的 `entry.client` + `sandbox: 'iframe'` + `trusted: false`；`immediately` 忽略（Aurora 同步加载） |
| `exports["./client"]` / `exports["./locale/*.json"]` / `exports["./icon"]` | 无 | 适配层 | 需读包 manifest 解析路径 | 装载器按 exports 解析；`files` 不约束（本地目录安装） |
| `node:*`（fs/path/http/crypto/child_process） | 无（浏览器） | 不支持 | 没有 Node 运行时 | `crypto` → WebCrypto；`path` → 宿主 RPC；`fs/http/child_process` → 不支持 |
| `process.env` / `$DSH_HOME` | 无 | 不支持 | 浏览器无进程环境 | 宿主通过 RPC 暴露有限的 `env.get(key)`（白名单） |
| Electron 主进程 API（`BrowserWindow/ipcMain`） | 无（壳不暴露） | 不支持 | 安全边界 | 明确拒绝；需要窗口能力的插件不迁移 |
| 原生模块（`koffi/sharp/sherpa-onnx` 等 asar 内原生依赖） | 无 | 不支持 | 浏览器无法 dlopen | 插件需移除或用 WASM 替代 |
| npm 依赖 | 允许（宿主打包时需处理） | 适配层 | 浏览器端插件如果自带依赖需要 bundler 产物 | 要求插件提交**已打包的单文件 ESM/IIFE**；宿主不运行 npm install |

### 3.7 权限 / 安全

| DSH | Aurora | 级别 | 原因 | 替代 |
|---|---|---|---|---|
| 无权限声明，安装即信任 | `docs/plugins.md` 的权限 + 沙箱 + 三确认 | 需重写（对 DSH 插件） | 冲突 | 兼容层为 DSH 插件**生成默认权限集**（最小：`ui`、`storage.own`；用到 tools 给 `tools.register`；用到 fetch 给 `network`），并要求用户确认；未声明能力的 RPC 一律拒绝（`docs/plugins.md:30`） |
| `ctx.approval`（每次工具调用审批） | 新增 `approval` 服务 | 适配层 | 实现形态不同（对话内卡片 vs Modal） | Phase 1 用 Modal；Phase 2 改为 composer 区审批条（与宿主风格一致） |
| 沙箱级别 = 文件效果模式 | 沙箱级别 = 执行隔离（worker/iframe/none） | 不同维度 | 目标不同 | 矩阵里分别对待；不要把 DSH 的 `read-only/workspace-write` 当成 Aurora 的隔离级别 |

---

## 4. 最小服务子集设计

### 4.1 设计原则

1. **服务是状态所有者**：Phase 1 允许服务做现有 store 的门面，但**所有写动作必须经过服务**；Phase 2 再把 zustand 状态搬进服务（迁移方向单向，禁止服务反向依赖 UI）。
2. **事件是跨服务/跨插件的唯一契约**：服务之间不互相 import 实现，只通过 `ctx.on/emit` 与 `ctx.get` 协作；事件名与 dispatch mode 写进类型，且**新增事件 = 破坏性变更**（需在 `SERVICE_API_VERSION` 内声明）。
3. **注册必须成对**：任何 `register` 返回 `() => void`，调用方必须 `ctx.effect(() => disposer, label)` 或直接返回给 Cordis；服务自身 dispose 必须清理所有监听/定时器/objectURL。
4. **可取消**：所有异步方法最后一个参数 `signal?: AbortSignal`；流式 API 用 `AsyncIterable<T> + signal`，不用回调。
5. **失败可解释**：统一 `AuroraError { code, message, detail? }`，`code` 是封闭枚举（`AURORA_E_*`）；插件层错误不允许裸 `throw new Error` 穿透到 UI。
6. **插件数据与宿主数据隔离**：插件只能通过 `storage` 服务访问 `pluginId:` 前缀；不允许直接开 IndexedDB/localStorage。
7. **版本化**：服务 API 版本 `AURORA_SERVICE_API = 1`；manifest `engines.aurora`；破坏性变更升 major 并在文档列出。

### 4.2 命名与版本策略

- **服务 id**：尽量与 DSH 同名，降低迁移成本。保留 Aurora 已有 6 个名字（`settings/api/presets/style/memory/usage`），新增 `sessions/tools/commands/storage/slots/locale/approval/transport`（Phase 2/3 再加 `plugins`、`secrets`）。DSH 的 `llm/agents/webServer/connection/sandbox/credentials/jobs/subagents/skills/goals/schedule/planMode/fs/shell/terminal/workspaceRegistry/sessionProjections/systemPrompt` 中：`sessionProjections/systemPrompt` 以 Aurora 名字提供（`sessions` 内的 `project`、`systemPrompt` 服务），其余不提供。
- **cordis 版本**：升级到 `^4.1.0`（与 DSH 内置一致）；4.0.0-rc.13 → 4.1 的迁移面：`ctx.provide` d.ts（去掉 `context.ts:62-66` 补丁）、`Service` 子类可用、`fiber.effectiveConfig/rawConfig` 语义变化（`$DSH/cordis/README.md:103-111`）。升级是 Phase 1 的第一个任务。
- **manifest 版本**：`plugin.json` 的 `schema` 从 1 升到 2（新增 `entry.host/entry.client`、`sandbox`、`permissions`、`engines.aurora`、`dsh` 兼容块），`schema:1` 继续可读（`entry` 单入口 + `type`）。DSH 的 `package.json` 由装载器转换成 schema 2。
- **数据版本**：每个 `storage.open` 带 `version`，迁移函数 `migrate(oldVersion, store)`；不兼容时拒绝打开并提示导出/重置。

### 4.3 服务接口草案（TypeScript）

```ts
// $AURORA/src/services/contracts.ts（新增；所有插件可见的类型面）
import type { Context } from 'cordis'

export const AURORA_SERVICE_API = 1 as const

export type AuroraErrorCode =
  | 'AURORA_E_INVALID_ARG'
  | 'AURORA_E_NOT_READY'
  | 'AURORA_E_NOT_FOUND'
  | 'AURORA_E_CONFLICT'
  | 'AURORA_E_DENIED'          // 权限/审批拒绝
  | 'AURORA_E_CANCELLED'
  | 'AURORA_E_UNSUPPORTED'     // 该能力在本环境不存在
  | 'AURORA_E_PLUGIN_CRASH'
  | 'AURORA_E_QUOTA'
  | 'AURORA_E_INTERNAL'

export interface AuroraError extends Error {
  code: AuroraErrorCode
  detail?: unknown
}

export interface ServiceReady {
  /** 服务完成异步初始化；重复调用幂等 */
  ready(): Promise<void>
}
```

#### settings

```ts
export interface SettingsService extends ServiceReady {
  /** 读取全部设置的只读快照（含默认值） */
  snapshot(): Readonly<SettingsSnapshot>
  get<K extends keyof SettingsSnapshot>(key: K): SettingsSnapshot[K]
  /** 写入并持久化；未知键或校验失败抛 AURORA_E_INVALID_ARG */
  set<K extends keyof SettingsSnapshot>(key: K, value: SettingsSnapshot[K]): Promise<void>
  /** 插件命名空间设置：宿主不校验语义，只校验 JSON 可序列化与大小上限 */
  pluginGet(pluginId: string, key: string): Promise<unknown>
  pluginSet(pluginId: string, key: string, value: unknown): Promise<void>
  subscribe(listener: (change: { key: string; value: unknown }) => void): () => void
}
// 设置项扩展示例：新增插件可见的设置分区由 slots 负责，不由 settings 负责
```

#### api

```ts
export interface ApiProviderAdapter {
  readonly id: string
  readonly protocols: readonly ('openai' | 'anthropic' | 'responses')[]
  /** 编译请求：与现有 api/providers/types.ts 的 CanonicalRequest 对齐 */
  compile(request: CanonicalRequest, preset: ResolvedPreset): ProviderRequest
  /** 解析流式事件：返回 Aurora 内部 Delta（不兼容 DSH StreamChunk） */
  parse(event: unknown): Delta | null
}

export interface ApiService extends ServiceReady {
  readonly origin: string
  getApiKey(): string | null
  registerProvider(adapter: ApiProviderAdapter): () => void
  listProviders(): readonly string[]
  streamChat(request: CanonicalRequest, signal: AbortSignal): AsyncIterable<Delta>
  verifyApiKey(signal?: AbortSignal): Promise<boolean>
  uploadFile(file: File, signal?: AbortSignal): Promise<UploadedFile>
}
```

#### presets / style / usage / memory

```ts
export interface PresetsService extends ServiceReady {
  list(): Promise<readonly PresetSummary[]>
  getActiveResolved(): ResolvedPreset | null
  activate(id: string): Promise<void>
  importZip(file: File): Promise<PresetSummary>
  save(config: PresetConfig): Promise<void>
  remove(id: string): Promise<void>
  subscribe(listener: () => void): () => void
}

export interface StyleService extends ServiceReady {
  getState(): Readonly<StyleState>
  activate(id: string | null): Promise<void>
  importZip(file: File): Promise<StylePackSummary>
  restoreDefault(): Promise<void>
  remove(id: string): Promise<void>
  applyVars(): void
  subscribe(listener: () => void): () => void
}

export interface UsageService extends ServiceReady {
  record(input: UsageRecordInput): Promise<void>
  list(limit?: number): Promise<readonly UsageRecord[]>
  totals(filter?: { sessionId?: string; since?: number }): UsageTotals
  clear(): Promise<void>
  reset(): Promise<void>
  subscribe(listener: () => void): () => void
}

export interface MemoryService extends ServiceReady {
  init(enabled: boolean): Promise<void>
  setEnabled(enabled: boolean): Promise<void>
  runTool(name: string, args: unknown): Promise<unknown>
  list(): readonly MemoryEntry[]
  search(query: string, limit?: number): readonly MemoryEntry[]
  write(entry: MemoryEntryInput): Promise<MemoryEntry>
  remove(id: string): Promise<void>
  flush(): Promise<void>
  subscribe(listener: () => void): () => void
}
```

#### sessions（chat 门面 + 投影）

```ts
export interface SessionRef {
  readonly id: string
  readonly title: string
  readonly createdAt: number
  readonly updatedAt: number
}

/** 只读视图：插件拿到的会话内容，永远是快照而不是 store 内部对象 */
export interface SessionView {
  readonly session: SessionRef
  readonly messages: readonly Message[]
  readonly streaming: boolean
}

export interface SessionsService extends ServiceReady {
  list(): readonly SessionRef[]
  active(): SessionRef | null
  select(id: string | null): void
  create(): Promise<SessionRef>
  rename(id: string, title: string): Promise<void>
  remove(id: string): Promise<void>
  view(id: string): SessionView | null

  /** 动作（全部带 signal；执行落库细节仍由 chat store 负责） */
  send(id: string, input: SendInput, signal?: AbortSignal): Promise<void>
  stop(id: string): void
  regenerate(id: string, messageId?: string, signal?: AbortSignal): Promise<void>
  edit(id: string, messageId: string, content: string): Promise<void>

  /** 投影：纯 fold，订阅事件增量更新；view 不变时返回同引用 */
  project<S>(definition: ProjectionDefinition<S>): Promise<ProjectionHandle<S>>
  subscribe(listener: (event: SessionEvent) => void): () => void
}

export interface ProjectionDefinition<S> {
  key: string
  init(): S
  /** 纯、同步；忽略事件必须返回同一个 state 引用 */
  apply(state: S, event: SessionEvent): S
  view?(state: S): unknown
  stateVersion: number
}
export interface ProjectionHandle<S> {
  stateOf(sessionId: string): S
  dispose(): void
}
```

#### tools（模型工具注册 + 执行循环）

```ts
export interface ToolDefinition {
  name: string
  /** 必填；工具面向模型的文本一律英文（沿用 DSH 与项目既有约定） */
  description: string
  /** 受支持 JSON Schema 子集（object 根） */
  parameters: object
  /** 输出 schema；复用 DSH「output 必填」的约束 */
  output: { schema: object; render?: (args: unknown, value: unknown) => TextBlock[] }
  timeoutMs?: number
  isConcurrencySafe?: () => boolean
  /** 返回 { ok: true, value } 或 { ok: false, error }；不得直接改 store */
  execute(args: unknown, exec: ToolRunContext): Promise<ToolResult>
  /** 可选：DSH 风格的 UI 呈现意图（card 判别联合） */
  presentCall?(args: unknown): ToolCallView
}

export interface ToolsService extends ServiceReady {
  register(definition: ToolDefinition, options?: { when?: (ctx: ToolActivationContext) => boolean }): () => void
  definitions(): readonly ToolDefinition[]
  /** 由 chat store 的流式循环调用；input.calls 来自模型 tool_call 块 */
  execute(input: { calls: readonly ToolCall[]; sessionId: string; signal: AbortSignal }): Promise<ToolBatchResult>
  /** 最终拒绝闸门，只能收紧 */
  guard(guard: (exec: Readonly<ToolExecution>) => string | undefined): () => void
}
```

#### commands

```ts
export interface CommandDefinition {
  name: string            // 小写、不带斜杠
  description: string
  input?: { hint: string; attachments?: boolean }
  handler(invocation: CommandInvocation): Promise<CommandResult> | CommandResult
}
export interface CommandInvocation {
  commandId: string
  sessionId: string
  rawInput: string
  attachments: readonly FileAttachment[]
  signal: AbortSignal
}
export type CommandResult =
  | { kind: 'success'; text?: string }
  | { kind: 'error'; text: string }

export interface CommandsService extends ServiceReady {
  register(definition: CommandDefinition): () => void
  list(): readonly Omit<CommandDefinition, 'handler'>[]
  execute(sessionId: string, line: string, signal: AbortSignal): Promise<CommandResult | undefined>
}
```

#### storage

```ts
export interface StorageNamespace {
  readonly name: string
  get<T = unknown>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  list(prefix?: string): Promise<readonly string[]>
  clear(): Promise<void>
  /** 本命名空间的变更事件；宿主不广播其他插件命名空间的变更 */
  subscribe(listener: (key: string, value: unknown | undefined) => void): () => void
  /** 把内存缓冲落到 IndexedDB；宿主在 pagehide/dispose 时统一调用 */
  flush(): Promise<void>
}

export interface StorageService extends ServiceReady {
  open(options: { name: string; version: number; migrate?: (from: number, ns: StorageNamespace) => Promise<void> }): Promise<StorageNamespace>
  /** 只允许插件打开自己的命名空间；pluginId 由装载器注入 */
}
```

#### slots

```ts
export type SlotName =
  | 'settings.section'
  | 'composer.dock'
  | 'message.action'
  | 'sidebar.panel'
  | 'shell.overlay'

export interface SlotRegistration<P = Record<string, unknown>> {
  name: SlotName
  id: string
  order?: number
  /** 只允许注册到已声明的 slot；宿主校验 P 的投影字段 */
  inject?: () => Record<string, unknown>
}

export interface SlotsService extends ServiceReady {
  register<P>(registration: SlotRegistration, component: ComponentType<P>): () => void
  /** 宿主组件调用；按 order/id 排序后渲染 */
  render(name: SlotName, props: Record<string, unknown>): React.ReactNode
  /** 宿主在挂载点声明 slot（内部用，不对插件暴露） */
  declare(name: SlotName, declaration: { scope: 'root' | 'session'; session?: boolean }): () => void
  list(name: SlotName): readonly { id: string; order: number }[]
}
```

#### locale / approval

```ts
export interface LocaleService extends ServiceReady {
  current(): 'zh-CN' | 'en-US'
  register(namespace: string, dictionaries: { zh: Record<string, string>; en: Record<string, string> }): () => void
  bind(namespace: string): (key: string, params?: Record<string, string | number>) => string
  subscribe(listener: (locale: 'zh-CN' | 'en-US') => void): () => void
}

export interface ApprovalService extends ServiceReady {
  /** 一次授权；要求调用方持有该会话且当前没有进行中的审批 */
  request(request: {
    kind: 'network' | 'settings-write' | 'tool-run' | 'storage-export'
    title: string
    detail?: string
    pluginId: string
    signal?: AbortSignal
  }): Promise<'allowed-once' | 'denied' | 'cancelled' | 'unavailable'>
  /** 非交互闸门：按 manifest 权限与用户沙箱级别判定，不发弹窗 */
  check(capability: string): boolean
}
```

#### transport（Phase 2，沙箱 RPC 的宿主侧）

```ts
export interface TransportService {
  /** 宿主为某个插件实例创建通道；插件侧是 postMessage/MessagePort */
  createChannel(pluginId: string, options: { capabilities: readonly string[] }): PluginChannel
}
export interface PluginChannel {
  /** 宿主主动调用插件（用于命令式通知） */
  call(method: string, args: unknown, signal?: AbortSignal): Promise<unknown>
  /** 插件→宿主事件（订阅） */
  on(topic: string, listener: (payload: unknown) => void): () => void
  dispose(): Promise<void>
}
```

### 4.4 事件目录草案

| 事件 | mode | 载荷 | 说明 |
|---|---|---|---|
| `sessions/created` | emit | `{ session: SessionRef; source: 'new' \| 'import' }` | 会话创建 |
| `sessions/removed` | emit | `{ sessionId: string }` | 删除 |
| `sessions/selected` | emit | `{ sessionId: string \| null }` | 切换 |
| `sessions/renamed` | emit | `{ sessionId: string; title: string }` | 重命名 |
| `message/appended` | emit | `{ sessionId: string; message: Message }` | 新消息（含工具结果） |
| `message/updated` | emit | `{ sessionId: string; messageId: string; patch: MessagePatch }` | 流式/编辑 |
| `reply/start` | emit | `{ sessionId: string; messageId: string; model: string }` | 回复开始 |
| `reply/chunk` | emit | `{ sessionId: string; messageId: string; delta: ReplyDelta }` | token/思考流（高频，监听方需自行节流） |
| `reply/end` | emit | `{ sessionId: string; messageId: string; status: ReplyStatus }` | 回复结束/中断/出错 |
| `turn/end` | emit | `{ sessionId: string; reason: 'done' \| 'stopped' \| 'error' }` | 回合结束（持久化事件对齐 DSH） |
| `tools/change` | emit | `{ name: string; registered: boolean }` | 工具注册变化 |
| `commands/change` | emit | `{}` | 命令注册变化 |
| `storage/changed` | emit | `{ namespace: string; key: string; value?: unknown }` | 存储写入后置通知 |
| `settings/change` | emit | `{ key: string; value: unknown }` | 设置变化 |
| `api/providers-changed` | emit | `{}` | provider 注册表变化 |
| `presets/change` | emit | `{}` | 预设变化 |
| `style/change` | emit | `{ active: string \| null }` | 样式包变化 |
| `locale/change` | emit | `{ locale: 'zh-CN' \| 'en-US' }` | 语言切换 |
| `approval/request` | waterfall | `(req, next)` | 与 DSH 同名，作答者链 |
| `plugins/state-changed` | emit | `{ pluginId: string; state: 'enabled' \| 'disabled' \| 'crashed' }` | Phase 2 装载器 |
| `transport/ready` | emit | `{ pluginId: string }` | Phase 2 通道就绪 |

约定：
- 高频流式事件（`reply/chunk`）只给**同页面**监听者；跨沙箱转发必须节流/批量（见 §5.3），避免 postMessage 风暴。
- 事件载荷一律 JSON 可序列化；`File`/`Blob` 走 `transport` 二进制通道，不进事件。
- `waterfall` 只用于审批与工具策略；其他都是 `emit`，避免插件之间的顺序耦合。

### 4.5 disposer 与生命周期约定

1. 服务注册：`ctx.provide(name, service)` 或 `Service` 子类；服务内部所有监听必须在 `dispose()`（或 `ctx.effect`）里清空。
2. 插件注册点：`const off = ctx.tools.register(def); ctx.effect(() => off, 'plugin:tool')`。
3. 服务的 `ready()`：异步初始化（IndexedDB 打开、sql.js wasm 加载）必须在 `ready()` 前完成，调用方 `await context.services().ready()`；`AppContext.start()` 已保证六个旧服务就绪，新增服务要加入同一 `inject` 集合（`context.ts:158-161`）。
4. 会话级注册（Phase 2）：插件按会话生效的注册挂在 `sessions.scope(sessionId)` 返回的子 ctx 上；与 DSH `agent.ctx` 的教训一致（`practices.md:19`），装载器必须同时持有 disposer。
5. 卸载顺序：先禁用插件（dispose 其 fiber + terminate worker/iframe），再卸载服务；服务 `dispose` 逆序，与现有实现一致（`context.ts:170-187`）。

### 4.6 与现有 store 的迁移映射

| 现状 | Phase 1 | Phase 2+ |
|---|---|---|
| `useChatStore`（zustand，`chat/store.ts:160`） | `sessions` 服务持有同一 store 引用并转发动作；服务在 store 变化时 emit `message/*`/`reply/*` 事件 | store 搬进服务内部（`sessions` 成为唯一状态所有者），UI 通过 `useSyncExternalStore` 订阅服务快照 |
| `useSettings`（`services/settings.ts`） | `settings` 服务已转发；补 `pluginGet/Set` 与事件 | 不变（设置天然适合 localStorage） |
| `usePresetStore` / `useStylePackStore` / `usage` 模块状态 | 服务转发 + 事件 | 逐步把状态搬进服务；保留模块函数给未迁移的 UI |
| `initChat/style.init/...`（`bootstrap.ts:66-91`） | 改由各服务 `ready()` 负责；`runBootstrap` 只 `await Promise.all(services.ready())` | 同左，顺序由 `inject` 图决定而不是手写顺序 |
| UI 直接 import（`App.tsx:3-36`、`SettingsDialog.tsx:25-56`） | 不动 | 按批次替换为 `useAppService(...)`；先换 `sessions`/`settings`，再换 style/preset/usage |

### 4.7 数据与存储约定

- 物理库：`IndexedDB: aurora-plugin-data`，object store `kv`，主键 `${pluginId}\u0000${namespace}\u0000${key}`；索引 `byPlugin`。
- 配额：每插件默认 8 MB，超出 `AURORA_E_QUOTA`；`storage.open` 时检查 `navigator.storage.estimate()`。
- 迁移：`open({version, migrate})`；版本只增不减；迁移在事务内执行，失败回滚并保留旧数据。
- 导出/卸载：卸载插件时提示「保留数据 / 删除数据」（默认保留 30 天由宿主 GC）；导出走 `storage.export(pluginId)`。
- 禁止：插件直接 `localStorage` / `indexedDB.open` / `document.cookie`；RPC 层拦截（Phase 2 Worker/iframe 天然没有宿主 localStorage）。

---

## 5. 插件装载方案

### 5.1 manifest 字段（`plugin.json` v2）与 DSH 映射

Aurora 自有清单（在 `docs/plugins.md:14-28` 的 v1 上扩展，兼容 v1）：

```jsonc
{
  "$schema": "https://aurora.chat/schema/plugin-2.json",
  "schema": 2,
  "id": "@local/dsh-usage-total",          // 反向域名或 npm 名；唯一
  "name": "用量总计",
  "version": "1.0.0",
  "author": "someone",
  "description": "…",
  "license": "MIT",
  "type": "ui",                             // service | ui | hybrid
  "entry": { "host": "index.js", "client": "client.js" },  // host = Worker 入口；client = iframe/页面入口
  "sandbox": "iframe",                      // worker | iframe | none（用户可在安装时降级/升级）
  "permissions": ["ui.slot", "usage.read", "storage.own"],
  "engines": { "aurora": ">=0.4.0", "serviceApi": 1 },
  "display": { "icon": "icon.svg", "locales": "locale", "detail": "docs/DETAIL.md" },
  "config": { "schema": { "type": "object", "properties": {} } },   // 可选：JSON Schema，用于设置表单
  "dsh": { "package": true }                // 兼容标记：本插件来自 DSH 包翻译
}
```

DSH 包 → Aurora manifest 的字段映射（装载器的「翻译表」）：

| DSH 来源 | Aurora 目标 | 规则 |
|---|---|---|
| `package.json.name` | `id` | 直接用（`@local/x` 合法）；重名拒绝安装 |
| `version/description/author` | 同名 | 直取 |
| `exports["."]` | `entry.host` | 相对路径解析；文件不存在 → L0 失败 |
| `exports["./client"]` + `dsh.client.platform === 'web'` | `entry.client` + `type: 'hybrid'`（有 host 时）/`'ui'` | Client 半必须已打包为浏览器产物 |
| `dsh.client.inject` | 忽略 | 只用于 DSH 的加载顺序；Aurora 用 capability 顺序 |
| `dsh.client.immediately` / `external` | 忽略 | Aurora 同步加载、禁止运行时外部模块 |
| `dsh.bundle.patch` | 忽略（记 `dsh.package = true`） | 没有 patch 层；等价「默认启用」 |
| `exports["./locale/*.json"]` 的 `meta.title/description/detail` | `name/description/display.detail` | 取 `en` 或 `zh` 一份 |
| `exports["./icon"]` / `icon` | `display.icon` | 校验 SVG/PNG/WebP ≤256 KiB、不得引用包外 |
| `files` | 忽略 | 本地目录安装不做打包过滤 |
| `permissions`（不存在） | `permissions` | **必须生成**：静态扫描 + 用户确认（§5.4） |
| `engines`（不存在） | `engines.aurora` | 由装载器盖章；不满足则拒绝 |

### 5.2 入口格式

三种入口，对应三档信任/能力：

| 形态 | 适用 | 加载方式 | 能力 |
|---|---|---|---|
| **Worker**（`entry.host`，默认 `sandbox:'worker'`） | service 型逻辑：工具、命令、后台任务 | `new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), { type: 'module' })`；Worker 内先握手，再执行插件的 `apply(ctx)` | 无 DOM、无 localStorage、无直接网络；只能走 RPC；可用 `fetch` 仅当声明 `network` 且由宿主代理 |
| **iframe**（`entry.client` + `sandbox:'iframe'`） | UI 型插件（默认） | `iframe sandbox="allow-scripts"` + `srcdoc`/blob 文档；宿主只给容器，插件自渲染 DOM | 隔离文档、无同源存储、无宿主 DOM；通过 postMessage RPC 取数据；只能整块挂载 |
| **页面内**（`sandbox:'none'`，用户显式选择） | DSH Client 插件兼容、以及需要 React 渲染进宿主 slot 的插件 | 动态 `import(blobUrl)` 或 script 注入；提供 `window.__ModuleLoader__` 同形 shim + `require` 白名单 | 等同应用代码：可读宿主 DOM/localStorage/网络；**永久标注「未隔离」**（`docs/plugins.md:39`） |

关键结论（决定 DSH UI 插件怎么迁移）：
- DSH Client 插件返回的是 **React 元素**，靠 `ctx.slots.register(..., Component)` 渲染进宿主树（`slots.md:29-52`）。React 元素不能跨 realm 传给宿主渲染，所以 **iframe 里的 DSH Client 插件无法复用 slot 渲染**——只能整块面板自渲染，或选择 `none` 在页面内渲染。
- 因此 Phase 3 的 DSH UI 兼容默认走 **`none` 信任模式**（用户显式确认 + 永久标注），iframe 模式只用于 Aurora 原生 UI 插件。
- 当前 CSP 没有 `script-src`（`$AURORA/src/index.html:14-17` 只设了 `img/font/style/connect/media/object/base`），所以 blob script 与 Worker 目前可用；**若将来补 `script-src`，必须显式加入 `blob:` 与 `worker-src blob:`**，否则两种加载方式都会失效。

加载时序（宿主侧，Phase 2 伪代码）：

```ts
async function activate(record: PluginRecord, ctx: AppContext) {
  const manifest = record.manifest
  const permissions = await permissions.resolve(manifest)      // §5.4
  if (manifest.entry.host) {
    const worker = spawnWorker(record.code.host, { pluginId: manifest.id, permissions })
    await handshake(worker)                                     // ready/init 往返
    registerToolBroker(ctx, manifest, worker)                   // 工具执行回 worker
    registerEventBridge(ctx, manifest, worker)                  // 宿主事件 → worker
  }
  if (manifest.entry.client) {
    if (manifest.sandbox === 'none') await loadInPage(ctx, manifest, record.code.client)
    else await mountIframe(ctx, manifest, record.code.client)
  }
}
```

### 5.3 沙箱 RPC 协议

统一 envelope（Worker 与 iframe 共用；iframe 用 `window.postMessage`，Worker 用 `port.postMessage`）：

```ts
type Frame =
  | { v: 1; kind: 'ready'; pluginId: string }
  | { v: 1; kind: 'init'; pluginId: string; serviceApi: number; permissions: string[];
      config: unknown; hostLocale: 'zh-CN' | 'en-US'; themeTokens: Record<string, string> }
  | { v: 1; kind: 'call'; id: string; method: string; args: unknown }
  | { v: 1; kind: 'result'; id: string; ok: true; value: unknown }
  | { v: 1; kind: 'result'; id: string; ok: false; error: { code: string; message: string; detail?: unknown } }
  | { v: 1; kind: 'event'; topic: string; payload: unknown }
  | { v: 1; kind: 'subscribe'; topics: string[] }
  | { v: 1; kind: 'cancel'; id: string }
  | { v: 1; kind: 'log'; level: 'info' | 'warn' | 'error'; message: string }
  | { v: 1; kind: 'dispose' }
```

方法表（宿主侧路由；`capability` 是调用所需权限，未声明返回 `AURORA_E_DENIED`）：

| method | capability | 方向 | 说明 |
|---|---|---|---|
| `sessions.list / sessions.view / sessions.active` | `sessions.read` | 插件→宿主 | 返回 `SessionRef` / `SessionView` 快照 |
| `sessions.create / rename / remove / select` | `sessions.write` | 插件→宿主 | 写动作 |
| `sessions.send / stop / regenerate / edit` | `sessions.write` | 插件→宿主 | 与 UI 走同一服务方法（`docs/plugins.md:60` 的「同一个操作两个调用方」） |
| `sessions.project` | `sessions.read` | 插件→宿主 | 注册投影；宿主在事件后回推 `event topic=projection/<key>` |
| `tools.register` / `tools.unregister` | `tools.register` | 插件→宿主 | 只传工具 schema 元数据；`execute` 由宿主反向 `call('tool.execute')` |
| `tool.execute` | —（宿主发起） | 宿主→插件 | 插件侧回调；返回 `{ content, isError }` |
| `commands.register` | `commands.register` | 插件→宿主 | 同上，执行反向 `command.execute` |
| `command.execute` | —（宿主发起） | 宿主→插件 | |
| `settings.get` / `settings.set` | `settings.read` / `settings.write` | 插件→宿主 | 宿主设置只读；插件自己的配置走 `storage` |
| `storage.get/put/delete/list/clear` | `storage.own` | 插件→宿主 | 命名空间由宿主按 pluginId 注入，插件不能指定别的插件 |
| `usage.record / usage.totals` | `usage.read`（写仅宿主） | 插件→宿主 | 插件只能读聚合；`record` 仅供宿主内部 |
| `memory.search / memory.write` | `memory.read` / `memory.write` | 插件→宿主 | 与 `runMemoryTool` 同源 |
| `approval.request` | `approval.request` | 插件→宿主 | 弹一次授权，返回 closed outcome |
| `net.fetch` | `network` | 插件→宿主 | 宿主代理请求：域名白名单 + 方法/大小/超时限制 + 响应体上限 |
| `env.get` | `env.read` | 插件→宿主 | 白名单键（如 `locale`、`appVersion`），不含 API Key |
| `log.write` | — | 插件→宿主 | 写宿主日志（带 pluginId 前缀），限流 |
| `locale.register` | `locale` | 插件→宿主 | 注册自己的字典 |
| `slots.register` / `slots.unregister` | `ui.slot` | 插件→宿主（仅页面内模式） | iframe 模式不支持注册宿主组件 |
| 订阅 topic | 各 read 权限 | 插件→宿主 | `sessions/*`、`message/*`、`reply/*`、`storage/changed`（仅自己命名空间）、`settings/change`、`locale/change` |

限制与健壮性：
- 单帧 ≤ 1 MiB；超限拒绝并报错（不静默截断）。二进制（图片/附件）不走此协议，标记为 Phase 3 的 `binary` 通道。
- 默认调用超时 10 s（插件可在 manifest 声明 `timeouts`），超时返回 `AURORA_E_CANCELLED` 并发送 `cancel`。
- 每插件并发上限 100 帧；`reply/chunk` 类事件批量（50 ms 窗口）转发，避免 postMessage 风暴。
- 只允许 structured clone 数据；函数/Proxy/类实例直接拒绝。
- 插件崩溃检测：Worker `error`/`messageerror`/心跳（10 s × 3 miss）；iframe `load` 超时 + 心跳。崩溃 → `plugins/state-changed{crashed}` + 禁用 + toast。
- 插件侧 `ctx` 是**白名单 Proxy**：未实现的服务返回 `undefined`（配合 `inject` 让插件不激活），未实现方法抛 `AURORA_E_UNSUPPORTED`，而不是静默 no-op。

### 5.4 权限声明与首次安装三确认

权限枚举（与 DSH 服务对照）：

| Aurora 权限 | 含义 | 对应 DSH 用法 |
|---|---|---|
| `ui.slot` | 注册宿主 UI 组件 | `ctx.slots.register/inject` |
| `ui.overlay` | 全屏浮层 | `shell.overlay` 类插槽 |
| `sessions.read` | 读会话与消息 | `ctx.sessions`/`ctx.sessionController` 读 |
| `sessions.write` | 发消息/改名/删会话 | `ctx.sessions` 写 |
| `tools.register` | 向模型注册工具 | `ctx.tools.register` |
| `commands.register` | 注册 `/` 命令 | `ctx.commands.register` |
| `settings.read` / `settings.write` | 读写宿主设置 | `ctx.settings`（DSH 上等价于插件权限全开） |
| `storage.own` | 自己的持久命名空间 | `ctx.storageDomain` / `$DSH_HOME/plugin-data` |
| `usage.read` | 读用量聚合 | `ctx.tokenMeter` 类 |
| `memory.read` / `memory.write` | 读写记忆库 | 工具循环里 `runMemoryTool` |
| `network` | 经宿主代理访问网络 | 插件自己 `fetch`（DSH 无限制，Aurora 收窄） |
| `approval.request` | 发起一次用户授权 | `ctx.approval` |
| `locale` | 注册自有文案 | `ctx.locale.register` |
| `env.read` | 读白名单环境信息 | `process.env`（DSH 无限制） |

三确认流程**直接沿用** `docs/plugins.md:41-55`（风险告知 → 清单/权限勾选 → 风险自负勾选；按钮左/中/右随机分配、≥800 ms 冷却、禁用 Enter 跳过）。补充三条：

1. 权限清单必须**人类可读**（中文标签 + 一句说明），并显示派生来源（「本插件注册 3 个模型工具」）。
2. 沙箱级别展示与降级：`worker`/`iframe` 为默认；选 `none` 时第 3 步追加「我放弃沙箱保护」勾选（`docs/plugins.md:53`）。
3. 升级：同 id 升级若**权限集合扩张**或沙箱降级，需重新走一次确认；否则一次普通确认。安装记录含代码 hash（`sha256`），展示给用户并可核对。

### 5.5 失败降级（分级）

| 级别 | 场景 | 行为 | 用户可见 |
|---|---|---|---|
| L0 | manifest 非法 / 入口文件缺失 / 依赖引擎不满足 | 拒绝安装或标记 `invalid`；**绝不写入启用态** | 插件列表红字原因 |
| L1 | 代码加载失败（语法错误 / import 失败 / Worker 启动失败 / iframe 超时） | 安装保留，状态 `disabled(reason)`；不重试 | 「加载失败」+ 重试按钮 |
| L2 | 激活失败（`apply` 抛错 / `ctx.inject` 依赖缺失一直 PENDING / RPC 握手失败） | `inactive`；保持已安装；Cordis 语义下依赖缺失不抛异常（`$DSH/dsh/docs/cordis-api/registry.md:10-13`） | 「缺少依赖：xxx」 |
| L3 | 运行时崩溃（未捕获异常 / 心跳丢失 / 内存超限） | 立即 `terminate`/移除 iframe，`crashed`；自动重启预算 3 次/60 s，超限则保持禁用 | toast + 插件行「已崩溃」 |
| L4 | 单次 RPC 拒绝/超时/越权 | 仅该调用失败（`AURORA_E_DENIED/CANCELLED`）；插件继续；UI 由 slot 级 ErrorBoundary 兜住 | 组件内错误占位 |
| L5 | 宿主服务缺失/未就绪 | 插件 `inject` 未满足 → 不激活（L2），不阻塞宿主启动 | 同 L2 |

硬约束：
- 插件装载发生在 `await ctx.start()` **之后**，且插件 fiber 不在六个内置服务的 `scopeFiber` 依赖里（`$AURORA/src/app/context.ts:158-161`），所以**任何插件失败都不能让宿主启动失败**。
- 卸载必须可逆：终止 Worker / 移除 iframe / dispose 插件 fiber 与订阅 / 释放 objectURL；数据默认保留（`docs/plugins.md:63`）。
- 插件不得影响「流式回复」的取消语义：所有转发给插件的会话事件都带 `sessionId`，插件卸载时其订阅先断开。

### 5.6 与 DSH 插件包的差异（缺字段时需要适配）

| DSH 有而 Aurora 没有 | Aurora 需要补的适配动作 | 备注 |
|---|---|---|
| `package.json` + profile 层叠 patch（`dsh.bundle.patch`） | 翻译成 manifest；patch 丢弃 | 一个 DSH bundle = 一个 Aurora 插件（DSH bundle 可含多行，Aurora 不支持多行组合） |
| `dsh.client` 四字段 | 只取 `platform==='web'` 与 `exports["./client"]` | `inject`/`immediately`/`external` 丢弃 |
| `cordis.patch.yml` 的 `config` | 作为插件初始配置写进安装记录（`config` 字段） | 没有 patch 层，后续配置走设置页 |
| npm `link:` 安装 + pnpm | 直接把目录复制/打包进 IndexedDB | 插件不能带 `node_modules` 运行；要求已打包 |
| DSH Host 半的 Node 能力 | 逐项映射到 RPC 或标记不支持 | 见 §7 |
| Typert Remote 生成物（`typert.remote-client.js`） | 不支持；提示作者改用 `transport` | 生成物依赖 DSH 构建链 |
| `ctx.slots` 的 slot 名与标准 props | slot 名映射表 + props 投影 | 见 §6.3 与 §7 |
| 显示元数据（locale/icon/detail） | 从 `exports` 解析 | 路径校验必须在包内 |

---

## 6. 分阶段落地计划

### Phase 1：服务子集（不改 UI 调用也能先落地）

**范围**
1. 升级 `cordis` 到 `^4.1`；六个旧服务改为 `Service` 子类或保留 `ctx.provide`（二选一，推荐后者先保持零风险，再逐步迁移）。
2. 新增服务：`sessions`（chat store 门面 + 事件 + 投影）、`tools`、`commands`、`storage`、`slots`、`locale`、`approval`；扩 `settings`（插件命名空间）、`api`（provider 注册表）。
3. UI 挂载点改造（五处）：`SettingsDialog` 的 section 列表、`ChatInput` 的 dock、`AssistantMessage` 的 action 列表、`App` 的 overlay、`Sider` 的 panel。
4. 事件目录落地（§4.4），先只 emit 不优化节流。

**改动面（文件级）**

| 类型 | 文件 | 说明 |
|---|---|---|
| 新增 | `web/src/services/contracts.ts` | 类型面（§4.3） |
| 新增 | `web/src/services/plugins/sessions.ts` 等 7 个服务插件 | 每个包 `apply(ctx)` + `ctx.provide` + `ctx.effect(dispose)` |
| 修改 | `web/src/app/context.ts` | `AppServiceMap` 扩到 13 个；`BUILTIN_SERVICES` 顺序；`inject` 集合 |
| 修改 | `web/src/services/chat/store.ts` | 只加事件 emit 与 `sessions` 服务需要的只读快照函数，不重写逻辑 |
| 修改 | `web/src/components/settings/SettingsDialog.tsx` | section 数组改为 `slots.render('settings.section')` + 保留内置 section |
| 修改 | `web/src/components/chatInput/ChatInput.tsx` | 加 `slots.render('composer.dock')` |
| 修改 | `web/src/components/messages/AssistantMessage.tsx` | 加 `slots.render('message.action', {message})` |
| 修改 | `web/src/app/App.tsx` | 加 `<SlotOutlet name="shell.overlay" />` 与插件启停入口（设置页「插件」分区） |
| 修改 | `web/src/app/AppServices.tsx` | `useAppService` 保持；新增 `useSlot(name)` |
| 新增测试 | `web/tests/services/*.test.mjs` | Node 侧测服务：事件、disposer、storage、投影 |

**风险**
- `chat/store.ts` 是 52 KB 单文件，任何改动都可能影响流式回复与多窗口同步（`bindChatSync/bindChatPersistence`，`store.ts:345,415`）。缓解：Phase 1 **只加只读导出与事件**，不动写路径。
- 事件风暴：`reply/chunk` 每个 token 一次；缓解：Phase 1 先只在 `reply/end` 与批量 flush 时 emit（与 Phase 2 的节流策略一致）。
- 服务初始化顺序：新增服务加入 `inject` 集合后，任一 `ready()` 失败会让整个容器 start 失败（现有语义，`context.ts:209-259`）——这正是期望（内部服务失败是 bug），但必须给每个服务写 `ready()` 的失败测试。
- cordis 升级的 d.ts 变化：`fiber.state` 常量、`provide` 签名；缓解：升级后先跑 `pnpm type` + 现有 6 个服务单测。

**测试与验收标准**
- `pnpm type`、`pnpm lint`、`pnpm test`、`pnpm build` 全绿；`docs/architecture.md` 的「启动顺序」与实现一致（更新文档）。
- 新服务单测覆盖：`ctx.effect` 成对释放（连续 start/dispose 100 次无泄漏）、事件顺序、`sessions` 门面与 store 状态一致、`storage` 命名空间隔离与迁移、投影 `apply` 纯性（同引用断言）。
- 行为不回退：现有 UI 不感知服务变化；`bootstrapApp` 的 fallback 路径仍工作。
- 验收用的可观察脚本（Node）：创建容器 → 逐个 `await ctx.<svc>.ready()` → 触发一次 `sessions.create` → 断言收到 `sessions/created` → `dispose()` → 断言所有 disposer 调用、无定时器残留。

### Phase 2：装载与沙箱

**范围**
1. 装载器：manifest 解析/校验、代码存储（IndexedDB）、版本与 hash、启停/卸载、升级。
2. Worker 运行时（service 型）+ iframe 运行时（UI 型）+ 页面内模式（`none`）。
3. RPC 通道（§5.3）+ 权限路由（§5.4）+ 宿主事件桥。
4. 安装 UI：`docs/plugins.md:41-55` 的三步确认、插件列表（权限/沙箱/启用/卸载/未隔离标识）。
5. 失败分级与恢复（§5.5）。

**改动面**
- 新增 `web/src/plugins/{manifest,registry,loader,worker-host,iframe-host,rpc,permissions,install-state}.ts`。
- 新增 `web/src/components/settings/PluginSection.tsx`（安装/列表/详情）。
- 修改 `App.tsx`：启动后 `plugins.restore()`；`pagehide` 时 `plugins.disposeAll()`。
- 新增 Node 侧测试：RPC 编解码、权限拒绝、超时/取消、崩溃恢复、manifest 校验（用 Node Worker 模拟）。

**风险**
- CSP / Electron `app://` 协议：`blob:` Worker 与 iframe `srcdoc` 在两个壳里行为可能不同（`desktop/main.js` 的协议与权限策略需核查）；缓解：Phase 2 先只在 web 开发模式与桌面壳验证，Android WebView 单列验证项。
- 沙箱逃逸：`none` 模式等同应用代码；缓解：默认 `worker/iframe`，`none` 需要二次确认 + 永久标识；关闭 `document.cookie`、限制 `fetch`。
- RPC 大小/频率：图片与长文本；缓解：上限 + 二进制通道留到 Phase 3。
- 安装 UI 的三步确认交互在移动端（窄屏）的按钮「左/中/右」布局；缓解：沿用现有 Modal 的响应式规则，真机验证。

**验收标准**
- 安装一个示例插件（worker + iframe），三步确认全部走完；刷新后仍启用。
- 越权调用（如未声明 `network` 时调 `net.fetch`）被拒绝并记录日志；篡改 manifest 权限无效（以安装记录为准）。
- 崩溃注入（Worker 内 `throw`/死循环）：宿主不崩，插件被禁用并可手动恢复；连续 3 次崩溃后自动禁用。
- 卸载后 IndexedDB 中代码与状态清理（数据保留策略按提示）。
- 插件加载失败时宿主启动时间与基线差 < 100 ms（失败快速返回）。

### Phase 3：DSH 兼容适配层

**范围**
1. `dsh-shim`：读取 DSH 包的 `package.json`，生成 Aurora manifest（§5.1 映射）；静态扫描代码生成权限（`node:` → 不支持/警告；`ctx.tools.register` → `tools.register`；`fetch` → `network`；DOM/React → `ui.slot`）。
2. Host shim（Worker 内）：把白名单 `ctx.*` 映射为 RPC；未实现服务返回 `undefined`（让 `inject` 不满足而非抛错）；`ctx.tools.register` 走 `tools.register` + 反向 `tool.execute`；`ctx.commands.register` 同理；`ctx.storage` → `storage`；`ctx.settings` → `settings`；`ctx.sessions/ctx.sessionController` 子集；`ctx.approval`；`ctx.locale`。
3. Client shim（页面内 `none` 模式）：提供 `window.__ModuleLoader__.load({id, factory})`，`require` 白名单（`react`、`react/jsx-runtime`、`aurora-client`），slot 名映射（DSH `conversation.composer.dock` → Aurora `composer.dock`，`shell.overlay` → `shell.overlay`，`settings.*` 映射见 §7），DSH 标准 props 投影（`t`、`sessionId`、`useSession`、`useProjection`、`useSessions`）。
4. 不支持的 API 显式报错（不是静默降级）：`ctx.webServer`、`ctx.remote`（Typert）、`ctx.loader`、`node:*`、`ctx.sandbox` 等。

**可先移植的真实 DSH 插件样例（本机可找到）**

| 样例 | 为什么选它 | 需要 Aurora 的能力 | 预期改造量 |
|---|---|---|---|
| `@local/dsh-usage-total`（`D:\Projects\Deepseek_Harness_Workspace\dsh_plugins\dsh-usage-total\`） | 纯 Client：`inject:['slots','locale','configForms']`（`client.js:473`）、slot `conversation.composer.dock`（`client.js:492-497`）、组件 props 只用 `t/sessionId/useSessions/useProjection/usePerformanceUsage`（`client.js:252-261`）；Host 半是空 `apply(){}`（`index.js:9`） | `slots` + `locale` + props 投影 + `usage` 聚合（替代 tokenUsage 投影） | **小**：Client shim + props 投影即可，用来验证「纯 UI 兼容」 |
| `@local/dsh-notice`（`...\dsh_plugins\notice\`） | 真实 Host+Client：工具注册（`index.js:567`）、3 条精确 HTTP 路由（`index.js:460-547`）、Client 轮询/SSE（`client.js:26-33`）、`shell.overlay` 卡片 | `tools` + `transport`（替代 HTTP 路由）+ `sessions.read/write`（替代 `sessionController.prompt/agents`，`index.js:328-388`）+ `shell.overlay` + `approval` 免审批 | **中**：host 半的去 Node 化（`node:crypto` → WebCrypto）+ 路由改 RPC + props/主题 token 映射 |
| （备选）`@local/dsh-todo-list`（`...\dsh_plugins\dsh-todo-list\`） | Host-only、`inject:['tools']`（`index.js:40`）、数据落 `$DSH_HOME/plugin-data`（`index.js:606-616`） | `tools` + `storage`；`node:fs` 需换 `storage` RPC | **小-中**：验证「纯 Host 工具插件 + storage 映射」 |

**风险**
- DSH 标准 props 与 slot 名会随 DSH 版本变化（0.2.x → 后续）；缓解：shim 只覆盖 usage-total/notice 实际用到的子集，版本锁定在 shim 的 `DSH_COMPAT = '0.2.2'`，升级时按需扩展。
- 页面内 `none` 模式与 Aurora 的安全承诺冲突；缓解：默认拒绝导入 DSH 包，用户必须显式选择 `none` 且看到「等同未隔离代码」的确认。
- 主题 token 映射不完整会导致样式丑陋但不崩溃（与 DSH 的 token 语义一致，`practices.md:34`）；缓解：提供映射表 + 截图验收。

**验收标准**
- `usage-total`：在 Aurora 的 composer dock 显示当前会话用量总计；数字与 `usage` 服务聚合一致；切换会话/语言后正确刷新；禁用插件后组件消失且无泄漏。
- `notice`：模型调用 `notice` 工具 → Aurora 左上浮层出现卡片；点击跳转会话、右键回复落库；停用插件后卡片与订阅消失；崩溃注入不影响主界面。
- 权限检查：两个样例的生成权限集与用户确认页一致；越权调用被拒。
- 全部 `pnpm type/lint/test/build` 绿；新增 shim 的 Node 单测（manifest 翻译、权限推导、props 投影纯函数）。

### 6.4 阶段依赖与里程碑

```text
Phase 1 服务子集 ──► Phase 2 装载与沙箱 ──► Phase 3 DSH 适配
   (cordis 4.1)        (RPC/权限/三确认)        (shim + 2 个样例)
        │                    │                      │
        └──── UI 挂载点 ─────┴──────────────────────┘
```

- Phase 1 可与 UI 迁移并行：服务先上线，UI 调用逐批替换（`SettingsDialog` → `ChatInput` → `AssistantMessage`）。
- Phase 2 不依赖 Phase 3；Phase 3 只依赖 Phase 2 的 RPC 与权限，不依赖 UI 挂载点全部完成（纯 Host 插件如 todo-list 可提前验证）。

---

## 7. 明确不支持的清单（及插件作者需要改的地方）

### 7.1 不支持（硬限制）

| DSH 能力 | 为什么不支持 | 插件作者替代 |
|---|---|---|
| `node:fs` / `node:path` / `node:http` / `node:child_process` / `node:os` | 浏览器没有 Node 运行时；Aurora 是纯前端 | 数据 → `storage`；路径 → 宿主 RPC（Phase 3 再定）；HTTP → `net.fetch`；进程 → 无 |
| `process.env` / `$DSH_HOME` / 任意绝对路径 | 无进程环境与文件系统 | `env.get` 白名单；插件私有数据 → `storage` |
| Electron 主进程 API（`BrowserWindow`、`ipcMain`、`app`、`dialog`、`shell`） | 壳不向页面暴露；安全边界 | 无；这类插件不迁移 |
| 原生模块（`koffi`、`sharp`、`sherpa-onnx`、`node-pty`、`sqlite3`） | 浏览器不能加载原生动态库 | 用 WASM（`sql.js` 已是先例）或纯 JS 替代；否则不迁移 |
| `ctx.webServer.register`（HTTP/SSE 路由） | 浏览器无监听端口；`app://` 协议不开放 | 改 `transport` RPC + 事件订阅（notice 样例即此路径） |
| `@Remote`/`@RemoteScope` + Typert 生成物 | 需要 DSH 的编译期代码生成（`api-gateway.md:100-120`） | 改 `transport` RPC，或直接改写成 Aurora 服务调用 |
| `ctx.connection`（Peer/认证/`/api` 信任） | 单用户本机应用，无多 Peer | 用安装三确认 + 权限 + 沙箱级别 |
| `ctx.approval` 的 session-turn 前置（`approval.md:86`） | Aurora 无「turn 打开」概念 | `approval.request` 只要求「当前有活动会话」；无会话时 `unavailable` |
| `ctx.sandbox` / `ctx.sandboxPolicy`（进程 confinement、workspace root） | 没有子进程与工作区概念 | 无；用沙箱级别（worker/iframe/none）替代 |
| `ctx.fs` / `ctx.shell` / `ctx.terminals` / `ctx.subagents` / `ctx.jobs` / `ctx.skills` / `ctx.goals` / `ctx.schedule` / `ctx.planMode` / `ctx.workspaceRegistry` | DSH 产品内核，Aurora 形态不同 | 无；插件需去掉对应功能 |
| `ctx.loader` / `cordis.patch.yml` / profile 层叠 / HMR | Aurora 没有 Cordis Loader | 插件配置走 `plugin.json.config` + 设置页；重载 = 手动禁用/启用 |
| `ctx.llm` 的 `LlmAdapter/StreamChunk` 协议 | Aurora 的 provider 层是自己的 `CanonicalRequest/Delta` | 用 `api.registerProvider`（Aurora 协议）；不要照搬 DSH adapter |
| 页面内直接操作宿主 DOM / 读其他插件 DOM / `document.body` 追加 | DSH 也禁止（`$SKILL/dsh-doc/references/practices.md:31-36`；`$SKILL/dsh-doc/references/practices.md:33`），Aurora 沙箱进一步禁止 | 用 slot 注册；iframe 内只能操作自己的文档 |
| 运行时 npm 安装 / 动态 `import(url)` 任意远程模块 | 供应链与 CSP 风险 | 插件必须提交打包产物；依赖由插件作者打包进去 |
| 多窗口/多页面同步的插件私有通道 | Aurora 的同步是多窗口 store 机制（`bindChatSync`，`store.ts:345`） | 插件不要自己开 BroadcastChannel；由宿主事件转发 |

### 7.2 插件作者改造清单（按顺序）

1. **改清单**：把 `package.json` 的 `dsh` 字段换成 Aurora `plugin.json` v2；`exports["./client"]` → `entry.client`；`dsh.bundle.patch` 丢弃；补 `sandbox`、`permissions`、`engines.aurora`。
2. **拆两半**：Host 逻辑（原来的 Node 半）→ Worker 入口，去掉所有 `node:*` / `process` / 文件路径；UI（原来的 Client 半）→ iframe 入口（自渲染）或 `none` 页面内入口（复用 DSH slot 兼容）。
3. **换能力**：`ctx.webServer` → `transport` RPC；`node:crypto.randomUUID` → `crypto.randomUUID()`；`node:fs` → `storage`；`fetch` → `net.fetch`（声明 `network`）；`ctx.sessionController` → `sessions` 服务方法。
4. **改 UI 注册**：DSH slot 名 → Aurora slot 名（映射表见下）；组件只依赖注入的 props，不 import Aurora 内部模块。
5. **改 props**：`useSession/useProjection/useSessions/useChat` 由 shim 投影；如果用了未投影的 hook（如 `useConversation`、`useTrajectory`、`usePanelInfo`），必须改写或降级。
6. **补权限**：按实际调用声明权限；越权会在运行期被拒（fail-closed）。
7. **补文案**：用 `ctx.locale.register(ns, {zh, en})` 注册自己的字典；不要依赖 Aurora 的 `TranslationKey`。
8. **补清理**：所有注册返回 disposer；Worker/iframe 里的定时器、监听、objectURL 必须清理；卸载测试必须通过。
9. **主题**：用 `--dsw-alias-*` 的映射变量（Phase 3 提供映射表），不要在组件里写死颜色（`R-022`/`R-023`/`R-026` 的宿主对齐要求同样适用）。
10. **验收**：在 Aurora 的 `pnpm type/lint/test/build` 之外，跑「安装→启用→使用→禁用→卸载→重装」全流程。

### 7.3 slot 名映射（DSH → Aurora，Phase 3 初始集合）

| DSH slot | Aurora slot | 备注 |
|---|---|---|
| `conversation.composer.dock` | `composer.dock` | usage-total 用（`client.js:492`） |
| `conversation.composer.bar` 内 `.input.left/.input.right` | `composer.dock`（合并） | Aurora 没有细分左右槽 |
| `shell.overlay` | `shell.overlay` | notice 用（卡片） |
| `conversation.session.header.actions` | `message.action`（降级） | Aurora 没有会话头操作区；降到消息动作条 |
| `settings.*`（DSH 设置页自定义分区） | `settings.section` | 用 `ctx.settings.configure` 的 DSH 插件需改写为直接注册 React |
| `sidebar.panel.*` | `sidebar.panel` | 会话侧栏面板 |
| `conversation.chat.node`（自定义消息节点） | **不支持** | 需要 Conversation 装配层；插件只能改 `message.action` |

---

## 8. 附录

### 8.1 证据索引（关键文件）

DSH（`$DSH = D:\Apps\DeepseekHarness\resources\app.asar\dsh\node_modules\@deepseek-ai`）：

- `$DSH/dsh/package.json`（CLI 包，版本 `0.2.2-rc.3`）
- `$DSH/cordis/package.json:4`（vendored cordis 4.1.0）
- `$DSH/dsh/docs/architecture.md`（profile/bundle、turn flow、扩展点表）
- `$DSH/dsh/docs/cordis-primer.md`（五概念、dispatch mode、waterfall 语义）
- `$DSH/dsh/docs/cordis-api/{context,fiber,registry,events,service,inherited}.md`
- `$DSH/dsh/docs/subsystems/{core,session,session-projection,tools,commands,settings,storage,system-prompt,approval,sandbox,web-server,client-modules,slots,web-client,session}.md`
- `$DSH/dsh/docs/api-gateway.md`（Typert Remote、`/api`）
- `$SKILL/dsh-doc/references/{host-plugin,plugin-development,composition-reference,configuration,practices,ui-plugin}.md` 与 `packages.md`
- `$SKILL/dsh-doc/templates/decoration/*`（Host/Client 双半最小模板）
- 本机样例：`D:\Projects\Deepseek_Harness_Workspace\dsh_plugins\{notice,change-style,dsh-usage-total,dsh-todo-list}\`
- 本机 profile：`C:\Users\Administrator-Local\.dsh\profiles\desktop\package.json`（43 个 bundle = 2 官方 + 41 `@local`；55 个 `link:` 依赖）

Aurora（`$AURORA = G:\work\projects\aurora-chat-app\web`）：

- `$AURORA/package.json:29`（cordis 4.0.0-rc.13）
- `$AURORA/src/app/context.ts`（容器、六服务、start/dispose、reset）
- `$AURORA/src/app/{App.tsx,AppServices.tsx,bootstrap.ts}`
- `$AURORA/src/services/plugins/*.ts`（六个服务的 API 面）
- `$AURORA/src/services/{settings.ts,chat/store.ts,preset/types.ts,style/types.ts,usage/store.ts,memory/*}`
- `$AURORA/src/components/settings/SettingsDialog.tsx`、`src/components/{chatInput,messages}/`
- `$AURORA/src/index.html:14-17`（CSP）
- `$AURORA/tests/run.mjs`（Node 测试方式：tsc 到 `.test-build/` 再 `node --test`）
- `G:\work\projects\aurora-chat-app\docs\{architecture.md,plugins.md}`

### 8.2 本次未验证项（实现前必须补齐）

1. **未使用 `cordis_inspect_*` 实时检查**：本次是读安装产物源码与文档；运行中的客户端 slot 树、Client 服务实际注册状态没有 live 校验。Phase 1 前建议实际跑一次 `cordis_inspect_query`（`slots.listSubTree`）确认 slot 名与 props。
2. **DSH 版本漂移**：本文基于 `0.2.2-rc.3`；DSH 升级后 `slots`/`dsh.client`/Typert 契约可能变化，兼容层需锁定版本（`DSH_COMPAT = '0.2.2'`）。
3. **Aurora 未跑构建**：本文所有 Aurora 结论来自静态阅读，未执行 `pnpm type/lint/test/build`；Phase 1 开工前应先跑一遍基线。
4. **桌面壳/Android 未验证**：blob Worker、iframe `srcdoc`、`app://` 协议下的 CSP 与动态脚本加载未实测；需要 `desktop/main.js` 与 Android WebView 的真机验证。
5. **DSH 未验证项**：`ctx.webServer` 自定义路由的鉴权边界（是否自动套用 Connection 信任）只从文档推断；插件若自行注册路由，安全责任在插件（notice 没有显式鉴权）。这一条如果在兼容层复刻，必须补鉴权或改用 RPC。
6. **配额/性能**：IndexedDB 配额、事件风暴、Worker 内存上限没有实测数据。

### 8.3 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| 服务层改造触碰 `chat/store.ts` | 流式回复/多窗口同步回归 | Phase 1 只加只读导出与事件；写路径零改动；回归测试覆盖 `bindChatSync/bindChatPersistence` |
| 事件风暴（`reply/chunk`） | UI 卡顿、postMessage 阻塞 | 批量窗口 50 ms；只对订阅者转发；Phase 1 先不 emit chunk |
| DSH 兼容层范围失控 | 兼容大量 DSH-only API 导致复杂度爆炸 | 白名单 + 明确不支持清单 + 两个样例验收；不做 Typert/webServer/node |
| `none` 信任模式被滥用 | 安全承诺失效 | 默认拒绝；二次确认 + 永久标识；插件列表可见沙箱级别 |
| cordis 升级破坏 rc.13 行为 | 现有六服务异常 | 升级前先加 `context.ts` 的启动/卸载单测（当前 `tests/app-bootstrap.test.mjs` 只覆盖 bootstrap 分支） |
| iframe 与宿主主题/locale 割裂 | UI 不一致 | 初始化时下发 theme tokens 快照 + locale；变更时广播；插件必须监听 |
| 插件数据丢失 | 用户投诉 | 卸载默认保留数据 30 天；卸载弹窗明确「删除数据」二次确认 |


