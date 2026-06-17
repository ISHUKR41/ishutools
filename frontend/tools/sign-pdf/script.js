/**
 * sign-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Sign PDF — live signature preview
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '✍️ Sign PDF'; obs.disconnect(); }
    const sigText = document.getElementById('opt-signature_text');
    if (sigText && !document.getElementById('sig-preview')) {
      const preview = document.createElement('div');
      preview.id = 'sig-preview';
      preview.style.cssText = 'background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin-bottom:16px;text-align:center;min-height:60px;display:flex;align-items:center;justify-content:center;';
      preview.innerHTML = '<span id="sig-text-preview" style="font-family:Georgia,serif;font-size:1.5rem;color:#003399;font-style:italic;border-bottom:2px solid #003399;padding-bottom:4px;padding-right:8px;">Ishu Kumar</span>';
      sigText.closest('.form-group').parentElement.insertBefore(preview, sigText.closest('.form-group'));
      function updatePreview() {
        const t = sigText.value || 'Your Signature';
        const c = document.getElementById('opt-color')?.value || '#003399';
        const el = document.getElementById('sig-text-preview');
        if (el) { el.textContent = t; el.style.color = c; el.style.borderBottomColor = c; }
      }
      sigText.addEventListener('input', updatePreview);
      document.getElementById('opt-color')?.addEventListener('input', updatePreview);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
