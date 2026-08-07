#!/bin/bash
# =========================================================
# 버전 일괄 상향
#
#   ./build/bump-version.sh 1.5.0
#
# 버전이 박히는 세 곳을 한 번에 바꾼다. 손으로 나눠 고치면
# 반드시 한 곳이 빠지고, 그 상태로 폐쇄망에 들어가면 되돌릴 수 없다.
#
#   VERSION            패키지 버전 (SSOT)
#   js/version.js      화면에 뜨는 버전
#   index.html ?v=     캐시 무효화 — 이게 안 바뀌면 사용자는 구버전 JS를 계속 쓴다
#
# CHANGELOG.md 항목은 직접 쓴다. package.sh 가 항목 없으면 빌드를 막는다.
# =========================================================
set -euo pipefail

cd "$(dirname "$0")/.."

fail() { printf '\n✗ %s\n' "$1" >&2; exit 1; }

NEW="${1:-}"
[ -n "$NEW" ] || fail "사용법: ./build/bump-version.sh <MAJOR.MINOR.PATCH>"
echo "$NEW" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || fail "버전 형식이 MAJOR.MINOR.PATCH 가 아니다: '$NEW'"

OLD=$(tr -d ' \t\n\r' < VERSION)
[ "$OLD" != "$NEW" ] || fail "이미 $NEW 다"

# 되돌아가는 버전은 막는다 — 사용자가 구버전을 받았다고 오해한다
LOWEST=$(printf '%s\n%s\n' "$OLD" "$NEW" | sort -t. -k1,1n -k2,2n -k3,3n | head -1)
[ "$LOWEST" = "$OLD" ] || fail "$OLD → $NEW 는 버전을 낮춘다"

printf '%s\n' "$NEW" > VERSION
sed -i '' "s/APP_VERSION = '${OLD}'/APP_VERSION = '${NEW}'/" js/version.js
sed -i '' "s/?v=${OLD}/?v=${NEW}/g" index.html

# 놓친 곳이 없는지 되확인 — src=/href= 속성만 본다 (주석의 '?v=' 문구는 제외)
grep -q "APP_VERSION = '${NEW}'" js/version.js || fail "js/version.js 갱신 실패"
ALL=$(grep -oE '(src|href)="[^"]+\?v=[^"]*"' index.html || true)
[ -n "$ALL" ] || fail "index.html 에서 ?v= 를 찾지 못했다"
STALE=$(printf '%s\n' "$ALL" | grep -v "?v=${NEW}\"" || true)
[ -z "$STALE" ] || fail \
  "index.html 의 ?v= 가 ${NEW} 로 안 바뀌었다 (이전 값이 ${OLD} 이 아닐 수 있음)
$(printf '%s\n' "$STALE" | sed 's/^/     /')"

printf '✓ %s → %s  (VERSION · js/version.js · index.html %s곳)\n\n' \
  "$OLD" "$NEW" "$(printf '%s\n' "$ALL" | wc -l | tr -d ' ')"
printf '다음 순서:\n'
printf '  1. CHANGELOG.md 에 "## [%s] — <날짜>" 항목 작성\n' "$NEW"
printf '  2. git commit\n'
printf '  3. ./build/package.sh\n'
