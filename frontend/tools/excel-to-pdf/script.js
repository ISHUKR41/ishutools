/**
 * excel-to-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Excel to PDF — multi-sheet hint
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '📊 Convert to PDF'; obs.disconnect(); }
    const dropZone = document.querySelector('.dropzone');
    if (dropZone) {
      const hint = document.createElement('small');
      hint.style.cssText = 'display:block;text-align:center;margin-top:6px;font-size:.78rem;color:var(--txt3);';
      hint.innerHTML = '<i class="fas fa-file-excel" style="color:#16a34a"></i> Supports .xlsx, .xls — all sheets included, tables preserved';
      dropZone.appendChild(hint);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
