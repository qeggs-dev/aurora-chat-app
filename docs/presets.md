# API 预设（Preset）

设置 → 预设 管理 API 配置。每个预设对应一份 `api_configs.json`，可以 `.zip` 导入，也可以直接在页面里编辑（**zip 导入的预设只读**，见下文「导入预设只读」）：

- **预设标签栏**：每个预设一个标签；`＋ 新建` 创建后立即切到该标签；标签上显示「内置 / 导入 / 已启用」徽标与未保存圆点。
- **分栏编辑**：`基本信息`（名称 / 描述 / 作者 / 版本 / 版权声明 / 只读 id）、`API 设置`（协议 / base_url / model）、`模型参数`（temperature / top_p / max_tokens / stop / penalties / seed / reasoning_effort）、`提示词`（system prompt，支持模板变量；留空 = 请求里不发送 system）、`记忆`（开关、检索条数与只读记忆列表）、`上下文压缩`（开关 / 触发阈值 / 保留条数 / 摘要提示词）。
- **三种协议**：`anthropic`（Messages，含 DeepSeek 兼容扩展）、`openai`（Chat Completions）、`responses`（OpenAI Responses）；请求由适配层统一编译，流式事件归一化后进入现有会话模型。
- **提示词不再自动追加运行环境**：system 就是 `提示词` 输入框里的完整内容（模板渲染后）；需要平台/版本/语言/主题时，在提示词里显式写 `{{env.*}}`。留空时请求里不出现 system 字段。
- **API Key 不写入预设**：Key 仍在「数据管理」里全局配置。

```json
{
  "schema": 1,
  "id": "deepseek-openai",
  "name": "DeepSeek（OpenAI 兼容）",
  "protocol": "openai",
  "base_url": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "params": { "temperature": 0.7, "top_p": 0.95, "max_tokens": 4096 },
  "system_prompt": "可选；留空用应用自带提示词",
  "compaction": { "enabled": true, "trigger_tokens": 32000, "keep_recent_messages": 8 },
  "memory": { "enabled": false, "max_results": 8 }
}
```

zip 内可附图标、许可证与提示词文件；压缩包 ≤5 MB、解压 ≤10 MB、条目 ≤100。三个路径字段**都可省略**：省略时按下面的默认位置查找，找不到就视为未提供（不报错、不阻塞导入）。

| 字段 | 显式写法 | 默认位置（按序尝试） | 说明 |
| --- | --- | --- | --- |
| `icon` | `{ "file": "…" }` | `icon.png` → `icon.webp` → `icon.svg` → `icon.jpg` → `icon.jpeg` | 文件名 `icon`，图片直接放 zip 根目录；大小写不敏感 |
| `license` | `{ "file": "…" }` | `LICENSE` → `LICENSE.txt` → `LICENSE.md` | 全文读入预设，≤200 KB；大小写不敏感 |
| `system_prompt_file` | 字符串路径 | `system_prompt.md` → `prompt.md` | 只在既没写 `system_prompt_file`、也没写内联 `system_prompt` 时启用；默认文件同样优先于「应用自带提示词」 |

- **显式路径仍然严格**：写了 `icon` / `license` / `system_prompt_file` 但文件不存在，或扩展名 / 大小不合规，照旧报 `missingFile` / `badFileType` / `tooLarge`，不会静默回退默认位置。
- 默认位置命中的文件同样走原有校验（图标扩展名、许可证 ≤200 KB、提示词文件 ≤64 KB）；不合规时按同样的错误码失败，而不是静默忽略。
- 解析后 `icon` / `license` / `system_prompt_file` 会补成 zip 内的真实条目名（随预设存进 IndexedDB）；手写 JSON 建的预设没有 zip，因此仍然没有图标 / 许可证文件内容。
- 显式 `system_prompt_file` 与内联 `system_prompt` 同时存在时，沿用旧规则：文件内容优先。

## 提示词模板

`提示词` 面板里的 system prompt 就是模板：请求前会把 `{{…}}` 变量替换成**当前生效配置**与运行环境的实际值。没有变量时提交内容与输入逐字一致（不自动追加任何元信息）；输入为空时请求里不发送 system。

- **语法**：双花括号，变量名内部允许空格，例如 `{{preset.model}}` 与 `{{ preset.model }}` 等价。
- **替换时机**：每次构造请求时渲染（不改写预设里保存的原文）；同一变量出现多次会全部替换。
- **未识别的变量保留原样**，不会被清空（`{{preset.system_prompt}}`、`{{foo}}` 不参与求值），方便逐步调试模板。
- **不提供时间变量**：时间会让提示词前缀每轮变化，破坏 KV cache；需要时间请写进用户消息。
- **不提供 `preset.system_prompt`**：提示词引用自身会递归。
- `preset.dump` 是完整预设摘要（JSON，**不含 system_prompt 自身与 API Key**），适合一次注入全部配置；也可以按需只取单个变量。

| 变量 | 说明 |
| --- | --- |
| `{{preset.name}}` | 生效预设名称（未启用预设时为「应用自带的默认配置」） |
| `{{preset.id}}` | 生效预设 id（未启用预设时为内置默认 id `default`） |
| `{{preset.protocol}}` | 协议：`anthropic` / `openai` / `responses` |
| `{{preset.base_url}}` | 接口地址（已去掉结尾斜杠） |
| `{{preset.model}}` | 模型名 |
| `{{preset.params}}` | 参数 JSON，如 `{"temperature":0.7,"top_p":0.95,…}` |
| `{{preset.memory}}` | 记忆配置 JSON，如 `{"enabled":false,"max_results":8}` |
| `{{preset.compaction}}` | 压缩配置 JSON，如 `{"enabled":true,"trigger_tokens":32000,…}` |
| `{{preset.dump}}` | 上面的完整摘要（稳定、可读 JSON） |
| `{{env.platform}}` | 运行平台：`android` / `ios` / `desktop` / `web` |
| `{{env.app}}` | 应用名（`Aurora Chat`） |
| `{{env.version}}` | 应用版本（构建时写入；拿不到时保留占位符） |
| `{{env.locale}}` | 界面语言，如 `zh-CN` |
| `{{env.theme}}` | 界面主题：`light` / `dark` |

**未启用预设**（默认预设没有任何覆盖字段）时，`preset.*` 展开为应用自带的默认配置：协议 `anthropic`、默认 base_url（`<API Origin>/anthropic/v1`）、默认模型 `deepseek-flash`、默认记忆（关闭、8 条）与默认压缩（开启、32000 tokens、保留 8 条）；`{{preset.params}}` 只包含**显式填写**的采样参数（全部留空时是空对象），而不是补一整套默认值。

示例：

```text
你是 {{env.app}} 里的助手，当前模型 {{preset.model}}，参数 {{preset.params}}。
运行平台：{{env.platform}}；界面语言：{{env.locale}}。
```

渲染后（示意）：

```text
你是 Aurora Chat 里的助手，当前模型 deepseek-flash，参数 {"temperature":1,"top_p":1,"max_tokens":4096,…}。
运行平台：web；界面语言：zh-CN。
```

## 导入预设只读

- zip 导入的预设带「导入」徽标，**不可编辑**：打开后所有可编辑字段（协议 / base_url / model / 参数 / 提示词 / 记忆 / 压缩等）禁用，不显示「保存」按钮，并给出一行说明。
- 服务层同样强制：对导入预设调用保存 / 重命名等修改接口会直接失败（稳定错误码 `importedReadOnly`），不依赖界面是否禁用。
- 删除允许；想改内容时用「复制为新预设」：从导入预设创建一份可编辑副本（自动去掉只能来自 zip 的图标 / 许可证 / 提示词文件引用，提示词用已解析的文本），保存后即为用户自建预设。
- **内置默认预设不受影响**：它不算导入包，始终可编辑。留空的协议 / Base URL / 模型 / 提示词 / 记忆 / 压缩会以提示或默认值展示；**采样参数留空 = 不发送（由接口默认）**，提示词留空 = 不发送 system。
- 旧数据里没有来源标记的预设按 `created` 处理，保持向后兼容。

## 采样参数与提示词提交语义

- **采样参数留空 = 不发送**：temperature / top_p / max_tokens / stop / penalties / seed / reasoning_effort 只有在预设里显式填写时才写进请求体；留空时字段省略，让接口提供方决定默认值。设置页会提示「留空 = 不发送（参考默认：…）」。
- **提示词 = 完整 system**：输入框内容（经模板渲染后）就是提交的 system；为空时请求体里没有 system 字段，不再使用应用自带提示词兜底，也不追加「运行环境：…」。需要环境信息请显式写 `{{env.*}}`。
- **协议例外**：官方 Anthropic Messages 协议本身要求 `max_tokens`，留空时适配层仍会使用协议级兜底值（这是协议要求，不是预设默认值）；DeepSeek 兼容端点与其它协议留空则完全不发送。

## 保存 ≠ 启用

保存或导入预设**不会**切换当前启用项。编辑器会常驻提示「该预设尚未启用」，保存未启用预设后状态栏也会提示点「启用」；草稿有未保存修改时点「启用」会被拦截并提示先保存，避免读取旧配置覆盖编辑内容。

## 元信息必填

非内置预设的 `description` / `author` / `version` / `copyright` 在**保存**与 **zip 导入**时都必须非空（trim 后）：

- 保存时字段级报错（`missingDescription` / `missingAuthor` / `missingVersion` / `missingCopyright`）；
- 导入时同样校验；但**包内带完整 LICENSE 文件时，版权声明可由该文件承担**（详情页展示许可证全文），两者都没有才拒绝整个导入包；
- 内置默认预设豁免（只需要名称）；旧预设缺字段仍可打开编辑，补齐后才能保存；导入只读预设不保存，故不受保存校验影响。

## 模型列表

点「获取模型列表」后会请求当前协议对应的 `/models`，并在模型输入框下方显示**可滚动列表**（max-height 240px）：点击一行即选中并写入 model，当前项高亮。模型很多时列表内部滚动；接口返回 0 个模型、请求失败、加载中分别有明确提示。

## 兼容模式（不发送 DeepSeek 私有扩展）

设置 → 通用设置里有「兼容模式（不发送 DeepSeek 私有扩展）」开关，默认关闭，偏好保存在
localStorage 的 `chat-demo:compatibility-mode`。

开启后请求层（`src/services/api/client.ts`）在发送前移除 DeepSeek 专属内容，对默认 DeepSeek 端点、
DeepSeek Anthropic 兼容预设以及 OpenAI Chat / Responses / 官方 Anthropic 等所有协议一视同仁：

- 不发送 `safety_check`、`title`、DeepSeek 服务端工具（`deepseek_web_search` / `deepseek_read_url`）与 `latest_reminder` 角色；
- 不发送 `thinking.effort`（`thinking.type` 仍由「深度思考」开关决定）；
- thinking 不再因为 title / safety_check / 服务端工具存在而被强制开启；DeepSeek 兼容端点上的客户端记忆工具仍会强制 thinking（服务端硬约束，否则返回 400），兼容模式不影响这一点；
- 标准采样参数（temperature / top_p / max_tokens / stop / penalties / seed）与消息结构保持不变。

关闭开关时请求体与加入该功能前完全一致，默认行为无回归。
