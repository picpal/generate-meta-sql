/* =========================================================
 * 탭 2: 컬럼 추가 / 변경 / 삭제 (표준 v1.0)
 * ========================================================= */

const ColumnTab = (() => {

  function init() {
    renderAdd();
    renderModify();
    renderDrop();
    UI.initSectionToggles(document.getElementById('col-tab'));
  }

  /**
   * MODIFY 입력 요소의 사용자 명시적 수정 여부 추적.
   * - 사용자가 한 번이라도 값을 만지면 dataset.touched = '1'.
   * - genModify() SET 절에서 touched 인 경우에만 컬럼을 포함, touched && empty 시 NULL 명시.
   */
  function bindModifyTouchTracking() {
    const root = document.getElementById('col-mod');
    if (!root) return;
    root.querySelectorAll('input, select, textarea').forEach(el => {
      // 다중 호출 시 중복 부착 방지
      if (el.dataset.touchBound === '1') return;
      el.dataset.touchBound = '1';
      const evt = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
      el.addEventListener(evt, () => { el.dataset.touched = '1'; }, { once: true });
    });
  }

  function isTouched(prefix, field) {
    const el = document.getElementById(`${prefix}-${field}`);
    return !!(el && el.dataset.touched === '1');
  }

  function tblPickerFields(prefix) {
    return [
      { label:'스키마명', req:true, name:'schema', id:`${prefix}-schema` },
      { label:'테이블명', req:true, name:'tableName', id:`${prefix}-tableName`, placeholder:'TB_MEMBER' },
    ];
  }

  function colFields(prefix, includeOrder) {
    const arr = [
      { label:'컬럼명', req:true, name:'colName', id:`${prefix}-colName` },
      { label:'논리명', name:'logicalName', id:`${prefix}-logicalName` },
    ];
    if (includeOrder) arr.push({ label:'컬럼 순서', hint:'(생략 시 마지막)', type:'number', name:'columnOrder', id:`${prefix}-columnOrder` });
    arr.push(
      { label:'타입', req:true, type:'select', name:'dataType', id:`${prefix}-dataType`, code:'DATA_TYPE', includeEmpty:false },
      { label:'길이', type:'number', name:'dataLength', id:`${prefix}-dataLength` },
      { label:'정밀도', type:'number', name:'dataPrecision', id:`${prefix}-dataPrecision` },
      { label:'소수 자릿수', type:'number', name:'dataScale', id:`${prefix}-dataScale` },
      { type:'check', name:'nullableYn', id:`${prefix}-nullableYn`, label:'NULL 허용' },
      { label:'기본값', name:'defaultValue', id:`${prefix}-defaultValue` },
      { label:'설명', name:'description', id:`${prefix}-description`, full:true },
      { type:'check', name:'pciYn', id:`${prefix}-pci`, label:'개인신용정보', chip:'pci' },
      { label:'PCI 분류', type:'select', name:'pciCategoryCd', id:`${prefix}-pciCategoryCd`, code:'PCI_CATEGORY' },
      { label:'민감도', type:'select', name:'sensitivityCd', id:`${prefix}-sensitivityCd`, code:'SENSITIVITY', includeEmpty:false },
      { type:'check', name:'encryptionYn', id:`${prefix}-enc`, label:'암호화' },
      { label:'암호화 알고리즘', name:'encryptionAlg', id:`${prefix}-encryptionAlg`, placeholder:'AES256' },
      { type:'check', name:'maskingYn', id:`${prefix}-mask`, label:'마스킹' },
      { label:'마스킹 규칙', type:'select', name:'maskingRuleCd', id:`${prefix}-maskingRuleCd`, code:'MASKING_RULE' },
      { label:'보관주기(예외)', type:'select', name:'retentionPeriodCd', id:`${prefix}-retentionPeriodCd`, code:'RETENTION_PERIOD' },
      { label:'이용약관(예외)', name:'tosCd', id:`${prefix}-tosCd` },
    );
    return arr;
  }

  function renderAdd() {
    UI.renderFields(document.getElementById('col-add-target'), tblPickerFields('col-add'));
    UI.renderFields(document.getElementById('col-add-body'), colFields('col-add', true));
    const sen = document.getElementById('col-add-sensitivityCd');
    if (sen) sen.value = 'LOW';
    const nul = document.getElementById('col-add-nullableYn');
    if (nul) nul.checked = true;
  }

  function renderModify() {
    UI.renderFields(document.getElementById('col-mod-target'), [
      ...tblPickerFields('col-mod'),
      { label:'기존 컬럼명', req:true, name:'colName', id:'col-mod-colName', full:true },
    ]);
    const body = document.getElementById('col-mod-body');
    body.innerHTML = `<div class="info">MODIFY는 타입·길이·NULL·DEFAULT 변경에 사용. 컬럼명 자체 변경은 RENAME(별도 스크립트).</div>`;
    const wrap = document.createElement('div');
    body.appendChild(wrap);
    UI.renderFields(wrap, colFields('col-mod', false));
    const allWithId = document.querySelectorAll('#col-mod [id="col-mod-colName"]');
    if (allWithId.length > 1) allWithId[1].closest('.field').remove();
    bindModifyTouchTracking();
  }

  function renderDrop() {
    document.getElementById('col-drop-body').innerHTML = `
      <div class="grid">
        <div class="field"><label>스키마명 <span class="req">*</span></label><input type="text" id="col-drop-schema"></div>
        <div class="field"><label>테이블명 <span class="req">*</span></label><input type="text" id="col-drop-tableName" placeholder="TB_MEMBER"></div>
        <div class="field"><label>삭제할 컬럼명 <span class="req">*</span></label><input type="text" id="col-drop-colName"></div>
        <div class="field full"><label>삭제 처리 방식</label>
          <select id="col-drop-mode">
            <option value="SOFT">SOFT — STATUS=DEPRECATED, 물리적 유지 (권장)</option>
            <option value="HARD">HARD — ALTER TABLE DROP + 메타 DELETE</option>
          </select>
        </div>
      </div>
    `;
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

  const COL_FIELDS = [
    'colName','logicalName','columnOrder','dataType','dataLength','dataPrecision','dataScale',
    'nullableYn','defaultValue','description',
    'piiYn','pciYn','pciCategoryCd','sensitivityCd',
    'encryptionYn','encryptionAlg','maskingYn','maskingRuleCd',
    'retentionPeriodCd','tosCd',
  ];

  function generate() {
    const active = document.querySelector('#col-tab .subtab-panel.active').id;
    if (active === 'col-add')  return genAdd();
    if (active === 'col-mod')  return genModify();
    if (active === 'col-drop') return genDrop();
  }

  function buildTableIdRef(schema, tbl) {
    return `(SELECT TABLE_ID FROM TB_META_TABLE WHERE SCHEMA_NAME=${Utils.q(schema)} AND TABLE_NAME=${Utils.q(tbl)})`;
  }

  function genAdd() {
    const reason = Utils.getReason('change-reason');
    const emp = Utils.getEmpId();
    const t = readField('col-add', ['schema','tableName']);
    const c = readField('col-add', COL_FIELDS);
    const errs = [];
    if (!reason) errs.push('상단 변경 사유 필수.');
    if (!t.schema) errs.push('스키마명 필수.');
    if (!t.tableName) errs.push('테이블명 필수.');
    if (!c.colName) errs.push('컬럼명 필수.');
    if (errs.length) { UI.showValidation(errs); return; }
    UI.clearValidation();

    const schema = t.schema.toUpperCase();
    const tbl    = Utils.ensurePrefix(t.tableName, 'TB');
    const col    = c.colName.toUpperCase();
    const type   = Utils.typeDDL(c.dataType, c.dataLength, c.dataPrecision, c.dataScale);

    let ddl = `ALTER TABLE ${schema}.${tbl} ADD (${col} ${type}`;
    if (c.defaultValue) ddl += ` DEFAULT ${c.defaultValue}`;
    ddl += c.nullableYn ? '' : ' NOT NULL';
    ddl += ');\n';
    if (c.logicalName) ddl += `COMMENT ON COLUMN ${schema}.${tbl}.${col} IS ${Utils.q(c.logicalName)};\n`;

    const tableIdRef = buildTableIdRef(schema, tbl);
    const orderExpr = c.columnOrder
      ? Utils.num(c.columnOrder)
      : `(SELECT NVL(MAX(COLUMN_ORDER),0)+1 FROM TB_META_COLUMN WHERE TABLE_ID=${tableIdRef})`;

    const insert = `INSERT INTO TB_META_COLUMN (
    COLUMN_ID, TABLE_ID, COLUMN_NAME, COLUMN_ORDER,
    LOGICAL_NAME, DESCRIPTION,
    DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE,
    NULLABLE_YN, DEFAULT_VALUE,
    PK_YN, UK_YN, FK_YN,
    PII_YN, PCI_YN, PCI_CATEGORY_CD, SENSITIVITY_CD,
    ENCRYPTION_YN, ENCRYPTION_ALG, MASKING_YN, MASKING_RULE_CD,
    RETENTION_PERIOD_CD, TOS_CD,
    STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
) VALUES (
    SEQ_META_COLUMN_ID.NEXTVAL,
    ${tableIdRef},
    ${Utils.q(col)}, ${orderExpr},
    ${Utils.q(c.logicalName)}, ${Utils.q(c.description)},
    ${Utils.q(c.dataType)}, ${Utils.num(c.dataLength)}, ${Utils.num(c.dataPrecision)}, ${Utils.num(c.dataScale)},
    ${Utils.yn(c.nullableYn)}, ${Utils.q(c.defaultValue)},
    'N', 'N', 'N',
    ${Utils.yn(c.piiYn)}, ${Utils.yn(c.pciYn)}, ${Utils.q(c.pciCategoryCd)}, ${Utils.q(c.sensitivityCd || 'LOW')},
    ${Utils.yn(c.encryptionYn)}, ${Utils.q(c.encryptionAlg)}, ${Utils.yn(c.maskingYn)}, ${Utils.q(c.maskingRuleCd)},
    ${Utils.q(c.retentionPeriodCd)}, ${Utils.q(c.tosCd)},
    'ACTIVE', NULL,
    ${Utils.auditCols(emp).insert}
);`;

    const hist = Utils.snapshotHist({
      kind:'COLUMN', op:'I', reason, empId:emp,
      whereClause: `TABLE_ID = ${tableIdRef} AND COLUMN_NAME = ${Utils.q(col)}`,
    });

    let out = Utils.section(`컬럼 추가: ${schema}.${tbl}.${col}`) + ddl;
    out += Utils.section('메타 INSERT') + insert + '\n';
    out += Utils.section('컬럼 HIST INSERT (I)') + hist + '\n\nCOMMIT;\n';
    Utils.setOutput('col-output', out);
    Utils.toast('컬럼 추가 SQL 생성 완료');
  }

  function genModify() {
    const reason = Utils.getReason('change-reason');
    const emp = Utils.getEmpId();
    const t = readField('col-mod', ['schema','tableName']);
    const c = readField('col-mod', COL_FIELDS);
    const errs = [];
    if (!reason) errs.push('상단 변경 사유 필수.');
    if (!t.schema || !t.tableName || !c.colName) errs.push('스키마/테이블/컬럼명 모두 필수.');
    if (errs.length) { UI.showValidation(errs); return; }
    UI.clearValidation();

    const schema = t.schema.toUpperCase();
    const tbl    = Utils.ensurePrefix(t.tableName, 'TB');
    const col    = c.colName.toUpperCase();
    const type   = c.dataType ? Utils.typeDDL(c.dataType, c.dataLength, c.dataPrecision, c.dataScale) : null;

    let ddl = `ALTER TABLE ${schema}.${tbl} MODIFY (${col}`;
    if (type) ddl += ` ${type}`;
    if (c.defaultValue) ddl += ` DEFAULT ${c.defaultValue}`;
    ddl += c.nullableYn ? ' NULL' : ' NOT NULL';
    ddl += ');\n';
    if (c.logicalName) ddl += `COMMENT ON COLUMN ${schema}.${tbl}.${col} IS ${Utils.q(c.logicalName)};\n`;

    // touched 인 경우에만 SET 포함. Utils.q('') === 'NULL' 이므로
    // touched && empty 시 'COL = NULL' 이 자연스럽게 출력되어 빈 값으로 비울 수 있음.
    const setIfTouched = (col, field, valExpr) =>
      isTouched('col-mod', field) ? `${col} = ${valExpr}` : null;

    const sets = [
      setIfTouched('LOGICAL_NAME',        'logicalName',       Utils.q(c.logicalName)),
      setIfTouched('DESCRIPTION',         'description',       Utils.q(c.description)),
      setIfTouched('DATA_TYPE',           'dataType',          Utils.q(c.dataType)),
      setIfTouched('DATA_LENGTH',         'dataLength',        Utils.num(c.dataLength)),
      setIfTouched('DATA_PRECISION',      'dataPrecision',     Utils.num(c.dataPrecision)),
      setIfTouched('DATA_SCALE',          'dataScale',         Utils.num(c.dataScale)),
      `NULLABLE_YN = ${Utils.yn(c.nullableYn)}`,
      setIfTouched('DEFAULT_VALUE',       'defaultValue',      Utils.q(c.defaultValue)),
      `PII_YN = ${Utils.yn(c.piiYn)}`,
      `PCI_YN = ${Utils.yn(c.pciYn)}`,
      setIfTouched('PCI_CATEGORY_CD',     'pciCategoryCd',     Utils.q(c.pciCategoryCd)),
      `SENSITIVITY_CD = ${Utils.q(c.sensitivityCd || 'LOW')}`,
      `ENCRYPTION_YN = ${Utils.yn(c.encryptionYn)}`,
      setIfTouched('ENCRYPTION_ALG',      'encryptionAlg',     Utils.q(c.encryptionAlg)),
      `MASKING_YN = ${Utils.yn(c.maskingYn)}`,
      setIfTouched('MASKING_RULE_CD',     'maskingRuleCd',     Utils.q(c.maskingRuleCd)),
      setIfTouched('RETENTION_PERIOD_CD', 'retentionPeriodCd', Utils.q(c.retentionPeriodCd)),
      setIfTouched('TOS_CD',              'tosCd',             Utils.q(c.tosCd)),
      Utils.auditCols(emp).update,
    ].filter(Boolean).join(',\n       ');

    const tableIdRef = buildTableIdRef(schema, tbl);
    const update = `UPDATE TB_META_COLUMN
   SET ${sets}
 WHERE TABLE_ID = ${tableIdRef}
   AND COLUMN_NAME = ${Utils.q(col)};`;

    const hist = Utils.snapshotHist({
      kind:'COLUMN', op:'U', reason, empId:emp,
      whereClause: `TABLE_ID = ${tableIdRef} AND COLUMN_NAME = ${Utils.q(col)}`,
    });

    let out = Utils.section(`컬럼 변경: ${schema}.${tbl}.${col}`) + ddl;
    out += Utils.section('메타 UPDATE') + update + '\n';
    out += Utils.section('컬럼 HIST INSERT (U, 변경 후 스냅샷)') + hist + '\n\nCOMMIT;\n';
    Utils.setOutput('col-output', out);
    Utils.toast('컬럼 변경 SQL 생성 완료');
  }

  function genDrop() {
    const reason = Utils.getReason('change-reason');
    const emp = Utils.getEmpId();
    const schema = (document.getElementById('col-drop-schema').value || '').trim().toUpperCase();
    const tableName = (document.getElementById('col-drop-tableName').value || '').trim();
    const colName = (document.getElementById('col-drop-colName').value || '').trim();
    const mode = document.getElementById('col-drop-mode').value;
    const errs = [];
    if (!reason) errs.push('상단 변경 사유 필수.');
    if (!schema || !tableName || !colName) errs.push('스키마/테이블/컬럼명 모두 필수.');
    if (errs.length) { UI.showValidation(errs); return; }
    UI.clearValidation();

    const tbl = Utils.ensurePrefix(tableName, 'TB');
    const col = colName.toUpperCase();
    const tableIdRef = buildTableIdRef(schema, tbl);
    const whereCol = `TABLE_ID = ${tableIdRef} AND COLUMN_NAME = ${Utils.q(col)}`;

    let out = '';
    if (mode === 'SOFT') {
      out += Utils.section(`컬럼 소프트 삭제(DEPRECATED): ${schema}.${tbl}.${col}`);
      out += `-- 실제 컬럼은 유지하고 메타만 DEPRECATED 처리합니다.\nUPDATE TB_META_COLUMN
   SET STATUS_CD = 'DEPRECATED',
       ${Utils.auditCols(emp).update}
 WHERE ${whereCol};\n`;
      const hist = Utils.snapshotHist({ kind:'COLUMN', op:'U', reason, empId:emp, whereClause: whereCol });
      out += Utils.section('컬럼 HIST INSERT (U, SOFT)') + hist + '\n\nCOMMIT;\n';
    } else {
      out += Utils.section(`컬럼 하드 삭제: ${schema}.${tbl}.${col}`);
      out += `-- [주의] HARD 삭제: HIST를 먼저 남기고 원본을 DROP합니다.\n`;
      const hist = Utils.snapshotHist({ kind:'COLUMN', op:'D', reason, empId:emp, whereClause: whereCol });
      out += Utils.section('1. 컬럼 HIST INSERT (D, 삭제 전 스냅샷)') + hist + '\n';
      out += Utils.section('2. 물리 삭제 + 메타 DELETE') + `ALTER TABLE ${schema}.${tbl} DROP COLUMN ${col};

DELETE FROM TB_META_COLUMN
 WHERE ${whereCol};

COMMIT;
`;
    }
    Utils.setOutput('col-output', out);
    Utils.toast('컬럼 삭제 SQL 생성 완료');
  }

  function clear() {
    if (!confirm('입력 내용을 지울까요?')) return;
    renderAdd(); renderModify(); renderDrop();
    Utils.setOutput('col-output', '');
    UI.clearValidation();
  }

  return { init, generate, clear };
})();
