# JJSS 3.1 저장 데이터(디스크) 개인정보 감사

작성일: 2026-09-24 · 범위: IndexedDB `JJSS_LOCAL_DB`(DB_VERSION 3, store 9개), localStorage, Electron userData 파일.
DB_VERSION, store 이름, userData 경로, appId는 바꾸지 않았다. 기존 평문·구형식 값은 그대로 읽고, 해당 레코드를 다음에 정상 저장할 때 암호화한다.

## 1. 암호화 형식

| 형식 | 쓰는 때 | 비고 |
|---|---|---|
| `enc:v2:` | 운영체제 보안 저장소(Electron safeStorage: Windows DPAPI, macOS Keychain)로 보호되는 256비트 데이터 키 + AES-GCM | 배포용 앱의 정상 경로 |
| `enc:v1:` | 개발 모드(브라우저, 패키징하지 않은 Electron)에서 데이터 키가 없을 때만 | 배포용 앱에서는 새로 쓰지 않음(저장 차단). 기존 v1은 계속 읽고, 키가 있으면 다음 저장 때 v2로 |
| 접두어 없음 | 이전 버전 형식 | 읽기 전용, 다음 저장 때 재암호화 |

문자열이 아닌 값(배열·객체·숫자)은 JSON으로 직렬화해 통째로 암호화한다(평문 앞에 내부 표지를 붙여 원래 형식으로 복원).
데이터 키 파일 `userData/jjss-data-key.bin`에는 safeStorage로 암호화된 키만 저장된다. 원시 키는 localStorage·IndexedDB·로그·설정에 저장하지 않는다.

## 2. IndexedDB store별 저장 필드

| store | 저장 경로 | 필드 | 변경 전 | 변경 후 |
|---|---|---|---|---|
| seekers | dataStore.addSeeker/updateSeeker, 백업 복원 | name, seekerId, phone, address, birthDate, disabilityType, notes | 암호화 | 암호화 |
| | | age, severity, status, desiredJob1·2, desiredSalary, desiredWorkHours, desiredLocation, recommendingAgency, 사진(photoDataUrl 등)·가져오기로 들어온 기타 필드 | **평문** | 암호화 (id·organization·createdAt·updatedAt 외 전부) |
| | | id, organization, createdAt, updatedAt | 평문 | 평문(식별 불가 메타) |
| caseDocuments | dataStore(add/update/saveMatchingOpinion), 직업평가, 지원고용 storage, 백업 복원 | content, seekerName | 암호화 | 암호화 |
| | | seekerId(이전 데이터는 구직자ID·이름일 수 있음), title, companyName, jobRole, location, photoFileNames, clientId·clientName·userId·traineeId 등 | **평문** | 암호화 |
| | | id, type, tab, source, organization, createdAt, updatedAt, jobId, evaluationKind, legacyHistoryId, photoCount | 평문 | 평문(분류·정렬용) |
| trainingState | useTrainingState 자동 저장(`work-training`) | rooms(훈련생 이름·성별·메모·점수·사진 photoDataUrl), attendanceBook, progressBook, trainingRecords(상담·평가·현장 기록), manager | **전부 평문** | 필드별 JSON 통째 암호화 |
| | | id, progressYear, updatedAt | 평문 | 평문 |
| jobs | dataStore.addJob/updateJob | contactPerson, contactPhone (+contactEmail·managerName·managerPhone가 있으면) | **평문** | 암호화 |
| | | 회사명·직무·근무지·급여 등 | 평문 | 평문(개인정보 아님) |
| expenses | dataStore.addExpense/updateExpense | description, notes, vendor, vendorBizNo, cardLastFour, approvalNo | **평문** | 암호화 |
| | | date, category, budgetItem·project, 수량·단가·금액·부가세, paymentMethod, cardType | 평문 | 평문(예산 계산은 복호화 후 메모리에서 수행) |
| settings | settingsStore | llmConfigs[].apiKeyEncrypted, visionApiKeyEncrypted | 암호화(평문 apiKey는 ''로 저장) | 동일. 배포용 앱에서 키 없으면 저장 차단 |
| | | 모델·추론 수준·자동 전환 설정 | 평문 | 평문 |
| resources | 자료수집(InfoMate) | 제목·링크·메모·분류 | 평문 | 평문(공개 자료 목록. 개인정보 입력 용도 아님) |
| posts, comments | 사용하는 코드 없음 | — | — | — |

조회·필터는 모두 복호화 후 메모리에서 한다(IndexedDB 인덱스 없음, keyPath `id`만 사용). 따라서 암호화 범위를 넓혀도 사례문서의 이용자 연결(seekerId 매칭), 매칭 의견 찾기(companyName·jobRole 비교), 직무분석 조회(jobId)가 그대로 동작한다.

## 3. localStorage 키 전수

| 키 | 쓰는 곳 | 내용 | 판정 |
|---|---|---|---|
| `jjss-installation-id` | config/crypto.ts | 설치 고유 ID(v1·이전 형식 복호화 재료) | 허용(개인정보 아님) |
| `jjss:ai-request-count:v1` | services/aiRequestSafety.ts | 날짜별 AI 요청 횟수 | 허용 |
| `jjss:api-key-onboarding-v1` | components/ApiKeyOnboarding.tsx | 온보딩 선택값 | 허용 |
| `jjss:budget-projects` | pages/budget/budgetUtils.ts, 백업 복원 | 사업명·총예산·기간·비고·세부 항목(이름·금액·메모) | 이용자 개인정보 저장 용도 아님. 비고·메모는 자유 입력이라 이름을 적지 않도록 안내 필요(이관하지 않음, 보고) |
| `jjss:vocational-evaluation-history` | 이전 버전 직업평가 이력(평문), 이전 형식 백업 복원 | 결과분석·종합소견 | 읽기 전용 legacy. 직업평가 화면 진입 시 caseDocuments로 이관 → 암호화 저장·재조회 내용 일치 확인 후에만 삭제 |
| `jjss-matching-profile:*` | 이전 버전 매칭 의견 사본(평문) | 매칭 의견 | 읽기 전용 legacy. DB 저장 후 재조회 내용 일치 확인 시에만 삭제 |

새로 개인정보·상담 내용을 localStorage에 쓰는 코드는 없다(`setItem` 전수 확인).

## 4. 기타 디스크 데이터

| 위치 | 내용 | 판정 |
|---|---|---|
| userData/jjss-data-key.bin | safeStorage로 암호화된 데이터 키 | 원시 키 없음. 파일이 있는데 풀리지 않으면 덮어쓰지 않음 |
| userData/logs/main.log | 오류 이름·코드·가린 호출 위치 | 개인정보·경로·메시지 미기록 |
| JJSS 문서 폴더(내보낸 PDF·DOCX·PNG·CSV, 백업) | 사용자 파일 | 내보낸 문서는 암호화되지 않음(저장 알림에 보관 안내). 백업은 기본 비밀번호 암호화(PBKDF2-SHA256 310,000회 + AES-GCM), API 키 제외 |

## 5. 남은 한계

- 이미 저장된 평문·구형식 레코드는 앱 시작 후 백그라운드 재암호화(localStorage `jjss:at-rest-migration` 표지)로 enc:v2로 바뀐다. 배포용 앱에서 보안 키를 쓸 수 없으면 이 작업은 실행되지 않고 다음 실행 때 다시 시도한다. 복호화하지 못한 값은 원래 암호문을 그대로 보존한다.
- 복호화한 값은 앱 실행 중 메모리에 있다. PC 계정 자체가 탈취되면 보호 범위를 벗어난다.
- 암호화하지 않은 백업(고급 옵션)과 내보낸 문서는 사용자가 관리해야 한다.
