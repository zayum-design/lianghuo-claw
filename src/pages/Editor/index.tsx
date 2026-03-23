import * as React from 'react'
import { useState } from 'react'

import { DndContext, DragOverlay, DragStartEvent, DragEndEvent } from '@dnd-kit/core'

import AssetPanel from '@/components/Editor/AssetPanel'
import PlayerSection from '@/components/Editor/PlayerSection'
import PropertyPanel from '@/components/Editor/PropertyPanel'
import Timeline from '@/components/Editor/Timeline'
import TopBar from '@/components/Editor/TopBar'

const EditorPage: React.FC = () => {
  const [activeDragData, setActiveDragData] = useState<any>(null)

  const handleDragStart = (event: DragStartEvent) => {
    console.log('Drag start:', event.active.data.current)
    setActiveDragData(event.active.data.current)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    console.log('Drag end:', event.active.data.current, event.over)
    setActiveDragData(null)
  }

  const handleDragCancel = () => {
    console.log('Drag cancelled')
    setActiveDragData(null)
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      <div className="h-screen flex flex-col overflow-hidden bg-[#1a1a1a] select-none">
        {/* 顶部工具栏 */}
        <TopBar />

        {/* 主内容区域 */}
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧素材面板 */}
          <AssetPanel />

          {/* 工作区域 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 预览区域 */}
            <div className="flex-1 flex overflow-hidden">
              {/* 播放器区域 */}
              <PlayerSection />
              {/* 属性面板 */}
              <PropertyPanel />
            </div>

            {/* 时间线区域 */}
            <Timeline />
          </div>
        </div>
      </div>

      {/* 拖拽覆盖层 */}
      <DragOverlay>
        {activeDragData && (
          <div className="w-32 opacity-60 pointer-events-none">
            <div className="relative bg-[#1a1a1a] rounded-lg overflow-hidden shadow-lg">
              <div style={{ paddingTop: '56.25%' }}>
                <div className="absolute inset-0">
                  {activeDragData.thumbnailUrl ? (
                    <img
                      src={activeDragData.thumbnailUrl}
                      alt={activeDragData.assetName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-blue-900/30 to-purple-900/30 flex items-center justify-center">
                      <span className="text-gray-400 text-sm">素材</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-2 truncate">
                {activeDragData.assetName}
              </div>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

export default EditorPage
