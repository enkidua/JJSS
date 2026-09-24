/**
 * 지원고용 연도별 기본 단가(원/일). 계획서 D-0 기준.
 * 회차 생성 시 회차에 복사해 두므로 이 표가 바뀌어도 과거 회차·서류는 변하지 않는다.
 * 새 연도 단가가 나오면 표에 행을 추가한다(설정 화면에서 덮어쓸 표를 넘길 수도 있다).
 */
export interface SupportedEmploymentRateValues {
    /** 훈련수당(훈련생, 사전+현장) */
    trainingAllowance: number;
    /** 사업주보조금(사업체, 현장만) */
    employerSubsidy: number;
    /** 직무지도원수당(사전+현장) */
    coachAllowance: number;
}

export interface SupportedEmploymentRates extends SupportedEmploymentRateValues {
    year: number;
}

export type SupportedEmploymentRateTable = Record<number, SupportedEmploymentRateValues>;

export const DEFAULT_SUPPORTED_EMPLOYMENT_RATES: SupportedEmploymentRateTable = {
    2026: { trainingAllowance: 35000, employerSubsidy: 19340, coachAllowance: 25000 },
};

/**
 * 해당 연도 기본 단가. 표에 없는 연도는 그 연도 이하 중 가장 최근 연도,
 * 그것도 없으면 표에서 가장 이른 연도의 값을 쓴다. 반환값의 year는 요청한 연도.
 */
export function getDefaultRates(
    year: number,
    table: SupportedEmploymentRateTable = DEFAULT_SUPPORTED_EMPLOYMENT_RATES,
): SupportedEmploymentRates {
    const years = Object.keys(table).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const safeYear = Number.isFinite(year) && year > 0 ? Math.floor(year) : new Date().getFullYear();
    if (!years.length) {
        return { year: safeYear, ...DEFAULT_SUPPORTED_EMPLOYMENT_RATES[2026] };
    }
    const known = years.filter(y => y <= safeYear);
    const sourceYear = known.length ? known[known.length - 1] : years[0];
    return { year: safeYear, ...table[sourceYear] };
}
