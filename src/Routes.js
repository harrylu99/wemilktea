import React from 'react'
import Layout from './HOC/Layout'

import { Switch }  from 'react-router-dom'
import Home from './Components/Home'
import PublicRoute from './Components/authRoutes/publicRoutes/index.jsx'
import Explore from './Components/Explore'


const Routes = (props) => {
  return(
    <Layout>
        <Switch>
          <PublicRoute {...props} restricted={false} path="/explore" exact component={Explore}/>
          <PublicRoute {...props} restricted={false} path="/" exact component={Home}/>
        </Switch>
    </Layout>
  )
}


export default Routes;
