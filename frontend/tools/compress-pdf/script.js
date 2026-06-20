/**
 * IshuTools Compress PDF — script.js v15.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 *
 * Features:
 * - Drop zone upload (drag+drop, click, paste, document-level drop)
 * - 5 compression presets (keyboard + mouse)
 * - Advanced options: 9 toggles + sub-rows for target size, password
 * - Real-time SSE progress with per-chip updates
 * - Result section: ring, bars, stats, grade, confetti on ≥30% savings
 * - Download with fahhhhh.mp3 sound effect
 * - Sounds: are_bhai_bhai_bhai=add, cameraman_focus_karo=start,
 *           waah_kya_scene_hai=success, fahhhhh=download,
 *           eh_eh_eh_ehhhhhh=error, jaldi_waha_sa_hato=warning
 * - Theme toggle (dark/light)
 * - Sound toggle (on/off)
 * - Animated bg canvas (particle field)
 * - IntersectionObserver counters
 * - FAQ accordion
 * - Scroll reveal (y-only, no opacity:0 flash)
 * - Ctrl+Enter keyboard shortcut
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════════════════════ */
let FILE      = null;  // File object
let JOB_ID    = null;  // Server job id
let SEL_MODE  = 'medium';
let RESULT    = null;  // Last compression result dict
let SSE_SRC   = null;  // EventSource
let _origStem = '';    // Original file stem for download name

/* DOM references — populated in DOMContentLoaded */
let D = null;

/* ═══════════════════════════════════════════════════════════════════════
   SOUNDS  (from /tools/merge-pdf/sounds/)
═══════════════════════════════════════════════════════════════════════ */
const SOUNDS_BASE = '/tools/merge-pdf/sounds/';
const SND = {
  add:     'are_bhai_bhai_bhai.mp3',
  start:   'cameraman_focus_karo.mp3',
  success: 'waah_kya_scene_hai.mp3',
  dl:      'fahhhhh.mp3',
  error:   'eh_eh_eh_ehhhhhh.mp3',
  warning: 'jaldi_waha_sa_hato.mp3',
};

let SOUND_ON = true;

function S(key) {
  if (!SOUND_ON) return;
  const src = SOUNDS_BASE + (SND[key] || '');
  if (!src) return;
  try {
    const a = new Audio(src);
    a.volume = 0.55;
    a.play().catch(() => {});
  } catch (e) {}
}

function initSound() {
  const saved = localStorage.getItem('cp-sound');
  SOUND_ON = saved !== 'off';
  _updateSoundBtn();
  if (D.soundBtn) {
    D.soundBtn.addEventListener('click', () => {
      SOUND_ON = !SOUND_ON;
      localStorage.setItem('cp-sound', SOUND_ON ? 'on' : 'off');
      _updateSoundBtn();
    });
  }
}

function _updateSoundBtn() {
  if (!D.soundIcon) return;
  D.soundIcon.className = SOUND_ON ? 'fa fa-volume-high' : 'fa fa-volume-xmark';
}

/* ═══════════════════════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = localStorage.getItem('cp-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  _updateThemeBtn(saved);

  if (D.themeBtn) {
    D.themeBtn.addEventListener('click', () => {
      const cur  = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('cp-theme', next);
      _updateThemeBtn(next);
    });
  }
}

function _updateThemeBtn(theme) {
  if (!D.themeIcon) return;
  D.themeIcon.className = theme === 'dark' ? 'fa fa-sun' : 'fa fa-moon';
}

/* ═══════════════════════════════════════════════════════════════════════
   DOM INIT
═══════════════════════════════════════════════════════════════════════ */
function initDom() {
  D = {
    /* upload */
    dropzone:      document.getElementById('dropzone'),
    browseBtn:     document.getElementById('browseBtn'),
    fileInput:     document.getElementById('fileInput'),
    dzDragMsg:     document.getElementById('dzDragMsg'),
    dzParticles:   document.getElementById('dzParticles'),
    fileCard:      document.getElementById('fileCard'),
    fileCardInner: document.getElementById('fileCardInner'),
    fcThumb:       document.querySelector('.cp-fc-thumb'),
    fileName:      document.getElementById('fileName'),
    fileMeta:      document.getElementById('fileMeta'),
    fileChips:     document.getElementById('fileChips'),
    removeBtn:     document.getElementById('removeBtn'),
    analyzeBar:    document.getElementById('analyzeBar'),
    /* modes */
    modesSection:  document.getElementById('modesSection'),
    estEls:        {
      screen:   document.getElementById('est-screen'),
      low:      document.getElementById('est-low'),
      medium:   document.getElementById('est-medium'),
      high:     document.getElementById('est-high'),
      lossless: document.getElementById('est-lossless'),
    },
    /* advanced */
    advSection:    document.getElementById('advSection'),
    advToggle:     document.getElementById('advToggle'),
    advPanel:      document.getElementById('advPanel'),
    advArrow:      document.getElementById('advArrow'),
    advCount:      document.getElementById('advCount'),
    /* toggles */
    grayscaleToggle: document.getElementById('grayscaleToggle'),
    metaToggle:      document.getElementById('metaToggle'),
    annotToggle:     document.getElementById('annotToggle'),
    linearToggle:    document.getElementById('linearToggle'),
    jsToggle:        document.getElementById('jsToggle'),
    embedToggle:     document.getElementById('embedToggle'),
    formsToggle:     document.getElementById('formsToggle'),
    targetToggle:    document.getElementById('targetToggle'),
    pwToggle:        document.getElementById('pwToggle'),
    /* sub-rows */
    targetSizeRow:  document.getElementById('targetSizeRow'),
    targetSizeInput: document.getElementById('targetSizeInput'),
    passwordRow:    document.getElementById('passwordRow'),
    passwordInput:  document.getElementById('passwordInput'),
    /* action */
    actionArea:    document.getElementById('actionArea'),
    compressBtn:   document.getElementById('compressBtn'),
    compBtnIcon:   document.getElementById('compBtnIcon'),
    compBtnText:   document.getElementById('compBtnText'),
    actionHint:    document.getElementById('actionHint'),
    /* progress */
    progressSection: document.getElementById('progressSection'),
    progTitle:     document.getElementById('progTitle'),
    progSub:       document.getElementById('progSub'),
    progPct:       document.getElementById('progPct'),
    progBar:       document.getElementById('progBar'),
    progGlow:      document.getElementById('progGlow'),
    progBarWrap:   document.getElementById('progBarWrap'),
    chips: {
      upload:  document.getElementById('ch-upload'),
      analyze: document.getElementById('ch-analyze'),
      gs:      document.getElementById('ch-gs'),
      fitz:    document.getElementById('ch-fitz'),
      pike:    document.getElementById('ch-pike'),
      done:    document.getElementById('ch-done'),
    },
    engineBar:     document.getElementById('engineBar'),
    ebLabel:       document.getElementById('ebLabel'),
    ebEngines:     document.getElementById('ebEngines'),
    /* result */
    resultSection: document.getElementById('resultSection'),
    resIcon:       document.getElementById('resIcon'),
    resTitle:      document.getElementById('resTitle'),
    resSub:        document.getElementById('resSub'),
    resGrade:      document.getElementById('resGrade'),
    ringFill:      document.getElementById('ringFill'),
    ringNum:       document.getElementById('ringNum'),
    ringSub:       document.getElementById('ringSub'),
    stOrig:        document.getElementById('stOrig'),
    stComp:        document.getElementById('stComp'),
    stSaved:       document.getElementById('stSaved'),
    stEngine:      document.getElementById('stEngine'),
    stTime:        document.getElementById('stTime'),
    barOrig:       document.getElementById('barOrig'),
    barComp:       document.getElementById('barComp'),
    barOrigLbl:    document.getElementById('barOrigLbl'),
    barCompLbl:    document.getElementById('barCompLbl'),
    barCompPct:    document.getElementById('barCompPct'),
    qualNote:      document.getElementById('qualNote'),
    qualNoteText:  document.getElementById('qualNoteText'),
    dlBtn:         document.getElementById('dlBtn'),
    dlBtnText:     document.getElementById('dlBtnText'),
    resetBtn:      document.getElementById('resetBtn'),
    shareBtn:      document.getElementById('shareBtn'),
    /* nav */
    soundBtn:      document.getElementById('soundBtn'),
    soundIcon:     document.getElementById('soundIcon'),
    themeBtn:      document.getElementById('themeBtn'),
    themeIcon:     document.getElementById('themeIcon'),
    /* misc */
    toastWrap:     document.getElementById('toastWrap'),
    faqList:       document.getElementById('faqList'),
    bgCanvas:      document.getElementById('bgCanvas'),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════════════════ */
function toast(msg, type = 'info', dur = 3400) {
  const icons = {
    success: 'fa-circle-check',
    error:   'fa-circle-xmark',
    info:    'fa-circle-info',
    warning: 'fa-triangle-exclamation',
  };
  const el = document.createElement('div');
  el.className = `cp-toast ${type}`;
  el.innerHTML = `<i class="fa ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  D.toastWrap.appendChild(el);

  const hide = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 320);
  };
  setTimeout(hide, dur);
  el.addEventListener('click', hide);
}

/* ═══════════════════════════════════════════════════════════════════════
   FORMAT HELPERS
═══════════════════════════════════════════════════════════════════════ */
function fmtBytes(b) {
  if (b === undefined || b === null) return '—';
  b = Number(b);
  if (b < 1024)       return b + ' B';
  if (b < 1048576)    return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function fmtMs(ms) {
  if (!ms) return '—';
  if (ms < 1000) return ms + ' ms';
  return (ms / 1000).toFixed(1) + ' s';
}

function getGrade(pct) {
  if (pct >= 70) return 'S';
  if (pct >= 50) return 'A';
  if (pct >= 30) return 'B';
  if (pct >= 10) return 'C';
  return 'D';
}

/* ═══════════════════════════════════════════════════════════════════════
   DROP ZONE
═══════════════════════════════════════════════════════════════════════ */
function initDragDrop() {
  const dz = D.dropzone;
  if (!dz) return;

  document.addEventListener('dragover',  e => e.preventDefault(), { passive: false });
  document.addEventListener('drop',      e => { e.preventDefault(); });

  dz.addEventListener('dragenter', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', e => {
    if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag-over');
  });
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const f = e.dataTransfer?.files?.[0];
    if (f) setFile(f);
  });

  /* click on dropzone opens file picker */
  dz.addEventListener('click', e => {
    if (e.target === D.browseBtn) return;  // browseBtn has own handler
    D.fileInput.click();
  });
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
  });

  /* browse button */
  D.browseBtn?.addEventListener('click', e => {
    e.stopPropagation();
    D.fileInput.click();
  });

  /* file input */
  D.fileInput?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
    D.fileInput.value = '';
  });

  /* paste support */
  document.addEventListener('paste', e => {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.kind === 'file' &&
          (item.type === 'application/pdf' || item.type === '' || item.name?.endsWith('.pdf'))) {
        const f = item.getAsFile();
        if (f) { setFile(f); break; }
      }
    }
  });

  /* document-level drop (outside dropzone) */
  document.addEventListener('drop', e => {
    if (D.dropzone?.contains(e.target)) return;
    const f = e.dataTransfer?.files?.[0];
    if (f && (f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf'))) {
      setFile(f);
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   SET FILE
═══════════════════════════════════════════════════════════════════════ */
function setFile(file) {
  if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
    toast('Please upload a PDF file (.pdf)', 'error');
    S('error');
    if (D.dropzone) {
      D.dropzone.style.animation = 'cp-shake .4s ease';
      setTimeout(() => { if (D.dropzone) D.dropzone.style.animation = ''; }, 500);
    }
    return;
  }

  FILE = file;
  S('add');

  /* Compute file stem for download naming */
  _origStem = file.name.replace(/\.pdf$/i, '').trim() || 'compressed';

  /* Update file card */
  if (D.fileName)  D.fileName.textContent  = file.name;
  if (D.fileMeta)  D.fileMeta.textContent  = fmtBytes(file.size) + ' · PDF';
  if (D.fileChips) D.fileChips.innerHTML   = '';

  /* Show file card, hide dropzone (smooth) */
  D.dropzone.hidden = true;
  D.fileCard.hidden  = false;

  /* Show controls */
  D.modesSection.hidden = false;
  D.advSection.hidden   = false;
  D.actionArea.hidden   = false;

  /* Reset result + progress */
  hideResult();
  hideProgress();

  /* Analyze file */
  analyzeFile(file);

  /* Scroll to modes */
  setTimeout(() => {
    D.modesSection?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 300);
}

/* Analyze file via /api/compress-pdf/analyze */
async function analyzeFile(file) {
  if (!D.analyzeBar) return;
  D.analyzeBar.hidden = false;

  try {
    const fd = new FormData();
    fd.append('file', file);

    const resp = await fetch('/api/compress-pdf/analyze', { method: 'POST', body: fd });
    if (!resp.ok) throw new Error('Analyze failed');

    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Analyze error');

    /* Update mode estimates */
    const ests = data.estimated_reductions_by_preset || {};
    Object.entries(D.estEls).forEach(([preset, el]) => {
      const pct = ests[preset];
      if (el && pct !== undefined) {
        el.textContent = `~${pct}% smaller`;
      }
    });

    /* Build info chips */
    const chips = [];
    if (data.page_count)        chips.push({ icon: 'fa-file', text: `${data.page_count} pages`, cls: '' });
    if (data.image_count)       chips.push({ icon: 'fa-image', text: `${data.image_count} images`, cls: '' });
    if (data.has_javascript)    chips.push({ icon: 'fa-code', text: 'Has JavaScript', cls: 'cp-fchip-warn' });
    if (data.has_forms)         chips.push({ icon: 'fa-table-list', text: 'Has Forms', cls: 'cp-fchip-info' });
    if (data.has_encryption)    chips.push({ icon: 'fa-lock', text: 'Encrypted', cls: 'cp-fchip-warn' });
    if (data.has_annotations)   chips.push({ icon: 'fa-comment', text: 'Has Annotations', cls: 'cp-fchip-info' });
    if (data.is_linearized)     chips.push({ icon: 'fa-bolt', text: 'Already Web-Optimized', cls: '' });
    if (data.content_type)      chips.push({ icon: 'fa-layer-group', text: data.content_type.replace('_', '-'), cls: '' });

    if (D.fileChips) {
      D.fileChips.innerHTML = chips.map(c =>
        `<span class="cp-fchip ${c.cls}"><i class="fa ${c.icon}"></i>${c.text}</span>`
      ).join('');
    }

  } catch (e) {
    /* Non-fatal: just hide the bar */
  } finally {
    if (D.analyzeBar) D.analyzeBar.hidden = true;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   REMOVE FILE
═══════════════════════════════════════════════════════════════════════ */
function removeFile() {
  FILE    = null;
  JOB_ID  = null;
  RESULT  = null;
  _origStem = '';

  /* Abort any running SSE */
  if (SSE_SRC) { try { SSE_SRC.close(); } catch(e) {} SSE_SRC = null; }

  D.dropzone.hidden   = false;
  D.fileCard.hidden   = true;
  D.modesSection.hidden = true;
  D.advSection.hidden   = true;
  D.actionArea.hidden   = true;
  hideProgress();
  hideResult();
}

/* ═══════════════════════════════════════════════════════════════════════
   MODE SELECTION
═══════════════════════════════════════════════════════════════════════ */
function selectMode(mode) {
  SEL_MODE = mode;
  document.querySelectorAll('.cp-mode').forEach(card => {
    const active = card.dataset.mode === mode;
    card.classList.toggle('active', active);
    card.setAttribute('aria-checked', active ? 'true' : 'false');
  });
}

function initModeCards() {
  document.querySelectorAll('.cp-mode').forEach(card => {
    card.addEventListener('click', () => selectMode(card.dataset.mode));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMode(card.dataset.mode); }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   ADVANCED OPTIONS
═══════════════════════════════════════════════════════════════════════ */
function initAdvanced() {
  /* Accordion */
  if (D.advToggle && D.advPanel) {
    D.advToggle.addEventListener('click', () => {
      const open = D.advPanel.classList.toggle('open');
      D.advToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* Toggle switches */
  const toggleDefs = [
    { id: 'grayscaleToggle', key: 'grayscale' },
    { id: 'metaToggle',      key: 'strip_metadata' },
    { id: 'annotToggle',     key: 'remove_annotations' },
    { id: 'linearToggle',    key: 'linearize' },
    { id: 'jsToggle',        key: 'remove_javascript' },
    { id: 'embedToggle',     key: 'remove_embedded_files' },
    { id: 'formsToggle',     key: 'remove_forms' },
    { id: 'targetToggle',    key: '_target', sub: 'targetSizeRow' },
    { id: 'pwToggle',        key: '_pw', sub: 'passwordRow' },
  ];

  toggleDefs.forEach(({ id, key, sub }) => {
    const el = document.getElementById(id);
    if (!el) return;

    const toggle = () => {
      const checked = el.getAttribute('aria-checked') === 'true';
      const next    = !checked;
      el.setAttribute('aria-checked', next ? 'true' : 'false');

      /* Show/hide sub-rows */
      if (sub && D[sub]) D[sub].hidden = !next;

      updateAdvCount();
    };

    el.addEventListener('click',   toggle);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

function isToggleOn(elId) {
  const el = document.getElementById(elId);
  return el?.getAttribute('aria-checked') === 'true';
}

function updateAdvCount() {
  const toggleIds = [
    'grayscaleToggle', 'metaToggle', 'annotToggle', 'linearToggle',
    'jsToggle', 'embedToggle', 'formsToggle', 'targetToggle', 'pwToggle',
  ];
  const count = toggleIds.filter(id => isToggleOn(id)).length;

  if (D.advCount) {
    if (count > 0) {
      D.advCount.textContent = `${count} on`;
      D.advCount.hidden = false;
    } else {
      D.advCount.hidden = true;
    }
  }
}

function getOptions() {
  return {
    grayscale:             isToggleOn('grayscaleToggle'),
    strip_metadata:        isToggleOn('metaToggle'),
    remove_annotations:    isToggleOn('annotToggle'),
    linearize:             isToggleOn('linearToggle'),
    remove_javascript:     isToggleOn('jsToggle'),
    remove_embedded_files: isToggleOn('embedToggle'),
    remove_forms:          isToggleOn('formsToggle'),
    target_size_kb: isToggleOn('targetToggle')
      ? (parseInt(D.targetSizeInput?.value) || 0)
      : 0,
    password: isToggleOn('pwToggle')
      ? (D.passwordInput?.value || '')
      : '',
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   PROGRESS
═══════════════════════════════════════════════════════════════════════ */
function showProgress() {
  D.progressSection.hidden = false;
  resetChips();
  setProgress(0, 'Starting…', 'Initializing 7-engine pipeline');
}

function hideProgress() {
  if (D.progressSection) D.progressSection.hidden = true;
}

function setProgress(pct, title, sub) {
  const p = Math.min(100, Math.max(0, pct));
  if (D.progBar)   D.progBar.style.width   = p + '%';
  if (D.progGlow)  D.progGlow.style.width  = p + '%';
  if (D.progPct)   D.progPct.textContent   = Math.round(p) + '%';
  if (D.progTitle) D.progTitle.textContent = title || 'Compressing…';
  if (D.progSub)   D.progSub.textContent   = sub   || '';
  if (D.progBarWrap) D.progBarWrap.setAttribute('aria-valuenow', Math.round(p));
}

function resetChips() {
  Object.values(D.chips).forEach(c => {
    if (c) { c.classList.remove('active', 'done'); }
  });
}

function setChip(key, state) {
  const c = D.chips[key];
  if (!c) return;
  c.classList.remove('active', 'done');
  if (state === 'active') c.classList.add('active');
  if (state === 'done')   c.classList.add('done');
}

/* Map SSE stage → chip + progress */
const STAGE_MAP = {
  'init':             { chip: 'upload',  pct: 5,  sub: 'Uploading & validating PDF' },
  'ghostscript':      { chip: 'gs',      pct: 8,  sub: 'Ghostscript distiller running…' },
  'ghostscript_done': { chip: 'gs',      pct: 30, sub: 'Ghostscript done ✓' },
  'pymupdf':          { chip: 'fitz',    pct: 32, sub: 'PyMuPDF image re-encoding…' },
  'pymupdf_done':     { chip: 'fitz',    pct: 50, sub: 'PyMuPDF done ✓' },
  'pikepdf':          { chip: 'pike',    pct: 52, sub: 'pikepdf stream recompression…' },
  'pikepdf_done':     { chip: 'pike',    pct: 65, sub: 'pikepdf done ✓' },
  'qpdf':             { chip: 'pike',    pct: 67, sub: 'qpdf stream optimize…' },
  'qpdf_done':        { chip: 'pike',    pct: 76, sub: 'qpdf done ✓' },
  'mutool':           { chip: 'pike',    pct: 77, sub: 'mutool clean pass…' },
  'mutool_done':      { chip: 'pike',    pct: 84, sub: 'mutool done ✓' },
  'pypdf':            { chip: 'done',    pct: 86, sub: 'pypdf content streams…' },
  'pypdf_done':       { chip: 'done',    pct: 90, sub: 'pypdf done ✓' },
  'done':             { chip: 'done',    pct: 98, sub: 'Selecting best result…' },
  'analyze':          { chip: 'analyze', pct: 3,  sub: 'Analyzing PDF structure…' },
  'target_screen':    { chip: 'gs',      pct: 10, sub: 'Target mode: trying Screen preset…' },
  'target_low':       { chip: 'gs',      pct: 28, sub: 'Target mode: trying Low preset…' },
  'target_medium':    { chip: 'fitz',    pct: 46, sub: 'Target mode: trying Medium preset…' },
  'target_high':      { chip: 'pike',    pct: 64, sub: 'Target mode: trying High preset…' },
  'target_lossless':  { chip: 'done',    pct: 82, sub: 'Target mode: trying Lossless preset…' },
  'benchmark':        { chip: 'analyze', pct: 50, sub: 'Benchmarking presets…' },
};

/* Simulated progress fallback (when no SSE) */
let _simTimer = null;
function startSimProgress(startPct = 5) {
  let pct = startPct;
  _simTimer = setInterval(() => {
    pct = Math.min(93, pct + (93 - pct) * 0.04 + 0.3);
    setProgress(pct, 'Compressing…', '7-engine pipeline running…');
    if (pct >= 92) clearInterval(_simTimer);
  }, 400);
}
function stopSimProgress() {
  if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
}

/* ═══════════════════════════════════════════════════════════════════════
   SSE
═══════════════════════════════════════════════════════════════════════ */
function openSSE(jobId) {
  if (SSE_SRC) { try { SSE_SRC.close(); } catch(e) {} }

  const url = `/api/progress/${jobId}`;
  try {
    SSE_SRC = new EventSource(url);
  } catch (e) {
    startSimProgress();
    return;
  }

  SSE_SRC.addEventListener('message', e => {
    try {
      const data = JSON.parse(e.data);
      const stage = data.stage || data.event || '';
      const sm = STAGE_MAP[stage];

      if (sm) {
        /* Mark previous chips done */
        if (sm.chip !== _lastChip && _lastChip) {
          setChip(_lastChip, 'done');
        }
        setChip(sm.chip, 'active');
        _lastChip = sm.chip;

        const pct = data.progress !== undefined
          ? Math.round(data.progress)
          : sm.pct;

        setProgress(pct, 'Compressing…', sm.sub);
        stopSimProgress();
      }

      /* Engine result chips */
      if (data.engines_tried && Array.isArray(data.engines_tried)) {
        _updateEngineBar(data.engines_tried);
      }

      if (stage === 'done' || data.complete) {
        closeSSE();
      }
    } catch (err) {}
  });

  SSE_SRC.addEventListener('error', () => {
    closeSSE();
  });

  SSE_SRC.addEventListener('ping', () => {});
}

let _lastChip = null;
function closeSSE() {
  if (SSE_SRC) { try { SSE_SRC.close(); } catch(e) {} SSE_SRC = null; }
  stopSimProgress();
}

function _updateEngineBar(engines) {
  if (!D.engineBar || !D.ebEngines) return;
  D.engineBar.hidden = false;
  if (engines.length === 0) return;

  /* Parse "gs=123KB" pairs */
  const parsed = engines.map(s => {
    const [name, rest] = s.split('=');
    return { name, val: rest || '' };
  });

  /* Find smallest */
  let minIdx = 0;
  parsed.forEach((e, i) => {
    const kbA = parseInt(parsed[minIdx].val) || Infinity;
    const kbB = parseInt(e.val) || Infinity;
    if (kbB < kbA) minIdx = i;
  });

  D.ebEngines.innerHTML = parsed.map((e, i) =>
    `<span class="cp-eb-eng ${i === minIdx ? 'best' : ''}">${e.name}: ${e.val}</span>`
  ).join('');
}

/* ═══════════════════════════════════════════════════════════════════════
   DO COMPRESS
═══════════════════════════════════════════════════════════════════════ */
async function doCompress() {
  if (!FILE) { toast('Please upload a PDF first', 'warning'); S('warning'); return; }

  /* Disable btn */
  if (D.compressBtn) {
    D.compressBtn.disabled = true;
    D.compBtnText.textContent = 'Compressing…';
    D.compBtnIcon.className   = 'fa fa-spinner fa-spin';
  }

  hideResult();
  showProgress();
  setChip('upload', 'active');
  _lastChip = 'upload';

  S('start');

  /* Build FormData */
  const fd = new FormData();
  fd.append('file', FILE);
  fd.append('preset', SEL_MODE);

  const opts = getOptions();
  Object.entries(opts).forEach(([k, v]) => {
    if (v !== '' && v !== 0 && v !== false) {
      fd.append(k, String(v));
    }
  });

  try {
    const resp = await fetch('/api/compress-pdf', {
      method: 'POST',
      body: fd,
    });

    stopSimProgress();

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
      throw new Error(err.error || `Server error ${resp.status}`);
    }

    /* Check for job_id in headers (SSE mode) */
    const jobId = resp.headers.get('X-Job-Id');
    if (jobId) {
      JOB_ID = jobId;
      openSSE(jobId);
      /* Poll for completion */
      await pollResult(jobId);
    } else {
      /* Direct result in response body */
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'Compression failed');
      RESULT = data;
      closeSSE();
      showResult(data);
    }

  } catch (err) {
    closeSSE();
    setProgress(0, 'Error', err.message);
    toast(err.message || 'Compression failed — please try again', 'error');
    S('error');
    resetCompressBtn();
  }
}

async function pollResult(jobId) {
  /* Poll /api/progress/{job_id} for final result via repeated fetch */
  const MAX = 180; /* 3 min max */
  let attempts = 0;

  while (attempts < MAX) {
    await sleep(1500);
    attempts++;

    try {
      const r = await fetch(`/api/progress/${jobId}`);
      if (!r.ok) continue;

      const txt = await r.text();
      /* SSE responses come as "data: {...}\n\n" — try to find complete result */
      const lines = txt.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const d = JSON.parse(line.slice(5).trim());
          if (d.result && d.result.success !== undefined) {
            if (d.result.success) {
              RESULT = d.result;
              closeSSE();
              showResult(d.result);
              return;
            } else if (d.result.error) {
              throw new Error(d.result.error);
            }
          }
        } catch (e2) {
          if (e2.message && !e2.message.startsWith('JSON')) throw e2;
        }
      }
    } catch (e) {
      /* Keep polling unless it's a server error */
      if (e.message && e.message !== 'Failed to fetch') throw e;
    }
  }

  /* Timeout — try to get result from /api/compress-pdf/result/{jobId} */
  throw new Error('Compression timed out — please try a smaller preset or smaller file');
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

/* ═══════════════════════════════════════════════════════════════════════
   SHOW RESULT
═══════════════════════════════════════════════════════════════════════ */
function showResult(data) {
  /* Mark all chips done */
  Object.keys(D.chips).forEach(k => setChip(k, 'done'));
  setProgress(100, 'Done!', 'Compression complete');

  setTimeout(() => {
    hideProgress();
    _renderResult(data);
    D.resultSection.hidden = false;
    D.resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    resetCompressBtn();
    S('success');

    /* Confetti on ≥30% reduction */
    const pct = data.reduction_pct || 0;
    if (pct >= 30) {
      launchConfetti();
    }
  }, 700);
}

function _renderResult(data) {
  const inSz  = data.input_size_bytes  || 0;
  const outSz = data.output_size_bytes || 0;
  const saved = data.reduction_bytes   || 0;
  const pct   = parseFloat(data.reduction_pct || 0);
  const grade = getGrade(pct);

  /* Header */
  D.resIcon.textContent  = pct >= 30 ? '🎉' : pct >= 10 ? '✅' : '📋';
  D.resTitle.textContent = pct >= 50 ? 'Excellent Compression!' :
                           pct >= 20 ? 'Compression Complete!'  :
                           'Compression Finished';
  D.resSub.textContent   = `${data.method_used || 'multi-engine'} · ${fmtMs(data.processing_time_ms)}`;

  /* Grade */
  D.resGrade.textContent = grade;
  D.resGrade.className   = `cp-res-grade grade-${grade}`;

  /* SVG ring */
  const circ = 326.7;
  const offset = circ * (1 - Math.min(pct, 100) / 100);
  D.ringFill.style.strokeDashoffset = offset;

  /* Ring number (animated) */
  _animNum(D.ringNum, 0, pct, 1400, v => Math.round(v) + '%');
  D.ringSub.textContent = `${fmtBytes(saved)} saved`;

  /* Stats */
  D.stOrig.textContent   = fmtBytes(inSz);
  D.stComp.textContent   = fmtBytes(outSz);
  D.stSaved.textContent  = `${fmtBytes(saved)} (${pct.toFixed(1)}%)`;
  D.stEngine.textContent = data.method_used || '—';
  D.stTime.textContent   = fmtMs(data.processing_time_ms);

  /* Bars */
  const compRatio = outSz / Math.max(inSz, 1) * 100;
  setTimeout(() => {
    D.barOrig.style.width = '100%';
    D.barComp.style.width = compRatio.toFixed(1) + '%';
  }, 100);
  D.barOrigLbl.textContent = `Original: ${fmtBytes(inSz)}`;
  D.barCompLbl.textContent = `Compressed: ${fmtBytes(outSz)}`;
  D.barCompPct.textContent = `${(100 - pct).toFixed(1)}% of original`;

  /* Quality note */
  D.qualNoteText.textContent = data.quality_note || '';

  /* Download button label */
  const dlName = `${_origStem}_compressed.pdf`;
  D.dlBtnText.textContent = `Download ${dlName.length > 32 ? 'Compressed PDF' : dlName}`;
}

function hideResult() {
  if (D.resultSection) D.resultSection.hidden = true;
  if (D.ringFill) D.ringFill.style.strokeDashoffset = 326.7;
  if (D.barOrig)  D.barOrig.style.width = '0%';
  if (D.barComp)  D.barComp.style.width = '0%';
  if (D.ebEngines) D.ebEngines.innerHTML = '';
  if (D.engineBar) D.engineBar.hidden = true;
}

/* ═══════════════════════════════════════════════════════════════════════
   DOWNLOAD
═══════════════════════════════════════════════════════════════════════ */
function doDownload() {
  if (!RESULT || !RESULT.download_url) {
    toast('No compressed file ready — please compress first', 'warning');
    S('warning');
    return;
  }

  S('dl');  /* fahhhhh.mp3 */

  const dlName = `${_origStem}_compressed.pdf`;
  const a = document.createElement('a');
  a.href     = RESULT.download_url;
  a.download = dlName;
  a.click();

  toast(`Downloading ${dlName}`, 'success');
}

/* ═══════════════════════════════════════════════════════════════════════
   RESET
═══════════════════════════════════════════════════════════════════════ */
function doReset() {
  hideResult();
  hideProgress();
  removeFile();
  closeSSE();
  RESULT = null;
  _origStem = '';

  /* Scroll up */
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════════════════
   SHARE
═══════════════════════════════════════════════════════════════════════ */
function doShare() {
  const url  = 'https://ishutools.fun/tools/compress-pdf/';
  const text = 'Compress PDF online free — up to 90% reduction, no signup, no watermark! By Ishu Kumar (ISHUKR41) at ishutools.fun';
  if (navigator.share) {
    navigator.share({ title: 'IshuTools PDF Compressor', text, url }).catch(() => {});
  } else {
    navigator.clipboard?.writeText(url).then(() => {
      toast('Link copied to clipboard!', 'success');
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   RESET COMPRESS BUTTON
═══════════════════════════════════════════════════════════════════════ */
function resetCompressBtn() {
  if (!D.compressBtn) return;
  D.compressBtn.disabled     = false;
  D.compBtnText.textContent  = 'Compress PDF Now';
  D.compBtnIcon.className    = 'fa fa-compress';
}

/* ═══════════════════════════════════════════════════════════════════════
   CONFETTI
═══════════════════════════════════════════════════════════════════════ */
function launchConfetti() {
  if (typeof confetti === 'function') {
    const base = { particleCount: 60, spread: 80, origin: { y: 0.55 } };
    confetti({ ...base, colors: ['#10b981', '#34d399', '#6ee7b7', '#ffffff'] });
    setTimeout(() => confetti({ ...base, particleCount: 40, origin: { x: 0.3, y: 0.6 } }), 250);
    setTimeout(() => confetti({ ...base, particleCount: 40, origin: { x: 0.7, y: 0.6 } }), 500);
  } else {
    /* CSS fallback */
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('div');
      p.style.cssText = [
        'position:fixed', 'z-index:9999', 'pointer-events:none',
        `left:${20 + Math.random() * 60}%`, `top:${30 + Math.random() * 30}%`,
        `width:${6 + Math.random() * 8}px`, `height:${6 + Math.random() * 8}px`,
        'border-radius:50%',
        `background:${['#10b981','#34d399','#6ee7b7','#fbbf24','#f472b6'][Math.floor(Math.random()*5)]}`,
        `animation:cp-float ${1 + Math.random() * 1.5}s ease forwards`,
        `animation-delay:${Math.random() * 0.4}s`,
      ].join(';');
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 2500);
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   BACKGROUND CANVAS
═══════════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = D.bgCanvas;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = 0.8 + Math.random() * 1.8;
      this.vx = (Math.random() - 0.5) * 0.25;
      this.vy = (Math.random() - 0.5) * 0.25;
      this.alpha = 0.1 + Math.random() * 0.35;
      this.color = Math.random() > 0.5 ? '#10b981' : '#6366f1';
    }
    update() {
      this.x += this.vx; this.y += this.vy;
      if (this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.globalAlpha = this.alpha;
      ctx.fill();
    }
  }

  for (let i = 0; i < 70; i++) particles.push(new Particle());

  let raf;
  function frame() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    particles.forEach(p => { p.update(); p.draw(); });

    /* Draw connecting lines between nearby particles */
    ctx.globalAlpha = 0.04;
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    raf = requestAnimationFrame(frame);
  }
  frame();

  /* Pause when hidden */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); }
    else { frame(); }
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   DROP ZONE PARTICLES (micro-animation inside dropzone)
═══════════════════════════════════════════════════════════════════════ */
function initDzParticles() {
  const container = D.dzParticles;
  if (!container) return;

  for (let i = 0; i < 8; i++) {
    const p = document.createElement('div');
    const size = 3 + Math.random() * 5;
    p.style.cssText = [
      'position:absolute', 'border-radius:50%',
      'pointer-events:none',
      `width:${size}px`, `height:${size}px`,
      `left:${Math.random() * 100}%`, `top:${Math.random() * 100}%`,
      `background:${Math.random() > 0.5 ? '#10b981' : '#6366f1'}`,
      `opacity:${0.08 + Math.random() * 0.18}`,
      `animation:cp-float ${3 + Math.random() * 4}s ease-in-out infinite`,
      `animation-delay:${Math.random() * 3}s`,
    ].join(';');
    container.appendChild(p);
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   FAQ ACCORDION
═══════════════════════════════════════════════════════════════════════ */
function initFaq() {
  if (!D.faqList) return;

  D.faqList.querySelectorAll('.cp-faq').forEach(faq => {
    const btn = faq.querySelector('.cp-fq');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const isOpen = faq.classList.contains('open');
      /* Close all */
      D.faqList.querySelectorAll('.cp-faq.open').forEach(f => {
        f.classList.remove('open');
        f.querySelector('.cp-fq')?.setAttribute('aria-expanded', 'false');
      });
      /* Open current */
      if (!isOpen) {
        faq.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });

    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   COUNTER ANIMATION
═══════════════════════════════════════════════════════════════════════ */
function _animNum(el, from, to, dur, fmt) {
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / dur);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = fmt(from + (to - from) * ease);
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function initCounters() {
  const els = document.querySelectorAll('.cp-cnt-num[data-count]');
  if (!els.length) return;

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const max = parseInt(el.dataset.count);
      io.unobserve(el);
      _animNum(el, 0, max, 1800, v => {
        const n = Math.round(v);
        if (max >= 1000000) return (n / 1000000).toFixed(1) + 'M+';
        if (max >= 1000)    return (n / 1000).toFixed(0) + 'K+';
        return String(n);
      });
    });
  }, { threshold: .5 });

  els.forEach(el => io.observe(el));
}

/* ═══════════════════════════════════════════════════════════════════════
   SCROLL ANIMATION (y-only, never opacity:0 to avoid flash)
═══════════════════════════════════════════════════════════════════════ */
function initScrollAnim() {
  const targets = document.querySelectorAll(
    '.cp-section, .cp-counters-band, .cp-seo-section, .cp-author-section'
  );

  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.replace('cp-anim-hidden', 'cp-anim-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: .06 });

  targets.forEach(el => {
    el.classList.add('cp-anim-hidden');
    io.observe(el);
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUT
═══════════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    /* Ctrl/Cmd+Enter → compress */
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (FILE && D.compressBtn && !D.compressBtn.disabled) doCompress();
    }
    /* Escape → close advanced panel */
    if (e.key === 'Escape' && D.advPanel?.classList.contains('open')) {
      D.advPanel.classList.remove('open');
      D.advToggle?.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   ENTRY POINT
═══════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initDom();

  /* Feature initializations */
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

  /* Default mode */
  selectMode(SEL_MODE);

  /* Button wiring */
  D.removeBtn?.addEventListener('click', e => { e.stopPropagation(); removeFile(); });
  D.compressBtn?.addEventListener('click', doCompress);
  D.dlBtn?.addEventListener('click', doDownload);
  D.resetBtn?.addEventListener('click', doReset);
  D.shareBtn?.addEventListener('click', doShare);

  /* Console greeting */
  console.log(
    '%cIshuTools PDF Compressor v15.0\n%cBy Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun\n%c7 engines · No limits · No watermark · Free forever',
    'color:#10b981;font-weight:bold;font-size:15px',
    'color:#34d399;font-size:11px',
    'color:#64748b;font-size:10px'
  );
});
