/**
 * split-pdf/script.js  v9.0 — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 *
 * Improvements over v8.0:
 * - Fixed duplicate keydown event listener (was registered twice)
 * - All DOM refs populated inside DOMContentLoaded (single source of truth)
 * - Better smart download naming from original filename
 * - Sounds via window.SOUNDS (loaded non-defer)
 * - Animated BG canvas (particles)
 * - Full SSE progress from /api/split-pdf/progress
 * - Presets (6 quick actions)
 * - Page grid with shift-click range selection
 * - PDF.js thumbnails (lazy-loaded on first file)
 * - canvas-confetti on success
 * - Mode badges updated from /api/split-pdf/info response
 * - Better error messages with actionable suggestions
 * - [hidden]{display:none!important} already in CSS
 */
'use strict';

/* ─── Module State ──────────────────────────────────────────────── */
let FILE          = null;
let TOTAL_PAGES   = 0;
let BOOKMARKS     = [];
let BLANK_COUNT   = 0;
let RESULT_BLOB   = null;
let RESULT_NAME   = '';
let RESULT_FILES  = [];
let PAGE_SEL      = new Set();
let SELECTED_MODE = 'all';
let _shiftStart   = -1;
let _simTimer     = null;
let _sseSource    = null;
let _splitStartTime = 0;
let _pdfJsLoaded  = false;
let _recMode      = '';   // AI recommended mode
let D             = null; // DOM refs — populated in DOMContentLoaded

/* ─── Mode Descriptions ─────────────────────────────────────────── */
const MODE_DESC = {
  all:          'Extract every page as its own PDF file. Perfect for archiving or batch processing.',
  range:        'Select specific pages (e.g. 1-3, 5, 7-end) and extract them into one file.',
  range_groups: 'Enter multiple ranges — each comma-separated range becomes its own PDF in one pass.',
  every_n:      'Split into equal chunks of N pages each (e.g. every 5 pages = 5-page chunks).',
  bookmarks:    'Split at chapter/bookmark boundaries. Creates one file per chapter.',
  blank_pages:  'Auto-detect blank separator pages and split the document at each one.',
  size_limit:   'Split so that each output file stays under your target file size in MB.',
  odd_even:     'Create two files: one with odd pages (1,3,5…) and one with even pages (2,4,6…).',
};

/* ─── Quick Presets ─────────────────────────────────────────────── */
const PRESETS = {
  first3:  { mode:'range',    range:'1-3',                label:'First 3 pages' },
  first5:  { mode:'range',    range:'first 5',            label:'First 5 pages' },
  odd:     { mode:'odd_even', range:'',                   label:'Odd & Even pages' },
  even:    { mode:'odd_even', range:'',                   label:'Odd & Even pages' },
  last3:   { mode:'range',    range:'last 3',             label:'Last 3 pages' },
  allpg:   { mode:'all',      range:'',                   label:'All pages burst' },
};

/* ─── Sound wrapper ─────────────────────────────────────────────── */
function S(key) {
  try {
    const map = {
      add:      () => window.SOUNDS?.playFileAddSound?.(),
      remove:   () => window.SOUNDS?.playFileRemoveSound?.(),
      start:    () => window.SOUNDS?.playMergeStartSound?.(),
      success:  () => window.SOUNDS?.playSuccessChime?.(),
      download: () => window.SOUNDS?.playDownloadWhoosh?.(),
      error:    () => window.SOUNDS?.playErrorSound?.(),
      warn:     () => window.SOUNDS?.playWarningSound?.(),
      tick:     () => window.SOUNDS?.playProgressTick?.(),
      toggle:   () => window.SOUNDS?.playToggleOnSound?.(),
      expand:   () => window.SOUNDS?.playExpandSound?.(),
    };
    map[key]?.();
  } catch (_) {}
}

/* ─── Toast ─────────────────────────────────────────────────────── */
function showToast(msg, type = 'info', dur = 3500) {
  const icons = { success:'fa-check-circle', error:'fa-circle-xmark', info:'fa-circle-info' };
  const el = document.createElement('div');
  el.className = `sp-toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${msg}</span>`;
  const c = document.getElementById('toastContainer');
  if (!c) return;
  c.appendChild(el);
  const remove = () => {
    el.classList.add('exiting');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  const t = setTimeout(remove, dur);
  el.addEventListener('click', () => { clearTimeout(t); remove(); });
}

/* ─── Theme ─────────────────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('sp-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  if (D.themeBtn) {
    updateThemeIcon(saved);
    D.themeBtn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const nxt = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nxt);
      localStorage.setItem('sp-theme', nxt);
      updateThemeIcon(nxt);
    });
  }
}
function updateThemeIcon(theme) {
  const ico = document.getElementById('themeIcon');
  if (ico) ico.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}

/* ─── Background Canvas ─────────────────────────────────────────── */
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const pts = [];
  const COUNT = 55;

  const resize = () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize, { passive: true });

  for (let i = 0; i < COUNT; i++) {
    pts.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.8 + 0.5,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
    });
  }

  const ACCENT = [99, 102, 241];
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
      if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${ACCENT.join(',')},0.45)`;
      ctx.fill();
    });
    // Connections
    pts.forEach((a, i) => {
      pts.slice(i + 1).forEach(b => {
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${ACCENT.join(',')},${(1 - dist / 120) * 0.15})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      });
    });
    requestAnimationFrame(draw);
  }
  draw();
}

/* ─── Drop Zone ─────────────────────────────────────────────────── */
function initDrop() {
  const dz = D.dropZone;
  if (!dz) return;

  // Click anywhere on drop zone
  dz.addEventListener('click', () => D.fileInput?.click());
  D.browseBtn?.addEventListener('click', e => { e.stopPropagation(); D.fileInput?.click(); });

  // Keyboard
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput?.click(); }
  });

  // Drag events
  ['dragenter','dragover'].forEach(ev => {
    dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag-over'); });
  });
  ['dragleave','dragend'].forEach(ev => {
    dz.addEventListener(ev, () => dz.classList.remove('drag-over'));
  });
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  });

  // File input change
  D.fileInput?.addEventListener('change', e => {
    const f = e.target?.files?.[0];
    if (f) handleFile(f);
    e.target.value = '';
  });
}

/* ─── File Handling ─────────────────────────────────────────────── */
function handleFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Please upload a PDF file.', 'error');
    S('error');
    return;
  }
  FILE = file;
  S('add');
  showFileInfo();
  fetchPdfInfo();
  renderThumbs();
  showSection('upload', 'fileInfoWrap');
  showCards();
  updateSplitBtn();
  updateFab();

  // Smart download name
  const stem = file.name.replace(/\.pdf$/i, '').replace(/[^\w\-_.]/g, '_').slice(0, 60);
  RESULT_NAME = `${stem}_split.zip`;
  if (D.downloadBtnLabel) D.downloadBtnLabel.textContent = `Download ${RESULT_NAME}`;
}

function showFileInfo() {
  if (!FILE || !D) return;
  if (D.fileName) D.fileName.textContent = FILE.name;
  if (D.chipSize) {
    const mb = (FILE.size / 1_048_576).toFixed(2);
    D.chipSize.innerHTML = `<i class="fa-solid fa-weight-hanging"></i> ${mb} MB`;
  }
  const wrap = document.getElementById('uploadSubText');
  if (wrap) wrap.textContent = FILE.name;
}

function showCards() {
  ['modesCard', 'optionsCard', 'advCard', 'actionCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  });
  document.getElementById('presetsRow')?.removeAttribute('hidden');
  document.getElementById('dropZone')?.setAttribute('hidden', '');
  updateOptionsPanel();
}

function removeFile() {
  FILE = null;
  TOTAL_PAGES = 0;
  BOOKMARKS = [];
  BLANK_COUNT = 0;
  RESULT_BLOB = null;
  RESULT_FILES = [];
  PAGE_SEL.clear();

  ['modesCard','optionsCard','advCard','actionCard','progressCard','resultsCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });

  document.getElementById('fileInfoWrap')?.setAttribute('hidden', '');
  document.getElementById('dropZone')?.removeAttribute('hidden');
  document.getElementById('presetsRow')?.setAttribute('hidden', '');
  document.getElementById('recommendBanner')?.setAttribute('hidden', '');
  document.getElementById('uploadSubText').textContent = 'No file selected';

  if (D.thumbsStrip) D.thumbsStrip.innerHTML = '';
  if (D.thumbsCount) D.thumbsCount.textContent = '0 pages';
  updateFab();
  S('remove');
}

/* ─── Fetch PDF info ─────────────────────────────────────────────── */
async function fetchPdfInfo() {
  if (!FILE) return;
  try {
    const fd = new FormData();
    fd.append('file', FILE);
    const res = await fetch('/api/split-pdf/info', { method:'POST', body:fd });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    TOTAL_PAGES  = data.total_pages || 0;
    BOOKMARKS    = data.bookmarks   || [];
    BLANK_COUNT  = data.blank_pages || 0;

    // Update chips
    if (D.chipPages) D.chipPages.innerHTML = `<i class="fa-solid fa-file-lines"></i> ${TOTAL_PAGES} pages`;
    if (BOOKMARKS.length > 0 && D.chipBookmarks) {
      D.chipBookmarks.innerHTML = `<i class="fa-solid fa-bookmark"></i> ${BOOKMARKS.length} chapters`;
      D.chipBookmarks.classList.remove('sp-chip-hidden');
    }
    if (BLANK_COUNT > 0 && D.chipBlanks) {
      D.chipBlanks.innerHTML = `<i class="fa-regular fa-file"></i> ${BLANK_COUNT} blanks`;
      D.chipBlanks.classList.remove('sp-chip-hidden');
    }
    if (data.is_scanned && D.chipScanned) {
      D.chipScanned.classList.remove('sp-chip-hidden');
    }
    if (data.is_encrypted && D.chipEncrypted) {
      D.chipEncrypted.classList.remove('sp-chip-hidden');
    }

    updateModeBadges();
    buildPageGrid();
    updateChunksPreview();
    buildBookmarksList();
    updateBlankInfo();
    updateSplitPreview();
    updateSplitBtn();

    // Auto-detect mode
    fetchAutoDetect();
  } catch(e) {
    console.warn('fetchPdfInfo failed:', e);
  }
}

async function fetchAutoDetect() {
  if (!FILE) return;
  try {
    const fd = new FormData();
    fd.append('file', FILE);
    const res = await fetch('/api/split-pdf/auto-detect', { method:'POST', body:fd });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.recommended_mode) return;

    _recMode = data.recommended_mode;
    const banner = document.getElementById('recommendBanner');
    const text   = document.getElementById('recommendText');
    const applyBtn = document.getElementById('recommendApplyBtn');

    if (banner && text) {
      const conf = Math.round((data.confidence || 0) * 100);
      text.textContent = `Recommendation: "${modeLabel(_recMode)}" — ${data.reason || ''} (${conf}% confidence)`;
      banner.removeAttribute('hidden');
    }

    if (applyBtn) {
      applyBtn.onclick = () => {
        applyMode(_recMode);
        banner?.setAttribute('hidden', '');
        showToast(`Applied: ${modeLabel(_recMode)}`, 'success');
      };
    }
    document.getElementById('recommendCloseBtn')?.addEventListener('click', () => {
      banner?.setAttribute('hidden', '');
    }, { once: true });
  } catch(e) {
    console.warn('fetchAutoDetect failed:', e);
  }
}

function modeLabel(mode) {
  const labels = {
    all:'All Pages', range:'Page Range', range_groups:'Range Groups',
    every_n:'Every N Pages', bookmarks:'By Bookmarks',
    blank_pages:'Blank Separator', size_limit:'By File Size', odd_even:'Odd/Even',
  };
  return labels[mode] || mode;
}

/* ─── Mode Selection ─────────────────────────────────────────────── */
function initModes() {
  document.querySelectorAll('.sp-mode-card').forEach(card => {
    card.addEventListener('click', () => applyMode(card.dataset.mode));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyMode(card.dataset.mode); }
    });
  });
}

function applyMode(mode) {
  if (!mode) return;
  SELECTED_MODE = mode;
  document.querySelectorAll('.sp-mode-card').forEach(c => {
    const active = c.dataset.mode === mode;
    c.classList.toggle('active', active);
    c.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  const desc = document.getElementById('modeDesc');
  if (desc) desc.textContent = MODE_DESC[mode] || '';

  updateOptionsPanel();
  updateSplitPreview();
  updateSplitBtn();
  updateFab();
  S('toggle');

  // Clear preset highlights when manually selecting mode
  document.querySelectorAll('.sp-preset-btn').forEach(b => b.classList.remove('active'));
}

function updateOptionsPanel() {
  const panels = ['range','range_groups','every_n','bookmarks','blank_pages','size_limit','odd_even'];
  panels.forEach(p => {
    const el = document.getElementById(`opts-${p}`);
    if (el) el.hidden = (p !== SELECTED_MODE);
  });
  // Hide options card if no options needed for 'all' or 'odd_even'
  const optCard = document.getElementById('optionsCard');
  if (optCard) optCard.hidden = false;  // always show for clarity

  const spb = document.getElementById('splitPreviewBox');
  if (spb) spb.hidden = !['range','range_groups','every_n','size_limit'].includes(SELECTED_MODE);
}

/* ─── Mode badges ─────────────────────────────────────────────────── */
function updateModeBadges() {
  const el = id => document.getElementById(id);
  if (TOTAL_PAGES) {
    el('badge-all')?.       && (el('badge-all').textContent       = `${TOTAL_PAGES} files`);
    el('badge-range')       && (el('badge-range').textContent      = 'Extract pages');
    el('badge-range_groups')&& (el('badge-range_groups').textContent = 'Multi-range → files');
    const n = parseInt(document.getElementById('nInput')?.value) || 5;
    el('badge-every_n')     && (el('badge-every_n').textContent    = `${Math.ceil(TOTAL_PAGES/n)} chunks`);
    el('badge-bookmarks')   && (el('badge-bookmarks').textContent  = BOOKMARKS.length ? `${BOOKMARKS.length} chapters` : 'No chapters');
    el('badge-blank_pages') && (el('badge-blank_pages').textContent = BLANK_COUNT ? `${BLANK_COUNT} blanks found` : 'Auto-detect');
    el('badge-size_limit')  && (el('badge-size_limit').textContent  = 'Fit in MB');
    el('badge-odd_even')    && (el('badge-odd_even').textContent    = '2 output files');
  }
}

/* ─── Page Grid ─────────────────────────────────────────────────── */
function buildPageGrid() {
  const grid = document.getElementById('pgrid');
  if (!grid) return;
  grid.innerHTML = '';
  PAGE_SEL.clear();

  const MAX = Math.min(TOTAL_PAGES, 200);
  for (let i = 1; i <= MAX; i++) {
    const cell = document.createElement('div');
    cell.className = 'sp-pg-cell';
    cell.textContent = i;
    cell.dataset.pg = i - 1;
    cell.addEventListener('click', e => togglePage(i - 1, e.shiftKey));
    grid.appendChild(cell);
  }
  if (TOTAL_PAGES > MAX) {
    const more = document.createElement('div');
    more.className = 'sp-pg-overflow';
    more.innerHTML = `<i class="fa-solid fa-ellipsis"></i> …and ${TOTAL_PAGES - MAX} more pages`;
    grid.appendChild(more);
  }
  updatePgridCount();
}

function togglePage(idx, shift) {
  const MAX = Math.min(TOTAL_PAGES, 200);
  if (shift && _shiftStart >= 0) {
    const lo = Math.min(_shiftStart, idx), hi = Math.max(_shiftStart, idx);
    const allSel = Array.from({length:hi-lo+1}, (_,k)=>lo+k).every(i => PAGE_SEL.has(i));
    for (let i = lo; i <= hi && i < MAX; i++) {
      allSel ? PAGE_SEL.delete(i) : PAGE_SEL.add(i);
    }
  } else {
    if (PAGE_SEL.has(idx)) PAGE_SEL.delete(idx);
    else PAGE_SEL.add(idx);
    _shiftStart = idx;
  }
  syncGridFromSel();
  syncInputFromGrid();
  updatePgridCount();
  updateSplitPreview();
}

function syncGridFromSel() {
  document.querySelectorAll('.sp-pg-cell').forEach(cell => {
    cell.classList.toggle('selected', PAGE_SEL.has(parseInt(cell.dataset.pg)));
  });
}

function syncInputFromGrid() {
  if (!D.rangeInput) return;
  const sorted = [...PAGE_SEL].sort((a,b)=>a-b);
  if (!sorted.length) { D.rangeInput.value = ''; updateRangeChips(''); return; }
  // Build compact range string
  const parts = []; let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) { end = sorted[i]; }
    else { parts.push(start === end ? `${start+1}` : `${start+1}-${end+1}`); start = end = sorted[i]; }
  }
  parts.push(start === end ? `${start+1}` : `${start+1}-${end+1}`);
  D.rangeInput.value = parts.join(', ');
  updateRangeChips(D.rangeInput.value);
  updateSplitPreview();
}

function updatePgridCount() {
  const el = document.getElementById('pgridSelCount');
  if (!el) return;
  const n = PAGE_SEL.size;
  if (n === 0) {
    el.textContent = 'Click pages to select them';
    el.classList.remove('has-sel');
  } else {
    el.textContent = `${n} page${n===1?'':'s'} selected`;
    el.classList.add('has-sel');
  }
}

/* ─── Range Input ────────────────────────────────────────────────── */
function initRangeInput() {
  if (!D.rangeInput) return;
  D.rangeInput.addEventListener('input', () => {
    updateRangeFromInput();
    updateRangeInputState();
  });
}

function updateRangeFromInput() {
  const val = D.rangeInput?.value || '';
  updateRangeChips(val);
  PAGE_SEL.clear();
  const pages = parseRangeStr(val, TOTAL_PAGES);
  pages.forEach(p => PAGE_SEL.add(p));
  syncGridFromSel();
  updatePgridCount();
  updateSplitPreview();
}

function updateRangeInputState() {
  if (!D.rangeInput) return;
  const val = D.rangeInput.value.trim();
  if (!val) {
    D.rangeInput.classList.remove('valid','invalid');
    return;
  }
  const pages = parseRangeStr(val, TOTAL_PAGES || 999);
  D.rangeInput.classList.toggle('valid',   pages.length > 0);
  D.rangeInput.classList.toggle('invalid', pages.length === 0);
}

function updateRangeChips(val) {
  const preview = document.getElementById('rangePreview');
  if (!preview) return;
  if (!val.trim()) {
    preview.innerHTML = '<span class="sp-rp-hint">Enter a range to preview pages</span>';
    return;
  }
  const pages = parseRangeStr(val, TOTAL_PAGES || 999);
  if (!pages.length) {
    preview.innerHTML = '<span class="sp-rp-warn"><i class="fa-solid fa-triangle-exclamation"></i> Invalid range</span>';
    return;
  }
  // Show chips for each token
  const tokens = val.split(/[,;，；]+/).filter(s => s.trim());
  let html = '';
  tokens.forEach(t => {
    html += `<span class="sp-range-chip">${t.trim()}</span>`;
  });
  html += `<span class="sp-range-count">${pages.length} page${pages.length===1?'':'s'}</span>`;
  preview.innerHTML = html;
}

/* Pure JS range parser — mirrors backend parse_ranges() */
function parseRangeStr(s, total) {
  if (!s) return [];
  const str = s.trim().toLowerCase();
  if (!str || str === 'all') return Array.from({length:total},(_,i)=>i);
  if (str === 'odd')  return Array.from({length:total},(_,i)=>i).filter(i=>i%2===0);
  if (str === 'even') return Array.from({length:total},(_,i)=>i).filter(i=>i%2===1);
  const mF = str.match(/^first\s+(\d+)$/); if (mF) return Array.from({length:Math.min(parseInt(mF[1]),total)},(_,i)=>i);
  const mL = str.match(/^last\s+(\d+)$/);  if (mL) { const n=parseInt(mL[1]); return Array.from({length:n},(_,i)=>Math.max(0,total-n)+i); }
  const pages = new Set();
  str.split(/[,;，；]+/).forEach(part => {
    part = part.trim().replace(/\bend\b/gi, String(total));
    const mR = part.match(/^(\d+)\s*[-–—~]\s*(\d+)$/);
    if (mR) {
      const lo = Math.max(0, parseInt(mR[1])-1), hi = Math.min(total-1, parseInt(mR[2])-1);
      for (let i=lo;i<=hi;i++) pages.add(i);
    } else if (/^\d+$/.test(part)) {
      const i = parseInt(part)-1;
      if (i>=0 && i<total) pages.add(i);
    }
  });
  return [...pages].sort((a,b)=>a-b);
}

/* ─── Groups Preview ─────────────────────────────────────────────── */
function initGroupsInput() {
  const inp = document.getElementById('rangeGroupsInput');
  if (!inp) return;
  inp.addEventListener('input', () => {
    updateGroupsPreview(inp.value);
    updateSplitPreview();
  });
}

function updateGroupsPreview(val) {
  const preview = document.getElementById('groupsPreview');
  const previewBox = document.getElementById('groupsSplitPreview');
  const previewText = document.getElementById('groupsSplitPreviewText');
  if (!preview) return;
  if (!val.trim()) {
    preview.innerHTML = '<span class="sp-rp-hint">Each comma-separated range → its own PDF</span>';
    if (previewBox) previewBox.hidden = true;
    return;
  }
  const groups = val.split(/[,，；;]+/).filter(s => s.trim());
  const valid = groups.filter(g => parseRangeStr(g.trim(), TOTAL_PAGES || 999).length > 0);
  let html = '';
  groups.forEach(g => {
    const pg = parseRangeStr(g.trim(), TOTAL_PAGES || 999);
    if (pg.length > 0) {
      html += `<span class="sp-range-chip">${g.trim()} (${pg.length}pg)</span>`;
    } else {
      html += `<span class="sp-rp-warn" style="font-size:.68rem;color:var(--red)">${g.trim()} ✗</span>`;
    }
  });
  preview.innerHTML = html;
  if (previewBox && previewText) {
    previewText.innerHTML = `Will create <strong>${valid.length}</strong> PDF file${valid.length===1?'':'s'}`;
    previewBox.hidden = valid.length === 0;
  }
}

/* ─── Every N ───────────────────────────────────────────────────── */
function initEveryN() {
  const inp  = document.getElementById('nInput');
  const inc  = document.getElementById('nIncBtn');
  const dec  = document.getElementById('nDecBtn');
  if (!inp) return;
  inp.addEventListener('input', () => { updateChunksPreview(); updateModeBadges(); updateSplitPreview(); });
  inc?.addEventListener('click', () => { inp.value = Math.min(999, parseInt(inp.value||1)+1); updateChunksPreview(); updateModeBadges(); updateSplitPreview(); });
  dec?.addEventListener('click', () => { inp.value = Math.max(1, parseInt(inp.value||2)-1); updateChunksPreview(); updateModeBadges(); updateSplitPreview(); });
}

function updateChunksPreview() {
  const el = document.getElementById('chunkCount');
  if (!el || !TOTAL_PAGES) return;
  const n = parseInt(document.getElementById('nInput')?.value) || 5;
  el.textContent = Math.ceil(TOTAL_PAGES / Math.max(1,n));
}

/* ─── Size slider ────────────────────────────────────────────────── */
function initSizeSlider() {
  const slider = document.getElementById('sizeSlider');
  const val    = document.getElementById('sizeVal');
  if (!slider || !val) return;
  slider.addEventListener('input', () => {
    val.textContent = `${slider.value} MB`;
    updateSizeSplitPreview();
    updateSplitPreview();
  });
}

function updateSizeSplitPreview() {
  const el = document.getElementById('sizeSplitPreviewText');
  if (!el || !FILE || !TOTAL_PAGES) return;
  const mb = FILE.size / 1_048_576;
  const maxMb = parseInt(document.getElementById('sizeSlider')?.value) || 5;
  const est = Math.max(1, Math.ceil(mb / maxMb));
  el.innerHTML = `Estimated output: <strong>~${est} file${est===1?'':'s'}</strong>`;
}

/* ─── Quick selects ─────────────────────────────────────────────── */
function initQuickSelects() {
  document.querySelectorAll('.sp-qs-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qs = btn.dataset.qs;
      if (!TOTAL_PAGES || !D.rangeInput) return;
      let val = '';
      if (qs === 'all')    val = `1-${TOTAL_PAGES}`;
      if (qs === 'odd')    val = 'odd';
      if (qs === 'even')   val = 'even';
      if (qs === 'first5') val = `1-${Math.min(5,TOTAL_PAGES)}`;
      if (qs === 'last3')  val = `${Math.max(1,TOTAL_PAGES-2)}-${TOTAL_PAGES}`;
      D.rangeInput.value = val;
      updateRangeFromInput();
      updateRangeInputState();
    });
  });
}

/* ─── Presets ─────────────────────────────────────────────────────── */
function initPresets() {
  document.querySelectorAll('.sp-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = PRESETS[btn.dataset.p];
      if (!p) return;
      applyMode(p.mode);
      if (p.range && D.rangeInput) {
        D.rangeInput.value = p.range;
        updateRangeFromInput();
        updateRangeInputState();
      }
      document.querySelectorAll('.sp-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      showToast(`Preset: ${p.label}`, 'info');
      updateSplitPreview();
      updateSplitBtn();
    });
  });
}

/* ─── Bookmarks List ─────────────────────────────────────────────── */
function buildBookmarksList() {
  const list = document.getElementById('bookmarksList');
  if (!list) return;
  if (!BOOKMARKS.length) {
    list.innerHTML = '<div class="sp-bk-empty"><i class="fa-solid fa-folder-open"></i> No bookmarks found. The tool will split every 5 pages.</div>';
    return;
  }
  list.innerHTML = BOOKMARKS.map((bk, i) => {
    const [title, pg] = Array.isArray(bk) ? bk : [String(bk), i];
    return `<div class="sp-bookmark-item">
      <i class="fa-solid fa-bookmark"></i>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</span>
      <span style="font-size:.65rem;color:var(--text3);">p.${pg+1}</span>
    </div>`;
  }).join('');
}

/* ─── Blank info ─────────────────────────────────────────────────── */
function updateBlankInfo() {
  const el = document.getElementById('blankCountInfo');
  if (!el) return;
  if (BLANK_COUNT > 0) {
    el.innerHTML = `<strong style="color:var(--green)">${BLANK_COUNT} blank page${BLANK_COUNT===1?'':'s'} detected</strong> — will be used as split points.`;
  } else {
    el.textContent = 'No blank pages detected yet — will scan during split.';
  }
}

/* ─── Split Preview (live estimate) ─────────────────────────────── */
function updateSplitPreview() {
  const box  = document.getElementById('splitPreviewBox');
  const text = document.getElementById('splitPreviewText');
  if (!box || !text || !TOTAL_PAGES) return;

  const msgs = {
    all:         `Will create <strong>${TOTAL_PAGES}</strong> PDF file${TOTAL_PAGES===1?'':'s'} (1 per page)`,
    every_n:     () => { const n=parseInt(document.getElementById('nInput')?.value)||5; const c=Math.ceil(TOTAL_PAGES/Math.max(1,n)); return `Will create <strong>${c}</strong> chunk${c===1?'':'s'} of ${n} pages each`; },
    bookmarks:   `Will create <strong>${BOOKMARKS.length||'?'}</strong> chapter file${(BOOKMARKS.length||0)!==1?'s':''}`,
    blank_pages: `Will split at <strong>${BLANK_COUNT}</strong> blank page${BLANK_COUNT!==1?'s':''} → ~${BLANK_COUNT+1} files`,
    size_limit:  () => { const mb=FILE?.size/1_048_576||0; const maxMb=parseInt(document.getElementById('sizeSlider')?.value)||5; const est=Math.max(1,Math.ceil(mb/maxMb)); return `Estimated <strong>~${est}</strong> output file${est!==1?'s':''}`; },
    odd_even:    'Will create <strong>2</strong> files — odd pages &amp; even pages',
    range:       () => { const p=parseRangeStr(D.rangeInput?.value||'',TOTAL_PAGES); return p.length ? `Will extract <strong>${p.length}</strong> page${p.length===1?'':'s'} → 1 PDF` : 'Enter a range above'; },
    range_groups:() => { const groups=(document.getElementById('rangeGroupsInput')?.value||'').split(/[,；;]+/).filter(s=>s.trim()&&parseRangeStr(s.trim(),TOTAL_PAGES).length>0); return `Will create <strong>${groups.length}</strong> separate PDF file${groups.length!==1?'s':''}`; },
  };

  const msg = msgs[SELECTED_MODE];
  text.innerHTML = typeof msg === 'function' ? msg() : (msg || '');
  box.hidden = !['all','range','range_groups','every_n','bookmarks','blank_pages','size_limit','odd_even'].includes(SELECTED_MODE);
}

/* ─── Advanced Options ───────────────────────────────────────────── */
function initAdvanced() {
  const toggle = document.getElementById('advToggle');
  const body   = document.getElementById('advBody');
  const arrow  = document.getElementById('advArrow');
  if (!toggle || !body) return;
  toggle.addEventListener('click', () => {
    const open = !body.hidden;
    body.hidden = open;
    toggle.setAttribute('aria-expanded', !open);
    arrow?.classList.toggle('open', !open);
    S(open ? 'toggle' : 'expand');
  });
}

/* ─── PDF.js Thumbnails ──────────────────────────────────────────── */
async function renderThumbs() {
  const strip = document.getElementById('thumbsStrip');
  const count = document.getElementById('thumbsCount');
  const status = document.getElementById('thumbsStatus');
  if (!strip || !FILE) return;

  strip.innerHTML = '<div class="sp-thumb-loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading thumbnails…</div>';

  // Wait for PDF.js to load (it's defer)
  let attempts = 0;
  while (!window.pdfjsLib && attempts < 40) {
    await new Promise(r => setTimeout(r, 150));
    attempts++;
  }

  if (!window.pdfjsLib) {
    strip.innerHTML = '';
    if (count) count.textContent = `${FILE.name}`;
    return;
  }

  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const ab = await FILE.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;
    const total = pdf.numPages;
    TOTAL_PAGES = total;

    if (count) count.textContent = `${total} pages`;
    strip.innerHTML = '';

    const MAX_THUMBS = Math.min(total, 20);
    for (let pg = 1; pg <= MAX_THUMBS; pg++) {
      const page = await pdf.getPage(pg);
      const vp   = page.getViewport({ scale: 0.18 });
      const canvas = document.createElement('canvas');
      canvas.width  = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      const thumb = document.createElement('div');
      thumb.className = 'sp-thumb';
      thumb.setAttribute('role', 'listitem');
      thumb.setAttribute('aria-label', `Page ${pg}`);
      thumb.setAttribute('data-pg', pg - 1);
      thumb.innerHTML = `<span class="sp-thumb-sel"><i class="fa-solid fa-check"></i></span>
                         <span class="sp-thumb-num">${pg}</span>`;
      thumb.insertBefore(canvas, thumb.firstChild);
      thumb.addEventListener('click', e => {
        togglePage(pg - 1, e.shiftKey);
        thumb.classList.toggle('pg-selected', PAGE_SEL.has(pg - 1));
      });
      strip.appendChild(thumb);
    }

    if (total > MAX_THUMBS) {
      const more = document.createElement('div');
      more.className = 'sp-thumb-more';
      more.innerHTML = `<i class="fa-solid fa-ellipsis" style="font-size:1rem;color:var(--accent)"></i><span>+${total-MAX_THUMBS} more</span>`;
      strip.appendChild(more);
    }

    if (status) status.textContent = `${MAX_THUMBS} shown`;
    updateModeBadges();
    buildPageGrid();
    updateChunksPreview();
    updateSplitPreview();
    updateSplitBtn();

  } catch(e) {
    strip.innerHTML = '';
    if (count) count.textContent = 'Preview unavailable';
    console.warn('PDF.js thumb render failed:', e);
  }
}

/* ─── Copy buttons ───────────────────────────────────────────────── */
function initCopyBtns() {
  document.getElementById('copyRangeBtn')?.addEventListener('click', () => {
    const v = document.getElementById('rangeInput')?.value || '';
    if (!v) return showToast('Range is empty', 'info');
    navigator.clipboard.writeText(v).then(() => showToast('Copied!', 'success'));
  });
  document.getElementById('copyGroupsBtn')?.addEventListener('click', () => {
    const v = document.getElementById('rangeGroupsInput')?.value || '';
    if (!v) return showToast('Range is empty', 'info');
    navigator.clipboard.writeText(v).then(() => showToast('Copied!', 'success'));
  });
}

/* ─── FAQ accordion ──────────────────────────────────────────────── */
function initFaq() {
  document.querySelectorAll('.sp-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !expanded);
      const ans = btn.nextElementSibling;
      if (ans) ans.classList.toggle('open', !expanded);
    });
  });
}

/* ─── FAB (mobile) ───────────────────────────────────────────────── */
function updateFab() {
  const fab = document.getElementById('fabBtn');
  if (!fab) return;
  fab.hidden = !FILE;
  fab.onclick = () => {
    if (FILE && SELECTED_MODE && !D.splitBtn?.disabled) doSplit();
    else D.splitBtn?.scrollIntoView({ behavior:'smooth', block:'center' });
  };
}

/* ─── Split button state ─────────────────────────────────────────── */
function updateSplitBtn() {
  const btn   = document.getElementById('splitBtn');
  const badge = document.getElementById('splitBtnBadge');
  if (!btn) return;
  const ready = !!FILE && !!SELECTED_MODE;
  btn.disabled = !ready;
  if (badge) badge.textContent = ready ? 'Lossless' : 'Upload PDF first';
}

/* ─── SSE progress ───────────────────────────────────────────────── */
function openSSE(sessionId) {
  closeSSE();
  try {
    _sseSource = new EventSource(`/api/split-pdf/progress?session=${sessionId}`);
    _sseSource.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.pct !== undefined) setProgress(d.pct, d.msg || '');
      } catch(_) {}
    };
    _sseSource.onerror = () => closeSSE();
  } catch(_) {}
}
function closeSSE() {
  if (_sseSource) { try { _sseSource.close(); } catch(_){} _sseSource = null; }
}

/* ─── Simulated progress ─────────────────────────────────────────── */
function startSimProgress() {
  let pct = 5;
  clearInterval(_simTimer);
  setProgress(pct, 'Uploading PDF…');
  _simTimer = setInterval(() => {
    const msgs = [20:'Parsing structure…',40:'Extracting pages…',60:'Writing files…',75:'Applying lossless encoding…',88:'Building ZIP…',95:'Almost done…'];
    pct += Math.random() * 8 + 2;
    if (pct > 95) pct = 95;
    setProgress(Math.round(pct), msgs[Object.keys(msgs).find(k=>pct>=k)] || 'Processing…');
  }, 700);
}
function stopSimProgress() { clearInterval(_simTimer); _simTimer = null; }

function setProgress(pct, msg) {
  const bar  = document.getElementById('progressBar');
  const pctEl= document.getElementById('progressPct');
  const sub  = document.getElementById('progressSub');
  if (bar)   { bar.style.width = `${Math.min(100,pct)}%`; bar.setAttribute('aria-valuenow', pct); }
  if (pctEl) pctEl.textContent = `${Math.min(100,Math.round(pct))}%`;
  if (msg && sub) sub.textContent = msg;
  // Add step
  if (msg) addProgressStep(msg, pct >= 100 ? 'done' : 'active');
}

function addProgressStep(msg, cls='active') {
  const steps = document.getElementById('progressSteps');
  if (!steps) return;
  // Mark previous active as done
  steps.querySelectorAll('.sp-prog-step.active').forEach(s => {
    s.classList.remove('active'); s.classList.add('done');
    s.querySelector('i').className = 'fa-solid fa-check';
  });
  if (cls === 'done') return;
  const div = document.createElement('div');
  div.className = `sp-prog-step ${cls}`;
  div.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>${msg}</span>`;
  steps.appendChild(div);
  div.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

/* ─── Confetti ───────────────────────────────────────────────────── */
function fireConfetti() {
  if (typeof confetti === 'function') {
    confetti({ particleCount:140, spread:75, origin:{y:0.55}, colors:['#6366f1','#8b5cf6','#06b6d4','#10b981'] });
    setTimeout(() => confetti({ particleCount:80, spread:55, angle:60, origin:{x:0,y:0.6} }), 300);
    setTimeout(() => confetti({ particleCount:80, spread:55, angle:120, origin:{x:1,y:0.6} }), 500);
    return;
  }
  // CSS fallback
  const colors = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#ec4899','#f59e0b'];
  for (let i = 0; i < 50; i++) {
    const p = document.createElement('div');
    p.className = 'sp-conf-p';
    p.style.cssText = `left:${Math.random()*100}vw;width:${6+Math.random()*6}px;height:${6+Math.random()*6}px;background:${colors[i%colors.length]};animation-duration:${2+Math.random()*2}s;animation-delay:${Math.random()*0.8}s;`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 5000);
  }
}

/* ─── Main Split Function ────────────────────────────────────────── */
async function doSplit() {
  if (!FILE) return showToast('Please upload a PDF first.', 'error');
  if (!SELECTED_MODE) return showToast('Please select a split mode.', 'error');

  // Validate mode-specific inputs
  if (SELECTED_MODE === 'range') {
    const v = document.getElementById('rangeInput')?.value?.trim();
    if (!v) return showToast('Please enter a page range.', 'error');
    if (TOTAL_PAGES && !parseRangeStr(v, TOTAL_PAGES).length)
      return showToast('Invalid page range — check your input.', 'error');
  }
  if (SELECTED_MODE === 'range_groups') {
    const v = document.getElementById('rangeGroupsInput')?.value?.trim();
    if (!v) return showToast('Please enter at least one range.', 'error');
  }

  S('start');
  _splitStartTime = Date.now();

  // Hide action, show progress
  document.getElementById('actionCard')?.setAttribute('hidden', '');
  document.getElementById('resultsCard')?.setAttribute('hidden', '');
  const progressCard = document.getElementById('progressCard');
  if (progressCard) progressCard.hidden = false;
  if (document.getElementById('progressSteps')) document.getElementById('progressSteps').innerHTML = '';
  setProgress(0, 'Preparing…');
  progressCard?.scrollIntoView({ behavior:'smooth', block:'center' });

  startSimProgress();

  const fd = new FormData();
  fd.append('file', FILE);
  fd.append('mode', SELECTED_MODE);

  // Range values
  if (SELECTED_MODE === 'range')
    fd.append('ranges', document.getElementById('rangeInput')?.value || '');
  if (SELECTED_MODE === 'range_groups')
    fd.append('ranges', document.getElementById('rangeGroupsInput')?.value || '');
  if (SELECTED_MODE === 'every_n')
    fd.append('every_n', document.getElementById('nInput')?.value || '5');
  if (SELECTED_MODE === 'size_limit')
    fd.append('max_size_mb', document.getElementById('sizeSlider')?.value || '5');

  // Advanced
  const pass = document.getElementById('passwordInput')?.value;
  if (pass) fd.append('password', pass);
  fd.append('remove_blanks',    document.getElementById('removeBlanksToggle')?.checked ? '1' : '0');
  fd.append('include_manifest', document.getElementById('includeManifestToggle')?.checked ? '1' : '0');
  fd.append('naming_pattern',   document.getElementById('namingInput')?.value || 'page_{n:04d}');
  fd.append('zip_compression',  document.getElementById('zipCompressionSel')?.value || '6');

  try {
    const res = await fetch('/api/split-pdf', { method:'POST', body:fd });
    stopSimProgress();

    if (!res.ok) {
      let errMsg = `Server error: ${res.status}`;
      try {
        const errData = await res.json();
        errMsg = errData.error || errData.message || errMsg;
      } catch(_) {}
      throw new Error(errMsg);
    }

    // Read response headers
    const fileCount  = parseInt(res.headers.get('X-File-Count') || '0');
    const totalPages = parseInt(res.headers.get('X-Total-Pages') || TOTAL_PAGES);
    const zipSizeKb  = parseFloat(res.headers.get('X-Zip-Size-Kb') || '0');
    const skippedB   = parseInt(res.headers.get('X-Skipped-Blanks') || '0');
    const timingMs   = parseInt(res.headers.get('X-Processing-Ms') || '0');
    const fileNames  = (res.headers.get('X-File-Names') || '').split('|').filter(Boolean);

    RESULT_FILES = fileNames;
    RESULT_BLOB  = await res.blob();

    // Smart download name from original file
    const stem = FILE.name.replace(/\.pdf$/i, '').replace(/[^\w\-_.]/g, '_').slice(0, 60);
    RESULT_NAME = `${stem}_split.zip`;

    setProgress(100, 'Split complete!');
    addProgressStep('Done — your files are ready', 'done');

    // Show results after brief pause
    setTimeout(() => {
      document.getElementById('progressCard')?.setAttribute('hidden', '');
      showResults(fileCount, totalPages, skippedB, zipSizeKb, timingMs, fileNames);
    }, 600);

  } catch(err) {
    stopSimProgress();
    closeSSE();
    document.getElementById('progressCard')?.setAttribute('hidden', '');
    document.getElementById('actionCard')?.removeAttribute('hidden');
    S('error');
    const msg = err.message || 'Split failed. Please try again.';
    showToast(msg, 'error', 6000);
    setProgress(0, '');
  }
}

/* ─── Show Results ───────────────────────────────────────────────── */
function showResults(fileCount, totalPages, skippedBlanks, zipSizeKb, timingMs, fileNames) {
  S('success');
  fireConfetti();

  document.getElementById('resFiles').textContent  = fileCount;
  document.getElementById('resPages').textContent  = totalPages;
  document.getElementById('resBlanks').textContent = skippedBlanks;
  document.getElementById('resZipSize').textContent = zipSizeKb > 1024
    ? `${(zipSizeKb/1024).toFixed(1)} MB`
    : `${Math.round(zipSizeKb)} KB`;

  const blanksWrap = document.getElementById('resBlanksWrap');
  if (blanksWrap) blanksWrap.style.display = skippedBlanks > 0 ? '' : 'none';

  const modeName = modeLabel(SELECTED_MODE);
  document.getElementById('resSummary').textContent =
    `${fileCount} PDF file${fileCount!==1?'s':''} created via "${modeName}" from ${totalPages} page${totalPages!==1?'s':''}.${timingMs ? ` Processed in ${(timingMs/1000).toFixed(1)}s.` : ''}`;

  const dlBtn  = document.getElementById('downloadBtn');
  const dlLabel = document.getElementById('downloadBtnLabel');
  if (dlLabel) dlLabel.textContent = `Download ${RESULT_NAME}`;
  if (dlBtn) {
    dlBtn.onclick = () => {
      if (!RESULT_BLOB) return;
      const url = URL.createObjectURL(RESULT_BLOB);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = RESULT_NAME;
      a.click();
      URL.revokeObjectURL(url);
      S('download');
      showToast('Download started!', 'success');
    };
  }

  // Build file list
  buildResultFilesList(fileNames);

  document.getElementById('resultsCard')?.removeAttribute('hidden');
  document.getElementById('resultsCard')?.scrollIntoView({ behavior:'smooth', block:'center' });

  showToast(`Split complete — ${fileCount} file${fileCount!==1?'s':''} ready!`, 'success', 4500);
}

function buildResultFilesList(names) {
  const list   = document.getElementById('resFilesList');
  const toggle = document.getElementById('resFilesToggle');
  const label  = document.getElementById('resFilesToggleLabel');
  const wrap   = document.getElementById('resFilesWrap');
  if (!list || !wrap) return;

  const MAX_SHOW = 40;
  if (!names.length) { wrap.classList.add('sp-rfw-hidden'); return; }
  wrap.classList.remove('sp-rfw-hidden');

  if (label) label.textContent = `Show ${names.length} output file${names.length!==1?'s':''}`;

  list.innerHTML = names.slice(0, MAX_SHOW).map(fn => `
    <div class="sp-res-file">
      <i class="fa-solid fa-file-pdf"></i>
      <span class="sp-res-file-name">${fn}</span>
    </div>
  `).join('');

  if (names.length > MAX_SHOW) {
    list.innerHTML += `<div class="sp-res-file sp-res-file-more">…and ${names.length - MAX_SHOW} more files</div>`;
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = list.hidden;
      list.hidden = !open;
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (label) label.textContent = open
        ? `Hide ${names.length} file${names.length!==1?'s':''}`
        : `Show ${names.length} output file${names.length!==1?'s':''}`;
    }, { once: false });
  }
}

/* ─── Reset ──────────────────────────────────────────────────────── */
function resetTool(keepFile) {
  RESULT_BLOB  = null;
  RESULT_FILES = [];
  PAGE_SEL.clear();
  document.getElementById('progressCard')?.setAttribute('hidden', '');
  document.getElementById('resultsCard')?.setAttribute('hidden', '');
  document.getElementById('progressSteps').innerHTML = '';
  setProgress(0, '');
  document.getElementById('actionCard')?.removeAttribute('hidden');
  document.getElementById('actionCard')?.scrollIntoView({ behavior:'smooth', block:'center' });
  if (!keepFile) {
    removeFile();
  }
  updateSplitBtn();
  updateFab();
}

window.resetTool = resetTool;
window.downloadResult = () => document.getElementById('downloadBtn')?.click();

/* ─── Show section helper ────────────────────────────────────────── */
function showSection(cardId, sectionId) {
  // no-op helper kept for compatibility
}

/* ─── Init ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // ── Populate all DOM refs in one place ────────────────────────────
  D = {
    themeBtn:          document.getElementById('themeBtn'),
    fileInput:         document.getElementById('fileInput'),
    dropZone:          document.getElementById('dropZone'),
    browseBtn:         document.getElementById('browseBtn'),
    fileName:          document.getElementById('fileName'),
    chipSize:          document.getElementById('chipSize'),
    chipPages:         document.getElementById('chipPages'),
    chipBookmarks:     document.getElementById('chipBookmarks'),
    chipBlanks:        document.getElementById('chipBlanks'),
    chipEncrypted:     document.getElementById('chipEncrypted'),
    chipScanned:       document.getElementById('chipScanned'),
    fileRemoveBtn:     document.getElementById('fileRemoveBtn'),
    thumbsStrip:       document.getElementById('thumbsStrip'),
    thumbsCount:       document.getElementById('thumbsCount'),
    splitBtn:          document.getElementById('splitBtn'),
    downloadBtnLabel:  document.getElementById('downloadBtnLabel'),
    rangeInput:        document.getElementById('rangeInput'),
  };

  // ── Init all subsystems ─────────────────────────────────────────
  initTheme();
  initBgCanvas();
  initDrop();
  initModes();
  initRangeInput();
  initGroupsInput();
  initEveryN();
  initSizeSlider();
  initQuickSelects();
  initPresets();
  initAdvanced();
  initCopyBtns();
  initFaq();

  // ── File remove button ─────────────────────────────────────────
  document.getElementById('fileRemoveBtn')?.addEventListener('click', removeFile);

  // ── Split button ───────────────────────────────────────────────
  document.getElementById('splitBtn')?.addEventListener('click', doSplit);

  // ── Split again / new file buttons ────────────────────────────
  document.getElementById('splitAgainBtn')?.addEventListener('click', () => resetTool(true));
  document.getElementById('newFileBtn')?.addEventListener('click', () => resetTool(false));

  // ── Keyboard shortcut: Ctrl+Enter to split (SINGLE listener) ──
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (FILE && !document.getElementById('splitBtn')?.disabled) {
        doSplit();
      }
    }
  });

  // ── Drag-over on body ──────────────────────────────────────────
  document.body.addEventListener('dragover', e => {
    e.preventDefault();
    if (!FILE) document.getElementById('dropZone')?.classList.add('drag-over');
  });
  document.body.addEventListener('dragleave', () => {
    if (!FILE) document.getElementById('dropZone')?.classList.remove('drag-over');
  });
  document.body.addEventListener('drop', e => {
    e.preventDefault();
    document.getElementById('dropZone')?.classList.remove('drag-over');
    const f = e.dataTransfer?.files?.[0];
    if (f && !FILE) handleFile(f);
  });

  // ── Initial state ──────────────────────────────────────────────
  updateSplitBtn();
  updateFab();
});
