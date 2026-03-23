import * as React from 'react'
import { useRef, useEffect, useState, useCallback } from 'react'

import { useDroppable } from '@dnd-kit/core'

import { useEditorStore } from '@/stores/editorStore'
import { pixelsToMs, snapToFrame } from '@/utils/timeline'

import { TimelineCanvas } from './TimelineCanvas'

interface TimelineProps {
  /** 是否启用 drop zone 的指针事件（拖拽素材时启用） */
  dropZoneActive?: boolean
  /** 插入位置变化回调（用于获取拖放位置） */
  onInsertPositionChange?: (position: { x: number; timeMs: number } | null) => void
}

const Timeline: React.FC<TimelineProps> = ({ dropZoneActive = false, onInsertPositionChange }) => {
  const timelineHeight = useEditorStore((state) => state.timelineHeight)
  const setTimelineHeight = useEditorStore((state) => state.setTimelineHeight)
  const resizeHandleRef = useRef<HTMLDivElement>(null)
  const isResizingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  // 更新容器尺寸
  useEffect(() => {
    const updateContainerSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        setContainerWidth(width)
        setContainerHeight(height)
      }
    }

    updateContainerSize()
    const resizeObserver = new ResizeObserver(updateContainerSize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // 处理鼠标移动事件（调整高度）
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return

      const newHeight = timelineHeight - e.movementY
      setTimelineHeight(newHeight)
    }

    const handleMouseUp = () => {
      isResizingRef.current = false
      document.body.style.cursor = 'default'
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [timelineHeight, setTimelineHeight])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  // 处理容器滚动
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollLeft(e.currentTarget.scrollLeft)
  }, [])

  // 透明 drop zone 用于接收素材拖放
  const { setNodeRef: setDropZoneRef, isOver } = useDroppable({
    id: 'timeline-drop-zone',
  })

  // 插入位置指示器
  const [insertPosition, setInsertPosition] = useState<{ x: number; timeMs: number } | null>(null)

  // 处理鼠标在 drop zone 上的移动
  const handleDropZoneMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dropZoneActive) return

      const rect = e.currentTarget.getBoundingClientRect()
      const localX = e.clientX - rect.left + scrollLeft // 考虑滚动偏移

      // 转换为时间
      const timeMs = pixelsToMs(localX, editorStore.getState().zoomLevel)
      const snappedTimeMs = editorStore.getState().snapEnabled
        ? snapToFrame(timeMs, editorStore.getState().timeline?.fps || 30)
        : timeMs

      setInsertPosition({
        x: localX - scrollLeft, // 相对于可见区域的x坐标
        timeMs: snappedTimeMs,
      })
    },
    [dropZoneActive, scrollLeft]
  )

  // 处理鼠标离开 drop zone
  const handleDropZoneMouseLeave = useCallback(() => {
    setInsertPosition(null)
  }, [])

  // 当 drop zone 变为非激活状态时清除指示器
  useEffect(() => {
    if (!dropZoneActive) {
      setInsertPosition(null)
    }
  }, [dropZoneActive])

  // 插入位置变化时通知父组件
  useEffect(() => {
    if (onInsertPositionChange) {
      onInsertPositionChange(insertPosition)
    }
  }, [insertPosition, onInsertPositionChange])

  return (
    <div
      className="w-full bg-[#1e1e1e] border-t border-[#333333] flex flex-col"
      style={{ height: `${timelineHeight}px` }}
    >
      {/* 拖拽手柄 */}
      <div
        ref={resizeHandleRef}
        className="h-1 w-full bg-[#333333] hover:bg-[#555555] cursor-row-resize flex items-center justify-center"
        onMouseDown={handleResizeStart}
      >
        <div className="w-8 h-0.5 bg-[#555555]"></div>
      </div>

      {/* 工具栏 */}
      <div className="h-9 bg-[#2a2a2a] border-b border-[#333333] flex items-center px-4">
        <span className="text-gray-400 text-sm">时间线工具栏</span>
      </div>

      {/* 轨道容器区域（可滚动） */}
      <div ref={containerRef} className="flex-1 overflow-auto relative" onScroll={handleScroll}>
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            minWidth: '100%',
            minHeight: '100%',
          }}
        >
          {/* Timeline Canvas */}
          {containerWidth > 0 && containerHeight > 0 && (
            <TimelineCanvas
              width={containerWidth}
              height={containerHeight}
              scrollLeft={scrollLeft}
              onScrollLeftChange={setScrollLeft}
              insertPosition={insertPosition}
            />
          )}

          {/* 透明 drop zone 覆盖整个 Canvas 区域 */}
          <div
            ref={setDropZoneRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: dropZoneActive ? 'auto' : 'none',
              backgroundColor: isOver ? 'rgba(64, 169, 255, 0.1)' : 'transparent',
              zIndex: 10,
            }}
            onMouseMove={handleDropZoneMouseMove}
            onMouseLeave={handleDropZoneMouseLeave}
          />
        </div>
      </div>
    </div>
  )
}

export default Timeline
