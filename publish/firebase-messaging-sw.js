// ============================================================
//  OK Music — Firebase Messaging Service Worker
//  Handles background push notifications (FCM).
//  Receives push messages even when the browser tab is closed.
//
//  For push to work when the browser is fully closed, a backend
//  (Firebase Cloud Functions or similar) must send the FCM message
//  using the user's FCM token stored in Firestore.
// ============================================================
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyArIualnd_rTxhrCWABp8X_3fyelHF5CRg",
  authDomain: "ok-music-903e7.firebaseapp.com",
  projectId: "ok-music-903e7",
  storageBucket: "ok-music-903e7.firebasestorage.app",
  messagingSenderId: "72922695981",
  appId: "1:72922695981:web:9c876fd5fce0a3f1a4aba4",
});

const messaging = firebase.messaging();

// Handle background FCM messages (browser closed or tab hidden)
messaging.onBackgroundMessage(payload => {
  const n   = payload.notification || {};
  const d   = payload.data || {};
  const isCall = d.type === 'call';

  const options = {
    body:             n.body || '',
    icon:             '/favicon.ico',
    badge:            '/favicon.ico',
    tag:              d.tag || d.type || 'general',
    renotify:         true,
    requireInteraction: isCall,           // call notif stays until user acts
    vibrate:          isCall ? [400,150,400,150,400] : [200,100,200],
    data:             { type: d.type, fromUid: d.fromUid, url: d.url || '/community.html' },
    actions:          isCall
      ? [{ action:'answer', title:'📞 Answer' }, { action:'decline', title:'❌ Decline' }]
      : [],
  };

  return self.registration.showNotification(n.title || '◎ OK Music', options);
});

// Handle notification click → bring the app window to focus
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data   = e.notification.data || {};
  const action = e.action;
  if (action === 'decline') return;   // user declined call — just dismiss

  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      // Find an existing OK Music tab
      for (const c of cs) {
        if (c.url.includes('/community')) {
          c.focus();
          c.postMessage({ type: 'SW_NOTIF_CLICK', notifType: data.type, fromUid: data.fromUid, action });
          return;
        }
      }
      // No tab open — open one
      return clients.openWindow(data.url || '/community.html');
    })
  );
});
