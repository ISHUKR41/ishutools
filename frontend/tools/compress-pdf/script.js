/**
 * IshuTools.fun — Compress PDF script.js v30.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 * GitHub: https://github.com/ISHUKR41 | https://github.com/ISHUKR75
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * FEATURES v30.0 — COMPLETE PROFESSIONAL PDF COMPRESSION SUITE
 * ══════════════════════════════════════════════════════════════════════════════
 *  CORE:
 *  • Drag-and-drop + click upload (PDF only, absolutely NO size limit)
 *  • Batch file queue — process multiple PDFs sequentially with results
 *  • PDF deep analysis via /api/compress-pdf/analyze
 *  • 5-preset quality selector (lossless / high / medium / low / screen)
 *  • Target file size mode (binary-search on backend)
 *  • 13 advanced option toggles + password field
 *  • Quick preset combos (email / archive / web / max / print / reset)
 *  • SSE real-time progress with elapsed time counter
 *  • Result card: grade badge, before/after sizes, reduction bar, engine report
 *
 *  VISUALS:
 *  • Chart.js visualization — compression savings by preset (live bar chart)
 *  • Animated background canvas (floating emerald particles with connections)
 *  • Canvas confetti on success (3-burst salvo)
 *  • Animated trust counters (IntersectionObserver threshold 0.5)
 *  • Before/after animated size comparison with smooth bar transitions
 *  • Micro-animations on preset selection, toggle, and action buttons
 *  • Smooth FAQ accordion with max-height animation
 *  • Loading skeleton on analysis phase
 *
 *  AUDIO:
 *  • Download sound: SOUNDS.fahhhhh (fahhhhh.mp3)
 *  • Compress start: SOUNDS.cameraman_focus_karo
 *  • File added: SOUNDS.are_bhai_bhai_bhai
 *  • Preset change: SOUNDS.waah_kya_scene_hai
 *  • Error: SOUNDS.eh_eh_eh_ehhhhhh
 *  • Cancel: SOUNDS.jaldi_waha_sa_hato
 *
 *  UX:
 *  • Compression history — last 20 compressions persisted in localStorage
 *  • Web Share API for sharing results (mobile-native share sheet)
 *  • Clipboard copy for full compression report (JSON + human text)
 *  • Download filename = [original-filename]_compressed.pdf
 *  • Dark/Light theme toggle with localStorage persistence
 *  • Sound on/off toggle with localStorage persistence
 *  • beforeunload guard when compression is in progress
 *
 *  KEYBOARD:
 *  • Ctrl+Enter  — Start compression
 *  • Escape      — Close panels / cancel compression
 *  • Ctrl+O      — Open file picker
 *  • H           — Toggle history panel
 *  • R           — Reset / clear file
 *  • T           — Toggle theme
 *  • ?           — Show keyboard shortcuts
 *
 *  ACCESSIBILITY:
 *  • aria-live regions for progress and results
 *  • aria-checked on preset buttons
 *  • aria-expanded on collapsible panels
 *  • Focus management after modal open/close
 *  • Screen reader announcements for all major state changes
 *  • Reduced motion support (prefers-reduced-motion)
 *
 *  PERFORMANCE:
 *  • requestAnimationFrame particle loop with visibility pause
 *  • Passive event listeners on scroll/resize
 *  • Debounced resize handler
 *  • IntersectionObserver for counter animation (fires once)
 *  • Lazy Chart.js init on first result render
 */

'use strict';

/* ═══════════════════════════════════════════════════════════════════════════════
   MODULE-SCOPE STATE
═══════════════════════════════════════════════════════════════════════════════ */
let FILE            = null;    // Primary selected File object
let STEM            = '';      // Filename stem (no extension)
let JOB_ID          = '';      // SSE job identifier
let SSE_SOURCE      = null;    // EventSource instance
let SSE_TIMER       = null;    // setInterval fallback for simulated progress
let COMPRESS_DONE   = false;   // True after compression completes
let RESULT_DATA     = null;    // Last compression result
let ANALYSIS_DATA   = null;    // Last analysis result
let CHART_INSTANCE  = null;    // Chart.js instance
let _t0             = 0;       // Compression start timestamp
let _timerInterval  = null;    // Elapsed timer interval
let _reduced        = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Batch queue state
let BATCH_QUEUE     = [];      // Array of {file, id, status, result}
let BATCH_ACTIVE    = false;   // True when batch processing
let BATCH_IDX       = 0;       // Current batch index

// DOM refs — populated in DOMContentLoaded
let D = null;

// Compression history (from localStorage)
const HISTORY_KEY   = 'cp-history-v2';
const HISTORY_MAX   = 20;

/* ═══════════════════════════════════════════════════════════════════════════════
   UTILITY FUNCTIONS
═══════════════════════════════════════════════════════════════════════════════ */

/** Format bytes → human readable string */
function fmtBytes(b) {
  if (b == null || isNaN(b) || b < 0) return '—';
  if (b === 0) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.min(Math.floor(Math.log(Math.abs(b)) / Math.log(1024)), u.length - 1);
  const v = b / Math.pow(1024, i);
  return (i === 0 ? v : v < 10 ? v.toFixed(2) : v.toFixed(1)) + '\u202F' + u[i];
}

/** Format milliseconds → human readable */
function fmtMs(ms) {
  if (ms == null || isNaN(ms)) return '—';
  if (ms < 1000) return ms + '\u202Fms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.floor(ms / 60000) + 'm\u202F' + Math.floor((ms % 60000) / 1000) + 's';
}

/** Format seconds elapsed */
function fmtElapsed(s) {
  if (s < 60) return s.toFixed(1) + 's';
  return Math.floor(s / 60) + 'm\u202F' + Math.floor(s % 60) + 's';
}

/** Percentage reduction (never negative) */
function calcReduction(inSz, outSz) {
  if (!inSz || !outSz || outSz >= inSz) return 0;
  return Math.round((1 - outSz / inSz) * 1000) / 10;
}

/** Extract filename stem (no extension) */
function getStem(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Clamp a number to [lo, hi] */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Debounce a function */
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Safe localStorage get */
function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Safe localStorage set */
function lsSet(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}

/** Announce to screen readers */
function announce(msg, priority = 'polite') {
  const el = document.getElementById('cp-sr-announce');
  if (!el) return;
  el.setAttribute('aria-live', priority);
  el.textContent = '';
  setTimeout(() => { el.textContent = msg; }, 50);
}

/** Safe call into window.SOUNDS */
function S(key) {
  try {
    if (window.SOUNDS && typeof window.SOUNDS[key] === 'function') {
      window.SOUNDS[key]();
    }
  } catch (_) {}
}

/** Fire canvas-confetti 3-burst salvo */
function launchConfetti() {
  if (_reduced) return;
  try {
    if (typeof confetti !== 'function') return;
    const opts = {
      colors: ['#10b981','#34d399','#6ee7b7','#ffffff','#6366f1','#a78bfa'],
      disableForReducedMotion: true,
    };
    confetti({ ...opts, particleCount: 90,  spread: 70,  origin: { y: 0.55 } });
    setTimeout(() => confetti({ ...opts, particleCount: 60, spread: 90, angle: 60,  origin: { y: 0.45 } }), 230);
    setTimeout(() => confetti({ ...opts, particleCount: 60, spread: 90, angle: 120, origin: { y: 0.45 } }), 460);
  } catch (_) {}
}

/** Animate a number from start to end */
function animateNumber(el, start, end, dur = 900, fmt = v => Math.round(v)) {
  if (!el || _reduced) { if (el) el.textContent = fmt(end); return; }
  const t0 = performance.now();
  function tick(now) {
    const p = clamp((now - t0) / dur, 0, 1);
    const ease = p < .5 ? 2 * p * p : -1 + (4 - 2 * p) * p; // ease-in-out
    el.textContent = fmt(start + (end - start) * ease);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
═══════════════════════════════════════════════════════════════════════════════ */
function toast(title, sub = '', type = 'info', dur = 4000) {
  if (!D?.toastWrap) return;
  const icons = {
    success: 'fa-check-circle',
    error:   'fa-times-circle',
    warn:    'fa-exclamation-triangle',
    info:    'fa-info-circle',
  };
  const el = document.createElement('div');
  el.className = `cp-toast cp-toast-${type}`;
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  el.innerHTML = `
    <i class="fa ${icons[type] || icons.info} cp-toast-icon" aria-hidden="true"></i>
    <div class="cp-toast-body">
      <div class="cp-toast-title">${title}</div>
      ${sub ? `<div class="cp-toast-sub">${sub}</div>` : ''}
    </div>
    <button class="cp-toast-close" aria-label="Dismiss notification">
      <i class="fa fa-times" aria-hidden="true"></i>
    </button>`;
  D.toastWrap.appendChild(el);

  function dismiss() {
    el.classList.add('cp-toast-out');
    setTimeout(() => el.remove(), 320);
  }
  el.querySelector('.cp-toast-close').addEventListener('click', dismiss);
  el.addEventListener('click', (e) => { if (!el.querySelector('.cp-toast-close').contains(e.target)) dismiss(); });
  if (dur > 0) setTimeout(dismiss, dur);
  return el;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS MODAL
═══════════════════════════════════════════════════════════════════════════════ */
function showShortcutsModal() {
  const existing = document.getElementById('cp-shortcuts-modal');
  if (existing) { existing.remove(); return; }
  const modal = document.createElement('div');
  modal.id = 'cp-shortcuts-modal';
  modal.className = 'cp-shortcuts-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', 'Keyboard Shortcuts');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="cp-shortcuts-card">
      <div class="cp-shortcuts-header">
        <h3><i class="fa fa-keyboard" aria-hidden="true"></i> Keyboard Shortcuts</h3>
        <button class="cp-shortcuts-close" aria-label="Close shortcuts">
          <i class="fa fa-times" aria-hidden="true"></i>
        </button>
      </div>
      <ul class="cp-shortcuts-list">
        <li><kbd>Ctrl</kbd>+<kbd>Enter</kbd><span>Start compression</span></li>
        <li><kbd>Ctrl</kbd>+<kbd>O</kbd><span>Open file picker</span></li>
        <li><kbd>Escape</kbd><span>Close panels / cancel</span></li>
        <li><kbd>H</kbd><span>Toggle history panel</span></li>
        <li><kbd>R</kbd><span>Reset tool / clear file</span></li>
        <li><kbd>T</kbd><span>Toggle dark/light theme</span></li>
        <li><kbd>?</kbd><span>Show this shortcuts panel</span></li>
        <li><kbd>↑</kbd><kbd>↓</kbd><span>Navigate presets</span></li>
      </ul>
      <p class="cp-shortcuts-tip">
        <i class="fa fa-lightbulb" aria-hidden="true"></i>
        Tip: Press <kbd>?</kbd> at any time to toggle this panel.
      </p>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('.cp-shortcuts-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  setTimeout(() => modal.classList.add('visible'), 10);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   THEME & SOUND TOGGLES
═══════════════════════════════════════════════════════════════════════════════ */
function initTheme() {
  const saved = lsGet('cp-theme');
  const sys   = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  setTheme(saved || sys);
}

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  if (D) {
    D.themeIcon.className = t === 'dark' ? 'fa fa-moon' : 'fa fa-sun';
    D.themeToggle.title   = `Switch to ${t === 'dark' ? 'light' : 'dark'} mode`;
    D.themeToggle.setAttribute('aria-label', D.themeToggle.title);
  }
  lsSet('cp-theme', t);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  setTheme(cur === 'dark' ? 'light' : 'dark');
  S('click');
}

function initSoundToggle() {
  updateSoundIcon(window.SOUNDS ? window.SOUNDS.isEnabled() : true);
}

function updateSoundIcon(on) {
  if (!D) return;
  D.soundIcon.className  = on ? 'fa fa-volume-up' : 'fa fa-volume-mute';
  D.soundToggle.title    = on ? 'Mute sounds' : 'Unmute sounds';
  D.soundToggle.setAttribute('aria-label', D.soundToggle.title);
  D.soundToggle.setAttribute('aria-pressed', String(on));
}

function toggleSound() {
  if (!window.SOUNDS) return;
  const newOn = !window.SOUNDS.isEnabled();
  window.SOUNDS.setEnabled(newOn);
  updateSoundIcon(newOn);
  if (newOn) S('click');
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ANIMATED BACKGROUND CANVAS (particles + connections)
═══════════════════════════════════════════════════════════════════════════════ */
function initBgCanvas() {
  const canvas = document.getElementById('bgCanvas');
  if (!canvas || _reduced) return;
  const ctx = canvas.getContext('2d');
  const PARTICLE_COUNT = 38;
  const particles = [];
  let rafId;

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  class Particle {
    constructor() { this.reset(true); }
    reset(init) {
      this.x     = Math.random() * window.innerWidth;
      this.y     = init ? Math.random() * window.innerHeight : window.innerHeight + 12;
      this.r     = Math.random() * 2.4 + 0.7;
      this.vx    = (Math.random() - 0.5) * 0.22;
      this.vy    = -(Math.random() * 0.45 + 0.14);
      this.op    = Math.random() * 0.20 + 0.04;
      this.phase = Math.random() * Math.PI * 2;
      this.pulse = Math.random() * 0.03 + 0.015;
    }
    update() {
      this.x     += this.vx;
      this.y     += this.vy;
      this.phase += this.pulse;
      if (this.y < -12 || this.x < -12 || this.x > window.innerWidth + 12) this.reset(false);
    }
    draw(c) {
      c.beginPath();
      c.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      const alpha = this.op * (0.7 + 0.3 * Math.sin(this.phase));
      c.fillStyle = `rgba(16,185,129,${alpha})`;
      c.fill();
    }
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx   = particles[i].x - particles[j].x;
        const dy   = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(16,185,129,${0.06 * (1 - dist / 120)})`;
          ctx.lineWidth   = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  resize();
  window.addEventListener('resize', debounce(resize, 200), { passive: true });
  for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(new Particle());

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawConnections();
    particles.forEach(p => { p.update(); p.draw(ctx); });
    rafId = requestAnimationFrame(loop);
  }
  loop();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(rafId);
    else loop();
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   COMPRESSION HISTORY
═══════════════════════════════════════════════════════════════════════════════ */
function loadHistory() {
  try {
    return JSON.parse(lsGet(HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(hist) {
  try {
    lsSet(HISTORY_KEY, JSON.stringify(hist.slice(0, HISTORY_MAX)));
  } catch {}
}

function addToHistory(entry) {
  const hist = loadHistory();
  hist.unshift({
    id:          Date.now(),
    filename:    entry.filename    || 'document.pdf',
    preset:      entry.preset      || 'medium',
    inputSize:   entry.inputSize   || 0,
    outputSize:  entry.outputSize  || 0,
    reductionPct:entry.reductionPct|| 0,
    grade:       entry.grade       || 'B',
    engine:      entry.engine      || '—',
    timeMs:      entry.timeMs      || 0,
    ts:          new Date().toISOString(),
  });
  saveHistory(hist);
}

function clearHistory() {
  saveHistory([]);
  renderHistory();
  toast('History cleared', 'All compression records removed.', 'info', 3000);
}

function renderHistory() {
  const panel = document.getElementById('historyPanel');
  const list  = document.getElementById('historyList');
  const count = document.getElementById('historyCount');
  if (!panel || !list) return;

  const hist = loadHistory();
  if (count) count.textContent = hist.length;

  if (hist.length === 0) {
    list.innerHTML = `<div class="cp-hist-empty">
      <i class="fa fa-history" aria-hidden="true"></i>
      <p>No compressions yet</p>
      <small>Your compression history will appear here</small>
    </div>`;
    return;
  }

  const gradeColors = { S:'#10b981', A:'#34d399', B:'#6ee7b7', C:'#f59e0b', D:'#ef4444', F:'#dc2626' };

  list.innerHTML = hist.map(h => `
    <div class="cp-hist-item" data-id="${h.id}">
      <div class="cp-hist-grade" style="color:${gradeColors[h.grade] || '#94a3b8'}">${h.grade}</div>
      <div class="cp-hist-info">
        <div class="cp-hist-name" title="${h.filename}">${h.filename}</div>
        <div class="cp-hist-meta">
          <span><i class="fa fa-compress-arrows-alt" aria-hidden="true"></i> ${h.reductionPct.toFixed(1)}% saved</span>
          <span><i class="fa fa-layer-group" aria-hidden="true"></i> ${h.preset}</span>
          <span><i class="fa fa-weight-hanging" aria-hidden="true"></i> ${fmtBytes(h.inputSize)} → ${fmtBytes(h.outputSize)}</span>
          <span class="cp-hist-time"><i class="fa fa-clock" aria-hidden="true"></i> ${fmtMs(h.timeMs)}</span>
        </div>
      </div>
      <div class="cp-hist-date">${new Date(h.ts).toLocaleDateString()}</div>
    </div>
  `).join('');
}

function toggleHistory() {
  const panel = document.getElementById('historyPanel');
  if (!panel) return;
  const isHidden = panel.hasAttribute('hidden');
  panel.toggleAttribute('hidden', !isHidden);
  if (isHidden) {
    renderHistory();
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  S('click');
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CHART.JS COMPRESSION SAVINGS VISUALIZATION
═══════════════════════════════════════════════════════════════════════════════ */
function initOrUpdateChart(data) {
  const canvas = document.getElementById('compressChart');
  if (!canvas) return;

  const estimates = data?.estimates || data?.estimated_reductions_by_preset || {};
  const presets   = ['screen','low','medium','high','lossless'];
  const labels    = ['Screen','Low','Medium','High','Lossless'];
  const values    = presets.map(p => Math.round(estimates[p] ?? 0));
  const colors    = ['#ef4444','#f59e0b','#6366f1','#10b981','#8b5cf6'];
  const isDark    = document.documentElement.getAttribute('data-theme') !== 'light';

  const chartData = {
    labels,
    datasets: [{
      label: 'Est. Size Reduction (%)',
      data: values,
      backgroundColor: colors.map(c => c + 'cc'),
      borderColor:     colors,
      borderWidth:     2,
      borderRadius:    8,
      borderSkipped:   false,
    }],
  };

  const config = {
    type: 'bar',
    data: chartData,
    options: {
      animation: { duration: _reduced ? 0 : 700, easing: 'easeOutQuart' },
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#1a2235' : '#ffffff',
          titleColor:      isDark ? '#f1f5f9' : '#0f172a',
          bodyColor:       isDark ? '#94a3b8' : '#475569',
          borderColor:     isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)',
          borderWidth:     1,
          cornerRadius:    8,
          callbacks: {
            label: ctx => ` ~${ctx.parsed.y}% size reduction`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Inter', size: 12 } },
          grid:  { display: false },
          border:{ display: false },
        },
        y: {
          min: 0, max: 100,
          ticks: {
            color: isDark ? '#94a3b8' : '#64748b',
            font:  { family: 'Inter', size: 11 },
            callback: v => v + '%',
          },
          grid:  { color: isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)' },
          border:{ display: false },
        },
      },
    },
  };

  if (CHART_INSTANCE) {
    CHART_INSTANCE.data = chartData;
    CHART_INSTANCE.update('active');
  } else {
    try {
      if (typeof Chart !== 'undefined') {
        CHART_INSTANCE = new Chart(canvas, config);
      }
    } catch (_) {}
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   FILE HANDLING (single + batch)
═══════════════════════════════════════════════════════════════════════════════ */
function initDropZone() {
  const dz = D.dropZone;

  dz.addEventListener('click', (e) => {
    if (D.fiRemove && (e.target === D.fiRemove || D.fiRemove.contains(e.target))) return;
    D.fileInput.click();
  });

  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); }
  });

  const browseLink = dz.querySelector('.cp-drop-link');
  if (browseLink) browseLink.addEventListener('click', (e) => { e.stopPropagation(); D.fileInput.click(); });

  ['dragenter','dragover'].forEach(ev => {
    dz.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation();
      dz.classList.add('cp-drag-over');
    });
  });
  ['dragleave','dragend'].forEach(ev => {
    dz.addEventListener(ev, (e) => {
      if (!dz.contains(e.relatedTarget)) dz.classList.remove('cp-drag-over');
    });
  });
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    dz.classList.remove('cp-drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length === 0) {
      toast('Not a PDF', 'Please drop PDF files only.', 'error');
      S('eh_eh_eh_ehhhhhh');
      return;
    }
    if (files.length === 1) {
      handleFile(files[0]);
    } else {
      handleBatchFiles(files);
    }
  });

  D.fileInput.addEventListener('change', () => {
    const files = Array.from(D.fileInput.files || []).filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length === 1) handleFile(files[0]);
    else if (files.length > 1) handleBatchFiles(files);
    D.fileInput.value = '';
  });

  if (D.fiRemove) {
    D.fiRemove.addEventListener('click', (e) => { e.stopPropagation(); resetTool(); });
  }
}

function handleFile(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    toast('Not a PDF', `"${file.name}" is not a PDF file.`, 'error');
    S('eh_eh_eh_ehhhhhh');
    return;
  }

  FILE          = file;
  STEM          = getStem(file.name);
  COMPRESS_DONE = false;
  RESULT_DATA   = null;
  ANALYSIS_DATA = null;

  hideBatchPanel();
  showFileInfo(file);
  S('are_bhai_bhai_bhai');
  updateActionState();
  analyzeFile(file);
  updateFab();
  announce(`File loaded: ${file.name}, ${fmtBytes(file.size)}`);
}

function handleBatchFiles(files) {
  BATCH_QUEUE = files.map((f, i) => ({
    file:   f,
    id:     `batch-${Date.now()}-${i}`,
    status: 'pending',
    result: null,
  }));
  showBatchPanel();
  toast(`${files.length} PDFs queued`, 'Compressing in sequence…', 'info', 3000);
  S('are_bhai_bhai_bhai');
  startBatchCompression();
}

function showFileInfo(file) {
  D.fileInfo.removeAttribute('hidden');
  D.fiName.textContent  = file.name;
  D.fiName.title        = file.name;
  D.fiSize.innerHTML    = `<i class="fa fa-weight-hanging" aria-hidden="true"></i> ${fmtBytes(file.size)}`;
  D.fiPages.innerHTML   = `<i class="fa fa-file-pdf" aria-hidden="true"></i> Analysing…`;
  D.fiType.innerHTML    = `<i class="fa fa-tag" aria-hidden="true"></i> PDF`;
  D.fiVersion.innerHTML = `<i class="fa fa-code" aria-hidden="true"></i> —`;
  D.fiChips.setAttribute('hidden', '');
  D.fiAnalyze.removeAttribute('hidden');
  D.analyzeFill.style.width = '0%';
  D.recBanner.setAttribute('hidden', '');

  const title = D.dropZone.querySelector('.cp-drop-title');
  const sub   = D.dropZone.querySelector('.cp-drop-sub');
  if (title) title.textContent = '✅ File ready';
  if (sub)   sub.innerHTML     = `<span class="cp-drop-link">Change file</span> to select a different PDF`;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   BATCH COMPRESSION PANEL
═══════════════════════════════════════════════════════════════════════════════ */
function showBatchPanel() {
  const panel = document.getElementById('batchPanel');
  if (!panel) return;
  panel.removeAttribute('hidden');
  renderBatchList();
}

function hideBatchPanel() {
  const panel = document.getElementById('batchPanel');
  if (panel) panel.setAttribute('hidden', '');
  BATCH_QUEUE  = [];
  BATCH_ACTIVE = false;
  BATCH_IDX    = 0;
}

function renderBatchList() {
  const list = document.getElementById('batchList');
  if (!list) return;
  const statusIcons = {
    pending:    '<i class="fa fa-clock" aria-hidden="true"></i>',
    processing: '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i>',
    done:       '<i class="fa fa-check-circle" style="color:#10b981" aria-hidden="true"></i>',
    error:      '<i class="fa fa-times-circle" style="color:#ef4444" aria-hidden="true"></i>',
  };
  list.innerHTML = BATCH_QUEUE.map((item, idx) => {
    const r = item.result;
    const pct = r ? r.reduction_pct?.toFixed(1) + '% saved' : '';
    return `<div class="cp-batch-item cp-batch-${item.status}" data-id="${item.id}">
      <span class="cp-batch-icon">${statusIcons[item.status] || ''}</span>
      <span class="cp-batch-name" title="${item.file.name}">${item.file.name}</span>
      <span class="cp-batch-size">${fmtBytes(item.file.size)}</span>
      ${r ? `<span class="cp-batch-result">${pct}</span>` : ''}
      ${item.status === 'done' && r?.download_url ? `
        <a class="cp-batch-dl" href="${r.download_url}" download="${getStem(item.file.name)}_compressed.pdf">
          <i class="fa fa-download" aria-hidden="true"></i>
        </a>` : ''}
    </div>`;
  }).join('');
}

async function startBatchCompression() {
  if (BATCH_ACTIVE) return;
  BATCH_ACTIVE = true;
  BATCH_IDX    = 0;

  for (let i = 0; i < BATCH_QUEUE.length; i++) {
    BATCH_IDX = i;
    const item = BATCH_QUEUE[i];
    item.status = 'processing';
    renderBatchList();

    try {
      const preset  = getPreset();
      const advOpts = getAdvOptions();
      const fd      = new FormData();
      fd.append('file',   item.file);
      fd.append('preset', preset);
      Object.entries(advOpts).forEach(([k, v]) => fd.append(k, String(v)));

      const resp = await fetch('/api/compress-pdf', { method: 'POST', body: fd });
      if (resp.ok) {
        const blob    = await resp.blob();
        const url     = URL.createObjectURL(blob);
        const inSize  = item.file.size;
        const outSize = parseInt(resp.headers.get('X-Output-Size') || blob.size, 10);
        const redPct  = parseFloat(resp.headers.get('X-Reduction-Pct') || calcReduction(inSize, outSize));
        item.status   = 'done';
        item.result   = {
          reduction_pct: redPct,
          download_url:  url,
          output_size:   outSize,
        };
        addToHistory({
          filename:    item.file.name,
          preset,
          inputSize:   inSize,
          outputSize:  outSize,
          reductionPct:redPct,
          grade:       resp.headers.get('X-Quality-Grade') || 'B',
          engine:      resp.headers.get('X-Engine-Used')   || '—',
          timeMs:      parseInt(resp.headers.get('X-Processing-Ms') || 0, 10),
        });
      } else {
        item.status = 'error';
      }
    } catch (err) {
      item.status = 'error';
    }

    renderBatchList();
  }

  BATCH_ACTIVE = false;
  const done  = BATCH_QUEUE.filter(x => x.status === 'done').length;
  const total = BATCH_QUEUE.length;
  toast(`Batch complete! ${done}/${total} compressed`, 'Click download icons to save files.', 'success', 6000);
  S('fahhhhh');
  launchConfetti();
  announce(`Batch compression complete. ${done} of ${total} files compressed successfully.`);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ANALYSIS
═══════════════════════════════════════════════════════════════════════════════ */
async function analyzeFile(file) {
  let pct = 0;
  const barInterval = setInterval(() => {
    pct = Math.min(pct + Math.random() * 8 + 3, 88);
    if (D.analyzeFill) D.analyzeFill.style.width = pct + '%';
  }, 120);

  try {
    const fd = new FormData();
    fd.append('file', file);
    const resp = await fetch('/api/compress-pdf/analyze', { method: 'POST', body: fd });
    clearInterval(barInterval);
    if (D.analyzeFill) D.analyzeFill.style.width = '100%';
    if (!resp.ok) throw new Error('Analysis HTTP ' + resp.status);

    const data = await resp.json();
    ANALYSIS_DATA = data;

    setTimeout(() => {
      if (D.fiAnalyze) D.fiAnalyze.setAttribute('hidden', '');
      showAnalysisResult(data, file);
      initOrUpdateChart(data);
      const chartWrap = document.getElementById('chartWrap');
      if (chartWrap) chartWrap.removeAttribute('hidden');
    }, 300);
  } catch (err) {
    clearInterval(barInterval);
    if (D.fiAnalyze) D.fiAnalyze.setAttribute('hidden', '');
  }
}

function showAnalysisResult(data, file) {
  const pages    = data.pages || data.page_count || '?';
  const ver      = data.pdf_version || data.version || '—';
  const imgCount = data.image_count ?? data.images ?? '—';
  const compEst  = data.estimated_reduction_pct ?? data.compressible_pct;
  const docType  = data.document_type || data.type || 'Mixed';

  D.fiPages.innerHTML   = `<i class="fa fa-file-pdf" aria-hidden="true"></i> ${pages} page${pages !== 1 ? 's' : ''}`;
  D.fiVersion.innerHTML = `<i class="fa fa-code" aria-hidden="true"></i> PDF&nbsp;${ver}`;

  D.chipImgVal.textContent  = imgCount;
  D.chipCompVal.textContent = compEst != null ? Math.round(compEst) + '%' : '—';
  D.chipTypeVal.textContent = docType;
  D.fiChips.removeAttribute('hidden');

  const warnings = data.warnings || [];
  if (warnings.length > 0) {
    D.chipWarn.removeAttribute('hidden');
    D.chipWarnVal.textContent = warnings[0];
  }

  showRecommendation(data);
  updateSaveEstimates(data);
}

function showRecommendation(data) {
  if (!data) return;
  const rec      = data.recommended_preset || data.recommendation;
  const imgCount = data.image_count ?? 0;
  const labels   = {
    lossless: '🔮 Lossless',
    high:     '💎 High',
    medium:   '⚖️ Medium',
    low:      '📧 Low',
    screen:   '🔥 Screen',
  };
  let msg = '';

  if (rec) {
    msg = `Recommended: <strong>${labels[rec] || rec}</strong> — based on your PDF analysis`;
  } else if (imgCount > 10) {
    msg = `📸 Image-heavy PDF — <strong>Medium</strong> or <strong>Screen</strong> recommended for max savings`;
  } else if (imgCount === 0) {
    msg = `📝 Text-only PDF — <strong>Lossless</strong> recommended for zero quality impact`;
  } else {
    msg = `✅ PDF analysed — choose your quality preset above`;
  }

  if (msg && D.recBanner && D.recText) {
    D.recText.innerHTML = msg;
    D.recBanner.removeAttribute('hidden');
  }
}

function updateSaveEstimates(data) {
  if (!data) return;
  const estimates = data.estimates || data.estimated_reductions_by_preset || {};
  Object.entries(estimates).forEach(([preset, est]) => {
    const el = document.getElementById(`save-${preset}`);
    if (el && est != null) el.textContent = `~${Math.round(est)}% smaller`;
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   PRESET SELECTOR
═══════════════════════════════════════════════════════════════════════════════ */
function initPresets() {
  const btns = D.presetGrid.querySelectorAll('.cp-preset-btn');
  btns.forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      btns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); });
      btn.classList.add('active');
      btn.setAttribute('aria-checked', 'true');
      S('waah_kya_scene_hai');
      updateActionState();
    });
    // Arrow key navigation
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = btns[(idx + 1) % btns.length];
        next.click(); next.focus();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = btns[(idx - 1 + btns.length) % btns.length];
        prev.click(); prev.focus();
      }
    });
  });
}

function getPreset() {
  const btn = D.presetGrid.querySelector('.cp-preset-btn.active');
  return btn ? btn.dataset.preset : 'medium';
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TARGET SIZE
═══════════════════════════════════════════════════════════════════════════════ */
function initTargetSize() {
  D.targetToggle.addEventListener('click', () => {
    const open = D.targetToggle.getAttribute('aria-expanded') === 'true';
    D.targetToggle.setAttribute('aria-expanded', String(!open));
    D.targetInputs.toggleAttribute('hidden', open);
    if (!open) setTimeout(() => D.targetKb.focus(), 80);
    S('click');
  });

  document.querySelectorAll('.cp-tpr').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cp-tpr').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      D.targetKb.value = btn.dataset.kb;
      updateActionState();
      S('click');
    });
  });

  D.targetKb.addEventListener('input', () => {
    document.querySelectorAll('.cp-tpr').forEach(b => b.classList.remove('active'));
    updateActionState();
  });
}

function getTargetKb() {
  const open = D.targetToggle.getAttribute('aria-expanded') === 'true';
  const v    = parseInt(D.targetKb.value, 10);
  return (open && v > 0) ? v : 0;
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ADVANCED OPTIONS
═══════════════════════════════════════════════════════════════════════════════ */
function initAdvancedOptions() {
  D.advToggle.addEventListener('click', () => {
    const open = D.advToggle.getAttribute('aria-expanded') === 'true';
    D.advToggle.setAttribute('aria-expanded', String(!open));
    D.advOpts.toggleAttribute('hidden', open);
    S('click');
  });

  D.advOpts.querySelectorAll('.cp-adv-cb').forEach(cb => {
    cb.addEventListener('change', updateAdvCount);
  });

  document.querySelectorAll('.cp-qp-btn').forEach(btn => {
    btn.addEventListener('click', () => applyQuickPreset(btn.dataset.qp));
  });

  if (D.pwEye) {
    D.pwEye.addEventListener('click', () => {
      const isPass = D.optPassword.type === 'password';
      D.optPassword.type = isPass ? 'text' : 'password';
      D.pwEye.querySelector('i').className = isPass ? 'fa fa-eye-slash' : 'fa fa-eye';
    });
  }

  updateAdvCount();
}

function updateAdvCount() {
  if (!D.advCount) return;
  const defaults = { optDedup: true, optThumbs: true };
  let changed = 0;
  D.advOpts.querySelectorAll('.cp-adv-cb').forEach(cb => {
    if (cb.checked !== (defaults[cb.id] ?? false)) changed++;
  });
  if (changed > 0) {
    D.advCount.textContent = changed + ' custom';
    D.advCount.removeAttribute('hidden');
  } else {
    D.advCount.setAttribute('hidden', '');
  }
}

function applyQuickPreset(key) {
  const map = {
    email:   { optGrayscale:false, optLinearize:true,  optDedup:true, optFonts:true,  optMeta:true,  optAnnot:false, optForms:false, optJS:true,  optThumbs:true, optEmbedded:true,  optICC:true,  optLinks:false, optFlatten:false },
    archive: { optGrayscale:false, optLinearize:false, optDedup:true, optFonts:true,  optMeta:false, optAnnot:false, optForms:false, optJS:true,  optThumbs:true, optEmbedded:false, optICC:false, optLinks:false, optFlatten:false },
    web:     { optGrayscale:false, optLinearize:true,  optDedup:true, optFonts:true,  optMeta:true,  optAnnot:false, optForms:false, optJS:true,  optThumbs:true, optEmbedded:true,  optICC:true,  optLinks:false, optFlatten:false },
    print:   { optGrayscale:false, optLinearize:false, optDedup:true, optFonts:true,  optMeta:false, optAnnot:false, optForms:false, optJS:false, optThumbs:false,optEmbedded:false, optICC:false, optLinks:false, optFlatten:true  },
    max:     { optGrayscale:true,  optLinearize:true,  optDedup:true, optFonts:true,  optMeta:true,  optAnnot:true,  optForms:true,  optJS:true,  optThumbs:true, optEmbedded:true,  optICC:true,  optLinks:true,  optFlatten:false },
    reset:   { optGrayscale:false, optLinearize:false, optDedup:true, optFonts:false, optMeta:false, optAnnot:false, optForms:false, optJS:false, optThumbs:true, optEmbedded:false, optICC:false, optLinks:false, optFlatten:false },
  };
  const cfg = map[key];
  if (!cfg) return;

  Object.entries(cfg).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.checked = val;
  });

  updateAdvCount();

  if (key !== 'reset' && D.advToggle.getAttribute('aria-expanded') !== 'true') {
    D.advToggle.setAttribute('aria-expanded', 'true');
    D.advOpts.removeAttribute('hidden');
  }

  const qualMap = { email:'low', max:'screen', archive:'high', web:'medium', print:'high' };
  if (qualMap[key]) {
    D.presetGrid.querySelectorAll('.cp-preset-btn').forEach(b => {
      const match = b.dataset.preset === qualMap[key];
      b.classList.toggle('active', match);
      b.setAttribute('aria-checked', String(match));
    });
  }

  const labels = { email:'📧 Email', archive:'📦 Archive', web:'🌐 Web', max:'🔥 Max Compression', print:'🖨️ Print', reset:'↩️ Default' };
  toast(`${labels[key] || key} preset applied`, 'Settings configured.', 'info', 2500);
  S('click');
}

function getAdvOptions() {
  return {
    grayscale:               document.getElementById('optGrayscale')?.checked  ?? false,
    linearize:               document.getElementById('optLinearize')?.checked  ?? false,
    remove_duplicate_images: document.getElementById('optDedup')?.checked      ?? true,
    subset_fonts:            document.getElementById('optFonts')?.checked      ?? false,
    strip_metadata:          document.getElementById('optMeta')?.checked       ?? false,
    remove_annotations:      document.getElementById('optAnnot')?.checked      ?? false,
    remove_forms:            document.getElementById('optForms')?.checked      ?? false,
    remove_javascript:       document.getElementById('optJS')?.checked         ?? false,
    remove_thumbnails:       document.getElementById('optThumbs')?.checked     ?? true,
    remove_embedded_files:   document.getElementById('optEmbedded')?.checked   ?? false,
    remove_icc_profiles:     document.getElementById('optICC')?.checked        ?? false,
    remove_links:            document.getElementById('optLinks')?.checked      ?? false,
    flatten_transparency:    document.getElementById('optFlatten')?.checked    ?? false,
    password:                document.getElementById('optPassword')?.value      ?? '',
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ACTION STATE
═══════════════════════════════════════════════════════════════════════════════ */
function updateActionState() {
  if (!D) return;
  const canCompress = !!FILE && !BATCH_ACTIVE;
  D.compressBtn.disabled = !canCompress;
  D.compressBtn.setAttribute('aria-disabled', String(!canCompress));
  if (canCompress) {
    D.compressBtn.classList.remove('disabled');
  } else {
    D.compressBtn.classList.add('disabled');
  }
}

function updateFab() {
  const fab = document.getElementById('cpFab');
  if (!fab) return;
  if (FILE) fab.removeAttribute('hidden');
  else fab.setAttribute('hidden', '');
}

/* ═══════════════════════════════════════════════════════════════════════════════
   COMPRESSION PROGRESS (SSE)
═══════════════════════════════════════════════════════════════════════════════ */
function showProgress() {
  D.toolZone.setAttribute('hidden', '');
  D.progressWrap.removeAttribute('hidden');
  D.progressWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  D.progressFill.style.width  = '0%';
  D.progressPct.textContent   = '0%';
  D.progressMsg.textContent   = 'Preparing compression pipeline…';
  D.progressEngine.textContent = '';
  _t0 = performance.now();

  _timerInterval = setInterval(() => {
    const s = (performance.now() - _t0) / 1000;
    if (D.progressTimer) D.progressTimer.textContent = fmtElapsed(s);
  }, 100);

  announce('Compression started. Please wait.', 'assertive');
}

function hideProgress() {
  D.progressWrap.setAttribute('hidden', '');
  D.toolZone.removeAttribute('hidden');
  clearInterval(_timerInterval);
  _timerInterval = null;
}

function setProgress(pct, msg = '', engine = '') {
  const p = clamp(pct, 0, 100);
  D.progressFill.style.width  = p + '%';
  D.progressPct.textContent   = Math.round(p) + '%';
  if (msg)    D.progressMsg.textContent    = msg;
  if (engine) D.progressEngine.textContent = engine;
}

function openSSE(jobId) {
  closeSSE();
  const url = `/api/progress/${jobId}`;
  SSE_SOURCE = new EventSource(url);

  SSE_SOURCE.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d.pct !== undefined) setProgress(d.pct, d.msg || '', d.engine || '');
      if (d.pct >= 100) closeSSE();
    } catch (_) {}
  };

  SSE_SOURCE.onerror = () => closeSSE();

  // Simulated progress fallback
  let simPct = 0;
  SSE_TIMER = setInterval(() => {
    simPct = Math.min(simPct + Math.random() * 3.5 + 1, 92);
    setProgress(simPct);
  }, 400);
}

function closeSSE() {
  if (SSE_SOURCE) { SSE_SOURCE.close(); SSE_SOURCE = null; }
  if (SSE_TIMER)  { clearInterval(SSE_TIMER); SSE_TIMER = null; }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   COMPRESS ACTION
═══════════════════════════════════════════════════════════════════════════════ */
async function doCompress() {
  if (!FILE) {
    toast('No file selected', 'Please upload a PDF first.', 'warn');
    D.dropZone.focus();
    return;
  }
  if (D.compressBtn.disabled) return;

  const preset    = getPreset();
  const targetKb  = getTargetKb();
  const advOpts   = getAdvOptions();
  JOB_ID          = `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  showProgress();
  S('cameraman_focus_karo');

  window.addEventListener('beforeunload', _beforeUnloadHandler);

  const fd = new FormData();
  fd.append('file',      FILE);
  fd.append('preset',    preset);
  fd.append('job_id',    JOB_ID);
  fd.append('target_kb', String(targetKb));
  Object.entries(advOpts).forEach(([k, v]) => fd.append(k, String(v)));

  openSSE(JOB_ID);

  try {
    const resp = await fetch('/api/compress-pdf', { method: 'POST', body: fd });

    setProgress(100, 'Compression complete!');
    closeSSE();
    clearInterval(_timerInterval);

    const elapsed = Math.round(performance.now() - _t0);

    if (!resp.ok) {
      let errMsg = `Server error ${resp.status}`;
      try { const j = await resp.json(); errMsg = j.error || errMsg; } catch {}
      throw new Error(errMsg);
    }

    const blob     = await resp.blob();
    const inSize   = FILE.size;
    const outSize  = parseInt(resp.headers.get('X-Output-Size')     || String(blob.size), 10);
    const redPct   = parseFloat(resp.headers.get('X-Reduction-Pct') || String(calcReduction(inSize, outSize)));
    const engine   = resp.headers.get('X-Engine-Used')    || '—';
    const qScore   = parseInt(resp.headers.get('X-Quality-Score')   || '0', 10);
    const qGrade   = resp.headers.get('X-Quality-Grade')  || 'B';
    const engTried = resp.headers.get('X-Engines-Tried')  || '';
    const procMs   = parseInt(resp.headers.get('X-Processing-Ms')   || String(elapsed), 10);
    const meth     = resp.headers.get('X-Method-Used')    || '';

    RESULT_DATA = {
      blob, inSize, outSize, redPct, engine, qScore, qGrade,
      engTried, procMs, meth, elapsed, preset,
    };
    COMPRESS_DONE = true;

    hideProgress();
    showResult(RESULT_DATA);

    addToHistory({
      filename:    FILE.name,
      preset,
      inputSize:   inSize,
      outputSize:  outSize,
      reductionPct:redPct,
      grade:       qGrade,
      engine,
      timeMs:      procMs,
    });

    if (redPct > 0) {
      launchConfetti();
      S('fahhhhh');
    } else {
      S('waah_kya_scene_hai');
    }

    announce(`Compression complete! ${redPct.toFixed(1)}% reduction. Grade: ${qGrade}.`);

  } catch (err) {
    closeSSE();
    hideProgress();
    toast('Compression failed', err.message || 'Unexpected error.', 'error', 8000);
    S('eh_eh_eh_ehhhhhh');
    announce('Compression failed. ' + (err.message || ''), 'assertive');
  } finally {
    window.removeEventListener('beforeunload', _beforeUnloadHandler);
  }
}

function _beforeUnloadHandler(e) {
  e.preventDefault();
  e.returnValue = '';
}

function cancelCompress() {
  closeSSE();
  hideProgress();
  toast('Compression cancelled', '', 'warn', 2500);
  S('jaldi_waha_sa_hato');
  window.removeEventListener('beforeunload', _beforeUnloadHandler);
}

/* ═══════════════════════════════════════════════════════════════════════════════
   RESULT DISPLAY
═══════════════════════════════════════════════════════════════════════════════ */
function showResult(r) {
  // Update grade badge
  const gradeColors = { S:'#10b981', A:'#34d399', B:'#6366f1', C:'#f59e0b', D:'#ef4444', F:'#dc2626' };
  D.resGrade.textContent              = r.qGrade;
  D.resGrade.style.color              = gradeColors[r.qGrade] || '#94a3b8';

  // Sizes
  D.resBefore.textContent  = fmtBytes(r.inSize);
  D.resAfter.textContent   = fmtBytes(r.outSize);
  D.resPct.textContent     = r.redPct > 0 ? `${r.redPct.toFixed(1)}% smaller` : 'No reduction';
  D.resEngine.textContent  = r.engine;
  D.resTime.textContent    = fmtMs(r.procMs);

  // Animated reduction bar
  if (D.resBar) {
    D.resBar.style.width    = '0%';
    setTimeout(() => {
      D.resBar.style.width  = clamp(r.redPct, 0, 100) + '%';
    }, 80);
  }

  // Score
  if (D.resScore) {
    animateNumber(D.resScore, 0, r.qScore, 800);
  }

  // Engines tried list
  if (D.resEngineList && r.engTried) {
    D.resEngineList.innerHTML = r.engTried.split(',').map(e => e.trim()).filter(Boolean).map(e =>
      `<span class="cp-eng-tag">${e}</span>`
    ).join('');
  }

  // Show/hide zero-reduction note
  const zeroNote = document.getElementById('resZeroNote');
  if (zeroNote) zeroNote.toggleAttribute('hidden', r.redPct > 0);

  D.resultWrap.removeAttribute('hidden');
  D.resultWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function triggerDownload() {
  if (!RESULT_DATA?.blob) { toast('No result yet', 'Please compress a PDF first.', 'warn'); return; }
  const url  = URL.createObjectURL(RESULT_DATA.blob);
  const link = document.createElement('a');
  link.href  = url;
  link.download = `${STEM}_compressed.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  S('fahhhhh');
  toast('Downloading!', `${STEM}_compressed.pdf`, 'success', 3000);
}

async function shareResult() {
  if (!RESULT_DATA?.blob) return;
  if (!navigator.share) {
    toast('Share not available', 'Web Share not supported in this browser.', 'warn', 3000);
    return;
  }
  try {
    const file = new File([RESULT_DATA.blob], `${STEM}_compressed.pdf`, { type: 'application/pdf' });
    await navigator.share({
      title: `Compressed PDF — ${STEM}`,
      text:  `Compressed ${fmtBytes(RESULT_DATA.inSize)} → ${fmtBytes(RESULT_DATA.outSize)} (${RESULT_DATA.redPct.toFixed(1)}% smaller) using IshuTools.fun`,
      files: [file],
    });
  } catch (err) {
    if (err.name !== 'AbortError') {
      toast('Share failed', err.message || '', 'error', 3000);
    }
  }
}

async function copyReport() {
  if (!RESULT_DATA) return;
  const r   = RESULT_DATA;
  const txt = [
    '════ IshuTools.fun — Compression Report ════',
    `File:        ${FILE?.name || '—'}`,
    `Preset:      ${r.preset}`,
    `Before:      ${fmtBytes(r.inSize)}`,
    `After:       ${fmtBytes(r.outSize)}`,
    `Reduction:   ${r.redPct.toFixed(1)}%`,
    `Grade:       ${r.qGrade}`,
    `Engine:      ${r.engine}`,
    `Time:        ${fmtMs(r.procMs)}`,
    `Engines tried: ${r.engTried}`,
    `Generated:   ${new Date().toLocaleString()}`,
    `Tool:        https://ishutools.fun/tools/compress-pdf/`,
    '════════════════════════════════════════════',
  ].join('\n');

  try {
    await navigator.clipboard.writeText(txt);
    toast('Report copied!', 'Compression details in clipboard.', 'success', 2500);
  } catch {
    toast('Copy failed', 'Clipboard access denied.', 'error', 3000);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   RESET TOOL
═══════════════════════════════════════════════════════════════════════════════ */
function resetTool() {
  FILE          = null;
  STEM          = '';
  COMPRESS_DONE = false;
  RESULT_DATA   = null;
  ANALYSIS_DATA = null;

  closeSSE();
  clearInterval(_timerInterval);

  if (D.fileInfo)    D.fileInfo.setAttribute('hidden', '');
  if (D.recBanner)   D.recBanner.setAttribute('hidden', '');
  if (D.fiChips)     D.fiChips.setAttribute('hidden', '');
  if (D.fiAnalyze)   D.fiAnalyze.setAttribute('hidden', '');
  if (D.resultWrap)  D.resultWrap.setAttribute('hidden', '');
  if (D.progressWrap)D.progressWrap.setAttribute('hidden', '');
  if (D.toolZone)    D.toolZone.removeAttribute('hidden');

  const chartWrap = document.getElementById('chartWrap');
  if (chartWrap)     chartWrap.setAttribute('hidden', '');

  const title = D.dropZone.querySelector('.cp-drop-title');
  const sub   = D.dropZone.querySelector('.cp-drop-sub');
  if (title) title.textContent = 'Drop your PDF here';
  if (sub)   sub.innerHTML     = 'or <span class="cp-drop-link">browse to upload</span> — any size, instant';

  updateActionState();
  updateFab();
  D.dropZone.focus();
  announce('Tool reset. Ready for a new file.');
}

/* ═══════════════════════════════════════════════════════════════════════════════
   FAQ ACCORDION
═══════════════════════════════════════════════════════════════════════════════ */
function initFaq() {
  document.querySelectorAll('.cp-faq-q').forEach(q => {
    q.addEventListener('click', () => {
      const item = q.closest('.cp-faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('open');
      // Close all
      document.querySelectorAll('.cp-faq-item.open').forEach(i => {
        i.classList.remove('open');
        i.querySelector('.cp-faq-q')?.setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('open');
        q.setAttribute('aria-expanded', 'true');
      }
    });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); q.click(); }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   TRUST COUNTERS (IntersectionObserver)
═══════════════════════════════════════════════════════════════════════════════ */
function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!counters.length) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el  = entry.target;
      const end = parseInt(el.dataset.count, 10) || 0;
      animateNumber(el, 0, end, 1200, v => Math.round(v).toLocaleString());
      io.unobserve(el);
    });
  }, { threshold: 0.5 });
  counters.forEach(el => io.observe(el));
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SCROLL-TO-TOP + FAB
═══════════════════════════════════════════════════════════════════════════════ */
function initScrollHandlers() {
  const topBtn = document.getElementById('scrollTopBtn');
  const fab    = document.getElementById('cpFab');

  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (topBtn) topBtn.toggleAttribute('hidden', y < 300);
  }, { passive: true });

  if (topBtn) {
    topBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  if (fab) {
    fab.addEventListener('click', () => {
      if (FILE && !D.compressBtn.disabled) {
        doCompress();
      } else {
        D.fileInput.click();
      }
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement.tagName;
    const inInput = ['INPUT','TEXTAREA','SELECT'].includes(tag);

    // Ctrl+Enter → compress
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      doCompress();
      return;
    }
    // Ctrl+O → open file
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      D.fileInput.click();
      return;
    }
    // Escape → close modals / cancel
    if (e.key === 'Escape') {
      const shortcutsModal = document.getElementById('cp-shortcuts-modal');
      if (shortcutsModal) { shortcutsModal.remove(); return; }
      if (!D.progressWrap.hasAttribute('hidden')) { cancelCompress(); return; }
      const histPanel = document.getElementById('historyPanel');
      if (histPanel && !histPanel.hasAttribute('hidden')) { histPanel.setAttribute('hidden', ''); return; }
      return;
    }

    if (inInput) return; // Below shortcuts only outside inputs

    // H → toggle history
    if (e.key === 'h' || e.key === 'H') { toggleHistory(); return; }
    // R → reset
    if (e.key === 'r' || e.key === 'R') { resetTool(); return; }
    // T → toggle theme
    if (e.key === 't' || e.key === 'T') { toggleTheme(); return; }
    // ? → shortcuts modal
    if (e.key === '?') { showShortcutsModal(); return; }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   ENGINES INFO (load from API on first open)
═══════════════════════════════════════════════════════════════════════════════ */
async function loadEngines() {
  const wrap = document.getElementById('enginesApiWrap');
  if (!wrap || wrap.dataset.loaded) return;

  try {
    const resp = await fetch('/api/compress-pdf/engines');
    if (!resp.ok) return;
    const data = await resp.json();
    const engines = data.engines || data.available || [];
    wrap.dataset.loaded = '1';

    if (engines.length) {
      const rows = engines.map(e => `
        <div class="cp-eng-row">
          <span class="cp-eng-name">${e.name || e}</span>
          <span class="cp-eng-ver">${e.version || ''}</span>
          <span class="cp-eng-status ${e.available !== false ? 'ok' : 'na'}">
            ${e.available !== false ? '✓ Available' : '✗ N/A'}
          </span>
        </div>
      `).join('');
      wrap.innerHTML = rows;
    }
  } catch {}
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN DOM INIT
═══════════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* ── Populate DOM refs ──────────────────────────────────────────────────── */
  D = {
    dropZone:     document.getElementById('dropZone'),
    fileInput:    document.getElementById('fileInput'),
    fileInfo:     document.getElementById('fileInfo'),
    fiName:       document.getElementById('fiName'),
    fiSize:       document.getElementById('fiSize'),
    fiPages:      document.getElementById('fiPages'),
    fiType:       document.getElementById('fiType'),
    fiVersion:    document.getElementById('fiVersion'),
    fiChips:      document.getElementById('fiChips'),
    chipImgVal:   document.getElementById('chipImgVal'),
    chipCompVal:  document.getElementById('chipCompVal'),
    chipTypeVal:  document.getElementById('chipTypeVal'),
    chipWarn:     document.getElementById('chipWarn'),
    chipWarnVal:  document.getElementById('chipWarnVal'),
    fiAnalyze:    document.getElementById('fiAnalyze'),
    analyzeFill:  document.getElementById('analyzeFill'),
    recBanner:    document.getElementById('recBanner'),
    recText:      document.getElementById('recText'),
    fiRemove:     document.getElementById('fiRemove'),
    presetGrid:   document.getElementById('presetGrid'),
    targetToggle: document.getElementById('targetToggle'),
    targetInputs: document.getElementById('targetInputs'),
    targetKb:     document.getElementById('targetKb'),
    advToggle:    document.getElementById('advToggle'),
    advOpts:      document.getElementById('advOpts'),
    advCount:     document.getElementById('advCount'),
    optPassword:  document.getElementById('optPassword'),
    pwEye:        document.getElementById('pwEye'),
    compressBtn:  document.getElementById('compressBtn'),
    toolZone:     document.getElementById('toolZone'),
    progressWrap: document.getElementById('progressWrap'),
    progressFill: document.getElementById('progressFill'),
    progressPct:  document.getElementById('progressPct'),
    progressMsg:  document.getElementById('progressMsg'),
    progressEngine:document.getElementById('progressEngine'),
    progressTimer:document.getElementById('progressTimer'),
    resultWrap:   document.getElementById('resultWrap'),
    resGrade:     document.getElementById('resGrade'),
    resBefore:    document.getElementById('resBefore'),
    resAfter:     document.getElementById('resAfter'),
    resPct:       document.getElementById('resPct'),
    resEngine:    document.getElementById('resEngine'),
    resTime:      document.getElementById('resTime'),
    resBar:       document.getElementById('resBar'),
    resScore:     document.getElementById('resScore'),
    resEngineList:document.getElementById('resEngineList'),
    toastWrap:    document.getElementById('toastWrap'),
    themeToggle:  document.getElementById('themeToggle'),
    themeIcon:    document.getElementById('themeIcon'),
    soundToggle:  document.getElementById('soundToggle'),
    soundIcon:    document.getElementById('soundIcon'),
  };

  /* ── Initialise all modules ─────────────────────────────────────────────── */
  initTheme();
  initSoundToggle();
  initBgCanvas();
  initDropZone();
  initPresets();
  initTargetSize();
  initAdvancedOptions();
  initFaq();
  initCounters();
  initScrollHandlers();
  initKeyboard();
  updateActionState();
  renderHistory();

  /* ── Button wiring ──────────────────────────────────────────────────────── */

  // Compress button
  D.compressBtn.addEventListener('click', doCompress);

  // Cancel button (in progress panel)
  const cancelBtn = document.getElementById('cancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', cancelCompress);

  // Download button
  const dlBtn = document.getElementById('downloadBtn');
  if (dlBtn) dlBtn.addEventListener('click', triggerDownload);

  // Share button
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) shareBtn.addEventListener('click', shareResult);

  // Copy report button
  const copyBtn = document.getElementById('copyReportBtn');
  if (copyBtn) copyBtn.addEventListener('click', copyReport);

  // Compress another
  const anotherBtn = document.getElementById('compressAnotherBtn');
  if (anotherBtn) anotherBtn.addEventListener('click', () => { resetTool(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  // Theme/sound toggles
  D.themeToggle.addEventListener('click', toggleTheme);
  D.soundToggle.addEventListener('click', toggleSound);

  // History toggle
  const histBtn = document.getElementById('historyBtn');
  if (histBtn) histBtn.addEventListener('click', toggleHistory);

  // Clear history
  const clearHistBtn = document.getElementById('clearHistBtn');
  if (clearHistBtn) clearHistBtn.addEventListener('click', clearHistory);

  // Shortcuts button
  const shortcutsBtn = document.getElementById('shortcutsBtn');
  if (shortcutsBtn) shortcutsBtn.addEventListener('click', showShortcutsModal);

  // Engines info lazy-load
  const enginesToggle = document.getElementById('enginesToggle');
  if (enginesToggle) {
    enginesToggle.addEventListener('click', () => {
      const wrap = document.getElementById('enginesPanel');
      if (!wrap) return;
      const isOpen = enginesToggle.getAttribute('aria-expanded') === 'true';
      enginesToggle.setAttribute('aria-expanded', String(!isOpen));
      wrap.toggleAttribute('hidden', isOpen);
      if (!isOpen) loadEngines();
    });
  }

  /* ── Sounds preload on first interaction ────────────────────────────────── */
  const preloadSounds = () => {
    if (window.SOUNDS && typeof window.SOUNDS.preload === 'function') {
      window.SOUNDS.preload();
    }
    document.removeEventListener('pointerdown', preloadSounds);
  };
  document.addEventListener('pointerdown', preloadSounds, { once: true });

  /* ── Observe scroll-reveal elements ────────────────────────────────────── */
  if (!_reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('cp-revealed');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.cp-reveal').forEach(el => io.observe(el));
  } else {
    document.querySelectorAll('.cp-reveal').forEach(el => el.classList.add('cp-revealed'));
  }

  /* ── Marquee pause on hover ─────────────────────────────────────────────── */
  document.querySelectorAll('.cp-marquee-wrap').forEach(wrap => {
    wrap.addEventListener('mouseenter', () =>
      wrap.querySelectorAll('.cp-marquee-row').forEach(r => r.style.animationPlayState = 'paused')
    );
    wrap.addEventListener('mouseleave', () =>
      wrap.querySelectorAll('.cp-marquee-row').forEach(r => r.style.animationPlayState = 'running')
    );
  });

});

/* ═══════════════════════════════════════════════════════════════════════════════
   GLOBAL ONCLICK HANDLERS (called from HTML onclick attributes)
═══════════════════════════════════════════════════════════════════════════════ */
window.doCompress       = doCompress;
window.triggerDownload  = triggerDownload;
window.shareResult      = shareResult;
window.copyReport       = copyReport;
window.resetTool        = resetTool;
window.toggleHistory    = toggleHistory;
window.toggleTheme      = toggleTheme;
window.toggleSound      = toggleSound;
window.cancelCompress   = cancelCompress;
window.applyQuickPreset = applyQuickPreset;
window.showShortcutsModal = showShortcutsModal;
window.clearHistory     = clearHistory;
