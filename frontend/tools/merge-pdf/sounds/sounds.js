/**
 * IshuTools.fun — Merge PDF Sound Library
 * Web Audio API synthesized sounds — no external files needed
 * Author: Ishu Kumar (ISHUKR41 / ISHUKR75)
 */
(function () {
  'use strict';

  let _ctx = null;
  let _enabled = true;
  const STORAGE_KEY = 'ishu-sounds-v2';

  try { _enabled = localStorage.getItem(STORAGE_KEY) !== 'false'; } catch (_) {}

  function getCtx() {
    if (!_ctx) {
      try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
    }
    if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
    return _ctx;
  }

  function play(fn) {
    if (!_enabled) return;
    try { const c = getCtx(); if (c) fn(c); } catch (_) {}
  }

  /* ── helpers ── */
  function osc(ctx, freq, type, start, dur, gainPeak, gainEnd, detune = 0) {
    const g = ctx.createGain();
    g.connect(ctx.destination);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    o.connect(g);
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(gainPeak, t + 0.015);
    g.gain.exponentialRampToValueAtTime(gainEnd || 0.001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.01);
  }

  function noise(ctx, start, dur, gain, lpFreq) {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lpFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
    src.connect(lp); lp.connect(g); g.connect(ctx.destination);
    src.start(ctx.currentTime + start);
    src.stop(ctx.currentTime + start + dur + 0.05);
  }

  /* ── individual sounds ── */

  function playFileAddSound()    { play(c => { osc(c,520,'sine',0,.12,.12,.001); osc(c,780,'sine',0.06,.1,.07,.001); }); }
  function playFileRemoveSound() { play(c => { osc(c,360,'sine',0,.18,.1,.001); osc(c,220,'sine',0.06,.15,.07,.001); }); }
  function playDragStartSound()  { play(c => { osc(c,440,'triangle',0,.08,.08,.001); }); }
  function playDragDropSound()   { play(c => { osc(c,600,'sine',0,.07,.1,.001); osc(c,900,'sine',0.04,.07,.06,.001); }); }
  function playMergeStartSound() { play(c => { [440,550,660].forEach((f,i)=>osc(c,f,'sine',i*0.06,.14,.1,.001)); }); }
  function playSuccessChime()    {
    play(c => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => osc(c, f, 'sine', i * 0.09, .45, .15, .001));
      osc(c, 1318, 'sine', 0.38, .5, .12, .001);
    });
  }
  function playErrorSound()      { play(c => { osc(c,220,'sawtooth',0,.25,.12,.001); osc(c,180,'sawtooth',0.1,.2,.1,.001); }); }
  function playNotifySound(type) {
    if (type === 'success') play(c => { osc(c,880,'sine',0,.1,.08,.001); osc(c,1100,'sine',0.06,.08,.06,.001); });
    else if (type === 'error') play(c => osc(c,220,'sawtooth',0,.2,.1,.001));
    else if (type === 'warn') play(c => osc(c,480,'triangle',0,.14,.1,.001));
    else play(c => osc(c,660,'sine',0,.1,.07,.001));
  }
  function playExpandSound()     { play(c => osc(c,700,'sine',0,.08,.06,.001)); }
  function playCollapseSound()   { play(c => osc(c,500,'sine',0,.08,.06,.001)); }
  function playSortSound()       { play(c => { osc(c,600,'triangle',0,.08,.07,.001); osc(c,720,'triangle',0.05,.07,.05,.001); }); }
  function playPresetSound()     { play(c => { [600,800,1000].forEach((f,i)=>osc(c,f,'sine',i*0.04,.12,.09,.001)); }); }
  function playDownloadWhoosh()  {
    play(c => {
      const g = c.createGain();
      g.connect(c.destination);
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(200, c.currentTime);
      o.frequency.exponentialRampToValueAtTime(1200, c.currentTime + 0.35);
      o.connect(g);
      g.gain.setValueAtTime(0.001, c.currentTime);
      g.gain.linearRampToValueAtTime(0.18, c.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.38);
      o.start(c.currentTime); o.stop(c.currentTime + 0.42);
      noise(c, 0, 0.3, 0.04, 600);
    });
  }
  function playCopySound()       { play(c => { osc(c,800,'sine',0,.07,.08,.001); osc(c,1000,'sine',0.04,.06,.06,.001); }); }
  function playMergeAgainSound() { play(c => { osc(c,440,'triangle',0,.12,.08,.001); osc(c,330,'triangle',0.08,.12,.06,.001); }); }
  function playToggleOnSound()   { play(c => osc(c,880,'sine',0,.1,.08,.001)); }
  function playToggleOffSound()  { play(c => osc(c,440,'sine',0,.1,.07,.001)); }

  function toggle() {
    _enabled = !_enabled;
    try { localStorage.setItem(STORAGE_KEY, String(_enabled)); } catch (_) {}
    if (_enabled) getCtx();
    return _enabled;
  }
  function isEnabled() { return _enabled; }

  window.SOUNDS = {
    playFileAddSound, playFileRemoveSound, playDragStartSound, playDragDropSound,
    playMergeStartSound, playSuccessChime, playErrorSound, playNotifySound,
    playExpandSound, playCollapseSound, playSortSound, playPresetSound,
    playDownloadWhoosh, playCopySound, playMergeAgainSound,
    playToggleOnSound, playToggleOffSound,
    toggle, isEnabled,
  };
})();
