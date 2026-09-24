/**
 * 지원고용 수당 계산 (계획서 D-0, D-7 #2).
 *
 * | 항목          | 적용 일수                                   | 수령인      |
 * | 훈련수당       | 지급 사전일 + 지급 현장일 (결석·환산 결석 제외) | 훈련생      |
 * | 사업주보조금    | 지급 현장일만                                | 사업체      |
 * | 직무지도원수당  | 훈련일지의 사전 + 현장 훈련일(출결 무관)        | 직무지도원  |
 *
 * 직무지도원수당 기준: 계획서 D-0 표는 "사전훈련 + 현장훈련"만 적고 있고, 첨부 두 사례(결석 없음)로는
 * 출결 영향 여부를 확인할 수 없다. 지도원은 훈련이 편성된 날 사업장에 배치되어 근무하므로
 * 기본값은 '편성된 훈련일 전체'(scheduled)로 두고, 기관 지침이 "훈련생 결석일 미지급"이면
 * options.coachDaysBasis = 'attended'로 바꿔 쓴다(결석일만 빼고, 지각·조퇴 환산은 적용하지 않음).
 */
import { summarizeAttendance, type AttendanceSummary } from './attendance';
import type { SupportedEmploymentCase } from './model';
import { timeRangeHours } from './schedule';

export type PaymentItemKey = 'trainingAllowance' | 'employerSubsidy' | 'coachAllowance';

export interface PaymentLine {
    key: PaymentItemKey;
    label: '훈련수당' | '사업주보조금' | '직무지도원수당';
    payee: '훈련생' | '사업체' | '직무지도원';
    /** 1일 단가(원) */
    unit: number;
    days: number;
    amount: number;
    /** 예: '35,000원 × 16일' */
    formula: string;
}

export interface PaymentCalculation {
    items: PaymentLine[];
    total: number;
    attendance: AttendanceSummary;
    coach: {
        days: number;
        /** 일반 지도시간 합계(출근부, 없으면 훈련일지 시간) */
        hours: number;
        oneToManyHours: number;
        overtimeHours: number;
    };
}

export interface CalculatePaymentsOptions {
    coachDaysBasis?: 'scheduled' | 'attended';
}

/** 1250100 → '1,250,100' (로캘과 무관) */
export function formatWon(value: number): string {
    const n = Math.round(Number(value) || 0);
    const sign = n < 0 ? '-' : '';
    return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function paymentFormula(unit: number, days: number): string {
    return `${formatWon(unit)}원 × ${days}일`;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function calculatePayments(
    c: Pick<SupportedEmploymentCase, 'rates' | 'dailyLogs' | 'coachTimesheet'>,
    options: CalculatePaymentsOptions = {},
): PaymentCalculation {
    const attendance = summarizeAttendance(c.dailyLogs);
    const coachDays = options.coachDaysBasis === 'attended'
        ? attendance.attendedDays
        : attendance.preDays + attendance.fieldDays;

    const line = (key: PaymentItemKey, label: PaymentLine['label'], payee: PaymentLine['payee'], unit: number, days: number): PaymentLine => {
        const safeUnit = Math.max(0, Math.round(Number(unit) || 0));
        return { key, label, payee, unit: safeUnit, days, amount: safeUnit * days, formula: paymentFormula(safeUnit, days) };
    };

    const items: PaymentLine[] = [
        line('trainingAllowance', '훈련수당', '훈련생', c.rates.trainingAllowance, attendance.paidPreDays + attendance.paidFieldDays),
        line('employerSubsidy', '사업주보조금', '사업체', c.rates.employerSubsidy, attendance.paidFieldDays),
        line('coachAllowance', '직무지도원수당', '직무지도원', c.rates.coachAllowance, coachDays),
    ];

    let hours = 0;
    let oneToManyHours = 0;
    let overtimeHours = 0;
    if (c.coachTimesheet.length) {
        for (const entry of c.coachTimesheet) {
            if (entry.oneToMany) oneToManyHours += entry.hours;
            else hours += entry.hours;
            overtimeHours += entry.overtime;
        }
    } else {
        for (const log of c.dailyLogs) hours += timeRangeHours(log.start, log.end);
    }

    return {
        items,
        total: items.reduce((sum, item) => sum + item.amount, 0),
        attendance,
        coach: { days: coachDays, hours: round2(hours), oneToManyHours: round2(oneToManyHours), overtimeHours: round2(overtimeHours) },
    };
}
