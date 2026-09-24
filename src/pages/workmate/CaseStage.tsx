import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, RotateCcw, Save, Sparkles } from 'lucide-react';
import { CopyButton } from '../../components/common/CopyButton';
import type { CaseStep } from './types';

export interface CaseStageProps {
    title: string;
    description: string;
    isActive: boolean;
    isDone: boolean;
    isSaved: boolean;
    input: string;
    setInput: (v: string) => void;
    result: string;
    setResult: (v: string) => void;
    onGenerate: () => void;
    onRefine?: () => void;
    /** 이 단계 문서를 생성·보완하는 중 */
    isGenerating: boolean;
    /** 어느 문서든 AI 생성·저장이 진행 중(버튼 잠금용) */
    isBusy: boolean;
    isSaving: boolean;
    onSave: () => void;
    onReset: () => void;
    placeholder: string;
    onActivate: () => void;
}

export function CaseStage({
    title, description, isActive, isDone, isSaved, input, setInput, result, setResult,
    onGenerate, onRefine, isGenerating, isBusy, isSaving, onSave, onReset, placeholder, onActivate,
}: CaseStageProps) {
    return (
        <motion.div
            layout
            onClick={() => !isActive && onActivate()}
            className={`glass-strong rounded-[2rem] border transition-all overflow-hidden ${isSaved ? 'border-emerald-500/30 bg-emerald-500/5' : isActive ? 'border-accent-500/50 ring-1 ring-accent-500/20' : isDone ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/5'
                }`}
        >
            <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg ${isSaved ? 'bg-emerald-500 text-white' : isDone ? 'bg-amber-500 text-white' : 'bg-accent-500 text-white'
                            }`}>
                            {isSaved ? '✓' : title.charAt(5)}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="text-xl font-bold text-white">{title}</h4>
                                {isDone && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${isSaved ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                                        {isSaved ? '저장됨' : '저장 전 초안'}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-white/40 font-medium">{description}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {isDone && (
                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                                {onRefine && (
                                    <button type="button" onClick={onRefine} disabled={isBusy} className="p-2 text-amber-300 hover:bg-amber-400/10 rounded-lg transition-colors disabled:opacity-40" title="현재 내용 기반 보완" aria-label="현재 내용 기반 보완">
                                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    </button>
                                )}
                                <button type="button" onClick={onSave} disabled={isBusy} className="p-2 text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title={isSaving ? '저장 중' : '저장'} aria-label={isSaving ? '저장 중' : '저장'}>
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                </button>
                                <CopyButton text={result} label="복사" iconOnly className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors disabled:opacity-40" />
                                <button type="button" onClick={onReset} disabled={isBusy} className="p-2 text-red-400/60 hover:text-red-400 rounded-lg transition-colors disabled:opacity-40" title="초기화" aria-label="작성 내용 비우기"><RotateCcw className="w-4 h-4" /></button>
                            </div>
                        )}
                        {isActive && !isDone && (
                            <button
                                type="button"
                                onClick={onGenerate}
                                disabled={isBusy}
                                className="btn-primary !px-6 !py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-xl shadow-accent-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                새 초안 생성
                            </button>
                        )}
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {isActive && !isDone ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="space-y-4"
                        >
                            <textarea
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                readOnly={isGenerating}
                                className="textarea-field !bg-black/40 border-white/5 !min-h-[160px] text-sm leading-relaxed"
                                placeholder={placeholder}
                            />
                            <p className="text-[11px] text-white/20 font-medium flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> 입력한 키워드를 바탕으로 전문적인 문서가 자동 구성됩니다.</p>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="space-y-4"
                        >
                            {result && (
                                <textarea
                                    value={result}
                                    onChange={e => setResult(e.target.value)}
                                    readOnly={isGenerating || isSaving}
                                    className={`textarea-field !min-h-[200px] !max-h-[400px] text-sm leading-relaxed font-sans ${isDone ? '!bg-transparent border-emerald-500/10' : '!bg-black/20'}`}
                                />
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

function ArrowRightIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/10" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
        </svg>
    );
}

const CASE_STEP_ITEMS: Array<{ key: Exclude<CaseStep, 'select'>; label: string; num: number }> = [
    { key: 'meeting', label: '사례회의', num: 1 },
    { key: 'plan', label: '재활계획', num: 2 },
    { key: 'followup', label: '사후관리 (상담 및 평가)', num: 3 },
];

interface CaseStepNavProps {
    caseStep: CaseStep;
    onStepChange: (step: CaseStep) => void;
    /** 단계별 "저장됨" 여부 */
    saved: Record<Exclude<CaseStep, 'select'>, boolean>;
    /** 단계별 "저장 전 초안" 여부(표시 우선순위: 진행 중 > 저장 전 > 저장됨) */
    draft: Record<Exclude<CaseStep, 'select'>, boolean>;
}

/** 사례관리 단계 바로가기 탭 */
export function CaseStepNav({ caseStep, onStepChange, saved, draft }: CaseStepNavProps) {
    return (
        <div className="flex gap-2 px-2 flex-wrap">
            {CASE_STEP_ITEMS.map(({ key, label, num }, idx) => {
                const isStepActive = caseStep === key;
                const hasDone = saved[key];
                const hasDraft = draft[key];
                return (
                    <div key={key} className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onStepChange(key)}
                            aria-current={isStepActive ? 'step' : undefined}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isStepActive
                                    ? 'bg-accent-500/20 text-accent-300 border border-accent-500/30'
                                    : hasDraft
                                        ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20'
                                    : hasDone
                                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20'
                                        : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60'
                                }`}
                        >
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${isStepActive ? 'bg-accent-500 text-white' : hasDraft ? 'bg-amber-500 text-white' : hasDone ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/30'
                                }`}>
                                {hasDone && !isStepActive ? '✓' : num}
                            </div>
                            {label}
                            {hasDraft ? <span className="text-[9px] font-black">저장 전</span> : hasDone ? <span className="text-[9px] font-black">저장됨</span> : null}
                        </button>
                        {idx < CASE_STEP_ITEMS.length - 1 && <ArrowRightIcon />}
                    </div>
                );
            })}
        </div>
    );
}
