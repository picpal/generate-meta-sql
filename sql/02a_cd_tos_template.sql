-- =====================================================================
-- 02a_cd_tos_template.sql — 사내 CD_TOS 코드그룹 적재 템플릿
-- 실행 순서: 2.5 / 3 (02 직후, 03 이전 — 사내 약관 사용 시 필수)
-- 선행: 02_common_code.sql
-- 후행: 03_initial_load.sql
-- 출처: 표준설계서 §5 (CD_TOS는 "사내 이용약관 체계에 맞게 적재"로 위임)
-- 사전 수정 필요: 아래 INSERT 행을 사내 실제 약관 코드로 교체
-- 정책: SQL DDL/DML만 사용. 02_common_code.sql과 동일한 NOT EXISTS 가드 +
--       TB_META_CODE_HIST 동시 적재 패턴 준수.
-- =====================================================================

-- ---------------------------------------------------------------------
-- CD_TOS 코드 적재 (예시 — 실제 약관 체계로 교체)
-- ---------------------------------------------------------------------
INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
SELECT 'CD_TOS','TOS001','일반회원약관','일반 회원 가입 약관',1,'INITIAL_LOAD','INITIAL_LOAD' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM TB_META_CODE WHERE CODE_GROUP='CD_TOS' AND CODE_VALUE='TOS001');

INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
SELECT 'CD_TOS','TOS002','마케팅수신약관','마케팅 정보 수신 동의 약관',2,'INITIAL_LOAD','INITIAL_LOAD' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM TB_META_CODE WHERE CODE_GROUP='CD_TOS' AND CODE_VALUE='TOS002');

INSERT INTO TB_META_CODE(CODE_GROUP, CODE_VALUE, CODE_NAME, DESCRIPTION, SORT_ORDER, CREATED_BY, UPDATED_BY)
SELECT 'CD_TOS','TOS003','3자정보제공약관','제3자 정보 제공 동의 약관',3,'INITIAL_LOAD','INITIAL_LOAD' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM TB_META_CODE WHERE CODE_GROUP='CD_TOS' AND CODE_VALUE='TOS003');

-- ↑ 사내 실제 약관 코드만큼 INSERT 블록을 추가/교체할 것

-- ---------------------------------------------------------------------
-- TB_META_CODE_HIST 동시 적재 ('I'/'INITIAL_LOAD' 중복 가드)
-- ---------------------------------------------------------------------
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
WHERE c.CODE_GROUP = 'CD_TOS'
  AND NOT EXISTS (
    SELECT 1 FROM TB_META_CODE_HIST h
     WHERE h.CODE_GROUP    = c.CODE_GROUP
       AND h.CODE_VALUE    = c.CODE_VALUE
       AND h.HIST_TYPE     = 'I'
       AND h.CHANGE_REASON = 'INITIAL_LOAD'
);

COMMIT;

-- 검증 (선택): 본↔HIST 행수 일치 확인
-- SELECT (SELECT COUNT(*) FROM TB_META_CODE      WHERE CODE_GROUP='CD_TOS') AS code_cnt,
--        (SELECT COUNT(*) FROM TB_META_CODE_HIST WHERE CODE_GROUP='CD_TOS' AND HIST_TYPE='I') AS hist_cnt
-- FROM DUAL;
