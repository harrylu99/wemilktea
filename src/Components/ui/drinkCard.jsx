import React from 'react';

const DrinkCard = (props) => {
    return (
        <div className="drink_card_wrapper">
            <div 
                className="drink_card_thmb"
                style={{background:` url(${props.bck})`}}
            ></div>
            <div className="drink_card_nfo">
                <div className="drink_card_store">
                    {props.number}
                </div>
                <div className="drink_card_name">
                    <span>{props.name}</span>
                </div>
            </div>
        </div>
    );
};

export default DrinkCard;