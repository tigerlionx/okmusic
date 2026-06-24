// ============================================================
//  OK Music — community platform prototype.
//  Multi-user feel runs on localStorage now (per-browser).
//  Swap the DB layer for Firebase Auth + Firestore + Storage
//  to make accounts, uploads and the social graph real & shared.
// ============================================================

const $ = (id) => document.getElementById(id);
const audio = $("audio");

// ---- demo baseline stats so the community feels alive (prototype only) ----
const SEED_STATS = {
  t_afghan:{plays:412,likes:58}, t_persian:{plays:233,likes:31}, t_gray:{plays:188,likes:24}, t_spring:{plays:97,likes:12},
  t_nova1:{plays:1203,likes:210}, t_nova2:{plays:540,likes:77}, t_lumen1:{plays:860,likes:140}, t_lumen2:{plays:320,likes:41},
  t_kira1:{plays:1500,likes:260}, t_kira2:{plays:610,likes:95}
};
const SEED_FOLLOWERS = { u_okmusic:128, u_nova:4200, u_lumen:2100, u_kira:8800 };

// ---------- DB (localStorage) ----------
const LS = "okcommunity";
function load(){ try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } }
function db(){
  const d = load();
  d.accounts = d.accounts || {};   // handle -> {id,name,handle,password,bio,color}
  d.usersById = d.usersById || {};
  d.tracks = d.tracks || [];
  d.session = d.session || null;
  d.follows = d.follows || {};     // followerId -> [followedIds]
  d.likes = d.likes || {};         // trackId -> [userIds]
  d.plays = d.plays || {};
  d.comments = d.comments || {};
  return d;
}
function commit(d){ localStorage.setItem(LS, JSON.stringify(d)); }

// ---------- data helpers ----------
function allUsers(){ return SEED_USERS.concat(Object.values(db().usersById)); }
function userById(id){ return allUsers().find(u => u.id === id); }
function seedAt(t){ return Date.now() - (t.ageHrs||0)*3600000; }
function allTracks(){
  const seeds = SEED_TRACKS.map(t => ({ ...t, createdAt: seedAt(t) }));
  const up = db().tracks.map(t => ({ ...t }));
  return up.concat(seeds);
}
function tracksByUser(uid){ return allTracks().filter(t => t.userId === uid).sort((a,b)=>b.createdAt-a.createdAt); }
function currentUser(){ const d = db(); return d.session ? userById(d.session) : null; }

function followerCount(uid){
  const d = db(); let n = SEED_FOLLOWERS[uid] || 0;
  for (const f in d.follows) if (d.follows[f].includes(uid)) n++;
  return n;
}
function followingCount(uid){ return (db().follows[uid]||[]).length; }
function isFollowing(uid){ const d = db(); return d.session && (d.follows[d.session]||[]).includes(uid); }
function likeCount(tid){ return (SEED_STATS[tid]?.likes || 0) + (db().likes[tid]||[]).length; }
function hasLiked(tid){ const d = db(); return d.session && (d.likes[tid]||[]).includes(d.session); }
function playCount(tid){ return (SEED_STATS[tid]?.plays || 0) + (db().plays[tid]||0); }
function commentsOf(tid){ return db().comments[tid] || []; }

// ---------- util ----------
function esc(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function nfmt(n){ return n >= 1000 ? (n/1000).toFixed(n%1000>=100?1:0)+"k" : ""+n; }
function timeAgo(t){
  const s = Math.floor((Date.now()-t)/1000);
  if (s<60) return "just now"; const m=Math.floor(s/60); if(m<60) return m+"m";
  const h=Math.floor(m/60); if(h<24) return h+"h"; return Math.floor(h/24)+"d";
}
function initials(name){ return name.split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase(); }
function artGrad(accent){ return `linear-gradient(135deg, ${accent}, #15131f)`; }

let toastTimer;
function toast(msg){ const el=$("toast"); el.textContent=msg; el.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.hidden=true,3000); }

// ---------- state + router ----------
let state = { view:"feed", tab:"discover", profileId:null, query:"" };
function go(view, extra={}){ state = { ...state, view, ...extra }; render(); window.scrollTo(0,0); }

function render(){ renderNavAuth(); renderView(); }

function renderNavAuth(){
  const u = currentUser();
  const box = $("navAuth");
  if (u){
    box.innerHTML = `<div class="nav-me" data-action="profile" data-uid="${u.id}">
      <div class="avatar" style="background:${u.color}">${initials(u.name)}</div>
      <span style="font-weight:600;font-size:14px">${esc(u.name.split(" ")[0])}</span></div>`;
  } else {
    box.innerHTML = `<button class="nav-btn" data-action="login">Log in</button>`;
  }
}

function renderView(){
  if (state.view === "profile") return renderProfile(state.profileId);
  renderFeed();
}

// ---------- feed ----------
function renderFeed(){
  const u = currentUser();
  let list;
  if (state.tab === "following" && u){
    const f = db().follows[u.id] || [];
    list = allTracks().filter(t => f.includes(t.userId));
  } else {
    list = allTracks();
  }
  const q = state.query.trim().toLowerCase();
  if (q){
    list = list.filter(t => t.title.toLowerCase().includes(q) || (userById(t.userId)?.name.toLowerCase().includes(q)));
  }
  list.sort((a,b)=>b.createdAt-a.createdAt);

  const tabs = `<div class="tabs">
    <button class="tab ${state.tab==='discover'?'active':''}" data-action="tab" data-tab="discover">Discover</button>
    ${u ? `<button class="tab ${state.tab==='following'?'active':''}" data-action="tab" data-tab="following">Following</button>` : ``}
  </div>`;

  const body = list.length
    ? `<div class="grid">${list.map(card).join("")}</div>`
    : `<div class="empty">${state.tab==='following' ? "You're not following anyone yet — open an artist and tap Follow." : "No tracks found."}</div>`;

  $("view").innerHTML = tabs + body;
}

function card(t){
  const u = userById(t.userId);
  return `<div class="card">
    <div class="card-art" style="background:${artGrad(t.accent)}" data-action="play" data-id="${t.id}">
      ◎
      <button class="card-play" data-action="play" data-id="${t.id}">▶</button>
    </div>
    <div class="card-body">
      <div class="card-title" data-action="open" data-id="${t.id}">${esc(t.title)}</div>
      <div class="card-artist" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div>
      <div class="card-meta">
        <button class="${hasLiked(t.id)?'on':''}" data-action="like" data-id="${t.id}">♥ ${nfmt(likeCount(t.id))}</button>
        <button data-action="open" data-id="${t.id}">💬 ${commentsOf(t.id).length}</button>
        <span class="spacer"></span>
        <span>▶ ${nfmt(playCount(t.id))}</span>
      </div>
    </div>
  </div>`;
}

// ---------- profile ----------
function renderProfile(uid){
  const u = userById(uid);
  if (!u){ $("view").innerHTML = `<div class="empty">Artist not found.</div>`; return; }
  const me = currentUser();
  const mine = me && me.id === uid;
  const tracks = tracksByUser(uid);

  let actions = "";
  if (mine){
    actions = `<button class="btn primary" data-action="upload">＋ Share music</button>
               <button class="btn" data-action="logout" style="margin-left:8px">Log out</button>`;
  } else {
    actions = `<button class="btn ${isFollowing(uid)?'':'primary'}" data-action="follow" data-uid="${uid}">
                 ${isFollowing(uid)?'Following ✓':'Follow'}</button>`;
  }

  $("view").innerHTML = `
    <div class="profile-head">
      <div class="profile-avatar" style="background:${u.color}">${initials(u.name)}</div>
      <div class="profile-info">
        <div class="profile-name">${esc(u.name)} ${u.founder?'<span class="badge-founder">FOUNDER</span>':''}</div>
        <div class="profile-handle">@${esc(u.handle)}</div>
        <div class="profile-bio">${esc(u.bio||"")}</div>
        <div class="profile-stats">
          <div><b>${tracks.length}</b> <span>tracks</span></div>
          <div><b>${nfmt(followerCount(uid))}</b> <span>followers</span></div>
          <div><b>${nfmt(followingCount(uid))}</b> <span>following</span></div>
        </div>
      </div>
      <div>${actions}</div>
    </div>
    <div class="divider"></div>
    <div class="section-title">Tracks</div>
    ${tracks.length ? `<div class="grid">${tracks.map(card).join("")}</div>` : `<div class="empty">No tracks yet.</div>`}
  `;
}

// ---------- overlay (modals) ----------
function openOverlay(html){ $("overlayBody").innerHTML = `<div class="modal"><button class="modal-x" data-action="close">✕</button>${html}</div>`; $("overlay").hidden = false; }
function closeOverlay(){ $("overlay").hidden = true; $("overlayBody").innerHTML = ""; }

function openAuth(msg){
  openOverlay(`
    <div class="modal-tabs">
      <button class="modal-tab active" id="tabSignup" data-action="authtab" data-t="signup">Sign up</button>
      <button class="modal-tab" id="tabLogin" data-action="authtab" data-t="login">Log in</button>
    </div>
    ${msg?`<p class="sub">${esc(msg)}</p>`:''}
    <div id="authForm"></div>`);
  renderAuthForm("signup");
}
function renderAuthForm(mode){
  $("tabSignup").classList.toggle("active", mode==="signup");
  $("tabLogin").classList.toggle("active", mode==="login");
  if (mode==="signup"){
    $("authForm").innerHTML = `
      <div class="field"><label>Artist / display name</label><input id="suName" placeholder="e.g. Nova Synth" /></div>
      <div class="field"><label>Handle (your @username)</label><input id="suHandle" placeholder="novasynth" /></div>
      <div class="field"><label>Password</label><input id="suPass" type="password" placeholder="choose a password" /></div>
      <button class="btn primary" data-action="dosignup">Create account & join</button>
      <p class="note">Prototype accounts are stored only in this browser. With Firebase, this becomes real, secure sign-up shared across everyone.</p>`;
  } else {
    $("authForm").innerHTML = `
      <div class="field"><label>Handle</label><input id="liHandle" placeholder="your @username" /></div>
      <div class="field"><label>Password</label><input id="liPass" type="password" /></div>
      <button class="btn primary" data-action="dologin">Log in</button>`;
  }
}
function doSignup(){
  const name=$("suName").value.trim(), handle=$("suHandle").value.trim().replace(/^@/,'').toLowerCase(), pass=$("suPass").value;
  if(!name||!handle||!pass) return toast("Fill in all fields");
  if(SEED_USERS.some(u=>u.handle===handle) || db().accounts[handle]) return toast("That handle is taken");
  const d=db(); const id="u_"+Date.now();
  const colors=["#7c5cff","#36d1c4","#ffb347","#ff5c7c","#5c8bff","#ff7ac6"];
  const user={ id, name, handle, password:pass, bio:"New AI music creator 🎶", color:colors[Math.floor(Math.random()*colors.length)] };
  d.accounts[handle]=user; d.usersById[id]={ id, name, handle, bio:user.bio, color:user.color }; d.session=id;
  commit(d); closeOverlay(); toast("Welcome to OK Music! 🎉"); go("profile",{profileId:id});
}
function doLogin(){
  const handle=$("liHandle").value.trim().replace(/^@/,'').toLowerCase(), pass=$("liPass").value;
  const acc=db().accounts[handle];
  if(!acc || acc.password!==pass) return toast("Wrong handle or password");
  const d=db(); d.session=acc.id; commit(d); closeOverlay(); toast("Welcome back!"); go("profile",{profileId:acc.id});
}

function openUpload(){
  if(!currentUser()) return openAuth("Create an account to share your music.");
  const colors=["#7c5cff","#36d1c4","#ffb347","#ff5c7c","#5c8bff","#ff7ac6"];
  openOverlay(`
    <h2>Share a track</h2>
    <p class="sub">Publish your AI creation to the community.</p>
    <div class="field"><label>Track title</label><input id="upTitle" placeholder="e.g. Midnight Bloom" /></div>
    <div class="field"><label>Cover color</label>
      <div class="swatches" id="swatches">${colors.map((c,i)=>`<div class="swatch ${i===0?'sel':''}" style="background:${c}" data-action="swatch" data-c="${c}"></div>`).join("")}</div>
    </div>
    <div class="field"><label>Audio link (MP3/M4A URL — optional in this demo)</label><input id="upSrc" placeholder="https://…/song.mp3" /></div>
    <button class="btn primary" data-action="dopublish">Publish to community</button>
    <p class="note">In the demo you paste an audio link. With Firebase Storage, creators upload audio files directly from their computer, server, or cloud — and it streams to everyone.</p>`);
  window._upColor = colors[0];
}
function doPublish(){
  const title=$("upTitle").value.trim(); if(!title) return toast("Give your track a title");
  const d=db(); const id="t_"+Date.now();
  d.tracks.unshift({ id, userId:d.session, title, src:$("upSrc").value.trim(), accent:window._upColor||"#7c5cff", createdAt:Date.now() });
  commit(d); closeOverlay(); toast("Published! 🎵"); go("profile",{profileId:d.session});
}

function openTrack(tid){
  const t = allTracks().find(x=>x.id===tid); if(!t) return;
  const u = userById(t.userId);
  const cs = commentsOf(tid);
  openOverlay(`
    <div class="mp-art" style="width:90px;height:90px;border-radius:14px;font-size:34px;background:${artGrad(t.accent)};margin-bottom:14px">◎</div>
    <h2>${esc(t.title)}</h2>
    <p class="sub" data-action="profile" data-uid="${u.id}" style="cursor:pointer">by ${esc(u.name)} · ▶ ${nfmt(playCount(tid))} plays</p>
    <div style="display:flex;gap:10px">
      <button class="btn primary" data-action="play" data-id="${tid}">▶ Play</button>
      <button class="btn ${hasLiked(tid)?'':''}" data-action="like" data-id="${tid}">♥ ${nfmt(likeCount(tid))}</button>
    </div>
    <div class="divider"></div>
    <div class="section-title">Comments (${cs.length})</div>
    <div class="field"><textarea id="cmtText" placeholder="Say something nice…"></textarea></div>
    <button class="btn" data-action="docomment" data-id="${tid}">Post comment</button>
    <div id="cmtList" style="margin-top:8px">
      ${cs.length?cs.map(c=>`<div class="comment"><span class="who">${esc(c.name)}</span><span class="when">${timeAgo(c.time)}</span><div class="body">${esc(c.text)}</div></div>`).join(""):'<p class="note">No comments yet.</p>'}
    </div>`);
}
function doComment(tid){
  const txt=$("cmtText").value.trim(); if(!txt) return toast("Write something first");
  const u=currentUser(); const d=db();
  d.comments[tid]=d.comments[tid]||[]; d.comments[tid].unshift({ name:u?u.name:"Guest", text:txt, time:Date.now() });
  commit(d); openTrack(tid); render();
}

// ---------- actions ----------
function toggleLike(tid){
  const d=db(); if(!d.session) return openAuth("Log in to like tracks.");
  d.likes[tid]=d.likes[tid]||[]; const i=d.likes[tid].indexOf(d.session);
  if(i>=0) d.likes[tid].splice(i,1); else d.likes[tid].push(d.session);
  commit(d); render(); if(!$("overlay").hidden && state._openTrack) openTrack(state._openTrack);
}
function toggleFollow(uid){
  const d=db(); if(!d.session) return openAuth("Create an account to follow artists and build your feed.");
  d.follows[d.session]=d.follows[d.session]||[]; const i=d.follows[d.session].indexOf(uid);
  if(i>=0){ d.follows[d.session].splice(i,1); toast("Unfollowed"); }
  else { d.follows[d.session].push(uid); toast("Following — their tracks are in your feed now ✓"); }
  commit(d); render();
}
function logout(){ const d=db(); d.session=null; commit(d); toast("Logged out"); go("feed",{tab:"discover"}); }

// ---------- player ----------
let current=null, playing=false;
function playTrack(tid){
  const t=allTracks().find(x=>x.id===tid); if(!t) return;
  const u=userById(t.userId);
  current=t;
  // count a play
  const d=db(); d.plays[tid]=(d.plays[tid]||0)+1; commit(d);
  $("miniplayer").classList.add("show");
  $("mpArt").style.background=artGrad(t.accent);
  $("mpTitle").textContent=t.title; $("mpArtist").textContent=u.name;
  document.documentElement.style.setProperty("--accent", t.accent);
  if(t.src){ audio.src=t.src; audio.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false)); }
  else { setPlaying(true); toast("This demo artist hasn't linked audio yet — but the play counts & social all work!"); }
  render();
}
function setPlaying(p){ playing=p; $("mpPlay").textContent=p?"⏸":"▶"; }
$("mpPlay").addEventListener("click",()=>{
  if(!current) return;
  if(audio.src && !audio.paused){ audio.pause(); setPlaying(false); }
  else if(audio.src){ audio.play(); setPlaying(true); }
  else setPlaying(!playing);
});
audio.addEventListener("timeupdate",()=>{
  if(!audio.duration) return;
  $("mpFill").style.width=(audio.currentTime/audio.duration*100)+"%";
  const s=Math.floor(audio.currentTime); $("mpTime").textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
});
$("mpProg").addEventListener("click",e=>{ if(!audio.duration) return; const r=e.currentTarget.getBoundingClientRect(); audio.currentTime=(e.clientX-r.left)/r.width*audio.duration; });

// ---------- search ----------
$("search").addEventListener("input",e=>{ state.query=e.target.value; if(state.view!=="feed") state.view="feed"; renderFeed(); });

// ---------- global click delegation ----------
document.addEventListener("click",e=>{
  const el=e.target.closest("[data-action]"); if(!el) return;
  const a=el.dataset.action;
  if(a==="home") go("feed",{tab:"discover",query:""});
  else if(a==="upload") openUpload();
  else if(a==="login") openAuth();
  else if(a==="close") closeOverlay();
  else if(a==="profile") go("profile",{profileId:el.dataset.uid});
  else if(a==="tab") { state.tab=el.dataset.tab; renderFeed(); }
  else if(a==="play") playTrack(el.dataset.id);
  else if(a==="open") { state._openTrack=el.dataset.id; openTrack(el.dataset.id); }
  else if(a==="like") toggleLike(el.dataset.id);
  else if(a==="follow") toggleFollow(el.dataset.uid);
  else if(a==="logout") logout();
  else if(a==="authtab") renderAuthForm(el.dataset.t);
  else if(a==="dosignup") doSignup();
  else if(a==="dologin") doLogin();
  else if(a==="swatch"){ window._upColor=el.dataset.c; document.querySelectorAll("#swatches .swatch").forEach(s=>s.classList.toggle("sel",s===el)); }
  else if(a==="dopublish") doPublish();
  else if(a==="docomment") doComment(el.dataset.id);
});
$("overlay").addEventListener("click",e=>{ if(e.target.id==="overlay") closeOverlay(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeOverlay(); });

// ---------- go ----------
render();
