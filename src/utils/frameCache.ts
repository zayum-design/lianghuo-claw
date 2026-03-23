/**
 * 帧缩略图 LRU 缓存
 * 当前使用封面缩略图作为占位符，为帧序列预留接口
 * 容量上限：300 个条目
 */

export interface FrameCacheEntry {
  image: HTMLImageElement
  url: string
  timestamp: number
}

class FrameCache {
  private cache: Map<string, FrameCacheEntry>
  private maxSize: number
  private minioPublicEndpoint: string

  constructor(maxSize: number = 300, minioPublicEndpoint: string = 'http://localhost:9000') {
    this.cache = new Map()
    this.maxSize = maxSize
    this.minioPublicEndpoint = minioPublicEndpoint
  }

  /**
   * 获取帧缩略图
   * @param assetId 素材 ID
   * @param frameIndex 帧索引（当前未使用，为帧序列预留）
   * @returns HTMLImageElement 或 null
   */
  get(assetId: string, frameIndex: number = 0): HTMLImageElement | null {
    const key = this.getCacheKey(assetId, frameIndex)
    const entry = this.cache.get(key)
    if (entry) {
      // 更新访问时间（移到最近使用）
      this.cache.delete(key)
      this.cache.set(key, { ...entry, timestamp: Date.now() })
      return entry.image
    }
    return null
  }

  /**
   * 设置帧缩略图
   * @param assetId 素材 ID
   * @param frameIndex 帧索引（当前未使用，为帧序列预留）
   * @param image HTMLImageElement
   * @param url 图片 URL
   */
  set(assetId: string, frameIndex: number, image: HTMLImageElement, url: string): void {
    const key = this.getCacheKey(assetId, frameIndex)
    this.cache.set(key, {
      image,
      url,
      timestamp: Date.now(),
    })

    // 如果超出容量，删除最旧的条目
    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }
  }

  /**
   * 检查缓存中是否存在
   * @param assetId 素材 ID
   * @param frameIndex 帧索引
   * @returns boolean
   */
  has(assetId: string, frameIndex: number = 0): boolean {
    return this.cache.has(this.getCacheKey(assetId, frameIndex))
  }

  /**
   * 删除缓存条目
   * @param assetId 素材 ID
   * @param frameIndex 帧索引
   */
  delete(assetId: string, frameIndex: number = 0): void {
    this.cache.delete(this.getCacheKey(assetId, frameIndex))
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size
  }

  /**
   * 预加载封面缩略图
   * @param assetId 素材 ID
   * @param thumbnailUrl 封面缩略图 URL（可选，若不提供则使用默认路径生成）
   * @returns Promise<HTMLImageElement>
   */
  async preloadCoverThumbnail(assetId: string, thumbnailUrl?: string): Promise<HTMLImageElement> {
    // 检查是否已缓存
    if (this.has(assetId, 0)) {
      const cached = this.get(assetId, 0)
      if (cached) return cached
    }

    // 生成或使用提供的 URL
    const url = thumbnailUrl || this.getFrameUrl(assetId, 0)

    // 加载图片
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        this.set(assetId, 0, img, url)
        resolve(img)
      }
      img.onerror = reject
      img.src = url
    })
  }

  /**
   * 批量预加载封面缩略图
   * @param assets 素材数组，包含 id 和可选的 thumbnail_url
   */
  async preloadMultipleCovers(assets: Array<{ id: string; thumbnail_url?: string }>): Promise<void> {
    const promises = assets.map((asset) => this.preloadCoverThumbnail(asset.id, asset.thumbnail_url))
    await Promise.allSettled(promises)
  }

  /**
   * 预加载帧序列缩略图
   * @param assetId 素材 ID
   * @param frameIndex 帧索引（>0）
   * @returns Promise<HTMLImageElement>
   */
  async preloadFrame(assetId: string, frameIndex: number): Promise<HTMLImageElement> {
    // 检查是否已缓存
    if (this.has(assetId, frameIndex)) {
      const cached = this.get(assetId, frameIndex)
      if (cached) return cached
    }

    const url = this.getFrameUrl(assetId, frameIndex)

    // 加载图片
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        this.set(assetId, frameIndex, img, url)
        resolve(img)
      }
      img.onerror = reject
      img.src = url
    })
  }

  /**
   * 批量预加载帧序列
   * @param frames 帧数组，包含 assetId 和 frameIndex
   */
  async preloadFrames(frames: Array<{ assetId: string; frameIndex: number }>): Promise<void> {
    const promises = frames.map(({ assetId, frameIndex }) => this.preloadFrame(assetId, frameIndex))
    await Promise.allSettled(promises)
  }

  /**
   * 生成帧序列图片 URL
   * @param assetId 素材 ID
   * @param frameIndex 帧索引（0为封面，>0为帧序列）
   * @returns 完整图片 URL
   */
  getFrameUrl(assetId: string, frameIndex: number = 0): string {
    if (frameIndex === 0) {
      // 封面缩略图路径：Lianghuo-thumbnails/{asset_id}/cover.jpg
      return `${this.minioPublicEndpoint}/Lianghuo-thumbnails/${assetId}/cover.jpg`
    }
    // 帧序列路径：Lianghuo-thumbnails/{asset_id}/frames/frame_{04d}.jpg
    const paddedIndex = frameIndex.toString().padStart(4, '0')
    return `${this.minioPublicEndpoint}/Lianghuo-thumbnails/${assetId}/frames/frame_${paddedIndex}.jpg`
  }

  /**
   * 生成缓存键
   * @private
   */
  private getCacheKey(assetId: string, frameIndex: number): string {
    // 帧索引为0时使用封面，否则使用帧序列
    if (frameIndex === 0) {
      return `${assetId}:cover`
    }
    return `${assetId}:${frameIndex}`
  }
}

// 导出单例实例
export const frameCache = new FrameCache()

// 导出类型和类，便于测试
export { FrameCache }
