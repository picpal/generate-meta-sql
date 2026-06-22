# DB 메타정보 관리체계 표준 설계 (v1.0)

> **대상 DBMS**: Oracle  
> **대상 범위**: 테이블 / 컬럼 / 인덱스 / 시퀀스 메타정보 + 변경 이력  
> **운영 방식**: DB 직접 DML (담당자 권한 기반) + 감사 컬럼 + History 테이블 병행  
> **최종 수정**: 2026-04-18

---

## 1. 배경 및 목적

### 1.1 배경

- 사내에 테이블/컬럼 메타정보를 표준화된 형태로 관리하는 체계가 부재.
- 폐쇠망·금융권 특성상 상용 데이터 카탈로그 솔루션(Alation, Collibra, DataHub 등) 도입이 현실적으로 어려움.
- 신용정보법 및 개인정보보호법에 따른 **개인신용정보 식별·보관주기 관리**가 감사 대상임에도 불구하고, 컬럼 수준의 메타 근거가 체계적으로 남아있지 않음.

### 1.2 목적

1. **표준 포맷**을 정의하고, 사내 Oracle DBMS에 **메타 테이블**을 직접 생성.
2. **Oracle 시스템 카탈로그**(ALL_TABLES, ALL_TAB_COLUMNS 등) 기준으로 1차 자동 적재.
3. **서비스 담당자**가 자기 서비스 소유 테이블·컬럼에 대한 **업무·법적 메타정보**를 DB DML로 갱신.
4. 개인신용정보 식별, 감사 대응을 위한 **단일 진실의 원천(SSOT)** 확보.

### 1.3 범위


| 구분             | 포함 여부 | 비고                   |
| -------------- | ----- | -------------------- |
| 테이블 메타         | ✅     | 업무명·보관주기·격리·이용약관 연계  |
| 컬럼 메타          | ✅     | 개인신용정보·뷰 제외·암호화 여부 등 |
| 인덱스 메타         | ✅     | 생성 목적·튜닝 기록 포함       |
| 시퀀스 메타         | ✅     | 용도 및 대상 테이블 연결       |
| 변경 이력(History) | ✅     | 테이블, 컬럼 메타 변경 이력 관리  |
| Drift 감지       | ✅     | 실제 DB ↔ 메타 차이 리포트    |


---

## 2. 설계 원칙

1. **단순성 우선**: 1차 버전은 Oracle 네이티브 기능(테이블 + 시퀀스 + SQL DDL/DML)만으로 구성. **트리거·프로시저·함수·익명 PL/SQL 블록 일체 사용 금지** (폐쇄망·금융권 정책).
2. **SSOT**: 메타 테이블이 유일한 원천. 엑셀·워드 문서의 메타 정의는 금지(이관 후 폐기).
3. **선언적 분류**: 모든 분류값은 공통코드(`TB_META_CODE`)로 관리. 추가 분류 필요 시 논의 필요
4. **Drift 감지 가능성**: 실제 Oracle 카탈로그와 메타 테이블 상태를 주기적으로 비교 필요.
5. **확장성**: 인덱스·시퀀스 외에도 파티션·제약조건등으로 확장 가능한 구조.

---

## 3. 전체 구조

### 3.1 ERD (논리)

```
                       ┌──────────────────┐
                       │   TB_META_CODE   │ (공통코드)
                       └────────┬─────────┘
                                │ 참조
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
┌────────┴────────┐   ┌─────────┴────────┐   ┌─────────┴────────┐
│ TB_META_TABLE   │1─*│ TB_META_COLUMN   │   │TB_META_SEQUENCE  │
│ (테이블 메타)   │   │ (컬럼 메타)      │   │ (시퀀스 메타)    │
└────────┬────────┘   └──────────────────┘   └──────────────────┘
         │
         │1
         │
         *
┌────────┴──────────┐   ┌────────────────────────┐
│ TB_META_INDEX     │1─*│ TB_META_INDEX_COLUMN   │
│ (인덱스 메타)     │   │ (인덱스-컬럼 매핑)     │
└───────────────────┘   └────────────────────────┘

각 테이블은 *_HIST 테이블을 1:1로 병행 (도구가 생성한 인라인 INSERT로 적재)
```

### 3.2 메타 테이블 목록


| 구분        | 설명                   |
| --------- | --------------------- |
| 메타 테이블    | `TB_META_TABLE`       |
| 메타 이력 테이블 | `TB_META_TABLE_HIST`  |
| 메타 시퀀스    | `SEQ_META_TABLE_ID`   |
| 메타 인덱스    | `IDX_META_COLUMN_01`  |
| 공통 코드     | `CD_RETENTION_PERIOD` |


---

## 4. 메타 테이블 상세

### 4.1 TB_META_TABLE — 테이블 메타


| 컬럼                  | 타입             | NULL | 설명                                         |
| ------------------- | -------------- | ---- | ------------------------------------------ |
| TABLE_ID            | NUMBER(12)     | N    | PK (SEQ_META_TABLE_ID)                     |
| SCHEMA_NAME         | VARCHAR2(128)   | N    | 스키마명 (대문자)                                 |
| TABLE_NAME          | VARCHAR2(128)  | N    | 테이블명 (대문자)                                 |
| LOGICAL_NAME        | VARCHAR2(200)  | Y    | 한글/업무명                                     |
| DESCRIPTION         | VARCHAR2(2000) | Y    | 테이블 설명                                     |
| VIEW_YN             | CHAR(1)        | N    | 뷰 여부 (Y=뷰, N=일반 테이블)                       |
| SERVICE_CD          | VARCHAR2(20)   | N    | 소유 서비스 코드 (`CD_SERVICE`)                   |
| OWNER_EMP_ID        | VARCHAR2(20)   | N    | 주 담당자 사번                                    |
| SECONDARY_EMP_ID    | VARCHAR2(20)   | Y    | 부 담당자 사번                                    |
| KEY_TABLE_YN        | CHAR(1)        | N    | 키 관련 테이블 여부(Y/N)                           |
| ISOLATION_YN        | CHAR(1)        | N    | 격리 필요 여부                                   |
| ISOLATION_LEVEL_CD  | VARCHAR2(10)   | Y    | `CD_ISOLATION_LEVEL`: L1/L2/L3             |
| PCI_YN              | CHAR(1)        | N    | 개인신용정보 포함 (개인정보 포괄)                       |
| RETENTION_PERIOD_CD | VARCHAR2(10)   | N    | `CD_RETENTION_PERIOD`                      |
| RETENTION_BASIS     | VARCHAR2(500)  | Y    | 보관주기 근거(법령·내규)                             |
| TOS_CD              | VARCHAR2(20)   | Y    | 연계 이용약관 코드 (`CD_TOS`)                     |
| STATUS_CD           | VARCHAR2(10)   | N    | `CD_STATUS`: PLANNED/ACTIVE/DEPRECATED     |
| REMARK              | VARCHAR2(4000) | Y    | 비고                                         |
| CREATED_BY          | VARCHAR2(128)   | N    | 생성자 사번                                     |
| CREATED_AT          | TIMESTAMP      | N    | 생성일시                                       |
| UPDATED_BY          | VARCHAR2(128)   | N    | 최종 수정자                                     |
| UPDATED_AT          | TIMESTAMP      | N    | 최종 수정일시                                    |


**제약조건**

- UNIQUE: (SCHEMA_NAME, TABLE_NAME)
- CHECK: 모든 `_YN` 컬럼은 Y/N만 허용
- 코드성 컬럼(`*_CD`) ↔ `TB_META_CODE`: `TB_META_CODE`의 PK가 복합키(CODE_GROUP, CODE_VALUE)이므로 단일 컬럼 FK는 불가. 정합성은 (a) 일 1회 배치 검증 + (b) `CD_SERVICE`에 한해 운영 시점 FK 활성화 옵션으로 보장한다. (선택: 코드 그룹별 보조 컬럼을 두고 복합 FK로 전환 가능)

### 4.2 TB_META_COLUMN — 컬럼 메타


| 컬럼                           | 타입             | NULL | 설명                                                |
| ---------------------------- | -------------- | ---- | ------------------------------------------------- |
| COLUMN_ID                    | NUMBER(14)     | N    | PK                                                |
| TABLE_ID                     | NUMBER(12)     | N    | FK → TB_META_TABLE                                |
| COLUMN_NAME                  | VARCHAR2(128)  | N    | 컬럼명                                               |
| COLUMN_ORDER                 | NUMBER(4)      | N    | 컬럼 순서                                             |
| LOGICAL_NAME                 | VARCHAR2(200)  | Y    | 한글명                                               |
| DESCRIPTION                  | VARCHAR2(2000) | Y    | 설명                                                |
| DATA_TYPE                    | VARCHAR2(30)   | N    | 데이터 타입                                            |
| DATA_LENGTH                  | NUMBER(6)      | Y    | 길이                                                |
| DATA_PRECISION               | NUMBER(6)      | Y    | 정밀도(NUMBER 계열)                                   |
| DATA_SCALE                   | NUMBER(6)      | Y    | 소수점 자리                                            |
| NULLABLE_YN                  | CHAR(1)        | N    | NULL 허용                                           |
| DEFAULT_VALUE                | VARCHAR2(500)  | Y    | 기본값                                               |
| PK_YN                        | CHAR(1)        | N    | PK 구성 여부                                          |
| UK_YN                        | CHAR(1)        | N    | UK 구성 여부                                          |
| FK_YN                        | CHAR(1)        | N    | FK 구성 여부                                          |
| PCI_YN                       | CHAR(1)        | N    | 개인신용정보 여부 (개인정보 포괄)                              |
| PCI_CATEGORY_CD              | VARCHAR2(20)   | Y    | `CD_PCI_CATEGORY`: IDENT/TRX/SCORE/ABILITY/PUBLIC |
| SENSITIVITY_CD               | VARCHAR2(10)   | N    | `CD_SENSITIVITY`: HIGH/MID/LOW                    |
| ENCRYPTION_YN                | CHAR(1)        | N    | 암호화 저장 여부                                         |
| ENCRYPTION_ALG               | VARCHAR2(50)   | Y    | 암호화 알고리즘                                          |
| MASKING_YN                   | CHAR(1)        | N    | 마스킹 대상                                            |
| MASKING_RULE_CD              | VARCHAR2(20)   | Y    | `CD_MASKING_RULE`                                 |
| RETENTION_PERIOD_CD          | VARCHAR2(10)   | Y    | 컬럼 단위 보관주기(테이블과 다를 때만)                            |
| TOS_CD                       | VARCHAR2(20)   | Y    | 연계 이용약관 코드(테이블내 세부적으로 다른경우)              |
| STATUS_CD                    | VARCHAR2(10)   | N    | PLANNED/ACTIVE/DEPRECATED                         |
| REMARK                       | VARCHAR2(4000) | Y    | 비고                                                |
| CREATED_BY/AT, UPDATED_BY/AT | —              | N    | 감사 컬럼                                             |


**제약조건**

- UNIQUE: (TABLE_ID, COLUMN_NAME)
- FK: TABLE_ID → TB_META_TABLE.TABLE_ID (ON DELETE CASCADE 금지 — 감사 목적상 소프트 딜리트만 허용)

### 4.3 TB_META_INDEX — 인덱스 메타


| 컬럼                           | 타입             | NULL | 설명                                                     |
| ---------------------------- | -------------- | ---- | ------------------------------------------------------ |
| INDEX_ID                     | NUMBER(12)     | N    | PK                                                     |
| TABLE_ID                     | NUMBER(12)     | N    | FK → TB_META_TABLE                                     |
| INDEX_NAME                   | VARCHAR2(128)  | N    | 인덱스명                                                   |
| INDEX_TYPE_CD                | VARCHAR2(20)   | N    | `CD_INDEX_TYPE`: NORMAL/UNIQUE/BITMAP/FUNCTION/REVERSE |
| TABLESPACE_NAME              | VARCHAR2(30)   | Y    | 테이블스페이스                                                |
| INI_TRANS                    | NUMBER(4)      | Y    | INITRANS (Oracle DDL storage clause 키워드)              |
| PCT_FREE                     | NUMBER(3)      | Y    | PCTFREE (Oracle DDL storage clause 키워드)               |
| PURPOSE_CD                   | VARCHAR2(20)   | N    | `CD_INDEX_PURPOSE`: PK/FK/SEARCH/JOIN/TUNING/SORT      |
| PERFORMANCE_NOTE             | VARCHAR2(4000) | Y    | 튜닝 이력(언제, 왜 생성·변경)                                     |
| CREATE_DDL                   | CLOB           | Y    | 인덱스 생성 DDL 원문                                          |
| STATUS_CD                    | VARCHAR2(10)   | N    | PLANNED/ACTIVE/DEPRECATED                              |
| CREATED_BY/AT, UPDATED_BY/AT | —              | N    | 감사 컬럼                                                  |


### 4.4 TB_META_INDEX_COLUMN — 인덱스-컬럼 매핑


| 컬럼              | 타입             | NULL | 설명          |
| --------------- | -------------- | ---- | ----------- |
| INDEX_ID        | NUMBER(12)     | N    | FK          |
| COLUMN_POS      | NUMBER(3)      | N    | 인덱스 내 컬럼 순서 |
| COLUMN_NAME     | VARCHAR2(128)  | N    | 컬럼명         |
| SORT_ORDER      | VARCHAR2(4)    | N    | ASC/DESC    |
| FUNC_EXPRESSION | VARCHAR2(2000) | Y    | 함수기반 인덱스 식  |


**PK**: (INDEX_ID, COLUMN_POS)

### 4.5 TB_META_SEQUENCE — 시퀀스 메타


| 컬럼                           | 타입            | NULL | 설명                                         |
| ---------------------------- | ------------- | ---- | ------------------------------------------ |
| SEQUENCE_ID                  | NUMBER(12)    | N    | PK                                         |
| SCHEMA_NAME                  | VARCHAR2(128)  | N    | 스키마                                        |
| SEQUENCE_NAME                | VARCHAR2(128) | N    | 시퀀스명                                       |
| MIN_VALUE                    | NUMBER        | Y    | MINVALUE                                   |
| MAX_VALUE                    | NUMBER        | Y    | MAXVALUE                                   |
| INCREMENT_BY                 | NUMBER        | N    | INCREMENT                                  |
| START_WITH                   | NUMBER        | Y    | 최초 시작값                                     |
| CACHE_SIZE                   | NUMBER        | Y    | CACHE                                      |
| CYCLE_YN                     | CHAR(1)       | N    | CYCLE                                      |
| ORDER_YN                     | CHAR(1)       | N    | ORDER                                      |
| PURPOSE_CD                   | VARCHAR2(20)  | N    | `CD_SEQUENCE_PURPOSE`: PK/BIZ_KEY/TEMP/ETC |
| USED_FOR_TABLE               | VARCHAR2(128) | Y    | 주 사용 테이블                                   |
| USED_FOR_COLUMN              | VARCHAR2(128) | Y    | 주 사용 컬럼                                    |
| CREATE_DDL                   | CLOB          | Y    | 시퀀스 생성 DDL 원문                              |
| STATUS_CD                    | VARCHAR2(10)  | N    | PLANNED/ACTIVE/DEPRECATED                  |
| CREATED_BY/AT, UPDATED_BY/AT | —             | N    | 감사 컬럼                                      |


**UNIQUE**: (SCHEMA_NAME, SEQUENCE_NAME)

### 4.6 TB_META_CODE — 공통코드


| 컬럼                           | 타입             | NULL | 설명                             |
| ---------------------------- | -------------- | ---- | ------------------------------ |
| CODE_GROUP                   | VARCHAR2(30)   | N    | 코드 그룹 (예: CD_RETENTION_PERIOD) |
| CODE_VALUE                   | VARCHAR2(30)   | N    | 코드 값                           |
| CODE_NAME                    | VARCHAR2(200)  | N    | 코드명                            |
| DESCRIPTION                  | VARCHAR2(2000) | Y    | 설명                             |
| SORT_ORDER                   | NUMBER(4)      | Y    | 정렬 순서                          |
| USE_YN                       | CHAR(1)        | N    | 사용 여부                          |
| CREATED_BY/AT, UPDATED_BY/AT | —              | N    | 감사 컬럼                          |


**PK**: (CODE_GROUP, CODE_VALUE)

---

## 5. 공통코드 정의 (스펙)

> ⚠️ 본 절은 **스펙 정의**만 다룬다. 실제 INSERT는 §6 DDL이 모두 적용된 뒤 **§6.9 공통코드 초기 적재**에서 수행한다.


| 코드 그룹                      | 코드 값                                            | 의미                                             |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------- |
| **CD_RETENTION_PERIOD**    | Y1 / Y3 / Y5 / Y10 / Y30 / PERM                 | 1/3/5/10/30년 / 영구                              |
| **CD_PCI_CATEGORY**        | IDENT / TRX / SCORE / ABILITY / PUBLIC          | 식별정보 / 신용거래 / 신용도 / 신용능력 / 공공정보 (신용정보법 시행령 분류) |
| **CD_SENSITIVITY**         | HIGH / MID / LOW                                | 컬럼 민감도 (TB_META_COLUMN.SENSITIVITY_CD, DEFAULT 'LOW') |
| **CD_ISOLATION_LEVEL**     | L1 / L2 / L3                                    | 운영망 / 준격리 / 완전격리                               |
| **CD_STATUS**              | PLANNED / ACTIVE / DEPRECATED                   | 계획/운영중/폐기예정                                    |
| **CD_INDEX_TYPE**          | NORMAL / UNIQUE / BITMAP / FUNCTION / REVERSE   | 인덱스 유형                                         |
| **CD_INDEX_PURPOSE**       | PK / FK / SEARCH / JOIN / TUNING / SORT         | 생성 목적                                          |
| **CD_SEQUENCE_PURPOSE**    | PK / BIZ_KEY / TEMP / ETC                       | 시퀀스 용도                                         |
| **CD_MASKING_RULE**        | NAME / RRN / PHONE / CARD / EMAIL / ADDR / FULL | 마스킹 규칙                                         |
| **CD_TOS**                 | *사내 이용약관 체계에 맞게 적재*                          | 연계 이용약관                                        |
| **CD_SERVICE**             | *사내 서비스 코드 체계에 맞게 적재 (UNASSIGNED 더미 코드 1건은 §6.9에서 자동 적재)* | 소유 서비스 |



> 본 INSERT 스크립트는 §6.9로 이동했다. 실행은 반드시 §6의 모든 DDL이 끝난 뒤 수행한다.

---

## 6. Oracle DDL (일괄 생성 스크립트)

### 6.1 시퀀스

> **실행 SQL**: [`sql/01_meta_ddl.sql`](sql/01_meta_ddl.sql) §6.1 시퀀스 부분

### 6.2 TB_META_CODE

> **실행 SQL**: [`sql/01_meta_ddl.sql`](sql/01_meta_ddl.sql) §6.2 TB_META_CODE 부분

### 6.3 TB_META_TABLE

> **실행 SQL**: [`sql/01_meta_ddl.sql`](sql/01_meta_ddl.sql) §6.3 TB_META_TABLE 부분

### 6.4 TB_META_COLUMN

> **실행 SQL**: [`sql/01_meta_ddl.sql`](sql/01_meta_ddl.sql) §6.4 TB_META_COLUMN 부분

### 6.5 TB_META_INDEX / TB_META_INDEX_COLUMN

> **실행 SQL**: [`sql/01_meta_ddl.sql`](sql/01_meta_ddl.sql) §6.5 TB_META_INDEX / TB_META_INDEX_COLUMN 부분

### 6.6 TB_META_SEQUENCE

> **실행 SQL**: [`sql/01_meta_ddl.sql`](sql/01_meta_ddl.sql) §6.6 TB_META_SEQUENCE 부분

### 6.7 히스토리 테이블 (공통 구조)

모든 히스토리 테이블은 원본 컬럼 + 아래 5개 컬럼을 **앞에** 추가한다.


| 컬럼        | 타입           | 설명                 |
| --------- | ------------ | ------------------ |
| HIST_ID        | NUMBER(16)     | PK (별도 SEQ)                              |
| HIST_TYPE      | CHAR(1)        | I / U / D                                  |
| HIST_AT        | TIMESTAMP      | 이력 발생 시각                             |
| HIST_BY        | VARCHAR2(128)   | 담당자 사번(SYS_CONTEXT CLIENT_IDENTIFIER) |
| CHANGE_REASON  | VARCHAR2(2000) | **변경 사유 (NOT NULL)**                   |


예시 (TB_META_TABLE_HIST):

> **실행 SQL**: [`sql/01_meta_ddl.sql`](sql/01_meta_ddl.sql) §6.7 TB_META_TABLE_HIST 및 잔여 HIST 5종 (COLUMN/INDEX/INDEX_COLUMN/SEQUENCE/CODE) 부분

`TB_META_COLUMN_HIST`, `TB_META_INDEX_HIST`, `TB_META_INDEX_COLUMN_HIST`, `TB_META_SEQUENCE_HIST`, `TB_META_CODE_HIST`도 동일한 패턴(원본 컬럼 + 5개 HIST 메타 + `CK_*_HIST_TYPE` CHECK 제약)으로 생성한다. 부록 A에 전체 DDL을 둔다.

### 6.8 히스토리 적재 방식

**원칙**: 폐쇄망·금융권 정책에 따라 **트리거·프로시저·함수는 사용하지 않는다.** 히스토리는 **DB 변경 도구가 원본 DML과 동일 트랜잭션 내에서 `*_HIST` 테이블에 인라인 INSERT**하는 방식으로 적재한다.

**도구가 생성하는 쿼리 패턴** (TB_META_TABLE 예시)

> **실행 SQL**: HIST 동시 적재 패턴은 본 적재 INSERT 직후 동일 트랜잭션에서 `*_HIST` 테이블에 INSERT — 실제 구현은 [`sql/02_common_code.sql`](sql/02_common_code.sql) (TB_META_CODE_HIST) · [`sql/03_initial_load.sql`](sql/03_initial_load.sql) §7.5 (TABLE/COLUMN/INDEX/INDEX_COLUMN/SEQUENCE_HIST) 참조

**HIST_TYPE 규칙**

| HIST_TYPE | 의미 | 적재 순서 |
| --- | --- | --- |
| `I` | INSERT | 원본 INSERT 후 동일 값을 HIST에 INSERT |
| `U` | UPDATE | 원본 UPDATE 후 변경 후 스냅샷을 HIST에 INSERT |
| `D` | DELETE (SOFT) | `STATUS_CD='DEPRECATED'` UPDATE 후 HIST에 `U` 또는 `D`로 적재 (정책에 따라) |
| `D` | DELETE (HARD) | **HIST INSERT를 먼저 수행하고** 원본을 DELETE/DROP |

> **주의**: HARD 삭제 시 순서가 뒤바뀌면 HIST에 기록이 남지 않는다. 도구는 HIST → 원본 DELETE 순서를 강제한다.

**HARD DELETE 순서 (TB_META_TABLE 기준)**

> `TB_META_COLUMN`과 `TB_META_INDEX`가 `TB_META_TABLE(TABLE_ID)`를 참조하므로 부모 테이블을 바로 삭제하면 ORA-02292가 발생할 수 있다. HARD DELETE가 정책적으로 승인된 경우에도 반드시 **자식 HIST 적재 → 자식 DELETE → 부모 HIST 적재 → 부모 DELETE** 순서로 수행한다. 아래는 순서 표준이며, 실제 도구는 각 `*_HIST` INSERT 컬럼을 §7.5와 동일하게 펼쳐 생성한다.

> **실행 SQL**: 본 적재 → HIST 적재를 테이블 단위로 번갈아 동일 트랜잭션으로 묶고 마지막에 일괄 `COMMIT;` — 실제 구현은 [`sql/02_common_code.sql`](sql/02_common_code.sql), [`sql/03_initial_load.sql`](sql/03_initial_load.sql) 파일 끝 `COMMIT;` 위치 참조
>
> **감사 대응**: `HIST_BY`에는 DB 로그인 계정이 아닌 **실제 담당자 사번**이 들어가야 한다. 도구가 접속 시 `DBMS_SESSION.SET_IDENTIFIER('사번')`을 호출하도록 표준화하면 `SYS_CONTEXT('USERENV','CLIENT_IDENTIFIER')`로 사번을 뽑아 `:EMP_ID` 파라미터에 바인딩한다.

**CHANGE_REASON 정책 (NOT NULL)**

모든 HIST 적재 경로에서 `CHANGE_REASON`은 **반드시 채워져야 한다.** 빈 문자열·NULL은 금지이며, 도구는 입력 시점에 검증한다.

| 경로 | 사유 입력 방법 | 예시 값 |
| --- | --- | --- |
| 담당자 수동 DML (UI) | **자유 입력 필수** (도구 UI에서 빈 값 제출 차단) | `"타 서비스 정책 변경으로 보관주기 5년→10년"` |
| 초기 적재 (§7) | 도구가 상수 주입 | `'INITIAL_LOAD'` |
| 카탈로그 재동기화 배치 | 도구가 상수 주입 | `'SYSTEM_SYNC'` |
| Drift 자동 교정 | 도구가 상수 주입 + Drift 보고서 ID 첨부 | `'DRIFT_FIX:#20260418-001'` |

> **권장**: 자유 입력 사유는 감사 추적성 확보를 위해 **최소 10자 이상 + 변경 대상·사유·근거**를 포함하도록 UI에서 가이드. 상수 주입은 자동화 경로에서만 허용하고, 담당자 수동 경로에서는 상수값을 막는다.

### 6.9 공통코드 초기 INSERT (TB_META_CODE + HIST 동시 적재)

> 본 절은 §6.1~6.8 DDL 적용 직후 1회 실행한다.
> - `USE_YN`/`CREATED_AT`/`UPDATED_AT`은 DDL DEFAULT 사용 → INSERT 컬럼 목록에서 생략.
> - `CD_SERVICE`는 사내 서비스 코드 체계에 의존하므로 본 스크립트는 **`UNASSIGNED` 더미 1건**만 적재한다(§7.1 호환). 실제 서비스 코드는 별도 배치로 적재.
> - 적재 직후 `TB_META_CODE_HIST`에 동일 스냅샷을 `HIST_TYPE='I'`, `CHANGE_REASON='INITIAL_LOAD'`로 동시 적재한다.
> - **재실행 안전성**: 본문 INSERT는 가독성을 위해 `VALUES` 형태로 표기하지만, **정식 실행본(`sql/02_common_code.sql`)은 모든 INSERT에 `WHERE NOT EXISTS (... CODE_GROUP/CODE_VALUE 매칭)` 가드와 HIST 측 `('I','INITIAL_LOAD')` 중복 가드를 적용**해 PK 충돌·누적 중복 없이 재실행 가능하다. 운영에서는 반드시 SQL 파일을 사용한다.
>
> 가드 적용 패턴 (예시):
> > **실행 SQL**: [`sql/02_common_code.sql`](sql/02_common_code.sql) — 코드그룹 10종(CD_RETENTION_PERIOD/CD_PCI_CATEGORY/CD_SENSITIVITY/CD_ISOLATION_LEVEL/CD_STATUS/CD_INDEX_TYPE/CD_INDEX_PURPOSE/CD_SEQUENCE_PURPOSE/CD_MASKING_RULE/CD_SERVICE) INSERT + TB_META_CODE_HIST 동시 적재. CD_TOS는 사내 약관 체계 기반 별도 적재 — [운영가이드.md](운영가이드.md) §2 참조

---

## 7. 초기 적재 (Oracle 시스템 카탈로그 → 메타 테이블)

> ⚠️ 1차 적재는 **구조 메타만** 채우고, 업무·법적 메타(PCI_YN, RETENTION 등)는 초기값(안전한 기본값 N / PERM 등)으로 들어간 뒤 서비스 담당자가 UPDATE. HIST에 동시 적재할 경우 `CHANGE_REASON = 'INITIAL_LOAD'`로 고정한다.

### 7.1 테이블 적재

> **필터 강화**: `BIN$%`(휴지통)/`TB_META_%`(자기 자신)에 더해 GTT(`TEMPORARY='Y'`), nested table(`NESTED='YES'`), IOT 부속 segment(`IOT_OVERFLOW`, `IOT_MAPPING`)도 제외한다. 정상 IOT 본 테이블(`IOT_TYPE='IOT'`)은 관리 대상에 포함한다. **`NOT EXISTS` 가드**로 재실행 시 UK(`SCHEMA_NAME, TABLE_NAME`) 충돌 없이 누락분만 적재된다.
>
> **VIEW_YN 채움**: `ALL_TABLES`로 들어온 행은 `VIEW_YN='N'`, `ALL_VIEWS`로 들어온 행은 `VIEW_YN='Y'`로 적재한다 (`UNION ALL`).

> **실행 SQL**: [`sql/03_initial_load.sql`](sql/03_initial_load.sql) §7.1 부분 (DESCRIPTION은 `SUBSTR(c.COMMENTS, 1, 2000)`로 2000자 절단하여 ORA-12899 방지)

### 7.2 컬럼 적재

> **보강 사항**:
> - PK/UK/FK 서브쿼리에 `ac.STATUS='ENABLED'` 필터 추가 (DISABLED 제약 제외)
> - `ALL_ENCRYPTED_COLUMNS` LEFT JOIN으로 **TDE 컬럼의 `ENCRYPTION_YN='Y'`/`ENCRYPTION_ALG`를 자동 채움**
> - `NOT EXISTS` 가드로 UK(`TABLE_ID, COLUMN_NAME`) 충돌 없이 재실행 가능

> **실행 SQL**: [`sql/03_initial_load.sql`](sql/03_initial_load.sql) §7.2 부분 (DESCRIPTION은 `SUBSTR(cc.COMMENTS, 1, 2000)`로 2000자 절단)

### 7.3 인덱스 적재

> **분류 로직 보정**:
> - `INDEX_TYPE_CD`: BITMAP/FUNCTION-BASED/REVERSE를 우선 매칭한 뒤 UNIQUE → 그 외 NORMAL. (이전: UNIQUE 우선이라 함수+UNIQUE/리버스+UNIQUE 인덱스의 유형 정보 손실)
> - `PURPOSE_CD`: `ALL_CONSTRAINTS`의 PK 제약과 `INDEX_NAME` 매칭으로 PK 판별. UK 자동 인덱스를 PK로 잘못 분류하던 문제 제거.
> - 함수기반 인덱스의 표현식은 `ALL_IND_EXPRESSIONS.COLUMN_EXPRESSION`(LONG)에 들어 있어 SQL-only 표준 스크립트에서는 `FUNC_EXPRESSION`을 `NULL`로 둔다. 사후 보강은 [`sql/06_func_idx_backfill.sql`](sql/06_func_idx_backfill.sql)의 SELECT로 LONG 값을 화면 표시한 뒤 운영자가 수기 UPDATE로 채우거나, DB 밖의 변경 도구가 별도 처리.
> - `NOT EXISTS` 가드로 UK 충돌 없이 재실행.

> **실행 SQL**: [`sql/03_initial_load.sql`](sql/03_initial_load.sql) §7.3.1 (헤더 `TB_META_INDEX`), §7.3.2 (`TB_META_INDEX_COLUMN`) 부분

### 7.4 시퀀스 적재

> **START_WITH 보강**: `ALL_SEQUENCES`에는 `START_WITH` 컬럼이 없으므로 현재 진행값 스냅샷인 `LAST_NUMBER`(다음 호출 시 반환할 값을 캐시 단위로 반올림한 값)를 적재한다. 정확한 최초 정의값이 필요하면 `DBMS_METADATA.GET_DDL` 결과 파싱 등 별도 보강 필요.

> **실행 SQL**: [`sql/03_initial_load.sql`](sql/03_initial_load.sql) §7.4 부분 (메타 시퀀스 `SEQ_META_%` 자기 자신 제외 가드 포함)

### 7.5 히스토리(HIST) 동시 적재

> ⚠️ 7.1~7.4 각 본 적재 직후, 방금 INSERT 된 메타 레코드를 `*_HIST`에 그대로 스냅샷. §6.8 적재 규약을 따르며, 초기 적재이므로 다음을 고정한다.
> - `HIST_TYPE = 'I'` (INSERT 경로)
> - `HIST_BY = USER` (Oracle pseudo-column: 초기 적재 세션 계정)
> - `CHANGE_REASON = 'INITIAL_LOAD'`
> - `HIST_AT = SYSTIMESTAMP` (DEFAULT 의존 가능하나 명시 권장)
>
> 실행 순서: **7.x 본 적재 → 7.5.x HIST 적재** 를 테이블 단위로 번갈아 수행하여 동일 트랜잭션으로 묶는다. 마지막에 일괄 `COMMIT;`.
>
> **재실행 안전성**: 모든 HIST INSERT는 `WHERE NOT EXISTS (... HIST_TYPE='I' AND CHANGE_REASON='INITIAL_LOAD')` 가드를 둔다. 초기 적재가 부분 실패 후 재실행되어도 동일 PK에 대한 'I'/'INITIAL_LOAD' 행이 한 번만 남는다(증분/운영 변경의 'U','D'는 별도 경로이므로 영향 없음).

#### 7.5.1 TB_META_TABLE_HIST

> **실행 SQL**: [`sql/03_initial_load.sql`](sql/03_initial_load.sql) §7.5.1 TB_META_TABLE_HIST 부분

#### 7.5.2 TB_META_COLUMN_HIST

> SQL-only 표준에서는 `DEFAULT_VALUE`를 초기 적재하지 않으므로 보통 `NULL`로 스냅샷된다.

> **실행 SQL**: [`sql/03_initial_load.sql`](sql/03_initial_load.sql) §7.5.2 TB_META_COLUMN_HIST 부분

#### 7.5.3 TB_META_INDEX_HIST

> **실행 SQL**: [`sql/03_initial_load.sql`](sql/03_initial_load.sql) §7.5.3 TB_META_INDEX_HIST 부분

#### 7.5.4 TB_META_INDEX_COLUMN_HIST

> SQL-only 표준에서는 함수기반 인덱스 표현식(`FUNC_EXPRESSION`)을 초기 적재하지 않으므로 보통 `NULL`로 스냅샷된다.

> **실행 SQL**: [`sql/03_initial_load.sql`](sql/03_initial_load.sql) §7.5.4 TB_META_INDEX_COLUMN_HIST 부분

#### 7.5.5 TB_META_SEQUENCE_HIST

> **실행 SQL**: [`sql/03_initial_load.sql`](sql/03_initial_load.sql) §7.5.5 TB_META_SEQUENCE_HIST 부분

---

## 8. Drift 감지 쿼리 (실제 DB ↔ 메타 비교)

### 8.1 메타에 없지만 실제 DB에는 있는 테이블

> §7.1과 동일한 필터(BIN$%, GTT, NESTED, IOT) 적용. 메타가 `DEPRECATED`인 행은 §8.4에서 별도 점검.

> **실행 SQL**: [`sql/04_drift_check.sql`](sql/04_drift_check.sql) §8.1 부분 (운영 점검용, 일 1회 배치 권장)

### 8.2 메타에는 ACTIVE인데 실제 DB에는 없는 객체

> `VIEW_YN`에 따라 카탈로그 뷰를 분기한다(`VIEW_YN='N'` → `ALL_TABLES`, `VIEW_YN='Y'` → `ALL_VIEWS`). 단순히 `ALL_TABLES`만 보면 메타에 등록된 뷰가 모두 false drift로 잡힌다.

> **실행 SQL**: [`sql/04_drift_check.sql`](sql/04_drift_check.sql) §8.2 부분

### 8.3 컬럼 정의 불일치 (타입·길이·정밀·스케일·NULL 허용·CHAR 시맨틱)

> **양방향 비교**: 메타에만 있는 컬럼·실제에만 있는 컬럼까지 검출하기 위해 두 방향 LEFT JOIN을 `UNION ALL`. NUMBER 계열은 `DATA_LENGTH=22` 고정이라 의미 없으므로 `DATA_PRECISION/DATA_SCALE`을, VARCHAR2는 `CHAR_LENGTH`(CHAR 시맨틱)까지 비교한다.

> **실행 SQL**: [`sql/04_drift_check.sql`](sql/04_drift_check.sql) §8.3 부분 (양방향 비교, 메타↔실제 컬럼 정의 불일치)

> **CHAR 시맨틱 추가 점검**(선택): `tc.CHAR_USED='C'`(VARCHAR2(N CHAR)) 대상은 `tc.CHAR_LENGTH`로 별도 비교 컬럼을 두어 byte/char 불일치를 잡아낸다.

> **권장 운영**: 위 3종 쿼리를 **일 1회 배치**로 실행해 결과를 `TB_META_DRIFT_REPORT` 테이블에 쌓거나, 담당자에게 메일 발송.

---

## 9. 메타 활용 — 비-PCI VIEW DDL 자동 생성

### 9.1 목적

메타에 등록된 VIEW(`VIEW_YN='Y'`)의 컬럼 중 **개인신용정보가 아닌 컬럼(`PCI_YN='N'`)만 노출**하는 새 VIEW DDL을 메타 기준으로 자동 생성한다. PCI 컬럼 누락을 사람의 검토 없이 메타 단일 진실에서 결정하기 위함.

### 9.2 워크플로 (필수 순서)

| 단계 | 행위자 | 작업 | 산출 |
|:---:|---|---|---|
| **1** | 데이터/보안 담당자 | `TB_META_TABLE.VIEW_YN`, `TB_META_COLUMN.PCI_YN` 검토·지정 (웹앱 탭1/탭2 또는 직접 UPDATE + HIST 동시 적재) | 메타 SSOT 확정 |
| **2** | 보안팀 | `sql/07a_view_review_sample.sql` SPOOL 실행 → 비-PCI 컬럼 실데이터 1건으로 PCI 오분류 검증 | 보안검토 시트 |
| **3** | 운영자 | `sql/07_view_gen_nonpci.sql` SPOOL 실행 → 결과 DDL 검토 | VIEW DDL 스크립트 |
| **4** | 운영자 | 검토된 DDL을 단일 세션에서 일괄 실행 | `VW_*` VIEW 생성/갱신 |

> **선행 조건**: 1단계가 완료되지 않은 상태에서 2단계를 실행하면 누락·오분류 컬럼이 그대로 VIEW에 반영된다. PCI 분류는 본 워크플로의 신뢰 경계이므로 반드시 1단계 종료 후 2단계로 진입.

### 9.3 규칙

| 항목 | 값 |
|---|---|
| 대상 메타 | `TB_META_TABLE.VIEW_YN='Y' AND STATUS_CD='ACTIVE'` |
| 노출 컬럼 | `TB_META_COLUMN.PCI_YN='N' AND STATUS_CD='ACTIVE'` |
| 컬럼 순서 | `TB_META_COLUMN.COLUMN_ORDER` 보존 |
| 생성 VIEW 이름 | `VW_<원본명>` (prefix) — 원본과의 네임스페이스 충돌 회피 |
| 출력 형식 | `CREATE VIEW <SCHEMA>.VW_<원본> AS SELECT … FROM <SCHEMA>.<원본>;` 1라인/1행 (OR REPLACE 미사용) |
| 실행 정책 | DDL 문자열만 생성, **자동 실행 안 함** (SPOOL → 검토 → 수동 실행) |

### 9.4 예외 / 사전 점검

- **모든 컬럼이 PCI인 경우** → 결과 행에서 자동 제외 (별도 점검 쿼리로 식별)
- **이름 길이 한도** → `LENGTHB(원본명) + 3 > 128` 인 후보는 사전 점검 쿼리로 검출 (Oracle 12.2+ 식별자 128byte)
- **LISTAGG 4000byte 한도** → 컬럼 수가 매우 많은 VIEW는 잘림 가능 → 점검 쿼리 NON_PCI_COL 수와 대조
- **재실행 / 갱신** → `CREATE VIEW`(OR REPLACE 미사용)이므로 동일명 VIEW가 이미 있으면 `ORA-00955`. **최초 생성은 정상**이며, 재배포 시 `DROP VIEW <SCHEMA>.VW_<원본>;` 선행 필요

> **실행 SQL**: [`sql/07_view_gen_nonpci.sql`](sql/07_view_gen_nonpci.sql) — (1) 본 쿼리 / (2) 비-PCI 컬럼 0개 점검 / (3) 식별자 한도 초과 후보 점검
>
> **검토 SQL**: [`sql/07a_view_review_sample.sql`](sql/07a_view_review_sample.sql) — 위 2단계(보안검토)용. (1) 테이블별 실데이터 시트 SELECT 생성 → SPOOL 후 실행, (2) 컬럼 분류 현황 점검. 비-PCI 컬럼의 실데이터 1건을 보여 PCI 오분류를 육안 검증.

---

## 부록 A. 잔여 HIST 테이블 DDL

§6.7의 `TB_META_TABLE_HIST`와 함께 아래 잔여 HIST 테이블까지 모두 생성해야 §6.9와 §7.5의 HIST 적재 SQL이 실행된다.

> **실행 SQL**: 잔여 HIST 테이블 5종(TB_META_COLUMN_HIST · TB_META_INDEX_HIST · TB_META_INDEX_COLUMN_HIST · TB_META_SEQUENCE_HIST · TB_META_CODE_HIST)의 DDL은 [`sql/01_meta_ddl.sql`](sql/01_meta_ddl.sql) §6.7에 모두 통합되어 있음. 본 부록은 §6.7 본문이 너무 길어지지 않도록 분리한 사양 정의이며 실행은 `sql/01_meta_ddl.sql` 단일 파일로 일괄 처리됨.

## 부록 B. SQL-only LONG 컬럼 처리 방침

정책상 트리거·프로시저·함수뿐 아니라 익명 PL/SQL 블록도 사용하지 않는다. 따라서 Oracle 카탈로그의 LONG 타입 컬럼은 표준 SQL 초기 적재에서 제외한다.

| 대상 | 카탈로그 컬럼 | 메타 컬럼 | 초기 적재값 | 비고 |
| --- | --- | --- | --- | --- |
| 컬럼 기본값 | `ALL_TAB_COLUMNS.DATA_DEFAULT` | `TB_META_COLUMN.DEFAULT_VALUE` | `NULL` | SQL 표현식으로 직접 변환 불가 |
| 함수기반 인덱스 식 | `ALL_IND_EXPRESSIONS.COLUMN_EXPRESSION` | `TB_META_INDEX_COLUMN.FUNC_EXPRESSION` | `NULL` | SQL 표현식으로 직접 변환 불가 |

필요 시 DB 밖의 변경 도구가 해당 값을 조회·변환한 뒤 원본 메타 테이블 UPDATE와 `*_HIST` INSERT를 같은 트랜잭션으로 수행한다. 이 경우 `CHANGE_REASON`은 `SYSTEM_SYNC` 또는 별도 동기화 사유를 사용한다.

---

**문서 끝 — v1.1**
