import { useEffect, useMemo } from 'react'

import { useMutation } from '@tanstack/react-query'

import { message, Modal } from 'antd'

import { apiClient } from '@/lib/apiClient'
import { API_PATHS } from '@/lib/apiPaths'
import { useEditorStore } from '@/stores/editorStore'

import type { Timeline } from '@/types/timeline'

// 简单的防抖函数实现，包含 cancel 方法
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let timeoutId: NodeJS.Timeout | null = null

  const debounced = (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      func(...args)
    }, wait)
  }

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  return debounced
}

interface UpdateTimelineResponse {
  timeline_data: Timeline
  version: number
}

/**
 * 时间线自动保存 Hook
 * 监听时间线变化，防抖后自动保存到后端
 */
export function useTimelineSync() {
  const editorStore = useEditorStore()

  // 更新时间线的 Mutation
  const updateTimelineMutation = useMutation({
    mutationFn: async ({ timeline, clientVersion }: { timeline: Timeline; clientVersion: number }) => {
      const response = await apiClient.put<UpdateTimelineResponse>(API_PATHS.timelines.default, {
        timeline_data: timeline,
        client_version: clientVersion,
      })
      return response.data
    },
    onSuccess: (data) => {
      // 保存成功，更新版本号
      editorStore.setTimelineVersion(data.version)
      editorStore.setIsSaving(false)
    },
    onError: (error: any) => {
      editorStore.setIsSaving(false)

      if (error.response?.status === 409) {
        // 版本冲突
        Modal.warning({
          title: '版本冲突',
          content: '时间线已被其他会话修改，建议刷新页面以获取最新版本。',
          okText: '刷新页面',
          cancelText: '取消',
          onOk: () => {
            window.location.reload()
          },
        })
      } else {
        // 其他网络错误
        message.error('保存失败，请检查网络连接')
      }
    },
  })

  // 防抖保存函数
  const debouncedSave = useMemo(
    () =>
      debounce((timeline: Timeline, clientVersion: number) => {
        editorStore.setIsSaving(true)
        updateTimelineMutation.mutate({ timeline, clientVersion })
      }, 2000),
    [updateTimelineMutation, editorStore]
  )

  // 订阅时间线变化
  useEffect(() => {
    const unsubscribe = editorStore.subscribe(
      (state) => ({
        timeline: state.timeline,
        timelineVersion: state.timelineVersion,
      }),
      (state) => {
        if (state.timeline) {
          // 当时间线变化时触发防抖保存
          debouncedSave(state.timeline, state.timelineVersion)
        }
      },
      {
        equalityFn: (prev, next) => prev.timeline === next.timeline && prev.timelineVersion === next.timelineVersion,
      }
    )

    return () => {
      unsubscribe()
      debouncedSave.cancel()
    }
  }, [editorStore, debouncedSave])

  return {
    isSaving: editorStore.isSaving,
    isError: updateTimelineMutation.isError,
    error: updateTimelineMutation.error,
  }
}
