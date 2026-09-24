import type { RefObject } from 'react';
import { Trash2 } from 'lucide-react';
import type { BudgetProject, BudgetProjectItem } from '../../types/budget';
import { formatCurrencyInput, parseCurrencyInput } from '../../utils/currency';
import { budgetItemsTotal, normalizeBudgetItems, toWon, type BudgetStatus } from './budgetUtils';

interface ProjectEditorProps {
    projectForm: Partial<BudgetProject>;
    editingProjectId: string | null;
    projectNameError: string;
    projectNameInputRef: RefObject<HTMLInputElement>;
    onFormChange: (patch: Partial<BudgetProject>) => void;
    onAddItem: () => void;
    onItemChange: (index: number, patch: Partial<BudgetProjectItem>) => void;
    onRemoveItem: (item: BudgetProjectItem, index: number) => void;
    onSave: () => void;
    onCancel: () => void;
    selectedProject: BudgetProject | null;
    projectSpent: number;
    projectBalance: number;
    selectedProjectStatus: BudgetStatus | null;
}

/** 사업 등록/수정 폼과 선택 사업 잔액 요약. */
export default function ProjectEditor({
    projectForm,
    editingProjectId,
    projectNameError,
    projectNameInputRef,
    onFormChange,
    onAddItem,
    onItemChange,
    onRemoveItem,
    onSave,
    onCancel,
    selectedProject,
    projectSpent,
    projectBalance,
    selectedProjectStatus,
}: ProjectEditorProps) {
    const budgetItems = normalizeBudgetItems(projectForm);

    return (
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
            <div className="flex-1">
                <h2 className="text-xl font-bold text-white mb-1">사업 등록/관리</h2>
                <p className="text-white/40 text-sm mb-4">사업별 총예산을 등록하고 지출 연결 내역과 잔액을 확인합니다.</p>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                        <input
                            ref={projectNameInputRef}
                            type="text"
                            placeholder="사업명"
                            aria-label="사업명"
                            value={projectForm.name || ''}
                            onChange={e => onFormChange({ name: e.target.value })}
                            aria-invalid={Boolean(projectNameError)}
                            aria-describedby={projectNameError ? 'budget-project-name-error' : undefined}
                            className={`input-field ${projectNameError ? 'border-red-400/70' : ''}`}
                        />
                        {projectNameError && <p id="budget-project-name-error" className="mt-1 text-xs text-red-300">{projectNameError}</p>}
                    </div>
                    <input
                        type="text"
                        inputMode="numeric"
                        placeholder="총예산"
                        aria-label="총예산(원)"
                        value={formatCurrencyInput(projectForm.totalBudget)}
                        onChange={e => onFormChange({ totalBudget: parseCurrencyInput(e.target.value) })}
                        className="input-field"
                    />
                    <input
                        type="text"
                        placeholder="사업기간 또는 연도"
                        aria-label="사업기간 또는 연도"
                        value={projectForm.period || ''}
                        onChange={e => onFormChange({ period: e.target.value })}
                        className="input-field"
                    />
                    <div className="flex gap-2">
                        <button onClick={onSave} className="btn-primary flex-1 whitespace-nowrap">
                            {editingProjectId ? '수정' : '사업 등록'}
                        </button>
                        {editingProjectId && (
                            <button onClick={onCancel} className="btn-secondary whitespace-nowrap">취소</button>
                        )}
                    </div>
                    <input
                        type="text"
                        placeholder="비고"
                        aria-label="사업 비고"
                        value={projectForm.notes || ''}
                        onChange={e => onFormChange({ notes: e.target.value })}
                        className="input-field sm:col-span-4"
                    />
                    <div className="sm:col-span-4 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-white font-bold">세부 예산 항목</p>
                                <p className="text-xs text-white/40">사업 안에서 사용할 예산 항목을 나누어 등록합니다. 예: 인건비, 사업비, 회의비, 여비</p>
                            </div>
                            <button
                                type="button"
                                onClick={onAddItem}
                                className="btn-secondary text-xs whitespace-nowrap"
                            >
                                항목 추가
                            </button>
                        </div>
                        <div className="space-y-2">
                            {budgetItems.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3">
                                    <p className="text-xs text-white/45">세부 항목 없이도 사업 등록이 가능합니다. 필요하면 항목 추가를 눌러 인건비, 사업비, 회의비처럼 사업 안의 예산 분류를 입력하세요.</p>
                                </div>
                            ) : budgetItems.map((item, idx) => (
                                <div key={item.id} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_1fr_40px] gap-2">
                                    <input
                                        type="text"
                                        placeholder="항목명 예: 인건비, 사업비, 회의비, 여비, 물품비, 강사비"
                                        aria-label={`세부 예산 항목 ${idx + 1} 이름`}
                                        value={item.name}
                                        onChange={e => onItemChange(idx, { name: e.target.value })}
                                        className="input-field"
                                    />
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="항목 예산금액"
                                        aria-label={`세부 예산 항목 ${idx + 1} 금액(원)`}
                                        value={formatCurrencyInput(item.amount)}
                                        onChange={e => onItemChange(idx, { amount: parseCurrencyInput(e.target.value) })}
                                        className="input-field"
                                    />
                                    <input
                                        type="text"
                                        placeholder="메모(선택)"
                                        aria-label={`세부 예산 항목 ${idx + 1} 메모`}
                                        value={item.memo || ''}
                                        onChange={e => onItemChange(idx, { memo: e.target.value })}
                                        className="input-field"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onRemoveItem(item, idx)}
                                        className="rounded-xl bg-red-500/10 text-red-200 hover:bg-red-500/20 flex items-center justify-center"
                                        title="세부 예산 항목 삭제"
                                        aria-label={`${item.name || `세부 예산 항목 ${idx + 1}`} 삭제`}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        {budgetItems.length > 0 && (() => {
                            const itemTotal = budgetItemsTotal(budgetItems);
                            const totalBudget = toWon(projectForm.totalBudget);
                            const exceeds = totalBudget > 0 && itemTotal > totalBudget;
                            return (
                                <p className={`text-xs mt-3 ${exceeds ? 'text-amber-200' : 'text-white/40'}`}>
                                    항목 합계 {itemTotal.toLocaleString()}원 / 총예산 {totalBudget.toLocaleString()}원
                                    {exceeds && ` · 항목 합계가 총예산을 ${(itemTotal - totalBudget).toLocaleString()}원 초과합니다.`}
                                </p>
                            );
                        })()}
                    </div>
                </div>
            </div>
            <div className="w-full lg:w-80 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                <p className="text-white/40 text-sm">선택 사업 잔액</p>
                <p className="text-lg font-bold text-white mt-1">{selectedProject?.name || '전체/사업 미지정'}</p>
                {selectedProject ? (
                    <div className="mt-3 space-y-1 text-sm">
                        <p className="text-white/50">총예산: <span className="text-white">{toWon(selectedProject.totalBudget).toLocaleString()}원</span></p>
                        <p className="text-white/50">사용액: <span className="text-white">{projectSpent.toLocaleString()}원</span></p>
                        <p className="text-white/50">잔액: <span className={projectBalance < 0 ? 'text-red-300 font-bold' : 'text-emerald-300 font-bold'}>{projectBalance.toLocaleString()}원</span></p>
                        {selectedProjectStatus && (
                            <div className={`inline-flex items-center gap-2 mt-2 px-3 py-1 rounded-full border text-xs font-bold ${selectedProjectStatus.className}`}>
                                사용률 {selectedProjectStatus.usageRate}% · {selectedProjectStatus.label}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-white/35 text-sm mt-3">사업 필터를 선택하면 해당 사업 잔액이 표시됩니다.</p>
                )}
            </div>
        </div>
    );
}
