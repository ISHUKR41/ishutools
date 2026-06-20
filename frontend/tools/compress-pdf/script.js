/**
 * compress-pdf/script.js — IshuTools.fun v11.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 *
 * Features:
 *  - Drag-drop / click / paste upload — upload zone always first
 *  - 5 compression modes (screen/low/medium/high/lossless)
 *  - Advanced options: grayscale, strip metadata, annotations,
 *    linearize, remove JS, embedded files, forms, target size, password
 *  - SSE real-time progress with 6 step chips
 *  - 7-engine pipeline status display
 *  - Animated SVG reduction ring + size bars
 *  - Canvas confetti on significant reduction (>30%)
 *  - Animated BG canvas with particles
 *  - Drop zone floating particles
 *  - FAQ accordion (keyboard accessible)
 *  - Counter animation (IntersectionObserver)
 *  - Theme toggle (dark/light)
 *  - Sound toggle (sounds from merge-pdf/sounds folder)
 *  - Ctrl+Enter shortcut
 *  - Download filename = original stem + "_compressed.pdf"
 *  - fahhhhh.mp3 on download
 *  - Advanced options count badge
 *  - Share button (Web Share API / clipboard fallback)
 *  - Grade system: S/A/B/C/D based on reduction %
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════════════ */
let FILE     = null;   // File object
let RESULT   = null;   // Blob URL for download
let SEL_MODE = 'medium';
let JOB_ID   = null;
let SSE_ES   = null;
let SIM_TIMER = null;
let SIM_PCT  = 0;
let DL_STEM  = 'compressed';
let _compStartTime = 0;

// Advanced options state
let OPT = {
  grayscale:     false,
  stripMeta:     false,
  removeAnnot:   false,
  linearize:     false,
  removeJs:      false,
  removeEmbed:   false,
  removeForms:   false,
  targetMode:    false,
  targetKb:      500,
  pwMode:        false,
  password:      '',
};

// Sounds
let SOUND_ON    = true;
let SOUND_CACHE = {};
const SND_BASE  = '/tools/merge-pdf/sounds/';
const SND = {
  add:      'are_bhai_bhai_bhai.mp3',
  start:    'cameraman_focus_karo.mp3',
  success:  'waah_kya_scene_hai.mp3',
  download: 'fahhhhh.mp3',
  error:    'eh_eh_eh_ehhhhhh.mp3',
  warn:     'jaldi_waha_sa_hato.mp3',
};

function S(key) {
  if (!SOUND_ON) return;
  const file = SND[key];
  if (!file) return;
  try {
    if (!SOUND_CACHE[key]) {
      SOUND_CACHE[key] = new Audio(SND_BASE + file);
      SOUND_CACHE[key].volume = 0.55;
    }
    const a = SOUND_CACHE[key];
    a.currentTime = 0;
    a.play().catch(() => {});
  } catch (_) {}
}

/* ═══════════════════════════════════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════════════════════════════════ */
let D = null;

function initDom() {
  D = {
    // nav controls
    soundBtn:     document.getElementById('soundBtn'),
    soundIcon:    document.getElementById('soundIcon'),
    themeBtn:     document.getElementById('themeBtn'),
    themeIcon:    document.getElementById('themeIcon'),
    // file input (hidden)
    fileInput:    document.getElementById('fileInput'),
    // upload zone
    dropzone:     document.getElementById('dropzone'),
    browseBtn:    document.getElementById('browseBtn'),
    dzDragMsg:    document.getElementById('dzDragMsg'),
    dzParticles:  document.getElementById('dzParticles'),
    // file card
    fileCard:     document.getElementById('fileCard'),
    fileCardInner:document.getElementById('fileCardInner'),
    fileName:     document.getElementById('fileName'),
    fileMeta:     document.getElementById('fileMeta'),
    fileChips:    document.getElementById('fileChips'),
    removeBtn:    document.getElementById('removeBtn'),
    // analyze bar
    analyzeBar:   document.getElementById('analyzeBar'),
    // modes
    modesSection: document.getElementById('modesSection'),
    // advanced
    advSection:   document.getElementById('advSection'),
    advToggle:    document.getElementById('advToggle'),
    advPanel:     document.getElementById('advPanel'),
    advArrow:     document.getElementById('advArrow'),
    advCount:     document.getElementById('advCount'),
    // toggles
    gsTgl:        document.getElementById('grayscaleToggle'),
    metaTgl:      document.getElementById('metaToggle'),
    annotTgl:     document.getElementById('annotToggle'),
    linearTgl:    document.getElementById('linearToggle'),
    jsTgl:        document.getElementById('jsToggle'),
    embedTgl:     document.getElementById('embedToggle'),
    formsTgl:     document.getElementById('formsToggle'),
    targetTgl:    document.getElementById('targetToggle'),
    targetSizeRow:document.getElementById('targetSizeRow'),
    targetSizeInp:document.getElementById('targetSizeInput'),
    pwTgl:        document.getElementById('pwToggle'),
    passwordRow:  document.getElementById('passwordRow'),
    passwordInp:  document.getElementById('passwordInput'),
    // action
    actionArea:   document.getElementById('actionArea'),
    compressBtn:  document.getElementById('compressBtn'),
    compBtnIcon:  document.getElementById('compBtnIcon'),
    compBtnText:  document.getElementById('compBtnText'),
    // progress
    progressSection: document.getElementById('progressSection'),
    progTitle:    document.getElementById('progTitle'),
    progSub:      document.getElementById('progSub'),
    progPct:      document.getElementById('progPct'),
    progBar:      document.getElementById('progBar'),
    progGlow:     document.getElementById('progGlow'),
    progBarWrap:  document.getElementById('progBarWrap'),
    engineBar:    document.getElementById('engineBar'),
    ebLabel:      document.getElementById('ebLabel'),
    ebEngines:    document.getElementById('ebEngines'),
    // chips
    chUpload:     document.getElementById('ch-upload'),
    chAnalyze:    document.getElementById('ch-analyze'),
    chGs:         document.getElementById('ch-gs'),
    chFitz:       document.getElementById('ch-fitz'),
    chPike:       document.getElementById('ch-pike'),
    chDone:       document.getElementById('ch-done'),
    // result
    resultSection:document.getElementById('resultSection'),
    resIcon:      document.getElementById('resIcon'),
    resTitle:     document.getElementById('resTitle'),
    resSub:       document.getElementById('resSub'),
    resGrade:     document.getElementById('resGrade'),
    ringFill:     document.getElementById('ringFill'),
    ringNum:      document.getElementById('ringNum'),
    ringSub:      document.getElementById('ringSub'),
    stOrig:       document.getElementById('stOrig'),
    stComp:       document.getElementById('stComp'),
    stSaved:      document.getElementById('stSaved'),
    stEngine:     document.getElementById('stEngine'),
    stTime:       document.getElementById('stTime'),
    barOrig:      document.getElementById('barOrig'),
    barComp:      document.getElementById('barComp'),
    barOrigLbl:   document.getElementById('barOrigLbl'),
    barCompLbl:   document.getElementById('barCompLbl'),
    qualNote:     document.getElementById('qualNote'),
    qualNoteText: document.getElementById('qualNoteText'),
    dlBtn:        document.getElementById('dlBtn'),
    dlBtnText:    document.getElementById('dlBtnText'),
    resetBtn:     document.getElementById('resetBtn'),
    shareBtn:     document.getElementById('shareBtn'),
    // toasts
    toastWrap:    document.getElementById('toastWrap'),
    // canvas
    bgCanvas:     document.getElementById('bgCanvas'),
    // FAQ
    faqList:      document.getElementById('faqList'),
    // counters
    counters:     document.querySelectorAll('.cp-cnt-num[data-count]'),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════════════════ */
function toast(msg, type = 'info', dur = 3500) {
  if (!D || !D.toastWrap) return;
  const icons = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' };
  const el = document.createElement('div');
  el.className = 'cp-toast';
  el.innerHTML = `<span class="cp-toast-ic">${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  D.toastWrap.appendChild(el);
  setTimeout(() => {
    el.classList.add('cp-toast-out');
    setTimeout(() => el.remove(), 380);
  }, dur);
}

/* ═══════════════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════════════ */
function formatBytes(n) {
  if (n < 1024)            return n + ' B';
  if (n < 1024 * 1024)    return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024**3)        return (n / 1024 / 1024).toFixed(2) + ' MB';
  return (n / 1024**3).toFixed(2) + ' GB';
}

function formatMs(ms) {
  if (ms < 1000) return ms + ' ms';
  return (ms / 1000).toFixed(1) + 's';
}

function addChip(label, color) {
  if (!D || !D.fileChips) return;
  const span = document.createElement('span');
  span.className = 'cp-chip-a';
  span.textContent = label;
  if (color) span.style.color = color;
  D.fileChips.appendChild(span);
}

function updateAdvCount() {
  const active = Object.values(OPT).filter(v => v === true).length;
  if (!D || !D.advCount) return;
  if (active > 0) {
    D.advCount.textContent = active + ' enabled';
    D.advCount.hidden = false;
  } else {
    D.advCount.hidden = true;
  }
}

function gradeFromPct(pct) {
  if (pct >= 70) return 'S';
  if (pct >= 50) return 'A';
  if (pct >= 30) return 'B';
  if (pct >= 15) return 'C';
  return 'D';
}

/* ═══════════════════════════════════════════════════════════════════════
   BACKGROUND CANVAS
═══════════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = D.bgCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];
  const DARK = document.documentElement.getAttribute('data-theme') !== 'light';

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.8 + .4,
      vx: (Math.random() - .5) * .35,
      vy: (Math.random() - .5) * .35,
      alpha: Math.random() * .45 + .05,
      hue: 150 + Math.random() * 30,
    };
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  particles = Array.from({ length: 90 }, mkParticle);

  let raf;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = isDark
        ? `hsla(${p.hue},80%,60%,${p.alpha})`
        : `hsla(${p.hue},65%,40%,${p.alpha * .5})`;
      ctx.fill();
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    });
    raf = requestAnimationFrame(draw);
  }
  draw();
}

/* ═══════════════════════════════════════════════════════════════════════
   DROP ZONE PARTICLES
═══════════════════════════════════════════════════════════════════════ */
function initDzParticles() {
  const wrap = D.dzParticles;
  if (!wrap) return;
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'cp-dz-part';
    p.style.cssText = `
      left:${10 + Math.random() * 80}%;
      top:${20 + Math.random() * 60}%;
      --dur:${2.5 + Math.random() * 2}s;
      --delay:${Math.random() * 3}s;
      width:${3 + Math.random() * 4}px;
      height:${3 + Math.random() * 4}px;
      opacity:0;
    `;
    wrap.appendChild(p);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   FILE HANDLING
═══════════════════════════════════════════════════════════════════════ */
function setFile(f) {
  if (!f) return;
  if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
    toast('Please upload a valid PDF file (.pdf)', 'error');
    S('error');
    return;
  }

  FILE    = f;
  RESULT  = null;
  DL_STEM = f.name.replace(/\.pdf$/i, '');

  // Hide dropzone, show file card
  D.dropzone.hidden    = true;
  D.fileCard.hidden    = false;
  D.analyzeBar.hidden  = false;

  D.fileName.textContent = f.name;
  D.fileMeta.textContent = `${formatBytes(f.size)} · PDF Document`;
  D.fileChips.innerHTML  = '';
  addChip('📄 PDF', '#6366f1');
  addChip(formatBytes(f.size), '#10b981');
  if (f.size > 50 * 1024 * 1024) addChip('Large file', '#f59e0b');

  // Show controls
  D.modesSection.hidden = false;
  D.advSection.hidden   = false;
  D.actionArea.hidden   = false;

  // Hide result/progress from previous run
  D.resultSection.hidden   = true;
  D.progressSection.hidden = true;

  S('add');
  toast('PDF loaded — choose compression level below', 'success', 2500);

  // Analyze file asynchronously
  analyzeFile(f);
}

async function analyzeFile(f) {
  try {
    const fd = new FormData();
    fd.append('file', f);
    const res = await fetch('/api/compress-pdf/analyze', { method: 'POST', body: fd });
    D.analyzeBar.hidden = true;

    if (!res.ok) return;
    const data = await res.json();

    // Chips
    if (data.page_count)   addChip(`${data.page_count} pages`, '#6366f1');
    if (data.image_count > 0) addChip(`${data.image_count} imgs`, '#ec4899');
    if (data.has_javascript)  {
      addChip('Has JS', '#ef4444');
      S('warn');
      toast('PDF contains JavaScript — enable "Remove JavaScript" in Advanced Options', 'warn', 5000);
    }
    if (data.has_forms)    addChip('Has Forms', '#f97316');
    if (data.has_encryption) {
      addChip('Encrypted', '#f59e0b');
      toast('This PDF is encrypted — enter the password in Advanced Options', 'warn', 5000);
    }

    // Update mode estimates
    const ests = data.estimated_reductions_by_preset || {};
    for (const [preset, pct] of Object.entries(ests)) {
      const el = document.getElementById(`est-${preset}`);
      if (el && pct > 0) el.textContent = `~${Math.round(pct)}% smaller`;
    }

    // Auto recommend mode
    const ct = data.content_type || 'mixed';
    if (ct === 'text_heavy') {
      selectMode('lossless');
      toast('Text-heavy PDF — Lossless preset auto-selected for best quality', 'info');
    } else if (ct === 'scanned') {
      selectMode('low');
      toast('Scanned PDF detected — Low preset recommended for best compression', 'info');
    }

  } catch (_) {
    if (D.analyzeBar) D.analyzeBar.hidden = true;
  }
}

function removeFile() {
  FILE   = null;
  RESULT = null;
  closeSSE();

  D.dropzone.hidden      = false;
  D.fileCard.hidden      = true;
  D.analyzeBar.hidden    = true;
  D.modesSection.hidden  = true;
  D.advSection.hidden    = true;
  D.actionArea.hidden    = true;
  D.progressSection.hidden = true;
  D.resultSection.hidden   = true;
  D.fileInput.value        = '';

  // Reset estimates
  const defaults = {
    screen:'~75–90% smaller', low:'~55–75% smaller',
    medium:'~40–60% smaller', high:'~20–45% smaller', lossless:'~5–25% smaller'
  };
  for (const [k, v] of Object.entries(defaults)) {
    const el = document.getElementById(`est-${k}`);
    if (el) el.textContent = v;
  }

  // Reset progress bar
  setProgress(0, 'Compressing…', 'Starting 7-engine pipeline');
  resetChips();
}

/* ═══════════════════════════════════════════════════════════════════════
   MODE SELECTION
═══════════════════════════════════════════════════════════════════════ */
function selectMode(mode) {
  SEL_MODE = mode;
  document.querySelectorAll('.cp-mode').forEach(el => {
    const active = el.dataset.mode === mode;
    el.classList.toggle('active', active);
    el.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   TOGGLE SWITCHES
═══════════════════════════════════════════════════════════════════════ */
function wireToggle(el, optKey, cb) {
  if (!el) return;
  const toggle = () => {
    OPT[optKey] = !OPT[optKey];
    el.classList.toggle('on', OPT[optKey]);
    el.setAttribute('aria-checked', OPT[optKey] ? 'true' : 'false');
    updateAdvCount();
    if (cb) cb(OPT[optKey]);
  };
  el.addEventListener('click', toggle);
  el.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   ADVANCED PANEL
═══════════════════════════════════════════════════════════════════════ */
function initAdvanced() {
  if (!D.advToggle) return;

  D.advToggle.addEventListener('click', () => {
    const open = D.advPanel.classList.toggle('open');
    D.advToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  wireToggle(D.gsTgl,     'grayscale');
  wireToggle(D.metaTgl,   'stripMeta');
  wireToggle(D.annotTgl,  'removeAnnot');
  wireToggle(D.linearTgl, 'linearize');
  wireToggle(D.jsTgl,     'removeJs');
  wireToggle(D.embedTgl,  'removeEmbed');
  wireToggle(D.formsTgl,  'removeForms');

  wireToggle(D.targetTgl, 'targetMode', on => {
    if (D.targetSizeRow) D.targetSizeRow.hidden = !on;
  });
  if (D.targetSizeInp) {
    D.targetSizeInp.addEventListener('change', () => {
      OPT.targetKb = Math.max(50, parseInt(D.targetSizeInp.value) || 500);
    });
  }

  wireToggle(D.pwTgl, 'pwMode', on => {
    if (D.passwordRow) D.passwordRow.hidden = !on;
    if (on && D.passwordInp) D.passwordInp.focus();
  });
  if (D.passwordInp) {
    D.passwordInp.addEventListener('input', () => {
      OPT.password = D.passwordInp.value;
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   PROGRESS UI
═══════════════════════════════════════════════════════════════════════ */
function setProgress(pct, title, sub) {
  if (!D) return;
  const p = Math.min(100, Math.max(0, pct));
  if (D.progBar)  D.progBar.style.width  = p + '%';
  if (D.progGlow) D.progGlow.style.left  = Math.max(0, p - 5) + '%';
  if (D.progPct)  D.progPct.textContent  = Math.round(p) + '%';
  if (D.progBarWrap) D.progBarWrap.setAttribute('aria-valuenow', Math.round(p));
  if (title && D.progTitle) D.progTitle.textContent = title;
  if (sub   && D.progSub)   D.progSub.textContent   = sub;
}

function resetChips() {
  [D.chUpload, D.chAnalyze, D.chGs, D.chFitz, D.chPike, D.chDone].forEach(ch => {
    if (ch) { ch.classList.remove('active', 'done'); }
  });
}

function activateChip(el) {
  if (!el) return;
  // Mark previous chip done
  const chips = [D.chUpload, D.chAnalyze, D.chGs, D.chFitz, D.chPike, D.chDone];
  const idx = chips.indexOf(el);
  chips.forEach((c, i) => {
    if (!c) return;
    if (i < idx) { c.classList.remove('active'); c.classList.add('done'); }
    else if (i === idx) { c.classList.add('active'); c.classList.remove('done'); }
    else { c.classList.remove('active', 'done'); }
  });
}

function showEngineResults(enginesStr) {
  if (!D.engineBar || !D.ebEngines) return;
  D.engineBar.hidden = false;
  D.ebEngines.innerHTML = '';
  if (!enginesStr) return;
  // Format: "gs=120KB,pymupdf=95KB,pikepdf=88KB"
  const parts = enginesStr.split(',');
  parts.forEach((part, i) => {
    const div = document.createElement('div');
    div.className = 'cp-eb-eng' + (i === parts.length - 1 ? ' best' : '');
    div.textContent = part.trim();
    D.ebEngines.appendChild(div);
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   SSE PROGRESS
═══════════════════════════════════════════════════════════════════════ */
function startSSE(jobId) {
  closeSSE();
  JOB_ID = jobId;
  const url = `/api/progress/${jobId}`;

  try {
    SSE_ES = new EventSource(url);

    SSE_ES.onmessage = e => {
      try {
        const data = JSON.parse(e.data);
        if (data.pct !== undefined) {
          handleSSEProgress(data);
        }
      } catch (_) {}
    };

    SSE_ES.onerror = () => {
      closeSSE();
    };

  } catch (_) {
    startSimProgress();
  }
}

function handleSSEProgress(data) {
  const pct   = data.pct   || 0;
  const stage = data.stage || '';
  const msg   = data.msg   || '';

  setProgress(pct, undefined, msg);

  // Map stage → chip
  const stageMap = {
    'init':         D.chUpload,
    'upload':       D.chUpload,
    'ghostscript':  D.chGs,
    'ghostscript_done': D.chGs,
    'pymupdf':      D.chFitz,
    'pymupdf_done': D.chFitz,
    'pikepdf':      D.chPike,
    'pikepdf_done': D.chPike,
    'qpdf':         D.chPike,
    'mutool':       D.chPike,
    'pypdf':        D.chPike,
    'done':         D.chDone,
    'target_try_screen':  D.chGs,
    'target_try_low':     D.chGs,
    'target_try_medium':  D.chGs,
    'target_try_high':    D.chGs,
  };

  const chip = stageMap[stage];
  if (chip) activateChip(chip);

  if (pct >= 30 && !D.chAnalyze.classList.contains('done')) {
    activateChip(D.chGs);
  }
}

function closeSSE() {
  if (SSE_ES) { SSE_ES.close(); SSE_ES = null; }
  if (SIM_TIMER) { clearInterval(SIM_TIMER); SIM_TIMER = null; }
}

function startSimProgress() {
  SIM_PCT = 0;
  const steps = [
    { pct: 12, stage: 'upload',      msg: 'Uploading PDF…' },
    { pct: 22, stage: 'analyze',     msg: 'Analysing structure…' },
    { pct: 38, stage: 'ghostscript', msg: 'Ghostscript engine running…' },
    { pct: 52, stage: 'pymupdf',     msg: 'PyMuPDF engine running…' },
    { pct: 65, stage: 'pikepdf',     msg: 'pikepdf engine running…' },
    { pct: 76, stage: 'qpdf',        msg: 'qpdf engine running…' },
    { pct: 85, stage: 'mutool',      msg: 'mutool engine running…' },
    { pct: 92, stage: 'pypdf',       msg: 'pypdf engine running…' },
    { pct: 97, stage: 'done',        msg: 'Picking best result…' },
  ];
  let stepIdx = 0;

  SIM_TIMER = setInterval(() => {
    if (stepIdx < steps.length) {
      const s = steps[stepIdx++];
      setProgress(s.pct, 'Compressing…', s.msg);
      handleSSEProgress({ pct: s.pct, stage: s.stage, msg: s.msg });
    }
  }, 700);
}

/* ═══════════════════════════════════════════════════════════════════════
   COMPRESS
═══════════════════════════════════════════════════════════════════════ */
async function doCompress() {
  if (!FILE) { toast('Please upload a PDF first', 'warn'); return; }
  if (D.compressBtn.disabled) return;

  // State reset
  closeSSE();
  RESULT = null;
  _compStartTime = Date.now();

  // UI: show progress
  D.compressBtn.disabled = true;
  D.modesSection.hidden  = true;
  D.advSection.hidden    = true;
  D.actionArea.hidden    = true;
  D.resultSection.hidden = true;
  D.progressSection.hidden = false;

  resetChips();
  setProgress(0, 'Compressing…', 'Starting 7-engine pipeline');
  activateChip(D.chUpload);

  S('start');
  toast('Compression started — 7-engine pipeline running…', 'info', 2000);

  // Generate job ID for SSE
  const jobId = 'cp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  startSSE(jobId);
  startSimProgress();  // Always run sim as fallback

  // Build form data
  const fd = new FormData();
  fd.append('file', FILE);
  fd.append('preset', SEL_MODE);
  fd.append('job_id', jobId);
  fd.append('grayscale',      OPT.grayscale     ? '1' : '0');
  fd.append('strip_metadata', OPT.stripMeta     ? '1' : '0');
  fd.append('remove_annotations', OPT.removeAnnot ? '1' : '0');
  fd.append('linearize',      OPT.linearize     ? '1' : '0');
  fd.append('remove_javascript', OPT.removeJs   ? '1' : '0');
  fd.append('remove_embedded_files', OPT.removeEmbed ? '1' : '0');
  fd.append('remove_forms',   OPT.removeForms   ? '1' : '0');
  if (OPT.targetMode && OPT.targetKb > 0) {
    fd.append('target_size_kb', OPT.targetKb);
  }
  if (OPT.pwMode && OPT.password) {
    fd.append('password', OPT.password);
  }

  try {
    setProgress(5, 'Uploading…', 'Sending PDF to server');
    activateChip(D.chAnalyze);

    const res = await fetch('/api/compress-pdf', { method: 'POST', body: fd });

    closeSSE();

    if (!res.ok) {
      let errMsg = `Server error (${res.status})`;
      try {
        const errData = await res.json();
        errMsg = errData.error || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    // Extract response headers
    const origKb   = parseFloat(res.headers.get('X-Original-Size-KB')  || '0');
    const compKb   = parseFloat(res.headers.get('X-Compressed-Size-KB')|| '0');
    const redPct   = parseFloat(res.headers.get('X-Reduction-Pct')     || '0');
    const method   = res.headers.get('X-Method-Used')  || SEL_MODE;
    const procMs   = parseInt(res.headers.get('X-Processing-Ms') || '0') || (Date.now() - _compStartTime);
    const engTried = res.headers.get('X-Engines-Tried') || '';

    // Download blob
    const blob = await res.blob();
    RESULT = URL.createObjectURL(blob);

    setProgress(100, 'Done!', 'Compression complete');
    activateChip(D.chDone);
    [D.chUpload, D.chAnalyze, D.chGs, D.chFitz, D.chPike].forEach(c => {
      if (c) { c.classList.remove('active'); c.classList.add('done'); }
    });

    if (engTried) showEngineResults(engTried);

    // Show results
    setTimeout(() => showResult({
      origKb, compKb, redPct, method, procMs, engTried
    }), 350);

  } catch (err) {
    closeSSE();
    setProgress(0, 'Error', err.message || 'Compression failed');

    D.compressBtn.disabled = false;
    D.modesSection.hidden  = false;
    D.advSection.hidden    = false;
    D.actionArea.hidden    = false;
    D.progressSection.hidden = true;

    S('error');
    toast('Compression failed: ' + (err.message || 'Unknown error'), 'error', 6000);
    console.error('Compress error:', err);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   SHOW RESULT
═══════════════════════════════════════════════════════════════════════ */
function showResult({ origKb, compKb, redPct, method, procMs, engTried }) {
  D.progressSection.hidden = true;
  D.resultSection.hidden   = false;

  const pct   = Math.max(0, redPct);
  const grade = gradeFromPct(pct);

  // Header
  D.resIcon.textContent  = pct >= 50 ? '🎉' : pct >= 25 ? '✅' : '📦';
  D.resTitle.textContent = pct > 1 ? 'Compression Complete!' : 'Optimization Complete!';
  D.resSub.textContent   = pct > 1
    ? `Reduced by ${pct.toFixed(1)}% — ${formatBytes(origKb * 1024)} → ${formatBytes(compKb * 1024)}`
    : 'PDF structure optimized (already efficient or text-only)';

  D.resGrade.textContent  = grade;
  D.resGrade.className    = 'cp-res-grade grade-' + grade;

  // Ring animation
  const circumference = 326.7;
  const offset = circumference - (pct / 100) * circumference;
  D.ringFill.style.strokeDashoffset = String(offset);

  // Ring colour by grade
  const ringColors = { S:'#34d399', A:'#6ee7b7', B:'#fcd34d', C:'#fb923c', D:'#f87171' };
  D.ringFill.style.stroke = ringColors[grade] || '#10b981';

  // Animate number
  animateNum(D.ringNum, 0, pct, 1400, v => v.toFixed(1) + '%');

  D.ringSub.textContent = `Grade ${grade} compression`;

  // Stats
  D.stOrig.textContent   = formatBytes(origKb * 1024);
  D.stComp.textContent   = formatBytes(compKb * 1024);
  D.stSaved.textContent  = formatBytes(Math.max(0, (origKb - compKb) * 1024)) + ' saved';
  D.stEngine.textContent = method || '—';
  D.stTime.textContent   = formatMs(procMs);

  // Bars
  const origW = 100;
  const compW = origKb > 0 ? Math.max(2, (compKb / origKb) * 100) : 50;
  setTimeout(() => {
    D.barOrig.style.width = origW + '%';
    D.barComp.style.width = compW + '%';
  }, 200);
  D.barOrigLbl.textContent = formatBytes(origKb * 1024);
  D.barCompLbl.textContent = formatBytes(compKb * 1024);

  // Quality note
  const presetNotes = {
    screen:   'Screen preset (72 DPI) — suitable for on-screen viewing. Images significantly downsampled.',
    low:      'Low preset (96 DPI) — email-quality. Some visible reduction at high zoom.',
    medium:   'Medium preset (150 DPI) — excellent balance of quality and size. Recommended.',
    high:     'High preset (200 DPI) — near-lossless. Minimal visual change at any zoom.',
    lossless: 'Lossless preset — zero image quality loss. Structure and streams only.',
  };
  D.qualNoteText.textContent = presetNotes[SEL_MODE] || 'Compression complete.';

  // Download button
  D.dlBtnText.textContent = `Download (${formatBytes(compKb * 1024)})`;
  D.compressBtn.disabled  = false;

  // Confetti + sound
  S('success');
  if (pct >= 30) {
    launchConfetti();
    S('download');
  }

  // Scroll to result
  D.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function animateNum(el, from, to, dur, fmt) {
  if (!el) return;
  const start = performance.now();
  const update = ts => {
    const elapsed = ts - start;
    const progress = Math.min(elapsed / dur, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = fmt(from + (to - from) * ease);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

/* ═══════════════════════════════════════════════════════════════════════
   DOWNLOAD
═══════════════════════════════════════════════════════════════════════ */
function doDownload() {
  if (!RESULT) {
    toast('No compressed file available — compress first', 'warn');
    return;
  }
  const a = document.createElement('a');
  a.href     = RESULT;
  a.download = DL_STEM + '_compressed.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  S('download');
  toast('Download started! 🎉', 'success', 2000);
}

/* ═══════════════════════════════════════════════════════════════════════
   RESET
═══════════════════════════════════════════════════════════════════════ */
function doReset() {
  if (RESULT) {
    try { URL.revokeObjectURL(RESULT); } catch (_) {}
  }
  removeFile();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════════════════
   CONFETTI
═══════════════════════════════════════════════════════════════════════ */
function launchConfetti() {
  if (typeof confetti === 'function') {
    const colors = ['#10b981', '#34d399', '#6ee7b7', '#6366f1', '#8b5cf6'];
    confetti({ particleCount: 80, spread: 70, origin: { y: .55 }, colors });
    setTimeout(() => confetti({ particleCount: 40, spread: 90, origin: { y: .45, x: .2 }, colors }), 350);
    setTimeout(() => confetti({ particleCount: 40, spread: 90, origin: { y: .45, x: .8 }, colors }), 600);
  } else {
    // CSS fallback particles
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 24; i++) {
      const p = document.createElement('div');
      p.style.cssText = `
        position:fixed;
        left:${10 + Math.random()*80}%;
        top:${20 + Math.random()*30}%;
        width:${6 + Math.random()*8}px;
        height:${6 + Math.random()*8}px;
        border-radius:50%;
        background:hsl(${140 + Math.random()*60},80%,60%);
        z-index:9998;
        pointer-events:none;
        animation:cp-conf-fall ${1 + Math.random()}s ease-in forwards;
      `;
      frag.appendChild(p);
    }
    document.body.appendChild(frag);
    setTimeout(() => document.querySelectorAll('[style*="cp-conf-fall"]').forEach(el => el.remove()), 2000);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   SHARE
═══════════════════════════════════════════════════════════════════════ */
async function doShare() {
  const url = window.location.href;
  const text = 'Compress PDF free online — up to 90% size reduction! By Ishu Kumar (ISHUKR41) at ishutools.fun';

  if (navigator.share) {
    try {
      await navigator.share({ title: 'IshuTools PDF Compressor', text, url });
      return;
    } catch (_) {}
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied to clipboard!', 'success', 2000);
  } catch (_) {
    toast('Share: ' + url, 'info', 5000);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem('cp-theme') || 'dark';
  applyTheme(saved);

  if (D.themeBtn) {
    D.themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next    = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('cp-theme', next);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (D && D.themeIcon) {
    D.themeIcon.className = theme === 'dark' ? 'fa fa-moon' : 'fa fa-sun';
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   SOUND TOGGLE
═══════════════════════════════════════════════════════════════════════ */
function initSound() {
  SOUND_ON = localStorage.getItem('cp-sound') !== 'off';
  updateSoundIcon();

  if (D.soundBtn) {
    D.soundBtn.addEventListener('click', () => {
      SOUND_ON = !SOUND_ON;
      localStorage.setItem('cp-sound', SOUND_ON ? 'on' : 'off');
      updateSoundIcon();
      if (SOUND_ON) S('add');
      toast(SOUND_ON ? 'Sounds on 🔊' : 'Sounds off 🔇', 'info', 1500);
    });
  }
}

function updateSoundIcon() {
  if (!D || !D.soundIcon) return;
  D.soundIcon.className = SOUND_ON ? 'fa fa-volume-high' : 'fa fa-volume-xmark';
}

/* ═══════════════════════════════════════════════════════════════════════
   FAQ
═══════════════════════════════════════════════════════════════════════ */
function initFaq() {
  const faqs = document.querySelectorAll('.cp-faq');
  faqs.forEach(faq => {
    const btn  = faq.querySelector('.cp-fq');
    if (!btn) return;
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    const toggle = () => {
      const open = !faq.classList.contains('open');
      faqs.forEach(f => f.classList.remove('open'));  // close others
      faq.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    btn.addEventListener('click', toggle);
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   COUNTER ANIMATION
═══════════════════════════════════════════════════════════════════════ */
function initCounters() {
  const els = document.querySelectorAll('.cp-cnt-num[data-count]');
  if (!els.length) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const max = parseInt(el.dataset.count);
      const dur = 1800;
      const suf = el.nextElementSibling?.classList.contains('cp-cnt-suf')
        ? el.nextElementSibling.textContent : '';

      animateNum(el, 0, max, dur, v => {
        const n = Math.round(v);
        if (max >= 1000000) return (n / 1000000).toFixed(1) + 'M+';
        if (max >= 1000)    return (n / 1000).toFixed(0) + 'K+';
        return String(n);
      });
      io.unobserve(el);
    });
  }, { threshold: .5 });

  els.forEach(el => io.observe(el));
}

/* ═══════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUT
═══════════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (FILE && !D.compressBtn.disabled) doCompress();
    }
    // Escape: close advanced panel
    if (e.key === 'Escape' && D.advPanel.classList.contains('open')) {
      D.advPanel.classList.remove('open');
      D.advToggle.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   DRAG AND DROP
═══════════════════════════════════════════════════════════════════════ */
function initDragDrop() {
  const dz = D.dropzone;
  if (!dz) return;

  // Prevent default drag on whole document
  document.addEventListener('dragover',  e => e.preventDefault(), { passive: false });
  document.addEventListener('drop',      e => e.preventDefault());

  dz.addEventListener('dragenter', e => {
    e.preventDefault();
    dz.classList.add('drag-over');
  });
  dz.addEventListener('dragleave', e => {
    if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over');
  });
  dz.addEventListener('dragover', e => {
    e.preventDefault();
    dz.classList.add('drag-over');
  });
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const f = e.dataTransfer?.files?.[0];
    if (f) setFile(f);
  });

  // Click to browse
  const openInput = e => {
    if (e.target === D.browseBtn || dz.contains(e.target)) {
      D.fileInput.click();
    }
  };
  dz.addEventListener('click', openInput);

  // Keyboard activate
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
  });

  // Browse button (explicit)
  if (D.browseBtn) {
    D.browseBtn.addEventListener('click', e => {
      e.stopPropagation();
      D.fileInput.click();
    });
  }

  // File input change
  if (D.fileInput) {
    D.fileInput.addEventListener('change', e => {
      const f = e.target.files?.[0];
      if (f) setFile(f);
    });
  }

  // Paste support
  document.addEventListener('paste', e => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.kind === 'file' && (item.type === 'application/pdf' || item.type === '')) {
        const f = item.getAsFile();
        if (f) { setFile(f); break; }
      }
    }
  });

  // Document-level drop (outside the drop zone)
  document.addEventListener('drop', e => {
    if (dz.contains(e.target)) return;  // already handled above
    const f = e.dataTransfer?.files?.[0];
    if (f && (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))) {
      setFile(f);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   SCROLL ANIMATION (sections fade in from bottom)
═══════════════════════════════════════════════════════════════════════ */
function initScrollAnim() {
  const style = document.createElement('style');
  style.textContent = `
    .cp-anim-hidden { opacity:0; transform:translateY(28px); }
    .cp-anim-visible { opacity:1; transform:translateY(0);
      transition: opacity .55s ease, transform .55s ease; }
  `;
  document.head.appendChild(style);

  const targets = document.querySelectorAll(
    '.cp-section, .cp-counters-band, .cp-seo-section, .cp-author-card'
  );

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.replace('cp-anim-hidden', 'cp-anim-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: .08 });

  targets.forEach(el => {
    el.classList.add('cp-anim-hidden');
    io.observe(el);
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   MODE CARD KEYBOARD
═══════════════════════════════════════════════════════════════════════ */
function initModeCards() {
  document.querySelectorAll('.cp-mode').forEach(card => {
    card.addEventListener('click', () => selectMode(card.dataset.mode));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMode(card.dataset.mode); }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   ENTRY POINT
═══════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initDom();

  // Feature checks (graceful)
  initTheme();
  initSound();
  initBgCanvas();
  initDzParticles();
  initDragDrop();
  initModeCards();
  initAdvanced();
  initFaq();
  initCounters();
  initScrollAnim();
  initKeyboard();

  // Default mode active visual
  selectMode(SEL_MODE);

  // Remove btn
  if (D.removeBtn) {
    D.removeBtn.addEventListener('click', e => { e.stopPropagation(); removeFile(); });
  }

  // Compress btn
  if (D.compressBtn) {
    D.compressBtn.addEventListener('click', doCompress);
  }

  // Download btn
  if (D.dlBtn) {
    D.dlBtn.addEventListener('click', doDownload);
  }

  // Reset btn
  if (D.resetBtn) {
    D.resetBtn.addEventListener('click', doReset);
  }

  // Share btn
  if (D.shareBtn) {
    D.shareBtn.addEventListener('click', doShare);
  }

  // Greeting
  console.log(
    '%cIshuTools PDF Compressor v11.0\n%cBy Ishu Kumar (ISHUKR41) — ishutools.fun',
    'color:#10b981;font-weight:bold;font-size:14px',
    'color:#a7f3d0;font-size:11px'
  );
});
