/**
 * html-to-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * HTML to PDF — toggle URL vs file upload mode
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '🌐 Convert to PDF'; obs.disconnect(); }
    const urlInput = document.getElementById('url-input');
    if (urlInput) {
      urlInput.addEventListener('input', () => {
        const dropZone = document.querySelector('.dropzone');
        if (dropZone) {
          if (urlInput.value.trim()) {
            dropZone.style.opacity = '0.4';
            dropZone.style.pointerEvents = 'none';
            const urlHint = document.getElementById('url-mode-hint');
            if (!urlHint) {
              const h = document.createElement('small');
              h.id = 'url-mode-hint';
              h.style.cssText = 'color:var(--accent);display:block;margin-top:4px;font-size:.8rem;';
              h.innerHTML = '<i class="fas fa-check"></i> URL mode active — file upload disabled';
              urlInput.parentElement.appendChild(h);
            }
          } else {
            if (dropZone) { dropZone.style.opacity = ''; dropZone.style.pointerEvents = ''; }
            document.getElementById('url-mode-hint')?.remove();
          }
        }
      });
      obs.disconnect();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
