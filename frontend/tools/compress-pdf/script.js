/**
 * compress-pdf/script.js — IshuTools.fun Ultimate PDF Compressor v5.0
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75) — ishutools.fun
 *
 * Features:
 *  - Drag & drop upload with visual feedback
 *  - Pre-upload PDF analysis (page count, images, estimated reduction)
 *  - 5 compression mode cards with live estimates
 *  - Advanced options: grayscale, strip metadata, remove annotations, linearize, target size
 *  - SSE real-time progress with step chips
 *  - Animated results: reduction ring, size bars, stat counters
 *  - canvas-confetti celebration on success
 *  - Sound effects from merge-pdf/sounds/ (fahhhhh=download, waah=success, etc.)
 *  - Download filename = original filename + _compressed.pdf
 *  - Toast notifications for all states
 *  - IntersectionObserver counter animation
 *  - Animated BG canvas (particles)
 *  - Full keyboard accessibility (Enter/Space on all interactive elements)
 *  - Theme & sound toggle with localStorage persistence
 *  - Share button (Web Share API with clipboard fallback)
 *  - Error handling with retry guidance
 */

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════════════════════
     CONSTANTS & STATE
  ═══════════════════════════════════════════════════════════════════════════ */
  const SOUNDS_BASE = '/tools/merge-pdf/sounds/';
  const SOUND_FILES = {
    fileAdd:   'are_bhai_bhai_bhai.mp3',
    start:     'cameraman_focus_karo.mp3',
    success:   'waah_kya_scene_hai.mp3',
    download:  'fahhhhh.mp3',
    error:     'eh_eh_eh_ehhhhhh.mp3',
    warning:   'jaldi_waha_sa_hato.mp3',
  };
  const THEME_KEY   = 'ishu-theme';
  const SOUND_KEY   = 'ishu-sounds-v3';
  const MODE_KEY    = 'ishu-compress-mode';

  let FILE        = null;          // File object
  let FILE_URL    = null;          // Object URL for download
  let RESULT_BLOB = null;          // Compressed blob
  let ORIG_FNAME  = '';            // Original filename stem
  let SELECTED_MODE = 'medium';    // Active compression mode
  let JOB_ID      = '';            // SSE job ID
  let SSE_SRC     = null;          // EventSource
  let SIM_TIMER   = null;          // Fallback progress timer
  let _soundOn    = true;
  let _theme      = 'dark';
  let _audioPool  = {};
  let _audioCtx   = null;
  let _analysisData = {};          // PDF analysis results
  let _countersDone = false;
  let _bgAnim     = null;
  let _particles  = [];

  /* ═══════════════════════════════════════════════════════════════════════════
     DOM REFS
  ═══════════════════════════════════════════════════════════════════════════ */
  let D = {};

  function initDom() {
    D = {
      fileInput:      document.getElementById('fileInput'),
      dropzone:       document.getElementById('dropzone'),
      browseBtn:      document.getElementById('browseBtn'),
      fileCard:       document.getElementById('fileCard'),
      fileName:       document.getElementById('fileName'),
      fileMeta:       document.getElementById('fileMeta'),
      fileAnalysis:   document.getElementById('fileAnalysis'),
      removeFileBtn:  document.getElementById('removeFileBtn'),
      modesSection:   document.getElementById('modesSection'),
      advSection:     document.getElementById('advSection'),
      actionArea:     document.getElementById('actionArea'),
      advToggle:      document.getElementById('advToggle'),
      advPanel:       document.getElementById('advPanel'),
      compressBtn:    document.getElementById('compressBtn'),
      compressBtnIcon:document.getElementById('compressBtnIcon'),
      compressBtnText:document.getElementById('compressBtnText'),
      progressSection:document.getElementById('progressSection'),
      progressTitle:  document.getElementById('progressTitle'),
      progressSub:    document.getElementById('progressSub'),
      progressBar:    document.getElementById('progressBar'),
      progressBarWrap:document.getElementById('progressBarWrap'),
      progressPct:    document.getElementById('progressPct'),
      resultsSection: document.getElementById('resultsSection'),
      resultTitle:    document.getElementById('resultTitle'),
      resultSubtitle: document.getElementById('resultSubtitle'),
      ringFill:       document.getElementById('ringFill'),
      ringPct:        document.getElementById('ringPct'),
      ringSubtext:    document.getElementById('ringSubtext'),
      statOriginal:   document.getElementById('statOriginal'),
      statCompressed: document.getElementById('statCompressed'),
      statSaved:      document.getElementById('statSaved'),
      statMethod:     document.getElementById('statMethod'),
      barOrig:        document.getElementById('barOrig'),
      barComp:        document.getElementById('barComp'),
      barOrigLabel:   document.getElementById('barOrigLabel'),
      barCompLabel:   document.getElementById('barCompLabel'),
      qualityNote:    document.getElementById('qualityNote'),
      qualityNoteText:document.getElementById('qualityNoteText'),
      downloadBtn:    document.getElementById('downloadBtn'),
      downloadBtnText:document.getElementById('downloadBtnText'),
      resetBtn:       document.getElementById('resetBtn'),
      shareBtn:       document.getElementById('shareBtn'),
      soundBtn:       document.getElementById('soundBtn'),
      soundIcon:      document.getElementById('soundIcon'),
      themeBtn:       document.getElementById('themeBtn'),
      themeIcon:      document.getElementById('themeIcon'),
      toastContainer: document.getElementById('toastContainer'),
      bgCanvas:       document.getElementById('bgCanvas'),
      confettiCanvas: document.getElementById('confettiCanvas'),
      grayscaleToggle:document.getElementById('grayscaleToggle'),
      metaToggle:     document.getElementById('metaToggle'),
      annotToggle:    document.getElementById('annotToggle'),
      linearToggle:   document.getElementById('linearToggle'),
      targetToggle:   document.getElementById('targetToggle'),
      targetSizeRow:  document.getElementById('targetSizeRow'),
      targetSizeInput:document.getElementById('targetSizeInput'),
      chips: {
        upload:   document.getElementById('chip-upload'),
        analyze:  document.getElementById('chip-analyze'),
        gs:       document.getElementById('chip-gs'),
        fitz:     document.getElementById('chip-fitz'),
        pikepdf:  document.getElementById('chip-pikepdf'),
        finalize: document.getElementById('chip-finalize'),
      },
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     THEME
  ═══════════════════════════════════════════════════════════════════════════ */
  function initTheme() {
    _theme = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(_theme);
  }
  function applyTheme(t) {
    _theme = t;
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(THEME_KEY, t);
    if (D.themeIcon) {
      D.themeIcon.className = t === 'dark' ? 'fa fa-moon' : 'fa fa-sun';
    }
  }
  function toggleTheme() {
    applyTheme(_theme === 'dark' ? 'light' : 'dark');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SOUNDS
  ═══════════════════════════════════════════════════════════════════════════ */
  function initSounds() {
    try { _soundOn = localStorage.getItem(SOUND_KEY) !== 'false'; } catch (_) {}
    updateSoundUI();
  }
  function updateSoundUI() {
    if (!D.soundBtn) return;
    D.soundBtn.classList.toggle('muted', !_soundOn);
    D.soundIcon.className = _soundOn ? 'fa fa-volume-high' : 'fa fa-volume-xmark';
  }
  function toggleSound() {
    _soundOn = !_soundOn;
    try { localStorage.setItem(SOUND_KEY, _soundOn ? 'true' : 'false'); } catch (_) {}
    updateSoundUI();
    if (_soundOn) playSound('fileAdd');
  }
  function getAudioCtx() {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); } catch (_) { return null; }
    }
    if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume().catch(() => {});
    return _audioCtx;
  }
  function playSound(name, vol = 0.78, rate = 1.0) {
    if (!_soundOn) return;
    const file = SOUND_FILES[name];
    if (!file) return;
    try {
      if (!_audioPool[name]) {
        _audioPool[name] = new Audio(SOUNDS_BASE + file);
        _audioPool[name].preload = 'auto';
      }
      const a = _audioPool[name].cloneNode();
      a.volume = Math.min(1, Math.max(0, vol));
      a.playbackRate = rate;
      a.play().catch(() => {});
    } catch (_) {}
  }
  /* Tiny Web-Audio beep for micro-interactions */
  function beep(freq = 440, type = 'sine', dur = 0.1, vol = 0.12) {
    if (!_soundOn) return;
    try {
      const c = getAudioCtx();
      if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g   = c.createGain();
      osc.type = type; osc.frequency.value = freq;
      osc.connect(g); g.connect(c.destination);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t); osc.stop(t + dur + 0.02);
    } catch (_) {}
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     BACKGROUND CANVAS (particles)
  ═══════════════════════════════════════════════════════════════════════════ */
  function initBgCanvas() {
    const canvas = D.bgCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H;
    function resize() {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    /* Particles */
    _particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2 + 0.5,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.5 + 0.1,
    }));

    function draw() {
      ctx.clearRect(0, 0, W, H);
      _particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(16,185,129,${p.alpha})`;
        ctx.fill();
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      });
      /* Draw faint connection lines */
      for (let i = 0; i < _particles.length; i++) {
        for (let j = i + 1; j < _particles.length; j++) {
          const a = _particles[i], b = _particles[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 100) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = `rgba(16,185,129,${0.06 * (1 - d / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      _bgAnim = requestAnimationFrame(draw);
    }
    draw();
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TOAST NOTIFICATIONS
  ═══════════════════════════════════════════════════════════════════════════ */
  function showToast(msg, type = 'success', dur = 3800) {
    if (!D.toastContainer) return;
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const toast = document.createElement('div');
    toast.className = `cp-toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `<i class="fa ${icons[type] || icons.info} cp-toast-icon" aria-hidden="true"></i><span>${msg}</span>`;
    D.toastContainer.appendChild(toast);
    const remove = () => {
      toast.classList.add('exit');
      setTimeout(() => toast.remove(), 320);
    };
    setTimeout(remove, dur);
    toast.addEventListener('click', remove);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     FORMAT HELPERS
  ═══════════════════════════════════════════════════════════════════════════ */
  function fmtBytes(b) {
    if (b == null) return '—';
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  }
  function fmtPct(n) { return `${Math.round(n)}%`; }
  function stemName(fname) {
    return (fname || 'document').replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_\-.()\s]/g, '').trim() || 'document';
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     FILE HANDLING
  ═══════════════════════════════════════════════════════════════════════════ */
  function handleFile(f) {
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      playSound('error');
      showToast('Please upload a PDF file only.', 'error');
      D.dropzone.classList.add('shake');
      setTimeout(() => D.dropzone.classList.remove('shake'), 500);
      return;
    }
    /* Warn about very large files */
    if (f.size > 200 * 1024 * 1024) {
      playSound('warning');
      showToast(`Large file (${fmtBytes(f.size)}) — compression may take longer.`, 'warning', 5000);
    } else {
      playSound('fileAdd');
    }
    FILE = f;
    ORIG_FNAME = stemName(f.name);
    showFileCard(f);
    showToolUI();
    analyzeFile(f);
  }

  function showFileCard(f) {
    D.fileName.textContent = f.name;
    D.fileMeta.textContent = `${fmtBytes(f.size)} · PDF document`;
    D.fileAnalysis.innerHTML = '<i class="fa fa-spinner fa-spin" aria-hidden="true"></i> Analysing…';
    D.fileCard.hidden = false;
    D.dropzone.hidden = true;
  }

  function showToolUI() {
    D.modesSection.hidden = false;
    D.advSection.hidden   = false;
    D.actionArea.hidden   = false;
    D.resultsSection.hidden  = true;
    D.progressSection.hidden = true;
    /* Animate sections in */
    [D.modesSection, D.advSection, D.actionArea].forEach((el, i) => {
      el.style.opacity = '0'; el.style.transform = 'translateY(16px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        el.style.opacity = '1'; el.style.transform = 'translateY(0)';
      }, 60 + i * 80);
    });
    /* Scroll to modes */
    setTimeout(() => D.modesSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200);
  }

  async function analyzeFile(f) {
    try {
      const fd = new FormData();
      fd.append('file', f);
      const resp = await fetch('/api/compress-pdf/analyze', { method: 'POST', body: fd });
      if (!resp.ok) throw new Error('analysis failed');
      const data = await resp.json();
      _analysisData = data;
      updateAnalysisUI(data);
      updateModeEstimates(data);
    } catch (_) {
      D.fileAnalysis.innerHTML = `
        <span class="cp-file-analysis-chip"><i class="fa fa-file" aria-hidden="true"></i> ${fmtBytes(f.size)}</span>
        <span class="cp-file-analysis-chip"><i class="fa fa-circle-info" aria-hidden="true"></i> Upload to compress</span>
      `;
    }
  }

  function updateAnalysisUI(data) {
    const chips = [];
    if (data.page_count)  chips.push(`<span class="cp-file-analysis-chip"><i class="fa fa-file-lines" aria-hidden="true"></i> ${data.page_count} pages</span>`);
    if (data.image_count) chips.push(`<span class="cp-file-analysis-chip"><i class="fa fa-image" aria-hidden="true"></i> ${data.image_count} images</span>`);
    if (data.font_count)  chips.push(`<span class="cp-file-analysis-chip"><i class="fa fa-font" aria-hidden="true"></i> ${data.font_count} fonts</span>`);
    if (data.content_type) {
      const ct = { image_heavy: '📸 Image-heavy', text_heavy: '📝 Text-heavy', mixed: '⚖️ Mixed' }[data.content_type] || data.content_type;
      chips.push(`<span class="cp-file-analysis-chip">${ct}</span>`);
    }
    if (data.estimated_reductions_by_preset) {
      const med = data.estimated_reductions_by_preset.medium;
      if (med) chips.push(`<span class="cp-file-analysis-chip" style="color:var(--c1);border-color:rgba(16,185,129,0.4)"><i class="fa fa-chart-line" aria-hidden="true"></i> ~${med}% reduction possible</span>`);
    }
    D.fileAnalysis.innerHTML = chips.join('') || '<span class="cp-file-analysis-chip"><i class="fa fa-check" aria-hidden="true"></i> PDF ready</span>';
  }

  function updateModeEstimates(data) {
    if (!data.estimated_reductions_by_preset) return;
    const map = {
      screen:   'est-screen',
      low:      'est-low',
      medium:   'est-medium',
      high:     'est-high',
      lossless: 'est-lossless',
    };
    for (const [k, id] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (!el) continue;
      const pct = data.estimated_reductions_by_preset[k];
      if (pct != null) el.textContent = `~${pct}% off`;
    }
  }

  function removeFile() {
    FILE = null; FILE_URL = null; RESULT_BLOB = null; ORIG_FNAME = '';
    _analysisData = {};
    D.fileCard.hidden   = true;
    D.dropzone.hidden   = false;
    D.modesSection.hidden   = true;
    D.advSection.hidden     = true;
    D.actionArea.hidden     = true;
    D.progressSection.hidden = true;
    D.resultsSection.hidden  = true;
    if (D.fileInput) D.fileInput.value = '';
    closeSSE();
    beep(300, 'sine', 0.12);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     COMPRESSION MODE CARDS
  ═══════════════════════════════════════════════════════════════════════════ */
  function initModes() {
    SELECTED_MODE = localStorage.getItem(MODE_KEY) || 'medium';
    document.querySelectorAll('.cp-mode-card').forEach(card => {
      const m = card.dataset.mode;
      card.classList.toggle('active', m === SELECTED_MODE);
      card.setAttribute('aria-checked', m === SELECTED_MODE ? 'true' : 'false');

      const select = () => selectMode(m);
      card.addEventListener('click', select);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
    });
  }

  function selectMode(m) {
    SELECTED_MODE = m;
    localStorage.setItem(MODE_KEY, m);
    document.querySelectorAll('.cp-mode-card').forEach(card => {
      const active = card.dataset.mode === m;
      card.classList.toggle('active', active);
      card.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    beep(520 + (['screen','low','medium','high','lossless'].indexOf(m) * 40), 'triangle', 0.08, 0.08);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ADVANCED OPTIONS TOGGLES
  ═══════════════════════════════════════════════════════════════════════════ */
  function initAdvToggle() {
    const openAdv = () => {
      const isOpen = D.advPanel.classList.toggle('open');
      D.advToggle.classList.toggle('open', isOpen);
      D.advToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      beep(isOpen ? 600 : 400, 'sine', 0.08, 0.06);
    };
    D.advToggle.addEventListener('click', openAdv);
    D.advToggle.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAdv(); } });
  }

  function initToggles() {
    const toggles = [
      { el: D.grayscaleToggle, key: 'grayscale' },
      { el: D.metaToggle,      key: 'meta' },
      { el: D.annotToggle,     key: 'annot' },
      { el: D.linearToggle,    key: 'linear' },
      { el: D.targetToggle,    key: 'target' },
    ];
    toggles.forEach(({ el, key }) => {
      if (!el) return;
      const toggle = () => {
        const isOn = el.classList.toggle('on');
        el.setAttribute('aria-checked', isOn ? 'true' : 'false');
        beep(isOn ? 660 : 440, 'sine', 0.08, 0.07);
        if (key === 'target') D.targetSizeRow.hidden = !isOn;
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
  }

  function getAdvOptions() {
    return {
      grayscale:         D.grayscaleToggle.classList.contains('on'),
      strip_metadata:    D.metaToggle.classList.contains('on'),
      remove_annotations:D.annotToggle.classList.contains('on'),
      linearize:         D.linearToggle.classList.contains('on'),
      target_size_kb:    D.targetToggle.classList.contains('on') ? parseInt(D.targetSizeInput.value, 10) || 0 : 0,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     PROGRESS
  ═══════════════════════════════════════════════════════════════════════════ */
  function setProgress(pct, title, sub) {
    pct = Math.min(100, Math.max(0, pct));
    D.progressBar.style.width = pct + '%';
    D.progressBarWrap.setAttribute('aria-valuenow', pct);
    D.progressPct.textContent = pct + '%';
    if (title) D.progressTitle.textContent = title;
    if (sub)   D.progressSub.textContent   = sub;
    /* Update step chips */
    const chips = D.chips;
    if (pct >= 5)  { chips.upload.classList.add('active'); }
    if (pct >= 15) { chips.upload.classList.replace('active', 'done'); chips.analyze.classList.add('active'); }
    if (pct >= 30) { chips.analyze.classList.replace('active', 'done'); chips.gs.classList.add('active'); }
    if (pct >= 55) { chips.gs.classList.replace('active', 'done'); chips.fitz.classList.add('active'); }
    if (pct >= 75) { chips.fitz.classList.replace('active', 'done'); chips.pikepdf.classList.add('active'); }
    if (pct >= 90) { chips.pikepdf.classList.replace('active', 'done'); chips.finalize.classList.add('active'); }
    if (pct >= 100){ chips.finalize.classList.replace('active', 'done'); }
  }

  function resetChips() {
    Object.values(D.chips).forEach(c => c.classList.remove('active', 'done'));
  }

  function startSimProgress() {
    let pct = 0;
    const phases = [
      { target: 12,  speed: 120,  title: 'Uploading…',       sub: 'Sending file to server…' },
      { target: 25,  speed: 100,  title: 'Analysing PDF…',    sub: 'Counting images, fonts, streams…' },
      { target: 45,  speed: 80,   title: 'Ghostscript…',      sub: 'Applying distiller preset…' },
      { target: 65,  speed: 90,   title: 'PyMuPDF…',          sub: 'Recompressing images…' },
      { target: 80,  speed: 110,  title: 'pikepdf…',          sub: 'Optimising object streams…' },
      { target: 92,  speed: 130,  title: 'Finalising…',       sub: 'Picking smallest result…' },
    ];
    let phase = 0;
    SIM_TIMER = setInterval(() => {
      if (phase >= phases.length) return;
      const { target, speed, title, sub } = phases[phase];
      pct += (target - pct) * 0.08;
      setProgress(Math.round(pct), title, sub);
      if (pct >= target - 1) phase++;
    }, 120);
  }

  function stopSimProgress() {
    if (SIM_TIMER) { clearInterval(SIM_TIMER); SIM_TIMER = null; }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SSE
  ═══════════════════════════════════════════════════════════════════════════ */
  function openSSE(jobId) {
    closeSSE();
    JOB_ID = jobId;
    try {
      SSE_SRC = new EventSource(`/api/progress/${jobId}`);
      SSE_SRC.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.pct != null) {
            stopSimProgress();
            setProgress(msg.pct, msg.title || '', msg.sub || '');
          }
        } catch (_) {}
      };
      SSE_SRC.onerror = () => { closeSSE(); };
    } catch (_) {}
  }

  function closeSSE() {
    if (SSE_SRC) { try { SSE_SRC.close(); } catch (_) {} SSE_SRC = null; }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     COMPRESS ACTION
  ═══════════════════════════════════════════════════════════════════════════ */
  async function doCompress() {
    if (!FILE) { showToast('Please select a PDF file first.', 'warning'); D.dropzone.classList.add('shake'); setTimeout(()=>D.dropzone.classList.remove('shake'),500); return; }

    /* UI → loading state */
    D.compressBtn.disabled = true;
    D.compressBtnIcon.className = 'fa fa-spinner spin';
    D.compressBtnText.textContent = 'Compressing…';
    D.progressSection.hidden = false;
    D.resultsSection.hidden  = true;
    resetChips();
    setProgress(0, 'Starting compression…', 'Preparing engines…');
    D.progressSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    playSound('start');

    /* Generate job ID for SSE */
    JOB_ID = 'cp_' + Math.random().toString(36).slice(2, 10);
    openSSE(JOB_ID);
    startSimProgress(); /* Fallback sim in case SSE doesn't fire */

    try {
      const opts = getAdvOptions();
      const fd = new FormData();
      fd.append('file', FILE);
      fd.append('quality', SELECTED_MODE);
      fd.append('grayscale', opts.grayscale ? 'true' : 'false');
      fd.append('strip_metadata', opts.strip_metadata ? 'true' : 'false');
      fd.append('remove_annotations', opts.remove_annotations ? 'true' : 'false');
      fd.append('linearize', opts.linearize ? 'true' : 'false');
      if (opts.target_size_kb > 0) fd.append('target_size_kb', opts.target_size_kb);
      fd.append('job_id', JOB_ID);

      const start = Date.now();
      const resp = await fetch('/api/compress-pdf', { method: 'POST', body: fd });

      stopSimProgress();
      closeSSE();

      if (!resp.ok) {
        let errMsg = 'Compression failed. Please try again.';
        try { const d = await resp.json(); errMsg = d.error || errMsg; } catch (_) {}
        throw new Error(errMsg);
      }

      setProgress(100, 'Done! ✓', 'Compression complete!');

      /* Read headers */
      const origSize   = parseInt(resp.headers.get('X-Original-Size') || '0', 10);
      const compSize   = parseInt(resp.headers.get('X-Compressed-Size') || '0', 10);
      const reductionS = resp.headers.get('X-Reduction') || '0%';
      const methodUsed = resp.headers.get('X-Method-Used') || 'multi-engine';
      const pageCount  = resp.headers.get('X-Page-Count') || '';
      const imgCount   = resp.headers.get('X-Image-Count') || '';
      const procMs     = resp.headers.get('X-Processing-Ms') || '';
      const reduction  = parseFloat(reductionS.replace('%', '')) || 0;

      /* Read blob */
      RESULT_BLOB = await resp.blob();
      if (FILE_URL) URL.revokeObjectURL(FILE_URL);
      FILE_URL = URL.createObjectURL(RESULT_BLOB);

      const elapsed = ((Date.now() - start) / 1000).toFixed(1);

      /* Show results */
      showResults({
        origSize, compSize, reduction, methodUsed,
        pageCount, imgCount, procMs: procMs || (elapsed * 1000),
        elapsed,
      });

    } catch (err) {
      stopSimProgress(); closeSSE();
      playSound('error');
      showToast(`Error: ${err.message}`, 'error', 6000);
      D.progressSection.hidden = true;
      resetBtn_state();
    }
  }

  function resetBtn_state() {
    D.compressBtn.disabled = false;
    D.compressBtnIcon.className = 'fa fa-compress-arrows-alt';
    D.compressBtnText.textContent = 'Compress PDF Now';
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RESULTS DISPLAY
  ═══════════════════════════════════════════════════════════════════════════ */
  function showResults({ origSize, compSize, reduction, methodUsed, pageCount, imgCount, procMs, elapsed }) {
    /* Sounds */
    playSound('success');

    /* Hide progress, show results */
    setTimeout(() => {
      D.progressSection.hidden = true;
      D.resultsSection.hidden  = false;
      D.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      /* Animate reduction ring */
      animateRing(reduction);

      /* Stat values */
      D.statOriginal.textContent   = fmtBytes(origSize);
      D.statCompressed.textContent = fmtBytes(compSize);
      D.statSaved.textContent      = fmtBytes(origSize - compSize) + ` (${fmtPct(reduction)} saved)`;
      D.statMethod.textContent     = formatMethod(methodUsed);

      /* Bars */
      D.barOrigLabel.textContent = fmtBytes(origSize);
      D.barCompLabel.textContent = fmtBytes(compSize);
      setTimeout(() => {
        D.barOrig.style.width = '100%';
        const ratio = origSize > 0 ? (compSize / origSize) * 100 : 0;
        D.barComp.style.width = Math.max(2, ratio) + '%';
      }, 200);

      /* Result title */
      if (reduction >= 50) {
        D.resultTitle.textContent   = `🎉 Excellent! ${fmtPct(reduction)} Reduction!`;
        D.resultSubtitle.textContent = `Compressed from ${fmtBytes(origSize)} → ${fmtBytes(compSize)} in ${elapsed}s`;
      } else if (reduction >= 20) {
        D.resultTitle.textContent   = `✅ PDF Compressed Successfully!`;
        D.resultSubtitle.textContent = `Reduced by ${fmtPct(reduction)} — ${fmtBytes(origSize)} → ${fmtBytes(compSize)}`;
      } else if (reduction > 0) {
        D.resultTitle.textContent   = `✅ PDF Optimised`;
        D.resultSubtitle.textContent = `${fmtPct(reduction)} reduction — PDF was already well optimised`;
      } else {
        D.resultTitle.textContent   = `✅ PDF Processed`;
        D.resultSubtitle.textContent = `No further reduction possible — PDF is already optimised`;
      }

      /* Ring subtext */
      D.ringSubtext.textContent = `${fmtBytes(origSize)} → ${fmtBytes(compSize)}`;

      /* Quality note */
      updateQualityNote(SELECTED_MODE, reduction, methodUsed);

      /* Download button text */
      D.downloadBtnText.textContent = `Download ${fmtBytes(compSize)} PDF`;

    }, 400);

    /* Confetti for >30% reduction */
    if (reduction >= 30) {
      setTimeout(() => launchConfetti(), 800);
    }

    resetBtn_state();
  }

  function formatMethod(m) {
    if (!m) return 'Multi-engine pipeline';
    const map = {
      'ghostscript': 'Ghostscript distiller',
      'fitz+pikepdf': 'PyMuPDF + pikepdf',
      'fitz': 'PyMuPDF image recompression',
      'pikepdf': 'pikepdf stream optimization',
      'qpdf': 'qpdf stream recompression',
      'qpdf_linearized': 'qpdf (linearized)',
      'pypdf': 'pypdf orphan removal',
      'ghostscript_aggressive': 'Ghostscript (aggressive)',
      'none (no reduction found)': 'No reduction found',
    };
    return map[m] || m;
  }

  function updateQualityNote(mode, reduction, method) {
    const notes = {
      screen:   'Screen preset (72 DPI): maximum compression for screen viewing. Some image quality reduction is expected.',
      low:      'Low preset (96 DPI): good for email attachments and sharing. Slight image quality reduction.',
      medium:   'Medium preset (150 DPI): recommended balance of size and quality. Suitable for most professional uses.',
      high:     'High preset (200 DPI): excellent quality with meaningful compression. Ideal for professional documents.',
      lossless: 'Lossless preset: zero image quality change. Only PDF structure, streams, and metadata were optimised.',
    };
    D.qualityNoteText.textContent = notes[mode] || 'Compression complete.';
    if (reduction === 0) {
      D.qualityNoteText.textContent = 'This PDF was already highly optimised. No further size reduction is possible with the selected settings. Try the Screen preset for more aggressive compression.';
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     REDUCTION RING ANIMATION
  ═══════════════════════════════════════════════════════════════════════════ */
  function animateRing(targetPct) {
    const circumference = 2 * Math.PI * 45; /* r=45 */
    const fill  = D.ringFill;
    const label = D.ringPct;
    let current = 0;
    const step = () => {
      current += (targetPct - current) * 0.07;
      const offset = circumference - (current / 100) * circumference;
      fill.style.strokeDashoffset = offset;
      label.textContent = Math.round(current) + '%';
      if (Math.abs(current - targetPct) > 0.3) requestAnimationFrame(step);
      else { fill.style.strokeDashoffset = circumference - (targetPct / 100) * circumference; label.textContent = Math.round(targetPct) + '%'; }
    };
    requestAnimationFrame(step);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CONFETTI
  ═══════════════════════════════════════════════════════════════════════════ */
  function launchConfetti() {
    if (typeof confetti === 'function') {
      const opts = { particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#10b981','#34d399','#6ee7b7','#059669','#ffffff'] };
      confetti({ ...opts, angle: 60,  origin: { x: 0.1, y: 0.6 } });
      setTimeout(() => confetti({ ...opts, angle: 120, origin: { x: 0.9, y: 0.6 } }), 220);
      setTimeout(() => confetti({ ...opts, angle: 90,  origin: { x: 0.5, y: 0.5 }, particleCount: 50 }), 440);
    } else {
      /* CSS confetti fallback */
      for (let i = 0; i < 18; i++) {
        const p = document.createElement('div');
        p.style.cssText = `position:fixed;top:-10px;left:${Math.random()*100}%;width:8px;height:8px;border-radius:2px;background:${['#10b981','#34d399','#059669'][i%3]};z-index:9999;pointer-events:none;animation:fall${i%2} ${0.8+Math.random()*0.8}s ease forwards ${Math.random()*0.4}s;`;
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1800);
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     DOWNLOAD
  ═══════════════════════════════════════════════════════════════════════════ */
  function doDownload() {
    if (!FILE_URL) { showToast('No compressed file available. Please compress first.', 'warning'); return; }
    playSound('download');
    const a = document.createElement('a');
    a.href = FILE_URL;
    a.download = `${ORIG_FNAME}_compressed.pdf`;
    a.click();
    showToast(`Downloading: ${ORIG_FNAME}_compressed.pdf`, 'success');
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RESET
  ═══════════════════════════════════════════════════════════════════════════ */
  function doReset() {
    FILE = null; FILE_URL = null; RESULT_BLOB = null; ORIG_FNAME = '';
    _analysisData = {};
    D.fileCard.hidden        = true;
    D.dropzone.hidden        = false;
    D.modesSection.hidden    = true;
    D.advSection.hidden      = true;
    D.actionArea.hidden      = true;
    D.progressSection.hidden = true;
    D.resultsSection.hidden  = true;
    if (D.fileInput) D.fileInput.value = '';
    /* Reset ring */
    if (D.ringFill) { D.ringFill.style.strokeDashoffset = '283'; }
    if (D.ringPct)  { D.ringPct.textContent = '0%'; }
    if (D.barOrig)  { D.barOrig.style.width = '100%'; }
    if (D.barComp)  { D.barComp.style.width = '0%'; }
    resetChips();
    resetBtn_state();
    closeSSE();
    stopSimProgress();
    /* Scroll to top */
    window.scrollTo({ top: 0, behavior: 'smooth' });
    beep(440, 'sine', 0.15, 0.1);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SHARE
  ═══════════════════════════════════════════════════════════════════════════ */
  async function doShare() {
    const url  = 'https://ishutools.fun/tools/compress-pdf/';
    const text = 'Compress PDF free online — up to 90% size reduction, no signup! IshuTools by Ishu Kumar';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'IshuTools PDF Compressor', text, url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast('Link copied to clipboard!', 'success');
      }
    } catch (_) {
      try { await navigator.clipboard.writeText(url); showToast('Link copied!', 'success'); } catch (_) { showToast('Share: ' + url, 'info', 6000); }
    }
    beep(660, 'sine', 0.1, 0.08);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     DRAG & DROP
  ═══════════════════════════════════════════════════════════════════════════ */
  function initDrop() {
    const dz = D.dropzone;
    ['dragenter','dragover'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.add('drag-over'); }));
    ['dragleave','dragend','drop'].forEach(evt => dz.addEventListener(evt, e => { e.preventDefault(); dz.classList.remove('drag-over'); }));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files?.length) handleFile(files[0]);
    });
    dz.addEventListener('click', e => { if (e.target !== D.browseBtn && !D.browseBtn.contains(e.target)) D.fileInput.click(); });
    dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); D.fileInput.click(); } });
    D.browseBtn.addEventListener('click', e => { e.stopPropagation(); D.fileInput.click(); });
    D.fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     FAQ ACCORDION
  ═══════════════════════════════════════════════════════════════════════════ */
  function initFaq() {
    document.querySelectorAll('.cp-faq-item').forEach(item => {
      const q = item.querySelector('.cp-faq-q');
      if (!q) return;
      const open = () => {
        const isOpen = item.classList.toggle('open');
        q.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        beep(isOpen ? 550 : 400, 'sine', 0.07, 0.05);
      };
      q.addEventListener('click', open);
      q.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     COUNTER ANIMATION (IntersectionObserver)
  ═══════════════════════════════════════════════════════════════════════════ */
  function initCounters() {
    const counters = document.querySelectorAll('.cp-counter-num');
    if (!counters.length) return;
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || _countersDone) return;
        _countersDone = true;
        counters.forEach(el => animateCounter(el));
        obs.disconnect();
      });
    }, { threshold: 0.5 });
    counters.forEach(c => obs.observe(c));
  }

  function animateCounter(el) {
    const target = parseFloat(el.dataset.count) || 0;
    const suffix = el.dataset.suffix || '';
    const isFloat = target % 1 !== 0;
    const dur = 1600;
    const start = performance.now();
    const update = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const cur = isFloat ? (target * ease).toFixed(1) : Math.round(target * ease);
      el.textContent = cur + suffix;
      if (t < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     KEYBOARD SHORTCUT
  ═══════════════════════════════════════════════════════════════════════════ */
  function initKeyboard() {
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (FILE && !D.compressBtn.disabled) doCompress();
      }
      if (e.key === 'Escape') {
        if (!D.resultsSection.hidden) doReset();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SCROLL REVEAL (subtle y-only, no opacity:0)
  ═══════════════════════════════════════════════════════════════════════════ */
  function initScrollReveal() {
    const items = document.querySelectorAll('.cp-feature-card, .cp-step-card, .cp-review-card, .cp-related-card, .cp-faq-item');
    const obs = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.transform = 'translateY(0)';
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    items.forEach((el, i) => {
      el.style.transform = 'translateY(24px)';
      el.style.transition = `transform 0.5s cubic-bezier(0.4,0,0.2,1) ${(i % 6) * 60}ms`;
      obs.observe(el);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     MAIN INIT
  ═══════════════════════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', () => {
    initDom();
    initTheme();
    initSounds();
    initBgCanvas();
    initModes();
    initAdvToggle();
    initToggles();
    initDrop();
    initFaq();
    initCounters();
    initScrollReveal();
    initKeyboard();

    /* Button listeners */
    D.compressBtn.addEventListener('click', () => {
      D.compressBtn.classList.add('btn-bounce');
      setTimeout(() => D.compressBtn.classList.remove('btn-bounce'), 360);
      doCompress();
    });
    D.downloadBtn.addEventListener('click', doDownload);
    D.downloadBtn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') doDownload(); });
    D.resetBtn.addEventListener('click', doReset);
    D.shareBtn.addEventListener('click', doShare);
    D.removeFileBtn.addEventListener('click', removeFile);
    D.themeBtn.addEventListener('click', toggleTheme);
    D.soundBtn.addEventListener('click', toggleSound);

    /* Paste PDF support */
    document.addEventListener('paste', e => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type === 'application/pdf') {
          const f = item.getAsFile();
          if (f) { handleFile(f); break; }
        }
      }
    });
  });

})();
