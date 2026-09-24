import type { BudgetProject, BudgetProjectItem, Expense } from '../../types/budget';
import { localDateKey, parseLocalDate } from '../../utils/date';

/** 백업·복원이 이 키와 저장 형식(BudgetProject[] JSON)을 그대로 사용하므로 바꾸지 않습니다. */
export const BUDGET_PROJECTS_KEY = 'jjss:budget-projects';

export const EXPENSE_CATEGORIES = ['사업비', '프로그램사업비', '운영비', '인건비', '대체인력임금', '교통비', '식비', '소모품비', '기타'];
export const PAYMENT_METHODS = ['카드', '현금', '계좌이체', '기타'];

export function loadBudgetProjects(): BudgetProject[] {
    try {
        const raw = localStorage.getItem(BUDGET_PROJECTS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** 저장 공간 부족 등으로 실패하면 예외를 그대로 던집니다(호출한 쪽에서 원복·안내). */
export function saveBudgetProjects(projects: BudgetProject[]) {
    localStorage.setItem(BUDGET_PROJECTS_KEY, JSON.stringify(projects));
}

/** localStorage 용량 초과(QuotaExceededError 등) 여부. 브라우저별 이름·코드가 달라 함께 확인합니다. */
export function isStorageQuotaError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const { name, code, message } = error as { name?: string; code?: number; message?: string };
    return name === 'QuotaExceededError'
        || name === 'NS_ERROR_DOM_QUOTA_REACHED'
        || code === 22
        || code === 1014
        || /quota/i.test(String(message || ''));
}

export function normalizeBudgetItems(project?: Partial<BudgetProject> | null): BudgetProjectItem[] {
    return Array.isArray(project?.budgetItems) ? project.budgetItems : [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 금액 계산 규칙 (화면·지출품의서·CSV·집계가 모두 이 함수만 사용합니다)
// ─────────────────────────────────────────────────────────────────────────────

/** 저장된 값이 문자열·NaN·소수일 수 있어 정수 원 단위로 정리합니다. 음수(환불·취소)는 그대로 둡니다. */
export function toWon(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

/** 지출 한 건의 총 금액. 저장된 `amount`가 기준이며 공급가액·부가세로 다시 계산하지 않습니다. */
export function expenseTotal(expense: Pick<Partial<Expense>, 'amount'>): number {
    return toWon(expense.amount);
}

/** 지출 목록 합계. 빈 목록은 0. */
export function expenseListTotal(expenses: ReadonlyArray<Pick<Partial<Expense>, 'amount'>>): number {
    return expenses.reduce((sum, expense) => sum + expenseTotal(expense), 0);
}

/** 사업에 연결된 지출 합계. 수정 중인 지출을 빼고 계산할 때 `excludeExpenseId`를 넘깁니다. */
export function projectSpent(projectId: string, expenses: ReadonlyArray<Expense>, excludeExpenseId?: string): number {
    if (!projectId) return 0;
    return expenseListTotal(expenses.filter(expense => expense.projectId === projectId && (!excludeExpenseId || expense.id !== excludeExpenseId)));
}

/** 사업 잔액 = 총예산 − 사용액. 초과 시 음수. */
export function projectBalance(project: Pick<BudgetProject, 'id' | 'totalBudget'>, expenses: ReadonlyArray<Expense>): number {
    return toWon(project.totalBudget) - projectSpent(project.id, expenses);
}

/** 세부 예산 항목 사용액. 사업과 항목 ID가 모두 일치하는 지출만 셉니다(항목을 옮기면 즉시 반영). */
export function itemSpent(projectId: string, itemId: string, expenses: ReadonlyArray<Expense>): number {
    if (!projectId || !itemId) return 0;
    return expenseListTotal(expenses.filter(expense => expense.projectId === projectId && expense.budgetItemId === itemId));
}

export function itemBalance(projectId: string, item: Pick<BudgetProjectItem, 'id' | 'amount'>, expenses: ReadonlyArray<Expense>): number {
    return toWon(item.amount) - itemSpent(projectId, item.id, expenses);
}

/** 사업 안에서 세부 항목이 지정되지 않은 지출 합계. */
export function unassignedItemSpent(projectId: string, expenses: ReadonlyArray<Expense>): number {
    if (!projectId) return 0;
    return expenseListTotal(expenses.filter(expense => expense.projectId === projectId && !expense.budgetItemId));
}

/**
 * 사업이 지정되지 않은 지출 합계(사업 삭제로 미지정이 된 지출 포함).
 * `projects`를 넘기면 목록에 없는 사업 ID를 가진 지출(연결이 끊긴 지출)도 미지정으로 셉니다(projectTotals와 같은 기준).
 */
export function unassignedProjectSpent(expenses: ReadonlyArray<Expense>, projects?: ReadonlyArray<Pick<BudgetProject, 'id'>>): number {
    const projectIds = projects ? new Set(projects.map(project => project.id)) : null;
    return expenseListTotal(expenses.filter(expense => !expense.projectId || (projectIds !== null && !projectIds.has(expense.projectId))));
}

/** 세부 예산 항목 금액 합계. */
export function budgetItemsTotal(items: ReadonlyArray<Pick<BudgetProjectItem, 'amount'>>): number {
    return items.reduce((sum, item) => sum + toWon(item.amount), 0);
}

/** 사용률(%). 정수로 반올림하며 예산이 없으면 0. 100%를 넘을 수 있습니다(막대 표시 시 잘라 주세요). */
export function usageRate(totalBudget: number, spent: number): number {
    const budget = toWon(totalBudget);
    if (budget <= 0) return 0;
    return Math.round((toWon(spent) / budget) * 100);
}

/** 초과 여부는 반올림한 사용률(100.4% → 100%)이 아니라 실제 금액으로 판단합니다. */
export function isOverBudget(totalBudget: number, spent: number): boolean {
    const budget = toWon(totalBudget);
    return budget > 0 && toWon(spent) > budget;
}

// ── 부가세 ──────────────────────────────────────────────────────────────────

export const VAT_RATE = 0.1;
export type VatRounding = 'floor' | 'round';
/** 기본 반올림 규칙: 세금계산서 관행에 맞춰 원 미만은 버립니다(절사). */
export const DEFAULT_VAT_ROUNDING: VatRounding = 'floor';
export const VAT_RULE_DESCRIPTION = '공급가액의 10%를 부가세로 넣습니다. 원 미만은 버림(절사)합니다. 직접 고치면 자동 계산이 꺼집니다.';

function applyRounding(value: number, rounding: VatRounding): number {
    // 음수 금액(환불)도 0 방향으로 자르도록 trunc를 씁니다.
    return rounding === 'floor' ? Math.trunc(value) : Math.round(value);
}

/** 공급가액(부가세 별도)에서 부가세를 계산합니다. */
export function vatFromSupply(supplyAmount: number, rounding: VatRounding = DEFAULT_VAT_ROUNDING): number {
    return applyRounding(toWon(supplyAmount) * VAT_RATE, rounding);
}

/** 부가세 포함 총액을 공급가액과 부가세로 나눕니다. supply + vat === total 이 항상 성립합니다. */
export function splitVatIncludedTotal(totalAmount: number, rounding: VatRounding = DEFAULT_VAT_ROUNDING): { supplyAmount: number; vat: number } {
    const total = toWon(totalAmount);
    const vat = applyRounding(total / (1 + VAT_RATE) * VAT_RATE, rounding);
    return { supplyAmount: total - vat, vat };
}

/** 수량 × 단가. 소수 단가가 들어와도 원 단위로 반올림합니다. */
export function supplyFromQuantity(quantity: number, unitPrice: number): number {
    const qty = Number(quantity) || 0;
    const price = Number(unitPrice) || 0;
    return Math.round(qty * price);
}

// ── 집계 ────────────────────────────────────────────────────────────────────

export interface TotalRow {
    key: string;
    label: string;
    total: number;
    count: number;
}

/**
 * 사업별 집계 행. `count`·`total`은 넘겨받은 (필터된) 지출 기준이고,
 * `totalSpent`·`balance`·`usageRate`·`over`는 필터와 무관하게 전체 지출 기준이다.
 */
export interface ProjectTotalRow extends TotalRow {
    totalBudget: number;
    /** 전체 지출 기준 사용액 */
    totalSpent: number;
    /** 전체 지출 기준 건수 */
    totalCount: number;
    balance: number;
    usageRate: number;
    over: boolean;
}

export interface ProjectTotalsOptions {
    /** 잔액·사용률 계산에 쓸 전체 지출(없으면 expenses와 같음) */
    allExpenses?: ReadonlyArray<Expense>;
    /** '사업 미지정' 판단에 쓸 전체 사업(없으면 projects와 같음) */
    allProjects?: ReadonlyArray<Pick<BudgetProject, 'id'>>;
    /** '사업 미지정' 행 표시 여부(없으면 미지정 지출이 있을 때 표시) */
    includeUnassigned?: boolean;
}

export const UNASSIGNED_PROJECT_KEY = 'unassigned';
export const UNDATED_MONTH_KEY = 'undated';

/** 지출일자('YYYY-MM-DD')의 월 키 'YYYY-MM'. 로컬(KST) 날짜 기준이며 ISO 문자열이 들어오면 로컬 날짜로 바꿔 읽습니다. */
export function expenseMonthKey(date: string | undefined): string {
    if (!date) return UNDATED_MONTH_KEY;
    const local = parseLocalDate(date);
    if (local) return localDateKey(local).slice(0, 7);
    const fallback = new Date(date);
    return Number.isNaN(fallback.getTime()) ? UNDATED_MONTH_KEY : localDateKey(fallback).slice(0, 7);
}

export function formatMonthKey(key: string): string {
    if (key === UNDATED_MONTH_KEY) return '날짜 없음';
    const [year, month] = key.split('-');
    return `${year}년 ${Number(month)}월`;
}

/** 월별 합계(오래된 달부터). 날짜를 읽을 수 없는 지출은 '날짜 없음'으로 마지막에 둡니다. */
export function monthlyTotals(expenses: ReadonlyArray<Expense>): TotalRow[] {
    const map = new Map<string, TotalRow>();
    for (const expense of expenses) {
        const key = expenseMonthKey(expense.date);
        const row = map.get(key) || { key, label: formatMonthKey(key), total: 0, count: 0 };
        row.total += expenseTotal(expense);
        row.count += 1;
        map.set(key, row);
    }
    return [...map.values()].sort((a, b) => {
        if (a.key === UNDATED_MONTH_KEY) return 1;
        if (b.key === UNDATED_MONTH_KEY) return -1;
        return a.key.localeCompare(b.key);
    });
}

/** 예산과목별 합계(금액 큰 순). 과목이 비어 있으면 '기타'. */
export function categoryTotals(expenses: ReadonlyArray<Expense>): TotalRow[] {
    const map = new Map<string, TotalRow>();
    for (const expense of expenses) {
        const key = (expense.category || '').trim() || '기타';
        const row = map.get(key) || { key, label: key, total: 0, count: 0 };
        row.total += expenseTotal(expense);
        row.count += 1;
        map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'ko'));
}

/**
 * 사업별 합계. 등록된 사업은 지출이 없어도 나오고, 사업 미지정(삭제된 사업 포함) 지출은 마지막 행에 모입니다.
 * 건수·사용액(total)은 expenses(필터 기준), 잔액·사용률은 options.allExpenses(전체 기준)로 계산합니다.
 */
export function projectTotals(
    projects: ReadonlyArray<BudgetProject>,
    expenses: ReadonlyArray<Expense>,
    options: ProjectTotalsOptions = {},
): ProjectTotalRow[] {
    const allExpenses = options.allExpenses ?? expenses;
    const rows: ProjectTotalRow[] = projects.map(project => {
        const filteredSpent = projectSpent(project.id, expenses);
        const spent = projectSpent(project.id, allExpenses);
        return {
            key: project.id,
            label: project.name,
            total: filteredSpent,
            count: expenses.filter(expense => expense.projectId === project.id).length,
            totalBudget: toWon(project.totalBudget),
            totalSpent: spent,
            totalCount: allExpenses.filter(expense => expense.projectId === project.id).length,
            balance: projectBalance(project, allExpenses),
            usageRate: usageRate(project.totalBudget, spent),
            over: isOverBudget(project.totalBudget, spent),
        };
    });
    const projectIds = new Set((options.allProjects ?? projects).map(project => project.id));
    const isUnassigned = (expense: Expense) => !expense.projectId || !projectIds.has(expense.projectId);
    const unassigned = expenses.filter(isUnassigned);
    const allUnassigned = allExpenses.filter(isUnassigned);
    const include = options.includeUnassigned ?? true;
    if (include && (unassigned.length > 0 || allUnassigned.length > 0)) {
        rows.push({
            key: UNASSIGNED_PROJECT_KEY,
            label: '사업 미지정',
            total: expenseListTotal(unassigned),
            count: unassigned.length,
            totalBudget: 0,
            totalSpent: expenseListTotal(allUnassigned),
            totalCount: allUnassigned.length,
            balance: 0,
            usageRate: 0,
            over: false,
        });
    }
    return rows;
}

/** 집계 CSV(두 번째 파일)의 행. 지출 목록 CSV의 열 구성은 바꾸지 않고 따로 저장합니다. */
export function buildSummaryCsvRows(
    projects: ReadonlyArray<BudgetProject>,
    expenses: ReadonlyArray<Expense>,
    options: ProjectTotalsOptions & { filtered?: boolean } = {},
): unknown[][] {
    const rows: unknown[][] = [];
    rows.push(['[사업별 집계]']);
    rows.push(['사업명', '건수(필터 기준)', '필터 기준 사용액(원)', '총예산(원)', '전체 사용액(원)', '전체 잔액(원)', '전체 사용률(%)']);
    for (const row of projectTotals(projects, expenses, options)) {
        const isUnassigned = row.key === UNASSIGNED_PROJECT_KEY;
        rows.push([
            row.label, row.count, row.total,
            isUnassigned ? '' : row.totalBudget,
            row.totalSpent,
            isUnassigned ? '' : row.balance,
            isUnassigned || row.totalBudget <= 0 ? '' : row.usageRate,
        ]);
    }
    rows.push([]);
    rows.push(['[월별 집계]']);
    rows.push(['월', '건수', '합계(원)']);
    for (const row of monthlyTotals(expenses)) rows.push([row.label, row.count, row.total]);
    rows.push([]);
    rows.push(['[예산과목별 집계]']);
    rows.push(['예산과목', '건수', '합계(원)']);
    for (const row of categoryTotals(expenses)) rows.push([row.label, row.count, row.total]);
    rows.push([]);
    rows.push([options.filtered ? '필터 기준 합계' : '전체 합계', expenses.length, expenseListTotal(expenses)]);
    return rows;
}

// ── 상태 표시 ───────────────────────────────────────────────────────────────

export interface BudgetStatus {
    usageRate: number;
    over: boolean;
    label: string;
    className: string;
    barClassName: string;
}

export function getBudgetStatus(totalBudget: number, spent: number): BudgetStatus {
    if (toWon(totalBudget) <= 0) {
        return { usageRate: 0, over: false, label: '예산 미입력', barClassName: 'bg-emerald-400', className: 'text-white/45 bg-white/5 border-white/10' };
    }
    const rate = usageRate(totalBudget, spent);
    if (isOverBudget(totalBudget, spent)) return { usageRate: rate, over: true, label: '초과', barClassName: 'bg-red-400', className: 'text-red-200 bg-red-500/10 border-red-400/25' };
    if (rate >= 90) return { usageRate: rate, over: false, label: '거의 소진', barClassName: 'bg-orange-400', className: 'text-orange-200 bg-orange-500/10 border-orange-400/25' };
    if (rate >= 70) return { usageRate: rate, over: false, label: '주의', barClassName: 'bg-amber-400', className: 'text-amber-200 bg-amber-500/10 border-amber-400/25' };
    return { usageRate: rate, over: false, label: '정상', barClassName: 'bg-emerald-400', className: 'text-emerald-200 bg-emerald-500/10 border-emerald-400/25' };
}

// ── 사업기간 · 입력 검증 ─────────────────────────────────────────────────────

export interface DateRange {
    start: string; // YYYY-MM-DD
    end: string;   // YYYY-MM-DD
}

const DATE_TOKEN = /(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?/g;

function toDateKey(year: string, month: string, day: string): string | null {
    const key = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return parseLocalDate(key) ? key : null;
}

/**
 * 사업기간 문자열을 날짜 범위로 읽습니다. '2026', '2026년', '2026-01-01 ~ 2026-12-31', '2026.3.1~2026.8.31' 형식을 지원합니다.
 * 읽을 수 없으면 null(기간 검사를 건너뜁니다).
 */
export function parseProjectPeriod(period: string | undefined): DateRange | null {
    const text = String(period || '').trim();
    if (!text) return null;
    const dates: string[] = [];
    for (const match of text.matchAll(DATE_TOKEN)) {
        const key = toDateKey(match[1], match[2], match[3]);
        if (key) dates.push(key);
    }
    if (dates.length >= 2) {
        const [start, end] = [dates[0], dates[1]].sort();
        return { start, end };
    }
    if (dates.length === 1) return { start: dates[0], end: dates[0] };
    const yearMatch = /^(\d{4})\s*년?(?:도)?$/.exec(text);
    if (yearMatch) return { start: `${yearMatch[1]}-01-01`, end: `${yearMatch[1]}-12-31` };
    return null;
}

export function isDateInRange(date: string | undefined, range: DateRange | null): boolean {
    if (!range || !date) return true;
    const key = parseLocalDate(date) ? date.trim() : null;
    if (!key) return true;
    return key >= range.start && key <= range.end;
}

export const BIZ_NO_PATTERN = /^\d{3}-\d{2}-\d{5}$/;

/** 사업자등록번호 형식(000-00-00000). 비어 있으면 통과. */
export function isValidBizNo(value: string | undefined): boolean {
    const text = String(value || '').trim();
    return !text || BIZ_NO_PATTERN.test(text);
}

/** 숫자만 입력해도 000-00-00000 형태로 맞춰 줍니다(10자리일 때만). */
export function formatBizNo(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 10) return value;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function normalizeApprovalNo(value: string | undefined): string {
    return String(value || '').replace(/\s+/g, '').toUpperCase();
}

/** 같은 승인번호를 쓰는 다른 지출. 승인번호가 비어 있으면 빈 배열. */
export function findDuplicateApprovalExpenses(approvalNo: string | undefined, expenses: ReadonlyArray<Expense>, excludeExpenseId?: string): Expense[] {
    const key = normalizeApprovalNo(approvalNo);
    if (!key) return [];
    return expenses.filter(expense => expense.id !== excludeExpenseId && normalizeApprovalNo(expense.approvalNo) === key);
}

export type ExpenseWarningKey = 'futureDate' | 'outsidePeriod' | 'duplicateApproval' | 'bizNo';
export type ExpenseWarnings = Partial<Record<ExpenseWarningKey, string>>;

/** 저장을 막지 않는 주의 메시지(미래 날짜·사업기간 밖·승인번호 중복·사업자번호 형식). */
export function getExpenseWarnings(
    form: Partial<Expense>,
    context: { projects: ReadonlyArray<BudgetProject>; expenses: ReadonlyArray<Expense>; excludeExpenseId?: string; today?: string },
): ExpenseWarnings {
    const warnings: ExpenseWarnings = {};
    const today = context.today || localDateKey();
    const date = String(form.date || '').trim();
    if (date && parseLocalDate(date)) {
        if (date > today) warnings.futureDate = '지출일자가 오늘보다 뒤입니다. 날짜를 확인해 주세요.';
        const project = form.projectId ? context.projects.find(item => item.id === form.projectId) : undefined;
        const range = parseProjectPeriod(project?.period);
        if (project && range && !isDateInRange(date, range)) {
            warnings.outsidePeriod = `지출일자가 사업기간(${project.period}) 밖입니다.`;
        }
    }
    const duplicates = findDuplicateApprovalExpenses(form.approvalNo, context.expenses, context.excludeExpenseId);
    if (duplicates.length > 0) {
        const first = duplicates[0];
        warnings.duplicateApproval = `같은 승인번호의 지출이 이미 ${duplicates.length}건 있습니다(${first.date} ${first.description || ''}). 이중 등록이 아닌지 확인해 주세요.`;
    }
    if (!isValidBizNo(form.vendorBizNo)) warnings.bizNo = '사업자등록번호는 000-00-00000 형식으로 입력해 주세요.';
    return warnings;
}

// ── 정합성 점검 ─────────────────────────────────────────────────────────────

export type BudgetIssueKind = 'projectMissing' | 'itemMissing' | 'itemsExceedBudget' | 'dateOutsidePeriod' | 'duplicateApproval';

export interface BudgetIssue {
    kind: BudgetIssueKind;
    kindLabel: string;
    message: string;
    /** 지출 관련 문제면 지출, 사업 관련 문제면 사업. */
    expense?: Expense;
    project?: BudgetProject;
}

export const BUDGET_ISSUE_LABELS: Record<BudgetIssueKind, string> = {
    projectMissing: '사업 없는 지출',
    itemMissing: '항목 없는 지출',
    itemsExceedBudget: '총예산 < 항목 합계',
    dateOutsidePeriod: '지출일이 사업기간 밖',
    duplicateApproval: '중복 승인번호',
};

/** 사업·지출 데이터의 어긋남을 찾습니다. 순수 함수이며 아무것도 고치지 않습니다. */
export function findBudgetIssues(projects: ReadonlyArray<BudgetProject>, expenses: ReadonlyArray<Expense>): BudgetIssue[] {
    const issues: BudgetIssue[] = [];
    const projectMap = new Map(projects.map(project => [project.id, project]));
    const describe = (expense: Expense) => `${expense.date || '날짜 없음'} · ${expense.description || '(품명 없음)'} · ${expenseTotal(expense).toLocaleString()}원`;

    for (const project of projects) {
        const itemTotal = budgetItemsTotal(normalizeBudgetItems(project));
        const budget = toWon(project.totalBudget);
        if (budget > 0 && itemTotal > budget) {
            issues.push({
                kind: 'itemsExceedBudget',
                kindLabel: BUDGET_ISSUE_LABELS.itemsExceedBudget,
                message: `${project.name}: 세부 항목 합계 ${itemTotal.toLocaleString()}원이 총예산 ${budget.toLocaleString()}원을 ${(itemTotal - budget).toLocaleString()}원 초과합니다.`,
                project,
            });
        }
    }

    for (const expense of expenses) {
        if (expense.projectId) {
            const project = projectMap.get(expense.projectId);
            if (!project) {
                issues.push({
                    kind: 'projectMissing',
                    kindLabel: BUDGET_ISSUE_LABELS.projectMissing,
                    message: `${describe(expense)} → 연결된 사업(${expense.projectName || expense.projectId})이 없습니다.`,
                    expense,
                });
            } else {
                if (expense.budgetItemId && !normalizeBudgetItems(project).some(item => item.id === expense.budgetItemId)) {
                    issues.push({
                        kind: 'itemMissing',
                        kindLabel: BUDGET_ISSUE_LABELS.itemMissing,
                        message: `${describe(expense)} → ${project.name}에 세부 항목(${expense.budgetItemName || expense.budgetItemId})이 없습니다.`,
                        expense,
                    });
                }
                const range = parseProjectPeriod(project.period);
                if (range && expense.date && parseLocalDate(expense.date) && !isDateInRange(expense.date, range)) {
                    issues.push({
                        kind: 'dateOutsidePeriod',
                        kindLabel: BUDGET_ISSUE_LABELS.dateOutsidePeriod,
                        message: `${describe(expense)} → ${project.name} 사업기간(${project.period}) 밖입니다.`,
                        expense,
                    });
                }
            }
        }
    }

    const byApproval = new Map<string, Expense[]>();
    for (const expense of expenses) {
        const key = normalizeApprovalNo(expense.approvalNo);
        if (!key) continue;
        byApproval.set(key, [...(byApproval.get(key) || []), expense]);
    }
    for (const group of byApproval.values()) {
        if (group.length < 2) continue;
        for (const expense of group) {
            issues.push({
                kind: 'duplicateApproval',
                kindLabel: BUDGET_ISSUE_LABELS.duplicateApproval,
                message: `${describe(expense)} → 승인번호 ${expense.approvalNo}가 ${group.length}건에 쓰였습니다.`,
                expense,
            });
        }
    }
    return issues;
}

// ── CSV · 날짜 표시 ─────────────────────────────────────────────────────────

/** 엑셀에서 수식으로 실행되지 않도록 =, +, -, @, 탭, CR로 시작하는 문자열 앞에 '를 붙입니다. */
export function csvEscape(value: unknown) {
    let text = String(value ?? '').replace(/\r?\n/g, ' ');
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 행 배열을 BOM 포함 CSV 문자열로 만듭니다. */
export function buildCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
    return '﻿' + rows.map(row => row.map(csvEscape).join(',')).join('\n');
}

export function formatExpenseDate(value: string) {
    if (!value) return '-';
    const date = parseLocalDate(value) || new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}
