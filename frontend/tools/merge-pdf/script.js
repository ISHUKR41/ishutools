/**
 * IshuTools.fun — Merge PDF v8.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Libraries: Sortable.js, GSAP + ScrollTrigger, anime.js, canvas-confetti
 */
'use strict';

/* ════════ CONSTANTS ════════ */
const MAX_FILES = 50;
const MAX_BYTES = 1024 * 1024 * 1024;
const IMG_EXT   = new Set(['.jpg','.jpeg','.png','.webp','.gif','.bmp','.tiff','.tif']);
const PDF_EXT   = new Set(['.pdf']);
const CIRC      = 2 * Math.PI * 44;
const PRESETS   = {
  quick:   { tip:'Fastest merge — bookmarks on, no extras.',          bm:true,  toc:false, sep:false, comp:false, dd:false },
  report:  { tip:'Professional doc — TOC + separator pages.',         bm:true,  toc:true,  sep:true,  comp:false, dd:false },
  compact: { tip:'Smallest file — compress + skip duplicate pages.',  bm:false, toc:false, sep:false, comp:true,  dd:true  },
  archive: { tip:'Maximum quality — all features enabled.',           bm:true,  toc:true,  sep:true,  comp:true,  dd:false },
};

/* ════════ STATE ════════ */
const FILES    = [];
let _dlUrl     = null;
let _dlName    = '';
let _dlBlob    = null;
let _undoStack = [];
let _undoTimer = null;
let _sortMode  = 'order';
let _jobId     = null;
let _sse       = null;
let _simTimer  = null;
let _mergeSt   = 0;
let _sortable  = null;
let _sizeChart = null;
let _typedInst = null;

/* ════════ DOM helper ════════ */
const $ = id => document.getElementById(id);

/* D is populated in DOMContentLoaded */
let D = null;

/* ════════ UTILS ════════ */
function fmtSize(b) {
  if (!b || b < 0) return '—';
  if (b < 1024)    return b + ' B';
  if (b < 1 << 20) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1 << 30) return (b / (1 << 20)).toFixed(2) + ' MB';
  return (b / (1 << 30)).toFixed(2) + ' GB';
}
function fileExt(n)   { return (n.match(/\.[^.]+$/) || [''])[0].toLowerCase(); }
function isImg(n)     { return IMG_EXT.has(fileExt(n)); }
function genId()      { return Math.random().toString(36).slice(2, 10); }
function clamp(v,a,b) { return Math.max(a, Math.min(b, v)); }
function fileStem(f)  { return f.name.replace(/\.[^.]+$/, ''); }

/* ════════ TOAST ════════ */
let _toastT = null;
function toast(msg, type = 'info', dur = 3400) {
  if (!D) return;
  const ic = {
    success:'fa-circle-check', error:'fa-circle-xmark',
    warn:'fa-triangle-exclamation', info:'fa-circle-info'
  }[type] || 'fa-circle-info';
  D.toast.innerHTML = `<i class="fas ${ic}"></i>${msg}`;
  D.toast.className = `toast show ${type}`;
  clearTimeout(_toastT);
  _toastT = setTimeout(() => { D.toast.className = 'toast'; }, dur);
}

/* ════════ UNDO ════════ */
function pushUndo(entry, idx) {
  _undoStack.unshift({ entry, idx });
  if (_undoStack.length > 5) _undoStack.pop();
  D.undoName.textContent = entry.name.length > 32
    ? entry.name.slice(0, 30) + '…' : entry.name;
  D.undoBar.classList.add('show');
  clearTimeout(_undoTimer);
  _undoTimer = setTimeout(() => D.undoBar.classList.remove('show'), 5500);
}

/* ════════ ADD FILES ════════ */
function addFiles(fileList) {
  let added = 0, skipped = 0, bigFile = false;
  for (const f of Array.from(fileList)) {
    if (FILES.length >= MAX_FILES) {
      toast(`Maximum ${MAX_FILES} files reached`, 'warn'); break;
    }
    if (f.size > MAX_BYTES) {
      toast(`"${f.name}" is too large (max 1 GB)`, 'error'); continue;
    }
    const ex = fileExt(f.name);
    if (!IMG_EXT.has(ex) && !PDF_EXT.has(ex)) {
      toast(`Unsupported: ${ex || 'unknown file'}`, 'warn'); continue;
    }
    if (FILES.some(e => e.file.name === f.name && e.file.size === f.size)) {
      skipped++; continue;
    }
    const entry = {
      id: genId(), file: f, name: f.name, size: f.size,
      pages: null, enc: false, pwd: '', range: '', displayName: '',
      imgConverted: isImg(f.name), thumb: null,
    };
    FILES.push(entry);
    added++;
    if (f.size > 80 * 1024 * 1024) bigFile = true;
    window.SOUNDS?.playFileAddSound?.();
    if (entry.imgConverted) genImgThumb(entry);
    else readPdfMeta(entry);
  }
  if (skipped > 0) toast(`${skipped} duplicate${skipped > 1 ? 's' : ''} skipped`, 'info', 2200);
  if (bigFile) window.SOUNDS?.playWarningSound?.();
  if (added > 0) {
    showSection('files');
    rebuildList();
    updateStats();
    setTimeout(() => D.sFi?.scrollIntoView({ behavior:'smooth', block:'nearest' }), 120);
  }
  return added;
}

/* ════════ PDF META / THUMB ════════ */
async function readPdfMeta(entry) {
  if (typeof pdfjsLib === 'undefined') return;
  try {
    const buf = await entry.file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buf),
      password: entry.pwd || '',
    }).promise;
    entry.pages = pdf.numPages;
    const pg1 = await pdf.getPage(1);
    const vp  = pg1.getViewport({ scale: .72 });
    const cv  = document.createElement('canvas');
    cv.width = vp.width; cv.height = vp.height;
    await pg1.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    entry.thumb = cv.toDataURL('image/jpeg', .76);
    refreshCard(entry); updateStats(); updatePreviewStrip();
  } catch (err) {
    const isPass = err?.name === 'PasswordException' ||
      String(err).toLowerCase().includes('password');
    if (isPass) entry.enc = true;
    refreshCard(entry);
  }
}

async function genImgThumb(entry) {
  try {
    const url = URL.createObjectURL(entry.file);
    await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const s  = 120 / Math.max(img.naturalWidth, img.naturalHeight, 120);
        const cv = document.createElement('canvas');
        cv.width  = img.naturalWidth  * s;
        cv.height = img.naturalHeight * s;
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        entry.thumb = cv.toDataURL('image/jpeg', .76);
        URL.revokeObjectURL(url);
        refreshCard(entry); updatePreviewStrip(); res();
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(); };
      img.src = url;
    });
  } catch (_) {}
}

/* ════════ OUTPUT FILENAME ════════ */
function smartName() {
  const manual = (D?.optFilename?.value || '').trim();
  if (manual) return manual.replace(/\.pdf$/i, '').trim() + '.pdf';
  if (FILES.length > 0) return fileStem(FILES[0].file) + '_merged.pdf';
  return 'merged.pdf';
}

/* ════════ MERGE PREVIEW STRIP ════════ */
function updatePreviewStrip() {
  if (!D?.mpStrip || !D?.mergePreview) return;
  if (FILES.length < 2) { D.mergePreview.hidden = true; return; }

  D.mergePreview.hidden = false;
  const frag = document.createDocumentFragment();
  FILES.forEach((e, i) => {
    if (i > 0) {
      const arr = document.createElement('span');
      arr.className = 'mp-arrow';
      arr.innerHTML = '<i class="fas fa-chevron-right"></i>';
      frag.appendChild(arr);
    }
    const item = document.createElement('div');
    item.className = `mp-item ${e.imgConverted ? 'mp-img' : 'mp-pdf'}`;
    item.title = e.name;
    if (e.thumb) {
      item.innerHTML = `<img src="${e.thumb}" alt="" loading="lazy"/>`;
    } else {
      const ico = e.imgConverted ? 'fa-image' : 'fa-file-pdf';
      item.innerHTML = `<i class="fas ${ico}"></i>`;
    }
    frag.appendChild(item);
  });
  D.mpStrip.innerHTML = '';
  D.mpStrip.appendChild(frag);
}

/* ════════ CARD BUILD ════════ */
function buildCard(entry, idx) {
  const div = document.createElement('div');
  div.className = `fc entering ${entry.imgConverted ? 'is-img' : 'is-pdf'}`;
  div.dataset.id = entry.id;
  div.setAttribute('role', 'listitem');
  div.setAttribute('tabindex', '0');
  div.setAttribute('aria-label', entry.name);

  let thumbHtml = '';
  if (entry.thumb) {
    thumbHtml = `<img src="${entry.thumb}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:5px" loading="lazy"/>`;
  } else {
    const cls = entry.imgConverted ? 'img' : 'pdf';
    const ico = entry.imgConverted ? 'fa-image' : 'fa-file-pdf';
    const lbl = entry.imgConverted
      ? (fileExt(entry.name).slice(1).toUpperCase() || 'IMG') : 'PDF';
    thumbHtml = `<div class="fc-th-inner ${cls}"><i class="fas ${ico}"></i><span>${lbl}</span></div>`;
    if (!entry.enc) thumbHtml += `<div class="fc-spin"></div>`;
  }

  let pills = `<span class="fp"><i class="fas fa-database"></i>${fmtSize(entry.size)}</span>`;
  if (entry.pages !== null)  pills += `<span class="fp"><i class="fas fa-book-open"></i>${entry.pages}p</span>`;
  if (entry.enc)             pills += `<span class="fp enc"><i class="fas fa-lock"></i>Locked</span>`;
  if (entry.imgConverted)    pills += `<span class="fp" style="color:var(--wrn);border-color:rgba(245,158,11,.22)"><i class="fas fa-image"></i>→PDF</span>`;
  if (entry.pages !== null && !entry.enc)
    pills += `<span class="fp ok"><i class="fas fa-circle-check"></i>Ready</span>`;

  const rangeHtml = entry.imgConverted
    ? `<div class="img-note"><i class="fas fa-info-circle"></i> Image auto-converted to PDF at full quality.</div>`
    : `<div class="fc-field"><label><i class="fas fa-list-ol"></i>Page Range</label>
       <input type="text" class="fc-range-inp"
         placeholder="all / 1-3,5 / odd / even / first 2 / last 3"
         value="${entry.range || ''}" autocomplete="off"/>
       <div class="range-btns">
         <button class="rb" data-r="all">All</button>
         <button class="rb" data-r="odd">Odd</button>
         <button class="rb" data-r="even">Even</button>
         <button class="rb" data-r="first">First</button>
         <button class="rb" data-r="last">Last</button>
       </div></div>`;

  const pwdHtml = entry.enc
    ? `<div class="fc-field"><label><i class="fas fa-lock"></i>Password</label>
       <input type="password" class="fc-pwd-inp"
         placeholder="Enter PDF password" value="${entry.pwd || ''}"
         autocomplete="new-password"/></div>`
    : '';

  div.innerHTML = `
    <div class="fc-handle" title="Drag to reorder" aria-hidden="true"><i class="fas fa-grip-vertical"></i></div>
    <div class="fc-thumb" title="Preview file">
      <div class="fc-eye"><i class="fas fa-eye"></i></div>${thumbHtml}
    </div>
    <div class="fc-info">
      <div class="fc-name" title="${entry.name}">${entry.displayName || entry.name}</div>
      <div class="fc-pills">${pills}</div>
      <div class="fc-expand">
        <div class="fc-row">
          ${rangeHtml}${pwdHtml}
          <div class="fc-field"><label><i class="fas fa-tag"></i>Display Name <small>(TOC)</small></label>
          <input type="text" class="fc-dname-inp"
            placeholder="Name in TOC / separator"
            value="${entry.displayName || ''}" autocomplete="off"/></div>
        </div>
      </div>
    </div>
    <div class="fc-acts">
      <span class="fc-num" aria-label="File ${idx + 1}">${idx + 1}</span>
      <div class="fc-btns">
        <button class="fc-btn exp" title="Options"><i class="fas fa-sliders"></i></button>
        <button class="fc-btn del" title="Remove file"><i class="fas fa-trash"></i></button>
      </div>
    </div>
    <div class="swipe-reveal" aria-hidden="true"><i class="fas fa-trash-alt"></i>Remove</div>`;

  /* Preview */
  div.querySelector('.fc-thumb').addEventListener('click', () => openPreview(entry));

  /* Expand/collapse */
  div.querySelector('.fc-btn.exp').addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = div.classList.toggle('open');
    div.querySelector('.fc-btn.exp i').className = isOpen ? 'fas fa-chevron-up' : 'fas fa-sliders';
    window.SOUNDS?.[isOpen ? 'playExpandSound' : 'playCollapseSound']?.();
  });

  /* Delete */
  div.querySelector('.fc-btn.del').addEventListener('click', e => {
    e.stopPropagation(); removeFile(entry.id);
  });

  /* Range quick buttons */
  div.querySelectorAll('.rb').forEach(btn => {
    if (btn.dataset.r === (entry.range || 'all')) btn.classList.add('on');
    btn.addEventListener('click', () => {
      const ri = div.querySelector('.fc-range-inp'); if (!ri) return;
      entry.range = ri.value = btn.dataset.r;
      div.querySelectorAll('.rb').forEach(b => b.classList.toggle('on', b.dataset.r === entry.range));
    });
  });

  /* Range input */
  const ri = div.querySelector('.fc-range-inp');
  if (ri) ri.addEventListener('input', () => {
    entry.range = ri.value.trim();
    div.querySelectorAll('.rb').forEach(b => b.classList.toggle('on', b.dataset.r === entry.range));
  });

  /* Password */
  const pi = div.querySelector('.fc-pwd-inp');
  if (pi) pi.addEventListener('input', () => { entry.pwd = pi.value; });

  /* Display name */
  const di = div.querySelector('.fc-dname-inp');
  if (di) di.addEventListener('input', () => {
    entry.displayName = di.value.trim();
    div.querySelector('.fc-name').textContent = entry.displayName || entry.name;
  });

  /* Keyboard reorder + delete */
  div.addEventListener('keydown', e => {
    const i = FILES.findIndex(x => x.id === entry.id);
    if (e.altKey && e.key === 'ArrowUp' && i > 0) {
      e.preventDefault();
      [FILES[i], FILES[i-1]] = [FILES[i-1], FILES[i]];
      rebuildList(); updateStats(); updatePreviewStrip();
      window.SOUNDS?.playSortSound?.();
      setTimeout(() => D.fList.querySelectorAll('.fc')[i-1]?.focus(), 40);
    } else if (e.altKey && e.key === 'ArrowDown' && i < FILES.length - 1) {
      e.preventDefault();
      [FILES[i], FILES[i+1]] = [FILES[i+1], FILES[i]];
      rebuildList(); updateStats(); updatePreviewStrip();
      window.SOUNDS?.playSortSound?.();
      setTimeout(() => D.fList.querySelectorAll('.fc')[i+1]?.focus(), 40);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement === div) {
      e.preventDefault(); removeFile(entry.id);
    }
  });

  /* Mobile swipe */
  addSwipe(div, entry.id);
  return div;
}

function refreshCard(entry) {
  const old = D?.fList?.querySelector(`[data-id="${entry.id}"]`);
  if (!old) return;
  const idx  = FILES.findIndex(x => x.id === entry.id);
  const wasOpen = old.classList.contains('open');
  const nu = buildCard(entry, idx);
  nu.classList.remove('entering');
  if (wasOpen) nu.classList.add('open');
  old.replaceWith(nu);
}

function rebuildList() {
  const frag = document.createDocumentFragment();
  FILES.forEach((e, i) => frag.appendChild(buildCard(e, i)));
  D.fList.innerHTML = '';
  D.fList.appendChild(frag);
  D.fileBadge.textContent = `${FILES.length} file${FILES.length !== 1 ? 's' : ''}`;
  initSortable();
  updateMergeBtn();
  updatePreviewStrip();
}

/* ════════ SORTABLE ════════ */
function initSortable() {
  if (_sortable) { try { _sortable.destroy(); } catch (_) {} _sortable = null; }
  if (typeof Sortable === 'undefined') return;
  _sortable = Sortable.create(D.fList, {
    handle:      '.fc-handle',
    animation:   220,
    ghostClass:  'sortable-ghost',
    chosenClass: 'sortable-chosen',
    easing:      'cubic-bezier(.34,1.56,.64,1)',
    onStart: ()  => window.SOUNDS?.playDragStartSound?.(),
    onEnd: ev => {
      if (ev.oldIndex === ev.newIndex) return;
      window.SOUNDS?.playDragDropSound?.();
      const reordered = [];
      D.fList.querySelectorAll('.fc[data-id]').forEach(c => {
        const e = FILES.find(x => x.id === c.dataset.id);
        if (e) reordered.push(e);
      });
      FILES.length = 0; FILES.push(...reordered);
      D.fList.querySelectorAll('.fc-num').forEach((el, i) => el.textContent = i + 1);
      updateStats(); updatePreviewStrip(); _sortMode = 'order';
      document.querySelectorAll('.sb').forEach(b =>
        b.classList.toggle('active', b.dataset.sort === 'order'));
    },
  });
}

/* ════════ MOBILE SWIPE ════════ */
function addSwipe(card, id) {
  const reveal = card.querySelector('.swipe-reveal');
  if (!reveal) return;
  let x0 = 0, dx = 0, swiping = false;
  const mq = window.matchMedia('(hover:none)');
  if (!mq.matches) return;

  card.addEventListener('touchstart', e => {
    x0 = e.touches[0].clientX; dx = 0; swiping = true;
  }, { passive: true });

  card.addEventListener('touchmove', e => {
    if (!swiping) return;
    dx = e.touches[0].clientX - x0;
    if (dx < -4) {
      e.preventDefault();
      const off = Math.min(-dx, 80);
      card.style.transform = `translateX(${-off}px)`;
      reveal.style.opacity = String(Math.min(1, off / 70));
    }
  }, { passive: false });

  card.addEventListener('touchend', () => {
    swiping = false;
    if (dx < -120) {
      card.style.transform = 'translateX(-100%)';
      card.style.opacity = '0';
      setTimeout(() => removeFile(id), 220);
    } else {
      card.style.transform = '';
      reveal.style.opacity = '0';
    }
    dx = 0;
  });
}

/* ════════ REMOVE FILE ════════ */
function removeFile(id) {
  const idx = FILES.findIndex(x => x.id === id); if (idx === -1) return;
  const [entry] = FILES.splice(idx, 1);
  pushUndo(entry, idx);
  window.SOUNDS?.playFileRemoveSound?.();
  const card = D.fList.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.style.cssText =
      'opacity:0;transform:translateX(16px) scale(.93);pointer-events:none;transition:.22s ease';
    setTimeout(() => card.remove(), 230);
  }
  updateStats(); updatePreviewStrip();
  D.fileBadge.textContent = `${FILES.length} file${FILES.length !== 1 ? 's' : ''}`;
  if (FILES.length === 0) showSection('upload');
  else updateMergeBtn();
}

/* ════════ STATS ════════ */
function updateStats() {
  if (!D) return;
  const tp = FILES.reduce((a, f) => a + (f.pages || 0), 0);
  D.stPages.textContent = tp > 0 ? tp : '—';
  D.stPages.classList.toggle('hi', tp > 0);
  const ts = FILES.reduce((a, f) => a + f.size, 0);
  D.stSize.textContent  = ts > 0 ? fmtSize(ts) : '—';
  const est = (ts / 1024 / 1024) * 0.38 + FILES.length * 0.28;
  D.stEst.textContent   = FILES.length > 0
    ? (est < 60 ? `~${Math.max(1, Math.round(est))}s` : `~${Math.round(est / 60)}m`) : '—';
  const big = FILES.filter(f => f.size > 100 * 1024 * 1024);
  D.largeBanner.hidden  = big.length === 0;
  if (big.length > 0)
    D.largeBanner.innerHTML =
      `<i class="fas fa-triangle-exclamation"></i> ${big.length} large file${big.length > 1 ? 's' : ''} detected — merge may take a moment`;
  updateMergeBtn();
}

function updateMergeBtn() {
  if (!D) return;
  const can = FILES.length >= 2;
  D.mergeBtn.disabled = !can;
  D.mergeBtn.classList.toggle('ready', can);
  D.mCount.textContent   = can ? `${FILES.length} files` : '';
  D.mCount.style.display = can ? '' : 'none';
}

/* ════════ SECTIONS ════════ */
function showSection(which) {
  if (!D) return;
  D.sUp.hidden = which !== 'upload';
  D.sFi.hidden = which !== 'files';
  D.sPr.hidden = which !== 'progress';
  D.sRe.hidden = which !== 'result';
  if (which === 'progress') resetProgress();
  if (which === 'upload' || which === 'files') {
    if (_sizeChart) { _sizeChart.destroy(); _sizeChart = null; }
    const cw = $('chartWrap'); if (cw) cw.hidden = true;
  }
}

/* ════════ PROGRESS ════════ */
function resetProgress() {
  setProg(0, 'Preparing…', 'Initializing merge engine');
  [D.ps1, D.ps2, D.ps3, D.ps4].forEach(s => s.classList.remove('active', 'done'));
  D.ps1.classList.add('active');
  if (D.progFileInfo) D.progFileInfo.textContent = '';
}

function setProg(pct, title, sub) {
  pct = clamp(pct, 0, 100);
  if (D.ring) D.ring.style.strokeDashoffset = CIRC - CIRC * pct / 100;
  if (D.pbar) D.pbar.style.width = pct + '%';
  if (D.pbarWrap) D.pbarWrap.setAttribute('aria-valuenow', pct);
  if (D.ringPct) D.ringPct.textContent = Math.round(pct) + '%';
  if (title && D.progTitle) D.progTitle.textContent = title;
  if (sub   && D.progSub)   D.progSub.textContent   = sub;
}

function stepProg(n) {
  [D.ps1, D.ps2, D.ps3, D.ps4].forEach((s, i) => {
    s.classList.toggle('done',   i < n);
    s.classList.toggle('active', i === n);
    if (i > n) s.classList.remove('active', 'done');
  });
}

/* ════════ MERGE ════════ */
async function startMerge() {
  if (FILES.length < 2) { toast('Add at least 2 files to merge', 'warn'); return; }
  window.SOUNDS?.resume?.();
  D.mergeBtn.disabled = true;
  D.mergeBtn.classList.remove('ready');
  _mergeSt = Date.now();
  window.SOUNDS?.playMergeStartSound?.();
  showSection('progress');
  $('secProgress')?.scrollIntoView({ behavior:'smooth', block:'center' });

  const fd = new FormData();
  FILES.forEach(e => fd.append('files', e.file, e.name));
  fd.append('page_ranges',         JSON.stringify(FILES.map(e => e.range || 'all')));
  fd.append('passwords',           JSON.stringify(FILES.map(e => e.pwd || '')));
  fd.append('display_names',       JSON.stringify(FILES.map(e => e.displayName || '')));
  fd.append('file_types',          JSON.stringify(FILES.map(e => e.imgConverted ? 'img' : 'pdf')));
  fd.append('add_toc',             String(D.optToc.checked));
  fd.append('add_separators',      String(D.optSep.checked));
  fd.append('preserve_bookmarks',  String(D.optBookmarks.checked));
  fd.append('compress_output',     String(D.optCompress.checked));
  fd.append('skip_duplicates',     String(D.optDedup.checked));
  fd.append('normalize_page_size', String(D.optNorm.checked));
  fd.append('target_page_size',    D.optTargetSize.value);
  fd.append('merge_method',        D.optMethod.value);
  fd.append('output_title',        (D.optTitle.value || '').trim());
  fd.append('output_author',       (D.optAuthor.value || '').trim());
  fd.append('output_filename',     smartName());
  _jobId = genId();
  fd.append('job_id', _jobId);

  openSSE(_jobId);
  stepProg(0);
  setProg(5, 'Uploading…', `Sending ${FILES.length} file${FILES.length > 1 ? 's' : ''}`);

  try {
    const resp = await fetch('/api/merge-pdf', { method:'POST', body:fd });
    closeSSE();
    if (!resp.ok) {
      let msg = `Server error (${resp.status})`;
      try { const j = await resp.json(); msg = j.error || msg; } catch (_) {}
      throw new Error(msg);
    }
    const totalPages  = parseInt(resp.headers.get('X-Total-Pages')  || '0') || 0;
    const srcCount    = parseInt(resp.headers.get('X-Source-Count')  || '0') || FILES.length;
    const methodUsed  = resp.headers.get('X-Method-Used')            || 'pypdf';
    const outputSize  = parseInt(resp.headers.get('X-Output-Size')   || '0') || 0;
    const skippedDups = parseInt(resp.headers.get('X-Skipped-Dupes') || '0') || 0;

    _dlBlob = await resp.blob();
    if (_dlUrl) URL.revokeObjectURL(_dlUrl);
    _dlUrl  = URL.createObjectURL(_dlBlob);
    _dlName = smartName();

    setProg(100, 'Done!', 'Merge complete — ready to download');
    stepProg(3);
    await new Promise(r => setTimeout(r, 350));
    showResult(totalPages, srcCount, methodUsed, outputSize, skippedDups, _dlBlob.size);
  } catch (err) {
    closeSSE();
    window.SOUNDS?.playErrorSound?.();
    const msg = err.message || 'Merge failed — check your files and try again';
    toast(msg, 'error', 9000);
    showSection('files');
    D.mergeBtn.disabled = FILES.length < 2;
    D.mergeBtn.classList.toggle('ready', FILES.length >= 2);
  }
}

/* ════════ SSE ════════ */
function openSSE(jobId) {
  simProgress();
  try {
    _sse = new EventSource(`/api/merge-pdf/progress/${jobId}`);
    _sse.onmessage = e => {
      try {
        const d = JSON.parse(e.data);
        if (d.ping || d.done) return;
        const pct = typeof d.pct === 'number' ? d.pct : 0;
        const cur = parseFloat(D.pbar?.style.width || '0');
        if (pct > cur) {
          setProg(pct, d.title || undefined, d.sub || undefined);
          stepProg(pct < 20 ? 0 : pct < 58 ? 1 : pct < 85 ? 2 : 3);
          window.SOUNDS?.playProgressTick?.();
          if (d.sub && D.progFileInfo) D.progFileInfo.textContent = d.sub;
        }
      } catch (_) {}
    };
    _sse.onerror = () => closeSSE();
  } catch (_) {}
}

function closeSSE() {
  if (_sse) { _sse.close(); _sse = null; }
  clearInterval(_simTimer);
}

function simProgress() {
  let pct = 8; clearInterval(_simTimer);
  const steps = [
    { at: 15, t:'Reading files…',   s:'Parsing PDF structure' },
    { at: 30, t:'Processing…',      s:'Merging pages' },
    { at: 55, t:'Optimizing…',      s:'Rebuilding structure' },
    { at: 75, t:'Finalizing…',      s:'Writing output PDF' },
  ];
  let si = 0;
  _simTimer = setInterval(() => {
    const cur = parseFloat(D.pbar?.style.width || '0');
    if (cur < pct && pct < 84) {
      const st = si < steps.length && pct >= steps[si].at ? steps[si++] : null;
      setProg(pct, st?.t, st?.s);
      stepProg(pct < 22 ? 0 : pct < 58 ? 1 : 2);
    }
    pct = Math.min(pct + (Math.random() * 3.2 + 0.4), 84);
    if (pct >= 84) clearInterval(_simTimer);
  }, 420);
}

/* ════════ RESULT ════════ */
function showResult(totalPages, srcCount, methodUsed, outputSize, skippedDups, blobSize) {
  window.SOUNDS?.playSuccessChime?.();
  showSection('result');
  $('secResult')?.scrollIntoView({ behavior:'smooth', block:'start' });

  const elapsed = ((Date.now() - _mergeSt) / 1000).toFixed(1) + 's';
  const totalIn = FILES.reduce((a, f) => a + f.size, 0);
  const sz      = outputSize || blobSize;
  const chg     = totalIn > 0 ? ((sz - totalIn) / totalIn * 100) : 0;

  const box = document.querySelector('.res-box');
  if (box) {
    box.classList.add('ready');
    setTimeout(() => {
      // Canvas-confetti celebration
      if (typeof confetti !== 'undefined') {
        confetti({ particleCount: 130, spread: 72, origin: { y: 0.55 },
          colors: ['#6366f1', '#8b5cf6', '#a78bfa', '#22c55e', '#ffffff', '#f59e0b'] });
        setTimeout(() => confetti({ particleCount: 60, spread: 48, origin: { x:0.1, y: 0.6 },
          colors: ['#6366f1','#8b5cf6','#22c55e'] }), 280);
        setTimeout(() => confetti({ particleCount: 60, spread: 48, origin: { x:0.9, y: 0.6 },
          colors: ['#6366f1','#a78bfa','#ffffff'] }), 450);
      }
    }, 900);
  }

  // Animate 3 stats in with anime.js
  const animateVal = (el, target, suffix = '') => {
    if (typeof anime !== 'undefined' && typeof target === 'number') {
      const obj = { val: 0 };
      anime({ targets: obj, val: target, duration: 900, easing:'easeOutExpo',
        update: () => { el.textContent = Math.round(obj.val) + suffix; } });
    } else {
      el.textContent = target + suffix;
    }
  };

  animateVal($('rFiles'), srcCount);
  animateVal($('rPages'), totalPages);
  $('rSize').textContent = fmtSize(sz);

  // Meta row
  $('rTime').innerHTML = `<i class="fas fa-stopwatch"></i>${elapsed}`;
  $('rEngine').innerHTML = `<i class="fas fa-cogs"></i>${methodUsed}`;
  const chgStr = chg > 0
    ? `+${chg.toFixed(1)}% larger`
    : chg < -1 ? `${Math.abs(chg).toFixed(1)}% smaller`
    : 'Same size';
  $('rSaved').innerHTML = `<i class="fas fa-scale-balanced"></i>${chgStr}`;

  // Filename display
  const fn = $('resFn'), fnTx = $('resFnTx');
  if (fn && fnTx) { fnTx.textContent = _dlName; fn.hidden = false; }

  // Skipped dupes
  const rDupes = $('rDupes');
  if (rDupes && skippedDups > 0) {
    rDupes.innerHTML = `<i class="fas fa-clone"></i>${skippedDups} duplicate${skippedDups > 1 ? 's' : ''} skipped`;
    rDupes.hidden = false;
  }

  // Chart.js — before / after size comparison
  const inputSzCh = FILES.reduce((a,f) => a + f.size, 0);
  const outSzCh   = outputSize || blobSize;
  const ctxEl = $('sizeChart'), cw = $('chartWrap');
  if (ctxEl && cw && typeof Chart !== 'undefined') {
    if (_sizeChart) { _sizeChart.destroy(); _sizeChart = null; }
    const isDark    = document.documentElement.dataset.theme !== 'light';
    const tickColor = isDark ? '#64748b' : '#94a3b8';
    const gridColor = isDark ? 'rgba(99,102,241,.07)' : 'rgba(99,102,241,.05)';
    const smaller   = outSzCh <= inputSzCh;
    _sizeChart = new Chart(ctxEl, {
      type: 'bar',
      data: {
        labels: [`Input (${FILES.length} file${FILES.length > 1 ? 's' : ''})`, 'Merged Output'],
        datasets: [{
          data: [inputSzCh, outSzCh],
          backgroundColor: ['rgba(99,102,241,.32)', smaller ? 'rgba(34,197,94,.32)' : 'rgba(245,158,11,.32)'],
          borderColor: ['rgb(99,102,241)', smaller ? 'rgb(34,197,94)' : 'rgb(245,158,11)'],
          borderWidth: 1.6, borderRadius: 7,
        }]
      },
      options: {
        responsive: true, indexAxis: 'y',
        animation: { duration: 860, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => '  ' + fmtSize(c.raw) } },
        },
        scales: {
          x: {
            ticks: { callback: v => fmtSize(v), color: tickColor, font: { size: 9 } },
            grid:  { color: gridColor },
          },
          y: {
            ticks: { color: tickColor, font: { size: 9 } },
            grid:  { display: false },
          },
        },
      },
    });
    cw.hidden = false;
    if (typeof anime !== 'undefined') {
      anime({ targets: cw, opacity: [0, 1], translateY: [10, 0], duration: 600, easing:'easeOutCubic', delay: 300 });
    }
  }

  // Animate the result box in with GSAP
  if (typeof gsap !== 'undefined') {
    gsap.from('.res-box', { y: 30, duration: .6, ease:'back.out(1.4)' });
    gsap.from('.rs', { y: 20, stagger: .08, duration: .5, ease:'back.out(1.2)', delay:.3 });
  }
}

/* ════════ DOWNLOAD ════════ */
function doDownload() {
  if (!_dlUrl) return;
  window.SOUNDS?.playDownloadWhoosh?.();
  const a = document.createElement('a');
  a.href = _dlUrl; a.download = _dlName;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  toast(`Downloading: ${_dlName}`, 'success', 3000);
}

/* ════════ PREVIEW MODAL ════════ */
function openPreview(entry) {
  D.pvModal.removeAttribute('hidden');
  $('pvTitle').textContent = entry.name;
  D.pvBody.innerHTML = `<div class="pv-loading"><i class="fas fa-spinner fa-spin"></i> Loading preview…</div>`;
  renderPreviewContent(entry);
}

async function renderPreviewContent(entry) {
  if (entry.imgConverted) {
    const url = URL.createObjectURL(entry.file);
    D.pvBody.innerHTML = `<div class="pv-img-wrap"><img src="${url}" alt="Preview" onload="URL.revokeObjectURL(this.src)"/></div>`;
    return;
  }
  if (typeof pdfjsLib === 'undefined') {
    D.pvBody.innerHTML = `<div class="pv-err"><i class="fas fa-triangle-exclamation"></i>PDF.js not loaded — preview unavailable</div>`;
    return;
  }
  try {
    const buf = await entry.file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(buf), password: entry.pwd || '',
    }).promise;
    const metaHtml = `<div class="pv-doc-meta">
      <span><i class="fas fa-book-open"></i>${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}</span>
      <span><i class="fas fa-database"></i>${fmtSize(entry.size)}</span>
    </div>`;
    const grid = document.createElement('div');
    grid.className = 'pv-grid';
    const limit = Math.min(pdf.numPages, 12);
    for (let p = 1; p <= limit; p++) {
      const page = await pdf.getPage(p);
      const vp   = page.getViewport({ scale: .65 });
      const cv   = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      const wrap = document.createElement('div'); wrap.className = 'pv-pg';
      const num  = document.createElement('div'); num.className = 'pv-pn'; num.textContent = p;
      wrap.appendChild(cv); wrap.appendChild(num); grid.appendChild(wrap);
    }
    D.pvBody.innerHTML = metaHtml;
    D.pvBody.appendChild(grid);
    if (pdf.numPages > 12)
      D.pvBody.insertAdjacentHTML('beforeend', `<div class="pv-more">Showing 12 of ${pdf.numPages} pages</div>`);
  } catch (err) {
    const isPass = String(err).toLowerCase().includes('password');
    D.pvBody.innerHTML = isPass
      ? `<div class="pv-err"><i class="fas fa-lock"></i>Password-protected PDF — enter password in the file card first</div>`
      : `<div class="pv-err"><i class="fas fa-triangle-exclamation"></i>Could not render preview</div>`;
  }
}

function closePreview() {
  D.pvModal.hidden = true;
  D.pvBody.innerHTML = '';
}

/* ════════ CANVAS PARTICLES ════════ */
function initCanvas() {
  const cv = $('bgCanvas'); if (!cv) return;
  const ctx = cv.getContext('2d');
  let W, H, pts = [];
  const resize = () => {
    W = cv.width  = window.innerWidth;
    H = cv.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);
  const N = Math.min(Math.floor(window.innerWidth / 14), 80);
  for (let i = 0; i < N; i++) {
    pts.push({
      x: Math.random() * 1000, y: Math.random() * 1000,
      vx: (Math.random() - .5) * .28, vy: (Math.random() - .5) * .28,
      r: Math.random() * 1.4 + .4, a: Math.random(),
    });
  }
  const theme = () => document.documentElement.dataset.theme === 'light';
  const draw = () => {
    ctx.clearRect(0, 0, W, H);
    const col = theme() ? '99,102,241' : '139,92,246';
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${col},${p.a * .5})`;
      ctx.fill();
    });
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 110) {
          ctx.strokeStyle = `rgba(${col},${(.12 - d/110*.12)})`;
          ctx.lineWidth = .5;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(draw);
  };
  draw();
}

/* ════════ PDF.JS loader ════════ */
function loadPdfJs() {
  if (typeof pdfjsLib !== 'undefined') return;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.onload = () => {
    if (typeof pdfjsLib !== 'undefined') {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      FILES.filter(e => !e.imgConverted && !e.thumb && !e.enc)
        .forEach(e => readPdfMeta(e));
    }
  };
  document.head.appendChild(s);
}

/* ════════ DRAG DROP SETUP ════════ */
function setupDrop() {
  const dz = D.dz;
  const pick = dz.querySelector('.dz-pick');

  // Click on zone or "browse" text
  const openPicker = () => D.fi.click();
  dz.addEventListener('click', e => {
    if (e.target === pick || e.target.closest('.dz-pick')) { D.fi.click(); return; }
    openPicker();
  });
  dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
  });

  // Drag events on drop zone
  dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('over'); });
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('over');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // Global drag
  let dragCnt = 0;
  document.addEventListener('dragenter', e => {
    e.preventDefault(); dragCnt++;
    D.globalDrag.classList.add('on');
  });
  document.addEventListener('dragleave', e => {
    dragCnt--; if (dragCnt <= 0) { dragCnt = 0; D.globalDrag.classList.remove('on'); }
  });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault(); dragCnt = 0; D.globalDrag.classList.remove('on');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // File input change
  D.fi.addEventListener('change', () => {
    if (D.fi.files.length) addFiles(D.fi.files);
    D.fi.value = '';
  });
}

/* ════════ ANIMATIONS ════════ */
function initAnimations() {
  // GSAP hero elements
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    // Info sections reveal
    gsap.utils.toArray('.info-section').forEach(sec => {
      gsap.from(sec.querySelectorAll('.hw-card, .fc2, .rel-card, .faq'), {
        scrollTrigger: { trigger: sec, start:'top 82%', toggleActions:'play none none none' },
        y: 22, stagger: .06, duration: .6, ease:'power2.out',
      });
    });
  }

  // Anime.js — navbar scroll glass effect
  window.addEventListener('scroll', () => {
    const nb = $('navbar');
    if (nb) nb.classList.toggle('scrolled', window.scrollY > 18);
  }, { passive: true });
}

/* ════════ DOMContentLoaded ════════ */
document.addEventListener('DOMContentLoaded', () => {

  D = {
    // Sections
    sUp: $('secUpload'), sFi: $('secFiles'),
    sPr: $('secProgress'), sRe: $('secResult'),
    // Upload
    dz: $('dropZone'), fi: $('fileInput'),
    globalDrag: $('globalDrag'),
    // Files
    fList: $('fileList'), fileBadge: $('fileBadge'),
    stPages: $('stPages'), stSize: $('stSize'), stEst: $('stEst'),
    largeBanner: $('largeBanner'),
    // Merge preview
    mergePreview: $('mergePreview'), mpStrip: $('mpStrip'),
    // Presets
    preTip: $('preTip'),
    // Options
    optsToggle: $('optsToggle'), optsBody: $('optsBody'),
    optMethod: $('optMethod'), optFilename: $('optFilename'),
    optTitle: $('optTitle'), optAuthor: $('optAuthor'),
    optToc: $('optToc'), optSep: $('optSep'),
    optBookmarks: $('optBookmarks'), optCompress: $('optCompress'),
    optDedup: $('optDedup'), optNorm: $('optNorm'),
    optTargetSize: $('optTargetSize'), normSzField: $('normSzField'),
    // Merge
    mergeBtn: $('mergeBtn'), mCount: $('mCount'),
    // Progress
    ring: $('ringFg'), pbar: $('pbar'), pbarWrap: $('pbarWrap'),
    ringPct: $('ringPct'), progTitle: $('progTitle'),
    progSub: $('progSub'), progFileInfo: $('progFileInfo'),
    ps1: $('ps1'), ps2: $('ps2'), ps3: $('ps3'), ps4: $('ps4'),
    // Result
    dlBtn: $('dlBtn'), copyNameBtn: $('copyNameBtn'),
    shareBtn: $('shareBtn'), mergeAgainBtn: $('mergeAgainBtn'),
    // Utils
    toast: $('toast'),
    undoBar: $('undoBar'), undoName: $('undoName'), undoBtn: $('undoBtn'),
    addMoreBtn: $('addMoreBtn'), addMore: $('addMoreInput'), clearBtn: $('clearBtn'),
    kbdBtn: $('kbdBtn'), kbdModal: $('kbdModal'), kbdClose: $('kbdClose'),
    pvModal: $('pvModal'), pvClose: $('pvClose'), pvBody: $('pvBody'),
    soundToggle: $('soundToggle'), soundIcon: $('soundIcon'),
    themeToggle: $('themeToggle'), themeIcon: $('themeIcon'),
  };

  /* ── Sort buttons ── */
  document.querySelectorAll('.sb').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.sort;
      if (s === _sortMode) return;
      _sortMode = s;
      document.querySelectorAll('.sb').forEach(b => b.classList.toggle('active', b.dataset.sort === s));
      if (s === 'name')  FILES.sort((a,b) => a.name.localeCompare(b.name));
      if (s === 'size')  FILES.sort((a,b) => b.size - a.size);
      if (s === 'order') {} // keep current order
      if (s !== 'order') { rebuildList(); updatePreviewStrip(); window.SOUNDS?.playSortSound?.(); }
    });
  });

  /* ── Sound toggle ── */
  const syncSound = () => {
    const on = window.SOUNDS?.isEnabled?.() ?? true;
    D.soundToggle.classList.toggle('muted', !on);
    D.soundIcon.className = on ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
  };
  syncSound();
  D.soundToggle.addEventListener('click', () => {
    window.SOUNDS?.toggle?.(); syncSound();
  });

  /* ── Theme toggle ── */
  const savedTheme = (() => { try { return localStorage.getItem('ishu-theme'); } catch (_) {} return null; })();
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  const syncTheme = () => {
    const dark = document.documentElement.dataset.theme !== 'light';
    D.themeIcon.className = dark ? 'fas fa-moon' : 'fas fa-sun';
  };
  syncTheme();
  D.themeToggle.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('ishu-theme', next); } catch (_) {}
    syncTheme();
  });

  /* ── Presets ── */
  document.querySelectorAll('.pre-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      const p = PRESETS[btn.dataset.p]; if (p) D.preTip.textContent = p.tip;
    });
    btn.addEventListener('mouseleave', () => { D.preTip.textContent = ''; });
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pre-btn').forEach(b => {
        b.classList.remove('on'); b.setAttribute('aria-pressed','false');
      });
      btn.classList.add('on'); btn.setAttribute('aria-pressed','true');
      const p = PRESETS[btn.dataset.p]; if (!p) return;
      D.optBookmarks.checked = p.bm; D.optToc.checked = p.toc;
      D.optSep.checked = p.sep; D.optCompress.checked = p.comp;
      D.optDedup.checked = p.dd;
      window.SOUNDS?.playPresetSound?.();
      const name = btn.dataset.p.charAt(0).toUpperCase() + btn.dataset.p.slice(1);
      toast(`Preset: ${name}`, 'info', 1800);
    });
  });

  /* ── Options accordion ── */
  D.optsToggle.addEventListener('click', () => {
    const open = D.optsToggle.getAttribute('aria-expanded') === 'true';
    D.optsToggle.setAttribute('aria-expanded', String(!open));
    D.optsBody.hidden = open;
    window.SOUNDS?.[open ? 'playCollapseSound' : 'playExpandSound']?.();
  });
  D.optNorm.addEventListener('change', () => {
    D.normSzField.hidden = !D.optNorm.checked;
  });
  [D.optToc, D.optSep, D.optBookmarks, D.optCompress, D.optDedup, D.optNorm].forEach(el => {
    el?.addEventListener('change', () =>
      window.SOUNDS?.[el.checked ? 'playToggleOnSound' : 'playToggleOffSound']?.());
  });

  /* ── Merge button ── */
  D.mergeBtn.addEventListener('click', startMerge);

  /* ── Add more / Clear ── */
  D.addMoreBtn.addEventListener('click', () => D.addMore.click());
  D.addMore.addEventListener('change', () => {
    if (D.addMore.files.length) addFiles(D.addMore.files);
    D.addMore.value = '';
  });
  D.clearBtn.addEventListener('click', () => {
    if (!FILES.length) return;
    const count = FILES.length;
    FILES.forEach((e, i) => _undoStack.push({ entry:e, idx:i }));
    FILES.length = 0; rebuildList(); updateStats();
    updatePreviewStrip(); showSection('upload');
    window.SOUNDS?.playFileRemoveSound?.();
    toast(`${count} file${count > 1 ? 's' : ''} cleared`, 'info', 2400);
  });

  /* ── Undo ── */
  D.undoBtn.addEventListener('click', () => {
    const item = _undoStack.shift(); if (!item) return;
    FILES.splice(item.idx, 0, item.entry);
    D.undoBar.classList.remove('show');
    clearTimeout(_undoTimer);
    rebuildList(); updateStats(); updatePreviewStrip();
    if (D.sFi.hidden) showSection('files');
    window.SOUNDS?.playFileAddSound?.();
    toast(`Restored: ${item.entry.name}`, 'success', 2200);
  });

  /* ── Download ── */
  D.dlBtn.addEventListener('click', doDownload);

  /* ── Copy name ── */
  D.copyNameBtn.addEventListener('click', async () => {
    if (!_dlName) return;
    try { await navigator.clipboard.writeText(_dlName); } catch (_) {}
    window.SOUNDS?.playCopySound?.();
    toast(`Copied: ${_dlName}`, 'success', 1800);
  });

  /* ── Share ── */
  D.shareBtn.addEventListener('click', async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title:'Merge PDF — IshuTools.fun', url });
      } catch (_) {}
    } else {
      try { await navigator.clipboard.writeText(url); } catch (_) {}
      window.SOUNDS?.playCopySound?.();
      toast('Link copied to clipboard!', 'success', 2200);
    }
  });

  /* ── Merge Again ── */
  D.mergeAgainBtn.addEventListener('click', () => {
    // Revoke old blob
    if (_dlUrl) { URL.revokeObjectURL(_dlUrl); _dlUrl = null; }
    _dlBlob = null; _dlName = '';
    document.querySelector('.res-box')?.classList.remove('ready');
    window.SOUNDS?.playMergeAgainSound?.();
    showSection('files');
  });

  /* ── Preview modal ── */
  D.pvClose.addEventListener('click', closePreview);
  D.pvModal.addEventListener('click', e => { if (e.target === D.pvModal) closePreview(); });

  /* ── Keyboard shortcuts modal ── */
  D.kbdBtn.addEventListener('click', () => {
    D.kbdModal.removeAttribute('hidden');
    window.SOUNDS?.playExpandSound?.();
  });
  D.kbdClose.addEventListener('click', () => { D.kbdModal.hidden = true; });
  D.kbdModal.addEventListener('click', e => {
    if (e.target === D.kbdModal) D.kbdModal.hidden = true;
  });

  /* ── Global keyboard shortcuts ── */
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
                    document.activeElement?.contentEditable === 'true';
    if (e.key === 'Escape') { D.kbdModal.hidden = true; closePreview(); return; }
    if (editing) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); D.undoBtn.click(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); D.fi.click(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') { e.preventDefault(); if (!D.mergeBtn.disabled) D.mergeBtn.click(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (_dlUrl) doDownload(); return; }
    if (e.key === '?') { D.kbdModal.removeAttribute('hidden'); window.SOUNDS?.playExpandSound?.(); }
  });

  /* ── FAQ accordion ── */
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.parentElement;
      const open = item.classList.contains('open');
      document.querySelectorAll('.faq.open').forEach(i => {
        i.classList.remove('open');
        i.querySelector('.faq-q').setAttribute('aria-expanded','false');
      });
      if (!open) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded','true');
      }
    });
  });

  /* ── Init ── */
  showSection('upload');
  setupDrop();
  initCanvas();
  loadPdfJs();
  setTimeout(() => initAnimations(), 150);

  // Typed.js — hero trust cycling
  setTimeout(() => {
    if (typeof Typed !== 'undefined' && $('heroTyped')) {
      if (_typedInst) _typedInst.destroy();
      _typedInst = new Typed('#heroTyped', {
        strings: [
          '100% Free. Always.',
          'No signup needed.',
          'No watermark, ever.',
          'Files deleted instantly.',
          'Works on any device.',
          'Up to 50 files at once.',
          '1 GB per file supported.',
          'Zero quality loss.',
        ],
        typeSpeed: 46, backSpeed: 26, loop: true, backDelay: 2600,
        smartBackspace: true, showCursor: true, cursorChar: '|',
      });
    }
  }, 800);
});
