# 검증 스크립트

**외부 의존성 없음.** Node.js와 Python3 표준 라이브러리만 사용하므로
폐쇄망에서도 그대로 실행된다. 배포물(`index.html`)에는 포함되지 않는다.

## 실행

```bash
node tests/t_column.js      # 탭2 컬럼 변경 SQL 생성 검증
node tests/t_seq.js         # 탭4 시퀀스 변경 SQL 생성 검증
python3 tests/check_sql_inserts.py sql/*.sql   # INSERT 컬럼/값 개수 일치 검증
```

## 무엇을 막는가

`harness.js`는 최소 DOM 스텁으로 `genModify` / `genAlter`의 **순수 SQL 생성
로직**만 구동한다. 브라우저 없이 "어떤 SQL이 나오는가"를 직접 확인한다.

특히 다음 회귀를 막는다 — 모두 실제로 발생했던 결함이다.

| 케이스 | 기대 |
|---|---|
| 아무 항목도 수정하지 않음 | 생성 차단 (감사 컬럼만 갱신하는 빈 HIST 방지) |
| 길이만 수정하고 타입 미선택 | 생성 차단 (셀렉트 첫 값 `VARCHAR2`로 물리 타입이 바뀜) |
| 체크박스 하나만 ON | 해당 컬럼만 `SET`, `ALTER TABLE MODIFY` 생략 |
| NOT NULL 메타 컬럼을 빈 값으로 | 생성 차단 (`ORA-01407`) |
| 시퀀스 캐시만 변경 | `CACHE` 절만 출력 (`NOCYCLE`/`NOORDER` 등이 따라붙지 않음) |
| 시퀀스 최소값을 비움 | `NOMINVALUE` + `MIN_VALUE=NULL` (물리·메타 일치) |

`check_sql_inserts.py`는 `sql/`의 모든 `INSERT`에서 컬럼 목록과 값 목록의
개수가 일치하는지 확인한다. 손으로 쓴 HIST 스냅샷 INSERT의 가장 흔한 실수다.
