/**
 * split-pdf/script.js  v3.0 — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 * ─────────────────────────────────────────
 * Zero-dependency vanilla JS.
 * All sound/DOM refs are initialised inside DOMContentLoaded.
 */

'use strict';

/* ── MODULE STATE ────────────────────────────────────────────────── */
let FILE          = null;   // File object
let TOTAL_PAGES   = 0;
let BOOKMARKS     = [];     // [{title,page}]
let RESULT_BLOB   = null;
let RESULT_NAME   = '';
let PAGE_SEL      = new Set();  // 0-based selected page indices
let SELECTED_MODE = 'all';
let _shiftStart   = -1;
let _currentPct   = 0;
let _simTimer     = null;
let _sseSource    = null;
let D             = null;   // DOM refs — populated in DOMContentLoaded
let SOUNDS        = {};     // populated in DOMContentLoaded

const MAX_SIZE_MB = 50;
const MAX_THUMB   = 16;

/* ── SOUNDS ──────────────────────────────────────────────────────── */
function initSounds() {
  const FILES = {
    add:      'sounds/are_bhai_bhai_bhai.mp3',
    start:    'sounds/cameraman_focus_karo.mp3',
    success:  'sounds/waah_kya_scene_hai.mp3',
    download: 'sounds/fahhhhh.mp3',
    error:    'sounds/eh_eh_eh_ehhhhhh.mp3',
    warn:     'sounds/jaldi_waha_sa_hato.mp3',
  };
  const cache = {};
  function play(key) {
    try {
      const src = FILES[key];
      if (!src) return;
      if (!cache[key]) {
        cache[key] = new Audio(src);
        cache[key].volume = 0.55;
      }
      const a = cache[key];
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch(_) {}
  }
  SOUNDS.play = play;
}

function playSound(key) { SOUNDS.play && SOUNDS.play(key); }

/* ── INIT ────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initSounds();

  D = {
    // nav
    themeBtn:       document.getElementById('themeBtn'),
    // upload
    fileInput:      document.getElementById('fileInput'),
    dropZone:       document.getElementById('dropZone'),
    uploadCard:     document.getElementById('uploadCard'),
    browseBtn:      document.getElementById('browseBtn'),
    // file info
    fileCard:       document.getElementById('fileCard'),
    fileName:       document.getElementById('fileName'),
    fileSize:       document.getElementById('fileSize'),
    filePages:      document.getElementById('filePages'),
    statBookmarks:  document.getElementById('statBookmarks'),
    fileRemoveBtn:  document.getElementById('fileRemoveBtn'),
    thumbsStrip:    document.getElementById('thumbsStrip'),
    thumbsLoading:  document.getElementById('thumbsLoading'),
    thumbsCount:    document.getElementById('thumbsCount'),
    // modes
    modesCard:      document.getElementById('modesCard'),
    modesGrid:      document.getElementById('modesGrid'),
    // opts
    optsCard:       document.getElementById('optsCard'),
    // range
    rangeInput:     document.getElementById('rangeInput'),
    rangePreview:   document.getElementById('rangePreview'),
    pgrid:          document.getElementById('pgrid'),
    pgridSel:       document.getElementById('pgridSel'),
    // every_n
    everyNInput:    document.getElementById('everyNInput'),
    chunksPreview:  document.getElementById('chunksPreview'),
    // size
    sizeSlider:     document.getElementById('sizeSlider'),
    sizeVal:        document.getElementById('sizeVal'),
    // split preview
    splitPreview:   document.getElementById('splitPreview'),
    bookmarksList:  document.getElementById('bookmarksList'),
    // adv
    advCard:        document.getElementById('advCard'),
    advToggle:      document.getElementById('advToggle'),
    advBody:        document.getElementById('advBody'),
    advArrow:       document.getElementById('advArrow'),
    pdfPassword:    document.getElementById('pdfPassword'),
    removeBlanks:   document.getElementById('removeBlanks'),
    namingPattern:  document.getElementById('namingPattern'),
    // action
    actionSection:  document.getElementById('actionSection'),
    splitBtn:       document.getElementById('splitBtn'),
    // progress
    progressCard:   document.getElementById('progressCard'),
    progressFill:   document.getElementById('progressFill'),
    progressPct:    document.getElementById('progressPct'),
    progressTitle:  document.getElementById('progressTitle'),
    progressSub:    document.getElementById('progressSub'),
    progressSteps:  document.getElementById('progressSteps'),
    // results
    resultsCard:    document.getElementById('resultsCard'),
    resFileCount:   document.getElementById('resFileCount'),
    resTotalPages:  document.getElementById('resTotalPages'),
    resSkipped:     document.getElementById('resSkipped'),
    resSkippedWrap: document.getElementById('resSkippedWrap'),
    resZipSize:     document.getElementById('resZipSize'),
    // FAQ
    faqList:        document.getElementById('faqList'),
  };

  initTheme();
  initDrop();
  initModes();
  initEveryN();
  initSizeSlider();
  initAdvanced();
  initFAQ();
  initGSAP();
  initParticles();

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter → split
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (D.splitBtn && !D.splitBtn.disabled && !D.actionSection.hidden) {
        doSplit();
      }
    }
  });

  if (D.themeBtn) D.themeBtn.addEventListener('click', toggleTheme);
});

/* ── DROP / FILE PICK ────────────────────────────────────────────── */
function initDrop() {
  const { dropZone, fileInput, browseBtn } = D;
  if (!dropZone) return;

  // Click anywhere on drop zone OR browse button
  dropZone.addEventListener('click', () => fileInput.click());
  if (browseBtn) {
    browseBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  }

  fileInput.addEventListener('change', e => {
    if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
  });

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('sp-drag-over'); });
  dropZone.addEventListener('dragleave', e => { if (!dropZone.contains(e.relatedTarget)) dropZone.classList.remove('sp-drag-over'); });
  dropZone.addEventListener('drop',      e => {
    e.preventDefault(); dropZone.classList.remove('sp-drag-over');
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  if (D.fileRemoveBtn) D.fileRemoveBtn.addEventListener('click', e => { e.stopPropagation(); resetTool(); });
}

/* ── LOAD FILE ───────────────────────────────────────────────────── */
async function loadFile(file) {
  if (!file.name.match(/\.pdf$/i)) {
    showToast('Please upload a PDF file (.pdf only)', 'error');
    playSound('error');
    return;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    showToast(`File is too large (max ${MAX_SIZE_MB} MB)`, 'error');
    playSound('error');
    return;
  }

  FILE = file;
  playSound('add');

  // Update file-info card
  D.fileName.textContent = file.name;
  D.fileSize.textContent = formatSize(file.size);
  D.filePages.textContent = '—';
  D.thumbsLoading.hidden = false;
  D.thumbsStrip.innerHTML = '';
  D.thumbsStrip.appendChild(D.thumbsLoading);
  D.thumbsCount.textContent = '';
  D.statBookmarks.classList.add('sp-hidden');

  D.uploadCard.hidden = true;
  D.fileCard.hidden   = false;
  D.modesCard.hidden  = false;
  D.advCard.hidden    = false;
  D.actionSection.hidden = false;
  showModeOptions(SELECTED_MODE);

  if (typeof gsap !== 'undefined') {
    gsap.from(D.fileCard,    { y: 18, duration: .4, ease: 'power2.out' });
    gsap.from(D.modesCard,   { y: 18, duration: .4, delay: .06, ease: 'power2.out' });
    gsap.from(D.actionSection,{ y:14, duration:.4, delay:.12, ease:'power2.out'});
  }

  // Fetch PDF info (pages, bookmarks, blank count)
  await fetchPdfInfo();

  // Load thumbnails via PDF.js
  loadThumbs();
}

async function fetchPdfInfo() {
  try {
    const fd = new FormData();
    fd.append('file', FILE);
    if (D.pdfPassword.value) fd.append('password', D.pdfPassword.value);

    const resp = await fetch('/api/split-pdf/info', { method: 'POST', body: fd });
    if (!resp.ok) return;

    const info = await resp.json();
    if (!info.success) return;

    TOTAL_PAGES = info.total_pages || 0;
    BOOKMARKS   = (info.bookmarks || []).map(([t, p]) => ({ title: t, page: p }));

    D.filePages.textContent = TOTAL_PAGES ? `${TOTAL_PAGES} page${TOTAL_PAGES !== 1 ? 's' : ''}` : '—';

    if (BOOKMARKS.length) {
      D.statBookmarks.classList.remove('sp-hidden');
      D.statBookmarks.querySelector && (D.statBookmarks.querySelector('.sp-stat-val') || D.statBookmarks).textContent = `${BOOKMARKS.length} chapter${BOOKMARKS.length !== 1 ? 's' : ''}`;
    }

    if (info.blank_pages > 0 && D.removeBlanks) {
      // Silently pre-check skip-blanks if blanks found
      // D.removeBlanks.checked = true; // optional
    }

    // Build page grid for range mode
    if (TOTAL_PAGES) buildPageGrid();
    renderBookmarksList();
    updateSplitPreview();
    updateChunksPreview();

  } catch(e) {
    console.warn('Info fetch failed:', e);
  }
}

/* ── THUMBNAILS via PDF.js ───────────────────────────────────────── */
async function loadThumbs() {
  if (!FILE || !window.pdfjsLib) {
    D.thumbsLoading.hidden = true;
    return;
  }
  try {
    const buf = await FILE.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf, password: D.pdfPassword.value || '' }).promise;

    D.thumbsLoading.hidden = true;

    const count = Math.min(pdf.numPages, MAX_THUMB);
    D.thumbsCount.textContent = pdf.numPages > MAX_THUMB ? `${count} of ${pdf.numPages}` : `${pdf.numPages}`;

    if (!TOTAL_PAGES) {
      TOTAL_PAGES = pdf.numPages;
      D.filePages.textContent = `${TOTAL_PAGES} page${TOTAL_PAGES !== 1 ? 's' : ''}`;
      buildPageGrid();
      updateSplitPreview();
      updateChunksPreview();
    }

    for (let i = 1; i <= count; i++) {
      await renderThumb(pdf, i);
    }

    if (pdf.numPages > MAX_THUMB) {
      const more = document.createElement('div');
      more.className = 'sp-thumb-more';
      more.innerHTML = `<i class="fa fa-ellipsis-h" style="font-size:1.1rem;color:var(--sp-text3)"></i><span>+${pdf.numPages - MAX_THUMB}</span>`;
      D.thumbsStrip.appendChild(more);
    }
  } catch(e) {
    D.thumbsLoading.hidden = true;
    console.warn('Thumb load failed:', e);
  }
}

async function renderThumb(pdf, pageNum) {
  try {
    const page   = await pdf.getPage(pageNum);
    const vp     = page.getViewport({ scale: .28 });
    const canvas = document.createElement('canvas');
    canvas.width  = vp.width;
    canvas.height = vp.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;

    const wrap = document.createElement('div');
    wrap.className = 'sp-thumb';
    wrap.dataset.page = pageNum;
    wrap.innerHTML = `<span class="sp-thumb-sel"><i class="fa fa-check"></i></span>
      <span class="sp-thumb-num">${pageNum}</span>`;
    wrap.insertBefore(canvas, wrap.firstChild);

    wrap.addEventListener('click', () => {
      if (SELECTED_MODE !== 'range') return;
      const idx = pageNum - 1;
      PAGE_SEL.has(idx) ? PAGE_SEL.delete(idx) : PAGE_SEL.add(idx);
      wrap.classList.toggle('pg-selected', PAGE_SEL.has(idx));
      syncGridFromSel(); syncInputFromGrid();
      updateSplitPreview();
    });

    D.thumbsStrip.appendChild(wrap);
  } catch(e) {
    console.warn(`Thumb p${pageNum} failed:`, e);
  }
}

/* ── PAGE GRID (range mode) ─────────────────────────────────────── */
function buildPageGrid() {
  const grid = D.pgrid;
  if (!grid || !TOTAL_PAGES) return;
  grid.innerHTML = '';
  const cap = 200;
  const show = Math.min(TOTAL_PAGES, cap);

  for (let i = 0; i < show; i++) {
    const cell = document.createElement('div');
    cell.className = 'sp-pg-cell' + (PAGE_SEL.has(i) ? ' selected' : '');
    cell.textContent = i + 1;
    cell.dataset.idx = i;
    cell.addEventListener('click', e => onCellClick(e, i));
    grid.appendChild(cell);
  }

  if (TOTAL_PAGES > cap) {
    const ov = document.createElement('div');
    ov.className = 'sp-pg-overflow';
    ov.innerHTML = `<i class="fa fa-info-circle"></i> +${TOTAL_PAGES - cap} more pages — type ranges directly in the field above`;
    grid.parentElement.appendChild(ov);
  }
}

function onCellClick(e, idx) {
  if (e.shiftKey && _shiftStart >= 0) {
    const lo = Math.min(_shiftStart, idx);
    const hi = Math.max(_shiftStart, idx);
    for (let i = lo; i <= hi; i++) PAGE_SEL.add(i);
  } else {
    if (PAGE_SEL.has(idx)) PAGE_SEL.delete(idx);
    else PAGE_SEL.add(idx);
    _shiftStart = idx;
  }
  syncGridFromSel();
  syncInputFromGrid();
  updateSplitPreview();
}

function syncGridFromSel() {
  D.pgrid && D.pgrid.querySelectorAll('.sp-pg-cell').forEach(c => {
    const idx = parseInt(c.dataset.idx);
    c.classList.toggle('selected', PAGE_SEL.has(idx));
  });
  D.thumbsStrip && D.thumbsStrip.querySelectorAll('.sp-thumb[data-page]').forEach(t => {
    const idx = parseInt(t.dataset.page) - 1;
    t.classList.toggle('pg-selected', PAGE_SEL.has(idx));
  });
  if (D.pgridSel) {
    const n = PAGE_SEL.size;
    D.pgridSel.textContent = n ? `${n} page${n !== 1 ? 's' : ''} selected` : 'None';
    D.pgridSel.className   = 'sp-pgrid-sel' + (n ? ' has-sel' : '');
  }
}

function syncInputFromGrid() {
  if (!D.rangeInput) return;
  if (!PAGE_SEL.size) { D.rangeInput.value = ''; updateRangePreview(); return; }
  const sorted = Array.from(PAGE_SEL).sort((a,b)=>a-b);
  const ranges = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === end + 1) { end = sorted[i]; continue; }
    ranges.push(start === end ? String(start + 1) : `${start+1}-${end+1}`);
    if (i < sorted.length) { start = sorted[i]; end = sorted[i]; }
  }
  D.rangeInput.value = ranges.join(', ');
  updateRangePreview();
}

function updateRangeFromInput() {
  if (!D.rangeInput || !TOTAL_PAGES) return;
  PAGE_SEL = new Set(parseRangeStr(D.rangeInput.value, TOTAL_PAGES));
  syncGridFromSel();
  updateRangePreview();
  updateSplitPreview();
}

function updateRangePreview() {
  const el = D.rangePreview;
  if (!el) return;
  const val = D.rangeInput && D.rangeInput.value.trim();
  if (!val) { el.innerHTML = '<span class="sp-rp-hint">No pages selected</span>'; return; }
  if (!TOTAL_PAGES) { el.innerHTML = '<span class="sp-rp-hint">Upload a PDF to preview</span>'; return; }

  const pages = parseRangeStr(val, TOTAL_PAGES);
  if (!pages.length) {
    el.innerHTML = '<span class="sp-rp-warn"><i class="fa fa-exclamation-triangle"></i> No valid pages</span>';
    return;
  }
  // Show first 12 chips
  const sorted = [...pages].sort((a,b)=>a-b);
  let html = '';
  // Group consecutive
  const groups = []; let s = sorted[0], e = sorted[0];
  for (let i=1; i<=sorted.length; i++) {
    if (i < sorted.length && sorted[i] === e+1) { e=sorted[i]; continue; }
    groups.push(s === e ? `${s+1}` : `${s+1}–${e+1}`);
    if (i < sorted.length) { s=sorted[i]; e=sorted[i]; }
  }
  const shown = groups.slice(0,10);
  html = shown.map(g => `<span class="sp-range-chip">${g}</span>`).join('');
  if (groups.length > 10) html += `<span class="sp-range-chip sp-range-chip-more">+${groups.length-10} more</span>`;
  html += `<span class="sp-range-count">${pages.length} page${pages.length!==1?'s':''}</span>`;
  el.innerHTML = html;
}

/* ── MODE SELECTION ─────────────────────────────────────────────── */
function initModes() {
  if (!D.modesGrid) return;
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(card => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      if (!mode) return;
      SELECTED_MODE = mode;
      D.modesGrid.querySelectorAll('.sp-mode-card').forEach(c =>
        c.classList.toggle('active', c.dataset.mode === mode)
      );
      showModeOptions(mode);
      updateSplitPreview();
    });
  });
}

function showModeOptions(mode) {
  if (!D.optsCard) return;
  D.optsCard.hidden = false;

  // Hide all opt groups first
  D.optsCard.querySelectorAll('[data-mode-opt]').forEach(el => el.hidden = true);

  // Show relevant
  const relevant = {
    all:         ['opt-split-preview'],
    range:       ['opt-range', 'opt-qs-bar', 'opt-pgrid', 'opt-split-preview'],
    every_n:     ['opt-every-n', 'opt-split-preview'],
    bookmarks:   ['opt-bookmarks', 'opt-split-preview'],
    blank_pages: ['opt-blank-info', 'opt-split-preview'],
    size_limit:  ['opt-size', 'opt-split-preview'],
    odd_even:    ['opt-odd-even-info', 'opt-split-preview'],
  };
  (relevant[mode] || ['opt-split-preview']).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  });

  updateSplitPreview();
  updateChunksPreview();
  if (mode === 'bookmarks') renderBookmarksList();
}

/* ── EVERY-N ─────────────────────────────────────────────────────── */
function initEveryN() {
  const inp = D.everyNInput;
  if (!inp) return;
  inp.addEventListener('input', () => { updateChunksPreview(); updateSplitPreview(); });

  // +/- buttons
  document.getElementById('everyNDec') && document.getElementById('everyNDec').addEventListener('click', () => {
    inp.value = Math.max(1, parseInt(inp.value||2)-1);
    updateChunksPreview(); updateSplitPreview();
  });
  document.getElementById('everyNInc') && document.getElementById('everyNInc').addEventListener('click', () => {
    inp.value = Math.min(9999, parseInt(inp.value||2)+1);
    updateChunksPreview(); updateSplitPreview();
  });
}

/* ── SIZE SLIDER ────────────────────────────────────────────────── */
function initSizeSlider() {
  const sl = D.sizeSlider;
  if (!sl) return;
  sl.addEventListener('input', () => {
    if (D.sizeVal) D.sizeVal.textContent = sl.value;
    updateSplitPreview();
  });
  if (D.sizeVal) D.sizeVal.textContent = sl.value;
}

/* ── ADVANCED TOGGLE ────────────────────────────────────────────── */
function initAdvanced() {
  if (!D.advToggle) return;
  D.advToggle.addEventListener('click', () => {
    const open = !D.advBody.hidden;
    D.advBody.hidden = open;
    D.advArrow.classList.toggle('open', !open);
  });
  if (D.rangeInput) {
    D.rangeInput.addEventListener('input', () => { updateRangePreview(); updateRangeFromInput(); });
  }
  if (D.splitBtn) D.splitBtn.addEventListener('click', doSplit);

  // Quick selects
  document.querySelectorAll('.sp-qs-btn[data-qs]').forEach(btn => {
    btn.addEventListener('click', () => {
      const qs = btn.dataset.qs;
      handleQuickSelect(qs);
    });
  });
}

function handleQuickSelect(qs) {
  if (!TOTAL_PAGES) { showToast('Upload a PDF first', 'warn'); return; }
  PAGE_SEL.clear();
  if (qs === 'all')   { for (let i=0;i<TOTAL_PAGES;i++) PAGE_SEL.add(i); }
  else if (qs === 'none')   { /* clear already done */ }
  else if (qs === 'odd')    { for (let i=0;i<TOTAL_PAGES;i+=2) PAGE_SEL.add(i); }
  else if (qs === 'even')   { for (let i=1;i<TOTAL_PAGES;i+=2) PAGE_SEL.add(i); }
  else if (qs === 'first')  { PAGE_SEL.add(0); }
  else if (qs === 'last')   { PAGE_SEL.add(TOTAL_PAGES-1); }
  else if (qs === 'firstN') {
    const n = parseInt(document.getElementById('qsN')?.value || 5);
    for (let i=0;i<Math.min(n,TOTAL_PAGES);i++) PAGE_SEL.add(i);
  }
  syncGridFromSel();
  syncInputFromGrid();
  updateSplitPreview();
}

/* ── RANGE PARSER ───────────────────────────────────────────────── */
function parseRangeStr(str, total) {
  const pages = new Set();
  if (!str || !total) return [];
  str.replace(/，/g,',').split(',').forEach(part => {
    part = part.trim();
    if (!part) return;
    if (/^\d+-\d+$/.test(part)) {
      const [a,b] = part.split('-').map(Number);
      const s = Math.max(0,a-1), e = Math.min(total-1,b-1);
      if (!isNaN(s) && !isNaN(e) && s<=e) for (let i=s;i<=e;i++) pages.add(i);
    } else if (/^\d+$/.test(part)) {
      const idx = parseInt(part)-1;
      if (idx>=0 && idx<total) pages.add(idx);
    }
  });
  return Array.from(pages).sort((a,b)=>a-b);
}

/* ── CHUNKS PREVIEW ─────────────────────────────────────────────── */
function updateChunksPreview() {
  if (!D.chunksPreview) return;
  const n = Math.max(1, parseInt(D.everyNInput?.value || 2));
  const total = TOTAL_PAGES || '?';
  if (typeof total === 'number') {
    const chunks = Math.ceil(total/n);
    const last   = total % n || n;
    D.chunksPreview.innerHTML = `<i class="fa fa-th-large"></i>
      <strong>${chunks}</strong> file${chunks!==1?'s':''} &bull;
      ${n} page${n!==1?'s':''} each
      ${last!==n ? `<em style="color:var(--sp-text3);">(last: ${last} page${last!==1?'s':''})</em>` : ''}`;
  } else {
    D.chunksPreview.innerHTML = `<i class="fa fa-info-circle"></i> Upload a PDF to see the preview`;
  }
}

/* ── LIVE SPLIT PREVIEW ─────────────────────────────────────────── */
function updateSplitPreview() {
  const el = D.splitPreview;
  if (!el) return;
  if (!FILE) { el.innerHTML = ''; return; }

  let html = '<i class="fa fa-cut"></i> ';
  switch(SELECTED_MODE) {
    case 'all':
      html += TOTAL_PAGES
        ? `Will create <strong>${TOTAL_PAGES}</strong> file${TOTAL_PAGES!==1?'s':''} — 1 page each`
        : 'Will split every page into a separate file';
      break;
    case 'range': {
      const pages = parseRangeStr(D.rangeInput?.value || '', TOTAL_PAGES);
      html += pages.length
        ? `Will create <strong>1 file</strong> with <strong>${pages.length}</strong> page${pages.length!==1?'s':''}`
        : '<em style="color:var(--sp-text3)">Select pages using the grid below or type a range</em>';
      break;
    }
    case 'every_n': {
      const n = Math.max(1,parseInt(D.everyNInput?.value||2));
      const chunks = TOTAL_PAGES ? Math.ceil(TOTAL_PAGES/n) : '?';
      html += `Will create <strong>${chunks}</strong> file${chunks!==1?'s':''} — <strong>${n}</strong> page${n!==1?'s':''} each`;
      break;
    }
    case 'bookmarks': {
      const bk = BOOKMARKS.length;
      html += bk
        ? `Will create <strong>${bk}</strong> file${bk!==1?'s':''} — 1 per chapter`
        : 'Splits by detected bookmarks / chapters';
      break;
    }
    case 'odd_even':
      html += 'Will create <strong>2 files</strong> — odd pages &amp; even pages';
      break;
    case 'size_limit':
      html += `Will split into parts ≤ <strong>${D.sizeSlider?.value || 5} MB</strong> each`;
      break;
    case 'blank_pages':
      html += 'Splits at blank separator pages — count detected during processing';
      break;
  }
  el.innerHTML = html;
}

/* ── BOOKMARKS LIST ──────────────────────────────────────────────── */
function renderBookmarksList() {
  const el = D.bookmarksList;
  if (!el) return;
  if (!BOOKMARKS.length) {
    el.innerHTML = '<div class="sp-bookmark-item sp-bk-empty"><i class="fa fa-info-circle"></i> No bookmarks found — will fallback to every-5-pages split</div>';
    return;
  }
  el.innerHTML = BOOKMARKS.slice(0,18).map(b =>
    `<div class="sp-bookmark-item">
      <i class="fa fa-bookmark"></i> ${escHtml(b.title)}
      <span style="margin-left:auto;font-size:.67rem;color:var(--sp-text3)">p.${b.page}</span>
    </div>`
  ).join('') +
  (BOOKMARKS.length > 18
    ? `<div class="sp-bookmark-item sp-bk-empty"><i class="fa fa-ellipsis-h"></i> +${BOOKMARKS.length-18} more chapters</div>`
    : '');
}

/* ── SPLIT ───────────────────────────────────────────────────────── */
async function doSplit() {
  if (!FILE) return;

  if (SELECTED_MODE === 'range') {
    const val = D.rangeInput?.value.trim() || '';
    if (!val) {
      showToast('Select pages using the grid or type a range like: 1-3, 5, 8-12', 'warn');
      playSound('warn'); return;
    }
    if (!parseRangeStr(val, TOTAL_PAGES).length) {
      showToast('No valid pages in that range', 'error');
      playSound('error'); return;
    }
  }

  playSound('start');
  const jobId = 'sp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);

  const fd = new FormData();
  fd.append('file', FILE);
  fd.append('mode', SELECTED_MODE);
  fd.append('ranges', D.rangeInput?.value.trim() || '');
  fd.append('every_n', D.everyNInput?.value || 2);
  fd.append('max_size_mb', D.sizeSlider?.value || 5);
  fd.append('password', D.pdfPassword?.value || '');
  fd.append('naming_pattern', D.namingPattern?.value.trim() || 'page_{n:04d}');
  fd.append('remove_blanks', D.removeBlanks?.checked ? 'true' : 'false');
  fd.append('job_id', jobId);

  // Switch views
  D.actionSection.hidden = true;
  D.modesCard.hidden     = true;
  D.optsCard.hidden      = true;
  D.advCard.hidden       = true;
  D.progressCard.hidden  = false;
  D.resultsCard.hidden   = true;

  if (typeof gsap !== 'undefined') {
    gsap.from(D.progressCard, { y:18, duration:.4, ease:'power2.out' });
  }

  setProgress(0, 'Uploading…', 'Sending file to server');
  addStep('active', 'Uploading PDF…');
  startSSE(jobId);

  _currentPct = 0;
  _simTimer   = setInterval(() => {
    if (_currentPct < 68) {
      _currentPct += 1.8 + Math.random() * 2.8;
      setProgress(Math.min(68, _currentPct), 'Splitting PDF…', 'Processing pages');
    }
  }, 160);

  try {
    const resp = await fetch('/api/split-pdf', { method:'POST', body:fd });
    clearInterval(_simTimer); stopSSE();

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({ error: 'Server error' }));
      throw new Error(errData.error || `HTTP ${resp.status}`);
    }

    setProgress(92, 'Building ZIP…', 'Packaging split files');
    addStep('done', '✓ PDF processed');
    addStep('active', 'Building ZIP archive…');

    const blob      = await resp.blob();
    const fileCount = parseInt(resp.headers.get('X-File-Count') || '0');
    const totPages  = parseInt(resp.headers.get('X-Total-Pages') || TOTAL_PAGES || '0');
    const skipped   = parseInt(resp.headers.get('X-Skipped-Blanks') || '0');
    const zipKB     = parseFloat(resp.headers.get('X-Zip-Size-KB') || '0');

    const stem  = FILE.name.replace(/\.pdf$/i, '');
    RESULT_NAME = `${stem}_split.zip`;
    RESULT_BLOB = blob;

    setProgress(100, 'Done! 🎉', '');
    addStep('done', '✓ ZIP ready');

    setTimeout(() => showResults(fileCount, totPages, skipped, zipKB), 420);
    playSound('success');

  } catch(err) {
    clearInterval(_simTimer); stopSSE();
    console.error('Split error:', err);

    D.progressCard.hidden  = true;
    D.modesCard.hidden     = false;
    D.optsCard.hidden      = false;
    D.advCard.hidden       = false;
    D.actionSection.hidden = false;
    showModeOptions(SELECTED_MODE);
    playSound('error');
    showToast('Error: ' + (err.message || 'Split failed. Please try again.'), 'error');
  }
}

/* ── SSE ─────────────────────────────────────────────────────────── */
function startSSE(jobId) {
  try {
    _sseSource = new EventSource(`/api/progress/${jobId}`);
    _sseSource.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.ping) return;
        if (msg.pct !== undefined && msg.pct > _currentPct) {
          _currentPct = msg.pct;
          setProgress(msg.pct, msg.title || 'Processing…', msg.sub || '');
        }
        if (msg.step) addStep('done', msg.step);
        if (msg.done) stopSSE();
      } catch(_) {}
    };
    _sseSource.onerror = () => stopSSE();
  } catch(_) {}
}
function stopSSE() { if (_sseSource) { _sseSource.close(); _sseSource = null; } }

/* ── PROGRESS UI ─────────────────────────────────────────────────── */
function setProgress(pct, title, sub) {
  pct = Math.max(0, Math.min(100, Math.round(pct)));
  D.progressFill.style.width = pct + '%';
  D.progressPct.textContent  = pct + '%';
  if (title)            D.progressTitle.textContent = title;
  if (sub !== undefined) D.progressSub.textContent  = sub;
}
function addStep(state, text) {
  if (!D.progressSteps) return;
  const el = document.createElement('div');
  el.className = 'sp-progress-step ' + state;
  el.innerHTML = state === 'done'
    ? `<i class="fa fa-check-circle"></i> ${escHtml(text)}`
    : `<i class="fa fa-circle-notch fa-spin"></i> ${escHtml(text)}`;
  D.progressSteps.appendChild(el);
  if (D.progressSteps.children.length > 8) D.progressSteps.removeChild(D.progressSteps.firstChild);
  D.progressSteps.scrollTop = D.progressSteps.scrollHeight;
}

/* ── RESULTS ─────────────────────────────────────────────────────── */
function showResults(fileCount, totalPages, skipped, zipKB) {
  D.progressCard.hidden = true;
  D.resultsCard.hidden  = false;

  D.resFileCount.textContent  = fileCount  || '—';
  D.resTotalPages.textContent = totalPages || TOTAL_PAGES || '—';

  if (D.resZipSize) {
    D.resZipSize.textContent = zipKB > 0 ? formatSize(zipKB * 1024) : '—';
  }

  if (skipped > 0 && D.resSkipped) {
    D.resSkipped.textContent = skipped;
  } else if (D.resSkippedWrap) {
    D.resSkippedWrap.hidden = true;
  }

  if (typeof gsap !== 'undefined') {
    gsap.from(D.resultsCard,        { y:28, duration:.5, ease:'power3.out' });
    gsap.from('.sp-check-circle',   { scale:0, duration:.5, delay:.1, ease:'back.out(1.6)' });
    gsap.from('.sp-res-stat',       { y:18, duration:.4, stagger:.08, delay:.18, ease:'power2.out' });
    gsap.from('.sp-res-actions > *',{ y:14, duration:.35, stagger:.06, delay:.32, ease:'power2.out' });
    launchConfetti();
  }
}

function launchConfetti() {
  if (typeof gsap === 'undefined') return;
  const colors = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ec4899','#ef4444'];
  for (let i = 0; i < 28; i++) {
    const d   = document.createElement('div');
    const sz  = 5 + Math.random() * 8;
    const shp = Math.random() > .4 ? '50%' : '2px';
    d.style.cssText = `position:fixed;width:${sz}px;height:${sz}px;border-radius:${shp};
      background:${colors[i%colors.length]};pointer-events:none;z-index:9999;
      left:${Math.random()*100}vw;top:100vh`;
    document.body.appendChild(d);
    gsap.to(d, {
      y:   -(window.innerHeight * .9 + Math.random() * window.innerHeight * .45),
      x:   (Math.random()-.5)*280,
      rotation: Math.random()*720,
      duration: 1.2 + Math.random() * .9,
      delay:    Math.random() * .45,
      ease: 'power2.out',
      onComplete: () => d.remove(),
    });
  }
}

/* ── DOWNLOAD ────────────────────────────────────────────────────── */
function downloadResult() {
  if (!RESULT_BLOB) return;
  playSound('download');
  const url = URL.createObjectURL(RESULT_BLOB);
  const a   = document.createElement('a');
  a.href = url; a.download = RESULT_NAME;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* ── RESET ───────────────────────────────────────────────────────── */
function resetTool() {
  FILE = null; TOTAL_PAGES = 0; BOOKMARKS = []; RESULT_BLOB = null; RESULT_NAME = '';
  PAGE_SEL.clear(); _shiftStart = -1; _currentPct = 0;
  clearInterval(_simTimer); stopSSE();

  if (D.fileInput) D.fileInput.value = '';

  D.fileCard.hidden      = true;
  D.uploadCard.hidden    = false;
  D.modesCard.hidden     = true;
  D.optsCard.hidden      = true;
  D.advCard.hidden       = true;
  D.actionSection.hidden = true;
  D.progressCard.hidden  = true;
  D.resultsCard.hidden   = true;

  D.thumbsStrip.innerHTML = '';
  D.thumbsStrip.appendChild(D.thumbsLoading);
  D.thumbsLoading.hidden = false;
  D.thumbsCount.textContent = '';
  D.statBookmarks.classList.add('sp-hidden');
  D.progressSteps.innerHTML = '';
  if (D.resSkippedWrap) D.resSkippedWrap.hidden = false;

  if (D.rangeInput)  D.rangeInput.value = '';
  if (D.rangePreview) D.rangePreview.innerHTML = '';
  if (D.pgrid)       D.pgrid.innerHTML = '';
  if (D.pgridSel)    { D.pgridSel.textContent = 'None'; D.pgridSel.className = 'sp-pgrid-sel'; }
  if (D.splitPreview) D.splitPreview.innerHTML = '';
  if (D.everyNInput) D.everyNInput.value = 2;
  if (D.advBody)     D.advBody.hidden = true;
  if (D.advArrow)    D.advArrow.classList.remove('open');
  if (D.pdfPassword) D.pdfPassword.value = '';
  if (D.removeBlanks) D.removeBlanks.checked = false;
  if (D.namingPattern) D.namingPattern.value = 'page_{n:04d}';

  BOOKMARKS = []; SELECTED_MODE = 'all';
  D.modesGrid && D.modesGrid.querySelectorAll('.sp-mode-card').forEach(c =>
    c.classList.toggle('active', c.dataset.mode === 'all')
  );

  if (typeof gsap !== 'undefined') gsap.from(D.uploadCard, { scale:.97, duration:.35, ease:'power2.out' });
}

/* ── THEME ───────────────────────────────────────────────────────── */
function initTheme()  { setTheme(localStorage.getItem('sp-theme') || 'dark'); }
function toggleTheme(){ setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('sp-theme', t);
  if (D.themeBtn) D.themeBtn.innerHTML = t === 'dark'
    ? '<i class="fa fa-moon"></i>'
    : '<i class="fa fa-sun"></i>';
}

/* ── TOAST ───────────────────────────────────────────────────────── */
let _toastTimer = null;
function showToast(msg, type = 'info') {
  let t = document.querySelector('.sp-toast');
  if (!t) { t = document.createElement('div'); t.className = 'sp-toast'; document.body.appendChild(t); }
  const icons = { error:'fa-exclamation-circle', success:'fa-check-circle', warn:'fa-exclamation-triangle', info:'fa-info-circle' };
  t.className = 'sp-toast ' + type;
  t.innerHTML = `<i class="fa ${icons[type] || icons.info}"></i> ${escHtml(msg)}`;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}

/* ── FAQ ─────────────────────────────────────────────────────────── */
function initFAQ() {
  if (!D.faqList) return;
  D.faqList.querySelectorAll('.sp-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item   = btn.closest('.sp-faq-item');
      const isOpen = item.classList.contains('open');
      D.faqList.querySelectorAll('.sp-faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

/* ── PARTICLES ───────────────────────────────────────────────────── */
function initParticles() {
  const c = document.getElementById('heroParticles');
  if (!c) return;
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('div');
    p.className = 'sp-particle';
    const s = 6 + Math.random() * 16;
    p.style.cssText = `width:${s}px;height:${s}px;left:${Math.random()*100}%;
      animation-duration:${5+Math.random()*10}s;
      animation-delay:${Math.random()*8}s;`;
    c.appendChild(p);
  }
}

/* ── GSAP INTRO ──────────────────────────────────────────────────── */
function initGSAP() {
  if (typeof gsap === 'undefined') return;
  // NEVER use opacity:0 for above-fold (GSAP opacity danger rule)
  gsap.from('.sp-hero-badge',      { y:20, duration:.65, delay:.1,  ease:'power2.out' });
  gsap.from('.sp-hero-h1',         { y:30, duration:.7,  delay:.2,  ease:'power2.out' });
  gsap.from('.sp-hero-sub',        { y:18, duration:.6,  delay:.33, ease:'power2.out' });
  gsap.from('.sp-hero-pills span', { y:12, duration:.5,  stagger:.06, delay:.44, ease:'power2.out' });
  gsap.from('.sp-upload-card',     { y:28, duration:.7,  delay:.55, ease:'power2.out' });
  gsap.from('.sp-proof-strip',     { y:14, duration:.5,  delay:.7,  ease:'power2.out' });

  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const children = e.target.querySelectorAll('.sp-step-card,.sp-feat-card,.sp-rel-card,.sp-faq-item,.sp-test-card,.sp-uc-card');
        if (children.length) gsap.from(children, { y:20, duration:.5, stagger:.06, ease:'power2.out' });
        io.unobserve(e.target);
      }
    });
  }, { threshold:.08 });
  document.querySelectorAll('.sp-howto,.sp-features,.sp-related,.sp-faq,.sp-testimonials,.sp-usecases').forEach(s => io.observe(s));
}

/* ── HELPERS ─────────────────────────────────────────────────────── */
function formatSize(bytes) {
  if (bytes < 1024)       return bytes + ' B';
  if (bytes < 1048576)    return (bytes/1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes/1048576).toFixed(1) + ' MB';
  return (bytes/1073741824).toFixed(2) + ' GB';
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
