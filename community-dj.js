'use strict';
// ============================================================
//  OK Music — DJ Panel  (community-dj.js v1)
//  Manages the floating DJ Mixer panel embedded in community.html.
//  Extracted from community.js for modular separation.
//  Close resets the DJ session (iframe reload); minimize keeps audio live.
// ============================================================

const _djChannel = new BroadcastChannel("ok-music-dj");
let _djPendingMsg = null;
let _djDragging = false, _djDragOffX = 0, _djDragOffY = 0;

_djChannel.onmessage = e => {
  if (e.data.type === "mixer-ready") {
    if (_djPendingMsg) { _djChannel.postMessage(_djPendingMsg); _djPendingMsg = null; }
    _sendDJLibrary();
  }
  if (e.data.type === "request-library") _sendDJLibrary();
  if (e.data.type === "close-request") _closeDJPanel();
};

function _sendDJLibrary() {
  const me = currentUser(); if (!me) return;
  const tracks = allTracks()
    .filter(t => t.userId === me.id && t.src && !t.src.startsWith("local:"))
    .map(t => ({ src: t.src.startsWith("http") ? t.src : location.origin + "/" + t.src, title: t.title, artist: me.name || "" }));
  if (!tracks.length) return;
  _djChannel.postMessage({ type: "track-library", tracks });
}

function _closeDJPanel() {
  const panel = document.getElementById("dj-panel"); if (!panel) return;
  panel.classList.remove("active");
  // Reset iframe → DJ session restarts from scratch on next open
  const frame = document.getElementById("djFrame");
  if (frame) { const s = frame.src; frame.src = "about:blank"; setTimeout(() => { frame.src = s; }, 50); }
}

function _isMobileViewport() {
  return window.innerWidth <= 1024 || /Mobi|Android/i.test(navigator.userAgent);
}

function _initDjPanelDrag() {
  const drag = document.getElementById("djDrag"); if (!drag) return;
  drag.addEventListener("pointerdown", e => {
    if (_isMobileViewport()) return; // full-screen on mobile — no drag
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (e.target.closest(".dj-panel-btn")) return;
    const panel = document.getElementById("dj-panel"); if (!panel) return;
    const rect = panel.getBoundingClientRect();
    _djDragOffX = e.clientX - rect.left; _djDragOffY = e.clientY - rect.top;
    _djDragging = true;
    drag.setPointerCapture(e.pointerId); drag.classList.add("dragging");
    panel.style.bottom = "auto"; panel.style.right = "auto";
    panel.style.left = rect.left + "px"; panel.style.top = rect.top + "px";
    panel.style.transform = "none";
    const fr = document.getElementById("djFrame"); if (fr) fr.style.pointerEvents = "none";
    e.preventDefault();
  }, { passive: false });
  drag.addEventListener("pointermove", e => {
    if (!_djDragging) return;
    const panel = document.getElementById("dj-panel"); if (!panel) return;
    let x = e.clientX - _djDragOffX, y = e.clientY - _djDragOffY;
    x = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, x));
    y = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, y));
    panel.style.left = x + "px"; panel.style.top = y + "px";
  });
  drag.addEventListener("pointerup", () => {
    _djDragging = false;
    document.getElementById("djDrag")?.classList.remove("dragging");
    const fr = document.getElementById("djFrame"); if (fr) fr.style.pointerEvents = "";
  });
}

function openDJMixer() {
  let panel = document.getElementById("dj-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "dj-panel";
    panel.innerHTML = `
      <div class="dj-drag" id="djDrag" role="toolbar" aria-label="DJ Mixer panel">
        <span class="cp-drag-dots" aria-hidden="true">⠿</span>
        <span class="dj-panel-title">🎚 DJ Mixer</span>
        <button class="dj-panel-btn" id="djMinimize" title="Minimize — music keeps playing" aria-label="Minimize">—</button>
        <button class="dj-panel-btn" id="djClose" title="Close — resets mixer" aria-label="Close">✕</button>
      </div>
      <iframe id="djFrame" src="dj-mixer.html" frameborder="0" allow="autoplay; microphone" title="DJ Mixer"></iframe>`;
    document.body.appendChild(panel);
    _initDjPanelDrag();
    document.getElementById("djMinimize").onclick = () => {
      panel.classList.toggle("dj-minimized");
      // Audio in iframe continues running even when iframe is display:none
    };
    document.getElementById("djClose").onclick = () => _closeDJPanel();
  }
  panel.classList.remove("dj-minimized");
  panel.classList.add("active");
}

function loadTrackOnDeck(trackId, deckId) {
  const t = allTracks().find(x => x.id === trackId);
  if (!t) { toast("Track not found"); return; }
  let src = t.src;
  if (!src || src.startsWith("local:")) { toast("No public audio link — add one via Manage Track"); return; }
  if (!src.startsWith("http")) src = location.origin + "/" + src;
  const u = userById(t.userId);
  const msg = { type: "load-track", deck: deckId, src, title: t.title, artist: u?.name || "" };
  const panel = document.getElementById("dj-panel");
  if (!panel || !panel.classList.contains("active")) { _djPendingMsg = msg; openDJMixer(); }
  else { _djChannel.postMessage(msg); }
  toast(`🎚 Loading "${t.title}" → Deck ${deckId}`);
}

document.getElementById("mpDJ")?.addEventListener("click", openDJMixer);
