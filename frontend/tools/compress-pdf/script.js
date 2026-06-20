/**
 * IshuTools.fun — Compress PDF script.js v26.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 *
 * Features:
 *  • Drag-and-drop + click file upload (PDF only, no size limit)
 *  • PDF analysis via /api/compress-pdf/analyze
 *  • 5-preset quality selector (lossless / high / medium / low / screen)
 *  • Target file size mode (binary-search on backend)
 *  • 13 advanced option toggles + password field
 *  • Quick preset combos (email / archive / web / max / reset)
 *  • SSE real-time progress with elapsed time counter
 *  • Result card: grade, before/after sizes, reduction bar, engine report
 *  • Download as [original]_compressed.pdf + fahhhhh download sound
 *  • Sounds from window.SOUNDS (merge-pdf/sounds/ folder via absolute paths)
 *  • Canvas confetti on success (3 burst salvo)
 *  • Animated background canvas (floating emerald particles)
 *  • Dark/Light theme toggle with localStorage persistence
 *  • Sound toggle with localStorage persistence
 *  • FAQ accordion
 *  • Animated trust counters (IntersectionObserver threshold 0.5)
 *  • Keyboard shortcuts: Ctrl+Enter = compress, Escape = close panels
 *  • FAB + scroll-to-top buttons
 *  • No file size limit — ever
 *  • No auto quality compromise — user controls quality
 */

'use strict';

/* ════════════════════════════════════════════════════════════════════════════
   MODULE-SCOPE STATE
════════════════════════════════════════════════════════════════════════════ */
let FILE          = null;   // Selected File object
let STEM          = '';     // Original filename stem (no extension)
let JOB_ID        = '';     // SSE job ID string
let SSE_SOURCE    = null;   // EventSource instance
let SSE_TIMER     = null;   // setInterval fallback for simulated progress
let COMPRESS_DONE = false;  // True once compression completes
let RESULT_DATA   = null;   // Last result dict
let ANALYSIS_DATA = null;   // Last analysis dict

// Elapsed timer
let _t0 = 0;
let _timerInterval = null;

// DOM refs object — populated in DOMContentLoaded
let D = null;

/* ════════════════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
════════════════════════════════════════════════════════════════════════════ */

/** Format bytes → human string */
function fmtBytes(b) {
  if (b == null || isNaN(b) || b < 0) return '—';
  if (b === 0) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.min(Math.floor(Math.log(Math.abs(b)) / Math.log(1024)), u.length - 1);
  const v = b / Math.pow(1024, i);
  return (i === 0 ? v : v < 10 ? v.toFixed(2) : v.toFixed(1)) + ' ' + u[i];
}

/** Format milliseconds → human string */
function fmtMs(ms) {
  if (ms == null || isNaN(ms)) return '—';
  if (ms < 1000) return ms + ' ms';
  return (ms / 1000).toFixed(1) + 's';
}

/** Format seconds elapsed */
function fmtElapsed(s) {
  if (s < 60) return s.toFixed(1) + 's';
  return Math.floor(s / 60) + 'm ' + Math.floor(s % 60) + 's';
}

/** Safe call into window.SOUNDS */
function S(key) {
  try {
    if (window.SOUNDS && typeof window.SOUNDS[key] === 'function') {
      window.SOUNDS[key]();
    }
  } catch (_) {}
}

/** Fire canvas-confetti (3-burst salvo) */
function launchConfetti() {
  try {
    if (typeof confetti !== 'function') return;
    const opts = {
      colors: ['#10b981','#34d399','#6ee7b7','#ffffff','#6366f1','#a78bfa'],
    };
    confetti({ ...opts, particleCount: 80,  spread: 70,  origin: { y: 0.55 } });
    setTimeout(() => confetti({ ...opts, particleCount: 55, spread: 90, angle: 60,  origin: { y: 0.45 } }), 220);
    setTimeout(() => confetti({ ...opts, particleCount: 55, spread: 90, angle: 120, origin: { y: 0.45 } }), 440);
  } catch (_) {}
}

/** Extract filename stem */
function getStem(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Percent reduction */
function calcReduction(inSz, outSz) {
  if (!inSz || !outSz || outSz >= inSz) return 0;
  return Math.round((1 - outSz / inSz) * 1000) / 10;
}

/* ════════════════════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
════════════════════════════════════════════════════════════════════════════ */
function toast(title, sub = '', type = 'info', dur = 4000) {
  if (!D?.toastWrap) return;
  const icons = {
    success: 'fa-check-circle',
    error:   'fa-times-circle',
    warn:    'fa-exclamation-triangle',
    info:    'fa-info-circle',
  };
  const el = document.createElement('div');
  el.className = `cp-toast cp-toast-${type}`;
  el.setAttribute('role', 'alert');
  el.innerHTML = `
    <i class="fa ${icons[type] || icons.info} cp-toast-icon" aria-hidden="true"></i>
    <div class="cp-toast-body">
      <div class="cp-toast-title">${title}</div>
      ${sub ? `<div class="cp-toast-sub">${sub}</div>` : ''}
    </div>`;
  D.toastWrap.appendChild(el);

  function dismiss() {
    el.classList.add('cp-toast-out');
    setTimeout(() => el.remove(), 300);
  }
  el.addEventListener('click', dismiss);
  if (dur > 0) setTimeout(dismiss, dur);
}

/* ════════════════════════════════════════════════════════════════════════════
   THEME & SOUND TOGGLES
════════════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = (() => { try { return localStorage.getItem('cp-theme'); } catch (_) { return null; } })();
  const sys   = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  setTheme(saved || sys);
}

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  if (D) {
    D.themeIcon.className = t === 'dark' ? 'fa fa-moon' : 'fa fa-sun';
    D.themeToggle.title   = `Switch to ${t === 'dark' ? 'light' : 'dark'} mode`;
  }
  try { localStorage.setItem('cp-theme', t); } catch (_) {}
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(cur === 'dark' ? 'light' : 'dark');
  S('click');
}

function initSoundToggle() {
  updateSoundIcon(window.SOUNDS ? window.SOUNDS.isEnabled() : true);
}

function updateSoundIcon(on) {
  if (!D) return;
  D.soundIcon.className         = on ? 'fa fa-volume-up' : 'fa fa-volume-mute';
  D.soundToggle.title           = on ? 'Mute sounds' : 'Unmute sounds';
  D.soundToggle.setAttribute('aria-label', on ? 'Mute sounds' : 'Unmute sounds');
}

function toggleSound() {
  if (!window.SOUNDS) return;
  const newOn = !window.SOUNDS.isEnabled();
  window.SOUNDS.setEnabled(newOn);
  updateSoundIcon(newOn);
  if (newOn) S('click');
}

/* ════════════════════════════════════════════════════════════════════════════
   ANIMATED BACKGROUND CANVAS
════════════════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const COUNT = 30;
  const particles = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() { this.reset(true); }
    reset(init) {
      this.x     = Math.random() * window.innerWidth;
      this.y     = init ? Math.random() * window.innerHeight : window.innerHeight + 10;
      this.r     = Math.random() * 2.6 + .6;
      this.vx    = (Math.random() - .5) * .20;
      this.vy    = -(Math.random() * .48 + .15);
      this.op    = Math.random() * .22 + .04;
      this.phase = Math.random() * Math.PI * 2;
    }
    update() {
      this.x     += this.vx;
      this.y     += this.vy;
      this.phase += .024;
      if (this.y < -10 || this.x < -10 || this.x > window.innerWidth + 10) this.reset(false);
    }
    draw(c) {
      c.beginPath();
      c.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      c.fillStyle = `rgba(16,185,129,${this.op * (.7 + .3 * Math.sin(this.phase))})`;
      c.fill();
    }
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  for (let i = 0; i < COUNT; i++) particles.push(new Particle());

  let rafId, running = true;

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => { p.update(); p.draw(ctx); });
    rafId = requestAnimationFrame(loop);
  }
  loop();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      cancelAnimationFrame(rafId);
    } else {
      running = true;
      loop();
    }
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   FILE HANDLING
════════════════════════════════════════════════════════════════════════════ */
function initDropZone() {
  const dz = D.dropZone;

  // Entire drop zone is clickable
  dz.addEventListener('click', (e) => {
    // Ignore remove button clicks
    if (D.fiRemove && (e.target === D.fiRemove || D.fiRemove.contains(e.target))) return;
    D.fileInput.click();
  });

  // Keyboard activation
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
  });

  // Browse link inside drop zone
  const browseLink = dz.querySelector('.cp-drop-link');
  if (browseLink) {
    browseLink.addEventListener('click', (e) => { e.stopPropagation(); D.fileInput.click(); });
  }

  // Drag events
  ['dragenter', 'dragover'].forEach(ev => {
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dz.classList.add('cp-drag-over');
    });
  });
  ['dragleave', 'dragend'].forEach(ev => {
    dz.addEventListener(ev, (e) => {
      if (!dz.contains(e.relatedTarget)) dz.classList.remove('cp-drag-over');
    });
  });
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.remove('cp-drag-over');
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  // Input change
  D.fileInput.addEventListener('change', () => {
    if (D.fileInput.files[0]) handleFile(D.fileInput.files[0]);
    D.fileInput.value = '';
  });

  // Remove button
  if (D.fiRemove) {
    D.fiRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      resetTool();
    });
  }
}

function handleFile(file) {
  if (!file) return;

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    toast('Not a PDF', `"${file.name}" is not a PDF file.`, 'error');
    S('eh_eh_eh_ehhhhhh');
    return;
  }

  FILE          = file;
  STEM          = getStem(file.name);
  COMPRESS_DONE = false;
  RESULT_DATA   = null;
  ANALYSIS_DATA = null;

  showFileInfo(file);
  S('are_bhai_bhai_bhai');
  updateActionState();
  analyzeFile(file);
  updateFab();
}

function showFileInfo(file) {
  D.fileInfo.removeAttribute('hidden');
  D.fiName.textContent  = file.name;
  D.fiName.title        = file.name;
  D.fiSize.innerHTML    = `<i class="fa fa-weight-hanging" aria-hidden="true"></i> ${fmtBytes(file.size)}`;
  D.fiPages.innerHTML   = `<i class="fa fa-file" aria-hidden="true"></i> analysing…`;
  D.fiType.innerHTML    = `<i class="fa fa-tag" aria-hidden="true"></i> PDF`;
  D.fiVersion.innerHTML = `<i class="fa fa-code" aria-hidden="true"></i> —`;
  D.fiChips.setAttribute('hidden', '');
  D.fiAnalyze.removeAttribute('hidden');
  D.analyzeFill.style.width = '0%';
  D.recBanner.setAttribute('hidden', '');

  // Update drop zone visual
  const title = D.dropZone.querySelector('.cp-drop-title');
  const sub   = D.dropZone.querySelector('.cp-drop-sub');
  if (title) title.textContent = 'File ready';
  if (sub) sub.innerHTML = `<span class="cp-drop-link">Change file</span> to select a different PDF`;
}

async function analyzeFile(file) {
  let pct = 0;
  const barInterval = setInterval(() => {
    pct = Math.min(pct + Math.random() * 9 + 3, 88);
    if (D.analyzeFill) D.analyzeFill.style.width = pct + '%';
  }, 130);

  try {
    const fd = new FormData();
    fd.append('file', file);

    const resp = await fetch('/api/compress-pdf/analyze', { method: 'POST', body: fd });
    clearInterval(barInterval);
    if (D.analyzeFill) D.analyzeFill.style.width = '100%';

    if (!resp.ok) throw new Error('Analysis HTTP ' + resp.status);

    const data = await resp.json();
    ANALYSIS_DATA = data;

    setTimeout(() => {
      if (D.fiAnalyze) D.fiAnalyze.setAttribute('hidden', '');
      showAnalysisResult(data, file);
    }, 280);

  } catch (err) {
    clearInterval(barInterval);
    if (D.fiAnalyze) D.fiAnalyze.setAttribute('hidden', '');
    // Analysis failure is non-fatal — user can still compress
  }
}

function showAnalysisResult(data, file) {
  const pages    = data.pages || data.page_count || '?';
  const ver      = data.pdf_version || data.version || '—';
  const imgCount = data.image_count ?? data.images ?? '—';
  const compEst  = data.estimated_reduction_pct ?? data.compressible_pct;
  const docType  = data.document_type || data.type || 'Mixed';

  D.fiPages.innerHTML   = `<i class="fa fa-file" aria-hidden="true"></i> ${pages} page${pages !== 1 ? 's' : ''}`;
  D.fiVersion.innerHTML = `<i class="fa fa-code" aria-hidden="true"></i> PDF ${ver}`;

  D.chipImgVal.textContent  = imgCount;
  D.chipCompVal.textContent = compEst != null ? Math.round(compEst) + '%' : '—';
  D.chipTypeVal.textContent = docType;
  D.fiChips.removeAttribute('hidden');

  const warnings = data.warnings || [];
  if (warnings.length > 0) {
    D.chipWarn.removeAttribute('hidden');
    D.chipWarnVal.textContent = warnings[0];
  }

  showRecommendation(data);
  updateSaveEstimates(data);
}

function showRecommendation(data) {
  if (!data) return;
  const rec      = data.recommended_preset || data.recommendation;
  const imgCount = data.image_count ?? 0;
  const labels   = { lossless:'🔮 Lossless', high:'💎 High', medium:'⚖️ Medium', low:'📧 Low', screen:'🔥 Screen' };
  let msg = '';

  if (rec) {
    msg = `Recommended: <strong>${labels[rec] || rec}</strong> — based on your PDF content`;
  } else if (imgCount > 5) {
    msg = `📸 Image-heavy PDF — <strong>Medium</strong> or <strong>Screen</strong> recommended for max savings`;
  } else if (imgCount === 0) {
    msg = `📝 Text-only PDF — <strong>Lossless</strong> recommended for zero quality impact`;
  } else {
    msg = `✅ PDF analysed — choose your compression preset above`;
  }

  if (msg && D.recBanner && D.recText) {
    D.recText.innerHTML = msg;
    D.recBanner.removeAttribute('hidden');
  }
}

function updateSaveEstimates(data) {
  if (!data) return;
  if (data.estimates) {
    Object.entries(data.estimates).forEach(([preset, est]) => {
      const el = document.getElementById(`save-${preset}`);
      if (el && est != null) el.textContent = `~${Math.round(est)}% smaller`;
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   PRESET SELECTOR
════════════════════════════════════════════════════════════════════════════ */
function initPresets() {
  D.presetGrid.querySelectorAll('.cp-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      D.presetGrid.querySelectorAll('.cp-preset-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      S('waah_kya_scene_hai');
      updateActionState();
    });
  });
}

function getPreset() {
  const btn = D.presetGrid.querySelector('.cp-preset-btn.active');
  return btn ? btn.dataset.preset : 'medium';
}

/* ════════════════════════════════════════════════════════════════════════════
   TARGET SIZE TOGGLE
════════════════════════════════════════════════════════════════════════════ */
function initTargetSize() {
  D.targetToggle.addEventListener('click', () => {
    const open = D.targetToggle.getAttribute('aria-expanded') === 'true';
    D.targetToggle.setAttribute('aria-expanded', String(!open));
    D.targetInputs.toggleAttribute('hidden', open);
    if (!open) D.targetKb.focus();
    S('click');
  });

  document.querySelectorAll('.cp-tpr').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cp-tpr').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      D.targetKb.value = btn.dataset.kb;
      updateActionState();
      S('click');
    });
  });

  D.targetKb.addEventListener('input', () => {
    document.querySelectorAll('.cp-tpr').forEach(b => b.classList.remove('active'));
    updateActionState();
  });
}

function getTargetKb() {
  const open = D.targetToggle.getAttribute('aria-expanded') === 'true';
  const v    = parseInt(D.targetKb.value, 10);
  return open && v > 0 ? v : 0;
}

/* ════════════════════════════════════════════════════════════════════════════
   ADVANCED OPTIONS
════════════════════════════════════════════════════════════════════════════ */
function initAdvancedOptions() {
  D.advToggle.addEventListener('click', () => {
    const open = D.advToggle.getAttribute('aria-expanded') === 'true';
    D.advToggle.setAttribute('aria-expanded', String(!open));
    D.advOpts.toggleAttribute('hidden', open);
    S('click');
  });

  D.advOpts.querySelectorAll('.cp-adv-cb').forEach(cb => {
    cb.addEventListener('change', updateAdvCount);
  });

  document.querySelectorAll('.cp-qp-btn').forEach(btn => {
    btn.addEventListener('click', () => applyQuickPreset(btn.dataset.qp));
  });

  if (D.pwEye) {
    D.pwEye.addEventListener('click', () => {
      const pass = D.optPassword.type === 'password';
      D.optPassword.type = pass ? 'text' : 'password';
      D.pwEye.querySelector('i').className = pass ? 'fa fa-eye-slash' : 'fa fa-eye';
    });
  }

  updateAdvCount();
}

function updateAdvCount() {
  if (!D.advCount) return;
  const defaults = { optDedup: true, optThumbs: true };
  let changed = 0;
  D.advOpts.querySelectorAll('.cp-adv-cb').forEach(cb => {
    if (cb.checked !== (defaults[cb.id] ?? false)) changed++;
  });
  if (changed > 0) {
    D.advCount.textContent = changed + ' custom';
    D.advCount.removeAttribute('hidden');
  } else {
    D.advCount.setAttribute('hidden', '');
  }
}

function applyQuickPreset(key) {
  const map = {
    email:   { optGrayscale:false, optLinearize:true,  optDedup:true, optFonts:true,  optMeta:true,  optAnnot:false, optForms:false, optJS:true,  optThumbs:true, optEmbedded:true,  optICC:true,  optLinks:false, optFlatten:false },
    archive: { optGrayscale:false, optLinearize:false, optDedup:true, optFonts:true,  optMeta:false, optAnnot:false, optForms:false, optJS:true,  optThumbs:true, optEmbedded:false, optICC:false, optLinks:false, optFlatten:false },
    web:     { optGrayscale:false, optLinearize:true,  optDedup:true, optFonts:true,  optMeta:true,  optAnnot:false, optForms:false, optJS:true,  optThumbs:true, optEmbedded:true,  optICC:true,  optLinks:false, optFlatten:false },
    max:     { optGrayscale:true,  optLinearize:true,  optDedup:true, optFonts:true,  optMeta:true,  optAnnot:true,  optForms:true,  optJS:true,  optThumbs:true, optEmbedded:true,  optICC:true,  optLinks:true,  optFlatten:false },
    reset:   { optGrayscale:false, optLinearize:false, optDedup:true, optFonts:false, optMeta:false, optAnnot:false, optForms:false, optJS:false, optThumbs:true, optEmbedded:false, optICC:false, optLinks:false, optFlatten:false },
  };
  const cfg = map[key];
  if (!cfg) return;

  Object.entries(cfg).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  });

  updateAdvCount();

  // Auto-open adv opts to reveal changes
  if (key !== 'reset' && D.advToggle.getAttribute('aria-expanded') !== 'true') {
    D.advToggle.setAttribute('aria-expanded', 'true');
    D.advOpts.removeAttribute('hidden');
  }

  // Map to quality preset
  const qualMap = { email:'low', max:'screen', archive:'high', web:'medium' };
  if (qualMap[key]) {
    D.presetGrid.querySelectorAll('.cp-preset-btn').forEach(b => {
      const match = b.dataset.preset === qualMap[key];
      b.classList.toggle('active', match);
      b.setAttribute('aria-checked', String(match));
    });
  }

  const labels = { email:'Email', archive:'Archive', web:'Web', max:'Max Compression', reset:'Default' };
  toast(`${labels[key] || key} preset applied`, 'Settings ready.', 'info', 2500);
  S('click');
}

function getAdvOptions() {
  return {
    grayscale:              document.getElementById('optGrayscale')?.checked  ?? false,
    linearize:              document.getElementById('optLinearize')?.checked  ?? false,
    remove_duplicate_images:document.getElementById('optDedup')?.checked      ?? true,
    subset_fonts:           document.getElementById('optFonts')?.checked      ?? false,
    strip_metadata:         document.getElementById('optMeta')?.checked       ?? false,
    remove_annotations:     document.getElementById('optAnnot')?.checked      ?? false,
    remove_forms:           document.getElementById('optForms')?.checked      ?? false,
    remove_javascript:      document.getElementById('optJS')?.checked         ?? false,
    remove_thumbnails:      document.getElementById('optThumbs')?.checked     ?? true,
    remove_embedded_files:  document.getElementById('optEmbedded')?.checked   ?? false,
    remove_icc_profiles:    document.getElementById('optICC')?.checked        ?? false,
    remove_links:           document.getElementById('optLinks')?.checked      ?? false,
    flatten_transparency:   document.getElementById('optFlatten')?.checked    ?? false,
    password:               document.getElementById('optPassword')?.value      ?? '',
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   ACTION STATE (enable/disable compress button)
════════════════════════════════════════════════════════════════════════════ */
function updateActionState() {
  if (!D) return;
  D.compressBtn.disabled = !FILE;
  if (!FILE) {
    D.actionMetaText.textContent = 'Upload a PDF to begin';
  } else {
    const kb     = getTargetKb();
    const preset = getPreset();
    const pLabels = { lossless:'Lossless', high:'High', medium:'Medium', low:'Low', screen:'Screen' };
    D.actionMetaText.textContent = kb > 0
      ? `Target: ${fmtBytes(kb * 1024)} · ${fmtBytes(FILE.size)} input`
      : `${pLabels[preset] || 'Medium'} quality · ${fmtBytes(FILE.size)}`;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   PROGRESS UI
════════════════════════════════════════════════════════════════════════════ */
function showProgress() {
  D.progressSection.removeAttribute('hidden');
  D.resultSection.setAttribute('hidden', '');
  setProgress(0, 'Starting engines…', 'Preparing 12-engine compression pipeline');
  _t0 = Date.now();
  if (_timerInterval) clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    if (D.progTime) D.progTime.textContent = fmtElapsed((Date.now() - _t0) / 1000);
  }, 100);
}

function setProgress(pct, stage = '', detail = '') {
  if (!D) return;
  const p = Math.max(0, Math.min(100, pct));
  D.progFill.style.width = p + '%';
  D.progPct.textContent  = Math.round(p) + '%';
  D.progBarWrap.setAttribute('aria-valuenow', Math.round(p));
  if (stage)  D.progStage.textContent  = stage;
  if (detail) D.progDetail.textContent = detail;
}

function hideProgress() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  D.progressSection.setAttribute('hidden', '');
}

/* ════════════════════════════════════════════════════════════════════════════
   SSE PROGRESS
════════════════════════════════════════════════════════════════════════════ */
function openSSE(jobId) {
  closeSSE();
  if (!jobId) return;

  // Simulated progress fallback
  let simPct = 6;
  const simInterval = setInterval(() => {
    simPct = Math.min(simPct + Math.random() * 4 + 1.5, 84);
    setProgress(simPct);
  }, 550);
  SSE_TIMER = simInterval;

  try {
    const es = new EventSource(`/api/progress/${jobId}`);
    SSE_SOURCE = es;
    es.addEventListener('message', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.pct !== undefined) {
          clearInterval(simInterval);
          SSE_TIMER = null;
          setProgress(d.pct, d.title || '', d.sub || '');
          if (d.engines && D.progEngines) {
            D.progEngines.innerHTML = `<span class="cp-pe-dot" aria-hidden="true"></span> ${d.engines}`;
          }
        }
      } catch (_) {}
    });
    es.addEventListener('error', () => closeSSE());
  } catch (_) {}
}

function closeSSE() {
  if (SSE_SOURCE) { try { SSE_SOURCE.close(); } catch (_) {} SSE_SOURCE = null; }
  if (SSE_TIMER)  { clearInterval(SSE_TIMER); SSE_TIMER = null; }
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN COMPRESSION
════════════════════════════════════════════════════════════════════════════ */
async function doCompress() {
  if (!FILE || D.compressBtn.disabled) return;

  // Lock button
  D.compressBtn.disabled = true;
  D.compressBtnText.textContent = 'Compressing…';
  const icon = D.compressBtn.querySelector('.cp-compress-icon');
  if (icon) icon.className = 'fa fa-circle-notch fa-spin cp-compress-icon';

  S('cameraman_focus_karo');
  showProgress();

  JOB_ID = 'cp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  openSSE(JOB_ID);

  const opts   = getAdvOptions();
  const kb     = getTargetKb();
  const preset = getPreset();

  const fd = new FormData();
  fd.append('file',           FILE);
  fd.append('quality',        preset);
  fd.append('job_id',         JOB_ID);
  fd.append('target_size_kb', String(kb));
  Object.entries(opts).forEach(([k, v]) => fd.append(k, String(v)));

  const t0 = Date.now();

  try {
    const resp = await fetch('/api/compress-pdf', { method: 'POST', body: fd });
    closeSSE();

    if (!resp.ok) {
      let errMsg = `Server error ${resp.status}`;
      try { const j = await resp.json(); errMsg = j.error || j.detail || errMsg; } catch (_) {}
      throw new Error(errMsg);
    }

    // Parse response headers (handles both new and legacy naming)
    const inSize    = parseInt(resp.headers.get('X-Input-Size')  || resp.headers.get('X-Original-Size')    || '0', 10) || FILE.size;
    const outSize   = parseInt(resp.headers.get('X-Output-Size') || resp.headers.get('X-Compressed-Size')  || '0', 10);
    const reductRaw = resp.headers.get('X-Reduction-Pct') || resp.headers.get('X-Reduction') || '0';
    const reductPct = parseFloat(reductRaw.replace('%', ''));
    const engine    = resp.headers.get('X-Engine-Used')    || resp.headers.get('X-Method-Used') || 'auto';
    const timeMsH   = resp.headers.get('X-Processing-Ms')  || '';
    const scoreH    = resp.headers.get('X-Quality-Score')  || '';
    const gradeH    = resp.headers.get('X-Quality-Grade')  || '';
    const enginesH  = resp.headers.get('X-Engines-Tried')  || '';

    const blob  = await resp.blob();
    const dlUrl = URL.createObjectURL(blob);
    const timeMs = timeMsH ? parseInt(timeMsH, 10) : (Date.now() - t0);

    RESULT_DATA = {
      input_size:          inSize,
      output_size:         outSize || blob.size,
      reduction_pct:       reductPct || calcReduction(inSize, outSize || blob.size),
      engine_used:         engine,
      processing_time_ms:  timeMs,
      quality_score:       scoreH ? parseInt(scoreH, 10) : null,
      quality_grade:       gradeH,
      engines_tried_str:   enginesH,
      dlUrl,
      blob,
    };
    COMPRESS_DONE = true;

    setProgress(100, 'Done!', 'Best result selected from all engines');
    setTimeout(() => {
      hideProgress();
      showResult(RESULT_DATA);
      launchConfetti();
      S('fahhhhh');
    }, 480);

  } catch (err) {
    closeSSE();
    hideProgress();
    resetCompressBtn();
    toast('Compression failed', err.message || 'Please try again.', 'error', 7000);
    S('eh_eh_eh_ehhhhhh');
    console.error('[IshuTools compress-pdf]', err);
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   RESULT DISPLAY
════════════════════════════════════════════════════════════════════════════ */
function showResult(r) {
  const pct   = r.reduction_pct || 0;
  const grade = r.quality_grade || gradeFromPct(pct);
  const inSz  = r.input_size    || (FILE ? FILE.size : 0);
  const outSz = r.output_size   || r.blob?.size || 0;

  // Grade badge
  D.resultGrade.textContent = grade;
  D.resultSub.textContent   = gradeDesc(grade, pct);

  // Animate size values
  animateNumber(D.statBeforeVal, 0, inSz,  v => fmtBytes(v), 800);
  animateNumber(D.statAfterVal,  0, outSz, v => fmtBytes(v), 800);
  D.arrowPct.textContent = '-' + Math.round(pct) + '%';

  // Reduction bar
  const ratio = inSz > 0 ? Math.max(4, 100 - Math.round(pct)) : 50;
  setTimeout(() => { D.rvBarAfter.style.width = ratio + '%'; }, 180);

  // Meta chips
  D.statSaved.innerHTML  = `<i class="fa fa-compress-arrows-alt" aria-hidden="true"></i> ${Math.round(pct)}% saved`;
  D.statEngine.innerHTML = `<i class="fa fa-microchip" aria-hidden="true"></i> ${r.engine_used || 'auto'}`;
  D.statTime.innerHTML   = `<i class="fa fa-clock" aria-hidden="true"></i> ${fmtMs(r.processing_time_ms)}`;
  D.statScore.innerHTML  = `<i class="fa fa-star" aria-hidden="true"></i> Score ${r.quality_score ?? '—'}`;

  // Download button
  const dlName = STEM + '_compressed.pdf';
  D.dlFileName.textContent = dlName;
  D.dlFileSize.textContent  = fmtBytes(outSz);
  D.dlBtn.onclick = () => triggerDownload(r.dlUrl, dlName);

  // Build engine report
  buildEngineReport(r);

  // Show
  D.resultSection.removeAttribute('hidden');
  D.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  resetCompressBtn();
  updateFab();
}

function triggerDownload(url, name) {
  if (!url) return;
  const a    = document.createElement('a');
  a.href     = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  S('fahhhhh');
  toast('Downloaded!', name, 'success', 3000);
}

function gradeFromPct(pct) {
  if (pct >= 70) return 'A+';
  if (pct >= 55) return 'A';
  if (pct >= 40) return 'B+';
  if (pct >= 25) return 'B';
  if (pct >= 10) return 'C';
  return 'D';
}

function gradeDesc(grade, pct) {
  if (pct >= 70) return 'Excellent compression!';
  if (pct >= 55) return 'Great compression';
  if (pct >= 40) return 'Good compression';
  if (pct >= 25) return 'Moderate compression';
  if (pct >= 10) return 'Limited compression';
  return 'Already optimised — file returned';
}

function buildEngineReport(r) {
  if (!D.erTable) return;
  D.erTable.innerHTML = '';
  const tried = r.engines_tried_str
    ? r.engines_tried_str.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  if (!tried.length) return;

  tried.forEach(eng => {
    const row       = document.createElement('div');
    const isWinner  = eng === (r.engine_used || '').trim();
    row.className   = 'cp-er-row' + (isWinner ? ' er-winner' : '');
    row.setAttribute('role', 'row');
    row.innerHTML   = `
      <span class="cp-er-eng" role="cell">${eng}</span>
      <span class="cp-er-pct" role="cell">${isWinner ? '-' + Math.round(r.reduction_pct) + '%' : '—'}</span>
      <span class="cp-er-status" role="cell">${isWinner ? '✓ Winner' : '✓'}</span>`;
    D.erTable.appendChild(row);
  });

  // Wire toggle once (remove then re-add to avoid dup listeners)
  D.engDetailToggle.replaceWith(D.engDetailToggle.cloneNode(true));
  D.engDetailToggle = document.getElementById('engDetailToggle');
  D.engChev         = document.getElementById('engChev');

  D.engDetailToggle.addEventListener('click', () => {
    const open = D.engDetailToggle.getAttribute('aria-expanded') === 'true';
    D.engDetailToggle.setAttribute('aria-expanded', String(!open));
    D.engReport.toggleAttribute('hidden', open);
    if (D.engChev) D.engChev.style.transform = open ? '' : 'rotate(180deg)';
  });
}

/** Animate a number with easing */
function animateNumber(el, start, end, fmt, dur = 700) {
  if (!el) return;
  const t0 = performance.now();
  function frame(now) {
    const t = Math.min((now - t0) / dur, 1);
    const e = 1 - Math.pow(1 - t, 3); // ease-out-cubic
    el.textContent = fmt(Math.round(start + (end - start) * e));
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function resetCompressBtn() {
  if (!D) return;
  D.compressBtn.disabled        = !FILE;
  D.compressBtnText.textContent = 'Compress PDF';
  const icon = D.compressBtn.querySelector('.cp-compress-icon');
  if (icon) icon.className = 'fa fa-compress-arrows-alt cp-compress-icon';
}

/* ════════════════════════════════════════════════════════════════════════════
   RESET / COMPRESS ANOTHER / TWEAK
════════════════════════════════════════════════════════════════════════════ */
function resetTool() {
  closeSSE();
  if (RESULT_DATA?.dlUrl) { try { URL.revokeObjectURL(RESULT_DATA.dlUrl); } catch (_) {} }

  FILE = STEM = JOB_ID = '';
  FILE          = null;
  COMPRESS_DONE = false;
  RESULT_DATA   = null;
  ANALYSIS_DATA = null;

  // Hide file info
  D.fileInfo.setAttribute('hidden', '');
  D.fiChips.setAttribute('hidden', '');
  D.fiAnalyze.setAttribute('hidden', '');
  D.recBanner.setAttribute('hidden', '');
  if (D.analyzeFill) D.analyzeFill.style.width = '0%';

  // Reset drop zone text
  const title = D.dropZone.querySelector('.cp-drop-title');
  const sub   = D.dropZone.querySelector('.cp-drop-sub');
  if (title) title.textContent = 'Drop your PDF here';
  if (sub) sub.innerHTML = `or <span class="cp-drop-link">click to browse</span> &nbsp;·&nbsp; Any size supported`;

  // Hide progress/result
  D.progressSection.setAttribute('hidden', '');
  D.resultSection.setAttribute('hidden', '');

  resetCompressBtn();
  updateActionState();
  updateFab();
  S('jaldi_waha_sa_hato');

  D.toolZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function tweakSettings() {
  D.resultSection.setAttribute('hidden', '');
  D.toolZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (D.advToggle.getAttribute('aria-expanded') !== 'true') {
    D.advToggle.setAttribute('aria-expanded', 'true');
    D.advOpts.removeAttribute('hidden');
  }
  resetCompressBtn();
  toast('Adjust settings and compress again', '', 'info', 3000);
}

/* ════════════════════════════════════════════════════════════════════════════
   FAB
════════════════════════════════════════════════════════════════════════════ */
function updateFab() {
  if (!D?.fabBtn) return;
  D.fabBtn.toggleAttribute('hidden', !FILE);
}

/* ════════════════════════════════════════════════════════════════════════════
   FAQ ACCORDION
════════════════════════════════════════════════════════════════════════════ */
function initFaq() {
  document.querySelectorAll('.cp-fq').forEach(btn => {
    btn.addEventListener('click', () => {
      const item   = btn.closest('.cp-faq');
      const isOpen = item.classList.contains('open');

      document.querySelectorAll('.cp-faq.open').forEach(o => {
        o.classList.remove('open');
        o.querySelector('.cp-fq').setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        S('click');
      }
    });
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   TRUST COUNTERS
════════════════════════════════════════════════════════════════════════════ */
function initCounters() {
  const counters = document.querySelectorAll('.cp-trust-num[data-count]');
  if (!counters.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      const el  = entry.target;
      const end = parseInt(el.dataset.count, 10) || 0;
      const suf = el.dataset.suffix || '';
      if (end === 0 && suf) { el.textContent = suf; return; }

      const dur = 1800;
      const t0  = performance.now();
      function frame(now) {
        const t    = Math.min((now - t0) / dur, 1);
        const ease = 1 - Math.pow(1 - t, 3);
        const v    = Math.round(end * ease);
        el.textContent =
          v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + 'M+' :
          v >= 1_000     ? (v / 1_000).toFixed(0) + 'K+'    :
          String(v) + (t >= 1 && end > 90 ? '+' : '');
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }, { threshold: .5 });

  counters.forEach(el => io.observe(el));
}

/* ════════════════════════════════════════════════════════════════════════════
   ENGINE COUNT
════════════════════════════════════════════════════════════════════════════ */
async function fetchEngineCount() {
  try {
    const resp = await fetch('/api/compress-pdf/engines');
    if (!resp.ok) return;
    const d = await resp.json();
    const el = document.getElementById('engineCount');
    if (el && d.available != null) el.textContent = d.available + ' engines available';
    const pill = document.getElementById('enginePill');
    if (pill && d.available != null) {
      pill.innerHTML = `<i class="fa fa-microchip" aria-hidden="true"></i> ${d.available} engines`;
    }
  } catch (_) {}
}

/* ════════════════════════════════════════════════════════════════════════════
   SCROLL-TO-TOP
════════════════════════════════════════════════════════════════════════════ */
function initScrollTop() {
  window.addEventListener('scroll', () => {
    D.scrollTopBtn.toggleAttribute('hidden', window.scrollY < 420);
  }, { passive: true });
  D.scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    S('click');
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
════════════════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter → compress
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (FILE && !D.compressBtn.disabled) doCompress();
    }
    // Escape → close panels
    if (e.key === 'Escape') {
      if (D.advToggle.getAttribute('aria-expanded') === 'true') {
        D.advToggle.setAttribute('aria-expanded', 'false');
        D.advOpts.setAttribute('hidden', '');
      }
      if (D.targetToggle.getAttribute('aria-expanded') === 'true') {
        D.targetToggle.setAttribute('aria-expanded', 'false');
        D.targetInputs.setAttribute('hidden', '');
      }
    }
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   REVEAL ANIMATIONS
════════════════════════════════════════════════════════════════════════════ */
function initRevealAnimations() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const els = document.querySelectorAll(
    '.cp-how-step, .cp-feat-card, .cp-eng-card, .cp-pgc-card, .cp-review-card, .cp-trust-item'
  );
  if (!els.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (!entry.isIntersecting) return;
      io.unobserve(entry.target);
      entry.target.style.animation = `cp-fade-up .5s ease both ${(i % 5) * 65}ms`;
    });
  }, { threshold: .1, rootMargin: '0px 0px -30px 0px' });

  els.forEach(el => io.observe(el));
}

/* ════════════════════════════════════════════════════════════════════════════
   DOMCONTENTLOADED — MAIN INIT
════════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* ── Populate DOM refs ─────────────────────────────────────────── */
  D = {
    // Nav
    themeToggle:   document.getElementById('themeToggle'),
    themeIcon:     document.getElementById('themeIcon'),
    soundToggle:   document.getElementById('soundToggle'),
    soundIcon:     document.getElementById('soundIcon'),

    // Tool zone
    toolZone:      document.getElementById('toolZone'),
    dropZone:      document.getElementById('dropZone'),
    fileInput:     document.getElementById('fileInput'),
    fileInfo:      document.getElementById('fileInfo'),
    fiThumb:       document.getElementById('fiThumb'),
    fiName:        document.getElementById('fiName'),
    fiSize:        document.getElementById('fiSize'),
    fiPages:       document.getElementById('fiPages'),
    fiType:        document.getElementById('fiType'),
    fiVersion:     document.getElementById('fiVersion'),
    fiAnalyze:     document.getElementById('fiAnalyze'),
    analyzeFill:   document.getElementById('analyzeFill'),
    fiChips:       document.getElementById('fiChips'),
    chipImgVal:    document.getElementById('chipImgVal'),
    chipCompVal:   document.getElementById('chipCompVal'),
    chipTypeVal:   document.getElementById('chipTypeVal'),
    chipWarn:      document.getElementById('chipWarn'),
    chipWarnVal:   document.getElementById('chipWarnVal'),
    fiRemove:      document.getElementById('fiRemove'),
    recBanner:     document.getElementById('recBanner'),
    recText:       document.getElementById('recText'),

    // Presets
    presetGrid:    document.getElementById('presetGrid'),

    // Target size
    targetToggle:  document.getElementById('targetToggle'),
    targetInputs:  document.getElementById('targetInputs'),
    targetKb:      document.getElementById('targetKb'),

    // Advanced
    advToggle:     document.getElementById('advToggle'),
    advOpts:       document.getElementById('advOpts'),
    advCount:      document.getElementById('advCount'),
    optPassword:   document.getElementById('optPassword'),
    pwEye:         document.getElementById('pwEye'),

    // Action
    compressBtn:      document.getElementById('compressBtn'),
    compressBtnText:  document.getElementById('compressBtnText'),
    actionMetaText:   document.getElementById('actionMetaText'),

    // Progress
    progressSection:  document.getElementById('progressSection'),
    progFill:         document.getElementById('progFill'),
    progPct:          document.getElementById('progPct'),
    progStage:        document.getElementById('progStage'),
    progDetail:       document.getElementById('progDetail'),
    progBarWrap:      document.getElementById('progBarWrap'),
    progEngines:      document.getElementById('progEngines'),
    progTime:         document.getElementById('progTime'),

    // Result
    resultSection:    document.getElementById('resultSection'),
    resultGrade:      document.getElementById('resultGrade'),
    resultSub:        document.getElementById('resultSub'),
    statBeforeVal:    document.getElementById('statBeforeVal'),
    statAfterVal:     document.getElementById('statAfterVal'),
    arrowPct:         document.getElementById('arrowPct'),
    rvBarAfter:       document.getElementById('rvBarAfter'),
    statSaved:        document.getElementById('statSaved'),
    statEngine:       document.getElementById('statEngine'),
    statTime:         document.getElementById('statTime'),
    statScore:        document.getElementById('statScore'),
    dlBtn:            document.getElementById('dlBtn'),
    dlFileName:       document.getElementById('dlFileName'),
    dlFileSize:       document.getElementById('dlFileSize'),
    erTable:          document.getElementById('erTable'),
    engDetailToggle:  document.getElementById('engDetailToggle'),
    engReport:        document.getElementById('engReport'),
    engChev:          document.getElementById('engChev'),

    // FAB & scroll
    fabBtn:       document.getElementById('fabBtn'),
    scrollTopBtn: document.getElementById('scrollTop'),
    toastWrap:    document.getElementById('toastWrap'),
  };

  if (!D.dropZone || !D.compressBtn) {
    console.error('[IshuTools compress-pdf] Critical DOM refs missing — aborting init');
    return;
  }

  /* ── Boot sequence ──────────────────────────────────────────────── */
  initTheme();
  initSoundToggle();
  initBgCanvas();
  initDropZone();
  initPresets();
  initTargetSize();
  initAdvancedOptions();
  initFaq();
  initCounters();
  initScrollTop();
  initKeyboard();
  initRevealAnimations();
  updateActionState();
  fetchEngineCount();

  /* ── Event bindings ─────────────────────────────────────────────── */
  D.themeToggle.addEventListener('click', toggleTheme);
  D.soundToggle.addEventListener('click', toggleSound);
  D.compressBtn.addEventListener('click', doCompress);

  document.getElementById('compressAgainBtn')?.addEventListener('click', resetTool);
  document.getElementById('tweakBtn')?.addEventListener('click', tweakSettings);

  D.fabBtn.addEventListener('click', () => {
    if (FILE && !D.compressBtn.disabled) doCompress();
    else D.fileInput.click();
  });

  /* ── Global paste (paste PDF from clipboard) ────────────────────── */
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type === 'application/pdf' || item.kind === 'file') {
        const f = item.getAsFile();
        if (f && (f.type === 'application/pdf' || f.name?.endsWith('.pdf'))) {
          handleFile(f);
          break;
        }
      }
    }
  });

  /* ── Beforeunload guard ─────────────────────────────────────────── */
  window.addEventListener('beforeunload', (e) => {
    if (FILE && !COMPRESS_DONE) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ── Welcome toast ──────────────────────────────────────────────── */
  setTimeout(() => {
    toast(
      '12-Engine PDF Compressor',
      'Lossless mode • No size limit • No watermark • by Ishu Kumar (ISHUKR41)',
      'info',
      4000
    );
  }, 1100);

  console.log('[IshuTools] Compress PDF v26.0 ready — by Ishu Kumar (ISHUKR41 / ISHUKR75)');
});
