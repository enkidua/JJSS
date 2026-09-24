/**
 * 훈련일 생성과 일지·출근부 기본값 채우기.
 */
import { parseLocalDate } from '../../utils/date';
import { addDaysKey, isWorkingDay, weekdayOf } from './holidays';
import type {
    SupportedEmploymentCoachTimesheetEntry,
    SupportedEmploymentDailyLog,
    TrainingPhase,
} from './model';

export interface TrainingDay {
    date: string;
    phase: TrainingPhase;
}

export interface GenerateTrainingDaysOptions {
    /** 앞에서부터 사전훈련으로 둘 일수(기본 1) */
    preTrainingDays?: number;
    /** 기관 휴무일 */
    extraClosedDates?: readonly string[];
}

/** 너무 긴 기간(입력 실수)으로 화면이 멈추지 않도록 한 번에 만드는 최대 달력 일수 */
const MAX_CALENDAR_DAYS = 400;

/**
 * 시작~종료일(포함) 중 주말·공휴일·기관 휴무를 뺀 훈련일. 앞 N일은 '사전', 나머지는 '현장'.
 * 날짜가 잘못되었거나 종료일이 시작일보다 앞서면 빈 배열.
 */
export function generateTrainingDays(start: string, end: string, options: GenerateTrainingDaysOptions = {}): TrainingDay[] {
    if (!parseLocalDate(start || '') || !parseLocalDate(end || '') || start > end) return [];
    const preCount = Math.max(0, Math.floor(options.preTrainingDays ?? 1));
    const closed = options.extraClosedDates ?? [];
    const days: TrainingDay[] = [];
    let cursor = start;
    for (let guard = 0; cursor <= end && guard < MAX_CALENDAR_DAYS; guard += 1) {
        if (isWorkingDay(cursor, closed)) {
            days.push({ date: cursor, phase: days.length < preCount ? '사전' : '현장' });
        }
        cursor = addDaysKey(cursor, 1);
    }
    return days;
}

/** 'HH:MM' 두 개 사이 시간(시간 단위, 소수 2자리). 잘못되었거나 종료가 앞서면 0. */
export function timeRangeHours(start: string, end: string): number {
    const toMinutes = (value: string) => {
        const match = /^(\d{1,2}):(\d{2})$/.exec((value || '').trim());
        if (!match) return null;
        const h = Number(match[1]);
        const m = Number(match[2]);
        return h <= 24 && m < 60 ? h * 60 + m : null;
    };
    const s = toMinutes(start);
    const e = toMinutes(end);
    if (s === null || e === null || e <= s) return 0;
    return Math.round(((e - s) / 60) * 100) / 100;
}

export function createDailyLog(
    day: TrainingDay,
    template: Partial<SupportedEmploymentDailyLog> = {},
): SupportedEmploymentDailyLog {
    return {
        attendance: '출석',
        start: '',
        end: '',
        commuteGuidance: false,
        task: '',
        performanceHours: '',
        note: '',
        ...template,
        date: day.date,
        phase: day.phase,
    };
}

/**
 * 새로 생성한 훈련일에 기존 일지를 맞춘다. 같은 날짜의 기존 입력은 유지하고(단계만 갱신),
 * 새 날짜는 template(보통 첫 행의 시간·과제)으로 채운다. 훈련일에서 빠진 날짜의 일지는 버린다.
 */
export function syncDailyLogs(
    days: readonly TrainingDay[],
    existing: readonly SupportedEmploymentDailyLog[] = [],
    template: Partial<Pick<SupportedEmploymentDailyLog, 'start' | 'end' | 'task' | 'commuteGuidance'>> = {},
): SupportedEmploymentDailyLog[] {
    const byDate = new Map(existing.map(log => [log.date, log]));
    return days.map(day => {
        const current = byDate.get(day.date);
        return current ? { ...current, phase: day.phase } : createDailyLog(day, template);
    });
}

/**
 * 훈련일지 시간으로 직무지도원 출근부 기본값을 만든다(D-5).
 * 직무지도원수당이 출결과 무관하게 훈련일 기준이므로(calc.ts 참고) 결석일도 포함한다.
 * existing에 같은 날짜가 있으면 사용자가 고친 값을 유지한다.
 */
export function buildCoachTimesheetFromLogs(
    logs: readonly SupportedEmploymentDailyLog[],
    existing: readonly SupportedEmploymentCoachTimesheetEntry[] = [],
    oneToMany = false,
): SupportedEmploymentCoachTimesheetEntry[] {
    const byDate = new Map(existing.map(entry => [entry.date, entry]));
    return logs.map(log => byDate.get(log.date) ?? {
            date: log.date,
            start: log.start,
            end: log.end,
            hours: timeRangeHours(log.start, log.end),
            oneToMany,
            overtime: 0,
        });
}

/** 월요일 시작 주 단위로 날짜를 묶는다. 각 주는 월~일 7칸(해당 없는 날은 null). */
export function groupDatesByWeek(dates: readonly string[]): Array<{ monday: string; days: Array<string | null> }> {
    const sorted = [...new Set(dates)].filter(date => parseLocalDate(date)).sort();
    const weeks = new Map<string, Array<string | null>>();
    for (const date of sorted) {
        const offset = (weekdayOf(date) + 6) % 7; // 월=0 … 일=6
        const monday = addDaysKey(date, -offset);
        const week = weeks.get(monday) ?? Array.from({ length: 7 }, () => null);
        week[offset] = date;
        weeks.set(monday, week);
    }
    return [...weeks.entries()].map(([monday, days]) => ({ monday, days }));
}
