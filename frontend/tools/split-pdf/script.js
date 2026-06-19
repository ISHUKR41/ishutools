/**
 * split-pdf/script.js  v10.0 — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Enterprise split tool — state machine, full sounds, lossless quality
 *
 * MEMORY constraints respected:
 *   - [hidden]{display:none!important} in CSS
 *   - All DOM refs inside DOMContentLoaded
 *   - sounds.js loaded as regular script (not defer)
 *   - <base href="/tools/split-pdf/"> in HTML
 *   - Never opacity:0 in IO/scroll reveal
 *   - Never background-clip:text on FA icons
 *   - Never color-mix() CSS
 */

'use strict';

/* ── Sound helper ─────────────────────────────────────────────────── */
function S(key) {
  try {
    if (window.SOUNDS && typeof window.SOUNDS[key] === 'function') {
      window.SOUNDS[key]();
    }
  } catch (_) {}
}

/* ── State ──────────────────────────────────────────────────────── */
let FILE          = null;   // File object
let PDF_INFO      = null;   // {total_pages, blank_pages, has_bookmarks, bookmarks, …}
let MODE          = 'all';
let PAGE_SEL      = new Set();  // 0-based selected indices for range mode
let _BLOB_URL     = null;   // blob URL for download
let _ZIP_FILENAME = 'document_split.zip';
let _shiftStart   = null;
let _splitStartTime = 0;
let _sseSource    = null;
let _simInterval  = null;
let _recMode      = null;   // recommended mode from AI

/* ── DOM refs (populated in DOMContentLoaded) ─────────────────────── */
let D = null;

/* ══════════════════════════════════════════════════════════════════
   BACKGROUND CANVAS
═══════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const c = document.getElementById('bgCanvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  let W, H, pts = [];

  function resize() {
    W = c.width  = window.innerWidth;
    H = c.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  const N = Math.min(55, Math.floor(window.innerWidth / 24));
  for (let i = 0; i < N; i++) {
    pts.push({
      x:  Math.random() * W,
      y:  Math.random() * H,
      vx: (Math.random() - .5) * .32,
      vy: (Math.random() - .5) * .32,
      r:  1.2 + Math.random() * 2,
    });
  }

  const COLORS = ['#6366f1','#8b5cf6','#06b6d4','#10b981'];

  function draw() {
    ctx.clearRect(0, 0, W, H);
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[Math.floor(Math.random() * COLORS.length)];
      ctx.globalAlpha = .35;
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const d  = Math.sqrt(dx * dx + dy * dy);
        if (d < 130) {
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.strokeStyle = '#6366f1';
          ctx.globalAlpha = .06 * (1 - d / 130);
          ctx.lineWidth = .8;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    }
    requestAnimationFrame(draw);
  }
  draw();
}

/* ══════════════════════════════════════════════════════════════════
   THEME
═══════════════════════════════════════════════════════════════════ */
function initTheme() {
  const stored = localStorage.getItem('ishu-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', stored);
  updateThemeIcon(stored);
}

function updateThemeIcon(theme) {
  if (!D || !D.themeIcon) return;
  D.themeIcon.className = theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
}

function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ishu-theme', next);
  updateThemeIcon(next);
}

/* ══════════════════════════════════════════════════════════════════
   SOUND TOGGLE
═══════════════════════════════════════════════════════════════════ */
function initSoundToggle() {
  updateSoundBtn();
}

function updateSoundBtn() {
  if (!D || !D.soundIcon) return;
  const on = !window.SOUNDS || window.SOUNDS.isEnabled();
  D.soundIcon.className = on ? 'fa-solid fa-volume-high' : 'fa-solid fa-volume-xmark';
  D.soundBtn.classList.toggle('muted', !on);
}

function toggleSound() {
  if (window.SOUNDS) window.SOUNDS.toggle();
  updateSoundBtn();
  toast(window.SOUNDS && window.SOUNDS.isEnabled() ? 'Sound on' : 'Sound off', 'info', 1600);
}

/* ══════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════ */
function showEl(el) { if (el) el.removeAttribute('hidden'); }
function hideEl(el) { if (el) el.setAttribute('hidden', ''); }
function togEl(el, show) { if (show) showEl(el); else hideEl(el); }

function fmtBytes(b) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
  if (b >= 1024)    return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

function stemName(filename) {
  if (!filename) return 'document';
  return filename.replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*]/g, '_').slice(0, 55) || 'document';
}

function toast(msg, type, dur) {
  type = type || 'info';
  dur  = dur  || 3500;
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const icons = {
    success: 'fa-circle-check',
    error:   'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info:    'fa-circle-info',
  };
  const div = document.createElement('div');
  div.className = 'sp-toast ' + type;
  div.innerHTML = '<i class="fa-solid ' + (icons[type] || icons.info) + '"></i><span>' + msg + '</span>';
  c.appendChild(div);
  setTimeout(function() {
    div.classList.add('exiting');
    setTimeout(function() { div.remove(); }, 350);
  }, dur);
}

/* ══════════════════════════════════════════════════════════════════
   PROGRESS (SVG circle + bar + SSE)
═══════════════════════════════════════════════════════════════════ */
function injectSvgDefs() {
  const svg = document.querySelector('.sp-spin-svg');
  if (!svg) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', 'progressGrad');
  grad.setAttribute('x1', '0%'); grad.setAttribute('y1', '0%');
  grad.setAttribute('x2', '100%'); grad.setAttribute('y2', '0%');
  const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#6366f1');
  const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', '#8b5cf6');
  grad.appendChild(s1); grad.appendChild(s2);
  defs.appendChild(grad);
  svg.insertBefore(defs, svg.firstChild);
}

function openSSE(sessionId) {
  try {
    _sseSource = new EventSource('/api/progress/' + sessionId);
    _sseSource.onmessage = function(e) {
      try {
        const d = JSON.parse(e.data);
        if (d.pct !== undefined) updateProgress(d.pct, d.msg || '');
      } catch (_) {}
    };
    _sseSource.onerror = function() { closeSSE(); };
  } catch (_) {}
}

function closeSSE() {
  if (_sseSource) { try { _sseSource.close(); } catch (_) {} _sseSource = null; }
  if (_simInterval) { clearInterval(_simInterval); _simInterval = null; }
}

function simProgress(target, msPerPct) {
  target    = target    || 90;
  msPerPct  = msPerPct  || 110;
  let cur   = parseInt(D.progressBar.style.width) || 0;
  _simInterval = setInterval(function() {
    cur = Math.min(target, cur + 1 + Math.random() * 1.4);
    updateProgress(cur, D.progressTitle ? D.progressTitle.textContent : '');
    if (cur >= target) clearInterval(_simInterval);
  }, msPerPct);
}

function updateProgress(pct, msg) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  if (!D.progressBar) return;
  D.progressBar.style.width = p + '%';
  D.progressBar.setAttribute('aria-valuenow', p);
  if (D.progressPct) D.progressPct.textContent = p + '%';

  const fill = document.getElementById('progressCircle');
  if (fill) fill.style.strokeDashoffset = String(94.2 * (1 - p / 100));

  if (msg && D.progressSub) D.progressSub.textContent = msg;
  if (D.progressTitle) {
    if (p >= 75)  D.progressTitle.textContent = 'Packing ZIP…';
    else if (p >= 25) D.progressTitle.textContent = 'Splitting pages…';
    if (p >= 95)  D.progressTitle.textContent = 'Almost done!';
  }
}

function addProgressStep(icon, text) {
  if (!D.progressSteps) return;
  const div = document.createElement('div');
  div.className = 'sp-progress-step';
  div.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + text + '</span>';
  D.progressSteps.appendChild(div);
}

/* ══════════════════════════════════════════════════════════════════
   UPLOAD & FILE HANDLING
═══════════════════════════════════════════════════════════════════ */
function initUpload() {
  D.dropZone.addEventListener('click', function(e) {
    if (e.target === D.browseBtn || e.target.closest('#browseBtn')) {
      D.fileInput.click();
    } else if (!e.target.closest('#browseBtn')) {
      D.fileInput.click();
    }
  });
  D.dropZone.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
  });
  D.browseBtn.addEventListener('click', function(e) { e.stopPropagation(); D.fileInput.click(); });
  D.fileInput.addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });
  D.dropZone.addEventListener('dragover', function(e) {
    e.preventDefault(); D.dropZone.classList.add('drag-over');
  });
  D.dropZone.addEventListener('dragleave', function() { D.dropZone.classList.remove('drag-over'); });
  D.dropZone.addEventListener('drop', function(e) {
    e.preventDefault(); D.dropZone.classList.remove('drag-over');
    var f = e.dataTransfer.files[0];
    if (f && f.type === 'application/pdf') handleFile(f);
    else if (f) toast('Please drop a PDF file.', 'warning');
  });
  D.removeBtn.addEventListener('click', resetAll);
}

function handleFile(file) {
  FILE = file;
  PDF_INFO = null;
  PAGE_SEL.clear();
  _shiftStart = null;

  // Download filename based on source PDF name
  _ZIP_FILENAME = stemName(file.name) + '_split.zip';

  S('playFileAddSound');

  // Show file info, hide drop zone
  hideEl(D.dropZone);
  showEl(D.fileInfoWrap);
  D.fileName.textContent = file.name;
  D.chipSize.innerHTML = '<i class="fa-solid fa-weight-hanging"></i> ' + fmtBytes(file.size);
  D.chipPages.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading…';
  D.chipBookmarks.classList.add('sp-chip-hidden');
  D.chipBlanks.classList.add('sp-chip-hidden');
  D.chipEncrypted.classList.add('sp-chip-hidden');
  D.chipScanned.classList.add('sp-chip-hidden');

  // Show all subsequent cards
  showEl(D.modesCard);
  showEl(D.optionsCard);
  showEl(D.advCard);
  showEl(D.actionCard);
  showEl(D.fabBtn);
  D.splitBtn.disabled = false;

  // Refresh mode display (shows 'all' options by default)
  selectMode(MODE);
  updateActionHint();

  // Async operations
  loadPdfInfo(file);
  loadThumbnails(file);
  autoDetectMode(file);

  setTimeout(updateSplitPreview, 400);
}

function loadPdfInfo(file) {
  var fd = new FormData();
  fd.append('file', file);
  var pw = D.passwordInput ? D.passwordInput.value : '';
  if (pw) fd.append('password', pw);

  fetch('/api/split-pdf/info', { method:'POST', body:fd })
    .then(function(res) { return res.json(); })
    .then(function(info) {
      PDF_INFO = info;
      if (!info.success && info.error) {
        D.chipPages.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> Error';
        toast('PDF info error: ' + info.error, 'warning');
        return;
      }

      D.chipPages.innerHTML = '<i class="fa-solid fa-file-lines"></i> ' + (info.total_pages || '?') + ' pages';

      if (info.has_bookmarks && info.bookmarks && info.bookmarks.length > 0) {
        D.chipBookmarks.classList.remove('sp-chip-hidden');
        D.chipBookmarks.innerHTML = '<i class="fa-solid fa-bookmark"></i> ' + info.bookmarks.length + ' bookmarks';
        updateBookmarkList(info.bookmarks);
      }
      if (info.blank_pages > 0) {
        D.chipBlanks.classList.remove('sp-chip-hidden');
        D.chipBlanks.innerHTML = '<i class="fa-regular fa-file"></i> ' + info.blank_pages + ' blank';
        if (D.blankCountInfo) D.blankCountInfo.textContent = 'Detected ' + info.blank_pages + ' blank separator page(s).';
      }
      if (info.is_encrypted) D.chipEncrypted.classList.remove('sp-chip-hidden');
      if (info.is_scanned)   D.chipScanned.classList.remove('sp-chip-hidden');

      updateModeBadges();
      updatePresetVisibility();
      showEl(D.presetsRow);

      if (MODE === 'range')  buildPageGrid();
      if (MODE === 'every_n') updateChunkInfo();
      updateSplitPreview();
    })
    .catch(function() {
      D.chipPages.innerHTML = '<i class="fa-solid fa-exclamation-triangle"></i> ?';
      toast('Could not read PDF info — you can still split.', 'warning');
    });
}

function loadThumbnails(file) {
  var fd = new FormData();
  fd.append('file', file);
  fd.append('max_pages', '16');

  fetch('/api/split-pdf/thumbnails', { method:'POST', body:fd })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.thumbnails || !data.thumbnails.length) return;

      D.thumbsStrip.innerHTML = '';
      data.thumbnails.forEach(function(src, i) {
        var div = document.createElement('div');
        div.className = 'sp-thumb';
        div.setAttribute('role', 'listitem');
        div.setAttribute('aria-label', 'Page ' + (i + 1));
        div.dataset.page = String(i);
        div.innerHTML = '<img src="' + src + '" alt="Page ' + (i+1) + '" loading="lazy">'
          + '<div class="sp-thumb-sel"><i class="fa-solid fa-check"></i></div>'
          + '<div class="sp-thumb-num">' + (i+1) + '</div>';
        div.addEventListener('click', function() { thumbClick(i); });
        D.thumbsStrip.appendChild(div);
      });

      var total = PDF_INFO ? PDF_INFO.total_pages : data.thumbnails.length;
      D.thumbsCount.textContent = data.thumbnails.length + ' of ' + total + ' pages shown';
      showEl(D.thumbsWrap);
    })
    .catch(function() { /* thumbnails optional */ });
}

function autoDetectMode(file) {
  var fd = new FormData();
  fd.append('file', file);

  fetch('/api/split-pdf/auto-detect', { method:'POST', body:fd })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.recommended_mode) return;
      _recMode = data.recommended_mode;
      var reason = data.reason || ('Recommended: ' + data.recommended_mode + ' mode');
      D.recommendText.textContent = reason;
      showEl(D.recommendBanner);
    })
    .catch(function() { /* AI recommendation optional */ });
}

function thumbClick(idx) {
  if (MODE !== 'range') {
    selectMode('range');
    PAGE_SEL.clear();
    PAGE_SEL.add(idx);
    syncInputFromPageGrid();
    updatePgridDisplay();
    return;
  }
  if (PAGE_SEL.has(idx)) PAGE_SEL.delete(idx);
  else PAGE_SEL.add(idx);
  syncInputFromPageGrid();
  updateThumbSelections();
}

function updateThumbSelections() {
  D.thumbsStrip.querySelectorAll('.sp-thumb').forEach(function(th) {
    var pg = parseInt(th.dataset.page);
    th.classList.toggle('pg-selected', PAGE_SEL.has(pg));
  });
}

/* ══════════════════════════════════════════════════════════════════
   MODE SELECTION
═══════════════════════════════════════════════════════════════════ */
var MODE_DESC = {
  all:          'Burst every page into its own PDF — perfect for archiving single pages.',
  range:        'Extract specific pages into a combined PDF. Use ranges like 1-5, 8, 12-end.',
  range_groups: 'Each range becomes a separate file in one pass. Enter one range per line. Exclusive to IshuTools by Ishu Kumar.',
  every_n:      'Split into equal chunks of N pages each. Great for batches or chapters.',
  bookmarks:    'One PDF per bookmark/chapter. Ideal for textbooks, reports, and ebooks.',
  blank_pages:  'Auto-detect blank separator pages and split between them. Zero quality loss.',
  size_limit:   'Split by maximum file size. Each output fits within your target.',
  odd_even:     'Two files: odd pages (1,3,5…) and even pages (2,4,6…). Perfect for scanning.',
};

function selectMode(mode) {
  MODE = mode;
  _shiftStart = null;

  // Update card active state
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(function(c) {
    var active = c.dataset.mode === mode;
    c.classList.toggle('active', active);
    c.setAttribute('aria-checked', String(active));
  });

  // Update description
  if (D.modeDesc) D.modeDesc.textContent = MODE_DESC[mode] || '';

  // Show/hide option panels
  var panels = ['all','range','range_groups','every_n','bookmarks','blank_pages','size_limit','odd_even'];
  panels.forEach(function(m) {
    var el = document.getElementById('opts-' + m);
    if (el) togEl(el, m === mode);
  });

  // Mode-specific setup
  if (mode === 'range')     buildPageGrid();
  if (mode === 'every_n')   updateChunkInfo();
  if (mode === 'bookmarks') updateBookmarkList(PDF_INFO && PDF_INFO.bookmarks ? PDF_INFO.bookmarks : []);

  updateSplitPreview();
  updateActionHint();
}

function initModeCards() {
  D.modesGrid.querySelectorAll('.sp-mode-card').forEach(function(card) {
    card.addEventListener('click', function() {
      if (window.SOUNDS) window.SOUNDS.resume();
      selectMode(card.dataset.mode);
      S('playToggleOnSound');
    });
    card.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectMode(card.dataset.mode); }
    });
  });
}

function updateModeBadges() {
  if (!PDF_INFO) return;
  var total = PDF_INFO.total_pages || 1;
  var badges = {
    all:          total + ' files',
    range:        'extract',
    range_groups: 'multi-output',
    every_n:      Math.ceil(total / 5) + ' files',
    bookmarks:    PDF_INFO.has_bookmarks ? (PDF_INFO.bookmarks||[]).length + ' chapters' : 'no bookmarks',
    blank_pages:  PDF_INFO.blank_pages > 0 ? PDF_INFO.blank_pages + ' blanks' : 'auto-detect',
    size_limit:   'fit in MB',
    odd_even:     '2 files',
  };
  Object.keys(badges).forEach(function(mode) {
    var el = document.getElementById('badge-' + mode);
    if (el && !el.querySelector('.sp-exclusive')) el.textContent = badges[mode];
  });
}

/* ══════════════════════════════════════════════════════════════════
   PRESETS
═══════════════════════════════════════════════════════════════════ */
var PRESETS = {
  chapters:  { mode:'bookmarks',    desc:'Split into chapters by bookmarks' },
  halves:    { mode:'every_n',      n:'half',  desc:'Split in two equal halves' },
  thirds:    { mode:'every_n',      n:'third', desc:'Split into 3 equal parts' },
  firstlast: { mode:'range_groups', ranges:'1', desc:'First page + Last page' },
  every5:    { mode:'every_n',      n:5,       desc:'Every 5 pages' },
  burst:     { mode:'all',                      desc:'One PDF per page' },
};

function applyPreset(key) {
  var p = PRESETS[key];
  if (!p) return;

  D.presetsRow.querySelectorAll('.sp-preset-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.preset === key);
  });

  selectMode(p.mode);

  if (p.mode === 'every_n') {
    var total = PDF_INFO ? PDF_INFO.total_pages : 10;
    var n = p.n;
    if (n === 'half')  n = Math.max(1, Math.ceil(total / 2));
    if (n === 'third') n = Math.max(1, Math.ceil(total / 3));
    D.nInput.value  = n;
    D.nSlider.value = Math.min(50, n);
    updateChunkInfo();
  }
  if (p.mode === 'range_groups' && p.ranges) {
    var total2 = PDF_INFO ? PDF_INFO.total_pages : 1;
    D.rangeGroupsInput.value = '1\n' + total2;
    updateGroupsPreview();
  }

  S('playPresetSound');
  updateSplitPreview();
  toast(p.desc, 'success', 2000);
}

function updatePresetVisibility() {
  if (!PDF_INFO) return;
  var hasBookmarks = PDF_INFO.has_bookmarks && PDF_INFO.bookmarks && PDF_INFO.bookmarks.length >= 2;
  D.presetsRow.querySelectorAll('[data-preset="chapters"]').forEach(function(b) {
    b.style.display = hasBookmarks ? '' : 'none';
  });
}

/* ══════════════════════════════════════════════════════════════════
   PAGE GRID (range mode)
═══════════════════════════════════════════════════════════════════ */
function buildPageGrid() {
  if (!D.pgrid) return;
  D.pgrid.innerHTML = '';
  var total = PDF_INFO ? PDF_INFO.total_pages : 1;

  if (total > 500) {
    D.pgrid.innerHTML = '<div class="sp-pg-overflow">Grid not shown for documents > 500 pages. Use the range input above.</div>';
    return;
  }

  for (var i = 0; i < total; i++) {
    (function(idx) {
      var cell = document.createElement('div');
      cell.className = 'sp-pg-cell' + (PAGE_SEL.has(idx) ? ' selected' : '');
      cell.textContent = idx + 1;
      cell.dataset.idx = String(idx);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-selected', String(PAGE_SEL.has(idx)));
      cell.addEventListener('click', function(e) { pgCellClick(idx, e.shiftKey); });
      cell.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pgCellClick(idx, e.shiftKey); }
      });
      D.pgrid.appendChild(cell);
    })(i);
  }
  updatePgridSelCount();
}

function pgCellClick(idx, shift) {
  if (shift && _shiftStart !== null) {
    var lo = Math.min(_shiftStart, idx);
    var hi = Math.max(_shiftStart, idx);
    for (var i = lo; i <= hi; i++) PAGE_SEL.add(i);
  } else {
    if (PAGE_SEL.has(idx)) PAGE_SEL.delete(idx);
    else PAGE_SEL.add(idx);
    _shiftStart = idx;
  }
  syncInputFromPageGrid();
  updatePgridDisplay();
  S('playSortSound');
}

function updatePgridDisplay() {
  if (!D.pgrid) return;
  D.pgrid.querySelectorAll('.sp-pg-cell').forEach(function(cell) {
    var idx = parseInt(cell.dataset.idx);
    var sel = PAGE_SEL.has(idx);
    cell.classList.toggle('selected', sel);
    cell.setAttribute('aria-selected', String(sel));
  });
  updatePgridSelCount();
  updateThumbSelections();
}

function updatePgridSelCount() {
  if (!D.pgridSelCount) return;
  var total = PDF_INFO ? PDF_INFO.total_pages : 0;
  var sel   = PAGE_SEL.size;
  D.pgridSelCount.textContent = sel > 0
    ? sel + ' of ' + total + ' pages selected'
    : 'Click pages to select (Shift+click for range)';
}

function syncInputFromPageGrid() {
  if (!D.rangeInput) return;
  if (PAGE_SEL.size === 0) {
    D.rangeInput.value = '';
    D.rangeInput.classList.remove('valid', 'invalid');
  } else {
    var sorted = Array.from(PAGE_SEL).sort(function(a,b) { return a-b; });
    var parts  = [];
    var start  = sorted[0], end = sorted[0];
    for (var i = 1; i <= sorted.length; i++) {
      if (i < sorted.length && sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        parts.push(start === end ? String(start + 1) : (start + 1) + '-' + (end + 1));
        if (i < sorted.length) { start = end = sorted[i]; }
      }
    }
    D.rangeInput.value = parts.join(',');
    D.rangeInput.classList.add('valid');
    D.rangeInput.classList.remove('invalid');
  }
  updateRangePreview();
  updateSplitPreview();
}

function syncPageGridFromInput() {
  if (!D.rangeInput) return;
  var val   = D.rangeInput.value;
  var total = PDF_INFO ? PDF_INFO.total_pages : 0;
  PAGE_SEL.clear();

  if (!val.trim()) {
    D.rangeInput.classList.remove('valid', 'invalid');
  } else {
    var cleaned = val.toLowerCase().trim();
    if (cleaned === 'all')  for (var i = 0; i < total; i++) PAGE_SEL.add(i);
    else if (cleaned === 'odd')  for (var i = 0; i < total; i += 2) PAGE_SEL.add(i);
    else if (cleaned === 'even') for (var i = 1; i < total; i += 2) PAGE_SEL.add(i);
    else {
      var mFirst = cleaned.match(/^first\s+(\d+)/);
      var mLast  = cleaned.match(/^last\s+(\d+)/);
      if (mFirst) {
        for (var i = 0; i < Math.min(parseInt(mFirst[1]), total); i++) PAGE_SEL.add(i);
      } else if (mLast) {
        var n = parseInt(mLast[1]);
        for (var i = Math.max(0, total - n); i < total; i++) PAGE_SEL.add(i);
      } else {
        cleaned.split(/[,;，；]+/).forEach(function(part) {
          part = part.trim();
          if (!part) return;
          var rPart = part.replace('end', String(total));
          var rm = rPart.match(/^(\d+)\s*[-–—~]\s*(\d+)$/);
          if (rm) {
            for (var i = parseInt(rm[1]) - 1; i <= parseInt(rm[2]) - 1; i++) {
              if (i >= 0 && i < total) PAGE_SEL.add(i);
            }
          } else if (/^\d+$/.test(rPart)) {
            var idx = parseInt(rPart) - 1;
            if (idx >= 0 && idx < total) PAGE_SEL.add(idx);
          }
        });
      }
    }
    D.rangeInput.classList.toggle('valid', PAGE_SEL.size > 0);
    D.rangeInput.classList.toggle('invalid', PAGE_SEL.size === 0);
  }
  updatePgridDisplay();
  updateRangePreview();
  updateSplitPreview();
}

function updateRangePreview() {
  if (!D.rangePreview) return;
  var total = PDF_INFO ? PDF_INFO.total_pages : 0;
  var val   = (D.rangeInput.value || '').trim();

  if (!val) {
    D.rangePreview.innerHTML = '<span class="sp-rp-hint">Type a range to preview selected pages</span>';
    return;
  }
  if (PAGE_SEL.size === 0) {
    D.rangePreview.innerHTML = '<span class="sp-rp-invalid"><i class="fa-solid fa-triangle-exclamation"></i> No valid pages (PDF has ' + total + ' pages)</span>';
    return;
  }
  if (PAGE_SEL.size > 80) {
    D.rangePreview.innerHTML = '<span class="sp-rp-warn"><i class="fa-solid fa-circle-info"></i> ' + PAGE_SEL.size + ' pages selected</span>';
    return;
  }
  D.rangePreview.innerHTML = Array.from(PAGE_SEL).sort(function(a,b){return a-b;}).slice(0, 80).map(function(i) {
    return '<span class="sp-rp-chip">' + (i+1) + '</span>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════
   CHUNK INFO / GROUPS PREVIEW / BOOKMARKS
═══════════════════════════════════════════════════════════════════ */
function updateChunkInfo() {
  if (!D.chunkCount) return;
  var total = PDF_INFO ? PDF_INFO.total_pages : 1;
  var n     = Math.max(1, parseInt(D.nInput.value) || 1);
  var cnt   = Math.ceil(total / n);
  D.chunkCount.textContent = String(cnt);
  D.chunkCount.style.color = cnt > 50 ? 'var(--yellow)' : 'var(--accent)';
}

function updateGroupsPreview() {
  if (!D.groupsPreview) return;
  var val = (D.rangeGroupsInput.value || '').trim();
  if (!val) { D.groupsPreview.innerHTML = ''; return; }
  var lines = val.split(/[\n,，;；]+/).map(function(l){return l.trim();}).filter(Boolean);
  D.groupsPreview.innerHTML = lines.map(function(l, i) {
    var hue = (i * 47) % 360;
    return '<span class="sp-rp-chip" style="border-color:hsl(' + hue + ',60%,60%,0.2);color:hsl(' + hue + ',60%,60%)">Group ' + (i+1) + ': ' + l + '</span>';
  }).join('');
}

function updateBookmarkList(bookmarks) {
  if (!D.bookmarkList || !D.bookmarksInfoText) return;
  if (!bookmarks || !bookmarks.length) {
    D.bookmarksInfoText.textContent = 'No bookmarks found — will fallback to 5-page chunks.';
    D.bookmarkList.innerHTML = '';
    return;
  }
  D.bookmarksInfoText.textContent = bookmarks.length + ' chapters found — each will become its own PDF.';
  D.bookmarkList.innerHTML = bookmarks.slice(0, 30).map(function(bk, i) {
    var title = bk[0] || ('Chapter ' + (i + 1));
    var page  = (bk[1] || 0) + 1;
    return '<div class="sp-bk-item"><i class="fa-solid fa-bookmark"></i><span>' + (i+1) + '. ' + title + '</span><span style="margin-left:auto;font-size:.7rem;color:var(--text3)">pg ' + page + '</span></div>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════
   SPLIT PREVIEW ESTIMATE
═══════════════════════════════════════════════════════════════════ */
function updateSplitPreview() {
  if (!PDF_INFO || !D.splitPreviewBox) return;
  var total = PDF_INFO.total_pages || 1;
  var est   = '—';

  if (MODE === 'all')          est = total + ' files';
  else if (MODE === 'range')   est = PAGE_SEL.size > 0 ? '1 file (' + PAGE_SEL.size + ' pages)' : 'Select pages above';
  else if (MODE === 'range_groups') {
    var lines = (D.rangeGroupsInput.value || '').split(/[\n,，;；]+/).filter(function(l){return l.trim();});
    est = lines.length + ' file' + (lines.length !== 1 ? 's' : '');
  }
  else if (MODE === 'every_n') {
    var n = Math.max(1, parseInt(D.nInput.value) || 1);
    est = Math.ceil(total / n) + ' files';
  }
  else if (MODE === 'bookmarks') est = PDF_INFO.has_bookmarks ? (PDF_INFO.bookmarks||[]).length + ' files' : 'No bookmarks — fallback';
  else if (MODE === 'blank_pages') est = PDF_INFO.blank_pages > 0 ? '~' + (PDF_INFO.blank_pages + 1) + ' files' : '1+ files';
  else if (MODE === 'size_limit')  est = '~' + Math.max(2, Math.ceil(total / Math.max(1, parseInt(D.sizeSlider.value)||5))) + ' files (estimate)';
  else if (MODE === 'odd_even')    est = '2 files (odd + even)';

  D.splitPreviewText.textContent = 'Will create: ' + est;
  showEl(D.splitPreviewBox);
}

function updateActionHint() {
  if (!D.actionHint) return;
  if (!FILE) { D.actionHint.textContent = 'Upload a PDF to get started'; return; }
  var hints = {
    all:          'Every page → own PDF → ZIP',
    range:        'Selected pages → 1 PDF → ZIP',
    range_groups: 'Each group → own PDF → ZIP',
    every_n:      'Equal chunks → multiple PDFs → ZIP',
    bookmarks:    'Each chapter → own PDF → ZIP',
    blank_pages:  'Splits at blank pages → ZIP',
    size_limit:   'Grouped by size limit → ZIP',
    odd_even:     'Odd pages + Even pages → 2 PDFs → ZIP',
  };
  D.actionHint.textContent = hints[MODE] || 'Press Ctrl+Enter to split';
}

/* ══════════════════════════════════════════════════════════════════
   QUICK-SELECT BUTTONS
═══════════════════════════════════════════════════════════════════ */
function initQsButtons() {
  document.querySelectorAll('.sp-qs-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var qs    = btn.dataset.qs;
      var total = PDF_INFO ? PDF_INFO.total_pages : 1;
      PAGE_SEL.clear();
      if (qs === 'all')    for (var i = 0; i < total; i++) PAGE_SEL.add(i);
      if (qs === 'odd')    for (var i = 0; i < total; i += 2) PAGE_SEL.add(i);
      if (qs === 'even')   for (var i = 1; i < total; i += 2) PAGE_SEL.add(i);
      if (qs === 'first5') for (var i = 0; i < Math.min(5, total); i++) PAGE_SEL.add(i);
      if (qs === 'last5')  for (var i = Math.max(0, total-5); i < total; i++) PAGE_SEL.add(i);
      syncInputFromPageGrid();
      updatePgridDisplay();
      S('playSortSound');
    });
  });
}

/* ══════════════════════════════════════════════════════════════════
   ADVANCED OPTIONS
═══════════════════════════════════════════════════════════════════ */
function initAdvOptions() {
  D.advToggle.addEventListener('click', function() {
    var open = !D.advBody.hasAttribute('hidden');
    if (open) {
      hideEl(D.advBody);
      D.advChevron.classList.remove('open');
      D.advToggle.setAttribute('aria-expanded', 'false');
      S('playCollapseSound');
    } else {
      showEl(D.advBody);
      D.advChevron.classList.add('open');
      D.advToggle.setAttribute('aria-expanded', 'true');
      S('playExpandSound');
    }
  });
}

/* ══════════════════════════════════════════════════════════════════
   FAQ ACCORDION
═══════════════════════════════════════════════════════════════════ */
function initFaq() {
  document.querySelectorAll('.sp-faq-q').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      var answer   = btn.nextElementSibling;
      btn.setAttribute('aria-expanded', String(!expanded));
      if (expanded) hideEl(answer);
      else          showEl(answer);
    });
  });
}

/* ══════════════════════════════════════════════════════════════════
   SIZE PRESETS & SLIDERS
═══════════════════════════════════════════════════════════════════ */
function initSizePresets() {
  document.querySelectorAll('.sp-size-preset-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var mb = parseInt(btn.dataset.mb);
      D.sizeSlider.value = Math.min(50, mb);
      D.sizeVal.textContent = mb + ' MB';
      document.querySelectorAll('.sp-size-preset-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      updateSplitPreview();
    });
  });
  D.sizeSlider.addEventListener('input', function() {
    D.sizeVal.textContent = D.sizeSlider.value + ' MB';
    document.querySelectorAll('.sp-size-preset-btn').forEach(function(b) { b.classList.remove('active'); });
    updateSplitPreview();
  });
}

function initNSlider() {
  D.nSlider.addEventListener('input', function() {
    D.nInput.value = D.nSlider.value;
    updateChunkInfo();
    updateSplitPreview();
  });
  D.nInput.addEventListener('input', function() {
    var v = Math.max(1, parseInt(D.nInput.value) || 1);
    D.nSlider.value = Math.min(50, v);
    updateChunkInfo();
    updateSplitPreview();
  });
}

function initBlankThresh() {
  D.blankThreshSlider.addEventListener('input', function() {
    D.blankThreshVal.textContent = D.blankThreshSlider.value + '%';
  });
}

/* ══════════════════════════════════════════════════════════════════
   RANGE INPUT LIVE UPDATE
═══════════════════════════════════════════════════════════════════ */
function initRangeInput() {
  var debounce = null;
  D.rangeInput.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(syncPageGridFromInput, 320);
  });
  D.copyRangeBtn.addEventListener('click', function() {
    var val = D.rangeInput.value;
    if (val) {
      navigator.clipboard.writeText(val).then(function() {
        toast('Range copied!', 'success', 1500);
        S('playCopySound');
      }).catch(function() {});
    }
  });
}

function initRangeGroupsInput() {
  var debounce = null;
  D.rangeGroupsInput.addEventListener('input', function() {
    clearTimeout(debounce);
    debounce = setTimeout(function() {
      updateGroupsPreview();
      updateSplitPreview();
    }, 300);
  });
}

/* ══════════════════════════════════════════════════════════════════
   AI RECOMMENDATION
═══════════════════════════════════════════════════════════════════ */
function initRecommendation() {
  D.recApplyBtn.addEventListener('click', function() {
    if (_recMode) {
      selectMode(_recMode);
      hideEl(D.recommendBanner);
      toast('Applied recommended mode', 'success', 2000);
      S('playPresetSound');
    }
  });
  D.recDismissBtn.addEventListener('click', function() { hideEl(D.recommendBanner); });
}

/* ══════════════════════════════════════════════════════════════════
   SPLIT ACTION
═══════════════════════════════════════════════════════════════════ */
function doSplit() {
  if (!FILE) { toast('Please upload a PDF first.', 'warning'); return; }
  if (D.splitBtn.disabled) return;

  if (MODE === 'range' && PAGE_SEL.size === 0 && !D.rangeInput.value.trim()) {
    toast('Please select at least one page.', 'warning');
    S('playWarningSound');
    D.rangeInput.focus();
    return;
  }
  if (MODE === 'range_groups' && !D.rangeGroupsInput.value.trim()) {
    toast('Please enter at least one range group.', 'warning');
    S('playWarningSound');
    D.rangeGroupsInput.focus();
    return;
  }

  if (window.SOUNDS) window.SOUNDS.resume();
  S('playMergeStartSound');
  _splitStartTime = Date.now();

  showEl(D.progressCard);
  hideEl(D.resultsCard);
  hideEl(D.actionCard);
  D.progressSteps.innerHTML = '';
  updateProgress(0, 'Preparing…');
  if (D.progressTitle) D.progressTitle.textContent = 'Starting…';

  addProgressStep('fa-check', 'Mode: ' + MODE.replace(/_/g, ' '));
  if (PDF_INFO) addProgressStep('fa-file', PDF_INFO.total_pages + ' pages · ' + fmtBytes(FILE.size));

  simProgress(85, 100);

  var fd = new FormData();
  fd.append('file',            FILE);
  fd.append('mode',            MODE);
  fd.append('password',        D.passwordInput.value || '');
  fd.append('naming',          D.namingPattern.value || 'page_{n:04d}');
  fd.append('remove_blanks',   D.removeBlanksToggle.checked ? '1' : '0');
  fd.append('source_filename', FILE.name);

  if (MODE === 'range') {
    fd.append('ranges', D.rangeInput.value || '');
  }
  if (MODE === 'range_groups') {
    var groups = D.rangeGroupsInput.value.split(/[\n,，;；]+/).map(function(l){return l.trim();}).filter(Boolean);
    fd.append('ranges', groups.join(','));
  }
  if (MODE === 'every_n')   fd.append('every_n',      D.nInput.value || '5');
  if (MODE === 'size_limit') fd.append('max_size_mb', D.sizeSlider.value || '5');
  if (MODE === 'blank_pages') {
    fd.append('blank_threshold', (parseInt(D.blankThreshSlider.value) / 100).toFixed(2));
  }

  fetch('/api/split-pdf', { method:'POST', body:fd })
    .then(function(res) {
      closeSSE();
      if (!res.ok) {
        return res.json().then(function(j) {
          throw new Error(j.error || j.message || 'Server error');
        }).catch(function() {
          throw new Error('Server error ' + res.status);
        });
      }
      updateProgress(95, 'Finalising…');
      addProgressStep('fa-file-zipper', 'Packing ZIP…');
      return res.blob().then(function(blob) {
        return { blob: blob, res: res };
      });
    })
    .then(function(obj) {
      var blob = obj.blob;
      var res  = obj.res;

      updateProgress(100, 'Done!');
      addProgressStep('fa-circle-check', 'Split complete!');

      var filesCreated = parseInt(res.headers.get('X-File-Count') || res.headers.get('X-Files-Created') || '1');
      var totalPages   = parseInt(res.headers.get('X-Total-Pages')   || (PDF_INFO ? PDF_INFO.total_pages : '?'));
      var procMs       = parseInt(res.headers.get('X-Processing-Ms') || '0');
      var qualityGrade = res.headers.get('X-Quality-Grade') || 'A+';
      var qualityScore = res.headers.get('X-Quality-Score') || '100';
      var zipName      = res.headers.get('X-Download-Name') || res.headers.get('X-Zip-Name') || _ZIP_FILENAME;

      if (_BLOB_URL) URL.revokeObjectURL(_BLOB_URL);
      _BLOB_URL = URL.createObjectURL(blob);
      _ZIP_FILENAME = zipName;

      setTimeout(function() {
        hideEl(D.progressCard);
        showEl(D.resultsCard);
        showEl(D.actionCard);
        showResults({ filesCreated:filesCreated, totalPages:totalPages, procMs:procMs, qualityGrade:qualityGrade, qualityScore:qualityScore });
        S('playSuccessChime');
        launchConfetti();
      }, 650);
    })
    .catch(function(e) {
      closeSSE();
      updateProgress(0, '');
      hideEl(D.progressCard);
      showEl(D.actionCard);
      S('playErrorSound');
      toast('Split failed: ' + (e.message || 'Please try again.'), 'error', 5500);
    });
}

function showResults(opts) {
  var filesCreated = opts.filesCreated;
  var totalPages   = opts.totalPages;
  var qualityGrade = opts.qualityGrade;
  var qualityScore = opts.qualityScore;

  D.resultsSub.textContent = filesCreated + ' file' + (filesCreated !== 1 ? 's' : '') + ' ready to download';
  D.dlName.textContent = _ZIP_FILENAME;
  D.qualityText.textContent = 'Quality: ' + qualityGrade + ' (' + qualityScore + '/100) · Lossless · streams never re-encoded';

  var elapsed = Math.round((Date.now() - _splitStartTime) / 100) / 10;
  var stats = [
    { icon:'fa-file-pdf',    text: filesCreated + ' file' + (filesCreated !== 1 ? 's' : '') + ' created' },
    { icon:'fa-file-lines',  text: totalPages + ' pages processed' },
    { icon:'fa-clock',       text: elapsed + 's elapsed' },
    { icon:'fa-shield-check',text: 'Grade ' + qualityGrade },
  ];
  D.resultsStats.innerHTML = stats.map(function(s) {
    return '<span class="sp-stat-chip" role="listitem"><i class="fa-solid ' + s.icon + '"></i>' + s.text + '</span>';
  }).join('');
}

/* ══════════════════════════════════════════════════════════════════
   DOWNLOAD — fahhhhh sound on download
═══════════════════════════════════════════════════════════════════ */
function downloadZip() {
  if (!_BLOB_URL) { toast('Nothing to download.', 'warning'); return; }
  S('playDownloadWhoosh');   /* fahhhhh.mp3 */
  var a = document.createElement('a');
  a.href     = _BLOB_URL;
  a.download = _ZIP_FILENAME;
  document.body.appendChild(a);
  a.click();
  setTimeout(function() { a.remove(); }, 100);
  toast('Downloading ' + _ZIP_FILENAME, 'success', 2500);
}

/* ══════════════════════════════════════════════════════════════════
   CONFETTI
═══════════════════════════════════════════════════════════════════ */
function launchConfetti() {
  if (typeof confetti === 'function') {
    confetti({ particleCount:140, spread:80, origin:{y:.55}, colors:['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b'] });
    setTimeout(function() {
      confetti({ particleCount:60, spread:50, origin:{y:.60}, colors:['#ec4899','#f97316','#6366f1'] });
    }, 400);
  } else {
    // CSS confetti fallback
    var colors = ['#6366f1','#8b5cf6','#06b6d4','#10b981'];
    for (var i = 0; i < 24; i++) {
      (function(i) {
        var d = document.createElement('div');
        d.style.cssText = 'position:fixed;width:7px;height:7px;border-radius:2px;left:'+(Math.random()*100)+'vw;top:-10px;background:'+colors[i%4]+';animation:confettiFall '+(0.8+Math.random()*1.2)+'s ease-in forwards;z-index:9999;pointer-events:none;';
        document.body.appendChild(d);
        setTimeout(function() { d.remove(); }, 2200);
      })(i);
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   RESET
═══════════════════════════════════════════════════════════════════ */
function resetAll() {
  FILE = null; PDF_INFO = null; PAGE_SEL.clear(); _shiftStart = null; _recMode = null;
  if (_BLOB_URL) { URL.revokeObjectURL(_BLOB_URL); _BLOB_URL = null; }
  _ZIP_FILENAME = 'document_split.zip';
  closeSSE();

  showEl(D.dropZone);
  hideEl(D.fileInfoWrap);
  D.fileInput.value = '';
  if (D.thumbsStrip) D.thumbsStrip.innerHTML = '';
  hideEl(D.thumbsWrap);
  hideEl(D.recommendBanner);
  D.chipBookmarks.classList.add('sp-chip-hidden');
  D.chipBlanks.classList.add('sp-chip-hidden');
  D.chipEncrypted.classList.add('sp-chip-hidden');
  D.chipScanned.classList.add('sp-chip-hidden');

  hideEl(D.modesCard);
  hideEl(D.optionsCard);
  hideEl(D.advCard);
  hideEl(D.actionCard);
  hideEl(D.progressCard);
  hideEl(D.resultsCard);
  hideEl(D.presetsRow);
  hideEl(D.fabBtn);
  D.splitBtn.disabled = true;
  D.actionHint.textContent = 'Upload a PDF to get started';

  D.presetsRow.querySelectorAll('.sp-preset-btn').forEach(function(b) { b.classList.remove('active'); });

  hideEl(D.advBody);
  D.advChevron.classList.remove('open');
  D.advToggle.setAttribute('aria-expanded', 'false');

  D.rangeInput.value = '';
  D.rangeInput.classList.remove('valid', 'invalid');
  if (D.rangePreview) D.rangePreview.innerHTML = '';
  D.rangeGroupsInput.value = '';
  if (D.groupsPreview) D.groupsPreview.innerHTML = '';

  MODE = 'all';

  S('playMergeAgainSound');
  toast('Reset! Upload a new PDF to split.', 'info', 2000);
}

/* ══════════════════════════════════════════════════════════════════
   MOBILE FAB
═══════════════════════════════════════════════════════════════════ */
function initFab() {
  D.fabBtn.addEventListener('click', function() {
    if (window.SOUNDS) window.SOUNDS.resume();
    if (!FILE) { D.fileInput.click(); return; }
    doSplit();
  });
}

/* ══════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════════════ */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', function(e) {
    var tag = document.activeElement ? document.activeElement.tagName : '';
    var inInput = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT');
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      if (FILE && !D.splitBtn.disabled) { if (window.SOUNDS) window.SOUNDS.resume(); doSplit(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'a' && MODE === 'range' && !inInput) {
      e.preventDefault();
      var total = PDF_INFO ? PDF_INFO.total_pages : 0;
      PAGE_SEL.clear();
      for (var i = 0; i < total; i++) PAGE_SEL.add(i);
      syncInputFromPageGrid();
      updatePgridDisplay();
    }
  });
}

/* ══════════════════════════════════════════════════════════════════
   DOMContentLoaded — ALL DOM REFS + EVENTS HERE
═══════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {

  D = {
    uploadCard:        document.getElementById('uploadCard'),
    dropZone:          document.getElementById('dropZone'),
    browseBtn:         document.getElementById('browseBtn'),
    fileInput:         document.getElementById('fileInput'),
    fileInfoWrap:      document.getElementById('fileInfoWrap'),
    fileName:          document.getElementById('fileName'),
    chipSize:          document.getElementById('chipSize'),
    chipPages:         document.getElementById('chipPages'),
    chipBookmarks:     document.getElementById('chipBookmarks'),
    chipBlanks:        document.getElementById('chipBlanks'),
    chipEncrypted:     document.getElementById('chipEncrypted'),
    chipScanned:       document.getElementById('chipScanned'),
    removeBtn:         document.getElementById('removeBtn'),
    thumbsWrap:        document.getElementById('thumbsWrap'),
    thumbsStrip:       document.getElementById('thumbsStrip'),
    thumbsCount:       document.getElementById('thumbsCount'),
    recommendBanner:   document.getElementById('recommendBanner'),
    recommendText:     document.getElementById('recommendText'),
    recApplyBtn:       document.getElementById('recApplyBtn'),
    recDismissBtn:     document.getElementById('recDismissBtn'),

    modesCard:         document.getElementById('modesCard'),
    modesGrid:         document.getElementById('modesGrid'),
    modeDesc:          document.getElementById('modeDesc'),
    presetsRow:        document.getElementById('presetsRow'),

    optionsCard:       document.getElementById('optionsCard'),
    rangeInput:        document.getElementById('rangeInput'),
    rangePreview:      document.getElementById('rangePreview'),
    copyRangeBtn:      document.getElementById('copyRangeBtn'),
    pgrid:             document.getElementById('pgrid'),
    pgridSelCount:     document.getElementById('pgridSelCount'),
    rangeGroupsInput:  document.getElementById('rangeGroupsInput'),
    groupsPreview:     document.getElementById('groupsPreview'),
    nSlider:           document.getElementById('nSlider'),
    nInput:            document.getElementById('nInput'),
    chunkCount:        document.getElementById('chunkCount'),
    bookmarkList:      document.getElementById('bookmarkList'),
    bookmarksInfoText: document.getElementById('bookmarksInfoText'),
    blankCountInfo:    document.getElementById('blankCountInfo'),
    blankThreshSlider: document.getElementById('blankThreshSlider'),
    blankThreshVal:    document.getElementById('blankThreshVal'),
    sizeSlider:        document.getElementById('sizeSlider'),
    sizeVal:           document.getElementById('sizeVal'),
    splitPreviewBox:   document.getElementById('splitPreviewBox'),
    splitPreviewText:  document.getElementById('splitPreviewText'),

    advCard:           document.getElementById('advCard'),
    advToggle:         document.getElementById('advToggle'),
    advBody:           document.getElementById('advBody'),
    advChevron:        document.getElementById('advChevron'),
    passwordInput:     document.getElementById('passwordInput'),
    namingPattern:     document.getElementById('namingPattern'),
    removeBlanksToggle:document.getElementById('removeBlanksToggle'),

    actionCard:        document.getElementById('actionCard'),
    splitBtn:          document.getElementById('splitBtn'),
    actionHint:        document.getElementById('actionHint'),

    progressCard:      document.getElementById('progressCard'),
    progressBar:       document.getElementById('progressBar'),
    progressPct:       document.getElementById('progressPct'),
    progressTitle:     document.getElementById('progressTitle'),
    progressSub:       document.getElementById('progressSub'),
    progressSteps:     document.getElementById('progressSteps'),

    resultsCard:       document.getElementById('resultsCard'),
    resultsSub:        document.getElementById('resultsSub'),
    resultsStats:      document.getElementById('resultsStats'),
    downloadBtn:       document.getElementById('downloadBtn'),
    dlName:            document.getElementById('dlName'),
    qualityText:       document.getElementById('qualityText'),

    soundBtn:          document.getElementById('soundBtn'),
    soundIcon:         document.getElementById('soundIcon'),
    themeBtn:          document.getElementById('themeBtn'),
    themeIcon:         document.getElementById('themeIcon'),

    fabBtn:            document.getElementById('fabBtn'),
    splitAgainBtn:     document.getElementById('splitAgainBtn'),
  };

  // Initialise all subsystems
  initTheme();
  initSoundToggle();
  initBgCanvas();
  injectSvgDefs();
  initUpload();
  initModeCards();
  initFaq();
  initQsButtons();
  initAdvOptions();
  initRangeInput();
  initRangeGroupsInput();
  initNSlider();
  initBlankThresh();
  initSizePresets();
  initRecommendation();
  initFab();
  initKeyboardShortcuts();

  // Wire nav events
  D.themeBtn.addEventListener('click', toggleTheme);
  D.soundBtn.addEventListener('click', toggleSound);

  // Wire split button
  D.splitBtn.addEventListener('click', function() {
    if (window.SOUNDS) window.SOUNDS.resume();
    doSplit();
  });

  // Wire download button — fahhhhh.mp3 via playDownloadWhoosh
  D.downloadBtn.addEventListener('click', downloadZip);

  // Wire split again button
  D.splitAgainBtn.addEventListener('click', resetAll);

  // Wire presets
  D.presetsRow.querySelectorAll('.sp-preset-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { applyPreset(btn.dataset.preset); });
  });

  // Preload sounds
  if (window.SOUNDS && window.SOUNDS.preload) {
    setTimeout(function() { window.SOUNDS.preload(); }, 500);
  }

  // Initial state: hide all tool sections except upload card
  selectMode('all');
  hideEl(D.modesCard);
  hideEl(D.optionsCard);
  hideEl(D.advCard);
  hideEl(D.actionCard);
  hideEl(D.splitPreviewBox);

  // Confetti CSS keyframe fallback
  var styleEl = document.createElement('style');
  styleEl.textContent = '@keyframes confettiFall{from{transform:translateY(-10px) rotate(0deg);opacity:1}to{transform:translateY(100vh) rotate(720deg);opacity:0}}';
  document.head.appendChild(styleEl);
});
