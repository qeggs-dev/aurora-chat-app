const { app, BrowserWindow, Menu, protocol, net, session, shell } = require('electron')
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
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
