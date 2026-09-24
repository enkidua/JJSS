import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History } from 'lucide-react';
import type { TimelineEntry, TimelineKind } from '../../config/rehabOverview';

const PAGE_SIZE = 15;

const KIND_STYLES: Partial<Record<TimelineKind, string>> = {
    meeting: 'bg-blue-500/15 text-blue-200', plan: 'bg-indigo-500/15 text-indigo-200', counseling: 'bg-teal-500/15 text-teal-200',
    evaluation: 'bg-sky-500/15 text-sky-200', vocational_evaluation: 'bg-sky-500/15 text-sky-200',
    matching: 'bg-emerald-500/15 text-emerald-200', interview: 'bg-emerald-500/15 text-emerald-200',
    job_analysis: 'bg-lime-500/15 text-lime-200', job_comparison: 'bg-lime-500/15 text-lime-200',
    training_counseling: 'bg-violet-500/15 text-violet-200', employment_check: 'bg-amber-500/15 text-amber-200',
};

/** 모든 사례문서·훈련 상담·적응지원 기록을 날짜 역순으로 보여 줍니다. 누르면 기록을 작성한 화면으로 이동합니다. */
export function CaseTimeline({ entries }: { entries: TimelineEntry[] }) {
    const navigate = useNavigate();
    const [visible, setVisible] = useState(PAGE_SIZE);
    return <section className="glass-card !p-5" aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="text-xl font-bold text-white flex items-center gap-2"><History className="w-5 h-5 text-blue-300" aria-hidden="true" /> 타임라인</h2>
        <p className="text-xs text-white/50 mt-1">최근 기록부터 표시합니다. 항목을 누르면 해당 화면으로 이동합니다.</p>
        {entries.length === 0
            ? <p className="text-sm text-white/50 mt-4">아직 기록이 없습니다.</p>
            : <ol className="mt-4 space-y-1">{entries.slice(0, visible).map(entry => <li key={entry.id}>
                <button type="button" onClick={() => navigate(entry.target.path, { state: entry.target.state })}
                    className="w-full flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/5 focus-visible:bg-white/5">
                    <time className="text-white/55 w-24 shrink-0" dateTime={entry.date || undefined}>{entry.date || '날짜 미확인'}</time>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold shrink-0 ${KIND_STYLES[entry.kind] || 'bg-white/10 text-white/70'}`}>{entry.label}</span>
                    <span className="text-white/80 flex-1 min-w-0 truncate">{entry.summary || '내용 없음'}</span>
                </button>
            </li>)}</ol>}
        {entries.length > visible && <button type="button" className="text-sm text-accent-300 underline mt-3"
            onClick={() => setVisible(current => current + PAGE_SIZE)}>이전 기록 더 보기 ({entries.length - visible}건 남음)</button>}
    </section>;
}
