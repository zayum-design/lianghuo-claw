import * as React from 'react'

import PlayerControls from '../Player/PlayerControls'
import VideoPlayer from '../Player/VideoPlayer'

const PlayerSection: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col bg-[#1a1a1a] player-container">
      {/* 播放器画面区域 */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <div className="relative w-full max-w-[960px] aspect-video bg-black rounded-lg overflow-hidden">
          <VideoPlayer />
        </div>
      </div>

      {/* 控制栏区域 */}
      <PlayerControls />
    </div>
  )
}

export default PlayerSection
