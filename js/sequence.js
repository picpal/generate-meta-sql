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
  function renderAlter()  {
    const body = document.getElementById('seq-alter-body');
    body.innerHTML = `<div class="info"><b>직접 수정한 옵션만</b> ALTER SEQUENCE·메타 UPDATE에 포함됩니다. 손대지 않은 옵션은 운영 시퀀스의 현재 설정이 그대로 유지되므로, 바꿀 옵션만 입력하세요.</div>`;
    const wrap = document.createElement('div');
    body.appendChild(wrap);
    UI.renderFields(wrap, seqFields('seq-a', false));
    bindAlterTouchTracking();
  }
  function renderDrop()   {
    UI.renderFields(document.getElementById('seq-drop-body'), [
      { label:'스키마명', req:true, name:'schema', id:'seq-d-schema' },
      { label:'시퀀스명', req:true, name:'seqName', id:'seq-d-seqName' },
    ]);
  }

  // ALTER 폼에 touched-tracking 부착: 사용자가 명시적으로 변경한 필드만 SET 하기 위함.
  function bindAlterTouchTracking() {
    const ids = [
      'seq-a-cycleYn', 'seq-a-orderYn',
      'seq-a-incrementBy', 'seq-a-minValue', 'seq-a-maxValue', 'seq-a-cacheSize',
      'seq-a-purposeCd', 'seq-a-usedForTable', 'seq-a-usedForColumn',
    ];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const evt = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(evt, () => { el.dataset.touched = '1'; }, { once: true });
    });
  }
  function isTouched(prefix, field) {
    const el = document.getElementById(`${prefix}-${field}`);
    return !!(el && el.dataset && el.dataset.touched === '1');
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

  /**
   * ALTER SEQUENCE 전용 DDL 빌더.
   * 사용자가 명시적으로 건드린 절만 출력한다. buildDdl()을 재사용하면
   * 미조작 폼 기본값(INCREMENT BY 1 / CACHE 20 / NOCYCLE / NOORDER)까지
   * 함께 나가 운영 시퀀스 설정을 조용히 덮어쓴다.
   */
  function buildAlterDdl(schema, seq, d) {
    const parts = [];
    if (isTouched('seq-a','incrementBy') && d.incrementBy) parts.push(`  INCREMENT BY ${d.incrementBy}`);
    if (isTouched('seq-a','minValue')    && d.minValue)    parts.push(`  MINVALUE ${d.minValue}`);
    if (isTouched('seq-a','maxValue')    && d.maxValue)    parts.push(`  MAXVALUE ${d.maxValue}`);
    if (isTouched('seq-a','cacheSize'))  parts.push(d.cacheSize ? `  CACHE ${d.cacheSize}` : '  NOCACHE');
    if (isTouched('seq-a','cycleYn'))    parts.push(d.cycleYn ? '  CYCLE' : '  NOCYCLE');
    if (isTouched('seq-a','orderYn'))    parts.push(d.orderYn ? '  ORDER' : '  NOORDER');
    if (!parts.length) return '';
    return `ALTER SEQUENCE ${schema}.${seq}\n${parts.join('\n')};\n`;
  }

  function genCreate() {
    const reason = Utils.getReason('change-reason');
    const emp = Utils.getEmpId();
    const d = readField('seq-c', ['schema','seqName','purposeCd','usedForTable','usedForColumn','incrementBy','startWith','minValue','maxValue','cacheSize','cycleYn','orderYn']);
    const errs = [];
    if (!reason) errs.push('상단 변경 사유 필수.');
    Utils.checkName('스키마명', d.schema, errs);
    Utils.checkName('시퀀스명', d.seqName ? buildSeqName(d.seqName) : '', errs);
    Utils.checkName('주 사용 테이블', d.usedForTable, errs, false);
    Utils.checkName('주 사용 컬럼', d.usedForColumn, errs, false);
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
    Utils.checkName('스키마명', d.schema, errs);
    Utils.checkName('시퀀스명', d.seqName ? buildSeqName(d.seqName) : '', errs);
    Utils.checkName('주 사용 테이블', d.usedForTable, errs, false);
    Utils.checkName('주 사용 컬럼', d.usedForColumn, errs, false);
    // 아무 항목도 건드리지 않으면 감사 컬럼만 갱신하는 무의미한 HIST가 쌓인다.
    const ALTER_FIELDS = ['purposeCd','usedForTable','usedForColumn','incrementBy','minValue','maxValue','cacheSize','cycleYn','orderYn'];
    if (!ALTER_FIELDS.some(f => isTouched('seq-a', f))) {
      errs.push('변경할 항목을 하나 이상 수정하세요. 손대지 않은 옵션은 ALTER·UPDATE에 포함되지 않습니다.');
    }
    if (errs.length) { UI.showValidation(errs); return; }
    UI.clearValidation();

    const schema = d.schema.toUpperCase();
    const seq    = buildSeqName(d.seqName);

    // 사용자가 명시적으로 건드린 절만 ALTER에 포함한다.
    const ddl = buildAlterDdl(schema, seq, d);

    // 메타 SET도 touched 기준. truthy 판정으로 두면 폼 기본값
    // (INCREMENT BY 1 / CACHE 20 / PURPOSE_CD 'PK')이 미조작 상태로 UPDATE된다.
    const setIfTouched = (col, field, valExpr) =>
      isTouched('seq-a', field) ? `${col} = ${valExpr}` : null;

    const sets = [
      setIfTouched('PURPOSE_CD',      'purposeCd',      Utils.q(d.purposeCd)),
      setIfTouched('USED_FOR_TABLE',  'usedForTable',   Utils.q(d.usedForTable ? d.usedForTable.toUpperCase() : '')),
      setIfTouched('USED_FOR_COLUMN', 'usedForColumn',  Utils.q(d.usedForColumn ? d.usedForColumn.toUpperCase() : '')),
      setIfTouched('INCREMENT_BY',    'incrementBy',    Utils.num(d.incrementBy)),
      setIfTouched('MIN_VALUE',       'minValue',       Utils.num(d.minValue)),
      setIfTouched('MAX_VALUE',       'maxValue',       Utils.num(d.maxValue)),
      setIfTouched('CACHE_SIZE',      'cacheSize',      Utils.num(d.cacheSize)),
      setIfTouched('CYCLE_YN',        'cycleYn',        Utils.yn(d.cycleYn)),
      setIfTouched('ORDER_YN',        'orderYn',        Utils.yn(d.orderYn)),
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

    let out = Utils.section(`시퀀스 변경: ${schema}.${seq}`);
    // DDL-affecting 옵션이 하나도 touched 아니면 빈 ALTER SEQUENCE 출력 회피.
    if (ddl) {
      out += ddl;
      out += `-- [참고] CREATE_DDL 컬럼은 '생성 DDL 원문'이므로 본 ALTER로 갱신하지 않습니다.\n`
           + `--        정의 원문을 추적한다면 별도로 CREATE_DDL을 최신 정의로 UPDATE 하세요.\n`;
    } else {
      out += `-- (DDL-affecting 옵션 미변경 — ALTER SEQUENCE 생략)\n`;
    }
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
    Utils.checkName('스키마명', schema, errs);
    Utils.checkName('시퀀스명', seqName ? buildSeqName(seqName) : '', errs);
    if (errs.length) { UI.showValidation(errs); return; }
    UI.clearValidation();

    const seq = buildSeqName(seqName);
    const whereSeq = `SCHEMA_NAME = ${Utils.q(schema)} AND SEQUENCE_NAME = ${Utils.q(seq)}`;
    const hist = Utils.snapshotHist({ kind:'SEQUENCE', op:'D', reason, empId:emp, whereClause: whereSeq });

    let out = Utils.section(`시퀀스 삭제: ${schema}.${seq}`);
    out += `-- ═══════════════════════════════════════════════════════════════════
-- [경고] DROP SEQUENCE — implicit commit 주의
-- ───────────────────────────────────────────────────────────────────
-- DROP SEQUENCE 는 DDL이며 implicit commit을 동반합니다. 본 SQL의 어느
-- 단계가 실패해도 이미 commit된 단계는 롤백되지 않습니다.
--
-- 실패 발생 시 다음을 반드시 확인:
--   1) HIST 적재 여부 (TB_META_SEQUENCE_HIST)
--   2) 메타 DELETE 여부 (TB_META_SEQUENCE)
--   3) Oracle 측 실제 시퀀스 잔존 여부
-- 부정합이 발견되면 수동 cleanup으로 일관성 회복하세요.
-- ═══════════════════════════════════════════════════════════════════
`;
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
