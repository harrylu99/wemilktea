import React from 'react'
import { Tag } from '../../ui/misc'
import Blocks from './Blocks'

const Store = () => {
  return (
    <div className='home_stores_wrapper'>
      <div className='container'>
        <Tag bck='#0e1731' size='50px' color='#ffffff'>
          Top Pick Store
        </Tag>

        <Blocks />

        <Tag
          bck='#ffffff'
          size='22px'
          color='#0e1731'
          link={true}
          linkto='/findStore'
        >
          FIND MORE STORE
        </Tag>
      </div>
    </div>
  )
}

export default Store
