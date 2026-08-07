#!/bin/bash
# =========================================================
# 사내 반입 패키지 빌드
#
#   ./build/package.sh            → dist/generate-meta-sql_v<VERSION>.zip
#   ./build/package.sh --dirty    → 커밋되지 않은 작업본으로 시험 빌드
#
# 버전의 단일 진실 공급원은 루트 VERSION 파일이다.
# js/version.js 가 여기서 어긋나면 빌드를 중단한다 — 폐쇄망에 들어간 뒤에는
# 화면에 뜨는 버전만이 유일한 식별 수단이라 불일치를 방치할 수 없다.
#
# zip 생성에 반드시 `git archive --format=zip` 을 쓴다. macOS 기본 zip(Info-ZIP)은
# 한글 파일명에 UTF-8 플래그(0x800)를 붙이지 않아 Windows에서 깨진다.
# =========================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
ALLOW_DIRTY=0
[ "${1:-}" = "--dirty" ] && ALLOW_DIRTY=1

fail() { printf '\n✗ %s\n' "$1" >&2; exit 1; }

# ── 1. 버전 확인 ──────────────────────────────────────────
[ -f VERSION ] || fail "VERSION 파일이 없다"
VERSION=$(tr -d ' \t\n\r' < VERSION)
[ -n "$VERSION" ] || fail "VERSION 파일이 비어 있다"

echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$' \
  || fail "VERSION 형식이 MAJOR.MINOR.PATCH 가 아니다: '$VERSION'"

# 앱에 박힌 버전과 대조
JS_VERSION=$(sed -n "s/.*APP_VERSION[[:space:]]*=[[:space:]]*'\([^']*\)'.*/\1/p" js/version.js 2>/dev/null | head -1)
[ -n "$JS_VERSION" ] || fail "js/version.js 에서 APP_VERSION 을 읽지 못했다"
[ "$JS_VERSION" = "$VERSION" ] || fail \
  "버전 불일치 — VERSION='$VERSION' 인데 js/version.js='$JS_VERSION'
   ./build/bump-version.sh $VERSION 으로 함께 올릴 것"

# 캐시 무효화 — 이게 뒤처지면 사용자 브라우저가 구버전 JS를 계속 쓴다.
# 실제로 PR #40에서 column.js 를 고쳤는데 ?v=1 이 그대로였다.
# src=/href= 속성만 본다 — 주석에 쓴 '?v=' 문구까지 세면 오탐이 난다
ALL_V=$(grep -oE '(src|href)="[^"]+\?v=[^"]*"' index.html || true)
[ -n "$ALL_V" ] || fail "index.html 에서 ?v= 를 하나도 찾지 못했다 — 검사 패턴이 깨졌다"

STALE_V=$(printf '%s\n' "$ALL_V" | grep -v "?v=${VERSION}\"" || true)
[ -z "$STALE_V" ] || fail \
  "index.html 의 ?v= 가 ${VERSION} 이 아니다 — 구버전 JS가 캐시에서 살아남는다
$(printf '%s\n' "$STALE_V" | sed 's/^/     /')
   ./build/bump-version.sh 로 갱신할 것"

# CHANGELOG 에 항목이 있는지 (반입본은 무엇이 바뀌었는지 설명 가능해야 한다)
grep -q "^## \[$VERSION\]" CHANGELOG.md \
  || fail "CHANGELOG.md 에 '## [$VERSION]' 항목이 없다"

# ── 2. 작업 트리 상태 ─────────────────────────────────────
if [ -n "$(git status --porcelain)" ]; then
  [ "$ALLOW_DIRTY" -eq 1 ] || fail \
    "커밋되지 않은 변경이 있다. 패키지가 어떤 커밋인지 특정할 수 없다.
     커밋하거나, 시험 빌드라면 --dirty 를 붙일 것"
  echo "⚠  --dirty: 커밋되지 않은 변경이 있는 상태로 빌드한다 (배포 금지)"
fi

# ── 3. 테스트 ─────────────────────────────────────────────
echo "── 테스트 ──"
./tests/run.sh > /tmp/pkg_test_$$.log 2>&1 || {
  cat /tmp/pkg_test_$$.log; rm -f /tmp/pkg_test_$$.log
  fail "테스트 실패 — 패키지를 만들지 않는다"
}
tail -1 /tmp/pkg_test_$$.log; rm -f /tmp/pkg_test_$$.log

# ── 4. 빌드 ───────────────────────────────────────────────
PREFIX="generate-meta-sql-v${VERSION}"
OUT="${ROOT}/dist/generate-meta-sql_v${VERSION}.zip"
SHA=$(git rev-parse HEAD)
SHORT=$(git rev-parse --short HEAD)
BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
mkdir -p "$(dirname "$OUT")"
rm -f "$OUT"

if [ "$ALLOW_DIRTY" -eq 1 ]; then
  # 작업본 그대로 — 추적 파일 목록만 따라간다 (.DS_Store 등 배제)
  TMPZ=$(mktemp -d)
  git ls-files -z | while IFS= read -r -d '' f; do
    mkdir -p "$TMPZ/$PREFIX/$(dirname "$f")"
    cp "$f" "$TMPZ/$PREFIX/$f"
  done
  ( cd "$TMPZ" && zip -qr "$OUT" "$PREFIX" -x '*.DS_Store' )
  rm -rf "$TMPZ"
  SHA="${SHA}-dirty"; SHORT="${SHORT}-dirty"
else
  git archive --format=zip --prefix="${PREFIX}/" -o "$OUT" HEAD
fi

# ── 5. BUILD_INFO 주입 ────────────────────────────────────
# VERSION 파일은 이미 추적본으로 들어가 있다. 여기서는 커밋 해시와 빌드 시각처럼
# 폐쇄망에서 되짚을 수 없는 정보를 남긴다.
STAGE=$(mktemp -d)
mkdir -p "$STAGE/$PREFIX"
cat > "$STAGE/$PREFIX/BUILD_INFO.txt" <<EOF
generate-meta-sql
version   : ${VERSION}
commit    : ${SHA}
built_at  : ${BUILT_AT} (UTC)
sources   : $(git ls-files | wc -l | tr -d ' ')개 (+ 이 파일)

이 패키지가 어떤 소스에서 나왔는지를 기록한다.
사내 반입 후 문의 시 version 과 commit 을 함께 알릴 것.
EOF
( cd "$STAGE" && zip -q "$OUT" "$PREFIX/BUILD_INFO.txt" )
rm -rf "$STAGE"

# ── 6. 검증 ───────────────────────────────────────────────
unzip -tq "$OUT" > /dev/null || fail "생성된 zip이 손상됐다"

# 한글 파일명이 UTF-8 플래그를 달고 있는지 (Windows 해제 시 깨짐 방지)
python3 - "$OUT" <<'PY' || fail "한글 파일명에 UTF-8 플래그가 없다 — Windows에서 깨진다"
import sys, zipfile
bad = [i.filename for i in zipfile.ZipFile(sys.argv[1]).infolist()
       if not i.filename.isascii() and not (i.flag_bits & 0x800)]
sys.exit(1 if bad else 0)
PY

COUNT=$(unzip -l "$OUT" | tail -1 | awk '{print $2}')
SIZE=$(du -h "$OUT" | cut -f1 | tr -d ' ')

printf '\n✓ %s\n' "$(basename "$OUT")"
printf '  버전   %s (%s)\n' "$VERSION" "$SHORT"
printf '  파일   %s개, %s\n' "$COUNT" "$SIZE"
printf '  경로   %s\n\n' "$OUT"
printf '릴리즈 등록:\n'
printf '  gh release create v%s --target main --notes-file <노트> %s\n' "$VERSION" "$OUT"
