import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import {
    copyCaseForNextRound,
    createEmptyCase,
    serializeCase,
    type SupportedEmploymentCase,
} from '../../../features/supportedEmployment/model';
import { calculatePayments, formatWon } from '../../../features/supportedEmployment/calc';
import { deleteCase, getCase, listCases, saveCase } from '../../../features/supportedEmployment/storage';
import { useDataStore } from '../../../store/dataStore';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { useAppToast } from '../../../components/Toast';
import type { BudgetProject } from '../../../types/budget';
import type { JobOpening, Seeker } from '../../../types/matching';
import { getSeekerKey } from '../../../utils/seeker';
import { loadBudgetProjects } from '../../budget/budgetUtils';
import { CaseList } from './CaseList';
import { BasicInfoSection, type SchedulePatch } from './BasicInfoSection';
import { DailyLogGrid } from './DailyLogGrid';
import { CoachTimesheetSection } from './CoachTimesheetSection';
import { EvaluationSection } from './EvaluationSection';
import { ResultSection } from './ResultSection';
import { OutputPanel } from './OutputPanel';
import { PaymentCard } from './PaymentCard';
import { planExpenseDrafts, type ExpenseDraftPlan } from './budgetLink';
import { nextRoundNumber, planSchedule, withDailyLogs } from './caseEditing';
import { buildCoachTimesheetFromLogs } from '../../../features/supportedEmployment/schedule';

/** 다른 화면(현황판 등)에서 넘겨받은 요청. key가 바뀔 때마다 한 번 처리합니다. */
export interface SupportedEmploymentRequest {
    key: string;
    caseId?: string;
    seekerId?: string;
}

interface Props {
    seekers: Seeker[];
    jobs: JobOpening[];
    request: SupportedEmploymentRequest | null;
    onDirtyChange: (dirty: boolean) => void;
}

type SectionKey = 'basic' | 'logs' | 'timesheet' | 'evaluation' | 'result' | 'output';
const SECTIONS: Array<{ key: SectionKey; label: string }> = [
    { key: 'basic', label: '1. 기본정보' },
    { key: 'logs', label: '2. 훈련일지' },
    { key: 'timesheet', label: '3. 지도원 출근부' },
    { key: 'evaluation', label: '4. 종합 평가기록부' },
    { key: 'result', label: '5. 결과 확정·예산' },
    { key: 'output', label: '6. 출력' },
];

interface Editing {
    /** 편집 화면을 새로 그릴 때 쓰는 값(회차를 바꾸면 하위 화면 상태를 비웁니다) */
    session: number;
    draft: SupportedEmploymentCase;
    /** 마지막으로 저장(또는 불러온) 내용의 직렬화 값 — 미저장 여부 판단 */
    baseline: string;
    savedStatus: SupportedEmploymentCase['status'] | null;
}

const isClosedStatus = (status: SupportedEmploymentCase['status'] | null) => status === '수료' || status === '취업';
const isPlausibleDate = (value: string) => /^20\d{2}-\d{2}-\d{2}$/.test(value);

/** 고용지원 > 지원고용 관리 탭(계획서 D-2·D-4·D-5) */
export function SupportedEmploymentTab({ seekers, jobs, request, onDirtyChange }: Props) {
    const confirm = useConfirm();
    const showToast = useAppToast();
    const addExpense = useDataStore(state => state.addExpense);
    const fetchExpenses = useDataStore(state => state.fetchExpenses);
    const expenses = useDataStore(state => state.expenses);

    const [cases, setCases] = useState<SupportedEmploymentCase[]>([]);
    const [listLoading, setListLoading] = useState(true);
    const [listError, setListError] = useState('');
    const [seekerFilter, setSeekerFilter] = useState('');
    const [editing, setEditing] = useState<Editing | null>(null);
    const [section, setSection] = useState<SectionKey>('basic');
    const [opening, setOpening] = useState(false);
    const [saving, setSaving] = useState(false);
    const [creatingExpenses, setCreatingExpenses] = useState(false);
    const [aiBusy, setAiBusy] = useState(false);
    const [outputBusy, setOutputBusy] = useState(false);
    const [projects, setProjects] = useState<BudgetProject[]>([]);
    const [expensesLoaded, setExpensesLoaded] = useState(false);
    const listRequestRef = useRef(0);
    const openRequestRef = useRef(0);
    const sessionRef = useRef(0);
    const handledRequestRef = useRef<string | null>(null);

    const serializedDraft = useMemo(() => (editing ? serializeCase(editing.draft) : ''), [editing]);
    const dirty = Boolean(editing) && serializedDraft !== editing?.baseline;
    const busy = saving || creatingExpenses || aiBusy || outputBusy;

    useEffect(() => { onDirtyChange(dirty || busy); }, [dirty, busy, onDirtyChange]);
    useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

    const reloadList = useCallback(async () => {
        const request = ++listRequestRef.current;
        setListLoading(true);
        setListError('');
        try {
            const items = await listCases();
            if (request === listRequestRef.current) setCases(items);
        } catch {
            if (request === listRequestRef.current) setListError('회차 목록을 불러오지 못했습니다. 저장된 기록은 그대로 있습니다.');
        } finally {
            if (request === listRequestRef.current) setListLoading(false);
        }
    }, []);

    useEffect(() => {
        void reloadList();
        return () => { listRequestRef.current += 1; openRequestRef.current += 1; };
    }, [reloadList]);

    const startEditing = useCallback((draft: SupportedEmploymentCase, baseline: string, savedStatus: Editing['savedStatus']) => {
        sessionRef.current += 1;
        setEditing({ session: sessionRef.current, draft, baseline, savedStatus });
        setSection('basic');
        setAiBusy(false);
        setOutputBusy(false);
        try { setProjects(loadBudgetProjects()); } catch { setProjects([]); }
        if (draft.expenseIds?.length) {
            setExpensesLoaded(false);
            fetchExpenses().then(() => setExpensesLoaded(true)).catch(() => setExpensesLoaded(false));
        }
    }, [fetchExpenses]);

    const confirmLeaveEditor = useCallback(async () => {
        if (busy) { showToast('저장이나 서류 작업이 끝난 뒤 다시 시도해 주세요.', 'info'); return false; }
        if (!dirty) return true;
        return confirm({
            title: '저장하지 않은 내용', message: '이 회차에 저장하지 않은 입력이 있습니다.\n계속하면 입력한 내용이 사라집니다. 계속할까요?',
            confirmLabel: '버리고 계속', cancelLabel: '취소', tone: 'danger',
        });
    }, [busy, confirm, dirty, showToast]);

    const openCase = useCallback(async (id: string) => {
        if (!(await confirmLeaveEditor())) return;
        const request = ++openRequestRef.current;
        setOpening(true);
        try {
            const found = await getCase(id);
            if (request !== openRequestRef.current) return;
            if (!found) { showToast('회차를 찾을 수 없습니다. 목록을 새로 불러옵니다.', 'error'); void reloadList(); return; }
            startEditing(found, serializeCase(found), found.status);
        } catch {
            if (request === openRequestRef.current) showToast('회차를 불러오지 못했습니다.', 'error');
        } finally {
            if (request === openRequestRef.current) setOpening(false);
        }
    }, [confirmLeaveEditor, reloadList, showToast, startEditing]);

    // 다른 화면에서 넘겨받은 요청(회차 열기 또는 이용자 필터)
    useEffect(() => {
        if (!request || handledRequestRef.current === request.key) return;
        handledRequestRef.current = request.key;
        if (request.seekerId) setSeekerFilter(request.seekerId);
        if (request.caseId) void openCase(request.caseId);
    }, [request, openCase]);

    const rememberedOptions = () => cases.find(item => item.documentOptions)?.documentOptions;

    const handleCreate = async () => {
        if (!(await confirmLeaveEditor())) return;
        const seeker = seekerFilter ? seekers.find(item => getSeekerKey(item) === seekerFilter) : undefined;
        const options = rememberedOptions();
        const draft = createEmptyCase({
            round: nextRoundNumber(cases),
            ...(seeker ? { seekerId: getSeekerKey(seeker), seekerName: seeker.name } : {}),
            ...(options ? { documentOptions: { ...options } } : {}),
        });
        startEditing(draft, serializeCase(draft), null);
    };

    const handleCopy = async (item: SupportedEmploymentCase) => {
        if (!(await confirmLeaveEditor())) return;
        const draft = { ...copyCaseForNextRound(item), round: nextRoundNumber(cases) };
        // 복사본은 아직 저장하지 않았으므로 미저장 상태로 둡니다(떠날 때 확인).
        startEditing(draft, '', null);
        showToast(`${item.round}차의 사업체·직무·지도원·계좌·단가를 복사했습니다. 기간을 정하고 저장해 주세요.`, 'info');
    };

    const handleDelete = async (item: SupportedEmploymentCase) => {
        const ok = await confirm({
            title: '회차 삭제',
            message: `${item.round}차 회차(훈련일지·평가기록부 포함)를 삭제합니다. 되돌릴 수 없습니다. 삭제할까요?${item.expenseIds?.length ? '\n예산 관리에 만든 지출 초안은 지워지지 않습니다.' : ''}`,
            confirmLabel: '삭제', cancelLabel: '취소', tone: 'danger',
        });
        if (!ok) return;
        try {
            await deleteCase(item.id);
            if (editing?.draft.id === item.id) setEditing(null);
            showToast('회차를 삭제했습니다.', 'success');
            void reloadList();
        } catch (error) {
            showToast(error instanceof Error ? error.message : '회차를 삭제하지 못했습니다.', 'error');
        }
    };

    const handleBack = async () => {
        if (!(await confirmLeaveEditor())) return;
        setEditing(null);
        setAiBusy(false);
        setOutputBusy(false);
    };

    const updateDraft = useCallback((updater: (current: SupportedEmploymentCase) => SupportedEmploymentCase) => {
        setEditing(current => (current ? { ...current, draft: updater(current.draft) } : current));
    }, []);

    const applySchedule = async (patch: SchedulePatch) => {
        if (!editing) return;
        const nextPeriod = { ...editing.draft.period, ...(patch.period || {}) };
        // 날짜를 키보드로 입력하는 중(연도가 덜 입력된 상태)에는 기간만 바꾸고 훈련일은 그대로 둡니다.
        const typing = [nextPeriod.start, nextPeriod.end].some(value => value && !isPlausibleDate(value));
        if (typing) { updateDraft(c => ({ ...c, ...patch, period: nextPeriod })); return; }
        const plan = planSchedule(editing.draft, patch);
        if (plan.droppedWithContent.length) {
            const ok = await confirm({
                title: '훈련일 변경',
                message: `새 기간에서 빠지는 날(${plan.droppedWithContent.join(', ')})에 입력한 훈련일지가 지워집니다. 계속할까요?`,
                confirmLabel: '기간 바꾸기', cancelLabel: '취소', tone: 'danger',
            });
            if (!ok) return;
        }
        updateDraft(c => planSchedule(c, patch).next);
    };

    /** 저장한 회차를 화면에 반영. 저장 중에 더 고친 내용이 있으면 그 내용은 유지합니다. */
    const applySaved = (saved: SupportedEmploymentCase, sentSerialized: string) => {
        setEditing(current => {
            if (!current) return current;
            const unchanged = serializeCase(current.draft) === sentSerialized;
            const draft = unchanged ? saved : { ...current.draft, id: saved.id, createdAt: saved.createdAt, updatedAt: saved.updatedAt, expenseIds: saved.expenseIds };
            return { ...current, draft, baseline: serializeCase(saved), savedStatus: saved.status };
        });
    };

    /** 예산 관리의 최신 지출 목록(실패하면 화면에 있는 목록). */
    const loadLatestExpenses = async () => {
        try {
            const latest = await fetchExpenses();
            setExpensesLoaded(true);
            return latest;
        } catch {
            return useDataStore.getState().expenses;
        }
    };

    /** 표식([지원고용:회차ID:항목])으로 이미 만든 초안을 찾아 빠진 항목만 만들고, 만든 ID는 항상 회차에 저장합니다. */
    const createExpenses = async (target: SupportedEmploymentCase, project: BudgetProject, plan: ExpenseDraftPlan) => {
        setCreatingExpenses(true);
        const createdIds: string[] = [];
        let failed = false;
        try {
            for (const expense of plan.toCreate) {
                const saved = await addExpense(expense);
                if (saved.id) createdIds.push(saved.id);
            }
        } catch (error) {
            failed = true;
            showToast(error instanceof Error ? error.message : '지출 초안을 만들지 못했습니다.', 'error');
        }
        try {
            const known = target.expenseIds || [];
            const linkIds = [...plan.existingIds, ...createdIds].filter(id => !known.includes(id));
            if (linkIds.length || target.budgetProjectId !== project.id) {
                const next = { ...target, budgetProjectId: project.id, expenseIds: [...known, ...linkIds] };
                const saved = await saveCase(next);
                applySaved(saved, serializeCase(target));
                void reloadList();
            }
            setExpensesLoaded(true);
            if (createdIds.length && !failed) {
                showToast(`'${project.name}' 사업에 지출 초안 ${createdIds.length}건을 만들었습니다. 예산 관리에서 확인해 주세요.`, 'success');
            } else if (createdIds.length) {
                showToast(`지출 초안 ${createdIds.length}건만 만들었습니다. "지출 초안 만들기"를 다시 누르면 빠진 항목만 만듭니다.`, 'error');
            }
        } catch {
            showToast('지출 초안은 만들었지만 회차에 연결 정보를 저장하지 못했습니다. 다시 시도하면 이미 만든 초안은 건너뜁니다.', 'error');
        } finally {
            setCreatingExpenses(false);
        }
    };

    const offerExpenses = async (target: SupportedEmploymentCase) => {
        const project = loadBudgetProjects().find(item => item.id === target.budgetProjectId);
        if (!project) {
            showToast('예산 연동: "5. 결과 확정·예산"에서 예산 사업을 고르면 지출 초안 3건을 만들 수 있습니다.', 'info');
            return;
        }
        if (!target.id) { showToast('회차를 먼저 저장한 뒤 지출 초안을 만들어 주세요.', 'info'); return; }
        const plan = planExpenseDrafts(target, project, await loadLatestExpenses());
        if (!plan.payableCount) { showToast('지급액이 0원이라 만들 지출이 없습니다.', 'info'); return; }
        if (!plan.toCreate.length) {
            // 이미 모두 있음: 연결 ID만 빠졌다면 채워 둔다.
            await createExpenses(target, project, plan);
            showToast('이 회차의 지출 초안이 이미 예산 관리에 모두 있습니다.', 'info');
            return;
        }
        const payments = calculatePayments(target, { coachDaysBasis: target.documentOptions?.coachDaysBasis });
        const createLabels = new Set(plan.toCreate.map(item => item.budgetItem));
        const lines = payments.items.filter(item => item.amount > 0 && createLabels.has(item.label))
            .map(item => `${item.label} ${formatWon(item.amount)}원`).join(', ');
        const skipped = plan.existingIds.length ? `
이미 만든 초안 ${plan.existingIds.length}건은 건너뜁니다.` : '';
        const ok = await confirm({
            title: '예산 연동',
            message: `'${project.name}' 사업에 지출 초안을 만들까요?
${lines}${skipped}
초안은 예산 관리에서 확인·수정할 수 있습니다.`,
            confirmLabel: '초안 만들기', cancelLabel: '나중에',
        });
        if (ok) await createExpenses(target, project, plan);
    };

    const handleSave = async () => {
        if (!editing || saving) return;
        const sent = editing.draft;
        const sentSerialized = serializeCase(sent);
        const previousStatus = editing.savedStatus;
        setSaving(true);
        let saved: SupportedEmploymentCase | null = null;
        try {
            saved = await saveCase(sent);
            applySaved(saved, sentSerialized);
            showToast('회차를 저장했습니다.', 'success');
            void reloadList();
        } catch (error) {
            showToast(error instanceof Error ? error.message : '회차를 저장하지 못했습니다. 입력한 내용은 화면에 남아 있습니다.', 'error');
        } finally {
            setSaving(false);
        }
        if (saved && isClosedStatus(saved.status) && !isClosedStatus(previousStatus) && !saved.expenseIds?.length) {
            await offerExpenses(saved);
        }
    };

    const handleManualExpenses = async () => {
        if (!editing) return;
        const project = projects.find(item => item.id === editing.draft.budgetProjectId);
        if (!project) { showToast('예산 사업을 먼저 골라 주세요.', 'info'); return; }
        await offerExpenses(editing.draft);
    };

    const filteredCases = useMemo(() => (seekerFilter ? cases.filter(item => item.seekerId === seekerFilter) : cases), [cases, seekerFilter]);

    if (!editing) {
        return <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-white/75 flex items-center gap-2" htmlFor="se-seeker-filter">이용자
                    <select id="se-seeker-filter" className="input-field !w-auto" value={seekerFilter} onChange={e => setSeekerFilter(e.target.value)}>
                        <option value="">전체</option>
                        {seekers.map(seeker => <option key={getSeekerKey(seeker)} value={getSeekerKey(seeker)}>{seeker.name}</option>)}
                    </select>
                </label>
                {opening && <span role="status" className="text-sm text-white/55">회차를 여는 중...</span>}
            </div>
            <CaseList cases={filteredCases} loading={listLoading} error={listError} busy={opening}
                onRetry={() => void reloadList()} onCreate={() => void handleCreate()} onOpen={id => void openCase(id)}
                onCopy={item => void handleCopy(item)} onDelete={item => void handleDelete(item)} />
        </div>;
    }

    const { draft } = editing;
    const coachDaysBasis = draft.documentOptions?.coachDaysBasis || 'scheduled';
    const payments = calculatePayments(draft, { coachDaysBasis });
    const otherCases = cases.filter(item => item.id !== draft.id);

    return <div className="space-y-4" key={editing.session}>
        <div className="glass-card !p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
                <button type="button" className="btn-ghost !px-3 !py-2 text-sm flex items-center gap-1" onClick={() => void handleBack()}>
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" /> 목록으로
                </button>
                <div>
                    <h2 className="text-xl font-bold text-white">지원고용 {draft.round ? `${draft.round}차` : '새 회차'}{draft.seekerName ? ` · ${draft.seekerName}` : ''}</h2>
                    <p className="text-xs text-white/55">{draft.id ? `상태: ${draft.status}` : '아직 저장하지 않은 회차입니다.'}</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                {dirty && <span className="text-sm text-amber-200" role="status">저장하지 않은 변경 있음</span>}
                <button type="button" className="btn-primary !px-5 !py-2 flex items-center gap-2" onClick={() => void handleSave()} disabled={saving || creatingExpenses}>
                    <Save className="w-4 h-4" aria-hidden="true" /> {saving ? '저장 중...' : '회차 저장'}
                </button>
            </div>
        </div>

        <nav aria-label="회차 입력 단계" className="flex gap-2 overflow-x-auto">
            {SECTIONS.map(item => <button key={item.key} type="button" aria-pressed={section === item.key}
                onClick={() => setSection(item.key)} disabled={(aiBusy || outputBusy) && item.key !== section}
                className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap border ${section === item.key ? 'bg-primary-500/20 border-primary-500/50 text-white' : 'border-white/10 text-white/65 hover:text-white'}`}>
                {item.label}
            </button>)}
        </nav>

        <div className="grid gap-4 lg:grid-cols-12 items-start">
            <div className="lg:col-span-8 xl:col-span-9 min-w-0">
                {section === 'basic' && <BasicInfoSection draft={draft} update={updateDraft} applySchedule={patch => void applySchedule(patch)}
                    seekers={seekers} jobs={jobs} otherCases={otherCases} />}
                {section === 'logs' && <DailyLogGrid logs={draft.dailyLogs}
                    onChange={logs => updateDraft(c => withDailyLogs(c, logs))}
                    confirmBulk={message => confirm({ title: '일괄 변경', message, confirmLabel: '바꾸기', cancelLabel: '취소' })} />}
                {section === 'timesheet' && <CoachTimesheetSection entries={draft.coachTimesheet} hasLogs={draft.dailyLogs.length > 0}
                    onChange={entries => updateDraft(c => ({ ...c, coachTimesheet: entries }))}
                    onRebuild={() => void (async () => {
                        if (!(await confirm({ title: '출근부 다시 채우기', message: '직접 고친 출근부 시간이 모두 훈련일지 시간으로 바뀝니다. 계속할까요?', confirmLabel: '다시 채우기', cancelLabel: '취소' }))) return;
                        updateDraft(c => ({ ...c, coachTimesheet: buildCoachTimesheetFromLogs(c.dailyLogs, [], c.oneToManyGuidance) }));
                    })()} />}
                {section === 'evaluation' && <EvaluationSection draft={draft} onBusyChange={setAiBusy}
                    onChange={evaluation => updateDraft(c => ({ ...c, evaluation }))}
                    onOpinionsChange={updater => updateDraft(c => ({ ...c, evaluation: { ...c.evaluation, opinions: updater(c.evaluation.opinions) } }))} />}
                {section === 'result' && <ResultSection draft={draft} update={updateDraft} projects={projects} expenses={expenses}
                    expensesLoaded={expensesLoaded} dirty={dirty} creatingExpenses={creatingExpenses}
                    onCreateExpenses={() => void handleManualExpenses()} />}
                {section === 'output' && <OutputPanel draft={draft} update={updateDraft} dirty={dirty} onBusyChange={setOutputBusy} />}
            </div>
            <aside className="lg:col-span-4 xl:col-span-3 lg:sticky lg:top-4">
                <PaymentCard payments={payments} logs={draft.dailyLogs} coachDaysBasis={coachDaysBasis} />
            </aside>
        </div>
    </div>;
}
