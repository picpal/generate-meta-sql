-- =====================================================================
-- 05_integrity_check.sql — 메타 적재 후 정합성/운영 점검 쿼리 모음
-- 실행 위치: 02·03 적재 직후 검증 + 일상 운영 점검 (수시)
-- 선행: 01/02/03 완료 (CD_TOS 사용 시 02a 포함)
-- 정책: SELECT만 — 데이터 변경 없음. 결과는 화면 확인 또는 SPOOL.
-- =====================================================================

-- =====================================================================
-- §5.1 코드 적재 검증 (02 실행 직후)
--   기대 행수:
--     CD_RETENTION_PERIOD 6, CD_PCI_CATEGORY 5, CD_SENSITIVITY 3,
--     CD_ISOLATION_LEVEL 3, CD_STATUS 3,
--     CD_INDEX_TYPE 5, CD_INDEX_PURPOSE 6, CD_SEQUENCE_PURPOSE 4,
--     CD_MASKING_RULE 7, CD_SERVICE 1
--     (+ CD_TOS 는 사내 약관 적재 후)
-- =====================================================================
SELECT CODE_GROUP, COUNT(*) AS cnt
  FROM TB_META_CODE
 GROUP BY CODE_GROUP
 ORDER BY CODE_GROUP;

-- =====================================================================
-- §5.2 본 ↔ HIST 행수 일치 검증  ★ 초기 적재(03) 직후 전용 ★
--   모든 행에서 main = hist 이어야 함
--
--   ⚠️ 일상 변경 검증에는 쓰지 않는다.
--      hist 쪽 카운트가 CHANGE_REASON='INITIAL_LOAD' 인 'I' 이력만 세므로,
--      초기 적재 이후 테이블/컬럼을 하나라도 추가하면 main > hist 가 되어
--      영구히 불일치로 보인다. 이는 정상이며 결함이 아니다.
--      단건·배치 변경의 검증은 §5.8 을 사용한다.
-- =====================================================================
SELECT 'TABLE'    AS src,
       (SELECT COUNT(*) FROM TB_META_TABLE)             AS main,
       (SELECT COUNT(*) FROM TB_META_TABLE_HIST
         WHERE HIST_TYPE='I' AND CHANGE_REASON='INITIAL_LOAD') AS hist
  FROM DUAL
UNION ALL
SELECT 'COLUMN',
       (SELECT COUNT(*) FROM TB_META_COLUMN),
       (SELECT COUNT(*) FROM TB_META_COLUMN_HIST
         WHERE HIST_TYPE='I' AND CHANGE_REASON='INITIAL_LOAD')
  FROM DUAL
UNION ALL
SELECT 'INDEX',
       (SELECT COUNT(*) FROM TB_META_INDEX),
       (SELECT COUNT(*) FROM TB_META_INDEX_HIST
         WHERE HIST_TYPE='I' AND CHANGE_REASON='INITIAL_LOAD')
  FROM DUAL
UNION ALL
SELECT 'INDEX_COL',
       (SELECT COUNT(*) FROM TB_META_INDEX_COLUMN),
       (SELECT COUNT(*) FROM TB_META_INDEX_COLUMN_HIST
         WHERE HIST_TYPE='I' AND CHANGE_REASON='INITIAL_LOAD')
  FROM DUAL
UNION ALL
SELECT 'SEQUENCE',
       (SELECT COUNT(*) FROM TB_META_SEQUENCE),
       (SELECT COUNT(*) FROM TB_META_SEQUENCE_HIST
         WHERE HIST_TYPE='I' AND CHANGE_REASON='INITIAL_LOAD')
  FROM DUAL
UNION ALL
SELECT 'CODE',
       (SELECT COUNT(*) FROM TB_META_CODE),
       (SELECT COUNT(*) FROM TB_META_CODE_HIST
         WHERE HIST_TYPE='I' AND CHANGE_REASON='INITIAL_LOAD')
  FROM DUAL
;

-- =====================================================================
-- §5.3 코드값 무결성 검증 (참조 정합성)
--   TB_META_TABLE의 코드 컬럼이 모두 TB_META_CODE에 존재하는지
--   결과 0건이어야 정상
-- =====================================================================
SELECT t.TABLE_ID, t.SCHEMA_NAME, t.TABLE_NAME,
       '잘못된 SERVICE_CD: '||t.SERVICE_CD AS issue
  FROM TB_META_TABLE t
 WHERE NOT EXISTS (
       SELECT 1 FROM TB_META_CODE c
        WHERE c.CODE_GROUP='CD_SERVICE' AND c.CODE_VALUE = t.SERVICE_CD
   )
UNION ALL
SELECT t.TABLE_ID, t.SCHEMA_NAME, t.TABLE_NAME,
       '잘못된 RETENTION_PERIOD_CD: '||t.RETENTION_PERIOD_CD
  FROM TB_META_TABLE t
 WHERE NOT EXISTS (
       SELECT 1 FROM TB_META_CODE c
        WHERE c.CODE_GROUP='CD_RETENTION_PERIOD' AND c.CODE_VALUE = t.RETENTION_PERIOD_CD
   )
UNION ALL
SELECT t.TABLE_ID, t.SCHEMA_NAME, t.TABLE_NAME,
       '잘못된 STATUS_CD: '||t.STATUS_CD
  FROM TB_META_TABLE t
 WHERE NOT EXISTS (
       SELECT 1 FROM TB_META_CODE c
        WHERE c.CODE_GROUP='CD_STATUS' AND c.CODE_VALUE = t.STATUS_CD
   )
;

-- =====================================================================
-- §5.4 SENSITIVITY_CD 검증 (CD_SENSITIVITY 적재 확인)
--   결과 0건이어야 정상
-- =====================================================================
SELECT c.COLUMN_ID, c.TABLE_ID, c.COLUMN_NAME, c.SENSITIVITY_CD
  FROM TB_META_COLUMN c
 WHERE NOT EXISTS (
       SELECT 1 FROM TB_META_CODE m
        WHERE m.CODE_GROUP='CD_SENSITIVITY' AND m.CODE_VALUE = c.SENSITIVITY_CD
   )
;

-- =====================================================================
-- §5.5 컬럼 코드값 무결성 검증
-- =====================================================================
SELECT c.COLUMN_ID, c.COLUMN_NAME,
       '잘못된 STATUS_CD: '||c.STATUS_CD AS issue
  FROM TB_META_COLUMN c
 WHERE NOT EXISTS (
       SELECT 1 FROM TB_META_CODE m
        WHERE m.CODE_GROUP='CD_STATUS' AND m.CODE_VALUE = c.STATUS_CD
   )
UNION ALL
SELECT c.COLUMN_ID, c.COLUMN_NAME,
       '잘못된 PCI_CATEGORY_CD: '||c.PCI_CATEGORY_CD
  FROM TB_META_COLUMN c
 WHERE c.PCI_CATEGORY_CD IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM TB_META_CODE m
        WHERE m.CODE_GROUP='CD_PCI_CATEGORY' AND m.CODE_VALUE = c.PCI_CATEGORY_CD
   )
UNION ALL
SELECT c.COLUMN_ID, c.COLUMN_NAME,
       '잘못된 MASKING_RULE_CD: '||c.MASKING_RULE_CD
  FROM TB_META_COLUMN c
 WHERE c.MASKING_RULE_CD IS NOT NULL
   AND NOT EXISTS (
       SELECT 1 FROM TB_META_CODE m
        WHERE m.CODE_GROUP='CD_MASKING_RULE' AND m.CODE_VALUE = c.MASKING_RULE_CD
   )
;

-- =====================================================================
-- §5.6 인덱스/시퀀스 코드값 무결성
-- =====================================================================
SELECT i.INDEX_ID, i.INDEX_NAME,
       '잘못된 INDEX_TYPE_CD: '||i.INDEX_TYPE_CD AS issue
  FROM TB_META_INDEX i
 WHERE NOT EXISTS (
       SELECT 1 FROM TB_META_CODE m
        WHERE m.CODE_GROUP='CD_INDEX_TYPE' AND m.CODE_VALUE = i.INDEX_TYPE_CD
   )
UNION ALL
SELECT i.INDEX_ID, i.INDEX_NAME,
       '잘못된 PURPOSE_CD: '||i.PURPOSE_CD
  FROM TB_META_INDEX i
 WHERE NOT EXISTS (
       SELECT 1 FROM TB_META_CODE m
        WHERE m.CODE_GROUP='CD_INDEX_PURPOSE' AND m.CODE_VALUE = i.PURPOSE_CD
   )
UNION ALL
SELECT s.SEQUENCE_ID, s.SEQUENCE_NAME,
       '잘못된 PURPOSE_CD: '||s.PURPOSE_CD
  FROM TB_META_SEQUENCE s
 WHERE NOT EXISTS (
       SELECT 1 FROM TB_META_CODE m
        WHERE m.CODE_GROUP='CD_SEQUENCE_PURPOSE' AND m.CODE_VALUE = s.PURPOSE_CD
   )
;

-- =====================================================================
-- §5.7 동시 실행 / Lock 충돌 진단 (운영 중 트러블슈팅)
--   메타 테이블에 누가 lock을 걸고 있는지 확인
-- =====================================================================
SELECT s.sid, s.serial#, s.username, s.status, l.type, o.object_name
  FROM v$session s
  JOIN v$lock    l ON s.sid       = l.sid
  JOIN dba_objects o ON l.id1 = o.object_id
 WHERE o.object_name LIKE 'TB_META_%'
;

-- =====================================================================
-- §5.8 일상 변경 검증 (단건·배치 변경 직후)
--   §5.2는 초기 적재 전용이므로, 운영 중 변경은 여기서 검증한다.
--   실행 전 아래 DEFINE을 채운다.
-- =====================================================================
SET DEFINE ON
DEFINE SCHEMA = SVC1
DEFINE TBL    = TB_MEMBER
DEFINE COL    = MEMBER_NM
DEFINE REASON = 방금 입력한 CHANGE_REASON 그대로

-- §5.8.1 테이블 — 본 테이블 값과 최신 HIST 스냅샷이 같은지
--   기대: 한 행이 나오고, 좌우 값이 모두 같아야 한다.
SELECT t.SCHEMA_NAME, t.TABLE_NAME,
       t.SERVICE_CD    AS MAIN_SERVICE,  h.SERVICE_CD    AS HIST_SERVICE,
       t.OWNER_EMP_ID  AS MAIN_OWNER,    h.OWNER_EMP_ID  AS HIST_OWNER,
       t.PCI_YN        AS MAIN_PCI,      h.PCI_YN        AS HIST_PCI,
       t.VIEW_YN       AS MAIN_VIEW,     h.VIEW_YN       AS HIST_VIEW,
       t.STATUS_CD     AS MAIN_STATUS,   h.STATUS_CD     AS HIST_STATUS,
       h.HIST_TYPE, h.HIST_BY, h.CHANGE_REASON, h.HIST_AT
  FROM TB_META_TABLE t
  JOIN TB_META_TABLE_HIST h ON h.TABLE_ID = t.TABLE_ID
 WHERE t.SCHEMA_NAME = '&SCHEMA' AND t.TABLE_NAME = '&TBL'
   AND h.HIST_ID = (SELECT MAX(HIST_ID) FROM TB_META_TABLE_HIST WHERE TABLE_ID = t.TABLE_ID)
;

-- §5.8.2 컬럼 — 본 테이블 값과 최신 HIST 스냅샷이 같은지
SELECT c.COLUMN_NAME,
       c.DATA_TYPE      AS MAIN_TYPE,   h.DATA_TYPE      AS HIST_TYPE_VAL,
       c.DATA_LENGTH    AS MAIN_LEN,    h.DATA_LENGTH    AS HIST_LEN,
       c.NULLABLE_YN    AS MAIN_NULL,   h.NULLABLE_YN    AS HIST_NULL,
       c.PCI_YN         AS MAIN_PCI,    h.PCI_YN         AS HIST_PCI,
       c.SENSITIVITY_CD AS MAIN_SENS,   h.SENSITIVITY_CD AS HIST_SENS,
       c.MASKING_YN     AS MAIN_MASK,   h.MASKING_YN     AS HIST_MASK,
       c.STATUS_CD      AS MAIN_STATUS, h.STATUS_CD      AS HIST_STATUS,
       h.HIST_TYPE, h.HIST_BY, h.CHANGE_REASON, h.HIST_AT
  FROM TB_META_COLUMN c
  JOIN TB_META_TABLE  t ON t.TABLE_ID = c.TABLE_ID
  JOIN TB_META_COLUMN_HIST h ON h.COLUMN_ID = c.COLUMN_ID
 WHERE t.SCHEMA_NAME = '&SCHEMA' AND t.TABLE_NAME = '&TBL'
   AND c.COLUMN_NAME = '&COL'
   AND h.HIST_ID = (SELECT MAX(HIST_ID) FROM TB_META_COLUMN_HIST WHERE COLUMN_ID = c.COLUMN_ID)
;

-- §5.8.3 배치 단위 — 이번 CHANGE_REASON으로 남은 이력 건수
--   기대: 변경 의도한 행수와 일치. 0이면 HIST INSERT를 빠뜨린 것이다.
SELECT 'TABLE'        AS SRC, COUNT(*) AS CNT FROM TB_META_TABLE_HIST        WHERE CHANGE_REASON = '&REASON'
UNION ALL SELECT 'COLUMN',       COUNT(*) FROM TB_META_COLUMN_HIST       WHERE CHANGE_REASON = '&REASON'
UNION ALL SELECT 'INDEX',        COUNT(*) FROM TB_META_INDEX_HIST        WHERE CHANGE_REASON = '&REASON'
UNION ALL SELECT 'INDEX_COLUMN', COUNT(*) FROM TB_META_INDEX_COLUMN_HIST WHERE CHANGE_REASON = '&REASON'
UNION ALL SELECT 'SEQUENCE',     COUNT(*) FROM TB_META_SEQUENCE_HIST     WHERE CHANGE_REASON = '&REASON'
;

-- §5.8.4 이력 누락 상시 점검 — 본 테이블에 있는데 HIST가 하나도 없는 행
--   기대: 전부 0건. 0이 아니면 HIST 없이 본 테이블만 손댄 경로가 있다는 뜻이다.
SELECT 'TABLE' AS SRC, COUNT(*) AS ORPHAN FROM TB_META_TABLE t
 WHERE NOT EXISTS (SELECT 1 FROM TB_META_TABLE_HIST h WHERE h.TABLE_ID = t.TABLE_ID)
UNION ALL
SELECT 'COLUMN', COUNT(*) FROM TB_META_COLUMN c
 WHERE NOT EXISTS (SELECT 1 FROM TB_META_COLUMN_HIST h WHERE h.COLUMN_ID = c.COLUMN_ID)
UNION ALL
SELECT 'INDEX', COUNT(*) FROM TB_META_INDEX i
 WHERE NOT EXISTS (SELECT 1 FROM TB_META_INDEX_HIST h WHERE h.INDEX_ID = i.INDEX_ID)
UNION ALL
SELECT 'INDEX_COLUMN', COUNT(*) FROM TB_META_INDEX_COLUMN ic
 WHERE NOT EXISTS (SELECT 1 FROM TB_META_INDEX_COLUMN_HIST h
                    WHERE h.INDEX_ID = ic.INDEX_ID AND h.COLUMN_POS = ic.COLUMN_POS)
UNION ALL
SELECT 'SEQUENCE', COUNT(*) FROM TB_META_SEQUENCE s
 WHERE NOT EXISTS (SELECT 1 FROM TB_META_SEQUENCE_HIST h WHERE h.SEQUENCE_ID = s.SEQUENCE_ID)
;

-- §5.8.5 자동화 상수 오용 점검
--   담당자 수동 변경 경로에서 INITIAL_LOAD / SYSTEM_SYNC 를 쓰면 안 된다(표준 §6.8).
--   HIST_BY='UNKNOWN' 은 사번 미입력 상태로 생성된 SQL을 실행했다는 뜻이다.
SELECT 'TABLE' AS SRC, HIST_ID, HIST_TYPE, HIST_BY, CHANGE_REASON, HIST_AT
  FROM TB_META_TABLE_HIST
 WHERE HIST_BY = 'UNKNOWN'
    OR (HIST_TYPE <> 'I' AND CHANGE_REASON IN ('INITIAL_LOAD','SYSTEM_SYNC'))
UNION ALL
SELECT 'COLUMN', HIST_ID, HIST_TYPE, HIST_BY, CHANGE_REASON, HIST_AT
  FROM TB_META_COLUMN_HIST
 WHERE HIST_BY = 'UNKNOWN'
    OR (HIST_TYPE <> 'I' AND CHANGE_REASON IN ('INITIAL_LOAD','SYSTEM_SYNC'))
 ORDER BY 6 DESC
;
