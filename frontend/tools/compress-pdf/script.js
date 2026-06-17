/**
 * compress-pdf/script.js
 * Compress PDF — IshuTools.fun | Author: Ishu Kumar (ISHUKR41)
 * Shows compression stats after processing (original vs compressed size).
 */
document.addEventListener('DOMContentLoaded', () => {
  // Patch result display to show reduction percentage from response headers
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await origFetch(...args);
    if (args[0] === '/api/compress-pdf' && resp.ok) {
      const reduction = resp.headers.get('X-Reduction');
      if (reduction) {
        setTimeout(() => {
          const meta = document.getElementById('resultMeta');
          if (meta) meta.textContent = `Reduced by ${reduction}`;
        }, 500);
      }
    }
    return resp;
  };
});
