# 插件系统设计（第三方 Cordis 插件）

> 状态：设计稿，尚未实现（排在 0.3.1 之后）。目标：App 内部架构 Cordis 化，并支持用户安装第三方插件。

## 1. 插件包格式

```
plugin.json          # 清单（必需）
index.js             # 入口（service 型）
ui/index.js          # 入口（ui 型，可选）
icon.png / LICENSE   # 可选
```

```jsonc
{
  "schema": 1,
  "id": "com.example.my-plugin",   // 反向域名，唯一
  "name": "示例插件",
  "version": "1.0.0",
  "author": "someone",
  "description": "...",
  "type": "service",               // service | ui
  "entry": "index.js",
  "permissions": ["settings.read", "network"],
  "requestedSandbox": "worker",    // worker | iframe | none（用户可降级）
  "engines": { "dslike": ">=0.4.0" }
}
```

- 权限在 RPC 层强制执行；未声明的能力直接拒绝并记录日志。
- 安装后存 `IndexedDB dslike-plugins`：manifest、代码 Blob、启用状态、安装时间、用户选择的沙箱级别、首次确认是否已完成。

## 2. 沙箱级别

| 级别 | 适用 | 能力边界 |
|---|---|---|
| `worker`（默认，service 型） | 后台逻辑 | 无 DOM / localStorage / 直接网络；只能调白名单 RPC（custom API adapter、memory、tools、settings 只读等） |
| `iframe`（默认，ui 型） | 界面扩展 | `sandbox="allow-scripts"` 独立文档，无同源存储；通过 postMessage 在指定挂载点渲染 |
| `none`（用户显式选择） | 完全信任 | 直接加载，等同 App 代码；列表永久标注「未隔离」 |

## 3. 安装确认（首次生效 + 按钮异位）

**只在设备上「第一次安装任何外部插件」时启用三步确认**；之后安装只需一次普通确认（升级同 id 插件同样一次）。首次完成后写 `localStorage` 标记（含时间与版本），清除应用数据会重新触发。

三步确认的硬性要求：

1. **每一步的确认按钮位置不同**（防止肌肉记忆/连点）：
   - 第 1 步：对话框右下角；
   - 第 2 步：对话框左上角（或标题左侧）；
   - 第 3 步：对话框底部居中；
   - 每步切换后按钮有 ≥800ms 的禁用冷却，且步骤之间不可用键盘 Enter 直接跳。
2. **第 1 步**：风险告知（不审核、可能读取 API Key/会话、可发起网络请求、可导致崩溃；风险自负）。
3. **第 2 步**：插件清单（id/名称/版本/作者/文件列表与哈希/权限/沙箱级别），必须勾选「我已了解上述权限」。
4. **第 3 步**：必须勾选「我知道该插件未经验证，安装风险由我承担」，点「确认安装」；若用户把沙箱降级为 `none`，第 3 步额外要求勾选「我放弃沙箱保护」。

安装完成后插件出现在 `设置 → 插件`：权限列表、启用/禁用、卸载（删除代码与数据）、「未隔离 / 已隔离」标识。

## 4. 运行时

- 内部服务先 Cordis 化：`settings / api / presets / style / memory / usage` 作为内置插件注册进同一个 Context；
- service 型插件在 Worker 中启动，宿主提供 RPC：`ctx.plugin.call(...)` 受限接口，按权限白名单校验参数与频率；
- ui 型插件在 iframe 中启动，宿主提供挂载点（设置页分区、消息区工具条等）与 postMessage RPC；
- 插件崩溃/超时：捕获、禁用并提示，不影响主界面；
- 卸载：terminate worker / 移除 iframe、删除 IndexedDB 记录与缓存、释放 objectURL。

## 5. 实施阶段

1. `cordis-refactor`：Context + 六个内置服务注册 + dispose；
2. `plugin-runtime`：清单/安装 UI/首次三步确认（按钮异位）/Worker RPC/iframe 挂载；
3. `plugin-direct`（可选）：无隔离模式与标识。

## 6. 风险与限制

- 沙箱不等于绝对安全：有网络权限的插件仍可能外传数据；权限声明与用户确认是最后防线；
- 外部插件不在本项目审核范围内，安装即自担风险；
- 移动端（Android WebView）对 Worker/iframe 的支持与性能需真机验证。
