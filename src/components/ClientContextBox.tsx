import type { ReactNode } from 'react';
import { Clock, Loader2 } from 'lucide-react';

export type ClientContextTone = 'sky' | 'emerald';

// Tailwind가 클래스를 찾을 수 있도록 색상 조합은 고정 문자열로 둡니다.
const TONE_CLASSES: Record<ClientContextTone, { box: string; title: string }> = {
    sky: { box: 'border-sky-400/20 bg-sky-500/10', title: 'text-sky-100' },
    emerald: { box: 'border-emerald-400/20 bg-emerald-500/10', title: 'text-emerald-100' },
};

const DEFAULT_DESCRIPTION = '버튼을 눌렀을 때만 같은 이용자의 최근 직업훈련 및 고용지원 기록을 문서 생성 참고자료로 포함합니다. 원본 문서는 수정하지 않습니다.';

export interface ClientContextBoxProps {
    summary: string;
    loading: boolean;
    onLoad: () => void;
    onClear: () => void;
    /** 화면별 색상. 고용지원은 sky, 직업훈련은 emerald */
    tone?: ClientContextTone;
    description?: ReactNode;
    className?: string;
    /** 문서 생성 중처럼 참고자료를 바꾸면 안 될 때 */
    disabled?: boolean;
}

/** "통합 참고자료" 상자 — useClientContext 훅과 함께 사용합니다. */
export function ClientContextBox({
    summary,
    loading,
    onLoad,
    onClear,
    tone = 'sky',
    description = DEFAULT_DESCRIPTION,
    className = '',
    disabled = false,
}: ClientContextBoxProps) {
    const toneClasses = TONE_CLASSES[tone];
    return (
        <div className={`rounded-2xl border p-4 ${toneClasses.box} ${className}`}>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <p className={`text-sm font-black ${toneClasses.title}`}>통합 참고자료</p>
                    <p className="text-xs text-white/45 mt-1">{description}</p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onLoad}
                        disabled={loading || disabled}
                        aria-busy={loading}
                        className="btn-secondary !py-2 flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Clock className="w-4 h-4" aria-hidden="true" />}
                        최근 기록 참고
                    </button>
                    {summary && (
                        <button
                            type="button"
                            onClick={onClear}
                            disabled={disabled}
                            className="btn-ghost !bg-white/5 border border-white/10 !py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            참고자료 제외
                        </button>
                    )}
                </div>
            </div>
            {summary && (
                <pre className="mt-4 max-h-56 overflow-y-auto rounded-2xl bg-black/25 border border-white/10 p-4 text-xs leading-relaxed text-white/70 whitespace-pre-wrap font-sans">
                    {summary}
                </pre>
            )}
        </div>
    );
}

export default ClientContextBox;
