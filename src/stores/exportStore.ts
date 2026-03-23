import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ExportTask {
  exportId: string
  progress: number
  status: 'pending' | 'processing' | 'completed' | 'error'
  downloadUrl: string | null
}

interface ExportState {
  currentExport: ExportTask | null
}

const initialState: ExportState = {
  currentExport: null,
}

export const useExportStore = create<ExportState>()(devtools(() => initialState, { name: 'ExportStore' }))
