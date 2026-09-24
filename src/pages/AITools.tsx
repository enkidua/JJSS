import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Wand2, ClipboardList,
    Pen, Lightbulb, Loader2, Sparkles, Newspaper,
    Megaphone, ScanText, CalendarDays, FileText, Smile, LayoutTemplate,
    Wrench, BarChart3, ExternalLink, MousePointer2, Briefcase, Home, Compass, PieChart, ShieldCheck, Layout, FileSearch, Presentation,
    ShieldAlert, MessageSquare, type LucideIcon
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

// ─── 업무도구 정의 ───
type ToolCategory = 'core' | 'analysis' | 'visual' | 'planning';

interface Tool {
    id: PromptType | 'crisis';
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
        apiNote: 'Gemini API 키 권장',
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
        apiNote: 'Gemini API 키 필요',
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
        apiNote: 'Gemini API 키 필요',
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
        apiNote: 'Gemini 이미지 생성 권한 필요',
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
        apiNote: 'Gemini API 키 필요',
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
        apiNote: 'Gemini API 키 필요',
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
        apiNote: 'Gemini API 키 필요',
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
        apiNote: 'Gemini API 키 필요',
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
        apiNote: 'Gemini API 키 필요',
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
        apiNote: 'Gemini API 키 필요',
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
        apiNote: 'Gemini API 키 필요',
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
        apiNote: 'Vision API 키 또는 Gemini API 키 필요',
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
        apiNote: 'Gemini 이미지 생성 권한 필요',
        fallbackNote: '이미지 생성은 텍스트보다 사용량(비용)이 클 수 있습니다. 권한이나 사용량 문제 시 텍스트 일정표로 먼저 정리하세요.',
    }
];

const TOOL_CATEGORIES: { id: ToolCategory; title: string; description: string }[] = [
    { id: 'core', title: '핵심 문서 작성', description: '공문, 회의록, 보도자료, 문장 정리처럼 가장 자주 쓰는 문서 도구입니다.' },
    { id: 'analysis', title: '문서 분석 및 보안', description: '자료 확인, OCR, 개인정보 보호, 텍스트 정리에 사용합니다.' },
    { id: 'visual', title: '홍보 및 시각화', description: '홍보물, 일정표, 데이터 시각화를 보여주는 작업을 모았습니다.' },
    { id: 'planning', title: '기획 및 위기대응', description: '위기대응, 이름/제목 생성처럼 기획과 판단 보조에 쓰는 도구입니다.' },
];

const EXTERNAL_TOOLS = [
    {
        title: '이력서 작성 프로그램',
        url: 'https://service-459909947241.us-west1.run.app/',
        description: 'AI 기반 맞춤형 이력서 및 자기소개서 작성 도구',
        icon: FileText,
        color: 'text-blue-400',
        gradient: 'from-blue-500 to-indigo-600'
    },
    {
        title: '척척이 - 무장애 업무 보조 어시스턴트',
        url: 'https://chromewebstore.google.com/detail/lafcomblpgecmflfjdldfgaabdanphmf?utm_source=item-share-cb',
        description: '크롬 브라우저에서 사용 가능한 무장애 업무 보조 확장 프로그램',
        icon: MousePointer2,
        color: 'text-purple-400',
        gradient: 'from-purple-500 to-violet-600'
    },
    {
        title: '발달장애인 사무직 지원 앱',
        url: 'https://dulcet-cucurucho-729ff5.netlify.app/',
        description: '사무직 직무 수행을 돕는 맞춤형 보조 애플리케이션',
        icon: Briefcase,
        color: 'text-emerald-400',
        gradient: 'from-emerald-500 to-teal-600'
    },
    {
        title: '재택근무 훈련지원 시스템',
        url: 'https://keen-bombolone-45fda8.netlify.app/',
        description: '재택근무 환경 적응 및 직무 훈련을 지원하는 시스템',
        icon: Home,
        color: 'text-rose-400',
        gradient: 'from-rose-500 to-pink-600'
    },
    {
        title: '발달장애인 진로선택 지원 프로그램',
        url: 'https://workplacetours.netlify.app/',
        description: '다양한 직업 세계 탐색 및 진로 선택을 돕는 프로그램',
        icon: Compass,
        color: 'text-amber-400',
        gradient: 'from-amber-500 to-orange-600'
    },
    {
        title: '직업재활 시각화 사이트',
        url: 'https://welfare-insight-90344221755.us-west1.run.app/',
        isNew: true,
        description: '직업재활 데이터를 시각화하여 한눈에 파악할 수 있는 대시보드',
        icon: PieChart,
        color: 'text-indigo-400',
        gradient: 'from-indigo-500 to-blue-600'
    },
    {
        title: '개인정보 비식별화 앱',
        url: 'https://korfhe-shield-ai-798817858564.us-west1.run.app/',
        description: 'AI가 문서 내 개인정보를 자동으로 찾아 비식별 처리합니다.',
        icon: ShieldCheck,
        color: 'text-gray-400',
        gradient: 'from-gray-500 to-slate-600'
    },
    {
        title: 'PCP 대쉬보드',
        url: 'https://pct-dashboard-generator-1093928830670.us-west1.run.app/',
        description: '개인중심계획(PCP) 수립 및 관리를 위한 인터랙티브 대시보드',
        icon: Layout,
        color: 'text-cyan-400',
        gradient: 'from-cyan-500 to-blue-600'
    },
    {
        title: '공문서 인공지능 가독성 변환',
        url: 'https://lucid-doc-459909947241.us-west1.run.app/',
        description: '복잡한 공문서를 누구나 이해하기 쉬운 문장으로 변환합니다.',
        icon: FileSearch,
        color: 'text-teal-400',
        gradient: 'from-teal-400 to-emerald-500'
    },
    {
        title: 'PDF → 파워포인트 변환·수정',
        url: 'https://iris-canvas-pdf-to-pptx-459909947241.us-west1.run.app/',
        description: 'PDF 문서를 편집 가능한 파워포인트(PPTX) 파일로 변환하고 수정합니다.',
        icon: Presentation,
        color: 'text-orange-400',
        gradient: 'from-orange-500 to-red-600'
    }
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

    // 도구가 바뀔 때만 입력칸을 기본값으로 되돌립니다(선택 목록 기본값 포함).
    useEffect(() => {
        setToolForm(getDefaultForm(activeTool));
        setToolResult('');
        setToolError('');
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
        if (!activeTool || activeTool.id === 'crisis') return;
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
            const result = await generateText(activeTool.id, promptStr, undefined, { blogLength, blogPurpose });
            setToolResult(result);
        } catch (err: unknown) {
            setToolError(err instanceof Error && err.message ? err.message : '도구 실행 중 오류가 발생했습니다.');
        } finally {
            setToolLoading(false);
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
            default: {
                const Icon = tool.icon;
                return (
                    <ToolPageShell key="tool" onBack={onBack} className="max-w-3xl mx-auto">
                        <div className="glass-strong rounded-2xl p-6 border border-white/10">
                            <div className="flex items-center gap-3 mb-6">
                                <h2 className="text-2xl font-black text-white flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center shadow-lg`}>
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

                                <button type="button" onClick={() => void runTool()} disabled={toolLoading} className="btn-primary w-full flex items-center justify-center gap-2 !py-3.5 mt-6">
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
                    <p className="text-white/50 text-lg mb-8">회의록 자동 작성, 문장 개선, 블로그 생성 등 다양한 AI 도구</p>

                    {/* Tabs */}
                    {!activeTool && (
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
                            {activeTab === 'internal' ? (
                                <div className="space-y-12">
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
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                                    {tools.map((tool, i) => {
                                                        const Icon = tool.icon;
                                                        return (
                                                            <motion.button
                                                                type="button"
                                                                key={tool.id}
                                                                initial={{ opacity: 0, y: 20 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                transition={{ delay: i * 0.035 }}
                                                                onClick={() => {
                                                                    setChildDirty(false);
                                                                    setActiveTool(tool);
                                                                }}
                                                                className="text-left glass-strong rounded-2xl p-6 border border-white/10 hover:border-white/20 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg group min-h-[260px] flex flex-col"
                                                            >
                                                                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                                                                    <Icon className="w-6 h-6 text-white" />
                                                                </div>
                                                                <h3 className="text-white font-bold text-lg mb-2 flex items-center gap-2 flex-wrap">
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
                                                        );
                                                    })}
                                                </div>
                                            </section>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                    {EXTERNAL_TOOLS.map((tool, i) => {
                                        const Icon = tool.icon;
                                        return (
                                            <motion.a
                                                key={tool.url}
                                                href={tool.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: i * 0.05 }}
                                                className="glass-strong rounded-2xl p-6 border border-white/10 hover:border-white/20 cursor-pointer transition-all duration-300 hover:scale-[1.02] hover:shadow-lg group block"
                                            >
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${tool.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                                                        <Icon className="w-6 h-6 text-white" />
                                                    </div>
                                                    <ExternalLink className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors" />
                                                </div>
                                                <h3 className="text-white font-bold text-lg mb-2">{tool.title}</h3>
                                                <p className="text-white/40 text-sm leading-relaxed">{tool.description}</p>
                                            </motion.a>
                                        );
                                    })}
                                </div>
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
