/**
 * ai-summarizer/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * AI Summarizer — redirect alias for summarize-pdf
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '🤖 AI Summarize'; obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
