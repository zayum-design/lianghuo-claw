import * as React from 'react'
import { useEffect, useRef, useState } from 'react'

import videojs from 'video.js'
import 'video.js/dist/video-js.css'

import { Spin } from 'antd'

import { useTimelinePlayback } from '@/hooks/useTimelinePlayback'
import { useEditorStore } from '@/stores/editorStore'

const VideoPlayer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<videojs.Player | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const prevClipIdRef = useRef<string>('')

  const { currentTimeMs, isPlaying, setCurrentTime, setIsPlaying } = useEditorStore()
  const { currentClip, streamUrl, isLoadingStream } = useTimelinePlayback()

  // 初始化 Video.js
  useEffect(() => {
    if (!videoRef.current) return

    const options: videojs.PlayerOptions = {
      controls: false,
      preload: 'auto',
      fluid: false,
      fill: true,
      responsive: false,
      // 禁用默认右键菜单
      userActions: {
        hotkeys: false,
      },
    }

    const player = videojs(videoRef.current, options)
    playerRef.current = player

    // 监听 Video.js 事件
    player.on('timeupdate', () => {
      const timeSec = player.currentTime()
      setCurrentTime(timeSec * 1000) // 转为毫秒
    })

    player.on('play', () => {
      setIsPlaying(true)
    })

    player.on('pause', () => {
      setIsPlaying(false)
    })

    player.on('ended', () => {
      // 触发片段切换逻辑（后续在 useTimelinePlayback 中实现）
      console.log('video ended, should switch to next clip')
    })

    player.on('waiting', () => {
      setIsLoading(true)
    })

    player.on('canplay', () => {
      setIsLoading(false)
    })

    // 清理函数
    return () => {
      if (player && !player.isDisposed()) {
        player.dispose()
        playerRef.current = null
      }
    }
  }, [setCurrentTime, setIsPlaying])

  // 监听外部 currentTimeMs 变化（非播放器自身触发时跳转）
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    // 简单防抖：避免播放器 timeupdate 事件触发循环
    const playerTimeSec = player.currentTime() * 1000
    if (Math.abs(playerTimeSec - currentTimeMs) > 50) {
      // 差异大于 50ms 才跳转
      player.currentTime(currentTimeMs / 1000)
    }
  }, [currentTimeMs])

  // 监听播放状态变化
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    if (isPlaying && player.paused()) {
      player.play().catch(console.error)
    } else if (!isPlaying && !player.paused()) {
      player.pause()
    }
  }, [isPlaying])

  // 切换视频源（Clip 变化或 streamUrl 变化）
  useEffect(() => {
    const player = playerRef.current
    if (!player || !streamUrl || !currentClip) return

    const clipId = currentClip.id
    if (prevClipIdRef.current === clipId) {
      // 同一个 Clip，不需要切换源
      return
    }

    console.log(`Switching to clip ${clipId}, source start: ${currentClip.source_start_ms}ms`)

    // 切换视频源
    player.src({ src: streamUrl, type: 'video/mp4' })

    // 等待视频加载后跳转到 Clip 入点
    const onLoadedMetadata = () => {
      player.currentTime(currentClip.source_start_ms / 1000)
      player.off('loadedmetadata', onLoadedMetadata)
    }

    player.on('loadedmetadata', onLoadedMetadata)

    // 切换到新视频后暂停（除非正在播放）
    if (!isPlaying) {
      player.pause()
    }

    prevClipIdRef.current = clipId
  }, [streamUrl, currentClip, isPlaying])

  // 如果没有当前 Clip，显示占位符
  if (!currentClip) {
    return (
      <div className="relative w-full h-full bg-black">
        <div className="relative w-full h-0 pb-[56.25%]">
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center">
            <div className="text-gray-500 text-lg">请将素材拖拽到时间线</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full bg-black">
      {/* 播放器容器，保持 16:9 宽高比 */}
      <div className="relative w-full h-0 pb-[56.25%]">
        <video
          ref={videoRef}
          className="video-js absolute top-0 left-0 w-full h-full"
          playsInline
          crossOrigin="anonymous"
        />
        {/* 字幕预览层容器（后续 Task 使用） */}
        <div id="subtitle-overlay" className="absolute top-0 left-0 w-full h-full pointer-events-none" />
        {/* Loading 蒙层 */}
        {(isLoading || isLoadingStream) && (
          <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black/70">
            <Spin size="large" />
          </div>
        )}
      </div>
    </div>
  )
}

export default VideoPlayer
