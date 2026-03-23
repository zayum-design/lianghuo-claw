import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/apiClient'
import { API_PATHS } from '@/lib/apiPaths'
import { QUERY_KEYS } from '@/lib/queryKeys'

// 素材列表查询参数类型
export interface AssetListParams {
  page?: number
  page_size?: number
  status?: 'processing' | 'ready' | 'error'
}

// 预签名请求体类型
export interface PresignAssetRequest {
  name: string
  file_size_bytes: number
}

// 素材详情类型（根据后端 AssetSchema 定义）
export interface Asset {
  id: string
  user_id: string
  name: string
  original_filename: string
  file_size_bytes: number
  mime_type: string
  status: 'uploading' | 'processing' | 'ready' | 'error'
  duration_ms?: number
  thumbnail_url?: string
  created_at: string
  updated_at: string
}

/**
 * 获取素材列表
 * @param params 查询参数
 * @returns React Query hook 返回数据
 */
export function useAssets(params: AssetListParams = {}) {
  return useQuery({
    queryKey: QUERY_KEYS.assets.list(params),
    queryFn: async () => {
      const response = await api.get<Asset[]>(API_PATHS.assets.list, { params })
      return response
    },
    staleTime: 30 * 1000, // 30秒
  })
}

/**
 * 获取预签名 URL 上传凭证
 * @returns React Query mutation
 */
export function usePresignAsset() {
  return useMutation({
    mutationFn: async (data: PresignAssetRequest) => {
      const response = await api.post<{ asset_id: string; upload_url: string }>(API_PATHS.assets.presign, data)
      return response
    },
  })
}

/**
 * 确认上传完成
 * @returns React Query mutation
 */
export function useConfirmAsset() {
  return useMutation({
    mutationFn: async (assetId: string) => {
      const response = await api.post<Asset>(API_PATHS.assets.confirm(assetId))
      return response
    },
  })
}

/**
 * 删除素材
 * @returns React Query mutation
 */
export function useDeleteAsset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (assetId: string) => {
      const response = await api.del<void>(API_PATHS.assets.detail(assetId))
      return response
    },
    onSuccess: () => {
      // 删除成功后刷新素材列表
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.assets.all })
    },
  })
}
