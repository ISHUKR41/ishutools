/**
 * pdf-to-jpg/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * PDF to JPG — DPI and format hints
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '🖼️ Convert to Images'; obs.disconnect(); }
    const dpiSel = document.getElementById('opt-dpi');
    if (dpiSel) {
      const hint = document.createElement('small');
      hint.style.cssText = 'font-size:.78rem;color:var(--txt3);display:block;margin-top:4px;';
      const labels = { '72':'72 DPI — web/small','150':'150 DPI — balanced (default)','300':'300 DPI — print quality','600':'600 DPI — ultra HD (large files)' };
      hint.textContent = labels[dpiSel.value] || '';
      dpiSel.closest('.form-group').appendChild(hint);
      dpiSel.addEventListener('change', () => { hint.textContent = labels[dpiSel.value] || ''; });
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
