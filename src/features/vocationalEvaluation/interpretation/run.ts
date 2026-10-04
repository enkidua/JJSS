/**
 * 해석 실행 기록. AI 제안을 "제안" 상태로 보관하고 평가사의 채택·수정·제외를 남긴다.
 * 근거가 바뀌면 STALE로 표시해 예전 제안이 조용히 쓰이지 않게 한다.
 */
import { createId } from '../ids';
import { validateClaim } from './claimQuality';
import type {
    AiClaim,
    ClaimType,
    EvidencePackage,
    InterpretationClaim,
    InterpretationReadiness,
    InterpretationResponse,
} from './types';

export const INTERPRETATION_PROMPT_VERSION = '1.0.0';

export interface InterpretationRun {
    id: string;
    testPluginId: string;
    sessionId?: string;
    sourceDocumentId?: string;
    evidenceHash: string;
    model: string;
    promptVersion: string;
    createdAt: string;
    /** CURRENT 하나만 쓰인다. 재요청하면 이전 것은 SUPERSEDED, 근거가 바뀌면 STALE — 기록은 지우지 않는다. */
    status: 'CURRENT' | 'STALE' | 'SUPERSEDED' | 'FAILED';
    readiness: InterpretationReadiness;
    claims: InterpretationClaim[];
    errorReason?: string;
}

function toClaim(
    claim: AiClaim,
    role: InterpretationClaim['role'],
    pack: EvidencePackage,
    now: string,
): InterpretationClaim {
    return {
        id: createId('veclaim'),
        claimType: claim.claimType,
        role,
        originalAiText: claim.text,
        evidenceIds: claim.evidenceIds,
        confidence: claim.confidence,
        status: 'PENDING',
        quality: validateClaim(claim, pack),
        createdAt: now,
    };
}

export function createInterpretationRun(input: {
    testPluginId: string;
    sessionId?: string;
    sourceDocumentId?: string;
    evidenceHash: string;
    readiness: InterpretationReadiness;
    model: string;
    response: InterpretationResponse;
    pack: EvidencePackage;
    now: string;
}): InterpretationRun {
    const claims: InterpretationClaim[] = [
        ...(input.response.overallSummary ? [toClaim(input.response.overallSummary, 'OVERALL_SUMMARY', input.pack, input.now)] : []),
        ...input.response.claims.map(claim => toClaim(claim, 'MAIN_CLAIM', input.pack, input.now)),
        ...input.response.cautions.map(claim => toClaim(claim, 'CAUTION', input.pack, input.now)),
    ];
    return {
        id: createId('verun'),
        testPluginId: input.testPluginId,
        sessionId: input.sessionId,
        sourceDocumentId: input.sourceDocumentId,
        evidenceHash: input.evidenceHash,
        model: input.model,
        promptVersion: INTERPRETATION_PROMPT_VERSION,
        createdAt: input.now,
        status: 'CURRENT',
        readiness: input.readiness,
        claims,
    };
}

export function createFailedRun(input: {
    testPluginId: string;
    sessionId?: string;
    evidenceHash: string;
    readiness: InterpretationReadiness;
    model: string;
    reason: string;
    now: string;
}): InterpretationRun {
    return {
        id: createId('verun'),
        testPluginId: input.testPluginId,
        sessionId: input.sessionId,
        evidenceHash: input.evidenceHash,
        model: input.model,
        promptVersion: INTERPRETATION_PROMPT_VERSION,
        createdAt: input.now,
        status: 'FAILED',
        readiness: input.readiness,
        claims: [],
        errorReason: input.reason,
    };
}

/** 한 검사에는 CURRENT 실행이 하나만 있어야 한다. 화면과 보고서는 이 함수로 고른다. */
export function selectCurrentRun(
    runs: InterpretationRun[],
    sessionId: string | undefined,
): InterpretationRun | undefined {
    if (!sessionId) return undefined;
    const own = runs.filter(run => run.sessionId === sessionId);
    return own.find(run => run.status === 'CURRENT') ?? own[own.length - 1];
}

/** 근거가 달라졌으면 STALE로 바꾼다. 기록은 지우지 않는다. */
export function markStaleRuns(runs: InterpretationRun[], currentEvidenceHash: string): InterpretationRun[] {
    return runs.map(run =>
        run.status === 'CURRENT' && run.evidenceHash !== currentEvidenceHash ? { ...run, status: 'STALE' as const } : run,
    );
}

export function acceptClaim(claim: InterpretationClaim, by: string, at: string): InterpretationClaim {
    if (claim.quality.status === 'INVALID') throw new Error('품질 검사를 통과하지 못한 제안은 채택할 수 없습니다.');
    return { ...claim, status: 'ACCEPTED', finalText: claim.finalText ?? claim.originalAiText, reviewedAt: at, reviewedBy: by };
}

/**
 * 고쳐서 채택. 수정한 문장을 **다시 품질 검사**한다 —
 * INVALID 제안을 "고쳐서 채택"으로 그대로 통과시키는 우회를 막는다.
 */
export function editClaim(
    claim: InterpretationClaim,
    text: string,
    by: string,
    at: string,
    pack: EvidencePackage,
): InterpretationClaim {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('내용을 입력하세요.');
    const quality = validateClaim({ claimType: claim.claimType, text: trimmed, evidenceIds: claim.evidenceIds }, pack);
    if (quality.status === 'INVALID') {
        throw new Error(`고친 문장도 품질 검사를 통과하지 못했습니다: ${quality.issues[0] ?? '금지된 표현'}`);
    }
    return { ...claim, status: 'EDITED', finalText: trimmed, quality, reviewedAt: at, reviewedBy: by };
}

export function rejectClaim(claim: InterpretationClaim, by: string, at: string, note?: string): InterpretationClaim {
    return { ...claim, status: 'REJECTED', reviewedAt: at, reviewedBy: by, reviewNote: note };
}

/**
 * 보고서에 들어갈 문장만 고른다. 평가사가 고치거나 채택한 것만 남고,
 * 근거가 바뀐(STALE) 실행의 문장은 **전부 빠진다** — 예전 수치로 만든 해석이
 * 새 보고서에 조용히 실리지 않게 한다.
 */
export function adoptedClaims(run: InterpretationRun | undefined): InterpretationClaim[] {
    if (!run || run.status !== 'CURRENT') return [];
    return run.claims.filter(
        claim => (claim.status === 'ACCEPTED' || claim.status === 'EDITED') && claim.quality.status !== 'INVALID',
    );
}

export function claimText(claim: InterpretationClaim): string {
    return claim.finalText ?? claim.originalAiText;
}

/* ── 저장 형식 복원 ─────────────────────────────────────────── */

const CLAIM_TYPES: ClaimType[] = [
    'RESULT_DESCRIPTION',
    'RELATIVE_STRENGTH',
    'SUPPORT_NEED',
    'VOCATIONAL_CONSIDERATION',
    'LIMITATION',
];
const ROLES: InterpretationClaim['role'][] = ['OVERALL_SUMMARY', 'MAIN_CLAIM', 'CAUTION'];
const CLAIM_STATUSES: InterpretationClaim['status'][] = ['PENDING', 'ACCEPTED', 'EDITED', 'REJECTED'];

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const optionalText = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

function normalizeClaim(value: unknown): InterpretationClaim | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<InterpretationClaim>;
    if (typeof raw.id !== 'string' || !raw.id) return null;
    const quality = raw.quality && typeof raw.quality === 'object' ? raw.quality : undefined;
    return {
        id: raw.id,
        claimType: CLAIM_TYPES.includes(raw.claimType as ClaimType) ? (raw.claimType as ClaimType) : 'RESULT_DESCRIPTION',
        role: ROLES.includes(raw.role as InterpretationClaim['role']) ? (raw.role as InterpretationClaim['role']) : 'MAIN_CLAIM',
        originalAiText: text(raw.originalAiText),
        finalText: optionalText(raw.finalText),
        evidenceIds: Array.isArray(raw.evidenceIds) ? raw.evidenceIds.filter((id): id is string => typeof id === 'string') : [],
        confidence: raw.confidence === 'HIGH' || raw.confidence === 'LOW' ? raw.confidence : 'MEDIUM',
        status: CLAIM_STATUSES.includes(raw.status as InterpretationClaim['status'])
            ? (raw.status as InterpretationClaim['status'])
            : 'PENDING',
        quality: {
            status:
                quality?.status === 'INVALID' || quality?.status === 'REVIEW_REQUIRED' ? quality.status : 'VALID',
            issues: Array.isArray(quality?.issues) ? quality.issues.filter((item): item is string => typeof item === 'string') : [],
        },
        createdAt: text(raw.createdAt),
        reviewedAt: optionalText(raw.reviewedAt),
        reviewedBy: optionalText(raw.reviewedBy),
        reviewNote: optionalText(raw.reviewNote),
    };
}

export function normalizeInterpretationRun(value: unknown): InterpretationRun | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<InterpretationRun>;
    if (typeof raw.id !== 'string' || !raw.id) return null;
    const readiness = raw.readiness && typeof raw.readiness === 'object' ? raw.readiness : undefined;
    return {
        id: raw.id,
        testPluginId: text(raw.testPluginId),
        sessionId: optionalText(raw.sessionId),
        sourceDocumentId: optionalText(raw.sourceDocumentId),
        evidenceHash: text(raw.evidenceHash),
        model: text(raw.model),
        promptVersion: text(raw.promptVersion, INTERPRETATION_PROMPT_VERSION),
        createdAt: text(raw.createdAt),
        status:
            raw.status === 'STALE' || raw.status === 'SUPERSEDED' || raw.status === 'FAILED' ? raw.status : 'CURRENT',
        readiness: {
            status: readiness?.status === 'PARTIAL' || readiness?.status === 'BLOCKED' ? readiness.status : 'READY',
            message: text(readiness?.message),
            missing: Array.isArray(readiness?.missing) ? readiness.missing.filter((item): item is string => typeof item === 'string') : [],
            usableCoreFields: typeof readiness?.usableCoreFields === 'number' ? readiness.usableCoreFields : 0,
            totalCoreFields: typeof readiness?.totalCoreFields === 'number' ? readiness.totalCoreFields : 0,
        },
        claims: (Array.isArray(raw.claims) ? raw.claims : [])
            .map(normalizeClaim)
            .filter((claim): claim is InterpretationClaim => claim !== null),
        errorReason: optionalText(raw.errorReason),
    };
}
