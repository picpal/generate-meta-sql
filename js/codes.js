/* =========================================================
 * 공통코드 (표준설계서 5장과 동일하게 유지)
 * 변경 시 이 파일만 수정 → 드롭다운 전체 반영
 * ========================================================= */

const CODES = {
  // 보관주기
  RETENTION_PERIOD: [
    { value: 'Y1',   name: '1년' },
    { value: 'Y3',   name: '3년' },
    { value: 'Y5',   name: '5년' },
    { value: 'Y10',  name: '10년' },
    { value: 'Y30',  name: '30년' },
    { value: 'PERM', name: '영구' },
  ],

  // 개인신용정보 분류 (신용정보법 시행령 기준)
  PCI_CATEGORY: [
    { value: 'IDENT',   name: '식별정보' },
    { value: 'TRX',     name: '신용거래정보' },
    { value: 'SCORE',   name: '신용도 정보' },
    { value: 'ABILITY', name: '신용능력 정보' },
    { value: 'PUBLIC',  name: '공공정보' },
  ],

  // 민감도 등급
  SENSITIVITY: [
    { value: 'HIGH', name: '높음' },
    { value: 'MID',  name: '보통' },
    { value: 'LOW',  name: '낮음' },
  ],

  // 격리 등급
  ISOLATION_LEVEL: [
    { value: 'L1', name: 'L1 (운영망)' },
    { value: 'L2', name: 'L2 (준격리)' },
    { value: 'L3', name: 'L3 (완전격리)' },
  ],

  // 상태
  STATUS: [
    { value: 'PLANNED',    name: '계획' },
    { value: 'ACTIVE',     name: '운영중' },
    { value: 'DEPRECATED', name: '폐기예정' },
  ],

  // 테이블 유형
  TABLE_TYPE: [
    { value: 'BASE',  name: '기본 테이블' },
    { value: 'VIEW',  name: '뷰' },
    { value: 'MVIEW', name: 'Materialized View' },
    { value: 'EXT',   name: '외부 테이블' },
  ],

  // 인덱스 유형
  INDEX_TYPE: [
    { value: 'NORMAL',   name: 'NORMAL' },
    { value: 'UNIQUE',   name: 'UNIQUE' },
    { value: 'BITMAP',   name: 'BITMAP' },
  ],

  // 인덱스 생성 목적
  INDEX_PURPOSE: [
    { value: 'PK',     name: 'PK' },
    { value: 'FK',     name: 'FK' },
    { value: 'SEARCH', name: '단건/범위 검색' },
    { value: 'JOIN',   name: '조인 성능' },
    { value: 'TUNING', name: '튜닝(사후 추가)' },
    { value: 'SORT',   name: '정렬' },
  ],

  // 시퀀스 용도
  SEQUENCE_PURPOSE: [
    { value: 'PK',      name: 'PK 채번' },
    { value: 'BIZ_KEY', name: '업무 채번' },
    { value: 'TEMP',    name: '일회성/임시' },
    { value: 'ETC',     name: '기타' },
  ],

  // 뷰 제외 사유
  VIEW_EXCLUDE_REASON: [
    { value: 'PCI',        name: '개인신용정보' },
    { value: 'PII',        name: '개인정보' },
    { value: 'INTERNAL',   name: '내부관리용' },
    { value: 'DEPRECATED', name: '사용중지' },
  ],

  // 마스킹 규칙
  MASKING_RULE: [
    { value: 'NAME',  name: '성명' },
    { value: 'RRN',   name: '주민등록번호' },
    { value: 'PHONE', name: '휴대전화' },
    { value: 'CARD',  name: '카드번호' },
    { value: 'EMAIL', name: '이메일' },
    { value: 'ADDR',  name: '주소' },
    { value: 'FULL',  name: '전체 마스킹' },
  ],

  // 서비스 — 사내 코드 실제 값으로 교체
  SERVICE: [
    { value: 'UNASSIGNED', name: '(미지정)' },
    { value: 'SVC_COMMON', name: '공통' },
    { value: 'SVC_CUST',   name: '고객' },
    { value: 'SVC_ACCT',   name: '계정' },
    { value: 'SVC_PAY',    name: '결제' },
    { value: 'SVC_LOAN',   name: '여신' },
    // TODO: 사내 실제 서비스 코드로 교체
  ],

  // 이용약관
  TOS: [
    { value: '',              name: '(해당없음)' },
    { value: 'TOS_MAIN_V3',   name: '본 서비스 이용약관 v3' },
    { value: 'TOS_MKT_V2',    name: '마케팅 정보 수신 약관 v2' },
    { value: 'TOS_CREDIT_V1', name: '신용정보 조회/제공 동의서 v1' },
    // TODO: 사내 실제 약관 코드로 교체
  ],

  // Oracle 데이터 타입 (자주 쓰는 것)
  DATA_TYPE: [
    'VARCHAR2', 'CHAR', 'NUMBER', 'DATE', 'TIMESTAMP',
    'CLOB', 'BLOB', 'RAW', 'FLOAT', 'BINARY_DOUBLE',
  ],

  // 길이 시맨틱 (VARCHAR2/CHAR 전용; 미지정 시 NLS_LENGTH_SEMANTICS 따름)
  LENGTH_SEMANTICS: ['BYTE', 'CHAR'],
};
