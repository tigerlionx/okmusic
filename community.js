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

const SEED_STATS = {
  t_afghan:{plays:412,likes:58}, t_persian:{plays:233,likes:31}, t_gray:{plays:188,likes:24}, t_spring:{plays:97,likes:12},
  t_nova1:{plays:1203,likes:210}, t_nova2:{plays:540,likes:77}, t_lumen1:{plays:860,likes:140}, t_lumen2:{plays:320,likes:41},
  t_kira1:{plays:1500,likes:260}, t_kira2:{plays:610,likes:95}
};
const SEED_FOLLOWERS = { u_okmusic:128, u_nova:4200, u_lumen:2100, u_kira:8800 };
const SEED_STATUSES = [
  { id:"s_ok1",   userId:"u_okmusic", text:"I am so happy today — I posted my new tracks 🌅 Please listen to them, comment, like, and share to your own page! 💜", ageHrs:4 },
  { id:"s_nova1", userId:"u_nova",    text:"New synthwave just dropped tonight. Crank it up 🌃 Tell me your favorite track!", ageHrs:9 },
  { id:"s_kira1", userId:"u_kira",    text:"Lo-fi beats for your study session ☕ Feedback welcome — what should I make next?", ageHrs:22 }
];
const SEED_ST_STATS = { s_ok1:{likes:42,dislikes:1}, s_nova1:{likes:120,dislikes:3}, s_kira1:{likes:88,dislikes:0} };
const COLORS = ["#FB7A28","#7c5cff","#36d1c4","#ff5c7c","#ffb347","#5c8bff","#ff7ac6","#2bbf4e"];

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

// ---------- IndexedDB (folder handles) ----------
function fsdb(){ return new Promise((res,rej)=>{ const r=indexedDB.open("okfs",1); r.onupgradeneeded=()=>r.result.createObjectStore("dirs"); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function fsPut(k,v){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("dirs","readwrite"); t.objectStore("dirs").put(v,k); t.oncomplete=res; }); }
async function fsGet(k){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("dirs","readonly"); const q=t.objectStore("dirs").get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }); }
const dirCache={};
async function ensurePerm(h){ if(!h)return false; const o={mode:"read"}; if((await h.queryPermission(o))==="granted")return true; try{ return (await h.requestPermission(o))==="granted"; }catch{ return false; } }

// ---------- helpers ----------
function allUsers(){ return SEED_USERS.concat(Object.values(db().usersById)); }
function userById(id){ return allUsers().find(u=>u.id===id); }
function seedAt(h){ return Date.now()-(h||0)*3600000; }
function allTracks(){ const s=SEED_TRACKS.map(t=>({ ...t, createdAt:seedAt(t.ageHrs), visibility:"public", share:true })); return db().tracks.map(t=>({ ...t })).concat(s); }
function tracksByUser(uid,owner){ return allTracks().filter(t=>t.userId===uid&&(owner||t.visibility!=="private")).sort((a,b)=>b.createdAt-a.createdAt); }
function playlistsByUser(uid){ return db().playlists.filter(p=>p.userId===uid).sort((a,b)=>b.createdAt-a.createdAt); }
function allStatuses(){ const s=SEED_STATUSES.map(x=>({ ...x, time:seedAt(x.ageHrs) })); return db().statuses.map(x=>({ ...x })).concat(s); }
function statusesByUser(uid){ return allStatuses().filter(s=>s.userId===uid).sort((a,b)=>b.time-a.time); }
function currentUser(){ const d=db(); return d.session?userById(d.session):null; }
function followerCount(uid){ const d=db(); let n=SEED_FOLLOWERS[uid]||0; for(const f in d.follows) if(d.follows[f].includes(uid)) n++; return n; }
function followingCount(uid){ return (db().follows[uid]||[]).length; }
function isFollowing(uid){ const d=db(); return d.session&&(d.follows[d.session]||[]).includes(uid); }
function likeCount(t){ return (SEED_STATS[t]?.likes||0)+(db().likes[t]||[]).length; }
function dislikeCount(t){ return (db().dislikes[t]||[]).length; }
function hasLiked(t){ const d=db(); return d.session&&(d.likes[t]||[]).includes(d.session); }
function hasDisliked(t){ const d=db(); return d.session&&(d.dislikes[t]||[]).includes(d.session); }
function playCount(t){ return (SEED_STATS[t]?.plays||0)+(db().plays[t]||0); }
function stLikeCount(id){ return (SEED_ST_STATS[id]?.likes||0)+(db().stLikes[id]||[]).length; }
function stDislikeCount(id){ return (SEED_ST_STATS[id]?.dislikes||0)+(db().stDislikes[id]||[]).length; }
function stHasLiked(id){ const d=db(); return d.session&&(d.stLikes[id]||[]).includes(d.session); }
function stHasDisliked(id){ const d=db(); return d.session&&(d.stDislikes[id]||[]).includes(d.session); }
function stComments(id){ return db().stComments[id]||[]; }
function esc(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function nfmt(n){ return n>=1000?(n/1000).toFixed(n%1000>=100?1:0)+"k":""+n; }
function timeAgo(t){ const s=Math.floor((Date.now()-t)/1000); if(s<60)return"just now"; const m=Math.floor(s/60); if(m<60)return m+"m"; const h=Math.floor(m/60); if(h<24)return h+"h"; return Math.floor(h/24)+"d"; }
function initials(n){ return n.split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase(); }
function grad(c){ return `linear-gradient(135deg, ${c}, #6a4a2e)`; }
function avatarStyle(u,size){ const s=`width:${size}px;height:${size}px;font-size:${Math.round(size/2.6)}px;`; return u.avatarImg?`${s}background-image:url('${u.avatarImg}')`:`${s}background:${u.color}`; }
let toastTimer; function toast(m){ const e=$("toast"); e.textContent=m; e.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>e.hidden=true,3200); }

// ---------- state ----------
let state={ view:"discover", profileId:null, query:"" };
function go(v,x={}){ state={ ...state, view:v, ...x }; render(); window.scrollTo(0,0); }
function render(){ currentUser()?renderApp():renderLanding(); }

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
function continueWith(key){ const d=db(); if(d.identities[key]){ d.session=d.identities[key]; commit(d); toast("Welcome back!"); return go("discover"); } openOnboard(key); }
function openOnboard(key){
  openOverlay(`<h2>Welcome to OK Music 👋</h2><p class="sub">Pick a name and handle to set up your creator profile.</p>
    <div class="field"><label>Display name</label><input class="fb-field" id="obName" placeholder="e.g. Emmanuel Leveille" /></div>
    <div class="field"><label>Handle (@username)</label><input class="fb-field" id="obHandle" placeholder="emmanuel" /></div>
    <button class="btn primary block" data-action="finishonboard" data-k="${esc(key)}">Create my profile</button>
    <p class="note">Prototype sign-in is stored only in this browser. Firebase makes Google/Apple/email real & shared.</p>`);
}
function finishOnboard(key){
  const name=($("obName").value||"").trim(), handle=($("obHandle").value||"").trim().replace(/^@/,"").toLowerCase();
  if(!name||!handle) return toast("Enter a name and handle");
  if(!/^[a-z0-9_]{2,}$/.test(handle)) return toast("Handle: letters, numbers, underscore");
  if(SEED_USERS.some(u=>u.handle===handle)||db().accounts[handle]) return toast("That handle is taken");
  const d=db(); const id="u_"+Date.now();
  d.accounts[handle]={ id, name, handle }; d.usersById[id]={ id, name, handle, bio:"New AI music creator 🎶", color:COLORS[Math.floor(Math.random()*COLORS.length)] };
  d.identities[key]=id; d.session=id; commit(d); closeOverlay(); toast("You're in! 🎉"); go("profile",{profileId:id});
}

// ============ APP SHELL ============
function renderApp(){
  const u=currentUser();
  const item=(v,ic,l)=>`<div class="side-item ${state.view===v?'active':''}" data-action="nav" data-view="${v}"><span class="ic">${ic}</span>${l}</div>`;
  $("root").innerHTML=`
    <div class="topbar">
      <div class="brand" data-action="nav" data-view="discover"><span class="l">◎</span><b>OK&nbsp;Music</b></div>
      <input class="search" id="search" placeholder="Search artists & tracks…" value="${esc(state.query)}" />
      <div class="me" data-action="profile" data-uid="${u.id}"><div class="avatar" style="${avatarStyle(u,34)}">${u.avatarImg?'':initials(u.name)}</div></div>
    </div>
    <div class="shell">
      <nav class="sidebar">
        ${item("discover","🧭","Discover")}
        ${item("home","🏠","My Feed")}
        <div class="side-item" data-action="profile" data-uid="${u.id}"><span class="ic">😊</span>My Page</div>
        ${item("mymusic","🎵","My Music")}
        <div class="side-sep"></div>
        <div class="side-item" data-action="sharefolder"><span class="ic">📁</span>Share a folder</div>
        <div class="side-item" data-action="upload"><span class="ic">⬆️</span>Add single track</div>
        <div class="side-item" data-action="customize"><span class="ic">🎨</span>Edit profile</div>
        <div class="side-item" data-action="invite"><span class="ic">✉️</span>Invite friends</div>
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
  if(state.view==="home") return renderHome();
  renderDiscover();
}

// ---------- discover (browse music) ----------
function renderDiscover(){
  let list=allTracks().filter(t=>t.visibility==="public");
  const q=state.query.trim().toLowerCase();
  if(q) list=list.filter(t=>t.title.toLowerCase().includes(q)||userById(t.userId)?.name.toLowerCase().includes(q));
  list.sort((a,b)=>b.createdAt-a.createdAt);
  $("page").innerHTML=`<div class="h-title">Discover</div>${list.length?`<div class="grid">${list.map(card).join("")}</div>`:'<div class="empty">No tracks found.</div>'}`;
}
function card(t){
  const u=userById(t.userId);
  return `<div class="card">
    <div class="card-art" style="background:${grad(t.accent)}" data-action="play" data-id="${t.id}">◎<button class="card-play" data-action="play" data-id="${t.id}">▶</button></div>
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
  const cover=u.bgImg?`background-image:url('${u.bgImg}');background-size:cover;background-position:center`:u.bgColor?`background:${u.bgColor}`:"";
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
  return `<div class="mrow2"><div class="mart" style="background:${grad(t.accent)}" data-action="play" data-id="${t.id}">◎</div>
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
  const cmts=cs.map(c=>`<div class="scmt"><div class="sc-av" style="${avatarStyle(userById(c.uid)||{color:'#bbb'},28)}">${(userById(c.uid)?.avatarImg)?'':initials(c.name)}</div>
      <div class="sc-b"><b>${esc(c.name)}</b> · <span style="color:var(--muted);font-size:11px">${timeAgo(c.time)}</span><div>${esc(c.text)}</div></div></div>`).join("");
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
  const d=db(); d.statuses.unshift({ id:"s_"+Date.now(), userId:d.session, text:t, time:Date.now() }); commit(d); toast("Posted to your wall 📣"); renderMain();
}
function stLike(id){ const d=db(); if(!d.session) return continueWith("email"); d.stLikes[id]=d.stLikes[id]||[]; d.stDislikes[id]=(d.stDislikes[id]||[]).filter(x=>x!==d.session);
  const i=d.stLikes[id].indexOf(d.session); if(i>=0)d.stLikes[id].splice(i,1); else d.stLikes[id].push(d.session); commit(d); renderMain(); }
function stDislike(id){ const d=db(); if(!d.session) return continueWith("email"); d.stDislikes[id]=d.stDislikes[id]||[]; d.stLikes[id]=(d.stLikes[id]||[]).filter(x=>x!==d.session);
  const i=d.stDislikes[id].indexOf(d.session); if(i>=0)d.stDislikes[id].splice(i,1); else d.stDislikes[id].push(d.session); commit(d); renderMain(); }
function stComment(id){ const el=$("sc_"+id); const t=(el?.value||"").trim(); if(!t) return toast("Write a comment first");
  const u=currentUser(); if(!u) return continueWith("email"); const d=db(); d.stComments[id]=d.stComments[id]||[]; d.stComments[id].push({ uid:u.id, name:u.name, text:t, time:Date.now() }); commit(d); renderMain(); }

// ---------- track like/dislike (music = reactions only) ----------
function toggleLike(id){ const d=db(); if(!d.session) return continueWith("email"); d.likes[id]=d.likes[id]||[]; d.dislikes[id]=(d.dislikes[id]||[]).filter(x=>x!==d.session);
  const i=d.likes[id].indexOf(d.session); if(i>=0)d.likes[id].splice(i,1); else d.likes[id].push(d.session); commit(d); renderMain(); }
function toggleDislike(id){ const d=db(); if(!d.session) return continueWith("email"); d.dislikes[id]=d.dislikes[id]||[]; d.likes[id]=(d.likes[id]||[]).filter(x=>x!==d.session);
  const i=d.dislikes[id].indexOf(d.session); if(i>=0)d.dislikes[id].splice(i,1); else d.dislikes[id].push(d.session); commit(d); renderMain(); }

// ---------- playlists from folders ----------
function playlistBlock(p,owner){
  const rows=p.files.map((f,i)=>`<div class="trow" data-action="playfile" data-pl="${p.id}" data-file="${esc(f)}"><div class="tn" id="tn_${p.id}_${i}">${i+1}</div><div class="ttitle">${esc(f.replace(/\.[^.]+$/,''))}</div><span class="tplay">▶</span></div>`).join("");
  const acts=owner?`<div class="pl-actions">${p.thumbs?'<span class="pill pub">covers ✓</span>':`<button class="btn sm" data-action="setthumbs" data-pl="${p.id}">＋ covers</button>`}<button class="btn sm" data-action="relink" data-pl="${p.id}">re-link</button></div>`:"";
  return `<div class="playlist"><div class="playlist-head"><div class="pl-ic">📁</div><div><div class="pl-name">${esc(p.name)}</div><div class="pl-sub">${p.files.length} tracks · folder</div></div>${acts}</div><div class="tracklist">${rows}</div></div>`;
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
  let c=dirCache[plId]; if(!c||!c.music){ const h=await fsGet(plId+"_music"); if(h&&await ensurePerm(h)){ c=dirCache[plId]=dirCache[plId]||{}; c.music=h; } }
  if(!c||!c.music){ const p=db().playlists.find(x=>x.id===plId); return toast(`Re-link "${p?p.name:'folder'}" to play (access resets on reload).`); }
  try{ const fh=await c.music.getFileHandle(file); const f=await fh.getFile(); showPlayer(file.replace(/\.[^.]+$/,""), currentUser()?.name||"", "#FB7A28", URL.createObjectURL(f)); }
  catch{ toast("Couldn't read that file — try re-linking."); }
}

// ---------- single track upload ----------
function openUpload(){
  if(!currentUser()) return continueWith("email");
  openOverlay(`<h2>Add a single track</h2><p class="sub">Publish now or keep private until ready.</p>
    <div class="field"><label>Track title</label><input id="upTitle" placeholder="e.g. Midnight Bloom" /></div>
    <div class="field"><label>Cover color</label><div class="swatches" id="swatches">${COLORS.map((c,i)=>`<div class="swatch ${i===0?'sel':''}" style="background:${c}" data-action="swatch" data-c="${c}"></div>`).join("")}</div></div>
    <div class="field"><label>Audio link (optional)</label><input id="upSrc" placeholder="https://…/song.mp3" /></div>
    <div class="field"><label>Visibility</label><div class="radio-row" id="visRow"><div class="radio-card sel" data-action="vis" data-v="public"><b>Public</b>Everyone can play it</div><div class="radio-card" data-action="vis" data-v="private"><b>Private</b>Only you, until you publish</div></div></div>
    <label class="check"><input type="checkbox" id="upShare" checked> Allow fans to share this track</label>
    <button class="btn primary block" data-action="dopublish">Add to my music</button>`);
  window._upColor=COLORS[0]; window._upVis="public";
}
function doPublish(){ const title=($("upTitle").value||"").trim(); if(!title) return toast("Give it a title");
  const d=db(); d.tracks.unshift({ id:"t_"+Date.now(), userId:d.session, title, src:($("upSrc").value||"").trim(), accent:window._upColor||COLORS[0], visibility:window._upVis||"public", share:$("upShare").checked, createdAt:Date.now() });
  commit(d); closeOverlay(); toast(window._upVis==="private"?"Saved private 🔒":"Published! 🎵"); go("mymusic"); }

// ---------- my music ----------
function renderMyMusic(){
  const u=currentUser(); const tracks=tracksByUser(u.id,true); const pls=playlistsByUser(u.id);
  const rows=tracks.map(t=>`<div class="mrow"><div class="mart" style="background:${grad(t.accent)}">◎</div>
    <div class="minfo"><div class="mt">${esc(t.title)}</div><div class="ms">▶ ${nfmt(playCount(t.id))} · 👍 ${nfmt(likeCount(t.id))} · 👎 ${nfmt(dislikeCount(t.id))} <span class="pill ${t.visibility==='private'?'prv':'pub'}">${t.visibility==='private'?'Private':'Public'}</span></div></div>
    ${t.visibility==='private'?`<button class="btn sm primary" data-action="publish" data-id="${t.id}">Publish</button>`:`<button class="btn sm" data-action="unpublish" data-id="${t.id}">Make private</button>`}</div>`).join("");
  $("page").innerHTML=`<div class="h-title">My Music</div>
    <div class="folder-banner">📁 <b>Folders become playlists.</b> Pick a music folder — every song becomes a playable track instantly, no upload. Add a <b>thumbnails folder</b> (images named like each track) for covers. Chrome &amp; Edge.</div>
    <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap"><button class="btn primary" data-action="sharefolder">📁 Share a music folder</button><button class="btn" data-action="upload">＋ Add single track</button></div>
    ${pls.length?`<div class="section-title">Playlists (folders)</div>${pls.map(p=>playlistBlock(p,true)).join("")}`:""}
    ${tracks.length?`<div class="section-title">Single tracks</div>${rows}`:""}
    ${(!pls.length&&!tracks.length)?'<div class="empty">No music yet — share a folder to begin.</div>':""}`;
  pls.forEach(loadCovers);
}
function setVisibility(id,v){ const d=db(); const t=d.tracks.find(x=>x.id===id); if(t){ t.visibility=v; commit(d); toast(v==="public"?"Published 🎉":"Set to private"); renderMyMusic(); } }

// ---------- edit profile (photo + bg + bio) ----------
function openCustomize(){
  const u=currentUser();
  openOverlay(`<h2>🎨 Edit profile</h2><p class="sub">Add your photo and make your page yours.</p>
    <div class="field"><label>Profile photo</label><div class="avup"><div class="avprev" id="avPrev" style="${u.avatarImg?`background-image:url('${u.avatarImg}')`:''}">${u.avatarImg?'':initials(u.name)}</div>
      <div><input type="file" id="avFile" accept="image/*" /><div class="note" style="margin-top:4px">JPG/PNG from your computer — or paste a link below.</div></div></div></div>
    <div class="field"><label>Photo link (optional)</label><input id="avUrl" placeholder="https://…/photo.jpg" /></div>
    <div class="field"><label>Bio (shown on your profile)</label><textarea id="bgBio" placeholder="Tell fans about your music…">${esc(u.bio||"")}</textarea></div>
    <div class="field"><label>Banner color</label><div class="swatches" id="bgSw">${["#FFCBA0","#7c5cff","#36d1c4","#ff5c7c","#2bbf4e","#5c8bff","#33272f"].map(c=>`<div class="swatch ${u.bgColor===c?'sel':''}" style="background:${c}" data-action="bgcolor" data-c="${c}"></div>`).join("")}</div></div>
    <div class="field"><label>Or a banner image link</label><input id="bgImg" placeholder="https://…/banner.jpg" value="${esc(u.bgImg||"")}" /></div>
    <button class="btn primary block" data-action="savecustom">Save profile</button>`);
  window._bgColor=u.bgColor||""; window._avatar=null;
}
function saveCustom(){
  const d=db(); const u=d.usersById[d.session]; if(!u) return;
  const url=($("avUrl").value||"").trim();
  if(window._avatar) u.avatarImg=window._avatar; else if(url) u.avatarImg=url;
  u.bio=($("bgBio").value||"").trim()||u.bio; u.bgColor=window._bgColor||""; u.bgImg=($("bgImg").value||"").trim();
  commit(d); closeOverlay(); toast("Profile saved ✨"); go("profile",{profileId:d.session});
}

// ---------- invite ----------
function openInvite(){ const u=currentUser(); const link=`${location.origin}${location.pathname}?ref=${u?u.handle:""}`;
  openOverlay(`<h2>✉️ Invite friends</h2><p class="sub">Share your link — friends who join can follow you back and grow your fanbase.</p>
    <div class="invite-link"><input id="invLink" value="${esc(link)}" readonly /><button class="btn primary" data-action="copyinvite">Copy</button></div>`); }

// ---------- social ----------
function share(id){ const link=`${location.origin}${location.pathname}?track=${id}`; if(navigator.clipboard) navigator.clipboard.writeText(link).then(()=>toast("Share link copied ✓")).catch(()=>toast(link)); else toast(link); }
function toggleFollow(uid){ const d=db(); if(!d.session) return continueWith("email"); d.follows[d.session]=d.follows[d.session]||[]; const i=d.follows[d.session].indexOf(uid); if(i>=0){d.follows[d.session].splice(i,1);toast("Unfollowed");}else{d.follows[d.session].push(uid);toast("You're now a fan ✓");} commit(d); render(); }
function logout(){ const d=db(); d.session=null; commit(d); go("discover"); }

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
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-action]"); if(!el) return; const a=el.dataset.action;
  const M={
    nav:()=>go(el.dataset.view), profile:()=>go("profile",{profileId:el.dataset.uid}),
    auth:()=>continueWith(el.dataset.p), authemail:()=>{ const v=($("liEmail").value||"").trim().toLowerCase(); if(!v||!v.includes("@")) return toast("Enter a valid email"); continueWith(v); }, finishonboard:()=>finishOnboard(el.dataset.k),
    sharefolder:shareMusicFolder, setthumbs:()=>setThumbsFolder(el.dataset.pl), relink:()=>relinkFolder(el.dataset.pl), playfile:()=>playFolderTrack(el.dataset.pl,el.dataset.file),
    upload:openUpload, dopublish:doPublish, customize:openCustomize, savecustom:saveCustom, invite:openInvite,
    copyinvite:()=>{ const i=$("invLink"); i.select(); if(navigator.clipboard)navigator.clipboard.writeText(i.value); toast("Invite link copied ✓"); },
    play:()=>playTrack(el.dataset.id), like:()=>toggleLike(el.dataset.id), dislike:()=>toggleDislike(el.dataset.id),
    poststatus:postStatus, slike:()=>stLike(el.dataset.id), sdislike:()=>stDislike(el.dataset.id), scomment:()=>stComment(el.dataset.id),
    follow:()=>toggleFollow(el.dataset.uid), share:()=>share(el.dataset.id), logout:logout, close:closeOverlay,
    publish:()=>setVisibility(el.dataset.id,"public"), unpublish:()=>setVisibility(el.dataset.id,"private"),
    swatch:()=>{window._upColor=el.dataset.c;document.querySelectorAll("#swatches .swatch").forEach(s=>s.classList.toggle("sel",s===el));},
    vis:()=>{window._upVis=el.dataset.v;document.querySelectorAll("#visRow .radio-card").forEach(c=>c.classList.toggle("sel",c===el));},
    bgcolor:()=>{window._bgColor=el.dataset.c;const bi=$("bgImg");if(bi)bi.value="";document.querySelectorAll("#bgSw .swatch").forEach(s=>s.classList.toggle("sel",s===el));}
  };
  if(M[a]) M[a]();
});
document.addEventListener("change",e=>{ if(e.target.id==="avFile"){ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ window._avatar=r.result; const p=$("avPrev"); if(p){ p.style.backgroundImage=`url('${r.result}')`; p.textContent=""; } }; r.readAsDataURL(f); } });
$("overlay").addEventListener("click",e=>{ if(e.target.id==="overlay") closeOverlay(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeOverlay(); });

render();
