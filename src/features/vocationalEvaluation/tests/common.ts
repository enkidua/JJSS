/** 검사 공통 행동관찰·사건 정의. VE Assist `src/vocational-tests/common.ts` 이식. */
import type { EventDefinition, ObservationDefinition } from '../model/types';

const commonObservationPairs: Array<[string, string]> = [
    ['participation', '검사 참여'],
    ['attention', '주의집중'],
    ['instruction', '지시 이해'],
    ['work_attitude', '작업태도'],
    ['work_speed', '작업속도'],
    ['accuracy', '정확성'],
    ['error_awareness', '오류 인식'],
    ['self_correction', '자가수정'],
    ['help_seeking', '도움 요청'],
    ['frustration', '좌절 대응'],
    ['persistence', '과제 지속'],
    ['fatigue', '피로'],
    ['posture', '자세'],
    ['communication', '의사소통'],
    ['emotional_response', '정서반응'],
];

export const commonObservations: ObservationDefinition[] = commonObservationPairs.map(([id, label]) => ({
    id: `common.${id}`,
    label,
    category: 'COMMON',
    supportsDetail: true,
}));

/** 검사 진행 중 기록하는 일반 사건(수행량에는 영향이 없다) */
// 손기능 화면에서 오류 기록(F1~F6)에 이어 F7부터 배정한다. F12까지만 쓴다(키보드 F키 범위).
export const commonProcessEvents: EventDefinition[] = [
    { type: 'REPEATED_INSTRUCTION', label: '재설명', shortcut: 'F7' },
    { type: 'ADDITIONAL_DEMONSTRATION', label: '시범 추가', shortcut: 'F8' },
    { type: 'ATTENTION_DISTRACTION', label: '주의분산', shortcut: 'F9' },
    { type: 'LEFT_SEAT', label: '자리이석', shortcut: 'F10' },
    { type: 'TOOL_MANIPULATION_BEFORE_INSTRUCTION', label: '지시 전 도구 조작', shortcut: 'F11' },
    { type: 'TASK_GIVE_UP', label: '과제 포기', shortcut: 'F12' },
    { type: 'RETRY', label: '재시도' },
    { type: 'PAIN', label: '통증 호소' },
    { type: 'FATIGUE', label: '피로 호소' },
    { type: 'BREAK', label: '휴식' },
    { type: 'EXTERNAL_DISTRACTION', label: '외부방해' },
    { type: 'OTHER', label: '기타' },
];
