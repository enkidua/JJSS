# JJSS Windows 릴리즈 및 업그레이드 체크리스트

이 체크리스트는 기존 JJSS 설치본을 제거하지 않고 새 버전으로 업그레이드하면서 사용자 데이터를 보존하기 위한 절차다. 실제 이용자 정보 대신 `검증용이용자` 등 합성 데이터만 사용한다.

## 1. 빌드 전

- [ ] `package.json` 버전이 직전 배포판과 현재 설치본보다 높다.
- [ ] `package.json`과 `package-lock.json` 버전이 일치한다.
- [ ] `appId`가 `com.jjss.desktop`으로 유지되어 있다.
- [ ] `productName`이 `JJSS`로 유지되어 있다.
- [ ] NSIS 설치 범위가 기존과 같은 `perMachine: true`다.
- [ ] `deleteAppDataOnUninstall`이 `false`다.
- [ ] `DB_VERSION`과 IndexedDB store 구성이 의도치 않게 변경되지 않았다.
- [ ] PFX, 개인키, `.env`, API 키가 Git 추적 대상이나 배포 파일에 포함되지 않았다.
- [ ] `release/`, `dist/`, `node_modules/` 변경이 Git 변경에 포함되지 않았다.
- [ ] `npm run check:release`가 PASS다(Tailwind·PostCSS 설정 파일, 아이콘, `publish: null`, 런타임 의존성 0개 포함).
- [ ] `npm run test:all`이 PASS다.
- [ ] `npx tsc -b --pretty false`가 성공한다.
- [ ] `npm run build`가 성공하고 `dist/assets/index-*.css`가 100KB 이상이다(Tailwind 적용 확인).
- [ ] `build/icon.png`(512×512)가 Git에 포함되어 있다(`.gitignore`의 `build/` 규칙 예외 필요).
- [ ] `git diff --check`가 성공한다.

`check:release`는 실제 PC에 설치된 버전을 추측하지 않는다. 설치 버전은 아래 명령으로 직접 확인하고 신규 버전과 비교한다.

```powershell
Get-ItemProperty `
  "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", `
  "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*", `
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*" `
  -ErrorAction SilentlyContinue |
Where-Object { $_.DisplayName -match "JJSS" } |
Select-Object DisplayName, DisplayVersion, InstallLocation, UninstallString
```

## 2. 설치 전 합성 데이터 준비

- [ ] 기존 JJSS를 실행한다.
- [ ] `검증용이용자`, `1996.01.02`, `010-0000-0000`, `검증용 주소`로 테스트 이용자를 만든다.
- [ ] 테스트 사업체를 만든다.
- [ ] 테스트 상담일지를 저장한다.
- [ ] 테스트 사례회의와 직업재활계획서를 저장한다.
- [ ] 테스트 직업훈련 및 직업평가 이력을 저장한다.
- [ ] 테스트 예산 사업·항목·지출을 저장한다.
- [ ] 설정 화면에서 전체 백업을 내려받아 별도 보관한다.
- [ ] JJSS를 정상 종료한다.

## 3. 업그레이드 설치

- [ ] 기존 JJSS를 제거하지 않는다.
- [ ] 기존 설치와 같은 관리자 권한·per-machine 범위에서 새 installer를 실행한다.
- [ ] 설치 경로와 바로가기가 의도한 위치인지 확인한다.
- [ ] 설치 후 JJSS가 정상 실행되는지 확인한다.
- [ ] 앱에 표시되는 버전 또는 설치 프로그램 버전이 신규 버전인지 확인한다.

## 4. 설치 후 데이터 유지

- [ ] 테스트 이용자와 사업체가 유지된다.
- [ ] 상담일지와 사례회의 기록이 유지된다.
- [ ] 직업재활계획서 내용이 유지된다.
- [ ] 직업훈련·직업평가 이력이 유지된다.
- [ ] 예산 사업·항목·지출과 집계가 유지된다.
- [ ] API 설정이 유지되고 키 원문이 화면·로그에 노출되지 않는다.
- [ ] PDF, PNG, DOCX 출력을 합성 데이터로 각각 확인한다.
- [ ] 문제가 있으면 새 데이터를 추가 입력하지 말고 설치 전 백업과 `RECOVERY_NOTES.md`를 사용해 복구한다.

## 5. 서명 빌드와 미서명 빌드

| 구분 | 명령 | Authenticode | 사용자 PC에서 보이는 모습 | 용도 |
|---|---|---|---|---|
| 미서명 | `npm run electron:build` | `NotSigned` | SmartScreen "Windows의 PC 보호" 경고. 사용자가 [추가 정보] → [실행]을 눌러야 설치됨 | 개발 PC 확인, 구조 검증, 현재 공개 배포본 |
| 자체서명(내부 테스트 인증서) | `npm run electron:build:win:signed` + 내부 PFX | 공개 CER를 신뢰 저장소에 넣은 PC에서만 `Valid`, 그 밖의 PC는 `UnknownError`/신뢰되지 않음 | 일반 PC에서는 미서명과 같이 경고가 뜸 | 내부 테스트 PC에서 서명 흐름 검증 |
| 공인 코드서명 인증서(OV/EV) | `npm run electron:build:win:signed` + 공인 인증서 | `Valid` | 게시자 이름이 표시됨. 다운로드 평판이 쌓이기 전까지는 SmartScreen 경고가 보일 수 있음 | 공개 배포 |

- 설치 파일 이름은 두 방식 모두 `release\JJSS Setup <버전>.exe`로 같다. GitHub Releases에 올리면 공백이 점으로 바뀌어 `JJSS.Setup.<버전>.exe`로 표시된다. 홈페이지·README의 파일명과 SHA-256을 함께 갱신한다.
- `publish: null`이므로 `latest.yml`·`app-update.yml`이 만들어지지 않는다. 자동 업데이트는 없고, 사용자는 새 설치 파일을 기존 설치 위에 실행한다.
- 미서명 배포 시에는 README의 SmartScreen 안내와 SHA-256 값을 반드시 함께 제공한다.

```powershell
Get-FileHash ".elease\JJSS Setup *.exe" -Algorithm SHA256
```

### 5-1. 자체서명 빌드 절차

- [ ] PFX가 프로젝트 밖의 승인된 보관 위치에 있다.
- [ ] 현재 PowerShell 세션에 `WIN_CSC_LINK`를 설정한다.
- [ ] 현재 PowerShell 세션에 `WIN_CSC_KEY_PASSWORD`를 SecureString 입력 흐름으로 설정한다.
- [ ] `npm run electron:build:win:signed`를 실행한다.
- [ ] 빌드 로그에 비밀번호·인증서 내용이 출력되지 않았는지 확인한다.
- [ ] 생성된 installer의 Authenticode가 `Valid`인지 확인한다.

```powershell
Get-ChildItem ".\release\*.exe" |
ForEach-Object {
  Get-AuthenticodeSignature $_.FullName |
  Select-Object Path, Status, @{N="Signer";E={$_.SignerCertificate.Subject}}
}
```

## 6. 인증서 주의

- PFX와 비밀번호는 다른 PC나 메신저로 전달하지 않는다.
- PFX를 프로젝트·ZIP·Git·설치파일에 포함하지 않는다.
- 내부 테스트 PC가 자체서명 인증서를 신뢰해야 한다면 개인키가 없는 공개 CER만 전달한다.
- Authenticode가 `Valid`가 아니면 해당 installer를 배포하지 않는다.

## 7. `cannot be closed` 회귀 매트릭스

| 시나리오 | 절차 | 기대 결과 | 2026-08-17 상태 |
|---|---|---|---|
| A 기존 1.0.0 위 업그레이드 | JJSS를 정상 종료하고 2.3.0 installer 실행 | false positive 없이 설치, 기존 데이터 유지 | 사용자 설치 확인 대기; PASS 아님 |
| B fresh install | JJSS 미설치 테스트 PC에서 installer 실행 | 정상 설치 | 수동 검증 필요 |
| C 동일 installer 재실행 | 2.3.0 설치 뒤 같은 installer 재실행 | false positive 없는 안전한 재설치 흐름 | 수동 검증 필요 |
| D 앱 실행 중 설치 | `JJSS-Pro.exe` 실행 중 installer 실행 | 강제 종료 없이 정상 종료 요청만 표시 | custom exact-name 검사 정적/빌드 확인, 수동 검증 필요 |

실제 검사 대상은 electron-builder가 확정한 `${APP_EXECUTABLE_FILENAME}`(`JJSS-Pro.exe`) 하나다. NSIS custom macro는 `taskkill`과 `taskkill /F`를 사용하지 않는다.

> 2026-08-17 배포 전 상태: 현재 셸에는 `WIN_CSC_LINK`와 `WIN_CSC_KEY_PASSWORD`가 없어 signed build 및 Authenticode 검증은 `N/A`다. 기존 설치 위 실제 upgrade와 `cannot be closed` 회귀 테스트는 완료 전이므로 `PASS-WARN`을 유지한다.

## 8. JJSS 문서 저장 검증

- [ ] 새 설치 PC: 설정 화면에 `문서\JJSS`, 백업, 문서 경로가 표시된다.
- [ ] 기존 사용자 PC(`D:\JJSS` 안에 파일이 있음): 업그레이드 후에도 `D:\JJSS`가 계속 표시된다. 결정된 위치는 `%APPDATA%\JJSSile-save-preferences.json`의 `jjssRoot`에 저장되어 다음 실행에도 바뀌지 않는다.
- [ ] 저장 위치 드라이브를 뺀 상태에서 저장하면 "저장 위치(…)를 찾을 수 없습니다. USB/드라이브 연결을 확인하세요" 안내와 [다시 확인]/[문서 폴더로 변경]/[취소]가 표시되고, 선택 없이 위치가 바뀌지 않는다.
- [ ] 한글/Word에서 연 파일에 덮어쓰면 "다른 프로그램에서 열려 있습니다" 안내가 나온다.
- [ ] 저장 후 [폴더 열기]를 누르면 탐색기에서 저장한 파일이 선택된 상태로 열린다.
- [ ] 백업 JSON 기본 경로가 `JJSS\JJSS Pro\백업`이다.
- [ ] 계획서 PDF/PNG/DOCX 기본 경로가 `JJSS\문서\직업재활계획서`다.
- [ ] 직업평가 DOCX 기본 경로가 `JJSS\문서\직업평가`다.
- [ ] 예산 CSV/PDF 기본 경로가 `JJSS\문서\예산`이다.
- [ ] 회의록 TXT 기본 경로가 `JJSS\문서\회의록`이다.
- [ ] 업무지원 TXT 기본 경로가 `JJSS\문서\업무지원`이다.
- [ ] 생성 이미지는 `JJSS\문서\이미지`다.
- [ ] 취소 시 파일이 생성되지 않는다. JJSS 폴더 밖(바탕화면·OneDrive 등)도 저장 위치로 고를 수 있다.
- [ ] 저장 성공 시 실제 경로와 폴더 열기 버튼이 표시된다.

합성 가져오기 자동 테스트는 `npm run test:file-service`로 실행한다. 실제 개인정보·백업 DB는 테스트 폴더에 넣지 않는다.

## 9. 현재 빌드 환경 메모

- PFX 존재 확인: 저장소 밖의 사용자 지정 인증서 경로
- 현재 셸 서명 환경변수: 미설정
- 일반 빌드: winCodeSign 캐시의 심볼릭 링크 생성 권한 부족으로 실패
- 미서명 구조 검증 빌드: 성공, `release\JJSS Setup 2.3.0.exe`, Authenticode `NotSigned`
- 앱 아이콘: `build/icon.png`(512×512, 홈페이지 `website/app/icon.png`와 같은 이미지)를 `win.icon`·`mac.icon`으로 지정. electron-builder가 Windows `.ico`로 변환한다.

## 10. 앱 실행 안전장치 확인

- [ ] JJSS를 두 번 실행하면 새 창이 뜨지 않고 기존 창이 앞으로 나온다(단일 실행).
- [ ] 다른 Windows 계정에서 JJSS가 실행 중일 때 설치하면, 설치 프로그램이 "다른 Windows 계정에서 실행 중일 수 있음 → 컴퓨터 재시작" 안내를 표시한다.
- [ ] 앱 하단 이메일 링크는 기본 메일 프로그램으로, `https` 외부 링크는 기본 브라우저로 열리고 앱 화면은 그대로 유지된다.
- [ ] 메인 프로세스 오류는 `%APPDATA%\JJSS\logs\main.log`에 오류 이름·코드·호출 위치만 남고 이름·경로·문서 내용은 남지 않는다.
- [ ] 배포 빌드 `dist/index.html`에 Content-Security-Policy 메타 태그가 있다. 새 외부 AI API를 추가했다면 `vite.config.ts`의 `CONNECT_SOURCES`에도 추가했다.
