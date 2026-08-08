// ============================================================
//  community-wallet.js — LionCoin WALLET, transfers, transactions
//  Loaded after community.js.
// ============================================================

// ============ LIONCOIN WALLET ============
const WALLET={
  async credit(uid,amount,type,description,ref=''){
    if(!uid||amount<=0) return;
    const F=firebase.firestore.FieldValue;
    const wRef=fbDB.collection('wallets').doc(uid);
    try{
      await fbDB.runTransaction(async t=>{
        // F.increment on a missing field treats it as 0 — no read needed for new or existing wallets
        t.set(wRef,{balance:F.increment(amount),totalEarned:F.increment(amount)},{merge:true});
      });
      fbDB.collection('wallets').doc(uid).collection('transactions').add({type,amount,description,ref,createdAt:Date.now()}).catch(()=>{});
    }catch(e){console.warn('WALLET.credit',e);}
  },
  async debit(uid,amount,type,description,ref=''){
    if(!uid||amount<=0) return false;
    const F=firebase.firestore.FieldValue;
    const wRef=fbDB.collection('wallets').doc(uid);
    let ok=false;
    try{
      await fbDB.runTransaction(async t=>{
        const snap=await t.get(wRef);
        if(!snap.exists||(snap.data().balance||0)<amount) throw new Error('Insufficient balance');
        t.update(wRef,{balance:F.increment(-amount),totalSpent:F.increment(amount)});
        ok=true;
      });
      if(ok) fbDB.collection('wallets').doc(uid).collection('transactions').add({type,amount:-amount,description,ref,createdAt:Date.now()}).catch(()=>{});
    }catch(e){console.warn('WALLET.debit',e);}
    return ok;
  }
};

async function logTrackView(trackId,authorUid){
  if(!ME||!authorUid||ME.id===authorUid) return;
  const today=new Date().toISOString().slice(0,10);
  const logRef=fbDB.collection('viewLogs').doc(trackId+'_'+ME.id+'_'+today);
  try{
    await fbDB.runTransaction(async t=>{
      if((await t.get(logRef)).exists) throw new Error('already viewed');
      t.set(logRef,{trackId,viewerUid:ME.id,authorUid,date:today,createdAt:Date.now()});
    });
    WALLET.credit(authorUid,1,'track_view','Track view',trackId);
  }catch{}
}

async function checkLoginReward(uid){
  const today=new Date().toISOString().slice(0,10);
  const F=firebase.firestore.FieldValue;
  const wRef=fbDB.collection('wallets').doc(uid);
  try{
    let newStreak=1; let credited=false;
    await fbDB.runTransaction(async t=>{
      const snap=await t.get(wRef); const d=snap.exists?snap.data():{};
      if(d.lastLoginDate===today) return;
      const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
      newStreak=d.lastLoginDate===yesterday?(d.streak||0)+1:1;
      const upd={balance:F.increment(2),totalEarned:F.increment(2),streak:newStreak,lastLoginDate:today};
      if(snap.exists) t.update(wRef,upd);
      else t.set(wRef,{...upd,totalSpent:0,isPublic:false,lastMilestone:0,createdAt:Date.now()});
      credited=true;
    });
    if(credited){
      fbDB.collection('wallets').doc(uid).collection('transactions').add({type:'daily_login',amount:2,description:'Daily login',ref:'',createdAt:Date.now()}).catch(()=>{});
      setTimeout(()=>toast('+2 🦁 Daily login!'),1200);
      if(newStreak===7){ await WALLET.credit(uid,50,'streak_7','7-day streak bonus 🔥'); setTimeout(()=>toast('+50 🦁 7-day streak! 🔥'),2000); }
      else if(newStreak===30){ await WALLET.credit(uid,300,'streak_30','30-day streak bonus 🏆'); setTimeout(()=>toast('+300 🦁 30-day streak! 🏆'),2000); }
    }
  }catch(e){console.warn('login reward',e);}
}

async function checkFanMilestone(uid){
  const fans=followersOf(uid).filter(id=>!String(id).startsWith('u_')).length;
  const milestones=[10,100,1000,10000]; const rewards={10:100,100:500,1000:2000,10000:10000};
  const F=firebase.firestore.FieldValue;
  const wRef=fbDB.collection('wallets').doc(uid);
  let rewarded=null;
  try{
    await fbDB.runTransaction(async t=>{
      rewarded=null;
      const snap=await t.get(wRef);
      const lastM=snap.exists?(snap.data().lastMilestone||0):0;
      for(const m of milestones){
        if(fans>=m&&lastM<m){
          const amount=rewards[m];
          if(!snap.exists) t.set(wRef,{balance:amount,totalEarned:amount,totalSpent:0,isPublic:false,streak:0,lastLoginDate:'',lastMilestone:m,createdAt:Date.now()});
          else t.update(wRef,{balance:F.increment(amount),totalEarned:F.increment(amount),lastMilestone:m});
          rewarded={m,amount};
          break;
        }
      }
    });
    if(rewarded){
      fbDB.collection('wallets').doc(uid).collection('transactions').add({type:'fan_milestone',amount:rewarded.amount,description:`Reached ${nfmt(rewarded.m)} fans!`,ref:'',createdAt:Date.now()}).catch(()=>{});
      if(uid===ME?.id) toast(`+${rewarded.amount} 🦁 You reached ${nfmt(rewarded.m)} fans! 🎉`);
    }
  }catch{}
}

function _lncBuyDialog(productId){
  const p=CACHE.products.find(x=>x.id===productId); if(!p||!p.lncPrice) return;
  const gross=parseFloat(p.lncPrice);
  const ship=parseFloat(p.shipping||0);
  // LNC price covers the product; shipping (if any) is added on top in LNC equivalent
  // For simplicity, lncPrice is the total the buyer pays (seller sets it inclusive of shipping)
  // Spec: "If paid in LNC, the 5% fee applies to the total (product + shipping)"
  // Here lncPrice IS the product price in LNC; we add an lncShipping equivalent if set
  // Since lncShipping is not a separate field, use the USD shipping cost as a note only
  const {fee,net}=lncFee(gross);
  const bal=parseFloat(CACHE.wallet?.balance||0);
  openOverlay(`<div style="padding:8px">
    <div style="text-align:center;font-size:36px;margin-bottom:8px">🦁</div>
    <h2 style="text-align:center">Buy with LionCoin</h2>
    <p class="sub" style="text-align:center;margin:6px 0 14px">${esc(p.title)}</p>
    <div class="cart-summary" style="margin-bottom:14px">
      <div class="cart-line"><span>Product price</span><span>${fmtLNC(gross)} LNC</span></div>
      <div class="cart-line"><span>OK Music fee (5%)</span><span>${fmtLNC(fee)} LNC</span></div>
      <div class="cart-line cart-total"><span>Total debited from you</span><span>${fmtLNC(gross)} LNC</span></div>
      <div class="cart-line" style="color:var(--muted);font-size:12px"><span>Seller receives</span><span>${fmtLNC(net)} LNC</span></div>
    </div>
    ${ship>0?`<p class="note" style="margin-bottom:10px">⚠️ This product has a USD shipping cost of <b>$${ship.toFixed(2)}</b>. Arrange shipping payment separately with the seller via message.</p>`:''}
    <p class="sub" style="margin-bottom:12px">Your balance: <b>${fmtLNC(bal)} LNC</b>${bal<gross?' — <span style="color:#e2554f">insufficient</span>':''}</p>
    <label class="fee-ack-row" id="lncBuyAckRow">
      <input type="checkbox" id="lncBuyAck"> I acknowledge the 5% (${fmtLNC(fee)} LNC) OK Music platform fee
    </label>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" id="lncBuyConfirmBtn" data-action="confirmlncbuy" data-id="${productId}" disabled>Confirm purchase</button>
    </div>
  </div>`);
  setTimeout(()=>{
    const chk=$('lncBuyAck'); const btn=$('lncBuyConfirmBtn');
    if(chk&&btn) chk.onchange=()=>{ btn.disabled=!chk.checked; $('lncBuyAckRow').classList.toggle('ack-ok',chk.checked); };
  },0);
}

async function buyWithLNC(productId){
  if(!ME) return openEmailAuth();
  const p=CACHE.products.find(x=>x.id===productId); if(!p||!p.lncPrice) return;
  if(isOutOfStock(p)) return toast("This item is out of stock 📦");
  const gross=parseFloat(p.lncPrice);
  const bal=parseFloat(CACHE.wallet?.balance||0);
  if(bal<gross) return toast(`Not enough LionCoins — need ${fmtLNC(gross)} LNC, you have ${fmtLNC(bal)} LNC`);
  _lncBuyDialog(productId);
}

async function confirmLncBuy(productId){
  if(!ME) return;
  const p=CACHE.products.find(x=>x.id===productId); if(!p||!p.lncPrice) return;
  const {gross,fee,net}=lncFee(parseFloat(p.lncPrice));
  const F=firebase.firestore.FieldValue;
  const buyerRef=fbDB.collection('wallets').doc(ME.id);
  const sellerRef=fbDB.collection('wallets').doc(p.sellerId);
  const productRef=fbDB.collection('products').doc(productId);
  const now=Date.now(); let ok=false;
  try{
    await fbDB.runTransaction(async t=>{
      const [buyerSnap,productSnap]=await Promise.all([t.get(buyerRef),t.get(productRef)]);
      const pd=productSnap.data();
      if(pd&&pd.stock!=null&&pd.stock<=0) throw new Error('out_of_stock');
      if(!buyerSnap.exists||(parseFloat(buyerSnap.data().balance)||0)<gross) throw new Error('Insufficient balance');
      t.update(buyerRef,{balance:F.increment(-gross),totalSpent:F.increment(gross)});
      t.set(sellerRef,{balance:F.increment(net),totalEarned:F.increment(net)},{merge:true});
      if(pd&&pd.stock!=null) t.update(productRef,{stock:F.increment(-1)});
      ok=true;
    });
    if(ok){
      fbDB.collection('wallets').doc(ME.id).collection('transactions').add({type:'marketplace_buy',amount:-gross,description:`Bought: ${p.title}`,ref:productId,createdAt:now}).catch(()=>{});
      fbDB.collection('wallets').doc(p.sellerId).collection('transactions').add({type:'marketplace_sale',amount:net,description:`Sold: ${p.title}`,ref:productId,createdAt:now}).catch(()=>{});
      fbDB.collection('orders').add({buyerId:ME.id,buyerName:ME.name,buyerEmail:fbAuth.currentUser?.email||'',buyerAddress:'LNC purchase',
        items:[{productId:p.id,title:p.title,price:0,shipping:0,sellerId:p.sellerId,lncPrice:gross}],
        subtotal:0,shipping:0,platformFee:fee,total:0,lncAmount:gross,status:'lnc_paid',createdAt:now
      }).catch(()=>{});
      closeOverlay(); toast(`Purchase complete! ${fmtLNC(net)} LNC sent to seller 🦁`);
    }
  }catch(e){
    if(e.message==='out_of_stock') toast('This item is out of stock 📦');
    else toast('Not enough LionCoins or transaction failed');
  }
}

function renderWallet(){
  const w=CACHE.wallet||{}; const bal=w.balance||0; const earned=w.totalEarned||0; const spent=w.totalSpent||0; const streak=w.streak||0;
  const txs=CACHE.walletTxs||[];
  const typeIcon={track_view:'🎵',track_upload:'⬆️',status_post:'📝',comment_sent:'💬',comment_received:'💬',reaction_received:'👍',new_fan:'🫂',fan_milestone:'🏆',daily_login:'🌅',streak_7:'🔥',streak_30:'🏆',marketplace_buy:'🛍️',marketplace_sale:'💰',transfer_sent:'💸',transfer_received:'💰',contest_win:'🏆',contest_correction:'🔧',promotion:'🚀'};
  const typeLabel={
    track_view:'Track Views', track_upload:'Track Uploads', status_post:'Status Posts',
    comment_sent:'Comments Written', comment_received:'Comments Received',
    reaction_received:'Reactions Received', new_fan:'New Fans', fan_milestone:'Fan Milestones',
    daily_login:'Daily Login', streak_7:'7-Day Streak', streak_30:'30-Day Streak',
    marketplace_buy:'Marketplace Purchases', marketplace_sale:'Marketplace Sales',
    transfer_sent:'LNC Sent', transfer_received:'LNC Received',
    contest_win:'Contest Wins', contest_correction:'Contest Corrections',
    promotion:'Promoted Listings',
  };
  function fmtTxDate(ts){
    if(!ts) return '';
    const d=new Date(ts);
    return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  }

  // Group transactions by type
  const groups={};
  txs.forEach(tx=>{
    const key=tx.type||'other';
    if(!groups[key]) groups[key]=[];
    groups[key].push(tx);
  });
  const groupKeys=Object.keys(groups).sort((a,b)=>{
    const la=(groups[b][0]?.createdAt||0);
    const lb=(groups[a][0]?.createdAt||0);
    return la-lb;
  });

  const txSection=txs.length
    ? groupKeys.map(key=>{
        const items=groups[key];
        const totalAmt=items.reduce((s,t)=>s+(t.amount||0),0);
        const label=typeLabel[key]||(key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()));
        const icon=typeIcon[key]||'🦁';
        const rows=items.map(tx=>`
          <div class="tx-row">
            <span class="tx-icon">${icon}</span>
            <span class="tx-desc">${esc(tx.description)}</span>
            <span class="tx-time">${fmtTxDate(tx.createdAt)}</span>
            <span class="tx-amount ${tx.amount>0?'pos':'neg'}">${tx.amount>0?'+':''}${tx.amount} LNC</span>
          </div>`).join('');
        const netSign=totalAmt>=0?'+':'';
        return `<details class="tx-category">
          <summary class="tx-cat-summary">
            <span class="tx-cat-icon">${icon}</span>
            <span class="tx-cat-label">${label}</span>
            <span class="tx-cat-count">${items.length} transaction${items.length!==1?'s':''}</span>
            <span class="tx-cat-total ${totalAmt>=0?'pos':'neg'}">${netSign}${totalAmt.toFixed(2)} LNC</span>
          </summary>
          <div class="tx-list tx-cat-body">${rows}</div>
        </details>`;
      }).join('')
    : '<div class="empty" style="padding:16px 0">No transactions yet — start posting and uploading to earn LionCoins! 🦁</div>';

  $("page").innerHTML=`
    <div class="h-title">🦁 LionCoin Wallet</div>
    <div class="wallet-card">
      <div class="wallet-coin-icon">🦁</div>
      <div class="wallet-balance-num">${Math.floor(bal).toLocaleString()}</div>
      <div class="wallet-balance-label">LionCoins</div>
      <div class="wallet-stats-row">
        <div class="wallet-stat"><div class="wallet-stat-val">${Math.floor(earned).toLocaleString()}</div><div class="wallet-stat-lbl">Earned</div></div>
        <div class="wallet-stat-sep"></div>
        <div class="wallet-stat"><div class="wallet-stat-val">${Math.floor(spent).toLocaleString()}</div><div class="wallet-stat-lbl">Spent</div></div>
        <div class="wallet-stat-sep"></div>
        <div class="wallet-stat"><div class="wallet-stat-val">${streak}</div><div class="wallet-stat-lbl">Day streak 🔥</div></div>
      </div>
      <div class="sset-row" style="padding-top:14px;border-top:1px solid var(--border);margin-top:14px">
        <div><div class="sset-name" style="font-size:13px">Make balance public</div><div class="sset-hint">Others can see your balance on your profile</div></div>
        <label class="stoggle"><input type="checkbox" id="walletPublicChk" ${w.isPublic?'checked':''}><span class="stoggle-sl"></span></label>
      </div>
      <button class="btn primary block" data-action="sendlnc" style="margin-top:16px;font-size:15px">💸 Send LionCoins</button>
    </div>

    <details class="wallet-accordion">
      <summary class="wallet-accordion-hdr">How to Earn LionCoins <span class="wallet-acc-arrow">▸</span></summary>
      <div class="wallet-earn-grid">
        <div class="wallet-earn-row"><span>🎵 Track view (unique per day)</span><span class="wallet-earn-amt">+1 LNC</span></div>
        <div class="wallet-earn-row"><span>⬆️ Upload a track</span><span class="wallet-earn-amt">+10 LNC</span></div>
        <div class="wallet-earn-row"><span>📝 Post a status</span><span class="wallet-earn-amt">+3 LNC</span></div>
        <div class="wallet-earn-row"><span>💬 Write a comment</span><span class="wallet-earn-amt">+1 LNC</span></div>
        <div class="wallet-earn-row"><span>💬 Receive a comment</span><span class="wallet-earn-amt">+2 LNC</span></div>
        <div class="wallet-earn-row"><span>👍 Receive a reaction</span><span class="wallet-earn-amt">+0.5 LNC</span></div>
        <div class="wallet-earn-row"><span>🫂 New fan follows you</span><span class="wallet-earn-amt">+5 LNC</span></div>
        <div class="wallet-earn-row"><span>🌅 Daily login</span><span class="wallet-earn-amt">+2 LNC</span></div>
        <div class="wallet-earn-row"><span>🔥 7-day login streak</span><span class="wallet-earn-amt">+50 LNC</span></div>
        <div class="wallet-earn-row"><span>🏆 30-day login streak</span><span class="wallet-earn-amt">+300 LNC</span></div>
        <div class="wallet-earn-row"><span>🏅 Reach 10 fans</span><span class="wallet-earn-amt">+100 LNC</span></div>
        <div class="wallet-earn-row"><span>🏅 Reach 100 fans</span><span class="wallet-earn-amt">+500 LNC</span></div>
        <div class="wallet-earn-row"><span>🏅 Reach 1,000 fans</span><span class="wallet-earn-amt">+2,000 LNC</span></div>
        <div class="wallet-earn-row"><span>🏅 Reach 10,000 fans</span><span class="wallet-earn-amt">+10,000 LNC</span></div>
      </div>
    </details>

    <details class="wallet-accordion">
      <summary class="wallet-accordion-hdr">Transaction History <span class="tx-hdr-count">(${txs.length})</span><span class="wallet-acc-arrow">▸</span></summary>
      <div class="tx-categories">${txSection}</div>
    </details>`;

  setTimeout(()=>{
    const chk=$('walletPublicChk');
    if(chk) chk.onchange=async()=>{ await fbDB.collection('wallets').doc(ME.id).set({isPublic:chk.checked},{merge:true}).catch(()=>{}); toast(chk.checked?'Balance is now public 👁️':'Balance is now private 🔒'); };
  },0);
}
// transferLNC: gross is debited from sender; 5% fee retained by platform; net credited to recipient.
async function transferLNC(toUid,grossAmount,note){
  if(!ME||!toUid||ME.id===toUid||grossAmount<=0) return false;
  const {gross,fee,net}=lncFee(grossAmount);
  const F=firebase.firestore.FieldValue;
  const fromRef=fbDB.collection('wallets').doc(ME.id);
  const toRef=fbDB.collection('wallets').doc(toUid);
  const now=Date.now(); let ok=false;
  try{
    await fbDB.runTransaction(async t=>{
      const fromSnap=await t.get(fromRef);
      if(!fromSnap.exists||(parseFloat(fromSnap.data().balance)||0)<gross) throw new Error('Insufficient balance');
      t.update(fromRef,{balance:F.increment(-gross),totalSpent:F.increment(gross)});
      t.set(toRef,{balance:F.increment(net),totalEarned:F.increment(net)},{merge:true});
      ok=true;
    });
    if(ok){
      const toUser=userById(toUid);
      const sendDesc=`Sent to ${toUser?.name||toUid}${note?' — '+note:''} (incl. 5% fee)`;
      const recvDesc=`From ${ME.name}${note?' — '+note:''}`;
      fbDB.collection('wallets').doc(ME.id).collection('transactions').add({type:'transfer_sent',amount:-gross,description:sendDesc,ref:toUid,createdAt:now}).catch(()=>{});
      fbDB.collection('wallets').doc(toUid).collection('transactions').add({type:'transfer_received',amount:net,description:recvDesc,ref:ME.id,createdAt:now}).catch(()=>{});
      fbDB.collection('transfers').add({fromUid:ME.id,toUid,gross,fee,net,note:note||'',createdAt:now}).catch(()=>{});
      notify(toUid,'transfer',`🦁 ${ME.name} sent you ${fmtLNC(net)} LionCoins${note?' — "'+note+'"':''}`);
    }
  }catch(e){console.warn('transferLNC',e);}
  return ok;
}

function _lncSendCalcHtml(dir,rawVal,myBal){
  // dir: 'send' = I send X (gross); 'receive' = they receive exactly X (net→reverse calc)
  const v=parseFloat(rawVal)||0;
  if(v<=0) return '<div class="fee-calc-result" id="feeCalcResult"></div>';
  const {gross,fee,net}=dir==='send'?lncFee(v):lncFeeReverse(v);
  const insuf=gross>myBal;
  return `<div class="fee-calc-result ${insuf?'insuf':''}" id="feeCalcResult">
    <div class="fee-calc-row"><span>Gross sent by you</span><b>${fmtLNC(gross)} LNC</b></div>
    <div class="fee-calc-row"><span>OK Music fee (5%)</span><b>${fmtLNC(fee)} LNC</b></div>
    <div class="fee-calc-row fee-calc-net"><span>They receive</span><b>${fmtLNC(net)} LNC</b></div>
    ${insuf?`<div style="color:#e2554f;font-size:12px;margin-top:4px">⚠️ Insufficient balance (you have ${fmtLNC(myBal)} LNC)</div>`:''}
  </div>`;
}

function openSendLNC(toUid){
  if(!ME) return openEmailAuth();
  const myBal=parseFloat(CACHE.wallet?.balance||0);
  if(toUid){
    const u=userById(toUid); if(!u) return toast('User not found');
    openOverlay(`<h2>🦁 Send LionCoins</h2>
      <div class="mrow2" style="padding:12px 0;border-bottom:1px solid var(--border);margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar" style="${avatarStyle(u,40)}">${u.avatarImg?'':initials(u.name)}</div>
          <div><div style="font-weight:700">${esc(u.name)}</div><div style="font-size:12px;color:var(--muted)">@${esc(u.handle||'')}</div></div>
        </div>
        <div style="text-align:right"><div class="lnc-badge">🦁 ${fmtLNC(myBal)} LNC</div><div style="font-size:11px;color:var(--muted);margin-top:2px">your balance</div></div>
      </div>
      <div class="fee-calc-bar">
        <button class="fee-dir-btn active" id="feeDir_send" data-dir="send">I send</button>
        <button class="fee-dir-btn" id="feeDir_receive" data-dir="receive">They receive exactly</button>
      </div>
      <div class="field" style="margin-top:10px">
        <label id="lncAmtLabel">Amount you send (LNC, 0.01 precision)</label>
        <input class="fb-field" id="lncAmt" type="number" min="0.01" step="0.01" placeholder="e.g. 12.50" />
      </div>
      <div id="feeCalcResult"></div>
      <div class="field" style="margin-top:10px"><label>Note <span style="font-weight:400;color:var(--muted)">(optional)</span></label><input class="fb-field" id="lncNote" placeholder="Thanks for the collab!" maxlength="100" /></div>
      <label class="fee-ack-row" id="lncSendAckRow" style="margin-top:12px">
        <input type="checkbox" id="lncSendAck"> I acknowledge the 5% OK Music platform fee on this transfer
      </label>
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn block" data-action="close">Cancel</button>
        <button class="btn primary block" id="lncSendBtn" data-action="confirmsendlnc" data-uid="${toUid}" disabled>Send 🦁</button>
      </div>`);
    setTimeout(()=>{
      let _dir='send';
      const amt=$('lncAmt'); const ack=$('lncSendAck');
      const btn=$('lncSendBtn'); const lbl=$('lncAmtLabel');
      // Re-query feeCalcResult each time: outerHTML replacement detaches the old ref
      function refresh(){ const cur=$('feeCalcResult'); if(cur) cur.outerHTML=_lncSendCalcHtml(_dir,amt?.value||0,myBal); }
      function updateDir(d){ _dir=d;
        document.querySelectorAll('.fee-dir-btn').forEach(b=>b.classList.toggle('active',b.dataset.dir===d));
        if(lbl) lbl.textContent=d==='send'?'Amount you send (LNC, 0.01 precision)':'Amount they receive exactly (LNC)';
        refresh();
      }
      document.querySelectorAll('.fee-dir-btn').forEach(b=>b.onclick=()=>updateDir(b.dataset.dir));
      if(amt) amt.oninput=refresh;
      if(ack&&btn) ack.onchange=()=>{ btn.disabled=!ack.checked; $('lncSendAckRow')?.classList.toggle('ack-ok',ack.checked); };
      amt?.focus();
    },50);
  } else {
    const following=followingOf(ME.id).map(id=>userById(id)).filter(u=>u&&!String(u.id).startsWith('u_'));
    openOverlay(`<h2>🦁 Send LionCoins</h2>
      <div class="lnc-badge" style="margin-bottom:14px">Your balance: ${fmtLNC(myBal)} LNC</div>
      <div class="field"><input class="fb-field" id="lncUserSearch" placeholder="Search by name or @handle…" /></div>
      <div id="lncUserList" style="max-height:260px;overflow-y:auto;margin-top:4px">
        ${following.length?following.map(u=>`
          <div class="mrow2 lnc-pick" data-action="sendlnctouser" data-uid="${u.id}">
            <div class="avatar" style="${avatarStyle(u,38)}">${u.avatarImg?'':initials(u.name)}</div>
            <div class="minfo"><div class="mt">${esc(u.name)}</div><div class="ms">@${esc(u.handle||'')}</div></div>
            <span style="color:var(--orange);font-size:12px">Select →</span>
          </div>`).join(''):'<div class="empty">Follow someone to send them LNC</div>'}
      </div>`);
    setTimeout(()=>{
      const s=$('lncUserSearch');
      if(s) s.oninput=()=>{ const q=s.value.toLowerCase(); document.querySelectorAll('.lnc-pick').forEach(el=>{ const t=el.innerText.toLowerCase(); el.style.display=t.includes(q)?'':'none'; }); };
    },50);
  }
}

async function confirmSendLNC(toUid){
  let _dir='send';
  // Read direction from whichever fee-dir-btn is active
  const activeDir=document.querySelector('.fee-dir-btn.active');
  if(activeDir) _dir=activeDir.dataset.dir;
  const rawVal=parseFloat($('lncAmt')?.value||'0');
  if(!rawVal||rawVal<=0) return toast('Enter an amount');
  const {gross,net}=_dir==='send'?lncFee(rawVal):lncFeeReverse(rawVal);
  const myBal=parseFloat(CACHE.wallet?.balance||0);
  if(gross>myBal) return toast(`Not enough LionCoins — need ${fmtLNC(gross)} LNC, you have ${fmtLNC(myBal)} LNC`);
  const note=($('lncNote')?.value||'').trim();
  const btn=$('lncSendBtn');
  if(btn){btn.disabled=true;btn.textContent='Sending…';}
  const ok=await transferLNC(toUid,gross,note);
  if(ok){ closeOverlay(); toast(`🦁 ${fmtLNC(net)} LNC delivered to ${userById(toUid)?.name||'them'}!`); }
  else{ if(btn){btn.disabled=false;btn.textContent='Send 🦁';} toast('Transfer failed — check your balance'); }
}
// ============ END LIONCOIN ============
