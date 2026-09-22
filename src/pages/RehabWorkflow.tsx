import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, ClipboardList, FileText, Target } from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import type { CaseDocument } from '../types/caseDocument';
import {
    EMPTY_REHAB_WORKFLOW, getTaskTiming, localDateKey, parseRehabWorkflow,
    type RehabWorkflowData,
} from '../config/rehabWorkflow';

const documentLabels: Record<string, string> = {
    meeting: '사례회의록', plan: '직업재활계획서', counseling: '상담일지',
    evaluation: '정기평가', matching_opinion: '매칭 의견', interview_note: '면접일지',
};

function documentDate(doc: CaseDocument): string {
    const seconds = doc.updatedAt?.seconds ?? doc.createdAt?.seconds;
    return typeof seconds === 'number' ? localDateKey(new Date(seconds * 1000)) : '-';
}

export default function RehabWorkflow() {
    const seekers = useDataStore(state => state.seekers);
    const fetchCaseDocuments = useDataStore(state => state.fetchCaseDocuments);
    const addCaseDocument = useDataStore(state => state.addCaseDocument);
    const updateCaseDocument = useDataStore(state => state.updateCaseDocument);
    const [params, setParams] = useSearchParams();
    const selectedId = params.get('seekerId') || '';
    const selectedSeeker = seekers.find(seeker => seeker.id === selectedId);
    const [workflow, setWorkflow] = useState<RehabWorkflowData>(EMPTY_REHAB_WORKFLOW);
    const [workflowDocId, setWorkflowDocId] = useState<string | null>(null);
    const [documents, setDocuments] = useState<CaseDocument[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [corrupt, setCorrupt] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskDate, setTaskDate] = useState('');
    const [goalTitle, setGoalTitle] = useState('');
    const [goalBaseline, setGoalBaseline] = useState('');
    const [goalTarget, setGoalTarget] = useState('');
    const [checkInNotes, setCheckInNotes] = useState<Record<string, string>>({});
    const loadSequence = useRef(0);
    const savingRef = useRef(false);
    const today = localDateKey();

    useEffect(() => {
        const sequence = ++loadSequence.current;
        setWorkflow(EMPTY_REHAB_WORKFLOW);
        setWorkflowDocId(null);
        setDocuments([]);
        setError('');
        setNotice('');
        setCorrupt(false);
        setLoadFailed(false);
        setTaskTitle('');
        setTaskDate('');
        setGoalTitle('');
        setGoalBaseline('');
        setGoalTarget('');
        setCheckInNotes({});
        if (!selectedSeeker) {
            setLoading(false);
            return;
        }
        setLoading(true);
        fetchCaseDocuments(selectedSeeker).then(docs => {
            if (sequence !== loadSequence.current) return;
            const saved = docs.find(doc => doc.type === 'workflow');
            if (saved) {
                const parsed = parseRehabWorkflow(saved.content);
                if (!parsed) {
                    setCorrupt(true);
                    setError('현황 기록 형식을 읽을 수 없습니다. 기존 기록을 덮어쓰지 않았습니다. 백업을 확인해 주세요.');
                } else {
                    setWorkflow(parsed);
                    setWorkflowDocId(saved.id || null);
                }
            }
            setDocuments(docs.filter(doc => doc.type !== 'workflow'));
        }).catch(() => {
            if (sequence === loadSequence.current) {
                setLoadFailed(true);
                setError('이용자 기록을 불러오지 못했습니다. 다시 선택하거나 데이터 상태를 확인해 주세요.');
            }
        }).finally(() => {
            if (sequence === loadSequence.current) setLoading(false);
        });
        return () => { loadSequence.current++; };
    }, [selectedSeeker?.id, fetchCaseDocuments]);

    const openTasks = useMemo(() => workflow.tasks.filter(task => !task.done)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [workflow.tasks]);
    const doneTasks = useMemo(() => workflow.tasks.filter(task => task.done), [workflow.tasks]);
    const overdue = openTasks.filter(task => getTaskTiming(task.dueDate, today) === 'overdue').length;
    const dueSoon = openTasks.filter(task => ['today', 'upcoming'].includes(getTaskTiming(task.dueDate, today))).length;

    async function save(next: RehabWorkflowData, success: string): Promise<boolean> {
        if (!selectedSeeker || loading || corrupt || savingRef.current) return false;
        savingRef.current = true;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            const content = JSON.stringify(next);
            if (workflowDocId) {
                await updateCaseDocument(workflowDocId, content);
            } else {
                const saved = await addCaseDocument({
                    seekerId: selectedSeeker.id || selectedSeeker.seekerId || '',
                    seekerName: selectedSeeker.name,
                    type: 'workflow', tab: 'case', content, source: 'case',
                });
                if (!saved.id) throw new Error('저장된 기록의 ID를 확인할 수 없습니다.');
                setWorkflowDocId(saved.id);
            }
            setWorkflow(next);
            setNotice(success);
            return true;
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '저장하지 못했습니다. 입력 내용은 유지됩니다.');
            return false;
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }

    const unavailable = !selectedSeeker || loading || saving || corrupt || loadFailed;

    return (
        <main className="min-h-screen px-4 py-8">
            <div className="max-w-6xl mx-auto space-y-6">
                <div>
                    <div className="flex items-center gap-2 text-accent-300 text-sm mb-2"><ClipboardList className="w-4 h-4" /> 이용자별 업무 현황</div>
                    <h1 className="section-title">직업재활 현황판</h1>
                    <p className="text-white/60 mt-2">후속 일정과 목표 변화를 이용자별로 기록하고, 작성된 사례문서를 함께 확인합니다.</p>
                </div>

                <div className="glass-card !p-5">
                    <label htmlFor="workflow-seeker" className="block text-sm font-semibold text-white/80 mb-2">이용자 선택</label>
                    <select id="workflow-seeker" className="input-field" value={selectedId} disabled={saving}
                        onChange={event => setParams(event.target.value ? { seekerId: event.target.value } : {})}>
                        <option value="">이용자를 선택하세요</option>
                        {seekers.filter(seeker => seeker.id).map(seeker => (
                            <option key={seeker.id} value={seeker.id}>{seeker.name} · {seeker.seekerId || 'ID 없음'}</option>
                        ))}
                    </select>
                    {seekers.length === 0 && <p className="text-sm text-white/60 mt-3">등록된 이용자가 없습니다. <Link to="/manage" className="text-accent-300 underline">이용자 관리로 이동</Link></p>}
                    {selectedId && !selectedSeeker && <p className="text-sm text-amber-300 mt-3">선택한 이용자를 찾을 수 없습니다. 목록에서 다시 선택해 주세요.</p>}
                </div>

                {loading && <p role="status" className="text-white/60">이용자 기록을 불러오는 중...</p>}
                {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200">{error}</p>}
                {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-200">{notice}</p>}

                {selectedSeeker && !loading && !corrupt && (
                    <>
                        <div className="grid gap-3 sm:grid-cols-4" aria-label="현황 요약">
                            {[
                                ['진행 중 후속 일정', openTasks.length], ['기한 지남', overdue],
                                ['오늘·7일 이내', dueSoon], ['추적 목표', workflow.goals.length],
                            ].map(([label, count]) => (
                                <div key={label} className="glass-card !p-4"><p className="text-sm text-white/60">{label}</p><p className="text-2xl font-bold text-white mt-1">{count}</p></div>
                            ))}
                        </div>

                        <section className="glass-card !p-5" aria-labelledby="followup-title">
                            <h2 id="followup-title" className="text-xl font-bold text-white flex items-center gap-2"><CalendarDays className="w-5 h-5 text-accent-300" /> 후속 일정</h2>
                            <p className="text-sm text-white/50 mt-1 mb-4">지나간 일정과 7일 이내 일정을 먼저 보여줍니다. 완료 표시를 해도 기록은 남습니다.</p>
                            <form className="grid gap-3 sm:grid-cols-[1fr_11rem_auto] items-end" onSubmit={async event => {
                                event.preventDefault();
                                if (!taskTitle.trim() || !taskDate) return;
                                const next = { ...workflow, tasks: [...workflow.tasks, { id: crypto.randomUUID(), title: taskTitle.trim(), dueDate: taskDate, done: false }] };
                                if (await save(next, '후속 일정을 저장했습니다.')) { setTaskTitle(''); setTaskDate(''); }
                            }}>
                                <label className="text-sm text-white/70">할 일<input className="input-field mt-1" value={taskTitle} maxLength={120} onChange={event => setTaskTitle(event.target.value)} placeholder="예: 현장실습 결과 확인" required disabled={unavailable} /></label>
                                <label className="text-sm text-white/70">예정일<input className="input-field mt-1" type="date" value={taskDate} onChange={event => setTaskDate(event.target.value)} required disabled={unavailable} /></label>
                                <button type="submit" className="btn-primary !px-4 !py-3" disabled={unavailable}>일정 추가</button>
                            </form>
                            <div className="mt-5 space-y-2">
                                {openTasks.length === 0 && <p className="text-sm text-white/50 py-3">진행 중인 후속 일정이 없습니다.</p>}
                                {openTasks.map(task => {
                                    const timing = getTaskTiming(task.dueDate, today);
                                    return <div key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3">
                                        <span className={`text-xs font-bold rounded-full px-2 py-1 ${timing === 'overdue' ? 'bg-red-500/20 text-red-200' : timing === 'today' ? 'bg-amber-500/20 text-amber-200' : 'bg-accent-500/10 text-accent-200'}`}>{timing === 'overdue' ? '기한 지남' : timing === 'today' ? '오늘' : timing === 'upcoming' ? '7일 이내' : '예정'}</span>
                                        <span className="text-white flex-1 min-w-40 break-words">{task.title}</span><time className="text-sm text-white/60" dateTime={task.dueDate}>{task.dueDate}</time>
                                        <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" disabled={unavailable} onClick={() => save({ ...workflow, tasks: workflow.tasks.map(item => item.id === task.id ? { ...item, done: true } : item) }, '완료 상태를 저장했습니다.')}>완료</button>
                                    </div>;
                                })}
                                {doneTasks.length > 0 && <details className="text-sm text-white/60 pt-2"><summary className="cursor-pointer">완료한 일정 {doneTasks.length}건</summary><ul className="mt-2 space-y-2">{doneTasks.map(task => <li key={task.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2"><span className="flex-1 text-white/60 line-through">{task.title}</span><time dateTime={task.dueDate}>{task.dueDate}</time><button type="button" disabled={unavailable} className="text-accent-300 underline" onClick={() => save({ ...workflow, tasks: workflow.tasks.map(item => item.id === task.id ? { ...item, done: false } : item) }, '일정을 다시 진행 중으로 표시했습니다.')}>다시 열기</button></li>)}</ul></details>}
                            </div>
                        </section>

                        <section className="glass-card !p-5" aria-labelledby="goal-title">
                            <h2 id="goal-title" className="text-xl font-bold text-white flex items-center gap-2"><Target className="w-5 h-5 text-violet-300" /> 목표 변화 추적</h2>
                            <p className="text-sm text-white/50 mt-1 mb-4">출발점과 목표를 적고, 관찰 결과를 날짜별로 누적합니다. 이전 기록은 유지됩니다.</p>
                            <form className="grid gap-3 sm:grid-cols-3" onSubmit={async event => {
                                event.preventDefault();
                                if (!goalTitle.trim() || !goalBaseline.trim() || !goalTarget.trim()) return;
                                const next = { ...workflow, goals: [...workflow.goals, { id: crypto.randomUUID(), title: goalTitle.trim(), baseline: goalBaseline.trim(), target: goalTarget.trim(), checkIns: [] }] };
                                if (await save(next, '추적 목표를 저장했습니다.')) { setGoalTitle(''); setGoalBaseline(''); setGoalTarget(''); }
                            }}>
                                <label className="text-sm text-white/70">목표명<input className="input-field mt-1" value={goalTitle} maxLength={100} onChange={event => setGoalTitle(event.target.value)} placeholder="예: 출근 준비" required disabled={unavailable} /></label>
                                <label className="text-sm text-white/70">출발점<input className="input-field mt-1" value={goalBaseline} maxLength={200} onChange={event => setGoalBaseline(event.target.value)} placeholder="현재 상태" required disabled={unavailable} /></label>
                                <label className="text-sm text-white/70">목표 상태<input className="input-field mt-1" value={goalTarget} maxLength={200} onChange={event => setGoalTarget(event.target.value)} placeholder="달성 기준" required disabled={unavailable} /></label>
                                <div className="sm:col-span-3"><button type="submit" className="btn-primary !px-4 !py-2" disabled={unavailable}>목표 추가</button></div>
                            </form>
                            <div className="mt-5 space-y-4">
                                {workflow.goals.length === 0 && <p className="text-sm text-white/50">아직 추적 목표가 없습니다.</p>}
                                {workflow.goals.map(goal => <article key={goal.id} className="rounded-xl bg-white/5 border border-white/10 p-4">
                                    <h3 className="font-semibold text-white break-words">{goal.title}</h3>
                                    <p className="text-sm text-white/70 mt-2 break-words">출발점: {goal.baseline}</p><p className="text-sm text-white/70 break-words">목표: {goal.target}</p>
                                    <div className="mt-3 border-l-2 border-violet-500/30 pl-3 space-y-2">
                                        {goal.checkIns.length === 0 && <p className="text-sm text-white/50">기록된 변화가 없습니다.</p>}
                                        {goal.checkIns.map(entry => <p key={entry.id} className="text-sm text-white/75 break-words"><time dateTime={entry.date} className="text-violet-300 mr-2">{entry.date}</time>{entry.note}</p>)}
                                    </div>
                                    <form className="flex flex-col sm:flex-row gap-2 mt-4" onSubmit={async event => {
                                        event.preventDefault();
                                        const note = checkInNotes[goal.id]?.trim();
                                        if (!note) return;
                                        const next = { ...workflow, goals: workflow.goals.map(item => item.id === goal.id ? { ...item, checkIns: [...item.checkIns, { id: crypto.randomUUID(), date: localDateKey(), note }] } : item) };
                                        if (await save(next, '목표 변화 기록을 저장했습니다.')) setCheckInNotes(current => ({ ...current, [goal.id]: '' }));
                                    }}>
                                        <label className="sr-only" htmlFor={`goal-checkin-${goal.id}`}>{goal.title} 변화 기록</label>
                                        <input id={`goal-checkin-${goal.id}`} className="input-field flex-1" value={checkInNotes[goal.id] || ''} maxLength={500} onChange={event => setCheckInNotes(current => ({ ...current, [goal.id]: event.target.value }))} placeholder="오늘 관찰한 변화 또는 진행 상황" required disabled={unavailable} />
                                        <button type="submit" className="btn-secondary !px-4 !py-2" disabled={unavailable}>변화 기록</button>
                                    </form>
                                </article>)}
                            </div>
                        </section>

                        <section className="glass-card !p-5" aria-labelledby="history-title">
                            <h2 id="history-title" className="text-xl font-bold text-white flex items-center gap-2"><FileText className="w-5 h-5 text-blue-300" /> 작성된 사례문서</h2>
                            <p className="text-sm text-white/50 mt-1 mb-4">기존 사례문서와 연결된 기록입니다. 작성·수정은 고용지원 메뉴에서 계속할 수 있습니다.</p>
                            {documents.length === 0 ? <p className="text-sm text-white/50">아직 작성된 사례문서가 없습니다.</p> : <ul className="space-y-2">{documents.slice(0, 10).map(doc => <li key={doc.id} className="flex gap-3 justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"><span className="text-white/80">{documentLabels[doc.type] || '업무 문서'}</span><time className="text-white/50">{documentDate(doc)}</time></li>)}</ul>}
                            {documents.length > 10 && <p className="text-xs text-white/50 mt-2">최근 10건을 표시합니다. 전체 기록은 고용지원에서 확인하세요.</p>}
                            <Link to="/workmate" className="inline-flex text-accent-300 underline mt-4 text-sm">고용지원으로 이동</Link>
                        </section>
                    </>
                )}
            </div>
        </main>
    );
}
