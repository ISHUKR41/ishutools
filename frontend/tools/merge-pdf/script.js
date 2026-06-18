/**
 * IshuTools.fun — Merge PDF — Professional Script v4.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 */
'use strict';

/* ══════════════════════════════════════════════════════════
   DOM HELPERS
══════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);
const $$ = sel => [...document.querySelectorAll(sel)];
const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

/* ══════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════ */
const MAX_FILES     = 50;
const MAX_SIZE_MB   = 1024;
const RECENT_KEY    = 'ishu-recent-merges-v2';
const MAX_RECENT    = 6;
const IMG_EXTS      = new Set(['jpg','jpeg','png','webp','gif','bmp','tiff','tif']);
const PDF_EXTS      = new Set(['pdf']);

const PRESET_HINTS = {
  quick:   '⚡ Fastest — bookmarks preserved, no extra pages',
  report:  '📋 Professional — TOC + separator divider pages included',
  compact: '🗜️ Smallest file — compression + duplicate page removal',
  archive: '🗃️ Maximum quality — all features enabled',
};

/* ══════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════ */
let files        = [];        // [{id, file, type, pageRange, password, displayName, info:{pageCount,title,author}}]
let originalOrder = [];
let currentSort  = 'order';
let downloadUrl  = null;
let mergeResult  = null;
let mergeStart   = 0;
let _sortable    = null;
let _undo        = [];        // {entry, idx}
let _undoTimer   = null;
let _pval        = 0;
let _pint        = null;
let _idSeq       = 0;
let _previewPdfDoc = null;

/* ══════════════════════════════════════════════════════════
   ELEMENTS
══════════════════════════════════════════════════════════ */
const dropZone       = $('dropZone');
const fileInput      = $('fileInput');
const addMoreInput   = $('addMoreInput');
const mergeBtn       = $('mergeBtn');
const downloadBtn    = $('downloadBtn');
const mergeAgainBtn  = $('mergeAgainBtn');
const uploadSection  = $('uploadSection');
const filesSection   = $('filesSection');
const progressSection= $('progressSection');
const resultSection  = $('resultSection');
const fileList       = $('fileList');
const globalDragInd  = $('globalDragIndicator');
const toastEl        = $('toast');

/* ══════════════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════════════ */
function uid()   { return `f${Date.now()}_${++_idSeq}`; }
function ext(f)  { return (f.name.split('.').pop() || '').toLowerCase(); }
function isImg(f){ return IMG_EXTS.has(ext(f)); }
function isPdf(f){ return ext(f) === 'pdf' || f.type === 'application/pdf'; }

function fmtB(b) {
  if (b == null || b < 0) return '—';
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
  if (b >= 1048576)    return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024)       return (b / 1024).toFixed(0) + ' KB';
  return b + ' B';
}
function fmtT(sec) {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec/60)}m ${sec%60}s`;
}
function trunc(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function timeAgo(d) {
  const m = Math.floor((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function animateCount(el, target) {
  if (!el) return;
  const start = parseInt(el.textContent) || 0;
  const diff = target - start;
  if (diff === 0) { el.textContent = target; return; }
  let t = 0; const dur = 28;
  el.classList.add('counting');
  const iv = setInterval(() => {
    t++;
    el.textContent = Math.round(start + diff * (t / dur));
    if (t >= dur) { clearInterval(iv); el.textContent = target; el.classList.remove('counting'); }
  }, 16);
}

/* ══════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════ */
let _toastTimer = null;
function showToast(msg, type = 'info', dur = 3200) {
  if (!toastEl) return;
  clearTimeout(_toastTimer);
  toastEl.className = `toast ${type}`;
  const icon = { success: 'fa-circle-check', error: 'fa-circle-xmark', warn: 'fa-triangle-exclamation', info: 'fa-circle-info' }[type] || 'fa-circle-info';
  toastEl.innerHTML = `<i class="fas ${icon}"></i> ${msg}`;
  toastEl.classList.add('show');
  window.SOUNDS?.playNotifySound(type);
  _toastTimer = setTimeout(() => toastEl.classList.remove('show'), dur);
}

/* ══════════════════════════════════════════════════════════
   SECTION VIEWS
══════════════════════════════════════════════════════════ */
function hideAll() {
  uploadSection && (uploadSection.hidden = true);
  filesSection  && (filesSection.hidden  = true);
  progressSection && (progressSection.hidden = true);
  resultSection && (resultSection.hidden  = true);
}
function goUpload()   { hideAll(); uploadSection.hidden = false; files = []; originalOrder = []; renderFileList(); updateCounts(); if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; } mergeResult = null; }
function goFiles()    { hideAll(); filesSection.hidden = false; }
function goProgress() { hideAll(); progressSection.hidden = false; }
function goResult()   { hideAll(); resultSection.hidden = false; renderRecent(); }

/* ══════════════════════════════════════════════════════════
   THEME + SOUND CONTROLS
══════════════════════════════════════════════════════════ */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $('themeIcon').className = t === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
  try { localStorage.setItem('ishu-theme', t); } catch (_) {}
}
(function initTheme() {
  let saved; try { saved = localStorage.getItem('ishu-theme'); } catch (_) {}
  applyTheme(saved || 'dark');
})();
on($('themeToggle'), 'click', () => {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
  window.SOUNDS?.playToggleOnSound();
});

function updateSoundBtn() {
  const enabled = window.SOUNDS?.isEnabled() !== false;
  const btn = $('soundToggle'), icon = $('soundIcon');
  if (!btn || !icon) return;
  icon.className = enabled ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
  btn.classList.toggle('sound-off', !enabled);
  btn.title = enabled ? 'Sounds on (click to mute)' : 'Sounds off (click to enable)';
}
on($('soundToggle'), 'click', () => {
  const now = window.SOUNDS?.toggle();
  updateSoundBtn();
  showToast(now ? '🔊 Sounds enabled' : '🔇 Sounds muted', 'info', 1800);
  if (now) window.SOUNDS?.playToggleOnSound();
});
updateSoundBtn();

/* ══════════════════════════════════════════════════════════
   NAVBAR SCROLL
══════════════════════════════════════════════════════════ */
on(window, 'scroll', () => {
  $('navbar')?.classList.toggle('scrolled', window.scrollY > 18);
}, { passive: true });

/* ══════════════════════════════════════════════════════════
   CANVAS BACKGROUND
══════════════════════════════════════════════════════════ */
(function initBgCanvas() {
  const c = $('bgCanvas'); if (!c) return;
  const ctx = c.getContext('2d');
  let w, h, particles = [];

  function resize() {
    w = c.width = window.innerWidth;
    h = c.height = window.innerHeight;
    particles = Array.from({ length: Math.min(60, Math.floor(w / 22)) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      r: Math.random() * 1.6 + 0.3,
      vx: (Math.random() - 0.5) * 0.38,
      vy: (Math.random() - 0.5) * 0.38,
      a: Math.random() * 0.6 + 0.1,
      c: Math.random() < 0.5 ? '#6366f1' : '#8b5cf6',
    }));
  }
  resize();
  on(window, 'resize', resize, { passive: true });

  function draw() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < -2) p.x = w + 2; else if (p.x > w + 2) p.x = -2;
      if (p.y < -2) p.y = h + 2; else if (p.y > h + 2) p.y = -2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.c;
      ctx.globalAlpha = p.a;
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  draw();
})();

/* ══════════════════════════════════════════════════════════
   FILE MANAGEMENT
══════════════════════════════════════════════════════════ */
function addFiles(fileList) {
  let added = 0, skipped = 0, tooLarge = 0;
  Array.from(fileList).forEach(f => {
    if (!isPdf(f) && !isImg(f)) { skipped++; return; }
    if (f.size > MAX_SIZE_MB * 1048576) { tooLarge++; return; }
    if (files.length >= MAX_FILES) { skipped++; return; }
    const duplicate = files.find(e => e.file.name === f.name && e.file.size === f.size);
    if (duplicate) {
      showToast(`"${trunc(f.name, 30)}" already in list`, 'warn', 2000);
      return;
    }
    const id   = uid();
    const type = isImg(f) ? 'img' : 'pdf';
    const entry = { id, file: f, type, pageRange: '', password: '', displayName: '', info: null };
    files.push(entry);
    originalOrder.push(id);
    added++;
    window.SOUNDS?.playFileAddSound();
    if (type === 'pdf') setTimeout(() => validateFile(entry), 200 + added * 80);
  });

  if (added > 0) {
    if (files.length >= 2) goFiles();
    renderFileList();
    updateCounts();
    if (tooLarge > 0) showToast(`${tooLarge} file(s) exceed 1 GB limit`, 'error');
    else if (skipped > 0) showToast(`${skipped} unsupported file(s) skipped`, 'warn');
    else if (added > 0) showToast(`Added ${added} file${added > 1 ? 's' : ''}`, 'success', 2000);
  } else {
    if (tooLarge > 0) showToast(`File exceeds 1 GB limit`, 'error');
    else if (skipped > 0) showToast('Unsupported file type — use PDF or image files', 'warn');
  }
  checkDuplicates();
}

/* ══════════════════════════════════════════════════════════
   RENDER FILE LIST
══════════════════════════════════════════════════════════ */
function renderFileList() {
  if (!fileList) return;
  fileList.innerHTML = '';
  if (!files.length) return;

  files.forEach((entry, idx) => {
    const card = buildCard(entry, idx);
    fileList.appendChild(card);
    requestAnimationFrame(() => card.classList.add('entering'));
  });

  // Init Sortable after render
  if (_sortable) { _sortable.destroy(); _sortable = null; }
  if (typeof Sortable !== 'undefined') {
    _sortable = Sortable.create(fileList, {
      handle: '.fc-handle',
      animation: 200,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onStart: () => window.SOUNDS?.playDragStartSound(),
      onEnd: evt => {
        const [moved] = files.splice(evt.oldIndex, 1);
        files.splice(evt.newIndex, 0, moved);
        originalOrder = files.map(f => f.id);
        updateCounts();
        window.SOUNDS?.playDragDropSound();
      },
    });
  }

  initTouchSwipes();
}

/* ══════════════════════════════════════════════════════════
   BUILD CARD HTML
══════════════════════════════════════════════════════════ */
function buildCard(entry, idx) {
  const { id, file, type, pageRange, password, displayName, info } = entry;
  const name  = displayName || file.name;
  const size  = fmtB(file.size);
  const pages = info?.pageCount ? `${info.pageCount} pg` : null;
  const isEncrypted = info?.encrypted;
  const isIMG = type === 'img';
  const extUpper = ext(file).toUpperCase();

  const div = document.createElement('div');
  div.className = 'file-card';
  div.dataset.id = id;
  div.setAttribute('role', 'listitem');
  div.setAttribute('tabindex', '0');
  div.setAttribute('aria-label', `File: ${name}, Size: ${size}${pages ? ', Pages: ' + info.pageCount : ''}`);

  div.innerHTML = `
    <span class="fc-handle" aria-hidden="true" title="Drag to reorder">
      <i class="fas fa-grip-vertical"></i>
    </span>

    <div class="fc-thumb" tabindex="0" role="button" aria-label="Preview ${name}" data-id="${id}">
      <div class="fc-thumb-placeholder ${isIMG ? 'img' : 'pdf'}">
        <i class="fas ${isIMG ? 'fa-image' : 'fa-file-pdf'}"></i>
        <span>${extUpper}</span>
      </div>
      <div class="fc-thumb-eye" aria-hidden="true"><i class="fas fa-eye"></i></div>
    </div>

    <div class="fc-info">
      <div class="fc-name" title="${name}" data-id="${id}">${trunc(name, 52)}</div>
      <div class="fc-meta">
        <span class="fc-pill"><i class="fas fa-weight-hanging"></i>${size}</span>
        ${pages ? `<span class="fc-pill valid"><i class="fas fa-book-open"></i>${pages}</span>` : ''}
        ${isEncrypted && !password ? `<span class="fc-pill enc"><i class="fas fa-lock"></i>Encrypted</span>` : ''}
        ${isIMG ? `<span class="fc-pill" style="color:var(--warn)"><i class="fas fa-image"></i>Image→PDF</span>` : ''}
        ${info?.title ? `<span class="fc-pill"><i class="fas fa-tag"></i>${trunc(info.title, 22)}</span>` : ''}
      </div>
      ${info?.author ? `<div class="fc-doc-meta"><i class="fas fa-user" style="font-size:9px;margin-right:3px;color:var(--text3)"></i>${trunc(info.author, 42)}</div>` : ''}

      <div class="fc-expand" id="fcExpand_${id}">
        ${isIMG ? `
          <div class="fc-img-note">
            <i class="fas fa-info-circle"></i>
            This image will be automatically converted to a PDF page at full quality.
          </div>
        ` : `
          <div class="fc-field-row">
            <div class="fc-field">
              <label><i class="fas fa-list-ol"></i> Page Range</label>
              <input type="text" class="pr-input" data-id="${id}" placeholder="e.g. 1-3, 5, odd, last 2" value="${pageRange || ''}" aria-label="Page range for ${name}" />
              <div class="pr-quick">
                <button class="pr-q-btn" data-range="" data-id="${id}">All</button>
                <button class="pr-q-btn" data-range="odd" data-id="${id}">Odd</button>
                <button class="pr-q-btn" data-range="even" data-id="${id}">Even</button>
                <button class="pr-q-btn" data-range="first" data-id="${id}">First</button>
                <button class="pr-q-btn" data-range="last" data-id="${id}">Last</button>
              </div>
            </div>
            ${isEncrypted || password ? `
              <div class="fc-field">
                <label><i class="fas fa-lock"></i> Password</label>
                <input type="password" class="pw-field" data-id="${id}" placeholder="Enter PDF password" value="${password || ''}" aria-label="Password for ${name}" />
              </div>
            ` : ''}
          </div>
          <div class="fc-field">
            <label><i class="fas fa-tag"></i> Custom Display Name</label>
            <input type="text" class="dn-field" data-id="${id}" placeholder="${name}" value="${displayName || ''}" maxlength="80" aria-label="Display name for ${name}" />
          </div>
        `}
      </div>
    </div>

    <div class="fc-actions">
      <span class="fc-num">${idx + 1}</span>
      <div class="fc-btns">
        <button class="fc-btn expand-btn" data-id="${id}" title="Show options" aria-label="Expand options for ${name}" aria-expanded="false">
          <i class="fas fa-ellipsis-vertical"></i>
        </button>
        <button class="fc-btn remove-btn" data-id="${id}" title="Remove this file" aria-label="Remove ${name}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>

    <div class="swipe-hint" aria-hidden="true"><i class="fas fa-trash"></i> Remove</div>
  `;

  // Thumbnail
  renderThumbnail(div.querySelector('.fc-thumb'), entry);

  // Wire events
  const expandBtn = div.querySelector('.expand-btn');
  on(expandBtn, 'click', e => { e.stopPropagation(); toggleExpand(id, div, expandBtn); });

  on(div.querySelector('.remove-btn'), 'click', e => { e.stopPropagation(); removeFile(id); });

  const thumb = div.querySelector('.fc-thumb');
  on(thumb, 'click', () => openPreview(entry));
  on(thumb, 'keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPreview(entry); } });

  // Page range input
  const prInput = div.querySelector('.pr-input');
  if (prInput) {
    on(prInput, 'input', () => { entry.pageRange = prInput.value.trim(); });
    // Quick buttons
    div.querySelectorAll('.pr-q-btn').forEach(btn => {
      on(btn, 'click', () => {
        prInput.value = btn.dataset.range;
        entry.pageRange = btn.dataset.range;
        div.querySelectorAll('.pr-q-btn').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
    // Highlight correct quick btn
    if (pageRange) {
      div.querySelectorAll('.pr-q-btn').forEach(b => b.classList.toggle('active', b.dataset.range === pageRange));
    } else {
      const allBtn = div.querySelector('.pr-q-btn[data-range=""]');
      allBtn && allBtn.classList.add('active');
    }
  }

  // Password input
  const pwInput = div.querySelector('.pw-field');
  if (pwInput) on(pwInput, 'input', () => { entry.password = pwInput.value; });

  // Display name input
  const dnInput = div.querySelector('.dn-field');
  if (dnInput) on(dnInput, 'input', () => { entry.displayName = dnInput.value.trim(); });

  // Double-click file name to rename
  const nameEl = div.querySelector('.fc-name');
  on(nameEl, 'dblclick', () => inlineRename(nameEl, entry));

  // Keyboard on card
  on(div, 'keydown', e => {
    if (e.key === 'Delete') removeFile(id);
    if (e.altKey && e.key === 'ArrowUp')   moveFile(id, -1);
    if (e.altKey && e.key === 'ArrowDown') moveFile(id, 1);
  });

  return div;
}

function toggleExpand(id, card, btn) {
  const isOpen = card.classList.toggle('expanded');
  btn.setAttribute('aria-expanded', String(isOpen));
  btn.querySelector('i').className = isOpen ? 'fas fa-chevron-up' : 'fas fa-ellipsis-vertical';
  if (isOpen) window.SOUNDS?.playExpandSound();
  else window.SOUNDS?.playCollapseSound();
}

function inlineRename(nameEl, entry) {
  const cur = entry.displayName || entry.file.name;
  const input = document.createElement('input');
  input.type = 'text'; input.value = cur; input.maxLength = 80;
  input.style.cssText = 'width:100%;background:var(--surface3);border:1px solid var(--p1);border-radius:5px;padding:2px 6px;font-size:.84rem;font-family:inherit;color:var(--text);outline:none';
  nameEl.innerHTML = ''; nameEl.appendChild(input); input.focus(); input.select();
  const finish = () => {
    const v = input.value.trim();
    entry.displayName = v || entry.file.name;
    nameEl.textContent = trunc(entry.displayName, 52);
    nameEl.title = entry.displayName;
  };
  on(input, 'blur', finish);
  on(input, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } if (e.key === 'Escape') { entry.displayName = cur; nameEl.textContent = trunc(cur, 52); } });
}

/* ══════════════════════════════════════════════════════════
   THUMBNAIL RENDERING
══════════════════════════════════════════════════════════ */
function renderThumbnail(thumbEl, entry) {
  if (!thumbEl) return;
  const { file, type } = entry;

  if (type === 'img') {
    const img = document.createElement('img');
    img.alt = 'Preview';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:4px';
    img.src = URL.createObjectURL(file);
    thumbEl.innerHTML = '';
    thumbEl.appendChild(img);
    thumbEl.insertAdjacentHTML('beforeend', '<div class="fc-thumb-eye" aria-hidden="true"><i class="fas fa-eye"></i></div>');
    return;
  }

  // PDF preview via PDF.js if available
  const pdfjs = window['pdfjs-dist/build/pdf'] || (window.pdfjsLib);
  if (!pdfjs) return; // stay with placeholder

  const spinner = document.createElement('div');
  spinner.className = 'fc-thumb-spinner';
  thumbEl.innerHTML = ''; thumbEl.appendChild(spinner);
  thumbEl.insertAdjacentHTML('beforeend', '<div class="fc-thumb-eye" aria-hidden="true"><i class="fas fa-eye"></i></div>');

  const url = URL.createObjectURL(file);
  pdfjs.getDocument(url).promise
    .then(doc => {
      entry.info = entry.info || {};
      if (!entry.info.pageCount) entry.info.pageCount = doc.numPages;
      return doc.getPage(1);
    })
    .then(page => {
      const viewport = page.getViewport({ scale: 0.35 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      canvas.style.cssText = 'width:100%;height:100%;object-fit:contain;border-radius:4px';
      return page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise.then(() => canvas);
    })
    .then(canvas => {
      spinner.remove();
      thumbEl.insertBefore(canvas, thumbEl.querySelector('.fc-thumb-eye'));
    })
    .catch(() => {
      thumbEl.innerHTML = `<div class="fc-thumb-placeholder pdf"><i class="fas fa-file-pdf"></i><span>PDF</span></div><div class="fc-thumb-eye" aria-hidden="true"><i class="fas fa-eye"></i></div>`;
    })
    .finally(() => URL.revokeObjectURL(url));
}

/* ══════════════════════════════════════════════════════════
   REMOVE / UNDO
══════════════════════════════════════════════════════════ */
function removeFile(id) {
  const idx = files.findIndex(f => f.id === id);
  if (idx === -1) return;
  const [entry] = files.splice(idx, 1);
  originalOrder = originalOrder.filter(i => i !== id);

  const card = document.querySelector(`[data-id="${id}"]`);
  if (card && typeof gsap !== 'undefined') {
    gsap.to(card, { duration: .2, x: 20, opacity: 0, ease: 'power2.in', onComplete: () => { card.remove(); updateCounts(); checkDuplicates(); } });
  } else {
    card?.remove();
    updateCounts();
    checkDuplicates();
  }
  window.SOUNDS?.playFileRemoveSound();

  // Push undo
  _undo.unshift({ entry, idx });
  if (_undo.length > 5) _undo.length = 5;
  showUndoBar(entry.displayName || entry.file.name);

  if (files.length === 0) setTimeout(goUpload, 280);
  else if (files.length === 1) mergeBtn && (mergeBtn.disabled = true);
}

function showUndoBar(name) {
  const bar = $('undoBar'); if (!bar) return;
  clearTimeout(_undoTimer);
  const nameEl = bar.querySelector('.undo-name'); if (nameEl) nameEl.textContent = trunc(name, 32);
  bar.classList.add('show');
  _undoTimer = setTimeout(hideUndoBar, 5000);
}
function hideUndoBar() { $('undoBar')?.classList.remove('show'); }

function undoLastDelete() {
  if (!_undo.length) return;
  const { entry, idx } = _undo.shift();
  files.splice(idx, 0, entry);
  originalOrder.splice(idx, 0, entry.id);
  hideUndoBar();
  goFiles();
  renderFileList();
  updateCounts();
  showToast(`"${trunc(entry.displayName || entry.file.name, 28)}" restored`, 'success', 2200);
  window.SOUNDS?.playFileAddSound();
}

on($('undoBtn'), 'click', undoLastDelete);

/* ══════════════════════════════════════════════════════════
   MOVE FILE (keyboard)
══════════════════════════════════════════════════════════ */
function moveFile(id, dir) {
  const idx = files.findIndex(f => f.id === id);
  if (idx === -1) return;
  const ni = idx + dir;
  if (ni < 0 || ni >= files.length) return;
  [files[idx], files[ni]] = [files[ni], files[idx]];
  originalOrder = files.map(f => f.id);
  renderFileList();
  updateCounts();
  window.SOUNDS?.playSortSound();
  setTimeout(() => {
    const card = document.querySelector(`[data-id="${id}"]`);
    card?.focus();
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 60);
}

/* ══════════════════════════════════════════════════════════
   TOUCH SWIPE (mobile delete)
══════════════════════════════════════════════════════════ */
function initTouchSwipes() {
  $$('.file-card').forEach(card => {
    if (card._swipeInited) return;
    card._swipeInited = true;
    let startX = 0, curX = 0, active = false;

    on(card, 'touchstart', e => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX; curX = startX; active = true;
    }, { passive: true });

    on(card, 'touchmove', e => {
      if (!active) return;
      curX = e.touches[0].clientX;
      const dx = startX - curX;
      if (dx > 0) {
        card.style.transform = `translateX(${-Math.min(dx, 160)}px)`;
        const hint = card.querySelector('.swipe-hint');
        if (hint) hint.style.opacity = Math.min(dx / 80, 1);
      }
    }, { passive: true });

    on(card, 'touchend', () => {
      if (!active) return; active = false;
      const dx = startX - curX;
      if (dx >= 120) {
        removeFile(card.dataset.id);
      } else {
        card.style.transform = '';
        const hint = card.querySelector('.swipe-hint');
        if (hint) hint.style.opacity = '';
      }
    });
  });
}

/* ══════════════════════════════════════════════════════════
   STATS
══════════════════════════════════════════════════════════ */
function updateCounts() {
  const n = files.length;
  const badge = $('fileCountBadge');
  if (badge) badge.textContent = `${n} ${n === 1 ? 'file' : 'files'}`;
  if (mergeBtn) mergeBtn.disabled = n < 2;
  const mbc = $('mergeBtnCount'); if (mbc) mbc.textContent = n > 0 ? `${n}` : '';
  updateLiveStats();
}

function updateLiveStats() {
  const n = files.length;
  const sbFiles = $('sbFiles'); if (sbFiles) animateCount(sbFiles, n);

  const totalB = files.reduce((s, f) => s + f.file.size, 0);
  const sbSize = $('sbSize'); if (sbSize) sbSize.textContent = totalB > 0 ? fmtB(totalB) : '—';

  const known = files.filter(f => f.info?.pageCount);
  const totalP = known.reduce((s, f) => s + (f.info.pageCount || 0), 0);
  const sbP = $('sbPages');
  if (sbP) {
    if (known.length < n && known.length > 0) sbP.textContent = `${totalP}+`;
    else if (known.length > 0) animateCount(sbP, totalP);
    else sbP.textContent = '—';
  }

  const estS = Math.max(1, Math.round(totalB / 1048576 * 0.5 + n * 0.3));
  const sbE = $('sbEst'); if (sbE) sbE.textContent = fmtT(estS);

  checkLargePage(totalP, n);
}

function checkLargePage(totalP, n) {
  const b = $('largePageBanner'); if (!b) return;
  if (totalP > 400) {
    b.hidden = false;
    b.innerHTML = `<i class="fas fa-triangle-exclamation"></i> ${totalP}+ pages detected — consider enabling Compress in Advanced Options.`;
  } else { b.hidden = true; }
}

/* ══════════════════════════════════════════════════════════
   DUPLICATE DETECTION
══════════════════════════════════════════════════════════ */
function checkDuplicates() {
  const dupBanner = $('dupeBanner'); if (dupBanner) dupBanner.hidden = true;
  const seen = new Map();
  files.forEach(f => {
    const k = `${f.file.name}__${f.file.size}`;
    seen.set(k, (seen.get(k) || 0) + 1);
  });
  const hasDupes = [...seen.values()].some(v => v > 1);
  if (hasDupes && dupBanner) {
    dupBanner.hidden = false;
    dupBanner.innerHTML = `<i class="fas fa-triangle-exclamation"></i> Duplicate files detected — enable <strong>Skip Duplicate Pages</strong> in Advanced Options to remove identical pages.`;
  }
}

/* ══════════════════════════════════════════════════════════
   SORT
══════════════════════════════════════════════════════════ */
function sortFiles(by) {
  currentSort = by;
  $$('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === by));
  if (by === 'order') files.sort((a, b) => originalOrder.indexOf(a.id) - originalOrder.indexOf(b.id));
  else if (by === 'name') files.sort((a, b) => a.file.name.localeCompare(b.file.name));
  else if (by === 'size') files.sort((a, b) => b.file.size - a.file.size);
  renderFileList(); updateCounts();
  window.SOUNDS?.playSortSound();
  if (typeof gsap !== 'undefined') gsap.from('#fileList .file-card', { duration: .22, y: 7, stagger: .04, ease: 'power2.out' });
}

/* ══════════════════════════════════════════════════════════
   PRESETS
══════════════════════════════════════════════════════════ */
const PRESETS = {
  quick:   { toc: false, sep: false, compress: false, bmarks: true,  dupes: false },
  report:  { toc: true,  sep: true,  compress: false, bmarks: true,  dupes: false },
  compact: { toc: false, sep: false, compress: true,  bmarks: false, dupes: true  },
  archive: { toc: true,  sep: true,  compress: true,  bmarks: true,  dupes: true  },
};

function applyPreset(key) {
  const p = PRESETS[key]; if (!p) return;
  $$('.preset-btn').forEach(b => b.classList.toggle('active', b.dataset.preset === key));
  const set = (id, val) => { const el = $(id); if (el) { el.checked = val; el.dispatchEvent(new Event('change')); } };
  set('optToc', p.toc); set('optSeparators', p.sep);
  set('optCompress', p.compress); set('optBookmarks', p.bmarks);
  set('optSkipDupes', p.dupes);
  const hint = $('presetHint');
  if (hint) { hint.textContent = PRESET_HINTS[key] || ''; hint.classList.add('visible'); }
  window.SOUNDS?.playPresetSound();
  showToast(`Preset "${key}" applied`, 'success', 2000);
}

$$('.preset-btn').forEach(b => {
  on(b, 'click', () => applyPreset(b.dataset.preset));
  on(b, 'mouseenter', () => {
    const hint = $('presetHint');
    if (hint) { hint.textContent = PRESET_HINTS[b.dataset.preset] || ''; hint.classList.add('visible'); }
  });
  on(b, 'mouseleave', () => {
    const activeKey = $$('.preset-btn.active')[0]?.dataset.preset;
    const hint = $('presetHint');
    if (hint) { hint.textContent = activeKey ? (PRESET_HINTS[activeKey] || '') : ''; }
  });
});

/* ══════════════════════════════════════════════════════════
   ADVANCED OPTIONS
══════════════════════════════════════════════════════════ */
on($('optionsToggle'), 'click', () => {
  const t = $('optionsToggle'), b = $('optionsBody');
  if (!t || !b) return;
  const open = t.getAttribute('aria-expanded') === 'true';
  t.setAttribute('aria-expanded', String(!open));
  if (open) b.hidden = true;
  else {
    b.hidden = false;
    if (typeof gsap !== 'undefined') gsap.from(b, { duration: .25, y: -8, ease: 'power2.out' });
  }
  window.SOUNDS?.playExpandSound();
});

on($('optNormalize'), 'change', () => {
  const f = $('pageSizeField');
  if (f) f.style.display = $('optNormalize').checked ? '' : 'none';
});

/* ══════════════════════════════════════════════════════════
   PROGRESS
══════════════════════════════════════════════════════════ */
const SVG_CIRC = 276;

function startProgress() {
  _pval = 0;
  const bar = $('progressBar'); if (bar) bar.style.width = '0%';
  clearInterval(_pint);
  _pint = setInterval(() => {
    _pval = Math.min(_pval + Math.random() * 2.5 + 0.5, 82);
    const bar = $('progressBar'); if (bar) bar.style.width = _pval + '%';
    updateRing(_pval);
  }, 140);
}
function completeProgress() {
  clearInterval(_pint);
  const bar = $('progressBar'); if (bar) bar.style.width = '100%';
  updateRing(100);
}
function updateRing(pct) {
  const r = $('ringFill'); if (!r) return;
  r.style.strokeDashoffset = String(SVG_CIRC * (1 - pct / 100));
}
function setStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = $(`pstep${i}`); if (!el) continue;
    el.className = 'pstep' + (i < n ? ' done' : i === n ? ' active' : '');
  }
}
function setMsg(t, s) {
  const tEl = $('progressTitle'), sEl = $('progressSub');
  if (tEl) tEl.textContent = t; if (sEl) sEl.textContent = s;
}

/* ══════════════════════════════════════════════════════════
   PER-FILE VALIDATION
══════════════════════════════════════════════════════════ */
async function validateFile(entry) {
  try {
    const fd = new FormData();
    fd.append('file', entry.file, entry.file.name);
    if (entry.password) fd.append('password', entry.password);
    const r = await fetch('/api/merge-pdf/validate', { method: 'POST', body: fd });
    if (!r.ok) return;
    const d = await r.json(); if (!d.success) return;

    entry.info = entry.info || {};
    if (d.encrypted) entry.info.encrypted = true;
    if (d.pages > 0)  entry.info.pageCount = d.pages;
    if (d.title)      entry.info.title = d.title;
    if (d.author)     entry.info.author = d.author;

    // Auto-expand if encrypted and no password
    if (d.encrypted && !entry.password) {
      const card = document.querySelector(`[data-id="${entry.id}"]`);
      const expandBtn = card?.querySelector('.expand-btn');
      if (card && !card.classList.contains('expanded') && expandBtn) toggleExpand(entry.id, card, expandBtn);
    }

    // Auto-fill metadata if first file
    if (files[0]?.id === entry.id) {
      if (d.title && $('optTitle') && !$('optTitle').value) $('optTitle').value = d.title;
      if (d.author && $('optAuthor') && !$('optAuthor').value) $('optAuthor').value = d.author;
    }

    // Re-render this card to show updated info
    const card = document.querySelector(`[data-id="${entry.id}"]`);
    if (card) {
      const idx = files.findIndex(f => f.id === entry.id);
      const newCard = buildCard(entry, idx);
      card.parentNode.replaceChild(newCard, card);
      requestAnimationFrame(() => newCard.classList.add('entering'));
    }
    updateLiveStats();
  } catch (_) {}
}

/* ══════════════════════════════════════════════════════════
   SMART OUTPUT FILENAME
══════════════════════════════════════════════════════════ */
function smartFilename() {
  const override = $('optFilename')?.value.trim();
  if (override) {
    let fn = override.replace(/[^\w.\-]/g, '_').replace(/\.pdf$/i, '');
    return fn.slice(0, 80) + '.pdf';
  }
  const first = files[0];
  if (!first) return 'merged.pdf';
  const stem = first.file.name.replace(/\.[^.]+$/, '').replace(/[^\w\-]/g, '_').slice(0, 40);
  return `${stem}_merged.pdf`;
}

/* ══════════════════════════════════════════════════════════
   MERGE
══════════════════════════════════════════════════════════ */
async function doMerge() {
  if (files.length < 2) { showToast('Add at least 2 files to merge', 'warn'); return; }
  mergeStart = Date.now();
  window.SOUNDS?.playMergeStartSound();
  goProgress(); startProgress(); setStep(1); setMsg('Uploading files…', `Sending ${files.length} files to server`);

  try {
    const fd = new FormData();
    files.forEach(e => fd.append('files', e.file, e.displayName || e.file.name));
    fd.append('add_toc',            String($('optToc')?.checked || false));
    fd.append('add_separators',     String($('optSeparators')?.checked || false));
    fd.append('preserve_bookmarks', String($('optBookmarks')?.checked !== false));
    fd.append('skip_duplicates',    String($('optSkipDupes')?.checked || false));
    fd.append('compress_output',    String($('optCompress')?.checked || false));
    fd.append('normalize_page_size',String($('optNormalize')?.checked || false));
    fd.append('target_page_size',   $('optTargetSize')?.value || 'A4');
    fd.append('merge_method',       $('optMethod')?.value || 'auto');
    fd.append('output_title',       $('optTitle')?.value || '');
    fd.append('output_author',      $('optAuthor')?.value || '');
    fd.append('output_filename',    smartFilename());
    fd.append('page_ranges',        JSON.stringify(files.map(f => f.pageRange || 'all')));
    fd.append('passwords',          JSON.stringify(files.map(f => f.password || null)));
    fd.append('display_names',      JSON.stringify(files.map(f => f.displayName || f.file.name)));
    fd.append('file_types',         JSON.stringify(files.map(f => f.type)));

    setTimeout(() => { setStep(2); setMsg('Merging files…', 'Combining documents and converting images'); }, 500);

    const resp = await fetch('/api/merge-pdf', { method: 'POST', body: fd });

    setTimeout(() => { setStep(3); setMsg('Optimizing…', 'Finalizing and compressing your PDF'); }, 200);

    if (!resp.ok) {
      let msg = `Server error ${resp.status}`;
      try { const j = await resp.json(); msg = j.error || msg; } catch (_) {}
      throw new Error(msg);
    }

    // Read response headers for accurate stats
    const hdrPages  = parseInt(resp.headers.get('X-Total-Pages') || '0') || 0;
    const hdrSrcs   = parseInt(resp.headers.get('X-Source-Count') || '0') || files.length;
    const hdrMethod = resp.headers.get('X-Method-Used') || 'auto';
    const hdrOutSz  = parseInt(resp.headers.get('X-Output-Size') || '0') || 0;
    const hdrLinear = resp.headers.get('X-Linearized') === 'True';

    const blob = await resp.blob();
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(blob);

    const elapsed   = ((Date.now() - mergeStart) / 1000).toFixed(1);
    const outSize   = hdrOutSz || blob.size;
    const inSize    = files.reduce((s, f) => s + f.file.size, 0);
    const delta     = outSize - inSize;
    const pct       = (inSize > 0 ? (delta / inSize * 100).toFixed(1) : '0');
    const totalPages= hdrPages || files.reduce((s, f) => s + (f.info?.pageCount || 0), 0);
    const fn        = smartFilename();

    mergeResult = {
      filename: fn, outputSize: outSize, inputSize: inSize,
      totalPages, sourceCount: hdrSrcs, elapsed,
      method: hdrMethod, linearized: hdrLinear,
    };

    completeProgress(); setStep(4);
    saveRecent(mergeResult);

    setTimeout(() => {
      goResult();
      fillResult(mergeResult, delta, pct);
      window.SOUNDS?.playSuccessChime();
      launchConfetti();
      if (typeof gsap !== 'undefined') {
        gsap.from('.result-card',  { duration: .45, y: 24, ease: 'power3.out' });
        gsap.from('.rstat-card',   { duration: .35, y: 12, stagger: .07, delay: .2, ease: 'power2.out' });
        gsap.from('.download-btn', { duration: .5, scale: .93, delay: .35, ease: 'power3.out' });
      }
    }, 400);

  } catch (err) {
    completeProgress(); goFiles();
    window.SOUNDS?.playErrorSound();
    showToast(err.message || 'Merge failed. Please try again.', 'error', 5000);
    console.error('Merge error:', err);
  }
}

/* ══════════════════════════════════════════════════════════
   FILL RESULT
══════════════════════════════════════════════════════════ */
function fillResult(r, delta, pct) {
  const s = (id, v) => { const e = $(id); if (e) e.textContent = v; };
  s('rFiles',  r.sourceCount);
  s('rPages',  r.totalPages || '—');
  s('rSize',   fmtB(r.outputSize));
  s('rTime',   `${r.elapsed}s`);

  let engineName = r.method || 'Auto';
  engineName = engineName.replace('auto', 'Auto').replace('fitz', 'PyMuPDF').replace('gs', 'GhostScript').replace('+linearized', ' +Lin.');
  s('rEngine', engineName);

  const sv = $('rSaved');
  if (sv) {
    const sign = delta > 0 ? '+' : '';
    sv.textContent = `${sign}${pct}%`;
    sv.style.color = delta < 0 ? 'var(--success)' : delta > 0 ? 'var(--warn)' : 'var(--text2)';
  }

  const fn = $('resultFnDisplay'), fnr = $('resultFnRow');
  if (fn) fn.textContent = r.filename; if (fnr) fnr.style.display = '';

  const sub = $('resultSub');
  if (sub) sub.textContent = `${r.sourceCount} files · ${r.totalPages || '?'} pages → ${r.filename}`;
}

/* ══════════════════════════════════════════════════════════
   DOWNLOAD
══════════════════════════════════════════════════════════ */
function triggerDownload() {
  if (!downloadUrl || !mergeResult) return;
  const a = document.createElement('a');
  a.href = downloadUrl; a.download = mergeResult.filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  window.SOUNDS?.playDownloadWhoosh();
  showToast(`Downloading ${mergeResult.filename}`, 'success');
}

/* ══════════════════════════════════════════════════════════
   COPY FILENAME
══════════════════════════════════════════════════════════ */
function copyFilename() {
  if (!mergeResult) return;
  navigator.clipboard.writeText(mergeResult.filename)
    .then(() => {
      window.SOUNDS?.playCopySound();
      showToast(`"${mergeResult.filename}" copied!`, 'success');
      const btn = $('copyNameBtn'); if (!btn) return;
      btn.classList.add('copied'); btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
      setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '<i class="fas fa-copy"></i> Copy Filename'; }, 2400);
    })
    .catch(() => showToast(mergeResult.filename, 'info'));
}

/* ══════════════════════════════════════════════════════════
   RECENT MERGES
══════════════════════════════════════════════════════════ */
function saveRecent(r) {
  try {
    const l = loadRecent();
    l.unshift({ filename: r.filename, pages: r.totalPages || 0, size: r.outputSize || 0, count: r.sourceCount || 0, date: new Date().toISOString() });
    if (l.length > MAX_RECENT) l.length = MAX_RECENT;
    localStorage.setItem(RECENT_KEY, JSON.stringify(l));
  } catch (_) {}
}
function loadRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (_) { return []; } }

function renderRecent() {
  const c = $('recentMerges'); if (!c) return;
  const l = loadRecent(); if (!l.length) { c.style.display = 'none'; return; }
  c.style.display = '';
  c.innerHTML = `<div class="recent-title"><i class="fas fa-history"></i> Recent Merges</div>
  <div class="recent-list">${l.map(m => `
    <div class="recent-item">
      <i class="fas fa-file-pdf"></i>
      <div class="recent-info">
        <div class="recent-filename" title="${m.filename}">${trunc(m.filename, 40)}</div>
        <div class="recent-meta">${m.count} files · ${m.pages} pages · ${fmtB(m.size)}</div>
      </div>
      <div class="recent-date">${timeAgo(m.date)}</div>
    </div>`).join('')}
  </div>`;
}

/* ══════════════════════════════════════════════════════════
   CONFETTI
══════════════════════════════════════════════════════════ */
function launchConfetti() {
  const container = $('confettiContainer'); if (!container) return;
  container.innerHTML = '';
  const colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#f87171'];
  for (let i = 0; i < 72; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    const size = 5 + Math.random() * 8;
    const dur  = 1.6 + Math.random() * 2.2;
    p.style.cssText = `left:${Math.random()*100}%;width:${size}px;height:${size}px;background:${colors[Math.floor(Math.random()*colors.length)]};border-radius:${Math.random() > 0.5 ? '50%' : '2px'};animation-duration:${dur}s;animation-delay:${Math.random()*0.6}s;transform:rotate(${Math.random()*360}deg)`;
    container.appendChild(p);
  }
  setTimeout(() => { container.innerHTML = ''; }, 5000);
}

/* ══════════════════════════════════════════════════════════
   PREVIEW MODAL
══════════════════════════════════════════════════════════ */
async function openPreview(entry) {
  const modal = $('previewModal'), body = $('previewBody'), title = modal?.querySelector('.pv-title');
  if (!modal || !body) return;
  modal.hidden = false;
  if (title) title.textContent = trunc(entry.displayName || entry.file.name, 55);
  body.innerHTML = `<div class="pv-loading"><div class="fc-thumb-spinner"></div><span>Loading preview…</span></div>`;
  if (typeof gsap !== 'undefined') gsap.from(modal.querySelector('.pv-card'), { duration: .28, y: -16, ease: 'power2.out' });

  if (entry.type === 'img') {
    const url = URL.createObjectURL(entry.file);
    const img  = new Image();
    img.onload = () => {
      body.innerHTML = `<div class="pv-img-wrap"><img src="${url}" alt="Preview" /><span class="pv-img-meta"><i class="fas fa-ruler-combined"></i> ${img.naturalWidth}×${img.naturalHeight}px &nbsp;·&nbsp; ${fmtB(entry.file.size)}</span></div>`;
    };
    img.onerror = () => { body.innerHTML = '<div class="pv-error"><i class="fas fa-circle-xmark"></i> Cannot preview this image</div>'; };
    img.src = url;
    return;
  }

  // PDF preview
  const pdfjs = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
  if (!pdfjs) {
    body.innerHTML = `<div class="pv-error"><i class="fas fa-info-circle"></i> PDF.js not loaded — cannot preview. Click download to view the file.</div>`;
    return;
  }

  try {
    const ab = await entry.file.arrayBuffer();
    const loadTask = pdfjs.getDocument({ data: ab, password: entry.password || '' });
    const doc = await loadTask.promise;
    _previewPdfDoc = doc;
    const numPages = doc.numPages;

    // Doc meta
    let metaHTML = `<div class="pv-doc-meta"><span><i class="fas fa-book-open"></i> ${numPages} pages</span><span><i class="fas fa-weight-hanging"></i> ${fmtB(entry.file.size)}</span>`;
    try { const meta = await doc.getMetadata(); if (meta?.info?.Title) metaHTML += `<span><i class="fas fa-tag"></i> ${meta.info.Title}</span>`; if (meta?.info?.Author) metaHTML += `<span><i class="fas fa-user"></i> ${meta.info.Author}</span>`; } catch (_) {}
    metaHTML += '</div>';

    const maxPages = Math.min(numPages, 12);
    body.innerHTML = metaHTML + `<div class="pv-pages-grid" id="pvGrid"></div>${numPages > 12 ? `<p class="pv-more">Showing first ${maxPages} of ${numPages} pages</p>` : ''}`;
    const grid = $('pvGrid');
    if (!grid) return;

    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 0.6 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const wrap = document.createElement('div');
      wrap.className = 'pv-page';
      wrap.innerHTML = `<div class="pv-page-num">${i}</div>`;
      wrap.insertBefore(canvas, wrap.firstChild);
      grid.appendChild(wrap);
    }
  } catch (err) {
    body.innerHTML = `<div class="pv-error"><i class="fas fa-circle-xmark"></i> ${err.message?.includes('password') ? 'This PDF is password-protected. Enter the password in the file card.' : 'Cannot preview this PDF. It may be corrupted or encrypted.'}</div>`;
  }
}

function closePreview() {
  const modal = $('previewModal'); if (!modal) return;
  if (typeof gsap !== 'undefined') {
    gsap.to(modal.querySelector('.pv-card'), { duration: .2, y: -12, opacity: 0, ease: 'power2.in', onComplete: () => { modal.hidden = true; modal.querySelector('.pv-card').style = ''; $('previewBody').innerHTML = ''; } });
  } else { modal.hidden = true; $('previewBody').innerHTML = ''; }
}

on($('previewClose'), 'click', closePreview);
on($('previewModal'), 'click', e => { if (e.target.id === 'previewModal') closePreview(); });

/* ══════════════════════════════════════════════════════════
   SHORTCUTS MODAL
══════════════════════════════════════════════════════════ */
const showSCM = () => {
  const m = $('shortcutsModal'); if (!m) return;
  m.hidden = false;
  if (typeof gsap !== 'undefined') gsap.from(m.querySelector('.modal-card'), { duration: .28, y: -14, ease: 'power2.out' });
  $('shortcutsClose')?.focus();
};
const hideSCM = () => { $('shortcutsModal').hidden = true; };
on($('shortcutsClose'), 'click', hideSCM);
on($('shortcutsModal'), 'click', e => { if (e.target.id === 'shortcutsModal') hideSCM(); });
on($('shortcutsHintBtn'), 'click', showSCM);

/* ══════════════════════════════════════════════════════════
   DROP ZONE
══════════════════════════════════════════════════════════ */
on(dropZone, 'click', e => {
  if (e.target === dropZone || e.target.closest('.drop-content') || e.target.classList.contains('drop-browse')) fileInput.click();
});
on(dropZone, 'keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
on(fileInput, 'change', e => { if (e.target.files.length) addFiles(e.target.files); fileInput.value = ''; });
on(addMoreInput, 'change', e => { if (e.target.files.length) addFiles(e.target.files); addMoreInput.value = ''; });

on($('addMoreBtn'), 'click', () => addMoreInput.click());
on($('clearAllBtn'), 'click', () => {
  if (!files.length) return;
  if (typeof gsap !== 'undefined') {
    gsap.to('#fileList .file-card', { duration: .18, x: 20, opacity: 0, stagger: .04, onComplete: goUpload });
  } else goUpload();
});

// Drop zone drag
['dragenter', 'dragover'].forEach(ev => on(dropZone, ev, e => { e.preventDefault(); dropZone.classList.add('drag-over'); }));
['dragleave', 'drop'].forEach(ev => on(dropZone, ev, e => { e.preventDefault(); dropZone.classList.remove('drag-over'); }));
on(dropZone, 'drop', e => { if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files); });

// Global drag indicator
let _dc = 0;
on(document, 'dragenter', e => {
  if (!e.dataTransfer?.types?.includes('Files')) return;
  _dc++; globalDragInd?.classList.add('active');
});
on(document, 'dragleave', () => { _dc = Math.max(0, _dc - 1); if (!_dc) globalDragInd?.classList.remove('active'); });
on(document, 'dragover', e => e.preventDefault());
on(document, 'drop', e => {
  _dc = 0; globalDragInd?.classList.remove('active');
  e.preventDefault();
  if (e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
});

/* ══════════════════════════════════════════════════════════
   BUTTON WIRING
══════════════════════════════════════════════════════════ */
on(mergeBtn,     'click', doMerge);
on(downloadBtn,  'click', triggerDownload);
on(mergeAgainBtn,'click', () => { window.SOUNDS?.playMergeAgainSound(); hideUndoBar(); goUpload(); });
on($('copyNameBtn'), 'click', copyFilename);

/* ══════════════════════════════════════════════════════════
   SORT BUTTONS
══════════════════════════════════════════════════════════ */
$$('.sort-btn').forEach(b => on(b, 'click', () => sortFiles(b.dataset.sort)));

/* ══════════════════════════════════════════════════════════
   FAQ ACCORDION
══════════════════════════════════════════════════════════ */
$$('.faq-q').forEach(btn => {
  on(btn, 'click', () => {
    const item = btn.closest('.faq-item'), isOpen = item.classList.contains('open');
    $$('.faq-item.open').forEach(i => { i.classList.remove('open'); i.querySelector('.faq-q').setAttribute('aria-expanded', 'false'); });
    if (!isOpen) { item.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
  });
});

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════════ */
on(document, 'keydown', e => {
  const inp = e.target.matches('input,textarea,[contenteditable]');
  if (e.key === '?' && !inp)            { showSCM(); return; }
  if (e.key === 'Escape')               { hideSCM(); closePreview(); hideUndoBar(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (downloadUrl) triggerDownload(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !inp) { e.preventDefault(); undoLastDelete(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); filesSection && !filesSection.hidden ? addMoreInput.click() : fileInput.click(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'm') { e.preventDefault(); if (files.length >= 2) doMerge(); else showToast('Add at least 2 files', 'warn'); return; }
  if (e.key === 'Delete' && !inp) {
    const id = document.activeElement.closest('.file-card')?.dataset.id;
    if (id) removeFile(id);
  }
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !inp) {
    const card = document.activeElement.closest('.file-card'); if (!card) return;
    e.preventDefault();
    const id = card.dataset.id;
    moveFile(id, e.key === 'ArrowUp' ? -1 : 1);
  }
});

/* ══════════════════════════════════════════════════════════
   GSAP SCROLL ANIMATIONS
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const tryGSAP = () => {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') { setTimeout(tryGSAP, 120); return; }
    gsap.registerPlugin(ScrollTrigger);

    // Hero animations — y-only (NEVER opacity:0 above fold)
    gsap.from('.hero-badge',              { duration: .5, y: -18, delay: .05, ease: 'power2.out' });
    gsap.from('.hero-title .title-line1', { duration: .62, y: 28, delay: .14, ease: 'power3.out' });
    gsap.from('.hero-title .title-line2', { duration: .62, y: 28, delay: .26, ease: 'power3.out' });
    gsap.from('.hero-subtitle',           { duration: .5, y: 18, delay: .36, ease: 'power2.out' });
    gsap.from('.stat-pill',               { duration: .4, y: 14, delay: .44, stagger: .06, ease: 'power2.out' });
    gsap.from('.upload-zone',             { duration: .55, y: 24, delay: .52, ease: 'power3.out' });

    // Scroll-triggered sections
    ['.step-card', '.feature-card', '.related-card'].forEach(sel => {
      ScrollTrigger.batch(sel, {
        onEnter: els => gsap.from(els, { duration: .5, y: 22, stagger: .08, ease: 'power2.out' }),
        start: 'top 88%', once: true,
      });
    });
    ScrollTrigger.batch('.faq-item', {
      onEnter: els => gsap.from(els, { duration: .4, y: 14, stagger: .06, ease: 'power2.out' }),
      start: 'top 92%', once: true,
    });
  };
  setTimeout(tryGSAP, 100);
});

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
goUpload();
