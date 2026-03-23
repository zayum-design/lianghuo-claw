import * as React from 'react'
import { useRef, useEffect } from 'react'

import { useEditorStore } from '@/stores/editorStore'

const Timeline: React.FC = () => {
  const timelineHeight = useEditorStore((state) => state.timelineHeight)
  const setTimelineHeight = useEditorStore((state) => state.setTimelineHeight)
  const resizeHandleRef = useRef<HTMLDivElement>(null)
  const isResizingRef = useRef(false)

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

      {/* 轨道容器区域 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-500">时间线区域（后续实现）</div>
      </div>
    </div>
  )
}

export default Timeline
