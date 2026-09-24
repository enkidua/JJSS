import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Wand2, Download, Eye, LayoutTemplate, Loader2, X } from 'lucide-react';
import { saveJjssDataUrl } from '../utils/jjssFileService';
import { useToast } from './Toast';
import { useConfirm } from './common/ConfirmProvider';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { ToolPageShell } from './tools/ToolPageShell';
import { useImageGeneration } from './tools/useImageGeneration';
import type { GeminiImageAspectRatio } from '../services/gemini';
import { useReportDirty } from './tools/useReportDirty';
import {
    PROMO_CATEGORIES,
    PROMO_TEMPLATES,
    OUTPUT_FORMAT_LABELS,
    buildStylePrompt,
    type PromoOutputFormat,
    type PromoTemplate,
} from '../data/promoTemplates';

interface PromoDesignViewProps {
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

const ASPECT_RATIOS: GeminiImageAspectRatio[] = ['1:1', '16:9', '9:16', '3:4'];
const IMAGE_FALLBACK_HINT = '이미지 생성이 어려운 경우, 같은 내용을 HTML/인쇄용 문서로 구성한 뒤 PDF로 저장하는 방식으로 대체할 수 있습니다. 이미지 안의 한국어 글자는 모델 상태에 따라 깨질 수 있습니다.';

export function PromoDesignView({ onBack, onDirtyChange }: PromoDesignViewProps) {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [prompt, setPrompt] = useState('');
    const [activeTab, setActiveTab] = useState('all');
    const [selectedTemplate, setSelectedTemplate] = useState<PromoTemplate | null>(null);
    const [outputFormat, setOutputFormat] = useState<PromoOutputFormat>('poster');
    const [aspectRatio, setAspectRatio] = useState<GeminiImageAspectRatio>('1:1');
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [savedImage, setSavedImage] = useState<string | null>(null);
    const { isLoading, result, error: generationError, setError: setGenerationError, generate, cancel, clearResult } = useImageGeneration();

    // 결과는 {templateId, image}로 보관해 다른 템플릿 창에 잘못 표시되지 않게 합니다.
    const resultImage = result && selectedTemplate && result.templateId === selectedTemplate.id ? result.image : null;
    const hasUnsavedImage = Boolean(result && result.image !== savedImage);
    useReportDirty(isLoading || hasUnsavedImage || Boolean(prompt.trim()), onDirtyChange);

    const openTemplate = (template: PromoTemplate) => {
        setSelectedTemplate(template);
        setOutputFormat(template.defaultFormat);
        setGenerationError('');
    };

    const closingRef = useRef(false);
    const closeTemplate = async () => {
        if (previewImage) {
            setPreviewImage(null);
            return;
        }
        if (closingRef.current) return;
        closingRef.current = true;
        try {
            await confirmAndCloseTemplate();
        } finally {
            closingRef.current = false;
        }
    };

    const confirmAndCloseTemplate = async () => {
        if (isLoading) {
            const ok = await confirm({
                title: '이미지 생성 중',
                message: '창을 닫으면 이미지 생성을 취소합니다.\n이미 전송된 요청은 사용량(비용)에 포함될 수 있습니다. 닫을까요?',
                confirmLabel: '생성 취소하고 닫기',
                cancelLabel: '계속 기다리기',
                tone: 'danger',
            });
            if (!ok) return;
            cancel();
        } else if (hasUnsavedImage) {
            const ok = await confirm({
                title: '저장하지 않은 이미지',
                message: '생성한 이미지를 아직 파일로 저장하지 않았습니다.\n창을 닫으면 이미지가 사라집니다. 닫을까요?',
                confirmLabel: '닫기',
                cancelLabel: '돌아가기',
                tone: 'danger',
            });
            if (!ok) return;
        }
        clearResult();
        setSelectedTemplate(null);
    };

    const dialogRef = useDialogFocus(Boolean(selectedTemplate), () => { void closeTemplate(); });

    const handleGenerateForTemplate = async () => {
        if (isLoading || !selectedTemplate || !prompt.trim()) return;
        const finalPrompt = `주제 및 내용: ${prompt.trim()}\n\n[추가 조건]\n가로세로 화면 비율(Aspect Ratio) 가이드: ${aspectRatio}\n결과물 형태: ${OUTPUT_FORMAT_LABELS[outputFormat]}\n\n[디자인 가이드라인 필수 적용 사항]\n다음 스타일 가이드를 엄격하게 준수하여 이미지를 생성하세요:\n${buildStylePrompt({ ...selectedTemplate.style, format: outputFormat })}`;
        await generate(selectedTemplate.id, finalPrompt, { aspectRatio });
    };

    const handleSave = async () => {
        if (!resultImage) return;
        try {
            const saved = await saveJjssDataUrl('image', 'ai-poster.png', resultImage);
            if (saved.canceled) {
                showToast('저장이 취소되었습니다.', 'info');
                return;
            }
            setSavedImage(resultImage);
        } catch (error: unknown) {
            setGenerationError(error instanceof Error && error.message ? error.message : '이미지를 저장하지 못했습니다.');
        }
    };

    const filteredTemplates = activeTab === 'all'
        ? PROMO_TEMPLATES
        : PROMO_TEMPLATES.filter(t => t.category === activeTab);

    return (
        <ToolPageShell onBack={onBack}>
            <div className="glass-strong rounded-[2rem] shadow-2xl overflow-hidden border border-white/10 relative">
                {/* Header section */}
                <div className="pt-16 pb-12 px-8 flex flex-col items-center text-center bg-transparent">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold mb-6 border border-blue-500/30">
                        <span className="text-blue-400">●</span> 이미지 생성(Gemini) 베타
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
                        {PROMO_CATEGORIES.map(cat => (
                            <button
                                type="button"
                                key={cat.id}
                                onClick={() => setActiveTab(cat.id)}
                                aria-pressed={activeTab === cat.id}
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
                            <motion.button
                                type="button"
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                key={t.id}
                                className="text-left glass-strong rounded-2xl border border-white/10 overflow-hidden hover:border-white/30 transition-all group flex flex-col cursor-pointer hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
                                onClick={() => openTemplate(t)}
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
                                            <Wand2 className="w-4 h-4" /> 요구사항 입력하기
                                        </div>
                                    </div>

                                    <div className="absolute top-4 left-4">
                                        <span className="px-3 py-1 bg-white/90 backdrop-blur-sm text-slate-700 text-xs font-bold rounded-lg shadow-sm">
                                            {t.badge}
                                        </span>
                                    </div>
                                </div>

                                {/* Content Box */}
                                <div className="p-5 flex-1 flex flex-col bg-[#1e293b]/50 w-full">
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
                            </motion.button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Template Action Modal */}
            <AnimatePresence>
                {selectedTemplate && (
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 lg:p-10"
                        onClick={() => { void closeTemplate(); }}
                    >
                        <motion.div
                            ref={dialogRef}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="promo-template-title"
                            tabIndex={-1}
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-[#1e293b] border border-white/10 p-6 md:p-8 rounded-[2rem] shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden flex flex-col md:flex-row gap-8 relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Background glow */}
                            <div className="pointer-events-none absolute top-0 right-0 w-[30rem] h-[30rem] bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>

                            <button
                                type="button"
                                aria-label="템플릿 창 닫기"
                                className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors z-20 bg-black/20 p-2 rounded-full"
                                onClick={() => { void closeTemplate(); }}
                            >
                                <X className="w-6 h-6" />
                            </button>

                            {/* Left Side: Image Preview */}
                            <div className="w-full md:w-1/2 relative z-10 flex flex-col">
                                <button
                                    type="button"
                                    aria-label="이미지 크게 보기"
                                    className="rounded-2xl overflow-hidden shadow-2xl shadow-black/50 border border-white/10 bg-black/40 aspect-[4/3] flex items-center justify-center relative cursor-pointer group"
                                    onClick={() => setPreviewImage(resultImage || selectedTemplate.image || null)}
                                >
                                    {resultImage ? (
                                        <img src={resultImage} alt="생성한 디자인" className="w-full h-full object-contain bg-slate-900 transition-transform duration-500 group-hover:scale-[1.02]" />
                                    ) : selectedTemplate.image ? (
                                        <img src={selectedTemplate.image} alt={selectedTemplate.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
                                    ) : (
                                        <LayoutTemplate className="w-16 h-16 text-white/10" />
                                    )}
                                    {isLoading && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 text-white">
                                            <Loader2 className="w-10 h-10 animate-spin" />
                                            <span className="text-sm font-bold">이미지를 만드는 중입니다...</span>
                                        </div>
                                    )}
                                    {/* Hover 줌 아이콘 오버레이 */}
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                        <div className="bg-black/60 backdrop-blur-md text-white p-3 rounded-full flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                                            <Eye className="w-8 h-8" />
                                        </div>
                                    </div>
                                    <div className="absolute bottom-4 left-4 pointer-events-none">
                                        <span className="px-3 py-1 bg-black/60 backdrop-blur-md text-white/90 text-xs font-bold rounded-lg border border-white/20">
                                            {resultImage ? '생성 결과' : selectedTemplate.badge}
                                        </span>
                                    </div>
                                </button>
                            </div>

                            {/* Right Side: Prompt Input */}
                            <div className="w-full md:w-1/2 flex flex-col justify-center relative z-10">
                                <div className="mb-6">
                                    <h3 id="promo-template-title" className="text-3xl font-black text-white mb-2 tracking-tight">{selectedTemplate.title}</h3>
                                    <p className="text-white/50 text-sm">{selectedTemplate.desc}</p>
                                </div>

                                <div className="flex-1 flex flex-col">
                                    <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                                        <label htmlFor="promo-prompt" className="text-sm font-bold text-blue-400 flex items-center gap-2">
                                            <Sparkles className="w-4 h-4" /> 요구사항 입력
                                        </label>
                                        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-black/40 border border-white/5" role="group" aria-label="화면 비율">
                                            {ASPECT_RATIOS.map(ratio => (
                                                <button
                                                    type="button"
                                                    key={ratio}
                                                    onClick={() => setAspectRatio(ratio)}
                                                    aria-pressed={aspectRatio === ratio}
                                                    disabled={isLoading}
                                                    className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${aspectRatio === ratio ? 'bg-blue-500 text-white' : 'text-white/40 hover:bg-white/10 hover:text-white'}`}
                                                >
                                                    {ratio}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="mb-3 flex items-center gap-2 text-xs" role="group" aria-label="결과물 형태">
                                        <span className="text-white/50 font-bold">결과물 형태</span>
                                        {(Object.keys(OUTPUT_FORMAT_LABELS) as PromoOutputFormat[]).map(format => (
                                            <button
                                                type="button"
                                                key={format}
                                                onClick={() => setOutputFormat(format)}
                                                aria-pressed={outputFormat === format}
                                                disabled={isLoading}
                                                className={`px-3 py-1 rounded-full font-bold border transition-colors ${outputFormat === format ? 'bg-blue-500 text-white border-blue-400' : 'border-white/10 text-white/50 hover:bg-white/10 hover:text-white'}`}
                                            >
                                                {OUTPUT_FORMAT_LABELS[format]}
                                            </button>
                                        ))}
                                    </div>
                                    <textarea
                                        id="promo-prompt"
                                        className="w-full flex-1 min-h-[160px] bg-black/30 border border-white/10 rounded-2xl p-5 text-white placeholder-white/30 focus:outline-none focus:border-blue-500/50 resize-none transition-colors shadow-inner text-lg"
                                        placeholder={`예) 발달장애인 바리스타 훈련생 모집\n- 대상: 19세 이상 발달장애인\n- 모집기간: 9월 1일까지\n- 문의: 02-123-4567\n이 템플릿 디자인에 맞게 문구를 수정하고 배치해줘.`}
                                        value={prompt}
                                        onChange={e => setPrompt(e.target.value)}
                                        disabled={isLoading}
                                    />
                                </div>

                                <div className="flex flex-col gap-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={handleGenerateForTemplate}
                                        disabled={isLoading || !prompt.trim()}
                                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-blue-900 disabled:to-indigo-900 disabled:text-white/40 disabled:cursor-not-allowed text-white text-lg font-black py-4 rounded-xl flex justify-center items-center gap-3 transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)] active:scale-95"
                                    >
                                        {isLoading ? (
                                            <><Loader2 className="w-6 h-6 animate-spin" /> 이미지를 생성하고 있습니다...</>
                                        ) : resultImage ? (
                                            <><Wand2 className="w-6 h-6" /> 이 디자인으로 다시 생성하기</>
                                        ) : (
                                            <><Wand2 className="w-6 h-6" /> 이 디자인으로 생성하기</>
                                        )}
                                    </button>
                                    {isLoading && (
                                        <button
                                            type="button"
                                            onClick={cancel}
                                            className="w-full rounded-xl border border-white/15 py-2 text-sm font-bold text-white/70 hover:bg-white/10"
                                        >
                                            생성 취소
                                        </button>
                                    )}

                                    {resultImage && (
                                        <button
                                            type="button"
                                            onClick={() => void handleSave()}
                                            disabled={isLoading}
                                            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-lg font-black py-3 rounded-xl flex justify-center items-center gap-2 transition-colors shadow-lg shadow-emerald-500/20 active:scale-95"
                                        >
                                            <Download className="w-5 h-5" /> 파일로 저장
                                        </button>
                                    )}
                                    {generationError && (
                                        <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-100">
                                            {generationError} {IMAGE_FALLBACK_HINT}
                                            {resultImage && <span className="block mt-1">이전에 만든 이미지는 그대로 남아 있습니다.</span>}
                                        </div>
                                    )}
                                </div>

                                <p className="text-center text-white/30 text-xs mt-4">
                                    이미지 생성은 텍스트 문서보다 사용량(비용)이 더 많이 들 수 있습니다. 새 이미지가 완성되기 전까지 기존 이미지는 그대로 유지됩니다.
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
                            type="button"
                            aria-label="크게 보기 닫기"
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
                            alt="크게 보기"
                            className="max-w-full max-h-full object-contain rounded-lg shadow-[0_0_100px_rgba(255,255,255,0.1)]"
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </ToolPageShell>
    );
}
