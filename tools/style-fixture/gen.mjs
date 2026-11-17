// 生成 Aurora Chat 样式包示例 / 验证用 zip：
//   aurora.zip        合法示例包：抽象背景 + 几何图标 + 静态特效 + window/zoom + 图标/封面 tilt
//   bg-effects.zip    背景带 window/zoom（生效）与 shadow/tilt（导入忽略并 warn）
//   bad-color.zip     图标 effects.stroke.color 非法 → badConfig
//   bad-window.zip    背景 effects.window x1 >= x2 → badConfig
//   bad-pkg-tilt.zip  包图标 icon.png 带 tilt → badConfig
//
// 依赖只有 node 标准库（zlib），不引入绘图库：所有图片都自己画像素并编码成 PNG。
// 用法：node tools/style-fixture/gen.mjs（产物写在同目录）
import { deflateRawSync, deflateSync } from 'node:zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/* ------------------------------ PNG 编码 ------------------------------ */

const crcTable = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c
  }
  return table
})()

const crc32 = (data) => {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i += 1) {
    c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  }
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

/**
 * RGBA 像素数组 → PNG Buffer。
 * `filter: 'up'` 时每行与上一行做差分（PNG filter type 2），竖向渐变压缩率更好；
 * 缺省沿用 filter type 0，保持既有资源字节不变。
 */
const encodePng = (width, height, rgba, filter) => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  const previous = Buffer.alloc(stride)
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1)
    const source = y * stride
    if (filter === 'up') {
      raw[row] = 2
      for (let i = 0; i < stride; i += 1) {
        raw[row + 1 + i] = (rgba[source + i] - previous[i] + 256) & 0xff
      }
      rgba.copy(previous, 0, source, source + stride)
    } else {
      raw[row] = 0
      rgba.copy(raw, row + 1, source, source + stride)
    }
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------ 画布工具 ------------------------------ */

const createCanvas = (width, height) => ({
  width,
  height,
  data: Buffer.alloc(width * height * 4),
})

const setPixel = (canvas, x, y, [r, g, b, a]) => {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return
  }
  const offset = (y * canvas.width + x) * 4
  const alpha = a / 255
  const target = canvas.data
  const dstAlpha = target[offset + 3] / 255
  const outAlpha = alpha + dstAlpha * (1 - alpha)
  if (outAlpha <= 0) {
    return
  }
  for (let i = 0; i < 3; i += 1) {
    const src = [r, g, b][i]
    target[offset + i] = Math.round((src * alpha + target[offset + i] * dstAlpha * (1 - alpha)) / outAlpha)
  }
  target[offset + 3] = Math.round(outAlpha * 255)
}

const fill = (canvas, color) => {
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      setPixel(canvas, x, y, color)
    }
  }
}

const blend = (canvas, x, y, color, coverage = 1) => {
  setPixel(canvas, x, y, [color[0], color[1], color[2], Math.round(color[3] * coverage)])
}

const fillRect = (canvas, x0, y0, width, height, color) => {
  for (let y = y0; y < y0 + height; y += 1) {
    for (let x = x0; x < x0 + width; x += 1) {
      setPixel(canvas, x, y, color)
    }
  }
}

const fillCircle = (canvas, cx, cy, radius, color) => {
  const r2 = radius * radius
  for (let y = Math.floor(cy - radius - 1); y <= cy + radius + 1; y += 1) {
    for (let x = Math.floor(cx - radius - 1); x <= cx + radius + 1; x += 1) {
      const dist2 = (x - cx) ** 2 + (y - cy) ** 2
      if (dist2 <= r2 + radius) {
        const coverage = Math.min(1, r2 + 0.5 - dist2 + radius * 0.5)
        blend(canvas, x, y, color, Math.max(0, Math.min(1, coverage)))
      }
    }
  }
}

const drawLine = (canvas, x0, y0, x1, y1, thickness, color) => {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    fillCircle(canvas, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thickness / 2, color)
  }
}

/** 横向线性渐变背景（返回新画布），stops = [[t, [r,g,b]], ...] */
const gradientCanvas = (width, height, angle, stops) => {
  const canvas = createCanvas(width, height)
  const radians = (angle * Math.PI) / 180
  const dx = Math.cos(radians)
  const dy = Math.sin(radians)
  const extent = Math.abs(width * dx) + Math.abs(height * dy)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const raw = ((x - width / 2) * dx + (y - height / 2) * dy) / extent + 0.5
      const t = Math.max(0, Math.min(1, raw))
      let index = 0
      while (index < stops.length - 2 && t > stops[index + 1][0]) {
        index += 1
      }
      const [t0, c0] = stops[index]
      const [t1, c1] = stops[Math.min(stops.length - 1, index + 1)]
      const local = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
      setPixel(canvas, x, y, [
        Math.round(c0[0] + (c1[0] - c0[0]) * local),
        Math.round(c0[1] + (c1[1] - c0[1]) * local),
        Math.round(c0[2] + (c1[2] - c0[2]) * local),
        255,
      ])
    }
  }
  return canvas
}

/** 确定性伪随机（避免每次生成不同图片） */
const rng = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

/* ------------------------------ 图片内容 ------------------------------ */

const backgroundPng = (variant) => {
  const dark = variant === 'dark'
  const canvas = gradientCanvas(
    480,
    720,
    115,
    dark
      ? [
          [0, [7, 11, 28]],
          [0.45, [14, 28, 66]],
          [0.7, [22, 58, 96]],
          [1, [8, 14, 34]],
        ]
      : [
          [0, [238, 246, 255]],
          [0.5, [206, 231, 246]],
          [0.78, [222, 240, 236]],
          [1, [244, 248, 255]],
        ]
  )
  // 极光带：几段半透明正弦光带
  const random = rng(dark ? 7 : 11)
  const bandColors = dark
    ? [
        [80, 220, 190],
        [96, 150, 255],
        [190, 120, 255],
      ]
    : [
        [120, 210, 200],
        [140, 180, 245],
        [190, 150, 245],
      ]
  for (let band = 0; band < 3; band += 1) {
    const color = bandColors[band]
    const amplitude = 40 + band * 22
    const offset = 160 + band * 150
    for (let x = 0; x < canvas.width; x += 1) {
      const center = offset + Math.sin((x / canvas.width) * Math.PI * (1.4 + band * 0.5) + band) * amplitude
      const thickness = 46 + band * 18
      for (let y = Math.floor(center - thickness); y <= center + thickness; y += 1) {
        const falloff = 1 - Math.abs(y - center) / thickness
        blend(canvas, x, y, [...color, 60], Math.max(0, falloff) ** 2)
      }
    }
  }
  // 星点 / 光斑
  const starCount = dark ? 90 : 50
  for (let i = 0; i < starCount; i += 1) {
    const x = Math.floor(random() * canvas.width)
    const y = Math.floor(random() * canvas.height)
    const radius = random() * 1.8 + 0.4
    fillCircle(canvas, x, y, radius, dark ? [235, 245, 255, 190] : [255, 255, 255, 200])
  }
  return encodePng(canvas.width, canvas.height, canvas.data)
}

const iconPng = (glyph, variant) => {
  const size = 96
  const canvas = createCanvas(size, size)
  const dark = variant === 'dark'
  const ink = dark ? [214, 232, 255, 255] : [24, 52, 104, 255]
  const accent = dark ? [150, 210, 255, 255] : [46, 96, 180, 255]
  if (glyph === 'send') {
    // 纸飞机箭头
    drawLine(canvas, 24, 48, 70, 26, 9, ink)
    drawLine(canvas, 24, 48, 70, 70, 9, ink)
    drawLine(canvas, 70, 26, 70, 70, 7, accent)
    fillCircle(canvas, 70, 48, 4.5, accent)
  } else if (glyph === 'menu') {
    for (const y of [32, 48, 64]) {
      drawLine(canvas, 24, y, 72, y, 8, ink)
    }
  } else if (glyph === 'copy') {
    // 两个错位圆角框
    for (const [x, y, color] of [
      [26, 26, ink],
      [38, 38, accent],
    ]) {
      drawLine(canvas, x, y, x + 30, y, 6, color)
      drawLine(canvas, x + 30, y, x + 30, y + 30, 6, color)
      drawLine(canvas, x + 30, y + 30, x, y + 30, 6, color)
      drawLine(canvas, x, y + 30, x, y, 6, color)
    }
  } else if (glyph === 'plus') {
    // 居中加号：用于验证 window 裁切 + zoom 缩放（bbox 可量）
    drawLine(canvas, 30, 48, 66, 48, 8, ink)
    drawLine(canvas, 48, 30, 48, 66, 8, accent)
  } else if (glyph === 'ring') {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.004) {
      for (let ring = 0; ring < 2; ring += 1) {
        const radius = ring === 0 ? 40 : 30
        const x = 48 + Math.cos(angle) * radius
        const y = 48 + Math.sin(angle) * radius * 0.9
        blend(canvas, Math.round(x), Math.round(y), [...(ring === 0 ? accent : ink), 255], 0.9)
      }
    }
    fillCircle(canvas, 48, 48, 8, ink)
  }
  return encodePng(size, size, canvas.data)
}

/* ------------------ 极光包视觉资源：包图标 + 详情页封面 ------------------ */

/*
 * 包图标：圆角方块底 + 一条主极光带（青蓝 #7fd4ff → 紫 #b49cff）斜贯画面，
 * 一条较弱的副带与一条短尾带衬托，背后两团柔和光晕，少量星点；四周留边，
 * 亮带主体占画布约 70%。亮 / 暗主题各一张：同一份几何，暗色是深底冷光版，
 * 亮色是浅底中高亮度版（深色带 + 浅色光晕），40px 下都有对比度。
 *
 * 详情页封面：纵向 3:4（1440×1920），供代码侧以 background-size: cover 铺满
 * 整个详情页内容区（不是 hero 小卡片）。极光带集中在中段，顶部 / 底部各带与
 * 主题匹配的渐变：亮色整体偏浅（深色文字可读），暗色整体偏深（浅色文字可读）。
 *
 * 绘制方式：全部按归一化坐标解析式求值——软边用指数衰减，圆角方块边界单独做
 * 1px 抗锯齿，因此不需要超采样；同一份逻辑可直接输出 1024 / 512 / 256 缩略图。
 */
const AURORA_ICON_MASTER = 1024
const ICON_CORNER_RATIO = 0.25 // 40px 列表容器圆角 10px（0.25）与 52px 详情 12px（0.23）
const AURORA_COVER_WIDTH = 1440
const AURORA_COVER_ASPECT = 4 / 3 // 高 / 宽 → 1440×1920

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value)
const smoothstep = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
const mixRgb = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
/** 颜色停靠点采样：stops = [[t, [r,g,b]], ...]，t 已归一到 0..1 */
const rampRgb = (stops, t) => {
  let index = 0
  while (index < stops.length - 2 && t > stops[index + 1][0]) {
    index += 1
  }
  const [t0, c0] = stops[index]
  const [t1, c1] = stops[index + 1] ?? stops[index]
  return mixRgb(c0, c1, t1 === t0 ? 0 : clamp01((t - t0) / (t1 - t0)))
}
/** alpha-over：把 color 通道按 amount 覆盖到 dst（0..255）上 */
const over = (dst, color, amount) => dst + (color - dst) * clamp01(amount)

/**
 * 包图标极光带：中心线是 x 的函数（两端由 y0 / y1 + 正弦弯曲决定），
 * 横截面是「亮边 / 中层 / 外晕」三层指数衰减。dark / light 各一套配色与强度。
 */
const AURORA_ICON_BANDS = [
  {
    // 主带：左下 → 右上，青蓝渐到紫
    x0: 0.13,
    x1: 0.87,
    y0: 0.8,
    y1: 0.2,
    half: 0.072, // 半宽（归一化）；40px 下全宽约 6px
    bend: -0.05,
    freq: 1.2,
    phase: 0.9,
    fade: 0.1,
    knots: [2, 0.8, 0.25], // 沿带 2 个亮度起伏，模拟极光褶皱
    dark: {
      strengths: [0.58, 0.3, 0.13], // 亮边 / 中层 / 外晕
      stops: [
        [0, [110, 208, 255]],
        [0.45, [150, 220, 255]],
        [0.78, [178, 172, 255]],
        [1, [188, 150, 255]],
      ],
    },
    light: {
      strengths: [0.95, 0.6, 0.22],
      stops: [
        [0, [18, 148, 202]],
        [0.45, [40, 112, 214]],
        [0.78, [114, 82, 212]],
        [1, [142, 74, 208]],
      ],
    },
  },
  {
    // 副带：左上方，紫 → 青，较弱，与主带分开避免像双线
    x0: 0.09,
    x1: 0.53,
    y0: 0.47,
    y1: 0.17,
    half: 0.036, // 40px 下全宽约 3px
    bend: -0.02,
    freq: 1.6,
    phase: 2.6,
    fade: 0.16,
    knots: [1.4, 2.2, 0.2],
    dark: {
      strengths: [0.3, 0.16, 0.07],
      stops: [
        [0, [172, 148, 255]],
        [0.55, [150, 170, 255]],
        [1, [120, 214, 255]],
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
    // 短尾带：右下角，青绿 → 青，最弱
    x0: 0.56,
    x1: 0.905,
    y0: 0.86,
    y1: 0.63,
    half: 0.034,
    bend: -0.03,
    freq: 1.5,
    phase: 3.4,
    fade: 0.16,
    knots: [1.8, 1.1, 0.2],
    dark: {
      strengths: [0.32, 0.17, 0.07],
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

/**
 * 详情页封面极光带：half 以「画面宽度」为单位（像素比），再按 4:3 换算到 v。
 * x 范围刻意越过 0 / 1，让带子铺到画面左右边缘、不留断层。
 */
const AURORA_COVER_BANDS = [
  {
    x0: -0.1,
    x1: 1.1,
    y0: 0.62,
    y1: 0.36,
    half: 0.052,
    bend: -0.07,
    freq: 1.15,
    phase: 0.8,
    fade: 0.06,
    knots: [2.2, 0.6, 0.22],
    dark: {
      strengths: [0.5, 0.3, 0.16],
      stops: [
        [0, [80, 190, 255]],
        [0.5, [130, 205, 255]],
        [1, [176, 150, 255]],
      ],
    },
    light: {
      strengths: [0.66, 0.5, 0.2],
      stops: [
        [0, [30, 150, 205]],
        [0.5, [70, 128, 222]],
        [1, [128, 92, 218]],
      ],
    },
  },
  {
    x0: -0.1,
    x1: 1.1,
    y0: 0.75,
    y1: 0.53,
    half: 0.038,
    bend: -0.05,
    freq: 1.4,
    phase: 2.3,
    fade: 0.08,
    knots: [1.8, 1.4, 0.2],
    dark: {
      strengths: [0.3, 0.2, 0.1],
      stops: [
        [0, [160, 140, 255]],
        [0.6, [120, 190, 255]],
        [1, [90, 220, 205]],
      ],
    },
    light: {
      strengths: [0.44, 0.32, 0.14],
      stops: [
        [0, [136, 98, 214]],
        [0.6, [86, 128, 218]],
        [1, [24, 150, 192]],
      ],
    },
  },
  {
    x0: 0.2,
    x1: 1.08,
    y0: 0.93,
    y1: 0.8,
    half: 0.032,
    bend: -0.03,
    freq: 1.6,
    phase: 3.2,
    fade: 0.12,
    knots: [1.5, 0.9, 0.2],
    dark: {
      strengths: [0.2, 0.14, 0.07],
      stops: [
        [0, [90, 235, 215]],
        [1, [90, 190, 255]],
      ],
    },
    light: {
      strengths: [0.3, 0.22, 0.09],
      stops: [
        [0, [12, 168, 148]],
        [1, [24, 146, 202]],
      ],
    },
  },
]

/** 封面底色（竖向渐变）与氛围光：亮色整体偏浅，暗色整体偏深 */
const AURORA_COVER_BACKGROUND = {
  dark: [
    [0, [4, 6, 15]],
    [0.22, [7, 13, 32]],
    [0.45, [10, 22, 52]],
    [0.62, [8, 16, 38]],
    [0.8, [5, 9, 22]],
    [1, [3, 5, 12]],
  ],
  light: [
    [0, [247, 251, 255]],
    [0.3, [233, 243, 255]],
    [0.5, [224, 234, 252]],
    [0.68, [232, 233, 252]],
    [0.85, [244, 244, 255]],
    [1, [250, 250, 255]],
  ],
}
/** 氛围光：cx / cy / 半径（以画面宽度为单位）/ 颜色 / 强度 */
const AURORA_COVER_GLOWS = {
  dark: [
    [0.32, 0.34, 0.55, [62, 168, 255], 0.1],
    [0.74, 0.46, 0.5, [150, 96, 255], 0.08],
    [0.15, 0.62, 0.45, [90, 220, 200], 0.05],
  ],
  light: [
    [0.3, 0.32, 0.55, [120, 200, 255], 0.5],
    [0.74, 0.48, 0.5, [190, 160, 255], 0.42],
    [0.15, 0.62, 0.45, [150, 230, 220], 0.3],
  ],
}

/**
 * 每列预先算好极光带的中心线 / 半宽 / 两端淡出 / 颜色，像素循环里只做 3 次 exp。
 * halfScale 把「以宽度为单位」的半宽换算到当前坐标方向（图标为 1，封面为 1/aspect）。
 */
const ribbonColumns = (bandDefs, size, theme, halfScale = 1) => {
  const bands = bandDefs.map((band) => {
    const preset = band[theme]
    const center = new Float64Array(size)
    const half = new Float64Array(size)
    const strength = new Float64Array(size)
    const color = new Float64Array(size * 3)
    for (let px = 0; px < size; px += 1) {
      const u = (px + 0.5) / size
      const t = (u - band.x0) / (band.x1 - band.x0)
      if (t < 0 || t > 1) {
        continue
      }
      // 两端乘 sin(πt)，保证中心线从 y0 / y1 出发且中段鼓出弧度
      const arch = Math.sin(Math.PI * t)
      center[px] = band.y0 + (band.y1 - band.y0) * t + band.bend * Math.sin(Math.PI * band.freq * t + band.phase) * arch
      half[px] = band.half * halfScale * (0.86 + 0.14 * arch)
      const [knots, knotPhase, knotDepth] = band.knots
      strength[px] =
        smoothstep(0, band.fade, t) *
        smoothstep(1, 1 - band.fade, t) *
        (1 + knotDepth * Math.sin(Math.PI * 2 * knots * t + knotPhase) * arch)
      const rgb = rampRgb(preset.stops, t)
      color[px * 3] = rgb[0]
      color[px * 3 + 1] = rgb[1]
      color[px * 3 + 2] = rgb[2]
    }
    return { center, half, strength, color, strengths: preset.strengths }
  })
  return bands
}

/**
 * 渲染极光包图标，返回 RGBA 像素（size × size）。
 * theme 取 'dark'（深底冷光）或 'light'（浅底中高亮度）。
 */
const auroraIconRgba = (size, theme = 'dark') => {
  const light = theme === 'light'
  const rgba = Buffer.alloc(size * size * 4)
  const bands = ribbonColumns(AURORA_ICON_BANDS, size, theme)
  // 星点：位置（归一化）、核心半径、光晕半径、强度
  const stars = [
    [0.185, 0.235, 0.011, 0.05, 0.9],
    [0.815, 0.795, 0.013, 0.055, 0.95],
    [0.675, 0.475, 0.0065, 0.035, 0.55],
  ]
  for (let py = 0; py < size; py += 1) {
    const v = (py + 0.5) / size
    for (let px = 0; px < size; px += 1) {
      const u = (px + 0.5) / size
      // 1) 圆角方块：SDF 在规范化坐标里算，再换算成像素做 1px 抗锯齿
      const qx = Math.abs(u - 0.5) - (0.5 - ICON_CORNER_RATIO)
      const qy = Math.abs(v - 0.5) - (0.5 - ICON_CORNER_RATIO)
      const dist =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - ICON_CORNER_RATIO
      const coverage = clamp01(0.5 - dist * size)
      if (coverage <= 0) {
        continue
      }

      // 2) 背景：暗色是深色竖向渐变 + 加色氛围光；亮色是浅蓝紫竖向渐变 + 混色氛围光
      const depth = clamp01(-dist) // 距边缘的深度（归一化）
      let r
      let g
      let b
      if (light) {
        r = 222 - 10 * v
        g = 233 - 12 * v
        b = 252 - 4 * v
        const glowMix = (cx, cy, radius, color, energy) => {
          const falloff = clamp01(1 - Math.hypot(u - cx, v - cy) / radius)
          const amount = falloff * falloff * falloff * energy
          r = over(r, color[0], amount)
          g = over(g, color[1], amount)
          b = over(b, color[2], amount)
        }
        glowMix(0.4, 0.32, 0.6, [150, 215, 255], 0.55)
        glowMix(0.78, 0.7, 0.5, [198, 172, 255], 0.5)
      } else {
        r = 5 + 5 * v
        g = 7 + 8 * v
        b = 16 + 20 * v
        const glowAdd = (cx, cy, radius, color, energy) => {
          const falloff = clamp01(1 - Math.hypot(u - cx, v - cy) / radius)
          const amount = falloff * falloff * falloff * energy
          r += color[0] * amount
          g += color[1] * amount
          b += color[2] * amount
        }
        glowAdd(0.4, 0.32, 0.6, [62, 168, 255], 0.055)
        glowAdd(0.78, 0.7, 0.5, [150, 96, 255], 0.05)
      }

      // 3) 极光带：暗色用加色（交叉处自然变亮）；亮色用 alpha-over（深色带 + 浅色光晕）
      for (const band of bands) {
        const strength = band.strength[px]
        if (strength <= 0) {
          continue
        }
        const dy = (v - band.center[px]) / band.half[px]
        if (dy > 5 || dy < -6) {
          continue // 外晕已可忽略
        }
        const cr = band.color[px * 3]
        const cg = band.color[px * 3 + 1]
        const cb = band.color[px * 3 + 2]
        const edge = Math.exp(-(((dy - 0.46) / 0.5) ** 2)) * band.strengths[0] * strength
        const mid = Math.exp(-((dy / 1.1) ** 2)) * band.strengths[1] * strength
        const halo = Math.exp(-((dy / 2.6) ** 2)) * band.strengths[2] * strength
        if (light) {
          const haloRgb = mixRgb([cr, cg, cb], [255, 255, 255], 0.72)
          const midRgb = mixRgb([cr, cg, cb], [255, 255, 255], 0.38)
          r = over(r, haloRgb[0], halo * 0.85)
          g = over(g, haloRgb[1], halo * 0.85)
          b = over(b, haloRgb[2], halo * 0.85)
          r = over(r, midRgb[0], mid * 0.9)
          g = over(g, midRgb[1], mid * 0.9)
          b = over(b, midRgb[2], mid * 0.9)
          r = over(r, cr, edge * 0.92)
          g = over(g, cg, edge * 0.92)
          b = over(b, cb, edge * 0.92)
        } else {
          // 亮边略偏白、中层为本色、外晕向天空一侧铺开
          r += (cr * 0.7 + 76) * edge + cr * mid + cr * halo
          g += (cg * 0.7 + 82) * edge + cg * mid + cg * halo
          b += (cb * 0.7 + 88) * edge + cb * mid + cb * halo
        }
      }

      // 4) 星点：很小的高光核 + 柔和光晕，40px 下是一两个像素
      for (const [sx, sy, coreRadius, haloRadius, energy] of stars) {
        const distance = Math.hypot(u - sx, v - sy)
        const core = Math.exp(-((distance / coreRadius) ** 2)) * energy
        const halo = Math.exp(-((distance / haloRadius) ** 2)) * energy * 0.22
        if (light) {
          r = over(r, 96, core * 0.5)
          g = over(g, 118, core * 0.5)
          b = over(b, 190, core * 0.5)
        } else {
          r += (120 + 0.53 * 255) * core * 0.35 + 150 * halo
          g += (140 + 0.45 * 255) * core * 0.35 + 170 * halo
          b += (160 + 0.37 * 255) * core * 0.35 + 200 * halo
        }
      }

      // 5) 内缘高光 / 描边：暗色用亮边，亮色用深边，让方块在两种主题下都有清晰边界
      const rim = (1 - clamp01(depth / (light ? 0.014 : 0.012))) * (light ? 0.38 : 0.22)
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

      // 6) 暗色加轻微暗角（中心更亮）；亮色只做很轻的边缘压暗
      if (light) {
        const vignette = 1 - 0.06 * smoothstep(0.35, 0.85, Math.hypot(u - 0.5, v - 0.5))
        r *= vignette
        g *= vignette
        b *= vignette
      } else {
        const vignette = 1 - 0.24 * smoothstep(0.3, 0.78, Math.hypot(u - 0.5, v - 0.5))
        r *= vignette
        g *= vignette
        b *= vignette
      }

      const offset = (py * size + px) * 4
      rgba[offset] = Math.round(Math.min(255, r))
      rgba[offset + 1] = Math.round(Math.min(255, g))
      rgba[offset + 2] = Math.round(Math.min(255, b))
      rgba[offset + 3] = Math.round(coverage * 255)
    }
  }
  return rgba
}

/** 封面星点：数量、位置与亮度由主题决定（暗色更亮，亮色是很淡的深蓝小点） */
const coverStars = (theme) => {
  const random = rng(theme === 'dark' ? 31 : 47)
  const count = theme === 'dark' ? 96 : 64
  const stars = []
  for (let index = 0; index < count; index += 1) {
    const u = random()
    const v = random() * 0.72
    const core = 0.0011 + random() * 0.0022 // 以画面宽度为单位（1440 下约 1.6–4.8px）
    stars.push({
      u,
      v,
      core,
      halo: core * 4,
      energy: 0.35 + random() * 0.65,
    })
  }
  return stars
}

/**
 * 渲染详情页封面，返回 RGBA 像素（width × width×4/3）。整张不透明，代码侧
 * 用 background-size: cover 铺满详情页内容区，不会露底。
 */
const auroraCoverRgba = (width, theme = 'dark') => {
  const light = theme === 'light'
  const height = Math.round(width * AURORA_COVER_ASPECT)
  const rgba = Buffer.alloc(width * height * 4)
  const bands = ribbonColumns(AURORA_COVER_BANDS, width, theme, 1 / AURORA_COVER_ASPECT)
  const stars = coverStars(theme)
  const background = AURORA_COVER_BACKGROUND[theme]
  const glows = AURORA_COVER_GLOWS[theme]
  for (let py = 0; py < height; py += 1) {
    const v = (py + 0.5) / height
    for (let px = 0; px < width; px += 1) {
      const u = (px + 0.5) / width
      const base = rampRgb(background, v)
      let r = base[0]
      let g = base[1]
      let b = base[2]

      // 1) 氛围光：按 4:3 校正成各向同性的距离
      for (const [cx, cy, radius, color, energy] of glows) {
        const dx = u - cx
        const dy = (v - cy) * AURORA_COVER_ASPECT
        const falloff = clamp01(1 - Math.hypot(dx, dy) / radius)
        const amount = falloff * falloff * falloff * energy
        if (light) {
          r = over(r, color[0], amount)
          g = over(g, color[1], amount)
          b = over(b, color[2], amount)
        } else {
          r += color[0] * amount
          g += color[1] * amount
          b += color[2] * amount
        }
      }

      // 2) 极光带
      for (const band of bands) {
        const strength = band.strength[px]
        if (strength <= 0) {
          continue
        }
        const dy = (v - band.center[px]) / band.half[px]
        if (dy > 5 || dy < -6) {
          continue
        }
        const cr = band.color[px * 3]
        const cg = band.color[px * 3 + 1]
        const cb = band.color[px * 3 + 2]
        const edge = Math.exp(-(((dy - 0.46) / 0.5) ** 2)) * band.strengths[0] * strength
        const mid = Math.exp(-((dy / 1.1) ** 2)) * band.strengths[1] * strength
        const halo = Math.exp(-((dy / 2.6) ** 2)) * band.strengths[2] * strength
        if (light) {
          const haloRgb = mixRgb([cr, cg, cb], [255, 255, 255], 0.72)
          const midRgb = mixRgb([cr, cg, cb], [255, 255, 255], 0.38)
          r = over(r, haloRgb[0], halo * 0.85)
          g = over(g, haloRgb[1], halo * 0.85)
          b = over(b, haloRgb[2], halo * 0.85)
          r = over(r, midRgb[0], mid * 0.9)
          g = over(g, midRgb[1], mid * 0.9)
          b = over(b, midRgb[2], mid * 0.9)
          r = over(r, cr, edge * 0.92)
          g = over(g, cg, edge * 0.92)
          b = over(b, cb, edge * 0.92)
        } else {
          r += (cr * 0.7 + 76) * edge + cr * mid + cr * halo
          g += (cg * 0.7 + 82) * edge + cg * mid + cg * halo
          b += (cb * 0.7 + 88) * edge + cb * mid + cb * halo
        }
      }

      // 3) 星点
      for (const star of stars) {
        const dx = u - star.u
        const dy = (v - star.v) * AURORA_COVER_ASPECT
        const distance = Math.hypot(dx, dy)
        const core = Math.exp(-((distance / star.core) ** 2)) * star.energy
        const halo = Math.exp(-((distance / star.halo) ** 2)) * star.energy * 0.2
        if (light) {
          r = over(r, 96, core * 0.42)
          g = over(g, 120, core * 0.42)
          b = over(b, 196, core * 0.42)
        } else {
          r += 255 * core * 0.6 + 150 * halo
          g += 255 * core * 0.62 + 175 * halo
          b += 255 * core * 0.68 + 210 * halo
        }
      }

      // 4) 顶部 / 底部渐变：让详情页顶栏与正文区域叠上去后仍然可读
      const bottom = smoothstep(0.58, 1, v)
      const top = 1 - smoothstep(0, 0.22, v)
      if (light) {
        r = over(r, 248, bottom * 0.62)
        g = over(g, 250, bottom * 0.62)
        b = over(b, 255, bottom * 0.62)
        r = over(r, 250, top * 0.5)
        g = over(g, 252, top * 0.5)
        b = over(b, 255, top * 0.5)
      } else {
        r = over(r, 3, bottom * 0.55)
        g = over(g, 5, bottom * 0.55)
        b = over(b, 14, bottom * 0.55)
        r = over(r, 4, top * 0.42)
        g = over(g, 6, top * 0.42)
        b = over(b, 15, top * 0.42)
      }

      const offset = (py * width + px) * 4
      rgba[offset] = Math.round(Math.min(255, r))
      rgba[offset + 1] = Math.round(Math.min(255, g))
      rgba[offset + 2] = Math.round(Math.min(255, b))
      rgba[offset + 3] = 255
    }
  }
  return rgba
}

/** 极光包图标 PNG：亮 / 暗各一张，默认 1024；512 / 256 缩略图供预览与文档用 */
const auroraIconPng = (size = AURORA_ICON_MASTER, theme = 'dark') =>
  encodePng(size, size, auroraIconRgba(size, theme), 'up')

/** 详情页封面 PNG：亮 / 暗各一张，默认 1440×1920 */
const auroraCoverPng = (theme = 'dark', width = AURORA_COVER_WIDTH) => {
  const height = Math.round(width * AURORA_COVER_ASPECT)
  return encodePng(width, height, auroraCoverRgba(width, theme), 'up')
}

// 示例包直接使用仓库根目录的 LICENSE 模板（MIT），不再自定义版权声明
const licenseText = readFileSync(join(here, '..', '..', 'LICENSE'), 'utf8')

/* ------------------------------ zip 写入 ------------------------------ */

const writeZip = (target, files) => {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, 'utf8')
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    const compressed = deflateRawSync(data, { level: 9 })
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(data), 0)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(0, 10) // time + date：固定值，保证产物可复现
    local.writeUInt32LE(crc.readUInt32BE(0), 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, nameBytes, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(0, 12)
    central.writeUInt32LE(crc.readUInt32BE(0), 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBytes)

    offset += local.length + nameBytes.length + compressed.length
  }
  const centralOffset = offset
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(centralOffset, 16)
  const zip = Buffer.concat([...localParts, ...centralParts, end])
  writeFileSync(target, zip)
  return zip.length
}

/* ------------------------------ aurora 示例包 ------------------------------ */

const manifest = {
  schema: 1,
  id: 'aurora',
  name: '极光',
  description: '冷色调示例包：抽象极光背景与几何图标，带视觉特效、裁切缩放与卡片偏转示例。',
  author: 'Aurora Chat contributors',
  version: '1.2.2',
  sidebarTitle: 'Aurora Chat',
  // 包图标 / 详情页封面按主题提供；旧的 `{ "file": "…" }` 形式仍是主题无关的兜底
  icon: {
    light: { file: 'assets/light/icon.png' },
    dark: { file: 'assets/dark/icon.png' },
  },
  cover: {
    light: { file: 'assets/light/cover.png' },
    dark: { file: 'assets/dark/cover.png' },
  },
  license: { file: 'LICENSE' },
  color_palette: {
    light: {
      background: '#f3f8ff',
      surface: '#ffffff',
      surface_alt: '#e8f1fb',
      text: '#0d1b33',
      text_secondary: '#46587a',
      text_tertiary: '#7488a8',
      border: 'rgba(13,27,51,0.12)',
      accent: '#2f7fd1',
      accent_text: '#ffffff',
      bubble: '#e4efff',
      code: '#eef4fb',
      danger: '#d64545',
      mask: 'rgba(8,16,32,0.36)',
    },
    dark: {
      background: '#070b1c',
      surface: '#0e1630',
      surface_alt: '#131f42',
      text: '#e6eeff',
      text_secondary: '#a6b8d8',
      text_tertiary: '#7386a8',
      border: 'rgba(180,205,255,0.16)',
      accent: '#7fd4ff',
      accent_text: '#06101f',
      bubble: '#16234a',
      code: '#101b38',
      danger: '#ff7a7a',
      mask: 'rgba(2,6,18,0.62)',
    },
  },
  assets: {
    'dslike_chat.style_pkg.background.main.light': {
      file: 'assets/light/main.png',
      fit: 'cover',
      align: 'center',
    },
    'dslike_chat.style_pkg.background.chat.light': {
      file: 'assets/light/chat.png',
      fit: 'cover',
      align: 'center',
      alpha: 0.55,
    },
    'dslike_chat.style_pkg.background.sidebar.light': {
      file: 'assets/light/sidebar.png',
      fit: 'cover',
      align: 'center',
      exposure: -0.05,
    },
    'dslike_chat.style_pkg.background.main.dark': {
      file: 'assets/dark/main.png',
      fit: 'cover',
      align: 'center',
    },
    'dslike_chat.style_pkg.background.chat.dark': {
      file: 'assets/dark/chat.png',
      fit: 'cover',
      align: 'center',
      alpha: 0.6,
    },
    'dslike_chat.style_pkg.background.sidebar.dark': {
      file: 'assets/dark/sidebar.png',
      fit: 'cover',
      align: 'center',
    },
    'dslike_chat.style_pkg.icon.send.light': {
      file: 'assets/icons/light/send.png',
      render: 'auto',
      effects: {
        shadow: { x: 0, y: 3, blur: 10, color: '#0b102066' },
        outerGlow: { radius: 10, color: '#7fd4ff', intensity: 0.8 },
        stroke: { width: 3, color: '#0b1020' },
        window: { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 },
        zoom: 1.25,
        tilt: { maxAngle: 12, perspective: 700, scale: 1.02 },
      },
    },
    'dslike_chat.style_pkg.icon.new_session.light': {
      file: 'assets/icons/light/new_session.png',
      effects: {
        window: { x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.8 },
        zoom: 1.2,
      },
    },
    'dslike_chat.style_pkg.icon.new_session.dark': {
      file: 'assets/icons/dark/new_session.png',
      effects: {
        window: { x1: 0.2, y1: 0.2, x2: 0.8, y2: 0.8 },
        zoom: 1.2,
      },
    },
    'dslike_chat.style_pkg.icon.send.dark': {
      file: 'assets/icons/dark/send.png',
      effects: {
        shadow: { x: 0, y: 3, blur: 10, color: '#00000088' },
        outerGlow: { radius: 10, color: '#7fd4ff', intensity: 0.9 },
        stroke: { width: 3, color: '#e6eeff' },
        window: { x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9 },
        zoom: 1.25,
        tilt: { maxAngle: 12, perspective: 700, scale: 1.02 },
      },
    },
    'dslike_chat.style_pkg.icon.menu.light': {
      file: 'assets/icons/light/menu.png',
      effects: {
        shadow: { x: 0, y: 6, blur: 14, color: '#00000066' },
        window: { x1: 0.25, y1: 0.3, x2: 0.75, y2: 0.7 },
        zoom: 1.5,
      },
    },
    'dslike_chat.style_pkg.icon.menu.dark': {
      file: 'assets/icons/dark/menu.png',
      effects: {
        shadow: { x: 0, y: 6, blur: 14, color: '#00000088' },
        window: { x1: 0.25, y1: 0.3, x2: 0.75, y2: 0.7 },
        zoom: 1.5,
      },
    },
    'dslike_chat.style_pkg.icon.copy.light': {
      file: 'assets/icons/light/copy.png',
      effects: {
        innerGlow: { radius: 6, color: '#ffffff88', intensity: 0.6 },
        emboss: { depth: 2, angle: 45, intensity: 0.6 },
      },
    },
    'dslike_chat.style_pkg.icon.copy.dark': {
      file: 'assets/icons/dark/copy.png',
      effects: {
        innerGlow: { radius: 6, color: '#ffffff55', intensity: 0.5 },
        emboss: { depth: 2, angle: 45, intensity: 0.5 },
      },
    },
  },
}

const auroraFiles = {
  'index.json': JSON.stringify(manifest, null, 2),
  'LICENSE': licenseText,
  'assets/light/icon.png': auroraIconPng(1024, 'light'),
  'assets/dark/icon.png': auroraIconPng(1024, 'dark'),
  'assets/light/cover.png': auroraCoverPng('light'),
  'assets/dark/cover.png': auroraCoverPng('dark'),
  'assets/light/main.png': backgroundPng('light'),
  'assets/light/chat.png': backgroundPng('light'),
  'assets/light/sidebar.png': backgroundPng('light'),
  'assets/dark/main.png': backgroundPng('dark'),
  'assets/dark/chat.png': backgroundPng('dark'),
  'assets/dark/sidebar.png': backgroundPng('dark'),
  'assets/icons/light/send.png': iconPng('send', 'light'),
  'assets/icons/light/new_session.png': iconPng('plus', 'light'),
  'assets/icons/light/menu.png': iconPng('menu', 'light'),
  'assets/icons/light/copy.png': iconPng('copy', 'light'),
  'assets/icons/dark/send.png': iconPng('send', 'dark'),
  'assets/icons/dark/new_session.png': iconPng('plus', 'dark'),
  'assets/icons/dark/menu.png': iconPng('menu', 'dark'),
  'assets/icons/dark/copy.png': iconPng('copy', 'dark'),
}

/* ------------------------------ 验证用异常包 ------------------------------ */

const makePack = (id, name, mutate) => {
  const pack = JSON.parse(JSON.stringify(manifest))
  pack.id = id
  pack.name = name
  pack.version = '1.0.0'
  delete pack.cover
  delete pack.color_palette
  // 异常包仍用主题无关的旧 `{ file }` 形式（主题化 icon / cover 由 aurora 示例包演示）
  pack.icon = { file: 'icon.png' }
  pack.assets = {
    'dslike_chat.style_pkg.background.main.light': { file: 'assets/light/main.png' },
    'dslike_chat.style_pkg.icon.send.light': { file: 'assets/icons/light/send.png' },
    'dslike_chat.style_pkg.icon.menu.light': { file: 'assets/icons/light/menu.png' },
  }
  mutate(pack)
  return pack
}

const bgEffects = makePack('bg-effects', '背景特效验证', (pack) => {
  // window/zoom 生效；shadow / tilt 属于背景不支持的效果，导入时 warn 忽略
  pack.assets['dslike_chat.style_pkg.background.main.light'].effects = {
    window: { x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.75 },
    zoom: 1.2,
    shadow: { x: 0, y: 4, blur: 12, color: '#00000066' },
    tilt: { maxAngle: 12, perspective: 700, scale: 1.02 },
  }
})

const badColor = makePack('bad-color', '非法颜色', (pack) => {
  pack.assets['dslike_chat.style_pkg.icon.send.light'].effects = {
    stroke: { width: 2, color: 'hotpink' },
  }
})

const badWindow = makePack('bad-window', '非法裁切窗口', (pack) => {
  pack.assets['dslike_chat.style_pkg.background.main.light'].effects = {
    window: { x1: 0.8, y1: 0.1, x2: 0.2, y2: 0.9 },
  }
})

const badPkgTilt = makePack('bad-pkg-tilt', '包图标偏转', (pack) => {
  pack.icon = {
    file: 'icon.png',
    effects: { tilt: { maxAngle: 10, perspective: 700, scale: 1.02 } },
  }
})

const simpleFiles = (pack) => ({
  'index.json': JSON.stringify(pack, null, 2),
  'LICENSE': licenseText,
  'icon.png': iconPng('ring', 'light'),
  'assets/light/main.png': backgroundPng('light'),
  'assets/icons/light/send.png': iconPng('send', 'light'),
  'assets/icons/light/menu.png': iconPng('menu', 'light'),
})

/* ------------------------------ 执行 ------------------------------ */

const writeOutputs = () => {
  mkdirSync(here, { recursive: true })
  const outputs = [
    ['aurora.zip', auroraFiles],
    ['bg-effects.zip', simpleFiles(bgEffects)],
    ['bad-color.zip', simpleFiles(badColor)],
    ['bad-window.zip', simpleFiles(badWindow)],
    ['bad-pkg-tilt.zip', simpleFiles(badPkgTilt)],
  ]
  for (const [name, files] of outputs) {
    const target = join(here, name)
    const size = writeZip(target, files)
    console.log(`${name}: ${size} bytes, ${Object.keys(files).length} files`)
  }
}

// 只有直接 `node tools/style-fixture/gen.mjs` 时才写产物；被预览脚本 import 时只取绘制函数
const isMain =
  Boolean(process.argv[1]) && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()
if (isMain) {
  writeOutputs()
}

export {
  auroraIconPng,
  auroraIconRgba,
  auroraCoverPng,
  auroraCoverRgba,
  encodePng,
  AURORA_ICON_MASTER,
  AURORA_COVER_WIDTH,
}
