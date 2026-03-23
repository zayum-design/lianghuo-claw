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
  setTimelineHeight: (height: number) => void
}

const initialState: EditorState = {
  currentTimeMs: 0,
  selectedClipId: null,
  zoomLevel: 0.1, // 每像素 10ms
  isPlaying: false,
  timeline: null,
  timelineHeight: 200,
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      ...initialState,
      setTimelineHeight: (height: number) => set({ timelineHeight: Math.max(120, Math.min(400, height)) }),
    }),
    { name: 'EditorStore' }
  )
)
