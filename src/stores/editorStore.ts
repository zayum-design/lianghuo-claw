import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import { snapToFrame, checkClipOverlap, calculateTimelineDuration } from '@/utils/timeline'

import type { Timeline, Clip } from '@/types/timeline'

interface EditorState {
  // State
  timeline: Timeline | null
  currentTimeMs: number
  selectedClipId: string | null
  zoomLevel: number
  isPlaying: boolean
  timelineHeight: number
  timelineScrollLeft: number
  snapEnabled: boolean
  timelineVersion: number
  isSaving: boolean
  volume: number // 0-100
  isMuted: boolean

  // Actions
  // Clip operations
  addClip: (trackId: string, clip: Clip) => void
  removeClip: (clipId: string) => void
  moveClip: (clipId: string, newTimelineStartMs: number) => void
  splitClip: (clipId: string, splitAtMs: number) => void
  trimClipStart: (clipId: string, newSourceStartMs: number) => void
  trimClipEnd: (clipId: string, newSourceEndMs: number) => void

  // Timeline metadata
  setCurrentTime: (timeMs: number) => void
  setZoomLevel: (level: number) => void
  setSelectedClipId: (id: string | null) => void
  setTimeline: (timeline: Timeline, version: number) => void
  setTimelineHeight: (height: number) => void
  setTimelineScrollLeft: (scrollLeft: number) => void
  setSnapEnabled: (enabled: boolean) => void
  setTimelineVersion: (version: number) => void
  setIsSaving: (saving: boolean) => void

  // Playback controls
  setIsPlaying: (playing: boolean) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
}

const initialState = {
  timeline: null,
  currentTimeMs: 0,
  selectedClipId: null,
  zoomLevel: 0.1, // 每像素 10ms
  isPlaying: false,
  timelineHeight: 200,
  timelineScrollLeft: 0,
  snapEnabled: true,
  timelineVersion: 0,
  isSaving: false,
  volume: 80, // 默认音量 80%
  isMuted: false,
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Clip operations
      addClip: (trackId: string, clip: Clip) => {
        const { timeline } = get()
        if (!timeline) return

        const updatedTimeline = { ...timeline }
        const track = updatedTimeline.tracks.find((t) => t.id === trackId)
        if (!track) return

        // 检查重叠并处理
        const clipsToShift: Clip[] = []
        const newClipStart = clip.timeline_start_ms
        const newClipEnd = newClipStart + clip.duration_ms

        // 找出所有与新 Clip 重叠的现有 Clip
        for (const existingClip of track.clips) {
          const existingStart = existingClip.timeline_start_ms
          const existingEnd = existingStart + existingClip.duration_ms

          // 检查是否有重叠
          if (newClipStart < existingEnd && newClipEnd > existingStart) {
            // 计算重叠持续时间
            const overlapStart = Math.max(newClipStart, existingStart)
            const overlapEnd = Math.min(newClipEnd, existingEnd)
            const overlapDuration = overlapEnd - overlapStart

            // 将重叠的 Clip 向右推移重叠量
            existingClip.timeline_start_ms += overlapDuration
            clipsToShift.push(existingClip)
          }
        }

        // 添加新 Clip
        track.clips = [...track.clips, clip]

        // 重新计算时间线时长
        updatedTimeline.duration_ms = calculateTimelineDuration(updatedTimeline.tracks)

        set({ timeline: updatedTimeline })
      },

      removeClip: (clipId: string) => {
        const { timeline } = get()
        if (!timeline) return

        const updatedTimeline = { ...timeline }
        let removed = false

        updatedTimeline.tracks = updatedTimeline.tracks.map((track) => {
          const originalLength = track.clips.length
          track.clips = track.clips.filter((clip) => clip.id !== clipId)
          if (track.clips.length !== originalLength) {
            removed = true
          }
          return track
        })

        if (!removed) return

        // 重新计算时间线时长
        updatedTimeline.duration_ms = calculateTimelineDuration(updatedTimeline.tracks)
        set({ timeline: updatedTimeline })
      },

      moveClip: (clipId: string, newTimelineStartMs: number) => {
        const { timeline, snapEnabled } = get()
        if (!timeline) return

        let targetClip: Clip | null = null
        let targetTrackIndex = -1

        // 找到要移动的 Clip
        for (let i = 0; i < timeline.tracks.length; i++) {
          const track = timeline.tracks[i]
          const clip = track.clips.find((c) => c.id === clipId)
          if (clip) {
            targetClip = clip
            targetTrackIndex = i
            break
          }
        }

        if (!targetClip) return

        // 如果启用吸附，对齐到帧边界
        const fps = timeline.fps
        const snappedMs = snapEnabled ? snapToFrame(newTimelineStartMs, fps) : newTimelineStartMs

        const updatedTimeline = { ...timeline }
        const track = updatedTimeline.tracks[targetTrackIndex]
        const clipIndex = track.clips.findIndex((c) => c.id === clipId)
        if (clipIndex === -1) return

        // 创建要移动的 Clip 副本
        const movedClip = { ...track.clips[clipIndex], timeline_start_ms: snappedMs }

        // 检测与同轨道其他 Clip 重叠
        const otherClips = track.clips.filter((c) => c.id !== clipId)
        const isOverlap = checkClipOverlap(otherClips, movedClip)

        if (isOverlap) {
          // 如果重叠，保持原位置
          return
        }

        // 更新 Clip 位置
        track.clips[clipIndex] = movedClip

        // 重新计算时间线时长
        updatedTimeline.duration_ms = calculateTimelineDuration(updatedTimeline.tracks)
        set({ timeline: updatedTimeline })
      },

      splitClip: (clipId: string, splitAtMs: number) => {
        const { timeline } = get()
        if (!timeline) return

        const updatedTimeline = { ...timeline }

        // 查找要分割的 Clip
        for (const track of updatedTimeline.tracks) {
          const clipIndex = track.clips.findIndex((c) => c.id === clipId)
          if (clipIndex === -1) continue

          const originalClip = track.clips[clipIndex]

          // 确保分割点在 Clip 的时间范围内
          const clipStart = originalClip.timeline_start_ms
          const clipEnd = clipStart + originalClip.duration_ms
          if (splitAtMs <= clipStart || splitAtMs >= clipEnd) {
            return
          }

          // 计算相对于原素材的时间偏移
          const timeOffsetInClip = splitAtMs - clipStart
          const relativeSourceTime = originalClip.source_start_ms + timeOffsetInClip

          // 创建第一个 Clip（分割点左侧）
          const firstClip: Clip = {
            ...originalClip,
            id: crypto.randomUUID(),
            source_end_ms: relativeSourceTime,
            duration_ms: relativeSourceTime - originalClip.source_start_ms,
          }

          // 创建第二个 Clip（分割点右侧）
          const secondClip: Clip = {
            ...originalClip,
            id: crypto.randomUUID(),
            timeline_start_ms: splitAtMs,
            source_start_ms: relativeSourceTime,
            duration_ms: originalClip.source_end_ms - relativeSourceTime,
          }

          // 替换原 Clip 为两个新 Clip
          track.clips.splice(clipIndex, 1, firstClip, secondClip)

          // 重新计算时间线时长
          updatedTimeline.duration_ms = calculateTimelineDuration(updatedTimeline.tracks)
          set({ timeline: updatedTimeline })
          return
        }
      },

      trimClipStart: (clipId: string, newSourceStartMs: number) => {
        const { timeline } = get()
        if (!timeline) return

        const updatedTimeline = { ...timeline }
        const fps = timeline.fps
        const minDurationMs = 1000 / fps // 最短帧时长

        for (const track of updatedTimeline.tracks) {
          const clipIndex = track.clips.findIndex((c) => c.id === clipId)
          if (clipIndex === -1) continue

          const clip = track.clips[clipIndex]

          // 验证参数
          if (newSourceStartMs < 0) return
          if (newSourceStartMs >= clip.source_end_ms - minDurationMs) return

          // 计算时间偏移量
          const timeShift = newSourceStartMs - clip.source_start_ms

          // 更新 Clip
          track.clips[clipIndex] = {
            ...clip,
            source_start_ms: newSourceStartMs,
            duration_ms: clip.source_end_ms - newSourceStartMs,
            timeline_start_ms: clip.timeline_start_ms + timeShift, // 入点右移时时间线位置也右移
          }

          // 重新计算时间线时长
          updatedTimeline.duration_ms = calculateTimelineDuration(updatedTimeline.tracks)
          set({ timeline: updatedTimeline })
          return
        }
      },

      trimClipEnd: (clipId: string, newSourceEndMs: number) => {
        const { timeline } = get()
        if (!timeline) return

        const updatedTimeline = { ...timeline }
        const fps = timeline.fps
        const minDurationMs = 1000 / fps // 最短帧时长

        for (const track of updatedTimeline.tracks) {
          const clipIndex = track.clips.findIndex((c) => c.id === clipId)
          if (clipIndex === -1) continue

          const clip = track.clips[clipIndex]

          // 验证参数
          if (newSourceEndMs <= clip.source_start_ms + minDurationMs) return
          // 注意：这里没有 assetDuration 验证，由调用方保证

          // 更新 Clip
          track.clips[clipIndex] = {
            ...clip,
            source_end_ms: newSourceEndMs,
            duration_ms: newSourceEndMs - clip.source_start_ms,
          }

          // 重新计算时间线时长
          updatedTimeline.duration_ms = calculateTimelineDuration(updatedTimeline.tracks)
          set({ timeline: updatedTimeline })
          return
        }
      },

      // Timeline metadata
      setCurrentTime: (timeMs: number) => {
        const { timeline } = get()
        const maxTime = timeline?.duration_ms || 0
        const clampedTime = Math.max(0, Math.min(maxTime, timeMs))
        set({ currentTimeMs: clampedTime })
      },

      setZoomLevel: (level: number) => {
        const clampedLevel = Math.max(0.005, Math.min(1, level))
        set({ zoomLevel: clampedLevel })
      },

      setSelectedClipId: (id: string | null) => {
        set({ selectedClipId: id })
      },

      setTimeline: (timeline: Timeline, version: number) => {
        set({ timeline, timelineVersion: version })
      },

      setTimelineHeight: (height: number) => {
        const clampedHeight = Math.max(120, Math.min(400, height))
        set({ timelineHeight: clampedHeight })
      },

      setTimelineScrollLeft: (scrollLeft: number) => {
        set({ timelineScrollLeft: scrollLeft })
      },

      setSnapEnabled: (enabled: boolean) => {
        set({ snapEnabled: enabled })
      },

      setTimelineVersion: (version: number) => {
        set({ timelineVersion: version })
      },

      setIsSaving: (saving: boolean) => {
        set({ isSaving: saving })
      },

      // Playback controls
      setIsPlaying: (playing: boolean) => {
        set({ isPlaying: playing })
      },

      setVolume: (volume: number) => {
        const clampedVolume = Math.max(0, Math.min(100, volume))
        set({ volume: clampedVolume })
      },

      toggleMute: () => {
        set((state) => ({ isMuted: !state.isMuted }))
      },
    }),
    { name: 'EditorStore' }
  )
)
