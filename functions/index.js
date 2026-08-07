// ============================================================
//  OK Music — Firebase Cloud Functions
//  • FCM push notifications on new `notifications` documents
//  • Email notifications via nodemailer (Gmail SMTP)
//  • Weekly digest email (scheduled, Monday 9am UTC)
//
//  Email setup — set environment variables in Firebase Console:
//    Firebase Console → Functions → (function) → Edit → Environment variables
//      EMAIL_USER = trendai509@gmail.com
//      EMAIL_PASS = <Gmail App Password, 16 chars, no spaces>
//    To create a Gmail App Password:
//      myaccount.google.com → Security → 2-Step Verification → App passwords
//
//  Deploy:
//    npm install -g firebase-tools   (once)
//    firebase login
//    cd functions && npm install
//    firebase deploy --only functions
// ============================================================

const { onDocumentCreated }    = require("firebase-functions/v2/firestore");
const { onSchedule }           = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError }   = require("firebase-functions/v2/https");
const { initializeApp }        = require("firebase-admin/app");
const { getFirestore }         = require("firebase-admin/firestore");
const { getMessaging }         = require("firebase-admin/messaging");
const nodemailer               = require("nodemailer");
initializeApp();
const db  = getFirestore();
const fcm = getMessaging();

// Read email credentials from environment variables (set in Firebase Console)
function getEmailSecrets(){
  return { user: process.env.EMAIL_USER || "", pass: process.env.EMAIL_PASS || "" };
}

// ── Email helper ─────────────────────────────────────────────────────────────
function createTransport(user, pass){
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function emailHtml(title, body, cta=null){
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;margin:0;padding:20px;}
  .card{background:#fff;border-radius:16px;max-width:520px;margin:0 auto;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08);}
  .hdr{background:linear-gradient(135deg,#FB7A28,#ff5c7c);padding:24px 28px;text-align:center;}
  .hdr-logo{color:#fff;font-size:22px;font-weight:800;letter-spacing:.5px;}
  .body{padding:24px 28px;}
  .body h2{margin:0 0 12px;font-size:18px;color:#1a1a1a;}
  .body p{margin:0 0 16px;font-size:15px;line-height:1.6;color:#444;}
  .cta{display:inline-block;background:#FB7A28;color:#fff;text-decoration:none;border-radius:10px;padding:12px 24px;font-weight:700;font-size:15px;margin-top:8px;}
  .foot{text-align:center;padding:16px 28px;font-size:12px;color:#999;}
</style></head><body>
<div class="card">
  <div class="hdr"><div class="hdr-logo">◎ OK Music</div></div>
  <div class="body">
    <h2>${title}</h2>
    ${body}
    ${cta?`<div style="text-align:center;margin-top:20px"><a class="cta" href="${cta.url}">${cta.label}</a></div>`:''}
  </div>
  <div class="foot">You're receiving this because you have an OK Music account. <br>© OK Music — AI Music Community</div>
</div>
</body></html>`;
}

async function sendEmail(to, subject, html, secrets){
  if(!to||!secrets.user||!secrets.pass) return;
  const transporter=createTransport(secrets.user, secrets.pass);
  await transporter.sendMail({ from:`"OK Music" <${secrets.user}>`, to, subject, html });
}

// ── Email content per notification type ──────────────────────────────────────
function buildEmailContent(notif, recipientEmail){
  const siteUrl = "https://ok-music-903e7.web.app/community.html";
  const from = notif.fromName || "Someone";
  const type = notif.type || "";

  if(type === "fan_request"){
    return {
      subject: `🫂 ${from} wants to be your fan on OK Music`,
      html: emailHtml(
        `${from} sent you a fan request`,
        `<p><b>${from}</b> wants to become one of your fans on OK Music.</p><p>Accept their request to give them full access to your music and wall.</p>`,
        { url: siteUrl, label: "Review fan requests →" }
      ),
    };
  }
  if(type === "fan_accepted"){
    return {
      subject: `✅ ${from} accepted your fan request on OK Music`,
      html: emailHtml(
        "Your fan request was accepted!",
        `<p><b>${from}</b> accepted your fan request. You now have full access to their music, posts, and wall on OK Music.</p>`,
        { url: siteUrl, label: "Visit their page →" }
      ),
    };
  }
  if(type === "message"){
    return {
      subject: `💬 New message from ${from} on OK Music`,
      html: emailHtml(
        `${from} sent you a message`,
        `<p>You have a new message from <b>${from}</b> on OK Music.</p>`,
        { url: siteUrl, label: "Read the message →" }
      ),
    };
  }
  if(type === "new_track"){
    return {
      subject: `🎵 ${from} posted new music on OK Music`,
      html: emailHtml(
        `${from} posted new music`,
        `<p><b>${from}</b> just shared a new track. Listen now on OK Music!</p>`,
        { url: siteUrl, label: "Listen now →" }
      ),
    };
  }
  if(type === "new_follow"){
    return {
      subject: `👋 ${from} started following you on OK Music`,
      html: emailHtml(
        `${from} is now following you`,
        `<p><b>${from}</b> started following you on OK Music. They'll be notified when you post new music.</p>`,
        { url: siteUrl, label: "View your profile →" }
      ),
    };
  }
  if(type === "new_fan"){
    return {
      subject: `🎉 ${from} is now your fan on OK Music`,
      html: emailHtml(
        `You have a new fan: ${from}`,
        `<p><b>${from}</b> became one of your fans on OK Music — you earned <b>+5 LionCoins</b>!</p>`,
        { url: siteUrl, label: "See your fanbase →" }
      ),
    };
  }
  if(type === "new_product"){
    return {
      subject: `🛍️ ${from} listed a new product on OK Music Marketplace`,
      html: emailHtml(
        `${from} has something new for sale`,
        `<p><b>${from}</b> just listed a new product on the OK Music Marketplace. Check it out before it sells out!</p>`,
        { url: siteUrl, label: "Browse marketplace →" }
      ),
    };
  }
  // Generic fallback
  return {
    subject: `◎ OK Music — ${notif.text?.slice(0,60)||'New notification'}`,
    html: emailHtml(
      "New notification",
      `<p>${notif.text||'You have a new notification on OK Music.'}</p>`,
      { url: siteUrl, label: "Open OK Music →" }
    ),
  };
}

// Email types that warrant an email (not every push notification)
const EMAIL_TYPES = new Set([
  "fan_request", "fan_accepted", "message", "new_track",
  "new_follow", "new_fan", "new_product",
]);


// Icon and sound per notification type
const TYPE_META = {
  message:      { icon: "ic_message",   sound: "message_ping",  channel: "messages" },
  new_track:    { icon: "ic_music",     sound: "default",       channel: "tracks"   },
  call:         { icon: "ic_call",      sound: "ringtone",      channel: "calls"    },
  follow:       { icon: "ic_follow",    sound: "default",       channel: "social"   },
  new_follow:   { icon: "ic_follow",    sound: "default",       channel: "social"   },
  new_fan:      { icon: "ic_follow",    sound: "default",       channel: "social"   },
  fan_request:  { icon: "ic_follow",    sound: "default",       channel: "social"   },
  fan_accepted: { icon: "ic_follow",    sound: "default",       channel: "social"   },
  new_product:  { icon: "ic_launcher",  sound: "default",       channel: "general"  },
  default:      { icon: "ic_launcher",  sound: "default",       channel: "general"  },
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

// ── Push + email notifications ─────────────────────────────────────────────────
// Triggered whenever a new notification document is created
exports.sendPushOnNotification = onDocumentCreated(
  { document: "notifications/{notifId}" },
  async (event) => {
    const notif = event.data?.data();
    if (!notif) return null;

    const { forUid, type, fromName, text, fromUid } = notif;
    if (!forUid || !text) return null;
    // Never push to seed/demo users
    if (String(forUid).startsWith("u_")) return null;

    // Look up the recipient's FCM token and email
    const userDoc = await db.collection("users").doc(forUid).get();
    const userData = userDoc.data() || {};
    const fcmToken = userData.fcmToken;
    const recipientEmail = userData.email;

    // ── Send email notification ───────────────────────────────────────────────
    if(recipientEmail && EMAIL_TYPES.has(type)){
      try{
        const { subject, html } = buildEmailContent(notif, recipientEmail);
        await sendEmail(recipientEmail, subject, html, getEmailSecrets());
        console.log(`Email sent to uid=${forUid} type=${type}`);
      }catch(emailErr){
        console.error("Email send failed:", emailErr.message);
      }
    }

    // ── Send FCM push ─────────────────────────────────────────────────────────
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

// ── Weekly digest email (every Monday at 9:00 AM UTC) ─────────────────────────
exports.sendWeeklyDigest = onSchedule(
  { schedule: "every monday 09:00", timeZone: "UTC" },
  async () => {
    const secrets = getEmailSecrets();
    if (!secrets.user || !secrets.pass) {
      console.log("Email credentials not configured, skipping weekly digest.");
      return;
    }

    const siteUrl = "https://ok-music-903e7.web.app/community.html";
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Fetch all real users (skip seed users starting with "u_")
    const usersSnap = await db.collection("users").get();
    const users = usersSnap.docs
      .filter(d => !d.id.startsWith("u_") && d.data().email)
      .map(d => ({ id: d.id, ...d.data() }));

    console.log(`Sending weekly digest to ${users.length} users`);

    for (const user of users) {
      try {
        // Wallet balance
        const walletSnap = await db.collection("wallets").doc(user.id).get();
        const wallet = walletSnap.exists ? walletSnap.data() : {};
        const balance = (wallet.balance || 0).toFixed(2);

        // Recent earnings (transactions from last 7 days)
        const txSnap = await db.collection("wallets").doc(user.id)
          .collection("transactions")
          .where("createdAt", ">=", weekAgo)
          .get();
        const weekEarnings = txSnap.docs
          .filter(d => (d.data().amount || 0) > 0)
          .reduce((sum, d) => sum + (d.data().amount || 0), 0);

        // Tracks published this week
        const tracksSnap = await db.collection("tracks")
          .where("userId", "==", user.id)
          .where("createdAt", ">=", weekAgo)
          .get();
        const newTracks = tracksSnap.size;

        // New fans this week (follows where followeeId = user.id, from followRewards)
        const rewardsSnap = await db.collection("followRewards")
          .where("followeeId", "==", user.id)
          .where("createdAt", ">=", weekAgo)
          .get();
        const newFans = rewardsSnap.size;

        // Orders (as seller) this week
        const ordersSnap = await db.collection("orders")
          .where("sellerId", "==", user.id)
          .where("createdAt", ">=", weekAgo)
          .get();
        const newOrders = ordersSnap.size;

        const bodyHtml = `
          <p>Hi <b>${user.name || "there"}</b>, here's your OK Music activity for the past 7 days:</p>
          <table style="width:100%;border-collapse:collapse;font-size:15px;margin-bottom:16px">
            <tr style="border-bottom:1px solid #eee"><td style="padding:8px 4px;color:#666">🦁 LNC Balance</td><td style="padding:8px 4px;text-align:right;font-weight:700">${balance} LNC</td></tr>
            <tr style="border-bottom:1px solid #eee"><td style="padding:8px 4px;color:#666">💰 Earned this week</td><td style="padding:8px 4px;text-align:right;font-weight:700">+${weekEarnings.toFixed(2)} LNC</td></tr>
            <tr style="border-bottom:1px solid #eee"><td style="padding:8px 4px;color:#666">🎵 Tracks published</td><td style="padding:8px 4px;text-align:right;font-weight:700">${newTracks}</td></tr>
            <tr style="border-bottom:1px solid #eee"><td style="padding:8px 4px;color:#666">🫂 New fans</td><td style="padding:8px 4px;text-align:right;font-weight:700">${newFans}</td></tr>
            <tr><td style="padding:8px 4px;color:#666">📦 Marketplace orders</td><td style="padding:8px 4px;text-align:right;font-weight:700">${newOrders}</td></tr>
          </table>
          <p style="font-size:13px;color:#888">Keep posting, engaging, and earning LionCoins. See you next week!</p>`;

        const html = emailHtml("Your weekly OK Music digest 📊", bodyHtml, { url: siteUrl, label: "Open OK Music →" });
        await sendEmail(user.email, "◎ Your weekly OK Music summary", html, secrets);
        console.log(`Weekly digest sent to uid=${user.id}`);
      } catch (err) {
        console.error(`Weekly digest failed for uid=${user.id}:`, err.message);
      }
    }
  }
);
