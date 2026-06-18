/**
 * IshuTools.fun — Merge PDF v7.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 */
'use strict';

/* ════════ CONSTANTS ════════ */
const MAX_FILES = 50;
const MAX_BYTES = 1024 * 1024 * 1024;
const IMG_EXT   = new Set(['.jpg','.jpeg','.png','.webp','.gif','.bmp','.tiff','.tif']);
const PDF_EXT   = new Set(['.pdf']);
const CIRC      = 2 * Math.PI * 44;
const PRESETS   = {
  quick:   { tip:'Fastest merge — bookmarks preserved, no extras.',         bm:true,  toc:false, sep:false, comp:false, dd:false },
  report:  { tip:'Professional document — TOC + separator pages.',          bm:true,  toc:true,  sep:true,  comp:false, dd:false },
  compact: { tip:'Smallest file — compress + skip duplicate pages.',        bm:false, toc:false, sep:false, comp:true,  dd:true  },
  archive: { tip:'Maximum quality — all features enabled.',                 bm:true,  toc:true,  sep:true,  comp:true,  dd:false },
};

/* ════════ STATE ════════ */
const FILES       = [];
let _dlUrl        = null;
let _dlName       = '';
let _dlBlob       = null;
let _undoStack    = [];
let _undoTimer    = null;
let _sortMode     = 'order';
let _jobId        = null;
let _sse          = null;
let _simTimer     = null;
let _mergeStart   = 0;
let _sortable     = null;
let _recentMerges = [];

/* ════════ DOM helper ════════ */
const $ = id => document.getElementById(id);

/* D is populated inside DOMContentLoaded */
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
  let added = 0, skipped = 0;
  for (const f of Array.from(fileList)) {
    if (FILES.length >= MAX_FILES) {
      toast(`Maximum ${MAX_FILES} files reached`, 'warn'); break;
    }
    if (f.size > MAX_BYTES) {
      toast(`"${f.name}" is too large (max 1 GB)`, 'error'); continue;
    }
    const ex = fileExt(f.name);
    if (!IMG_EXT.has(ex) && !PDF_EXT.has(ex)) {
      toast(`Unsupported format: ${ex || 'unknown'}`, 'warn'); continue;
    }
    // Skip exact duplicate
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
    window.SOUNDS?.playFileAddSound?.();
    if (entry.imgConverted) genImgThumb(entry);
    else readPdfMeta(entry);
  }
  if (skipped > 0) toast(`${skipped} duplicate${skipped > 1 ? 's' : ''} skipped`, 'info', 2200);
  if (added > 0) {
    showSection('files');
    rebuildList();
    updateStats();
    // Scroll to file list smoothly
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
    refreshCard(entry); updateStats();
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
        refreshCard(entry); res();
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

/* ════════ CARD BUILD ════════ */
function buildCard(entry, idx) {
  const div = document.createElement('div');
  const typeClass = entry.imgConverted ? 'is-img' : 'is-pdf';
  div.className = `fc entering ${typeClass}`;
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
    ? `<div class="img-note"><i class="fas fa-info-circle"></i> Image will be auto-converted to PDF at full quality.</div>`
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
          <div class="fc-field"><label><i class="fas fa-tag"></i>Display Name <small>(TOC label)</small></label>
          <input type="text" class="fc-dname-inp"
            placeholder="Name in TOC / separator"
            value="${entry.displayName || ''}" autocomplete="off"/></div>
        </div>
      </div>
    </div>
    <div class="fc-acts">
      <span class="fc-num" aria-label="File ${idx + 1}">${idx + 1}</span>
      <div class="fc-btns">
        <button class="fc-btn exp" title="Options / Expand"><i class="fas fa-sliders"></i></button>
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

  /* Password input */
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
      rebuildList(); updateStats(); window.SOUNDS?.playSortSound?.();
      setTimeout(() => D.fList.querySelectorAll('.fc')[i-1]?.focus(), 40);
    } else if (e.altKey && e.key === 'ArrowDown' && i < FILES.length - 1) {
      e.preventDefault();
      [FILES[i], FILES[i+1]] = [FILES[i+1], FILES[i]];
      rebuildList(); updateStats(); window.SOUNDS?.playSortSound?.();
      setTimeout(() => D.fList.querySelectorAll('.fc')[i+1]?.focus(), 40);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement === div) {
      e.preventDefault(); removeFile(entry.id);
    }
  });

  addSwipe(div, entry.id);
  return div;
}

function refreshCard(entry) {
  const old = D?.fList?.querySelector(`[data-id="${entry.id}"]`);
  if (!old) return;
  const idx = FILES.findIndex(x => x.id === entry.id);
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
  initSortable(); updateMergeBtn();
}

/* ════════ SORTABLE ════════ */
function initSortable() {
  if (_sortable) { try { _sortable.destroy(); } catch (_) {} _sortable = null; }
  if (typeof Sortable === 'undefined') return;
  _sortable = Sortable.create(D.fList, {
    handle:      '.fc-handle',
    animation:   200,
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
      updateStats(); _sortMode = 'order';
      document.querySelectorAll('.sb').forEach(b =>
        b.classList.toggle('active', b.dataset.sort === 'order'));
    },
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
      'opacity:0;transform:translateX(14px) scale(.94);pointer-events:none;transition:.22s ease';
    setTimeout(() => card.remove(), 230);
  }
  updateStats();
  D.fileBadge.textContent = `${FILES.length} file${FILES.length !== 1 ? 's' : ''}`;
  if (FILES.length === 0) showSection('upload');
  else updateMergeBtn();
}

/* ════════ STATS ════════ */
function updateStats() {
  if (!D) return;
  D.stFiles.textContent = FILES.length;
  D.stFiles.classList.toggle('hi', FILES.length > 0);
  const tp = FILES.reduce((a, f) => a + (f.pages || 0), 0);
  D.stPages.textContent = tp > 0 ? tp : '—';
  const ts = FILES.reduce((a, f) => a + f.size, 0);
  D.stSize.textContent  = ts > 0 ? fmtSize(ts) : '—';
  const est = (ts / 1024 / 1024) * 0.38 + FILES.length * 0.28;
  D.stEst.textContent   = FILES.length > 0
    ? (est < 60 ? `~${Math.max(1, Math.round(est))}s` : `~${Math.round(est / 60)}m`) : '—';
  const big = FILES.filter(f => f.size > 100 * 1024 * 1024);
  D.largeBanner.hidden  = big.length === 0;
  if (big.length > 0)
    D.largeBanner.innerHTML =
      `<i class="fas fa-triangle-exclamation"></i> ${big.length} large file${big.length > 1 ? 's' : ''} — merge may take a moment`;
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
  if (FILES.length < 2) { toast('Add at least 2 files first', 'warn'); return; }
  window.SOUNDS?.resume?.();
  D.mergeBtn.disabled = true;
  D.mergeBtn.classList.remove('ready');
  _mergeStart = Date.now();
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
  setProg(5, 'Uploading…', `Sending ${FILES.length} file${FILES.length > 1 ? 's' : ''} to server`);

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
    const linearized  = resp.headers.get('X-Linearized')             || 'false';

    _dlBlob = await resp.blob();
    if (_dlUrl) URL.revokeObjectURL(_dlUrl);
    _dlUrl  = URL.createObjectURL(_dlBlob);
    _dlName = smartName();

    setProg(100, 'Done!', 'Merge complete — ready to download');
    stepProg(3);
    await new Promise(r => setTimeout(r, 350));
    showResult(totalPages, srcCount, methodUsed, outputSize, skippedDups, _dlBlob.size, linearized);
  } catch (err) {
    closeSSE();
    window.SOUNDS?.playErrorSound?.();
    const msg = err.message || 'Merge failed — check your files and try again';
    toast(msg, 'error', 8000);
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
function showResult(totalPages, srcCount, methodUsed, outputSize, skippedDups, blobSize, linearized) {
  window.SOUNDS?.playSuccessChime?.();
  showSection('result');
  $('secResult')?.scrollIntoView({ behavior:'smooth', block:'start' });

  const elapsed  = ((Date.now() - _mergeStart) / 1000).toFixed(1) + 's';
  const totalIn  = FILES.reduce((a, f) => a + f.size, 0);
  const sz       = outputSize || blobSize;
  const chg      = totalIn > 0 ? ((sz - totalIn) / totalIn * 100) : 0;
  const saved    = chg < -0.5 ? `−${Math.abs(chg).toFixed(1)}%`
                 : chg > 0.5  ? `+${chg.toFixed(1)}%` : '0%';

  counterAnim(D.rFiles, srcCount);
  counterAnim(D.rPages, totalPages);
  D.rSize.textContent   = fmtSize(sz);
  D.rTime.textContent   = elapsed;
  D.rEngine.textContent = (methodUsed || 'pypdf')
    .replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  D.rSaved.textContent  = saved;
  D.rSaved.style.color  = chg < -1 ? 'var(--ok)' : chg > 5 ? 'var(--err)' : 'var(--tx)';

  D.resSub.textContent = skippedDups > 0
    ? `${srcCount} files merged · ${totalPages} pages · ${skippedDups} duplicate${skippedDups > 1 ? 's' : ''} removed`
    : `${srcCount} file${srcCount !== 1 ? 's' : ''} merged into ${totalPages} page${totalPages !== 1 ? 's' : ''}`;

  D.resFnTx.textContent = _dlName;
  D.resFn.hidden = false;

  /* Download button */
  D.dlBtn.onclick = () => {
    const a = document.createElement('a');
    a.href = _dlUrl; a.download = _dlName;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    window.SOUNDS?.playDownloadWhoosh?.();
    toast('Download started!', 'success', 2600);
  };

  /* Copy name */
  D.copyNameBtn.onclick = () => {
    navigator.clipboard?.writeText(_dlName).then(() => {
      const orig = D.copyNameBtn.innerHTML;
      D.copyNameBtn.classList.add('copied');
      D.copyNameBtn.innerHTML = '<i class="fas fa-check"></i>Copied!';
      window.SOUNDS?.playCopySound?.();
      setTimeout(() => {
        D.copyNameBtn.classList.remove('copied');
        D.copyNameBtn.innerHTML = orig;
      }, 2400);
    }).catch(() => toast('Copy not available', 'warn'));
  };

  /* Share */
  D.shareBtn.onclick = () => {
    const shareData = {
      title: 'Merge PDF — IshuTools.fun',
      text:  'Free online PDF merger by Ishu Kumar — no signup, no watermark!',
      url:   'https://ishutools.fun/tools/merge-pdf/',
    };
    if (navigator.share) {
      navigator.share(shareData).catch(() => {});
    } else {
      navigator.clipboard?.writeText(shareData.url).then(() => {
        toast('Link copied!', 'success', 2200);
      }).catch(() => {});
    }
    window.SOUNDS?.playCopySound?.();
  };

  /* Merge again */
  D.mergeAgainBtn.onclick = () => {
    window.SOUNDS?.playMergeAgainSound?.();
    showSection('files');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    D.mergeBtn.disabled = FILES.length < 2;
    D.mergeBtn.classList.toggle('ready', FILES.length >= 2);
  };

  /* Recent history */
  _recentMerges.unshift({
    id: genId(), name: _dlName,
    files: srcCount, pages: totalPages,
    size: fmtSize(sz),
    time: new Date().toLocaleTimeString(),
  });
  if (_recentMerges.length > 4) _recentMerges.pop();
  renderRecent();

  /* Confetti */
  launchConfetti(52);
}

function counterAnim(el, target) {
  if (!target || isNaN(target)) { el.textContent = target || '—'; return; }
  let v = 0;
  const step = Math.max(1, Math.ceil(target / 30));
  const t = setInterval(() => {
    v = Math.min(v + step, target);
    el.textContent = v;
    if (v >= target) clearInterval(t);
  }, 26);
}

function renderRecent() {
  if (!_recentMerges.length) { D.recentMerges.innerHTML = ''; return; }
  D.recentMerges.innerHTML = `
    <div class="rec-wrap">
      <div class="rec-lbl"><i class="fas fa-clock-rotate-left"></i>Recent Merges</div>
      <div class="rec-list">${_recentMerges.map(r => `
        <div class="rec-item">
          <i class="fas fa-file-pdf"></i>
          <div class="rec-name">${r.name}</div>
          <div class="rec-meta">${r.files} files · ${r.pages}p · ${r.size}</div>
          <span class="rec-time">${r.time}</span>
        </div>`).join('')}
      </div>
    </div>`;
}

/* ════════ CONFETTI ════════ */
function launchConfetti(n) {
  const c = $('confetti'); if (!c) return; c.innerHTML = '';
  const COLS = ['#6366f1','#8b5cf6','#f59e0b','#22c55e','#06b6d4',
                '#ec4899','#f97316','#a78bfa','#34d399','#fb923c'];
  for (let i = 0; i < n; i++) {
    const p   = document.createElement('div'); p.className = 'cp2';
    const sz  = 5 + Math.random() * 11;
    const dr  = 2.2 + Math.random() * 2.6;
    p.style.cssText =
      `left:${Math.random()*100}%;width:${sz}px;height:${sz*1.6}px;` +
      `background:${COLS[~~(Math.random()*COLS.length)]};` +
      `border-radius:${Math.random() > .5 ? '50%' : '2px'};` +
      `animation-duration:${dr}s;animation-delay:${Math.random()*1.2}s;` +
      `transform:rotate(${Math.random()*360}deg)`;
    c.appendChild(p);
  }
  setTimeout(() => { if (c) c.innerHTML = ''; }, 8000);
}

/* ════════ PREVIEW MODAL ════════ */
async function openPreview(entry) {
  D.pvTitle.textContent = entry.displayName || entry.name;
  D.pvBody.innerHTML =
    `<div class="pv-loading"><i class="fas fa-spinner fa-spin"></i> Loading preview…</div>`;
  D.pvModal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';
  window.SOUNDS?.playExpandSound?.();

  if (entry.imgConverted) {
    const url = URL.createObjectURL(entry.file);
    D.pvBody.innerHTML =
      `<div class="pv-img-wrap"><img src="${url}" alt="${entry.name}"/></div>`;
    return;
  }

  if (typeof pdfjsLib === 'undefined') {
    D.pvBody.innerHTML =
      `<div class="pv-err"><i class="fas fa-spinner fa-spin"></i> PDF.js loading — try again in a moment</div>`;
    return;
  }

  try {
    const buf  = await entry.file.arrayBuffer();
    const opts = { data: new Uint8Array(buf) };
    if (entry.pwd) opts.password = entry.pwd;
    const pdf = await pdfjsLib.getDocument(opts).promise;
    entry.pages = pdf.numPages; updateStats();

    const meta = await pdf.getMetadata().catch(() => null);
    let head = '<div class="pv-doc-meta">';
    if (meta?.info?.Title)  head += `<span><i class="fas fa-tag"></i>${meta.info.Title}</span>`;
    if (meta?.info?.Author) head += `<span><i class="fas fa-user"></i>${meta.info.Author}</span>`;
    head += `<span><i class="fas fa-book-open"></i>${pdf.numPages} page${pdf.numPages > 1 ? 's' : ''}</span></div>`;

    const maxPg = Math.min(pdf.numPages, 12);
    D.pvBody.innerHTML = head + `<div class="pv-grid" id="pvGrid"></div>` +
      (pdf.numPages > 12 ? `<div class="pv-more">Showing first 12 of ${pdf.numPages} pages</div>` : '');

    const grid = $('pvGrid');
    for (let i = 1; i <= maxPg; i++) {
      const pg   = await pdf.getPage(i);
      const vp   = pg.getViewport({ scale:.66 });
      const wrap = document.createElement('div'); wrap.className = 'pv-pg';
      const cv   = document.createElement('canvas');
      cv.width = vp.width; cv.height = vp.height;
      const pn   = document.createElement('div'); pn.className = 'pv-pn'; pn.textContent = i;
      wrap.appendChild(cv); wrap.appendChild(pn); grid.appendChild(wrap);
      pg.render({ canvasContext: cv.getContext('2d'), viewport: vp });
    }
  } catch (err) {
    const isPass = err?.name === 'PasswordException' ||
      String(err).toLowerCase().includes('password');
    if (isPass) {
      entry.enc = true; refreshCard(entry);
      D.pvBody.innerHTML =
        `<div class="pv-err"><i class="fas fa-lock"></i>` +
        `${entry.pwd ? 'Wrong password — check the card' : 'Expand the card and enter the PDF password'}</div>`;
    } else {
      D.pvBody.innerHTML =
        `<div class="pv-err"><i class="fas fa-triangle-exclamation"></i>${err.message || 'Cannot preview this file'}</div>`;
    }
  }
}

function closePreview() {
  if (!D) return;
  D.pvModal.hidden = true;
  document.body.style.overflow = '';
  window.SOUNDS?.playCollapseSound?.();
}

/* ════════ DROP ZONE SETUP ════════ */
function setupDrop() {
  /* Click anywhere on drop zone */
  D.dz.addEventListener('click', e => {
    if (!e.target.closest('.dz-pick') &&
        e.target !== D.dz &&
        !e.target.closest('.dz-icon') &&
        e.target.tagName !== 'H2' &&
        e.target.tagName !== 'P') return;
    D.fi.click();
  });
  document.querySelector('.dz-pick')?.addEventListener('click', e => {
    e.stopPropagation(); D.fi.click();
  });
  D.dz.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fi.click(); }
  });

  /* File input */
  D.fi.addEventListener('change', () => {
    if (D.fi.files.length) addFiles(D.fi.files);
    D.fi.value = '';
  });

  /* Drag events on drop zone */
  D.dz.addEventListener('dragenter', e => { e.preventDefault(); D.dz.classList.add('over'); });
  D.dz.addEventListener('dragover',  e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  D.dz.addEventListener('dragleave', e => {
    if (!D.dz.contains(e.relatedTarget)) D.dz.classList.remove('over');
  });
  D.dz.addEventListener('drop', e => {
    e.preventDefault(); D.dz.classList.remove('over');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  /* Global drag-over indicator */
  document.addEventListener('dragenter', e => {
    if (e.dataTransfer?.types?.includes('Files') && D.globalDrag)
      D.globalDrag.classList.add('on');
  });
  document.addEventListener('dragleave', e => {
    if (D.globalDrag && (!e.relatedTarget || e.relatedTarget.nodeName === 'HTML'))
      D.globalDrag.classList.remove('on');
  });
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    if (D.globalDrag) D.globalDrag.classList.remove('on');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });
}

/* ════════ TOUCH SWIPE (mobile) ════════ */
function addSwipe(card, id) {
  const hint = card.querySelector('.swipe-reveal');
  let tx0 = 0, dx = 0;
  card.addEventListener('touchstart', e => {
    tx0 = e.touches[0].clientX; dx = 0;
  }, { passive:true });
  card.addEventListener('touchmove', e => {
    dx = e.touches[0].clientX - tx0;
    if (dx < 0) {
      card.style.transform = `translateX(${Math.max(dx, -115)}px)`;
      if (hint) hint.style.opacity = String(Math.min(1, -dx / 60));
    }
  }, { passive:true });
  card.addEventListener('touchend', () => {
    if (dx < -95) removeFile(id);
    else { card.style.transform = ''; if (hint) hint.style.opacity = '0'; }
    dx = 0;
  }, { passive:true });
}

/* ════════ PDF.js LAZY LOAD ════════ */
function loadPdfJs() {
  if (typeof pdfjsLib !== 'undefined') return;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  s.onload = () => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    FILES.filter(e => !e.imgConverted && e.pages === null)
         .forEach(e => readPdfMeta(e));
  };
  document.head.appendChild(s);
}

/* ════════ CANVAS PARTICLES ════════ */
function initCanvas() {
  const cv = D.bgCanvas; if (!cv) return;
  const cx = cv.getContext('2d');
  let W, H;
  const resize = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; };
  resize();
  window.addEventListener('resize', resize, { passive:true });
  const N = Math.min(52, Math.floor(innerWidth / 26));
  const pts = Array.from({ length:N }, () => ({
    x: Math.random() * 1920, y: Math.random() * 1080,
    vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .22,
    r:  1 + Math.random() * 1.6, a: .05 + Math.random() * .13,
  }));
  const CONN = 125;
  const frame = () => {
    cx.clearRect(0, 0, W, H);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      cx.fillStyle = `rgba(99,102,241,${p.a})`; cx.fill();
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d = Math.hypot(dx, dy);
        if (d < CONN) {
          cx.beginPath(); cx.moveTo(pts[i].x, pts[i].y); cx.lineTo(pts[j].x, pts[j].y);
          cx.strokeStyle = `rgba(99,102,241,${.046 * (1 - d / CONN)})`;
          cx.lineWidth = .5; cx.stroke();
        }
      }
    }
    requestAnimationFrame(frame);
  };
  frame();
}

/* ════════ ANIMATIONS ════════ */
function initAnimations() {
  if (typeof gsap === 'undefined') return;
  if (typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
    [
      { sel:'.hw-card',  trg:'.how-grid'  },
      { sel:'.fc2',      trg:'.feat-grid' },
      { sel:'.faq',      trg:'.faq-list'  },
      { sel:'.rel-card', trg:'.rel-grid'  },
    ].forEach(({ sel, trg }) =>
      gsap.from(sel, {
        y:32, duration:.64, stagger:.09, ease:'power3.out',
        scrollTrigger:{ trigger:trg, start:'top 84%', once:true },
      })
    );
  }
}

/* ══════════════════════════════════════
   INIT
   ══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* ── Populate DOM refs ── */
  D = {
    sUp:$('secUpload'), sFi:$('secFiles'), sPr:$('secProgress'), sRe:$('secResult'),
    dz:$('dropZone'), fi:$('fileInput'), addMoreBtn:$('addMoreBtn'),
    addMore:$('addMoreInput'), clearBtn:$('clearBtn'),
    fileBadge:$('fileBadge'), fList:$('fileList'), kbdBtn:$('kbdBtn'),
    stFiles:$('stFiles'), stPages:$('stPages'), stSize:$('stSize'), stEst:$('stEst'),
    largeBanner:$('largeBanner'), preTip:$('preTip'),
    optsToggle:$('optsToggle'), optsBody:$('optsBody'), optsArr:$('optsArr'),
    optMethod:$('optMethod'), optFilename:$('optFilename'),
    optTitle:$('optTitle'), optAuthor:$('optAuthor'),
    optToc:$('optToc'), optSep:$('optSep'), optBookmarks:$('optBookmarks'),
    optCompress:$('optCompress'), optDedup:$('optDedup'),
    optNorm:$('optNorm'), optTargetSize:$('optTargetSize'), normSzField:$('normSzField'),
    mergeBtn:$('mergeBtn'), mCount:$('mCount'),
    ring:$('ringFg'), pbar:$('pbar'), pbarWrap:$('pbarWrap'),
    ringPct:$('ringPct'), progTitle:$('progTitle'), progSub:$('progSub'),
    ps1:$('ps1'), ps2:$('ps2'), ps3:$('ps3'), ps4:$('ps4'),
    progFileInfo:$('progFileInfo'),
    resSub:$('resSub'), resFn:$('resFn'), resFnTx:$('resFnTx'),
    rFiles:$('rFiles'), rPages:$('rPages'), rSize:$('rSize'),
    rTime:$('rTime'), rEngine:$('rEngine'), rSaved:$('rSaved'),
    dlBtn:$('dlBtn'), copyNameBtn:$('copyNameBtn'),
    shareBtn:$('shareBtn'), mergeAgainBtn:$('mergeAgainBtn'),
    recentMerges:$('recentMerges'),
    kbdModal:$('kbdModal'), kbdClose:$('kbdClose'),
    pvModal:$('pvModal'), pvClose:$('pvClose'), pvBody:$('pvBody'), pvTitle:$('pvTitle'),
    toast:$('toast'), undoBar:$('undoBar'), undoName:$('undoName'), undoBtn:$('undoBtn'),
    soundToggle:$('soundToggle'), soundIcon:$('soundIcon'),
    themeToggle:$('themeToggle'), themeIcon:$('themeIcon'),
    navbar:$('navbar'), bgCanvas:$('bgCanvas'), globalDrag:$('globalDrag'),
  };

  /* ── Theme ── */
  const savedTheme = localStorage.getItem('ishu-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  D.themeIcon.className = savedTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
  D.themeToggle.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const nxt = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nxt);
    localStorage.setItem('ishu-theme', nxt);
    D.themeIcon.className = nxt === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
  });

  /* ── Sound toggle ── */
  const refreshSoundBtn = () => {
    const on = window.SOUNDS?.isEnabled?.() ?? true;
    D.soundToggle.classList.toggle('muted', !on);
    D.soundIcon.className = on ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
    D.soundToggle.setAttribute('aria-label', on ? 'Mute sounds' : 'Enable sounds');
  };
  D.soundToggle.addEventListener('click', () => {
    window.SOUNDS?.toggle?.(); refreshSoundBtn();
  });
  refreshSoundBtn();

  /* ── Navbar scroll shadow ── */
  window.addEventListener('scroll', () =>
    D.navbar.classList.toggle('scrolled', scrollY > 40), { passive:true });

  /* ── Sort buttons ── */
  document.querySelectorAll('.sb').forEach(btn =>
    btn.addEventListener('click', () => {
      _sortMode = btn.dataset.sort;
      document.querySelectorAll('.sb').forEach(b =>
        b.classList.toggle('active', b.dataset.sort === _sortMode));
      if (_sortMode === 'name') FILES.sort((a, b) => a.name.localeCompare(b.name));
      else if (_sortMode === 'size') FILES.sort((a, b) => b.size - a.size);
      rebuildList(); window.SOUNDS?.playSortSound?.();
    })
  );

  /* ── Presets ── */
  document.querySelectorAll('.pre-btn').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      const p = PRESETS[btn.dataset.p]; if (p) D.preTip.textContent = p.tip;
    });
    btn.addEventListener('mouseleave', () => { D.preTip.textContent = '' });
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
    FILES.length = 0; rebuildList(); updateStats(); showSection('upload');
    window.SOUNDS?.playFileRemoveSound?.();
    toast(`${count} file${count > 1 ? 's' : ''} cleared`, 'info', 2400);
  });

  /* ── Undo ── */
  D.undoBtn.addEventListener('click', () => {
    const item = _undoStack.shift(); if (!item) return;
    FILES.splice(item.idx, 0, item.entry);
    D.undoBar.classList.remove('show');
    clearTimeout(_undoTimer);
    rebuildList(); updateStats();
    if (D.sFi.hidden) showSection('files');
    window.SOUNDS?.playFileAddSound?.();
    toast(`Restored: ${item.entry.name}`, 'success', 2200);
  });

  /* ── Preview modal ── */
  D.pvClose.addEventListener('click', closePreview);
  D.pvModal.addEventListener('click', e => { if (e.target === D.pvModal) closePreview(); });

  /* ── Keyboard shortcuts modal ── */
  D.kbdBtn.addEventListener('click', () => {
    D.kbdModal.removeAttribute('hidden');
    window.SOUNDS?.playExpandSound?.();
  });
  D.kbdClose.addEventListener('click', () => { D.kbdModal.hidden = true });
  D.kbdModal.addEventListener('click', e => {
    if (e.target === D.kbdModal) D.kbdModal.hidden = true;
  });

  /* ── Global keyboard shortcuts ── */
  document.addEventListener('keydown', e => {
    const tag     = document.activeElement?.tagName;
    const editing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
                    document.activeElement?.contentEditable === 'true';
    if (e.key === 'Escape') {
      D.kbdModal.hidden = true; closePreview(); return;
    }
    if (editing) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault(); D.undoBtn.click(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault(); D.fi.click(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
      e.preventDefault(); if (!D.mergeBtn.disabled) D.mergeBtn.click(); return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault(); if (_dlUrl) D.dlBtn?.click(); return;
    }
    if (e.key === '?') {
      D.kbdModal.removeAttribute('hidden');
      window.SOUNDS?.playExpandSound?.();
    }
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

  /* ── Start ── */
  showSection('upload');
  setupDrop();
  initCanvas();
  loadPdfJs();
  setTimeout(() => initAnimations(), 120);
});
