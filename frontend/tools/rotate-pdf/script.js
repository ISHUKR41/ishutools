/**
 * rotate-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Rotate PDF pages — custom UI enhancements
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '🔄 Rotate PDF'; obs.disconnect(); }
    const pagesRow = document.getElementById('opt-pages');
    if (pagesRow) {
      const customRow = pagesRow.closest('.form-group');
      customRow.insertAdjacentHTML('afterend', `
        <p style="font-size:.8rem;color:var(--txt3);margin-top:4px">
          <i class="fas fa-info-circle" style="color:var(--accent)"></i>
          Tip: Enter page numbers like <code>1,3,5</code> or a range like <code>1-4</code>
        </p>`);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
