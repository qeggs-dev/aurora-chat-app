# Aurora Chat 图标与启动屏资产

Aurora Chat 的新 App 图标 / 启动屏 / 关于页图形。**没有任何字母、没有旧的 DS + 聊天气泡标记，
也没有官方 / DeepSeek 元素**：图形是深蓝圆角方块上 2–3 条青蓝→紫的抽象极光弧带 + 柔和光晕。

本目录的所有文件都由 `tools/brand/gen-aurora-icons.mjs` **一次性生成**（PNG 也由同一份几何
逐像素解析绘制，不依赖 resvg / sharp / Pillow），重跑命令见 §5。

---

## 1. 设计说明

### 1.1 构图

| 元素 | 说明 |
|---|---|
| 底板 | 1024×1024 满幅圆角方块，圆角率 22.5%（rx=230）；深蓝渐变 `#0a1030 → #061029`，右上偏亮、左下偏深 |
| 主带 | 从左下角向右上角扫出的**粗弧**，中段明显下沉（不是直线），青蓝 `#6ed0ff` → 蓝紫 `#b2acff` → 紫 `#c096ff`；带亮边 / 中层 / 外晕三层与一条更亮的「高光脊」 |
| 副带 | 左上角一条较短的紫色微光弧（可理解为极光帘的一角），紫 → 青 |
| 短尾 | 右下角一条青绿→青的小弧，作为构图收尾 |
| 氛围 | 青色 / 紫色两团柔和光晕、2–3 个极淡星点、内缘高光、轻微暗角 |

与内置「极光（Aurora）」样式包（`tools/style-fixture/gen.mjs` 里的 `auroraIconPng`）的关系：
**同一套视觉语言**（同一族青蓝→紫配色、极光带 + 深底 + 光晕的构图），但**不是同一张图**——
样式包里是 3 条近乎平行的对角软带 + 大范围模糊 + 3 颗星点；App 图标改成「一主带（中段下沉的
扫弧）+ 一辅带 + 一短尾」，亮边更实、外晕收窄、星点更少，专门为 32–48px 的可辨识性重画。
桌面旧图标（`assets/logo/` 里的 DS 标记）不再作为 App 图标使用。

### 1.2 配色

| 用途 | 暗底版（App 图标 / 启动屏，主用） | 浅底版（仅关于页展示） |
|---|---|---|
| 底板 | `#0a1030` → `#061029` | `#f6faff` → `#e2ecfa` |
| 主带 | `#6ed0ff` → `#96dcff` → `#b2acff` → `#c096ff` | `#1094ca` → `#2870d6` → `#7252d4` → `#8e4ad0` |
| 副带 | `#b89eff` → `#98aeff` → `#78d8ff` | `#864ad0` → `#5070d4` → `#1296c6` |
| 短尾 | `#6ef0e1` → `#6ecdff` | `#0a9e8c` → `#1088c4` |
| 启动屏底 | `#061029`（与 `values/ic_launcher_background.xml` 完全一致） | — |

### 1.3 几何

母版坐标系 1024×1024；每条极光带中心线是 x 的解析函数
`y = y0 + (y1−y0)·t + bend·sin(π·freq·t+phase)·sin(π·t)`，横截面是三层高斯：
亮边（σ=0.5·half，偏移 0.46·half）、中层（σ=1.1·half）、外晕（σ=2.6·half）。
「极光主体」包围盒由三条带的几何自动求出（当前约 x 78–948 / y 116–910），
自适应前景与启动屏按这个包围盒缩放居中：

- 自适应前景：可见主体（alpha≥12/255 的包围盒）宽 = 108dp 画布的 **62%**（实测 432px 版本 62.5%×62.0%）；
- 启动屏：可见主体宽 = 短边的 **26%**（实测竖屏 720×1280 为 26.4%），居中留边；
- 传统 Android 图标：主体（圆角方块 / 圆形）占 PNG 的 **76%**，四周透明。

---

## 2. 文件清单

### 2.1 矢量源

| 文件 | 规格 | 用途 |
|---|---|---|
| `aurora-mark.svg` | 1024×1024，满幅圆角方块 | 主矢量源：App 图标构图（深底 + 极光带 + 内缘高光） |
| `aurora-mark-foreground.svg` | 1024×1024，**透明底**，主体 62% | 自适应图标前景的矢量版（Android 文档 / 后续复用） |
| `aurora-mark-light.svg` | 1024×1024，浅底 | 关于页浅色主题展示用矢量版（**不是** App 图标） |
| `aurora-lockup.svg` | 2048×1152，透明底 | 关于页 / 商店图用的展示组合（图标 + 光晕，无文字） |

> SVG 是同一套参数化几何的矢量重建：用分层描边 + `feGaussianBlur` 近似解析式的高斯光晕。
> 它与 PNG 视觉一致但不是逐像素一致（`aurora-mark.svg` 用 resvg 渲染 1024 后与
> `aurora-1024.png` 的 MAE ≈ 16/255；浅底版 MAE ≈ 10/255），用于需要缩放 / 编辑的场合；
> **App 实际使用的是本目录的 PNG**（桌面端由 electron-builder 转 ICO）。

### 2.2 栅格版（App 图标 / 商店 / 关于页）

| 文件 | 尺寸 | 字节 | 用途 |
|---|---|---|---|
| `aurora-1024.png` | 1024×1024 RGBA | 305,803 | 主图标，桌面端 `desktop/build/icon.png` 同源同图 |
| `aurora-512.png` | 512×512 RGBA | 113,065 | 商店 / 关于页 / 大图标 |
| `aurora-192.png` | 192×192 RGBA | 29,781 | 桌面快捷方式 / PWA / 常规桌面图标 |
| `aurora-48.png` | 48×48 RGBA | 4,353 | 任务栏 / 小尺寸 / favicon 基尺寸 |
| `aurora-light-512.png` | 512×512 RGBA | 89,712 | 关于页**浅色主题**展示版（浅底 + 深色带；不用于 App 图标） |

### 2.3 桌面端

| 文件 | 尺寸 | 字节 | 说明 |
|---|---|---|---|
| `desktop/build/icon.png` | 1024×1024 RGBA | 305,803 | `electron-builder.yml` 的 `win.icon` 输入；electron-builder 会转成多档 ICO。需要由 lead / rebrand-aurora 重新打包后才会进入 exe |

### 2.4 Android（`mobile/android/app/src/main/res/`）

传统图标（透明画布，主体 76%）：

| 密度 | 文件 | 尺寸 | 字节 |
|---|---|---|---|
| mdpi | `mipmap-mdpi/ic_launcher.png` / `ic_launcher_round.png` | 48×48 / 48×48 | 3,185 / 3,160 |
| hdpi | `mipmap-hdpi/ic_launcher.png` / `ic_launcher_round.png` | 72×72 / 72×72 | 5,609 / 5,627 |
| xhdpi | `mipmap-xhdpi/ic_launcher.png` / `ic_launcher_round.png` | 96×96 / 96×96 | 8,365 / 8,481 |
| xxhdpi | `mipmap-xxhdpi/ic_launcher.png` / `ic_launcher_round.png` | 144×144 / 144×144 | 14,830 / 15,139 |
| xxxhdpi | `mipmap-xxxhdpi/ic_launcher.png` / `ic_launcher_round.png` | 192×192 / 192×192 | 21,778 / 22,185 |

- `ic_launcher.png`：圆角方块主体占 76%；
- `ic_launcher_round.png`：沿用 Android「round」语义，用同样 76% 的**圆形**主体（外围透明），
  而不是圆角方块——否则圆形启动器会出现方形透明角。资源 ID / 文件名未变。

自适应图标前景（透明底，主体 62%）：

| 密度 | 文件 | 尺寸 | 字节 |
|---|---|---|---|
| mdpi | `mipmap-mdpi/ic_launcher_foreground.png` | 108×108 | 5,481 |
| hdpi | `mipmap-hdpi/ic_launcher_foreground.png` | 162×162 | 9,517 |
| xhdpi | `mipmap-xhdpi/ic_launcher_foreground.png` | 216×216 | 13,504 |
| xxhdpi | `mipmap-xxhdpi/ic_launcher_foreground.png` | 324×324 | 22,374 |
| xxxhdpi | `mipmap-xxxhdpi/ic_launcher_foreground.png` | 432×432 | 32,153 |

`mipmap-anydpi-v26/ic_launcher.xml` 与 `ic_launcher_round.xml` 保持原样（仍是
`@color/ic_launcher_background` + `@mipmap/ic_launcher_foreground`），没有改资源 ID；
背景色仍是 `values/ic_launcher_background.xml` 里的 `#061029`。

启动屏（沿用原各密度尺寸；深蓝底 `#061029` + 居中极光，主体宽 = 短边 26%；四角严格等于 `#061029`）：

| 文件 | 尺寸 | 字节 |
|---|---|---|
| `drawable/splash.png` | 480×320 | 15,087 |
| `drawable-port-mdpi/splash.png` | 320×480 | 14,911 |
| `drawable-port-hdpi/splash.png` | 480×800 | 26,270 |
| `drawable-port-xhdpi/splash.png` | 720×1280 | 48,198 |
| `drawable-port-xxhdpi/splash.png` | 960×1600 | 67,854 |
| `drawable-port-xxxhdpi/splash.png` | 1280×1920 | 103,210 |
| `drawable-land-mdpi/splash.png` | 480×320 | 15,087 |
| `drawable-land-hdpi/splash.png` | 800×480 | 27,464 |
| `drawable-land-xhdpi/splash.png` | 1280×720 | 50,767 |
| `drawable-land-xxhdpi/splash.png` | 1600×960 | 73,918 |
| `drawable-land-xxxhdpi/splash.png` | 1920×1280 | 105,837 |

Android 12+ 启动屏（`values/styles.xml` 的 `AppTheme.NoActionBarLaunch`）**沿用现有方式**：
`windowSplashScreenBackground = @color/ic_launcher_background`（#061029），
`windowSplashScreenAnimatedIcon = @mipmap/ic_launcher_foreground`（同名资源，内容已被换成
透明底 62% 极光前景），`android:background = @drawable/splash`。只改了注释，资源引用未动。

同名矢量兜底（保持资源 ID 不变，仅换内容）：

| 文件 | 说明 |
|---|---|
| `drawable-v24/ic_launcher_foreground.xml` | 旧内容是官方鲸鱼矢量副本；现为简化极光前景矢量（108dp、透明底、主体 62%、纯描边色，API 24+ 可编译） |
| `drawable/ic_launcher_background.xml` | 旧内容是青绿网格模板；现为 `#0a1030 → #061029` 深蓝渐变底（当前未被引用，仅兜底） |

> 备注：`drawable/ic_launcher_background.xml` 与自适应图标实际使用的
> `@color/ic_launcher_background` 是两个不同资源（drawable vs color），都保持了原名。

### 2.5 生成 / 验证脚本

| 文件 | 说明 |
|---|---|
| `tools/brand/gen-aurora-icons.mjs` | 唯一生成器：输出本目录 + Android res + 桌面 icon.png 共 38 个文件，纯 Node（zlib），确定性（重跑字节一致），约 11 秒 |
| `tools/brand/verify-aurora-icons.py` | 验证 + 预览图：尺寸 / alpha / 四角颜色 / 自适应主体占比 / 32px 指标 / 生成 screenshots 预览 |

---

## 3. 32px 可辨识性（新图标 vs 旧 DS 图标 vs 内置样式包图标）

把 1024 原图用 LANCZOS 缩到 32px 后统计（`verify-aurora-icons.py` 的 `analyze32`）：

| 指标 | 新极光图标 | 旧 DS 标记 | 内置极光样式包图标 |
|---|---|---|---|
| 不透明区唯一颜色数 | **698** | 622 | 643 |
| Sobel 边缘能量（0–255 尺度） | **18.26** | 29.69 | 14.13 |
| 亮像素占比（L>0.55） | **8.0%** | 19.0% | 3.5% |
| 平均饱和度 | **0.180** | 0.290 | 0.111 |
| 清晰度（边缘能量 / 自身高斯模糊 1.6px 后） | **1.79** | 2.13 | 1.96 |

- 旧 DS 标记是高对比硬边字形（白字 + 蓝 S），边缘能量天然更高；新图标是柔和光带，
  但仍**明显高于**同风格的内置极光图标（边缘能量 18.3 vs 14.1、亮像素 8.0% vs 3.5%、
  饱和度 0.180 vs 0.111），说明不是一团糊；
- 32px 下可读出「一条青蓝→紫的发光弧 + 左上紫光 + 右下青尾」三层信息，
  对照图见 `screenshots/aurora-app-icon-32px-compare.png`（8× 放大）。

---

## 4. 生成与验证

### 4.1 重新生成全部图标 / 启动屏

```powershell
cd G:\work\projects\chat-demo-shell
node tools/brand/gen-aurora-icons.mjs
```

纯 Node 标准库（`node:zlib`），不装依赖；固定几何、无随机数、无时间戳，重跑得到字节一致的产物。
会覆盖：

- `assets/brand/*`（本目录 9 个文件）
- `desktop/build/icon.png`
- `mobile/android/app/src/main/res/mipmap-*/ic_launcher*.png`（15 个）
- `mobile/android/app/src/main/res/drawable*/splash.png`（11 个）
- `mobile/android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml`
- `mobile/android/app/src/main/res/drawable/ic_launcher_background.xml`

**不会**改应用名称 / 包名 / 构建脚本，也不会执行 desktop / mobile 构建。

### 4.2 验证 + 生成预览图

需要 Pillow（本机使用 DSH 自带 Python）：

```powershell
& "C:\Users\Administrator-Local\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" `
  tools/brand/verify-aurora-icons.py `
  --style-pack-icon "D:\Projects\Deepseek_Harness_Workspace\.tmp\aurora-ref\assets\dark\icon.png"
```

（`--style-pack-icon` 可选，仅用于 32px 对照；其余校验不需要它。默认把预览写到
`D:\Projects\Deepseek_Harness_Workspace\screenshots\`，可用 `--screenshots-dir` 覆盖。）

校验内容：38 个文件的尺寸 / 模式 / alpha 范围 / 透明角；自适应前景主体占比；启动屏四角是否
严格 `#061029`；`values/ic_launcher_background.xml` 是否 `#061029`；自适应 XML / styles.xml 是否
仍引用 `@mipmap/ic_launcher_foreground`；两个同名矢量 XML 是否还残留鲸鱼 / 官方元素描述。
全部通过时输出 `OK: all icon checks passed`。

预览图（`D:\Projects\Deepseek_Harness_Workspace\screenshots\`）：

| 文件 | 内容 |
|---|---|
| `aurora-app-icon-hero.png` | 深色壁纸上的 1024 图标大图 |
| `aurora-app-icon-sizes-dark.png` / `-light.png` | 亮 / 暗壁纸上的尺寸阶梯（1024 / 512 / 192 / 48 / 32） |
| `aurora-app-icon-32px-compare.png` | 旧 DS 32px vs 新极光 32px（8× 放大）+ 指标 |
| `aurora-app-icon-about-dark.png` / `-light.png` | 关于页亮 / 暗主题展示预览（暗底版 / 浅底版） |
| `aurora-app-icon-splash.png` | 竖屏 720×1280 + 横屏 1280×720 启动屏预览 |
| `aurora-app-icon-android.png` | Android 传统方块 / 圆形 / 自适应方形 / 自适应圆形 模拟 |

### 4.3 文件校验备注

- 所有 PNG 均为 8-bit RGBA、无 ICC / 无元数据；
- `desktop/build/icon.png` 为 1024×1024；旧 exe（`out/desktop/win-unpacked/Aurora Chat.exe`，
  2026-11-18 06:23 打包）里嵌的仍是 32px 旧 DS 图标，**需要 lead / rebrand-aurora 重新打包**
  才会更新；
- Android 侧未跑 Gradle 构建，`drawable-v24/ic_launcher_foreground.xml`、
  `drawable/ic_launcher_background.xml`、`values/styles.xml` 只做了 XML 解析自检（通过），
  最终以 APK 构建结果为准；
- `assets/logo/` 下的旧 DS 资产**未删除**（避免误伤别处引用 / 便于对照），是否清理由 lead 决定；
  新资产全部在 `assets/brand/`。

---

## 5. 需要重新构建后验证的点（交给 lead）

1. 桌面：跑 `scripts/build-desktop.ps1`（或 `pnpm dist`）后，检查 `out/desktop/win-unpacked/*.exe`
   的关联图标是否为极光图（`[System.Drawing.Icon]::ExtractAssociatedIcon` 提取 32px 对照），
   以及安装包 / zip 内的 icon；
2. Android：跑 `scripts/build-mobile.ps1` 后，检查 APK 内
   `res/mipmap-*/ic_launcher*.png`、`res/drawable*/splash.png` 为新资源，启动器上
   - 传统图标：76% 主体、透明边；
   - 自适应图标：圆形 / 圆角遮罩下主体不被裁切、背景为 `#061029`；
   - Android 12+ 启动屏：深蓝底 + 居中极光，且与 `#061029` 无接缝；
3. 关于页 / 设置页：换用 `aurora-512.png`（暗色）或 `aurora-light-512.png`（浅色）后的实际观感；
4. 若后续改了 `BANDS` 几何，务必重跑生成器 + 验证脚本；SVG 与 PNG 均由同一份几何生成，
   但 SVG 是近似重建（见 §2.1），不要拿 SVG 重新栅格化后替换商店图标，除非重新对照过尺寸。

---

## 6. 来源与授权

- 图形为本项目**原创绘制**（参数化极光几何），视觉语言参考项目内置的「极光」样式包
  （`tools/style-fixture/gen.mjs` 的 `AURORA_ICON_BANDS` / `auroraIconPng`），并非复制该图；
- 不含任何第三方商标、官方 logo、字母或官方元素；
- 生成器与资产随项目按 MIT 许可分发（见仓库根 `LICENSE` / `LICENSE-UPSTREAM` / `NOTICE.md`）。
