import React, { Component } from 'react'
import Fade from 'react-reveal/Fade'
import DrinkCard from '../ui/drinkCard'
import Stripes from '../../Resources/images/stripes.png'
import { firebaseMilktea } from '../../firebase'
import { firebaseLooper } from '../ui/misc'

export default class Explore extends Component {
  state = {
    loading: true,
    milktea: []
  }

  componentDidMount() {
    this.getMilkteas()
  }

  async getMilkteas() {
    const milktea = await firebaseMilktea.once('value').then((snapshot) => {
      return firebaseLooper(snapshot)
    })
    this.setState({
      loading: false,
      milktea
    })
  }

  showplayersByCategory = (category) =>
    this.state.milktea
      ? this.state.milktea.map((milktea, i) => {
          return milktea.milkteastore === category ? (
            <Fade left delay={i * 20} key={i}>
              <div className='item'>
                <DrinkCard
                  number={`$ ${milktea.price}`}
                  name={milktea.name}
                  bck={milktea.milkteapic}
                />
              </div>
            </Fade>
          ) : null
        })
      : null

  render() {
    return (
      <div
        className='the_card_container'
        style={{
          background: `url(${Stripes}) repeat`
        }}>
        {!this.state.loading ? (
          <div>
            <div className='card_category_wrapper'>
              <div className='title'>YiFang</div>
              <div className='item_cards'>
                {this.showplayersByCategory('YiFang')}
              </div>
            </div>

            <div className='card_category_wrapper'>
              <div className='title'>Coco</div>
              <div className='item_cards'>
                {this.showplayersByCategory('Coco')}
              </div>
            </div>

            <div className='card_category_wrapper'>
              <div className='title'>GongCha</div>
              <div className='item_cards'>
                {this.showplayersByCategory('GongCha')}
              </div>
            </div>

            <div className='card_category_wrapper'>
              <div className='title'>HuluCat</div>
              <div className='item_cards'>
                {this.showplayersByCategory('HuluCat')}
              </div>
            </div>

            <div className='card_category_wrapper'>
              <div className='title'>Creamomo</div>
              <div className='item_cards'>
                {this.showplayersByCategory('Creamomo')}
              </div>
            </div>

            <div className='card_category_wrapper'>
              <div className='title'>WuCha</div>
              <div className='item_cards'>
                {this.showplayersByCategory('WuCha')}
              </div>
            </div>

            <div className='card_category_wrapper'>
              <div className='title'>HiTea</div>
              <div className='item_cards'>
                {this.showplayersByCategory('HiTea')}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }
}
