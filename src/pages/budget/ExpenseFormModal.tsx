import { useEffect, useRef, useState, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { Camera, Eye, EyeOff, Loader2, Upload, X } from 'lucide-react';
import type { BudgetProject, Expense } from '../../types/budget';
import { useDataStore } from '../../store/dataStore';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { useConfirm } from '../../components/common/ConfirmProvider';
import { useAppToast } from '../../components/Toast';
import { safeErrorMetadata } from '../../utils/safeError';
import { formatCurrencyInput, parseCurrencyInput } from '../../utils/currency';
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, VAT_RULE_DESCRIPTION, expenseTotal, formatBizNo, getExpenseWarnings, isOverBudget, normalizeBudgetItems, projectSpent, toWon, vatFromSupply } from './budgetUtils';
import {
    EXPENSE_FIELD_ORDER,
    applyExpenseAmountChange,
    createEmptyExpenseForm,
    expenseToForm,
    formatQuantityInput,
    getExpenseFormSignature,
    parseQuantityInput,
    wonInputHint,
    validateExpenseForm,
    type ExpenseFieldErrors,
    type ExpenseFieldKey,
    type ExpenseForm,
} from './expenseForm';
import { buildReceiptItemsSummary, useReceiptOcr } from './useReceiptOcr';

interface ExpenseFormModalProps {
    /** 수정할 지출. 없으면 새 지출 등록. */
    editingExpense: Expense | null;
    /** 새 지출에 미리 연결할 사업(현재 사업 필터). */
    defaultProject: { id: string; name: string } | null;
    budgetProjects: BudgetProject[];
    onClose: () => void;
    /** 저장하지 않은 입력이 있는지 페이지에 알립니다(페이지 이탈 확인용). */
    onDirtyChange?: (dirty: boolean) => void;
}

function FieldError({ id, message }: { id: string; message?: string }) {
    if (!message) return null;
    return <p id={id} className="mt-1 text-xs text-red-300">{message}</p>;
}

/** 저장을 막지 않는 주의 문구(노란색). */
function FieldWarning({ id, message }: { id: string; message?: string }) {
    if (!message) return null;
    return <p id={id} role="status" className="mt-1 text-xs text-amber-200/90">{message}</p>;
}

/** 지출 등록/수정 모달. 열릴 때마다 새로 마운트되므로 닫으면 입력·OCR 상태가 초기화됩니다. */
export default function ExpenseFormModal({ editingExpense, defaultProject, budgetProjects, onClose, onDirtyChange }: ExpenseFormModalProps) {
    const expenses = useDataStore(state => state.expenses);
    const addExpense = useDataStore(state => state.addExpense);
    const updateExpense = useDataStore(state => state.updateExpense);
    const confirm = useConfirm();
    const showToast = useAppToast();

    const [form, setForm] = useState<ExpenseForm>(() => (editingExpense ? expenseToForm(editingExpense) : createEmptyExpenseForm(defaultProject)));
    const [baselineSignature] = useState(() => getExpenseFormSignature(form));
    const [errors, setErrors] = useState<ExpenseFieldErrors>({});
    // 부가세 자동 계산은 선택 기능입니다. 부가세 칸을 직접 고치면 꺼집니다.
    const [autoVat, setAutoVat] = useState(false);
    const [saving, setSaving] = useState(false);
    // 수량 입력 중인 원문("1." 등). null이면 form.quantity를 표시합니다.
    const [quantityText, setQuantityText] = useState<string | null>(null);
    const [unitPriceHint, setUnitPriceHint] = useState('');
    const [closed, setClosed] = useState(false);
    const saveInFlightRef = useRef(false);
    const closePromptOpenRef = useRef(false);
    const dateRef = useRef<HTMLInputElement>(null);
    const descriptionRef = useRef<HTMLInputElement>(null);
    const quantityRef = useRef<HTMLInputElement>(null);
    const amountRef = useRef<HTMLInputElement>(null);
    const fieldRefs: Record<ExpenseFieldKey, RefObject<HTMLInputElement>> = {
        date: dateRef,
        description: descriptionRef,
        quantity: quantityRef,
        amount: amountRef,
    };

    const ocr = useReceiptOcr(setForm, () => setErrors({}));
    const { ocrLoading } = ocr;

    const dirty = !closed && (getExpenseFormSignature(form) !== baselineSignature || ocr.hasOcrInput);
    const onDirtyChangeRef = useRef(onDirtyChange);
    onDirtyChangeRef.current = onDirtyChange;
    useEffect(() => { onDirtyChangeRef.current?.(dirty); }, [dirty]);
    useEffect(() => () => onDirtyChangeRef.current?.(false), []);

    const finishAndClose = () => {
        setClosed(true);
        onDirtyChangeRef.current?.(false);
        onClose();
    };

    const requestClose = async () => {
        if (saveInFlightRef.current || ocrLoading || closePromptOpenRef.current) return;
        if (dirty) {
            closePromptOpenRef.current = true;
            try {
                const ok = await confirm({
                    title: '작성 중인 지출',
                    message: '작성 중인 지출 내용이 있습니다. 저장하지 않고 닫으시겠습니까?',
                    confirmLabel: '닫기',
                    cancelLabel: '계속 작성',
                    tone: 'danger',
                });
                if (!ok) return;
            } finally {
                closePromptOpenRef.current = false;
            }
        }
        finishAndClose();
    };
    const dialogRef = useDialogFocus(true, requestClose);

    const clearError = (key: ExpenseFieldKey) => {
        setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
    };

    const handleSubmit = async () => {
        if (saveInFlightRef.current || ocrLoading) return;
        const nextErrors = validateExpenseForm(form);
        const quantityParse = quantityText === null ? null : parseQuantityInput(quantityText);
        if (quantityParse && !quantityParse.ok) nextErrors.quantity = quantityParse.error;
        setErrors(nextErrors);
        const firstError = EXPENSE_FIELD_ORDER.find(key => nextErrors[key]);
        if (firstError) {
            fieldRefs[firstError].current?.focus();
            return;
        }
        saveInFlightRef.current = true;
        try {
            const selectedFormProject = budgetProjects.find(project => project.id === form.projectId);
            const selectedBudgetItem = selectedFormProject
                ? normalizeBudgetItems(selectedFormProject).find(item => item.id === form.budgetItemId)
                : undefined;
            if (selectedFormProject) {
                const projectedSpent = projectSpent(selectedFormProject.id, expenses, editingExpense?.id) + expenseTotal(form);
                if (isOverBudget(selectedFormProject.totalBudget, projectedSpent)) {
                    const overAmount = projectedSpent - toWon(selectedFormProject.totalBudget);
                    const proceed = await confirm({
                        title: '사업 예산 초과',
                        message: `이 지출을 등록하면 해당 사업 예산을 ${overAmount.toLocaleString()}원 초과합니다. 그래도 저장하시겠습니까?`,
                        confirmLabel: '저장',
                        cancelLabel: '취소',
                    });
                    if (!proceed) return;
                }
            }
            setSaving(true);
            const payload = {
                ...form,
                projectName: selectedFormProject?.name || form.projectName || '',
                budgetItemId: selectedBudgetItem?.id || '',
                budgetItemName: selectedBudgetItem?.name || '',
            };
            if (editingExpense?.id) {
                await updateExpense(editingExpense.id, payload);
            } else {
                await addExpense(payload as Omit<Expense, 'id' | 'organization' | 'createdAt' | 'createdBy'>);
            }
            showToast(editingExpense?.id ? '지출 내역을 수정했습니다.' : '지출을 등록했습니다.', 'success');
            finishAndClose();
        } catch (error) {
            console.error('Submit Error:', safeErrorMetadata(error, 'expense-save'));
            showToast('저장 중 오류가 발생했습니다. 입력한 내용은 그대로 남아 있습니다.', 'error');
        } finally {
            saveInFlightRef.current = false;
            setSaving(false);
        }
    };

    const formProject = budgetProjects.find(p => p.id === form.projectId);
    const selectedProjectItems = normalizeBudgetItems(formProject);
    // 정합성 점검에서 넘어온 경우처럼 연결이 끊긴 사업·항목도 선택 상자에 보여야 바꿀 수 있습니다.
    const missingProject = Boolean(form.projectId) && !formProject;
    const missingBudgetItem = Boolean(form.budgetItemId) && !selectedProjectItems.some(item => item.id === form.budgetItemId);
    const errorClass = (key: ExpenseFieldKey) => (errors[key] ? 'border-red-400/70' : '');
    const warnings = getExpenseWarnings(form, { projects: budgetProjects, expenses, excludeExpenseId: editingExpense?.id });
    const dateWarning = [warnings.futureDate, warnings.outsidePeriod].filter(Boolean).join(' ');

    const toggleAutoVat = (checked: boolean) => {
        setAutoVat(checked);
        if (checked) {
            setForm(prev => applyExpenseAmountChange(prev, { vat: vatFromSupply(Number(prev.supplyAmount) || 0) }));
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={requestClose}
        >
            <motion.div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="expense-dialog-title"
                aria-busy={saving}
                tabIndex={-1}
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#0f1129] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h3 id="expense-dialog-title" className="text-xl font-bold text-white">
                        {editingExpense ? '지출 내역 수정' : '새 지출 등록'}
                    </h3>
                    <button onClick={requestClose} className="p-2 rounded-xl hover:bg-white/10 text-white/60" aria-label="지출 입력 닫기">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* 영수증 OCR 보조 입력 */}
                <div className="mb-6 p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <p className="text-green-300 text-sm font-medium flex items-center gap-2">
                            <Camera className="w-4 h-4" />
                            영수증 OCR로 자동 입력
                        </p>
                        {ocr.ocrRawText && (
                            <button
                                type="button"
                                onClick={ocr.toggleOcrRaw}
                                className="text-xs text-white/45 hover:text-white flex items-center gap-1"
                            >
                                {ocr.showOcrRaw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                {ocr.showOcrRaw ? '원문 숨기기' : '원문 보기'}
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-white/35 mb-3">
                        OCR은 입력칸을 채우는 보조 기능입니다. 자동 저장되지 않으며, 저장 전 내용을 확인해 주세요.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <label className={`btn-secondary flex items-center justify-center gap-2 text-sm ${ocrLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                            <Upload className="w-4 h-4" />
                            파일 선택
                            <input
                                type="file"
                                accept="image/jpeg,image/png,application/pdf"
                                className="hidden"
                                disabled={ocrLoading}
                                onChange={e => {
                                    ocr.selectOcrFile(e.target.files?.[0] || null);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                        <button
                            type="button"
                            onClick={ocr.runOcr}
                            disabled={ocrLoading || !ocr.ocrFile}
                            className="btn-primary flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                        >
                            {ocrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                            OCR 실행
                        </button>
                        {ocr.ocrFile && <span className="text-xs text-white/45 self-center truncate">선택됨: {ocr.ocrFile.name}</span>}
                    </div>
                    {ocr.ocrError && <div role="alert" className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-xs">{ocr.ocrError}</div>}
                    {ocr.ocrMessage && <div role="status" className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-100 text-xs">{ocr.ocrMessage}</div>}
                    {ocr.ocrParsed?.items?.length ? (
                        <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10">
                            <p className="text-xs text-white/50 mb-2">감지된 품목 {ocr.ocrParsed.items.length}개</p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => ocr.applyOcrItems('firstItem')} className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-xs hover:bg-white/15">첫 번째 품목으로 채우기</button>
                                <button type="button" onClick={() => ocr.applyOcrItems('allItems')} className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-200 text-xs hover:bg-emerald-500/25">전체 품목 합계로 채우기</button>
                            </div>
                            <p className="text-[11px] text-white/30 mt-2 line-clamp-2">{buildReceiptItemsSummary(ocr.ocrParsed.items)}</p>
                        </div>
                    ) : null}
                    {ocr.showOcrRaw && ocr.ocrRawText && (
                        <pre className="mt-3 p-3 rounded-lg bg-black/30 border border-white/10 text-white/55 text-xs max-h-44 overflow-y-auto whitespace-pre-wrap font-sans">
                            {ocr.ocrRawText}
                        </pre>
                    )}
                </div>

                {/* 폼 필드 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                        <label htmlFor="expense-project" className="block text-sm font-medium text-white/70 mb-1.5">연결 사업</label>
                        <select
                            id="expense-project"
                            value={form.projectId || ''}
                            onChange={e => {
                                const project = budgetProjects.find(p => p.id === e.target.value);
                                setForm(prev => ({
                                    ...prev,
                                    projectId: project?.id || '',
                                    projectName: project?.name || '',
                                    budgetItemId: '',
                                    budgetItemName: '',
                                }));
                            }}
                            className="input-field"
                        >
                            <option value="">사업 미지정</option>
                            {missingProject && <option value={form.projectId}>(삭제된 사업) {form.projectName || '이름 없음'}</option>}
                            {budgetProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                        </select>
                        {missingProject
                            ? <FieldWarning id="expense-project-warning" message="연결된 사업이 목록에 없습니다. 다른 사업을 고르거나 ‘사업 미지정’으로 바꿔 주세요." />
                            : <p className="text-xs text-white/35 mt-1">영수증 OCR을 실행해도 선택한 사업은 덮어쓰지 않습니다.</p>}
                    </div>
                    {form.projectId && (
                        <div className="sm:col-span-2">
                            <label htmlFor="expense-budget-item" className="block text-sm font-medium text-white/70 mb-1.5">세부 예산 항목</label>
                            <select
                                id="expense-budget-item"
                                value={form.budgetItemId || ''}
                                onChange={e => {
                                    const item = selectedProjectItems.find(budgetItem => budgetItem.id === e.target.value);
                                    setForm(prev => ({
                                        ...prev,
                                        budgetItemId: item?.id || '',
                                        budgetItemName: item?.name || '',
                                    }));
                                }}
                                className="input-field"
                            >
                                <option value="">항목 미지정</option>
                                {missingBudgetItem && <option value={form.budgetItemId}>(없는 항목) {form.budgetItemName || '이름 없음'}</option>}
                                {selectedProjectItems.map(item => (
                                    <option key={item.id} value={item.id}>{item.name}</option>
                                ))}
                            </select>
                            {missingBudgetItem
                                ? <FieldWarning id="expense-budget-item-warning" message="연결된 세부 항목이 사업에 없습니다. 저장하면 ‘항목 미지정’이 되니 알맞은 항목을 골라 주세요." />
                                : <p className="text-xs text-white/35 mt-1">세부 항목 선택은 선택사항입니다. OCR 실행 시 이 값은 유지됩니다.</p>}
                        </div>
                    )}
                    <div>
                        <label htmlFor="expense-date" className="block text-sm font-medium text-white/70 mb-1.5">지출일자 *</label>
                        <input
                            id="expense-date"
                            ref={dateRef}
                            type="date"
                            value={form.date || ''}
                            onChange={e => { setForm(prev => ({ ...prev, date: e.target.value })); clearError('date'); }}
                            aria-invalid={Boolean(errors.date)}
                            aria-describedby={errors.date ? 'expense-date-error' : dateWarning ? 'expense-date-warning' : undefined}
                            className={`input-field ${errorClass('date')}`}
                        />
                        <FieldError id="expense-date-error" message={errors.date} />
                        {!errors.date && <FieldWarning id="expense-date-warning" message={dateWarning} />}
                    </div>
                    <div>
                        <label htmlFor="expense-category" className="block text-sm font-medium text-white/70 mb-1.5">예산과목 *</label>
                        <select
                            id="expense-category"
                            value={form.category || '사업비'}
                            onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                            className="input-field"
                        >
                            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div className="sm:col-span-2">
                        <label htmlFor="expense-sub-item" className="block text-sm font-medium text-white/70 mb-1.5">세부항목 (세부사업명)</label>
                        <input
                            id="expense-sub-item"
                            type="text"
                            placeholder="예: 직업재활서비스, 장애인 취업지원"
                            value={form.budgetItem || ''}
                            onChange={e => setForm(prev => ({ ...prev, budgetItem: e.target.value }))}
                            className="input-field"
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <label htmlFor="expense-description" className="block text-sm font-medium text-white/70 mb-1.5">품명/내용 *</label>
                        <input
                            id="expense-description"
                            ref={descriptionRef}
                            type="text"
                            placeholder="예: 프로그램 사무용품 구입"
                            value={form.description || ''}
                            onChange={e => { setForm(prev => ({ ...prev, description: e.target.value })); clearError('description'); }}
                            aria-invalid={Boolean(errors.description)}
                            aria-describedby={errors.description ? 'expense-description-error' : undefined}
                            className={`input-field ${errorClass('description')}`}
                        />
                        <FieldError id="expense-description-error" message={errors.description} />
                    </div>

                    {/* 수량·단가·금액: 쉼표가 들어간 금액("12,000")을 붙여넣어도 그대로 인식합니다. */}
                    <div>
                        <label htmlFor="expense-quantity" className="block text-sm font-medium text-white/70 mb-1.5">수량</label>
                        <input
                            id="expense-quantity"
                            ref={quantityRef}
                            type="text"
                            inputMode="decimal"
                            placeholder="1"
                            value={quantityText ?? formatQuantityInput(form.quantity)}
                            onChange={e => {
                                const text = e.target.value;
                                setQuantityText(text);
                                const parsed = parseQuantityInput(text);
                                if (!parsed.ok) {
                                    setErrors(prev => ({ ...prev, quantity: parsed.error }));
                                    return;
                                }
                                setForm(prev => applyExpenseAmountChange(prev, { quantity: parsed.value }, { autoVat }));
                                clearError('quantity');
                            }}
                            onBlur={() => {
                                if (quantityText !== null && parseQuantityInput(quantityText).ok) setQuantityText(null);
                            }}
                            aria-invalid={Boolean(errors.quantity)}
                            aria-describedby={errors.quantity ? 'expense-quantity-error' : undefined}
                            className={`input-field ${errorClass('quantity')}`}
                        />
                        <FieldError id="expense-quantity-error" message={errors.quantity} />
                    </div>
                    <div>
                        <label htmlFor="expense-unit-price" className="block text-sm font-medium text-white/70 mb-1.5">단가(원)</label>
                        <input
                            id="expense-unit-price"
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={formatCurrencyInput(form.unitPrice)}
                            onChange={e => {
                                const hint = wonInputHint(e.target.value);
                                setUnitPriceHint(hint);
                                if (hint) return;
                                const unitPrice = parseCurrencyInput(e.target.value);
                                setForm(prev => applyExpenseAmountChange(prev, { unitPrice }, { autoVat }));
                                clearError('amount');
                            }}
                            onBlur={() => setUnitPriceHint('')}
                            aria-describedby={unitPriceHint ? 'expense-unit-price-hint' : undefined}
                            className="input-field"
                        />
                        <FieldWarning id="expense-unit-price-hint" message={unitPriceHint} />
                    </div>
                    <div>
                        <label htmlFor="expense-supply-amount" className="block text-sm font-medium text-white/70 mb-1.5">공급가액(원)</label>
                        <input
                            id="expense-supply-amount"
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={formatCurrencyInput(form.supplyAmount)}
                            onChange={e => {
                                const supplyAmount = parseCurrencyInput(e.target.value);
                                setForm(prev => applyExpenseAmountChange(prev, { supplyAmount }, { autoVat }));
                                clearError('amount');
                            }}
                            className="input-field"
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                            <label htmlFor="expense-vat" className="block text-sm font-medium text-white/70">부가세(원)</label>
                            <label className="flex items-center gap-1.5 text-xs text-white/55 cursor-pointer" title={VAT_RULE_DESCRIPTION}>
                                <input
                                    type="checkbox"
                                    checked={autoVat}
                                    onChange={e => toggleAutoVat(e.target.checked)}
                                    className="rounded"
                                />
                                자동 계산(10%)
                            </label>
                        </div>
                        <input
                            id="expense-vat"
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={formatCurrencyInput(form.vat)}
                            aria-describedby="expense-vat-hint"
                            onChange={e => {
                                const vat = parseCurrencyInput(e.target.value);
                                setAutoVat(false);
                                setForm(prev => applyExpenseAmountChange(prev, { vat }));
                            }}
                            className="input-field"
                        />
                        <p id="expense-vat-hint" className="mt-1 text-xs text-white/35">
                            {autoVat ? '공급가액의 10%, 원 미만 버림. 직접 고치면 자동 계산이 꺼집니다.' : '부가세가 없으면 비워 두세요. 자동 계산을 켜면 공급가액의 10%(원 미만 버림)로 채웁니다.'}
                        </p>
                    </div>
                    <div>
                        <label htmlFor="expense-amount" className="block text-sm font-medium text-white/70 mb-1.5">총 금액(원) *</label>
                        <input
                            id="expense-amount"
                            ref={amountRef}
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={formatCurrencyInput(form.amount)}
                            onChange={e => {
                                const amount = parseCurrencyInput(e.target.value);
                                setForm(prev => ({ ...prev, amount }));
                                clearError('amount');
                            }}
                            aria-invalid={Boolean(errors.amount)}
                            aria-describedby={errors.amount ? 'expense-amount-error' : 'expense-amount-hint'}
                            className={`input-field font-semibold ${errorClass('amount')}`}
                        />
                        {errors.amount
                            ? <FieldError id="expense-amount-error" message={errors.amount} />
                            : <p id="expense-amount-hint" className="mt-1 text-xs text-white/35">수량·단가나 공급가액·부가세를 넣으면 자동 계산됩니다.</p>}
                    </div>

                    {/* 거래처 정보 */}
                    <div>
                        <label htmlFor="expense-vendor" className="block text-sm font-medium text-white/70 mb-1.5">거래처</label>
                        <input
                            id="expense-vendor"
                            type="text"
                            placeholder="거래처명"
                            value={form.vendor || ''}
                            onChange={e => setForm(prev => ({ ...prev, vendor: e.target.value }))}
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label htmlFor="expense-vendor-biz-no" className="block text-sm font-medium text-white/70 mb-1.5">사업자등록번호</label>
                        <input
                            id="expense-vendor-biz-no"
                            type="text"
                            placeholder="000-00-00000"
                            value={form.vendorBizNo || ''}
                            onChange={e => setForm(prev => ({ ...prev, vendorBizNo: e.target.value }))}
                            onBlur={e => {
                                const formatted = formatBizNo(e.target.value);
                                if (formatted !== e.target.value) setForm(prev => ({ ...prev, vendorBizNo: formatted }));
                            }}
                            aria-describedby={warnings.bizNo ? 'expense-vendor-biz-no-warning' : undefined}
                            className={`input-field ${warnings.bizNo ? 'border-amber-400/60' : ''}`}
                        />
                        <FieldWarning id="expense-vendor-biz-no-warning" message={warnings.bizNo} />
                    </div>

                    {/* 결제 정보 */}
                    <div>
                        <label htmlFor="expense-payment-method" className="block text-sm font-medium text-white/70 mb-1.5">결제방법</label>
                        <select
                            id="expense-payment-method"
                            value={form.paymentMethod || '카드'}
                            onChange={e => setForm(prev => ({ ...prev, paymentMethod: e.target.value }))}
                            className="input-field"
                        >
                            {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="expense-card-type" className="block text-sm font-medium text-white/70 mb-1.5">카드 종류</label>
                        <input
                            id="expense-card-type"
                            type="text"
                            placeholder="예: 신한카드, BC카드"
                            value={form.cardType || ''}
                            onChange={e => setForm(prev => ({ ...prev, cardType: e.target.value }))}
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label htmlFor="expense-card-last-four" className="block text-sm font-medium text-white/70 mb-1.5">카드 끝 4자리</label>
                        <input
                            id="expense-card-last-four"
                            type="text"
                            placeholder="1234"
                            maxLength={4}
                            value={form.cardLastFour || ''}
                            onChange={e => setForm(prev => ({ ...prev, cardLastFour: e.target.value }))}
                            className="input-field"
                        />
                    </div>
                    <div>
                        <label htmlFor="expense-approval-no" className="block text-sm font-medium text-white/70 mb-1.5">승인번호</label>
                        <input
                            id="expense-approval-no"
                            type="text"
                            placeholder="승인번호"
                            value={form.approvalNo || ''}
                            onChange={e => setForm(prev => ({ ...prev, approvalNo: e.target.value }))}
                            aria-describedby={warnings.duplicateApproval ? 'expense-approval-no-warning' : undefined}
                            className={`input-field ${warnings.duplicateApproval ? 'border-amber-400/60' : ''}`}
                        />
                        <FieldWarning id="expense-approval-no-warning" message={warnings.duplicateApproval} />
                    </div>
                    <div className="sm:col-span-2">
                        <label htmlFor="expense-notes" className="block text-sm font-medium text-white/70 mb-1.5">비고</label>
                        <input
                            id="expense-notes"
                            type="text"
                            placeholder="메모사항"
                            value={form.notes || ''}
                            onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                            className="input-field"
                        />
                    </div>
                </div>

                <div className="flex gap-3 mt-6">
                    <button onClick={handleSubmit} disabled={saving || ocrLoading} className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                        {saving ? '저장 중…' : editingExpense ? '수정 완료' : '지출 등록'}
                    </button>
                    <button onClick={requestClose} className="btn-secondary">
                        취소
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
