import type { RuntimeInfo } from './runtime'

export interface DesktopApi {
  app: {
    getRuntimeInfo: () => Promise<RuntimeInfo>
  }
}
