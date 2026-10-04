/**
 * 공단 공식 결과지 가져오기 타입. VE Assist `src/domain/documentImport.ts` 이식(zod → 자체 검증).
 *
 * 앱은 백분위를 계산하지 않는다. 결과지에 인쇄된 값을 읽어 `OFFICIAL_PDF` 출처로 저장하고,
 * 앱이 직접 기록한 값(`DIRECT_ENTRY`)과 다르면 충돌로 표시해 평가사가 고르게 한다(계획서 §2).
 */
import type { HandMode, ISODateTime, PinSize } from '../model/types';

export type DocumentType = 'KEAD_HAND_FUNCTION' | 'KEAD_BIMANUAL' | 'UNSUPPORTED_OR_UNKNOWN';
export type SupportedDocumentType = Exclude<DocumentType, 'UNSUPPORTED_OR_UNKNOWN'>;

export function documentTypeToPluginId(type: DocumentType): string | null {
    if (type === 'KEAD_HAND_FUNCTION') return 'kead-hand-function';
    if (type === 'KEAD_BIMANUAL') return 'kead-bimanual';
    return null;
}

/** 결과지에서 읽은 값 하나. 원문(rawText)과 쪽 번호를 함께 남겨 어디서 왔는지 볼 수 있게 한다. */
export interface ExtractedScalar {
    value: string | number | null;
    rawText: string | null;
    pageNumber: number | null;
    sourceLabel: string | null;
}

export interface ParticipantExtraction {
    sex: string | null;
    birthDate: string | null;
    age: number | null;
    organization: string | null;
    disabilityType: string | null;
    dominantHand: 'RIGHT' | 'LEFT' | 'AMBIDEXTROUS' | 'UNKNOWN' | null;
}

export interface HandConditionExtraction {
    trial1: ExtractedScalar;
    trial2: ExtractedScalar;
    trial3: ExtractedScalar;
    reportedAverage: ExtractedScalar;
}

export interface NormExtraction {
    /** 예: 'nondisabled.total', 'disability.male' */
    path: string;
    /** 결과지에 인쇄된 항목 이름 그대로 */
    sourceLabel: string;
    sourceValue: ExtractedScalar;
}

export interface ExtractionMetadata {
    extractorVersion: string;
    schemaVersion: string;
    model: string;
}

export interface HandFunctionExtraction {
    documentType: 'KEAD_HAND_FUNCTION';
    detectedTitle: string;
    participant: ParticipantExtraction;
    /** 평가사 이름 칸은 두지 않는다(개인정보). 검사일만 옮긴다. */
    test: { testDate: string | null };
    trials: Record<PinSize, Partial<Record<HandMode, HandConditionExtraction>>>;
    norms: NormExtraction[];
    reportedSummary: string | null;
    evaluatorComment: string | null;
    warnings: string[];
    extractionMetadata: ExtractionMetadata;
}

export interface BimanualExtraction {
    documentType: 'KEAD_BIMANUAL';
    detectedTitle: string;
    participant: ParticipantExtraction;
    /** 평가사 이름 칸은 두지 않는다(개인정보). 검사일만 옮긴다. */
    test: { testDate: string | null };
    performance: {
        recordedDuration: ExtractedScalar;
        components: Record<string, ExtractedScalar>;
        componentDenominators: Record<string, ExtractedScalar>;
        reportedTotalCompleted: ExtractedScalar;
        reportedTotalTools: ExtractedScalar;
    };
    norms: NormExtraction[];
    reportedSummary: string | null;
    evaluatorComment: string | null;
    warnings: string[];
    extractionMetadata: ExtractionMetadata;
}

export interface UnknownExtraction {
    documentType: 'UNSUPPORTED_OR_UNKNOWN';
    detectedTitle: string | null;
    warnings: string[];
    extractionMetadata: ExtractionMetadata;
}

export type ExtractionResult = HandFunctionExtraction | BimanualExtraction | UnknownExtraction;
export type SupportedExtraction = HandFunctionExtraction | BimanualExtraction;

export type ExtractionStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

/* ── 검토 ─────────────────────────────────────────────────────── */

export type ReviewFieldStatus = 'EXTRACTED' | 'VERIFIED' | 'CORRECTED' | 'REJECTED' | 'MISSING';

export interface ReviewField {
    path: string;
    label: string;
    originalExtracted: ExtractedScalar;
    extracted: ExtractedScalar;
    status: ReviewFieldStatus;
    /** 앱이 기록한 값. 없으면 undefined */
    directValue?: string | number | null;
    comparison: 'NOT_AVAILABLE' | 'MATCHED' | 'CONFLICT';
}

export type ReviewSeverity = 'ERROR' | 'WARNING' | 'INFO';
export type ReviewIssueStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
export type IssueResolutionType =
    | 'FIELD_CORRECTED'
    | 'FIELD_REJECTED'
    | 'DOCUMENT_TYPE_CONFIRMED'
    | 'IDENTITY_OVERRIDE'
    | 'EVALUATOR_ACKNOWLEDGED';

export interface ReviewIssue {
    id: string;
    documentId: string;
    path?: string;
    severity: ReviewSeverity;
    code: string;
    message: string;
    status: ReviewIssueStatus;
    resolutionType?: IssueResolutionType;
    resolvedAt?: ISODateTime;
    resolvedBy?: string;
    resolutionReason?: string;
}

/* ── 사실(Fact)과 충돌 해결 ─────────────────────────────────── */

export type SourceFactOrigin = 'DIRECT_ENTRY' | 'OFFICIAL_PDF';

export interface SourceFact {
    id: string;
    origin: SourceFactOrigin;
    path: string;
    value: string | number | null;
    unit?: string;
    provenance?: {
        documentId?: string;
        pageNumber?: number;
        sourceLabel?: string;
        sourceText?: string;
    };
    recordedAt: ISODateTime;
    revision: number;
}

export type FactResolutionStatus = 'SINGLE_SOURCE' | 'MATCHED' | 'RESOLVED' | 'CONFLICT' | 'UNAVAILABLE';

export interface FactResolution {
    id: string;
    path: string;
    candidateFactIds: string[];
    selectedFactId?: string;
    status: FactResolutionStatus;
    resolvedBy?: string;
    resolvedAt?: ISODateTime;
    createdAt: ISODateTime;
}

export interface CanonicalFact {
    path: string;
    selectedFact: SourceFact;
    resolutionStatus: FactResolutionStatus;
    allSources: SourceFact[];
}

/* ── 저장 단위 ───────────────────────────────────────────────── */

export const VE_SOURCE_DOCUMENT_VERSION = 1 as const;

export interface SourceDocumentRecord {
    version: number;
    id: string;
    episodeId: string;
    seekerId: string;
    seekerName: string;
    /** 대조할 검사 세션(앱 기록). 없으면 결과지 값만으로 진행한다 */
    sessionId?: string;
    /** 화면에만 쓰는 파일 이름. 외부로 보내지 않는다 */
    fileName: string;
    fileSize: number;
    sha256: string;
    pageCount: number | null;
    documentType: DocumentType;
    extractionStatus: ExtractionStatus;
    model?: string;
    extractedAt?: ISODateTime;
    /** 실패했을 때 화면에 보여 줄 사유 */
    failureReason?: string;
    detectedTitle?: string;
    reportedSummary?: string;
    evaluatorComment?: string;
    /** 읽은 결과 원본. 값을 고친 뒤 다시 검토할 때 쓴다(검토 값은 reviewFields가 기준). */
    extraction?: SupportedExtraction;
    reviewFields: ReviewField[];
    issues: ReviewIssue[];
    facts: SourceFact[];
    resolutions: FactResolution[];
    confirmedAt?: ISODateTime;
    confirmedBy?: string;
    /** 같은 검사에 새 결과지를 확정하면 이전 확정본은 지우지 않고 대체됨으로 표시한다 */
    supersededAt?: ISODateTime;
    createdAt?: ISODateTime;
    updatedAt?: ISODateTime;
}
