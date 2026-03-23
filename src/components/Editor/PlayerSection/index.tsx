import * as React from 'react'

const PlayerSection: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col bg-[#1a1a1a]">
      {/* 播放器画面区域 */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="relative w-full max-w-[960px] aspect-video bg-black rounded-lg flex items-center justify-center">
          <div className="text-gray-500 text-lg">视频预览区</div>
        </div>
      </div>

      {/* 控制栏区域 */}
      <div className="h-14 bg-[#242424] border-t border-[#333333] flex items-center justify-center">
        <div className="text-gray-500 text-sm">播放控制栏（后续实现）</div>
      </div>
    </div>
  )
}

export default PlayerSection
