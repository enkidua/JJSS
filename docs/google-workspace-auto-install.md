# Google Workspace 자동 설치 점검

## 결론

JJSS를 설치한 사람의 Google Workspace 계정에 자동으로 설치하려면 가능은 하지만, 현재 코드만으로는 완전 자동 설치가 되지 않는다.

현재 구조는 다음 방식이다.

- 로컬/배포 화면에서 업무시스템을 실행한다.
- 이미 배포된 Apps Script 웹앱 URL로 데이터를 보낸다.
- 그 Apps Script가 연결된 Google Spreadsheet에 데이터를 저장한다.

즉, 지금은 "사용자마다 자동으로 새 Google Drive 데이터베이스와 Apps Script 웹앱을 만들어 배포"하는 구조가 아니라, "이미 만들어진 Apps Script URL에 접속"하는 구조다.

## 완전 자동 설치에 필요한 조건

설치한 사람의 Google Workspace 계정에 자동 설치하려면 아래 Google API 권한이 필요하다.

- Google OAuth Client ID
- Google Drive API
- Google Sheets API
- Google Apps Script API
- OAuth 동의 화면 설정
- 필요한 scopes
  - `https://www.googleapis.com/auth/drive.file`
  - `https://www.googleapis.com/auth/spreadsheets`
  - `https://www.googleapis.com/auth/script.projects`
  - `https://www.googleapis.com/auth/script.deployments`

이 권한이 있어야 JJSS가 설치자의 계정으로 다음 작업을 수행할 수 있다.

1. 설치자 Google Drive에 JJSS 전용 폴더 생성
2. 새 Google Spreadsheet 생성
3. Spreadsheet 안에 업무별 시트 생성
4. Apps Script 프로젝트 생성
5. `Code.gs`, `setup.gs`, `Index.html`, `appsscript.json` 업로드
6. Apps Script 웹앱 배포 생성
7. 생성된 웹앱 URL을 JJSS에 자동 저장

## 현재 코드에서 이미 준비된 부분

아래 부분은 이미 준비되어 있다.

- GAS 저장 API: `welfare-system-app/gas/Code.gs`
- 시트 초기화: `welfare-system-app/gas/setup.gs`
- GAS용 단일 HTML 빌드: `welfare-system-app/gas/Index.html`
- 복사 도우미 콘텐츠: `welfare-system-app/content.js`
- 업무시스템 접속 링크 저장: `src/pages/WelfareLauncher.tsx`
- 업무별 저장 시트
  - `출퇴근기록`
  - `차량운행일지`
  - `공지사항`
  - `연차휴가`
  - `출장명령부`
  - `이메일발송`
  - `세출총괄표`
  - `프로그램출석부`
  - `재고관리`
  - `문서대장`
  - `일정관리`
  - `직원목록`
  - `차량목록`
  - `기관설정`

## 현재 부족한 부분

아래는 아직 필요하다.

- Google OAuth Client ID
- 설치자 계정으로 Google API 토큰 발급
- Drive/Sheets/Apps Script API 호출 코드
- Apps Script API를 통한 프로젝트 생성/파일 업로드/배포 생성
- 설치 완료 후 웹앱 URL을 로컬 저장소에 자동 등록

## 권장 구현 방식

### 1단계: 안전한 반자동 설치

현재 가장 안정적인 방식이다.

- JJSS에서 설치 자료를 연다.
- 사용자가 자신의 Google Drive에 Spreadsheet를 만든다.
- Apps Script에 코드를 넣고 배포한다.
- 배포 URL을 JJSS에 저장한다.

장점:
- Google Cloud OAuth 심사가 필요 없다.
- 기관별 계정으로 확실히 소유된다.
- 권한 문제가 적다.

단점:
- 사용자가 Apps Script 배포를 한 번 해야 한다.

### 2단계: OAuth 기반 자동 설치

제품화 단계에서 구현할 방식이다.

- `VITE_GOOGLE_CLIENT_ID`를 설정한다.
- 사용자가 "Google 계정으로 자동 설치" 버튼을 누른다.
- Google 로그인/권한 승인 후 JJSS가 Drive/Sheets/Apps Script를 생성한다.
- 생성된 웹앱 URL을 자동 저장한다.

장점:
- 설치자가 한 번의 승인으로 자기 계정에 설치 가능하다.

단점:
- Google Cloud Console 설정이 필요하다.
- Apps Script API 사용 승인이 필요하다.
- 조직 Google Workspace 보안 정책에 따라 차단될 수 있다.

## 구현 체크리스트

- [ ] Google Cloud 프로젝트 생성
- [ ] OAuth 동의 화면 구성
- [ ] Web OAuth Client ID 생성
- [ ] 승인된 JavaScript Origin 등록
  - 로컬: `http://127.0.0.1:5174`
  - 배포 도메인
- [ ] Drive API 활성화
- [ ] Sheets API 활성화
- [ ] Apps Script API 활성화
- [ ] JJSS `.env`에 `VITE_GOOGLE_CLIENT_ID` 추가
- [ ] 자동 설치 UI 추가
- [ ] 설치 결과 URL을 업무시스템 접속 링크 목록에 저장

## 현재 판단

지금 바로 배포 가능한 안정 버전은 "반자동 설치 + 원클릭 시트 초기화" 방식이다.

설치자 계정에 완전 자동 설치하는 기능은 Google OAuth 설정이 준비되면 구현 가능하다. 단, OAuth Client ID 없이 프론트엔드 코드만으로 설치자의 Google Drive에 새 Apps Script 웹앱을 자동 생성하고 배포하는 것은 불가능하다.
