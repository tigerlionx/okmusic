// ============================================================
//  OK Music — front-end logic (first draft)
//  Pure browser JS, no build step. Open index.html to run.
// ============================================================

const audio = document.getElementById("audio");
const $ = (id) => document.getElementById(id);

let currentIndex = -1;
let isPlaying = false;

// ---------- render track thumbnails ----------
function renderTracks() {
  const grid = $("trackGrid");
  grid.innerHTML = "";
  TRACKS.forEach((t, i) => {
    const card = document.createElement("div");
    card.className = "track-card";
    card.dataset.index = i;
    const art = t.cover
      ? `<img src="${t.cover}" alt="${t.title}" />`
      : `<span class="track-thumb-ph">◎</span>`;
    const newBadge = isNew(t.added) ? `<span class="new-badge">NEW</span>` : "";
    card.innerHTML = `
      <div class="track-thumb" style="--accent:${t.accent}">
        ${newBadge}
        ${art}
        <div class="track-play-badge">▶</div>
      </div>
      <div class="track-name">${t.title}</div>
      <div class="track-sub">${t.artist}</div>`;
    card.addEventListener("click", () => playTrack(i));
    grid.appendChild(card);
  });
}

// a track counts as "new" for 14 days after its `added` date
function isNew(added) {
  if (!added) return false;
  const days = (Date.now() - new Date(added).getTime()) / 86400000;
  return days >= 0 && days <= 14;
}

// ---------- play a track + magnify its art ----------
function playTrack(i) {
  const t = TRACKS[i];
  currentIndex = i;

  document.documentElement.style.setProperty("--accent", t.accent);

  // header / now-playing art
  const npArt = $("npArt");
  npArt.innerHTML = t.cover
    ? `<img src="${t.cover}" alt="${t.title}" />`
    : `<div class="np-art-placeholder">◎</div>`;
  npArt.classList.add("playing");

  $("npTitle").textContent = t.title;
  $("npArtist").textContent = t.artist;

  // highlight active thumbnail
  document.querySelectorAll(".track-card").forEach((c) =>
    c.classList.toggle("active", Number(c.dataset.index) === i)
  );

  updateVoteUI(t.id);

  if (t.src) {
    audio.src = t.src;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  } else {
    // no audio file yet — simulate so the UI is demoable
    setPlaying(true);
    showToast("No audio file linked yet — add one in data.js");
  }
}

function setPlaying(state) {
  isPlaying = state;
  $("playBtn").textContent = state ? "⏸" : "▶";
  $("npArt").classList.toggle("playing", state);
}

// ---------- controls ----------
$("playBtn").addEventListener("click", () => {
  if (currentIndex === -1) { playTrack(0); return; }
  if (audio.src && !audio.paused) { audio.pause(); setPlaying(false); }
  else if (audio.src) { audio.play(); setPlaying(true); }
  else { setPlaying(!isPlaying); }
});
$("nextBtn").addEventListener("click", () => playTrack((currentIndex + 1 + TRACKS.length) % TRACKS.length || 0));
$("prevBtn").addEventListener("click", () => playTrack((currentIndex - 1 + TRACKS.length) % TRACKS.length));

audio.addEventListener("timeupdate", () => {
  if (!audio.duration) return;
  $("progressFill").style.width = (audio.currentTime / audio.duration) * 100 + "%";
  $("curTime").textContent = fmt(audio.currentTime);
  $("durTime").textContent = fmt(audio.duration);
});
audio.addEventListener("ended", () => $("nextBtn").click());

$("progressBar").addEventListener("click", (e) => {
  if (!audio.duration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
});

function fmt(s) {
  s = Math.floor(s || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------- share ----------
$("shareBtn").addEventListener("click", async () => {
  if (currentIndex === -1) { showToast("Pick a track to share first"); return; }
  const t = TRACKS[currentIndex];
  const url = `${location.origin}${location.pathname}?track=${t.id}`;
  const data = { title: `${t.title} — ${t.artist}`, text: `Listen to "${t.title}" on OK Music`, url };
  if (navigator.share) {
    try { await navigator.share(data); } catch (_) {}
  } else {
    try { await navigator.clipboard.writeText(url); showToast("Link copied to clipboard ✓"); }
    catch (_) { showToast(url); }
  }
});

// open shared track from ?track= in URL
function openSharedTrack() {
  const id = new URLSearchParams(location.search).get("track");
  if (!id) return;
  const i = TRACKS.findIndex((t) => t.id === id);
  if (i >= 0) playTrack(i);
}

// ---------- store ----------
function renderStore() {
  const wrap = $("storeScroll");
  wrap.innerHTML = "";
  PRODUCTS.forEach((p) => {
    const row = document.createElement("div");
    row.className = "product-row";
    const img = p.image
      ? `<img src="${p.image}" alt="${p.title}" />`
      : `🛍️`;
    row.innerHTML = `
      <div class="product-thumb">${img}</div>
      <div class="product-info">
        <div class="product-title">${p.title}</div>
        <div class="product-desc">${p.description}</div>
      </div>
      <div class="product-price">$${p.price.toFixed(2)}</div>`;
    row.addEventListener("click", () => openProduct(p));
    wrap.appendChild(row);
  });
}

// ---------- product / checkout modal ----------
function openProduct(p) {
  const hero = p.image ? `<img src="${p.image}" alt="${p.title}" />` : "🛍️";
  const ready = p.buyUrl && p.buyUrl !== "#";
  $("modalBody").innerHTML = `
    <div class="modal-hero">${hero}</div>
    <h2>${p.title}</h2>
    <div class="m-price">$${p.price.toFixed(2)}</div>
    <p class="m-desc">${p.description}</p>

    <button class="btn-primary" id="buyBtn">
      ${ready ? `Buy on ${STORE_NAME} ↗` : `Link your ${STORE_NAME} product`}
    </button>
    <p class="checkout-note">
      Secure checkout, printing & shipping are handled by ${STORE_NAME}.<br/>
      Your profit is paid out to your Payoneer account.
    </p>`;
  openModal();
  $("buyBtn").addEventListener("click", () => {
    if (ready) {
      window.open(p.buyUrl, "_blank", "noopener");
    } else {
      showToast(`Add this product's link in data.js (buyUrl) to enable buying`);
    }
  });
}

function openModal() { $("modalOverlay").hidden = false; }
function closeModal() { $("modalOverlay").hidden = true; }
$("modalClose").addEventListener("click", closeModal);
$("modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// ---------- toast ----------
let toastTimer;
function showToast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}

// ---------- likes / dislikes ----------
function applyVotes(v) {
  $("likeCount").textContent = v.likes;
  $("dislikeCount").textContent = v.dislikes;
  $("likeBtn").classList.toggle("voted", v.mine === "like");
  $("dislikeBtn").classList.toggle("voted", v.mine === "dislike");
}
async function updateVoteUI(trackId) {
  applyVotes(await Store.getVotes(trackId));
}
async function castVote(dir) {
  if (currentIndex === -1) { showToast("Pick a track to rate first"); return; }
  applyVotes(await Store.vote(TRACKS[currentIndex].id, dir));
}
$("likeBtn").addEventListener("click", () => castVote("like"));
$("dislikeBtn").addEventListener("click", () => castVote("dislike"));

// ---------- comments ----------
function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function timeAgo(t) {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60); if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
async function renderComments() {
  const list = await Store.getComments();
  const wrap = $("commentList");
  if (!list.length) {
    wrap.innerHTML = `<p class="comment-empty">No comments yet — be the first!</p>`;
    return;
  }
  wrap.innerHTML = list.map((c) => `
    <div class="comment">
      <div class="comment-head">
        <span class="comment-author">${esc(c.name)}</span>
        <span class="comment-time">${timeAgo(c.time)}</span>
      </div>
      <div class="comment-body">${esc(c.text)}</div>
    </div>`).join("");
}
$("cSubmit").addEventListener("click", async () => {
  const text = $("cText").value.trim();
  if (!text) { showToast("Write something first"); return; }
  await Store.addComment($("cName").value.trim(), text);
  $("cText").value = "";
  renderComments();
  showToast("Comment posted ✓");
});

// ---------- donations ----------
function renderDonate() {
  const panel = $("donatePanel");
  if (typeof DONATE === "undefined" || !DONATE.enabled) { panel.style.display = "none"; return; }
  const qr = DONATE.qrImage
    ? `<img src="${DONATE.qrImage}" alt="${esc(DONATE.method)} QR code" />`
    : `<div class="donate-qr-ph">Add your ${esc(DONATE.method)} QR image<br/>in data.js (qrImage)</div>`;
  const usCap = DONATE.usCaption
    ? `<div class="donate-cap">${esc(DONATE.usCaption)}</div>` : "";
  const intlCap = DONATE.intlCaption
    ? `<div class="donate-cap">${esc(DONATE.intlCaption)}</div>` : "";
  const handle = DONATE.handle
    ? `<div class="donate-handle">${esc(DONATE.method)}: <b>${esc(DONATE.handle)}</b></div>`
    : "";
  const intlBtn = DONATE.intlUrl
    ? `<a class="donate-btn" href="${DONATE.intlUrl}" target="_blank" rel="noopener">${esc(DONATE.intlLabel)}</a>`
    : `<div class="donate-btn donate-btn-todo">${esc(DONATE.intlLabel)}<br/><small>add link in data.js (intlUrl)</small></div>`;
  panel.innerHTML = `
    <div class="donate-card">
      <div class="donate-options">
        <div class="donate-opt">
          <div class="donate-qr">${qr}</div>
          ${usCap}
        </div>
        <div class="donate-opt">
          <div class="donate-tile">
            <div class="donate-tile-icon">💳</div>
            ${intlBtn}
          </div>
          ${intlCap}
        </div>
      </div>
      <div class="donate-info">
        <div class="donate-title">${esc(DONATE.title)}</div>
        <p class="donate-message">${esc(DONATE.message)}</p>
        ${handle}
      </div>
    </div>`;
}

// ---------- init ----------
TRACKS.sort((a, b) => String(b.added || "").localeCompare(String(a.added || ""))); // newest first
renderTracks();
renderStore();
renderDonate();
openSharedTrack();
renderComments();
Store.registerVisit().then((n) => {
  $("visitCount").textContent = n.toLocaleString();
});
