// ============================================================
//  community-dispatcher.js — event delegation + UI listeners
//  Loaded after community.js; all handler functions live there.
// ============================================================

document.addEventListener("click",e=>{
  const el=e.target.closest("[data-action]"); if(!el) return; const a=el.dataset.action;
  const M={
    nav:()=>go(el.dataset.view), profile:()=>go("profile",{profileId:el.dataset.uid}), viewavatar:()=>viewAvatar(el.dataset.uid),
    auth:()=>{ if(el.dataset.p==="google") signInGoogle(); else toast("Apple sign-in needs a paid Apple Developer account — coming later. Use Google or email 🙂"); },
    authemail:()=>openEmailAuth(($("liEmail").value||"").trim()), emailgo:()=>emailGo(el.dataset.mode), finishonboard:()=>finishOnboard(),
    sharefolder:shareMusicFolder, savemobilepl:saveMobilePlaylist, setthumbs:()=>setThumbsFolder(el.dataset.pl), relink:()=>relinkFolder(el.dataset.pl), playfile:()=>playFolderTrack(el.dataset.pl,el.dataset.file),
    upload:openUpload, dopublish:doPublish, customize:openCustomize, savecustom:saveCustom, openresetcustom:openResetCustom, resetcustom:resetCustom, removebanner:removeBanner, removepagebg:removePageBg, invite:openInvite, setbgmode:()=>setBgMode(el.dataset.mode),
    copyinvite:()=>{ const i=$("invLink"); i.select(); if(navigator.clipboard)navigator.clipboard.writeText(i.value); toast("Invite link copied ✓"); },
    play:()=>playTrack(el.dataset.id), like:()=>toggleLike(el.dataset.id), dislike:()=>toggleDislike(el.dataset.id),
    poststatus:()=>postStatus(el), slike:()=>stLike(el.dataset.id), sdislike:()=>stDislike(el.dataset.id), scomment:()=>stComment(el.dataset.id),
    follow:()=>toggleFollow(el.dataset.uid),
    toggleuserfollow:()=>toggleUserFollow(el.dataset.uid),
    unfanself:()=>unfanSelf(el.dataset.uid),
    cancelfanrequest:()=>cancelFanRequest(el.dataset.uid),
    unfollowuser:()=>unfollowUser(el.dataset.uid),
    share:()=>share(el.dataset.id), logout:logout, close:closeOverlay,
    publish:()=>setVisibility(el.dataset.id,"public"), unpublish:()=>setVisibility(el.dataset.id,"private"), deltrack:()=>deleteTrack(el.dataset.id),
    editcmt:()=>editComment(el.dataset.id), delcmt:()=>deleteComment(el.dataset.id),
    fantab:()=>{ state.fanTab=el.dataset.t; state.view='fans'; renderFans(); }, suggest:openSuggest, sendsuggest:sendSuggest,
    openmarketplace:openMarketplace, gobuyer:goBuyer, goseller:goSeller, gosellerdirect:()=>{ if(!ME) return openEmailAuth(); CACHE.sellers[ME.id]?go("mystore"):openSellerSetup(); },
    editsellersettings:()=>{ if(!ME) return; openEditSellerSettings(); },
    doeditseller:doEditSeller,
    doregisterseller:doRegisterSeller, addproduct:()=>openProductForm(), editproduct:()=>openProductForm(el.dataset.id), delproduct:()=>deleteProduct(el.dataset.id),
    dosaveproduct:()=>doSaveProduct(el.dataset.id||null), viewproduct:()=>viewProduct(el.dataset.id),
    contactseller:()=>contactSeller(el.dataset.uid,el.dataset.productid),
    clearmpfilters:clearMpFilters,
    reserveproduct:()=>openReserveDialog(el.dataset.id),
    submitreservation:()=>submitReservation(el.dataset.id),
    printifycheckout:()=>openPrintifyCheckout(el.dataset.id),
    placeprintifyorder:()=>placePrintifyOrder(el.dataset.productid),
    cancelorder:()=>cancelOrder(el.dataset.id),
    confirmcancelorder:()=>confirmCancelOrder(el.dataset.id),
    addtocart:()=>addToCart(el.dataset.id), removecart:()=>removeFromCart(el.dataset.id),
    checkout:openCheckout, doorder:doPlaceOrder, zoomphoto:()=>zoomPhoto(el.dataset.src),
    togglepl:()=>{ if(!state.openPlaylists) state.openPlaylists=new Set(); const id=el.dataset.pl; state.openPlaylists.has(id)?state.openPlaylists.delete(id):state.openPlaylists.add(id); renderMain(); },
    genre:()=>{ state.genre=el.dataset.g; if(state.view!=="discover") state.view="discover"; renderDiscover(); },
    swatch:()=>{window._upColor=el.dataset.c;document.querySelectorAll("#swatches .swatch").forEach(s=>s.classList.toggle("sel",s===el));},
    vis:()=>{window._upVis=el.dataset.v;document.querySelectorAll("#visRow .radio-card").forEach(c=>c.classList.toggle("sel",c===el));},
    bgcolor:()=>{window._bgColor=el.dataset.c;window._bgTheme="";document.querySelectorAll("#bgSw .swatch").forEach(s=>s.classList.toggle("sel",s===el));document.querySelectorAll("#themeGrid .theme-swatch").forEach(s=>s.classList.remove("sel"));const bi=$("bgImg");if(bi)bi.value="";},
    theme:()=>{window._bgTheme=el.dataset.t;window._bgColor="";document.querySelectorAll("#themeGrid .theme-swatch").forEach(s=>s.classList.toggle("sel",s===el));document.querySelectorAll("#bgSw .swatch").forEach(s=>s.classList.remove("sel"));const bi=$("bgImg");if(bi)bi.value="";},
    migratetrack:()=>migrateTrack(el.dataset.id),
    migratealltracks:migrateAllLocal,
    addlink:()=>openAddLink(el.dataset.id,el.dataset.title),
    savetracklink:()=>saveTrackLink(el.dataset.id),
    broadcastwelcome:broadcastWelcome,
    toggleadminusers:()=>{ _adminUsersOpen=!_adminUsersOpen; renderAdmin(); },
    toggleprintify:()=>{ _printifyOpen=!_printifyOpen; renderAdmin(); },
    loadprintifyshops:loadPrintifyShops,
    importprintify:importPrintifyProducts,
    adminuserprofile:()=>openAdminUserProfile(el.dataset.uid),
    showguide:()=>showWelcomeGuide(ME?.name||"there"),
    openchat:()=>{ state.chatUid=el.dataset.uid; state.view="chat"; renderApp(); },
    attachfile:()=>{ const fi=$("chatFileInput");if(fi)fi.click(); },
    clearpendingfile:clearPendingFile,
    sendmsg:()=>sendMsg(el.dataset.uid),
    editmsg:()=>editMsg(el.dataset.msgid,el.dataset.cid,el.dataset.text),
    saveeditmsg:()=>saveEditMsg(el.dataset.msgid,el.dataset.cid),
    deletemsgmenu:()=>deleteMsgMenu(el.dataset.msgid,el.dataset.cid),
    deletemsgall:()=>deleteMsgForAll(el.dataset.msgid,el.dataset.cid),
    deletemsgme:()=>deleteMsgForMe(el.dataset.msgid,el.dataset.cid),
    startcall:()=>startCall(el.dataset.uid, el.dataset.type||'audio'), startvideocall:()=>startCall(el.dataset.uid,'video'), switchcallvideo:()=>switchCallVideo(), testmic:testMic,
    acceptcall:()=>acceptCall(el.dataset.uid),
    mutecall:muteCall,
    togglecamera:toggleCamera,
    endcall:endCall,
    leavecall:leaveConference,
    confmute:confMuteToggle,
    confcam:confCamToggle,
    togglehand:toggleCallHand,
    opencallinvite:openCallInvite,
    invitetoconf:()=>inviteToCall(el.dataset.uid),
    startconference:openConferenceDialog,
    beginconference:beginConference,
    joinconference:()=>joinConference(el.dataset.id),
    declineconf:()=>{ stopRing(); const p=document.getElementById('call-panel'); if(p){p.classList.remove('active');p.innerHTML='';} },
    confirmdel:()=>doDeleteTrack(el.dataset.id),
    confirmdelcmt:()=>doDeleteComment(el.dataset.id),
    confirmdelprod:()=>doDeleteProduct(el.dataset.id),
    promotelisting:()=>openPromoDialog(el.dataset.id),
    confirmpromo:()=>confirmPromo(el.dataset.id,el.dataset.days,el.dataset.cost),
    saveeditcmt:()=>saveEditComment(el.dataset.id),
    security:()=>openSecurityModal(),
    devicetype:()=>{ const isPublic=el.dataset.pub==='1'; closeOverlay(); _initSession(el.dataset.uid,isPublic); if(isPublic) toast('Public session active — you will be signed out in 2 hours.'); },
    logoutall:()=>logoutAllOtherDevices(),
    settings:()=>openSettingsModal('privacy'),
    settingstab:()=>openSettingsModal(el.dataset.tab),
    saveprivacy:()=>savePrivacySettings(),
    blockuser:()=>blockUser(el.dataset.uid),
    confirmblock:()=>confirmBlock(el.dataset.uid),
    unblockuser:()=>unblockUser(el.dataset.uid),
    reportuser:()=>openReportModal(el.dataset.uid),
    sendreport:()=>sendReport(el.dataset.uid),
    changepw:()=>doChangePassword(),
    confirmpwchange:()=>confirmPwChange(),
    changeemail:()=>doChangeEmail(),
    confirmemailchange:()=>confirmEmailChange(),
    exportdata:()=>exportMyData(),
    deleteaccount:()=>doDeleteAccount(),
    confirmdelete:()=>confirmDelete(),
    togglebusy:toggleBusy,
    acceptfollow:()=>acceptFollowRequest(el.dataset.fromuid,el.dataset.reqid),
    rejectfollow:()=>rejectFollowRequest(el.dataset.fromuid,el.dataset.reqid),
    removefan:()=>removeFan(el.dataset.uid),
    buywithlioncoin:()=>buyWithLNC(el.dataset.id),
    confirmlncbuy:()=>confirmLncBuy(el.dataset.id),
    sendlnc:()=>openSendLNC(el.dataset.uid||null),
    sendlnctouser:()=>{ closeOverlay(); openSendLNC(el.dataset.uid); },
    confirmsendlnc:()=>confirmSendLNC(el.dataset.uid),
    createcontest:()=>openCreateContest(),
    addctopt:()=>addContestOption(),
    addctparticipant:()=>addContestParticipant(),
    togglectmode:()=>toggleCtMode(el.dataset.mode),
    docreatecontest:()=>doCreateContest(),
    pickcontestoption:()=>openPickOption(el.dataset.contestid,el.dataset.optionid,el.dataset.participantid),
    confirmcontestpick:()=>doContestPick(el.dataset.contestid,el.dataset.optionid,el.dataset.participantid),
    resolvecontest:()=>openResolveContest(el.dataset.contestid,el.dataset.optionid,el.dataset.participantid),
    confirmresolvecontest:()=>doResolveContest(el.dataset.contestid,el.dataset.optionid,el.dataset.participantid),
    correctcontest:()=>openCorrectContest(el.dataset.contestid),
    setdeadline:()=>openSetDeadline(el.dataset.contestid),
    confirmsetdeadline:()=>doSetDeadline(el.dataset.contestid),
    submitcorrection:()=>submitCorrection(el.dataset.contestid),
    confirmcorrection:()=>doCorrectContest(),
    mobmenu:()=>openMobMenu(),
    togglefolder:()=>{
      const sid=el.dataset.genre;
      const body=$('mfbody-'+sid); const arrow=$('mfarrow-'+sid); const folder=$('mfolder-'+sid);
      if(body){
        const open=body.style.display!=='none';
        body.style.display=open?'none':'block';
        if(arrow) arrow.textContent=open?'▶':'▼';
        if(folder) folder.classList.toggle('open',!open);
        open?state.openFolders.delete(sid):state.openFolders.add(sid);
      }
    },
    attachdiscovertrack:()=>openAttachTrack(),
    attachdiscoverproduct:()=>openAttachProduct(),
    selectdisctrack:()=>{ _discAttach={trackId:el.dataset.id,productId:null}; closeOverlay(); updateDiscAttachPreview(); },
    selectdiscproduct:()=>{ _discAttach={trackId:null,productId:el.dataset.id}; closeOverlay(); updateDiscAttachPreview(); },
    removediscattach:()=>{ _discAttach={trackId:null,productId:null}; updateDiscAttachPreview(); },
    postdiscover:()=>postToDiscover(),
    setdiscmode:()=>{ _discMode=el.dataset.mode||'short'; renderDiscover(); },
    togglereadmore:()=>{
      const pid=el.dataset.pid;
      const textEl=document.getElementById('dpt-'+pid);
      if(textEl){
        const exp=textEl.classList.toggle('expanded');
        if(exp) _expandedPosts.add(pid); else _expandedPosts.delete(pid);
        el.textContent=exp?'Show less ↑':'Read more →';
      }
    },
    likediscpost:()=>{
      if(!ME) return openEmailAuth();
      const id=el.dataset.id; const F=firebase.firestore.FieldValue; const key='dp_'+id;
      const has=(CACHE.reactions[key]?.likes||[]).includes(ME.id);
      fbDB.collection('reactions').doc(key).set({likes:has?F.arrayRemove(ME.id):F.arrayUnion(ME.id)},{merge:true}).catch(e=>toast(e.message));
    },
    deletediscpost:()=>{
      const id=el.dataset.id; const p=(CACHE.discoveryPosts||[]).find(x=>x.id===id);
      if(!p||!ME) return; if(ME.id!==p.userId&&!isAdmin()) return;
      fbDB.collection('discoveryPosts').doc(id).delete().catch(e=>toast(e.message));
    }
  };
  if(M[a]) M[a]();
});
document.addEventListener("change",e=>{
  if(e.target.id==="myTracksOnlyChk"){ myTracksOnlyMode=e.target.checked; toast(myTracksOnlyMode?"🎵 Playing your tracks only":"🌐 Playing all website tracks"); }
  if(e.target.id==="avFile"){ const f=e.target.files[0]; if(!f) return; window._avatarFile=f; window._avatar=null; const p=$("avPrev"); if(p){ p.style.backgroundImage=`url('${URL.createObjectURL(f)}')`; p.textContent=""; } }
  if(e.target.id==="covFile"){ const f=e.target.files[0]; if(!f) return; window._coverFile=f; window._trackCover=null; const p=$("covPrev"); if(p){ p.style.backgroundImage=`url('${URL.createObjectURL(f)}')`; p.style.backgroundSize="cover"; p.style.backgroundPosition="center"; p.style.background=""; p.textContent=""; } }
  if(e.target.id==="audioFile"){ const f=e.target.files[0]; if(!f) return; window._audioFile=f; const fn=$("audioFilename"); if(fn) fn.textContent="✓ "+f.name+" ("+Math.round(f.size/1024)+" KB)"; }
  if(e.target.id==="prodPhotoFile"){ const f=e.target.files[0]; if(!f) return; window._mpPhotoFile=f; window._mpPhoto=null; const p=$("prodPhotoPrev"); if(p){ p.style.backgroundImage=`url('${URL.createObjectURL(f)}')`; p.style.backgroundSize="cover"; p.style.backgroundPosition="center"; p.textContent=""; } }
  if(e.target.id==="bannerFile"){ const f=e.target.files[0]; if(!f) return; window._bannerFile=f; window._clearBanner=false; const p=$("bannerPrev"); if(p){ const url=URL.createObjectURL(f); p.style.backgroundImage=`url('${url}')`; p.style.backgroundSize="cover"; p.style.backgroundPosition="center"; const h=p.querySelector(".cust-hint"); if(h) h.style.opacity="0"; } }
  if(e.target.id==="pageBgFile"){ const f=e.target.files[0]; if(!f) return; window._pageBgFile=f; window._clearPageBg=false; const p=$("pageBgPrev"); if(p){ const url=URL.createObjectURL(f); p.style.backgroundImage=`url('${url}')`; p.style.backgroundSize="cover"; p.style.backgroundPosition="center"; const h=p.querySelector(".cust-hint"); if(h) h.style.opacity="0"; } }
});
$("overlay").addEventListener("click",e=>{ if(e.target.id==="overlay") closeOverlay(); });
document.addEventListener("keydown",e=>{ if(e.key==="Escape") closeOverlay(); });
document.addEventListener("input",e=>{
  if(!["adjBrightness","adjContrast","adjSaturate","adjOpacity"].includes(e.target.id)) return;
  const vEl=document.getElementById(e.target.id+"Val"); if(vEl) vEl.textContent=e.target.value+"%";
  const br=parseInt(($("adjBrightness")||{value:"100"}).value)/100;
  const co=parseInt(($("adjContrast")||{value:"100"}).value)/100;
  const sa=parseInt(($("adjSaturate")||{value:"100"}).value)/100;
  const op=parseInt(($("adjOpacity")||{value:"100"}).value)/100;
  const prev=$("pageBgPrev"); if(prev){ prev.style.filter=`brightness(${br}) contrast(${co}) saturate(${sa})`; prev.style.opacity=op; }
  const bgEl=document.getElementById("page-bg-layer"); if(bgEl){ bgEl.style.filter=`brightness(${br}) contrast(${co}) saturate(${sa})`; bgEl.style.opacity=op; }
});
