/** 결과지 기록 저장 형식. caseDocuments에 type 've_source_document'로 넣는다. */
import { createId } from '../ids';
import { normalizeExtraction } from './schema';
import type {
    DocumentType,
    ExtractionStatus,
    FactResolution,
    FactResolutionStatus,
    ReviewField,
    ReviewIssue,
    ReviewIssueStatus,
    ReviewSeverity,
    SourceDocumentRecord,
    SourceFact,
    SupportedExtraction,
} from './types';
import { VE_SOURCE_DOCUMENT_VERSION } from './types';

const DOCUMENT_TYPES: DocumentType[] = ['KEAD_HAND_FUNCTION', 'KEAD_BIMANUAL', 'UNSUPPORTED_OR_UNKNOWN'];
const STATUSES: ExtractionStatus[] = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'];
const SEVERITIES: ReviewSeverity[] = ['ERROR', 'WARNING', 'INFO'];
const ISSUE_STATUSES: ReviewIssueStatus[] = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED'];
const RESOLUTION_STATUSES: FactResolutionStatus[] = ['SINGLE_SOURCE', 'MATCHED', 'RESOLVED', 'CONFLICT', 'UNAVAILABLE'];

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const optionalText = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);
const count = (value: unknown, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;

export function createSourceDocument(input: {
    episodeId: string;
    seekerId: string;
    seekerName: string;
    sessionId?: string;
    fileName: string;
    fileSize: number;
    sha256: string;
    pageCount: number | null;
}): SourceDocumentRecord {
    return {
        version: VE_SOURCE_DOCUMENT_VERSION,
        id: createId('vesource'),
        episodeId: input.episodeId,
        seekerId: input.seekerId,
        seekerName: input.seekerName,
        sessionId: input.sessionId,
        fileName: input.fileName,
        fileSize: input.fileSize,
        sha256: input.sha256,
        pageCount: input.pageCount,
        documentType: 'UNSUPPORTED_OR_UNKNOWN',
        extractionStatus: 'PENDING',
        reviewFields: [],
        issues: [],
        facts: [],
        resolutions: [],
    };
}

function normalizeField(value: unknown): ReviewField | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<ReviewField>;
    if (typeof raw.path !== 'string' || !raw.path) return null;
    const scalar = (entry: unknown) => {
        const item = (entry ?? {}) as Record<string, unknown>;
        return {
            value:
                typeof item.value === 'number' || typeof item.value === 'string' ? (item.value as string | number) : null,
            rawText: typeof item.rawText === 'string' ? item.rawText : null,
            pageNumber: typeof item.pageNumber === 'number' ? item.pageNumber : null,
            sourceLabel: typeof item.sourceLabel === 'string' ? item.sourceLabel : null,
        };
    };
    return {
        path: raw.path,
        label: text(raw.label),
        originalExtracted: scalar(raw.originalExtracted),
        extracted: scalar(raw.extracted),
        status:
            raw.status === 'VERIFIED' || raw.status === 'CORRECTED' || raw.status === 'REJECTED' || raw.status === 'MISSING'
                ? raw.status
                : 'EXTRACTED',
        directValue:
            typeof raw.directValue === 'number' || typeof raw.directValue === 'string' || raw.directValue === null
                ? raw.directValue
                : undefined,
        comparison: raw.comparison === 'MATCHED' || raw.comparison === 'CONFLICT' ? raw.comparison : 'NOT_AVAILABLE',
    };
}

function normalizeIssue(value: unknown, documentId: string): ReviewIssue | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<ReviewIssue>;
    if (typeof raw.id !== 'string' || !raw.id || typeof raw.code !== 'string') return null;
    return {
        id: raw.id,
        documentId,
        path: optionalText(raw.path),
        severity: SEVERITIES.includes(raw.severity as ReviewSeverity) ? (raw.severity as ReviewSeverity) : 'WARNING',
        code: raw.code,
        message: text(raw.message),
        status: ISSUE_STATUSES.includes(raw.status as ReviewIssueStatus) ? (raw.status as ReviewIssueStatus) : 'OPEN',
        resolutionType: raw.resolutionType,
        resolvedAt: optionalText(raw.resolvedAt),
        resolvedBy: optionalText(raw.resolvedBy),
        resolutionReason: optionalText(raw.resolutionReason),
    };
}

function normalizeFact(value: unknown): SourceFact | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<SourceFact>;
    if (typeof raw.id !== 'string' || !raw.id || typeof raw.path !== 'string' || !raw.path) return null;
    return {
        id: raw.id,
        origin: raw.origin === 'OFFICIAL_PDF' ? 'OFFICIAL_PDF' : 'DIRECT_ENTRY',
        path: raw.path,
        value: typeof raw.value === 'number' || typeof raw.value === 'string' ? raw.value : null,
        unit: optionalText(raw.unit),
        provenance: raw.provenance && typeof raw.provenance === 'object' ? raw.provenance : undefined,
        recordedAt: text(raw.recordedAt),
        revision: count(raw.revision, 1) || 1,
    };
}

function normalizeResolution(value: unknown): FactResolution | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<FactResolution>;
    if (typeof raw.id !== 'string' || !raw.id || typeof raw.path !== 'string' || !raw.path) return null;
    return {
        id: raw.id,
        path: raw.path,
        candidateFactIds: Array.isArray(raw.candidateFactIds)
            ? raw.candidateFactIds.filter((id): id is string => typeof id === 'string')
            : [],
        selectedFactId: optionalText(raw.selectedFactId),
        status: RESOLUTION_STATUSES.includes(raw.status as FactResolutionStatus)
            ? (raw.status as FactResolutionStatus)
            : 'UNAVAILABLE',
        resolvedBy: optionalText(raw.resolvedBy),
        resolvedAt: optionalText(raw.resolvedAt),
        createdAt: text(raw.createdAt),
    };
}

function normalizeStoredExtraction(value: unknown): SupportedExtraction | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const model = (value as { extractionMetadata?: { model?: unknown } }).extractionMetadata?.model;
    const normalized = normalizeExtraction(value, typeof model === 'string' ? model : 'unknown');
    return normalized.documentType === 'UNSUPPORTED_OR_UNKNOWN' ? undefined : normalized;
}

/** 저장된 기록에서 다시 검토에 쓸 읽기 결과를 꺼낸다. */
export function extractionOf(document: SourceDocumentRecord): SupportedExtraction | undefined {
    return document.extraction;
}

/**
 * 해석·보고서가 이 결과지를 값의 출처로 써도 되는지.
 * 읽기 성공만으로는 부족하다 — **평가사가 값을 확정(confirmedAt)해야** 한다.
 * 확정 전의 AI 추출값이 공식값처럼 쓰이는 것을 막는 공통 관문이다.
 */
export function isOfficialDocumentUsable(
    document: SourceDocumentRecord | undefined | null,
): document is SourceDocumentRecord {
    return Boolean(
        document && document.extractionStatus === 'SUCCEEDED' && document.confirmedAt && !document.supersededAt,
    );
}

/**
 * 한 검사가 지금 쓰는 공식 결과지 **하나**를 고른다.
 * 확정되고 대체되지 않은 것 중 가장 최근 확정본이다 — 여러 결과지를 올렸을 때
 * "먼저 찾은 것"이 임의로 쓰이는 일을 막는다.
 */
export function selectActiveSourceDocument(
    documents: SourceDocumentRecord[],
    sessionId: string | undefined,
): SourceDocumentRecord | undefined {
    if (!sessionId) return undefined;
    return documents
        .filter(document => document.sessionId === sessionId && isOfficialDocumentUsable(document))
        .sort((a, b) => (b.confirmedAt ?? '').localeCompare(a.confirmedAt ?? ''))[0];
}

export function normalizeSourceDocument(value: SourceDocumentRecord): SourceDocumentRecord {
    const id = value.id;
    return {
        version: VE_SOURCE_DOCUMENT_VERSION,
        id,
        episodeId: text(value.episodeId),
        seekerId: text(value.seekerId),
        seekerName: text(value.seekerName),
        sessionId: optionalText(value.sessionId),
        fileName: text(value.fileName),
        fileSize: count(value.fileSize, 0),
        sha256: text(value.sha256),
        pageCount: typeof value.pageCount === 'number' ? value.pageCount : null,
        documentType: DOCUMENT_TYPES.includes(value.documentType) ? value.documentType : 'UNSUPPORTED_OR_UNKNOWN',
        extractionStatus: STATUSES.includes(value.extractionStatus) ? value.extractionStatus : 'PENDING',
        model: optionalText(value.model),
        extractedAt: optionalText(value.extractedAt),
        failureReason: optionalText(value.failureReason),
        detectedTitle: optionalText(value.detectedTitle),
        reportedSummary: optionalText(value.reportedSummary),
        evaluatorComment: optionalText(value.evaluatorComment),
        extraction: normalizeStoredExtraction(value.extraction),
        reviewFields: (Array.isArray(value.reviewFields) ? value.reviewFields : [])
            .map(normalizeField)
            .filter((field): field is ReviewField => field !== null),
        issues: (Array.isArray(value.issues) ? value.issues : [])
            .map(issue => normalizeIssue(issue, id))
            .filter((issue): issue is ReviewIssue => issue !== null),
        facts: (Array.isArray(value.facts) ? value.facts : [])
            .map(normalizeFact)
            .filter((fact): fact is SourceFact => fact !== null),
        resolutions: (Array.isArray(value.resolutions) ? value.resolutions : [])
            .map(normalizeResolution)
            .filter((resolution): resolution is FactResolution => resolution !== null),
        confirmedAt: optionalText(value.confirmedAt),
        confirmedBy: optionalText(value.confirmedBy),
        supersededAt: optionalText(value.supersededAt),
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
    };
}

export function serializeSourceDocument(value: SourceDocumentRecord): string {
    return JSON.stringify(normalizeSourceDocument(value));
}

export type ParseSourceDocumentResult =
    | { ok: true; document: SourceDocumentRecord }
    | { ok: false; error: string };

export function parseSourceDocument(content: string): ParseSourceDocumentResult {
    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return { ok: false, error: 'JSON 형식이 아닙니다.' };
    }
    if (!raw || typeof raw !== 'object') return { ok: false, error: '내용이 비어 있습니다.' };
    const candidate = raw as SourceDocumentRecord;
    if (typeof candidate.id !== 'string' || !candidate.id) return { ok: false, error: '결과지 기록 ID가 없습니다.' };
    return { ok: true, document: normalizeSourceDocument(candidate) };
}
