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
│   ├── codes.js                         공통 코드 상수 (표준설계서 5장)
│   ├── utils.js                         공통 유틸
│   ├── ui.js                            섹션 토글·서브탭·밸리데이션
│   ├── sqlview.js                       SQL 프리뷰 렌더러
│   ├── table.js                         탭 1: 테이블
│   ├── column.js                        탭 2: 컬럼
│   ├── indexMgr.js                      탭 3: 인덱스
│   ├── sequence.js                      탭 4: 시퀀스
│   └── app.js                           라우터·단축키·트윅 (반드시 마지막 로드)
└── DB_메타정보_관리체계_표준설계.md      본 앱이 구현하는 메타 표준 설계서
```

## 기술 스택

- 순수 HTML / CSS / Vanilla JS (프레임워크 없음)
- 외부 런타임 의존성 **없음** — 폐쇄망에서 그대로 실행
- 폰트: OS 시스템 폰트 fallback (`-apple-system`, `BlinkMacSystemFont`, `Consolas`, `Monaco` 등)

## 표준 설계서

`DB_메타정보_관리체계_표준설계.md` — 본 앱이 구현하는 메타 테이블 구조 · 공통 코드 · 생성 규칙의 표준.
코드 상수(`js/codes.js`)는 이 문서의 5장과 동기화되어야 한다.
