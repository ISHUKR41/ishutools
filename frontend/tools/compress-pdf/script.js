/**
 * IshuTools Compress PDF — script.js v25.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 *
 * Features:
 *  - Upload (drag/drop + click), zero file size limit
 *  - PDF analysis via /api/compress-pdf/analyze
 *  - SSE progress via /api/compress-pdf/progress/<jobId>
 *  - 5 presets + target size mode + 12 advanced options
 *  - Engine status pill updates during compression
 *  - Quality-preserved verification
 *  - Reduction visualization bar + animated stats
 *  - Download with fahhhhh.mp3 sound
 *  - Canvas confetti on success
 *  - Dark/light theme toggle
 *  - Scroll-to-top + FAB
 *  - FAQ accordion
 *  - Counter animation (IntersectionObserver)
 *  - Background particle canvas
 *  - localStorage history (last 5 results)
 *  - Keyboard shortcuts: Ctrl+Enter = compress, Escape = reset
 *  - Quick combo presets (email, archive, web, max, reset)
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

let FILE        = null;   // File object
let ANALYSIS    = null;   // Last analysis result
let RESULT      = null;   // Last compression result
let PRESET      = 'medium'; // Active preset
let COMPRESSING = false;  // Guard flag
let SSE_SOURCE  = null;   // EventSource for progress
let _PROG_INT   = null;   // Simulated progress interval
let _startTime  = 0;      // Compression start time (ms)
let _origStem   = '';     // Original filename without .pdf extension

// DOM refs — all null at top level, populated in DOMContentLoaded
let D = null;

// ── Sound helper ──────────────────────────────────────────────────────────
const S = (key) => {
  if (window.SOUNDS && typeof window.SOUNDS[key] === 'function') {
    try { window.SOUNDS[key](); } catch (_) {}
  }
};

// ── History ───────────────────────────────────────────────────────────────
const HISTORY_KEY = 'cp_history_v25';
const MAX_HIST    = 5;

// ── Preset default labels ─────────────────────────────────────────────────
const PRESET_META = {
  lossless: { label: '~2–25% smaller',  stars: '★★★★★' },
  high:     { label: '~10–45% smaller', stars: '★★★★½' },
  medium:   { label: '~25–65% smaller', stars: '★★★★'  },
  low:      { label: '~40–80% smaller', stars: '★★★'   },
  screen:   { label: '~65–92% smaller', stars: '★★'    },
};

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {

  D = {
    // Drop zone
    dropZone:        document.getElementById('dropZone'),
    fileInput:       document.getElementById('fileInput'),
    fileInfo:        document.getElementById('fileInfo'),
    fiName:          document.getElementById('fiName'),
    fiSize:          document.getElementById('fiSize'),
    fiPages:         document.getElementById('fiPages'),
    fiType:          document.getElementById('fiType'),
    fiVersion:       document.getElementById('fiVersion'),
    fiThumb:         document.getElementById('fiThumb'),
    fiRemove:        document.getElementById('fiRemove'),
    fiAnalyze:       document.getElementById('fiAnalyze'),
    analyzeFill:     document.getElementById('analyzeFill'),
    fiChips:         document.getElementById('fiChips'),
    chipImgVal:      document.getElementById('chipImgVal'),
    chipCompVal:     document.getElementById('chipCompVal'),
    chipTypeVal:     document.getElementById('chipTypeVal'),
    chipWarn:        document.getElementById('chipWarn'),
    chipWarnVal:     document.getElementById('chipWarnVal'),
    recBanner:       document.getElementById('recBanner'),
    recText:         document.getElementById('recText'),

    // Presets
    presetGrid:      document.getElementById('presetGrid'),

    // Target size
    targetToggle:    document.getElementById('targetToggle'),
    targetInputs:    document.getElementById('targetInputs'),
    targetChev:      document.getElementById('targetChev'),
    targetKb:        document.getElementById('targetKb'),

    // Advanced opts
    advToggle:       document.getElementById('advToggle'),
    advOpts:         document.getElementById('advOpts'),
    advChev:         document.getElementById('advChev'),
    advCount:        document.getElementById('advCount'),
    optGrayscale:    document.getElementById('optGrayscale'),
    optLinearize:    document.getElementById('optLinearize'),
    optDedup:        document.getElementById('optDedup'),
    optFonts:        document.getElementById('optFonts'),
    optMeta:         document.getElementById('optMeta'),
    optAnnot:        document.getElementById('optAnnot'),
    optForms:        document.getElementById('optForms'),
    optJS:           document.getElementById('optJS'),
    optThumbs:       document.getElementById('optThumbs'),
    optEmbedded:     document.getElementById('optEmbedded'),
    optICC:          document.getElementById('optICC'),
    optLinks:        document.getElementById('optLinks'),
    optPassword:     document.getElementById('optPassword'),
    optFlatten:      document.getElementById('optFlatten'),
    pwEye:           document.getElementById('pwEye'),

    // Compress button
    compressBtn:     document.getElementById('compressBtn'),
    compressBtnText: document.getElementById('compressBtnText'),
    actionMetaText:  document.getElementById('actionMetaText'),

    // Progress
    progressSection: document.getElementById('progressSection'),
    progStage:       document.getElementById('progStage'),
    progDetail:      document.getElementById('progDetail'),
    progFill:        document.getElementById('progFill'),
    progPct:         document.getElementById('progPct'),
    progBarWrap:     document.getElementById('progBarWrap'),
    progTime:        document.getElementById('progTime'),

    // Result
    resultSection:   document.getElementById('resultSection'),
    statBeforeVal:   document.getElementById('statBeforeVal'),
    statAfterVal:    document.getElementById('statAfterVal'),
    arrowPct:        document.getElementById('arrowPct'),
    statSaved:       document.getElementById('statSaved'),
    statEngine:      document.getElementById('statEngine'),
    statTime:        document.getElementById('statTime'),
    statScore:       document.getElementById('statScore'),
    resultGrade:     document.getElementById('resultGrade'),
    resultSub:       document.getElementById('resultSub'),
    rvBarAfter:      document.getElementById('rvBarAfter'),
    dlBtn:           document.getElementById('dlBtn'),
    dlFileName:      document.getElementById('dlFileName'),
    dlFileSize:      document.getElementById('dlFileSize'),
    compressAgainBtn:document.getElementById('compressAgainBtn'),
    tweakBtn:        document.getElementById('tweakBtn'),
    engDetailToggle: document.getElementById('engDetailToggle'),
    engReport:       document.getElementById('engReport'),
    engChev:         document.getElementById('engChev'),
    erTable:         document.getElementById('erTable'),

    // Misc
    toastWrap:       document.getElementById('toastWrap'),
    themeToggle:     document.getElementById('themeToggle'),
    themeIcon:       document.getElementById('themeIcon'),
    fabBtn:          document.getElementById('fabBtn'),
    scrollTop:       document.getElementById('scrollTop'),
    bgCanvas:        document.getElementById('bgCanvas'),
    engineCount:     document.getElementById('engineCount'),
    enginePill:      document.getElementById('enginePill'),
    uploadSection:   document.getElementById('uploadSection'),
    presetsSection:  document.getElementById('presetsSection'),
  };

  initBgCanvas();
  restoreTheme();
  initTheme();
  initDropZone();
  initPresets();
  initAdvancedOpts();
  initTargetSize();
  initCompressBtn();
  initResultActions();
  initFAQ();
  initCounters();
  initFAB();
  initScrollTop();
  initKeyboard();
  loadEngineStatus();
});

// ═══════════════════════════════════════════════════════════════════════════
// BACKGROUND PARTICLE CANVAS
// ═══════════════════════════════════════════════════════════════════════════

function initBgCanvas() {
  const canvas = D.bgCanvas;
  if (!canvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    canvas.style.display = 'none';
    return;
  }

  const ctx = canvas.getContext('2d');
  let W, H, pts = [], raf = null;

  const resize = () => {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    pts = Array.from({ length: Math.min(70, Math.floor(W * H / 18000)) }, mkPt);
  };

  const mkPt = () => ({
    x:  Math.random() * (W || window.innerWidth),
    y:  Math.random() * (H || window.innerHeight),
    r:  Math.random() * 1.4 + .5,
    vx: (Math.random() - .5) * .28,
    vy: (Math.random() - .5) * .28,
    a:  Math.random() * .4 + .08,
    em: Math.random() > .65,
  });

  const frame = () => {
    ctx.clearRect(0, 0, W, H);
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';

    // Connections
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx*dx + dy*dy);
        if (d < 120) {
          const a = (1 - d / 120) * .07;
          ctx.beginPath();
          ctx.strokeStyle = dark ? `rgba(16,185,129,${a})` : `rgba(5,150,105,${a})`;
          ctx.lineWidth = .5;
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }

    // Particles
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.em
        ? (dark ? `rgba(16,185,129,${p.a})` : `rgba(5,150,105,${p.a})`)
        : (dark ? `rgba(100,116,139,${p.a*.6})` : `rgba(148,163,184,${p.a*.6})`);
      ctx.fill();
    }

    raf = requestAnimationFrame(frame);
  };

  window.addEventListener('resize', () => { resize(); }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
    else if (!raf) frame();
  });

  resize();
  frame();
}

// ═══════════════════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════════════════

function initTheme() {
  if (!D.themeToggle) return;
  D.themeToggle.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('cp_theme', next);
    updateThemeIcon(next);
  });
}

function restoreTheme() {
  const saved = localStorage.getItem('cp_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function updateThemeIcon(theme) {
  if (!D || !D.themeIcon) return;
  D.themeIcon.className = theme === 'dark' ? 'fa fa-sun' : 'fa fa-moon';
}

// ═══════════════════════════════════════════════════════════════════════════
// DROP ZONE
// ═══════════════════════════════════════════════════════════════════════════

function initDropZone() {
  if (!D.dropZone) return;

  // Click on zone → open file picker
  D.dropZone.addEventListener('click', (e) => {
    if (e.target !== D.fileInput) D.fileInput.click();
  });

  D.dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      D.fileInput.click();
    }
  });

  D.fileInput.addEventListener('change', () => {
    if (D.fileInput.files && D.fileInput.files[0]) {
      handleFile(D.fileInput.files[0]);
    }
  });

  // Drag-and-drop
  D.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    D.dropZone.classList.add('cp-drag-over');
  });

  D.dropZone.addEventListener('dragleave', (e) => {
    if (!D.dropZone.contains(e.relatedTarget)) {
      D.dropZone.classList.remove('cp-drag-over');
    }
  });

  D.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    D.dropZone.classList.remove('cp-drag-over');
    const files = e.dataTransfer.files;
    if (!files || !files.length) return;
    const pdf = Array.from(files).find(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (pdf) handleFile(pdf);
    else showToast('error', 'Wrong file type', 'Please drop a PDF file');
  });

  // Global drag guard
  window.addEventListener('dragover', (e) => e.preventDefault(), { passive: false });
  window.addEventListener('drop',     (e) => e.preventDefault(), { passive: false });

  // Remove file
  if (D.fiRemove) {
    D.fiRemove.addEventListener('click', (e) => {
      e.stopPropagation();
      resetFile();
    });
  }
}

function handleFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    showToast('error', 'Invalid file type', 'Only PDF files are accepted');
    return;
  }

  FILE       = file;
  _origStem  = file.name.replace(/\.pdf$/i, '');

  S('are_bhai_bhai_bhai'); // file-add sound

  showFileInfo(file);
  analyzeFile(file);
  enableCompressBtn();
  updateActionMeta();

  if (D.fabBtn) D.fabBtn.removeAttribute('hidden');
}

function showFileInfo(file) {
  if (!D.fileInfo) return;

  D.fiName.textContent = file.name;
  D.fiSize.innerHTML   = `<i class="fa fa-weight-hanging"></i> ${humanSize(file.size)}`;
  D.fiPages.innerHTML  = `<i class="fa fa-file"></i> analysing…`;
  D.fiType.innerHTML   = `<i class="fa fa-tag"></i> PDF`;
  D.fiVersion.innerHTML= `<i class="fa fa-code"></i> v?.?`;
  D.fileInfo.removeAttribute('hidden');
  D.fiChips.setAttribute('hidden', '');
  D.recBanner.setAttribute('hidden', '');
}

function analyzeFile(file) {
  D.fiAnalyze.removeAttribute('hidden');
  D.fiChips.setAttribute('hidden', '');

  let progress = 0;
  const fillInt = setInterval(() => {
    progress = Math.min(progress + Math.random() * 18, 85);
    if (D.analyzeFill) D.analyzeFill.style.width = progress + '%';
  }, 120);

  const fd = new FormData();
  fd.append('file', file);

  fetch('/api/compress-pdf/analyze', { method: 'POST', body: fd })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(data => {
      clearInterval(fillInt);
      if (D.analyzeFill) D.analyzeFill.style.width = '100%';
      setTimeout(() => {
        D.fiAnalyze.setAttribute('hidden', '');
        ANALYSIS = data;
        updateFileChips(data);
        updatePresetSavings(data);
        showRecommendation(data);
      }, 300);
    })
    .catch(() => {
      clearInterval(fillInt);
      D.fiAnalyze.setAttribute('hidden', '');
    });
}

function updateFileChips(data) {
  if (!D.fiChips) return;

  if (data.page_count) {
    D.fiPages.innerHTML = `<i class="fa fa-file"></i> ${data.page_count} page${data.page_count !== 1 ? 's' : ''}`;
  }
  if (data.pdf_version && data.pdf_version !== 'unknown') {
    D.fiVersion.innerHTML = `<i class="fa fa-code"></i> PDF ${data.pdf_version}`;
  }

  D.chipImgVal.textContent   = data.image_count      ?? '—';
  D.chipCompVal.textContent  = data.compressibility_score ? Math.round(data.compressibility_score) : '—';
  D.chipTypeVal.textContent  = (data.pdf_type || '').replace(/_/g, '-') || '—';

  const warns = [];
  if (data.has_javascript)          warns.push('Contains JavaScript');
  if (data.has_encryption)          warns.push('Password-protected');
  if (data.duplicate_image_count > 0) warns.push(`${data.duplicate_image_count} duplicate images`);

  if (warns.length) {
    D.chipWarn.removeAttribute('hidden');
    D.chipWarnVal.textContent = warns[0];
  } else {
    D.chipWarn.setAttribute('hidden', '');
  }

  D.fiChips.removeAttribute('hidden');
}

function updatePresetSavings(data) {
  const ests = data.estimated_reductions_by_preset;
  if (!ests) return;
  for (const [preset, pct] of Object.entries(ests)) {
    const el = document.getElementById(`save-${preset}`);
    if (el && pct > 0) el.textContent = `~${Math.round(pct)}% savings expected`;
  }
}

function showRecommendation(data) {
  const recs = data.recommendations;
  if (!recs || !recs.length) return;
  D.recText.textContent = recs[0];
  D.recBanner.removeAttribute('hidden');
}

function resetFile() {
  FILE = null; ANALYSIS = null; _origStem = '';
  if (D.fileInfo)   D.fileInfo.setAttribute('hidden', '');
  if (D.fiChips)    D.fiChips.setAttribute('hidden', '');
  if (D.recBanner)  D.recBanner.setAttribute('hidden', '');
  if (D.fiAnalyze)  D.fiAnalyze.setAttribute('hidden', '');
  if (D.fileInput)  D.fileInput.value = '';
  disableCompressBtn();
  updateActionMeta();
  if (D.fabBtn) D.fabBtn.setAttribute('hidden', '');
  hideResult();

  for (const [preset, meta] of Object.entries(PRESET_META)) {
    const el = document.getElementById(`save-${preset}`);
    if (el) el.textContent = meta.label;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESETS
// ═══════════════════════════════════════════════════════════════════════════

function initPresets() {
  if (!D.presetGrid) return;
  D.presetGrid.querySelectorAll('.cp-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-preset');
      if (p) selectPreset(p);
    });
  });
  selectPreset('medium', false);
}

function selectPreset(preset, sound = true) {
  PRESET = preset;
  D.presetGrid.querySelectorAll('.cp-preset-btn').forEach(btn => {
    const active = btn.getAttribute('data-preset') === preset;
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
    btn.classList.toggle('active', active);
  });
  updateActionMeta();
  if (sound) S('waah_kya_scene_hai');
}

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

function initAdvancedOpts() {
  if (!D.advToggle) return;

  D.advToggle.addEventListener('click', () => {
    const open = D.advToggle.getAttribute('aria-expanded') === 'true';
    D.advToggle.setAttribute('aria-expanded', String(!open));
    if (!open) D.advOpts.removeAttribute('hidden');
    else        D.advOpts.setAttribute('hidden', '');
  });

  // Password show/hide
  if (D.pwEye) {
    D.pwEye.addEventListener('click', () => {
      const t = D.optPassword.type === 'password' ? 'text' : 'password';
      D.optPassword.type = t;
      D.pwEye.querySelector('i').className = t === 'text' ? 'fa fa-eye-slash' : 'fa fa-eye';
    });
  }

  // Active count badge
  const toggles = [
    D.optGrayscale, D.optLinearize, D.optDedup, D.optFonts,
    D.optMeta, D.optAnnot, D.optForms, D.optJS,
    D.optThumbs, D.optEmbedded, D.optICC, D.optLinks, D.optFlatten,
  ].filter(Boolean);

  const syncCount = () => {
    const n = toggles.filter(t => t.checked).length;
    if (D.advCount) {
      if (n > 0) { D.advCount.textContent = `${n} active`; D.advCount.removeAttribute('hidden'); }
      else        D.advCount.setAttribute('hidden', '');
    }
  };

  toggles.forEach(t => t.addEventListener('change', syncCount));
  syncCount();

  // Quick combo presets
  document.querySelectorAll('.cp-qp-btn').forEach(btn => {
    btn.addEventListener('click', () => applyQuickPreset(btn.getAttribute('data-qp')));
  });

  // Target size quick-pick buttons
  document.querySelectorAll('.cp-tpr').forEach(btn => {
    btn.addEventListener('click', () => {
      const kb = parseInt(btn.getAttribute('data-kb'));
      if (D.targetKb && !isNaN(kb)) {
        D.targetKb.value = kb;
        document.querySelectorAll('.cp-tpr').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      }
    });
  });
}

function applyQuickPreset(key) {
  const configs = {
    email: {
      preset: 'low',
      grayscale:false, linearize:false, dedup:true, fonts:true,
      meta:true, annot:false, forms:false, js:true,
      thumbs:true, embedded:false, icc:false, links:false, flatten:false,
    },
    archive: {
      preset: 'lossless',
      grayscale:false, linearize:false, dedup:true, fonts:true,
      meta:false, annot:false, forms:false, js:true,
      thumbs:true, embedded:false, icc:false, links:false, flatten:false,
    },
    web: {
      preset: 'medium',
      grayscale:false, linearize:true, dedup:true, fonts:true,
      meta:true, annot:false, forms:false, js:true,
      thumbs:true, embedded:false, icc:true, links:false, flatten:false,
    },
    max: {
      preset: 'screen',
      grayscale:false, linearize:true, dedup:true, fonts:true,
      meta:true, annot:true, forms:false, js:true,
      thumbs:true, embedded:true, icc:true, links:false, flatten:false,
    },
    reset: {
      preset: 'medium',
      grayscale:false, linearize:false, dedup:true, fonts:true,
      meta:false, annot:false, forms:false, js:false,
      thumbs:false, embedded:false, icc:false, links:false, flatten:false,
    },
  };

  const cfg = configs[key];
  if (!cfg) return;

  selectPreset(cfg.preset, false);
  setChk(D.optGrayscale, cfg.grayscale);
  setChk(D.optLinearize, cfg.linearize);
  setChk(D.optDedup,     cfg.dedup);
  setChk(D.optFonts,     cfg.fonts);
  setChk(D.optMeta,      cfg.meta);
  setChk(D.optAnnot,     cfg.annot);
  setChk(D.optForms,     cfg.forms);
  setChk(D.optJS,        cfg.js);
  setChk(D.optThumbs,    cfg.thumbs);
  setChk(D.optEmbedded,  cfg.embedded);
  setChk(D.optICC,       cfg.icc);
  setChk(D.optLinks,     cfg.links);
  setChk(D.optFlatten,   cfg.flatten);

  // Open adv panel for non-reset combos
  if (key !== 'reset' && D.advOpts) {
    D.advOpts.removeAttribute('hidden');
    D.advToggle.setAttribute('aria-expanded', 'true');
  }

  showToast('info', key === 'reset' ? 'Options reset' : `"${key}" preset applied`, '');
  S('waah_kya_scene_hai');
}

function setChk(el, val) { if (el) el.checked = !!val; }

// ═══════════════════════════════════════════════════════════════════════════
// TARGET SIZE
// ═══════════════════════════════════════════════════════════════════════════

function initTargetSize() {
  if (!D.targetToggle) return;
  D.targetToggle.addEventListener('click', () => {
    const open = D.targetToggle.getAttribute('aria-expanded') === 'true';
    D.targetToggle.setAttribute('aria-expanded', String(!open));
    if (!open) D.targetInputs.removeAttribute('hidden');
    else        D.targetInputs.setAttribute('hidden', '');
    if (D.targetChev) D.targetChev.style.transform = !open ? 'rotate(180deg)' : '';
  });
}

function getTargetKb() {
  if (D.targetToggle.getAttribute('aria-expanded') !== 'true') return 0;
  const v = parseInt(D.targetKb.value);
  return !isNaN(v) && v >= 10 ? v : 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPRESS BUTTON
// ═══════════════════════════════════════════════════════════════════════════

function initCompressBtn() {
  if (D.compressBtn) {
    D.compressBtn.addEventListener('click', () => {
      if (COMPRESSING) return;
      if (!FILE) { D.fileInput.click(); return; }
      startCompression();
    });
  }
}

function enableCompressBtn() {
  if (!D.compressBtn) return;
  D.compressBtn.disabled = false;
  D.compressBtn.setAttribute('aria-disabled', 'false');
  D.compressBtnText.textContent = 'Compress PDF';
}

function disableCompressBtn() {
  if (!D.compressBtn) return;
  D.compressBtn.disabled = true;
  D.compressBtn.setAttribute('aria-disabled', 'true');
  D.compressBtnText.textContent = 'Upload a PDF to start';
}

function updateActionMeta() {
  if (!D.actionMetaText) return;
  if (!FILE) { D.actionMetaText.textContent = 'Select a compression preset above'; return; }
  const m = PRESET_META[PRESET];
  const name = PRESET.charAt(0).toUpperCase() + PRESET.slice(1);
  D.actionMetaText.textContent = `${name} preset · Quality: ${m?.stars || ''}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPRESSION
// ═══════════════════════════════════════════════════════════════════════════

function startCompression() {
  if (!FILE || COMPRESSING) return;
  COMPRESSING = true;
  _startTime  = Date.now();

  S('cameraman_focus_karo'); // compress-start sound

  const fd = new FormData();
  fd.append('file',                FILE);
  fd.append('quality',             PRESET);
  fd.append('grayscale',           D.optGrayscale.checked  ? 'true' : 'false');
  fd.append('linearize',           D.optLinearize.checked  ? 'true' : 'false');
  fd.append('remove_duplicate_images', D.optDedup.checked  ? 'true' : 'false');
  fd.append('subset_fonts',        D.optFonts.checked      ? 'true' : 'false');
  fd.append('strip_metadata',      D.optMeta.checked       ? 'true' : 'false');
  fd.append('remove_annotations',  D.optAnnot.checked      ? 'true' : 'false');
  fd.append('remove_forms',        D.optForms.checked      ? 'true' : 'false');
  fd.append('remove_javascript',   D.optJS.checked         ? 'true' : 'false');
  fd.append('remove_thumbnails',   D.optThumbs.checked     ? 'true' : 'false');
  fd.append('remove_embedded_files', D.optEmbedded.checked ? 'true' : 'false');
  fd.append('remove_icc_profiles', D.optICC.checked        ? 'true' : 'false');
  fd.append('remove_links',        D.optLinks.checked      ? 'true' : 'false');
  fd.append('flatten_transparency',D.optFlatten.checked    ? 'true' : 'false');

  const pw = D.optPassword.value.trim();
  if (pw) fd.append('password', pw);

  const tkb = getTargetKb();
  if (tkb > 0) fd.append('target_size_kb', tkb);

  // Job ID for SSE
  const jobId = _origStem.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + Date.now();
  fd.append('job_id', jobId);

  showProgress();
  setBtnBusy(true);
  hideResult();
  resetEngineStatus();
  startSimProgress();
  startSSE(jobId);

  fetch('/api/compress-pdf', { method: 'POST', body: fd })
    .then(r => {
      if (!r.ok) return r.json().then(e => Promise.reject(e));
      return r.blob().then(blob => ({ blob, headers: r.headers }));
    })
    .then(({ blob, headers }) => {
      stopSSE();
      stopSimProgress();

      const inSize  = parseInt(headers.get('X-Input-Size')    || String(FILE.size));
      const outSize = parseInt(headers.get('X-Output-Size')   || String(blob.size));
      const pct     = parseFloat(headers.get('X-Reduction-Pct') || '0');
      const engine  = headers.get('X-Engine-Used')  || '';
      const timeMs  = parseInt(headers.get('X-Processing-Ms') || String(Date.now() - _startTime));
      const score   = parseInt(headers.get('X-Quality-Score') || '0');
      const grade   = headers.get('X-Quality-Grade') || 'C';
      const tried   = headers.get('X-Engines-Tried') || '';

      RESULT = { blob, inSize, outSize, pct, engine, timeMs, score, grade, tried };

      updateProgress(100, 'Done!', `Reduced by ${pct.toFixed(1)}%`);
      setTimeout(() => {
        hideProgress();
        showResult(RESULT);
        S('waah_kya_scene_hai');
      }, 600);
    })
    .catch(err => {
      stopSSE();
      stopSimProgress();
      hideProgress();
      COMPRESSING = false;
      setBtnBusy(false);
      const msg = (err && (err.error || err.message)) || 'Compression failed — please try again';
      showToast('error', 'Compression Failed', msg);
      S('eh_eh_eh_ehhhhhh');
    });
}

function setBtnBusy(busy) {
  if (!D.compressBtn) return;
  D.compressBtn.disabled = busy;
  D.compressBtnText.textContent = busy ? 'Compressing…' : (FILE ? 'Compress PDF' : 'Upload a PDF to start');
}

// ═══════════════════════════════════════════════════════════════════════════
// SSE PROGRESS
// ═══════════════════════════════════════════════════════════════════════════

function startSSE(jobId) {
  try {
    SSE_SOURCE = new EventSource(`/api/compress-pdf/progress/${encodeURIComponent(jobId)}`);
    SSE_SOURCE.addEventListener('progress', (e) => {
      try {
        const d = JSON.parse(e.data);
        if (typeof d.pct === 'number') {
          updateProgress(d.pct, d.stage || '', d.detail || '');
          markEngineRunning(d.engine || '', d.stage || '');
        }
      } catch (_) {}
    });
    SSE_SOURCE.onerror = () => stopSSE();
  } catch (_) {}
}

function stopSSE() {
  if (SSE_SOURCE) { SSE_SOURCE.close(); SSE_SOURCE = null; }
}

function markEngineRunning(eng, stage) {
  const map = {
    pikepdf: 'es-pikepdf', ghostscript: 'es-gs', gs: 'es-gs',
    pymupdf: 'es-fitz', fitz: 'es-fitz', qpdf: 'es-qpdf',
    mutool: 'es-mutool', pillow: 'es-pillow', pypdf: 'es-pypdf',
    dedup: 'es-dedup',
  };
  const lc = (eng + ' ' + stage).toLowerCase();
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (lc.includes(key)) {
      if (!el.classList.contains('done')) el.classList.add('running');
    }
  }
}

function markEngineDone(eng) {
  const map = {
    'pikepdf-lossless': 'es-pikepdf', pikepdf: 'es-pikepdf',
    ghostscript: 'es-gs', gs: 'es-gs',
    pymupdf: 'es-fitz', fitz: 'es-fitz',
    qpdf: 'es-qpdf', mutool: 'es-mutool',
    pillow: 'es-pillow', pypdf: 'es-pypdf',
    dedup: 'es-dedup',
  };
  const lc = (eng || '').toLowerCase();
  for (const [key, id] of Object.entries(map)) {
    if (lc.includes(key)) {
      const el = document.getElementById(id);
      if (el) { el.classList.remove('running'); el.classList.add('done'); }
    }
  }
}

function resetEngineStatus() {
  ['es-pikepdf','es-gs','es-fitz','es-qpdf','es-mutool','es-pillow','es-pypdf','es-dedup']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.className = 'cp-es-item';
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// SIMULATED PROGRESS (fallback when SSE not available)
// ═══════════════════════════════════════════════════════════════════════════

const SIM_STAGES = [
  [8,  'Lossless compression…',  'pikepdf DEFLATE-9 stream recompression', 'pikepdf-lossless'],
  [16, 'qpdf recompression…',    'Stream recompression + optional linearize', 'qpdf'],
  [22, 'Content streams…',       'Compressing PDF drawing commands', 'pypdf'],
  [28, 'mutool clean…',          'MuPDF garbage collection + compress', 'mutool'],
  [34, 'Deduplicating…',         'MD5 hash-based duplicate image removal', 'dedup'],
  [40, 'pypdf optimize…',        'compress_content_streams() pass', 'pypdf'],
  [48, 'Ghostscript distiller…', 'GS /ebook or /screen preset', 'ghostscript'],
  [56, 'GS + pikepdf chain…',    'Double-pass: distill then recompress', 'pikepdf'],
  [62, 'PyMuPDF images…',        'Per-image DPI resampling', 'pymupdf'],
  [70, 'Pillow JPEG optimize…',  'Progressive JPEG with optimal settings', 'pillow'],
  [78, 'PyMuPDF full page…',     'Full page rasterization (screen preset)', 'pymupdf'],
  [85, 'Selecting best…',        'Comparing all candidate outputs'],
  [90, 'Post-processing…',       'Applying additional optimizations'],
  [95, 'Computing score…',       'Calculating compression quality grade'],
];

function startSimProgress() {
  let pct = 0, idx = 0;

  _PROG_INT = setInterval(() => {
    if (idx < SIM_STAGES.length) {
      const [target, stage, detail, eng] = SIM_STAGES[idx];
      if (pct < target) {
        pct = Math.min(pct + Math.random() * 3.5 + .8, target);
        updateProgress(Math.round(pct), stage, detail);
        if (eng) markEngineRunning(eng, stage);
      } else {
        if (eng) markEngineDone(eng);
        idx++;
      }
    } else {
      if (pct < 95) pct = Math.min(pct + .4, 95);
      updateProgress(Math.round(pct), 'Almost done…', 'Finalizing compressed output');
    }

    // Time counter
    if (D.progTime) {
      const sec = Math.floor((Date.now() - _startTime) / 1000);
      D.progTime.textContent = `${sec}s elapsed`;
    }
  }, 190);
}

function stopSimProgress() {
  if (_PROG_INT) { clearInterval(_PROG_INT); _PROG_INT = null; }
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRESS UI
// ═══════════════════════════════════════════════════════════════════════════

function showProgress() {
  if (D.progressSection) {
    D.progressSection.removeAttribute('hidden');
    D.progressSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function hideProgress() {
  if (D.progressSection) D.progressSection.setAttribute('hidden', '');
}

function updateProgress(pct, stage, detail) {
  if (D.progFill)   D.progFill.style.width = pct + '%';
  if (D.progPct)    D.progPct.textContent  = pct + '%';
  if (D.progBarWrap) D.progBarWrap.setAttribute('aria-valuenow', pct);
  if (D.progStage  && stage)  D.progStage.textContent  = stage;
  if (D.progDetail && detail) D.progDetail.textContent = detail;
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT UI
// ═══════════════════════════════════════════════════════════════════════════

function showResult(res) {
  COMPRESSING = false;
  setBtnBusy(false);

  if (!D.resultSection) return;
  D.resultSection.removeAttribute('hidden');

  const inH  = humanSize(res.inSize);
  const outH = humanSize(res.outSize);
  const savedB = Math.max(0, res.inSize - res.outSize);
  const pct  = parseFloat(res.pct).toFixed(1);

  if (D.statBeforeVal) D.statBeforeVal.textContent = inH;
  if (D.statAfterVal)  D.statAfterVal.textContent  = outH;
  if (D.arrowPct)      D.arrowPct.textContent      = `−${pct}%`;
  if (D.statSaved)     D.statSaved.textContent     = humanSize(savedB);
  if (D.statEngine) {
    const eng = (res.engine || '—').replace('pikepdf-lossless', 'pikepdf-L').split('+')[0];
    D.statEngine.textContent = eng;
  }
  if (D.statTime) {
    D.statTime.textContent = res.timeMs > 1000
      ? `${(res.timeMs / 1000).toFixed(1)}s`
      : `${res.timeMs}ms`;
  }
  if (D.statScore)  D.statScore.textContent  = `${res.score}/100`;
  if (D.resultGrade) D.resultGrade.textContent = res.grade;

  if (D.resultSub) {
    D.resultSub.textContent = parseFloat(pct) > 0
      ? `Saved ${humanSize(savedB)} (${pct}% smaller) · Engine: ${res.engine || 'auto'}`
      : 'File already maximally compressed — original returned';
  }

  // Reduction bar animation
  if (D.rvBarAfter) {
    const barW = Math.max(6, Math.round(100 - parseFloat(pct)));
    setTimeout(() => { D.rvBarAfter.style.width = barW + '%'; }, 400);
  }

  // Grade pop animation
  if (D.resultGrade) {
    D.resultGrade.style.transform = 'scale(0) rotate(-10deg)';
    setTimeout(() => {
      D.resultGrade.style.transition = 'transform .45s cubic-bezier(.34,1.56,.64,1)';
      D.resultGrade.style.transform  = 'scale(1) rotate(0)';
    }, 250);
  }

  // Download link
  const dlName = `${_origStem}_compressed.pdf`;
  if (D.dlBtn) {
    const url = URL.createObjectURL(res.blob);
    D.dlBtn.href     = url;
    D.dlBtn.download = dlName;
    if (D.dlFileName) D.dlFileName.textContent = dlName;
    if (D.dlFileSize) D.dlFileSize.textContent = outH;

    // Sound + confetti on click
    D.dlBtn.addEventListener('click', () => {
      S('fahhhhh'); // fahhhhh.mp3 = download
      setTimeout(launchConfetti, 100);
    }, { once: true });
  }

  // Build engine report table
  buildEngineReport(res.tried);

  // Auto-scroll
  setTimeout(() => {
    D.resultSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 100);

  // Confetti for meaningful savings
  if (parseFloat(pct) >= 25) setTimeout(launchConfetti, 500);

  // Save to history
  saveHistory({
    name:   FILE ? FILE.name : 'unknown.pdf',
    inSize: res.inSize, outSize: res.outSize, pct,
    engine: res.engine, preset: PRESET,
    date:   new Date().toISOString(),
  });
}

function hideResult() {
  if (D.resultSection) D.resultSection.setAttribute('hidden', '');
}

function buildEngineReport(tried) {
  if (!D.erTable || !tried) return;
  D.erTable.innerHTML = '';

  const entries = tried.split('|').filter(Boolean);
  entries.forEach(entry => {
    const parts  = entry.split(':');
    const name   = parts[0] || '';
    const pctStr = parts[1] || '';
    const status = parts[2] || '';

    const row = document.createElement('div');
    row.className = 'cp-er-row';
    if (RESULT && name === RESULT.engine) row.classList.add('er-winner');

    const pctDisp = pctStr ? `−${parseFloat(pctStr).toFixed(1)}%` : '—';
    const statusDisp = name === (RESULT?.engine || '') ? '✓ Winner'
      : status === 'error'  ? '✗ Failed'
      : status === 'larger' ? '→ Larger'
      : '→ Tried';

    row.innerHTML = `
      <div class="cp-er-eng">${name}</div>
      <div class="cp-er-pct">${pctDisp}</div>
      <div class="cp-er-status">${statusDisp}</div>
    `;
    D.erTable.appendChild(row);
  });

  // Wire toggle button (once)
  if (D.engDetailToggle && !D.engDetailToggle._wired) {
    D.engDetailToggle._wired = true;
    D.engDetailToggle.addEventListener('click', () => {
      const open = D.engDetailToggle.getAttribute('aria-expanded') === 'true';
      D.engDetailToggle.setAttribute('aria-expanded', String(!open));
      if (!open) D.engReport.removeAttribute('hidden');
      else        D.engReport.setAttribute('hidden', '');
      if (D.engChev) D.engChev.style.transform = !open ? 'rotate(180deg)' : '';
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RESULT ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

function initResultActions() {
  if (D.compressAgainBtn) {
    D.compressAgainBtn.addEventListener('click', () => {
      resetFile();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (D.tweakBtn) {
    D.tweakBtn.addEventListener('click', () => {
      const target = D.presetsSection || D.uploadSection;
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFETTI
// ═══════════════════════════════════════════════════════════════════════════

function launchConfetti() {
  const colors = ['#10b981','#34d399','#6ee7b7','#6366f1','#a78bfa','#f59e0b'];

  if (typeof confetti === 'function') {
    const fire = (x) => confetti({
      particleCount: 55, spread: 65,
      origin: { x, y: .7 }, colors, gravity: 1.1, scalar: .9,
    });
    fire(.25);
    setTimeout(() => fire(.75), 150);
    setTimeout(() => fire(.5),  300);
    return;
  }

  // CSS fallback
  for (let i = 0; i < 28; i++) {
    const div = document.createElement('div');
    const c   = colors[Math.floor(Math.random() * colors.length)];
    const size = Math.random() * 8 + 4;
    div.style.cssText = `
      position:fixed;top:0;left:${Math.random()*100}%;
      width:${size}px;height:${size}px;
      border-radius:${Math.random()>.5?'50%':'2px'};
      background:${c};
      animation:cp-confetti-fall ${Math.random()*2.5+1.5}s ease ${Math.random()*.8}s both;
      z-index:9999;pointer-events:none;
    `;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 4500);
  }
}

// Inject confetti-fall keyframe if not present
(function injectConfettiFall() {
  if (document.getElementById('cp-confetti-style')) return;
  const style = document.createElement('style');
  style.id = 'cp-confetti-style';
  style.textContent = `
    @keyframes cp-confetti-fall {
      from { transform: translateY(-20px) rotate(0deg); opacity:1; }
      to   { transform: translateY(100vh) rotate(${Math.round(Math.random()*360)}deg); opacity:0; }
    }
  `;
  document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════════════════════════
// TOASTS
// ═══════════════════════════════════════════════════════════════════════════

function showToast(type, title, sub = '', duration = 4000) {
  if (!D || !D.toastWrap) return;
  const icons = { success: 'check-circle', error: 'times-circle', warn: 'exclamation-triangle', info: 'info-circle' };
  const icon  = icons[type] || 'info-circle';

  const div = document.createElement('div');
  div.className = `cp-toast cp-toast-${type}`;
  div.setAttribute('role', 'alert');
  div.innerHTML = `
    <i class="fa fa-${icon} cp-toast-icon" aria-hidden="true"></i>
    <div class="cp-toast-body">
      <div class="cp-toast-title">${title}</div>
      ${sub ? `<div class="cp-toast-sub">${sub}</div>` : ''}
    </div>
  `;
  D.toastWrap.appendChild(div);

  setTimeout(() => {
    div.classList.add('cp-toast-out');
    div.addEventListener('animationend', () => div.remove(), { once: true });
  }, duration);
}

// ═══════════════════════════════════════════════════════════════════════════
// FAQ ACCORDION
// ═══════════════════════════════════════════════════════════════════════════

function initFAQ() {
  document.querySelectorAll('.cp-faq').forEach(item => {
    const btn = item.querySelector('.cp-fq');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const open = item.classList.contains('open');
      // Close all
      document.querySelectorAll('.cp-faq.open').forEach(o => {
        if (o !== item) {
          o.classList.remove('open');
          const b = o.querySelector('.cp-fq');
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      });
      item.classList.toggle('open', !open);
      btn.setAttribute('aria-expanded', String(!open));
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COUNTERS
// ═══════════════════════════════════════════════════════════════════════════

function initCounters() {
  const items = document.querySelectorAll('.cp-trust-num[data-count]');
  if (!items.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const end = parseInt(el.getAttribute('data-count') || '0');
      if (end === 0) { el.textContent = '∞'; io.unobserve(el); return; }
      animateCount(el, 0, end, 1800);
      io.unobserve(el);
    });
  }, { threshold: .5 });

  items.forEach(el => io.observe(el));
}

function animateCount(el, start, end, dur) {
  const t0   = performance.now();
  const diff = end - start;
  const tick = (now) => {
    const prog = Math.min((now - t0) / dur, 1);
    const ease = 1 - Math.pow(1 - prog, 3);
    const cur  = Math.round(start + diff * ease);
    el.textContent = end >= 1_000_000
      ? (cur / 1_000_000).toFixed(1) + 'M+'
      : end >= 1_000
      ? (cur / 1_000).toFixed(0) + 'K+'
      : cur.toString();
    if (prog < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ═══════════════════════════════════════════════════════════════════════════
// FAB + SCROLL TOP
// ═══════════════════════════════════════════════════════════════════════════

function initFAB() {
  if (!D.fabBtn) return;
  D.fabBtn.addEventListener('click', () => {
    if (!FILE) { if (D.fileInput) D.fileInput.click(); }
    else if (!COMPRESSING) startCompression();
  });
}

function initScrollTop() {
  if (!D.scrollTop) return;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) D.scrollTop.removeAttribute('hidden');
    else D.scrollTop.setAttribute('hidden', '');
  }, { passive: true });

  D.scrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYBOARD
// ═══════════════════════════════════════════════════════════════════════════

function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (FILE && !COMPRESSING) startCompression();
    }
    if (e.key === 'Escape' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) {
      if (!COMPRESSING) resetFile();
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENGINE STATUS (from API)
// ═══════════════════════════════════════════════════════════════════════════

function loadEngineStatus() {
  fetch('/api/compress-pdf/engines')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data) return;
      const n = Object.values(data).filter(e => e.available).length;
      if (D.engineCount) D.engineCount.textContent = `${n} engines detected`;
      if (D.enginePill)  D.enginePill.innerHTML    = `<i class="fa fa-microchip"></i> ${n}-Engine Pipeline`;
    })
    .catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════
// HISTORY (localStorage)
// ═══════════════════════════════════════════════════════════════════════════

function saveHistory(entry) {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    h.unshift(entry);
    if (h.length > MAX_HIST) h.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════════════

function humanSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1_048_576)  return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1_073_741_824) return (bytes / 1_048_576).toFixed(2) + ' MB';
  return (bytes / 1_073_741_824).toFixed(2) + ' GB';
}
