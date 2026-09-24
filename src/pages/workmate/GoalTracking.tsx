import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { caseDocumentDate, localDateKey, type RehabGoal } from '../../config/rehabWorkflow';
import type { RehabWorkflowRecord } from './useRehabWorkflowRecord';

interface Props {
    record: RehabWorkflowRecord;
    onDirtyChange: (dirty: boolean) => void;
}

function latestGoalLevel(goal: RehabGoal): string {
    return [...goal.checkIns].sort((a, b) => b.date.localeCompare(a.date))
        .find(entry => entry.currentLevel?.trim())?.currentLevel || '수준 미기록';
}

/** 목표 추가와 날짜별 변화 기록(이전 현황판에서 옮김). 현황 기록(RehabWorkflowData.goals)에 저장합니다. */
export function GoalTracking({ record, onDirtyChange }: Props) {
    const { workflow, documents, save, unavailable } = record;
    const [goalTitle, setGoalTitle] = useState('');
    const [goalBaseline, setGoalBaseline] = useState('');
    const [goalTarget, setGoalTarget] = useState('');
    const [goalSourceId, setGoalSourceId] = useState('');
    const [checkInNotes, setCheckInNotes] = useState<Record<string, string>>({});
    const [checkInLevels, setCheckInLevels] = useState<Record<string, string>>({});
    const [checkInDates, setCheckInDates] = useState<Record<string, string>>({});
    const planDocuments = documents.filter(doc => doc.type === 'plan' && doc.id);
    const documentDate = (id: string) => {
        const doc = documents.find(item => item.id === id);
        return doc ? caseDocumentDate(doc) || '-' : '원본 확인 필요';
    };

    useEffect(() => {
        onDirtyChange(!!(goalTitle || goalBaseline || goalTarget || goalSourceId
            || Object.values(checkInNotes).some(Boolean) || Object.values(checkInLevels).some(Boolean)
            || Object.values(checkInDates).some(Boolean)));
    }, [goalTitle, goalBaseline, goalTarget, goalSourceId, checkInNotes, checkInLevels, checkInDates, onDirtyChange]);

    return <section aria-labelledby="goal-tracking-title">
        <h3 id="goal-tracking-title" className="text-lg font-bold text-white flex items-center gap-2"><Target className="w-5 h-5 text-violet-300" aria-hidden="true" /> 목표 변화 기록</h3>
        <p className="text-sm text-white/50 mt-1 mb-4">출발점과 목표를 적고, 관찰 결과를 날짜별로 누적합니다. 이전 기록은 유지됩니다.</p>
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={async event => {
            event.preventDefault();
            if (!goalTitle.trim() || !goalBaseline.trim() || !goalTarget.trim()) return;
            const next = { ...workflow, goals: [...workflow.goals, { id: crypto.randomUUID(), title: goalTitle.trim(), baseline: goalBaseline.trim(), target: goalTarget.trim(), checkIns: [], ...(goalSourceId ? { sourceDocumentId: goalSourceId } : {}) }] };
            if (await save(next, '추적 목표를 저장했습니다.')) { setGoalTitle(''); setGoalBaseline(''); setGoalTarget(''); setGoalSourceId(''); }
        }}>
            <label className="text-sm text-white/70">목표명<input className="input-field mt-1" value={goalTitle} maxLength={100} onChange={event => setGoalTitle(event.target.value)} placeholder="예: 출근 준비" required disabled={unavailable} /></label>
            <label className="text-sm text-white/70">출발점<input className="input-field mt-1" value={goalBaseline} maxLength={200} onChange={event => setGoalBaseline(event.target.value)} placeholder="현재 상태" required disabled={unavailable} /></label>
            <label className="text-sm text-white/70">목표 상태<input className="input-field mt-1" value={goalTarget} maxLength={200} onChange={event => setGoalTarget(event.target.value)} placeholder="달성 기준" required disabled={unavailable} /></label>
            <label className="text-sm text-white/70 sm:col-span-3">연결할 직업재활계획서(선택)<select className="input-field mt-1" value={goalSourceId} onChange={event => setGoalSourceId(event.target.value)} disabled={unavailable}>
                <option value="">별도 기록 · 계획서 연결 없음</option>
                {planDocuments.map(doc => <option key={doc.id} value={doc.id}>{caseDocumentDate(doc) || '-'} 작성 계획서</option>)}
            </select></label>
            <div className="sm:col-span-3"><button type="submit" className="btn-primary !px-4 !py-2" disabled={unavailable}>목표 추가</button></div>
        </form>
        <div className="mt-5 space-y-4">
            {workflow.goals.length === 0 && <p className="text-sm text-white/50">아직 추적 목표가 없습니다.</p>}
            {workflow.goals.map(goal => <article key={goal.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
                <h4 className="font-semibold text-white break-words">{goal.title}</h4>
                <div className="grid sm:grid-cols-3 gap-2 mt-2 text-sm"><p className="text-white/70 break-words">출발점: {goal.baseline}</p><p className="text-violet-200 break-words">현재: {latestGoalLevel(goal)}</p><p className="text-white/70 break-words">목표: {goal.target}</p></div>
                {goal.sourceDocumentId && <p className="text-xs text-white/50 mt-2">연결 계획서: {documentDate(goal.sourceDocumentId)}</p>}
                <div className="mt-3 border-l-2 border-violet-500/30 pl-3 space-y-2">
                    {goal.checkIns.length === 0 && <p className="text-sm text-white/50">기록된 변화가 없습니다.</p>}
                    {[...goal.checkIns].sort((a, b) => b.date.localeCompare(a.date)).map(entry => <p key={entry.id} className="text-sm text-white/75 break-words"><time dateTime={entry.date} className="text-violet-300 mr-2">{entry.date}</time>{entry.currentLevel && <span className="text-white/90 mr-2">현재 {entry.currentLevel}</span>}{entry.note}</p>)}
                </div>
                <form className="grid gap-2 mt-4 sm:grid-cols-[9rem_12rem_1fr_auto] items-end" onSubmit={async event => {
                    event.preventDefault();
                    const note = checkInNotes[goal.id]?.trim();
                    const currentLevel = checkInLevels[goal.id]?.trim();
                    if (!note || !currentLevel) return;
                    const next = { ...workflow, goals: workflow.goals.map(item => item.id === goal.id ? { ...item, checkIns: [...item.checkIns, { id: crypto.randomUUID(), date: checkInDates[goal.id] || localDateKey(), note, currentLevel }] } : item) };
                    if (await save(next, '목표 변화 기록을 저장했습니다.')) {
                        setCheckInNotes(current => ({ ...current, [goal.id]: '' }));
                        setCheckInLevels(current => ({ ...current, [goal.id]: '' }));
                        setCheckInDates(current => ({ ...current, [goal.id]: '' }));
                    }
                }}>
                    <label className="text-xs text-white/65">관찰일<input type="date" className="input-field mt-1" value={checkInDates[goal.id] || localDateKey()} onChange={event => setCheckInDates(current => ({ ...current, [goal.id]: event.target.value }))} required disabled={unavailable} /></label>
                    <label className="text-xs text-white/65">현재 수준<input className="input-field mt-1" value={checkInLevels[goal.id] || ''} maxLength={200} onChange={event => setCheckInLevels(current => ({ ...current, [goal.id]: event.target.value }))} placeholder="예: 혼자 3회 수행" required disabled={unavailable} /></label>
                    <label className="text-xs text-white/65" htmlFor={`goal-checkin-${goal.id}`}>{goal.title} 관찰 근거<input id={`goal-checkin-${goal.id}`} className="input-field mt-1" value={checkInNotes[goal.id] || ''} maxLength={500} onChange={event => setCheckInNotes(current => ({ ...current, [goal.id]: event.target.value }))} placeholder="직접 확인한 사례·근거" required disabled={unavailable} /></label>
                    <button type="submit" className="btn-secondary !px-4 !py-2" disabled={unavailable}>변화 기록</button>
                </form>
            </article>)}
        </div>
    </section>;
}
