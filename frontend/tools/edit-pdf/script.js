/**
 * edit-pdf/script.js — IshuTools.fun | Ishu Kumar (ISHUKR41)
 * Edit PDF — toggle action-specific fields
 */
document.addEventListener('DOMContentLoaded', () => {
  const obs = new MutationObserver(() => {
    const btn = document.querySelector('.process-btn .btn-text');
    if (btn) { btn.textContent = '✏️ Edit PDF'; }
    const actionEl = document.getElementById('opt-action');
    if (actionEl) {
      obs.disconnect();
      const textFields = ['opt-text','opt-x','opt-y','opt-fontsize','opt-color','opt-font'];
      const stampFields = ['opt-stamp_type','opt-stamp_text'];
      const highlightFields = ['opt-highlight_text','opt-highlight_color'];
      function toggleActionFields() {
        const action = actionEl.value;
        const allFields = [...textFields, ...stampFields, ...highlightFields];
        allFields.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            const row = el.closest('.form-group');
            if (row) row.style.display = 'none';
          }
        });
        let visibleFields = [];
        if (action === 'add_text') visibleFields = textFields;
        else if (action === 'stamp') visibleFields = stampFields;
        else if (action === 'highlight') visibleFields = highlightFields;
        else visibleFields = textFields;
        visibleFields.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            const row = el.closest('.form-group');
            if (row) row.style.display = '';
          }
        });
      }
      actionEl.addEventListener('change', toggleActionFields);
      toggleActionFields();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
});
