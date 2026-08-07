/* =========================================================
 * 탭 4 '시퀀스 변경' SQL 생성 검증
 * 폼 기본값(INCREMENT BY 1 / CACHE 20 / PURPOSE_CD 'PK')이
 * 미조작 상태로 운영 시퀀스를 덮어쓰지 않는지 확인한다.
 * ========================================================= */
const { makeEl, buildCtx, vm, fs } = require('./harness.js');
const A = require('./assert.js');

const FIELDS = ['schema','seqName','purposeCd','usedForTable','usedForColumn',
                'incrementBy','minValue','maxValue','cacheSize','cycleYn','orderYn'];
const CHECKS = ['cycleYn','orderYn'];
// 폼 기본값 — seqFields()의 value: 지정과 셀렉트 첫 값
const DEFAULTS = { incrementBy: '1', cacheSize: '20', purposeCd: 'PK' };

function gen(touched, values) {
  const els = {
    'change-reason': makeEl('change-reason', { value: '시퀀스 캐시 상향 튜닝' }),
    'global-emp-id': makeEl('global-emp-id', { value: '1234567' }),
  };
  for (const f of FIELDS) {
    const isChk = CHECKS.includes(f);
    const e = makeEl(`seq-a-${f}`, { type: isChk ? 'checkbox' : 'text',
                                     tagName: f === 'purposeCd' ? 'SELECT' : 'INPUT' });
    if (DEFAULTS[f] !== undefined) e.value = DEFAULTS[f];
    if (values[f] !== undefined) { if (isChk) e.checked = values[f]; else e.value = values[f]; }
    if (touched.includes(f)) e.dataset.touched = '1';
    els[`seq-a-${f}`] = e;
  }
  els['seq-a-schema'].value = 'SVC1';
  els['seq-a-seqName'].value = 'SEQ_MEMBER_ID';

  const { ctx, out } = buildCtx(els);
  ctx.document.querySelector = () => ({ id: 'seq-alter' });
  vm.runInContext(fs.readFileSync('js/sequence.js', 'utf8') + '\nthis.ST = SequenceTab;', ctx);
  ctx.ST.generate();
  return out;
}

console.log('[시퀀스 변경]');

// A. 캐시만 변경 — 다른 절이 따라붙으면 운영 시퀀스 설정이 덮어써진다
{
  const o = gen(['cacheSize'], { cacheSize: '100' });
  A.generated('캐시만 변경 시 생성됨', o);
  A.contains('ALTER에 CACHE 100', o, 'CACHE 100');
  A.lacks('NOCYCLE 이 따라붙지 않음', o, 'NOCYCLE');
  A.lacks('NOORDER 가 따라붙지 않음', o, 'NOORDER');
  A.lacks('INCREMENT BY 가 따라붙지 않음', o, 'INCREMENT BY');
  A.contains('메타에 CACHE_SIZE 반영', o, 'CACHE_SIZE = 100');
  A.lacks('미조작 INCREMENT_BY 미포함', o, 'INCREMENT_BY =');
  A.lacks('미조작 PURPOSE_CD 미포함', o, 'PURPOSE_CD =');
  A.lacks('CREATE_DDL 을 ALTER로 덮어쓰지 않음', o, 'CREATE_DDL =');
}

// B. 미변경 상태는 차단
A.blocked('미변경 상태는 차단', gen([], {}), '하나 이상 수정');

// C. NOT NULL 메타 컬럼을 빈 값으로
A.blocked('증가치를 비우면 차단', gen(['incrementBy'], { incrementBy: '' }), '비울 수 없습니다');
A.blocked('증가치 0은 차단', gen(['incrementBy'], { incrementBy: '0' }), '0일 수 없습니다');

// D. 최소값을 비움 — 물리와 메타가 같은 의미가 되어야 한다
{
  const o = gen(['minValue'], { minValue: '' });
  A.contains('ALTER에 NOMINVALUE', o, 'NOMINVALUE');
  A.contains('메타에 MIN_VALUE = NULL', o, 'MIN_VALUE = NULL');
}

// E. CYCLE 체크
{
  const o = gen(['cycleYn'], { cycleYn: true });
  A.contains('ALTER에 CYCLE', o, '\n  CYCLE');
  A.contains('메타에 CYCLE_YN', o, "CYCLE_YN = 'Y'");
}

// F. 메타 전용 항목만 변경 — ALTER SEQUENCE는 생략되어야 함
{
  const o = gen(['usedForTable'], { usedForTable: 'TB_MEMBER' });
  A.generated('메타 전용 변경 시 생성됨', o);
  A.lacks('ALTER SEQUENCE 문이 없음', o, 'ALTER SEQUENCE SVC1.SEQ_MEMBER_ID');
  A.contains('생략 사유 주석', o, 'DDL-affecting 옵션 미변경');
  A.contains('메타에 USED_FOR_TABLE 반영', o, "USED_FOR_TABLE = 'TB_MEMBER'");
  // 폼 기본값이 truthy 판정으로 새어 나가는 회귀를 여기서 잡는다
  A.lacks('미조작 CACHE_SIZE 미포함',   o, 'CACHE_SIZE =');
  A.lacks('미조작 INCREMENT_BY 미포함', o, 'INCREMENT_BY =');
  A.lacks('미조작 PURPOSE_CD 미포함',   o, 'PURPOSE_CD =');
  A.lacks('미조작 MIN_VALUE 미포함',    o, 'MIN_VALUE =');
  A.lacks('미조작 MAX_VALUE 미포함',    o, 'MAX_VALUE =');
  A.lacks('미조작 CYCLE_YN 미포함',     o, 'CYCLE_YN =');
  A.lacks('미조작 ORDER_YN 미포함',     o, 'ORDER_YN =');
}

A.done('t_seq');
