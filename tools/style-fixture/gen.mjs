// 生成 DSLike Chat 样式包示例 / 验证用 zip：
//   aurora.zip        合法示例包：抽象背景 + 几何图标 + 静态特效 + window/zoom + 图标/封面 tilt
//   bg-effects.zip    背景带 window/zoom（生效）与 shadow/tilt（导入忽略并 warn）
//   bad-color.zip     图标 effects.stroke.color 非法 → badConfig
//   bad-window.zip    背景 effects.window x1 >= x2 → badConfig
//   bad-pkg-tilt.zip  包图标 icon.png 带 tilt → badConfig
//
// 依赖只有 node 标准库（zlib），不引入绘图库：所有图片都自己画像素并编码成 PNG。
// 用法：node tools/style-fixture/gen.mjs（产物写在同目录）
import { deflateRawSync, deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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

/** RGBA 像素数组 → PNG Buffer */
const encodePng = (width, height, rgba) => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
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

const coverPng = () => {
  const canvas = gradientCanvas(960, 360, 20, [
    [0, [10, 18, 44]],
    [0.4, [26, 58, 118]],
    [0.62, [40, 140, 170]],
    [0.82, [120, 90, 200]],
    [1, [18, 22, 60]],
  ])
  const random = rng(23)
  // 光环
  for (const [cx, cy, radius, color] of [
    [250, 250, 120, [120, 235, 220]],
    [640, 120, 90, [150, 170, 255]],
    [780, 280, 150, [200, 130, 255]],
  ]) {
    for (let step = 0; step < 3; step += 1) {
      for (let angle = 0; angle < Math.PI * 2; angle += 0.004) {
        const wobble = 1 + Math.sin(angle * 5 + step) * 0.04
        const x = cx + Math.cos(angle) * radius * wobble
        const y = cy + Math.sin(angle) * radius * 0.42 * wobble
        blend(canvas, Math.round(x), Math.round(y), [...color, 70], 0.6)
      }
    }
  }
  // 星点
  for (let i = 0; i < 160; i += 1) {
    fillCircle(
      canvas,
      Math.floor(random() * canvas.width),
      Math.floor(random() * canvas.height),
      random() * 1.6 + 0.3,
      [235, 245, 255, 170]
    )
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

const licenseText = `Aurora style pack (sample)
Copyright (c) DSLike Chat contributors
Licensed under the MIT License. All artwork here is abstract geometric art
generated by scripts; it contains no official logos or trademarks.
`

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
  author: 'chat-demo-shell contributors',
  version: '1.2.0',
  sidebarTitle: 'Aurora Chat',
  icon: { file: 'icon.png' },
  cover: {
    file: 'cover.png',
    effects: {
      outerGlow: { radius: 16, color: '#7fd4ff', intensity: 0.7 },
      tilt: { maxAngle: 10, perspective: 900, scale: 1.01 },
    },
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
  'icon.png': iconPng('ring', 'light'),
  'cover.png': coverPng(),
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
