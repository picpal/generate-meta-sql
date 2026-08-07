/* =========================================================
 * 폼 필드 정의 불변식 — DOM id와 필드명이 어긋나면 값이 조용히 무시된다.
 *
 * readField()/isTouched()는 `${prefix}-${name}` 으로 요소를 찾는다.
 * colFields()의 id가 이 규칙에서 벗어나면 해당 입력은 영원히 읽히지 않고,
 * 화면에서 체크해도 SQL에 반영되지 않는다. 실제로 발생했던 결함이다
 * (pciYn/encryptionYn/maskingYn 의 id가 -pci/-enc/-mask 였다).
 *
 * SQL 생성 테스트는 요소를 직접 만들어 주입하므로 이 결함을 잡지 못한다.
 * 그래서 필드 정의 자체를 검사한다.
 * ========================================================= */
const { buildCtx, vm, fs } = require('./harness.js');
const A = require('./assert.js');

const { ctx } = buildCtx({});
ctx.document.querySelector = () => ({ id: 'col-mod' });
vm.runInContext(fs.readFileSync('js/column.js', 'utf8') + '\nthis.CT = ColumnTab;', ctx);
const colFields = ctx.CT._colFields;

console.log('[colFields() id 규칙]');
for (const prefix of ['col-add', 'col-mod']) {
  const fields = colFields(prefix, prefix === 'col-add');
  for (const f of fields) {
    if (!f.name) continue;
    A.eq(`${prefix}: ${f.name} 의 id`, f.id, `${prefix}-${f.name}`);
  }
}

// COL_FIELDS(읽기 목록)에 있는 이름은 모두 colFields(렌더 목록)에 있어야 한다
const rendered = new Set(colFields('col-mod', false).map(f => f.name).filter(Boolean));
console.log('\n[COL_FIELDS ↔ colFields 대응]');
for (const name of ctx.CT._COL_FIELDS) {
  if (name === 'columnOrder') continue;   // 변경 폼에는 의도적으로 없음
  A.true(`COL_FIELDS의 ${name} 가 변경 폼에 렌더됨`, rendered.has(name),
         `colFields('col-mod')에 ${name} 없음 → readField가 항상 undefined를 반환`);
}

A.done('t_field_ids');
