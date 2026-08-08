// ============================================================
//  community-contests.js — Contest creation, voting, resolution
//  Loaded after community-wallet.js.
// ============================================================

// ============ CONTESTS ============

let _pendingCorrection=null;

function renderContests(){
  const contests=(CACHE.contests||[]).slice().sort((a,b)=>{
    if(a.status==='open'&&b.status!=='open') return -1;
    if(a.status!=='open'&&b.status==='open') return 1;
    return b.createdAt-a.createdAt;
  });
  const openCount=(CACHE.contests||[]).filter(c=>c.status==='open').length;
  const totalPrize=(CACHE.contests||[]).filter(c=>c.status==='open').reduce((s,c)=>s+(c.prize||0),0);
  const myWins=(CACHE.contests||[]).filter(c=>c.winnerOptionId&&c.picks?.[ME?.id]?.optionId===c.winnerOptionId).length;
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
  const winnerOpt=c.options?.find(o=>o.id===c.winnerOptionId);
  const myOpt=c.options?.find(o=>o.id===myPick?.optionId);
  const myWon=myPick&&c.winnerOptionId&&myPick.optionId===c.winnerOptionId;
  const lastCorrection=(c.auditLog||[]).filter(l=>l.action==='corrected').slice(-1)[0];
  const pickCount=Object.keys(c.picks||{}).length;
  const now=Date.now();
  const isDeadlinePassed=c.deadline&&now>c.deadline;
  const isVotingOpen=c.status==='open'&&!isDeadlinePassed;

  // Stripe color: green if I won, orange if open, gray if resolved
  const stripeClass=c.status==='open'?'open':myWon?'resolved-win':'resolved';

  // Deadline display
  const fmtDeadline=ts=>new Date(ts).toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});
  const deadlineHtml=c.deadline&&c.status==='open'
    ?`<div class="contest-deadline${isDeadlinePassed?' passed':''}">${isDeadlinePassed?'🕐 Voting ended':'⏰ Vote by'} <b>${fmtDeadline(c.deadline)}</b></div>`
    :'';

  // Status badge
  const statusBadge=c.status==='open'
    ?(isDeadlinePassed
      ?'<span class="contest-badge closed">🕐 Voting closed</span>'
      :'<span class="contest-badge open"><span class="contest-badge-dot"></span>Open</span>')
    :'<span class="contest-badge resolved">🏁 Resolved</span>';

  // Options
  let optionsHtml='';
  if(isVotingOpen&&ME&&!myPick){
    // Interactive pick buttons
    optionsHtml=`<div class="contest-opts">${(c.options||[]).map(o=>`
      <button class="contest-opt" data-action="pickcontestoption" data-contestid="${c.id}" data-optionid="${o.id}">
        <span class="contest-opt-circle"></span>
        <span class="contest-opt-label">${esc(o.label)}</span>
      </button>`).join('')}</div>`;
  } else {
    // Display mode (after pick or resolved)
    optionsHtml=`<div class="contest-opts">${(c.options||[]).map(o=>{
      const isPick=myPick?.optionId===o.id;
      const isWinner=c.winnerOptionId===o.id;
      let cls='contest-opt display';
      let badge='';
      if(isPick&&isWinner){cls+=' mypick winner';badge='<span class="contest-opt-badge">✓ Won 🏆</span>';}
      else if(isPick){cls+=' mypick';badge='<span class="contest-opt-badge">✓ Your pick</span>';}
      else if(isWinner){cls+=' winner';badge='<span class="contest-opt-badge">🏆 Winner</span>';}
      return `<div class="${cls}"><span class="contest-opt-label">${esc(o.label)}</span>${badge}</div>`;
    }).join('')}</div>`;
  }

  // Result section
  let resultHtml='';
  if(c.status==='resolved'){
    if(myWon){
      resultHtml=`<div class="contest-result-win">
        <div class="contest-result-win-icon">🎉</div>
        <div class="contest-result-win-title">You got it right!</div>
        <div class="contest-result-win-amount">+${c.prize.toLocaleString()} LNC</div>
      </div>`;
    } else if(myPick){
      resultHtml=`<div class="contest-result-loss">
        <span style="font-size:22px">😔</span>
        <div><div style="font-weight:700;color:#475569">Better luck next time!</div><div style="margin-top:2px">You picked <b>${esc(myOpt?.label||'?')}</b></div></div>
      </div>`;
    } else {
      resultHtml=`<div class="contest-result-noplay">🏁 Winner: <b>${esc(winnerOpt?.label||'?')}</b></div>`;
    }
    if(lastCorrection) resultHtml+=`<div class="contest-correction-note">📝 Result corrected: ${esc(lastCorrection.reason)}</div>`;
  } else if(c.status==='open'&&isDeadlinePassed&&!myPick){
    resultHtml=`<div class="contest-result-locked">🕐 Voting has closed — the admin will announce the result shortly</div>`;
  } else if(c.status==='open'&&myPick){
    resultHtml=`<div class="contest-result-noplay" style="background:rgba(251,122,40,.06);border-color:rgba(251,122,40,.25);color:#C2410C">🔒 Pick locked in — awaiting result</div>`;
  }

  // Admin controls
  let adminHtml='';
  if(isAdmin()){
    if(c.status==='open'){
      adminHtml=`<div class="contest-admin">
        <div class="contest-admin-label">⚙️ Admin — resolve contest</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${(c.options||[]).map(o=>`<button class="btn sm" data-action="resolvecontest" data-contestid="${c.id}" data-optionid="${o.id}" style="background:#F0FDF4;border:1.5px solid #86EFAC;color:#15803D">✓ ${esc(o.label)}</button>`).join('')}</div>
        <button class="btn sm" data-action="setdeadline" data-contestid="${c.id}" style="margin-top:8px;background:#EFF6FF;border:1.5px solid #93C5FD;color:#1D4ED8">⏰ ${c.deadline?'Change deadline':'Set deadline'}</button>
      </div>`;
    } else {
      adminHtml=`<div class="contest-admin">
        <div class="contest-admin-label">⚙️ Admin</div>
        <button class="btn sm" data-action="correctcontest" data-contestid="${c.id}" style="background:#FEF9C3;border:1.5px solid #FCD34D;color:#92400E">🔧 Correct result</button>
        ${(c.auditLog||[]).length?`<details style="margin-top:10px;font-size:12px"><summary style="cursor:pointer;color:#94A3B8">Audit log (${c.auditLog.length})</summary>
          <div style="margin-top:6px">${(c.auditLog||[]).map(l=>`<div style="padding:6px 0;border-top:1px solid #F1F5F9;font-size:12px">${l.action==='corrected'?'🔧':'🏁'} <b>${timeAgo(l.timestamp)}</b> — ${l.action==='corrected'?`"${esc(l.prevWinnerLabel||'?')}" → "${esc(l.newWinnerLabel)}" — ${esc(l.reason)}`:esc(l.newWinnerLabel)}</div>`).join('')}</div>
        </details>`:''}
      </div>`;
    }
  }

  return `<div class="contest-card">
    <div class="contest-card-stripe ${stripeClass}"></div>
    <div class="contest-card-body">
      <div class="contest-card-top">
        ${statusBadge}
        <span class="contest-prize-chip">🦁 ${c.prize.toLocaleString()} LNC</span>
      </div>
      ${deadlineHtml}
      <h3 class="contest-title">${esc(c.title)}</h3>
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

function openCreateContest(){
  if(!isAdmin()) return;
  // Default deadline = 7 days from now, rounded to nearest hour
  const def=new Date(Date.now()+7*864e5); def.setMinutes(0,0,0);
  const pad=n=>String(n).padStart(2,'0');
  const defStr=`${def.getFullYear()}-${pad(def.getMonth()+1)}-${pad(def.getDate())}T${pad(def.getHours())}:00`;
  openOverlay(`<h2>🏆 New Contest</h2>
    <div class="field"><label>Question / Title</label><input class="fb-field" id="ctTitle" placeholder="e.g. Who will win the World Cup?" /></div>
    <div class="field"><label>Prize per winner (LNC)</label><input class="fb-field" id="ctPrize" type="number" min="1" step="1" placeholder="e.g. 5000" /></div>
    <div class="field"><label>Voting deadline</label><input class="fb-field" id="ctDeadline" type="datetime-local" value="${defStr}" /><div style="font-size:12px;color:var(--muted);margin-top:4px">Clear this field to have no deadline</div></div>
    <div class="field"><label>Answer options</label>
      <div id="ctOpts">
        <input class="fb-field ct-opt-in" placeholder="Option 1" style="margin-bottom:6px" />
        <input class="fb-field ct-opt-in" placeholder="Option 2" style="margin-bottom:6px" />
      </div>
      <button class="btn sm" data-action="addctopt" style="margin-top:4px">+ Add option</button>
    </div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" data-action="docreatecontest">Create Contest</button>
    </div>`);
}

function addContestOption(){
  const list=$('ctOpts'); if(!list) return;
  const n=list.querySelectorAll('.ct-opt-in').length+1;
  const inp=document.createElement('input');
  inp.className='fb-field ct-opt-in'; inp.placeholder=`Option ${n}`; inp.style.marginBottom='6px';
  list.appendChild(inp); inp.focus();
}

async function doCreateContest(){
  if(!isAdmin()) return;
  const title=($('ctTitle')?.value||'').trim();
  const prize=parseInt($('ctPrize')?.value||'0');
  const labels=[...document.querySelectorAll('.ct-opt-in')].map(i=>i.value.trim()).filter(Boolean);
  const deadlineVal=($('ctDeadline')?.value||'').trim();
  const deadline=deadlineVal?new Date(deadlineVal).getTime():null;
  if(!title) return toast('Enter a title');
  if(!prize||prize<1) return toast('Enter a valid prize amount');
  if(labels.length<2) return toast('Add at least 2 options');
  if(deadline&&deadline<=Date.now()) return toast('Deadline must be in the future');
  try{
    await fbDB.collection('contests').add({
      title,prize,deadline:deadline||null,
      options:labels.map((label,i)=>({id:'o'+i,label})),
      status:'open',winnerOptionId:null,picks:{},auditLog:[],
      createdAt:Date.now(),createdBy:ME.id,resolvedAt:null
    });
    closeOverlay(); toast('Contest created! 🏆');
  }catch(e){ toast(e.message||'Failed to create contest'); }
}

function openPickOption(contestId,optionId){
  if(!ME) return openEmailAuth();
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  const opt=c?.options?.find(o=>o.id===optionId);
  if(!c||!opt||c.status!=='open'||c.picks?.[ME.id]) return;
  if(c.deadline&&Date.now()>c.deadline) return toast('⏰ Voting deadline has passed for this contest');
  openOverlay(`<div style="text-align:center;padding:8px 0">
    <div style="font-size:40px;margin-bottom:10px">🏆</div>
    <h2 style="margin-bottom:8px">Validate your answer</h2>
    <p class="sub" style="margin:0 0 12px">Picking <b>${esc(opt.label)}</b> for:</p>
    <p style="font-weight:700;margin:0 0 14px">${esc(c.title)}</p>
    <div style="display:inline-block;background:rgba(255,165,0,.12);border-radius:8px;padding:6px 16px;font-size:13px;margin-bottom:16px;color:var(--orange-deep)">Prize if correct: 🦁 ${c.prize.toLocaleString()} LNC</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:22px">⚠️ This pick is <b>final</b> — you cannot change it after confirming.</p>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" data-action="confirmcontestpick" data-contestid="${contestId}" data-optionid="${optionId}">Confirm Pick ✓</button>
    </div>
  </div>`);
}

async function doContestPick(contestId,optionId){
  if(!ME) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  if(!c||c.status!=='open'||c.picks?.[ME.id]) return;
  if(c.deadline&&Date.now()>c.deadline) return toast('⏰ Voting deadline has passed');
  try{
    await fbDB.collection('contests').doc(contestId).update({
      [`picks.${ME.id}`]:{optionId,confirmedAt:Date.now(),credited:false,creditAmount:0}
    });
    closeOverlay(); toast('Pick locked in! Good luck 🍀');
  }catch(e){ toast(e.message||'Failed to save pick'); }
}

function openSetDeadline(contestId){
  if(!isAdmin()) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  if(!c) return;
  const pad=n=>String(n).padStart(2,'0');
  const toInputVal=ts=>{const d=new Date(ts);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;};
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
    await db.collection('contests').doc(contestId).update({deadline:deadline||null});
    closeOverlay();
    toast(deadline?'Deadline saved':'Deadline removed');
  }catch(e){ toast(e.message||'Failed to save deadline'); }
}

function openResolveContest(contestId,optionId){
  if(!isAdmin()) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  const opt=c?.options?.find(o=>o.id===optionId);
  if(!c||!opt) return;
  openOverlay(`<div style="text-align:center;padding:8px 0">
    <div style="font-size:40px;margin-bottom:10px">🏆</div>
    <h2 style="margin-bottom:8px">Validate your answer</h2>
    <p class="sub" style="margin:0 0 12px">Setting <b>${esc(opt.label)}</b> as the winner for:</p>
    <p style="font-weight:700;margin:0 0 16px">${esc(c.title)}</p>
    <p style="font-size:13px;color:var(--muted);margin-bottom:22px">All users who picked this option will receive <b>🦁 ${c.prize.toLocaleString()} LNC</b> each.</p>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" data-action="confirmresolvecontest" data-contestid="${contestId}" data-optionid="${optionId}">Resolve Contest</button>
    </div>
  </div>`);
}

async function doResolveContest(contestId,optionId){
  if(!isAdmin()) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  if(!c||c.status==='resolved') return;
  const opt=c.options.find(o=>o.id===optionId);
  try{
    const auditEntry={timestamp:Date.now(),action:'resolved',prevOptionId:null,prevWinnerLabel:null,newOptionId:optionId,newWinnerLabel:opt?.label||'',reason:''};
    await fbDB.collection('contests').doc(contestId).update({
      status:'resolved',winnerOptionId:optionId,resolvedAt:Date.now(),
      auditLog:firebase.firestore.FieldValue.arrayUnion(auditEntry)
    });
    const picks=c.picks||{};
    const winners=Object.entries(picks).filter(([uid,p])=>p.optionId===optionId&&!p.credited);
    for(const [uid] of winners){
      await WALLET.credit(uid,c.prize,'contest_win',`Won: ${c.title}`,contestId);
      await fbDB.collection('contests').doc(contestId).update({[`picks.${uid}.credited`]:true,[`picks.${uid}.creditAmount`]:c.prize});
    }
    closeOverlay(); toast(`Resolved! ${winners.length} winner${winners.length!==1?'s':''} credited 🏆`);
  }catch(e){ console.error('resolveContest',e); toast(e.message||'Failed to resolve'); }
}

function openCorrectContest(contestId){
  if(!isAdmin()) return;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  if(!c||c.status!=='resolved') return;
  const winnerOpt=c.options.find(o=>o.id===c.winnerOptionId);
  openOverlay(`<h2>🔧 Correct Contest Result</h2>
    <p class="sub" style="margin:8px 0 14px">${esc(c.title)}</p>
    <div style="padding:10px 12px;background:var(--surface-2);border-radius:8px;font-size:13px;margin-bottom:14px">
      Current winner: <b>${esc(winnerOpt?.label||'?')}</b>
    </div>
    <div class="field"><label>Select the correct winner</label>
      <div style="margin-top:8px">
        ${(c.options||[]).map(o=>`<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer">
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
  if(newOptionId===c.winnerOptionId) return toast('This is already the current winner');
  const oldOpt=c.options.find(o=>o.id===c.winnerOptionId);
  const newOpt=c.options.find(o=>o.id===newOptionId);
  _pendingCorrection={contestId,newOptionId,reason};
  openOverlay(`<div style="text-align:center;padding:8px 0">
    <div style="font-size:40px;margin-bottom:10px">⚠️</div>
    <h2 style="margin-bottom:8px">Validate your answer</h2>
    <p class="sub" style="margin:0 0 12px">Changing winner from <b>${esc(oldOpt?.label||'?')}</b> → <b>${esc(newOpt?.label||'?')}</b></p>
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
  const {contestId,newOptionId,reason}=_pendingCorrection;
  _pendingCorrection=null;
  const c=(CACHE.contests||[]).find(x=>x.id===contestId);
  if(!c||c.status!=='resolved') return;
  const oldOptionId=c.winnerOptionId;
  const oldOpt=c.options.find(o=>o.id===oldOptionId);
  const newOpt=c.options.find(o=>o.id===newOptionId);
  try{
    const auditEntry={timestamp:Date.now(),action:'corrected',prevOptionId:oldOptionId,prevWinnerLabel:oldOpt?.label||'',newOptionId,newWinnerLabel:newOpt?.label||'',reason};
    await fbDB.collection('contests').doc(contestId).update({
      winnerOptionId:newOptionId,
      auditLog:firebase.firestore.FieldValue.arrayUnion(auditEntry)
    });
    const picks=c.picks||{};
    const oldWinners=Object.entries(picks).filter(([uid,p])=>p.optionId===oldOptionId&&p.credited);
    const newWinners=Object.entries(picks).filter(([uid,p])=>p.optionId===newOptionId&&!p.credited);
    for(const [uid,pick] of oldWinners){
      await WALLET.debit(uid,pick.creditAmount||c.prize,'contest_correction',`Correction: ${c.title}`,contestId);
      await fbDB.collection('contests').doc(contestId).update({[`picks.${uid}.credited`]:false,[`picks.${uid}.creditAmount`]:0});
    }
    for(const [uid] of newWinners){
      await WALLET.credit(uid,c.prize,'contest_win',`Correction win: ${c.title}`,contestId);
      await fbDB.collection('contests').doc(contestId).update({[`picks.${uid}.credited`]:true,[`picks.${uid}.creditAmount`]:c.prize});
    }
    closeOverlay(); toast(`Corrected — ${oldWinners.length} reversed, ${newWinners.length} credited ✓`);
  }catch(e){ console.error('correctContest',e); toast(e.message||'Correction failed'); }
}

// ============ END CONTESTS ============
