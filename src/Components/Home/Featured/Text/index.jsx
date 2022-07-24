import React, { Component } from 'react'
import { easePolyOut } from 'd3-ease'
import Animate from 'react-move/Animate'
import DrikingMilktea from '../../../../Resources/images/drinkmilktea.png'

export default class Text extends Component {
  animateFirstLine = () => (
    <Animate
      show={true}
      start={{
        opacity: 0,
        x: 503,
        y: 450
      }}
      enter={{
        opacity: [1],
        x: [273],
        y: [450],
        timing: { duration: 500, ease: easePolyOut }
      }}>
      {({ opacity, x, y }) => {
        return (
          <div
            className='featured_first'
            style={{
              opacity,
              transform: `translate(${x}px,${y}px)`
            }}>
            We 💙
          </div>
        )
      }}
    </Animate>
  )

  animateSecondLine = () => (
    <Animate
      show={true}
      start={{
        opacity: 0,
        x: 503,
        y: 586
      }}
      enter={{
        opacity: [1],
        x: [273],
        y: [586],
        timing: { delay: 300, duration: 500, ease: easePolyOut }
      }}>
      {({ opacity, x, y }) => {
        return (
          <div
            className='featured_second'
            style={{
              opacity,
              transform: `translate(${x}px,${y}px)`
            }}>
            Milktea
          </div>
        )
      }}
    </Animate>
  )

  animateDrinking = () => (
    <Animate
      show={true}
      start={{
        opacity: 0
      }}
      enter={{
        opacity: [1],
        timing: { delay: 800, duration: 500, ease: easePolyOut }
      }}>
      {({ opacity, x, y }) => {
        return (
          <div
            className='featured_drinking'
            style={{
              opacity,
              background: `url(${DrikingMilktea})`,
              transform: `translate(620px,201px)`
            }}></div>
        )
      }}
    </Animate>
  )

  render() {
    return (
      <div className='featured_text'>
        {this.animateFirstLine()}
        {this.animateSecondLine()}
        {this.animateDrinking()}
      </div>
    )
  }
}
