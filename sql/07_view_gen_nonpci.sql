-- =====================================================================
-- 07_view_gen_nonpci.sql — 비-PCI 컬럼만 노출하는 VIEW DDL 자동 생성
-- 실행 위치: 03 적재 또는 운영 메타 갱신 이후 임의 시점
-- 선행: 01/02/03 적재 완료 (TB_META_TABLE, TB_META_COLUMN ACTIVE 상태)
-- 출처: DB_메타정보_관리체계_표준설계.md §4.1/§4.2 (VIEW_YN, PCI_YN)
-- 정책:
--   - 대상: TB_META_TABLE.VIEW_YN='Y' AND STATUS_CD='ACTIVE'
--   - 노출 컬럼: TB_META_COLUMN.PCI_YN='N' AND STATUS_CD='ACTIVE'
--   - 결과 행 1개 = CREATE OR REPLACE VIEW DDL 1개 (개행 없는 단일 라인)
--   - SPOOL/CSV 추출 후 별도 검토 → 실행 (자동 실행 안 함)
-- 사용 예:
--     SET LONG 32767
--     SET LINESIZE 32767
--     SET PAGESIZE 0
--     SPOOL view_vw_ddl.sql
--     @07_view_gen_nonpci.sql
--     SPOOL OFF
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 본 쿼리 — 비-PCI VIEW DDL 생성
--   VIEW 이름 규칙: VW_<원본명>  (prefix 방식)
--   컬럼 순서: TB_META_COLUMN.COLUMN_ORDER 보존
--   주의 1: LISTAGG는 VARCHAR2(4000) 한도. 컬럼이 많을 경우 잘릴 수 있으며,
--          잘림 의심 시 (2) 점검 쿼리의 NON_PCI_COL 수와 실제 결과를 대조.
--   주의 2: Oracle 식별자 길이 한도(12.2+ 128byte). 원본명이 126자 이상이면
--          'VW_' prefix 추가 시 한도 초과 가능 → (3) 점검 쿼리로 사전 확인.
-- ---------------------------------------------------------------------
SELECT 'CREATE OR REPLACE VIEW ' || mt.SCHEMA_NAME || '.VW_' || mt.TABLE_NAME || ' AS SELECT '
       || LISTAGG(mc.COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY mc.COLUMN_ORDER)
       || ' FROM ' || mt.SCHEMA_NAME || '.' || mt.TABLE_NAME || ';' AS DDL
FROM TB_META_TABLE  mt
JOIN TB_META_COLUMN mc ON mc.TABLE_ID = mt.TABLE_ID
WHERE mt.VIEW_YN   = 'Y'
  AND mt.STATUS_CD = 'ACTIVE'
  AND mc.STATUS_CD = 'ACTIVE'
  AND mc.PCI_YN    = 'N'
GROUP BY mt.SCHEMA_NAME, mt.TABLE_NAME
ORDER BY mt.SCHEMA_NAME, mt.TABLE_NAME
;

-- ---------------------------------------------------------------------
-- (2) 점검 — 비-PCI 컬럼이 0개라 _NPCI 생성에서 제외된 VIEW
--   (모든 컬럼이 PCI라 비-PCI VIEW를 만들 의미가 없는 경우)
-- ---------------------------------------------------------------------
SELECT mt.SCHEMA_NAME, mt.TABLE_NAME,
       COUNT(*)                                         AS TOTAL_COL,
       SUM(CASE WHEN mc.PCI_YN = 'N' THEN 1 ELSE 0 END) AS NON_PCI_COL,
       SUM(CASE WHEN mc.PCI_YN = 'Y' THEN 1 ELSE 0 END) AS PCI_COL
FROM TB_META_TABLE  mt
JOIN TB_META_COLUMN mc ON mc.TABLE_ID = mt.TABLE_ID
WHERE mt.VIEW_YN   = 'Y'
  AND mt.STATUS_CD = 'ACTIVE'
  AND mc.STATUS_CD = 'ACTIVE'
GROUP BY mt.SCHEMA_NAME, mt.TABLE_NAME
HAVING SUM(CASE WHEN mc.PCI_YN = 'N' THEN 1 ELSE 0 END) = 0
ORDER BY mt.SCHEMA_NAME, mt.TABLE_NAME
;

-- ---------------------------------------------------------------------
-- (3) 점검 — 'VW_' prefix 추가 시 Oracle 식별자 한도(128byte) 초과 후보
-- ---------------------------------------------------------------------
SELECT mt.SCHEMA_NAME, mt.TABLE_NAME, LENGTHB(mt.TABLE_NAME) + 3 AS GEN_NAME_BYTES
FROM TB_META_TABLE mt
WHERE mt.VIEW_YN   = 'Y'
  AND mt.STATUS_CD = 'ACTIVE'
  AND LENGTHB(mt.TABLE_NAME) + 3 > 128
ORDER BY GEN_NAME_BYTES DESC
;
