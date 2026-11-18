// 桌面壳 preload：只通过 contextBridge 暴露「检查更新 / 下载 / 安装 / 打开 Release 页面」的 IPC 包装。
//
// 安全约束：
// - contextIsolation + sandbox 下渲染进程只能走 IPC，没有 fs / 没有 nodeIntegration；
// - 渲染进程不传本地路径、不执行命令；下载目录、安装动作与是否退出都由主进程决定；
// - 进度由主进程 webContents.send('update:progress') 推回，这里转成回调。
const { contextBridge, ipcRenderer } = require('electron')

const progressListeners = new Set()

ipcRenderer.on('update:progress', (_event, progress) => {
  for (const listener of progressListeners) {
    try {
      listener(progress)
    } catch {
      // 渲染进程回调异常不影响后续进度
    }
  }
})

contextBridge.exposeInMainWorld('auroraUpdate', {
  platform: process.platform,
  fetchRelease: (url) => ipcRenderer.invoke('update:fetch', url),
  download: (request) => ipcRenderer.invoke('update:download', request),
  cancelDownload: () => ipcRenderer.invoke('update:cancel-download'),
  install: () => ipcRenderer.invoke('update:install'),
  openRelease: (url) => ipcRenderer.invoke('update:open-release', url),
  onDownloadProgress: (listener) => {
    progressListeners.add(listener)
    return () => {
      progressListeners.delete(listener)
    }
  },
})
