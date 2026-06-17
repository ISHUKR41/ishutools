/**
 * translate-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Translate PDF — show language name + progress enhancement
 */
document.addEventListener('DOMContentLoaded', () => {
  const LANG_NAMES = {
    'hi':'Hindi','en':'English','es':'Spanish','fr':'French','de':'German',
    'it':'Italian','pt':'Portuguese','ru':'Russian','ja':'Japanese','ko':'Korean',
    'zh-cn':'Chinese (Simplified)','zh-tw':'Chinese (Traditional)','ar':'Arabic',
    'bn':'Bengali','gu':'Gujarati','mr':'Marathi','ta':'Tamil','te':'Telugu',
    'ur':'Urdu','pa':'Punjabi','ml':'Malayalam','kn':'Kannada'
  };
  const obs = new MutationObserver(() => {
    const langSel = document.getElementById('opt-target_lang');
    if (langSel) {
      obs.disconnect();
      function updateBtn() {
        const btn = document.querySelector('.process-btn .btn-text');
        if (btn) btn.textContent = `🌐 Translate to ${LANG_NAMES[langSel.value] || langSel.value}`;
      }
      langSel.addEventListener('change', updateBtn);
      updateBtn();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
