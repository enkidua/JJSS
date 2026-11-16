import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Wand2, ClipboardList,
    Pen, Lightbulb, Loader2, Sparkles, Newspaper,
    Megaphone, ScanText, CalendarDays, FileText, Smile, LayoutTemplate,
    Wrench, BarChart3, ExternalLink, MousePointer2, Briefcase, Home, Compass, PieChart, ShieldCheck, Layout, Presentation,
    Layers, Camera, Keyboard, Palette, ClipboardCheck, Gamepad2, Smartphone,
    ShieldAlert, MessageSquare, Bot, FileStack, Timer, QrCode, FileSignature, Search, Star, X, type LucideIcon
} from 'lucide-react';
import { generateText, PromptType, BlogLength, BlogPurpose } from '../services/gemini';
import { PromoDesignView } from '../components/PromoDesignView';
import { MinutesView } from '../components/MinutesView';
import { UtilitiesView } from '../components/UtilitiesView';
import { DashboardView } from '../components/DashboardView';
import { OCRView } from '../components/OCRView';
import { ScheduleDesignView } from '../components/ScheduleDesignView';
import { DocumentChatView } from '../components/DocumentChatView';
import { MaskingView } from '../components/MaskingView';
import { CopyButton } from '../components/common/CopyButton';
import { ToolPageShell } from '../components/tools/ToolPageShell';
import { AiTransmissionNotice } from '../components/tools/AiTransmissionNotice';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import CrisisManual from './CrisisManual';
import { PdfToolsView } from '../components/tools/local/PdfToolsView';
import { ProgramKitView } from '../components/tools/local/ProgramKitView';
import { QrCodeView } from '../components/tools/local/QrCodeView';
import { SignSheetView } from '../components/tools/local/SignSheetView';
import { CustomToolsView } from '../components/tools/local/CustomToolsView';
import {
    TOOL_FAVORITES_EVENT, matchesToolQuery, readToolFavorites, toggleToolFavorite, writeToolFavorites,
    type ToolFavorite,
} from '../features/tools/toolFavorites';

// ─── 업무도구 정의 ───
type ToolCategory = 'core' | 'analysis' | 'visual' | 'planning' | 'local';
/** AI를 쓰지 않고 이 PC 안에서만 처리하는 도구 */
type LocalToolId = 'pdf_tools' | 'program_kit' | 'qr_code' | 'sign_sheet';
/** 자체 화면을 가진 AI 도구(범용 입력 폼을 쓰지 않는다) */
type ViewToolId = 'custom_tools';

interface Tool {
    id: PromptType | 'crisis' | LocalToolId | ViewToolId;
    title: string;
    description: string;
    icon: LucideIcon;
    color: string;
    gradient: string;
    fields: {
        key: string;
        label: string;
        placeholder: string;
        type: 'input' | 'textarea' | 'select';
        options?: { label: string; value: string }[];
    }[];
    isBeta?: boolean;
    category: ToolCategory;
    apiNote: string;
    fallbackNote: string;
    /** 검색에 걸리게 할 낱말(제목·설명에 없는 말) */
    keywords?: string;
}

const TOOLS: Tool[] = [
    {
        id: 'crisis',
        title: '위기대응 시뮬레이터',
        description: '현장 위기 상황을 입력하거나 시나리오를 선택해 초기 대응 흐름과 기록 항목을 확인합니다.',
        icon: ShieldAlert,
        color: 'text-rose-400',
        gradient: 'from-rose-500 to-red-600',
        fields: [],
        category: 'planning',
        apiNote: '등록한 AI 키 하나 권장(없어도 기본 안내 표시)',
        fallbackNote: 'AI 실패 시 기본 위기대응 템플릿을 표시합니다.',
    },
    {
        id: 'official_doc',
        title: '공문서 작성',
        description: '거친 아이디어나 메모를 완벽한 형식의 기안문구/공문서 양식으로 자동 작성합니다.',
        icon: ClipboardList,
        color: 'text-sky-400',
        gradient: 'from-sky-500 to-blue-600',
        fields: [
            { key: 'recipient', label: '수신처 (선택)', placeholder: '예: 각 부서장, 유관기관 등', type: 'input' },
            { key: 'subject', label: '문서 제목 (선택)', placeholder: '원하시는 특정 제목이 있다면 적어주세요.', type: 'input' },
            { key: 'purpose', label: '목적 및 배경', placeholder: '왜 이 문서를 작성하시나요? (예: 프로그램 일정 변경에 따른 안내)', type: 'textarea' },
            { key: 'content', label: '주요 내용', placeholder: '일시, 장소, 이용자 등 안내해야 할 핵심 정보를 개조식이나 문장으로 적어주세요.', type: 'textarea' },
            { key: 'request', label: '협조 요청사항 (선택)', placeholder: '예: 기한 내 문서 회신, 이용자 전달 요청 등', type: 'input' },
        ],
        category: 'core',
        apiNote: '등록한 AI 키 하나(Gemini·ChatGPT·Claude)',
        fallbackNote: '실패해도 입력한 문서 내용은 유지됩니다.',
    },
    {
        id: 'press_release',
        title: '보도자료 작성',
        description: '행사나 소식을 언론에 배포하기 좋은 기사체 보도자료로 자동 작성합니다.',
        icon: Newspaper,
        color: 'text-emerald-400',
        gradient: 'from-emerald-500 to-teal-600',
        fields: [
            { key: 'topic', label: '보도자료 기반 내용', placeholder: '사실 관계, 행사 개요, 주요 성과 등 보도자료에 들어갈 핵심 내용을 최대한 상세히 입력하세요.', type: 'textarea' },
            { key: 'quote', label: '강조점 및 코멘트 (선택)', placeholder: '기사에 포함할 기관장 혹은 담당자의 코멘트, 강조하고 싶은 의미를 적어주세요.', type: 'input' }
        ],
        category: 'core',
        apiNote: '등록한 AI 키 하나(Gemini·ChatGPT·Claude)',
        fallbackNote: '실패해도 입력한 보도자료 초안은 유지됩니다.',
    },
    {
        id: 'image_gen',
        title: 'AI 포스터/홍보물 생성',
        description: '직업재활 현장에 필요한 포스터, 홍보물, 카드뉴스를 AI가 자동으로 디자인하여 만들어드립니다.',
        icon: LayoutTemplate,
        color: 'text-emerald-400',
        gradient: 'from-emerald-500 to-amber-500',
        fields: [],
        isBeta: true,
        category: 'visual',
        apiNote: 'Google Gemini 키 필요(Gemini 전용 · 이미지 생성 권한)',
        fallbackNote: '이미지 생성은 텍스트보다 사용량(비용)이 클 수 있습니다. 권한이나 사용량 문제 시 홍보 문구 작성 또는 HTML/PDF 제작으로 대체하세요.',
    },
    {
        id: 'utilities',
        title: '만능 텍스트 유틸리티',
        description: '글자수 세기, JSON 포맷화, 해시 생성 등 21가지 필수 온/오프라인 텍스트 유틸리티를 제공합니다.',
        icon: Wrench,
        color: 'text-indigo-400',
        gradient: 'from-indigo-500 to-blue-600',
        fields: [],
        isBeta: true,
        category: 'analysis',
        apiNote: 'API 키 없이도 대부분 사용 가능',
        fallbackNote: '오프라인 텍스트 도구 중심입니다.',
    },
    {
        id: 'dashboard',
        title: '데이터 대시보드 자동 생성',
        description: '데이터를 입력하면 그래프와 대시보드로 자유롭게 수정하고 시각화할 수 있는 인터랙티브 편집 툴을 제공합니다.',
        icon: BarChart3,
        color: 'text-green-400',
        gradient: 'from-green-500 to-emerald-600',
        fields: [],
        isBeta: true,
        category: 'visual',
        apiNote: 'API 키 없이도 기본 시각화 가능',
        fallbackNote: '입력 데이터는 화면에서 직접 수정할 수 있습니다.',
    },
    {
        id: 'summary',
        title: 'AI 문서 질의응답 (Q&A)',
        description: '여러 장의 긴 문서를 올려놓고, 문서 내용을 바탕으로 궁금한 내용을 대화형으로 질문하고 답변을 받아보세요.',
        icon: MessageSquare,
        color: 'text-violet-400',
        gradient: 'from-violet-500 to-purple-600',
        fields: [],
        isBeta: true,
        category: 'analysis',
        apiNote: '등록한 AI 키 하나(Gemini·ChatGPT·Claude)',
        fallbackNote: '실패해도 업로드/입력한 문서는 삭제되지 않습니다.',
    },
    {
        id: 'minutes',
        title: '회의 녹취록 전문 분석',
        description: '회의 녹취록이나 메모를 분석하여 팀별 공지사항, 주요 안건, 결정 사항이 포함된 공식 회의록으로 자동 변환합니다.',
        icon: ClipboardList,
        color: 'text-amber-400',
        gradient: 'from-amber-500 to-orange-600',
        fields: [],
        category: 'core',
        apiNote: '등록한 AI 키 하나(Gemini·ChatGPT·Claude)',
        fallbackNote: '실패해도 녹취록/메모 입력 내용은 유지됩니다.',
    },
    {
        id: 'masking',
        title: '개인정보 비식별화',
        description: '이름, 주민번호, 연락처 등 민감한 개인정보를 찾아 자동으로 가림 처리합니다.',
        icon: ShieldAlert,
        color: 'text-rose-400',
        gradient: 'from-rose-500 to-pink-600',
        fields: [],
        category: 'analysis',
        apiNote: 'API 키 없이 사용 가능(AI 추가 점검은 선택)',
        fallbackNote: '이 컴퓨터 안에서 먼저 가리고, 원문은 외부로 보내지 않습니다.',
    },
    {
        id: 'style_refiner',
        title: '문장 개선기',
        description: '원문의 의미와 문체를 유지하면서 문법, 맞춤법, 띄어쓰기와 문장 흐름을 다듬습니다.',
        icon: Wand2,
        color: 'text-blue-400',
        gradient: 'from-blue-500 to-indigo-600',
        fields: [
            { key: 'text', label: '개선할 문장', placeholder: '교정하고 싶은 문장이나 단락을 입력하세요.', type: 'textarea' },
        ],
        category: 'core',
        apiNote: '등록한 AI 키 하나(Gemini·ChatGPT·Claude)',
        fallbackNote: '실패해도 원문은 유지됩니다.',
    },
    {
        id: 'easy_read',
        title: '쉬운 글(Easy-to-Read) 변환기',
        description: '발달장애인, 어르신 누구나 이해하기 쉽도록 복잡한 글과 문서를 친절하고 쉬운 우리말로 바꿔줍니다.',
        icon: Smile,
        color: 'text-teal-400',
        gradient: 'from-teal-400 to-emerald-500',
        fields: [
            { key: 'text', label: '변환할 문장 및 문서 내용', placeholder: '쉬운 글로 바꾸고 싶은 어려운 안내문, 공문서, 복잡한 단락을 입력하세요.', type: 'textarea' },
        ],
        category: 'core',
        apiNote: '등록한 AI 키 하나(Gemini·ChatGPT·Claude)',
        fallbackNote: '실패해도 원문은 유지됩니다.',
    },
    {
        id: 'blog',
        title: '전문 블로그 작성',
        description: 'SEO 제목, 읽기 쉬운 본문, 핵심 요약과 검색 태그를 갖춘 전문 블로그 글을 작성합니다.',
        icon: Pen,
        color: 'text-orange-400',
        gradient: 'from-orange-500 to-red-600',
        fields: [
            { key: 'topic', label: '포스팅 주제', placeholder: '예: AI 발전이 발달장애인 고용에 미치는 영향', type: 'input' },
            { key: 'keywords', label: '핵심 키워드', placeholder: '예: 직업재활, Vibe Coding, 멘토링', type: 'input' },
            { key: 'message', label: '전달할 메시지', placeholder: '예: AI 시대에도 협력과 지원이 중요하다', type: 'textarea' },
            { key: 'blogLength', label: '문서 분량', placeholder: '', type: 'select', options: [{ label: '짧게 (800~1200자)', value: 'short' }, { label: '보통 (2000~3000자)', value: 'medium' }, { label: '길게 (4000자 이상)', value: 'long' }] },
            { key: 'blogPurpose', label: '사용 용처', placeholder: '', type: 'select', options: [{ label: '복지관 공식 블로그', value: 'official' }, { label: '개인 블로그', value: 'personal' }] },
        ],
        category: 'core',
        apiNote: '등록한 AI 키 하나(Gemini·ChatGPT·Claude)',
        fallbackNote: '실패해도 입력한 주제와 메시지는 유지됩니다.',
    },
    {
        id: 'namer',
        title: '창의적인 이름/제목 생성',
        description: '다양한 접근법과 심도있는 사고 과정을 통해 기억에 남는 참신한 이름이나 제목을 추천합니다.',
        icon: Lightbulb,
        color: 'text-yellow-400',
        gradient: 'from-yellow-400 to-amber-500',
        fields: [
            { key: 'target', label: '작명 대상', placeholder: '예: 신규 매장, 모바일 앱, 문학 작품 등', type: 'input' },
            { key: 'purpose', label: '목적 및 특징', placeholder: '예: 발달장애인이 만든 커피를 파는 따뜻한 느낌의 카페', type: 'textarea' },
            { key: 'keywords', label: '연관 키워드', placeholder: '휴식, 미소, 희망 등', type: 'input' },
        ],
        category: 'planning',
        apiNote: '등록한 AI 키 하나(Gemini·ChatGPT·Claude)',
        fallbackNote: '실패해도 입력한 작명 조건은 유지됩니다.',
    },
    {
        id: 'promo',
        title: '홍보물 문구 작성',
        description: '사업체 홍보, 훈련생 모집, 행사 안내 등을 위한 전단지나 포스터 문구를 매력적으로 작성합니다.',
        icon: Megaphone,
        color: 'text-pink-400',
        gradient: 'from-pink-500 to-rose-600',
        fields: [
            { key: 'info', label: '홍보/행사 정보', placeholder: '행사 일시, 장소, 이용자, 목적 등 홍보에 필요한 내용들을 입력하세요.', type: 'textarea' },
        ],
        isBeta: true,
        category: 'core',
        apiNote: '등록한 AI 키 하나(Gemini·ChatGPT·Claude)',
        fallbackNote: '이미지 생성이 어려울 때 문구 작성으로 대체할 수 있습니다.',
    },
    {
        id: 'ocr',
        title: '문서/이미지 OCR 변환',
        description: '이미지나 문서 파일에 포함된 문자를 변경이나 요약 없이 있는 그대로 추출합니다.',
        icon: ScanText,
        color: 'text-blue-400',
        gradient: 'from-blue-400 to-cyan-500',
        fields: [],
        isBeta: true,
        category: 'analysis',
        apiNote: '글자 PDF는 키 없이, 사진·스캔은 Vision 또는 Gemini 키 필요',
        fallbackNote: '문서 OCR은 텍스트 추출용입니다. 예산 OCR은 예산 화면의 지출 등록 보조 기능입니다.',
    },
    {
        id: 'schedule',
        title: 'AI 디자인 일정표·식단표',
        description: '일정이나 식단을 입력하면 이미지 생성(Gemini)으로 보기 좋은 일정표·식단표 이미지를 만들어 드립니다.',
        icon: CalendarDays,
        color: 'text-green-400',
        gradient: 'from-green-500 to-emerald-600',
        fields: [],
        isBeta: true,
        category: 'visual',
        apiNote: 'Google Gemini 키 필요(Gemini 전용 · 이미지 생성 권한)',
        fallbackNote: '이미지 생성은 텍스트보다 사용량(비용)이 클 수 있습니다. 권한이나 사용량 문제 시 텍스트 일정표로 먼저 정리하세요.',
    },
    {
        id: 'custom_tools',
        title: '나만의 AI 도구',
        description: '자주 쓰는 지시문을 이름 붙여 저장해 두고 내용만 바꿔 실행합니다. 예시로 시작할 수 있고, 만든 도구를 동료와 나눠 쓸 수 있습니다.',
        icon: Bot,
        color: 'text-indigo-400',
        gradient: 'from-indigo-500 to-violet-600',
        fields: [],
        category: 'core',
        apiNote: '등록한 AI 키 하나(Gemini·ChatGPT·Claude)',
        fallbackNote: '도구(지시문)는 이 PC에만 저장됩니다.',
        keywords: '맞춤 프롬프트 지시문 템플릿 저장 반복 공유 GPT 챗봇 문자 안내문',
    },
    {
        id: 'pdf_tools',
        title: 'PDF·이미지 도구',
        description: '여러 PDF를 하나로 합치고, 필요한 쪽만 뽑거나 돌리고, 사진·스캔 이미지를 한 PDF로 묶습니다. 파일을 어디에도 올리지 않습니다.',
        icon: FileStack,
        color: 'text-sky-400',
        gradient: 'from-sky-500 to-indigo-600',
        fields: [],
        category: 'local',
        apiNote: 'API 키 없이 사용(이 PC 안에서 처리)',
        fallbackNote: '원본 파일은 바뀌지 않고 결과는 새 파일로 저장합니다.',
        keywords: '합치기 병합 나누기 분할 추출 회전 변환 스캔 사진 증빙 붙임 파일 변환',
    },
    {
        id: 'program_kit',
        title: '프로그램 진행 도구',
        description: '집단 프로그램·교육 시간에 쓰는 큰 화면 타이머, 발표 순서 이름 뽑기, 인원이 고른 조 편성을 한곳에 모았습니다.',
        icon: Timer,
        color: 'text-violet-400',
        gradient: 'from-violet-500 to-fuchsia-600',
        fields: [],
        category: 'local',
        apiNote: 'API 키 없이 사용(이 PC 안에서 처리)',
        fallbackNote: '직업훈련 훈련실 명단을 불러올 수 있습니다. 명단과 결과는 저장하지 않습니다.',
        keywords: '타이머 시간 뽑기 추첨 룰렛 발표 순서 조 모둠 팀 편성 수업 훈련',
    },
    {
        id: 'qr_code',
        title: 'QR 코드 만들기',
        description: '설문·신청서·안내 링크를 QR 코드로 바꿔 홍보물과 안내문에 넣습니다. 설명 글을 붙여 PNG로 저장합니다.',
        icon: QrCode,
        color: 'text-slate-300',
        gradient: 'from-slate-500 to-slate-700',
        fields: [],
        category: 'local',
        apiNote: 'API 키 없이 사용(이 PC 안에서 처리)',
        fallbackNote: '입력한 링크를 어디에도 보내지 않습니다.',
        keywords: '큐알 링크 주소 설문 만족도 구글폼 홍보 안내문',
    },
    {
        id: 'sign_sheet',
        title: '서명 등록부',
        description: '교육·회의·프로그램 참석자 명단을 넣고 한 화면에서 차례로 서명을 받아 등록부 PDF로 저장합니다. 빈 등록부 인쇄도 됩니다.',
        icon: FileSignature,
        color: 'text-teal-400',
        gradient: 'from-teal-500 to-emerald-600',
        fields: [],
        category: 'local',
        apiNote: 'API 키 없이 사용(이 PC 안에서 처리)',
        fallbackNote: '서명은 저장하지 않고 만든 PDF에만 담깁니다.',
        keywords: '참석자 서명부 출석부 등록부 명단 사인 교육 회의 증빙',
    },
];

const TOOL_CATEGORIES: { id: ToolCategory; title: string; description: string }[] = [
    { id: 'core', title: '핵심 문서 작성', description: '공문, 회의록, 보도자료, 문장 정리처럼 가장 자주 쓰는 문서 도구입니다.' },
    { id: 'analysis', title: '문서 분석 및 보안', description: '자료 확인, OCR, 개인정보 보호, 텍스트 정리에 사용합니다.' },
    { id: 'visual', title: '홍보 및 시각화', description: '홍보물, 일정표, 데이터 시각화를 보여주는 작업을 모았습니다.' },
    { id: 'planning', title: '기획 및 위기대응', description: '위기대응, 이름/제목 생성처럼 기획과 판단 보조에 쓰는 도구입니다.' },
    { id: 'local', title: 'API 키 없이 쓰는 도구', description: 'AI를 쓰지 않고 이 PC 안에서만 처리합니다. 파일·명단·서명을 어디에도 보내지 않습니다.' },
];

const toolFavoriteKey = (tool: Tool) => `tool:${tool.id}`;
const externalFavoriteKey = (tool: ExternalTool) => `link:${tool.url}`;

interface ExternalTool {
    title: string;
    url: string;
    description: string;
    icon: LucideIcon;
    color: string;
    gradient: string;
    /** 같은 도구의 다른 설치·이용 경로(예: 안드로이드 앱) */
    extraLinks?: { label: string; url: string }[];
}

const EXTERNAL_TOOLS: ExternalTool[] = [
    {
        title: '꿈꾸는 이력서',
        url: 'https://remix-218446321702.us-west1.run.app/',
        description: '발달장애인 이력서 작성 지원. 복잡한 문서 작성을 이용자 친화적인 질문 흐름으로 바꾼 서비스입니다.',
        icon: FileText,
        color: 'text-blue-400',
        gradient: 'from-blue-500 to-indigo-600',
    },
    {
        title: '재택근무 훈련 시스템',
        url: 'https://keen-bombolone-45fda8.netlify.app/',
        description: '서울장애인종합복지관 재택근무 훈련 시스템. 교육·훈련 과정을 웹서비스로 구조화했습니다.',
        icon: Home,
        color: 'text-rose-400',
        gradient: 'from-rose-500 to-pink-600',
    },
    {
        title: 'JJSS 직업재활지원시스템',
        url: 'https://github.com/enkidua/JJSS/releases/tag/2.3',
        description: '상담과 취업지원처럼 반복되는 직업재활 업무를 하나의 업무시스템으로 묶은 프로그램입니다.',
        icon: Layers,
        color: 'text-sky-400',
        gradient: 'from-sky-500 to-blue-600',
    },
    {
        title: 'AR JobLens',
        url: 'https://tilnote.io/pages/6a170b9fe731abd590f6cb06',
        description: '웹캠 기반 직업평가 보조도구. 점수 산출보다 실제 과업 수행과 지원 필요를 관찰하는 데 씁니다.',
        icon: Camera,
        color: 'text-fuchsia-400',
        gradient: 'from-fuchsia-500 to-purple-600',
    },
    {
        title: '타닥(TADAK)',
        url: 'https://tadak.enkidua82.workers.dev',
        description: '발달장애인을 위한 게임형 타자연습. 키보드 위치부터 자음·모음, 단어, 문장까지 단계별로 익히고 자주 틀리는 키를 다시 연습합니다.',
        icon: Keyboard,
        color: 'text-lime-400',
        gradient: 'from-lime-500 to-green-600',
    },
    {
        title: '척척이',
        url: 'https://chromewebstore.google.com/detail/lafcomblpgecmflfjdldfgaabdanphmf',
        description: '발달장애인 근로자를 위한 무장애 업무 보조 Chrome 확장프로그램. 어려운 메일·공지·문서를 쉽게 설명하고 스스로 결정하도록 돕습니다.',
        icon: MousePointer2,
        color: 'text-purple-400',
        gradient: 'from-purple-500 to-violet-600',
    },
    {
        title: '나의 일자리 찾기',
        url: 'https://workplacetours.netlify.app/',
        description: '발달장애인 진로선택 지원 프로그램. 직업과 근무환경을 직접 살펴보고 비교하며 진로를 고릅니다.',
        icon: Compass,
        color: 'text-amber-400',
        gradient: 'from-amber-500 to-orange-600',
    },
    {
        title: 'CanDo',
        url: 'https://dulcet-cucurucho-729ff5.netlify.app/',
        description: '발달장애인 사무직 업무지원 프로그램. 사무환경에서 필요한 업무를 이해하고 연습하도록 세분화했습니다.',
        icon: Briefcase,
        color: 'text-emerald-400',
        gradient: 'from-emerald-500 to-teal-600',
        extraLinks: [{ label: '안드로이드 앱(원스토어)', url: 'https://m.onestore.co.kr/v2/ko-kr/app/0001004709?scYn=Y' }],
    },
    {
        title: 'Vibe Coding Design Lab',
        url: 'https://vibe-coding-design-lab.enkidua.chatgpt.site/',
        description: 'AI 웹앱 디자인 실험실. 여러 UI 디자인 콘셉트를 실제 화면으로 비교하고 관련 프롬프트를 활용합니다.',
        icon: Palette,
        color: 'text-pink-400',
        gradient: 'from-pink-500 to-rose-600',
    },
    {
        title: 'VibeGuard Skills',
        url: 'https://vibeguard-skills.vercel.app/',
        description: '안전한 바이브코딩을 위한 개발 기준 생성도구. 데이터·권한·보안·테스트 기준을 담은 Skills.md 기본 틀을 만듭니다.',
        icon: ClipboardCheck,
        color: 'text-yellow-400',
        gradient: 'from-yellow-500 to-amber-600',
    },
    {
        title: 'Job Quest',
        url: 'https://job-quest.pages.dev/',
        description: '발달장애인 직무체험·직무탐색 게임. 11가지 직업, 100여 개 직무를 체험하며 진로를 정합니다.',
        icon: Gamepad2,
        color: 'text-red-400',
        gradient: 'from-red-500 to-orange-600',
    },
    {
        title: '직업재활 시각화 사이트',
        url: 'https://welfare-insight-90344221755.us-west1.run.app/',
        description: '직업재활 데이터를 시각화하여 한눈에 파악할 수 있는 대시보드',
        icon: PieChart,
        color: 'text-indigo-400',
        gradient: 'from-indigo-500 to-blue-600',
    },
    {
        title: '개인정보 비식별화 앱',
        url: 'https://korfhe-shield-ai-798817858564.us-west1.run.app/',
        description: 'AI가 문서 내 개인정보를 자동으로 찾아 비식별 처리합니다.',
        icon: ShieldCheck,
        color: 'text-gray-400',
        gradient: 'from-gray-500 to-slate-600',
    },
    {
        title: 'PCP 대쉬보드',
        url: 'https://pct-dashboard-generator-1093928830670.us-west1.run.app/',
        description: '개인중심계획(PCP) 수립 및 관리를 위한 인터랙티브 대시보드',
        icon: Layout,
        color: 'text-cyan-400',
        gradient: 'from-cyan-500 to-blue-600',
    },
    {
        title: 'PDF → 파워포인트 변환·수정',
        url: 'https://iris-canvas-pdf-to-pptx-459909947241.us-west1.run.app/',
        description: 'PDF 문서를 편집 가능한 파워포인트(PPTX) 파일로 변환하고 수정합니다.',
        icon: Presentation,
        color: 'text-orange-400',
        gradient: 'from-orange-500 to-red-600',
    },
];

const LEAVE_TOOL_MESSAGE = '도구 목록으로 돌아가면 현재 입력과 결과가 사라집니다. 돌아갈까요?';

function getDefaultForm(tool: Tool | null): Record<string, string> {
    const defaults: Record<string, string> = {};
    tool?.fields.forEach(field => {
        if (field.type === 'select' && field.options?.length) defaults[field.key] = field.options[0].value;
    });
    return defaults;
}

export default function AITools() {
    const [activeTab, setActiveTab] = useState<'internal' | 'external'>('internal');
    const [activeTool, setActiveTool] = useState<Tool | null>(null);
    const [toolForm, setToolForm] = useState<Record<string, string>>({});
    const [toolResult, setToolResult] = useState('');
    const [toolLoading, setToolLoading] = useState(false);
    const [toolError, setToolError] = useState('');
    // 하위 도구 화면이 알려 주는 "저장하지 않은 입력/결과" 여부(계약 C5).
    const [childDirty, setChildDirty] = useState(false);
    const handleChildDirtyChange = useCallback((dirty: boolean) => setChildDirty(dirty), []);
    // 도구 찾기와 자주 쓰는 도구(별표)
    const [query, setQuery] = useState('');
    const [favorites, setFavorites] = useState<ToolFavorite[]>(() => readToolFavorites());
    const [searchParams, setSearchParams] = useSearchParams();
    // 범용 AI 도구는 결과 칸을 함께 쓴다. 도구를 바꾼 뒤 도착한 이전 도구의 응답이 새 도구 화면에 나오지 않게 요청 번호로 구분한다.
    const runSequenceRef = useRef(0);
    // 버린 요청은 취소한다(취소하지 않으면 끝날 때까지 같은 도구를 다시 실행할 수 없다).
    const toolAbortRef = useRef<AbortController | null>(null);
    useEffect(() => () => { toolAbortRef.current?.abort(); }, []);

    useEffect(() => {
        const sync = () => setFavorites(readToolFavorites());
        window.addEventListener(TOOL_FAVORITES_EVENT, sync);
        return () => window.removeEventListener(TOOL_FAVORITES_EVENT, sync);
    }, []);

    const toggleFavorite = (favorite: ToolFavorite) => {
        const next = toggleToolFavorite(favorites, favorite);
        setFavorites(next);
        writeToolFavorites(next);
    };
    const isFavorite = (key: string) => favorites.some(item => item.key === key);

    // 홈 화면의 "자주 쓰는 도구"에서 넘어오면(/tools?tool=…) 그 도구를 바로 연다.
    useEffect(() => {
        const requested = searchParams.get('tool');
        if (!requested) return;
        const tool = TOOLS.find(item => item.id === requested);
        if (tool) {
            setChildDirty(false);
            setActiveTool(tool);
        }
        const next = new URLSearchParams(searchParams);
        next.delete('tool');
        setSearchParams(next, { replace: true });
        // 주소의 tool 값이 바뀔 때만 본다.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams.get('tool')]);

    // 도구가 바뀔 때만 입력칸을 기본값으로 되돌립니다(선택 목록 기본값 포함).
    useEffect(() => {
        // 도구가 바뀌면 진행 중이던 이전 도구의 응답은 버린다(새 도구 화면에 남의 결과가 나오지 않게).
        runSequenceRef.current += 1;
        toolAbortRef.current?.abort();
        toolAbortRef.current = null;
        setToolForm(getDefaultForm(activeTool));
        setToolResult('');
        setToolError('');
        setToolLoading(false);
    }, [activeTool?.id]);

    // 도구를 열거나 목록으로 돌아오면 맨 위부터 보여 줍니다(아래쪽 카드를 눌렀을 때 빈 화면처럼 보이는 문제 방지).
    useEffect(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, [activeTool?.id]);

    const hasOwnInput = Boolean(activeTool) && activeTool!.fields.some(field => {
        const defaultValue = field.type === 'select' ? field.options?.[0]?.value || '' : '';
        return (toolForm[field.key] ?? defaultValue).trim() !== defaultValue;
    });
    const ownDirty = hasOwnInput || Boolean(toolResult) || toolLoading;
    const isDirty = Boolean(activeTool) && (childDirty || ownDirty);
    const { confirmDiscard } = useUnsavedGuard(isDirty);

    const backToToolList = async () => {
        if (!(await confirmDiscard(LEAVE_TOOL_MESSAGE))) return;
        setChildDirty(false);
        setActiveTool(null);
    };

    const runTool = async () => {
        if (toolLoading) return;
        if (!activeTool || activeTool.id === 'crisis' || activeTool.id === 'custom_tools' || activeTool.category === 'local') return;
        const sequence = ++runSequenceRef.current;
        const isCurrent = () => runSequenceRef.current === sequence;
        const controller = new AbortController();
        toolAbortRef.current = controller;
        setToolError('');
        try {
            const hasTextInput = activeTool.fields
                .filter(f => f.type !== 'select')
                .some(f => (toolForm[f.key] || '').trim().length > 0);
            if (!hasTextInput) {
                throw new Error('실행할 내용을 먼저 입력해 주세요.');
            }

            const promptStr = activeTool.fields
                .filter(f => !['blogLength', 'blogPurpose'].includes(f.key))
                .map(f => {
                    const val = toolForm[f.key] !== undefined ? toolForm[f.key] : (f.options?.[0]?.value || '');
                    return `[${f.label}]\n${val || '(미입력)'}`;
                })
                .join('\n\n');

            const blogLength = (toolForm['blogLength'] as BlogLength) || 'medium';
            const blogPurpose = (toolForm['blogPurpose'] as BlogPurpose) || 'official';

            setToolLoading(true);
            // 새 결과가 나오면 교체하고, 실패하면 이전 결과를 그대로 둡니다.
            const result = await generateText(activeTool.id as PromptType, promptStr, undefined, { blogLength, blogPurpose, featureKey: 'ai-tools', documentType: activeTool.id, signal: controller.signal });
            if (isCurrent()) setToolResult(result);
        } catch (err: unknown) {
            if (isCurrent()) setToolError(err instanceof Error && err.message ? err.message : '도구 실행 중 오류가 발생했습니다.');
        } finally {
            if (toolAbortRef.current === controller) toolAbortRef.current = null;
            if (isCurrent()) setToolLoading(false);
        }
    };

    const renderActiveTool = (tool: Tool) => {
        const onBack = () => { void backToToolList(); };
        const onDirtyChange = handleChildDirtyChange;
        switch (tool.id) {
            case 'image_gen': return <PromoDesignView key="promo-design" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'minutes': return <MinutesView key="minutes" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'utilities': return <UtilitiesView key="utilities" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'dashboard': return <DashboardView key="dashboard" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'masking': return <MaskingView key="masking" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'summary': return <DocumentChatView key="document-chat" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'ocr': return <OCRView key="ocr" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'schedule': return <ScheduleDesignView key="schedule-design" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'crisis': return <CrisisManual key="crisis-manual" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'custom_tools': return <CustomToolsView key="custom-tools" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'pdf_tools': return <PdfToolsView key="pdf-tools" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'program_kit': return <ProgramKitView key="program-kit" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'qr_code': return <QrCodeView key="qr-code" onBack={onBack} onDirtyChange={onDirtyChange} />;
            case 'sign_sheet': return <SignSheetView key="sign-sheet" onBack={onBack} onDirtyChange={onDirtyChange} />;
            default: {
                const Icon = tool.icon;
                return (
                    <ToolPageShell key="tool" onBack={onBack} className="max-w-3xl mx-auto">
                        <div className="glass-strong rounded-2xl p-6 border border-white/10">
                            <div className="flex items-center gap-3 mb-6">
                                <h2 className="text-2xl font-black text-white flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl bg-linear-to-br ${tool.gradient} flex items-center justify-center shadow-lg`}>
                                        <Icon className="w-5 h-5 text-white" />
                                    </div>
                                    {tool.title}
                                </h2>
                            </div>

                            <div className="space-y-4">
                                {tool.fields.map(field => (
                                    <div key={field.key}>
                                        <label htmlFor={`tool-field-${field.key}`} className="block text-sm font-medium text-white/70 mb-1.5">{field.label}</label>
                                        {field.type === 'select' ? (
                                            <select
                                                id={`tool-field-${field.key}`}
                                                value={toolForm[field.key] || field.options?.[0]?.value}
                                                onChange={e => setToolForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                className="input-field"
                                            >
                                                {field.options?.map(opt => <option key={opt.value} value={opt.value} className="bg-slate-900">{opt.label}</option>)}
                                            </select>
                                        ) : field.type === 'textarea' ? (
                                            <textarea
                                                id={`tool-field-${field.key}`}
                                                placeholder={field.placeholder}
                                                value={toolForm[field.key] || ''}
                                                onChange={e => setToolForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                className="input-field min-h-[100px]"
                                                rows={4}
                                            />
                                        ) : (
                                            <input
                                                id={`tool-field-${field.key}`}
                                                type="text"
                                                placeholder={field.placeholder}
                                                value={toolForm[field.key] || ''}
                                                onChange={e => setToolForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                                                className="input-field"
                                            />
                                        )}
                                    </div>
                                ))}

                                <AiTransmissionNotice />

                                <button type="button" onClick={() => void runTool()} disabled={toolLoading} className="btn-primary w-full flex items-center justify-center gap-2 py-3.5! mt-6">
                                    {toolLoading
                                        ? <><Loader2 className="w-5 h-5 animate-spin" /> 생성 중...</>
                                        : <><Sparkles className="w-5 h-5" /> {toolResult ? '다시 생성하기' : '생성하기'}</>}
                                </button>
                            </div>

                            {toolError && <div role="alert" className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{toolError}{toolResult ? ' 이전 결과는 그대로 남아 있습니다.' : ''}</div>}

                            {toolResult && (
                                <div className="mt-6 border-t border-white/10 pt-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-white font-bold flex items-center gap-2">AI 생성 결과</h4>
                                        <CopyButton text={toolResult} />
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-4 max-h-96 overflow-y-auto">
                                        <pre className="text-white/80 text-sm whitespace-pre-wrap leading-relaxed font-sans">{toolResult}</pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ToolPageShell>
                );
            }
        }
    };

    const trimmedQuery = query.trim();
    const matchedTools = useMemo(() => TOOLS.filter(tool => matchesToolQuery(trimmedQuery, tool.title, tool.description, tool.keywords, tool.apiNote)), [trimmedQuery]);
    const matchedExternal = useMemo(() => EXTERNAL_TOOLS.filter(tool => matchesToolQuery(trimmedQuery, tool.title, tool.description)), [trimmedQuery]);
    const favoriteTools = favorites
        .map(item => (item.key.startsWith('tool:')
            ? { favorite: item, tool: TOOLS.find(tool => toolFavoriteKey(tool) === item.key), external: undefined }
            : { favorite: item, tool: undefined, external: EXTERNAL_TOOLS.find(tool => externalFavoriteKey(tool) === item.key) }))
        .filter(item => item.tool || item.external);

    const openTool = (tool: Tool) => {
        setChildDirty(false);
        setActiveTool(tool);
    };

    const starButton = (favorite: ToolFavorite) => {
        const active = isFavorite(favorite.key);
        return (
            <button
                type="button"
                aria-pressed={active}
                aria-label={`${favorite.title} ${active ? '자주 쓰는 도구에서 빼기' : '자주 쓰는 도구에 넣기'}`}
                title={active ? '자주 쓰는 도구에서 빼기' : '자주 쓰는 도구에 넣기'}
                onClick={() => toggleFavorite(favorite)}
                className={`absolute right-3 top-3 z-10 rounded-full p-2 transition ${active ? 'text-amber-300 hover:text-amber-200' : 'text-white/25 hover:text-white/70'}`}
            >
                <Star className="h-5 w-5" fill={active ? 'currentColor' : 'none'} />
            </button>
        );
    };

    const renderToolCard = (tool: Tool, i: number) => {
        const Icon = tool.icon;
        return (
            <div key={tool.id} className="relative">
                <motion.button
                    type="button"
                    data-tool-id={tool.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i, 12) * 0.035 }}
                    onClick={() => openTool(tool)}
                    className="w-full h-full text-left glass-strong rounded-2xl p-6 border border-white/10 hover:border-white/20 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg group min-h-[260px] flex flex-col"
                >
                    <div className={`w-12 h-12 rounded-xl bg-linear-to-br ${tool.gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                        <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-white font-bold text-lg mb-2 pr-8 flex items-center gap-2 flex-wrap">
                        {tool.title}
                        {tool.isBeta && (
                            <span className="text-[10px] uppercase font-black px-2 py-[2px] rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 tracking-wider">Beta</span>
                        )}
                    </h3>
                    <p className="text-white/45 text-sm leading-relaxed flex-1">{tool.description}</p>
                    <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
                        <p className="text-[11px] text-white/45"><span className="font-black text-white/65">필요 API:</span> {tool.apiNote}</p>
                    </div>
                </motion.button>
                {starButton({ key: toolFavoriteKey(tool), title: tool.title })}
            </div>
        );
    };

    const renderExternalCard = (tool: ExternalTool, i: number) => {
        const Icon = tool.icon;
        return (
            <motion.div
                key={tool.url}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.05 }}
                className="relative glass-strong rounded-2xl border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg group flex flex-col"
            >
                <a
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-6 flex-1 rounded-2xl focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-primary-400"
                >
                    <div className="flex justify-between items-start mb-4">
                        <div className={`w-12 h-12 rounded-xl bg-linear-to-br ${tool.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                            <Icon className="w-6 h-6 text-white" />
                        </div>
                        <ExternalLink className="mr-9 mt-1 w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
                    </div>
                    <h3 className="text-white font-bold text-lg mb-2">{tool.title}</h3>
                    <p className="text-white/40 text-sm leading-relaxed">{tool.description}</p>
                </a>
                {tool.extraLinks?.length ? (
                    <div className="px-6 pb-5 -mt-2 flex flex-wrap gap-2">
                        {tool.extraLinks.map(link => (
                            <a
                                key={link.url}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-1 text-xs font-bold text-white/60 hover:text-white hover:border-white/30 transition-colors"
                            >
                                <Smartphone className="w-3.5 h-3.5" />
                                {link.label}
                            </a>
                        ))}
                    </div>
                ) : null}
                {starButton({ key: externalFavoriteKey(tool), title: tool.title, url: tool.url })}
            </motion.div>
        );
    };

    return (
        <div className="min-h-screen py-8 px-4">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-10"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent-500/10 border border-accent-500/20 mb-4">
                        <Wand2 className="w-4 h-4 text-accent-400" />
                        <span className="text-sm text-accent-300 font-medium">AI 범용 업무 도구</span>
                    </div>
                    <h1 className="section-title mb-3 text-white">업무 지원 도구</h1>
                    <p className="text-white/50 text-lg mb-8">문서 작성·분석 AI 도구와, API 키 없이 쓰는 PDF·QR·서명 등록부·진행 도구</p>

                    {!activeTool && (
                        <div className="mx-auto mb-6 w-full max-w-xl">
                            <label htmlFor="tool-search" className="sr-only">도구 찾기</label>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" aria-hidden="true" />
                                <input
                                    id="tool-search"
                                    type="search"
                                    className="input-field pl-11! pr-10!"
                                    placeholder="어떤 도구가 필요하세요? 예: PDF 합치기, 회의록, QR, 서명"
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    autoComplete="off"
                                />
                                {query && (
                                    <button type="button" aria-label="검색어 지우기" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/40 hover:text-white">
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Tabs */}
                    {!activeTool && !trimmedQuery && (
                        <div className="flex justify-center mb-10 w-full sm:w-auto">
                            <div className="flex bg-[#1e293b]/70 p-[6px] rounded-[100px] shadow-inner backdrop-blur-md border border-white/5 mx-auto max-w-full overflow-x-auto custom-scrollbar" role="tablist" aria-label="도구 종류">
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === 'internal'}
                                    onClick={() => setActiveTab('internal')}
                                    className={`flex items-center justify-center gap-2 px-6 lg:px-8 py-3 rounded-[100px] font-bold transition-all whitespace-nowrap min-w-max ${activeTab === 'internal'
                                            ? 'bg-blue-500 text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)]'
                                            : 'text-white/60 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <Wrench className="w-4 h-4" />
                                    업무 지원 도구
                                </button>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === 'external'}
                                    onClick={() => setActiveTab('external')}
                                    className={`flex items-center justify-center gap-2 px-6 lg:px-8 py-3 rounded-[100px] font-bold transition-all whitespace-nowrap min-w-max ${activeTab === 'external'
                                            ? 'bg-blue-500 text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)]'
                                            : 'text-white/60 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    외부 업무 도구
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>

                <AnimatePresence mode="wait">
                    {!activeTool ? (
                        <motion.div
                            key="grid"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            {trimmedQuery ? (
                                <div className="space-y-10" data-testid="tool-search-results">
                                    <p className="text-sm text-white/50" role="status">
                                        "{trimmedQuery}" 검색 결과 {matchedTools.length + matchedExternal.length}개
                                    </p>
                                    {matchedTools.length > 0 && (
                                        <section aria-label="업무 지원 도구 검색 결과">
                                            <h2 className="mb-5 text-2xl font-black text-white">업무 지원 도구</h2>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{matchedTools.map(renderToolCard)}</div>
                                        </section>
                                    )}
                                    {matchedExternal.length > 0 && (
                                        <section aria-label="외부 업무 도구 검색 결과">
                                            <h2 className="mb-5 text-2xl font-black text-white">외부 업무 도구</h2>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{matchedExternal.map(renderExternalCard)}</div>
                                        </section>
                                    )}
                                    {matchedTools.length + matchedExternal.length === 0 && (
                                        <p className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-sm text-white/50">
                                            맞는 도구가 없습니다. 낱말을 줄이거나 다른 말로 찾아보세요(예: "합치기", "요약", "서명").
                                        </p>
                                    )}
                                </div>
                            ) : activeTab === 'internal' ? (
                                <div className="space-y-12">
                                    {favoriteTools.length > 0 && (
                                        <section aria-label="자주 쓰는 도구" data-testid="tool-favorites">
                                            <div className="mb-4 flex items-end justify-between gap-4">
                                                <div>
                                                    <h2 className="text-2xl font-black text-white flex items-center gap-2"><Star className="h-5 w-5 text-amber-300" fill="currentColor" /> 자주 쓰는 도구</h2>
                                                    <p className="text-white/40 text-sm mt-1">카드의 별표를 눌러 넣고 뺍니다. 홈 화면에도 같이 보입니다.</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {favoriteTools.map(({ favorite, tool, external }) => {
                                                    const Icon = (tool ?? external)!.icon;
                                                    const gradient = (tool ?? external)!.gradient;
                                                    const chip = (
                                                        <>
                                                            <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br ${gradient}`}><Icon className="h-4 w-4 text-white" /></span>
                                                            {favorite.title}
                                                            {external && <ExternalLink className="h-3.5 w-3.5 text-white/40" />}
                                                        </>
                                                    );
                                                    const chipClass = 'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/85 hover:border-white/30 hover:text-white transition';
                                                    return tool
                                                        ? <button key={favorite.key} type="button" onClick={() => openTool(tool)} className={chipClass}>{chip}</button>
                                                        : <a key={favorite.key} href={external!.url} target="_blank" rel="noopener noreferrer" className={chipClass}>{chip}</a>;
                                                })}
                                            </div>
                                        </section>
                                    )}
                                    {TOOL_CATEGORIES.map(category => {
                                        const tools = TOOLS.filter(tool => tool.category === category.id);
                                        if (tools.length === 0) return null;
                                        return (
                                            <section key={category.id}>
                                                <div className="flex items-end justify-between gap-4 mb-5">
                                                    <div>
                                                        <h2 className="text-2xl font-black text-white">{category.title}</h2>
                                                        <p className="text-white/40 text-sm mt-1">{category.description}</p>
                                                    </div>
                                                    <span className="text-xs text-white/35">{tools.length}개 도구</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{tools.map(renderToolCard)}</div>
                                            </section>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">{EXTERNAL_TOOLS.map(renderExternalCard)}</div>
                            )}
                        </motion.div>
                    ) : (
                        renderActiveTool(activeTool)
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
