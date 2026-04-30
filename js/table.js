/* =========================================================
 * 탭 1: 테이블 신규 생성 (표준 v1.0)
 * ========================================================= */

// View DDL 자동 생성 시 마스킹 컬럼에 적용할 사내 표준 마스킹 함수 매핑.
// 키는 js/codes.js의 MASKING_RULE 코드값과 일치해야 한다.
// 매핑이 없으면 fallback으로 FN_MASK_<CODE>를 사용한다.
const MASK_FN_MAP = {
  'NAME':  'FN_MASK_NAME',
  'RRN':   'FN_MASK_RRN',
  'PHONE': 'FN_MASK_PHONE',
  'CARD':  'FN_MASK_CARD',
  'EMAIL': 'FN_MASK_EMAIL',
  'ADDR':  'FN_MASK_ADDR',
  'FULL':  'FN_MASK_FULL',
};

const TableTab = (() => {
  let colCounter = 0;

  function init() {
    renderBasic();
    renderOwner();
    renderRetention();
    renderView();
    renderColumnEditor();
    renderDelete();
    UI.initSectionToggles(document.getElementById('tbl-tab'));
    addColumnRow();
    updateColCount();
  }

  function renderBasic() {
    UI.renderFields(document.getElementById('tbl-sec-basic'), [
      { label:'스키마명', name:'schema', req:true, placeholder:'SVC_CUST' },
      { label:'테이블명', name:'tableName', req:true, hint:'(TB_ 자동 보정)', placeholder:'MEMBER' },
      { label:'논리명(한글)', name:'logicalName', placeholder:'회원 정보' },
      { label:'테이블 유형', name:'tableType', req:true, type:'select', code:'TABLE_TYPE', includeEmpty:false },
      { label:'설명', name:'description', type:'textarea', full:true, placeholder:'테이블 업무 설명' },
    ]);
  }

  function renderOwner() {
    UI.renderFields(document.getElementById('tbl-sec-owner'), [
      { label:'서비스 코드', name:'serviceCd', req:true, type:'select', code:'SERVICE', includeEmpty:false },
      { type:'check', name:'keyTableYn', id:'tbl-key', label:'키 관련 테이블' },
      { type:'check', name:'isolationYn', id:'tbl-iso', label:'격리 필요' },
      { label:'격리 수준', name:'isolationLevelCd', type:'select', code:'ISOLATION_LEVEL' },
      { type:'check', name:'piiYn', id:'tbl-pii', label:'개인정보 포함' },
      { type:'check', name:'pciYn', id:'tbl-pci', label:'개인신용정보 포함', chip:'pci' },
    ]);
  }

  function renderRetention() {
    UI.renderFields(document.getElementById('tbl-sec-retention'), [
      { label:'보관주기', name:'retentionPeriodCd', req:true, type:'select', code:'RETENTION_PERIOD', includeEmpty:false },
      { label:'보관주기 근거', name:'retentionBasis', placeholder:'신용정보법 제X조' },
      { label:'연계 이용약관', name:'tosCd', placeholder:'PINPay 이용약관 - 개인정보수집' },
    ]);
  }

  function renderView() {
    UI.renderFields(document.getElementById('tbl-sec-view'), [
      { type:'check', name:'viewGenYn', id:'tbl-view', label:'뷰 자동생성 대상 (DDL만, 메타 미적재)' },
      { label:'생성될 뷰명', name:'viewName', hint:'(VW_테이블명)' },
      { label:'테이블스페이스', name:'tablespace', placeholder:'TS_SVC_DATA' },
      { label:'비고', name:'remark', full:true },
    ]);
  }

  function renderColumnEditor() {
    document.getElementById('tbl-col-body').innerHTML = `
      <div class="info">컬럼 순서대로 정렬. PK/UK/FK 체크는 제약조건 DDL에도 반영됩니다.</div>
      <div class="col-editor-wrap">
      <table class="col-editor" id="tbl-col-table">
        <thead><tr>
          <th style="width:34px">#</th>
          <th style="min-width:130px">컬럼명 *</th>
          <th style="min-width:110px">논리명</th>
          <th style="width:100px">타입</th>
          <th style="width:60px">길이</th>
          <th style="width:50px" title="정밀도">PRC</th>
          <th style="width:50px" title="소수 자릿수">SCL</th>
          <th style="width:46px" title="NULL 허용">NUL</th>
          <th style="width:40px" title="PK">PK</th>
          <th style="width:40px" title="UK">UK</th>
          <th style="width:40px" title="FK">FK</th>
          <th style="width:46px" title="개인정보">PII</th>
          <th style="width:46px" title="개인신용정보">PCI</th>
          <th style="min-width:110px">PCI 분류</th>
          <th style="width:46px" title="암호화">ENC</th>
          <th style="width:46px" title="마스킹">MSK</th>
          <th style="min-width:110px">마스킹 규칙</th>
          <th style="min-width:110px">기본값</th>
          <th style="min-width:160px">설명</th>
          <th style="width:36px"></th>
        </tr></thead>
        <tbody></tbody>
      </table>
      </div>
      <div class="btn-row" style="display:flex;gap:8px;margin-top:10px;">
        <button type="button" class="btn btn-sm" id="tbl-add-col">+ 컬럼</button>
        <button type="button" class="btn btn-sm" id="tbl-add-audit">+ 감사 4종 (CREATED/UPDATED × BY/AT)</button>
        <button type="button" class="btn btn-sm" id="tbl-add-pk">+ 기본키 (ID NUMBER PK)</button>
      </div>
    `;
    document.getElementById('tbl-add-col').addEventListener('click', () => addColumnRow());
    document.getElementById('tbl-add-audit').addEventListener('click', () => {
      addColumnRow({ colName: 'CREATED_BY', dataType: 'VARCHAR2', dataLength: 128, nullableYn: false });
      addColumnRow({ colName: 'CREATED_AT', dataType: 'TIMESTAMP', nullableYn: false });
      addColumnRow({ colName: 'UPDATED_BY', dataType: 'VARCHAR2', dataLength: 128, nullableYn: false });
      addColumnRow({ colName: 'UPDATED_AT', dataType: 'TIMESTAMP', nullableYn: false });
    });
    document.getElementById('tbl-add-pk').addEventListener('click', () => {
      addColumnRow({ colName: 'ID', dataType: 'NUMBER', dataPrecision: 19, nullableYn: false, pkYn: true });
    });
  }

  function renderDelete() {
    document.getElementById('tbl-delete-body').innerHTML = `
      <div class="info">표준 §6.8 — HARD 삭제는 자식(INDEX_COLUMN → INDEX → COLUMN) → 부모(TABLE) 순서로 HIST 적재 후 DELETE.</div>
      <div class="grid">
        <div class="field"><label>스키마명 <span class="req">*</span></label><input type="text" id="tbl-d-schema"></div>
        <div class="field"><label>테이블명 <span class="req">*</span></label><input type="text" id="tbl-d-tableName" placeholder="TB_MEMBER"></div>
        <div class="field full"><label>삭제 처리 방식 <span class="req">*</span></label>
          <select id="tbl-d-mode">
            <option value="SOFT">SOFT — STATUS_CD='DEPRECATED' (권장)</option>
            <option value="HARD">HARD — TB_META_TABLE 및 자식 메타 모두 DELETE + DROP TABLE</option>
          </select>
        </div>
      </div>
    `;
  }

  function addColumnRow(preset = {}) {
    colCounter += 1;
    const tbody = document.querySelector('#tbl-col-table tbody');
    const tr = document.createElement('tr');
    tr.dataset.cidx = colCounter;
    tr.innerHTML = `
      <td>${tbody.children.length + 1}</td>
      <td><input type="text" name="colName"    value="${preset.colName || ''}"></td>
      <td><input type="text" name="logicalName"value="${preset.logicalName || ''}"></td>
      <td><select name="dataType">${CODES.DATA_TYPE.map(t => `<option ${t===preset.dataType?'selected':''}>${t}</option>`).join('')}</select></td>
      <td><input type="number" name="dataLength"    value="${preset.dataLength || ''}"></td>
      <td><input type="number" name="dataPrecision" value="${preset.dataPrecision || ''}"></td>
      <td><input type="number" name="dataScale"     value="${preset.dataScale || ''}"></td>
      <td class="flag-cell"><input type="checkbox" name="nullableYn" ${preset.nullableYn!==false?'checked':''}></td>
      <td class="flag-cell"><input type="checkbox" name="pkYn" ${preset.pkYn?'checked':''}></td>
      <td class="flag-cell"><input type="checkbox" name="ukYn"></td>
      <td class="flag-cell"><input type="checkbox" name="fkYn"></td>
      <td class="flag-cell"><input type="checkbox" name="piiYn"></td>
      <td class="flag-cell"><input type="checkbox" name="pciYn"></td>
      <td><select name="pciCategoryCd">${Utils.buildOptions('PCI_CATEGORY', true)}</select></td>
      <td class="flag-cell"><input type="checkbox" name="encryptionYn"></td>
      <td class="flag-cell"><input type="checkbox" name="maskingYn"></td>
      <td><select name="maskingRuleCd">${Utils.buildOptions('MASKING_RULE', true)}</select></td>
      <td><input type="text" name="defaultValue" placeholder="'N' / 0 / SYSDATE" title="Oracle DDL DEFAULT 절에 들어갈 SQL 표현식 그대로. 문자열은 작은따옴표 포함, 숫자는 그대로, 함수는 SYSDATE/SYSTIMESTAMP 등."></td>
      <td><input type="text" name="description"></td>
      <td><button type="button" class="row-del" title="삭제">×</button></td>
    `;
    tbody.appendChild(tr);
    tr.querySelector('.row-del').addEventListener('click', () => { tr.remove(); renumber(); updateColCount(); });
    updateColCount();
  }

  function renumber() {
    document.querySelectorAll('#tbl-col-table tbody tr').forEach((tr, i) => {
      tr.children[0].textContent = i + 1;
    });
  }

  function updateColCount() {
    const n = document.querySelectorAll('#tbl-col-table tbody tr').length;
    const el = document.getElementById('tbl-col-count');
    if (el) el.textContent = `· ${n}개`;
  }

  function collectColumns() {
    const cols = [];
    document.querySelectorAll('#tbl-col-table tbody tr').forEach(tr => {
      const inputs = {};
      tr.querySelectorAll('input, select').forEach(el => {
        if (!el.name) return;
        if (el.type === 'checkbox') inputs[el.name] = el.checked;
        else inputs[el.name] = el.value.trim();
      });
      if (inputs.colName) cols.push(inputs);
    });
    return cols;
  }

  function readMeta() {
    const data = {};
    ['tbl-sec-basic','tbl-sec-owner','tbl-sec-retention','tbl-sec-view'].forEach(id => {
      document.querySelectorAll(`#${id} input, #${id} select, #${id} textarea`).forEach(el => {
        if (!el.name) return;
        if (el.type === 'checkbox') data[el.name] = el.checked;
        else data[el.name] = el.value.trim();
      });
    });
    return data;
  }

  function generate() {
    const activeEl = document.querySelector('#tbl-tab .subtab-panel.active');
    const active = activeEl ? activeEl.id : 'tbl-create';
    if (active === 'tbl-delete') return genDelete();
    return genCreate();
  }

  function genCreate() {
    const meta = readMeta();
    const cols = collectColumns();
    const emp = Utils.getEmpId();
    const reason = Utils.getReason('change-reason');

    const errors = [];
    if (!reason) errors.push('상단 "변경 사유"를 입력하세요.');
    Utils.checkName('스키마명', meta.schema, errors);
    Utils.checkName('테이블명', meta.tableName ? Utils.ensurePrefix(meta.tableName, 'TB') : '', errors);
    if (cols.length === 0) errors.push('컬럼을 1개 이상 추가하세요.');
    cols.forEach((c, i) => {
      Utils.checkName(`${i + 1}번 컬럼명`, c.colName, errors);
      if (c.dataType === 'NUMBER' && c.dataLength) {
        errors.push(`${i+1}번 컬럼(${c.colName||''}): NUMBER 타입에 length 입력은 무시됩니다. precision/scale로 변경하세요.`);
      }
    });
    Utils.checkName('테이블스페이스', meta.tablespace, errors, false);
    if (meta.viewGenYn) Utils.checkName('뷰명', meta.viewName, errors, false);
    if (errors.length) { UI.showValidation(errors); return; }
    UI.clearValidation();

    const schema = meta.schema.toUpperCase();
    const tbl    = Utils.ensurePrefix(meta.tableName, 'TB');
    const warned = tbl !== meta.tableName.toUpperCase();

    const ddlCols = cols.map(c => {
      const type = Utils.typeDDL(c.dataType, c.dataLength, c.dataPrecision, c.dataScale);
      let line = `    ${c.colName.toUpperCase().padEnd(30)} ${type.padEnd(18)}`;
      if (c.defaultValue) line += ` DEFAULT ${c.defaultValue}`;
      line += (c.pkYn ? false : c.nullableYn) ? '' : ' NOT NULL';
      return line;
    }).join(',\n');

    const pkCols = cols.filter(c => c.pkYn).map(c => c.colName.toUpperCase());
    const ukCols = cols.filter(c => c.ukYn).map(c => c.colName.toUpperCase());

    let ddl = `CREATE TABLE ${schema}.${tbl} (\n${ddlCols}`;
    if (pkCols.length) ddl += `,\n    CONSTRAINT PK_${tbl.replace(/^TB_/, '')} PRIMARY KEY (${pkCols.join(', ')})`;
    ukCols.forEach((uk, i) => {
      const seq = String(i + 1).padStart(2, '0');
      ddl += `,\n    CONSTRAINT UK_${tbl.replace(/^TB_/, '')}_${seq} UNIQUE (${uk})`;
    });
    ddl += '\n)';
    if (meta.tablespace) ddl += `\nTABLESPACE ${meta.tablespace.toUpperCase()}`;
    ddl += ';\n';

    if (meta.logicalName) ddl += `COMMENT ON TABLE ${schema}.${tbl} IS ${Utils.q(meta.logicalName)};\n`;
    cols.forEach(c => {
      if (c.logicalName) ddl += `COMMENT ON COLUMN ${schema}.${tbl}.${c.colName.toUpperCase()} IS ${Utils.q(c.logicalName)};\n`;
    });

    // View DDL (if viewGenYn checked)
    let viewDdl = '';
    if (meta.viewGenYn) {
      const vwName = (meta.viewName && meta.viewName.trim())
        ? meta.viewName.trim().toUpperCase()
        : tbl.replace(/^TB_/, 'VW_');

      // 컬럼별 SELECT 표현 빌드: 마스킹 지정된 컬럼은 사내 표준 마스킹 함수로 감싼다.
      // PCI+ENC 컬럼의 복호화 함수 적용은 정책 미정 → 본 PR에서는 그대로 SELECT.
      const viewColExpr = (c) => {
        const col = c.colName.toUpperCase();
        if (c.maskingYn && c.maskingRuleCd) {
          const fn = MASK_FN_MAP[c.maskingRuleCd] || `FN_MASK_${c.maskingRuleCd}`;
          return `    ${fn}(${col}) AS ${col}`;
        }
        return `    ${col}`;
      };

      const viewHeaderComment =
        `-- [참고] 마스킹 함수(FN_MASK_*)는 사내 표준에 정의되어 있어야 합니다.\n` +
        `-- 미정의 시 ORA-00904 'invalid identifier'. 코드값(MASKING_RULE_CD)당 함수 매핑은\n` +
        `-- js/table.js의 MASK_FN_MAP 상수에서 관리합니다.\n`;

      viewDdl = `${viewHeaderComment}CREATE OR REPLACE VIEW ${schema}.${vwName} AS\nSELECT\n${cols.map(viewColExpr).join(',\n')}\nFROM ${schema}.${tbl};\n`;
    }

    // TB_META_TABLE INSERT (spec 순서)
    const tableInsert = `INSERT INTO TB_META_TABLE (
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME, DESCRIPTION,
    TABLE_TYPE_CD, SERVICE_CD, OWNER_EMP_ID, SECONDARY_EMP_ID,
    KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PII_YN, PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
) VALUES (
    SEQ_META_TABLE_ID.NEXTVAL,
    ${Utils.q(schema)}, ${Utils.q(tbl)}, ${Utils.q(meta.logicalName)}, ${Utils.q(meta.description)},
    ${Utils.q(meta.tableType)}, ${Utils.q(meta.serviceCd)}, ${Utils.q(emp)}, NULL,
    ${Utils.yn(meta.keyTableYn)}, ${Utils.yn(meta.isolationYn)}, ${Utils.q(meta.isolationLevelCd)},
    ${Utils.yn(meta.piiYn)}, ${Utils.yn(meta.pciYn)}, ${Utils.q(meta.retentionPeriodCd)}, ${Utils.q(meta.retentionBasis)}, ${Utils.q(meta.tosCd)},
    'ACTIVE', ${Utils.q(meta.remark)},
    ${Utils.auditCols(emp).insert}
);`;

    const tableIdRef = `(SELECT TABLE_ID FROM TB_META_TABLE WHERE SCHEMA_NAME=${Utils.q(schema)} AND TABLE_NAME=${Utils.q(tbl)})`;

    // TB_META_COLUMN INSERT (spec 순서)
    const colInserts = cols.map((c, i) => `INSERT INTO TB_META_COLUMN (
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
    ${Utils.q(c.colName.toUpperCase())}, ${i + 1},
    ${Utils.q(c.logicalName)}, ${Utils.q(c.description)},
    ${Utils.q(c.dataType)}, ${Utils.num(c.dataLength)}, ${Utils.num(c.dataPrecision)}, ${Utils.num(c.dataScale)},
    ${Utils.yn(c.pkYn ? false : c.nullableYn)}, ${Utils.q(c.defaultValue)},
    ${Utils.yn(c.pkYn)}, ${Utils.yn(c.ukYn)}, ${Utils.yn(c.fkYn)},
    ${Utils.yn(c.piiYn)}, ${Utils.yn(c.pciYn)}, ${Utils.q(c.pciCategoryCd)}, 'LOW',
    ${Utils.yn(c.encryptionYn)}, NULL, ${Utils.yn(c.maskingYn)}, ${Utils.q(c.maskingRuleCd)},
    NULL, NULL,
    'ACTIVE', NULL,
    ${Utils.auditCols(emp).insert}
);`).join('\n\n');

    // HIST INSERTs (전체 스냅샷, SELECT FROM 방식)
    const tableHist = Utils.snapshotHist({
      kind:'TABLE', op:'I', reason, empId:emp,
      whereClause: `SCHEMA_NAME=${Utils.q(schema)} AND TABLE_NAME=${Utils.q(tbl)}`,
    });
    const colHist = `INSERT INTO TB_META_COLUMN_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    ${Utils.HIST_COLS.COLUMN.join(',\n    ')}
)
SELECT
    SEQ_META_HIST_ID.NEXTVAL, 'I', SYSTIMESTAMP, ${Utils.q(emp)}, ${Utils.q(reason)},
    ${Utils.HIST_COLS.COLUMN.join(', ')}
FROM TB_META_COLUMN
WHERE TABLE_ID = ${tableIdRef};`;

    let out = '';
    out += `-- ═══════════════════════════════════════════════════════════════════\n`;
    out += `-- [경고] CREATE TABLE — implicit commit 주의\n`;
    out += `-- ───────────────────────────────────────────────────────────────────\n`;
    out += `-- CREATE TABLE 은 Oracle DDL이며 직후 implicit commit을 동반합니다.\n`;
    out += `-- 후속 메타 INSERT(TB_META_TABLE / TB_META_COLUMN / HIST)가 실패해도\n`;
    out += `-- 물리 테이블은 이미 commit되어 남습니다(SAVEPOINT 효과 없음).\n`;
    out += `--\n`;
    out += `-- 실패 발생 시 다음을 반드시 확인:\n`;
    out += `--   1) 물리 테이블 존재 여부 (USER_TABLES)\n`;
    out += `--   2) TB_META_TABLE 적재 여부\n`;
    out += `--   3) TB_META_COLUMN 적재 여부\n`;
    out += `--   4) TB_META_*_HIST 적재 여부\n`;
    out += `-- 부정합이면 DROP TABLE 후 본 SQL 전체를 재실행하거나 수동 cleanup하세요.\n`;
    out += `-- ═══════════════════════════════════════════════════════════════════\n`;
    if (warned) out += `-- [경고] 테이블명이 TB_ prefix로 자동 보정됨: ${meta.tableName.toUpperCase()} → ${tbl}\n`;
    out += Utils.section('1. 테이블 DDL') + ddl;
    if (viewDdl) out += Utils.section('2. 뷰 DDL') + viewDdl;
    const n = viewDdl ? 3 : 2;
    out += Utils.section(`${n}. 테이블 메타 INSERT`) + tableInsert;
    out += Utils.section(`${n+1}. 컬럼 메타 INSERT`) + '\n' + colInserts;
    out += Utils.section(`${n+2}. 테이블 HIST INSERT (I)`) + tableHist;
    out += Utils.section(`${n+3}. 컬럼 HIST INSERT (I)`) + colHist;
    out += '\n\nCOMMIT;\n';

    Utils.setOutput('tbl-output', out);
    Utils.toast(`SQL 생성 완료 · ${cols.length}개 컬럼`);
  }

  function genDelete() {
    const reason = Utils.getReason('change-reason');
    const emp = Utils.getEmpId();
    const schemaRaw    = (document.getElementById('tbl-d-schema').value || '').trim().toUpperCase();
    const tableNameRaw = (document.getElementById('tbl-d-tableName').value || '').trim();
    const mode = document.getElementById('tbl-d-mode').value;

    const errs = [];
    if (!reason) errs.push('상단 "변경 사유"를 입력하세요.');
    if (!schemaRaw) errs.push('스키마명이 필요합니다.');
    if (!tableNameRaw) errs.push('테이블명이 필요합니다.');
    if (mode !== 'SOFT' && mode !== 'HARD') errs.push('삭제 처리 방식이 올바르지 않습니다.');
    if (errs.length) { UI.showValidation(errs); return; }
    UI.clearValidation();

    const schema = schemaRaw;
    const tbl    = Utils.ensurePrefix(tableNameRaw, 'TB');
    const whereTbl   = `SCHEMA_NAME = ${Utils.q(schema)} AND TABLE_NAME = ${Utils.q(tbl)}`;
    const tableIdRef = `(SELECT TABLE_ID FROM TB_META_TABLE WHERE ${whereTbl})`;

    let out = '';
    if (mode === 'SOFT') {
      out += Utils.section(`테이블 소프트 삭제(DEPRECATED): ${schema}.${tbl}`);
      out += `-- 실제 테이블/메타는 유지하고 STATUS_CD만 'DEPRECATED'로 표기합니다.\nUPDATE TB_META_TABLE
   SET STATUS_CD = 'DEPRECATED',
       ${Utils.auditCols(emp).update}
 WHERE ${whereTbl};\n`;
      const hist = Utils.snapshotHist({ kind:'TABLE', op:'U', reason, empId:emp, whereClause: whereTbl });
      out += Utils.section('테이블 HIST INSERT (U, SOFT)') + hist + '\n\nCOMMIT;\n';
      Utils.setOutput('tbl-output', out);
      Utils.toast('테이블 SOFT 삭제 SQL 생성 완료');
      return;
    }

    // HARD — 표준 §6.8 자식→부모 순서
    if (!confirm(`표준 §6.8에 따라 ${schema}.${tbl}의 자식 메타(INDEX_COLUMN/INDEX/COLUMN) 및 본 테이블 메타가 모두 삭제되고 DROP TABLE이 수행됩니다.\n\n계속 진행하시겠습니까?`)) {
      Utils.toast('취소되었습니다.');
      return;
    }

    out += Utils.section(`테이블 하드 삭제(표준 §6.8): ${schema}.${tbl}`);
    out += `-- ═══════════════════════════════════════════════════════════════════
-- [경고] 테이블 HARD 삭제 — implicit commit 주의
-- ───────────────────────────────────────────────────────────────────
-- DROP TABLE 은 DDL이며 implicit commit을 동반합니다. 본 SQL의 어느
-- 단계가 실패해도 이미 commit된 단계는 롤백되지 않습니다(SAVEPOINT
-- 효과 없음). 자식 → 부모 순서가 깨지면 ORA-02292 또는 메타 부정합
-- 위험이 있으므로 다음 순서를 반드시 유지하세요.
--
-- 표준 §6.8 순서:
--   1) INDEX_COLUMN_HIST 적재 → DELETE
--   2) INDEX_HIST 적재 → DELETE
--   3) COLUMN_HIST 적재 → DELETE
--   4) TABLE_HIST 적재 → DELETE
--   5) DROP TABLE (물리)
--
-- 실패 발생 시 다음을 반드시 확인:
--   1) HIST 적재 여부 (TB_META_*_HIST 4종)
--   2) 메타 DELETE 여부 (TB_META_INDEX_COLUMN/INDEX/COLUMN/TABLE)
--   3) Oracle 측 실제 테이블/인덱스 잔존 여부
-- 부정합이 발견되면 수동 cleanup으로 일관성 회복하세요.
-- ═══════════════════════════════════════════════════════════════════
`;

    // 1) INDEX_COLUMN HIST + DELETE — Utils.HIST_COLS에 미정의이므로 §6.8 raw SQL 인라인.
    const indexColCols = ['INDEX_ID','COLUMN_POS','COLUMN_NAME','SORT_ORDER','FUNC_EXPRESSION'];
    const indexColHist = `INSERT INTO TB_META_INDEX_COLUMN_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    ${indexColCols.join(', ')}
)
SELECT
    SEQ_META_HIST_ID.NEXTVAL, 'D', SYSTIMESTAMP, ${Utils.q(emp)}, ${Utils.q(reason)},
    ${indexColCols.map(c => 'mic.' + c).join(', ')}
FROM TB_META_INDEX_COLUMN mic
JOIN TB_META_INDEX mi ON mi.INDEX_ID = mic.INDEX_ID
WHERE mi.TABLE_ID = ${tableIdRef};`;
    out += Utils.section('1-1. 인덱스-컬럼 매핑 HIST INSERT (D)') + indexColHist + '\n';
    out += Utils.section('1-2. 인덱스-컬럼 매핑 DELETE') + `DELETE FROM TB_META_INDEX_COLUMN
 WHERE INDEX_ID IN (SELECT INDEX_ID FROM TB_META_INDEX WHERE TABLE_ID = ${tableIdRef});\n`;

    // 2) INDEX HIST + DELETE
    const indexHist = Utils.snapshotHist({
      kind:'INDEX', op:'D', reason, empId:emp,
      whereClause: `TABLE_ID = ${tableIdRef}`,
    });
    out += Utils.section('2-1. 인덱스 메타 HIST INSERT (D)') + indexHist + '\n';
    out += Utils.section('2-2. 인덱스 메타 DELETE') + `DELETE FROM TB_META_INDEX WHERE TABLE_ID = ${tableIdRef};\n`;

    // 3) COLUMN HIST + DELETE
    const columnHist = Utils.snapshotHist({
      kind:'COLUMN', op:'D', reason, empId:emp,
      whereClause: `TABLE_ID = ${tableIdRef}`,
    });
    out += Utils.section('3-1. 컬럼 메타 HIST INSERT (D)') + columnHist + '\n';
    out += Utils.section('3-2. 컬럼 메타 DELETE') + `DELETE FROM TB_META_COLUMN WHERE TABLE_ID = ${tableIdRef};\n`;

    // 4) TABLE HIST + DELETE
    const tableHist = Utils.snapshotHist({
      kind:'TABLE', op:'D', reason, empId:emp,
      whereClause: whereTbl,
    });
    out += Utils.section('4-1. 테이블 메타 HIST INSERT (D)') + tableHist + '\n';
    out += Utils.section('4-2. 테이블 메타 DELETE') + `DELETE FROM TB_META_TABLE WHERE ${whereTbl};\n`;

    // 5) DROP TABLE
    out += Utils.section('5. 물리 DROP') + `DROP TABLE ${schema}.${tbl};\n\nCOMMIT;\n`;

    Utils.setOutput('tbl-output', out);
    Utils.toast('테이블 HARD 삭제 SQL 생성 완료');
  }

  function clear() {
    if (!confirm('입력 내용을 모두 지울까요?')) return;
    renderBasic(); renderOwner(); renderRetention(); renderView();
    document.querySelector('#tbl-col-table tbody').innerHTML = '';
    colCounter = 0;
    addColumnRow();
    renderDelete();
    Utils.setOutput('tbl-output', '');
    UI.clearValidation();
  }

  return { init, generate, clear };
})();
