import React from 'react'
import Featured from './Featured'
import Store from './Store'
import TopDrinks from './TopDrinks'
import Promotion from './Promotion'

const Home = () => {
    return (
        <div className="bck_blue">
            <Featured/>
            <Store/>
            <TopDrinks/>
            <Promotion/>
        </div>
    );
};

export default Home;