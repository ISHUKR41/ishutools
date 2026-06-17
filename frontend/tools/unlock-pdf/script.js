/**
 * unlock-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Unlock PDF — show/hide password field based on mode
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '🔓 Unlock PDF'; obs.disconnect(); }
    const pwField = document.getElementById('opt-password');
    if (pwField) {
      const pwRow = pwField.closest('.form-group');
      const hint = document.createElement('small');
      hint.style.cssText = 'color:var(--txt3);display:block;margin-top:6px;font-size:.78rem;';
      hint.innerHTML = '<i class="fas fa-magic" style="color:var(--accent)"></i> Leave empty — IshuTools will try 500+ common passwords automatically.';
      pwRow?.appendChild(hint);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
