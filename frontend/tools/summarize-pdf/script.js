/**
 * summarize-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * AI Summarize PDF — enhanced result rendering
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '🤖 AI Summarize PDF'; obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await origFetch(...args);
    if (typeof args[0] === 'string' && args[0].includes('summarize-pdf') && resp.ok) {
      resp.clone().json().then(data => {
        if (!data.success && !data.summary) return;
        setTimeout(() => {
          const body = document.getElementById('textResultBody');
          if (!body) return;
          const summary = data.summary || data.abstract || '';
          const keywords = (data.keywords || []).slice(0, 8);
          const wordCount = data.word_count || 0;
          let html = '';
          if (summary) html += `<div style="margin-bottom:16px"><h4 style="color:var(--accent);margin-bottom:6px;font-size:.9rem;text-transform:uppercase;letter-spacing:.06em">AI Summary</h4><p style="line-height:1.7;color:var(--txt1)">${summary}</p></div>`;
          if (keywords.length > 0) html += `<div style="margin-bottom:12px"><h4 style="color:var(--accent);margin-bottom:6px;font-size:.9rem;text-transform:uppercase;letter-spacing:.06em">Key Topics</h4><div style="display:flex;flex-wrap:wrap;gap:6px">${keywords.map(k => `<span style="background:rgba(99,102,241,.15);color:var(--accent);padding:3px 10px;border-radius:20px;font-size:.8rem">${k}</span>`).join('')}</div></div>`;
          if (wordCount) html += `<p style="font-size:.8rem;color:var(--txt3);margin-top:8px"><i class="fas fa-file-alt"></i> Document: ${wordCount.toLocaleString()} words</p>`;
          if (html) body.innerHTML = html;
        }, 300);
      }).catch(() => {});
    }
    return resp;
  };
});
