# 업데이트 배포 절차(자동 업데이트)

JJSS 3.2부터 설치본이 GitHub `enkidua/JJSS`의 **공개 Releases**에서 새 버전을 확인합니다. 빌드는 스스로 게시하지 않습니다(`--publish never`). 검증을 마친 파일을 사람이 올립니다.

## 올릴 파일

| 운영체제 | 파일 | 비고 |
|---|---|---|
| Windows | `JJSS-Setup-<버전>.exe`, `JJSS-Setup-<버전>.exe.blockmap`, `latest.yml` | `npm run electron:build:win:signed` 결과(`release/`) |
| macOS | `JJSS-<버전>-arm64.dmg`, `JJSS-<버전>-arm64-mac.zip`, `latest-mac.yml` | GitHub Actions "Build macOS (Apple Silicon)" 결과 |

파일 이름을 바꾸지 말고 그대로 올립니다. `latest.yml` 안의 파일 이름과 다르면(예: 공백이 든 이름은 GitHub가 점으로 바꿈) 설치본이 새 버전을 내려받지 못합니다. 3.2부터 설치파일 이름에 공백이 없습니다.

`latest.yml`·`latest-mac.yml`이 빠지면 설치본은 "게시된 업데이트 정보를 찾지 못했습니다"로 끝나고 아무것도 하지 않습니다.

## 순서

1. `package.json`의 `version`을 올린다(예: 3.2.0 → 3.2.1). 버전이 올라가야 설치본이 새 버전으로 인식한다.
2. `npm run verify:release` → `npm run electron:build:win:signed` → `node scripts/test-update-e2e.cjs`(서명·sha512 검증 실제 확인).
3. 맥: 같은 커밋을 올리고 Actions에서 맥 빌드 실행 → 아티팩트 내려받기.
4. GitHub에서 **초안(draft) 릴리스**를 만들고 태그는 `v<버전>`(예: `v3.2.1`)으로 한다. 위 파일을 모두 올린다.
5. 설치본 하나로 "설정 → 업데이트 → 지금 확인"을 눌러 보려면 초안을 공개해야 한다. 공개하는 순간 모든 설치본이 6시간 안에 알림을 받는다.

## 되돌리기

- 문제가 있는 버전은 릴리스를 초안으로 되돌리거나 지운다. 이미 설치한 PC는 자동으로 내려가지 않으므로(`allowDowngrade=false`) 이전 설치파일을 직접 설치한다.
- 각 PC에는 업데이트 직전 저장소 사본이 `사용자 데이터 폴더/update-backups/<이전 버전>-<시각>/IndexedDB`에 남는다(최근 2개). 되돌릴 때는 JJSS를 끄고 이 폴더를 사용자 데이터 폴더의 `IndexedDB`로 바꿔 넣는다. 평소 백업(.jjss)이 있으면 그것으로 복원하는 편이 간단하다.

## macOS 자동 설치

Squirrel.Mac은 Apple Developer ID 서명·공증이 없는 앱의 업데이트 설치를 거부한다. 서명 전까지 맥 설치본은 알림과 "내려받기 페이지 열기"만 한다. Apple Developer Program에 가입한 뒤 `electron:build:mac`에 Developer ID 서명·공증을 붙이면 `electron/updater.cjs`의 `manualOnly`(darwin) 조건을 풀어 Windows와 같은 흐름으로 바꾼다.
