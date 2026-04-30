/* =========================================================
 * App — router, global actions, keyboard shortcuts, tweaks
 * ========================================================= */

const App = (() => {
  let currentTab = 'tbl-tab';

  const TAB_META = {
    'tbl-tab': { title:'테이블 생성·삭제',         sub:'CREATE/DROP TABLE · META DML · HIST',       mod:TableTab },
    'col-tab': { title:'컬럼 추가·변경·삭제',     sub:'ALTER · META DML · HIST',                   mod:ColumnTab },
    'idx-tab': { title:'인덱스 생성·삭제',        sub:'CREATE/DROP INDEX · META DML · HIST',       mod:IndexTab },
    'seq-tab': { title:'시퀀스 생성·변경·삭제',   sub:'CREATE/ALTER/DROP SEQUENCE · META DML · HIST', mod:SequenceTab },
  };

  function activateTab(id) {
    currentTab = id;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.target === id));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === id));
    const meta = TAB_META[id];
    if (meta) {
      document.getElementById('current-title').textContent = meta.title;
      document.getElementById('current-subtitle').textContent = meta.sub;
    }
    onContextChange();
  }

  function currentModule() { return TAB_META[currentTab].mod; }

  function initNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.target));
    });
  }

  function initActions() {
    document.getElementById('act-generate').addEventListener('click', () => currentModule().generate());
    document.getElementById('act-clear').addEventListener('click', () => currentModule().clear());
    document.getElementById('act-copy').addEventListener('click', () => Utils.copy());
    document.getElementById('out-copy-all').addEventListener('click', () => Utils.copy());
    document.getElementById('out-download').addEventListener('click', () => {
      const sql = SqlView.getSql();
      if (!sql) return Utils.toast('저장할 SQL이 없습니다.');
      const blob = new Blob([sql], {type:'text/plain;charset=utf-8'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
      a.download = `meta_${currentTab.replace('-tab','')}_${ts}.sql`;
      document.body.appendChild(a); a.click(); a.remove();
    });

    // SQL fullscreen modal
    const modal = document.getElementById('sql-modal');
    const body  = document.getElementById('sql-modal-body');
    const metaEl= document.getElementById('sql-modal-meta');
    const openModal = () => {
      const sql = SqlView.getSql();
      if (!sql) return Utils.toast('표시할 SQL이 없습니다.');
      // Clone the rendered blocks so syntax highlighting/layout is preserved
      const src = document.getElementById('out-scroll');
      body.innerHTML = '';
      src.querySelectorAll('.output-block').forEach(b => body.appendChild(b.cloneNode(true)));
      metaEl.textContent = document.getElementById('out-meta').textContent;
      modal.classList.add('show');
    };
    const closeModal = () => modal.classList.remove('show');
    document.getElementById('out-expand').addEventListener('click', openModal);
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) closeModal();
      const copyBtn = e.target.closest('#sql-modal-copy');
      if (copyBtn) Utils.copy();
      const dlBtn = e.target.closest('#sql-modal-download');
      if (dlBtn) document.getElementById('out-download').click();
      // rebind copy buttons inside cloned blocks
      const blockCopy = e.target.closest('.output-block .copy-btn');
      if (blockCopy) {
        const code = blockCopy.closest('.output-block').querySelector('pre')?.innerText || '';
        navigator.clipboard?.writeText(code);
        Utils.toast('복사됨');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('show')) closeModal();
    });
  }

  function initShortcuts() {
    window.addEventListener('keydown', (e) => {
      // ⌘/Ctrl + Enter → generate
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        currentModule().generate();
      }
      // Alt + 1..4
      if (e.altKey && ['1','2','3','4'].includes(e.key)) {
        e.preventDefault();
        const map = { '1':'tbl-tab','2':'col-tab','3':'idx-tab','4':'seq-tab' };
        activateTab(map[e.key]);
      }
    });
  }

  function initSidebarToggle() {
    const shell = document.querySelector('.shell');
    const btn = document.getElementById('sidebar-toggle');
    if (!btn || !shell) return;
    const saved = localStorage.getItem('meta.sidebar.collapsed') === '1';
    if (saved) shell.classList.add('sidebar-collapsed');
    btn.addEventListener('click', () => {
      shell.classList.toggle('sidebar-collapsed');
      localStorage.setItem('meta.sidebar.collapsed', shell.classList.contains('sidebar-collapsed') ? '1' : '0');
    });
  }

  function initEmpSync() {
    const el = document.getElementById('global-emp-id');
    const saved = localStorage.getItem('meta.empId') || '';
    el.value = saved;
    updateEmpDot(saved);
    el.addEventListener('input', () => {
      localStorage.setItem('meta.empId', el.value.trim());
      updateEmpDot(el.value.trim());
    });
  }

  function updateEmpDot(v) {
    const dot = document.getElementById('emp-dot');
    dot.classList.toggle('on', !!v);
  }

  function onContextChange() {
    UI.updateLiveStatus(null, '입력 대기');
  }

  // ─── Tweaks ─────────────────────────────────────────
  function initTweaks() {
    const panel = document.getElementById('tweaks-panel');
    const btn = document.getElementById('toggle-tweaks');

    const state = Object.assign({}, TWEAK_DEFAULTS);
    applyTweaks(state);

    btn.addEventListener('click', () => panel.classList.toggle('show'));
    document.getElementById('toggle-theme').addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTweaks(state); syncSegButtons(state);
    });

    panel.querySelectorAll('.seg').forEach(seg => {
      seg.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          const key = seg.dataset.tweak;
          state[key] = b.dataset.val;
          applyTweaks(state); syncSegButtons(state);
          window.parent.postMessage({type:'__edit_mode_set_keys', edits: {[key]: b.dataset.val}}, '*');
        });
      });
    });
    syncSegButtons(state);

    // Tweak mode from host
    window.addEventListener('message', (ev) => {
      const d = ev.data || {};
      if (d.type === '__activate_edit_mode') panel.classList.add('show');
      if (d.type === '__deactivate_edit_mode') panel.classList.remove('show');
    });
    window.parent.postMessage({type: '__edit_mode_available'}, '*');
  }

  function applyTweaks(s) {
    document.documentElement.dataset.theme = s.theme;
    document.documentElement.dataset.density = s.density;
    document.documentElement.dataset.live = s.live;
  }

  function syncSegButtons(s) {
    document.querySelectorAll('.seg').forEach(seg => {
      const key = seg.dataset.tweak;
      seg.querySelectorAll('button').forEach(b => {
        b.classList.toggle('active', b.dataset.val === s[key]);
      });
    });
  }

  // ─── Init ──────────────────────────────────────────
  function init() {
    TableTab.init();
    ColumnTab.init();
    IndexTab.init();
    SequenceTab.init();

    UI.initSubtabs();
    initNav();
    initActions();
    initShortcuts();
    initEmpSync();
    initSidebarToggle();
    initTweaks();
    activateTab('tbl-tab');
  }

  document.addEventListener('DOMContentLoaded', init);

  return { activateTab, onContextChange };
})();

// eof
