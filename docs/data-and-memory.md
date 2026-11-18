# 用量、记忆与上下文压缩

## 用量统计

设置 → 用量统计：

- 每次请求结束记录一条用量：协议、模型、输入（未命中缓存）、缓存命中输入、输出、推理 token、搜索次数、耗时；
- 面板显示总 Token、缓存命中率、平均生成速率、推理/搜索/安全审查用量与最近请求列表，可一键清空；
- 当前预设指向 `api.deepseek.com` 时，顶部显示账户余额（`GET /user/balance`，可刷新）。

## 记忆（SQLite）

预设里开启「记忆」后，模型会拿到两个**固定参数**的工具（不能执行任意 SQL）：

- `memory_write`：写入一条自包含事实（`content` + 可选 `tags` / `section`，内容 ≤2KB、标签 ≤4 个）；
- `memory_search`：按关键词 / 标签 / 分区检索（`limit` 1–20）。

存储用 `sql.js`（WASM）内存 SQLite，表结构对齐工作区记忆库子集：`sections` / `entries` / `entry_tags`，软删除（`status='archived'`）。快照防抖写入 IndexedDB（`dslike-memory`），启动先 `PRAGMA quick_check`，坏库回退上一份快照。工具调用执行后把结果作为 `tool_result` 回灌给模型继续生成，最多 3 轮。

> DeepSeek 的 Anthropic 兼容端点有硬性约束：客户端工具与 `title` / `safety_check` / 服务端工具同时出现时，请求必须处于 thinking 模式。应用会在带记忆工具的 DeepSeek 兼容请求里自动启用 thinking，其余协议不受影响。

## 上下文压缩

开启后按 `chars/4` 估算 token，达到 `trigger_tokens` 且消息条数超过 `keep_recent_messages` 时：

1. 保留最近 N 条（切口回退到 user 消息，不拆一问一答）；
2. 把更早的消息交给当前模型生成摘要（默认 8 段模板，可用预设 `prompt` 覆盖）；
3. 摘要以一条 `<compacted-summary>` 的 user 消息放在历史最前，被覆盖消息不再发送但保留在本地；
4. 再次触发时合并旧摘要，始终只有一条摘要；失败只 warn，不阻塞本轮回复。
