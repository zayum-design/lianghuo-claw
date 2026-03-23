import { useEffect, useRef, useState, useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/apiClient'
import { API_PATHS } from '@/lib/apiPaths'
import { QUERY_KEYS } from '@/lib/queryKeys'
import { useEditorStore } from '@/stores/editorStore'

// 从 MEMORY.md 复制的 Clip 接口定义
interface Clip {
  id: string
  asset_id: string
  timeline_start_ms: number
  source_start_ms: number
  source_end_ms: number
  duration_ms: number
  speed: number
  volume: number
  filters: Array<{
    type: string
    params: Record<string, unknown>
  }>
}

interface Track {
  id: string
  type: 'video' | 'audio' | 'subtitle'
  name: string
  index: number
  is_muted: boolean
  is_locked: boolean
  height_px: number
  clips: Clip[]
}

/**
 * 获取素材流式 URL
 * @param assetId 素材 ID
 * @returns 流式 URL 或 undefined
 */
export function useAssetStreamUrl(assetId: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.assets.streamUrl(assetId || ''),
    queryFn: async () => {
      if (!assetId) return null
      const response = await api.get<{ url: string }>(API_PATHS.assets.streamUrl(assetId))
      return response.url
    },
    enabled: !!assetId,
    staleTime: 50 * 60 * 1000, // 50 分钟缓存，比 1 小时有效期短
    gcTime: 60 * 60 * 1000, // 1 小时缓存
  })
}

/**
 * 时间线播放逻辑 Hook
 *
 * 监听当前播放时间，自动切换 Clip 和视频源。
 * 当前实现为骨架，待 Task-10 时间线状态管理完成后完善。
 */
export function useTimelinePlayback() {
  const { currentTimeMs, timeline, isPlaying } = useEditorStore()
  const [currentClipIndex, setCurrentClipIndex] = useState<number>(-1)
  const prevClipIndexRef = useRef<number>(-1)

  // 从 timeline 中提取所有视频轨道的 clips
  const allVideoClips: Clip[] = useMemo(() => {
    if (!timeline?.tracks) return []

    const videoClips: Clip[] = []
    timeline.tracks.forEach((track: Track) => {
      if (track.type === 'video' && track.clips) {
        videoClips.push(...track.clips)
      }
    })

    // 按 timeline_start_ms 排序
    return videoClips.sort((a, b) => a.timeline_start_ms - b.timeline_start_ms)
  }, [timeline])

  // 根据当前播放时间计算应播放的 Clip 索引
  useEffect(() => {
    if (allVideoClips.length === 0) {
      setCurrentClipIndex(-1)
      return
    }

    // 找到当前时间所在的 Clip
    let targetIndex = -1
    for (let i = 0; i < allVideoClips.length; i++) {
      const clip = allVideoClips[i]
      if (currentTimeMs >= clip.timeline_start_ms && currentTimeMs < clip.timeline_start_ms + clip.duration_ms) {
        targetIndex = i
        break
      }
    }

    // 如果当前时间不在任何 Clip 内，则找到下一个即将开始的 Clip
    if (targetIndex === -1) {
      for (let i = 0; i < allVideoClips.length; i++) {
        if (currentTimeMs < allVideoClips[i].timeline_start_ms) {
          targetIndex = i
          break
        }
      }
    }

    setCurrentClipIndex(targetIndex)
  }, [currentTimeMs, allVideoClips])

  // Clip 切换逻辑（当前为骨架，待后续完善）
  const currentClip = currentClipIndex >= 0 ? allVideoClips[currentClipIndex] : undefined
  const assetId = currentClip?.asset_id

  // 获取当前 Clip 的流式 URL
  const { data: streamUrl, isLoading: isLoadingStream } = useAssetStreamUrl(assetId)

  // 检测 Clip 切换
  useEffect(() => {
    if (prevClipIndexRef.current !== currentClipIndex) {
      console.log(`Clip changed from ${prevClipIndexRef.current} to ${currentClipIndex}`)
      // TODO: 触发视频源切换逻辑
      // 这里将在 VideoPlayer 组件中实现切换
      prevClipIndexRef.current = currentClipIndex
    }
  }, [currentClipIndex])

  // 播放到 Clip 结尾时自动切换到下一个 Clip
  useEffect(() => {
    if (!currentClip || !isPlaying) return

    const clipEndTime = currentClip.timeline_start_ms + currentClip.duration_ms
    const timeToEnd = clipEndTime - currentTimeMs

    if (timeToEnd <= 50 && timeToEnd > 0) {
      // 接近结尾时（50ms 内）
      // TODO: 平滑切换到下一个 Clip
      console.log('Clip ending soon, prepare for next clip')
    }
  }, [currentTimeMs, currentClip, isPlaying])

  return {
    currentClip,
    currentClipIndex,
    allVideoClips,
    streamUrl,
    isLoadingStream,
  }
}
