import React from 'react'
import Zoom from 'react-reveal/Zoom'
import Milktea from '../../../../Resources/images/logos/wemilktea_logo.gif'

const PromotionAnimation = () => {
  return (
    <div className='promotion_animation'>
      <div className='left'>
        <Zoom>
          <div className='first'>
            <span>Get Your Chance to Win a</span>
          </div>
          <div className='second'>
            <span>Free Milktea</span>
          </div>
        </Zoom>
      </div>
      <div className='right'>
        <Zoom>
          <div style={{ background: `url(${Milktea}) no-repeat` }} />
        </Zoom>
      </div>
    </div>
  )
}

export default PromotionAnimation
