-- =====================================================================
-- 11_bulk_backfill.sql — 초기 적재 직후 업무·법적 메타 대량 보정
-- 실행 순서: 03_initial_load.sql 완료 후
-- 선행: 01 · 02 · (02a) · 03
-- 출처: DB_메타정보_관리체계_표준설계.md §7 (1차 적재는 구조 메타만 채운다)
--
-- ⚠️ 이 파일은 통째로 실행하지 않는다. 필요한 §만 골라 실행한다.
-- ⚠️ 단건 변경은 sql/10_meta_change_templates.sql 을 쓴다.
-- =====================================================================


-- =====================================================================
-- §11.0 왜 필요한가 · 어떻게 쓰는가
-- =====================================================================
--
-- 초기 적재는 Oracle 카탈로그에서 읽을 수 있는 "구조 메타"만 채운다.
-- 업무·법적 메타는 아래 기본값으로 들어가므로 담당자가 확정해야 한다.
--
--   TB_META_TABLE.SERVICE_CD        = 'UNASSIGNED'
--   TB_META_TABLE.OWNER_EMP_ID      = 'SYSTEM'
--   TB_META_TABLE.PCI_YN            = 'N'
--   TB_META_TABLE.RETENTION_PERIOD_CD = (초기 적재값)
--   TB_META_COLUMN.PCI_YN           = 'N'
--   TB_META_COLUMN.SENSITIVITY_CD   = 'LOW'
--   TB_META_COLUMN.MASKING_YN       = 'N'
--   TB_META_COLUMN.DEFAULT_VALUE    = NULL  (LONG 타입이라 SQL-only로 적재 불가)
--   TB_META_INDEX_COLUMN.FUNC_EXPRESSION = NULL  (동일 사유 → sql/06으로 보강)
--
-- 대상이 수백~수천 행이라 단건 화면 입력은 현실적이지 않다. 이 파일은
-- "후보 추출 SELECT → 검토 → 일괄 UPDATE + HIST → 검증" 4단계를 반복한다.
--
-- [절대 규칙]
--   1. 후보 추출 SELECT 결과를 사람이 눈으로 확인하기 전에는 UPDATE하지 않는다.
--      특히 §11.3 PCI 분류는 컬럼명 패턴 추정이라 오탐·누락이 반드시 있다.
--   2. UPDATE와 HIST INSERT는 같은 트랜잭션. 중간에 COMMIT하지 않는다.
--   3. HIST의 WHERE는 UPDATE가 실제로 바꾼 행 집합과 정확히 같아야 한다.
--      다르면 바뀌지 않은 행까지 이력이 쌓이거나, 바뀐 행의 증적이 빠진다.
--   4. CHANGE_REASON은 보정 배치를 식별할 수 있게 쓴다.
--      예: 'BACKFILL:SERVICE_CD:20260807' — 나중에 이 배치만 조회·소명할 수 있다.
--
-- [ID 고정 패턴] — 이 파일의 기본 작업 방식
--   보정은 대개 "값이 기본값인 행"을 찾아 바꾼다. 그런데 UPDATE 직후에는
--   그 조건이 더 이상 성립하지 않으므로, HIST INSERT에 같은 WHERE를 쓰면
--   0건이 적재된다. 반대로 새 값으로 조회하면 이번 배치와 무관하게
--   원래 그 값이던 행까지 딸려 들어간다.
--
--   그래서 다음 3단계를 쓴다.
--     ① 대상 ID 목록을 뽑는다
--     ② 목록을 눈으로 확인하고 DEFINE IDS 에 붙여넣는다
--     ③ UPDATE와 HIST INSERT 모두 WHERE ... IN (&IDS) 로 같은 집합을 가리킨다
--
--   조건이 UPDATE 전후로 변하지 않는 경우(예: §11.3의 컬럼명 정규식)에는
--   같은 WHERE를 그대로 재사용해도 되며, 해당 § 안에 그렇게 표기해 두었다.
--
--   [배치 크기 한계 — 반드시 지킬 것]
--     · LISTAGG는 4000 byte를 넘으면 잘리는 게 아니라 ORA-01489로 실패한다.
--     · Oracle의 IN 목록은 최대 1,000개다. 넘으면 ORA-01795.
--     · 따라서 한 배치는 최대 1,000건, 실무상 500건 이하를 권장한다.
--       (1) 단계의 현황 SELECT로 건수를 먼저 확인하고 스키마·서비스 단위로 쪼갠다.
--       배치마다 CHANGE_REASON 접미사를 다르게 두어 나중에 구분한다.
--
--   [0건 처리]
--     LISTAGG가 0건이면 결과는 NULL이다. 그대로 두면 이전 배치의 IDS 값이
--     남아 엉뚱한 행을 바꾼다. 아래 SELECT는 NVL로 'NULL' 문자열을 반환하며,
--     IN (NULL)은 어떤 행에도 매칭되지 않으므로 안전하다.
--     DEFINE IDS 의 초기값도 NULL 로 둔다.

WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK
WHENEVER OSERROR  EXIT FAILURE ROLLBACK
SET DEFINE ON

DEFINE EMP_ID = 0000000
DEFINE BATCH  = 20260807
DEFINE IDS    = NULL


-- =====================================================================
-- §11.1 SERVICE_CD 매핑 (UNASSIGNED → 사내 서비스 코드)
-- =====================================================================

-- (0) 선행: CD_SERVICE 코드가 적재되어 있어야 한다
SELECT CODE_VALUE, CODE_NAME FROM TB_META_CODE
 WHERE CODE_GROUP = 'CD_SERVICE' AND USE_YN = 'Y' ORDER BY SORT_ORDER;

-- (1) 미배정 현황 — 스키마별 건수
SELECT SCHEMA_NAME, COUNT(*) AS CNT
  FROM TB_META_TABLE
 WHERE SERVICE_CD = 'UNASSIGNED'
 GROUP BY SCHEMA_NAME ORDER BY CNT DESC;

-- (2) 대상 목록 확인 — 실제로 이 목록을 바꿀 것인지 눈으로 본다
SELECT TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME
  FROM TB_META_TABLE
 WHERE SERVICE_CD = 'UNASSIGNED'
   AND SCHEMA_NAME = 'SVC1'          -- ← 배정 기준을 여기서 좁힌다
 ORDER BY TABLE_NAME;

-- (2-1) 대상 ID 고정 — 결과 문자열을 위 DEFINE IDS 에 붙여넣는다
SELECT NVL(LISTAGG(TO_CHAR(TABLE_ID), ',') WITHIN GROUP (ORDER BY TABLE_ID), 'NULL') AS IDS
  FROM TB_META_TABLE
 WHERE SERVICE_CD = 'UNASSIGNED'
   AND SCHEMA_NAME = 'SVC1';         -- ← (2)와 동일 조건

-- (3) 일괄 UPDATE
UPDATE TB_META_TABLE
   SET SERVICE_CD = 'MEMBER',        -- ← 배정할 서비스 코드
       UPDATED_BY = '&EMP_ID',
       UPDATED_AT = SYSTIMESTAMP
 WHERE TABLE_ID IN (&IDS);

-- (4) HIST 적재 (U) — (3)과 같은 ID 집합을 가리킨다
INSERT INTO TB_META_TABLE_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME, DESCRIPTION,
    VIEW_YN, SERVICE_CD, OWNER_EMP_ID, SECONDARY_EMP_ID,
    KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
)
SELECT SEQ_META_HIST_ID.NEXTVAL, 'U', SYSTIMESTAMP, '&EMP_ID',
       'BACKFILL:SERVICE_CD:&BATCH',
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME, DESCRIPTION,
    VIEW_YN, SERVICE_CD, OWNER_EMP_ID, SECONDARY_EMP_ID,
    KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
  FROM TB_META_TABLE
 WHERE TABLE_ID IN (&IDS);           -- ← (3)과 동일 집합

COMMIT;

-- (5) 검증 — 대상 건수와 HIST 건수가 같아야 한다
SELECT (SELECT COUNT(*) FROM TB_META_TABLE      WHERE TABLE_ID IN (&IDS))   AS MAIN_CNT,
       (SELECT COUNT(*) FROM TB_META_TABLE_HIST
         WHERE CHANGE_REASON = 'BACKFILL:SERVICE_CD:&BATCH')                AS HIST_CNT
  FROM DUAL;

-- (6) 잔여 확인 — 최종적으로 0이 되어야 한다
SELECT COUNT(*) AS STILL_UNASSIGNED FROM TB_META_TABLE WHERE SERVICE_CD = 'UNASSIGNED';


-- =====================================================================
-- §11.2 OWNER_EMP_ID 매핑 (SYSTEM → 실 담당자 사번)
--   §11.1과 동일 패턴. 보통 SERVICE_CD 배정이 끝난 뒤 서비스 단위로 지정한다.
-- =====================================================================

-- (1) 미배정 현황
SELECT SERVICE_CD, COUNT(*) AS CNT
  FROM TB_META_TABLE
 WHERE OWNER_EMP_ID = 'SYSTEM'
 GROUP BY SERVICE_CD ORDER BY CNT DESC;

-- (2) 대상 ID 고정 — 결과를 DEFINE IDS 에 붙여넣는다
SELECT NVL(LISTAGG(TO_CHAR(TABLE_ID), ',') WITHIN GROUP (ORDER BY TABLE_ID), 'NULL') AS IDS
  FROM TB_META_TABLE
 WHERE OWNER_EMP_ID = 'SYSTEM'
   AND SERVICE_CD   = 'MEMBER';       -- ← 배정 단위

-- (3) 일괄 UPDATE
UPDATE TB_META_TABLE
   SET OWNER_EMP_ID     = '1234567',   -- ← 주 담당자 사번
--     SECONDARY_EMP_ID = '7654321',   -- ← 부 담당자 (필요 시)
       UPDATED_BY = '&EMP_ID',
       UPDATED_AT = SYSTIMESTAMP
 WHERE TABLE_ID IN (&IDS);

-- (4) HIST 적재 (U)
INSERT INTO TB_META_TABLE_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME,
    DESCRIPTION, VIEW_YN, SERVICE_CD, OWNER_EMP_ID,
    SECONDARY_EMP_ID, KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK, CREATED_BY, CREATED_AT,
    UPDATED_BY, UPDATED_AT
)
SELECT SEQ_META_HIST_ID.NEXTVAL, 'U', SYSTIMESTAMP, '&EMP_ID', 'BACKFILL:OWNER_EMP_ID:&BATCH',
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME,
    DESCRIPTION, VIEW_YN, SERVICE_CD, OWNER_EMP_ID,
    SECONDARY_EMP_ID, KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK, CREATED_BY, CREATED_AT,
    UPDATED_BY, UPDATED_AT
  FROM TB_META_TABLE
 WHERE TABLE_ID IN (&IDS);

COMMIT;

SELECT COUNT(*) AS STILL_SYSTEM FROM TB_META_TABLE WHERE OWNER_EMP_ID = 'SYSTEM';


-- =====================================================================
-- §11.3 컬럼 PCI 분류 (PCI_YN / PCI_CATEGORY_CD / SENSITIVITY_CD)
--   ⚠️ 아래 패턴은 "검토 후보를 좁히는 용도"일 뿐 자동 분류가 아니다.
--      최종 판단은 담당자·보안팀이 한다. 오탐(FP)과 누락(FN)이 모두 존재한다.
-- =====================================================================

-- (1) 후보 추출 — 컬럼명·논리명·설명 패턴으로 개인신용정보 의심 컬럼을 모은다
SELECT t.SCHEMA_NAME, t.TABLE_NAME, c.COLUMN_NAME, c.LOGICAL_NAME,
       c.DATA_TYPE, c.DATA_LENGTH,
       CASE
         WHEN REGEXP_LIKE(c.COLUMN_NAME, 'RRN|JUMIN|SSN|SOCIAL',                 'i') THEN 'IDENT/RRN'
         WHEN REGEXP_LIKE(c.COLUMN_NAME, 'CARD_?NO|CRD_?NO|PAN',                 'i') THEN 'TRX/CARD'
         WHEN REGEXP_LIKE(c.COLUMN_NAME, 'ACCT_?NO|ACCOUNT_?NO|BANK_?NO',        'i') THEN 'TRX/ACCT'
         WHEN REGEXP_LIKE(c.COLUMN_NAME, 'PHONE|MOBILE|HP_?NO|TEL',              'i') THEN 'IDENT/PHONE'
         WHEN REGEXP_LIKE(c.COLUMN_NAME, 'EMAIL|MAIL_?ADDR',                     'i') THEN 'IDENT/EMAIL'
         WHEN REGEXP_LIKE(c.COLUMN_NAME, 'ADDR|ZIP|POST',                        'i') THEN 'IDENT/ADDR'
         WHEN REGEXP_LIKE(c.COLUMN_NAME, '(^|_)(NM|NAME)($|_)|CUST_?NM|USER_?NM','i') THEN 'IDENT/NAME'
         WHEN REGEXP_LIKE(c.COLUMN_NAME, 'BIRTH|BIRTHDAY|DOB',                   'i') THEN 'IDENT/BIRTH'
         WHEN REGEXP_LIKE(c.COLUMN_NAME, 'CREDIT_?SCORE|GRADE|SCORE',            'i') THEN 'SCORE'
         WHEN REGEXP_LIKE(c.COLUMN_NAME, 'INCOME|SALARY|ASSET|DEBT',             'i') THEN 'ABILITY'
         ELSE NULL
       END AS SUGGESTED
  FROM TB_META_COLUMN c
  JOIN TB_META_TABLE  t ON t.TABLE_ID = c.TABLE_ID
 WHERE c.PCI_YN = 'N'
   AND c.STATUS_CD = 'ACTIVE'
   AND REGEXP_LIKE(c.COLUMN_NAME,
       'RRN|JUMIN|SSN|SOCIAL|CARD_?NO|CRD_?NO|PAN|ACCT_?NO|ACCOUNT_?NO|BANK_?NO'
    || '|PHONE|MOBILE|HP_?NO|TEL|EMAIL|MAIL_?ADDR|ADDR|ZIP|POST'
    || '|(^|_)(NM|NAME)($|_)|CUST_?NM|USER_?NM|BIRTH|BIRTHDAY|DOB'
    || '|CREDIT_?SCORE|GRADE|SCORE|INCOME|SALARY|ASSET|DEBT', 'i')
 ORDER BY t.SCHEMA_NAME, t.TABLE_NAME, c.COLUMN_ORDER;

-- (2) 반대 방향 점검 — 이미 PCI='Y'인데 분류코드가 비어 있는 행
SELECT t.SCHEMA_NAME, t.TABLE_NAME, c.COLUMN_NAME, c.PCI_CATEGORY_CD, c.SENSITIVITY_CD
  FROM TB_META_COLUMN c
  JOIN TB_META_TABLE  t ON t.TABLE_ID = c.TABLE_ID
 WHERE c.PCI_YN = 'Y' AND c.PCI_CATEGORY_CD IS NULL;

-- (3) 검토 확정 후 분류 단위로 UPDATE — 한 번에 한 분류씩 실행한다
--     (아래는 주민등록번호 예시. 다른 분류는 정규식과 값만 바꿔 반복)
--
--     ⚠️ UPDATE 조건을 (1)의 후보 SELECT보다 넓게 두면 이미 분류가 끝난
--        컬럼까지 덮어쓴다. COLUMN_ID를 먼저 고정해 범위를 일치시킨다.

-- (3-1) 대상 COLUMN_ID 고정 — 결과를 DEFINE IDS 에 붙여넣는다
SELECT NVL(LISTAGG(TO_CHAR(c.COLUMN_ID), ',') WITHIN GROUP (ORDER BY c.COLUMN_ID), 'NULL') AS IDS
  FROM TB_META_COLUMN c
  JOIN TB_META_TABLE  t ON t.TABLE_ID = c.TABLE_ID
 WHERE c.PCI_YN = 'N'                 -- ← (1) 후보 조건과 동일
   AND c.STATUS_CD = 'ACTIVE'
   AND REGEXP_LIKE(c.COLUMN_NAME, 'RRN|JUMIN|SSN', 'i');

-- (3-2) 일괄 UPDATE
UPDATE TB_META_COLUMN
   SET PCI_YN          = 'Y',
       PCI_CATEGORY_CD = 'IDENT',      -- CD_PCI_CATEGORY: IDENT/TRX/SCORE/ABILITY/PUBLIC
       SENSITIVITY_CD  = 'HIGH',       -- CD_SENSITIVITY: HIGH/MID/LOW
       MASKING_YN      = 'Y',
       MASKING_RULE_CD = 'RRN',        -- CD_MASKING_RULE
       UPDATED_BY = '&EMP_ID',
       UPDATED_AT = SYSTIMESTAMP
 WHERE COLUMN_ID IN (&IDS);

-- (4) HIST 적재 (U)
INSERT INTO TB_META_COLUMN_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    COLUMN_ID, TABLE_ID, COLUMN_NAME, COLUMN_ORDER, LOGICAL_NAME, DESCRIPTION,
    DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE,
    NULLABLE_YN, DEFAULT_VALUE, PK_YN, UK_YN, FK_YN,
    PCI_YN, PCI_CATEGORY_CD, SENSITIVITY_CD,
    ENCRYPTION_YN, ENCRYPTION_ALG, MASKING_YN, MASKING_RULE_CD,
    RETENTION_PERIOD_CD, TOS_CD, STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
)
SELECT SEQ_META_HIST_ID.NEXTVAL, 'U', SYSTIMESTAMP, '&EMP_ID',
       'BACKFILL:PCI:IDENT:RRN:&BATCH',
    COLUMN_ID, TABLE_ID, COLUMN_NAME, COLUMN_ORDER, LOGICAL_NAME, DESCRIPTION,
    DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE,
    NULLABLE_YN, DEFAULT_VALUE, PK_YN, UK_YN, FK_YN,
    PCI_YN, PCI_CATEGORY_CD, SENSITIVITY_CD,
    ENCRYPTION_YN, ENCRYPTION_ALG, MASKING_YN, MASKING_RULE_CD,
    RETENTION_PERIOD_CD, TOS_CD, STATUS_CD, REMARK,
    CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT
  FROM TB_META_COLUMN
 WHERE COLUMN_ID IN (&IDS);           -- ← (3-2)와 동일 집합

COMMIT;

-- (5) 테이블 PCI_YN 롤업 — PCI 컬럼을 하나라도 가진 테이블은 PCI_YN='Y'
--     대상 ID 고정 (UPDATE 후에는 PCI_YN='N' 조건이 성립하지 않는다)
SELECT NVL(LISTAGG(TO_CHAR(t.TABLE_ID), ',') WITHIN GROUP (ORDER BY t.TABLE_ID), 'NULL') AS IDS
  FROM TB_META_TABLE t
 WHERE t.PCI_YN = 'N'
   AND EXISTS (SELECT 1 FROM TB_META_COLUMN c
                WHERE c.TABLE_ID = t.TABLE_ID AND c.PCI_YN = 'Y' AND c.STATUS_CD = 'ACTIVE');

UPDATE TB_META_TABLE
   SET PCI_YN = 'Y',
       UPDATED_BY = '&EMP_ID', UPDATED_AT = SYSTIMESTAMP
 WHERE TABLE_ID IN (&IDS);
-- HIST 적재 (U)
INSERT INTO TB_META_TABLE_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME,
    DESCRIPTION, VIEW_YN, SERVICE_CD, OWNER_EMP_ID,
    SECONDARY_EMP_ID, KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK, CREATED_BY, CREATED_AT,
    UPDATED_BY, UPDATED_AT
)
SELECT SEQ_META_HIST_ID.NEXTVAL, 'U', SYSTIMESTAMP, '&EMP_ID', 'BACKFILL:PCI_ROLLUP:&BATCH',
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME,
    DESCRIPTION, VIEW_YN, SERVICE_CD, OWNER_EMP_ID,
    SECONDARY_EMP_ID, KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK, CREATED_BY, CREATED_AT,
    UPDATED_BY, UPDATED_AT
  FROM TB_META_TABLE
 WHERE TABLE_ID IN (&IDS);
COMMIT;

-- (6) 검증 — 컬럼은 PCI인데 테이블이 아닌 불일치가 0건이어야 한다
SELECT t.SCHEMA_NAME, t.TABLE_NAME
  FROM TB_META_TABLE t
 WHERE t.PCI_YN = 'N'
   AND EXISTS (SELECT 1 FROM TB_META_COLUMN c
                WHERE c.TABLE_ID = t.TABLE_ID AND c.PCI_YN = 'Y' AND c.STATUS_CD = 'ACTIVE');


-- =====================================================================
-- §11.4 보관주기 (RETENTION_PERIOD_CD / RETENTION_BASIS)
-- =====================================================================

-- (1) 현황
SELECT RETENTION_PERIOD_CD, COUNT(*) AS CNT
  FROM TB_META_TABLE GROUP BY RETENTION_PERIOD_CD ORDER BY CNT DESC;

-- (2) 근거가 비어 있는 행 — 감사 지적 대상이다
SELECT SCHEMA_NAME, TABLE_NAME, RETENTION_PERIOD_CD
  FROM TB_META_TABLE
 WHERE RETENTION_BASIS IS NULL AND STATUS_CD = 'ACTIVE'
 ORDER BY SCHEMA_NAME, TABLE_NAME;

-- (3) 서비스 단위 일괄 지정
--     조건(SERVICE_CD·PCI_YN)이 UPDATE 전후로 바뀌지 않으므로 ID 고정 없이
--     같은 WHERE를 HIST에 그대로 재사용해도 된다.
UPDATE TB_META_TABLE
   SET RETENTION_PERIOD_CD = 'Y5',                       -- CD_RETENTION_PERIOD
       RETENTION_BASIS     = '신용정보법 시행령 제17조의2',
       UPDATED_BY = '&EMP_ID', UPDATED_AT = SYSTIMESTAMP
 WHERE SERVICE_CD = 'MEMBER' AND PCI_YN = 'Y';
-- HIST 적재 (U) — WHERE는 위 UPDATE와 동일 (조건이 UPDATE 전후로 변하지 않음)
INSERT INTO TB_META_TABLE_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME,
    DESCRIPTION, VIEW_YN, SERVICE_CD, OWNER_EMP_ID,
    SECONDARY_EMP_ID, KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK, CREATED_BY, CREATED_AT,
    UPDATED_BY, UPDATED_AT
)
SELECT SEQ_META_HIST_ID.NEXTVAL, 'U', SYSTIMESTAMP, '&EMP_ID', 'BACKFILL:RETENTION:&BATCH',
    TABLE_ID, SCHEMA_NAME, TABLE_NAME, LOGICAL_NAME,
    DESCRIPTION, VIEW_YN, SERVICE_CD, OWNER_EMP_ID,
    SECONDARY_EMP_ID, KEY_TABLE_YN, ISOLATION_YN, ISOLATION_LEVEL_CD,
    PCI_YN, RETENTION_PERIOD_CD, RETENTION_BASIS, TOS_CD,
    STATUS_CD, REMARK, CREATED_BY, CREATED_AT,
    UPDATED_BY, UPDATED_AT
  FROM TB_META_TABLE
 WHERE SERVICE_CD = 'MEMBER' AND PCI_YN = 'Y';
COMMIT;


-- =====================================================================
-- §11.5 VIEW_YN 확인
--   초기 적재는 ALL_TABLES/ALL_VIEWS 출처로 자동 채운다. 값 자체는 보통 맞다.
--   비-PCI VIEW 배포(sql/07) 대상을 정하는 단계이므로 실물과 대조만 한다.
-- =====================================================================

SELECT t.SCHEMA_NAME, t.TABLE_NAME, t.VIEW_YN,
       CASE WHEN v.VIEW_NAME IS NOT NULL THEN 'Y' ELSE 'N' END AS DB_IS_VIEW
  FROM TB_META_TABLE t
  LEFT JOIN ALL_VIEWS v ON v.OWNER = t.SCHEMA_NAME AND v.VIEW_NAME = t.TABLE_NAME
 WHERE t.STATUS_CD = 'ACTIVE'
   AND t.VIEW_YN <> CASE WHEN v.VIEW_NAME IS NOT NULL THEN 'Y' ELSE 'N' END;
-- 결과가 있으면 §10.1로 VIEW_YN을 정정한다. 0건이면 정상.


-- =====================================================================
-- §11.6 DEFAULT_VALUE 보강 (LONG 컬럼 우회)
--   ALL_TAB_COLUMNS.DATA_DEFAULT는 LONG이라 SQL-only 초기 적재에서 제외된다.
--   (sql/06_func_idx_backfill.sql은 FUNC_EXPRESSION 전용이며 여기는 다루지 않는다)
-- =====================================================================

-- (1) 보강 대상 확인 — 실제 DB에는 DEFAULT가 있는데 메타는 NULL인 컬럼
--     LONG 화면 표시를 위해 먼저 실행: SET LONG 32767  /  SET LINESIZE 32767
SELECT tc.OWNER, tc.TABLE_NAME, tc.COLUMN_NAME, tc.DATA_DEFAULT
  FROM ALL_TAB_COLUMNS tc
  JOIN TB_META_TABLE  mt ON mt.SCHEMA_NAME = tc.OWNER AND mt.TABLE_NAME = tc.TABLE_NAME
  JOIN TB_META_COLUMN mc ON mc.TABLE_ID = mt.TABLE_ID AND mc.COLUMN_NAME = tc.COLUMN_NAME
 WHERE tc.DEFAULT_LENGTH IS NOT NULL
   AND mc.DEFAULT_VALUE IS NULL
 ORDER BY tc.OWNER, tc.TABLE_NAME, tc.COLUMN_ID;

-- (2) 위 결과를 보고 행마다 수기 UPDATE (DEFAULT_VALUE는 VARCHAR2(500))
--     값 내부의 작은따옴표는 ''(두 번 연속)으로 escape 한다.
-- UPDATE TB_META_COLUMN
--    SET DEFAULT_VALUE = '''N''',
--        UPDATED_BY = '&EMP_ID', UPDATED_AT = SYSTIMESTAMP
--  WHERE TABLE_ID = (SELECT TABLE_ID FROM TB_META_TABLE WHERE SCHEMA_NAME='SVC1' AND TABLE_NAME='TB_MEMBER')
--    AND COLUMN_NAME = 'USE_YN';

-- (3) HIST 적재 (U) — 위 UPDATE의 WHERE와 동일하게 맞춘다
-- INSERT INTO TB_META_COLUMN_HIST (
--     HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
--     COLUMN_ID, TABLE_ID, COLUMN_NAME, COLUMN_ORDER,
--     LOGICAL_NAME, DESCRIPTION, DATA_TYPE, DATA_LENGTH,
--     DATA_PRECISION, DATA_SCALE, NULLABLE_YN, DEFAULT_VALUE,
--     PK_YN, UK_YN, FK_YN, PCI_YN,
--     PCI_CATEGORY_CD, SENSITIVITY_CD, ENCRYPTION_YN, ENCRYPTION_ALG,
--     MASKING_YN, MASKING_RULE_CD, RETENTION_PERIOD_CD, TOS_CD,
--     STATUS_CD, REMARK, CREATED_BY, CREATED_AT,
--     UPDATED_BY, UPDATED_AT
-- )
-- SELECT SEQ_META_HIST_ID.NEXTVAL, 'U', SYSTIMESTAMP, '&EMP_ID', 'BACKFILL:DEFAULT_VALUE:&BATCH',
--     COLUMN_ID, TABLE_ID, COLUMN_NAME, COLUMN_ORDER,
--     LOGICAL_NAME, DESCRIPTION, DATA_TYPE, DATA_LENGTH,
--     DATA_PRECISION, DATA_SCALE, NULLABLE_YN, DEFAULT_VALUE,
--     PK_YN, UK_YN, FK_YN, PCI_YN,
--     PCI_CATEGORY_CD, SENSITIVITY_CD, ENCRYPTION_YN, ENCRYPTION_ALG,
--     MASKING_YN, MASKING_RULE_CD, RETENTION_PERIOD_CD, TOS_CD,
--     STATUS_CD, REMARK, CREATED_BY, CREATED_AT,
--     UPDATED_BY, UPDATED_AT
--   FROM TB_META_COLUMN
--  WHERE TABLE_ID = (SELECT TABLE_ID FROM TB_META_TABLE WHERE SCHEMA_NAME='SVC1' AND TABLE_NAME='TB_MEMBER')
--    AND COLUMN_NAME = 'USE_YN';
-- COMMIT;


-- =====================================================================
-- §11.7 보정 배치 전체 검증 (모든 § 완료 후 1회)
-- =====================================================================

-- (1) 이번 배치가 남긴 이력 요약
SELECT 'TABLE' AS SRC, CHANGE_REASON, COUNT(*) AS CNT
  FROM TB_META_TABLE_HIST  WHERE CHANGE_REASON LIKE 'BACKFILL:%&BATCH' GROUP BY CHANGE_REASON
UNION ALL
SELECT 'COLUMN', CHANGE_REASON, COUNT(*)
  FROM TB_META_COLUMN_HIST WHERE CHANGE_REASON LIKE 'BACKFILL:%&BATCH' GROUP BY CHANGE_REASON
ORDER BY 1, 2;

-- (2) 잔여 기본값 — 모두 0이어야 보정 완료
SELECT (SELECT COUNT(*) FROM TB_META_TABLE WHERE SERVICE_CD   = 'UNASSIGNED') AS SVC_UNASSIGNED,
       (SELECT COUNT(*) FROM TB_META_TABLE WHERE OWNER_EMP_ID = 'SYSTEM')     AS OWNER_SYSTEM,
       (SELECT COUNT(*) FROM TB_META_TABLE
         WHERE RETENTION_BASIS IS NULL AND STATUS_CD = 'ACTIVE')              AS NO_RETENTION_BASIS,
       (SELECT COUNT(*) FROM TB_META_COLUMN
         WHERE PCI_YN = 'Y' AND PCI_CATEGORY_CD IS NULL)                      AS PCI_NO_CATEGORY
  FROM DUAL;

-- (3) 코드값 무결성 — sql/05_integrity_check.sql §5.3 ~ §5.6 을 실행해 모두 0건 확인


-- =====================================================================
-- 대량 보정 끝
-- =====================================================================
