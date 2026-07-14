export const IPC_CHANNELS = {
  app: {
    getRuntimeInfo: 'app:get-runtime-info',
  },
  problems: {
    addImages: 'problems:add-images',
    create: 'problems:create',
    list: 'problems:list',
    readImage: 'problems:read-image',
    removeImage: 'problems:remove-image',
    removeRelation: 'problems:remove-relation',
    update: 'problems:update',
    upsertRelation: 'problems:upsert-relation',
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
