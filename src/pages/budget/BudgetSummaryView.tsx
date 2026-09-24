import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import type { BudgetProject, Expense } from '../../types/budget';
import { categoryTotals, expenseListTotal, getBudgetStatus, monthlyTotals, projectTotals, UNASSIGNED_PROJECT_KEY, type ProjectTotalsOptions, type TotalRow } from './budgetUtils';

interface BudgetSummaryViewProps {
    /** 집계에 넣을 사업(사업 필터가 있으면 그 사업만). */
    projects: BudgetProject[];
    /** 현재 검색·필터에 맞는 지출. */
    expenses: Expense[];
    /** 잔액·사용률은 필터와 무관하게 전체 지출로 계산합니다. */
    totalsOptions?: ProjectTotalsOptions;
    hasActiveFilters: boolean;
    onExportCsv: () => void;
}

/** 막대 너비(%) — 가장 큰 값을 100%로 봅니다. 음수(환불 초과)는 0으로 둡니다. */
function barWidth(value: number, max: number): number {
    if (max <= 0 || value <= 0) return 0;
    return Math.min(100, Math.round((value / max) * 100));
}

function SimpleTotalsTable({ title, firstColumn, rows }: { title: string; firstColumn: string; rows: TotalRow[] }) {
    const max = Math.max(0, ...rows.map(row => row.total));
    return (
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
            <h3 className="text-sm font-bold text-white mb-3">{title}</h3>
            {rows.length === 0 ? (
                <p className="text-xs text-white/40">지출이 없습니다.</p>
            ) : (
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-white/40">
                            <th className="text-left font-medium pb-2">{firstColumn}</th>
                            <th className="text-right font-medium pb-2 w-12">건수</th>
                            <th className="text-right font-medium pb-2 w-28">합계</th>
                            <th className="pb-2 w-2/5"><span className="sr-only">비율 막대</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => (
                            <tr key={row.key} className="border-t border-white/5">
                                <td className="py-2 text-white/75">{row.label}</td>
                                <td className="py-2 text-right text-white/50">{row.count}</td>
                                <td className={`py-2 text-right font-semibold ${row.total < 0 ? 'text-red-300' : 'text-white'}`}>{row.total.toLocaleString()}원</td>
                                <td className="py-2 pl-3">
                                    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                                        <div className="h-full bg-primary-400" style={{ width: `${barWidth(row.total, max)}%` }} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

/** 사업별·월별·예산과목별 집계. 금액은 모두 budgetUtils의 계산 함수만 사용합니다. */
export default function BudgetSummaryView({ projects, expenses, totalsOptions, hasActiveFilters, onExportCsv }: BudgetSummaryViewProps) {
    const projectRows = projectTotals(projects, expenses, totalsOptions);
    const monthRows = monthlyTotals(expenses);
    const categoryRows = categoryTotals(expenses);
    const grandTotal = expenseListTotal(expenses);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-strong rounded-2xl border border-white/10 p-5 space-y-4"
        >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <p className="text-white font-bold">집계</p>
                    <p className="text-xs text-white/45 mt-1">
                        {hasActiveFilters ? '현재 검색·필터 조건에 맞는' : '전체'} 지출 {expenses.length}건 · 합계 {grandTotal.toLocaleString()}원 기준입니다. 표의 합계는 지출 목록 합계와 같은 계산을 씁니다.
                        {hasActiveFilters && ' 사업별 총예산·전체 사용액·잔액·사용률은 필터와 관계없이 전체 지출 기준입니다.'}
                    </p>
                </div>
                <button type="button" onClick={onExportCsv} className="btn-secondary flex items-center gap-2 whitespace-nowrap text-sm" title="집계 표를 별도 CSV 파일로 저장합니다. 지출 목록 CSV는 그대로입니다.">
                    <Download className="w-4 h-4" />
                    집계 CSV 저장
                </button>
            </div>

            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 overflow-x-auto">
                <h3 className="text-sm font-bold text-white mb-3">사업별</h3>
                {projectRows.length === 0 ? (
                    <p className="text-xs text-white/40">등록된 사업이나 지출이 없습니다.</p>
                ) : (
                    <table className="w-full text-xs min-w-[640px]">
                        <thead>
                            <tr className="text-white/40">
                                <th className="text-left font-medium pb-2">사업명</th>
                                {hasActiveFilters && <th className="text-right font-medium pb-2 w-16">건수(필터)</th>}
                                {hasActiveFilters && <th className="text-right font-medium pb-2">필터 기준 사용액</th>}
                                <th className="text-right font-medium pb-2">총예산</th>
                                {!hasActiveFilters && <th className="text-right font-medium pb-2 w-12">건수</th>}
                                <th className="text-right font-medium pb-2">전체 사용액</th>
                                <th className="text-right font-medium pb-2">전체 잔액</th>
                                <th className="pb-2 w-1/4 text-left font-medium pl-3">사용률(전체)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {projectRows.map(row => {
                                const unassigned = row.key === UNASSIGNED_PROJECT_KEY;
                                const status = getBudgetStatus(row.totalBudget, row.totalSpent);
                                return (
                                    <tr key={row.key} className="border-t border-white/5">
                                        <td className="py-2 text-white/75">{row.label}</td>
                                        {hasActiveFilters && <td className="py-2 text-right text-white/50">{row.count}</td>}
                                        {hasActiveFilters && <td className="py-2 text-right text-white/80">{row.total.toLocaleString()}원</td>}
                                        <td className="py-2 text-right text-white/60">{unassigned ? '-' : `${row.totalBudget.toLocaleString()}원`}</td>
                                        {!hasActiveFilters && <td className="py-2 text-right text-white/50">{row.totalCount}</td>}
                                        <td className="py-2 text-right font-semibold text-white">{row.totalSpent.toLocaleString()}원</td>
                                        <td className={`py-2 text-right ${unassigned ? 'text-white/40' : row.balance < 0 ? 'text-red-300 font-semibold' : 'text-emerald-300'}`}>
                                            {unassigned ? '-' : `${row.balance.toLocaleString()}원`}
                                        </td>
                                        <td className="py-2 pl-3">
                                            {unassigned || row.totalBudget <= 0 ? (
                                                <span className="text-white/35">{unassigned ? '예산 없음' : '예산 미입력'}</span>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                                                        <div className={`h-full ${status.barClassName}`} style={{ width: `${Math.min(Math.max(status.usageRate, 0), 100)}%` }} />
                                                    </div>
                                                    <span className={`w-12 text-right ${status.over ? 'text-red-300' : 'text-white/55'}`}>{status.usageRate}%</span>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SimpleTotalsTable title="월별" firstColumn="월" rows={monthRows} />
                <SimpleTotalsTable title="예산과목별" firstColumn="예산과목" rows={categoryRows} />
            </div>
        </motion.div>
    );
}
