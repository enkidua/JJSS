import type { Expense } from '../../types/budget';
import { localDateKey, parseLocalDate } from '../../utils/date';
import { supplyFromQuantity, vatFromSupply } from './budgetUtils';

export type ExpenseForm = Partial<Expense>;
export type ExpenseFieldKey = 'date' | 'description' | 'quantity' | 'amount';
export type ExpenseFieldErrors = Partial<Record<ExpenseFieldKey, string>>;
/** 저장 시 첫 번째 오류 칸으로 이동할 때 사용하는 화면 순서. */
export const EXPENSE_FIELD_ORDER: ExpenseFieldKey[] = ['date', 'description', 'quantity', 'amount'];

export function createEmptyExpenseForm(defaultProject?: { id: string; name: string } | null): ExpenseForm {
    return {
        date: localDateKey(),
        category: '사업비',
        budgetItem: '',
        projectId: defaultProject?.id || '',
        projectName: defaultProject?.name || '',
        budgetItemId: '',
        budgetItemName: '',
        description: '',
        quantity: 1,
        unitPrice: 0,
        supplyAmount: 0,
        vat: 0,
        amount: 0,
        vendor: '',
        vendorBizNo: '',
        paymentMethod: '카드',
        cardType: '',
        cardLastFour: '',
        approvalNo: '',
        notes: '',
    };
}

export function expenseToForm(expense: Expense): ExpenseForm {
    return {
        date: expense.date,
        category: expense.category,
        budgetItem: expense.budgetItem || '',
        budgetItemId: expense.budgetItemId || '',
        budgetItemName: expense.budgetItemName || '',
        projectId: expense.projectId || '',
        projectName: expense.projectName || '',
        description: expense.description,
        quantity: expense.quantity || 1,
        unitPrice: expense.unitPrice || 0,
        supplyAmount: expense.supplyAmount || 0,
        vat: expense.vat || 0,
        amount: expense.amount,
        vendor: expense.vendor,
        vendorBizNo: expense.vendorBizNo || '',
        paymentMethod: expense.paymentMethod,
        cardType: expense.cardType || '',
        cardLastFour: expense.cardLastFour || '',
        approvalNo: expense.approvalNo || '',
        notes: expense.notes,
    };
}

export function getExpenseFormSignature(value: ExpenseForm) {
    return JSON.stringify({
        date: value.date || '',
        category: value.category || '',
        budgetItem: value.budgetItem || '',
        budgetItemId: value.budgetItemId || '',
        budgetItemName: value.budgetItemName || '',
        projectId: value.projectId || '',
        projectName: value.projectName || '',
        description: value.description || '',
        quantity: Number(value.quantity || 0),
        unitPrice: Number(value.unitPrice || 0),
        supplyAmount: Number(value.supplyAmount || 0),
        vat: Number(value.vat || 0),
        amount: Number(value.amount || 0),
        vendor: value.vendor || '',
        vendorBizNo: value.vendorBizNo || '',
        paymentMethod: value.paymentMethod || '',
        cardType: value.cardType || '',
        cardLastFour: value.cardLastFour || '',
        approvalNo: value.approvalNo || '',
        notes: value.notes || '',
    });
}

// ── 수량·금액 입력 ──────────────────────────────────────────────────────────

/** 수량은 소수점 둘째 자리까지(예: 1.5시간, 0.25개월) 허용합니다. */
export const QUANTITY_MAX_DECIMALS = 2;

export type ParsedNumberInput = { ok: true; value: number } | { ok: false; error: string };

/** 수량 입력 문자열 → 숫자. 쉼표·공백은 무시하고, 소수점 셋째 자리 이상이나 숫자 외 문자는 오류로 돌려줍니다. */
export function parseQuantityInput(text: string): ParsedNumberInput {
    const cleaned = String(text ?? '').replace(/[,\s]/g, '');
    if (!cleaned || cleaned === '.') return { ok: true, value: 0 };
    if (!/^\d*\.?\d*$/.test(cleaned)) return { ok: false, error: '수량은 숫자로 입력해 주세요.' };
    const decimals = cleaned.split('.')[1] || '';
    if (decimals.length > QUANTITY_MAX_DECIMALS) {
        return { ok: false, error: `수량은 소수점 ${QUANTITY_MAX_DECIMALS === 2 ? '둘째' : QUANTITY_MAX_DECIMALS} 자리까지 입력할 수 있습니다.` };
    }
    const value = Number(cleaned);
    if (!Number.isFinite(value)) return { ok: false, error: '수량은 숫자로 입력해 주세요.' };
    return { ok: true, value: Math.round(value * 100) / 100 };
}

/** 입력칸 표시용: 1234.5 → '1,234.5', 0/빈값 → ''. */
export function formatQuantityInput(value: unknown): string {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric === 0) return '';
    return numeric.toLocaleString('ko-KR', { maximumFractionDigits: QUANTITY_MAX_DECIMALS });
}

/** 원 단위 금액 칸(단가 등)에 소수점이 들어오면 안내 문구, 아니면 ''. ("1.5" → 15로 바뀌는 문제 방지) */
export function wonInputHint(text: string): string {
    return /[.．]/.test(String(text ?? '')) ? '원 단위 정수로 입력해 주세요(소수점은 입력할 수 없습니다).' : '';
}

export function validateExpenseForm(value: ExpenseForm): ExpenseFieldErrors {
    const errors: ExpenseFieldErrors = {};
    if (!value.date) errors.date = '지출일자를 입력해 주세요.';
    else if (!parseLocalDate(value.date)) errors.date = '지출일자를 달력에서 다시 선택해 주세요.';
    if (!String(value.description || '').trim()) errors.description = '품명/내용을 입력해 주세요.';
    if (!(Number(value.quantity) > 0)) errors.quantity = '수량을 0보다 크게 입력해 주세요.';
    if (!(Number(value.amount) > 0)) errors.amount = '총 금액을 입력해 주세요.';
    return errors;
}

/**
 * 수량·단가·공급가액·부가세를 바꾸면 공급가액(수량×단가)과 총 금액(공급가액+부가세)을 함께 다시 계산합니다.
 * `autoVat`가 켜져 있고 부가세를 직접 고친 것이 아니면 부가세를 공급가액의 10%(원 미만 절사)로 채웁니다.
 * 수량이나 단가가 비어 있으면 기존 공급가액을 유지해 입력 중 값이 사라지지 않게 합니다.
 */
export function applyExpenseAmountChange(
    prev: ExpenseForm,
    patch: Partial<Pick<Expense, 'quantity' | 'unitPrice' | 'supplyAmount' | 'vat'>>,
    options: { autoVat?: boolean } = {},
): ExpenseForm {
    const next: ExpenseForm = { ...prev, ...patch };
    const quantity = Number(next.quantity) || 0;
    const unitPrice = Number(next.unitPrice) || 0;
    if (('quantity' in patch || 'unitPrice' in patch) && quantity > 0 && unitPrice > 0) {
        next.supplyAmount = supplyFromQuantity(quantity, unitPrice);
    }
    const supplyAmount = Number(next.supplyAmount) || 0;
    if (options.autoVat && !('vat' in patch) && supplyAmount > 0) {
        next.vat = vatFromSupply(supplyAmount);
    }
    if (supplyAmount > 0) next.amount = supplyAmount + (Number(next.vat) || 0);
    return next;
}
