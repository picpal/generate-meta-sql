-- =====================================================================
-- 07a_view_review_sample.sql — 비-PCI VIEW 생성 전 보안검토용 실데이터 시트 생성
-- 실행 위치: 03 적재(또는 운영 메타 갱신) 이후, 07_view_gen_nonpci.sql 실행 '전'
-- 선행: 01/02/03 적재 완료 (TB_META_TABLE, TB_META_COLUMN ACTIVE 상태)
-- 출처: DB_메타정보_관리체계_표준설계.md §4.1/§4.2 (VIEW_YN, PCI_YN)
-- 목적:
--   - 보안팀이 "비-PCI(PCI_YN='N')로 분류된 컬럼을 VIEW로 노출해도 되는가"를
--     실데이터 1건과 함께 검토하기 위한 산출물.
--   - 컬럼별 실데이터를 보고 PCI 오분류(Y여야 하는데 N) 여부를 육안 검증.
-- 검토 시트 컬럼:
--   스키마 / 테이블명 / 컬럼 / 컬럼코멘트 / 데이터유형 / 데이터길이 /
--   마스킹여부 / 암호화여부 / 개인신용정보포함여부 / 실데이터(1건)
-- 정책(07과 동일 기준):
--   - 대상 테이블: TB_META_TABLE.VIEW_YN='Y' AND STATUS_CD='ACTIVE'
--   - 검토 컬럼:   TB_META_COLUMN.PCI_YN='N' AND STATUS_CD='ACTIVE'
--                  (= 07이 VIEW로 노출할 바로 그 컬럼 집합)
--   - 실데이터:    각 원본 SCHEMA_NAME.TABLE_NAME 에서 WHERE ROWNUM<=1 (정렬 없음, stopkey라 빠름)
--   - 2단계 동적 SQL: (1)이 검토 SELECT문을 '생성'만 함 → SPOOL 후 (2)로 실행
--   - 자동 실행 안 함. 생성물 검토 후 수동 실행.
-- 주의:
--   - 실데이터를 읽으므로 (2) 실행자는 대상 SCHEMA 원본테이블 SELECT 권한 필요.
--   - 산출물에 (N으로 잘못 분류된) 개인신용정보가 노출될 수 있음 → 보안팀 내부 한정 취급.
--   - LOB/RAW/XML 계열은 UNPIVOT 불가라 실데이터 추출에서 제외(메타 행은 그대로, 실데이터 NULL).
--   - 생성 SQL은 CLOB(XMLAGG/TO_CLOB)로 누적 → ORA-01489(4000byte 연결 한도) 회피. 출력에 SET LONG 32767 필수.
-- 사용 예:
--     SET LONG 32767
--     SET LINESIZE 32767
--     SET PAGESIZE 0
--     SET TRIMSPOOL ON
--     SPOOL review_sample_gen.sql
--     @07a_view_review_sample.sql        -- (1) 생성기 → 테이블별 검토 SELECT문 출력
--     SPOOL OFF
--     -- review_sample_gen.sql 내용 확인 후
--     SPOOL review_sample_result.txt
--     @review_sample_gen.sql             -- (2) 실제 실행 → 검토 시트
--     SPOOL OFF
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 본 쿼리 — 테이블별 "보안검토 실데이터 시트" SELECT문 생성
--   결과 1행 = 테이블 1개분 검토 SELECT문 (그대로 실행 가능)
--   특정 테이블만 검토하려면 인라인뷰 WHERE에 주석 처리된 라인을 켤 것.
-- ---------------------------------------------------------------------
SELECT
       TO_CLOB('SELECT' || CHR(10))   -- CLOB로 시작 → 이후 연결이 CLOB라 ORA-01489(4000byte) 회피
    || '  ''' || x.SCHEMA_NAME || ''' AS 스키마,' || CHR(10)
    || '  ''' || x.TABLE_NAME  || ''' AS 테이블명,' || CHR(10)
    || '  m.COLUMN_NAME AS 컬럼,' || CHR(10)
    || '  m.DESCRIPTION AS 컬럼코멘트,' || CHR(10)
    || '  m.DATA_TYPE   AS 데이터유형,' || CHR(10)
    || '  NVL(TO_CHAR(m.DATA_LENGTH), TO_CHAR(m.DATA_PRECISION)) AS 데이터길이,' || CHR(10)
    || '  m.MASKING_YN    AS 마스킹여부,' || CHR(10)
    || '  m.ENCRYPTION_YN AS 암호화여부,' || CHR(10)
    || '  m.PCI_YN        AS 개인신용정보포함여부,' || CHR(10)
    || '  s.val           AS 실데이터' || CHR(10)
    || 'FROM TB_META_COLUMN m' || CHR(10)
    || 'JOIN TB_META_TABLE t ON t.TABLE_ID = m.TABLE_ID' || CHR(10)
    || 'LEFT JOIN (' || CHR(10)
    || '  SELECT col, val FROM (' || CHR(10)
    || '    SELECT ' || x.col_list || CHR(10)
    || '    FROM ' || x.SCHEMA_NAME || '.' || x.TABLE_NAME || ' WHERE ROWNUM <= 1' || CHR(10)
    || '  ) UNPIVOT INCLUDE NULLS (val FOR col IN (' || x.unpiv_list || '))' || CHR(10)
    || ') s ON s.col = m.COLUMN_NAME' || CHR(10)
    || 'WHERE t.SCHEMA_NAME = ''' || x.SCHEMA_NAME || ''' AND t.TABLE_NAME = ''' || x.TABLE_NAME || '''' || CHR(10)
    || '  AND m.PCI_YN = ''N'' AND m.STATUS_CD = ''ACTIVE''' || CHR(10)
    || 'ORDER BY m.COLUMN_ORDER;' || CHR(10) AS GEN_SQL
FROM (
  SELECT mt.SCHEMA_NAME, mt.TABLE_NAME,
         -- LISTAGG(VARCHAR2 4000 한도) 대신 XMLAGG로 CLOB 누적 → 컬럼 수 무관
         RTRIM(XMLAGG(XMLELEMENT(E, 'TO_CHAR(' || mc.COLUMN_NAME || ') ' || mc.COLUMN_NAME || ', ')
                      ORDER BY mc.COLUMN_ORDER).EXTRACT('//text()').getClobVal(), ', ') AS col_list,
         RTRIM(XMLAGG(XMLELEMENT(E, mc.COLUMN_NAME || ' AS ''' || mc.COLUMN_NAME || ''', ')
                      ORDER BY mc.COLUMN_ORDER).EXTRACT('//text()').getClobVal(), ', ') AS unpiv_list
  FROM TB_META_TABLE  mt
  JOIN TB_META_COLUMN mc ON mc.TABLE_ID = mt.TABLE_ID
  WHERE mt.VIEW_YN   = 'Y'
    AND mt.STATUS_CD = 'ACTIVE'
    AND mc.STATUS_CD = 'ACTIVE'
    AND mc.PCI_YN    = 'N'
    AND mc.DATA_TYPE NOT IN ('CLOB','NCLOB','BLOB','LONG','RAW','LONG RAW','BFILE','XMLTYPE') -- UNPIVOT 불가 타입 제외
    -- 특정 테이블만 검토 시 아래 주석 해제:
    -- AND mt.TABLE_NAME = '대상테이블'
  GROUP BY mt.SCHEMA_NAME, mt.TABLE_NAME
) x
ORDER BY x.SCHEMA_NAME, x.TABLE_NAME
;

-- ---------------------------------------------------------------------
-- (2) 점검 — 테이블별 컬럼 분류 현황 (생성물 검증/누락 대조용)
--   NON_PCI_COL  : 검토 시트에 나와야 할 컬럼 수
--   LOB_EXCLUDED : 비-PCI지만 LOB/RAW/XML이라 실데이터 추출에서 빠진 수
--   PCI_COL      : VIEW/검토에서 제외된 PCI 컬럼 수
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
