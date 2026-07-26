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

const { onDocumentCreated }    = require("firebase-functions/v2/firestore");
const { onCall, HttpsError }   = require("firebase-functions/v2/https");
const { initializeApp }        = require("firebase-admin/app");
const { getFirestore }         = require("firebase-admin/firestore");
const { getMessaging }         = require("firebase-admin/messaging");

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

// ── Printify helper ───────────────────────────────────────────────────────────
function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000);
}

async function printifyGet(apiPath, token) {
  const res = await fetch(`https://api.printify.com/v1${apiPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "User-Agent": "OK-Music/1.0" },
  });
  if (res.status === 401) throw new HttpsError("unauthenticated", "Printify rejected the token — please generate a new one at printify.com/app/account/api-access");
  if (!res.ok) {
    const body = await res.text();
    throw new HttpsError("internal", `Printify API error HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Printify: save token + import products (admin-only Cloud Function) ─────────
// Replaces the Node.js import script for environments that can't reach Printify directly.
exports.importPrintifyProducts = onCall({ region: "us-central1", timeoutSeconds: 300 }, async (request) => {
  if (!request.auth?.token?.email === "trendai509@gmail.com" && request.auth?.token?.email !== "trendai509@gmail.com") {
    throw new HttpsError("permission-denied", "Admin only");
  }
  if (request.auth?.token?.email !== "trendai509@gmail.com") {
    throw new HttpsError("permission-denied", "Admin only");
  }

  const { token, shopId: requestedShopId } = request.data || {};
  if (!token) throw new HttpsError("invalid-argument", "Printify API token is required");

  // 1. Get the admin's Firebase UID from the auth context (already authenticated)
  const sellerId = request.auth.uid;

  // 2. Find the shop
  const shops = await printifyGet("/shops.json", token);
  if (!shops.length) throw new HttpsError("not-found", "No Printify shops found on this account");
  const shopId = String(requestedShopId || shops[0].id);

  // 3. Save token + shopId to Firestore config so submitPrintifyOrder can use it
  await db.collection("config").doc("printify").set({ token, shopId }, { merge: true });

  // 4. Fetch all products (paginated)
  const allProducts = [];
  let page = 1;
  while (true) {
    const data = await printifyGet(`/shops/${shopId}/products.json?limit=50&page=${page}`, token);
    const chunk = data.data || data;
    if (!Array.isArray(chunk) || !chunk.length) break;
    allProducts.push(...chunk);
    if (!data.last_page || page >= data.last_page) break;
    page++;
  }
  const published = allProducts.filter(p => p.visible !== false && p.is_locked !== true);

  // 5. Write products to Firestore
  let created = 0, updated = 0;
  for (const p of published) {
    const img = p.images?.find(i => i.is_default) || p.images?.[0];
    const variants = (p.variants || [])
      .filter(v => v.is_enabled !== false && v.is_available !== false)
      .map(v => ({ id: String(v.id), label: v.title || String(v.id), price: v.price ? Number((v.price / 100).toFixed(2)) : 0 }));
    const firstVariant = variants[0];
    const price = firstVariant?.price ?? 0;

    const doc = {
      sellerId,
      source: "printify",
      printifyId: String(p.id),
      printifyShopId: shopId,
      title: p.title,
      description: stripHtml(p.description),
      photos: img ? [img.src] : [],
      category: "Merch",
      price,
      shipping: 0,
      variants,
      stock: null,
      lncPrice: null,
      updatedAt: Date.now(),
    };

    const snap = await db.collection("products").where("printifyId", "==", String(p.id)).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.update(doc);
      updated++;
    } else {
      await db.collection("products").add({ ...doc, createdAt: Date.now() });
      created++;
    }
  }

  return { shopId, total: published.length, created, updated };
});

// ── Printify order submission ──────────────────────────────────────────────────
// Called from the browser after the buyer fills the checkout form.
// Reads the Printify API token from Firestore config/printify (Admin SDK bypasses rules).
exports.submitPrintifyOrder = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in to place an order.");

  const { printifyProductId, printifyShopId, variantId, quantity, address, okOrderId } = request.data || {};

  if (!printifyProductId || !printifyShopId || !variantId) {
    throw new HttpsError("invalid-argument", "Missing product or variant information.");
  }
  if (!address?.first_name || !address?.last_name || !address?.address1 || !address?.city || !address?.country) {
    throw new HttpsError("invalid-argument", "Incomplete shipping address. Please fill all required fields.");
  }
  if (!okOrderId) throw new HttpsError("invalid-argument", "Missing order reference ID.");

  // Read Printify token from secured Firestore document
  const configSnap = await db.collection("config").doc("printify").get();
  if (!configSnap.exists) {
    throw new HttpsError("internal", "Printify is not configured on this platform. Please run the import script first.");
  }
  const { token } = configSnap.data();
  if (!token) throw new HttpsError("internal", "Printify API token is missing from configuration.");

  const payload = {
    external_id: `okmusic-${okOrderId}`,
    label: "OK Music",
    line_items: [{
      product_id: printifyProductId,
      variant_id: parseInt(variantId, 10),
      quantity:   quantity || 1,
    }],
    shipping_method: 1,
    send_shipping_notification: true,
    address_to: {
      first_name: address.first_name,
      last_name:  address.last_name,
      email:      address.email   || "",
      phone:      address.phone   || "",
      country:    address.country,
      region:     address.region  || "",
      address1:   address.address1,
      address2:   address.address2 || "",
      city:       address.city,
      zip:        address.zip     || "",
    },
  };

  const response = await fetch(
    `https://api.printify.com/v1/shops/${printifyShopId}/orders.json`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
        "User-Agent":    "OK-Music/1.0",
      },
      body: JSON.stringify(payload),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    console.error("Printify order error:", JSON.stringify(result));
    const errMsg = result.errors?.reason || result.message || `Printify returned HTTP ${response.status}`;
    throw new HttpsError("internal", errMsg);
  }

  // Update the Firestore order doc (Admin SDK — bypasses security rules)
  await db.collection("printifyOrders").doc(okOrderId).update({
    printifyOrderId: result.id,
    status:          "submitted",
    submittedAt:     Date.now(),
  });

  console.log(`Printify order ${result.id} created for okOrderId=${okOrderId} by uid=${request.auth.uid}`);
  return { printifyOrderId: result.id };
});

// ── Push notifications ─────────────────────────────────────────────────────────
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
