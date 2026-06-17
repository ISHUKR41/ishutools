/**
 * add-watermark/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Add Watermark — live preview of watermark settings
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '💧 Add Watermark'; obs.disconnect(); }
    const textOpt = document.getElementById('opt-text');
    if (textOpt && !document.getElementById('wm-preview')) {
      const previewEl = document.createElement('div');
      previewEl.id = 'wm-preview';
      previewEl.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:20px 24px;text-align:center;min-height:80px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;overflow:hidden;position:relative;';
      previewEl.innerHTML = '<span id="wm-text-preview" style="font-size:2rem;opacity:0.3;font-weight:700;transform:rotate(-35deg);display:inline-block;pointer-events:none;color:#FF0000">WATERMARK</span>';
      textOpt.closest('.form-group').parentElement.insertBefore(previewEl, textOpt.closest('.form-group'));
      function updatePreview() {
        const previewText = document.getElementById('wm-text-preview');
        if (!previewText) return;
        const t = document.getElementById('opt-text')?.value || 'WATERMARK';
        const c = document.getElementById('opt-color')?.value || '#FF0000';
        const op = parseFloat(document.getElementById('opt-opacity')?.value || 0.3);
        const rot = parseInt(document.getElementById('opt-rotation')?.value || -35);
        const sz = Math.min(60, Math.max(12, parseInt(document.getElementById('opt-fontsize')?.value || 36)));
        previewText.textContent = t;
        previewText.style.color = c;
        previewText.style.opacity = op;
        previewText.style.transform = `rotate(${rot}deg)`;
        previewText.style.fontSize = (sz * 0.7) + 'px';
      }
      ['opt-text','opt-color','opt-opacity','opt-rotation','opt-fontsize'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updatePreview);
      });
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
