/**
 * crop-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Crop PDF — visual margin preview box
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '✂️ Crop PDF'; obs.disconnect(); }
    const topOpt = document.getElementById('opt-margin_top');
    if (topOpt && !document.getElementById('crop-visual')) {
      const visual = document.createElement('div');
      visual.id = 'crop-visual';
      visual.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;text-align:center;';
      visual.innerHTML = `
        <div style="position:relative;width:80px;height:110px;margin:0 auto;background:white;border:2px solid var(--border);border-radius:4px;">
          <div id="cv-inner" style="position:absolute;background:rgba(99,102,241,.15);border:1.5px dashed #6366f1;border-radius:2px;inset:10px"></div>
        </div>
        <p style="font-size:.75rem;color:var(--txt3);margin-top:8px">Crop preview (proportional)</p>`;
      topOpt.closest('.form-group').parentElement.insertBefore(visual, topOpt.closest('.form-group'));
      function updateCropVisual() {
        const inner = document.getElementById('cv-inner');
        if (!inner) return;
        const t = Math.min(30, parseInt(document.getElementById('opt-margin_top')?.value || 10));
        const b = Math.min(30, parseInt(document.getElementById('opt-margin_bottom')?.value || 10));
        const l = Math.min(30, parseInt(document.getElementById('opt-margin_left')?.value || 10));
        const r = Math.min(30, parseInt(document.getElementById('opt-margin_right')?.value || 10));
        const scale = 0.28;
        inner.style.top = (t * scale) + 'px';
        inner.style.bottom = (b * scale) + 'px';
        inner.style.left = (l * scale) + 'px';
        inner.style.right = (r * scale) + 'px';
      }
      ['opt-margin_top','opt-margin_bottom','opt-margin_left','opt-margin_right'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateCropVisual);
      });
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
