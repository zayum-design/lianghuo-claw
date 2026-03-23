import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface Timeline {
  id: string
  fps: number
  resolution: { width: number; height: number }
  duration_ms: number
  tracks: any[]
}

interface EditorState {
  currentTimeMs: number
  selectedClipId: string | null
  zoomLevel: number
  isPlaying: boolean
  timeline: Timeline | null
  timelineHeight: number
  volume: number // 0-100
  isMuted: boolean

  // Actions
  setTimelineHeight: (height: number) => void
  setCurrentTime: (timeMs: number) => void
  setIsPlaying: (playing: boolean) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
}

const initialState = {
  currentTimeMs: 0,
  selectedClipId: null,
  zoomLevel: 0.1, // 每像素 10ms
  isPlaying: false,
  timeline: null,
  timelineHeight: 200,
  volume: 80, // 默认音量 80%
  isMuted: false,
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      ...initialState,
      setTimelineHeight: (height: number) => set({ timelineHeight: Math.max(120, Math.min(400, height)) }),
      setCurrentTime: (timeMs: number) => set({ currentTimeMs: timeMs }),
      setIsPlaying: (playing: boolean) => set({ isPlaying: playing }),
      setVolume: (volume: number) => set({ volume: Math.max(0, Math.min(100, volume)) }),
      toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
    }),
    { name: 'EditorStore' }
  )
)
