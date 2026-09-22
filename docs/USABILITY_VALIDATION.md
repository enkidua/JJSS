# 사용성 개선 및 검증 기록

## 변경 내용

- 상단 메뉴: 짧은 표시 이름, 전체 이름 툴팁, 현재 위치 표시, 키보드 접근 이름을 추가했습니다. 768/1100/1280/1440/1920px에서 메뉴가 화면 밖으로 밀리지 않도록 보정했습니다.
- 모바일 메뉴: 높이 제한과 스크롤, Escape 닫기, 열기 버튼 포커스 복귀, 데스크톱 너비 전환 시 스크롤 잠금 해제를 적용했습니다.
- 설정: 시스템 설정으로 명칭을 정리하고 AI 모델/비용·자동 전환/API 키/파일·백업 바로가기를 추가했습니다. HashRouter 주소를 유지하며 이동합니다. D: 우선 저장 정책 안내를 실제 코드에 맞췄습니다.
- 사례관리: 저장 성공 후에만 사후관리 초안을 비우고 실패 시 유지합니다. 중복 저장을 방지하고 저장됨/저장 전 표시, 이용자 변경 확인, 이전 이용자의 늦은 문서 응답 무시를 적용했습니다.
- 예산: 화면에 보이지 않는 선택 지출 건수를 표시하고 전체 선택 해제를 제공합니다. 입력 중 모달 닫기 확인, 중복 저장 방지, 모달 키보드 접근, 결재 용어를 보완했습니다.
- 자료 및 이용자 등록: 입력 중 닫기 확인, 입력 레이블 연결, 모달 내 키보드 이동과 포커스 복귀, 작은 화면의 단일 열 폼을 적용했습니다.
- 검색: 데이터 없음과 검색 결과 없음을 구분하고 검색/필터 초기화를 제공합니다.
- AI 업무 도구: 카드 키보드 실행, 선택 필드 기본값 유지, 입력·결과 폐기 확인을 보완했습니다. 문서 대화 실패 시 질문을 입력란에 돌려놓고 오류를 다음 요청의 대화 이력에 넣지 않습니다.
- 공통: 데이터 로드 실패/재시도 안내, 알림 상태 역할, 키보드 포커스 표시, 잘못된 주소 복구 화면을 추가했습니다.
- 빌드: 누락된 Tailwind/PostCSS 설정을 복구했습니다. 처리되지 않은 `@tailwind`/`@apply` 지시문만 남던 빌드에서 실제 레이아웃·색상 CSS가 생성됩니다.
- 파일 서비스 테스트: 호스트의 실제 D: 드라이브 대신 임시 Documents 및 합성 드라이브에서 실행하도록 테스트 모듈을 격리했습니다. 제품 파일 저장 구현은 변경하지 않았습니다.
- 직업재활 현황판: 이용자 관리에서 이용자별 화면으로 이동합니다. 후속 일정의 기한·완료 상태, 목표의 출발점·목표 상태·날짜별 변화와 최근 사례문서를 연결합니다. 기존 `caseDocuments`의 암호화된 `content`에 저장하고 DB_VERSION/store는 바꾸지 않았습니다. 저장 실패 시 입력을 유지하며, 손상된 현황 기록은 덮어쓰지 않습니다. 구조화된 현황 JSON은 기존 문서 이력과 AI 참고문서에서 제외합니다.

## 유지 범위

기존 라우트와 업무 기능을 삭제하지 않았습니다. DB_VERSION, IndexedDB store, userData 경로, 문서 저장 정책은 변경하지 않았습니다. 기존 generated-assets/ 및 website/ 폴더는 수정하지 않았습니다. 추가 요청으로 AI 모델 목록과 응답 처리를 보완했으며, API 키 보관 방식과 중복 호출/재시도/과금 동의 제한은 유지했습니다.

## 추가 요청: API 및 모델 목록 업데이트

2026-09-23 공식 문서 확인 기준입니다. 모델별 계정 권한·할당량과 실제 응답 품질은 실호출로 검증하지 않았습니다.

| 제공업체 | 신규 설정 기본 모델 | 추가한 선택지 | 기존 선택 처리 |
| --- | --- | --- | --- |
| Google | Gemini 3.5 Flash-Lite, 추론 보통 | Gemini 3.8 Flash | 3.6 Flash 등 기존 선택 유지 |
| OpenAI | GPT-5.6 Luna, 추론 보통 | GPT-6 Astra / Sol / Luna | GPT-5.6 Sol / Terra 등 기존 선택 유지 |
| Anthropic | Claude Sonnet 5 유지 | Claude Opus 5 / Fable 5.1 | Opus 4.8 / Sonnet 5 / Haiku 4.5 유지 |

- 저장된 지원 모델은 최신 기본 모델로 강제 교체하지 않습니다. 모델별 비용 등급을 명시하여 기존 모델과 최신 모델이 모두 호출 후보로 인식됩니다.
- 요청하신 “Gemini 3.6 Flash-Lite”는 공식 모델 목록에 없어 Flash-Lite 계열의 `gemini-3.5-flash-lite`를 신규 기본값으로 선택했습니다. `gemini-3.6-flash`는 별도 기존 선택지로 남깁니다.
- 비용 절감 자동 전환: Gemini 3.5 Flash-Lite / GPT-5.6 Luna / Claude Haiku 4.5. 균형 자동 전환: Gemini 3.8 Flash / GPT-6 Sol / Claude Sonnet 5.
- 설정에서 제공업체별 추론 수준(모델 기본값/낮음/보통/높음)을 선택할 수 있습니다. 신규 Gemini·OpenAI 설정은 보통, Claude Sonnet 5는 모델 기본값입니다. 기존 저장 설정은 새 수준으로 강제 변경하지 않습니다. 실제 요청의 Google `thinkingConfig`, OpenAI `reasoning_effort`, Claude `output_config.effort`에 연결합니다. Claude Haiku 4.5는 이 설정 방식과 달라 모델 기본값만 제공합니다.
- 프리미엄 자동 업그레이드 대상은 기존 GPT-5.6 Sol / Claude Opus 4.8을 유지합니다. GPT-6 Astra, Claude Opus 5/Fable 5.1은 사용자가 직접 선택해야 합니다. 직접 선택한 프리미엄 모델을 이전 모델로 덮어쓰지 않습니다.
- 자동 전환 기본 꺼짐, 제공업체별 1회/전체 최대 3회, 자동 재시도 0회, 첨부파일 제공업체 고정, 비용 동의는 유지합니다. 출력 토큰 상한도 늘리지 않았습니다.
- GPT-6는 현재 도구 호출 없는 Chat Completions 경로를 유지합니다. `reasoning_effort: medium`과 `max_completion_tokens: 4096`을 사용하며 지원하지 않는 샘플링 인자를 보내지 않습니다. Responses API로의 전면 전환은 하지 않았습니다.
- Claude는 첫 블록이 thinking인 경우를 포함해 모든 text 블록을 모아 본문으로 사용합니다. 내부 사고 블록은 제외합니다.
- 빈 응답, 거절 응답, 출력 한도로 잘린 응답을 정상 문서로 처리하지 않습니다. 명확한 오류를 반환하며 자동 재시도/제공업체 전환을 유발하지 않습니다. Gemini도 빈 응답과 MAX_TOKENS를 검사합니다.
- 설정 화면과 최초 API 키 안내는 같은 모델 목록에서 기본 안내를 가져옵니다. 최신 확인일과 모델 계정 권한 안내도 표시합니다.
- 이미지 생성의 Gemini 3.1 Flash Image / Gemini 3 Pro Image는 공식 목록에서 유효함을 확인하여 유지했습니다. 새 이미지/음성 기능이나 SDK 의존성 변경은 추가하지 않았습니다.

근거: [Google 모델 목록](https://ai.google.dev/gemini-api/docs/models), [Google 추론 설정](https://ai.google.dev/gemini-api/docs/generate-content/thinking), [OpenAI GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [OpenAI GPT-6 가이드](https://developers.openai.com/api/docs/guides/latest-model), [Claude 모델 목록](https://platform.claude.com/docs/en/models/overview), [Claude 추론 노력](https://platform.claude.com/docs/en/build-with-claude/effort).

## 검증 명령

2026-09-23 결과: 아래 타입 검사, 빌드, 회귀 검사 및 diff 검사가 모두 통과했습니다. 모델·현황판을 포함한 화면 검사 9개 묶음도 통과했습니다. 데스크톱/모바일 화면 캡처를 확인했습니다.

```text
npx tsc -b --pretty false
npm run build
npm run test:runtime-safety
npm run test:ai-settings
npm run test:ai-safety
npm run test:ai-api
npm run test:rehab-plan-mapper
npm run test:rehab-workflow
npm run test:file-service
git diff --check
```

화면 회귀 검사는 로컬 Vite 서버에서 `node scripts/test-usability.cjs`로 실행합니다. Playwright와 Edge가 필요합니다. Playwright가 별도 경로에 있으면 `JJSS_PLAYWRIGHT_PATH`, 서버 주소를 바꾸려면 `JJSS_TEST_URL`을 지정합니다. 프로젝트의 런타임 의존성에는 추가하지 않았습니다.

화면 검사는 새 브라우저 컨텍스트와 합성 레코드를 사용하며 외부 요청을 차단합니다. 주요 10개 화면, 반응형 메뉴, 설정 바로가기, 추론 수준 저장 후 재진입, 자료 입력 포커스, 모달 폐기 취소, 검색 초기화, 숨은 지출 선택 표시, 사후관리 및 현황판의 저장 실패/성공 재시도를 확인합니다. 별도 합성 컨텍스트에서 실제 IndexedDB 재진입과 현황 `content`의 저장 시 암호화도 확인합니다. 실제 API 키나 이용자 데이터를 사용하지 않습니다.

`test:ai-api`는 실제 Google/OpenAI/Claude 어댑터 함수 본문을 추출하고 SDK/fetch를 모의 함수로 대체합니다. 모델 ID, 추론 수준, 대화 이력, 취소 신호, 토큰 제한, GPT-6 요청 인자, Claude 사고/텍스트 블록, 빈 응답·잘린 응답·거절 처리 및 오류 시 재시도 없음이 통과했습니다. 실제 네트워크를 사용하지 않습니다. AI 설정 검사는 모든 선택 모델의 호출 후보 생성과 기존 선택 보존도 검증합니다. `test:rehab-workflow`는 손상 기록 방어와 날짜 분류를 확인합니다.

## 확인 범위의 한계

브라우저 동작과 모의 Electron 파일 서비스를 검증했습니다. 설치된 Windows 앱의 네이티브 저장 대화상자, 실제 OneDrive 동기화, 유료 AI 실호출은 실행하지 않았습니다. 빌드에는 기존 대형 번들 경고와 Browserslist 데이터 갱신 안내가 남습니다. 장기적 코드 분할, 전역 미저장 상태 복원, 즐겨찾기, 보류 화면 노출은 별도 범위입니다.
