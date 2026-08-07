#!/bin/sh
# 전체 검증 실행. 하나라도 실패하면 0이 아닌 코드로 종료한다.
cd "$(dirname "$0")/.." || exit 1
rc=0

step() {
  printf '── %s ──\n' "$1"; shift
  out=$("$@" 2>&1); code=$?
  if [ $code -ne 0 ]; then
    printf '%s\n' "$out"
    printf 'FAILED (exit %s)\n\n' "$code"; rc=1
  else
    printf '%s\n\n' "$(printf '%s' "$out" | tail -1)"
  fi
}

printf '── JS 문법 ──\n'
for f in js/*.js; do
  if ! node --check "$f"; then rc=1; fi
done
[ $rc -eq 0 ] && printf 'OK (%s개 파일)\n\n' "$(ls js/*.js | wc -l | tr -d ' ')"

step "폼 필드 정의 불변식" node tests/t_field_ids.js
step "컬럼 변경 SQL 생성"  node tests/t_column.js
step "시퀀스 변경 SQL 생성" node tests/t_seq.js
step "SQL INSERT 정합성"   python3 tests/check_sql_inserts.py sql/01_meta_ddl.sql sql/02_common_code.sql sql/02a_cd_tos_template.sql sql/03_initial_load.sql sql/04_drift_check.sql sql/05_integrity_check.sql sql/06_func_idx_backfill.sql sql/07_view_gen_nonpci.sql sql/07a_view_review_sample.sql sql/10_meta_change_templates.sql sql/11_bulk_backfill.sql sql/99_rollback.sql

if [ $rc -eq 0 ]; then echo "전체 통과"; else echo "실패 항목 있음"; fi
exit $rc
