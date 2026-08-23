import { app, session } from 'electron'

const DEVELOPMENT_CONNECT_SOURCES = 'ws://localhost:* http://localhost:*'

function getContentSecurityPolicy(): string {
  const connectSources = app.isPackaged ? "'self'" : `'self' ${DEVELOPMENT_CONNECT_SOURCES}`

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSources}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-src 'none'",
  ].join('; ')
}

export function installApplicationSecurityGuards(): void {
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [getContentSecurityPolicy()],
      },
    })
  })

  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))

    contents.on('will-attach-webview', event => {
      event.preventDefault()
    })

    contents.on('will-navigate', (event, navigationUrl) => {
      if (navigationUrl !== contents.getURL()) {
        event.preventDefault()
      }
    })
  })
}
