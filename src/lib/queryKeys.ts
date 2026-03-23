export const QUERY_KEYS = {
  assets: {
    all: ['assets'] as const,
    lists: () => [...QUERY_KEYS.assets.all, 'list'] as const,
    list: (params?: any) => [...QUERY_KEYS.assets.all, 'list', params] as const,
    detail: (id: string) => [...QUERY_KEYS.assets.all, id] as const,
    streamUrl: (id: string) => [...QUERY_KEYS.assets.all, 'stream-url', id] as const,
  },
  projects: {
    all: ['projects'] as const,
    lists: () => [...QUERY_KEYS.projects.all, 'list'] as const,
    detail: (id: string) => [...QUERY_KEYS.projects.all, id] as const,
  },
  timelines: {
    all: ['timelines'] as const,
    detail: (id: string) => [...QUERY_KEYS.timelines.all, id] as const,
  },
  exports: {
    all: ['exports'] as const,
    detail: (id: string) => [...QUERY_KEYS.exports.all, id] as const,
  },
} as const