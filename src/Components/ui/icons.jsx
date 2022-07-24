import React from 'react'
import { Link } from 'react-router-dom'
import wemilketeaLogo from '../../Resources/images/logos/wemilktea_logo.gif'

export const WebsiteLogo = (props) => {
  const template = (
    <div
      className='img_cover'
      style={{
        width: props.width,
        height: props.height,
        background: `url(${wemilketeaLogo}) no-repeat`
      }}
    />
  )

  if (props.link) {
    return (
      <Link to={props.linkTo} className='link_logo'>
        {template}
      </Link>
    )
  } else {
    return template
  }
}
