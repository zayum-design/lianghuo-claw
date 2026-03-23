import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

// 上传队列项
export interface UploadQueueItem {
  assetId: string
  fileName: string
  progress: number // 0-100
  status: 'uploading' | 'processing' | 'error'
}

interface AssetState {
  // 上传队列
  uploadQueue: UploadQueueItem[]
  // 添加上传项到队列
  addToUploadQueue: (item: Omit<UploadQueueItem, 'progress'> & { progress?: number }) => void
  // 更新上传进度
  updateUploadProgress: (assetId: string, progress: number) => void
  // 更新上传状态
  updateUploadStatus: (assetId: string, status: UploadQueueItem['status']) => void
  // 从队列中移除
  removeFromUploadQueue: (assetId: string) => void
  // 清空队列
  clearUploadQueue: () => void
}

const initialState: Pick<AssetState, 'uploadQueue'> = {
  uploadQueue: [],
}

export const useAssetStore = create<AssetState>()(
  devtools(
    (set) => ({
      ...initialState,

      addToUploadQueue: (item) => {
        set((state) => ({
          uploadQueue: [
            ...state.uploadQueue,
            {
              ...item,
              progress: item.progress || 0,
            },
          ],
        }))
      },

      updateUploadProgress: (assetId, progress) => {
        set((state) => ({
          uploadQueue: state.uploadQueue.map((item) => (item.assetId === assetId ? { ...item, progress } : item)),
        }))
      },

      updateUploadStatus: (assetId, status) => {
        set((state) => ({
          uploadQueue: state.uploadQueue.map((item) => (item.assetId === assetId ? { ...item, status } : item)),
        }))
      },

      removeFromUploadQueue: (assetId) => {
        set((state) => ({
          uploadQueue: state.uploadQueue.filter((item) => item.assetId !== assetId),
        }))
      },

      clearUploadQueue: () => {
        set({ uploadQueue: [] })
      },
    }),
    { name: 'AssetStore' }
  )
)
