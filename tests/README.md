# 검증 스크립트

**외부 의존성 없음.** Node.js와 Python3 표준 라이브러리만 사용하므로
폐쇄망에서도 그대로 실행된다. 배포물(`index.html`)에는 포함되지 않는다.

## 실행

```bash
./tests/run.sh          # 전체. 하나라도 실패하면 종료코드 1
```

개별 실행:

```bash
node tests/t_field_ids.js                      # 폼 필드 정의 불변식
node tests/t_column.js                         # 탭2 컬럼 변경 SQL 생성
node tests/t_seq.js                            # 탭4 시퀀스 변경 SQL 생성
python3 tests/check_sql_inserts.py sql/*.sql   # SQL INSERT 컬럼/값 개수
```

## 무엇을 막는가

전부 실제로 발생했던 결함이다.

### `t_field_ids.js` — 폼 필드 정의 불변식

`readField()`/`isTouched()`는 `${prefix}-${name}` 으로 요소를 찾는다.
`colFields()`의 `id`가 이 규칙에서 벗어나면 **해당 입력은 영원히 읽히지 않고
화면에서 체크해도 SQL에 반영되지 않는다.** 실제로 `pciYn`/`encryptionYn`/
`maskingYn` 의 id가 `-pci`/`-enc`/`-mask` 여서 컬럼 추가·변경 양쪽에서
개인신용정보·암호화·마스킹 선택이 무시되고 있었다.

SQL 생성 테스트는 요소를 직접 만들어 주입하므로 이 결함을 **잡지 못한다.**
그래서 필드 정의 자체를 검사하는 테스트를 따로 둔다.

### `t_column.js` / `t_seq.js` — SQL 생성

최소 DOM 스텁으로 `genModify` / `genAlter`의 순수 생성 로직만 구동해
"어떤 SQL이 나오는가"를 직접 확인한다.

| 케이스 | 기대 |
|---|---|
| 아무 항목도 수정하지 않음 | 생성 차단 (감사 컬럼만 갱신하는 빈 HIST 방지) |
| 길이만 수정하고 타입 미선택 | 생성 차단 (Oracle MODIFY는 타입 없이 길이만 못 바꾼다) |
| 체크박스 하나만 ON | 그 컬럼만 `SET`, `ALTER TABLE MODIFY` 생략 |
| 미조작 필드 | `SET`·`ALTER`에 **나타나지 않아야 함** ← 누출 회귀의 핵심 |
| NOT NULL 메타 컬럼을 빈 값으로 | 생성 차단 (`ORA-01407`) |
| 시퀀스 캐시만 변경 | `CACHE` 절만 출력, `NOCYCLE`/`NOORDER`가 따라붙지 않음 |
| 시퀀스 최소값을 비움 | `NOMINVALUE` + `MIN_VALUE=NULL` (물리·메타 일치) |
| 제약 플래그 미조작 | 제약조건 블록 자체가 출력되지 않음 |

### `check_sql_inserts.py` — SQL 정합성

`sql/`의 모든 `INSERT`에서 컬럼 목록과 값 목록의 개수가 일치하는지 확인한다.
손으로 쓴 HIST 스냅샷 INSERT의 가장 흔한 실수다. 문자열 리터럴과 인라인
주석을 토크나이즈해 처리하므로 `--` 주석 안의 콤마에 속지 않는다.

## 테스트를 고칠 때

**단언을 추가했으면 회귀를 일부러 주입해 실제로 잡히는지 확인한다.**
이 테스트들은 실제로 다음 뮤테이션에서 실패하는 것을 확인했다.

```
SENSITIVITY_CD 를 무조건 SET      → FAIL 건드리지 않은 SENSITIVITY_CD 미포함
NULLABLE_YN 을 무조건 SET         → FAIL 건드리지 않은 NULLABLE_YN 미포함
제약 블록을 무조건 출력           → FAIL 제약 미조작 시 제약 블록 자체가 없음
CACHE_SIZE 를 truthy 판정으로 SET → FAIL 미조작 CACHE_SIZE 미포함
체크박스 id 를 -pci 로 되돌림     → FAIL col-add/col-mod: pciYn 의 id
```

통과만 하고 아무것도 잡지 못하는 테스트는 없느니만 못하다.
