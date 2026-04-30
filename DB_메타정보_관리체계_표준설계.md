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

1. **단순성 우선**: 1차 버전은 Oracle 네이티브 기능(테이블 + 시퀀스)만으로 구성. **트리거·프로시저·함수 일체 사용 금지** (폐쇄망·금융권 정책).
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
| SCHEMA_NAME         | VARCHAR2(30)   | N    | 스키마명 (대문자)                                 |
| TABLE_NAME          | VARCHAR2(128)  | N    | 테이블명 (대문자)                                 |
| LOGICAL_NAME        | VARCHAR2(200)  | Y    | 한글/업무명                                     |
| DESCRIPTION         | VARCHAR2(2000) | Y    | 테이블 설명                                     |
| TABLE_TYPE_CD       | VARCHAR2(10)   | N    | `CD_TABLE_TYPE`: BASE / VIEW / MVIEW / EXT |
| SERVICE_CD          | VARCHAR2(20)   | N    | 소유 서비스 코드 (`CD_SERVICE`)                   |
| OWNER_EMP_ID        | VARCHAR2(20)   | N    | 주 담당자 사번                                    |
| SECONDARY_EMP_ID    | VARCHAR2(20)   | Y    | 부 담당자 사번                                    |
| KEY_TABLE_YN        | CHAR(1)        | N    | 키 관련 테이블 여부(Y/N)                           |
| ISOLATION_YN        | CHAR(1)        | N    | 격리 필요 여부                                   |
| ISOLATION_LEVEL_CD  | VARCHAR2(10)   | Y    | `CD_ISOLATION_LEVEL`: L1/L2/L3             |
| PII_YN              | CHAR(1)        | N    | 개인정보 포함                                     |
| PCI_YN              | CHAR(1)        | N    | 개인신용정보 포함                                  |
| RETENTION_PERIOD_CD | VARCHAR2(10)   | N    | `CD_RETENTION_PERIOD`                      |
| RETENTION_BASIS     | VARCHAR2(500)  | Y    | 보관주기 근거(법령·내규)                             |
| TOS_CD              | VARCHAR2(20)   | Y    | 연계 이용약관 코드 (`CD_TOS`)                     |
| STATUS_CD           | VARCHAR2(10)   | N    | `CD_STATUS`: PLANNED/ACTIVE/DEPRECATED     |
| REMARK              | VARCHAR2(4000) | Y    | 비고                                         |
| CREATED_BY          | VARCHAR2(20)   | N    | 생성자 사번                                     |
| CREATED_AT          | TIMESTAMP      | N    | 생성일시                                       |
| UPDATED_BY          | VARCHAR2(20)   | N    | 최종 수정자                                     |
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
| PII_YN                       | CHAR(1)        | N    | 개인정보 여부                                            |
| PCI_YN                       | CHAR(1)        | N    | 개인신용정보 여부                                         |
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
| INITRANS                     | NUMBER(4)      | Y    | INITRANS                                               |
| PCTFREE                      | NUMBER(3)      | Y    | PCTFREE                                                |
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
| SCHEMA_NAME                  | VARCHAR2(30)  | N    | 스키마                                        |
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
| **CD_ISOLATION_LEVEL**     | L1 / L2 / L3                                    | 운영망 / 준격리 / 완전격리                               |
| **CD_STATUS**              | PLANNED / ACTIVE / DEPRECATED                   | 계획/운영중/폐기예정                                    |
| **CD_TABLE_TYPE**          | BASE / VIEW / MVIEW / EXT                       | 테이블/뷰/MView/외부                                 |
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

```sql
CREATE SEQUENCE SEQ_META_TABLE_ID    START WITH 1 INCREMENT BY 1 CACHE 100  NOORDER NOCYCLE;
CREATE SEQUENCE SEQ_META_COLUMN_ID   START WITH 1 INCREMENT BY 1 CACHE 500  NOORDER NOCYCLE;
CREATE SEQUENCE SEQ_META_INDEX_ID    START WITH 1 INCREMENT BY 1 CACHE 100  NOORDER NOCYCLE;
CREATE SEQUENCE SEQ_META_SEQUENCE_ID START WITH 1 INCREMENT BY 1 CACHE 100  NOORDER NOCYCLE;
CREATE SEQUENCE SEQ_META_HIST_ID     START WITH 1 INCREMENT BY 1 CACHE 1000 NOORDER NOCYCLE;
```

### 6.2 TB_META_CODE

```sql
CREATE TABLE TB_META_CODE (
    CODE_GROUP    VARCHAR2(30)   NOT NULL,
    CODE_VALUE    VARCHAR2(30)   NOT NULL,
    CODE_NAME     VARCHAR2(200)  NOT NULL,
    DESCRIPTION   VARCHAR2(2000),
    SORT_ORDER    NUMBER(4),
    USE_YN        CHAR(1) DEFAULT 'Y' NOT NULL,
    CREATED_BY    VARCHAR2(20)   NOT NULL,
    CREATED_AT    TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATED_BY    VARCHAR2(20)   NOT NULL,
    UPDATED_AT    TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_META_CODE PRIMARY KEY (CODE_GROUP, CODE_VALUE),
    CONSTRAINT CK_META_CODE_USE CHECK (USE_YN IN ('Y','N'))
);
```

### 6.3 TB_META_TABLE

```sql
CREATE TABLE TB_META_TABLE (
    TABLE_ID             NUMBER(12)    NOT NULL,
    SCHEMA_NAME          VARCHAR2(30)  NOT NULL,
    TABLE_NAME           VARCHAR2(128) NOT NULL,
    LOGICAL_NAME         VARCHAR2(200),
    DESCRIPTION          VARCHAR2(2000),
    TABLE_TYPE_CD        VARCHAR2(10)  NOT NULL,
    SERVICE_CD           VARCHAR2(20)  NOT NULL,
    OWNER_EMP_ID         VARCHAR2(20)  NOT NULL,
    SECONDARY_EMP_ID     VARCHAR2(20),
    KEY_TABLE_YN         CHAR(1) DEFAULT 'N' NOT NULL,
    ISOLATION_YN         CHAR(1) DEFAULT 'N' NOT NULL,
    ISOLATION_LEVEL_CD   VARCHAR2(10),
    PII_YN               CHAR(1) DEFAULT 'N' NOT NULL,
    PCI_YN               CHAR(1) DEFAULT 'N' NOT NULL,
    RETENTION_PERIOD_CD  VARCHAR2(10)  NOT NULL,
    RETENTION_BASIS      VARCHAR2(500),
    TOS_CD               VARCHAR2(20),
    STATUS_CD            VARCHAR2(10)  DEFAULT 'ACTIVE' NOT NULL,
    REMARK               VARCHAR2(4000),
    CREATED_BY           VARCHAR2(20)  NOT NULL,
    CREATED_AT           TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATED_BY           VARCHAR2(20)  NOT NULL,
    UPDATED_AT           TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_META_TABLE PRIMARY KEY (TABLE_ID),
    CONSTRAINT UK_META_TABLE UNIQUE (SCHEMA_NAME, TABLE_NAME),
    CONSTRAINT CK_META_TABLE_YN CHECK (
        KEY_TABLE_YN IN ('Y','N') AND ISOLATION_YN IN ('Y','N')
        AND PII_YN IN ('Y','N') AND PCI_YN IN ('Y','N')
    )
);

CREATE INDEX IDX_META_TABLE_01 ON TB_META_TABLE (SERVICE_CD, STATUS_CD);
CREATE INDEX IDX_META_TABLE_02 ON TB_META_TABLE (OWNER_EMP_ID);
CREATE INDEX IDX_META_TABLE_03 ON TB_META_TABLE (PCI_YN, PII_YN);
```

### 6.4 TB_META_COLUMN

```sql
CREATE TABLE TB_META_COLUMN (
    COLUMN_ID              NUMBER(14)    NOT NULL,
    TABLE_ID               NUMBER(12)    NOT NULL,
    COLUMN_NAME            VARCHAR2(128) NOT NULL,
    COLUMN_ORDER           NUMBER(4)     NOT NULL,
    LOGICAL_NAME           VARCHAR2(200),
    DESCRIPTION            VARCHAR2(2000),
    DATA_TYPE              VARCHAR2(30)  NOT NULL,
    DATA_LENGTH            NUMBER(6),
    DATA_PRECISION         NUMBER(6),
    DATA_SCALE             NUMBER(6),
    NULLABLE_YN            CHAR(1)       NOT NULL,
    DEFAULT_VALUE          VARCHAR2(500),
    PK_YN                  CHAR(1) DEFAULT 'N' NOT NULL,
    UK_YN                  CHAR(1) DEFAULT 'N' NOT NULL,
    FK_YN                  CHAR(1) DEFAULT 'N' NOT NULL,
    PII_YN                 CHAR(1) DEFAULT 'N' NOT NULL,
    PCI_YN                 CHAR(1) DEFAULT 'N' NOT NULL,
    PCI_CATEGORY_CD        VARCHAR2(20),
    SENSITIVITY_CD         VARCHAR2(10)  DEFAULT 'LOW' NOT NULL,
    ENCRYPTION_YN          CHAR(1) DEFAULT 'N' NOT NULL,
    ENCRYPTION_ALG         VARCHAR2(50),
    MASKING_YN             CHAR(1) DEFAULT 'N' NOT NULL,
    MASKING_RULE_CD        VARCHAR2(20),
    RETENTION_PERIOD_CD    VARCHAR2(10),
    TOS_CD                 VARCHAR2(20),
    STATUS_CD              VARCHAR2(10)  DEFAULT 'ACTIVE' NOT NULL,
    REMARK                 VARCHAR2(4000),
    CREATED_BY             VARCHAR2(20)  NOT NULL,
    CREATED_AT             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATED_BY             VARCHAR2(20)  NOT NULL,
    UPDATED_AT             TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_META_COLUMN PRIMARY KEY (COLUMN_ID),
    CONSTRAINT UK_META_COLUMN UNIQUE (TABLE_ID, COLUMN_NAME),
    CONSTRAINT FK_META_COLUMN_TABLE FOREIGN KEY (TABLE_ID) REFERENCES TB_META_TABLE(TABLE_ID),
    CONSTRAINT CK_META_COLUMN_YN CHECK (
        NULLABLE_YN IN ('Y','N') AND PK_YN IN ('Y','N') AND UK_YN IN ('Y','N')
        AND FK_YN IN ('Y','N') AND PII_YN IN ('Y','N') AND PCI_YN IN ('Y','N')
        AND ENCRYPTION_YN IN ('Y','N') AND MASKING_YN IN ('Y','N')
    )
);

CREATE INDEX IDX_META_COLUMN_01 ON TB_META_COLUMN (TABLE_ID, COLUMN_ORDER);
CREATE INDEX IDX_META_COLUMN_02 ON TB_META_COLUMN (PCI_YN, PCI_CATEGORY_CD);
```

### 6.5 TB_META_INDEX / TB_META_INDEX_COLUMN

```sql
CREATE TABLE TB_META_INDEX (
    INDEX_ID           NUMBER(12)    NOT NULL,
    TABLE_ID           NUMBER(12)    NOT NULL,
    INDEX_NAME         VARCHAR2(128) NOT NULL,
    INDEX_TYPE_CD      VARCHAR2(20)  NOT NULL,
    TABLESPACE_NAME    VARCHAR2(30),
    INITRANS           NUMBER(4),
    PCTFREE            NUMBER(3),
    PURPOSE_CD         VARCHAR2(20)  NOT NULL,
    PERFORMANCE_NOTE   VARCHAR2(4000),
    CREATE_DDL         CLOB,
    STATUS_CD          VARCHAR2(10) DEFAULT 'ACTIVE' NOT NULL,
    CREATED_BY         VARCHAR2(20) NOT NULL,
    CREATED_AT         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATED_BY         VARCHAR2(20) NOT NULL,
    UPDATED_AT         TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_META_INDEX PRIMARY KEY (INDEX_ID),
    CONSTRAINT UK_META_INDEX UNIQUE (TABLE_ID, INDEX_NAME),
    CONSTRAINT FK_META_INDEX_TABLE FOREIGN KEY (TABLE_ID) REFERENCES TB_META_TABLE(TABLE_ID)
);

CREATE TABLE TB_META_INDEX_COLUMN (
    INDEX_ID         NUMBER(12)   NOT NULL,
    COLUMN_POS       NUMBER(3)    NOT NULL,
    COLUMN_NAME      VARCHAR2(128) NOT NULL,
    SORT_ORDER       VARCHAR2(4)  DEFAULT 'ASC' NOT NULL,
    FUNC_EXPRESSION  VARCHAR2(2000),
    CONSTRAINT PK_META_INDEX_COLUMN PRIMARY KEY (INDEX_ID, COLUMN_POS),
    CONSTRAINT FK_META_INDEX_COLUMN FOREIGN KEY (INDEX_ID) REFERENCES TB_META_INDEX(INDEX_ID),
    CONSTRAINT CK_META_INDEX_COLUMN CHECK (SORT_ORDER IN ('ASC','DESC'))
);
```

### 6.6 TB_META_SEQUENCE

```sql
CREATE TABLE TB_META_SEQUENCE (
    SEQUENCE_ID       NUMBER(12)   NOT NULL,
    SCHEMA_NAME       VARCHAR2(30) NOT NULL,
    SEQUENCE_NAME     VARCHAR2(128) NOT NULL,
    MIN_VALUE         NUMBER,
    MAX_VALUE         NUMBER,
    INCREMENT_BY      NUMBER       NOT NULL,
    START_WITH        NUMBER,
    CACHE_SIZE        NUMBER,
    CYCLE_YN          CHAR(1) DEFAULT 'N' NOT NULL,
    ORDER_YN          CHAR(1) DEFAULT 'N' NOT NULL,
    PURPOSE_CD        VARCHAR2(20) NOT NULL,
    USED_FOR_TABLE    VARCHAR2(128),
    USED_FOR_COLUMN   VARCHAR2(128),
    CREATE_DDL        CLOB,
    STATUS_CD         VARCHAR2(10) DEFAULT 'ACTIVE' NOT NULL,
    CREATED_BY        VARCHAR2(20) NOT NULL,
    CREATED_AT        TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATED_BY        VARCHAR2(20) NOT NULL,
    UPDATED_AT        TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
    CONSTRAINT PK_META_SEQUENCE PRIMARY KEY (SEQUENCE_ID),
    CONSTRAINT UK_META_SEQUENCE UNIQUE (SCHEMA_NAME, SEQUENCE_NAME),
    CONSTRAINT CK_META_SEQ_YN CHECK (CYCLE_YN IN ('Y','N') AND ORDER_YN IN ('Y','N'))
);
```

### 6.7 히스토리 테이블 (공통 구조)

모든 히스토리 테이블은 원본 컬럼 + 아래 5개 컬럼을 **앞에** 추가한다.


| 컬럼        | 타입           | 설명                 |
| --------- | ------------ | ------------------ |
| HIST_ID        | NUMBER(16)     | PK (별도 SEQ)                              |
| HIST_TYPE      | CHAR(1)        | I / U / D                                  |
| HIST_AT        | TIMESTAMP      | 이력 발생 시각                             |
| HIST_BY        | VARCHAR2(40)   | 담당자 사번(SYS_CONTEXT CLIENT_IDENTIFIER) |
| CHANGE_REASON  | VARCHAR2(2000) | **변경 사유 (NOT NULL)**                   |


예시 (TB_META_TABLE_HIST):

```sql
CREATE TABLE TB_META_TABLE_HIST (
    HIST_ID       NUMBER(16)     NOT NULL,
    HIST_TYPE     CHAR(1)        NOT NULL,
    HIST_AT       TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
    HIST_BY       VARCHAR2(40)   NOT NULL,
    CHANGE_REASON VARCHAR2(2000) NOT NULL,
    /* ↓ TB_META_TABLE 원본 컬럼 전체를 동일하게 */
    TABLE_ID             NUMBER(12),
    SCHEMA_NAME          VARCHAR2(30),
    TABLE_NAME           VARCHAR2(128),
    LOGICAL_NAME         VARCHAR2(200),
    DESCRIPTION          VARCHAR2(2000),
    TABLE_TYPE_CD        VARCHAR2(10),
    SERVICE_CD           VARCHAR2(20),
    OWNER_EMP_ID         VARCHAR2(20),
    SECONDARY_EMP_ID     VARCHAR2(20),
    KEY_TABLE_YN         CHAR(1),
    ISOLATION_YN         CHAR(1),
    ISOLATION_LEVEL_CD   VARCHAR2(10),
    PII_YN               CHAR(1),
    PCI_YN               CHAR(1),
    RETENTION_PERIOD_CD  VARCHAR2(10),
    RETENTION_BASIS      VARCHAR2(500),
    TOS_CD               VARCHAR2(20),
    STATUS_CD            VARCHAR2(10),
    REMARK               VARCHAR2(4000),
    CREATED_BY           VARCHAR2(20),
    CREATED_AT           TIMESTAMP,
    UPDATED_BY           VARCHAR2(20),
    UPDATED_AT           TIMESTAMP,
    CONSTRAINT PK_META_TABLE_HIST PRIMARY KEY (HIST_ID),
    CONSTRAINT CK_META_TABLE_HIST_TYPE CHECK (HIST_TYPE IN ('I','U','D'))
);
CREATE INDEX IDX_META_TABLE_HIST_01 ON TB_META_TABLE_HIST (TABLE_ID, HIST_AT);
```

`TB_META_COLUMN_HIST`, `TB_META_INDEX_HIST`, `TB_META_INDEX_COLUMN_HIST`, `TB_META_SEQUENCE_HIST`, `TB_META_CODE_HIST`도 동일한 패턴(원본 컬럼 + 5개 HIST 메타 + `CK_*_HIST_TYPE` CHECK 제약)으로 생성한다. 부록 A에 전체 DDL을 둔다.

### 6.8 히스토리 적재 방식

**원칙**: 폐쇄망·금융권 정책에 따라 **트리거·프로시저·함수는 사용하지 않는다.** 히스토리는 **DB 변경 도구가 원본 DML과 동일 트랜잭션 내에서 `*_HIST` 테이블에 인라인 INSERT**하는 방식으로 적재한다.

**도구가 생성하는 쿼리 패턴** (TB_META_TABLE 예시)

```sql
-- 1) 원본 변경 (담당자가 DML 수행)
UPDATE TB_META_TABLE
   SET LOGICAL_NAME = :NEW_LOGICAL_NAME,
       UPDATED_BY   = :EMP_ID,
       UPDATED_AT   = SYSTIMESTAMP
 WHERE TABLE_ID = :TABLE_ID;

-- 2) 같은 트랜잭션에서 HIST INSERT (변경 후 스냅샷 적재)
INSERT INTO TB_META_TABLE_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME, DESCRIPTION,
    TABLE_TYPE_CD, SERVICE_CD, OWNER_EMP_ID, SECONDARY_EMP_ID,
    KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PII_YN, PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
)
SELECT
    SEQ_META_HIST_ID.NEXTVAL, 'U', SYSTIMESTAMP, :EMP_ID, :CHANGE_REASON,
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME, DESCRIPTION,
    TABLE_TYPE_CD, SERVICE_CD, OWNER_EMP_ID, SECONDARY_EMP_ID,
    KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PII_YN, PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
FROM TB_META_TABLE
WHERE TABLE_ID = :TABLE_ID;

COMMIT;
```

**HIST_TYPE 규칙**

| HIST_TYPE | 의미 | 적재 순서 |
| --- | --- | --- |
| `I` | INSERT | 원본 INSERT 후 동일 값을 HIST에 INSERT |
| `U` | UPDATE | 원본 UPDATE 후 변경 후 스냅샷을 HIST에 INSERT |
| `D` | DELETE (SOFT) | `STATUS_CD='DEPRECATED'` UPDATE 후 HIST에 `U` 또는 `D`로 적재 (정책에 따라) |
| `D` | DELETE (HARD) | **HIST INSERT를 먼저 수행하고** 원본을 DELETE/DROP |

> **주의**: HARD 삭제 시 순서가 뒤바뀌면 HIST에 기록이 남지 않는다. 도구는 HIST → 원본 DELETE 순서를 강제한다.

**HARD DELETE 패턴 SQL (TB_META_TABLE 예시)**

```sql
-- 1) HIST에 삭제 직전 스냅샷을 'D'로 먼저 INSERT
INSERT INTO TB_META_TABLE_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME, DESCRIPTION,
    TABLE_TYPE_CD, SERVICE_CD, OWNER_EMP_ID, SECONDARY_EMP_ID,
    KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PII_YN, PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
)
SELECT
    SEQ_META_HIST_ID.NEXTVAL, 'D', SYSTIMESTAMP, :EMP_ID, :CHANGE_REASON,
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME, DESCRIPTION,
    TABLE_TYPE_CD, SERVICE_CD, OWNER_EMP_ID, SECONDARY_EMP_ID,
    KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PII_YN, PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
FROM TB_META_TABLE
WHERE TABLE_ID = :TABLE_ID;

-- 2) 동일 트랜잭션에서 원본 DELETE
DELETE FROM TB_META_TABLE WHERE TABLE_ID = :TABLE_ID;

COMMIT;
```
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
> ```sql
> INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
> SELECT 'CD_RETENTION_PERIOD','Y1','1년','1년',1,'INITIAL_LOAD','INITIAL_LOAD' FROM DUAL
> WHERE NOT EXISTS (SELECT 1 FROM TB_META_CODE WHERE CODE_GROUP='CD_RETENTION_PERIOD' AND CODE_VALUE='Y1');
> ```

```sql
-- 6.9.1 코드 적재
-- CD_RETENTION_PERIOD
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_RETENTION_PERIOD','Y1','1년','1년',1,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_RETENTION_PERIOD','Y3','3년','3년',2,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_RETENTION_PERIOD','Y5','5년','5년',3,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_RETENTION_PERIOD','Y10','10년','10년',4,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_RETENTION_PERIOD','Y30','30년','30년',5,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_RETENTION_PERIOD','PERM','영구','영구',6,'INITIAL_LOAD','INITIAL_LOAD');

-- CD_PCI_CATEGORY (신용정보법 시행령 분류)
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_PCI_CATEGORY','IDENT','식별정보','식별정보 (신용정보법 시행령 분류)',1,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_PCI_CATEGORY','TRX','신용거래','신용거래 (신용정보법 시행령 분류)',2,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_PCI_CATEGORY','SCORE','신용도','신용도 (신용정보법 시행령 분류)',3,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_PCI_CATEGORY','ABILITY','신용능력','신용능력 (신용정보법 시행령 분류)',4,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_PCI_CATEGORY','PUBLIC','공공정보','공공정보 (신용정보법 시행령 분류)',5,'INITIAL_LOAD','INITIAL_LOAD');

-- CD_ISOLATION_LEVEL
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_ISOLATION_LEVEL','L1','운영망','운영망',1,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_ISOLATION_LEVEL','L2','준격리','준격리',2,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_ISOLATION_LEVEL','L3','완전격리','완전격리',3,'INITIAL_LOAD','INITIAL_LOAD');

-- CD_STATUS
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_STATUS','PLANNED','계획','계획',1,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_STATUS','ACTIVE','운영중','운영중',2,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_STATUS','DEPRECATED','폐기예정','폐기예정',3,'INITIAL_LOAD','INITIAL_LOAD');

-- CD_TABLE_TYPE
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_TABLE_TYPE','BASE','테이블','테이블',1,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_TABLE_TYPE','VIEW','뷰','뷰',2,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_TABLE_TYPE','MVIEW','MView','MView',3,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_TABLE_TYPE','EXT','외부','외부',4,'INITIAL_LOAD','INITIAL_LOAD');

-- CD_INDEX_TYPE
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_INDEX_TYPE','NORMAL','NORMAL','일반 인덱스',1,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_INDEX_TYPE','UNIQUE','UNIQUE','고유 인덱스',2,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_INDEX_TYPE','BITMAP','BITMAP','비트맵 인덱스',3,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_INDEX_TYPE','FUNCTION','FUNCTION','함수기반 인덱스',4,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_INDEX_TYPE','REVERSE','REVERSE','리버스키 인덱스',5,'INITIAL_LOAD','INITIAL_LOAD');

-- CD_INDEX_PURPOSE
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_INDEX_PURPOSE','PK','PK','기본키',1,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_INDEX_PURPOSE','FK','FK','외래키',2,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_INDEX_PURPOSE','SEARCH','SEARCH','조회',3,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_INDEX_PURPOSE','JOIN','JOIN','조인',4,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_INDEX_PURPOSE','TUNING','TUNING','튜닝',5,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_INDEX_PURPOSE','SORT','SORT','정렬',6,'INITIAL_LOAD','INITIAL_LOAD');

-- CD_SEQUENCE_PURPOSE
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_SEQUENCE_PURPOSE','PK','PK','기본키 채번',1,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_SEQUENCE_PURPOSE','BIZ_KEY','BIZ_KEY','업무키 채번',2,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_SEQUENCE_PURPOSE','TEMP','TEMP','임시 채번',3,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_SEQUENCE_PURPOSE','ETC','ETC','기타',4,'INITIAL_LOAD','INITIAL_LOAD');

-- CD_MASKING_RULE
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_MASKING_RULE','NAME','이름','이름',1,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_MASKING_RULE','RRN','주민번호','주민번호',2,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_MASKING_RULE','PHONE','전화번호','전화번호',3,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_MASKING_RULE','CARD','카드번호','카드번호',4,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_MASKING_RULE','EMAIL','이메일','이메일',5,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_MASKING_RULE','ADDR','주소','주소',6,'INITIAL_LOAD','INITIAL_LOAD');
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_MASKING_RULE','FULL','전체마스킹','전체마스킹',7,'INITIAL_LOAD','INITIAL_LOAD');

-- CD_SERVICE: §7.1 호환을 위한 UNASSIGNED 더미 1건만 적재
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
VALUES ('CD_SERVICE','UNASSIGNED','미지정','초기 적재용 미지정 서비스(담당자 매핑 후 교체)',1,'INITIAL_LOAD','INITIAL_LOAD');

-- 6.9.2 HIST 동시 적재 ('I'/'INITIAL_LOAD' 중복 가드)
INSERT INTO TB_META_CODE_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION,
    SORT_ORDER, USE_YN,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
)
SELECT
    SEQ_META_HIST_ID.NEXTVAL, 'I', SYSTIMESTAMP, USER, 'INITIAL_LOAD',
    c.CODE_GROUP, c.CODE_VALUE, c.CODE_NAME, c.DESCRIPTION,
    c.SORT_ORDER, c.USE_YN,
    c.CREATED_BY, c.CREATED_AT, c.UPDATED_BY, c.UPDATED_AT
FROM TB_META_CODE c
WHERE NOT EXISTS (
    SELECT 1 FROM TB_META_CODE_HIST h
     WHERE h.CODE_GROUP    = c.CODE_GROUP
       AND h.CODE_VALUE    = c.CODE_VALUE
       AND h.HIST_TYPE     = 'I'
       AND h.CHANGE_REASON = 'INITIAL_LOAD'
);

COMMIT;
```

---

## 7. 초기 적재 (Oracle 시스템 카탈로그 → 메타 테이블)

> ⚠️ 1차 적재는 **구조 메타만** 채우고, 업무·법적 메타(PII_YN, RETENTION 등)는 초기값(안전한 기본값 N / PERM 등)으로 들어간 뒤 서비스 담당자가 UPDATE. HIST에 동시 적재할 경우 `CHANGE_REASON = 'INITIAL_LOAD'`로 고정한다.

### 7.1 테이블 적재

> **필터 강화**: `BIN$%`(휴지통)/`TB_META_%`(자기 자신)에 더해 GTT(`TEMPORARY='Y'`), nested table(`NESTED='YES'`), IOT overflow segment(`IOT_TYPE` 비어있지 않음)도 제외한다. **`NOT EXISTS` 가드**로 재실행 시 UK(`SCHEMA_NAME, TABLE_NAME`) 충돌 없이 누락분만 적재된다.

```sql
INSERT INTO TB_META_TABLE (
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME, DESCRIPTION,
    TABLE_TYPE_CD, SERVICE_CD, OWNER_EMP_ID,
    KEY_TABLE_YN, ISOLATION_YN, PII_YN, PCI_YN,
    RETENTION_PERIOD_CD, STATUS_CD,
    CREATED_BY, UPDATED_BY
)
SELECT
    SEQ_META_TABLE_ID.NEXTVAL,
    t.OWNER,
    t.TABLE_NAME,
    NULL,                                 -- LOGICAL_NAME: 이후 담당자 입력
    c.COMMENTS,                           -- ALL_TAB_COMMENTS
    'BASE',
    'UNASSIGNED',                         -- 이후 매핑
    'SYSTEM',                             -- 담당자 미지정
    'N','N','N','N',
    'Y5',                                 -- 안전 기본값: 5년 (추후 재분류)
    'ACTIVE',
    USER, USER
FROM ALL_TABLES t
LEFT JOIN ALL_TAB_COMMENTS c
       ON c.OWNER = t.OWNER AND c.TABLE_NAME = t.TABLE_NAME
WHERE t.OWNER IN ('SVC1','SVC2' /* 추가 스키마는 콤마와 함께 이어 작성 */)
  AND t.TABLE_NAME NOT LIKE 'BIN$%'        -- recycle bin 제외
  AND t.TABLE_NAME NOT LIKE 'TB_META_%'    -- 자기 자신 제외
  AND t.TEMPORARY = 'N'                    -- GTT 제외
  AND t.NESTED    = 'NO'                   -- nested table 제외
  AND t.IOT_TYPE IS NULL                   -- IOT overflow segment 제외
  AND NOT EXISTS (
        SELECT 1 FROM TB_META_TABLE m
         WHERE m.SCHEMA_NAME = t.OWNER
           AND m.TABLE_NAME  = t.TABLE_NAME
      )
;
```

### 7.2 컬럼 적재

> **보강 사항**:
> - PK/UK/FK 서브쿼리에 `ac.STATUS='ENABLED'` 필터 추가 (DISABLED 제약 제외)
> - `ALL_ENCRYPTED_COLUMNS` LEFT JOIN으로 **TDE 컬럼의 `ENCRYPTION_YN='Y'`/`ENCRYPTION_ALG`를 자동 채움**
> - `NOT EXISTS` 가드로 UK(`TABLE_ID, COLUMN_NAME`) 충돌 없이 재실행 가능

```sql
INSERT INTO TB_META_COLUMN (
    COLUMN_ID, TABLE_ID, COLUMN_NAME, COLUMN_ORDER,
    LOGICAL_NAME, DESCRIPTION,
    DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE,
    NULLABLE_YN, DEFAULT_VALUE,
    PK_YN, UK_YN, FK_YN,
    PII_YN, PCI_YN, SENSITIVITY_CD,
    ENCRYPTION_YN, ENCRYPTION_ALG, MASKING_YN,
    STATUS_CD, CREATED_BY, UPDATED_BY
)
SELECT
    SEQ_META_COLUMN_ID.NEXTVAL,
    mt.TABLE_ID,
    tc.COLUMN_NAME,
    tc.COLUMN_ID,
    NULL,
    cc.COMMENTS,
    tc.DATA_TYPE, tc.DATA_LENGTH, tc.DATA_PRECISION, tc.DATA_SCALE,
    CASE tc.NULLABLE WHEN 'Y' THEN 'Y' ELSE 'N' END,
    NULL,  -- DATA_DEFAULT는 LONG 타입이라 SQL에서 직접 SUBSTR 불가. 부록 B의 PL/SQL 후처리 배치로 별도 적재한다.
    NVL2(pk.COLUMN_NAME,'Y','N'),
    NVL2(uk.COLUMN_NAME,'Y','N'),
    NVL2(fk.COLUMN_NAME,'Y','N'),
    'N','N','LOW',
    NVL2(ec.COLUMN_NAME,'Y','N'),
    ec.ENCRYPTION_ALG,
    'N',
    'ACTIVE', USER, USER
FROM ALL_TAB_COLUMNS tc
JOIN TB_META_TABLE mt
      ON mt.SCHEMA_NAME = tc.OWNER AND mt.TABLE_NAME = tc.TABLE_NAME
LEFT JOIN ALL_COL_COMMENTS cc
      ON cc.OWNER = tc.OWNER AND cc.TABLE_NAME = tc.TABLE_NAME AND cc.COLUMN_NAME = tc.COLUMN_NAME
LEFT JOIN (
    SELECT DISTINCT acc.OWNER, acc.TABLE_NAME, acc.COLUMN_NAME
      FROM ALL_CONSTRAINTS ac
      JOIN ALL_CONS_COLUMNS acc
        ON ac.OWNER = acc.OWNER AND ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME
     WHERE ac.CONSTRAINT_TYPE = 'P' AND ac.STATUS = 'ENABLED'
) pk ON pk.OWNER = tc.OWNER AND pk.TABLE_NAME = tc.TABLE_NAME AND pk.COLUMN_NAME = tc.COLUMN_NAME
LEFT JOIN (
    SELECT DISTINCT acc.OWNER, acc.TABLE_NAME, acc.COLUMN_NAME
      FROM ALL_CONSTRAINTS ac
      JOIN ALL_CONS_COLUMNS acc
        ON ac.OWNER = acc.OWNER AND ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME
     WHERE ac.CONSTRAINT_TYPE = 'U' AND ac.STATUS = 'ENABLED'
) uk ON uk.OWNER = tc.OWNER AND uk.TABLE_NAME = tc.TABLE_NAME AND uk.COLUMN_NAME = tc.COLUMN_NAME
LEFT JOIN (
    SELECT DISTINCT acc.OWNER, acc.TABLE_NAME, acc.COLUMN_NAME
      FROM ALL_CONSTRAINTS ac
      JOIN ALL_CONS_COLUMNS acc
        ON ac.OWNER = acc.OWNER AND ac.CONSTRAINT_NAME = acc.CONSTRAINT_NAME
     WHERE ac.CONSTRAINT_TYPE = 'R' AND ac.STATUS = 'ENABLED'
) fk ON fk.OWNER = tc.OWNER AND fk.TABLE_NAME = tc.TABLE_NAME AND fk.COLUMN_NAME = tc.COLUMN_NAME
LEFT JOIN ALL_ENCRYPTED_COLUMNS ec
      ON ec.OWNER = tc.OWNER AND ec.TABLE_NAME = tc.TABLE_NAME AND ec.COLUMN_NAME = tc.COLUMN_NAME
WHERE NOT EXISTS (
    SELECT 1 FROM TB_META_COLUMN m
     WHERE m.TABLE_ID    = mt.TABLE_ID
       AND m.COLUMN_NAME = tc.COLUMN_NAME
)
;
```

### 7.3 인덱스 적재

> **분류 로직 보정**:
> - `INDEX_TYPE_CD`: BITMAP/FUNCTION-BASED/REVERSE를 우선 매칭한 뒤 UNIQUE → 그 외 NORMAL. (이전: UNIQUE 우선이라 함수+UNIQUE/리버스+UNIQUE 인덱스의 유형 정보 손실)
> - `PURPOSE_CD`: `ALL_CONSTRAINTS`의 PK 제약과 `INDEX_NAME` 매칭으로 PK 판별. UK 자동 인덱스를 PK로 잘못 분류하던 문제 제거.
> - 함수기반 인덱스의 표현식은 `ALL_IND_EXPRESSIONS.COLUMN_EXPRESSION`(LONG)에 들어 있어 SQL로 직접 적재할 수 없으므로, **§7.3.2 직후 PL/SQL 후처리**로 `FUNC_EXPRESSION`을 채운 뒤 §7.5.4 HIST를 적재한다.
> - `NOT EXISTS` 가드로 UK 충돌 없이 재실행.

```sql
-- 7.3.1 헤더
INSERT INTO TB_META_INDEX (
    INDEX_ID, TABLE_ID, INDEX_NAME, INDEX_TYPE_CD,
    TABLESPACE_NAME, PURPOSE_CD, STATUS_CD,
    CREATED_BY, UPDATED_BY
)
SELECT
    SEQ_META_INDEX_ID.NEXTVAL,
    mt.TABLE_ID,
    i.INDEX_NAME,
    CASE
      WHEN i.INDEX_TYPE = 'BITMAP'                 THEN 'BITMAP'
      WHEN i.INDEX_TYPE LIKE 'FUNCTION-BASED%'     THEN 'FUNCTION'
      WHEN i.INDEX_TYPE = 'NORMAL/REV'             THEN 'REVERSE'
      WHEN i.UNIQUENESS = 'UNIQUE'                 THEN 'UNIQUE'
      ELSE 'NORMAL'
    END,
    i.TABLESPACE_NAME,
    CASE WHEN pkc.CONSTRAINT_TYPE = 'P' THEN 'PK' ELSE 'SEARCH' END,
    'ACTIVE', USER, USER
FROM ALL_INDEXES i
JOIN TB_META_TABLE mt
      ON mt.SCHEMA_NAME = i.TABLE_OWNER AND mt.TABLE_NAME = i.TABLE_NAME
LEFT JOIN ALL_CONSTRAINTS pkc
       ON pkc.OWNER           = i.TABLE_OWNER
      AND pkc.INDEX_NAME      = i.INDEX_NAME
      AND pkc.CONSTRAINT_TYPE = 'P'
      AND pkc.STATUS          = 'ENABLED'
WHERE i.TABLE_OWNER IN ('SVC1','SVC2')
  AND NOT EXISTS (
        SELECT 1 FROM TB_META_INDEX m
         WHERE m.TABLE_ID   = mt.TABLE_ID
           AND m.INDEX_NAME = i.INDEX_NAME
      )
;

-- 7.3.2 컬럼
INSERT INTO TB_META_INDEX_COLUMN (INDEX_ID, COLUMN_POS, COLUMN_NAME, SORT_ORDER)
SELECT mi.INDEX_ID, ic.COLUMN_POSITION, ic.COLUMN_NAME, ic.DESCEND
FROM ALL_IND_COLUMNS ic
JOIN TB_META_TABLE mt
  ON mt.SCHEMA_NAME = ic.TABLE_OWNER AND mt.TABLE_NAME = ic.TABLE_NAME
JOIN TB_META_INDEX mi
  ON mi.TABLE_ID = mt.TABLE_ID AND mi.INDEX_NAME = ic.INDEX_NAME
WHERE ic.TABLE_OWNER IN ('SVC1','SVC2')
  AND NOT EXISTS (
        SELECT 1 FROM TB_META_INDEX_COLUMN m
         WHERE m.INDEX_ID   = mi.INDEX_ID
           AND m.COLUMN_POS = ic.COLUMN_POSITION
      )
;

-- 7.3.3 함수기반 인덱스 표현식 후처리 (LONG → VARCHAR2)
DECLARE
    TYPE t_id_arr   IS TABLE OF TB_META_INDEX_COLUMN.INDEX_ID%TYPE;
    TYPE t_pos_arr  IS TABLE OF TB_META_INDEX_COLUMN.COLUMN_POS%TYPE;
    TYPE t_expr_arr IS TABLE OF TB_META_INDEX_COLUMN.FUNC_EXPRESSION%TYPE;
    v_ids   t_id_arr   := t_id_arr();
    v_poss  t_pos_arr  := t_pos_arr();
    v_exprs t_expr_arr := t_expr_arr();
    v_expr  LONG;
BEGIN
    FOR r IN (
        SELECT mic.INDEX_ID, mic.COLUMN_POS,
               mi.INDEX_NAME, mt.SCHEMA_NAME
          FROM TB_META_INDEX_COLUMN mic
          JOIN TB_META_INDEX mi ON mi.INDEX_ID = mic.INDEX_ID
          JOIN TB_META_TABLE mt ON mt.TABLE_ID = mi.TABLE_ID
         WHERE mic.FUNC_EXPRESSION IS NULL
    ) LOOP
        BEGIN
            SELECT COLUMN_EXPRESSION
              INTO v_expr
              FROM ALL_IND_EXPRESSIONS
             WHERE INDEX_OWNER     = r.SCHEMA_NAME
               AND INDEX_NAME      = r.INDEX_NAME
               AND COLUMN_POSITION = r.COLUMN_POS;
            IF v_expr IS NOT NULL THEN
                v_ids.EXTEND;   v_ids(v_ids.LAST)     := r.INDEX_ID;
                v_poss.EXTEND;  v_poss(v_poss.LAST)   := r.COLUMN_POS;
                v_exprs.EXTEND; v_exprs(v_exprs.LAST) := SUBSTR(v_expr, 1, 2000);
            END IF;
        EXCEPTION WHEN NO_DATA_FOUND THEN NULL;
        END;
    END LOOP;

    IF v_ids.COUNT > 0 THEN
        FORALL i IN 1 .. v_ids.COUNT
            UPDATE TB_META_INDEX_COLUMN
               SET FUNC_EXPRESSION = v_exprs(i)
             WHERE INDEX_ID   = v_ids(i)
               AND COLUMN_POS = v_poss(i);
    END IF;
END;
/
```

### 7.4 시퀀스 적재

> **START_WITH 보강**: `ALL_SEQUENCES`에는 `START_WITH` 컬럼이 없으므로 현재 진행값 스냅샷인 `LAST_NUMBER`(다음 호출 시 반환할 값을 캐시 단위로 반올림한 값)를 적재한다. 정확한 최초 정의값이 필요하면 `DBMS_METADATA.GET_DDL` 결과 파싱 등 별도 보강 필요.

```sql
INSERT INTO TB_META_SEQUENCE (
    SEQUENCE_ID, SCHEMA_NAME, SEQUENCE_NAME,
    MIN_VALUE, MAX_VALUE, INCREMENT_BY, START_WITH, CACHE_SIZE,
    CYCLE_YN, ORDER_YN, PURPOSE_CD, STATUS_CD,
    CREATED_BY, UPDATED_BY
)
SELECT
    SEQ_META_SEQUENCE_ID.NEXTVAL,
    s.SEQUENCE_OWNER, s.SEQUENCE_NAME,
    s.MIN_VALUE, s.MAX_VALUE, s.INCREMENT_BY, s.LAST_NUMBER, s.CACHE_SIZE,
    CASE s.CYCLE_FLAG WHEN 'Y' THEN 'Y' ELSE 'N' END,
    CASE s.ORDER_FLAG WHEN 'Y' THEN 'Y' ELSE 'N' END,
    'ETC',                    -- 용도는 담당자 업데이트
    'ACTIVE', USER, USER
FROM ALL_SEQUENCES s
WHERE s.SEQUENCE_OWNER IN ('SVC1','SVC2')
  AND NOT EXISTS (
        SELECT 1 FROM TB_META_SEQUENCE m
         WHERE m.SCHEMA_NAME   = s.SEQUENCE_OWNER
           AND m.SEQUENCE_NAME = s.SEQUENCE_NAME
      )
;
```

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

```sql
INSERT INTO TB_META_TABLE_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME, DESCRIPTION,
    TABLE_TYPE_CD, SERVICE_CD, OWNER_EMP_ID, SECONDARY_EMP_ID,
    KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PII_YN, PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
)
SELECT
    SEQ_META_HIST_ID.NEXTVAL, 'I', SYSTIMESTAMP, USER, 'INITIAL_LOAD',
    t.TABLE_ID, t.SCHEMA_NAME, t.TABLE_NAME, t.LOGICAL_NAME, t.DESCRIPTION,
    t.TABLE_TYPE_CD, t.SERVICE_CD, t.OWNER_EMP_ID, t.SECONDARY_EMP_ID,
    t.KEY_TABLE_YN, t.ISOLATION_YN, t.ISOLATION_LEVEL_CD,
    t.PII_YN, t.PCI_YN, t.RETENTION_PERIOD_CD, t.RETENTION_BASIS, t.TOS_CD,
    t.STATUS_CD, t.REMARK,
    t.CREATED_BY, t.CREATED_AT, t.UPDATED_BY, t.UPDATED_AT
FROM TB_META_TABLE t
WHERE NOT EXISTS (
    SELECT 1 FROM TB_META_TABLE_HIST h
     WHERE h.TABLE_ID      = t.TABLE_ID
       AND h.HIST_TYPE     = 'I'
       AND h.CHANGE_REASON = 'INITIAL_LOAD'
)
;
```

#### 7.5.2 TB_META_COLUMN_HIST

> 부록 B의 `DEFAULT_VALUE` 후처리는 본 7.5.2 INSERT **이전에** 수행한다(부록 B 직후 'I' 스냅샷에 보정값까지 함께 들어감).

```sql
INSERT INTO TB_META_COLUMN_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    COLUMN_ID, TABLE_ID, COLUMN_NAME, COLUMN_ORDER,
    LOGICAL_NAME, DESCRIPTION,
    DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE,
    NULLABLE_YN, DEFAULT_VALUE,
    PK_YN, UK_YN, FK_YN,
    PII_YN, PCI_YN, PCI_CATEGORY_CD, SENSITIVITY_CD,
    ENCRYPTION_YN, ENCRYPTION_ALG, MASKING_YN, MASKING_RULE_CD,
    RETENTION_PERIOD_CD, TOS_CD, STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
)
SELECT
    SEQ_META_HIST_ID.NEXTVAL, 'I', SYSTIMESTAMP, USER, 'INITIAL_LOAD',
    c.COLUMN_ID, c.TABLE_ID, c.COLUMN_NAME, c.COLUMN_ORDER,
    c.LOGICAL_NAME, c.DESCRIPTION,
    c.DATA_TYPE, c.DATA_LENGTH, c.DATA_PRECISION, c.DATA_SCALE,
    c.NULLABLE_YN, c.DEFAULT_VALUE,
    c.PK_YN, c.UK_YN, c.FK_YN,
    c.PII_YN, c.PCI_YN, c.PCI_CATEGORY_CD, c.SENSITIVITY_CD,
    c.ENCRYPTION_YN, c.ENCRYPTION_ALG, c.MASKING_YN, c.MASKING_RULE_CD,
    c.RETENTION_PERIOD_CD, c.TOS_CD, c.STATUS_CD, c.REMARK,
    c.CREATED_BY, c.CREATED_AT, c.UPDATED_BY, c.UPDATED_AT
FROM TB_META_COLUMN c
WHERE NOT EXISTS (
    SELECT 1 FROM TB_META_COLUMN_HIST h
     WHERE h.COLUMN_ID     = c.COLUMN_ID
       AND h.HIST_TYPE     = 'I'
       AND h.CHANGE_REASON = 'INITIAL_LOAD'
)
;
```

#### 7.5.3 TB_META_INDEX_HIST

```sql
INSERT INTO TB_META_INDEX_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    INDEX_ID, TABLE_ID, INDEX_NAME, INDEX_TYPE_CD,
    TABLESPACE_NAME, INITRANS, PCTFREE,
    PURPOSE_CD, PERFORMANCE_NOTE, CREATE_DDL,
    STATUS_CD,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
)
SELECT
    SEQ_META_HIST_ID.NEXTVAL, 'I', SYSTIMESTAMP, USER, 'INITIAL_LOAD',
    x.INDEX_ID, x.TABLE_ID, x.INDEX_NAME, x.INDEX_TYPE_CD,
    x.TABLESPACE_NAME, x.INITRANS, x.PCTFREE,
    x.PURPOSE_CD, x.PERFORMANCE_NOTE, x.CREATE_DDL,
    x.STATUS_CD,
    x.CREATED_BY, x.CREATED_AT, x.UPDATED_BY, x.UPDATED_AT
FROM TB_META_INDEX x
WHERE NOT EXISTS (
    SELECT 1 FROM TB_META_INDEX_HIST h
     WHERE h.INDEX_ID      = x.INDEX_ID
       AND h.HIST_TYPE     = 'I'
       AND h.CHANGE_REASON = 'INITIAL_LOAD'
)
;
```

#### 7.5.4 TB_META_INDEX_COLUMN_HIST

> §7.3.3 함수 표현식 후처리 **이후에** 수행한다(`FUNC_EXPRESSION` 보정값까지 함께 'I' 스냅샷에 들어감).

```sql
INSERT INTO TB_META_INDEX_COLUMN_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    INDEX_ID, COLUMN_POS, COLUMN_NAME, SORT_ORDER, FUNC_EXPRESSION
)
SELECT
    SEQ_META_HIST_ID.NEXTVAL, 'I', SYSTIMESTAMP, USER, 'INITIAL_LOAD',
    ic.INDEX_ID, ic.COLUMN_POS, ic.COLUMN_NAME, ic.SORT_ORDER, ic.FUNC_EXPRESSION
FROM TB_META_INDEX_COLUMN ic
WHERE NOT EXISTS (
    SELECT 1 FROM TB_META_INDEX_COLUMN_HIST h
     WHERE h.INDEX_ID      = ic.INDEX_ID
       AND h.COLUMN_POS    = ic.COLUMN_POS
       AND h.HIST_TYPE     = 'I'
       AND h.CHANGE_REASON = 'INITIAL_LOAD'
)
;
```

#### 7.5.5 TB_META_SEQUENCE_HIST

```sql
INSERT INTO TB_META_SEQUENCE_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    SEQUENCE_ID, SCHEMA_NAME, SEQUENCE_NAME,
    MIN_VALUE, MAX_VALUE, INCREMENT_BY, START_WITH, CACHE_SIZE,
    CYCLE_YN, ORDER_YN, PURPOSE_CD,
    USED_FOR_TABLE, USED_FOR_COLUMN, CREATE_DDL, STATUS_CD,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
)
SELECT
    SEQ_META_HIST_ID.NEXTVAL, 'I', SYSTIMESTAMP, USER, 'INITIAL_LOAD',
    q.SEQUENCE_ID, q.SCHEMA_NAME, q.SEQUENCE_NAME,
    q.MIN_VALUE, q.MAX_VALUE, q.INCREMENT_BY, q.START_WITH, q.CACHE_SIZE,
    q.CYCLE_YN, q.ORDER_YN, q.PURPOSE_CD,
    q.USED_FOR_TABLE, q.USED_FOR_COLUMN, q.CREATE_DDL, q.STATUS_CD,
    q.CREATED_BY, q.CREATED_AT, q.UPDATED_BY, q.UPDATED_AT
FROM TB_META_SEQUENCE q
WHERE NOT EXISTS (
    SELECT 1 FROM TB_META_SEQUENCE_HIST h
     WHERE h.SEQUENCE_ID   = q.SEQUENCE_ID
       AND h.HIST_TYPE     = 'I'
       AND h.CHANGE_REASON = 'INITIAL_LOAD'
)
;

COMMIT;
```

---

## 8. Drift 감지 쿼리 (실제 DB ↔ 메타 비교)

### 8.1 메타에 없지만 실제 DB에는 있는 테이블

> §7.1과 동일한 필터(BIN$%, GTT, NESTED, IOT) 적용. 메타가 `DEPRECATED`인 행은 §8.4에서 별도 점검.

```sql
SELECT t.OWNER, t.TABLE_NAME
FROM ALL_TABLES t
LEFT JOIN TB_META_TABLE mt
       ON mt.SCHEMA_NAME = t.OWNER AND mt.TABLE_NAME = t.TABLE_NAME
WHERE t.OWNER IN ('SVC1','SVC2')
  AND mt.TABLE_ID IS NULL
  AND t.TABLE_NAME NOT LIKE 'BIN$%'
  AND t.TABLE_NAME NOT LIKE 'TB_META_%'
  AND t.TEMPORARY = 'N'
  AND t.NESTED    = 'NO'
  AND t.IOT_TYPE IS NULL
;
```

### 8.2 메타에는 ACTIVE인데 실제 DB에는 없는 객체

> `TABLE_TYPE_CD`별로 카탈로그 뷰를 분기해야 한다(BASE/EXT는 `ALL_TABLES`, VIEW는 `ALL_VIEWS`, MVIEW는 `ALL_MVIEWS`). 단순히 `ALL_TABLES`만 보면 메타에 등록된 뷰/MView가 모두 false drift로 잡힌다.

```sql
SELECT mt.SCHEMA_NAME, mt.TABLE_NAME, mt.TABLE_TYPE_CD
FROM TB_META_TABLE mt
LEFT JOIN ALL_TABLES t
       ON mt.TABLE_TYPE_CD IN ('BASE','EXT')
      AND t.OWNER = mt.SCHEMA_NAME AND t.TABLE_NAME = mt.TABLE_NAME
LEFT JOIN ALL_VIEWS v
       ON mt.TABLE_TYPE_CD = 'VIEW'
      AND v.OWNER = mt.SCHEMA_NAME AND v.VIEW_NAME = mt.TABLE_NAME
LEFT JOIN ALL_MVIEWS mv
       ON mt.TABLE_TYPE_CD = 'MVIEW'
      AND mv.OWNER = mt.SCHEMA_NAME AND mv.MVIEW_NAME = mt.TABLE_NAME
WHERE mt.STATUS_CD = 'ACTIVE'
  AND t.TABLE_NAME  IS NULL
  AND v.VIEW_NAME   IS NULL
  AND mv.MVIEW_NAME IS NULL
;
```

### 8.3 컬럼 정의 불일치 (타입·길이·정밀·스케일·NULL 허용·CHAR 시맨틱)

> **양방향 비교**: 메타에만 있는 컬럼·실제에만 있는 컬럼까지 검출하기 위해 두 방향 LEFT JOIN을 `UNION ALL`. NUMBER 계열은 `DATA_LENGTH=22` 고정이라 의미 없으므로 `DATA_PRECISION/DATA_SCALE`을, VARCHAR2는 `CHAR_LENGTH`(CHAR 시맨틱)까지 비교한다.

```sql
-- (a) 메타에 있는 컬럼 vs 실제: 정의 불일치 또는 실제 누락
SELECT mt.SCHEMA_NAME, mt.TABLE_NAME, mc.COLUMN_NAME,
       mc.DATA_TYPE       meta_type,    tc.DATA_TYPE       real_type,
       mc.DATA_LENGTH     meta_len,     tc.DATA_LENGTH     real_len,
       mc.DATA_PRECISION  meta_prec,    tc.DATA_PRECISION  real_prec,
       mc.DATA_SCALE      meta_scale,   tc.DATA_SCALE      real_scale,
       mc.NULLABLE_YN     meta_null,
       CASE tc.NULLABLE WHEN 'Y' THEN 'Y' ELSE 'N' END real_null,
       CASE WHEN tc.COLUMN_NAME IS NULL THEN 'MISSING_IN_DB' ELSE 'MISMATCH' END diff_kind
FROM TB_META_COLUMN mc
JOIN TB_META_TABLE  mt ON mt.TABLE_ID = mc.TABLE_ID
LEFT JOIN ALL_TAB_COLUMNS tc
       ON tc.OWNER = mt.SCHEMA_NAME
      AND tc.TABLE_NAME = mt.TABLE_NAME
      AND tc.COLUMN_NAME = mc.COLUMN_NAME
WHERE mt.STATUS_CD = 'ACTIVE'
  AND mc.STATUS_CD = 'ACTIVE'
  AND (
        tc.COLUMN_NAME IS NULL
     OR mc.DATA_TYPE   <> tc.DATA_TYPE
     OR NVL(mc.DATA_LENGTH,0)    <> NVL(tc.DATA_LENGTH,0)
     OR NVL(mc.DATA_PRECISION,-1)<> NVL(tc.DATA_PRECISION,-1)
     OR NVL(mc.DATA_SCALE,-1)    <> NVL(tc.DATA_SCALE,-1)
     OR mc.NULLABLE_YN <> CASE tc.NULLABLE WHEN 'Y' THEN 'Y' ELSE 'N' END
  )
UNION ALL
-- (b) 실제에는 있는데 메타에 없음
SELECT tc.OWNER, tc.TABLE_NAME, tc.COLUMN_NAME,
       NULL, tc.DATA_TYPE,
       NULL, tc.DATA_LENGTH,
       NULL, tc.DATA_PRECISION,
       NULL, tc.DATA_SCALE,
       NULL, CASE tc.NULLABLE WHEN 'Y' THEN 'Y' ELSE 'N' END,
       'MISSING_IN_META'
FROM ALL_TAB_COLUMNS tc
JOIN TB_META_TABLE  mt
  ON mt.SCHEMA_NAME = tc.OWNER AND mt.TABLE_NAME = tc.TABLE_NAME
LEFT JOIN TB_META_COLUMN mc
       ON mc.TABLE_ID    = mt.TABLE_ID
      AND mc.COLUMN_NAME = tc.COLUMN_NAME
WHERE mt.STATUS_CD = 'ACTIVE'
  AND mc.COLUMN_ID IS NULL
;
```

> **CHAR 시맨틱 추가 점검**(선택): `tc.CHAR_USED='C'`(VARCHAR2(N CHAR)) 대상은 `tc.CHAR_LENGTH`로 별도 비교 컬럼을 두어 byte/char 불일치를 잡아낸다.

> **권장 운영**: 위 3종 쿼리를 **일 1회 배치**로 실행해 결과를 `TB_META_DRIFT_REPORT` 테이블에 쌓거나, 담당자에게 메일 발송.

---

---

## 부록 A. 잔여 HIST 테이블 DDL

§6.7의 `TB_META_TABLE_HIST`와 함께 아래 잔여 HIST 테이블까지 모두 생성해야 §6.9와 §7.5의 HIST 적재 SQL이 실행된다.

```sql
CREATE TABLE TB_META_COLUMN_HIST (
    HIST_ID       NUMBER(16)     NOT NULL,
    HIST_TYPE     CHAR(1)        NOT NULL,
    HIST_AT       TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
    HIST_BY       VARCHAR2(40)   NOT NULL,
    CHANGE_REASON VARCHAR2(2000) NOT NULL,
    COLUMN_ID              NUMBER(14),
    TABLE_ID               NUMBER(12),
    COLUMN_NAME            VARCHAR2(128),
    COLUMN_ORDER           NUMBER(4),
    LOGICAL_NAME           VARCHAR2(200),
    DESCRIPTION            VARCHAR2(2000),
    DATA_TYPE              VARCHAR2(30),
    DATA_LENGTH            NUMBER(6),
    DATA_PRECISION         NUMBER(6),
    DATA_SCALE             NUMBER(6),
    NULLABLE_YN            CHAR(1),
    DEFAULT_VALUE          VARCHAR2(500),
    PK_YN                  CHAR(1),
    UK_YN                  CHAR(1),
    FK_YN                  CHAR(1),
    PII_YN                 CHAR(1),
    PCI_YN                 CHAR(1),
    PCI_CATEGORY_CD        VARCHAR2(20),
    SENSITIVITY_CD         VARCHAR2(10),
    ENCRYPTION_YN          CHAR(1),
    ENCRYPTION_ALG         VARCHAR2(50),
    MASKING_YN             CHAR(1),
    MASKING_RULE_CD        VARCHAR2(20),
    RETENTION_PERIOD_CD    VARCHAR2(10),
    TOS_CD                 VARCHAR2(20),
    STATUS_CD              VARCHAR2(10),
    REMARK                 VARCHAR2(4000),
    CREATED_BY             VARCHAR2(20),
    CREATED_AT             TIMESTAMP,
    UPDATED_BY             VARCHAR2(20),
    UPDATED_AT             TIMESTAMP,
    CONSTRAINT PK_META_COLUMN_HIST PRIMARY KEY (HIST_ID),
    CONSTRAINT CK_META_COLUMN_HIST_TYPE CHECK (HIST_TYPE IN ('I','U','D'))
);
CREATE INDEX IDX_META_COLUMN_HIST_01 ON TB_META_COLUMN_HIST (COLUMN_ID, HIST_AT);
CREATE INDEX IDX_META_COLUMN_HIST_02 ON TB_META_COLUMN_HIST (TABLE_ID, HIST_AT);

CREATE TABLE TB_META_INDEX_HIST (
    HIST_ID       NUMBER(16)     NOT NULL,
    HIST_TYPE     CHAR(1)        NOT NULL,
    HIST_AT       TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
    HIST_BY       VARCHAR2(40)   NOT NULL,
    CHANGE_REASON VARCHAR2(2000) NOT NULL,
    INDEX_ID           NUMBER(12),
    TABLE_ID           NUMBER(12),
    INDEX_NAME         VARCHAR2(128),
    INDEX_TYPE_CD      VARCHAR2(20),
    TABLESPACE_NAME    VARCHAR2(30),
    INITRANS           NUMBER(4),
    PCTFREE            NUMBER(3),
    PURPOSE_CD         VARCHAR2(20),
    PERFORMANCE_NOTE   VARCHAR2(4000),
    CREATE_DDL         CLOB,
    STATUS_CD          VARCHAR2(10),
    CREATED_BY         VARCHAR2(20),
    CREATED_AT         TIMESTAMP,
    UPDATED_BY         VARCHAR2(20),
    UPDATED_AT         TIMESTAMP,
    CONSTRAINT PK_META_INDEX_HIST PRIMARY KEY (HIST_ID),
    CONSTRAINT CK_META_INDEX_HIST_TYPE CHECK (HIST_TYPE IN ('I','U','D'))
);
CREATE INDEX IDX_META_INDEX_HIST_01 ON TB_META_INDEX_HIST (INDEX_ID, HIST_AT);

CREATE TABLE TB_META_INDEX_COLUMN_HIST (
    HIST_ID       NUMBER(16)     NOT NULL,
    HIST_TYPE     CHAR(1)        NOT NULL,
    HIST_AT       TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
    HIST_BY       VARCHAR2(40)   NOT NULL,
    CHANGE_REASON VARCHAR2(2000) NOT NULL,
    INDEX_ID         NUMBER(12),
    COLUMN_POS       NUMBER(3),
    COLUMN_NAME      VARCHAR2(128),
    SORT_ORDER       VARCHAR2(4),
    FUNC_EXPRESSION  VARCHAR2(2000),
    CONSTRAINT PK_META_INDEX_COLUMN_HIST PRIMARY KEY (HIST_ID),
    CONSTRAINT CK_META_INDEX_COLUMN_HIST_TYPE CHECK (HIST_TYPE IN ('I','U','D'))
);
CREATE INDEX IDX_META_INDEX_COLUMN_HIST_01 ON TB_META_INDEX_COLUMN_HIST (INDEX_ID, HIST_AT);

CREATE TABLE TB_META_SEQUENCE_HIST (
    HIST_ID       NUMBER(16)     NOT NULL,
    HIST_TYPE     CHAR(1)        NOT NULL,
    HIST_AT       TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
    HIST_BY       VARCHAR2(40)   NOT NULL,
    CHANGE_REASON VARCHAR2(2000) NOT NULL,
    SEQUENCE_ID       NUMBER(12),
    SCHEMA_NAME       VARCHAR2(30),
    SEQUENCE_NAME     VARCHAR2(128),
    MIN_VALUE         NUMBER,
    MAX_VALUE         NUMBER,
    INCREMENT_BY      NUMBER,
    START_WITH        NUMBER,
    CACHE_SIZE        NUMBER,
    CYCLE_YN          CHAR(1),
    ORDER_YN          CHAR(1),
    PURPOSE_CD        VARCHAR2(20),
    USED_FOR_TABLE    VARCHAR2(128),
    USED_FOR_COLUMN   VARCHAR2(128),
    CREATE_DDL        CLOB,
    STATUS_CD         VARCHAR2(10),
    CREATED_BY        VARCHAR2(20),
    CREATED_AT        TIMESTAMP,
    UPDATED_BY        VARCHAR2(20),
    UPDATED_AT        TIMESTAMP,
    CONSTRAINT PK_META_SEQUENCE_HIST PRIMARY KEY (HIST_ID),
    CONSTRAINT CK_META_SEQUENCE_HIST_TYPE CHECK (HIST_TYPE IN ('I','U','D'))
);
CREATE INDEX IDX_META_SEQUENCE_HIST_01 ON TB_META_SEQUENCE_HIST (SEQUENCE_ID, HIST_AT);

CREATE TABLE TB_META_CODE_HIST (
    HIST_ID       NUMBER(16)     NOT NULL,
    HIST_TYPE     CHAR(1)        NOT NULL,
    HIST_AT       TIMESTAMP      DEFAULT SYSTIMESTAMP NOT NULL,
    HIST_BY       VARCHAR2(40)   NOT NULL,
    CHANGE_REASON VARCHAR2(2000) NOT NULL,
    CODE_GROUP    VARCHAR2(30),
    CODE_VALUE    VARCHAR2(30),
    CODE_NAME     VARCHAR2(200),
    DESCRIPTION   VARCHAR2(2000),
    SORT_ORDER    NUMBER(4),
    USE_YN        CHAR(1),
    CREATED_BY    VARCHAR2(20),
    CREATED_AT    TIMESTAMP,
    UPDATED_BY    VARCHAR2(20),
    UPDATED_AT    TIMESTAMP,
    CONSTRAINT PK_META_CODE_HIST PRIMARY KEY (HIST_ID),
    CONSTRAINT CK_META_CODE_HIST_TYPE CHECK (HIST_TYPE IN ('I','U','D'))
);
CREATE INDEX IDX_META_CODE_HIST_01 ON TB_META_CODE_HIST (CODE_GROUP, CODE_VALUE, HIST_AT);
```

## 부록 B. DATA_DEFAULT(LONG) 후처리 PL/SQL

`ALL_TAB_COLUMNS.DATA_DEFAULT`는 LONG 타입이라 SQL의 `SUBSTR`/표현식이 직접 통하지 않는다(ORA-00932). 초기 적재(§7.2) 본 INSERT 직후, **§7.5.2 HIST INSERT 이전에** 다음 PL/SQL을 1회 실행해 `DEFAULT_VALUE`를 채운다. 이 순서를 지키면 §7.5.2의 'I' 스냅샷에 보정값까지 포함되어 별도 'U' HIST를 남길 필요가 없다.

```sql
DECLARE
    TYPE t_id_arr  IS TABLE OF TB_META_COLUMN.COLUMN_ID%TYPE;
    TYPE t_def_arr IS TABLE OF TB_META_COLUMN.DEFAULT_VALUE%TYPE;
    v_ids  t_id_arr  := t_id_arr();
    v_defs t_def_arr := t_def_arr();
    v_default LONG;
BEGIN
    FOR r IN (
        SELECT mc.COLUMN_ID, mt.SCHEMA_NAME, mt.TABLE_NAME, mc.COLUMN_NAME
          FROM TB_META_COLUMN mc
          JOIN TB_META_TABLE  mt ON mt.TABLE_ID = mc.TABLE_ID
         WHERE mc.DEFAULT_VALUE IS NULL
    ) LOOP
        BEGIN
            SELECT DATA_DEFAULT
              INTO v_default
              FROM ALL_TAB_COLUMNS
             WHERE OWNER       = r.SCHEMA_NAME
               AND TABLE_NAME  = r.TABLE_NAME
               AND COLUMN_NAME = r.COLUMN_NAME;
            IF v_default IS NOT NULL THEN
                v_ids.EXTEND;  v_ids(v_ids.LAST)   := r.COLUMN_ID;
                v_defs.EXTEND; v_defs(v_defs.LAST) := SUBSTR(v_default, 1, 500);
            END IF;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN NULL;
        END;
    END LOOP;

    IF v_ids.COUNT > 0 THEN
        FORALL i IN 1 .. v_ids.COUNT
            UPDATE TB_META_COLUMN
               SET DEFAULT_VALUE = v_defs(i),
                   UPDATED_BY    = 'INITIAL_LOAD',
                   UPDATED_AT    = SYSTIMESTAMP
             WHERE COLUMN_ID = v_ids(i);
    END IF;

    COMMIT;
END;
/
```

> - PL/SQL 변수에 LONG을 받으면 자동으로 VARCHAR2(32760)로 변환되므로 `SUBSTR` 사용이 가능해진다. LONG SELECT는 BULK COLLECT가 불가하므로 행단위 SELECT + FORALL UPDATE 패턴을 사용한다.
> - 본 블록은 폐쇄망·금융권의 트리거/프로시저 금지 정책에서 **"저장 객체로 남기지 않는 1회성 익명 블록"** 으로 분류되어 허용 대상이다.
> - **운영 중 단독 실행 케이스**(§7.5.2 HIST가 이미 적재된 뒤 누락된 `DEFAULT_VALUE`만 보정하는 경우): §6.8 정책에 따라 UPDATE와 동일 트랜잭션에서 `TB_META_COLUMN_HIST`에 `HIST_TYPE='U'`, `CHANGE_REASON='SYSTEM_SYNC'`(또는 적절한 사유)로 인라인 INSERT를 추가해야 한다. 초기 적재 경로(§7.5.2 이전 실행)에서는 불필요.

---

**문서 끝 — v1.1**
