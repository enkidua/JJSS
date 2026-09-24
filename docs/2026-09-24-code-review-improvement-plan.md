# JJSS 코드 전반 검토 및 개선 계획서

작성일: 2026-09-24
검토 기준: 커밋 `ebd382d` 이후 작업 트리(미커밋 변경 포함), 앱 v3.0.0
검토 범위: `src/` 전체, `electron/`, `scripts/`, `package.json` 빌드 설정, `website/`

이 문서는 **고쳐야 할 곳만** 정리했다. 문제없음으로 확인된 부분은 맨 끝에 짧게 적었다.

> **처리 결과 (2026-09-24 같은 날 일괄 반영, 커밋 전)**
> - P0·P1·P2·P3·W 전 항목을 반영했다. 아래 "남은 일"만 코드 밖 작업이라 하지 않았다.
> - 검증: 타입체크(미사용 코드 검사 포함) 0건, 프로덕션 빌드 성공(시작 청크 121KB), `npm run test:all` 10종 통과(PASS 100건), `npm run test:usability` 10종 통과, 홈페이지 tsc·lint·build 통과.
> - 추가된 테스트: `test:anonymizer`, `test:crypto`, `test:usability`, `test:all`. `tsconfig.app.json`에서 `noUnusedLocals`·`noUnusedParameters`를 켰다.
> - 동작이 바뀐 점:
>   - 저장 데이터 암호화 키가 Windows 계정(DPAPI)에 묶인다. 사용자 폴더를 다른 PC로 복사하는 방식은 더 이상 통하지 않으며, PC를 옮길 때는 백업 파일(비밀번호 권장)로 복원한다.
>   - 기존 레코드는 다음에 저장될 때 새 형식으로 다시 암호화된다(일괄 변환 없음).
>   - 파일 기본 저장 위치는 `문서\JJSS`다. 기존에 `D:\JJSS`에 파일이 있던 사용자는 D:를 계속 쓴다.
>   - 확인창·알림은 앱 안의 대화상자와 토스트로 바뀌었다. 저장하지 않은 내용이 있으면 메뉴 이동 시 확인한다.
> - 남은 일(사용자 조치 필요):
>   - `vision_key.json`(GCP 서비스 계정 개인키)을 OneDrive 밖 안전한 곳으로 옮기고, 쓰지 않으면 GCP에서 키를 폐기한다.
>   - `release/`(624MB), 코드 압축 파일 2개, `CHATGPT_*` 로그, `.netlify/`는 삭제 여부를 직접 결정한다.
>   - 홈페이지 배포 환경에 `NEXT_PUBLIC_SITE_URL`을 설정한다(없으면 프로덕션 빌드가 의도적으로 실패한다).
>   - 설치 파일(electron-builder)은 만들지 않았다. 서명 빌드 후 실제 설치·업그레이드를 수동 확인한다.
>   - 직업훈련 훈련생 이름, 사업체 담당자 연락처는 아직 평문 저장이다. 이미지·PDF 안의 개인정보는 로컬에서 가릴 수 없다.

---

## 1. 자동 검증 결과 (2026-09-24 실행)

| 항목 | 결과 | 비고 |
|---|---|---|
| `tsc -p tsconfig.app.json --noEmit` | 통과 | 9/22에 있던 `WorkMate.tsx` `savingDocumentType` 오류는 9/23 수정됨 |
| `vite build` | 통과 | 단일 JS 청크 1.84MB(gzip 510KB), 청크 분리 경고 |
| `test:rehab-plan-mapper` | 통과 | |
| `test:rehab-workflow` | 통과 | |
| `test:file-service` | 통과 | 9/22에는 D:\ 기본 경로 때문에 실패. 현재는 platform 위장으로 우회(아래 B-5) |
| `test:runtime-safety` | 통과 | 소스 문자열 정규식 매칭 위주라 실제 동작 검증력은 약함 |
| `test:ai-settings`, `test:ai-safety`, `test:ai-api` | 통과 | |
| `check:release` | 통과 | |
| `scripts/test-usability.cjs` | **실행 불가** | `playwright`가 devDependencies에 없고 npm script도 없음 |

> 참고: 9/22 시점에는 `tailwind.config.cjs`, `postcss.config.cjs`가 디스크에서 빠져 있어 빌드 CSS가 9KB(Tailwind 미적용)였다. 9/23 복원 후 105KB로 정상이다. 이 두 파일이 다시 누락되면 빌드는 성공하지만 화면 스타일이 전부 깨지므로, `check:release`에 존재 여부 검사를 추가할 것을 권장한다.

---

## 2. 우선순위 요약

| 단계 | 주제 | 건수 | 목표 |
|---|---|---|---|
| **P0** | 개인정보·보안 (즉시) | 8 | 외부 AI 전송 전 비식별화, 저장 데이터 보호 |
| **P1** | 기능 오류·데이터 손실 | 22 | 잘못된 결과, 중복 저장, 입력 유실 차단 |
| **P2** | 사용성 | 16 | 비전문가 사용자의 혼란·실수 감소 |
| **P3** | 유지보수·정리 | 12 | 중복 제거, 대형 파일 분리, 죽은 코드 삭제 |
| **W** | 홈페이지(`website/`) | 8 | 배포 전 SEO·링크 오류 수정 |

---

## 3. P0 — 개인정보·보안 (즉시 수정)

### P0-1. 비식별화 도구가 원문을 외부 AI로 그대로 전송
- 위치: `src/services/gemini.ts:1165-1167`, `src/components/MaskingView.tsx:32-37`
- 현상: `type === 'masking'`이면 `anonymizeText`를 건너뛰고 원문(이름·주민번호 포함)을 Gemini/OpenAI/Claude로 보낸다. failover가 켜져 있으면 다른 제공업체로도 간다.
- 수정: 로컬 규칙 마스킹을 기본으로 하고, AI 보강은 동의 체크 후 1차 마스킹된 텍스트만 전송. 이 기능에서는 cross-provider failover 강제 차단.

### P0-2. anonymizer가 실제 개인정보를 대부분 놓침
- 위치: `src/utils/anonymizer.ts:18, 37, 71`
- 현상(직접 실행 확인):
  - 이름은 `이름:`/`성명:` 라벨이 있을 때만 잡힌다. 본문의 "김철수 님", 보호자·직원 이름은 그대로 전송된다.
  - `나이: 32세` → `30대세`, `35세 남성`은 마스킹 안 됨(JS `\b`는 한글 경계를 인식하지 못함).
  - `split(name).join(alias)`로 "김수"를 치환하면 "김수현"이 "김가명현"이 된다.
  - 외국인등록번호(뒷자리 5~8), 하이픈 없는 13자리 주민번호 누락.
- 수정:
  - 나이 `/(\d{1,2})\s*세(?![가-힣])/`, 주민번호 `[1-8]` + 하이픈 선택.
  - 이용자 DB의 이름 목록(+보호자·담당자)을 사전으로 받아 치환.
  - anonymizer 단위 테스트 신설(현재 0개).

### P0-3. 복원(deanonymize)이 AI 결과를 왜곡
- 위치: `src/utils/anonymizer.ts:45-47, 55-56`, `gemini.ts:1255`
- 현상: 매핑 키가 `30대`, `서울특별시 마포구` 같은 일반 명사라서, AI가 쓴 "30대 이용자"가 "32 이용자"로, "마포구 소재"가 상세주소 전체로 되돌아간다.
- 수정: 나이·주소는 일반화 상태로 두고 복원 대상에서 제외. 복원이 필요한 항목만 `⟦P1⟧` 같은 고유 토큰 사용.

### P0-4. 그 밖에 비식별화를 거치지 않는 AI 경로
- `analyzeTestResults`의 `directInput`(`gemini.ts:1533-1536`), 영수증 OCR 텍스트(`ocr.ts:672`).
- PDF를 Gemini Files API로 올린 뒤 삭제하지 않음(`gemini.ts:1408`, 약 48시간 서버 보관).
- 수정: 두 경로에 anonymize/deanonymize 적용, 업로드 후 `ai.files.delete` 호출.

### P0-5. 백업 JSON이 개인정보 평문
- 위치: `src/config/localDB.ts:253-273`
- 현상: `getAll()`이 복호화한 값을 그대로 내보내 이름·사례문서·장애유형·연락처가 평문 파일로 저장된다(USB·메일로 유출 위험).
- 수정: 백업 비밀번호 기반 암호화(PBKDF2 → AES-GCM, salt·iv 포함 봉투 형식). 최소한 평문 경고와 동의 절차.

### P0-6. "암호화"가 사실상 난독화, 보호 범위도 좁음
- 위치: `src/config/crypto.ts:10, 80`, `localDB.ts:29-32`
- 현상:
  - 키 재료가 하드코딩 `APP_SEED` + 같은 프로필 폴더의 localStorage `jjss-installation-id`. 프로필 폴더만 복사하면 API 키·이름 모두 복호화 가능.
  - 암호화 필드는 `name`, `seekerId`, `content`뿐. `phone`, `address`, `birthDate`, `disabilityType`, `notes`, `caseDocuments.seekerName`은 평문.
- 수정: 키를 Electron `safeStorage`(Windows DPAPI)로 main 프로세스에서 보호하고 IPC로 전달. `SENSITIVE_FIELDS` 확대(기존 레코드는 다음 저장 시 암호화).

### P0-7. localStorage에 평문 개인정보 저장
- `jjss:vocational-evaluation-history`(`VocationalEvaluation.tsx:50-61`): 평가 결과·종합소견서 전문.
- `jjss-matching-profile:*`(`MatchingView.tsx:291`): DB 저장 후 평문 사본을 또 남김. 백업·삭제 대상에도 없음.
- 수정: 평가 이력은 `caseDocuments`(source `evaluation`)로 이관, 매칭 사본은 제거 후 기존 키 마이그레이션 삭제.

### P0-8. API 키가 URL 쿼리에 포함
- 위치: `src/services/ocr.ts:93, 173, 687` (`?key=`)
- 현상: 실패한 요청 URL이 DevTools 콘솔·로그에 키째 남는다. 인코딩도 없음.
- 수정: `x-goog-api-key` 헤더 사용. 가능하면 `@google/genai` SDK로 통일.

---

## 4. P1 — 기능 오류·데이터 손실

### 4-A. AI 호출
| # | 위치 | 문제 | 수정 |
|---|---|---|---|
| A-1 | `aiRequestSafety.ts:145-208` | fetch 시간제한 없음. 응답이 멈추면 `activeFeatureJobs`에 남아 해당 기능이 앱 재시작 전까지 "이미 처리 중"으로 잠김 | `AbortSignal.any([userSignal, AbortSignal.timeout(90_000)])`, 파일 작업 180초. 시간 초과 전용 메시지 |
| A-2 | `gemini.ts:1024, 1069` | OpenAI/Anthropic 출력 한도 4096 고정 → 긴 보고서·블로그가 잘림 | 제공업체별 상수(16k 이상) |
| A-3 | `gemini.ts:1471`, `ocr.ts:107, 699` | 파일 분석 경로가 `finishReason`(MAX_TOKENS/SAFETY) 미확인, 첫 part만 읽음 → 잘린·빈 보고서 저장 | `requireAIText` 재사용, part 전체 결합 |
| A-4 | `ocr.ts:700-708` | 영수증 JSON을 정규식 추출 후 검증 없이 펼침. `"12,000"` 문자열 통과 | `responseSchema` 사용, 숫자 필드 정규화 |
| A-5 | `aiErrorClassification.ts:22`, `gemini.ts:1033-1038, 1080-1085` | Gemini "exceeded your current quota"가 rateLimit으로, Anthropic "credit balance is too low"가 일반 오류로 분류됨 → 잘못된 안내, failover 미작동 | 제공업체 메시지를 분류용으로 보관, 정규식 추가 |
| A-6 | `gemini.ts:1424` | 20MB PDF를 inline base64로 바꾸면 약 27MB → 한도 초과로 항상 실패 | inline은 약 14MB 이하만 |
| A-7 | `gemini.ts:903` | 401 같은 인증 오류도 30초 차단에 포함 → 키를 고쳐도 "오류가 반복되어…"만 표시 | auth/permission 오류는 차단 제외 |
| A-8 | `aiModels.ts:88-131` | `claude-opus-4-8`이 premium failover·마이그레이션 대상인데 존재 여부 미확인. 없으면 404 | 실제 API로 확인 후 `claude-opus-5`로 교체 검토 |
| A-9 | `matching.ts:57, 61` | `/시|군|구$/` 우선순위 오류로 "시흥시" → "흥시" | `/(시|군|구)$/` |

### 4-B. 중복 실행·중복 저장 (AI 비용 직결)
| # | 위치 | 문제 | 수정 |
|---|---|---|---|
| B-1 | `WorkTraining.tsx:452, 538, 575, 634, 676` | 버튼마다 자기 종류만 보고 비활성화. 동시 실행 가능하고, 먼저 끝난 쪽이 모든 버튼을 다시 풂 | 핸들러 첫 줄 `if (generating) return;`, 전체 버튼 `generating !== null`로 비활성화 |
| B-2 | `WorkTraining.tsx:778, 2195-2198` | "현재 내용 기반 보완" 버튼이 생성 중에도 눌림, 스피너 없음 | `ResultActionBar`에 `isRewriting` prop |
| B-3 | `WorkMate.tsx:421-470, 1145-1148` | 면접일지·직무분석지 생성과 보완이 동시에 실행, 서로 덮어씀 | 공용 `employmentGenerating` 가드 |
| B-4 | `WorkMate.tsx:472-514` | 고용지원 문서 저장 연타 시 같은 문서 2개 생성 | in-flight ref + saving 상태 |
| B-5 | `WorkMate.tsx:557-560, 1027-1030` | 초기화 후 재생성 때마다 사례회의록·계획서를 `addCaseDocument`로 새로 만듦 | 기존 id 있으면 `updateCaseDocument` |
| B-6 | `JobSeekerModal.tsx:210-255` | 엑셀 일괄 등록이 중간 실패 후 재시도하면 앞 행이 중복 등록, 실패해도 진행률 100% | 성공 행 제외 또는 "n행까지 저장됨" 안내 |

### 4-C. 잘못된 값·데이터 유실
| # | 위치 | 문제 | 수정 |
|---|---|---|---|
| C-1 | `BudgetManagement.tsx:1405-1423` | 수량·단가를 바꾸면 `supplyAmount`만 갱신되고 저장·초과판정에 쓰는 `amount`는 이전 값 | `amount: supply + vat`도 계산. 수량 칸 비우기 허용 |
| C-2 | `BudgetManagement.tsx:1401-1457` | `type="number"`라 "12,000" 붙여넣기 시 0 저장 | 사업 예산 입력처럼 통화 텍스트 입력으로 통일 |
| C-3 | `BudgetManagement.tsx:486-490, 521` | 할인·음수 품목을 버려 영수증 합계가 크게 잡힘 | 금액 파서에 부호 허용 |
| C-4 | `BudgetManagement.tsx:347` | 사업 삭제 중 일부 실패 시 원복 안 됨 | 순차 처리 + 실패 원복 |
| C-5 | `VocationalEvaluation.tsx:50-61` | 저장 effect가 첫 렌더에 `[]`를 먼저 씀. StrictMode(개발)에서 이력 전부 삭제. `setItem` 용량 초과 시 앱 전체 크래시 | `useState` 지연 초기화로 읽기, 쓰기는 try/catch + 안내 |
| C-6 | `localDB.ts:269-272` | 평가 이력 항목 하나만 깨져도 백업 전체 실패 | 내보내기는 관용 처리, 엄격 검증은 복원 시에만 |
| C-7 | `WorkTraining.tsx:215-234` | 자동저장 실패가 콘솔에만 남는데 "저장" 버튼은 무조건 "자동 저장되어 있습니다" 표시. 입력 후 0.5초 안에 메뉴 이동 시 마지막 입력 유실 | 저장 상태 표시, 실패 토스트, unmount 시 즉시 저장 |
| C-8 | `WorkMate.tsx:138-149` | 다른 화면에서 이용자를 넘겨받아 들어오면 "이용자 변경"을 눌러도 같은 이용자가 다시 선택됨 | navigation state를 한 번 소비 후 `replace`로 제거 |
| C-9 | `WorkMate.tsx:252-261` | 이용자를 빠르게 바꾸면 이전 요청 결과가 늦게 도착해 덮어씀. 면접 폼이 초기화되지 않아 이전 이용자 메모가 새 문서에 섞임 | 요청 ID로 늦은 응답 폐기, 폼 초기화 |
| C-10 | `WorkTraining.tsx:1427, 1457 vs 475` | 출석 화면은 미기록을 '출석'으로 보여 주지만 통계는 0으로 계산 → AI 문서에 출석률 0% | '미체크' 상태 분리, "전원 출석 처리" 버튼 |
| C-11 | `WorkTraining.tsx:149`, `BudgetManagement.tsx:692`, `Settings.tsx:195` | `toISOString().slice(0,10)`은 UTC라 KST 오전 9시 전에는 전날 날짜(출석일, CSV 등록일, 백업 파일명) | `BudgetManagement.tsx:99`의 `getLocalDate`를 `utils/date.ts`로 공용화 |
| C-12 | `rehabPlanDocx.ts:34-72` | 사례회의 "결론"이 DOCX에 출력되지 않음(검토 체크리스트는 누락 경고까지 함) | 양식에 `{{case_meeting_conclusion}}` 추가 또는 content에 합치기 |
| C-13 | `docxGenerator.ts:7-44` | 첫 번호 제목 앞 본문이 버려짐. 번호 제목이 없으면 빈 문서. 본문 번호 목록이 모두 Heading2가 됨 | 서문 섹션 보존, 제목 판정 강화 |
| C-14 | `rehabPlanDocx.ts:116` | `replace(token, text)`에서 사용자 텍스트의 `$&` 등이 치환 패턴으로 해석되어 XML 깨짐. 제어문자 미제거 | 함수 치환 `replace(token, () => encoded)`, 제어문자 제거 |

### 4-D. 도구 화면 오작동
| # | 위치 | 문제 | 수정 |
|---|---|---|---|
| D-1 | `UtilitiesView.tsx:227` | "개인정보 마스킹"의 `/([가-힣]{1})[가-힣]{1,2}/g`가 모든 한글 단어를 망가뜨림("안녕하세요" → "안**하**") | 삭제 후 `utils/anonymizer` 재사용 |
| D-2 | `UtilitiesView.tsx:187-188, 350` | 정규식 테스터 입력칸이 없어 항상 오류. 도구 전환 시 값이 섞임 | regex에도 입력칸 표시, 전환 시 초기화 |
| D-3 | `UtilitiesView.tsx:133, 136, 173-181` | 인코딩·디코딩을 한 번에 실행해 인코딩도 실패. 숫자→한글 110000이 "일십만일만" | 각각 try, `ExpenseDocument.tsx`의 `numberToKorean` 공용화 |
| D-4 | `DashboardView.tsx:33, 61-63` | 위젯 편집칸이 스냅샷 상태라 한 글자 이상 입력 불가 | `editingId`만 상태로 두고 파생 |
| D-5 | `MaskingView.tsx:41-48, 72-93` | AI JSON 미검증. 빈 `original`이면 `split('')`로 원문 파괴, 같은 마스크값이면 엉뚱한 이름으로 복원 | 결과 필터링, 로컬 고유 토큰 재부여 |
| D-6 | `DocumentChatView.tsx:360-364` | 한글 조합 중 Enter로 마지막 음절이 빠진 채 전송 | `if (e.nativeEvent.isComposing) return;` |
| D-7 | `PromoDesignView.tsx:712-713`, `ScheduleDesignView.tsx:107` | 재생성 전에 기존 이미지를 지워 실패 시 이미 비용을 낸 결과도 사라짐 | 성공 시에만 교체 |
| D-8 | `PromoDesignView.tsx:851, 865` | 생성 중 모달을 닫아도 요청 계속, 결과가 다른 템플릿에 표시 | AbortController 연결, `{templateId, image}`로 저장 |
| D-9 | `MatchingView.tsx:43-60` | 이전 타이머 미정리로 A 공고 결과가 B 공고 아래 표시 | `clearTimeout` 선행 |
| D-10 | `PremiumUseConfirmDialog.tsx:14-17` | 확인창 중 새 요청이 오면 이전 resolver를 덮어써 앞 작업이 영원히 대기 | 덮어쓰기 전 `'cancel'` resolve |

### 4-E. Electron
| # | 위치 | 문제 | 수정 |
|---|---|---|---|
| E-1 | `electron/main.cjs` | `requestSingleInstanceLock` 없음. 두 번 실행하면 두 프로세스가 같은 IndexedDB를 써서 데이터 충돌·유실 가능 | 잠금 실패 시 종료, `second-instance`에서 기존 창 포커스 |
| E-2 | `electron/fileService.cjs:49-66` | 기본 저장 위치가 D:\JJSS. 요청마다 재계산하므로 D:가 USB·카드리더면 저장 위치가 오락가락하고, D:\ 루트는 다른 Windows 계정도 읽을 수 있음 | 기본값 `문서\JJSS`, 사용자가 고른 위치를 저장. 접근 불가 시 조용히 바꾸지 말고 안내 |
| E-3 | `fileService.cjs` + `src/utils/jjssFileService.ts` | IPC 오류가 "Error invoking remote method 'jjss-files:save-file': Error: …" 형태로 사용자에게 그대로 표시 | 래퍼에서 접두어 제거 또는 `{error, message}` 반환 |
| E-4 | `fileService.cjs:294` | PDF를 `data:` URL로 로드. 한글 장문·이미지 포함 시 약 2MB URL 한계로 실패(저장 위치 선택 후에) | 임시 .html 파일 + `loadFile` |
| E-5 | `fileService.cjs:241-249` | 파일이 한글/Word에서 열려 있을 때(EBUSY) 엉뚱한 안내 | EBUSY·ENOSPC 전용 메시지 |
| E-6 | `fileService.cjs:406-435, 517-523` | 가져오기 중 파일 하나 실패하면 전체 실패, 토큰은 이미 삭제되어 재시도 시 중복 파일 생성 | 파일별 try/catch, 결과 목록 반환 |

---

## 5. P2 — 사용성

| # | 위치 | 문제 | 수정 |
|---|---|---|---|
| U-1 | `Settings.tsx:600-601, 702-703` | API 키 입력 **한 글자마다** 암호화·DB 저장. 빠르게 치면 글자 누락·저장 순서 역전. `trim` 없음(온보딩에는 있음) → 복사한 공백·줄바꿈으로 인증 실패 | 로컬 입력 상태 + blur/저장 버튼에서 `trim` 후 1회 저장 |
| U-2 | `Settings.tsx:664` | 연결 확인이 Gemini에만 있음 | OpenAI·Anthropic·Vision에도 추가 |
| U-3 | `AITools.tsx:620-625`, `WorkMate.tsx` 탭 | 도구 하위 화면 8개와 WorkMate 탭 전환 시 결과가 경고 없이 사라짐 | `useUnsavedGuard` 공통 훅(이미 `DocumentChatView.tsx:204`에 개별 구현 있음) |
| U-4 | `WorkTraining.tsx:456-469` | 훈련 메모가 탭 로컬 상태라 탭 이동 시 유실, 훈련생을 바꿔도 남아 다른 사람 문서에 섞임 | `trainingRecords[traineeId]`로 이동 |
| U-5 | WorkTraining 779·848·861·874·1903·1955, `deleteRoom`(256), WorkMate 1151·1179 | 되돌릴 수 없는 초기화·삭제에 확인 없음(자동저장되어 복구 불가) | 공통 `ConfirmDialog` |
| U-6 | `WorkTraining.tsx:103, 460, 914` | 담당자 이름 '김정훈'이 하드코딩되어 모든 사용자의 AI 문서에 들어감 | 설정의 사용자 프로필에서 가져오기 |
| U-7 | WorkTraining 454·909·1253·1311·1631, WorkMate 143 | `seeker.name === trainee.name` 이름 매칭 → 동명이인 정보 혼입 | id로만 연결 |
| U-8 | `Navbar.tsx:9-19`, `Layout.tsx:15-25` | `/overview`(직업재활 현황판)가 메뉴·제목 목록에 없어 창 제목이 "페이지를 찾을 수 없음", 활성 메뉴 없음 | `navItems`·`PAGE_TITLES`에 추가, 홈 카드 아이콘 중복 해소 |
| U-9 | `RehabWorkflow.tsx:215` | 불러오기 실패해도 "상담 기록 없음, 0건" 카드가 그려져 사실과 다른 화면 | 조건에 `!loadFailed`, 다시 불러오기 버튼만 표시 |
| U-10 | `RehabDueBoard.tsx:43`, `RehabWorkflow.tsx:308-311` | 일정 링크 클릭 시 입력 중 내용이 확인 없이 사라짐. 목표 기록 저장 후에도 계속 '저장 안 됨' 확인창 | `onSelect` prop으로 확인 경유, 저장 성공 시 `checkInDates`도 초기화 |
| U-11 | `main.tsx:19`, `ErrorBoundary.tsx:31-38, 83` | 경계가 Router 밖 하나뿐이라 한 페이지 오류에 메뉴까지 사라짐. "다시 시도"는 같은 오류 반복. "Antigravity AI Stability Shield Active" 개발 문구 노출 | Layout의 `<Outlet/>`을 `key={pathname}` 경계로 감싸기, 문구 삭제 |
| U-12 | 전역 | `alert`/`confirm` 약 99개(BudgetManagement만 21개, Toast 0개). 입력 검증도 alert라 어느 칸이 문제인지 모름 | `useToast` + 필드 옆 오류 표시로 점진 교체 |
| U-13 | `OCRView.tsx:119`, `VocationalEvaluation.tsx:403` | "드래그해서 업로드" 안내만 있고 drop 핸들러 없음. 같은 파일 재선택 불가 | 공통 `FileDropZone`(아래 M-2) |
| U-14 | `CrisisManual.tsx:19, 27-38, 195, 252-261` | 시나리오 선택마다 `pushState`로 기록이 쌓여 뒤로가기 여러 번 필요. "29개 시나리오"(실제 42개), "진도율 15%" 고정값 | pushState 제거, `crisisScenarios.length` 사용, 진도율 삭제 |
| U-15 | `DashboardView.tsx:24-29, 189-190` | 가짜 수치를 "실시간 통계 / 최종 업데이트: 오늘"로 표시 | "예시 데이터" 배지 |
| U-16 | 문구 | `Settings.tsx:318` "외부 서버로 전송되지 않습니다"(실제로는 AI 호출 시 전송), `VocationalEvaluation.tsx:754` 개발 메모 노출, "쉽운"(`AITools.tsx:352`), "전근 지역"(`MatchingView.tsx:380`), 버튼 용어 제각각(복사/결과 복사/전체 복사, 이미지 저장/파일 저장/내보내기 등), 알림 두 종류가 같은 위치에 겹침 | 문구 정정, 용어 표준표 작성 후 통일 |

---

## 6. P3 — 유지보수·정리

### 공통 컴포넌트·훅 추출
| # | 대상 | 현재 중복 |
|---|---|---|
| M-1 | `CopyButton` / `useCopy()` | 클립보드 복사+토스트가 약 23곳. 대부분 await·catch 없어 실패해도 "복사됨" |
| M-2 | `FileDropZone` | OCR·Utilities·DocumentChat·Dashboard·Minutes·DocumentReview·JobSeekerModal 7곳 |
| M-3 | `ToolPageShell` | AITools 하위 뷰 8개의 뒤로가기·헤더·이탈 확인 |
| M-4 | `ClientContextBox` + `useClientContext(seeker)` | WorkMate 1205 ↔ WorkTraining 1354, 263 ↔ 499 |
| M-5 | `getSeekerKey()`, `utils/date.ts`, `utils/currency.ts`, `utils/file.ts`(`fileToBase64` 3벌) | 반복 로직 |
| M-6 | `useBackupActions` | `Navbar.tsx:72-101`과 `Settings.tsx:192-268`에 백업·복원 두 벌(Navbar 쪽 안내가 더 약함) |
| M-7 | `promoTemplates.ts` + `buildStylePrompt()` | `PromoDesignView.tsx:32-690` 650줄 프롬프트가 템플릿마다 거의 동일. 공통 블록이 "슬라이드로 정리"를 지시해 포스터 요청에도 슬라이드가 나옴 |

### 대형 파일 분리
- **WorkMate.tsx(2033줄)**: `useCaseDocumentPipeline`, `useEmploymentDocuments`, `prompts/workmatePrompts.ts`, `components/workmate/`(CaseStage, FollowUpStage, EmploymentDocumentTab, JobAnalysisDocumentTab, CaseSeekerPicker).
- **WorkTraining.tsx(2277줄)**: 죽은 코드 삭제로 약 480줄 감소 후 `useTrainingState`, `components/training/`(PlanTab, RoomsTab, AttendanceTab, ProgressTab, TimelineStage), `prompts/trainingPrompts.ts`.
- **BudgetManagement.tsx(1731줄)**: `useBudgetProjects`, `useReceiptOcr`, `ProjectEditor`, `ProjectCards`, `ExpenseTable`, `ExpenseFormModal`, `ExpenseDocSetupModal`.
- **Settings.tsx(855줄)**: 이미 나뉜 섹션 id 기준으로 `AiModelSection`, `FailoverSection`, `ApiKeySection`, `BackupSection`. U-1 수정 전에 분리하면 영향 범위가 줄어든다.

### 죽은 코드 삭제
- 파일 전체: `src/pages/Community.tsx`(386줄), `src/pages/WelfareLauncher.tsx`(524줄), `src/components/CaseHistoryPanel.tsx`(263줄). 어디서도 import하지 않음.
- WorkTraining: `TrainingCounselingTab`(882-1073), `TrainingInsightTab`(1597-1757), `ClockIcon`, `TwoPane`, `hidden` 처리된 표(1295-1349).
- WorkMate: `copied`, `triggerNewCounseling/Evaluation`, `startIndex`, `isLocked={false}` 고정 분기.
- AITools: `handleFileChange`, `fileData`, `toolImage`, `image_gen` 분기(436-444).
- 각 뷰의 미사용 lucide import 다수.
- 재발 방지: `tsconfig.app.json`의 `noUnusedLocals`, `noUnusedParameters`를 `true`로.

### 빌드·배포·저장소 정리
| # | 항목 | 조치 |
|---|---|---|
| R-1 | 번들 1.84MB 단일 청크 | 라우트별 `React.lazy` + `manualChunks`(docx, @google/genai, framer-motion 분리) |
| R-2 | 설치 파일 150MB | Vite가 번들하는 `react`, `docx`, `jszip`, `@google/genai` 등을 devDependencies로 이동하거나 `files`에 `!node_modules/**` |
| R-3 | 아이콘 | `win.icon` 없음(기본 Electron 아이콘), mac의 `public/icon.png`는 파일 없음 → mac 빌드 실패 |
| R-4 | 자동 업데이트 | `electron-updater` 미사용인데 `app-update.yml` 생성. 도입하거나 `"publish": null`. 도입 시 `nsis.artifactName`으로 파일명 통일(현재 GitHub 자산 `JJSS.Setup.3.0.0.exe` vs `latest.yml`의 `JJSS-Setup-3.0.0.exe`) |
| R-5 | Electron 방어 | `will-navigate` 차단, `sandbox: true`, CSP 메타 태그, 외부 링크 `https:`만 허용 |
| R-6 | 오프라인 폰트·아이콘 | Google Fonts 네트워크 로드 → `@fontsource/noto-sans-kr` 번들 + `Malgun Gothic` fallback. `index.html`의 `/vite.svg`는 file://에서 깨짐 → `./vite.svg` |
| R-7 | 테스트 | `test-usability.cjs`용 `playwright` devDependency와 npm script 추가. `test-runtime-safety.mjs`의 소스 정규식 검사를 동작 테스트로 교체. anonymizer·오류 분류 테스트 신설. `test-jjss-file-service`는 platform 위장 대신 root resolver 주입 |
| R-8 | 프로젝트 폴더 정리 | `vision_key.json`(GCP 서비스 계정 **개인키**)이 OneDrive 동기화 폴더에 있음 → 프로젝트 밖 보안 위치로 이동, 사용하지 않으면 GCP에서 키 폐기. `release/`(624MB), 코드 zip 2개(각 61MB), `CHATGPT_*` 로그, `.netlify/`(다른 개발자 Mac 경로) 정리 |
| R-9 | README | v2.1·Gemini 전용 설명, 오래된 설치 파일명, "완전 무료" 표현 → v3.0.0 기준 갱신 |
| R-10 | 기록 | `check:release`에 `tailwind.config.cjs`·`postcss.config.cjs` 존재 검사 추가 |

---

## 7. W — 홈페이지(`website/`)

| # | 위치 | 문제 | 수정 |
|---|---|---|---|
| W-1 | `website/src/config/jjss.ts:49` | 사이트 URL 기본값 `http://localhost:3000`. 환경변수를 빠뜨리면 canonical·OG·sitemap·robots가 모두 localhost로 배포 | 실제 도메인 기본값 또는 프로덕션 빌드에서 throw |
| W-2 | `website/app/guide/start/page.tsx:52, 80` | STEP 05 링크 `#step-05` ↔ 섹션 id `first-client` 불일치 | anchor 필드 추가 |
| W-3 | `website/app/page.tsx:185` | 홈만 `<main id="main-content">` 누락 → 본문 바로가기 미작동 | id 추가, route group 레이아웃으로 통합 |
| W-4 | `website/components/CountStrip.tsx:32` | 서버 렌더링 결과가 "0" (크롤러·JS 꺼짐) | 실제 값 출력, 애니메이션은 CSS |
| W-5 | `website/components/ProviderGuide.tsx:80` | 스크린샷 크기 고정으로 비율 왜곡·레이아웃 이동 | 제공업체별 크기 |
| W-6 | `website/package.json:22, 32` | `@openai/sites-vite-plugin` 0.x 범위(배포 대상은 Cloudflare), `vinext` 베타 | 버전 고정 또는 불필요 플러그인 제거 |
| W-7 | 날짜·문구·URL 하드코딩 | `download/page.tsx:46`, `updates/page.tsx:46` 날짜, "3분" vs "5분", OpenAI 요금 URL 구주소, Issues URL | `JJSS` 설정값 사용 |
| W-8 | 정리 | `robots.ts`의 `/__debug`·`host`, 아이콘 중복 선언, 패키지명 `sites-project`, ESLint·tsconfig 생성 폴더 제외, 빈 `scripts/`, FAQ 인덱스 분류 | 일괄 정리 |

---

## 8. 추진 일정 제안

| 주차 | 작업 | 완료 기준 |
|---|---|---|
| 1주 | P0 전체(비식별화 재설계·테스트, 백업 암호화, safeStorage, 키 헤더 전송), R-8 키 파일 이동 | anonymizer 테스트 통과, 마스킹 도구가 원문을 전송하지 않음을 네트워크 로그로 확인 |
| 2주 | 4-A AI 호출, 4-B 중복 실행, E-1 단일 실행, C-1~C-5 | AI 버튼 연타 시 호출 1회, 시간 초과 후 기능 재사용 가능 |
| 3주 | 4-C 나머지, 4-D, 4-E, U-1·U-2·U-8 | 날짜·금액·DOCX 회귀 테스트 추가 |
| 4주 | U-3~U-16(공통 `ConfirmDialog`·`useUnsavedGuard`·Toast 전환) | 이탈·삭제 시 확인창, 개발 문구 0건 |
| 5~6주 | P3 추출·분리·죽은 코드 삭제, `noUnusedLocals` 활성화, R-1~R-7 | 초기 청크 50% 이상 감소, 전체 테스트 통과 |
| 병행 | W 전체 | 배포 전 sitemap·canonical 도메인 확인 |

작업 원칙은 기존 복구 메모(`RECOVERY_NOTES.md`)를 따른다. 기존 IndexedDB 데이터는 삭제하지 않고, DB 버전 변경이 필요한 항목(P0-6 필드 확대, P0-7 이관)은 백업·롤백 경로를 먼저 마련한 뒤 진행한다.

---

## 9. 문제없음으로 확인된 부분

- preload와 main의 IPC 채널 7개는 이름·인자가 모두 일치하고, 파일명·확장자 검증과 경로 이탈 방어가 적절하다.
- `target="_blank"` 외부 링크는 `setWindowOpenHandler`에서 openExternal로 처리된다.
- Anthropic 호출 헤더(`x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access`)가 올바르다.
- `safeErrorMetadata`는 원문 메시지·URL을 로그에 남기지 않는다.
- IndexedDB 버전 업그레이드와 트랜잭션 처리에서 버그를 찾지 못했다. 복원은 store별 스냅샷으로 롤백된다.
- 백업에서 API 키 필드는 제외된다.
- DOCX 양식 자리표시자 36개와 매퍼 출력 키 36개가 일치한다.
- 재활 워크플로우의 날짜 계산은 로컬 날짜 문자열 기준이라 KST/UTC 문제가 없다.
- 홈페이지의 설치 파일 SHA-256과 API 키 발급 URL 3개가 정확하다.
