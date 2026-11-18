# 极光示例样式包（aurora.zip）与图标规范

`tools/style-fixture/gen.mjs` 生成 5 个样式包 zip，其中 **`aurora.zip`** 是随应用分发、作为内置默认的「极光」样
式包（`id=aurora`，schema 1，版本 **1.2.3**）：

| 内容 | 说明 |
| --- | --- |
| 背景 | `assets/<theme>/{main,chat,sidebar}.png`，抽象极光 + 星点，480×720 |
| 包图标 / 详情页封面 | `assets/<theme>/{icon,cover}.png`，1024² / 1440×1920，按主题各一张 |
| **图标** | **`assets/icons/<theme>/<slot>.png`，40 个语义槽位 × 亮/暗两套 = 80 张**，192×192 透明底 |
| 清单 | `index.json`（含 `color_palette`、资源 ID、1.2.3 版本号）、`LICENSE` |

`bg-effects.zip` / `bad-color.zip` / `bad-window.zip` / `bad-pkg-tilt.zip` 是导入 / 校验用异常包，继续使用旧的
简易线条图（`iconPng`）以便它们的字节保持稳定，**不属于本规范范围**。

---

## 1. 图标统一规范

40 个槽位全部遵循同一套规范；改图标时改 `gen.mjs` 里的 `ICON_GLYPHS`，不要手改 PNG。

### 1.1 画布与线宽

| 项 | 取值 | 说明 |
| --- | --- | --- |
| 逻辑画布 | 96×96 | 几何全部按 96 单位书写 |
| 导出 | **192×192** RGBA 透明底 PNG | 2× 导出，24/16px 显示时仍有高分屏余量 |
| 主体 | 最长边约占画布 **69–80%** | 四周留 10–14 逻辑像素，窄/扁图标的另一条边按比例自然变小（如 chevron、menu 圆点行） |
| 线宽 | **7/96**（≈1.75px@24、1.17px@16） | 全局唯一描边宽度，圆头端点 + 圆角转折；不使用 <5/96 的细线 |
| 圆角 | 面板 / 圆角矩形 10–16；小元素（铅笔身、书签）5–6 | 同类元素（面板、文件、箭头）保持一致 |
| 抗锯齿 | SDF 距离场 → 1px 覆盖率 | `iconPainter` 内实现；无随机数、无绘图库、无时间戳 |

### 1.2 配色

| 用途 | 亮色主题 | 深色主题 |
| --- | --- | --- |
| 主笔画 | `#16233f`（深蓝） | `#e9f3ff`（近白浅蓝） |
| 点缀渐变 | `#0f8ed6` → `#7a4fd8`（青蓝→紫，加深版） | `#6ed0ff` → `#c096ff`（青蓝→紫） |
| 渐变方向 | 统一「左下青蓝 → 右上紫」 | 同左 |

- 点缀色（极光渐变）**每枚图标最多出现一处关键细节**：可以是箭杆、一条光丝、一个圆点、一个实心块；
  其余笔画一律用主笔画色。
- 对比度（WCAG，相对各自的包背景）：亮色主笔画 **14.62:1**、亮色点缀 3.36–5.0:1；
  深色主笔画 **17.44:1**、深色点缀 8.43–11.3:1。亮色点缀用加深版正是为了在 `#f3f8ff` 浅底上 ≥3:1。
- 少量语义化实心填充：`stop`（停止）、`play`（播放）、`menu`（更多圆点）、`thinking`（星芒）、
  `setting.dark`（月亮）、`exit_sidebar`（左栏实心）、以及各图标的点缀细节。

### 1.3 造型语言

线性描边为主 + 少量实心；同一语义族的造型共享同一份几何约定：

- **箭头族**：`send` / `upload` / `download` / `back` 的箭杆用点缀渐变，箭头与托盘用主笔画；
- **面板族**：`enter_sidebar`（面板 + 向右箭头）/ `exit_sidebar`（面板 + 实心左栏）共用同一圆角面板（68×52, r12）；
- **圆角矩形族**：`copy` / `delete` 桶身 / `browse` / `setting.device` / `edit` 笔身共用 10–16 圆角；
- **声音 / 文件**：`sound_input` 用胶囊 + 半圆弧；`link_file` 回形针 4 条平行丝间距 ≈20 逻辑像素，
  缩到 16px 仍保留 ≈1.5px 空隙；
- 不使用 emoji、不写字母、不堆细节；24px 看不清的元素直接简化（例如垃圾桶不画内部双竖线、齿轮改用滑杆）。

---

## 2. 40 个槽位与造型

资源 ID：`dslike_chat.style_pkg.icon.<槽位>.<theme>`；默认文件路径 `assets/icons/<theme>/<槽位>.png`。
槽位名中的 `.`（如 `setting.usage`）直接出现在文件名里，与 README 的默认路径规则一致。

| # | 槽位 | 造型 | 点缀（极光渐变） |
| --- | --- | --- | --- |
| 1 | new_session | 加号（横竖两臂，14–80） | 竖臂 |
| 2 | enter_sidebar | 圆角面板 + 分隔线 + 向右箭头 | 箭头 |
| 3 | exit_sidebar | 圆角面板 + 实心左栏 + 分隔线 | 左栏实心 |
| 4 | thinking | 实心四角星芒（圆角转折） | 右上星点 |
| 5 | network | 地球（圆 + 赤道 + 经线椭圆） | 经线 |
| 6 | sound_input | 麦克风（胶囊 + 半圆支架 + 立杆/底座） | 支架弧 |
| 7 | link_file | 斜置回形针（连续折线，两个 U 型弯） | 最内侧短丝 |
| 8 | edit | 斜置铅笔（圆角笔身 + 笔帽线） | 实心笔尖 |
| 9 | menu | 三个实心圆点 | 中点 |
| 10 | delete | 垃圾桶（提手 + 桶盖 + 桶身，无内部细线） | 桶盖线 |
| 11 | copy | 后纸 L 形描边 + 前纸圆角矩形 | 后纸 L |
| 12 | regen | 顺时针开口圆弧 + 实心箭头 | 箭头 |
| 13 | send | 上箭头（箭杆 + 箭头） | 箭杆 |
| 14 | stop | 实心圆角方块（68×68, r16） | — |
| 15 | left_arrow | 左 chevron | — |
| 16 | right_arrow | 右 chevron | — |
| 17 | setting.setting | 三行滑杆（线 + 实心滑块） | 中间滑块 |
| 18 | setting.light | 太阳（圆环 + 8 条光芒） | 光芒 |
| 19 | setting.dark | 实心月牙 + 星点 | 星点 |
| 20 | setting.device | 显示器 + 立杆 + 底座 | 底座横杆 |
| 21 | setting.datas | 数据库（顶盖椭圆 + 侧壁 + 中/底弧） | 顶盖 |
| 22 | setting.about | 信息圆 + 感叹号（点 + 竖杆） | 圆点 |
| 23 | close | 描边交叉 ×（弹窗 / 搜索面板） | — |
| 24 | remove | **实心交叉 ×**（附件/文件卡片，线宽 12/96 与 close 区分） | — |
| 25 | check | 单笔对勾 | — |
| 26 | refresh | 双向循环箭头（两段弧 + 两枚实心箭头） | — |
| 27 | search | 放大镜（圆环 + 斜柄） | 斜柄 |
| 28 | warning | 圆角三角形 + 感叹号 | 感叹号 |
| 29 | link | 两个互相扣住的圆环（链环） | 右上环 |
| 30 | chevron_down | 下 chevron | — |
| 31 | play | 实心圆角三角 | — |
| 32 | upload | 上箭头 + 托盘 | 箭杆 |
| 33 | download | 下箭头 + 托盘 | 箭杆 |
| 34 | add | 圆环 + 加号（与纯加号的 new_session 区分） | — |
| 35 | back | 完整左箭头（箭杆 + 箭头，与 chevron 版 left_arrow 区分） | 箭杆 |
| 36 | mobile_menu | 三条等长横杠（移动端汉堡） | 中间横杠 |
| 37 | browse | 圆角文档框 + 两条内容线 | 第二条内容线 |
| 38 | setting.usage | 基线 + 三根实心柱 | 中间柱 |
| 39 | setting.style | 调色板（圆环 + 四枚色点） | 左上色点 |
| 40 | setting.preset | 列表行（圆点 + 线）× 3 | 中间一行线 |

> 槽位名映射：`icon.setting.usage` / `icon.setting.style` / `icon.setting.preset` 用点号分组，
> 与 `icon.setting.light` 等既有槽位一致；文件名为 `assets/icons/<theme>/setting.usage.png`。

---

## 3. 生成与确定性

```powershell
cd G:\work\projects\chat-demo-shell
node tools/style-fixture/gen.mjs
```

- 依赖：仅 Node 标准库（`node:zlib` + 自写 PNG / ZIP 编码），不装绘图库；
- 产物写在 `tools/style-fixture/` 下：`aurora.zip`（当前约 2.03 MB、92 个条目：80 图标 + 12 背景/封面/包图标/清单/许可）、
  `bg-effects.zip`、`bad-color.zip`、`bad-window.zip`、`bad-pkg-tilt.zip`；
- **确定性**：固定几何、无随机数、无时间戳，ZIP 时间/日期字段固定为 0；连续两次运行 `aurora.zip`
  SHA256 完全一致（实测：`68344240EB4CF836DA16009DFA7ABE61BEA739FCDE998C83B41C3056A582349F`）；
  异常包 `bg-effects.zip` / `bad-*.zip` 同样重跑字节一致；
- 单次生成约 55 s，绝大部分耗时在包图标（1024²）与封面（1440×1920）的逐像素柔和光晕，图标本身 <1 s；
- 只改图标时不必重新构建桌面 / Android；但要更新内置包，需重新跑 `scripts/build-web.ps1`（它会把
  `tools/style-fixture/aurora.zip` 拷进 `web/src/assets/builtin/` 并打进 web dist），内置包在**新 profile 首启**或
  版本号变化时自动更新到 IndexedDB。

---

## 4. 24px 可读性数据

测量方法（Pillow）：192×192 原图 LANCZOS 缩到 24×24 → 合成到对应主题包背景 → 灰度 →
3×3 Sobel 平均梯度（归一到 0–255）、图标区域内唯一颜色数、对 0.8px 高斯模糊后的清晰度比；
对比对象是旧 1.2.2 包里的 4 个图标（send / new_session / menu / copy，96px 源）。

| 指标（24px） | 新 1.2.3（40 枚平均） | 旧 1.2.2（4 枚平均） | 结论 |
| --- | --- | --- | --- |
| Sobel 边缘能量（0–255） | **66.03**（中位 63.8，最低 25.0 = menu 三圆点） | 48.83 | +35%，线条更实、边缘更锐 |
| 图标区唯一颜色数 | 55.0（最低 10，纯单色图标靠抗锯齿也有 10 色） | 65.9 | 旧图标的渐变噪点多不代表清晰；新图标色阶足够且不糊 |
| 清晰度（模糊前后边缘能量比） | 1.35（实心图标≈1.05，线形图标 1.4–1.7） | 1.44 | 实心剪影天然接近 1，不代表糊；线形图标均 ≥1.35 |
| 不透明覆盖率 | 23% | 17% | 笔画更粗，16px 下仍有 1.17px 实线 |

- 40 枚图标在 24px 下均能分出语义（重点对照：copy vs delete、menu vs mobile_menu、close vs remove、
  left_arrow vs back、regen vs refresh、add vs new_session）；
- 主体最长边 **69–80%**（40 枚实测 0.693–0.802），无贴边裁切；`menu`/`chevron_down` 等扁图标的短边天然小，属造型特性。
- 对照图：`screenshots/aurora-icons-24px-compare.png`（旧 vs 新，8× 最近邻放大）。

---

## 5. 验证产物（工作区 `screenshots/`）

| 文件 | 内容 |
| --- | --- |
| `aurora-icons-sheet-light.png` | 亮色 40 图标：96px 一行 + 24px 一行 + 槽位名 |
| `aurora-icons-sheet-dark.png` | 深色同上 |
| `aurora-icons-sheet.png` | 40 行 × 亮/暗两列（每格 96px 缩放 + 24px 原尺寸），便于逐枚人工检查 |
| `aurora-icons-24px-compare.png` | 旧 1.2.2 vs 新 1.2.3 的 24px 对照（8×） |
| `aurora-icons-verify.json` | 逐槽位 / 逐主题指标（边缘能量、颜色数、清晰度、覆盖率、主体占比、对比度） |
| `aurora-desktop-home.png` / `aurora-desktop-settings.png` | 桌面壳内实际渲染（内置包自动安装后的首页 / 设置页） |

---

## 6. 维护注意

- 根目录 `README.md` 的「资源 ID」表与示例包 effects 说明由文档代理维护，本规范以本文件为准；
  1.2.3 起 aurora 包**不再给图标加 `effects`**（描边/发光/偏转会让 24px 图标不再统一），
  effects 的校验与生效示例仍由 `bg-effects.zip` / `bad-*` 异常包与根 README 的 effects 章节覆盖；
- 改任何几何后必须重新生成并重跑总览图 / 指标，不要手改 PNG；
- 新增槽位：在 `ICON_SLOTS` 加名字、在 `ICON_GLYPHS` 加同名造型函数即可，manifest 与 zip 条目会自动生成。
