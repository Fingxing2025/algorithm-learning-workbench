import type { DesktopApi } from '@core/contracts/desktop-api'

declare global {
  interface Window {
    desktop: DesktopApi
  }
}

export {}
