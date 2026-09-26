/**
 * 지원고용 결과보고 서류모음 7종의 내용(블록) 구성. DOCX·HTML은 blocks.ts가 같은 블록에서 그린다.
 *
 * 양식은 기관이 실제로 제출한 "지원고용 결과보고 서류모음"(공단 붙임 서식 스캔본)을 그대로 따른다.
 * 열 폭·행 높이·쪽 여백은 원본을 mm 단위로 재서 옮겼고(scripts 검증 참고), 칸 이름·줄바꿈·순서도 원본과 같다.
 *   ① 결과보고 ② [붙임 28] 지원고용 수당 지급명세서 ③ 지원고용 훈련일지 ④ 지원고용 훈련생 종합 평가기록부
 *   ⑤ [붙임 19] 직무지도원 출근부 ⑥ [붙임 41] 지원고용 현장훈련 안전체크리스트 ⑦ (별지 제37-4호) 기타소득 지급내역서
 *
 * 서명·직인 칸과 원본에서 손으로 쓰는 칸(안전체크 표시, 주민등록번호 등)은 비워 둔다.
 * 주민등록번호는 앱이 받지도 저장하지도 않는다 — 출력 후 직접 적는다.
 */
import { localDateKey } from '../../../utils/date';
import { calculatePayments, formatWon } from '../calc';
import { addDaysKey, weekdayOf } from '../holidays';
import { EVALUATION_GROUPS, evaluationTotals, normalizeCase, type SupportedEmploymentCase } from '../model';
import { timeRangeHours } from '../schedule';
import type { Cell, DocBlock, DocModel } from '../../docx/blocks';

export type SupportedEmploymentDocumentKind =
    | 'resultReport'
    | 'paymentStatement'
    | 'trainingLog'
    | 'evaluationRecord'
    | 'coachTimesheet'
    | 'safetyChecklist'
    | 'otherIncomeStatement';

/** 묶음 출력 순서(원본 서류모음 순서)와 파일명 표기 */
export const SUPPORTED_EMPLOYMENT_DOCUMENTS: ReadonlyArray<{ kind: SupportedEmploymentDocumentKind; label: string; fileLabel: string }> = [
    { kind: 'resultReport', label: '결과보고', fileLabel: '결과보고' },
    { kind: 'paymentStatement', label: '지원고용 수당 지급명세서', fileLabel: '수당지급명세서' },
    { kind: 'trainingLog', label: '지원고용 훈련일지', fileLabel: '훈련일지' },
    { kind: 'evaluationRecord', label: '훈련생 종합 평가기록부', fileLabel: '종합평가기록부' },
    { kind: 'coachTimesheet', label: '직무지도원 출근부', fileLabel: '직무지도원출근부' },
    { kind: 'safetyChecklist', label: '현장훈련 안전체크리스트', fileLabel: '안전체크리스트' },
    { kind: 'otherIncomeStatement', label: '기타소득 지급내역서(직무지도원)', fileLabel: '기타소득지급내역서' },
];

export interface DocumentOptions {
    /** 기관명(외부 직무지도원의 소속기관 등) */
    organizationName?: string;
    /** (공단/위탁기관) 담당자 이름 — 설정의 담당자 프로필 */
    staffName?: string;
    /** 공단 지사명(출근부 제목, 예: "서울동부지사") */
    branchName?: string;
    /** 사업체(업체) 담당자 이름 — 훈련일지·출근부 확인란 */
    employerContactName?: string;
    /** 서류 작성일(YYYY-MM-DD). 기본: 훈련 종료일, 없으면 오늘 */
    documentDate?: string;
    /** calc.ts 참고 */
    coachDaysBasis?: 'scheduled' | 'attended';
}

// ─── 표기 도우미 ───

function dateParts(date: string): [string, string, string] | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    return match ? [match[1], match[2], match[3]] : null;
}

/** '2026-08-19' → '2026. 8. 19.' */
export function formatDateDot(date: string): string {
    const parts = dateParts(date);
    return parts ? `${parts[0]}. ${Number(parts[1])}. ${Number(parts[2])}.` : '';
}

/** '2026-05-28' → '2026.05.28.' */
function formatDatePadded(date: string): string {
    const parts = dateParts(date);
    return parts ? `${parts[0]}.${parts[1]}.${parts[2]}.` : '';
}

/** '2026-05-28' → '2026.5.28' */
function formatDateCompact(date: string): string {
    const parts = dateParts(date);
    return parts ? `${parts[0]}.${Number(parts[1])}.${Number(parts[2])}` : '';
}

/** '2026-05-28' → '2026. 05. 28.' */
function formatDateSpaced(date: string): string {
    const parts = dateParts(date);
    return parts ? `${parts[0]}. ${parts[1]}. ${parts[2]}.` : '';
}

/** '2026-07-06' → '26.07.06.' */
function formatDateShortYear(date: string): string {
    const parts = dateParts(date);
    return parts ? `${parts[0].slice(2)}.${parts[1]}.${parts[2]}.` : '';
}

/** '2026-05-28' → '5/28' */
function formatMonthDay(date: string): string {
    const parts = dateParts(date);
    return parts ? `${Number(parts[1])}/${Number(parts[2])}` : '';
}

/** '2026-08-19' → '2026년 8월 19일' */
export function formatDateKorean(date: string): string {
    const parts = dateParts(date);
    return parts ? `${parts[0]}년 ${Number(parts[1])}월 ${Number(parts[2])}일` : '        년      월      일';
}

/** '2026-06-18' → '2026 년   6월   18일'(원본 확인란 표기) */
function formatDateSpacedKorean(date: string): string {
    const parts = dateParts(date);
    return parts ? `${parts[0]} 년   ${Number(parts[1])}월   ${Number(parts[2])}일` : '        년      월      일';
}

const hoursText = (hours: number) => `${Math.round(hours * 100) / 100}`;

function documentDate(c: SupportedEmploymentCase, options: DocumentOptions): string {
    return options.documentDate || c.period.end || localDateKey();
}

const center = (text: string, extra: Partial<Exclude<Cell, string>> = {}): Cell => ({ text, align: 'center', ...extra });
const left = (text: string, extra: Partial<Exclude<Cell, string>> = {}): Cell => ({ text, align: 'left', ...extra });
const right = (text: string, extra: Partial<Exclude<Cell, string>> = {}): Cell => ({ text, align: 'right', ...extra });

/** 세로쓰기 칸(원본의 "사전훈련", "근무태도" 등): 한 글자씩 줄을 바꾼다 */
const vertical = (text: string) => [...text.replace(/\s+/g, '')].join('\n');

/** 가운데 정렬 쪽 여백: 원본 표 폭을 그대로 두고 좌우를 같게 */
function centeredPage(tableWidthMm: number, top = 15, bottom = 15) {
    // 내림: 여백을 올림하면 본문 폭이 원본 표보다 좁아져 표가 넘친다.
    const side = Math.max(10, Math.floor(((210 - tableWidthMm) / 2) * 10) / 10);
    return { marginMm: { top, bottom, left: side, right: side } };
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/** 선 없는 서명 표: [빈칸][역할:][이름][(서명 또는 인)] — 원본처럼 오른쪽에 모아 둔다 */
function signatureTable(widthMm: number, lines: Array<[string, string]>, fontSize = 11, rowHeightMm = 8): DocBlock {
    const tail = 34;
    const name = 30;
    const label = 52;
    const lead = Math.max(0, widthMm - tail - name - label);
    return {
        type: 'table',
        widths: [lead, label, name, tail],
        widthsMm: [lead, label, name, tail],
        borders: 'none',
        fontSize,
        rowHeightsMm: lines.map(() => rowHeightMm),
        paddingMm: { x: 1, y: 0.2 },
        rows: lines.map(([role, person]) => [
            { text: '' },
            right(`${role}:`),
            center(person || ''),
            left('(서명 또는 인)'),
        ]),
    };
}

// ─── ① 결과보고 ───

/** 원본 표 폭(mm). 세 표 모두 약 160mm */
const REPORT_WIDTH = 160;
const REPORT_OVERVIEW_MM = [28.7, 25.0, 32.8, 24.8, 25.5, 23.2];
const REPORT_RESULT_MM = [16.5, 15.5, 12.3, 12.5, 13.4, 17.1, 18.0, 17.5, 17.5, 19.7];
const REPORT_PAYMENT_MM = [53.4, 53.3, 53.3];

export function resultReportModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    const payments = calculatePayments(c, options);
    const a = payments.attendance;
    const byKey = Object.fromEntries(payments.items.map(item => [item.key, item]));
    const trainedPre = a.preDays - a.absentPreDays;
    const trainedField = a.fieldDays - a.absentFieldDays;
    const coachPre = options.coachDaysBasis === 'attended' ? trainedPre : a.preDays;
    const coachField = options.coachDaysBasis === 'attended' ? trainedField : a.fieldDays;
    const periodCell = c.period.start || c.period.end ? `${formatDatePadded(c.period.start)}\n~\n${formatDatePadded(c.period.end)}` : '';
    const endParts = dateParts(c.period.end);
    const actualEnd = endParts ? `${endParts[0]}.\n${endParts[1]}.${endParts[2]}.` : '';
    const won = (value: number) => `${formatWon(value)}원`;

    return {
        title: '지원고용 결과보고',
        font: 'serif',
        page: centeredPage(REPORT_WIDTH),
        blocks: [
            {
                type: 'title',
                text: `${c.round || ''}차 지원고용 결과보고`,
                runs: [{ text: `_${c.round ? c.round : '  '}_`, underline: 'single' }, { text: '차 지원고용 결과보고' }],
                size: 18,
                font: 'headline',
                spaceBeforeMm: 20,
                spaceAfterMm: 8,
            },
            { type: 'paragraph', text: '1. 훈련개요', bold: true, size: 12, spaceAfterMm: 2 },
            {
                type: 'table',
                widths: REPORT_OVERVIEW_MM,
                widthsMm: REPORT_OVERVIEW_MM,
                fontSize: 11,
                outerBorderPt: 1,
                rowHeightsMm: [10.3, 17.5],
                rows: [
                    ['사업체명', '훈련직무', '훈련기간', '계획인원', '수료인원', '취업인원'].map(text => center(text)),
                    [
                        center(c.employerName),
                        center(c.jobTitle),
                        center(periodCell),
                        center(`${c.plannedCount}명`),
                        center(`${c.result.completed ? 1 : 0}명`),
                        center(`${c.result.employed ? 1 : 0}명`),
                    ],
                ],
            },
            { type: 'paragraph', text: '2. 훈련결과', bold: true, size: 12, spaceBeforeMm: 10, spaceAfterMm: 2 },
            {
                type: 'table',
                widths: REPORT_RESULT_MM,
                widthsMm: REPORT_RESULT_MM,
                fontSize: 11,
                outerBorderPt: 1,
                rowHeightsMm: [16.7, 16.7, 16.7],
                paddingMm: { x: 0.6, y: 0.5 },
                rows: [
                    [
                        center('훈련생', { rowSpan: 2 }),
                        center('훈련일수', { colSpan: 4 }),
                        center('수당지급내역', { colSpan: 2 }),
                        center('훈련\n결과', { rowSpan: 2 }),
                        center('취업\n여부', { rowSpan: 2 }),
                        center('취업일자\n(예정일)', { rowSpan: 2 }),
                    ],
                    [center('실제\n종료일'), center('사전\n훈련'), center('현장\n훈련'), center('계'), center('훈련\n수당'), center('사업주\n보조금')],
                    [
                        center(c.seekerName),
                        center(actualEnd, { bold: true, size: 10 }),
                        center(`${trainedPre}일`),
                        center(`${trainedField}일`),
                        center(`${trainedPre + trainedField}일`),
                        center(won(byKey.trainingAllowance.amount), { size: 10 }),
                        center(won(byKey.employerSubsidy.amount), { size: 10 }),
                        center(c.result.completed ? '수료' : '미수료'),
                        center(c.result.employed ? '취업' : '미취업'),
                        center(c.result.employed && c.result.employmentDate ? formatDateShortYear(c.result.employmentDate) : '-', { bold: true, size: 10 }),
                    ],
                ],
            },
            { type: 'paragraph', text: '3. 수당지급내역', bold: true, size: 12, spaceBeforeMm: 9, spaceAfterMm: 2 },
            {
                type: 'table',
                widths: REPORT_PAYMENT_MM,
                widthsMm: REPORT_PAYMENT_MM,
                fontSize: 11,
                outerBorderPt: 1,
                rowHeightsMm: [13.1, 13.3, 13.3, 13.3, 13.5],
                rows: [
                    [center('구      분'), center('총 지급액(세전)'), center('비고')],
                    [center('계'), center(won(payments.total)), center('-')],
                    [center('훈련수당'), center(won(byKey.trainingAllowance.amount)), center(`사전훈련: ${a.paidPreDays}일\n현장훈련: ${a.paidFieldDays}일`)],
                    [center('사업주보조금'), center(won(byKey.employerSubsidy.amount)), center(`현장훈련: ${a.paidFieldDays}일`)],
                    [center('직무지도원'), center(won(byKey.coachAllowance.amount)), center(`사전훈련: ${coachPre}일\n현장훈련: ${coachField}일`)],
                ],
            },
            { type: 'paragraph', text: '※ 지원고용수당 지급명세서 첨부', size: 10, font: 'gothic', indentMm: 3, spaceBeforeMm: 1.5 },
        ],
    };
}

// ─── ② [붙임 28] 지원고용 수당 지급명세서 ───

/** 원본 열: 구분 | 성명(사업장명) | 연락처 | 지급명세 | 금액 | 수령인(송금계좌번호) */
const PAYMENT_MM = [15.8, 20.2, 30.7, 38.2, 18.1, 29.2];

export function paymentStatementModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    const payments = calculatePayments(c, options);
    const byKey = Object.fromEntries(payments.items.map(item => [item.key, item]));
    const payee = (p: { bank: string; account: string }) => [p.bank, p.account].filter(Boolean).join('\n');
    const formula = (unit: number, days: number) => `${formatWon(unit)}원 * ${days}일`;
    const training = byKey.trainingAllowance;
    const employer = byKey.employerSubsidy;
    const coach = byKey.coachAllowance;
    return {
        title: '지원고용 수당 지급명세서',
        font: 'gothic',
        page: centeredPage(sum(PAYMENT_MM)),
        blocks: [
            { type: 'paragraph', text: '[붙임 28] 지원고용 수당 지급명세서', size: 8, spaceBeforeMm: 20 },
            { type: 'title', text: '지원고용 수당 지급명세서', size: 18, font: 'headline', spaceBeforeMm: 15, spaceAfterMm: 9 },
            { type: 'paragraph', text: '(단위 : 원)', align: 'right', size: 10, spaceAfterMm: 9 },
            {
                type: 'table',
                widths: PAYMENT_MM,
                widthsMm: PAYMENT_MM,
                fontSize: 10.5,
                rowHeightsMm: [19.0, 48.5, 26.7, 26.8, 20.6],
                paddingMm: { x: 0.4, y: 0.6 },
                rows: [
                    [center('구분'), center('성    명\n(사업장명)'), center('연락처'), center('지급명세'), center('금  액'), center('수령인\n(송금계좌번호)')],
                    [
                        center('훈련\n수당'),
                        center(c.seekerName),
                        center(c.traineePayee.phone),
                        center(`사전+현장훈련\n${formula(training.unit, training.days)}`),
                        center(formatWon(training.amount), { size: 10 }),
                        center(payee(c.traineePayee)),
                    ],
                    [
                        center('사업주\n보조금'),
                        center(c.employerName),
                        center(c.employerPayee.phone),
                        center(formula(employer.unit, employer.days)),
                        center(formatWon(employer.amount), { size: 10 }),
                        center(payee(c.employerPayee)),
                    ],
                    [
                        center('직무지도\n원 수당'),
                        center(c.coach.name),
                        center(c.coach.phone),
                        center(`사전+현장훈련\n${formula(coach.unit, coach.days)}`),
                        center(formatWon(coach.amount), { size: 10 }),
                        center(payee(c.coach)),
                    ],
                    [center('계', { colSpan: 4 }), center(formatWon(payments.total), { size: 10 }), center('-')],
                ],
            },
        ],
    };
}

// ─── ③ 지원고용 훈련일지 ───

const LOG_HEADER_MM = [16.9, 45.2, 26.7, 25.3, 22.1, 25.5];
const LOG_TABLE_MM = [6.7, 10.3, 16.5, 22.9, 18.2, 25.3, 14.8, 47.0];

/** 주휴수당 표기: 비었거나 "해당없음"이면 N */
function weeklyAllowanceFlag(value: string): string {
    const text = (value || '').trim();
    return !text || text === '해당없음' || text === 'N' ? 'N' : text;
}

/** 훈련일지 한 행의 최소 높이(mm) — 원본 가장 낮은 행 */
const LOG_MIN_ROW_MM = 18;
/** 쪽에 들어갈 행 높이 합(mm). 첫 쪽은 제목·머리표가 있어 작다. 넘치지 않게 조금 여유를 둔다. */
const LOG_FIRST_PAGE_MM = 196;
const LOG_NEXT_PAGE_MM = 240;

/** 10pt 기준 글자 폭 어림(mm): 한글·한자·전각은 1em, 그 밖은 약 0.55em */
function textWidthMm(text: string, pt: number): number {
    const em = pt * 0.3528;
    let width = 0;
    for (const ch of text) width += /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3\u4E00-\u9FFF\u3000-\u303F\uFF00-\uFFEF]/.test(ch) ? em : em * 0.55;
    return width;
}

function lineCount(text: string, columnMm: number, pt: number): number {
    const usable = Math.max(1, columnMm - 1.8);
    // 낱말 단위 줄바꿈(keep-all) 때문에 실제로는 조금 더 줄이 늘어난다(×1.15).
    return String(text || '').split('\n').reduce((total, line) => total + Math.max(1, Math.ceil((textWidthMm(line, pt) * 1.15) / usable)), 0);
}

function estimateLogRowMm(log: SupportedEmploymentCase['dailyLogs'][number]): number {
    const pt = 10;
    const lineMm = pt * 0.3528 * 1.35;
    const lines = Math.max(
        lineCount(log.task, LOG_TABLE_MM[5], pt),
        lineCount(log.note, LOG_TABLE_MM[7], pt),
        lineCount(log.performanceHours, LOG_TABLE_MM[6], pt),
        1,
    );
    return Math.max(LOG_MIN_ROW_MM, lines * lineMm + 1.6);
}

/** 행 높이를 어림해 쪽 단위로 나눈다. 마지막 쪽에 확인란이 들어가지 않으면 확인란만 다음 쪽으로 넘어간다. */
function paginateLogs(logs: SupportedEmploymentCase['dailyLogs']): Array<SupportedEmploymentCase['dailyLogs']> {
    const pages: Array<SupportedEmploymentCase['dailyLogs']> = [];
    let current: SupportedEmploymentCase['dailyLogs'] = [];
    let used = 0;
    for (const log of logs) {
        const height = estimateLogRowMm(log);
        const capacity = pages.length === 0 ? LOG_FIRST_PAGE_MM : LOG_NEXT_PAGE_MM;
        if (current.length && used + height > capacity) {
            pages.push(current);
            current = [];
            used = 0;
        }
        current.push(log);
        used += height;
    }
    if (current.length) pages.push(current);
    return pages;
}

export function trainingLogModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    const payments = calculatePayments(c, options);
    const typical = c.dailyLogs.find(log => log.attendance !== '결석' && log.start && log.end);
    const dailyHours = typical ? timeRangeHours(typical.start, typical.end) : 0;
    const period = c.period.start || c.period.end ? `${formatDateCompact(c.period.start)}.~${formatDateCompact(c.period.end)}` : '';

    // 표는 쪽마다 나눈다. 원본(한글 서식)처럼 쪽이 바뀌면 머리 행과 "구분" 칸을 다시 그린다 —
    // 여러 행을 합친 칸은 인쇄할 때 쪽을 넘지 못해, 한 표로 두면 현장훈련 전체가 다음 쪽으로 밀린다.
    const pages = paginateLogs(c.dailyLogs);
    const logTables: DocBlock[] = [];
    pages.forEach((logs, pageIndex) => {
        if (pageIndex > 0) logTables.push({ type: 'pageBreak' });
        const rows: Cell[][] = logs.map((log, index) => {
            const absent = log.attendance === '결석';
            const row: Cell[] = [];
            // 구분 칸: 이 쪽 안에서 같은 단계(사전/현장)가 이어지는 행을 하나로 합친다(세로쓰기)
            if (index === 0 || logs[index - 1].phase !== log.phase) {
                let span = 1;
                while (index + span < logs.length && logs[index + span].phase === log.phase) span += 1;
                row.push(center(vertical(`${log.phase}훈련`), { rowSpan: span }));
            }
            row.push(
                center(formatMonthDay(log.date)),
                center(log.attendance),
                center(absent ? '-' : log.start || log.end ? `${log.start}~${log.end}` : ''),
                center(absent ? '-' : log.commuteGuidance ? 'O' : 'X'),
                left(log.task),
                center(log.performanceHours),
                left(log.note),
            );
            return row;
        });
        logTables.push({
            type: 'table',
            widths: LOG_TABLE_MM,
            widthsMm: LOG_TABLE_MM,
            headerRows: 1,
            fontSize: 10,
            outerBorderPt: 1,
            rowHeightsMm: [16.8, ...rows.map(() => LOG_MIN_ROW_MM)],
            paddingMm: { x: 0.8, y: 0.6 },
            rows: [
                [
                    center('구\n분', { size: 9 }),
                    center('훈련\n일자', { size: 9 }),
                    center('출석/결석/\n지각/조퇴', { size: 8.5 }),
                    center('훈련시간', { size: 9 }),
                    center('출퇴근\n지도 및\n휴게시간\n지도 여부', { size: 9 }),
                    center('수행과제', { size: 9 }),
                    center('수행정도\n(측정시\n간)', { size: 9 }),
                    center('평가 및 지도사항', { size: 9 }),
                ],
                ...rows,
            ],
        });
    });
    if (!pages.length) {
        logTables.push({
            type: 'table',
            widths: LOG_TABLE_MM,
            widthsMm: LOG_TABLE_MM,
            fontSize: 9,
            outerBorderPt: 1,
            rowHeightsMm: [16.8],
            rows: [['구\n분', '훈련\n일자', '출석/결석/\n지각/조퇴', '훈련시간', '출퇴근\n지도 및\n휴게시간\n지도 여부', '수행과제', '수행정도\n(측정시\n간)', '평가 및 지도사항'].map(text => center(text))],
        });
    }

    const date = documentDate(c, options);
    return {
        title: '지원고용 훈련일지',
        font: 'gothic',
        page: centeredPage(sum(LOG_TABLE_MM), 13, 15),
        blocks: [
            { type: 'title', text: '지원고용 훈련일지', size: 15, bold: false, spaceAfterMm: 3 },
            {
                type: 'table',
                widths: LOG_HEADER_MM,
                widthsMm: LOG_HEADER_MM,
                fontSize: 10,
                outerBorderPt: 1,
                rowHeightsMm: [9.7, 9.7, 9.7],
                rows: [
                    [center('훈련생명'), center(c.seekerName), center('직무지도원\n성명'), center(c.coach.name), center('직무지도\n시간'), center(dailyHours ? `${hoursText(dailyHours)}h` : '')],
                    [center('사업체명'), center(c.employerName), center('직무지도원\n구분'), center(c.coach.type), center('직무지도\n일수'), center(`${payments.coach.days}일`)],
                    [center('훈련기간'), center(period), center('1:多 지도여부'), center(c.oneToManyGuidance ? 'Y' : 'N'), center('주휴수당 등'), center(weeklyAllowanceFlag(c.weeklyHolidayAllowance))],
                ],
            },
            { type: 'spacer', heightMm: 4.9 },
            ...logTables,
            { type: 'paragraph', text: '위와 같이 실시하였음을 확인함', align: 'center', size: 11, spaceBeforeMm: 8 },
            { type: 'paragraph', text: formatDateSpacedKorean(date), align: 'center', size: 11, spaceBeforeMm: 5, spaceAfterMm: 4 },
            signatureTable(sum(LOG_TABLE_MM), [
                ['(공단/위탁기관) 담당자', options.staffName || ''],
                ['업체담당자', options.employerContactName || ''],
                ['직무지도원', c.coach.name],
            ]),
        ],
    };
}

// ─── ④ 지원고용 훈련생 종합 평가기록부 ───

/** 열 경계: 영역 | (비고칸 경계) | 항목(훈련생명 칸 끝) | 항목 | 사전 | 현장 | 훈련기간 라벨 | 평가소견 */
const EVALUATION_MM = [9.5, 7.7, 18.7, 47.4, 11.0, 11.7, 10.4, 43.4];

function phaseRange(c: SupportedEmploymentCase, phase: '사전' | '현장'): string {
    const dates = c.dailyLogs.filter(log => log.phase === phase).map(log => log.date).sort();
    if (!dates.length) return '';
    const first = dates[0];
    const last = dates[dates.length - 1];
    return first === last ? formatDateCompact(first) : `${formatDateCompact(first)}.~${formatDateCompact(last)}`;
}

export function evaluationRecordModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    const totals = evaluationTotals(c.evaluation);
    const score = (value: number | null) => center(value === null ? '' : String(value));
    const rows: Cell[][] = [
        [center('훈련생명', { colSpan: 3 }), center('사업체명', { colSpan: 3 }), center('훈련기간', { colSpan: 2 })],
        [center(c.seekerName, { colSpan: 3, rowSpan: 2 }), center(c.employerName, { colSpan: 3, rowSpan: 2 }), center('사전'), center(phaseRange(c, '사전'))],
        [center('현장'), center(phaseRange(c, '현장'))],
        [center('구      분', { colSpan: 4 }), center('사전'), center('현장'), center('평 가 소 견', { colSpan: 2 })],
    ];
    let index = 0;
    for (const group of EVALUATION_GROUPS) {
        group.items.forEach((item, itemIndex) => {
            const row: Cell[] = [];
            if (itemIndex === 0) row.push(center(vertical(group.label), { rowSpan: group.items.length }));
            row.push(left(item, { colSpan: 3 }), score(c.evaluation.pre[index]), score(c.evaluation.field[index]));
            if (itemIndex === 0) row.push(left(c.evaluation.opinions[group.key], { colSpan: 2, rowSpan: group.items.length }));
            rows.push(row);
            index += 1;
        });
    }
    rows.push([center('총 점(만점 100점)', { colSpan: 4 }), center(String(totals.pre)), center(String(totals.field)), center('', { colSpan: 2 })]);
    rows.push([center('비고', { colSpan: 2 }), left('※ 항목별 점수채점 : 우수 5점, 양호 4점, 보통 3점, 미흡 2점, 불량 1점', { colSpan: 6 })]);
    const heights = [4.9, 4.9, 4.9, 5.7, ...Array.from({ length: 20 }, () => 8.2), 10.4, 6.2];
    return {
        title: '지원고용 훈련생 종합 평가기록부',
        font: 'gothic',
        page: centeredPage(sum(EVALUATION_MM)),
        blocks: [
            { type: 'title', text: '지원고용 훈련생 종합 평가기록부', size: 17, font: 'headline', spaceBeforeMm: 3, spaceAfterMm: 12 },
            {
                type: 'table',
                widths: EVALUATION_MM,
                widthsMm: EVALUATION_MM,
                fontSize: 9.5,
                outerBorderPt: 1,
                rowHeightsMm: heights,
                paddingMm: { x: 1, y: 0.3 },
                rows,
            },
            { type: 'spacer', heightMm: 4 },
            signatureTable(sum(EVALUATION_MM), [
                ['직무지도원', c.coach.name],
                ['(위탁기관) 담당자', options.staffName || ''],
            ]),
        ],
    };
}

// ─── ⑤ [붙임 19] 직무지도원 출근부 ───

const TIMESHEET_HEADER_MM = [34.8, 47.8, 30.0, 46.1];
const TIMESHEET_GRID_MM = [18.3, 20.3, 20.0, 20.1, 20.0, 19.9, 20.0, 20.1];

/** 기간이 걸친 주(월~일)를 모두 만든다. 기간 밖 날짜는 null(원본의 "/") */
function periodWeeks(start: string, end: string): Array<Array<string | null>> {
    if (!dateParts(start) || !dateParts(end) || start > end) return [];
    const weeks: Array<Array<string | null>> = [];
    let monday = addDaysKey(start, -((weekdayOf(start) + 6) % 7));
    while (monday <= end && weeks.length < 60) {
        weeks.push(Array.from({ length: 7 }, (_, offset) => {
            const date = addDaysKey(monday, offset);
            return date >= start && date <= end ? date : null;
        }));
        monday = addDaysKey(monday, 7);
    }
    return weeks;
}

export function coachTimesheetModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    // 출근부 입력이 없으면 훈련일지 시간으로 채운다.
    const entries = c.coachTimesheet.length
        ? c.coachTimesheet
        : c.dailyLogs.map(log => ({ date: log.date, start: log.start, end: log.end, hours: timeRangeHours(log.start, log.end), oneToMany: c.oneToManyGuidance, overtime: 0 }));
    const byDate = new Map(entries.map(entry => [entry.date, entry]));
    const general = sum(entries.filter(entry => !entry.oneToMany).map(entry => entry.hours));
    const oneToMany = sum(entries.filter(entry => entry.oneToMany).map(entry => entry.hours));
    const overtimeGeneral = sum(entries.filter(entry => !entry.oneToMany).map(entry => entry.overtime));
    const overtimeMany = sum(entries.filter(entry => entry.oneToMany).map(entry => entry.overtime));
    const allowance = weeklyAllowanceFlag(c.weeklyHolidayAllowance) === 'N'
        ? '주휴,   0회   월차   0회\n총                     원'
        : '주휴,      회   월차      회\n총                     원';
    const period = c.period.start || c.period.end ? `${formatDateSpaced(c.period.start)}\n~ ${formatDateSpaced(c.period.end)}` : '';

    const grid: Cell[][] = [[center('구분'), ...['월', '화', '수', '목', '금', '토', '일'].map(day => center(day))]];
    const heights: number[] = [4.8];
    for (const week of periodWeeks(c.period.start, c.period.end)) {
        grid.push([center('일자'), ...week.map(date => center(date ? formatMonthDay(date) : '/'))]);
        grid.push([
            center('총\n지도시간'),
            ...week.map(date => {
                const entry = date ? byDate.get(date) : undefined;
                return entry && (entry.start || entry.end)
                    ? center(`${entry.start} ~\n${entry.end}\n${hoursText(entry.hours + entry.overtime)}(h)`)
                    : center('~\n\n(h)');
            }),
        ]);
        grid.push([
            center('1:多 지도'),
            ...week.map(date => {
                const entry = date ? byDate.get(date) : undefined;
                return center(entry?.oneToMany ? `${hoursText(entry.hours)}(h)` : '(h)');
            }),
        ]);
        heights.push(4.8, 17.4, 4.8);
    }

    const date = documentDate(c, options);
    const branch = (options.branchName || '').trim();
    return {
        title: '직무지도원 출근부',
        font: 'gothic',
        page: centeredPage(sum(TIMESHEET_GRID_MM)),
        blocks: [
            { type: 'paragraph', text: '[붙임 19] 직무지도원 출근부', size: 8, spaceBeforeMm: 19 },
            { type: 'title', text: `${branch ? `${branch} ` : ''}직무지도원 출근부`, size: 18, font: 'headline', spaceBeforeMm: 6, spaceAfterMm: 4 },
            {
                type: 'table',
                widths: TIMESHEET_HEADER_MM,
                widthsMm: TIMESHEET_HEADER_MM,
                fontSize: 9.5,
                outerBorderPt: 1,
                rowHeightsMm: [5.9, 11.6, 11.5, 11.4, 11.3],
                paddingMm: { x: 1, y: 0.4 },
                rows: [
                    [center('성      명'), center(c.coach.name), center('연락처'), center(c.coach.phone)],
                    [center('배치사업체명'), left(c.employerName), center('지도기간'), center(period)],
                    [center('지도일수 및 시간\n(주휴미포함)'), left(`총 ${entries.length}일,   총 ${hoursText(general + oneToMany)}h`), center('주휴수당 등'), left(allowance)],
                    [center('일반 지도시간\n(1:1 지도시간)'), center(`총 ${hoursText(general)}h`), center('1:多 지도시간\n(2인 이상)'), left(`총                   ${hoursText(oneToMany)}h`)],
                    [center('연장 지도시간\n(1:1 지도시간)'), center(`총 ${hoursText(overtimeGeneral)}h`), center('연장 1:多 지도 시간\n(2인 이상)', { size: 8.5 }), left(`총                   ${hoursText(overtimeMany)}h`)],
                ],
            },
            { type: 'paragraph', text: '※ 주휴수당은 위탁기관 담당자가 작성', size: 10, spaceBeforeMm: 0.5 },
            { type: 'paragraph', text: '■ 근무상황표', size: 11, spaceBeforeMm: 3, spaceAfterMm: 1 },
            {
                type: 'table',
                widths: TIMESHEET_GRID_MM,
                widthsMm: TIMESHEET_GRID_MM,
                fontSize: 9.5,
                outerBorderPt: 1,
                rowHeightsMm: heights,
                paddingMm: { x: 0.6, y: 0.2 },
                rows: grid,
            },
            { type: 'paragraph', text: '위와 같이 근무(출근) 하였음을 확인함', align: 'center', size: 10.5, spaceBeforeMm: 1.5 },
            { type: 'paragraph', text: formatDateKorean(date).replace(/년 /, '년      ').replace(/월 /, '월      '), align: 'center', size: 10.5 },
            signatureTable(sum(TIMESHEET_GRID_MM), [
                ['공단/위탁기관 담당자', options.staffName || ''],
                ['사업체담당자', options.employerContactName || ''],
                ['직무지도원', c.coach.name],
            ], 10.5, 6),
        ],
    };
}

// ─── ⑥ [붙임 41] 지원고용 현장훈련 안전체크리스트 ───

/** 원본 문구 그대로(공통항목 + 직무별). 체크(✓)는 현장에서 점검 담당자가 직접 한다. */
export const SAFETY_CHECKLIST: ReadonlyArray<{ label: string; items: readonly string[] }> = [
    {
        label: '공통\n항목',
        items: [
            '출입구 및 작업장 주변 정리정돈이 잘 되어 있는가?',
            '비상구 및 대피로 확보가 되어 있는가?',
            '개인보호구(장갑, 안전화, 안전모 등) 착용상태는 양호한가?',
            '작업장 내 미끄럼, 낙하 위험요소 점검상태는 양호한가?',
            '응급상황시 대처방안 및 비상연락망은 구비되어 있는가?',
            '근무 중 휴식 및 장소는 적절한가?',
            '화재예방 및 소화기 비치 상태는 양호한가?',
            '작업 전후, 휴식 시 스트레칭을 하는가?',
        ],
    },
    {
        label: '사무\n보조\n직무',
        items: [
            '전기 배선 및 콘센트 상태는 양호한가?',
            '의자는 높낮이 조절기능이 있고 등받이와 팔걸이가 있는가?',
            '모니터는 높이 및 각도 조절이 가능한가?',
            '눈으로부터 화면까지의 거리는 40CM이상을 유지하는가?',
        ],
    },
    {
        label: '조리\n·\n음식\n서비스\n직무',
        items: [
            '위생복은 올바른 방법으로 착용하였는가?',
            '식품 위생관리 준수 여부(손씻기, 위생모 등)',
            '조리실 바닥에 물기, 기름기, 물품 등의 방치로 넘어짐 위험은 없는가?',
            '주방의 물이나 기름을 수시로 제거하고 청결상태를 유지하는가?',
            '열/화상 예방 조치(장갑, 보호구 착용 등)',
            '음식물 운반 또는 서빙 중 엎지르지 않도록 이동대차, 정리정돈을 실시하고 있는가?',
            '작업장 환기 및 청결 상태 확인',
        ],
    },
    {
        label: '운반\n포장\n직무',
        items: [
            '작업대 및 작업환경의 정리정돈 상태는?',
            '공구 및 도구 사용 안전점검 상태는?',
            '제품 이동경로에 방해물(정리정돈)은 없는가?',
            '운반물을 이동 중 작업자의 시야는 양호한가?',
            '기계장비 작동 전 점검 및 비상정지장치는 양호한가?',
        ],
    },
    {
        label: '단순\n생산\n직무',
        items: [
            '작업장 및 생산라인 청결 유지 상태는?',
            '유해인자(분진, 소음, 열기) 관리상태 점검은?',
            '작업절차 및 안전지침 숙지상태는?',
            '기계 주변 보호장치 및 경고표지 부착 여부?',
            '주변 위험물(유해물질, 날카로운 물체 등) 보관 및 관리상태는?',
        ],
    },
    {
        label: '환경\n미화\n직무',
        items: [
            '청소장비 및 세척제 사용법 숙지상태는?',
            '작업장 및 통로 정리정돈 상태는?',
            '미끄럼 사고 위험지역(습기, 오염물질 등) 점검 상태는?',
            '폐기물 처리 및 분리 배출 관리상태는?',
        ],
    },
];

const SAFETY_HEADER_MM = [39.6, 39.4, 39.4, 40.1];
const SAFETY_TABLE_MM = [13.5, 109.7, 35.0];

export function safetyChecklistModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    const period = c.period.start || c.period.end ? `${formatDateShortYear(c.period.start).replace(/\.$/, '')} ~ ${formatDateShortYear(c.period.end).replace(/\.$/, '')}` : '';
    const rows: Cell[][] = [[center('구분'), center('내      용'), center('여부')]];
    for (const group of SAFETY_CHECKLIST) {
        group.items.forEach((item, index) => {
            const row: Cell[] = [];
            if (index === 0) row.push(center(`□\n${group.label}`, { rowSpan: group.items.length }));
            // 원본은 긴 문장을 좁혀 한 줄에 넣는다. 같은 효과를 위해 긴 문장만 글자를 줄인다.
            row.push(left(item, item.length > 38 ? { size: 8 } : {}), center('□양호   □개선필요'));
            rows.push(row);
        });
    }
    return {
        title: '지원고용 현장훈련 안전체크리스트',
        font: 'serif',
        page: centeredPage(sum(SAFETY_HEADER_MM)),
        blocks: [
            { type: 'paragraph', text: '[붙임 41] 지원고용 현장훈련 안전체크리스트', size: 8, font: 'gothic', spaceBeforeMm: 20 },
            { type: 'title', text: '지원고용 현장훈련 안전체크리스트', size: 20, bold: false, font: 'serif', spaceBeforeMm: 1, spaceAfterMm: 3 },
            {
                type: 'table',
                widths: SAFETY_HEADER_MM,
                widthsMm: SAFETY_HEADER_MM,
                fontSize: 11,
                outerBorderPt: 1.5,
                rowHeightsMm: [9.6, 5.9],
                rows: [
                    [center('점검 담당자'), center(options.staffName || ''), center('점검일'), center(c.period.start ? formatDateShortYear(c.period.start).replace(/\.$/, '') : '')],
                    [center('업체명'), center(c.employerName), center('지원고용 훈련기간'), center(period)],
                ],
            },
            {
                type: 'paragraph',
                text: '※ 현장훈련에 참여하는 장애인이 안전하게 훈련할 수 있도록 위험요인을 사전에 점검하고 사고를 예방하며, 작업환경을 안전하게 유지하기 위하여 체크리스트를 작성하고 있습니다.',
                size: 10.5,
                spaceBeforeMm: 1,
            },
            {
                type: 'paragraph',
                text: '공통항목과 해당 사업장에서 훈련하는 직무에 체크하여 주시기 바랍니다.(해당직무가 없으면 공통항목만 표기)',
                runs: [
                    { text: ' ' },
                    { text: '공통항목', bold: true, underline: 'single' },
                    { text: '과 해당 사업장에서 훈련하는 직무에 체크하여 주시기 바랍니다.', underline: 'single' },
                    { text: '(해당직무가 없으면 공통항목만 표기)' },
                ],
                size: 10.5,
                spaceAfterMm: 4,
            },
            {
                type: 'table',
                widths: SAFETY_TABLE_MM,
                widthsMm: SAFETY_TABLE_MM,
                headerRows: 1,
                fontSize: 9,
                outerBorderPt: 1,
                rowHeightsMm: rows.map(() => 4.4),
                paddingMm: { x: 1, y: 0 },
                lineSpacing: 1.1,
                rows,
            },
            { type: 'spacer', heightMm: 2.5 },
            {
                type: 'table',
                widths: [sum(SAFETY_TABLE_MM)],
                widthsMm: [sum(SAFETY_TABLE_MM)],
                fontSize: 10,
                rowHeightsMm: [18.8],
                rows: [[left('□ 개선필요에 대한 조치사항 기입', { vAlign: 'top' })]],
            },
        ],
    };
}

// ─── ⑦ (별지 제37-4호 서식) 기타소득 지급내역서 — 직무지도원 수당 ───

const INCOME_MM = [26.9, 56.8, 27.9, 55.9];

export function otherIncomeStatementModel(input: SupportedEmploymentCase, options: DocumentOptions = {}): DocModel {
    const c = normalizeCase(input);
    const payments = calculatePayments(c, options);
    const coach = payments.items.find(item => item.key === 'coachAllowance');
    // 내부 직무지도원은 배치 사업체 소속(원본 사례), 외부 직무지도원은 기관 소속으로 적는다.
    const affiliation = c.coach.type === '외부' ? options.organizationName || '' : c.employerName;
    const label = (text: string, size?: number) => ({ text, align: 'center' as const, shade: true, bold: true, font: 'gothic' as const, ...(size ? { size } : {}) });
    return {
        title: '기타소득 지급내역서',
        font: 'serif',
        page: centeredPage(sum(INCOME_MM)),
        blocks: [
            { type: 'paragraph', text: '(별지 제37-4호 서식) [신설 2018.09.10., 개정 2021.8.27., 2025.6.23.]', size: 9.5, spaceBeforeMm: 11 },
            { type: 'title', text: '기타소득 지급내역서', size: 18, font: 'headline', underline: 'double', spaceBeforeMm: 6, spaceAfterMm: 12 },
            { type: 'paragraph', text: `□ 건명: 제${c.round || '  '}차 중증장애인지원고용 직무지도원 수당지급`, size: 14, spaceBeforeMm: 4 },
            { type: 'paragraph', text: '□ 지급대상자 정보', size: 14, spaceBeforeMm: 3, spaceAfterMm: 2 },
            {
                type: 'table',
                widths: INCOME_MM,
                widthsMm: INCOME_MM,
                fontSize: 11,
                rowHeightsMm: [10.6, 10.8, 10.7, 10.7],
                rows: [
                    [label('성 명'), center(c.coach.name), label('주민등록번호', 10), center('')],
                    [label('소속기관'), center(affiliation), label('연락처'), center(c.coach.phone)],
                    [label('지급은행'), center(c.coach.bank), label('계좌번호'), center(c.coach.account)],
                    [label('지급액'), center(coach ? `${formatWon(coach.amount)}원` : ''), center('', { colSpan: 2 })],
                ],
            },
            { type: 'paragraph', text: '※ 기타소득 지급액이 125,000원을 초과하는 경우 세금 공제 후 지급됩니다.', size: 11, font: 'gothic', spaceBeforeMm: 4 },
            {
                type: 'paragraph',
                text: '※「개인정보 보호법」제15조제1항제2호에 따라,「소득세법」제21조 및 제127조,「국세기본법 시행령」제68조에 근거한 "세법에 따른 원천징수의무자의 원천징수 사무 수행"을 위해 개인정보를 수집·이용합니다.',
                size: 11,
                font: 'gothic',
                spaceBeforeMm: 1.5,
            },
            {
                type: 'paragraph',
                text: '위 지급대상자 본인은 상기 내역을 이해하고, 한국장애인고용공단으로부터 안내받았음을 확인합니다.',
                size: 15,
                spaceBeforeMm: 22,
            },
            { type: 'paragraph', text: formatDateKorean(documentDate(c, options)).replace(/년 /, ' 년   ').replace(/월 /, ' 월   ').replace(/일$/, ' 일'), align: 'center', size: 13, spaceBeforeMm: 36 },
            { type: 'paragraph', text: `지급대상자 성명 :  ${c.coach.name || '          '}        (서명 또는 인)`, align: 'right', size: 13, spaceBeforeMm: 28 },
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
        case 'safetyChecklist': return safetyChecklistModel(c, options);
        case 'otherIncomeStatement': return otherIncomeStatementModel(c, options);
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
