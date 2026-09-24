/**
 * 지원고용 회차(SupportedEmploymentCase) 데이터 모델.
 * 계획서 D-1 기준. 저장은 새 store 없이 caseDocuments(type 'supported_employment')에
 * JSON으로 넣는다(D-7 #1) — content는 localDB가 암호화하므로 계좌·연락처도 함께 암호화된다.
 */
import { localDateKey } from '../../utils/date';
import { getDefaultRates, type SupportedEmploymentRates } from './rates';
import { summarizeAttendance } from './attendance';
import { lunarHolidayDataWarning } from './holidays';

export const SUPPORTED_EMPLOYMENT_CASE_VERSION = 1 as const;
export const EVALUATION_ITEM_COUNT = 20;

export type TrainingPhase = '사전' | '현장';
export type AttendanceStatus = '출석' | '지각' | '조퇴' | '결석';
export type CoachType = '내부' | '외부';
export type SupportedEmploymentStatus = '진행중' | '수료' | '중단' | '취업';

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['출석', '지각', '조퇴', '결석'];
export const SUPPORTED_EMPLOYMENT_STATUSES: SupportedEmploymentStatus[] = ['진행중', '수료', '중단', '취업'];

export interface SupportedEmploymentDailyLog {
    /** YYYY-MM-DD */
    date: string;
    phase: TrainingPhase;
    attendance: AttendanceStatus;
    /** 'HH:MM' */
    start: string;
    end: string;
    /** 출퇴근지도 여부 */
    commuteGuidance: boolean;
    /** 수행과제 */
    task: string;
    /** 수행정도(측정시간) — 자유 입력 (예: "80% / 30분") */
    performanceHours: string;
    /** 평가 및 지도사항 */
    note: string;
}

export interface SupportedEmploymentCoachTimesheetEntry {
    date: string;
    start: string;
    end: string;
    /** 일반 지도시간(시간). 1:多 지도이면 oneToMany=true */
    hours: number;
    oneToMany: boolean;
    /** 연장 지도시간(시간) */
    overtime: number;
}

export interface SupportedEmploymentEvaluation {
    /** 20개 항목 점수(1~5). 미입력은 null */
    pre: Array<number | null>;
    field: Array<number | null>;
    opinions: {
        attitude: string;      // 근무태도
        relations: string;     // 대인관계
        workAttitude: string;  // 작업태도
        performance: string;   // 작업수행
    };
}

export interface SupportedEmploymentPayee {
    bank: string;
    account: string;
    phone: string;
}

export interface SupportedEmploymentCoach extends SupportedEmploymentPayee {
    name: string;
    type: CoachType;
}

export interface SupportedEmploymentDocumentOptions {
    organizationName: string;
    staffName: string;
    coachDaysBasis: 'scheduled' | 'attended';
}

export interface SupportedEmploymentCase {
    version: typeof SUPPORTED_EMPLOYMENT_CASE_VERSION;
    /** caseDocuments 문서 id와 같다. 저장 전에는 빈 문자열 */
    id: string;
    /** 회차 번호 (예: 14 → "14차") */
    round: number;
    seekerId: string;
    /** 저장 시점 이용자 이름 스냅샷 */
    seekerName: string;
    jobId: string;
    /** 저장 시점 사업체명 스냅샷 */
    employerName: string;
    /** 훈련직무 */
    jobTitle: string;
    period: { start: string; end: string; plannedEnd: string };
    plannedCount: number;
    preTrainingDays: number;
    /** 기관 휴무일(YYYY-MM-DD) — 훈련일 생성에서 제외 */
    extraClosedDates: string[];
    /** 1:多 지도 여부(훈련일지·출근부 머리 정보) */
    oneToManyGuidance: boolean;
    /** 주휴수당 표기(예: "해당없음") */
    weeklyHolidayAllowance: string;
    coach: SupportedEmploymentCoach;
    traineePayee: SupportedEmploymentPayee;
    employerPayee: SupportedEmploymentPayee;
    /** 회차 생성 시점 단가 복사본(나중에 단가표가 바뀌어도 과거 서류 유지) */
    rates: SupportedEmploymentRates;
    dailyLogs: SupportedEmploymentDailyLog[];
    coachTimesheet: SupportedEmploymentCoachTimesheetEntry[];
    evaluation: SupportedEmploymentEvaluation;
    result: { completed: boolean; employed: boolean; employmentDate: string; note: string };
    status: SupportedEmploymentStatus;
    budgetProjectId?: string;
    expenseIds?: string[];
    /** 출력 패널에서 입력한 기관명·담당자·지도원수당 기준(회차별로 기억) */
    documentOptions?: SupportedEmploymentDocumentOptions;
    createdAt?: string;
    updatedAt?: string;
}

/** 지원고용 훈련생 종합 평가기록부 20개 항목(공식 서식 문구 그대로). 점수 배열 순서와 같다. */
export const EVALUATION_GROUPS: ReadonlyArray<{
    key: keyof SupportedEmploymentEvaluation['opinions'];
    label: '근무태도' | '대인관계' | '작업태도' | '작업수행';
    items: readonly string[];
}> = [
    {
        key: 'attitude',
        label: '근무태도',
        items: [
            '결근, 지각, 조퇴 등을 하지 않는다',
            '결근, 지각, 조퇴 등을 할 때는 연락을 취한다',
            '휴식시간과 근무시간을 잘 지킨다',
            '주의사항을 잘 듣고 그대로 이행한다',
            '외모를 깨끗하고 단정하게 유지한다',
        ],
    },
    {
        key: 'relations',
        label: '대인관계',
        items: [
            '상황에 맞는 적절한 경어를 사용한다',
            '주위동료와 협조를 잘한다',
            '상사, 동료, 고객에게 인사를 잘한다',
            '질문에 적절한 답변을 할 수 있다',
            '다른 사람의 이야기를 잘 청취한다',
        ],
    },
    {
        key: 'workAttitude',
        label: '작업태도',
        items: [
            '적극적으로 업무에 참여한다',
            '지시없이 스스로 자신의 일을 수행한다',
            '열심히 작업에 몰두한다',
            '목표량을 완수하면 다른 일거리를 찾는다',
            '잘못을 지적할 때 호의적으로 반응한다',
        ],
    },
    {
        key: 'performance',
        label: '작업수행',
        items: [
            '도구나 기계를 잘 다룬다',
            '지시한 방법대로 작업을 수행한다(정확성)',
            '근무시간동안 산만하지 않고, 꾸준히 일한다',
            '주어진 작업량을 완수한다',
            '직무를 수행할수록, 속도와 정확성이 증가한다(숙련성)',
        ],
    },
];

/** 사전/현장 총점(만점 100점)과 미입력 개수 */
export function evaluationTotals(evaluation: SupportedEmploymentEvaluation): {
    pre: number; field: number; missingPre: number; missingField: number;
} {
    const sum = (scores: Array<number | null>) => scores.reduce<number>((acc, score) => acc + (score ?? 0), 0);
    return {
        pre: sum(evaluation.pre),
        field: sum(evaluation.field),
        missingPre: evaluation.pre.filter(score => score === null).length,
        missingField: evaluation.field.filter(score => score === null).length,
    };
}

function emptyPayee(): SupportedEmploymentPayee {
    return { bank: '', account: '', phone: '' };
}

export function emptyScores(): Array<number | null> {
    return Array.from({ length: EVALUATION_ITEM_COUNT }, () => null);
}

/** 새 회차. 단가는 기간 시작 연도(없으면 올해)의 기본 단가를 복사한다. */
export function createEmptyCase(init: Partial<SupportedEmploymentCase> = {}): SupportedEmploymentCase {
    const today = localDateKey();
    const start = init.period?.start || '';
    const year = Number((start || today).slice(0, 4));
    const base: SupportedEmploymentCase = {
        version: SUPPORTED_EMPLOYMENT_CASE_VERSION,
        id: '',
        round: 1,
        seekerId: '',
        seekerName: '',
        jobId: '',
        employerName: '',
        jobTitle: '',
        period: { start: '', end: '', plannedEnd: '' },
        plannedCount: 1,
        preTrainingDays: 1,
        extraClosedDates: [],
        oneToManyGuidance: false,
        weeklyHolidayAllowance: '해당없음',
        coach: { name: '', type: '내부', ...emptyPayee() },
        traineePayee: emptyPayee(),
        employerPayee: emptyPayee(),
        rates: getDefaultRates(year),
        dailyLogs: [],
        coachTimesheet: [],
        evaluation: {
            pre: emptyScores(),
            field: emptyScores(),
            opinions: { attitude: '', relations: '', workAttitude: '', performance: '' },
        },
        result: { completed: false, employed: false, employmentDate: '', note: '' },
        status: '진행중',
    };
    return normalizeCase({ ...base, ...init, version: SUPPORTED_EMPLOYMENT_CASE_VERSION });
}

/**
 * 다음 회차 복사(D-5): 같은 이용자·사업체·직무·지도원·계좌를 복사하고
 * 기간·일지·출근부·평가·결과는 비운다. 단가는 전달한 연도(없으면 올해) 기본값.
 */
export function copyCaseForNextRound(previous: SupportedEmploymentCase, year?: number): SupportedEmploymentCase {
    const next = createEmptyCase({
        round: (previous.round || 0) + 1,
        seekerId: previous.seekerId,
        seekerName: previous.seekerName,
        jobId: previous.jobId,
        employerName: previous.employerName,
        jobTitle: previous.jobTitle,
        plannedCount: previous.plannedCount,
        preTrainingDays: previous.preTrainingDays,
        oneToManyGuidance: previous.oneToManyGuidance,
        weeklyHolidayAllowance: previous.weeklyHolidayAllowance,
        coach: { ...previous.coach },
        traineePayee: { ...previous.traineePayee },
        employerPayee: { ...previous.employerPayee },
        budgetProjectId: previous.budgetProjectId,
        ...(previous.documentOptions ? { documentOptions: { ...previous.documentOptions } } : {}),
    });
    if (year) next.rates = getDefaultRates(year);
    return next;
}

// ─── 직렬화 ───

const str = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
const num = (value: unknown, fallback = 0): number => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const bool = (value: unknown): boolean => value === true;
const obj = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

function normalizeScores(value: unknown): Array<number | null> {
    const source = Array.isArray(value) ? value : [];
    return Array.from({ length: EVALUATION_ITEM_COUNT }, (_, index) => {
        const raw = source[index];
        if (raw === null || raw === undefined || raw === '') return null;
        const n = Number(raw);
        return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
    });
}

function normalizePayee(value: unknown): SupportedEmploymentPayee {
    const o = obj(value);
    return { bank: str(o.bank), account: str(o.account), phone: str(o.phone) };
}

const PHASES: TrainingPhase[] = ['사전', '현장'];

/** 누락·잘못된 필드를 기본값으로 채운다(저장된 데이터가 일부 깨져도 화면이 열리도록). */
export function normalizeCase(input: unknown): SupportedEmploymentCase {
    const o = obj(input);
    const period = obj(o.period);
    const coach = obj(o.coach);
    const rates = obj(o.rates);
    const evaluation = obj(o.evaluation);
    const opinions = obj(evaluation.opinions);
    const result = obj(o.result);
    const rateYear = num(rates.year, 0) || Number((str(period.start) || localDateKey()).slice(0, 4));
    const defaults = getDefaultRates(rateYear);
    const status = SUPPORTED_EMPLOYMENT_STATUSES.includes(o.status as SupportedEmploymentStatus)
        ? (o.status as SupportedEmploymentStatus)
        : '진행중';

    const normalized: SupportedEmploymentCase = {
        version: SUPPORTED_EMPLOYMENT_CASE_VERSION,
        id: str(o.id),
        round: Math.max(0, Math.floor(num(o.round, 1))),
        seekerId: str(o.seekerId),
        seekerName: str(o.seekerName),
        jobId: str(o.jobId),
        employerName: str(o.employerName),
        jobTitle: str(o.jobTitle),
        period: { start: str(period.start), end: str(period.end), plannedEnd: str(period.plannedEnd) },
        plannedCount: Math.max(0, Math.floor(num(o.plannedCount, 1))),
        preTrainingDays: Math.max(0, Math.floor(num(o.preTrainingDays, 1))),
        extraClosedDates: Array.isArray(o.extraClosedDates) ? o.extraClosedDates.map(str).filter(Boolean) : [],
        oneToManyGuidance: bool(o.oneToManyGuidance),
        weeklyHolidayAllowance: o.weeklyHolidayAllowance === undefined ? '해당없음' : str(o.weeklyHolidayAllowance),
        coach: {
            name: str(coach.name),
            type: coach.type === '외부' ? '외부' : '내부',
            ...normalizePayee(coach),
        },
        traineePayee: normalizePayee(o.traineePayee),
        employerPayee: normalizePayee(o.employerPayee),
        rates: {
            year: rateYear,
            trainingAllowance: num(rates.trainingAllowance, defaults.trainingAllowance),
            employerSubsidy: num(rates.employerSubsidy, defaults.employerSubsidy),
            coachAllowance: num(rates.coachAllowance, defaults.coachAllowance),
        },
        dailyLogs: (Array.isArray(o.dailyLogs) ? o.dailyLogs : []).map(item => {
            const log = obj(item);
            return {
                date: str(log.date),
                phase: PHASES.includes(log.phase as TrainingPhase) ? (log.phase as TrainingPhase) : '현장',
                attendance: ATTENDANCE_STATUSES.includes(log.attendance as AttendanceStatus)
                    ? (log.attendance as AttendanceStatus)
                    : '출석',
                start: str(log.start),
                end: str(log.end),
                commuteGuidance: bool(log.commuteGuidance),
                task: str(log.task),
                performanceHours: str(log.performanceHours),
                note: str(log.note),
            };
        }).filter(log => log.date),
        coachTimesheet: (Array.isArray(o.coachTimesheet) ? o.coachTimesheet : []).map(item => {
            const entry = obj(item);
            return {
                date: str(entry.date),
                start: str(entry.start),
                end: str(entry.end),
                hours: Math.max(0, num(entry.hours)),
                oneToMany: bool(entry.oneToMany),
                overtime: Math.max(0, num(entry.overtime)),
            };
        }).filter(entry => entry.date),
        evaluation: {
            pre: normalizeScores(evaluation.pre),
            field: normalizeScores(evaluation.field),
            opinions: {
                attitude: str(opinions.attitude),
                relations: str(opinions.relations),
                workAttitude: str(opinions.workAttitude),
                performance: str(opinions.performance),
            },
        },
        result: {
            completed: bool(result.completed),
            employed: bool(result.employed),
            employmentDate: str(result.employmentDate),
            note: str(result.note),
        },
        status,
    };
    if (typeof o.budgetProjectId === 'string' && o.budgetProjectId) normalized.budgetProjectId = o.budgetProjectId;
    if (Array.isArray(o.expenseIds)) normalized.expenseIds = o.expenseIds.map(str).filter(Boolean);
    if (o.documentOptions && typeof o.documentOptions === 'object') {
        const options = obj(o.documentOptions);
        normalized.documentOptions = {
            organizationName: str(options.organizationName),
            staffName: str(options.staffName),
            coachDaysBasis: options.coachDaysBasis === 'attended' ? 'attended' : 'scheduled',
        };
    }
    if (typeof o.createdAt === 'string') normalized.createdAt = o.createdAt;
    if (typeof o.updatedAt === 'string') normalized.updatedAt = o.updatedAt;
    normalized.dailyLogs.sort((a, b) => a.date.localeCompare(b.date));
    normalized.coachTimesheet.sort((a, b) => a.date.localeCompare(b.date));
    return normalized;
}

export function serializeCase(value: SupportedEmploymentCase): string {
    return JSON.stringify({ ...normalizeCase(value), version: SUPPORTED_EMPLOYMENT_CASE_VERSION });
}

export type ParseCaseResult =
    | { ok: true; case: SupportedEmploymentCase }
    | { ok: false; error: string };

/** caseDocuments.content → 회차. 예외를 던지지 않는다. */
export function parseCase(content: string | null | undefined): ParseCaseResult {
    if (typeof content !== 'string' || !content.trim()) return { ok: false, error: '저장된 내용이 비어 있습니다.' };
    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return { ok: false, error: '저장된 내용을 읽을 수 없습니다.' };
    }
    const o = obj(raw);
    if (!Object.keys(o).length) return { ok: false, error: '저장된 내용 형식이 올바르지 않습니다.' };
    const version = num(o.version, 0);
    if (version < 1) return { ok: false, error: '지원고용 회차 데이터가 아닙니다.' };
    if (version > SUPPORTED_EMPLOYMENT_CASE_VERSION) {
        return { ok: false, error: '더 새로운 버전 프로그램에서 저장한 회차입니다. 프로그램을 업데이트해 주세요.' };
    }
    return { ok: true, case: normalizeCase(o) };
}

// ─── 출력 전 체크리스트 ───

export interface CaseValidationIssue {
    level: 'error' | 'warning' | 'info';
    /** 관련 입력 영역 (화면에서 해당 칸으로 이동할 때 사용) */
    field: 'basic' | 'period' | 'coach' | 'traineePayee' | 'employerPayee' | 'rates' | 'dailyLogs' | 'evaluation' | 'result' | 'signature';
    message: string;
}

/** 결과보고 출력 전 확인 목록(D-2 #6). error가 있어도 출력은 막지 않고 화면에서 안내한다. */
export function validateCase(value: SupportedEmploymentCase): CaseValidationIssue[] {
    const c = normalizeCase(value);
    const issues: CaseValidationIssue[] = [];
    const add = (level: CaseValidationIssue['level'], field: CaseValidationIssue['field'], message: string) =>
        issues.push({ level, field, message });

    if (!c.seekerId) add('error', 'basic', '이용자를 선택하지 않았습니다.');
    if (!c.jobId && !c.employerName) add('error', 'basic', '사업체를 선택하지 않았습니다.');
    if (!c.jobTitle.trim()) add('warning', 'basic', '훈련직무가 비어 있습니다.');
    if (!c.round) add('warning', 'basic', '회차 번호가 없습니다.');

    if (!c.period.start || !c.period.end) add('error', 'period', '훈련기간(시작·종료일)이 비어 있습니다.');
    else if (c.period.start > c.period.end) add('error', 'period', '훈련 종료일이 시작일보다 앞섭니다.');
    else {
        const holidayWarning = lunarHolidayDataWarning(c.period.start, c.period.end);
        if (holidayWarning) add('warning', 'period', holidayWarning);
    }

    if (!c.coach.name.trim()) add('error', 'coach', '직무지도원 성명이 비어 있습니다.');
    if (!c.coach.bank.trim() || !c.coach.account.trim()) add('error', 'coach', '직무지도원 계좌(은행·계좌번호)가 누락되었습니다.');
    if (!c.coach.phone.trim()) add('warning', 'coach', '직무지도원 연락처가 비어 있습니다.');
    if (!c.traineePayee.bank.trim() || !c.traineePayee.account.trim()) add('error', 'traineePayee', '훈련생 송금계좌(은행·계좌번호)가 누락되었습니다.');
    if (!c.traineePayee.phone.trim()) add('warning', 'traineePayee', '훈련생 연락처가 비어 있습니다.');
    if (!c.employerPayee.bank.trim() || !c.employerPayee.account.trim()) add('error', 'employerPayee', '사업체 송금계좌(은행·계좌번호)가 누락되었습니다.');
    if (!c.employerPayee.phone.trim()) add('warning', 'employerPayee', '사업체 연락처가 비어 있습니다.');

    if (!(c.rates.trainingAllowance > 0) || !(c.rates.employerSubsidy > 0) || !(c.rates.coachAllowance > 0)) {
        add('error', 'rates', '단가 중 0원인 항목이 있습니다.');
    }

    if (!c.dailyLogs.length) {
        add('error', 'dailyLogs', '훈련일지가 없습니다. 훈련기간을 정해 훈련일을 만들어 주세요.');
    } else {
        const outside = c.period.start && c.period.end
            ? c.dailyLogs.filter(log => log.date < c.period.start || log.date > c.period.end).length
            : 0;
        if (outside) add('warning', 'dailyLogs', `훈련기간 밖의 훈련일지가 ${outside}일 있습니다.`);
        const summary = summarizeAttendance(c.dailyLogs);
        if (summary.absentDays) add('info', 'dailyLogs', `결석 ${summary.absentDays}일은 수당에서 제외됩니다.`);
        if (summary.convertedAbsences) {
            add('info', 'dailyLogs', `지각·조퇴 ${summary.lateOrEarlyCount}회 → 결석 ${summary.convertedAbsences}일로 환산해 수당에서 제외됩니다.`);
        } else if (summary.lateOrEarlyCount) {
            add('info', 'dailyLogs', `지각·조퇴 ${summary.lateOrEarlyCount}회(3회 미만은 전액 지급)입니다.`);
        }
        const noTime = c.dailyLogs.filter(log => log.attendance !== '결석' && (!log.start || !log.end)).length;
        if (noTime) add('warning', 'dailyLogs', `훈련시간이 비어 있는 날이 ${noTime}일 있습니다.`);
        const noNote = c.dailyLogs.filter(log => log.attendance !== '결석' && !log.note.trim()).length;
        if (noNote) add('warning', 'dailyLogs', `평가 및 지도사항이 비어 있는 날이 ${noNote}일 있습니다.`);
        const preCount = c.dailyLogs.filter(log => log.phase === '사전').length;
        if (preCount !== c.preTrainingDays) {
            add('warning', 'dailyLogs', `사전훈련 일수(${c.preTrainingDays}일)와 일지의 사전훈련 날짜 수(${preCount}일)가 다릅니다.`);
        }
    }

    const missingPre = c.evaluation.pre.filter(score => score === null).length;
    const missingField = c.evaluation.field.filter(score => score === null).length;
    if (missingPre) add('warning', 'evaluation', `종합 평가기록부 사전 점수 ${missingPre}개 항목이 미입력입니다.`);
    if (missingField) add('warning', 'evaluation', `종합 평가기록부 현장 점수 ${missingField}개 항목이 미입력입니다.`);
    const o = c.evaluation.opinions;
    const missingOpinions = [o.attitude, o.relations, o.workAttitude, o.performance].filter(text => !text.trim()).length;
    if (missingOpinions) add('warning', 'evaluation', `평가소견 ${missingOpinions}개 영역이 비어 있습니다.`);

    if (c.status === '진행중' && c.period.end && c.period.end < localDateKey()) {
        add('warning', 'result', '훈련기간이 끝났지만 상태가 "진행중"입니다.');
    }
    if (c.result.employed && !c.result.employmentDate) add('warning', 'result', '취업일이 비어 있습니다.');

    add('info', 'signature', '서명·직인 칸은 비워 두었습니다. 출력 후 직접 서명해 주세요.');
    return issues;
}
