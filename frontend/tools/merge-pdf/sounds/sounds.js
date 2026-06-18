/**
 * IshuTools.fun — Merge PDF Sounds v6.0
 * Rich Web Audio API synthesis — FM, AM, additive, noise
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 */
(function () {
  'use strict';

  const KEY = 'ishu-sounds-v2';
  let _ctx = null;
  let _on = true;
  try { _on = localStorage.getItem(KEY) !== 'false'; } catch (_) {}

  function ctx() {
    if (!_ctx) {
      try { _ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive', sampleRate: 44100 }); } catch (_) { return null; }
    }
    if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  }

  function safe(fn) {
    if (!_on) return;
    try { const c = ctx(); if (c) fn(c); } catch (_) {}
  }

  /* ─── Reverb ─────────────────────────────────────── */
  function makeReverb(c, dur = 0.4, decay = 0.5) {
    const sr = c.sampleRate;
    const len = sr * dur;
    const buf = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    const n = c.createConvolver();
    n.buffer = buf;
    return n;
  }

  /* ─── ADSR oscillator ────────────────────────────── */
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

  /* ─── Noise burst ────────────────────────────────── */
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
   INDIVIDUAL SOUNDS
  ══════════════════════════════════════════════════ */

  /* File added — soft pop + rise */
  function playFileAdd() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.55; mg.connect(c.destination);
      osc(c, mg, 520, 'sine', t, 0.12, 0.35, 0.004, 0.1);
      osc(c, mg, 780, 'sine', t + 0.05, 0.1, 0.18, 0.003, 0.08);
    });
  }

  /* File removed — soft down-thud */
  function playFileRemove() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.5; mg.connect(c.destination);
      osc(c, mg, 320, 'sine', t, 0.14, 0.4, 0.003, 0.13);
      osc(c, mg, 200, 'sine', t + 0.06, 0.12, 0.28, 0.003, 0.1);
      noise(c, mg, t, 0.07, 0.08, 'lowpass', 400, 0.5);
    });
  }

  /* Drag start — subtle whoosh */
  function playDragStart() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.35; mg.connect(c.destination);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(180, t);
      o.frequency.linearRampToValueAtTime(440, t + 0.18);
      o.connect(g); g.connect(mg);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.start(t); o.stop(t + 0.25);
      noise(c, mg, t, 0.18, 0.12, 'highpass', 3000, 0.8);
    });
  }

  /* Drag drop — satisfying thock */
  function playDragDrop() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.6; mg.connect(c.destination);
      osc(c, mg, 200, 'triangle', t, 0.09, 0.7, 0.002, 0.08);
      osc(c, mg, 90,  'sine',     t, 0.16, 0.5, 0.002, 0.14);
      noise(c, mg, t, 0.06, 0.2, 'lowpass', 600, 1.2);
    });
  }

  /* Sort — quick tick */
  function playSort() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.4; mg.connect(c.destination);
      osc(c, mg, 680, 'sine', t, 0.07, 0.3, 0.002, 0.06);
      osc(c, mg, 900, 'sine', t + 0.04, 0.05, 0.18, 0.002, 0.04);
    });
  }

  /* Merge start — deep engine hum + rise */
  function playMergeStart() {
    safe(c => {
      const t = c.currentTime;
      const rv = makeReverb(c, 0.8, 0.4);
      rv.connect(c.destination);
      const mg = c.createGain(); mg.gain.value = 0.65; mg.connect(rv);
      /* Low power rumble */
      osc(c, mg, 55, 'sawtooth', t, 0.35, 0.4, 0.01, 0.3, -8);
      osc(c, mg, 55, 'sawtooth', t, 0.35, 0.38, 0.01, 0.3, 8);
      /* Bright sweep */
      const sw = c.createOscillator();
      const sg = c.createGain();
      sw.type = 'triangle'; sw.frequency.setValueAtTime(220, t + 0.05);
      sw.frequency.exponentialRampToValueAtTime(880, t + 0.5);
      sw.connect(sg); sg.connect(mg);
      sg.gain.setValueAtTime(0, t + 0.05);
      sg.gain.linearRampToValueAtTime(0.45, t + 0.18);
      sg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      sw.start(t + 0.05); sw.stop(t + 0.6);
    });
  }

  /* Merge progress tick — for each file processed */
  function playProgressTick() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.25; mg.connect(c.destination);
      osc(c, mg, 1200 + Math.random() * 400, 'sine', t, 0.04, 0.3, 0.001, 0.03);
    });
  }

  /* Success chime — triumphant 3-note chord */
  function playSuccess() {
    safe(c => {
      const t = c.currentTime;
      const rv = makeReverb(c, 1.8, 0.6);
      rv.connect(c.destination);
      const mg = c.createGain(); mg.gain.value = 0.7; mg.connect(rv);
      /* Major triad C E G in high octave */
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        osc(c, mg, freq, 'sine', t + i * 0.10, 1.1 - i * 0.08, 0.6 - i * 0.06, 0.005, 0.9);
        osc(c, mg, freq * 2, 'sine', t + i * 0.10, 0.7, 0.15, 0.005, 0.6);
      });
      /* Shimmer */
      noise(c, mg, t + 0.35, 0.3, 0.06, 'highpass', 6000, 2);
    });
  }

  /* Download whoosh */
  function playDownload() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.55; mg.connect(c.destination);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, t);
      o.frequency.exponentialRampToValueAtTime(440, t + 0.28);
      o.connect(g); g.connect(mg);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.start(t); o.stop(t + 0.35);
      noise(c, mg, t, 0.22, 0.1, 'bandpass', 2400, 1.5);
    });
  }

  /* Error buzz */
  function playError() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.5; mg.connect(c.destination);
      osc(c, mg, 180, 'sawtooth', t, 0.1, 0.6, 0.003, 0.09);
      osc(c, mg, 160, 'sawtooth', t + 0.12, 0.1, 0.5, 0.003, 0.09);
      osc(c, mg, 140, 'sawtooth', t + 0.24, 0.1, 0.4, 0.003, 0.09);
    });
  }

  /* Toggle on — bright click */
  function playToggleOn() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.4; mg.connect(c.destination);
      osc(c, mg, 900, 'sine', t, 0.06, 0.35, 0.002, 0.05);
      osc(c, mg, 1200, 'sine', t + 0.03, 0.05, 0.25, 0.001, 0.04);
    });
  }

  /* Toggle off — muted click */
  function playToggleOff() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.35; mg.connect(c.destination);
      osc(c, mg, 500, 'sine', t, 0.06, 0.3, 0.002, 0.05);
      osc(c, mg, 350, 'sine', t + 0.03, 0.05, 0.18, 0.002, 0.04);
    });
  }

  /* Expand — open swoosh */
  function playExpand() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.3; mg.connect(c.destination);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(300, t);
      o.frequency.linearRampToValueAtTime(600, t + 0.14);
      o.connect(g); g.connect(mg);
      g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.start(t); o.stop(t + 0.18);
    });
  }

  /* Collapse — close swoosh */
  function playCollapse() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.3; mg.connect(c.destination);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(600, t);
      o.frequency.linearRampToValueAtTime(280, t + 0.14);
      o.connect(g); g.connect(mg);
      g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.start(t); o.stop(t + 0.18);
    });
  }

  /* Preset — magical sparkle */
  function playPreset() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.45; mg.connect(c.destination);
      [880, 1108, 1320, 1760].forEach((f, i) => {
        osc(c, mg, f, 'sine', t + i * 0.06, 0.18, 0.4 - i * 0.06, 0.002, 0.14);
      });
    });
  }

  /* Copy — soft click */
  function playCopy() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.35; mg.connect(c.destination);
      osc(c, mg, 1000, 'sine', t, 0.05, 0.3, 0.001, 0.04);
      osc(c, mg, 1500, 'sine', t + 0.03, 0.04, 0.2, 0.001, 0.03);
    });
  }

  /* Merge again */
  function playMergeAgain() {
    safe(c => {
      const t = c.currentTime;
      const mg = c.createGain(); mg.gain.value = 0.4; mg.connect(c.destination);
      osc(c, mg, 440, 'triangle', t, 0.1, 0.4, 0.003, 0.08);
      osc(c, mg, 660, 'triangle', t + 0.07, 0.09, 0.32, 0.003, 0.07);
    });
  }

  /* ── Public API ───────────────────────────────────── */
  window.SOUNDS = {
    toggle()   { _on = !_on; try { localStorage.setItem(KEY, String(_on)); } catch (_) {} },
    isEnabled(){ return _on; },
    resume()   { try { if (_ctx) _ctx.resume(); } catch (_) {} },

    playFileAddSound:     playFileAdd,
    playFileRemoveSound:  playFileRemove,
    playDragStartSound:   playDragStart,
    playDragDropSound:    playDragDrop,
    playSortSound:        playSort,
    playMergeStartSound:  playMergeStart,
    playProgressTick:     playProgressTick,
    playSuccessChime:     playSuccess,
    playDownloadWhoosh:   playDownload,
    playErrorSound:       playError,
    playToggleOnSound:    playToggleOn,
    playToggleOffSound:   playToggleOff,
    playExpandSound:      playExpand,
    playCollapseSound:    playCollapse,
    playPresetSound:      playPreset,
    playCopySound:        playCopy,
    playMergeAgainSound:  playMergeAgain,
  };
})();
