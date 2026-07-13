import { join } from 'node:path'

import { app, BrowserWindow, nativeTheme } from 'electron'

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111318' : '#f7f7f5',
    height: 900,
    minHeight: 680,
    minWidth: 1024,
    show: false,
    title: '智能算法学习助手 V2',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 18, y: 19 } : undefined,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      devTools: !app.isPackaged && !process.env.CI,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      spellcheck: true,
      webSecurity: true,
      webviewTag: false,
    },
    width: 1440,
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
