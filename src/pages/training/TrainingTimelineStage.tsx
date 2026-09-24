import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Copy, FileText, Loader2, RotateCcw, Save, Sparkles, Trash2, X } from 'lucide-react';
import { CopyButton } from '../../components/common/CopyButton';
import { TrainingInput } from './TrainingUi';

export function TrainingTimelineStage({
    title,
    description,
    history,
    onHistoryChange,
    onHistoryDelete,
    draft,
    setDraft,
    onResetDraft,
    date,
    place,
    memo,
    onDateChange,
    onPlaceChange,
    onMemoChange,
    onGenerate,
    isGenerating,
    busy,
    onSaveDraft,
    evaluation,
    setEvaluation,
    onResetEvaluation,
    evaluationMemo,
    onEvaluationMemoChange,
    onGenerateEvaluation,
    isGeneratingEvaluation,
    onSaveEvaluation,
    onCopy,
}: {
    title: string;
    description: string;
    history: string[];
    onHistoryChange: (index: number, value: string) => void;
    onHistoryDelete: (index: number) => void;
    draft: string;
    setDraft: (value: string) => void;
    onResetDraft: () => void;
    date: string;
    place: string;
    memo: string;
    onDateChange: (value: string) => void;
    onPlaceChange: (value: string) => void;
    onMemoChange: (value: string) => void;
    onGenerate: () => void;
    isGenerating: boolean;
    /** 페이지에서 다른 AI 작업이 실행 중이면 true */
    busy: boolean;
    onSaveDraft: () => void;
    evaluation: string;
    setEvaluation: (value: string) => void;
    onResetEvaluation: () => void;
    evaluationMemo: string;
    onEvaluationMemoChange: (value: string) => void;
    onGenerateEvaluation: () => void;
    isGeneratingEvaluation: boolean;
    onSaveEvaluation: () => void;
    onCopy: (text: string) => void;
}) {
    const [documentMode, setDocumentMode] = useState<'counseling' | 'evaluation'>('counseling');
    const hasHistory = history.length > 0;
    const isEvaluation = documentMode === 'evaluation';
    const activeText = isEvaluation ? evaluation : draft;
    const hasDraft = !!activeText.trim();
    const activeGenerate = isEvaluation ? onGenerateEvaluation : onGenerate;
    const activeGenerating = isEvaluation ? isGeneratingEvaluation : isGenerating;
    const activeSetText = isEvaluation ? setEvaluation : setDraft;
    const activeSave = isEvaluation ? onSaveEvaluation : onSaveDraft;
    const activeReset = isEvaluation ? onResetEvaluation : onResetDraft;
    const activeTitle = isEvaluation ? '정기평가 생성결과' : '새 상담일지 생성결과';

    return (
        <motion.div
            layout
            className={`glass-strong rounded-[2rem] border overflow-hidden transition-all ${
                hasHistory || hasDraft ? 'border-blue-400/35 bg-blue-500/[0.04]' : 'border-white/10'
            }`}
        >
            <div className="p-6 md:p-8">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                    <div className="flex items-start gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg ${
                            hasHistory ? 'bg-blue-500 text-white' : 'bg-blue-500/15 text-blue-200 border border-blue-400/25'
                        }`}>
                            {hasHistory ? '✓' : '2'}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white">{title}</h2>
                            <p className="text-sm text-white/40 mt-1">{description}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl bg-slate-900/70 border border-white/10 p-1.5">
                        <button
                            type="button"
                            title={isEvaluation ? '정기평가 저장' : '상담일지를 아래 기록에 붙이기'}
                            aria-label={isEvaluation ? '정기평가 저장' : '상담일지를 아래 기록에 붙이기'}
                            onClick={activeSave}
                            disabled={!hasDraft || activeGenerating}
                            className="p-2 rounded-xl text-emerald-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                            <Save className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            title={isEvaluation ? '정기평가 복사' : '임시 상담일지 복사'}
                            aria-label={isEvaluation ? '정기평가 복사' : '임시 상담일지 복사'}
                            onClick={() => onCopy(activeText)}
                            disabled={!hasDraft}
                            className="p-2 rounded-xl text-blue-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                            <Copy className="w-4 h-4" />
                        </button>
                        <button
                            type="button"
                            title={hasDraft ? '현재 내용 기반 보완' : '새 초안 생성'}
                            aria-label={hasDraft ? '현재 내용 기반 보완' : '새 초안 생성'}
                            onClick={activeGenerate}
                            disabled={busy}
                            className="p-2 rounded-xl text-rose-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                            {activeGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                        </button>
                        <button
                            type="button"
                            title="초기화"
                            aria-label={isEvaluation ? '정기평가 초기화' : '상담일지 생성결과 초기화'}
                            onClick={activeReset}
                            disabled={!hasDraft || activeGenerating}
                            className="p-2 rounded-xl text-white/45 hover:text-red-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="space-y-6">
                    <div>
                        <h5 className="text-[11px] font-black text-white/30 uppercase tracking-widest flex items-center gap-2 mb-2">
                            <Clock className="w-3 h-3" /> 진행 경과 요약 ({history.length}건)
                        </h5>
                        {hasHistory && <p className="text-xs text-white/35 mb-4">누적된 상담일지는 칸에서 바로 고칠 수 있고, 고친 내용은 자동 저장됩니다.</p>}
                        <div className="space-y-5 max-h-[760px] overflow-y-auto pr-3 custom-scrollbar border-l-2 border-white/5 pl-4 ml-2 relative">
                            {history.map((item, index) => (
                                <div key={index} className="relative">
                                    <div className="absolute -left-[23px] top-4 w-3 h-3 rounded-full border-4 border-[#12121a] bg-emerald-400" />
                                    <div className="p-5 rounded-3xl bg-emerald-500/5 border border-emerald-500/20">
                                        <div className="flex justify-between items-center mb-3">
                                            <span className="text-xs font-bold flex items-center gap-2 text-emerald-400">
                                                <FileText className="w-3.5 h-3.5" />
                                                상담일지
                                                <span className="text-white/20 font-normal ml-1 text-[10px]">{index + 1}회기</span>
                                            </span>
                                            <div className="flex gap-1">
                                                <CopyButton
                                                    text={item}
                                                    label={`${index + 1}회기 상담일지 복사`}
                                                    iconOnly
                                                    className="p-1.5 text-white/30 hover:text-white transition-colors disabled:opacity-30"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => onHistoryDelete(index)}
                                                    className="p-1.5 text-white/30 hover:text-red-300 transition-colors"
                                                    title={`${index + 1}회기 상담일지 삭제`}
                                                    aria-label={`${index + 1}회기 상담일지 삭제`}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <textarea
                                            value={item}
                                            onChange={event => onHistoryChange(index, event.target.value)}
                                            aria-label={`${index + 1}회기 상담일지 내용`}
                                            className="textarea-field !bg-black/20 !border-none !p-4 rounded-2xl !min-h-[220px] !max-h-[620px] text-sm leading-relaxed text-white/85 resize-y"
                                        />
                                    </div>
                                </div>
                            ))}
                            {!hasHistory && <p className="text-sm text-white/35 py-8">아직 누적된 상담일지가 없습니다. 아래 입력칸에서 첫 상담일지를 생성해 주세요.</p>}
                        </div>
                    </div>

                    {hasDraft && (
                        <div className="p-5 rounded-2xl bg-accent-500/10 border border-accent-500/30 shadow-lg shadow-accent-500/5">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                                <span className="text-xs font-bold text-accent-300 flex items-center gap-2">
                                    <Sparkles className="w-3.5 h-3.5" /> {activeTitle}
                                </span>
                                <div className="flex gap-2">
                                    <button type="button" onClick={activeGenerate} disabled={busy} className="px-3 py-1.5 bg-white/10 text-white font-bold text-xs rounded-lg hover:bg-white/20 transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed" title="현재 작성칸에서 수정한 내용을 기준으로 다시 생성합니다.">
                                        {activeGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} 현재 내용 기반 보완
                                    </button>
                                    <button type="button" onClick={activeSave} disabled={activeGenerating} className="px-3 py-1.5 bg-accent-500 text-white font-bold text-xs rounded-lg hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{isEvaluation ? '정기평가 저장' : '작성 완료(기록에 붙이기)'}</button>
                                    <button type="button" onClick={activeReset} disabled={activeGenerating} className="p-1.5 text-white/30 hover:text-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="생성결과 지우기" aria-label="생성결과 지우기"><X className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                            <textarea
                                value={activeText}
                                onChange={e => activeSetText(e.target.value)}
                                aria-label={activeTitle}
                                className="textarea-field !bg-black/30 border-accent-500/20 !min-h-[180px] !max-h-[460px] text-sm leading-relaxed font-sans resize-y"
                            />
                        </div>
                    )}

                    <div className="rounded-3xl bg-white/[0.03] border border-white/10 overflow-hidden">
                        <div className="grid grid-cols-2 border-b border-white/10">
                            <button
                                type="button"
                                aria-pressed={documentMode === 'counseling'}
                                onClick={() => setDocumentMode('counseling')}
                                className={`py-3 text-center text-sm font-black transition-colors ${
                                    documentMode === 'counseling' ? 'text-emerald-300 bg-emerald-500/10 border-b-2 border-emerald-400' : 'text-white/35 bg-white/[0.02] hover:text-white/70'
                                }`}
                            >
                                상담일지 추가
                            </button>
                            <button
                                type="button"
                                aria-pressed={documentMode === 'evaluation'}
                                onClick={() => setDocumentMode('evaluation')}
                                className={`py-3 text-center text-sm font-black transition-colors ${
                                    documentMode === 'evaluation' ? 'text-emerald-300 bg-emerald-500/10 border-b-2 border-emerald-400' : 'text-white/35 bg-white/[0.02] hover:text-white/70'
                                }`}
                            >
                                정기평가 작성
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <TrainingInput label={isEvaluation ? '평가일시' : '상담일시'} value={date} onChange={onDateChange} placeholder="2026년 4월 24일 14:00" />
                                <TrainingInput label={isEvaluation ? '평가장소' : '상담장소'} value={place} onChange={onPlaceChange} placeholder="훈련실 / 상담실" />
                            </div>
                            <textarea
                                value={isEvaluation ? evaluationMemo : memo}
                                onChange={e => (isEvaluation ? onEvaluationMemoChange(e.target.value) : onMemoChange(e.target.value))}
                                aria-label={isEvaluation ? '정기평가 입력 메모' : '상담 입력 메모'}
                                placeholder={isEvaluation ? '목표 달성도, 변화, 미달성 사유, 다음 훈련계획에 반영할 내용을 입력하세요. 누적 상담일지와 훈련계획 흐름이 함께 반영됩니다.' : '상담 일시, 장소, 주요 대화 내용 및 진전 피드백을 입력하세요. 이전 타임라인 흐름이 함께 반영됩니다.'}
                                className="textarea-field !bg-black/30 border-white/10 !min-h-[130px] text-sm leading-relaxed"
                            />
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                <p className="text-xs text-white/35 flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3" /> 이전 상담/평가 기록을 참조하여 자연스럽게 연속되는 문서로 정리됩니다.
                                </p>
                                <button type="button" onClick={activeGenerate} disabled={busy} className="btn-primary flex items-center justify-center gap-2 md:min-w-[160px] disabled:opacity-50 disabled:cursor-not-allowed">
                                    {activeGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {isEvaluation ? '새 훈련 평가서 초안 생성' : '새 훈련 상담일지 초안 생성'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
