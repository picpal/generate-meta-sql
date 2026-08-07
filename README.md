# DB 메타 쿼리 생성기

사내 표준 DB 메타정보 관리체계 기반의 DDL · META DML · HIST SQL 자동 생성기.
브라우저 단독으로 동작하는 정적 웹앱으로, **폐쇄망 환경 실행**을 전제로 한다.

## 실행

인터넷 없이 `index.html`을 브라우저로 열면 된다. 빌드·서버·의존성 설치 불필요.

- 파일 탐색기에서 `index.html` 더블클릭 (`file://` 프로토콜)
- 또는 사내 웹서버(IIS/Apache/nginx) 문서루트에 폴더 통째로 배포

## 기능

| 탭 | 대상 | 생성물 |
|----|------|--------|
| 테이블 신규 생성 | `TB_META_TABLE` 외 | `CREATE TABLE` · META `INSERT` · HIST |
| 컬럼 추가·변경·삭제 | 컬럼 메타 | `ALTER TABLE` · META DML · HIST |
| 인덱스 생성·삭제 | `TB_META_INDEX` · `TB_META_INDEX_COLUMN` | `CREATE/DROP INDEX` · META DML · HIST |
| 시퀀스 생성·변경·삭제 | `TB_META_SEQUENCE` | `CREATE/ALTER/DROP SEQUENCE` · META DML · HIST |

### 단축키
- `⌘↵` / `Ctrl+↵` — SQL 생성
- `Alt+1 ~ Alt+4` — 탭 전환

## 디렉토리 구조

```
generate-meta-sql/
├── index.html                           앱 진입점 (외부 CDN 의존 0)
├── css/
│   └── styles.css                       스타일 (OS 시스템 폰트 fallback)
├── js/
│   ├── version.js                       앱 버전 (VERSION 파일과 동기)
│   ├── codes.js                         공통 코드 상수 (표준설계서 5장)
│   ├── utils.js                         공통 유틸
│   ├── ui.js                            섹션 토글·서브탭·밸리데이션
│   ├── sqlview.js                       SQL 프리뷰 렌더러
│   ├── table.js                         탭 1: 테이블
│   ├── column.js                        탭 2: 컬럼
│   ├── indexMgr.js                      탭 3: 인덱스
│   ├── sequence.js                      탭 4: 시퀀스
│   └── app.js                           라우터·단축키·트윅 (반드시 마지막 로드)
├── sql/                                  ★ 모든 실행 SQL (단일 진실 공급원)
│   ├── 01_meta_ddl.sql                   [순서 1, 필수]   DDL 일괄
│   ├── 02_common_code.sql                [순서 2, 필수]   공통코드 적재
│   ├── 02a_cd_tos_template.sql           [순서 2.5, 선택] 사내 약관 코드
│   ├── 03_initial_load.sql               [순서 3, 필수]   카탈로그 → 메타 적재
│   ├── 04_drift_check.sql                [수시] Drift 감지
│   ├── 05_integrity_check.sql            [수시] 정합성 점검
│   ├── 06_func_idx_backfill.sql          [선택] 함수기반 인덱스 사후 보강
│   ├── 07_view_gen_nonpci.sql            [선택] 비-PCI VIEW DDL 자동 생성
│   ├── 07a_view_review_sample.sql        [선택] 비-PCI VIEW 생성 전 보안검토 실데이터 시트
│   ├── 10_meta_change_templates.sql      [운영] 메타 증분 변경 템플릿 9종
│   ├── 11_bulk_backfill.sql              [운영] 초기 적재 직후 대량 보정
│   └── 99_rollback.sql                   [긴급] 전체 롤백
├── build/                                ★ 반입 패키지 빌드 (개발 PC 전용)
│   ├── package.sh                        zip 생성 + 검증
│   └── bump-version.sh                   버전 일괄 상향
├── VERSION                               패키지 버전 (단일 진실 공급원)
├── CHANGELOG.md                          버전별 변경 이력
├── DB_메타정보_관리체계_표준설계.md      메타 표준 설계서 (명세 · 표 · 설계의도)
├── SQL_검증리포트.md                     사내 반입 전 SQL 검증 리포트
├── 운영가이드.md                         사내 운영 가이드 (실행 순서 · 트러블슈팅)
└── 사용자매뉴얼.md                       ★ 담당자용 상황별 매뉴얼 (먼저 볼 것)
```

## 먼저 읽을 문서

| 나는 | 문서 |
|---|---|
| 메타를 직접 변경하는 담당자다 | [사용자매뉴얼.md](사용자매뉴얼.md) — 상황별 실행 순서 |
| 메타 체계를 설치·운영하는 사람이다 | [운영가이드.md](운영가이드.md) |
| 표준 명세가 궁금하다 | [DB_메타정보_관리체계_표준설계.md](DB_메타정보_관리체계_표준설계.md) |

## 사내 반입 후 SQL 실행 순서 (필수)

1. [`sql/01_meta_ddl.sql`](sql/01_meta_ddl.sql) — DDL 생성
2. [`sql/02_common_code.sql`](sql/02_common_code.sql) — 공통코드 적재
3. (선택) [`sql/02a_cd_tos_template.sql`](sql/02a_cd_tos_template.sql) — 사내 약관 코드
4. [`sql/03_initial_load.sql`](sql/03_initial_load.sql) — 카탈로그 → 메타 적재 (실행 전 SVC 스키마 치환 필수)

## 초기 적재 이후 (일상 운영)

메타 변경의 **기본 경로는 SQL 템플릿**이다. 웹앱은 단건 변경 SQL을 폼으로 생성하는 보조 도구이며 필수가 아니다.

- 단건 변경 → [`sql/10_meta_change_templates.sql`](sql/10_meta_change_templates.sql)
- 대량 보정 (담당자·PCI 분류·보관주기) → [`sql/11_bulk_backfill.sql`](sql/11_bulk_backfill.sql)
- 변경 직후 검증 → [`sql/05_integrity_check.sql`](sql/05_integrity_check.sql) **§5.8**

상세 절차·검증·트러블슈팅: [운영가이드.md](운영가이드.md) · [사용자매뉴얼.md](사용자매뉴얼.md) 참조.

## 버전 확인

반입된 패키지가 어떤 버전인지는 세 곳에서 확인한다.

| 어디서 | 무엇 |
|---|---|
| 앱 화면 좌측 상단 | `meta_query_gen / v1.4.0` |
| 패키지 안 `VERSION` | 버전 번호 |
| 패키지 안 `BUILD_INFO.txt` | 버전 + **커밋 해시** + 빌드 시각 |

문의할 때는 `BUILD_INFO.txt` 의 version 과 commit 을 함께 알린다.
버전별 변경 내용은 [CHANGELOG.md](CHANGELOG.md) 참조.

## 반입 패키지 만들기 (개발 PC)

```sh
./build/bump-version.sh 1.5.0      # VERSION · js/version.js · index.html ?v= 일괄 갱신
#  ↳ CHANGELOG.md 에 항목 작성 후 커밋
./build/package.sh                 # dist/generate-meta-sql_v1.5.0.zip
```

`package.sh` 는 아래를 모두 통과해야 zip을 만든다. 하나라도 어긋나면 중단한다.

- `tests/run.sh` 전체 통과
- `VERSION` = `js/version.js` = `index.html` 의 모든 `?v=`
- `CHANGELOG.md` 에 해당 버전 항목 존재
- 커밋되지 않은 변경 없음 (시험 빌드는 `--dirty`)
- 생성된 zip의 한글 파일명에 UTF-8 플래그 존재 — Windows 해제 시 깨짐 방지

> `?v=` 를 버전에 묶은 이유: 손으로 관리하던 시절 `column.js` 를 고치고도
> `?v=1` 을 안 올려, 기존 사용자 브라우저가 **수정 전 JS를 계속 실행**했다.

GitHub 릴리즈 등록:

```sh
gh release create v1.5.0 --target main --notes-file <노트> dist/generate-meta-sql_v1.5.0.zip
```

## 기술 스택

- 순수 HTML / CSS / Vanilla JS (프레임워크 없음)
- 외부 런타임 의존성 **없음** — 폐쇄망에서 그대로 실행
- 폰트: OS 시스템 폰트 fallback (`-apple-system`, `BlinkMacSystemFont`, `Consolas`, `Monaco` 등)

## 표준 설계서

`DB_메타정보_관리체계_표준설계.md` — 본 앱이 구현하는 메타 테이블 구조 · 공통 코드 · 생성 규칙의 표준.
코드 상수(`js/codes.js`)는 이 문서의 5장과 동기화되어야 한다.
