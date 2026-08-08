// ============================================================
//  community-marketplace.js — Marketplace, cart, orders, seller
//  Loaded after community.js; relies on globals defined there.
// ============================================================

// ============ MARKETPLACE ============
function openMarketplace(){
  if(!ME) return openEmailAuth();
  openOverlay(`<div style="text-align:center;padding:8px 0 16px">
    <div style="font-size:40px;margin-bottom:8px">🛍️</div>
    <h2 style="margin:0 0 6px">OK Music Marketplace</h2>
    <p class="sub">Buy and sell with the OK Music community.</p>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:22px">
      <button class="btn primary block" data-action="gobuyer" style="font-size:16px;padding:14px">🛒 I want to buy</button>
      <button class="btn block" data-action="goseller" style="font-size:16px;padding:14px">🏪 I want to sell</button>
    </div>
  </div>`);
}
function goBuyer(){ closeOverlay(); go("marketplace"); }
function goSeller(){ closeOverlay(); CACHE.sellers[ME.id]?go("mystore"):openSellerSetup(); }

function _sellerFormHtml(s){
  const cur=s?.currency||'USD';
  return `
    <div class="field"><label>Store name</label><input class="fb-field" id="slName" placeholder="e.g. Emmanuel's Merch" value="${esc(s?.name||ME.name)}" /></div>
    <div class="field"><label>Location (city, country)</label><input class="fb-field" id="slLoc" placeholder="e.g. Port-au-Prince, Haiti" value="${esc(s?.location||'')}" /></div>
    <div class="field"><label>Your Payoneer email</label><input class="fb-field" id="slPayoneer" type="email" placeholder="your@payoneer.com" value="${esc(s?.payoneerEmail||'')}" /></div>
    <p class="note" style="margin-top:4px">Buyers pay the platform first. You receive <b>97%</b> of each sale via Payoneer within 1–2 business days after payment clears.</p>
    <div class="field" style="margin-top:10px"><label>Store currency 🌍</label>
      <select class="fb-field" id="slCurrency">${currencyOptions(cur)}</select>
      <p class="note" style="margin-top:4px">Prices you enter will be in this currency. Buyers always see the live USD equivalent.</p>
    </div>`;
}
function openSellerSetup(){
  openOverlay(`<h2>🏪 Open your store</h2><p class="sub">Fill in your details to start selling on OK Music.</p>
    ${_sellerFormHtml(null)}
    <button class="btn primary block" data-action="doregisterseller" style="margin-top:16px">Continue →</button>`);
}
async function doRegisterSeller(){
  const name=($("slName").value||"").trim(), location=($("slLoc").value||"").trim(), payoneerEmail=($("slPayoneer").value||"").trim();
  const currency=($("slCurrency")||{value:"USD"}).value||"USD";
  if(!name||!location) return toast("Fill in all fields");
  if(!payoneerEmail||!payoneerEmail.includes("@")) return toast("Enter a valid Payoneer email");
  try{ await fbDB.collection("sellers").doc(ME.id).set({ name, location, payoneerEmail, currency, uid:ME.id, createdAt:Date.now() });
    toast("Store created! 🎉"); closeOverlay(); go("mystore"); }
  catch(e){ toast("Couldn't create store: "+(e.code||e.message)); }
}
function openEditSellerSettings(){
  const s=CACHE.sellers[ME.id]; if(!s) return;
  openOverlay(`<h2>⚙️ Store settings</h2>${_sellerFormHtml(s)}
    <button class="btn primary block" data-action="doeditseller" style="margin-top:16px">Save settings</button>`);
}
async function doEditSeller(){
  const name=($("slName").value||"").trim(), location=($("slLoc").value||"").trim(), payoneerEmail=($("slPayoneer").value||"").trim();
  const currency=($("slCurrency")||{value:"USD"}).value||"USD";
  if(!name||!location) return toast("Fill in store name and location");
  if(!payoneerEmail||!payoneerEmail.includes("@")) return toast("Enter a valid Payoneer email");
  try{ await fbDB.collection("sellers").doc(ME.id).update({ name, location, payoneerEmail, currency });
    closeOverlay(); toast("Settings saved ✓"); }
  catch(e){ toast("Couldn't save: "+(e.code||e.message)); }
}

// ---------- seller store management ----------
function renderSellerStore(){
  const seller=CACHE.sellers[ME.id];
  if(!seller){ openSellerSetup(); return; }
  const products=CACHE.products.filter(p=>p.sellerId===ME.id);
  $("page").innerHTML=`<div class="h-title">🏪 My Store</div>
    <div class="mp-store-header">
      <div><b>${esc(seller.name)}</b> · 📍 ${esc(seller.location)}${seller.currency&&seller.currency!=='USD'?` · 💱 ${seller.currency}`:''}</div>
      <div style="display:flex;gap:6px">
        <button class="btn sm" data-action="editsellersettings" style="color:var(--muted)">⚙️ Settings</button>
        <button class="btn primary" data-action="addproduct">＋ Add product</button>
      </div>
    </div>
    ${products.length
      ?`<div class="mp-grid">${products.map(mpSellerCard).join("")}</div>`
      :'<div class="empty" style="margin-top:24px">No products yet — click "Add product" to list your first item.</div>'}`;
}
function isOutOfStock(p){ return p && p.stock != null && Number(p.stock) <= 0; }

function mpSellerCard(p){
  const photo=p.photos&&p.photos[0]; const oos=isOutOfStock(p);
  return `<div class="mp-card">
    <div class="mp-photo" style="${photo?`background-image:url('${photo}');background-size:cover;background-position:center`:'background:var(--orange-1)'}" data-action="viewproduct" data-id="${p.id}">${photo?'':'📦'}</div>
    <div class="mp-card-body">
      <div class="mp-title">${esc(p.title)}</div>
      <div class="mp-price">${fmtCurrency(p.price,p.currency)} <span class="mp-ship">+ ${fmtCurrency(p.shipping||0,p.currency)} ship</span></div>
      ${p.stock!=null?`<div class="mp-stock-info${oos?' oos':''}">📦 ${oos?'Out of stock':`${p.stock} in stock`}</div>`:''}
      ${(()=>{const now=Date.now();const active=p.promoted&&p.promotedUntil>now;const rem=active?Math.ceil((p.promotedUntil-now)/86400000):0;return active?`<div class="promo-active-badge" style="margin-top:6px">🚀 Sponsored · ${rem}d left</div>`:'';})()}
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <button class="btn sm" data-action="editproduct" data-id="${p.id}">Edit</button>
        <button class="btn sm" data-action="promotelisting" data-id="${p.id}" style="color:var(--orange);border-color:var(--orange)">🚀 Promote</button>
        <button class="btn sm" data-action="delproduct" data-id="${p.id}" style="color:#e2554f;border-color:#f0b3b3">Delete</button>
      </div>
    </div>
  </div>`;
}

function openProductForm(productId){
  const p=productId?CACHE.products.find(x=>x.id===productId):null;
  window._mpPhoto=p?.photos?.[0]||null;
  window._mpPhotoFile=null;
  const prevStyle=window._mpPhoto?`background-image:url('${window._mpPhoto}');background-size:cover;background-position:center`:'background:var(--orange-1)';
  // Build seller category dropdown: canonical + previously-used custom categories + "Other" (new)
  const existingCat=p?.category||'Other';
  const catInMP=MP_CATEGORIES.includes(existingCat);
  const customRegistry=(CACHE.customCategories||[]).filter(c=>!MP_CATEGORIES.includes(c));
  const catInCustom=customRegistry.includes(existingCat);
  const selectVal=(catInMP||catInCustom)?existingCat:'Other';
  const customVal=(catInMP||catInCustom)?'':existingCat;
  const allSellerCats=[...MP_CATEGORIES.filter(c=>c!=='Other'),...customRegistry,'Other'];
  const noLoc=p?p.location==null:false;
  openOverlay(`<h2>${p?'Edit product':'Add a product'}</h2>
    <div class="field"><label>Title</label><input class="fb-field" id="prodTitle" placeholder="e.g. OK Music hoodie" value="${esc(p?.title||'')}" /></div>
    <div class="field"><label>Description</label><textarea class="fb-field" id="prodDesc" placeholder="Describe your product — material, size, condition…" style="min-height:90px">${esc(p?.description||'')}</textarea></div>
    <div class="field"><label>Category</label>
      <select class="fb-field" id="prodCat">${allSellerCats.map(c=>`<option value="${esc(c)}" ${selectVal===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
      <div id="prodCatCustomRow" style="margin-top:8px;display:${selectVal==='Other'?'block':'none'}">
        <label style="font-size:12px;color:var(--muted);margin-bottom:4px;display:block">Name your category — any language welcome 🌍</label>
        <input class="fb-field" id="prodCatOther" placeholder="e.g. Vêtements, 전자기기, Artesanía, ملابس…" value="${esc(customVal)}" maxlength="60" />
      </div>
    </div>
    <div class="field"><label>Location <span style="font-weight:400;color:var(--muted)">(city, country)</span></label>
      <input class="fb-field" id="prodLocation" placeholder="e.g. Paris, France" value="${esc(p?.location||'')}" ${noLoc?'disabled':''} />
      <label style="display:flex;align-items:center;gap:8px;margin-top:6px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="prodNoLoc" ${noLoc?'checked':''}> No location / Digital product
      </label>
    </div>
    <div class="field"><label>Currency 🌍</label>
      <select class="fb-field" id="prodCurrency">${currencyOptions(p?.currency||CACHE.sellers[ME.id]?.currency||'USD')}</select>
      <p class="note" style="margin-top:4px">Buyers will see the live USD equivalent next to your price.</p>
    </div>
    <div class="field"><label>Price</label><input class="fb-field" id="prodPrice" type="number" min="0.01" step="0.01" placeholder="0.00" value="${p?.price||''}" /></div>
    <div class="field"><label>Shipping cost</label><input class="fb-field" id="prodShip" type="number" min="0" step="0.01" placeholder="0.00" value="${p?.shipping||''}" /></div>
    <div class="field"><label>🦁 LionCoin price <span style="font-weight:400;color:var(--muted)">(optional — 2 decimal places supported, e.g. 12.50)</span></label><input class="fb-field" id="prodLnc" type="number" min="0.01" step="0.01" placeholder="e.g. 12.50" value="${p?.lncPrice||''}" /></div>
    <div class="field"><label>Stock quantity <span style="font-weight:400;color:var(--muted)">(optional — leave blank for unlimited)</span></label><input class="fb-field" id="prodStock" type="number" min="0" step="1" placeholder="e.g. 10" value="${p?.stock!=null?p.stock:''}" /></div>
    <div class="field"><label>Product photo</label>
      <div class="covup"><div class="covprev" id="prodPhotoPrev" style="${prevStyle}">${window._mpPhoto?'':'📦'}</div>
        <div><input type="file" id="prodPhotoFile" accept="image/*,.heic,.heif,.avif,.webp,.tiff,.bmp,.svg" /><div class="note" style="margin-top:4px">All photo formats supported (JPG, PNG, WEBP, HEIC, RAW…)</div></div></div></div>
    <button class="btn primary block" data-action="dosaveproduct" data-id="${productId||''}" style="margin-top:16px">${p?'Save changes':'List product'}</button>`);
  setTimeout(()=>{
    const sel=$('prodCat'); const row=$('prodCatCustomRow'); const locInp=$('prodLocation'); const noLocChk=$('prodNoLoc');
    if(sel&&row) sel.onchange=()=>{ row.style.display=sel.value==='Other'?'block':'none'; };
    if(noLocChk&&locInp) noLocChk.onchange=()=>{ locInp.disabled=noLocChk.checked; if(noLocChk.checked) locInp.value=''; };
    const photoFile=$('prodPhotoFile'); const photoPrev=$('prodPhotoPrev');
    if(photoFile&&photoPrev) photoFile.onchange=e=>{
      const f=e.target.files?.[0]; if(!f) return;
      window._mpPhotoFile=f;
      const url=URL.createObjectURL(f);
      photoPrev.style.cssText=`background-image:url('${url}');background-size:cover;background-position:center`;
      photoPrev.textContent='';
    };
  },0);
}
async function doSaveProduct(productId){
  const title=($("prodTitle").value||"").trim(), description=($("prodDesc").value||"").trim();
  const price=parseFloat(($("prodPrice")||{value:""}).value), shipping=parseFloat(($("prodShip")||{value:"0"}).value||"0")||0;
  // Category: "Other" + custom text → use custom text (trimmed, normalised)
  const catSel=($("prodCat")||{value:"Other"}).value||"Other";
  let category=catSel;
  if(catSel==="Other"){
    const custom=(($("prodCatOther")||{value:""}).value||"").trim();
    if(!custom) return toast("Please name your product category — any language is welcome. Your buyers need to know what you're selling!");
    category=custom;
  }
  // Location
  const noLoc=!!$("prodNoLoc")?.checked;
  const locationRaw=(($("prodLocation")||{value:""}).value||"").trim();
  const location=noLoc?null:(locationRaw||null);
  if(!title||!description) return toast("Fill in title and description");
  if(!price||price<=0) return toast("Enter a valid price");
  const saveBtn=document.querySelector('[data-action="dosaveproduct"]');
  let photos=window._mpPhoto?[window._mpPhoto]:[];
  if(window._mpPhotoFile){
    try{
      if(saveBtn){saveBtn.disabled=true;saveBtn.textContent="Uploading photo…";}
      photos=[await uploadMediaToCloudinary(window._mpPhotoFile)];
    }catch(e){
      if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=productId?'Save changes':'List product';}
      return toast("Photo upload failed: "+(e.message||e));
    }
  }
  const lncRaw=parseFloat(($("prodLnc")||{value:""}).value)||0;
  const lncPrice=lncRaw>=0.01?+lncRaw.toFixed(2):null;
  const stockRaw=parseInt(($("prodStock")||{value:""}).value);
  const stock=(!isNaN(stockRaw)&&stockRaw>=0)?stockRaw:null;
  const currency=($("prodCurrency")||{value:"USD"}).value||"USD";
  const fxRate=(CACHE.fxRates||{})[currency]||null;
  const priceUSD=!currency||currency==='USD'?price:(fxRate?+(price/fxRate).toFixed(2):null);
  const shippingUSD=!currency||currency==='USD'?shipping:(fxRate?+(shipping/fxRate).toFixed(2):null);
  const data={ sellerId:ME.id, title, description, category, location, currency, price, priceUSD, shipping, shippingUSD, photos, lncPrice:lncPrice??null, stock:stock!==null?stock:null, updatedAt:Date.now() };
  // Register any custom category in the persistent registry so buyers can filter by it
  if(!MP_CATEGORIES.includes(category)){
    fbDB.collection("platform").doc("categories")
      .set({ [category]:{ addedAt:Date.now(), addedBy:ME.id } },{ merge:true })
      .catch(()=>{});
  }
  try{
    if(productId){ await fbDB.collection("products").doc(productId).update(data); closeOverlay(); toast("Product updated ✓"); }
    else{
      data.createdAt=Date.now();
      await fbDB.collection("products").add(data);
      closeOverlay(); toast("Product listed! 🎉");
      // Notify fans + followers about new marketplace item
      const fans=followersOf(ME.id).filter(uid=>!String(uid).startsWith("u_"));
      const followersArr=followersOfUser(ME.id).filter(uid=>!String(uid).startsWith("u_"));
      [...new Set([...fans,...followersArr])].forEach(uid=>{
        fbDB.collection("notifications").add({ forUid:uid, type:"new_product", fromUid:ME.id, fromName:ME.name, text:`🛍️ ${ME.name} listed a new product: ${data.title}`, time:Date.now(), read:false }).catch(()=>{});
      });
    }
    go("mystore");
  } catch(e){
    if(saveBtn){saveBtn.disabled=false;saveBtn.textContent=productId?'Save changes':'List product';}
    toast("Couldn't save: "+(e.code||e.message));
  }
}
function deleteProduct(id){
  openOverlay(`<h2>🗑️ Delete product?</h2>
    <p style="margin:10px 0 22px;color:var(--muted);line-height:1.5">This will permanently remove the listing. This cannot be undone.</p>
    <div style="display:flex;gap:10px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn block" data-action="confirmdelprod" data-id="${id}" style="color:#c0392b;border-color:#f5c6c6">Yes, delete</button>
    </div>`);
}
function doDeleteProduct(id){ fbDB.collection("products").doc(id).delete().then(()=>{ closeOverlay(); toast("Product deleted"); go("mystore"); }).catch(e=>toast(e.code||e.message)); }

// ---------- promoted listings ----------
function openPromoDialog(productId){
  if(!ME) return openEmailAuth();
  const p=CACHE.products.find(x=>x.id===productId); if(!p) return;
  const bal=parseFloat(CACHE.wallet?.balance||0);
  const now=Date.now();
  const isActive=p.promoted&&p.promotedUntil>now;
  const remaining=isActive?Math.ceil((p.promotedUntil-now)/86400000):0;
  openOverlay(`<h2>🚀 Promote listing</h2>
    <p class="sub" style="margin-bottom:10px">"${esc(p.title)}"</p>
    ${isActive?`<div class="promo-active-badge">✅ Active — ${remaining} day${remaining!==1?'s':''} left (new purchase extends this)</div>`:''}
    <p style="font-size:13px;color:var(--muted);margin-bottom:14px">Promoted products appear <b>first</b> in the marketplace with a Sponsored badge. Deducted from your LionCoin wallet.<br>Balance: <b>🦁 ${fmtLNC(bal)} LNC</b></p>
    <div class="promo-plans">
      ${PROMO_PLANS.map(plan=>{
        const canAfford=bal>=plan.lnc;
        return `<div class="promo-plan-card${canAfford?'':' promo-disabled'}" ${canAfford?`data-action="confirmpromo" data-id="${productId}" data-days="${plan.days}" data-cost="${plan.lnc}"`:''}>
          <div class="promo-plan-days">${plan.label}</div>
          <div class="promo-plan-price">🦁 ${plan.lnc} LNC</div>
          ${!canAfford?`<div class="promo-plan-note">Need ${fmtLNC(plan.lnc-bal)} more</div>`:''}
        </div>`;
      }).join('')}
    </div>
    <button class="btn block" data-action="close" style="margin-top:14px">Cancel</button>`);
}
async function confirmPromo(productId, days, cost){
  const p=CACHE.products.find(x=>x.id===productId); if(!p) return;
  const gross=parseFloat(cost);
  const bal=parseFloat(CACHE.wallet?.balance||0);
  if(bal<gross) return toast(`Not enough LionCoins — need ${fmtLNC(gross)} LNC, you have ${fmtLNC(bal)}`);
  const now=Date.now();
  const base=p.promoted&&p.promotedUntil>now?p.promotedUntil:now;
  const promotedUntil=base+days*24*60*60*1000;
  try{
    const batch=fbDB.batch();
    const walletRef=fbDB.collection('wallets').doc(ME.id);
    batch.update(walletRef,{
      balance:firebase.firestore.FieldValue.increment(-gross),
      totalSpent:firebase.firestore.FieldValue.increment(gross)
    });
    batch.set(walletRef.collection('transactions').doc(),{
      type:'promotion',dir:'out',amount:gross,
      productId,productTitle:p.title,days:parseInt(days),
      note:`Promoted listing for ${days} days`,createdAt:now
    });
    batch.update(fbDB.collection('products').doc(productId),{promoted:true,promotedUntil});
    await batch.commit();
    closeOverlay();
    toast(`🚀 "${p.title}" promoted for ${days} days!`);
  }catch(e){ toast('Promotion failed: '+(e.code||e.message)); }
}

// ---------- buyer browse ----------
// _mpResults holds the current server-query result set; null = use CACHE.products
let _mpResults=null;
let _mpLoading=false;

async function runMpQuery(){
  const cat=state.mpCat||'';
  const sort=state.mpSort||'newest';
  // Only fire a Firestore query when a non-default filter is active
  if(!cat&&sort==='newest'){ _mpResults=null; renderMarketplace(); return; }
  _mpLoading=true; renderMarketplace();
  try{
    let q=fbDB.collection('products');
    if(cat) q=q.where('category','==',cat);
    if(sort==='priceAsc')  q=q.orderBy('price','asc');
    else if(sort==='priceDesc') q=q.orderBy('price','desc');
    else q=q.orderBy('createdAt','desc');
    q=q.limit(120);
    const snap=await q.get();
    _mpResults=snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){ console.warn('mpQuery',e.code,e.message); _mpResults=null; }
  _mpLoading=false; renderMarketplace();
}

function renderMarketplace(){
  const cartCount=(state.cart||[]).length;
  const q=(state.mpSearch||'').toLowerCase();
  const minP=parseFloat(state.mpMinPrice)||0;
  const maxP=parseFloat(state.mpMaxPrice)||Infinity;
  const locF=state.mpLocFilter||'';
  const activeCat=state.mpCat||'';
  const activeSort=state.mpSort||'newest';

  // Base list: server-query result or full CACHE
  let list=(_mpResults||CACHE.products).slice();

  // Client-side secondary filters — category applied here too so old products
  // without the field are still correctly filtered when the server query falls back
  if(activeCat) list=list.filter(p=>(p.category||'')=== activeCat);
  if(minP>0) list=list.filter(p=>productPriceUSD(p)>=minP);
  if(maxP<Infinity) list=list.filter(p=>productPriceUSD(p)<=maxP);
  if(locF) list=list.filter(p=>p.location===locF);
  if(q) list=list.filter(p=>
    (p.title||'').toLowerCase().includes(q)||
    (p.description||'').toLowerCase().includes(q)||
    (CACHE.sellers[p.sellerId]?.name||'').toLowerCase().includes(q)
  );

  // Float active promoted products to the top; within each group respect the sort order
  const _now=Date.now();
  const _promoted=list.filter(p=>p.promoted&&p.promotedUntil>_now);
  const _regular=list.filter(p=>!p.promoted||p.promotedUntil<=_now);
  list=[..._promoted,..._regular];

  // Unique locations for the location dropdown (from CACHE so it's always fresh)
  const allLocs=[...new Set(CACHE.products.map(p=>p.location).filter(Boolean))].sort();
  // Merge canonical categories (minus "Other") + every custom category ever registered
  const _customCats=[...new Set([
    ...(CACHE.customCategories||[]),
    ...(CACHE.products||[]).map(p=>p.category).filter(c=>c&&!MP_CATEGORIES.includes(c))
  ])].sort((a,b)=>a.localeCompare(b));
  const allCats=[...MP_CATEGORIES.filter(c=>c!=='Other'),..._customCats];
  const hasFilter=activeCat||activeSort!=='newest'||locF||minP>0||maxP<Infinity||q;

  $("page").innerHTML=`<div class="h-title">🛍️ Marketplace</div>
    <div class="mp-filter-bar">
      <input class="fb-field mp-search-inp" id="mpSearch" placeholder="Search products or vendor name…" value="${esc(state.mpSearch||'')}" />
      <select class="fb-field mp-filter-sel" id="mpCatSel">
        <option value="">All categories</option>
        ${allCats.map(c=>`<option value="${esc(c)}" ${activeCat===c?'selected':''}>${esc(c)}</option>`).join('')}
      </select>
      <select class="fb-field mp-filter-sel" id="mpSortSel">
        <option value="newest" ${activeSort==='newest'?'selected':''}>Newest</option>
        <option value="priceAsc" ${activeSort==='priceAsc'?'selected':''}>Price ↑</option>
        <option value="priceDesc" ${activeSort==='priceDesc'?'selected':''}>Price ↓</option>
      </select>
      ${allLocs.length?`<select class="fb-field mp-filter-sel" id="mpLocSel">
        <option value="">All locations</option>
        ${allLocs.map(l=>`<option value="${esc(l)}" ${locF===l?'selected':''}>${esc(l)}</option>`).join('')}
      </select>`:''}
      <div class="mp-price-range">
        <input class="fb-field" id="mpMinP" type="number" min="0" step="0.01" placeholder="Min USD" value="${state.mpMinPrice||''}" style="width:80px" />
        <span style="color:var(--muted);flex-shrink:0">–</span>
        <input class="fb-field" id="mpMaxP" type="number" min="0" step="0.01" placeholder="Max USD" value="${state.mpMaxPrice||''}" style="width:80px" />
      </div>
      ${hasFilter?`<button class="btn sm" data-action="clearmpfilters" style="white-space:nowrap;flex-shrink:0">✕ Clear</button>`:''}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px;justify-content:flex-end">
      <button class="btn ${cartCount?'primary':''}" data-action="nav" data-view="cart">🛒 Cart${cartCount?` (${cartCount})`:''}</button>
      <button class="btn" data-action="gosellerdirect">🏪 Sell</button>
    </div>
    ${_mpLoading
      ?'<div class="empty">Loading…</div>'
      :list.length
        ?`<div class="mp-grid">${list.map(mpBuyerCard).join('')}</div>`
        :'<div class="empty">No products match your filters.</div>'}`;

  setTimeout(()=>{
    const s=$('mpSearch'); if(s) s.oninput=e=>{ state.mpSearch=e.target.value; renderMarketplace(); };
    const catSel=$('mpCatSel'); if(catSel) catSel.onchange=()=>{ state.mpCat=catSel.value; runMpQuery(); };
    const sortSel=$('mpSortSel'); if(sortSel) sortSel.onchange=()=>{ state.mpSort=sortSel.value; runMpQuery(); };
    const locSel=$('mpLocSel'); if(locSel) locSel.onchange=()=>{ state.mpLocFilter=locSel.value; renderMarketplace(); };
    const minInp=$('mpMinP'); if(minInp) minInp.onchange=()=>{ state.mpMinPrice=minInp.value; renderMarketplace(); };
    const maxInp=$('mpMaxP'); if(maxInp) maxInp.onchange=()=>{ state.mpMaxPrice=maxInp.value; renderMarketplace(); };
  },0);
}
function clearMpFilters(){
  state.mpCat=''; state.mpSort='newest'; state.mpLocFilter='';
  state.mpMinPrice=''; state.mpMaxPrice=''; state.mpSearch='';
  _mpResults=null; renderMarketplace();
}
function mpBuyerCard(p){
  const photo=p.photos&&p.photos[0]; const seller=CACHE.sellers[p.sellerId]; const inCart=(state.cart||[]).includes(p.id); const oos=isOutOfStock(p);
  const isPrintify=p.source==='printify';
  const isOwn=ME&&ME.id===p.sellerId;
  const locBadge=p.location?`<span class="mp-loc-badge">📍 ${esc(p.location)}</span>`:'';
  const catBadge=p.category?`<span class="mp-cat-badge">${esc(p.category)}</span>`:'';
  const isSponsored=p.promoted&&p.promotedUntil>Date.now();
  return `<div class="mp-card${isSponsored?' mp-card-sponsored':''}">
    <div class="mp-photo" style="${photo?`background-image:url('${photo}');background-size:cover;background-position:center`:'background:var(--orange-1)'}" data-action="viewproduct" data-id="${p.id}">${photo?'':'📦'}${isPrintify?'<span class="printify-badge">🖨️ Print-on-demand</span>':''}${isSponsored?'<span class="mp-sponsored-overlay">Sponsored</span>':''}${isOwn?'<span class="mp-own-badge">Your listing</span>':''}</div>
    <div class="mp-card-body">
      ${catBadge}
      <div class="mp-title" data-action="viewproduct" data-id="${p.id}">${esc(p.title)}</div>
      <div class="mp-seller-name">
        ${isOwn
          ?`<b>${esc(seller?.name||'You')}</b> ${locBadge}`
          :`<span class="mp-seller-link" data-action="contactseller" data-uid="${p.sellerId}" data-productid="${p.id}">${esc(seller?.name||'Seller')}</span> ${locBadge}`}
      </div>
      ${p.price>0?(()=>{const eq=usdEquiv(p.price,p.currency);return`<div class="mp-price">${fmtCurrency(p.price,p.currency)}${p.shipping>0?`<span class="mp-ship"> + ${fmtCurrency(p.shipping,p.currency)} ship</span>`:''}</div>${eq?`<div class="mp-usd-equiv">${eq}</div>`:''}`})():''}
      ${isPrintify
        ?`<button class="btn sm primary" data-action="printifycheckout" data-id="${p.id}" style="margin-top:8px;width:100%">🛒 Buy Now</button>`
        :oos
          ?'<div class="mp-oos-badge">📦 Out of Stock</div>'
          :`<button class="btn sm ${inCart?'':'primary'}" data-action="addtocart" data-id="${p.id}" style="margin-top:8px;width:100%">${inCart?'In cart ✓':'Add to cart'}</button>
      ${p.lncPrice?`<button class="btn sm" data-action="buywithlioncoin" data-id="${p.id}" style="margin-top:4px;width:100%">🦁 Buy with LNC (${fmtLNC(p.lncPrice)} LNC)</button>`:''}`}
    </div>
  </div>`;
}
function viewProduct(id){
  const p=CACHE.products.find(x=>x.id===id); if(!p) return;
  const seller=CACHE.sellers[p.sellerId]; const photo=p.photos&&p.photos[0]; const inCart=(state.cart||[]).includes(id); const oos=isOutOfStock(p);
  const isPrintify=p.source==='printify';
  const ship=parseFloat(p.shipping||0);
  const total=parseFloat(p.price||0)+ship;
  const _pEq=usdEquiv(p.price,p.currency); const _sEq=usdEquiv(ship,p.currency); const _tEq=usdEquiv(total,p.currency);
  const priceBreakdown=ship>0
    ?`<div class="mp-price-breakdown">
        <span>Product: <b>${fmtCurrency(p.price,p.currency)}</b>${_pEq?` <span class="mp-usd-equiv-inline">${_pEq}</span>`:''}</span>
        <span>Shipping: <b>${fmtCurrency(ship,p.currency)}</b>${_sEq?` <span class="mp-usd-equiv-inline">${_sEq}</span>`:''}</span>
        <span class="mp-price-total">Total: <b>${fmtCurrency(total,p.currency)}</b>${_tEq?` <span class="mp-usd-equiv-inline">${_tEq}</span>`:''}</span>
      </div>`
    :`<div class="mp-detail-price">${fmtCurrency(p.price,p.currency)}${_pEq?`<div class="mp-usd-equiv" style="margin-top:2px">${_pEq}</div>`:''}</div>`;
  const locLine=p.location?`📍 ${esc(p.location)} · `:'';
  openOverlay(`<div class="mp-detail">
    ${photo?`<div style="text-align:center;margin-bottom:12px"><img src="${photo}" class="mp-detail-img" data-action="zoomphoto" data-src="${photo}" /></div>`:''}
    ${isPrintify?'<div class="printify-detail-badge">🖨️ Print-on-demand · Fulfilled by Printify</div>':''}
    <div class="mp-detail-title">${esc(p.title)}</div>
    <div class="mp-detail-cat">${esc(p.category||'')}</div>
    ${p.price>0?priceBreakdown:''}
    <div class="mp-detail-desc">${esc(p.description)}</div>
    <div class="mp-seller-card">
      👤 ${ME&&ME.id===p.sellerId
        ?`<b>${esc(seller?.name||'You')}</b> <span style="font-size:11px;background:#e74c3c;color:#fff;border-radius:10px;padding:1px 7px;margin-left:4px">Your listing</span>`
        :`<span class="mp-seller-link" data-action="contactseller" data-uid="${p.sellerId}" data-productid="${id}"><b>${esc(seller?.name||'Unknown')}</b></span>
      · ${locLine}
      <span style="font-size:12px;color:var(--muted)">Tap name to message or call seller</span>`}
    </div>
    ${isPrintify
      ?`<button class="btn primary block" data-action="printifycheckout" data-id="${id}" style="margin-top:14px">🛒 Buy Now</button>
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
      <button class="btn block" data-action="reserveproduct" data-id="${id}" style="width:100%">📦 Reserve — Pickup or Delivery</button>
    </div>`
      :oos
        ?'<div class="mp-oos-badge" style="margin-top:14px;font-size:14px;padding:10px">📦 Out of Stock</div>'
        :`<button class="btn ${inCart?'':'primary'} block" data-action="addtocart" data-id="${id}" style="margin-top:14px">${inCart?'✓ In cart — remove':'🛒 Add to cart'}</button>
    ${inCart?`<button class="btn primary block" data-action="nav" data-view="cart" style="margin-top:8px">Go to cart →</button>`:''}
    ${p.lncPrice?`<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
      <div class="lnc-badge" style="margin-bottom:8px">🦁 ${fmtLNC(p.lncPrice)} LNC${ship>0?` + shipping`:''}</div>
      <button class="btn block" data-action="buywithlioncoin" data-id="${id}" style="margin-top:4px">🦁 Buy with LionCoin</button>
    </div>`:''}
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
      <button class="btn block" data-action="reserveproduct" data-id="${id}" style="width:100%">📦 Reserve — Pickup or Delivery</button>
    </div>`}
  </div>`);
}

function contactSeller(sellerUid, productId){
  if(!ME) return openEmailAuth();
  if(sellerUid===ME.id) return toast("That's your own product.");
  const p=CACHE.products.find(x=>x.id===productId);
  closeOverlay();
  state.chatUid=sellerUid; state.view='chat'; renderApp();
  if(p){
    setTimeout(()=>{
      const inp=$('chatInput');
      if(inp&&!inp.value) inp.value=`Hi, I'm interested in your product: "${p.title}"`;
    },300);
  }
}

function openReserveDialog(productId){
  if(!ME) return openEmailAuth();
  const p=CACHE.products.find(x=>x.id===productId); if(!p) return;
  const isSelfTest=p.sellerId===ME.id;
  openOverlay(`<div style="padding:4px">
    <h2>📦 Reserve this product</h2>
    <p class="sub" style="margin:4px 0 ${isSelfTest?'8px':'16px'}">${esc(p.title)}</p>
    ${isSelfTest?'<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:12px">🧪 <b>Test mode</b> — you are buying your own listing</div>':''}
    <div class="field">
      <label>Quantity</label>
      <input class="fb-field" id="resQty" type="number" min="1" step="1" value="1" style="width:90px" />
    </div>
    <div class="field">
      <label>How would you like to receive it?</label>
      <div class="fee-calc-bar" style="margin-top:8px">
        <button class="fee-dir-btn active" data-method="pickup">🚶 Pickup in store</button>
        <button class="fee-dir-btn" data-method="delivery">🚚 Delivery</button>
      </div>
    </div>
    <div id="resPickupFields">
      <div class="field">
        <label>Preferred pickup date</label>
        <input class="fb-field" id="resPickupDate" type="date" />
      </div>
      <div class="field">
        <label>Preferred time <span style="font-weight:400;color:var(--muted)">(leave blank if flexible)</span></label>
        <input class="fb-field" id="resPickupTime" type="time" />
      </div>
    </div>
    <div id="resDeliveryFields" style="display:none">
      <div class="field">
        <label>Delivery address</label>
        <textarea class="fb-field" id="resAddress" rows="2" placeholder="Full address including city and country…" style="min-height:70px"></textarea>
      </div>
      <div class="field">
        <label>Preferred delivery date</label>
        <input class="fb-field" id="resDelivDate" type="date" />
      </div>
      <div class="field">
        <label>Preferred time <span style="font-weight:400;color:var(--muted)">(leave blank for anytime)</span></label>
        <input class="fb-field" id="resDelivTime" type="time" />
      </div>
    </div>
    <div class="field" style="margin-top:4px">
      <label>Note to seller <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
      <input class="fb-field" id="resNote" placeholder="Special instructions, questions…" maxlength="200" />
    </div>
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn block" data-action="close">Cancel</button>
      <button class="btn primary block" id="resSubmitBtn" data-action="submitreservation" data-id="${productId}">Send reservation 📨</button>
    </div>
  </div>`);
  setTimeout(()=>{
    const btns=document.querySelectorAll('.fee-dir-btn');
    const pickupF=$('resPickupFields'); const delivF=$('resDeliveryFields');
    btns.forEach(b=>b.onclick=()=>{
      btns.forEach(x=>x.classList.remove('active')); b.classList.add('active');
      const isDel=b.dataset.method==='delivery';
      if(pickupF) pickupF.style.display=isDel?'none':'block';
      if(delivF)  delivF.style.display=isDel?'block':'none';
    });
  },0);
}

async function submitReservation(productId){
  if(!ME) return openEmailAuth();
  const p=CACHE.products.find(x=>x.id===productId); if(!p) return;
  const qty=Math.max(1,parseInt($('resQty')?.value||'1')||1);
  const activeBtn=document.querySelector('.fee-dir-btn.active');
  const method=activeBtn?.dataset.method||'pickup';
  let pickupDate='',pickupTime='',deliveryAddress='',deliveryDate='',deliveryTime='';
  if(method==='pickup'){
    pickupDate=($('resPickupDate')?.value||'').trim();
    pickupTime=($('resPickupTime')?.value||'').trim();
    if(!pickupDate) return toast('Please select your preferred pickup date.');
  } else {
    deliveryAddress=($('resAddress')?.value||'').trim();
    deliveryDate=($('resDelivDate')?.value||'').trim();
    deliveryTime=($('resDelivTime')?.value||'').trim();
    if(!deliveryAddress) return toast('Please enter a delivery address.');
    if(!deliveryDate) return toast('Please select a preferred delivery date.');
  }
  const note=($('resNote')?.value||'').trim();
  const btn=$('resSubmitBtn');
  if(btn){btn.disabled=true;btn.textContent='Sending…';}
  try{
    await fbDB.collection('reservations').add({
      productId, productTitle:p.title, sellerId:p.sellerId,
      buyerId:ME.id, buyerName:ME.name, quantity:qty, method,
      pickupDate:pickupDate||null, pickupTime:pickupTime||null,
      deliveryAddress:deliveryAddress||null, deliveryDate:deliveryDate||null,
      deliveryTime:deliveryTime||null, note:note||null,
      status:'pending', createdAt:Date.now()
    });
    let summary=`Hi! I'd like to reserve your product: "${p.title}" — qty: ${qty}.\n`;
    if(method==='pickup'){
      summary+=`📍 Pickup on ${pickupDate}${pickupTime?' at '+pickupTime:' (flexible time)'}.`;
    } else {
      summary+=`🚚 Delivery to: ${deliveryAddress}\nDate: ${deliveryDate}${deliveryTime?' at '+deliveryTime:' — anytime'}.`;
    }
    if(note) summary+=`\n💬 ${note}`;
    notify(p.sellerId,'reservation',`📦 ${ME.name} wants to reserve "${p.title}" (${method==='pickup'?'pickup':'delivery'})`);
    closeOverlay();
    if(p.sellerId===ME.id){
      toast('🧪 Test reservation saved! (Seller = you, so no chat opened.)');
    } else {
      state.chatUid=p.sellerId; state.view='chat'; renderApp();
      setTimeout(()=>{ const inp=$('chatInput'); if(inp&&!inp.value) inp.value=summary; },300);
      toast('Reservation sent! Continue in chat with the seller 💬');
    }
  }catch(e){
    console.warn('submitReservation',e);
    if(btn){btn.disabled=false;btn.textContent='Send reservation 📨';}
    toast('Could not send reservation — please try again.');
  }
}
function zoomPhoto(src){
  openOverlay(`<div style="text-align:center"><img src="${src}" style="max-width:100%;max-height:75vh;border-radius:8px;object-fit:contain" /></div>`);
}

// ---------- Printify checkout ----------
function openPrintifyCheckout(productId){
  if(!ME) return openEmailAuth();
  const p=CACHE.products.find(x=>x.id===productId); if(!p) return toast('Product not found');
  const variants=(p.variants||[]).filter(v=>v.id);
  if(!variants.length){
    openOverlay(`<div style="text-align:center;padding:16px">
      <div style="font-size:40px;margin-bottom:12px">⚠️</div>
      <h2>Item temporarily unavailable</h2>
      <p class="sub" style="margin:10px 0 18px">This product's options haven't been set up yet. You can reserve it and the seller will contact you to complete the purchase.</p>
      <button class="btn primary block" data-action="reserveproduct" data-id="${productId}" style="margin-bottom:8px">📦 Reserve — Pickup or Delivery</button>
      <button class="btn block" data-action="close">Close</button>
    </div>`);
    return;
  }
  const photo=p.photos&&p.photos[0];
  const firstVariant=variants[0];
  const defaultPrice=parseFloat(firstVariant?.price||p.price||0).toFixed(2);

  openOverlay(`<div class="printify-checkout">
    <div style="display:flex;gap:12px;margin-bottom:16px;align-items:flex-start">
      ${photo?`<img src="${photo}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;flex-shrink:0" />`
             :'<div style="width:72px;height:72px;background:var(--orange-1);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:28px">📦</div>'}
      <div style="flex:1;min-width:0">
        <div class="printify-detail-badge" style="margin-bottom:6px">🖨️ Print-on-demand</div>
        <div style="font-weight:700;font-size:15px;line-height:1.3">${esc(p.title)}</div>
        <div id="pCheckoutPrice" style="font-size:20px;font-weight:800;color:var(--orange);margin-top:4px">$${defaultPrice}</div>
      </div>
    </div>

    ${variants.length>1
      ?`<div class="field" style="margin-bottom:12px">
          <label style="font-size:13px;font-weight:600">Option</label>
          <select class="fb-field" id="pVariantSelect" style="font-size:14px">
            ${variants.map(v=>`<option value="${esc(String(v.id))}" data-price="${parseFloat(v.price||0).toFixed(2)}">${esc(v.label||v.id)}</option>`).join('')}
          </select>
        </div>`
      :variants.length===1
        ?`<div style="background:var(--card);border-radius:10px;padding:9px 12px;margin-bottom:12px;font-size:13px;color:var(--muted)">Option: <b style="color:var(--fg)">${esc(variants[0].label||'Standard')}</b></div>`
        :''}

    <div class="printify-checkout-section">📦 Shipping address</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div class="field"><label style="font-size:12px">First name *</label><input class="fb-field" id="pShipFname" placeholder="Jane" /></div>
      <div class="field"><label style="font-size:12px">Last name *</label><input class="fb-field" id="pShipLname" placeholder="Doe" /></div>
    </div>
    <div class="field" style="margin-bottom:8px"><label style="font-size:12px">Email *</label><input class="fb-field" id="pShipEmail" type="email" placeholder="jane@example.com" value="${esc(fbAuth.currentUser?.email||'')}" /></div>
    <div class="field" style="margin-bottom:8px"><label style="font-size:12px">Street address *</label><input class="fb-field" id="pShipAddr1" placeholder="123 Main Street" /></div>
    <div class="field" style="margin-bottom:8px"><label style="font-size:12px">Apt / Suite / Floor (optional)</label><input class="fb-field" id="pShipAddr2" placeholder="Apt 4B" /></div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:8px">
      <div class="field"><label style="font-size:12px">City *</label><input class="fb-field" id="pShipCity" placeholder="New York" /></div>
      <div class="field"><label style="font-size:12px">ZIP / Postal *</label><input class="fb-field" id="pShipZip" placeholder="10001" /></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
      <div class="field"><label style="font-size:12px">State / Region</label><input class="fb-field" id="pShipRegion" placeholder="NY" /></div>
      <div class="field"><label style="font-size:12px">Country code *</label><input class="fb-field" id="pShipCountry" placeholder="US" maxlength="2" /></div>
    </div>
    <div class="field" style="margin-bottom:14px"><label style="font-size:12px">Phone (optional)</label><input class="fb-field" id="pShipPhone" placeholder="+1 555 000 0000" /></div>

    <div class="printify-payment-note">
      💳 <b>Payment:</b> After placing your order you will receive a <b>Payoneer invoice</b> for
      <b id="pCheckoutTotal">$${defaultPrice}</b>. Printify handles production and worldwide shipping.
    </div>

    <button class="btn primary block" data-action="placeprintifyorder" data-productid="${productId}" style="margin-top:14px">Place Order →</button>
  </div>`);

  setTimeout(()=>{
    const sel=$('pVariantSelect');
    if(sel) sel.onchange=()=>{
      const opt=sel.options[sel.selectedIndex];
      const price='$'+(opt.dataset.price||'0.00');
      const cp=$('pCheckoutPrice'); if(cp) cp.textContent=price;
      const ct=$('pCheckoutTotal'); if(ct) ct.textContent=price;
    };
  },0);
}

async function placePrintifyOrder(productId){
  if(!ME) return openEmailAuth();
  const p=CACHE.products.find(x=>x.id===productId); if(!p) return;
  const variants=p.variants||[];
  const sel=$('pVariantSelect');
  const variantId=sel?sel.value:(variants[0]?.id||'');
  const variant=variants.find(v=>String(v.id)===String(variantId))||variants[0];

  const fname   =($('pShipFname')?.value||'').trim();
  const lname   =($('pShipLname')?.value||'').trim();
  const email   =($('pShipEmail')?.value||'').trim();
  const addr1   =($('pShipAddr1')?.value||'').trim();
  const addr2   =($('pShipAddr2')?.value||'').trim();
  const city    =($('pShipCity')?.value||'').trim();
  const zip     =($('pShipZip')?.value||'').trim();
  const region  =($('pShipRegion')?.value||'').trim();
  const country =($('pShipCountry')?.value||'').trim().toUpperCase();
  const phone   =($('pShipPhone')?.value||'').trim();

  if(!fname||!lname) return toast('Enter your full name');
  if(!email||!email.includes('@')) return toast('Enter a valid email address');
  if(!addr1) return toast('Enter your street address');
  if(!city)  return toast('Enter your city');
  if(!zip)   return toast('Enter your ZIP / postal code');
  if(!country||country.length!==2) return toast('Enter a 2-letter country code (e.g. US, SS, GB)');
  if(!variantId) return toast('This item is temporarily unavailable. Please contact the seller or use the Reserve option.');

  const btn=document.querySelector('[data-action="placeprintifyorder"]');
  if(btn){ btn.disabled=true; btn.textContent='Placing order…'; }

  const address={first_name:fname,last_name:lname,email,phone,address1:addr1,address2:addr2,city,region,zip,country};

  try{
    const orderRef=await fbDB.collection('printifyOrders').add({
      buyerId:ME.id, buyerName:ME.name, buyerEmail:ME.email||email,
      productId, productTitle:p.title,
      printifyProductId:p.printifyId, printifyShopId:p.printifyShopId,
      variantId:String(variantId), variantLabel:variant?.label||'',
      price:variant?.price||p.price,
      address, status:'pending', createdAt:Date.now(),
    });
    const submitFn=firebase.functions().httpsCallable('submitPrintifyOrder');
    const result=await submitFn({
      printifyProductId:p.printifyId, printifyShopId:p.printifyShopId,
      variantId:String(variantId), quantity:1, address, okOrderId:orderRef.id,
    });
    closeOverlay();
    toast('Order placed! You will receive a Payoneer invoice shortly 🎉');
    console.log('Printify order submitted:',result.data?.printifyOrderId);
  }catch(e){
    console.error('placePrintifyOrder',e);
    const msg=(e.message||'Order failed — please try again').replace(/^internal: /,'');
    toast(msg);
    if(btn){ btn.disabled=false; btn.textContent='Place Order →'; }
  }
}

// ---------- cart ----------
function addToCart(id){
  if(!ME) return openEmailAuth();
  if(!state.cart) state.cart=[];
  const p=CACHE.products.find(x=>x.id===id);
  const has=state.cart.includes(id);
  if(!has&&isOutOfStock(p)) return toast("This item is out of stock 📦");
  state.cart=has?state.cart.filter(x=>x!==id):[...state.cart,id];
  persistCart();
  toast(has?"Removed from cart":"Added to cart 🛒");
  closeOverlay(); renderMain();
}
function removeFromCart(id){ state.cart=(state.cart||[]).filter(x=>x!==id); persistCart(); renderCart(); }
function renderCart(){
  if(!state.cart) state.cart=[];
  const items=state.cart.map(id=>CACHE.products.find(p=>p.id===id)).filter(Boolean);
  const subtotal=+items.reduce((s,p)=>s+productPriceUSD(p),0).toFixed(2);
  const shipping=+items.reduce((s,p)=>s+productShippingUSD(p),0).toFixed(2);
  const fee=+(subtotal*PLATFORM_FEE).toFixed(2);
  const total=+(subtotal+shipping+fee).toFixed(2);
  $("page").innerHTML=`<div class="h-title">🛒 My Cart</div>
    ${items.length?`
      <div class="cart-items">${items.map(p=>{ const photo=p.photos&&p.photos[0]; const eq=usdEquiv(p.price,p.currency); return `<div class="cart-row">
        <div class="cart-photo" style="${photo?`background-image:url('${photo}');background-size:cover;background-position:center`:'background:var(--orange-1)'}">${photo?'':'📦'}</div>
        <div class="cart-info"><div class="cart-title">${esc(p.title)}</div>
          <div class="cart-price">${fmtCurrency(p.price,p.currency)}${eq?` <span style="font-size:11px;color:var(--muted)">${eq}</span>`:''} + ${fmtCurrency(p.shipping||0,p.currency)} ship</div>
          <div class="mp-seller-name">${esc(CACHE.sellers[p.sellerId]?.name||'Seller')}</div></div>
        <button class="btn sm" data-action="removecart" data-id="${p.id}" style="color:#e2554f;border-color:#f0b3b3;align-self:center">Remove</button>
      </div>`; }).join("")}</div>
      <div class="cart-summary">
        <div class="cart-line"><span>Subtotal (USD)</span><span>$${subtotal.toFixed(2)}</span></div>
        <div class="cart-line"><span>Shipping (USD)</span><span>$${shipping.toFixed(2)}</span></div>
        <div class="cart-line"><span>Platform fee (3%)</span><span>$${fee.toFixed(2)}</span></div>
        <div class="cart-line cart-total"><span>Total (USD)</span><span>$${total.toFixed(2)}</span></div>
      </div>
      <button class="btn primary block" data-action="checkout" style="margin-top:18px;font-size:16px;padding:14px">Proceed to checkout →</button>
      <button class="btn block" data-action="nav" data-view="marketplace" style="margin-top:8px">← Continue shopping</button>`
    :'<div class="empty">Your cart is empty. <span data-action="nav" data-view="marketplace" style="color:var(--orange);cursor:pointer">Browse the marketplace →</span></div>'}`;
}

// ---------- checkout ----------
function openCheckout(){
  if(!state.cart||!state.cart.length) return go("cart");
  const items=state.cart.map(id=>CACHE.products.find(p=>p.id===id)).filter(Boolean);
  const subtotal=+items.reduce((s,p)=>s+productPriceUSD(p),0).toFixed(2);
  const shipping=+items.reduce((s,p)=>s+productShippingUSD(p),0).toFixed(2);
  const fee=+(subtotal*PLATFORM_FEE).toFixed(2);
  const total=+(subtotal+shipping+fee).toFixed(2);
  openOverlay(`<h2>📦 Checkout</h2>
    <p class="sub">${items.length} item${items.length>1?'s':''} · Total <b>$${total.toFixed(2)}</b></p>
    <div class="field"><label>Full name</label><input class="fb-field" id="ckName" placeholder="Your full name" value="${esc(ME?.name||'')}" /></div>
    <div class="field"><label>Email</label><input class="fb-field" id="ckEmail" type="email" placeholder="your@email.com" value="${esc(fbAuth.currentUser?.email||'')}" /></div>
    <div class="field"><label>Shipping address</label><textarea class="fb-field" id="ckAddr" placeholder="Street, City, Province/State, Postal code, Country" style="min-height:80px"></textarea></div>
    <div class="cart-summary" style="margin-top:12px">
      <div class="cart-line"><span>Subtotal</span><span>$${subtotal.toFixed(2)}</span></div>
      <div class="cart-line"><span>Shipping</span><span>$${shipping.toFixed(2)}</span></div>
      <div class="cart-line"><span>Platform fee (3%)</span><span>$${fee.toFixed(2)}</span></div>
      <div class="cart-line cart-total"><span>Total</span><span>$${total.toFixed(2)}</span></div>
    </div>
    <button class="btn primary block" data-action="doorder" style="margin-top:16px;font-size:16px;padding:14px">Place order & get payment details</button>`);
}
async function doPlaceOrder(){
  const name=($("ckName").value||"").trim(), email=($("ckEmail").value||"").trim(), address=($("ckAddr").value||"").trim();
  if(!name||!email||!address) return toast("Fill in all fields");
  if(!email.includes("@")) return toast("Enter a valid email");
  const items=state.cart.map(id=>CACHE.products.find(p=>p.id===id)).filter(Boolean);
  if(!items.length) return toast("Cart is empty");
  const oosItem=items.find(isOutOfStock);
  if(oosItem) return toast(`"${oosItem.title}" is out of stock — remove it from your cart`);
  const subtotal=+items.reduce((s,p)=>s+productPriceUSD(p),0).toFixed(2);
  const shippingTotal=+items.reduce((s,p)=>s+productShippingUSD(p),0).toFixed(2);
  const fee=+(subtotal*PLATFORM_FEE).toFixed(2);
  const total=+(subtotal+shippingTotal+fee).toFixed(2);
  const F=firebase.firestore.FieldValue;
  const orderRef=fbDB.collection("orders").doc();
  try{
    await fbDB.runTransaction(async t=>{
      const productRefs=items.map(p=>fbDB.collection('products').doc(p.id));
      const snaps=await Promise.all(productRefs.map(r=>t.get(r)));
      for(const snap of snaps){
        const d=snap.data();
        if(d&&d.stock!=null&&d.stock<=0) throw new Error(`"${d.title}" is out of stock`);
      }
      t.set(orderRef,{
        buyerId:ME.id, buyerName:name, buyerEmail:email, buyerAddress:address,
        items:items.map(p=>({productId:p.id,title:p.title,price:productPriceUSD(p),currency:'USD',shipping:productShippingUSD(p),sellerId:p.sellerId})),
        subtotal, shipping:shippingTotal, platformFee:fee, total, status:"pending_payment", createdAt:Date.now()
      });
      snaps.forEach(snap=>{
        if(snap.data()?.stock!=null) t.update(snap.ref,{stock:F.increment(-1)});
      });
    });
    state.cart=[]; persistCart();
    closeOverlay();
    openOverlay(`<div style="text-align:center;padding:8px">
      <div style="font-size:44px;margin-bottom:12px">✅</div>
      <h2>Order placed!</h2>
      <p class="sub">Order ID: <b>${orderRef.id.slice(0,8).toUpperCase()}</b></p>
      <div class="mp-payment-box">
        <div style="font-weight:800;font-size:15px;margin-bottom:10px">💳 Complete your payment via Payoneer</div>
        <p style="font-size:14px;margin-bottom:8px">Send <b>$${total.toFixed(2)} USD</b> to:</p>
        <div class="mp-payoneer-email">${PLATFORM_EMAIL}</div>
        <p style="font-size:12px;color:var(--muted);margin-top:10px">Include order ID <b>${orderRef.id.slice(0,8).toUpperCase()}</b> in the payment note so we can match your order.</p>
        <p style="font-size:12px;color:var(--muted);margin-top:6px">Your order will be confirmed and the seller notified within 1–2 business days after payment is received.</p>
      </div>
      <button class="btn primary block" data-action="close" style="margin-top:16px">Done</button>
    </div>`);
  } catch(e){ toast(e.message||"Couldn't place order: "+(e.code||"")); }
}

// ---------- delegation ----------
// ---------- fans / following (fanbase list) ----------
function followingOf(uid){ return CACHE.follows[uid]||[]; }
function followersOf(uid){ const r=[]; for(const f in CACHE.follows){ if(CACHE.follows[f].includes(uid)) r.push(f); } return r; }
function userCard(u){
  if(!u) return "";
  const me=currentUser(); const self=me&&me.id===u.id;
  const following=isFollowing(u.id);
  const requested=!following&&(CACHE.followRequests||[]).some(r=>r.fromUid===ME?.id&&r.toUid===u.id&&r.status==='pending');
  const btn=self?"":`<button class="btn sm ${following?'':'primary'}" data-action="follow" data-uid="${u.id}">${following?'Following ✓':requested?'Requested ↗':'Follow back'}</button>`;
  return `<div class="mrow2">
    <div class="avatar" style="${avatarStyle(u,44)};cursor:pointer" data-action="viewavatar" data-uid="${u.id}">${u.avatarImg?'':initials(u.name)}</div>
    <div class="minfo"><div class="mt" data-action="profile" data-uid="${u.id}">${esc(u.name)}</div><div class="ms">@${esc(u.handle)} · ${nfmt(followerCount(u.id))} fans</div></div>
    ${btn}</div>`;
}
