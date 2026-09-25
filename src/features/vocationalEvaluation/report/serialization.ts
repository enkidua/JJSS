/**
 * 보고서 저장 형식. 확정된 보고서는 **내용이 바뀌면 복원을 거부한다** —
 * 확정 후 출력이 조용히 달라지는 일을 막는다(계획서 §4-3).
 */
import { EPISODE_NEED_KEYS, type EpisodeNeedKey } from '../model/episode';
import { hashReportContent, VE_REPORT_VERSION } from './model';
import type {
    EvaluationReport,
    ReportHeader,
    ReportParagraph,
    ReportResultTable,
    ReportSection,
    ReportSummary,
    ReportToolRow,
} from './model';
import type { EvaluationVenue } from '../model/types';

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const optionalText = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
const count = (value: unknown, fallback = 1): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;

function normalizeHeader(value: unknown): ReportHeader {
    const raw = (value ?? {}) as Partial<ReportHeader>;
    const needs = EPISODE_NEED_KEYS.reduce(
        (acc, key) => ({ ...acc, [key]: Boolean(raw.needs?.[key]) }),
        {} as Record<EpisodeNeedKey, boolean>,
    );
    return {
        evaluationOrganization: text(raw.evaluationOrganization),
        referralOrganization: text(raw.referralOrganization),
        evaluationDate: text(raw.evaluationDate),
        venue: raw.venue === 'OUTREACH' ? 'OUTREACH' : ('IN_HOUSE' as EvaluationVenue),
        seekerName: text(raw.seekerName),
        birthDate: text(raw.birthDate),
        contact: text(raw.contact),
        address: text(raw.address),
        disability: text(raw.disability),
        sex: text(raw.sex),
        needs,
    };
}

function normalizeParagraph(value: unknown): ReportParagraph | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<ReportParagraph>;
    if (typeof raw.id !== 'string' || !raw.id) return null;
    return {
        id: raw.id,
        origin: raw.origin === 'AI_CLAIM' ? 'AI_CLAIM' : 'AUTO',
        text: text(raw.text),
        included: raw.included !== false,
        sourceLabel: optionalText(raw.sourceLabel),
    };
}

function normalizeSection(value: unknown): ReportSection | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<ReportSection>;
    if (typeof raw.id !== 'string' || !raw.id) return null;
    return {
        id: raw.id,
        title: text(raw.title),
        paragraphs: (Array.isArray(raw.paragraphs) ? raw.paragraphs : [])
            .map(normalizeParagraph)
            .filter((item): item is ReportParagraph => item !== null),
        evaluatorText: text(raw.evaluatorText),
    };
}

function normalizeTable(value: unknown): ReportResultTable | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<ReportResultTable>;
    if (!Array.isArray(raw.rows)) return null;
    return {
        title: text(raw.title),
        rows: (raw.rows as unknown[])
            .filter((row): row is unknown[] => Array.isArray(row))
            .map(row => row.map(cell => (typeof cell === 'string' ? cell : String(cell ?? '')))),
        note: optionalText(raw.note),
    };
}

function normalizeSummary(value: unknown): ReportSummary {
    const raw = (value ?? {}) as Partial<ReportSummary>;
    return {
        vocationalLevel: text(raw.vocationalLevel),
        goalSelf: text(raw.goalSelf),
        goalGuardian: text(raw.goalGuardian),
        strengths: text(raw.strengths),
        limitations: text(raw.limitations),
        recommendation: text(raw.recommendation),
        recommendedPrograms: text(raw.recommendedPrograms),
    };
}

function normalizeToolRow(value: unknown): ReportToolRow | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<ReportToolRow>;
    if (typeof raw.area !== 'string') return null;
    return { area: raw.area, tool: text(raw.tool) };
}

export function normalizeReport(value: EvaluationReport): EvaluationReport {
    return {
        version: VE_REPORT_VERSION,
        id: value.id,
        episodeId: text(value.episodeId),
        seekerId: text(value.seekerId),
        seekerName: text(value.seekerName),
        reportVersion: count(value.reportVersion, 1),
        previousReportId: optionalText(value.previousReportId),
        header: normalizeHeader(value.header),
        purpose: text(value.purpose),
        tools: (Array.isArray(value.tools) ? value.tools : [])
            .map(normalizeToolRow)
            .filter((item): item is ReportToolRow => item !== null),
        sections: (Array.isArray(value.sections) ? value.sections : [])
            .map(normalizeSection)
            .filter((item): item is ReportSection => item !== null),
        summary: normalizeSummary(value.summary),
        resultTables: (Array.isArray(value.resultTables) ? value.resultTables : [])
            .map(normalizeTable)
            .filter((item): item is ReportResultTable => item !== null),
        writtenOn: text(value.writtenOn),
        evaluator: text(value.evaluator),
        confirmedAt: optionalText(value.confirmedAt),
        confirmedBy: optionalText(value.confirmedBy),
        contentHash: optionalText(value.contentHash),
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
    };
}

export function serializeReport(value: EvaluationReport): string {
    const normalized = normalizeReport(value);
    if (normalized.confirmedAt) {
        // 지문을 지워서 검사를 건너뛰는 우회를 막는다 — 확정본에는 지문이 반드시 있어야 한다.
        if (!normalized.contentHash) throw new Error('확정된 보고서에 내용 지문이 없습니다.');
        if (hashReportContent(normalized) !== normalized.contentHash) {
            throw new Error('확정된 보고서는 고칠 수 없습니다. 새 버전을 만들어 주세요.');
        }
    }
    return JSON.stringify(normalized);
}

export type ParseReportResult = { ok: true; report: EvaluationReport } | { ok: false; error: string };

export function parseReport(content: string): ParseReportResult {
    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return { ok: false, error: 'JSON 형식이 아닙니다.' };
    }
    if (!raw || typeof raw !== 'object') return { ok: false, error: '내용이 비어 있습니다.' };
    const candidate = raw as EvaluationReport;
    if (typeof candidate.id !== 'string' || !candidate.id) return { ok: false, error: '보고서 ID가 없습니다.' };
    const report = normalizeReport(candidate);
    if (report.confirmedAt) {
        if (!report.contentHash) return { ok: false, error: '확정된 보고서에 내용 지문이 없습니다.' };
        if (hashReportContent(report) !== report.contentHash) {
            return { ok: false, error: '확정된 보고서의 내용이 저장된 지문과 다릅니다.' };
        }
    }
    return { ok: true, report };
}
