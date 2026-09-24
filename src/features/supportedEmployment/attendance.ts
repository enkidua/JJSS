/**
 * 출결 → 지급 일수 (계획서 D-7 #2).
 * - 결석: 해당일 미지급.
 * - 지각·조퇴: 그날은 출석으로 지급하되, 합계 3회마다 결석 1회로 환산해 지급 일수에서 뺀다
 *   (floor(횟수 / 3)). 3회 미만은 전액. 나머지 횟수는 remainderLateOrEarly로 누적 표시.
 * - 환산 결석은 현장훈련 지급 일수에서 먼저 빼고, 현장 일수가 모자라면 사전훈련 일수에서 뺀다.
 *   (지각·조퇴는 대부분 현장훈련에서 생기고, 사전훈련은 보통 1일이라 사전 수당을 남겨 두는 편이
 *   서류상 설명이 쉽다. 이 선택은 사업주보조금(현장만)에도 영향을 준다.)
 */
import type { SupportedEmploymentDailyLog } from './model';

export interface AttendanceSummary {
    /** 일지에 있는 사전/현장 훈련일 수(출결 무관) */
    preDays: number;
    fieldDays: number;
    /** 지급 대상 일수(결석·환산 결석 제외) */
    paidPreDays: number;
    paidFieldDays: number;
    /** 실제 결석일 */
    absentDays: number;
    absentPreDays: number;
    absentFieldDays: number;
    /** 지각+조퇴 횟수 */
    lateOrEarlyCount: number;
    lateCount: number;
    earlyLeaveCount: number;
    /** 지각·조퇴 3회 = 결석 1회 환산 */
    convertedAbsences: number;
    /** 환산하고 남은 지각·조퇴 횟수(0~2) */
    remainderLateOrEarly: number;
    /** 환산 결석을 어느 단계에서 뺐는지 */
    convertedFromField: number;
    convertedFromPre: number;
    attendedDays: number;
}

export const LATE_OR_EARLY_PER_ABSENCE = 3;

export function summarizeAttendance(logs: readonly SupportedEmploymentDailyLog[]): AttendanceSummary {
    let preDays = 0;
    let fieldDays = 0;
    let absentPreDays = 0;
    let absentFieldDays = 0;
    let lateCount = 0;
    let earlyLeaveCount = 0;

    for (const log of logs) {
        const isPre = log.phase === '사전';
        if (isPre) preDays += 1;
        else fieldDays += 1;
        if (log.attendance === '결석') {
            if (isPre) absentPreDays += 1;
            else absentFieldDays += 1;
        } else if (log.attendance === '지각') {
            lateCount += 1;
        } else if (log.attendance === '조퇴') {
            earlyLeaveCount += 1;
        }
    }

    const lateOrEarlyCount = lateCount + earlyLeaveCount;
    const convertedAbsences = Math.floor(lateOrEarlyCount / LATE_OR_EARLY_PER_ABSENCE);
    const remainderLateOrEarly = lateOrEarlyCount % LATE_OR_EARLY_PER_ABSENCE;

    const attendedPre = preDays - absentPreDays;
    const attendedField = fieldDays - absentFieldDays;
    const convertedFromField = Math.min(convertedAbsences, attendedField);
    const convertedFromPre = Math.min(convertedAbsences - convertedFromField, attendedPre);

    return {
        preDays,
        fieldDays,
        paidPreDays: attendedPre - convertedFromPre,
        paidFieldDays: attendedField - convertedFromField,
        absentDays: absentPreDays + absentFieldDays,
        absentPreDays,
        absentFieldDays,
        lateOrEarlyCount,
        lateCount,
        earlyLeaveCount,
        convertedAbsences,
        remainderLateOrEarly,
        convertedFromField,
        convertedFromPre,
        attendedDays: attendedPre + attendedField,
    };
}
