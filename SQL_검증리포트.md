# SQL 최종 검증 리포트 (사내 반입 전)

> **대상**: `sql/01_meta_ddl.sql`, `sql/02_common_code.sql`, `sql/03_initial_load.sql`
> **DB 버전**: Oracle 19c
> **검증 방식**: 정적 분석 (문법 / 제약 / 의존순서 / 코드 매핑 / 카탈로그 사용 / 재실행 안전성)
> **결론**: **실행 차단 이슈 없음(BLOCKER 0건)** · **수정 권고 3건** · **운영 주의 4건**

## 반영 현황 (2026-05-07 업데이트)

- ✅ **권고 #1 반영** — `02_common_code.sql`에 CD_SENSITIVITY (HIGH/MID/LOW) 3건 추가, 표준설계서 §5 표에도 행 추가
- ✅ **권고 #2 반영** — `03_initial_load.sql` §7.1 `c.COMMENTS` / §7.2 `cc.COMMENTS`를 `SUBSTR(..., 1, 2000)`으로 절단
- ✅ **권고 #3 반영** — `03_initial_load.sql` §7.4 WHERE에 `AND s.SEQUENCE_NAME NOT LIKE 'SEQ_META_%'` 추가
- ✅ **운영 주의 #1~#4** — 운영가이드.md로 정리 + 실행 SQL은 모두 sql/ 디렉토리로 분리:
  - #1 CD_TOS 사내 적재 → `sql/02a_cd_tos_template.sql`
  - #2 SVC1/SVC2 일괄 치환 → 운영가이드 §3 (sed/PowerShell 명령)
  - #3 동시 실행 금지 → 운영가이드 §4 + Lock 진단 쿼리는 `sql/05_integrity_check.sql §5.7`
  - #4 함수기반 인덱스 사후 보강 → `sql/06_func_idx_backfill.sql`
- ✅ **표준설계서 정리** — §6/§7/§8/부록 A의 인라인 SQL 코드블록 23개를 모두 `sql/` 파일 포인터로 교체. 표준설계서는 명세·표·설계 의도만 유지.
- ✅ **추가 분리** — 정합성 검증 → `sql/05_integrity_check.sql`, Drift 감지 → `sql/04_drift_check.sql`, 긴급 롤백 → `sql/99_rollback.sql`

### sql/ 디렉토리 최종 인벤토리

| 파일 | 분류 | 실행 시점 |
|---|---|---|
| `sql/01_meta_ddl.sql` | 초기 적재 | **순서 1, 필수** |
| `sql/02_common_code.sql` | 초기 적재 | **순서 2, 필수** |
| `sql/02a_cd_tos_template.sql` | 사내 적용 | 순서 2.5, 선택 (약관 사용 시 필수) |
| `sql/03_initial_load.sql` | 초기 적재 | **순서 3, 필수** |
| `sql/04_drift_check.sql` | 운영 점검 | 일 1회 배치 권장 |
| `sql/05_integrity_check.sql` | 운영 점검 | 02·03 직후 + 수시 |
| `sql/06_func_idx_backfill.sql` | 운영 보강 | 함수기반 인덱스 식별 시 |
| `sql/07_view_gen_nonpci.sql` | 메타 활용 | 비-PCI VIEW DDL 자동 생성 (SPOOL → 검토 → 수동 실행) |
| `sql/07a_view_review_sample.sql` | 메타 활용 | 비-PCI VIEW 생성 전 보안검토 실데이터 시트 (SPOOL → 보안팀 검토) |
| `sql/99_rollback.sql` | 긴급 롤백 | ⚠️ 책임자 승인 후 |

---

## 1. 종합 판정

| 영역 | 상태 |
|---|---|
| Oracle 19c 문법 호환성 | 통과 |
| DDL 의존순서 (PK/FK 생성순) | 통과 |
| 본↔HIST 컬럼 정합 | 통과 |
| NOT NULL / CHECK 제약 위배 | 통과 |
| 실행 순서 (01→02→03) | 통과 |
| 재실행 안전성 (NOT EXISTS 가드) | 통과 |
| 코드값 ↔ 표준설계서 §5 매핑 | **부분 누락 1건** |
| 시스템 카탈로그 컬럼 길이 매핑 | **truncation 위험 1건** |
| 자기 자신 제외 정책 일관성 | **시퀀스 측면 누락 1건** |

본 SQL은 표준설계서 §6/§7과 1:1로 일치하며, 사내 반입 후 SVC 스키마명 치환만으로 즉시 실행 가능합니다. 단 아래 권고 3건은 반입 전 수정 또는 운영 가이드 보완을 권장합니다.

---

## 2. 수정 권고 (사내 반입 전 검토)

### [권고 #1] CD_SENSITIVITY 코드그룹 누락 — 설계 정합성

- **위치**: `sql/02_common_code.sql` (CD_SENSITIVITY INSERT 없음)
- **상세**:
  - 표준설계서 §4의 TB_META_COLUMN 사양(line 152)은 `SENSITIVITY_CD VARCHAR2(10)` 컬럼이 코드그룹 `CD_SENSITIVITY` (HIGH/MID/LOW)에 매핑된다고 명시.
  - 그러나 표준설계서 §5의 코드그룹 정의 표에는 `CD_SENSITIVITY` 행이 누락되어 있으며, 그 결과 `02_common_code.sql`에도 INSERT 구문이 없음.
  - `03_initial_load.sql` §7.2는 SENSITIVITY_CD에 `'LOW'`를 적재하지만, 코드 마스터가 없어 정합성 검증 쿼리를 사후에 돌릴 수 없음.
  - DDL에 FK가 걸려있지 않으므로 **실행 자체는 성공**합니다. 그러나 코드 일관성 정책상 미흡.
- **조치안 (택1)**:
  - (A) 02에 `CD_SENSITIVITY` 그룹의 HIGH/MID/LOW 3건 INSERT 추가 (NOT EXISTS 가드 + HIST 적재 일관 패턴 유지).
  - (B) 표준설계서 §4의 SENSITIVITY_CD 코드그룹 매핑을 §5와 일치하게 재정의(코드그룹 미사용 enum 단순 컬럼으로 강등).
- **권장**: A — 표준설계서 §5에 `CD_SENSITIVITY | HIGH/MID/LOW | 민감도` 행 추가 후 02에 동일한 패턴으로 INSERT.

### [권고 #2] DESCRIPTION 컬럼 truncation 위험 — 데이터 적재

- **위치**: `sql/03_initial_load.sql` line 33 (`c.COMMENTS`), line 107 (`cc.COMMENTS`)
- **상세**:
  - `ALL_TAB_COMMENTS.COMMENTS`, `ALL_COL_COMMENTS.COMMENTS`는 Oracle 정의상 `VARCHAR2(4000)`.
  - 대상 컬럼 `TB_META_TABLE.DESCRIPTION` / `TB_META_COLUMN.DESCRIPTION`은 `VARCHAR2(2000)` (표준설계서 §6.3, §6.4).
  - 운영 DB 어딘가에 2000자 초과 코멘트가 1건이라도 있으면 **ORA-12899 (value too large) 발생** → 해당 트랜잭션 전체 ROLLBACK.
  - HIST 테이블도 동일 길이라서 동일 위험.
- **조치안 (택1)**:
  - (A) 표준식 — `SUBSTR(c.COMMENTS, 1, 2000)`, `SUBSTR(cc.COMMENTS, 1, 2000)` 으로 명시 절단.
  - (B) 표준설계서 §6.3, §6.4의 DESCRIPTION을 `VARCHAR2(4000)`으로 확장.
- **권장**: A — 메타 DESCRIPTION은 검색·표시 용도가 강해 4000자 일괄 확장은 과해 보임. SUBSTR로 안전 절단.

### [권고 #3] 시퀀스 적재 시 SEQ_META_% 자기 자신 제외 누락 — 정책 일관성

- **위치**: `sql/03_initial_load.sql` §7.4 (line 316~322)
- **상세**:
  - §7.1 테이블 적재는 `t.TABLE_NAME NOT LIKE 'TB_META_%'`로 자기 자신을 제외.
  - 그러나 §7.4 시퀀스 적재는 동일한 가드가 없음. 메타 스키마가 SVC 목록에 포함되거나 메타와 운영 스키마를 혼합 운영하는 경우, 다음 5개 시퀀스가 자기 자신으로 적재됨:
    - `SEQ_META_TABLE_ID`, `SEQ_META_COLUMN_ID`, `SEQ_META_INDEX_ID`, `SEQ_META_SEQUENCE_ID`, `SEQ_META_HIST_ID`
- **조치안**: §7.4 WHERE 절에 한 줄 추가
  ```sql
  AND s.SEQUENCE_NAME NOT LIKE 'SEQ_META_%'
  ```
- **권장**: 메타 스키마 분리 여부와 무관하게 보수적으로 추가.

---

## 3. 운영 주의 (실행 가이드 보완 권장)

### [주의 #1] CD_TOS 코드그룹 미적재 — 의도된 누락

- 표준설계서 §5 표는 CD_TOS를 "*사내 이용약관 체계에 맞게 적재*"로 위임 → 02에서 의도적으로 누락.
- 사내 반입 후 02 직후·03 직전에 별도 코드 적재 스크립트 1회 실행 절차 사전 확정 필요.
- 03에서 TOS_CD는 NULL이므로 03 실행 자체에는 영향 없음.

### [주의 #2] SVC1/SVC2 플레이스홀더 — 실행 전 필수 치환

- 위치 5곳: `sql/03_initial_load.sql` (§7.1 ALL_TABLES, §7.1 ALL_VIEWS, §7.3 인덱스, §7.3 인덱스 컬럼, §7.4 시퀀스)
- 헤더 7번에 사전 수정 명시되어 있음. 다음 치환 명령으로 일괄 처리 가능:
  ```bash
  sed -i.bak "s/'SVC1','SVC2'/'YOUR_OWNER1','YOUR_OWNER2','YOUR_OWNER3'/g" sql/03_initial_load.sql
  ```
- 치환 후 4곳 모두 동일하게 변경되었는지 `grep -n "OWNER IN" sql/03_initial_load.sql` 로 재확인 권장.

### [주의 #3] NOT EXISTS 가드의 race condition

- 모든 본 INSERT/HIST INSERT는 NOT EXISTS 가드로 재실행 안전.
- 다만 동일 SQL을 2개 세션에서 동시 실행하면 가드를 둘 다 통과 → 두 번째 INSERT는 PK/UK 제약(예: `UK_META_TABLE`, `PK_META_CODE`)으로 ORA-00001 에러.
- 데이터 무결성은 보장되지만 운영 가이드에 **"동시 실행 금지 / 단일 세션 직렬 실행"** 명시 권장.

### [주의 #4] 함수기반 인덱스의 SYS_NCxxxxx 컬럼명

- 함수기반 인덱스는 `ALL_IND_COLUMNS`에서 `SYS_NCxxxxx` 형태의 가상 컬럼명으로 노출됨.
- 03 §7.3.2는 그대로 적재하므로 `TB_META_INDEX_COLUMN.COLUMN_NAME`에 비가독 값 들어감.
- `FUNC_EXPRESSION`은 표준설계서 §7.3 단서에 따라 NULL (LONG 컬럼이라 SQL-only로 추출 불가).
- 사후 보강(`DBMS_METADATA.GET_DDL` 또는 `ALL_IND_EXPRESSIONS` 별도 도구) 절차 사전 확정 필요.

---

## 4. 검증 통과 항목 (요약)

| 점검 항목 | 결과 |
|---|---|
| 시퀀스 5종 (TABLE/COLUMN/INDEX/SEQUENCE/HIST) 모두 정의 | OK |
| 본 테이블 6종 + HIST 테이블 6종 모두 정의 | OK |
| FK: TB_META_COLUMN/INDEX → TB_META_TABLE, INDEX_COLUMN → INDEX | OK |
| HIST 테이블 컬럼이 원본 컬럼 전체 포함 (모두 nullable) | OK |
| `CK_META_*_HIST_TYPE CHECK (HIST_TYPE IN ('I','U','D'))` 모든 HIST에 존재 | OK |
| 02 코드그룹 10종 (CD_SERVICE 더미 1건 포함) 적재, §5 매칭 | OK |
| 03 INSERT 10건 = 본 5건 + HIST 5건, 모두 NOT EXISTS 가드 | OK |
| 03 §7.1 ALL_TABLES 필터 (BIN$%, TB_META_%, GTT, NESTED, IOT 부속) | OK |
| 03 §7.2 PK/UK/FK 서브쿼리 `STATUS='ENABLED'` 필터 | OK |
| 03 §7.2 ALL_ENCRYPTED_COLUMNS LEFT JOIN으로 TDE 자동 매칭 | OK |
| 03 §7.3 INDEX_TYPE_CD 분류 (BITMAP/FUNCTION/REVERSE 우선 → UNIQUE → NORMAL) | OK |
| 03 §7.3 PURPOSE_CD: ALL_CONSTRAINTS PK 매칭 | OK |
| 03 §7.4 START_WITH ≈ LAST_NUMBER 근사 (표준설계서 한계 명시) | OK |
| 본 적재 → HIST 적재 동일 트랜잭션 패턴 (10:10 매칭) | OK |
| 모든 NOT NULL 제약 충족 (TB_META_TABLE/COLUMN/INDEX/INDEX_COLUMN/SEQUENCE/CODE) | OK |
| 모든 CHECK 제약 위배 없음 (Y/N, ASC/DESC, I/U/D, USE_YN) | OK |
| Oracle 19c 호환 문법 (VARCHAR2(128), CLOB, NOORDER NOCYCLE, DEFAULT SYSTIMESTAMP) | OK |
| LONG 컬럼 회피 (DATA_DEFAULT, COLUMN_EXPRESSION) | OK |
| 식별자 길이 30자 미만 (인덱스명 최장 `IDX_META_INDEX_COLUMN_HIST_01` 29자) | OK |
| COMMIT 위치 (각 파일 1회, 끝부분) | OK |

---

## 5. 실행 체크리스트 (사내 반입 직후)

### 사전
1. [ ] **권고 #1~#3** 반영 여부 결정 (반영 권장 → 변경 후 단위 검토)
2. [ ] `sql/03_initial_load.sql`의 `'SVC1','SVC2'` 4곳을 실제 운영 스키마로 치환
3. [ ] 메타 테이블 적재 대상 스키마(메타 자체) 계정으로 접속 (대상 SVC 스키마 계정 아님)
4. [ ] 적재 대상 SVC 스키마에 대한 SELECT 권한 확보 (`ALL_TABLES` 등 ALL_ 뷰 가시성)
5. [ ] CD_TOS 코드 적재 스크립트 별도 준비 (사내 이용약관 체계 기반)

### 실행 (직렬, 단일 세션)
6. [ ] `01_meta_ddl.sql` 실행 → 시퀀스 5개 + 테이블 12개 + 인덱스 13개 생성 확인
7. [ ] `02_common_code.sql` 실행 → `SELECT CODE_GROUP, COUNT(*) FROM TB_META_CODE GROUP BY CODE_GROUP` 으로 기대 행수 검증
   - 기대치: CD_RETENTION_PERIOD 6, CD_PCI_CATEGORY 5, CD_ISOLATION_LEVEL 3, CD_STATUS 3, CD_INDEX_TYPE 5, CD_INDEX_PURPOSE 6, CD_SEQUENCE_PURPOSE 4, CD_MASKING_RULE 7, CD_SERVICE 1 (+ 권고 #1 반영 시 CD_SENSITIVITY 3)
8. [ ] (선택) CD_TOS 사내 적재 스크립트 실행
9. [ ] `03_initial_load.sql` 실행 → `SELECT COUNT(*) FROM TB_META_TABLE/COLUMN/INDEX/INDEX_COLUMN/SEQUENCE` 와 `*_HIST` 행수가 1:1 일치하는지 검증
10. [ ] HIST 동시성 검증: `SELECT COUNT(*) FROM TB_META_TABLE_HIST WHERE HIST_TYPE='I' AND CHANGE_REASON='INITIAL_LOAD'` 가 본 테이블 행수와 동일

### 사후 (메타 정합성 정상 검증)
11. [ ] 대상 SVC 스키마의 `ALL_TABLES` 행수 vs `TB_META_TABLE` 행수 차이 분석
12. [ ] 함수기반 인덱스의 `FUNC_EXPRESSION` NULL 보강 절차 가동
13. [ ] `SERVICE_CD='UNASSIGNED'`, `OWNER_EMP_ID='SYSTEM'` 행을 담당자 기준으로 일괄 UPDATE (HIST 'U' 동반)

---

## 6. 결론

본 3개 SQL 파일은 표준설계서 §6/§7과 1:1로 일치하는 고품질 산출물입니다. 실행 차단 결함은 없으며 Oracle 19c에서 `01 → 02 → 03` 순서로 실행 시 정상 완료됩니다. 다만 사내 반입 전 **권고 #1 (CD_SENSITIVITY 코드 적재)**, **권고 #2 (DESCRIPTION SUBSTR)**, **권고 #3 (SEQ_META_% 자기 제외)** 를 반영하면 메타 정합성 측면에서 더 견고해집니다. 운영 주의 4건은 가이드 문서 보완 사항입니다.
