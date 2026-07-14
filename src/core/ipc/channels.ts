export const IPC_CHANNELS = {
  aiProviders: {
    create: 'ai-providers:create',
    delete: 'ai-providers:delete',
    list: 'ai-providers:list',
    listRoutes: 'ai-providers:list-routes',
    testConnection: 'ai-providers:test-connection',
    update: 'ai-providers:update',
    upsertRoute: 'ai-providers:upsert-route',
  },
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
  problemAnalysis: {
    analyze: 'problem-analysis:analyze',
    chooseImages: 'problem-analysis:choose-images',
    commit: 'problem-analysis:commit',
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
