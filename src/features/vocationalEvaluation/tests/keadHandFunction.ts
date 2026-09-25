/**
 * KEAD 손기능 작업표본검사 정의.
 * 시행 규격은 실시요강(위탁연구 2008-06(2)) p.41~48, 표4-1~4-6 기준 — 계획서 §1-1.
 * 7조건 × 3회 = 21시행, 조건당 30초, 채점은 제한시간 내 꽂은 핀의 개수.
 */
import type { EventDefinition, HandMode, ObservationDefinition, PinSize, TrialDescriptor } from '../model/types';
import { HAND_MODE_LABELS, PIN_SIZE_LABELS } from '../model/types';
import { commonObservations, commonProcessEvents } from './common';
import type { TestPlugin } from './types';

export const HAND_FUNCTION_TEST_ID = 'kead-hand-function';
/** 요강 p.45 — 조건당 30초 */
export const HAND_FUNCTION_DURATION_SECONDS = 30;
/** 요강 부록1 — 조건당 3회 */
export const HAND_FUNCTION_TRIALS_PER_CONDITION = 3;

/** 요강 p.45의 수행순서. 양손 조건은 소형핀에만 있다. */
export const HAND_FUNCTION_CONDITIONS: Array<{ size: PinSize; handMode: HandMode }> = [
    { size: 'SMALL', handMode: 'DOMINANT' },
    { size: 'SMALL', handMode: 'NON_DOMINANT' },
    { size: 'SMALL', handMode: 'BILATERAL' },
    { size: 'MEDIUM', handMode: 'DOMINANT' },
    { size: 'MEDIUM', handMode: 'NON_DOMINANT' },
    { size: 'LARGE', handMode: 'DOMINANT' },
    { size: 'LARGE', handMode: 'NON_DOMINANT' },
];

export function conditionKey(size: PinSize, handMode: HandMode): string {
    return `${size}.${handMode}`;
}

export function conditionLabel(size: PinSize, handMode: HandMode): string {
    return `${PIN_SIZE_LABELS[size]} · ${HAND_MODE_LABELS[handMode]}`;
}

export function createHandFunctionTrials(durationSeconds = HAND_FUNCTION_DURATION_SECONDS): TrialDescriptor[] {
    let sequence = 1;
    return HAND_FUNCTION_CONDITIONS.flatMap(({ size, handMode }) =>
        Array.from({ length: HAND_FUNCTION_TRIALS_PER_CONDITION }, (_, index) => index + 1).map(trialNumber => ({
            id: `${size.toLowerCase()}-${handMode.toLowerCase()}-${trialNumber}`,
            sequence: sequence++,
            label: `${conditionLabel(size, handMode)} · ${trialNumber}차`,
            size,
            handMode,
            trialNumber,
            durationSeconds,
        })),
    );
}

/**
 * 요강 표4-2·4-3의 오류유형. `scoreEffect`가 수행량 처리다.
 * INCLUDE: 수행량에 포함 / EXCLUDE: 수행량에서 제외.
 */
export const handFunctionErrorEvents: EventDefinition[] = [
    { type: 'DROPPED_PIN', label: '핀 떨어뜨림', shortcut: 'F3', scoreEffect: 'INCLUDE' },
    { type: 'SKIPPED_HOLE', label: '꽂기 생략(빈 구멍)', shortcut: 'F2', scoreEffect: 'INCLUDE' },
    { type: 'OTHER_HAND_INSERT', label: '다른 손으로 꽂음', scoreEffect: 'EXCLUDE' },
    { type: 'MULTIPLE_PINS', label: '여러 핀 동시 집기', shortcut: 'F1', scoreEffect: 'EXCLUDE', requiresReinstruction: true },
    { type: 'WRONG_DIRECTION', label: '핀 방향 오류', requiresReinstruction: true },
    { type: 'BILATERAL_TIME_GAP', label: '양손 동시성 부족(1초 이상)', scoreEffect: 'EXCLUDE' },
];

const specificObservationPairs: Array<[string, string]> = [
    ['multiple_pins', '여러 핀을 동시에 집음'],
    ['wrong_direction', '핀 방향 오류'],
    ['dropped_pin', '핀 떨어뜨림'],
    ['small_pin_difficulty', '작은 핀 잡기 어려움'],
    ['fingertip_pinch', '손끝집기 사용'],
    ['dominant_reliance', '우세손 의존'],
    ['non_dominant_use', '비우세손 활용'],
    ['bilateral_use', '양손 활용'],
    ['eye_hand_coordination', '눈-손 협응'],
    ['speed_accuracy_control', '속도-정확성 조절'],
];

const specificObservations: ObservationDefinition[] = specificObservationPairs.map(([id, label]) => ({
    id: `hand.${id}`,
    label,
    category: 'TEST_SPECIFIC',
    supportsDetail: true,
}));

export const keadHandFunctionPlugin: TestPlugin = {
    manifest: {
        id: HAND_FUNCTION_TEST_ID,
        name: 'KEAD 손기능 작업표본검사',
        shortName: '손기능',
        version: '1.0.0',
        description: '핀 크기와 손 사용 조건별 수행량 및 행동관찰을 기록합니다.',
        durationSeconds: HAND_FUNCTION_DURATION_SECONDS,
        durationNote: '실시요강 기준 조건당 30초',
        workflowKind: 'TRIAL',
        procedureNote:
            '실시요강에 따라 시행한 결과를 기록합니다. 시범 후 필요에 따라 연습 기회를 줄 수 있으며, 재설명은 2회로 한정합니다.',
    },
    createTrials: createHandFunctionTrials,
    observations: [...commonObservations, ...specificObservations],
    events: [...handFunctionErrorEvents, ...commonProcessEvents],
};
