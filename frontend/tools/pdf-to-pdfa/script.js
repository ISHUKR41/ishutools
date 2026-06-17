/**
 * pdf-to-pdfa/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * PDF to PDF/A — archival format info
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '📦 Convert to PDF/A'; obs.disconnect(); }
    const levelSel = document.getElementById('opt-pdfa_level');
    if (levelSel) {
      const descs = {
        'pdfa-1b':'PDF/A-1b — Basic ISO 19005-1, widest compatibility',
        'pdfa-2b':'PDF/A-2b — PDF/A-2 basic, includes JPEG2000 (recommended)',
        'pdfa-3b':'PDF/A-3b — Allows embedded files (XML, CSV, etc.)',
      };
      const desc = document.createElement('small');
      desc.style.cssText = 'font-size:.78rem;color:var(--txt3);display:block;margin-top:4px;';
      desc.textContent = descs[levelSel.value] || '';
      levelSel.closest('.form-group').appendChild(desc);
      levelSel.addEventListener('change', () => { desc.textContent = descs[levelSel.value] || ''; });
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
