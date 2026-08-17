# 2026-05-08 DB/API 키/기존 문서 안정화 기록

## 작업 목표

앱 업데이트 후 기존 데이터가 사라진 것처럼 보이지 않도록 IndexedDB, API 키 저장, 사례문서 조회 기준을 안정화했습니다.

직전 메뉴/라우트 정리 상태는 유지했습니다.

다시 연결하지 않은 기능:

- 인포메이트
- 소통 공간/커뮤니티
- 인트라넷

## IndexedDB 마이그레이션 방식

DB 이름은 기존과 동일하게 유지했습니다.

- DB 이름: `JJSS_LOCAL_DB`
- 현재 DB 버전: `3`
- 기존 store 이름 유지
- 새 store: `trainingState`

DB를 열 때 다음 순서로 처리합니다.

1. 지정 버전으로 DB를 엽니다.
2. `onupgradeneeded`에서 누락된 object store만 생성합니다.
3. 기존 object store는 삭제하거나 초기화하지 않습니다.
4. 사용자의 DB 버전이 코드보다 높은 경우에도 기존 DB를 열어 store 목록을 확인합니다.
5. `trainingState` 등 누락된 store가 있으면 현재 버전보다 1 높은 버전으로 다시 열어 누락 store만 추가합니다.

이 방식은 기존 `seekers`, `jobs`, `caseDocuments`, `expenses`, `settings` 데이터를 유지하면서 새 store를 추가합니다.

## API 키 저장/복호화 호환 방식

API 키는 런타임 메모리에서는 평문으로 사용하지만, IndexedDB 저장 시에는 암호화합니다.

호환 처리:

- 기존 평문 `apiKey` 읽기 지원
- 기존 `apiKey` 안에 암호문이 들어간 경우 읽기 지원
- `apiKeyEncrypted` 읽기 지원
- 기존 레거시 머신 지문 기반 암호화 키 복호화 시도
- 현재 installation id 기반 암호화 키 복호화 시도

저장 시 처리:

- `apiKey`는 빈 문자열로 저장
- 실제 키는 `apiKeyEncrypted`에 저장
- 기존 평문 키를 읽은 경우 자동으로 재암호화 저장
- 기존 암호문을 읽은 경우에도 현재 키 체계로 재암호화 저장

복호화 실패 시:

- 앱은 깨지지 않음
- API 키는 빈 값으로 처리
- 설정 화면에 “저장된 API 키 일부를 복호화하지 못했습니다. 앱은 계속 사용할 수 있지만, 설정 화면에서 해당 API 키를 다시 입력해 주세요.” 안내 표시

## caseDocuments 조회 기준

사례문서 조회는 동명이인 문서가 섞이지 않도록 다음 우선순위를 사용합니다.

1. `seeker.id`
2. `seeker.seekerId`
3. 문서의 `seekerId`, `clientId`, `userId`, `traineeId`
4. 이름 fallback

이름 fallback은 매우 제한적으로만 사용합니다.

- 해당 문서에 식별자 필드가 없고
- 이용자 DB에서 같은 이름이 정확히 1명일 때만 사용

즉, 동명이인이 있으면 이름만으로 문서를 연결하지 않습니다.

## 기존 문서 식별자 보강 마이그레이션

앱 초기 데이터 로드 후 기존 `caseDocuments`를 확인하여 가능한 경우 `seekerId`를 보강합니다.

처리 방식:

1. 모든 이용자와 사례문서를 로드합니다.
2. 문서의 `seekerId`, `clientId`, `userId`, `traineeId`가 현재 이용자의 `id` 또는 `seekerId`와 맞으면 해당 이용자로 판단합니다.
3. 식별자가 없는 구형 문서는 이름이 유일할 때만 보조 매칭합니다.
4. 매칭이 확실하면 문서의 `seekerId`를 현재 이용자의 canonical id로 보강합니다.
5. 매칭이 불확실하면 문서를 수정하지 않습니다.

## transaction 완료 기준

저장, 수정, 삭제는 IndexedDB request 성공 시점이 아니라 transaction `oncomplete` 이후에 성공 처리합니다.

적용 대상:

- `addDoc`
- `updateDoc`
- `deleteDoc`
- `getAll`
- `getById`
- `importAllData`

실패 시 오류를 throw하여 호출 화면에서 사용자 메시지를 띄울 수 있게 했습니다.

## export/import 범위

`exportAllData`와 `importAllData`는 `STORES` 목록 전체를 기준으로 작동합니다.

포함 store:

- `seekers`
- `jobs`
- `caseDocuments`
- `expenses`
- `resources`
- `posts`
- `comments`
- `settings`
- `trainingState`

보안상 export 시 API 키는 제거합니다.

- `apiKey`
- `apiKeyEncrypted`
- `visionApiKey`
- `visionApiKeyEncrypted`

`importAllData`는 기존 데이터를 대체하는 기능입니다. 실행 전 설정 화면과 네비게이션의 안내 문구는 기존 데이터가 대체된다는 점을 명확히 알립니다.

## 기존 데이터가 보존되는 이유

일반 앱 업데이트/DB 버전 업그레이드에서는 기존 데이터를 삭제하지 않습니다.

- object store 생성은 누락된 store만 대상으로 수행
- 기존 object store는 clear/delete/drop 하지 않음
- `trainingState` 추가도 누락 store 생성 방식
- 사례문서 마이그레이션은 매칭이 확실한 문서의 식별자만 보강
- 복호화 실패한 API 키는 삭제하지 않고, 앱에는 빈 키로 표시하여 재입력을 유도

단, 사용자가 명시적으로 백업 파일 불러오기를 실행하고 확인하면 import 기능 특성상 기존 데이터는 백업 파일 내용으로 대체됩니다.

## 변경 파일

- `src/config/localDB.ts`
- `src/store/dataStore.ts`
- `src/store/settingsStore.ts`

## 빌드 결과

`npm run build` 통과.

## 남은 위험 요소

- 기존 사례문서가 이름만 있고 동명이인이 존재하는 경우 자동 연결하지 않습니다. 이 경우 수동 확인 또는 별도 복구 도구가 필요합니다.
- API 키 복호화에 필요한 installation id/localStorage가 삭제된 경우 기존 암호문은 복구할 수 없습니다. 이 경우 API 키 재입력이 필요합니다.
- `importAllData`는 사용자가 확인 후 실행하는 데이터 대체 기능이므로, 잘못된 백업 파일을 가져오면 현재 데이터가 백업 파일 기준으로 바뀝니다.

