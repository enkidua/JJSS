import { useState } from 'react';
import { ChevronDown, Edit3, Trash2 } from 'lucide-react';
import type { BudgetProject, Expense } from '../../types/budget';
import { getBudgetStatus, itemBalance, itemSpent, normalizeBudgetItems, projectBalance, projectSpent, toWon, unassignedItemSpent } from './budgetUtils';

interface ProjectCardsProps {
    budgetProjects: BudgetProject[];
    expenses: Expense[];
    onEdit: (project: BudgetProject) => void;
    onDelete: (projectId: string) => void;
}

/** 사업별 예산·사용액·잔액 카드와 세부 항목별 현황. */
export default function ProjectCards({ budgetProjects, expenses, onEdit, onDelete }: ProjectCardsProps) {
    const [expandedProjectIds, setExpandedProjectIds] = useState<Record<string, boolean>>({});

    if (budgetProjects.length === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mt-5">
            {budgetProjects.map(project => {
                const spent = projectSpent(project.id, expenses);
                const balance = projectBalance(project, expenses);
                const status = getBudgetStatus(project.totalBudget, spent);
                const budgetItems = normalizeBudgetItems(project);
                const unassignedSpent = unassignedItemSpent(project.id, expenses);
                const expanded = Boolean(expandedProjectIds[project.id]);
                return (
                    <div key={project.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-bold text-white">{project.name}</p>
                                <p className="text-xs text-white/40 mt-1">{project.period || '기간 미지정'} · {project.notes || '비고 없음'}</p>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => onEdit(project)} className="p-1.5 rounded-lg hover:bg-white/10 text-blue-300" aria-label={`${project.name} 사업 수정`} title="사업 수정">
                                    <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => onDelete(project.id)} className="p-1.5 rounded-lg hover:bg-white/10 text-red-300" aria-label={`${project.name} 사업 삭제`} title="사업 삭제">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                            <div><p className="text-white/35">예산</p><p className="text-white font-bold">{toWon(project.totalBudget).toLocaleString()}</p></div>
                            <div><p className="text-white/35">사용</p><p className="text-white font-bold">{spent.toLocaleString()}</p></div>
                            <div><p className="text-white/35">잔액</p><p className={balance < 0 ? 'text-red-300 font-bold' : 'text-emerald-300 font-bold'}>{balance.toLocaleString()}</p></div>
                        </div>
                        <div className="mt-3">
                            <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                                <div
                                    className={`h-full ${status.barClassName}`}
                                    style={{ width: `${Math.min(status.usageRate, 100)}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between mt-2">
                                <span className="text-xs text-white/45">사용률 {status.usageRate}%</span>
                                <span className={`px-2 py-0.5 rounded-full border text-[11px] font-bold ${status.className}`}>
                                    {status.label}
                                </span>
                            </div>
                        </div>
                        <div className="mt-4 pt-3 border-t border-white/10">
                            <button
                                type="button"
                                onClick={() => setExpandedProjectIds(prev => ({ ...prev, [project.id]: !prev[project.id] }))}
                                aria-expanded={expanded}
                                className="w-full flex items-center justify-between text-xs text-white/55 hover:text-white/80 transition-colors"
                            >
                                <span>세부 항목별 현황 {budgetItems.length ? `(${budgetItems.length}개)` : ''}</span>
                                <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                            </button>
                            {expanded && (
                                <div className="mt-3 space-y-2">
                                    {budgetItems.length === 0 && (
                                        <p className="text-xs text-white/35">등록된 세부 예산 항목이 없습니다. 사업 사용액은 전체 사업 사용액에만 반영됩니다.</p>
                                    )}
                                    {budgetItems.map(item => {
                                        const spentForItem = itemSpent(project.id, item.id, expenses);
                                        const balanceForItem = itemBalance(project.id, item, expenses);
                                        const itemStatus = getBudgetStatus(item.amount || 0, spentForItem);
                                        return (
                                            <div key={item.id} className="text-xs rounded-xl bg-white/[0.03] border border-white/10 p-2">
                                                <div className="flex justify-between gap-2">
                                                    <span className="text-white/75 truncate">{item.name || '이름 없는 항목'}</span>
                                                    <span className={itemStatus.over ? 'text-red-300' : 'text-white/45'}>
                                                        사용률 {itemStatus.usageRate}%{itemStatus.over ? ' · 초과' : ''}
                                                    </span>
                                                </div>
                                                <div className="mt-1 flex justify-between gap-2 text-white/40">
                                                    <span>예산 {toWon(item.amount).toLocaleString()}원</span>
                                                    <span>사용 {spentForItem.toLocaleString()}원</span>
                                                    <span className={balanceForItem < 0 ? 'text-red-300' : 'text-emerald-300'}>잔액 {balanceForItem.toLocaleString()}원</span>
                                                </div>
                                                <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden mt-2">
                                                    <div
                                                        className={`h-full ${itemStatus.barClassName}`}
                                                        style={{ width: `${Math.min(itemStatus.usageRate, 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {unassignedSpent !== 0 && (
                                        <p className="text-xs text-white/40 rounded-xl bg-white/[0.03] border border-white/10 p-2">
                                            항목 미지정 사용액: {unassignedSpent.toLocaleString()}원
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
