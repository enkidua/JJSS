import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Sparkles, Wand2, Zap, Crown, ArrowRight, Download, Eye, LayoutTemplate, Loader2, X } from 'lucide-react';
import { generateImage } from '../services/gemini';
import { saveJjssDataUrl, savedLocationMessage } from '../utils/jjssFileService';

interface PromoDesignViewProps {
    onBack: () => void;
}

const CATEGORIES = [
    { id: 'all', label: '전체', count: 10 },
    { id: 'infographic', label: '인포그래픽', count: 3 },
    { id: 'illustration', label: '일러스트', count: 2 },
    { id: 'notebook', label: '노트/낙서', count: 2 },
    { id: 'manga', label: '만화/코믹', count: 2 },
    { id: 'art', label: '아트/공예', count: 1 },
];

type Template = {
    id: string;
    title: string;
    desc: string;
    category: string;
    badge: string;
    tags: string[];
    gradient: string;
    image?: string;
    fullPrompt: string;
};

const TEMPLATES: Template[] = [
    {
        id: 't1', 
        title: '신뢰의 데이터 인포그래픽', 
        desc: '아이소메트릭 구조와 정밀한 수치 비교를 위한 비즈니스 최적화 디자인입니다.', 
        category: 'infographic', 
        badge: 'Infographic', 
        tags: ['#수치중심', '#아이소메트릭', '#비즈니스'],
        gradient: 'from-blue-100 to-indigo-100',
        image: import.meta.env.BASE_URL + 'templates/T1.png',
        fullPrompt: `## 비주얼 스타일: Infographic / Isometric / Data

### 색상 구성
- 배경: 라이트 그레이(#F5F5F5) 또는 화이트
- 주 텍스트 색상: 다크 그레이
- 강조 색상: 정보 카테고리별 컬러 코딩(블루, 그린, 오렌지)
- 색채는 수치 비교가 빠르게 읽히도록 대비를 확보하고 정량 인지성을 우선한다.

### 타이포그래피
- 제목: 신뢰할 수 있는 산세리프(Helvetica, Roboto).
- 본문: 작지만 읽기 쉬운 폰트.
- 구조: 제목과 본문의 역할이 분명한 구조
- 숫자 표현: 데이터 값을 강조하는 크고 볼드한.

### 레이아웃 그리드
- 정보의 위계가 한눈에 읽히는 구성을 만든다
- 여백은 단순한 빈칸이 아니라 품위와 가독성을 높이는 요소로 다룬다
- 정렬은 단정하게 유지하되 지나치게 기계적으로 보이지 않게 한다
- 여러 페이지 목록, 컨택트시트, 썸네일 그리드처럼 보이게 하지 않는다

### 일러스트 스타일
- 등각투상 도시 또는 공장, 파이프라인, 플로우차트
- 3D 아이콘, 화살표, 그래프
- 매트 벡터
- 입력 주제에 포함된 모티프만 조용하게 시각화한다
- 장식적 일러스트보다 카드, 그리드, 구조 도식을 우선한다.
- 기업 자료에 부적절한 상징성이 강한 의장은 피한다

### 데이터 비주얼라이제이션
- 표, 도식, 핵심 포인트를 질서 있게 정리한다
- 강조는 최소화하고 읽는 속도를 우선한다
- 도표는 비교, 변화, 규모가 한눈에 읽히도록 설계한다.
- 라벨, 제목, 수치의 관계가 즉시 읽히도록 배치한다

### 포함할 슬라이드 타입
- 타이틀 슬라이드
  - 상단에 제목, 주변에 작은 보조 정보, 중앙 또는 오른쪽에 상징 비주얼을 둘 수 있다
- 개요 슬라이드
  - 왼쪽에 큰 핵심 헤드라인, 오른쪽에 요약문이나 보조 데이터를 둘 수 있다
- 비교표 슬라이드
  - 상단에 비교 주제, 중앙에 비교표, 하단에 짧은 시사점을 둘 수 있다
- 데이터 정리 슬라이드
  - 상단에 주요 수치, 중단에 차트, 하단에 요점이나 주석을 둘 수 있다
- 흐름 또는 구조 정리 슬라이드
  - 좌우 또는 상하 흐름으로 관계를 정리하고 연결선과 화살표는 절제해 사용한다
- 출력 시에는 위 유형 중 하나를 선택해 완성된 1페이지 슬라이드로 정리한다

### 톤 & 보이스
- 지적
- 명확함
- 비즈니스
- 교육적
- 화면 전체에 절제된 존재감과 세련됨을 부여한다
- 스타일이 주제보다 앞서 보이지 않도록 한다
- 과하게 튀지 않지만 기억에 남는 인상을 지향한다`
    },
    {
        id: 't2', 
        title: '모던 코퍼레이트 멤피스', 
        desc: '친근한 플랫 일러스트와 멤피스 패턴이 결합된 감각적인 기업용 디자인입니다.', 
        category: 'illustration', 
        badge: 'Flat Illustration', 
        tags: ['#친근함', '#테크스타일', '#멤피스'],
        gradient: 'from-pink-100 to-rose-100',
        image: import.meta.env.BASE_URL + 'templates/T2.png',
        fullPrompt: `## 비주얼 스타일: Flat illustration / Corporate / Memphis

### 색상 구성
- 배경: 화이트 또는 매우 연한 파스텔 그레이.
- 주 텍스트 색상: #3B5998 (코퍼레이트 블루)
- 강조 색상: #FF6B6B (액센트 레드), #FFD93D (액센트 옐로우), #6C5CE7 (소프트 퍼플)
- 색채는 친근함을 주되 기업 자료로서의 정돈감은 잃지 않는다.

### 타이포그래피
- 제목: 오픈 산스, 로보토 또는 모던 기하학적 산세리프.
- 본문: 읽기 쉬운 본문 서체
- 구조: 깔끔함, 가독성 중심, 미디엄 웨이트.
- 숫자 표현: 중요한 수치는 정보의 축으로 읽히도록 정리한다

### 레이아웃 그리드
- 균형 잡힌, 삼등분 법칙, 충분한 여백
- 여백은 단순한 빈칸이 아니라 품위와 가독성을 높이는 요소로 다룬다
- 정렬은 단정하게 유지하되 지나치게 기계적으로 보이지 않게 한다
- 여러 페이지 목록, 컨택트시트, 썸네일 그리드처럼 보이게 하지 않는다

### 일러스트 스타일
- 장난기 있는 멤피스 패턴을 활용한 플랫 벡터, 현대적 테크 회사 스타일.
- 물결선, 점, 삼각형, 유기적 블롭(멤피스 요소).
- 질감과 패턴은 절제된 보조 요소로만 사용한다
- 큰 팔다리의 플랫 피규어, 단순화된 오브젝트, 벡터 씬.
- 부드러운 형태를 써도 좋지만 화면이 유치하게 보이지 않도록 조절한다.
- 기업 자료에 부적절한 상징성이 강한 의장은 피한다

### 데이터 비주얼라이제이션
- 표, 도식, 핵심 포인트를 질서 있게 정리한다
- 강조는 최소화하고 읽는 속도를 우선한다
- 친근한 형태를 허용하되 설명의 흐름은 명료하게 유지한다.
- 라벨, 제목, 수치의 관계가 즉시 읽히도록 배치한다

### 포함할 슬라이드 타입
- 타이틀 슬라이드
  - 상단에 제목, 주변에 작은 보조 정보, 중앙 또는 오른쪽에 상징 비주얼을 둘 수 있다
- 개요 슬라이드
  - 왼쪽에 큰 핵심 헤드라인, 오른쪽에 요약문이나 보조 데이터를 둘 수 있다
- 비교표 슬라이드
  - 상단에 비교 주제, 중앙에 비교표, 하단에 짧은 시사점을 둘 수 있다
- 데이터 정리 슬라이드
  - 상단에 주요 수치, 중단에 차트, 하단에 요점이나 주석을 둘 수 있다
- 흐름 또는 구조 정리 슬라이드
  - 좌우 또는 상하 흐름으로 관계를 정리하고 연결선과 화살표는 절제해 사용한다
- 출력 시에는 위 유형 중 하나를 선택해 완성된 1페이지 슬라이드로 정리한다

### 톤 & 보이스
- 친근함
- 전문적
- 신뢰할 수 있는
- 현대적
- 포용적
- 화면 전체에 절제된 존재감과 세련됨을 부여한다
- 스타일이 주제보다 앞서 보이지 않도록 한다
- 과하게 튀지 않지만 기억에 남는 인상을 지향한다`
    },
    {
        id: 't3', 
        title: '블루 잉크 브레인스토밍', 
        desc: '노트 위에 끄적인 듯한 블루 잉크 펜 스타일의 창의적인 레이아웃입니다.', 
        category: 'notebook', 
        badge: 'Doodle', 
        tags: ['#손글씨', '#아이디어', '#캐주얼'],
        gradient: 'from-blue-50 to-slate-100',
        image: import.meta.env.BASE_URL + 'templates/T3.png',
        fullPrompt: `## 비주얼 스타일: Doodle / Notebook / Blue Ink

### 색상 구성
- 배경: 줄 긋기 노트 종이 또는 모눈종이.
- 주 텍스트 색상: #0000CD (파란 볼펜 잉크)
- 강조 색상: #FF0000 (빨간 수정 잉크), #FFFFFF (종이)
- 스타일의 개성을 살리면서도 발표 자료로서의 명료함과 차분함을 유지한다.

### 타이포그래피
- 제목: 손글씨 폰트.
- 본문: 읽기 쉬운 본문 서체
- 구조: 지저분함, 끄적임, 밑줄.
- 숫자 표현: 중요한 수치는 정보의 축으로 읽히도록 정리한다

### 레이아웃 그리드
- 여백 주석 스타일, 자유 형식, 브레인스토밍 스타일
- 여백은 단순한 빈칸이 아니라 품위와 가독성을 높이는 요소로 다룬다
- 정렬은 단정하게 유지하되 지나치게 기계적으로 보이지 않게 한다
- 여러 페이지 목록, 컨택트시트, 썸네일 그리드처럼 보이게 하지 않는다

### 일러스트 스타일
- 줄 긋기 종이 위에 그린, 캐주얼 손글씨 미학.
- 형태 언어는 일관되게 유지한다
- 질감과 패턴은 절제된 보조 요소로만 사용한다
- 막대 인간, 별, 화살표, 커피 얼룩.
- 도해는 스타일의 개성을 드러내되 주제 이해를 보조하는 역할에 머문다.
- 기업 자료에 부적절한 상징성이 강한 의장은 피한다

### 데이터 비주얼라이제이션
- 표, 도식, 핵심 포인트를 질서 있게 정리한다
- 강조는 최소화하고 읽는 속도를 우선한다
- 스타일의 개성을 남기면서도 핵심이 빠르게 읽히도록 만든다.
- 라벨, 제목, 수치의 관계가 즉시 읽히도록 배치한다

### 포함할 슬라이드 타입
- 타이틀 슬라이드
  - 상단에 제목, 주변에 작은 보조 정보, 중앙 또는 오른쪽에 상징 비주얼을 둘 수 있다
- 개요 슬라이드
  - 왼쪽에 큰 핵심 헤드라인, 오른쪽에 요약문이나 보조 데이터를 둘 수 있다
- 비교표 슬라이드
  - 상단에 비교 주제, 중앙에 비교표, 하단에 짧은 시사점을 둘 수 있다
- 데이터 정리 슬라이드
  - 상단에 주요 수치, 중단에 차트, 하단에 요점이나 주석을 둘 수 있다
- 흐름 또는 구조 정리 슬라이드
  - 좌우 또는 상하 흐름으로 관계를 정리하고 연결선과 화살표는 절제해 사용한다
- 출력 시에는 위 유형 중 하나를 선택해 완성된 1페이지 슬라이드로 정리한다

### 톤 & 보이스
- 창의적
- 러프
- 개인적
- 브레인스토밍
- 진정성
- 화면 전체에 절제된 존재감과 세련됨을 부여한다
- 스타일이 주제보다 앞서 보이지 않도록 한다
- 과하게 튀지 않지만 기억에 남는 인상을 지향한다`
    },
    {
        id: 't4', 
        title: '컬러풀 아이소메트릭 플로우', 
        desc: '밝고 생동감 넘치는 컬러와 구조화된 흐름을 보여주는 인포그래픽 디자인입니다.', 
        category: 'infographic', 
        badge: 'Isometric', 
        tags: ['#컬러풀', '#흐름도', '#모던'],
        gradient: 'from-teal-100 to-emerald-100',
        image: import.meta.env.BASE_URL + 'templates/T4.png',
        fullPrompt: `## 비주얼 스타일: Infographic / Isometric / Colorful

### 색상 구성
- 배경: 라이트 그레이 또는 희미한 그리드.
- 주 텍스트 색상: #FF6B6B (레드)
- 강조 색상: #4ECDC4 (틸), #FFE66D (옐로우), #1A535C (다크 블루)
- 스타일의 개성을 살리면서도 발표 자료로서의 명료함과 차분함을 유지한다.

### 타이포그래피
- 제목: 라운드 산세리프.
- 본문: 읽기 쉬운 본문 서체
- 구조: 명확한 계층, 라벨.
- 숫자 표현: 중요한 수치는 정보의 축으로 읽히도록 정리한다

### 레이아웃 그리드
- 구조화된 흐름, 상호연결된 요소, 명확한 경로
- 여백은 단순한 빈칸이 아니라 품위와 가독성을 높이는 요소로 다룬다
- 정렬은 단정하게 유지하되 지나치게 기계적으로 보이지 않게 한다
- 여러 페이지 목록, 컨택트시트, 썸네일 그리드처럼 보이게 하지 않는다

### 일러스트 스타일
- 3D 등각투상 벡터 일러스트레이션을 사용한 데이터 시각화 초점.
- 등각투상 그래프, 원형 그래프, 플로우차트 커넥터.
- 질감과 패턴은 절제된 보조 요소로만 사용한다
- 미니 사람들, 떠다니는 플랫폼, 아이콘.
- 도해는 스타일의 개성을 드러내되 주제 이해를 보조하는 역할에 머문다.
- 기업 자료에 부적절한 상징성이 강한 의장은 피한다

### 데이터 비주얼라이제이션
- 표, 도식, 핵심 포인트를 질서 있게 정리한다
- 강조는 최소화하고 읽는 속도를 우선한다
- 스타일의 개성을 남기면서도 핵심이 빠르게 읽히도록 만든다.
- 라벨, 제목, 수치의 관계가 즉시 읽히도록 배치한다

### 포함할 슬라이드 타입
- 타이틀 슬라이드
  - 상단에 제목, 주변에 작은 보조 정보, 중앙 또는 오른쪽에 상징 비주얼을 둘 수 있다
- 개요 슬라이드
  - 왼쪽에 큰 핵심 헤드라인, 오른쪽에 요약문이나 보조 데이터를 둘 수 있다
- 비교표 슬라이드
  - 상단에 비교 주제, 중앙에 비교표, 하단에 짧은 시사점을 둘 수 있다
- 데이터 정리 슬라이드
  - 상단에 주요 수치, 중단에 차트, 하단에 요점이나 주석을 둘 수 있다
- 흐름 또는 구조 정리 슬라이드
  - 좌우 또는 상하 흐름으로 관계를 정리하고 연결선과 화살표는 절제해 사용한다
- 출력 시에는 위 유형 중 하나를 선택해 완성된 1페이지 슬라이드로 정리한다

### 톤 & 보이스
- 정보적
- 장난기
- 명확함
- 프로페셔널
- 모던
- 화면 전체에 절제된 존재감과 세련됨을 부여한다
- 스타일이 주제보다 앞서 보이지 않도록 한다
- 과하게 튀지 않지만 기억에 남는 인상을 지향한다`
    },
    {
        id: 't5', 
        title: '빈티지 칠판 아카이브', 
        desc: '어두운 칠판 위에 초크로 그린 듯한 클래식하고 핸드메이드한 감성의 디자인입니다.', 
        category: 'art', 
        badge: 'Chalk Art', 
        tags: ['#아날로그', '#교육적', '#칠판'],
        gradient: 'from-slate-700 to-slate-900',
        image: import.meta.env.BASE_URL + 'templates/T5.png',
        fullPrompt: `## 비주얼 스타일: Handwritten / Chalk / Casual

### 색상 구성
- 배경: #2F4F4F (다크 슬레이트 그레이) - 칠판 색상.
- 주 텍스트 색상: #FFFFFF (화이트) - 초크.
- 강조 색상: #FF6347 (토마토), #FFD700 (옐로우)
- 스타일의 개성을 살리면서도 발표 자료로서의 명료함과 차분함을 유지한다.

### 타이포그래피
- 제목: 핸드 레터링 스타일 폰트.
- 본문: 읽기 쉬운 본문 서체
- 구조: 불규칙한 크기와 기울기.
- 숫자 표현: 중요한 수치는 정보의 축으로 읽히도록 정리한다

### 레이아웃 그리드
- 프리핸드의 자유로운 레이아웃
- 여백은 단순한 빈칸이 아니라 품위와 가독성을 높이는 요소로 다룬다
- 정렬은 단정하게 유지하되 지나치게 기계적으로 보이지 않게 한다
- 여러 페이지 목록, 컨택트시트, 썸네일 그리드처럼 보이게 하지 않는다

### 일러스트 스타일
- 칠판 아트나 손글씨 메뉴 스타일.
- 손그림 일러스트나 장식 테두리.
- 질감과 패턴은 절제된 보조 요소로만 사용한다
- 입력 주제에 포함된 모티프만 조용하게 시각화한다
- 도해는 스타일의 개성을 드러내되 주제 이해를 보조하는 역할에 머문다.
- 기업 자료에 부적절한 상징성이 강한 의장은 피한다

### 데이터 비주얼라이제이션
- 표, 도식, 핵심 포인트를 질서 있게 정리한다
- 강조는 최소화하고 읽는 속도를 우선한다
- 스타일의 개성을 남기면서도 핵심이 빠르게 읽히도록 만든다.
- 라벨, 제목, 수치의 관계가 즉시 읽히도록 배치한다

### 포함할 슬라이드 타입
- 타이틀 슬라이드
  - 상단에 제목, 주변에 작은 보조 정보, 중앙 또는 오른쪽에 상징 비주얼을 둘 수 있다
- 개요 슬라이드
  - 왼쪽에 큰 핵심 헤드라인, 오른쪽에 요약문이나 보조 데이터를 둘 수 있다
- 비교표 슬라이드
  - 상단에 비교 주제, 중앙에 비교표, 하단에 짧은 시사점을 둘 수 있다
- 데이터 정리 슬라이드
  - 상단에 주요 수치, 중단에 차트, 하단에 요점이나 주석을 둘 수 있다
- 흐름 또는 구조 정리 슬라이드
  - 좌우 또는 상하 흐름으로 관계를 정리하고 연결선과 화살표는 절제해 사용한다
- 출력 시에는 위 유형 중 하나를 선택해 완성된 1페이지 슬라이드로 정리한다

### 톤 & 보이스
- 친근함
- 핸드메이드
- 카페
- 일상
- 소박
- 화면 전체에 절제된 존재감과 세련됨을 부여한다
- 스타일이 주제보다 앞서 보이지 않도록 한다
- 과하게 튀지 않지만 기억에 남는 인상을 지향한다`
    },
    {
        id: 't6', 
        title: '순정 만화 판타지', 
        desc: '70-80년대 소녀 만화의 반짝임과 감성을 담은 로맨틱한 정보 전달 디자인입니다.', 
        category: 'manga', 
        badge: 'Shoujo Manga', 
        tags: ['#반짝임', '#감성적', '#스토리'],
        gradient: 'from-purple-50 to-pink-100',
        image: import.meta.env.BASE_URL + 'templates/T6.png',
        fullPrompt: `## 비주얼 스타일: Manga / Shoujo / Sparkle

### 색상 구성
- 배경: #FFFFFF (화이트)
- 주 텍스트 색상: #000000 (블랙)
- 강조 색상: 스크린 톤 그레이.
- 스타일의 개성을 살리면서도 발표 자료로서의 명료함과 차분함을 유지한다.

### 타이포그래피
- 제목: 둥근 고딕 또는 앤틱체.
- 본문: 읽기 쉬운 본문 서체
- 구조: 장식적이고 귀여움.
- 숫자 표현: 중요한 수치는 정보의 축으로 읽히도록 정리한다

### 레이아웃 그리드
- 정보의 위계가 한눈에 읽히는 구성을 만든다
- 여백은 단순한 빈칸이 아니라 품위와 가독성을 높이는 요소로 다룬다
- 정렬은 단정하게 유지하되 지나치게 기계적으로 보이지 않게 한다
- 여러 페이지 목록, 컨택트시트, 썸네일 그리드처럼 보이게 하지 않는다

### 일러스트 스타일
- 70-80년대 소녀 만화 스타일.
- 형태 언어는 일관되게 유지한다
- 질감과 패턴은 절제된 보조 요소로만 사용한다
- 입력 주제에 포함된 모티프만 조용하게 시각화한다
- 도해는 스타일의 개성을 드러내되 주제 이해를 보조하는 역할에 머문다.
- 기업 자료에 부적절한 상징성이 강한 의장은 피한다

### 데이터 비주얼라이제이션
- 표, 도식, 핵심 포인트를 질서 있게 정리한다
- 배경에 흩날리는 장미, 반짝이는 별.
- 스타일의 개성을 남기면서도 핵심이 빠르게 읽히도록 만든다.
- 라벨, 제목, 수치의 관계가 즉시 읽히도록 배치한다

### 포함할 슬라이드 타입
- 타이틀 슬라이드
  - 상단에 제목, 주변에 작은 보조 정보, 중앙 또는 오른쪽에 상징 비주얼을 둘 수 있다
- 개요 슬라이드
  - 왼쪽에 큰 핵심 헤드라인, 오른쪽에 요약문이나 보조 데이터를 둘 수 있다
- 비교표 슬라이드
  - 상단에 비교 주제, 중앙에 비교표, 하단에 짧은 시사점을 둘 수 있다
- 데이터 정리 슬라이드
  - 상단에 주요 수치, 중단에 차트, 하단에 요점이나 주석을 둘 수 있다
- 흐름 또는 구조 정리 슬라이드
  - 좌우 또는 상하 흐름으로 관계를 정리하고 연결선과 화살표는 절제해 사용한다
- 출력 시에는 위 유형 중 하나를 선택해 완성된 1페이지 슬라이드로 정리한다

### 톤 & 보이스
- 걸리
- 사랑
- 꿈
- 소녀 만화
- 반짝임
- 로맨틱하고 감정적.
- 스타일이 주제보다 앞서 보이지 않도록 한다
- 과하게 튀지 않지만 기억에 남는 인상을 지향한다`
    },
    {
        id: 't7', 
        title: '큐트 스티커 다이어리', 
        desc: '귀여운 캐릭터와 형광펜 메모가 가득한 친근하고 따뜻한 낙서 디자인입니다.', 
        category: 'notebook', 
        badge: 'Cute Doodle', 
        tags: ['#스쿨스타일', '#팬시', '#팀워크'],
        gradient: 'from-yellow-50 to-orange-100',
        image: import.meta.env.BASE_URL + 'templates/T7.png',
        fullPrompt: `## 비주얼 스타일: Doodle / Notebook / Cute

### 색상 구성
- 배경: 대학 노트 줄, 모눈종이
- 주 텍스트 색상: 볼펜 블루, 블랙
- 강조 색상: 형광펜(핑크, 옐로우)
- 색채는 친근함을 주되 기업 자료로서의 정돈감은 잃지 않는다.

### 타이포그래피
- 제목: 아웃라인 글자에 해칭으로 그림자를 넣은 손글씨.
- 본문: 둥근 문자.
- 구조: 제목과 본문의 역할이 분명한 구조
- 숫자 표현: 귀엽게 장식한 숫자.

### 레이아웃 그리드
- 정보의 위계가 한눈에 읽히는 구성을 만든다
- 여백은 단순한 빈칸이 아니라 품위와 가독성을 높이는 요소로 다룬다
- 정렬은 단정하게 유지하되 지나치게 기계적으로 보이지 않게 한다
- 여러 페이지 목록, 컨택트시트, 썸네일 그리드처럼 보이게 하지 않는다

### 일러스트 스타일
- 수업 중 낙서, 막대 인간, 별, 하트, 느슨한 캐릭터
- 프리핸드 라인
- 볼펜 잉크 뭉침
- 입력 주제에 포함된 모티프만 조용하게 시각화한다
- 부드러운 형태를 써도 좋지만 화면이 유치하게 보이지 않도록 조절한다.
- 기업 자료에 부적절한 상징성이 강한 의장은 피한다

### 데이터 비주얼라이제이션
- 표, 도식, 핵심 포인트를 질서 있게 정리한다
- 강조는 최소화하고 읽는 속도를 우선한다
- 친근한 형태를 허용하되 설명의 흐름은 명료하게 유지한다.
- 라벨, 제목, 수치의 관계가 즉시 읽히도록 배치한다

### 포함할 슬라이드 타입
- 타이틀 슬라이드
  - 상단에 제목, 주변에 작은 보조 정보, 중앙 또는 오른쪽에 상징 비주얼을 둘 수 있다
- 개요 슬라이드
  - 왼쪽에 큰 핵심 헤드라인, 오른쪽에 요약문이나 보조 데이터를 둘 수 있다
- 비교표 슬라이드
  - 상단에 비교 주제, 중앙에 비교표, 하단에 짧은 시사점을 둘 수 있다
- 데이터 정리 슬라이드
  - 상단에 주요 수치, 중단에 차트, 하단에 요점이나 주석을 둘 수 있다
- 흐름 또는 구조 정리 슬라이드
  - 좌우 또는 상하 흐름으로 관계를 정리하고 연결선과 화살표는 절제해 사용한다
- 출력 시에는 위 유형 중 하나를 선택해 완성된 1페이지 슬라이드로 정리한다

### 톤 & 보이스
- 귀여움
- 학교
- 시간 때우기
- 팬시
- 화면 전체에 절제된 존재감과 세련됨을 부여한다
- 스타일이 주제보다 앞서 보이지 않도록 한다
- 과하게 튀지 않지만 기억에 남는 인상을 지향한다`
    },
    {
        id: 't8', 
        title: '레이어드 페이퍼 크래프트', 
        desc: '입체적인 그림자와 종이 질감이 느껴지는 따뜻한 수공예 스타일 디자인입니다.', 
        category: 'art', 
        badge: 'Paper Craft', 
        tags: ['#입체감', '#따뜻함', '#수제'],
        gradient: 'from-orange-50 to-amber-100',
        image: import.meta.env.BASE_URL + 'templates/T8.png',
        fullPrompt: `## 비주얼 스타일: Paper Craft / Layered / Shadow

### 색상 구성
- 배경: 파스텔 컬러 색종이
- 주 텍스트 색상: 종이 오려내기처럼 보이는 글자
- 강조 색상: 보색 색종이
- 스타일의 개성을 살리면서도 발표 자료로서의 명료함과 차분함을 유지한다.

### 타이포그래피
- 제목: 오려낸 글자 또는 볼드 라운드 폰트.
- 본문: 손글씨 스타일 또는 친근한 산세리프.
- 구조: 제목과 본문의 역할이 분명한 구조
- 숫자 표현: 크게 배치된 종이 오려내기.

### 레이아웃 그리드
- 정보의 위계가 한눈에 읽히는 구성을 만든다
- 여백은 단순한 빈칸이 아니라 품위와 가독성을 높이는 요소로 다룬다
- 정렬은 단정하게 유지하되 지나치게 기계적으로 보이지 않게 한다
- 여러 페이지 목록, 컨택트시트, 썸네일 그리드처럼 보이게 하지 않는다

### 일러스트 스타일
- 물리적 그림자가 있는 종이 겹침, 종이 오려내기, 콜라주
- 가위로 자른 가장자리, 레이어
- 색종이의 거친 느낌, 약간의 두께
- 입력 주제에 포함된 모티프만 조용하게 시각화한다
- 도해는 스타일의 개성을 드러내되 주제 이해를 보조하는 역할에 머문다.
- 기업 자료에 부적절한 상징성이 강한 의장은 피한다

### 데이터 비주얼라이제이션
- 표, 도식, 핵심 포인트를 질서 있게 정리한다
- 강조는 최소화하고 읽는 속도를 우선한다
- 스타일의 개성을 남기면서도 핵심이 빠르게 읽히도록 만든다.
- 라벨, 제목, 수치의 관계가 즉시 읽히도록 배치한다

### 포함할 슬라이드 타입
- 타이틀 슬라이드
  - 상단에 제목, 주변에 작은 보조 정보, 중앙 또는 오른쪽에 상징 비주얼을 둘 수 있다
- 개요 슬라이드
  - 왼쪽에 큰 핵심 헤드라인, 오른쪽에 요약문이나 보조 데이터를 둘 수 있다
- 비교표 슬라이드
  - 상단에 비교 주제, 중앙에 비교표, 하단에 짧은 시사점을 둘 수 있다
- 데이터 정리 슬라이드
  - 상단에 주요 수치, 중단에 차트, 하단에 요점이나 주석을 둘 수 있다
- 흐름 또는 구조 정리 슬라이드
  - 좌우 또는 상하 흐름으로 관계를 정리하고 연결선과 화살표는 절제해 사용한다
- 출력 시에는 위 유형 중 하나를 선택해 완성된 1페이지 슬라이드로 정리한다

### 톤 & 보이스
- 따뜻함
- 공예적
- 동화 같은
- 입체적
- 화면 전체에 절제된 존재감과 세련됨을 부여한다
- 스타일이 주제보다 앞서 보이지 않도록 한다
- 과하게 튀지 않지만 기억에 남는 인상을 지향한다`
    },
    {
        id: 't9', 
        title: '임팩트 소년 만화', 
        desc: '강렬한 잉크 터치와 스크린 톤으로 역동적인 에너지를 전달하는 만화 디자인입니다.', 
        category: 'manga', 
        badge: 'Action Manga', 
        tags: ['#강렬함', '#흑백에너지', '#임팩트'],
        gradient: 'from-gray-100 to-zinc-200',
        image: import.meta.env.BASE_URL + 'templates/T9.png',
        fullPrompt: `## 비주얼 스타일: Manga / Screen Tone / Action

### 색상 구성
- 배경: #FFFFFF (화이트)
- 주 텍스트 색상: #000000 (잉크 블랙)
- 강조 색상: 없음 (또는 효과음에 레드).
- 스타일의 개성을 살리면서도 발표 자료로서의 명료함과 차분함을 유지한다.

### 타이포그래피
- 제목: 주제를 단정하게 보여 주는 제목 서체
- 본문: 읽기 쉬운 본문 서체
- 구조: 제목과 본문의 역할이 분명한 구조
- 숫자 표현: 중요한 수치는 정보의 축으로 읽히도록 정리한다

### 레이아웃 그리드
- 정보의 위계가 한눈에 읽히는 구성을 만든다
- 여백은 단순한 빈칸이 아니라 품위와 가독성을 높이는 요소로 다룬다
- 정렬은 단정하게 유지하되 지나치게 기계적으로 보이지 않게 한다
- 여러 페이지 목록, 컨택트시트, 썸네일 그리드처럼 보이게 하지 않는다

### 일러스트 스타일
- 스타일의 개성을 전달하는 도해와 시각 요소를 사용한다
- 형태 언어는 일관되게 유지한다
- 질감과 패턴은 절제된 보조 요소로만 사용한다
- 입력 주제에 포함된 모티프만 조용하게 시각화한다
- 도해는 스타일의 개성을 드러내되 주제 이해를 보조하는 역할에 머문다.
- 기업 자료에 부적절한 상징성이 강한 의장은 피한다

### 데이터 비주얼라이제이션
- 표, 도식, 핵심 포인트를 질서 있게 정리한다
- 강조는 최소화하고 읽는 속도를 우선한다
- 스타일의 개성을 남기면서도 핵심이 빠르게 읽히도록 만든다.
- 라벨, 제목, 수치의 관계가 즉시 읽히도록 배치한다

### 포함할 슬라이드 타입
- 타이틀 슬라이드
  - 상단에 제목, 주변에 작은 보조 정보, 중앙 또는 오른쪽에 상징 비주얼을 둘 수 있다
- 개요 슬라이드
  - 왼쪽에 큰 핵심 헤드라인, 오른쪽에 요약문이나 보조 데이터를 둘 수 있다
- 비교표 슬라이드
  - 상단에 비교 주제, 중앙에 비교표, 하단에 짧은 시사점을 둘 수 있다
- 데이터 정리 슬라이드
  - 상단에 주요 수치, 중단에 차트, 하단에 요점이나 주석을 둘 수 있다
- 흐름 또는 구조 정리 슬라이드
  - 좌우 또는 상하 흐름으로 관계를 정리하고 연결선과 화살표는 절제해 사용한다
- 출력 시에는 위 유형 중 하나를 선택해 완성된 1페이지 슬라이드로 정리한다

### 톤 & 보이스
- 만화
- 임팩트
- 일본
- 스토리
- 흑백
- 화면 전체에 절제된 존재감과 세련됨을 부여한다
- 스타일이 주제보다 앞서 보이지 않도록 한다
- 과하게 튀지 않지만 기억에 남는 인상을 지향한다`
    },
    {
        id: 't10', 
        title: '스페이스 빈티지 콜라주', 
        desc: '코믹북 아트와 아메리칸 빈티지 감성이 조화된 폭발적인 임팩트의 디자인입니다.', 
        category: 'illustration', 
        badge: 'Vintage Collage', 
        tags: ['#에너제틱', '#레트로', '#팝아트'],
        gradient: 'from-yellow-100 to-red-100',
        image: import.meta.env.BASE_URL + 'templates/T10.png',
        fullPrompt: `## 비주얼 스타일: Collage / Space / Vintage

### 색상 구성
- 배경: #FFFF00 (옐로우)
- 주 텍스트 색상: #000000 (블랙)
- 강조 색상: #FF0000 (레드), #0000FF (블루)
- 스타일의 개성을 살리면서도 발표 자료로서의 명료함과 차분함을 유지한다.

### 타이포그래피
- 제목: 코믹북 폰트.
- 본문: 읽기 쉬운 본문 서체
- 구조: 말풍선에 넣거나 의성어 스타일.
- 숫자 표현: 중요한 수치는 정보의 축으로 읽히도록 정리한다

### 레이아웃 그리드
- 정보의 위계가 한눈에 읽히는 구성을 만든다
- 여백은 단순한 빈칸이 아니라 품위와 가독성을 높이는 요소로 다룬다
- 정렬은 단정하게 유지하되 지나치게 기계적으로 보이지 않게 한다
- 여러 페이지 목록, 컨택트시트, 썸네일 그리드처럼 보이게 하지 않는다

### 일러스트 스타일
- 아메리칸 코믹 스타일 포스터 아트.
- 형태 언어는 일관되게 유지한다
- 질감과 패턴은 절제된 보조 요소로만 사용한다
- 입력 주제에 포함된 모티프만 조용하게 시각화한다
- 도해는 스타일의 개성을 드러내되 주제 이해를 보조하는 역할에 머문다.
- 기업 자료에 부적절한 상징성이 강한 의장은 피한다

### 데이터 비주얼라이제이션
- 표, 도식, 핵심 포인트를 질서 있게 정리한다
- 강조는 최소화하고 읽는 속도를 우선한다
- 스타일의 개성을 남기면서도 핵심이 빠르게 읽히도록 만든다.
- 라벨, 제목, 수치의 관계가 즉시 읽히도록 배치한다

### 포함할 슬라이드 타입
- 타이틀 슬라이드
  - 상단에 제목, 주변에 작은 보조 정보, 중앙 또는 오른쪽에 상징 비주얼을 둘 수 있다
- 개요 슬라이드
  - 왼쪽에 큰 핵심 헤드라인, 오른쪽에 요약문이나 보조 데이터를 둘 수 있다
- 비교표 슬라이드
  - 상단에 비교 주제, 중앙에 비교표, 하단에 짧은 시사점을 둘 수 있다
- 데이터 정리 슬라이드
  - 상단에 주요 수치, 중단에 차트, 하단에 요점이나 주석을 둘 수 있다
- 흐름 또는 구조 정리 슬라이드
  - 좌우 또는 상하 흐름으로 관계를 정리하고 연결선과 화살표는 절제해 사용한다
- 출력 시에는 위 유형 중 하나를 선택해 완성된 1페이지 슬라이드로 정리한다

### 톤 & 보이스
- 대중적
- 상업적
- 임팩트
- 아메리칸
- 에너제틱
- 화면 전체에 절제된 존재감과 세련됨을 부여한다
- 스타일이 주제보다 앞서 보이지 않도록 한다
- 과하게 튀지 않지만 기억에 남는 인상을 지향한다`
    },
];

export function PromoDesignView({ onBack }: PromoDesignViewProps) {
    const [prompt, setPrompt] = useState('');
    const [activeTab, setActiveTab] = useState('all');

    const [isLoading, setIsLoading] = useState(false);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [generationError, setGenerationError] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
    
    // 신규 추가: 화면 비율 및 확대 모달 상태
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    const handleGenerateForTemplate = async () => {
        if (isLoading) return;
        if (!selectedTemplate) return;

        let finalPrompt = prompt.trim() || '직업재활 활동 포스터 디자인';
        finalPrompt = `주제 및 내용: ${finalPrompt}\n\n[추가 조건]\n가로세로 화면 비율(Aspect Ratio) 가이드: ${aspectRatio}\n\n[디자인 가이드라인 필수 적용 사항]\n다음 스타일 가이드를 엄격하게 준수하여 이미지를 생성하세요:\n${selectedTemplate.fullPrompt}`;

        setIsLoading(true);
        setResultImage(null);
        setGenerationError('');
        try {
            // 모든 이미지를 나노바나나2로 고정 세팅
            const res = await generateImage(finalPrompt, 'custom', 'nanobanana2');
            setResultImage(`data:${res.mimeType};base64,${res.imageBase64}`);
        } catch (e: any) {
            setGenerationError(`${e.message || '이미지 생성 중 오류가 발생했습니다.'} 이미지 생성이 어려운 경우, 같은 내용을 HTML/인쇄용 문서로 구성한 뒤 PDF로 저장하는 방식으로 대체할 수 있습니다. 이미지 안의 한국어 글자는 모델 상태에 따라 깨질 수 있습니다.`);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredTemplates = activeTab === 'all' 
        ? TEMPLATES 
        : TEMPLATES.filter(t => t.category === activeTab);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-6xl mx-auto"
        >
            <button
                onClick={onBack}
                className="btn-ghost flex items-center gap-2 mb-6 text-sm text-white/70 hover:text-white"
            >
                <ArrowLeft className="w-4 h-4" /> 도구 목록으로 돌아가기
            </button>

            <div className="glass-strong rounded-[2rem] shadow-2xl overflow-hidden border border-white/10 relative">
                {/* Header section */}
                <div className="pt-16 pb-12 px-8 flex flex-col items-center text-center bg-transparent">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold mb-6 border border-blue-500/30">
                        <span className="text-blue-400">●</span> CLOSED BETA 진행 중
                    </div>
                    
                    <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight mb-4 flex items-center justify-center gap-3">
                        <div>
                            직업재활 디자인, <br className="md:hidden" />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-400 text-glow">
                                AI와 함께 완성하세요.
                            </span>
                        </div>
                        <span className="text-sm uppercase font-black px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 tracking-wider h-fit mt-2">Beta</span>
                    </h1>
                    <p className="text-white/50 text-lg md:text-xl font-medium mb-10 max-w-2xl">
                        직업재활 현장에 필요한 포스터, 설명서, 안내문을<br/> 선택한 템플릿 스타일에 맞춰 AI가 자동으로 완성해 드립니다.
                    </p>
                </div>

                {/* Template Gallery */}
                <div className="px-8 py-16 bg-white/5 border-t border-white/10">
                    <div className="text-center mb-10">
                        <p className="text-blue-400 font-bold tracking-widest text-sm mb-2 uppercase">Template Gallery</p>
                        <h2 className="text-3xl font-black text-white">템플릿 둘러보기</h2>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveTab(cat.id)}
                                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                                    activeTab === cat.id 
                                    ? 'bg-blue-500 text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)]' 
                                    : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                {cat.label} <span className={`ml-1.5 opacity-60 font-normal ${activeTab === cat.id ? 'text-white' : ''}`}>{cat.count}</span>
                            </button>
                        ))}
                    </div>

                    {/* Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
                        {filteredTemplates.map((t, idx) => (
                            <motion.div 
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                key={t.id} 
                                className="glass-strong rounded-2xl border border-white/10 overflow-hidden hover:border-white/30 transition-all group flex flex-col cursor-pointer hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
                                onClick={() => setSelectedTemplate(t)}
                            >

                                {/* Thumbnail Box */}
                                <div className={`aspect-[4/3] w-full bg-gradient-to-br ${t.gradient} relative flex items-center justify-center overflow-hidden`}>
                                    {t.image ? (
                                        <img src={t.image} alt={t.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                    ) : (
                                        <LayoutTemplate className="w-16 h-16 text-black/10 transition-transform duration-500 group-hover:scale-110" />
                                    )}

                                    {/* Hover overlay hint */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                                        <div className="bg-blue-500 text-white px-5 py-2.5 rounded-full font-bold shadow-lg flex items-center gap-2">
                                            <Wand2 className="w-4 h-4" /> 프롬프트 작성하기
                                        </div>
                                    </div>

                                    
                                    <div className="absolute top-4 left-4">
                                        <span className="px-3 py-1 bg-white/90 backdrop-blur-sm text-slate-700 text-xs font-bold rounded-lg shadow-sm">
                                            {t.badge}
                                        </span>
                                    </div>
                                </div>

                                {/* Content Box */}
                                <div className="p-5 flex-1 flex flex-col bg-[#1e293b]/50">
                                    <h3 className="font-bold text-white text-lg leading-snug mb-2 group-hover:text-blue-400 transition-colors line-clamp-2">
                                        {t.title}
                                    </h3>
                                    <p className="text-white/40 text-sm mb-4 line-clamp-2 flex-1">
                                        {t.desc}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mt-auto">
                                        {t.tags.map(tag => (
                                            <span key={tag} className="text-xs font-medium text-white/30 bg-white/5 px-2 py-1 rounded border border-white/5">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Template Action Modal */}
            <AnimatePresence>
                {selectedTemplate && (
                    <div 
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 lg:p-10"
                        onClick={() => { setSelectedTemplate(null); setResultImage(null); }}
                    >
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-[#1e293b] border border-white/10 p-6 md:p-8 rounded-[2rem] shadow-2xl max-w-5xl w-full flex flex-col md:flex-row gap-8 relative overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Background glow */}
                            <div className="absolute top-0 right-0 w-[30rem] h-[30rem] bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                            
                            <button 
                                className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors z-20 bg-black/20 p-2 rounded-full"
                                onClick={() => { setSelectedTemplate(null); setResultImage(null); }}
                            >
                                <X className="w-6 h-6" />
                            </button>

                            {/* Left Side: Image Preview */}
                            <div className="w-full md:w-1/2 relative z-10 flex flex-col">
                                <div 
                                    className="rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-white/10 bg-black/40 aspect-[4/3] flex items-center justify-center relative cursor-pointer group"
                                    onClick={() => setPreviewImage(resultImage || selectedTemplate.image || null)}
                                >
                                    {resultImage ? (
                                        <img src={resultImage} alt="Generated Design" className="w-full h-full object-contain bg-slate-900 transition-transform duration-500 group-hover:scale-[1.02]" />
                                    ) : selectedTemplate.image ? (
                                        <img src={selectedTemplate.image} alt={selectedTemplate.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                                    ) : (
                                        <LayoutTemplate className="w-16 h-16 text-white/10" />
                                    )}
                                    {/* Hover 줌 아이콘 오버레이 */}
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                        <div className="bg-black/60 backdrop-blur-md text-white p-3 rounded-full flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                                            <Eye className="w-8 h-8" />
                                        </div>
                                    </div>
                                    <div className="absolute bottom-4 left-4 pointer-events-none">
                                        <span className="px-3 py-1 bg-black/60 backdrop-blur-md text-white/90 text-xs font-bold rounded-lg border border-white/20">
                                            {selectedTemplate.badge}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Right Side: Prompt Input */}
                            <div className="w-full md:w-1/2 flex flex-col justify-center relative z-10">
                                <div className="mb-6">
                                    <h3 className="text-3xl font-black text-white mb-2 tracking-tight">{selectedTemplate.title}</h3>
                                    <p className="text-white/50 text-sm">{selectedTemplate.desc}</p>
                                </div>

                                <div className="flex-1 flex flex-col">
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="block text-sm font-bold text-blue-400 flex items-center gap-2">
                                            <Sparkles className="w-4 h-4" /> 요구사항 입력
                                        </label>
                                        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-black/40 border border-white/5">
                                            {['1:1', '16:9', '9:16', '3:4'].map(ratio => (
                                                <button
                                                    key={ratio}
                                                    onClick={() => setAspectRatio(ratio)}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${aspectRatio === ratio ? 'bg-blue-500 text-white' : 'text-white/40 hover:bg-white/10 hover:text-white'}`}
                                                >
                                                    {ratio}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <textarea 
                                        className="w-full flex-1 min-h-[160px] bg-black/30 border border-white/10 rounded-2xl p-5 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none transition-colors shadow-inner text-lg"
                                        placeholder={`예) 발달장애인 바리스타 훈련생 모집\n- 대상: 19세 이상 발달장애인\n- 모집기간: 9월 1일까지\n- 문의: 02-123-4567\n이 템플릿 디자인에 맞게 문구를 수정하고 배치해줘.`}
                                        value={prompt}
                                        onChange={e => setPrompt(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>

                                <div className="flex flex-col gap-3 mt-6">
                                    <button 
                                        onClick={handleGenerateForTemplate}
                                        disabled={isLoading || !prompt.trim()}
                                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-900 disabled:to-indigo-900 disabled:text-white/40 disabled:cursor-not-allowed text-white text-lg font-black py-4 rounded-xl flex justify-center items-center gap-3 transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] active:scale-95"
                                    >
                                        {isLoading ? (
                                            <><Loader2 className="w-6 h-6 animate-spin" /> 이미지를 생성하고 있습니다...</>
                                        ) : resultImage ? (
                                            <><Wand2 className="w-6 h-6" /> 이 디자인으로 다시 생성</>
                                        ) : (
                                            <><Wand2 className="w-6 h-6" /> 이 디자인으로 생성하기</>
                                        )}
                                    </button>
                                    
                                    {resultImage && (
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                try {
                                                    const saved = await saveJjssDataUrl('image', 'ai-poster.png', resultImage);
                                                    if (saved.canceled) alert(savedLocationMessage(saved));
                                                } catch (error: any) {
                                                    setGenerationError(error?.message || '이미지를 저장하지 못했습니다.');
                                                }
                                            }}
                                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-white text-lg font-black py-3 rounded-xl flex justify-center items-center gap-2 transition-colors shadow-lg shadow-emerald-500/20 active:scale-95"
                                        >
                                            <Download className="w-5 h-5" /> 완성된 이미지 다운로드
                                        </button>
                                    )}
                                    {generationError && (
                                        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-100">
                                            {generationError}
                                        </div>
                                    )}
                                </div>
                                
                                <p className="text-center text-white/30 text-xs mt-4">
                                    이미지 생성은 텍스트 문서보다 비용과 quota를 더 많이 사용할 수 있습니다. 생성 중에는 버튼을 다시 누를 수 없습니다.
                                </p>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Fullscreen Image Preview Modal */}
            <AnimatePresence>
                {previewImage && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-3xl cursor-zoom-out"
                        onClick={() => setPreviewImage(null)}
                    >
                        <button 
                            className="absolute top-8 right-8 text-white/50 hover:text-white transition-colors bg-white/10 p-3 rounded-full hover:bg-white/20 z-10"
                            onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }}
                        >
                            <X className="w-8 h-8" />
                        </button>
                        <motion.img 
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            src={previewImage} 
                            alt="Fullscreen Preview" 
                            className="max-w-full max-h-full object-contain rounded-lg shadow-[0_0_100px_rgba(255,255,255,0.1)]"
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
