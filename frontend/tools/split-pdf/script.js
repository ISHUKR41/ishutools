/**
 * split-pdf/script.js
 * Split PDF — IshuTools.fun | Author: Ishu Kumar (ISHUKR41)
 * TOOL_CONFIG is in index.html. tool-base.js handles all logic.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Show/hide range & every_n fields based on mode selection
  const observer = new MutationObserver(() => {
    const modeEl = document.getElementById('opt-mode');
    if (!modeEl) return;
    observer.disconnect();
    function toggleFields() {
      const m = modeEl.value;
      const rangesRow = document.getElementById('opt-ranges')?.closest('.form-group');
      const everyRow  = document.getElementById('opt-every_n')?.closest('.form-group');
      if (rangesRow) rangesRow.style.display = (m === 'range') ? '' : 'none';
      if (everyRow)  everyRow.style.display  = (m === 'every_n') ? '' : 'none';
    }
    modeEl.addEventListener('change', toggleFields);
    toggleFields();
  });
  observer.observe(document.body, { childList: true, subtree: true });
});
