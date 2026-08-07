/* 최소 단언 유틸 — 실패 시 프로세스를 0이 아닌 코드로 종료한다. */
let pass = 0, fail = 0;
const fails = [];

function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; fails.push(`${name}${detail ? '\n         → ' + detail : ''}`); console.log(`  FAIL  ${name}`); }
}

const A = {
  /** 생성이 차단되고, 메시지에 expect 문구가 포함되어야 한다 */
  blocked(name, out, expect) {
    if (!out.errors) return check(name, false, `차단되지 않고 SQL이 생성됨`);
    const joined = out.errors.join(' | ');
    check(name, joined.includes(expect), `기대 문구 "${expect}" 없음. 실제: ${joined}`);
  },
  /** SQL이 생성되어야 한다 */
  generated(name, out) {
    check(name, !out.errors && !!out.sql,
          out.errors ? `차단됨: ${out.errors.join(' | ')}` : 'SQL이 비어 있음');
  },
  /** SQL에 문자열이 포함되어야 한다 */
  contains(name, out, needle) {
    if (out.errors) return check(name, false, `차단됨: ${out.errors.join(' | ')}`);
    check(name, (out.sql || '').includes(needle), `"${needle}" 없음`);
  },
  /** SQL에 문자열이 없어야 한다 */
  lacks(name, out, needle) {
    if (out.errors) return check(name, false, `차단됨: ${out.errors.join(' | ')}`);
    check(name, !(out.sql || '').includes(needle), `"${needle}" 가 있으면 안 됨`);
  },
  eq(name, actual, expected) {
    check(name, actual === expected, `기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`);
  },
  true(name, cond, detail) { check(name, !!cond, detail); },

  done(suite) {
    console.log(`\n${suite}: ${pass} passed, ${fail} failed`);
    if (fail) {
      console.log('\n실패 상세:');
      fails.forEach(f => console.log('  - ' + f));
      process.exit(1);
    }
  },
};
module.exports = A;
