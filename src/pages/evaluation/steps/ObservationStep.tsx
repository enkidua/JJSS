/**
 * 행동관찰 단계. 검사 중 기록한 사건에서 만든 후보를 평가사가 반영·제외하고,
 * 관찰 항목과 검사조건을 정리한다. 후보는 제안일 뿐이며 반영해야 관찰로 남는다.
 */
import { useState } from 'react';
import { Check, X } from 'lucide-react';
import {
    conditionDefinitions,
    createObservationCandidates,
    getTestPlugin,
    observationFromCandidate,
    observationFrequencyLabels,
    observationAssistanceLabels,
    observationImpactLabels,
    observationRecoveryLabels,
    observationStateLabels,
    upsertCondition,
    upsertObservation,
    type Observation,
    type ObservationDetail,
    type ObservationState,
    type TestSession,
} from '../../../features/vocationalEvaluation';
import { createId } from '../../../features/vocationalEvaluation/ids';
import { saveSession } from '../../../features/vocationalEvaluation/storage';
import { useAppToast } from '../../../components/Toast';

const STATES: ObservationState[] = ['OBSERVED', 'NOT_OBSERVED', 'NOT_ASSESSED', 'NOT_APPLICABLE'];

function StateButtons({
    value,
    onChange,
    disabled,
    label,
}: {
    value: ObservationState;
    onChange: (next: ObservationState) => void;
    disabled?: boolean;
    label: string;
}) {
    return (
        <div className="flex gap-1 shrink-0" role="group" aria-label={`${label} 상태`}>
            {STATES.map(state => (
                <button
                    key={state}
                    type="button"
                    disabled={disabled}
                    aria-pressed={value === state}
                    onClick={() => onChange(state)}
                    className={`px-2 py-1 rounded-lg text-[11px] border transition-all ${
                        value === state
                            ? state === 'OBSERVED'
                                ? 'bg-primary-500/30 border-primary-400 text-white'
                                : 'bg-white/15 border-white/30 text-white'
                            : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                    }`}
                >
                    {observationStateLabels[state]}
                </button>
            ))}
        </div>
    );
}

function DetailSelect<T extends string>({
    id,
    label,
    value,
    options,
    onChange,
}: {
    id: string;
    label: string;
    value: T | undefined;
    options: Record<T, string>;
    onChange: (next: T | undefined) => void;
}) {
    return (
        <label className="text-xs text-white/50 flex items-center gap-2" htmlFor={id}>
            {label}
            <select
                id={id}
                className="input-field !py-1 !px-2 !w-auto text-xs"
                value={value ?? ''}
                onChange={event => onChange((event.target.value || undefined) as T | undefined)}
            >
                <option value="">—</option>
                {(Object.entries(options) as Array<[T, string]>).map(([key, text]) => (
                    <option key={key} value={key}>
                        {text}
                    </option>
                ))}
            </select>
        </label>
    );
}

export function ObservationStep({
    sessions,
    onSessionsChange,
    locked = false,
}: {
    sessions: TestSession[];
    onSessionsChange: (next: TestSession[]) => void;
    /** 보관된 회차는 읽기 전용 */
    locked?: boolean;
}) {
    const showToast = useAppToast();
    const [activeId, setActiveId] = useState(sessions[0]?.id ?? '');
    const session = sessions.find(item => item.id === activeId) ?? sessions[0];

    const persist = async (next: TestSession) => {
        if (locked) return;
        onSessionsChange(sessions.map(item => (item.id === next.id ? next : item)));
        try {
            await saveSession(next);
        } catch (error) {
            showToast(error instanceof Error ? error.message : '저장하지 못했습니다.', 'error');
        }
    };

    if (!session) {
        return <p className="text-white/40 text-sm px-1">먼저 검사를 실시하세요.</p>;
    }

    const plugin = getTestPlugin(session.testPluginId);
    const candidates = createObservationCandidates(session);
    const now = () => new Date().toISOString();

    const decide = (key: string, decision: 'APPLIED' | 'EXCLUDED') => {
        const candidate = candidates.find(item => item.key === key);
        if (!candidate) return;
        const existing = session.observations.find(item => item.definitionId === candidate.definitionId);
        const observation = observationFromCandidate(candidate, {
            id: existing?.id ?? createId('veobs'),
            sessionId: session.id,
            now: now(),
            decision,
        });
        void persist(upsertObservation(session, observation, now()));
    };

    const setObservation = (definitionId: string, label: string, patch: Partial<Observation>) => {
        const existing = session.observations.find(item => item.definitionId === definitionId && !item.trialId);
        const observation: Observation = {
            id: existing?.id ?? createId('veobs'),
            testSessionId: session.id,
            definitionId,
            label,
            state: existing?.state ?? 'NOT_ASSESSED',
            detail: existing?.detail,
            memo: existing?.memo,
            evidenceEventIds: existing?.evidenceEventIds,
            candidateDecision: existing?.candidateDecision,
            createdAt: existing?.createdAt ?? now(),
            updatedAt: now(),
            ...patch,
        };
        void persist(upsertObservation(session, observation, now()));
    };

    const setDetail = (definitionId: string, label: string, patch: ObservationDetail) => {
        const existing = session.observations.find(item => item.definitionId === definitionId && !item.trialId);
        setObservation(definitionId, label, { detail: { ...existing?.detail, ...patch } });
    };

    const observationOf = (definitionId: string) =>
        session.observations.find(item => item.definitionId === definitionId && !item.trialId);

    return (
        <div className="space-y-4">
            {sessions.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    {sessions.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveId(item.id)}
                            aria-pressed={item.id === session.id}
                            className={`px-3 py-1.5 rounded-lg text-sm border ${
                                item.id === session.id
                                    ? 'bg-primary-500/30 border-primary-400 text-white'
                                    : 'bg-white/5 border-white/10 text-white/60'
                            }`}
                        >
                            {getTestPlugin(item.testPluginId).manifest.shortName}
                        </button>
                    ))}
                </div>
            )}

            <section className="glass-card !p-5">
                <h3 className="font-semibold text-white mb-1">사건에서 만든 후보</h3>
                <p className="text-xs text-white/40 mb-4">
                    검사 중 기록한 사건을 묶어 제안한 것입니다. 반영해야 관찰로 남고, 반영하지 않으면 보고서에 들어가지 않습니다.
                </p>
                {candidates.length === 0 ? (
                    <p className="text-sm text-white/40">기록된 사건에서 만들 수 있는 후보가 없습니다.</p>
                ) : (
                    <ul className="space-y-2">
                        {candidates.map(candidate => (
                            <li key={candidate.key} className="glass rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-sm text-white">{candidate.label}</p>
                                    <p className="text-xs text-white/40">
                                        {candidate.reason} {candidate.count}건 · 제안 빈도{' '}
                                        {observationFrequencyLabels[candidate.suggestedFrequency]}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {candidate.decision !== 'PENDING' && (
                                        <span className="text-xs text-white/50">
                                            {candidate.decision === 'APPLIED' ? '반영함' : '제외함'}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        className="btn-secondary !px-3 !py-1.5 text-xs"
                                        disabled={locked}
                                        onClick={() => decide(candidate.key, 'APPLIED')}
                                    >
                                        <Check size={14} className="inline mr-1" /> 반영
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-ghost text-xs"
                                        disabled={locked}
                                        onClick={() => decide(candidate.key, 'EXCLUDED')}
                                    >
                                        <X size={14} className="inline mr-1" /> 제외
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="glass-card !p-5">
                <h3 className="font-semibold text-white mb-1">행동관찰</h3>
                <p className="text-xs text-white/40 mb-4">
                    확인하지 못한 항목은 '확인하지 못함'으로 두세요. 비워 두면 보고서에서 '문제 없음'으로 읽힐 수 있습니다.
                </p>
                <div className="space-y-4">
                    {(['COMMON', 'TEST_SPECIFIC'] as const).map(category => (
                        <div key={category}>
                            <p className="text-xs text-white/40 mb-2">{category === 'COMMON' ? '공통' : plugin.manifest.shortName}</p>
                            <div className="space-y-1">
                                {plugin.observations
                                    .filter(definition => definition.category === category)
                                    .map(definition => {
                                        const observation = observationOf(definition.id);
                                        const state = observation?.state ?? 'NOT_ASSESSED';
                                        return (
                                            <div key={definition.id} className="border-b border-white/5 last:border-0 py-2">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="text-sm text-white/75">{definition.label}</span>
                                                    <StateButtons
                                                        label={definition.label}
                                                        disabled={locked}
                                                        value={state}
                                                        onChange={next => setObservation(definition.id, definition.label, { state: next })}
                                                    />
                                                </div>
                                                {state === 'OBSERVED' && (
                                                    <div className="flex flex-wrap gap-3 mt-2">
                                                        <DetailSelect
                                                            id={`${definition.id}-frequency`}
                                                            label="빈도"
                                                            value={observation?.detail?.frequency}
                                                            options={observationFrequencyLabels}
                                                            onChange={next => setDetail(definition.id, definition.label, { frequency: next })}
                                                        />
                                                        <DetailSelect
                                                            id={`${definition.id}-impact`}
                                                            label="영향"
                                                            value={observation?.detail?.impact}
                                                            options={observationImpactLabels}
                                                            onChange={next => setDetail(definition.id, definition.label, { impact: next })}
                                                        />
                                                        <DetailSelect
                                                            id={`${definition.id}-assistance`}
                                                            label="지원"
                                                            value={observation?.detail?.assistance}
                                                            options={observationAssistanceLabels}
                                                            onChange={next => setDetail(definition.id, definition.label, { assistance: next })}
                                                        />
                                                        <DetailSelect
                                                            id={`${definition.id}-recovery`}
                                                            label="회복"
                                                            value={observation?.detail?.recovery}
                                                            options={observationRecoveryLabels}
                                                            onChange={next => setDetail(definition.id, definition.label, { recovery: next })}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="glass-card !p-5">
                <h3 className="font-semibold text-white mb-1">검사조건</h3>
                <p className="text-xs text-white/40 mb-4">
                    표준절차대로 실시했는지, 추가 설명·휴식·통증 같은 조건이 있었는지 남깁니다. 검사조건만으로 능력을 판단하지 않습니다.
                </p>
                <div className="space-y-1">
                    {conditionDefinitions.map(([type, label]) => {
                        const condition = session.conditions.find(item => item.conditionType === type);
                        return (
                            <div
                                key={type}
                                className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 last:border-0 py-2"
                            >
                                <span className="text-sm text-white/75">{label}</span>
                                <StateButtons
                                    label={label}
                                    disabled={locked}
                                    value={condition?.state ?? 'NOT_ASSESSED'}
                                    onChange={next =>
                                        void persist(
                                            upsertCondition(
                                                session,
                                                {
                                                    id: condition?.id ?? createId('vecond'),
                                                    testSessionId: session.id,
                                                    conditionType: type,
                                                    label,
                                                    state: next,
                                                    memo: condition?.memo,
                                                    createdAt: condition?.createdAt ?? now(),
                                                    updatedAt: now(),
                                                },
                                                now(),
                                            ),
                                        )
                                    }
                                />
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
