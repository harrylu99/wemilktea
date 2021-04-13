import firebase from 'firebase/app'
import 'firebase/app'
import 'firebase/database'

const firebaseConfig = {
    apiKey: "AIzaSyDbqgPUWK_A_kzHMs1Zcr1B7bjGY2Nr2Eg",
    authDomain: "wemilktea-db41c.firebaseapp.com",
    databaseURL: "https://wemilktea-db41c-default-rtdb.firebaseio.com",
    projectId: "wemilktea-db41c",
    storageBucket: "wemilktea-db41c.appspot.com",
    messagingSenderId: "51696246329",
    appId: "1:51696246329:web:fb735c414eb9cc4cebb7e8",
    measurementId: "G-BKKYZC48E6"
  };

  firebase.initializeApp(firebaseConfig);

  const firebaseDB = firebase.database()

  const firebaseStore = firebaseDB.ref('milkteastore').orderByChild("googlereview")
  const firebasePromotions = firebaseDB.ref('promotions')
  const firebaseMilktea = firebaseDB.ref('milktea')
  const firebasePlayers = firebaseDB.ref('players')


  export {
      firebase,
      firebaseStore,
      firebasePromotions,
      firebaseMilktea,
      firebasePlayers
  }