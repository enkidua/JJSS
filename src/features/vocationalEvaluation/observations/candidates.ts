/**
 * 검사 중 기록한 사건에서 행동관찰 후보를 만든다.
 * VE Assist `src/domain/observationCandidates.ts` 이식.
 * 후보는 제안일 뿐이고 평가사가 반영/제외를 정해야 관찰로 저장된다.
 */
import type { EvaluationEventType, Observation, ObservationFrequency, TestSession } from '../model/types';

interface CandidateDefinition {
    definitionId: string;
    label: string;
    reason: string;
}

const candidateMap: Partial<Record<EvaluationEventType, CandidateDefinition>> = {
    ONE_HAND_DOMINANT: { definitionId: 'bimanual.one_hand_focus', label: '한 손 중심 사용', reason: '한 손 중심 사용 사건' },
    ASSEMBLY_SEQUENCE_ERROR: { definitionId: 'bimanual.sequence_memory', label: '조립 순서 오류', reason: '조립 순서 오류 사건' },
    DROPPED_COMPONENT: { definitionId: 'bimanual.dropped_component', label: '부품 떨어뜨림', reason: '부품 떨어뜨림 사건' },
    SELF_CORRECTION: { definitionId: 'bimanual.self_correction', label: '스스로 수정', reason: '스스로 수정한 사건' },
    STRATEGY_CHANGE: { definitionId: 'bimanual.strategy_change', label: '방법 변경', reason: '방법 변경 사건' },
    DIFFICULTY_HOLDING_COMPONENT: { definitionId: 'bimanual.holding', label: '부품 잡기 어려움', reason: '부품 잡기 어려움 기록' },
    DIFFICULTY_ROTATING_COMPONENT: { definitionId: 'bimanual.rotating', label: '부품 돌리기 어려움', reason: '부품 돌리기 어려움 기록' },
    WRONG_COMPONENT_DIRECTION: { definitionId: 'bimanual.orientation', label: '부품 방향 오류', reason: '부품 방향 오류 사건' },
    SEARCH_DELAY: { definitionId: 'bimanual.search', label: '부품 찾기 지연', reason: '부품 찾기 지연 사건' },
    TASK_STOPPED: { definitionId: 'bimanual.stopped', label: '작업 멈춤', reason: '작업 멈춤 사건' },
    ATTENTION_DISTRACTION: { definitionId: 'common.attention', label: '주의집중', reason: '주의분산 사건' },
    REPEATED_INSTRUCTION: { definitionId: 'common.instruction', label: '지시 이해', reason: '재설명 사건' },
    WRONG_DIRECTION: { definitionId: 'hand.wrong_direction', label: '핀 방향 오류', reason: '방향 오류 사건' },
    MULTIPLE_PINS: { definitionId: 'hand.multiple_pins', label: '여러 핀을 동시에 집음', reason: '여러 핀 동시 집기 사건' },
    DROPPED_PIN: { definitionId: 'hand.dropped_pin', label: '핀 떨어뜨림', reason: '핀 떨어뜨림 사건' },
};

export function candidateDefinitionId(eventType: EvaluationEventType): string | undefined {
    return candidateMap[eventType]?.definitionId;
}

export interface ObservationCandidate {
    key: string;
    eventType: EvaluationEventType;
    definitionId: string;
    label: string;
    reason: string;
    count: number;
    sourceEventIds: string[];
    suggestedFrequency: ObservationFrequency;
    decision: 'PENDING' | 'APPLIED' | 'EXCLUDED';
}

export function createObservationCandidates(session: TestSession): ObservationCandidate[] {
    const grouped = new Map<EvaluationEventType, string[]>();
    for (const event of session.events) {
        if (event.excludedAt || !candidateMap[event.eventType]) continue;
        grouped.set(event.eventType, [...(grouped.get(event.eventType) ?? []), event.id]);
    }
    return [...grouped].map(([eventType, sourceEventIds]) => {
        const definition = candidateMap[eventType] as CandidateDefinition;
        const review = session.observations.find(
            item =>
                item.definitionId === definition.definitionId &&
                item.evidenceEventIds?.length === sourceEventIds.length &&
                sourceEventIds.every(id => item.evidenceEventIds?.includes(id)),
        );
        return {
            key: `${eventType}:${sourceEventIds.join(',')}`,
            eventType,
            ...definition,
            count: sourceEventIds.length,
            sourceEventIds,
            suggestedFrequency:
                sourceEventIds.length >= 4 ? 'FREQUENT' : sourceEventIds.length >= 2 ? 'TWO_TO_THREE' : 'ONCE',
            decision: review?.candidateDecision ?? 'PENDING',
        };
    });
}

export function observationFromCandidate(
    candidate: ObservationCandidate,
    input: { id: string; sessionId: string; now: string; decision: 'APPLIED' | 'EXCLUDED' },
): Observation {
    return {
        id: input.id,
        testSessionId: input.sessionId,
        definitionId: candidate.definitionId,
        label: candidate.label,
        state: input.decision === 'APPLIED' ? 'OBSERVED' : 'NOT_ASSESSED',
        candidateDecision: input.decision,
        evidenceEventIds: candidate.sourceEventIds,
        detail: input.decision === 'APPLIED' ? { frequency: candidate.suggestedFrequency } : undefined,
        createdAt: input.now,
        updatedAt: input.now,
    };
}
