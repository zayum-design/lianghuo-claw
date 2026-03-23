import * as React from 'react'
import { useEffect, useRef, useState, useCallback } from 'react' // eslint-disable-line @typescript-eslint/no-unused-vars

import {
  StepBackwardOutlined,
  StepForwardOutlined,
  CaretRightFilled,
  PauseOutlined,
  SoundOutlined,
  MutedOutlined,
  FullscreenOutlined,
} from '@ant-design/icons'
import hotkeys from 'hotkeys-js'

import { Slider, Button } from 'antd'

import { useEditorStore } from '@/stores/editorStore'

// 格式化时间码为 HH:MM:SS:FF
const formatTimecode = (ms: number, fps: number = 30): string => {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const frames = Math.floor((ms % 1000) / (1000 / fps))

  const pad = (n: number, length: number = 2) => n.toString().padStart(length, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`
}

// 格式化简版时间（仅 HH:MM:SS）
const formatTimeSimple = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const pad = (n: number, length: number = 2) => n.toString().padStart(length, '0')
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${pad(minutes)}:${pad(seconds)}`
}

const PlayerControls: React.FC = () => {
  const { currentTimeMs, isPlaying, timeline, setCurrentTime, setIsPlaying, setVolume, volume, isMuted, toggleMute } =
    useEditorStore()

  const [isSeeking, setIsSeeking] = useState(false)
  const [seekPreviewMs, setSeekPreviewMs] = useState(0)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const seekbarRef = useRef<HTMLDivElement>(null)
  const volumeSliderRef = useRef<HTMLDivElement>(null)

  const fps = timeline?.fps || 30
  const durationMs = timeline?.duration_ms || 0

  // 播放/暂停
  const handlePlayPause = useCallback(() => {
    setIsPlaying(!isPlaying)
  }, [isPlaying, setIsPlaying])

  // 上一帧
  const handleStepBackward = useCallback(() => {
    if (isPlaying) return // 仅暂停状态有效
    const frameMs = 1000 / fps
    setCurrentTime(Math.max(0, currentTimeMs - frameMs))
  }, [isPlaying, fps, currentTimeMs, setCurrentTime])

  // 下一帧
  const handleStepForward = useCallback(() => {
    if (isPlaying) return // 仅暂停状态有效
    const frameMs = 1000 / fps
    setCurrentTime(Math.min(durationMs, currentTimeMs + frameMs))
  }, [isPlaying, fps, currentTimeMs, setCurrentTime, durationMs])

  // 音量变化
  const handleVolumeChange = (value: number) => {
    setVolume(value)
  }

  // 切换静音
  const handleToggleMute = useCallback(() => {
    toggleMute()
  }, [toggleMute])

  // 全屏
  const handleFullscreen = () => {
    const playerContainer = document.querySelector('.player-container')
    if (playerContainer && (playerContainer as any).requestFullscreen) {
      ;(playerContainer as any).requestFullscreen()
    }
  }

  // 进度条相关
  const calculateSeekPosition = (clientX: number): number => {
    if (!seekbarRef.current) return 0
    const rect = seekbarRef.current.getBoundingClientRect()
    const position = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(1, position)) * durationMs
  }

  const handleSeekbarMouseDown = (e: React.MouseEvent) => {
    setIsSeeking(true)
    const newTime = calculateSeekPosition(e.clientX)
    setSeekPreviewMs(newTime)

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const time = calculateSeekPosition(moveEvent.clientX)
      setSeekPreviewMs(time)
    }

    const handleMouseUp = () => {
      setIsSeeking(false)
      setCurrentTime(seekPreviewMs)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleSeekbarMouseMove = (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _event: React.MouseEvent
  ) => {
    if (!isSeeking) {
      // 显示预览 Tooltip
      // 实际实现中可能需要一个 Tooltip 组件，这里先省略
    }
  }

  // 快捷键绑定
  useEffect(() => {
    hotkeys('space', 'editor', (event) => {
      event.preventDefault()
      handlePlayPause()
    })

    hotkeys('left', 'editor', (event) => {
      if (!isPlaying) {
        event.preventDefault()
        handleStepBackward()
      }
    })

    hotkeys('right', 'editor', (event) => {
      if (!isPlaying) {
        event.preventDefault()
        handleStepForward()
      }
    })

    hotkeys('m', 'editor', (event) => {
      event.preventDefault()
      handleToggleMute()
    })

    // 清理
    return () => {
      hotkeys.unbind('space', 'editor')
      hotkeys.unbind('left', 'editor')
      hotkeys.unbind('right', 'editor')
      hotkeys.unbind('m', 'editor')
    }
  }, [
    isPlaying,
    fps,
    durationMs,
    currentTimeMs,
    handlePlayPause,
    handleStepBackward,
    handleStepForward,
    handleToggleMute,
  ])

  // 点击外部关闭音量滑块
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (volumeSliderRef.current && !volumeSliderRef.current.contains(event.target as Node)) {
        setShowVolumeSlider(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const displayMs = isSeeking ? seekPreviewMs : currentTimeMs
  const progressPercent = durationMs > 0 ? (displayMs / durationMs) * 100 : 0

  return (
    <div className="h-14 bg-[#242424] border-t border-[#333333] flex items-center px-4">
      {/* 左侧时间码 */}
      <div className="flex-shrink-0 w-32">
        <div className="text-white font-mono font-variant-numeric-tabular-nums">
          {formatTimecode(displayMs, fps)}
          <span className="text-gray-400 ml-1">/ {formatTimeSimple(durationMs)}</span>
        </div>
      </div>

      {/* 播放控制区 */}
      <div className="flex-1 flex items-center justify-center space-x-4">
        <Button
          type="text"
          icon={<StepBackwardOutlined />}
          onClick={handleStepBackward}
          disabled={isPlaying}
          className="text-white hover:text-blue-400"
        />

        <Button
          type="text"
          icon={isPlaying ? <PauseOutlined /> : <CaretRightFilled />}
          onClick={handlePlayPause}
          className="text-white hover:text-blue-400 text-xl"
        />

        <Button
          type="text"
          icon={<StepForwardOutlined />}
          onClick={handleStepForward}
          disabled={isPlaying}
          className="text-white hover:text-blue-400"
        />
      </div>

      {/* 进度条 */}
      <div className="flex-1 mx-8">
        <div
          ref={seekbarRef}
          className="relative h-2 bg-[#444444] rounded-full cursor-pointer"
          onMouseDown={handleSeekbarMouseDown}
          onMouseMove={handleSeekbarMouseMove}
        >
          {/* 缓冲进度（暂不实现） */}
          {/* <div className="absolute top-0 left-0 h-full bg-[#666666] rounded-full" style={{ width: `${bufferedPercent}%` }} /> */}

          {/* 播放进度 */}
          <div
            className="absolute top-0 left-0 h-full bg-[#00d4ff] rounded-full"
            style={{ width: `${progressPercent}%` }}
          />

          {/* 拖拽手柄 */}
          <div
            className="absolute top-1/2 w-3 h-3 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 shadow-md"
            style={{ left: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* 右侧控制区 */}
      <div className="flex-shrink-0 flex items-center space-x-4">
        {/* 音量控制 */}
        <div className="relative" ref={volumeSliderRef}>
          <Button
            type="text"
            icon={isMuted ? <MutedOutlined /> : <SoundOutlined />}
            onClick={handleToggleMute}
            onMouseEnter={() => setShowVolumeSlider(true)}
            className="text-white hover:text-blue-400"
          />

          {showVolumeSlider && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-[#333333] rounded-lg shadow-lg">
              <Slider
                vertical
                min={0}
                max={100}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="h-24"
                trackStyle={{ backgroundColor: '#00d4ff' }}
                railStyle={{ backgroundColor: '#444444' }}
              />
            </div>
          )}
        </div>

        {/* 全屏 */}
        <Button
          type="text"
          icon={<FullscreenOutlined />}
          onClick={handleFullscreen}
          className="text-white hover:text-blue-400"
        />
      </div>
    </div>
  )
}

export default PlayerControls
