/**
 * 예산 연동(D-4): 회차 확정 시 예산 관리에 지출 초안 3건을 만든다. 예산 화면 파일은 수정하지 않고
 * 데이터 저장소(addExpense)와 예산 사업 읽기 함수(loadBudgetProjects)만 사용한다.
 */
import { calculatePayments, type PaymentItemKey, type PaymentLine } from '../../../features/supportedEmployment/calc';
import type { SupportedEmploymentCase } from '../../../features/supportedEmployment/model';
import type { BudgetProject, Expense } from '../../../types/budget';
import { normalizeBudgetItems } from '../../budget/budgetUtils';
import { localDateKey } from '../../../utils/date';
import { matchBudgetItem } from './caseEditing';

export type NewExpense = Omit<Expense, 'id' | 'organization' | 'createdAt' | 'createdBy'>;

export const EXPENSE_DRAFT_MARK = '[초안]';

/** 지출 비고(notes)에 넣는 회차·항목 표식. 예: [지원고용:abc123:trainingAllowance] */
export function expenseDraftTag(caseId: string, itemKey: PaymentItemKey): string {
    return `[지원고용:${caseId}:${itemKey}]`;
}

type TaggableExpense = Pick<Expense, 'notes'> & { id?: string };

/** 이 회차 표식이 붙은 지출(항목별 첫 번째). 회차 ID가 없으면 빈 Map. */
export function findTaggedExpenses<T extends TaggableExpense>(caseId: string, expenses: readonly T[]): Map<PaymentItemKey, T> {
    const found = new Map<PaymentItemKey, T>();
    if (!caseId) return found;
    const pattern = /\[지원고용:([^:\]]+):([A-Za-z]+)\]/g;
    for (const expense of expenses) {
        for (const match of String(expense.notes || '').matchAll(pattern)) {
            const key = match[2] as PaymentItemKey;
            if (match[1] === caseId && !found.has(key)) found.set(key, expense);
        }
    }
    return found;
}

export interface ExpenseDraftPlan {
    /** 새로 만들어야 하는 초안(금액 0원 초과이면서 표식이 붙은 지출이 없는 항목) */
    toCreate: NewExpense[];
    /** 이미 예산 관리에 있는 이 회차 지출 ID(표식 기준) */
    existingIds: string[];
    /** 금액이 0원보다 큰 항목 수 */
    payableCount: number;
}

/** 이미 만든 초안(표식 기준)은 건너뛰고 빠진 항목만 만든다 — 중복·누락 방지. */
export function planExpenseDrafts<T extends TaggableExpense>(c: SupportedEmploymentCase, project: BudgetProject, expenses: readonly T[]): ExpenseDraftPlan {
    const drafts = buildExpenseDrafts(c, project);
    const tagged = findTaggedExpenses(c.id, expenses);
    const toCreate: NewExpense[] = [];
    const existingIds: string[] = [];
    for (const draft of drafts) {
        const key = draft.itemKey;
        const existing = key ? tagged.get(key) : undefined;
        if (existing?.id) existingIds.push(existing.id);
        else toCreate.push(draft);
    }
    return { toCreate: toCreate.map(stripItemKey), existingIds, payableCount: drafts.length };
}

/** 금액이 0원보다 크지만 예산 관리에 아직 없는 항목의 이름(표식 또는 연결된 지출 ID 기준). */
export function missingExpenseLabels<T extends TaggableExpense & Pick<Expense, 'budgetItem'>>(c: SupportedEmploymentCase, expenses: readonly T[]): string[] {
    const tagged = findTaggedExpenses(c.id, expenses);
    const linkedIds = new Set(c.expenseIds || []);
    return calculatePayments(c, { coachDaysBasis: c.documentOptions?.coachDaysBasis }).items
        .filter(line => line.amount > 0)
        .filter(line => !tagged.has(line.key) && !expenses.some(expense => expense.id && linkedIds.has(expense.id) && expense.budgetItem === line.label))
        .map(line => line.label);
}

type DraftWithKey = NewExpense & { itemKey?: PaymentItemKey };

function stripItemKey(draft: DraftWithKey): NewExpense {
    const { itemKey: _itemKey, ...rest } = draft;
    return rest;
}

function vendorFor(line: PaymentLine, c: SupportedEmploymentCase): string {
    if (line.key === 'employerSubsidy') return c.employerName || '사업체';
    if (line.key === 'coachAllowance') return `직무지도원(${c.coach.type})`;
    // 이용자 이름은 지출 기록에 넣지 않는다(개인정보 최소화).
    return '훈련생';
}

/** 금액이 0원보다 큰 항목만 지출 초안으로 만든다. */
export function buildExpenseDrafts(c: SupportedEmploymentCase, project: BudgetProject): DraftWithKey[] {
    const items = normalizeBudgetItems(project);
    const payments = calculatePayments(c, { coachDaysBasis: c.documentOptions?.coachDaysBasis });
    const roundText = c.round ? `${c.round}차` : '';
    return payments.items.filter(line => line.amount > 0).map(line => {
        const item = matchBudgetItem(items, line.key);
        return {
            itemKey: line.key,
            date: c.period.end || localDateKey(),
            category: '사업비',
            budgetItem: line.label,
            ...(item ? { budgetItemId: item.id, budgetItemName: item.name } : {}),
            projectId: project.id,
            projectName: project.name,
            description: `${EXPENSE_DRAFT_MARK} 지원고용 ${roundText} ${line.label} (${line.formula})`.replace(/\s+/g, ' '),
            quantity: line.days,
            unitPrice: line.unit,
            supplyAmount: line.amount,
            vat: 0,
            amount: line.amount,
            vendor: vendorFor(line, c),
            vendorBizNo: '',
            paymentMethod: '계좌이체',
            cardType: '',
            cardLastFour: '',
            approvalNo: '',
            notes: `${c.id ? `${expenseDraftTag(c.id, line.key)} ` : ''}지원고용 관리에서 만든 초안입니다. 지급일·금액을 확인한 뒤 확정해 주세요.`,
        };
    });
}
