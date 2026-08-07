#!/usr/bin/env python3
"""대상 스키마 지정이 DEFINE 한 곳으로 유지되는지 검사.

03/04 는 원래 'SVC1','SVC2' 리터럴을 7곳에 흩어 두고 있었고, 반입 담당자가
그걸 전부 찾아 치환해야 했다. 한 곳이라도 놓치면 그 카탈로그 뷰만 조용히
빈 결과가 되어 인덱스나 시퀀스가 통째로 누락된다.

지금은 DEFINE TARGET_SCHEMAS 한 줄이 SSOT다. 이 검사는
  · 각 파일에 DEFINE 이 정확히 하나 있고
  · 두 파일의 값이 같고
  · 본문에 하드코딩된 스키마 목록이 되살아나지 않았는지
를 확인한다. 나중에 누가 WHERE 절에 리터럴을 다시 박으면 여기서 걸린다.
"""
import re, sys

FILES = ['sql/03_initial_load.sql', 'sql/04_drift_check.sql']
DEFINE_RE = re.compile(r'^\s*DEFINE\s+TARGET_SCHEMAS\s*=\s*(.+?)\s*$', re.M)
# 주석(--)이 아닌 줄에서 OWNER 계열 컬럼을 리터럴 목록과 비교하는 패턴
HARDCODED_RE = re.compile(r"^(?!\s*--).*\bOWNER\s+IN\s*\(\s*'", re.M | re.I)

fail = 0
values = {}

for path in FILES:
    try:
        src = open(path, encoding='utf-8').read()
    except OSError as e:
        print(f'  ✗ {path}: 읽기 실패 — {e}')
        fail += 1
        continue

    found = DEFINE_RE.findall(src)
    if len(found) != 1:
        print(f'  ✗ {path}: DEFINE TARGET_SCHEMAS 가 {len(found)}개 (1개여야 함)')
        fail += 1
    else:
        values[path] = found[0]

    for m in HARDCODED_RE.finditer(src):
        line_no = src[:m.start()].count('\n') + 1
        print(f'  ✗ {path}:{line_no}: 스키마 목록이 하드코딩됨 — &TARGET_SCHEMAS 를 쓸 것')
        print(f'      {m.group(0).strip()[:90]}')
        fail += 1

    if '&TARGET_SCHEMAS' not in src:
        print(f'  ✗ {path}: &TARGET_SCHEMAS 참조가 없다 — DEFINE 이 실제로 쓰이지 않는다')
        fail += 1

# 11의 대량 보정은 작업 테이블로 대상을 고정한다. LISTAGG → DEFINE IDS 방식은
# ORA-01489(4000byte)·ORA-01795(IN 1000개)·0건일 때 이전 배치 IDS 잔존이라는
# 실패 모드를 안고 있어 걷어냈다. 되살아나면 여기서 잡는다.
BULK = 'sql/11_bulk_backfill.sql'
try:
    bulk = open(BULK, encoding='utf-8').read()
except OSError as e:
    print(f'  ✗ {BULK}: 읽기 실패 — {e}')
    fail += 1
else:
    for pat, why in [(r'^(?!\s*--).*\bIN\s*\(\s*&IDS\s*\)', 'IN (&IDS) 방식이 되살아났다'),
                     (r'^(?!\s*--).*\bLISTAGG\s*\(',        'LISTAGG 기반 ID 고정이 되살아났다')]:
        for m in re.finditer(pat, bulk, re.M | re.I):
            line_no = bulk[:m.start()].count('\n') + 1
            print(f'  ✗ {BULK}:{line_no}: {why} — 작업 테이블 EXISTS 방식을 쓸 것')
            fail += 1

if len(values) == len(FILES) and len(set(values.values())) > 1:
    print('  ✗ 두 파일의 TARGET_SCHEMAS 값이 다르다 — 04 가 03 이 적재하지 않은 스키마를 누락으로 보고한다')
    for p, v in values.items():
        print(f'      {p}: {v}')
    fail += 1

if fail:
    print(f'\n불일치 {fail}건')
    sys.exit(1)

print(f'대상 스키마 DEFINE: {len(FILES)}개 파일 일치 ({next(iter(values.values()))})')
