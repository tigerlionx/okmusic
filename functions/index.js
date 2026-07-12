// ============================================================
//  OK Music — Firebase Cloud Functions
//  Sends FCM push notifications to users' devices whenever
//  a new document is written to the `notifications` collection.
//
//  This covers all three trigger types:
//    • New message  (type: "message")
//    • New track    (type: "new_track")
//    • Incoming call (type: "call")
//
//  Deploy:
//    npm install -g firebase-tools   (once)
//    firebase login
//    cd functions && npm install
//    firebase deploy --only functions
// ============================================================

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp }     = require("firebase-admin/app");
const { getFirestore }      = require("firebase-admin/firestore");
const { getMessaging }      = require("firebase-admin/messaging");

initializeApp();
const db  = getFirestore();
const fcm = getMessaging();

// Icon and sound per notification type
const TYPE_META = {
  message:   { icon: "ic_message",   sound: "message_ping",  channel: "messages" },
  new_track: { icon: "ic_music",     sound: "default",       channel: "tracks"   },
  call:      { icon: "ic_call",      sound: "ringtone",      channel: "calls"    },
  follow:    { icon: "ic_follow",    sound: "default",       channel: "social"   },
  default:   { icon: "ic_launcher",  sound: "default",       channel: "general"  },
};

// Triggered whenever a new notification document is created
exports.sendPushOnNotification = onDocumentCreated(
  "notifications/{notifId}",
  async (event) => {
    const notif = event.data?.data();
    if (!notif) return null;

    const { forUid, type, fromName, text, fromUid } = notif;
    if (!forUid || !text) return null;
    // Never push to seed/demo users
    if (String(forUid).startsWith("u_")) return null;

    // Look up the recipient's FCM token
    const userDoc = await db.collection("users").doc(forUid).get();
    const fcmToken = userDoc.data()?.fcmToken;
    if (!fcmToken) {
      console.log(`No FCM token for uid=${forUid}, skipping push.`);
      return null;
    }

    const meta  = TYPE_META[type] || TYPE_META.default;
    const isCall = type === "call";

    const message = {
      token: fcmToken,

      // Notification block — shown by the OS directly (works when app is closed)
      notification: {
        title: isCall ? `📞 ${fromName || "Someone"} is calling you` : "◎ OK Music",
        body:  text,
      },

      // Data block — available to the service worker for custom handling
      data: {
        type:    type || "general",
        fromUid: fromUid || "",
        tag:     type || "general",
        url:     "/community.html",
      },

      // Android-specific options
      android: {
        priority: isCall ? "high" : "normal",
        notification: {
          sound:      meta.sound,
          channelId:  meta.channel,
          icon:       meta.icon,
          // Call notifications stay on screen until dismissed
          ...(isCall && { notificationPriority: "PRIORITY_MAX", vibrateTimingsMillis: ["0","400","150","400","150","400"] }),
        },
      },

      // iOS / Safari (16.4+ with PWA install)
      apns: {
        payload: {
          aps: {
            sound:              isCall ? "ringtone.caf" : "default",
            badge:              1,
            "content-available": 1,
            ...(isCall && { "interruption-level": "time-sensitive" }),
          },
        },
      },

      // Web push (Chrome, Edge, Firefox)
      webpush: {
        notification: {
          title:              isCall ? `📞 ${fromName || "Someone"} is calling you` : "◎ OK Music",
          body:               text,
          icon:               "/favicon.ico",
          badge:              "/favicon.ico",
          requireInteraction: isCall,
          tag:                type || "general",
          renotify:           true,
          ...(isCall && {
            actions: [
              { action: "answer",  title: "📞 Answer"  },
              { action: "decline", title: "❌ Decline" },
            ],
          }),
        },
        fcmOptions: { link: "/community.html" },
      },
    };

    try {
      const response = await fcm.send(message);
      console.log(`Push sent to uid=${forUid} type=${type} messageId=${response}`);
    } catch (err) {
      // If the token is invalid / expired, clean it up so we don't retry forever
      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-registration-token"
      ) {
        console.warn(`Stale FCM token for uid=${forUid}, removing.`);
        await db.collection("users").doc(forUid).update({ fcmToken: null }).catch(() => {});
      } else {
        console.error("FCM send failed:", err.code, err.message);
      }
    }

    return null;
  }
);
