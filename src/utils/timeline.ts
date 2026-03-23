import type { Clip, Track } from '@/types/timeline'

/**
 * 毫秒转像素
 * @param ms 毫秒
 * @param zoomLevel 缩放级别（每像素代表的毫秒数）
 * @returns 像素值
 */
export function msToPixels(ms: number, zoomLevel: number): number {
  return ms / zoomLevel
}

/**
 * 像素转毫秒
 * @param px 像素值
 * @param zoomLevel 缩放级别（每像素代表的毫秒数）
 * @returns 毫秒值
 */
export function pixelsToMs(px: number, zoomLevel: number): number {
  return px * zoomLevel
}

/**
 * 将毫秒对齐到最近的帧边界
 * @param ms 毫秒
 * @param fps 帧率
 * @returns 对齐后的毫秒值
 */
export function snapToFrame(ms: number, fps: number): number {
  const frameDuration = 1000 / fps
  return Math.round(ms / frameDuration) * frameDuration
}

/**
 * 格式化为 HH:MM:SS:FF 时间码字符串
 * @param ms 毫秒
 * @param fps 帧率
 * @returns 时间码字符串
 */
export function formatTimeCode(ms: number, fps: number): string {
  const totalSeconds = ms / 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const frames = Math.floor((ms % 1000) / (1000 / fps))
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`
}

/**
 * 格式化为 MM:SS 简短显示（用于素材时长标签）
 * @param ms 毫秒
 * @returns 时长字符串
 */
export function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/**
 * Clip 在时间线上的像素起始位置
 * @param clip Clip 对象
 * @param zoomLevel 缩放级别
 * @returns 像素起始位置
 */
export function getClipPixelLeft(clip: Clip, zoomLevel: number): number {
  return msToPixels(clip.timeline_start_ms, zoomLevel)
}

/**
 * Clip 的像素宽度
 * @param clip Clip 对象
 * @param zoomLevel 缩放级别
 * @returns 像素宽度
 */
export function getClipPixelWidth(clip: Clip, zoomLevel: number): number {
  return msToPixels(clip.duration_ms, zoomLevel)
}

/**
 * 查找指定时间点所在的 Clip
 * @param track 轨道
 * @param timeMs 时间点（毫秒）
 * @returns Clip 或 null
 */
export function findClipAtTime(track: Track, timeMs: number): Clip | null {
  for (const clip of track.clips) {
    if (timeMs >= clip.timeline_start_ms && timeMs < clip.timeline_start_ms + clip.duration_ms) {
      return clip
    }
  }
  return null
}

/**
 * 检测新 Clip 是否与现有 Clip 重叠
 * @param clips 现有 Clip 数组
 * @param newClip 新 Clip
 * @param excludeId 排除的 Clip ID（用于移动时排除自身）
 * @returns 是否重叠
 */
export function checkClipOverlap(clips: Clip[], newClip: Clip, excludeId?: string): boolean {
  for (const clip of clips) {
    if (excludeId && clip.id === excludeId) continue
    const clipStart = clip.timeline_start_ms
    const clipEnd = clipStart + clip.duration_ms
    const newStart = newClip.timeline_start_ms
    const newEnd = newStart + newClip.duration_ms
    // 检查是否有重叠
    if (newStart < clipEnd && newEnd > clipStart) {
      return true
    }
  }
  return false
}

/**
 * 计算指定时间在素材帧序列中的帧编号
 * @param ms 时间（毫秒）
 * @param asset_id 素材 ID（暂未使用，保留参数）
 * @param fps 帧率
 * @returns 帧编号
 */
export function getFrameIndexForMs(ms: number, _asset_id: string, fps: number): number {
  const frameDuration = 1000 / fps
  return Math.floor(ms / frameDuration)
}

/**
 * 计算整体时间线总时长
 * @param tracks 轨道数组
 * @returns 总时长（毫秒）
 */
export function calculateTimelineDuration(tracks: Track[]): number {
  let maxDuration = 0
  tracks.forEach((track) => {
    track.clips.forEach((clip) => {
      const clipEnd = clip.timeline_start_ms + clip.duration_ms
      if (clipEnd > maxDuration) {
        maxDuration = clipEnd
      }
    })
  })
  return maxDuration
}
