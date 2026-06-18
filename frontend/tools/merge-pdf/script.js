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

let files = [];           // Array of { id, file, pageRange, password, info }
let sortable = null;
let pdfjsLib = null;
let mergeResult = null;
let downloadUrl = null;

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

// Options
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
  showFilesSection();
  renderFileList();
  updateCounts();

  // Load thumbnails + info in background
  const lib = await loadPDFJS();
  for (const entry of newEntries) {
    loadFileInfo(entry, lib);
  }
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
  card.className = 'file-card entering';
  card.setAttribute('data-id', entry.id);
  card.setAttribute('role', 'listitem');

  // Remove entering class after animation
  setTimeout(() => card.classList.remove('entering'), 350);

  card.innerHTML = `
    <div class="file-drag-handle" title="Drag to reorder" aria-label="Drag handle">
      <i class="fas fa-grip-dots-vertical"></i>
    </div>
    <div class="file-thumb">
      <div class="thumb-loading"></div>
    </div>
    <div class="file-info">
      <div class="file-name" title="${entry.file.name}">${truncateName(entry.file.name)}</div>
      <div class="file-meta">
        <span class="file-meta-pill"><i class="fas fa-database"></i> ${formatBytes(entry.file.size)}</span>
      </div>
      <div class="file-expanded">
        <div class="file-field-row">
          <div class="file-field">
            <label><i class="fas fa-list-ol"></i> Page Range (optional)</label>
            <input type="text" class="page-range-input" value="${entry.pageRange}"
              placeholder="e.g. 1-3, 5, 8-10 (blank = all)"
              aria-label="Page range for ${entry.file.name}" />
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
      <span class="file-num">#${idx + 1}</span>
      <button class="btn-icon primary expand-btn" title="Expand options" aria-label="Expand file options">
        <i class="fas fa-sliders"></i>
      </button>
      <button class="btn-icon danger remove-btn" title="Remove file" aria-label="Remove ${entry.file.name}">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;

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
      if (files.length === 0) showUploadSection();
    }, 250);
  } else {
    files.splice(idx, 1);
    renderFileList();
    updateCounts();
    if (files.length === 0) showUploadSection();
  }
}

function updateFileNumbers() {
  fileList.querySelectorAll('.file-num').forEach((el, i) => {
    el.textContent = `#${i + 1}`;
  });
}

function updateCounts() {
  const n = files.length;
  if (fileCountBadge) fileCountBadge.textContent = `${n} ${n === 1 ? 'file' : 'files'}`;
  if (mergeBtnCount) mergeBtnCount.textContent = n > 0 ? `${n} files` : '';
  if (mergeBtn) mergeBtn.disabled = n < 2;
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
  setProgressStep(3);
  $('pstep3') && $('pstep3').classList.replace('active', 'done');
}

/* ══════════════════════════════════════════════════════════
   MERGE ACTION
══════════════════════════════════════════════════════════ */
async function doMerge() {
  if (files.length < 2) {
    showToast('Please add at least 2 PDF files', 'warn');
    return;
  }

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
  if (optTitle.value.trim())  formData.append('output_title', optTitle.value.trim());
  if (optAuthor.value.trim()) formData.append('output_author', optAuthor.value.trim());

  // Per-file page ranges (JSON array in same order as files)
  const pageRanges = files.map(e => e.pageRange || 'all');
  formData.append('page_ranges', JSON.stringify(pageRanges));

  // Per-file passwords
  const passwords = files.map(e => e.password || null);
  formData.append('passwords', JSON.stringify(passwords));

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

    // Determine download filename
    const stems = files.slice(0, 3).map(e => e.file.name.replace(/\.pdf$/i, '')).join('_');
    mergeResult = {
      filename: `${stems}_merged.pdf`,
      totalPages,
      sourceCount,
      outputSize,
      method,
      tocAdded,
    };

    // Fill result stats
    $('rstatFiles').textContent = sourceCount;
    $('rstatPages').textContent = totalPages;
    $('rstatSize').textContent  = outputSize > 0 ? formatBytes(outputSize) : '—';
    $('rstatMethod').textContent = method.replace('pypdf+pikepdf', 'pypdf').replace('ghostscript', 'Ghostscript').replace('fitz', 'PyMuPDF');

    const extras = [];
    if (tocAdded) extras.push('with TOC');
    if (optSeparators.checked) extras.push('with separators');
    $('resultSubtitle').textContent = `${sourceCount} files → ${totalPages} pages merged ${extras.length ? '(' + extras.join(', ') + ')' : 'successfully'}`;

    setTimeout(() => showResult(), 300);

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
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  // Ctrl+O or Cmd+O — open files
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
    e.preventDefault();
    if (filesSection && !filesSection.hidden) addMoreInput.click();
    else fileInput.click();
  }
  // Escape — cancel or go back
  if (e.key === 'Escape' && resultSection && !resultSection.hidden) {
    // do nothing (let user explicitly click merge again)
  }
});

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
// Preload PDF.js in background
loadPDFJS();

// Initial state
updateCounts();
