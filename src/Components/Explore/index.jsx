import React, { Component } from 'react';
import DrinkCard from '../ui/drinkCard';
import Fade from 'react-reveal/Fade';
import Stripes from '../../Resources/images/stripes.png';
import { firebaseMilktea } from '../../firebase';
import 'firebase/storage'
import { firebaseLooper } from '../ui/misc';
import { Promise } from 'core-js';
  
export default class Explore extends Component {

    state = {
        loading:true,
        milktea:[]
    }

    componentDidMount(){
        firebaseMilktea.once('value').then(snapshot =>{
            const milktea = firebaseLooper(snapshot);
            let promises = [];

            Promise.all(promises).then(()=>{
                this.setState({
                    loading: false,
                    milktea
                })
            })


        })
    }

    showplayersByCategory = (category) => (
        this.state.milktea ?
            this.state.milktea.map((milktea,i)=>{
                return milktea.milkteastore === category ?
                    <Fade left delay={i*20} key={i}>
                        <div className="item">
                            <DrinkCard
                                number={`$ ${milktea.price}`}
                                name={milktea.name}
                                bck={milktea.milkteapic}
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
                            <div className="title">YiFang</div>
                            <div className="team_cards">
                                {this.showplayersByCategory('YiFang')}
                            </div>
                        </div>

                        <div className="card_category_wrapper">
                            <div className="title">Coco</div>
                            <div className="team_cards">
                                {this.showplayersByCategory('Coco')}
                            </div>
                        </div>

                        <div className="card_category_wrapper">
                            <div className="title">GongCha</div>
                            <div className="team_cards">
                                {this.showplayersByCategory('GongCha')}
                            </div>
                        </div>

                        <div className="card_category_wrapper">
                            <div className="title">HuluCat</div>
                            <div className="team_cards">
                                {this.showplayersByCategory('HuluCat')}
                            </div>
                        </div>

                        <div className="card_category_wrapper">
                            <div className="title">Creamomo</div>
                            <div className="team_cards">
                                {this.showplayersByCategory('Creamomo')}
                            </div>
                        </div>

                        <div className="card_category_wrapper">
                            <div className="title">WuCha</div>
                            <div className="team_cards">
                                {this.showplayersByCategory('WuCha')}
                            </div>
                        </div>

                        <div className="card_category_wrapper">
                            <div className="title">HiTea</div>
                            <div className="team_cards">
                                {this.showplayersByCategory('HiTea')}
                            </div>
                        </div>

                    </div>
                    :null
                }
                
            </div>
        );
    }
}
