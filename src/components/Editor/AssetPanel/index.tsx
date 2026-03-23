import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'

import {
  VideoCameraOutlined,
  SoundOutlined,
  FontColorsOutlined,
  UploadOutlined,
  FileImageOutlined,
} from '@ant-design/icons'
import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import { Tabs, Upload, Segmented, Empty, message, Progress, Spin } from 'antd'
import type { TabsProps, UploadProps } from 'antd'

// 自定义 hooks 和 store
import { useAssets, usePresignAsset } from '@/hooks/useAssets'
import { wsClient } from '@/lib/wsClient'
import { useAssetStore, UploadQueueItem } from '@/stores/assetStore'

import AssetCard, { AssetCardStatus } from './AssetCard'

const { Dragger } = Upload

// 允许上传的 MIME 类型
const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/aac',
  'audio/mp4',
]

// 最大文件大小：10GB
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 * 1024
// 最大同时上传文件数
const MAX_CONCURRENT_UPLOADS = 5

const AssetPanel: React.FC = () => {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'subtitle'>('video')
  const [filterStatus, setFilterStatus] = useState<'all' | 'processing' | 'ready'>('all')

  // 状态管理
  const { data: assetsData, isLoading: assetsLoading } = useAssets({
    status: filterStatus === 'all' ? undefined : filterStatus,
  })
  const presignMutation = usePresignAsset()
  const { uploadQueue, addToUploadQueue, updateUploadProgress, updateUploadStatus, removeFromUploadQueue } =
    useAssetStore()

  // 素材列表（合并就绪素材和上传队列）
  const mergedAssets = useMemo(() => {
    const readyAssets = assetsData || []

    // 将上传队列中的项目转换为临时素材对象
    const queueAssets = uploadQueue.map((item: UploadQueueItem) => ({
      id: item.assetId,
      assetId: item.assetId,
      fileName: item.fileName,
      status: item.status as AssetCardStatus,
      progress: item.progress,
    }))

    return [...queueAssets, ...readyAssets]
  }, [assetsData, uploadQueue])

  // WebSocket 订阅
  useEffect(() => {
    wsClient.connect()

    // 处理素材处理完成
    const handleAssetReady = (data: any) => {
      const { asset_id } = data
      message.success('素材处理完成')
      removeFromUploadQueue(asset_id)
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    }

    // 处理素材处理失败
    const handleAssetError = (data: any) => {
      const { asset_id, error } = data
      message.error(`素材处理失败: ${error}`)
      updateUploadStatus(asset_id, 'error')
    }

    wsClient.subscribe('asset_ready', handleAssetReady)
    wsClient.subscribe('asset_error', handleAssetError)

    return () => {
      wsClient.unsubscribe('asset_ready', handleAssetReady)
      wsClient.unsubscribe('asset_error', handleAssetError)
    }
  }, [queryClient, removeFromUploadQueue, updateUploadStatus])

  // 文件上传处理
  const handleUpload: UploadProps['customRequest'] = async (options) => {
    const { file, onProgress, onSuccess, onError } = options
    const fileObj = file as File

    // 1. 前端校验
    if (!ALLOWED_MIME_TYPES.includes(fileObj.type)) {
      message.error(`不支持的文件类型: ${fileObj.type}`)
      onError?.(new Error('Unsupported file type'))
      return
    }

    if (fileObj.size > MAX_FILE_SIZE_BYTES) {
      message.error('文件大小超过 10GB 限制')
      onError?.(new Error('File too large'))
      return
    }

    try {
      // 2. 获取预签名 URL
      const presignData = await presignMutation.mutateAsync({
        name: fileObj.name,
        file_size_bytes: fileObj.size,
      })

      const { asset_id, upload_url } = presignData

      // 3. 添加到上传队列
      addToUploadQueue({
        assetId: asset_id,
        fileName: fileObj.name,
        progress: 0,
        status: 'uploading',
      })

      // 4. 直传 MinIO
      await axios.put(upload_url, fileObj, {
        headers: {
          'Content-Type': fileObj.type,
        },
        onUploadProgress: (progressEvent) => {
          const percent = progressEvent.total ? Math.round((progressEvent.loaded * 100) / progressEvent.total) : 0
          onProgress?.({ percent } as any)
          updateUploadProgress(asset_id, percent)
        },
      })

      // 5. 更新状态为处理中
      updateUploadStatus(asset_id, 'processing')
      onSuccess?.(presignData)
    } catch (error: any) {
      console.error('Upload failed:', error)
      const assetId = (error.response?.data as any)?.asset_id
      if (assetId) {
        updateUploadStatus(assetId, 'error')
      }
      onError?.(error)
    }
  }

  // 上传前校验（限制并发数量）
  const beforeUpload: UploadProps['beforeUpload'] = (file, fileList) => {
    // 检查是否超过最大并发数
    const currentUploadCount = uploadQueue.filter(
      (item) => item.status === 'uploading' || item.status === 'processing'
    ).length
    if (currentUploadCount + fileList.length > MAX_CONCURRENT_UPLOADS) {
      message.error(`最多同时上传 ${MAX_CONCURRENT_UPLOADS} 个文件`)
      return Upload.LIST_IGNORE
    }
    return true
  }

  // 渲染素材列表
  const renderAssetList = () => {
    if (assetsLoading && !mergedAssets.length) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <Spin tip="加载素材中..." />
        </div>
      )
    }

    if (!mergedAssets.length) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <Empty image={<FileImageOutlined className="text-4xl text-gray-500" />} description="暂无素材，点击上传" />
        </div>
      )
    }

    return (
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {mergedAssets.map((item: any) => {
            const isQueueItem = 'progress' in item && !('user_id' in item)

            if (isQueueItem) {
              // 上传队列中的项目
              return (
                <AssetCard
                  key={`queue-${item.assetId}`}
                  assetId={item.assetId}
                  fileName={item.fileName}
                  status={item.status}
                  progress={item.progress}
                />
              )
            } else {
              // 就绪的素材
              return <AssetCard key={`asset-${item.id}`} asset={item} draggable />
            }
          })}
        </div>
      </div>
    )
  }

  // Tab 配置
  const tabItems: TabsProps['items'] = [
    {
      key: 'video',
      label: (
        <span>
          <VideoCameraOutlined />
          <span className="ml-2">视频</span>
        </span>
      ),
      children: renderAssetList(),
    },
    {
      key: 'audio',
      label: (
        <span>
          <SoundOutlined />
          <span className="ml-2">音频</span>
        </span>
      ),
      children: (
        <div className="p-4 h-full overflow-auto">
          <Empty description="音频功能开发中" />
        </div>
      ),
    },
    {
      key: 'subtitle',
      label: (
        <span className="text-gray-500">
          <FontColorsOutlined />
          <span className="ml-2">字幕</span>
        </span>
      ),
      children: (
        <div className="p-4 h-full overflow-auto">
          <Empty description="敬请期待" />
        </div>
      ),
      disabled: true,
    },
  ]

  return (
    <div className="w-60 flex-shrink-0 h-full bg-[#242424] border-r border-[#333333] flex flex-col">
      {/* 顶部状态栏 */}
      <div className="p-3 border-b border-[#333333]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-300">共 {mergedAssets.length} 个素材</span>
          <Segmented
            size="small"
            value={filterStatus}
            onChange={(value) => setFilterStatus(value as any)}
            options={[
              { label: '全部', value: 'all' },
              { label: '处理中', value: 'processing' },
              { label: '就绪', value: 'ready' },
            ]}
          />
        </div>

        {/* 上传进度显示（如果有上传中的文件） */}
        {uploadQueue.some((item) => item.status === 'uploading') && (
          <div className="mt-2">
            {uploadQueue
              .filter((item) => item.status === 'uploading')
              .map((item) => (
                <div key={item.assetId} className="mb-1">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span className="truncate">{item.fileName}</span>
                    <span>{item.progress}%</span>
                  </div>
                  <Progress
                    percent={item.progress}
                    size="small"
                    strokeColor="#1890ff"
                    trailColor="#555"
                    showInfo={false}
                  />
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Tab 区域 */}
      <div className="flex-1 flex flex-col">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as any)}
          items={tabItems}
          size="small"
          className="flex-1 flex flex-col [&_.ant-tabs-nav]:px-4 [&_.ant-tabs-nav]:mt-2 [&_.ant-tabs-nav]:mb-0 [&_.ant-tabs-content]:flex-1"
        />
      </div>

      {/* 底部上传区域 */}
      <div className="p-4 border-t border-[#333333]">
        <Dragger
          name="file"
          multiple
          maxCount={MAX_CONCURRENT_UPLOADS}
          showUploadList={false}
          beforeUpload={beforeUpload}
          customRequest={handleUpload}
          accept={ALLOWED_MIME_TYPES.join(',')}
          disabled={presignMutation.isPending}
        >
          <div className="py-4">
            <p className="ant-upload-drag-icon">
              <UploadOutlined className="text-2xl text-gray-400" />
            </p>
            <p className="ant-upload-text text-sm text-gray-300">点击或拖拽上传</p>
            <p className="ant-upload-hint text-xs text-gray-500 mt-1">支持视频、音频文件，最大10GB</p>
          </div>
        </Dragger>
      </div>
    </div>
  )
}

export default AssetPanel
