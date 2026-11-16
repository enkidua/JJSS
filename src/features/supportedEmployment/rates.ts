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

/** 표에 그 연도의 고시 단가가 들어 있는지. */
export function hasRatesForYear(
    year: number,
    table: SupportedEmploymentRateTable = DEFAULT_SUPPORTED_EMPLOYMENT_RATES,
): boolean {
    return Number.isFinite(year) && Object.prototype.hasOwnProperty.call(table, Math.floor(year));
}

export interface SupportedEmploymentRateNotice {
    /** 제목에 "○○년 기준"이라고 적어도 되는 연도. 그 연도 고시 단가로 볼 수 없으면 null */
    basisYear: number | null;
    /** 담당자에게 보여 줄 경고. 없으면 '' */
    warning: string;
}

/**
 * 회차에 들어 있는 단가가 그 회차 연도의 고시 단가라고 말할 수 있는지 판단한다.
 * 표에 없는 연도는 getDefaultRates가 이전 연도 값을 넣어 주는데, 화면이 이를 "○○년 기준"이라고만 적으면
 * 담당자는 새 고시 금액이 반영된 것으로 알고 그대로 수당을 계산하게 된다. 그래서 대체한 사실을 숨기지 않는다.
 * caseYear는 훈련 시작 연도(아직 기간이 없으면 올해).
 */
export function describeRateBasis(
    rates: SupportedEmploymentRates,
    caseYear: number,
    table: SupportedEmploymentRateTable = DEFAULT_SUPPORTED_EMPLOYMENT_RATES,
): SupportedEmploymentRateNotice {
    const year = Number.isFinite(caseYear) && caseYear > 0 ? Math.floor(caseYear) : rates.year;
    const sameValues = (values: SupportedEmploymentRateValues | undefined) => Boolean(values)
        && rates.trainingAllowance === values!.trainingAllowance
        && rates.employerSubsidy === values!.employerSubsidy
        && rates.coachAllowance === values!.coachAllowance;

    if (hasRatesForYear(year, table)) {
        // 그 연도에 만든 회차이거나(담당자가 고친 금액 포함) 금액이 그 연도 고시 단가와 같으면 경고하지 않는다.
        if (rates.year === year || sameValues(table[year])) return { basisYear: year, warning: '' };
        return {
            basisYear: null,
            warning: `이 회차는 ${year}년 훈련인데 단가는 ${rates.year}년 기준으로 들어 있습니다. ${year}년 고시 금액을 확인해 고쳐 주세요.`,
        };
    }

    const years = Object.keys(table).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const known = years.filter(y => y <= year);
    const sourceYear = known.length ? known[known.length - 1] : years[0];
    if (sourceYear !== undefined && sameValues(table[sourceYear])) {
        return {
            basisYear: null,
            warning: `${year}년 고시 단가가 프로그램에 없어 ${sourceYear}년 단가를 넣었습니다. 고시 금액을 확인해 고쳐 주세요.`,
        };
    }
    if (rates.year !== year) {
        return {
            basisYear: null,
            warning: `${year}년 고시 단가가 프로그램에 없습니다. 지금 금액은 ${rates.year}년 회차에서 가져온 것이니 고시 금액을 확인해 고쳐 주세요.`,
        };
    }
    return {
        basisYear: null,
        warning: `${year}년 고시 단가가 프로그램에 없습니다. 입력한 금액이 ${year}년 고시 금액과 같은지 확인해 주세요.`,
    };
}
