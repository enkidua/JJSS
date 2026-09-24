import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Copy, Loader2, RotateCcw, Save, Sparkles, X } from 'lucide-react';
import type { TrainingSaveStatus } from './trainingModel';
import { SaveStatusBadge } from './TrainingUi';

export function TrainingStageCard({
    step,
    title,
    description,
    children,
    actions,
    result,
    setResult,
    resultPlaceholder,
    saveStatus,
    onSave,
    onCopy,
    onRewrite,
    isRewriting,
    rewriteDisabled,
    onReset,
}: {
    step: string;
    title: string;
    description: string;
    children: ReactNode;
    actions: ReactNode;
    result: string;
    setResult: (value: string) => void;
    resultPlaceholder: string;
    saveStatus: TrainingSaveStatus;
    onSave?: () => void;
    onCopy: () => void;
    onRewrite?: () => void;
    isRewriting?: boolean;
    rewriteDisabled?: boolean;
    onReset?: () => void;
}) {
    const hasResult = !!result.trim();

    return (
        <motion.div
            layout
            className={`glass-strong rounded-[2rem] border overflow-hidden transition-all ${
                hasResult ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-emerald-400/20'
            }`}
        >
            <div className="p-6 md:p-8">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                    <div className="flex items-start gap-4">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg ${
                            hasResult ? 'bg-emerald-500 text-white' : 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/25'
                        }`}>
                            {hasResult ? '✓' : step}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-white">{title}</h2>
                            <p className="text-sm text-white/40 mt-1">{description}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <ResultActionBar
                            hasResult={hasResult}
                            onSave={onSave}
                            onCopy={onCopy}
                            onRewrite={onRewrite}
                            isRewriting={isRewriting}
                            rewriteDisabled={rewriteDisabled}
                            onReset={onReset}
                        />
                    </div>
                </div>

                {!hasResult ? (
                    <div className="rounded-3xl bg-white/[0.025] border border-white/10 p-5">
                        <div className="space-y-4">{children}</div>
                        <div className="mt-5">{actions}</div>
                    </div>
                ) : (
                    <div className="rounded-3xl bg-black/20 border border-emerald-400/15 p-5 flex flex-col min-h-[460px]">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                                <h3 className="font-black text-white">작성 결과</h3>
                                <p className="text-xs text-white/35 mt-1">생성된 문서만 남겼습니다. 필요하면 이 칸에서 바로 수정할 수 있습니다.</p>
                            </div>
                            <SaveStatusBadge status={saveStatus} />
                        </div>
                        <textarea
                            value={result}
                            onChange={e => setResult(e.target.value)}
                            placeholder={resultPlaceholder}
                            aria-label={`${title} 작성 결과`}
                            className="textarea-field !bg-black/30 border-white/10 flex-1 min-h-[360px] text-sm leading-relaxed resize-y"
                        />
                    </div>
                )}
            </div>
        </motion.div>
    );
}

export function InsightResult({
    title,
    value,
    onChange,
    onRewrite,
    isRewriting,
    busy,
    onSave,
    onCopy,
    onReset,
}: {
    title: string;
    value: string;
    onChange: (value: string) => void;
    onRewrite: () => void;
    isRewriting: boolean;
    /** 페이지에서 다른 AI 작업이 실행 중이면 true */
    busy: boolean;
    onSave: () => void;
    onCopy: () => void;
    onReset: () => void;
}) {
    const hasValue = !!value.trim();
    return (
        <div className="glass-strong rounded-[2rem] p-5 border border-white/10 shadow-2xl min-h-[520px] flex flex-col">
            <div className="flex flex-col gap-3 mb-3">
                <h3 className="font-black text-white">{title}</h3>
                <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={onRewrite} disabled={isRewriting || busy} className="px-3 py-2 rounded-xl bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-45 disabled:cursor-not-allowed text-xs font-bold flex items-center justify-center gap-1.5" title={hasValue ? '현재 내용 기반 보완' : '새 초안 생성'}>
                        {isRewriting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {hasValue ? '현재 내용 기반 보완' : '새 초안 생성'}
                    </button>
                    <button type="button" onClick={onSave} disabled={!hasValue} className="px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center justify-center gap-1.5" title="저장"><Save className="w-3.5 h-3.5" />저장</button>
                    <button type="button" onClick={onCopy} disabled={!hasValue} className="px-3 py-2 rounded-xl bg-blue-500/10 text-blue-200 hover:bg-blue-500/20 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center justify-center gap-1.5" title="복사"><Copy className="w-3.5 h-3.5" />복사</button>
                    <button type="button" onClick={onReset} disabled={!hasValue || isRewriting} className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-200 hover:bg-rose-500/20 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center justify-center gap-1.5" title="초기화"><RotateCcw className="w-3.5 h-3.5" />초기화</button>
                </div>
            </div>
            <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={`${title} 결과가 여기에 표시됩니다.`} aria-label={title} className="textarea-field !bg-black/30 flex-1 text-sm leading-relaxed resize-none" />
        </div>
    );
}

export function ResultActionBar({
    hasResult,
    onSave,
    onCopy,
    onRewrite,
    isRewriting = false,
    rewriteDisabled = false,
    onReset,
}: {
    hasResult: boolean;
    onSave?: () => void;
    onCopy?: () => void;
    onRewrite?: () => void;
    /** 이 문서를 AI가 보완하는 중이면 스피너를 보여 줍니다. */
    isRewriting?: boolean;
    /** 다른 AI 작업이 실행 중이면 true(동시 실행 방지). */
    rewriteDisabled?: boolean;
    onReset?: () => void;
}) {
    return (
        <div className="flex items-center gap-1 rounded-2xl bg-slate-900/70 border border-white/10 p-1.5">
            <button
                type="button"
                title="저장"
                onClick={onSave}
                disabled={!hasResult || !onSave}
                className="px-3 py-2 rounded-xl text-emerald-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5"
            >
                <Save className="w-4 h-4" />
                <span className="hidden sm:inline">저장</span>
            </button>
            <button
                type="button"
                title="복사"
                onClick={onCopy}
                disabled={!hasResult || !onCopy}
                className="px-3 py-2 rounded-xl text-blue-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5"
            >
                <Copy className="w-4 h-4" />
                <span className="hidden sm:inline">복사</span>
            </button>
            <button
                type="button"
                title={isRewriting ? 'AI가 보완하는 중입니다' : '현재 내용 기반 보완'}
                onClick={onRewrite}
                disabled={!onRewrite || !hasResult || isRewriting || rewriteDisabled}
                aria-busy={isRewriting}
                className="px-3 py-2 rounded-xl text-rose-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5"
            >
                {isRewriting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                <span className="hidden sm:inline">{isRewriting ? '보완 중…' : '현재 내용 기반 보완'}</span>
            </button>
            <button
                type="button"
                title="초기화"
                onClick={onReset}
                disabled={!hasResult || !onReset || isRewriting}
                className="px-3 py-2 rounded-xl text-white/45 hover:text-red-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed text-xs font-bold flex items-center gap-1.5"
            >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">초기화</span>
            </button>
        </div>
    );
}
