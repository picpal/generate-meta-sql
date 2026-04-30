/* =========================================================
 * 탭 3: 인덱스 생성 / 삭제 (표준 v1.0)
 *   - TB_META_INDEX + TB_META_INDEX_COLUMN 동시 적재
 *   - HIST는 TB_META_INDEX 기준 전체 스냅샷
 * ========================================================= */

const IndexTab = (() => {

  function init() {
    renderCreate();
    renderDrop();
    UI.initSectionToggles(document.getElementById('idx-tab'));
  }

  function renderCreate() {
    UI.renderFields(document.getElementById('idx-create-body'), [
      { label:'스키마명', req:true, name:'schema', id:'idx-schema' },
      { label:'테이블명', req:true, name:'tableName', id:'idx-tableName', placeholder:'TB_MEMBER' },
      { label:'인덱스명', name:'indexName', id:'idx-indexName', hint:'(비우면 자동생성)' },
      { label:'인덱스 유형', req:true, type:'select', name:'indexTypeCd', id:'idx-indexTypeCd', code:'INDEX_TYPE', includeEmpty:false },
      { label:'생성 목적', req:true, type:'select', name:'purposeCd', id:'idx-purposeCd', code:'INDEX_PURPOSE', includeEmpty:false },
      { label:'컬럼 목록', req:true, full:true, name:'indexColumns', id:'idx-indexColumns', placeholder:'MEMBER_ID, CREATED_AT DESC' , hint:'(쉼표 구분. DESC 지정 가능)'},
      { label:'테이블스페이스', name:'tablespaceName', id:'idx-tablespaceName', placeholder:'TS_SVC_IDX' },
      { label:'INITRANS', type:'number', name:'initrans', id:'idx-initrans' },
      { label:'PCTFREE', type:'number', name:'pctfree', id:'idx-pctfree' },
      { label:'튜닝 이력/생성 사유', type:'textarea', full:true, name:'performanceNote', id:'idx-performanceNote' },
    ]);
  }

  function renderDrop() {
    UI.renderFields(document.getElementById('idx-drop-body'), [
      { label:'스키마명', req:true, name:'schema', id:'idx-drop-schema' },
      { label:'인덱스명', req:true, name:'indexName', id:'idx-drop-indexName' },
      { label:'대상 테이블명', name:'tableName', id:'idx-drop-tableName', hint:'(HIST 참조용)' },
    ]);
  }

  function readField(prefix, fields) {
    const out = {};
    fields.forEach(f => {
      const el = document.getElementById(`${prefix}-${f}`);
      if (!el) return;
      if (el.type === 'checkbox') out[f] = el.checked;
      else out[f] = el.value.trim();
    });
    return out;
  }

  function generate() {
    const active = document.querySelector('#idx-tab .subtab-panel.active').id;
    if (active === 'idx-create') return genCreate();
    if (active === 'idx-drop')   return genDrop();
  }

  /** "COL_NAME ASC" 또는 "COL_NAME DESC" 파싱 */
  function parseIdxColumn(raw) {
    const m = raw.trim().match(/^(\S+)(?:\s+(ASC|DESC))?$/i);
    if (!m) return null;
    return { name: m[1].toUpperCase(), sort: (m[2] || 'ASC').toUpperCase() };
  }

  function genCreate() {
    const reason = Utils.getReason('change-reason');
    const emp = Utils.getEmpId();
    const d = readField('idx', ['schema','tableName','indexName','indexTypeCd','purposeCd','indexColumns','tablespaceName','initrans','pctfree','performanceNote']);
    const errs = [];
    if (!reason) errs.push('상단 변경 사유 필수.');
    Utils.checkName('스키마명', d.schema, errs);
    Utils.checkName('테이블명', d.tableName ? Utils.ensurePrefix(d.tableName, 'TB') : '', errs);
    if (d.indexName) Utils.checkName('인덱스명', d.indexName, errs);
    Utils.checkName('테이블스페이스', d.tablespaceName, errs, false);
    if (!d.indexColumns) errs.push('컬럼 목록 필수.');

    const schema = d.schema ? d.schema.toUpperCase() : '';
    const tbl    = d.tableName ? Utils.ensurePrefix(d.tableName, 'TB') : '';
    let idxName  = d.indexName ? d.indexName.toUpperCase() : null;
    if (!idxName) {
      const prefix = d.indexTypeCd === 'UNIQUE' ? 'UIX' : 'IX';
      idxName = `${prefix}_${tbl.replace(/^TB_/, '')}_01`;
    }
    idxName = Utils.ensurePrefix(idxName, d.indexTypeCd === 'UNIQUE' ? 'UIX' : 'IX');

    const cols = d.indexColumns ? d.indexColumns.split(',').map(s => parseIdxColumn(s)).filter(Boolean) : [];
    cols.forEach((c, i) => Utils.checkName(`인덱스 컬럼 #${i + 1}`, c.name, errs));
    if (errs.length) { UI.showValidation(errs); return; }
    UI.clearValidation();
    const colsExpr = cols.map(c => c.sort === 'DESC' ? `${c.name} DESC` : c.name).join(', ');

    let ddl;
    if (d.indexTypeCd === 'UNIQUE')       ddl = `CREATE UNIQUE INDEX ${schema}.${idxName} ON ${schema}.${tbl} (${colsExpr})`;
    else if (d.indexTypeCd === 'BITMAP')  ddl = `CREATE BITMAP INDEX ${schema}.${idxName} ON ${schema}.${tbl} (${colsExpr})`;
    else                                  ddl = `CREATE INDEX ${schema}.${idxName} ON ${schema}.${tbl} (${colsExpr})`;
    if (d.tablespaceName) ddl += `\nTABLESPACE ${d.tablespaceName.toUpperCase()}`;
    if (d.initrans) ddl += `\nINITRANS ${d.initrans}`;
    if (d.pctfree)  ddl += `\nPCTFREE ${d.pctfree}`;
    ddl += ';\n';

    const tableIdRef = `(SELECT TABLE_ID FROM TB_META_TABLE WHERE SCHEMA_NAME=${Utils.q(schema)} AND TABLE_NAME=${Utils.q(tbl)})`;
    const idxIdRef   = `(SELECT INDEX_ID FROM TB_META_INDEX WHERE TABLE_ID=${tableIdRef} AND INDEX_NAME=${Utils.q(idxName)})`;

    // TB_META_INDEX INSERT (spec 순서)
    const idxInsert = `INSERT INTO TB_META_INDEX (
    INDEX_ID, TABLE_ID, INDEX_NAME, INDEX_TYPE_CD,
    TABLESPACE_NAME, INITRANS, PCTFREE,
    PURPOSE_CD, PERFORMANCE_NOTE, CREATE_DDL,
    STATUS_CD,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
) VALUES (
    SEQ_META_INDEX_ID.NEXTVAL,
    ${tableIdRef},
    ${Utils.q(idxName)}, ${Utils.q(d.indexTypeCd)},
    ${Utils.q(d.tablespaceName ? d.tablespaceName.toUpperCase() : '')}, ${Utils.num(d.initrans)}, ${Utils.num(d.pctfree)},
    ${Utils.q(d.purposeCd)}, ${Utils.q(d.performanceNote)}, ${Utils.q(ddl.trim())},
    'ACTIVE',
    ${Utils.auditCols(emp).insert}
);`;

    // TB_META_INDEX_COLUMN INSERT
    const idxColInserts = cols.map((c, i) => `INSERT INTO TB_META_INDEX_COLUMN (
    INDEX_ID, COLUMN_POS, COLUMN_NAME, SORT_ORDER, FUNC_EXPRESSION
) VALUES (
    ${idxIdRef}, ${i + 1}, ${Utils.q(c.name)}, ${Utils.q(c.sort)}, NULL
);`).join('\n\n');

    const hist = Utils.snapshotHist({
      kind:'INDEX', op:'I', reason, empId:emp,
      whereClause: `TABLE_ID = ${tableIdRef} AND INDEX_NAME = ${Utils.q(idxName)}`,
    });

    let out = Utils.section(`인덱스 생성: ${schema}.${idxName}`) + ddl;
    out += Utils.section('메타 INSERT (TB_META_INDEX)') + idxInsert + '\n';
    out += Utils.section('메타 INSERT (TB_META_INDEX_COLUMN)') + '\n' + idxColInserts + '\n';
    out += Utils.section('인덱스 HIST INSERT (I)') + hist + '\n\nCOMMIT;\n';
    Utils.setOutput('idx-output', out);
    Utils.toast('인덱스 생성 SQL 생성 완료');
  }

  function genDrop() {
    const reason = Utils.getReason('change-reason');
    const emp = Utils.getEmpId();
    const d = readField('idx-drop', ['schema','tableName','indexName']);
    const errs = [];
    if (!reason) errs.push('상단 변경 사유 필수.');
    Utils.checkName('스키마명', d.schema, errs);
    Utils.checkName('인덱스명', d.indexName, errs);
    if (d.tableName) Utils.checkName('테이블명', Utils.ensurePrefix(d.tableName, 'TB'), errs);
    if (errs.length) { UI.showValidation(errs); return; }
    UI.clearValidation();

    const schema  = d.schema.toUpperCase();
    const idxName = d.indexName.toUpperCase();
    const tbl     = d.tableName ? Utils.ensurePrefix(d.tableName, 'TB') : '';

    const tableIdRef = tbl ? `(SELECT TABLE_ID FROM TB_META_TABLE WHERE SCHEMA_NAME=${Utils.q(schema)} AND TABLE_NAME=${Utils.q(tbl)})` : null;
    const whereIdx = tbl
      ? `TABLE_ID = ${tableIdRef} AND INDEX_NAME = ${Utils.q(idxName)}`
      : `INDEX_NAME = ${Utils.q(idxName)}`;

    const hist = Utils.snapshotHist({ kind:'INDEX', op:'D', reason, empId:emp, whereClause: whereIdx });

    let out = Utils.section(`인덱스 삭제: ${schema}.${idxName}`);
    out += `-- [주의] HARD 삭제: HIST 먼저, 원본 DROP을 나중에.\n`;
    out += Utils.section('1. 인덱스 HIST INSERT (D, 삭제 전 스냅샷)') + hist + '\n';
    out += Utils.section('2. 인덱스-컬럼 매핑 DELETE') + `DELETE FROM TB_META_INDEX_COLUMN
 WHERE INDEX_ID IN (SELECT INDEX_ID FROM TB_META_INDEX WHERE ${whereIdx});\n`;
    out += Utils.section('3. 메타 DELETE') + `DELETE FROM TB_META_INDEX WHERE ${whereIdx};\n`;
    out += Utils.section('4. 물리 DROP') + `DROP INDEX ${schema}.${idxName};\n\nCOMMIT;\n`;
    Utils.setOutput('idx-output', out);
    Utils.toast('인덱스 삭제 SQL 생성 완료');
  }

  function clear() {
    if (!confirm('입력 내용을 지울까요?')) return;
    renderCreate(); renderDrop();
    Utils.setOutput('idx-output', '');
    UI.clearValidation();
  }

  return { init, generate, clear };
})();
