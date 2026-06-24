// ============================================================
//  OK Music — AI music social network (prototype).
//  Auth: Claude-style (Google / Apple / email).
//  Folders → playlists via the browser File System Access API:
//  a creator picks a music folder on their computer and it becomes
//  a playable playlist instantly (no upload). A second "thumbnails"
//  folder supplies per-track covers, matched by file name.
//  Everything stays basic & local so it loads fast on weak links.
//  (Per-browser prototype; Firebase makes accounts + reach to fans real.)
// ============================================================
const $ = (id) => document.getElementById(id);
const audio = $("audio");

const SEED_STATS = {
  t_afghan:{plays:412,likes:58}, t_persian:{plays:233,likes:31}, t_gray:{plays:188,likes:24}, t_spring:{plays:97,likes:12},
  t_nova1:{plays:1203,likes:210}, t_nova2:{plays:540,likes:77}, t_lumen1:{plays:860,likes:140}, t_lumen2:{plays:320,likes:41},
  t_kira1:{plays:1500,likes:260}, t_kira2:{plays:610,likes:95}
};
const SEED_FOLLOWERS = { u_okmusic:128, u_nova:4200, u_lumen:2100, u_kira:8800 };
const COLORS = ["#FB7A28","#7c5cff","#36d1c4","#ff5c7c","#ffb347","#5c8bff","#ff7ac6","#2bbf4e"];

// ---------- DB ----------
const LS = "okcommunity3";
function load(){ try{ return JSON.parse(localStorage.getItem(LS))||{}; }catch{ return {}; } }
function db(){
  const d=load();
  d.accounts=d.accounts||{}; d.usersById=d.usersById||{}; d.identities=d.identities||{};
  d.tracks=d.tracks||[]; d.playlists=d.playlists||[]; d.session=d.session||null;
  d.follows=d.follows||{}; d.likes=d.likes||{}; d.plays=d.plays||{}; d.comments=d.comments||{};
  return d;
}
function commit(d){ localStorage.setItem(LS,JSON.stringify(d)); }

// ---------- IndexedDB (folder handles) ----------
function fsdb(){ return new Promise((res,rej)=>{ const r=indexedDB.open("okfs",1); r.onupgradeneeded=()=>r.result.createObjectStore("dirs"); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function fsPut(k,v){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("dirs","readwrite"); t.objectStore("dirs").put(v,k); t.oncomplete=res; }); }
async function fsGet(k){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("dirs","readonly"); const q=t.objectStore("dirs").get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }); }
const dirCache={};
async function ensurePerm(h){ if(!h) return false; const o={mode:"read"}; if((await h.queryPermission(o))==="granted") return true; try{ return (await h.requestPermission(o))==="granted"; }catch{ return false; } }

// ---------- helpers ----------
function allUsers(){ return SEED_USERS.concat(Object.values(db().usersById)); }
function userById(id){ return allUsers().find(u=>u.id===id); }
function seedAt(t){ return Date.now()-(t.ageHrs||0)*3600000; }
function allTracks(){ const s=SEED_TRACKS.map(t=>({ ...t, createdAt:seedAt(t), visibility:"public", share:true })); return db().tracks.map(t=>({ ...t })).concat(s); }
function tracksByUser(uid,owner){ return allTracks().filter(t=>t.userId===uid&&(owner||t.visibility!=="private")).sort((a,b)=>b.createdAt-a.createdAt); }
function playlistsByUser(uid){ return db().playlists.filter(p=>p.userId===uid).sort((a,b)=>b.createdAt-a.createdAt); }
function currentUser(){ const d=db(); return d.session?userById(d.session):null; }
function followerCount(uid){ const d=db(); let n=SEED_FOLLOWERS[uid]||0; for(const f in d.follows) if(d.follows[f].includes(uid)) n++; return n; }
function followingCount(uid){ return (db().follows[uid]||[]).length; }
function isFollowing(uid){ const d=db(); return d.session&&(d.follows[d.session]||[]).includes(uid); }
function likeCount(t){ return (SEED_STATS[t]?.likes||0)+(db().likes[t]||[]).length; }
function hasLiked(t){ const d=db(); return d.session&&(d.likes[t]||[]).includes(d.session); }
function playCount(t){ return (SEED_STATS[t]?.plays||0)+(db().plays[t]||0); }
function commentsOf(t){ return db().comments[t]||[]; }
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
    <div class="logo">◎ OK Music</div>
    <h1>Where AI music finds its fans.</h1>
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
function continueWith(key){
  const d=db();
  if(d.identities[key]){ d.session=d.identities[key]; commit(d); toast("Welcome back!"); return go("discover"); }
  openOnboard(key);
}
function openOnboard(key){
  openOverlay(`
    <h2>Welcome to OK Music 👋</h2><p class="sub">Just pick a name and handle to set up your creator profile.</p>
    <div class="field"><label>Display name</label><input class="fb-field" id="obName" placeholder="e.g. Emmanuel Leveille" /></div>
    <div class="field"><label>Handle (your @username)</label><input class="fb-field" id="obHandle" placeholder="emmanuel" /></div>
    <button class="btn primary block" data-action="finishonboard" data-k="${esc(key)}">Create my profile</button>
    <p class="note">Prototype sign-in is stored only in this browser. With Firebase, Google/Apple/email sign-in becomes real, secure, and shared across everyone.</p>`);
}
function finishOnboard(key){
  const name=($("obName").value||"").trim();
  const handle=($("obHandle").value||"").trim().replace(/^@/,"").toLowerCase();
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
        <div class="side-item" data-action="profile" data-uid="${u.id}"><span class="ic">😊</span>My Profile</div>
        ${item("mymusic","🎵","My Music")}
        <div class="side-sep"></div>
        <div class="side-item" data-action="sharefolder"><span class="ic">📁</span>Share a folder</div>
        <div class="side-item" data-action="upload"><span class="ic">⬆️</span>Add single track</div>
        <div class="side-item" data-action="invite"><span class="ic">✉️</span>Invite friends</div>
        <div class="side-sep"></div>
        <div class="side-item" data-action="logout"><span class="ic">↩️</span>Log out</div>
      </nav>
      <main class="main"><div class="page" id="page"></div></main>
    </div>`;
  renderMain();
  setTimeout(()=>{ const s=$("search"); if(s) s.oninput=e=>{ state.query=e.target.value; if(state.view!=="discover"&&state.view!=="home") state.view="discover"; renderMain(); }; },0);
}
function renderMain(){
  if(state.view==="profile") return renderProfile(state.profileId);
  if(state.view==="mymusic") return renderMyMusic();
  renderFeed();
}

// ---------- feed ----------
function renderFeed(){
  const u=currentUser();
  let list=allTracks().filter(t=>t.visibility==="public");
  if(state.view==="home"){ const f=db().follows[u.id]||[]; list=list.filter(t=>f.includes(t.userId)); }
  const q=state.query.trim().toLowerCase();
  if(q) list=list.filter(t=>t.title.toLowerCase().includes(q)||userById(t.userId)?.name.toLowerCase().includes(q));
  list.sort((a,b)=>b.createdAt-a.createdAt);
  const body=list.length?`<div class="grid">${list.map(t=>card(t)).join("")}</div>`:`<div class="empty">${state.view==="home"?"Follow artists and their newest tracks land here.":"No tracks found."}</div>`;
  $("page").innerHTML=`<div class="h-title">${state.view==="home"?"My Feed":"Discover"}</div>${body}`;
}
function card(t,owner){
  const u=userById(t.userId); const priv=t.visibility==="private";
  const shareBtn=(!priv&&t.share)?`<button data-action="share" data-id="${t.id}">↗</button>`:"";
  return `<div class="card">
    <div class="card-art" style="background:${grad(t.accent)}" data-action="play" data-id="${t.id}">${priv?'<span class="tag">🔒 Private</span>':''}◎<button class="card-play" data-action="play" data-id="${t.id}">▶</button></div>
    <div class="card-body"><div class="card-title" data-action="open" data-id="${t.id}">${esc(t.title)}</div>
      <div class="card-artist" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div>
      <div class="card-meta"><button class="${hasLiked(t.id)?'on':''}" data-action="like" data-id="${t.id}">♥ ${nfmt(likeCount(t.id))}</button>
        <button data-action="open" data-id="${t.id}">💬 ${commentsOf(t.id).length}</button>${shareBtn}
        <span class="spacer"></span><span>▶ ${nfmt(playCount(t.id))}</span></div></div></div>`;
}

// ---------- playlist rendering ----------
function playlistBlock(p,owner){
  const rows=p.files.map((f,i)=>`<div class="trow" data-action="playfile" data-pl="${p.id}" data-file="${esc(f)}">
      <div class="tn" id="tn_${p.id}_${i}">${i+1}</div>
      <div class="ttitle">${esc(f.replace(/\.[^.]+$/,''))}</div><span class="tplay">▶</span></div>`).join("");
  const acts=owner?`<div class="pl-actions">
      ${p.thumbs?`<span class="pill pub">covers ✓</span>`:`<button class="btn sm" data-action="setthumbs" data-pl="${p.id}">＋ thumbnails</button>`}
      <button class="btn sm" data-action="relink" data-pl="${p.id}">re-link</button></div>`:"";
  return `<div class="playlist"><div class="playlist-head"><div class="pl-ic">📁</div>
      <div><div class="pl-name">${esc(p.name)}</div><div class="pl-sub">${p.files.length} tracks · playlist from a folder</div></div>${acts}</div>
      <div class="tracklist">${rows}</div></div>`;
}
async function loadCovers(p){
  if(!p.thumbs) return;
  let c=dirCache[p.id]; if(!c||!c.thumbs){ const h=await fsGet(p.id+"_thumbs"); if(h&&await ensurePerm(h)){ c=dirCache[p.id]=dirCache[p.id]||{}; c.thumbs=h; } }
  if(!c||!c.thumbs) return;
  for(let i=0;i<p.files.length;i++){
    const base=p.files[i].replace(/\.[^.]+$/,""); const el=document.getElementById(`tn_${p.id}_${i}`); if(!el) continue;
    for(const ext of [".jpg",".jpeg",".png",".webp",".gif"]){
      try{ const fh=await c.thumbs.getFileHandle(base+ext); const file=await fh.getFile(); el.style.backgroundImage=`url('${URL.createObjectURL(file)}')`; el.textContent=""; break; }catch{}
    }
  }
}

// ---------- profile ----------
function renderProfile(uid){
  const u=userById(uid); if(!u){ $("page").innerHTML=`<div class="empty">Artist not found.</div>`; return; }
  const me=currentUser(); const mine=me&&me.id===uid;
  const tracks=tracksByUser(uid,mine); const pls=playlistsByUser(uid);
  const cover=u.bgImg?`background-image:url('${u.bgImg}');background-size:cover;background-position:center`:u.bgColor?`background:${u.bgColor}`:"";
  const actions=mine
    ? `<button class="btn primary" data-action="sharefolder">📁 Share a folder</button>
       <button class="btn" data-action="upload">＋ Single track</button>
       <button class="btn" data-action="customize">🎨 Customize</button>
       <button class="btn" data-action="invite">✉️ Invite</button>`
    : `<button class="btn ${isFollowing(uid)?'':'primary'}" data-action="follow" data-uid="${uid}">${isFollowing(uid)?'Following ✓':'Follow'}</button>`;
  $("page").innerHTML=`
    <div class="profile-cover" style="${cover}"></div>
    <div class="profile-head"><div class="profile-avatar" style="${avatarStyle(u,104)}">${u.avatarImg?'':initials(u.name)}</div>
      <div class="profile-info"><div class="profile-name">${esc(u.name)} ${u.founder?'<span class="badge-founder">FOUNDER</span>':''}</div><div class="profile-handle">@${esc(u.handle)}</div></div></div>
    <div class="profile-stats"><div><b>${tracks.length+pls.reduce((n,p)=>n+p.files.length,0)}</b> <span>tracks</span></div>
      <div><b>${nfmt(followerCount(uid))}</b> <span>fans</span></div><div><b>${nfmt(followingCount(uid))}</b> <span>following</span></div></div>
    <div class="profile-bio">${esc(u.bio||"")}</div>
    <div class="profile-actions" style="margin-top:14px">${actions}</div>
    <div class="divider"></div>
    ${pls.length?`<div class="section-title">Playlists</div>${pls.map(p=>playlistBlock(p,mine)).join("")}`:""}
    ${tracks.length?`<div class="section-title">Single tracks</div><div class="grid">${tracks.map(t=>card(t,mine)).join("")}</div>`:""}
    ${(!pls.length&&!tracks.length)?`<div class="empty">No music yet.${mine?' Tap "Share a folder" to turn a folder on your computer into a playlist.':''}</div>`:""}`;
  pls.forEach(loadCovers);
}

// ---------- my music ----------
function renderMyMusic(){
  const u=currentUser(); const tracks=tracksByUser(u.id,true); const pls=playlistsByUser(u.id);
  const rows=tracks.map(t=>`<div class="mrow"><div class="mart" style="background:${grad(t.accent)}">◎</div>
      <div class="minfo"><div class="mt">${esc(t.title)}</div><div class="ms">▶ ${nfmt(playCount(t.id))} · ♥ ${nfmt(likeCount(t.id))}
        <span class="pill ${t.visibility==='private'?'prv':'pub'}">${t.visibility==='private'?'Private':'Public'}</span>${t.share&&t.visibility!=='private'?'<span class="pill pub">Sharing on</span>':''}</div></div>
      ${t.visibility==='private'?`<button class="btn sm primary" data-action="publish" data-id="${t.id}">Publish</button>`:`<button class="btn sm" data-action="unpublish" data-id="${t.id}">Make private</button>`}
      <button class="btn sm" data-action="toggleshare" data-id="${t.id}">${t.share?'Disable share':'Allow share'}</button></div>`).join("");
  $("page").innerHTML=`
    <div class="h-title">My Music</div>
    <div class="folder-banner">📁 <b>Folders become playlists.</b> Pick a music folder from your computer — every song in it becomes a playable track, instantly, with no upload. Add a <b>thumbnails folder</b> (images named the same as each track) for covers. Works in Chrome &amp; Edge.</div>
    <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">
      <button class="btn primary" data-action="sharefolder">📁 Share a music folder</button>
      <button class="btn" data-action="upload">＋ Add single track</button></div>
    ${pls.length?`<div class="section-title">Playlists (folders)</div>${pls.map(p=>playlistBlock(p,true)).join("")}`:""}
    ${tracks.length?`<div class="section-title">Single tracks</div>${rows}`:""}
    ${(!pls.length&&!tracks.length)?'<div class="empty">No music yet — share a folder to begin.</div>':""}`;
  pls.forEach(loadCovers);
}
function setVisibility(id,v){ const d=db(); const t=d.tracks.find(x=>x.id===id); if(t){ t.visibility=v; commit(d); toast(v==="public"?"Published 🎉":"Set to private"); renderMyMusic(); } }
function toggleShare(id){ const d=db(); const t=d.tracks.find(x=>x.id===id); if(t){ t.share=!t.share; commit(d); toast(t.share?"Sharing enabled":"Sharing disabled"); renderMyMusic(); } }

// ---------- FOLDER SHARING ----------
async function shareMusicFolder(){
  if(!window.showDirectoryPicker){ return toast("Folder sharing needs Chrome or Edge (desktop)."); }
  let dir; try{ dir=await window.showDirectoryPicker(); }catch{ return; }
  const files=[]; for await(const e of dir.values()){ if(e.kind==="file"&&/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(e.name)) files.push(e.name); }
  if(!files.length) return toast("No audio files found in that folder.");
  files.sort();
  const d=db(); const id="pl_"+Date.now();
  d.playlists.unshift({ id, userId:d.session, name:dir.name, files, thumbs:null, createdAt:Date.now() });
  commit(d); dirCache[id]={ music:dir, thumbs:null }; await fsPut(id+"_music",dir);
  toast(`Playlist "${dir.name}" created — ${files.length} tracks 🎵`);
  go("mymusic");
}
async function setThumbsFolder(plId){
  if(!window.showDirectoryPicker) return toast("Needs Chrome or Edge.");
  let dir; try{ dir=await window.showDirectoryPicker(); }catch{ return; }
  const d=db(); const p=d.playlists.find(x=>x.id===plId); if(p){ p.thumbs=dir.name; commit(d); }
  dirCache[plId]=dirCache[plId]||{}; dirCache[plId].thumbs=dir; await fsPut(plId+"_thumbs",dir);
  toast("Thumbnails linked ✓"); renderMain();
}
async function relinkFolder(plId){
  if(!window.showDirectoryPicker) return toast("Needs Chrome or Edge.");
  let dir; try{ dir=await window.showDirectoryPicker(); }catch{ return; }
  const files=[]; for await(const e of dir.values()){ if(e.kind==="file"&&/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(e.name)) files.push(e.name); }
  files.sort();
  const d=db(); const p=d.playlists.find(x=>x.id===plId); if(p){ p.files=files; p.name=dir.name; commit(d); }
  dirCache[plId]=dirCache[plId]||{}; dirCache[plId].music=dir; await fsPut(plId+"_music",dir);
  toast("Folder re-linked ✓"); renderMain();
}
async function playFolderTrack(plId,file){
  let c=dirCache[plId];
  if(!c||!c.music){ const h=await fsGet(plId+"_music"); if(h&&await ensurePerm(h)){ c=dirCache[plId]=dirCache[plId]||{}; c.music=h; } }
  if(!c||!c.music){ const p=db().playlists.find(x=>x.id===plId); return toast(`Re-link "${p?p.name:'the folder'}" to play (folder access resets when you reopen).`); }
  try{
    const fh=await c.music.getFileHandle(file); const f=await fh.getFile(); const url=URL.createObjectURL(f);
    const title=file.replace(/\.[^.]+$/,"");
    showPlayer(title, currentUser()?currentUser().name:"", "#FB7A28", url);
    // try cover
    const p=db().playlists.find(x=>x.id===plId);
    if(p&&p.thumbs){ let tc=dirCache[plId]; if(!tc.thumbs){ const th=await fsGet(plId+"_thumbs"); if(th&&await ensurePerm(th)) tc.thumbs=th; }
      if(tc.thumbs){ const base=title; for(const ext of [".jpg",".jpeg",".png",".webp"]){ try{ const ch=await tc.thumbs.getFileHandle(base+ext); const cf=await ch.getFile(); $("mpArt").style.background=`url('${URL.createObjectURL(cf)}') center/cover`; $("mpArt").textContent=""; break; }catch{} } } }
  }catch{ toast("Couldn't read that file — try re-linking the folder."); }
}

// ---------- upload single track ----------
function openUpload(){
  if(!currentUser()) return continueWith("email");
  openOverlay(`<h2>Add a single track</h2><p class="sub">Publish now or keep it private until ready.</p>
    <div class="field"><label>Track title</label><input id="upTitle" placeholder="e.g. Midnight Bloom" /></div>
    <div class="field"><label>Cover color</label><div class="swatches" id="swatches">${COLORS.map((c,i)=>`<div class="swatch ${i===0?'sel':''}" style="background:${c}" data-action="swatch" data-c="${c}"></div>`).join("")}</div></div>
    <div class="field"><label>Audio link (MP3/M4A URL — optional)</label><input id="upSrc" placeholder="https://…/song.mp3" /></div>
    <div class="field"><label>Visibility</label><div class="radio-row" id="visRow">
      <div class="radio-card sel" data-action="vis" data-v="public"><b>Public</b>Everyone can play it</div>
      <div class="radio-card" data-action="vis" data-v="private"><b>Private</b>Only you, until you publish</div></div></div>
    <label class="check"><input type="checkbox" id="upShare" checked> Allow fans to share this track</label>
    <button class="btn primary block" data-action="dopublish">Add to my music</button>`);
  window._upColor=COLORS[0]; window._upVis="public";
}
function doPublish(){
  const title=($("upTitle").value||"").trim(); if(!title) return toast("Give your track a title");
  const d=db(); d.tracks.unshift({ id:"t_"+Date.now(), userId:d.session, title, src:($("upSrc").value||"").trim(), accent:window._upColor||COLORS[0], visibility:window._upVis||"public", share:$("upShare").checked, createdAt:Date.now() });
  commit(d); closeOverlay(); toast(window._upVis==="private"?"Saved private 🔒":"Published! 🎵"); go("mymusic");
}

// ---------- customize / invite ----------
function openCustomize(){
  const u=currentUser();
  openOverlay(`<h2>🎨 Customize your page</h2><p class="sub">Make your profile yours.</p>
    <div class="field"><label>Banner color</label><div class="swatches" id="bgSw">${["#FFCBA0","#7c5cff","#36d1c4","#ff5c7c","#2bbf4e","#5c8bff","#33272f"].map(c=>`<div class="swatch ${u.bgColor===c?'sel':''}" style="background:${c}" data-action="bgcolor" data-c="${c}"></div>`).join("")}</div></div>
    <div class="field"><label>Or a background image link</label><input id="bgImg" placeholder="https://…/your-art.jpg" value="${esc(u.bgImg||"")}" /></div>
    <div class="field"><label>Bio</label><textarea id="bgBio" placeholder="Tell fans about your music…">${esc(u.bio||"")}</textarea></div>
    <button class="btn primary block" data-action="savecustom">Save my page</button>`);
  window._bgColor=u.bgColor||"";
}
function saveCustom(){ const d=db(); const u=d.usersById[d.session]; if(!u) return; u.bgColor=window._bgColor||""; u.bgImg=($("bgImg").value||"").trim(); u.bio=($("bgBio").value||"").trim()||u.bio; commit(d); closeOverlay(); toast("Page updated ✨"); go("profile",{profileId:d.session}); }
function openInvite(){ const u=currentUser(); const link=`${location.origin}${location.pathname}?ref=${u?u.handle:""}`;
  openOverlay(`<h2>✉️ Invite friends</h2><p class="sub">Share your link — friends who join can follow you back and grow your fanbase.</p>
    <div class="invite-link"><input id="invLink" value="${esc(link)}" readonly /><button class="btn primary" data-action="copyinvite">Copy</button></div>`); }

// ---------- track detail ----------
function openTrack(id){
  const t=allTracks().find(x=>x.id===id); if(!t) return; const u=userById(t.userId); const cs=commentsOf(id);
  openOverlay(`<div class="mp-art" style="width:88px;height:88px;border-radius:14px;font-size:32px;background:${grad(t.accent)};margin-bottom:12px">◎</div>
    <h2>${esc(t.title)}</h2><p class="sub" data-action="profile" data-uid="${u.id}" style="cursor:pointer">by ${esc(u.name)} · ▶ ${nfmt(playCount(id))} plays</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" data-action="play" data-id="${id}">▶ Play</button>
      <button class="btn ${hasLiked(id)?'on':''}" data-action="like" data-id="${id}">♥ ${nfmt(likeCount(id))}</button>
      ${(t.visibility!=="private"&&t.share)?`<button class="btn" data-action="share" data-id="${id}">↗ Share</button>`:""}</div>
    <div class="divider"></div><div class="section-title">Comments (${cs.length})</div>
    <div class="field"><textarea id="cmtText" placeholder="Say something nice…"></textarea></div>
    <button class="btn" data-action="docomment" data-id="${id}">Post comment</button>
    <div style="margin-top:8px">${cs.length?cs.map(c=>`<div class="comment"><span class="who">${esc(c.name)}</span><span class="when">${timeAgo(c.time)}</span><div class="body">${esc(c.text)}</div></div>`).join(""):'<p class="note">No comments yet.</p>'}</div>`);
}
function doComment(id){ const txt=($("cmtText").value||"").trim(); if(!txt) return toast("Write something first"); const u=currentUser(); const d=db(); d.comments[id]=d.comments[id]||[]; d.comments[id].unshift({ name:u?u.name:"Guest", text:txt, time:Date.now() }); commit(d); openTrack(id); }
function share(id){ const link=`${location.origin}${location.pathname}?track=${id}`; if(navigator.clipboard) navigator.clipboard.writeText(link).then(()=>toast("Share link copied ✓")).catch(()=>toast(link)); else toast(link); }
function toggleLike(id){ const d=db(); if(!d.session) return continueWith("email"); d.likes[id]=d.likes[id]||[]; const i=d.likes[id].indexOf(d.session); if(i>=0)d.likes[id].splice(i,1); else d.likes[id].push(d.session); commit(d); render(); }
function toggleFollow(uid){ const d=db(); if(!d.session) return continueWith("email"); d.follows[d.session]=d.follows[d.session]||[]; const i=d.follows[d.session].indexOf(uid); if(i>=0){d.follows[d.session].splice(i,1);toast("Unfollowed");}else{d.follows[d.session].push(uid);toast("You're now a fan ✓");} commit(d); render(); }
function logout(){ const d=db(); d.session=null; commit(d); go("discover"); }

// ---------- overlay ----------
function openOverlay(h){ $("overlayBody").innerHTML=`<div class="modal"><button class="modal-x" data-action="close">✕</button>${h}</div>`; $("overlay").hidden=false; }
function closeOverlay(){ $("overlay").hidden=true; $("overlayBody").innerHTML=""; }

// ---------- player ----------
let playing=false, hasSrc=false;
function showPlayer(title,artist,accent,src){
  $("miniplayer").classList.add("show"); $("mpArt").style.background=grad(accent); $("mpArt").textContent="◎";
  $("mpTitle").textContent=title; $("mpArtist").textContent=artist;
  if(src){ hasSrc=true; audio.src=src; audio.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false)); }
  else { hasSrc=false; setPlaying(true); }
}
function playTrack(id){ const t=allTracks().find(x=>x.id===id); if(!t) return; const u=userById(t.userId); const d=db(); d.plays[id]=(d.plays[id]||0)+1; commit(d);
  showPlayer(t.title, u.name, t.accent, t.src); if(!t.src) toast("This demo artist hasn't linked audio — counts & social still work!"); render(); }
function setPlaying(p){ playing=p; $("mpPlay").textContent=p?"⏸":"▶"; }
$("mpPlay").addEventListener("click",()=>{ if(!hasSrc) return; if(!audio.paused){audio.pause();setPlaying(false);}else{audio.play();setPlaying(true);} });
audio.addEventListener("timeupdate",()=>{ if(!audio.duration)return; $("mpFill").style.width=(audio.currentTime/audio.duration*100)+"%"; const s=Math.floor(audio.currentTime); $("mpTime").textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; });
$("mpProg").addEventListener("click",e=>{ if(!audio.duration)return; const r=e.currentTarget.getBoundingClientRect(); audio.currentTime=(e.clientX-r.left)/r.width*audio.duration; });

// ---------- click delegation ----------
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-action]"); if(!el) return; const a=el.dataset.action;
  const M={
    nav:()=>go(el.dataset.view), profile:()=>go("profile",{profileId:el.dataset.uid}),
    auth:()=>continueWith(el.dataset.p), authemail:()=>{ const v=($("liEmail").value||"").trim().toLowerCase(); if(!v||!v.includes("@")) return toast("Enter a valid email"); continueWith(v); },
    finishonboard:()=>finishOnboard(el.dataset.k),
    sharefolder:shareMusicFolder, setthumbs:()=>setThumbsFolder(el.dataset.pl), relink:()=>relinkFolder(el.dataset.pl),
    playfile:()=>playFolderTrack(el.dataset.pl, el.dataset.file),
    upload:openUpload, dopublish:doPublish, customize:openCustomize, savecustom:saveCustom,
    invite:openInvite, copyinvite:()=>{ const i=$("invLink"); i.select(); if(navigator.clipboard)navigator.clipboard.writeText(i.value); toast("Invite link copied ✓"); },
    play:()=>playTrack(el.dataset.id), open:()=>openTrack(el.dataset.id), like:()=>toggleLike(el.dataset.id),
    follow:()=>toggleFollow(el.dataset.uid), share:()=>share(el.dataset.id), docomment:()=>doComment(el.dataset.id),
    logout:logout, close:closeOverlay,
    publish:()=>setVisibility(el.dataset.id,"public"), unpublish:()=>setVisibility(el.dataset.id,"private"), toggleshare:()=>toggleShare(el.dataset.id),
    swatch:()=>{window._upColor=el.dataset.c;document.querySelectorAll("#swatches .swatch").forEach(s=>s.classList.toggle("sel",s===el));},
    vis:()=>{window._upVis=el.dataset.v;document.querySelectorAll("#visRow .radio-card").forEach(c=>c.classList.toggle("sel",c===el));},
    bgcolor:()=>{window._bgColor=el.dataset.c;const bi=$("bgImg");if(bi)bi.value="";document.querySelectorAll("#bgSw .swatch").forEach(s=>s.classList.toggle("sel",s===el));}
  };
  if(M[a]) M[a]();
});
$("overlay").addEventListener("click",e=>{ if(e.target.id==="overlay") closeOverlay(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeOverlay(); });

render();
