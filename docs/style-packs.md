# 自定义样式包（Style Pack）

设置 → 样式 里可以导入 `.zip` 样式包，替换界面背景、字体、图标与侧边栏标题。导入后存进 IndexedDB，同时只加载一个。**点击列表卡片即可加载**并立即生效；列表顶部固定一项「恢复默认（极光）」，点击后启用随安装包分发的内置极光包（正常安装下界面始终有一套样式包在生效，不存在「没有任何样式包 / 上游裸界面」的用户可见状态）。

每张卡片右侧有「详情」「删除」：详情在**同一区域内**切换到详情视图（不是新弹窗、也不新增设置分组），顶部有「← 返回」；详情页展示基础信息、亮/暗主题的资源清单、背景参数、调色板与许可证全文。包提供 `cover` 时，**cover 作为整个详情内容区的背景**（`background-size: cover` 铺满、不再是 hero 小卡片），包图标、名称、作者·版本与「使用中」徽标叠在背景顶部，各信息分块改为浮在背景上的半透明面板（亮/暗主题分别取对应 cover，并叠加与主题匹配的渐变遮罩保证可读）。删除有二次确认；删除正在使用的非内置包后自动回到内置默认样式。

> 列表与详情页的包图标、详情页 cover 都**跟随当前实际生效的主题**（含「跟随系统」解析后的结果）；清单里某个主题没提供图时，展示层回退到另一主题的图，两个主题都没有则显示首字母方块。

### 就地编辑模式（应用内新建 / 编辑样式包）

样式页头部除「导入样式包」外还有两个入口：**「编辑样式」**（以当前启用包为底稿，内置极光包会派生出一个新的自定义包 id）与**「新建样式包」**（空白草稿，自动生成 `custom-<timestamp36>` id）。点击后关闭设置弹窗，进入**就地编辑模式**：顶部出现工具栏（退出 / 保存 / 导出 zip / 收放面板），界面其余部分照常使用——普通点击、滚动、发送消息都不受影响。

- **只拦截两类手势**：PC 端（桌面宿主：Windows / Linux / macOS）**右键**，其余所有移动 / 触屏宿主（Android / iOS / 任何触屏载体）**长按**。只对带 `data-style-slot` 标记的控件生效；未标记的元素行为完全不变。
- **长按**：按住 ≥ 500 ms 弹出菜单；手指移动超过 10 px（滚动 / 拖拽）取消。若该控件注册了「原长按操作」，菜单里会出现「执行原长按操作（按住 XXX ms）」并传入松手时测得的实际时长；没有注册时隐藏该项。菜单固定包含「修改此控件样式」。
- **右键**：在控件上右键会屏蔽浏览器原生菜单并弹出同样的自绘菜单（现有实现不依赖应用自带的右键菜单，保留后续在菜单中追加原菜单项的扩展点）。
- **可编辑控件**：
  - 10 个背景槽位：欢迎页 `background.main`、会话页 `background.chat`、输入框 `background.input_box`、侧边栏 `background.sidebar`、「开启新对话」`background.new_session`、普通 / 选中会话条目 `background.normal_session` / `background.selected_session`、设置页通用 / 数据 / 关于 `background.setting.generic` / `background.setting.datas` / `background.setting.about`（样式 / 预设 / 用量统计页回退到 `setting.generic`，所以也归到 generic 编辑）；
  - 40 个图标槽位：每个 `PackIcon` 渲染的图标（无覆盖时显示内置 SVG，同样可以右键 / 长按替换）；
  - 侧边栏标题（`sidebarTitle`）。
- **修改面板**（侧面板）：标题栏是拖动手柄（pointer events，鼠标 / 触摸通用，触屏上 `touch-action: none`），拖动时面板整体限制在视口内并留 8 px 边距，面板高于视口时保证标题栏仍可抓取；松手保持位置，进入 / 退出编辑模式重置为默认位置（PC 右侧、移动端底部）。按控件类型提供上传 / 替换 / 清除（恢复内置默认）、`fit` / `align` / `position` / `render` 与 `effects`（背景只提供 `window` / `zoom`；图标额外提供静态特效、`window` / `zoom` 与 `tilt`；包图标不允许 `tilt`，与导入校验的允许矩阵一致）。
- **非元素级资源**放在侧面板：基本信息（id 只读、名称 / 作者 / 版本 / 描述 / 版权声明 / License 文本）、编辑主题（亮 / 暗）、字体、包图标与封面（亮 / 暗各一张）、配色（13 个语义色，可「从当前主题取色」）。
- **实时预览**：编辑模式中的所有修改立即应用到界面（背景 / 字体 / 配色走 CSS 变量，图标与侧边栏标题走预览通道）；退出时未保存的修改会丢弃并恢复编辑前的样式。编辑期间界面主题被固定为具体亮 / 暗值，退出后恢复用户原来的主题偏好。
- **保存**：校验通过后写 IndexedDB（`builtin: false`，编辑已有用户包时保留 `importedAt`），随后可在样式列表启用 / 删除；保存后继续留在编辑模式，可继续修改或导出。
- **导出 zip**：与保存共用同一份草稿编译结果，资源 ID 仍为 `dslike_chat.style_pkg.*`、`schema` 为 1、LICENSE 文件内容为「版权声明 + 可选 License 全文」，文件名 `<id>.zip`；导出的包可被现有导入器重新解析（zip 大小上限 20 MB 等规则与导入一致）。
- **校验**：id 格式、内置 id（`aurora`）不可覆盖、必填文本、文本安全字符、CSS 颜色、文件类型 / 单文件大小、`position` 白名单、`effects` 数值范围、至少一个资源、整包总量；错误按字段显示，文案中英成对。

### 内置极光样式包

- **随安装包分发**：源文件 `tools/style-fixture/aurora.zip`（极光示例包，MIT LICENSE，manifest `id=aurora`，含亮/暗 icon+cover、抽象背景）。`scripts/build-web.ps1` 在构建前把它复制到 `web/src/assets/builtin/aurora.zip`，rspack 用 `.zip → asset/resource` 打进 `dist/static/media/`，桌面 asar 与 Android assets 都能 fetch 到该资产。
- **首次启动自动安装并启用**：`initStylePacks()` 先执行 `ensureBuiltinPack()`（fetch 资产 → `File` → 现有 `parseStylePackZip` 解析 → 写入 IndexedDB，标记 `builtin: true` 和 `builtinVersion`），再恢复上次启用项；本机没有启用记录（全新安装 / 记录失效）时启用内置包。
- **不可删除**：列表与详情页显示「内置」徽标，删除按钮禁用（`removeStylePack` 对 `builtin` 记录同样拒绝）。
- **恢复默认**：「恢复默认（极光）」= 启用内置包；删除正在使用的非内置包后也会自动回到内置包。
- **版本升级自动更新**：内置资产 `index.json` 的 `version` 比本机记录的 `builtinVersion` 新时，启动时覆盖更新内置记录（保留首次安装时间）；同版本不重复写库。
- **其它包可覆盖它**：用户自己导入同 `id`（`aurora`）的包优先——已有 `builtin=false` 的同 id 记录不会被内置包覆盖；反过来，导入同 id 包会覆盖内置记录。
- **降级兜底**：内置资产缺失 / 解析失败时只 `warn` 一次并回退到应用默认外观（唯一合法的降级路径），不阻塞启动；正常构建与安装下不会走到这里，UI 也不提供「停用样式包 / 回到上游外观」的入口。

### 包结构

```
index.json
icon.png                 # 包图标（可选；默认位置之一，或按主题给 assets/light/icon.png、assets/dark/icon.png）
cover.png                # 详情页封面（可选；默认位置之一，或按主题各给一张，作为详情整页背景）
LICENSE                  # 许可证（可选；默认位置之一，也可用 index.json 的 license 指向别的文件）
assets/light/...         # 亮色资源（路径任意；也可以只放默认位置文件、完全不写 file）
assets/dark/...          # 深色资源
```

### index.json

```json
{
  "schema": 1,
  "id": "aurora",
  "name": "极光",
  "description": "冷色调示例包",
  "author": "you",
  "version": "1.2.0",
  "sidebarTitle": "Aurora Chat",
  "icon": {
    "light": { "file": "assets/light/icon.png" },
    "dark": { "file": "assets/dark/icon.png" }
  },
  "cover": {
    "light": { "file": "assets/light/cover.png" },
    "dark": { "file": "assets/dark/cover.png" }
  },
  "license": { "file": "LICENSE" },
  "assets": {
    "dslike_chat.style_pkg.background.main.light": { "file": "assets/light/main.png", "alpha": 1, "exposure": 0 }
  }
}
```

- `schema` 恒为 `1`；`id` 为 1–64 位 `[a-z0-9._-]`，**同 id 覆盖**已有包。
- `assets` 的键是资源 ID；路径只从 zip 条目取，不支持远程资源。`file` **可省略**：写了就用用户值（严格校验），没写就按下文「默认路径」查找。
- `alpha`（0–1，默认 1）与 `exposure`（-1–1，默认 0）只对图片有意义，分别映射为图层透明度和亮度。
- `fit`（默认 `cover`）/ `align`（默认 `center`）/ `render`（默认 `auto`）控制背景与图标的缩放、排版与插值，`position` 配合 `align: "custom"` 使用，见「图片缩放与排版」。
- `effects`（可选）控制视觉特效与裁切缩放：图标资源与封面的主题项/包级对象都可带 `effects`，详见「视觉特效（effects）」。
- `color_palette`（可选）按浅色/深色覆盖界面配色，见下文「配色」。
- `icon` / `cover` 支持「主题无关」与「按主题」两种写法，见下文「包图标与封面（icon / cover）」。
- 缺失的资源 ID 一律回退到应用默认样式；显式文件不跨主题借用（默认位置查找有主题回退规则，见下节）。

### 默认路径（`file` 可省略）

`index.json` 里**所有 `file` 字段都可省略**。解析顺序 = 显式值 > 默认位置：

1. 显式写了 `file`：严格使用该路径；路径非法或文件不存在报 `missingFile`，**不会**静默回退默认位置；
2. 没写 `file`：按下面的候选列表依次尝试（位置优先，位置内按扩展名顺序），命中即用；
3. 默认位置也没有：按可选字段处理，**不报错**——`assets` 资源项跳过并在导入时 `warn` 一次，包级 `icon` / `cover` / `license` 静默视为未提供，不阻塞导入。

所有路径匹配都**大小写不敏感**（包内索引按小写路径建表），解析后的清单与 IndexedDB 里保存的是 zip 内的真实条目名。

| 字段 / 资源 | 显式写法 | 默认位置（按序尝试） | 扩展名候选（按序） |
| --- | --- | --- | --- |
| 背景 `background.<name>.<theme>` | `file` | `assets/<theme>/<name>.<ext>` → `assets/<name>.<ext>` | `png` `webp` `jpg` `jpeg` `gif` `svg` `avif` |
| 图标 `icon.<name>.<theme>` | `file` | `assets/icons/<theme>/<name>.<ext>` → `assets/<theme>/<name>.<ext>` → `assets/icons/<name>.<ext>` | 同上 |
| 字体 `font.<theme>` | `file` | `assets/font.<ext>` → `font.<ext>` | `ttf` `otf` `woff` `woff2` |
| 包级 `icon` | `file` / `light.file` / `dark.file` | `assets/<theme>/icon.<ext>` → `icon.<ext>` | 图片候选同上 |
| 包级 `cover` | 同上 | `assets/<theme>/cover.<ext>` → `cover.<ext>` | `png` `webp` `jpg` `jpeg` `svg` |
| `license` | `file` | `LICENSE` → `LICENSE.txt` → `LICENSE.md` → `license` → `license.md`（大小写不敏感） | — |

- `<name>` 是资源 ID 里类别与主题之间的部分，**可以含点号**：`background.setting.generic.light` → `assets/light/setting.generic.png`；`icon.setting.datas.dark` → `assets/icons/dark/setting.datas.png`。
- 默认位置命中的文件与显式 `file` 走同一套校验（图片 / 字体扩展名、封面 5 MB、许可证 200 KB 等）；不合规时按同样的错误码失败，而不是静默忽略。
- 包级 `icon` / `cover`：整个字段省略、只写 `{}`、或写 `{ "light": {}, "dark": {} }` 时，两个主题分别按 `assets/<theme>/...` 查找；某主题在默认位置找不到时，依次回退包级显式 `file`、另一主题的默认位置（即「同一张图用在两个主题」）。两主题最终同文件且 `effects` 相同时，清单归一化成主题无关写法。
- 显式只给一个主题、另一主题既没写默认位置也没有包级 `file` 时，该主题没有图（不借用另一个主题的显式文件；展示层仍会把缺失主题回退到另一主题显示）。
- 现成的示例包（`aurora`）仍全部使用显式路径；省略 `file` 是给「只放默认位置文件」的极简包用的。

最小包示例（只有 `index.json` + 默认位置的图片 / 许可证，**完全不写 `file`**）：

```
index.json                  # 下面这份
icon.png                    # 包图标（根目录默认位置，亮/暗两个主题共用）
cover.png                   # 详情页封面（根目录默认位置）
LICENSE                     # 许可证
assets/light/chat.png       # background.chat.light 的默认位置
assets/icons/light/send.png # icon.send.light 的默认位置
assets/font.woff2           # font.light / font.dark 的默认位置
```

```json
{
  "schema": 1,
  "id": "minimal",
  "name": "极简包",
  "assets": {
    "dslike_chat.style_pkg.background.chat.light": {},
    "dslike_chat.style_pkg.icon.send.light": {},
    "dslike_chat.style_pkg.font.light": {}
  }
}
```

### 包图标与封面（icon / cover）

`index.json` 顶层的 `icon` 与 `cover` 都支持两种写法：

**1. 主题无关（旧写法，继续兼容）** —— 两个主题共用同一张图：

```json
"icon": { "file": "icon.png" },
"cover": { "file": "cover.png" }
```

**2. 按主题分别提供** —— 亮/暗主题各用一张图；`file` 可选，作为两个主题的兜底：

```json
"icon": {
  "light": { "file": "assets/light/icon.png" },
  "dark": { "file": "assets/dark/icon.png" }
},
"cover": {
  "light": { "file": "assets/light/cover.png" },
  "dark": { "file": "assets/dark/cover.png" },
  "file": "cover.png"
}
```

回退与使用规则（主题项的 `file` 都可省略，省略时按该主题默认位置查找，见「默认路径」）：

| 写法 | 亮色主题用 | 暗色主题用 |
| --- | --- | --- |
| `{ "file": "a.png" }` | `a.png` | `a.png` |
| `{ "light": {...}, "dark": {...} }` | light 的文件 | dark 的文件 |
| `{ "light": {} }`（主题项不写 file） | `assets/light/icon.<ext>` 等默认位置 | 默认位置 → 包级 `file` → 亮色默认位置 |
| `{ "light": {...} }`（只有亮色且显式） | light 的文件 | 无图（导入层不借用另一个主题的显式文件，展示层回退显示） |
| `{ "light": {...}, "file": "a.png" }` | light 的文件 | `a.png` |
| 整个字段省略 / `{}` | `assets/light/...` 默认位置 → 根目录 `icon.<ext>` | 暗色默认位置 → 包级 `file` → 亮色默认位置 |

- 没写 `file` 时允许「另一主题的默认图」兜底（默认位置查找）；**显式文件仍然不跨主题借用**。
- 列表图标与详情页 cover 在展示时也会把当前主题缺失的图回退到另一主题（两个主题都没有才显示首字母方块 / 不铺背景）。
- 包图标在列表按 40px 显示、详情页 hero 按 56px 显示，都跟随当前实际生效的主题（含「跟随系统」的解析结果）；切换主题时即时换图。
- `icon` / `cover` 的路径规则与 `license` 一致：只允许包内相对路径，拒绝绝对路径与 `..`；显式路径的文件缺失或路径非法报 `missingFile`（默认位置找不到则视为未提供，不报错）。
- `cover` 接受 `png` / `jpg` / `jpeg` / `webp` / `svg`，**每个主题的文件各自 ≤ 5 MB**（`svg` 同样按字节数）；类型不符报 `badFileType`、超限报 `badConfig`。
- `icon` 接受 `png` / `jpg` / `jpeg` / `webp` / `gif` / `svg` / `avif`，与普通图片共用整包大小上限。
- 详情页把 cover 当作**整个详情内容区的背景**（`background-image` + `background-size: cover` + `background-position: center`，full-bleed），不再是 hero 小卡片；基础信息 / 资源清单 / 参数 / 调色板 / 许可分块改为浮在背景上的半透明面板，面板底色取主题的 `--dsw-alias-bg-base` + `color-mix`，并叠加与主题匹配的渐变遮罩，保证标题与正文在任意封面上可读。
- `icon` / `cover` 的 `effects`：包级 `effects` 两个主题共用，主题项里的 `effects` 覆盖包级值；包图标继续按资源项生效（静态特效 + `window` / `zoom`），`tilt` 仍被拒绝（`badConfig`）。封面因改为整页背景，只让 `window` / `zoom` 参与取图；`opacity` / `shadow` / 光效 / `tilt` 虽仍被接受与校验（旧包可继续导入），但对铺满内容区的背景不再产生视觉效果。

### 资源 ID

前缀统一为 `dslike_chat.style_pkg`，`{theme}` 取 `light` / `dark`。

| 类别 | ID |
| --- | --- |
| 背景 | `background.main.{theme}`、`background.chat.{theme}`、`background.input_box.{theme}`、`background.sidebar.{theme}`、`background.new_session.{theme}`、`background.selected_session.{theme}`、`background.normal_session.{theme}`、`background.setting.generic.{theme}`、`background.setting.datas.{theme}`、`background.setting.about.{theme}`、`background.setting.style.{theme}`、`background.setting.preset.{theme}`、`background.setting.usage.{theme}` |
> 设置弹窗的五个分组各有背景槽位；`style` / `preset` / `usage` 缺失时自动回退到 `setting.generic`，`datas` / `about` 同样回退，所以只提供通用背景的旧包也能覆盖所有设置页。
| 字体 | `font.{theme}` |
| 图标 | `icon.new_session.{theme}`、`icon.enter_sidebar.{theme}`、`icon.exit_sidebar.{theme}`、`icon.thinking.{theme}`、`icon.network.{theme}`、`icon.sound_input.{theme}`、`icon.link_file.{theme}`、`icon.edit.{theme}`、`icon.menu.{theme}`、`icon.delete.{theme}`、`icon.copy.{theme}`、`icon.regen.{theme}`、`icon.send.{theme}`、`icon.stop.{theme}`、`icon.left_arrow.{theme}`、`icon.right_arrow.{theme}`、`icon.setting.setting.{theme}`、`icon.setting.light.{theme}`、`icon.setting.dark.{theme}`、`icon.setting.device.{theme}`、`icon.setting.datas.{theme}`、`icon.setting.about.{theme}`、`icon.close.{theme}`、`icon.remove.{theme}`、`icon.check.{theme}`、`icon.refresh.{theme}`、`icon.search.{theme}`、`icon.warning.{theme}`、`icon.link.{theme}`、`icon.chevron_down.{theme}`、`icon.play.{theme}`、`icon.upload.{theme}`、`icon.download.{theme}`、`icon.add.{theme}`、`icon.back.{theme}`、`icon.mobile_menu.{theme}`、`icon.browse.{theme}`、`icon.setting.usage.{theme}`、`icon.setting.style.{theme}`、`icon.setting.preset.{theme}` |
> 图标共 **40 个槽位**（前 22 个为初版，后 18 个为第二轮扩充）。语义约定：`icon.link_file` = 附件（输入框回形针）、`icon.menu` = 更多（⋯ 菜单）、`icon.link` = 链接（读取链接 / 站点图标兜底）；`icon.enter_sidebar` / `icon.exit_sidebar` 分别是桌面侧栏展开 / 收起，`icon.mobile_menu` 只用于移动端顶栏的菜单按钮。
> 第二轮新增的 18 个槽位（`close` / `remove` / `check` / `refresh` / `search` / `warning` / `link` / `chevron_down` / `play` / `upload` / `download` / `add` / `back` / `mobile_menu` / `browse` / `setting.usage` / `setting.style` / `setting.preset`）在旧样式包里没有对应资源时**回退到界面内置 SVG**，不报错，也不需要包作者补齐；只提供初版 22 个槽位（或更少）的包可以继续使用。

### 图片缩放与排版（fit / align / position / render）

`assets` 里的图片项可再带三个排版字段与一个位置字段；缺省值保持扩展前的表现（`cover` / `center` / `auto`），只写 `file` / `alpha` / `exposure` 的旧包行为完全不变。

| 字段 | 取值 | 默认 | 作用 |
| --- | --- | --- | --- |
| `fit` | `cover` / `contain` / `stretch` / `tile` | `cover` | 背景图如何适配容器 |
| `align` | 九宫格 + `custom` | `center` | 背景图在容器中的对齐方式 |
| `position` | 任意安全 CSS `background-position`，≤60 字符 | — | 仅 `align: "custom"` 时生效；其它情况忽略并在导入时提示 |
| `render` | 插值算法 | `auto` | 缩放采样方式，映射到 CSS `image-rendering` |

`fit` 的取值与 CSS 映射：

| fit | background-size | background-repeat |
| --- | --- | --- |
| `cover` | `cover` | `no-repeat` |
| `contain` | `contain` | `no-repeat` |
| `stretch` | `100% 100%` | `no-repeat` |
| `tile` | `auto` | `repeat` |

`align` 的九宫格（`custom` 时改用 `position`）：

| align | 映射到 background-position |
| --- | --- |
| `top-left` / `top-center` / `top-right` | `left top` / `center top` / `right top` |
| `center-left` / `center` / `center-right` | `left center` / `center` / `right center` |
| `bottom-left` / `bottom-center` / `bottom-right` | `left bottom` / `center bottom` / `right bottom` |
| `custom` | 使用 `position` 字段（如 `50% 20%`、`left 10px bottom 20%`） |

`render` 的 7 个取值：

| render | 含义 | CSS image-rendering |
| --- | --- | --- |
| `auto` | 浏览器/平台默认（双线性等平滑插值） | `auto` |
| `smooth` | 显式要求平滑插值（Chromium 无独立关键字） | `auto` |
| `pixelated` | 不插值，最近邻采样（像素画必用） | `pixelated` |
| `crisp-edges` | 不模糊边缘（Firefox 语义；Chromium 按最近邻处理） | `crisp-edges` |
| `high-quality` | 高质量缩放（新内核支持） | `high-quality` |
| `optimize-speed` | 速度优先 | `optimizeSpeed` |
| `optimize-quality` | 质量优先 | `optimizeQuality` |

- 不支持的关键字由 CSS 无效值回退机制落到 `auto`，不做 JS 特性检测。
- 像素画推荐配置：`{ "fit": "contain", "align": "center", "render": "pixelated" }`。
- 图标资源（`icon.*`）只应用 `render`（`<img>` 的 `image-rendering`）；`fit` / `align` / `position` 对图标无意义，出现时忽略并在导入时提示。字体与文本资源不应用任何图片选项，出现时同样忽略并提示。
- `position` 只允许 `[A-Za-z0-9 %.,/+()-]` 且 ≤60 字符，并拒绝 `url(` / `expression(` / CSS 注释；其余取值在导入时报 `badConfig`。

示例（浅色聊天背景 + 像素图标）：

```json
"assets": {
  "dslike_chat.style_pkg.background.chat.light": {
    "file": "assets/light/chat.png",
    "alpha": 1,
    "exposure": 0.1,
    "fit": "contain",
    "align": "center",
    "render": "pixelated"
  },
  "dslike_chat.style_pkg.icon.send.light": {
    "file": "assets/icons/light/send.png",
    "render": "pixelated"
  }
}
```

### 视觉特效（effects）

`assets` 里的图片项可以再带可选的 `effects`；`icon` / `cover` 这两个顶层图片引用也可以带 `effects`：主题无关写法写在 `{ "file": …, "effects": { … } }` 里；按主题写法可以把 `effects` 写在包级共用，或写进 `light` / `dark` 的主题项里（主题项优先）。所有效果都在导入时严格校验，非法值让导入失败（`badConfig`，错误信息带字段名），未知键忽略并提示。

**允许矩阵**

| 资源 | `window` / `zoom` | 静态效果（opacity / shadow / outerGlow / innerGlow / emboss / stroke） | `tilt` |
| --- | --- | --- | --- |
| `icon.*` 资源 | ✅ | ✅ | ✅ |
| 包图标 `icon` | ✅ | ✅ | ❌（`badConfig`） |
| 封面 `cover` | ✅（只影响取图，整页背景无静态效果） | ✅（解析/校验保留，整页背景不渲染） | ✅（解析/校验保留，整页背景不渲染） |
| 背景 `background.*` | ✅ | ❌ 忽略并 warn | ❌ 忽略并 warn |
| 字体 / 许可文本 | ❌ 忽略并 warn | ❌ 忽略并 warn | ❌ 忽略并 warn |

**静态效果**

| 字段 | 子字段与取值范围 | 默认（子字段缺省时） | 实现 |
| --- | --- | --- | --- |
| `opacity` | 0–1 | `1` | CSS `opacity` |
| `shadow` | `x` / `y` −100..100、`blur` 0..100、`color` 严格 CSS 颜色 | `{ x: 0, y: 4, blur: 12, color: "#00000066" }` | CSS `filter: drop-shadow(x y blur color)`，天然按 alpha 生效 |
| `outerGlow` | `radius` 0..50、`color`、`intensity` 0..1 | `{ radius: 10, color: "#ffffff", intensity: 1 }` | alpha 模糊后染色的派生图底层 |
| `innerGlow` | `radius` 0..50、`color`、`intensity` 0..1 | `{ radius: 6, color: "#ffffff", intensity: 1 }` | 反相 alpha 模糊 × 原 alpha，叠在字形内部 |
| `emboss` | `depth` 0..10、`angle` 0..360、`intensity` 0..1 | `{ depth: 1.5, angle: 45, intensity: 0.6 }` | alpha 沿光照方向偏移求梯度，亮/暗叠在内部 |
| `stroke` | `width` 0..20、`color` | `{ width: 2, color: "#000000" }` | 二值 alpha 距离变换膨胀，染描边色作为底层 |

- 颜色沿用配色表的严格校验：`#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` / `rgb()` / `rgba()` / `hsl()` / `hsla()` / `transparent`，其余写法（含 CSS 变量、颜色名）一律 `badConfig`。
- **依赖 alpha 通道**：`stroke` / `outerGlow` / `innerGlow` / `emboss` 需要 canvas 处理原图 alpha 并合成派生 PNG；`opacity` / `shadow` 纯 CSS，不产生派生图。
- 长度（`radius` / `width` / `depth` / `blur`）以资源原图像素为坐标系；原图被缩放（最大边长 1024）时按比例换算。

**裁切窗口（window）与缩放（zoom）**

| 字段 | 取值 | 默认 | 作用 |
| --- | --- | --- | --- |
| `window` | `{ x1, y1, x2, y2 }`，四个 0–1 有限数，且 `x1 < x2`、`y1 < y2` | 整张图 | 归一化坐标（相对原图宽高）的可见区域，先从原图裁出该区域 |
| `zoom` | 0–4 有限数，允许小数 | `1` | `1` 不缩放；`0` 不显示（派生 1×1 透明图）；其它值以裁切区域中心为基准缩放 |

- 两者都走 canvas 派生图：先按 `window` 裁出区域，再以裁切区域中心按 `zoom` 缩放；输出画布保持裁切区域尺寸（`zoom < 1` 四周留透明，`zoom > 1` 放大后超出部分被裁掉），因此 `<img>` 的尺寸规则与 `object-fit: contain` / 背景的 `background-size` / `cover` 等行为都不变。
- `window` 缺省某个字段、或 `window` 出现但缺字段、`x1 >= x2`、`y1 >= y2` 都报 `badConfig`（带字段名）。
- 背景资源上的 `window` / `zoom` 有意义、会生效；背景上的静态效果与 `tilt` 在导入时被忽略（每个资源 warn 一次）。

**卡片偏转（tilt）**

```json
"dslike_chat.style_pkg.icon.send.light": {
  "file": "assets/icons/light/send.png",
  "effects": {
    "shadow": { "x": 0, "y": 4, "blur": 12, "color": "#00000066" },
    "tilt": { "maxAngle": 12, "perspective": 700, "scale": 1.02 }
  }
}
```

| 字段 | 取值范围 | 默认（子字段缺省时） |
| --- | --- | --- |
| `tilt.maxAngle` | 0–30 度 | `12` |
| `tilt.perspective` | 200–2000 px | `700` |
| `tilt.scale` | 0.8–1.2 | `1.02` |

- `tilt` 只允许出现在 `icon.*` 资源与 `cover` 上：图标在其 `<img>` 外包一层透视容器，其它位置出现 `tilt` 报 `badConfig`。封面已改为详情页整页背景，`tilt` 仍被解析与校验（旧包继续可导入），但不再产生视觉偏转。
- 行为：`pointermove` 按光标在元素内的相对位置计算 `rotateX` / `rotateY`（限幅到 `maxAngle`），`pointerleave` / `pointercancel` 平滑回正；`transform-style: preserve-3d`；`prefers-reduced-motion: reduce` 时禁用；触屏（`pointerType !== "mouse"`）不启用。只挂指针事件，不拦截点击与键盘操作。
- 只支持偏转的容器是「卡片 / 图标 / 封面」这类小元素；背景资源不能偏转。

示例（图标：外发光 + 描边 + 阴影 + 裁切缩放 + 偏转；封面：静态效果 + 偏转）：

```json
"assets": {
  "dslike_chat.style_pkg.icon.send.light": {
    "file": "assets/icons/light/send.png",
    "render": "pixelated",
    "effects": {
      "opacity": 0.95,
      "shadow": { "x": 0, "y": 4, "blur": 12, "color": "#00000066" },
      "outerGlow": { "radius": 10, "color": "#7fd4ff", "intensity": 0.8 },
      "innerGlow": { "radius": 6, "color": "#ffffff66", "intensity": 0.6 },
      "emboss": { "depth": 1.5, "angle": 45, "intensity": 0.6 },
      "stroke": { "width": 2, "color": "#0b1020" },
      "window": { "x1": 0.1, "y1": 0.2, "x2": 0.9, "y2": 0.8 },
      "zoom": 1.25,
      "tilt": { "maxAngle": 12, "perspective": 700, "scale": 1.02 }
    }
  }
},
"cover": {
  "file": "cover.png",
  "effects": {
    "outerGlow": { "radius": 12, "color": "#7fd4ff", "intensity": 0.7 },
    "tilt": { "maxAngle": 10, "perspective": 900, "scale": 1.01 }
  }
}
```

**性能与边界**

- 派生图只算一次：缓存键 = 资源 ID + `effects` 的稳定 JSON 指纹；切换 / 停用样式包、刷新列表时，store 按「当前仍在引用的原图 URL」回收不再需要的派生 blob URL（`URL.revokeObjectURL`）。
- 处理是异步的：包图片加载 / 特效处理期间先用原图占位；同一时刻最多并发 4 个派生任务，其余排队。
- 处理失败（解码失败、canvas 不可用等）回退原图并 `warn`，每个资源只提示一次，不影响导入与其它资源。
- 派生画布最长边 1024 px，超过的原图先等比缩小，防止大图长时间占用主线程。
- `zoom: 0` 直接派生 1×1 透明图，等价于该资源不显示。

### 配色（color_palette）

`index.json` 可以带可选的 `color_palette`，按当前主题（浅色 / 深色）覆盖界面语义色。配色只改变颜色变量，背景图、字体、图标仍走 `assets`；不写 `color_palette` 或其中某个令牌时，该令牌保持应用默认色。

```json
"color_palette": {
  "light": {
    "background": "#f7f9ff",
    "surface": "#ffffff",
    "surface_alt": "#eef2fa",
    "text": "#14161a",
    "text_secondary": "#4b5058",
    "text_tertiary": "#7b818a",
    "border": "rgba(20,22,26,0.10)",
    "accent": "#4d6bfe",
    "accent_text": "#ffffff",
    "bubble": "#e9efff",
    "code": "#f5f6f8",
    "danger": "#e5484d",
    "mask": "rgba(0,0,0,0.36)"
  },
  "dark": {
    "background": "#0b1020",
    "surface": "#121a30",
    "surface_alt": "#182240",
    "text": "#e8edff",
    "text_secondary": "#a7b2d0",
    "text_tertiary": "#7a86a8",
    "border": "rgba(180,200,255,0.14)",
    "accent": "#7c8cff",
    "accent_text": "#0b1020",
    "bubble": "#1a2545",
    "code": "#141d38",
    "danger": "#ff6b6f",
    "mask": "rgba(2,6,18,0.6)"
  }
}
```

| 令牌 | 含义 | 影响的界面元素 |
| --- | --- | --- |
| `background` | 页面主画布底色 | 页面根背景（`--dsw-alias-bg-base`），同时同步根画布与 `meta[name="theme-color"]` |
| `surface` | 浮起表面（卡片、输入框、菜单） | 弹层/卡片底色、输入框、菜单、悬浮按钮 |
| `surface_alt` | 次级表面（侧栏、代码块底） | 侧栏底色、选择器、Markdown 代码块/行内代码/标签/占位 |
| `text` | 主文字色 | 正文主文字、反色主文字 |
| `text_secondary` | 次要文字色 | 次要文字、Toast、Tooltip、高对比按钮底色 |
| `text_tertiary` | 三级文字色 | 辅助文字、说明文字、弱化文字 |
| `border` | 边框色 | 三级边框（`border-l1/-l2/-l3`）与深色细边框 |
| `accent` | 品牌强调色 | 品牌色/品牌文字、主按钮及 hover、幽灵按钮激活边框 |
| `accent_text` | 强调色上的文字色 | 主按钮/品牌底上的前景文字、纯白静态色 |
| `bubble` | 聊天气泡底色 | 用户消息气泡 |
| `code` | 代码块底色 | Markdown 代码块及其标题栏（优先于 `surface_alt` 的同一变量） |
| `danger` | 错误/危险色 | 错误状态的主色与次色 |
| `mask` | 全屏遮罩色 | 模态遮罩（`--dslike-mask`） |

- `light` / `dark` 都可单独缺省：当前主题没有对应配色时，整套配色不生效并回到应用默认色。
- 令牌全部可选，缺失的令牌只回退自身对应的默认色；同一令牌映射多个变量，未在表中列出的变量不受影响。
- 未知令牌键直接忽略；`color_palette`、`light`、`dark` 中任一不是对象，或已知令牌不是合法 CSS 颜色，都会让导入失败（`badIndex`）。
- 颜色值只允许：`#rgb`、`#rgba`、`#rrggbb`、`#rrggbbaa`、`rgb()`、`rgba()`、`hsl()`、`hsla()`、`transparent`（大小写不敏感）；不接受 `url()`、CSS 变量、其他颜色名等写法。
- 写了 `text` 会自动派生半透明交互层（hover 6% / active 10% / hover-accent 14% / hover-danger 8% / 侧栏 hover 8% / 骨架屏 4%）；写了 `accent` 会自动派生幽灵按钮激活 12%/20% 与侧栏激活强调 16%，无需逐个填写。
- 配色变量写在 `body` 上（主题别名定义在 `body`），切换到另一主题或停用样式包时全部移除，回到主题默认。

### 支持的文件与限制

- 图片：`png` `jpg` `jpeg` `webp` `gif` `svg` `avif`（`<img>` 与 `background-image` 均可用；SVG 不会执行脚本）
- 字体：`ttf` `otf` `woff` `woff2`
- 文本（许可证）：`txt` `md` `license`
- `index.json` 的所有路径字段都可省略；默认位置查找同样只使用上面列出的扩展名（`cover` 的默认位置不含 `gif` / `avif`）
- 单个 zip ≤ 20 MB，解压后 ≤ 60 MB，条目 ≤ 300；拒绝绝对路径与 `..`
- 配套示例包（`aurora`）只含抽象背景与几何图标（渐变、极光带、光环、星点），**不含任何官方标志**；包图标与封面按亮/暗主题各给一张（浅色 / 深色版），40 个图标槽位在 1.2.3 起统一按同一规范绘制（无 per-icon effects，避免个别图标视觉重量不一致），静态特效 / `window` / `zoom` / `tilt` 的参照见 `bg-effects.zip` 与本章 effects 说明；封面用于详情页整页背景、不带 `effects`。

### 安全边界

样式包是用户从外部下载的 zip，按不可信输入处理：

- **只走 CSSOM**：资源与排版变量通过 `element.style.setProperty()` 写入 CSS 变量，不拼 `cssText`、不写 `<style>` 文本、不把清单字符串拼进 React `style` 字符串。
- **白名单校验**（导入时在 `zip.ts` 完成，应用层只消费净化后的值）：
  - `fit` / `align` / `render` 只接受上表枚举，非法值报 `badConfig`，错误信息带字段名；
  - `position` 只允许 `^[A-Za-z0-9 %.,/+()-]{1,60}$`，并额外拒绝 `url(` / `expression(` / `/*`；
  - `color_palette` 只接受 `#hex` / `rgb()` / `rgba()` / `hsl()` / `hsla()` / `transparent`，且分量有界；
  - `effects` 只接受文档列出的已知键：`opacity` / `shadow` / `outerGlow` / `innerGlow` / `emboss` / `stroke` 的数值与颜色逐项校验，`window` 四个归一化坐标必须在 0–1 且 `x1 < x2`、`y1 < y2`，`zoom` 在 0–4，`tilt` 的 `maxAngle` / `perspective` / `scale` 有界且只允许出现在 `icon.*` 与 `cover`；未知键忽略并提示，数值/颜色不合规报 `badConfig`（带字段名）；
  - `cover` 与 `icon` / `license` 一样只从 zip 条目取路径（`{ file }` 或按主题的 `{ light, dark, file? }` 两种写法都会逐项校验；省略 `file` 时只用文档列出的默认位置候选，同样在导入时逐项校验）：`cover` 只接受 `png` / `jpg` / `jpeg` / `webp` / `svg` 且**每个主题的文件** ≤ 5 MB（超限 `badConfig`、类型不符 `badFileType`），`icon` 接受普通图片扩展名；绝对路径与 `..` 在导入时被拒；
  - `sidebarTitle` / `description` / `author` / `version` / 许可证文本拒绝控制字符与 `<` / `>`（展示层仍用 React 文本，不做 HTML 解析）；`sidebarTitle` 不合格为致命错误（`badConfig`），其余非关键字段忽略并提示；
  - `align: "custom"` 必须同时给出 `position`；`position` 在非 `custom` 时会被忽略（导入时提示一次）。
- **只用 blob URL**：`index.json` 里的路径只在 zip 内查文件；真正写进 CSS / `<img>` / `FontFace` / 详情页 `background-image` 的地址一律是 `URL.createObjectURL()` 生成的 `blob:` URL，并统一写成 `url("…")`（引号 + 反斜杠转义）。包内路径不会变成资源地址。视觉特效的派生图同样只在内存里用 canvas 生成 PNG Blob，再转成 `blob:` URL（canvas 同源、不加载远程资源，处理完即 revoke）。
- **字体家族名固定**：字体统一注册为 `DSLikePackFont`（不来自清单），`FontFace` 的 family 是常量、source 只有 blob URL。
- **CSP**（`index.html` 的 `Content-Security-Policy` 元标签）：
  - `img-src 'self' blob: data: https:`（`https:` 只用于搜索结果的站点图标）
  - `font-src 'self' blob: data:`
  - `style-src 'self' 'unsafe-inline'`（内联样式变量需要）
  - `connect-src 'self' https: http: ws: wss:`（自定义 API base_url 与开发服务器 HMR）
  - `media-src 'self' blob: data:`、`object-src 'none'`、`base-uri 'self'`
  - 不设 `default-src` / `script-src`，避免破坏 rspack 产物与 sql.js wasm。
- 因此**包作者不能引用远程资源**：背景 / 图标 / 字体只会加载包内文件（转成 blob URL），`url(https://…)`、`@import`、`expression()` 之类的字符串要么在导入时被拒绝，要么根本不会进入样式或 URL。