import React, { Component } from 'react'
import Fade from 'react-reveal/Fade'
import DrinkCard from '../ui/drinkCard'
import Stripes from '../../Resources/images/stripes.png'
import { firebaseStore } from '../../firebase'
import { firebaseLooper } from '../ui/misc'

export default class FindStore extends Component {
  state = {
    loading: true,
    milkteastore: []
  }

  componentDidMount() {
    this.getMilkteaStores()
  }

  async getMilkteaStores() {
    const milkteastore = await firebaseStore.once('value').then((snapshot) => {
      return firebaseLooper(snapshot)
    })
    this.setState({
      loading: false,
      milkteastore
    })
  }

  showStoresByCategory = (category) =>
    this.state.milkteastore
      ? this.state.milkteastore.map((milkteastore, i) => {
          return milkteastore.district === category ? (
            <Fade left delay={i * 20} key={i}>
              <div className='item'>
                <DrinkCard
                  number={milkteastore.priceaffordable}
                  name={milkteastore.storename}
                  bck={milkteastore.storeimage}
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
              <div className='title'>Auckland CBD</div>
              <div className='item_cards'>
                {this.showStoresByCategory('CityCenter')}
              </div>
            </div>

            <div className='card_category_wrapper'>
              <div className='title'>Auckland City</div>
              <div className='item_cards'>
                {this.showStoresByCategory('AucklandCity')}
              </div>
            </div>

            <div className='card_category_wrapper'>
              <div className='title'>North Shore</div>
              <div className='item_cards'>
                {this.showStoresByCategory('NorthShore')}
              </div>
            </div>

            <div className='card_category_wrapper'>
              <div className='title'>Manukau City</div>
              <div className='item_cards'>
                {this.showStoresByCategory('ManukauCity')}
              </div>
            </div>

            <div className='card_category_wrapper'>
              <div className='title'>Other Auckland</div>
              <div className='item_cards'>
                {this.showStoresByCategory(' ')}
              </div>
            </div>

            <div className='card_category_wrapper'>
              <div className='title'>Outside Auckland</div>
              <div className='item_cards'>
                {this.showStoresByCategory(' ')}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    )
  }
}
