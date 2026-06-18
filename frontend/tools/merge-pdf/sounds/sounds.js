/**
 * IshuTools.fun — Merge PDF Sounds v8.0
 * ALL 6 real MP3 files mapped to meaningful moments
 * + Web Audio API synthesis for micro-interactions
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 */
(function () {
  'use strict';

  const KEY = 'ishu-sounds-v3';
  let _on = true;
  try { _on = localStorage.getItem(KEY) !== 'false'; } catch (_) {}

  /* ── AudioContext (lazy) ──────────────────────── */
  let _ctx = null;
  function ctx() {
    if (!_ctx) {
      try {
        _ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      } catch (_) { return null; }
    }
    if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  }

  function safe(fn) {
    if (!_on) return;
    try { const c = ctx(); if (c) fn(c); } catch (_) {}
  }

  /* ── MP3 pool ─────────────────────────────────── */
  const _pool = {};
  function _playMp3(file, vol = 0.8, rate = 1.0) {
    if (!_on) return;
    try {
      if (!_pool[file]) {
        _pool[file] = new Audio('sounds/' + file);
        _pool[file].preload = 'auto';
      }
      const a = _pool[file].cloneNode();
      a.volume = Math.min(1, Math.max(0, vol));
      a.playbackRate = rate;
      a.play().catch(() => {});
    } catch (_) {}
  }

  /* ── Web Audio helpers ────────────────────────── */
  function osc(c, dest, freq, type, t, dur, peak, a = 0.005, r = 0.12, detune = 0) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur - 0.01);
    o.start(t); o.stop(t + dur + r);
  }

  function noise(c, dest, t, dur, peak, type = 'bandpass', freq = 2000, Q = 1) {
    const sr = c.sampleRate, len = Math.ceil(sr * (dur + 0.05));
    const buf = c.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; fl.type = type; fl.frequency.value = freq; fl.Q.value = Q;
    src.connect(fl); fl.connect(g); g.connect(dest);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t); src.stop(t + dur + 0.05);
  }

  /* ══════════════════════════════════════════════
     MAPPED SOUNDS
     are_bhai_bhai_bhai.mp3    → file added (excited)
     cameraman_focus_karo.mp3  → merge start (dramatic)
     waah_kya_scene_hai.mp3    → merge success (wow!)
     fahhhhh.mp3               → download (satisfied)
     eh_eh_eh_ehhhhhh.mp3      → error (oh no!)
     jaldi_waha_sa_hato.mp3    → large file warning
  ══════════════════════════════════════════════ */

  /* File Added — are bhai bhai bhai! */
  function playFileAdd() {
    _playMp3('are_bhai_bhai_bhai.mp3', 0.65);
  }

  /* File Removed — soft down-thud synthesis */
  function playFileRemove() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.40; mg.connect(c.destination);
      osc(c, mg, 300, 'sine', t, 0.13, 0.34, 0.003, 0.12);
      osc(c, mg, 190, 'sine', t + 0.05, 0.1, 0.24, 0.003, 0.09);
      noise(c, mg, t, 0.06, 0.07, 'lowpass', 380, 0.5);
    });
  }

  /* Drag Start — subtle whoosh */
  function playDragStart() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.28; mg.connect(c.destination);
      noise(c, mg, t, 0.09, 0.14, 'bandpass', 1600, 2.5);
      osc(c, mg, 280, 'sine', t, 0.08, 0.2, 0.004, 0.08);
    });
  }

  /* Drag Drop — satisfying thud */
  function playDragDrop() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.42; mg.connect(c.destination);
      osc(c, mg, 180, 'sine', t, 0.07, 0.48, 0.003, 0.11);
      noise(c, mg, t, 0.09, 0.12, 'lowpass', 600, 0.8);
      osc(c, mg, 340, 'sine', t + 0.02, 0.06, 0.22, 0.003, 0.09);
    });
  }

  /* Sort — quick click */
  function playSort() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.30; mg.connect(c.destination);
      osc(c, mg, 680, 'triangle', t, 0.06, 0.24, 0.002, 0.06);
      osc(c, mg, 860, 'triangle', t + 0.04, 0.05, 0.18, 0.002, 0.05);
    });
  }

  /* Merge Start — cameraman focus karo! */
  function playMergeStart() {
    _playMp3('cameraman_focus_karo.mp3', 0.72);
  }

  /* Progress Tick — subtle beep */
  function playProgressTick() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.15; mg.connect(c.destination);
      osc(c, mg, 1100, 'sine', t, 0.05, 0.18, 0.002, 0.04);
    });
  }

  /* Success — waah kya scene hai! */
  function playSuccess() {
    _playMp3('waah_kya_scene_hai.mp3', 0.76);
  }

  /* Download — fahhhhh! */
  function playDownload() {
    _playMp3('fahhhhh.mp3', 0.80);
  }

  /* Error — eh eh eh ehhhhhh */
  function playError() {
    _playMp3('eh_eh_eh_ehhhhhh.mp3', 0.70);
  }

  /* Large File Warning — jaldi waha sa hato */
  function playWarning() {
    _playMp3('jaldi_waha_sa_hato.mp3', 0.60);
  }

  /* Expand — airy rise */
  function playExpand() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.24; mg.connect(c.destination);
      osc(c, mg, 480, 'sine', t, 0.08, 0.2, 0.003, 0.08);
      osc(c, mg, 620, 'sine', t + 0.06, 0.06, 0.14, 0.003, 0.07);
    });
  }

  /* Collapse — airy fall */
  function playCollapse() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.22; mg.connect(c.destination);
      osc(c, mg, 600, 'sine', t, 0.07, 0.18, 0.003, 0.08);
      osc(c, mg, 460, 'sine', t + 0.05, 0.05, 0.14, 0.003, 0.07);
    });
  }

  /* Toggle On */
  function playToggleOn() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.26; mg.connect(c.destination);
      osc(c, mg, 660, 'sine', t, 0.05, 0.22, 0.003, 0.07);
      osc(c, mg, 880, 'sine', t + 0.05, 0.05, 0.16, 0.003, 0.06);
    });
  }

  /* Toggle Off */
  function playToggleOff() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.22; mg.connect(c.destination);
      osc(c, mg, 520, 'sine', t, 0.05, 0.18, 0.003, 0.07);
      osc(c, mg, 380, 'sine', t + 0.05, 0.04, 0.14, 0.003, 0.06);
    });
  }

  /* Preset — magical sparkle */
  function playPreset() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.32; mg.connect(c.destination);
      [440, 554, 659, 880].forEach((f, i) =>
        osc(c, mg, f, 'sine', t + i * 0.055, 0.18, 0.26 - i * 0.04, 0.003, 0.13));
    });
  }

  /* Copy — short click */
  function playCopy() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.26; mg.connect(c.destination);
      osc(c, mg, 900, 'sine', t, 0.04, 0.20, 0.002, 0.05);
      osc(c, mg, 1100, 'sine', t + 0.04, 0.04, 0.14, 0.002, 0.04);
    });
  }

  /* Merge Again — bright reset */
  function playMergeAgain() {
    safe(c => {
      const t = c.currentTime, mg = c.createGain();
      mg.gain.value = 0.28; mg.connect(c.destination);
      osc(c, mg, 440, 'sine', t, 0.06, 0.20, 0.003, 0.09);
      osc(c, mg, 330, 'sine', t + 0.07, 0.05, 0.17, 0.003, 0.08);
    });
  }

  /* Resume & toggle */
  function resume() { ctx(); }
  function toggle() {
    _on = !_on;
    try { localStorage.setItem(KEY, String(_on)); } catch (_) {}
  }
  function isEnabled() { return _on; }

  /* Preload all MP3 files */
  function preload() {
    [
      'waah_kya_scene_hai.mp3',
      'fahhhhh.mp3',
      'are_bhai_bhai_bhai.mp3',
      'cameraman_focus_karo.mp3',
      'eh_eh_eh_ehhhhhh.mp3',
      'jaldi_waha_sa_hato.mp3',
    ].forEach(f => {
      try {
        const a = new Audio('sounds/' + f);
        a.preload = 'auto';
        _pool[f] = a;
      } catch (_) {}
    });
  }

  /* Global SOUNDS API */
  window.SOUNDS = {
    playFileAddSound:    playFileAdd,
    playFileRemoveSound: playFileRemove,
    playDragStartSound:  playDragStart,
    playDragDropSound:   playDragDrop,
    playSortSound:       playSort,
    playMergeStartSound: playMergeStart,
    playProgressTick:    playProgressTick,
    playSuccessChime:    playSuccess,
    playDownloadWhoosh:  playDownload,
    playErrorSound:      playError,
    playWarningSound:    playWarning,
    playExpandSound:     playExpand,
    playCollapseSound:   playCollapse,
    playToggleOnSound:   playToggleOn,
    playToggleOffSound:  playToggleOff,
    playPresetSound:     playPreset,
    playCopySound:       playCopy,
    playMergeAgainSound: playMergeAgain,
    toggle, isEnabled, resume, preload,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preload);
  } else {
    preload();
  }
})();
