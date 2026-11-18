# 极光示例样式包（aurora.zip）与图标规范

`tools/style-fixture/gen.mjs` 生成 5 个样式包 zip，其中 **`aurora.zip`** 是随应用分发、作为内置默认的「极光」样
式包（`id=aurora`，schema 1，版本 **1.2.4**）：

| 内容 | 说明 |
| --- | --- |
| 背景 | `assets/<theme>/{main,chat,sidebar}.png`，抽象极光 + 星点，480×720 |
| 包图标 / 详情页封面 | `assets/<theme>/{icon,cover}.png`，1024² / 1440×1920，按主题各一张 |
| **图标** | **`assets/icons/<theme>/<slot>.png`，40 个语义槽位 × 亮/暗两套 = 80 张**，192×192 透明底 |
| 清单 | `index.json`（含 `color_palette`、资源 ID、1.2.4 版本号）、`LICENSE` |

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
| 主体 | 最长边约占画布 **62–80%**（40 枚实测 0.615–0.802） | 常规图标 69–80%；`remove` 作为「小一号 ×」为 0.615，避免与 `close` 混淆 |
| 线宽 | **7/96**（≈1.75px@24、1.17px@16） | 全局唯一描边宽度，圆头端点 + 圆角转折；不使用 <5/96 的细线 |
| 圆角 | 面板 / 圆角矩形 10–16；小元素（铅笔身、书签）5–6 | 同类元素（面板、文件、箭头）保持一致 |
| 抗锯齿 | SDF 距离场 → 1px 覆盖率 | `iconPainter` 内实现；无随机数、无绘图库、无时间戳 |

### 1.2 全描边（outline-only）与「端点圆点」

**1.2.4 起 40 个槽位全部只做描边，不允许大面积实心填充块**；`gen.mjs` 的绘制器里已经删掉实心矩形 / 实心多边形 /
实心月牙图元，只保留描边图元与「端点圆点」。

唯一允许的实心是**端点圆点 / 语义点**：直径 ≤ 2×线宽（≤14/96），用来表达「点」而不是「块」：

| 位置 | 圆点 | 直径 |
| --- | --- | --- |
| `menu` 三个圆点（⋯更多） | 3 × r7 | 14 = 2×线宽 |
| `setting.preset` 列表行圆点 | 3 × r7 | 14 = 2×线宽 |
| `setting.style` 调色板色点 | 4 × r6 | 12 |
| `thinking` 星点、`setting.dark` 星点、`setting.about` 感叹号点 | r6.5 | 13 |
| `warning` 感叹号点 | r4.5 | 9 |

选择理由：24px 下若改成空心小圆，孔洞只有 ~1px（`2×(7-3.5)=7` 逻辑像素的孔洞在 24px 上约 1.75px），
反而容易糊成脏点；端点圆点与圆头笔画的「点」语义一致，且直径严格不超过 2×线宽，不构成填充块。

### 1.3 配色

| 用途 | 亮色主题 | 深色主题 |
| --- | --- | --- |
| 主笔画 | `#16233f`（深蓝） | `#e9f3ff`（近白浅蓝） |
| 点缀渐变 | `#0f8ed6` → `#7a4fd8`（青蓝→紫，加深版） | `#6ed0ff` → `#c096ff`（青蓝→紫） |
| 渐变方向 | 统一「左下青蓝 → 右上紫」 | 同左 |

- 点缀色（极光渐变）**每枚图标最多出现一处关键细节**：箭杆、链环、星点、色点等；其余笔画一律主笔画色。
- 对比度（WCAG，相对各自的包背景）：亮色主笔画 **14.62:1**、亮色点缀 3.36–5.0:1；
  深色主笔画 **17.44:1**、深色点缀 8.43–11.3:1。亮色点缀用加深版正是为了在 `#f3f8ff` 浅底上 ≥3:1。

### 1.4 造型语言

全部描边；同一语义族的造型共享同一份几何约定：

- **箭头族**：`send` / `upload` / `download` / `back` 用开叉箭头（v 形）描边，箭杆用点缀渐变；
  `regen` / `refresh` 的箭头同样是开叉描边（不是实心三角）；
- **面板族**：`enter_sidebar`（面板 + 向右箭头）/ `exit_sidebar`（面板 + 向左箭头）**镜像成对**，共用同一圆角面板
  （68×52, r12）与分隔线；
- **圆角矩形族**：`copy` / `delete` 桶身 / `browse` / `setting.device` / `edit` 笔身 / `stop` 方框共用 10–16 圆角；
- **声音 / 文件**：`sound_input` 用胶囊 + 半圆弧；`link_file` 回形针 4 条平行丝间距 ≈20 逻辑像素，
  缩到 16px 仍保留 ≈1.5px 空隙；
- 不使用 emoji、不写字母、不堆细节；24px 看不清的元素直接简化（例如垃圾桶不画内部双竖线、齿轮改用滑杆）。

### 1.5 1.2.4「实心 → 描边」改动清单

| # | 槽位 | 1.2.3 | 1.2.4 |
| --- | --- | --- | --- |
| 1 | `stop` | 实心圆角方块 68×68 | 圆角方框描边（同尺寸/圆角） |
| 2 | `play` | 实心三角 | 三角描边（内部留空） |
| 3 | `thinking` | 实心四角星芒 | 四角星芒描边（中心留空）+ 小星点 |
| 4 | `setting.dark` | 实心月牙 | 月牙描边（大圆弧 + 挖除圆弧在两个交点相接）+ 小星点 |
| 5 | `exit_sidebar` | 面板 + 实心渐变左栏 | 面板 + 分隔线 + 向左箭头描边（与 enter_sidebar 镜像） |
| 6 | `setting.setting` | 实心滑块圆 | 三行滑杆 + 竖向短柄（「tune」式，纯描边） |
| 7 | `setting.usage` | 三根实心圆角柱 | 基线 + 三根圆头描边柱 |
| 8 | `edit` | 实心笔尖三角 | 笔尖三角描边 |
| 9 | `regen` | 实心箭头 | 开叉箭头描边（点缀色不变） |
| 10 | `refresh` | 两枚实心箭头 | 两枚开叉箭头描边 |
| 11 | `remove` | 12/96 线宽的实心感粗叉 | 7/96 描边小号 × |
| 12 | `menu` | 圆点直径 15 | 圆点直径 14（回到 ≤2×线宽规则） |

> 说明：需求里提到的“`enter_sidebar` 实心左栏”在实现中对应的是 **`exit_sidebar`**（`enter_sidebar` 自 1.2.3 起
> 就是纯描边面板+箭头）。1.2.4 两者都已是纯描边，并互为镜像。
>
> 其余图标在 1.2.3 时就是描边，本次只做了「去实心」相关修正与少量尺寸校正（`remove` 放大到 0.615 主体、
> `setting.dark` 月牙改为完整描边造型）。

---

## 2. 40 个槽位与造型

资源 ID：`dslike_chat.style_pkg.icon.<槽位>.<theme>`；默认文件路径 `assets/icons/<theme>/<槽位>.png`。
槽位名中的 `.`（如 `setting.usage`）直接出现在文件名里，与 README 的默认路径规则一致。

| # | 槽位 | 造型 | 点缀（极光渐变） |
| --- | --- | --- | --- |
| 1 | new_session | 加号（横竖两臂，14–80） | 竖臂 |
| 2 | enter_sidebar | 圆角面板 + 分隔线 + 向右箭头 | 箭头 |
| 3 | exit_sidebar | 圆角面板 + 分隔线 + 向左箭头（与 enter 镜像） | 箭头 |
| 4 | thinking | 四角星芒描边（中心留空） | 右上星点 |
| 5 | network | 地球（圆 + 赤道 + 经线椭圆） | 经线 |
| 6 | sound_input | 麦克风（胶囊 + 半圆支架 + 立杆/底座） | 支架弧 |
| 7 | link_file | 斜置回形针（连续折线，两个 U 型弯） | 最内侧短丝 |
| 8 | edit | 斜置铅笔（圆角笔身 + 笔帽线 + 三角笔尖描边） | 笔尖三角 |
| 9 | menu | 三个端点圆点（直径 14 = 2×线宽） | 中点 |
| 10 | delete | 垃圾桶（提手 + 桶盖 + 桶身，无内部细线） | 桶盖线 |
| 11 | copy | 后纸 L 形描边 + 前纸圆角矩形 | 后纸 L |
| 12 | regen | 顺时针开口圆弧 + 开叉箭头描边 | 箭头 |
| 13 | send | 上箭头（箭杆 + 箭头） | 箭杆 |
| 14 | stop | 圆角方框描边（68×68, r16） | — |
| 15 | left_arrow | 左 chevron | — |
| 16 | right_arrow | 右 chevron | — |
| 17 | setting.setting | 三行滑杆 + 竖向短柄 | 中间短柄 |
| 18 | setting.light | 太阳（圆环 + 8 条光芒） | 光芒 |
| 19 | setting.dark | 月牙描边 + 星点 | 星点 |
| 20 | setting.device | 显示器 + 立杆 + 底座 | 底座横杆 |
| 21 | setting.datas | 数据库（顶盖椭圆 + 侧壁 + 中/底弧） | 顶盖 |
| 22 | setting.about | 信息圆 + 感叹号（点 + 竖杆） | 圆点 |
| 23 | close | 描边交叉 ×（弹窗 / 搜索面板，大号） | — |
| 24 | remove | 描边交叉 ×（附件/文件卡片，小一号：22–74） | — |
| 25 | check | 单笔对勾 | — |
| 26 | refresh | 双向循环箭头（两段弧 + 两枚开叉箭头） | — |
| 27 | search | 放大镜（圆环 + 斜柄） | 斜柄 |
| 28 | warning | 圆角三角形 + 感叹号 | 感叹号 |
| 29 | link | 两个互相扣住的圆环（链环） | 右上环 |
| 30 | chevron_down | 下 chevron | — |
| 31 | play | 三角描边 | — |
| 32 | upload | 上箭头 + 托盘 | 箭杆 |
| 33 | download | 下箭头 + 托盘 | 箭杆 |
| 34 | add | 圆环 + 加号（与纯加号的 new_session 区分） | — |
| 35 | back | 完整左箭头（箭杆 + 箭头，与 chevron 版 left_arrow 区分） | 箭杆 |
| 36 | mobile_menu | 三条等长横杠（移动端汉堡，均 7/96 描边） | 中间横杠 |
| 37 | browse | 圆角文档框 + 两条内容线 | 第二条内容线 |
| 38 | setting.usage | 基线 + 三根圆头描边柱 | 中间柱 |
| 39 | setting.style | 调色板（圆环 + 四枚色点） | 左上色点 |
| 40 | setting.preset | 列表行（端点圆点 + 线）× 3 | 中间一行线 |

> 槽位名映射：`icon.setting.usage` / `icon.setting.style` / `icon.setting.preset` 用点号分组，
> 与 `icon.setting.light` 等既有槽位一致；文件名为 `assets/icons/<theme>/setting.usage.png`。

---

## 3. 生成与确定性

```powershell
cd G:\work\projects\aurora-chat-app
node tools/style-fixture/gen.mjs
```

- 依赖：仅 Node 标准库（`node:zlib` + 自写 PNG / ZIP 编码），不装绘图库；
- 产物写在 `tools/style-fixture/` 下：`aurora.zip`（当前 2,036,858 字节、92 个条目：80 图标 + 12 背景/封面/包图标/清单/许可）、
  `bg-effects.zip`、`bad-color.zip`、`bad-window.zip`、`bad-pkg-tilt.zip`；
- **确定性**：固定几何、无随机数、无时间戳，ZIP 时间/日期字段固定为 0；连续两次运行 `aurora.zip`
  SHA256 完全一致（实测：`828058BF890E4C944DCBBFEB4AC428F6C7B11B2669CB3D5C4AE0C55FC093B062`）；
  异常包 `bg-effects.zip` / `bad-*.zip` 同样重跑字节一致；
- 单次生成约 55 s，绝大部分耗时在包图标（1024²）与封面（1440×1920）的逐像素柔和光晕，图标本身 <1 s；
- 只改图标时不必重新构建桌面 / Android；但要更新内置包，需重新跑 `scripts/build-web.ps1`（它会把
  `tools/style-fixture/aurora.zip` 拷进 `web/src/assets/builtin/` 并打进 web dist），内置包在**新 profile 首启**或
  版本号变化时自动更新到 IndexedDB。

---

## 4. 24px 可读性数据

测量方法（Pillow）：192×192 原图 LANCZOS 缩到 24×24 → 合成到对应主题包背景 → 灰度 →
3×3 Sobel 平均梯度（归一到 0–255）、图标区域内唯一颜色数、对 0.8px 高斯模糊后的清晰度比；
对比对象是旧 1.2.2 包里的 4 个图标（send / new_session / menu / copy，96px 源，从旧 0.3.3 安装包 app.asar 提取）。

| 指标（24px） | 新 1.2.4（40 枚平均） | 旧 1.2.2（4 枚平均） | 结论 |
| --- | --- | --- | --- |
| Sobel 边缘能量（0–255） | **67.98**（中位 67.9，最低 23.3 = menu 三圆点） | 48.83 | +39%，描边更实、边缘更锐 |
| 图标区唯一颜色数 | 54.0（最低 10，纯单色图标靠抗锯齿也有 10 色） | 65.9 | 旧图标渐变噪点多不代表清晰；新图标色阶足够且不糊 |
| 清晰度（模糊前后边缘能量比） | 1.39（最低 1.22） | 1.44 | 全描边后比 1.2.3 的 1.35 略升；线形图标 1.3–1.7 |
| 不透明覆盖率 | 21% | 17% | 去实心后墨量下降，但 16px 下仍有 1.17px 实线 |

- 40 枚图标在 24px 下均能分出语义（重点对照：copy vs delete、menu vs mobile_menu、close vs remove、
  left_arrow vs back、regen vs refresh、add vs new_session、enter_sidebar vs exit_sidebar（箭头方向））；
- 主体最长边 **0.615–0.802**：常规图标 69–80%，`remove` 为小一号 × 取 0.615；无贴边裁切；
- 对照图：`screenshots/aurora-icons-24px-compare.png`（旧 vs 新，8× 最近邻放大）。

---

## 5. 验证产物（工作区 `screenshots/`）

| 文件 | 内容 |
| --- | --- |
| `aurora-icons-sheet-light.png` | 亮色 40 图标：96px 一行 + 24px 一行 + 槽位名 |
| `aurora-icons-sheet-dark.png` | 深色同上 |
| `aurora-icons-sheet.png` | 40 行 × 亮/暗两列（每格 96px 缩放 + 24px 原尺寸），便于逐枚人工检查 |
| `aurora-icons-24px-compare.png` | 旧 1.2.2 vs 新 1.2.4 的 24px 对照（8×） |
| `aurora-icons-verify.json` | 逐槽位 / 逐主题指标（边缘能量、颜色数、清晰度、覆盖率、主体占比、对比度） |
| `aurora-desktop-home.png` / `aurora-desktop-settings.png` 等 | 桌面壳内实际渲染（**1.2.3 轮次**的截图；1.2.4 由 lead 在 0.3.6 构建后验收） |

---

## 6. 维护注意

- 根目录 `README.md` 的「资源 ID」表与示例包 effects 说明由文档代理维护，本规范以本文件为准；
  1.2.3 起 aurora 包**不再给图标加 `effects`**（描边/发光/偏转会让 24px 图标不再统一），
  effects 的校验与生效示例仍由 `bg-effects.zip` / `bad-*` 异常包与根 README 的 effects 章节覆盖；
- **1.2.4 起新增图标必须是纯描边**；`iconPainter` 不提供实心矩形 / 实心多边形图元，
  只能用 `stroke` / `strokeArc` / `strokeRoundRect` 与 `fillCircle`（仅限 ≤2×线宽的端点圆点）；
- 改任何几何后必须重新生成并重跑总览图 / 指标，不要手改 PNG；
- 新增槽位：在 `ICON_SLOTS` 加名字、在 `ICON_GLYPHS` 加同名造型函数即可，manifest 与 zip 条目会自动生成。
