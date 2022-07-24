import React from 'react'
import { Switch, Route } from 'react-router-dom'
import Layout from './HOC/Layout'
import Home from './Components/Home'
import Explore from './Components/Explore'
import FindStore from './Components/FindStore'
import ScrollToTop from './Components/ScrollToTop'

const Routes = (props) => {
  return (
    <ScrollToTop>
      <Layout>
        <Switch>
          <Route path='/explore' exact component={Explore} />
          <Route path='/findStore' exact component={FindStore} />
          <Route path='/' exact component={Home} />
        </Switch>
      </Layout>
    </ScrollToTop>
  )
}

export default Routes
