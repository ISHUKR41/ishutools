/**
 * pdf-to-excel/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * PDF to Excel — table detection hint
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '📊 Extract to Excel'; obs.disconnect(); }
    const dropZone = document.querySelector('.dropzone');
    if (dropZone) {
      const hint = document.createElement('small');
      hint.style.cssText = 'display:block;text-align:center;margin-top:6px;font-size:.78rem;color:var(--txt3);';
      hint.innerHTML = '<i class="fas fa-table" style="color:#16a34a"></i> Auto-detects tables and data — outputs .xlsx with preserved structure';
      dropZone.appendChild(hint);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
