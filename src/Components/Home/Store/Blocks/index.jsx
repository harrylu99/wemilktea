import React, { Component } from 'react';
import { firebaseStore } from '../../../../firebase.js';
import { firebaseLooper, reverseArray } from '../../../ui/misc';

import StoresBlock from '../../../ui/stores_block';
import Slide from 'react-reveal/Slide'

export default class Blocks extends Component {

    state = {
        stores:[]
    }

    componentDidMount(){
        firebaseStore.limitToLast(6).once('value').then((snapshot)=>{
            const stores = firebaseLooper(snapshot);

            this.setState({
                stores: reverseArray(stores)
            });
        })
    }


    showMatches = (stores) => (
        stores ?
        stores.map((store)=>(
                <Slide bottom key={store.id}>
                    <div className="item">
                        <div className="wrapper">
                            <StoresBlock store={store}/>
                        </div>
                    </div>
                </Slide>
            ))
        :null
    )


    render() {
        return (
            <div className="home_stores">
                {this.showMatches(this.state.stores)}
            </div>
        );
    }
}