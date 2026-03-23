export const API_PATHS = {
  // 素材相关
  assets: {
    list: '/v1/assets',
    detail: (id: string) => `/v1/assets/${id}`,
    presign: '/v1/assets/presign',
    confirm: (id: string) => `/v1/assets/${id}/confirm`,
    streamUrl: (id: string) => `/v1/assets/${id}/stream-url`,
  },
  // 项目相关（Task-14）
  projects: {
    list: '/v1/projects',
    detail: (id: string) => `/v1/projects/${id}`,
  },
  // 时间线相关（Task-07）
  timelines: {
    detail: (id: string) => `/v1/timelines/${id}`,
    update: (id: string) => `/v1/timelines/${id}`,
  },
  // 导出相关（Task-08）
  exports: {
    create: '/v1/exports',
    detail: (id: string) => `/v1/exports/${id}`,
  },
} as const