/**
 * merge-pdf/script.js
 * Merge PDF — IshuTools.fun
 * Author: Ishu Kumar (ISHUKR41)
 *
 * TOOL_CONFIG is set in index.html.
 * tool-base.js handles all rendering and API calls.
 * This file can add any merge-specific enhancements.
 */

// Drag-to-reorder files (future enhancement placeholder)
document.addEventListener('DOMContentLoaded', () => {
  // tool-base.js already initialized.
  // Add merge-specific UX: show file count hint
  const body = document.body;
  if (!body) return;

  // Update process button text to reflect multi-file nature
  const observer = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn && btn.textContent.includes('Process')) {
      btn.textContent = '🔗 Merge PDFs into One';
      observer.disconnect();
    }
  });
  observer.observe(body, { childList: true, subtree: true });
});
