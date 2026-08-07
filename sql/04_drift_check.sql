-- =====================================================================
-- 04_drift_check.sql — 메타 ↔ 실제 DB Drift 감지 쿼리 (운영 점검용)
-- 실행 위치: 초기 적재(03) 완료 후, 일 1회 배치 권장
-- 선행: 01/02/03 적재 완료
-- 출처: DB_메타정보_관리체계_표준설계.md §8 (8.1~8.3)
-- 사전 수정 필요: 아래 DEFINE TARGET_SCHEMAS 한 줄만 고친다 (§8.1만 해당)
-- 정책: SQL DDL/DML만 사용. 결과를 별도 테이블에 적재하거나 메일 발송용
--       으로 SPOOL/CSV 추출하여 활용한다.
-- =====================================================================

SET DEFINE ON
SET VERIFY ON

-- ★★ 실행 전 이 한 줄만 고친다 ★★  (03_initial_load.sql 과 같은 값이어야 한다)
--   예: DEFINE TARGET_SCHEMAS = "'OWNER1','OWNER2','OWNER3'"
DEFINE TARGET_SCHEMAS = "'SVC1','SVC2'"

-- =====================================================================
-- §8.1 메타에 없지만 실제 DB에는 있는 객체 (Drift: META 누락)
--   §7.1과 동일한 필터(BIN$%, GTT, NESTED, IOT) 적용
--   ALL_TABLES(VIEW_YN='N')와 ALL_VIEWS(VIEW_YN='Y') 양쪽 점검 — §7.1 적재 대상과 1:1 대칭
--   결과 행은 메타 누락 → 03 재실행으로 자동 보충 가능
-- =====================================================================
SELECT t.OWNER, t.TABLE_NAME, 'N' AS VIEW_YN
FROM ALL_TABLES t
LEFT JOIN TB_META_TABLE mt
       ON mt.SCHEMA_NAME = t.OWNER AND mt.TABLE_NAME = t.TABLE_NAME
WHERE t.OWNER IN (&TARGET_SCHEMAS)
  AND mt.TABLE_ID IS NULL
  AND t.TABLE_NAME NOT LIKE 'BIN$%'
  AND t.TABLE_NAME NOT LIKE 'TB_META_%'
  AND t.TEMPORARY = 'N'
  AND t.NESTED    = 'NO'
  AND NVL(t.IOT_TYPE, 'HEAP') NOT IN ('IOT_OVERFLOW', 'IOT_MAPPING')
UNION ALL
SELECT v.OWNER, v.VIEW_NAME, 'Y' AS VIEW_YN
FROM ALL_VIEWS v
LEFT JOIN TB_META_TABLE mt
       ON mt.SCHEMA_NAME = v.OWNER AND mt.TABLE_NAME = v.VIEW_NAME
WHERE v.OWNER IN (&TARGET_SCHEMAS)
  AND mt.TABLE_ID IS NULL
  AND v.VIEW_NAME NOT LIKE 'BIN$%'
  AND v.VIEW_NAME NOT LIKE 'TB_META_%'
;

-- =====================================================================
-- §8.2 메타에는 ACTIVE인데 실제 DB에는 없는 객체 (Drift: 실제 누락)
--   VIEW_YN에 따라 카탈로그 뷰를 분기:
--     VIEW_YN='N' → ALL_TABLES, VIEW_YN='Y' → ALL_VIEWS
--   결과 행은 실제 객체 삭제 추적 누락 → STATUS_CD 'DEPRECATED' 변경 검토
-- =====================================================================
SELECT mt.SCHEMA_NAME, mt.TABLE_NAME, mt.VIEW_YN
FROM TB_META_TABLE mt
LEFT JOIN ALL_TABLES t
       ON mt.VIEW_YN = 'N'
      AND t.OWNER = mt.SCHEMA_NAME AND t.TABLE_NAME = mt.TABLE_NAME
LEFT JOIN ALL_VIEWS v
       ON mt.VIEW_YN = 'Y'
      AND v.OWNER = mt.SCHEMA_NAME AND v.VIEW_NAME = mt.TABLE_NAME
WHERE mt.STATUS_CD = 'ACTIVE'
  AND t.TABLE_NAME IS NULL
  AND v.VIEW_NAME  IS NULL
;

-- =====================================================================
-- §8.3 컬럼 정의 불일치 (양방향: 타입·길이·정밀·스케일·NULL 허용)
--   (a) 메타에 있는 컬럼 vs 실제: 정의 불일치 또는 실제 누락
--   (b) 실제에는 있는데 메타에는 없음
--   NUMBER 계열은 DATA_LENGTH=22 고정이라 의미 없으므로
--   DATA_PRECISION/DATA_SCALE 비교를 함께 수행
-- =====================================================================
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

-- 참고: CHAR 시맨틱 추가 점검 (선택)
--   tc.CHAR_USED='C' (VARCHAR2(N CHAR)) 대상은 tc.CHAR_LENGTH로 별도 비교
--   를 두어 byte/char 불일치를 검출. 위 (a) WHERE에 추가 조건으로 결합 가능.
