# API 预设（Preset）

设置 → 预设 管理 API 配置。每个预设对应一份 `api_configs.json`，可以 `.zip` 导入，也可以直接在页面里编辑：

- **预设标签栏**：每个预设一个标签；`＋ 新建` 创建后立即切到该标签；标签上显示「已启用」徽标与未保存圆点。
- **分栏编辑**：`API 设置`（协议 / base_url / model）、`模型参数`（temperature / top_p / max_tokens / stop / penalties / seed / reasoning_effort）、`提示词`（system prompt，留空用应用自带）、`记忆`（开关、检索条数与只读记忆列表）、`上下文压缩`（开关 / 触发阈值 / 保留条数 / 摘要提示词）。
- **三种协议**：`anthropic`（Messages，含 DeepSeek 兼容扩展）、`openai`（Chat Completions）、`responses`（OpenAI Responses）；请求由适配层统一编译，流式事件归一化后进入现有会话模型。
- **运行时元信息**：每次请求在 system 提示词后追加一段动态环境（`platform` 由 `Capacitor.getPlatform()` / Electron UA 计算，另含版本、语言、主题与时间）。
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
