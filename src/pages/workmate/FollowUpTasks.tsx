import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { getTaskTiming, localDateKey, type FollowUpTask } from '../../config/rehabWorkflow';
import type { RehabWorkflowRecord } from './useRehabWorkflowRecord';

type Category = NonNullable<FollowUpTask['category']>;

const CATEGORY_LABELS: Record<Category, string> = { counseling: '후속 상담', reevaluation: '재평가', employment: '취업 후 점검', other: '기타' };
const CATEGORY_ORDER: Category[] = ['other', 'counseling', 'reevaluation', 'employment'];
const TIMING_LABELS = { overdue: '기한 지남', today: '오늘', upcoming: '7일 이내', later: '예정' } as const;

interface Props {
    record: RehabWorkflowRecord;
    onDirtyChange: (dirty: boolean) => void;
}

/** 후속 일정 추가·완료·다시 열기(이전 현황판에서 옮김). 현황 기록(RehabWorkflowData.tasks)에 저장합니다. */
export function FollowUpTasks({ record, onDirtyChange }: Props) {
    const { workflow, save, unavailable } = record;
    const [title, setTitle] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [category, setCategory] = useState<Category>('other');
    const today = localDateKey();
    const openTasks = useMemo(() => workflow.tasks.filter(task => !task.done)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [workflow.tasks]);
    const doneTasks = useMemo(() => workflow.tasks.filter(task => task.done), [workflow.tasks]);

    useEffect(() => { onDirtyChange(!!(title || dueDate || category !== 'other')); }, [title, dueDate, category, onDirtyChange]);

    const setDone = (taskId: string, done: boolean) => void save({
        ...workflow, tasks: workflow.tasks.map(item => (item.id === taskId ? { ...item, done } : item)),
    }, done ? '완료 상태를 저장했습니다.' : '일정을 다시 진행 중으로 표시했습니다.');

    return <section aria-labelledby="followup-tasks-title">
        <h3 id="followup-tasks-title" className="text-lg font-bold text-white flex items-center gap-2"><CalendarDays className="w-5 h-5 text-accent-300" aria-hidden="true" /> 후속 일정</h3>
        <p className="text-sm text-white/50 mt-1 mb-4">지나간 일정과 7일 이내 일정을 먼저 보여줍니다. 완료 표시를 해도 기록은 남습니다.</p>
        <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_11rem_auto] items-end" onSubmit={async event => {
            event.preventDefault();
            if (!title.trim() || !dueDate) return;
            const next = { ...workflow, tasks: [...workflow.tasks, { id: crypto.randomUUID(), title: title.trim(), dueDate, done: false, category }] };
            if (await save(next, '후속 일정을 저장했습니다.')) { setTitle(''); setDueDate(''); setCategory('other'); }
        }}>
            <label className="text-sm text-white/70">할 일<input className="input-field mt-1" value={title} maxLength={120} onChange={event => setTitle(event.target.value)} placeholder="예: 현장실습 결과 확인" required disabled={unavailable} /></label>
            <label className="text-sm text-white/70">일정 종류<select className="input-field mt-1" value={category} onChange={event => setCategory(event.target.value as Category)} disabled={unavailable}>
                {CATEGORY_ORDER.map(key => <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>)}
            </select></label>
            <label className="text-sm text-white/70">예정일<input className="input-field mt-1" type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} required disabled={unavailable} /></label>
            <button type="submit" className="btn-primary !px-4 !py-3" disabled={unavailable}>일정 추가</button>
        </form>
        <div className="mt-5 space-y-2">
            {openTasks.length === 0 && <p className="text-sm text-white/50 py-3">진행 중인 후속 일정이 없습니다.</p>}
            {openTasks.map(task => {
                const timing = getTaskTiming(task.dueDate, today);
                return <div key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
                    <span className={`text-xs font-bold rounded-full px-2 py-1 ${timing === 'overdue' ? 'bg-red-500/20 text-red-200' : timing === 'today' ? 'bg-amber-500/20 text-amber-200' : 'bg-accent-500/10 text-accent-200'}`}>{TIMING_LABELS[timing]}</span>
                    <span className="text-white flex-1 min-w-40 break-words"><span className="text-white/50 text-xs mr-2">{CATEGORY_LABELS[task.category || 'other']}</span>{task.title}</span>
                    <time className="text-sm text-white/60" dateTime={task.dueDate}>{task.dueDate}</time>
                    <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" disabled={unavailable} onClick={() => setDone(task.id, true)}>완료</button>
                </div>;
            })}
            {doneTasks.length > 0 && <details className="text-sm text-white/60 pt-2"><summary className="cursor-pointer">완료한 일정 {doneTasks.length}건</summary>
                <ul className="mt-2 space-y-2">{doneTasks.map(task => <li key={task.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                    <span className="flex-1 text-white/60 line-through">{task.title}</span><time dateTime={task.dueDate}>{task.dueDate}</time>
                    <button type="button" disabled={unavailable} className="text-accent-300 underline" onClick={() => setDone(task.id, false)}>다시 열기</button>
                </li>)}</ul>
            </details>}
        </div>
    </section>;
}
