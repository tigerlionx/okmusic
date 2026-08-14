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
let _linkCache = {};
let _discAttach = {trackId:null, productId:null};
let _discMode = 'short'; // 'short' | 'article'
const _expandedPosts = new Set(); // post IDs the user has expanded — survives re-renders
let _adminUsersOpen = false;
let _printifyOpen = false;
let _printifyToken = '';
let _printifyShops = [];
let _printifyShopId = '';
let _printifyStoreUrl = '';
let _preMusicVol = 1;

// On GitHub Pages the Firebase Messaging SDK cannot serve its SW at the origin root.
// Unregister any stale SW registrations outside /okmusic/ so they stop throwing 404s.
if (location.hostname === 'tigerlionx.github.io' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => { if (!reg.scope.includes('/okmusic/')) reg.unregister(); });
  });
}

// Seed data (incl. 100 demo creators) now lives in community-data.js:
// SEED_USERS, SEED_TRACKS, SEED_STATUSES, SEED_STATS, SEED_FOLLOWERS, SEED_ST_STATS.
const COLORS = ["#FB7A28","#7c5cff","#36d1c4","#ff5c7c","#ffb347","#5c8bff","#ff7ac6","#2bbf4e"];
const GENRES = ["Synthwave","Lo-fi","Ambient","Trap","Deep House","Cinematic","Drill","Afrobeat","Jazz-hop","Chillstep","Orchestral","Phonk","Future Bass","Downtempo","Hyperpop","Pop","Rock","Electronic","World","Other"];
const THEMES = [
  { id:"aurora",   label:"Aurora",    css:"linear-gradient(135deg,#7c5cff,#36d1c4)" },
  { id:"sunset",   label:"Sunset",    css:"linear-gradient(135deg,#FB7A28,#ff5c7c)" },
  { id:"ocean",    label:"Ocean",     css:"linear-gradient(135deg,#1a3a6b,#36d1c4)" },
  { id:"midnight", label:"Midnight",  css:"linear-gradient(135deg,#0d0d2b,#7c5cff)" },
  { id:"forest",   label:"Forest",    css:"linear-gradient(135deg,#1a4731,#2bbf4e)" },
  { id:"rosegold", label:"Rose Gold", css:"linear-gradient(135deg,#ff7ac6,#ffb347)" },
  { id:"ember",    label:"Ember",     css:"linear-gradient(135deg,#4a0000,#FB7A28)" },
  { id:"arctic",   label:"Arctic",    css:"linear-gradient(135deg,#a8edea,#fed6e3)" },
  { id:"galaxy",   label:"Galaxy",    css:"linear-gradient(135deg,#0f2027,#203a43,#2c5364)" },
  { id:"neon",     label:"Neon",      css:"linear-gradient(135deg,#0f0c29,#302b63,#f953c6)" },
];

const PLATFORM_EMAIL="trendai509@gmail.com";
const ADMIN_EMAIL="trendai509@gmail.com";
const PLATFORM_FEE=0.03;
// Promoted listing plans — cost in LNC, duration in days
const PROMO_PLANS=[
  {days:3,  lnc:50,  label:'3 days'},
  {days:7,  lnc:100, label:'7 days'},
  {days:14, lnc:180, label:'14 days'},
  {days:30, lnc:300, label:'30 days'},
];
const MP_CATEGORIES=[
  "Electronics","Fashion & Apparel","Home & Furniture","Beauty & Health",
  "Food & Groceries","Vehicles & Parts","Books","Music & Audio",
  "Digital Products / eBooks / Software","Art & Collectibles",
  "Services","Sports & Outdoors","Baby & Kids","Other"
];

// ── LNC arithmetic helpers ────────────────────────────────────────────────────
// Integer minor-unit (×100) math avoids floating-point drift. Round half-up throughout.
function lncFee(grossLNC){
  const grossC=Math.round(grossLNC*100);
  const feeC=Math.floor(grossC*5/100+0.5);      // 5 % of gross, round half-up
  return { gross:grossC/100, fee:feeC/100, net:(grossC-feeC)/100 };
}
function lncFeeReverse(netLNC){                  // caller wants payee to receive exactly netLNC
  const netC=Math.round(netLNC*100);
  const grossC=Math.floor(netC/0.95+0.5);        // gross = net / 0.95, round half-up
  return { gross:grossC/100, fee:(grossC-netC)/100, net:netC/100 };
}
function fmtLNC(v){ return parseFloat(v||0).toFixed(2); }

// ── ISO 4217 full currency list (verified: HTG, AFN, all Peso variants, XOF, XAF, SSP included) ──
const ISO_CURRENCIES=[
  {code:'AED',name:'UAE Dirham'},{code:'AFN',name:'Afghan Afghani'},
  {code:'ALL',name:'Albanian Lek'},{code:'AMD',name:'Armenian Dram'},
  {code:'ANG',name:'Netherlands Antillean Guilder'},{code:'AOA',name:'Angolan Kwanza'},
  {code:'ARS',name:'Argentine Peso'},{code:'AUD',name:'Australian Dollar'},
  {code:'AWG',name:'Aruban Florin'},{code:'AZN',name:'Azerbaijani Manat'},
  {code:'BAM',name:'Bosnia-Herzegovina Convertible Mark'},{code:'BBD',name:'Barbadian Dollar'},
  {code:'BDT',name:'Bangladeshi Taka'},{code:'BGN',name:'Bulgarian Lev'},
  {code:'BHD',name:'Bahraini Dinar'},{code:'BIF',name:'Burundian Franc'},
  {code:'BMD',name:'Bermudian Dollar'},{code:'BND',name:'Brunei Dollar'},
  {code:'BOB',name:'Bolivian Boliviano'},{code:'BRL',name:'Brazilian Real'},
  {code:'BSD',name:'Bahamian Dollar'},{code:'BTN',name:'Bhutanese Ngultrum'},
  {code:'BWP',name:'Botswana Pula'},{code:'BYN',name:'Belarusian Ruble'},
  {code:'BZD',name:'Belize Dollar'},{code:'CAD',name:'Canadian Dollar'},
  {code:'CDF',name:'Congolese Franc'},{code:'CHF',name:'Swiss Franc'},
  {code:'CLP',name:'Chilean Peso'},{code:'CNY',name:'Chinese Yuan'},
  {code:'COP',name:'Colombian Peso'},{code:'CRC',name:'Costa Rican Colón'},
  {code:'CUC',name:'Cuban Convertible Peso'},{code:'CUP',name:'Cuban Peso'},
  {code:'CVE',name:'Cape Verdean Escudo'},{code:'CZK',name:'Czech Koruna'},
  {code:'DJF',name:'Djiboutian Franc'},{code:'DKK',name:'Danish Krone'},
  {code:'DOP',name:'Dominican Peso'},{code:'DZD',name:'Algerian Dinar'},
  {code:'EGP',name:'Egyptian Pound'},{code:'ERN',name:'Eritrean Nakfa'},
  {code:'ETB',name:'Ethiopian Birr'},{code:'EUR',name:'Euro'},
  {code:'FJD',name:'Fijian Dollar'},{code:'FKP',name:'Falkland Islands Pound'},
  {code:'GBP',name:'British Pound Sterling'},{code:'GEL',name:'Georgian Lari'},
  {code:'GHS',name:'Ghanaian Cedi'},{code:'GIP',name:'Gibraltar Pound'},
  {code:'GMD',name:'Gambian Dalasi'},{code:'GNF',name:'Guinean Franc'},
  {code:'GTQ',name:'Guatemalan Quetzal'},{code:'GYD',name:'Guyanese Dollar'},
  {code:'HKD',name:'Hong Kong Dollar'},{code:'HNL',name:'Honduran Lempira'},
  {code:'HTG',name:'Haitian Gourde'},{code:'HUF',name:'Hungarian Forint'},
  {code:'IDR',name:'Indonesian Rupiah'},{code:'ILS',name:'Israeli New Shekel'},
  {code:'INR',name:'Indian Rupee'},{code:'IQD',name:'Iraqi Dinar'},
  {code:'IRR',name:'Iranian Rial'},{code:'ISK',name:'Icelandic Króna'},
  {code:'JMD',name:'Jamaican Dollar'},{code:'JOD',name:'Jordanian Dinar'},
  {code:'JPY',name:'Japanese Yen'},{code:'KES',name:'Kenyan Shilling'},
  {code:'KGS',name:'Kyrgystani Som'},{code:'KHR',name:'Cambodian Riel'},
  {code:'KMF',name:'Comorian Franc'},{code:'KPW',name:'North Korean Won'},
  {code:'KRW',name:'South Korean Won'},{code:'KWD',name:'Kuwaiti Dinar'},
  {code:'KYD',name:'Cayman Islands Dollar'},{code:'KZT',name:'Kazakhstani Tenge'},
  {code:'LAK',name:'Laotian Kip'},{code:'LBP',name:'Lebanese Pound'},
  {code:'LKR',name:'Sri Lankan Rupee'},{code:'LRD',name:'Liberian Dollar'},
  {code:'LSL',name:'Lesotho Loti'},{code:'LYD',name:'Libyan Dinar'},
  {code:'MAD',name:'Moroccan Dirham'},{code:'MDL',name:'Moldovan Leu'},
  {code:'MGA',name:'Malagasy Ariary'},{code:'MKD',name:'Macedonian Denar'},
  {code:'MMK',name:'Myanmar Kyat'},{code:'MNT',name:'Mongolian Tögrög'},
  {code:'MOP',name:'Macanese Pataca'},{code:'MRU',name:'Mauritanian Ouguiya'},
  {code:'MUR',name:'Mauritian Rupee'},{code:'MVR',name:'Maldivian Rufiyaa'},
  {code:'MWK',name:'Malawian Kwacha'},{code:'MXN',name:'Mexican Peso'},
  {code:'MYR',name:'Malaysian Ringgit'},{code:'MZN',name:'Mozambican Metical'},
  {code:'NAD',name:'Namibian Dollar'},{code:'NGN',name:'Nigerian Naira'},
  {code:'NIO',name:'Nicaraguan Córdoba'},{code:'NOK',name:'Norwegian Krone'},
  {code:'NPR',name:'Nepalese Rupee'},{code:'NZD',name:'New Zealand Dollar'},
  {code:'OMR',name:'Omani Rial'},{code:'PAB',name:'Panamanian Balboa'},
  {code:'PEN',name:'Peruvian Sol'},{code:'PGK',name:'Papua New Guinean Kina'},
  {code:'PHP',name:'Philippine Peso'},{code:'PKR',name:'Pakistani Rupee'},
  {code:'PLN',name:'Polish Zloty'},{code:'PYG',name:'Paraguayan Guaraní'},
  {code:'QAR',name:'Qatari Riyal'},{code:'RON',name:'Romanian Leu'},
  {code:'RSD',name:'Serbian Dinar'},{code:'RUB',name:'Russian Ruble'},
  {code:'RWF',name:'Rwandan Franc'},{code:'SAR',name:'Saudi Riyal'},
  {code:'SBD',name:'Solomon Islands Dollar'},{code:'SCR',name:'Seychellois Rupee'},
  {code:'SDG',name:'Sudanese Pound'},{code:'SEK',name:'Swedish Krona'},
  {code:'SGD',name:'Singapore Dollar'},{code:'SHP',name:'Saint Helena Pound'},
  {code:'SLL',name:'Sierra Leonean Leone'},{code:'SOS',name:'Somali Shilling'},
  {code:'SRD',name:'Surinamese Dollar'},{code:'SSP',name:'South Sudanese Pound'},
  {code:'STN',name:'São Tomé & Príncipe Dobra'},{code:'SVC',name:'Salvadoran Colón'},
  {code:'SYP',name:'Syrian Pound'},{code:'SZL',name:'Swazi Lilangeni'},
  {code:'THB',name:'Thai Baht'},{code:'TJS',name:'Tajikistani Somoni'},
  {code:'TMT',name:'Turkmenistani Manat'},{code:'TND',name:'Tunisian Dinar'},
  {code:'TOP',name:"Tongan Pa'anga"},{code:'TRY',name:'Turkish Lira'},
  {code:'TTD',name:'Trinidad & Tobago Dollar'},{code:'TWD',name:'New Taiwan Dollar'},
  {code:'TZS',name:'Tanzanian Shilling'},{code:'UAH',name:'Ukrainian Hryvnia'},
  {code:'UGX',name:'Ugandan Shilling'},{code:'USD',name:'US Dollar'},
  {code:'UYU',name:'Uruguayan Peso'},{code:'UZS',name:'Uzbekistani Som'},
  {code:'VES',name:'Venezuelan Bolívar Soberano'},{code:'VND',name:'Vietnamese Dong'},
  {code:'VUV',name:'Vanuatu Vatu'},{code:'WST',name:'Samoan Tala'},
  {code:'XAF',name:'Central African CFA Franc'},{code:'XCD',name:'East Caribbean Dollar'},
  {code:'XOF',name:'West African CFA Franc'},{code:'XPF',name:'CFP Franc'},
  {code:'YER',name:'Yemeni Rial'},{code:'ZAR',name:'South African Rand'},
  {code:'ZMW',name:'Zambian Kwacha'},{code:'ZWL',name:'Zimbabwean Dollar'},
];

function currencyOptions(selected='USD'){
  return ISO_CURRENCIES.map(c=>`<option value="${c.code}" ${selected===c.code?'selected':''}>${c.code} — ${c.name}</option>`).join('');
}

// Format an amount in a given currency (falls back to "CODE amount" if Intl doesn't know it)
function fmtCurrency(amount,code){
  const n=parseFloat(amount||0);
  if(!code||code==='USD') return `$${n.toFixed(2)}`;
  try{ return new Intl.NumberFormat('en-US',{style:'currency',currency:code,minimumFractionDigits:2}).format(n); }
  catch(e){ return `${code} ${n.toFixed(2)}`; }
}

// Return live USD equivalent string, or null (same currency), or "USD value unavailable"
function usdEquiv(amount,code){
  if(!code||code==='USD') return null;
  const rates=CACHE.fxRates;
  if(!rates) return null; // still fetching — show nothing
  if(!rates[code]) return 'USD value unavailable';
  return `≈ $${((parseFloat(amount)||0)/rates[code]).toFixed(2)} USD`;
}

// Best USD price for a product — used in cart totals and price filter
function productPriceUSD(p){
  const price=parseFloat(p.price||0);
  if(!p.currency||p.currency==='USD') return price;
  if(p.priceUSD!=null) return parseFloat(p.priceUSD); // stored at listing time
  const rates=CACHE.fxRates||{};
  return rates[p.currency]?+(price/rates[p.currency]).toFixed(2):price;
}
function productShippingUSD(p){
  const ship=parseFloat(p.shipping||0);
  if(!p.currency||p.currency==='USD') return ship;
  if(p.shippingUSD!=null) return parseFloat(p.shippingUSD);
  const rates=CACHE.fxRates||{};
  return rates[p.currency]?+(ship/rates[p.currency]).toFixed(2):ship;
}

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

// ---------- IndexedDB (folder handles + offline audio cache) ----------
function fsdb(){ return new Promise((res,rej)=>{ const r=indexedDB.open("okfs",2);
  r.onupgradeneeded=e=>{ const db=r.result; if(!db.objectStoreNames.contains("dirs")) db.createObjectStore("dirs"); if(!db.objectStoreNames.contains("audio")) db.createObjectStore("audio"); };
  r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function fsPut(k,v){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("dirs","readwrite"); t.objectStore("dirs").put(v,k); t.oncomplete=res; }); }
async function fsGet(k){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("dirs","readonly"); const q=t.objectStore("dirs").get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }); }
async function audioPut(k,v){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("audio","readwrite"); t.objectStore("audio").put(v,k); t.oncomplete=res; }); }
async function audioGet(k){ const d=await fsdb(); return new Promise(res=>{ const t=d.transaction("audio","readonly"); const q=t.objectStore("audio").get(k); q.onsuccess=()=>res(q.result); q.onerror=()=>res(null); }); }
const dirCache={};
async function ensurePerm(h){ if(!h)return false; const o={mode:"read"}; if((await h.queryPermission(o))==="granted")return true; try{ return (await h.requestPermission(o))==="granted"; }catch{ return false; } }

// ---------- helpers ----------
function allUsers(){ return SEED_USERS.concat(Object.values(CACHE.users)); }
function userById(id){ if(ME&&ME.id===id) return ME; return allUsers().find(u=>u.id===id); }
function seedAt(h){ return Date.now()-(h||0)*3600000; }
function allTracks(){ const s=SEED_TRACKS.map(t=>({ ...t, createdAt:seedAt(t.ageHrs), visibility:"public", share:true })); return CACHE.tracks.map(t=>({ ...t })).concat(s); }
function tracksByUser(uid,owner){ return allTracks().filter(t=>t.userId===uid&&(owner||t.visibility!=="private")).sort((a,b)=>b.createdAt-a.createdAt); }
function playlistsByUser(uid){
  const local=db().playlists.filter(p=>p.userId===uid).sort((a,b)=>b.createdAt-a.createdAt);
  const localIds=new Set(local.map(p=>p.id));
  // Build cloud playlists from Firestore tracks (shows on all devices)
  const cloudMap={};
  allTracks().filter(t=>t.userId===uid&&t.playlistId&&!localIds.has(t.playlistId)).forEach(t=>{
    if(!cloudMap[t.playlistId]) cloudMap[t.playlistId]={id:t.playlistId,userId:uid,name:t.playlistName||"Playlist",files:[],createdAt:t.createdAt,_cloud:true};
    cloudMap[t.playlistId].files.push(t.title);
    if(t.createdAt<cloudMap[t.playlistId].createdAt) cloudMap[t.playlistId].createdAt=t.createdAt;
  });
  return [...local,...Object.values(cloudMap).sort((a,b)=>b.createdAt-a.createdAt)];
}
function allStatuses(){ const s=SEED_STATUSES.map(x=>({ ...x, time:seedAt(x.ageHrs) })); return CACHE.statuses.map(x=>({ ...x })).concat(s); }
function statusesByUser(uid){ return allStatuses().filter(s=>s.userId===uid||(s.wallUid&&s.wallUid===uid)).sort((a,b)=>b.time-a.time); }
function currentUser(){ return ME; }
function isAdmin(){ return fbAuth.currentUser?.email===ADMIN_EMAIL; }
function followerCount(uid){ let n=SEED_FOLLOWERS[uid]||0; for(const f in CACHE.follows) if(CACHE.follows[f].includes(uid)) n++; return n; }
function followingCount(uid){ return (CACHE.follows[uid]||[]).length; }
function isFollowing(uid){ return ME&&(CACHE.follows[ME.id]||[]).includes(uid); }
// New one-way follow system (separate from fan/follows)
function isFollowingUser(uid){ return ME&&(CACHE.userFollows[ME.id]||[]).includes(uid); }
function userFollowerCount(uid){ let n=0; for(const f in CACHE.userFollows) if(CACHE.userFollows[f].includes(uid)) n++; return n; }
function followersOfUser(uid){ const r=[]; for(const f in CACHE.userFollows){ if(CACHE.userFollows[f].includes(uid)) r.push(f); } return r; }
// isFanOf: ME is an accepted fan of uid (ME is in uid's followersOf list)
function isFanOf(uid){ return ME&&followersOf(uid).includes(ME.id); }
// hasPendingFanRequest: ME sent a fan request to uid (not yet accepted)
function hasPendingFanRequestTo(uid){ return (CACHE.fanRequestsSent||[]).some(r=>r.toUid===uid&&r.status==='pending'); }
function likeCount(t){ return (SEED_STATS[t]?.likes||0)+((CACHE.reactions["t_"+t]?.likes||[]).length); }
function dislikeCount(t){ return (CACHE.reactions["t_"+t]?.dislikes||[]).length; }
function hasLiked(t){ return ME&&(CACHE.reactions["t_"+t]?.likes||[]).includes(ME.id); }
function hasDisliked(t){ return ME&&(CACHE.reactions["t_"+t]?.dislikes||[]).includes(ME.id); }
function playCount(t){ return (SEED_STATS[t]?.plays||0)+(db().plays[t]||0); }
function stLikeCount(id){ return (SEED_ST_STATS[id]?.likes||0)+((CACHE.reactions["s_"+id]?.likes||[]).length); }
function stDislikeCount(id){ return (SEED_ST_STATS[id]?.dislikes||0)+((CACHE.reactions["s_"+id]?.dislikes||[]).length); }
function stHasLiked(id){ return ME&&(CACHE.reactions["s_"+id]?.likes||[]).includes(ME.id); }
function stHasDisliked(id){ return ME&&(CACHE.reactions["s_"+id]?.dislikes||[]).includes(ME.id); }
function stComments(id){ return CACHE.comments.filter(c=>c.statusId===id).sort((a,b)=>a.time-b.time); }
function esc(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function nfmt(n){ return n>=1000?(n/1000).toFixed(n%1000>=100?1:0)+"k":""+n; }
function timeAgo(t){ const s=Math.floor((Date.now()-t)/1000); if(s<60)return"just now"; const m=Math.floor(s/60); if(m<60)return m+"m"; const h=Math.floor(m/60); if(h<24)return h+"h"; return Math.floor(h/24)+"d"; }
function initials(n){ return n.split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase(); }
function grad(c){ return `linear-gradient(135deg, ${c}, #6a4a2e)`; }
function avatarStyle(u,size){ const s=`width:${size}px;height:${size}px;font-size:${Math.round(size/2.6)}px;`; return u.avatarImg?`${s}background-image:url('${u.avatarImg}')`:`${s}background:${u.color}`; }
let toastTimer; function toast(m){ const e=$("toast"); e.textContent=m; e.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>e.hidden=true,3200); }

// ---------- state ----------
let ME=null;                                   // the signed-in user's profile (Firebase)
// live shared data, kept in sync by Firestore listeners
const CACHE={ users:{}, tracks:[], statuses:[], follows:{}, userFollows:{}, reactions:{}, comments:[], notifications:[], products:[], sellers:{}, orders:[], convos:{}, suggestions:[], followRequests:[], fanRequestsSent:[], wallet:null, walletTxs:[], contests:[], discoveryPosts:[], customCategories:[], fxRates:{} };
let state={ view:"discover", profileId:null, query:"", cart:JSON.parse(localStorage.getItem("okmusic_cart")||"[]"), openFolders:new Set() };
function persistCart(){ try{ localStorage.setItem("okmusic_cart",JSON.stringify(state.cart||[])); }catch(e){} }
let playMode="continuous"; // "continuous" | "repeat" | "shuffle"
let nowPlayingId=null;
let nowPlayingContext=null; // {uid} restricts queue to one user; null = global
let myTracksOnlyMode=false;
function go(v,x={}){ state={ ...state, view:v, ...x }; render(); window.scrollTo(0,0); }
function _getBgLayer(){
  let el=document.getElementById("page-bg-layer");
  if(!el){ el=document.createElement("div"); el.id="page-bg-layer"; el.style.cssText="display:none;position:fixed;inset:0;z-index:-1;background-attachment:fixed;pointer-events:none;"; document.body.prepend(el); }
  return el;
}
function _setBgStyle(img, mode, f){
  const el=_getBgLayer();
  el.style.backgroundImage=`url('${img}')`;
  if(mode==="tile"){ el.style.backgroundSize="auto"; el.style.backgroundRepeat="repeat"; el.style.backgroundPosition="top left"; }
  else if(mode==="center"){ el.style.backgroundSize="auto"; el.style.backgroundRepeat="no-repeat"; el.style.backgroundPosition="center center"; }
  else { el.style.backgroundSize="cover"; el.style.backgroundRepeat="no-repeat"; el.style.backgroundPosition="center"; }
  const bf=f||{}; const br=(bf.brightness!=null?bf.brightness:100)/100; const co=(bf.contrast!=null?bf.contrast:100)/100; const sa=(bf.saturate!=null?bf.saturate:100)/100;
  el.style.filter=`brightness(${br}) contrast(${co}) saturate(${sa})`; el.style.opacity=(bf.opacity!=null?bf.opacity:100)/100;
  el.style.display="block"; document.body.style.backgroundImage=""; document.body.classList.add("has-page-bg");
}
function _clearBg(){
  const el=document.getElementById("page-bg-layer"); if(el) el.style.display="none";
  document.body.style.backgroundImage=""; document.body.classList.remove("has-page-bg");
}
function render(){
  if(!ME){ renderPublicDiscover(); return; }
  if(!ME.handle){ renderLanding(); openOnboard(); return; }   // signed in but no profile yet
  renderApp();
}

// ============ AUTH ============
function renderLanding(){
  $("miniplayer").classList.remove("show");
  $("root").innerHTML=`
  <div class="auth-v2-wrap">
    <div class="auth-v2-left">
      <div class="auth-v2-logo">OK<span>MUSIC</span></div>
      <h1 class="auth-v2-pitch-h1">Share Your Music,<br><em>Connect &amp; Do Business</em></h1>
      <p class="auth-v2-pitch-sub">Upload tracks from any AI music platform, build a fanbase, earn 🦁 LionCoins for every play, and trade in the community marketplace.</p>
      <ul class="auth-v2-features">
        <li><span>⬆️</span> Share tracks from Suno, Udio &amp; more</li>
        <li><span>🦁</span> Earn LionCoins for plays, likes &amp; shares</li>
        <li><span>🛍️</span> Buy &amp; sell in the marketplace</li>
        <li><span>💬</span> Connect with fans &amp; collaborators</li>
      </ul>
    </div>
    <div class="auth-v2-right">
      <div class="auth-v2-card">
        <div class="auth-v2-tab-bar">
          <button class="auth-v2-tab active">Sign In</button>
          <button class="auth-v2-tab">Sign Up</button>
        </div>
        <button class="social-btn" data-action="auth" data-p="google">
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        <button class="social-btn" data-action="auth" data-p="apple">
          <span style="font-size:17px;line-height:1">🍎</span> Continue with Apple
        </button>
        <div class="divider-or">OR</div>
        <input class="fb-field" id="liEmail" type="email" placeholder="Enter your email" />
        <button class="btn primary block" data-action="authemail" style="margin-top:10px">Continue with email →</button>
        <div class="authfoot" style="margin-top:16px">Visitors can browse music freely — sign in to share, like &amp; earn 🦁 LionCoins.</div>
      </div>
    </div>
  </div>
  <div class="landing-copyright">Copyright OK Music&#x2122; Company &mdash; trendai509@gmail.com &mdash; 2026</div>`;
}

// ============ PUBLIC DISCOVER (unauthenticated visitors) ============
function renderPublicDiscover(){
  $("miniplayer").classList.remove("show");
  // Build music library from public tracks
  const publicTracks=(allTracks()||[]).filter(t=>t.visibility==='public');
  const genreMap={};
  publicTracks.forEach(t=>{ const g=(t.genre&&t.genre.trim())||'Unknown'; if(!genreMap[g])genreMap[g]=[]; genreMap[g].push(t); });
  const sortedGenres=Object.keys(genreMap).sort();
  let foldersHtml='';
  sortedGenres.forEach(g=>{
    const tracks=genreMap[g].slice().sort((a,b)=>b.createdAt-a.createdAt).slice(0,10);
    const sid=g.replace(/[^a-zA-Z0-9]/g,'_');
    // Use open state from existing state for continuity
    const isOpen=state.openFolders&&state.openFolders.has(sid);
    const rows=tracks.map(t=>{
      const u=userById(t.userId);
      const artStyle=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
      return `<div class="pub-music-row" data-action="play" data-id="${t.id}">
        <div class="pub-music-art" style="${artStyle}">${t.coverImg?'':'◎'}</div>
        <div class="pub-music-info">
          <div class="pub-music-title">${esc(t.title)}</div>
          <div class="pub-music-artist">${esc(u?.name||'Unknown')} &middot; ${esc(g)}</div>
        </div>
        <button class="pub-music-play" data-action="play" data-id="${t.id}">▶</button>
      </div>`;
    }).join('');
    foldersHtml+=`<details class="music-folder" ${isOpen?'open':''} style="margin-bottom:8px">
      <summary class="music-folder-hd" style="cursor:pointer;padding:11px 14px;border-radius:12px;background:rgba(255,255,255,.88);border:1px solid var(--line);display:flex;align-items:center;gap:10px;font-weight:700;font-size:14px;list-style:none;user-select:none">
        <span style="color:var(--muted);font-size:12px">▶</span> 📁 ${esc(g)} <span style="font-size:12px;color:var(--muted);font-weight:500;margin-left:auto">${tracks.length} track${tracks.length!==1?'s':''}</span>
      </summary>
      <div style="padding:8px 0">${rows}</div>
    </details>`;
  });
  const emptyLib=`<div class="empty" style="padding:32px 0">No public tracks yet — be the first to sign up and upload!</div>`;

  $("root").innerHTML=`
  <div class="pub-site">
    <div class="pub-blobs"></div>
    <!-- ── Topbar ── -->
    <div class="pub-topbar">
      <div class="pub-topbar-inner">
        <div class="pub-brand-logo">OK<span>MUSIC</span> <span class="pub-brand-badge">Social Hub</span></div>
        <div class="pub-nav-links">
          <span style="color:var(--blue)">Discover</span>
          <span onclick="renderLanding()" style="cursor:pointer">Feed</span>
          <span onclick="renderLanding()" style="cursor:pointer">Marketplace</span>
          <span onclick="renderLanding()" style="cursor:pointer">Messages</span>
          <span onclick="renderLanding()" style="cursor:pointer">Sign In</span>
          <button class="btn primary sm" onclick="renderLanding()" style="font-family:'Space Grotesk',sans-serif;text-transform:uppercase;letter-spacing:.5px">Join Free →</button>
        </div>
      </div>
    </div>

    <div class="pub-wrap">
      <!-- ── Hero ── -->
      <div class="pub-hero">
        <div class="pub-hero-left">
          <div class="pub-hero-badge">
            <span></span> Music Community Network
          </div>
          <div class="pub-slogan-pill">🦁 Sign up — join the network and earn LionCoins</div>
          <h1 class="pub-h1">Share AI Music,<br><em>Connect &amp; Earn</em></h1>
          <p class="pub-sub">Upload tracks from any AI music platform, share them with a global audience, build a fanbase, and earn <b>🦁 LionCoins</b> for every play, like, and share. The community is yours.</p>
          <div class="pub-ctas">
            <button class="btn primary" onclick="renderLanding()" style="font-size:15px;padding:13px 30px;font-family:'Space Grotesk',sans-serif;text-transform:uppercase;letter-spacing:1px">Join the Network →</button>
            <button class="btn" onclick="renderLanding()" style="font-family:'Space Grotesk',sans-serif">Sign In</button>
          </div>
        </div>
        <!-- 3D LionCoin -->
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div class="lnc-scene">
            <div class="lnc-particles">
              <div class="lnc-particle"></div>
              <div class="lnc-particle"></div>
              <div class="lnc-particle"></div>
              <div class="lnc-particle"></div>
              <div class="lnc-particle"></div>
              <div class="lnc-particle"></div>
            </div>
            <div class="lnc-float-wrap">
              <div class="lnc-coin">
                <div class="lnc-face"><span class="lnc-logo">🦁</span></div>
                <div class="lnc-edge-ring">${Array.from({length:36},(_,i)=>`<div class="lnc-edge" style="--i:${i}"></div>`).join('')}</div>
                <div class="lnc-back"><span class="lnc-logo">🦁</span></div>
              </div>
            </div>
            <div class="lnc-glow"></div>
            <div class="lnc-shadow"></div>
          </div>
          <div class="lnc-label">
            <div class="lnc-label-title">LionCoin</div>
            <div class="lnc-label-sub">Earn for every play, like &amp; share</div>
          </div>
        </div>
      </div>

      <!-- ── Stats bar ── -->
      <div class="pub-stats">
        <div class="pub-stat"><div class="pub-stat-n">120K<span>+</span></div><div class="pub-stat-l">Shared Tracks</div></div>
        <div class="pub-stat"><div class="pub-stat-n">45K</div><div class="pub-stat-l">Active Members</div></div>
        <div class="pub-stat"><div class="pub-stat-n">100<span>%</span></div><div class="pub-stat-l">Creator Owned</div></div>
        <div class="pub-stat"><div class="pub-stat-n">24<span>/7</span></div><div class="pub-stat-l">Live Network</div></div>
      </div>

      <!-- ── Music Library ── -->
      <div style="margin-bottom:56px">
        <div class="pub-library-hd">
          <h2>🎵 Music Library</h2>
          <p>Browse &amp; play public tracks — sign in to like, comment &amp; share</p>
        </div>
        ${foldersHtml||emptyLib}
        ${publicTracks.length>0?`<div class="pub-gate">
          <h3>Want to see more?</h3>
          <p>Sign up free to access the full feed, follow artists, earn 🦁 LionCoins, and upload your own tracks.</p>
          <button class="btn primary" onclick="renderLanding()" style="font-size:15px;padding:12px 32px;font-family:'Space Grotesk',sans-serif;text-transform:uppercase;letter-spacing:.8px">Sign Up — It's Free →</button>
        </div>`:''}
      </div>

      <!-- ── Feature cards ── -->
      <div class="pub-features">
        <h2>Built For Music Networkers</h2>
        <p class="pub-features-sub">Everything you need to showcase your work, connect with fans, and do business.</p>
        <div class="pub-features-grid">
          <div class="pub-feature-card">
            <div class="pub-feature-icon" style="background:rgba(0,114,255,.08);border:1px solid rgba(0,114,255,.25);color:var(--blue)">⬆️</div>
            <h3>Multi-Platform Uploads</h3>
            <p>Upload tracks exported from Suno, Udio, or any AI music platform. Build a public portfolio your fans can discover and play.</p>
          </div>
          <div class="pub-feature-card">
            <div class="pub-feature-icon" style="background:rgba(217,0,108,.07);border:1px solid rgba(217,0,108,.25);color:var(--pink)">🦁</div>
            <h3>Earn LionCoins</h3>
            <p>Get rewarded for every play, like, comment, and share. Use 🦁 LionCoins in the marketplace or convert them to real value.</p>
          </div>
          <div class="pub-feature-card">
            <div class="pub-feature-icon" style="background:rgba(106,0,244,.07);border:1px solid rgba(106,0,244,.25);color:var(--purple)">🛍️</div>
            <h3>Marketplace &amp; Calls</h3>
            <p>Sell merchandise, beat licenses, and services. Take calls with fans and collaborators directly on the platform.</p>
          </div>
        </div>
      </div>

      <!-- ── Join CTA ── -->
      <div class="pub-join">
        <div class="pub-join-coin">🦁</div>
        <h2>Ready to Earn LionCoins?</h2>
        <p>Sign up free in seconds. Share your first track, connect with artists worldwide, and start earning 🦁 LionCoins today.</p>
        <button class="btn primary" onclick="renderLanding()" style="font-size:16px;padding:14px 44px;font-family:'Space Grotesk',sans-serif;text-transform:uppercase;letter-spacing:1.2px">Join the Network — Free →</button>
      </div>
    </div>

    <div class="pub-footer">© 2026 OK Music™ &mdash; trendai509@gmail.com &mdash; <a href="#" onclick="renderLanding()" style="color:var(--blue)">Sign In / Sign Up</a></div>
  </div>`;

  // Allow play actions to work for guests (audio doesn't require auth)
  $('miniplayer').classList.remove('show');
}
function signInGoogle(){
  const provider=new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'}); // always show account picker so users can switch accounts
  fbAuth.signInWithPopup(provider).catch(e=>{
    if(e.code==="auth/popup-blocked"||e.code==="auth/popup-closed-by-user"){
      fbAuth.signInWithRedirect(provider).catch(e2=>toast("Google sign-in failed: "+(e2.code||e2.message)));
    } else if(e.code!=="auth/cancelled-popup-request"){
      toast("Google sign-in failed: "+(e.code||e.message));
    }
  });
}
fbAuth.getRedirectResult().then(result=>{ if(result&&result.user) console.log("Redirect sign-in OK:",result.user.email); }).catch(e=>{ if(e.code==="auth/unauthorized-domain") toast("Login blocked: domain not authorised in Firebase. ("+location.hostname+")"); else if(e.code&&e.code!=="auth/credential-already-in-use") toast("Google sign-in failed: "+(e.code||e.message)); });
function openEmailAuth(email){
  openOverlay(`<h2>Continue with email</h2><p class="sub">Log in, or create a new account.</p>
    <div class="field"><label>Email</label><input class="fb-field" id="emEmail" type="email" autocomplete="email" value="${esc(email||'')}" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('emPass').focus();}" /></div>
    <div class="field"><label>Password</label><input class="fb-field" id="emPass" type="password" autocomplete="current-password" placeholder="at least 6 characters" onkeydown="if(event.key==='Enter'){event.preventDefault();emailGo('login');}" /></div>
    <div id="emErr" style="color:#e2554f;font-size:13px;min-height:18px;margin-bottom:6px"></div>
    <button class="btn primary block" id="emLoginBtn" data-action="emailgo" data-mode="login">Log in</button>
    <button class="btn block" data-action="emailgo" data-mode="signup" style="margin-top:8px">Create new account</button>`);
  setTimeout(()=>{ const f=$("emEmail"); if(f&&!f.value) f.focus(); else if(f&&f.value){ const p=$("emPass"); if(p) p.focus(); } },50);
}
function emailGo(mode){
  const email=($("emEmail")?.value||"").trim(), pass=$("emPass")?.value||"";
  if(!email||!email.includes("@")) return toast("Enter a valid email");
  if(pass.length<6) return toast("Password must be at least 6 characters");
  const btn=$("emLoginBtn"); if(btn){ btn.disabled=true; btn.textContent="…"; }
  const errEl=$("emErr"); if(errEl) errEl.textContent="";
  const p = mode==="signup" ? fbAuth.createUserWithEmailAndPassword(email,pass) : fbAuth.signInWithEmailAndPassword(email,pass);
  p.then(()=>closeOverlay()).catch(e=>{
    if(btn){ btn.disabled=false; btn.textContent="Log in"; }
    let msg;
    if(e.code==="auth/email-already-in-use") msg="That email already has an account — use Log in.";
    else if(e.code==="auth/user-not-found"||e.code==="auth/invalid-credential"||e.code==="auth/wrong-password") msg="Wrong email or password. Try again or create a new account.";
    else msg="Sign-in failed: "+(e.code||e.message);
    if(errEl) errEl.textContent=msg; else toast(msg);
  });
}
async function loadProfile(uid){ try{ const s=await fbDB.collection("users").doc(uid).get(); return s.exists?{ id:uid, ...s.data() }:null; }catch(e){ console.warn(e); return null; } }
function syncME(){ const d=db(); if(ME){ d.session=ME.id; d.usersById[ME.id]={ id:ME.id, name:ME.name, handle:ME.handle, bio:ME.bio, color:ME.color, avatarImg:ME.avatarImg, bgColor:ME.bgColor, bgImg:ME.bgImg, pageBgImg:ME.pageBgImg||"", pageBgMode:ME.pageBgMode||"stretch", pageBgFilter:ME.pageBgFilter||{} }; } else d.session=null; commit(d); }
function openOnboard(){
  openOverlay(`<h2>Welcome to OK Music 👋</h2><p class="sub">Pick a name and handle to set up your creator profile.</p>
    <div class="field"><label>Display name</label><input class="fb-field" id="obName" placeholder="e.g. Emmanuel Leveille" value="${esc((ME&&ME.name)||'')}" /></div>
    <div class="field"><label>Handle (@username)</label><input class="fb-field" id="obHandle" placeholder="emmanuel" /></div>
    <button class="btn primary block" data-action="finishonboard">Create my profile</button>`);
}
async function finishOnboard(){
  const name=($("obName").value||"").trim(), handle=($("obHandle").value||"").trim().replace(/^@/,"").toLowerCase();
  if(!name||!handle) return toast("Enter a name and handle");
  if(!/^[a-z0-9_]{2,}$/.test(handle)) return toast("Handle: letters, numbers, underscore");
  if(SEED_USERS.some(u=>u.handle===handle)) return toast("That handle is taken");
  try{
    const dup=await fbDB.collection("users").where("handle","==",handle).limit(1).get();
    if(!dup.empty) return toast("That handle is taken");
    const uid=fbAuth.currentUser.uid;
    const prof={ name, handle, bio:"New AI music creator 🎶", color:COLORS[Math.floor(Math.random()*COLORS.length)], avatarImg:(fbAuth.currentUser.photoURL||""), createdAt:Date.now() };
    await fbDB.collection("users").doc(uid).set(prof);
    ME={ id:uid, ...prof }; syncME(); closeOverlay();
    // Send welcome notification
    fbDB.collection("notifications").add({ forUid:uid, type:"welcome", fromUid:"platform", fromName:"OK Music", text:"👋 Welcome to OK Music! Share your music, grow your fanbase, chat & call for free, sell in the Marketplace, earn 🦁 LionCoins for everything you do, and win LNC in 🏆 Prediction Contests. Tap to read the full guide.", time:Date.now(), read:false }).catch(()=>{});
    showWelcomeGuide(name);
  }catch(e){ toast("Couldn't save profile: "+(e.code||e.message)); }
}

function showWelcomeGuide(name){
  openOverlay(`<div class="welcome-guide">
    <div class="wg-header">
      <div style="font-size:36px">🎵</div>
      <h2>Welcome to OK Music, ${esc(name)}!</h2>
      <p class="sub">Your complete guide — music, community, chat, calls, marketplace &amp; LionCoin.</p>
    </div>

    <div class="wg-section">
      <div class="wg-icon">🎵</div>
      <div><b>Share a single track</b><br>
      Tap <b>"Add single track"</b> in the sidebar. Upload an audio file (MP3, M4A, WAV, FLAC…) from your phone or computer — it goes to the cloud so fans on any device can play it instantly. Or paste a public streaming link (SoundCloud, Google Drive, Dropbox…). Add a cover photo, pick a genre, set Public or Private, then publish.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">📁</div>
      <div><b>Share a folder / album / playlist</b><br>
      Tap <b>"Add a folder"</b> to upload a whole set of tracks at once. On <b>mobile</b>: select multiple files and give them a playlist name. On <b>desktop</b> (Chrome / Edge): pick an entire folder from your computer, Google Drive, Dropbox, or iCloud. Every track uploads to the cloud for all your fans.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">🖼️</div>
      <div><b>Photos — all formats supported</b><br>
      Upload photos in <em>any</em> format — JPG, PNG, WEBP, HEIC/HEIF (iPhone), BMP, TIFF, AVIF, and more. This applies to your profile photo, banner, page background, and marketplace product photos. No conversion needed — the platform handles it automatically.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">▶️</div>
      <div><b>Playback &amp; mini-player</b><br>
      Tap any track art or title to play. The <b>mini-player</b> stays at the bottom while you browse. Use the <b>🔁 mode button</b> to switch between:<br>
      &nbsp;• <b>Continuous</b> — plays the whole playlist in order<br>
      &nbsp;• <b>🔀 Shuffle</b> — random order<br>
      &nbsp;• <b>🔂 Repeat one</b> — loops the current track<br>
      Tap the progress bar to seek. Tracks are cached after the first play for offline listening.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">🎨</div>
      <div><b>Personalise your page</b><br>
      Go to <b>"Edit profile"</b> to upload a profile photo, write your bio, set a banner image, and set a full-page background. Choose a colour theme or solid colour for the banner. All changes are saved instantly and visible to every fan on every device.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">👥</div>
      <div><b>Discover, follow &amp; grow your fanbase</b><br>
      Go to <b>Discover</b> to browse all artists and tracks. Search by name. Click <b>Follow</b> on any profile — they'll get a notification.<br><br>
      <b>Privacy option:</b> In <b>⚙️ Settings → Privacy</b>, enable <b>"Approve fans manually"</b>. New followers must send a request — you accept or decline. You can also <b>remove a fan</b> at any time from <b>🫂 My Fans</b>. Post statuses on your Wall to talk to your followers. Fans can <b>like, dislike, and comment</b> on your tracks and posts.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">🟢</div>
      <div><b>Presence status</b><br>
      Your status is shown to your connections — <b>🟢 Online</b> when you're active, <b>⚫ Offline</b> when you close the tab, and <b>🟡 Busy</b> when you want to signal you're unavailable. Toggle <b>Busy</b> from the <b>🫂 My Fans</b> page. Status updates automatically within minutes.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">🔥</div>
      <div><b>Buzzing &amp; My Feed</b><br>
      <b>🔥 Buzzing</b> shows the hottest tracks right now, ranked by plays and likes.<br>
      <b>🏠 My Feed</b> shows the latest posts from artists you follow.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">💬</div>
      <div><b>Private Messenger — end-to-end encrypted</b><br>
      Go to any profile and tap <b>💬 Message</b>. All messages are <b>end-to-end encrypted</b> — only you and the other person can read them. Nobody else, not even the platform, can access the content.<br><br>
      Inside a chat you can:<br>
      &nbsp;• <b>Edit</b> a message you sent (tap ✏️)<br>
      &nbsp;• <b>Delete for me</b> or <b>Delete for everyone</b><br>
      &nbsp;• Send <b>photos, audio, and files</b><br>
      &nbsp;• See the other person's <b>live presence status</b><br>
      You hear a ping when a new message arrives. Privacy settings let you control who can message you.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">📞</div>
      <div><b>Free voice calls</b><br>
      Inside any chat, tap <b>📞 Call</b> to start a free real-time voice call. The other person hears a ring tone and can tap <b>✅ Accept</b> or <b>❌ Decline</b>. Mute yourself, see the call timer. Completely free, peer-to-peer.</div>
    </div>

    <div class="wg-section wg-lion">
      <div class="wg-icon">🦁</div>
      <div><b>LionCoin (LNC) — the OK Music loyalty token</b><br>
      <b>LionCoin is the platform's internal reward currency.</b> Every meaningful action you take on OK Music earns you LNC automatically:<br><br>
      &nbsp;• 🎵 <b>+1 LNC</b> every time someone plays your track (unique per listener per day)<br>
      &nbsp;• ⬆️ <b>+10 LNC</b> when you upload a track<br>
      &nbsp;• 📝 <b>+3 LNC</b> when you post a status<br>
      &nbsp;• 💬 <b>+2 LNC</b> when someone comments on your content, <b>+1 LNC</b> when you write a comment<br>
      &nbsp;• 👍 <b>+0.5 LNC</b> for every reaction your content receives<br>
      &nbsp;• 🫂 <b>+5 LNC</b> for every new fan, plus milestone bonuses at 10, 100, 1 000, and 10 000 fans<br>
      &nbsp;• 🌅 <b>+2 LNC</b> daily login — <b>+50 LNC</b> at a 7-day streak, <b>+300 LNC</b> at 30 days<br><br>
      <b>Your wallet</b> is at <b>🦁 LionCoin</b> in the sidebar. It shows your live balance, total earned, total spent, current streak, and a full transaction history. Your balance is <b>private by default</b> — you can make it public in wallet settings.<br><br>
      <b>Spend LNC:</b><br>
      &nbsp;• In the <b>Marketplace</b>: sellers can set a LNC price on their products. Pay instantly from your wallet — no shipping address needed, no Payoneer. The seller receives 95% and the platform retains a 5% fee.<br>
      &nbsp;• <b>Send directly to any user:</b> tap <b>🦁 Send LNC</b> on their profile, or use <b>💸 Send LionCoins</b> in your wallet to search and send. Enter any amount, add an optional note, and confirm. The transfer is instant and atomic — coins leave your account and arrive in theirs simultaneously. Both parties receive a full transaction record.<br><br>
      <b>The value of LionCoin</b> is entirely determined by users. The platform does not set an exchange rate. When two users agree to exchange goods, services, or collaborations for LNC, the price is theirs to negotiate freely. The more the community values LNC, the more it is worth.<br><br>
      <b>What LionCoin can become:</b> Today it is a loyalty and exchange token within OK Music. As the community grows, LionCoin is designed to evolve — potential future directions include redemption with affiliated external partners (studios, distributors, equipment suppliers), a creator economy where top artists earn meaningful income purely from fan engagement, and a community-governed rate that reflects the real demand for music on the platform. The coin's trajectory depends on you.</div>
    </div>

    <div class="wg-section wg-lion">
      <div class="wg-icon">🏆</div>
      <div><b>Prediction Contests — win LionCoins</b><br>
      Click <b>🏆 Contests</b> in the sidebar to see all active prediction contests. Each contest poses a question about music, the charts, or the OK Music community — and awards a <b>🦁 LNC prize to every user who picks the correct answer</b>.<br><br>
      <b>How to play:</b><br>
      &nbsp;• Browse open contests and read the question carefully<br>
      &nbsp;• Tap the answer you believe is correct — a <b>"Validate your answer"</b> confirmation screen shows the prize before you commit<br>
      &nbsp;• Your pick is <b>locked in permanently</b> — one pick per contest, no changes after confirming<br>
      &nbsp;• Contests show a pulsing 🟢 <b>Open</b> badge while they are active<br><br>
      <b>Winning:</b><br>
      When the admin resolves a contest by selecting the correct answer, <b>every user who picked right receives the full prize instantly</b> — credited automatically to your 🦁 LionCoin wallet. Your contest card turns green and shows a 🎉 banner with the amount you won. The transaction appears in your wallet history as a <b>contest_win</b>.<br><br>
      <b>If the result is corrected:</b><br>
      If an error is discovered after resolution, the admin can correct the answer with a mandatory written reason. The correction and reason are logged publicly in the contest's audit trail. Coins are automatically reversed from incorrect winners and re-credited to the correct ones — everything is transparent.<br><br>
      <b>Prizes:</b> Each contest card shows the prize amount in the gold <b>🦁 chip</b> at the top right. Prizes vary — the bigger the question, the bigger the reward. Keep an eye on the Contests page so you never miss an open contest!</div>
    </div>

    <div class="wg-section wg-market">
      <div class="wg-icon">🛍️</div>
      <div><b>Marketplace — buy &amp; sell</b><br>
      Click <b>MARKETPLACE</b> in the sidebar.<br><br>
      <b>🏪 Sell:</b> Open your store, list products with photos, description, USD price, and an optional <b>LNC price</b>. You receive 97% of each USD sale (3% fee), or 95% of each LNC sale (5% fee) paid instantly to your wallet.<br><br>
      <b>🛒 Buy:</b> Browse all products, tap any photo to zoom, add to cart. Pay by Payoneer (USD) <em>or</em> by LionCoin if the seller accepts it. LNC purchases are instant — no checkout form needed.</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">🔒</div>
      <div><b>Privacy &amp; Security</b><br>
      &nbsp;• <b>Private profile</b> — only followers see your tracks and posts<br>
      &nbsp;• <b>Approve fans manually</b> — control who can follow you<br>
      &nbsp;• <b>Who can message / call me</b> — Everyone, Followers only, or Nobody<br>
      &nbsp;• <b>Hide from Discover &amp; Search</b> — stay invisible to browsing users<br>
      &nbsp;• <b>Block &amp; Report</b> any user from their profile<br>
      &nbsp;• <b>Security Centre</b> — see all active sessions, sign out remotely, view your activity log<br>
      All settings in <b>⚙️ Settings</b> (sidebar or your profile).</div>
    </div>

    <div class="wg-section">
      <div class="wg-icon">💡</div>
      <div><b>Good to know</b><br>
      &nbsp;• Tap any profile photo to view it full size<br>
      &nbsp;• Your music is yours — only you can edit or delete your tracks<br>
      &nbsp;• <b>🔒 Private</b> tracks are visible only to you<br>
      &nbsp;• Add a streaming link to any existing track: <b>My Music → track menu → 🔗 Add streaming link</b><br>
      &nbsp;• Use <b>💡 Suggest a Feature</b> in the sidebar to send us ideas — we read every one<br>
      &nbsp;• Sign in with Google or email on any device to access your full profile, music, and wallet</div>
    </div>

    <button class="btn primary block" data-action="close" style="margin-top:20px;font-size:16px;padding:14px">Let's go! 🚀</button>
  </div>`);
}

// ============ APP SHELL ============
// ── Account dropdown for new horizontal nav ──
let _navMenuOpen=false;
function toggleNavMenu(){
  _navMenuOpen=!_navMenuOpen;
  const existing=document.querySelector('.snav-acct-menu');
  if(!_navMenuOpen||existing){ if(existing) existing.remove(); _navMenuOpen=false; return; }
  const acct=$('snavAcct'); if(!acct) return;
  const u=currentUser();
  const menu=document.createElement('div');
  menu.className='snav-acct-menu';
  menu.innerHTML=`
    <div class="snav-acct-menu-item" data-action="profile" data-uid="${u.id}">😊 Your profile</div>
    <div class="snav-acct-menu-item" data-action="nav" data-view="mymusic">🎵 Your uploads</div>
    <div class="snav-acct-menu-item" data-action="nav" data-view="wallet">🦁 Sales &amp; payouts</div>
    <div class="snav-acct-menu-item" data-action="nav" data-view="fans">🫂 My Fans</div>
    <div class="snav-acct-menu-item" data-action="nav" data-view="contests">🏆 Contests</div>
    <div class="snav-acct-menu-item" data-action="nav" data-view="buzzing">🔥 Buzzing</div>
    <div class="snav-acct-menu-item" data-action="nav" data-view="notifs">🔔 Notifications</div>
    <div class="snav-acct-menu-divider"></div>
    <div class="snav-acct-menu-item" data-action="upload">⬆️ Upload track</div>
    <div class="snav-acct-menu-item" data-action="sharefolder">📁 Add folder</div>
    <div class="snav-acct-menu-item" data-action="openmarketplace">🛍️ Marketplace</div>
    <div class="snav-acct-menu-item" data-action="invite">✉️ Invite friends</div>
    ${(()=>{const myOrders=(CACHE.orders||[]).filter(o=>o.buyerId===u.id);return myOrders.length?`<div class="snav-acct-menu-item" data-action="nav" data-view="myorders">📦 My Orders (${myOrders.length})</div>`:''})()}
    <div class="snav-acct-menu-divider"></div>
    <div class="snav-acct-menu-item" data-action="customize">🎨 Edit profile</div>
    <div class="snav-acct-menu-item" data-action="suggest">💡 Suggest a feature</div>
    ${isAdmin()?`<div class="snav-acct-menu-divider"></div>
    <div class="snav-acct-menu-item" data-action="nav" data-view="admin">📊 Admin Stats</div>
    <div class="snav-acct-menu-item" data-action="nav" data-view="contests">🏆 Resolve Contests</div>`:''}
    <div class="snav-acct-menu-divider"></div>
    <div class="snav-acct-menu-item danger" data-action="logout">↩️ Log out</div>`;
  acct.appendChild(menu);
  setTimeout(()=>{
    document.addEventListener('click',function _closeNavMenu(e){
      if(!acct.contains(e.target)){ menu.remove(); _navMenuOpen=false; document.removeEventListener('click',_closeNavMenu); }
    });
  },0);
}

// ── Site footer helper ──
function siteFooter(){
  return`<div class="site-footer">
    <div>© 2026 OK Music™ — Connecting Artists &amp; Empowering Music Communities.</div>
    <div class="site-footer-links">
      <a href="#" data-action="nav" data-view="discover">Discover</a>
      <a href="#" data-action="nav" data-view="home">Feed</a>
      <a href="#" data-action="openmarketplace">Marketplace</a>
      <a href="#" data-action="nav" data-view="msgs">Messages</a>
    </div>
  </div>`;
}

function renderApp(){
  const u=currentUser();
  const unMsgs=Object.values(CACHE.convos||{}).reduce((s,c)=>s+((c.unread||{})[ME?.id]||0),0);
  const unNotifs=(CACHE.notifications||[]).filter(x=>!x.read).length;
  const isChat=state.view==='msgs'||state.view==='chat';
  const isMktActive=state.view==='marketplace'||state.view==='mystore'||state.view==='cart';
  const isMore=['wallet','contests','mymusic','fans','myorders','admin','buzzing','notifs','trackdetail'].includes(state.view);
  const nb=n=>n?`<span class="mobnav-badge">${n>9?'9+':n}</span>`:'';
  const navLnk=(view,label,extra='')=>{
    const active=state.view===view||(view==='msgs'&&isChat)||(view==='marketplace'&&isMktActive);
    return`<button class="snav-link${active?' active':''}" data-action="nav" data-view="${view}">${label}${extra}</button>`;
  };
  const msgBadge=unMsgs?`<span style="display:inline-flex;align-items:center;justify-content:center;margin-left:4px;width:18px;height:18px;font-size:10px;border-radius:9px;background:var(--pink);color:#fff;vertical-align:middle">${unMsgs>9?'9+':unMsgs}</span>`:'';

  $("root").innerHTML=`
    <div class="app-bg-grid"></div>
    <div class="app-bg-glow"></div>
    <nav class="site-nav">
      <div class="snav-brand" data-action="nav" data-view="discover">OK<span>MUSIC</span><span class="snav-badge">Social Hub</span></div>
      <div class="snav-links">
        ${navLnk('discover','Discover')}
        ${navLnk('home','Feed')}
        ${navLnk('marketplace','Marketplace')}
        ${navLnk('msgs','Messages',msgBadge)}
      </div>
      <input class="snav-search" id="search" placeholder="Search artists & tracks…" value="${esc(state.query)}" />
      <div class="snav-right">
        <div class="snav-lnc" data-action="nav" data-view="wallet" title="LionCoin balance">🦁 ${(CACHE.wallet?.balance||0).toLocaleString()} LNC</div>
        <div class="snav-mail-btn" data-action="nav" data-view="msgs" title="Messages">✉️${unMsgs?'<span class="snav-mail-badge"></span>':''}</div>
        <div class="snav-acct" id="snavAcct">
          <div style="${avatarStyle(u,32)};width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;font-size:12px;flex-shrink:0">${u.avatarImg?'':initials(u.name)}</div>
          <span class="snav-acct-handle">@${esc(u.handle||u.name)}</span>
          <span class="snav-caret">▼</span>
        </div>
      </div>
    </nav>
    <div class="app-content-wrap" id="page"></div>
    <nav class="mobnav" id="mobnav">
      <div class="mobnav-item ${state.view==='discover'?'active':''}" data-action="nav" data-view="discover"><span class="mn-ic">🧭</span>Discover</div>
      <div class="mobnav-item ${state.view==='home'?'active':''}" data-action="nav" data-view="home"><span class="mn-ic">🏠</span>Feed</div>
      <div class="mobnav-item ${isChat?'active':''}" data-action="nav" data-view="msgs">${nb(unMsgs)}<span class="mn-ic">💬</span>Chat</div>
      <div class="mobnav-item ${state.view==='notifs'?'active':''}" data-action="nav" data-view="notifs">${nb(unNotifs)}<span class="mn-ic">🔔</span>Alerts</div>
      <div class="mobnav-item ${state.view==='profile'&&state.profileId===u.id?'active':''}" data-action="profile" data-uid="${u.id}"><span class="mn-ic">😊</span>Me</div>
      <div class="mobnav-item ${isMore||isMktActive?'active':''}" data-action="mobmenu"><span class="mn-ic">⋯</span>More</div>
    </nav>`;
  renderMain();
  setTimeout(()=>{
    const s=$("search"); if(s) s.oninput=e=>{ state.query=e.target.value; if(state.view!=='discover') state.view='discover'; renderMain(); };
    const acct=$("snavAcct"); if(acct) acct.onclick=e=>{
      if(e.target.closest('.snav-acct-menu')){
        const m=document.querySelector('.snav-acct-menu'); if(m){ m.remove(); _navMenuOpen=false; }
        return;
      }
      e.stopPropagation(); toggleNavMenu();
    };
    const nav=$("mobnav"); const mp=$("miniplayer");
    if(nav&&mp){ const h=nav.getBoundingClientRect().height; if(h>0) mp.style.bottom=h+"px"; }
  },0);
}
function openMobMenu(){
  // Remove any existing sheet
  const old=$('mobSheet'); if(old) old.remove();
  const backdrop=$('mobBackdrop'); if(backdrop) backdrop.remove();

  const myOrders=(CACHE.orders||[]).filter(o=>o.buyerId===ME?.id);
  const lnc=(CACHE.wallet?.balance||0).toLocaleString();

  const go=(view)=>{ closeMobMenu(); state.view=view; renderApp(); };

  // Build sheet items
  const items=[
    {ic:'🦁',label:`LionCoin · ${lnc}`,fn:()=>go('wallet')},
    {ic:'🏆',label:'Contests',fn:()=>go('contests')},
    {ic:'🎵',label:'My Music',fn:()=>go('mymusic')},
    {ic:'🫂',label:'My Fans',fn:()=>go('fans')},
    {ic:'🔥',label:'Buzzing',fn:()=>go('buzzing')},
    {ic:'🛍️',label:'Marketplace',fn:()=>{ closeMobMenu(); openMarketplace(); }},
    ...(myOrders.length?[{ic:'📦',label:`My Orders (${myOrders.length})`,fn:()=>go('myorders')}]:[]),
    ...(isAdmin()?[{ic:'📊',label:'Admin Stats',fn:()=>go('admin')}]:[]),
    {ic:'⬆️',label:'Add track',fn:()=>{ closeMobMenu(); openUpload(); }},
    {ic:'📁',label:'Add folder',fn:()=>{ closeMobMenu(); shareMusicFolder(); }},
    {ic:'🎨',label:'Edit profile',fn:()=>{ closeMobMenu(); openCustomize(); }},
    {ic:'💡',label:'Suggest a feature',fn:()=>{ closeMobMenu(); openSuggest(); }},
    {ic:'↩️',label:'Log out',fn:()=>{ closeMobMenu(); logout(); }},
  ];

  // Backdrop
  const bd=document.createElement('div');
  bd.id='mobBackdrop'; bd.className='mob-backdrop';
  bd.onclick=closeMobMenu;
  document.body.appendChild(bd);

  // Sheet
  const sheet=document.createElement('div');
  sheet.id='mobSheet'; sheet.className='mob-sheet';
  sheet.innerHTML=`
    <div class="mob-sheet-handle"></div>
    <div class="mob-sheet-title">Menu</div>
    <div class="mob-sheet-grid">
      ${items.map((it,i)=>`<div class="mob-sheet-item" data-idx="${i}"><span class="ms-ic">${it.ic}</span><span class="ms-lb">${it.label}</span></div>`).join('')}
    </div>
  `;
  document.body.appendChild(sheet);

  // Attach click handlers after insertion
  sheet.querySelectorAll('.mob-sheet-item').forEach(el=>{
    const idx=parseInt(el.dataset.idx);
    el.onclick=()=>items[idx].fn();
  });

  // Animate in
  requestAnimationFrame(()=>{ sheet.classList.add('open'); bd.classList.add('open'); });
}

function closeMobMenu(){
  const sheet=$('mobSheet'); const bd=$('mobBackdrop');
  if(sheet){ sheet.classList.remove('open'); setTimeout(()=>sheet.remove(),260); }
  if(bd){ bd.classList.remove('open'); setTimeout(()=>bd.remove(),260); }
}

function renderMain(){
  if(!ME){ renderPublicDiscover(); return; }   // guest — always show public discover
  if(state.view!=="chat" && msgUnsub){ msgUnsub(); msgUnsub=null; }
  const _visU=state.view==="profile"?userById(state.profileId):null;
  if(_visU){
    // Viewing someone's profile — show only their background, never the viewer's
    if(_visU.pageBgImg) _setBgStyle(_visU.pageBgImg,_visU.pageBgMode||"stretch",_visU.pageBgFilter||{});
    else _clearBg();
  } else {
    // Own pages (feed, my music, etc.) — show own background
    if(ME&&ME.pageBgImg) _setBgStyle(ME.pageBgImg,ME.pageBgMode||"stretch",ME.pageBgFilter||{});
    else _clearBg();
  }
  if(state.view==="profile") return renderProfile(state.profileId);
  if(state.view==="mymusic") return renderMyMusic();
  if(state.view==="fans") return renderFans();
  if(state.view==="buzzing") return renderBuzzing();
  if(state.view==="notifs") return renderNotifs();
  if(state.view==="msgs") return renderMessages();
  if(state.view==="chat") return openChat(state.chatUid);
  if(state.view==="home") return renderHome();
  if(state.view==="marketplace") return renderMarketplace();
  if(state.view==="mystore") return renderSellerStore();
  if(state.view==="cart") return renderCart();
  if(state.view==="myorders") return renderMyOrders();
  if(state.view==="wallet") return renderWallet();
  if(state.view==="contests") return renderContests();
  if(state.view==="admin"&&isAdmin()) return renderAdmin();
  if(state.view==="trackdetail") return renderTrackDetail(state.trackId);
  renderDiscover();
}

// ---------- discover v2 (hero + trending + library + promo feed) ----------
function renderDiscover(){
  const u=currentUser();
  const q=state.query.trim().toLowerCase();
  const blockedList=ME?.blockedUsers||[];
  const publicTracks=allTracks().filter(t=>t.visibility==='public'&&!blockedList.includes(t.userId)&&!getPrivacy(userById(t.userId)).hideFromDiscover);

  // Genre folders
  const genreMap={};
  publicTracks.forEach(t=>{ const g=(t.genre&&t.genre.trim())||'Unknown'; if(!genreMap[g])genreMap[g]=[]; genreMap[g].push(t); });
  const knownOrder=[...GENRES,'Unknown'];
  const sortedGenres=Object.keys(genreMap).sort((a,b)=>{ const ai=knownOrder.indexOf(a),bi=knownOrder.indexOf(b); if(ai===-1&&bi===-1) return a.localeCompare(b); return(ai===-1?999:ai)-(bi===-1?999:bi); });
  let foldersHtml=''; let artistSec='';
  sortedGenres.forEach(g=>{ let tracks=genreMap[g].slice().sort((a,b)=>b.createdAt-a.createdAt); if(q) tracks=tracks.filter(t=>t.title.toLowerCase().includes(q)||(userById(t.userId)?.name||'').toLowerCase().includes(q)); if(q&&!tracks.length) return; const sid=g.replace(/[^a-zA-Z0-9]/g,'_'); foldersHtml+=discoverFolder(g,tracks,sid); });
  if(q){ const artists=allUsers().filter(us=>us&&!blockedList.includes(us.id)&&!getPrivacy(us).hideFromDiscover&&(us.name.toLowerCase().includes(q)||(us.handle||'').toLowerCase().includes(q))).slice(0,8); if(artists.length) artistSec=`<div class="col-h" style="margin-top:0;margin-bottom:10px">🎤 Artists</div><div style="margin-bottom:16px">${artists.map(userCard).join('')}</div>`; }
  const discPosts=(CACHE.discoveryPosts||[]).filter(p=>!blockedList.includes(p.userId));

  // Search mode: abbreviated layout
  if(q){
    $('page').innerHTML=`<div class="disc-v2-wrap">
      <div class="disc-section-hd">🔍 Results for "${esc(state.query)}"</div>
      <div class="disc-lower">
        <div>${artistSec}${foldersHtml||`<div class="empty" style="padding:20px 0">No results for "${esc(state.query)}".</div>`}</div>
        <div>
          <div class="disc-section-hd">📣 Discovery Feed</div>
          ${pinnedContestBanner()}${discoverComposer()}
          <div id="discFeedList">${discPosts.length?discPosts.map(discoverPostCard).join(''):'<div class="empty" style="padding:16px 0;text-align:center">No promotions yet.</div>'}</div>
        </div>
      </div>
      ${siteFooter()}
    </div>`;
    return;
  }

  // Trending: 8 most recent public tracks
  const trending=publicTracks.slice().sort((a,b)=>b.createdAt-a.createdAt).slice(0,8);
  const featured=allTracks().find(t=>t.id==='t7')||trending[0];
  const featuredArtist=featured?userById(featured.userId):null;
  const featuredArt=featured?(featured.coverImg?`background-image:url('${featured.coverImg}');background-size:cover;background-position:center`:`background:${grad(featured.accent)}`):'background:linear-gradient(135deg,#0072ff,#6a00f4)';
  const totalTracks=publicTracks.length; const totalUsers=allUsers().filter(u=>u).length;

  const welcomeHtml=u?`<div class="disc-welcome">
    <div style="${avatarStyle(u,42)};width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;font-size:16px;flex-shrink:0">${u.avatarImg?'':initials(u.name)}</div>
    <div class="disc-welcome-info">
      <div class="disc-welcome-name">Welcome back, ${esc(u.name.split(' ')[0])} 👋</div>
      <div class="disc-welcome-sub">@${esc(u.handle||u.name)} · ${nfmt(totalTracks)} tracks in the library</div>
    </div>
    <button class="btn sm primary" data-action="upload" style="flex-shrink:0">⬆️ Upload</button>
  </div>`:'';

  const trendingHtml=trending.length?trending.map(t=>{ const tu=userById(t.userId); const as=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
    return`<div class="disc-track-card" data-action="play" data-id="${t.id}">
      <div class="disc-track-art" style="${as}">${t.coverImg?'':'◎'}</div>
      <div class="disc-track-info">
        <div class="disc-track-title">${esc(t.title)}</div>
        <div class="disc-track-artist" data-action="profile" data-uid="${tu?.id||''}">${esc(tu?.name||'Unknown')}</div>
      </div>
      <span class="disc-track-genre">${esc(t.genre||'Music')}</span>
      <button class="disc-track-play" data-action="play" data-id="${t.id}">▶</button>
    </div>`;}).join(''):'<div class="empty" style="padding:20px 0">No tracks yet — be the first to upload!</div>';

  const statFmt=n=>n>999?`${Math.floor(n/100)/10}K`:n||'—';

  $('page').innerHTML=`<div class="disc-v2-wrap">
    ${welcomeHtml}
    <div class="disc-hero">
      <div>
        <div class="disc-eyebrow"><span class="disc-eyebrow-dot"></span> Music Community Network</div>
        <h1 class="disc-h1">Share Your Music,<br><span class="disc-h1-grad">Connect &amp; Do Business</span></h1>
        <p class="disc-sub">Upload tracks from any AI music platform, connect with fans, build a following, and earn 🦁 LionCoins for every play and interaction.</p>
        <div class="disc-ctas">
          <button class="btn-primary-grad" data-action="upload">⬆️ Upload Track</button>
          <button class="btn-secondary-outline" data-action="nav" data-view="home">View Feed</button>
        </div>
      </div>
      <div class="disc-player-card">
        <div class="disc-player-art" style="${featuredArt}">
          <div class="disc-eq-bars"><div class="nbar"></div><div class="nbar"></div><div class="nbar"></div><div class="nbar"></div><div class="nbar"></div></div>
        </div>
        <div class="disc-player-meta">
          <div class="disc-player-title">${featured?esc(featured.title):'OK Music Library'}</div>
          <div class="disc-player-artist">${featuredArtist?esc(featuredArtist.name):'Discover artists'}</div>
        </div>
        ${featured?`<button class="btn primary block" data-action="play" data-id="${featured.id}" style="margin-top:10px">▶ Play Now</button>`:''}
        <div class="disc-player-progress"><div class="disc-player-fill"></div></div>
      </div>
    </div>
    <div class="disc-stats">
      <div class="disc-stat"><div class="disc-stat-n">${statFmt(totalTracks)}<em>+</em></div><div class="disc-stat-l">Shared Tracks</div></div>
      <div class="disc-stat"><div class="disc-stat-n">${statFmt(totalUsers)}</div><div class="disc-stat-l">Active Members</div></div>
      <div class="disc-stat"><div class="disc-stat-n">100<em>%</em></div><div class="disc-stat-l">Creator Owned</div></div>
      <div class="disc-stat"><div class="disc-stat-n">24<em>/7</em></div><div class="disc-stat-l">Live Network</div></div>
    </div>
    <div class="disc-trending">
      <div class="disc-trending-hd">🔥 Trending Tracks <span class="disc-section-sub">Most recent · all genres</span></div>
      ${trendingHtml}
    </div>
    <div class="disc-features">
      <h2 class="disc-features-hd">Built For Music Networkers</h2>
      <p class="disc-features-sub">Everything you need to showcase your work, connect with fans, and do business.</p>
      <div class="disc-features-grid">
        <div class="disc-feature-card"><div class="disc-feature-icon" style="background:rgba(0,114,255,.08);border:1px solid rgba(0,114,255,.25);color:var(--blue)">⬆️</div><h3>Multi-Platform Uploads</h3><p>Upload tracks exported from Suno, Udio, or any AI music platform. Build a public portfolio your fans can discover and play.</p></div>
        <div class="disc-feature-card"><div class="disc-feature-icon" style="background:rgba(217,0,108,.07);border:1px solid rgba(217,0,108,.25);color:var(--pink)">🦁</div><h3>Earn LionCoins</h3><p>Get rewarded for every play, like, comment, and share. Use 🦁 LionCoins in the marketplace or convert them to real value.</p></div>
        <div class="disc-feature-card"><div class="disc-feature-icon" style="background:rgba(106,0,244,.07);border:1px solid rgba(106,0,244,.25);color:var(--purple)">🛍️</div><h3>Marketplace &amp; Calls</h3><p>Sell merchandise, beat licenses, and services. Take calls with fans and collaborators directly on the platform.</p></div>
      </div>
    </div>
    <div class="disc-lower">
      <div>
        <div class="disc-section-hd">🎵 Music Library</div>
        ${foldersHtml||'<div class="empty" style="padding:20px 0">No tracks yet — be the first to upload!</div>'}
      </div>
      <div>
        <div class="disc-section-hd">📣 Discovery Feed</div>
        ${pinnedContestBanner()}${discoverComposer()}
        <div id="discFeedList">${discPosts.length?discPosts.map(discoverPostCard).join(''):'<div class="empty" style="padding:16px 0;text-align:center">No promotions yet.<br><span style="font-size:13px;color:var(--muted)">Be the first to showcase your music.</span></div>'}</div>
      </div>
    </div>
    ${siteFooter()}
  </div>`;
}

function discoverFolder(genre, tracks, sid){
  const open=state.openFolders.has(sid);
  const rows=tracks.map(t=>{
    const u=userById(t.userId);
    const artStyle=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
    return `<div class="mf-track">
      <div class="mf-art" style="${artStyle}" data-action="play" data-id="${t.id}">${t.coverImg?'':'◎'}</div>
      <div class="mf-info">
        <div class="mf-title" data-action="play" data-id="${t.id}">${esc(t.title)}</div>
        <div class="mf-artist" data-action="profile" data-uid="${u?.id||''}">${esc(u?.name||'Unknown')}</div>
      </div>
      <span class="mf-plays">▶ ${nfmt(playCount(t.id))}</span>
      <button class="mf-play-btn" data-action="play" data-id="${t.id}">▶</button>
    </div>`;
  }).join('');
  return `<div class="music-folder${open?' open':''}" id="mfolder-${sid}">
    <div class="music-folder-hd" data-action="togglefolder" data-genre="${sid}">
      <span class="mf-arrow" id="mfarrow-${sid}">${open?'▼':'▶'}</span>
      <span class="mf-icon">📁</span>
      <span class="mf-name">${esc(genre)}</span>
      <span class="mf-count">${tracks.length}</span>
    </div>
    <div class="music-folder-body" id="mfbody-${sid}" style="display:${open?'block':'none'}">${rows}</div>
  </div>`;
}

function pinnedContestBanner(){
  const now=Date.now();
  const openContests=(CACHE.contests||[]).filter(c=>c.status==='open');
  if(!openContests.length) return '';
  const c=openContests.sort((a,b)=>b.createdAt-a.createdAt)[0];
  const myPick=c.picks?.[ME?.id];
  const deadlinePassed=c.deadline&&now>c.deadline;
  const fmtDl=ts=>new Date(ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  let pickSection='';
  if(myPick){
    const myOpt=c.options?.find(o=>o.id===myPick.optionId);
    pickSection=`<div class="disc-pin-locked">🔒 Your pick: <b>${esc(myOpt?.label||'?')}</b> — awaiting result</div>`;
  } else if(deadlinePassed){
    pickSection=`<div class="disc-pin-locked disc-pin-locked-wait">🕐 Voting closed — result coming soon</div>`;
  } else if(!ME){
    pickSection=`<div class="disc-pin-opts"><p class="disc-pin-signin">Sign in to submit your pick and win LNC</p></div>`;
  } else {
    pickSection=`<div class="disc-pin-opts">${(c.options||[]).map(o=>`<button class="disc-pin-opt-btn" data-action="pickcontestoption" data-contestid="${c.id}" data-optionid="${o.id}">${esc(o.label)}</button>`).join('')}</div>`;
  }
  const deadlineRow=c.deadline&&!deadlinePassed?`<div class="disc-pin-deadline">⏰ Vote by <b>${fmtDl(c.deadline)}</b></div>`
    :deadlinePassed?`<div class="disc-pin-deadline" style="color:var(--muted)">🕐 Voting has closed</div>`:'';
  return `<div class="disc-pinned-contest">
    ${c.posterUrl?`<div class="disc-pin-poster" style="background-image:url('${esc(c.posterUrl)}')"></div>`:''}
    <div class="disc-pin-hd">
      <span class="disc-pin-label">📌 Active Challenge</span>
      <span class="disc-pin-prize">🦁 ${c.prize.toLocaleString()} LNC</span>
    </div>
    <div class="disc-pin-title">${esc(c.title)}</div>
    ${deadlineRow}
    ${pickSection}
    <button class="btn sm" data-action="nav" data-view="contests" style="width:100%;margin-top:8px;font-size:12px">See all contests →</button>
  </div>`;
}

function discoverComposer(){
  if(!ME) return `<div class="disc-composer" style="text-align:center">
    <p style="color:var(--muted);font-size:14px;margin:0 0 10px">Sign in to promote your music & items here.</p>
    <button class="btn primary sm" data-action="signin">Sign in</button>
  </div>`;
  const art=_discMode==='article';
  return `<div class="disc-composer${art?' disc-composer-article':''}">
    <div class="disc-mode-tabs">
      <button class="disc-mode-tab${!art?' active':''}" data-action="setdiscmode" data-mode="short">✏️ Quick post</button>
      <button class="disc-mode-tab${art?' active':''}" data-action="setdiscmode" data-mode="article">📝 Article</button>
    </div>
    ${art?`<input id="discTitleInput" class="disc-title-input" placeholder="Article headline (optional)" maxlength="120" />`:''}
    <textarea id="discoverText" placeholder="${art?'Write your article — share news, insights or a story about your music…':"Promote your track, album or marketplace item… e.g. 'Just dropped my new EP — check it out!'"}" style="min-height:${art?'200px':'62px'}"></textarea>
    <div id="discAttachPreview"></div>
    <div class="disc-composer-actions">
      ${!art?`<button class="btn sm" data-action="attachdiscovertrack">🎵 Attach track</button>
      <button class="btn sm" data-action="attachdiscoverproduct">🛒 Attach item</button>`:''}
      <button class="btn sm primary" data-action="postdiscover" style="margin-left:auto">${art?'Publish Article':'Post'}</button>
    </div>
  </div>`;
}

function discoverPostCard(p){
  const u=userById(p.userId); if(!u) return '';
  const {html:postHtml,firstUrl:postUrl}=linkifyText(p.text||'');
  const likeKey='dp_'+p.id;
  const liked=(CACHE.reactions[likeKey]?.likes||[]).includes(ME?.id);
  const lc=(CACHE.reactions[likeKey]?.likes||[]).length;
  const canDelete=ME&&(ME.id===p.userId||isAdmin());
  const isArticle=p.type==='article';
  const isLong=(p.text||'').length>500;

  let trackHtml='';
  if(p.trackId){
    const t=CACHE.tracks.find(x=>x.id===p.trackId);
    if(t){
      const artStyle=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
      trackHtml=`<div class="disc-attach-track" data-action="play" data-id="${t.id}">
        <div class="dat-art" style="${artStyle}">${t.coverImg?'':'◎'}</div>
        <div class="dat-info"><div class="dat-title">${esc(t.title)}</div><div class="dat-sub">${esc(userById(t.userId)?.name||'')} · ${esc(t.genre||'Music')}</div></div>
        <button class="dat-play" data-action="play" data-id="${t.id}">▶</button>
      </div>`;
    }
  }
  let productHtml='';
  if(p.productId){
    const prod=CACHE.products.find(x=>x.id===p.productId);
    if(prod){
      const photo=prod.photos&&prod.photos[0];
      productHtml=`<div class="disc-attach-product" data-action="viewproduct" data-id="${prod.id}">
        <div class="dap-photo" style="${photo?`background-image:url('${photo}');background-size:cover;background-position:center`:'background:var(--orange-1)'}">${photo?'':'📦'}</div>
        <div class="dap-info"><div class="dap-title">${esc(prod.title)}</div><div class="dap-price">$${parseFloat(prod.price).toFixed(2)}</div></div>
        <span class="dap-arrow">→</span>
      </div>`;
    }
  }
  return `<div class="disc-post${isArticle?' disc-post-article':''}">
    <div class="disc-post-top">
      <div class="avatar" style="${avatarStyle(u,36)};cursor:pointer" data-action="viewavatar" data-uid="${u.id}">${u.avatarImg?'':initials(u.name)}</div>
      <div style="flex:1;min-width:0">
        <div class="sname" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div>
        <div class="stime">${timeAgo(p.time)}${isArticle?' · 📝 Article':''}</div>
      </div>
      ${canDelete?`<button class="btn sm" data-action="deletediscpost" data-id="${p.id}" style="color:#e2554f;border-color:#e2554f">🗑</button>`:''}
    </div>
    ${isArticle&&p.title?`<div class="disc-article-title">${esc(p.title)}</div>`:''}
    ${p.text?`<div class="disc-post-text${isLong?' long':''}${isLong&&_expandedPosts.has(p.id)?' expanded':''}" id="dpt-${p.id}">${postHtml}</div>
    ${isLong?`<button class="disc-read-more-btn" data-action="togglereadmore" data-pid="${p.id}">${_expandedPosts.has(p.id)?'Show less ↑':'Read more →'}</button>`:''}
    ${lpTag(postUrl)}`:''}
    ${trackHtml}${productHtml}
    <div class="disc-post-actions">
      <button class="${liked?'on':''}" data-action="likediscpost" data-id="${p.id}">👍 ${nfmt(lc)}</button>
    </div>
  </div>`;
}

async function postToDiscover(){
  if(!ME) return openEmailAuth();
  const text=($('discoverText')?.value||'').trim();
  const title=($('discTitleInput')?.value||'').trim();
  const {trackId,productId}=_discAttach;
  const art=_discMode==='article';
  if(!text&&!trackId&&!productId) return toast('Write something or attach a track/item to post');
  try{
    const doc={userId:ME.id,text:text||'',trackId:trackId||null,productId:productId||null,time:Date.now()};
    if(art){ doc.type='article'; if(title) doc.title=title; }
    await fbDB.collection('discoveryPosts').add(doc);
    _discAttach={trackId:null,productId:null};
    toast(art?'Article published! 📝':'Posted to Discovery Feed 📣');
    renderDiscover(); setTimeout(fetchLinkPreviews,0);
  }catch(e){ toast(e.message||'Failed to post'); }
}

function openAttachTrack(){
  if(!ME) return openEmailAuth();
  const myTracks=allTracks().filter(t=>t.userId===ME.id&&t.visibility==='public').sort((a,b)=>b.createdAt-a.createdAt);
  if(!myTracks.length) return toast('You have no public tracks to attach');
  const rows=myTracks.map(t=>{
    const artStyle=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
    return `<div class="mf-track" style="cursor:pointer" data-action="selectdisctrack" data-id="${t.id}">
      <div class="mf-art" style="${artStyle}">${t.coverImg?'':'◎'}</div>
      <div class="mf-info"><div class="mf-title">${esc(t.title)}</div><div class="mf-artist">${esc(t.genre||'')}</div></div>
    </div>`;
  }).join('');
  openOverlay(`<h2>🎵 Select a track to attach</h2><div style="margin-top:12px">${rows}</div>`);
}

function openAttachProduct(){
  if(!ME) return openEmailAuth();
  const myProducts=CACHE.products.filter(p=>p.sellerId===ME.id).sort((a,b)=>b.createdAt-a.createdAt);
  if(!myProducts.length) return toast('You have no products listed in the marketplace');
  const rows=myProducts.map(p=>{
    const photo=p.photos&&p.photos[0];
    return `<div class="mf-track" style="cursor:pointer" data-action="selectdiscproduct" data-id="${p.id}">
      <div class="mf-art" style="${photo?`background-image:url('${photo}');background-size:cover;background-position:center`:'background:var(--orange-1)'}">${photo?'':'📦'}</div>
      <div class="mf-info"><div class="mf-title">${esc(p.title)}</div><div class="mf-artist">${fmtCurrency(p.price,p.currency)}</div></div>
    </div>`;
  }).join('');
  openOverlay(`<h2>🛒 Select an item to attach</h2><div style="margin-top:12px">${rows}</div>`);
}

function updateDiscAttachPreview(){
  const preview=$('discAttachPreview'); if(!preview) return;
  const {trackId,productId}=_discAttach;
  if(trackId){
    const t=CACHE.tracks.find(x=>x.id===trackId); if(!t){ preview.innerHTML=''; return; }
    const artStyle=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
    preview.innerHTML=`<div class="disc-attach-preview"><div class="mf-art" style="${artStyle};width:36px;height:36px;border-radius:6px;flex-shrink:0">${t.coverImg?'':'◎'}</div><div class="mf-info"><div class="mf-title">${esc(t.title)}</div><div class="mf-artist">Track attached</div></div><button data-action="removediscattach" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;line-height:1">✕</button></div>`;
    return;
  }
  if(productId){
    const p=CACHE.products.find(x=>x.id===productId); if(!p){ preview.innerHTML=''; return; }
    const photo=p.photos&&p.photos[0];
    preview.innerHTML=`<div class="disc-attach-preview"><div class="mf-art" style="${photo?`background-image:url('${photo}');background-size:cover;background-position:center`:'background:var(--orange-1)'};width:36px;height:36px;border-radius:6px;flex-shrink:0">${photo?'':'📦'}</div><div class="mf-info"><div class="mf-title">${esc(p.title)}</div><div class="mf-artist">Product attached</div></div><button data-action="removediscattach" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:18px;line-height:1">✕</button></div>`;
    return;
  }
  preview.innerHTML='';
}
function card(t){
  const u=userById(t.userId);
  const artStyle=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
  return `<div class="card">
    <div class="card-art" style="${artStyle}" data-action="play" data-id="${t.id}">${t.coverImg?'':'◎'}<button class="card-play" data-action="play" data-id="${t.id}">▶</button></div>
    <div class="card-body"><div class="card-title" data-action="play" data-id="${t.id}">${esc(t.title)}</div>
      <div class="card-artist" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div>
      <div class="card-meta"><button class="${hasLiked(t.id)?'on':''}" data-action="like" data-id="${t.id}">👍 ${nfmt(likeCount(t.id))}</button>
        <button class="${hasDisliked(t.id)?'on':''}" data-action="dislike" data-id="${t.id}">👎 ${nfmt(dislikeCount(t.id))}</button>
        <span class="spacer"></span><span>▶ ${nfmt(playCount(t.id))}</span></div></div></div>`;
}

// ---------- home feed (status timeline) ----------
function renderHome(){
  const u=currentUser();
  const fanOf=CACHE.follows[u.id]||[];
  const following=CACHE.userFollows[u.id]||[];
  const feedUids=new Set([...fanOf,...following]);
  const list=allStatuses().filter(s=>s.userId===u.id||feedUids.has(s.userId)).sort((a,b)=>b.time-a.time);

  // Sidebar: open contests + suggested creators
  const openContests=(CACHE.contests||[]).filter(c=>!c.closed).slice(0,3);
  const suggested=allUsers().filter(us=>us&&us.id!==u.id&&!fanOf.includes(us.id)&&!following.includes(us.id)&&us.handle).slice(0,5);

  const postCards=list.length?list.map(statusCard).join(''):'<div class="empty" style="padding:32px 0;text-align:center">Follow artists to see their updates here — or post your own status above.</div>';

  const contestsSidebar=openContests.length?`<div class="feed-v2-sidebar-card">
    <div class="feed-v2-sidebar-hd">🏆 Open Opportunities</div>
    ${openContests.map(c=>`<div style="padding:8px 0;border-bottom:1px solid rgba(24,32,48,.06);cursor:pointer" data-action="nav" data-view="contests">
      <div style="font-weight:700;font-size:.85rem">${esc(c.title||'Contest')}</div>
      ${c.prize?`<div style="font-size:.78rem;color:var(--muted);margin-top:2px">🦁 ${nfmt(c.prize)} LNC</div>`:''}
    </div>`).join('')}
    <button class="btn sm" data-action="nav" data-view="contests" style="margin-top:10px;width:100%">View all →</button>
  </div>`:'';

  const suggestedSidebar=suggested.length?`<div class="feed-v2-sidebar-card">
    <div class="feed-v2-sidebar-hd">🎤 Creators to Follow</div>
    ${suggested.map(us=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(24,32,48,.06)">
      <div class="avatar" style="${avatarStyle(us,34)};cursor:pointer" data-action="profile" data-uid="${us.id}">${us.avatarImg?'':initials(us.name)}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.85rem;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" data-action="profile" data-uid="${us.id}">${esc(us.name)}</div>
        <div style="font-size:.75rem;color:var(--muted)">@${esc(us.handle||us.name)}</div>
      </div>
      <button class="btn sm" data-action="follow" data-uid="${us.id}">Follow</button>
    </div>`).join('')}
  </div>`:'';

  $("page").innerHTML=`<div class="feed-v2-wrap">
    <div class="feed-v2-layout">
      <div>
        <div class="feed-v2-composer">
          <textarea id="statusText" placeholder="Share a status with your fans… e.g. I just posted new tracks — please listen, like &amp; share! 💜"></textarea>
          <div class="feed-v2-composer-actions"><button class="btn primary sm" data-action="poststatus">Post status</button></div>
        </div>
        ${postCards}
      </div>
      <div>
        ${contestsSidebar}
        ${suggestedSidebar}
      </div>
    </div>
    ${siteFooter()}
  </div>`;
  setTimeout(bindComposer,0);
}

// ---------- track detail v2 ----------
function renderTrackDetail(id){
  const t=allTracks().find(x=>x.id===id);
  if(!t){ $('page').innerHTML='<div class="empty" style="padding:40px;text-align:center">Track not found.</div>'; return; }
  const tu=userById(t.userId);
  const artStyle=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
  const related=allTracks().filter(x=>x.id!==id&&x.visibility==='public'&&(x.userId===t.userId||x.genre===t.genre)).slice(0,6);
  $('page').innerHTML=`<div class="trackv2-wrap">
    <button class="trackv2-back" data-action="nav" data-view="discover">← Back to Discover</button>
    <div class="trackv2-hero">
      <div class="trackv2-art" style="${artStyle}">${t.coverImg?'':'◎'}</div>
      <div class="trackv2-meta">
        <h1 class="trackv2-title">${esc(t.title)}</h1>
        <div class="trackv2-artist" data-action="profile" data-uid="${tu?.id||''}">${esc(tu?.name||'Unknown')}</div>
        <span class="trackv2-genre">${esc(t.genre||'Music')}</span>
        <div class="trackv2-actions">
          <button class="btn-primary-grad" data-action="play" data-id="${t.id}">▶ Play</button>
          <button class="btn${hasLiked(t.id)?' on':''}" data-action="like" data-id="${t.id}">👍 ${nfmt(likeCount(t.id))}</button>
          <button class="btn${hasDisliked(t.id)?' ondown':''}" data-action="dislike" data-id="${t.id}">👎 ${nfmt(dislikeCount(t.id))}</button>
          <span style="font-size:.82rem;color:var(--muted)">▶ ${nfmt(playCount(t.id))} plays</span>
        </div>
      </div>
    </div>
    ${related.length?`<div class="disc-trending">
      <div class="disc-trending-hd">🎵 More Like This</div>
      ${related.map(r=>{ const ru=userById(r.userId); const rs=r.coverImg?`background-image:url('${r.coverImg}');background-size:cover;background-position:center`:`background:${grad(r.accent)}`; return`<div class="disc-track-card" data-action="play" data-id="${r.id}"><div class="disc-track-art" style="${rs}">${r.coverImg?'':'◎'}</div><div class="disc-track-info"><div class="disc-track-title">${esc(r.title)}</div><div class="disc-track-artist">${esc(ru?.name||'Unknown')}</div></div><span class="disc-track-genre">${esc(r.genre||'Music')}</span><button class="disc-track-play" data-action="play" data-id="${r.id}">▶</button></div>`; }).join('')}
    </div>`:''}
    ${siteFooter()}
  </div>`;
}

// ---------- streamer page: info header + (music | wall) ----------
function renderProfile(uid){
  const u=userById(uid); if(!u){ $("page").innerHTML='<div class="empty">Artist not found.</div>'; return; }
  const me=currentUser(); const mine=me&&me.id===uid;
  const themeCSS=u.bgTheme?(THEMES.find(t=>t.id===u.bgTheme)||{}).css:"";
  const cover=u.bgImg?`background-image:url('${u.bgImg}');background-size:cover;background-position:center`:themeCSS?`background:${themeCSS}`:u.bgColor?`background:${u.bgColor}`:"";

  const tracks=tracksByUser(uid,mine); const pls=playlistsByUser(uid); const sts=statusesByUser(uid);
  const plIds=new Set(pls.map(p=>p.id));
  const standaloneTracks=tracks.filter(t=>!t.playlistId||!plIds.has(t.playlistId));
  const blocked=hasBlocked(uid);
  const isFan=isFollowing(uid);               // ME is an accepted fan of this page
  const fanPending=!isFan&&hasPendingFanRequestTo(uid);
  const isFollowUser=isFollowingUser(uid);     // ME follows this user (one-way, instant)
  const requiresApproval=!!(u.privacy?.requireFollowApproval);

  // Fan button: "Become fan" / "Requested ↗" / "Fan ✓" + "Un-fan" if already fan
  const fanBtn=(()=>{
    if(isFan) return `<button class="btn" data-action="unfanself" data-uid="${uid}">🫂 Fan ✓</button>`;
    if(fanPending) return `<button class="btn" data-action="cancelfanrequest" data-uid="${uid}">Requested ↗</button>`;
    return `<button class="btn primary" data-action="follow" data-uid="${uid}">🫂 Become fan</button>`;
  })();
  // Follow button: always available (separate from fan)
  const followBtn=`<button class="btn${isFollowUser?' follow-active':''}" data-action="toggleuserfollow" data-uid="${uid}">${isFollowUser?'Following ✓':'Follow'}</button>`;

  const headActions=mine
    ? `<button class="btn primary" data-action="customize">🎨 Edit profile</button><button class="btn" data-action="invite">✉️ Invite</button><button class="btn" data-action="settings">⚙️ Settings</button>`
    : `${fanBtn} ${followBtn}
       ${!blocked&&canMessage(uid)?`<button class="btn" data-action="openchat" data-uid="${uid}">💬 Message</button>`:''}
       ${!blocked?`<button class="btn" data-action="sendlnc" data-uid="${uid}">🦁 Send LNC</button>`:''}
       <button class="btn" data-action="blockuser" data-uid="${uid}" style="${blocked?'background:#e2554f;color:#fff;border-color:#e2554f':''}">${blocked?'🚫 Blocked':'🚫 Block'}</button>
       <button class="btn" data-action="reportuser" data-uid="${uid}">⚑ Report</button>`;

  // Profile header (always shown)
  const profileHead=`
    <div class="profile-cover" style="${cover}"></div>
    <div class="profile-head"><div style="position:relative;display:inline-block"><div class="profile-avatar" style="${avatarStyle(u,104)};cursor:pointer" data-action="viewavatar" data-uid="${uid}">${u.avatarImg?'':initials(u.name)}</div></div>
      <div class="profile-info"><div class="profile-name">${esc(u.name)} ${u.founder?'<span class="badge-founder">FOUNDER</span>':''}</div><div class="profile-handle">@${esc(u.handle)}</div></div></div>
    <div class="profile-stats">
      <div><b>${standaloneTracks.length+pls.reduce((n,p)=>n+p.files.length,0)}</b> <span>tracks</span></div>
      <div><b>${nfmt(followerCount(uid))}</b> <span>fans</span></div>
      <div><b>${nfmt(userFollowerCount(uid))}</b> <span>followers</span></div>
      <div><b>${nfmt(followingCount(uid))}</b> <span>fan of</span></div>
    </div>
    <div class="profile-bio">${esc(u.bio||"")}</div>
    <div class="profile-actions" style="margin-top:14px">${headActions}</div>`;

  // Private profile gate (full lock — profilePrivate setting)
  if(!mine && isProfilePrivate(uid)){
    $("page").innerHTML=`${profileHead}
      <div class="private-gate">🔒<div>This profile is private</div><div style="font-size:13px;color:var(--muted);margin-top:4px">Become a fan of ${esc(u.name)} to see their content.</div></div>`;
    return;
  }
  // Fan approval gate — requireFollowApproval: non-fans see profile header + message only
  if(!mine && requiresApproval && !isFan){
    $("page").innerHTML=`${profileHead}
      <div class="fan-gate">
        <div class="fan-gate-icon">🫂</div>
        <div class="fan-gate-title">Fan access required</div>
        <div class="fan-gate-sub">${esc(u.name)} approves fans manually. ${fanPending?'Your request is pending.':'Send a fan request to see their music and posts.'}</div>
      </div>`;
    return;
  }
  // MUSIC column
  let music="";
  if(mine) music+=`<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap"><button class="btn sm primary" data-action="sharefolder">📁 Share folder</button><button class="btn sm" data-action="upload">＋ Single track</button></div>`;
  if(pls.length) music+=pls.map(p=>playlistBlock(p,mine)).join("");
  if(standaloneTracks.length) music+=standaloneTracks.map(musicRow).join("");
  if(!pls.length&&!tracks.length) music+=`<div class="empty" style="padding:24px">No tracks yet.</div>`;
  // WALL column — owner can always compose; accepted fans can post to owner's wall
  let wall = (mine||(!mine&&isFan&&ME))?fanWallComposer(uid,mine):"";
  wall += sts.length?sts.map(statusCard).join(""):`<div class="empty" style="padding:24px">No posts yet.${mine?' Share a status to talk to your fans 👆':''}</div>`;
  $("page").innerHTML=`${profileHead}
    <div class="divider"></div>
    <div class="streamer-cols">
      <div class="col-music"><div class="col-h">🎵 Music <span class="col-hint">· like or dislike</span></div>${music}</div>
      <div class="col-wall"><div class="col-h">💬 Wall <span class="col-hint">· comment & react here</span></div>${wall}</div>
    </div>`;
  pls.forEach(loadCovers); setTimeout(()=>bindComposer(uid),0);
}

// ---------- music row (like/dislike only) ----------
function musicRow(t){
  const priv=t.visibility==="private";
  const isLocal=t.src&&t.src.startsWith("local:");
  const artStyle=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
  const localNote=isLocal?`<span class="local-badge" title="Audio stored locally — only the uploader can play this">📵 Local only</span>`:'';
  return `<div class="mrow2"><div class="mart" style="${artStyle}" data-action="play" data-id="${t.id}">${t.coverImg?'':'◎'}</div>
    <div class="minfo"><div class="mt" data-action="play" data-id="${t.id}">${esc(t.title)}${priv?' 🔒':''}${localNote}</div><div class="ms">▶ ${nfmt(playCount(t.id))} plays</div></div>
    <div class="ld"><button class="${hasLiked(t.id)?'on':''}" data-action="like" data-id="${t.id}">👍 ${nfmt(likeCount(t.id))}</button>
      <button class="${hasDisliked(t.id)?'ondown':''}" data-action="dislike" data-id="${t.id}">👎 ${nfmt(dislikeCount(t.id))}</button></div></div>`;
}

// ---------- statuses / wall ----------
function composer(){
  return `<div class="status-composer"><textarea id="statusText" placeholder="Share a status with your fans… e.g. I just posted new tracks — please listen, like & share! 💜"></textarea>
    <div style="text-align:right"><button class="btn primary sm" data-action="poststatus">Post status</button></div></div>`;
}
// Wall composer for profile pages — owner posts normally; accepted fans post to the wall
function fanWallComposer(pageOwnerUid, isOwner){
  if(isOwner) return composer();
  return `<div class="status-composer fan-wall-composer">
    <textarea id="statusText" placeholder="Post to ${esc(userById(pageOwnerUid)?.name||'their')} wall…"></textarea>
    <div style="text-align:right"><button class="btn primary sm" data-action="poststatus" data-walluid="${pageOwnerUid}">Post to wall</button></div>
  </div>`;
}
function bindComposer(wallUid){ /* nothing extra; handled via delegation */ }
// ---- link preview helpers ----
const _URL_RE=/https?:\/\/[^\s<>"']+/g;
function linkifyText(raw){
  if(!raw)return{html:'',firstUrl:''};
  const urls=raw.match(_URL_RE)||[];
  const parts=raw.split(_URL_RE);
  let html='';
  parts.forEach((p,i)=>{
    html+=esc(p);
    if(urls[i]) html+=`<a href="${esc(urls[i])}" target="_blank" rel="noopener noreferrer" class="msg-link">${esc(urls[i])}</a>`;
  });
  return{html,firstUrl:urls[0]||''};
}
function lpTag(url){
  if(!url)return'';
  return`<div class="lp-pending" data-url="${esc(url)}"></div>`;
}
function _getYouTubeId(url){
  const m=url.match(/(?:youtube\.com\/watch\?(?:[^#&?]*&)?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  return m?m[1]:null;
}
function _getVimeoId(url){
  const m=url.match(/vimeo\.com\/(\d+)/);
  return m?m[1]:null;
}
async function fetchLinkPreviews(){
  document.querySelectorAll('.lp-pending').forEach(async el=>{
    el.classList.remove('lp-pending');
    const url=el.dataset.url;if(!url)return;
    if(_linkCache[url]===null)return;
    if(_linkCache[url]){el.innerHTML=_lpCard(_linkCache[url],url);return;}
    try{
      // YouTube — use oEmbed (CORS-enabled, no API key needed)
      const ytId=_getYouTubeId(url);
      if(ytId){
        const r=await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if(r.ok){
          const j=await r.json();
          const data={title:j.title,description:`${j.author_name} · YouTube`,image:{url:`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}};
          _linkCache[url]=data;el.innerHTML=_lpCard(data,url);return;
        }
      }
      // Vimeo — use oEmbed
      const vimeoId=_getVimeoId(url);
      if(vimeoId){
        const r=await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
        if(r.ok){
          const j=await r.json();
          const data={title:j.title,description:`${j.author_name} · Vimeo`,image:{url:j.thumbnail_url}};
          _linkCache[url]=data;el.innerHTML=_lpCard(data,url);return;
        }
      }
      // General pages — microlink.io
      const r=await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
      const j=await r.json();
      if(j.status==='success'&&j.data){_linkCache[url]=j.data;el.innerHTML=_lpCard(j.data,url);}
      else _linkCache[url]=null;
    }catch(e){_linkCache[url]=null;}
  });
}
function _lpCard(data,url){
  const img=data.image?.url||data.logo?.url||'';
  const title=(data.title||'').slice(0,80);
  const desc=(data.description||'').slice(0,120);
  let domain='';try{domain=new URL(url).hostname.replace(/^www\./,'');}catch(e){domain=url.slice(0,30);}
  if(!title&&!img)return'';
  return`<a class="link-preview-card" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${img?`<div class="lp-img-top" style="background-image:url('${esc(img)}')"></div>`:''}<div class="lp-info"><div class="lp-domain">${esc(domain)}</div>${title?`<div class="lp-title">${esc(title)}</div>`:''}${desc?`<div class="lp-desc">${esc(desc)}</div>`:''}</div></a>`;
}

function statusCard(s){
  const u=userById(s.userId); const cs=stComments(s.id);
  const {html:stHtml,firstUrl:stUrl}=linkifyText(s.text||'');
  const cmts=cs.map(c=>{ const mine=ME&&c.uid===ME.id; const {html:cHtml,firstUrl:cUrl}=linkifyText(c.text||''); return `<div class="scmt"><div class="sc-av" style="${avatarStyle(userById(c.uid)||{color:'#bbb'},28)}">${(userById(c.uid)?.avatarImg)?'':initials(c.name)}</div>
      <div class="sc-b"><b>${esc(c.name)}</b> · <span style="color:var(--muted);font-size:11px">${timeAgo(c.time)}${c.edited?' · edited':''}</span><div>${cHtml}</div>${lpTag(cUrl)}${mine?`<div class="cmt-edit"><span data-action="editcmt" data-id="${c.id}">Edit</span> · <span data-action="delcmt" data-id="${c.id}">Delete</span></div>`:''}</div></div>`; }).join("");
  return `<div class="status-card">
    <div class="status-top"><div class="avatar" style="${avatarStyle(u,38)};cursor:pointer" data-action="viewavatar" data-uid="${u.id}">${u.avatarImg?'':initials(u.name)}</div>
      <div><div class="sname" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div><div class="stime">${timeAgo(s.time)}</div></div></div>
    <div class="status-text">${stHtml}</div>${lpTag(stUrl)}
    <div class="status-actions ld">
      <button class="${stHasLiked(s.id)?'on':''}" data-action="slike" data-id="${s.id}">👍 ${nfmt(stLikeCount(s.id))}</button>
      <button class="${stHasDisliked(s.id)?'ondown':''}" data-action="sdislike" data-id="${s.id}">👎 ${nfmt(stDislikeCount(s.id))}</button></div>
    <div class="scomments">${cmts}
      <div class="cmt-add"><input id="sc_${s.id}" placeholder="Write a comment…" /><button class="btn sm primary" data-action="scomment" data-id="${s.id}">Post</button></div></div></div>`;
}
function postStatus(el){
  const t=($("statusText").value||"").trim(); if(!t) return toast("Write something to share");
  if(!ME) return openEmailAuth();
  const wallUid=(el&&el.dataset&&el.dataset.walluid)||null;
  const doc={ userId:ME.id, text:t, time:Date.now() };
  if(wallUid&&wallUid!==ME.id) doc.wallUid=wallUid;
  fbDB.collection("statuses").add(doc).then(()=>{
    toast(wallUid&&wallUid!==ME.id?"Posted to their wall 📣":"Posted to your wall 📣");
    WALLET.credit(ME.id,3,'status_post','Status post');
  }).catch(e=>toast("Couldn't post: "+(e.code||e.message)));
}
function stLike(id){ if(!ME) return openEmailAuth(); const F=firebase.firestore.FieldValue; const has=(CACHE.reactions["s_"+id]?.likes||[]).includes(ME.id);
  fbDB.collection("reactions").doc("s_"+id).set({ likes: has?F.arrayRemove(ME.id):F.arrayUnion(ME.id), dislikes:F.arrayRemove(ME.id) },{merge:true}).catch(e=>toast(e.code||e.message));
  if(!has){ const s=allStatuses().find(x=>x.id===id); if(s){ notify(s.userId,"like",`${ME.name} liked your post 👍`); if(s.userId!==ME.id) WALLET.credit(s.userId,0.5,'reaction_received','Reaction on your post'); } } }
function stDislike(id){ if(!ME) return openEmailAuth(); const F=firebase.firestore.FieldValue; const has=(CACHE.reactions["s_"+id]?.dislikes||[]).includes(ME.id);
  fbDB.collection("reactions").doc("s_"+id).set({ dislikes: has?F.arrayRemove(ME.id):F.arrayUnion(ME.id), likes:F.arrayRemove(ME.id) },{merge:true}).catch(e=>toast(e.code||e.message)); }
function stComment(id){ const el=$("sc_"+id); const t=(el?.value||"").trim(); if(!t) return toast("Write a comment first");
  if(!ME) return openEmailAuth();
  fbDB.collection("comments").add({ statusId:id, uid:ME.id, name:ME.name, text:t, time:Date.now() }).catch(e=>toast(e.code||e.message));
  const s=allStatuses().find(x=>x.id===id);
  if(s){ notify(s.userId,"comment",`${ME.name} commented: "${t.slice(0,50)}"`); WALLET.credit(ME.id,1,'comment_sent','Comment written'); if(s.userId!==ME.id) WALLET.credit(s.userId,2,'comment_received','Comment on your post'); } }
function editComment(cid){
  const c=CACHE.comments.find(x=>x.id===cid); if(!c) return; if(!ME||c.uid!==ME.id) return;
  openOverlay(`<h2>✏️ Edit comment</h2>
    <div class="field"><textarea id="editCmtText" style="min-height:80px;width:100%">${esc(c.text)}</textarea></div>
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="btn primary" data-action="saveeditcmt" data-id="${cid}">Save</button>
      <button class="btn" data-action="close">Cancel</button>
    </div>`);
  setTimeout(()=>{const t=$("editCmtText");if(t){t.focus();t.setSelectionRange(t.value.length,t.value.length);}},50);
}
async function saveEditComment(cid){
  const text=($("editCmtText")||{value:""}).value.trim();
  if(!text) return toast("Comment can't be empty.");
  try{ await fbDB.collection("comments").doc(cid).update({text,edited:true}); closeOverlay(); toast("Comment updated"); }
  catch(e){ toast("Couldn't edit: "+(e.code||e.message)); }
}
function deleteComment(cid){
  const c=CACHE.comments.find(x=>x.id===cid); if(!ME||!c||c.uid!==ME.id) return;
  openOverlay(`<h2>🗑️ Delete comment?</h2>
    <p style="margin:10px 0 22px;color:var(--muted)">This cannot be undone.</p>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn block" data-action="confirmdelcmt" data-id="${cid}" style="color:#c0392b;border-color:#f5c6c6">Yes, delete</button>
    </div>`);
}
function doDeleteComment(cid){ fbDB.collection("comments").doc(cid).delete().then(()=>{ closeOverlay(); toast("Comment deleted"); }).catch(e=>toast(e.code||e.message)); }

// ---------- track like/dislike (music = reactions only) ----------
function toggleLike(id){ if(!ME) return openEmailAuth(); const F=firebase.firestore.FieldValue; const has=(CACHE.reactions["t_"+id]?.likes||[]).includes(ME.id);
  fbDB.collection("reactions").doc("t_"+id).set({ likes: has?F.arrayRemove(ME.id):F.arrayUnion(ME.id), dislikes:F.arrayRemove(ME.id) },{merge:true}).catch(e=>toast(e.code||e.message));
  if(!has){ const t=allTracks().find(x=>x.id===id); if(t){ notify(t.userId,"like",`${ME.name} liked your track "${t.title}" 👍`); if(t.userId!==ME.id) WALLET.credit(t.userId,0.5,'reaction_received','Reaction on your track'); } } }
function toggleDislike(id){ if(!ME) return openEmailAuth(); const F=firebase.firestore.FieldValue; const has=(CACHE.reactions["t_"+id]?.dislikes||[]).includes(ME.id);
  fbDB.collection("reactions").doc("t_"+id).set({ dislikes: has?F.arrayRemove(ME.id):F.arrayUnion(ME.id), likes:F.arrayRemove(ME.id) },{merge:true}).catch(e=>toast(e.code||e.message)); }

// ---------- playlists from folders ----------
function playlistBlock(p,owner){
  if(!state.openPlaylists) state.openPlaylists=new Set();
  const open=state.openPlaylists.has(p.id);
  let rows;
  if(p._cloud){
    // Cloud playlist: play directly from Firestore tracks (works on all devices)
    const plTracks=allTracks().filter(t=>t.playlistId===p.id&&t.userId===p.userId).sort((a,b)=>a.createdAt-b.createdAt);
    rows=plTracks.map((t,i)=>`<div class="trow" data-action="play" data-id="${t.id}"><div class="tn">${i+1}</div><div class="ttitle">${esc(t.title)}</div><span class="tplay">▶</span></div>`).join("");
  } else {
    rows=p.files.map((f,i)=>`<div class="trow" data-action="playfile" data-pl="${p.id}" data-file="${esc(f)}"><div class="tn" id="tn_${p.id}_${i}">${i+1}</div><div class="ttitle">${esc(f.replace(/\.[^.]+$/,''))}</div><span class="tplay">▶</span></div>`).join("");
  }
  const acts=(owner&&!p._cloud)?`<div class="pl-actions"><button class="btn sm" data-action="setthumbs" data-pl="${p.id}">${p.thumbs?'covers ✓':'＋ covers'}</button><button class="btn sm" data-action="relink" data-pl="${p.id}">re-link</button></div>`:"";
  return `<div class="playlist">
    <div class="playlist-head" data-action="togglepl" data-pl="${p.id}">
      <div class="pl-ic">📁</div>
      <div style="flex:1"><div class="pl-name">${esc(p.name)}</div><div class="pl-sub">${p.files.length} tracks · ${p._cloud?'☁️ cloud':'folder'}</div></div>
      ${acts}<span class="pl-toggle">${open?'−':'+'}</span>
    </div>
    ${open?`<div class="tracklist">${rows}</div>`:''}
  </div>`;
}
async function loadCovers(p){
  if(!p.thumbs) return; let c=dirCache[p.id]; if(!c||!c.thumbs){ const h=await fsGet(p.id+"_thumbs"); if(h&&await ensurePerm(h)){ c=dirCache[p.id]=dirCache[p.id]||{}; c.thumbs=h; } }
  if(!c||!c.thumbs) return;
  for(let i=0;i<p.files.length;i++){ const base=p.files[i].replace(/\.[^.]+$/,""); const el=document.getElementById(`tn_${p.id}_${i}`); if(!el) continue;
    for(const ext of [".jpg",".jpeg",".png",".webp",".gif"]){ try{ const fh=await c.thumbs.getFileHandle(base+ext); const file=await fh.getFile(); el.style.cssText="background:url('"+URL.createObjectURL(file)+"') center/cover"; el.textContent=""; break; }catch{} } }
}
async function shareMusicFolder(){
  if(!window.showDirectoryPicker){ mobilePickFiles(); return; }
  let dir; try{ dir=await window.showDirectoryPicker(); }catch{ return; }
  const fileNames=[]; for await(const e of dir.values()){ if(e.kind==="file"&&/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(e.name)) fileNames.push(e.name); }
  if(!fileNames.length) return toast("No audio files in that folder."); fileNames.sort();
  if(!ME) return toast("Please log in first.");
  const id="pl_"+Date.now();
  const d=db(); d.playlists.unshift({ id, userId:ME.id, name:dir.name, files:fileNames, thumbs:null, createdAt:Date.now() });
  commit(d); dirCache[id]={ music:dir }; await fsPut(id+"_music",dir);
  toast(`Uploading "${dir.name}" — ${fileNames.length} tracks to cloud…`); go("mymusic");
  let done=0,failed=0;
  for(const fname of fileNames){
    try{
      const fh=await dir.getFileHandle(fname); const f=await fh.getFile();
      const buf=await fileToArrayBuffer(f);
      const blob=new Blob([buf],{type:f.type||"audio/mpeg"});
      await audioPut(id+"/"+fname,blob);
      const url=await uploadToCloudinary(blob);
      await fbDB.collection("tracks").add({ userId:ME.id, title:fname.replace(/\.[^.]+$/,""), src:url, playlistId:id, playlistName:dir.name, genre:"Other", accent:COLORS[Math.floor(Math.random()*COLORS.length)], coverImg:"", visibility:"public", createdAt:Date.now()+done });
      done++;
    }catch(e){ failed++; console.warn("upload fail",fname,e); }
    toast(`Uploading "${dir.name}"… ${done+failed}/${fileNames.length}`);
  }
  toast(failed?`"${dir.name}" — ${done} tracks uploaded ☁️, ${failed} failed.`:`"${dir.name}" — all ${done} tracks on the cloud ☁️`);
}
function mobilePickFiles(){
  const inp=document.createElement("input");
  inp.type="file"; inp.accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac"; inp.multiple=true;
  inp.onchange=async()=>{
    const files=[...inp.files]; if(!files.length) return;
    openOverlay(`<h2>📁 Name your playlist</h2><p class="sub">${files.length} track${files.length>1?'s':''} selected.</p>
      <div class="field"><label>Playlist name</label><input class="fb-field" id="plName" placeholder="e.g. My AI Music" value="My Music" /></div>
      <button class="btn primary block" data-action="savemobilepl">Save &amp; cache tracks</button>`);
    window._mobileFiles=files;
  };
  inp.click();
}
async function saveMobilePlaylist(){
  const files=window._mobileFiles; if(!files||!files.length) return;
  const name=($("plName").value||"").trim()||"My Music";
  closeOverlay();
  if(!ME) return toast("Please log in first.");
  const id="pl_"+Date.now();
  const d=db(); d.playlists.unshift({ id, userId:ME.id, name, files:files.map(f=>f.name), thumbs:null, createdAt:Date.now() });
  commit(d); toast(`Uploading ${files.length} track${files.length>1?'s':''}…`); go("mymusic");
  let done=0,failed=0;
  for(const f of files){
    try{
      const buf=await fileToArrayBuffer(f);
      const blob=new Blob([buf],{type:f.type||"audio/mpeg"});
      await audioPut(id+"/"+f.name,blob);
      const url=await uploadToCloudinary(blob);
      await fbDB.collection("tracks").add({ userId:ME.id, title:f.name.replace(/\.[^.]+$/,""), src:url, playlistId:id, playlistName:name, genre:"Other", accent:COLORS[Math.floor(Math.random()*COLORS.length)], coverImg:"", visibility:"public", createdAt:Date.now()+done });
      done++;
    }catch(e){ failed++; console.warn("upload fail",f.name,e); }
    toast(`Uploading… ${done+failed}/${files.length}`);
  }
  window._mobileFiles=null;
  toast(failed?`"${name}" — ${done} tracks on cloud ☁️, ${failed} failed.`:`"${name}" — all ${done} tracks on the cloud ☁️`);
}
async function setThumbsFolder(plId){ if(!window.showDirectoryPicker) return toast("Needs Chrome/Edge."); let dir; try{ dir=await window.showDirectoryPicker(); }catch{ return; }
  const d=db(); const p=d.playlists.find(x=>x.id===plId); if(p){ p.thumbs=dir.name; commit(d); } dirCache[plId]=dirCache[plId]||{}; dirCache[plId].thumbs=dir; await fsPut(plId+"_thumbs",dir); toast("Thumbnails linked ✓"); renderMain(); }
async function relinkFolder(plId){ if(!window.showDirectoryPicker) return toast("Needs Chrome/Edge."); let dir; try{ dir=await window.showDirectoryPicker(); }catch{ return; }
  const files=[]; for await(const e of dir.values()){ if(e.kind==="file"&&/\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(e.name)) files.push(e.name); } files.sort();
  const d=db(); const p=d.playlists.find(x=>x.id===plId); if(p){ p.files=files; p.name=dir.name; commit(d); } dirCache[plId]=dirCache[plId]||{}; dirCache[plId].music=dir; await fsPut(plId+"_music",dir); toast("Re-linked ✓"); renderMain(); }
async function playFolderTrack(plId,file){
  const cacheKey=plId+"/"+file;
  const title=file.replace(/\.[^.]+$/,"");
  // Determine owner: prefer Firestore cloud playlist track, then local playlist record
  const cloudTrack=allTracks().find(t=>t.playlistId===plId&&(t.title===title||t.title===file));
  const plOwner=db().playlists.find(x=>x.id===plId);
  const ownerId=cloudTrack?.userId||plOwner?.userId;
  const artist=userById(ownerId)?.name||currentUser()?.name||"";
  // Set queue context to the playlist owner so continuous play stays on their profile
  if(ownerId){
    if(state.view==="profile"&&state.profileId===ownerId) nowPlayingContext={uid:ownerId};
    else if(state.view==="mymusic"&&currentUser()?.id===ownerId) nowPlayingContext={uid:ownerId};
    else if(!nowPlayingContext) nowPlayingContext={uid:ownerId};
  }
  // 1 — serve from offline cache if available
  const cached=await audioGet(cacheKey);
  if(cached){ showPlayer(title,artist,"#FB7A28",URL.createObjectURL(cached)); return; }
  // 2 — serve from Cloudinary if this track was uploaded (works cross-device)
  if(cloudTrack&&cloudTrack.src&&!cloudTrack.src.startsWith("local:")){ showPlayer(title,artist,cloudTrack.accent||"#FB7A28",cloudTrack.src); return; }
  // 3 — read from folder (cloud drive or local), then cache for offline
  let c=dirCache[plId]; if(!c||!c.music){ const h=await fsGet(plId+"_music"); if(h&&await ensurePerm(h)){ c=dirCache[plId]=dirCache[plId]||{}; c.music=h; } }
  if(!c||!c.music){ const p=db().playlists.find(x=>x.id===plId); return toast(`Re-link "${p?p.name:'folder'}" to play. (Tip: play tracks once while online to cache them for offline.)`); }
  try{
    const fh=await c.music.getFileHandle(file); const f=await fh.getFile();
    const url=URL.createObjectURL(f);
    showPlayer(title,artist,"#FB7A28",url);
    // cache as blob so it's playable offline next time (fire-and-forget)
    f.arrayBuffer().then(buf=>audioPut(cacheKey,new Blob([buf],{type:f.type||"audio/mpeg"}))).catch(()=>{});
  } catch{ toast("Couldn't read that file — try re-linking."); }
}

// ---------- single track upload ----------
function openUpload(){
  if(!currentUser()) return openEmailAuth();
  openOverlay(`<h2>Add a single track</h2><p class="sub">Publish now or keep private until ready.</p>
    <div class="field"><label>Track title</label><input id="upTitle" placeholder="e.g. Midnight Bloom" /></div>
    <div class="field"><label>Cover photo (optional)</label>
      <div class="covup"><div class="covprev" id="covPrev" style="background:${COLORS[0]}">◎</div>
        <div><input type="file" id="covFile" accept="image/*" /><div class="note" style="margin-top:4px">JPG/PNG — or pick a color below.</div></div></div></div>
    <div class="field"><label>Cover color</label><div class="swatches" id="swatches">${COLORS.map((c,i)=>`<div class="swatch ${i===0?'sel':''}" style="background:${c}" data-action="swatch" data-c="${c}"></div>`).join("")}</div></div>
    <div class="field"><label>Audio file <span style="font-weight:400;color:var(--muted)">(pick from your device)</span></label>
      <input type="file" id="audioFile" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac" />
      <div class="note" id="audioFilename" style="margin-top:4px"></div></div>
    <div class="field"><label>Or audio link</label><input id="upSrc" placeholder="https://…/song.mp3" /></div>
    <div class="field"><label>Genre</label><select id="upGenre" class="fb-field">${GENRES.map(g=>`<option value="${g}">${g}</option>`).join("")}</select></div>
    <div class="field"><label>Visibility</label><div class="radio-row" id="visRow"><div class="radio-card sel" data-action="vis" data-v="public"><b>Public</b>Everyone can play it</div><div class="radio-card" data-action="vis" data-v="private"><b>Private</b>Only you, until you publish</div></div></div>
    <label class="check"><input type="checkbox" id="upShare" checked> Allow fans to share this track</label>
    <button class="btn primary block" data-action="dopublish">Add to my music</button>`);
  window._upColor=COLORS[0]; window._upVis="public"; window._trackCover=null; window._coverFile=null; window._audioFile=null;
}
function fileToArrayBuffer(file){
  if(file.arrayBuffer) return file.arrayBuffer();
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsArrayBuffer(file); });
}
async function doPublish(){
  const title=($("upTitle").value||"").trim(); if(!title) return toast("Give it a title"); if(!ME) return openEmailAuth();
  let coverImg="";
  if(window._coverFile){
    const pubBtn=document.querySelector('[data-action="dopublish"]');
    try{ if(pubBtn){pubBtn.disabled=true;pubBtn.textContent="Uploading cover…";} coverImg=await uploadMediaToCloudinary(window._coverFile); }
    catch(e){ if(pubBtn){pubBtn.disabled=false;pubBtn.textContent="Add to my music";} return toast("Cover upload failed: "+(e.message||e)); }
  } else if(window._trackCover&&window._trackCover.startsWith("http")){ coverImg=window._trackCover; }
  let src=($("upSrc").value||"").trim();
  if(src.startsWith("blob:")){ return toast("Blob URLs can't be shared — please use the 'Choose audio file' button to upload your file directly."); }
  if(src.startsWith("file://")){ return toast("Local file paths can't be shared — please use the 'Choose audio file' button to upload your file directly."); }
  if(!src && !window._audioFile){ return toast("Please add an audio file or paste a music link."); }
  if(window._audioFile){
    const file=window._audioFile;
    const pubBtn=document.querySelector('[data-action="dopublish"]');
    if(pubBtn){ pubBtn.disabled=true; pubBtn.textContent="Uploading… 0%"; }
    try{
      src=await new Promise((resolve,reject)=>{
        const fd=new FormData();
        fd.append("file",file);
        fd.append("upload_preset","okmusic_audio");
        const xhr=new XMLHttpRequest();
        xhr.open("POST","https://api.cloudinary.com/v1_1/llka5use/video/upload");
        xhr.upload.onprogress=e=>{ if(e.lengthComputable&&pubBtn) pubBtn.textContent=`Uploading… ${Math.round(e.loaded/e.total*100)}%`; };
        xhr.onload=()=>{ try{ const r=JSON.parse(xhr.responseText); if(r.secure_url) resolve(r.secure_url); else reject(new Error(r.error?.message||"Upload failed")); }catch(err){ reject(err); } };
        xhr.onerror=()=>reject(new Error("Network error — check your connection"));
        xhr.send(fd);
      });
    }catch(e){
      if(pubBtn){ pubBtn.disabled=false; pubBtn.textContent="Add to my music"; }
      return toast("Upload failed: "+(e.message||e)+". Check your connection and try again.");
    }
  }
  const isPublic=(window._upVis||"public")==="public";
  fbDB.collection("tracks").add({ userId:ME.id, title, src, genre:($("upGenre")&&$("upGenre").value)||"Other", accent:window._upColor||COLORS[0], coverImg, visibility:window._upVis||"public", share:!!($("upShare")&&$("upShare").checked), createdAt:Date.now() })
    .then(()=>{
      closeOverlay(); window._trackCover=null; window._audioFile=null;
      toast(isPublic?"Published! 🎵":"Saved private 🔒"); go("mymusic");
      WALLET.credit(ME.id,10,'track_upload','Track uploaded: '+title);
      // Notify all fans + followers about the new public track
      if(isPublic){
        const fans=followersOf(ME.id).filter(uid=>!String(uid).startsWith("u_"));
        const followersArr=followersOfUser(ME.id).filter(uid=>!String(uid).startsWith("u_"));
        const allToNotify=[...new Set([...fans,...followersArr])];
        allToNotify.forEach(uid=>{ fbDB.collection("notifications").add({ forUid:uid, type:"new_track", fromUid:ME.id, fromName:ME.name, text:`🎵 ${ME.name} posted a new track: ${title}`, time:Date.now(), read:false }).catch(()=>{}); });
      }
    })
    .catch(e=>toast("Couldn't save: "+(e.code||e.message))); }

// ---------- Cloudinary upload helpers ----------
function _isImageFile(file){
  if(file.type&&file.type.startsWith("image/")) return true;
  const ext=(file.name||"").split(".").pop().toLowerCase();
  return ["jpg","jpeg","png","gif","webp","heic","heif","bmp","tiff","tif","avif","svg"].includes(ext);
}
async function imageToJpeg(file){
  return new Promise(resolve=>{
    const img=new Image();
    const blobUrl=URL.createObjectURL(file);
    img.onload=()=>{
      const MAX=2048;
      let w=img.naturalWidth,h=img.naturalHeight;
      if(w>MAX){h=Math.round(h*MAX/w);w=MAX;}
      if(h>MAX){w=Math.round(w*MAX/h);h=MAX;}
      const c=document.createElement("canvas");c.width=w;c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      URL.revokeObjectURL(blobUrl);
      c.toBlob(b=>resolve(b||file),"image/jpeg",0.92);
    };
    img.onerror=()=>{URL.revokeObjectURL(blobUrl);resolve(file);};
    img.src=blobUrl;
  });
}
async function uploadMediaToCloudinary(file){
  let uploadFile=file;
  let endpoint="video/upload";
  if(_isImageFile(file)){
    uploadFile=await imageToJpeg(file);
    endpoint="image/upload";
  }
  return new Promise((resolve,reject)=>{
    const fd=new FormData();
    fd.append("file",uploadFile);
    fd.append("upload_preset","okmusic_audio");
    const xhr=new XMLHttpRequest();
    xhr.open("POST","https://api.cloudinary.com/v1_1/llka5use/"+endpoint);
    xhr.onload=()=>{ try{ const r=JSON.parse(xhr.responseText); if(r.secure_url) resolve(r.secure_url); else reject(new Error(r.error?.message||"Upload failed")); }catch(err){ reject(err); } };
    xhr.onerror=()=>reject(new Error("Network error"));
    xhr.send(fd);
  });
}
function uploadToCloudinary(blob, onProgress){
  return new Promise((resolve,reject)=>{
    const fd=new FormData();
    fd.append("file",blob);
    fd.append("upload_preset","okmusic_audio");
    const xhr=new XMLHttpRequest();
    xhr.open("POST","https://api.cloudinary.com/v1_1/llka5use/video/upload");
    if(onProgress) xhr.upload.onprogress=e=>{ if(e.lengthComputable) onProgress(Math.round(e.loaded/e.total*100)); };
    xhr.onload=()=>{ try{ const r=JSON.parse(xhr.responseText); if(r.secure_url) resolve(r.secure_url); else reject(new Error(r.error?.message||"Upload failed")); }catch(err){ reject(err); } };
    xhr.onerror=()=>reject(new Error("Network error — check your connection"));
    xhr.send(fd);
  });
}
// Chat file upload: use the correct Cloudinary resource namespace per file type.
async function uploadChatFile(file, onProgress){
  let uploadFile=file;
  let endpoint;
  const ext=(file.name||"").split(".").pop().toLowerCase();
  const isAudioExt=["mp3","m4a","aac","ogg","wav","flac","opus"].includes(ext);
  const isVideoExt=["mp4","mov","avi","mkv","webm"].includes(ext);
  if(_isImageFile(file)){
    uploadFile=await imageToJpeg(file);
    endpoint="image/upload";
  } else if(file.type.startsWith("audio/")||file.type.startsWith("video/")||isAudioExt||isVideoExt){
    endpoint="video/upload";
  } else {
    endpoint="raw/upload";
  }
  return new Promise((resolve,reject)=>{
    const fd=new FormData();
    fd.append("file",uploadFile);
    fd.append("upload_preset","okmusic_audio");
    const xhr=new XMLHttpRequest();
    xhr.open("POST",`https://api.cloudinary.com/v1_1/llka5use/${endpoint}`);
    if(onProgress) xhr.upload.onprogress=e=>{ if(e.lengthComputable) onProgress(Math.round(e.loaded/e.total*100)); };
    xhr.onload=()=>{ try{ const r=JSON.parse(xhr.responseText); if(r.secure_url) resolve(r.secure_url); else reject(new Error(r.error?.message||"Upload failed")); }catch(err){ reject(err); } };
    xhr.onerror=()=>reject(new Error("Network error — check your connection"));
    xhr.send(fd);
  });
}

async function migrateTrack(trackId){
  const t=allTracks().find(x=>x.id===trackId); if(!t) return;
  const blob=await audioGet(t.src.slice(6));
  if(!blob){ toast("Audio file not found on this device. Use '＋ Add link' to paste a public URL instead."); return; }
  const btn=document.querySelector(`[data-action="migratetrack"][data-id="${trackId}"]`);
  if(btn){ btn.disabled=true; btn.textContent="Uploading… 0%"; }
  try{
    const url=await uploadToCloudinary(blob, pct=>{ if(btn) btn.textContent=`Uploading… ${pct}%`; });
    await fbDB.collection("tracks").doc(trackId).update({src:url});
    toast(`"${t.title}" is now on the cloud ☁️ — everyone can hear it!`);
    renderMyMusic();
  }catch(e){
    if(btn){ btn.disabled=false; btn.textContent="☁️ Move to cloud"; }
    toast("Migration failed: "+(e.message||e));
  }
}

async function migrateAllLocal(){
  const locals=tracksByUser(ME.id,true).filter(t=>t.src&&t.src.startsWith("local:"));
  if(!locals.length) return toast("No local tracks to migrate.");
  const allBtn=document.querySelector('[data-action="migratealltracks"]');
  if(allBtn){ allBtn.disabled=true; allBtn.textContent=`Migrating… 0/${locals.length}`; }
  let done=0,failed=0;
  for(const t of locals){
    const blob=await audioGet(t.src.slice(6));
    if(!blob){ failed++; continue; }
    try{
      const url=await uploadToCloudinary(blob);
      await fbDB.collection("tracks").doc(t.id).update({src:url});
      done++;
      if(allBtn) allBtn.textContent=`Migrating… ${done}/${locals.length}`;
    }catch(e){ failed++; }
  }
  toast(failed?`${done} moved to cloud ☁️, ${failed} could not be found on this device.`:`All ${done} track${done!==1?"s":""} moved to cloud ☁️ — everyone can now stream them!`);
  renderMyMusic();
}

// ---------- my music ----------
function renderMyMusic(){
  const u=currentUser(); const tracks=tracksByUser(u.id,true); const pls=playlistsByUser(u.id);
  const plIds=new Set(pls.map(p=>p.id));
  const standaloneTracks=tracks.filter(t=>!t.playlistId||!plIds.has(t.playlistId));
  const localCount=standaloneTracks.filter(t=>t.src&&t.src.startsWith("local:")).length;
  const rows=standaloneTracks.map(t=>{
    const isLocal=t.src&&t.src.startsWith("local:");
    const artStyle2=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
    return `<div class="mrow"><div class="mart" style="${artStyle2}" data-action="play" data-id="${t.id}">${t.coverImg?'':'◎'}</div>
    <div class="minfo"><div class="mt">${esc(t.title)}${isLocal?'<span class="local-badge">📵 Local only</span>':''}</div><div class="ms">▶ ${nfmt(playCount(t.id))} · 👍 ${nfmt(likeCount(t.id))} · 👎 ${nfmt(dislikeCount(t.id))} <span class="pill ${t.visibility==='private'?'prv':'pub'}">${t.visibility==='private'?'Private':'Public'}</span></div></div>
    ${isLocal?`<button class="btn sm primary" data-action="migratetrack" data-id="${t.id}" title="Upload this track to the cloud so all fans can hear it">☁️ Move to cloud</button><button class="btn sm" data-action="addlink" data-id="${t.id}" data-title="${esc(t.title)}" title="Paste a public URL instead">＋ Add link</button>`:''}
    ${t.visibility==='private'?`<button class="btn sm primary" data-action="publish" data-id="${t.id}">Publish</button>`:`<button class="btn sm" data-action="unpublish" data-id="${t.id}">Hide</button>`}
    <button class="btn sm" data-action="deltrack" data-id="${t.id}" style="color:#e2554f;border-color:#f0b3b3">Delete</button></div>`;
  }).join("");
  const migrateBanner=localCount?`<div class="migrate-banner">📵 <b>${localCount} track${localCount!==1?"s":""} stored locally</b> — only you can hear them on this device. Move them to the cloud so your fans can listen everywhere.<button class="btn sm primary" data-action="migratealltracks" style="margin-left:12px">☁️ Move all to cloud</button></div>`:"";
  $("page").innerHTML=`<div class="h-title">My Music</div>
    <div class="mytracks-row">
      <label class="mytracks-label"><input type="checkbox" id="myTracksOnlyChk"${myTracksOnlyMode?' checked':''}/> 🎵 My tracks only</label>
      <span class="mytracks-tip">When checked, the player plays only your music — uncheck to hear everyone on OK Music</span>
    </div>
    ${migrateBanner}
    <div class="folder-banner">📁 <b>Share your music — works on mobile and desktop.</b> On <b>mobile</b>: tap "Add a folder" to pick music files directly from your phone, iCloud, or Google Drive. On <b>desktop</b> (Chrome/Edge): pick an entire folder from your computer or cloud drive. All tracks are cached after selection so they play even when offline.
      <div class="folder-note">☁️ <b>Cloud drive tip (desktop):</b> Make sure your cloud drive is set to <b>sync files locally</b> (not "stream-only"). In Google Drive: Preferences → open files online only → off. In Dropbox: right-click folder → Make available offline.</div>
    <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap"><button class="btn primary" data-action="sharefolder">📁 Add a folder</button><button class="btn" data-action="upload">＋ Add single track</button></div>
    ${pls.length?`<div class="section-title">Playlists (folders)</div>${pls.map(p=>playlistBlock(p,true)).join("")}`:""}
    ${standaloneTracks.length?`<div class="section-title">Single tracks</div>${rows}`:""}
    ${(!pls.length&&!standaloneTracks.length)?'<div class="empty">No music yet — share a folder to begin.</div>':""}`;
  pls.forEach(loadCovers);
}
function setVisibility(id,v){ fbDB.collection("tracks").doc(id).update({ visibility:v }).then(()=>toast(v==="public"?"Published 🎉 (now public)":"Hidden — set to private 🔒")).catch(e=>toast(e.code||e.message)); }
function deleteTrack(id){
  openOverlay(`<h2>🗑️ Delete track?</h2>
    <p style="margin:10px 0 22px;color:var(--muted);line-height:1.5">This will permanently remove the track. This cannot be undone.</p>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn block" data-action="confirmdel" data-id="${id}" style="color:#c0392b;border-color:#f5c6c6">Yes, delete</button>
    </div>`);
}
function doDeleteTrack(id){ fbDB.collection("tracks").doc(id).delete().then(()=>{ closeOverlay(); toast("Track deleted"); }).catch(e=>toast(e.code||e.message)); }

function openAddLink(trackId,title){
  openOverlay(`<h2>🔗 Add streaming link</h2>
    <p class="sub">Paste a public URL so your fans can stream <b>${esc(title)}</b> directly in OK Music.</p>
    <div class="field"><label>Audio link (direct .mp3, SoundCloud, etc.)</label>
      <input id="addLinkUrl" placeholder="https://…/track.mp3" style="width:100%" /></div>
    <div class="note" style="margin:8px 0 16px">Works with any direct audio URL. For SoundCloud: right-click a track → Copy link.</div>
    <button class="btn primary block" data-action="savetracklink" data-id="${trackId}">Save link</button>`);
}

async function saveTrackLink(trackId){
  const url=($("addLinkUrl")||{value:""}).value.trim();
  if(!url) return toast("Please paste a link first.");
  if(!url.startsWith("http")) return toast("Link must start with http:// or https://");
  try{
    await fbDB.collection("tracks").doc(trackId).update({src:url});
    closeOverlay();
    toast("Streaming link saved! Fans can now play this track. ✓");
  }catch(e){ toast("Save failed: "+(e.code||e.message)); }
}

// ---------- edit profile (photo + bg + bio) ----------
function openCustomize(){
  const u=currentUser(); const bgF=u.pageBgFilter||{};
  const bannerStyle=u.bgImg?`background-image:url('${u.bgImg}');background-size:cover;background-position:center`:`background:linear-gradient(135deg,var(--orange-2),var(--orange-3))`;
  const pageBgStyle=u.pageBgImg?`background-image:url('${u.pageBgImg}');background-size:cover;background-position:center`:`background:var(--orange-1)`;
  openOverlay(`<h2>🎨 Edit profile</h2><p class="sub">Make your page unique — fans see all of this on any device.</p>
    <div class="field"><label>Profile photo</label><div class="avup"><div class="avprev" id="avPrev" style="${u.avatarImg?`background-image:url('${u.avatarImg}')`:''}">${u.avatarImg?'':initials(u.name)}</div>
      <div><input type="file" id="avFile" accept="image/*" /><div class="note" style="margin-top:4px">JPG/PNG — or paste a link below.</div></div></div></div>
    <div class="field"><label>Photo link (optional)</label><input id="avUrl" placeholder="https://…/photo.jpg" /></div>
    <div class="field"><label>Bio</label><textarea id="bgBio" placeholder="Tell fans about your music…">${esc(u.bio||"")}</textarea></div>
    <div class="field">
      <label>🖼️ Banner — wide photo at the top of your page</label>
      <div class="cust-banner-prev" id="bannerPrev" style="${bannerStyle}"><span class="cust-hint">Concert · Album art · Artist photo</span>${u.bgImg?`<button class="cust-remove-btn" data-action="removebanner" title="Remove banner">✕</button>`:''}</div>
      <input type="file" id="bannerFile" accept="image/*,.heic,.heif" style="margin-top:6px" />
      <input id="bannerUrl" placeholder="Or paste a banner image link" value="${esc(u.bgImg||"")}" style="margin-top:6px;width:100%" />
    </div>
    <div class="field">
      <label>🌄 Page background image</label>
      <div class="cust-bg-prev" id="pageBgPrev" style="${pageBgStyle}"><span class="cust-hint" style="color:rgba(60,30,0,.6)">Shown behind your whole page</span>${u.pageBgImg?`<button class="cust-remove-btn" data-action="removepagebg" title="Remove background">✕</button>`:''}</div>
      <input type="file" id="pageBgFile" accept="image/*,.heic,.heif" style="margin-top:6px" />
      <input id="pageBgUrl" placeholder="Or paste a background image link" value="${esc(u.pageBgImg||"")}" style="margin-top:6px;width:100%" />
      <label style="margin-top:10px;display:block;font-size:13px;color:var(--muted)">Display mode</label>
      <div class="bg-mode-row">
        <button class="bg-mode-btn ${(u.pageBgMode||'stretch')==='stretch'?'sel':''}" data-action="setbgmode" data-mode="stretch">⤢ Stretch</button>
        <button class="bg-mode-btn ${(u.pageBgMode||'')==='tile'?'sel':''}" data-action="setbgmode" data-mode="tile">▦ Tile</button>
        <button class="bg-mode-btn ${(u.pageBgMode||'')==='center'?'sel':''}" data-action="setbgmode" data-mode="center">⊡ Center</button>
      </div>
      <label style="margin-top:12px;display:block;font-size:13px;color:var(--muted)">🎛️ Adjustments</label>
      <div class="adj-row"><span class="adj-label">☀️ Brightness</span><input type="range" id="adjBrightness" class="adj-slider" min="0" max="200" value="${bgF.brightness!=null?bgF.brightness:100}" /><span class="adj-val" id="adjBrightnessVal">${bgF.brightness!=null?bgF.brightness:100}%</span></div>
      <div class="adj-row"><span class="adj-label">◑ Contrast</span><input type="range" id="adjContrast" class="adj-slider" min="0" max="200" value="${bgF.contrast!=null?bgF.contrast:100}" /><span class="adj-val" id="adjContrastVal">${bgF.contrast!=null?bgF.contrast:100}%</span></div>
      <div class="adj-row"><span class="adj-label">🎨 Color</span><input type="range" id="adjSaturate" class="adj-slider" min="0" max="200" value="${bgF.saturate!=null?bgF.saturate:100}" /><span class="adj-val" id="adjSaturateVal">${bgF.saturate!=null?bgF.saturate:100}%</span></div>
      <div class="adj-row"><span class="adj-label">◻ Transparency</span><input type="range" id="adjOpacity" class="adj-slider" min="10" max="100" value="${bgF.opacity!=null?bgF.opacity:100}" /><span class="adj-val" id="adjOpacityVal">${bgF.opacity!=null?bgF.opacity:100}%</span></div>
    </div>
    <div class="field"><label>Banner colour (if no photo)</label>
      <div class="theme-grid" id="themeGrid">${THEMES.map(t=>`<div class="theme-swatch ${(u.bgTheme||"")===t.id?'sel':''}" style="background:${t.css}" data-action="theme" data-t="${t.id}" title="${t.label}"><span class="theme-label">${t.label}</span></div>`).join("")}</div></div>
    <div class="field"><label>Or a solid colour</label><div class="swatches" id="bgSw">${["#FFCBA0","#7c5cff","#36d1c4","#ff5c7c","#2bbf4e","#5c8bff","#33272f"].map(c=>`<div class="swatch ${u.bgColor===c&&!u.bgTheme?'sel':''}" style="background:${c}" data-action="bgcolor" data-c="${c}"></div>`).join("")}</div></div>
    <button class="btn primary block" data-action="savecustom">Save profile</button>
    <button class="btn block" data-action="openresetcustom" style="margin-top:10px;color:#c0392b;border-color:#f5c6c6">🔄 Reset page to default</button>`);
  window._bgColor=u.bgColor||""; window._bgTheme=u.bgTheme||""; window._avatar=null; window._avatarFile=null; window._bannerFile=null; window._pageBgFile=null; window._bgMode=u.pageBgMode||"stretch"; window._clearBanner=false; window._clearPageBg=false;
}
function removeBanner(){
  window._bannerFile=null; window._clearBanner=true;
  const p=$("bannerPrev"); if(p){ p.style.backgroundImage=""; p.style.background="linear-gradient(135deg,var(--orange-2),var(--orange-3))"; const h=p.querySelector(".cust-hint"); if(h) h.style.opacity="1"; const rb=p.querySelector(".cust-remove-btn"); if(rb) rb.remove(); }
  const u=$("bannerUrl"); if(u) u.value="";
}
function removePageBg(){
  window._pageBgFile=null; window._clearPageBg=true;
  const p=$("pageBgPrev"); if(p){ p.style.backgroundImage=""; p.style.background="var(--orange-1)"; const h=p.querySelector(".cust-hint"); if(h) h.style.opacity="1"; const rb=p.querySelector(".cust-remove-btn"); if(rb) rb.remove(); }
  const u=$("pageBgUrl"); if(u) u.value="";
}
function openResetCustom(){
  openOverlay(`<h2>🔄 Reset page to default?</h2>
    <p style="margin:10px 0 22px;color:var(--muted);line-height:1.5">This removes your banner photo, page background, colour theme and solid colour.<br>Your profile photo and bio will be kept.</p>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn block" data-action="resetcustom" style="color:#c0392b;border-color:#f5c6c6">Yes, reset</button>
    </div>`);
}
async function resetCustom(){
  if(!ME) return;
  const upd={ bgImg:"", pageBgImg:"", pageBgMode:"stretch", bgColor:"", bgTheme:"", pageBgFilter:{} };
  try{
    await fbDB.collection("users").doc(ME.id).set(upd,{merge:true});
    Object.assign(ME,upd); _clearBg(); closeOverlay(); toast("Page reset to default ✓");
    go("profile",{profileId:ME.id});
  }catch(e){ toast("Reset failed: "+(e.code||e.message)); }
}
function setBgMode(mode){
  window._bgMode=mode;
  document.querySelectorAll(".bg-mode-btn").forEach(b=>b.classList.toggle("sel",b.dataset.mode===mode));
}
async function saveCustom(){
  if(!ME) return;
  const saveBtn=document.querySelector('[data-action="savecustom"]');
  if(saveBtn){ saveBtn.disabled=true; saveBtn.textContent="Saving…"; }
  const url=($("avUrl").value||"").trim();
  const upd={ bio:($("bgBio").value||"").trim()||ME.bio||"", bgColor:window._bgTheme?"":(window._bgColor||""), bgTheme:window._bgTheme||"", pageBgMode:window._bgMode||"stretch" };
  upd.pageBgFilter={ brightness:parseInt(($("adjBrightness")||{value:"100"}).value)||100, contrast:parseInt(($("adjContrast")||{value:"100"}).value)||100, saturate:parseInt(($("adjSaturate")||{value:"100"}).value)||100, opacity:parseInt(($("adjOpacity")||{value:"100"}).value)||100 };
  if(window._avatarFile){
    try{ if(saveBtn) saveBtn.textContent="Uploading photo…"; upd.avatarImg=await uploadMediaToCloudinary(window._avatarFile); }
    catch(e){ if(saveBtn){saveBtn.disabled=false;saveBtn.textContent="Save profile";} return toast("Photo upload failed: "+(e.message||e)); }
  } else if(url) upd.avatarImg=url;
  if(window._bannerFile){
    try{ if(saveBtn) saveBtn.textContent="Uploading banner…"; upd.bgImg=await uploadMediaToCloudinary(window._bannerFile); }
    catch(e){ if(saveBtn){saveBtn.disabled=false;saveBtn.textContent="Save profile";} return toast("Banner upload failed: "+(e.message||e)); }
  } else if(window._clearBanner){ upd.bgImg=""; }
  else { const v=($("bannerUrl")||{value:""}).value.trim(); if(v) upd.bgImg=v; }
  if(window._pageBgFile){
    try{ if(saveBtn) saveBtn.textContent="Uploading background…"; upd.pageBgImg=await uploadMediaToCloudinary(window._pageBgFile); }
    catch(e){ if(saveBtn){saveBtn.disabled=false;saveBtn.textContent="Save profile";} return toast("Background upload failed: "+(e.message||e)); }
  } else if(window._clearPageBg){ upd.pageBgImg=""; }
  else { const v=($("pageBgUrl")||{value:""}).value.trim(); if(v) upd.pageBgImg=v; }
  fbDB.collection("users").doc(ME.id).set(upd,{merge:true})
    .then(()=>{ Object.assign(ME,upd); closeOverlay(); toast("Profile saved ✨"); go("profile",{profileId:ME.id}); })
    .catch(e=>{ if(saveBtn){saveBtn.disabled=false;saveBtn.textContent="Save profile";} toast("Couldn't save: "+(e.code||e.message)); });
}

// ---------- invite ----------
function openInvite(){ const u=currentUser(); const link=`${location.origin}${location.pathname}?ref=${u?u.handle:""}`;
  openOverlay(`<h2>✉️ Invite friends</h2><p class="sub">Share your link — friends who join can follow you back and grow your fanbase.</p>
    <div class="invite-link"><input id="invLink" value="${esc(link)}" readonly /><button class="btn primary" data-action="copyinvite">Copy</button></div>`); }

// ---------- social ----------
function share(id){ const link=`${location.origin}${location.pathname}?track=${id}`; if(navigator.clipboard) navigator.clipboard.writeText(link).then(()=>toast("Share link copied ✓")).catch(()=>toast(link)); else toast(link); }
function toggleFollow(uid){
  if(!ME) return openEmailAuth();
  const F=firebase.firestore.FieldValue;
  const has=(CACHE.follows[ME.id]||[]).includes(uid);
  if(has){
    fbDB.collection("follows").doc(ME.id).set({following:F.arrayRemove(uid)},{merge:true}).then(()=>toast("Unfollowed")).catch(e=>toast(e.code||e.message));
    return;
  }
  const alreadyRequested=(CACHE.followRequests||[]).some(r=>r.fromUid===ME.id&&r.toUid===uid&&r.status==='pending');
  if(alreadyRequested){toast("Request already sent");return;}
  const target=userById(uid);
  if(target?.privacy?.requireFollowApproval){
    sendFollowRequest(uid);
    return;
  }
  fbDB.collection("follows").doc(ME.id).set({following:F.arrayUnion(uid)},{merge:true}).then(()=>{
    toast("You're now a fan ✓");
    const rewardRef=fbDB.collection('followRewards').doc(ME.id+'_'+uid);
    fbDB.runTransaction(async t=>{
      if((await t.get(rewardRef)).exists) throw new Error('already rewarded');
      t.set(rewardRef,{followerId:ME.id,followeeId:uid,createdAt:Date.now()});
    }).then(()=>{ WALLET.credit(uid,5,'new_fan',`${ME.name} is now your fan`); checkFanMilestone(uid); }).catch(()=>{});
  }).catch(e=>toast(e.code||e.message));
  notify(uid,"new_fan",`${ME.name} is now one of your fans 🎉`);
}
function logout(){ fbAuth.signOut().then(()=>location.reload()); }

// ---------- avatar lightbox ----------
function viewAvatar(uid){
  const u=userById(uid); if(!u) return;
  const body=u.avatarImg
    ? `<img src="${u.avatarImg}" class="avatar-full" />`
    : `<div class="avatar-full-initials" style="background:${u.color||'#FB7A28'}">${initials(u.name)}</div>`;
  openOverlay(`<div class="avatar-lightbox">${body}<div class="avlb-name">${esc(u.name)}</div><div class="avlb-handle">@${esc(u.handle||'')}</div></div>`);
}

// ---------- overlay ----------
function openOverlay(h){ $("overlayBody").innerHTML=`<div class="modal"><button class="modal-x" data-action="close">✕</button>${h}</div>`; $("overlay").hidden=false; }
function closeOverlay(){ $("overlay").hidden=true; $("overlayBody").innerHTML=""; }

// ---------- player ----------
let hasSrc=false;
function showPlayer(title,artist,accent,src){ $("miniplayer").classList.add("show"); $("mpArt").style.background=grad(accent); $("mpArt").textContent="◎"; $("mpTitle").textContent=title; $("mpArtist").textContent=artist;
  if(src){ hasSrc=true; audio.src=src; audio.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false)); } else { hasSrc=false; setPlaying(true); } }
async function playTrack(id){ const t=allTracks().find(x=>x.id===id); if(!t) return; const u=userById(t.userId); const d=db(); d.plays[id]=(d.plays[id]||0)+1; commit(d); logTrackView(id,t.userId);
  nowPlayingId=id;
  // Lock queue to the viewed profile or My Music — prevents bleed across users
  if(state.view==="profile"&&state.profileId) nowPlayingContext={uid:state.profileId};
  else if(state.view==="mymusic") nowPlayingContext={uid:currentUser().id};
  else nowPlayingContext=null;
  if(t.src&&t.src.startsWith("local:")){
    const blob=await audioGet(t.src.slice(6));
    if(blob){ showPlayer(t.title,u.name,t.accent,URL.createObjectURL(blob)); }
    else if(ME&&ME.id===t.userId) openAddLink(t.id,t.title);
    else toast(`📵 "${esc(t.title)}" is stored locally on the artist's device and can't be streamed yet. The artist needs to add a public streaming link.`);
    return;
  }
  showPlayer(t.title,u.name,t.accent,t.src); if(!t.src) toast("Demo track — no audio linked yet. Reactions still work!"); }
function setPlaying(p){ $("mpPlay").textContent=p?"⏸":"▶"; }
function playQueue(direction){
  let queue=allTracks().filter(t=>t.src&&!t.src.startsWith("local:")&&t.visibility!=="private");
  const filterUid=myTracksOnlyMode&&ME?ME.id:(nowPlayingContext&&nowPlayingContext.uid?nowPlayingContext.uid:null);
  if(filterUid) queue=queue.filter(t=>t.userId===filterUid);
  if(!queue.length) return;
  if(playMode==="shuffle"){ playTrack(queue[Math.floor(Math.random()*queue.length)].id); return; }
  const idx=queue.findIndex(t=>t.id===nowPlayingId);
  const next=queue[(idx+direction+queue.length)%queue.length];
  playTrack(next.id);
}
function cyclePlayMode(){ const m=["continuous","repeat","shuffle"]; playMode=m[(m.indexOf(playMode)+1)%3]; updateModeBtn(); toast(playMode==="continuous"?"Continuous 🔁":playMode==="repeat"?"Repeat one 🔂":"Shuffle 🔀"); }
function updateModeBtn(){ const el=$("mpMode"); if(!el)return; const icons={continuous:"🔁",repeat:"🔂",shuffle:"🔀"}; el.textContent=icons[playMode]; el.classList.toggle("mode-on",playMode!=="continuous"); }
$("mpPlay").addEventListener("click",()=>{ if(!hasSrc)return; if(!audio.paused){audio.pause();setPlaying(false);}else{audio.play();setPlaying(true);} });
document.getElementById("mpMode").addEventListener("click",cyclePlayMode);
audio.addEventListener("ended",()=>{
  if(playMode==="repeat"){ audio.currentTime=0; audio.play().then(()=>setPlaying(true)).catch(()=>{}); return; }
  playQueue(1);
});
audio.addEventListener("timeupdate",()=>{ if(!audio.duration)return; $("mpFill").style.width=(audio.currentTime/audio.duration*100)+"%"; const s=Math.floor(audio.currentTime); $("mpTime").textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`; });
$("mpProg").addEventListener("click",e=>{ if(!audio.duration)return; const r=e.currentTarget.getBoundingClientRect(); audio.currentTime=(e.clientX-r.left)/r.width*audio.duration; });

// ============ ADMIN STATS ============
function renderAdmin(){
  const users=Object.values(CACHE.users);
  const tracks=CACHE.tracks;
  const statuses=CACHE.statuses;
  const products=CACHE.products;
  const orders=CACHE.orders||[];
  const sellers=Object.values(CACHE.sellers);
  const pendingOrders=orders.filter(o=>o.status==="pending_payment");
  const totalRevenue=orders.reduce((s,o)=>s+(o.platformFee||0),0);

  const stat=(icon,label,value,sub="")=>`<div class="admin-stat">
    <div class="admin-stat-icon">${icon}</div>
    <div class="admin-stat-val">${value}</div>
    <div class="admin-stat-label">${label}</div>
    ${sub?`<div class="admin-stat-sub">${sub}</div>`:''}
  </div>`;

  const sortedUsers=users.slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));

  $("page").innerHTML=`<div class="h-title">📊 Admin Stats</div>
    <div class="admin-grid">
      ${stat("👥","Registered users",users.length,"Real accounts in Firestore")}
      ${stat("🎵","Tracks shared",tracks.length,"")}
      ${stat("💬","Wall posts",statuses.length,"")}
      ${stat("🏪","Active sellers",sellers.length,"")}
      ${stat("📦","Products listed",products.length,"")}
      ${stat("🛒","Orders placed",orders.length,`${pendingOrders.length} pending payment`)}
      ${stat("💰","Platform fees earned","$"+totalRevenue.toFixed(2),"3% of completed sales")}
      <div class="admin-stat">
        <div class="admin-stat-icon">🦁</div>
        <div class="admin-stat-val" id="lncCirculationStat" style="font-size:20px">…</div>
        <div class="admin-stat-label">LNC in circulation</div>
        <div class="admin-stat-sub">Sum of all wallets</div>
      </div>
    </div>
    <div class="admin-folder" data-action="toggleadminusers">
      <div class="admin-folder-header">
        <span>👥 All Users <span class="admin-folder-count">${users.length}</span></span>
        <span class="admin-folder-chevron${_adminUsersOpen?' open':''}">${_adminUsersOpen?'▲':'▼'}</span>
      </div>
    </div>
    <div class="admin-folder-body${_adminUsersOpen?'':' hidden'}">
      <div style="padding:8px 0 4px;font-size:12px;color:var(--muted)">Tap a name to view full statistics</div>
      ${sortedUsers.length?sortedUsers.map(u=>`<div class="mrow2 admin-user-row" data-action="adminuserprofile" data-uid="${u.id}">
        <div class="avatar" style="${avatarStyle(u,40)}">${u.avatarImg?'':initials(u.name)}</div>
        <div class="minfo"><div class="mt">${esc(u.name)} <span style="font-size:12px;color:var(--muted)">@${esc(u.handle||'')}</span></div>
          <div class="ms">${u.createdAt?timeAgo(u.createdAt):'unknown'}</div></div>
        <span style="color:var(--muted);font-size:20px;padding-right:2px">›</span>
        </div>`).join(''):'<div class="empty">No users yet.</div>'}
    </div>
    <div class="section-title" style="margin-top:28px">Broadcast</div>
    <div style="background:#fff;border-radius:14px;padding:16px;box-shadow:0 2px 8px rgba(180,120,60,.08)">
      <p style="font-size:14px;margin:0 0 12px">Send the getting-started guide to every registered user as a notification they can read in the app.</p>
      <button class="btn primary" data-action="broadcastwelcome">📢 Send Instructions to All Users (${users.length})</button>
    </div>
    <div class="admin-folder" data-action="toggleprintify" style="margin-top:14px">
      <div class="admin-folder-header">
        <span>🖨️ Printify Import</span>
        <span class="admin-folder-chevron${_printifyOpen?' open':''}">${_printifyOpen?'▲':'▼'}</span>
      </div>
    </div>
    <div class="admin-folder-body${_printifyOpen?'':' hidden'}">
      ${printifyPanelHTML()}
    </div>
    <div class="section-title" style="margin-top:28px">💡 Feature Suggestions (${(CACHE.suggestions||[]).length})</div>
    ${(CACHE.suggestions||[]).length?(CACHE.suggestions||[]).map(s=>`<div class="mrow2" style="padding:12px;background:#fff;border-radius:12px;margin-bottom:8px;box-shadow:0 2px 6px rgba(180,120,60,.06)">
      <div class="minfo"><div class="mt">${esc(s.text)}</div><div class="ms">${esc(s.name||'Anonymous')} · ${timeAgo(s.time)}</div></div>
    </div>`).join(''):'<div class="empty" style="margin-top:8px">No suggestions yet.</div>'}`;
  fetchLncCirculation();
}
function printifyPanelHTML(){
  return `<div style="padding:4px 0 8px">
    <p style="font-size:13px;color:var(--muted);margin:0 0 10px">Paste your <a href="https://printify.com/app/account/api-access" target="_blank" style="color:var(--orange)">Printify API token</a> and click Import. The import runs via Google Cloud — works from any country.</p>
    <div class="field" style="margin-bottom:8px">
      <label style="font-size:13px">API Token</label>
      <input class="fb-field" id="printifyToken" type="password" placeholder="ey…" value="${esc(_printifyToken)}" style="font-size:13px" />
    </div>
    <div class="field" style="margin-bottom:12px">
      <label style="font-size:13px">Shop ID <span style="font-weight:400;color:var(--muted)">(optional — auto-detected if blank)</span></label>
      <input class="fb-field" id="printifyShopId" type="text" placeholder="e.g. 12345678" value="${esc(_printifyShopId)}" style="font-size:13px" />
    </div>
    <button class="btn sm primary" data-action="importprintify">🚀 Save & Import via Cloud</button>
    <div id="printifyStatus" style="margin-top:8px;font-size:13px;color:var(--muted)"></div>
  </div>`;
}
async function fetchLncCirculation(){
  try{
    const snap=await fbDB.collection('wallets').get();
    let total=0;
    snap.forEach(d=>{ total+=(d.data().balance||0); });
    const el=$('lncCirculationStat');
    if(el) el.textContent=Math.floor(total).toLocaleString()+' LNC';
  }catch(e){ console.warn('fetchLncCirculation',e); }
}
async function openAdminUserProfile(uid){
  if(!isAdmin()) return;
  const u=CACHE.users[uid];
  if(!u) return toast('User not in cache — try again in a moment');
  const uTracks=(CACHE.tracks||[]).filter(t=>t.userId===uid);
  const uStatuses=(CACHE.statuses||[]).filter(s=>s.userId===uid);
  const uDisc=(CACHE.discoveryPosts||[]).filter(p=>p.userId===uid);
  const uProducts=(CACHE.products||[]).filter(p=>p.sellerId===uid);
  const uOrders=(CACHE.orders||[]).filter(o=>o.buyerId===uid);
  const fans=followerCount(uid);
  openOverlay(`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
    <div class="avatar" style="${avatarStyle(u,52)}">${u.avatarImg?'':initials(u.name)}</div>
    <div><div style="font-size:17px;font-weight:800">${esc(u.name)}</div>
    <div style="font-size:13px;color:var(--muted)">@${esc(u.handle||'')} · ${u.createdAt?'Joined '+timeAgo(u.createdAt):'unknown'}</div></div>
  </div>
  <div class="admin-user-stats"><div style="text-align:center;color:var(--muted);font-size:13px;padding:12px 0">Loading wallet…</div></div>`);
  let balance=0,totalEarned=0,totalSpent=0;
  try{
    const wSnap=await fbDB.collection('wallets').doc(uid).get();
    if(wSnap.exists){ const d=wSnap.data(); balance=Math.floor(d.balance||0); totalEarned=Math.floor(d.totalEarned||0); totalSpent=Math.floor(d.totalSpent||0); }
  }catch(e){ console.warn('adminUserProfile wallet',e); }
  const row=(ic,label,val)=>`<div class="admin-user-stat-row"><span>${ic}</span><span class="admin-user-stat-label">${label}</span><b>${val}</b></div>`;
  openOverlay(`<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
    <div class="avatar" style="${avatarStyle(u,52)}">${u.avatarImg?'':initials(u.name)}</div>
    <div><div style="font-size:17px;font-weight:800">${esc(u.name)}</div>
    <div style="font-size:13px;color:var(--muted)">@${esc(u.handle||'')}</div></div>
  </div>
  <div class="admin-user-stats">
    ${row('🦁','LNC balance',balance.toLocaleString()+' LNC')}
    ${row('📈','Total earned',totalEarned.toLocaleString()+' LNC')}
    ${row('💸','Total spent',totalSpent.toLocaleString()+' LNC')}
    ${row('🎵','Tracks posted',uTracks.length)}
    ${row('💬','Wall posts',uStatuses.length)}
    ${row('📣','Discovery posts',uDisc.length)}
    ${row('🫂','Fans',fans.toLocaleString())}
    ${row('📦','Products listed',uProducts.length)}
    ${row('🛒','Orders placed',uOrders.length)}
    ${row('🗓️','Member since',u.createdAt?new Date(u.createdAt).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):'unknown')}
  </div>
  <button class="btn sm" style="margin-top:14px" data-action="profile" data-uid="${uid}">View Profile →</button>`);
}
async function broadcastWelcome(){
  if(!isAdmin()) return;
  const users=Object.values(CACHE.users).filter(u=>u.id&&!String(u.id).startsWith("u_"));
  if(!users.length) return toast("No users loaded yet — wait a moment and try again.");
  const text="🏆 New on OK Music: Prediction Contests are live! Go to 🏆 Contests in the sidebar, pick your answer on music & culture questions, and win 🦁 LionCoins instantly when you're right — prizes credited automatically to your wallet. Every correct pick earns you the full prize. Plus: earn LNC for track plays, uploads, posts, comments, reactions, new fans, daily login streaks — and send or spend LNC freely with other users and in the Marketplace. Tap to read the full guide.";
  let sent=0;
  for(const u of users){
    try{
      await fbDB.collection("notifications").add({ forUid:u.id, type:"welcome_broadcast", fromUid:"platform", fromName:"OK Music", text, time:Date.now(), read:false });
      sent++;
    }catch(e){ console.warn("broadcast fail",u.id,e.code); }
  }
  toast(`Guide sent to ${sent} user${sent!==1?"s":""} ✓`);
}
async function loadPrintifyShops(){
  // Legacy: kept for dispatcher compatibility; import now uses Cloud Function
  importPrintifyProducts();
}
async function importPrintifyProducts(){
  if(!isAdmin()) return;
  const token=($('printifyToken')?.value||_printifyToken).trim();
  if(!token) return toast('Paste your Printify API token first');
  _printifyToken=token;
  const shopId=($('printifyShopId')?.value||'').trim();
  const status=$('printifyStatus');
  const btn=document.querySelector('[data-action="importprintify"]');
  if(status){ status.style.color='var(--muted)'; status.textContent='Connecting to Printify via Cloud Function…'; }
  if(btn){ btn.disabled=true; btn.textContent='Importing…'; }
  try{
    const fn=firebase.functions().httpsCallable('importPrintifyProducts');
    const result=await fn({ token, shopId: shopId||undefined });
    const {total,created,updated,shopId:usedShopId}=result.data;
    _printifyShopId=usedShopId||shopId;
    if(status){
      status.style.color='green';
      status.textContent=`✓ ${created} new, ${updated} updated (${total} total). Token saved — checkout is now live!`;
    }
    toast(`Printify import done: ${created} new, ${updated} updated 🖨️`);
  }catch(e){
    console.error('importPrintifyProducts',e);
    const msg=(e.message||'Import failed').replace(/^internal: /,'');
    if(status){ status.style.color='var(--red,#e53)'; status.textContent=`Error: ${msg}`; }
    toast('Import failed — see panel for details');
  }finally{
    if(btn){ btn.disabled=false; btn.textContent='🚀 Save & Import via Cloud'; }
  }
}

function renderFans(){
  const me=currentUser(); if(!me) return;
  const tab=state.fanTab||"fans";
  const fans=followersOf(me.id).map(userById).filter(Boolean);
  const fanOf=followingOf(me.id).map(userById).filter(Boolean);                     // people ME is a fan of
  const following=(CACHE.userFollows[me.id]||[]).map(userById).filter(Boolean);     // one-way follows
  const followers=followersOfUser(me.id).map(userById).filter(Boolean);             // one-way followers
  const pendingReqs=(CACHE.followRequests||[]).filter(r=>r.toUid===me.id&&r.status==='pending');
  const reqCount=pendingReqs.length;
  let content="";
  if(tab==="fans"){
    content=fans.length?fans.map(u=>`<div class="mrow2">
      <div class="avatar" style="${avatarStyle(u,44)};cursor:pointer" data-action="viewavatar" data-uid="${u.id}">${u.avatarImg?'':initials(u.name)}</div>
      <div class="minfo"><div class="mt" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div><div class="ms">@${esc(u.handle)}</div></div>
      <button class="btn sm" style="color:#e2554f;border-color:#e2554f" data-action="removefan" data-uid="${u.id}">Remove</button>
    </div>`).join(""):'<div class="empty">No fans yet — share your invite link, post tracks and statuses to attract them! 🎶</div>';
  } else if(tab==="requests"){
    content=reqCount?pendingReqs.map(r=>{const u=userById(r.fromUid)||{name:r.fromName||'?',id:r.fromUid,color:'#FB7A28'};
      return`<div class="mrow2">
        <div class="avatar" style="${avatarStyle(u,44)};cursor:pointer" data-action="profile" data-uid="${u.id}">${u.avatarImg?'':initials(u.name||'?')}</div>
        <div class="minfo"><div class="mt">${esc(u.name||r.fromName||'?')}</div><div class="ms">Wants to be your fan · ${timeAgo(r.time)}</div></div>
        <button class="btn sm primary" data-action="acceptfollow" data-fromuid="${r.fromUid}" data-reqid="${r.id}">Accept</button>
        <button class="btn sm" data-action="rejectfollow" data-fromuid="${r.fromUid}" data-reqid="${r.id}">Decline</button>
      </div>`}).join(""):'<div class="empty">No pending fan requests.</div>';
  } else if(tab==="fanof"){
    content=fanOf.length?fanOf.map(u=>{
      return `<div class="mrow2">
        <div class="avatar" style="${avatarStyle(u,44)};cursor:pointer" data-action="viewavatar" data-uid="${u.id}">${u.avatarImg?'':initials(u.name)}</div>
        <div class="minfo"><div class="mt" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div><div class="ms">@${esc(u.handle)} · ${nfmt(followerCount(u.id))} fans</div></div>
        <button class="btn sm" style="color:#e2554f;border-color:#e2554f;flex-shrink:0" data-action="unfanself" data-uid="${u.id}">Un-fan</button>
      </div>`;
    }).join(""):'<div class="empty">You\'re not a fan of anyone yet. Visit profiles and become a fan to access their full content.</div>';
  } else if(tab==="following"){
    content=following.length?following.map(u=>{
      return `<div class="mrow2">
        <div class="avatar" style="${avatarStyle(u,44)};cursor:pointer" data-action="viewavatar" data-uid="${u.id}">${u.avatarImg?'':initials(u.name)}</div>
        <div class="minfo"><div class="mt" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div><div class="ms">@${esc(u.handle)}</div></div>
        <button class="btn sm" data-action="unfollowuser" data-uid="${u.id}" style="flex-shrink:0">Unfollow</button>
      </div>`;
    }).join(""):'<div class="empty">You\'re not following anyone yet. Visit profiles and tap Follow to get updates when they post.</div>';
  } else {
    content=followers.length?followers.map(u=>`<div class="mrow2">
      <div class="avatar" style="${avatarStyle(u,44)};cursor:pointer" data-action="viewavatar" data-uid="${u.id}">${u.avatarImg?'':initials(u.name)}</div>
      <div class="minfo"><div class="mt" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div><div class="ms">@${esc(u.handle)}</div></div>
    </div>`).join(""):'<div class="empty">No followers yet — share your profile to get followed.</div>';
  }
  $("page").innerHTML=`<div class="h-title">My Fanbase</div>
    ${myBusyToggle()}
    <div class="tabs" style="margin-top:10px;flex-wrap:wrap">
      <button class="tab ${tab==='fans'?'active':''}" data-action="fantab" data-t="fans">🫂 Fans (${fans.length})</button>
      <button class="tab ${tab==='requests'?'active':''}" data-action="fantab" data-t="requests">Requests${reqCount?` <span class="bell-badge" style="position:static;margin-left:4px">${reqCount}</span>`:` (0)`}</button>
      <button class="tab ${tab==='fanof'?'active':''}" data-action="fantab" data-t="fanof">Fan of (${fanOf.length})</button>
      <button class="tab ${tab==='following'?'active':''}" data-action="fantab" data-t="following">Following (${following.length})</button>
      <button class="tab ${tab==='followers'?'active':''}" data-action="fantab" data-t="followers">Followers (${followers.length})</button>
    </div>${content}`;
}

// ---------- notifications ----------
function notify(forUid,type,text){
  if(!ME||!forUid||forUid===ME.id) return;
  if(String(forUid).startsWith("u_")) return;          // skip seed/demo recipients
  fbDB.collection("notifications").add({ forUid, type, fromUid:ME.id, fromName:ME.name, text, time:Date.now(), read:false }).catch(()=>{});
}

// ---- Push / browser notifications ----
const _shownNotifIds=new Set();

function showBrowserNotif(title, body, opts={}){
  if(!('Notification' in window)||Notification.permission!=='granted') return null;
  try{
    const n=new Notification(title,{ body, icon:'favicon.ico', badge:'favicon.ico', ...opts });
    n.onclick=()=>{ window.focus(); n.close(); };
    return n;
  }catch(e){ return null; }
}

function showCallBrowserNotif(callerId){
  if(!('Notification' in window)||Notification.permission!=='granted') return;
  const caller=userById(callerId);
  const name=caller?.name||'Someone';
  try{
    const n=new Notification(`📞 ${name} is calling you`,{
      body:'Tap to answer on OK Music',
      icon:'favicon.ico',
      badge:'favicon.ico',
      requireInteraction:true,   // stays on screen until user acts
      tag:'incoming-call',
      renotify:true,
    });
    n.onclick=()=>{ window.focus(); n.close(); };
  }catch(e){}
}

async function initPushNotifications(){
  // GitHub Pages project sites cannot serve firebase-messaging-sw.js at the origin
  // root (/), so the Firebase Messaging SDK always fails its default SW registration.
  // Push notifications are only active on the Firebase Hosting URL.
  if(location.hostname==='tigerlionx.github.io') return;
  if(!('Notification' in window)) return;
  // Only request if not already decided
  if(Notification.permission==='default'){
    const perm=await Notification.requestPermission().catch(()=>'denied');
    if(perm!=='granted') return;
  }
  if(Notification.permission!=='granted') return;

  // Register service worker and get FCM token
  if(!('serviceWorker' in navigator)) return;
  try{
    // Derive the SW path relative to the page so it works on both Firebase Hosting (/)
    // and GitHub Pages (/okmusic/), which serve the file at different URL prefixes.
    const swBase=location.pathname.replace(/\/[^/]*$/,'/');
    const reg=await navigator.serviceWorker.register(swBase+'firebase-messaging-sw.js',{ scope:swBase });
    // Listen for messages from the SW (e.g. notification click when app was closed)
    navigator.serviceWorker.addEventListener('message',e=>{
      const d=e.data||{};
      if(d.type==='SW_NOTIF_CLICK'){
        if(d.notifType==='message'&&d.fromUid) go('chat',{profileId:d.fromUid});
        else if(d.notifType==='call'&&d.fromUid) { /* call UI already handles this */ }
        else go('notifs');
      }
    });

    // Save FCM token to Firestore so a backend can send pushes when browser is closed
    try{
      const fbMsg=firebase.messaging();
      // VAPID key from Firebase Console → Project Settings → Cloud Messaging → Web Push
      // Replace the placeholder below with your actual VAPID key
      const VAPID_KEY='BFKRCVx_uzQuiIaD7kxidjMmzb-mvdptTILkdAsyLyLw5mUXOcEzzX3PP1tZxIzITLwQI6iVZ47DyMH3k1VfdkY';
      if(!VAPID_KEY.includes('PLACEHOLDER')){
        const token=await fbMsg.getToken({ vapidKey:VAPID_KEY, serviceWorkerRegistration:reg });
        if(token&&ME?.id){
          fbDB.collection("users").doc(ME.id).set({ fcmToken:token }, { merge:true }).catch(()=>{});
        }
      }
    }catch(e){ /* FCM token optional — in-tab notifs still work */ }
  }catch(e){ console.warn('SW registration failed',e); }
}

let notifUnsub=null;
function startMyNotifications(){
  if(notifUnsub){ notifUnsub(); notifUnsub=null; }
  if(!ME||!ME.handle){ CACHE.notifications=[]; return; }
  notifUnsub=fbDB.collection("notifications").where("forUid","==",ME.id)
    .onSnapshot(s=>{
      CACHE.notifications=s.docs.map(d=>({ id:d.id, ...d.data() }));
      // Show browser notification for each new unread item (works when tab is in background)
      s.docChanges().forEach(ch=>{
        if(ch.type!=='added') return;
        const n={ id:ch.doc.id, ...ch.doc.data() };
        if(n.read||_shownNotifIds.has(n.id)) return;
        if(Date.now()-n.time>30000) return;  // ignore old notifications on page load
        _shownNotifIds.add(n.id);
        if(n.type==='call') return;  // calls handled separately by listenForIncomingCalls
        if(n.type==='call_conference'&&n.callId&&!activePc&&!_confCallId){
          // Show incoming conference ring in the floating panel
          showCallBrowserNotif(n.fromUid);
          const panel=document.getElementById('call-panel');
          const caller=userById(n.fromUid)||{name:n.fromName||'Someone',color:'#FB7A28'};
          if(panel&&!panel.classList.contains('active')){
            playRing();
            panel.innerHTML=`
              <div class="cp-drag" id="cpDrag"><span class="cp-drag-dots">⠿</span><span class="cp-title">📞 Conference call</span></div>
              <div class="cp-body" style="text-align:center;padding:18px 16px">
                <div style="position:relative;width:70px;height:70px;margin:0 auto 12px">
                  <div class="call-pulse" style="inset:-8px"></div><div class="call-pulse d2" style="inset:-18px"></div>
                  <div class="avatar" style="${avatarStyle(caller,70)}">${caller.avatarImg?'':initials(caller.name||'?')}</div>
                </div>
                <div style="font-weight:700;font-size:16px;color:var(--text);margin-bottom:4px">${esc(caller.name||n.fromName||'Someone')}</div>
                <div style="font-size:12px;color:var(--muted);margin-bottom:16px">Incoming conference call</div>
                <div style="display:flex;gap:14px;justify-content:center">
                  <button class="call-btn-accept" data-action="joinconference" data-id="${n.callId}" title="Join">📞</button>
                  <button class="call-btn-end" data-action="declineconf" data-id="${n.callId}" title="Decline">📵</button>
                </div>
              </div>`;
            panel.classList.add('active');
            _reinitCpDrag();
          }
          return;
        }
        showBrowserNotif('◎ OK Music', n.text, { tag:n.type, renotify:true });
      });
      scheduleRender();
    }, e=>console.warn("notif",e.code));
}
function markAllRead(){
  const un=(CACHE.notifications||[]).filter(n=>!n.read); if(!un.length) return;
  const b=fbDB.batch(); un.forEach(n=>b.update(fbDB.collection("notifications").doc(n.id),{ read:true })); b.commit().catch(()=>{});
}
function renderNotifs(){
  const list=(CACHE.notifications||[]).slice().sort((a,b)=>b.time-a.time);
  const pendingReqs=(CACHE.followRequests||[]).filter(r=>r.toUid===ME?.id&&r.status==='pending');
  const reqSection=pendingReqs.length?`<div class="h-title" style="font-size:15px;margin-top:0;margin-bottom:8px">Fan Requests (${pendingReqs.length})</div>`+pendingReqs.map(r=>{
    const u=userById(r.fromUid)||{name:r.fromName||'?',id:r.fromUid,color:'#FB7A28'};
    return`<div class="mrow2" style="background:#fff7f1;border-radius:12px;margin-bottom:6px;padding:10px">
      <div class="avatar" style="${avatarStyle(u,42)};cursor:pointer" data-action="profile" data-uid="${u.id}">${u.avatarImg?'':initials(u.name||'?')}</div>
      <div class="minfo"><div class="mt">${esc(u.name||r.fromName||'?')} wants to be your fan</div><div class="ms">${timeAgo(r.time)}</div></div>
      <button class="btn sm primary" data-action="acceptfollow" data-fromuid="${r.fromUid}" data-reqid="${r.id}">Accept</button>
      <button class="btn sm" data-action="rejectfollow" data-fromuid="${r.fromUid}" data-reqid="${r.id}">Decline</button>
    </div>`;}).join(""):'';
  $("page").innerHTML=`<div class="h-title">Notifications 🔔</div>${reqSection}${
    list.length?list.map(n=>{
      const isPlatform=n.fromUid==="platform";
      const isMsg=n.type==="message";
      const isFanReq=n.type==="fan_request"||n.type==="followrequest";
      const action=isPlatform?`data-action="showguide"`:isMsg?`data-action="openchat" data-uid="${n.fromUid}"`:isFanReq?`data-action="fantab" data-t="requests"`:`data-action="profile" data-uid="${n.fromUid}"`;
      const av=isPlatform
        ?`<div class="avatar" style="width:42px;height:42px;font-size:20px;background:var(--orange);flex-shrink:0;border-radius:50%;display:grid;place-items:center;color:#fff">◎</div>`
        :`<div class="avatar" style="${avatarStyle(userById(n.fromUid)||{color:'#FB7A28'},42)}">${(userById(n.fromUid)?.avatarImg)?'':initials(n.fromName||'?')}</div>`;
      return `<div class="mrow2" ${action} style="cursor:pointer;${n.read?'':'background:#fff7f1'}">${av}
        <div class="minfo"><div class="mt">${esc(n.text)}</div><div class="ms">${timeAgo(n.time)}</div></div></div>`;
    }).join("")
    :'<div class="empty">No notifications yet. When fans follow you or react to your music & posts, they\'ll show up here. 🔔</div>'}`;
  setTimeout(markAllRead,400);
}

// ---------- buzzing (trending chart) ----------
function renderBuzzing(){
  let list=allTracks().filter(t=>t.visibility==="public").map(t=>({ t, score:playCount(t.id)+likeCount(t.id)*5 }));
  list.sort((a,b)=>b.score-a.score); list=list.slice(0,25);
  $("page").innerHTML=`<div class="h-title">🔥 Buzzing right now</div>
    <p class="note" style="margin-bottom:14px">The community's hottest tracks, ranked by plays + likes.</p>
    ${list.map((x,i)=>{ const t=x.t, u=userById(t.userId); const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':('#'+(i+1));
      const bzArt=t.coverImg?`background-image:url('${t.coverImg}');background-size:cover;background-position:center`:`background:${grad(t.accent)}`;
      return `<div class="mrow2">
        <div style="width:34px;text-align:center;font-weight:900;color:var(--orange-deep)">${medal}</div>
        <div class="mart" style="${bzArt};cursor:pointer" data-action="play" data-id="${t.id}">${t.coverImg?'':'◎'}</div>
        <div class="minfo"><div class="mt" data-action="play" data-id="${t.id}">${esc(t.title)}</div>
          <div class="ms" data-action="profile" data-uid="${u.id}">${esc(u.name)} · ▶ ${nfmt(playCount(t.id))} · 👍 ${nfmt(likeCount(t.id))}</div></div>
        <button class="btn sm primary" data-action="play" data-id="${t.id}">▶</button></div>`; }).join("")}`;
}

// ---------- suggestion box (collect ideas to improve the network) ----------
function openSuggest(){
  openOverlay(`<h2>💡 Help shape OK Music</h2><p class="sub">Tell us what to add or improve — every idea is read.</p>
    <div class="field"><textarea id="sgText" placeholder="e.g. Add direct messages between artists, a weekly Top-10 chart, dark mode…" style="min-height:110px"></textarea></div>
    <button class="btn primary block" data-action="sendsuggest">Send suggestion</button>
    <p class="note">Saved to the community suggestion box for the team to review. (A live Claude-powered assistant can be added later.)</p>`);
}
function sendSuggest(){
  const t=($("sgText").value||"").trim(); if(!t) return toast("Type your idea first");
  fbDB.collection("suggestions").add({ uid:(ME&&ME.id)||"guest", name:(ME&&ME.name)||"Guest", text:t, time:Date.now() })
    .then(()=>{ closeOverlay(); toast("Thank you! Your idea was sent 💜"); })
    .catch(e=>toast("Couldn't send: "+(e.code||e.message)));
}

// =========================================================
// SECURITY — session tracking, device management
// =========================================================
function getDeviceInfo(){
  const ua=navigator.userAgent;
  let browser='Browser';
  if(ua.includes('Edg/')) browser='Edge';
  else if(ua.includes('Chrome')&&!ua.includes('Chromium')) browser='Chrome';
  else if(ua.includes('Firefox')) browser='Firefox';
  else if(ua.includes('Safari')) browser='Safari';
  else if(ua.includes('OPR')||ua.includes('Opera')) browser='Opera';
  let os='Unknown';
  if(/iPhone|iPad|iPod/.test(ua)) os='iOS';
  else if(/Android/.test(ua)) os='Android';
  else if(ua.includes('Mac')) os='Mac';
  else if(ua.includes('Windows')) os='Windows';
  else if(ua.includes('Linux')) os='Linux';
  let device='Desktop';
  if(/Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) device='Mobile';
  else if(/iPad|Tablet/i.test(ua)) device='Tablet';
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'Unknown';
  return { browser, os, device, tz };
}
function getSessionId(){
  let sid=localStorage.getItem('okm_sid');
  if(!sid){
    const arr=new Uint8Array(16); crypto.getRandomValues(arr);
    sid=[...arr].map((b,i)=>(i===4||i===6||i===8||i===10?'-':'')+b.toString(16).padStart(2,'0')).join('');
    localStorage.setItem('okm_sid',sid);
  }
  return sid;
}
let _sessionUnsub=null;
async function handleLoginSecurity(uid){
  const sid=getSessionId();
  try{
    const snap=await fbDB.collection('users').doc(uid).collection('sessions').doc(sid).get();
    if(snap.exists){
      const d=snap.data();
      if(d.active===false){ toast('This session was signed out remotely. Please log in again.'); setTimeout(()=>fbAuth.signOut(),1800); return; }
      if(d.expiresAt&&d.expiresAt<Date.now()){ toast('Your public device session has expired. Please log in again.'); setTimeout(()=>fbAuth.signOut(),1800); return; }
      fbDB.collection('users').doc(uid).collection('sessions').doc(sid).update({ lastSeen:Date.now() }).catch(()=>{});
      _startSessionListener(uid,sid);
      if(d.expiresAt&&d.expiresAt>Date.now()) _schedulePublicExpiry(d.expiresAt);
    } else {
      _initSession(uid, false);
    }
  }catch(e){ console.warn('Security init error:',e); }
}
async function _initSession(uid,isPublic){
  const sid=getSessionId(); const devInfo=getDeviceInfo(); const now=Date.now();
  const expiresAt=isPublic?now+2*60*60*1000:null;
  const sessionRef=fbDB.collection('users').doc(uid).collection('sessions').doc(sid);
  try{
    const userSnap=await fbDB.collection('users').doc(uid).get();
    const fcmToken=userSnap.data()?.fcmToken||null;
    await sessionRef.set({ sid, ...devInfo, active:true, createdAt:now, lastSeen:now, expiresAt, isPublic:!!isPublic, fcmToken },{ merge:false });
    fbDB.collection('users').doc(uid).collection('activityLog').add({ type:'login', ...devInfo, timestamp:now, isPublic:!!isPublic }).catch(()=>{});
    // New device notification to other sessions
    const others=await fbDB.collection('users').doc(uid).collection('sessions').where('active','==',true).get();
    let hasOtherActive=false;
    others.forEach(d=>{ if(d.id!==sid&&d.data().active!==false) hasOtherActive=true; });
    if(hasOtherActive){
      fbDB.collection('notifications').add({ forUid:uid, type:'new_login', fromUid:'platform', fromName:'OK Music',
        text:`🔐 New sign-in detected: ${devInfo.browser} on ${devInfo.os} (${devInfo.tz}). If this wasn't you, go to Security in your profile immediately.`,
        time:now, read:false }).catch(()=>{});
    }
    _startSessionListener(uid,sid);
    if(isPublic) _schedulePublicExpiry(expiresAt);
  }catch(e){ console.warn('Session write error:',e); }
}
function _startSessionListener(uid,sid){
  if(_sessionUnsub){ _sessionUnsub(); _sessionUnsub=null; }
  _sessionUnsub=fbDB.collection('users').doc(uid).collection('sessions').doc(sid)
    .onSnapshot(snap=>{
      if(!snap.exists||!ME) return;
      const d=snap.data();
      if(d.active===false){ toast('You were signed out from another device.'); setTimeout(()=>fbAuth.signOut(),1800); }
      else if(d.expiresAt&&d.expiresAt<Date.now()){ toast('Your session has expired.'); setTimeout(()=>fbAuth.signOut(),1800); }
    },()=>{});
}
function _schedulePublicExpiry(expiresAt){
  const ms=expiresAt-Date.now(); if(ms<=0) return;
  setTimeout(()=>{ toast('Your 2-hour public device session has expired. Signing out…'); setTimeout(()=>fbAuth.signOut(),2500); }, ms);
}
async function logoutAllOtherDevices(){
  if(!ME) return;
  const sid=getSessionId();
  try{
    const sessions=await fbDB.collection('users').doc(ME.id).collection('sessions').where('active','==',true).get();
    const batch=fbDB.batch();
    let count=0;
    sessions.forEach(d=>{ if(d.id!==sid){ batch.update(d.ref,{ active:false }); count++; } });
    if(count===0){ toast('No other active sessions to sign out.'); return; }
    await batch.commit();
    fbDB.collection('users').doc(ME.id).collection('activityLog').add({ type:'logout_all', ...getDeviceInfo(), timestamp:Date.now() }).catch(()=>{});
    toast(`Signed out ${count} other device${count>1?'s':''} ✓`);
    openSecurityModal();
  }catch(e){ toast('Error: '+(e.message||e)); }
}
async function openSecurityModal(){
  if(!ME) return;
  const uid=ME.id; const sid=getSessionId();
  openOverlay(`<div class="sec-loading">Loading security info…</div>`);
  try{
    const [sessionSnap,logSnap]=await Promise.all([
      fbDB.collection('users').doc(uid).collection('sessions').orderBy('lastSeen','desc').limit(12).get().catch(()=>null),
      fbDB.collection('users').doc(uid).collection('activityLog').orderBy('timestamp','desc').limit(15).get().catch(()=>null),
    ]);
    const sessions=[]; if(sessionSnap) sessionSnap.forEach(d=>sessions.push({ id:d.id,...d.data() }));
    const logs=[]; if(logSnap) logSnap.forEach(d=>logs.push({ id:d.id,...d.data() }));
    const devIcon=s=>s.device==='Mobile'?'📱':s.device==='Tablet'?'📲':'💻';
    const sessionRows=sessions.length?sessions.map(s=>{
      const isCur=s.id===sid; const active=s.active!==false; const expired=s.expiresAt&&s.expiresAt<Date.now();
      const badge=isCur?'<span class="sec-badge cur">This device</span>':(!active||expired)?'<span class="sec-badge off">Signed out</span>':'<span class="sec-badge on">Active</span>';
      const exp=s.expiresAt&&!expired?` · Expires ${new Date(s.expiresAt).toLocaleTimeString()}`:'';
      return `<div class="sec-session">${devIcon(s)}<div class="sec-sess-info"><div class="sec-sess-name">${esc(s.browser||'Browser')} on ${esc(s.os||'?')} ${badge}</div><div class="sec-sess-meta">${esc(s.tz||'')} · Last seen ${timeAgo(s.lastSeen||s.createdAt)}${exp}</div></div></div>`;
    }).join(''):`<div class="empty" style="padding:12px">No sessions found.</div>`;
    const logRows=logs.length?logs.map(l=>{
      const icon=l.type==='login'?'🔑':l.type==='logout_all'?'🔒':'📋';
      const label=l.type==='login'?'Sign-in':l.type==='logout_all'?'Signed out all devices':'Activity';
      return `<div class="sec-log-row">${icon}<div class="sec-log-info"><div>${label} · ${esc(l.browser||'Browser')} on ${esc(l.os||'?')}${l.isPublic?' · Public device':''}</div><div class="sec-log-meta">${esc(l.tz||'')} · ${new Date(l.timestamp).toLocaleString()}</div></div></div>`;
    }).join(''):`<div class="empty" style="padding:12px">No activity yet.</div>`;
    const hasOthers=sessions.some(s=>s.id!==sid&&s.active!==false&&!(s.expiresAt&&s.expiresAt<Date.now()));
    openOverlay(`<h2>🔐 Account Security</h2>
      <div class="sec-section"><div class="sec-title">Active Sessions</div>${sessionRows}
        ${hasOthers?`<button class="btn block sec-signout-btn" data-action="logoutall">Sign out all other devices</button>`:'<p class="sec-note">No other active sessions.</p>'}
      </div>
      <div class="sec-section"><div class="sec-title">Recent Activity (last 15 events)</div>${logRows}</div>`);
  }catch(e){ openOverlay(`<p class="sub" style="text-align:center">Couldn't load security info.</p>`); }
}

// =========================================================
// PRIVACY & SETTINGS
// =========================================================
function getPrivacy(u){ return u?.privacy||{}; }
function hasBlocked(uid){ return (ME?.blockedUsers||[]).includes(uid); }
function isBlockedByMe(uid){ return hasBlocked(uid); }
function canMessage(targetUid){
  const t=userById(targetUid); if(!t) return true;
  if(hasBlocked(targetUid)) return false;
  const p=getPrivacy(t);
  if(p.whoCanMessage==='none') return false;
  if(p.whoCanMessage==='followers') return (CACHE.follows[ME?.id]||[]).includes(targetUid);
  return true;
}
function canCall(targetUid){
  const t=userById(targetUid); if(!t) return true;
  if(hasBlocked(targetUid)) return false;
  const p=getPrivacy(t);
  if(p.whoCanCall==='none') return false;
  if(p.whoCanCall==='followers') return (CACHE.follows[ME?.id]||[]).includes(targetUid);
  return true;
}
function isProfilePrivate(uid){
  const u=userById(uid); if(!u) return false;
  return !!(getPrivacy(u).profilePrivate) && !(CACHE.follows[ME?.id]||[]).includes(uid) && uid!==ME?.id;
}

async function openSettingsModal(tab='privacy'){
  if(!ME) return;
  const tabs=['privacy','blocked','security','account'];
  const tabLabels={ privacy:'🔒 Privacy', blocked:'🚫 Blocked', security:'🔐 Security', account:'👤 Account' };
  const tabNav=tabs.map(t=>`<button class="stab ${t===tab?'active':''}" data-action="settingstab" data-tab="${t}">${tabLabels[t]}</button>`).join('');

  let body='';
  if(tab==='privacy'){
    const p=getPrivacy(ME);
    body=`
      <div class="sset-group">
        <div class="sset-label">Profile Privacy</div>
        <div class="sset-row"><div><div class="sset-name">Private profile</div><div class="sset-hint">Only followers can see your tracks and posts</div></div>
          <label class="stoggle"><input type="checkbox" id="privProfile" ${p.profilePrivate?'checked':''}><span class="stoggle-sl"></span></label></div>
      </div>
      <div class="sset-group">
        <div class="sset-label">Messaging</div>
        <div class="sset-name" style="margin-bottom:8px">Who can send me messages?</div>
        ${['all','followers','none'].map(v=>`<label class="sradio"><input type="radio" name="whoMsg" value="${v}" ${(p.whoCanMessage||'all')===v?'checked':''}><span>${v==='all'?'Everyone':v==='followers'?'Followers only':'Nobody'}</span></label>`).join('')}
      </div>
      <div class="sset-group">
        <div class="sset-label">Calls</div>
        <div class="sset-name" style="margin-bottom:8px">Who can call me?</div>
        ${['all','followers','none'].map(v=>`<label class="sradio"><input type="radio" name="whoCall" value="${v}" ${(p.whoCanCall||'all')===v?'checked':''}><span>${v==='all'?'Everyone':v==='followers'?'Followers only':'Nobody'}</span></label>`).join('')}
      </div>
      <div class="sset-group">
        <div class="sset-label">Fan Requests</div>
        <div class="sset-row"><div><div class="sset-name">Approve fans manually</div><div class="sset-hint">New fans must request to follow you — you accept or decline</div></div>
          <label class="stoggle"><input type="checkbox" id="privFollowApproval" ${p.requireFollowApproval?'checked':''}><span class="stoggle-sl"></span></label></div>
      </div>
      <div class="sset-group">
        <div class="sset-label">Discoverability</div>
        <div class="sset-row"><div><div class="sset-name">Hide from Discover & Search</div><div class="sset-hint">Your profile won't appear to other users browsing</div></div>
          <label class="stoggle"><input type="checkbox" id="privDiscover" ${p.hideFromDiscover?'checked':''}><span class="stoggle-sl"></span></label></div>
      </div>
      <button class="btn primary block" data-action="saveprivacy" style="margin-top:8px">Save Privacy Settings</button>`;
  } else if(tab==='blocked'){
    const blocked=(ME.blockedUsers||[]).map(uid=>userById(uid)).filter(Boolean);
    body=`<div class="sset-group">
      <div class="sset-label">Blocked Users (${blocked.length})</div>
      ${blocked.length?blocked.map(u=>`<div class="sset-row" style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="avatar" style="${avatarStyle(u,38)}">${u.avatarImg?'':initials(u.name)}</div>
          <div><div class="sset-name">${esc(u.name)}</div><div class="sset-hint">@${esc(u.handle)}</div></div>
        </div>
        <button class="btn sm" data-action="unblockuser" data-uid="${u.id}">Unblock</button>
      </div>`).join(''):`<div class="empty" style="padding:20px">You haven't blocked anyone.</div>`}
    </div>`;
  } else if(tab==='security'){
    body=`<div class="sset-group">
      <div class="sset-label">Sessions & Activity</div>
      <p class="sset-hint" style="margin-bottom:14px">View all devices signed in to your account, sign out remotely, and review your recent activity log.</p>
      <button class="btn primary block" data-action="security">Open Security Center</button>
    </div>`;
  } else if(tab==='account'){
    const isEmail=fbAuth.currentUser?.providerData?.some(p=>p.providerId==='password');
    body=`
      ${isEmail?`<div class="sset-group">
        <div class="sset-label">Credentials</div>
        <button class="btn block" data-action="changepw" style="margin-bottom:8px">🔑 Change Password</button>
        <button class="btn block" data-action="changeemail">✉️ Change Email</button>
      </div>`:''}
      <div class="sset-group">
        <div class="sset-label">Your Data</div>
        <button class="btn block" data-action="exportdata" style="margin-bottom:8px">📦 Export My Data (JSON)</button>
      </div>
      <div class="sset-group">
        <div class="sset-label" style="color:#e2554f">Danger Zone</div>
        <p class="sset-hint" style="margin-bottom:10px">Permanently delete your account and all your data. This cannot be undone.</p>
        <button class="btn block" data-action="deleteaccount" style="background:#e2554f;color:#fff;border-color:#e2554f">🗑️ Delete My Account</button>
      </div>`;
  }

  openOverlay(`<h2>⚙️ Settings</h2>
    <div class="stab-row">${tabNav}</div>
    <div class="stab-body">${body}</div>`);
}

async function savePrivacySettings(){
  if(!ME) return;
  const profilePrivate=!!document.getElementById('privProfile')?.checked;
  const hideFromDiscover=!!document.getElementById('privDiscover')?.checked;
  const requireFollowApproval=!!document.getElementById('privFollowApproval')?.checked;
  const whoCanMessage=document.querySelector('input[name="whoMsg"]:checked')?.value||'all';
  const whoCanCall=document.querySelector('input[name="whoCall"]:checked')?.value||'all';
  const privacy={ profilePrivate, hideFromDiscover, requireFollowApproval, whoCanMessage, whoCanCall };
  try{
    await fbDB.collection('users').doc(ME.id).update({ privacy });
    ME.privacy=privacy;
    const d=db(); if(d.usersById[ME.id]) d.usersById[ME.id].privacy=privacy; commit(d);
    toast('Privacy settings saved ✓');
    closeOverlay();
  }catch(e){ toast('Save failed: '+(e.message||e)); }
}

// =========================================================
// PRESENCE — Online / Busy / Offline status
// =========================================================
let _presenceInterval=null;

function setMyStatus(status){
  if(!ME) return;
  const upd={status,lastSeenAt:Date.now()};
  fbDB.collection('users').doc(ME.id).update(upd).catch(()=>{});
  ME.status=status; ME.lastSeenAt=upd.lastSeenAt;
}

function initPresence(uid){
  if(_presenceInterval) clearInterval(_presenceInterval);
  setMyStatus('online');
  window.addEventListener('beforeunload',()=>setMyStatus('offline'));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden') setMyStatus('offline');
    else setMyStatus('online');
  });
  _presenceInterval=setInterval(()=>setMyStatus('online'),60000);
}

function userStatus(uid){
  const u=userById(uid); if(!u) return 'offline';
  if(u.status==='busy') return 'busy';
  if(!u.lastSeenAt||Date.now()-u.lastSeenAt>3*60*1000) return 'offline';
  return u.status||'offline';
}

function statusDot(uid){
  const s=userStatus(uid);
  const color=s==='online'?'#22c55e':s==='busy'?'#f59e0b':'#9ca3af';
  const label=s==='online'?'Online':s==='busy'?'Busy':'Offline';
  return`<span class="status-dot" style="background:${color}" title="${label}"></span>`;
}

function myBusyToggle(){
  if(!ME) return '';
  const isBusy=(ME.status||'')===`busy`;
  return`<button class="avail-btn${isBusy?' busy':''}" data-action="togglebusy">${isBusy?'🟡 Busy — tap to go Online':'🟢 Online — tap to set Busy'}</button>`;
}

function toggleBusy(){
  if(!ME) return;
  const isBusy=(ME.status||'')==='busy';
  setMyStatus(isBusy?'online':'busy');
  scheduleRender();
}

// =========================================================
// E2EE — Message encryption (AES-GCM with HKDF key)
//
// Key derived deterministically from both user IDs using HKDF-SHA256.
// No key exchange, no localStorage, no Firestore writes, no async init —
// works identically on every platform (laptop, iOS, Android, PWA).
// Both parties derive the same AES-GCM key because UIDs are sorted before
// concatenation, so derive(A,B) === derive(B,A).
// =========================================================
const _msgDecryptCache=new Map(); // cid+"|"+msgId → decrypted plaintext
const E2EE={
  _keyCache:{}, // [uid:uid] → CryptoKey, cached after first derivation
  _ready:false,

  async _convKey(otherUid){
    if(!ME?.id) return null;
    const k=[ME.id,otherUid].sort().join(':');
    if(this._keyCache[k]) return this._keyCache[k];
    try{
      const km=await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(k),
        {name:'HKDF'}, false, ['deriveKey']
      );
      const key=await crypto.subtle.deriveKey(
        {name:'HKDF',hash:'SHA-256',
         salt:new TextEncoder().encode('okmusic-e2ee-v1'),
         info:new Uint8Array()},
        km, {name:'AES-GCM',length:256}, false, ['encrypt','decrypt']
      );
      this._keyCache[k]=key;
      return key;
    }catch{return null;}
  },

  // init is now instant — key is derived on demand, nothing to set up
  async init(uid){
    if(!crypto?.subtle){ console.warn('E2EE: WebCrypto unavailable'); return; }
    this._ready=true;
    document.dispatchEvent(new CustomEvent('e2ee-ready'));
  },

  async encrypt(otherUid,text){
    if(!this._ready||!crypto?.subtle) return{text,encrypted:false};
    try{
      const key=await this._convKey(otherUid); if(!key) return{text,encrypted:false};
      const iv=crypto.getRandomValues(new Uint8Array(12));
      const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(text));
      const ivArr=new Uint8Array(iv),ctArr=new Uint8Array(ct);
      let ivB64='';for(let i=0;i<ivArr.length;i++) ivB64+=String.fromCharCode(ivArr[i]);
      let ctB64='';for(let i=0;i<ctArr.length;i++) ctB64+=String.fromCharCode(ctArr[i]);
      return{text:btoa(ivB64)+'.'+btoa(ctB64),encrypted:true};
    }catch{return{text,encrypted:false};}
  },

  async decrypt(otherUid,msg){
    if(!msg.encrypted) return msg.text;
    if(!crypto?.subtle) return null;
    try{
      const key=await this._convKey(otherUid); if(!key) return null;
      const dotIdx=(msg.text||'').indexOf('.');
      if(dotIdx<1) return '🔒 Corrupt message';
      const iv=Uint8Array.from(atob(msg.text.slice(0,dotIdx)),c=>c.charCodeAt(0));
      const ct=Uint8Array.from(atob(msg.text.slice(dotIdx+1)),c=>c.charCodeAt(0));
      const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ct);
      return new TextDecoder().decode(plain);
    }catch{
      // AES-GCM auth tag failed — message was encrypted with a different scheme (old ECDH session)
      return this._ready?'🔒 Encrypted (legacy — cannot decrypt)':null;
    }
  }
};

// =========================================================
// FOLLOW REQUESTS — Accept / Reject / Remove fan
// =========================================================
async function sendFollowRequest(targetUid){
  if(!ME) return openEmailAuth();
  const reqData={fromUid:ME.id,fromName:ME.name,toUid:targetUid,time:Date.now(),status:'pending'};
  try{
    await fbDB.collection('followRequests').add(reqData);
    notify(targetUid,'fan_request',`${ME.name} wants to be your fan`);
    toast('Follow request sent');
    scheduleRender();
  }catch(e){toast(e.message||'Could not send request');}
}

async function acceptFollowRequest(fromUid,reqId){
  if(!ME) return;
  const F=firebase.firestore.FieldValue;
  try{
    await fbDB.collection('follows').doc(fromUid).set({following:F.arrayUnion(ME.id)},{merge:true});
    await fbDB.collection('followRequests').doc(reqId).delete();
    notify(fromUid,'fan_accepted',`${ME.name} accepted your fan request 🎉`);
    WALLET.credit(ME.id,5,'new_fan',`New fan: ${userById(fromUid)?.name||fromUid}`);
    checkFanMilestone(ME.id);
    toast('Fan request accepted ✓');
    scheduleRender();
  }catch(e){toast(e.message||'Error');}
}

async function rejectFollowRequest(fromUid,reqId){
  try{
    await fbDB.collection('followRequests').doc(reqId).delete();
    toast('Request declined');
  }catch(e){toast(e.message||'Error');}
}

async function removeFan(fanUid){
  if(!ME) return;
  const F=firebase.firestore.FieldValue;
  try{
    await fbDB.collection('follows').doc(fanUid).set({following:F.arrayRemove(ME.id)},{merge:true});
    toast('Fan removed');
  }catch(e){toast(e.message||'Error');}
}

// Cancel a pending fan request that ME sent to toUid
async function cancelFanRequest(toUid){
  if(!ME) return;
  const req=(CACHE.fanRequestsSent||[]).find(r=>r.toUid===toUid&&r.status==='pending');
  if(!req) return toast('No pending request found');
  try{
    await fbDB.collection('followRequests').doc(req.id).delete();
    toast('Fan request cancelled');
    scheduleRender();
  }catch(e){toast(e.message||'Error');}
}

// ME removes themselves from pageOwner's fanbase (un-fan)
async function unfanSelf(pageOwnerUid){
  if(!ME) return;
  const F=firebase.firestore.FieldValue;
  try{
    await fbDB.collection('follows').doc(ME.id).set({following:F.arrayRemove(pageOwnerUid)},{merge:true});
    toast('You left their fanbase');
    scheduleRender();
  }catch(e){toast(e.message||'Error');}
}

// ── One-way follow system (instant, separate from fan) ──────────────────────
async function toggleUserFollow(uid){
  if(!ME) return openEmailAuth();
  const F=firebase.firestore.FieldValue;
  const has=(CACHE.userFollows[ME.id]||[]).includes(uid);
  if(has){
    await fbDB.collection('userFollows').doc(ME.id).set({list:F.arrayRemove(uid)},{merge:true})
      .then(()=>toast('Unfollowed')).catch(e=>toast(e.message||'Error'));
  } else {
    await fbDB.collection('userFollows').doc(ME.id).set({list:F.arrayUnion(uid)},{merge:true})
      .then(()=>{ toast('Following ✓'); notify(uid,'new_follow',`${ME.name} started following you`); })
      .catch(e=>toast(e.message||'Error'));
  }
}
// Unfollow alias (used from My Fans "Following" tab)
async function unfollowUser(uid){ return toggleUserFollow(uid); }




// ---------- dispatcher + event listeners → community-dispatcher.js ----------
// ---------- Firestore listeners + init → community-listeners.js ----------

// ---------- live Firestore listeners (shared data) ----------
let _rt=null;
function scheduleRender(){ clearTimeout(_rt); _rt=setTimeout(()=>{ const a=document.activeElement; if(a && /INPUT|TEXTAREA/.test(a.tagName)) return; render(); setTimeout(fetchLinkPreviews,120); }, 80); }



