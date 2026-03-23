import * as React from 'react'
import { useState } from 'react'

import { ExclamationCircleOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'
import { useDraggable } from '@dnd-kit/core'

import { Progress, Spin, Image, Button, Popconfirm, message } from 'antd'

import { Asset, useDeleteAsset, useConfirmAsset } from '@/hooks/useAssets'

// 素材卡片支持的完整状态（包括上传队列中的状态）
export type AssetCardStatus = 'uploading' | 'processing' | 'ready' | 'error'

export interface AssetCardProps {
  // 素材数据（就绪状态时使用）
  asset?: Asset
  // 上传队列中的状态（非就绪状态时使用）
  status?: AssetCardStatus
  fileName?: string
  progress?: number // 0-100
  assetId?: string // 上传队列中的临时 ID
  // 交互回调
  onDelete?: (assetId: string) => void
  onRetry?: (assetId: string) => void
  // 拖拽数据
  draggable?: boolean
}

/**
 * 格式化时长（毫秒 -> MM:SS）
 */
function formatDuration(durationMs?: number): string {
  if (!durationMs || durationMs <= 0) return '00:00'
  const totalSeconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/**
 * 素材卡片组件
 * 支持四种状态：上传中、处理中、就绪、错误
 */
const AssetCard: React.FC<AssetCardProps> = ({
  asset,
  status: propStatus,
  fileName,
  progress = 0,
  assetId,
  onDelete,
  onRetry,
  draggable = true,
}) => {
  // 优先使用 asset 中的状态，否则使用 propStatus
  const status = asset?.status || propStatus || 'ready'
  const displayFileName = asset?.original_filename || fileName || ''
  const displayAssetId = asset?.id || assetId || ''
  const thumbnailUrl = asset?.thumbnail_url
  const durationMs = asset?.duration_ms

  const [isHovered, setIsHovered] = useState(false)
  const deleteMutation = useDeleteAsset()
  const confirmMutation = useConfirmAsset()

  // 拖拽配置
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: displayAssetId,
    data: {
      type: 'asset',
      assetId: displayAssetId,
      assetName: displayFileName,
      duration_ms: durationMs || 0,
      thumbnailUrl: thumbnailUrl || '',
    },
    disabled: !draggable || status !== 'ready',
  })

  // 处理删除
  const handleDelete = () => {
    if (!displayAssetId) return
    deleteMutation.mutate(displayAssetId, {
      onSuccess: () => {
        message.success('删除成功')
        onDelete?.(displayAssetId)
      },
      onError: () => {
        message.error('删除失败，请重试')
      },
    })
  }

  // 处理重试（错误状态）
  const handleRetry = () => {
    if (!displayAssetId) return
    confirmMutation.mutate(displayAssetId, {
      onSuccess: () => {
        message.success('已重新提交处理')
        onRetry?.(displayAssetId)
      },
      onError: () => {
        message.error('重试失败，请检查网络')
      },
    })
  }

  // 渲染不同状态的卡片内容
  const renderCardContent = () => {
    switch (status) {
      case 'uploading': {
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#2a2a2a] p-4">
            <Progress
              type="circle"
              percent={progress}
              size={60}
              strokeWidth={8}
              trailColor="#555"
              strokeColor="#1890ff"
            />
            <p className="mt-4 text-sm text-gray-300 truncate w-full text-center">{displayFileName}</p>
          </div>
        )
      }

      case 'processing': {
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#2a2a2a] p-4">
            <Spin size="large" />
            <p className="mt-4 text-sm text-gray-300">处理中...</p>
          </div>
        )
      }

      case 'error': {
        return (
          <div className="absolute inset-0 flex flex-col items-center justify-center border-2 border-red-500 bg-[#2a2a2a] p-4">
            <ExclamationCircleOutlined className="text-4xl text-red-500 mb-2" />
            <p className="text-sm text-gray-300 mb-2">处理失败</p>
            <Button
              type="link"
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleRetry}
              loading={confirmMutation.isPending}
            >
              重试
            </Button>
          </div>
        )
      }

      case 'ready': {
        return (
          <>
            {/* 缩略图 */}
            {thumbnailUrl ? (
              <Image
                src={thumbnailUrl}
                alt={displayFileName}
                width="100%"
                height="100%"
                loading="lazy"
                className="object-cover"
                wrapperClassName="w-full h-full"
                preview={false}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-900/30 to-purple-900/30 flex items-center justify-center">
                <span className="text-gray-400 text-sm">暂无缩略图</span>
              </div>
            )}

            {/* 时长标签 */}
            {durationMs && (
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                {formatDuration(durationMs)}
              </div>
            )}

            {/* 悬停蒙层 */}
            {isHovered && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center transition-opacity">
                {/* 删除按钮 */}
                <Popconfirm
                  title="确认删除该素材？"
                  description="删除后无法恢复，时间线上已使用该素材的片段将失效"
                  okText="确认删除"
                  cancelText="取消"
                  okType="danger"
                  onConfirm={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  <Button
                    type="primary"
                    danger
                    size="small"
                    icon={<DeleteOutlined />}
                    loading={deleteMutation.isPending}
                    className="shadow-lg"
                  >
                    删除
                  </Button>
                </Popconfirm>
              </div>
            )}
          </>
        )
      }

      default:
        return null
    }
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="relative bg-[#1a1a1a] rounded-lg overflow-hidden cursor-pointer"
      data-testid={displayAssetId ? `asset-card-${displayAssetId}` : 'asset-card'}
      style={{
        paddingTop: '56.25%', // 16:9 比例
        opacity: isDragging ? 0.5 : 1,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="absolute inset-0">{renderCardContent()}</div>
    </div>
  )
}

// 自定义比较函数，确保assetId相同时不重渲染
const areEqual = (prevProps: AssetCardProps, nextProps: AssetCardProps) => {
  // 如果asset存在，比较asset.id
  if (prevProps.asset?.id && nextProps.asset?.id) {
    return prevProps.asset.id === nextProps.asset.id
  }
  // 否则比较assetId
  if (prevProps.assetId && nextProps.assetId) {
    return prevProps.assetId === nextProps.assetId
  }
  // 如果都没有ID，使用浅比较
  return false
}

export default React.memo(AssetCard, areEqual)
