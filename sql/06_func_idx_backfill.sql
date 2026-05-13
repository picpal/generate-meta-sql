-- =====================================================================
-- 06_func_idx_backfill.sql — 함수기반 인덱스 FUNC_EXPRESSION 사후 보강
-- 실행 위치: 03 적재 후 함수기반 인덱스가 식별된 경우 (선택적)
-- 선행: 03_initial_load.sql 완료
-- 출처: 표준설계서 §7.3 + 운영가이드 §5
-- 배경: ALL_IND_EXPRESSIONS.COLUMN_EXPRESSION이 LONG 타입이라 SQL-only로
--       추출 불가. 03 §7.3.2는 SYS_NCxxxxx 가상 컬럼명만 적재하고
--       FUNC_EXPRESSION은 NULL로 둠. 본 스크립트로 사후 보강.
-- 정책: PL/SQL 익명 블록 사용 (LONG → VARCHAR2 변환 위해 불가피).
--       표준설계서 §7.3 단서 "필요 시 DB 밖의 변경 도구가 별도 보강"의
--       "DB 밖 도구 미보유" 시 대체 절차로 운영자 권한 하에 실행.
-- 운영 권한: 보강 대상 스키마에 대한 SELECT 권한 + 메타 스키마 UPDATE 권한.
-- =====================================================================

-- =====================================================================
-- §6.1 보강 대상 식별 (실행 전 확인용)
-- =====================================================================
SELECT mi.INDEX_ID, mt.SCHEMA_NAME, mt.TABLE_NAME, mi.INDEX_NAME,
       ic.COLUMN_POS, ic.COLUMN_NAME, ic.FUNC_EXPRESSION
  FROM TB_META_INDEX_COLUMN ic
  JOIN TB_META_INDEX        mi ON mi.INDEX_ID = ic.INDEX_ID
  JOIN TB_META_TABLE        mt ON mt.TABLE_ID = mi.TABLE_ID
 WHERE ic.COLUMN_NAME LIKE 'SYS_NC%'
   AND ic.FUNC_EXPRESSION IS NULL
 ORDER BY mt.SCHEMA_NAME, mt.TABLE_NAME, mi.INDEX_NAME, ic.COLUMN_POS;

-- =====================================================================
-- §6.2 PL/SQL 보강 블록 (LONG → VARCHAR2 변환)
--   ALL_IND_EXPRESSIONS.COLUMN_EXPRESSION을 동적 SQL로 가져와 채움
-- =====================================================================
DECLARE
    CURSOR cur_target IS
        SELECT ic.INDEX_ID, ic.COLUMN_POS,
               mt.SCHEMA_NAME AS owner_name,
               mi.INDEX_NAME,
               ic.COLUMN_POS  AS column_position
          FROM TB_META_INDEX_COLUMN ic
          JOIN TB_META_INDEX        mi ON mi.INDEX_ID = ic.INDEX_ID
          JOIN TB_META_TABLE        mt ON mt.TABLE_ID = mi.TABLE_ID
         WHERE ic.COLUMN_NAME LIKE 'SYS_NC%'
           AND ic.FUNC_EXPRESSION IS NULL;

    v_long_expr  LONG;
    v_short_expr VARCHAR2(2000);
    v_sql        VARCHAR2(500);
BEGIN
    FOR r IN cur_target LOOP
        BEGIN
            -- ALL_IND_EXPRESSIONS의 LONG 컬럼은 PL/SQL의 LONG 변수로 SELECT 가능
            EXECUTE IMMEDIATE
                'SELECT COLUMN_EXPRESSION FROM ALL_IND_EXPRESSIONS '
             || 'WHERE INDEX_OWNER = :1 AND INDEX_NAME = :2 AND COLUMN_POSITION = :3'
                INTO v_long_expr
                USING r.owner_name, r.INDEX_NAME, r.column_position;

            v_short_expr := SUBSTR(v_long_expr, 1, 2000);

            UPDATE TB_META_INDEX_COLUMN
               SET FUNC_EXPRESSION = v_short_expr
             WHERE INDEX_ID   = r.INDEX_ID
               AND COLUMN_POS = r.COLUMN_POS;
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                NULL;  -- 함수기반 인덱스가 아니면 스킵
        END;
    END LOOP;
    -- HIST는 §6.3에서 별도 적재 후 일괄 COMMIT
END;
/

-- =====================================================================
-- §6.3 HIST 적재 (보강 후 변경 이력 기록 - HIST_TYPE='U')
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
--   FUNC_EXPRESSION이 채워졌는지, HIST 'U' 행이 추가되었는지
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
