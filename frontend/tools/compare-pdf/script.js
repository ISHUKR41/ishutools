/**
 * compare-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Compare PDF — enhance result display with stats
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '🔍 Compare PDFs'; obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await origFetch(...args);
    if (typeof args[0] === 'string' && args[0].includes('compare-pdf') && resp.ok) {
      resp.clone().json().then(data => {
        if (!data.success) return;
        setTimeout(() => {
          const body = document.getElementById('textResultBody');
          if (body && data.differences !== undefined) {
            const diffCount = (data.differences || []).length;
            const banner = document.createElement('div');
            banner.style.cssText = 'padding:12px 16px;border-radius:8px;margin-bottom:12px;font-weight:600;' +
              (diffCount === 0 ? 'background:rgba(34,197,94,.1);color:#22c55e;border:1px solid rgba(34,197,94,.3)' :
               'background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.3)');
            banner.innerHTML = diffCount === 0 ?
              '<i class="fas fa-check-circle"></i> PDFs are identical — no differences found' :
              `<i class="fas fa-exclamation-triangle"></i> Found ${diffCount} difference${diffCount > 1 ? 's' : ''} between the PDFs`;
            body.insertBefore(banner, body.firstChild);
          }
        }, 300);
      }).catch(() => {});
    }
    return resp;
  };
});
