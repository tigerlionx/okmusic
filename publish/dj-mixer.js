'use strict';
// ============================================================
//  OK Music — DJ Mixer  (dj-mixer.js v8)
//  Embeds as floating in-page iframe panel OR standalone popup.
//  Web Audio API for EQ/routing; HTML audio elements for playback.
//  BroadcastChannel "ok-music-dj" for cross-window/frame track loading.
//  v8: hardware controller redesign — chassis layout, LCD display,
//      spectral waveform, OK-MUSIC jog hub, vertical pitch faders.
// ============================================================

const BC = new BroadcastChannel('ok-music-dj');

// ── Helpers ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmtTime = s => {
  if (!isFinite(s) || s < 0) return '0:00';
  s = Math.floor(s);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const hexToRgba = (hex, a) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};
const escHtml = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const escAttr = s => String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');

// ── Audio Context (lazy, created on first user gesture) ───
let actx = null, masterGainNode = null, masterAnalyser = null, mediaDestNode = null;

function ensureAudioCtx() {
  if (actx) {
    if (actx.state === 'suspended') actx.resume();
    return;
  }
  actx = new (window.AudioContext || window.webkitAudioContext)();
  masterGainNode = actx.createGain();
  masterGainNode.gain.value = 1;
  masterAnalyser = actx.createAnalyser();
  masterAnalyser.fftSize = 256;
  masterGainNode.connect(masterAnalyser);
  masterGainNode.connect(actx.destination);
  // Recording destination — always connected so REC can start anytime
  mediaDestNode = actx.createMediaStreamDestination();
  masterGainNode.connect(mediaDestNode);
  setupDeckAudio(DA);
  setupDeckAudio(DB);
  startAnimLoop();
}

// ── Library (website tracks sent from main window) ────────
let _libraryTracks = [];   // [{src, title, artist}]
let _localBlobs   = [];    // blob URLs created this session (for revocation on close)

// ── Mic recording ─────────────────────────────────────────
let _micStream = null, _micSource = null, _micGain = null;

// ── Samples (8 performance pads) ──────────────────────────
const SAMPLE_COUNT = 8;
const _samples = Array(SAMPLE_COUNT).fill(null); // { buffer, name }
let _smpRecIdx = -1, _smpRec = null, _smpChunks = [];

function initSamplePads() {
  const grid = $('smpGrid'); if (!grid) return;
  grid.innerHTML = '';
  const padColors = ['#00cc44','#0066ff','#cc00ee','#00ccbb','#ffcc00','#ff6600','#ff0055','#8800ff'];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const pad = document.createElement('div');
    pad.className = 'smp-pad'; pad.id = `smpPad${i}`; pad.dataset.idx = i;
    pad.style.borderColor = padColors[i] + '44';
    pad.innerHTML = `
      <div class="smp-num" style="color:${padColors[i]}88">${i + 1}</div>
      <canvas class="smp-wave" width="60" height="22"></canvas>
      <div class="smp-name">EMPTY</div>
      <div class="smp-btns">
        <button class="smp-btn smp-play-btn" data-idx="${i}" title="Play (key ${i+1})">▶</button>
        <button class="smp-btn smp-rec-btn" data-idx="${i}" title="Record from mix">⏺</button>
        <button class="smp-btn smp-file-btn" data-idx="${i}" title="Load audio file">📁</button>
        <button class="smp-btn smp-save-btn" data-idx="${i}" title="Save to device">💾</button>
      </div>`;
    grid.appendChild(pad);
  }
  grid.addEventListener('click', e => {
    const idx = parseInt(e.target.dataset?.idx ?? '');
    if (isNaN(idx)) return;
    if (e.target.classList.contains('smp-play-btn'))  { ensureAudioCtx(); playSample(idx); }
    else if (e.target.classList.contains('smp-rec-btn'))  { toggleSampleRec(idx); }
    else if (e.target.classList.contains('smp-file-btn')) { openSampleFile(idx); }
    else if (e.target.classList.contains('smp-save-btn')) { saveSample(idx); }
  });
  // Touch: tap pad body (outside buttons) also plays
  grid.addEventListener('touchend', e => {
    const pad = e.target.closest('.smp-pad');
    if (pad && !e.target.closest('.smp-btn')) {
      ensureAudioCtx(); playSample(parseInt(pad.dataset.idx));
      e.preventDefault();
    }
  }, { passive: false });
}

function _renderSamplePad(i) {
  const s = _samples[i];
  const padEl = $(`smpPad${i}`); if (!padEl) return;
  padEl.querySelector('.smp-name').textContent = s ? s.name.slice(0, 14) : 'EMPTY';
  _drawSampleWave(padEl.querySelector('.smp-wave'), s?.buffer);
}

function _drawSampleWave(canvas, buffer) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!buffer) return;
  const data = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / w));
  ctx.fillStyle = '#0088ff88';
  for (let x = 0; x < w; x++) {
    let max = 0;
    for (let s = 0; s < step; s++) max = Math.max(max, Math.abs(data[x * step + s] || 0));
    const amp = max * h / 2;
    ctx.fillRect(x, h / 2 - amp, 1, amp * 2 || 1);
  }
}

function playSample(i) {
  const s = _samples[i]; if (!s || !actx) return;
  const src = actx.createBufferSource();
  src.buffer = s.buffer;
  src.connect(masterGainNode);
  src.start(0);
  const padEl = $(`smpPad${i}`);
  if (padEl) {
    padEl.classList.add('smp-playing');
    src.onended = () => padEl.classList.remove('smp-playing');
  }
}

function toggleSampleRec(i) {
  ensureAudioCtx();
  if (_smpRec && _smpRec.state === 'recording') {
    const prevIdx = _smpRecIdx;
    _smpRec.stop();
    if (prevIdx === i) return; // toggled same pad off
  }
  if (!mediaDestNode) { showBanner('Load a track first to enable sample recording', 'warn'); return; }
  _smpRecIdx = i; _smpChunks = [];
  const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/ogg'].find(m => {
    try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
  }) || '';
  _smpRec = new MediaRecorder(mediaDestNode.stream, mimeType ? { mimeType } : {});
  _smpRec.ondataavailable = e => { if (e.data.size > 0) _smpChunks.push(e.data); };
  _smpRec.onstop = async () => {
    const blob = new Blob(_smpChunks, { type: _smpRec?.mimeType || 'audio/webm' });
    const decCtx = new (window.AudioContext || window.webkitAudioContext)();
    try {
      const buf = await decCtx.decodeAudioData(await blob.arrayBuffer());
      _samples[_smpRecIdx] = { buffer: buf, name: `Smp ${_smpRecIdx + 1}` };
      _renderSamplePad(_smpRecIdx);
      showBanner(`Sample ${_smpRecIdx + 1} captured! Press ${_smpRecIdx + 1} to play.`, 'info');
    } catch (err) {
      showBanner('Sample decode failed: ' + (err.message || err), 'error');
    } finally {
      decCtx.close().catch(() => {});
    }
    _smpRecIdx = -1; _smpRec = null;
    document.querySelectorAll('.smp-rec-btn').forEach(b => b.classList.remove('rec-active'));
  };
  _smpRec.start();
  $(`smpPad${i}`)?.querySelector('.smp-rec-btn')?.classList.add('rec-active');
  showBanner(`⏺ Recording Sample ${i + 1}… tap ⏺ again to stop`, 'info');
}

function openSampleFile(i) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'audio/*'; input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => { _loadFileIntoSample(i, input.files[0]); input.remove(); });
  input.click();
}

function openSampleFolder() {
  const input = document.createElement('input');
  input.type = 'file'; input.multiple = true;
  input.accept = 'audio/*,.mp3,.wav,.ogg,.flac,.aac,.m4a';
  input.style.display = 'none';
  try { input.webkitdirectory = true; } catch (_) {}
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const files = [...input.files]
      .filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac|m4a|webm)$/i.test(f.name))
      .slice(0, SAMPLE_COUNT);
    input.remove();
    if (!files.length) { showBanner('No audio files found in selection', 'warn'); return; }
    files.forEach((file, idx) => _loadFileIntoSample(idx, file));
    showBanner(`Loading ${files.length} sample(s)…`, 'info');
  });
  input.click();
}

function _loadFileIntoSample(i, file) {
  if (!file) return;
  ensureAudioCtx();
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const buf = await actx.decodeAudioData(ev.target.result.slice(0));
      _samples[i] = { buffer: buf, name: file.name.replace(/\.[^.]+$/, '').slice(0, 14) };
      _renderSamplePad(i);
      showBanner(`Pad ${i + 1}: "${_samples[i].name}" loaded`, 'info');
    } catch (err) {
      showBanner(`Pad ${i + 1}: decode failed — ${err.message || err}`, 'error');
    }
  };
  reader.onerror = () => showBanner(`Pad ${i + 1}: could not read file`, 'error');
  reader.readAsArrayBuffer(file);
}

function saveSample(i) {
  const s = _samples[i];
  if (!s) { showBanner(`Pad ${i + 1} is empty — record or load a sample first`, 'warn'); return; }
  const wav = _bufferToWav(s.buffer);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (s.name || `sample-${i + 1}`) + '.wav';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  showBanner(`💾 "${s.name}.wav" saved to your device`, 'info');
}

function _bufferToWav(buffer) {
  const numCh = buffer.numberOfChannels;
  const numFrames = buffer.length;
  const sr = buffer.sampleRate;
  const byteRate = sr * numCh * 2;
  const blockAlign = numCh * 2;
  const dataSize = numFrames * blockAlign;
  const ab = new ArrayBuffer(44 + dataSize);
  const dv = new DataView(ab);
  const ws = (off, str) => { for (let k = 0; k < str.length; k++) dv.setUint8(off + k, str.charCodeAt(k)); };
  ws(0,'RIFF'); dv.setUint32(4, 36 + dataSize, true);
  ws(8,'WAVE'); ws(12,'fmt '); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, numCh, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true); dv.setUint16(34, 16, true);
  ws(36,'data'); dv.setUint32(40, dataSize, true);
  let off = 44;
  for (let f = 0; f < numFrames; f++) {
    for (let c = 0; c < numCh; c++) {
      const v = Math.max(-1, Math.min(1, buffer.getChannelData(c)[f]));
      dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
      off += 2;
    }
  }
  return ab;
}

// ── Vinyl Scratch Synthesizer ──────────────────────────────
let _vinylNoise = null;   // { bpf, gain }

function _ensureVinylNoise() {
  if (_vinylNoise) return;
  ensureAudioCtx();
  // Pink-ish noise buffer (warmer than white noise — vintage vinyl feel)
  const sr = actx.sampleRate;
  const bufLen = sr * 3;
  const buf = actx.createBuffer(1, bufLen, sr);
  const dat = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < bufLen; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520;
    dat[i] = (b0 + b1 + b2 + w * 0.5362) / 4.5;
  }
  const src = actx.createBufferSource();
  src.buffer = buf; src.loop = true;
  // Bandpass: warm scratch character, frequency modulated by velocity
  const bpf = actx.createBiquadFilter();
  bpf.type = 'bandpass'; bpf.frequency.value = 900; bpf.Q.value = 1.4;
  // High-shelf cut: vintage vinyl loses presence above ~5 kHz
  const hshelf = actx.createBiquadFilter();
  hshelf.type = 'highshelf'; hshelf.frequency.value = 5000; hshelf.gain.value = -10;
  const gainNode = actx.createGain();
  gainNode.gain.value = 0;
  src.connect(bpf); bpf.connect(hshelf); hshelf.connect(gainNode);
  gainNode.connect(masterGainNode);
  src.start();
  _vinylNoise = { bpf, gain: gainNode };
}

async function toggleMic() {
  if (_micStream) { stopMic(); return; }
  try {
    _micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    ensureAudioCtx();
    _micSource = actx.createMediaStreamSource(_micStream);
    _micGain = actx.createGain();
    _micGain.gain.value = 0.9;
    _micSource.connect(_micGain);
    _micGain.connect(masterGainNode);
    const btn = $('micBtn');
    if (btn) { btn.classList.add('rec-active'); btn.textContent = '🎤 LIVE'; }
    showBanner('🎤 Mic is live — your voice is mixed into the output and any recording', 'info');
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      showBanner('Microphone access denied — allow mic in your browser settings and try again', 'error');
    } else if (err.name === 'NotFoundError') {
      showBanner('No microphone detected — connect one and try again', 'warn');
    } else {
      showBanner('Mic error: ' + (err.message || err.name), 'error');
    }
  }
}

function stopMic() {
  if (_micStream) { _micStream.getTracks().forEach(t => t.stop()); _micStream = null; }
  if (_micSource) { try { _micSource.disconnect(); } catch (_) {} _micSource = null; }
  if (_micGain)   { try { _micGain.disconnect(); }   catch (_) {} _micGain = null; }
  const btn = $('micBtn');
  if (btn) { btn.classList.remove('rec-active'); btn.textContent = '🎤 MIC'; }
}

// ── Local File Loading ────────────────────────────────────
function loadLocalFile(d) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    _localBlobs.push(url);
    // Strip extension for display title
    const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
    loadTrack(d, url, title, 'Local File');
    showBanner(`Loaded "${title}" → Deck ${d.id}`, 'info');
    input.remove();
  });
  input.click();
}

// ── Library Modal ─────────────────────────────────────────
function showLibrary(deckId) {
  document.getElementById('lib-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'lib-modal';
  modal.className = 'lib-modal-backdrop';

  const tracks = _libraryTracks;
  const deckColor = deckId === 'A' ? '#0088ff' : '#ff6400';
  const deckDarkBg = deckId === 'A' ? '#061838' : '#2a1000';
  const deckBorder = deckId === 'A' ? '#0044aa' : '#662200';

  const rows = tracks.length
    ? tracks.map((t, i) => `
      <div class="lib-row">
        <div class="lib-row-info">
          <div class="lib-row-title">${escHtml(t.title)}</div>
          <div class="lib-row-artist">${escHtml(t.artist)}</div>
        </div>
        <button class="lib-load-btn"
          data-idx="${i}" data-deck="${deckId}"
          style="background:${deckDarkBg};border-color:${deckBorder};color:${deckColor}">
          → Deck ${deckId}
        </button>
      </div>`).join('')
    : `<div class="lib-empty">No tracks available yet.<br>
       Play a track in OK Music, or use the<br>
       "🎚 Deck A / Deck B" buttons on a track page.</div>`;

  modal.innerHTML = `
    <div class="lib-inner">
      <div class="lib-header">
        <span>🎵 MY TRACKS — Load to Deck ${deckId}</span>
        <button class="lib-close-btn" id="libClose">✕</button>
      </div>
      <div class="lib-list">${rows}</div>
    </div>`;

  document.body.appendChild(modal);

  modal.addEventListener('click', e => {
    if (e.target === modal || e.target.id === 'libClose') { modal.remove(); return; }
    const btn = e.target.closest('.lib-load-btn');
    if (!btn) return;
    const t = tracks[+btn.dataset.idx];
    if (!t) return;
    loadTrack(btn.dataset.deck === 'A' ? DA : DB, t.src, t.title, t.artist);
    showBanner(`Loaded "${t.title}" → Deck ${btn.dataset.deck}`, 'info');
    modal.remove();
  });

  // Ask main window for a fresh library snapshot
  BC.postMessage({ type: 'request-library' });
}

// ── Recording / Export ────────────────────────────────────
let _recorder = null, _recChunks = [], _recStart = null, _recInterval = null;
let _recHadMic = false;   // was the mic active when REC started?

function startRecording() {
  if (_recorder && _recorder.state === 'recording') return;
  if (!actx || !mediaDestNode) { showBanner('Load a track first to initialize audio', 'warn'); return; }

  const mimeType = ['audio/webm;codecs=opus','audio/webm','audio/ogg'].find(m => {
    try { return MediaRecorder.isTypeSupported(m); } catch { return false; }
  }) || '';

  _recHadMic = !!_micStream;
  _recChunks = [];
  _recorder = new MediaRecorder(mediaDestNode.stream, mimeType ? { mimeType } : {});
  _recorder.ondataavailable = e => { if (e.data.size > 0) _recChunks.push(e.data); };
  _recorder.onstop = exportRecording;
  _recorder.start(200);

  _recStart = Date.now();
  _recInterval = setInterval(() => {
    const el = $('recTime');
    if (el) {
      const s = Math.floor((Date.now() - _recStart) / 1000);
      el.textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
    }
  }, 500);

  const btn = $('recBtn');
  if (_recHadMic) {
    if (btn) { btn.textContent = '⏹ VOICE MIX'; btn.classList.add('rec-active'); }
    showBanner('🎙 Recording voice mix — sing or speak over the music!', 'info');
  } else {
    if (btn) { btn.textContent = '⏹ STOP'; btn.classList.add('rec-active'); }
    showBanner('⏺ Recording — play your mix!', 'info');
  }
}

function stopRecording() {
  if (!_recorder || _recorder.state !== 'recording') return;
  _recorder.stop();
  clearInterval(_recInterval);
  const btn = $('recBtn');
  if (btn) { btn.textContent = '⏺ REC'; btn.classList.remove('rec-active'); }
  const el = $('recTime'); if (el) el.textContent = '0:00';
}

// ── MP3 Encoder (requires lamejs loaded in page) ──────────
async function convertToMp3(webmBlob, onProgress) {
  if (typeof lamejs === 'undefined') throw new Error('lamejs not loaded');

  // Decode compressed audio to raw PCM
  const arrayBuf = await webmBlob.arrayBuffer();
  const decCtx = new (window.AudioContext || window.webkitAudioContext)();
  let audioBuf;
  try {
    audioBuf = await decCtx.decodeAudioData(arrayBuf);
  } finally {
    decCtx.close().catch(() => {});
  }

  const nch      = Math.min(audioBuf.numberOfChannels, 2);
  const sr       = audioBuf.sampleRate;
  const mp3enc   = new lamejs.Mp3Encoder(nch, sr, 128);   // 128 kbps
  const chunks   = [];
  const BLOCK    = 1152;   // lamejs requires multiples of 1152 samples

  // Float32 [-1,1] → Int16 for lamejs
  const toI16 = f32 => {
    const i16 = new Int16Array(f32.length);
    for (let i = 0; i < f32.length; i++) {
      i16[i] = Math.max(-32768, Math.min(32767, f32[i] * 32767));
    }
    return i16;
  };

  const left  = toI16(audioBuf.getChannelData(0));
  const right = nch > 1 ? toI16(audioBuf.getChannelData(1)) : null;
  const total = left.length;

  // Encode in 50 ms CPU bursts, yielding between bursts so the UI stays responsive
  let pos = 0;
  while (pos < total) {
    const t0 = performance.now();
    while (pos < total && performance.now() - t0 < 50) {
      const lc = left.subarray(pos, pos + BLOCK);
      const enc = right
        ? mp3enc.encodeBuffer(lc, right.subarray(pos, pos + BLOCK))
        : mp3enc.encodeBuffer(lc);
      if (enc.length > 0) chunks.push(new Uint8Array(enc));
      pos += BLOCK;
    }
    if (onProgress) onProgress(pos / total);
    await new Promise(r => setTimeout(r, 0));   // yield to event loop
  }

  const tail = mp3enc.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));

  return new Blob(chunks, { type: 'audio/mpeg' });
}

function exportRecording() {
  if (!_recChunks.length) { showBanner('Nothing recorded', 'warn'); return; }
  const rawType = _recChunks[0].type || 'audio/webm';
  const rawBlob = new Blob(_recChunks, { type: rawType });
  const ts      = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const isVoice = _recHadMic;
  const defaultName = isVoice ? `OK-VoiceMix-${ts}` : `OK-Music-Mix-${ts}`;
  _recChunks = [];

  document.getElementById('save-mix-dialog')?.remove();

  const dialog = document.createElement('div');
  dialog.id = 'save-mix-dialog';
  dialog.innerHTML = `
    <div class="smd-inner">
      <div class="smd-title">${isVoice ? '🎙 Voice Mix' : '🎚 Mix'} — Converting to MP3</div>
      <div class="smd-meta" id="smdMeta">Decoding audio…</div>
      <div class="smd-progress" id="smdProg"><div class="smd-bar" id="smdBar"></div></div>
      <label class="smd-label" id="smdNameLbl" style="display:none">File name</label>
      <input class="smd-name" id="smdName" type="text" value="${defaultName}" spellcheck="false" autocomplete="off" style="display:none" />
      <div class="smd-btns">
        <button class="smd-btn-save" id="smdSave" disabled>💾 Save as MP3</button>
        <button class="smd-btn-discard" id="smdDiscard">Discard</button>
      </div>
      ${isVoice ? '<div class="smd-hint">Your voice + the music are mixed together in this file.</div>' : ''}
    </div>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click', e => { if (e.target === dialog) document.getElementById('smdDiscard')?.click(); });

  let finalBlob = null, finalExt = 'mp3';

  // Kick off async conversion
  (async () => {
    const setBar = w => { const b = document.getElementById('smdBar'); if (b) b.style.width = w + '%'; };
    const setMeta = t => { const m = document.getElementById('smdMeta'); if (m) m.textContent = t; };

    setBar(10);
    setMeta('Decoding audio…');
    try {
      setBar(20);
      finalBlob = await convertToMp3(rawBlob, pct => setBar(20 + pct * 75));
      setBar(100);
      setMeta(`${(finalBlob.size / 1024 / 1024).toFixed(1)} MB · MP3 128 kbps · ready`);
    } catch (err) {
      // lamejs unavailable or decode error — fall back to raw format
      finalBlob = rawBlob;
      finalExt  = rawType.includes('ogg') ? 'ogg' : 'webm';
      setBar(100);
      setMeta(`${(finalBlob.size / 1024 / 1024).toFixed(1)} MB · ${finalExt.toUpperCase()} · ready`);
      const btn = document.getElementById('smdSave');
      if (btn) btn.textContent = `💾 Save as ${finalExt.toUpperCase()}`;
    }

    // Reveal filename field and enable save
    document.getElementById('smdProg').style.display = 'none';
    document.getElementById('smdNameLbl').style.display = '';
    const nameEl = document.getElementById('smdName');
    nameEl.style.display = ''; nameEl.focus(); nameEl.select();
    document.getElementById('smdSave').disabled = false;

    const url = URL.createObjectURL(finalBlob);

    document.getElementById('smdSave').onclick = () => {
      const raw = document.getElementById('smdName')?.value.trim() || defaultName;
      const name = raw.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-');
      const a = document.createElement('a');
      a.href = url; a.download = `${name}.${finalExt}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 20000);
      showBanner(`✅ "${name}.${finalExt}" saved — check Downloads`, 'info');
      dialog.remove();
    };

    document.getElementById('smdDiscard').onclick = () => {
      URL.revokeObjectURL(url);
      dialog.remove();
      showBanner('Recording discarded', 'warn');
    };
  })();

  // Discard wired immediately so user can cancel during conversion
  document.getElementById('smdDiscard').onclick = () => {
    dialog.remove();
    showBanner('Recording discarded', 'warn');
  };
}

// ── Deck Factory ──────────────────────────────────────────
function makeDeck(id) {
  const el = new Audio();
  el.crossOrigin = 'anonymous';
  el.preload = 'auto';
  return {
    id, el,
    source: null, analyser: null,
    bass: null, mid: null, treble: null,
    gainNode: null, faderNode: null, xfNode: null,
    playing: false, loaded: false,
    bpm: null, tempo: 0,
    hotCues: new Array(8).fill(null),
    loopStart: null, loopEnd: null, looping: false,
    cuePoint: 0,
    jogAngle: 0,
    title: '— No Track —', artist: '',
    _tapTimes: [], _lastTap: 0, _cuePreviewing: false,
  };
}

const DA = makeDeck('A');
const DB = makeDeck('B');

function setupDeckAudio(d) {
  if (!actx) return;

  d.source = actx.createMediaElementSource(d.el);
  d.analyser = actx.createAnalyser();
  d.analyser.fftSize = 1024;

  d.bass = actx.createBiquadFilter();
  d.bass.type = 'lowshelf';
  d.bass.frequency.value = 200;
  d.bass.gain.value = 0;

  d.mid = actx.createBiquadFilter();
  d.mid.type = 'peaking';
  d.mid.frequency.value = 1000;
  d.mid.Q.value = 1;
  d.mid.gain.value = 0;

  d.treble = actx.createBiquadFilter();
  d.treble.type = 'highshelf';
  d.treble.frequency.value = 4000;
  d.treble.gain.value = 0;

  d.gainNode = actx.createGain();
  d.gainNode.gain.value = 1;
  d.faderNode = actx.createGain();
  d.faderNode.gain.value = 1;
  d.xfNode = actx.createGain();
  d.xfNode.gain.value = 1;

  // source → analyser → bass → mid → treble → gain → fader → xf → master
  d.source.connect(d.analyser);
  d.analyser.connect(d.bass);
  d.bass.connect(d.mid);
  d.mid.connect(d.treble);
  d.treble.connect(d.gainNode);
  d.gainNode.connect(d.faderNode);
  d.faderNode.connect(d.xfNode);
  d.xfNode.connect(masterGainNode);

  d.el.addEventListener('loadedmetadata', () => {
    d.loaded = true;
    d.cuePoint = 0;
    d.loopStart = null; d.loopEnd = null; d.looping = false;
    updateDeckDisplay(d);
    updateLoopDisplay(d);
  });

  d.el.addEventListener('timeupdate', () => {
    if (d.looping && d.loopEnd !== null && d.el.currentTime >= d.loopEnd) {
      d.el.currentTime = d.loopStart;
    }
    updateTimeDisplay(d);
    updateWaveformPosition(d);
  });

  d.el.addEventListener('ended', () => {
    d.playing = false;
    updatePlayBtn(d);
  });

  // CORS fallback: if crossOrigin fails, retry without it so audio still plays
  d.el.addEventListener('error', () => {
    if (d.el.src && d.el.crossOrigin === 'anonymous') {
      console.warn(`[DJ] CORS failed for deck ${d.id}, retrying without crossOrigin`);
      d.el.crossOrigin = '';
      const src = d.el.src;
      d.el.src = '';
      d.el.src = src;
      d.el.load();
      showBanner(`Deck ${d.id}: EQ/routing limited — audio CDN CORS not enabled`, 'warn');
    }
  });
}

// ── Load Track ────────────────────────────────────────────
function loadTrack(d, src, title, artist, bpm) {
  d.title = title || '— No Track —';
  d.artist = artist || '';
  d.bpm = bpm || null;
  d.playing = false;
  d.loaded = false;
  d.loopStart = null; d.loopEnd = null; d.looping = false;
  d.hotCues = new Array(8).fill(null);
  d.cuePoint = 0;
  d.tempo = 0;
  d._cuePreviewing = false;

  updateDeckDisplay(d);
  updateHotCueButtons(d);
  updateLoopDisplay(d);
  updatePlayBtn(d);

  if (!src) return;

  ensureAudioCtx();
  d.el.crossOrigin = 'anonymous';
  d.el.src = src;
  d.el.load();
  d.el.playbackRate = 1;
  updateTempoPct(d);

  const pitchSl = $(`pitch${d.id}`);
  if (pitchSl) pitchSl.value = 0;
}

// ── Crossfader ────────────────────────────────────────────
let xfPos = 0.5;

function setCrossfader(pos) {
  xfPos = pos;
  if (!DA.xfNode || !DB.xfNode) return;
  // DJ crossfader curve: constant-power
  const aGain = pos <= 0.5 ? 1 : Math.cos((pos - 0.5) * Math.PI);
  const bGain = pos >= 0.5 ? 1 : Math.cos((0.5 - pos) * Math.PI);
  DA.xfNode.gain.setTargetAtTime(aGain, actx.currentTime, 0.01);
  DB.xfNode.gain.setTargetAtTime(bGain, actx.currentTime, 0.01);
}

// ── Transport ─────────────────────────────────────────────
function play(d) {
  ensureAudioCtx();
  if (actx.state === 'suspended') actx.resume();
  d.el.play().then(() => {
    d.playing = true;
    updatePlayBtn(d);
  }).catch(e => showBanner(`Deck ${d.id}: play error — ${e.message}`, 'error'));
}

function pause(d) {
  d.el.pause();
  d.playing = false;
  updatePlayBtn(d);
}

function cueDown(d) {
  if (!d.playing) {
    d.el.currentTime = d.cuePoint;
    play(d);
    d._cuePreviewing = true;
  } else {
    d.cuePoint = d.el.currentTime;
    pause(d);
  }
}

function cueUp(d) {
  if (d._cuePreviewing) {
    d.el.pause();
    d.el.currentTime = d.cuePoint;
    d.playing = false;
    updatePlayBtn(d);
    d._cuePreviewing = false;
  }
}

// ── Pitch / Tempo ─────────────────────────────────────────
function setTempo(d, pct) {
  d.tempo = Math.max(-16, Math.min(16, pct));
  d.el.playbackRate = 1 + d.tempo / 100;
  updateTempoPct(d);
}

// ── EQ ────────────────────────────────────────────────────
function setEQ(d, band, db) {
  if (d[band]) d[band].gain.value = db;
}

// ── Sync ─────────────────────────────────────────────────
function syncDecks(d) {
  const other = d === DA ? DB : DA;
  if (!other.bpm || !d.bpm) { showBanner('Set BPM on both decks to sync', 'warn'); return; }
  const newRate = (other.bpm / d.bpm) * (1 + other.tempo / 100);
  const newTempo = (newRate - 1) * 100;
  setTempo(d, newTempo);
  const pitchSl = $(`pitch${d.id}`);
  if (pitchSl) pitchSl.value = d.tempo;
}

// ── Loop ──────────────────────────────────────────────────
function setLoopIn(d) {
  d.loopStart = d.el.currentTime;
  if (d.loopEnd !== null && d.loopEnd <= d.loopStart) d.loopEnd = null;
  updateLoopDisplay(d);
}

function setLoopOut(d) {
  if (d.loopStart === null) d.loopStart = Math.max(0, d.el.currentTime - 2);
  d.loopEnd = d.el.currentTime;
  if (d.loopEnd <= d.loopStart) d.loopEnd = d.loopStart + 0.5;
  d.looping = true;
  updateLoopDisplay(d);
}

function toggleLoop(d) {
  if (d.loopStart === null || d.loopEnd === null) { showBanner('Set loop in/out first', 'warn'); return; }
  d.looping = !d.looping;
  updateLoopDisplay(d);
}

function autoLoop(d, bars) {
  if (!d.bpm) { showBanner('Set BPM first (TAP button)', 'warn'); return; }
  const barLen = (60 / d.bpm) * 4;
  d.loopStart = d.el.currentTime;
  d.loopEnd = d.loopStart + barLen * bars;
  d.looping = true;
  updateLoopDisplay(d);
}

// ── Hot Cues ──────────────────────────────────────────────
const CUE_COLORS = ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e63'];

function setHotCue(d, idx) {
  if (d.hotCues[idx] !== null) {
    d.el.currentTime = d.hotCues[idx];
    if (!d.playing) play(d);
  } else {
    d.hotCues[idx] = d.el.currentTime;
  }
  updateHotCueButtons(d);
}

function deleteHotCue(d, idx) {
  d.hotCues[idx] = null;
  updateHotCueButtons(d);
}

// ── Beat Jump ─────────────────────────────────────────────
function beatJump(d, beats) {
  const beatLen = d.bpm ? 60 / d.bpm : 0.5;
  d.el.currentTime = Math.max(0, Math.min(d.el.duration || Infinity, d.el.currentTime + beats * beatLen));
}

// ── Tap Tempo ─────────────────────────────────────────────
function tapTempo(d) {
  const now = Date.now();
  if (now - d._lastTap > 2500) d._tapTimes = [];
  d._lastTap = now;
  d._tapTimes.push(now);
  if (d._tapTimes.length > 8) d._tapTimes.shift();
  if (d._tapTimes.length >= 2) {
    const avg = (d._tapTimes[d._tapTimes.length - 1] - d._tapTimes[0]) / (d._tapTimes.length - 1);
    d.bpm = Math.round(60000 / avg * 10) / 10;
    updateDeckDisplay(d);
  }
}

// ── UI Update Functions ───────────────────────────────────
function updatePlayBtn(d) {
  const btn = $(`play${d.id}`);
  if (!btn) return;
  btn.textContent = d.playing ? '⏸' : '▶';
  btn.classList.toggle('active', d.playing);
}

function updateDeckDisplay(d) {
  const t = $(`title${d.id}`), a = $(`artist${d.id}`), b = $(`bpm${d.id}`);
  if (t) t.textContent = d.title;
  if (a) a.textContent = d.artist;
  if (b) b.textContent = d.bpm ? d.bpm.toFixed(1) : '—';
}

function updateTimeDisplay(d) {
  const el = $(`time${d.id}`);
  if (!el) return;
  el.textContent = fmtTime(d.el.currentTime);
}

function updateTempoPct(d) {
  const el = $(`tempo${d.id}`);
  if (el) el.textContent = (d.tempo >= 0 ? '+' : '') + d.tempo.toFixed(1) + '%';
}

function updateLoopDisplay(d) {
  const btn = $(`loopToggle${d.id}`);
  if (!btn) return;
  btn.textContent = d.looping ? 'ON' : 'OFF';
  btn.classList.toggle('loop-on', d.looping);
}

function updateHotCueButtons(d) {
  const grid = $(`hotCues${d.id}`);
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const btn = document.createElement('button');
    const set = d.hotCues[i] !== null;
    btn.className = 'hc-btn' + (set ? ' hc-set' : '');
    btn.textContent = i + 1;
    btn.title = set ? `Cue ${i+1}: ${fmtTime(d.hotCues[i])} (right-click to delete)` : `Set Cue ${i+1}`;
    if (set) {
      btn.title = `Cue ${i+1}: ${fmtTime(d.hotCues[i])} · right-click to delete`;
    }
    btn.addEventListener('click', () => setHotCue(d, i));
    btn.addEventListener('contextmenu', e => { e.preventDefault(); deleteHotCue(d, i); });
    grid.appendChild(btn);
  }
}

// ── Canvas Sizing ─────────────────────────────────────────
function resizeCanvases() {
  ['A', 'B'].forEach(id => {
    const wc = $(`wave${id}`);
    if (wc) wc.width = wc.offsetWidth || 380;
    const jc = $(`jog${id}`);
    if (jc) {
      const s = jc.offsetWidth || 220;
      jc.width = s; jc.height = s;
    }
  });
}
// legacy alias
const resizeWaveformCanvases = resizeCanvases;

// ── Waveform Drawing — spectral frequency bars ────────────
function drawWaveform(d) {
  const canvas = $(`wave${d.id}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const isA = d.id === 'A';

  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#010b12'); bg.addColorStop(1, '#00060c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  if (d.analyser) {
    const freq = new Uint8Array(d.analyser.frequencyBinCount);
    d.analyser.getByteFrequencyData(freq);
    const bars = Math.min(freq.length, 128);
    const bw = W / bars;

    for (let i = 0; i < bars; i++) {
      const v = freq[i] / 255;
      if (v < 0.01) continue;
      const barH = Math.max(1, v * H);
      const frac = i / bars;
      // Color: green-teal (low freq) → blue (high freq)
      const r = isA ? Math.round(frac * 15) : Math.round((1 - frac) * 60);
      const g = Math.round(100 + v * 130);
      const b = Math.round((isA ? 100 + frac * 155 : 80 + v * 100));
      const grad = ctx.createLinearGradient(0, H - barH, 0, H);
      grad.addColorStop(0, `rgba(${r},${g},${b},0.92)`);
      grad.addColorStop(1, `rgba(${r},${Math.round(g*0.4)},${b},0.4)`);
      ctx.fillStyle = grad;
      ctx.fillRect(i * bw, H - barH, Math.max(1, bw - 0.5), barH);
    }

    // Beatgrid markers
    if (d.bpm && d.el.duration) {
      const beatLen = 60 / d.bpm;
      const winDur = 6;
      const startT = d.el.currentTime - winDur * 0.4;
      const beat0 = Math.floor(startT / beatLen);
      ctx.lineWidth = 1;
      for (let b = beat0; b < beat0 + Math.ceil(winDur / beatLen) + 1; b++) {
        const x = ((b * beatLen - startT) / winDur) * W;
        if (x < 0 || x > W) continue;
        ctx.strokeStyle = b % 4 === 0 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
    }
  } else {
    ctx.strokeStyle = isA ? 'rgba(0,100,200,0.35)' : 'rgba(200,80,0,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
  }

  if (d.el.duration) {
    const prog = d.el.currentTime / d.el.duration;
    if (d.loopStart !== null && d.loopEnd !== null) {
      const ls = (d.loopStart / d.el.duration) * W;
      const le = (d.loopEnd  / d.el.duration) * W;
      ctx.fillStyle = 'rgba(0,255,100,0.10)';
      ctx.fillRect(ls, 0, le - ls, H);
      ctx.strokeStyle = 'rgba(0,230,77,0.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ls, 0); ctx.lineTo(ls, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(le, 0); ctx.lineTo(le, H); ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      if (d.hotCues[i] === null) continue;
      const hx = (d.hotCues[i] / d.el.duration) * W;
      ctx.strokeStyle = CUE_COLORS[i]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, H); ctx.stroke();
    }
    // Playhead
    const px = prog * W;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
  }
}

function updateWaveformPosition(d) {
  // Triggered on timeupdate — waveform redraws in anim loop
}

// ── Jog Wheel Drawing — Denon SC6000 style ───────────────
function drawJog(d) {
  const canvas = $(`jog${d.id}`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const S = canvas.width, cx = S / 2, cy = S / 2;
  const RIM = S / 2 - 4;    // outer rim radius
  const PLATTER = RIM - 12; // spinning platter inner radius
  const accent = d.id === 'A' ? '#005aff' : '#ff5a00';
  const accentDim = d.id === 'A' ? 'rgba(0,90,255,0.25)' : 'rgba(255,90,0,0.25)';
  const accentGlow = d.id === 'A' ? 'rgba(0,90,255,0.6)' : 'rgba(255,90,0,0.6)';
  const isPlaying = d.playing && !d._scratching;
  const isScratch = d._scratching;

  ctx.clearRect(0, 0, S, S);

  // ── Chassis background ──────────────────────────────────
  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, RIM);
  bgGrad.addColorStop(0, '#111120');
  bgGrad.addColorStop(1, '#07070f');
  ctx.beginPath(); ctx.arc(cx, cy, RIM, 0, Math.PI * 2);
  ctx.fillStyle = bgGrad; ctx.fill();

  // ── Outer LED ring (glows when playing, pulses when scratching) ──
  const ringAlpha = isScratch ? 1 : (isPlaying ? 0.8 : 0.2);
  const ringGrad = ctx.createRadialGradient(cx, cy, RIM - 6, cx, cy, RIM + 1);
  ringGrad.addColorStop(0, accent + (isScratch ? 'ff' : isPlaying ? 'bb' : '44'));
  ringGrad.addColorStop(1, 'transparent');
  ctx.beginPath(); ctx.arc(cx, cy, RIM + 1, 0, Math.PI * 2);
  ctx.fillStyle = ringGrad; ctx.fill();

  // Outer rim track (dark groove)
  ctx.beginPath(); ctx.arc(cx, cy, RIM, 0, Math.PI * 2);
  ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 16; ctx.stroke();

  // LED ring line
  ctx.beginPath(); ctx.arc(cx, cy, RIM - 3, 0, Math.PI * 2);
  ctx.strokeStyle = isScratch ? accent : (isPlaying ? accent : '#1e1e36');
  ctx.lineWidth = 3;
  ctx.shadowColor = isScratch ? accentGlow : (isPlaying ? accentGlow : 'transparent');
  ctx.shadowBlur = isPlaying || isScratch ? 10 : 0;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // ── Spinning platter ────────────────────────────────────
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(d.jogAngle * Math.PI / 180);

  // Platter surface — dark with faint brushed look
  ctx.beginPath(); ctx.arc(0, 0, PLATTER, 0, Math.PI * 2);
  const platGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, PLATTER);
  platGrad.addColorStop(0, '#14142a');
  platGrad.addColorStop(1, '#0c0c1c');
  ctx.fillStyle = platGrad; ctx.fill();

  // Grooves (vinyl record look)
  for (let ri = PLATTER * 0.25; ri < PLATTER - 4; ri += 4.5) {
    const alpha = 0.12 + (ri / PLATTER) * 0.15;
    ctx.beginPath(); ctx.arc(0, 0, ri, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(80,80,120,${alpha})`;
    ctx.lineWidth = 0.8; ctx.stroke();
  }

  // Sector highlight — like Denon's platter LED sectors
  const sectorCount = 8;
  for (let i = 0; i < sectorCount; i++) {
    const sa = (i / sectorCount) * Math.PI * 2 - Math.PI / 2;
    const ea = sa + (Math.PI * 2 / sectorCount) * 0.55;
    ctx.beginPath();
    ctx.arc(0, 0, PLATTER * 0.7, sa, ea);
    ctx.strokeStyle = i === 0 ? accent + '55' : 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 6; ctx.stroke();
  }

  // Tick marks on outer platter rim
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const isMajor = i % 9 === 0;
    const innerR = PLATTER - (isMajor ? 10 : 5);
    const outerR = PLATTER - 1;
    ctx.strokeStyle = isMajor ? 'rgba(180,180,220,0.6)' : 'rgba(80,80,110,0.4)';
    ctx.lineWidth = isMajor ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
    ctx.lineTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
    ctx.stroke();
  }

  // Position dot (white, at top of platter)
  const dotR = PLATTER - 7;
  ctx.beginPath(); ctx.arc(0, -dotR, 5, 0, Math.PI * 2);
  const dotColor = isScratch ? '#ffffff' : (isPlaying ? accent : 'rgba(180,180,200,0.5)');
  ctx.fillStyle = dotColor;
  if (isPlaying || isScratch) {
    ctx.shadowColor = isPlaying ? accentGlow : '#ffffffaa';
    ctx.shadowBlur = 8;
  }
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();

  // ── Static center hub ───────────────────────────────────
  const hubR = 40;
  const hubGrad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, hubR);
  hubGrad.addColorStop(0, '#20202e');
  hubGrad.addColorStop(1, '#0c0c1a');
  ctx.beginPath(); ctx.arc(cx, cy, hubR, 0, Math.PI * 2);
  ctx.fillStyle = hubGrad; ctx.fill();
  ctx.strokeStyle = '#1e1e30'; ctx.lineWidth = 2; ctx.stroke();

  // Hub inner ring
  ctx.beginPath(); ctx.arc(cx, cy, hubR - 6, 0, Math.PI * 2);
  ctx.strokeStyle = accent + '44'; ctx.lineWidth = 1.5; ctx.stroke();

  // "OK-MUSIC" brand text + deck letter
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (isPlaying || isScratch) {
    ctx.shadowColor = isPlaying ? accentGlow : '#ffffffaa';
    ctx.shadowBlur = 6;
  }
  ctx.fillStyle = isPlaying ? '#cc8800' : (isScratch ? '#ffaa00' : '#3a3a50');
  ctx.font = `700 8px 'Consolas',monospace`;
  ctx.fillText('OK-MUSIC', cx, cy - 7);
  ctx.fillStyle = isPlaying ? accent : (isScratch ? '#ffffff' : '#44445e');
  ctx.font = `900 13px 'Consolas',monospace`;
  ctx.fillText(d.id, cx, cy + 8);
  ctx.shadowBlur = 0;

  // ── Cue point marker on rim ─────────────────────────────
  if (d.el.duration) {
    const cueA = (d.cuePoint / d.el.duration) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.arc(Math.cos(cueA) * (RIM - 8), Math.sin(cueA) * (RIM - 8), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#00e64d';
    ctx.fill();
    ctx.restore();
  }
}

// ── VU Meter Drawing ──────────────────────────────────────
function drawVU(canvasId, analyser, color) {
  const canvas = $(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0d0d18';
  ctx.fillRect(0, 0, W, H);

  if (!analyser) return;

  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  const rms = Math.sqrt(sum / data.length) / 255;

  const segs = 20;
  const segH = Math.floor((H - segs) / segs);
  const lit = Math.round(rms * segs);

  for (let i = 0; i < segs; i++) {
    const y = H - (i + 1) * (segH + 1);
    const on = i < lit;
    if (i >= segs * 0.85) ctx.fillStyle = on ? '#ff2200' : '#200500';
    else if (i >= segs * 0.70) ctx.fillStyle = on ? '#ffaa00' : '#1a0d00';
    else ctx.fillStyle = on ? (color || '#00dd44') : '#0a1a0d';
    ctx.fillRect(2, y, W - 4, segH);
  }
}

// ── Knob Renderer ─────────────────────────────────────────
function makeKnob(canvasId, min, max, defVal, onChange) {
  const canvas = $(canvasId);
  if (!canvas) return { getValue: () => defVal, setValue: () => {} };
  let value = defVal, dragging = false, startY = 0, startV = defVal;

  function draw() {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 3;
    const norm = (value - min) / (max - min);
    const SA = Math.PI * 0.75, EA = Math.PI * 2.25;
    const valA = SA + norm * (EA - SA);
    const midA = (SA + EA) / 2;

    ctx.clearRect(0, 0, W, H);

    // Track
    ctx.beginPath(); ctx.arc(cx, cy, r, SA, EA);
    ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 5;
    ctx.lineCap = 'round'; ctx.stroke();

    // Value arc
    ctx.beginPath();
    if (min < 0) {
      if (value >= 0) ctx.arc(cx, cy, r, midA, valA);
      else { ctx.arc(cx, cy, r, valA, midA); }
    } else {
      ctx.arc(cx, cy, r, SA, valA);
    }
    ctx.strokeStyle = value === 0 && min < 0 ? '#444' : value < 0 ? '#ff4444' : '#0088ff';
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke();

    // Indicator
    const ix = cx + Math.cos(valA) * r * 0.6;
    const iy = cy + Math.sin(valA) * r * 0.6;
    ctx.beginPath(); ctx.arc(ix, iy, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();

    // Center
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#444'; ctx.fill();
  }

  const startDrag = (y) => { dragging = true; startY = y; startV = value; };
  const moveDrag = (y) => {
    if (!dragging) return;
    const dy = startY - y;
    value = Math.max(min, Math.min(max, startV + dy * (max - min) / 150));
    draw(); onChange(value);
  };
  const endDrag = () => { dragging = false; };

  canvas.addEventListener('mousedown', e => { startDrag(e.clientY); e.preventDefault(); });
  document.addEventListener('mousemove', e => moveDrag(e.clientY));
  document.addEventListener('mouseup', endDrag);
  canvas.addEventListener('touchstart', e => { startDrag(e.touches[0].clientY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => { moveDrag(e.touches[0].clientY); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchend', endDrag);
  canvas.addEventListener('dblclick', () => { value = defVal; draw(); onChange(value); });

  draw();
  return {
    getValue: () => value,
    setValue: v => { value = v; draw(); },
  };
}

// ── Jog Wheel Scratch ─────────────────────────────────────
function setupJogScratch(d) {
  const canvas = $(`jog${d.id}`);
  if (!canvas) return;
  let dragging = false, lastAngle = 0;
  let _scratchWasPlaying = false;
  let _velLastT = 0, _velDegPerSec = 0;

  const getAngle = (cx, cy, ex, ey) => Math.atan2(ey - cy, ex - cx) * 180 / Math.PI;
  const coords = e => e.touches
    ? [e.touches[0].clientX, e.touches[0].clientY]
    : [e.clientX, e.clientY];

  const onStart = e => {
    if (!d.loaded) return;
    dragging = true;
    const r = canvas.getBoundingClientRect();
    const [ex, ey] = coords(e);
    lastAngle = getAngle(r.left + r.width / 2, r.top + r.height / 2, ex, ey);
    _scratchWasPlaying = d.playing && !d.el.paused;
    if (_scratchWasPlaying) d.el.playbackRate = 0;
    _velLastT = performance.now();
    _velDegPerSec = 0;
    d._scratching = true;
    canvas.style.cursor = 'grabbing';
    _ensureVinylNoise();
    e.preventDefault();
  };

  const onMove = e => {
    if (!dragging) return;
    const now = performance.now();
    const r = canvas.getBoundingClientRect();
    const [ex, ey] = coords(e);
    const angle = getAngle(r.left + r.width / 2, r.top + r.height / 2, ex, ey);
    let delta = angle - lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    lastAngle = angle;

    // Velocity tracking (degrees / second)
    const dtMs = Math.max(1, now - _velLastT);
    _velDegPerSec = delta / (dtMs / 1000);
    _velLastT = now;

    // Seek: 33.33 RPM ≙ 1.8 s/revolution → 0.005 s/degree
    if (d.el.duration) {
      d.el.currentTime = Math.max(0, Math.min(d.el.duration - 0.01, d.el.currentTime + delta * (1.8 / 360)));
    }

    // Pitch effect — audio rate tracks scratch velocity (200 deg/s = playbackRate 1.0)
    // Only when track was playing; backward scratch stays at 0 (HTML audio can't reverse)
    if (_scratchWasPlaying) {
      d.el.playbackRate = Math.max(0, Math.min(4, _velDegPerSec / 200));
    }

    // Vinyl noise: gain + filter frequency track scratch speed
    if (_vinylNoise && actx) {
      const absVel = Math.abs(_velDegPerSec);
      _vinylNoise.gain.gain.setTargetAtTime(Math.min(0.28, absVel / 750),       actx.currentTime, 0.025);
      _vinylNoise.bpf.frequency.setTargetAtTime(Math.min(2800, 580 + absVel * 1.2), actx.currentTime, 0.025);
    }

    d.jogAngle = (d.jogAngle + delta + 360) % 360;
    if (e.cancelable) e.preventDefault();
  };

  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    d._scratching = false;
    canvas.style.cursor = 'grab';
    // Fade vinyl noise
    if (_vinylNoise && actx) {
      _vinylNoise.gain.gain.setTargetAtTime(0, actx.currentTime, 0.07);
    }
    if (_scratchWasPlaying && d.playing) {
      d.el.playbackRate = 1 + d.tempo / 100;
    } else if (!_scratchWasPlaying) {
      d.el.playbackRate = 0;
    }
  };

  canvas.addEventListener('mousedown',  onStart);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onEnd);
  canvas.addEventListener('touchstart',  onStart, { passive: false });
  document.addEventListener('touchmove', onMove,  { passive: false });
  document.addEventListener('touchend',  onEnd);
}

// ── Animation Loop ────────────────────────────────────────
let animRunning = false;
function startAnimLoop() {
  if (animRunning) return;
  animRunning = true;
  const RPM = 33.33;
  const DEGS_PER_SEC = RPM * 360 / 60;

  let last = performance.now();
  function frame(now) {
    const dt = (now - last) / 1000;
    last = now;
    [DA, DB].forEach(d => {
      // Advance jog spin only when playing and not being scratched by hand
      if (d.playing && !d._scratching) {
        d.jogAngle = (d.jogAngle + DEGS_PER_SEC * dt * (1 + d.tempo / 100)) % 360;
      }
      drawJog(d);
      drawWaveform(d);
      drawVU(`vu${d.id}`, d.analyser, d.id === 'A' ? '#0088ff' : '#ff6600');
    });
    drawVU('vuMaster', masterAnalyser, '#00dd44');
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── BroadcastChannel ──────────────────────────────────────
BC.onmessage = e => {
  const { type, deck, src, title, artist, bpm, tracks } = e.data;
  if (type === 'load-track') {
    loadTrack(deck === 'A' ? DA : DB, src, title, artist, bpm);
  }
  if (type === 'track-library' && Array.isArray(tracks)) {
    _libraryTracks = tracks;
    // Refresh library modal if open
    const modal = document.getElementById('lib-modal');
    if (modal) {
      const pendingDeck = modal.querySelector('.lib-load-btn')?.dataset.deck || 'A';
      modal.remove();
      showLibrary(pendingDeck);
    }
  }
};

window.addEventListener('beforeunload', () => {
  _localBlobs.forEach(u => URL.revokeObjectURL(u));
});

// ── Build Deck UI ─────────────────────────────────────────
function buildDeck(d) {
  $(`play${d.id}`)?.addEventListener('click', () => d.playing ? pause(d) : play(d));

  const cueBtn = $(`cue${d.id}`);
  cueBtn?.addEventListener('mousedown', () => cueDown(d));
  cueBtn?.addEventListener('mouseup', () => cueUp(d));
  cueBtn?.addEventListener('touchstart', e => { cueDown(d); e.preventDefault(); }, { passive: false });
  cueBtn?.addEventListener('touchend', () => cueUp(d));

  $(`sync${d.id}`)?.addEventListener('click', () => syncDecks(d));
  $(`tapTempo${d.id}`)?.addEventListener('click', () => tapTempo(d));

  const pitchSl = $(`pitch${d.id}`);
  pitchSl?.addEventListener('input', () => setTempo(d, parseFloat(pitchSl.value)));
  $(`pitchReset${d.id}`)?.addEventListener('click', () => {
    setTempo(d, 0);
    if (pitchSl) pitchSl.value = 0;
  });

  $(`loopIn${d.id}`)?.addEventListener('click', () => setLoopIn(d));
  $(`loopOut${d.id}`)?.addEventListener('click', () => setLoopOut(d));
  $(`loopToggle${d.id}`)?.addEventListener('click', () => toggleLoop(d));
  $(`autoLoop${d.id}`)?.addEventListener('click', () => {
    const sel = $(`autoLoopSel${d.id}`);
    autoLoop(d, parseFloat(sel?.value || '1'));
  });

  document.querySelectorAll(`[data-deck="${d.id}"][data-beats]`).forEach(btn => {
    btn.addEventListener('click', () => {
      beatJump(d, parseInt(btn.dataset.dir) * parseInt(btn.dataset.beats));
    });
  });

  // EQ knobs
  makeKnob(`trebleKnob${d.id}`, -12, 12, 0, v => setEQ(d, 'treble', v));
  makeKnob(`midKnob${d.id}`, -12, 12, 0, v => setEQ(d, 'mid', v));
  makeKnob(`bassKnob${d.id}`, -12, 12, 0, v => setEQ(d, 'bass', v));
  makeKnob(`gainKnob${d.id}`, 0, 2, 1, v => { if (d.gainNode) d.gainNode.gain.value = v; });

  const faderEl = $(`fader${d.id}`);
  faderEl?.addEventListener('input', () => { if (d.faderNode) d.faderNode.gain.value = parseFloat(faderEl.value); });

  setupJogScratch(d);
  updateHotCueButtons(d);
  drawJog(d);

  // Load from device
  $(`loadFile${d.id}`)?.addEventListener('click', () => loadLocalFile(d));

  // Load from library
  $(`loadLib${d.id}`)?.addEventListener('click', () => showLibrary(d.id));
}

// ── Banner / Toast ────────────────────────────────────────
function showBanner(msg, type = 'info') {
  let el = $('dj-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dj-banner';
    Object.assign(el.style, {
      position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
      padding: '8px 18px', borderRadius: '6px', fontSize: '12px', zIndex: '9999',
      opacity: '0', transition: 'opacity .3s', fontFamily: 'monospace', pointerEvents: 'none',
    });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.background = type === 'error' ? '#5a0a0a' : type === 'warn' ? '#4a3a00' : '#1a2a4a';
  el.style.color = type === 'error' ? '#ff8888' : type === 'warn' ? '#ffcc44' : '#88ccff';
  el.style.border = `1px solid ${type === 'error' ? '#ff4444' : type === 'warn' ? '#ff9900' : '#0088ff'}`;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, 4000);
}

// ── Init ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);

  buildDeck(DA);
  buildDeck(DB);

  // Crossfader
  const cf = $('crossfader');
  cf?.addEventListener('input', () => setCrossfader(parseFloat(cf.value)));

  // Master gain slider
  const mg = $('masterGainSlider');
  mg?.addEventListener('input', () => { if (masterGainNode) masterGainNode.gain.value = parseFloat(mg.value); });

  // Master gain knob
  makeKnob('masterGainKnob', 0, 1.5, 1, v => { if (masterGainNode) masterGainNode.gain.value = v; });

  // Close — broadcast to parent if embedded in iframe, else close popup
  $('btnClose')?.addEventListener('click', () => {
    if (window.parent !== window) {
      BC.postMessage({ type: 'close-request' });
    } else {
      window.close();
    }
  });

  // Mic button
  $('micBtn')?.addEventListener('click', toggleMic);

  // REC / STOP
  $('recBtn')?.addEventListener('click', () => {
    if (_recorder && _recorder.state === 'recording') stopRecording();
    else { ensureAudioCtx(); startRecording(); }
  });

  // First user gesture: init audio context
  const initOnGesture = () => { ensureAudioCtx(); };
  document.addEventListener('click', initOnGesture, { once: true });
  document.addEventListener('keydown', initOnGesture, { once: true });

  // Draw initial frames
  [DA, DB].forEach(d => { drawJog(d); drawWaveform(d); });

  // Announce ready so main window can send pending track + library
  BC.postMessage({ type: 'mixer-ready' });

  // ── Samples panel ─────────────────────────────────────────
  initSamplePads();
  $('samplesBtn')?.addEventListener('click', () => {
    const p = $('samples-panel');
    if (p) p.hidden = !p.hidden;
  });
  $('smpCloseBtn')?.addEventListener('click', () => { const p = $('samples-panel'); if (p) p.hidden = true; });
  $('smpFolderBtn')?.addEventListener('click', openSampleFolder);

  // ── Keyboard shortcuts ────────────────────────────────────
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const n = parseInt(e.key);
    if (n >= 1 && n <= 8) { ensureAudioCtx(); playSample(n - 1); }
  });

  // ── Screen orientation lock (mobile) ─────────────────────
  if (window.screen?.orientation?.lock) {
    window.screen.orientation.lock('landscape').catch(() => {});
  }

  showBanner('DJ Mixer — load tracks (📁/🎵), mix, REC · keys 1–8 play sample pads', 'info');
});
