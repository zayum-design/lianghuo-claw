/* eslint-disable import/default, import/no-unresolved */
import React, { useEffect, useRef, useState, useCallback } from 'react'

import { Stage, Layer, Rect, Line, Text, Group, Image } from 'react-konva'

import { useEditorStore } from '@/stores/editorStore'
import { frameCache } from '@/utils/frameCache'
import {
  msToPixels,
  pixelsToMs,
  snapToFrame,
  formatDuration,
  getClipPixelLeft,
  getClipPixelWidth,
  getFrameIndexForMs,
} from '@/utils/timeline'

import type { Track, Clip } from '@/types/timeline'

// 刻度间隔档位（毫秒）
const TICK_INTERVALS = [100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000]

interface TimelineCanvasProps {
  /** 时间线容器宽度（由父组件提供） */
  width: number
  /** 时间线容器高度（由父组件提供） */
  height: number
  /** 滚动水平偏移（像素） */
  scrollLeft: number
  /** 滚动回调 */
  onScrollLeftChange: (scrollLeft: number) => void
  /** 插入位置指示器（素材拖拽悬停时显示） */
  insertPosition?: {
    /** 相对于可见区域的 x 坐标（已减去 scrollLeft） */
    x: number
    /** 对应的时间（毫秒） */
    timeMs: number
  } | null
}

/**
 * 时间线 Canvas 渲染组件
 * 使用 Konva.js 实现时间线可视化渲染
 */
export const TimelineCanvas: React.FC<TimelineCanvasProps> = ({
  width,
  height,
  scrollLeft,
  onScrollLeftChange,
  insertPosition = null,
}) => {
  const editorStore = useEditorStore()
  const stageRef = useRef<any>(null)
  const playheadLayerRef = useRef<any>(null)
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false)

  const timeline = editorStore.timeline
  const currentTimeMs = editorStore.currentTimeMs
  const zoomLevel = editorStore.zoomLevel
  const selectedClipId = editorStore.selectedClipId
  const snapEnabled = editorStore.snapEnabled

  // 如果没有时间线数据，显示空状态
  const isEmpty = !timeline

  const fps = timeline?.fps || 30
  const tracks = timeline?.tracks || []

  // 计算刻度尺高度
  const RULER_HEIGHT = 32
  const BOTTOM_PADDING = 8

  // 计算轨道位置
  const calculateTrackPositions = () => {
    const positions: Array<{ track: Track; y: number }> = []
    let currentY = RULER_HEIGHT

    for (const track of tracks) {
      positions.push({
        track,
        y: currentY,
      })
      currentY += track.height_px
    }

    return positions
  }

  const trackPositions = calculateTrackPositions()

  // 计算刻度间隔
  const calculateTickInterval = () => {
    const targetPixelSpacing = 100 // 目标像素间距
    for (const interval of TICK_INTERVALS) {
      const pixelSpacing = interval / zoomLevel
      if (pixelSpacing >= targetPixelSpacing) {
        return interval
      }
    }
    return TICK_INTERVALS[TICK_INTERVALS.length - 1]
  }

  const tickInterval = calculateTickInterval()

  // 渲染刻度尺
  const renderRuler = () => {
    const visibleStartMs = pixelsToMs(scrollLeft, zoomLevel)
    const visibleEndMs = pixelsToMs(scrollLeft + width, zoomLevel)

    const startTick = Math.floor(visibleStartMs / tickInterval) * tickInterval
    const endTick = Math.ceil(visibleEndMs / tickInterval) * tickInterval

    const ticks = []
    const subTickCount = 5

    for (let ms = startTick; ms <= endTick; ms += tickInterval) {
      const x = msToPixels(ms, zoomLevel) - scrollLeft

      // 主刻度线
      ticks.push(<Line key={`tick-${ms}`} points={[x, 0, x, 16]} stroke="#666666" strokeWidth={1} />)

      // 时间标签
      if (x >= 0 && x <= width) {
        ticks.push(<Text key={`label-${ms}`} x={x + 4} y={2} text={formatDuration(ms)} fontSize={12} fill="#999999" />)
      }

      // 次刻度线
      const subTickInterval = tickInterval / subTickCount
      for (let i = 1; i < subTickCount; i++) {
        const subMs = ms + i * subTickInterval
        const subX = msToPixels(subMs, zoomLevel) - scrollLeft
        if (subX >= 0 && subX <= width) {
          ticks.push(<Line key={`subtick-${ms}-${i}`} points={[subX, 0, subX, 8]} stroke="#444444" strokeWidth={1} />)
        }
      }
    }

    return ticks
  }

  // 渲染轨道背景
  const renderTrackBackgrounds = () => {
    return trackPositions.map(({ track, y }, index) => (
      <Group key={`track-bg-${track.id}`}>
        <Rect x={0} y={y} width={width} height={track.height_px} fill={index % 2 === 0 ? '#1e1e1e' : '#1a1a1a'} />
        <Line points={[0, y + track.height_px, width, y + track.height_px]} stroke="#333333" strokeWidth={1} />
      </Group>
    ))
  }

  // 渲染帧序列缩略图
  const renderFrameThumbnails = (
    clip: Clip,
    clipWidth: number,
    clipHeight: number,
    trackHeight: number,
    fps: number
  ) => {
    // 计算帧缩略图宽度（保持 16:9 宽高比）
    const frameWidth = (trackHeight * 16) / 9
    if (frameWidth <= 0 || clipWidth <= 8) return null

    // 计算可显示的帧数
    const maxFrames = Math.max(1, Math.floor((clipWidth - 8) / frameWidth))
    const frames: React.ReactNode[] = []

    for (let i = 0; i < maxFrames; i++) {
      // 在 Clip 内的相对位置（0到1）
      const clipProgress = i / maxFrames
      // 在 Clip 内的时间（毫秒）
      const clipTimeMs = clipProgress * clip.duration_ms
      // 在源素材中的时间（考虑速度）
      const sourceTimeMs = clip.source_start_ms + clipTimeMs * clip.speed
      // 计算帧索引
      const frameIndex = getFrameIndexForMs(sourceTimeMs, clip.asset_id, fps)

      // 尝试从缓存获取图片
      const cachedImage = frameCache.get(clip.asset_id, frameIndex)

      // 帧在 Clip 内的 x 位置
      const frameX = 4 + i * frameWidth

      frames.push(
        <Image
          key={`frame-${clip.id}-${i}`}
          x={frameX}
          y={4}
          width={frameWidth}
          height={clipHeight - 28} // 减去上下边距
          image={cachedImage || undefined}
          // 如果没有缓存的图片，设置占位符颜色并触发异步加载
          fill={cachedImage ? undefined : '#2a2a2a'}
          cornerRadius={2}
          onMouseDown={(e) => {
            // 阻止事件冒泡，避免触发 Clip 拖拽
            e.cancelBubble = true
          }}
        />
      )

      // 如果图片未缓存，触发异步加载
      if (!cachedImage) {
        frameCache.preloadFrame(clip.asset_id, frameIndex).catch(() => {
          // 加载失败，保持占位符状态
        })
      }
    }

    return frames
  }

  // 渲染 Clip 块
  const renderClips = () => {
    const clips: React.ReactNode[] = []

    for (const { track, y } of trackPositions) {
      for (const clip of track.clips) {
        const clipX = getClipPixelLeft(clip, zoomLevel) - scrollLeft
        const clipWidth = getClipPixelWidth(clip, zoomLevel)

        // 只渲染可见区域的 Clip
        if (clipX + clipWidth < 0 || clipX > width) {
          continue
        }

        const isSelected = clip.id === selectedClipId
        const clipHeight = track.height_px - 4
        const clipY = y + 2

        clips.push(
          <Group
            key={`clip-${clip.id}`}
            x={clipX}
            y={clipY}
            width={clipWidth}
            height={clipHeight}
            clipX={0}
            clipY={0}
            clipWidth={clipWidth}
            clipHeight={clipHeight}
          >
            {/* Clip 背景 */}
            <Rect
              width={clipWidth - 4}
              height={clipHeight}
              cornerRadius={4}
              fill={isSelected ? '#40a9ff' : '#1890ff'}
              stroke={isSelected ? '#ffffff' : undefined}
              strokeWidth={isSelected ? 2 : 0}
            />

            {/* 帧序列缩略图 */}
            {renderFrameThumbnails(clip, clipWidth, clipHeight, track.height_px, fps)}

            {/* 素材名称 */}
            <Text
              x={8}
              y={clipHeight - 20}
              text={`Clip ${clip.id.slice(0, 8)}`}
              fontSize={12}
              fill="#ffffff"
              width={clipWidth - 16}
              ellipsis
            />

            {/* 左侧调整手柄 */}
            <Rect
              x={0}
              y={0}
              width={8}
              height={clipHeight}
              fill="rgba(0, 0, 0, 0.5)"
              onMouseEnter={(e) => {
                const stage = e.target.getStage()
                if (stage) {
                  stage.container().style.cursor = 'col-resize'
                }
              }}
              onMouseLeave={(e) => {
                const stage = e.target.getStage()
                if (stage && !isDraggingPlayhead) {
                  stage.container().style.cursor = 'default'
                }
              }}
            />

            {/* 右侧调整手柄 */}
            <Rect
              x={clipWidth - 8}
              y={0}
              width={8}
              height={clipHeight}
              fill="rgba(0, 0, 0, 0.5)"
              onMouseEnter={(e) => {
                const stage = e.target.getStage()
                if (stage) {
                  stage.container().style.cursor = 'col-resize'
                }
              }}
              onMouseLeave={(e) => {
                const stage = e.target.getStage()
                if (stage && !isDraggingPlayhead) {
                  stage.container().style.cursor = 'default'
                }
              }}
            />
          </Group>
        )
      }
    }

    return clips
  }

  // 渲染播放头
  const renderPlayhead = () => {
    const playheadX = msToPixels(currentTimeMs, zoomLevel) - scrollLeft

    return (
      <Group>
        {/* 播放头竖线 */}
        <Line points={[playheadX, RULER_HEIGHT, playheadX, height - BOTTOM_PADDING]} stroke="#ff4d4f" strokeWidth={2} />
        {/* 顶部三角形标记 */}
        <Line
          points={[playheadX - 6, 8, playheadX, 0, playheadX + 6, 8]}
          closed
          fill="#ff4d4f"
          onMouseDown={(e) => {
            setIsDraggingPlayhead(true)
            const stage = e.target.getStage()
            if (stage) {
              stage.container().style.cursor = 'col-resize'
            }
          }}
        />
      </Group>
    )
  }

  // 渲染插入位置指示器
  const renderInsertPosition = () => {
    if (!insertPosition) return null

    return (
      <Group>
        {/* 插入位置竖线（蓝色半透明） */}
        <Line
          points={[insertPosition.x, RULER_HEIGHT, insertPosition.x, height - BOTTOM_PADDING]}
          stroke="#40a9ff"
          strokeWidth={2}
          opacity={0.7}
        />
        {/* 顶部三角形标记 */}
        <Line
          points={[insertPosition.x - 6, 8, insertPosition.x, 0, insertPosition.x + 6, 8]}
          closed
          fill="#40a9ff"
          opacity={0.7}
        />
      </Group>
    )
  }

  // 处理鼠标滚轮事件
  const handleWheel = useCallback(
    (e: any) => {
      e.evt.preventDefault()
      const stage = e.target.getStage()
      if (!stage) return

      const isZoom = e.evt.ctrlKey || e.evt.metaKey

      if (isZoom) {
        // 缩放：以鼠标位置为锚点
        const mouseX = e.evt.clientX - stage.container().getBoundingClientRect().left
        const mouseTime = pixelsToMs(mouseX + scrollLeft, zoomLevel)
        const zoomDelta = e.evt.deltaY > 0 ? 0.9 : 1.1
        const newZoom = Math.max(0.005, Math.min(1, zoomLevel * zoomDelta))

        // 计算新的滚动位置以保持鼠标下的时间点不变
        const newMouseX = msToPixels(mouseTime, newZoom)
        const newScrollLeft = newMouseX - mouseX
        onScrollLeftChange(Math.max(0, newScrollLeft))
        editorStore.setZoomLevel(newZoom)
      } else {
        // 横向滚动
        const newScrollLeft = scrollLeft + e.evt.deltaY * 40
        onScrollLeftChange(Math.max(0, newScrollLeft))
      }
    },
    [zoomLevel, scrollLeft, onScrollLeftChange, editorStore]
  )

  // 处理鼠标移动事件（播放头拖拽）
  useEffect(() => {
    if (!isDraggingPlayhead) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!stageRef.current) return

      const stage = stageRef.current
      const rect = stage.container().getBoundingClientRect()
      const mouseX = e.clientX - rect.left + scrollLeft
      const mouseTime = pixelsToMs(mouseX, zoomLevel)
      const snappedTime = snapEnabled ? snapToFrame(mouseTime, fps) : mouseTime
      editorStore.setCurrentTime(snappedTime)
    }

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false)
      if (stageRef.current) {
        stageRef.current.container().style.cursor = 'default'
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingPlayhead, scrollLeft, zoomLevel, snapEnabled, fps, editorStore])

  // 更新播放头位置
  useEffect(() => {
    if (!playheadLayerRef.current || !stageRef.current) return

    const playheadX = msToPixels(currentTimeMs, zoomLevel) - scrollLeft
    const playheadNode = playheadLayerRef.current.children?.[0]?.children?.[0]
    const triangleNode = playheadLayerRef.current.children?.[0]?.children?.[1]

    if (playheadNode && triangleNode) {
      playheadNode.points([playheadX, RULER_HEIGHT, playheadX, height - BOTTOM_PADDING])
      triangleNode.points([playheadX - 6, 8, playheadX, 0, playheadX + 6, 8])
      playheadLayerRef.current.batchDraw()
    }
  }, [currentTimeMs, zoomLevel, scrollLeft, height])

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-[#1a1a1a] text-gray-500">加载时间线数据...</div>
    )
  }

  return (
    <Stage ref={stageRef} width={width} height={height} onWheel={handleWheel} style={{ backgroundColor: '#1a1a1a' }}>
      {/* 背景层：轨道背景 */}
      <Layer listening={false}>{renderTrackBackgrounds()}</Layer>

      {/* Clip 层：所有 Clip 块 */}
      <Layer listening={true}>{renderClips()}</Layer>

      {/* 刻度尺层：始终在最顶部 */}
      <Layer listening={false}>
        {/* 刻度尺背景 */}
        <Rect x={0} y={0} width={width} height={RULER_HEIGHT} fill="#2a2a2a" />
        {renderRuler()}
      </Layer>

      {/* 插入位置指示器层 */}
      <Layer listening={false}>{renderInsertPosition()}</Layer>

      {/* 播放头层：独立高频更新 */}
      <Layer ref={playheadLayerRef} listening={true}>
        {renderPlayhead()}
      </Layer>
    </Stage>
  )
}
