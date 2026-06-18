/**
 * split-pdf/script.js — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Ultra-professional, fully standalone Split PDF tool
 */

'use strict';

// ── SOUNDS ────────────────────────────────────────────
const SOUNDS = {
  fileAdd:  new Audio('are_bhai_bhai_bhai.mp3'),
  start:    new Audio('cameraman_focus_karo.mp3'),
  success:  new Audio('waah_kya_scene_hai.mp3'),
  download: new Audio('fahhhhh.mp3'),
  error:    new Audio('eh_eh_eh_ehhhhhh.mp3'),
  warn:     new Audio('jaldi_waha_sa_hato.mp3'),
};
Object.values(SOUNDS).forEach(a => { a.volume = 0.6; a.preload = 'none'; });
function playSound(key) {
  try {
    const s = SOUNDS[key];
    if (s) { s.currentTime = 0; s.play().catch(()=>{}); }
  } catch(e) {}
}

// ── SPLIT MODES CONFIG ─────────────────────────────────
const MODES = [
  { id: 'all',         icon: '📄', title: 'Every Page',      desc: 'One PDF per page',             c1: '#3b82f6', c2: '#06b6d4' },
  { id: 'range',       icon: '🎯', title: 'Page Ranges',     desc: 'Custom: 1-3, 5, 7-9',          c1: '#8b5cf6', c2: '#ec4899' },
  { id: 'every_n',     icon: '📦', title: 'Every N Pages',   desc: 'Split into equal chunks',       c1: '#10b981', c2: '#06b6d4' },
  { id: 'bookmarks',   icon: '🔖', title: 'By Chapters',     desc: 'Split at bookmark boundaries', c1: '#f59e0b', c2: '#ef4444' },
  { id: 'odd_even',    icon: '↕️', title: 'Odd / Even',      desc: 'Separate odd & even pages',    c1: '#06b6d4', c2: '#6366f1' },
  { id: 'size_limit',  icon: '⚖️', title: 'By File Size',   desc: 'Split when size exceeds limit', c1: '#ef4444', c2: '#f97316' },
  { id: 'blank_pages', icon: '🔲', title: 'At Blank Pages',  desc: 'Split at blank separators',    c1: '#ec4899', c2: '#8b5cf6' },
];

// ── STATE ──────────────────────────────────────────────
let FILE = null;
let TOTAL_PAGES = 0;
let BOOKMARKS = [];
let SELECTED_MODE = 'all';
let RESULT_BLOB = null;
let RESULT_NAME = '';
let _sseSource = null;
let _simTimer = null;
let _currentPct = 0;

// ── DOM REFS ──────────────────────────────────────────
let D = {};
document.addEventListener('DOMContentLoaded', init);

function init() {
  D = {
    dropZone:     document.getElementById('dropZone'),
    fileInput:    document.getElementById('fileInput'),
    browseBtn:    document.getElementById('browseBtn'),
    uploadCard:   document.getElementById('uploadCard'),
    fileCard:     document.getElementById('fileCard'),
    fileName:     document.getElementById('fileName'),
    statPages:    document.getElementById('statPages'),
    statSize:     document.getElementById('statSize'),
    statBookmarks:document.getElementById('statBookmarks'),
    removeFileBtn:document.getElementById('removeFileBtn'),
    thumbsStrip:  document.getElementById('thumbsStrip'),
    thumbsLoading:document.getElementById('thumbsLoading'),
    thumbsCount:  document.getElementById('thumbsCount'),
    thumbsWrap:   document.getElementById('thumbsWrap'),
    modesCard:    document.getElementById('modesCard'),
    modesGrid:    document.getElementById('modesGrid'),
    optsCard:     document.getElementById('optsCard'),
    optRange:     document.getElementById('optRange'),
    rangeInput:   document.getElementById('rangeInput'),
    rangePreview: document.getElementById('rangePreview'),
    optEveryN:    document.getElementById('optEveryN'),
    everyNInput:  document.getElementById('everyNInput'),
    nMinus:       document.getElementById('nMinus'),
    nPlus:        document.getElementById('nPlus'),
    chunksPreview:document.getElementById('chunksPreview'),
    optSize:      document.getElementById('optSize'),
    sizeSlider:   document.getElementById('sizeSlider'),
    sizeDisplay:  document.getElementById('sizeDisplay'),
    optBookmarks: document.getElementById('optBookmarks'),
    bookmarksList:document.getElementById('bookmarksList'),
    optOddEven:   document.getElementById('optOddEven'),
    optBlank:     document.getElementById('optBlank'),
    advCard:      document.getElementById('advCard'),
    advToggle:    document.getElementById('advToggle'),
    advBody:      document.getElementById('advBody'),
    advArrow:     document.getElementById('advArrow'),
    pdfPassword:  document.getElementById('pdfPassword'),
    namingPattern:document.getElementById('namingPattern'),
    removeBlanks: document.getElementById('removeBlanks'),
    actionSection:document.getElementById('actionSection'),
    splitBtn:     document.getElementById('splitBtn'),
    progressCard: document.getElementById('progressCard'),
    progressFill: document.getElementById('progressFill'),
    progressPct:  document.getElementById('progressPct'),
    progressTitle:document.getElementById('progressTitle'),
    progressSub:  document.getElementById('progressSub'),
    progressSteps:document.getElementById('progressSteps'),
    resultsCard:  document.getElementById('resultsCard'),
    resFileCount: document.getElementById('resFileCount'),
    resTotalPages:document.getElementById('resTotalPages'),
    resSkipped:   document.getElementById('resSkipped'),
    resSkippedWrap:document.getElementById('resSkippedWrap'),
    downloadBtn:  document.getElementById('downloadBtn'),
    splitAgainBtn:document.getElementById('splitAgainBtn'),
    themeBtn:     document.getElementById('themeBtn'),
    faqList:      document.getElementById('faqList'),
  };

  buildModeCards();
  bindEvents();
  initTheme();
  initFAQ();
  initParticles();
  initGSAP();
}

// ── BUILD MODE CARDS ───────────────────────────────────
function buildModeCards() {
  D.modesGrid.innerHTML = '';
  MODES.forEach(m => {
    const card = document.createElement('div');
    card.className = 'sp-mode-card' + (m.id === SELECTED_MODE ? ' active' : '');
    card.dataset.mode = m.id;
    card.style.setProperty('--mode-c1', m.c1);
    card.style.setProperty('--mode-c2', m.c2);
    card.style.setProperty('--mode-grad', `linear-gradient(135deg,${m.c1},${m.c2})`);
    card.style.setProperty('--mode-glow', hexToRgba(m.c1, .25));
    card.innerHTML = `
      <div class="sp-mode-icon">${m.icon}</div>
      <div class="sp-mode-title">${m.title}</div>
      <div class="sp-mode-desc">${m.desc}</div>
      <div class="sp-mode-check"><i class="fa fa-check"></i></div>
    `;
    card.addEventListener('click', () => selectMode(m.id));
    D.modesGrid.appendChild(card);
  });
}

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── SELECT MODE ────────────────────────────────────────
function selectMode(id) {
  SELECTED_MODE = id;
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(c => {
    c.classList.toggle('active', c.dataset.mode === id);
  });
  showModeOptions(id);
  updateChunksPreview();
  if (typeof gsap !== 'undefined') {
    const active = D.modesGrid.querySelector('.sp-mode-card.active');
    if (active) gsap.from(active, { scale: .95, duration: .25, ease: 'back.out(2)' });
  }
}

function showModeOptions(id) {
  const groups = {
    range:       D.optRange,
    every_n:     D.optEveryN,
    size_limit:  D.optSize,
    bookmarks:   D.optBookmarks,
    odd_even:    D.optOddEven,
    blank_pages: D.optBlank,
  };
  let hasOpts = false;
  Object.entries(groups).forEach(([mode, el]) => {
    const show = mode === id;
    el.hidden = !show;
    if (show) hasOpts = true;
  });
  D.optsCard.hidden = !hasOpts;
  if (id === 'bookmarks') renderBookmarksList();
}

// ── BIND EVENTS ────────────────────────────────────────
function bindEvents() {
  // Upload
  D.dropZone.addEventListener('click', e => { if (e.target === D.browseBtn || D.browseBtn.contains(e.target)) return; D.fileInput.click(); });
  D.browseBtn.addEventListener('click', e => { e.stopPropagation(); D.fileInput.click(); });
  D.fileInput.addEventListener('change', () => { if (D.fileInput.files[0]) handleFile(D.fileInput.files[0]); });
  D.dropZone.addEventListener('dragover', e => { e.preventDefault(); D.dropZone.classList.add('sp-drag-over'); });
  D.dropZone.addEventListener('dragleave', e => { if (!D.dropZone.contains(e.relatedTarget)) D.dropZone.classList.remove('sp-drag-over'); });
  D.dropZone.addEventListener('drop', e => {
    e.preventDefault(); D.dropZone.classList.remove('sp-drag-over');
    const f = e.dataTransfer.files[0];
    if (f) { if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) { showToast('Please upload a PDF file', 'error'); playSound('error'); return; } handleFile(f); }
  });

  // Remove file
  D.removeFileBtn.addEventListener('click', resetTool);

  // Mode options
  D.rangeInput.addEventListener('input', updateRangePreview);
  D.everyNInput.addEventListener('input', updateChunksPreview);
  D.nMinus.addEventListener('click', () => { const v = parseInt(D.everyNInput.value)||1; D.everyNInput.value = Math.max(1, v-1); updateChunksPreview(); });
  D.nPlus.addEventListener('click', () => { const v = parseInt(D.everyNInput.value)||1; D.everyNInput.value = Math.min(500, v+1); updateChunksPreview(); });
  D.sizeSlider.addEventListener('input', () => { D.sizeDisplay.textContent = D.sizeSlider.value; });

  // Advanced
  D.advToggle.addEventListener('click', () => {
    const open = !D.advBody.hidden;
    D.advBody.hidden = open;
    D.advArrow.classList.toggle('open', !open);
  });

  // Split
  D.splitBtn.addEventListener('click', doSplit);

  // Results
  D.downloadBtn.addEventListener('click', downloadResult);
  D.splitAgainBtn.addEventListener('click', resetTool);

  // Theme
  D.themeBtn.addEventListener('click', toggleTheme);

  // FAQ
  if (D.faqList) {
    D.faqList.querySelectorAll('.sp-faq-q').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.sp-faq-item');
        const wasOpen = item.classList.contains('open');
        D.faqList.querySelectorAll('.sp-faq-item').forEach(i => i.classList.remove('open'));
        if (!wasOpen) item.classList.add('open');
      });
    });
  }
}

// ── FILE HANDLING ──────────────────────────────────────
async function handleFile(file) {
  if (file.size > 1024 * 1024 * 1024) { showToast('File exceeds 1 GB limit', 'error'); playSound('error'); return; }
  FILE = file;
  playSound('fileAdd');

  // Update file info UI
  D.fileName.textContent = file.name;
  D.statSize.innerHTML = `<i class="fa fa-hdd"></i> ${formatSize(file.size)}`;

  // Show file card, hide upload
  D.uploadCard.hidden = true;
  D.fileCard.hidden = false;
  D.modesCard.hidden = false;
  D.advCard.hidden = false;
  D.actionSection.hidden = false;

  // Animate in (y-only, never opacity:0)
  if (typeof gsap !== 'undefined') {
    gsap.from([D.fileCard, D.modesCard, D.advCard, D.actionSection], { y: 22, duration: .45, stagger: .08, ease: 'power2.out' });
  }

  // Default mode options
  showModeOptions(SELECTED_MODE);

  // Load PDF info via PDF.js
  await loadPDFInfo(file);
}

async function loadPDFInfo(file) {
  D.thumbsLoading.hidden = false;
  D.statPages.innerHTML = '<i class="fa fa-file-alt"></i> Reading…';

  try {
    const arrayBuffer = await file.arrayBuffer();
    // Try PDF.js if available (loaded from CDN via lazy load)
    const pdfjs = await loadPDFJS();
    if (!pdfjs) {
      // Fallback: just show file uploaded, skip thumbnails
      D.statPages.innerHTML = `<i class="fa fa-file-alt"></i> PDF uploaded`;
      D.thumbsLoading.hidden = true;
      D.thumbsWrap.hidden = true;
      return;
    }

    const pdf = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
    TOTAL_PAGES = pdf.numPages;
    D.statPages.innerHTML = `<i class="fa fa-file-alt"></i> ${TOTAL_PAGES} page${TOTAL_PAGES !== 1 ? 's' : ''}`;

    // Extract bookmarks
    try {
      const outline = await pdf.getOutline();
      BOOKMARKS = outline ? flattenOutline(outline).slice(0, 30) : [];
      if (BOOKMARKS.length > 0) {
        D.statBookmarks.innerHTML = `<i class="fa fa-bookmark"></i> ${BOOKMARKS.length} chapter${BOOKMARKS.length !== 1 ? 's' : ''}`;
        D.statBookmarks.classList.remove('sp-hidden');
      }
    } catch(e) { BOOKMARKS = []; }

    updateChunksPreview();
    renderBookmarksList();

    // Generate thumbnails (first 20 pages)
    await renderThumbnails(pdf, Math.min(TOTAL_PAGES, 20));

  } catch(e) {
    console.warn('PDF.js error:', e);
    D.statPages.innerHTML = `<i class="fa fa-file-alt"></i> PDF uploaded`;
    D.thumbsLoading.hidden = true;
    D.thumbsWrap.hidden = true;
  }
}

async function loadPDFJS() {
  if (window.pdfjsLib) return window.pdfjsLib;
  return new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      } else resolve(null);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

async function renderThumbnails(pdf, count) {
  D.thumbsLoading.hidden = false;
  D.thumbsStrip.innerHTML = '';
  D.thumbsStrip.appendChild(D.thumbsLoading);

  const frag = document.createDocumentFragment();

  for (let i = 1; i <= count; i++) {
    try {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 0.35 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const thumb = document.createElement('div');
      thumb.className = 'sp-thumb';
      thumb.title = `Page ${i}`;
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/jpeg', 0.7);
      img.alt = `Page ${i}`;
      const num = document.createElement('div');
      num.className = 'sp-thumb-num';
      num.textContent = i;
      thumb.appendChild(img);
      thumb.appendChild(num);
      frag.appendChild(thumb);
    } catch(e) { /* skip failed page */ }
  }

  if (TOTAL_PAGES > count) {
    const more = document.createElement('div');
    more.className = 'sp-thumb-more';
    more.innerHTML = `<i class="fa fa-ellipsis-h"></i><span>+${TOTAL_PAGES - count} more</span>`;
    frag.appendChild(more);
  }

  D.thumbsLoading.hidden = true;
  D.thumbsStrip.appendChild(frag);
  D.thumbsCount.textContent = `${count} of ${TOTAL_PAGES}`;

  if (typeof gsap !== 'undefined') {
    const thumbs = D.thumbsStrip.querySelectorAll('.sp-thumb');
    gsap.from(thumbs, { opacity: 0, y: 10, duration: .3, stagger: .03, ease: 'power1.out' });
  }
}

function flattenOutline(outline, depth = 0) {
  const result = [];
  if (!outline) return result;
  for (const item of outline) {
    result.push({ title: item.title || 'Section', depth });
    if (item.items && item.items.length && depth < 2) {
      result.push(...flattenOutline(item.items, depth + 1));
    }
  }
  return result;
}

// ── RANGE PREVIEW ──────────────────────────────────────
function updateRangePreview() {
  const val = D.rangeInput.value.trim();
  if (!val || !TOTAL_PAGES) { D.rangePreview.innerHTML = '<span style="color:var(--sp-text3)">Pages will appear here</span>'; return; }
  const pages = parseRangeStr(val, TOTAL_PAGES);
  if (!pages.length) { D.rangePreview.innerHTML = '<span style="color:var(--sp-red)">⚠ No valid pages found</span>'; return; }
  const chips = pages.slice(0, 40).map(p => `<span style="background:var(--sp-card-hover);border:1px solid var(--sp-card-border);padding:1px 7px;border-radius:5px;font-size:.72rem">${p+1}</span>`).join('');
  const extra = pages.length > 40 ? `<span style="color:var(--sp-text3)">+${pages.length-40} more</span>` : '';
  D.rangePreview.innerHTML = chips + extra + `<span style="margin-left:8px;color:var(--sp-accent);font-weight:600">${pages.length} page${pages.length!==1?'s':''}</span>`;
}

function parseRangeStr(str, total) {
  const pages = new Set();
  str.replace(/\s/g,'').split(',').forEach(part => {
    if (part.includes('-')) {
      const [a, b] = part.split('-');
      const s = Math.max(0, parseInt(a)-1);
      const e = Math.min(total-1, parseInt(b)-1);
      if (!isNaN(s) && !isNaN(e) && s <= e) for (let i=s;i<=e;i++) pages.add(i);
    } else if (/^\d+$/.test(part)) {
      const idx = parseInt(part) - 1;
      if (idx >= 0 && idx < total) pages.add(idx);
    }
  });
  return Array.from(pages).sort((a,b)=>a-b);
}

// ── CHUNKS PREVIEW ─────────────────────────────────────
function updateChunksPreview() {
  if (!TOTAL_PAGES) return;
  if (SELECTED_MODE === 'every_n') {
    const n = Math.max(1, parseInt(D.everyNInput.value)||1);
    const chunks = Math.ceil(TOTAL_PAGES / n);
    D.chunksPreview.textContent = `→ ${chunks} file${chunks!==1?'s':''} · ~${n} page${n!==1?'s':''} each`;
  }
}

// ── BOOKMARKS LIST ─────────────────────────────────────
function renderBookmarksList() {
  if (!D.bookmarksList) return;
  if (!BOOKMARKS.length) {
    D.bookmarksList.innerHTML = '<div class="sp-bookmark-item" style="color:var(--sp-text3)"><i class="fa fa-info-circle"></i> No bookmarks found — will split every 5 pages as fallback</div>';
    return;
  }
  D.bookmarksList.innerHTML = BOOKMARKS.slice(0, 15).map(b =>
    `<div class="sp-bookmark-item" style="padding-left:${10 + b.depth * 14}px">
      <i class="fa fa-bookmark"></i> ${escHtml(b.title)}
    </div>`
  ).join('') + (BOOKMARKS.length > 15 ? `<div class="sp-bookmark-item" style="color:var(--sp-text3)"><i class="fa fa-ellipsis-h"></i> +${BOOKMARKS.length-15} more chapters</div>` : '');
}

// ── MAIN SPLIT ─────────────────────────────────────────
async function doSplit() {
  if (!FILE) return;

  // Validate
  if (SELECTED_MODE === 'range') {
    const val = D.rangeInput.value.trim();
    if (!val) { showToast('Enter page ranges first', 'error'); playSound('warn'); return; }
    const pages = parseRangeStr(val, TOTAL_PAGES);
    if (!pages.length) { showToast('No valid pages in range', 'error'); playSound('error'); return; }
  }

  playSound('start');
  const jobId = 'split_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);

  // Build form
  const fd = new FormData();
  fd.append('file', FILE);
  fd.append('mode', SELECTED_MODE);
  fd.append('ranges', D.rangeInput.value.trim());
  fd.append('every_n', D.everyNInput.value);
  fd.append('max_size_mb', D.sizeSlider.value);
  fd.append('password', D.pdfPassword.value);
  fd.append('naming_pattern', D.namingPattern.value.trim() || 'page_{n:04d}');
  fd.append('remove_blanks', D.removeBlanks.checked ? 'true' : 'false');
  fd.append('job_id', jobId);

  // Show progress
  D.actionSection.hidden = true;
  D.modesCard.hidden = true;
  D.optsCard.hidden = true;
  D.advCard.hidden = true;
  D.progressCard.hidden = false;
  D.resultsCard.hidden = true;

  if (typeof gsap !== 'undefined') {
    gsap.from(D.progressCard, { y: 20, opacity: 0, duration: .4, ease: 'power2.out' });
  }

  setProgress(0, 'Uploading PDF…', 'Preparing your file');

  // Start SSE
  startSSE(jobId);

  // Simulate progress for early stages
  _currentPct = 0;
  _simTimer = setInterval(() => {
    if (_currentPct < 65) { _currentPct += 1 + Math.random() * 2; setProgress(Math.min(65, _currentPct), 'Splitting PDF…', 'Processing pages'); }
  }, 180);

  try {
    const resp = await fetch('/api/split-pdf', { method: 'POST', body: fd });
    clearInterval(_simTimer);
    stopSSE();

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Server error' }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    setProgress(92, 'Creating ZIP…', 'Packaging split files');
    addProgressStep('done', '✔ PDF split successfully');

    const blob = await resp.blob();
    const fileCount  = parseInt(resp.headers.get('X-File-Count') || '0');
    const totalPages = parseInt(resp.headers.get('X-Total-Pages') || TOTAL_PAGES || '0');
    const skipped    = parseInt(resp.headers.get('X-Skipped-Blanks') || '0');

    // Smart filename: based on original PDF name
    const stem = FILE.name.replace(/\.pdf$/i, '');
    RESULT_NAME = `${stem}_split.zip`;
    RESULT_BLOB = blob;

    setProgress(100, 'Done!', '');
    addProgressStep('done', '✔ ZIP archive ready');

    setTimeout(() => showResults(fileCount, totalPages, skipped), 400);
    playSound('success');

  } catch(err) {
    clearInterval(_simTimer);
    stopSSE();
    console.error('Split error:', err);
    showProgress(false);
    playSound('error');
    showToast('Error: ' + (err.message || 'Split failed'), 'error');

    // Show action section again
    D.progressCard.hidden = true;
    D.modesCard.hidden = false;
    showModeOptions(SELECTED_MODE);
    D.advCard.hidden = false;
    D.actionSection.hidden = false;
  }
}

// ── SSE PROGRESS ───────────────────────────────────────
function startSSE(jobId) {
  try {
    _sseSource = new EventSource(`/api/progress/${jobId}`);
    _sseSource.onmessage = e => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.pct !== undefined && msg.pct > _currentPct) {
          _currentPct = msg.pct;
          setProgress(msg.pct, msg.title || 'Processing…', msg.sub || '');
        }
        if (msg.done) stopSSE();
      } catch(err) {}
    };
    _sseSource.onerror = () => stopSSE();
  } catch(e) {}
}

function stopSSE() {
  if (_sseSource) { _sseSource.close(); _sseSource = null; }
}

// ── PROGRESS UI ────────────────────────────────────────
function setProgress(pct, title, sub) {
  pct = Math.max(0, Math.min(100, Math.round(pct)));
  D.progressFill.style.width = pct + '%';
  D.progressPct.textContent = pct + '%';
  if (title) D.progressTitle.textContent = title;
  if (sub !== undefined) D.progressSub.textContent = sub;
}

function addProgressStep(state, text) {
  const el = document.createElement('div');
  el.className = 'sp-progress-step ' + state;
  el.innerHTML = state === 'done'
    ? `<i class="fa fa-check-circle" style="color:var(--sp-green)"></i> ${escHtml(text)}`
    : `<i class="fa fa-circle-notch fa-spin"></i> ${escHtml(text)}`;
  D.progressSteps.appendChild(el);
  if (D.progressSteps.children.length > 6) D.progressSteps.removeChild(D.progressSteps.firstChild);
}

function showProgress(show) {
  D.progressCard.hidden = !show;
}

// ── SHOW RESULTS ───────────────────────────────────────
function showResults(fileCount, totalPages, skipped) {
  D.progressCard.hidden = true;
  D.resultsCard.hidden = false;

  D.resFileCount.textContent = fileCount || '—';
  D.resTotalPages.textContent = totalPages || TOTAL_PAGES || '—';
  if (skipped > 0) {
    D.resSkipped.textContent = skipped;
  } else {
    D.resSkippedWrap.hidden = true;
  }

  if (typeof gsap !== 'undefined') {
    gsap.from(D.resultsCard, { y: 30, opacity: 0, duration: .5, ease: 'power3.out' });
    gsap.from('.sp-check-circle', { scale: 0, duration: .5, delay: .1, ease: 'back.out(1.5)' });
    gsap.from('.sp-res-stat', { y: 20, opacity: 0, duration: .4, stagger: .1, delay: .2, ease: 'power2.out' });

    // Confetti-like particles on success
    launchConfetti();
  }
}

function launchConfetti() {
  const colors = ['#3b82f6','#06b6d4','#10b981','#8b5cf6','#f59e0b'];
  for (let i = 0; i < 18; i++) {
    const dot = document.createElement('div');
    dot.style.cssText = `position:fixed;width:8px;height:8px;border-radius:50%;
      background:${colors[i % colors.length]};pointer-events:none;z-index:9999;
      left:${Math.random()*100}vw;top:100vh`;
    document.body.appendChild(dot);
    gsap.to(dot, {
      y: -(window.innerHeight * .8 + Math.random() * window.innerHeight * .4),
      x: (Math.random() - .5) * 200,
      opacity: 0, duration: 1.2 + Math.random() * .8,
      delay: Math.random() * .4, ease: 'power2.out',
      onComplete: () => dot.remove()
    });
  }
}

// ── DOWNLOAD ───────────────────────────────────────────
function downloadResult() {
  if (!RESULT_BLOB) return;
  playSound('download');
  const url = URL.createObjectURL(RESULT_BLOB);
  const a = document.createElement('a');
  a.href = url; a.download = RESULT_NAME;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ── RESET ──────────────────────────────────────────────
function resetTool() {
  FILE = null; TOTAL_PAGES = 0; BOOKMARKS = []; RESULT_BLOB = null; RESULT_NAME = '';
  _currentPct = 0;
  clearInterval(_simTimer);
  stopSSE();

  D.fileInput.value = '';
  D.fileCard.hidden = true;
  D.uploadCard.hidden = false;
  D.modesCard.hidden = true;
  D.optsCard.hidden = true;
  D.advCard.hidden = true;
  D.actionSection.hidden = true;
  D.progressCard.hidden = true;
  D.resultsCard.hidden = true;

  D.thumbsStrip.innerHTML = '';
  D.thumbsStrip.appendChild(D.thumbsLoading);
  D.thumbsLoading.hidden = false;
  D.thumbsCount.textContent = '';
  D.statBookmarks.classList.add('sp-hidden');
  D.progressSteps.innerHTML = '';
  D.resSkippedWrap.hidden = false;
  D.rangeInput.value = '';
  D.rangePreview.innerHTML = '';
  D.everyNInput.value = 2;
  D.advBody.hidden = true;
  D.advArrow.classList.remove('open');
  D.pdfPassword.value = '';
  D.removeBlanks.checked = false;
  D.namingPattern.value = 'page_{n:04d}';
  BOOKMARKS = [];

  SELECTED_MODE = 'all';
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(c => {
    c.classList.toggle('active', c.dataset.mode === 'all');
  });

  if (typeof gsap !== 'undefined') {
    gsap.from(D.uploadCard, { scale: .97, opacity: 0, duration: .35, ease: 'power2.out' });
  }
}

// ── THEME ──────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('sp-theme') || 'dark';
  setTheme(saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'dark' ? 'light' : 'dark');
}
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('sp-theme', t);
  D.themeBtn.innerHTML = t === 'dark'
    ? '<i class="fa fa-moon"></i>'
    : '<i class="fa fa-sun"></i>';
}

// ── TOAST ──────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type = 'info') {
  let toast = document.querySelector('.sp-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'sp-toast';
    document.body.appendChild(toast);
  }
  toast.className = 'sp-toast ' + type;
  const icon = type === 'error' ? 'fa-exclamation-circle' : type === 'success' ? 'fa-check-circle' : 'fa-info-circle';
  toast.innerHTML = `<i class="fa ${icon}"></i> ${escHtml(msg)}`;
  toast.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── FAQ ────────────────────────────────────────────────
function initFAQ() {
  if (!D.faqList) return;
  D.faqList.querySelectorAll('.sp-faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.sp-faq-item');
      const isOpen = item.classList.contains('open');
      D.faqList.querySelectorAll('.sp-faq-item').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

// ── PARTICLES ─────────────────────────────────────────
function initParticles() {
  const container = document.getElementById('heroParticles');
  if (!container) return;
  for (let i = 0; i < 12; i++) {
    const p = document.createElement('div');
    p.className = 'sp-particle';
    const size = 4 + Math.random() * 12;
    p.style.cssText = `
      width:${size}px;height:${size}px;
      left:${Math.random()*100}%;
      animation-duration:${5 + Math.random()*8}s;
      animation-delay:${Math.random()*6}s;
    `;
    container.appendChild(p);
  }
}

// ── GSAP INTRO ─────────────────────────────────────────
function initGSAP() {
  if (typeof gsap === 'undefined') return;
  // NEVER use opacity:0 in above-fold animations — content must always be visible
  gsap.from('.sp-hero-badge', { y: 18, duration: .6, delay: .1, ease: 'power2.out' });
  gsap.from('.sp-hero-h1',    { y: 28, duration: .7, delay: .2, ease: 'power2.out' });
  gsap.from('.sp-hero-sub',   { y: 18, duration: .6, delay: .32, ease: 'power2.out' });
  gsap.from('.sp-hero-pills span', { y: 12, duration: .5, stagger: .06, delay: .45, ease: 'power2.out' });
  gsap.from('.sp-upload-card', { y: 28, duration: .7, delay: .55, ease: 'power2.out' });

  // Intersection observer for below-fold sections (Y-only, no opacity)
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        gsap.from(e.target.querySelectorAll('.sp-step-card, .sp-feat-card, .sp-rel-card, .sp-faq-item'), {
          y: 20, duration: .5, stagger: .06, ease: 'power2.out'
        });
        io.unobserve(e.target);
      }
    });
  }, { threshold: .1 });

  document.querySelectorAll('.sp-howto, .sp-features, .sp-related, .sp-faq').forEach(s => io.observe(s));
}

// ── HELPERS ────────────────────────────────────────────
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes/1048576).toFixed(1) + ' MB';
  return (bytes/1073741824).toFixed(2) + ' GB';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
