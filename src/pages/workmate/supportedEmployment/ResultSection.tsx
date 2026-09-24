import { useMemo } from 'react';
import { Wallet } from 'lucide-react';
import {
    SUPPORTED_EMPLOYMENT_STATUSES,
    type SupportedEmploymentCase,
    type SupportedEmploymentStatus,
} from '../../../features/supportedEmployment/model';
import type { BudgetProject, Expense } from '../../../types/budget';
import type { CaseUpdater } from './BasicInfoSection';
import { compareLinkedExpenses } from './caseEditing';
import { missingExpenseLabels } from './budgetLink';

interface Props {
    draft: SupportedEmploymentCase;
    update: CaseUpdater;
    projects: BudgetProject[];
    expenses: Expense[];
    expensesLoaded: boolean;
    dirty: boolean;
    creatingExpenses: boolean;
    onCreateExpenses: () => void;
}

const isClosed = (status: SupportedEmploymentStatus) => status === '수료' || status === '취업';

/** 결과 확정(D-2 #7)과 예산 연동(D-4) */
export function ResultSection({ draft, update, projects, expenses, expensesLoaded, dirty, creatingExpenses, onCreateExpenses }: Props) {
    const linkStatus = useMemo(() => compareLinkedExpenses(draft, expenses, draft.documentOptions?.coachDaysBasis), [draft, expenses]);
    const linkedCount = draft.expenseIds?.length || 0;
    const missingLabels = useMemo(() => (expensesLoaded ? missingExpenseLabels(draft, expenses) : []), [draft, expenses, expensesLoaded]);
    // 연결된 지출이 없거나, 3개 항목 중 빠진 항목이 있으면 만들기 버튼을 보여 준다(이미 만든 항목은 건너뜀).
    const canOfferCreate = linkedCount === 0 || missingLabels.length > 0;
    const projectMissing = draft.budgetProjectId && !projects.some(project => project.id === draft.budgetProjectId);

    const setStatus = (status: SupportedEmploymentStatus) => update(c => ({
        ...c,
        status,
        result: {
            ...c.result,
            completed: status === '수료' || status === '취업' ? true : status === '중단' ? false : c.result.completed,
            employed: status === '취업' ? true : c.result.employed,
        },
    }));

    return <div className="space-y-5">
        <section className="glass-card !p-5" aria-labelledby="se-result-title">
            <h3 id="se-result-title" className="text-lg font-bold text-white">결과 확정</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-3">
                <label className="text-sm text-white/75" htmlFor="se-status">상태
                    <select id="se-status" className="input-field mt-1" value={draft.status}
                        onChange={e => setStatus(e.target.value as SupportedEmploymentStatus)}>
                        {SUPPORTED_EMPLOYMENT_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                    </select>
                </label>
                <label className="text-sm text-white/75 flex items-center gap-2 sm:mt-6">
                    <input type="checkbox" checked={draft.result.completed}
                        onChange={e => update(c => ({ ...c, result: { ...c.result, completed: e.target.checked } }))} />
                    수료
                </label>
                <label className="text-sm text-white/75 flex items-center gap-2 sm:mt-6">
                    <input type="checkbox" checked={draft.result.employed}
                        onChange={e => update(c => ({ ...c, result: { ...c.result, employed: e.target.checked } }))} />
                    취업
                </label>
                <label className="text-sm text-white/75" htmlFor="se-employment-date">취업일
                    <input id="se-employment-date" type="date" className="input-field mt-1" value={draft.result.employmentDate}
                        disabled={!draft.result.employed}
                        onChange={e => update(c => ({ ...c, result: { ...c.result, employmentDate: e.target.value } }))} />
                </label>
            </div>
            <label className="block text-sm text-white/75 mt-3" htmlFor="se-result-note">비고
                <textarea id="se-result-note" className="textarea-field mt-1" rows={2} maxLength={1000} value={draft.result.note}
                    onChange={e => update(c => ({ ...c, result: { ...c.result, note: e.target.value } }))} />
            </label>
        </section>

        <section className="glass-card !p-5" aria-labelledby="se-budget-title">
            <h3 id="se-budget-title" className="text-lg font-bold text-white flex items-center gap-2"><Wallet className="w-5 h-5 text-amber-200" aria-hidden="true" /> 예산 연동</h3>
            <p className="text-xs text-white/55 mt-1">상태를 수료·취업으로 저장하면 예산 관리에 지출 초안 3건(훈련수당·사업주보조금·직무지도원수당)을 만들지 묻습니다. 이미 만든 지출은 자동으로 고치지 않습니다.</p>
            <div className="flex flex-wrap items-end gap-3 mt-3">
                <label className="text-sm text-white/75" htmlFor="se-budget-project">예산 사업
                    <select id="se-budget-project" className="input-field mt-1 min-w-[14rem]" value={draft.budgetProjectId || ''}
                        onChange={e => update(c => {
                            const next = { ...c };
                            if (e.target.value) next.budgetProjectId = e.target.value; else delete next.budgetProjectId;
                            return next;
                        })}>
                        <option value="">사업 선택</option>
                        {projectMissing && <option value={draft.budgetProjectId}>삭제되었거나 찾을 수 없는 사업</option>}
                        {projects.map(project => <option key={project.id} value={project.id}>{project.name}{project.period ? ` (${project.period})` : ''}</option>)}
                    </select>
                </label>
                {canOfferCreate && <button type="button" className="btn-secondary !px-4 !py-2 text-sm"
                    disabled={creatingExpenses || dirty || !isClosed(draft.status) || !draft.budgetProjectId || Boolean(projectMissing)}
                    onClick={onCreateExpenses}>
                    {creatingExpenses ? '지출 초안 만드는 중...' : linkedCount > 0 ? `빠진 지출 초안 만들기(${missingLabels.length}건)` : '지출 초안 만들기'}
                </button>}
            </div>
            {projects.length === 0 && <p className="text-xs text-white/55 mt-2">예산 관리에 등록한 사업이 없습니다. 예산 관리에서 "지원고용" 사업을 먼저 만들어 주세요.</p>}
            {canOfferCreate && (dirty || !isClosed(draft.status)) && <p className="text-xs text-white/50 mt-2">
                지출 초안은 상태가 수료·취업이고 저장된 뒤에 만들 수 있습니다.
            </p>}
            {linkedCount > 0 && <div className="mt-3 text-sm" aria-live="polite">
                <p className="text-white/80">연결된 지출 {linkedCount}건</p>
                {missingLabels.length > 0 && <p className="text-xs text-amber-200 mt-1">예산 관리에 없는 항목: {missingLabels.join(', ')} — "빠진 지출 초안 만들기"로 그 항목만 만들 수 있습니다.</p>}
                {expensesLoaded && linkStatus.differing.length > 0 && <p className="mt-1">
                    <span className="rounded-full bg-amber-500/20 text-amber-100 px-2 py-0.5 text-xs font-bold">회차 금액과 다름</span>
                    <span className="text-white/70 ml-2">{linkStatus.differing.join(', ')} — 예산 관리에서 직접 확인해 고쳐 주세요.</span>
                </p>}
                {expensesLoaded && linkStatus.missing > 0 && <p className="text-xs text-amber-200 mt-1">연결된 지출 {linkStatus.missing}건을 예산 관리에서 찾을 수 없습니다(삭제되었을 수 있습니다).</p>}
                {expensesLoaded && linkStatus.differing.length === 0 && linkStatus.missing === 0 && <p className="text-xs text-emerald-200 mt-1">예산 관리의 지출 금액이 회차 금액과 같습니다.</p>}
            </div>}
        </section>
    </div>;
}
