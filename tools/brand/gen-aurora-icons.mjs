// Aurora Chat 品牌图形生成器：从一套参数化极光几何同时产出
//   - assets/brand/*.svg / *.png（矢量源 + 桌面/商店用 PNG）
//   - desktop/build/icon.png（electron-builder 的 win.icon 输入）
//   - mobile/android/app/src/main/res 下的 mipmap 传统图标 / 自适应前景 / 启动图 / 矢量化前景
//
// 设计来源：与内置「极光（Aurora）」样式包同一套视觉语言（三条青蓝→紫的极光带、
// 深蓝底、柔和光晕），但为小尺寸重新构形：带子更粗、亮边更实、去掉细节星点与
// 大范围模糊，保证 32px 下仍能读出「极光带」。完整说明见 assets/brand/README.md。
//
// 依赖：只用 node 标准库（zlib）。PNG 由本文件里的解析式光栅器逐像素绘制，
// 同一份几何也用来拼 SVG，因此不依赖 resvg / sharp / Pillow。可重复运行：
//   node tools/brand/gen-aurora-icons.mjs
// 输出是确定性的（固定浮点几何、无随机数、无时间戳），重跑后字节一致。
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(here, '..', '..')
const BRAND_DIR = join(projectRoot, 'assets', 'brand')
const ANDROID_RES = join(projectRoot, 'mobile', 'android', 'app', 'src', 'main', 'res')
const DESKTOP_BUILD = join(projectRoot, 'desktop', 'build')

/* ------------------------------- PNG 编码 ------------------------------- */

const crcTable = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

const crc32 = (data) => {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i += 1) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData), 0)
  return Buffer.concat([length, typeAndData, crc])
}

/** RGBA 像素缓冲 → PNG。竖向渐变用 filter 'up' 提升压缩率。 */
const encodePng = (width, height, rgba) => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  const previous = Buffer.alloc(stride)
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1)
    const source = y * stride
    raw[row] = 2
    for (let i = 0; i < stride; i += 1) raw[row + 1 + i] = (rgba[source + i] - previous[i] + 256) & 0xff
    rgba.copy(previous, 0, source, source + stride)
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------ 几何与配色 ------------------------------ */

const MASTER = 1024 // 母版设计空间：1024×1024，满幅圆角方块

// 打包壳图标（桌面 exe / Android 启动器）使用亮色版本；启动图仍保持深底。
const PACKAGING_THEME = 'light'
const CORNER_RATIO = 0.225 // 圆角率，与旧桌面图标一致（rx = 230）
const CORNER_RADIUS = MASTER * CORNER_RATIO

/**
 * 三条极光带：中心线 y = f(x)（x 单调递增），横截面是「亮边 / 中层 / 外晕」三层
 * 指数衰减。dark / light 两套配色；light 只用于关于页展示，不作为 App 图标。
 */
const BANDS = [
  {
    // 主带：左下 → 右上，但中段明显下沉成一条「极光幕」弧线（与样式包图标的
    // 近直线构图区分开），最亮最粗；32px 下是一条约 5px 的亮弧。
    x0: 92,
    x1: 944,
    y0: 792,
    y1: 204,
    half: 86,
    bend: 92,
    freq: 1.8,
    phase: -1.15,
    fade: 0.12,
    knots: [1.3, 0.5, 0.1],
    dark: {
      strengths: [0.8, 0.33, 0.12],
      stops: [
        [0, [110, 208, 255]],
        [0.42, [150, 220, 255]],
        [0.75, [178, 172, 255]],
        [1, [192, 150, 255]],
      ],
    },
    light: {
      strengths: [0.95, 0.6, 0.22],
      stops: [
        [0, [16, 148, 202]],
        [0.42, [40, 112, 214]],
        [0.75, [114, 82, 212]],
        [1, [142, 74, 208]],
      ],
    },
  },
  {
    // 副带：左上回旋的短弧，紫 → 青，与主带形成「一主一辅」而非三条平行线
    x0: 138,
    x1: 534,
    y0: 262,
    y1: 396,
    half: 40,
    bend: -36,
    freq: 1.2,
    phase: -0.6,
    fade: 0.18,
    knots: [1.4, 2.2, 0.12],
    dark: {
      strengths: [0.46, 0.21, 0.075],
      stops: [
        [0, [184, 158, 255]],
        [0.55, [152, 174, 255]],
        [1, [120, 216, 255]],
      ],
    },
    light: {
      strengths: [0.62, 0.34, 0.12],
      stops: [
        [0, [134, 74, 208]],
        [0.55, [80, 112, 212]],
        [1, [18, 150, 198]],
      ],
    },
  },
  {
    // 短尾带：右下角收尾的小弧，青绿 → 青，最弱
    x0: 604,
    x1: 946,
    y0: 890,
    y1: 690,
    half: 38,
    bend: -26,
    freq: 1.5,
    phase: 3,
    fade: 0.18,
    knots: [1.8, 1.1, 0.12],
    dark: {
      strengths: [0.46, 0.21, 0.075],
      stops: [
        [0, [110, 240, 225]],
        [1, [110, 205, 255]],
      ],
    },
    light: {
      strengths: [0.55, 0.3, 0.1],
      stops: [
        [0, [10, 158, 140]],
        [1, [16, 136, 196]],
      ],
    },
  },
]

const BG_DARK = [
  [0, [10, 17, 49]],
  [1, [6, 16, 41]],
]
const BG_GLOWS_DARK = [
  [0.37, 0.31, 0.6, [62, 168, 255], 0.075],
  [0.78, 0.66, 0.55, [150, 96, 255], 0.065],
  [0.17, 0.73, 0.45, [90, 220, 200], 0.035],
]
const STARS = [
  [0.19, 0.245, 0.012, 0.05, 0.55],
  [0.815, 0.79, 0.013, 0.055, 0.6],
  [0.675, 0.48, 0.006, 0.03, 0.32],
]
const BG_LIGHT = [
  [0, [246, 250, 255]],
  [1, [226, 236, 250]],
]
const BG_GLOWS_LIGHT = [
  [0.36, 0.3, 0.6, [150, 215, 255], 0.55],
  [0.78, 0.7, 0.5, [198, 172, 255], 0.5],
]

const SPLASH_BG = [6, 16, 41] // #061029，与 values/ic_launcher_background 一致
const FLAT_BG = [6, 16, 41]

/* ------------------------------ 通用工具 ------------------------------ */

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value)
const smoothstep = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const rampRgb = (stops, t) => {
  const x = clamp01(t)
  let index = 0
  while (index < stops.length - 2 && x > stops[index + 1][0]) index += 1
  const [t0, c0] = stops[index]
  const [t1, c1] = stops[index + 1] ?? stops[index]
  return mixRgb(c0, c1, t1 === t0 ? 0 : (x - t0) / (t1 - t0))
}
const over = (dst, color, amount) => dst + (color - dst) * clamp01(amount)
const q = (value) => Number(value.toFixed(2))

/** 带在参数 t（0..1，x 线性）处的中心线 y、半宽、强度与颜色 */
const ribbonAt = (band, t, theme) => {
  const arch = Math.sin(Math.PI * t)
  const preset = band[theme]
  const center = band.y0 + (band.y1 - band.y0) * t + band.bend * Math.sin(Math.PI * band.freq * t + band.phase) * arch
  const half = band.half * (0.87 + 0.13 * arch)
  const [knotFreq, knotPhase, knotDepth] = band.knots
  const strength =
    smoothstep(0, band.fade, t) *
    smoothstep(1, 1 - band.fade, t) *
    (1 + knotDepth * Math.sin(Math.PI * 2 * knotFreq * t + knotPhase) * arch)
  return { center, half, strength, rgb: rampRgb(preset.stops, t) }
}

/**
 * 「极光主体」的几何包围盒（含外晕）。用于文档/构图参考。
 * 注意：前景与启动屏的实际缩放改用可见 alpha 包围盒（visibleMarkBox），
 * 否则半透明外晕会把几何包围盒撑大、导致肉眼可见主体占比偏小。
 */
const contentBBox = () => {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const reach = 1.8 // 取到中层偏外，肉眼可见的「主体」范围
  for (const band of BANDS) {
    for (let i = 0; i <= 240; i += 1) {
      const t = i / 240
      const { center, half } = ribbonAt(band, t, 'dark')
      const x = band.x0 + (band.x1 - band.x0) * t
      x0 = Math.min(x0, x - half * reach * 0.72)
      x1 = Math.max(x1, x + half * reach * 0.72)
      y0 = Math.min(y0, center - half * reach)
      y1 = Math.max(y1, center + half * reach)
    }
  }
  return { x0: x0 - 6, y0: y0 - 6, x1: x1 + 6, y1: y1 + 6 }
}
const CONTENT = contentBBox()

/**
 * 自适应前景的可见极光主体包围盒（母版坐标）。
 * 在母版上按 448² 采样同一套 alpha 合成公式，取 alpha ≥ 阈值（默认 12/255）的范围；
 * 前景 / 启动屏据此把「肉眼可见主体」缩放到 62% / 26%，外晕允许溢出到安全区边缘。
 */
const visibleMarkBox = (alphaThreshold = 12 / 255) => {
  const samples = 448
  const scale = samples / MASTER // canvas px per master unit
  const columns = precomputeColumns(samples, scale, 0, 'dark')
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let py = 0; py < samples; py += 1) {
    const my = (py + 0.5) / scale
    for (let px = 0; px < samples; px += 1) {
      const mx = (px + 0.5) / scale
      let accA = 0
      for (const band of columns) {
        const strength = band.strength[px]
        if (strength <= 0) continue
        const dy = (my - band.center[px]) / band.half[px]
        const terms = bandTerms(dy, band.strengths, strength)
        if (!terms) continue
        accA += terms.edge * 1.0 + terms.mid * 0.65 + terms.halo * 0.32
      }
      if (accA < alphaThreshold) continue
      x0 = Math.min(x0, mx)
      x1 = Math.max(x1, mx)
      y0 = Math.min(y0, my)
      y1 = Math.max(y1, my)
    }
  }
  return { x0, y0, x1, y1 }
}
const MARK_BOX = visibleMarkBox()

/* ------------------------- 光栅器：列预计算 + 像素循环 ------------------------- */

/** 每列预计算三条带的中心 / 半宽 / 强度 / 颜色（以 canvas 像素列为索引） */
function precomputeColumns(width, scale, offsetX, theme) {
  return BANDS.map((band) => {
    const center = new Float64Array(width)
    const half = new Float64Array(width)
    const strength = new Float64Array(width)
    const cr = new Float64Array(width)
    const cg = new Float64Array(width)
    const cb = new Float64Array(width)
    for (let px = 0; px < width; px += 1) {
      const mx = (px + 0.5 - offsetX) / scale
      const t = (mx - band.x0) / (band.x1 - band.x0)
      if (t < 0 || t > 1) continue
      const sample = ribbonAt(band, t, theme)
      center[px] = sample.center
      half[px] = sample.half
      strength[px] = sample.strength
      cr[px] = sample.rgb[0]
      cg[px] = sample.rgb[1]
      cb[px] = sample.rgb[2]
    }
    return { center, half, strength, cr, cg, cb, strengths: band[theme].strengths }
  })
}

const roundedBoxSdf = (mx, my) => {
  const qx = Math.abs(mx - MASTER / 2) - (MASTER / 2 - CORNER_RADIUS)
  const qy = Math.abs(my - MASTER / 2) - (MASTER / 2 - CORNER_RADIUS)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - CORNER_RADIUS
}
const circleSdf = (mx, my) => Math.hypot(mx - MASTER / 2, my - MASTER / 2) - MASTER / 2

/** 三层带横截面：返回亮边 / 中层 / 外晕的强度 */
function bandTerms(dy, strengths, strength) {
  if (dy > 5 || dy < -6 || strength <= 0) return null
  const edge = Math.exp(-(((dy - 0.46) / 0.5) ** 2)) * strengths[0] * strength
  const mid = Math.exp(-((dy / 1.1) ** 2)) * strengths[1] * strength
  const halo = Math.exp(-((dy / 2.6) ** 2)) * strengths[2] * strength
  return { edge, mid, halo }
}

/**
 * 圆角方块图标（App 图标 / Android 传统图标 / 浅底关于页版本）。
 * insetRatio = 1 时满幅；0.76 时是 Android 传统图标的主体占比。
 */
const renderPlaque = (size, { theme = 'dark', shape = 'rounded', insetRatio = 1 } = {}) => {
  const side = size * insetRatio
  const scale = side / MASTER
  const offset = (size - side) / 2
  const columns = precomputeColumns(size, scale, offset, theme)
  const light = theme === 'light'
  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py += 1) {
    const my = (py + 0.5 - offset) / scale
    const v = my / MASTER
    for (let px = 0; px < size; px += 1) {
      const mx = (px + 0.5 - offset) / scale
      const u = mx / MASTER
      const dist = shape === 'circle' ? circleSdf(mx, my) : roundedBoxSdf(mx, my)
      const coverage = clamp01(0.5 - dist * scale)
      if (coverage <= 0) continue

      let r
      let g
      let b
      if (light) {
        const base = rampRgb(BG_LIGHT, clamp01(0.1 + 0.9 * (1 - v)))
        r = base[0]
        g = base[1]
        b = base[2]
        for (const [cx, cy, radius, color, energy] of BG_GLOWS_LIGHT) {
          const falloff = clamp01(1 - Math.hypot(u - cx, v - cy) / radius)
          const amount = falloff ** 3 * energy
          r = over(r, color[0], amount)
          g = over(g, color[1], amount)
          b = over(b, color[2], amount)
        }
      } else {
        const base = rampRgb(BG_DARK, clamp01(0.15 + 0.9 * (1 - v)))
        r = base[0]
        g = base[1]
        b = base[2]
        for (const [cx, cy, radius, color, energy] of BG_GLOWS_DARK) {
          const falloff = clamp01(1 - Math.hypot(u - cx, v - cy) / radius)
          const amount = falloff ** 3 * energy
          r += color[0] * amount
          g += color[1] * amount
          b += color[2] * amount
        }
        for (const [sx, sy, coreRadius, haloRadius, energy] of STARS) {
          const distance = Math.hypot(u - sx, v - sy)
          const core = Math.exp(-((distance / coreRadius) ** 2)) * energy
          const halo = Math.exp(-((distance / haloRadius) ** 2)) * energy * 0.22
          r += 220 * core + 120 * halo
          g += 236 * core + 150 * halo
          b += 255 * core + 200 * halo
        }
      }

      for (const band of columns) {
        const strength = band.strength[px]
        if (strength <= 0) continue
        const dy = (my - band.center[px]) / band.half[px]
        const terms = bandTerms(dy, band.strengths, strength)
        if (!terms) continue
        const cr = band.cr[px]
        const cg = band.cg[px]
        const cb = band.cb[px]
        if (light) {
          const haloRgb = mixRgb([cr, cg, cb], [255, 255, 255], 0.72)
          const midRgb = mixRgb([cr, cg, cb], [255, 255, 255], 0.38)
          r = over(r, haloRgb[0], terms.halo * 0.85)
          g = over(g, haloRgb[1], terms.halo * 0.85)
          b = over(b, haloRgb[2], terms.halo * 0.85)
          r = over(r, midRgb[0], terms.mid * 0.9)
          g = over(g, midRgb[1], terms.mid * 0.9)
          b = over(b, midRgb[2], terms.mid * 0.9)
          r = over(r, cr, terms.edge * 0.92)
          g = over(g, cg, terms.edge * 0.92)
          b = over(b, cb, terms.edge * 0.92)
        } else {
          // 亮边偏白、中层本色、外晕向天空一侧铺开（加色，交叉处自然变亮）
          r += (cr * 0.7 + 96) * terms.edge + cr * terms.mid + cr * terms.halo
          g += (cg * 0.7 + 102) * terms.edge + cg * terms.mid + cg * terms.halo
          b += (cb * 0.7 + 110) * terms.edge + cb * terms.mid + cb * terms.halo
        }
      }

      // 内缘高光：让方块在深色桌面上也有清晰边界
      const depth = -dist / MASTER
      const rim = (1 - clamp01(depth / (light ? 0.014 : 0.012))) * (light ? 0.34 : 0.2)
      if (light) {
        const rimRgb = mixRgb([74, 108, 168], [126, 90, 182], v)
        r = over(r, rimRgb[0], rim)
        g = over(g, rimRgb[1], rim)
        b = over(b, rimRgb[2], rim)
      } else {
        const rimRgb = mixRgb([118, 206, 255], [172, 152, 255], v)
        r += rimRgb[0] * rim
        g += rimRgb[1] * rim
        b += rimRgb[2] * rim
      }

      // 暗色轻微暗角；亮色只做很轻的边缘压暗
      const vignette = light
        ? 1 - 0.06 * smoothstep(0.35, 0.85, Math.hypot(u - 0.5, v - 0.5))
        : 1 - 0.22 * smoothstep(0.3, 0.78, Math.hypot(u - 0.5, v - 0.5))
      r *= vignette
      g *= vignette
      b *= vignette

      const offsetPixel = (py * size + px) * 4
      rgba[offsetPixel] = Math.round(Math.min(255, Math.max(0, r)))
      rgba[offsetPixel + 1] = Math.round(Math.min(255, Math.max(0, g)))
      rgba[offsetPixel + 2] = Math.round(Math.min(255, Math.max(0, b)))
      rgba[offsetPixel + 3] = Math.round(coverage * 255)
    }
  }
  return rgba
}

/** 自适应图标前景：透明底 + 极光主体，主体宽 = 62% 画布，居中留安全边距 */
const renderForeground = (size, theme = 'dark') => {
  const targetWidth = 0.62 * size
  const scale = targetWidth / (MARK_BOX.x1 - MARK_BOX.x0)
  const offsetX = size / 2 - ((MARK_BOX.x0 + MARK_BOX.x1) / 2) * scale
  const offsetY = size / 2 - ((MARK_BOX.y0 + MARK_BOX.y1) / 2) * scale
  const columns = precomputeColumns(size, scale, offsetX, theme)
  const light = theme === 'light'
  const rgba = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py += 1) {
    const my = (py + 0.5 - offsetY) / scale
    for (let px = 0; px < size; px += 1) {
      const mx = (px + 0.5 - offsetX) / scale
      let accA = 0
      let accR = 0
      let accG = 0
      let accB = 0
      for (const band of columns) {
        const strength = band.strength[px]
        if (strength <= 0) continue
        const dy = (my - band.center[px]) / band.half[px]
        const terms = bandTerms(dy, band.strengths, strength)
        if (!terms) continue
        const cr = band.cr[px]
        const cg = band.cg[px]
        const cb = band.cb[px]
        // 亮边偏白、中层本色、外晕偏冷暗，alpha 按三层能量累加
        const edgeRgb = light
          ? mixRgb([cr, cg, cb], [255, 255, 255], 0.35)
          : mixRgb([cr, cg, cb], [236, 248, 255], 0.55)
        const haloRgb = light
          ? mixRgb([cr, cg, cb], [236, 243, 255], 0.3)
          : mixRgb([cr, cg, cb], [24, 44, 92], 0.25)
        accA += terms.edge * 1.0 + terms.mid * 0.65 + terms.halo * 0.32
        accR += edgeRgb[0] * terms.edge + cr * terms.mid + haloRgb[0] * terms.halo
        accG += edgeRgb[1] * terms.edge + cg * terms.mid + haloRgb[1] * terms.halo
        accB += edgeRgb[2] * terms.edge + cb * terms.mid + haloRgb[2] * terms.halo
      }
      if (accA <= 0) continue
      const alpha = clamp01(accA)
      const offsetPixel = (py * size + px) * 4
      rgba[offsetPixel] = Math.round(Math.min(255, accR / accA))
      rgba[offsetPixel + 1] = Math.round(Math.min(255, accG / accA))
      rgba[offsetPixel + 2] = Math.round(Math.min(255, accB / accA))
      rgba[offsetPixel + 3] = Math.round(alpha * 255)
    }
  }
  return rgba
}

/** 启动屏：深蓝底 + 居中极光主体（主体宽 = 26% 短边）+ 中央柔和光晕 */
const renderSplash = (width, height) => {
  const minDim = Math.min(width, height)
  const scale = (0.26 * minDim) / (MARK_BOX.x1 - MARK_BOX.x0)
  const offsetX = width / 2 - ((MARK_BOX.x0 + MARK_BOX.x1) / 2) * scale
  const offsetY = height / 2 - ((MARK_BOX.y0 + MARK_BOX.y1) / 2) * scale
  const columns = precomputeColumns(width, scale, offsetX, 'dark')
  const rgba = Buffer.alloc(width * height * 4)
  for (let py = 0; py < height; py += 1) {
    const my = (py + 0.5 - offsetY) / scale
    const dy = (py + 0.5 - height / 2) / (height * 0.24)
    for (let px = 0; px < width; px += 1) {
      const mx = (px + 0.5 - offsetX) / scale
      let r = SPLASH_BG[0]
      let g = SPLASH_BG[1]
      let b = SPLASH_BG[2]
      // 中央偏上的柔和氛围光，边缘严格保持 #061029
      const dx = (px + 0.5 - width / 2) / (width * 0.32)
      const glow = clamp01(1 - Math.hypot(dx, dy)) ** 3 * 0.1
      r += 62 * glow
      g += 120 * glow
      b += 210 * glow
      for (const band of columns) {
        const strength = band.strength[px]
        if (strength <= 0) continue
        const bandDy = (my - band.center[px]) / band.half[px]
        const terms = bandTerms(bandDy, band.strengths, strength)
        if (!terms) continue
        const cr = band.cr[px]
        const cg = band.cg[px]
        const cb = band.cb[px]
        r += (cr * 0.7 + 96) * terms.edge + cr * terms.mid + cr * terms.halo
        g += (cg * 0.7 + 102) * terms.edge + cg * terms.mid + cg * terms.halo
        b += (cb * 0.7 + 110) * terms.edge + cb * terms.mid + cb * terms.halo
      }
      const offsetPixel = (py * width + px) * 4
      rgba[offsetPixel] = Math.round(Math.min(255, Math.max(0, r)))
      rgba[offsetPixel + 1] = Math.round(Math.min(255, Math.max(0, g)))
      rgba[offsetPixel + 2] = Math.round(Math.min(255, Math.max(0, b)))
      rgba[offsetPixel + 3] = 255
    }
  }
  return rgba
}

/* ------------------------------ SVG 生成 ------------------------------ */

const num = (value) => String(q(value))

const fadeOpacity = (band, t) => smoothstep(0, band.fade, t) * smoothstep(1, 1 - band.fade, t)

const bandPathData = (band, samples = 96) => {
  let d = ''
  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples
    const { center } = ribbonAt(band, t, 'dark')
    const x = band.x0 + (band.x1 - band.x0) * t
    d += `${i === 0 ? 'M' : 'L'}${num(x)} ${num(center)} `
  }
  return d.trim()
}

const gradientStops = (band, theme, whitening) => {
  const preset = band[theme]
  const ts = new Set([0, 0.02, band.fade, 0.42, 0.75, 1 - band.fade, 0.98, 1])
  return [...ts]
    .filter((t) => t >= 0 && t <= 1)
    .sort((a, b) => a - b)
    .map((t) => {
      const rgb = rampRgb(preset.stops, t)
      const color = whitening > 0 ? mixRgb(rgb, [255, 255, 255], whitening) : rgb
      const opacity = q(fadeOpacity(band, t))
      return `<stop offset="${num(t)}" stop-color="#${color
        .map((channel) => Math.round(channel).toString(16).padStart(2, '0'))
        .join('')}" stop-opacity="${opacity}"/>`
    })
    .join('\n        ')
}

const bandGradient = (id, band, theme, whitening) => {
  const preset = band[theme]
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(band.x0)}" y1="${num(band.y0)}" x2="${num(band.x1)}" y2="${num(band.y1)}">
        ${gradientStops(band, theme, whitening)}
      </linearGradient>`
}

/** 极光带主体：四层描边（柔光 / 中层 / 亮边 / 高光脊）叠出加色发光感 */
const bandsMarkup = (theme = 'dark') => {
  const light = theme === 'light'
  const strokes = BANDS.map((band, index) => {
    const preset = band[theme]
    const [s0, s1, s2] = preset.strengths
    const path = bandPathData(band)
    const halo = `<path d="${path}" fill="none" stroke="url(#b${index}Halo)" stroke-width="${num(band.half * 3.4)}" stroke-linecap="round" opacity="${num(
      0.16 * (s2 / (light ? 0.22 : 0.15))
    )}" filter="url(#soft${index})"/>`
    const mid = `<path d="${path}" fill="none" stroke="url(#b${index}Mid)" stroke-width="${num(band.half * 1.9)}" stroke-linecap="round" opacity="${num(
      0.5 * (s1 / (light ? 0.6 : 0.35))
    )}" filter="url(#mid${index})"/>`
    const edge = `<path d="${path}" fill="none" stroke="url(#b${index}Edge)" stroke-width="${num(band.half * 0.85)}" stroke-linecap="round" opacity="${num(
      0.88 * (s0 / (light ? 0.95 : 0.64))
    )}" filter="url(#edge${index})"/>`
    const ridge = `<path d="${path}" fill="none" stroke="url(#b${index}Ridge)" stroke-width="${num(band.half * 0.28)}" stroke-linecap="round" opacity="${light ? '0.3' : '0.5'}"/>`
    return `    ${halo}\n    ${mid}\n    ${edge}\n    ${ridge}`
  })
  return `<g>
${strokes.join('\n')}
  </g>`
}

const bandsDefs = (theme = 'dark', prefix = '') => {
  const defs = []
  BANDS.forEach((band, index) => {
    defs.push(bandGradient(`b${index}Halo`, band, theme, theme === 'light' ? 0.72 : 0))
    defs.push(bandGradient(`b${index}Mid`, band, theme, theme === 'light' ? 0.38 : 0))
    defs.push(bandGradient(`b${index}Edge`, band, theme, theme === 'light' ? 0 : 0.42))
    defs.push(bandGradient(`b${index}Ridge`, band, theme, theme === 'light' ? 0.45 : 0.72))
    defs.push(
      `<filter id="soft${index}" x="-60%" y="-80%" width="220%" height="260%"><feGaussianBlur stdDeviation="${num(
        band.half * 1.5
      )}"/></filter>`
    )
    defs.push(
      `<filter id="mid${index}" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="${num(
        band.half * 0.7
      )}"/></filter>`
    )
    defs.push(
      `<filter id="edge${index}" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="${num(
        band.half * 0.2
      )}"/></filter>`
    )
  })
  return `<defs>\n    ${defs.join('\n    ')}\n  </defs>`
}

const plaqueSvgBody = (theme) => {
  const light = theme === 'light'
  return `  <defs>
    <linearGradient id="plaqueBase" gradientUnits="userSpaceOnUse" x1="512" y1="0" x2="512" y2="1024">
      <stop offset="0" stop-color="${light ? '#f6faff' : '#0a1131'}"/>
      <stop offset="1" stop-color="${light ? '#e2ecfa' : '#061029'}"/>
    </linearGradient>
    <radialGradient id="glowCyan" cx="0.38" cy="0.31" r="0.62">
      <stop offset="0" stop-color="${light ? '#96d7ff' : '#3ea8ff'}" stop-opacity="${light ? '0.55' : '0.09'}"/>
      <stop offset="0.25" stop-color="${light ? '#96d7ff' : '#3ea8ff'}" stop-opacity="${light ? '0.23' : '0.038'}"/>
      <stop offset="0.5" stop-color="${light ? '#96d7ff' : '#3ea8ff'}" stop-opacity="${light ? '0.07' : '0.011'}"/>
      <stop offset="0.75" stop-color="${light ? '#96d7ff' : '#3ea8ff'}" stop-opacity="${light ? '0.012' : '0.0016'}"/>
      <stop offset="1" stop-color="${light ? '#96d7ff' : '#3ea8ff'}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowViolet" cx="0.78" cy="0.66" r="0.55">
      <stop offset="0" stop-color="${light ? '#c6acff' : '#9660ff'}" stop-opacity="${light ? '0.5' : '0.08'}"/>
      <stop offset="0.25" stop-color="${light ? '#c6acff' : '#9660ff'}" stop-opacity="${light ? '0.21' : '0.034'}"/>
      <stop offset="0.5" stop-color="${light ? '#c6acff' : '#9660ff'}" stop-opacity="${light ? '0.062' : '0.01'}"/>
      <stop offset="0.75" stop-color="${light ? '#c6acff' : '#9660ff'}" stop-opacity="${light ? '0.01' : '0.0014'}"/>
      <stop offset="1" stop-color="${light ? '#c6acff' : '#9660ff'}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.78">
      <stop offset="0" stop-color="#000000" stop-opacity="0"/>
      <stop offset="0.42" stop-color="#000000" stop-opacity="0"/>
      <stop offset="0.66" stop-color="#000000" stop-opacity="${light ? '0.015' : '0.05'}"/>
      <stop offset="0.86" stop-color="#000000" stop-opacity="${light ? '0.04' : '0.14'}"/>
      <stop offset="1" stop-color="#000000" stop-opacity="${light ? '0.06' : '0.22'}"/>
    </radialGradient>
    <linearGradient id="rimGrad" gradientUnits="userSpaceOnUse" x1="512" y1="0" x2="512" y2="1024">
      <stop offset="0" stop-color="${light ? '#6a8cb8' : '#76ceff'}" stop-opacity="${light ? '0.4' : '0.55'}"/>
      <stop offset="1" stop-color="${light ? '#7e5ab6' : '#ac98ff'}" stop-opacity="${light ? '0.34' : '0.45'}"/>
    </linearGradient>
    <clipPath id="plaqueClip"><rect width="1024" height="1024" rx="${num(CORNER_RADIUS)}"/></clipPath>
    ${bandsDefs(theme)}
  </defs>
  <rect width="1024" height="1024" rx="${num(CORNER_RADIUS)}" fill="url(#plaqueBase)"/>
  <rect width="1024" height="1024" rx="${num(CORNER_RADIUS)}" fill="url(#glowCyan)"/>
  <rect width="1024" height="1024" rx="${num(CORNER_RADIUS)}" fill="url(#glowViolet)"/>
  <g clip-path="url(#plaqueClip)">
    ${bandsMarkup(theme)}
  </g>
  <rect width="1024" height="1024" rx="${num(CORNER_RADIUS)}" fill="url(#vignette)"/>
  <rect x="1.5" y="1.5" width="1021" height="1021" rx="${num(CORNER_RADIUS - 1.5)}" fill="none" stroke="url(#rimGrad)" stroke-width="3"/>`
}

const svgDoc = ({ width, height, viewBox = `0 0 ${width} ${height}`, body }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">
${body}
</svg>
`

/** 关于页矢量版：极光主体 + 软光晕，透明底，无文字 */
const lockupSvg = () => {
  const side = 716
  const scale = side / MASTER
  const originX = (2048 - side) / 2
  const originY = (1152 - side) / 2
  const plaqueBody = plaqueSvgBody('dark')
  return svgDoc({
    width: 2048,
    height: 1152,
    body: `  <defs>
    <filter id="bloom" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="70"/></filter>
  </defs>
  <ellipse cx="1024" cy="560" rx="430" ry="400" fill="#2f7fd1" opacity="0.13" filter="url(#bloom)"/>
  <ellipse cx="1150" cy="700" rx="300" ry="280" fill="#7b5cff" opacity="0.11" filter="url(#bloom)"/>
  <g transform="translate(${num(originX)} ${num(originY)}) scale(${num(scale)})">
${plaqueBody.split('\n').map((line) => `    ${line}`).join('\n')}
  </g>`,
  })
}

const markSvg = () => svgDoc({ width: 1024, height: 1024, body: plaqueSvgBody('dark') })

const markLightSvg = () => svgDoc({ width: 1024, height: 1024, body: plaqueSvgBody('light') })

/** 自适应图标前景矢量（1024 画布，透明底，主体 62%，供 Android 文档/复用） */
const markForegroundSvg = () => {
  const targetWidth = 0.62 * 1024
  const scale = targetWidth / (MARK_BOX.x1 - MARK_BOX.x0)
  const offsetX = 512 - ((MARK_BOX.x0 + MARK_BOX.x1) / 2) * scale
  const offsetY = 512 - ((MARK_BOX.y0 + MARK_BOX.y1) / 2) * scale
  return svgDoc({
    width: 1024,
    height: 1024,
    body: `  ${bandsDefs('dark')}
  <g transform="translate(${num(offsetX)} ${num(offsetY)}) scale(${num(scale)})">
    ${bandsMarkup('dark').split('\n').map((line) => `  ${line}`).join('\n')}
  </g>`,
  })
}

/* ------------------------------ 写文件 ------------------------------ */

const written = []
const record = (target, buffer) => {
  writeFileSync(target, buffer)
  const relative = target.startsWith(projectRoot) ? target.slice(projectRoot.length + 1) : target
  written.push({ file: relative.replace(/\\/g, '/'), bytes: buffer.length })
}

const writePng = (target, width, height, rgba) => record(target, encodePng(width, height, rgba))
const writeText = (target, text) => record(target, Buffer.from(text, 'utf8'))

const ensureDir = (target) => mkdirSync(dirname(target), { recursive: true })

/* ---------- assets/brand：矢量源 + 桌面/商店 PNG + 浅底关于页版本 ---------- */

ensureDir(join(BRAND_DIR, 'aurora-1024.png'))
writePng(join(BRAND_DIR, 'aurora-1024.png'), 1024, 1024, renderPlaque(1024))
writePng(join(BRAND_DIR, 'aurora-512.png'), 512, 512, renderPlaque(512))
writePng(join(BRAND_DIR, 'aurora-192.png'), 192, 192, renderPlaque(192))
writePng(join(BRAND_DIR, 'aurora-48.png'), 48, 48, renderPlaque(48))
writePng(join(BRAND_DIR, 'aurora-light-1024.png'), 1024, 1024, renderPlaque(1024, { theme: 'light' }))
writePng(join(BRAND_DIR, 'aurora-light-512.png'), 512, 512, renderPlaque(512, { theme: 'light' }))
writePng(join(BRAND_DIR, 'aurora-light-192.png'), 192, 192, renderPlaque(192, { theme: 'light' }))
writePng(join(BRAND_DIR, 'aurora-light-48.png'), 48, 48, renderPlaque(48, { theme: 'light' }))
writeText(join(BRAND_DIR, 'aurora-mark.svg'), markSvg())
writeText(join(BRAND_DIR, 'aurora-mark-foreground.svg'), markForegroundSvg())
writeText(join(BRAND_DIR, 'aurora-mark-light.svg'), markLightSvg())
writeText(join(BRAND_DIR, 'aurora-lockup.svg'), lockupSvg())

/* ---------- desktop/build/icon.png：electron-builder 的 win.icon ---------- */

ensureDir(join(DESKTOP_BUILD, 'icon.png'))
writePng(join(DESKTOP_BUILD, 'icon.png'), 1024, 1024, renderPlaque(1024, { theme: PACKAGING_THEME }))

/* ---------- Android 传统图标 + 自适应前景 ---------- */

const DENSITIES = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
]
for (const [dpi, legacySize, foregroundSize] of DENSITIES) {
  const legacyDir = join(ANDROID_RES, `mipmap-${dpi}`)
  ensureDir(join(legacyDir, 'ic_launcher.png'))
  // 传统图标：主体（圆角方块）占 76%，四周透明；round 版用同样 76% 的圆形主体；打包壳用亮色
  writePng(
    join(legacyDir, 'ic_launcher.png'),
    legacySize,
    legacySize,
    renderPlaque(legacySize, { theme: PACKAGING_THEME, insetRatio: 0.76 })
  )
  writePng(
    join(legacyDir, 'ic_launcher_round.png'),
    legacySize,
    legacySize,
    renderPlaque(legacySize, { shape: 'circle', theme: PACKAGING_THEME, insetRatio: 0.76 })
  )
  // 自适应图标前景：透明底，主体 62%（108dp 画布中间 66dp 安全区内）；打包壳用亮色
  writePng(
    join(legacyDir, 'ic_launcher_foreground.png'),
    foregroundSize,
    foregroundSize,
    renderForeground(foregroundSize, PACKAGING_THEME)
  )
}

/* ---------- Android 启动图：沿用现有各密度尺寸，深蓝底 + 26% 居中极光 ---------- */

const SPLASH_TARGETS = [
  ['drawable/splash.png', 480, 320],
  ['drawable-port-mdpi/splash.png', 320, 480],
  ['drawable-port-hdpi/splash.png', 480, 800],
  ['drawable-port-xhdpi/splash.png', 720, 1280],
  ['drawable-port-xxhdpi/splash.png', 1080, 1920],
  ['drawable-port-xxxhdpi/splash.png', 1440, 2560],
  ['drawable-land-mdpi/splash.png', 480, 320],
  ['drawable-land-hdpi/splash.png', 800, 480],
  ['drawable-land-xhdpi/splash.png', 1280, 720],
  ['drawable-land-xxhdpi/splash.png', 1920, 1080],
  ['drawable-land-xxxhdpi/splash.png', 2560, 1440],
]
for (const [relative, width, height] of SPLASH_TARGETS) {
  const target = join(ANDROID_RES, relative)
  ensureDir(target)
  writePng(target, width, height, renderSplash(width, height))
}

/* ---------- Android 12+ 启动屏图标：高分辨率 nodpi PNG（避免栅格前景被放大发糊或被矢量裁切） ---------- */

const SPLASH_ICON = join(ANDROID_RES, 'drawable-nodpi', 'splash_icon.png')
ensureDir(SPLASH_ICON)
writePng(SPLASH_ICON, 1152, 1152, renderForeground(1152, 'dark'))

/* ---------- Android 纯矢量资源（保持资源 ID 不变，仅换内容） ---------- */

/**
 * drawable-v24/ic_launcher_foreground.xml：旧内容是官方鲸鱼矢量的兜底副本，
 * 这里换成简化极光前景矢量（透明底，主体 62%）。不用 aapt 渐变，纯描边色，
 * 保证任何 API 24+ 都能编译（它当前未被 @mipmap 引用，仅作同名兜底）。
 */
const vectorForegroundXml = () => {
  const targetWidth = 0.62 * 108
  const scale = targetWidth / (MARK_BOX.x1 - MARK_BOX.x0)
  const offsetX = 54 - ((MARK_BOX.x0 + MARK_BOX.x1) / 2) * scale
  const offsetY = 54 - ((MARK_BOX.y0 + MARK_BOX.y1) / 2) * scale
  const pathFor = (band, samples = 56) => {
    let d = ''
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples
      const { center } = ribbonAt(band, t, 'dark')
      const x = band.x0 + (band.x1 - band.x0) * t
      d += `${i === 0 ? 'M' : 'L'}${q(x * scale + offsetX)} ${q(center * scale + offsetY)} `
    }
    return d.trim()
  }
  const colors = [
    ['#66BEEBFF', '#CC9BE3FF', '#F2E9FFFF'],
    ['#44B9A6FF', '#99A9C4FF', '#D9D6FFFF'],
    ['#448FE0D6', '#999BE6FF', '#D9E8FFFF'],
  ]
  const paths = BANDS.map((band, index) => {
    const [haloColor, midColor, edgeColor] = colors[index]
    const d = pathFor(band)
    return `    <path
        android:fillColor="#00000000"
        android:pathData="${d}"
        android:strokeColor="${haloColor}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:strokeWidth="${q(band.half * 4.4 * scale)}" />
    <path
        android:fillColor="#00000000"
        android:pathData="${d}"
        android:strokeColor="${midColor}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:strokeWidth="${q(band.half * 2.3 * scale)}" />
    <path
        android:fillColor="#00000000"
        android:pathData="${d}"
        android:strokeColor="${edgeColor}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:strokeWidth="${q(band.half * 1.05 * scale)}" />`
  })
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- 由 tools/brand/gen-aurora-icons.mjs 生成；Aurora Chat 自适应图标透明前景的矢量兜底。
     透明底、主体宽 62%（108dp 画布中间 66dp 安全区），无文字、无官方元素。 -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
${paths.join('\n')}
</vector>
`
}

/** drawable/ic_launcher_background.xml：旧的青绿网格模板 → 深蓝极光底（渐变） */
const vectorBackgroundXml = () => `<?xml version="1.0" encoding="utf-8"?>
<!-- 由 tools/brand/gen-aurora-icons.mjs 生成；Aurora Chat 深蓝渐变底（#0a1030 → #061029）。
     当前自适应图标用的是 @color/ic_launcher_background，这份同名 drawable 留作兜底。 -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="linear"
                android:startX="24"
                android:startY="0"
                android:endX="84"
                android:endY="108">
                <item android:color="#FF0A1030" android:offset="0.0" />
                <item android:color="#FF061029" android:offset="1.0" />
            </gradient>
        </aapt:attr>
    </path>
</vector>
`

writeText(join(ANDROID_RES, 'drawable-v24', 'ic_launcher_foreground.xml'), vectorForegroundXml())
writeText(join(ANDROID_RES, 'drawable', 'ic_launcher_background.xml'), vectorBackgroundXml())

/* ------------------------------ 汇总输出 ------------------------------ */

const totalBytes = written.reduce((sum, entry) => sum + entry.bytes, 0)
console.log(`Aurora Chat brand assets written (${written.length} files, ${(totalBytes / 1024).toFixed(1)} KB)`)
for (const entry of written) {
  console.log(`  ${entry.file}  ${(entry.bytes / 1024).toFixed(1)} KB`)
}
