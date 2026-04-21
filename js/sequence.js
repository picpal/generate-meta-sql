/* =========================================================
 * 탭 4: 시퀀스 생성 / 변경 / 삭제 (표준 v1.0)
 *   TB_META_SEQUENCE: SEQUENCE_ID / SEQUENCE_NAME / PURPOSE_CD
 *                     USED_FOR_TABLE / USED_FOR_COLUMN / CREATE_DDL
 * ========================================================= */

const SequenceTab = (() => {

  function init() {
    renderCreate();
    renderAlter();
    renderDrop();
    UI.initSectionToggles(document.getElementById('seq-tab'));
  }

  function seqFields(prefix, includeStart) {
    const arr = [
      { label:'스키마명', req:true, name:'schema', id:`${prefix}-schema` },
      { label:'시퀀스명', req:true, name:'seqName', id:`${prefix}-seqName`, hint:'(SEQ_ 자동 보정)' },
      { label:'용도', req:true, type:'select', name:'purposeCd', id:`${prefix}-purposeCd`, code:'SEQUENCE_PURPOSE', includeEmpty:false },
      { label:'주 사용 테이블', name:'usedForTable', id:`${prefix}-usedForTable`, placeholder:'TB_MEMBER' },
      { label:'주 사용 컬럼', name:'usedForColumn', id:`${prefix}-usedForColumn`, placeholder:'MEMBER_ID' },
      { label:'증가치', type:'number', name:'incrementBy', id:`${prefix}-incrementBy`, value:1 },
    ];
    if (includeStart) arr.push({ label:'시작값', type:'number', name:'startWith', id:`${prefix}-startWith`, value:1 });
    arr.push(
      { label:'최소값', type:'number', name:'minValue', id:`${prefix}-minValue` },
      { label:'최대값', type:'number', name:'maxValue', id:`${prefix}-maxValue` },
      { label:'캐시 크기', type:'number', name:'cacheSize', id:`${prefix}-cacheSize`, value:20 },
      { type:'check', name:'cycleYn', id:`${prefix}-cycleYn`, label:'CYCLE' },
      { type:'check', name:'orderYn', id:`${prefix}-orderYn`, label:'ORDER (RAC)' },
    );
    return arr;
  }

  function renderCreate() { UI.renderFields(document.getElementById('seq-create-body'), seqFields('seq-c', true)); }
  function renderAlter()  { UI.renderFields(document.getElementById('seq-alter-body'),  seqFields('seq-a', false)); }
  function renderDrop()   {
    UI.renderFields(document.getElementById('seq-drop-body'), [
      { label:'스키마명', req:true, name:'schema', id:'seq-d-schema' },
      { label:'시퀀스명', req:true, name:'seqName', id:'seq-d-seqName' },
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

  function buildSeqName(raw) { return Utils.ensurePrefix(raw, 'SEQ'); }

  function generate() {
    const active = document.querySelector('#seq-tab .subtab-panel.active').id;
    if (active === 'seq-create') return genCreate();
    if (active === 'seq-alter')  return genAlter();
    if (active === 'seq-drop')   return genDrop();
  }

  function buildDdl(schema, seq, d, isAlter) {
    let ddl = `${isAlter?'ALTER':'CREATE'} SEQUENCE ${schema}.${seq}`;
    if (!isAlter && d.startWith) ddl += `\n  START WITH ${d.startWith}`;
    if (d.incrementBy) ddl += `\n  INCREMENT BY ${d.incrementBy}`;
    if (d.minValue)    ddl += `\n  MINVALUE ${d.minValue}`;
    if (d.maxValue)    ddl += `\n  MAXVALUE ${d.maxValue}`;
    ddl += `\n  ${d.cycleYn ? 'CYCLE' : 'NOCYCLE'}`;
    if (d.cacheSize)   ddl += `\n  CACHE ${d.cacheSize}`;
    ddl += `\n  ${d.orderYn ? 'ORDER' : 'NOORDER'};\n`;
    return ddl;
  }

  function genCreate() {
    const reason = Utils.getReason('change-reason');
    const emp = Utils.getEmpId();
    const d = readField('seq-c', ['schema','seqName','purposeCd','usedForTable','usedForColumn','incrementBy','startWith','minValue','maxValue','cacheSize','cycleYn','orderYn']);
    const errs = [];
    if (!reason) errs.push('상단 변경 사유 필수.');
    if (!d.schema) errs.push('스키마명 필수.');
    if (!d.seqName) errs.push('시퀀스명 필수.');
    if (errs.length) { UI.showValidation(errs); return; }
    UI.clearValidation();

    const schema = d.schema.toUpperCase();
    const seq    = buildSeqName(d.seqName);
    const ddl = buildDdl(schema, seq, d, false);

    const insert = `INSERT INTO TB_META_SEQUENCE (
    SEQUENCE_ID, SCHEMA_NAME, SEQUENCE_NAME,
    MIN_VALUE, MAX_VALUE, INCREMENT_BY, START_WITH, CACHE_SIZE,
    CYCLE_YN, ORDER_YN, PURPOSE_CD,
    USED_FOR_TABLE, USED_FOR_COLUMN, CREATE_DDL,
    STATUS_CD,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
) VALUES (
    SEQ_META_SEQUENCE_ID.NEXTVAL,
    ${Utils.q(schema)}, ${Utils.q(seq)},
    ${Utils.num(d.minValue)}, ${Utils.num(d.maxValue)}, ${Utils.num(d.incrementBy || 1)}, ${Utils.num(d.startWith || 1)}, ${Utils.num(d.cacheSize || 20)},
    ${Utils.yn(d.cycleYn)}, ${Utils.yn(d.orderYn)}, ${Utils.q(d.purposeCd)},
    ${Utils.q(d.usedForTable ? d.usedForTable.toUpperCase() : '')}, ${Utils.q(d.usedForColumn ? d.usedForColumn.toUpperCase() : '')}, ${Utils.q(ddl.trim())},
    'ACTIVE',
    ${Utils.auditCols(emp).insert}
);`;

    const hist = Utils.snapshotHist({
      kind:'SEQUENCE', op:'I', reason, empId:emp,
      whereClause: `SCHEMA_NAME = ${Utils.q(schema)} AND SEQUENCE_NAME = ${Utils.q(seq)}`,
    });

    let out = Utils.section(`시퀀스 생성: ${schema}.${seq}`) + ddl;
    out += Utils.section('메타 INSERT') + insert + '\n';
    out += Utils.section('시퀀스 HIST INSERT (I)') + hist + '\n\nCOMMIT;\n';
    Utils.setOutput('seq-output', out);
    Utils.toast('시퀀스 생성 SQL 생성 완료');
  }

  function genAlter() {
    const reason = Utils.getReason('change-reason');
    const emp = Utils.getEmpId();
    const d = readField('seq-a', ['schema','seqName','purposeCd','usedForTable','usedForColumn','incrementBy','minValue','maxValue','cacheSize','cycleYn','orderYn']);
    const errs = [];
    if (!reason) errs.push('상단 변경 사유 필수.');
    if (!d.schema || !d.seqName) errs.push('스키마/시퀀스명 필수.');
    if (errs.length) { UI.showValidation(errs); return; }
    UI.clearValidation();

    const schema = d.schema.toUpperCase();
    const seq    = buildSeqName(d.seqName);
    const ddl = buildDdl(schema, seq, d, true);

    const sets = [
      d.purposeCd ? `PURPOSE_CD = ${Utils.q(d.purposeCd)}` : null,
      d.usedForTable ? `USED_FOR_TABLE = ${Utils.q(d.usedForTable.toUpperCase())}` : null,
      d.usedForColumn ? `USED_FOR_COLUMN = ${Utils.q(d.usedForColumn.toUpperCase())}` : null,
      `INCREMENT_BY = ${Utils.num(d.incrementBy)}`,
      `MIN_VALUE = ${Utils.num(d.minValue)}`,
      `MAX_VALUE = ${Utils.num(d.maxValue)}`,
      `CACHE_SIZE = ${Utils.num(d.cacheSize)}`,
      `CYCLE_YN = ${Utils.yn(d.cycleYn)}`,
      `ORDER_YN = ${Utils.yn(d.orderYn)}`,
      `CREATE_DDL = ${Utils.q(ddl.trim())}`,
      Utils.auditCols(emp).update,
    ].filter(Boolean).join(',\n       ');

    const update = `UPDATE TB_META_SEQUENCE
   SET ${sets}
 WHERE SCHEMA_NAME = ${Utils.q(schema)}
   AND SEQUENCE_NAME = ${Utils.q(seq)};`;

    const hist = Utils.snapshotHist({
      kind:'SEQUENCE', op:'U', reason, empId:emp,
      whereClause: `SCHEMA_NAME = ${Utils.q(schema)} AND SEQUENCE_NAME = ${Utils.q(seq)}`,
    });

    let out = Utils.section(`시퀀스 변경: ${schema}.${seq}`) + ddl;
    out += Utils.section('메타 UPDATE') + update + '\n';
    out += Utils.section('시퀀스 HIST INSERT (U, 변경 후 스냅샷)') + hist + '\n\nCOMMIT;\n';
    Utils.setOutput('seq-output', out);
    Utils.toast('시퀀스 변경 SQL 생성 완료');
  }

  function genDrop() {
    const reason = Utils.getReason('change-reason');
    const emp = Utils.getEmpId();
    const schema  = (document.getElementById('seq-d-schema').value || '').trim().toUpperCase();
    const seqName = (document.getElementById('seq-d-seqName').value || '').trim();
    const errs = [];
    if (!reason) errs.push('상단 변경 사유 필수.');
    if (!schema || !seqName) errs.push('스키마/시퀀스명 필수.');
    if (errs.length) { UI.showValidation(errs); return; }
    UI.clearValidation();

    const seq = buildSeqName(seqName);
    const whereSeq = `SCHEMA_NAME = ${Utils.q(schema)} AND SEQUENCE_NAME = ${Utils.q(seq)}`;
    const hist = Utils.snapshotHist({ kind:'SEQUENCE', op:'D', reason, empId:emp, whereClause: whereSeq });

    let out = Utils.section(`시퀀스 삭제: ${schema}.${seq}`);
    out += `-- [주의] HARD 삭제: HIST 먼저, 원본 DROP을 나중에.\n`;
    out += Utils.section('1. 시퀀스 HIST INSERT (D, 삭제 전 스냅샷)') + hist + '\n';
    out += Utils.section('2. 메타 DELETE') + `DELETE FROM TB_META_SEQUENCE WHERE ${whereSeq};\n`;
    out += Utils.section('3. 물리 DROP') + `DROP SEQUENCE ${schema}.${seq};\n\nCOMMIT;\n`;

    Utils.setOutput('seq-output', out);
    Utils.toast('시퀀스 삭제 SQL 생성 완료');
  }

  function clear() {
    if (!confirm('입력 내용을 지울까요?')) return;
    renderCreate(); renderAlter(); renderDrop();
    Utils.setOutput('seq-output', '');
    UI.clearValidation();
  }

  return { init, generate, clear };
})();
