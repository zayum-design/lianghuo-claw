import * as React from 'react'
import { useState } from 'react'

import { UndoOutlined, RedoOutlined, ExportOutlined } from '@ant-design/icons'

import { Button, Typography, Input, message } from 'antd'

const { Text } = Typography

const TopBar: React.FC = () => {
  const [projectName, setProjectName] = useState<string>('未命名项目')
  const [isEditing, setIsEditing] = useState<boolean>(false)

  const handleProjectNameChange = (value: string) => {
    if (value.trim() === '') {
      message.warning('项目名称不能为空')
      return
    }
    setProjectName(value)
    setIsEditing(false)
  }

  const handleExportClick = () => {
    console.log('Export button clicked')
    // TODO: Task-14 实现导出功能
    message.info('导出功能将在后续任务中实现')
  }

  return (
    <div className="h-12 flex-shrink-0 bg-[#242424] border-b border-[#333333] flex items-center px-4">
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
        <Button type="primary" icon={<ExportOutlined />} onClick={handleExportClick}>
          导出
        </Button>
      </div>
    </div>
  )
}

export default TopBar
