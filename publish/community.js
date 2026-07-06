// ============================================================
//  OK Music — AI music social network (prototype).
//  - Claude-style sign-in (Google / Apple / email)
//  - Profile photos; profile shows streamer info only
//  - Streamer page = two sides: MUSIC (like/dislike only) | WALL
//    (statuses the streamer posts; fans like/dislike & comment here)
//  - Folders → playlists (File System Access API), no upload
//  Per-browser prototype; Firebase makes it real & shared with fans.
// ============================================================
const $ = (id) => document.getElementById(id);
const audio = $("audio");

// Seed data (incl. 100 demo creators) now lives in community-data.js:
// SEED_USERS, SEED_TRACKS, SEED_STATUSES, SEED_STATS, SEED_FOLLOWERS, SEED_ST_STATS.
const COLORS = ["#FB7A28","#7c5cff","#36d1c4","#ff5c7c","#ffb347","#5c8bff","#ff7ac6","#2bbf4e"];
const GENRES = ["Synthwave","Lo-fi","Ambient","Trap","Deep House","Cinematic","Drill","Afrobeat","Jazz-hop","Chillstep","Orchestral","Phonk","Future Bass","Downtempo","Hyperpop","Pop","Rock","Electronic","World","Other"];
const THEMES = [
  { id:"aurora",   label:"Aurora",    css:"linear-gradient(135deg,#7c5cff,#36d1c4)" },
  { id:"sunset",   label:"Sunset",    css:"linear-gradient(135deg,#FB7A28,#ff5c7c)" },
  { id:"ocean",    label:"Ocean",     css:"linear-gradient(135deg,#1a3a6b,#36d1c4)" },
  { id:"midnight", label:"Midnight",  css:"linear-gradient(135deg,#0d0d2b,#7c5cff)" },
  { id:"forest",   label:"Forest",    css:"linear-gradient(135deg,#1a4731,#2bbf4e)" },
  { id:"rosegold", label:"Rose Gold", css:"linear-gradient(135deg,#ff7ac6,#ffb347)" },
  { id:"ember",    label:"Ember",     css:"linear-gradient(135deg,#4a0000,#FB7A28)" },
  { id:"arctic",   label:"Arctic",    css:"linear-gradient(135deg,#a8edea,#fed6e3)" },
  { id:"galaxy",   label:"Galaxy",    css:"linear-gradient(135deg,#0f2027,#203a43,#2c5364)" },
  { id:"neon",     label:"Neon",      css:"linear-gradient(135deg,#0f0c29,#302b63,#f953c6)" },
];

const PLATFORM_EMAIL="trendai509@gmail.com";
const ADMIN_EMAIL="trendai509@gmail.com";
const PLATFORM_FEE=0.03;
const MP_CATEGORIES=["Music Equipment","Clothing & Merch","Software & Plugins","Art & Design","Books & Courses","Other"];

// ---------- DB ----------
const LS = "okcommunity4";
function load(){ try{ return JSON.parse(localStorage.getItem(LS))||{}; }catch{ return {}; } }
function db(){
  const d=load();
  d.accounts=d.accounts||{}; d.usersById=d.usersById||{}; d.identities=d.identities||{};
  d.tracks=d.tracks||[]; d.playlists=d.playlists||[]; d.statuses=d.statuses||[]; d.session=d.session||null;
  d.follows=d.follows||{}; d.likes=d.likes||{}; d.dislikes=d.dislikes||{}; d.plays=d.plays||{};
  d.stLikes=d.stLikes||{}; d.stDislikes=d.stDislikes||{}; d.stComments=d.stComments||{};
  return d;
}
function commit(d){ localStorage.setItem(LS,JSON.stringify(d)); }

// ---------- IndexedDB (folder handles + offline audio cache) ----------
function fsdb(){ return new Promise((res,rej)=>{ const r=indexedDB.open("okfs",2);
  r.onupgradeneeded=e=>{ const db=r.result; if(!db.objectStoreNames.contains("dirs")) db.createObjectStore("dirs"); if(!db.objectStoreNames.contains("audio")) db.createObjectStore("audio"); };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function fsPut(k,v){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("dirs","readwrite"); t.objectStore("dirs").put(v,k); t.oncomplete=res; }); }
async function fsGet(k){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("dirs","readonly"); const q=t.objectStore("dirs").get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }); }
async function audioPut(k,v){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("audio","readwrite"); t.objectStore("audio").put(v,k); t.oncomplete=res; }); }
async function audioGet(k){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("audio","readonly"); const q=t.objectStore("audio").get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }); }
const dirCache={};
async function ensurePerm(h){ if(!h)return false; const o={mode:"read"}; if((await h.queryPermission(o))==="granted")return true; try{ return (await h.requestPermission(o))==="granted"; }catch{ return false; } }

// ---------- helpers ----------
function allUsers(){ return SEED_USERS.concat(Object.values(CACHE.users)); }
function userById(id){ if(ME&&ME.id===id) return ME; return allUsers().find(u=>u.id===id); }
function seedAt(h){ return Date.now()-(h||0)*3600000; }
function allTracks(){ const s=SEED_TRACKS.map(t=>({ ...t, createdAt:seedAt(t.ageHrs), visibility:"public", share:true })); return CACHE.tracks.map(t=>({ ...t })).concat(s); }
function tracksByUser(uid,owner){ return allTracks().filter(t=>t.userId===uid&&(owner||t.visibility!=="private")).sort((a,b)=>b.createdAt-a.createdAt); }
function playlistsByUser(uid){ return db().playlists.filter(p=>p.userId===uid).sort((a,b)=>b.createdAt-a.createdAt); }
function allStatuses(){ const s=SEED_STATUSES.map(x=>({ ...x, time:seedAt(x.ageHrs) })); return CACHE.statuses.map(x=>({ ...x })).concat(s); }
function statusesByUser(uid){ return allStatuses().filter(s=>s.userId===uid).sort((a,b)=>b.time-a.time); }
function currentUser(){ return ME; }
function isAdmin(){ return fbAuth.currentUser?.email===ADMIN_EMAIL; }
function followerCount(uid){ let n=SEED_FOLLOWERS[uid]||0; for(const f in CACHE.follows) if(CACHE.follows[f].includes(uid)) n++; return n; }
function followingCount(uid){ return (CACHE.follows[uid]||[]).length; }
function isFollowing(uid){ return ME&&(CACHE.follows[ME.id]||[]).includes(uid); }
function likeCount(t){ return (SEED_STATS[t]?.likes||0)+((CACHE.reactions["t_"+t]?.likes||[]).length); }
function dislikeCount(t){ return (CACHE.reactions["t_"+t]?.dislikes||[]).length; }
function hasLiked(t){ return ME&&(CACHE.reactions["t_"+t]?.likes||[]).includes(ME.id); }
function hasDisliked(t){ return ME&&(CACHE.reactions["t_"+t]?.dislikes||[]).includes(ME.id); }
function playCount(t){ return (SEED_STATS[t]?.plays||0)+(db().plays[t]||0); }
function stLikeCount(id){ return (SEED_ST_STATS[id]?.likes||0)+((CACHE.reactions["s_"+id]?.likes||[]).length); }
function stDislikeCount(id){ return (SEED_ST_STATS[id]?.dislikes||0)+((CACHE.reactions["s_"+id]?.dislikes||[]).length); }
function stHasLiked(id){ return ME&&(CACHE.reactions["s_"+id]?.likes||[]).includes(ME.id); }
function stHasDisliked(id){ return ME&&(CACHE.reactions["s_"+id]?.dislikes||[]).includes(ME.id); }
function stComments(id){ return CACHE.comments.filter(c=>c.statusId===id).sort((a,b)=>a.time-b.time); }
function esc(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function nfmt(n){ return n>=1000?(n/1000).toFixed(n%1000>=100?1:0)+"k":""+n; }
function timeAgo(t){ const s=Math.floor((Date.now()-t)/1000); if(s<60)return"just now"; const m=Math.floor(s/60); if(m<60)return m+"m"; const h=Math.floor(m/60); if(h<24)return h+"h"; return Math.floor(h/24)+"d"; }
function initials(n){ return n.split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase(); }
function grad(c){ return `linear-gradient(135deg, ${c}, #6a4a2e)`; }
function avatarStyle(u,size){ const s=`width:${size}px;height:${size}px;font-size:${Math.round(size/2.6)}px;`; return u.avatarImg?`${s}background-image:url('${u.avatarImg}')`:`${s}background:${u.color}`; }
let toastTimer; function toast(m){ const e=$("toast"); e.textContent=m; e.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>e.hidden=true,3200); }

// ---------- state ----------
let ME=null;                                   // the signed-in user's profile (Firebase)
// live shared data, kept in sync by Firestore listeners
const CACHE={ users:{}, tracks:[], statuses:[], follows:{}, reactions:{}, comments:[], notifications:[], products:[], sellers:{}, orders:[], convos:{} };
let state={ view:"discover", profileId:null, query:"" };
let playMode="continuous"; // "continuous" | "repeat" | "shuffle"
let nowPlayingId=null;
function go(v,x={}){ state={ ...state, view:v, ...x }; render(); window.scrollTo(0,0); }
function applyMyBackground(){
  if(ME&&ME.pageBgImg){
    document.body.style.backgroundImage=`url('${ME.pageBgImg}')`;
    document.body.style.backgroundSize="cover";
    document.body.style.backgroundPosition="center";
    document.body.style.backgroundAttachment="fixed";
    document.body.classList.add("has-page-bg");
  } else {
    document.body.style.backgroundImage="";
    document.body.style.backgroundSize="";
    document.body.style.backgroundPosition="";
    document.body.style.backgroundAttachment="";
    document.body.classList.remove("has-page-bg");
  }
}
function render(){
  if(!ME){ renderLanding(); return; }
  if(!ME.handle){ renderLanding(); openOnboard(); return; }   // signed in but no profile yet
  renderApp();
}

// ============ AUTH (Claude-style) ============
function renderLanding(){
  $("miniplayer").classList.remove("show");
  $("root").innerHTML=`
  <div class="authwrap"><div class="authbox">
    <div class="logo">◎ OK Music</div><h1>Where AI music finds its fans.</h1>
    <p class="landing-desc">OK Music helps you share your AI music creation to your family, friends and fans. Log in to become famous...</p>
    <div class="authcard">
      <button class="social-btn" data-action="auth" data-p="google"><span class="ic" style="color:#EA4335">G</span> Continue with Google</button>
      <button class="social-btn" data-action="auth" data-p="apple"><span class="ic"></span> Continue with Apple</button>
      <div class="divider-or">OR</div>
      <input class="fb-field" id="liEmail" type="email" placeholder="Enter your email" />
      <button class="btn primary block" data-action="authemail" style="margin-top:10px">Continue with email</button>
    </div>
    <div class="authfoot">No account needed to listen — sign in to share & follow.</div>
  </div></div>`;
}
function signInGoogle(){
  const provider=new firebase.auth.GoogleAuthProvider();
  fbAuth.signInWithPopup(provider).catch(e=>{
    if(e.code==="auth/popup-blocked"||e.code==="auth/popup-closed-by-user"){
      fbAuth.signInWithRedirect(provider).catch(e2=>toast("Google sign-in failed: "+(e2.code||e2.message)));
    } else if(e.code!=="auth/cancelled-popup-request"){
      toast("Google sign-in failed: "+(e.code||e.message));
    }
  });
}
fbAuth.getRedirectResult().then(result=>{ if(result&&result.user) console.log("Redirect sign-in OK:",result.user.email); }).catch(e=>{ if(e.code==="auth/unauthorized-domain") toast("Login blocked: domain not authorised in Firebase. ("+location.hostname+")"); else if(e.code&&e.code!=="auth/credential-already-in-use") toast("Google sign-in failed: "+(e.code||e.message)); });
function openEmailAuth(email){
  openOverlay(`<h2>Continue with email</h2><p class="sub">Log in, or create a new account.</p>
    <div class="field"><label>Email</label><input class="fb-field" id="emEmail" type="email" value="${esc(email||'')}" /></div>
    <div class="field"><label>Password</label><input class="fb-field" id="emPass" type="password" placeholder="at least 6 characters" /></div>
    <button class="btn primary block" data-action="emailgo" data-mode="login">Log in</button>
    <button class="btn block" data-action="emailgo" data-mode="signup" style="margin-top:8px">Create new account</button>`);
}
function emailGo(mode){
  const email=($("emEmail").value||"").trim(), pass=$("emPass").value||"";
  if(!email||!email.includes("@")) return toast("Enter a valid email");
  if(pass.length<6) return toast("Password must be at least 6 characters");
  closeOverlay();
  const p = mode==="signup" ? fbAuth.createUserWithEmailAndPassword(email,pass) : fbAuth.signInWithEmailAndPassword(email,pass);
  p.catch(e=>{
    if(e.code==="auth/email-already-in-use") toast("That email already has an account — choose Log in.");
    else if(e.code==="auth/user-not-found"||e.code==="auth/invalid-credential"||e.code==="auth/wrong-password") toast("No account or wrong password — try Create new account.");
    else toast("Sign-in failed: "+(e.code||e.message));
  });
}
async function loadProfile(uid){ try{ const s=await fbDB.collection("users").doc(uid).get(); return s.exists?{ id:uid, ...s.data() }:null; }catch(e){ console.warn(e); return null; } }
function syncME(){ const d=db(); if(ME){ d.session=ME.id; d.usersById[ME.id]={ id:ME.id, name:ME.name, handle:ME.handle, bio:ME.bio, color:ME.color, avatarImg:ME.avatarImg, bgColor:ME.bgColor, bgImg:ME.bgImg, pageBgImg:ME.pageBgImg||"" }; } else d.session=null; commit(d); }
function openOnboard(){
  openOverlay(`<h2>Welcome to OK Music 👋</h2><p class="sub">Pick a name and handle to set up your creator profile.</p>
    <div class="field"><label>Display name</label><input class="fb-field" id="obName" placeholder="e.g. Emmanuel Leveille" value="${esc((ME&&ME.name)||'')}" /></div>
    <div class="field"><label>Handle (@username)</label><input class="fb-field" id="obHandle" placeholder="emmanuel" /></div>
    <button class="btn primary block" data-action="finishonboard">Create my profile</button>`);
}
async function finishOnboard(){
  const name=($("obName").value||"").trim(), handle=($("obHandle").value||"").trim().replace(/^@/,"").toLowerCase();
  if(!name||!handle) return toast("Enter a name and handle");
  if(!/^[a-z0-9_]{2,}$/.test(handle)) return toast("Handle: letters, numbers, underscore");
  if(SEED_USERS.some(u=>u.handle===handle)) return toast("That handle is taken");
  try{
    const dup=await fbDB.collection("users").where("handle","==",handle).limit(1).get();
    if(!dup.empty) return toast("That handle is taken");
    const uid=fbAuth.currentUser.uid;
    const prof={ name, handle, bio:"New AI music creator 🎶", color:COLORS[Math.floor(Math.random()*COLORS.length)], avatarImg:(fbAuth.currentUser.photoURL||""), createdAt:Date.now() };
    await fbDB.collection("users").doc(uid).set(prof);
    ME={ id:uid, ...prof }; syncME(); closeOverlay();
    // Send welcome notification
    fbDB.collection("notifications").add({ forUid:uid, type:"welcome", fromUid:"platform", fromName:"OK Music", text:"👋 Welcome to OK Music! Tap here for your complete guide — music, chat, calls, marketplace & more.", time:Date.now(), read:false }).catch(()=>{});
    showWelcomeGuide(name);
  }catch(e){ toast("Couldn't save profile: "+(e.code||e.message)); }
}

function showWelcomeGuide(name){
  openOverlay(`<div class="welcome-guide">
    <div class="wg-header">
      <div style="font-size:36px">🎵</div>
      <h2>Welcome to OK Music, ${esc(name)}!</h2>
      <p class="sub">Your complete guide — everything you need to enjoy the platform.</p>
    </div>

    <div class="wg-section">
      <div class="wg-icon">🎵</div>
      <div><b>Share a single track</b><br>
      Tap <b>"Add single track"</b> in the sidebar. Upload an audio file (MP3, M4A, WAV, FLAC…) from your phone or computer — it uploads to the cloud automatically so fans on <em>any</em> device can play it. Or paste a public streaming link (SoundCloud, Google Drive, Dropbox, etc.). Add a cover photo, pick a genre, set Public or Private, then publish.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">📁</div>
      <div><b>Share a folder / album / playlist</b><br>
      Tap <b>"Add a folder"</b> to upload a whole set of tracks at once. On <b>mobile</b>: select multiple audio files and give them a playlist name. On <b>desktop</b> (Chrome / Edge): pick an entire folder from your computer, Google Drive, Dropbox, or iCloud. Every track uploads to the cloud so it plays on all devices — for you and your fans.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">☁️</div>
      <div><b>Cloud storage — always in sync</b><br>
      All uploaded audio is stored securely in the cloud. Your music plays on your phone, your laptop, your tablet — and on any fan's device — without re-uploading. If you have old tracks that say <b>"Local only"</b>, tap <b>"☁️ Move to cloud"</b> next to the track in <b>My Music</b> to migrate them.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">▶️</div>
      <div><b>Playback &amp; mini-player</b><br>
      Tap any track art or title to play. The <b>mini-player</b> stays at the bottom of the screen while you browse. Use the <b>🔁 mode button</b> to switch between:<br>
      &nbsp;• <b>Continuous</b> — plays the whole playlist in order<br>
      &nbsp;• <b>🔀 Shuffle</b> — random order<br>
      &nbsp;• <b>🔂 Repeat one</b> — loops the current track<br>
      Tap the progress bar to seek. Tracks are cached after the first play for offline listening.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">🎨</div>
      <div><b>Personalise your page</b><br>
      Go to <b>"Edit profile"</b> (sidebar or your page) to:<br>
      &nbsp;• Upload a <b>profile photo</b> or paste a photo link<br>
      &nbsp;• Write your <b>bio</b><br>
      &nbsp;• Set a <b>banner image</b> at the top of your page — concert photo, album art, anything wide and bold<br>
      &nbsp;• Set a <b>page background image</b> that fills the whole page for every visitor<br>
      &nbsp;• Choose a <b>colour theme</b> or a solid colour for the banner if you prefer<br>
      All changes are saved to the cloud and visible to every fan on every device instantly.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">👥</div>
      <div><b>Discover, follow &amp; grow your fanbase</b><br>
      Go to <b>Discover</b> to browse all artists and tracks. Use the search bar to find someone by name. Click <b>Follow</b> on any profile to become a fan — they'll get a notification. Post <b>statuses</b> on your Wall to talk directly to your followers. Share your <b>invite link</b> (Invite Friends in the sidebar) on social media to bring more fans in. Fans can <b>like, dislike, and comment</b> on your tracks and posts.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">🔥</div>
      <div><b>Buzzing &amp; My Feed</b><br>
      <b>🔥 Buzzing</b> shows the hottest tracks on the platform right now, ranked by plays and likes — great for discovering new music.<br>
      <b>🏠 My Feed</b> shows the latest posts and statuses from artists you follow, so you never miss an update from your favourite creators.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">💬</div>
      <div><b>Private Messenger</b><br>
      Go to any artist's profile and tap <b>💬 Message</b> to open a private chat. All your conversations are in the <b>💬 Messages</b> tab — new messages show an unread badge.<br><br>
      Inside a chat you can:<br>
      &nbsp;• <b>Edit</b> a message you sent (tap ✏️)<br>
      &nbsp;• <b>Delete for me</b> — removes it from your view only<br>
      &nbsp;• <b>Delete for everyone</b> — removes it for both sides<br>
      You hear a <b>ping sound</b> when a new message arrives.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">📞</div>
      <div><b>Free voice calls</b><br>
      Inside any chat, tap <b>📞 Call</b> to start a free real-time voice call. The other person hears a <b>ring tone</b> and sees an incoming call screen — they can tap <b>✅ Accept</b> or <b>❌ Decline</b>. During the call you can <b>mute</b> yourself and see a live call timer. Calls work peer-to-peer over the internet — completely free.</div>
    </div>

    <div class="wg-section wg-market">
      <div class="wg-icon">🛍️</div>
      <div><b>Marketplace — buy &amp; sell</b><br>
      Click <b>MARKETPLACE</b> in the sidebar.<br><br>
      <b>🏪 Sell:</b> Open your store — enter a store name, location, and Payoneer email. List products with photos, description, and price. You set your own shipping &amp; handling costs. You receive <b>97% of every sale</b> (3% platform fee) paid to your Payoneer account within 1–2 business days.<br><br>
      <b>🛒 Buy:</b> Browse all products, search by name or seller, tap any photo to zoom, add to cart. At checkout provide your shipping address. Payment goes via <b>Payoneer</b> and your order is forwarded to the seller.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">💡</div>
      <div><b>Good to know</b><br>
      • Tap any profile photo to view it full size<br>
      • Your music is yours — only you can edit or delete your tracks<br>
      • <b>🔒 Private</b> tracks are visible only to you<br>
      • Add a streaming link to any existing track: go to <b>My Music</b>, tap the track menu, choose <b>🔗 Add streaming link</b><br>
      • Use <b>💡 Suggest a Feature</b> in the sidebar to send us ideas — we read every one<br>
      • Log in with Google or email on any device to access your full profile and music</div>
    </div>

    <button class="btn primary block" data-action="close" style="margin-top:20px;font-size:16px;padding:14px">Let's go! 🚀</button>
  </div>`);
}

// ============ APP SHELL ============
function renderApp(){
  const u=currentUser();
  const item=(v,ic,l)=>`<div class="side-item ${state.view===v?'active':''}" data-action="nav" data-view="${v}"><span class="ic">${ic}</span>${l}</div>`;
  $("root").innerHTML=`
    <div class="topbar">
      <div class="brand" data-action="nav" data-view="discover"><span class="l">◎</span><b>OK&nbsp;Music</b></div>
      <input class="search" id="search" placeholder="Search artists & tracks…" value="${esc(state.query)}" />
      <div class="bell" data-action="nav" data-view="notifs" title="Notifications">🔔${(()=>{const n=(CACHE.notifications||[]).filter(x=>!x.read).length;return n?`<span class="bell-badge">${n>9?'9+':n}</span>`:'';})()}</div>
      <div class="me" data-action="profile" data-uid="${u.id}"><div class="avatar" style="${avatarStyle(u,34)}">${u.avatarImg?'':initials(u.name)}</div></div>
    </div>
    <div class="shell">
      <nav class="sidebar">
        ${item("discover","🧭","Discover")}
        ${item("buzzing","🔥","Buzzing")}
        ${item("home","🏠","My Feed")}
        ${item("notifs","🔔","Notifications")}
        ${(()=>{const un=Object.values(CACHE.convos||{}).reduce((s,c)=>s+((c.unread||{})[ME?.id]||0),0);return`<div class="side-item ${state.view==='msgs'||state.view==='chat'?'active':''}" data-action="nav" data-view="msgs"><span class="ic">💬</span>Messages${un?`<span class="bell-badge" style="position:static;margin-left:6px">${un>9?'9+':un}</span>`:''}</div>`})()}
        <div class="side-item" data-action="profile" data-uid="${u.id}"><span class="ic">😊</span>My Page</div>
        ${item("fans","🫂","My Fans")}
        ${item("mymusic","🎵","My Music")}
        <div class="side-sep"></div>
        <div class="side-item" data-action="sharefolder"><span class="ic">📁</span>Add a folder</div>
        <div class="side-item" data-action="upload"><span class="ic">⬆️</span>Add single track</div>
        <div class="side-item" data-action="customize"><span class="ic">🎨</span>Edit profile</div>
        <div class="side-item" data-action="invite"><span class="ic">✉️</span>Invite friends</div>
        <div class="side-item" data-action="suggest"><span class="ic">💡</span>Suggest a feature</div>
        <div class="side-item ${state.view==='marketplace'||state.view==='mystore'||state.view==='cart'?'active':''}" data-action="openmarketplace"><span class="ic">🛍️</span>MARKETPLACE</div>
        ${isAdmin()?`<div class="side-item ${state.view==='admin'?'active':''}" data-action="nav" data-view="admin"><span class="ic">📊</span>Admin Stats</div>`:''}
        <div class="side-sep"></div>
        <div class="side-item" data-action="logout"><span class="ic">↩️</span>Log out</div>
      </nav>
      <main class="main"><div class="page" id="page"></div></main>
    </div>`;
  applyMyBackground();
  renderMain();
  setTimeout(()=>{ const s=$("search"); if(s) s.oninput=e=>{ state.query=e.target.value; if(state.view!=="discover") state.view="discover"; renderMain(); }; },0);
}
function renderMain(){
  if(state.view!=="profile") applyMyBackground();
  if(state.view==="profile") return renderProfile(state.profileId);
  if(state.view==="mymusic") return renderMyMusic();
  if(state.view==="fans") return renderFans();
  if(state.view==="buzzing") return renderBuzzing();
  if(state.view==="notifs") return renderNotifs();
  if(state.view==="msgs") return renderMessages();
  if(state.view==="chat") return openChat(state.chatUid);
  if(state.view==="home") return renderHome();
  if(state.view==="marketplace") return renderMarketplace();
  if(state.view==="mystore") return renderSellerStore();
  if(state.view==="cart") return renderCart();
  if(state.view==="admin"&&isAdmin()) return renderAdmin();
  renderDiscover();
}

// ---------- discover (browse music) ----------
function renderDiscover(){
  const q=state.query.trim().toLowerCase(); const g=state.genre||"";
  let list=allTracks().filter(t=>t.visibility==="public");
  if(g) list=list.filter(t=>(t.genre||"Other")===g);
  if(q) list=list.filter(t=>t.title.toLowerCase().includes(q)||(t.genre||"").toLowerCase().includes(q)||userById(t.userId)?.name.toLowerCase().includes(q));
  list.sort((a,b)=>b.createdAt-a.createdAt);
  // artists matching the search (so any artist is findable, online or not)
  let artists=[];
  if(q) artists=allUsers().filter(u=>u&&(u.name.toLowerCase().includes(q)||(u.handle||"").toLowerCase().includes(q))).slice(0,12);
  const chips=`<div class="genre-chips"><button class="chip ${g===''?'on':''}" data-action="genre" data-g="">All genres</button>${GENRES.map(x=>`<button class="chip ${g===x?'on':''}" data-action="genre" data-g="${x}">${x}</button>`).join("")}</div>`;
  const artistSec=artists.length?`<div class="section-title">Artists</div><div style="margin-bottom:20px">${artists.map(userCard).join("")}</div>`:"";
  $("page").innerHTML=`<div class="h-title">Discover</div>${chips}${artistSec}
    ${q||artists.length?'<div class="section-title">Tracks</div>':''}
    ${list.length?`<div class="grid">${list.map(card).join("")}</div>`:'<div class="empty">No tracks found'+(q?' for "'+esc(state.query)+'"':'')+'.</div>'}`;
}
function card(t){
  const u=userById(t.userId);
  const artStyle=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
  return `<div class="card">
    <div class="card-art" style="${artStyle}" data-action="play" data-id="${t.id}">${t.coverImg?'':'◎'}<button class="card-play" data-action="play" data-id="${t.id}">▶</button></div>
    <div class="card-body"><div class="card-title" data-action="play" data-id="${t.id}">${esc(t.title)}</div>
      <div class="card-artist" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div>
      <div class="card-meta"><button class="${hasLiked(t.id)?'on':''}" data-action="like" data-id="${t.id}">👍 ${nfmt(likeCount(t.id))}</button>
        <button class="${hasDisliked(t.id)?'on':''}" data-action="dislike" data-id="${t.id}">👎 ${nfmt(dislikeCount(t.id))}</button>
        <span class="spacer"></span><span>▶ ${nfmt(playCount(t.id))}</span></div></div></div>`;
}

// ---------- home feed (status timeline) ----------
function renderHome(){
  const u=currentUser(); const f=db().follows[u.id]||[];
  const list=allStatuses().filter(s=>s.userId===u.id||f.includes(s.userId)).sort((a,b)=>b.time-a.time);
  $("page").innerHTML=`<div class="h-title">My Feed</div>
    ${composer()}
    ${list.length?list.map(statusCard).join(""):'<div class="empty">Follow artists to see their updates here — or post your own status above.</div>'}`;
  setTimeout(bindComposer,0);
}

// ---------- streamer page: info header + (music | wall) ----------
function renderProfile(uid){
  const u=userById(uid); if(!u){ $("page").innerHTML='<div class="empty">Artist not found.</div>'; return; }
  const me=currentUser(); const mine=me&&me.id===uid;
  const themeCSS=u.bgTheme?(THEMES.find(t=>t.id===u.bgTheme)||{}).css:"";
  const cover=u.bgImg?`background-image:url('${u.bgImg}');background-size:cover;background-position:center`:themeCSS?`background:${themeCSS}`:u.bgColor?`background:${u.bgColor}`:"";
  // Apply page background: profile owner's if set, otherwise fall back to the logged-in user's own background
  const pageBg=u.pageBgImg||(mine&&ME?.pageBgImg)||"";
  if(pageBg){ document.body.style.backgroundImage=`url('${pageBg}')`; document.body.style.backgroundSize="cover"; document.body.style.backgroundPosition="center"; document.body.style.backgroundAttachment="fixed"; document.body.classList.add("has-page-bg"); }
  else applyMyBackground();
  const tracks=tracksByUser(uid,mine); const pls=playlistsByUser(uid); const sts=statusesByUser(uid);
  const headActions=mine
    ? `<button class="btn primary" data-action="customize">🎨 Edit profile</button><button class="btn" data-action="invite">✉️ Invite</button>`
    : `<button class="btn ${isFollowing(uid)?'':'primary'}" data-action="follow" data-uid="${uid}">${isFollowing(uid)?'Following ✓':'Follow'}</button>
       <button class="btn" data-action="openchat" data-uid="${uid}">💬 Message</button>`;
  // MUSIC column
  let music="";
  if(mine) music+=`<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap"><button class="btn sm primary" data-action="sharefolder">📁 Share folder</button><button class="btn sm" data-action="upload">＋ Single track</button></div>`;
  if(pls.length) music+=pls.map(p=>playlistBlock(p,mine)).join("");
  if(tracks.length) music+=tracks.map(musicRow).join("");
  if(!pls.length&&!tracks.length) music+=`<div class="empty" style="padding:24px">No tracks yet.</div>`;
  // WALL column
  let wall = mine?composer():"";
  wall += sts.length?sts.map(statusCard).join(""):`<div class="empty" style="padding:24px">No posts yet.${mine?' Share a status to talk to your fans 👆':''}</div>`;
  $("page").innerHTML=`
    <div class="profile-cover" style="${cover}"></div>
    <div class="profile-head"><div class="profile-avatar" style="${avatarStyle(u,104)};cursor:pointer" data-action="viewavatar" data-uid="${uid}">${u.avatarImg?'':initials(u.name)}</div>
      <div class="profile-info"><div class="profile-name">${esc(u.name)} ${u.founder?'<span class="badge-founder">FOUNDER</span>':''}</div><div class="profile-handle">@${esc(u.handle)}</div></div></div>
    <div class="profile-stats"><div><b>${tracks.length+pls.reduce((n,p)=>n+p.files.length,0)}</b> <span>tracks</span></div>
      <div><b>${nfmt(followerCount(uid))}</b> <span>fans</span></div><div><b>${nfmt(followingCount(uid))}</b> <span>following</span></div></div>
    <div class="profile-bio">${esc(u.bio||"")}</div>
    <div class="profile-actions" style="margin-top:14px">${headActions}</div>
    <div class="divider"></div>
    <div class="streamer-cols">
      <div class="col-music"><div class="col-h">🎵 Music <span class="col-hint">· like or dislike</span></div>${music}</div>
      <div class="col-wall"><div class="col-h">💬 Wall <span class="col-hint">· comment & react here</span></div>${wall}</div>
    </div>`;
  pls.forEach(loadCovers); setTimeout(bindComposer,0);
}

// ---------- music row (like/dislike only) ----------
function musicRow(t){
  const priv=t.visibility==="private";
  const isLocal=t.src&&t.src.startsWith("local:");
  const artStyle=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
  const localNote=isLocal?`<span class="local-badge" title="Audio stored locally — only the uploader can play this">📵 Local only</span>`:'';
  return `<div class="mrow2"><div class="mart" style="${artStyle}" data-action="play" data-id="${t.id}">${t.coverImg?'':'◎'}</div>
    <div class="minfo"><div class="mt" data-action="play" data-id="${t.id}">${esc(t.title)}${priv?' 🔒':''}${localNote}</div><div class="ms">▶ ${nfmt(playCount(t.id))} plays</div></div>
    <div class="ld"><button class="${hasLiked(t.id)?'on':''}" data-action="like" data-id="${t.id}">👍 ${nfmt(likeCount(t.id))}</button>
      <button class="${hasDisliked(t.id)?'ondown':''}" data-action="dislike" data-id="${t.id}">👎 ${nfmt(dislikeCount(t.id))}</button></div></div>`;
}

// ---------- statuses / wall ----------
function composer(){
  return `<div class="status-composer"><textarea id="statusText" placeholder="Share a status with your fans… e.g. I just posted new tracks — please listen, like & share! 💜"></textarea>
    <div style="text-align:right"><button class="btn primary sm" data-action="poststatus">Post status</button></div></div>`;
}
function bindComposer(){ /* nothing extra; handled via delegation */ }
function statusCard(s){
  const u=userById(s.userId); const cs=stComments(s.id);
  const cmts=cs.map(c=>{ const mine=ME&&c.uid===ME.id; return `<div class="scmt"><div class="sc-av" style="${avatarStyle(userById(c.uid)||{color:'#bbb'},28)}">${(userById(c.uid)?.avatarImg)?'':initials(c.name)}</div>
      <div class="sc-b"><b>${esc(c.name)}</b> · <span style="color:var(--muted);font-size:11px">${timeAgo(c.time)}${c.edited?' · edited':''}</span><div>${esc(c.text)}</div>${mine?`<div class="cmt-edit"><span data-action="editcmt" data-id="${c.id}">Edit</span> · <span data-action="delcmt" data-id="${c.id}">Delete</span></div>`:''}</div></div>`; }).join("");
  return `<div class="status-card">
    <div class="status-top"><div class="avatar" style="${avatarStyle(u,38)};cursor:pointer" data-action="viewavatar" data-uid="${u.id}">${u.avatarImg?'':initials(u.name)}</div>
      <div><div class="sname" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div><div class="stime">${timeAgo(s.time)}</div></div></div>
    <div class="status-text">${esc(s.text)}</div>
    <div class="status-actions ld">
      <button class="${stHasLiked(s.id)?'on':''}" data-action="slike" data-id="${s.id}">👍 ${nfmt(stLikeCount(s.id))}</button>
      <button class="${stHasDisliked(s.id)?'ondown':''}" data-action="sdislike" data-id="${s.id}">👎 ${nfmt(stDislikeCount(s.id))}</button></div>
    <div class="scomments">${cmts}
      <div class="cmt-add"><input id="sc_${s.id}" placeholder="Write a comment…" /><button class="btn sm primary" data-action="scomment" data-id="${s.id}">Post</button></div></div></div>`;
}
function postStatus(){
  const t=($("statusText").value||"").trim(); if(!t) return toast("Write something to share");
  if(!ME) return openEmailAuth();
  fbDB.collection("statuses").add({ userId:ME.id, text:t, time:Date.now() }).then(()=>toast("Posted to your wall 📣")).catch(e=>toast("Couldn't post: "+(e.code||e.message)));
}
function stLike(id){ if(!ME) return openEmailAuth(); const F=firebase.firestore.FieldValue; const has=(CACHE.reactions["s_"+id]?.likes||[]).includes(ME.id);
  fbDB.collection("reactions").doc("s_"+id).set({ likes: has?F.arrayRemove(ME.id):F.arrayUnion(ME.id), dislikes:F.arrayRemove(ME.id) },{merge:true}).catch(e=>toast(e.code||e.message));
  if(!has){ const s=allStatuses().find(x=>x.id===id); if(s) notify(s.userId,"like",`${ME.name} liked your post 👍`); } }
function stDislike(id){ if(!ME) return openEmailAuth(); const F=firebase.firestore.FieldValue; const has=(CACHE.reactions["s_"+id]?.dislikes||[]).includes(ME.id);
  fbDB.collection("reactions").doc("s_"+id).set({ dislikes: has?F.arrayRemove(ME.id):F.arrayUnion(ME.id), likes:F.arrayRemove(ME.id) },{merge:true}).catch(e=>toast(e.code||e.message)); }
function stComment(id){ const el=$("sc_"+id); const t=(el?.value||"").trim(); if(!t) return toast("Write a comment first");
  if(!ME) return openEmailAuth();
  fbDB.collection("comments").add({ statusId:id, uid:ME.id, name:ME.name, text:t, time:Date.now() }).catch(e=>toast(e.code||e.message));
  const s=allStatuses().find(x=>x.id===id); if(s) notify(s.userId,"comment",`${ME.name} commented: "${t.slice(0,50)}"`); }
function editComment(cid){ const c=CACHE.comments.find(x=>x.id===cid); if(!c) return; if(!ME||c.uid!==ME.id) return;
  const t=prompt("Edit your comment:", c.text); if(t==null) return; const v=t.trim(); if(!v) return toast("Comment can't be empty");
  fbDB.collection("comments").doc(cid).update({ text:v, edited:true }).then(()=>toast("Comment updated")).catch(e=>toast(e.code||e.message)); }
function deleteComment(cid){ const c=CACHE.comments.find(x=>x.id===cid); if(!ME||!c||c.uid!==ME.id) return; if(!confirm("Delete this comment?")) return;
  fbDB.collection("comments").doc(cid).delete().then(()=>toast("Comment deleted")).catch(e=>toast(e.code||e.message)); }

// ---------- track like/dislike (music = reactions only) ----------
function toggleLike(id){ if(!ME) return openEmailAuth(); const F=firebase.firestore.FieldValue; const has=(CACHE.reactions["t_"+id]?.likes||[]).includes(ME.id);
  fbDB.collection("reactions").doc("t_"+id).set({ likes: has?F.arrayRemove(ME.id):F.arrayUnion(ME.id), dislikes:F.arrayRemove(ME.id) },{merge:true}).catch(e=>toast(e.code||e.message));
  if(!has){ const t=allTracks().find(x=>x.id===id); if(t) notify(t.userId,"like",`${ME.name} liked your track "${t.title}" 👍`); } }
function toggleDislike(id){ if(!ME) return openEmailAuth(); const F=firebase.firestore.FieldValue; const has=(CACHE.reactions["t_"+id]?.dislikes||[]).includes(ME.id);
  fbDB.collection("reactions").doc("t_"+id).set({ dislikes: has?F.arrayRemove(ME.id):F.arrayUnion(ME.id), likes:F.arrayRemove(ME.id) },{merge:true}).catch(e=>toast(e.code||e.message)); }

// ---------- playlists from folders ----------
function playlistBlock(p,owner){
  if(!state.openPlaylists) state.openPlaylists=new Set();
  const open=state.openPlaylists.has(p.id);
  const rows=p.files.map((f,i)=>`<div class="trow" data-action="playfile" data-pl="${p.id}" data-file="${esc(f)}"><div class="tn" id="tn_${p.id}_${i}">${i+1}</div><div class="ttitle">${esc(f.replace(/\.[^.]+$/,''))}</div><span class="tplay">▶</span></div>`).join("");
  const acts=owner?`<div class="pl-actions"><button class="btn sm" data-action="setthumbs" data-pl="${p.id}">${p.thumbs?'covers ✓':'＋ covers'}</button><button class="btn sm" data-action="relink" data-pl="${p.id}">re-link</button></div>`:"";
  return `<div class="playlist">
    <div class="playlist-head" data-action="togglepl" data-pl="${p.id}">
      <div class="pl-ic">📁</div>
      <div style="flex:1"><div class="pl-name">${esc(p.name)}</div><div class="pl-sub">${p.files.length} tracks · folder</div></div>
      ${acts}<span class="pl-toggle">${open?'−':'+'}</span>
    </div>
    ${open?`<div class="tracklist">${rows}</div>`:''}
  </div>`;
}
async function loadCovers(p){
  if(!p.thumbs) return; let c=dirCache[p.id]; if(!c||!c.thumbs){ const h=await fsGet(p.id+"_thumbs"); if(h&&await ensurePerm(h)){ c=dirCache[p.id]=dirCache[p.id]||{}; c.thumbs=h; } }
  if(!c||!c.thumbs) return;
  for(let i=0;i<p.files.length;i++){ const base=p.files[i].replace(/\.[^.]+$/,""); const el=document.getElementById(`tn_${p.id}_${i}`); if(!el) continue;
    for(const ext of [".jpg",".jpeg",".png",".webp",".gif"]){ try{ const fh=await c.thumbs.getFileHandle(base+ext); const file=await fh.getFile(); el.style.cssText="background:url('"+URL.createObjectURL(file)+"') center/cover"; el.textContent=""; break; }catch{} } }
}
async function shareMusicFolder(){
  if(!window.showDirectoryPicker){ mobilePickFiles(); return; }
  let dir; try{ dir=await window.showDirectoryPicker(); }catch{ return; }
  const fileNames=[]; for await(const e of dir.values()){ if(e.kind==="file"&&/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(e.name)) fileNames.push(e.name); }
  if(!fileNames.length) return toast("No audio files in that folder."); fileNames.sort();
  if(!ME) return toast("Please log in first.");
  const id="pl_"+Date.now();
  const d=db(); d.playlists.unshift({ id, userId:ME.id, name:dir.name, files:fileNames, thumbs:null, createdAt:Date.now() });
  commit(d); dirCache[id]={ music:dir }; await fsPut(id+"_music",dir);
  toast(`Uploading "${dir.name}" — ${fileNames.length} tracks to cloud…`); go("mymusic");
  let done=0,failed=0;
  for(const fname of fileNames){
    try{
      const fh=await dir.getFileHandle(fname); const f=await fh.getFile();
      const buf=await fileToArrayBuffer(f);
      const blob=new Blob([buf],{type:f.type||"audio/mpeg"});
      await audioPut(id+"/"+fname,blob);
      const url=await uploadToCloudinary(blob);
      await fbDB.collection("tracks").add({ userId:ME.id, title:fname.replace(/\.[^.]+$/,""), src:url, playlistId:id, playlistName:dir.name, genre:"Other", accent:COLORS[Math.floor(Math.random()*COLORS.length)], coverImg:"", visibility:"public", createdAt:Date.now()+done });
      done++;
    }catch(e){ failed++; console.warn("upload fail",fname,e); }
    toast(`Uploading "${dir.name}"… ${done+failed}/${fileNames.length}`);
  }
  toast(failed?`"${dir.name}" — ${done} tracks uploaded ☁️, ${failed} failed.`:`"${dir.name}" — all ${done} tracks on the cloud ☁️`);
}
function mobilePickFiles(){
  const inp=document.createElement("input");
  inp.type="file"; inp.accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac"; inp.multiple=true;
  inp.onchange=async()=>{
    const files=[...inp.files]; if(!files.length) return;
    openOverlay(`<h2>📁 Name your playlist</h2><p class="sub">${files.length} track${files.length>1?'s':''} selected.</p>
      <div class="field"><label>Playlist name</label><input class="fb-field" id="plName" placeholder="e.g. My AI Music" value="My Music" /></div>
      <button class="btn primary block" data-action="savemobilepl">Save &amp; cache tracks</button>`);
    window._mobileFiles=files;
  };
  inp.click();
}
async function saveMobilePlaylist(){
  const files=window._mobileFiles; if(!files||!files.length) return;
  const name=($("plName").value||"").trim()||"My Music";
  closeOverlay();
  if(!ME) return toast("Please log in first.");
  const id="pl_"+Date.now();
  const d=db(); d.playlists.unshift({ id, userId:ME.id, name, files:files.map(f=>f.name), thumbs:null, createdAt:Date.now() });
  commit(d); toast(`Uploading ${files.length} track${files.length>1?'s':''}…`); go("mymusic");
  let done=0,failed=0;
  for(const f of files){
    try{
      const buf=await fileToArrayBuffer(f);
      const blob=new Blob([buf],{type:f.type||"audio/mpeg"});
      await audioPut(id+"/"+f.name,blob);
      const url=await uploadToCloudinary(blob);
      await fbDB.collection("tracks").add({ userId:ME.id, title:f.name.replace(/\.[^.]+$/,""), src:url, playlistId:id, playlistName:name, genre:"Other", accent:COLORS[Math.floor(Math.random()*COLORS.length)], coverImg:"", visibility:"public", createdAt:Date.now()+done });
      done++;
    }catch(e){ failed++; console.warn("upload fail",f.name,e); }
    toast(`Uploading… ${done+failed}/${files.length}`);
  }
  window._mobileFiles=null;
  toast(failed?`"${name}" — ${done} tracks on cloud ☁️, ${failed} failed.`:`"${name}" — all ${done} tracks on the cloud ☁️`);
}
async function setThumbsFolder(plId){ if(!window.showDirectoryPicker) return toast("Needs Chrome/Edge."); let dir; try{ dir=await window.showDirectoryPicker(); }catch{ return; }
  const d=db(); const p=d.playlists.find(x=>x.id===plId); if(p){ p.thumbs=dir.name; commit(d); } dirCache[plId]=dirCache[plId]||{}; dirCache[plId].thumbs=dir; await fsPut(plId+"_thumbs",dir); toast("Thumbnails linked ✓"); renderMain(); }
async function relinkFolder(plId){ if(!window.showDirectoryPicker) return toast("Needs Chrome/Edge."); let dir; try{ dir=await window.showDirectoryPicker(); }catch{ return; }
  const files=[]; for await(const e of dir.values()){ if(e.kind==="file"&&/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(e.name)) files.push(e.name); } files.sort();
  const d=db(); const p=d.playlists.find(x=>x.id===plId); if(p){ p.files=files; p.name=dir.name; commit(d); } dirCache[plId]=dirCache[plId]||{}; dirCache[plId].music=dir; await fsPut(plId+"_music",dir); toast("Re-linked ✓"); renderMain(); }
async function playFolderTrack(plId,file){
  const cacheKey=plId+"/"+file;
  const title=file.replace(/\.[^.]+$/,"");
  const artist=userById(db().playlists.find(x=>x.id===plId)?.userId)?.name||currentUser()?.name||"";
  // 1 — serve from offline cache if available
  const cached=await audioGet(cacheKey);
  if(cached){ showPlayer(title,artist,"#FB7A28",URL.createObjectURL(cached)); return; }
  // 2 — read from folder (cloud drive or local), then cache for offline
  let c=dirCache[plId]; if(!c||!c.music){ const h=await fsGet(plId+"_music"); if(h&&await ensurePerm(h)){ c=dirCache[plId]=dirCache[plId]||{}; c.music=h; } }
  if(!c||!c.music){ const p=db().playlists.find(x=>x.id===plId); return toast(`Re-link "${p?p.name:'folder'}" to play. (Tip: play tracks once while online to cache them for offline.)`); }
  try{
    const fh=await c.music.getFileHandle(file); const f=await fh.getFile();
    const url=URL.createObjectURL(f);
    showPlayer(title,artist,"#FB7A28",url);
    // cache as blob so it's playable offline next time (fire-and-forget)
    f.arrayBuffer().then(buf=>audioPut(cacheKey,new Blob([buf],{type:f.type||"audio/mpeg"}))).catch(()=>{});
  } catch{ toast("Couldn't read that file — try re-linking."); }
}

// ---------- single track upload ----------
function openUpload(){
  if(!currentUser()) return openEmailAuth();
  openOverlay(`<h2>Add a single track</h2><p class="sub">Publish now or keep private until ready.</p>
    <div class="field"><label>Track title</label><input id="upTitle" placeholder="e.g. Midnight Bloom" /></div>
    <div class="field"><label>Cover photo (optional)</label>
      <div class="covup"><div class="covprev" id="covPrev" style="background:${COLORS[0]}">◎</div>
        <div><input type="file" id="covFile" accept="image/*" /><div class="note" style="margin-top:4px">JPG/PNG — or pick a color below.</div></div></div></div>
    <div class="field"><label>Cover color</label><div class="swatches" id="swatches">${COLORS.map((c,i)=>`<div class="swatch ${i===0?'sel':''}" style="background:${c}" data-action="swatch" data-c="${c}"></div>`).join("")}</div></div>
    <div class="field"><label>Audio file <span style="font-weight:400;color:var(--muted)">(pick from your device)</span></label>
      <input type="file" id="audioFile" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac" />
      <div class="note" id="audioFilename" style="margin-top:4px"></div></div>
    <div class="field"><label>Or audio link</label><input id="upSrc" placeholder="https://…/song.mp3" /></div>
    <div class="field"><label>Genre</label><select id="upGenre" class="fb-field">${GENRES.map(g=>`<option value="${g}">${g}</option>`).join("")}</select></div>
    <div class="field"><label>Visibility</label><div class="radio-row" id="visRow"><div class="radio-card sel" data-action="vis" data-v="public"><b>Public</b>Everyone can play it</div><div class="radio-card" data-action="vis" data-v="private"><b>Private</b>Only you, until you publish</div></div></div>
    <label class="check"><input type="checkbox" id="upShare" checked> Allow fans to share this track</label>
    <button class="btn primary block" data-action="dopublish">Add to my music</button>`);
  window._upColor=COLORS[0]; window._upVis="public"; window._trackCover=null; window._audioFile=null;
}
function fileToArrayBuffer(file){
  if(file.arrayBuffer) return file.arrayBuffer();
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsArrayBuffer(file); });
}
async function doPublish(){
  const title=($("upTitle").value||"").trim(); if(!title) return toast("Give it a title"); if(!ME) return openEmailAuth();
  const coverImg=window._trackCover||"";
  if(coverImg&&coverImg.length>900000) return toast("Cover photo is too large — use a smaller image (under ~600KB).");
  let src=($("upSrc").value||"").trim();
  if(src.startsWith("blob:")){ return toast("Blob URLs can't be shared — please use the 'Choose audio file' button to upload your file directly."); }
  if(src.startsWith("file://")){ return toast("Local file paths can't be shared — please use the 'Choose audio file' button to upload your file directly."); }
  if(!src && !window._audioFile){ return toast("Please add an audio file or paste a music link."); }
  if(window._audioFile){
    const file=window._audioFile;
    const pubBtn=document.querySelector('[data-action="dopublish"]');
    if(pubBtn){ pubBtn.disabled=true; pubBtn.textContent="Uploading… 0%"; }
    try{
      src=await new Promise((resolve,reject)=>{
        const fd=new FormData();
        fd.append("file",file);
        fd.append("upload_preset","okmusic_audio");
        const xhr=new XMLHttpRequest();
        xhr.open("POST","https://api.cloudinary.com/v1_1/llka5use/video/upload");
        xhr.upload.onprogress=e=>{ if(e.lengthComputable&&pubBtn) pubBtn.textContent=`Uploading… ${Math.round(e.loaded/e.total*100)}%`; };
        xhr.onload=()=>{ try{ const r=JSON.parse(xhr.responseText); if(r.secure_url) resolve(r.secure_url); else reject(new Error(r.error?.message||"Upload failed")); }catch(err){ reject(err); } };
        xhr.onerror=()=>reject(new Error("Network error — check your connection"));
        xhr.send(fd);
      });
    }catch(e){
      if(pubBtn){ pubBtn.disabled=false; pubBtn.textContent="Add to my music"; }
      return toast("Upload failed: "+(e.message||e)+". Check your connection and try again.");
    }
  }
  fbDB.collection("tracks").add({ userId:ME.id, title, src, genre:($("upGenre")&&$("upGenre").value)||"Other", accent:window._upColor||COLORS[0], coverImg, visibility:window._upVis||"public", share:!!($("upShare")&&$("upShare").checked), createdAt:Date.now() })
    .then(()=>{ closeOverlay(); window._trackCover=null; window._audioFile=null; toast(window._upVis==="private"?"Saved private 🔒":"Published! 🎵"); go("mymusic"); })
    .catch(e=>toast("Couldn't save: "+(e.code||e.message))); }

// ---------- Cloudinary upload helpers ----------
function uploadMediaToCloudinary(file){
  // Always use video/upload — the okmusic_audio preset is configured for that endpoint
  // and Cloudinary serves the resulting URL correctly for any file type (image, audio, video)
  return new Promise((resolve,reject)=>{
    const fd=new FormData();
    fd.append("file",file);
    fd.append("upload_preset","okmusic_audio");
    const xhr=new XMLHttpRequest();
    xhr.open("POST","https://api.cloudinary.com/v1_1/llka5use/video/upload");
    xhr.onload=()=>{ try{ const r=JSON.parse(xhr.responseText); if(r.secure_url) resolve(r.secure_url); else reject(new Error(r.error?.message||"Upload failed")); }catch(err){ reject(err); } };
    xhr.onerror=()=>reject(new Error("Network error"));
    xhr.send(fd);
  });
}
function uploadToCloudinary(blob, onProgress){
  return new Promise((resolve,reject)=>{
    const fd=new FormData();
    fd.append("file",blob);
    fd.append("upload_preset","okmusic_audio");
    const xhr=new XMLHttpRequest();
    xhr.open("POST","https://api.cloudinary.com/v1_1/llka5use/video/upload");
    if(onProgress) xhr.upload.onprogress=e=>{ if(e.lengthComputable) onProgress(Math.round(e.loaded/e.total*100)); };
    xhr.onload=()=>{ try{ const r=JSON.parse(xhr.responseText); if(r.secure_url) resolve(r.secure_url); else reject(new Error(r.error?.message||"Upload failed")); }catch(err){ reject(err); } };
    xhr.onerror=()=>reject(new Error("Network error — check your connection"));
    xhr.send(fd);
  });
}

async function migrateTrack(trackId){
  const t=allTracks().find(x=>x.id===trackId); if(!t) return;
  const blob=await audioGet(t.src.slice(6));
  if(!blob){ toast("Audio file not found on this device. Use '＋ Add link' to paste a public URL instead."); return; }
  const btn=document.querySelector(`[data-action="migratetrack"][data-id="${trackId}"]`);
  if(btn){ btn.disabled=true; btn.textContent="Uploading… 0%"; }
  try{
    const url=await uploadToCloudinary(blob, pct=>{ if(btn) btn.textContent=`Uploading… ${pct}%`; });
    await fbDB.collection("tracks").doc(trackId).update({src:url});
    toast(`"${t.title}" is now on the cloud ☁️ — everyone can hear it!`);
    renderMyMusic();
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent="☁️ Move to cloud"; }
    toast("Migration failed: "+(e.message||e));
  }
}

async function migrateAllLocal(){
  const locals=tracksByUser(ME.id,true).filter(t=>t.src&&t.src.startsWith("local:"));
  if(!locals.length) return toast("No local tracks to migrate.");
  const allBtn=document.querySelector('[data-action="migratealltracks"]');
  if(allBtn){ allBtn.disabled=true; allBtn.textContent=`Migrating… 0/${locals.length}`; }
  let done=0,failed=0;
  for(const t of locals){
    const blob=await audioGet(t.src.slice(6));
    if(!blob){ failed++; continue; }
    try{
      const url=await uploadToCloudinary(blob);
      await fbDB.collection("tracks").doc(t.id).update({src:url});
      done++;
      if(allBtn) allBtn.textContent=`Migrating… ${done}/${locals.length}`;
    }catch(e){ failed++; }
  }
  toast(failed?`${done} moved to cloud ☁️, ${failed} could not be found on this device.`:`All ${done} track${done!==1?"s":""} moved to cloud ☁️ — everyone can now stream them!`);
  renderMyMusic();
}

// ---------- my music ----------
function renderMyMusic(){
  const u=currentUser(); const tracks=tracksByUser(u.id,true); const pls=playlistsByUser(u.id);
  const localCount=tracks.filter(t=>t.src&&t.src.startsWith("local:")).length;
  const rows=tracks.map(t=>{
    const isLocal=t.src&&t.src.startsWith("local:");
    return `<div class="mrow"><div class="mart" style="background:${grad(t.accent)}">◎</div>
    <div class="minfo"><div class="mt">${esc(t.title)}${isLocal?'<span class="local-badge">📵 Local only</span>':''}</div><div class="ms">▶ ${nfmt(playCount(t.id))} · 👍 ${nfmt(likeCount(t.id))} · 👎 ${nfmt(dislikeCount(t.id))} <span class="pill ${t.visibility==='private'?'prv':'pub'}">${t.visibility==='private'?'Private':'Public'}</span></div></div>
    ${isLocal?`<button class="btn sm primary" data-action="migratetrack" data-id="${t.id}" title="Upload this track to the cloud so all fans can hear it">☁️ Move to cloud</button><button class="btn sm" data-action="addlink" data-id="${t.id}" data-title="${esc(t.title)}" title="Paste a public URL instead">＋ Add link</button>`:''}
    ${t.visibility==='private'?`<button class="btn sm primary" data-action="publish" data-id="${t.id}">Publish</button>`:`<button class="btn sm" data-action="unpublish" data-id="${t.id}">Hide</button>`}
    <button class="btn sm" data-action="deltrack" data-id="${t.id}" style="color:#e2554f;border-color:#f0b3b3">Delete</button></div>`;
  }).join("");
  const migrateBanner=localCount?`<div class="migrate-banner">📵 <b>${localCount} track${localCount!==1?"s":""} stored locally</b> — only you can hear them on this device. Move them to the cloud so your fans can listen everywhere.<button class="btn sm primary" data-action="migratealltracks" style="margin-left:12px">☁️ Move all to cloud</button></div>`:"";
  $("page").innerHTML=`<div class="h-title">My Music</div>
    ${migrateBanner}
    <div class="folder-banner">📁 <b>Share your music — works on mobile and desktop.</b> On <b>mobile</b>: tap "Add a folder" to pick music files directly from your phone, iCloud, or Google Drive. On <b>desktop</b> (Chrome/Edge): pick an entire folder from your computer or cloud drive. All tracks are cached after selection so they play even when offline.
      <div class="folder-note">☁️ <b>Cloud drive tip (desktop):</b> Make sure your cloud drive is set to <b>sync files locally</b> (not "stream-only"). In Google Drive: Preferences → open files online only → off. In Dropbox: right-click folder → Make available offline.</div>
    <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap"><button class="btn primary" data-action="sharefolder">📁 Add a folder</button><button class="btn" data-action="upload">＋ Add single track</button></div>
    ${pls.length?`<div class="section-title">Playlists (folders)</div>${pls.map(p=>playlistBlock(p,true)).join("")}`:""}
    ${tracks.length?`<div class="section-title">Single tracks</div>${rows}`:""}
    ${(!pls.length&&!tracks.length)?'<div class="empty">No music yet — share a folder to begin.</div>':""}`;
  pls.forEach(loadCovers);
}
function setVisibility(id,v){ fbDB.collection("tracks").doc(id).update({ visibility:v }).then(()=>toast(v==="public"?"Published 🎉 (now public)":"Hidden — set to private 🔒")).catch(e=>toast(e.code||e.message)); }
function deleteTrack(id){ if(!confirm("Delete this track permanently? This cannot be undone.")) return; fbDB.collection("tracks").doc(id).delete().then(()=>toast("Track deleted")).catch(e=>toast(e.code||e.message)); }

function openAddLink(trackId,title){
  openOverlay(`<h2>🔗 Add streaming link</h2>
    <p class="sub">Paste a public URL so your fans can stream <b>${esc(title)}</b> directly in OK Music.</p>
    <div class="field"><label>Audio link (direct .mp3, SoundCloud, etc.)</label>
      <input id="addLinkUrl" placeholder="https://…/track.mp3" style="width:100%" /></div>
    <div class="note" style="margin:8px 0 16px">Works with any direct audio URL. For SoundCloud: right-click a track → Copy link.</div>
    <button class="btn primary block" data-action="savetracklink" data-id="${trackId}">Save link</button>`);
}

async function saveTrackLink(trackId){
  const url=($("addLinkUrl")||{value:""}).value.trim();
  if(!url) return toast("Please paste a link first.");
  if(!url.startsWith("http")) return toast("Link must start with http:// or https://");
  try{
    await fbDB.collection("tracks").doc(trackId).update({src:url});
    closeOverlay();
    toast("Streaming link saved! Fans can now play this track. ✓");
  }catch(e){ toast("Save failed: "+(e.code||e.message)); }
}

// ---------- edit profile (photo + bg + bio) ----------
function openCustomize(){
  const u=currentUser();
  const bannerStyle=u.bgImg?`background-image:url('${u.bgImg}');background-size:cover;background-position:center`:`background:linear-gradient(135deg,var(--orange-2),var(--orange-3))`;
  const pageBgStyle=u.pageBgImg?`background-image:url('${u.pageBgImg}');background-size:cover;background-position:center`:`background:var(--orange-1)`;
  openOverlay(`<h2>🎨 Edit profile</h2><p class="sub">Make your page unique — fans see all of this on any device.</p>
    <div class="field"><label>Profile photo</label><div class="avup"><div class="avprev" id="avPrev" style="${u.avatarImg?`background-image:url('${u.avatarImg}')`:''}">${u.avatarImg?'':initials(u.name)}</div>
      <div><input type="file" id="avFile" accept="image/*" /><div class="note" style="margin-top:4px">JPG/PNG — or paste a link below.</div></div></div></div>
    <div class="field"><label>Photo link (optional)</label><input id="avUrl" placeholder="https://…/photo.jpg" /></div>
    <div class="field"><label>Bio</label><textarea id="bgBio" placeholder="Tell fans about your music…">${esc(u.bio||"")}</textarea></div>
    <div class="field">
      <label>🖼️ Banner — wide photo at the top of your page</label>
      <div class="cust-banner-prev" id="bannerPrev" style="${bannerStyle}"><span class="cust-hint">Concert · Album art · Artist photo</span></div>
      <input type="file" id="bannerFile" accept="image/*" style="margin-top:6px" />
      <input id="bannerUrl" placeholder="Or paste a banner image link" value="${esc(u.bgImg||"")}" style="margin-top:6px;width:100%" />
    </div>
    <div class="field">
      <label>🌄 Page background image</label>
      <div class="cust-bg-prev" id="pageBgPrev" style="${pageBgStyle}"><span class="cust-hint" style="color:rgba(60,30,0,.6)">Shown behind your whole page</span></div>
      <input type="file" id="pageBgFile" accept="image/*" style="margin-top:6px" />
      <input id="pageBgUrl" placeholder="Or paste a background image link" value="${esc(u.pageBgImg||"")}" style="margin-top:6px;width:100%" />
    </div>
    <div class="field"><label>Banner colour (if no photo)</label>
      <div class="theme-grid" id="themeGrid">${THEMES.map(t=>`<div class="theme-swatch ${(u.bgTheme||"")===t.id?'sel':''}" style="background:${t.css}" data-action="theme" data-t="${t.id}" title="${t.label}"><span class="theme-label">${t.label}</span></div>`).join("")}</div></div>
    <div class="field"><label>Or a solid colour</label><div class="swatches" id="bgSw">${["#FFCBA0","#7c5cff","#36d1c4","#ff5c7c","#2bbf4e","#5c8bff","#33272f"].map(c=>`<div class="swatch ${u.bgColor===c&&!u.bgTheme?'sel':''}" style="background:${c}" data-action="bgcolor" data-c="${c}"></div>`).join("")}</div></div>
    <button class="btn primary block" data-action="savecustom">Save profile</button>`);
  window._bgColor=u.bgColor||""; window._bgTheme=u.bgTheme||""; window._avatar=null; window._bannerFile=null; window._pageBgFile=null;
}
async function saveCustom(){
  if(!ME) return;
  const saveBtn=document.querySelector('[data-action="savecustom"]');
  if(saveBtn){ saveBtn.disabled=true; saveBtn.textContent="Saving…"; }
  const url=($("avUrl").value||"").trim();
  const upd={ bio:($("bgBio").value||"").trim()||ME.bio||"", bgColor:window._bgTheme?"":(window._bgColor||""), bgTheme:window._bgTheme||"" };
  if(window._avatar){ if(window._avatar.length>700000){ if(saveBtn){saveBtn.disabled=false;saveBtn.textContent="Save profile";} return toast("Photo too big — paste a link instead."); } upd.avatarImg=window._avatar; }
  else if(url) upd.avatarImg=url;
  if(window._bannerFile){
    try{ if(saveBtn) saveBtn.textContent="Uploading banner…"; upd.bgImg=await uploadMediaToCloudinary(window._bannerFile); }
    catch(e){ if(saveBtn){saveBtn.disabled=false;saveBtn.textContent="Save profile";} return toast("Banner upload failed: "+(e.message||e)); }
  } else { const v=($("bannerUrl")||{value:""}).value.trim(); if(v) upd.bgImg=v; }
  if(window._pageBgFile){
    try{ if(saveBtn) saveBtn.textContent="Uploading background…"; upd.pageBgImg=await uploadMediaToCloudinary(window._pageBgFile); }
    catch(e){ if(saveBtn){saveBtn.disabled=false;saveBtn.textContent="Save profile";} return toast("Background upload failed: "+(e.message||e)); }
  } else { const v=($("pageBgUrl")||{value:""}).value.trim(); if(v) upd.pageBgImg=v; }
  fbDB.collection("users").doc(ME.id).set(upd,{merge:true})
    .then(()=>{ Object.assign(ME,upd); closeOverlay(); toast("Profile saved ✨"); go("profile",{profileId:ME.id}); })
    .catch(e=>{ if(saveBtn){saveBtn.disabled=false;saveBtn.textContent="Save profile";} toast("Couldn't save: "+(e.code||e.message)); });
}

// ---------- invite ----------
function openInvite(){ const u=currentUser(); const link=`${location.origin}${location.pathname}?ref=${u?u.handle:""}`;
  openOverlay(`<h2>✉️ Invite friends</h2><p class="sub">Share your link — friends who join can follow you back and grow your fanbase.</p>
    <div class="invite-link"><input id="invLink" value="${esc(link)}" readonly /><button class="btn primary" data-action="copyinvite">Copy</button></div>`); }

// ---------- social ----------
function share(id){ const link=`${location.origin}${location.pathname}?track=${id}`; if(navigator.clipboard) navigator.clipboard.writeText(link).then(()=>toast("Share link copied ✓")).catch(()=>toast(link)); else toast(link); }
function toggleFollow(uid){ if(!ME) return openEmailAuth(); const F=firebase.firestore.FieldValue; const has=(CACHE.follows[ME.id]||[]).includes(uid);
  fbDB.collection("follows").doc(ME.id).set({ following: has?F.arrayRemove(uid):F.arrayUnion(uid) },{merge:true}).then(()=>toast(has?"Unfollowed":"You're now a fan ✓")).catch(e=>toast(e.code||e.message));
  if(!has) notify(uid,"follow",`${ME.name} is now one of your fans 🎉`); }
function logout(){ fbAuth.signOut(); }

// ---------- avatar lightbox ----------
function viewAvatar(uid){
  const u=userById(uid); if(!u) return;
  const body=u.avatarImg
    ? `<img src="${u.avatarImg}" class="avatar-full" />`
    : `<div class="avatar-full-initials" style="background:${u.color||'#FB7A28'}">${initials(u.name)}</div>`;
  openOverlay(`<div class="avatar-lightbox">${body}<div class="avlb-name">${esc(u.name)}</div><div class="avlb-handle">@${esc(u.handle||'')}</div></div>`);
}

// ---------- overlay ----------
function openOverlay(h){ $("overlayBody").innerHTML=`<div class="modal"><button class="modal-x" data-action="close">✕</button>${h}</div>`; $("overlay").hidden=false; }
function closeOverlay(){ $("overlay").hidden=true; $("overlayBody").innerHTML=""; }

// ---------- player ----------
let hasSrc=false;
function showPlayer(title,artist,accent,src){ $("miniplayer").classList.add("show"); $("mpArt").style.background=grad(accent); $("mpArt").textContent="◎"; $("mpTitle").textContent=title; $("mpArtist").textContent=artist;
  if(src){ hasSrc=true; audio.src=src; audio.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false)); } else { hasSrc=false; setPlaying(true); } }
async function playTrack(id){ const t=allTracks().find(x=>x.id===id); if(!t) return; const u=userById(t.userId); const d=db(); d.plays[id]=(d.plays[id]||0)+1; commit(d);
  nowPlayingId=id;
  if(t.src&&t.src.startsWith("local:")){
    const blob=await audioGet(t.src.slice(6));
    if(blob){ showPlayer(t.title,u.name,t.accent,URL.createObjectURL(blob)); }
    else if(ME&&ME.id===t.userId) openAddLink(t.id,t.title);
    else toast(`📵 "${esc(t.title)}" is stored locally on the artist's device and can't be streamed yet. The artist needs to add a public streaming link.`);
    return;
  }
  showPlayer(t.title,u.name,t.accent,t.src); if(!t.src) toast("Demo track — no audio linked yet. Reactions still work!"); }
function setPlaying(p){ $("mpPlay").textContent=p?"⏸":"▶"; }
function playQueue(direction){
  const queue=allTracks().filter(t=>t.src&&!t.src.startsWith("local:")&&t.visibility!=="private");
  if(!queue.length) return;
  if(playMode==="shuffle"){ playTrack(queue[Math.floor(Math.random()*queue.length)].id); return; }
  const idx=queue.findIndex(t=>t.id===nowPlayingId);
  const next=queue[(idx+direction+queue.length)%queue.length];
  playTrack(next.id);
}
function cyclePlayMode(){ const m=["continuous","repeat","shuffle"]; playMode=m[(m.indexOf(playMode)+1)%3]; updateModeBtn(); toast(playMode==="continuous"?"Continuous 🔁":playMode==="repeat"?"Repeat one 🔂":"Shuffle 🔀"); }
function updateModeBtn(){ const el=$("mpMode"); if(!el)return; const icons={continuous:"🔁",repeat:"🔂",shuffle:"🔀"}; el.textContent=icons[playMode]; el.classList.toggle("mode-on",playMode!=="continuous"); }
$("mpPlay").addEventListener("click",()=>{ if(!hasSrc)return; if(!audio.paused){audio.pause();setPlaying(false);}else{audio.play();setPlaying(true);} });
document.getElementById("mpMode").addEventListener("click",cyclePlayMode);
audio.addEventListener("ended",()=>{
  if(playMode==="repeat"){ audio.currentTime=0; audio.play().then(()=>setPlaying(true)).catch(()=>{}); return; }
  playQueue(1);
});
audio.addEventListener("timeupdate",()=>{ if(!audio.duration)return; $("mpFill").style.width=(audio.currentTime/audio.duration*100)+"%"; const s=Math.floor(audio.currentTime); $("mpTime").textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; });
$("mpProg").addEventListener("click",e=>{ if(!audio.duration)return; const r=e.currentTarget.getBoundingClientRect(); audio.currentTime=(e.clientX-r.left)/r.width*audio.duration; });

// ============ ADMIN STATS ============
function renderAdmin(){
  const users=Object.values(CACHE.users);
  const tracks=CACHE.tracks;
  const statuses=CACHE.statuses;
  const products=CACHE.products;
  const orders=CACHE.orders||[];
  const sellers=Object.values(CACHE.sellers);
  const pendingOrders=orders.filter(o=>o.status==="pending_payment");
  const totalRevenue=orders.reduce((s,o)=>s+(o.platformFee||0),0);

  const stat=(icon,label,value,sub="")=>`<div class="admin-stat">
    <div class="admin-stat-icon">${icon}</div>
    <div class="admin-stat-val">${value}</div>
    <div class="admin-stat-label">${label}</div>
    ${sub?`<div class="admin-stat-sub">${sub}</div>`:''}
  </div>`;

  const recentUsers=users.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0,10);

  $("page").innerHTML=`<div class="h-title">📊 Admin Stats</div>
    <div class="admin-grid">
      ${stat("👥","Registered users",users.length,"Real accounts in Firestore")}
      ${stat("🎵","Tracks shared",tracks.length,"")}
      ${stat("💬","Wall posts",statuses.length,"")}
      ${stat("🏪","Active sellers",sellers.length,"")}
      ${stat("📦","Products listed",products.length,"")}
      ${stat("🛒","Orders placed",orders.length,`${pendingOrders.length} pending payment`)}
      ${stat("💰","Platform fees earned","$"+totalRevenue.toFixed(2),"3% of completed sales")}
    </div>
    <div class="section-title" style="margin-top:28px">Latest sign-ups</div>
    ${recentUsers.length?recentUsers.map(u=>`<div class="mrow2">
      <div class="avatar" style="${avatarStyle(u,40)}">${u.avatarImg?'':initials(u.name)}</div>
      <div class="minfo"><div class="mt">${esc(u.name)} <span style="font-size:12px;color:var(--muted)">@${esc(u.handle||'')}</span></div>
        <div class="ms">${u.createdAt?timeAgo(u.createdAt):'unknown'}</div></div>
      </div>`).join(''):'<div class="empty">No users yet.</div>'}
    <div class="section-title" style="margin-top:28px">Broadcast</div>
    <div style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 2px 8px rgba(180,120,60,.08)">
      <p style="font-size:14px;margin:0 0 12px">Send the getting-started guide to every registered user as a notification they can read in the app.</p>
      <button class="btn primary" data-action="broadcastwelcome">📢 Send Instructions to All Users (${users.length})</button>
    </div>`;
}
async function broadcastWelcome(){
  if(!isAdmin()) return;
  const users=Object.values(CACHE.users).filter(u=>u.id&&!String(u.id).startsWith("u_"));
  if(!users.length) return toast("No users loaded yet — wait a moment and try again.");
  const text="📖 OK Music Guide updated! Cloud music, custom banners & page backgrounds, private chat with edit/delete, free voice calls, Marketplace & more. Tap to read the full guide.";
  let sent=0;
  for(const u of users){
    try{
      await fbDB.collection("notifications").add({ forUid:u.id, type:"welcome_broadcast", fromUid:"platform", fromName:"OK Music", text, time:Date.now(), read:false });
      sent++;
    }catch(e){ console.warn("broadcast fail",u.id,e.code); }
  }
  toast(`Guide sent to ${sent} user${sent!==1?"s":""} ✓`);
}

// ============ MARKETPLACE ============
function openMarketplace(){
  if(!ME) return openEmailAuth();
  openOverlay(`<div style="text-align:center;padding:8px 0 16px">
    <div style="font-size:40px;margin-bottom:8px">🛍️</div>
    <h2 style="margin:0 0 6px">OK Music Marketplace</h2>
    <p class="sub">Buy and sell with the OK Music community.</p>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:22px">
      <button class="btn primary block" data-action="gobuyer" style="font-size:16px;padding:14px">🛒 I want to buy</button>
      <button class="btn block" data-action="goseller" style="font-size:16px;padding:14px">🏪 I want to sell</button>
    </div>
  </div>`);
}
function goBuyer(){ closeOverlay(); go("marketplace"); }
function goSeller(){ closeOverlay(); CACHE.sellers[ME.id]?go("mystore"):openSellerSetup(); }

function openSellerSetup(){
  openOverlay(`<h2>🏪 Open your store</h2><p class="sub">Fill in your details to start selling on OK Music.</p>
    <div class="field"><label>Store name</label><input class="fb-field" id="slName" placeholder="e.g. Emmanuel's Merch" value="${esc(ME.name)}" /></div>
    <div class="field"><label>Location (city, country)</label><input class="fb-field" id="slLoc" placeholder="e.g. Montreal, Canada" /></div>
    <div class="field"><label>Your Payoneer email</label><input class="fb-field" id="slPayoneer" type="email" placeholder="your@payoneer.com" /></div>
    <p class="note" style="margin-top:4px">Buyers pay the platform first. You receive <b>97%</b> of each sale via Payoneer within 1–2 business days after payment clears.</p>
    <button class="btn primary block" data-action="doregisterseller" style="margin-top:16px">Continue →</button>`);
}
async function doRegisterSeller(){
  const name=($("slName").value||"").trim(), location=($("slLoc").value||"").trim(), payoneerEmail=($("slPayoneer").value||"").trim();
  if(!name||!location) return toast("Fill in all fields");
  if(!payoneerEmail||!payoneerEmail.includes("@")) return toast("Enter a valid Payoneer email");
  try{ await fbDB.collection("sellers").doc(ME.id).set({ name, location, payoneerEmail, uid:ME.id, createdAt:Date.now() });
    toast("Store created! 🎉"); closeOverlay(); go("mystore"); }
  catch(e){ toast("Couldn't create store: "+(e.code||e.message)); }
}

// ---------- seller store management ----------
function renderSellerStore(){
  const seller=CACHE.sellers[ME.id];
  if(!seller){ openSellerSetup(); return; }
  const products=CACHE.products.filter(p=>p.sellerId===ME.id);
  $("page").innerHTML=`<div class="h-title">🏪 My Store</div>
    <div class="mp-store-header">
      <div><b>${esc(seller.name)}</b> · 📍 ${esc(seller.location)}</div>
      <button class="btn primary" data-action="addproduct">＋ Add product</button>
    </div>
    ${products.length
      ?`<div class="mp-grid">${products.map(mpSellerCard).join("")}</div>`
      :'<div class="empty" style="margin-top:24px">No products yet — click "Add product" to list your first item.</div>'}`;
}
function mpSellerCard(p){
  const photo=p.photos&&p.photos[0];
  return `<div class="mp-card">
    <div class="mp-photo" style="${photo?`background-image:url('${photo}');background-size:cover;background-position:center`:'background:var(--orange-1)'}" data-action="viewproduct" data-id="${p.id}">${photo?'':'📦'}</div>
    <div class="mp-card-body">
      <div class="mp-title">${esc(p.title)}</div>
      <div class="mp-price">$${parseFloat(p.price).toFixed(2)} <span class="mp-ship">+ $${parseFloat(p.shipping||0).toFixed(2)} ship</span></div>
      <div style="display:flex;gap:6px;margin-top:8px">
        <button class="btn sm" data-action="editproduct" data-id="${p.id}">Edit</button>
        <button class="btn sm" data-action="delproduct" data-id="${p.id}" style="color:#e2554f;border-color:#f0b3b3">Delete</button>
      </div>
    </div>
  </div>`;
}

function openProductForm(productId){
  const p=productId?CACHE.products.find(x=>x.id===productId):null;
  window._mpPhoto=p?.photos?.[0]||null;
  const prevStyle=window._mpPhoto?`background-image:url('${window._mpPhoto}');background-size:cover;background-position:center`:'background:var(--orange-1)';
  openOverlay(`<h2>${p?'Edit product':'Add a product'}</h2>
    <div class="field"><label>Title</label><input class="fb-field" id="mpTitle" placeholder="e.g. OK Music hoodie" value="${esc(p?.title||'')}" /></div>
    <div class="field"><label>Description</label><textarea class="fb-field" id="mpDesc" placeholder="Describe your product — material, size, condition…" style="min-height:90px">${esc(p?.description||'')}</textarea></div>
    <div class="field"><label>Category</label><select class="fb-field" id="mpCat">${MP_CATEGORIES.map(c=>`<option value="${c}" ${(p?.category||'Other')===c?'selected':''}>${c}</option>`).join("")}</select></div>
    <div class="field"><label>Price (USD)</label><input class="fb-field" id="mpPrice" type="number" min="0.01" step="0.01" placeholder="0.00" value="${p?.price||''}" /></div>
    <div class="field"><label>Shipping cost (USD)</label><input class="fb-field" id="mpShip" type="number" min="0" step="0.01" placeholder="0.00" value="${p?.shipping||''}" /></div>
    <div class="field"><label>Product photo</label>
      <div class="covup"><div class="covprev" id="mpPhotoPrev" style="${prevStyle}">${window._mpPhoto?'':'📦'}</div>
        <div><input type="file" id="mpPhotoFile" accept="image/*" /><div class="note" style="margin-top:4px">JPG/PNG — max ~600KB</div></div></div></div>
    <button class="btn primary block" data-action="dosaveproduct" data-id="${productId||''}" style="margin-top:16px">${p?'Save changes':'List product'}</button>`);
}
async function doSaveProduct(productId){
  const title=($("mpTitle").value||"").trim(), description=($("mpDesc").value||"").trim();
  const price=parseFloat($("mpPrice").value), shipping=parseFloat($("mpShip").value||"0")||0;
  const category=$("mpCat").value||"Other";
  if(!title||!description) return toast("Fill in title and description");
  if(!price||price<=0) return toast("Enter a valid price");
  if(window._mpPhoto&&window._mpPhoto.length>900000) return toast("Photo too large — use an image under ~600KB");
  const data={ sellerId:ME.id, title, description, category, price, shipping, photos:window._mpPhoto?[window._mpPhoto]:[], updatedAt:Date.now() };
  try{
    if(productId){ await fbDB.collection("products").doc(productId).update(data); toast("Product updated ✓"); }
    else{ data.createdAt=Date.now(); await fbDB.collection("products").add(data); toast("Product listed! 🎉"); }
    closeOverlay(); go("mystore");
  } catch(e){ toast("Couldn't save: "+(e.code||e.message)); }
}
function deleteProduct(id){
  if(!confirm("Delete this product? Cannot be undone.")) return;
  fbDB.collection("products").doc(id).delete().then(()=>toast("Product deleted")).catch(e=>toast(e.code||e.message));
}

// ---------- buyer browse ----------
function renderMarketplace(){
  const q=(state.mpSearch||"").toLowerCase();
  let list=CACHE.products.slice().sort((a,b)=>b.createdAt-a.createdAt);
  if(q) list=list.filter(p=>p.title.toLowerCase().includes(q)||(p.description||"").toLowerCase().includes(q)||(CACHE.sellers[p.sellerId]?.name||"").toLowerCase().includes(q));
  const cartCount=(state.cart||[]).length;
  $("page").innerHTML=`<div class="h-title">🛍️ Marketplace</div>
    <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center;flex-wrap:wrap">
      <input class="fb-field" id="mpSearch" placeholder="Search products or sellers…" value="${esc(state.mpSearch||'')}" style="flex:1;min-width:180px;margin:0" />
      <button class="btn ${cartCount?'primary':''}" data-action="nav" data-view="cart">🛒 Cart${cartCount?` (${cartCount})`:''}</button>
      <button class="btn" data-action="gosellerdirect">🏪 Sell</button>
    </div>
    ${list.length
      ?`<div class="mp-grid">${list.map(mpBuyerCard).join("")}</div>`
      :'<div class="empty">No products listed yet — be the first to sell!</div>'}`;
  setTimeout(()=>{ const s=$("mpSearch"); if(s) s.oninput=e=>{ state.mpSearch=e.target.value; renderMarketplace(); }; },0);
}
function mpBuyerCard(p){
  const photo=p.photos&&p.photos[0]; const seller=CACHE.sellers[p.sellerId]; const inCart=(state.cart||[]).includes(p.id);
  return `<div class="mp-card">
    <div class="mp-photo" style="${photo?`background-image:url('${photo}');background-size:cover;background-position:center`:'background:var(--orange-1)'}" data-action="viewproduct" data-id="${p.id}">${photo?'':'📦'}</div>
    <div class="mp-card-body">
      <div class="mp-title" data-action="viewproduct" data-id="${p.id}">${esc(p.title)}</div>
      <div class="mp-seller-name">${esc(seller?.name||'Seller')} · ${esc(seller?.location||'')}</div>
      <div class="mp-price">$${parseFloat(p.price).toFixed(2)} <span class="mp-ship">+ $${parseFloat(p.shipping||0).toFixed(2)} ship</span></div>
      <button class="btn sm ${inCart?'':'primary'}" data-action="addtocart" data-id="${p.id}" style="margin-top:8px;width:100%">${inCart?'In cart ✓':'Add to cart'}</button>
    </div>
  </div>`;
}
function viewProduct(id){
  const p=CACHE.products.find(x=>x.id===id); if(!p) return;
  const seller=CACHE.sellers[p.sellerId]; const photo=p.photos&&p.photos[0]; const inCart=(state.cart||[]).includes(id);
  openOverlay(`<div class="mp-detail">
    ${photo?`<div style="text-align:center;margin-bottom:12px"><img src="${photo}" class="mp-detail-img" data-action="zoomphoto" data-src="${photo}" /></div>`:''}
    <div class="mp-detail-title">${esc(p.title)}</div>
    <div class="mp-detail-cat">${esc(p.category||'')}</div>
    <div class="mp-detail-price">$${parseFloat(p.price).toFixed(2)} <span class="mp-ship" style="font-size:14px;font-weight:400">+ $${parseFloat(p.shipping||0).toFixed(2)} shipping</span></div>
    <div class="mp-detail-desc">${esc(p.description)}</div>
    <div class="mp-seller-card">👤 <b>${esc(seller?.name||'Unknown')}</b> · 📍 ${esc(seller?.location||'')}</div>
    <button class="btn ${inCart?'':'primary'} block" data-action="addtocart" data-id="${id}" style="margin-top:14px">${inCart?'✓ In cart — remove':'🛒 Add to cart'}</button>
    ${inCart?`<button class="btn primary block" data-action="nav" data-view="cart" style="margin-top:8px">Go to cart →</button>`:''}
  </div>`);
}
function zoomPhoto(src){
  openOverlay(`<div style="text-align:center"><img src="${src}" style="max-width:100%;max-height:75vh;border-radius:8px;object-fit:contain" /></div>`);
}

// ---------- cart ----------
function addToCart(id){
  if(!ME) return openEmailAuth();
  if(!state.cart) state.cart=[];
  const has=state.cart.includes(id);
  state.cart=has?state.cart.filter(x=>x!==id):[...state.cart,id];
  toast(has?"Removed from cart":"Added to cart 🛒");
  closeOverlay(); renderMain();
}
function removeFromCart(id){ state.cart=(state.cart||[]).filter(x=>x!==id); renderCart(); }
function renderCart(){
  if(!state.cart) state.cart=[];
  const items=state.cart.map(id=>CACHE.products.find(p=>p.id===id)).filter(Boolean);
  const subtotal=items.reduce((s,p)=>s+parseFloat(p.price),0);
  const shipping=items.reduce((s,p)=>s+parseFloat(p.shipping||0),0);
  const fee=+(subtotal*PLATFORM_FEE).toFixed(2);
  const total=+(subtotal+shipping+fee).toFixed(2);
  $("page").innerHTML=`<div class="h-title">🛒 My Cart</div>
    ${items.length?`
      <div class="cart-items">${items.map(p=>{ const photo=p.photos&&p.photos[0]; return `<div class="cart-row">
        <div class="cart-photo" style="${photo?`background-image:url('${photo}');background-size:cover;background-position:center`:'background:var(--orange-1)'}">${photo?'':'📦'}</div>
        <div class="cart-info"><div class="cart-title">${esc(p.title)}</div>
          <div class="cart-price">$${parseFloat(p.price).toFixed(2)} + $${parseFloat(p.shipping||0).toFixed(2)} ship</div>
          <div class="mp-seller-name">${esc(CACHE.sellers[p.sellerId]?.name||'Seller')}</div></div>
        <button class="btn sm" data-action="removecart" data-id="${p.id}" style="color:#e2554f;border-color:#f0b3b3;align-self:center">Remove</button>
      </div>`; }).join("")}</div>
      <div class="cart-summary">
        <div class="cart-line"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>
        <div class="cart-line"><span>Shipping</span><span>$${shipping.toFixed(2)}</span></div>
        <div class="cart-line"><span>Platform fee (3%)</span><span>$${fee.toFixed(2)}</span></div>
        <div class="cart-line cart-total"><span>Total</span><span>$${total.toFixed(2)}</span></div>
      </div>
      <button class="btn primary block" data-action="checkout" style="margin-top:18px;font-size:16px;padding:14px">Proceed to checkout →</button>
      <button class="btn block" data-action="nav" data-view="marketplace" style="margin-top:8px">← Continue shopping</button>`
    :'<div class="empty">Your cart is empty. <span data-action="nav" data-view="marketplace" style="color:var(--orange);cursor:pointer">Browse the marketplace →</span></div>'}`;
}

// ---------- checkout ----------
function openCheckout(){
  if(!state.cart||!state.cart.length) return go("cart");
  const items=state.cart.map(id=>CACHE.products.find(p=>p.id===id)).filter(Boolean);
  const subtotal=items.reduce((s,p)=>s+parseFloat(p.price),0);
  const shipping=items.reduce((s,p)=>s+parseFloat(p.shipping||0),0);
  const fee=+(subtotal*PLATFORM_FEE).toFixed(2);
  const total=+(subtotal+shipping+fee).toFixed(2);
  openOverlay(`<h2>📦 Checkout</h2>
    <p class="sub">${items.length} item${items.length>1?'s':''} · Total <b>$${total.toFixed(2)}</b></p>
    <div class="field"><label>Full name</label><input class="fb-field" id="ckName" placeholder="Your full name" value="${esc(ME?.name||'')}" /></div>
    <div class="field"><label>Email</label><input class="fb-field" id="ckEmail" type="email" placeholder="your@email.com" value="${esc(fbAuth.currentUser?.email||'')}" /></div>
    <div class="field"><label>Shipping address</label><textarea class="fb-field" id="ckAddr" placeholder="Street, City, Province/State, Postal code, Country" style="min-height:80px"></textarea></div>
    <div class="cart-summary" style="margin-top:12px">
      <div class="cart-line"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>
      <div class="cart-line"><span>Shipping</span><span>$${shipping.toFixed(2)}</span></div>
      <div class="cart-line"><span>Platform fee (3%)</span><span>$${fee.toFixed(2)}</span></div>
      <div class="cart-line cart-total"><span>Total</span><span>$${total.toFixed(2)}</span></div>
    </div>
    <button class="btn primary block" data-action="doorder" style="margin-top:16px;font-size:16px;padding:14px">Place order & get payment details</button>`);
}
async function doPlaceOrder(){
  const name=($("ckName").value||"").trim(), email=($("ckEmail").value||"").trim(), address=($("ckAddr").value||"").trim();
  if(!name||!email||!address) return toast("Fill in all fields");
  if(!email.includes("@")) return toast("Enter a valid email");
  const items=state.cart.map(id=>CACHE.products.find(p=>p.id===id)).filter(Boolean);
  if(!items.length) return toast("Cart is empty");
  const subtotal=items.reduce((s,p)=>s+parseFloat(p.price),0);
  const shippingTotal=items.reduce((s,p)=>s+parseFloat(p.shipping||0),0);
  const fee=+(subtotal*PLATFORM_FEE).toFixed(2);
  const total=+(subtotal+shippingTotal+fee).toFixed(2);
  try{
    const ref=await fbDB.collection("orders").add({
      buyerId:ME.id, buyerName:name, buyerEmail:email, buyerAddress:address,
      items:items.map(p=>({ productId:p.id, title:p.title, price:p.price, shipping:p.shipping||0, sellerId:p.sellerId })),
      subtotal, shipping:shippingTotal, platformFee:fee, total, status:"pending_payment", createdAt:Date.now()
    });
    state.cart=[];
    closeOverlay();
    openOverlay(`<div style="text-align:center;padding:8px">
      <div style="font-size:44px;margin-bottom:12px">✅</div>
      <h2>Order placed!</h2>
      <p class="sub">Order ID: <b>${ref.id.slice(0,8).toUpperCase()}</b></p>
      <div class="mp-payment-box">
        <div style="font-weight:800;font-size:15px;margin-bottom:10px">💳 Complete your payment via Payoneer</div>
        <p style="font-size:14px;margin-bottom:8px">Send <b>$${total.toFixed(2)} USD</b> to:</p>
        <div class="mp-payoneer-email">${PLATFORM_EMAIL}</div>
        <p style="font-size:12px;color:var(--muted);margin-top:10px">Include order ID <b>${ref.id.slice(0,8).toUpperCase()}</b> in the payment note so we can match your order.</p>
        <p style="font-size:12px;color:var(--muted);margin-top:6px">Your order will be confirmed and the seller notified within 1–2 business days after payment is received.</p>
      </div>
      <button class="btn primary block" data-action="close" style="margin-top:16px">Done</button>
    </div>`);
  } catch(e){ toast("Couldn't place order: "+(e.code||e.message)); }
}

// ---------- delegation ----------
// ---------- fans / following (fanbase list) ----------
function followingOf(uid){ return CACHE.follows[uid]||[]; }
function followersOf(uid){ const r=[]; for(const f in CACHE.follows){ if(CACHE.follows[f].includes(uid)) r.push(f); } return r; }
function userCard(u){
  if(!u) return "";
  const me=currentUser(); const self=me&&me.id===u.id;
  const btn=self?"":`<button class="btn sm ${isFollowing(u.id)?'':'primary'}" data-action="follow" data-uid="${u.id}">${isFollowing(u.id)?'Following ✓':'Follow back'}</button>`;
  return `<div class="mrow2">
    <div class="avatar" style="${avatarStyle(u,44)};cursor:pointer" data-action="viewavatar" data-uid="${u.id}">${u.avatarImg?'':initials(u.name)}</div>
    <div class="minfo"><div class="mt" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div><div class="ms">@${esc(u.handle)} · ${nfmt(followerCount(u.id))} fans</div></div>
    ${btn}</div>`;
}
function renderFans(){
  const me=currentUser(); if(!me) return;
  const tab=state.fanTab||"fans";
  const fans=followersOf(me.id).map(userById).filter(Boolean);
  const following=followingOf(me.id).map(userById).filter(Boolean);
  const list=tab==="fans"?fans:following;
  $("page").innerHTML=`<div class="h-title">My Fanbase</div>
    <div class="tabs">
      <button class="tab ${tab==='fans'?'active':''}" data-action="fantab" data-t="fans">Fans (${fans.length})</button>
      <button class="tab ${tab==='following'?'active':''}" data-action="fantab" data-t="following">Following (${following.length})</button>
    </div>
    ${list.length?list.map(userCard).join(""):`<div class="empty">${tab==='fans'?"No fans yet — share your invite link, post tracks and statuses to attract them! 🎶":"You're not following anyone yet. Open Discover and follow creators you love."}</div>`}`;
}

// ---------- notifications ----------
function notify(forUid,type,text){
  if(!ME||!forUid||forUid===ME.id) return;
  if(String(forUid).startsWith("u_")) return;          // skip seed/demo recipients
  fbDB.collection("notifications").add({ forUid, type, fromUid:ME.id, fromName:ME.name, text, time:Date.now(), read:false }).catch(()=>{});
}
let notifUnsub=null;
function startMyNotifications(){
  if(notifUnsub){ notifUnsub(); notifUnsub=null; }
  if(!ME||!ME.handle){ CACHE.notifications=[]; return; }
  notifUnsub=fbDB.collection("notifications").where("forUid","==",ME.id)
    .onSnapshot(s=>{ CACHE.notifications=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("notif",e.code));
}
function markAllRead(){
  const un=(CACHE.notifications||[]).filter(n=>!n.read); if(!un.length) return;
  const b=fbDB.batch(); un.forEach(n=>b.update(fbDB.collection("notifications").doc(n.id),{ read:true })); b.commit().catch(()=>{});
}
function renderNotifs(){
  const list=(CACHE.notifications||[]).slice().sort((a,b)=>b.time-a.time);
  $("page").innerHTML=`<div class="h-title">Notifications 🔔</div>${
    list.length?list.map(n=>{
      const isPlatform=n.fromUid==="platform";
      const isMsg=n.type==="message";
      const action=isPlatform?`data-action="showguide"`:isMsg?`data-action="openchat" data-uid="${n.fromUid}"`:`data-action="profile" data-uid="${n.fromUid}"`;
      const av=isPlatform
        ?`<div class="avatar" style="width:42px;height:42px;font-size:20px;background:var(--orange);flex-shrink:0;border-radius:50%;display:grid;place-items:center;color:#fff">◎</div>`
        :`<div class="avatar" style="${avatarStyle(userById(n.fromUid)||{color:'#FB7A28'},42)}">${(userById(n.fromUid)?.avatarImg)?'':initials(n.fromName||'?')}</div>`;
      return `<div class="mrow2" ${action} style="cursor:pointer;${n.read?'':'background:#fff7f1'}">${av}
        <div class="minfo"><div class="mt">${esc(n.text)}</div><div class="ms">${timeAgo(n.time)}</div></div></div>`;
    }).join("")
    :'<div class="empty">No notifications yet. When fans follow you or react to your music & posts, they\'ll show up here. 🔔</div>'}`;
  setTimeout(markAllRead,400);
}

// ---------- buzzing (trending chart) ----------
function renderBuzzing(){
  let list=allTracks().filter(t=>t.visibility==="public").map(t=>({ t, score:playCount(t.id)+likeCount(t.id)*5 }));
  list.sort((a,b)=>b.score-a.score); list=list.slice(0,25);
  $("page").innerHTML=`<div class="h-title">🔥 Buzzing right now</div>
    <p class="note" style="margin-bottom:14px">The community's hottest tracks, ranked by plays + likes.</p>
    ${list.map((x,i)=>{ const t=x.t, u=userById(t.userId); const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':('#'+(i+1));
      return `<div class="mrow2">
        <div style="width:34px;text-align:center;font-weight:900;color:var(--orange-deep)">${medal}</div>
        <div class="mart" style="background:${grad(t.accent)};cursor:pointer" data-action="play" data-id="${t.id}">◎</div>
        <div class="minfo"><div class="mt" data-action="play" data-id="${t.id}">${esc(t.title)}</div>
          <div class="ms" data-action="profile" data-uid="${u.id}">${esc(u.name)} · ▶ ${nfmt(playCount(t.id))} · 👍 ${nfmt(likeCount(t.id))}</div></div>
        <button class="btn sm primary" data-action="play" data-id="${t.id}">▶</button></div>`; }).join("")}`;
}

// ---------- suggestion box (collect ideas to improve the network) ----------
function openSuggest(){
  openOverlay(`<h2>💡 Help shape OK Music</h2><p class="sub">Tell us what to add or improve — every idea is read.</p>
    <div class="field"><textarea id="sgText" placeholder="e.g. Add direct messages between artists, a weekly Top-10 chart, dark mode…" style="min-height:110px"></textarea></div>
    <button class="btn primary block" data-action="sendsuggest">Send suggestion</button>
    <p class="note">Saved to the community suggestion box for the team to review. (A live Claude-powered assistant can be added later.)</p>`);
}
function sendSuggest(){
  const t=($("sgText").value||"").trim(); if(!t) return toast("Type your idea first");
  fbDB.collection("suggestions").add({ uid:(ME&&ME.id)||"guest", name:(ME&&ME.name)||"Guest", text:t, time:Date.now() })
    .then(()=>{ closeOverlay(); toast("Thank you! Your idea was sent 💜"); })
    .catch(e=>toast("Couldn't send: "+(e.code||e.message)));
}

document.addEventListener("click",e=>{
  const el=e.target.closest("[data-action]"); if(!el) return; const a=el.dataset.action;
  const M={
    nav:()=>go(el.dataset.view), profile:()=>go("profile",{profileId:el.dataset.uid}), viewavatar:()=>viewAvatar(el.dataset.uid),
    auth:()=>{ if(el.dataset.p==="google") signInGoogle(); else toast("Apple sign-in needs a paid Apple Developer account — coming later. Use Google or email 🙂"); },
    authemail:()=>openEmailAuth(($("liEmail").value||"").trim()), emailgo:()=>emailGo(el.dataset.mode), finishonboard:()=>finishOnboard(),
    sharefolder:shareMusicFolder, savemobilepl:saveMobilePlaylist, setthumbs:()=>setThumbsFolder(el.dataset.pl), relink:()=>relinkFolder(el.dataset.pl), playfile:()=>playFolderTrack(el.dataset.pl,el.dataset.file),
    upload:openUpload, dopublish:doPublish, customize:openCustomize, savecustom:saveCustom, invite:openInvite,
    copyinvite:()=>{ const i=$("invLink"); i.select(); if(navigator.clipboard)navigator.clipboard.writeText(i.value); toast("Invite link copied ✓"); },
    play:()=>playTrack(el.dataset.id), like:()=>toggleLike(el.dataset.id), dislike:()=>toggleDislike(el.dataset.id),
    poststatus:postStatus, slike:()=>stLike(el.dataset.id), sdislike:()=>stDislike(el.dataset.id), scomment:()=>stComment(el.dataset.id),
    follow:()=>toggleFollow(el.dataset.uid), share:()=>share(el.dataset.id), logout:logout, close:closeOverlay,
    publish:()=>setVisibility(el.dataset.id,"public"), unpublish:()=>setVisibility(el.dataset.id,"private"), deltrack:()=>deleteTrack(el.dataset.id),
    editcmt:()=>editComment(el.dataset.id), delcmt:()=>deleteComment(el.dataset.id),
    fantab:()=>{ state.fanTab=el.dataset.t; renderFans(); }, suggest:openSuggest, sendsuggest:sendSuggest,
    openmarketplace:openMarketplace, gobuyer:goBuyer, goseller:goSeller, gosellerdirect:()=>{ if(!ME) return openEmailAuth(); CACHE.sellers[ME.id]?go("mystore"):openSellerSetup(); },
    doregisterseller:doRegisterSeller, addproduct:()=>openProductForm(), editproduct:()=>openProductForm(el.dataset.id), delproduct:()=>deleteProduct(el.dataset.id),
    dosaveproduct:()=>doSaveProduct(el.dataset.id||null), viewproduct:()=>viewProduct(el.dataset.id),
    addtocart:()=>addToCart(el.dataset.id), removecart:()=>removeFromCart(el.dataset.id),
    checkout:openCheckout, doorder:doPlaceOrder, zoomphoto:()=>zoomPhoto(el.dataset.src),
    togglepl:()=>{ if(!state.openPlaylists) state.openPlaylists=new Set(); const id=el.dataset.pl; state.openPlaylists.has(id)?state.openPlaylists.delete(id):state.openPlaylists.add(id); renderMain(); },
    genre:()=>{ state.genre=el.dataset.g; if(state.view!=="discover") state.view="discover"; renderDiscover(); },
    swatch:()=>{window._upColor=el.dataset.c;document.querySelectorAll("#swatches .swatch").forEach(s=>s.classList.toggle("sel",s===el));},
    vis:()=>{window._upVis=el.dataset.v;document.querySelectorAll("#visRow .radio-card").forEach(c=>c.classList.toggle("sel",c===el));},
    bgcolor:()=>{window._bgColor=el.dataset.c;window._bgTheme="";document.querySelectorAll("#bgSw .swatch").forEach(s=>s.classList.toggle("sel",s===el));document.querySelectorAll("#themeGrid .theme-swatch").forEach(s=>s.classList.remove("sel"));const bi=$("bgImg");if(bi)bi.value="";},
    theme:()=>{window._bgTheme=el.dataset.t;window._bgColor="";document.querySelectorAll("#themeGrid .theme-swatch").forEach(s=>s.classList.toggle("sel",s===el));document.querySelectorAll("#bgSw .swatch").forEach(s=>s.classList.remove("sel"));const bi=$("bgImg");if(bi)bi.value="";},
    migratetrack:()=>migrateTrack(el.dataset.id),
    migratealltracks:migrateAllLocal,
    addlink:()=>openAddLink(el.dataset.id,el.dataset.title),
    savetracklink:()=>saveTrackLink(el.dataset.id),
    broadcastwelcome:broadcastWelcome,
    showguide:()=>showWelcomeGuide(ME?.name||"there"),
    openchat:()=>{ state.chatUid=el.dataset.uid; state.view="chat"; renderApp(); },
    sendmsg:()=>sendMsg(el.dataset.uid),
    editmsg:()=>editMsg(el.dataset.msgid,el.dataset.cid,el.dataset.text),
    saveeditmsg:()=>saveEditMsg(el.dataset.msgid,el.dataset.cid),
    deletemsgmenu:()=>deleteMsgMenu(el.dataset.msgid,el.dataset.cid),
    deletemsgall:()=>deleteMsgForAll(el.dataset.msgid,el.dataset.cid),
    deletemsgme:()=>deleteMsgForMe(el.dataset.msgid,el.dataset.cid),
    startcall:()=>startCall(el.dataset.uid),
    acceptcall:()=>acceptCall(el.dataset.uid),
    mutecall:muteCall,
    endcall:endCall
  };
  if(M[a]) M[a]();
});
document.addEventListener("change",e=>{
  if(e.target.id==="avFile"){ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ window._avatar=r.result; const p=$("avPrev"); if(p){ p.style.backgroundImage=`url('${r.result}')`; p.textContent=""; } }; r.readAsDataURL(f); }
  if(e.target.id==="covFile"){ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ window._trackCover=r.result; const p=$("covPrev"); if(p){ p.style.backgroundImage=`url('${r.result}')`; p.style.backgroundSize="cover"; p.style.backgroundPosition="center"; p.style.background=""; p.textContent=""; } }; r.readAsDataURL(f); }
  if(e.target.id==="audioFile"){ const f=e.target.files[0]; if(!f) return; window._audioFile=f; const fn=$("audioFilename"); if(fn) fn.textContent="✓ "+f.name+" ("+Math.round(f.size/1024)+" KB)"; }
  if(e.target.id==="mpPhotoFile"){ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ window._mpPhoto=r.result; const p=$("mpPhotoPrev"); if(p){ p.style.backgroundImage=`url('${r.result}')`; p.style.backgroundSize="cover"; p.style.backgroundPosition="center"; p.textContent=""; } }; r.readAsDataURL(f); }
  if(e.target.id==="bannerFile"){ const f=e.target.files[0]; if(!f) return; window._bannerFile=f; const p=$("bannerPrev"); if(p){ const url=URL.createObjectURL(f); p.style.backgroundImage=`url('${url}')`; p.style.backgroundSize="cover"; p.style.backgroundPosition="center"; const h=p.querySelector(".cust-hint"); if(h) h.style.opacity="0"; } }
  if(e.target.id==="pageBgFile"){ const f=e.target.files[0]; if(!f) return; window._pageBgFile=f; const p=$("pageBgPrev"); if(p){ const url=URL.createObjectURL(f); p.style.backgroundImage=`url('${url}')`; p.style.backgroundSize="cover"; p.style.backgroundPosition="center"; const h=p.querySelector(".cust-hint"); if(h) h.style.opacity="0"; } }
});
$("overlay").addEventListener("click",e=>{ if(e.target.id==="overlay") closeOverlay(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeOverlay(); });

// ---------- live Firestore listeners (shared data) ----------
let _rt=null;
function scheduleRender(){ clearTimeout(_rt); _rt=setTimeout(()=>{ const a=document.activeElement; if(a && /INPUT|TEXTAREA/.test(a.tagName)) return; render(); }, 80); }

// ============ PRIVATE MESSENGER ============
const ICE=[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}];
let activePc=null,activeStream=null,activeCallId=null,callUnsub=null,callInterval=null,muted=false;

// ---- Sound feedback (Web Audio API — no external files needed) ----
let _ringCtx=null;
function playRing(){
  stopRing();
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    _ringCtx=ctx;
    for(let i=0;i<10;i++){
      const t=ctx.currentTime+i*6;
      const g=ctx.createGain();
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0,t);
      g.gain.linearRampToValueAtTime(0.3,t+0.05);
      g.gain.setValueAtTime(0.3,t+1.85);
      g.gain.linearRampToValueAtTime(0,t+2.0);
      [440,480].forEach(freq=>{
        const o=ctx.createOscillator();
        o.type="sine";o.frequency.value=freq;
        o.connect(g);o.start(t);o.stop(t+2.0);
      });
    }
    if(navigator.vibrate) navigator.vibrate([2000,4000,2000,4000,2000,4000,2000,4000,2000,4000]);
  }catch(e){}
}
function stopRing(){
  if(_ringCtx){try{_ringCtx.close();}catch(e){}_ringCtx=null;}
  if(navigator.vibrate) navigator.vibrate(0);
}
function playMsgSound(){
  try{
    const ctx=new(window.AudioContext||window.webkitAudioContext)();
    const g=ctx.createGain();
    g.connect(ctx.destination);
    const o=ctx.createOscillator();
    o.type="sine";o.frequency.value=880;
    o.connect(g);
    g.gain.setValueAtTime(0,ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.12,ctx.currentTime+0.01);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.25);
    o.start(ctx.currentTime);o.stop(ctx.currentTime+0.25);
    setTimeout(()=>ctx.close(),500);
    if(navigator.vibrate) navigator.vibrate(40);
  }catch(e){}
}
let msgUnsub=null,convUnsub=null;
function convId(a,b){return[a,b].sort().join("_");}

function msgUnreadTotal(){
  return Object.values(CACHE.convos||{}).reduce((s,c)=>s+((c.unread||{})[ME?.id]||0),0);
}

// ---- conversation list ----
function renderMessages(){
  if(convUnsub){convUnsub();convUnsub=null;}
  $("page").innerHTML=`<div class="h-title">💬 Messages</div><div id="convList" class="conv-list"><div class="empty">Loading…</div></div>`;
  convUnsub=fbDB.collection("messages").where("participants","array-contains",ME.id)
    .onSnapshot(snap=>{
      CACHE.convos={};
      snap.docs.forEach(d=>{CACHE.convos[d.id]={id:d.id,...d.data()};});
      const el=$("convList");if(!el)return;
      const convs=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.lastTime||0)-(a.lastTime||0));
      if(!convs.length){el.innerHTML='<div class="empty">No messages yet — open any profile and tap 💬 Message to start a chat.</div>';return;}
      el.innerHTML=convs.map(c=>{
        const otherId=c.participants.find(p=>p!==ME.id);
        const other=userById(otherId)||{name:"Unknown",color:"#ccc"};
        const unread=(c.unread||{})[ME.id]||0;
        return`<div class="conv-row" data-action="openchat" data-uid="${otherId}">
          <div class="avatar" style="${avatarStyle(other,46)}">${other.avatarImg?'':initials(other.name)}</div>
          <div class="minfo">
            <div class="mt">${esc(other.name)}${unread?`<span class="unread-badge">${unread}</span>`:''}
              <span class="conv-time">${c.lastTime?timeAgo(c.lastTime):''}</span></div>
            <div class="ms">${esc((c.lastMsg||'').slice(0,70))}</div>
          </div></div>`;
      }).join('');
    },e=>console.warn("convs",e));
}

// ---- open a chat thread ----
function openChat(uid){
  const other=userById(uid);if(!other)return toast("User not found");
  const cid=convId(ME.id,uid);
  if(msgUnsub){msgUnsub();msgUnsub=null;}
  state.chatUid=uid;
  $("page").innerHTML=`
    <div class="chat-header">
      <button class="btn sm" data-action="nav" data-view="msgs" style="flex-shrink:0">← Back</button>
      <div class="avatar" style="${avatarStyle(other,36)};flex-shrink:0">${other.avatarImg?'':initials(other.name)}</div>
      <span class="chat-name">${esc(other.name)}</span>
      <button class="btn sm" data-action="startcall" data-uid="${uid}" title="Voice call" style="flex-shrink:0">📞 Call</button>
    </div>
    <div class="chat-msgs" id="chatMsgs"></div>
    <div class="chat-input-row">
      <input class="chat-input" id="chatInput" placeholder="Type a message…" maxlength="1000"/>
      <button class="btn primary" data-action="sendmsg" data-uid="${uid}">Send</button>
    </div>`;
  fbDB.collection("messages").doc(cid).set({participants:[ME.id,uid],unread:{[ME.id]:0}},{merge:true}).catch(()=>{});
  let _prevMsgCount=0;
  msgUnsub=fbDB.collection("messages").doc(cid).collection("msgs")
    .orderBy("time","asc").limitToLast(80)
    .onSnapshot(snap=>{
      const el=$("chatMsgs");if(!el)return;
      if(_prevMsgCount>0&&snap.docs.length>_prevMsgCount){
        const newest=snap.docs[snap.docs.length-1].data();
        if(newest.senderId!==ME.id&&!newest.deleted&&!(newest.deletedFor||[]).includes(ME.id)) playMsgSound();
      }
      _prevMsgCount=snap.docs.length;
      el.innerHTML=snap.docs
        .filter(d=>!(d.data().deletedFor||[]).includes(ME.id))
        .map(d=>{const m=d.data();const mine=m.senderId===ME.id;
          if(m.deleted) return`<div class="msg-bubble ${mine?'mine':'theirs'} deleted">
            <div class="msg-text"><em>🗑️ Message deleted</em></div>
            <div class="msg-time">${timeAgo(m.time)}</div></div>`;
          return`<div class="msg-bubble ${mine?'mine':'theirs'}">
            <div class="msg-text">${esc(m.text)}${m.edited?'<span class="msg-edited"> · edited</span>':''}</div>
            <div class="msg-meta">
              <span class="msg-time">${timeAgo(m.time)}</span>
              ${mine?`<span class="msg-actions">
                <button class="msg-act" data-action="editmsg" data-msgid="${d.id}" data-cid="${cid}" data-text="${esc(m.text)}" title="Edit">✏️</button>
                <button class="msg-act" data-action="deletemsgmenu" data-msgid="${d.id}" data-cid="${cid}" title="Delete">🗑️</button>
              </span>`:''}
            </div></div>`;
        }).join('');
      el.scrollTop=el.scrollHeight;
    },e=>console.warn("msgs",e));
  setTimeout(()=>{
    const inp=$("chatInput");
    if(inp) inp.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg(uid);}});
  },100);
}

async function sendMsg(uid){
  const inp=$("chatInput");if(!inp)return;
  const text=inp.value.trim();if(!text)return;
  inp.value="";playMsgSound();
  const cid=convId(ME.id,uid);const time=Date.now();
  await fbDB.collection("messages").doc(cid).collection("msgs").add({senderId:ME.id,text,time,read:false});
  await fbDB.collection("messages").doc(cid).set({
    participants:[ME.id,uid],lastMsg:text,lastTime:time,
    unread:{[ME.id]:0,[uid]:firebase.firestore.FieldValue.increment(1)}
  },{merge:true});
  if(!String(uid).startsWith("u_")) fbDB.collection("notifications").add({forUid:uid,type:"message",fromUid:ME.id,fromName:ME.name,text:`💬 ${ME.name}: ${text.slice(0,60)}`,time,read:false}).catch(()=>{});
}

function editMsg(msgId,cid,currentText){
  openOverlay(`<h2>✏️ Edit message</h2>
    <div class="field"><textarea id="editMsgText" style="min-height:80px;width:100%">${esc(currentText)}</textarea></div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn primary" data-action="saveeditmsg" data-msgid="${msgId}" data-cid="${cid}">Save</button>
      <button class="btn" data-action="close">Cancel</button>
    </div>`);
  setTimeout(()=>{const t=$("editMsgText");if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length);}},50);
}
async function saveEditMsg(msgId,cid){
  const text=($("editMsgText")||{value:""}).value.trim();
  if(!text) return toast("Message can't be empty.");
  try{ await fbDB.collection("messages").doc(cid).collection("msgs").doc(msgId).update({text,edited:true}); closeOverlay(); }
  catch(e){ toast("Couldn't edit: "+(e.code||e.message)); }
}
function deleteMsgMenu(msgId,cid){
  openOverlay(`<h2>🗑️ Delete message</h2>
    <p class="sub">Choose who to delete it for.</p>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">
      <button class="btn primary" data-action="deletemsgall" data-msgid="${msgId}" data-cid="${cid}">Delete for everyone</button>
      <button class="btn" data-action="deletemsgme" data-msgid="${msgId}" data-cid="${cid}">Delete for me only</button>
      <button class="btn" data-action="close">Cancel</button>
    </div>`);
}
async function deleteMsgForAll(msgId,cid){
  try{ await fbDB.collection("messages").doc(cid).collection("msgs").doc(msgId).update({deleted:true,text:""}); closeOverlay(); }
  catch(e){ toast("Couldn't delete: "+(e.code||e.message)); }
}
async function deleteMsgForMe(msgId,cid){
  try{ await fbDB.collection("messages").doc(cid).collection("msgs").doc(msgId).update({deletedFor:firebase.firestore.FieldValue.arrayUnion(ME.id)}); closeOverlay(); }
  catch(e){ toast("Couldn't delete: "+(e.code||e.message)); }
}

// ---- VOICE CALLS ----
function startCall(uid){
  if(!navigator.mediaDevices)return toast("Microphone not available on this device.");
  if(activePc)return toast("Already in a call.");
  openCallUI(uid,"outgoing");
}

function openCallUI(uid,mode){
  const other=userById(uid)||{name:"Someone",color:"#888"};
  openOverlay(`<div class="call-ui">
    <div class="call-avatar"><div class="avatar" style="${avatarStyle(other,80)};margin:0 auto">${other.avatarImg?'':initials(other.name)}</div></div>
    <div class="call-name">${esc(other.name)}</div>
    <div class="call-status" id="callStatus">${mode==="outgoing"?"Calling…":"Incoming call…"}</div>
    <div class="call-timer" id="callTimer">0:00</div>
    <audio id="remoteAudio" autoplay playsinline></audio>
    <div class="call-btns">
      ${mode==="incoming"?`<button class="call-btn-accept" data-action="acceptcall" data-uid="${uid}">✅ Accept</button>`:''}
      <button class="call-btn-mute" id="muteBtn" data-action="mutecall">🎙️ Mute</button>
      <button class="call-btn-end" data-action="endcall" data-uid="${uid}">${mode==="incoming"?"❌ Decline":"📵 End"}</button>
    </div></div>`);
  if(mode==="incoming") playRing();
  if(mode==="outgoing") initiateCall(uid);
}

async function initiateCall(uid){
  const cid=[ME.id,uid].sort().join("_")+"_c"+Date.now();activeCallId=cid;
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    activeStream=stream;
    const pc=new RTCPeerConnection({iceServers:ICE});activePc=pc;
    stream.getTracks().forEach(t=>pc.addTrack(t,stream));
    pc.ontrack=e=>{const ra=$("remoteAudio");if(ra)ra.srcObject=e.streams[0];};
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    await fbDB.collection("calls").doc(cid).set({callerId:ME.id,calleeId:uid,offer:{type:offer.type,sdp:offer.sdp},callerCandidates:[],calleeCandidates:[],status:"ringing",time:Date.now()});
    pc.onicecandidate=async e=>{if(e.candidate) await fbDB.collection("calls").doc(cid).update({callerCandidates:firebase.firestore.FieldValue.arrayUnion(e.candidate.toJSON())}).catch(()=>{});};
    fbDB.collection("notifications").add({forUid:uid,type:"call",fromUid:ME.id,fromName:ME.name,text:`📞 ${ME.name} is calling you — open the app to answer.`,time:Date.now(),read:false}).catch(()=>{});
    callUnsub=fbDB.collection("calls").doc(cid).onSnapshot(async snap=>{
      const d=snap.data();if(!d)return;
      if(d.status==="ended"){endCall();return;}
      if(d.answer&&!pc.currentRemoteDescription){
        await pc.setRemoteDescription(new RTCSessionDescription(d.answer)).catch(()=>{});
        const s=$("callStatus");if(s)s.textContent="Connected ✓";
        startCallTimer();
      }
      if(d.calleeCandidates?.length){for(const c of d.calleeCandidates)await pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{});}
    });
  }catch(e){toast("Mic error: "+(e.message||e));endCall();}
}

async function acceptCall(uid){
  stopRing();
  const s=$("callStatus");if(s)s.textContent="Connecting…";
  const snap=await fbDB.collection("calls").where("callerId","==",uid).where("calleeId","==",ME.id).where("status","==","ringing").orderBy("time","desc").limit(1).get().catch(()=>null);
  if(!snap||snap.empty){toast("Call expired.");closeOverlay();return;}
  const doc=snap.docs[0];const d=doc.data();const cid=doc.id;activeCallId=cid;
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    activeStream=stream;
    const pc=new RTCPeerConnection({iceServers:ICE});activePc=pc;
    stream.getTracks().forEach(t=>pc.addTrack(t,stream));
    pc.ontrack=e=>{const ra=$("remoteAudio");if(ra)ra.srcObject=e.streams[0];};
    await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    await fbDB.collection("calls").doc(cid).update({answer:{type:answer.type,sdp:answer.sdp},status:"active"});
    pc.onicecandidate=async e=>{if(e.candidate) await fbDB.collection("calls").doc(cid).update({calleeCandidates:firebase.firestore.FieldValue.arrayUnion(e.candidate.toJSON())}).catch(()=>{});};
    if(d.callerCandidates?.length){for(const c of d.callerCandidates)await pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{});}
    callUnsub=fbDB.collection("calls").doc(cid).onSnapshot(async snap2=>{
      const d2=snap2.data();if(!d2)return;
      if(d2.status==="ended"){endCall();return;}
      if(d2.callerCandidates?.length){for(const c of d2.callerCandidates)await pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{});}
    });
    if(s)s.textContent="Connected ✓";
    startCallTimer();
  }catch(e){toast("Mic error: "+(e.message||e));endCall();}
}

function startCallTimer(){
  const el=$("callTimer");if(!el)return;el.style.display="";
  clearInterval(callInterval);let sec=0;
  callInterval=setInterval(()=>{sec++;const e=$("callTimer");if(e)e.textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`; },1000);
}
function muteCall(){
  if(!activeStream)return;muted=!muted;
  activeStream.getAudioTracks().forEach(t=>t.enabled=!muted);
  const b=$("muteBtn");if(b)b.textContent=muted?"🔇 Unmute":"🎙️ Mute";
}
async function endCall(){
  stopRing();
  clearInterval(callInterval);callInterval=null;
  if(callUnsub){callUnsub();callUnsub=null;}
  if(activePc){activePc.close();activePc=null;}
  if(activeStream){activeStream.getTracks().forEach(t=>t.stop());activeStream=null;}
  if(activeCallId){await fbDB.collection("calls").doc(activeCallId).update({status:"ended"}).catch(()=>{});activeCallId=null;}
  muted=false;closeOverlay();
}

function listenForIncomingCalls(){
  if(!ME||!ME.handle)return;
  fbDB.collection("calls").where("calleeId","==",ME.id).where("status","==","ringing")
    .onSnapshot(snap=>{
      snap.docChanges().forEach(ch=>{
        if(ch.type==="added"&&!activePc){
          const d=ch.doc.data();
          openCallUI(d.callerId,"incoming");
        }
      });
    },()=>{});
}
function startListeners(){
  fbDB.collection("users").onSnapshot(s=>{ CACHE.users={}; s.forEach(d=>CACHE.users[d.id]={ id:d.id, ...d.data() }); scheduleRender(); }, e=>console.warn("users",e.code));
  fbDB.collection("tracks").onSnapshot(s=>{ CACHE.tracks=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("tracks",e.code));
  fbDB.collection("statuses").onSnapshot(s=>{ CACHE.statuses=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("statuses",e.code));
  fbDB.collection("follows").onSnapshot(s=>{ CACHE.follows={}; s.forEach(d=>CACHE.follows[d.id]=(d.data().following||[])); scheduleRender(); }, e=>console.warn("follows",e.code));
  fbDB.collection("reactions").onSnapshot(s=>{ CACHE.reactions={}; s.forEach(d=>CACHE.reactions[d.id]=d.data()); scheduleRender(); }, e=>console.warn("reactions",e.code));
  fbDB.collection("comments").onSnapshot(s=>{ CACHE.comments=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("comments",e.code));
  fbDB.collection("products").onSnapshot(s=>{ CACHE.products=s.docs.map(d=>({ id:d.id, ...d.data() })).sort((a,b)=>b.createdAt-a.createdAt); scheduleRender(); }, e=>console.warn("products",e.code));
  fbDB.collection("sellers").onSnapshot(s=>{ CACHE.sellers={}; s.forEach(d=>CACHE.sellers[d.id]={ id:d.id, ...d.data() }); scheduleRender(); }, e=>console.warn("sellers",e.code));
  if(fbAuth.currentUser?.email===ADMIN_EMAIL){
    fbDB.collection("orders").onSnapshot(s=>{ CACHE.orders=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("orders",e.code));
  }
}

// ---------- init: real Firebase auth + live data ----------
renderLanding();
startListeners();
fbAuth.onAuthStateChanged(async (user)=>{
  if(user){
    const prof=await loadProfile(user.uid);
    if(prof){ ME=prof; syncME(); startMyNotifications(); listenForIncomingCalls(); render(); }
    else { ME={ id:user.uid, name:user.displayName||"" }; render(); }   // no profile yet → onboarding
  } else { ME=null; syncME(); startMyNotifications(); render(); }
});
