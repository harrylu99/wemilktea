import React, { Component } from 'react'
import Reveal from 'react-reveal/Reveal'
import Stripes from '../../../Resources/images/stripes.png'
import { Tag } from '../../ui/misc'
import DrinkCard from './Cards'

export default class TopDrinks extends Component {
  state = {
    show: false
  }

  render() {
    return (
      <Reveal
        fraction={0.7}
        onReveal={() => {
          this.setState({
            show: true
          })
        }}>
        <div
          className='home_topdrinks'
          style={{ background: `#ffffff url(${Stripes})` }}>
          <div className='container'>
            <div className='home_topdrinks_wrapper'>
              <div className='home_card_wrapper'>
                <DrinkCard show={this.state.show} />
              </div>
              <div className='home_text_wrapper'>
                <div>
                  <Tag
                    bck='#0e1731'
                    size='100px'
                    color='#ffffff'
                    add={{
                      display: 'inline-block',
                      marginBottom: '20px'
                    }}>
                    Check
                  </Tag>
                </div>
                <div>
                  <Tag
                    bck='#0e1731'
                    size='100px'
                    color='#ffffff'
                    add={{
                      display: 'inline-block',
                      marginBottom: '20px'
                    }}>
                    The Top
                  </Tag>
                </div>
                <div>
                  <Tag
                    bck='#0e1731'
                    size='100px'
                    color='#ffffff'
                    add={{
                      display: 'inline-block',
                      marginBottom: '20px'
                    }}>
                    Drink 🥤
                  </Tag>
                </div>
                <div>
                  <Tag
                    bck='#ffffff'
                    size='27px'
                    color='#0e1731'
                    link={true}
                    linkto='/explore'
                    add={{
                      display: 'inline-block',
                      marginBottom: '27px',
                      border: '1px solid #0e1731'
                    }}>
                    Explore more
                  </Tag>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    )
  }
}
