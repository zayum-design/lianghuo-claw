import * as React from 'react'
import { useState, useEffect, useRef } from 'react'

import {
  UndoOutlined,
  RedoOutlined,
  ExportOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons'

import { Button, Typography, Input, message, Spin, Tooltip } from 'antd'

import { useTimelineSync } from '@/hooks/useTimelineSync'

import ExportModal from './ExportModal'

interface TopBarProps {
  projectId?: string
}

const { Text } = Typography

const TopBar: React.FC<TopBarProps> = ({ projectId }) => {
  const [projectName, setProjectName] = useState<string>('未命名项目')
  const [isEditing, setIsEditing] = useState<boolean>(false)
  const [exportModalVisible, setExportModalVisible] = useState<boolean>(false)
  const [lastSavedTime, setLastSavedTime] = useState<number | null>(null)

  const { isSaving, isError } = useTimelineSync(projectId)
  const prevIsSavingRef = useRef<boolean>(false)

  // 监听保存完成，记录时间戳
  useEffect(() => {
    if (prevIsSavingRef.current && !isSaving && !isError) {
      setLastSavedTime(Date.now())
    }
    prevIsSavingRef.current = isSaving
  }, [isSaving, isError])

  // 3秒后清除"已保存"状态
  useEffect(() => {
    if (!lastSavedTime) return

    const timer = setTimeout(() => {
      setLastSavedTime(null)
    }, 3000)

    return () => clearTimeout(timer)
  }, [lastSavedTime])

  const handleProjectNameChange = (value: string) => {
    if (value.trim() === '') {
      message.warning('项目名称不能为空')
      return
    }
    setProjectName(value)
    setIsEditing(false)
  }

  const handleExportClick = () => {
    setExportModalVisible(true)
  }

  // 保存状态显示
  const renderSaveStatus = () => {
    if (isSaving) {
      return (
        <div className="flex items-center text-gray-400">
          <Spin indicator={<LoadingOutlined style={{ fontSize: 12 }} spin />} size="small" />
          <span className="ml-1 text-xs">保存中...</span>
        </div>
      )
    }

    if (isError) {
      return (
        <Tooltip title="点击重试保存" placement="bottom">
          <div className="flex items-center text-red-400 cursor-pointer" onClick={() => window.location.reload()}>
            <ExclamationCircleOutlined style={{ fontSize: 12 }} />
            <span className="ml-1 text-xs">保存失败</span>
          </div>
        </Tooltip>
      )
    }

    if (lastSavedTime) {
      return (
        <div className="flex items-center text-gray-400">
          <CheckCircleOutlined style={{ fontSize: 12 }} />
          <span className="ml-1 text-xs">已保存</span>
        </div>
      )
    }

    return null
  }

  return (
    <>
      <div
        className="h-12 flex-shrink-0 bg-[#242424] border-b border-[#333333] flex items-center px-4"
        data-testid="top-bar"
      >
        {/* 左侧区域 */}
        <div className="flex items-center flex-1">
          {/* 由于 Logo SVG 可能不存在，暂时使用文字代替 */}
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 bg-blue-500 rounded"></div>
            <span className="text-white font-semibold text-lg">lianghuo</span>
          </div>
          <div className="h-4 w-px bg-[#333333] mx-4"></div>
          <div className="flex items-center">
            {isEditing ? (
              <Input
                size="small"
                defaultValue={projectName}
                onPressEnter={(e) => handleProjectNameChange(e.currentTarget.value)}
                onBlur={(e) => handleProjectNameChange(e.target.value)}
                autoFocus
                className="w-48"
              />
            ) : (
              <Text
                editable={{
                  onChange: handleProjectNameChange,
                  onStart: () => setIsEditing(true),
                }}
                className="text-white text-sm"
              >
                {projectName}
              </Text>
            )}
          </div>

          {/* 保存状态显示 */}
          <div className="ml-4">{renderSaveStatus()}</div>
        </div>

        {/* 中间区域 */}
        <div className="flex items-center space-x-2">
          <Button icon={<UndoOutlined />} size="small" disabled className="text-gray-400">
            撤销
          </Button>
          <Button icon={<RedoOutlined />} size="small" disabled className="text-gray-400">
            重做
          </Button>
        </div>

        {/* 右侧区域 */}
        <div className="flex items-center flex-1 justify-end">
          <Button type="primary" icon={<ExportOutlined />} onClick={handleExportClick} data-testid="export-button">
            导出
          </Button>
        </div>
      </div>

      <ExportModal visible={exportModalVisible} onCancel={() => setExportModalVisible(false)} />
    </>
  )
}

export default TopBar
