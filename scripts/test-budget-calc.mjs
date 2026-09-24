// 예산 금액 계산 규칙(src/pages/budget/budgetUtils.ts) 단위 테스트.
// 모든 사업·지출·승인번호는 합성 데이터이며 네트워크·저장소를 사용하지 않는다.
// 월 경계 검사를 위해 한국 시간대로 고정한다(날짜 계산 전에 설정해야 한다).
process.env.TZ = 'Asia/Seoul';

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

/** TS 파일을 트랜스파일해 data: URL 모듈로 불러온다. 상대 import는 `imports`로 넘긴 data: URL로 바꾼다. */
async function loadTs(relativePath, imports = {}) {
    const sourceUrl = new URL(relativePath, import.meta.url);
    let compiled = ts.transpileModule(await readFile(sourceUrl, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: sourceUrl.pathname,
    }).outputText;
    for (const [specifier, url] of Object.entries(imports)) {
        compiled = compiled.split(`'${specifier}'`).join(`'${url}'`).split(`"${specifier}"`).join(`"${url}"`);
    }
    const remaining = [...compiled.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(match => match[1]);
    assert.deepEqual(remaining, [], `${relativePath}: 치환되지 않은 상대 import ${remaining.join(', ')}`);
    const url = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
    return { url, module: await import(url) };
}

const date = await loadTs('../src/utils/date.ts');
const budget = await loadTs('../src/pages/budget/budgetUtils.ts', { '../../utils/date': date.url });
const form = await loadTs('../src/pages/budget/expenseForm.ts', { '../../utils/date': date.url, './budgetUtils': budget.url });
const { localDateKey } = date.module;
const {
    expenseTotal, expenseListTotal, projectSpent, projectBalance, itemSpent, itemBalance, unassignedItemSpent, unassignedProjectSpent,
    budgetItemsTotal, usageRate, isOverBudget, getBudgetStatus, vatFromSupply, splitVatIncludedTotal, supplyFromQuantity,
    expenseMonthKey, monthlyTotals, categoryTotals, projectTotals, UNASSIGNED_PROJECT_KEY, UNDATED_MONTH_KEY,
    parseProjectPeriod, isDateInRange, isValidBizNo, formatBizNo, findDuplicateApprovalExpenses, getExpenseWarnings,
    findBudgetIssues, buildSummaryCsvRows, csvEscape, buildCsv, BUDGET_PROJECTS_KEY,
} = budget.module;
const { applyExpenseAmountChange, parseQuantityInput, formatQuantityInput, wonInputHint, validateExpenseForm } = form.module;

let passed = 0;
function test(name, run) {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
}

let seq = 0;
function expense(overrides = {}) {
    seq += 1;
    return {
        id: `exp-${seq}`,
        date: '2026-05-10',
        category: '사업비',
        budgetItem: '',
        description: `합성 품목 ${seq}`,
        quantity: 1,
        unitPrice: 0,
        supplyAmount: 0,
        vat: 0,
        amount: 0,
        vendor: '가상상점',
        vendorBizNo: '',
        paymentMethod: '카드',
        cardType: '',
        cardLastFour: '',
        approvalNo: '',
        organization: 'test',
        ...overrides,
    };
}

function project(overrides = {}) {
    return {
        id: 'p-a',
        name: '가상 사업 A',
        totalBudget: 1_000_000,
        period: '2026',
        notes: '',
        budgetItems: [
            { id: 'i-1', name: '물품비', amount: 600_000 },
            { id: 'i-2', name: '강사비', amount: 400_000 },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

test('저장 키와 형식 유지', () => {
    assert.equal(BUDGET_PROJECTS_KEY, 'jjss:budget-projects');
});

test('expenseTotal: 저장된 amount 기준, 문자열·소수·빈값 정리', () => {
    assert.equal(expenseTotal({ amount: 11000 }), 11000);
    assert.equal(expenseTotal({ amount: '12,000' }), 12000);
    assert.equal(expenseTotal({ amount: 1234.5 }), 1235);
    assert.equal(expenseTotal({ amount: undefined }), 0);
    assert.equal(expenseTotal({ amount: Number.NaN }), 0);
    // 공급가액·부가세와 달라도 amount가 기준(다시 계산하지 않음)
    assert.equal(expenseTotal(expense({ supplyAmount: 10000, vat: 1000, amount: 10500 })), 10500);
    assert.equal(expenseListTotal([]), 0);
});

test('부가세 별도(공급가액 → 부가세): 10%, 원 미만 버림 / 반올림 선택', () => {
    assert.equal(vatFromSupply(10000), 1000);
    assert.equal(vatFromSupply(10005), 1000);          // 1000.5 → 버림
    assert.equal(vatFromSupply(10005, 'round'), 1001); // 반올림 선택 시
    assert.equal(vatFromSupply(9), 0);
    assert.equal(vatFromSupply(0), 0);
});

test('부가세 포함(총액 → 공급가액+부가세): 합이 항상 총액과 같음', () => {
    assert.deepEqual(splitVatIncludedTotal(11000), { supplyAmount: 10000, vat: 1000 });
    for (const total of [1, 10, 999, 10001, 12345, 99999, 1_000_003]) {
        const { supplyAmount, vat } = splitVatIncludedTotal(total);
        assert.equal(supplyAmount + vat, total, `total ${total}`);
        assert.ok(Number.isInteger(supplyAmount) && Number.isInteger(vat));
    }
    assert.equal(splitVatIncludedTotal(10001).vat, 909); // 909.18 → 버림
});

test('수량×단가 반올림', () => {
    assert.equal(supplyFromQuantity(3, 333.335), 1000);
    assert.equal(supplyFromQuantity(3, 1333.3), 4000);
    assert.equal(supplyFromQuantity(2, 0.4), 1);
    assert.equal(supplyFromQuantity(0, 5000), 0);
});

test('입력 폼: 부가세 자동 계산 켬/끔, 수동 입력 유지', () => {
    const base = { quantity: 1, unitPrice: 0, supplyAmount: 0, vat: 0, amount: 0 };
    const auto = applyExpenseAmountChange(base, { supplyAmount: 10005 }, { autoVat: true });
    assert.equal(auto.vat, 1000);
    assert.equal(auto.amount, 11005);
    const manual = applyExpenseAmountChange(auto, { vat: 0 }, { autoVat: true }); // 부가세를 직접 고치면 그 값 유지
    assert.equal(manual.vat, 0);
    assert.equal(manual.amount, 10005);
    const off = applyExpenseAmountChange(base, { quantity: 3, unitPrice: 1500 });
    assert.equal(off.supplyAmount, 4500);
    assert.equal(off.vat, 0);
    assert.equal(off.amount, 4500);
    const qtyAuto = applyExpenseAmountChange(base, { quantity: 3, unitPrice: 333.335 }, { autoVat: true });
    assert.equal(qtyAuto.supplyAmount, 1000);
    assert.equal(qtyAuto.vat, 100);
    assert.equal(qtyAuto.amount, 1100);
});

test('음수 품목(환불·취소)은 합계에서 빠지고, 부가세도 0 방향으로 자름', () => {
    const list = [expense({ amount: 10000 }), expense({ amount: -3000 }), expense({ amount: '-1,500' })];
    assert.equal(expenseListTotal(list), 5500);
    assert.equal(vatFromSupply(-10005), -1000);
    const { supplyAmount, vat } = splitVatIncludedTotal(-11000);
    assert.equal(supplyAmount + vat, -11000);
});

test('사업 사용액·잔액·사용률·초과', () => {
    const p = project();
    const list = [
        expense({ projectId: 'p-a', budgetItemId: 'i-1', amount: 300_000 }),
        expense({ projectId: 'p-a', budgetItemId: 'i-2', amount: 250_000 }),
        expense({ projectId: 'p-a', amount: 50_000 }),
        expense({ projectId: 'p-b', amount: 999_999 }),
        expense({ amount: 70_000 }),
    ];
    assert.equal(projectSpent('p-a', list), 600_000);
    assert.equal(projectSpent('p-a', list, list[0].id), 300_000); // 수정 중인 지출 제외
    assert.equal(projectSpent('', list), 0);
    assert.equal(projectBalance(p, list), 400_000);
    assert.equal(itemSpent('p-a', 'i-1', list), 300_000);
    assert.equal(itemBalance('p-a', p.budgetItems[1], list), 150_000);
    assert.equal(unassignedItemSpent('p-a', list), 50_000);
    assert.equal(usageRate(p.totalBudget, 600_000), 60);
    assert.equal(usageRate(0, 5000), 0);
    assert.equal(budgetItemsTotal(p.budgetItems), 1_000_000);
    // 100.4%는 사용률 100%로 보이지만 초과로 판정
    assert.equal(usageRate(1000, 1004), 100);
    assert.equal(isOverBudget(1000, 1004), true);
    assert.equal(isOverBudget(1000, 1000), false);
    assert.equal(isOverBudget(0, 1000), false);
    assert.equal(getBudgetStatus(1000, 1004).label, '초과');
    assert.equal(getBudgetStatus(0, 1004).label, '예산 미입력');
});

test('사업 미지정 지출과 삭제된 사업의 지출', () => {
    const projects = [project()];
    const list = [
        expense({ projectId: 'p-a', amount: 100_000 }),
        expense({ projectId: '', amount: 20_000 }),
        expense({ projectId: 'p-deleted', projectName: '삭제된 가상 사업', amount: 30_000 }),
    ];
    assert.equal(unassignedProjectSpent(list), 20_000);
    assert.equal(unassignedProjectSpent(list, projects), 50_000);
    const rows = projectTotals(projects, list);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map(row => row.key), ['p-a', UNASSIGNED_PROJECT_KEY]);
    assert.equal(rows[1].total, 50_000);
    assert.equal(rows[1].count, 2);
    // 사업별 합계를 모두 더하면 전체 합계와 같다(빠지거나 두 번 세지 않음)
    assert.equal(rows.reduce((sum, row) => sum + row.total, 0), expenseListTotal(list));
    // 지출이 없는 사업도 행이 나온다
    assert.equal(projectTotals([project(), project({ id: 'p-c', name: '가상 사업 C' })], []).length, 2);
    const issues = findBudgetIssues(projects, list);
    assert.equal(issues.filter(issue => issue.kind === 'projectMissing').length, 1);
    assert.equal(issues.find(issue => issue.kind === 'projectMissing').expense.id, list[2].id);
});

test('항목 이동 후 잔액: 사업 안 이동은 사업 잔액 그대로, 다른 사업으로 이동하면 양쪽 반영', () => {
    const pA = project();
    const pB = project({ id: 'p-b', name: '가상 사업 B', totalBudget: 500_000, budgetItems: [{ id: 'i-9', name: '운영비', amount: 500_000 }] });
    const moving = expense({ projectId: 'p-a', budgetItemId: 'i-1', amount: 120_000 });
    const before = [moving, expense({ projectId: 'p-a', budgetItemId: 'i-2', amount: 80_000 })];
    assert.equal(itemSpent('p-a', 'i-1', before), 120_000);
    const movedWithin = before.map(item => item.id === moving.id ? { ...item, budgetItemId: 'i-2' } : item);
    assert.equal(itemSpent('p-a', 'i-1', movedWithin), 0);
    assert.equal(itemSpent('p-a', 'i-2', movedWithin), 200_000);
    assert.equal(projectBalance(pA, movedWithin), projectBalance(pA, before));
    const movedAcross = before.map(item => item.id === moving.id ? { ...item, projectId: 'p-b', budgetItemId: 'i-9' } : item);
    assert.equal(projectBalance(pA, movedAcross), 920_000);
    assert.equal(projectBalance(pB, movedAcross), 380_000);
    assert.equal(itemSpent('p-a', 'i-9', movedAcross), 0); // 사업이 다르면 같은 항목 ID라도 세지 않음
    assert.equal(itemSpent('p-b', 'i-9', movedAcross), 120_000);
});

test('월 경계(KST): localDateKey와 월별 합계', () => {
    // UTC 3월 31일 15:30 = KST 4월 1일 00:30
    const kstMidnight = new Date('2026-03-31T15:30:00.000Z');
    assert.equal(localDateKey(kstMidnight), '2026-04-01');
    assert.equal(kstMidnight.toISOString().slice(0, 10), '2026-03-31'); // toISOString을 쓰면 전날로 틀림
    assert.equal(expenseMonthKey('2026-03-31'), '2026-03');
    assert.equal(expenseMonthKey('2026-04-01'), '2026-04');
    assert.equal(expenseMonthKey('2026-03-31T15:30:00.000Z'), '2026-04');
    assert.equal(expenseMonthKey(''), UNDATED_MONTH_KEY);
    assert.equal(expenseMonthKey('날짜아님'), UNDATED_MONTH_KEY);
    const list = [
        expense({ date: '2026-03-31', amount: 1000 }),
        expense({ date: localDateKey(kstMidnight), amount: 2000 }),
        expense({ date: '2026-04-30', amount: 3000 }),
        expense({ date: '2026-02-01', amount: -500 }),
        expense({ date: '', amount: 700 }),
    ];
    const rows = monthlyTotals(list);
    assert.deepEqual(rows.map(row => [row.key, row.total, row.count]), [
        ['2026-02', -500, 1],
        ['2026-03', 1000, 1],
        ['2026-04', 5000, 2],
        [UNDATED_MONTH_KEY, 700, 1],
    ]);
    assert.equal(rows[2].label, '2026년 4월');
    assert.equal(rows.reduce((sum, row) => sum + row.total, 0), expenseListTotal(list));
});

test('예산과목별 합계: 금액 큰 순, 빈 과목은 기타', () => {
    const rows = categoryTotals([
        expense({ category: '운영비', amount: 1000 }),
        expense({ category: '사업비', amount: 5000 }),
        expense({ category: '', amount: 300 }),
        expense({ category: '운영비', amount: 4500 }),
    ]);
    assert.deepEqual(rows.map(row => [row.key, row.total, row.count]), [['운영비', 5500, 2], ['사업비', 5000, 1], ['기타', 300, 1]]);
});

test('사업기간 해석', () => {
    assert.deepEqual(parseProjectPeriod('2026'), { start: '2026-01-01', end: '2026-12-31' });
    assert.deepEqual(parseProjectPeriod('2026년'), { start: '2026-01-01', end: '2026-12-31' });
    assert.deepEqual(parseProjectPeriod('2026-03-01 ~ 2026-08-31'), { start: '2026-03-01', end: '2026-08-31' });
    assert.deepEqual(parseProjectPeriod('2026.3.1~2026.8.31'), { start: '2026-03-01', end: '2026-08-31' });
    assert.equal(parseProjectPeriod('상반기'), null);
    assert.equal(parseProjectPeriod(''), null);
    const range = parseProjectPeriod('2026-03-01 ~ 2026-08-31');
    assert.equal(isDateInRange('2026-03-01', range), true);
    assert.equal(isDateInRange('2026-08-31', range), true);
    assert.equal(isDateInRange('2026-09-01', range), false);
    assert.equal(isDateInRange('2026-09-01', null), true);
});

test('사업자등록번호 형식', () => {
    assert.equal(isValidBizNo('123-45-67890'), true);
    assert.equal(isValidBizNo(''), true);
    assert.equal(isValidBizNo('1234567890'), false);
    assert.equal(isValidBizNo('123-456-7890'), false);
    assert.equal(formatBizNo('1234567890'), '123-45-67890');
    assert.equal(formatBizNo('123 45 67890'), '123-45-67890');
    assert.equal(formatBizNo('12345'), '12345');
});

test('입력 경고(저장은 막지 않음): 미래 날짜·사업기간 밖·중복 승인번호·사업자번호', () => {
    const projects = [project({ period: '2026-03-01 ~ 2026-08-31' })];
    const existing = [expense({ id: 'dup-1', approvalNo: 'AB 1234', date: '2026-04-02' })];
    const warnings = getExpenseWarnings(
        { date: '2026-10-01', projectId: 'p-a', approvalNo: 'ab1234', vendorBizNo: '12-345' },
        { projects, expenses: existing, today: '2026-09-24' },
    );
    assert.ok(warnings.futureDate);
    assert.ok(warnings.outsidePeriod);
    assert.ok(warnings.duplicateApproval);
    assert.ok(warnings.bizNo);
    const clean = getExpenseWarnings(
        { date: '2026-05-01', projectId: 'p-a', approvalNo: 'AB1234', vendorBizNo: '123-45-67890' },
        { projects, expenses: existing, excludeExpenseId: 'dup-1', today: '2026-09-24' },
    );
    assert.deepEqual(clean, {});
    assert.equal(findDuplicateApprovalExpenses('', existing).length, 0);
});

test('정합성 점검: 다섯 가지 문제를 찾고 정상 데이터는 통과', () => {
    const projects = [
        project({ period: '2026-03-01 ~ 2026-08-31' }),
        project({ id: 'p-over', name: '가상 사업 초과', totalBudget: 100_000, budgetItems: [{ id: 'i-x', name: '물품비', amount: 150_000 }] }),
    ];
    const list = [
        expense({ projectId: 'p-gone', amount: 1000 }),
        expense({ projectId: 'p-a', budgetItemId: 'i-removed', budgetItemName: '없어진 항목', date: '2026-04-01', amount: 1000 }),
        expense({ projectId: 'p-a', budgetItemId: 'i-1', date: '2026-12-01', amount: 1000 }),
        expense({ approvalNo: '777', amount: 1000 }),
        expense({ approvalNo: ' 777 ', amount: 1000 }),
    ];
    const kinds = findBudgetIssues(projects, list).map(issue => issue.kind).sort();
    assert.deepEqual(kinds, ['dateOutsidePeriod', 'duplicateApproval', 'duplicateApproval', 'itemMissing', 'itemsExceedBudget', 'projectMissing']);
    const over = findBudgetIssues(projects, list).find(issue => issue.kind === 'itemsExceedBudget');
    assert.equal(over.project.id, 'p-over');
    assert.deepEqual(findBudgetIssues([project()], [expense({ projectId: 'p-a', budgetItemId: 'i-1', date: '2026-05-01', amount: 5000 })]), []);
});

test('집계 CSV: 합계가 계산 함수와 일치, 지출 목록 CSV와 별도', () => {
    const projects = [project()];
    const list = [expense({ projectId: 'p-a', amount: 400_000 }), expense({ amount: 10_000 }), expense({ projectId: 'p-a', amount: -5_000 })];
    const rows = buildSummaryCsvRows(projects, list);
    assert.deepEqual(rows[1], ['사업명', '건수(필터 기준)', '필터 기준 사용액(원)', '총예산(원)', '전체 사용액(원)', '전체 잔액(원)', '전체 사용률(%)']);
    const projectRow = rows.find(row => row[0] === '가상 사업 A');
    assert.deepEqual(projectRow, ['가상 사업 A', 2, 395_000, 1_000_000, 395_000, 605_000, 40]);
    const unassignedRow = rows.find(row => row[0] === '사업 미지정');
    assert.deepEqual(unassignedRow, ['사업 미지정', 1, 10_000, '', 10_000, '', '']);
    assert.deepEqual(rows[rows.length - 1], ['전체 합계', 3, expenseListTotal(list)]);
    const csv = buildCsv(rows);
    assert.ok(csv.startsWith('﻿'));
    assert.ok(csv.includes('[월별 집계]'));
});

test('집계(필터 적용): 건수·사용액은 필터 기준, 잔액·사용률은 전체 지출 기준', () => {
    const projects = [project(), project({ id: 'p-b', name: '가상 사업 B', totalBudget: 200_000 })];
    const all = [
        expense({ projectId: 'p-a', amount: 400_000, vendor: '가상상점' }),
        expense({ projectId: 'p-a', amount: 100_000, vendor: '다른상점' }),
        expense({ projectId: 'p-b', amount: 50_000, vendor: '다른상점' }),
        expense({ projectId: 'p-gone', amount: 7_000, vendor: '다른상점' }),
    ];
    const filteredList = all.filter(item => item.vendor === '가상상점');
    const options = { allExpenses: all, allProjects: projects, includeUnassigned: true };
    const rows = projectTotals(projects, filteredList, options);
    const a = rows.find(row => row.key === 'p-a');
    assert.equal(a.count, 1);
    assert.equal(a.total, 400_000);
    assert.equal(a.totalSpent, 500_000);
    assert.equal(a.totalCount, 2);
    assert.equal(a.balance, 500_000);
    assert.equal(a.usageRate, 50);
    const b = rows.find(row => row.key === 'p-b');
    assert.equal(b.total, 0);
    assert.equal(b.balance, 150_000);
    const unassigned = rows.find(row => row.key === UNASSIGNED_PROJECT_KEY);
    assert.equal(unassigned.count, 0);
    assert.equal(unassigned.totalSpent, 7_000);
    // 한 사업만 볼 때: 다른 사업 지출을 미지정으로 세지 않음
    const single = projectTotals([projects[0]], filteredList, { allExpenses: all, allProjects: projects, includeUnassigned: false });
    assert.deepEqual(single.map(row => row.key), ['p-a']);
    assert.equal(single[0].balance, 500_000);
    // '사업 미지정' 필터(사업 목록 없음)에서도 전체 기준 미지정 금액은 삭제된 사업만
    const onlyUnassigned = projectTotals([], all.filter(item => item.projectId === 'p-gone'), options);
    assert.deepEqual(onlyUnassigned.map(row => [row.key, row.total, row.totalSpent]), [[UNASSIGNED_PROJECT_KEY, 7_000, 7_000]]);
    const csv = buildSummaryCsvRows(projects, filteredList, { ...options, filtered: true });
    assert.deepEqual(csv.find(row => row[0] === '가상 사업 A'), ['가상 사업 A', 1, 400_000, 1_000_000, 500_000, 500_000, 50]);
    assert.deepEqual(csv[csv.length - 1], ['필터 기준 합계', 1, 400_000]);
});

test('수량 소수(둘째 자리까지)·단가 원 단위: "1.5"가 15가 되지 않음', () => {
    assert.deepEqual(parseQuantityInput('1.5'), { ok: true, value: 1.5 });
    assert.deepEqual(parseQuantityInput('1,000'), { ok: true, value: 1000 });
    assert.deepEqual(parseQuantityInput('0.25'), { ok: true, value: 0.25 });
    assert.deepEqual(parseQuantityInput('2.'), { ok: true, value: 2 });
    assert.equal(parseQuantityInput('1.234').ok, false);
    assert.equal(parseQuantityInput('1.2.3').ok, false);
    assert.equal(parseQuantityInput('abc').ok, false);
    assert.equal(formatQuantityInput(1234.5), '1,234.5');
    assert.equal(formatQuantityInput(0), '');
    assert.ok(wonInputHint('1.5'));
    assert.equal(wonInputHint('12,000'), '');
    // 수량 1.5 × 단가 3,333 = 4,999.5 → 원 단위 반올림(supplyFromQuantity와 같은 규칙)
    const next = applyExpenseAmountChange({ quantity: 1, unitPrice: 3333, supplyAmount: 0, vat: 0, amount: 0 }, { quantity: 1.5 });
    assert.equal(next.supplyAmount, supplyFromQuantity(1.5, 3333));
    assert.equal(next.supplyAmount, 5000);
    assert.equal(next.amount, 5000);
    assert.equal(validateExpenseForm({ date: '2026-05-01', description: '합성', quantity: 0.5, amount: 1000 }).quantity, undefined);
    assert.ok(validateExpenseForm({ date: '2026-05-01', description: '합성', quantity: 0, amount: 1000 }).quantity);
});

test('CSV 수식 실행 방지', () => {
    assert.equal(csvEscape('=SUM(A1)'), "'=SUM(A1)");
    assert.equal(csvEscape('-3000'), "'-3000");
    assert.equal(csvEscape(-3000), '-3000'); // 숫자 음수는 그대로
    assert.equal(csvEscape('a,b'), '"a,b"');
});

console.log(`\n${passed}개 테스트 통과`);
