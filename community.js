// ============================================================
//  OK Music — AI music social network (prototype).
//  Runs on localStorage now (per-browser). Real Google/Apple/Email
//  sign-in + shared multi-user data come from Firebase Auth +
//  Firestore + Storage later. The whole UI/flow is built here.
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
const LS = "okcommunity2";
function load(){ try{ return JSON.parse(localStorage.getItem(LS))||{}; }catch{ return {}; } }
function db(){
  const d=load();
  d.accounts=d.accounts||{}; d.usersById=d.usersById||{}; d.tracks=d.tracks||[];
  d.session=d.session||null; d.follows=d.follows||{}; d.likes=d.likes||{};
  d.plays=d.plays||{}; d.comments=d.comments||{};
  return d;
}
function commit(d){ localStorage.setItem(LS,JSON.stringify(d)); }

// ---------- helpers ----------
function allUsers(){ return SEED_USERS.concat(Object.values(db().usersById)); }
function userById(id){ return allUsers().find(u=>u.id===id); }
function seedAt(t){ return Date.now()-(t.ageHrs||0)*3600000; }
function allTracks(){
  const seeds=SEED_TRACKS.map(t=>({ ...t, createdAt:seedAt(t), visibility:"public", share:true }));
  return db().tracks.map(t=>({ ...t })).concat(seeds);
}
function visibleTracks(){ const me=db().session; return allTracks().filter(t=>t.visibility!=="private"||t.userId===me); }
function tracksByUser(uid,ownerView){ return allTracks().filter(t=>t.userId===uid && (ownerView||t.visibility!=="private")).sort((a,b)=>b.createdAt-a.createdAt); }
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
let toastTimer; function toast(m){ const e=$("toast"); e.textContent=m; e.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>e.hidden=true,3000); }

// ---------- state ----------
let state={ view:"discover", profileId:null, query:"", _track:null };
function go(view,extra={}){ state={ ...state, view, ...extra }; render(); window.scrollTo(0,0); }
function render(){ currentUser()?renderApp():renderLanding(); }

// ============ LANDING (logged out) ============
function renderLanding(){
  $("miniplayer").classList.remove("show");
  $("root").innerHTML=`
  <div class="landing"><div class="landing-inner">
    <div class="landing-brand">
      <div class="logo">◎ OK Music</div>
      <h1>Where AI music finds its fans.</h1>
      <p>Share your AI creations, follow other creators, and build your own fanbase — all in one friendly place.</p>
    </div>
    <div class="auth-card">
      <h2>Welcome</h2>
      <div class="muted">Log in or create your account.</div>
      <button class="social-btn" data-action="oauth" data-p="google"><span class="ic" style="color:#EA4335">G</span> Continue with Google</button>
      <button class="social-btn" data-action="oauth" data-p="apple"><span class="ic"></span> Continue with Apple</button>
      <div class="divider-or">or</div>
      <input class="fb-field" id="liHandle" placeholder="Email or @handle" />
      <input class="fb-field" id="liPass" type="password" placeholder="Password" />
      <button class="btn primary block" data-action="dologin">Log in</button>
      <div style="text-align:center;margin:10px 0"><span class="link" data-action="forgot">Forgot password?</span></div>
      <div style="height:1px;background:var(--line);margin:14px 0"></div>
      <button class="btn green block" data-action="signup" data-p="email">Create new account</button>
    </div>
  </div></div>`;
}

// ============ SIGN UP (Facebook style) ============
function openSignup(provider){
  const social=provider==="google"||provider==="apple";
  openOverlay(`
    <h2>${social?`Sign up with ${provider[0].toUpperCase()+provider.slice(1)}`:"Create a new account"}</h2>
    <p class="sub">It's quick and easy.</p>
    <div class="fb-row">
      <input class="fb-field" id="suFirst" placeholder="First name" />
      <input class="fb-field" id="suLast" placeholder="Last name" />
    </div>
    <input class="fb-field" id="suEmail" placeholder="Email address" value="${social?`you@${provider}.com`:""}" />
    <input class="fb-field" id="suHandle" placeholder="Choose a @handle (username)" />
    ${social?"":`<input class="fb-field" id="suPass" type="password" placeholder="New password" />`}
    <div class="fb-row">
      <div style="flex:1"><div class="fb-label">Date of birth</div><input class="fb-field" id="suDob" type="date" /></div>
      <div style="flex:1"><div class="fb-label">Gender</div>
        <select class="fb-field" id="suGender"><option>Female</option><option>Male</option><option>Other</option></select></div>
    </div>
    <button class="btn green block" data-action="dosignup" data-p="${provider}">Sign Up</button>
    <p class="note">Prototype: accounts are stored only in this browser. With Firebase, "Continue with Google/Apple" and email sign-up become real and secure, shared across everyone. By signing up you agree to the community rules.</p>
  `);
}
function doSignup(provider){
  const first=($("suFirst").value||"").trim(), last=($("suLast").value||"").trim();
  const name=(first+" "+last).trim();
  const handle=($("suHandle").value||"").trim().replace(/^@/,"").toLowerCase();
  const pass=provider==="email"?($("suPass")?.value||""):"oauth";
  if(!name||!handle||(provider==="email"&&!pass)) return toast("Please fill in name, handle"+(provider==="email"?" and password":""));
  if(!/^[a-z0-9_]{2,}$/.test(handle)) return toast("Handle: letters, numbers, underscore only");
  if(SEED_USERS.some(u=>u.handle===handle)||db().accounts[handle]) return toast("That handle is taken");
  const d=db(); const id="u_"+Date.now();
  const user={ id, name, handle, password:pass, provider, bio:"New AI music creator 🎶", color:COLORS[Math.floor(Math.random()*COLORS.length)] };
  d.accounts[handle]=user; d.usersById[id]={ id, name, handle, bio:user.bio, color:user.color }; d.session=id;
  commit(d); closeOverlay(); toast("Welcome to OK Music! 🎉"); go("profile",{profileId:id});
}
function doLogin(){
  const h=($("liHandle").value||"").trim().replace(/^@/,"").toLowerCase(), p=$("liPass").value;
  const acc=db().accounts[h];
  if(!acc||(acc.provider==="email"&&acc.password!==p)) return toast("Wrong handle or password (or sign up first)");
  const d=db(); d.session=acc.id; commit(d); toast("Welcome back!"); go("discover");
}

// ============ APP SHELL ============
function renderApp(){
  const u=currentUser();
  const item=(view,ic,label)=>`<div class="side-item ${state.view===view?'active':''}" data-action="nav" data-view="${view}"><span class="ic">${ic}</span>${label}</div>`;
  $("root").innerHTML=`
    <div class="topbar">
      <div class="brand" data-action="nav" data-view="discover"><span class="l">◎</span><b>OK&nbsp;Music</b></div>
      <input class="search" id="search" placeholder="Search artists & tracks…" value="${esc(state.query)}" />
      <div class="me" data-action="profile" data-uid="${u.id}">
        <div class="avatar" style="${avatarStyle(u,34)}">${u.avatarImg?'':initials(u.name)}</div>
      </div>
    </div>
    <div class="shell">
      <nav class="sidebar">
        ${item("discover","🧭","Discover")}
        ${item("home","🏠","My Feed")}
        <div class="side-item" data-action="profile" data-uid="${u.id}"><span class="ic">😊</span>My Profile</div>
        ${item("mymusic","🎵","My Music")}
        <div class="side-sep"></div>
        <div class="side-item" data-action="upload"><span class="ic">⬆️</span>Share music</div>
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
  let list=visibleTracks().filter(t=>t.visibility==="public");
  if(state.view==="home"){ const f=db().follows[u.id]||[]; list=list.filter(t=>f.includes(t.userId)); }
  const q=state.query.trim().toLowerCase();
  if(q) list=list.filter(t=>t.title.toLowerCase().includes(q)||userById(t.userId)?.name.toLowerCase().includes(q));
  list.sort((a,b)=>b.createdAt-a.createdAt);
  const title=state.view==="home"?"My Feed":"Discover";
  const body=list.length?`<div class="grid">${list.map(t=>card(t)).join("")}</div>`
    :`<div class="empty">${state.view==="home"?"Follow some artists and their newest tracks land here.":"No tracks found."}</div>`;
  $("page").innerHTML=`<div class="h-title">${title}</div>${body}`;
}

function card(t,ownerView){
  const u=userById(t.userId);
  const priv=t.visibility==="private";
  const shareBtn=(!priv&&t.share)?`<button data-action="share" data-id="${t.id}">↗</button>`:"";
  return `<div class="card">
    <div class="card-art" style="background:${grad(t.accent)}" data-action="play" data-id="${t.id}">
      ${priv?'<span class="tag">🔒 Private</span>':''}◎
      <button class="card-play" data-action="play" data-id="${t.id}">▶</button>
    </div>
    <div class="card-body">
      <div class="card-title" data-action="open" data-id="${t.id}">${esc(t.title)}</div>
      <div class="card-artist" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div>
      <div class="card-meta">
        <button class="${hasLiked(t.id)?'on':''}" data-action="like" data-id="${t.id}">♥ ${nfmt(likeCount(t.id))}</button>
        <button data-action="open" data-id="${t.id}">💬 ${commentsOf(t.id).length}</button>
        ${shareBtn}
        <span class="spacer"></span>
        <span>▶ ${nfmt(playCount(t.id))}</span>
      </div>
    </div>
  </div>`;
}

// ---------- profile (with custom background) ----------
function renderProfile(uid){
  const u=userById(uid); if(!u){ $("page").innerHTML=`<div class="empty">Artist not found.</div>`; return; }
  const me=currentUser(); const mine=me&&me.id===uid;
  const tracks=tracksByUser(uid,mine);
  const cover=u.bgImg?`background-image:url('${u.bgImg}');background-size:cover;background-position:center`
            :u.bgColor?`background:${u.bgColor}`:"";
  let actions=mine
    ? `<button class="btn primary" data-action="upload">＋ Share music</button>
       <button class="btn" data-action="customize">🎨 Customize page</button>
       <button class="btn" data-action="invite">✉️ Invite</button>`
    : `<button class="btn ${isFollowing(uid)?'':'primary'}" data-action="follow" data-uid="${uid}">${isFollowing(uid)?'Following ✓':'Follow'}</button>
       <button class="btn" data-action="invite">✉️ Invite friends</button>`;
  $("page").innerHTML=`
    <div class="profile-cover" style="${cover}"></div>
    <div class="profile-head">
      <div class="profile-avatar" style="${avatarStyle(u,104)}">${u.avatarImg?'':initials(u.name)}</div>
      <div class="profile-info">
        <div class="profile-name">${esc(u.name)} ${u.founder?'<span class="badge-founder">FOUNDER</span>':''}</div>
        <div class="profile-handle">@${esc(u.handle)}</div>
      </div>
    </div>
    <div class="profile-stats">
      <div><b>${tracks.filter(t=>mine?true:t.visibility!=='private').length}</b> <span>tracks</span></div>
      <div><b>${nfmt(followerCount(uid))}</b> <span>fans</span></div>
      <div><b>${nfmt(followingCount(uid))}</b> <span>following</span></div>
    </div>
    <div class="profile-bio">${esc(u.bio||"")}</div>
    <div class="profile-actions" style="margin-top:14px">${actions}</div>
    <div class="divider"></div>
    <div class="section-title">Tracks</div>
    ${tracks.length?`<div class="grid">${tracks.map(t=>card(t,mine)).join("")}</div>`:`<div class="empty">No tracks yet.</div>`}
  `;
}

// ---------- my music (manage privacy & sharing) ----------
function renderMyMusic(){
  const u=currentUser(); const tracks=tracksByUser(u.id,true);
  const rows=tracks.map(t=>`
    <div class="mrow">
      <div class="mart" style="background:${grad(t.accent)}">◎</div>
      <div class="minfo">
        <div class="mt">${esc(t.title)}</div>
        <div class="ms">▶ ${nfmt(playCount(t.id))} · ♥ ${nfmt(likeCount(t.id))}
          <span class="pill ${t.visibility==='private'?'prv':'pub'}">${t.visibility==='private'?'Private':'Public'}</span>
          ${t.share&&t.visibility!=='private'?'<span class="pill pub">Sharing on</span>':''}
        </div>
      </div>
      ${t.visibility==='private'
        ? `<button class="btn sm primary" data-action="publish" data-id="${t.id}">Publish</button>`
        : `<button class="btn sm" data-action="unpublish" data-id="${t.id}">Make private</button>`}
      <button class="btn sm" data-action="toggleshare" data-id="${t.id}">${t.share?'Disable share':'Allow share'}</button>
    </div>`).join("");
  $("page").innerHTML=`
    <div class="h-title">My Music</div>
    <p class="note" style="margin-bottom:16px">Keep tracks <b>Private</b> while you work on them, then <b>Publish</b> when ready. Turn <b>sharing</b> on or off per track.</p>
    <button class="btn primary" data-action="upload" style="margin-bottom:18px">＋ Add a track</button>
    ${tracks.length?rows:'<div class="empty">You haven\'t added any tracks yet.</div>'}`;
}
function ownTrack(id){ const d=db(); return d.tracks.find(t=>t.id===id); }
function setVisibility(id,v){ const d=db(); const t=d.tracks.find(x=>x.id===id); if(t){ t.visibility=v; commit(d); toast(v==="public"?"Published 🎉":"Set to private"); renderMyMusic(); } }
function toggleShare(id){ const d=db(); const t=d.tracks.find(x=>x.id===id); if(t){ t.share=!t.share; commit(d); toast(t.share?"Sharing enabled":"Sharing disabled"); renderMyMusic(); } }

// ---------- upload (with privacy) ----------
function openUpload(){
  if(!currentUser()) return openSignup("email");
  openOverlay(`
    <h2>Share a track</h2><p class="sub">Publish now, or save it private until you're ready.</p>
    <div class="field"><label>Track title</label><input id="upTitle" placeholder="e.g. Midnight Bloom" /></div>
    <div class="field"><label>Cover color</label><div class="swatches" id="swatches">${COLORS.map((c,i)=>`<div class="swatch ${i===0?'sel':''}" style="background:${c}" data-action="swatch" data-c="${c}"></div>`).join("")}</div></div>
    <div class="field"><label>Audio link (MP3/M4A URL — optional in demo)</label><input id="upSrc" placeholder="https://…/song.mp3" /></div>
    <div class="field"><label>Visibility</label><div class="radio-row" id="visRow">
      <div class="radio-card sel" data-action="vis" data-v="public"><b>Public</b>Everyone can find & play it</div>
      <div class="radio-card" data-action="vis" data-v="private"><b>Private</b>Only you — until you publish</div>
    </div></div>
    <label class="check"><input type="checkbox" id="upShare" checked> Allow fans to share this track</label>
    <button class="btn primary block" data-action="dopublish">Add to my music</button>
    <p class="note">With Firebase Storage, creators upload audio files directly from their computer, server or cloud and it streams to everyone.</p>`);
  window._upColor=COLORS[0]; window._upVis="public";
}
function doPublish(){
  const title=($("upTitle").value||"").trim(); if(!title) return toast("Give your track a title");
  const d=db(); const id="t_"+Date.now();
  d.tracks.unshift({ id, userId:d.session, title, src:($("upSrc").value||"").trim(), accent:window._upColor||COLORS[0],
    visibility:window._upVis||"public", share:$("upShare").checked, createdAt:Date.now() });
  commit(d); closeOverlay(); toast(window._upVis==="private"?"Saved as private 🔒":"Published! 🎵"); go("mymusic");
}

// ---------- customize background ----------
function openCustomize(){
  const u=currentUser();
  openOverlay(`
    <h2>🎨 Customize your page</h2><p class="sub">Make your profile yours — pick a banner color or paste an image link.</p>
    <div class="field"><label>Banner color</label><div class="swatches" id="bgSw">${["#FFCBA0","#7c5cff","#36d1c4","#ff5c7c","#2bbf4e","#5c8bff","#33272f"].map(c=>`<div class="swatch ${u.bgColor===c?'sel':''}" style="background:${c}" data-action="bgcolor" data-c="${c}"></div>`).join("")}</div></div>
    <div class="field"><label>Or a background image link</label><input id="bgImg" placeholder="https://…/your-art.jpg" value="${esc(u.bgImg||"")}" /></div>
    <div class="field"><label>Bio</label><textarea id="bgBio" placeholder="Tell your fans about your music…">${esc(u.bio||"")}</textarea></div>
    <button class="btn primary block" data-action="savecustom">Save my page</button>`);
  window._bgColor=u.bgColor||"";
}
function saveCustom(){
  const d=db(); const u=d.usersById[d.session]; if(!u) return;
  u.bgColor=window._bgColor||""; u.bgImg=($("bgImg").value||"").trim(); u.bio=($("bgBio").value||"").trim()||u.bio;
  commit(d); closeOverlay(); toast("Your page is updated ✨"); go("profile",{profileId:d.session});
}

// ---------- invite ----------
function openInvite(){
  const u=currentUser(); const link=`${location.origin}${location.pathname}?ref=${u?u.handle:""}`;
  openOverlay(`
    <h2>✉️ Invite friends</h2><p class="sub">Share your link — friends who join can follow you and grow your fanbase.</p>
    <div class="invite-link"><input id="invLink" value="${esc(link)}" readonly /><button class="btn primary" data-action="copyinvite">Copy</button></div>
    <p class="note">With every friend who joins and follows you, your fanbase grows — and they can follow you back too.</p>`);
}

// ---------- track detail + comments + share ----------
function openTrack(id){
  const t=allTracks().find(x=>x.id===id); if(!t) return;
  const u=userById(t.userId); const cs=commentsOf(id);
  openOverlay(`
    <div class="mp-art" style="width:88px;height:88px;border-radius:14px;font-size:32px;background:${grad(t.accent)};margin-bottom:12px">◎</div>
    <h2>${esc(t.title)}</h2>
    <p class="sub" data-action="profile" data-uid="${u.id}" style="cursor:pointer">by ${esc(u.name)} · ▶ ${nfmt(playCount(id))} plays</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primary" data-action="play" data-id="${id}">▶ Play</button>
      <button class="btn ${hasLiked(id)?'on':''}" data-action="like" data-id="${id}">♥ ${nfmt(likeCount(id))}</button>
      ${(t.visibility!=="private"&&t.share)?`<button class="btn" data-action="share" data-id="${id}">↗ Share</button>`:`<button class="btn" disabled style="opacity:.5">Sharing off</button>`}
    </div>
    <div class="divider"></div>
    <div class="section-title">Comments (${cs.length})</div>
    <div class="field"><textarea id="cmtText" placeholder="Say something nice…"></textarea></div>
    <button class="btn" data-action="docomment" data-id="${id}">Post comment</button>
    <div style="margin-top:8px">${cs.length?cs.map(c=>`<div class="comment"><span class="who">${esc(c.name)}</span><span class="when">${timeAgo(c.time)}</span><div class="body">${esc(c.text)}</div></div>`).join(""):'<p class="note">No comments yet.</p>'}</div>`);
}
function doComment(id){
  const txt=($("cmtText").value||"").trim(); if(!txt) return toast("Write something first");
  const u=currentUser(); const d=db(); d.comments[id]=d.comments[id]||[]; d.comments[id].unshift({ name:u?u.name:"Guest", text:txt, time:Date.now() });
  commit(d); openTrack(id);
}
function share(id){
  const link=`${location.origin}${location.pathname}?track=${id}`;
  if(navigator.clipboard) navigator.clipboard.writeText(link).then(()=>toast("Share link copied ✓")).catch(()=>toast(link));
  else toast(link);
}

// ---------- social actions ----------
function toggleLike(id){ const d=db(); if(!d.session) return openSignup("email"); d.likes[id]=d.likes[id]||[]; const i=d.likes[id].indexOf(d.session); if(i>=0)d.likes[id].splice(i,1); else d.likes[id].push(d.session); commit(d); render(); }
function toggleFollow(uid){ const d=db(); if(!d.session) return openSignup("email"); d.follows[d.session]=d.follows[d.session]||[]; const i=d.follows[d.session].indexOf(uid); if(i>=0){d.follows[d.session].splice(i,1);toast("Unfollowed");} else {d.follows[d.session].push(uid);toast("You're now a fan ✓");} commit(d); render(); }
function logout(){ const d=db(); d.session=null; commit(d); go("discover"); }

// ---------- overlay ----------
function openOverlay(html){ $("overlayBody").innerHTML=`<div class="modal"><button class="modal-x" data-action="close">✕</button>${html}</div>`; $("overlay").hidden=false; }
function closeOverlay(){ $("overlay").hidden=true; $("overlayBody").innerHTML=""; }

// ---------- player ----------
let current=null,playing=false;
function playTrack(id){
  const t=allTracks().find(x=>x.id===id); if(!t) return; const u=userById(t.userId); current=t;
  const d=db(); d.plays[id]=(d.plays[id]||0)+1; commit(d);
  $("miniplayer").classList.add("show"); $("mpArt").style.background=grad(t.accent);
  $("mpTitle").textContent=t.title; $("mpArtist").textContent=u.name;
  if(t.src){ audio.src=t.src; audio.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false)); }
  else { setPlaying(true); toast("This demo artist hasn't linked audio yet — counts & social still work!"); }
  if(!$("overlay").hidden) {} else render();
}
function setPlaying(p){ playing=p; $("mpPlay").textContent=p?"⏸":"▶"; }
$("mpPlay").addEventListener("click",()=>{ if(!current)return; if(audio.src&&!audio.paused){audio.pause();setPlaying(false);} else if(audio.src){audio.play();setPlaying(true);} else setPlaying(!playing); });
audio.addEventListener("timeupdate",()=>{ if(!audio.duration)return; $("mpFill").style.width=(audio.currentTime/audio.duration*100)+"%"; const s=Math.floor(audio.currentTime); $("mpTime").textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; });
$("mpProg").addEventListener("click",e=>{ if(!audio.duration)return; const r=e.currentTarget.getBoundingClientRect(); audio.currentTime=(e.clientX-r.left)/r.width*audio.duration; });

// ---------- click delegation ----------
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-action]"); if(!el) return; const a=el.dataset.action;
  const map={
    nav:()=>go(el.dataset.view), profile:()=>go("profile",{profileId:el.dataset.uid}),
    login:()=>renderLanding(), dologin:doLogin, forgot:()=>toast("Password reset comes with Firebase 🙂"),
    signup:()=>openSignup(el.dataset.p||"email"), oauth:()=>openSignup(el.dataset.p), dosignup:()=>doSignup(el.dataset.p),
    upload:openUpload, dopublish:doPublish, customize:openCustomize, savecustom:saveCustom,
    invite:openInvite, copyinvite:()=>{ const i=$("invLink"); i.select(); if(navigator.clipboard)navigator.clipboard.writeText(i.value); toast("Invite link copied ✓"); },
    play:()=>playTrack(el.dataset.id), open:()=>{state._track=el.dataset.id;openTrack(el.dataset.id);},
    like:()=>toggleLike(el.dataset.id), follow:()=>toggleFollow(el.dataset.uid), share:()=>share(el.dataset.id),
    docomment:()=>doComment(el.dataset.id), logout:logout, close:closeOverlay,
    publish:()=>setVisibility(el.dataset.id,"public"), unpublish:()=>setVisibility(el.dataset.id,"private"), toggleshare:()=>toggleShare(el.dataset.id),
    swatch:()=>{window._upColor=el.dataset.c;document.querySelectorAll("#swatches .swatch").forEach(s=>s.classList.toggle("sel",s===el));},
    vis:()=>{window._upVis=el.dataset.v;document.querySelectorAll("#visRow .radio-card").forEach(c=>c.classList.toggle("sel",c===el));},
    bgcolor:()=>{window._bgColor=el.dataset.c;$("bgImg").value="";document.querySelectorAll("#bgSw .swatch").forEach(s=>s.classList.toggle("sel",s===el));}
  };
  if(map[a]) map[a]();
});
$("overlay").addEventListener("click",e=>{ if(e.target.id==="overlay") closeOverlay(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeOverlay(); });

render();
