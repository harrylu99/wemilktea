import React from 'react'

const StoresBlock = ({ store }) => {
  return (
    <div className='store_block'>
      <div className='store_review'>
        {`Google Review: ${store.googlereview}`}
      </div>
      <div className='store_wrapper'>
        <div className='store_top'>
          <div className='left'>
            <div className='top_pick'>
              <a href={store.locationlink} target='blank'>
                {store.storename}
              </a>
            </div>
          </div>
        </div>
        <div className='store_bottom'>
          <div className='left'>
            <div className='top_pick'>
              🧋 Top pick drink
              <br />
              {store.bestpick}
            </div>
          </div>
          <div className='right'>
            Open hour
            <br />
            {store.opentime}
          </div>
        </div>
      </div>
    </div>
  )
}

export default StoresBlock
