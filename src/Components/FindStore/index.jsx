import React, { Component } from 'react';
import DrinkCard from '../ui/drinkCard';
import Fade from 'react-reveal/Fade';
import Stripes from '../../Resources/images/stripes.png';
import { firebaseStore } from '../../firebase';
import 'firebase/storage'
import { firebaseLooper } from '../ui/misc';
import { Promise } from 'core-js';
  
export default class FindStore extends Component {

    state = {
        loading:true,
        milkteastore:[]
    }

    componentDidMount(){
        firebaseStore.once('value').then(snapshot =>{
            const milkteastore = firebaseLooper(snapshot)
            let promises = [];

            Promise.all(promises).then(()=>{
                this.setState({
                    loading: false,
                    milkteastore
                })
            })


        })

    }

    showplayersByCategory = (category) => (
        this.state.milkteastore ?
            this.state.milkteastore.map((milkteastore,i)=>{
                return milkteastore.district === category ?
                    <Fade left delay={i*20} key={i}>
                        <div className="item">
                            <DrinkCard
                                number={milkteastore.priceaffordable}
                                name={milkteastore.storename}
                                bck={milkteastore.storeimage}
                            />
                        </div>
                    </Fade>
                :null
            })
        :null
    )


    render() {
        return (
            <div className="the_card_container"
                style={{
                    background:`url(${Stripes}) repeat`
                }}
            >
                { !this.state.loading ?
                    <div>
                        <div className="card_category_wrapper">
                            <div className="title">Auckland CBD</div>
                            <div className="team_cards">
                                {this.showplayersByCategory('CityCenter')}
                            </div>
                        </div>

                        <div className="card_category_wrapper">
                            <div className="title">Auckland City</div>
                            <div className="team_cards">
                                {this.showplayersByCategory('AucklandCity')}
                            </div>
                        </div>

                        <div className="card_category_wrapper">
                            <div className="title">North Shore</div>
                            <div className="team_cards">
                                {this.showplayersByCategory('NorthShore')}
                            </div>
                        </div>

                        <div className="card_category_wrapper">
                            <div className="title">Manukau City</div>
                            <div className="team_cards">
                                {this.showplayersByCategory('ManukauCity')}
                            </div>
                        </div>

                        <div className="card_category_wrapper">
                            <div className="title">Other Auckland</div>
                            <div className="team_cards">
                                {this.showplayersByCategory(' ')}
                            </div>
                        </div>

                        <div className="card_category_wrapper">
                            <div className="title">Outside Auckland</div>
                            <div className="team_cards">
                                {this.showplayersByCategory(' ')}
                            </div>
                        </div>

                    </div>
                    :null
                }
                
            </div>
        );
    }
}
