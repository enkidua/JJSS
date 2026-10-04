/**
 * 다차원 양손협응 검사 상태 타입.
 * VE Assist `src/domain/bimanual.ts`의 zod 스키마를 타입 + 자체 검증으로 옮겼다.
 * 분모는 실시요강 부록2와 공단 프로그램 화면에 따라 판만 1, 나머지 4 → 총합 25 (계획서 §1-3).
 */
import type { ISODateTime, TrialStatus } from './types';

export const COMPONENT_KEYS = [
    'cylinder',
    'largeBolt',
    'largeNut',
    'smallBolt',
    'smallNut',
    'plate',
    'fixingPin',
] as const;

export type ComponentKey = (typeof COMPONENT_KEYS)[number];

export type ComponentCounts = Partial<Record<ComponentKey, number>>;

export interface PartComponentSpec {
    key: ComponentKey;
    label: string;
    maximum: number;
}

export interface PartSpecification {
    source: string;
    /** VERIFIED: 분모 합계가 표기 총 도구수와 일치함이 확인됨 */
    ruleStatus: 'SOURCE_CONFLICT' | 'VERIFIED';
    components: PartComponentSpec[];
    reportedTotal: number;
}

export type BimanualEndReason = 'TIME_LIMIT' | 'EVALUATOR_FINISH' | 'INTERRUPTED';

export interface BimanualResult {
    components: ComponentCounts;
    recordedDurationMs?: number;
    endReason?: BimanualEndReason;
}

export type BimanualAttemptStatus = Extract<
    TrialStatus,
    'READY' | 'RUNNING' | 'PAUSED' | 'INTERRUPTED' | 'FINISHED' | 'CONFIRMED'
>;

export interface BimanualPause {
    at: ISODateTime;
    elapsedMs: number;
}

export interface BimanualAttempt {
    id: string;
    status: BimanualAttemptStatus;
    durationSeconds: number;
    remainingMs: number;
    result: BimanualResult;
    pauseCount: number;
    pauses: BimanualPause[];
    startedAt?: ISODateTime;
    endedAt?: ISODateTime;
}

export interface BimanualState {
    specification: PartSpecification;
    attempt: BimanualAttempt;
    previousAttempts: BimanualAttempt[];
}
