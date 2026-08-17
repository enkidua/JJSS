# 2026-05-08 메뉴/라우트 정리 기록

## 작업 목표

현재 구현 보류 또는 v2.2 기준 제거 대상인 기능을 사용자가 누를 수 없도록 메뉴와 라우트 연결에서 제외했습니다.

이번 작업은 기능 파일 삭제가 아니라 빌드 안정성을 우선한 연결 정리입니다.

## 제거한 메뉴/라우트

### 인트라넷

- 상태: 구현 보류
- 처리: 현재 앱 라우트와 메뉴에 연결되어 있지 않은 상태를 유지
- 파일: `src/pages/WelfareLauncher.tsx`는 삭제하지 않음

### 인포메이트

- 제거 전 라우트: `/infomate`
- 제거 전 메뉴명: `인포 메이트`
- 처리:
  - `src/App.tsx`에서 import와 route 제거
  - `src/components/Navbar.tsx`에서 메뉴 제거
  - `src/pages/Home.tsx`의 기능 소개 카드 제거
- 파일: `src/pages/InfoMate.tsx`는 삭제하지 않음

### 소통 공간/커뮤니티

- 제거 전 라우트: `/community`
- 제거 전 메뉴명: `소통 공간`
- 처리:
  - `src/App.tsx`에서 import와 route 제거
  - `src/components/Navbar.tsx`에서 메뉴 제거
  - `src/pages/Home.tsx`의 기능 소개 카드 제거
- 파일: `src/pages/Community.tsx`는 삭제하지 않음

## 현재 최종 메뉴 구조

1. 서비스 소개
2. 이용자 및 사업체 관리
3. 직업평가 (AI 지원)
4. 사례관리 및 매칭
5. 예산 관리
6. 업무 지원 도구
7. 설정

## 유지/복구된 메뉴

이번 작업에서 새로 복구한 메뉴는 없습니다. 기존 동작 가능한 핵심 메뉴만 유지했습니다.

유지한 메뉴:

- 서비스 소개
- 이용자 및 사업체 관리
- 직업평가 (AI 지원)
- 사례관리 및 매칭
- 예산 관리
- 업무 지원 도구
- 설정

## 빌드 결과

`npm run build` 통과.

## 변경 파일

- `src/App.tsx`
- `src/components/Navbar.tsx`
- `src/pages/Home.tsx`

