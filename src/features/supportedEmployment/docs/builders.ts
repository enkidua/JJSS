/**
 * 지원고용 결과보고 서류 5종의 내용(블록) 구성. DOCX·HTML은 blocks.ts가 같은 블록에서 그린다.
 * 서명·직인 칸은 비워 둔다(출력 후 수기).
 */
import { localDateKey } from '../../../utils/date';
import { calculatePayments, formatWon, type PaymentCalculation } from '../calc';
import { weekdayOf } from '../holidays';
import { EVALUATION_GROUPS, evaluationTotals, normalizeCase, type SupportedEmploymentCase } from '../model';
import { groupDatesByWeek, timeRangeHours } from '../schedule';
import type { Cell, DocBlock, DocModel } from './blocks';

export type SupportedEmploymentDocumentKind =
    | 'resultReport'
    | 'paymentStatement'
    | 'trainingLog'
    | 'evaluationRecord'
    | 'coachTimesheet';

/** 묶음 출력 순서와 파일명 표기 */
export const SUPPORTED_EMPLOYMENT_DOCUMENTS: ReadonlyArray<{ kind: SupportedEmploymentDocumentKind; label: string; fileLabel: string }> = [
    { kind: 'resultReport', label: '결과보고', fileLabel: '결과보고' },
    { kind: 'paymentStatement', label: '지원고용 수당 지급명세서', fileLabel: '수당지급명세서' },
    { kind: 'trainingLog', label: '지원고용 훈련일지', fileLabel: '훈련일지' },
    { kind: 'evaluationRecord', label: '훈련생 종합 평가기록부', fileLabel: '종합평가기록부' },
    { kind: 'coachTimesheet', label: '직무지도원 출근부', fileLabel: '직무지도원출근부' },
];

export interface DocumentOptions {
    /** 기관명(결과보고 하단) */
    organizationName?: string;
    /** (위탁기관) 담당자 이름 — 설정의 담당자 프로필 */
    staffName?: string;
    /** 서류 작성일(YYYY-MM-DD). 기본: 훈련 종료일, 없으면 오늘 */
    documentDate?: string;
    /** calc.ts 참고 */
    coachDaysBasis?: 'scheduled' | 'attended';
}

// ─── 표기 도우미 ───

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dateParts(date: string): [string, string, string] | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    return match ? [match[1], match[2], match[3]] : null;
}

/** '2026-08-19' → '2026. 8. 19.' */
export function formatDateDot(date: string): string {
    const parts = dateParts(date);
    return parts ? `${parts[0]}. ${Number(parts[1])}. ${Number(parts[2])}.` : '';
}

/** '2026-08-19' → '2026년 8월 19일' */
export function formatDateKorean(date: string): string {
    const parts = dateParts(date);
    return parts ? `${parts[0]}년 ${Number(parts[1])}월 ${Number(parts[2])}일` : '        년      월      일';
}

/** '2026-08-19' → '08.19(수)' */
function formatDateShort(date: string): string {
    const parts = dateParts(date);
    return parts ? `${parts[1]}.${parts[2]}(${WEEKDAYS[weekdayOf(date)]})` : '';
}

function formatPeriod(c: SupportedEmploymentCase): string {
    if (!c.period.start && !c.period.end) return '';
    return `${formatDateDot(c.period.start)} ~ ${formatDateDot(c.period.end)}`;
}

function formatHours(hours: number): string {
    const rounded = Math.round(hours * 100) / 100;
    return `${rounded}시간`;
}

function timeRange(start: string, end: string): string {
    return start || end ? `${start || ''}~${end || ''}` : '';
}

function account(payee: { bank: string; account: string }): string {
    return [payee.bank, payee.account].filter(Boolean).join(' ');
}

function documentDate(c: SupportedEmploymentCase, options: DocumentOptions): string {
    return options.documentDate || c.period.end || localDateKey();
}

function roundLabel(c: SupportedEmploymentCase): string {
    return c.round ? `${c.round}차` : '';
}

const shade = (text: string, extra: Partial<Exclude<Cell, string>> = {}): Cell => ({ text, shade: true, ...extra });
const center = (text: string, extra: Partial<Exclude<Cell, string>> = {}): Cell => ({ text, align: 'center', ...extra });
const right = (text: string, extra: Partial<Exclude<Cell, string>> = {}): Cell => ({ text, align: 'right', ...extra });

function signatureBlocks(date: string, lines: string[]): DocBlock[] {
    return [
        { type: 'paragraph', text: formatDateKorean(date), align: 'center', spaceBefore: 240 },
        ...lines.map((line, index): DocBlock => ({ type: 'paragraph', text: line, align: 'right', spaceBefore: index === 0 ? 240 : 120 })),
    ];
}

function signatureLine(role: string, name = ''): string {
    return `${role} :  ${name || '                '}  (서명 또는 인)`;
}

function paymentRows(payments: PaymentCalculation): Cell[][] {
    const rows: Cell[][] = payments.items.map(item => [
        center(item.label),
        right(formatWon(item.unit)),
        center(`${item.days}일`),
        right(formatWon(item.amount)),
        center(item.formula),
    ]);
    rows.push([shade('계'), { text: '', colSpan: 2 }, right(formatWon(payments.total), { bold: true }), { text: '' }]);
    return rows;
}

// ─── ① 결과보고 ───

export function resultReportModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    const payments = calculatePayments(c, options);
    const a = payments.attendance;
    const totals = evaluationTotals(c.evaluation);
    const days = `${a.preDays + a.fieldDays}일 (사전 ${a.preDays}일, 현장 ${a.fieldDays}일)`;
    const blocks: DocBlock[] = [
        { type: 'title', text: `지원고용 훈련 결과보고${c.round ? ` (${roundLabel(c)})` : ''}` },
        { type: 'paragraph', text: '1. 훈련 개요', bold: true, size: 11 },
        {
            type: 'table',
            widths: [18, 32, 18, 32],
            rows: [
                [shade('회차'), roundLabel(c), shade('계획인원'), `${c.plannedCount}명`],
                [shade('훈련생'), c.seekerName, shade('사업체명'), c.employerName],
                [shade('훈련직무'), c.jobTitle, shade('훈련기간'), formatPeriod(c)],
                [shade('훈련일수'), days, shade('직무지도원'), [c.coach.name, c.coach.type ? `(${c.coach.type})` : ''].filter(Boolean).join(' ')],
            ],
        },
        { type: 'spacer' },
        { type: 'paragraph', text: '2. 훈련 결과', bold: true, size: 11 },
        {
            type: 'table',
            widths: [18, 32, 18, 32],
            rows: [
                [shade('출석 현황'), { text: `출석 ${a.attendedDays - a.lateCount - a.earlyLeaveCount}일 · 지각 ${a.lateCount}회 · 조퇴 ${a.earlyLeaveCount}회 · 결석 ${a.absentDays}일`, colSpan: 3 }],
                [shade('지각·조퇴 환산'), { text: a.convertedAbsences
                    ? `지각·조퇴 ${a.lateOrEarlyCount}회 → 결석 ${a.convertedAbsences}일 환산(남은 ${a.remainderLateOrEarly}회)`
                    : `지각·조퇴 ${a.lateOrEarlyCount}회 (3회 미만 환산 없음)`, colSpan: 3 }],
                [shade('수료 여부'), c.result.completed ? '수료' : '미수료', shade('취업 여부'), c.result.employed ? `취업${c.result.employmentDate ? ` (${formatDateDot(c.result.employmentDate)})` : ''}` : '미취업'],
                [shade('평가 총점'), `사전 ${totals.pre}점 / 현장 ${totals.field}점 (만점 100점)`, shade('진행 상태'), c.status],
                [shade('비고'), { text: c.result.note, colSpan: 3 }],
            ],
        },
        { type: 'spacer' },
        { type: 'paragraph', text: '3. 수당 지급 내역', bold: true, size: 11 },
        { type: 'paragraph', text: '(단위 : 원)', align: 'right', size: 9 },
        {
            type: 'table',
            widths: [20, 16, 12, 20, 32],
            headerRows: 1,
            rows: [
                [shade('구분'), shade('1일 단가'), shade('일수'), shade('금액'), shade('산출 내역')],
                ...paymentRows(payments),
            ],
        },
        { type: 'paragraph', text: `※ 훈련수당: 사전+현장 지급일 / 사업주보조금: 현장 지급일 / 직무지도원수당: 사전+현장 ${options.coachDaysBasis === 'attended' ? '출석일' : '훈련일'}
※ 결석일과 지각·조퇴 3회=결석 1회 환산분은 훈련수당·사업주보조금에서 제외`, size: 8, spaceBefore: 80 },
        { type: 'paragraph', text: '위와 같이 지원고용 훈련 결과를 보고합니다.', align: 'center', spaceBefore: 360 },
        ...signatureBlocks(documentDate(c, options), [
            options.organizationName ? `기관명 :  ${options.organizationName}` : '',
            signatureLine('담당자', options.staffName),
        ].filter(Boolean)),
    ];
    return { title: '지원고용 결과보고', blocks };
}

// ─── ② 지원고용 수당 지급명세서 (별지 제9호, 2021.12.30 개정 열 순서) ───

export function paymentStatementModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    const payments = calculatePayments(c, options);
    const byKey = Object.fromEntries(payments.items.map(item => [item.key, item]));
    const payeeCell = (name: string, payee: { bank: string; account: string }) => [name, account(payee)].filter(Boolean).join('\n');
    const row = (key: string, name: string, payee: { bank: string; account: string; phone: string }): Cell[] => {
        const item = byKey[key];
        return [center(item.label), center(name), center(payeeCell(name, payee)), center(payee.phone), center(item.formula), right(formatWon(item.amount))];
    };
    const coachName = c.coach.name ? `${c.coach.name}${c.coach.type ? `(${c.coach.type})` : ''}` : '';
    return {
        title: '지원고용 수당 지급명세서',
        blocks: [
            { type: 'title', text: '지원고용 수당 지급명세서' },
            {
                type: 'paragraph',
                text: [roundLabel(c) && `회차 : ${roundLabel(c)}`, formatPeriod(c) && `훈련기간 : ${formatPeriod(c)}`].filter(Boolean).join('    '),
                size: 9,
            },
            { type: 'paragraph', text: '(단위 : 원)', align: 'right', size: 9 },
            {
                type: 'table',
                widths: [15, 17, 24, 15, 17, 12],
                headerRows: 1,
                minRowHeight: 560,
                rows: [
                    [shade('구분'), shade('성명(사업장명)'), shade('수령인(송금계좌번호)'), shade('연락처'), shade('지급명세'), shade('금액')],
                    row('trainingAllowance', c.seekerName, c.traineePayee),
                    row('employerSubsidy', c.employerName, c.employerPayee),
                    row('coachAllowance', coachName, c.coach),
                    [shade('계'), { text: '', colSpan: 4 }, right(formatWon(payments.total), { bold: true })],
                ],
            },
            ...signatureBlocks(documentDate(c, options), [signatureLine('작성자', options.staffName)]),
        ],
    };
}

// ─── ③ 지원고용 훈련일지 ───

export function trainingLogModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    const payments = calculatePayments(c, options);
    const a = payments.attendance;
    const attendedLogs = c.dailyLogs.filter(log => log.attendance !== '결석');
    const typicalRange = attendedLogs.find(log => log.start && log.end);
    const dailyHours = typicalRange ? timeRangeHours(typicalRange.start, typicalRange.end) : 0;
    const guidanceTime = typicalRange
        ? `1일 ${formatHours(dailyHours)} (${timeRange(typicalRange.start, typicalRange.end)}) / 총 ${formatHours(payments.coach.hours)}`
        : '';
    // 직무지도일수 내역은 수당 계산 기준(coachDaysBasis)과 같게 보여 준다.
    const coachDaysText = options.coachDaysBasis === 'attended'
        ? `${payments.coach.days}일 (출석 기준: 사전 ${a.preDays - a.absentPreDays}일, 현장 ${a.fieldDays - a.absentFieldDays}일)`
        : `${payments.coach.days}일 (사전 ${a.preDays}일, 현장 ${a.fieldDays}일)`;
    const header: Cell[][] = [
        [shade('훈련생명'), c.seekerName, shade('직무지도원 성명'), c.coach.name],
        [shade('사업체명'), c.employerName, shade('훈련직무'), c.jobTitle],
        [shade('직무지도시간'), guidanceTime, shade('직무지도원 구분'), c.coach.type],
        [shade('훈련기간'), formatPeriod(c), shade('직무지도일수'), coachDaysText],
        [shade('1:多 지도여부'), c.oneToManyGuidance ? '해당' : '해당없음', shade('주휴수당'), c.weeklyHolidayAllowance],
    ];
    const logRows: Cell[][] = c.dailyLogs.map(log => {
        const hours = timeRangeHours(log.start, log.end);
        const absent = log.attendance === '결석';
        return [
            center(log.phase),
            center(formatDateShort(log.date)),
            center(log.attendance),
            center(absent ? '-' : [timeRange(log.start, log.end), hours ? `(${formatHours(hours)})` : ''].filter(Boolean).join('\n')),
            center(absent ? '-' : log.commuteGuidance ? '○' : '×'),
            log.task,
            center(log.performanceHours),
            log.note,
        ];
    });
    return {
        title: '지원고용 훈련일지',
        blocks: [
            { type: 'title', text: '지원고용 훈련일지' },
            { type: 'table', widths: [17, 33, 17, 33], rows: header },
            { type: 'spacer' },
            {
                type: 'table',
                widths: [7, 11, 9, 13, 9, 17, 12, 22],
                headerRows: 1,
                fontSize: 9,
                minRowHeight: 500,
                rows: [
                    [
                        shade('구분\n(사전/현장)'),
                        shade('훈련일자'),
                        shade('출석/결석\n/지각/조퇴'),
                        shade('훈련시간'),
                        shade('출퇴근\n지도 여부'),
                        shade('수행과제'),
                        shade('수행정도\n(측정시간)'),
                        shade('평가 및 지도사항'),
                    ],
                    ...logRows,
                ],
            },
            {
                type: 'paragraph',
                text: `출석 ${a.attendedDays - a.lateCount - a.earlyLeaveCount}일 · 지각 ${a.lateCount}회 · 조퇴 ${a.earlyLeaveCount}회 · 결석 ${a.absentDays}일${a.convertedAbsences ? ` (지각·조퇴 ${a.lateOrEarlyCount}회 → 결석 ${a.convertedAbsences}일 환산)` : ''}`,
                size: 9,
                spaceBefore: 80,
            },
            { type: 'paragraph', text: '위와 같이 실시하였음을 확인함', align: 'center', spaceBefore: 360 },
            ...signatureBlocks(documentDate(c, options), [
                signatureLine('직무지도원', c.coach.name),
                signatureLine('(위탁기관) 담당자', options.staffName),
            ]),
        ],
    };
}

// ─── ④ 지원고용 훈련생 종합 평가기록부 ───

export function evaluationRecordModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    const totals = evaluationTotals(c.evaluation);
    const score = (value: number | null) => center(value === null ? '' : String(value));
    const rows: Cell[][] = [[shade('영역'), shade('번호'), shade('평가항목'), shade('사전'), shade('현장'), shade('평가소견')]];
    let index = 0;
    for (const group of EVALUATION_GROUPS) {
        group.items.forEach((item, itemIndex) => {
            const row: Cell[] = [];
            if (itemIndex === 0) row.push(shade(group.label, { rowSpan: group.items.length }));
            row.push(center(String(index + 1)), item, score(c.evaluation.pre[index]), score(c.evaluation.field[index]));
            if (itemIndex === 0) row.push({ text: c.evaluation.opinions[group.key], rowSpan: group.items.length, size: 9 });
            rows.push(row);
            index += 1;
        });
    }
    rows.push([shade('총점(만점 100점)', { colSpan: 3 }), center(String(totals.pre), { bold: true }), center(String(totals.field), { bold: true }), { text: '' }]);
    rows.push([shade('비고'), { text: '※ 항목별 점수채점 : 우수 5점, 양호 4점, 보통 3점, 미흡 2점, 불량 1점', colSpan: 5, size: 9 }]);
    return {
        title: '지원고용 훈련생 종합 평가기록부',
        blocks: [
            { type: 'title', text: '지원고용 훈련생 종합 평가기록부' },
            {
                type: 'table',
                widths: [17, 33, 17, 33],
                rows: [
                    [shade('훈련생명'), c.seekerName, shade('사업체명'), c.employerName],
                    [shade('훈련직무'), c.jobTitle, shade('훈련기간'), formatPeriod(c)],
                ],
            },
            { type: 'spacer' },
            { type: 'table', widths: [11, 6, 42, 8, 8, 25], headerRows: 1, rows, minRowHeight: 400 },
            ...signatureBlocks(documentDate(c, options), [
                signatureLine('직무지도원', c.coach.name),
                signatureLine('(위탁기관) 담당자', options.staffName),
            ]),
        ],
    };
}

// ─── ⑤ 직무지도원 출근부 ───

export function coachTimesheetModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    const payments = calculatePayments(c, options);
    // 출근부 입력이 없으면 훈련일지 시간으로 채운다.
    const entries = c.coachTimesheet.length
        ? c.coachTimesheet
        : c.dailyLogs.map(log => ({ date: log.date, start: log.start, end: log.end, hours: timeRangeHours(log.start, log.end), oneToMany: c.oneToManyGuidance, overtime: 0 }));
    const byDate = new Map(entries.map(entry => [entry.date, entry]));
    const totalHours = payments.coach.hours + payments.coach.oneToManyHours;

    const header: Cell[][] = [
        [shade('성명'), { text: c.coach.name, colSpan: 2 }, shade('연락처'), { text: c.coach.phone, colSpan: 2 }],
        [shade('배치사업체명'), { text: c.employerName, colSpan: 2 }, shade('지도기간'), { text: formatPeriod(c), colSpan: 2 }],
        [shade('지도일수 및 시간'), { text: `${entries.length}일 / ${formatHours(totalHours)}`, colSpan: 2 }, shade('주휴수당'), { text: c.weeklyHolidayAllowance, colSpan: 2 }],
        [shade('일반 지도시간'), formatHours(payments.coach.hours), shade('1:多 지도시간'), formatHours(payments.coach.oneToManyHours), shade('연장 지도시간'), formatHours(payments.coach.overtimeHours)],
    ];

    const grid: Cell[][] = [[shade('주차'), shade('구분'), ...['월', '화', '수', '목', '금', '토', '일'].map(day => shade(day)), shade('주계')]];
    groupDatesByWeek(entries.map(entry => entry.date)).forEach((week, weekIndex) => {
        const weekEntries = week.days.map(date => (date ? byDate.get(date) : undefined));
        const weekHours = weekEntries.reduce((sum, entry) => sum + (entry ? entry.hours + entry.overtime : 0), 0);
        grid.push([
            shade(`${weekIndex + 1}주차`, { rowSpan: 3 }),
            shade('일자', { size: 8 }),
            ...week.days.map(date => center(date ? formatDateShort(date).slice(0, 5) : '', { size: 8 })),
            center(formatHours(weekHours), { rowSpan: 3, size: 8 }),
        ]);
        grid.push([
            shade('근무시간', { size: 8 }),
            ...weekEntries.map(entry => center(entry ? timeRange(entry.start, entry.end).replace('~', '~\n') : '', { size: 8 })),
        ]);
        grid.push([
            shade('지도시간', { size: 8 }),
            ...weekEntries.map(entry => center(entry
                ? `${formatHours(entry.hours)}${entry.oneToMany ? '\n(1:多)' : ''}${entry.overtime ? `\n연장 ${formatHours(entry.overtime)}` : ''}`
                : '', { size: 8 })),
        ]);
    });

    return {
        title: '직무지도원 출근부',
        blocks: [
            { type: 'title', text: '직무지도원 출근부' },
            { type: 'table', widths: [18, 16, 16, 18, 16, 16], rows: header },
            { type: 'spacer' },
            { type: 'table', widths: [8, 9, 10, 10, 10, 10, 10, 10, 10, 9], headerRows: 1, fontSize: 8, rows: grid },
            { type: 'paragraph', text: '위와 같이 근무하였음을 확인함', align: 'center', spaceBefore: 360 },
            ...signatureBlocks(documentDate(c, options), [
                signatureLine('직무지도원', c.coach.name),
                signatureLine('사업체 담당자'),
                signatureLine('(위탁기관) 담당자', options.staffName),
            ]),
        ],
    };
}

export function documentModel(kind: SupportedEmploymentDocumentKind, c: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    switch (kind) {
        case 'resultReport': return resultReportModel(c, options);
        case 'paymentStatement': return paymentStatementModel(c, options);
        case 'trainingLog': return trainingLogModel(c, options);
        case 'evaluationRecord': return evaluationRecordModel(c, options);
        case 'coachTimesheet': return coachTimesheetModel(c, options);
        default: throw new Error('알 수 없는 서류 종류입니다.');
    }
}

/**
 * 파일명: 지원고용_결과보고_14차_2026-08-19.docx — 이용자 이름은 넣지 않는다(개인정보 파일명 정책).
 * 날짜는 훈련 종료일(없으면 오늘). numbered면 묶음 출력용 번호 접두어(01_ …).
 */
export function buildDocumentFileName(
    kind: SupportedEmploymentDocumentKind,
    c: Pick<SupportedEmploymentCase, 'round' | 'period'>,
    options: { extension?: 'docx' | 'pdf' | 'html'; numbered?: boolean; date?: string } = {},
): string {
    const index = SUPPORTED_EMPLOYMENT_DOCUMENTS.findIndex(item => item.kind === kind);
    const meta = SUPPORTED_EMPLOYMENT_DOCUMENTS[index];
    if (!meta) throw new Error('알 수 없는 서류 종류입니다.');
    const date = /^\d{4}-\d{2}-\d{2}$/.test(options.date || '') ? options.date! : (/^\d{4}-\d{2}-\d{2}$/.test(c.period?.end || '') ? c.period.end : localDateKey());
    const round = Number.isFinite(c.round) && c.round > 0 ? `${Math.floor(c.round)}차` : '';
    const prefix = options.numbered ? `${String(index + 1).padStart(2, '0')}_` : '';
    return `${prefix}${['지원고용', meta.fileLabel, round, date].filter(Boolean).join('_')}.${options.extension || 'docx'}`;
}
