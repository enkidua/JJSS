import { Loader2, RotateCcw, Save, Sparkles } from 'lucide-react';
import { CopyButton } from '../../components/common/CopyButton';

/** 면접일지·직무분석지 공용 "작성 결과" 영역 */
export function EmploymentResultPanel({
    description,
    result,
    setResult,
    placeholder,
    busy,
    isGenerating,
    isRefining,
    isSaving,
    onRefine,
    onSave,
    onReset,
}: {
    description: string;
    result: string;
    setResult: (value: string) => void;
    placeholder: string;
    busy: boolean;
    isGenerating: boolean;
    isRefining: boolean;
    isSaving: boolean;
    onRefine: () => void;
    onSave: () => void;
    onReset: () => void;
}) {
    const hasResult = !!result.trim();
    const aiRunning = isGenerating || isRefining;
    return (
        <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl flex flex-col min-h-[720px]">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                    <h3 className="font-black text-white">작성 결과</h3>
                    <p className="text-xs text-white/35 mt-1">{description}</p>
                </div>
                <div className="flex items-center gap-1 rounded-2xl bg-slate-900/70 border border-white/10 p-1.5">
                    <button type="button" onClick={onRefine} disabled={!hasResult || busy} className="p-2 rounded-xl text-amber-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" title="현재 내용 기반 보완" aria-label="현재 내용 기반 보완">
                        {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    </button>
                    <button type="button" onClick={onSave} disabled={!hasResult || busy} className="p-2 rounded-xl text-emerald-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" title={isSaving ? '저장 중' : '저장'} aria-label={isSaving ? '저장 중' : '저장'}>
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </button>
                    <CopyButton text={result} label="복사" iconOnly disabled={!hasResult} className="p-2 rounded-xl text-blue-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" />
                    <button type="button" onClick={onReset} disabled={!hasResult || busy} className="p-2 rounded-xl text-rose-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" title="초기화" aria-label="작성 결과 비우기"><RotateCcw className="w-4 h-4" /></button>
                </div>
            </div>
            <textarea
                value={result}
                onChange={e => setResult(e.target.value)}
                readOnly={aiRunning}
                aria-busy={aiRunning}
                placeholder={placeholder}
                className="textarea-field !bg-black/30 border-white/10 flex-1 min-h-[580px] text-sm leading-relaxed resize-none"
            />
        </div>
    );
}
