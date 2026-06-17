/**
 * protect-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Protect PDF — password strength indicator
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '🔒 Protect PDF'; obs.disconnect(); }
    const pwField = document.getElementById('opt-user_password');
    if (pwField && !document.getElementById('pw-strength')) {
      const bar = document.createElement('div');
      bar.id = 'pw-strength';
      bar.style.cssText = 'margin-top:6px;height:4px;border-radius:2px;background:var(--border);overflow:hidden;';
      bar.innerHTML = '<div id="pw-fill" style="height:100%;width:0%;border-radius:2px;transition:width .3s,background .3s;background:#22c55e"></div>';
      const label = document.createElement('small');
      label.id = 'pw-label';
      label.style.cssText = 'font-size:.75rem;color:var(--txt3);display:block;margin-top:2px;';
      pwField.closest('.form-group').appendChild(bar);
      pwField.closest('.form-group').appendChild(label);
      pwField.addEventListener('input', () => {
        const v = pwField.value;
        let score = 0;
        if (v.length >= 8) score += 25;
        if (v.length >= 12) score += 15;
        if (/[A-Z]/.test(v)) score += 20;
        if (/[0-9]/.test(v)) score += 20;
        if (/[^A-Za-z0-9]/.test(v)) score += 20;
        const fill = document.getElementById('pw-fill');
        const lbl = document.getElementById('pw-label');
        if (fill) { fill.style.width = score + '%'; fill.style.background = score < 40 ? '#ef4444' : score < 70 ? '#f59e0b' : '#22c55e'; }
        if (lbl) lbl.textContent = score < 40 ? 'Weak password' : score < 70 ? 'Medium password' : 'Strong password ✓';
      });
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
