/**
 * Merge PDF — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Full professional standalone implementation
 * Libraries: SortableJS, GSAP, PDF.js (via CDN)
 */

'use strict';

/* ══════════════════════════════════════════════════════════
   CONFIG & GLOBALS
══════════════════════════════════════════════════════════ */
const MAX_FILES = 50;
const MAX_FILE_SIZE_MB = 1024;
const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
const FILE_COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

let files = [];           // Array of { id, file, pageRange, password, info }
let sortable = null;
let pdfjsLib = null;
let mergeResult    = null;
let mergeStartTime = null;
let downloadUrl = null;
let currentSort = 'order';
let originalOrder = []; // store original file order for "order" sort

/* ══════════════════════════════════════════════════════════
   DOM REFS
══════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const dropZone       = $('dropZone');
const fileInput      = $('fileInput');
const addMoreInput   = $('addMoreInput');
const uploadSection  = $('uploadSection');
const filesSection   = $('filesSection');
const progressSection= $('progressSection');
const resultSection  = $('resultSection');
const fileList       = $('fileList');
const fileCountBadge = $('fileCountBadge');
const mergeBtnCount  = $('mergeBtnCount');
const mergeBtn       = $('mergeBtn');
const addMoreBtn     = $('addMoreBtn');
const clearAllBtn    = $('clearAllBtn');
const optionsToggle  = $('optionsToggle');
const optionsBody    = $('optionsBody');
const optionsChevron = $('optionsChevron');
const progressBar    = $('progressBar');
const progressTitle  = $('progressTitle');
const progressSub    = $('progressSub');
const downloadBtn    = $('downloadBtn');
const mergeAgainBtn  = $('mergeAgainBtn');
const themeToggle    = $('themeToggle');
const themeIcon      = $('themeIcon');
const toast          = $('toast');

// Main Options
const optToc        = $('optToc');
const optSeparators = $('optSeparators');
const optBookmarks  = $('optBookmarks');
const optSkipDupes  = $('optSkipDupes');
const optCompress   = $('optCompress');
const optNormalize  = $('optNormalize');
const optTargetSize = $('optTargetSize');
const optMethod     = $('optMethod');
const optTitle      = $('optTitle');
const optAuthor     = $('optAuthor');

// Quick Options (chips)
const qOptToc      = $('qOptToc');
const qOptSep      = $('qOptSep');
const qOptCompress = $('qOptCompress');
const qOptBmarks   = $('qOptBmarks');
const qOptLinear   = $('qOptLinear');

// Stats
const sbFiles = $('sbFiles');
const sbPages = $('sbPages');
const sbSize  = $('sbSize');
const sbEst   = $('sbEst');
const dragHintCount = $('dragHintCount');

/* ══════════════════════════════════════════════════════════
   CANVAS BACKGROUND
══════════════════════════════════════════════════════════ */
(function initCanvas() {
  const canvas = $('bgCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function mkParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.8 + 0.4,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      alpha: Math.random() * 0.45 + 0.05,
      hue: 230 + Math.random() * 40,
    };
  }

  function initParticles() {
    const count = Math.min(Math.floor((W * H) / 9000), 120);
    particles = Array.from({ length: count }, mkParticle);
  }

  function drawFrame() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},80%,65%,${p.alpha})`;
      ctx.fill();
    });

    // Draw connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 110) {
          const alpha = (1 - dist / 110) * 0.12;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(99,102,241,${alpha})`;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(drawFrame);
  }

  resize();
  initParticles();
  drawFrame();
  window.addEventListener('resize', () => { resize(); initParticles(); });
})();

/* ══════════════════════════════════════════════════════════
   THEME TOGGLE
══════════════════════════════════════════════════════════ */
(function initTheme() {
  const saved = localStorage.getItem('ishu-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
})();

function updateThemeIcon(theme) {
  if (!themeIcon) return;
  themeIcon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

themeToggle && themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ishu-theme', next);
  updateThemeIcon(next);
});

/* ══════════════════════════════════════════════════════════
   NAVBAR SCROLL
══════════════════════════════════════════════════════════ */
const navbar = $('navbar');
window.addEventListener('scroll', () => {
  if (!navbar) return;
  navbar.style.boxShadow = window.scrollY > 20
    ? '0 4px 32px rgba(0,0,0,0.25)'
    : 'none';
}, { passive: true });

/* ══════════════════════════════════════════════════════════
   LOAD PDF.JS DYNAMICALLY
══════════════════════════════════════════════════════════ */
async function loadPDFJS() {
  if (pdfjsLib) return pdfjsLib;
  try {
    const mod = await import(PDFJS_CDN);
    pdfjsLib = mod;
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return pdfjsLib;
  } catch (e) {
    console.warn('PDF.js failed to load:', e);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════
   FILE HANDLING
══════════════════════════════════════════════════════════ */
function generateId() {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function truncateName(name, max = 36) {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf('.') > -1 ? name.slice(name.lastIndexOf('.')) : '';
  return name.slice(0, max - ext.length - 3) + '…' + ext;
}

async function addFiles(newFiles) {
  const pdfFiles = Array.from(newFiles).filter(f => {
    if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
      showToast(`"${f.name}" is not a PDF file`, 'warn');
      return false;
    }
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      showToast(`"${f.name}" exceeds 1 GB limit`, 'warn');
      return false;
    }
    return true;
  });

  if (files.length + pdfFiles.length > MAX_FILES) {
    showToast(`Maximum ${MAX_FILES} files allowed`, 'warn');
    const remaining = MAX_FILES - files.length;
    pdfFiles.splice(remaining);
  }

  if (pdfFiles.length === 0) return;

  const newEntries = pdfFiles.map(f => ({
    id: generateId(),
    file: f,
    pageRange: '',
    password: '',
    info: null,
  }));

  files.push(...newEntries);
  originalOrder = [...files.map(f => f.id)]; // track original order
  showFilesSection();
  renderFileList();
  updateCounts();
  checkDuplicates();

  // Load thumbnails + info in background (PDF.js)
  const lib = await loadPDFJS();
  for (const entry of newEntries) {
    loadFileInfo(entry, lib);
  }

  // Server-side validation in background (metadata, warnings, forms)
  for (const entry of newEntries) {
    validateFileAsync(entry);
  }
}

/* ══════════════════════════════════════════════════════════
   LIVE STATS
══════════════════════════════════════════════════════════ */
function updateLiveStats() {
  const n = files.length;
  if (sbFiles) animateCounter(sbFiles, n);

  const totalBytes = files.reduce((s, f) => s + f.file.size, 0);
  if (sbSize) sbSize.textContent = totalBytes > 0 ? formatBytes(totalBytes) : '—';

  const known = files.filter(f => f.info && typeof f.info.pageCount === 'number');
  if (known.length > 0) {
    const total = known.reduce((s, f) => s + f.info.pageCount, 0);
    const hasUnknown = known.length < files.length;
    if (sbPages) {
      if (hasUnknown) {
        sbPages.textContent = total + '+';
      } else {
        animateCounter(sbPages, total);
      }
    }
  } else {
    if (sbPages) sbPages.textContent = '—';
  }

  // Estimate merge time (very rough: ~0.5s per MB of total input)
  const estSec = Math.max(1, Math.round(totalBytes / (1024 * 1024) * 0.5 + n * 0.3));
  if (sbEst) sbEst.textContent = estSec < 60 ? `~${estSec}s` : `~${Math.ceil(estSec/60)}m`;

  // Large page count warning
  checkLargePageWarning();

  // Update drag hint
  if (dragHintCount) {
    dragHintCount.textContent = n > 0
      ? `${n} ${n===1?'file':'files'} — drag to reorder`
      : 'add files to begin';
  }
}

/* ══════════════════════════════════════════════════════════
   SORT FILES
══════════════════════════════════════════════════════════ */
function sortFiles(by) {
  currentSort = by;
  document.querySelectorAll('.sort-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.sort === by);
  });

  if (by === 'order') {
    files.sort((a, b) => originalOrder.indexOf(a.id) - originalOrder.indexOf(b.id));
  } else if (by === 'name') {
    files.sort((a, b) => a.file.name.localeCompare(b.file.name));
  } else if (by === 'size') {
    files.sort((a, b) => b.file.size - a.file.size);
  } else if (by === 'pages') {
    files.sort((a, b) => {
      const pa = a.info?.pageCount || 0;
      const pb = b.info?.pageCount || 0;
      return pb - pa;
    });
  }

  renderFileList();
  updateCounts();
  if (typeof gsap !== 'undefined') {
    gsap.from('#fileList .file-card', { duration: 0.3, y: 8, stagger: 0.04, ease: 'power2.out' });
  }
}

/* ══════════════════════════════════════════════════════════
   DUPLICATE DETECTION
══════════════════════════════════════════════════════════ */
function checkDuplicates() {
  // Remove existing warning
  const existing = document.querySelector('.dupe-warning');
  if (existing) existing.remove();

  const seen = new Map(); // name+size -> id
  const dupes = [];

  files.forEach(f => {
    const key = `${f.file.name}__${f.file.size}`;
    if (seen.has(key)) {
      dupes.push(f.id);
      dupes.push(seen.get(key));
    } else {
      seen.set(key, f.id);
    }
  });

  // Mark cards
  document.querySelectorAll('.file-card').forEach(card => {
    card.classList.toggle('is-duplicate', dupes.includes(card.dataset.id));
  });

  if (dupes.length > 0) {
    const warn = document.createElement('div');
    warn.className = 'dupe-warning';
    warn.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${dupes.length/2|0} possible duplicate file(s) detected. Enable "Skip Duplicates" to remove them.`;
    fileList.before(warn);
  }
}

/* ══════════════════════════════════════════════════════════
   QUICK OPTIONS SYNC
══════════════════════════════════════════════════════════ */
function setupQuickOptSync() {
  // quick → main opts
  qOptToc && qOptToc.addEventListener('change', () => {
    if (optToc) optToc.checked = qOptToc.checked;
    qOptToc.closest('.qopt-chip').classList.toggle('active', qOptToc.checked);
  });
  qOptSep && qOptSep.addEventListener('change', () => {
    if (optSeparators) optSeparators.checked = qOptSep.checked;
    qOptSep.closest('.qopt-chip').classList.toggle('active', qOptSep.checked);
  });
  qOptCompress && qOptCompress.addEventListener('change', () => {
    if (optCompress) optCompress.checked = qOptCompress.checked;
    qOptCompress.closest('.qopt-chip').classList.toggle('active', qOptCompress.checked);
  });
  qOptBmarks && qOptBmarks.addEventListener('change', () => {
    if (optBookmarks) optBookmarks.checked = qOptBmarks.checked;
    qOptBmarks.closest('.qopt-chip').classList.toggle('active', qOptBmarks.checked);
  });
  qOptLinear && qOptLinear.addEventListener('change', () => {
    qOptLinear.closest('.qopt-chip').classList.toggle('active', qOptLinear.checked);
  });

  // main → quick opts (keep in sync when user opens advanced panel)
  optToc        && optToc.addEventListener('change',        () => { if (qOptToc) qOptToc.checked = optToc.checked; });
  optSeparators && optSeparators.addEventListener('change', () => { if (qOptSep) qOptSep.checked = optSeparators.checked; });
  optCompress   && optCompress.addEventListener('change',   () => { if (qOptCompress) qOptCompress.checked = optCompress.checked; });
  optBookmarks  && optBookmarks.addEventListener('change',  () => { if (qOptBmarks) qOptBmarks.checked = optBookmarks.checked; });

  // Set initial active states
  [qOptToc, qOptSep, qOptCompress, qOptBmarks, qOptLinear].forEach(el => {
    if (el) el.closest('.qopt-chip')?.classList.toggle('active', el.checked);
  });
}

/* ══════════════════════════════════════════════════════════
   CONFETTI
══════════════════════════════════════════════════════════ */
function launchConfetti() {
  const container = document.createElement('div');
  container.className = 'confetti-container';
  document.body.appendChild(container);

  const colors = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#a78bfa'];
  const shapes = ['0%','4px','50%'];
  const count = 90;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const size = Math.random() * 8 + 6;
    const left = Math.random() * 100;
    const delay = Math.random() * 0.8;
    const duration = Math.random() * 1.5 + 2;
    const drift = (Math.random() - 0.5) * 160;

    piece.style.cssText = `
      left:${left}%;
      width:${size}px;height:${size}px;
      background:${color};
      border-radius:${shape};
      animation-duration:${duration}s;
      animation-delay:${delay}s;
      transform:translateX(${drift}px);
    `;
    container.appendChild(piece);
  }

  setTimeout(() => container.remove(), 4000);
}

async function loadFileInfo(entry, lib) {
  const thumbEl = document.querySelector(`[data-id="${entry.id}"] .file-thumb`);
  if (!thumbEl) return;

  // Show loading
  thumbEl.innerHTML = '<div class="thumb-loading"></div>';

  try {
    const arrayBuf = await entry.file.arrayBuffer();

    // Try PDF.js thumbnail
    if (lib) {
      try {
        const pdf = await lib.getDocument({ data: arrayBuf.slice(0), password: entry.password || '' }).promise;
        entry.info = { pageCount: pdf.numPages, encrypted: false };

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.4 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;

        if (thumbEl) {
          thumbEl.innerHTML = '';
          thumbEl.appendChild(canvas);
        }

        updateFileCard(entry);
        return;
      } catch (e) {
        // Could be encrypted or corrupt
        if (e.name === 'PasswordException') {
          entry.info = { pageCount: '?', encrypted: true };
        } else {
          entry.info = { pageCount: '?', encrypted: false };
        }
      }
    }
  } catch (e) {
    entry.info = { pageCount: '?', encrypted: false };
  }

  // Fallback icon
  if (thumbEl) {
    thumbEl.innerHTML = `
      <div class="thumb-placeholder">
        <i class="fas fa-file-pdf"></i>
        <span>PDF</span>
      </div>`;
  }
  updateFileCard(entry);
}

function updateFileCard(entry) {
  const card = document.querySelector(`[data-id="${entry.id}"]`);
  if (!card || !entry.info) return;

  const metaEl = card.querySelector('.file-meta');
  if (!metaEl) return;

  const { pageCount, encrypted } = entry.info;
  metaEl.innerHTML = `
    <span class="file-meta-pill"><i class="fas fa-book-open"></i> ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}</span>
    <span class="file-meta-pill"><i class="fas fa-database"></i> ${formatBytes(entry.file.size)}</span>
    ${encrypted ? '<span class="file-meta-pill encrypted"><i class="fas fa-lock"></i> Encrypted</span>' : ''}
  `;

  // Show password field if encrypted
  if (encrypted) {
    const pwField = card.querySelector('.pw-field');
    if (pwField) pwField.style.display = '';
    if (!card.classList.contains('expanded')) {
      card.classList.add('expanded');
    }
  }

  // Re-run stats since we now know page count
  updateLiveStats();
}

/* ══════════════════════════════════════════════════════════
   RENDER FILE LIST
══════════════════════════════════════════════════════════ */
function renderFileList() {
  // Build all cards from scratch
  fileList.innerHTML = '';

  files.forEach((entry, idx) => {
    const card = createFileCard(entry, idx);
    fileList.appendChild(card);
  });

  // (Re)init SortableJS
  if (sortable) sortable.destroy();
  sortable = Sortable.create(fileList, {
    animation: 180,
    handle: '.file-drag-handle',
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag',
    onEnd(evt) {
      const movedEntry = files.splice(evt.oldIndex, 1)[0];
      files.splice(evt.newIndex, 0, movedEntry);
      updateCounts();
      updateFileNumbers();
    },
  });
}

function createFileCard(entry, idx) {
  const card = document.createElement('div');
  const colorIdx = idx % FILE_COLORS.length;
  card.className = 'file-card entering';
  card.setAttribute('data-id', entry.id);
  card.setAttribute('data-color', colorIdx);
  card.setAttribute('role', 'listitem');

  // Remove entering class after animation
  setTimeout(() => card.classList.remove('entering'), 350);

  const displayName = entry.displayName || entry.file.name;
  card.innerHTML = `
    <div class="file-drag-handle" title="Drag to reorder" aria-label="Drag handle">
      <i class="fas fa-grip-dots-vertical"></i>
    </div>
    <div class="file-thumb">
      <div class="thumb-loading"></div>
    </div>
    <div class="file-info">
      <div class="file-name" title="${displayName} (double-click to rename)">${truncateName(displayName)}</div>
      <div class="file-meta">
        <span class="file-meta-pill"><i class="fas fa-database"></i> ${formatBytes(entry.file.size)}</span>
      </div>
      <div class="file-expanded">
        <div class="file-field-row">
          <div class="file-field">
            <label><i class="fas fa-list-ol"></i> Page Range (optional)</label>
            <input type="text" class="page-range-input" value="${entry.pageRange}"
              placeholder="e.g. 1-3, 5, 8-10 · odd · even · last 2"
              aria-label="Page range for ${entry.file.name}" />
            <div class="pr-quick-btns" role="group" aria-label="Quick page selection">
              <button type="button" class="pr-btn${!entry.pageRange ? ' active' : ''}" data-range="" title="Include all pages">All</button>
              <button type="button" class="pr-btn" data-range="1" title="First page only">First</button>
              <button type="button" class="pr-btn" data-range="last" title="Last page only">Last</button>
              <button type="button" class="pr-btn" data-range="odd" title="Odd pages (1, 3, 5…)">Odd</button>
              <button type="button" class="pr-btn" data-range="even" title="Even pages (2, 4, 6…)">Even</button>
            </div>
          </div>
          <div class="file-field pw-field" style="display:${entry.info?.encrypted ? '' : 'none'}">
            <label><i class="fas fa-key"></i> PDF Password</label>
            <input type="password" class="password-input" value="${entry.password}"
              placeholder="Enter password"
              aria-label="Password for ${entry.file.name}" />
          </div>
        </div>
      </div>
    </div>
    <div class="file-actions">
      <div class="file-status loading" id="vstatus_${entry.id}" title="Validating…"></div>
      <span class="file-num">#${idx + 1}</span>
      <button class="btn-icon primary expand-btn" title="Expand options" aria-label="Expand file options">
        <i class="fas fa-sliders"></i>
      </button>
      <button class="btn-icon danger remove-btn" title="Remove file" aria-label="Remove ${entry.file.name}">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;

  // Inline rename on double-click
  const nameEl = card.querySelector('.file-name');
  nameEl.addEventListener('dblclick', e => {
    e.stopPropagation();
    nameEl.contentEditable = 'true';
    nameEl.classList.add('editing');
    // Strip .pdf extension for editing comfort
    const stem = (entry.displayName || entry.file.name).replace(/\.pdf$/i, '');
    nameEl.textContent = stem;
    nameEl.focus();
    // Select all
    const range = document.createRange();
    range.selectNodeContents(nameEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  nameEl.addEventListener('blur', () => {
    if (nameEl.contentEditable !== 'true') return;
    nameEl.contentEditable = 'false';
    nameEl.classList.remove('editing');
    const orig = entry.displayName || entry.file.name;
    let stem = nameEl.textContent.trim();
    if (!stem) stem = orig.replace(/\.pdf$/i, '');
    const newName = stem.endsWith('.pdf') ? stem : stem + '.pdf';
    if (newName !== orig) {
      entry.displayName = newName;
      showToast(`Renamed to "${newName}"`, 'info');
    }
    nameEl.textContent = truncateName(newName);
    nameEl.title = `${newName} (double-click to rename)`;
  });
  nameEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    if (e.key === 'Escape') {
      nameEl.textContent = truncateName(entry.displayName || entry.file.name);
      nameEl.contentEditable = 'false';
      nameEl.classList.remove('editing');
    }
  });

  // Bind events
  card.querySelector('.remove-btn').addEventListener('click', e => {
    e.stopPropagation();
    removeFile(entry.id);
  });

  card.querySelector('.expand-btn').addEventListener('click', e => {
    e.stopPropagation();
    card.classList.toggle('expanded');
    const icon = card.querySelector('.expand-btn i');
    icon.className = card.classList.contains('expanded') ? 'fas fa-chevron-up' : 'fas fa-sliders';
  });

  const rangeInput = card.querySelector('.page-range-input');
  rangeInput.addEventListener('change', () => {
    const e = files.find(f => f.id === entry.id);
    if (e) e.pageRange = rangeInput.value.trim();
  });

  // Page range quick buttons
  const prBtns = card.querySelectorAll('.pr-btn');
  prBtns.forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const range = btn.dataset.range;
      rangeInput.value = range;
      const f = files.find(f => f.id === entry.id);
      if (f) f.pageRange = range;
      prBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  rangeInput.addEventListener('input', () => {
    prBtns.forEach(b => b.classList.toggle('active', b.dataset.range === rangeInput.value.trim()));
  });

  const pwInput = card.querySelector('.password-input');
  pwInput.addEventListener('change', () => {
    const e = files.find(f => f.id === entry.id);
    if (e) e.password = pwInput.value;
  });

  return card;
}

function removeFile(id) {
  const idx = files.findIndex(f => f.id === id);
  if (idx === -1) return;
  const card = document.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.style.transition = 'all 0.25s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(16px)';
    setTimeout(() => {
      files.splice(idx, 1);
      renderFileList();
      updateCounts();
      checkDuplicates();
      if (files.length === 0) showUploadSection();
    }, 250);
  } else {
    files.splice(idx, 1);
    renderFileList();
    updateCounts();
    checkDuplicates();
    if (files.length === 0) showUploadSection();
  }
}

function updateFileNumbers() {
  fileList.querySelectorAll('.file-card').forEach((card, i) => {
    const numEl = card.querySelector('.file-num');
    if (numEl) numEl.textContent = `#${i + 1}`;
    card.setAttribute('data-color', i % FILE_COLORS.length);
  });
}

function updateCounts() {
  const n = files.length;
  if (fileCountBadge) fileCountBadge.textContent = `${n} ${n === 1 ? 'file' : 'files'}`;
  if (mergeBtnCount) mergeBtnCount.textContent = n > 0 ? `${n} files` : '';
  if (mergeBtn) {
    mergeBtn.disabled = n < 2;
    mergeBtn.classList.toggle('ready', n >= 2);
  }
  updateLiveStats();
}

/* ══════════════════════════════════════════════════════════
   SECTION VISIBILITY
══════════════════════════════════════════════════════════ */
function showUploadSection() {
  uploadSection.removeAttribute('hidden');
  filesSection.setAttribute('hidden', '');
  progressSection.setAttribute('hidden', '');
  resultSection.setAttribute('hidden', '');
  if (typeof gsap !== 'undefined') {
    gsap.from(uploadSection, { duration: 0.4, y: 20, opacity: 0, ease: 'power2.out' });
  }
}

function showFilesSection() {
  uploadSection.setAttribute('hidden', '');
  filesSection.removeAttribute('hidden');
  progressSection.setAttribute('hidden', '');
  resultSection.setAttribute('hidden', '');
  if (typeof gsap !== 'undefined') {
    gsap.from(filesSection, { duration: 0.45, y: 24, opacity: 0, ease: 'power2.out' });
  }
}

function showProgress() {
  uploadSection.setAttribute('hidden', '');
  filesSection.setAttribute('hidden', '');
  progressSection.removeAttribute('hidden');
  resultSection.setAttribute('hidden', '');
  if (typeof gsap !== 'undefined') {
    gsap.from(progressSection, { duration: 0.4, scale: 0.97, opacity: 0, ease: 'power2.out' });
  }
  animateProgress();
}

function showResult() {
  uploadSection.setAttribute('hidden', '');
  filesSection.setAttribute('hidden', '');
  progressSection.setAttribute('hidden', '');
  resultSection.removeAttribute('hidden');
  if (typeof gsap !== 'undefined') {
    gsap.from(resultSection, { duration: 0.5, scale: 0.95, opacity: 0, ease: 'back.out(1.4)' });
  }
}

/* ══════════════════════════════════════════════════════════
   PROGRESS ANIMATION
══════════════════════════════════════════════════════════ */
let progressTimer = null;
function animateProgress() {
  let pct = 0;
  progressBar.style.width = '0%';
  setProgressStep(1);

  progressTimer = setInterval(() => {
    if (pct < 30) { pct += 1.5; setProgressStep(1); }
    else if (pct < 75) { pct += 0.7; setProgressStep(2); }
    else if (pct < 90) { pct += 0.3; setProgressStep(3); }
    // Hold at 90% until real response
    progressBar.style.width = Math.min(pct, 90) + '%';
  }, 80);
}

function setProgressStep(step) {
  ['pstep1','pstep2','pstep3'].forEach((id, i) => {
    const el = $(id);
    if (!el) return;
    el.classList.remove('active', 'done');
    if (i + 1 < step) el.classList.add('done');
    else if (i + 1 === step) el.classList.add('active');
  });
  const messages = [
    ['Uploading files…', 'Sending your PDFs to the server'],
    ['Merging PDFs…', 'Combining documents with enterprise engine'],
    ['Preparing download…', 'Almost done! Finalizing your file'],
  ];
  const [title, sub] = messages[step - 1] || messages[0];
  if (progressTitle) progressTitle.textContent = title;
  if (progressSub) progressSub.textContent = sub;
}

function completeProgress() {
  if (progressTimer) clearInterval(progressTimer);
  progressBar.style.width = '100%';
  ['pstep1','pstep2','pstep3'].forEach(id => {
    const el = $(id);
    if (el) { el.classList.remove('active'); el.classList.add('done'); }
  });
  const p4 = $('pstep4');
  if (p4) { p4.classList.remove('done'); p4.classList.add('active'); }
  if (progressTitle) progressTitle.textContent = 'Complete!';
  if (progressSub) progressSub.textContent = 'Preparing your download…';
}

/* ══════════════════════════════════════════════════════════
   MERGE ACTION
══════════════════════════════════════════════════════════ */
async function doMerge() {
  if (files.length < 2) {
    showToast('Please add at least 2 PDF files', 'warn');
    return;
  }

  mergeStartTime = Date.now();
  showProgress();

  const formData = new FormData();

  // Append files in current order
  files.forEach(entry => formData.append('files', entry.file, entry.file.name));

  // Options
  formData.append('add_toc',              optToc.checked        ? 'true' : 'false');
  formData.append('add_separators',       optSeparators.checked ? 'true' : 'false');
  formData.append('preserve_bookmarks',   optBookmarks.checked  ? 'true' : 'false');
  formData.append('skip_duplicates',      optSkipDupes.checked  ? 'true' : 'false');
  formData.append('compress_output',      optCompress.checked   ? 'true' : 'false');
  formData.append('normalize_page_size',  optNormalize.checked  ? 'true' : 'false');
  formData.append('target_page_size',     optTargetSize.value);
  formData.append('merge_method',         optMethod.value);
  formData.append('linearize',            qOptLinear && qOptLinear.checked ? 'true' : 'false');
  if (optTitle.value.trim())  formData.append('output_title', optTitle.value.trim());
  if (optAuthor.value.trim()) formData.append('output_author', optAuthor.value.trim());

  // Per-file page ranges (JSON array in same order as files)
  const pageRanges = files.map(e => e.pageRange || 'all');
  formData.append('page_ranges', JSON.stringify(pageRanges));

  // Per-file passwords
  const passwords = files.map(e => e.password || null);
  formData.append('passwords', JSON.stringify(passwords));

  // Per-file display names (used in TOC and separator pages)
  const displayNames = files.map(e => (e.displayName || e.file.name).replace(/\.pdf$/i, ''));
  formData.append('display_names', JSON.stringify(displayNames));

  try {
    const resp = await fetch('/api/merge-pdf', {
      method: 'POST',
      body: formData,
    });

    completeProgress();

    if (!resp.ok) {
      let msg = 'Merge failed. Please try again.';
      try {
        const data = await resp.json();
        msg = data.error || msg;
      } catch (_) {}
      showUploadSection();
      showToast(msg, 'error');
      return;
    }

    // Extract stats from headers
    const totalPages = resp.headers.get('X-Total-Pages') || '?';
    const sourceCount = resp.headers.get('X-Source-Count') || files.length;
    const outputSize = parseInt(resp.headers.get('X-Output-Size') || 0);
    const method = resp.headers.get('X-Method-Used') || 'pypdf';
    const tocAdded = resp.headers.get('X-TOC-Added') === 'True';

    // Get blob for download
    const blob = await resp.blob();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(blob);

    // Download filename — use FIRST/topmost file's name
    const firstEntry = files[0];
    const firstStem = (firstEntry.displayName || firstEntry.file.name)
      .replace(/\.pdf$/i, '').replace(/[\s/\\:*?"<>|]+/g, '_').slice(0, 60);
    mergeResult = {
      filename: `${firstStem}_merged.pdf`,
      totalPages,
      sourceCount,
      outputSize,
      method,
      tocAdded,
    };

    // Fill result stats
    $('rstatFiles').textContent  = sourceCount;
    $('rstatPages').textContent  = totalPages;
    $('rstatSize').textContent   = outputSize > 0 ? formatBytes(outputSize) : '—';
    $('rstatMethod').textContent = method
      .replace('pypdf+pikepdf', 'pypdf')
      .replace('ghostscript', 'Ghostscript')
      .replace('fitz', 'PyMuPDF');

    // Time elapsed
    const elapsedMs  = Date.now() - (mergeStartTime || Date.now());
    const elapsedSec = (elapsedMs / 1000).toFixed(1);
    const timeEl = $('rstatTime');
    if (timeEl) timeEl.textContent = `${elapsedSec}s`;

    // Size change badge
    const inputTotal = files.reduce((s, f) => s + f.file.size, 0);
    const sizeRatio  = inputTotal > 0 ? outputSize / inputTotal : 1;
    const savedPct   = Math.round((1 - sizeRatio) * 100);
    const savedEl    = $('rstatSaved');
    if (savedEl) {
      if (savedPct > 5) {
        savedEl.textContent  = `↓${savedPct}% smaller`;
        savedEl.className    = 'rstat-val size-positive';
      } else if (savedPct < -5) {
        savedEl.textContent  = `↑${Math.abs(savedPct)}% larger`;
        savedEl.className    = 'rstat-val size-negative';
      } else {
        savedEl.textContent  = 'Optimal';
        savedEl.className    = 'rstat-val size-neutral';
      }
    }

    // Quality badge
    const qualityEl = $('qualityBadge');
    if (qualityEl) {
      if (savedPct >= 15) {
        qualityEl.textContent = '★ Excellent — Size Reduced by ' + savedPct + '%';
        qualityEl.className   = 'quality-badge excellent';
      } else if (savedPct >= 0) {
        qualityEl.textContent = '✓ Good Quality Output';
        qualityEl.className   = 'quality-badge good';
      } else {
        qualityEl.textContent = '↑ Slightly Larger Than Input';
        qualityEl.className   = 'quality-badge fair';
      }
    }

    // Reading time estimate (avg 1.5 min per page, 250 words)
    const pageCount  = parseInt(totalPages) || 0;
    const readMins   = Math.max(1, Math.round(pageCount * 1.5));
    const readTimeEl = $('readingTime');
    if (readTimeEl) {
      readTimeEl.textContent = readMins < 60
        ? `📖 ~${readMins} min read`
        : `📖 ~${Math.floor(readMins / 60)}h ${readMins % 60}m read`;
    }
    const qRow = $('qualityBadgeRow');
    if (qRow) qRow.style.display = 'flex';

    const extras = [];
    if (tocAdded) extras.push('with TOC');
    if (optSeparators.checked) extras.push('with separators');
    $('resultSubtitle').textContent =
      `${sourceCount} files → ${totalPages} pages merged ${extras.length ? '(' + extras.join(', ') + ')' : 'successfully'}`;

    // Save to recent merges history
    saveRecentMerge(mergeResult);

    setTimeout(() => {
      showResult();
      playSuccessChime();
      launchConfetti();
      renderRecentMerges();
    }, 300);

  } catch (err) {
    completeProgress();
    showUploadSection();
    showToast('Network error. Please check your connection.', 'error');
    console.error('Merge error:', err);
  }
}

/* ══════════════════════════════════════════════════════════
   DOWNLOAD
══════════════════════════════════════════════════════════ */
function triggerDownload() {
  if (!downloadUrl || !mergeResult) return;
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = mergeResult.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  playDownloadSound();
  showToast('Download started!', 'success');
}

/* ══════════════════════════════════════════════════════════
   DROP ZONE EVENTS
══════════════════════════════════════════════════════════ */
dropZone.addEventListener('click', e => {
  if (e.target.closest('.drop-browse') || e.target === dropZone || e.target.closest('.drop-content')) {
    fileInput.click();
  }
});

dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

fileInput.addEventListener('change', e => {
  if (e.target.files.length) addFiles(e.target.files);
  fileInput.value = '';
});

addMoreBtn && addMoreBtn.addEventListener('click', () => addMoreInput.click());
addMoreInput.addEventListener('change', e => {
  if (e.target.files.length) addFiles(e.target.files);
  addMoreInput.value = '';
});

clearAllBtn && clearAllBtn.addEventListener('click', () => {
  if (files.length === 0) return;
  files = [];
  showUploadSection();
});

// Drag & drop on zone
['dragenter', 'dragover'].forEach(ev => {
  dropZone.addEventListener(ev, e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach(ev => {
  dropZone.addEventListener(ev, e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  });
});
dropZone.addEventListener('drop', e => {
  const dt = e.dataTransfer;
  if (dt && dt.files.length) addFiles(dt.files);
});

// Global drag-over highlight
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  if (e.target.closest('#dropZone')) return;
  e.preventDefault();
  if (e.dataTransfer.files.length) {
    const hasFiles = filesSection && !filesSection.hidden;
    if (hasFiles) addFiles(e.dataTransfer.files);
    else addFiles(e.dataTransfer.files);
  }
});

/* ══════════════════════════════════════════════════════════
   MERGE BUTTON
══════════════════════════════════════════════════════════ */
mergeBtn && mergeBtn.addEventListener('click', doMerge);
downloadBtn && downloadBtn.addEventListener('click', triggerDownload);
mergeAgainBtn && mergeAgainBtn.addEventListener('click', () => {
  files = [];
  mergeResult = null;
  if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; }
  showUploadSection();
});

/* ══════════════════════════════════════════════════════════
   OPTIONS PANEL
══════════════════════════════════════════════════════════ */
optionsToggle && optionsToggle.addEventListener('click', () => {
  const expanded = optionsToggle.getAttribute('aria-expanded') === 'true';
  optionsToggle.setAttribute('aria-expanded', !expanded);
  if (expanded) {
    optionsBody.setAttribute('hidden', '');
  } else {
    optionsBody.removeAttribute('hidden');
    if (typeof gsap !== 'undefined') {
      gsap.from(optionsBody, { duration: 0.3, y: -10, opacity: 0, ease: 'power2.out' });
    }
  }
});

// Normalize page size toggle
optNormalize && optNormalize.addEventListener('change', () => {
  optTargetSize.disabled = !optNormalize.checked;
});

/* ══════════════════════════════════════════════════════════
   FAQ ACCORDION
══════════════════════════════════════════════════════════ */
document.querySelectorAll('.faq-q').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    // Close all
    document.querySelectorAll('.faq-item.open').forEach(i => {
      i.classList.remove('open');
      i.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

/* ══════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg, type = 'info') {
  if (!toast) return;
  toast.className = `toast ${type} show`;
  const icons = { success: '✓', error: '✕', warn: '⚠', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || '•'}</span> ${msg}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3800);
}

/* ══════════════════════════════════════════════════════════
   GSAP ENTRY ANIMATIONS
   NOTE: Never use opacity:0 on above-fold or visible elements.
   Use y-only transforms so content is always readable.
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof gsap === 'undefined') return;

  // Hero — y-only (NO opacity) so content is always visible
  gsap.from('.hero-badge',             { duration: 0.55, y: -18, delay: 0.05, ease: 'power2.out' });
  gsap.from('.hero-title .title-line1',{ duration: 0.65, y: 28,  delay: 0.15, ease: 'power3.out' });
  gsap.from('.hero-title .title-line2',{ duration: 0.65, y: 28,  delay: 0.28, ease: 'power3.out' });
  gsap.from('.hero-subtitle',          { duration: 0.55, y: 18,  delay: 0.38, ease: 'power2.out' });
  gsap.from('.stat-pill',              { duration: 0.45, y: 14,  stagger: 0.07, delay: 0.46, ease: 'power2.out' });
  gsap.from('.upload-zone',            { duration: 0.6,  y: 24,  delay: 0.55, ease: 'power3.out' });

  // Scroll-triggered sections — y-only, no opacity
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        gsap.to(entry.target, { duration: 0.55, y: 0, ease: 'power2.out', clearProps: 'transform' });
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.step-card, .feature-card, .faq-item, .related-card').forEach(el => {
    gsap.set(el, { y: 26 });
    observer.observe(el);
  });
});

/* ══════════════════════════════════════════════════════════
   ANIMATED STAT COUNTER
══════════════════════════════════════════════════════════ */
const _counterPrev = {};
function animateCounter(el, toVal, suffix = '') {
  if (!el) return;
  const key = el.id || el.className;
  const from = _counterPrev[key] ?? 0;
  if (from === toVal) return;
  _counterPrev[key] = toVal;

  const duration = 500;
  const start = performance.now();
  const update = (now) => {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
    const current = Math.round(from + (toVal - from) * eased);
    el.textContent = current + suffix;
    el.classList.add('counting');
    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      el.classList.remove('counting');
    }
  };
  requestAnimationFrame(update);
}

/* ══════════════════════════════════════════════════════════
   PER-FILE ASYNC VALIDATION
══════════════════════════════════════════════════════════ */
async function validateFileAsync(entry) {
  const statusEl = document.getElementById(`vstatus_${entry.id}`);
  if (!statusEl) return;

  // Show loading spinner
  statusEl.className = 'file-status loading';
  statusEl.title = 'Validating…';

  try {
    const fd = new FormData();
    fd.append('file', entry.file, entry.file.name);
    if (entry.password) fd.append('password', entry.password);

    const resp = await fetch('/api/merge-pdf/validate', { method: 'POST', body: fd });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    if (!data.success) throw new Error(data.error || 'Validation failed');

    if (data.encrypted && !entry.password) {
      statusEl.className = 'file-status encrypted';
      statusEl.title = 'Password protected — expand to enter password';
      // Show pw field automatically
      const card = document.querySelector(`[data-id="${entry.id}"]`);
      if (card) {
        card.classList.add('expanded');
        const pwField = card.querySelector('.pw-field');
        if (pwField) pwField.style.display = '';
      }
      return;
    }

    if (!data.valid) {
      statusEl.className = 'file-status error';
      statusEl.title = data.error || 'Cannot read this PDF';
      return;
    }

    // Update entry info with server-side details
    entry.info = entry.info || {};
    if (data.pages > 0) {
      entry.info.pageCount = data.pages;
      // Update page count badge in card
      const card = document.querySelector(`[data-id="${entry.id}"]`);
      if (card) {
        const pagesEl = card.querySelector('.pages-pill');
        if (pagesEl) {
          pagesEl.innerHTML = `<i class="fas fa-book-open"></i> ${data.pages} pages`;
        } else {
          // Add pages pill to meta
          const metaEl = card.querySelector('.file-meta');
          if (metaEl) {
            const pill = document.createElement('span');
            pill.className = 'file-meta-pill pages-pill';
            pill.innerHTML = `<i class="fas fa-book-open"></i> ${data.pages} pg`;
            metaEl.appendChild(pill);
          }
        }
      }
    }
    entry.info.title   = data.title   || '';
    entry.info.author  = data.author  || '';
    entry.info.version = data.version || '';
    entry.info.hasForms = data.has_forms || false;
    entry.info.warnings = data.warnings || [];

    // Show doc meta (title/author) in card if available
    if (data.title || data.author) {
      const card = document.querySelector(`[data-id="${entry.id}"]`);
      if (card) {
        let metaDoc = card.querySelector('.file-doc-meta');
        if (!metaDoc) {
          metaDoc = document.createElement('div');
          metaDoc.className = 'file-doc-meta';
          const infoEl = card.querySelector('.file-info');
          if (infoEl) infoEl.appendChild(metaDoc);
        }
        const parts = [data.title, data.author].filter(Boolean);
        metaDoc.textContent = parts.join(' · ').slice(0, 50);
        metaDoc.title = parts.join(' · ');
      }
    }

    // Show warnings
    if (data.warnings && data.warnings.length > 0) {
      statusEl.className = 'file-status warning';
      statusEl.title = data.warnings[0];
      // Show warning badge in card
      const card = document.querySelector(`[data-id="${entry.id}"]`);
      if (card) {
        let badge = card.querySelector('.file-warning-badge');
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'file-warning-badge';
          const metaEl = card.querySelector('.file-meta');
          if (metaEl) metaEl.insertAdjacentElement('afterend', badge);
        }
        badge.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${data.warnings[0].slice(0, 50)}`;
        badge.title = data.warnings.join('\n');
      }
    } else {
      statusEl.className = 'file-status valid';
      statusEl.title = `Valid PDF · ${data.pages} pages · PDF ${data.version}`;
    }

    // Auto-populate output title/author from FIRST file's metadata
    if (files[0]?.id === entry.id) {
      const titleEl = $('optTitle');
      const authorEl = $('optAuthor');
      if (titleEl && !titleEl.value && data.title) {
        titleEl.value = data.title;
        titleEl.dispatchEvent(new Event('input'));
      }
      if (authorEl && !authorEl.value && data.author) {
        authorEl.value = data.author;
        authorEl.dispatchEvent(new Event('input'));
      }
    }

    updateLiveStats();

  } catch (err) {
    statusEl.className = 'file-status error';
    statusEl.title = `Validation error: ${err.message}`;
    console.warn('Validate failed:', err);
  }
}

/* ══════════════════════════════════════════════════════════
   RECENT MERGES (localStorage)
══════════════════════════════════════════════════════════ */
const RECENT_KEY = 'ishutools_recent_merges';
const MAX_RECENT = 5;

function saveRecentMerge(result) {
  try {
    const list = loadRecentMerges();
    list.unshift({
      filename:    result.filename || 'merged.pdf',
      pages:       result.totalPages || 0,
      size:        result.outputSize || 0,
      sourceCount: result.sourceCount || files.length,
      method:      result.method || '',
      date:        new Date().toISOString(),
    });
    if (list.length > MAX_RECENT) list.length = MAX_RECENT;
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch (_) { /* localStorage blocked */ }
}

function loadRecentMerges() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); }
  catch (_) { return []; }
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function renderRecentMerges() {
  const container = $('recentMerges');
  if (!container) return;
  const list = loadRecentMerges();
  if (list.length === 0) { container.style.display = 'none'; return; }
  container.style.display = '';
  container.innerHTML = `
    <h4 class="recent-title"><i class="fas fa-history"></i> Recent Merges</h4>
    <div class="recent-list">
      ${list.map(m => `
        <div class="recent-item">
          <i class="fas fa-file-pdf"></i>
          <div class="recent-info">
            <div class="recent-filename" title="${m.filename}">${m.filename.length > 38 ? m.filename.slice(0,35)+'…' : m.filename}</div>
            <div class="recent-meta">${m.sourceCount} files · ${m.pages} pages · ${formatBytes(m.size || 0)}</div>
          </div>
          <div class="recent-date">${timeAgo(m.date)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS MODAL
══════════════════════════════════════════════════════════ */
function showShortcutsModal() {
  const modal = $('shortcutsModal');
  if (!modal) return;
  modal.removeAttribute('hidden');
  if (typeof gsap !== 'undefined') {
    gsap.from(modal.querySelector('.shortcuts-card'), {
      duration: 0.3, y: -18, ease: 'power2.out',
    });
  }
  const closeBtn = $('shortcutsClose');
  if (closeBtn) closeBtn.focus();
}

function hideShortcutsModal() {
  const modal = $('shortcutsModal');
  if (modal) modal.setAttribute('hidden', '');
}

$('shortcutsClose') && $('shortcutsClose').addEventListener('click', hideShortcutsModal);
$('shortcutsModal') && $('shortcutsModal').addEventListener('click', e => {
  if (e.target === $('shortcutsModal')) hideShortcutsModal();
});
$('shortcutsHintBtn') && $('shortcutsHintBtn').addEventListener('click', showShortcutsModal);

/* ══════════════════════════════════════════════════════════
   COPY RESULT FILENAME
══════════════════════════════════════════════════════════ */
function copyResultFilename() {
  if (!mergeResult) return;
  const name = mergeResult.filename || 'merged.pdf';
  navigator.clipboard.writeText(name).then(() => {
    showToast(`"${name}" copied to clipboard!`, 'success');
    const btn = $('copyNameBtn');
    if (btn) {
      btn.classList.add('copied');
      btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<i class="fas fa-copy"></i> Copy Name';
      }, 2000);
    }
  }).catch(() => {
    showToast(name, 'info');
  });
}

$('copyNameBtn') && $('copyNameBtn').addEventListener('click', copyResultFilename);

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  const inInput = e.target.matches('input, textarea, [contenteditable="true"]');

  // ? key — show shortcuts modal
  if (e.key === '?' && !inInput) {
    showShortcutsModal();
    return;
  }
  // Escape — close modal or do nothing
  if (e.key === 'Escape') {
    hideShortcutsModal();
    return;
  }
  // Ctrl+O or Cmd+O — open files
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
    e.preventDefault();
    if (filesSection && !filesSection.hidden) addMoreInput.click();
    else fileInput.click();
    return;
  }
  // Ctrl+M or Cmd+M — trigger merge
  if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
    e.preventDefault();
    if (files.length >= 2) doMerge();
    else showToast('Add at least 2 PDF files to merge', 'warn');
    return;
  }
  // Delete — remove last focused file (if no input focused)
  if (e.key === 'Delete' && !inInput && files.length > 0 && document.activeElement.closest('.file-card')) {
    const card = document.activeElement.closest('.file-card');
    const id = card?.getAttribute('data-id');
    if (id) removeFile(id);
  }

  // Alt+Up / Alt+Down — reorder focused file card
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !inInput) {
    const focusedCard = document.activeElement.closest('.file-card');
    if (!focusedCard) return;
    e.preventDefault();
    const id  = focusedCard.getAttribute('data-id');
    const idx = files.findIndex(f => f.id === id);
    if (idx === -1) return;
    const newIdx = e.key === 'ArrowUp' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= files.length) return;
    [files[idx], files[newIdx]] = [files[newIdx], files[idx]];
    originalOrder = files.map(f => f.id);
    renderFileList();
    updateCounts();
    setTimeout(() => {
      const moved = document.querySelector(`[data-id="${id}"]`);
      if (moved) { moved.focus(); moved.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    }, 50);
    showToast(e.key === 'ArrowUp' ? '↑ Moved up' : '↓ Moved down', 'info');
  }
});

/* ══════════════════════════════════════════════════════════
   SORT BUTTONS WIRING
══════════════════════════════════════════════════════════ */
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => sortFiles(btn.dataset.sort));
});

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
// Preload PDF.js in background
loadPDFJS();

// Quick option chips sync
setupQuickOptSync();

// Initial state
updateCounts();

/* ══════════════════════════════════════════════════════════
   WEB AUDIO SOUND EFFECTS  (no CDN — pure Web Audio API)
══════════════════════════════════════════════════════════ */
let _audioCtx = null;
function _getAudioCtx() {
  try {
    if (!_audioCtx || _audioCtx.state === 'closed') {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _audioCtx;
  } catch (_) { return null; }
}

function playSuccessChime() {
  const ctx = _getAudioCtx();
  if (!ctx) return;
  const notes = [
    [523.25, 0,    0.55, 0.20],  // C5
    [659.25, 0.11, 0.50, 0.18],  // E5
    [783.99, 0.22, 0.45, 0.16],  // G5
    [1046.5, 0.31, 0.60, 0.22],  // C6  ← satisfying high note
  ];
  const now = ctx.currentTime;
  notes.forEach(([freq, dt, dur, vol]) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + dt);
    gain.gain.setValueAtTime(0, now + dt);
    gain.gain.linearRampToValueAtTime(vol, now + dt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dt + dur);
    osc.start(now + dt);
    osc.stop(now + dt + dur + 0.05);
  });
}

function playDownloadSound() {
  const ctx = _getAudioCtx();
  if (!ctx) return;
  const now  = ctx.currentTime;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
  osc.type = 'sawtooth';
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(1800, now);
  filt.frequency.exponentialRampToValueAtTime(180, now + 0.3);
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(90, now + 0.35);
  gain.gain.setValueAtTime(0.10, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
  osc.start(now); osc.stop(now + 0.45);
}

/* ══════════════════════════════════════════════════════════
   MERGE PRESETS
══════════════════════════════════════════════════════════ */
const MERGE_PRESETS = {
  quick: {
    label: 'Quick Merge',
    toc: false, sep: false, bookmarks: true, dupes: false, compress: false, linear: false, method: 'auto',
  },
  report: {
    label: 'Professional Report',
    toc: true, sep: true, bookmarks: true, dupes: true, compress: false, linear: false, method: 'auto',
  },
  compact: {
    label: 'Compact Output',
    toc: false, sep: false, bookmarks: false, dupes: true, compress: true, linear: true, method: 'gs',
  },
  archive: {
    label: 'Full Archive',
    toc: true, sep: true, bookmarks: true, dupes: true, compress: true, linear: false, method: 'fitz',
  },
};

function applyPreset(key) {
  const p = MERGE_PRESETS[key];
  if (!p) return;

  // Helper: set checkbox + fire change for sync
  const set = (id, val) => {
    const el = $(id);
    if (!el) return;
    el.checked = val;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // Advanced options
  set('optToc',        p.toc);
  set('optSeparators', p.sep);
  set('optBookmarks',  p.bookmarks);
  set('optSkipDupes',  p.dupes);
  set('optCompress',   p.compress);

  // Quick chips
  set('qOptToc',     p.toc);
  set('qOptSep',     p.sep);
  set('qOptBmarks',  p.bookmarks);
  set('qOptCompress',p.compress);
  set('qOptLinear',  p.linear);

  // Sync chip classes manually (in case change events don't bubble fast enough)
  ['qOptToc','qOptSep','qOptBmarks','qOptCompress','qOptLinear'].forEach(id => {
    const el = $(id);
    el?.closest('label')?.classList.toggle('qopt-checked', el.checked);
  });

  // Merge engine
  const mEl = $('optMethod');
  if (mEl) mEl.value = p.method;

  // Highlight active preset button
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === key);
  });

  showToast(`"${p.label}" preset applied`, 'success');
}

// Wire preset buttons
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
});

/* ══════════════════════════════════════════════════════════
   LARGE PAGE COUNT WARNING
══════════════════════════════════════════════════════════ */
function checkLargePageWarning() {
  const banner = $('largePageBanner');
  if (!banner) return;
  const known = files.filter(f => f.info && typeof f.info.pageCount === 'number');
  const total = known.reduce((s, f) => s + f.info.pageCount, 0);
  if (total > 500 && files.length >= 2) {
    banner.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${total} total pages — merge may take 30–90 seconds`;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

/* ══════════════════════════════════════════════════════════
   FULL-PAGE DRAG-OVER HIGHLIGHT
══════════════════════════════════════════════════════════ */
let _dragOverTimer = null;
document.addEventListener('dragenter', e => {
  if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
    document.body.classList.add('global-dragover');
    clearTimeout(_dragOverTimer);
  }
});
document.addEventListener('dragleave', e => {
  if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
    _dragOverTimer = setTimeout(() => document.body.classList.remove('global-dragover'), 80);
  }
});
['drop', 'dragend'].forEach(ev => {
  document.addEventListener(ev, () => {
    clearTimeout(_dragOverTimer);
    document.body.classList.remove('global-dragover');
  });
});

/* ══════════════════════════════════════════════════════════
   MERGE BUTTON RIPPLE EFFECT
══════════════════════════════════════════════════════════ */
const _mergeBtn = $('mergeBtn');
if (_mergeBtn) {
  _mergeBtn.addEventListener('mousedown', e => {
    const rect = _mergeBtn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    ripple.style.left = (e.clientX - rect.left) + 'px';
    ripple.style.top  = (e.clientY - rect.top)  + 'px';
    _mergeBtn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  });
}
