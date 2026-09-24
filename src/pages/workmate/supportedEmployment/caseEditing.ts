/**
 * 지원고용 관리 화면에서 쓰는 순수 도우미(React 없음).
 * 계산 규칙은 src/features/supportedEmployment가 정하고, 여기서는 화면 편집 흐름만 다룬다.
 */
// 서류(docx) 모듈을 끌어오지 않도록 index 대신 계산 모듈을 직접 가져온다(현황판도 이 파일을 쓴다).
import { addDaysKey, getHolidayName, isWeekend } from '../../../features/supportedEmployment/holidays';
import { buildCoachTimesheetFromLogs, generateTrainingDays, syncDailyLogs, timeRangeHours } from '../../../features/supportedEmployment/schedule';
import { summarizeAttendance } from '../../../features/supportedEmployment/attendance';
import { calculatePayments } from '../../../features/supportedEmployment/calc';
import {
    parseCase,
    EVALUATION_GROUPS,
    type SupportedEmploymentCase,
    type SupportedEmploymentCoachTimesheetEntry,
    type SupportedEmploymentDailyLog,
} from '../../../features/supportedEmployment/model';
import type { CaseDocument } from '../../../types/caseDocument';
import type { SupportedEmploymentOverview } from '../../../config/rehabOverview';

// ─── 훈련일 생성 ───

export interface ExcludedDate {
    date: string;
    reason: string;
}

/** 기간 안에서 훈련일에서 빠진 평일(공휴일·대체공휴일·기관 휴무)과 그 이유. 주말은 따로 적지 않는다. */
export function listExcludedWeekdays(start: string, end: string, extraClosedDates: readonly string[]): ExcludedDate[] {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return [];
    const excluded: ExcludedDate[] = [];
    let cursor = start;
    for (let guard = 0; cursor <= end && guard < 400; guard += 1) {
        if (!isWeekend(cursor)) {
            const holiday = getHolidayName(cursor);
            if (holiday) excluded.push({ date: cursor, reason: holiday });
            else if (extraClosedDates.includes(cursor)) excluded.push({ date: cursor, reason: '기관 휴무' });
        }
        cursor = addDaysKey(cursor, 1);
    }
    return excluded;
}

const hasLogContent = (log: SupportedEmploymentDailyLog) =>
    Boolean(log.task.trim() || log.note.trim() || log.performanceHours.trim() || log.attendance !== '출석');

/**
 * 출근부가 훈련일지를 따라가게 한다. 이전 일지 값에서 자동으로 만든 그대로인 출근부 칸은 새 일지 값으로 바꾸고,
 * 사용자가 직접 고친 칸은 유지한다. 새 날짜는 새로 만들고, 빠진 날짜는 버린다.
 */
export function followLogChanges(
    previousLogs: readonly SupportedEmploymentDailyLog[],
    nextLogs: readonly SupportedEmploymentDailyLog[],
    timesheet: readonly SupportedEmploymentCoachTimesheetEntry[],
    oneToMany: boolean,
): SupportedEmploymentCoachTimesheetEntry[] {
    const previousByDate = new Map(previousLogs.map(log => [log.date, log]));
    const entryByDate = new Map(timesheet.map(entry => [entry.date, entry]));
    const kept: SupportedEmploymentCoachTimesheetEntry[] = [];
    for (const log of nextLogs) {
        const entry = entryByDate.get(log.date);
        const previous = previousByDate.get(log.date);
        if (!entry) continue;
        const untouched = previous
            && entry.start === previous.start
            && entry.end === previous.end
            && entry.hours === timeRangeHours(previous.start, previous.end);
        kept.push(untouched ? { ...entry, start: log.start, end: log.end, hours: timeRangeHours(log.start, log.end) } : entry);
    }
    return buildCoachTimesheetFromLogs(nextLogs, kept, oneToMany);
}

export interface SchedulePlan {
    next: SupportedEmploymentCase;
    /** 새 기간에서 빠져 지워지는, 내용이 있는 일지 날짜 */
    droppedWithContent: string[];
}

/** 기간·사전훈련 일수·기관 휴무가 바뀌었을 때 훈련일지·출근부를 다시 맞춘 회차 */
export function planSchedule(current: SupportedEmploymentCase, patch: Partial<Pick<SupportedEmploymentCase, 'period' | 'preTrainingDays' | 'extraClosedDates'>>): SchedulePlan {
    const merged: SupportedEmploymentCase = { ...current, ...patch, period: { ...current.period, ...(patch.period || {}) } };
    const days = generateTrainingDays(merged.period.start, merged.period.end, {
        preTrainingDays: merged.preTrainingDays,
        extraClosedDates: merged.extraClosedDates,
    });
    const first = current.dailyLogs[0];
    const template = first ? { start: first.start, end: first.end, task: first.task, commuteGuidance: first.commuteGuidance } : {};
    const logs = syncDailyLogs(days, current.dailyLogs, template);
    const keptDates = new Set(logs.map(log => log.date));
    const droppedWithContent = current.dailyLogs.filter(log => !keptDates.has(log.date) && hasLogContent(log)).map(log => log.date);
    return {
        next: {
            ...merged,
            dailyLogs: logs,
            coachTimesheet: followLogChanges(current.dailyLogs, logs, current.coachTimesheet, merged.oneToManyGuidance),
        },
        droppedWithContent,
    };
}

/** 일지만 바꾼 회차(출근부도 따라감) */
export function withDailyLogs(current: SupportedEmploymentCase, logs: SupportedEmploymentDailyLog[]): SupportedEmploymentCase {
    return {
        ...current,
        dailyLogs: logs,
        coachTimesheet: followLogChanges(current.dailyLogs, logs, current.coachTimesheet, current.oneToManyGuidance),
    };
}

/** 첫 행의 시간·출퇴근지도·수행과제를 아래 모든 행에 복사(지도사항·출결은 그대로) */
export function copyFirstRowDown(logs: readonly SupportedEmploymentDailyLog[]): SupportedEmploymentDailyLog[] {
    const first = logs[0];
    if (!first) return [...logs];
    return logs.map((log, index) => (index === 0 ? log : {
        ...log, start: first.start, end: first.end, commuteGuidance: first.commuteGuidance, task: first.task,
    }));
}

export function copyFromPreviousRow(logs: readonly SupportedEmploymentDailyLog[], index: number): SupportedEmploymentDailyLog[] {
    const previous = logs[index - 1];
    if (!previous) return [...logs];
    return logs.map((log, i) => (i === index ? {
        ...log, start: previous.start, end: previous.end, commuteGuidance: previous.commuteGuidance,
        task: previous.task, performanceHours: previous.performanceHours,
    } : log));
}

export function markAllPresent(logs: readonly SupportedEmploymentDailyLog[]): SupportedEmploymentDailyLog[] {
    return logs.map(log => ({ ...log, attendance: '출석' }));
}

/** D-7 #2 출결 환산 설명(수당 카드·일지 하단) */
export function attendanceRuleNote(logs: readonly SupportedEmploymentDailyLog[]): string {
    const s = summarizeAttendance(logs);
    const parts: string[] = [];
    if (s.absentDays) parts.push(`결석 ${s.absentDays}일 미지급`);
    if (s.lateOrEarlyCount) {
        const detail = `지각 ${s.lateCount}회·조퇴 ${s.earlyLeaveCount}회`;
        if (s.convertedAbsences) {
            parts.push(`${detail} → 결석 ${s.convertedAbsences}일로 환산해 제외${s.remainderLateOrEarly ? ` (남은 ${s.remainderLateOrEarly}회는 다음 환산까지 누적)` : ''}`);
        } else {
            parts.push(`${detail} (3회 미만은 전액 지급, 3회가 되면 결석 1일로 환산)`);
        }
    }
    return parts.length ? parts.join(' · ') : '결석·지각·조퇴가 없어 모든 훈련일을 지급합니다.';
}

// ─── 목록 ───

export function nextRoundNumber(cases: ReadonlyArray<Pick<SupportedEmploymentCase, 'round'>>): number {
    return cases.reduce((max, item) => Math.max(max, item.round || 0), 0) + 1;
}

// ─── 예산 연동 (D-4) ───

export const BUDGET_ITEM_KEYWORDS: Record<'trainingAllowance' | 'employerSubsidy' | 'coachAllowance', string[]> = {
    trainingAllowance: ['훈련수당'],
    employerSubsidy: ['사업주보조금', '보조금'],
    coachAllowance: ['직무지도원', '지도원'],
};

/** 사업의 세부 항목 중 이름에 키워드가 들어간 첫 항목 */
export function matchBudgetItem<T extends { id: string; name: string }>(items: readonly T[], key: keyof typeof BUDGET_ITEM_KEYWORDS): T | undefined {
    for (const keyword of BUDGET_ITEM_KEYWORDS[key]) {
        const found = items.find(item => item.name.replace(/\s/g, '').includes(keyword));
        if (found) return found;
    }
    return undefined;
}

export interface LinkedExpenseLike {
    id?: string;
    budgetItem: string;
    amount: number;
}

export interface BudgetLinkStatus {
    linked: number;
    missing: number;
    /** 금액이 다른 항목 라벨 */
    differing: string[];
}

/** 연결된 지출(expenseIds)과 현재 회차 금액 비교. 자동으로 고치지 않고 표시만 한다. */
export function compareLinkedExpenses(c: SupportedEmploymentCase, expenses: readonly LinkedExpenseLike[], coachDaysBasis?: 'scheduled' | 'attended'): BudgetLinkStatus {
    const ids = c.expenseIds || [];
    const items = calculatePayments(c, { coachDaysBasis }).items;
    let linked = 0;
    let missing = 0;
    const differing: string[] = [];
    for (const id of ids) {
        const expense = expenses.find(item => item.id === id);
        if (!expense) { missing += 1; continue; }
        linked += 1;
        const item = items.find(line => line.label === expense.budgetItem);
        if (item && Math.round(Number(expense.amount) || 0) !== item.amount) differing.push(item.label);
    }
    // 금액이 0원이 되어 초안을 만들지 않은 항목이 나중에 생긴 경우도 다름으로 본다.
    for (const item of items) {
        if (item.amount > 0 && ids.length && !expenses.some(expense => ids.includes(expense.id || '') && expense.budgetItem === item.label)
            && !differing.includes(item.label)) {
            differing.push(item.label);
        }
    }
    return { linked, missing, differing };
}

// ─── AI 소견 초안 ───

type OpinionKey = typeof EVALUATION_GROUPS[number]['key'];

/** 이름·연락처·계좌는 넣지 않는다(전송 직전 generateText가 한 번 더 비식별화한다). */
export function buildOpinionPrompt(c: SupportedEmploymentCase): string {
    const scoreLine = (scores: Array<number | null>, from: number) =>
        scores.slice(from, from + 5).map(score => (score === null ? '-' : String(score))).join(', ');
    const notes = c.dailyLogs
        .filter(log => log.note.trim() || log.task.trim())
        .slice(0, 40)
        .map(log => `- ${log.date} (${log.phase}, ${log.attendance}) 과제: ${log.task || '-'} / 수행정도: ${log.performanceHours || '-'} / 지도사항: ${log.note || '-'}`);
    return [
        '아래는 지원고용 훈련생 한 명의 훈련일지 지도사항과 종합 평가기록부 점수(1~5점)입니다.',
        '기록에 있는 내용만 근거로, 평가기록부의 네 영역 소견을 각각 2~3문장으로 작성해 주세요. 없는 사실은 만들지 말고, 근거가 부족하면 "관찰 기록 부족"이라고 적어 주세요.',
        '반드시 아래 형식 그대로, 영역마다 한 줄씩 답해 주세요.',
        '[근무태도] ...', '[대인관계] ...', '[작업태도] ...', '[작업수행] ...',
        '',
        `[훈련직무] ${c.jobTitle || '미기록'}`,
        ...EVALUATION_GROUPS.map((group, index) =>
            `[${group.label} 점수] 사전: ${scoreLine(c.evaluation.pre, index * 5)} / 현장: ${scoreLine(c.evaluation.field, index * 5)}`),
        '[훈련일지]',
        ...(notes.length ? notes : ['- 기록 없음']),
    ].join('\n');
}

/** "[근무태도] 내용" 형식 응답을 네 칸으로 나눈다. 찾지 못한 영역은 빠진다. */
export function parseOpinionDraft(text: string): Partial<Record<OpinionKey, string>> {
    const result: Partial<Record<OpinionKey, string>> = {};
    const labels = EVALUATION_GROUPS.map(group => group.label).join('|');
    const pattern = new RegExp(`\\[?\\s*(${labels})\\s*\\]?\\s*[:：]?\\s*([\\s\\S]*?)(?=\\n\\s*\\[?\\s*(?:${labels})\\s*\\]?\\s*[:：]?|$)`, 'g');
    for (const match of text.matchAll(pattern)) {
        const group = EVALUATION_GROUPS.find(item => item.label === match[1]);
        const body = match[2].replace(/\*\*/g, '').trim();
        if (group && body && !result[group.key]) result[group.key] = body;
    }
    return result;
}

// ─── 현황판 요약 (D-5) ───

/**
 * 한 이용자의 사례문서 중 가장 최근 지원고용 회차 요약. 현황판 고용지원 카드와 단계 판정에 쓴다.
 * 현장 X/Y일: 오늘까지 지난 현장훈련일 / 전체 현장훈련일.
 */
export function buildSupportedEmploymentOverview(documents: ReadonlyArray<Pick<CaseDocument, 'id' | 'type' | 'content'>>, today: string): SupportedEmploymentOverview | null {
    const cases = documents
        .filter(doc => doc.type === 'supported_employment')
        .map(doc => {
            const parsed = parseCase(doc.content);
            return parsed.ok ? { ...parsed.case, id: doc.id || parsed.case.id } : null;
        })
        .filter((item): item is SupportedEmploymentCase => item !== null)
        .sort((a, b) => (b.period.start || '').localeCompare(a.period.start || '') || b.round - a.round);
    const latest = cases.find(item => item.status === '진행중') || cases[0];
    if (!latest) return null;
    const fieldLogs = latest.dailyLogs.filter(log => log.phase === '현장');
    const payments = calculatePayments(latest, { coachDaysBasis: latest.documentOptions?.coachDaysBasis });
    return {
        caseId: latest.id,
        round: latest.round,
        status: latest.status,
        fieldDoneDays: fieldLogs.filter(log => log.date <= today).length,
        fieldTotalDays: fieldLogs.length,
        plannedTotal: payments.total,
        completed: latest.result.completed || latest.status === '수료' || latest.status === '취업',
        employed: latest.result.employed || latest.status === '취업',
    };
}
