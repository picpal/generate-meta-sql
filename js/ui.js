/* =========================================================
 * UI helpers — section toggles, subtabs, validation banner
 * ========================================================= */

const UI = {
  initSectionToggles(root = document) {
    root.querySelectorAll('[data-toggle]').forEach(head => {
      if (head.dataset.bound) return;
      head.dataset.bound = '1';
      head.addEventListener('click', () => {
        head.parentElement.classList.toggle('collapsed');
      });
    });
  },

  initSubtabs() {
    document.querySelectorAll('.tab-panel').forEach(panel => {
      const subtabs = panel.querySelectorAll('.subtab-btn');
      subtabs.forEach(btn => {
        btn.addEventListener('click', () => {
          panel.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
          panel.querySelectorAll('.subtab-panel').forEach(p => p.classList.remove('active'));
          btn.classList.add('active');
          document.getElementById(btn.dataset.target).classList.add('active');
          App.onContextChange();
        });
      });
    });
  },

  showValidation(errors) {
    const el = document.getElementById('validation');
    const body = document.getElementById('validation-body');
    if (!errors || !errors.length) {
      el.classList.remove('show');
      if (body) body.innerHTML = '';
      return;
    }
    body.innerHTML = `<ul>${errors.map(e => `<li>${e}</li>`).join('')}</ul>`;
    el.classList.add('show');
    if (!el.dataset.bound) {
      el.dataset.bound = '1';
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) UI.clearValidation();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && el.classList.contains('show')) UI.clearValidation();
      });
    }
  },

  clearValidation() { UI.showValidation(null); },

  updateLiveStatus(state, msg) {
    const el = document.getElementById('live-status');
    const txt = document.getElementById('live-text');
    el.classList.remove('ok', 'warn');
    if (state) el.classList.add(state);
    txt.textContent = msg;
  },

  /** Render a set of .field items into a container */
  renderFields(container, fields) {
    container.innerHTML = `<div class="grid">${fields.map(f => UI.fieldHtml(f)).join('')}</div>`;
  },

  fieldHtml(f) {
    if (f.type === 'rowbreak') {
      return `<div class="row-break"></div>`;
    }
    const span = f.span ? `span-${f.span}` : (f.full ? 'full' : '');
    const req  = f.req ? `<span class="req">*</span>` : '';
    const hint = f.hint ? `<span class="hint">${f.hint}</span>` : '';
    if (f.type === 'check') {
      const extra = f.chip ? `chip-${f.chip}` : '';
      return `<div class="field ${span}">
        <label aria-hidden="true">&nbsp;</label>
        <label class="field-check ${extra}">
          <input type="checkbox" name="${f.name}" id="${f.id || ''}">
          <span>${f.label}</span>
        </label>
      </div>`;
    }
    let control = '';
    if (f.type === 'select') {
      control = `<select name="${f.name}" id="${f.id || ''}">${Utils.buildOptions(f.code, f.includeEmpty !== false)}</select>`;
    } else if (f.type === 'textarea') {
      control = `<textarea name="${f.name}" id="${f.id || ''}" rows="${f.rows || 2}" placeholder="${f.placeholder || ''}"></textarea>`;
    } else if (f.type === 'number') {
      control = `<input type="number" name="${f.name}" id="${f.id || ''}" placeholder="${f.placeholder || ''}" ${f.value != null ? `value="${f.value}"` : ''}>`;
    } else {
      control = `<input type="text" name="${f.name}" id="${f.id || ''}" placeholder="${f.placeholder || ''}">`;
    }
    return `<div class="field ${span}">
      <label>${f.label} ${req} ${hint}</label>
      ${control}
    </div>`;
  },
};
