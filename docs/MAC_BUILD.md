# 맥(Apple Silicon) DMG 만들기

DMG는 macOS의 디스크 이미지 도구(`hdiutil`)로만 만들 수 있어 Windows PC에서는 만들 수 없습니다. 아래 두 방법 중 하나를 쓰세요. 설정(`package.json`의 `build.mac`)은 이미 Apple Silicon(arm64) DMG·ZIP으로 맞춰 두었습니다.

## 방법 1. 맥에서 직접 빌드 (권장)

준비: Apple Silicon 맥, Node.js 22 이상, 이 프로젝트 폴더(예: USB·git clone으로 복사).

```bash
cd "JJSS prod"
npm ci
npm run test:all
npm run electron:build:mac
```

결과물: `release/JJSS-<버전>-arm64.dmg`, `release/JJSS-<버전>-arm64-mac.zip`

- `node_modules`는 Windows에서 복사하지 말고 맥에서 `npm ci`로 새로 설치해야 합니다(Electron 실행 파일이 운영체제별로 다름).
- `electron/dataKey.cjs`, `electron/mainLog.cjs`, `build/icon.png`가 함께 복사됐는지 확인하세요. 빠지면 앱이 실행 직후 종료되거나 기본 아이콘이 나옵니다.

## 방법 2. GitHub Actions 맥 빌드 서버 사용 (맥이 없을 때)

`.github/workflows/build-mac.yml`이 준비되어 있습니다. **저장소에 올린 뒤** GitHub 웹 → Actions → "Build macOS (Apple Silicon)" → Run workflow를 누르면 맥 서버에서 빌드하고, 완료 화면의 Artifacts에서 DMG를 내려받을 수 있습니다. 워크플로는 수동 실행 전용이며 릴리스를 자동으로 게시하지 않습니다.

## 서명과 첫 실행

Apple 개발자 인증서(Developer ID)와 공증(notarization)이 없으면, 인터넷에서 받은 앱을 처음 열 때 macOS가 "손상되었거나 확인되지 않은 개발자" 경고를 띄웁니다.

- 사용자 안내: DMG에서 JJSS를 응용 프로그램 폴더로 옮긴 뒤, **JJSS를 Control+클릭 → 열기 → 열기**.
- 그래도 "손상되었다"고 나오면 터미널에서 한 번 실행:

```bash
xattr -cr /Applications/JJSS.app
```

- 배포 규모가 커지면 Apple Developer Program(연 99달러)에 가입해 `CSC_LINK`/`APPLE_ID` 등으로 서명·공증하는 것을 권장합니다.

## 맥에서 달라지는 점

- 암호화 키는 Windows DPAPI 대신 macOS 키체인(Keychain)에 보관됩니다. 첫 실행 때 키체인 접근을 묻는 창이 뜨면 "항상 허용"을 누르세요.
- 기본 저장 위치는 `~/Documents/JJSS`입니다(D 드라이브 규칙은 Windows에서만 적용).
- PC 간 이동은 Windows와 같이 백업 파일로 합니다.
