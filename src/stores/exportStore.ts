import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface ExportTask {
  exportId: string
  progress: number
  status: 'pending' | 'processing' | 'completed' | 'error'
  downloadUrl: string | null
  error?: string
  stage?: string
}

interface ExportState {
  currentExport: ExportTask | null
  startExport: (exportData: { exportId: string }) => void
  updateProgress: (exportId: string, progress: number, stage?: string) => void
  completeExport: (exportId: string, downloadUrl: string) => void
  failExport: (exportId: string, error: string) => void
  resetExport: () => void
}

const initialState: Omit<
  ExportState,
  keyof Pick<ExportState, 'startExport' | 'updateProgress' | 'completeExport' | 'failExport' | 'resetExport'>
> = {
  currentExport: null,
}

export const useExportStore = create<ExportState>()(
  devtools(
    (set) => ({
      ...initialState,

      startExport: (exportData) => {
        set({
          currentExport: {
            exportId: exportData.exportId,
            progress: 0,
            status: 'pending',
            downloadUrl: null,
            stage: '准备中...',
          },
        })
      },

      updateProgress: (exportId, progress, stage) => {
        set((state) => {
          if (state.currentExport?.exportId !== exportId) return state
          return {
            currentExport: {
              ...state.currentExport,
              progress,
              status: progress < 100 ? 'processing' : 'completed',
              stage: stage || state.currentExport.stage,
            },
          }
        })
      },

      completeExport: (exportId, downloadUrl) => {
        set((state) => {
          if (state.currentExport?.exportId !== exportId) return state
          return {
            currentExport: {
              ...state.currentExport,
              progress: 100,
              status: 'completed',
              downloadUrl,
              stage: '导出完成',
            },
          }
        })
      },

      failExport: (exportId, error) => {
        set((state) => {
          if (state.currentExport?.exportId !== exportId) return state
          return {
            currentExport: {
              ...state.currentExport,
              status: 'error',
              error,
              stage: '导出失败',
            },
          }
        })
      },

      resetExport: () => {
        set({ currentExport: null })
      },
    }),
    { name: 'ExportStore' }
  )
)
