import * as React from 'react'
import { useState, useCallback } from 'react'

import { DndContext, DragOverlay, DragStartEvent, DragEndEvent } from '@dnd-kit/core'

import { message } from 'antd'

import AssetPanel from '@/components/Editor/AssetPanel'
import PlayerSection from '@/components/Editor/PlayerSection'
import PropertyPanel from '@/components/Editor/PropertyPanel'
import Timeline from '@/components/Editor/Timeline'
import TopBar from '@/components/Editor/TopBar'
import { useEditorStore } from '@/stores/editorStore'
import { generateId } from '@/utils/id'

const EditorPage: React.FC = () => {
  const [activeDragData, setActiveDragData] = useState<any>(null)
  const [timelineDropZoneActive, setTimelineDropZoneActive] = useState(false)
  const [insertPosition, setInsertPosition] = useState<{ x: number; timeMs: number } | null>(null)

  const handleDragStart = (event: DragStartEvent) => {
    console.log('Drag start:', event.active.data.current)
    setActiveDragData(event.active.data.current)
    // 如果拖拽的是素材，启用时间线 drop zone
    if (event.active.data.current?.type === 'asset') {
      setTimelineDropZoneActive(true)
    }
  }

  const addClip = useEditorStore((state) => state.addClip)

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const dragData = event.active.data.current
      const dropTarget = event.over

      console.log('Drag end:', dragData, dropTarget)
      setActiveDragData(null)
      setTimelineDropZoneActive(false)

      // 如果是素材拖拽到时间线 drop zone
      if (dragData?.type === 'asset' && dropTarget?.id === 'timeline-drop-zone') {
        // 创建新的 Clip
        const clip: any = {
          id: generateId(),
          asset_id: dragData.assetId,
          timeline_start_ms: insertPosition?.timeMs || 0,
          source_start_ms: 0,
          source_end_ms: dragData.duration_ms || 10000, // 默认10秒
          duration_ms: dragData.duration_ms || 10000,
          speed: 1.0,
          volume: 1.0,
          filters: [],
        }

        // 获取当前时间线状态
        const currentTimeline = useEditorStore.getState().timeline

        // 添加到第一个视频轨道（或创建默认轨道）
        if (currentTimeline && currentTimeline.tracks.length > 0) {
          // 找到第一个视频轨道
          const videoTrack = currentTimeline.tracks.find((t: any) => t.type === 'video')
          const targetTrackId = videoTrack?.id || currentTimeline.tracks[0].id
          addClip(targetTrackId, clip)
          message.success('素材已添加到时间线')
        } else {
          message.error('时间线未初始化')
        }
      }
    },
    [addClip, insertPosition]
  )

  const handleDragCancel = () => {
    console.log('Drag cancelled')
    setActiveDragData(null)
    setTimelineDropZoneActive(false)
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
            <Timeline dropZoneActive={timelineDropZoneActive} onInsertPositionChange={setInsertPosition} />
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
