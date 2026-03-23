import * as React from 'react'

import { Empty } from 'antd'

const PropertyPanel: React.FC = () => {
  return (
    <div className="w-60 flex-shrink-0 h-full bg-[#242424] border-l border-[#333333] flex flex-col">
      {/* 标题栏 */}
      <div className="h-10 px-4 border-b border-[#333333] flex items-center">
        <span className="text-white font-medium">属性</span>
      </div>

      {/* 内容区 */}
      <div className="flex-1 p-4">
        <Empty
          description="请选中时间线上的片段"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          className="h-full flex flex-col items-center justify-center"
        />
      </div>
    </div>
  )
}

export default PropertyPanel
