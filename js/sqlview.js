/* =========================================================
 * SQL preview renderer — splits on '-- ═══' section markers,
 * highlights keywords, adds line numbers + copy-per-block
 * ========================================================= */

const SqlView = (() => {

  const KEYWORDS = /\b(CREATE|TABLE|INDEX|SEQUENCE|ALTER|DROP|ADD|MODIFY|COLUMN|INSERT|INTO|VALUES|UPDATE|SET|DELETE|FROM|WHERE|AND|OR|COMMIT|SELECT|CONSTRAINT|PRIMARY|KEY|UNIQUE|NOT|NULL|DEFAULT|COMMENT|ON|IS|CYCLE|NOCYCLE|ORDER|NOORDER|CACHE|MINVALUE|MAXVALUE|START|WITH|INCREMENT|BY|TABLESPACE|INITRANS|PCTFREE|UNIQUE|BITMAP|ASC|DESC|RENAME|TO|NVL|CASE|WHEN|THEN|ELSE|END|JOIN)\b/g;
  const TYPES    = /\b(VARCHAR2|CHAR|NUMBER|DATE|TIMESTAMP|CLOB|BLOB|RAW|FLOAT|BINARY_DOUBLE)\b/g;
  const FUNCS    = /\b(TO_CLOB|SYSTIMESTAMP|NEXTVAL|SEQ_[A-Z_]+)\b/g;

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function highlight(line) {
    // 1. Comments first (lose everything to end of line)
    const cmtIdx = line.indexOf('--');
    let head = line, tail = '';
    if (cmtIdx >= 0) {
      head = line.slice(0, cmtIdx);
      tail = line.slice(cmtIdx);
    }

    // 2. Pull out strings first so we don't highlight keywords inside them
    const strRe = /'(?:[^']|'')*'/g;
    const parts = [];
    let lastIdx = 0, m;
    while ((m = strRe.exec(head)) !== null) {
      parts.push({ t: 'code', v: head.slice(lastIdx, m.index) });
      parts.push({ t: 'str',  v: m[0] });
      lastIdx = m.index + m[0].length;
    }
    parts.push({ t: 'code', v: head.slice(lastIdx) });

    let out = parts.map(p => {
      if (p.t === 'str') return `<span class="tk-str">${escapeHtml(p.v)}</span>`;
      let s = escapeHtml(p.v);
      s = s.replace(TYPES,    '<span class="tk-type">$1</span>');
      s = s.replace(KEYWORDS, '<span class="tk-kw">$1</span>');
      s = s.replace(FUNCS,    '<span class="tk-fn">$1</span>');
      s = s.replace(/\b(\d+)\b/g, '<span class="tk-num">$1</span>');
      return s;
    }).join('');

    if (tail) out += `<span class="tk-cmt">${escapeHtml(tail)}</span>`;
    return out || '&nbsp;';
  }

  function splitIntoBlocks(sql) {
    // Split on section markers produced by Utils.section()
    // Format: \n-- ─────\n-- TITLE\n-- ─────\n
    const lines = sql.split('\n');
    const blocks = [];
    let cur = { title: '초기화', body: [] };
    for (const line of lines) {
      if (/^-- ─+$/.test(line)) {
        // skip — handled by surrounding title
        continue;
      }
      // Title line: starts with `-- ` and the *next* iter is going to be a rule too.
      // Easier: any line that matches `-- TITLE` where TITLE isn't a plain comment.
      // Heuristic: if previous line (in source) was `-- ─` and this line is `-- X`
      // we treat it as new block.
      blocks;
    }
    // Simpler: regex split
    const re = /\n-- ─+\n-- (.+)\n-- ─+\n/g;
    const matches = [];
    let lastIdx = 0;
    let match;
    let headerContent = '';
    const re2 = /(?:^|\n)-- ─+\n-- (.+?)\n-- ─+\n/g;
    let firstMatch = re2.exec(sql);
    if (firstMatch && firstMatch.index > 0) {
      headerContent = sql.slice(0, firstMatch.index).trim();
    } else if (!firstMatch) {
      return [{ title: 'SQL', body: sql }];
    }
    const out = [];
    if (headerContent) out.push({ title: '메모', body: headerContent });

    let cursor = firstMatch.index + firstMatch[0].length;
    let title  = firstMatch[1];
    let next;
    while ((next = re2.exec(sql)) !== null) {
      out.push({ title, body: sql.slice(cursor, next.index).trim() });
      cursor = next.index + next[0].length;
      title  = next[1];
    }
    out.push({ title, body: sql.slice(cursor).trim() });
    return out.filter(b => b.body);
  }

  function renderBlock(block, idx) {
    const lines = block.body.split('\n');
    const linesHtml = lines.map((line, i) =>
      `<div class="ln"><span class="ln-num">${i + 1}</span><span class="ln-text">${highlight(line)}</span></div>`
    ).join('');
    return `
      <div class="sql-block" data-idx="${idx}">
        <div class="sql-block-head" data-toggle-block>
          <svg class="caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>
          <span>${block.title}</span>
          <span class="sq-count">${lines.length} lines</span>
          <button class="sq-copy" data-copy-block="${idx}">복사</button>
        </div>
        <div class="sql-block-body">${linesHtml}</div>
      </div>
    `;
  }

  function render(sql) {
    const scroll = document.getElementById('out-scroll');
    let empty    = document.getElementById('out-empty');
    const meta   = document.getElementById('out-meta');
    const dot    = document.getElementById('out-dot');

    if (!sql || !sql.trim()) {
      scroll.innerHTML = '';
      if (!empty) {
        empty = document.createElement('div');
        empty.id = 'out-empty';
        empty.className = 'output-empty';
        empty.innerHTML = `
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/>
            <path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6"/>
          </svg>
          <div>SQL이 여기 표시됩니다</div>
          <div class="hint">폼을 채운 뒤 <b>⌘↵</b> 또는 <b>SQL 생성</b> 버튼을 누르면<br>DDL · 메타 DML · HIST INSERT가 순서대로 출력됩니다.</div>`;
      }
      scroll.appendChild(empty);
      empty.style.display = 'flex';
      meta.textContent = '—';
      dot.style.background = '#5b6b85';
      return;
    }

    const blocks = splitIntoBlocks(sql);
    scroll.innerHTML = blocks.map(renderBlock).join('');

    // Stats
    const totalLines = sql.split('\n').length;
    const bytes = new Blob([sql]).size;
    meta.textContent = `${blocks.length} blocks · ${totalLines} lines · ${bytes.toLocaleString()}B`;
    dot.style.background = '#22c55e';

    // Per-block toggle + copy
    scroll.querySelectorAll('[data-toggle-block]').forEach(h => {
      h.addEventListener('click', (e) => {
        if (e.target.closest('[data-copy-block]')) return;
        h.parentElement.classList.toggle('collapsed');
      });
    });
    scroll.querySelectorAll('[data-copy-block]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = +btn.dataset.copyBlock;
        const b = blocks[idx];
        navigator.clipboard.writeText(b.body).then(() => Utils.toast(`"${b.title}" 복사됨`));
      });
    });
  }

  let _fullSql = '';
  function setSql(sql) {
    _fullSql = sql || '';
    render(_fullSql);
  }
  function getSql() { return _fullSql; }

  return { setSql, getSql };
})();

// Override Utils.setOutput to funnel through SqlView
const _origSetOutput = Utils.setOutput;
Utils.setOutput = function(_targetId, sql) {
  SqlView.setSql(sql);
};
Utils.copy = function(_targetId) {
  const sql = SqlView.getSql();
  if (!sql) return Utils.toast('복사할 SQL이 없습니다.');
  navigator.clipboard.writeText(sql).then(
    () => Utils.toast('전체 SQL이 복사되었습니다.'),
    () => Utils.toast('복사 실패. 직접 선택해주세요.')
  );
};
