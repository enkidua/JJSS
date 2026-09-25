/**
 * KEAD 다차원 양손협응 작업표본검사 정의.
 * 제한시간 1분 30초 1회(요강 p.54·p.56), 분모는 부록2 기준으로 판만 1, 나머지 4 → 총합 25.
 * VE Assist는 분모 합계 28과 표기 25가 충돌한다고 보아 SOURCE_CONFLICT로 두었으나,
 * 실시요강 부록2와 공단 프로그램 화면(판 1/1, 총합 /25)이 일치해 VERIFIED로 정정했다(계획서 §1-3).
 */
import type { EventDefinition, ObservationDefinition } from '../model/types';
import type { PartSpecification } from '../model/bimanualTypes';
import { commonObservations } from './common';
import type { TestPlugin } from './types';

export const BIMANUAL_TEST_ID = 'kead-bimanual';
/** 요강 p.54 — 1분 30초 */
export const BIMANUAL_DURATION_SECONDS = 90;

export const bimanualPartSpecification: PartSpecification = {
    source: 'KEAD 작업표본검사 실시요강 부록2 / 공단 검사해석 프로그램 화면',
    ruleStatus: 'VERIFIED',
    reportedTotal: 25,
    components: [
        { key: 'cylinder', label: '원통결합', maximum: 4 },
        { key: 'largeBolt', label: '볼트(대)', maximum: 4 },
        { key: 'largeNut', label: '너트(대)', maximum: 4 },
        { key: 'smallBolt', label: '볼트(소)', maximum: 4 },
        { key: 'smallNut', label: '너트(소)', maximum: 4 },
        { key: 'plate', label: '판', maximum: 1 },
        { key: 'fixingPin', label: '고정핀', maximum: 4 },
    ],
};

const specificObservationPairs: Array<[string, string]> = [
    ['simultaneous_use', '양손 동시 사용'],
    ['one_hand_focus', '한 손 중심 수행'],
    ['stabilize_and_manipulate', '한 손 고정 + 반대손 조작'],
    ['role_division', '좌우 손 역할 분담'],
    ['part_search', '부품 탐색'],
    ['orientation_check', '부품 방향 확인'],
    ['sequence_memory', '조립 순서 기억'],
    ['bolt_nut', '볼트·너트 결합'],
    ['small_part', '작은 부품 조작'],
    ['position_adjustment', '위치 조정'],
    ['trial_and_error', '시행착오'],
    ['strategy_change', '전략 변경'],
    ['self_correction', '자가수정'],
    ['dropped_component', '부품 떨어뜨림'],
    ['holding', '부품 잡기 어려움'],
    ['rotating', '부품 돌리기 어려움'],
    ['orientation', '부품 방향 오류'],
    ['search', '부품 찾기 지연'],
    ['stopped', '작업 멈춤'],
];

const specificObservations: ObservationDefinition[] = specificObservationPairs.map(([id, label]) => ({
    id: `bimanual.${id}`,
    label,
    category: 'TEST_SPECIFIC',
    supportsDetail: true,
}));

export const bimanualEvents: EventDefinition[] = [
    { type: 'ONE_HAND_DOMINANT', label: '한 손 중심', shortcut: 'F1' },
    { type: 'ASSEMBLY_SEQUENCE_ERROR', label: '순서 오류', shortcut: 'F2' },
    { type: 'DROPPED_COMPONENT', label: '부품 떨어뜨림', shortcut: 'F3' },
    { type: 'ATTENTION_DISTRACTION', label: '주의분산', shortcut: 'F4' },
    { type: 'DIFFICULTY_HOLDING_COMPONENT', label: '부품 잡기 어려움' },
    { type: 'DIFFICULTY_ROTATING_COMPONENT', label: '부품 돌리기 어려움' },
    { type: 'WRONG_COMPONENT_DIRECTION', label: '부품 방향 오류' },
    { type: 'SEARCH_DELAY', label: '부품 찾기 지연' },
    { type: 'REPEATED_INSTRUCTION', label: '재설명' },
    { type: 'ADDITIONAL_DEMONSTRATION', label: '추가 시범' },
    { type: 'SELF_CORRECTION', label: '스스로 수정' },
    { type: 'STRATEGY_CHANGE', label: '방법 변경' },
    { type: 'TASK_STOPPED', label: '작업 멈춤' },
    { type: 'FATIGUE', label: '피로' },
    { type: 'PAIN', label: '통증' },
    { type: 'EXTERNAL_DISTRACTION', label: '외부방해' },
    { type: 'OTHER', label: '기타' },
];

export const keadBimanualPlugin: TestPlugin = {
    manifest: {
        id: BIMANUAL_TEST_ID,
        name: 'KEAD 다차원 양손협응 작업표본검사',
        shortName: '양손협응',
        version: '1.0.0',
        description: '부품별 수행량과 양손 협응 행동을 기록합니다.',
        durationSeconds: BIMANUAL_DURATION_SECONDS,
        durationNote: '실시요강 기준 제한시간 1분 30초, 1회 실시',
        workflowKind: 'PART_COUNT',
        procedureNote:
            '실시요강에 따라 시행한 결과를 기록합니다. 시작 전 간단한 조립 시범을 보이고, 제시된 이외의 힌트는 주지 않습니다.',
        partSpecification: bimanualPartSpecification,
    },
    createTrials: () => [],
    observations: [...commonObservations, ...specificObservations],
    events: bimanualEvents,
};
