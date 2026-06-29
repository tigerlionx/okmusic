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
const CACHE={ users:{}, tracks:[], statuses:[], follows:{}, reactions:{}, comments:[], notifications:[] };
let state={ view:"discover", profileId:null, query:"" };
function go(v,x={}){ state={ ...state, view:v, ...x }; render(); window.scrollTo(0,0); }
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
function signInGoogle(){ fbAuth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e=>toast("Google sign-in failed: "+(e.code||e.message))); }
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
function syncME(){ const d=db(); if(ME){ d.session=ME.id; d.usersById[ME.id]={ id:ME.id, name:ME.name, handle:ME.handle, bio:ME.bio, color:ME.color, avatarImg:ME.avatarImg, bgColor:ME.bgColor, bgImg:ME.bgImg }; } else d.session=null; commit(d); }
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
    ME={ id:uid, ...prof }; syncME(); closeOverlay(); toast("You're in! 🎉"); go("profile",{profileId:uid});
  }catch(e){ toast("Couldn't save profile: "+(e.code||e.message)); }
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
        <div class="side-item" data-action="profile" data-uid="${u.id}"><span class="ic">😊</span>My Page</div>
        ${item("fans","🫂","My Fans")}
        ${item("mymusic","🎵","My Music")}
        <div class="side-sep"></div>
        <div class="side-item" data-action="sharefolder"><span class="ic">📁</span>Add a folder</div>
        <div class="side-item" data-action="upload"><span class="ic">⬆️</span>Add single track</div>
        <div class="side-item" data-action="customize"><span class="ic">🎨</span>Edit profile</div>
        <div class="side-item" data-action="invite"><span class="ic">✉️</span>Invite friends</div>
        <div class="side-item" data-action="suggest"><span class="ic">💡</span>Suggest a feature</div>
        <div class="side-sep"></div>
        <div class="side-item" data-action="logout"><span class="ic">↩️</span>Log out</div>
      </nav>
      <main class="main"><div class="page" id="page"></div></main>
    </div>`;
  renderMain();
  setTimeout(()=>{ const s=$("search"); if(s) s.oninput=e=>{ state.query=e.target.value; if(state.view!=="discover") state.view="discover"; renderMain(); }; },0);
}
function renderMain(){
  if(state.view==="profile") return renderProfile(state.profileId);
  if(state.view==="mymusic") return renderMyMusic();
  if(state.view==="fans") return renderFans();
  if(state.view==="buzzing") return renderBuzzing();
  if(state.view==="notifs") return renderNotifs();
  if(state.view==="home") return renderHome();
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
  const tracks=tracksByUser(uid,mine); const pls=playlistsByUser(uid); const sts=statusesByUser(uid);
  const headActions=mine
    ? `<button class="btn primary" data-action="customize">🎨 Edit profile</button><button class="btn" data-action="invite">✉️ Invite</button>`
    : `<button class="btn ${isFollowing(uid)?'':'primary'}" data-action="follow" data-uid="${uid}">${isFollowing(uid)?'Following ✓':'Follow'}</button>`;
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
    <div class="profile-head"><div class="profile-avatar" style="${avatarStyle(u,104)}">${u.avatarImg?'':initials(u.name)}</div>
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
  const artStyle=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
  return `<div class="mrow2"><div class="mart" style="${artStyle}" data-action="play" data-id="${t.id}">${t.coverImg?'':'◎'}</div>
    <div class="minfo"><div class="mt" data-action="play" data-id="${t.id}">${esc(t.title)}${priv?' 🔒':''}</div><div class="ms">▶ ${nfmt(playCount(t.id))} plays</div></div>
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
    <div class="status-top"><div class="avatar" style="${avatarStyle(u,38)}">${u.avatarImg?'':initials(u.name)}</div>
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
  if(!window.showDirectoryPicker) return toast("Folder sharing needs Chrome or Edge (desktop).");
  let dir; try{ dir=await window.showDirectoryPicker(); }catch{ return; }
  const files=[]; for await(const e of dir.values()){ if(e.kind==="file"&&/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(e.name)) files.push(e.name); }
  if(!files.length) return toast("No audio files in that folder."); files.sort();
  const d=db(); const id="pl_"+Date.now(); d.playlists.unshift({ id, userId:d.session, name:dir.name, files, thumbs:null, createdAt:Date.now() });
  commit(d); dirCache[id]={ music:dir }; await fsPut(id+"_music",dir); toast(`Playlist "${dir.name}" — ${files.length} tracks 🎵`); go("mymusic");
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
    <div class="field"><label>Audio link (optional)</label><input id="upSrc" placeholder="https://…/song.mp3" /></div>
    <div class="field"><label>Genre</label><select id="upGenre" class="fb-field">${GENRES.map(g=>`<option value="${g}">${g}</option>`).join("")}</select></div>
    <div class="field"><label>Visibility</label><div class="radio-row" id="visRow"><div class="radio-card sel" data-action="vis" data-v="public"><b>Public</b>Everyone can play it</div><div class="radio-card" data-action="vis" data-v="private"><b>Private</b>Only you, until you publish</div></div></div>
    <label class="check"><input type="checkbox" id="upShare" checked> Allow fans to share this track</label>
    <button class="btn primary block" data-action="dopublish">Add to my music</button>`);
  window._upColor=COLORS[0]; window._upVis="public"; window._trackCover=null;
}
function doPublish(){ const title=($("upTitle").value||"").trim(); if(!title) return toast("Give it a title"); if(!ME) return openEmailAuth();
  const coverImg=window._trackCover||"";
  if(coverImg&&coverImg.length>900000) return toast("Cover photo is too large — use a smaller image (under ~600KB).");
  fbDB.collection("tracks").add({ userId:ME.id, title, src:($("upSrc").value||"").trim(), genre:($("upGenre")&&$("upGenre").value)||"Other", accent:window._upColor||COLORS[0], coverImg, visibility:window._upVis||"public", share:!!($("upShare")&&$("upShare").checked), createdAt:Date.now() })
    .then(()=>{ closeOverlay(); window._trackCover=null; toast(window._upVis==="private"?"Saved private 🔒":"Published! 🎵"); go("mymusic"); })
    .catch(e=>toast("Couldn't save: "+(e.code||e.message))); }

// ---------- my music ----------
function renderMyMusic(){
  const u=currentUser(); const tracks=tracksByUser(u.id,true); const pls=playlistsByUser(u.id);
  const rows=tracks.map(t=>`<div class="mrow"><div class="mart" style="background:${grad(t.accent)}">◎</div>
    <div class="minfo"><div class="mt">${esc(t.title)}</div><div class="ms">▶ ${nfmt(playCount(t.id))} · 👍 ${nfmt(likeCount(t.id))} · 👎 ${nfmt(dislikeCount(t.id))} <span class="pill ${t.visibility==='private'?'prv':'pub'}">${t.visibility==='private'?'Private':'Public'}</span></div></div>
    ${t.visibility==='private'?`<button class="btn sm primary" data-action="publish" data-id="${t.id}">Publish</button>`:`<button class="btn sm" data-action="unpublish" data-id="${t.id}">Hide</button>`}
    <button class="btn sm" data-action="deltrack" data-id="${t.id}" style="color:#e2554f;border-color:#f0b3b3">Delete</button></div>`).join("");
  $("page").innerHTML=`<div class="h-title">My Music</div>
    <div class="folder-banner">📁 <b>Each folder becomes a playlist — including cloud drives.</b> Pick any folder from your computer, Google Drive, Dropbox, iCloud, or OneDrive. Tracks are cached automatically after the first play, so they stay available even when you're offline. Chrome &amp; Edge.
      <div class="folder-note">⚠️ <b>Cloud drive tip:</b> Make sure your cloud drive is set to <b>sync files locally</b> (not "stream-only" or "online-only"). In Google Drive: Preferences → open files online only → off. In Dropbox: right-click folder → Make available offline. Play each track once while online — it will be cached and playable forever after, even without internet.</div>
    <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap"><button class="btn primary" data-action="sharefolder">📁 Add a folder</button><button class="btn" data-action="upload">＋ Add single track</button></div>
    ${pls.length?`<div class="section-title">Playlists (folders)</div>${pls.map(p=>playlistBlock(p,true)).join("")}`:""}
    ${tracks.length?`<div class="section-title">Single tracks</div>${rows}`:""}
    ${(!pls.length&&!tracks.length)?'<div class="empty">No music yet — share a folder to begin.</div>':""}`;
  pls.forEach(loadCovers);
}
function setVisibility(id,v){ fbDB.collection("tracks").doc(id).update({ visibility:v }).then(()=>toast(v==="public"?"Published 🎉 (now public)":"Hidden — set to private 🔒")).catch(e=>toast(e.code||e.message)); }
function deleteTrack(id){ if(!confirm("Delete this track permanently? This cannot be undone.")) return; fbDB.collection("tracks").doc(id).delete().then(()=>toast("Track deleted")).catch(e=>toast(e.code||e.message)); }

// ---------- edit profile (photo + bg + bio) ----------
function openCustomize(){
  const u=currentUser();
  openOverlay(`<h2>🎨 Edit profile</h2><p class="sub">Add your photo and make your page yours.</p>
    <div class="field"><label>Profile photo</label><div class="avup"><div class="avprev" id="avPrev" style="${u.avatarImg?`background-image:url('${u.avatarImg}')`:''}">${u.avatarImg?'':initials(u.name)}</div>
      <div><input type="file" id="avFile" accept="image/*" /><div class="note" style="margin-top:4px">JPG/PNG from your computer — or paste a link below.</div></div></div></div>
    <div class="field"><label>Photo link (optional)</label><input id="avUrl" placeholder="https://…/photo.jpg" /></div>
    <div class="field"><label>Bio (shown on your profile)</label><textarea id="bgBio" placeholder="Tell fans about your music…">${esc(u.bio||"")}</textarea></div>
    <div class="field"><label>Profile theme</label>
      <div class="theme-grid" id="themeGrid">${THEMES.map(t=>`<div class="theme-swatch ${(u.bgTheme||"")===t.id?'sel':''}" style="background:${t.css}" data-action="theme" data-t="${t.id}" title="${t.label}"><span class="theme-label">${t.label}</span></div>`).join("")}</div></div>
    <div class="field"><label>Or a solid color</label><div class="swatches" id="bgSw">${["#FFCBA0","#7c5cff","#36d1c4","#ff5c7c","#2bbf4e","#5c8bff","#33272f"].map(c=>`<div class="swatch ${u.bgColor===c&&!u.bgTheme?'sel':''}" style="background:${c}" data-action="bgcolor" data-c="${c}"></div>`).join("")}</div></div>
    <div class="field"><label>Or a banner image link</label><input id="bgImg" placeholder="https://…/banner.jpg" value="${esc(u.bgImg||"")}" /></div>
    <button class="btn primary block" data-action="savecustom">Save profile</button>`);
  window._bgColor=u.bgColor||""; window._bgTheme=u.bgTheme||""; window._avatar=null;
}
function saveCustom(){
  if(!ME) return; const url=($("avUrl").value||"").trim();
  const upd={ bio:($("bgBio").value||"").trim()||ME.bio||"", bgColor:window._bgTheme?"":(window._bgColor||""), bgTheme:window._bgTheme||"", bgImg:($("bgImg").value||"").trim() };
  if(window._avatar){ if(window._avatar.length>700000) return toast("That photo is too big — paste a link instead, or use a smaller image."); upd.avatarImg=window._avatar; }
  else if(url) upd.avatarImg=url;
  fbDB.collection("users").doc(ME.id).set(upd,{merge:true}).then(()=>{ Object.assign(ME,upd); closeOverlay(); toast("Profile saved ✨"); go("profile",{profileId:ME.id}); }).catch(e=>toast("Couldn't save: "+(e.code||e.message)));
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

// ---------- overlay ----------
function openOverlay(h){ $("overlayBody").innerHTML=`<div class="modal"><button class="modal-x" data-action="close">✕</button>${h}</div>`; $("overlay").hidden=false; }
function closeOverlay(){ $("overlay").hidden=true; $("overlayBody").innerHTML=""; }

// ---------- player ----------
let hasSrc=false;
function showPlayer(title,artist,accent,src){ $("miniplayer").classList.add("show"); $("mpArt").style.background=grad(accent); $("mpArt").textContent="◎"; $("mpTitle").textContent=title; $("mpArtist").textContent=artist;
  if(src){ hasSrc=true; audio.src=src; audio.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false)); } else { hasSrc=false; setPlaying(true); } }
function playTrack(id){ const t=allTracks().find(x=>x.id===id); if(!t) return; const u=userById(t.userId); const d=db(); d.plays[id]=(d.plays[id]||0)+1; commit(d); showPlayer(t.title,u.name,t.accent,t.src); if(!t.src) toast("Demo track — no audio linked yet. Reactions still work!"); }
function setPlaying(p){ $("mpPlay").textContent=p?"⏸":"▶"; }
$("mpPlay").addEventListener("click",()=>{ if(!hasSrc)return; if(!audio.paused){audio.pause();setPlaying(false);}else{audio.play();setPlaying(true);} });
audio.addEventListener("timeupdate",()=>{ if(!audio.duration)return; $("mpFill").style.width=(audio.currentTime/audio.duration*100)+"%"; const s=Math.floor(audio.currentTime); $("mpTime").textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; });
$("mpProg").addEventListener("click",e=>{ if(!audio.duration)return; const r=e.currentTarget.getBoundingClientRect(); audio.currentTime=(e.clientX-r.left)/r.width*audio.duration; });

// ---------- delegation ----------
// ---------- fans / following (fanbase list) ----------
function followingOf(uid){ return CACHE.follows[uid]||[]; }
function followersOf(uid){ const r=[]; for(const f in CACHE.follows){ if(CACHE.follows[f].includes(uid)) r.push(f); } return r; }
function userCard(u){
  if(!u) return "";
  const me=currentUser(); const self=me&&me.id===u.id;
  const btn=self?"":`<button class="btn sm ${isFollowing(u.id)?'':'primary'}" data-action="follow" data-uid="${u.id}">${isFollowing(u.id)?'Following ✓':'Follow back'}</button>`;
  return `<div class="mrow2">
    <div class="avatar" style="${avatarStyle(u,44)};cursor:pointer" data-action="profile" data-uid="${u.id}">${u.avatarImg?'':initials(u.name)}</div>
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
    list.length?list.map(n=>`<div class="mrow2" data-action="profile" data-uid="${n.fromUid}" style="cursor:pointer;${n.read?'':'background:#fff7f1'}">
      <div class="avatar" style="${avatarStyle(userById(n.fromUid)||{color:'#FB7A28'},42)}">${(userById(n.fromUid)?.avatarImg)?'':initials(n.fromName||'?')}</div>
      <div class="minfo"><div class="mt">${esc(n.text)}</div><div class="ms">${timeAgo(n.time)}</div></div></div>`).join("")
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
    nav:()=>go(el.dataset.view), profile:()=>go("profile",{profileId:el.dataset.uid}),
    auth:()=>{ if(el.dataset.p==="google") signInGoogle(); else toast("Apple sign-in needs a paid Apple Developer account — coming later. Use Google or email 🙂"); },
    authemail:()=>openEmailAuth(($("liEmail").value||"").trim()), emailgo:()=>emailGo(el.dataset.mode), finishonboard:()=>finishOnboard(),
    sharefolder:shareMusicFolder, setthumbs:()=>setThumbsFolder(el.dataset.pl), relink:()=>relinkFolder(el.dataset.pl), playfile:()=>playFolderTrack(el.dataset.pl,el.dataset.file),
    upload:openUpload, dopublish:doPublish, customize:openCustomize, savecustom:saveCustom, invite:openInvite,
    copyinvite:()=>{ const i=$("invLink"); i.select(); if(navigator.clipboard)navigator.clipboard.writeText(i.value); toast("Invite link copied ✓"); },
    play:()=>playTrack(el.dataset.id), like:()=>toggleLike(el.dataset.id), dislike:()=>toggleDislike(el.dataset.id),
    poststatus:postStatus, slike:()=>stLike(el.dataset.id), sdislike:()=>stDislike(el.dataset.id), scomment:()=>stComment(el.dataset.id),
    follow:()=>toggleFollow(el.dataset.uid), share:()=>share(el.dataset.id), logout:logout, close:closeOverlay,
    publish:()=>setVisibility(el.dataset.id,"public"), unpublish:()=>setVisibility(el.dataset.id,"private"), deltrack:()=>deleteTrack(el.dataset.id),
    editcmt:()=>editComment(el.dataset.id), delcmt:()=>deleteComment(el.dataset.id),
    fantab:()=>{ state.fanTab=el.dataset.t; renderFans(); }, suggest:openSuggest, sendsuggest:sendSuggest,
    togglepl:()=>{ if(!state.openPlaylists) state.openPlaylists=new Set(); const id=el.dataset.pl; state.openPlaylists.has(id)?state.openPlaylists.delete(id):state.openPlaylists.add(id); renderMain(); },
    genre:()=>{ state.genre=el.dataset.g; if(state.view!=="discover") state.view="discover"; renderDiscover(); },
    swatch:()=>{window._upColor=el.dataset.c;document.querySelectorAll("#swatches .swatch").forEach(s=>s.classList.toggle("sel",s===el));},
    vis:()=>{window._upVis=el.dataset.v;document.querySelectorAll("#visRow .radio-card").forEach(c=>c.classList.toggle("sel",c===el));},
    bgcolor:()=>{window._bgColor=el.dataset.c;window._bgTheme="";document.querySelectorAll("#bgSw .swatch").forEach(s=>s.classList.toggle("sel",s===el));document.querySelectorAll("#themeGrid .theme-swatch").forEach(s=>s.classList.remove("sel"));const bi=$("bgImg");if(bi)bi.value="";},
    theme:()=>{window._bgTheme=el.dataset.t;window._bgColor="";document.querySelectorAll("#themeGrid .theme-swatch").forEach(s=>s.classList.toggle("sel",s===el));document.querySelectorAll("#bgSw .swatch").forEach(s=>s.classList.remove("sel"));const bi=$("bgImg");if(bi)bi.value="";}
  };
  if(M[a]) M[a]();
});
document.addEventListener("change",e=>{
  if(e.target.id==="avFile"){ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ window._avatar=r.result; const p=$("avPrev"); if(p){ p.style.backgroundImage=`url('${r.result}')`; p.textContent=""; } }; r.readAsDataURL(f); }
  if(e.target.id==="covFile"){ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ window._trackCover=r.result; const p=$("covPrev"); if(p){ p.style.backgroundImage=`url('${r.result}')`; p.style.backgroundSize="cover"; p.style.backgroundPosition="center"; p.style.background=""; p.textContent=""; } }; r.readAsDataURL(f); }
});
$("overlay").addEventListener("click",e=>{ if(e.target.id==="overlay") closeOverlay(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeOverlay(); });

// ---------- live Firestore listeners (shared data) ----------
let _rt=null;
function scheduleRender(){ clearTimeout(_rt); _rt=setTimeout(()=>{ const a=document.activeElement; if(a && /INPUT|TEXTAREA/.test(a.tagName)) return; render(); }, 80); }
function startListeners(){
  fbDB.collection("users").onSnapshot(s=>{ CACHE.users={}; s.forEach(d=>CACHE.users[d.id]={ id:d.id, ...d.data() }); scheduleRender(); }, e=>console.warn("users",e.code));
  fbDB.collection("tracks").onSnapshot(s=>{ CACHE.tracks=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("tracks",e.code));
  fbDB.collection("statuses").onSnapshot(s=>{ CACHE.statuses=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("statuses",e.code));
  fbDB.collection("follows").onSnapshot(s=>{ CACHE.follows={}; s.forEach(d=>CACHE.follows[d.id]=(d.data().following||[])); scheduleRender(); }, e=>console.warn("follows",e.code));
  fbDB.collection("reactions").onSnapshot(s=>{ CACHE.reactions={}; s.forEach(d=>CACHE.reactions[d.id]=d.data()); scheduleRender(); }, e=>console.warn("reactions",e.code));
  fbDB.collection("comments").onSnapshot(s=>{ CACHE.comments=s.docs.map(d=>({ id:d.id, ...d.data() })); scheduleRender(); }, e=>console.warn("comments",e.code));
}

// ---------- init: real Firebase auth + live data ----------
renderLanding();
startListeners();
fbAuth.onAuthStateChanged(async (user)=>{
  if(user){
    const prof=await loadProfile(user.uid);
    if(prof){ ME=prof; syncME(); startMyNotifications(); render(); }
    else { ME={ id:user.uid, name:user.displayName||"" }; render(); }   // no profile yet → onboarding
  } else { ME=null; syncME(); startMyNotifications(); render(); }
});
