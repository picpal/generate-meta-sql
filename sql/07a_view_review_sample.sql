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
-- 설계 메모 (ORA-01489 회피):
--   - 생성 SQL을 '문자열 1개'로 누적하지 않고 **한 줄 = 1행(row)** 으로 출력한다.
--     각 행은 짧은 VARCHAR2라 문자열 연결 4000byte 한도(ORA-01489)가 구조적으로 발생하지 않음.
--   - 컬럼당 SELECT 절 1행 + UNPIVOT IN 리스트 1행으로 펼치므로 컬럼 수와 무관.
--   - CLOB / SET LONG 불필요. SQL*Plus 줄길이(2499) 제한도 컬럼당 1행이라 회피.
-- 주의:
--   - 실데이터를 읽으므로 (2) 실행자는 대상 SCHEMA 원본테이블 SELECT 권한 필요.
--   - 산출물에 (N으로 잘못 분류된) 개인신용정보가 노출될 수 있음 → 보안팀 내부 한정 취급.
--   - LOB/RAW/XML 계열은 UNPIVOT 불가라 실데이터 추출에서 제외(메타 행은 그대로, 실데이터 NULL).
-- 사용 예:
--     SET PAGESIZE 0
--     SET LINESIZE 4000
--     SET TRIMSPOOL ON
--     SET FEEDBACK OFF
--     SPOOL review_sample_gen.sql
--     @07a_view_review_sample.sql        -- (1) 생성기 → 검토 SELECT문(여러 줄) 출력
--     SPOOL OFF
--     -- review_sample_gen.sql 내용 확인 후
--     SPOOL review_sample_result.txt
--     @review_sample_gen.sql             -- (2) 실제 실행 → 검토 시트
--     SPOOL OFF
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 본 쿼리 — 테이블별 "보안검토 실데이터 시트" SELECT문을 '한 줄씩' 생성
--   결과 = 생성 SQL의 각 라인(여러 행). SPOOL하면 그대로 실행 가능한 SQL이 됨.
--   특정 테이블만 검토하려면 cols 절 WHERE에 주석 처리된 라인을 켤 것.
-- ---------------------------------------------------------------------
WITH cols AS (
  SELECT mt.SCHEMA_NAME, mt.TABLE_NAME,
         mc.COLUMN_NAME, mc.COLUMN_ORDER,
         ROW_NUMBER() OVER (PARTITION BY mt.TABLE_ID ORDER BY mc.COLUMN_ORDER) AS rn
  FROM TB_META_TABLE  mt
  JOIN TB_META_COLUMN mc ON mc.TABLE_ID = mt.TABLE_ID
  WHERE mt.VIEW_YN   = 'Y'
    AND mt.STATUS_CD = 'ACTIVE'
    AND mc.STATUS_CD = 'ACTIVE'
    AND mc.PCI_YN    = 'N'
    AND mc.DATA_TYPE NOT IN ('CLOB','NCLOB','BLOB','LONG','RAW','LONG RAW','BFILE','XMLTYPE') -- UNPIVOT 불가 타입 제외
    -- 특정 테이블만 검토 시 아래 주석 해제:
    -- AND mt.TABLE_NAME = '대상테이블'
)
SELECT line FROM (
  -- (A) 헤더 블록 — 테이블당 1회 (rn=1 행에서만)
  SELECT SCHEMA_NAME, TABLE_NAME, 100 ord, 0 sub, 'SELECT'                                                                      AS line FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 1,  '  ''' || SCHEMA_NAME || ''' AS 스키마,'                                     FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 2,  '  ''' || TABLE_NAME  || ''' AS 테이블명,'                                   FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 3,  '  m.COLUMN_NAME AS 컬럼,'                                                  FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 4,  '  m.DESCRIPTION AS 컬럼코멘트,'                                            FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 5,  '  m.DATA_TYPE   AS 데이터유형,'                                            FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 6,  '  NVL(TO_CHAR(m.DATA_LENGTH), TO_CHAR(m.DATA_PRECISION)) AS 데이터길이,'   FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 7,  '  m.MASKING_YN    AS 마스킹여부,'                                          FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 8,  '  m.ENCRYPTION_YN AS 암호화여부,'                                          FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 9,  '  m.PCI_YN        AS 개인신용정보포함여부,'                                FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 10, '  s.val           AS 실데이터'                                            FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 11, 'FROM TB_META_COLUMN m'                                                    FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 12, 'JOIN TB_META_TABLE t ON t.TABLE_ID = m.TABLE_ID'                          FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 13, 'LEFT JOIN ('                                                              FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 14, '  SELECT col, val FROM ('                                                 FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 100, 15, '    SELECT'                                                               FROM cols WHERE rn=1
  -- (B) 실테이블 SELECT 절 — 컬럼당 1행 (leading comma)
  UNION ALL
  SELECT SCHEMA_NAME, TABLE_NAME, 200, rn,
         CASE WHEN rn=1 THEN '      ' ELSE '    , ' END
         || 'TO_CHAR(' || COLUMN_NAME || ') ' || COLUMN_NAME              FROM cols
  -- (C) 중간 블록 — 테이블당 1회
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 300, 0, '    FROM ' || SCHEMA_NAME || '.' || TABLE_NAME || ' WHERE ROWNUM <= 1'     FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 300, 1, '  ) UNPIVOT INCLUDE NULLS (val FOR col IN ('                               FROM cols WHERE rn=1
  -- (D) UNPIVOT IN 리스트 — 컬럼당 1행 (leading comma)
  UNION ALL
  SELECT SCHEMA_NAME, TABLE_NAME, 400, rn,
         CASE WHEN rn=1 THEN '    ' ELSE '  , ' END
         || COLUMN_NAME || ' AS ''' || COLUMN_NAME || ''''                FROM cols
  -- (E) 꼬리 블록 — 테이블당 1회
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 500, 0, '  ))'                                                                      FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 500, 1, ') s ON s.col = m.COLUMN_NAME'                                              FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 500, 2, 'WHERE t.SCHEMA_NAME = ''' || SCHEMA_NAME || ''' AND t.TABLE_NAME = ''' || TABLE_NAME || '''' FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 500, 3, '  AND m.PCI_YN = ''N'' AND m.STATUS_CD = ''ACTIVE'''                       FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 500, 4, 'ORDER BY m.COLUMN_ORDER;'                                                  FROM cols WHERE rn=1
  UNION ALL SELECT SCHEMA_NAME, TABLE_NAME, 500, 5, ''                                                                          FROM cols WHERE rn=1
)
ORDER BY SCHEMA_NAME, TABLE_NAME, ord, sub
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
