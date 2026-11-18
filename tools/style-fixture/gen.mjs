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

/* ================================================================
 * 样式包图标：40 个语义槽位 × 亮/暗两套（assets/icons/<theme>/<name>.png）
 * ----------------------------------------------------------------
 * 统一规范（完整版见 tools/style-fixture/README.md）：
 * 1) 画布：96×96 逻辑像素；导出 192×192（2x）透明底 PNG，高分屏下按 24/16px 显示
 *    仍有余量。主体可见包围盒约 68–78%，四周留 10–14 逻辑像素。
 * 2) 笔画：统一 7/96 线宽（≈1.75px@24、1.17px@16），圆头端点、圆角转折；
 *    不出现 <5/96 的细线，也不缩细节到 24px 看不清（宁可简化造型）。
 * 3) 配色：亮色主笔画 #16233f，深色 #e9f3ff。点缀色为青蓝→紫极光渐变
 *    （暗色 #6ed0ff→#c096ff；亮色用加深版 #0f8ed6→#7a4fd8 保证浅底 ≥3:1 对比度），
 *    每枚图标最多用在一处关键细节（渐变方向统一为「左下青蓝 → 右上紫」）。
 * 4) 造型：线性描边为主 + 少量语义化实心填充（stop / menu / thinking / 月亮 / 侧栏左栏）；
 *    同类元素（箭头、面板、圆角矩形、声音）共用同一线宽与转角半径（面板类 12–16）。
 * 5) 绘制：全部解析式 SDF/距离场光栅化（距离 → 1px 覆盖率抗锯齿），
 *    固定几何、无随机数、无绘图库；同一逻辑坐标可直接放大到 192。
 * ================================================================ */
const ICON_EXPORT = 192
const ICON_SCALE = ICON_EXPORT / 96
const ICON_STROKE = 7
const ICON_INK = { light: [22, 35, 63], dark: [233, 243, 255] }
const ICON_ACCENT_STOPS = {
  light: [
    [0, [15, 142, 214]],
    [1, [122, 79, 216]],
  ],
  dark: [
    [0, [110, 208, 255]],
    [1, [192, 150, 255]],
  ],
}

/** 40 个语义槽位（顺序即总览图顺序）；文件名 = 资源 ID 去掉 `icon.` 前缀与主题后缀 */
const ICON_SLOTS = [
  'new_session',
  'enter_sidebar',
  'exit_sidebar',
  'thinking',
  'network',
  'sound_input',
  'link_file',
  'edit',
  'menu',
  'delete',
  'copy',
  'regen',
  'send',
  'stop',
  'left_arrow',
  'right_arrow',
  'setting.setting',
  'setting.light',
  'setting.dark',
  'setting.device',
  'setting.datas',
  'setting.about',
  // 第二轮扩充（P0，18 个）：替换界面里原先直接写死的内置 SVG
  'close',
  'remove',
  'check',
  'refresh',
  'search',
  'warning',
  'link',
  'chevron_down',
  'play',
  'upload',
  'download',
  'add',
  'back',
  'mobile_menu',
  'browse',
  'setting.usage',
  'setting.style',
  'setting.preset',
]

/** 点到线段的距离（像素坐标） */
const iconSegmentDistance = (x, y, ax, ay, bx, by) => {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : clamp01(((x - ax) * dx + (y - ay) * dy) / lengthSq)
  const px = x - (ax + dx * t)
  const py = y - (ay + dy * t)
  return Math.sqrt(px * px + py * py)
}

/** 旋转圆角矩形的有符号距离（传入像素坐标与像素尺寸） */
const iconRoundRectSdf = (x, y, cx, cy, width, height, radius, angleDeg) => {
  const angle = (angleDeg * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = x - cx
  const dy = y - cy
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  const qx = Math.abs(localX) - (width / 2 - radius)
  const qy = Math.abs(localY) - (height / 2 - radius)
  const outsideX = Math.max(qx, 0)
  const outsideY = Math.max(qy, 0)
  return Math.sqrt(outsideX * outsideX + outsideY * outsideY) + Math.min(Math.max(qx, qy), 0) - radius
}

/**
 * 图标绘制器：内部维护一张覆盖率缓冲，几何全部用 96 逻辑坐标书写，
 * 覆盖率达到即按颜色（实色或渐变函数）合成到 RGBA 画布。
 */
const iconPainter = (variant) => {
  const canvas = createCanvas(ICON_EXPORT, ICON_EXPORT)
  const coverage = new Float32Array(ICON_EXPORT * ICON_EXPORT)
  const ink = ICON_INK[variant]
  const accent = (x, y) => {
    // 统一渐变方向：左下（青蓝）→ 右上（紫）
    const t = (x + (ICON_EXPORT - 1 - y)) / (2 * (ICON_EXPORT - 1))
    const [r, g, b] = rampRgb(ICON_ACCENT_STOPS[variant], t)
    return [Math.round(r), Math.round(g), Math.round(b)]
  }
  const addCoverage = (x, y, amount) => {
    const index = y * ICON_EXPORT + x
    if (amount > coverage[index]) {
      coverage[index] = amount
    }
  }
  /** 把当前覆盖率按颜色合成到画布，然后清空缓冲 */
  const flush = (color) => {
    for (let y = 0; y < ICON_EXPORT; y += 1) {
      for (let x = 0; x < ICON_EXPORT; x += 1) {
        const amount = coverage[y * ICON_EXPORT + x]
        if (amount <= 0.002) {
          continue
        }
        const rgb = typeof color === 'function' ? color(x, y) : color
        setPixel(canvas, x, y, [rgb[0], rgb[1], rgb[2], Math.round(clamp01(amount) * 255)])
      }
    }
    coverage.fill(0)
  }

  /** 折线 / 多边形描边：到线段集合的最小距离决定覆盖率（等价圆头端点 + 圆角转折） */
  const stroke = (points, color = ink, width = ICON_STROKE) => {
    const half = (width * ICON_SCALE) / 2
    const pts = points.map(([x, y]) => [x * ICON_SCALE, y * ICON_SCALE])
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of pts) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
    const x0 = Math.max(0, Math.floor(minX - half - 1))
    const x1 = Math.min(ICON_EXPORT - 1, Math.ceil(maxX + half + 1))
    const y0 = Math.max(0, Math.floor(minY - half - 1))
    const y1 = Math.min(ICON_EXPORT - 1, Math.ceil(maxY + half + 1))
    for (let y = y0; y <= y1; y += 1) {
      const py = y + 0.5
      for (let x = x0; x <= x1; x += 1) {
        const px = x + 0.5
        let best = Infinity
        for (let i = 0; i < pts.length - 1; i += 1) {
          const d = iconSegmentDistance(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])
          if (d < best) {
            best = d
          }
        }
        if (best <= half + 0.5) {
          addCoverage(x, y, clamp01(half + 0.5 - best))
        }
      }
    }
    flush(color)
  }

  /** 实心圆 */
  const fillCircle = (cx, cy, radius, color = ink) => {
    const centerX = cx * ICON_SCALE
    const centerY = cy * ICON_SCALE
    const r = radius * ICON_SCALE
    const x0 = Math.max(0, Math.floor(centerX - r - 1))
    const x1 = Math.min(ICON_EXPORT - 1, Math.ceil(centerX + r + 1))
    const y0 = Math.max(0, Math.floor(centerY - r - 1))
    const y1 = Math.min(ICON_EXPORT - 1, Math.ceil(centerY + r + 1))
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dx = x + 0.5 - centerX
        const dy = y + 0.5 - centerY
        const d = Math.sqrt(dx * dx + dy * dy)
        const amount = clamp01(r + 0.5 - d)
        if (amount > 0) {
          addCoverage(x, y, amount)
        }
      }
    }
    flush(color)
  }

  /** 实心圆角矩形（可旋转，角度为度） */
  const fillRoundRect = (x, y, width, height, radius, color = ink, angleDeg = 0) => {
    const centerX = (x + width / 2) * ICON_SCALE
    const centerY = (y + height / 2) * ICON_SCALE
    const reach = (Math.hypot(width, height) / 2) * ICON_SCALE + 2
    const x0 = Math.max(0, Math.floor(centerX - reach))
    const x1 = Math.min(ICON_EXPORT - 1, Math.ceil(centerX + reach))
    const y0 = Math.max(0, Math.floor(centerY - reach))
    const y1 = Math.min(ICON_EXPORT - 1, Math.ceil(centerY + reach))
    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        const sdf = iconRoundRectSdf(
          px + 0.5,
          py + 0.5,
          centerX,
          centerY,
          width * ICON_SCALE,
          height * ICON_SCALE,
          radius * ICON_SCALE,
          angleDeg,
        )
        const amount = clamp01(0.5 - sdf)
        if (amount > 0) {
          addCoverage(px, py, amount)
        }
      }
    }
    flush(color)
  }

  /** 圆角矩形描边（可旋转）：到边界的有符号距离落在半线宽内即覆盖 */
  const strokeRoundRect = (x, y, width, height, radius, color = ink, angleDeg = 0, lineWidth = ICON_STROKE) => {
    const half = (lineWidth * ICON_SCALE) / 2
    const centerX = (x + width / 2) * ICON_SCALE
    const centerY = (y + height / 2) * ICON_SCALE
    const reach = (Math.hypot(width, height) / 2) * ICON_SCALE + half + 2
    const x0 = Math.max(0, Math.floor(centerX - reach))
    const x1 = Math.min(ICON_EXPORT - 1, Math.ceil(centerX + reach))
    const y0 = Math.max(0, Math.floor(centerY - reach))
    const y1 = Math.min(ICON_EXPORT - 1, Math.ceil(centerY + reach))
    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        const sdf = iconRoundRectSdf(
          px + 0.5,
          py + 0.5,
          centerX,
          centerY,
          width * ICON_SCALE,
          height * ICON_SCALE,
          radius * ICON_SCALE,
          angleDeg,
        )
        const amount = clamp01(half + 0.5 - Math.abs(sdf))
        if (amount > 0) {
          addCoverage(px, py, amount)
        }
      }
    }
    flush(color)
  }

  /**
   * 圆弧描边（度，0=右、90=下）。圆用解析距离（每个像素一次 sqrt），椭圆用密集折线近似；
   * 分段一律圆头端点，所以缺口两端自然收圆。
   */
  const strokeArc = (cx, cy, rx, ry, startDeg, endDeg, color = ink, lineWidth = ICON_STROKE) => {
    const centerX = cx * ICON_SCALE
    const centerY = cy * ICON_SCALE
    const radiusX = rx * ICON_SCALE
    const radiusY = ry * ICON_SCALE
    const half = (lineWidth * ICON_SCALE) / 2
    const sweep = endDeg - startDeg
    const full = Math.abs(sweep) >= 359.999
    const reach = Math.max(radiusX, radiusY) + half + 2
    const x0 = Math.max(0, Math.floor(centerX - reach))
    const x1 = Math.min(ICON_EXPORT - 1, Math.ceil(centerX + reach))
    const y0 = Math.max(0, Math.floor(centerY - reach))
    const y1 = Math.min(ICON_EXPORT - 1, Math.ceil(centerY + reach))
    const startRad = (startDeg * Math.PI) / 180
    const endRad = (endDeg * Math.PI) / 180
    const startPoint = [centerX + radiusX * Math.cos(startRad), centerY + radiusY * Math.sin(startRad)]
    const endPoint = [centerX + radiusX * Math.cos(endRad), centerY + radiusY * Math.sin(endRad)]
    const round = Math.abs(radiusX - radiusY) < 0.001
    if (round) {
      for (let y = y0; y <= y1; y += 1) {
        const dy = y + 0.5 - centerY
        for (let x = x0; x <= x1; x += 1) {
          const dx = x + 0.5 - centerX
          const distance = Math.sqrt(dx * dx + dy * dy)
          let edge = Math.abs(distance - radiusX)
          if (!full) {
            let offset = (Math.atan2(dy, dx) * 180) / Math.PI
            offset = (((offset - startDeg) % 360) + 360) % 360
            if (sweep >= 0 ? offset > sweep : 360 - offset > -sweep) {
              // 落在缺口里：取到两个端点的最近距离（圆头端点）
              const toStart = Math.sqrt((x + 0.5 - startPoint[0]) ** 2 + (y + 0.5 - startPoint[1]) ** 2)
              const toEnd = Math.sqrt((x + 0.5 - endPoint[0]) ** 2 + (y + 0.5 - endPoint[1]) ** 2)
              edge = Math.min(toStart, toEnd)
            }
          }
          const amount = clamp01(half + 0.5 - edge)
          if (amount > 0) {
            addCoverage(x, y, amount)
          }
        }
      }
      flush(color)
      return
    }
    // 椭圆：按弧长取样（≈10° 一段）；单段弦高 < 0.3px，肉眼与解析距离一致
    const samples = Math.max(8, Math.ceil(Math.abs(sweep) / 10))
    const points = []
    for (let i = 0; i <= samples; i += 1) {
      const angle = ((startDeg + (sweep * i) / samples) * Math.PI) / 180
      points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)])
    }
    stroke(points, color, lineWidth)
  }

  /** 实心多边形（星芒等）：射线判定内外 + 到边距离做 1px 抗锯齿 */
  const fillPolygon = (points, color = ink) => {
    const pts = points.map(([x, y]) => [x * ICON_SCALE, y * ICON_SCALE])
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of pts) {
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
    const x0 = Math.max(0, Math.floor(minX - 1))
    const x1 = Math.min(ICON_EXPORT - 1, Math.ceil(maxX + 1))
    const y0 = Math.max(0, Math.floor(minY - 1))
    const y1 = Math.min(ICON_EXPORT - 1, Math.ceil(maxY + 1))
    for (let py = y0; py <= y1; py += 1) {
      const y = py + 0.5
      for (let px = x0; px <= x1; px += 1) {
        const x = px + 0.5
        let inside = false
        let best = Infinity
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
          const [xi, yi] = pts[i]
          const [xj, yj] = pts[j]
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
            inside = !inside
          }
          const d = iconSegmentDistance(x, y, xi, yi, xj, yj)
          if (d < best) {
            best = d
          }
        }
        const amount = inside ? clamp01(0.5 + best) : clamp01(0.5 - best)
        if (amount > 0) {
          addCoverage(px, py, amount)
        }
      }
    }
    flush(color)
  }

  /** 实心月牙：大圆挖去偏移圆（两者都带 1px 抗锯齿） */
  const fillCrescent = (cx, cy, radius, cutCx, cutCy, cutRadius, color = ink) => {
    const centerX = cx * ICON_SCALE
    const centerY = cy * ICON_SCALE
    const r = radius * ICON_SCALE
    const cux = cutCx * ICON_SCALE
    const cuy = cutCy * ICON_SCALE
    const cr = cutRadius * ICON_SCALE
    const x0 = Math.max(0, Math.floor(centerX - r - 1))
    const x1 = Math.min(ICON_EXPORT - 1, Math.ceil(centerX + r + 1))
    const y0 = Math.max(0, Math.floor(centerY - r - 1))
    const y1 = Math.min(ICON_EXPORT - 1, Math.ceil(centerY + r + 1))
    for (let py = y0; py <= y1; py += 1) {
      for (let px = x0; px <= x1; px += 1) {
        const dx = px + 0.5 - centerX
        const dy = py + 0.5 - centerY
        const ux = px + 0.5 - cux
        const uy = py + 0.5 - cuy
        const big = clamp01(r + 0.5 - Math.sqrt(dx * dx + dy * dy))
        const cut = clamp01(cr + 0.5 - Math.sqrt(ux * ux + uy * uy))
        const amount = big * clamp01(1 - cut)
        if (amount > 0) {
          addCoverage(px, py, amount)
        }
      }
    }
    flush(color)
  }

  return {
    ink,
    accent,
    stroke,
    fillCircle,
    fillRoundRect,
    strokeRoundRect,
    strokeArc,
    fillPolygon,
    fillCrescent,
    finish: () => canvas.data,
  }
}

/**
 * 40 个图标的造型（全部在 96×96 逻辑坐标里书写）。
 * 每枚最多一处极光渐变点缀，注释里标出点缀位置。
 */
const ICON_GLYPHS = {
  // 新建会话：加号；竖臂走极光渐变（点缀）
  new_session: (p) => {
    p.stroke([[48, 16], [48, 80]], p.accent)
    p.stroke([[16, 48], [80, 48]], p.ink)
  },
  // 展开侧栏：圆角面板 + 分隔线 + 指向面板内的箭头（点缀 = 箭头）；移动端汉堡另见 mobile_menu
  enter_sidebar: (p) => {
    p.strokeRoundRect(14, 22, 68, 52, 12, p.ink)
    p.stroke([[44, 22], [44, 74]], p.ink)
    p.stroke([[52, 48], [74, 48]], p.accent)
    p.stroke([[64, 38], [74, 48], [64, 58]], p.accent)
  },
  // 收起侧栏：圆角面板 + 左栏实心渐变（点缀）+ 分隔线
  exit_sidebar: (p) => {
    p.fillRoundRect(14, 22, 30, 52, 12, p.accent)
    p.strokeRoundRect(14, 22, 68, 52, 12, p.ink)
    p.stroke([[44, 22], [44, 74]], p.ink)
  },
  // 深度思考：实心四角星芒（圆角转折）+ 星点（点缀）
  thinking: (p) => {
    const points = []
    for (let i = 0; i < 8; i += 1) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 4
      const radius = i % 2 === 0 ? 33 : 11
      points.push([44 + radius * Math.cos(angle), 48 + radius * Math.sin(angle)])
    }
    p.fillPolygon(points, p.ink)
    p.stroke([...points, points[0]], p.ink, 6)
    p.fillCircle(74, 24, 6.5, p.accent)
  },
  // 联网搜索：地球（圆 + 赤道 + 经线）；经线点缀
  network: (p) => {
    p.strokeArc(48, 48, 32, 32, -90, 270, p.ink)
    p.stroke([[16, 48], [80, 48]], p.ink)
    p.strokeArc(48, 48, 15, 30, -90, 270, p.accent)
  },
  // 语音输入：麦克风（胶囊 + 半圆支架 + 立杆/底座）；支架点缀
  sound_input: (p) => {
    p.strokeRoundRect(38, 16, 20, 40, 10, p.ink)
    p.strokeArc(48, 44, 24, 24, 0, 180, p.accent)
    p.stroke([[48, 68], [48, 80]], p.ink)
    p.stroke([[36, 80], [60, 80]], p.ink)
  },
  // 链接文件：斜置回形针（一段连续折线：外侧长丝 + 两个 U 型弯 + 内侧短丝）；最内侧短丝点缀
  link_file: (p) => {
    // 经典回形针路径（24 单位坐标）等比放大到 96 画布：4 条平行丝间距约 20，
    // 即使缩到 16px 也有 ~1.5px 的空隙，不会糊成一块。
    const scale = 3.39
    const offsetX = 48 - 12.6 * scale
    const offsetY = 48 - 11.4 * scale
    const map = (x, y) => [x * scale + offsetX, y * scale + offsetY]
    const arc = (centerX, centerY, radius, startDeg, endDeg, samples = 18) => {
      const points = []
      for (let i = 0; i <= samples; i += 1) {
        const angle = ((startDeg + ((endDeg - startDeg) * i) / samples) * Math.PI) / 180
        points.push(map(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)))
      }
      return points
    }
    const points = [
      map(21.44, 11.05),
      map(12.25, 20.24),
      ...arc(8, 16, 6, 45, 225),
      map(12.95, 2.56),
      ...arc(15.78, 5.39, 4, 225, 405),
      map(9.41, 17.41),
      ...arc(8, 16, 2, 45, 225),
      map(15.07, 6.1),
    ]
    p.stroke(points, p.ink)
    p.stroke(points.slice(-2), p.accent)
  },
  // 编辑：斜置铅笔（笔身圆角矩形 + 笔尖实心三角（点缀）+ 笔帽线）
  edit: (p) => {
    const angle = -45
    const u = [Math.cos((angle * Math.PI) / 180), Math.sin((angle * Math.PI) / 180)]
    const v = [-u[1], u[0]]
    const center = [47, 47]
    const halfLength = 30
    const halfThickness = 13.5
    const topEnd = [center[0] + u[0] * halfLength, center[1] + u[1] * halfLength]
    const bottomEnd = [center[0] - u[0] * halfLength, center[1] - u[1] * halfLength]
    p.strokeRoundRect(center[0] - halfLength, center[1] - halfThickness, halfLength * 2, halfThickness * 2, 6, p.ink, angle)
    p.stroke(
      [
        [topEnd[0] + v[0] * halfThickness, topEnd[1] + v[1] * halfThickness],
        [topEnd[0] - v[0] * halfThickness, topEnd[1] - v[1] * halfThickness],
      ],
      p.ink,
    )
    const tip = [bottomEnd[0] - u[0] * 16, bottomEnd[1] - u[1] * 16]
    p.fillPolygon(
      [
        [bottomEnd[0] + v[0] * halfThickness, bottomEnd[1] + v[1] * halfThickness],
        [bottomEnd[0] - v[0] * halfThickness, bottomEnd[1] - v[1] * halfThickness],
        tip,
      ],
      p.accent,
    )
  },
  // 更多操作：三个实心圆点；中点点缀
  menu: (p) => {
    p.fillCircle(22, 48, 7.5, p.ink)
    p.fillCircle(48, 48, 7.5, p.accent)
    p.fillCircle(74, 48, 7.5, p.ink)
  },
  // 删除：垃圾桶（提手 + 桶盖（点缀）+ 桶身）
  delete: (p) => {
    p.stroke([[38, 24], [38, 18], [58, 18], [58, 24]], p.ink)
    p.stroke([[18, 30], [78, 30]], p.accent)
    p.strokeRoundRect(26, 42, 44, 38, 10, p.ink)
  },
  // 复制：后纸只画可见的 L 形边（点缀），前纸完整圆角描边
  copy: (p) => {
    p.stroke([[66, 20], [20, 20], [20, 66]], p.accent)
    p.strokeRoundRect(36, 34, 46, 46, 10, p.ink)
  },
  // 重新生成：顺时针开口圆弧 + 实心箭头（点缀，位于弧线末端、沿切线指向缺口）
  regen: (p) => {
    const centerX = 48
    const centerY = 50
    const radius = 28
    p.strokeArc(centerX, centerY, radius, radius, 20, 320, p.ink)
    const endAngle = (320 * Math.PI) / 180
    const tip = [centerX + radius * Math.cos(endAngle), centerY + radius * Math.sin(endAngle)]
    const tangent = [-Math.sin(endAngle), Math.cos(endAngle)]
    const normal = [-tangent[1], tangent[0]]
    p.fillPolygon(
      [
        tip,
        [tip[0] - tangent[0] * 15 + normal[0] * 9, tip[1] - tangent[1] * 15 + normal[1] * 9],
        [tip[0] - tangent[0] * 15 - normal[0] * 9, tip[1] - tangent[1] * 15 - normal[1] * 9],
      ],
      p.accent,
    )
  },
  // 发送：上箭头；箭杆走极光渐变（点缀），箭头保持主笔画色
  send: (p) => {
    p.stroke([[48, 80], [48, 32]], p.accent)
    p.stroke([[16, 54], [48, 22], [80, 54]], p.ink)
  },
  // 停止：实心圆角方块
  stop: (p) => {
    p.fillRoundRect(14, 14, 68, 68, 16, p.ink)
  },
  // 上一个版本：左 chevron
  left_arrow: (p) => {
    p.stroke([[72, 16], [26, 48], [72, 80]], p.ink)
  },
  // 下一个版本：右 chevron
  right_arrow: (p) => {
    p.stroke([[24, 16], [70, 48], [24, 80]], p.ink)
  },
  // 设置（通用）：三行滑杆；中间滑块点缀
  'setting.setting': (p) => {
    for (const y of [28, 48, 68]) {
      p.stroke([[16, y], [80, y]], p.ink)
    }
    p.fillCircle(60, 28, 8, p.ink)
    p.fillCircle(34, 48, 8, p.accent)
    p.fillCircle(62, 68, 8, p.ink)
  },
  // 浅色主题：太阳（圆心描边 + 8 条光芒（点缀））
  'setting.light': (p) => {
    p.strokeArc(48, 48, 15, 15, -90, 270, p.ink)
    for (let i = 0; i < 8; i += 1) {
      const angle = (i * Math.PI) / 4
      p.stroke(
        [
          [48 + 24 * Math.cos(angle), 48 + 24 * Math.sin(angle)],
          [48 + 32 * Math.cos(angle), 48 + 32 * Math.sin(angle)],
        ],
        p.accent,
      )
    }
  },
  // 深色主题：实心月牙 + 星点（点缀）
  'setting.dark': (p) => {
    p.fillCrescent(42, 46, 33, 58, 32, 28, p.ink)
    p.fillCircle(72, 24, 7, p.accent)
  },
  // 设备：显示器 + 底座；底座横杆点缀
  'setting.device': (p) => {
    p.strokeRoundRect(14, 18, 68, 44, 10, p.ink)
    p.stroke([[48, 62], [48, 74]], p.ink)
    p.stroke([[32, 78], [64, 78]], p.accent)
  },
  // 数据：数据库（顶盖（点缀）+ 两侧壁 + 中/底层弧）
  'setting.datas': (p) => {
    p.strokeArc(48, 28, 30, 10, -90, 270, p.accent)
    p.stroke([[18, 28], [18, 66]], p.ink)
    p.stroke([[78, 28], [78, 66]], p.ink)
    p.strokeArc(48, 47, 30, 10, 0, 180, p.ink)
    p.strokeArc(48, 66, 30, 10, 0, 180, p.ink)
  },
  // 关于：信息圆 + 感叹号（圆点（点缀）+ 竖杆）
  'setting.about': (p) => {
    p.strokeArc(48, 48, 32, 32, -90, 270, p.ink)
    p.fillCircle(48, 29, 6.5, p.accent)
    p.stroke([[48, 42], [48, 68]], p.ink)
  },
  // 关闭（弹窗 / 搜索面板）：描边交叉，端点与转折全圆头
  close: (p) => {
    p.stroke([[18, 18], [78, 78]], p.ink)
    p.stroke([[78, 18], [18, 78]], p.ink)
  },
  // 移除（附件 / 文件卡片上的小 ×）：实心交叉，与描边版 close 在 24px 下也能一眼区分
  remove: (p) => {
    p.stroke([[20, 20], [76, 76]], p.ink, 12)
    p.stroke([[76, 20], [20, 76]], p.ink, 12)
  },
  // 完成 / 已复制：单笔对勾（粗圆头）
  check: (p) => {
    p.stroke([[18, 52], [39, 72], [80, 22]], p.ink)
  },
  // 刷新 / 重试：双向循环箭头（两段圆弧 + 两枚实心箭头），与单向的 regen 区分
  refresh: (p) => {
    const centerX = 48
    const centerY = 48
    const radius = 30
    const head = (angleDeg) => {
      const angle = (angleDeg * Math.PI) / 180
      const tip = [centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle)]
      const tangent = [-Math.sin(angle), Math.cos(angle)]
      const normal = [-tangent[1], tangent[0]]
      p.fillPolygon(
        [
          tip,
          [tip[0] - tangent[0] * 17 + normal[0] * 10, tip[1] - tangent[1] * 17 + normal[1] * 10],
          [tip[0] - tangent[0] * 17 - normal[0] * 10, tip[1] - tangent[1] * 17 - normal[1] * 10],
        ],
        p.ink,
      )
    }
    p.strokeArc(centerX, centerY, radius, radius, 200, 340, p.ink)
    p.strokeArc(centerX, centerY, radius, radius, 20, 160, p.ink)
    head(340)
    head(160)
  },
  // 搜索：放大镜（圆环 + 斜柄）；斜柄点缀
  search: (p) => {
    p.strokeArc(42, 42, 23, 23, -90, 270, p.ink)
    p.stroke([[58, 58], [81, 81]], p.accent)
  },
  // 警告：圆角三角形 + 感叹号（感叹号 = 点缀）
  warning: (p) => {
    p.stroke([[48, 16], [82, 76], [14, 76], [48, 16]], p.ink)
    p.stroke([[48, 34], [48, 54]], p.accent, 6)
    p.fillCircle(48, 66, 4.5, p.accent)
  },
  // 链接：两个互相扣住的圆环（链环）；右上环点缀
  link: (p) => {
    p.strokeArc(35, 59, 18, 18, -90, 270, p.ink)
    p.strokeArc(59, 37, 18, 18, -90, 270, p.accent)
  },
  // 展开下拉：单 chevron 向下
  chevron_down: (p) => {
    p.stroke([[18, 34], [48, 64], [78, 34]], p.ink)
  },
  // 播放：实心三角（媒体语义的少量填充），圆角转折
  play: (p) => {
    const points = [
      [28, 14],
      [84, 48],
      [28, 82],
    ]
    p.fillPolygon(points, p.ink)
    p.stroke([...points, points[0]], p.ink)
  },
  // 上传：向上箭头 + 托盘；箭杆点缀
  upload: (p) => {
    p.stroke([[48, 66], [48, 24]], p.accent)
    p.stroke([[32, 40], [48, 24], [64, 40]], p.ink)
    p.stroke([[16, 58], [16, 76], [80, 76], [80, 58]], p.ink)
  },
  // 下载：向下箭头 + 托盘；箭杆点缀
  download: (p) => {
    p.stroke([[48, 20], [48, 56]], p.accent)
    p.stroke([[32, 40], [48, 56], [64, 40]], p.ink)
    p.stroke([[16, 62], [16, 80], [80, 80], [80, 62]], p.ink)
  },
  // 新增：圆环 + 加号（与 new_session 的纯加号区分）
  add: (p) => {
    p.strokeArc(48, 48, 32, 32, -90, 270, p.ink)
    p.stroke([[32, 48], [64, 48]], p.ink)
    p.stroke([[48, 32], [48, 64]], p.ink)
  },
  // 返回：完整的左箭头（箭杆 + 箭头）；箭杆点缀（与 left_arrow 的单 chevron 区分）
  back: (p) => {
    p.stroke([[80, 48], [24, 48]], p.accent)
    p.stroke([[44, 24], [20, 48], [44, 72]], p.ink)
  },
  // 移动端菜单：三条等长横杠；中间一条点缀
  mobile_menu: (p) => {
    p.stroke([[16, 28], [80, 28]], p.ink)
    p.stroke([[16, 48], [80, 48]], p.accent)
    p.stroke([[16, 68], [80, 68]], p.ink)
  },
  // 浏览：圆角文档框 + 两条内容线；第二条内容线点缀
  browse: (p) => {
    p.strokeRoundRect(16, 14, 64, 68, 12, p.ink)
    p.stroke([[30, 38], [66, 38]], p.ink)
    p.stroke([[30, 54], [56, 54]], p.accent)
  },
  // 用量统计：基线 + 三根实心柱；中间柱点缀
  'setting.usage': (p) => {
    p.stroke([[14, 80], [82, 80]], p.ink)
    p.fillRoundRect(16, 56, 16, 24, 8, p.ink)
    p.fillRoundRect(40, 40, 16, 40, 8, p.accent)
    p.fillRoundRect(62, 20, 16, 60, 8, p.ink)
  },
  // 样式（调色板）：圆环 + 四枚色点；左上色点点缀
  'setting.style': (p) => {
    p.strokeArc(48, 48, 32, 32, -90, 270, p.ink)
    p.fillCircle(34, 38, 6, p.accent)
    p.fillCircle(48, 30, 6, p.ink)
    p.fillCircle(62, 38, 6, p.ink)
    p.fillCircle(56, 58, 6, p.ink)
  },
  // 预设：列表行（圆点 + 线）×3；中间一行线点缀（圆点放大到 7，16px 下仍看得见）
  'setting.preset': (p) => {
    p.fillCircle(24, 28, 7, p.ink)
    p.stroke([[40, 28], [80, 28]], p.ink)
    p.fillCircle(24, 48, 7, p.ink)
    p.stroke([[40, 48], [66, 48]], p.accent)
    p.fillCircle(24, 68, 7, p.ink)
    p.stroke([[40, 68], [76, 68]], p.ink)
  },
}

/** 渲染单枚图标，返回 192×192 RGBA 像素 */
const auroraGlyphRgba = (name, variant = 'dark') => {
  const draw = ICON_GLYPHS[name]
  if (!draw) {
    throw new Error(`unknown icon glyph: ${name}`)
  }
  const painter = iconPainter(variant)
  draw(painter)
  return painter.finish()
}

/** 单枚图标 PNG（192×192，透明底） */
const auroraGlyphPng = (name, variant = 'dark') =>
  encodePng(ICON_EXPORT, ICON_EXPORT, auroraGlyphRgba(name, variant))

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
  description: '冷色调示例包：抽象极光背景 + 40 枚统一笔触的双主题线性图标（极光渐变点缀）。',
  author: 'Aurora Chat contributors',
  // 1.2.3：40 个图标槽位 × 亮/暗两套按统一规范重绘，内置包启动时按版本号自动更新
  version: '1.2.3',
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
  },
}

// 40 个图标槽位 × 亮/暗两套：资源 ID 不变（icon.<slot>.<theme>），文件走 assets/icons/<theme>/<slot>.png
for (const slot of ICON_SLOTS) {
  for (const theme of ['light', 'dark']) {
    manifest.assets[`dslike_chat.style_pkg.icon.${slot}.${theme}`] = {
      file: `assets/icons/${theme}/${slot}.png`,
    }
  }
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
}

// 40 个图标 × 亮/暗：文件名与槽位一一对应，路径 assets/icons/<theme>/<slot>.png
for (const slot of ICON_SLOTS) {
  for (const theme of ['light', 'dark']) {
    auroraFiles[`assets/icons/${theme}/${slot}.png`] = auroraGlyphPng(slot, theme)
  }
}

/* ------------------------------ 验证用异常包 ------------------------------ */

const makePack = (id, name, mutate) => {
  const pack = JSON.parse(JSON.stringify(manifest))
  pack.id = id
  pack.name = name
  pack.version = '1.0.0'
  pack.description = '导入校验用异常样式包（用于验证配置错误码，不是示例包）'
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
  auroraGlyphPng,
  auroraGlyphRgba,
  encodePng,
  ICON_EXPORT,
  ICON_SLOTS,
  ICON_STROKE,
  ICON_INK,
  ICON_ACCENT_STOPS,
  AURORA_ICON_MASTER,
  AURORA_COVER_WIDTH,
}
