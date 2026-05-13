-- =====================================================================
-- 06_func_idx_backfill.sql — 함수기반 인덱스 FUNC_EXPRESSION 사후 보강
-- 실행 위치: 03 적재 후 함수기반 인덱스가 식별된 경우 (선택적)
-- 선행: 03_initial_load.sql 완료
-- 출처: 표준설계서 §7.3 + 운영가이드 §5
-- 배경: ALL_IND_EXPRESSIONS.COLUMN_EXPRESSION이 LONG 타입이라 SQL 안에서
--       가공·변환 불가. 03 §7.3.2는 SYS_NCxxxxx 가상 컬럼명만 적재하고
--       FUNC_EXPRESSION은 NULL로 둠. 본 스크립트로 사후 보강.
-- 정책: SQL DDL/DML만 사용 (PL/SQL 블록 없음).
--       LONG 컬럼은 SQL 안에서 가공 불가하므로 §6.1 SELECT로 화면 표시 후
--       §6.2 템플릿으로 운영자가 수기 UPDATE 실행. §6.3 HIST는 UPDATE
--       직후 본 파일 재실행으로 자동 적재.
-- 운영 권한: 보강 대상 스키마 SELECT 권한 + 메타 스키마 UPDATE 권한.
-- 사용 예 (SQL*Plus / SQL Developer):
--     SET LONG 32767
--     SET LINESIZE 32767
--     @06_func_idx_backfill.sql       -- §6.1/§6.4 화면 출력, §6.3은 무영향
--     -- 화면 결과로 §6.2 UPDATE 문 수기 작성·실행
--     @06_func_idx_backfill.sql       -- 재실행 → §6.3 HIST 자동 적재
-- =====================================================================

-- =====================================================================
-- §6.1 보강 대상 + COLUMN_EXPRESSION 표시 (LONG 화면 출력)
--   SET LONG 32767 선행 필수 (SQL*Plus / SQL Developer)
--   결과 컬럼: INDEX_ID, COLUMN_POS, COLUMN_EXPRESSION (LONG)
--   → §6.2 UPDATE 템플릿의 키·값으로 그대로 사용
-- =====================================================================
SELECT mt.SCHEMA_NAME AS INDEX_OWNER,
       mi.INDEX_NAME,
       ic.COLUMN_POS  AS COLUMN_POSITION,
       e.COLUMN_EXPRESSION,
       ic.INDEX_ID,
       ic.COLUMN_POS
  FROM TB_META_INDEX_COLUMN ic
  JOIN TB_META_INDEX        mi ON mi.INDEX_ID = ic.INDEX_ID
  JOIN TB_META_TABLE        mt ON mt.TABLE_ID = mi.TABLE_ID
  JOIN ALL_IND_EXPRESSIONS  e  ON e.INDEX_OWNER     = mt.SCHEMA_NAME
                              AND e.INDEX_NAME      = mi.INDEX_NAME
                              AND e.COLUMN_POSITION = ic.COLUMN_POS
 WHERE ic.COLUMN_NAME LIKE 'SYS_NC%'
   AND ic.FUNC_EXPRESSION IS NULL
 ORDER BY mt.SCHEMA_NAME, mi.INDEX_NAME, ic.COLUMN_POS;

-- =====================================================================
-- §6.2 수기 UPDATE 템플릿 (§6.1 결과 각 행마다 작성·실행)
--   주의 1: COLUMN_EXPRESSION 값 길이가 2000자 초과 시 앞 2000자만 입력
--   주의 2: 값 내부에 작은따옴표가 있으면 '' (두 번 연속)으로 escape
-- =====================================================================
-- UPDATE TB_META_INDEX_COLUMN
--    SET FUNC_EXPRESSION = '<COLUMN_EXPRESSION 값>'
--  WHERE INDEX_ID   = <INDEX_ID>
--    AND COLUMN_POS = <COLUMN_POS>;
-- COMMIT;

-- =====================================================================
-- §6.3 HIST 적재 (수기 UPDATE 후 변경 이력 기록 — HIST_TYPE='U')
--   FUNC_EXPRESSION이 채워진 행 중 동일 사유의 HIST가 없는 것만 적재
--   초기 1회차 실행 시(아직 UPDATE 안 한 경우)는 0행 적재 — 안전
-- =====================================================================
INSERT INTO TB_META_INDEX_COLUMN_HIST (
    HIST_ID, HIST_TYPE, HIST_AT, HIST_BY, CHANGE_REASON,
    INDEX_ID, COLUMN_POS, COLUMN_NAME, SORT_ORDER, FUNC_EXPRESSION
)
SELECT SEQ_META_HIST_ID.NEXTVAL, 'U', SYSTIMESTAMP, USER, 'FUNC_EXPRESSION_BACKFILL',
       INDEX_ID, COLUMN_POS, COLUMN_NAME, SORT_ORDER, FUNC_EXPRESSION
  FROM TB_META_INDEX_COLUMN
 WHERE COLUMN_NAME LIKE 'SYS_NC%'
   AND FUNC_EXPRESSION IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM TB_META_INDEX_COLUMN_HIST h
        WHERE h.INDEX_ID      = TB_META_INDEX_COLUMN.INDEX_ID
          AND h.COLUMN_POS    = TB_META_INDEX_COLUMN.COLUMN_POS
          AND h.HIST_TYPE     = 'U'
          AND h.CHANGE_REASON = 'FUNC_EXPRESSION_BACKFILL'
   )
;

COMMIT;

-- =====================================================================
-- §6.4 보강 결과 검증 (실행 후 확인용)
--   PENDING(남은 NULL) → BACKFILLED(채워진 수) → HIST_BACKFILL(HIST 'U' 수)
-- =====================================================================
SELECT 'PENDING' AS phase, COUNT(*) AS cnt
  FROM TB_META_INDEX_COLUMN
 WHERE COLUMN_NAME LIKE 'SYS_NC%'
   AND FUNC_EXPRESSION IS NULL
UNION ALL
SELECT 'BACKFILLED', COUNT(*)
  FROM TB_META_INDEX_COLUMN
 WHERE COLUMN_NAME LIKE 'SYS_NC%'
   AND FUNC_EXPRESSION IS NOT NULL
UNION ALL
SELECT 'HIST_BACKFILL', COUNT(*)
  FROM TB_META_INDEX_COLUMN_HIST
 WHERE HIST_TYPE='U' AND CHANGE_REASON='FUNC_EXPRESSION_BACKFILL'
;
