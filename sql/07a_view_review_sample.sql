-- =====================================================================
-- 07a_view_review_sample.sql — 비-PCI VIEW 생성 전 컬럼 분류 현황 점검
-- 실행 위치: 03 적재(또는 운영 메타 갱신) 이후, 07_view_gen_nonpci.sql 실행 '전'
-- 선행: 01/02/03 적재 완료 (TB_META_TABLE, TB_META_COLUMN ACTIVE 상태)
-- 출처: DB_메타정보_관리체계_표준설계.md §4.1/§4.2 (VIEW_YN, PCI_YN)
-- 목적:
--   - 07이 VIEW로 노출할 대상(VIEW_YN='Y') 테이블에 대해
--     PCI / 비-PCI 컬럼 분류 현황을 테이블별로 집계해 사전 점검.
--   - "비-PCI(PCI_YN='N')로 분류돼 VIEW에 노출될 컬럼 수"와
--     "PCI라서 제외될 컬럼 수"를 한눈에 대조 → PCI 오분류·누락 점검.
-- 정책(07과 동일 기준):
--   - 대상 테이블: TB_META_TABLE.VIEW_YN='Y' AND STATUS_CD='ACTIVE'
--   - 점검 컬럼:   TB_META_COLUMN.STATUS_CD='ACTIVE'
--   - LOB/RAW/XML 계열: 비-PCI라도 UNPIVOT 등 실데이터 추출 불가 타입이라 별도 집계.
-- 주의:
--   - 메타 카운트만 조회하므로 원본 테이블 SELECT 권한 불필요(메타 테이블 권한만).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 점검 — 테이블별 컬럼 분류 현황
--   NON_PCI_COL  : 07이 VIEW로 노출할(검토 대상) 비-PCI 컬럼 수
--   LOB_EXCLUDED : 비-PCI지만 LOB/RAW/XML이라 실데이터 추출 불가한 수
--   PCI_COL      : VIEW에서 제외될 PCI 컬럼 수
-- ---------------------------------------------------------------------
SELECT mt.SCHEMA_NAME, mt.TABLE_NAME,
       SUM(CASE WHEN mc.PCI_YN = 'N' THEN 1 ELSE 0 END) AS NON_PCI_COL,
       SUM(CASE WHEN mc.PCI_YN = 'N'
                 AND mc.DATA_TYPE IN ('CLOB','NCLOB','BLOB','LONG','RAW','LONG RAW','BFILE','XMLTYPE')
                THEN 1 ELSE 0 END)                       AS LOB_EXCLUDED,
       SUM(CASE WHEN mc.PCI_YN = 'Y' THEN 1 ELSE 0 END) AS PCI_COL
FROM TB_META_TABLE  mt
JOIN TB_META_COLUMN mc ON mc.TABLE_ID = mt.TABLE_ID
WHERE mt.VIEW_YN   = 'Y'
  AND mt.STATUS_CD = 'ACTIVE'
  AND mc.STATUS_CD = 'ACTIVE'
GROUP BY mt.SCHEMA_NAME, mt.TABLE_NAME
ORDER BY mt.SCHEMA_NAME, mt.TABLE_NAME
;
