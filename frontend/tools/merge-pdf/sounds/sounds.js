/**
 * IshuTools.fun — Merge PDF Sound Library
 * =========================================
 * Author  : Ishu Kumar (ISHUKR41 / ISHUKR75)
 * Version : 3.0
 * Engine  : Web Audio API — 100% synthesized, no CDN, no MP3 files
 *
 * Sound map (triggered automatically at the right moment):
 *  1. playFileAddSound()    — files dropped / chosen
 *  2. playFileRemoveSound() — file card removed
 *  3. playDragStartSound()  — drag handle grabbed
 *  4. playDragDropSound()   — file dropped after drag
 *  5. playMergeStartSound() — merge button clicked
 *  6. playSuccessChime()    — merge completed ✓
 *  7. playDownloadWhoosh()  — download button clicked
 *  8. playErrorSound()      — error occurred
 *  9. playExpandSound()     — file card expanded
 * 10. playCollapseSound()   — file card collapsed
 * 11. playPresetSound()     — preset selected
 * 12. playSortSound()       — sort applied
 * 13. playNotifySound(type) — toast notification
 * 14. playToggleOnSound()   — checkbox/toggle turned ON
 * 15. playToggleOffSound()  — checkbox/toggle turned OFF
 * 16. playCopySound()       — filename copied
 * 17. playMergeAgainSound() — merge again / reset
 */

;(function(global) {
  'use strict';

  /* ── Audio context singleton ─────────────────────────────── */
  let _ctx = null;
  function getCtx() {
    try {
      if (_ctx && _ctx.state !== 'closed') {
        if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
        return _ctx;
      }
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
      return _ctx;
    } catch (_) { return null; }
  }

  /* ── Volume & enable state ───────────────────────────────── */
  let _vol     = parseFloat(localStorage.getItem('ishu-sound-vol') || '0.75');
  let _enabled = localStorage.getItem('ishu-sound') !== 'false';

  function isEnabled()  { return _enabled; }
  function getVolume()  { return _vol; }
  function setVolume(v) { _vol = Math.max(0, Math.min(1, v)); localStorage.setItem('ishu-sound-vol', String(_vol)); }
  function toggle()     { _enabled = !_enabled; localStorage.setItem('ishu-sound', String(_enabled)); return _enabled; }
  function enable()     { _enabled = true;  localStorage.setItem('ishu-sound', 'true'); }
  function disable()    { _enabled = false; localStorage.setItem('ishu-sound', 'false'); }

  /* ── Low-level helpers ───────────────────────────────────── */
  function masterGain(ctx) {
    const g = ctx.createGain();
    g.gain.value = _vol;
    g.connect(ctx.destination);
    return g;
  }

  function playTone(freq, type, attack, sustain, decay, gainPeak, delayStart = 0) {
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime + delayStart;
    const mg  = masterGain(ctx);
    const o   = ctx.createOscillator();
    const g   = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(gainPeak, now + attack);
    g.gain.setValueAtTime(gainPeak, now + attack + sustain);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + sustain + decay);
    o.connect(g); g.connect(mg);
    o.start(now); o.stop(now + attack + sustain + decay + 0.02);
  }

  /* ══════════════════════════════════════════════════════════
     1. FILE ADDED — soft ascending two-note ping
  ══════════════════════════════════════════════════════════ */
  function playFileAddSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    [[523.25, 0], [783.99, 0.10]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, now + d);
      g.gain.linearRampToValueAtTime(0.22, now + d + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.26);
      o.connect(g); g.connect(mg);
      o.start(now + d); o.stop(now + d + 0.3);
    });
  }

  /* ══════════════════════════════════════════════════════════
     2. FILE REMOVED — short descending swipe
  ══════════════════════════════════════════════════════════ */
  function playFileRemoveSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    const o   = ctx.createOscillator();
    const g   = ctx.createGain();
    const f   = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(340, now);
    o.frequency.exponentialRampToValueAtTime(110, now + 0.22);
    f.type = 'lowpass'; f.frequency.value = 1000; f.Q.value = 1.5;
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    o.connect(f); f.connect(g); g.connect(mg);
    o.start(now); o.stop(now + 0.27);
  }

  /* ══════════════════════════════════════════════════════════
     3. DRAG START — very subtle tactile tick
  ══════════════════════════════════════════════════════════ */
  function playDragStartSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    const o   = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 680;
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    o.connect(g); g.connect(mg);
    o.start(now); o.stop(now + 0.06);
  }

  /* ══════════════════════════════════════════════════════════
     4. DRAG DROP — subtle soft click + tiny blip
  ══════════════════════════════════════════════════════════ */
  function playDragDropSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    [[480, 0], [640, 0.06]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.12, now + d);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.09);
      o.connect(g); g.connect(mg);
      o.start(now + d); o.stop(now + d + 0.1);
    });
  }

  /* ══════════════════════════════════════════════════════════
     5. MERGE START — rising synth charge (3 layered oscillators)
  ══════════════════════════════════════════════════════════ */
  function playMergeStartSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    const layers = [
      { baseF: 220, type: 'sine',     peak: 0.14 },
      { baseF: 330, type: 'triangle', peak: 0.10 },
      { baseF: 440, type: 'sine',     peak: 0.07 },
    ];
    layers.forEach(({ baseF, type, peak }, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const d = i * 0.055;
      o.type = type;
      o.frequency.setValueAtTime(baseF, now + d);
      o.frequency.exponentialRampToValueAtTime(baseF * 2.0, now + d + 0.38);
      g.gain.setValueAtTime(0, now + d);
      g.gain.linearRampToValueAtTime(peak, now + d + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.44);
      o.connect(g); g.connect(mg);
      o.start(now + d); o.stop(now + d + 0.48);
    });
  }

  /* ══════════════════════════════════════════════════════════
     6. SUCCESS CHIME — C5-E5-G5-C6 major arpeggio
  ══════════════════════════════════════════════════════════ */
  function playSuccessChime() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    [
      [523.25, 0.00, 0.60, 0.18],
      [659.25, 0.12, 0.55, 0.17],
      [783.99, 0.24, 0.50, 0.15],
      [1046.5, 0.36, 0.70, 0.22],
    ].forEach(([f, d, dur, pk]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, now + d);
      g.gain.linearRampToValueAtTime(pk, now + d + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + dur);
      o.connect(g); g.connect(mg);
      o.start(now + d); o.stop(now + d + dur + 0.05);
    });
    // Harmony chord pad underneath
    [523.25, 659.25, 783.99].forEach(f => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, now + 0.3);
      g.gain.linearRampToValueAtTime(0.06, now + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      o.connect(g); g.connect(mg);
      o.start(now + 0.3); o.stop(now + 1.25);
    });
  }

  /* ══════════════════════════════════════════════════════════
     7. DOWNLOAD WHOOSH — sweeping sawtooth + bright ding
  ══════════════════════════════════════════════════════════ */
  function playDownloadWhoosh() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    // Whoosh
    const o1 = ctx.createOscillator(), g1 = ctx.createGain(), lp = ctx.createBiquadFilter();
    o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(560, now);
    o1.frequency.exponentialRampToValueAtTime(80, now + 0.32);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2200, now);
    lp.frequency.exponentialRampToValueAtTime(300, now + 0.32); lp.Q.value = 2.5;
    g1.gain.setValueAtTime(0.30, now);
    g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    o1.connect(lp); lp.connect(g1); g1.connect(mg);
    o1.start(now); o1.stop(now + 0.4);
    // Ding
    const o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o2.type = 'sine'; o2.frequency.value = 1318.5;
    g2.gain.setValueAtTime(0.28, now + 0.26);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
    o2.connect(g2); g2.connect(mg);
    o2.start(now + 0.26); o2.stop(now + 0.65);
  }

  /* ══════════════════════════════════════════════════════════
     8. ERROR — short double buzz
  ══════════════════════════════════════════════════════════ */
  function playErrorSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    [0, 0.14].forEach(d => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 160;
      g.gain.setValueAtTime(0.20, now + d);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.17);
      o.connect(g); g.connect(mg);
      o.start(now + d); o.stop(now + d + 0.19);
    });
  }

  /* ══════════════════════════════════════════════════════════
     9. CARD EXPAND — subtle open pop
  ══════════════════════════════════════════════════════════ */
  function playExpandSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    const o   = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, now);
    o.frequency.exponentialRampToValueAtTime(820, now + 0.07);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.connect(g); g.connect(mg);
    o.start(now); o.stop(now + 0.14);
  }

  /* ══════════════════════════════════════════════════════════
     10. CARD COLLAPSE — subtle close pop
  ══════════════════════════════════════════════════════════ */
  function playCollapseSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    const o   = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(820, now);
    o.frequency.exponentialRampToValueAtTime(520, now + 0.07);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    o.connect(g); g.connect(mg);
    o.start(now); o.stop(now + 0.13);
  }

  /* ══════════════════════════════════════════════════════════
     11. PRESET APPLIED — melodic confirmation
  ══════════════════════════════════════════════════════════ */
  function playPresetSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    [[659.25, 0, 0.18], [880, 0.11, 0.22]].forEach(([f, d, dur]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.14, now + d);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + dur);
      o.connect(g); g.connect(mg);
      o.start(now + d); o.stop(now + d + dur + 0.03);
    });
  }

  /* ══════════════════════════════════════════════════════════
     12. SORT — quick 2-note ascending sweep
  ══════════════════════════════════════════════════════════ */
  function playSortSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    [[440, 0], [587, 0.08]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.10, now + d);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.14);
      o.connect(g); g.connect(mg);
      o.start(now + d); o.stop(now + d + 0.16);
    });
  }

  /* ══════════════════════════════════════════════════════════
     13. TOAST NOTIFICATION — brief ping (varies by type)
  ══════════════════════════════════════════════════════════ */
  function playNotifySound(type) {
    if (!_enabled) return;
    if (type === 'error') { playErrorSound(); return; }
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    const freq = type === 'success' ? 880 : type === 'warn' ? 660 : 740;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    o.connect(g); g.connect(mg);
    o.start(now); o.stop(now + 0.2);
  }

  /* ══════════════════════════════════════════════════════════
     14. TOGGLE ON — bright tiny click up
  ══════════════════════════════════════════════════════════ */
  function playToggleOnSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    const o   = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 1100;
    g.gain.setValueAtTime(0.08, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.075);
    o.connect(g); g.connect(mg);
    o.start(now); o.stop(now + 0.08);
  }

  /* ══════════════════════════════════════════════════════════
     15. TOGGLE OFF — muted click down
  ══════════════════════════════════════════════════════════ */
  function playToggleOffSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    const o   = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 660;
    g.gain.setValueAtTime(0.07, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    o.connect(g); g.connect(mg);
    o.start(now); o.stop(now + 0.08);
  }

  /* ══════════════════════════════════════════════════════════
     16. COPY — dual tick
  ══════════════════════════════════════════════════════════ */
  function playCopySound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    [880, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.12, now + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.07 + 0.1);
      o.connect(g); g.connect(mg);
      o.start(now + i * 0.07); o.stop(now + i * 0.07 + 0.12);
    });
  }

  /* ══════════════════════════════════════════════════════════
     17. MERGE AGAIN / RESET — descending triple note
  ══════════════════════════════════════════════════════════ */
  function playMergeAgainSound() {
    if (!_enabled) return;
    const ctx = getCtx(); if (!ctx) return;
    const now = ctx.currentTime;
    const mg  = masterGain(ctx);
    [523.25, 440, 349.23].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.13, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.2);
      o.connect(g); g.connect(mg);
      o.start(now + i * 0.09); o.stop(now + i * 0.09 + 0.22);
    });
  }

  /* ── Export to global namespace ──────────────────────────── */
  global.SOUNDS = {
    isEnabled,
    getVolume,
    setVolume,
    toggle,
    enable,
    disable,
    playFileAddSound,
    playFileRemoveSound,
    playDragStartSound,
    playDragDropSound,
    playMergeStartSound,
    playSuccessChime,
    playDownloadWhoosh,
    playErrorSound,
    playExpandSound,
    playCollapseSound,
    playPresetSound,
    playSortSound,
    playNotifySound,
    playToggleOnSound,
    playToggleOffSound,
    playCopySound,
    playMergeAgainSound,
  };

})(window);
