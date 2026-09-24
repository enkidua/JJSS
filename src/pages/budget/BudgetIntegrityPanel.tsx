import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Edit3, X } from 'lucide-react';
import type { BudgetProject, Expense } from '../../types/budget';
import { BUDGET_ISSUE_LABELS, findBudgetIssues, type BudgetIssueKind } from './budgetUtils';

interface BudgetIntegrityPanelProps {
    projects: BudgetProject[];
    expenses: Expense[];
    onEditExpense: (expense: Expense) => void;
    onEditProject: (project: BudgetProject) => void;
    onClose: () => void;
}

const KIND_ORDER: BudgetIssueKind[] = ['projectMissing', 'itemMissing', 'itemsExceedBudget', 'dateOutsidePeriod', 'duplicateApproval'];

const KIND_HINTS: Record<BudgetIssueKind, string> = {
    projectMissing: '연결된 사업이 삭제되었거나 백업 복원 과정에서 끊긴 지출입니다. 수정에서 사업을 다시 고르거나 ‘사업 미지정’으로 바꿔 주세요.',
    itemMissing: '사업의 세부 항목이 삭제되었거나 이름이 바뀐 지출입니다. 수정에서 세부 항목을 다시 골라 주세요.',
    itemsExceedBudget: '세부 항목 금액을 모두 더한 값이 총예산보다 큽니다. 사업 수정에서 금액을 확인해 주세요.',
    dateOutsidePeriod: '지출일자가 사업기간 밖입니다. 날짜나 사업기간이 맞는지 확인해 주세요.',
    duplicateApproval: '같은 승인번호가 여러 지출에 쓰였습니다. 같은 영수증을 두 번 등록하지 않았는지 확인해 주세요.',
};

/** 정합성 점검 결과. 아무것도 자동으로 고치지 않고, 각 행에서 해당 지출·사업 수정 화면을 엽니다. */
export default function BudgetIntegrityPanel({ projects, expenses, onEditExpense, onEditProject, onClose }: BudgetIntegrityPanelProps) {
    const issues = useMemo(() => findBudgetIssues(projects, expenses), [projects, expenses]);
    const groups = KIND_ORDER
        .map(kind => ({ kind, items: issues.filter(issue => issue.kind === kind) }))
        .filter(group => group.items.length > 0);

    return (
        <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            aria-labelledby="budget-integrity-title"
            className="glass-strong rounded-2xl p-5 border border-amber-400/20 mb-6"
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                    <h2 id="budget-integrity-title" className="text-lg font-bold text-white flex items-center gap-2">
                        {issues.length > 0 ? <AlertTriangle className="w-5 h-5 text-amber-300" /> : <CheckCircle2 className="w-5 h-5 text-emerald-300" />}
                        정합성 점검
                    </h2>
                    <p className="text-xs text-white/45 mt-1">
                        전체 사업 {projects.length}개 · 지출 {expenses.length}건을 검사했습니다(검색·필터와 관계없이 전체 기준). 자동으로 고치지 않으니 각 행의 ‘수정’으로 확인해 주세요.
                    </p>
                </div>
                <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/60" aria-label="정합성 점검 닫기">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {issues.length === 0 ? (
                <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    문제를 찾지 못했습니다. 사업·세부 항목·지출 연결이 모두 맞습니다.
                </p>
            ) : (
                <div className="space-y-4" role="status" aria-live="polite">
                    <p className="text-sm text-amber-100">확인이 필요한 항목 {issues.length}건</p>
                    {groups.map(group => (
                        <div key={group.kind}>
                            <p className="text-sm font-semibold text-white/85">
                                {BUDGET_ISSUE_LABELS[group.kind]} <span className="text-amber-200">{group.items.length}건</span>
                            </p>
                            <p className="text-xs text-white/40 mb-2">{KIND_HINTS[group.kind]}</p>
                            <ul className="space-y-1.5">
                                {group.items.map((issue, index) => (
                                    <li
                                        key={`${issue.kind}-${issue.expense?.id || issue.project?.id || index}`}
                                        className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2"
                                    >
                                        <span className="text-xs text-white/70 break-all">{issue.message}</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (issue.expense) onEditExpense(issue.expense);
                                                else if (issue.project) onEditProject(issue.project);
                                            }}
                                            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 text-white/75 text-xs hover:bg-white/15"
                                            aria-label={`${issue.kindLabel} 항목 수정`}
                                        >
                                            <Edit3 className="w-3.5 h-3.5" />
                                            수정
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </motion.section>
    );
}
