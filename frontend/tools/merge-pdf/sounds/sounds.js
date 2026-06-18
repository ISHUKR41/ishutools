/**
 * IshuTools.fun — Merge PDF Sounds v7.0
 * Uses real MP3 files + Web Audio API synthesis for micro-interactions
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 */
(function () {
  'use strict';

  const KEY = 'ishu-sounds-v2';
  let _on = true;
  try { _on = localStorage.getItem(KEY) !== 'false'; } catch (_) {}

  /* ── Audio Context (lazy) ─────────────────────────── */
  let _ctx = null;
  function ctx() {
    if (!_ctx) {
      try { _ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); } catch (_) { return null; }
    }
    if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  }

  function safe(fn) {
    if (!_on) return;
    try { const c = ctx(); if (c) fn(c); } catch (_) {}
  }

  /* ── MP3 pool cache ───────────────────────────────── */
  const _mp3Cache = {};
  function _playMp3(file, vol = 1.0) {
    if (!_on) return;
    try {
      if (!_mp3Cache[file]) {
        _mp3Cache[file] = new Audio('sounds/' + file);
        _mp3Cache[file].preload = 'auto';
      }
      const a = _mp3Cache[file].cloneNode();
      a.volume = Math.min(1, Math.max(0, vol));
      a.play().catch(() => {});
    } catch (_) {}
  }

  /* ── Web Audio Helpers ────────────────────────────── */
  function osc(c, dest, freq, type, t, dur, peak, a = 0.005, r = 0.12, detune = 0) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur - 0.01);
    o.start(t); o.stop(t + dur + r);
  }

  function noise(c, dest, t, dur, peak, type = 'bandpass', freq = 2000, Q = 1) {
    const sr = c.sampleRate;
    const len = Math.ceil(sr * (dur + 0.05));
    const buf = c.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const fl = c.createBiquadFilter();
    fl.type = type; fl.frequency.value = freq; fl.Q.value = Q;
    const g = c.createGain();
    src.connect(fl); fl.connect(g); g.connect(dest);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t); src.stop(t + dur + 0.05);
  }

  /* ══════════════════════════════════════════════════
   SOUNDS — MP3 files for key events, synthesis for micro-UX
  ══════════════════════════════════════════════════ */

  /* File added — MP3 pop */
  function playFileAdd() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.48; mg.connect(c.destination);
      osc(c, mg, 560, 'sine', t, 0.11, 0.32, 0.003, 0.09);
      osc(c, mg, 840, 'sine', t + 0.04, 0.09, 0.16, 0.003, 0.07);
    });
  }

  /* File removed — soft down-thud */
  function playFileRemove() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.42; mg.connect(c.destination);
      osc(c, mg, 300, 'sine', t, 0.13, 0.35, 0.003, 0.12);
      osc(c, mg, 190, 'sine', t + 0.05, 0.1, 0.25, 0.003, 0.09);
      noise(c, mg, t, 0.06, 0.07, 'lowpass', 380, 0.5);
    });
  }

  /* Drag start — subtle whoosh */
  function playDragStart() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.3; mg.connect(c.destination);
      noise(c, mg, t, 0.09, 0.14, 'bandpass', 1600, 2.5);
      osc(c, mg, 280, 'sine', t, 0.08, 0.2, 0.004, 0.08);
    });
  }

  /* Drag drop — satisfying thud */
  function playDragDrop() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.44; mg.connect(c.destination);
      osc(c, mg, 180, 'sine', t, 0.07, 0.5, 0.003, 0.11);
      noise(c, mg, t, 0.09, 0.13, 'lowpass', 600, 0.8);
      osc(c, mg, 340, 'sine', t + 0.02, 0.06, 0.22, 0.003, 0.09);
    });
  }

  /* Sort — quick click */
  function playSort() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.32; mg.connect(c.destination);
      osc(c, mg, 680, 'triangle', t, 0.06, 0.26, 0.002, 0.06);
      osc(c, mg, 860, 'triangle', t + 0.04, 0.05, 0.18, 0.002, 0.05);
    });
  }

  /* Merge start — ascending arpeggiate */
  function playMergeStart() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.44; mg.connect(c.destination);
      const freqs = [330, 440, 550, 660];
      freqs.forEach((f, i) => osc(c, mg, f, 'sine', t + i * 0.08, 0.2, 0.28 - i * 0.03, 0.004, 0.15));
    });
  }

  /* Progress tick — subtle beep */
  function playProgressTick() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.18; mg.connect(c.destination);
      osc(c, mg, 1100, 'sine', t, 0.06, 0.2, 0.002, 0.05);
    });
  }

  /* Success — waah kya scene hai! */
  function playSuccess() {
    _playMp3('waah_kya_scene_hai.mp3', 0.72);
  }

  /* Download — fahhhhh! */
  function playDownload() {
    _playMp3('fahhhhh.mp3', 0.78);
  }

  /* Error — jaldi waha sa hato */
  function playError() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.44; mg.connect(c.destination);
      osc(c, mg, 200, 'sawtooth', t, 0.18, 0.36, 0.004, 0.15);
      osc(c, mg, 140, 'sawtooth', t + 0.12, 0.16, 0.3, 0.004, 0.14);
      noise(c, mg, t, 0.1, 0.12, 'lowpass', 500, 0.6);
    });
  }

  /* Expand / Collapse */
  function playExpand() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.26; mg.connect(c.destination);
      osc(c, mg, 480, 'sine', t, 0.08, 0.22, 0.003, 0.08);
      osc(c, mg, 620, 'sine', t + 0.06, 0.06, 0.16, 0.003, 0.07);
    });
  }
  function playCollapse() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.24; mg.connect(c.destination);
      osc(c, mg, 600, 'sine', t, 0.08, 0.2, 0.003, 0.08);
      osc(c, mg, 460, 'sine', t + 0.06, 0.05, 0.15, 0.003, 0.07);
    });
  }

  /* Toggle on/off */
  function playToggleOn() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.28; mg.connect(c.destination);
      osc(c, mg, 660, 'sine', t, 0.06, 0.24, 0.003, 0.07);
      osc(c, mg, 880, 'sine', t + 0.05, 0.05, 0.18, 0.003, 0.06);
    });
  }
  function playToggleOff() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.24; mg.connect(c.destination);
      osc(c, mg, 520, 'sine', t, 0.06, 0.2, 0.003, 0.07);
      osc(c, mg, 380, 'sine', t + 0.05, 0.05, 0.15, 0.003, 0.06);
    });
  }

  /* Preset — magical sparkle */
  function playPreset() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.34; mg.connect(c.destination);
      [440, 554, 659, 880].forEach((f, i) =>
        osc(c, mg, f, 'sine', t + i * 0.055, 0.18, 0.28 - i * 0.04, 0.003, 0.13));
    });
  }

  /* Copy — short click */
  function playCopy() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.28; mg.connect(c.destination);
      osc(c, mg, 900, 'sine', t, 0.05, 0.22, 0.002, 0.05);
      osc(c, mg, 1100, 'sine', t + 0.04, 0.04, 0.15, 0.002, 0.04);
    });
  }

  /* Merge again — bright reset */
  function playMergeAgain() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.3; mg.connect(c.destination);
      osc(c, mg, 440, 'sine', t, 0.06, 0.22, 0.003, 0.09);
      osc(c, mg, 330, 'sine', t + 0.07, 0.06, 0.18, 0.003, 0.08);
    });
  }

  /* Resume AudioContext (call on first user gesture) */
  function resume() { ctx(); }

  /* Toggle enabled state */
  function toggle() {
    _on = !_on;
    try { localStorage.setItem(KEY, String(_on)); } catch (_) {}
  }

  function isEnabled() { return _on; }

  /* Preload MP3 files */
  function preload() {
    ['waah_kya_scene_hai.mp3', 'fahhhhh.mp3'].forEach(f => {
      try {
        const a = new Audio('sounds/' + f);
        a.preload = 'auto';
        _mp3Cache[f] = a;
      } catch (_) {}
    });
  }

  /* Expose global */
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
    playExpandSound:     playExpand,
    playCollapseSound:   playCollapse,
    playToggleOnSound:   playToggleOn,
    playToggleOffSound:  playToggleOff,
    playPresetSound:     playPreset,
    playCopySound:       playCopy,
    playMergeAgainSound: playMergeAgain,
    toggle,
    isEnabled,
    resume,
    preload,
  };

  /* Preload on load */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', preload);
  } else {
    preload();
  }
})();
