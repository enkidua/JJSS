import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Sparkles, Wand2, Zap, ArrowRight, Download, Eye, LayoutTemplate, Loader2, X, CalendarDays, Utensils } from 'lucide-react';
import { generateImage } from '../services/gemini';
import { saveJjssDataUrl, savedLocationMessage } from '../utils/jjssFileService';

interface ScheduleDesignViewProps {
    onBack: () => void;
}

const CATEGORIES = [
    { id: 'all', label: '전체', count: 4 },
    { id: 'weekly', label: '주간 일정', count: 2 },
    { id: 'meal', label: '식단표', count: 2 },
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
        id: 's1', 
        title: '감성 파스텔 데일리', 
        desc: '부드러운 파스텔 톤과 감성적인 폰트로 꾸며진 친근한 분위기의 일정표입니다.', 
        category: 'weekly', 
        badge: 'Weekly', 
        tags: ['#파스텔', '#감성', '#나노바나나2'],
        gradient: 'from-blue-100 to-purple-100',
        fullPrompt: `## 비주얼 스타일: Aesthetic / Pastel / Weekly Planner
- 나노바나나2 스타일의 아름답고 감성적인 일러스트가 포함된 일정표 디자인.
- 배경은 연한 파스텔 블루와 라벤더 색상의 그라데이션.
- 중앙에 요일별로 구분된 깔끔한 칸(Grid)이 있으며, 각 칸에는 정갈한 폰트로 일정이 적혀 있음.
- 빈 공간에는 작은 별, 구름, 꽃 등 귀여운 수채화풍 일러스트가 장식되어 있음.
- 전체적으로 따뜻하고 포근한 느낌을 주며 가독성이 높음.`
    },
    {
        id: 's2', 
        title: '미니멀 모던 식단표', 
        desc: '깔끔한 화이트 배경에 신선한 식재료 일러스트가 배치된 전문적인 식단 가이드입니다.', 
        category: 'meal', 
        badge: 'Meal Plan', 
        tags: ['#미니멀', '#건강', '#모던'],
        gradient: 'from-green-50 to-emerald-100',
        fullPrompt: `## 비주얼 스타일: Minimal / Fresh / Menu Board
- 화이트 배경에 짙은 녹색과 베이지색 포인트 컬러 사용.
- 상단에는 '이번 주의 식단' 제목이 세련된 산세리프 폰트로 작성됨.
- 요일별 아침, 점심, 저녁 메뉴가 구분된 격자형 레이아웃.
- 주변에 신선한 채소, 과일, 건강한 음식들의 고퀄리티 벡터 일러스트가 배치됨.
- 잡지 화보처럼 깔끔하고 정제된 디자인.`
    },
    {
        id: 's3', 
        title: '비즈니스 프로페셔널', 
        desc: '아이소메트릭 구조를 활용하여 정렬된 고효율 업무 스케줄러입니다.', 
        category: 'weekly', 
        badge: 'Schedule', 
        tags: ['#비즈니스', '#아이소메트릭', '#정교함'],
        gradient: 'from-slate-100 to-blue-200',
        fullPrompt: `## 비주얼 스타일: Business / Isometric / Spreadsheet
- 정교한 아이소메트릭(3D 입보법) 구조의 디지털 플래너 스타일.
- 딥 블루와 라이트 그레이의 신뢰감 있는 색상 조합.
- 타임라인과 체크리스트가 입체적으로 구성되어 효율적인 느낌을 줌.
- 작은 3D 아이콘(시계, 서류, 펜)들이 장식으로 포함됨.
- 전문적이고 체계적인 직업재활 현장의 분위기를 전달함.`
    },
    {
        id: 's4', 
        title: '핸드메이드 칠판 식단', 
        desc: '어두운 칠판 위에 분필로 정성스럽게 적은 듯한 따뜻한 감성의 메뉴판입니다.', 
        category: 'meal', 
        badge: 'Cafeteria', 
        tags: ['#아날로그', '#카페스타일', '#따뜻함'],
        gradient: 'from-zinc-800 to-slate-900',
        fullPrompt: `## 비주얼 스타일: Chalkboard / Handmade / Cozy
- 다크 칠판 배경에 화이트, 옐로우 초크 텍스처 사용.
- 핸드 드로잉 느낌의 풍부한 일러스트와 테두리 장식.
- 요일별 메뉴가 정성스럽게 적힌 따뜻한 공동체 식당 느낌.
- 김이 모락모락 나는 음식 일러스트가 곳곳에 배치됨.
- 보는 사람으로 하여금 친근함과 정성을 느끼게 함.`
    }
];

export function ScheduleDesignView({ onBack }: ScheduleDesignViewProps) {
    const [details, setDetails] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [isLoading, setIsLoading] = useState(false);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [generationError, setGenerationError] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

    const handleGenerate = async () => {
        if (isLoading) return;
        if (!selectedTemplate || !details.trim()) return;

        let finalPrompt = `[입력 내용]\n${details}\n\n[디자인 가이드라인]\n${selectedTemplate.fullPrompt}\n\n[중요] 입력된 내용을 바탕으로 실제 텍스트 정보가 포함된 아름다운 디자인 이미지를 생성해줘. 나노바나나2 스타일로 매우 예쁘게 만들어줘.`;

        setIsLoading(true);
        setResultImage(null);
        setGenerationError('');
        try {
            const res = await generateImage(finalPrompt, 'custom', 'nanobanana2');
            setResultImage(`data:${res.mimeType};base64,${res.imageBase64}`);
        } catch (e: any) {
            setGenerationError(`${e.message || '이미지 생성 중 오류가 발생했습니다.'} 이미지 생성이 어려운 경우, 일정 내용을 HTML/인쇄용 문서로 구성한 뒤 PDF로 저장하는 방식으로 대체할 수 있습니다. 이미지 안의 한국어 글자는 모델 상태에 따라 깨질 수 있습니다.`);
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
            <button onClick={onBack} className="btn-ghost flex items-center gap-2 mb-6 text-sm">
                <ArrowLeft className="w-4 h-4" /> 도구 목록으로 돌아가기
            </button>

            <div className="glass-strong rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                <div className="p-8 md:p-12 text-center bg-gradient-to-b from-blue-500/10 to-transparent">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold mb-4 border border-emerald-500/30">
                        <Sparkles className="w-3 h-3" /> 나노바나나2 디자인 스케줄러
                    </div>
                    <h2 className="text-3xl md:text-4xl font-black text-white mb-4">예쁜 일정/식단표 만들기</h2>
                    <p className="text-white/40 max-w-2xl mx-auto">텍스트만 입력하면 나노바나나2 AI가 세상에서 가장 예쁜 일정표와 식단표를 디자인해 드립니다.</p>
                    <p className="text-amber-100/70 text-xs mt-3">이미지 생성은 텍스트 문서보다 비용과 quota를 더 많이 사용할 수 있습니다. 생성 중 재클릭은 차단됩니다.</p>
                </div>

                <div className="px-8 pb-12">
                    <div className="flex flex-col md:flex-row gap-10">
                        {/* Input Area */}
                        <div className="w-full md:w-1/3 space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-white/70 mb-2 uppercase tracking-wider">주제 및 내용 입력</label>
                                <textarea 
                                    className="input-field min-h-[200px]"
                                    placeholder="예:\n월요일: 바리스타 실습 (10시)\n화요일: 영화 관람 (14시)\n...\n수요일 식단: 불고기, 미역국"
                                    value={details}
                                    onChange={(e) => setDetails(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-white/70 mb-2 uppercase tracking-wider">스타일 템플릿 선택</label>
                                <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                                    {CATEGORIES.map(cat => (
                                        <button
                                            key={cat.id}
                                            onClick={() => setActiveTab(cat.id)}
                                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                                                activeTab === cat.id ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40'
                                            }`}
                                        >
                                            {cat.label}
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {filteredTemplates.map(t => (
                                        <div 
                                            key={t.id}
                                            onClick={() => setSelectedTemplate(t)}
                                            className={`cursor-pointer rounded-xl p-3 border transition-all ${
                                                selectedTemplate?.id === t.id 
                                                ? 'bg-blue-500/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
                                                : 'bg-white/5 border-white/10 hover:bg-white/10'
                                            }`}
                                        >
                                            <div className={`aspect-video w-full rounded-lg bg-gradient-to-br ${t.gradient} mb-2 shadow-inner`} />
                                            <p className="text-[11px] font-bold text-white truncate">{t.title}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button 
                                onClick={handleGenerate}
                                disabled={!selectedTemplate || !details.trim() || isLoading}
                                className="btn-primary w-full flex items-center justify-center gap-2 !py-4"
                            >
                                {isLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> 디자인 생성 중...</> : <><Zap className="w-5 h-5" /> 나노바나나2 디자인 생성</>}
                            </button>
                        </div>

                        {/* Preview Area */}
                        <div className="flex-1 min-h-[400px]">
                            <label className="block text-sm font-bold text-white/70 mb-4 uppercase tracking-wider">디자인 미리보기</label>
                            {generationError && (
                                <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-100">
                                    {generationError}
                                </div>
                            )}
                            <div className="w-full h-full bg-white/5 rounded-3xl border border-white/10 relative flex items-center justify-center overflow-hidden min-h-[500px]">
                                <AnimatePresence mode="wait">
                                    {resultImage ? (
                                        <motion.div 
                                            key="result"
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="w-full h-full relative"
                                        >
                                            <img src={resultImage} alt="Designed Schedule" className="w-full h-full object-contain p-4" />
                                            <div className="absolute bottom-6 right-6 flex gap-2">
                                                <button type="button" onClick={async () => {
                                                    try {
                                                        const saved = await saveJjssDataUrl('image', `JJSS_Design_${Date.now()}.png`, resultImage);
                                                        if (saved.canceled) alert(savedLocationMessage(saved));
                                                    } catch (error: any) {
                                                        setGenerationError(error?.message || '이미지를 저장하지 못했습니다.');
                                                    }
                                                }} className="btn-primary flex items-center gap-2 !px-4 !py-2 text-sm shadow-2xl">
                                                    <Download className="w-4 h-4" /> 이미지 저장
                                                </button>
                                            </div>
                                        </motion.div>
                                    ) : isLoading ? (
                                        <motion.div key="loading" className="text-center">
                                            <div className="relative mb-6">
                                                <div className="w-20 h-20 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin mx-auto" />
                                                <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-blue-400" />
                                            </div>
                                            <p className="text-white font-bold text-xl mb-2">나노바나나2가 디자인하는 중...</p>
                                            <p className="text-white/30 text-sm">약 10~20초 정도 소요됩니다.</p>
                                        </motion.div>
                                    ) : (
                                        <div className="text-center p-8">
                                            <LayoutTemplate className="w-16 h-16 text-white/10 mx-auto mb-4" />
                                            <p className="text-white/30 text-lg font-medium">내용을 입력하고 템플릿을 선택한 뒤<br/> 생성 버튼을 눌러주세요.</p>
                                        </div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
