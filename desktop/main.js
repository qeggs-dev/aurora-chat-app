const { app, BrowserWindow, Menu, protocol, net, screen, session, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')

const SCHEME = 'app'
const DIST = path.join(__dirname, 'dist')
const INDEX = `${SCHEME}://bundle/index.html`

// 用标准安全协议加载本地 dist：既有正常 origin（localStorage/IndexedDB 可用），
// 又让 API 请求带上可被服务端回显的 Origin（已验证服务端回显任意 origin）。
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
])

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

function resolveInsideDist(requestUrl) {
  const { pathname } = new URL(requestUrl)
  const decoded = decodeURIComponent(pathname)
  const candidate = path.join(DIST, decoded)
  const normalized = path.normalize(candidate)
  if (normalized !== DIST && !normalized.startsWith(DIST + path.sep)) {
    return null
  }
  return normalized
}

function serveFromDist(requestUrl) {
  const filePath = resolveInsideDist(requestUrl)
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain' } })
  }
  const ext = path.extname(filePath).toLowerCase()
  return net.fetch(pathToFileURL(filePath).toString()).then((response) => {
    const headers = new Headers(response.headers)
    headers.set('content-type', MIME[ext] || 'application/octet-stream')
    return new Response(response.body, { status: response.status, headers })
  })
}

function isLocalUrl(url) {
  return url.startsWith(`${SCHEME}://`)
}

const DEFAULT_WINDOW_BOUNDS = { width: 1280, height: 860 }

/** 窗口状态文件放在 userData 下：记录上次关闭时的普通边界与最大化状态 */
const windowStatePath = () => path.join(app.getPath('userData'), 'window-state.json')

const loadWindowState = () => {
  try {
    const state = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'))
    const width = Number(state.width)
    const height = Number(state.height)
    const x = Number(state.x)
    const y = Number(state.y)
    if (![width, height, x, y].every(Number.isFinite)) {
      return null
    }
    if (width < 400 || height < 300) {
      return null
    }
    // 屏幕布局可能变了（拔掉外接屏 / 分辨率变化）：完全落在屏幕外就不用这组坐标
    const visible = screen.getAllDisplays().some((display) => {
      const area = display.workArea
      return (
        x < area.x + area.width &&
        x + width > area.x &&
        y < area.y + area.height &&
        y + height > area.y
      )
    })
    if (!visible) {
      return null
    }
    return { x, y, width, height, maximized: state.maximized === true }
  } catch {
    return null
  }
}

const writeWindowState = (win) => {
  try {
    const bounds = win.getNormalBounds()
    fs.writeFileSync(
      windowStatePath(),
      JSON.stringify({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized: win.isMaximized(),
      })
    )
  } catch {
    // 状态写不进去不影响使用
  }
}

/** resize/move/maximize 变化做个防抖保存，关闭时再兜底保存一次 */
const trackWindowState = (win) => {
  let timer = null
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(() => writeWindowState(win), 400)
  }
  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('maximize', schedule)
  win.on('unmaximize', schedule)
  win.on('close', () => {
    clearTimeout(timer)
    writeWindowState(win)
  })
}

function createWindow() {
  const saved = loadWindowState()
  const win = new BrowserWindow({
    ...(saved
      ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height }
      : DEFAULT_WINDOW_BOUNDS),
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    title: 'Aurora Chat',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  trackWindowState(win)
  if (saved?.maximized) {
    win.maximize()
  }
  win.once('ready-to-show', () => win.show())
  win.loadURL(INDEX)

  // 外部链接交给系统浏览器；壳内只允许本地页面
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isLocalUrl(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  return win
}

function installPermissions() {
  const allowed = new Set(['media', 'clipboard-sanitized-write', 'fullscreen'])
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    if (permission === 'media') {
      const types = details?.mediaTypes || []
      callback(types.includes('audio') || types.length === 0)
      return
    }
    callback(allowed.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => allowed.has(permission))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    protocol.handle(SCHEME, (request) => serveFromDist(request.url))
    installPermissions()
    Menu.setApplicationMenu(null)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
