// ============================================================
//  community-calls.js — Private messenger + WebRTC call system
//  Loaded after community-marketplace.js.
// ============================================================

// ============ PRIVATE MESSENGER ============
async function getICE(){
  try{
    const r=await fetch("https://ok-music.metered.live/api/v1/turn/credentials?apiKey=6a4f497eafeedfd890d5183d");
    if(r.ok){const servers=await r.json();if(Array.isArray(servers)&&servers.length)return servers;}
  }catch(e){}
  // Fallback to Google STUN if Metered is unreachable
  return[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}];
}
let activePc=null,activeStream=null,activeCallId=null,callUnsub=null,callInterval=null,muted=false,_iceTimeout=null;
let _vizAnimId=null,_vizCtx=null,_localAn=null,_remoteAn=null,_localData=null,_remoteData=null,_testMicStream=null;
// Conference call state
let _confCallId=null,_confPeers={},_confAudios={},_confSignalUnsub=null,_confCallUnsub=null;
let _confHandRaised=false,_confParticipants={},_confProcessed={},_confStreams={};
// Floating panel drag state
let _cpDragging=false,_cpDragOffX=0,_cpDragOffY=0;
// Video call state
let _cameraOff=true;
function _makeAn(stream){
  const src=_vizCtx.createMediaStreamSource(stream);
  const an=_vizCtx.createAnalyser();
  an.fftSize=64;an.smoothingTimeConstant=0.8;
  src.connect(an);
  return an;
}

function _drawBars(id,an,data){
  const wrap=$(id);if(!wrap||!an)return;
  an.getByteFrequencyData(data);
  const bars=wrap.querySelectorAll(".vv-bar");
  const n=bars.length;const sl=Math.max(1,Math.floor(data.length*0.55/n));
  bars.forEach((b,i)=>{
    const v=data[Math.min(i*sl+1,data.length-1)]||0;
    b.style.height=Math.max(3,Math.round((v/255)*42))+"px";
    b.classList.toggle("lit",v>8);
  });
}

function startVoiceViz(localStream){
  stopVoiceViz();
  try{
    _vizCtx=new(window.AudioContext||window.webkitAudioContext)();
    _vizCtx.resume();
    _localAn=_makeAn(localStream);
    _localData=new Uint8Array(_localAn.frequencyBinCount);
    function tick(){
      _vizAnimId=requestAnimationFrame(tick);
      _drawBars("localBars",_localAn,_localData);
      if(_remoteAn&&_remoteData)_drawBars("remoteBars",_remoteAn,_remoteData);
    }
    tick();
  }catch(e){}
}

function addRemoteViz(stream){
  if(!_vizCtx||!stream)return;
  try{_remoteAn=_makeAn(stream);_remoteData=new Uint8Array(_remoteAn.frequencyBinCount);}catch(e){}
}

function stopVoiceViz(){
  if(_vizAnimId){cancelAnimationFrame(_vizAnimId);_vizAnimId=null;}
  if(_vizCtx){_vizCtx.close().catch(()=>{});_vizCtx=null;}
  _localAn=null;_remoteAn=null;_localData=null;_remoteData=null;
  if(_testMicStream){_testMicStream.getTracks().forEach(t=>t.stop());_testMicStream=null;}
}

async function testMic(){
  if(_testMicStream)return;
  const btn=$("micTestBtn");if(btn)btn.style.display="none";
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    _testMicStream=stream;
    startVoiceViz(stream);
  }catch(e){
    toast(e.name==="NotAllowedError"?"Microphone blocked — allow access in your browser settings.":"Mic error: "+(e.message||e));
    const btn2=$("micTestBtn");if(btn2)btn2.style.display="flex";
  }
}

// ---- Sound feedback (Web Audio API — no external files needed) ----
let _ringCtx=null,_ringOscs=[];
function playRing(){
  stopRing();
  _ringOscs=[];
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
        _ringOscs.push(o);
      });
    }
    if(navigator.vibrate) navigator.vibrate([2000,4000,2000,4000,2000,4000,2000,4000,2000,4000]);
  }catch(e){}
}
function stopRing(){
  // Stop each oscillator immediately — close() alone is async and too slow on Safari/iOS
  _ringOscs.forEach(o=>{try{o.stop(0);}catch(e){}});
  _ringOscs=[];
  if(_ringCtx){
    try{_ringCtx.suspend();}catch(e){} // hardware-level mute, instant
    try{_ringCtx.close();}catch(e){}
    _ringCtx=null;
  }
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
let msgUnsub=null,convUnsub=null,_pendingFile=null,_pendingPreviewUrl=null;
function convId(a,b){return[a,b].sort().join("_");}

function msgUnreadTotal(){
  return Object.values(CACHE.convos||{}).reduce((s,c)=>s+((c.unread||{})[ME?.id]||0),0);
}

// ---- conversation list ----
function renderMessages(){
  if(convUnsub){convUnsub();convUnsub=null;}
  $("page").innerHTML=`<div class="msgs-v2-wrap">
    <div class="msgs-v2-layout">
      <div class="msgs-v2-list-panel">
        <div class="msgs-v2-list-hd">💬 Messages</div>
        <div class="msgs-v2-list-body" id="convList"><div class="empty" style="padding:20px 16px">Loading…</div></div>
      </div>
      <div class="msgs-v2-convo-panel">
        <div class="msgs-v2-convo-placeholder">
          <div>
            <div style="font-size:40px;margin-bottom:12px">💬</div>
            <div style="font-weight:700;margin-bottom:6px">Select a conversation</div>
            <div>Choose a thread from the left to start chatting</div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
  convUnsub=fbDB.collection("messages").where("participants","array-contains",ME.id)
    .onSnapshot(snap=>{
      CACHE.convos={};
      snap.docs.forEach(d=>{CACHE.convos[d.id]={id:d.id,...d.data()};});
      const el=$("convList");if(!el)return;
      const convs=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.lastTime||0)-(a.lastTime||0));
      if(!convs.length){el.innerHTML='<div class="msgs-v2-conv-row" style="cursor:default"><div class="msgs-v2-conv-info"><div class="msgs-v2-conv-name" style="font-weight:400;color:var(--muted)">No messages yet — open any profile and tap 💬 Message to start a chat.</div></div></div>';return;}
      el.innerHTML=convs.map(c=>{
        const otherId=c.participants.find(p=>p!==ME.id);
        const other=userById(otherId)||{name:"Unknown",color:"#ccc"};
        const unread=(c.unread||{})[ME.id]||0;
        return`<div class="msgs-v2-conv-row" data-action="openchat" data-uid="${otherId}">
          <div class="avatar" style="${avatarStyle(other,40)}">${other.avatarImg?'':initials(other.name)}</div>
          <div class="msgs-v2-conv-info">
            <div class="msgs-v2-conv-name">${esc(other.name)}${unread?`<span class="msgs-v2-conv-badge">${unread}</span>`:''}</div>
            <div class="msgs-v2-conv-preview">${esc((c.lastMsg||'').slice(0,60))}</div>
          </div>
          <div class="msgs-v2-conv-time">${c.lastTime?timeAgo(c.lastTime):''}</div>
        </div>`;
      }).join('');
    },e=>console.warn("convs",e));
}

// ---- open a chat thread ----
function clearPendingFile(){
  if(_pendingPreviewUrl){URL.revokeObjectURL(_pendingPreviewUrl);_pendingPreviewUrl=null;}
  _pendingFile=null;
  const p=$("chatFilePreview");if(p){p.innerHTML="";p.style.display="none";}
}

function renderMsgContent(m,msgId,cid,otherUid){
  const edited=m.edited?'<span class="msg-edited"> · edited</span>':'';
  if(!m.fileUrl){
    let displayText=m.text||'';
    if(m.encrypted){
      const cacheKey=(cid||'')+'|'+(msgId||'');
      displayText=_msgDecryptCache.has(cacheKey)
        ?_msgDecryptCache.get(cacheKey)
        :'🔒 Decrypting…';
    }
    const{html:mH,firstUrl:mU}=linkifyText(displayText);
    return`<div class="msg-text">${mH}${edited}</div>${lpTag(mU)}`;
  }
  // 3-day expiry check
  if(m.fileExpiry&&Date.now()>m.fileExpiry){
    const{html:cH}=m.text?linkifyText(m.text):{html:''};
    const caption=m.text?`<div class="msg-caption">${cH}${edited}</div>`:"";
    return`<div class="msg-media"><div class="msg-file-expired">⏳ File expired — no longer available</div>${caption}</div>`;
  }
  let fileEl;
  if(m.fileType&&m.fileType.startsWith("image/")){
    fileEl=`<a href="${m.fileUrl}" target="_blank" rel="noopener"><img class="msg-img" src="${m.fileUrl}" loading="lazy" onerror="this.closest('.msg-media').innerHTML='<div class=\\'msg-file-expired\\'>⚠️ Image could not be loaded</div>'"/></a>`;
  } else if(m.fileType&&m.fileType.startsWith("audio/")){
    fileEl=`<audio class="msg-audio" src="${m.fileUrl}" controls preload="none"></audio>`;
  } else if(m.fileType&&m.fileType.startsWith("video/")){
    fileEl=`<video class="msg-video" src="${m.fileUrl}" controls preload="none" onerror="this.closest('.msg-media').innerHTML='<div class=\\'msg-file-expired\\'>⚠️ Video could not be loaded</div>'"></video>`;
  } else {
    fileEl=`<a class="msg-file-link" href="${m.fileUrl}" target="_blank" rel="noopener noreferrer">📎 ${esc(m.fileName||"File")}</a>`;
  }
  const{html:cH,firstUrl:cU}=m.text?linkifyText(m.text):{html:'',firstUrl:''};
  const caption=m.text?`<div class="msg-caption">${cH}${edited}</div>${lpTag(cU)}`:"";
  return`<div class="msg-media">${fileEl}${caption}</div>`;
}

function openChat(uid){
  const other=userById(uid);if(!other)return toast("User not found");
  const cid=convId(ME.id,uid);
  if(msgUnsub){msgUnsub();msgUnsub=null;}
  state.chatUid=uid;
  const otherStatus=userStatus(uid);
  const statusColor=otherStatus==='online'?'#22c55e':otherStatus==='busy'?'#f59e0b':'#9ca3af';
  const statusLabel=otherStatus==='online'?'Online':otherStatus==='busy'?'Busy':'Offline';
  $("page").innerHTML=`
    <div class="chat-header">
      <button class="btn sm" data-action="nav" data-view="msgs" style="flex-shrink:0">← Back</button>
      <div style="position:relative;flex-shrink:0">
        <div class="avatar" style="${avatarStyle(other,36)}">${other.avatarImg?'':initials(other.name)}</div>
        <span class="status-dot" style="background:${statusColor};position:absolute;bottom:0;right:0;border:2px solid var(--bg)" title="${statusLabel}"></span>
      </div>
      <div style="flex:1;min-width:0">
        <span class="chat-name">${esc(other.name)}</span>
        <span style="font-size:11px;color:${statusColor};margin-left:6px">${statusLabel}</span>
      </div>
      <span title="End-to-end encrypted" style="font-size:16px;opacity:.6;flex-shrink:0">🔒</span>
      <button class="btn sm" data-action="startcall" data-uid="${uid}" data-type="audio" title="Voice call" style="flex-shrink:0">📞</button>
      <button class="btn sm" data-action="startcall" data-uid="${uid}" data-type="video" title="Video call" style="flex-shrink:0">📹</button>
      <button class="btn sm" data-action="startconference" title="Conference call" style="flex-shrink:0">👥📞</button>
    </div>
    <div class="chat-msgs" id="chatMsgs"></div>
    <div class="chat-input-row">
      <button class="chat-attach-btn" data-action="attachfile" title="Attach file">📎</button>
      <input type="file" id="chatFileInput" style="display:none"/>
      <div class="chat-input-wrap">
        <div class="chat-file-preview" id="chatFilePreview"></div>
        <input class="chat-input" id="chatInput" placeholder="Type a message…" maxlength="1000"/>
      </div>
      <button class="btn primary" data-action="sendmsg" data-uid="${uid}" id="chatSendBtn">Send</button>
    </div>`;
  fbDB.collection("messages").doc(cid).set({participants:[ME.id,uid],unread:{[ME.id]:0}},{merge:true}).catch(()=>{});

  function _renderChatDocs(docs){
    const el=$("chatMsgs");if(!el)return;
    el.innerHTML=docs
      .filter(d=>!(d.data().deletedFor||[]).includes(ME.id))
      .map(d=>{const m=d.data();const mine=m.senderId===ME.id;
        if(m.deleted) return`<div class="msg-bubble ${mine?'mine':'theirs'} deleted">
          <div class="msg-text"><em>🗑️ Message deleted</em></div>
          <div class="msg-time">${timeAgo(m.time)}</div></div>`;
        return`<div class="msg-bubble ${mine?'mine':'theirs'}">
          ${renderMsgContent(m,d.id,cid,uid)}
          <div class="msg-meta">
            <span class="msg-time">${timeAgo(m.time)}</span>
            ${mine?`<span class="msg-actions">
              <button class="msg-act" data-action="editmsg" data-msgid="${d.id}" data-cid="${cid}" data-text="${esc(m.encrypted?'':m.text||'')}" title="Edit">✏️</button>
              <button class="msg-act" data-action="deletemsgmenu" data-msgid="${d.id}" data-cid="${cid}" title="Delete">🗑️</button>
            </span>`:''}
          </div></div>`;
      }).join('');
    el.scrollTop=el.scrollHeight;
    setTimeout(fetchLinkPreviews,0);
  }

  let _prevMsgCount=0;
  let _latestDocs=[];

  async function _decryptAndRender(docs){
    // Skip docs already in cache (successful decrypt or permanent failure string)
    const toDecrypt=docs.filter(d=>d.data().encrypted&&!_msgDecryptCache.has(cid+'|'+d.id));
    if(!toDecrypt.length) return;
    await Promise.all(toDecrypt.map(async d=>{
      const result=await E2EE.decrypt(uid,d.data());
      // null = transient failure (E2EE not ready yet) → don't cache, retry on next snapshot/e2ee-ready
      // any string (plain text OR '🔒 …' permanent error) → cache so we stop retrying
      if(result!==null) _msgDecryptCache.set(cid+'|'+d.id,result);
    }));
    if($("chatMsgs")) _renderChatDocs(docs);
  }

  // when E2EE initializes after the chat is already open, retry pending decryptions
  function _onE2EEReady(){ _decryptAndRender(_latestDocs); }
  document.addEventListener('e2ee-ready',_onE2EEReady,{once:true});

  msgUnsub=fbDB.collection("messages").doc(cid).collection("msgs")
    .orderBy("time","asc").limitToLast(80)
    .onSnapshot(async snap=>{
      const el=$("chatMsgs");if(!el)return;
      if(_prevMsgCount>0&&snap.docs.length>_prevMsgCount){
        const newest=snap.docs[snap.docs.length-1].data();
        if(newest.senderId!==ME.id&&!newest.deleted&&!(newest.deletedFor||[]).includes(ME.id)) playMsgSound();
      }
      _prevMsgCount=snap.docs.length;
      _latestDocs=snap.docs;
      _renderChatDocs(snap.docs);
      _decryptAndRender(snap.docs);
    },e=>console.warn("msgs",e));
  setTimeout(()=>{
    const inp=$("chatInput");
    if(inp) inp.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMsg(uid);}});
    const fi=$("chatFileInput");
    if(fi) fi.addEventListener("change",()=>{
      const f=fi.files[0];if(!f)return;
      if(f.size>27*1024*1024){toast("File is too large — max 27 MB.");fi.value="";return;}
      clearPendingFile();
      _pendingFile=f;
      const preview=$("chatFilePreview");if(!preview)return;
      if(f.type.startsWith("image/")){
        _pendingPreviewUrl=URL.createObjectURL(f);
        preview.innerHTML=`<img class="attach-preview-img" src="${_pendingPreviewUrl}"/><span class="attach-preview-name">${esc(f.name)}</span><button class="attach-clear" data-action="clearpendingfile" title="Remove">✕</button>`;
      } else {
        preview.innerHTML=`<span class="attach-preview-icon">${f.type.startsWith("audio/")?"🎵":f.type.startsWith("video/")?"🎬":"📎"}</span><span class="attach-preview-name">${esc(f.name)}</span><button class="attach-clear" data-action="clearpendingfile" title="Remove">✕</button>`;
      }
      preview.style.display="flex";
      fi.value="";
    });
  },100);
}

async function sendMsg(uid){
  if(!canMessage(uid)){ toast("This user has restricted who can message them."); return; }
  const inp=$("chatInput");if(!inp)return;
  const text=inp.value.trim();
  if(!text&&!_pendingFile)return;
  inp.value="";playMsgSound();
  const cid=convId(ME.id,uid);const time=Date.now();
  const msgData={senderId:ME.id,text:text||"",time,read:false};
  if(_pendingFile){
    const file=_pendingFile;
    clearPendingFile();
    const btn=$("chatSendBtn");if(btn){btn.disabled=true;btn.textContent="Uploading…";}
    try{
      const url=await uploadChatFile(file,pct=>{if(btn)btn.textContent=`${pct}%`;});
      msgData.fileUrl=url;
      msgData.fileType=file.type||"application/octet-stream";
      msgData.fileName=file.name||"file";
      msgData.fileExpiry=Date.now()+(3*24*60*60*1000); // 3 days
    }catch(e){
      if(btn){btn.disabled=false;btn.textContent="Send";}
      return toast("Upload failed: "+(e.message||e));
    }
    if(btn){btn.disabled=false;btn.textContent="Send";}
  }
  // encrypt text if E2EE is ready and message has text only (not file-only messages)
  let plainPreview=text;
  if(text&&!_pendingFile){
    const enc=await E2EE.encrypt(uid,text);
    if(enc.encrypted){
      msgData.text=enc.text;
      msgData.encrypted=true;
      plainPreview=text; // keep plain version for notification preview
    }
  }
  const msgRef=await fbDB.collection("messages").doc(cid).collection("msgs").add(msgData);
  // sender caches their own plaintext immediately so it shows without waiting for decryption
  if(msgData.encrypted&&plainPreview) _msgDecryptCache.set(cid+'|'+msgRef.id,plainPreview);
  const preview=msgData.fileUrl
    ?(msgData.fileType.startsWith("image/")?"📷 Photo"
      :msgData.fileType.startsWith("audio/")?"🎵 Audio"
      :msgData.fileType.startsWith("video/")?"🎬 Video"
      :`📎 ${msgData.fileName}`)
    :plainPreview;
  await fbDB.collection("messages").doc(cid).set({
    participants:[ME.id,uid],lastMsg:preview,lastTime:time,
    unread:{[ME.id]:0,[uid]:firebase.firestore.FieldValue.increment(1)}
  },{merge:true});
  if(!String(uid).startsWith("u_")) fbDB.collection("notifications").add({forUid:uid,type:"message",fromUid:ME.id,fromName:ME.name,text:`💬 ${ME.name}: ${preview.slice(0,60)}`,time,read:false}).catch(()=>{});
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

// ---- VOICE / VIDEO CALLS ----
let _callType='audio'; // 'audio' | 'video' — chosen at call start
let _callHasVideo=false; // true once a real video track is live in the RTCPeerConnection
let _videoSender=null;   // RTCRtpSender for the video track (so we can replaceTrack without renegotiating)

function createBlackVideoTrack(){
  const canvas=document.createElement('canvas'); canvas.width=320; canvas.height=240;
  const ctx=canvas.getContext('2d'); ctx.fillStyle='#000'; ctx.fillRect(0,0,320,240);
  const stream=canvas.captureStream(5); return stream.getVideoTracks()[0];
}

function startCall(uid, type){
  type=type||'audio';
  if(!navigator.mediaDevices)return toast("Microphone not available on this device.");
  if(activePc)return toast("Already in a call.");
  if(!canCall(uid)){ toast("This user has restricted who can call them."); return; }
  _callType=type; _callHasVideo=false; _videoSender=null;
  openCallUI(uid,"outgoing",type);
}

async function switchCallVideo(){
  if(!activePc||!_videoSender)return;
  if(!_callHasVideo){
    try{
      const vs=await navigator.mediaDevices.getUserMedia({video:true});
      const vt=vs.getVideoTracks()[0]; if(!vt){toast("Camera not available");return;}
      await _videoSender.replaceTrack(vt); // no renegotiation needed — sender already exists
      _callHasVideo=true; _cameraOff=false;
      const lv=$("localVideo"); if(lv){lv.srcObject=activeStream;lv.play().catch(()=>{});}
      const va=$("callVideoArea"); if(va)va.style.display='';
      const aw=$("callAvatarWrap"); if(aw)aw.style.display='none';
      const cb=$("camBtn"); if(cb){cb.style.display='flex';cb.textContent='📷';}
      const sb=$("switchVideoBtn"); if(sb)sb.textContent='📞 Voice only';
      toast("📹 Camera on");
    }catch(e){toast("Camera error: "+(e.message||e));}
  } else {
    activeStream.getVideoTracks().forEach(t=>t.stop());
    await _videoSender.replaceTrack(createBlackVideoTrack()).catch(()=>{});
    _callHasVideo=false; _cameraOff=true;
    const va=$("callVideoArea"); if(va)va.style.display='none';
    const aw=$("callAvatarWrap"); if(aw)aw.style.display='';
    const cb=$("camBtn"); if(cb)cb.style.display='none';
    const sb=$("switchVideoBtn"); if(sb)sb.textContent='📹 Add video';
    toast("📞 Voice only");
  }
}

function openCallUI(uid,mode,callTypeOverride){
  const callTypeLocal=callTypeOverride||_callType||'audio';
  const other=userById(uid)||{name:"Someone",color:"#888"};
  const pulse=mode==="incoming"||mode==="outgoing";
  const panel=document.getElementById('call-panel');
  if(!panel)return;
  const modeLabel=callTypeLocal==='video'?'📹 Video call':'📞 Voice call';
  panel.innerHTML=`
    <div class="cp-drag" id="cpDrag">
      <span class="cp-drag-dots">⠿</span>
      <span class="cp-title">${modeLabel} · ${esc(other.name)}</span>
      <span class="cp-timer-txt" id="callTimer" style="display:none"></span>
    </div>
    <div class="cp-body">
      <div id="callVideoArea" style="display:none;position:relative;width:100%;border-radius:12px;overflow:hidden;margin-bottom:8px;background:#111;aspect-ratio:16/9">
        <video id="remoteVideo" autoplay playsinline style="width:100%;height:100%;object-fit:cover"></video>
        <video id="localVideo" autoplay playsinline muted style="position:absolute;bottom:6px;right:6px;width:72px;height:54px;border-radius:8px;object-fit:cover;border:2px solid rgba(255,255,255,.4);background:#000"></video>
      </div>
      <div class="call-avatar-wrap" id="callAvatarWrap" style="position:relative;width:80px;height:80px;margin:0 auto 12px">
        ${pulse?'<div class="call-pulse" style="inset:-8px"></div><div class="call-pulse d2" style="inset:-18px"></div>':''}
        <div class="avatar" style="${avatarStyle(other,80)}">${other.avatarImg?'':initials(other.name)}</div>
      </div>
      <div class="call-status" id="callStatus">${mode==="outgoing"?"Calling…":"Incoming call…"}</div>
      <audio id="remoteAudio" autoplay playsinline style="display:none"></audio>
      <div class="voice-viz" id="voiceViz" style="display:none">
        <div class="vv-col">
          <div class="vv-bars" id="localBars">${'<div class="vv-bar"></div>'.repeat(10)}</div>
          <span class="vv-lbl">🎙️ You</span>
        </div>
        <div class="vv-mid">〰</div>
        <div class="vv-col">
          <div class="vv-bars" id="remoteBars">${'<div class="vv-bar vv-r"></div>'.repeat(10)}</div>
          <span class="vv-lbl">🔊 Them</span>
        </div>
      </div>
      ${mode==="incoming"?`<button class="mic-test-btn" id="micTestBtn" data-action="testmic">🎙️ Test mic</button>`:''}
      <div class="call-btns">
        ${mode==="incoming"?`<button class="call-btn-accept" data-action="acceptcall" data-uid="${uid}" title="Answer">📞</button>`:''}
        <button class="call-btn-mute" id="muteBtn" data-action="mutecall" title="Mute">🎙️</button>
        <button class="cp-cbtn" id="camBtn" data-action="togglecamera" title="Toggle camera" style="display:none;width:44px;height:44px;font-size:17px">📷</button>
        <button class="cp-cbtn" id="switchVideoBtn" data-action="switchcallvideo" title="Switch audio/video" style="width:auto;padding:0 10px;height:44px;font-size:13px">${callTypeLocal==='video'?'📞 Voice only':'📹 Add video'}</button>
        <button class="call-btn-end" data-action="endcall" title="${mode==="incoming"?"Decline":"End call"}">📵</button>
      </div>
    </div>`;
  panel.classList.add('active');
  _reinitCpDrag();
  try{const _ac=new(window.AudioContext||window.webkitAudioContext)();_ac.resume().catch(()=>{});}catch(e){}
  _preMusicVol=audio.volume||1; audio.volume=0.12;
  if(mode==="incoming") playRing();
  if(mode==="outgoing") initiateCall(uid, callTypeLocal);
}

async function initiateCall(uid, callType){
  callType=callType||_callType||'audio';
  const cid=[ME.id,uid].sort().join("_")+"_c"+Date.now();activeCallId=cid;
  let _remoteHasVideo=false;
  try{
    let stream;
    if(callType==='video'){
      try{ stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true}); _cameraOff=false; _callHasVideo=true; }
      catch(e){ stream=await navigator.mediaDevices.getUserMedia({audio:true}); _cameraOff=true; _callHasVideo=false; }
    } else {
      stream=await navigator.mediaDevices.getUserMedia({audio:true}); _cameraOff=true; _callHasVideo=false;
    }
    activeStream=stream;
    if(_callHasVideo){
      const lv=$("localVideo");if(lv){lv.srcObject=stream;lv.play().catch(()=>{});}
      const va=$("callVideoArea");if(va)va.style.display='';
      const aw=$("callAvatarWrap");if(aw)aw.style.display='none';
      const cb=$("camBtn");if(cb)cb.style.display='flex';
    }
    startVoiceViz(stream);
    const iceServers=await getICE();
    const pc=new RTCPeerConnection({iceServers});activePc=pc;
    // Always add audio track(s); always add a video sender (black placeholder when audio-only)
    // so replaceTrack() works mid-call without SDP renegotiation
    stream.getAudioTracks().forEach(t=>pc.addTrack(t,stream));
    const videoTrack=stream.getVideoTracks()[0]||createBlackVideoTrack();
    _videoSender=pc.addTrack(videoTrack,stream);

    pc.ontrack=e=>{
      const ms=(e.streams&&e.streams.length&&e.streams[0])||new MediaStream([e.track]);
      if(e.track.kind==='video'){
        _remoteHasVideo=true;
        const rv=$("remoteVideo");if(rv){rv.srcObject=ms;rv.muted=false;rv.play().catch(()=>{});}
        const ra=$("remoteAudio");if(ra){ra.srcObject=null;ra.muted=true;}
        const va=$("callVideoArea");if(va)va.style.display='';
        const aw=$("callAvatarWrap");if(aw)aw.style.display='none';
        e.track.onunmute=()=>{const r=$("remoteVideo");if(r&&r.paused)r.play().catch(()=>{});};
      } else {
        if(!_remoteHasVideo){
          const ra=$("remoteAudio");if(!ra)return;
          ra.srcObject=ms;ra.muted=false;ra.volume=1.0;ra.play().catch(()=>{});
          e.track.onunmute=()=>{const r=$("remoteAudio");if(r&&r.paused)r.play().catch(()=>{});};
        }
        addRemoteViz(ms);
      }
    };

    pc.oniceconnectionstatechange=()=>{
      const st=pc.iceConnectionState;
      if(st==="checking"){
        clearTimeout(_iceTimeout);
        _iceTimeout=setTimeout(()=>{
          if(activePc&&activePc.iceConnectionState==="checking"){
            const s=$("callStatus");if(s)s.textContent="Could not connect — check your network and try again.";
            setTimeout(endCall,2500);
          }
        },30000);
      } else if(st==="connected"||st==="completed"){
        clearTimeout(_iceTimeout);_iceTimeout=null;
        startCallTimer();const s=$("callStatus");if(s)s.textContent="Connected ✓";
      } else if(st==="failed"){
        clearTimeout(_iceTimeout);_iceTimeout=null;
        const s=$("callStatus");if(s)s.textContent="Connection failed — check mic & network.";
        setTimeout(endCall,2500);
      } else if(st==="disconnected"){
        const s=$("callStatus");if(s)s.textContent="Connection lost — reconnecting…";
      }
    };

    const buf=[];let docReady=false;
    pc.onicecandidate=e=>{
      if(!e.candidate)return;
      const j=e.candidate.toJSON();
      if(docReady) fbDB.collection("calls").doc(cid).update({callerCandidates:firebase.firestore.FieldValue.arrayUnion(j)}).catch(()=>{});
      else buf.push(j);
    };

    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer); // <-- gathering starts here

    await fbDB.collection("calls").doc(cid).set({
      callerId:ME.id,calleeId:uid,
      callType:callType||'audio',
      offer:{type:offer.type,sdp:offer.sdp},
      callerCandidates:[],calleeCandidates:[],
      status:"ringing",time:Date.now()
    });
    docReady=true;
    if(buf.length) fbDB.collection("calls").doc(cid).update({callerCandidates:firebase.firestore.FieldValue.arrayUnion(...buf)}).catch(()=>{});

    fbDB.collection("notifications").add({forUid:uid,type:"call",fromUid:ME.id,fromName:ME.name,text:`📞 ${ME.name} is calling you`,time:Date.now(),read:false}).catch(()=>{});

    let addedCallee=0;
    callUnsub=fbDB.collection("calls").doc(cid).onSnapshot(async snap=>{
      const d=snap.data();if(!d||!activePc)return;
      if(d.status==="ended"){endCall();return;}
      if(d.answer&&!pc.currentRemoteDescription){
        await pc.setRemoteDescription(new RTCSessionDescription(d.answer)).catch(()=>{});
        const s=$("callStatus");if(s&&s.textContent==="Calling…")s.textContent="Connecting…";
      }
      if(pc.currentRemoteDescription&&(d.calleeCandidates||[]).length>addedCallee){
        const fresh=d.calleeCandidates.slice(addedCallee);
        for(const c of fresh)await pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{});
        addedCallee=d.calleeCandidates.length;
      }
    });
  }catch(e){
    toast(e.name==="NotAllowedError"?"Microphone blocked — allow mic access in your browser settings and try again.":`Mic error: ${e.message||e}`);
    endCall();
  }
}

async function acceptCall(uid){
  stopRing();
  const s=$("callStatus");if(s)s.textContent="Connecting…";
  const snap=await fbDB.collection("calls")
    .where("callerId","==",uid).where("calleeId","==",ME.id).where("status","==","ringing")
    .orderBy("time","desc").limit(1).get().catch(()=>null);
  if(!snap||snap.empty){toast("Call already ended.");$("overlay").hidden=true;$("overlayBody").innerHTML="";return;}
  const doc=snap.docs[0];const d=doc.data();const cid=doc.id;activeCallId=cid;
  const incomingCallType=d.callType||'audio'; _callType=incomingCallType; _callHasVideo=false; _videoSender=null;
  let _remoteHasVideo=false;
  try{
    // Stop any test-mic stream before getting a fresh one for the actual call
    if(_testMicStream){_testMicStream.getTracks().forEach(t=>t.stop());_testMicStream=null;}
    let stream;
    if(incomingCallType==='video'){
      try{ stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true}); _cameraOff=false; _callHasVideo=true; }
      catch(e){ stream=await navigator.mediaDevices.getUserMedia({audio:true}); _cameraOff=true; _callHasVideo=false; }
    } else {
      stream=await navigator.mediaDevices.getUserMedia({audio:true}); _cameraOff=true; _callHasVideo=false;
    }
    activeStream=stream;
    if(_callHasVideo){
      const lv=$("localVideo");if(lv){lv.srcObject=stream;lv.play().catch(()=>{});}
      const va=$("callVideoArea");if(va)va.style.display='';
      const aw=$("callAvatarWrap");if(aw)aw.style.display='none';
      const cb=$("camBtn");if(cb)cb.style.display='flex';
    }
    startVoiceViz(stream);
    const iceServers=await getICE();
    const pc=new RTCPeerConnection({iceServers});activePc=pc;
    stream.getAudioTracks().forEach(t=>pc.addTrack(t,stream));
    const acceptVideoTrack=stream.getVideoTracks()[0]||createBlackVideoTrack();
    _videoSender=pc.addTrack(acceptVideoTrack,stream);

    pc.ontrack=e=>{
      const ms=(e.streams&&e.streams.length&&e.streams[0])||new MediaStream([e.track]);
      if(e.track.kind==='video'){
        _remoteHasVideo=true;
        const rv=$("remoteVideo");if(rv){rv.srcObject=ms;rv.muted=false;rv.play().catch(()=>{});}
        const ra=$("remoteAudio");if(ra){ra.srcObject=null;ra.muted=true;}
        const va=$("callVideoArea");if(va)va.style.display='';
        const aw=$("callAvatarWrap");if(aw)aw.style.display='none';
        e.track.onunmute=()=>{const r=$("remoteVideo");if(r&&r.paused)r.play().catch(()=>{});};
      } else {
        if(!_remoteHasVideo){
          const ra=$("remoteAudio");if(!ra)return;
          ra.srcObject=ms;ra.muted=false;ra.volume=1.0;ra.play().catch(()=>{});
          e.track.onunmute=()=>{const r=$("remoteAudio");if(r&&r.paused)r.play().catch(()=>{});};
        }
        addRemoteViz(ms);
      }
    };

    pc.oniceconnectionstatechange=()=>{
      const ist=pc.iceConnectionState;
      if(ist==="checking"){
        clearTimeout(_iceTimeout);
        _iceTimeout=setTimeout(()=>{
          if(activePc&&activePc.iceConnectionState==="checking"){
            const s=$("callStatus");if(s)s.textContent="Could not connect — check your network and try again.";
            setTimeout(endCall,2500);
          }
        },30000);
      } else if(ist==="connected"||ist==="completed"){
        clearTimeout(_iceTimeout);_iceTimeout=null;
        startCallTimer();const st=$("callStatus");if(st)st.textContent="Connected ✓";
      } else if(ist==="failed"){
        clearTimeout(_iceTimeout);_iceTimeout=null;
        const st=$("callStatus");if(st)st.textContent="Connection failed — check mic & network.";
        setTimeout(endCall,2500);
      } else if(ist==="disconnected"){
        const st=$("callStatus");if(st)st.textContent="Connection lost — reconnecting…";
      }
    };

    // CRITICAL: set onicecandidate BEFORE setLocalDescription
    const buf=[];let docReady=false;
    pc.onicecandidate=e=>{
      if(!e.candidate)return;
      const j=e.candidate.toJSON();
      if(docReady) fbDB.collection("calls").doc(cid).update({calleeCandidates:firebase.firestore.FieldValue.arrayUnion(j)}).catch(()=>{});
      else buf.push(j);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(d.offer));
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer); // <-- gathering starts here

    await fbDB.collection("calls").doc(cid).update({answer:{type:answer.type,sdp:answer.sdp},status:"active"});
    docReady=true;
    if(buf.length) fbDB.collection("calls").doc(cid).update({calleeCandidates:firebase.firestore.FieldValue.arrayUnion(...buf)}).catch(()=>{});

    // Add caller's candidates that arrived before we accepted
    let addedCaller=0;
    if((d.callerCandidates||[]).length){
      for(const c of d.callerCandidates)await pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{});
      addedCaller=d.callerCandidates.length;
    }

    callUnsub=fbDB.collection("calls").doc(cid).onSnapshot(async snap2=>{
      const d2=snap2.data();if(!d2||!activePc)return;
      if(d2.status==="ended"){endCall();return;}
      if((d2.callerCandidates||[]).length>addedCaller){
        const fresh=d2.callerCandidates.slice(addedCaller);
        for(const c of fresh)await pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{});
        addedCaller=d2.callerCandidates.length;
      }
    });
  }catch(e){
    toast(e.name==="NotAllowedError"?"Microphone blocked — allow mic access in your browser settings and try again.":`Mic error: ${e.message||e}`);
    endCall();
  }
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
function toggleCamera(){
  if(!activeStream)return;
  _cameraOff=!_cameraOff;
  activeStream.getVideoTracks().forEach(t=>t.enabled=!_cameraOff);
  const btn=$("camBtn");if(btn){btn.textContent=_cameraOff?'📷 Off':'📷';btn.classList.toggle('on',_cameraOff);}
  const lv=$("localVideo");if(lv)lv.style.opacity=_cameraOff?'0.2':'1';
}
async function endCall(){
  stopRing();stopVoiceViz();
  clearTimeout(_iceTimeout);_iceTimeout=null;
  audio.volume=_preMusicVol;
  clearInterval(callInterval);callInterval=null;
  if(callUnsub){callUnsub();callUnsub=null;}
  if(activePc){activePc.close();activePc=null;}
  if(activeStream){activeStream.getTracks().forEach(t=>t.stop());activeStream=null;}
  if(activeCallId){await fbDB.collection("calls").doc(activeCallId).update({status:"ended"}).catch(()=>{});activeCallId=null;}
  muted=false;
  const _cp=document.getElementById('call-panel');
  if(_cp){_cp.classList.remove('active');_cp.innerHTML='';_cp.style.left='';_cp.style.top='';}
}

function listenForIncomingCalls(){
  if(!ME||!ME.handle)return;
  if(_callsUnsub){_callsUnsub();_callsUnsub=null;}
  // Single-field query — no composite index needed.
  // Two-field query (calleeId + status) silently fails without a composite index,
  // so we filter status and recency in JavaScript instead.
  _callsUnsub=fbDB.collection("calls").where("calleeId","==",ME.id)
    .onSnapshot(snap=>{
      snap.docChanges().forEach(ch=>{
        if(ch.type==="added"&&!activePc){
          const d=ch.doc.data();
          const fresh=Date.now()-d.time<120000; // ignore calls older than 2 min
          if(d.status==="ringing"&&fresh){
            // Show OS-level notification so user sees the ring even in a different app
            showCallBrowserNotif(d.callerId);
            _callType=d.callType||'audio'; _callHasVideo=false; _videoSender=null;
            openCallUI(d.callerId,"incoming",d.callType||'audio');
          }
        }
      });
    },e=>console.warn("calls listener:",e.code||e.message));
}
let _callsUnsub=null;

// ---- FLOATING CALL PANEL INIT & DRAG ----
function initCallPanel(){
  if(document.getElementById('call-panel'))return;
  const p=document.createElement('div');
  p.id='call-panel';
  document.body.appendChild(p);
}

function _reinitCpDrag(){
  const drag=document.getElementById('cpDrag');
  if(!drag)return;
  drag.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.pointerType==='mouse')return;
    const panel=document.getElementById('call-panel');if(!panel)return;
    const rect=panel.getBoundingClientRect();
    _cpDragOffX=e.clientX-rect.left;_cpDragOffY=e.clientY-rect.top;
    _cpDragging=true;
    drag.setPointerCapture(e.pointerId);drag.classList.add('dragging');
    panel.style.bottom='auto';panel.style.right='auto';
    panel.style.left=rect.left+'px';panel.style.top=rect.top+'px';
    e.preventDefault();
  },{passive:false});
  drag.addEventListener('pointermove',e=>{
    if(!_cpDragging)return;
    const panel=document.getElementById('call-panel');if(!panel)return;
    let x=e.clientX-_cpDragOffX,y=e.clientY-_cpDragOffY;
    x=Math.max(0,Math.min(window.innerWidth-panel.offsetWidth,x));
    y=Math.max(0,Math.min(window.innerHeight-panel.offsetHeight,y));
    panel.style.left=x+'px';panel.style.top=y+'px';
  });
  drag.addEventListener('pointerup',()=>{
    _cpDragging=false;
    const d=document.getElementById('cpDrag');if(d)d.classList.remove('dragging');
  });
}

// ---- CONFERENCE CALLS ----
function _openConfPanel(statusText){
  const panel=document.getElementById('call-panel');if(!panel)return;
  panel.innerHTML=`
    <div class="cp-drag" id="cpDrag">
      <span class="cp-drag-dots">⠿</span>
      <span class="cp-title">📞 Conference</span>
      <span class="cp-timer-txt" id="callTimer" style="display:none"></span>
    </div>
    <div class="cp-body">
      <div class="cp-conf-status" id="cpConfStatus">${statusText||'Conference active'}</div>
      <div class="cp-participants" id="cpParticipants"></div>
      <div class="voice-viz" id="voiceViz" style="display:none">
        <div class="vv-col">
          <div class="vv-bars" id="localBars">${'<div class="vv-bar"></div>'.repeat(10)}</div>
          <span class="vv-lbl">🎙️ You</span>
        </div>
      </div>
      <audio id="remoteAudio" autoplay playsinline style="display:none"></audio>
      <div class="cp-conf-controls">
        <button class="cp-cbtn" id="cpMuteBtn" data-action="confmute" title="Mute/unmute">🎙️</button>
        <button class="cp-cbtn" id="cpCamBtn" data-action="confcam" title="Camera">📷</button>
        <button class="cp-cbtn" id="cpHandBtn" data-action="togglehand" title="Raise hand">✋</button>
        <button class="cp-cbtn" data-action="opencallinvite" title="Invite someone">➕</button>
        <button class="cp-cbtn cp-cend" data-action="leavecall" title="Leave call">📵</button>
      </div>
    </div>`;
  panel.classList.add('active');
  _reinitCpDrag();
  _updateConfPanel();
}

function _updateConfPanel(){
  const el=document.getElementById('cpParticipants');
  if(!el||!_confCallId)return;
  const uids=Object.keys(_confParticipants);
  const statusEl=document.getElementById('cpConfStatus');
  if(statusEl&&uids.length>0) statusEl.textContent=`${uids.length} participant${uids.length!==1?'s':''}`;
  el.innerHTML=uids.map(uid=>{
    const u=userById(uid)||{name:uid.slice(0,8),color:'#888'};
    const p=_confParticipants[uid]||{};
    const isMe=uid===ME?.id;
    const avStyle=u.avatarImg?`background-image:url('${u.avatarImg}');background-size:cover;background-position:center`:`background:${u.color}`;
    return`<div class="cp-participant">
      <div style="position:relative;flex-shrink:0;width:44px;height:33px">
        <video id="confVid_${uid}" autoplay playsinline ${isMe?'muted':''} style="width:44px;height:33px;border-radius:6px;object-fit:cover;background:#111;display:block"></video>
        <div class="cp-p-av" id="confAv_${uid}" style="${avStyle};position:absolute;inset:0;border-radius:6px;width:auto;height:auto;font-size:11px">${u.avatarImg?'':initials(u.name)}</div>
      </div>
      <span class="cp-p-name">${esc(u.name)}${isMe?' (you)':''}</span>
      <span class="cp-p-icons">
        ${p.handRaised?'<span class="cp-p-hand">✋</span>':''}
        ${p.muted?'<span style="font-size:12px;opacity:.5">🔇</span>':'<span style="font-size:12px;opacity:.35">🎙️</span>'}
      </span>
    </div>`;
  }).join('');
  // Reattach local video preview to own tile
  if(activeStream){
    const vt=activeStream.getVideoTracks();
    if(vt.length&&!_cameraOff){
      const myVid=document.getElementById('confVid_'+ME?.id);
      if(myVid){myVid.srcObject=activeStream;myVid.play().catch(()=>{});}
      const myAv=document.getElementById('confAv_'+ME?.id);
      if(myAv)myAv.style.display='none';
    }
  }
  // Reattach remote participant video tiles
  Object.keys(_confStreams).forEach(uid=>{
    const stream=_confStreams[uid];if(!stream)return;
    const hasVideo=stream.getVideoTracks&&stream.getVideoTracks().length>0;
    if(hasVideo){
      const vEl=document.getElementById('confVid_'+uid);
      if(vEl&&vEl.srcObject!==stream){vEl.srcObject=stream;vEl.play().catch(()=>{});}
      const avEl=document.getElementById('confAv_'+uid);
      if(avEl)avEl.style.display='none';
    }
  });
}

async function startConference(invitedUids){
  if(!navigator.mediaDevices)return toast("Mic not available on this device.");
  if(activePc||_confCallId)return toast("Already in a call.");
  if(!invitedUids||!invitedUids.length)return;
  try{
    let stream;
    try{ stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true}); _cameraOff=false; }
    catch(e){ stream=await navigator.mediaDevices.getUserMedia({audio:true}); _cameraOff=true; }
    activeStream=stream;
    const callId='conf_'+ME.id.slice(0,8)+'_'+Date.now();
    _confCallId=callId;_confPeers={};_confAudios={};_confHandRaised=false;_confProcessed={};
    _confParticipants={[ME.id]:{muted:false,handRaised:false,joinedAt:Date.now()}};
    await fbDB.collection("conferences").doc(callId).set({
      type:'conference',initiatorUid:ME.id,initiatorName:ME.name,
      title:`${ME.name}'s call`,invitedUids,participantUids:[ME.id],
      status:'active',time:Date.now(),participants:_confParticipants
    });
    invitedUids.forEach(uid=>{
      fbDB.collection("notifications").add({
        forUid:uid,type:"call_conference",fromUid:ME.id,fromName:ME.name,
        callId,text:`📞 ${ME.name} is inviting you to a conference call`,time:Date.now(),read:false
      }).catch(()=>{});
    });
    showCallBrowserNotif(ME.id);
    _openConfPanel('Waiting for others to join…');
    _listenConfUpdates(callId);
    _preMusicVol=audio.volume||1;audio.volume=0.12;
    startVoiceViz(stream);
    const viz=document.getElementById('voiceViz');if(viz)viz.style.display='flex';
  }catch(e){
    toast(e.name==='NotAllowedError'?"Mic blocked — allow mic access and try again.":`Mic error: ${e.message||e}`);
    leaveConference();
  }
}

async function joinConference(callId){
  if(activePc)return toast("End your current call first.");
  if(_confCallId===callId)return;
  if(_confCallId)return toast("Already in a conference call.");
  stopRing();
  try{
    let stream;
    try{ stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true}); _cameraOff=false; }
    catch(e){ stream=await navigator.mediaDevices.getUserMedia({audio:true}); _cameraOff=true; }
    activeStream=stream;
    _confCallId=callId;_confPeers={};_confAudios={};_confHandRaised=false;_confProcessed={};
    const snap=await fbDB.collection("conferences").doc(callId).get();
    if(!snap.exists||snap.data().status==='ended'){toast("Conference has ended.");leaveConference();return;}
    const conf=snap.data();
    _confParticipants={...conf.participants||{}};
    _confParticipants[ME.id]={muted:false,handRaised:false,joinedAt:Date.now()};
    const F=firebase.firestore.FieldValue;
    await fbDB.collection("conferences").doc(callId).update({
      participantUids:F.arrayUnion(ME.id),
      [`participants.${ME.id}`]:{muted:false,handRaised:false,joinedAt:Date.now()}
    });
    _openConfPanel('Conference active');
    _preMusicVol=audio.volume||1;audio.volume=0.12;
    startVoiceViz(stream);
    const viz=document.getElementById('voiceViz');if(viz)viz.style.display='flex';
    const existing=(conf.participantUids||[]).filter(uid=>uid!==ME.id);
    for(const uid of existing) _makeConfOffer(callId,uid);
    _listenConfUpdates(callId);
  }catch(e){
    toast(e.name==='NotAllowedError'?"Mic blocked.":`Error: ${e.message||e}`);
    leaveConference();
  }
}

async function _makeConfOffer(callId,remoteUid){
  if(_confPeers[remoteUid])return;
  const iceServers=await getICE();
  const pc=new RTCPeerConnection({iceServers});
  _confPeers[remoteUid]=pc;
  if(activeStream) activeStream.getTracks().forEach(t=>pc.addTrack(t,activeStream));
  pc.ontrack=e=>_attachConfMedia(remoteUid,(e.streams&&e.streams[0])||new MediaStream([e.track]));
  pc.oniceconnectionstatechange=()=>{
    if(pc.iceConnectionState==='failed'||pc.iceConnectionState==='closed')_cleanupConfPeer(remoteUid);
    _updateConfPanel();
  };
  const pairKey=[ME.id,remoteUid].sort().join('___');
  const buf=[];let docReady=false;
  pc.onicecandidate=e=>{
    if(!e.candidate)return;
    const j=e.candidate.toJSON();
    if(docReady) fbDB.collection("conferences").doc(callId).collection("signals").doc(pairKey)
      .update({offerCandidates:firebase.firestore.FieldValue.arrayUnion(j)}).catch(()=>{});
    else buf.push(j);
  };
  const offer=await pc.createOffer();
  await pc.setLocalDescription(offer);
  await fbDB.collection("conferences").doc(callId).collection("signals").doc(pairKey).set({
    uids:[ME.id,remoteUid].sort(),offererUid:ME.id,
    offer:{type:offer.type,sdp:offer.sdp},answer:null,
    offerCandidates:[],answerCandidates:[]
  });
  docReady=true;
  if(buf.length) fbDB.collection("conferences").doc(callId).collection("signals").doc(pairKey)
    .update({offerCandidates:firebase.firestore.FieldValue.arrayUnion(...buf)}).catch(()=>{});
  _updateConfPanel();
}

async function _answerConfOffer(callId,pairKey,sig){
  const remoteUid=sig.offererUid;
  if(_confPeers[remoteUid])return;
  const iceServers=await getICE();
  const pc=new RTCPeerConnection({iceServers});
  _confPeers[remoteUid]=pc;
  if(activeStream) activeStream.getTracks().forEach(t=>pc.addTrack(t,activeStream));
  pc.ontrack=e=>_attachConfMedia(remoteUid,(e.streams&&e.streams[0])||new MediaStream([e.track]));
  pc.oniceconnectionstatechange=()=>{
    if(pc.iceConnectionState==='failed'||pc.iceConnectionState==='closed')_cleanupConfPeer(remoteUid);
    _updateConfPanel();
  };
  const buf=[];let docReady=false;
  pc.onicecandidate=e=>{
    if(!e.candidate)return;
    const j=e.candidate.toJSON();
    if(docReady) fbDB.collection("conferences").doc(callId).collection("signals").doc(pairKey)
      .update({answerCandidates:firebase.firestore.FieldValue.arrayUnion(j)}).catch(()=>{});
    else buf.push(j);
  };
  await pc.setRemoteDescription(new RTCSessionDescription(sig.offer));
  for(const c of(sig.offerCandidates||[])) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{});
  const answer=await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await fbDB.collection("conferences").doc(callId).collection("signals").doc(pairKey)
    .update({answer:{type:answer.type,sdp:answer.sdp}});
  docReady=true;
  if(buf.length) fbDB.collection("conferences").doc(callId).collection("signals").doc(pairKey)
    .update({answerCandidates:firebase.firestore.FieldValue.arrayUnion(...buf)}).catch(()=>{});
  _updateConfPanel();
}

function _attachConfMedia(uid,stream){
  _confStreams[uid]=stream;
  const hasVideo=stream.getVideoTracks&&stream.getVideoTracks().length>0;
  if(hasVideo){
    // Route video (and its audio) to the video tile in the conference panel
    const vEl=document.getElementById('confVid_'+uid);
    if(vEl){vEl.srcObject=stream;vEl.play().catch(()=>{});}
    const avEl=document.getElementById('confAv_'+uid);if(avEl)avEl.style.display='none';
    // Mute the audio element so the video element handles audio
    if(_confAudios[uid]){_confAudios[uid].srcObject=null;}
  } else {
    let au=_confAudios[uid];
    if(!au){au=new Audio();au.autoplay=true;au.volume=1.0;document.body.appendChild(au);_confAudios[uid]=au;}
    au.srcObject=stream;au.play().catch(()=>{});
  }
}

function _cleanupConfPeer(uid){
  if(_confPeers[uid]){try{_confPeers[uid].close();}catch(e){}delete _confPeers[uid];}
  if(_confAudios[uid]){_confAudios[uid].srcObject=null;try{_confAudios[uid].remove();}catch(e){}delete _confAudios[uid];}
  if(_confStreams[uid])delete _confStreams[uid];
}

function _listenConfUpdates(callId){
  if(_confCallUnsub){_confCallUnsub();_confCallUnsub=null;}
  _confCallUnsub=fbDB.collection("conferences").doc(callId).onSnapshot(snap=>{
    if(!snap.exists){leaveConference();return;}
    const conf=snap.data();
    if(conf.status==='ended'){leaveConference();return;}
    _confParticipants=conf.participants||{};
    _updateConfPanel();
  },e=>console.warn("conf:",e.code));

  if(_confSignalUnsub){_confSignalUnsub();_confSignalUnsub=null;}
  _confSignalUnsub=fbDB.collection("conferences").doc(callId).collection("signals").onSnapshot(snap=>{
    snap.docChanges().forEach(async ch=>{
      if(ch.type==='removed')return;
      const sig=ch.doc.data();const pairKey=ch.doc.id;
      if(!(sig.uids||[]).includes(ME?.id))return;
      if(sig.offererUid!==ME.id){
        if(!sig.offer||_confPeers[sig.offererUid])return;
        await _answerConfOffer(callId,pairKey,sig);
      } else {
        const otherUid=(sig.uids||[]).find(u=>u!==ME.id);
        const pc=_confPeers[otherUid];if(!pc)return;
        if(sig.answer&&!pc.currentRemoteDescription)
          await pc.setRemoteDescription(new RTCSessionDescription(sig.answer)).catch(()=>{});
        if(pc.currentRemoteDescription){
          const already=_confProcessed['ac_'+pairKey]||0;
          const fresh=(sig.answerCandidates||[]).slice(already);
          for(const c of fresh) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(()=>{});
          _confProcessed['ac_'+pairKey]=(sig.answerCandidates||[]).length;
        }
      }
    });
  },e=>console.warn("conf signals:",e.code));
}

async function leaveConference(){
  if(!_confCallId)return;
  const callId=_confCallId;_confCallId=null;
  Object.keys(_confPeers).forEach(uid=>_cleanupConfPeer(uid));
  _confPeers={};_confAudios={};_confStreams={};_confHandRaised=false;_confParticipants={};_confProcessed={};
  if(_confCallUnsub){_confCallUnsub();_confCallUnsub=null;}
  if(_confSignalUnsub){_confSignalUnsub();_confSignalUnsub=null;}
  stopVoiceViz();
  if(activeStream){activeStream.getTracks().forEach(t=>t.stop());activeStream=null;}
  audio.volume=_preMusicVol;muted=false;
  await fbDB.collection("conferences").doc(callId).update({
    participantUids:firebase.firestore.FieldValue.arrayRemove(ME.id)
  }).catch(()=>{});
  const panel=document.getElementById('call-panel');
  if(panel){panel.classList.remove('active');panel.innerHTML='';panel.style.left='';panel.style.top='';}
}

async function toggleCallHand(){
  if(!_confCallId)return;
  _confHandRaised=!_confHandRaised;
  await fbDB.collection("conferences").doc(_confCallId).update({
    [`participants.${ME.id}.handRaised`]:_confHandRaised
  }).catch(()=>{});
  const btn=document.getElementById('cpHandBtn');
  if(btn)btn.classList.toggle('on',_confHandRaised);
  _confParticipants[ME.id]={...(_confParticipants[ME.id]||{}),handRaised:_confHandRaised};
  _updateConfPanel();
}

async function confMuteToggle(){
  muted=!muted;
  if(activeStream) activeStream.getAudioTracks().forEach(t=>t.enabled=!muted);
  if(_confCallId){
    _confParticipants[ME.id]={...(_confParticipants[ME.id]||{}),muted};
    await fbDB.collection("conferences").doc(_confCallId).update({
      [`participants.${ME.id}.muted`]:muted
    }).catch(()=>{});
    _updateConfPanel();
  }
  const btn=document.getElementById('cpMuteBtn');if(btn){btn.classList.toggle('on',muted);btn.textContent=muted?'🔇':'🎙️';}
  const btn2=document.getElementById('muteBtn');if(btn2)btn2.textContent=muted?'🔇 Unmute':'🎙️ Mute';
}
function confCamToggle(){
  if(!activeStream)return;
  _cameraOff=!_cameraOff;
  activeStream.getVideoTracks().forEach(t=>t.enabled=!_cameraOff);
  const btn=document.getElementById('cpCamBtn');if(btn){btn.textContent=_cameraOff?'📷 Off':'📷';btn.classList.toggle('on',_cameraOff);}
  _updateConfPanel();
}

function openCallInvite(){
  if(!_confCallId&&!activeCallId)return;
  const currentParts=_confCallId?Object.keys(_confParticipants):[];
  const candidates=Object.values(CACHE.users||{}).filter(u=>u.id!==ME?.id&&!currentParts.includes(u.id)&&u.handle);
  if(!candidates.length){toast("No users to invite.");return;}
  openOverlay(`<div>
    <div style="font-size:18px;font-weight:700;margin-bottom:14px">📞 Invite to call</div>
    <div style="display:flex;flex-direction:column;gap:7px;max-height:300px;overflow-y:auto">
      ${candidates.slice(0,20).map(u=>`
        <div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:10px;background:var(--bg)">
          <div class="avatar sm" style="${avatarStyle(u,36)}">${u.avatarImg?'':initials(u.name)}</div>
          <div style="flex:1"><div style="font-weight:600;font-size:13px">${esc(u.name)}</div><div style="font-size:11px;color:var(--muted)">@${esc(u.handle)}</div></div>
          <button class="btn sm primary" data-action="invitetoconf" data-uid="${u.id}">Invite</button>
        </div>`).join('')}
    </div>
  </div>`);
}

async function inviteToCall(uid){
  if(!_confCallId)return;
  closeOverlay();
  await fbDB.collection("conferences").doc(_confCallId).update({
    invitedUids:firebase.firestore.FieldValue.arrayUnion(uid)
  }).catch(()=>{});
  fbDB.collection("notifications").add({
    forUid:uid,type:"call_conference",fromUid:ME.id,fromName:ME.name,
    callId:_confCallId,text:`📞 ${ME.name} invited you to a conference call`,time:Date.now(),read:false
  }).catch(()=>{});
  toast("Invite sent 📞");
}

function openConferenceDialog(){
  if(!ME)return openEmailAuth();
  const allUsers=Object.values(CACHE.users||{}).filter(u=>u.id!==ME.id&&u.handle);
  if(!allUsers.length){toast("No users found.");return;}
  openOverlay(`<div>
    <div style="font-size:18px;font-weight:700;margin-bottom:4px">📞 Start conference call</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:14px">Select people to invite (up to 8)</div>
    <div id="confPickList" style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;margin-bottom:14px">
      ${allUsers.slice(0,30).map(u=>`
        <label style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:10px;background:var(--bg);cursor:pointer">
          <input type="checkbox" value="${u.id}" style="accent-color:var(--orange);width:16px;height:16px;flex-shrink:0">
          <div class="avatar sm" style="${avatarStyle(u,34)}">${u.avatarImg?'':initials(u.name)}</div>
          <div><div style="font-weight:600;font-size:13px">${esc(u.name)}</div><div style="font-size:11px;color:var(--muted)">@${esc(u.handle)}</div></div>
        </label>`).join('')}
    </div>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn block primary" data-action="beginconference">📞 Start call</button>
    </div>
  </div>`);
}

function beginConference(){
  const checked=[...document.querySelectorAll('#confPickList input:checked')].map(i=>i.value);
  if(!checked.length){toast("Select at least one person to call.");return;}
  if(checked.length>8){toast("Conference calls support up to 8 participants.");return;}
  closeOverlay();
  startConference(checked);
}
