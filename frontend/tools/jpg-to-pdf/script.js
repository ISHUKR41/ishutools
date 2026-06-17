/**
 * jpg-to-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * JPG/Image to PDF — show image count + file size preview
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '🖼️ Convert Images to PDF'; }
    const dropZone = document.querySelector('.dropzone');
    if (dropZone && !document.getElementById('img-count-badge')) {
      obs.disconnect();
      const badge = document.createElement('div');
      badge.id = 'img-count-badge';
      badge.style.cssText = 'display:none;margin-top:8px;text-align:center;font-size:.85rem;color:var(--accent);font-weight:600;';
      dropZone.parentElement.insertBefore(badge, dropZone.nextSibling);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('filesUpdated', (e) => {
    const badge = document.getElementById('img-count-badge');
    if (!badge) return;
    const count = e.detail?.count || 0;
    if (count > 0) {
      badge.style.display = 'block';
      badge.innerHTML = `<i class="fas fa-images"></i> ${count} image${count > 1 ? 's' : ''} selected — will create a ${count}-page PDF`;
    } else {
      badge.style.display = 'none';
    }
  });
});
