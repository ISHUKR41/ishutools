/**
 * pdf-forms/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * PDF Forms — show field detection hint
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '📝 Fill PDF Form'; obs.disconnect(); }
    const resultCard = document.getElementById('resultCard');
    if (resultCard) {
      const downloadBtn = document.getElementById('downloadBtn');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
          setTimeout(() => {
            const notification = document.createElement('div');
            notification.style.cssText = 'margin-top:8px;font-size:.8rem;color:var(--txt3);text-align:center;';
            notification.innerHTML = '<i class="fas fa-check-circle" style="color:#22c55e"></i> Form fields filled successfully';
            downloadBtn.parentElement.appendChild(notification);
          }, 100);
        });
      }
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
