import * as React from 'react'
import { useEffect, useState } from 'react'

import { useMutation } from '@tanstack/react-query'

import { Modal, Form, Select, InputNumber, Progress, Button, Space, message } from 'antd'

import apiClient from '@/lib/apiClient'
import { wsClient } from '@/lib/wsClient'
import { useEditorStore } from '@/stores/editorStore'
import { useExportStore } from '@/stores/exportStore'

const { Option } = Select

// Mock IDs（来自 MEMORY.md）
const MOCK_PROJECT_ID = '00000000-0000-0000-0000-000000000002'
const MOCK_TIMELINE_ID = '00000000-0000-0000-0000-000000000003'

// 分辨率选项
const RESOLUTION_OPTIONS = [
  { label: '与项目一致（1920×1080）', value: 'project' },
  { label: '1280×720', value: '720p' },
  { label: '3840×2160', value: '2160p' },
  { label: '自定义', value: 'custom' },
]

// 帧率选项
const FPS_OPTIONS = [
  { label: '与项目一致（30fps）', value: 'project' },
  { label: '24fps', value: 24 },
  { label: '60fps', value: 60 },
]

// 视频质量选项（码率 kbps）
const QUALITY_OPTIONS = [
  { label: '高质量（8000 kbps）', value: 8000 },
  { label: '标准（4000 kbps）', value: 4000 },
  { label: '节省空间（2000 kbps）', value: 2000 },
]

// 根据参数计算预计文件大小（MB）
const calculateFileSize = (durationMs: number, bitrateKbps: number): string => {
  const durationSeconds = durationMs / 1000
  const sizeMB = (durationSeconds * bitrateKbps) / 8 / 1024
  return sizeMB.toFixed(1)
}

interface ExportModalProps {
  visible: boolean
  onCancel: () => void
}

const ExportModal: React.FC<ExportModalProps> = ({ visible, onCancel }) => {
  const [form] = Form.useForm()
  const [view, setView] = useState<'settings' | 'progress'>('settings')
  const [resolutionType, setResolutionType] = useState<string>('project')
  const [customWidth, setCustomWidth] = useState<number>(1920)
  const [customHeight, setCustomHeight] = useState<number>(1080)
  const [estimatedSize, setEstimatedSize] = useState<string>('0.0')

  const editorStore = useEditorStore()
  const exportStore = useExportStore()
  const currentExport = exportStore.currentExport
  const timeline = editorStore.timeline

  // 表单字段变化时重新计算文件大小
  const handleFormChange = () => {
    const values = form.getFieldsValue()
    const bitrate = values.quality || 4000
    const durationMs = timeline?.duration_ms || 0
    setEstimatedSize(calculateFileSize(durationMs, bitrate))
  }

  // 分辨率类型变化
  const handleResolutionTypeChange = (value: string) => {
    setResolutionType(value)
  }

  // 开始导出
  const startExportMutation = useMutation({
    mutationFn: async (params: any) => {
      const response = await apiClient.post('/exports', params)
      return response.data
    },
    onSuccess: (data) => {
      exportStore.startExport(data)
      setView('progress')
    },
    onError: (error) => {
      message.error(`导出请求失败：${error.message}`)
    },
  })

  const handleStartExport = async () => {
    try {
      const values = await form.validateFields()

      // 构建导出参数
      let width = 1920
      let height = 1080

      if (resolutionType === 'project') {
        width = timeline?.resolution?.width || 1920
        height = timeline?.resolution?.height || 1080
      } else if (resolutionType === '720p') {
        width = 1280
        height = 720
      } else if (resolutionType === '2160p') {
        width = 3840
        height = 2160
      } else if (resolutionType === 'custom') {
        width = customWidth
        height = customHeight
      }

      const fps = values.fps === 'project' ? timeline?.fps || 30 : values.fps
      const bitrate = values.quality

      const params = {
        project_id: MOCK_PROJECT_ID,
        timeline_id: editorStore.timeline?.id || MOCK_TIMELINE_ID,
        width,
        height,
        fps,
        bitrate_kbps: bitrate,
        format: 'mp4',
      }

      startExportMutation.mutate(params)
    } catch (error) {
      // 表单验证失败
      console.error('表单验证失败:', error)
    }
  }

  // WebSocket 订阅
  useEffect(() => {
    if (!visible || view !== 'progress') return

    const handleExportProgress = (data: any) => {
      if (data.type === 'export_progress' && currentExport?.exportId === data.export_id) {
        exportStore.updateProgress(data.export_id, data.progress, data.stage)
      } else if (data.type === 'export_completed' && currentExport?.exportId === data.export_id) {
        exportStore.completeExport(data.export_id, data.download_url)
      } else if (data.type === 'export_failed' && currentExport?.exportId === data.export_id) {
        exportStore.failExport(data.export_id, data.error)
      }
    }

    wsClient.subscribe('export_progress', handleExportProgress)
    wsClient.subscribe('export_completed', handleExportProgress)
    wsClient.subscribe('export_failed', handleExportProgress)

    return () => {
      wsClient.unsubscribe('export_progress', handleExportProgress)
      wsClient.unsubscribe('export_completed', handleExportProgress)
      wsClient.unsubscribe('export_failed', handleExportProgress)
    }
  }, [visible, view, currentExport?.exportId, exportStore])

  // 轮询后备方案（如果 WebSocket 未连接）
  useEffect(() => {
    if (!visible || view !== 'progress' || !currentExport?.exportId) return

    const interval = setInterval(async () => {
      try {
        const response = await apiClient.get(`/exports/${currentExport.exportId}`)
        const task = response.data

        if (task.status === 'completed') {
          exportStore.completeExport(task.id, task.download_url)
          clearInterval(interval)
        } else if (task.status === 'failed') {
          exportStore.failExport(task.id, task.error)
          clearInterval(interval)
        } else if (task.status === 'processing') {
          exportStore.updateProgress(task.id, task.progress, task.stage)
        }
      } catch (error) {
        console.error('轮询导出状态失败:', error)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [visible, view, currentExport?.exportId, exportStore])

  // Modal 标题根据状态动态变化
  const getModalTitle = () => {
    if (view === 'settings') return '导出视频'
    if (currentExport?.status === 'completed') return '导出完成！'
    if (currentExport?.status === 'error') return '导出失败'
    return '正在导出...'
  }

  // 处理 Modal 关闭
  const handleCancel = () => {
    if (currentExport?.status === 'processing') {
      message.warning('导出进行中，请等待完成或取消任务')
      return
    }
    exportStore.resetExport()
    setView('settings')
    form.resetFields()
    onCancel()
  }

  return (
    <Modal
      title={getModalTitle()}
      open={visible}
      onCancel={handleCancel}
      width={480}
      maskClosable={false}
      footer={null}
      destroyOnClose
      data-testid="export-modal"
    >
      {view === 'settings' ? (
        <Form
          form={form}
          layout="vertical"
          onValuesChange={handleFormChange}
          initialValues={{
            resolution: 'project',
            fps: 'project',
            quality: 4000,
          }}
        >
          <Form.Item label="分辨率" name="resolution" rules={[{ required: true, message: '请选择分辨率' }]}>
            <Select onChange={handleResolutionTypeChange}>
              {RESOLUTION_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {resolutionType === 'custom' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <Form.Item label="宽度" style={{ flex: 1 }}>
                <InputNumber
                  min={320}
                  max={7680}
                  value={customWidth}
                  onChange={(value) => setCustomWidth(value || 1920)}
                />
              </Form.Item>
              <Form.Item label="高度" style={{ flex: 1 }}>
                <InputNumber
                  min={240}
                  max={4320}
                  value={customHeight}
                  onChange={(value) => setCustomHeight(value || 1080)}
                />
              </Form.Item>
            </div>
          )}

          <Form.Item label="帧率" name="fps" rules={[{ required: true, message: '请选择帧率' }]}>
            <Select>
              {FPS_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="视频质量" name="quality" rules={[{ required: true, message: '请选择视频质量' }]}>
            <Select>
              {QUALITY_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="格式">
            <Select defaultValue="mp4" disabled>
              <Option value="mp4">MP4</Option>
            </Select>
          </Form.Item>

          <div style={{ marginBottom: 16 }}>
            <span style={{ color: '#666' }}>预计文件大小：</span>
            <span style={{ fontWeight: 500 }}>{estimatedSize} MB</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={handleCancel}>取消</Button>
            <Button
              type="primary"
              onClick={handleStartExport}
              loading={startExportMutation.isPending}
              data-testid="start-export-button"
            >
              开始导出
            </Button>
          </div>
        </Form>
      ) : (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Progress
            type="circle"
            percent={currentExport?.progress || 0}
            size={120}
            status={
              currentExport?.status === 'error'
                ? 'exception'
                : currentExport?.status === 'completed'
                  ? 'success'
                  : 'normal'
            }
            strokeColor={
              currentExport?.status === 'error'
                ? '#ff4d4f'
                : currentExport?.status === 'completed'
                  ? '#52c41a'
                  : '#1890ff'
            }
            data-testid="export-progress-bar"
          />

          <div style={{ marginTop: 16, marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 4 }}>
              {currentExport?.status === 'completed'
                ? '导出完成！'
                : currentExport?.status === 'error'
                  ? '导出失败'
                  : currentExport?.stage || '准备中...'}
            </div>
            {currentExport?.status === 'processing' && (
              <div style={{ color: '#666' }} data-testid="export-progress-text">
                进度：{currentExport.progress}%
              </div>
            )}
            {currentExport?.status === 'error' && currentExport.error && (
              <div style={{ color: '#ff4d4f', marginTop: 8 }}>{currentExport.error}</div>
            )}
          </div>

          {currentExport?.status === 'completed' && currentExport.downloadUrl && (
            <div style={{ marginBottom: 16 }}>
              <a href={currentExport.downloadUrl} download>
                <Button type="primary" size="large" data-testid="download-button">
                  立即下载
                </Button>
              </a>
            </div>
          )}

          <Space>
            {currentExport?.status === 'error' && <Button onClick={() => setView('settings')}>重试</Button>}
            <Button onClick={handleCancel}>{currentExport?.status === 'completed' ? '关闭' : '取消导出'}</Button>
          </Space>
        </div>
      )}
    </Modal>
  )
}

export default ExportModal
