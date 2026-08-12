// ============================================================
//  community-contests.js — Contest creation, voting, resolution
//  Loaded after community-wallet.js.
// ============================================================

let _pendingCorrection=null;
let _ctMode='simple'; // create-form state: 'simple' | 'compound'

// ── helpers ──
function _isCompound(c){ return c.mode==='compound'; }
function _optPrize(c,optId){ const o=(c.options||[]).find(x=>x.id===optId); return(o&&o.prize>0)?o.prize:c.prize; }
function _myPickWon(c){
  const p=c.picks?.[ME?.id]; if(!p||!c.winnerOptionId) return false;
  if(_isCompound(c)) return p.participantId===c.winnerParticipantId&&p.optionId===c.winnerOptionId;
  return p.optionId===c.winnerOptionId;
}
function _pickLabel(c,pick){
  if(!pick) return '';
  if(_isCompound(c)){
    const pt=(c.participants||[]).find(x=>x.id===pick.participantId);
    const op=(c.options||[]).find(x=>x.id===pick.optionId);
    return `${pt?.label||'?'} via ${op?.label||'?'}`;
  }
  return (c.options||[]).find(x=>x.id===pick.optionId)?.label||'?';
}
function _winnerLabel(c){
  if(_isCompound(c)){
    const pt=(c.participants||[]).find(x=>x.id===c.winnerParticipantId);
    const op=(c.options||[]).find(x=>x.id===c.winnerOptionId);
    return pt&&op?`${pt.label} via ${op.label}`:'?';
  }
  return (c.options||[]).find(x=>x.id===c.winnerOptionId)?.label||'?';
}

// ── compound grid builders ──
function _ccgVoting(c){
  const pts=c.participants||[], opts=c.options||[];
  const cols=opts.length;
  return`<div class="ccg" style="grid-template-columns:minmax(90px,1.2fr) repeat(${cols},1fr)">
    <div class="ccg-corner">↓ Who / How →</div>
    ${opts.map(o=>`<div class="ccg-opt-hd">${esc(o.label)}${o.prize>0?`<span class="ccg-prize">🦁${o.prize.toLocaleString()}</span>`:''}</div>`).join('')}
    ${pts.map(p=>`
      <div class="ccg-ptc">${esc(p.label)}</div>
      ${opts.map(o=>`<button class="ccg-cell" data-action="pickcontestoption" data-contestid="${c.id}" data-participantid="${p.id}" data-optionid="${o.id}">Pick</button>`).join('')}
    `).join('')}
  </div>`;
}
function _ccgDisplay(c,myPick){
  const pts=c.participants||[], opts=c.options||[];
  const cols=opts.length;
  const res=c.status==='resolved';
  return`<div class="ccg" style="grid-template-columns:minmax(90px,1.2fr) repeat(${cols},1fr)">
    <div class="ccg-corner">↓ Who / How →</div>
    ${opts.map(o=>`<div class="ccg-opt-hd">${esc(o.label)}${o.prize>0?`<span class="ccg-prize">🦁${o.prize.toLocaleString()}</span>`:''}</div>`).join('')}
    ${pts.map(p=>`
      <div class="ccg-ptc">${esc(p.label)}</div>
      ${opts.map(o=>{
        const isMine=myPick?.participantId===p.id&&myPick?.optionId===o.id;
        const isWin=res&&c.winnerParticipantId===p.id&&c.winnerOptionId===o.id;
        const cls='ccg-cell display'+(isMine&&isWin?' mypick winner':isMine?' mypick':isWin?' winner':'');
        return`<div class="${cls}">${isMine&&isWin?'🏆':isWin?'✓':isMine?'👤':''}</div>`;
      }).join('')}
    `).join('')}
  </div>`;
}
function _ccgAdminResolve(c){
  const pts=c.participants||[], opts=c.options||[];
  const cols=opts.length;
  return`<div class="ccg" style="grid-template-columns:minmax(90px,1.2fr) repeat(${cols},1fr)">
    <div class="ccg-corner">↓ Who / How →</div>
    ${opts.map(o=>`<div class="ccg-opt-hd">${esc(o.label)}${o.prize>0?`<span class="ccg-prize">🦁${o.prize.toLocaleString()}</span>`:''}</div>`).join('')}
    ${pts.map(p=>`
      <div class="ccg-ptc">${esc(p.label)}</div>
      ${opts.map(o=>`<button class="ccg-cell admin-res" data-action="resolvecontest" data-contestid="${c.id}" data-participantid="${p.id}" data-optionid="${o.id}">✓ Set</button>`).join('')}
    `).join('')}
  </div>`;
}
function _ccgAdminCorrect(c){
  const pts=c.participants||[], opts=c.options||[];
  const cols=opts.length;
  return`<div class="ccg" style="grid-template-columns:minmax(90px,1.2fr) repeat(${cols},1fr)">
    <div class="ccg-corner">↓ Who / How →</div>
    ${opts.map(o=>`<div class="ccg-opt-hd">${esc(o.label)}</div>`).join('')}
    ${pts.map(p=>`
      <div class="ccg-ptc">${esc(p.label)}</div>
      ${opts.map(o=>{
        const isCur=c.winnerParticipantId===p.id&&c.winnerOptionId===o.id;
        return`<label class="ccg-cell radio-cell${isCur?' winner':''}">
          <input type="radio" name="corrOpt" data-pid="${p.id}" value="${o.id}" ${isCur?'checked':''} />
          ${esc(o.label)}${isCur?'<span style="font-size:9px;display:block;color:var(--muted)">(current)</span>':''}
        </label>`;
      }).join('')}
    `).join('')}
  </div>`;
}

// ── render ──
function renderContests(){
  const contests=(CACHE.contests||[]).slice().sort((a,b)=>{
    if(a.status==='open'&&b.status!=='open') return -1;
    if(a.status!=='open'&&b.status==='open') return 1;
    return b.createdAt-a.createdAt;
  });
  const openCount=(CACHE.contests||[]).filter(c=>c.status==='open').length;
  const totalPrize=(CACHE.contests||[]).filter(c=>c.status==='open').reduce((s,c)=>s+(c.prize||0),0);
  const myWins=(CACHE.contests||[]).filter(c=>c.winnerOptionId&&_myPickWon(c)).length;
  $("page").innerHTML=`
    <div class="contests-hero">
      <span class="contests-hero-icon">🏆</span>
      <div class="contests-hero-title">Prediction Contests</div>
      <div class="contests-hero-sub">Pick the winner · Win LionCoins</div>
      <div class="contests-hero-pills">
        <span class="contests-hero-pill">🟢 ${openCount} Open</span>
        ${totalPrize?`<span class="contests-hero-pill">🦁 ${totalPrize.toLocaleString()} LNC up for grabs</span>`:''}
        ${ME&&myWins?`<span class="contests-hero-pill">🎉 ${myWins} win${myWins!==1?'s':''} so far</span>`:''}
      </div>
    </div>
    ${isAdmin()?`<button class="btn primary" data-action="createcontest" style="margin-bottom:18px">+ New Contest</button>`:''}
    ${contests.length?contests.map(c=>renderContestCard(c)).join(''):`<div class="empty" style="text-align:center;padding:40px 20px"><div style="font-size:48px;margin-bottom:12px">🏆</div><div style="font-size:16px;font-weight:700;margin-bottom:6px">No contests yet</div><div style="color:var(--muted);font-size:14px">The first contest is coming soon — stay tuned!</div></div>`}
  `;
}

function renderContestCard(c){
  const myPick=c.picks?.[ME?.id];
  const myWon=_myPickWon(c);
  const lastCorrection=(c.auditLog||[]).filter(l=>l.action==='corrected').slice(-1)[0];
  const pickCount=Object.keys(c.picks||{}).length;
  const now=Date.now();
  const isDeadlinePassed=c.deadline&&now>c.deadline;
  const isVotingOpen=c.status==='open'&&!isDeadlinePassed;
  const compound=_isCompound(c);

  const stripeClass=c.status==='open'?'open':myWon?'resolved-win':'resolved';
  const fmtDeadline=ts=>new Date(ts).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  const deadlineHtml=c.deadline&&c.status==='open'
    ?`<div class="contest-deadline${isDeadlinePassed?' passed':''}">${isDeadlinePassed?'🕐 Voting ended':'⏰ Vote by'} <b>${fmtDeadline(c.deadline)}</b></div>`:'' ;
  const statusBadge=c.status==='open'
    ?(isDeadlinePassed?'<span class="contest-badge closed">🕐 Voting closed</span>':'<span class="contest-badge open"><span class="contest-badge-dot"></span>Open</span>')
    :'<span class="contest-badge resolved">🏁 Resolved</span>';

  // Prize chip — show range if options have different prizes
  const optPrizes=(c.options||[]).map(o=>o.prize||0).filter(p=>p>0);
  const prizeChip=optPrizes.length>1
    ?`🦁 ${Math.min(...optPrizes).toLocaleString()}–${Math.max(...optPrizes).toLocaleString()} LNC`
    :`🦁 ${c.prize.toLocaleString()} LNC`;

  // ── Options / Grid ──
  let optionsHtml='';
  if(compound){
    if(isVotingOpen&&!myPick) optionsHtml=_ccgVoting(c);
    else optionsHtml=_ccgDisplay(c,myPick);
  } else {
    // Simple mode
    if(isVotingOpen&&!myPick){
      optionsHtml=`<div class="contest-opts">${(c.options||[]).map(o=>`
        <button class="contest-opt" data-action="pickcontestoption" data-contestid="${c.id}" data-optionid="${o.id}">
          <span class="contest-opt-circle"></span>
          <span class="contest-opt-label">${esc(o.label)}${o.prize>0?`<span class="contest-opt-prize"> · 🦁${o.prize.toLocaleString()}</span>`:''}</span>
        </button>`).join('')}</div>`;
    } else {
      optionsHtml=`<div class="contest-opts">${(c.options||[]).map(o=>{
        const isPick=myPick?.optionId===o.id;
        const isWinner=c.winnerOptionId===o.id;
        let cls='contest-opt display'; let badge='';
        if(isPick&&isWinner){cls+=' mypick winner';badge='<span class="contest-opt-badge">✓ Won 🏆</span>';}
        else if(isPick){cls+=' mypick';badge='<span class="contest-opt-badge">✓ Your pick</span>';}
        else if(isWinner){cls+=' winner';badge='<span class="contest-opt-badge">🏆 Winner</span>';}
        return`<div class="${cls}"><span class="contest-opt-label">${esc(o.label)}${o.prize>0?`<span class="contest-opt-prize"> · 🦁${o.prize.toLocaleString()}</span>`:''}</span>${badge}</div>`;
      }).join('')}</div>`;
    }
  }

  // ── Result section ──
  let resultHtml='';
  if(c.status==='resolved'){
    const wonPrize=myPick?_optPrize(c,myPick.optionId):c.prize;
    if(myWon){
      resultHtml=`<div class="contest-result-win">
        <div class="contest-result-win-icon">🎉</div>
        <div class="contest-result-win-title">You got it right!</div>
        <div class="contest-result-win-amount">+${wonPrize.toLocaleString()} LNC</div>
      </div>`;
    } else if(myPick){
      resultHtml=`<div class="contest-result-loss">
        <span style="font-size:22px">😔</span>
        <div><div style="font-weight:700;color:#475569">Better luck next time!</div><div style="margin-top:2px">You picked <b>${esc(_pickLabel(c,myPick))}</b></div></div>
      </div>`;
    } else {
      resultHtml=`<div class="contest-result-noplay">🏁 Winner: <b>${esc(_winnerLabel(c))}</b></div>`;
    }
    if(lastCorrection) resultHtml+=`<div class="contest-correction-note">📝 Result corrected: ${esc(lastCorrection.reason)}</div>`;
  } else if(c.status==='open'&&isDeadlinePassed&&!myPick){
    resultHtml=`<div class="contest-result-locked">🕐 Voting has closed — the admin will announce the result shortly</div>`;
  } else if(c.status==='open'&&myPick){
    resultHtml=`<div class="contest-result-noplay" style="background:rgba(251,122,40,.06);border-color:rgba(251,122,40,.25);color:#C2410C">🔒 Pick locked in: <b>${esc(_pickLabel(c,myPick))}</b> — awaiting result</div>`;
  }

  // ── Admin controls ──
  let adminHtml='';
  if(isAdmin()){
    if(c.status==='open'){
      adminHtml=`<div class="contest-admin"><div class="contest-admin-label">⚙️ Admin — resolve contest</div>`;
      if(compound){
        adminHtml+=_ccgAdminResolve(c);
      } else {
        adminHtml+=`<div style="display:flex;flex-wrap:wrap;gap:6px">${(c.options||[]).map(o=>`<button class="btn sm" data-action="resolvecontest" data-contestid="${c.id}" data-optionid="${o.id}" style="background:#F0FDF4;border:1.5px solid #86EFAC;color:#15803D">✓ ${esc(o.label)}${o.prize>0?` (🦁${o.prize.toLocaleString()})`:''}</button>`).join('')}</div>`;
      }
      adminHtml+=`<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn sm" data-action="setdeadline" data-contestid="${c.id}" style="background:#EFF6FF;border:1.5px solid #93C5FD;color:#1D4ED8">⏰ ${c.deadline?'Change deadline':'Set deadline'}</button>
        <button class="btn sm" data-action="editcontest" data-contestid="${c.id}" style="background:#F5F3FF;border:1.5px solid #C4B5FD;color:#6D28D9">✏️ Edit contest</button>
      </div></div>`;
    } else {
      adminHtml=`<div class="contest-admin">
        <div class="contest-admin-label">⚙️ Admin</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn sm" data-action="correctcontest" data-contestid="${c.id}" style="background:#FEF9C3;border:1.5px solid #FCD34D;color:#92400E">🔧 Correct result</button>
          <button class="btn sm" data-action="editcontest" data-contestid="${c.id}" style="background:#F5F3FF;border:1.5px solid #C4B5FD;color:#6D28D9">✏️ Edit contest</button>
        </div>
        ${(c.auditLog||[]).length?`<details style="margin-top:10px;font-size:12px"><summary style="cursor:pointer;color:#94A3B8">Audit log (${c.auditLog.length})</summary>
          <div style="margin-top:6px">${(c.auditLog||[]).map(l=>`<div style="padding:6px 0;border-top:1px solid #F1F5F9;font-size:12px">${l.action==='corrected'?'🔧':'🏁'} <b>${timeAgo(l.timestamp)}</b> — ${l.action==='corrected'?`"${esc(l.prevWinnerLabel||'?')}" → "${esc(l.newWinnerLabel)}" — ${esc(l.reason)}`:esc(l.newWinnerLabel)}</div>`).join('')}</div>
        </details>`:''}
      </div>`;
    }
  }

  return`<div class="contest-card">
    <div class="contest-card-stripe ${stripeClass}"></div>
    ${c.posterUrl?`<div class="contest-poster" style="background-image:url('${esc(c.posterUrl)}')"></div>`:''}
    <div class="contest-card-body">
      <div class="contest-card-top">
        ${statusBadge}
        <span class="contest-prize-chip">${prizeChip}</span>
      </div>
      ${deadlineHtml}
      <h3 class="contest-title">${esc(c.title)}</h3>
      ${compound?`<div class="ccg-mode-label">📋 Compound prediction — pick participant + method</div>`:''}
      ${optionsHtml}
      ${resultHtml}
      <div class="contest-meta">
        <span>👥 ${pickCount} pick${pickCount!==1?'s':''}</span>
        <span class="contest-meta-sep">·</span>
        <span>${timeAgo(c.createdAt)}</span>
      </div>
      ${adminHtml}
    </div>
  </div>`;
}

// ── Create contest ──
function openCreateContest(){
  if(!isAdmin()) return;
  _ctMode='simple';
  window._ctPosterFile=null;
  const def=new Date(Date.now()+7*864e5); def.setMinutes(0,0,0);
  const pad=n=>String(n).padStart(2,'0');
  const defStr=`${def.getFullYear()}-${pad(def.getMonth()+1)}-${pad(def.getDate())}T${pad(def.getHours())}:00`;
  openOverlay(`<h2>🏆 New Contest</h2>
    <div class="field"><label>Question / Title</label><input class="fb-field" id="ctTitle" placeholder="e.g. Makhachev vs Garry — who wins and how?" /></div>
    <div class="field">
      <label>Poster image (optional)</label>
      <input type="file" id="ctPosterFile" accept="image/*" style="display:none" />
      <div class="ct-poster-pick" id="ctPosterPrev" onclick="$('ctPosterFile').click()">
        <span id="ctPosterHint">📸 Tap to add a poster image</span>
      </div>
    </div>
    <div class="field"><label>Default prize per winner (LNC)</label><input class="fb-field" id="ctPrize" type="number" min="1" step="1" placeholder="e.g. 500" /><div style="font-size:12px;color:var(--muted);margin-top:4px">Used when an option has no specific prize</div></div>
    <div class="field"><label>Voting deadline</label><input class="fb-field" id="ctDeadline" type="datetime-local" value="${defStr}" /><div style="font-size:12px;color:var(--muted);margin-top:4px">Clear to have no deadline</div></div>
    <div class="field">
      <label>Contest type</label>
      <div class="ct-mode-toggle">
        <button class="ct-mode-btn active" data-action="togglectmode" data-mode="simple">Simple<span style="font-size:11px;display:block;font-weight:400">One list of options</span></button>
        <button class="ct-mode-btn" data-action="togglectmode" data-mode="compound">Compound<span style="font-size:11px;display:block;font-weight:400">Participant + Method</span></button>
      </div>
    </div>
    <div id="ctParticipantsSection" style="display:none">
      <div class="field"><label>Participants / Fighters</label>
        <div id="ctParts">
          <input class="fb-field ct-part-in" placeholder="Participant 1 (e.g. Makhachev)" style="margin-bottom:6px" />
          <input class="fb-field ct-part-in" placeholder="Participant 2 (e.g. Garry)" style="margin-bottom:6px" />
        </div>
        <button class="btn sm" data-action="addctparticipant" style="margin-top:4px">+ Add participant</button>
      </div>
    </div>
    <div class="field">
      <label id="ctOptsLabel">Answer options</label>
      <div id="ctOpts">
        <div class="ct-opt-row"><input class="fb-field ct-opt-in" placeholder="Option 1" /><input class="fb-field ct-opt-prize" type="number" min="1" placeholder="Prize (optional)" title="Override prize for this option" /></div>
        <div class="ct-opt-row"><input class="fb-field ct-opt-in" placeholder="Option 2" /><input class="fb-field ct-opt-prize" type="number" min="1" placeholder="Prize (optional)" title="Override prize for this option" /></div>
      </div>
      <button class="btn sm" data-action="addctopt" style="margin-top:4px">+ Add option</button>
    </div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" data-action="docreatecontest">Create Contest</button>
    </div>`);
}

// ── Edit contest ──
function openEditContest(contestId){
  if(!isAdmin()) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId); if(!c) return;
  window._ctEditPosterFile=null;
  const compound=_isCompound(c);
  const pad=n=>String(n).padStart(2,'0');
  const toInputVal=ts=>{const d=new Date(ts);return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
  const deadlineVal=c.deadline?toInputVal(c.deadline):'';
  const optsHtml=(c.options||[]).map((o,i)=>`<div class="ct-opt-row">
    <input class="fb-field ct-opt-in" placeholder="Option ${i+1}" value="${esc(o.label)}" />
    <input class="fb-field ct-opt-prize" type="number" min="1" placeholder="Prize (optional)" value="${o.prize>0?o.prize:''}" />
  </div>`).join('');
  const partsHtml=compound?(c.participants||[]).map((p,i)=>`<input class="fb-field ct-part-in" placeholder="Participant ${i+1}" value="${esc(p.label)}" style="margin-bottom:6px" />`).join(''):'';
  openOverlay(`<h2>✏️ Edit Contest</h2>
    <div class="field"><label>Question / Title</label><input class="fb-field" id="ctTitle" value="${esc(c.title)}" /></div>
    <div class="field">
      <label>Poster image</label>
      <input type="file" id="ctPosterFile" accept="image/*" style="display:none" />
      <div class="ct-poster-pick" id="ctPosterPrev" onclick="$('ctPosterFile').click()"
        style="${c.posterUrl?`background-image:url('${esc(c.posterUrl)}');background-size:cover;background-position:center`:''}" >
        <span id="ctPosterHint" style="${c.posterUrl?'display:none':''}">📸 Tap to change poster</span>
      </div>
      ${c.posterUrl?`<button class="btn sm" data-action="removectposter" data-contestid="${contestId}" style="margin-top:6px;color:#e55;border-color:#e55">✕ Remove poster</button>`:''}
    </div>
    <div class="field"><label>Default prize per winner (LNC)</label><input class="fb-field" id="ctPrize" type="number" min="1" value="${c.prize}" /></div>
    <div class="field"><label>Voting deadline</label><input class="fb-field" id="ctDeadline" type="datetime-local" value="${deadlineVal}" /><div style="font-size:12px;color:var(--muted);margin-top:4px">Clear to remove deadline</div></div>
    ${compound?`<div class="field"><label>Participants</label><div id="ctParts">${partsHtml}</div></div>`:''}
    <div class="field">
      <label id="ctOptsLabel">${compound?'Methods / Outcomes':'Answer options'}</label>
      <div id="ctOpts">${optsHtml}</div>
      <button class="btn sm" data-action="addctopt" style="margin-top:4px">+ Add option</button>
    </div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" data-action="doeditcontest" data-contestid="${contestId}">Save Changes</button>
    </div>`);
}

async function doEditContest(contestId){
  if(!isAdmin()) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId); if(!c) return;
  const title=($('ctTitle')?.value||'').trim();
  const prize=parseInt($('ctPrize')?.value||'0');
  const deadlineVal=($('ctDeadline')?.value||'').trim();
  const deadline=deadlineVal?new Date(deadlineVal).getTime():null;
  if(!title) return toast('Enter a title');
  if(!prize||prize<1) return toast('Enter a valid prize amount');

  const optRows=[...document.querySelectorAll('.ct-opt-row')];
  const options=optRows.map((row,i)=>{
    const label=(row.querySelector('.ct-opt-in')?.value||'').trim();
    const optPrize=parseInt(row.querySelector('.ct-opt-prize')?.value||'0')||0;
    const existing=(c.options||[])[i];
    return label?{id:existing?.id||'o'+i,label,prize:optPrize>0?optPrize:0}:null;
  }).filter(Boolean);
  if(options.length<2) return toast('Need at least 2 options');

  const compound=_isCompound(c);
  let participants=c.participants||[];
  if(compound){
    participants=[...document.querySelectorAll('.ct-part-in')].map((inp,i)=>({id:(c.participants||[])[i]?.id||'p'+i,label:(inp.value||'').trim()})).filter(x=>x.label);
    if(participants.length<2) return toast('Need at least 2 participants');
  }

  try{
    const update={title,prize,deadline:deadline||null,options};
    if(compound) update.participants=participants;
    if(window._ctEditPosterFile){
      const btn=document.querySelector('[data-action="doeditcontest"]');
      if(btn) btn.textContent='Uploading poster…';
      try{ update.posterUrl=await uploadMediaToCloudinary(window._ctEditPosterFile); }
      catch(_e){ toast('Poster upload failed — other changes will still save'); }
      window._ctEditPosterFile=null;
    }
    await fbDB.collection('contests').doc(contestId).update(update);
    closeOverlay(); toast('Contest updated ✓');
  }catch(e){ toast(e.message||'Failed to save changes'); }
}

function toggleCtMode(mode){
  _ctMode=mode;
  document.querySelectorAll('.ct-mode-btn').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  const partsSection=$('ctParticipantsSection');
  const optsLabel=$('ctOptsLabel');
  if(partsSection) partsSection.style.display=mode==='compound'?'':'none';
  if(optsLabel) optsLabel.textContent=mode==='compound'?'Methods / Outcomes (each with optional prize)':'Answer options (each with optional prize)';
}

function addContestParticipant(){
  const list=$('ctParts'); if(!list) return;
  const n=list.querySelectorAll('.ct-part-in').length+1;
  const inp=document.createElement('input');
  inp.className='fb-field ct-part-in'; inp.placeholder=`Participant ${n}`; inp.style.marginBottom='6px';
  list.appendChild(inp); inp.focus();
}

function addContestOption(){
  const list=$('ctOpts'); if(!list) return;
  const n=list.querySelectorAll('.ct-opt-row').length+1;
  const row=document.createElement('div'); row.className='ct-opt-row';
  row.innerHTML=`<input class="fb-field ct-opt-in" placeholder="Option ${n}" /><input class="fb-field ct-opt-prize" type="number" min="1" placeholder="Prize (optional)" title="Override prize for this option" />`;
  list.appendChild(row);
  row.querySelector('.ct-opt-in').focus();
}

async function doCreateContest(){
  if(!isAdmin()) return;
  const title=($('ctTitle')?.value||'').trim();
  const prize=parseInt($('ctPrize')?.value||'0');
  const deadlineVal=($('ctDeadline')?.value||'').trim();
  const deadline=deadlineVal?new Date(deadlineVal).getTime():null;
  if(!title) return toast('Enter a title');
  if(!prize||prize<1) return toast('Enter a valid default prize amount');
  if(deadline&&deadline<=Date.now()) return toast('Deadline must be in the future');

  const optRows=[...document.querySelectorAll('.ct-opt-row')];
  const options=optRows.map((row,i)=>{
    const label=(row.querySelector('.ct-opt-in')?.value||'').trim();
    const optPrize=parseInt(row.querySelector('.ct-opt-prize')?.value||'0')||0;
    return label?{id:'o'+i,label,prize:optPrize>0?optPrize:0}:null;
  }).filter(Boolean);
  if(options.length<2) return toast('Add at least 2 options');

  const compound=_ctMode==='compound';
  let participants=[];
  if(compound){
    participants=[...document.querySelectorAll('.ct-part-in')].map((inp,i)=>({id:'p'+i,label:(inp.value||'').trim()})).filter(x=>x.label);
    if(participants.length<2) return toast('Add at least 2 participants for compound mode');
  }

  try{
    const doc={
      title,prize,deadline:deadline||null,
      options,
      status:'open',winnerOptionId:null,picks:{},auditLog:[],
      createdAt:Date.now(),createdBy:ME.id,resolvedAt:null
    };
    if(compound){ doc.mode='compound'; doc.participants=participants; doc.winnerParticipantId=null; }
    else { doc.mode='simple'; }
    if(window._ctPosterFile){
      const btn=document.querySelector('[data-action="docreatecontest"]');
      if(btn) btn.textContent='Uploading poster…';
      try{ doc.posterUrl=await uploadMediaToCloudinary(window._ctPosterFile); }
      catch(_e){ toast('Poster upload failed — contest will be created without it'); }
      window._ctPosterFile=null;
    }
    await fbDB.collection('contests').add(doc);
    closeOverlay(); toast('Contest created! 🏆');
  }catch(e){ toast(e.message||'Failed to create contest'); }
}

// ── Pick ──
function openPickOption(contestId, optionId, participantId){
  if(!ME) return openEmailAuth();
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  const opt=c?.options?.find(o=>o.id===optionId);
  if(!c||!opt||c.status!=='open'||c.picks?.[ME.id]) return;
  if(c.deadline&&Date.now()>c.deadline) return toast('⏰ Voting deadline has passed for this contest');
  const compound=_isCompound(c);
  const pt=compound?(c.participants||[]).find(p=>p.id===participantId):null;
  if(compound&&!pt) return toast('Invalid participant');
  const pickLabel=compound?`${pt.label} via ${opt.label}`:opt.label;
  const winPrize=_optPrize(c,optionId);
  openOverlay(`<div style="text-align:center;padding:8px 0">
    <div style="font-size:40px;margin-bottom:10px">🏆</div>
    <h2 style="margin-bottom:8px">Confirm your pick</h2>
    <p class="sub" style="margin:0 0 12px">You are picking:</p>
    <div style="font-size:18px;font-weight:800;margin-bottom:14px">${esc(pickLabel)}</div>
    <p style="font-weight:600;margin:0 0 6px">${esc(c.title)}</p>
    <div style="display:inline-block;background:rgba(255,165,0,.12);border-radius:8px;padding:6px 16px;font-size:13px;margin-bottom:16px;color:var(--orange-deep)">Prize if correct: 🦁 ${winPrize.toLocaleString()} LNC</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:22px">⚠️ This pick is <b>final</b> — you cannot change it after confirming.</p>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" data-action="confirmcontestpick" data-contestid="${contestId}" data-optionid="${optionId}" ${compound?`data-participantid="${participantId}"`:''}> Confirm Pick ✓</button>
    </div>
  </div>`);
}

async function doContestPick(contestId, optionId, participantId){
  if(!ME) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  if(!c||c.status!=='open'||c.picks?.[ME.id]) return;
  if(c.deadline&&Date.now()>c.deadline) return toast('⏰ Voting deadline has passed');
  const compound=_isCompound(c);
  if(compound&&!participantId) return toast('Invalid pick — missing participant');
  const pick={optionId,confirmedAt:Date.now(),credited:false,creditAmount:0};
  if(compound) pick.participantId=participantId;
  try{
    await fbDB.collection('contests').doc(contestId).update({[`picks.${ME.id}`]:pick});
    closeOverlay(); toast('Pick locked in! Good luck 🍀');
  }catch(e){ toast(e.message||'Failed to save pick'); }
}

// ── Deadline ──
function openSetDeadline(contestId){
  if(!isAdmin()) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  if(!c) return;
  const pad=n=>String(n).padStart(2,'0');
  const toInputVal=ts=>{const d=new Date(ts);return`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
  const existing=c.deadline?toInputVal(c.deadline):'';
  openOverlay(`<div style="padding:8px 0">
    <h2 style="margin-bottom:6px">⏰ ${c.deadline?'Change':'Set'} voting deadline</h2>
    <p class="sub" style="margin:0 0 16px">${esc(c.title)}</p>
    <div class="field"><label>Deadline</label><input class="fb-field" id="dlInput" type="datetime-local" value="${existing}" /></div>
    <p style="font-size:12px;color:var(--muted);margin:4px 0 18px">Leave blank to remove the deadline.</p>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" data-action="confirmsetdeadline" data-contestid="${contestId}">Save deadline</button>
    </div>
  </div>`);
}

async function doSetDeadline(contestId){
  if(!isAdmin()) return;
  const val=($('dlInput')?.value||'').trim();
  const deadline=val?new Date(val).getTime():null;
  if(deadline&&deadline<=Date.now()) return toast('Deadline must be in the future');
  try{
    await fbDB.collection('contests').doc(contestId).update({deadline:deadline||null});
    closeOverlay(); toast(deadline?'Deadline saved':'Deadline removed');
  }catch(e){ toast(e.message||'Failed to save deadline'); }
}

// ── Resolve ──
function openResolveContest(contestId, optionId, participantId){
  if(!isAdmin()) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  const opt=c?.options?.find(o=>o.id===optionId);
  if(!c||!opt) return;
  const compound=_isCompound(c);
  const pt=compound?(c.participants||[]).find(p=>p.id===participantId):null;
  if(compound&&!pt) return toast('Invalid participant');
  const winLabel=compound?`${pt.label} via ${opt.label}`:opt.label;
  const winPrize=_optPrize(c,optionId);
  const picks=c.picks||{};
  const winners=compound
    ?Object.entries(picks).filter(([,p])=>p.participantId===participantId&&p.optionId===optionId&&!p.credited)
    :Object.entries(picks).filter(([,p])=>p.optionId===optionId&&!p.credited);
  openOverlay(`<div style="text-align:center;padding:8px 0">
    <div style="font-size:40px;margin-bottom:10px">🏆</div>
    <h2 style="margin-bottom:8px">Resolve Contest</h2>
    <p class="sub" style="margin:0 0 12px">Setting winner as:</p>
    <div style="font-size:18px;font-weight:800;margin-bottom:14px">${esc(winLabel)}</div>
    <p style="font-weight:600;margin:0 0 16px">${esc(c.title)}</p>
    <p style="font-size:13px;color:var(--muted);margin-bottom:22px">${winners.length} user${winners.length!==1?'s':''} will receive <b>🦁 ${winPrize.toLocaleString()} LNC</b> each.</p>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" data-action="confirmresolvecontest" data-contestid="${contestId}" data-optionid="${optionId}" ${compound?`data-participantid="${participantId}"`:''}> Resolve Contest</button>
    </div>
  </div>`);
}

async function doResolveContest(contestId, optionId, participantId){
  if(!isAdmin()) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  if(!c||c.status==='resolved') return;
  const opt=c.options.find(o=>o.id===optionId);
  const compound=_isCompound(c);
  const pt=compound?(c.participants||[]).find(p=>p.id===participantId):null;
  if(compound&&!pt) return toast('Invalid participant');
  const winLabel=compound?`${pt.label} via ${opt?.label||''}`:opt?.label||'';
  const winPrize=_optPrize(c,optionId);
  try{
    const update={status:'resolved',winnerOptionId:optionId,resolvedAt:Date.now(),
      auditLog:firebase.firestore.FieldValue.arrayUnion({timestamp:Date.now(),action:'resolved',prevOptionId:null,prevWinnerLabel:null,newOptionId:optionId,newWinnerLabel:winLabel,newParticipantId:participantId||null,reason:''})};
    if(compound) update.winnerParticipantId=participantId;
    await fbDB.collection('contests').doc(contestId).update(update);
    const picks=c.picks||{};
    const winners=compound
      ?Object.entries(picks).filter(([,p])=>p.participantId===participantId&&p.optionId===optionId&&!p.credited)
      :Object.entries(picks).filter(([,p])=>p.optionId===optionId&&!p.credited);
    for(const [uid] of winners){
      await WALLET.credit(uid,winPrize,'contest_win',`Won: ${c.title}`,contestId);
      await fbDB.collection('contests').doc(contestId).update({[`picks.${uid}.credited`]:true,[`picks.${uid}.creditAmount`]:winPrize});
    }
    closeOverlay(); toast(`Resolved! ${winners.length} winner${winners.length!==1?'s':''} credited 🏆`);
  }catch(e){ console.error('resolveContest',e); toast(e.message||'Failed to resolve'); }
}

// ── Correct result ──
function openCorrectContest(contestId){
  if(!isAdmin()) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  if(!c||c.status!=='resolved') return;
  const compound=_isCompound(c);
  const winnerOpt=c.options.find(o=>o.id===c.winnerOptionId);
  openOverlay(`<h2>🔧 Correct Contest Result</h2>
    <p class="sub" style="margin:8px 0 14px">${esc(c.title)}</p>
    <div style="padding:10px 12px;background:var(--surface-2);border-radius:8px;font-size:13px;margin-bottom:14px">
      Current winner: <b>${esc(_winnerLabel(c))}</b>
    </div>
    <div class="field"><label>Select the correct winner</label>
      <div style="margin-top:8px">
        ${compound?_ccgAdminCorrect(c):(c.options||[]).map(o=>`<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer">
          <input type="radio" name="corrOpt" value="${o.id}" ${o.id===c.winnerOptionId?'checked':''} />
          ${esc(o.label)}${o.id===c.winnerOptionId?' <span style="color:var(--muted);font-size:11px">(current)</span>':''}
        </label>`).join('')}
      </div>
    </div>
    <div class="field"><label>Reason for correction <span style="color:#e55;font-weight:400">(required)</span></label>
      <textarea class="fb-field" id="corrReason" rows="3" placeholder="e.g. Wrong option selected by mistake" style="margin-top:4px"></textarea>
    </div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" data-action="submitcorrection" data-contestid="${contestId}">Review Correction →</button>
    </div>`);
}

function submitCorrection(contestId){
  const selOpt=document.querySelector('input[name="corrOpt"]:checked');
  const reason=($('corrReason')?.value||'').trim();
  if(!selOpt) return toast('Select the correct winner');
  if(!reason) return toast('Reason is required');
  const newOptionId=selOpt.value;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  if(!c) return;
  const compound=_isCompound(c);
  const newParticipantId=compound?(selOpt.dataset.pid||null):null;
  const isSame=compound
    ?(newOptionId===c.winnerOptionId&&newParticipantId===c.winnerParticipantId)
    :(newOptionId===c.winnerOptionId);
  if(isSame) return toast('This is already the current winner');
  const oldOpt=c.options.find(o=>o.id===c.winnerOptionId);
  const newOpt=c.options.find(o=>o.id===newOptionId);
  const oldPt=compound?(c.participants||[]).find(p=>p.id===c.winnerParticipantId):null;
  const newPt=compound?(c.participants||[]).find(p=>p.id===newParticipantId):null;
  const oldLabel=compound?`${oldPt?.label||'?'} via ${oldOpt?.label||'?'}`:oldOpt?.label||'?';
  const newLabel=compound?`${newPt?.label||'?'} via ${newOpt?.label||'?'}`:newOpt?.label||'?';
  _pendingCorrection={contestId,newOptionId,newParticipantId,reason};
  openOverlay(`<div style="text-align:center;padding:8px 0">
    <div style="font-size:40px;margin-bottom:10px">⚠️</div>
    <h2 style="margin-bottom:8px">Confirm Correction</h2>
    <p class="sub" style="margin:0 0 12px">Changing winner from <b>${esc(oldLabel)}</b> → <b>${esc(newLabel)}</b></p>
    <div style="background:var(--surface-2);border-radius:8px;padding:10px 12px;font-size:13px;margin:12px 0;text-align:left">Reason: <i>${esc(reason)}</i></div>
    <p style="font-size:13px;color:#e55;margin-bottom:22px">LNC will be reversed from previous winners and re-credited to the correct winners.</p>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" data-action="confirmcorrection">Confirm Correction</button>
    </div>
  </div>`);
}

async function doCorrectContest(){
  if(!isAdmin()||!_pendingCorrection) return;
  const {contestId,newOptionId,newParticipantId,reason}=_pendingCorrection;
  _pendingCorrection=null;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  if(!c||c.status!=='resolved') return;
  const compound=_isCompound(c);
  const oldOptionId=c.winnerOptionId;
  const oldParticipantId=c.winnerParticipantId||null;
  const oldOpt=c.options.find(o=>o.id===oldOptionId);
  const newOpt=c.options.find(o=>o.id===newOptionId);
  const oldPt=compound?(c.participants||[]).find(p=>p.id===oldParticipantId):null;
  const newPt=compound?(c.participants||[]).find(p=>p.id===newParticipantId):null;
  const oldLabel=compound?`${oldPt?.label||'?'} via ${oldOpt?.label||'?'}`:oldOpt?.label||'?';
  const newLabel=compound?`${newPt?.label||'?'} via ${newOpt?.label||'?'}`:newOpt?.label||'?';
  try{
    const auditEntry={timestamp:Date.now(),action:'corrected',prevOptionId:oldOptionId,prevWinnerLabel:oldLabel,newOptionId,newWinnerLabel:newLabel,newParticipantId:newParticipantId||null,reason};
    const update={winnerOptionId:newOptionId,auditLog:firebase.firestore.FieldValue.arrayUnion(auditEntry)};
    if(compound) update.winnerParticipantId=newParticipantId;
    await fbDB.collection('contests').doc(contestId).update(update);
    const picks=c.picks||{};
    const isOldWinner=compound
      ?(([,p])=>p.participantId===oldParticipantId&&p.optionId===oldOptionId&&p.credited)
      :(([,p])=>p.optionId===oldOptionId&&p.credited);
    const isNewWinner=compound
      ?(([,p])=>p.participantId===newParticipantId&&p.optionId===newOptionId&&!p.credited)
      :(([,p])=>p.optionId===newOptionId&&!p.credited);
    const oldWinners=Object.entries(picks).filter(isOldWinner);
    const newWinners=Object.entries(picks).filter(isNewWinner);
    const oldPrize=_optPrize(c,oldOptionId);
    const newPrize=_optPrize(c,newOptionId);
    for(const [uid,pick] of oldWinners){
      await WALLET.debit(uid,pick.creditAmount||oldPrize,'contest_correction',`Correction: ${c.title}`,contestId);
      await fbDB.collection('contests').doc(contestId).update({[`picks.${uid}.credited`]:false,[`picks.${uid}.creditAmount`]:0});
    }
    for(const [uid] of newWinners){
      await WALLET.credit(uid,newPrize,'contest_win',`Correction win: ${c.title}`,contestId);
      await fbDB.collection('contests').doc(contestId).update({[`picks.${uid}.credited`]:true,[`picks.${uid}.creditAmount`]:newPrize});
    }
    closeOverlay(); toast(`Corrected — ${oldWinners.length} reversed, ${newWinners.length} credited ✓`);
  }catch(e){ console.error('correctContest',e); toast(e.message||'Correction failed'); }
}

// ============ END CONTESTS ============
