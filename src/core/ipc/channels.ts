export const IPC_CHANNELS = {
  app: {
    getRuntimeInfo: 'app:get-runtime-info',
  },
  templates: {
    create: 'templates:create',
    performAction: 'templates:perform-action',
    readSource: 'templates:read-source',
  },
  workspace: {
    choose: 'workspace:choose',
    getCurrent: 'workspace:get-current',
    rescan: 'workspace:rescan',
  },
} as const
