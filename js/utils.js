/* =========================================================
 * 공통 유틸
 * ========================================================= */

const Utils = {
  /** Oracle 문자열 escape: ' → '' */
  esc(s) {
    if (s === null || s === undefined || s === '') return null;
    return String(s).replace(/'/g, "''");
  },

  /** SQL 값 포맷. null/공백이면 NULL, 아니면 '값' */
  q(s) {
    const v = Utils.esc(s);
    return v === null ? 'NULL' : `'${v}'`;
  },

  /** Y/N 기본값 처리 */
  yn(v, def = 'N') {
    if (v === true) return `'Y'`;
    if (v === false) return `'N'`;
    if (!v) return `'${def}'`;
    return String(v).toUpperCase() === 'Y' ? `'Y'` : `'N'`;
  },

  /** 숫자 값 */
  num(v) {
    if (v === null || v === undefined || v === '') return 'NULL';
    const n = Number(v);
    return isNaN(n) ? 'NULL' : String(n);
  },

  /** prefix 자동 보정. 이미 'PREFIX_' 로 시작하면 그대로. */
  ensurePrefix(name, prefix) {
    if (!name) return name;
    const upper = name.toUpperCase().trim();
    const pre   = prefix.toUpperCase();
    return upper.startsWith(pre + '_') ? upper : (pre + '_' + upper);
  },

  /** 이름 검증. 영문/숫자/_ 만 허용, 30자 이하(Oracle 12c 미만 호환) */
  validateName(name) {
    if (!name) return 'name required';
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return '영문 대문자/숫자/_ 만 허용';
    if (name.length > 128) return '128자 초과';
    return null;
  },

  /** 식별자 검증 → errors 배열에 누적. value가 빈 값이고 required=false면 통과. */
  checkName(label, value, errors, required = true) {
    if (!value) {
      if (required) errors.push(`${label}: 값이 필요합니다.`);
      return;
    }
    const err = Utils.validateName(String(value).toUpperCase());
    if (err) errors.push(`${label}(${value}): ${err}`);
  },

  /** 드롭다운 option 생성 */
  buildOptions(codeGroup, includeEmpty = true) {
    const arr = CODES[codeGroup] || [];
    let html = '';
    if (includeEmpty) html += `<option value="">(선택)</option>`;
    arr.forEach(c => {
      const val = typeof c === 'string' ? c : c.value;
      const name = typeof c === 'string' ? c : `${c.value} — ${c.name}`;
      html += `<option value="${val}">${name}</option>`;
    });
    return html;
  },

  /** Oracle 데이터타입 → 컬럼 DDL 일부 */
  typeDDL(type, length, precision, scale) {
    const t = (type || '').toUpperCase();
    if (t === 'VARCHAR2' || t === 'CHAR' || t === 'RAW') {
      return `${t}(${length || 1})`;
    }
    if (t === 'NUMBER') {
      if (precision && scale !== null && scale !== undefined && scale !== '') {
        return `NUMBER(${precision},${scale})`;
      } else if (precision) {
        return `NUMBER(${precision})`;
      }
      return 'NUMBER';
    }
    // DATE / TIMESTAMP / CLOB / BLOB / FLOAT / BINARY_DOUBLE
    return t;
  },

  /** 폼 값을 일괄 추출 */
  readForm(formEl) {
    const data = {};
    formEl.querySelectorAll('input, select, textarea').forEach(el => {
      if (!el.name) return;
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else data[el.name] = el.value.trim();
    });
    return data;
  },

  /** 결과 SQL 영역에 출력 */
  setOutput(targetId, sql) {
    const el = document.getElementById(targetId);
    if (el) el.value = sql;
  },

  /** 클립보드 복사 */
  copy(targetId) {
    const el = document.getElementById(targetId);
    if (!el) return;
    el.select();
    el.setSelectionRange(0, 99999);
    try {
      document.execCommand('copy');
      Utils.toast('복사되었습니다.');
    } catch (e) {
      Utils.toast('복사 실패. 직접 선택해주세요.');
    }
  },

  /** 토스트 알림 */
  toast(msg) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1800);
  },

  /** 세션 입력자 사번 */
  getEmpId() {
    const el = document.getElementById('global-emp-id');
    return (el && el.value.trim()) || 'UNKNOWN';
  },

  /** 감사 컬럼 공통 SQL 조각 */
  auditCols(empId) {
    const e = empId || Utils.getEmpId();
    return {
      insert: `${Utils.q(e)}, SYSTIMESTAMP, ${Utils.q(e)}, SYSTIMESTAMP`,
      update: `UPDATED_BY = ${Utils.q(e)}, UPDATED_AT = SYSTIMESTAMP`,
    };
  },

  /** SQL 블록 구분선 */
  section(title) {
    return `\n-- ─────────────────────────────────────────────\n-- ${title}\n-- ─────────────────────────────────────────────\n`;
  },

  /** 변경 사유 입력란 id로부터 값 조회. 공백이면 null */
  getReason(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return null;
    const v = el.value.trim();
    return v || null;
  },

  /* ===== HIST INSERT (표준 v1.0: 전체 스냅샷 방식) =====
   *
   * 구조 (공통 헤더 5개):
   *   HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON
   * 이후 원본 테이블 컬럼 전체가 그대로 이어짐.
   *
   * HIST_TYPE: 'I' | 'U' | 'D'
   *
   * 사용법:
   *   Utils.snapshotHist({
   *     kind: 'TABLE'|'COLUMN'|'INDEX'|'SEQUENCE',
   *     op:   'I'|'U'|'D',
   *     reason, empId,
   *     // 방법 A) SELECT ... FROM 원본 (권장 - 실제 스냅샷)
   *     selectFrom: 'TB_META_TABLE', whereClause: 'TABLE_ID = ...',
   *     // 방법 B) 인라인 값 (INSERT 전 시점 등)
   *     valuesMap: { TABLE_ID: '...', SCHEMA_NAME: 'SVC1', ... }
   *   })
   */
  HIST_COLS: {
    TABLE: [
      'TABLE_ID','SCHEMA_NAME','TABLE_NAME','LOGICAL_NAME','DESCRIPTION',
      'TABLE_TYPE_CD','SERVICE_CD','OWNER_EMP_ID','SECONDARY_EMP_ID',
      'KEY_TABLE_YN','ISOLATION_YN','ISOLATION_LEVEL_CD',
      'PII_YN','PCI_YN','RETENTION_PERIOD_CD','RETENTION_BASIS','TOS_CD',
      'STATUS_CD','REMARK',
      'CREATED_BY','CREATED_AT','UPDATED_BY','UPDATED_AT',
    ],
    COLUMN: [
      'COLUMN_ID','TABLE_ID','COLUMN_NAME','COLUMN_ORDER',
      'LOGICAL_NAME','DESCRIPTION',
      'DATA_TYPE','DATA_LENGTH','DATA_PRECISION','DATA_SCALE',
      'NULLABLE_YN','DEFAULT_VALUE',
      'PK_YN','UK_YN','FK_YN',
      'PII_YN','PCI_YN','PCI_CATEGORY_CD','SENSITIVITY_CD',
      'ENCRYPTION_YN','ENCRYPTION_ALG','MASKING_YN','MASKING_RULE_CD',
      'RETENTION_PERIOD_CD','TOS_CD',
      'STATUS_CD','REMARK',
      'CREATED_BY','CREATED_AT','UPDATED_BY','UPDATED_AT',
    ],
    INDEX: [
      'INDEX_ID','TABLE_ID','INDEX_NAME','INDEX_TYPE_CD',
      'TABLESPACE_NAME','INITRANS','PCTFREE',
      'PURPOSE_CD','PERFORMANCE_NOTE','CREATE_DDL',
      'STATUS_CD',
      'CREATED_BY','CREATED_AT','UPDATED_BY','UPDATED_AT',
    ],
    SEQUENCE: [
      'SEQUENCE_ID','SCHEMA_NAME','SEQUENCE_NAME',
      'MIN_VALUE','MAX_VALUE','INCREMENT_BY','START_WITH','CACHE_SIZE',
      'CYCLE_YN','ORDER_YN','PURPOSE_CD',
      'USED_FOR_TABLE','USED_FOR_COLUMN','CREATE_DDL',
      'STATUS_CD',
      'CREATED_BY','CREATED_AT','UPDATED_BY','UPDATED_AT',
    ],
  },

  HIST_META: {
    TABLE:    { tbl: 'TB_META_TABLE_HIST',    src: 'TB_META_TABLE' },
    COLUMN:   { tbl: 'TB_META_COLUMN_HIST',   src: 'TB_META_COLUMN' },
    INDEX:    { tbl: 'TB_META_INDEX_HIST',    src: 'TB_META_INDEX' },
    SEQUENCE: { tbl: 'TB_META_SEQUENCE_HIST', src: 'TB_META_SEQUENCE' },
  },

  snapshotHist({ kind, op, reason, empId, whereClause, valuesMap }) {
    const e = empId || Utils.getEmpId();
    const conf = Utils.HIST_META[kind];
    const cols = Utils.HIST_COLS[kind];
    const header = ['HIST_ID','HIST_TYPE','HIST_AT','HIST_BY','CHANGE_REASON'];
    const headerVals = [
      'SEQ_META_HIST_ID.NEXTVAL',
      Utils.q(op),
      'SYSTIMESTAMP',
      Utils.q(e),
      Utils.q(reason),
    ];

    const colList = [...header, ...cols].join(',\n    ');

    // SELECT ... FROM src (전체 스냅샷)
    if (whereClause) {
      const selectVals = [...headerVals, ...cols].join(',\n    ');
      return `INSERT INTO ${conf.tbl} (
    ${colList}
)
SELECT
    ${selectVals}
FROM ${conf.src}
WHERE ${whereClause};`;
    }

    // VALUES (인라인)
    const vals = cols.map(c => {
      const v = (valuesMap || {})[c];
      if (v === undefined || v === null) return 'NULL';
      // 이미 SQL 조각인 경우 그대로
      if (typeof v === 'string' && (
          v.startsWith('(SELECT') || v.startsWith('SEQ_') ||
          v === 'SYSTIMESTAMP' || v === 'NULL' ||
          /^\d+$/.test(v) || /^'.*'$/.test(v)
      )) return v;
      return Utils.q(v);
    });
    return `INSERT INTO ${conf.tbl} (
    ${colList}
) VALUES (
    ${[...headerVals, ...vals].join(',\n    ')}
);`;
  },
};
