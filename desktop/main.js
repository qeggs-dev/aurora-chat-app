const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  net,
  screen,
  session,
  shell,
  ipcMain,
  dialog,
} = require('electron')
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
      // 只用 preload 暴露「检查更新」的 IPC 包装；渲染进程仍拿不到 fs / node
      preload: path.join(__dirname, 'preload.js'),
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

// ---------------------------------------------------------------------------
// 「设置 → 关于 → 检查更新」的下载 / 安装（IPC）
//
// 网络策略与渲染进程一致：只允许 https 的 GitHub 官方域名与代码内镜像白名单，且始终匿名
// （不带 Authorization / Cookie）。镜像只用于 GET 公开内容，不能作为任何写通道。
// 下载路径由主进程计算（temp/aurora-chat-updates），渲染进程只传资产 URL / 文件名 / 期望大小；
// 安装只对主进程刚下载的文件做 shell.openPath，不执行任意命令。
// ---------------------------------------------------------------------------

const UPDATE_MAX_BYTES = 300 * 1024 * 1024
const UPDATE_MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const UPDATE_REQUEST_TIMEOUT_MS = 8000
const UPDATE_PROGRESS_INTERVAL_MS = 120
const UPDATE_RELEASE_PAGE = 'https://github.com/qeggs-dev/aurora-chat-app/releases'
const UPDATE_CONTENT_HOSTS = new Set([
  'github.com',
  'api.github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
])
/** 匿名内容镜像：与 web/src/services/update/github.ts 的 GITHUB_MIRRORS 保持一致（只用于匿名 GET） */
const UPDATE_MIRRORS = [
  'https://gh-proxy.com',
  'https://gh-proxy.org',
  'https://github.xxlab.tech',
  'https://githubproxy.gohj99.site',
  'https://github.chenc.dev',
  'https://cors.isteed.cc',
  'https://fastgit.cc',
  'https://gh.noki.icu',
  'https://ghproxy.net',
  'https://ghfast.top',
]

/** 只接受 https + GitHub 官方内容域名，且 URL 里不允许夹带凭据 */
const isAllowedUpdateContentUrl = (value) => {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      return false
    }
    if (parsed.port && parsed.port !== '443') {
      return false
    }
    return UPDATE_CONTENT_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

/** 直连地址或「镜像前缀 + 官方地址」才放行 */
const isAllowedUpdateRequestUrl = (value) => {
  if (typeof value !== 'string') {
    return false
  }
  if (isAllowedUpdateContentUrl(value)) {
    return true
  }
  for (const mirror of UPDATE_MIRRORS) {
    const prefix = `${mirror}/`
    if (value.startsWith(prefix) && isAllowedUpdateContentUrl(value.slice(prefix.length))) {
      return true
    }
  }
  return false
}

const isSafeUpdateFileName = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,180}$/.test(value)

const updateDownloadDir = () => path.join(app.getPath('temp'), 'aurora-chat-updates')

const updateUserAgent = () => `Aurora-Chat/${app.getVersion()} (Electron update downloader)`

const headerValue = (headers, name) => {
  if (!headers) {
    return undefined
  }
  const value = headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

/** 所有更新请求都是匿名 GET：只设 Accept / User-Agent，禁止携带凭据 */
const createUpdateRequest = (url, accept) => {
  const request = net.request({ method: 'GET', url, redirect: 'follow', useSessionCookies: false })
  request.setHeader('Accept', accept)
  request.setHeader('User-Agent', updateUserAgent())
  return request
}

let cancelActiveDownload = null
let lastDownloadedFile = null

/** Release JSON 的一次 GET（直连 / 镜像由渲染进程按顺序传入） */
const fetchUpdateJson = (url) =>
  new Promise((resolve, reject) => {
    const request = createUpdateRequest(url, 'application/vnd.github+json')
    const chunks = []
    let size = 0
    let settled = false
    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      try {
        request.abort()
      } catch {
        // 请求可能已经结束
      }
      reject(new Error('update request timeout'))
    }, UPDATE_REQUEST_TIMEOUT_MS)
    const finish = (error, value) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (error) {
        reject(error)
      } else {
        resolve(value)
      }
    }
    request.on('response', (response) => {
      response.on('data', (chunk) => {
        size += chunk.length
        if (size > UPDATE_MAX_RESPONSE_BYTES) {
          finish(new Error('update response too large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () =>
        finish(null, {
          status: response.statusCode,
          text: Buffer.concat(chunks).toString('utf8'),
          contentType: String(headerValue(response.headers, 'content-type') || ''),
          rateLimitRemaining: headerValue(response.headers, 'x-ratelimit-remaining') ?? null,
          retryAfter: headerValue(response.headers, 'retry-after') ?? null,
        })
      )
      response.on('error', (error) => finish(error))
    })
    request.on('error', (error) => finish(error))
    request.end()
  })

/**
 * 下载单个候选地址到 destPath：边写边回报进度；大小与期望不符、镜像返回 HTML 都按失败处理，
 * 让上层换下一个候选。
 */
const downloadUpdateAsset = (url, destPath, expectedSize, reportProgress) =>
  new Promise((resolve, reject) => {
    const request = createUpdateRequest(url, 'application/octet-stream')
    const stream = fs.createWriteStream(destPath)
    let received = 0
    let total = expectedSize > 0 ? expectedSize : null
    let settled = false
    let lastReport = 0
    let firstByteTimer = null
    let stallTimer = null

    const clearTimers = () => {
      if (firstByteTimer) {
        clearTimeout(firstByteTimer)
        firstByteTimer = null
      }
      if (stallTimer) {
        clearTimeout(stallTimer)
        stallTimer = null
      }
    }

    const cleanupFile = () => {
      try {
        fs.rmSync(destPath, { force: true })
      } catch {
        // 文件可能还没创建或被占用，下次下载会覆盖
      }
    }

    const fail = (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimers()
      cancelActiveDownload = null
      try {
        request.abort()
      } catch {
        // 请求可能已经结束
      }
      stream.destroy()
      cleanupFile()
      reject(error)
    }

    const failWith = (code, message) => {
      const error = new Error(message)
      error.code = code
      fail(error)
    }

    // 直连 github.com 可能一直挂着：首字节 10s、后续 30s 无数据就放弃，换下一个候选（镜像）
    const touch = () => {
      if (firstByteTimer) {
        clearTimeout(firstByteTimer)
        firstByteTimer = null
      }
      if (stallTimer) {
        clearTimeout(stallTimer)
      }
      stallTimer = setTimeout(() => failWith('network', 'download stalled'), 30000)
    }
    firstByteTimer = setTimeout(() => failWith('network', 'connect timeout'), 10000)

    const report = (force) => {
      const now = Date.now()
      if (!force && now - lastReport < UPDATE_PROGRESS_INTERVAL_MS) {
        return
      }
      lastReport = now
      const percent = total ? Math.min(100, Math.round((received / total) * 100)) : null
      reportProgress({ received, total, percent })
    }

    cancelActiveDownload = () => failWith('cancelled', 'download cancelled')
    report(true)

    request.on('response', (response) => {
      if (settled) {
        return
      }
      touch()
      if (response.statusCode !== 200) {
        failWith('download-failed', `HTTP ${response.statusCode}`)
        return
      }
      const contentType = String(headerValue(response.headers, 'content-type') || '')
      if (/text\/html/i.test(contentType)) {
        failWith('download-failed', 'mirror returned html instead of the installer')
        return
      }
      const contentLength = Number(headerValue(response.headers, 'content-length'))
      if (Number.isFinite(contentLength) && contentLength > 0) {
        total = contentLength
      }
      if (total !== null && total > UPDATE_MAX_BYTES) {
        failWith('too-large', 'installer exceeds the download limit')
        return
      }
      response.on('data', (chunk) => {
        if (settled) {
          return
        }
        touch()
        received += chunk.length
        if (received > UPDATE_MAX_BYTES) {
          failWith('too-large', 'installer exceeds the download limit')
          return
        }
        stream.write(chunk)
        report(false)
      })
      response.on('end', () => {
        if (settled) {
          return
        }
        stream.end(() => {
          if (settled) {
            return
          }
          if (expectedSize > 0 && received !== expectedSize) {
            failWith('size-mismatch', `downloaded ${received} of ${expectedSize} bytes`)
            return
          }
          settled = true
          clearTimers()
          cancelActiveDownload = null
          reportProgress({ received, total, percent: 100 })
          resolve({ bytes: received })
        })
      })
      response.on('error', (error) => failWith('download-failed', error.message))
    })
    request.on('error', (error) => failWith('network', error.message))
    stream.on('error', (error) => failWith('download-failed', error.message))
    request.end()
  })

/** 依次尝试候选（直连 → 镜像），成功时记住文件供 update:install 使用 */
const downloadUpdate = async (event, payload) => {
  const candidates = Array.isArray(payload?.candidates)
    ? payload.candidates.filter((url) => isAllowedUpdateRequestUrl(url))
    : []
  const fileName =
    typeof payload?.fileName === 'string' && isSafeUpdateFileName(payload.fileName)
      ? payload.fileName
      : ''
  const expectedSize = Number(payload?.expectedSize)
  if (
    candidates.length === 0 ||
    !fileName ||
    !Number.isSafeInteger(expectedSize) ||
    expectedSize <= 0 ||
    expectedSize > UPDATE_MAX_BYTES
  ) {
    return { ok: false, code: 'download-failed', message: 'invalid download request' }
  }
  const dir = updateDownloadDir()
  fs.mkdirSync(dir, { recursive: true })
  const destPath = path.join(dir, fileName)
  lastDownloadedFile = null
  const sender = event.sender
  const report = (progress) => {
    if (!sender.isDestroyed()) {
      sender.send('update:progress', progress)
    }
  }
  let lastError = { code: 'download-failed', message: 'no candidate' }
  for (const url of candidates) {
    try {
      const result = await downloadUpdateAsset(url, destPath, expectedSize, report)
      lastDownloadedFile = { path: destPath, fileName }
      return { ok: true, path: destPath, bytes: result.bytes }
    } catch (error) {
      lastError = {
        code: typeof error?.code === 'string' ? error.code : 'download-failed',
        message: error?.message,
      }
      try {
        fs.rmSync(destPath, { force: true })
      } catch {
        // 清理失败不阻塞换候选
      }
      if (lastError.code === 'cancelled' || lastError.code === 'too-large') {
        return { ok: false, ...lastError }
      }
    }
  }
  return { ok: false, ...lastError }
}

const updateDialogLabels = () => {
  if (app.getLocale().toLowerCase().startsWith('zh')) {
    return {
      title: '安装更新',
      message: '安装程序已启动',
      detail: '安装完成后需要退出 Aurora Chat，新版本才会生效。现在退出吗？',
      quit: '立即退出',
      later: '稍后',
    }
  }
  return {
    title: 'Install update',
    message: 'The installer has been launched',
    detail: 'Aurora Chat must quit for the new version to take effect. Quit now?',
    quit: 'Quit now',
    later: 'Later',
  }
}

/** 安装刚下载的文件：Windows 启动 NSIS 并询问退出；Linux AppImage 落盘 + 可执行并打开文件管理器 */
const installUpdate = async () => {
  const file = lastDownloadedFile
  if (!file || !fs.existsSync(file.path)) {
    return { ok: false, code: 'download-failed', message: 'no downloaded installer' }
  }
  if (process.platform === 'win32') {
    const message = await shell.openPath(file.path)
    if (message) {
      return { ok: false, code: 'unsupported', message }
    }
    const labels = updateDialogLabels()
    const choice = await dialog.showMessageBox({
      type: 'info',
      buttons: [labels.quit, labels.later],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
      title: labels.title,
      message: labels.message,
      detail: labels.detail,
    })
    if (choice.response === 0) {
      setImmediate(() => app.quit())
    }
    return { ok: true, kind: 'installer-launched', path: file.path }
  }
  if (process.platform === 'linux') {
    if (!/\.AppImage$/i.test(file.path)) {
      await shell.openExternal(UPDATE_RELEASE_PAGE)
      return { ok: true, kind: 'release-page' }
    }
    const dest = path.join(app.getPath('downloads'), path.basename(file.path))
    fs.copyFileSync(file.path, dest)
    fs.chmodSync(dest, 0o755)
    shell.showItemInFolder(dest)
    return { ok: true, kind: 'appimage-ready', path: dest }
  }
  if (process.platform === 'darwin' && /\.dmg$/i.test(file.path)) {
    const message = await shell.openPath(file.path)
    if (!message) {
      return { ok: true, kind: 'installer-launched', path: file.path }
    }
  }
  await shell.openExternal(UPDATE_RELEASE_PAGE)
  return { ok: true, kind: 'release-page' }
}

const installUpdateIpc = () => {
  ipcMain.handle('update:fetch', async (_event, url) => {
    if (typeof url !== 'string' || !isAllowedUpdateRequestUrl(url)) {
      throw new Error('blocked update request url')
    }
    return fetchUpdateJson(url)
  })
  ipcMain.handle('update:download', async (event, payload) => downloadUpdate(event, payload))
  ipcMain.handle('update:cancel-download', () => {
    if (typeof cancelActiveDownload !== 'function') {
      return { cancelled: false }
    }
    const cancel = cancelActiveDownload
    cancelActiveDownload = null
    cancel()
    return { cancelled: true }
  })
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('update:open-release', async (_event, url) => {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      return { ok: false }
    }
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'github.com' ||
      !parsed.pathname.startsWith('/qeggs-dev/aurora-chat-app/releases')
    ) {
      return { ok: false }
    }
    await shell.openExternal(url)
    return { ok: true }
  })
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
    installUpdateIpc()
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
