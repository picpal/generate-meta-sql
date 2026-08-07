/* =========================================================
 * 탭 2 '컬럼 변경' SQL 생성 검증
 *
 * ⚠️ 한계: 이 테스트는 요소를 직접 만들어 주입하므로 실제 렌더링·이벤트
 *    바인딩은 거치지 않는다. 폼 필드 정의(id/name) 자체의 회귀는
 *    tests/t_field_ids.js 가 담당한다. 둘을 함께 실행해야 의미가 있다.
 * ========================================================= */
const { makeEl, buildCtx, vm, fs } = require('./harness.js');
const A = require('./assert.js');

const CHECKS = ['pkYn','ukYn','fkYn','nullableYn','pciYn','encryptionYn','maskingYn'];
const SELECTS = ['dataType','pciCategoryCd','sensitivityCd','maskingRuleCd','retentionPeriodCd','statusCd'];

function gen(touched, values) {
  const els = {
    'change-reason': makeEl('change-reason', { value: '테스트용 변경 사유 기재' }),
    'global-emp-id': makeEl('global-emp-id', { value: '1234567' }),
  };
  const ctxObj = buildCtx(els);
  const all = ctxObj.ctx;
  // colFields의 실제 정의에서 id 목록을 얻어 요소를 만든다 (하드코딩 회피)
  vm.runInContext(fs.readFileSync('js/column.js', 'utf8') + '\nthis.CT = ColumnTab;', all);
  for (const f of all.CT._colFields('col-mod', false)) {
    if (!f.name) continue;
    const isChk = CHECKS.includes(f.name), isSel = SELECTS.includes(f.name);
    const e = makeEl(f.id, { type: isChk ? 'checkbox' : 'text', tagName: isSel ? 'SELECT' : 'INPUT' });
    if (values[f.name] !== undefined) { if (isChk) e.checked = values[f.name]; else e.value = values[f.name]; }
    if (touched.includes(f.name)) e.dataset.touched = '1';
    ctxObj.reg.set(f.id, e);
  }
  for (const [k, v] of Object.entries({ 'col-mod-schema':'SVC1', 'col-mod-tableName':'TB_PAY', 'col-mod-colName':'AMOUNT' })) {
    const e = makeEl(k, {}); e.value = v; ctxObj.reg.set(k, e);
  }
  all.document.querySelector = () => ({ id: 'col-mod' });
  all.CT.generate();
  return ctxObj.out;
}

console.log('[컬럼 변경]');

// A. 길이만 수정 — 타입 미선택이면 차단 (미차단 시 VARCHAR2로 물리 타입이 바뀜)
A.blocked('길이만 수정하면 차단', gen(['dataLength'], { dataLength: '50' }), '타입도 함께 선택');

// B. 타입+길이 — 정상 생성, MODIFY에 선택한 타입이 그대로
{
  const o = gen(['dataLength'], { dataType: 'VARCHAR2', dataLength: '200' });
  A.generated('타입+길이 수정 시 생성됨', o);
  A.contains('MODIFY에 VARCHAR2(200)', o, 'MODIFY (AMOUNT VARCHAR2(200))');
  A.contains('메타에 DATA_TYPE 반영', o, "DATA_TYPE = 'VARCHAR2'");
  A.contains('메타에 DATA_LENGTH 반영', o, 'DATA_LENGTH = 200');
}

// C. PCI 체크만 — 메타만 바뀌고 물리 MODIFY는 나오지 않아야 함
{
  const o = gen(['pciYn'], { pciYn: true });
  A.generated('PCI 체크만으로 생성됨', o);
  A.contains('PCI_YN 이 SET에 포함', o, "PCI_YN = 'Y'");
  A.lacks('ALTER TABLE MODIFY 없음', o, 'ALTER TABLE SVC1.TB_PAY MODIFY');
  A.lacks('건드리지 않은 SENSITIVITY_CD 미포함', o, 'SENSITIVITY_CD =');
  A.lacks('건드리지 않은 NULLABLE_YN 미포함', o, 'NULLABLE_YN =');
  A.lacks('건드리지 않은 ENCRYPTION_YN 미포함', o, 'ENCRYPTION_YN =');
  A.lacks('건드리지 않은 MASKING_YN 미포함', o, 'MASKING_YN =');
  A.contains('HIST 테이블에 적재', o, 'INSERT INTO TB_META_COLUMN_HIST');
  A.contains("HIST_TYPE 이 'U'", o, "\n    'U',");
}

// D. 암호화 체크만 — 체크박스 id 회귀가 있으면 여기서 차단된다
{
  const o = gen(['encryptionYn'], { encryptionYn: true });
  A.generated('암호화 체크만으로 생성됨', o);
  A.contains('ENCRYPTION_YN 이 SET에 포함', o, "ENCRYPTION_YN = 'Y'");
}

// E. 마스킹 체크만
{
  const o = gen(['maskingYn'], { maskingYn: true });
  A.contains('MASKING_YN 이 SET에 포함', o, "MASKING_YN = 'Y'");
}

// F. 아무것도 안 건드림 — 감사 컬럼만 갱신하는 빈 HIST 방지
A.blocked('미변경 상태는 차단', gen([], {}), '하나 이상 수정');

// G. NOT NULL 메타 컬럼을 빈 값으로 — ORA-01407 방지
A.blocked('상태를 비우면 차단', gen(['statusCd'], { statusCd: '' }), '비울 수 없습니다');

// H. 민감도를 명시 선택 — 값 기반이므로 touched 없이도 반영되어야 함
{
  const o = gen([], { sensitivityCd: 'HIGH' });
  A.contains('선택한 민감도가 SET에 포함', o, "SENSITIVITY_CD = 'HIGH'");
}

// I. 제약 블록은 해당 플래그를 건드렸을 때만
{
  const o = gen(['pciYn'], { pciYn: true });
  A.lacks('제약 미조작 시 제약 블록 자체가 없음', o, '제약조건 변경 (PK/UK/FK)');
  const o2 = gen(['pkYn'], { pkYn: true });
  A.contains('PK 조작 시 제약 DDL 생성', o2, 'ADD CONSTRAINT PK_PAY PRIMARY KEY (AMOUNT)');
}

A.done('t_column');
