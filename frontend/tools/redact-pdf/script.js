/**
 * redact-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Redact PDF — show term count + preset toggle
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '⬛ Redact PDF'; obs.disconnect(); }
    const termsField = document.getElementById('opt-search_terms');
    if (termsField && !document.getElementById('redact-count')) {
      const counter = document.createElement('small');
      counter.id = 'redact-count';
      counter.style.cssText = 'font-size:.78rem;color:var(--txt3);display:block;margin-top:4px;';
      counter.textContent = 'Enter each term to redact on a new line';
      termsField.closest('.form-group').appendChild(counter);
      termsField.addEventListener('input', () => {
        const terms = termsField.value.split('\n').map(t => t.trim()).filter(Boolean);
        counter.textContent = terms.length > 0 ? `${terms.length} term${terms.length > 1 ? 's' : ''} to redact` : 'Enter each term to redact on a new line';
        counter.style.color = terms.length > 0 ? '#22c55e' : 'var(--txt3)';
      });
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
