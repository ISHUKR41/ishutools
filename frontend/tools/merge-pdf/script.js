/**
 * Merge PDF — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Ultra-professional merge tool: PDF + Image support, GSAP, SortableJS, Web Audio
 */
'use strict';

/* ══════════════════════════════════════════════════════
   CONFIG
══════════════════════════════════════════════════════ */
const MAX_FILES       = 50;
const MAX_FILE_MB     = 1024;
const PDFJS_CDN       = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
const PDFJS_WORKER    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
const RECENT_KEY      = 'ishu_merges_v3';
const MAX_RECENT      = 5;
const PDF_EXTS        = ['pdf'];
const IMG_EXTS        = ['jpg','jpeg','png','webp','gif','bmp','tiff','tif'];
const ACCEPTED_EXTS   = [...PDF_EXTS, ...IMG_EXTS];

/* ══════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════ */
let files         = [];   // [{id,file,type:'pdf'|'img',pageRange,password,displayName,info}]
let sortable      = null;
let pdfjsLib      = null;
let mergeResult   = null;
let mergeStart    = null;
let downloadUrl   = null;
let currentSort   = 'order';
let originalOrder = [];

/* ══════════════════════════════════════════════════════
   DOM
══════════════════════════════════════════════════════ */
const $  = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

const dropZone     = $('dropZone');
const fileInput    = $('fileInput');
const addMoreInput = $('addMoreInput');
const uploadSec    = $('uploadSection');
const filesSec     = $('filesSection');
const progressSec  = $('progressSection');
const resultSec    = $('resultSection');
const fileList     = $('fileList');
const mergeBtn     = $('mergeBtn');
const downloadBtn  = $('downloadBtn');
const mergeAgainBtn= $('mergeAgainBtn');
const themeToggle  = $('themeToggle');
const themeIcon    = $('themeIcon');
const toast        = $('toast');
const globalDragInd= $('globalDragIndicator');

/* ══════════════════════════════════════════════════════
   CANVAS PARTICLE BACKGROUND
══════════════════════════════════════════════════════ */
(function bgCanvas() {
  const c = $('bgCanvas'); if (!c) return;
  const ctx = c.getContext('2d');
  let W, H, pts = [];
  const resize = () => { W = c.width = innerWidth; H = c.height = innerHeight; };
  const mkPt   = () => ({ x:Math.random()*W, y:Math.random()*H, vx:(Math.random()-.5)*.2, vy:(Math.random()-.5)*.2, r:Math.random()*1.5+.3, a:Math.random()*.35+.05, h:220+Math.random()*50 });
  const init   = () => { pts = Array.from({length:Math.min(Math.floor(W*H/9000),120)},mkPt); };
  function draw() {
    ctx.clearRect(0,0,W,H);
    pts.forEach(p => {
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=W; if(p.x>W)p.x=0; if(p.y<0)p.y=H; if(p.y>H)p.y=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=`hsla(${p.h},75%,65%,${p.a})`; ctx.fill();
    });
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++) {
      const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.sqrt(dx*dx+dy*dy);
      if(d<110){ ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y);
        ctx.strokeStyle=`rgba(99,102,241,${(1-d/110)*.09})`; ctx.lineWidth=.55; ctx.stroke(); }
    }
    requestAnimationFrame(draw);
  }
  resize(); init(); draw();
  window.addEventListener('resize',()=>{ resize(); init(); },{passive:true});
})();

/* ══════════════════════════════════════════════════════
   THEME
══════════════════════════════════════════════════════ */
(function initTheme(){
  const t = localStorage.getItem('ishu-theme')||'dark';
  document.documentElement.setAttribute('data-theme',t);
  if(themeIcon) themeIcon.className = t==='dark'?'fas fa-moon':'fas fa-sun';
})();
themeToggle&&themeToggle.addEventListener('click',()=>{
  const cur  = document.documentElement.getAttribute('data-theme');
  const next = cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('ishu-theme',next);
  if(themeIcon) themeIcon.className = next==='dark'?'fas fa-moon':'fas fa-sun';
});

/* ── Navbar scroll ── */
const navbar = $('navbar');
window.addEventListener('scroll',()=>navbar?.classList.toggle('scrolled',scrollY>20),{passive:true});

/* ══════════════════════════════════════════════════════
   LAZY PDF.js LOAD
══════════════════════════════════════════════════════ */
async function loadPDFJS(){
  if(pdfjsLib) return pdfjsLib;
  try{
    const m = await import(PDFJS_CDN);
    pdfjsLib = m;
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return pdfjsLib;
  } catch(e){ return null; }
}

/* ══════════════════════════════════════════════════════
   UTILS
══════════════════════════════════════════════════════ */
const uid  = () => `f${Date.now()}${Math.random().toString(36).slice(2,6)}`;
const fmtB = b => !b?'0 B':b<1024?`${b} B`:b<1048576?`${(b/1024).toFixed(1)} KB`:`${(b/1048576).toFixed(2)} MB`;
const trunc = (s,n=34) => s&&s.length>n ? s.slice(0,n-1)+'…' : s;
const stem  = f => (f||'merged').replace(/\.[^/.]+$/,'').trim()||'merged';
const ext   = f => (f||'').split('.').pop().toLowerCase();
const isImg = f => IMG_EXTS.includes(ext(f.name));
const isPdf = f => PDF_EXTS.includes(ext(f.name)) || f.type==='application/pdf';

function smartFilename(){
  const custom = $('optFilename')?.value.trim();
  if(custom) return custom.replace(/\.pdf$/i,'')+'.pdf';
  if(files.length>0) return stem(files[0].displayName||files[0].file.name)+'_merged.pdf';
  return 'merged.pdf';
}

/* ══════════════════════════════════════════════════════
   SOUND TOGGLE — wired to SOUNDS global from sounds/sounds.js
══════════════════════════════════════════════════════ */
const soundToggle  = $('soundToggle');
const soundIcon    = $('soundIcon');

function updateSoundUI(){
  if(!soundToggle||!soundIcon) return;
  const on = window.SOUNDS?.isEnabled();
  soundIcon.className = on ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
  soundToggle.classList.toggle('sound-off', !on);
  soundToggle.setAttribute('aria-label', on ? 'Mute sounds' : 'Unmute sounds');
}
updateSoundUI();

soundToggle?.addEventListener('click',()=>{
  const on = window.SOUNDS?.toggle();
  updateSoundUI();
  if(on) window.SOUNDS?.playToggleOnSound();
});

/* ══════════════════════════════════════════════════════
   CONFETTI
══════════════════════════════════════════════════════ */
function launchConfetti(){
  const cont=$('confettiContainer'); if(!cont) return;
  cont.innerHTML='';
  const cols=['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#22c55e','#a78bfa'];
  for(let i=0;i<90;i++){
    const el=document.createElement('div'); el.className='confetti-piece';
    const col=cols[Math.floor(Math.random()*cols.length)];
    const sz=Math.random()*8+4, left=Math.random()*100;
    const delay=Math.random()*.8, dur=Math.random()*1.6+2;
    el.style.cssText=`left:${left}%;width:${sz}px;height:${sz}px;background:${col};border-radius:${Math.random()<.4?'50%':'3px'};animation-duration:${dur}s;animation-delay:${delay}s;transform:translateX(${(Math.random()-.5)*160}px) rotate(${Math.random()*360}deg)`;
    cont.appendChild(el);
  }
  setTimeout(()=>{if(cont)cont.innerHTML=''},4500);
}

/* ══════════════════════════════════════════════════════
   COUNTER ANIMATION
══════════════════════════════════════════════════════ */
const _cprev={};
function animateCount(el,to){
  if(!el) return;
  const k=el.id||el.dataset.k||'x';
  const from=_cprev[k]??0;
  if(from===to) return; _cprev[k]=to;
  const dur=450, s=performance.now();
  (function tick(now){
    const p=Math.min((now-s)/dur,1), e=1-Math.pow(1-p,3);
    el.textContent=Math.round(from+(to-from)*e);
    el.classList.add('counting');
    if(p<1) requestAnimationFrame(tick);
    else el.classList.remove('counting');
  })(s);
}

/* ══════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════ */
let _tt=null;
function showToast(msg,type='info'){
  if(!toast) return;
  const icons={success:'✓',error:'✕',warn:'⚠',info:'ℹ'};
  toast.className=`toast ${type} show`;
  toast.innerHTML=`<span>${icons[type]||'•'}</span> ${msg}`;
  clearTimeout(_tt); _tt=setTimeout(()=>toast.classList.remove('show'),4000);
  window.SOUNDS?.playNotifySound(type);
}

/* ══════════════════════════════════════════════════════
   SECTION SWITCHER
══════════════════════════════════════════════════════ */
const sections = [uploadSec, filesSec, progressSec, resultSec];
function showSec(sec){ sections.forEach(s=>s&&(s.hidden=s!==sec)); }
function goUpload(){
  files=[]; mergeResult=null;
  if(downloadUrl){URL.revokeObjectURL(downloadUrl);downloadUrl=null;}
  showSec(uploadSec); updateCounts();
}
function goFiles(){ showSec(filesSec); }
function goProgress(){ showSec(progressSec); }
function goResult(){ showSec(resultSec); }

/* ══════════════════════════════════════════════════════
   ADD FILES
══════════════════════════════════════════════════════ */
async function addFiles(raw){
  const valid=[];
  Array.from(raw).forEach(f=>{
    const e=ext(f.name);
    if(!ACCEPTED_EXTS.includes(e)){
      showToast(`"${f.name}" — unsupported format`,  'warn'); return;
    }
    if(f.size>MAX_FILE_MB*1024*1024){
      showToast(`"${f.name}" exceeds 1 GB limit`,'warn'); return;
    }
    valid.push(f);
  });
  if(!valid.length) return;
  if(files.length+valid.length>MAX_FILES){
    showToast(`Maximum ${MAX_FILES} files allowed`,'warn');
    valid.splice(MAX_FILES-files.length);
  }
  const entries = valid.map(f=>({
    id: uid(), file: f,
    type: isImg(f)?'img':'pdf',
    pageRange:'', password:'',
    displayName: f.name, info: null,
  }));
  files.push(...entries);
  originalOrder = files.map(f=>f.id);
  goFiles(); renderFileList(); updateCounts(); checkDuplicates();
  window.SOUNDS?.playFileAddSound();

  // Async: load thumbnails + validate
  const lib = await loadPDFJS();
  entries.forEach(e=>{
    if(e.type==='img') loadImgThumb(e);
    else loadPdfThumb(e,lib);
    if(e.type==='pdf') validateFile(e);
  });
}

/* ── Image thumbnail ── */
async function loadImgThumb(entry){
  const el = document.querySelector(`[data-id="${entry.id}"] .fc-thumb`);
  if(!el) return;
  const url = URL.createObjectURL(entry.file);
  const img  = new Image();
  img.onload = ()=>{ el.innerHTML=''; el.appendChild(img); URL.revokeObjectURL(url); };
  img.onerror= ()=>{ el.innerHTML=`<div class="fc-thumb-placeholder img"><i class="fas fa-image"></i><span>IMG</span></div>`; URL.revokeObjectURL(url); };
  img.src = url;
  img.style.cssText='width:100%;height:100%;object-fit:cover';
  // No page count for images — just mark as 1 page (will be converted)
  entry.info = { pageCount: 1, encrypted: false };
  setTimeout(()=>updateFileCardMeta(entry), 50);
}

/* ── PDF thumbnail via PDF.js ── */
async function loadPdfThumb(entry, lib){
  const thumbEl = document.querySelector(`[data-id="${entry.id}"] .fc-thumb`);
  if(!thumbEl) return;
  try {
    const buf = await entry.file.arrayBuffer();
    if(lib){
      const pdf = await lib.getDocument({data:buf.slice(0), password:entry.password||''}).promise;
      entry.info = entry.info || {};
      entry.info.pageCount  = pdf.numPages;
      entry.info.encrypted  = false;
      const page     = await pdf.getPage(1);
      const vp       = page.getViewport({scale:.38});
      const cv       = document.createElement('canvas');
      cv.width=vp.width; cv.height=vp.height;
      await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
      const te = document.querySelector(`[data-id="${entry.id}"] .fc-thumb`);
      if(te){ te.innerHTML=''; te.appendChild(cv); }
    }
  } catch(e){
    entry.info=entry.info||{};
    if(e.name==='PasswordException'){ entry.info.encrypted=true; entry.info.pageCount='?'; }
    else entry.info.pageCount='?';
    const te=document.querySelector(`[data-id="${entry.id}"] .fc-thumb`);
    if(te) te.innerHTML=`<div class="fc-thumb-placeholder pdf"><i class="fas fa-file-pdf"></i><span>PDF</span></div>`;
  }
  updateFileCardMeta(entry);
  if(entry.info?.encrypted){
    const card=document.querySelector(`[data-id="${entry.id}"]`);
    if(card){ card.classList.add('expanded'); const pw=card.querySelector('.pw-field'); if(pw)pw.style.display=''; }
  }
}

function updateFileCardMeta(entry){
  const card=document.querySelector(`[data-id="${entry.id}"]`); if(!card||!entry.info) return;
  const metaEl=card.querySelector('.fc-meta'); if(!metaEl) return;
  const {pageCount,encrypted}=entry.info;
  const pagesHtml = pageCount&&pageCount!=='?'
    ? `<span class="fc-pill"><i class="fas fa-book-open"></i>${pageCount} ${entry.type==='img'?'pg (auto)':pageCount===1?'page':'pages'}</span>`
    : `<span class="fc-pill"><i class="fas fa-question"></i>?</span>`;
  metaEl.innerHTML = `
    ${pagesHtml}
    <span class="fc-pill"><i class="fas fa-database"></i>${fmtB(entry.file.size)}</span>
    ${encrypted?`<span class="fc-pill enc"><i class="fas fa-lock"></i>Encrypted</span>`:''}
  `;
  updateLiveStats();
}

/* ══════════════════════════════════════════════════════
   RENDER FILE LIST
══════════════════════════════════════════════════════ */
function renderFileList(){
  fileList.innerHTML='';
  files.forEach((e,i)=> fileList.appendChild(mkFileCard(e,i)));
  if(sortable) sortable.destroy();
  sortable=Sortable.create(fileList,{
    animation:160, handle:'.fc-handle',
    ghostClass:'sortable-ghost', chosenClass:'sortable-chosen',
    onStart(){ window.SOUNDS?.playDragStartSound(); },
    onEnd(ev){
      const m=files.splice(ev.oldIndex,1)[0];
      files.splice(ev.newIndex,0,m);
      updateCounts(); updateNums();
      if(ev.oldIndex!==ev.newIndex) window.SOUNDS?.playDragDropSound();
    },
  });
}

function mkFileCard(entry,idx){
  const card=document.createElement('div');
  card.className=`file-card entering${entry.type==='img'?' is-img':''}`;
  card.setAttribute('data-id',entry.id);
  card.setAttribute('role','listitem');
  card.setAttribute('tabindex','0');
  setTimeout(()=>card.classList.remove('entering'),320);

  const isImage=entry.type==='img';
  const name=trunc(entry.displayName||entry.file.name, 36);
  const thumbHtml=`<div class="fc-thumb"><div class="fc-thumb-spinner"></div></div>`;
  const typeLabel=isImage
    ?`<span class="fc-type-badge img">IMG</span>`
    :`<span class="fc-type-badge pdf">PDF</span>`;

  card.innerHTML=`
    <div class="fc-handle" title="Drag to reorder"><i class="fas fa-grip-dots-vertical"></i></div>
    ${thumbHtml}
    <div class="fc-info">
      <div class="fc-name" title="${entry.displayName||entry.file.name}">${name}</div>
      <div class="fc-meta">
        <span class="fc-pill"><i class="fas fa-database"></i>${fmtB(entry.file.size)}</span>
      </div>
      <div class="fc-expand">
        <div class="fc-field-row">
          ${!isImage?`
          <div class="fc-field">
            <label><i class="fas fa-list-ol"></i>Page Range</label>
            <input type="text" class="pr-input" value="${entry.pageRange}" placeholder="e.g. 1-3, odd, even, last 2" />
            <div class="pr-quick">
              <button type="button" class="pr-q-btn${!entry.pageRange?' active':''}" data-r="">All</button>
              <button type="button" class="pr-q-btn" data-r="odd">Odd</button>
              <button type="button" class="pr-q-btn" data-r="even">Even</button>
              <button type="button" class="pr-q-btn" data-r="first 1">First</button>
              <button type="button" class="pr-q-btn" data-r="last 1">Last</button>
            </div>
          </div>
          <div class="fc-field pw-field" style="display:none">
            <label><i class="fas fa-lock"></i>Password</label>
            <input type="password" class="pw-input" value="${entry.password}" placeholder="PDF password" autocomplete="off" />
          </div>`:'<div class="fc-field"><label><i class="fas fa-image"></i>Image (auto-converted to PDF page)</label><div style="font-size:.74rem;color:var(--text3);padding:6px 0">This image will be converted to a PDF page at full quality during merge.</div></div>'}
        </div>
        <div class="fc-field-row">
          <div class="fc-field">
            <label><i class="fas fa-tag"></i>Display Name (TOC/Separator)</label>
            <input type="text" class="dn-input" value="${entry.displayName||''}" placeholder="${entry.file.name}" maxlength="80" />
          </div>
        </div>
      </div>
    </div>
    <div class="fc-actions">
      <div class="fc-num">#${idx+1}</div>
      <div class="fc-btns">
        <button class="fc-btn expand-btn" title="Options"><i class="fas fa-sliders"></i></button>
        <button class="fc-btn remove-btn" title="Remove"><i class="fas fa-trash"></i></button>
      </div>
    </div>
    ${typeLabel}
  `;

  // Page range
  const prIn=card.querySelector('.pr-input');
  prIn&&prIn.addEventListener('change',e=>{ entry.pageRange=e.target.value.trim(); syncPrBtns(card,entry.pageRange); });
  card.querySelectorAll('.pr-q-btn').forEach(b=>{
    b.addEventListener('click',()=>{ entry.pageRange=b.dataset.r; if(prIn)prIn.value=b.dataset.r; syncPrBtns(card,b.dataset.r); });
  });

  // Password
  const pwIn=card.querySelector('.pw-input');
  pwIn&&pwIn.addEventListener('change',e=>{ entry.password=e.target.value; if(entry.password) validateFile(entry); });

  // Display name
  const dnIn=card.querySelector('.dn-input');
  dnIn&&dnIn.addEventListener('change',e=>{
    entry.displayName=e.target.value.trim()||entry.file.name;
    card.querySelector('.fc-name').textContent=trunc(entry.displayName,36);
  });

  // Expand / remove
  card.querySelector('.expand-btn').addEventListener('click',()=>{
    const willExpand = !card.classList.contains('expanded');
    card.classList.toggle('expanded');
    if(willExpand) window.SOUNDS?.playExpandSound();
    else window.SOUNDS?.playCollapseSound();
  });
  card.querySelector('.remove-btn').addEventListener('click',()=>removeFile(entry.id));

  // Double-click name → expand + focus display name
  card.querySelector('.fc-name').addEventListener('dblclick',()=>{
    card.classList.add('expanded');
    dnIn&&(dnIn.focus(), dnIn.select());
  });

  return card;
}

function syncPrBtns(card,val){
  card.querySelectorAll('.pr-q-btn').forEach(b=>b.classList.toggle('active',b.dataset.r===val));
}

function removeFile(id){
  const idx=files.findIndex(f=>f.id===id); if(idx===-1) return;
  const card=document.querySelector(`[data-id="${id}"]`);
  window.SOUNDS?.playFileRemoveSound();
  const doRemove=()=>{
    files.splice(idx,1);
    originalOrder=originalOrder.filter(i=>i!==id);
    renderFileList(); updateCounts(); checkDuplicates();
    if(!files.length) goUpload();
  };
  if(card&&typeof gsap!=='undefined'){
    gsap.to(card,{duration:.2,x:24,opacity:0,ease:'power2.in',onComplete:doRemove});
  } else doRemove();
}

function updateNums(){
  document.querySelectorAll('.file-card').forEach((c,i)=>{
    const n=c.querySelector('.fc-num'); if(n) n.textContent=`#${i+1}`;
  });
}

/* ══════════════════════════════════════════════════════
   LIVE STATS
══════════════════════════════════════════════════════ */
function updateLiveStats(){
  const n=files.length;
  const sbF=$('sbFiles'); if(sbF) animateCount(sbF,n);

  const totalB=files.reduce((s,f)=>s+f.file.size,0);
  const sbS=$('sbSize'); if(sbS) sbS.textContent=totalB>0?fmtB(totalB):'—';

  const known=files.filter(f=>f.info&&typeof f.info.pageCount==='number');
  const totalP=known.reduce((s,f)=>s+(f.info.pageCount||0),0);
  const sbP=$('sbPages');
  if(sbP){
    if(known.length<files.length&&known.length>0) sbP.textContent=totalP+'+';
    else if(known.length>0) animateCount(sbP,totalP);
    else sbP.textContent='—';
  }

  const estS=Math.max(1,Math.round(totalB/1048576*.5+n*.3));
  const sbE=$('sbEst'); if(sbE) sbE.textContent=estS<60?`~${estS}s`:`~${Math.ceil(estS/60)}m`;

  checkLargePage();
}

function checkLargePage(){
  const b=$('largePageBanner'); if(!b) return;
  const known=files.filter(f=>f.info&&typeof f.info.pageCount==='number');
  const total=known.reduce((s,f)=>s+(f.info.pageCount||0),0);
  if(total>400){
    b.style.display=''; b.innerHTML=`<i class="fas fa-triangle-exclamation"></i> ${total}+ pages detected — processing may take a moment. Consider enabling Compress.`;
  } else b.style.display='none';
}

function updateCounts(){
  const n=files.length;
  const badge=$('fileCountBadge'); if(badge) badge.textContent=`${n} ${n===1?'file':'files'}`;
  const mbc=$('mergeBtnCount'); if(mbc) mbc.textContent=n>0?`${n}`:'';
  if(mergeBtn) mergeBtn.disabled=n<2;
  updateLiveStats();
}

/* ══════════════════════════════════════════════════════
   DUPLICATE DETECTION
══════════════════════════════════════════════════════ */
function checkDuplicates(){
  $('dupeBanner')&&($('dupeBanner').style.display='none');
  const seen=new Map(), dupes=[];
  files.forEach(f=>{ const k=`${f.file.name}__${f.file.size}`; if(seen.has(k)){dupes.push(f.id);dupes.push(seen.get(k));}else seen.set(k,f.id); });
  document.querySelectorAll('.file-card').forEach(c=>c.classList.toggle('has-error',dupes.includes(c.dataset.id)&&false));
  if(dupes.length>0){
    const b=$('dupeBanner'); if(b){ b.style.display=''; b.innerHTML=`<i class="fas fa-triangle-exclamation"></i> ${Math.floor(dupes.length/2)} duplicate file(s) detected. Enable "Dedupe" option to skip identical pages.`; }
  }
}

/* ══════════════════════════════════════════════════════
   SORT
══════════════════════════════════════════════════════ */
function sortFiles(by){
  currentSort=by;
  $$('.sort-btn').forEach(b=>b.classList.toggle('active',b.dataset.sort===by));
  if(by==='order') files.sort((a,b)=>originalOrder.indexOf(a.id)-originalOrder.indexOf(b.id));
  else if(by==='name') files.sort((a,b)=>a.file.name.localeCompare(b.file.name));
  else if(by==='size') files.sort((a,b)=>b.file.size-a.file.size);
  renderFileList(); updateCounts();
  window.SOUNDS?.playSortSound();
  if(typeof gsap!=='undefined') gsap.from('#fileList .file-card',{duration:.22,y:7,stagger:.04,ease:'power2.out'});
}

/* ══════════════════════════════════════════════════════
   QUICK OPTS SYNC
══════════════════════════════════════════════════════ */
function setupQuickSync(){
  function sync(qid,mid){
    const q=$(qid),m=$(mid); if(!q||!m) return;
    q.addEventListener('change',()=>{ m.checked=q.checked; q.closest('.qchip')?.classList.toggle('active',q.checked); });
    m.addEventListener('change',()=>{ q.checked=m.checked; });
  }
  sync('qToc','optToc'); sync('qSep','optSeparators'); sync('qCompress','optCompress'); sync('qBookmarks','optBookmarks');
  // Set initial chip states
  ['qToc','qSep','qCompress','qBookmarks'].forEach(id=>{
    const el=$(id); el&&el.closest('.qchip')?.classList.toggle('active',el.checked);
  });
}

/* ══════════════════════════════════════════════════════
   PRESETS
══════════════════════════════════════════════════════ */
const PRESETS={
  quick:  {toc:false,sep:false,compress:false,bmarks:true,  dupes:false},
  report: {toc:true, sep:true, compress:false,bmarks:true,  dupes:false},
  compact:{toc:false,sep:false,compress:true, bmarks:false, dupes:true },
  archive:{toc:true, sep:true, compress:true, bmarks:true,  dupes:true },
};
function applyPreset(key){
  const p=PRESETS[key]; if(!p) return;
  $$('.preset-btn').forEach(b=>b.classList.toggle('active',b.dataset.preset===key));
  function setO(mid,qid,v){
    const m=$(mid),q=$(qid);
    if(m){ m.checked=v; m.dispatchEvent(new Event('change')); }
    if(q){ q.checked=v; q.closest('.qchip')?.classList.toggle('active',v); }
  }
  setO('optToc','qToc',p.toc); setO('optSeparators','qSep',p.sep);
  setO('optCompress','qCompress',p.compress); setO('optBookmarks','qBookmarks',p.bmarks);
  setO('optSkipDupes',null,p.dupes);
  window.SOUNDS?.playPresetSound();
  showToast(`Preset "${key}" applied`,'success');
}
$$('.preset-btn').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));

/* ══════════════════════════════════════════════════════
   PROGRESS
══════════════════════════════════════════════════════ */
let _pint=null, _pval=0;
const svgCirc=276;
function startProgress(){
  _pval=0;
  const bar=$('progressBar'); if(bar) bar.style.width='0%';
  clearInterval(_pint);
  _pint=setInterval(()=>{
    _pval=Math.min(_pval+Math.random()*3,82);
    const bar=$('progressBar'); if(bar) bar.style.width=_pval+'%';
    updateRing(_pval);
  },130);
}
function completeProgress(){
  clearInterval(_pint);
  const bar=$('progressBar'); if(bar) bar.style.width='100%';
  updateRing(100);
}
function updateRing(pct){
  const r=$('ringFill'); if(!r) return;
  r.style.strokeDashoffset=String(svgCirc*(1-pct/100));
}
function setStep(n){
  for(let i=1;i<=4;i++){
    const el=$(`pstep${i}`); if(!el) continue;
    el.className='pstep'+(i<n?' done':i===n?' active':'');
  }
}
function setMsg(t,s){
  const tEl=$('progressTitle'),sEl=$('progressSub');
  if(tEl) tEl.textContent=t; if(sEl) sEl.textContent=s;
}

/* ══════════════════════════════════════════════════════
   PER-FILE VALIDATION
══════════════════════════════════════════════════════ */
async function validateFile(entry){
  if(entry.type==='img') return; // images don't need validation
  try{
    const fd=new FormData();
    fd.append('file',entry.file,entry.file.name);
    if(entry.password) fd.append('password',entry.password);
    const r=await fetch('/api/merge-pdf/validate',{method:'POST',body:fd});
    if(!r.ok) return;
    const d=await r.json(); if(!d.success) return;
    if(d.encrypted&&!entry.password){
      const card=document.querySelector(`[data-id="${entry.id}"]`);
      if(card){ card.classList.add('expanded'); const pw=card.querySelector('.pw-field'); if(pw)pw.style.display=''; }
    }
    if(d.pages>0){ entry.info=entry.info||{}; entry.info.pageCount=d.pages; }
    if(d.title&&$('optTitle')&&!$('optTitle').value&&files[0]?.id===entry.id) $('optTitle').value=d.title;
    if(d.author&&$('optAuthor')&&!$('optAuthor').value&&files[0]?.id===entry.id) $('optAuthor').value=d.author;
    if(d.title||d.author){
      const card=document.querySelector(`[data-id="${entry.id}"]`);
      if(card){ let m=card.querySelector('.fc-doc-meta'); if(!m){m=document.createElement('div');m.className='fc-doc-meta';card.querySelector('.fc-info')?.appendChild(m);} m.textContent=[d.title,d.author].filter(Boolean).join(' · ').slice(0,50); }
    }
    updateFileCardMeta(entry);
    updateLiveStats();
  } catch(_){}
}

/* ══════════════════════════════════════════════════════
   MERGE
══════════════════════════════════════════════════════ */
async function doMerge(){
  if(files.length<2){ showToast('Add at least 2 files to merge','warn'); return; }
  mergeStart=Date.now();
  window.SOUNDS?.playMergeStartSound();
  goProgress(); startProgress(); setStep(1); setMsg('Uploading files…',`Sending ${files.length} files`);

  try{
    const fd=new FormData();
    files.forEach(e=>fd.append('files',e.file,e.displayName||e.file.name));
    fd.append('add_toc',           String($('optToc')?.checked||false));
    fd.append('add_separators',    String($('optSeparators')?.checked||false));
    fd.append('preserve_bookmarks',String($('optBookmarks')?.checked!==false));
    fd.append('skip_duplicates',   String($('optSkipDupes')?.checked||false));
    fd.append('compress_output',   String($('optCompress')?.checked||false));
    fd.append('normalize_page_size',String($('optNormalize')?.checked||false));
    fd.append('target_page_size',  $('optTargetSize')?.value||'A4');
    fd.append('merge_method',      $('optMethod')?.value||'auto');
    fd.append('output_title',      $('optTitle')?.value||'');
    fd.append('output_author',     $('optAuthor')?.value||'');
    fd.append('output_filename',   smartFilename());
    fd.append('page_ranges',       JSON.stringify(files.map(f=>f.pageRange||'all')));
    fd.append('passwords',         JSON.stringify(files.map(f=>f.password||null)));
    fd.append('display_names',     JSON.stringify(files.map(f=>f.displayName||f.file.name)));
    fd.append('file_types',        JSON.stringify(files.map(f=>f.type)));

    setStep(2); setMsg('Merging files…','Combining PDFs and converting images');

    const resp=await fetch('/api/merge-pdf',{method:'POST',body:fd});

    setStep(3); setMsg('Optimizing…','Finalizing your merged PDF');

    if(!resp.ok){
      let msg=`Error ${resp.status}`;
      try{ const j=await resp.json(); msg=j.error||msg; }catch(_){}
      throw new Error(msg);
    }

    const blob=await resp.blob();
    if(downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl=URL.createObjectURL(blob);

    const elapsed=((Date.now()-mergeStart)/1000).toFixed(1);
    const outSize=blob.size;
    const inSize=files.reduce((s,f)=>s+f.file.size,0);
    const delta=outSize-inSize;
    const pct=(inSize>0?(delta/inSize*100).toFixed(1):'0');
    const totalPages=files.reduce((s,f)=>s+(f.info?.pageCount||0),0);
    const fn=smartFilename();

    mergeResult={filename:fn,outputSize:outSize,inputSize:inSize,totalPages,sourceCount:files.length,elapsed,method:$('optMethod')?.value||'auto'};

    completeProgress(); setStep(4);
    saveRecent(mergeResult);

    setTimeout(()=>{
      goResult();
      fillResult(mergeResult,delta,pct);
      window.SOUNDS?.playSuccessChime();
      launchConfetti();
      renderRecent();
      if(typeof gsap!=='undefined'){
        gsap.from('.result-card',{duration:.45,y:20,ease:'power3.out'});
        gsap.from('.rstat-card',{duration:.35,y:10,stagger:.06,delay:.2,ease:'power2.out'});
      }
    },360);

  } catch(err){
    completeProgress(); goFiles();
    window.SOUNDS?.playErrorSound();
    showToast(err.message||'Merge failed. Please try again.','error');
    console.error('Merge error:',err);
  }
}

function fillResult(r,delta,pct){
  const s=(id,v)=>{ const e=$(id); if(e) e.textContent=v; };
  s('rFiles', r.sourceCount);
  s('rPages', r.totalPages||'—');
  s('rSize',  fmtB(r.outputSize));
  s('rTime',  `${r.elapsed}s`);
  s('rEngine',(r.method==='auto'?'Auto':'').replace('fitz','PyMuPDF').replace('gs','GhostScript')||'Auto');
  const sv=$('rSaved');
  if(sv){ const sign=delta>0?'+':''; sv.textContent=`${sign}${pct}%`; sv.style.color=delta<0?'var(--success)':delta>0?'var(--warn)':'var(--text2)'; }
  const fn=$('resultFnDisplay'),fnr=$('resultFnRow');
  if(fn) fn.textContent=r.filename; if(fnr) fnr.style.display='';
  const sub=$('resultSub'); if(sub) sub.textContent=`${r.sourceCount} files · ${r.totalPages||'?'} pages → ${r.filename}`;
}

/* ══════════════════════════════════════════════════════
   DOWNLOAD
══════════════════════════════════════════════════════ */
function triggerDownload(){
  if(!downloadUrl||!mergeResult) return;
  const a=document.createElement('a');
  a.href=downloadUrl; a.download=mergeResult.filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  window.SOUNDS?.playDownloadWhoosh();
  showToast(`Downloading ${mergeResult.filename}`,'success');
}

/* ══════════════════════════════════════════════════════
   RECENT MERGES
══════════════════════════════════════════════════════ */
function saveRecent(r){
  try{
    const l=loadRecent();
    l.unshift({filename:r.filename,pages:r.totalPages||0,size:r.outputSize||0,count:r.sourceCount||0,date:new Date().toISOString()});
    if(l.length>MAX_RECENT)l.length=MAX_RECENT;
    localStorage.setItem(RECENT_KEY,JSON.stringify(l));
  }catch(_){}
}
function loadRecent(){ try{return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]');}catch(_){return[];} }
function timeAgo(d){ const m=Math.floor((Date.now()-new Date(d))/60000); return m<1?'just now':m<60?`${m}m ago`:Math.floor(m/60)<24?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`; }
function renderRecent(){
  const c=$('recentMerges'); if(!c) return;
  const l=loadRecent(); if(!l.length){c.style.display='none';return;}
  c.style.display='';
  c.innerHTML=`<div class="recent-title"><i class="fas fa-history"></i> Recent Merges</div>
  <div class="recent-list">${l.map(m=>`
    <div class="recent-item">
      <i class="fas fa-file-pdf"></i>
      <div class="recent-info">
        <div class="recent-filename" title="${m.filename}">${trunc(m.filename,40)}</div>
        <div class="recent-meta">${m.count} files · ${m.pages} pages · ${fmtB(m.size)}</div>
      </div>
      <div class="recent-date">${timeAgo(m.date)}</div>
    </div>`).join('')}
  </div>`;
}

/* ══════════════════════════════════════════════════════
   COPY FILENAME
══════════════════════════════════════════════════════ */
function copyFilename(){
  if(!mergeResult) return;
  navigator.clipboard.writeText(mergeResult.filename).then(()=>{
    window.SOUNDS?.playCopySound();
    showToast(`"${mergeResult.filename}" copied!`,'success');
    const btn=$('copyNameBtn'); if(!btn) return;
    btn.classList.add('copied'); btn.innerHTML='<i class="fas fa-check"></i> Copied!';
    setTimeout(()=>{ btn.classList.remove('copied'); btn.innerHTML='<i class="fas fa-copy"></i> Copy Name'; },2200);
  }).catch(()=>showToast(mergeResult.filename,'info'));
}

/* ══════════════════════════════════════════════════════
   SHORTCUTS MODAL
══════════════════════════════════════════════════════ */
const showSCM=()=>{
  const m=$('shortcutsModal'); if(!m) return;
  m.removeAttribute('hidden');
  if(typeof gsap!=='undefined') gsap.from(m.querySelector('.modal-card'),{duration:.28,y:-16,ease:'power2.out'});
  $('shortcutsClose')?.focus();
};
const hideSCM=()=>$('shortcutsModal')?.setAttribute('hidden','');
$('shortcutsClose')?.addEventListener('click',hideSCM);
$('shortcutsModal')?.addEventListener('click',e=>{ if(e.target===$('shortcutsModal')) hideSCM(); });
$('shortcutsHintBtn')?.addEventListener('click',showSCM);

/* ══════════════════════════════════════════════════════
   DROP ZONE
══════════════════════════════════════════════════════ */
dropZone.addEventListener('click',e=>{
  if(e.target.closest('.drop-browse')||e.target===dropZone||e.target.closest('.drop-content')) fileInput.click();
});
dropZone.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){e.preventDefault();fileInput.click();} });
fileInput.addEventListener('change',e=>{ if(e.target.files.length)addFiles(e.target.files); fileInput.value=''; });
$('addMoreBtn')?.addEventListener('click',()=>addMoreInput.click());
addMoreInput.addEventListener('change',e=>{ if(e.target.files.length)addFiles(e.target.files); addMoreInput.value=''; });
$('clearAllBtn')?.addEventListener('click',()=>{
  if(!files.length) return;
  if(typeof gsap!=='undefined') gsap.to('#fileList .file-card',{duration:.18,x:16,opacity:0,stagger:.04,onComplete:goUpload});
  else goUpload();
});

// Drag events on dropzone
['dragenter','dragover'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.add('drag-over');}));
['dragleave','drop'].forEach(ev=>dropZone.addEventListener(ev,e=>{e.preventDefault();dropZone.classList.remove('drag-over');}));
dropZone.addEventListener('drop',e=>{ if(e.dataTransfer?.files.length)addFiles(e.dataTransfer.files); });

// Global drag indicator
let _dc=0;
document.addEventListener('dragenter',e=>{ if(!e.dataTransfer?.types.includes('Files'))return; _dc++; globalDragInd?.classList.add('active'); });
document.addEventListener('dragleave',()=>{ _dc=Math.max(0,_dc-1); if(!_dc) globalDragInd?.classList.remove('active'); });
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{
  _dc=0; globalDragInd?.classList.remove('active');
  if(e.target.closest('#dropZone')) return;
  e.preventDefault();
  if(e.dataTransfer?.files.length) addFiles(e.dataTransfer.files);
});

/* ══════════════════════════════════════════════════════
   BUTTON WIRING
══════════════════════════════════════════════════════ */
mergeBtn?.addEventListener('click',doMerge);
downloadBtn?.addEventListener('click',triggerDownload);
mergeAgainBtn?.addEventListener('click',()=>{ window.SOUNDS?.playMergeAgainSound(); goUpload(); });
$('copyNameBtn')?.addEventListener('click',copyFilename);

// Options panel
$('optionsToggle')?.addEventListener('click',()=>{
  const t=$('optionsToggle'),b=$('optionsBody');
  const open=t.getAttribute('aria-expanded')==='true';
  t.setAttribute('aria-expanded',String(!open));
  if(open) b.setAttribute('hidden','');
  else{ b.removeAttribute('hidden'); if(typeof gsap!=='undefined')gsap.from(b,{duration:.25,y:-8,ease:'power2.out'}); }
});
$('optNormalize')?.addEventListener('change',()=>{ const f=$('pageSizeField'); if(f)f.style.display=$('optNormalize').checked?'':'none'; });

// Sort buttons
$$('.sort-btn').forEach(b=>b.addEventListener('click',()=>sortFiles(b.dataset.sort)));

/* ══════════════════════════════════════════════════════
   FAQ ACCORDION
══════════════════════════════════════════════════════ */
$$('.faq-q').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const item=btn.closest('.faq-item'), isOpen=item.classList.contains('open');
    $$('.faq-item.open').forEach(i=>{i.classList.remove('open');i.querySelector('.faq-q').setAttribute('aria-expanded','false');});
    if(!isOpen){item.classList.add('open');btn.setAttribute('aria-expanded','true');}
  });
});

/* ══════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════════════════ */
document.addEventListener('keydown',e=>{
  const inp=e.target.matches('input,textarea,[contenteditable]');
  if(e.key==='?'&&!inp){showSCM();return;}
  if(e.key==='Escape'){hideSCM();return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='o'){e.preventDefault();filesSec&&!filesSec.hidden?addMoreInput.click():fileInput.click();return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='m'){e.preventDefault();files.length>=2?doMerge():showToast('Add at least 2 files','warn');return;}
  if(e.key==='Delete'&&!inp){
    const id=document.activeElement.closest('.file-card')?.getAttribute('data-id');
    if(id)removeFile(id);
  }
  if(e.altKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')&&!inp){
    const card=document.activeElement.closest('.file-card'); if(!card) return;
    e.preventDefault();
    const id=card.getAttribute('data-id'), idx=files.findIndex(f=>f.id===id);
    if(idx===-1) return;
    const ni=e.key==='ArrowUp'?idx-1:idx+1; if(ni<0||ni>=files.length) return;
    [files[idx],files[ni]]=[files[ni],files[idx]];
    originalOrder=files.map(f=>f.id);
    renderFileList(); updateCounts();
    setTimeout(()=>{ const m=document.querySelector(`[data-id="${id}"]`); m?.focus(); m?.scrollIntoView({behavior:'smooth',block:'nearest'}); },50);
    showToast(e.key==='ArrowUp'?'↑ Moved up':'↓ Moved down','info');
  }
});

/* ══════════════════════════════════════════════════════
   GSAP SCROLL ANIMATIONS (defer-safe)
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',()=>{
  const tryGSAP=()=>{
    if(typeof gsap==='undefined'||typeof ScrollTrigger==='undefined'){setTimeout(tryGSAP,120);return;}
    gsap.registerPlugin(ScrollTrigger);
    // Hero — y-only (NEVER opacity:0 above fold)
    gsap.from('.hero-badge',             {duration:.5,y:-16,delay:.05,ease:'power2.out'});
    gsap.from('.hero-title .title-line1',{duration:.6,y:24, delay:.15,ease:'power3.out'});
    gsap.from('.hero-title .title-line2',{duration:.6,y:24, delay:.27,ease:'power3.out'});
    gsap.from('.hero-subtitle',          {duration:.5,y:16, delay:.36,ease:'power2.out'});
    gsap.from('.stat-pill',              {duration:.4,y:12, delay:.44,stagger:.07,ease:'power2.out'});
    gsap.from('.upload-zone',            {duration:.55,y:22,delay:.52,ease:'power3.out'});
    // Scroll sections
    ['.step-card','.feature-card','.faq-item','.related-card','.section-title'].forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        gsap.from(el,{scrollTrigger:{trigger:el,start:'top 90%',once:true},duration:.48,y:22,ease:'power2.out'});
      });
    });
  };
  setTimeout(tryGSAP,180);
});

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
loadPDFJS();
setupQuickSync();
updateCounts();
renderRecent();
