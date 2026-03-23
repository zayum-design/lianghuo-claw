import { useEffect } from 'react'

import { useQuery } from '@tanstack/react-query'

import { apiClient } from '@/lib/apiClient'
import { API_PATHS } from '@/lib/apiPaths'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { useEditorStore } from '@/stores/editorStore'

import type { Timeline } from '@/types/timeline'

interface GetTimelineResponse {
  timeline_data: Timeline
  version: number
}

/**
 * 时间线加载 Hook
 * 加载默认时间线数据并存入 store
 */
export function useTimeline() {
  const editorStore = useEditorStore()

  const query = useQuery({
    queryKey: QUERY_KEYS.timelines.detail('default'),
    queryFn: async () => {
      const response = await apiClient.get<GetTimelineResponse>(API_PATHS.timelines.default)
      return response.data
    },
    onSuccess: (data) => {
      // 将时间线数据存入 store
      editorStore.setTimeline(data.timeline_data, data.version)
    },
  })

  // 当 store 中已有时间线数据时，避免重复加载
  useEffect(() => {
    if (editorStore.timeline && !query.data) {
      query.refetch()
    }
  }, [editorStore.timeline, query])

  return {
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
