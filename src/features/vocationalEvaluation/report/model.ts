/**
 * 직업평가보고서 모델. 기관에서 실제 쓰는 서식(요약본 + 상세)을 기본으로 한다(계획서 §4).
 *
 * - 각 항목은 **자동 조립 문단 + 평가사 직접 서술** 2층이다. AI가 전혀 없어도 직접 서술만으로 완결된다.
 * - 확정하면 읽기 전용이 되고, 고치려면 새 버전을 만든다. 확정 후 원자료가 바뀌어도 출력은 변하지 않는다.
 */
import { createId } from '../ids';
import type { EpisodeNeedKey } from '../model/episode';
import { EPISODE_NEED_KEYS } from '../model/episode';
import type { EvaluationVenue, ISODateTime } from '../model/types';

export const VE_REPORT_VERSION = 1 as const;

/** 보고서 상세 섹션 구성(기관 서식 기준) */
export const REPORT_SECTIONS: ReadonlyArray<{ id: string; title: string }> = [
    { id: 'disability', title: '장애 및 진단이력' },
    { id: 'career', title: '교육훈련 및 직업경력' },
    { id: 'living', title: '생활적응능력' },
    { id: 'social', title: '사회진단(행동관찰 포함)' },
    { id: 'physical', title: '신체적 능력' },
    { id: 'psychological', title: '심리진단' },
    { id: 'vocational', title: '직업진단' },
];

/** 평가도구 표 기본 행(기관 표준). 기관마다 고칠 수 있다. */
export const DEFAULT_TOOL_ROWS: ReadonlyArray<{ area: string; tool: string }> = [
    { area: '사회진단(사회적응도)', tool: '' },
    { area: '신체적 능력', tool: '' },
    { area: '심리진단(인지·언어)', tool: '' },
    { area: '심리진단(정서 및 성격)', tool: '' },
    { area: '직업흥미', tool: '' },
    { area: '직업준비', tool: '' },
    { area: '직업진단(손기능)', tool: '' },
    { area: '직업진단(작업활동)', tool: '' },
];

export type ParagraphOrigin = 'AUTO' | 'AI_CLAIM';

export interface ReportParagraph {
    id: string;
    origin: ParagraphOrigin;
    text: string;
    /** 평가사가 뺄 수 있다. 뺀 문단은 출력에 들어가지 않는다 */
    included: boolean;
    /** 어디서 온 문장인지(화면 표시용) */
    sourceLabel?: string;
}

export interface ReportSection {
    id: string;
    title: string;
    /** 자동 조립 문단 */
    paragraphs: ReportParagraph[];
    /** 평가사 직접 서술 */
    evaluatorText: string;
}

export interface ReportToolRow {
    area: string;
    tool: string;
}

export interface ReportResultTable {
    title: string;
    /** 첫 행은 머리 행 */
    rows: string[][];
    note?: string;
}

export interface ReportHeader {
    evaluationOrganization: string;
    referralOrganization: string;
    evaluationDate: string;
    venue: EvaluationVenue;
    seekerName: string;
    birthDate: string;
    contact: string;
    address: string;
    disability: string;
    sex: string;
    needs: Record<EpisodeNeedKey, boolean>;
}

export interface ReportSummary {
    /** 직업수준 */
    vocationalLevel: string;
    /** 직업목표 — 당사자 */
    goalSelf: string;
    /** 직업목표 — 보호자·지원자 */
    goalGuardian: string;
    /** 직업적 강점 */
    strengths: string;
    /** 제한점·고려사항 */
    limitations: string;
    /** 추천(적합 추천 직무 및 사유) */
    recommendation: string;
    /** 추천직무·프로그램 */
    recommendedPrograms: string;
}

export interface EvaluationReport {
    version: number;
    id: string;
    episodeId: string;
    seekerId: string;
    seekerName: string;
    /** 1부터 올라가는 보고서 버전 */
    reportVersion: number;
    previousReportId?: string;
    header: ReportHeader;
    purpose: string;
    tools: ReportToolRow[];
    sections: ReportSection[];
    summary: ReportSummary;
    /** 확정 시점의 검사 결과표(원자료가 바뀌어도 출력은 변하지 않는다) */
    resultTables: ReportResultTable[];
    writtenOn: string;
    evaluator: string;
    confirmedAt?: ISODateTime;
    confirmedBy?: string;
    /** 확정 시점 내용의 지문. 뒤에서 조용히 바뀌지 않았는지 확인하는 용도 */
    contentHash?: string;
    createdAt?: ISODateTime;
    updatedAt?: ISODateTime;
}

function emptyNeeds(): Record<EpisodeNeedKey, boolean> {
    return EPISODE_NEED_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {} as Record<EpisodeNeedKey, boolean>);
}

export function createReport(input: {
    episodeId: string;
    seekerId: string;
    seekerName: string;
    header: Partial<ReportHeader>;
    purpose?: string;
    evaluator?: string;
    writtenOn: string;
    reportVersion?: number;
    previousReportId?: string;
}): EvaluationReport {
    return {
        version: VE_REPORT_VERSION,
        id: createId('vereport'),
        episodeId: input.episodeId,
        seekerId: input.seekerId,
        seekerName: input.seekerName,
        reportVersion: input.reportVersion ?? 1,
        previousReportId: input.previousReportId,
        header: {
            evaluationOrganization: '',
            referralOrganization: '',
            evaluationDate: '',
            venue: 'IN_HOUSE',
            seekerName: input.seekerName,
            birthDate: '',
            contact: '',
            address: '',
            disability: '',
            sex: '',
            needs: emptyNeeds(),
            ...input.header,
        },
        purpose: input.purpose ?? '',
        tools: DEFAULT_TOOL_ROWS.map(row => ({ ...row })),
        sections: REPORT_SECTIONS.map(section => ({ ...section, paragraphs: [], evaluatorText: '' })),
        summary: {
            vocationalLevel: '',
            goalSelf: '',
            goalGuardian: '',
            strengths: '',
            limitations: '',
            recommendation: '',
            recommendedPrograms: '',
        },
        resultTables: [],
        writtenOn: input.writtenOn,
        evaluator: input.evaluator ?? '',
    };
}

/* ── 지문(변경 감지) ───────────────────────────────────────────── */

/** 키 순서에 상관없이 같은 문자열을 만든다. */
function stable(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}

/**
 * 확정된 내용이 뒤에서 바뀌지 않았는지 보는 지문.
 * 보안용 서명이 아니라 실수로 덮어쓰는 것을 막는 확인값이다(동기 계산이 필요해 FNV-1a를 쓴다).
 */
export function hashReportContent(report: EvaluationReport): string {
    const content = stable({
        header: report.header,
        purpose: report.purpose,
        tools: report.tools,
        sections: report.sections,
        summary: report.summary,
        resultTables: report.resultTables,
        writtenOn: report.writtenOn,
        evaluator: report.evaluator,
        reportVersion: report.reportVersion,
    });
    let high = 0x811c9dc5;
    let low = 0x811c9dc5;
    for (let index = 0; index < content.length; index += 1) {
        const code = content.charCodeAt(index);
        high = Math.imul(high ^ code, 0x01000193) >>> 0;
        low = Math.imul(low ^ ((code << 5) | (code >>> 3)), 0x85ebca6b) >>> 0;
    }
    return `${high.toString(16).padStart(8, '0')}${low.toString(16).padStart(8, '0')}`;
}

export function confirmReport(report: EvaluationReport, by: string, at: string): EvaluationReport {
    if (!by.trim()) throw new Error('확정자 이름을 입력하세요.');
    if (report.confirmedAt) throw new Error('이미 확정된 보고서입니다. 고치려면 새 버전을 만드세요.');
    const confirmed = { ...report, confirmedAt: at, confirmedBy: by.trim() };
    return { ...confirmed, contentHash: hashReportContent(confirmed) };
}

/** 확정본을 바탕으로 다음 버전을 만든다. 확정본은 그대로 남는다. */
export function createNextVersion(report: EvaluationReport, at: string): EvaluationReport {
    return {
        ...report,
        id: createId('vereport'),
        reportVersion: report.reportVersion + 1,
        previousReportId: report.id,
        confirmedAt: undefined,
        confirmedBy: undefined,
        contentHash: undefined,
        createdAt: at,
        updatedAt: at,
    };
}

export function isLocked(report: EvaluationReport): boolean {
    return Boolean(report.confirmedAt);
}
