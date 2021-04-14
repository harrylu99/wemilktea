import React from 'react'
import Layout from './HOC/Layout'

import { Switch }  from 'react-router-dom'
import Home from './Components/Home'
import PublicRoute from './Components/authRoutes/PublicRoutes/index.jsx'
import Explore from './Components/Explore'
import FindStore from './Components/FindStore'
import ScrollToTop from './Components/ScrollToTop'


const Routes = (props) => {
  return(
    <ScrollToTop>
      <Layout>
        <Switch>
          <PublicRoute {...props} restricted={false} path="/explore" exact component={Explore}/>
          <PublicRoute {...props} restricted={false} path="/find_store" exact component={FindStore}/>
          <PublicRoute {...props} restricted={false} path="/" exact component={Home}/>
        </Switch>
      </Layout>
    </ScrollToTop>
    
  )
}


export default Routes;
