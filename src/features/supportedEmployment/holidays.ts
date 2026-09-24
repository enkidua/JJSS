/**
 * 대한민국 공휴일(관공서의 공휴일에 관한 규정) + 대체공휴일.
 *
 * - 고정 공휴일: 1/1, 3/1, 5/5, 6/6, 8/15, 10/3, 10/9, 12/25
 *   + 제헌절(7/17): 2026년부터 공휴일 재지정(2026-01-29 법 개정). 2025년 이전은 공휴일 아님.
 * - 음력 공휴일(설날 3일, 부처님오신날, 추석 3일): 아래 LUNAR_HOLIDAYS 표(양력 날짜)를 쓴다.
 *   표는 2024~2030년만 들어 있다. 2031년 이후는 표에 행을 추가해야 한다(없으면 고정 공휴일만 계산).
 * - 대체공휴일(현행 규정):
 *   · 설·추석 연휴: 연휴 중 하루라도 일요일이거나 다른 공휴일과 겹치면 연휴 다음 첫 번째 비공휴일(평일)
 *   · 3·1절, 어린이날, 제헌절(2026~), 광복절, 개천절, 한글날, 부처님오신날, 성탄절:
 *     토·일요일이거나 다른 공휴일과 겹치면 다음 첫 번째 비공휴일(평일)
 *   · 1/1, 현충일은 대체공휴일이 없다.
 * - 선거일·임시공휴일·기관 휴무는 규칙으로 만들 수 없으므로 회차의 extraClosedDates로 직접 제외한다.
 */
import { localDateKey, parseLocalDate } from '../../utils/date';

export interface KoreanHoliday {
    /** YYYY-MM-DD */
    date: string;
    name: string;
    substitute: boolean;
}

/** 음력 공휴일의 양력 날짜. seollal/chuseok은 당일(연휴 가운데 날). */
export const LUNAR_HOLIDAYS: Record<number, { seollal: string; buddha: string; chuseok: string }> = {
    2024: { seollal: '2024-02-10', buddha: '2024-05-15', chuseok: '2024-09-17' },
    2025: { seollal: '2025-01-29', buddha: '2025-05-05', chuseok: '2025-10-06' },
    2026: { seollal: '2026-02-17', buddha: '2026-05-24', chuseok: '2026-09-25' },
    2027: { seollal: '2027-02-07', buddha: '2027-05-13', chuseok: '2027-09-15' },
    2028: { seollal: '2028-01-27', buddha: '2028-05-02', chuseok: '2028-10-03' },
    2029: { seollal: '2029-02-13', buddha: '2029-05-20', chuseok: '2029-09-22' },
    2030: { seollal: '2030-02-03', buddha: '2030-05-09', chuseok: '2030-09-12' },
};

export function hasLunarHolidayData(year: number): boolean {
    return Boolean(LUNAR_HOLIDAYS[year]);
}

/** 기간(YYYY-MM-DD ~ YYYY-MM-DD)이 걸친 연도 중 음력 공휴일 표가 없는 연도. 날짜가 비었거나 잘못되면 []. */
export function yearsMissingLunarHolidayData(start: string, end: string): number[] {
    const from = Number(String(start || '').slice(0, 4));
    const to = Number(String(end || '').slice(0, 4));
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1900 || to < from || to - from > 50) return [];
    const missing: number[] = [];
    for (let year = from; year <= to; year += 1) if (!hasLunarHolidayData(year)) missing.push(year);
    return missing;
}

/** 공휴일 표 누락 안내 문구. 누락 연도가 없으면 ''. */
export function lunarHolidayDataWarning(start: string, end: string): string {
    const missing = yearsMissingLunarHolidayData(start, end);
    if (!missing.length) return '';
    return `${missing.join('·')}년 음력 공휴일(설날·부처님오신날·추석) 자료가 없어 고정 공휴일만 제외했습니다. 해당 날짜는 '기관 휴무일'로 직접 제외해 주세요.`;
}

// ─── 날짜 도우미 (YYYY-MM-DD 문자열, 로컬 기준) ───

export function addDaysKey(dateKey: string, days: number): string {
    const date = parseLocalDate(dateKey);
    if (!date) throw new Error(`날짜 형식이 올바르지 않습니다: ${dateKey}`);
    date.setDate(date.getDate() + days);
    return localDateKey(date);
}

/** 0=일 … 6=토 */
export function weekdayOf(dateKey: string): number {
    const date = parseLocalDate(dateKey);
    if (!date) throw new Error(`날짜 형식이 올바르지 않습니다: ${dateKey}`);
    return date.getDay();
}

export function isWeekend(dateKey: string): boolean {
    const day = weekdayOf(dateKey);
    return day === 0 || day === 6;
}

// ─── 공휴일 계산 ───

type SubstituteRule = 'none' | 'weekend' | 'lunarBlock';

interface BaseHoliday {
    date: string;
    name: string;
    rule: SubstituteRule;
    /** 설·추석 연휴 묶음 이름 (lunarBlock일 때) */
    block?: '설날' | '추석';
}

const FIXED_HOLIDAYS: Array<{ md: string; name: string; rule: SubstituteRule; fromYear?: number }> = [
    { md: '01-01', name: '신정', rule: 'none' },
    { md: '03-01', name: '3·1절', rule: 'weekend' },
    { md: '05-05', name: '어린이날', rule: 'weekend' },
    { md: '06-06', name: '현충일', rule: 'none' },
    // 제헌절: 2008~2025년은 공휴일이 아니었고 2026년부터 다시 공휴일(대체공휴일 적용).
    { md: '07-17', name: '제헌절', rule: 'weekend', fromYear: 2026 },
    { md: '08-15', name: '광복절', rule: 'weekend' },
    { md: '10-03', name: '개천절', rule: 'weekend' },
    { md: '10-09', name: '한글날', rule: 'weekend' },
    { md: '12-25', name: '성탄절', rule: 'weekend' },
];

function baseHolidays(year: number): BaseHoliday[] {
    const list: BaseHoliday[] = FIXED_HOLIDAYS
        .filter(item => item.fromYear === undefined || year >= item.fromYear)
        .map(item => ({ date: `${year}-${item.md}`, name: item.name, rule: item.rule }));
    const lunar = LUNAR_HOLIDAYS[year];
    if (lunar) {
        for (const [block, day] of [['설날', lunar.seollal], ['추석', lunar.chuseok]] as const) {
            list.push({ date: addDaysKey(day, -1), name: `${block} 연휴`, rule: 'lunarBlock', block });
            list.push({ date: day, name: block, rule: 'lunarBlock', block });
            list.push({ date: addDaysKey(day, 1), name: `${block} 연휴`, rule: 'lunarBlock', block });
        }
        list.push({ date: lunar.buddha, name: '부처님오신날', rule: 'weekend' });
    }
    return list;
}

const holidayCache = new Map<number, KoreanHoliday[]>();

/** 해당 연도 공휴일 목록(대체공휴일 포함, 날짜순). 같은 날 두 공휴일이면 두 항목이 모두 들어 있다. */
export function listHolidays(year: number): KoreanHoliday[] {
    const cached = holidayCache.get(year);
    if (cached) return cached.map(item => ({ ...item }));

    const base = baseHolidays(year);
    const byDate = new Map<string, BaseHoliday[]>();
    for (const item of base) byDate.set(item.date, [...(byDate.get(item.date) || []), item]);

    // 대체공휴일 요청: { after: 이 날짜 다음부터 찾는다, name }
    const requests: Array<{ after: string; name: string }> = [];
    const blockHandled = new Set<string>();
    for (const [date, entries] of byDate) {
        const day = weekdayOf(date);
        const overlapping = entries.length > 1;
        for (const [index, entry] of entries.entries()) {
            if (entry.rule === 'none') continue;
            if (entry.rule === 'weekend') {
                // 겹침만 있는 평일이면 한 공휴일은 그 날 쉬므로 첫 항목은 대체하지 않는다.
                const weekend = day === 0 || day === 6;
                const lostByOverlap = overlapping && index > 0;
                if (weekend || lostByOverlap) requests.push({ after: date, name: entry.name });
            } else if (entry.block && !blockHandled.has(entry.block)) {
                // 설·추석: 일요일 또는 다른 공휴일과 겹침 → 연휴가 끝난 뒤 하루(연휴마다 최대 하루)
                const otherHoliday = entries.some(other => other.block !== entry.block);
                if (day === 0 || otherHoliday) {
                    const blockDays = base.filter(item => item.block === entry.block).map(item => item.date).sort();
                    requests.push({ after: blockDays[blockDays.length - 1], name: entry.block });
                    blockHandled.add(entry.block);
                }
            }
        }
    }

    const occupied = new Set(base.map(item => item.date));
    const substitutes: KoreanHoliday[] = [];
    requests.sort((a, b) => a.after.localeCompare(b.after));
    for (const request of requests) {
        let candidate = addDaysKey(request.after, 1);
        while (isWeekend(candidate) || occupied.has(candidate)) candidate = addDaysKey(candidate, 1);
        occupied.add(candidate);
        substitutes.push({ date: candidate, name: `대체공휴일(${request.name})`, substitute: true });
    }

    const result: KoreanHoliday[] = [
        ...base.map(item => ({ date: item.date, name: item.name, substitute: false })),
        ...substitutes,
    ].sort((a, b) => a.date.localeCompare(b.date) || Number(a.substitute) - Number(b.substitute));
    holidayCache.set(year, result);
    return result.map(item => ({ ...item }));
}

/** 해당 날짜의 공휴일 이름(여러 개면 ' · '로 연결). 공휴일이 아니면 ''. */
export function getHolidayName(dateKey: string): string {
    const year = Number(dateKey.slice(0, 4));
    if (!Number.isFinite(year)) return '';
    return listHolidays(year).filter(item => item.date === dateKey).map(item => item.name).join(' · ');
}

/** 공휴일(대체공휴일 포함) 또는 기관 휴무일이면 true. 주말 여부는 따지지 않는다. */
export function isHoliday(dateKey: string, extraClosedDates: readonly string[] = []): boolean {
    if (extraClosedDates.includes(dateKey)) return true;
    return getHolidayName(dateKey) !== '';
}

/** 주말·공휴일·기관 휴무가 아닌 날 */
export function isWorkingDay(dateKey: string, extraClosedDates: readonly string[] = []): boolean {
    return !isWeekend(dateKey) && !isHoliday(dateKey, extraClosedDates);
}
