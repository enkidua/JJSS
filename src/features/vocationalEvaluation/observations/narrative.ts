/**
 * 행동관찰을 보고서 문장으로 만든다. VE Assist `src/domain/observationNarrative.ts` 이식.
 * '관찰됨'인 항목만 문장이 되고, 문장은 관찰한 사실만 쓴다(원인·능력 추론 없음).
 */
import type { Observation, ObservationState, SessionConditionType } from '../model/types';
import { observationAssistanceLabels, observationImpactLabels, observationRecoveryLabels } from './labels';

export const observationStateMarkers: Record<ObservationState, string> = {
    OBSERVED: '● 관찰됨',
    NOT_OBSERVED: '○ 관찰되지 않음',
    NOT_ASSESSED: '? 확인하지 못함',
    NOT_APPLICABLE: '— 해당 없음',
};

export const conditionDefinitions: Array<[SessionConditionType, string]> = [
    ['STANDARD_PROCEDURE', '표준절차 실시'],
    ['ADDITIONAL_INSTRUCTION', '추가 설명'],
    ['ADDITIONAL_DEMONSTRATION', '추가 시범'],
    ['BREAK', '휴식'],
    ['EXTERNAL_DISTRACTION', '외부방해'],
    ['PAIN', '통증'],
    ['FATIGUE', '피로'],
    ['ASSISTIVE_DEVICE', '보조기기'],
    ['ENVIRONMENT_CHANGE', '검사환경 변경'],
    ['INTERRUPTION_RESUME', '검사 중단 및 재개'],
    ['OTHER', '기타'],
];

export function buildObservationNarrative(observation: Observation): { text: string; evidenceIds: string[] } | null {
    if (observation.state !== 'OBSERVED') return null;
    const detail = observation.detail;
    const frequency =
        detail?.frequency === 'FREQUENT'
            ? '반복적으로 '
            : detail?.frequency === 'TWO_TO_THREE'
              ? '2~3회 '
              : detail?.frequency === 'ONCE'
                ? '1회 '
                : '';
    // '주의집중 관찰됨'이 '주의분산'으로 뒤집히지 않게 한다.
    const opening =
        observation.definitionId === 'common.distraction'
            ? `검사 과정에서 주의가 ${frequency}분산되는 모습이 관찰되었다.`
            : `검사 과정에서 '${observation.label}'이(가) ${frequency}관찰되었다.`;
    return {
        text: [
            opening,
            detail?.impact && `${observationImpactLabels[detail.impact]}.`,
            detail?.assistance && `${observationAssistanceLabels[detail.assistance]}.`,
            detail?.recovery && `${observationRecoveryLabels[detail.recovery]}.`,
        ]
            .filter(Boolean)
            .join(' '),
        evidenceIds: [observation.id],
    };
}
