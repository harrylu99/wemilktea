import React from 'react';

const StoresBlock = ({store}) => {

    return (
        <div className="match_block">
            <div className="match_date">
                {`Google Review: ${store.googlereview}`}
            </div>
            <div className="match_wrapper">
                <div className="match_top">
                    <div className="left">
                        <div className="team_name">
                            {<a href={store.locationlink}>{store.storename}</a>}
                            </div>
                    </div>
                    {/* <div className="right">
                        {store.priceaffordable}
                    </div> */}
                </div>
                <div className="match_bottom">
                    <div className="left">
                        <div className="team_name">
                        {"🧋 Top pick drink"}
                        {<br/>}
                        {store.bestpick}</div>
                    </div>
                    <div className="right">
                        {"Open hour"}
                        {<br/>}
                        {store.opentime}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default StoresBlock;