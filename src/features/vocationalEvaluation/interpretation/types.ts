/**
 * 해석 단계 타입. VE Assist `src/domain/interpretation.ts` 이식(zod → 자체 검증).
 * AI는 판단하지 않고 제안만 낸다. 모든 제안은 근거 ID를 달고, 평가사가 채택해야 문서에 들어간다.
 */
import type { ISODateTime, ObservationState, SessionConditionType } from '../model/types';

export type ClaimType =
    | 'RESULT_DESCRIPTION'
    | 'RELATIVE_STRENGTH'
    | 'SUPPORT_NEED'
    | 'VOCATIONAL_CONSIDERATION'
    | 'LIMITATION';

export const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
    RESULT_DESCRIPTION: '결과 설명',
    RELATIVE_STRENGTH: '상대적 강점',
    SUPPORT_NEED: '지원 고려',
    VOCATIONAL_CONSIDERATION: '직무 고려사항',
    LIMITATION: '자료의 한계',
};

export interface AiClaim {
    claimType: ClaimType;
    text: string;
    evidenceIds: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface InterpretationResponse {
    overallSummary: AiClaim | null;
    claims: AiClaim[];
    cautions: AiClaim[];
}

export interface PatternComparison {
    conditionA: string;
    valueA: number;
    conditionB: string;
    valueB: number;
    higherCondition: string;
    lowerCondition: string;
    absoluteDifference: number;
    displayDifference: string;
}

export interface PatternFact {
    id: string;
    testType: string;
    patternType: string;
    label: string;
    value: number | string | number[];
    direction?: 'HIGHER' | 'LOWER' | 'EQUAL';
    evidenceFactIds: string[];
    comparison?: PatternComparison;
    group: 'TRIAL_SEQUENCE' | 'HAND_COMPARISON' | 'SIZE_COMPARISON' | 'BILATERAL' | 'SUMMARY';
    summaryPriority: number;
    ruleId: string;
    ruleVersion: string;
}

export interface InterpretationEvidence {
    id: string;
    type: 'SOURCE_FACT' | 'DERIVED_FACT' | 'OBSERVATION' | 'EVENT' | 'SESSION_CONDITION' | 'TEST_METADATA';
    label: string;
    value: string | number | boolean | number[];
    description?: string;
    semanticType?: string;
    eventType?: string;
    observationDefinitionId?: string;
    observationDomain?: string;
    semanticTags?: string[];
    conditionType?: SessionConditionType;
    state?: ObservationState;
    contexts?: Array<{ label: string; count: number }>;
}

export interface EvidencePackage {
    testType: string;
    testDescription: string;
    verifiedFacts: InterpretationEvidence[];
    derivedFacts: InterpretationEvidence[];
    observations: InterpretationEvidence[];
    events: InterpretationEvidence[];
    conditions: InterpretationEvidence[];
    unresolvedIssues: string[];
    constraints: string[];
}

/** 화면에서 "이 값이 어디서 왔는지" 보여 주는 국소 정보. 외부로 보내지 않는다. */
export interface EvidenceReference {
    id: string;
    label: string;
    origin: string;
    value?: string | number | boolean | number[];
    sourceIds: string[];
    pageNumber?: number;
    sourceLabel?: string;
    sourceDocumentId?: string;
    revision?: number;
    resolutionStatus?: string;
}

export interface InterpretationReadiness {
    status: 'READY' | 'PARTIAL' | 'BLOCKED';
    message: string;
    missing: string[];
    usableCoreFields: number;
    totalCoreFields: number;
}

export interface EvidenceSnapshot {
    package: EvidencePackage;
    references: EvidenceReference[];
    patterns: PatternFact[];
    readiness: InterpretationReadiness;
    /** 근거가 바뀌었는지 보는 값 */
    evidenceHash: string;
}

export interface QualityResult {
    status: 'VALID' | 'REVIEW_REQUIRED' | 'INVALID';
    issues: string[];
}

export interface InterpretationClaim {
    id: string;
    claimType: ClaimType;
    role: 'OVERALL_SUMMARY' | 'MAIN_CLAIM' | 'CAUTION';
    originalAiText: string;
    finalText?: string;
    evidenceIds: string[];
    confidence: AiClaim['confidence'];
    status: 'PENDING' | 'ACCEPTED' | 'EDITED' | 'REJECTED';
    quality: QualityResult;
    createdAt: ISODateTime;
    reviewedAt?: ISODateTime;
    reviewedBy?: string;
    reviewNote?: string;
}

export const allEvidence = (value: EvidencePackage): InterpretationEvidence[] => [
    ...value.verifiedFacts,
    ...value.derivedFacts,
    ...value.observations,
    ...value.events,
    ...value.conditions,
];

/** 키 순서에 상관없이 같은 문자열이 나오게 한다(근거 해시용). */
export function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.entries(value as Record<string, unknown>)
            .filter(([, item]) => item !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
}

export async function hashEvidencePackage(value: EvidencePackage): Promise<string> {
    const sorted = {
        ...value,
        verifiedFacts: [...value.verifiedFacts].sort((a, b) => a.id.localeCompare(b.id)),
        derivedFacts: [...value.derivedFacts].sort((a, b) => a.id.localeCompare(b.id)),
        observations: [...value.observations].sort((a, b) => a.id.localeCompare(b.id)),
        events: [...value.events].sort((a, b) => a.id.localeCompare(b.id)),
        conditions: [...value.conditions].sort((a, b) => a.id.localeCompare(b.id)),
    };
    const bytes = new TextEncoder().encode(stableJson(sorted));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
