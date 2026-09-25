/** 행동관찰 표시 문구와 의미 태그. VE Assist `src/domain/observationLabels.ts` 이식. */
import type { Observation, ObservationDetail, ObservationState } from '../model/types';

export const observationStateLabels: Record<ObservationState, string> = {
    OBSERVED: '관찰됨',
    NOT_OBSERVED: '관찰되지 않음',
    NOT_ASSESSED: '확인하지 못함',
    NOT_APPLICABLE: '해당 없음',
};

export const observationFrequencyLabels: Record<NonNullable<ObservationDetail['frequency']>, string> = {
    ONCE: '1회',
    TWO_TO_THREE: '2~3회',
    FREQUENT: '반복적',
};

export const observationImpactLabels: Record<NonNullable<ObservationDetail['impact']>, string> = {
    MINIMAL: '수행 영향 거의 없음',
    SLOWER: '수행 속도 저하',
    MORE_ERRORS: '오류 증가',
    TEMPORARY_STOP: '수행 일시 중단',
};

export const observationAssistanceLabels: Record<NonNullable<ObservationDetail['assistance']>, string> = {
    NONE: '별도 도움 없음',
    VERBAL_PROMPT: '언어적 재안내',
    DEMONSTRATION: '시범 제공',
    STEP_BY_STEP: '단계별 안내',
};

export const observationRecoveryLabels: Record<NonNullable<ObservationDetail['recovery']>, string> = {
    IMMEDIATE: '즉시 과제 복귀',
    AFTER_PROMPT: '안내 후 과제 복귀',
    DIFFICULT: '과제 복귀 어려움',
};

export function observationDomain(definitionId: string): string {
    return definitionId.split('.')[0] ?? 'unknown';
}

/** AI 근거 패키지에 넣는 의미 태그. 이름·메모 같은 자유 문장은 들어가지 않는다. */
export function observationSemanticTags(observation: Observation): string[] {
    const detail = observation.detail;
    const tags = [observation.definitionId, `status:${observation.state.toLowerCase()}`];
    if (detail?.frequency) {
        tags.push(
            `frequency:${
                detail.frequency === 'FREQUENT'
                    ? 'repeated'
                    : detail.frequency === 'TWO_TO_THREE'
                      ? 'two_to_three'
                      : 'once'
            }`,
        );
    }
    if (detail?.assistance) {
        tags.push(
            `assistance:${detail.assistance === 'VERBAL_PROMPT' ? 'verbal_prompt' : detail.assistance.toLowerCase()}`,
        );
    }
    if (detail?.recovery) {
        tags.push(`recovery:${detail.recovery === 'AFTER_PROMPT' ? 'after_prompt' : detail.recovery.toLowerCase()}`);
    }
    if (detail?.impact) tags.push(`impact:${detail.impact.toLowerCase()}`);
    return tags;
}

export function observationSemanticDescription(observation: Observation): string {
    const detail = observation.detail;
    return [
        `상태: ${observationStateLabels[observation.state]}`,
        detail?.frequency && `빈도: ${observationFrequencyLabels[detail.frequency]}`,
        detail?.assistance && `지원: ${observationAssistanceLabels[detail.assistance]}`,
        detail?.recovery && `회복: ${observationRecoveryLabels[detail.recovery]}`,
        detail?.impact && `영향: ${observationImpactLabels[detail.impact]}`,
    ]
        .filter(Boolean)
        .join(' · ');
}
