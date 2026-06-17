/**
 * ocr-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * OCR PDF — language selection with names, progress message
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '🔍 Run OCR on PDF'; obs.disconnect(); }
    const langSel = document.getElementById('opt-lang');
    if (langSel) {
      const hint = document.createElement('small');
      hint.style.cssText = 'font-size:.78rem;color:var(--txt3);display:block;margin-top:4px;';
      hint.innerHTML = '<i class="fas fa-clock" style="color:var(--accent)"></i> OCR may take 30–120 seconds for large scanned PDFs. Please wait.';
      langSel.closest('.form-group').appendChild(hint);
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
