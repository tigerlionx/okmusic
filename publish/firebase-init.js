// ============================================================
//  Firebase init (compat SDK, no build step).
//  The apiKey here is PUBLIC by design — Firebase web keys are
//  meant to live in client code. Your data is protected by the
//  Firestore / Storage security rules, not by hiding this key.
//
//  Loaded after the firebase-*-compat.js CDN scripts and before
//  community.js, which uses `fbAuth` and `fbDB`.
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyArIualnd_rTxhrCWABp8X_3fyelHF5CRg",
  authDomain: "ok-music-903e7.firebaseapp.com",
  projectId: "ok-music-903e7",
  storageBucket: "ok-music-903e7.firebasestorage.app",
  messagingSenderId: "72922695981",
  appId: "1:72922695981:web:9c876fd5fce0a3f1a4aba4",
  measurementId: "G-3XM396Z78Q"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();
const fbDB = firebase.firestore();
// Offline cache + queued writes — keeps the app usable on flaky connections.
fbDB.enablePersistence({ synchronizeTabs: true }).catch(()=>{});
// const fbStorage = firebase.storage();   // not used — audio uploads go via Cloudinary
