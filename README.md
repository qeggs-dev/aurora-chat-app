# Aurora Chat

自带 API Key、可自由换外观的聊天客户端。界面与部分代码基于开源项目
[chat-demo](https://github.com/deepseek-ai/chat-demo)，并在此基础上扩展了样式包、
多协议 API 预设、用量统计、本地记忆与自动上下文压缩。

> Aurora Chat 是社区项目，**不是 DeepSeek 官方产品**，未获授权或背书。

## 能做什么

- **三种 API 协议**：Anthropic Messages / OpenAI Chat Completions / OpenAI Responses；
  支持 DeepSeek 官方 API 与兼容端点，预设可在界面里导入 zip 或分栏编辑。
- **样式包**：背景、图标、字体、配色、图片特效，亮/暗各一套资源；内置极光包，也支持导入自己的 zip。
- **用量统计**：记录每次请求的 token 与耗时，按模型汇总，可导出 JSON / CSV。
- **本地记忆**：SQLite 存储，模型通过 `memory_write` / `memory_search` 工具读写。
- **自动上下文压缩**：长对话自动摘要，避免超出上下文。
- **三平台**：Windows（安装器 / 便携版）、Linux（AppImage / deb）、Android（APK）。
- 深色 / 浅色 / 跟随系统，数据全部保存在本机。

**不适合**：不想自己配置 API Key，或需要官方账号体系与官方支持的用户。

## 下载

安装包发布在 [Releases](https://github.com/qeggs-dev/aurora-chat-app/releases)：

| 平台 | 文件 | 说明 |
|---|---|---|
| Windows | `aurora-chat-<版本>-win-x64.exe` | NSIS 安装器 |
| Windows | `aurora-chat-<版本>-win-x64.zip` | 免安装便携版 |
| Linux | `aurora-chat-<版本>-linux-x86_64.AppImage` / `-linux-amd64.deb` | AppImage 免安装；deb 适用于 Debian/Ubuntu |
| Android | `aurora-chat-<版本>-release.apk` | release 签名；CI 另附 `*-debug.apk` |

## 快速开始

1. 安装并打开；
2. 设置 → 通用设置 填 API Key（只保存在本地）；
3. 设置 → 预设 选协议、端点与模型（可点「获取模型列表」从 `/models` 拉取）；
4. 开始对话。

## 项目结构

```
web/      应用源码（独立仓库 aurora-chat-web，fork 自 chat-demo）
desktop/  Electron 桌面壳与 electron-builder 配置
mobile/   Capacitor Android 壳
scripts/  构建脚本（build-web / build-desktop / build-mobile / build-all）
docs/     文档
tools/    示例样式包与品牌图生成器
out/      构建产物（gitignored）
```

## 文档

- [构建与发布](docs/build.md) —— 三平台打包、CI、Android release 签名、本机构建注意事项
- [自定义样式包](docs/style-packs.md) —— 包结构、index.json、资源 ID、默认路径、特效、配色与安全边界
- [API 预设](docs/presets.md) —— 三种协议、预设配置、模型列表
- [用量、记忆与上下文压缩](docs/data-and-memory.md) —— 用量统计、SQLite 记忆、自动压缩
- [架构](docs/architecture.md) —— 代码结构、服务层与启动流程
- [插件](docs/plugins.md) —— Cordis 插件规范
- [名称、声明与许可](docs/licensing.md) —— 非官方声明、上游许可、商标与分发清单

## 已知限制

- Windows / Linux 包未做代码签名，系统可能提示「未知发布者」；
- 首次使用需要自备 API Key；
- 从 debug 包换装 release 包需要先卸载（会清数据）。

## 声明与许可

本项目是社区维护的客户端，不是 DeepSeek 官方产品，未获授权或背书；上游 chat-demo 为 MIT 许可。
本项目代码以 MIT 发布（见 [LICENSE](LICENSE)），上游许可原文见 [LICENSE-UPSTREAM](LICENSE-UPSTREAM)，更多说明见 [docs/licensing.md](docs/licensing.md)。
