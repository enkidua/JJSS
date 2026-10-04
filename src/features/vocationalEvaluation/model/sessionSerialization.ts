/**
 * 검사 세션 직렬화·복원. 저장된 JSON을 믿지 않고 타입을 확인한 뒤 복원한다.
 * 알 수 없는 값은 버리되 **기존 기록을 조용히 바꾸지 않는다** — 수행량은 그대로 두고,
 * 형식이 깨진 항목만 제외한다.
 */
import { COMPONENT_KEYS, type BimanualAttempt, type BimanualState, type ComponentCounts } from './bimanualTypes';
import { BIMANUAL_DURATION_SECONDS, bimanualPartSpecification } from '../tests/keadBimanual';
import { findTestPlugin } from '../tests/registry';
import type {
    EvaluationEvent,
    EvaluationEventType,
    Observation,
    ObservationState,
    SessionCondition,
    SessionConditionType,
    SessionStatus,
    TestSession,
    TimerCheckpoint,
    Trial,
    TrialStatus,
} from './types';

export const VE_SESSION_VERSION = 1 as const;

const TRIAL_STATUSES: TrialStatus[] = [
    'PENDING',
    'READY',
    'RUNNING',
    'PAUSED',
    'INTERRUPTED',
    'FINISHED',
    'CONFIRMED',
    'SKIPPED',
];
const SESSION_STATUSES: SessionStatus[] = ['DRAFT', 'IN_PROGRESS', 'PAUSED', 'REVIEW', 'COMPLETED', 'CANCELLED'];
const OBSERVATION_STATES: ObservationState[] = ['OBSERVED', 'NOT_OBSERVED', 'NOT_ASSESSED', 'NOT_APPLICABLE'];

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const count = (value: unknown, fallback = 0): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
const optionalCount = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
const optionalText = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined);

function normalizeTrial(value: unknown, sessionId: string): Trial | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<Trial>;
    if (!raw.id || typeof raw.id !== 'string') return null;
    if (raw.size !== 'SMALL' && raw.size !== 'MEDIUM' && raw.size !== 'LARGE') return null;
    if (raw.handMode !== 'DOMINANT' && raw.handMode !== 'NON_DOMINANT' && raw.handMode !== 'BILATERAL') return null;
    const durationSeconds = count(raw.durationSeconds, 30) || 30;
    return {
        id: raw.id,
        testSessionId: sessionId,
        sequence: count(raw.sequence, 0),
        label: text(raw.label),
        size: raw.size,
        handMode: raw.handMode,
        trialNumber: count(raw.trialNumber, 1) || 1,
        durationSeconds,
        status: TRIAL_STATUSES.includes(raw.status as TrialStatus) ? (raw.status as TrialStatus) : 'PENDING',
        score: optionalCount(raw.score),
        remainingMs: Math.min(durationSeconds * 1000, count(raw.remainingMs, durationSeconds * 1000)),
        memo: text(raw.memo),
        skipReason: optionalText(raw.skipReason),
        startedAt: optionalText(raw.startedAt),
        runningStartedAt: optionalText(raw.runningStartedAt),
        endedAt: optionalText(raw.endedAt),
        interruptedAt: optionalText(raw.interruptedAt),
        interruptionReviewedAt: optionalText(raw.interruptionReviewedAt),
        confirmedAt: optionalText(raw.confirmedAt),
        createdAt: text(raw.createdAt),
        updatedAt: text(raw.updatedAt),
    };
}

function normalizeEvent(value: unknown, sessionId: string): EvaluationEvent | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<EvaluationEvent>;
    if (!raw.id || typeof raw.id !== 'string' || typeof raw.eventType !== 'string') return null;
    return {
        id: raw.id,
        testSessionId: sessionId,
        trialId: optionalText(raw.trialId),
        attemptId: optionalText(raw.attemptId),
        eventType: raw.eventType as EvaluationEventType,
        elapsedSeconds: optionalCount(raw.elapsedSeconds),
        memo: optionalText(raw.memo),
        createdAt: text(raw.createdAt),
        excludedAt: optionalText(raw.excludedAt),
        excludedReason:
            raw.excludedReason === 'UNDO' || raw.excludedReason === 'TRIAL_RESTARTED' ? raw.excludedReason : undefined,
    };
}

function normalizeObservation(value: unknown, sessionId: string): Observation | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<Observation>;
    if (!raw.id || typeof raw.id !== 'string' || typeof raw.definitionId !== 'string') return null;
    const detail = raw.detail && typeof raw.detail === 'object' ? raw.detail : undefined;
    return {
        id: raw.id,
        testSessionId: sessionId,
        trialId: optionalText(raw.trialId),
        definitionId: raw.definitionId,
        label: text(raw.label),
        state: OBSERVATION_STATES.includes(raw.state as ObservationState) ? (raw.state as ObservationState) : 'NOT_ASSESSED',
        detail,
        memo: optionalText(raw.memo),
        evidenceEventIds: Array.isArray(raw.evidenceEventIds)
            ? raw.evidenceEventIds.filter((id): id is string => typeof id === 'string')
            : undefined,
        candidateDecision:
            raw.candidateDecision === 'APPLIED' || raw.candidateDecision === 'EXCLUDED' ? raw.candidateDecision : undefined,
        createdAt: text(raw.createdAt),
        updatedAt: text(raw.updatedAt),
    };
}

function normalizeCondition(value: unknown, sessionId: string): SessionCondition | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<SessionCondition>;
    if (!raw.id || typeof raw.id !== 'string' || typeof raw.conditionType !== 'string') return null;
    return {
        id: raw.id,
        testSessionId: sessionId,
        conditionType: raw.conditionType as SessionConditionType,
        label: text(raw.label),
        state: OBSERVATION_STATES.includes(raw.state as ObservationState) ? (raw.state as ObservationState) : 'NOT_ASSESSED',
        memo: optionalText(raw.memo),
        createdAt: text(raw.createdAt),
        updatedAt: text(raw.updatedAt),
    };
}

function normalizeComponents(value: unknown): ComponentCounts {
    if (!value || typeof value !== 'object') return {};
    const raw = value as Record<string, unknown>;
    const components: ComponentCounts = {};
    for (const key of COMPONENT_KEYS) {
        const entry = optionalCount(raw[key]);
        if (entry === undefined) continue;
        const maximum = bimanualPartSpecification.components.find(component => component.key === key)?.maximum ?? 4;
        components[key] = Math.min(entry, maximum);
    }
    return components;
}

function normalizeAttempt(value: unknown, fallbackDuration: number): BimanualAttempt | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Partial<BimanualAttempt>;
    if (!raw.id || typeof raw.id !== 'string') return null;
    // 제한시간은 실시요강이 정한 값이다. 저장 JSON을 고쳐도 늘어나지 않는다.
    const durationSeconds = fallbackDuration;
    const limit = durationSeconds * 1000;
    const recorded = optionalCount(raw.result?.recordedDurationMs);
    const endReason =
        raw.result?.endReason === 'TIME_LIMIT' || raw.result?.endReason === 'EVALUATOR_FINISH' || raw.result?.endReason === 'INTERRUPTED'
            ? raw.result.endReason
            : undefined;
    return {
        id: raw.id,
        status:
            raw.status === 'READY' ||
            raw.status === 'RUNNING' ||
            raw.status === 'PAUSED' ||
            raw.status === 'INTERRUPTED' ||
            raw.status === 'FINISHED' ||
            raw.status === 'CONFIRMED'
                ? raw.status
                : 'READY',
        durationSeconds,
        remainingMs: Math.min(limit, count(raw.remainingMs, limit)),
        result: {
            components: normalizeComponents(raw.result?.components),
            ...(recorded !== undefined && endReason ? { recordedDurationMs: Math.min(limit, recorded), endReason } : {}),
        },
        pauseCount: count(raw.pauseCount, 0),
        pauses: Array.isArray(raw.pauses)
            ? raw.pauses
                  .filter((item): item is { at: string; elapsedMs: number } => Boolean(item) && typeof item === 'object')
                  .map(item => ({ at: text(item.at), elapsedMs: count(item.elapsedMs, 0) }))
            : [],
        startedAt: optionalText(raw.startedAt),
        endedAt: optionalText(raw.endedAt),
    };
}

function normalizeBimanual(value: unknown): BimanualState | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const raw = value as Partial<BimanualState>;
    if (!raw.attempt) return undefined;
    const attempt = normalizeAttempt(raw.attempt, BIMANUAL_DURATION_SECONDS);
    if (!attempt) return undefined;
    return {
        // 분모(판 1, 나머지 4, 합계 25)는 실시요강이 정한 값이다.
        // 저장된 JSON을 고쳐도 규격이 바뀌지 않도록 항상 공식 규격으로 되돌린다.
        specification: {
            ...bimanualPartSpecification,
            components: bimanualPartSpecification.components.map(component => ({ ...component })),
        },
        attempt,
        previousAttempts: Array.isArray(raw.previousAttempts)
            ? raw.previousAttempts
                  .map(item => normalizeAttempt(item, BIMANUAL_DURATION_SECONDS))
                  .filter((item): item is BimanualAttempt => item !== null)
            : [],
    };
}

function normalizeCheckpoint(value: unknown, sessionId: string): TimerCheckpoint | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const raw = value as Partial<TimerCheckpoint>;
    if (typeof raw.trialId !== 'string' || !raw.trialId) return undefined;
    return {
        sessionId,
        trialId: raw.trialId,
        remainingMs: count(raw.remainingMs, 0),
        updatedAt: text(raw.updatedAt),
    };
}

export function normalizeSession(value: TestSession): TestSession {
    const id = value.id;
    const officialDuration = findTestPlugin(text(value.testPluginId))?.manifest.durationSeconds;
    const trials = (Array.isArray(value.trials) ? value.trials : [])
        .map(trial => normalizeTrial(trial, id))
        .filter((trial): trial is Trial => trial !== null)
        // 등록된 검사의 제한시간은 실시요강 값으로 고정한다(저장 JSON 조작 방어).
        .map(trial =>
            officialDuration
                ? {
                      ...trial,
                      durationSeconds: officialDuration,
                      remainingMs: Math.min(trial.remainingMs, officialDuration * 1000),
                  }
                : trial,
        )
        .sort((a, b) => a.sequence - b.sequence);
    const currentTrialId = trials.some(trial => trial.id === value.currentTrialId)
        ? value.currentTrialId
        : (trials[0]?.id ?? '');
    return {
        id,
        episodeId: text(value.episodeId),
        seekerId: text(value.seekerId),
        seekerName: text(value.seekerName),
        testPluginId: text(value.testPluginId),
        status: SESSION_STATUSES.includes(value.status) ? value.status : 'IN_PROGRESS',
        currentTrialId,
        trials,
        events: (Array.isArray(value.events) ? value.events : [])
            .map(event => normalizeEvent(event, id))
            .filter((event): event is EvaluationEvent => event !== null),
        observations: (Array.isArray(value.observations) ? value.observations : [])
            .map(observation => normalizeObservation(observation, id))
            .filter((observation): observation is Observation => observation !== null),
        conditions: (Array.isArray(value.conditions) ? value.conditions : [])
            .map(condition => normalizeCondition(condition, id))
            .filter((condition): condition is SessionCondition => condition !== null),
        sessionNote: text(value.sessionNote),
        bimanual: normalizeBimanual(value.bimanual),
        reinstructionCount: count(value.reinstructionCount, 0),
        interruptionCount: count(value.interruptionCount, 0),
        failedAt: optionalText(value.failedAt),
        startedAt: text(value.startedAt),
        pausedAt: optionalText(value.pausedAt),
        pauseReason: value.pauseReason,
        recoveryReason: value.recoveryReason === 'CRASH' || value.recoveryReason === 'SESSION_PAUSE' ? value.recoveryReason : undefined,
        completedAt: optionalText(value.completedAt),
        confirmedAt: optionalText(value.confirmedAt),
        confirmedBy: optionalText(value.confirmedBy),
        timerCheckpoint: normalizeCheckpoint(value.timerCheckpoint, id),
        createdAt: text(value.createdAt),
        updatedAt: text(value.updatedAt),
        revision: count(value.revision, 1) || 1,
    };
}

export function serializeSession(value: TestSession): string {
    return JSON.stringify({ version: VE_SESSION_VERSION, ...normalizeSession(value) });
}

export type ParseSessionResult = { ok: true; session: TestSession } | { ok: false; error: string };

export function parseSession(content: string): ParseSessionResult {
    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return { ok: false, error: 'JSON 형식이 아닙니다.' };
    }
    if (!raw || typeof raw !== 'object') return { ok: false, error: '내용이 비어 있습니다.' };
    const candidate = raw as TestSession;
    if (typeof candidate.id !== 'string' || !candidate.id) return { ok: false, error: '세션 ID가 없습니다.' };
    if (typeof candidate.testPluginId !== 'string' || !candidate.testPluginId) {
        return { ok: false, error: '검사 종류가 없습니다.' };
    }
    return { ok: true, session: normalizeSession(candidate) };
}
