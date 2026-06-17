/**
 * add-page-numbers/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Add Page Numbers — custom button + position preview
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '🔢 Add Page Numbers'; }
    const posOpt = document.getElementById('opt-position');
    if (posOpt) {
      obs.disconnect();
      posOpt.addEventListener('change', () => {
        const hint = document.getElementById('pos-hint');
        const pos = posOpt.value;
        if (hint) {
          const labels = {
            'bottom-center':'Center bottom — most common',
            'bottom-right':'Bottom right — classic style',
            'bottom-left':'Bottom left',
            'top-center':'Top center — header style',
            'top-right':'Top right',
            'top-left':'Top left'
          };
          hint.textContent = labels[pos] || '';
        }
      });
      const hint = document.createElement('small');
      hint.id = 'pos-hint';
      hint.style.cssText = 'color:var(--txt3);display:block;margin-top:4px;font-size:.78rem';
      hint.textContent = 'Center bottom — most common';
      posOpt.closest('.form-group')?.appendChild(hint);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
