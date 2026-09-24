import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import type { Seeker } from '../../types/matching';
import type { NextAction } from '../../config/rehabOverview';

const TIMING_LABELS: Record<NextAction['timing'], string> = { overdue: '기한 지남', today: '오늘', upcoming: '7일 이내' };
const TIMING_STYLES: Record<NextAction['timing'], string> = {
    overdue: 'bg-red-500/20 text-red-200', today: 'bg-amber-500/20 text-amber-200', upcoming: 'bg-accent-500/10 text-accent-200',
};
const CATEGORY_LABELS: Record<string, string> = { counseling: '후속 상담', reevaluation: '재평가', employment: '취업 후 점검', other: '기타' };

interface Props {
    seeker: Seeker;
    actions: NextAction[];
    disabled: boolean;
    onComplete: (taskId: string) => void;
}

/** 기한 지남·오늘·이번 주 후속 일정. 여기서는 완료 표시만 하고, 추가·편집은 고용지원 화면에서 합니다. */
export function NextActions({ seeker, actions, disabled, onComplete }: Props) {
    const navigate = useNavigate();
    return <section className="glass-card !p-5" aria-labelledby="next-actions-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="next-actions-title" className="text-xl font-bold text-white flex items-center gap-2"><CalendarDays className="w-5 h-5 text-accent-300" aria-hidden="true" /> 다음 할 일</h2>
            <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm"
                onClick={() => navigate('/workmate', { state: { seekerId: seeker.id || seeker.seekerId, seekerName: seeker.name, tab: 'pipeline', step: 'workflow' } })}>
                일정 추가·편집
            </button>
        </div>
        <p className="text-xs text-white/50 mt-1">기한이 지났거나 7일 이내인 미완료 일정입니다. 완료 표시를 해도 기록은 남습니다.</p>
        {actions.length === 0
            ? <p className="text-sm text-white/50 mt-4">가까운 미완료 일정이 없습니다.</p>
            : <ul className="mt-4 space-y-2">{actions.map(({ task, timing }) => <li key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
                <input id={`next-action-${task.id}`} type="checkbox" className="w-5 h-5 accent-emerald-400" checked={false} disabled={disabled}
                    onChange={() => onComplete(task.id)} />
                <label htmlFor={`next-action-${task.id}`} className="flex-1 min-w-40 text-white break-words cursor-pointer">
                    <span className="text-white/50 text-xs mr-2">{CATEGORY_LABELS[task.category || 'other']}</span>{task.title}
                    <span className="sr-only"> 완료 표시</span>
                </label>
                <span className={`text-xs font-bold rounded-full px-2 py-1 ${TIMING_STYLES[timing]}`}>{TIMING_LABELS[timing]}</span>
                <time className="text-sm text-white/60" dateTime={task.dueDate}>{task.dueDate}</time>
            </li>)}</ul>}
    </section>;
}
