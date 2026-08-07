// ============================================================
//  community-listeners.js — Firestore listeners, orders UI,
//  and the app init block (auth state + first render).
//  Loaded last, after community.js and community-dispatcher.js.
// ============================================================

function startListeners(){
  fbDB.collection("users").limit(2000).onSnapshot(s=>{ CACHE.users={}; s.forEach(d=>CACHE.users[d.id]={ id:d.id, ...d.data() }); scheduleRender(); }, e=>console.warn("users",e.code));
  fbDB.collection("tracks").limit(500).onSnapshot(s=>{ CACHE.tracks=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("tracks",e.code));
  fbDB.collection("statuses").limit(300).onSnapshot(s=>{ CACHE.statuses=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("statuses",e.code));
  fbDB.collection("follows").limit(2000).onSnapshot(s=>{ CACHE.follows={}; s.forEach(d=>CACHE.follows[d.id]=(d.data().following||[])); scheduleRender(); }, e=>console.warn("follows",e.code));
  fbDB.collection("userFollows").limit(2000).onSnapshot(s=>{ CACHE.userFollows={}; s.forEach(d=>{ const dat=d.data(); CACHE.userFollows[d.id]=(dat.list||[]); }); scheduleRender(); }, e=>console.warn("userFollows",e.code));
  fbDB.collection("reactions").limit(2000).onSnapshot(s=>{ CACHE.reactions={}; s.forEach(d=>CACHE.reactions[d.id]=d.data()); scheduleRender(); }, e=>console.warn("reactions",e.code));
  fbDB.collection("comments").limit(500).onSnapshot(s=>{ CACHE.comments=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("comments",e.code));
  fbDB.collection("products").limit(500).onSnapshot(s=>{ CACHE.products=s.docs.map(d=>({ id:d.id, ...d.data() })).sort((a,b)=>b.createdAt-a.createdAt); scheduleRender(); }, e=>console.warn("products",e.code));
  fbDB.collection("sellers").limit(2000).onSnapshot(s=>{ CACHE.sellers={}; s.forEach(d=>CACHE.sellers[d.id]={ id:d.id, ...d.data() }); scheduleRender(); }, e=>console.warn("sellers",e.code));
  // Daily FX rates (USD base) for multi-currency display
  fetch('https://open.er-api.com/v6/latest/USD')
    .then(r=>r.json())
    .then(d=>{ if(d.result==='success'){ CACHE.fxRates=d.rates; scheduleRender(); } })
    .catch(()=>{ CACHE.fxRates={}; });
  // Category registry — accumulates every custom category sellers have ever used
  fbDB.collection("platform").doc("categories").onSnapshot(
    s=>{ CACHE.customCategories=s.exists?Object.keys(s.data()).sort((a,b)=>a.localeCompare(b)):[]; scheduleRender(); },
    ()=>{ CACHE.customCategories=[]; }
  );
}
function startAuthListeners(uid){
  // discoveryPosts require auth per Firestore rules — start here, not in startListeners
  fbDB.collection("discoveryPosts").orderBy("time","desc").limit(100).onSnapshot(s=>{ CACHE.discoveryPosts=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("discoveryPosts",e.code));
  // buyer orders (and admin gets all orders)
  const ordersQ=fbAuth.currentUser?.email===ADMIN_EMAIL
    ?fbDB.collection("orders")
    :fbDB.collection("orders").where("buyerId","==",uid);
  ordersQ.onSnapshot(s=>{ CACHE.orders=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("orders",e.code));
  // follow requests incoming (someone wants to be my fan)
  fbDB.collection("followRequests").where("toUid","==",uid).where("status","==","pending")
    .onSnapshot(s=>{ CACHE.followRequests=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("followRequests",e.code));
  // follow requests outgoing (requests ME sent, for cancel button)
  fbDB.collection("followRequests").where("fromUid","==",uid).where("status","==","pending")
    .onSnapshot(s=>{ CACHE.fanRequestsSent=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("fanRequestsSent",e.code));
  // LionCoin wallet
  fbDB.collection("wallets").doc(uid).onSnapshot(s=>{ CACHE.wallet=s.exists?{ id:s.id,...s.data() }:null; scheduleRender(); }, e=>console.warn("wallet",e.code));
  fbDB.collection("wallets").doc(uid).collection("transactions").orderBy("createdAt","desc").limit(60)
    .onSnapshot(s=>{ CACHE.walletTxs=s.docs.map(d=>({ id:d.id,...d.data() })); scheduleRender(); }, e=>console.warn("walletTxs",e.code));
  // contests
  fbDB.collection("contests").orderBy("createdAt","desc")
    .onSnapshot(s=>{ CACHE.contests=s.docs.map(d=>({ id:d.id,...d.data() })); scheduleRender(); }, e=>console.warn("contests",e.code));
  // suggestions (admin only)
  if(fbAuth.currentUser?.email===ADMIN_EMAIL){
    fbDB.collection("suggestions").orderBy("time","desc").limit(50).onSnapshot(s=>{ CACHE.suggestions=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("suggestions",e.code));
  }
}

// ---------- My Orders (buyer) ----------
function renderMyOrders(){
  const orders=(CACHE.orders||[]).filter(o=>o.buyerId===ME.id).sort((a,b)=>b.createdAt-a.createdAt);
  $("page").innerHTML=`<div class="h-title">📦 My Orders</div>
    ${orders.length?orders.map(o=>{
      const statusLabel={pending_payment:"⏳ Awaiting payment",paid:"✅ Paid",shipped:"🚚 Shipped",completed:"✓ Completed",cancelled:"✕ Cancelled",lnc_paid:"✅ Paid (LNC)"}[o.status]||o.status;
      const canCancel=o.status==="pending_payment";
      return`<div style="padding:14px;border-radius:14px;background:var(--card);box-shadow:0 2px 8px rgba(180,120,60,.07);margin-bottom:10px">
        <div class="mrow2" style="flex-wrap:wrap;gap:10px;align-items:flex-start">
          <div class="minfo" style="flex:1;min-width:0">
            <div class="mt">Order <b>${o.id.slice(0,8).toUpperCase()}</b> · ${timeAgo(o.createdAt)}</div>
            <div class="ms">${(o.items||[]).map(i=>esc(i.title)).join(", ")}</div>
            <div class="ms" style="margin-top:4px">${statusLabel} · <b>$${parseFloat(o.total||0).toFixed(2)}</b></div>
          </div>
          ${canCancel?`<button class="btn sm" data-action="cancelorder" data-id="${o.id}" style="color:#e2554f;border-color:#e2554f;flex-shrink:0">✕ Cancel</button>`:''}
        </div>
        ${canCancel?`<div style="font-size:12px;color:var(--muted);margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">Send $${parseFloat(o.total||0).toFixed(2)} via Payoneer to <b>${PLATFORM_EMAIL}</b> — include order ID <b>${o.id.slice(0,8).toUpperCase()}</b> in the payment note.</div>`:''}
      </div>`;
    }).join(""):'<div class="empty">No orders yet — browse the Marketplace to start shopping. 🛍️</div>'}`;
}

function cancelOrder(orderId){
  const o=(CACHE.orders||[]).find(x=>x.id===orderId); if(!o) return;
  openOverlay(`<div style="text-align:center;padding:8px">
    <div style="font-size:40px;margin-bottom:12px">⚠️</div>
    <h2>Cancel this order?</h2>
    <p class="sub" style="margin:10px 0 6px">Order <b>${orderId.slice(0,8).toUpperCase()}</b></p>
    <p class="sub" style="margin-bottom:20px">${(o.items||[]).map(i=>esc(i.title)).join(", ")}</p>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Keep order</button>
      <button class="btn block" data-action="confirmcancelorder" data-id="${orderId}" style="background:#e2554f;color:#fff;border-color:#e2554f">Yes, cancel</button>
    </div>
  </div>`);
}

async function confirmCancelOrder(orderId){
  try{
    await fbDB.collection('orders').doc(orderId).update({status:'cancelled',cancelledAt:Date.now()});
    closeOverlay(); toast('Order cancelled.'); renderMyOrders();
  }catch(e){ toast('Could not cancel — '+(e.message||e.code||'unknown error')); }
}

// ---------- init: real Firebase auth + live data ----------
renderLanding();
startListeners();
fbAuth.onAuthStateChanged(async (user)=>{
  if(user){
    const prof=await loadProfile(user.uid);
    startAuthListeners(user.uid);
    if(prof){ ME=prof; syncME(); startMyNotifications(); listenForIncomingCalls(); initPushNotifications(); render(); handleLoginSecurity(user.uid); initPresence(user.uid); E2EE.init(user.uid); checkLoginReward(user.uid); initCallPanel(); }
    else { ME={ id:user.uid, name:user.displayName||"" }; render(); }   // no profile yet → onboarding
  } else {
    if(_presenceInterval){clearInterval(_presenceInterval);_presenceInterval=null;}
    if(_callsUnsub){_callsUnsub();_callsUnsub=null;}
    ME=null; syncME(); startMyNotifications(); render();
  }
});
