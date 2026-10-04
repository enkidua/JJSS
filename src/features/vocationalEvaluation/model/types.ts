/**
 * 직업평가 워크벤치 타입.
 * VE Assist 0.1.0 `src/domain/models.ts`를 JJSS로 이식했다(계획서 §7).
 * zod는 쓰지 않고 검증은 `normalize.ts`에서 직접 한다 — JJSS는 zod 의존성을 두지 않는다.
 */

export type EntityId = string;
/** ISO 8601 문자열 */
export type ISODateTime = string;

/* ── 평가 회차(Episode) ───────────────────────────────────────────── */

export type EpisodeStatus = 'DRAFT' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED' | 'ARCHIVED';

export const EPISODE_STATUS_LABELS: Record<EpisodeStatus, string> = {
    DRAFT: '작성 중',
    IN_PROGRESS: '진행 중',
    REVIEW: '검토',
    COMPLETED: '완료',
    ARCHIVED: '보관',
};

/** 우세손. 실시요강 표4-5·4-6. 양손잡이는 채점에서 오른손으로 본다. */
export type DominantHand = 'RIGHT' | 'LEFT' | 'AMBIDEXTROUS' | 'UNKNOWN';

export const DOMINANT_HAND_LABELS: Record<DominantHand, string> = {
    RIGHT: '오른손',
    LEFT: '왼손',
    AMBIDEXTROUS: '양손잡이',
    UNKNOWN: '미판정',
};

/** 평가유형 — 기관 보고서 서식의 "내관/이동" */
export type EvaluationVenue = 'IN_HOUSE' | 'OUTREACH';

export const EVALUATION_VENUE_LABELS: Record<EvaluationVenue, string> = {
    IN_HOUSE: '내관',
    OUTREACH: '이동',
};

/* ── 시행(Trial) ─────────────────────────────────────────────────── */

export type TrialStatus =
    | 'PENDING'
    | 'READY'
    | 'RUNNING'
    | 'PAUSED'
    | 'INTERRUPTED'
    | 'FINISHED'
    | 'CONFIRMED'
    /** 요강에 생략 규정은 없지만 현장에서 2·3차를 실시하지 않는 경우(계획서 §3) */
    | 'SKIPPED';

export type PinSize = 'SMALL' | 'MEDIUM' | 'LARGE';
export type HandMode = 'DOMINANT' | 'NON_DOMINANT' | 'BILATERAL';

export const PIN_SIZE_LABELS: Record<PinSize, string> = {
    SMALL: '소형핀',
    MEDIUM: '중형핀',
    LARGE: '대형핀',
};

export const HAND_MODE_LABELS: Record<HandMode, string> = {
    DOMINANT: '우세손',
    NON_DOMINANT: '비우세손',
    BILATERAL: '양손',
};

export interface TrialDescriptor {
    id: EntityId;
    sequence: number;
    label: string;
    size: PinSize;
    handMode: HandMode;
    trialNumber: number;
    durationSeconds: number;
}

export interface Trial extends TrialDescriptor {
    testSessionId: EntityId;
    status: TrialStatus;
    /** 수행량(꽂은 핀 개수). 0도 직접 확인해야 하므로 undefined와 구분한다. */
    score?: number;
    remainingMs: number;
    memo: string;
    /** SKIPPED일 때 사유. 평균 표기에 "n회 실시"로 반영된다. */
    skipReason?: string;
    startedAt?: ISODateTime;
    runningStartedAt?: ISODateTime;
    endedAt?: ISODateTime;
    interruptedAt?: ISODateTime;
    interruptionReviewedAt?: ISODateTime;
    confirmedAt?: ISODateTime;
    createdAt: ISODateTime;
    updatedAt: ISODateTime;
}

/* ── 사건(Event) ─────────────────────────────────────────────────── */

export type EvaluationEventType =
    | 'ONE_HAND_DOMINANT'
    | 'ASSEMBLY_SEQUENCE_ERROR'
    | 'DROPPED_COMPONENT'
    | 'DIFFICULTY_HOLDING_COMPONENT'
    | 'DIFFICULTY_ROTATING_COMPONENT'
    | 'WRONG_COMPONENT_DIRECTION'
    | 'SEARCH_DELAY'
    | 'SELF_CORRECTION'
    | 'STRATEGY_CHANGE'
    | 'TASK_STOPPED'
    | 'MULTIPLE_PINS'
    | 'WRONG_DIRECTION'
    | 'DROPPED_PIN'
    | 'SKIPPED_HOLE'
    | 'OTHER_HAND_INSERT'
    | 'BILATERAL_TIME_GAP'
    | 'ATTENTION_DISTRACTION'
    | 'LEFT_SEAT'
    | 'REPEATED_INSTRUCTION'
    | 'ADDITIONAL_DEMONSTRATION'
    | 'TOOL_MANIPULATION_BEFORE_INSTRUCTION'
    | 'TASK_GIVE_UP'
    | 'RETRY'
    | 'PAIN'
    | 'FATIGUE'
    | 'BREAK'
    | 'EXTERNAL_DISTRACTION'
    | 'OTHER';

export interface EvaluationEvent {
    id: EntityId;
    testSessionId: EntityId;
    trialId?: EntityId;
    attemptId?: EntityId;
    eventType: EvaluationEventType;
    elapsedSeconds?: number;
    memo?: string;
    createdAt: ISODateTime;
    excludedAt?: ISODateTime;
    excludedReason?: 'UNDO' | 'TRIAL_RESTARTED';
}

/* ── 행동관찰(Observation) ───────────────────────────────────────── */

export type ObservationState = 'OBSERVED' | 'NOT_OBSERVED' | 'NOT_ASSESSED' | 'NOT_APPLICABLE';
export type ObservationFrequency = 'ONCE' | 'TWO_TO_THREE' | 'FREQUENT';
export type ObservationImpact = 'MINIMAL' | 'SLOWER' | 'MORE_ERRORS' | 'TEMPORARY_STOP';
export type ObservationAssistance = 'NONE' | 'VERBAL_PROMPT' | 'DEMONSTRATION' | 'STEP_BY_STEP';
export type ObservationRecovery = 'IMMEDIATE' | 'AFTER_PROMPT' | 'DIFFICULT';

export interface ObservationDetail {
    frequency?: ObservationFrequency;
    impact?: ObservationImpact;
    assistance?: ObservationAssistance;
    recovery?: ObservationRecovery;
}

export interface Observation {
    id: EntityId;
    testSessionId: EntityId;
    trialId?: EntityId;
    definitionId: string;
    label: string;
    state: ObservationState;
    detail?: ObservationDetail;
    memo?: string;
    evidenceEventIds?: EntityId[];
    candidateDecision?: 'APPLIED' | 'EXCLUDED';
    createdAt: ISODateTime;
    updatedAt: ISODateTime;
}

export interface ObservationDefinition {
    id: string;
    label: string;
    category: 'COMMON' | 'TEST_SPECIFIC';
    supportsDetail: boolean;
}

export interface EventDefinition {
    type: EvaluationEventType;
    label: string;
    shortcut?: string;
    /** 실시요강 표4-2·4-3의 수행량 처리. 손기능에서만 의미가 있다. */
    scoreEffect?: 'INCLUDE' | 'EXCLUDE';
    /** 중단·재설명 대상 오류 */
    requiresReinstruction?: boolean;
}

/* ── 검사조건(SessionCondition) ─────────────────────────────────── */

export type SessionConditionType =
    | 'STANDARD_PROCEDURE'
    | 'ADDITIONAL_INSTRUCTION'
    | 'ADDITIONAL_DEMONSTRATION'
    | 'BREAK'
    | 'EXTERNAL_DISTRACTION'
    | 'PAIN'
    | 'FATIGUE'
    | 'ASSISTIVE_DEVICE'
    | 'ENVIRONMENT_CHANGE'
    | 'INTERRUPTION_RESUME'
    | 'OTHER';

export interface SessionCondition {
    id: EntityId;
    testSessionId: EntityId;
    conditionType: SessionConditionType;
    label: string;
    state: ObservationState;
    memo?: string;
    createdAt: ISODateTime;
    updatedAt: ISODateTime;
}

/* ── 검사 세션(TestSession) ─────────────────────────────────────── */

export type SessionStatus = 'DRAFT' | 'IN_PROGRESS' | 'PAUSED' | 'REVIEW' | 'COMPLETED' | 'CANCELLED';
export type SessionPauseReason =
    | 'FATIGUE'
    | 'PAIN'
    | 'PARTICIPANT_REQUEST'
    | 'EVALUATOR_JUDGMENT'
    | 'ENVIRONMENT'
    | 'OTHER';
export type RecoveryReason = 'CRASH' | 'SESSION_PAUSE';

export const PAUSE_REASON_LABELS: Record<SessionPauseReason, string> = {
    FATIGUE: '피로',
    PAIN: '통증',
    PARTICIPANT_REQUEST: '당사자 요청',
    EVALUATOR_JUDGMENT: '평가사 판단',
    ENVIRONMENT: '검사환경',
    OTHER: '기타',
};

export interface TimerCheckpoint {
    sessionId: EntityId;
    /** 손기능은 시행 ID, 다차원은 측정(attempt) ID */
    trialId: EntityId;
    remainingMs: number;
    updatedAt: ISODateTime;
}

export interface TestSession {
    id: EntityId;
    episodeId: EntityId;
    seekerId: string;
    seekerName: string;
    testPluginId: string;
    status: SessionStatus;
    currentTrialId: EntityId;
    trials: Trial[];
    events: EvaluationEvent[];
    observations: Observation[];
    conditions: SessionCondition[];
    sessionNote: string;
    /** 다차원 양손협응 전용 상태 */
    bimanual?: import('./bimanualTypes').BimanualState;
    /** 요강 p.41~42 — 재설명 2회 한정, 3번 이상 중단이면 실패 */
    reinstructionCount: number;
    interruptionCount: number;
    /** 중단 3회로 실패 처리된 검사 */
    failedAt?: ISODateTime;
    startedAt: ISODateTime;
    pausedAt?: ISODateTime;
    pauseReason?: SessionPauseReason;
    recoveryReason?: RecoveryReason;
    completedAt?: ISODateTime;
    confirmedAt?: ISODateTime;
    confirmedBy?: string;
    timerCheckpoint?: TimerCheckpoint;
    createdAt: ISODateTime;
    updatedAt: ISODateTime;
    revision: number;
}

export interface ValidationIssue {
    id: string;
    trialId?: EntityId;
    type: 'INCOMPLETE_TRIAL' | 'MISSING_SCORE' | 'INTERRUPTED_TRIAL' | 'SAVE_ERROR';
    message: string;
}
