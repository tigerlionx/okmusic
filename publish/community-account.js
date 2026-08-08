// ============================================================
//  community-account.js — Block, report, settings, delete account
//  Loaded after community-contests.js.
// ============================================================

async function blockUser(targetUid){
  if(!ME||targetUid===ME.id) return;
  const target=userById(targetUid);
  if(!target) return;
  openOverlay(`<div style="text-align:center;padding:8px">
    <div style="font-size:40px;margin-bottom:12px">🚫</div>
    <h2>Block ${esc(target.name)}?</h2>
    <p class="sub">They won't be able to message or call you. They won't know they're blocked.</p>
    <button class="btn block" style="background:#e2554f;color:#fff;border-color:#e2554f;margin-bottom:8px" data-action="confirmblock" data-uid="${targetUid}">Block</button>
    <button class="btn block" data-action="close">Cancel</button>
  </div>`);
}
async function confirmBlock(targetUid){
  if(!ME) return;
  const blocked=[...(ME.blockedUsers||[])];
  if(!blocked.includes(targetUid)) blocked.push(targetUid);
  const F=firebase.firestore.FieldValue;
  try{
    // 1. Add to blockedUsers
    await fbDB.collection('users').doc(ME.id).update({ blockedUsers:blocked });
    ME.blockedUsers=blocked;
    const d=db(); if(d.usersById[ME.id]) d.usersById[ME.id].blockedUsers=blocked; commit(d);
    // 2. Remove fan relationship both directions
    await fbDB.collection('follows').doc(ME.id).set({following:F.arrayRemove(targetUid)},{merge:true}).catch(()=>{});
    await fbDB.collection('follows').doc(targetUid).set({following:F.arrayRemove(ME.id)},{merge:true}).catch(()=>{});
    // 3. Remove one-way follows both directions
    await fbDB.collection('userFollows').doc(ME.id).set({list:F.arrayRemove(targetUid)},{merge:true}).catch(()=>{});
    await fbDB.collection('userFollows').doc(targetUid).set({list:F.arrayRemove(ME.id)},{merge:true}).catch(()=>{});
    // 4. Delete any pending follow requests between the two
    const reqsOut=await fbDB.collection('followRequests').where('fromUid','==',ME.id).where('toUid','==',targetUid).get();
    const reqsIn=await fbDB.collection('followRequests').where('fromUid','==',targetUid).where('toUid','==',ME.id).get();
    const batch=fbDB.batch();
    [...reqsOut.docs,...reqsIn.docs].forEach(d=>batch.delete(d.ref));
    await batch.commit().catch(()=>{});
    toast('User blocked.');
    closeOverlay();
    render();
  }catch(e){ toast('Error: '+(e.message||e)); }
}
async function unblockUser(targetUid){
  if(!ME) return;
  const blocked=(ME.blockedUsers||[]).filter(u=>u!==targetUid);
  try{
    await fbDB.collection('users').doc(ME.id).update({ blockedUsers:blocked });
    ME.blockedUsers=blocked;
    const d=db(); if(d.usersById[ME.id]) d.usersById[ME.id].blockedUsers=blocked; commit(d);
    toast('User unblocked ✓');
    openSettingsModal('blocked');
  }catch(e){ toast('Error: '+(e.message||e)); }
}

function openReportModal(targetUid){
  const target=userById(targetUid); if(!target) return;
  openOverlay(`<h2>Report ${esc(target.name)}</h2>
    <p class="sub">Select a reason — this will be reviewed by the OK Music team.</p>
    <div class="sset-group">
      ${['Harassment or bullying','Spam or fake account','Inappropriate content','Hate speech','Impersonation','Other'].map(r=>`<label class="sradio"><input type="radio" name="reportReason" value="${r}"><span>${r}</span></label>`).join('')}
    </div>
    <div class="field" style="margin-top:10px"><textarea id="reportDetail" placeholder="Additional details (optional)" style="min-height:70px"></textarea></div>
    <button class="btn primary block" data-action="sendreport" data-uid="${targetUid}">Send Report</button>
    <button class="btn block" data-action="close" style="margin-top:8px">Cancel</button>`);
}
async function sendReport(targetUid){
  const reason=document.querySelector('input[name="reportReason"]:checked')?.value;
  if(!reason) return toast('Please select a reason.');
  const detail=document.getElementById('reportDetail')?.value?.trim()||'';
  try{
    await fbDB.collection('reports').add({ reportedUid:targetUid, reporterUid:ME?.id||'anon', reason, detail, time:Date.now(), status:'pending' });
    toast('Report submitted. Thank you for helping keep OK Music safe.');
    closeOverlay();
  }catch(e){ toast('Error: '+(e.message||e)); }
}

async function doChangePassword(){
  openOverlay(`<h2>🔑 Change Password</h2>
    <div class="field"><label>Current password</label><input class="fb-field" id="pwOld" type="password" /></div>
    <div class="field"><label>New password (min 6 chars)</label><input class="fb-field" id="pwNew" type="password" /></div>
    <div class="field"><label>Confirm new password</label><input class="fb-field" id="pwNew2" type="password" /></div>
    <button class="btn primary block" data-action="confirmpwchange">Change Password</button>
    <button class="btn block" data-action="close" style="margin-top:8px">Cancel</button>`);
}
async function confirmPwChange(){
  const old=document.getElementById('pwOld')?.value||'';
  const n1=document.getElementById('pwNew')?.value||'';
  const n2=document.getElementById('pwNew2')?.value||'';
  if(!old) return toast('Enter your current password.');
  if(n1.length<6) return toast('New password must be at least 6 characters.');
  if(n1!==n2) return toast('New passwords do not match.');
  try{
    const user=fbAuth.currentUser;
    const cred=firebase.auth.EmailAuthProvider.credential(user.email,old);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(n1);
    toast('Password changed successfully ✓');
    closeOverlay();
    fbDB.collection('users').doc(ME.id).collection('activityLog').add({ type:'password_change',...getDeviceInfo(),timestamp:Date.now() }).catch(()=>{});
  }catch(e){
    if(e.code==='auth/wrong-password'||e.code==='auth/invalid-credential') toast('Current password is incorrect.');
    else toast('Error: '+(e.code||e.message));
  }
}
async function doChangeEmail(){
  openOverlay(`<h2>✉️ Change Email</h2>
    <div class="field"><label>Current password</label><input class="fb-field" id="cePass" type="password" /></div>
    <div class="field"><label>New email address</label><input class="fb-field" id="ceNew" type="email" /></div>
    <button class="btn primary block" data-action="confirmemailchange">Change Email</button>
    <button class="btn block" data-action="close" style="margin-top:8px">Cancel</button>`);
}
async function confirmEmailChange(){
  const pass=document.getElementById('cePass')?.value||'';
  const email=(document.getElementById('ceNew')?.value||'').trim();
  if(!pass) return toast('Enter your password to confirm.');
  if(!email.includes('@')) return toast('Enter a valid email address.');
  try{
    const user=fbAuth.currentUser;
    const cred=firebase.auth.EmailAuthProvider.credential(user.email,pass);
    await user.reauthenticateWithCredential(cred);
    await user.verifyBeforeUpdateEmail(email);
    toast('Verification email sent to '+email+'. Check your inbox to confirm the change.');
    closeOverlay();
  }catch(e){
    if(e.code==='auth/wrong-password'||e.code==='auth/invalid-credential') toast('Password is incorrect.');
    else if(e.code==='auth/email-already-in-use') toast('That email is already in use.');
    else toast('Error: '+(e.code||e.message));
  }
}
async function exportMyData(){
  if(!ME) return;
  toast('Preparing your data export…');
  try{
    const [tracks,statuses,notifs]=await Promise.all([
      fbDB.collection('tracks').where('userId','==',ME.id).get(),
      fbDB.collection('statuses').where('userId','==',ME.id).get(),
      fbDB.collection('notifications').where('forUid','==',ME.id).limit(100).get(),
    ]);
    const data={
      exportedAt:new Date().toISOString(),
      profile:{ id:ME.id,name:ME.name,handle:ME.handle,bio:ME.bio,createdAt:ME.createdAt },
      tracks:[],statuses:[],notifications:[]
    };
    tracks.forEach(d=>data.tracks.push({ id:d.id,...d.data() }));
    statuses.forEach(d=>data.statuses.push({ id:d.id,...d.data() }));
    notifs.forEach(d=>data.notifications.push({ id:d.id,...d.data() }));
    const blob=new Blob([JSON.stringify(data,null,2)],{ type:'application/json' });
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`okmusic-data-${ME.handle||ME.id}.json`; a.click();
    URL.revokeObjectURL(url);
    toast('Data exported ✓');
  }catch(e){ toast('Export failed: '+(e.message||e)); }
}
function doDeleteAccount(){
  const isEmail=fbAuth.currentUser?.providerData?.some(p=>p.providerId==='password');
  openOverlay(`<div style="text-align:center;padding:8px">
    <div style="font-size:48px;margin-bottom:12px">⚠️</div>
    <h2>Delete Account?</h2>
    <p class="sub">This permanently deletes your profile, all your tracks, posts and data. <b>This cannot be undone.</b></p>
    <div class="field" style="margin-top:16px"><label>Type DELETE to confirm</label><input class="fb-field" id="delConfirm" placeholder="DELETE" /></div>
    ${isEmail?`<div class="field"><label>Your password</label><input class="fb-field" id="delPass" type="password" placeholder="Required to confirm" /></div>`:`<p class="sub" style="margin-bottom:8px">You'll be asked to sign in with Google again to confirm.</p>`}
    <button class="btn block" style="background:#e2554f;color:#fff;border-color:#e2554f;margin-bottom:8px" data-action="confirmdelete">Delete My Account</button>
    <button class="btn block" data-action="close">Cancel</button>
  </div>`);
}
async function confirmDelete(){
  const confirm=document.getElementById('delConfirm')?.value||'';
  if(confirm!=='DELETE') return toast('Type DELETE exactly to confirm.');
  try{
    const user=fbAuth.currentUser;
    const isEmail=user.providerData?.some(p=>p.providerId==='password');
    if(isEmail){
      const pass=document.getElementById('delPass')?.value||'';
      if(!pass) return toast('Enter your password to confirm.');
      const cred=firebase.auth.EmailAuthProvider.credential(user.email,pass);
      await user.reauthenticateWithCredential(cred);
    } else {
      await user.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
    }
    // Delete Firestore data
    const batch=fbDB.batch();
    batch.delete(fbDB.collection('users').doc(ME.id));
    const [trSnap,stSnap]=await Promise.all([
      fbDB.collection('tracks').where('userId','==',ME.id).get(),
      fbDB.collection('statuses').where('userId','==',ME.id).get(),
    ]);
    trSnap.forEach(d=>batch.delete(d.ref));
    stSnap.forEach(d=>batch.delete(d.ref));
    await batch.commit();
    // Delete Firebase Auth account
    await user.delete();
    toast('Your account has been deleted. Goodbye.');
    closeOverlay();
  }catch(e){
    if(e.code==='auth/wrong-password'||e.code==='auth/invalid-credential') toast('Password is incorrect.');
    else if(e.code==='auth/requires-recent-login') toast('Please sign out and sign back in, then try again.');
    else toast('Error: '+(e.code||e.message));
  }
}
