-- =====================================================================
-- 99_rollback.sql — 메타 스키마 전체 폐기 (긴급 롤백)
-- ⚠️ ⚠️ ⚠️ 신중 실행 — 모든 메타 데이터/이력 영구 삭제 ⚠️ ⚠️ ⚠️
-- 실행 권한: 메타 스키마 소유자 또는 DBA
-- 사전 점검:
--   1) 본 작업이 의도된 것인지 운영 책임자 승인 확인
--   2) 필요 시 백업 (CREATE TABLE BAK_TB_META_xxx_<DATE> AS SELECT * FROM ...)
--   3) 메타 테이블을 참조하는 외부 시스템/리포트가 있는지 확인
-- 정책: SQL DDL만 사용. PL/SQL 블록 없음.
-- =====================================================================

-- ---------------------------------------------------------------------
-- §99.1 FK 제약 제거 (DROP TABLE 순서 의존 해소)
-- ---------------------------------------------------------------------
ALTER TABLE TB_META_INDEX_COLUMN DROP CONSTRAINT FK_META_INDEX_COLUMN;
ALTER TABLE TB_META_INDEX        DROP CONSTRAINT FK_META_INDEX_TABLE;
ALTER TABLE TB_META_COLUMN       DROP CONSTRAINT FK_META_COLUMN_TABLE;

-- ---------------------------------------------------------------------
-- §99.2 HIST 테이블 폐기 (PURGE: 휴지통 거치지 않음)
-- ---------------------------------------------------------------------
DROP TABLE TB_META_INDEX_COLUMN_HIST PURGE;
DROP TABLE TB_META_INDEX_HIST        PURGE;
DROP TABLE TB_META_COLUMN_HIST       PURGE;
DROP TABLE TB_META_TABLE_HIST        PURGE;
DROP TABLE TB_META_SEQUENCE_HIST     PURGE;
DROP TABLE TB_META_CODE_HIST         PURGE;

-- ---------------------------------------------------------------------
-- §99.3 본 테이블 폐기
-- ---------------------------------------------------------------------
DROP TABLE TB_META_INDEX_COLUMN PURGE;
DROP TABLE TB_META_INDEX        PURGE;
DROP TABLE TB_META_COLUMN       PURGE;
DROP TABLE TB_META_SEQUENCE     PURGE;
DROP TABLE TB_META_TABLE        PURGE;
DROP TABLE TB_META_CODE         PURGE;

-- ---------------------------------------------------------------------
-- §99.4 시퀀스 폐기
-- ---------------------------------------------------------------------
DROP SEQUENCE SEQ_META_HIST_ID;
DROP SEQUENCE SEQ_META_SEQUENCE_ID;
DROP SEQUENCE SEQ_META_INDEX_ID;
DROP SEQUENCE SEQ_META_COLUMN_ID;
DROP SEQUENCE SEQ_META_TABLE_ID;

-- ---------------------------------------------------------------------
-- §99.5 검증 (실행 후 - 결과 0건이어야 함)
-- ---------------------------------------------------------------------
-- SELECT TABLE_NAME    FROM USER_TABLES    WHERE TABLE_NAME    LIKE 'TB_META_%';
-- SELECT SEQUENCE_NAME FROM USER_SEQUENCES WHERE SEQUENCE_NAME LIKE 'SEQ_META_%';
