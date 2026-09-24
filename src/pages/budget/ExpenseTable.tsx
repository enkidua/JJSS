import { motion } from 'framer-motion';
import { Edit3, Loader2, Receipt, Trash2 } from 'lucide-react';
import type { Expense } from '../../types/budget';
import { expenseTotal, formatExpenseDate } from './budgetUtils';

interface ExpenseTableProps {
    loading: boolean;
    expenses: Expense[];
    totalAmount: number;
    hasActiveFilters: boolean;
    onResetFilters: () => void;
    selectedIds: ReadonlySet<string>;
    allVisibleSelected: boolean;
    onToggleAllVisible: (checked: boolean) => void;
    onToggle: (id: string) => void;
    onEdit: (expense: Expense) => void;
    onDelete: (id: string) => void;
    getProjectName: (expense: Partial<Expense>) => string;
    getBudgetItemName: (expense: Partial<Expense>) => string;
}

/** 현재 필터에 맞는 지출 목록 표(선택 체크박스·수정·삭제). */
export default function ExpenseTable({
    loading,
    expenses,
    totalAmount,
    hasActiveFilters,
    onResetFilters,
    selectedIds,
    allVisibleSelected,
    onToggleAllVisible,
    onToggle,
    onEdit,
    onDelete,
    getProjectName,
    getBudgetItemName,
}: ExpenseTableProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="glass-strong rounded-2xl border border-white/10 overflow-hidden"
        >
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
                    <span className="ml-3 text-white/50">데이터를 불러오는 중...</span>
                </div>
            ) : expenses.length === 0 ? (
                <div className="text-center py-20">
                    <Receipt className="w-16 h-16 mx-auto text-white/10 mb-4" />
                    <p className="text-white/70 text-lg mb-2">{hasActiveFilters ? '조건에 맞는 지출 내역이 없습니다' : '등록된 지출 내역이 없습니다'}</p>
                    {hasActiveFilters ? (
                        <button type="button" className="btn-secondary mt-2" onClick={onResetFilters}>검색·필터 초기화</button>
                    ) : <p className="text-white/60 text-sm">위의 '지출 등록' 버튼을 눌러 시작하세요</p>}
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/10">
                                <th className="px-4 py-3 text-left text-white/40 font-medium w-10">
                                    <input
                                        type="checkbox"
                                        checked={allVisibleSelected}
                                        onChange={e => onToggleAllVisible(e.target.checked)}
                                        aria-label="현재 화면의 지출 항목 전체 선택"
                                        className="rounded"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left text-white/40 font-medium">날짜</th>
                                <th className="px-4 py-3 text-left text-white/40 font-medium">사업</th>
                                <th className="px-4 py-3 text-left text-white/40 font-medium">세부 항목</th>
                                <th className="px-4 py-3 text-left text-white/40 font-medium">구분</th>
                                <th className="px-4 py-3 text-left text-white/40 font-medium">품명/내용</th>
                                <th className="px-4 py-3 text-left text-white/40 font-medium">거래처</th>
                                <th className="px-4 py-3 text-right text-white/40 font-medium">금액</th>
                                <th className="px-4 py-3 text-center text-white/40 font-medium">결제</th>
                                <th className="px-4 py-3 text-center text-white/40 font-medium">관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {expenses.map((e, i) => (
                                <tr key={e.id || i} className="border-b border-white/5 hover:bg-white/5 transition">
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(e.id && selectedIds.has(e.id))}
                                            aria-label={`${e.date} ${e.description} 지출 선택`}
                                            onChange={() => onToggle(e.id!)}
                                            className="rounded"
                                        />
                                    </td>
                                    <td className="px-4 py-3 text-white/60 whitespace-nowrap">{formatExpenseDate(e.date)}</td>
                                    <td className="px-4 py-3 text-white/60">{getProjectName(e)}</td>
                                    <td className="px-4 py-3 text-white/50">{getBudgetItemName(e)}</td>
                                    <td className="px-4 py-3">
                                        <span className="px-2 py-1 rounded-lg bg-primary-500/10 text-primary-300 text-xs">{e.category}</span>
                                    </td>
                                    <td className="px-4 py-3 text-white/80">{e.description}</td>
                                    <td className="px-4 py-3 text-white/50">{e.vendor || '-'}</td>
                                    <td className="px-4 py-3 text-right text-white font-semibold">{expenseTotal(e).toLocaleString()}원</td>
                                    <td className="px-4 py-3 text-center text-white/50 text-xs">{e.paymentMethod}</td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button aria-label={`${e.description} 지출 수정`} onClick={() => onEdit(e)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-blue-400 transition">
                                                <Edit3 className="w-3.5 h-3.5" />
                                            </button>
                                            <button aria-label={`${e.description} 지출 삭제`} onClick={() => onDelete(e.id!)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-red-400 transition">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-white/5">
                                <td colSpan={7} className="px-4 py-3 text-right text-white/60 font-semibold">합계</td>
                                <td className="px-4 py-3 text-right text-white font-bold text-lg">{totalAmount.toLocaleString()}원</td>
                                <td colSpan={2}></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </motion.div>
    );
}
