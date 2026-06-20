/**
 * compress-pdf/script.js — IshuTools.fun Compress PDF v6.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 *
 * Features:
 *   - Drag-and-drop + click + paste upload
 *   - 5 compression modes (screen/low/medium/high/lossless)
 *   - Advanced options: grayscale, strip metadata, remove annotations,
 *     linearize, target size
 *   - SSE real-time progress with 6 step chips
 *   - Sounds from /tools/merge-pdf/sounds/
 *   - Animated SVG reduction ring + size bars
 *   - Canvas confetti on significant reduction
 *   - Animated BG canvas
 *   - FAQ accordion, counter animation, theme toggle, sound toggle
 *   - Ctrl+Enter shortcut
 */

'use strict';

// ══════════════════════════════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════════════════════════════
let FILE      = null;   // File object
let RESULT    = null;   // server response blob URL
let SEL_MODE  = 'screen';
let JOB_ID    = null;
let SSE_ES    = null;
let SIM_TIMER = null;
let SIM_PCT   = 0;
let DL_STEM   = 'compressed';

// Options state
let OPT = {
  grayscale: false,
  stripMeta: false,
  removeAnnot: false,
  linearize: false,
  targetMode: false,
  targetKb: 500,
};

// Sounds
let SOUND_ON   = true;
let SOUND_CACHE = {};
const SND_BASE = '/tools/merge-pdf/sounds/';
const SND = {
  add:      'are_bhai_bhai_bhai.mp3',
  start:    'cameraman_focus_karo.mp3',
  success:  'waah_kya_scene_hai.mp3',
  download: 'fahhhhh.mp3',
  error:    'eh_eh_eh_ehhhhhh.mp3',
  warn:     'jaldi_waha_sa_hato.mp3',
};

function playSound(key) {
  if (!SOUND_ON) return;
  const file = SND[key]; if (!file) return;
  try {
    if (!SOUND_CACHE[key]) {
      SOUND_CACHE[key] = new Audio(SND_BASE + file);
      SOUND_CACHE[key].volume = 0.5;
    }
    SOUND_CACHE[key].currentTime = 0;
    SOUND_CACHE[key].play().catch(() => {});
  } catch (_) {}
}

// ══════════════════════════════════════════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════════════════════════════════════════
let D = {};
function initDom() {
  D = {
    // nav
    soundBtn:   document.getElementById('soundBtn'),
    soundIcon:  document.getElementById('soundIcon'),
    themeBtn:   document.getElementById('themeBtn'),
    themeIcon:  document.getElementById('themeIcon'),
    // file input
    fileInput:  document.getElementById('fileInput'),
    // upload
    dropzone:   document.getElementById('dropzone'),
    browseBtn:  document.getElementById('browseBtn'),
    fileCard:   document.getElementById('fileCard'),
    fileName:   document.getElementById('fileName'),
    fileMeta:   document.getElementById('fileMeta'),
    fileChips:  document.getElementById('fileChips'),
    removeBtn:  document.getElementById('removeBtn'),
    // mode/options/action (shown after file)
    modesWrap:  document.getElementById('modesWrap'),
    advWrap:    document.getElementById('advWrap'),
    actionArea: document.getElementById('actionArea'),
    // advanced panel
    advToggle:  document.getElementById('advToggle'),
    advPanel:   document.getElementById('advPanel'),
    advArrow:   document.getElementById('advArrow'),
    // toggles
    grayscaleTgl: document.getElementById('grayscaleToggle'),
    metaTgl:      document.getElementById('metaToggle'),
    annotTgl:     document.getElementById('annotToggle'),
    linearTgl:    document.getElementById('linearToggle'),
    targetTgl:    document.getElementById('targetToggle'),
    targetSizeRow:document.getElementById('targetSizeRow'),
    targetSizeInp:document.getElementById('targetSizeInput'),
    // compress btn
    compressBtn:  document.getElementById('compressBtn'),
    compBtnIcon:  document.getElementById('compBtnIcon'),
    compBtnText:  document.getElementById('compBtnText'),
    // progress
    progressWrap: document.getElementById('progressWrap'),
    progTitle:    document.getElementById('progTitle'),
    progSub:      document.getElementById('progSub'),
    progPct:      document.getElementById('progPct'),
    progBar:      document.getElementById('progBar'),
    progBarWrap:  document.getElementById('progBarWrap'),
    // chips
    chUpload:   document.getElementById('ch-upload'),
    chAnalyze:  document.getElementById('ch-analyze'),
    chGs:       document.getElementById('ch-gs'),
    chFitz:     document.getElementById('ch-fitz'),
    chPike:     document.getElementById('ch-pike'),
    chDone:     document.getElementById('ch-done'),
    // results
    resultWrap: document.getElementById('resultWrap'),
    resTitle:   document.getElementById('resTitle'),
    resSub:     document.getElementById('resSub'),
    ringFill:   document.getElementById('ringFill'),
    ringNum:    document.getElementById('ringNum'),
    ringSub:    document.getElementById('ringSub'),
    stOrig:     document.getElementById('stOrig'),
    stComp:     document.getElementById('stComp'),
    stSaved:    document.getElementById('stSaved'),
    stEngine:   document.getElementById('stEngine'),
    barOrig:    document.getElementById('barOrig'),
    barComp:    document.getElementById('barComp'),
    barOrigLbl: document.getElementById('barOrigLbl'),
    barCompLbl: document.getElementById('barCompLbl'),
    qualNote:   document.getElementById('qualNote'),
    qualNoteText:document.getElementById('qualNoteText'),
    dlBtn:      document.getElementById('dlBtn'),
    dlBtnText:  document.getElementById('dlBtnText'),
    resetBtn:   document.getElementById('resetBtn'),
    shareBtn:   document.getElementById('shareBtn'),
    // toast
    toastWrap:  document.getElementById('toastWrap'),
    // canvases
    bgCanvas:   document.getElementById('bgCanvas'),
    confCanvas: document.getElementById('confettiCanvas'),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════════
function toast(msg, type = 'info', dur = 3500) {
  const icons = { info:'ℹ️', success:'✅', error:'❌', warn:'⚠️' };
  const el = document.createElement('div');
  el.className = 'cp-toast';
  el.innerHTML = `<span class="cp-toast-ic">${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  D.toastWrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('cp-toast-out');
    setTimeout(() => el.remove(), 350);
  }, dur);
}

// ══════════════════════════════════════════════════════════════════════════
// FILE HANDLING
// ══════════════════════════════════════════════════════════════════════════
function formatBytes(n) {
  if (n < 1024)       return n + ' B';
  if (n < 1024*1024)  return (n/1024).toFixed(1) + ' KB';
  return (n/1024/1024).toFixed(2) + ' MB';
}

function setFile(f) {
  if (!f || f.type !== 'application/pdf') {
    toast('Please choose a valid PDF file.', 'error');
    playSound('error'); return;
  }
  FILE = f;
  DL_STEM = f.name.replace(/\.pdf$/i, '');

  // Show file card
  D.dropzone.hidden = true;
  D.fileCard.hidden = false;
  D.fileName.textContent = f.name;
  D.fileMeta.textContent = `${formatBytes(f.size)} · PDF document`;
  D.fileChips.innerHTML = '';
  addFileChip('📄 PDF', '#6366f1');
  addFileChip(formatBytes(f.size), '#10b981');

  // Show controls
  D.modesWrap.hidden  = false;
  D.advWrap.hidden    = false;
  D.actionArea.hidden = false;

  playSound('add');
  toast('PDF loaded. Choose compression level.', 'success');

  // Fetch analysis
  analyzeFile(f);
}

function addFileChip(label, color) {
  const span = document.createElement('span');
  span.className = 'cp-chip-a';
  span.textContent = label;
  if (color) span.style.color = color;
  D.fileChips.appendChild(span);
}

async function analyzeFile(f) {
  try {
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch('/api/compress-pdf/analyze', { method:'POST', body:fd });
    if (!res.ok) return;
    const data = await res.json();
    if (data.page_count) addFileChip(`${data.page_count} pages`, '#f59e0b');
    if (data.image_count > 0) addFileChip(`${data.image_count} images`, '#ec4899');
    if (data.has_javascript) { addFileChip('Has JS', '#ef4444'); playSound('warn'); toast('PDF contains JavaScript — check Advanced Options to remove it.', 'warn', 4000); }

    // Update mode estimates
    const ests = data.estimated_reductions_by_preset || {};
    for (const [preset, pct] of Object.entries(ests)) {
      const el = document.getElementById(`est-${preset}`);
      if (el && pct > 0) el.textContent = `~${Math.round(pct)}% off`;
    }

    // Auto-select recommended mode based on content
    if (data.content_type === 'text_heavy') {
      selectMode('lossless');
      toast('Text-heavy PDF detected — Lossless preset auto-selected.', 'info');
    }
  } catch (_) {}
}

function removeFile() {
  FILE = null; RESULT = null;
  D.dropzone.hidden = false;
  D.fileCard.hidden = true;
  D.modesWrap.hidden  = true;
  D.advWrap.hidden    = true;
  D.actionArea.hidden = true;
  D.progressWrap.hidden = true;
  D.resultWrap.hidden   = true;
  D.fileInput.value = '';
  // Reset estimates
  ['screen','low','medium','high','lossless'].forEach(m => {
    const el = document.getElementById(`est-${m}`);
    if (el) el.textContent = {screen:'~75–90% off',low:'~55–75% off',medium:'~40–60% off',high:'~20–40% off',lossless:'~5–20% off'}[m];
  });
}

// ══════════════════════════════════════════════════════════════════════════
// MODE SELECTION
// ══════════════════════════════════════════════════════════════════════════
function selectMode(mode) {
  SEL_MODE = mode;
  document.querySelectorAll('.cp-mode').forEach(el => {
    el.classList.toggle('active', el.dataset.mode === mode);
    el.setAttribute('aria-checked', el.dataset.mode === mode ? 'true' : 'false');
  });
}

// ══════════════════════════════════════════════════════════════════════════
// TOGGLE SWITCHES
// ══════════════════════════════════════════════════════════════════════════
function wireToggle(el, key, cb) {
  if (!el) return;
  el.addEventListener('click', () => {
    OPT[key] = !OPT[key];
    el.classList.toggle('on', OPT[key]);
    el.setAttribute('aria-checked', OPT[key] ? 'true' : 'false');
    if (cb) cb(OPT[key]);
  });
  el.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); el.click(); }
  });
}

// ══════════════════════════════════════════════════════════════════════════
// ADVANCED PANEL
// ══════════════════════════════════════════════════════════════════════════
function initAdvancedPanel() {
  if (!D.advToggle) return;
  D.advToggle.addEventListener('click', () => {
    const open = D.advPanel.classList.toggle('open');
    D.advToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  wireToggle(D.grayscaleTgl, 'grayscale');
  wireToggle(D.metaTgl,      'stripMeta');
  wireToggle(D.annotTgl,     'removeAnnot');
  wireToggle(D.linearTgl,    'linearize');
  wireToggle(D.targetTgl,    'targetMode', (on) => {
    if (D.targetSizeRow) D.targetSizeRow.hidden = !on;
  });
  if (D.targetSizeInp) {
    D.targetSizeInp.addEventListener('input', () => {
      OPT.targetKb = parseInt(D.targetSizeInp.value) || 500;
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════
// PROGRESS CHIP HELPERS
// ══════════════════════════════════════════════════════════════════════════
const CHIPS_ORDER = ['chUpload','chAnalyze','chGs','chFitz','chPike','chDone'];

function setChip(key, state) {
  const el = D[key]; if (!el) return;
  el.classList.remove('active','done');
  if (state === 'active') el.classList.add('active');
  if (state === 'done')   el.classList.add('done');
}

function setProgress(pct, title, sub) {
  pct = Math.min(100, Math.max(0, pct));
  D.progBar.style.width = pct + '%';
  D.progPct.textContent = Math.round(pct) + '%';
  if (D.progBarWrap) D.progBarWrap.setAttribute('aria-valuenow', Math.round(pct));
  if (title) D.progTitle.textContent = title;
  if (sub)   D.progSub.textContent   = sub;
  // Activate chip based on pct
  const idx = pct < 10 ? 0 : pct < 25 ? 1 : pct < 50 ? 2 : pct < 70 ? 3 : pct < 90 ? 4 : 5;
  CHIPS_ORDER.forEach((k, i) => {
    setChip(k, i < idx ? 'done' : i === idx ? 'active' : '');
  });
}

// ══════════════════════════════════════════════════════════════════════════
// SIMULATE PROGRESS (fallback while SSE not yet firing)
// ══════════════════════════════════════════════════════════════════════════
function startSim() {
  SIM_PCT = 0;
  SIM_TIMER = setInterval(() => {
    SIM_PCT += Math.random() * 3;
    if (SIM_PCT > 88) { SIM_PCT = 88; clearInterval(SIM_TIMER); }
    setProgress(SIM_PCT);
  }, 350);
}

function stopSim() {
  if (SIM_TIMER) { clearInterval(SIM_TIMER); SIM_TIMER = null; }
}

// ══════════════════════════════════════════════════════════════════════════
// SSE PROGRESS
// ══════════════════════════════════════════════════════════════════════════
function openSSE(jobId) {
  closeSSE();
  try {
    SSE_ES = new EventSource(`/api/progress/${jobId}`);
    SSE_ES.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.pct !== undefined) {
          stopSim();
          setProgress(data.pct, data.title, data.sub);
        }
      } catch (_) {}
    };
    SSE_ES.onerror = () => closeSSE();
  } catch (_) {}
}

function closeSSE() {
  if (SSE_ES) { try { SSE_ES.close(); } catch(_){} SSE_ES = null; }
}

// ══════════════════════════════════════════════════════════════════════════
// COMPRESS
// ══════════════════════════════════════════════════════════════════════════
async function doCompress() {
  if (!FILE) { toast('Please upload a PDF first.', 'warn'); return; }

  // UI: show progress
  D.compressBtn.disabled = true;
  D.progressWrap.hidden  = false;
  D.resultWrap.hidden    = true;
  CHIPS_ORDER.forEach(k => setChip(k, ''));
  setProgress(0, 'Uploading PDF…', 'Sending to server…');

  // Generate job ID
  JOB_ID = 'cp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);

  // Start SSE + sim
  openSSE(JOB_ID);
  startSim();
  playSound('start');

  // Build form data
  const fd = new FormData();
  fd.append('file', FILE);
  fd.append('quality', SEL_MODE);
  fd.append('job_id', JOB_ID);
  fd.append('grayscale',          OPT.grayscale  ? '1' : '0');
  fd.append('strip_metadata',     OPT.stripMeta  ? '1' : '0');
  fd.append('remove_annotations', OPT.removeAnnot? '1' : '0');
  fd.append('linearize',          OPT.linearize  ? '1' : '0');
  if (OPT.targetMode && OPT.targetKb > 0) {
    fd.append('target_size_kb', OPT.targetKb);
  }

  try {
    const resp = await fetch('/api/compress-pdf', { method:'POST', body:fd });

    stopSim(); closeSSE();

    if (!resp.ok) {
      let msg = `Server error ${resp.status}`;
      try { const j = await resp.json(); msg = j.error || msg; } catch(_){}
      throw new Error(msg);
    }

    // Parse headers
    const origKb   = parseFloat(resp.headers.get('X-Original-Size-KB')  || '0');
    const compKb   = parseFloat(resp.headers.get('X-Compressed-Size-KB')|| '0');
    const reductPct= parseFloat(resp.headers.get('X-Reduction-Pct')     || '0');
    const method   = resp.headers.get('X-Method-Used') || 'multi-engine';
    const procMs   = resp.headers.get('X-Processing-Ms');

    // Get blob
    const blob = await resp.blob();
    RESULT = URL.createObjectURL(blob);

    setProgress(100, 'Compression complete!', 'Ready to download');
    CHIPS_ORDER.forEach(k => setChip(k,'done'));

    // Show results
    setTimeout(() => {
      D.progressWrap.hidden = true;
      showResults(origKb, compKb, reductPct, method, procMs);
    }, 600);

  } catch (err) {
    stopSim(); closeSSE();
    setProgress(0, 'Compression failed', err.message || 'Unknown error');
    CHIPS_ORDER.forEach(k => setChip(k,''));
    toast('Compression failed: ' + (err.message || 'Unknown error'), 'error', 5000);
    playSound('error');
    D.compressBtn.disabled = false;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SHOW RESULTS
// ══════════════════════════════════════════════════════════════════════════
function showResults(origKb, compKb, reductPct, method, procMs) {
  D.resultWrap.hidden = false;
  playSound('success');

  // Header
  const emoji = reductPct >= 70 ? '🎉' : reductPct >= 40 ? '✅' : reductPct >= 10 ? '📉' : '📄';
  D.resTitle.textContent = `${emoji} Compressed! ${Math.round(reductPct)}% Smaller`;
  D.resSub.textContent   = procMs ? `Done in ${(procMs/1000).toFixed(1)}s` : 'Done!';

  // Stats
  const savedKb = origKb - compKb;
  D.stOrig.textContent   = origKb > 1024 ? (origKb/1024).toFixed(2)+' MB' : origKb.toFixed(1)+' KB';
  D.stComp.textContent   = compKb > 1024 ? (compKb/1024).toFixed(2)+' MB' : compKb.toFixed(1)+' KB';
  D.stSaved.textContent  = savedKb > 0 ? (savedKb > 1024 ? (savedKb/1024).toFixed(2)+' MB' : savedKb.toFixed(1)+' KB') + ' saved' : 'No change';
  D.stEngine.textContent = method;

  // Ring
  const circumf = 301.6;
  const offset  = circumf * (1 - reductPct / 100);
  D.ringFill.style.strokeDashoffset = Math.max(0, offset);
  animateNum(D.ringNum, 0, Math.round(reductPct), 1300, '%');
  D.ringSub.textContent = `${origKb.toFixed(0)} KB → ${compKb.toFixed(0)} KB`;

  // Bars
  const ratio = origKb > 0 ? compKb / origKb : 0;
  D.barOrig.style.width = '100%';
  D.barComp.style.width = Math.round(ratio * 100) + '%';
  D.barOrigLbl.textContent = origKb > 1024 ? (origKb/1024).toFixed(2)+' MB' : origKb.toFixed(1)+' KB';
  D.barCompLbl.textContent = compKb > 1024 ? (compKb/1024).toFixed(2)+' MB' : compKb.toFixed(1)+' KB';

  // Quality note
  const noteMap = {
    screen:   'Screen preset (72 DPI) — images were downsampled for maximum size reduction.',
    low:      'Low preset (96 DPI) — good for email. Small file with acceptable image quality.',
    medium:   'Medium preset (150 DPI) — balanced. Recommended for most documents.',
    high:     'High preset (200 DPI) — near-lossless quality with solid compression.',
    lossless: 'Lossless preset — no image quality change. Only PDF structure was optimized.',
  };
  D.qualNoteText.textContent = noteMap[SEL_MODE] || 'Compression complete.';

  // Download button
  const dlName = DL_STEM + '_compressed.pdf';
  D.dlBtnText.textContent = `Download (${compKb.toFixed(0)} KB)`;
  D.dlBtn.onclick = () => {
    const a = document.createElement('a');
    a.href = RESULT; a.download = dlName;
    a.click();
    playSound('download');
    toast(`Downloaded: ${dlName}`, 'success');
  };

  // Confetti for big reductions
  if (reductPct >= 30) launchConfetti();

  D.compressBtn.disabled = false;
  D.resultWrap.scrollIntoView({ behavior:'smooth', block:'start' });
}

function animateNum(el, from, to, dur, sfx = '') {
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (to - from) * ease) + sfx;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ══════════════════════════════════════════════════════════════════════════
// CONFETTI
// ══════════════════════════════════════════════════════════════════════════
function launchConfetti() {
  if (typeof confetti === 'function') {
    const opts = { particleCount:80, spread:70, origin:{y:.55}, colors:['#10b981','#34d399','#6ee7b7','#059669','#d1fae5'] };
    confetti(opts);
    setTimeout(() => confetti({ ...opts, origin:{x:.2,y:.6} }), 350);
    setTimeout(() => confetti({ ...opts, origin:{x:.8,y:.6} }), 650);
  } else {
    // CSS fallback
    const canvas = D.confCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = Array.from({length:80}, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height * 0.5,
      vx:(Math.random()-.5)*4,
      vy:(Math.random()*3+1),
      r: Math.random()*5+3,
      c:`hsl(${140+Math.random()*30},80%,${50+Math.random()*20}%)`,
      a:1,
    }));
    function draw() {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      let alive = false;
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.a -= .012;
        if (p.a > 0) { alive = true; }
        ctx.globalAlpha = Math.max(0,p.a);
        ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (alive) requestAnimationFrame(draw);
      else ctx.clearRect(0,0,canvas.width,canvas.height);
    }
    requestAnimationFrame(draw);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// RESET
// ══════════════════════════════════════════════════════════════════════════
function reset() {
  if (RESULT) { URL.revokeObjectURL(RESULT); RESULT = null; }
  stopSim(); closeSSE();
  D.progressWrap.hidden = true;
  D.resultWrap.hidden   = true;
  removeFile();
  window.scrollTo({ top:0, behavior:'smooth' });
}

// ══════════════════════════════════════════════════════════════════════════
// BG CANVAS
// ══════════════════════════════════════════════════════════════════════════
function initBgCanvas() {
  const canvas = D.bgCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const DOTS = [];
  const N = 55;
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize, {passive:true});
  for (let i = 0; i < N; i++) {
    DOTS.push({
      x:  Math.random() * innerWidth,
      y:  Math.random() * innerHeight,
      vx: (Math.random()-.5)*0.35,
      vy: (Math.random()-.5)*0.35,
      r:  Math.random()*2+.5,
      a:  Math.random()*.6+.2,
    });
  }
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    DOTS.forEach(d => {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0) d.x = canvas.width;
      if (d.x > canvas.width)  d.x = 0;
      if (d.y < 0) d.y = canvas.height;
      if (d.y > canvas.height) d.y = 0;
      ctx.beginPath();
      ctx.arc(d.x,d.y,d.r,0,Math.PI*2);
      ctx.fillStyle = `rgba(16,185,129,${d.a})`;
      ctx.fill();
    });
    // lines
    for (let i = 0; i < DOTS.length; i++) {
      for (let j = i+1; j < DOTS.length; j++) {
        const dx = DOTS[i].x-DOTS[j].x, dy = DOTS[i].y-DOTS[j].y;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(DOTS[i].x,DOTS[i].y);
          ctx.lineTo(DOTS[j].x,DOTS[j].y);
          ctx.strokeStyle = `rgba(16,185,129,${0.08*(1-dist/120)})`;
          ctx.lineWidth = .5;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

// ══════════════════════════════════════════════════════════════════════════
// COUNTERS
// ══════════════════════════════════════════════════════════════════════════
function initCounters() {
  const els = document.querySelectorAll('.cp-cnt-num[data-count]');
  if (!els.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const el    = entry.target;
      const target= parseFloat(el.dataset.count);
      const sfx   = el.dataset.sfx || '';
      const dur   = 1600;
      const start = performance.now();
      const isFloat = String(target).includes('.');
      function step(now) {
        const t = Math.min((now - start)/dur, 1);
        const ease = 1-(1-t)**3;
        const val = target * ease;
        el.textContent = (isFloat ? val.toFixed(1) : Math.round(val)) + sfx;
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }, { threshold:.5 });
  els.forEach(el => io.observe(el));
}

// ══════════════════════════════════════════════════════════════════════════
// FAQ ACCORDION
// ══════════════════════════════════════════════════════════════════════════
function initFaq() {
  document.querySelectorAll('.cp-fq').forEach(btn => {
    btn.addEventListener('click', () => {
      const faq = btn.closest('.cp-faq');
      const wasOpen = faq.classList.contains('open');
      document.querySelectorAll('.cp-faq.open').forEach(f => f.classList.remove('open'));
      if (!wasOpen) faq.classList.add('open');
      btn.setAttribute('aria-expanded', !wasOpen ? 'true' : 'false');
    });
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
    });
  });
}

// ══════════════════════════════════════════════════════════════════════════
// THEME
// ══════════════════════════════════════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('cpTheme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
  if (!D.themeBtn) return;
  D.themeBtn.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('cpTheme', next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  if (!D.themeIcon) return;
  D.themeIcon.className = theme === 'dark' ? 'fa fa-moon' : 'fa fa-sun';
}

// ══════════════════════════════════════════════════════════════════════════
// SOUND TOGGLE
// ══════════════════════════════════════════════════════════════════════════
function initSoundToggle() {
  SOUND_ON = localStorage.getItem('cpSound') !== '0';
  updateSoundIcon();
  if (!D.soundBtn) return;
  D.soundBtn.addEventListener('click', () => {
    SOUND_ON = !SOUND_ON;
    localStorage.setItem('cpSound', SOUND_ON ? '1' : '0');
    updateSoundIcon();
    if (SOUND_ON) playSound('add');
  });
}

function updateSoundIcon() {
  if (!D.soundIcon) return;
  D.soundIcon.className = SOUND_ON ? 'fa fa-volume-high' : 'fa fa-volume-xmark';
}

// ══════════════════════════════════════════════════════════════════════════
// SHARE
// ══════════════════════════════════════════════════════════════════════════
function initShare() {
  if (!D.shareBtn) return;
  D.shareBtn.addEventListener('click', async () => {
    const url  = 'https://ishutools.fun/tools/compress-pdf/';
    const text = 'Free PDF compressor — up to 90% reduction, no signup! By Ishu Kumar';
    if (navigator.share) {
      try { await navigator.share({ title:'IshuTools Compress PDF', text, url }); } catch(_){}
    } else {
      try { await navigator.clipboard.writeText(url); toast('Link copied!', 'success'); } catch(_){}
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════
// GSAP ENTRANCE ANIMATIONS (if available)
// ══════════════════════════════════════════════════════════════════════════
function initGsap() {
  if (typeof gsap === 'undefined') return;
  gsap.from('.cp-hero-compact', { y:20, opacity:0, duration:.6, ease:'power2.out' });
  gsap.from('.cp-dz',           { y:24, opacity:0, duration:.7, delay:.15, ease:'power2.out' });
  gsap.from('.cp-marquee-strip',{ opacity:0, duration:.5, delay:.4 });
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN INIT (DOMContentLoaded)
// ══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initDom();
  initBgCanvas();
  initTheme();
  initSoundToggle();
  initAdvancedPanel();
  initFaq();
  initCounters();
  initShare();

  // ── File input (hidden) ──
  D.fileInput.addEventListener('change', () => {
    if (D.fileInput.files[0]) setFile(D.fileInput.files[0]);
  });

  // ── Browse button ──
  D.browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    D.fileInput.click();
  });

  // ── Drop zone click (NOT browseBtn — handled above) ──
  D.dropzone.addEventListener('click', (e) => {
    if (e.target === D.browseBtn || D.browseBtn.contains(e.target)) return;
    D.fileInput.click();
  });

  // ── Keyboard on dropzone ──
  D.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
  });

  // ── Drag-and-drop ──
  D.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); D.dropzone.classList.add('drag-over'); });
  D.dropzone.addEventListener('dragleave', ()  => D.dropzone.classList.remove('drag-over'));
  D.dropzone.addEventListener('drop', (e)       => {
    e.preventDefault(); D.dropzone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  });
  document.body.addEventListener('dragover', (e) => e.preventDefault());
  document.body.addEventListener('drop',     (e) => e.preventDefault());

  // ── Paste ──
  document.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find(i => i.type === 'application/pdf');
    if (item) setFile(item.getAsFile());
  });

  // ── Remove file ──
  D.removeBtn.addEventListener('click', removeFile);

  // ── Mode cards ──
  document.querySelectorAll('.cp-mode').forEach(el => {
    el.addEventListener('click',   () => selectMode(el.dataset.mode));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMode(el.dataset.mode); }
    });
  });

  // ── Compress button ──
  D.compressBtn.addEventListener('click', doCompress);

  // ── Reset / Compress Another ──
  if (D.resetBtn) D.resetBtn.addEventListener('click', reset);

  // ── Keyboard shortcut: Ctrl+Enter ──
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && FILE && !D.compressBtn.disabled) {
      e.preventDefault(); doCompress();
    }
    if (e.key === 'Escape' && D.resultWrap && !D.resultWrap.hidden) reset();
  });

  // ── GSAP (with timeout to let defer load) ──
  setTimeout(initGsap, 200);

  // Select default mode
  selectMode('screen');
});
