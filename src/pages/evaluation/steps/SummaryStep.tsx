/**
 * 원자료 요약. 공단 프로그램에 그대로 옮겨 입력할 수 있는 형태로 정리한다.
 * 앱은 백분위를 계산하지 않는다 — 규준 해석은 공단 프로그램이 만든 공식 결과지를 따른다.
 */
import {
    COMPONENT_KEYS,
    DOMINANT_HAND_LABELS,
    buildObservationNarrative,
    conditionSummaries,
    getTestPlugin,
    observationSemanticDescription,
    tallyEvents,
    totalCompleted,
    totalMaximum,
    type EvaluationEpisode,
    type TestSession,
} from '../../../features/vocationalEvaluation';
import { CopyButton } from '../../../components/common/CopyButton';

function handFunctionText(session: TestSession): string {
    return conditionSummaries(session)
        .map(summary => {
            const scores = summary.scores.map(score => (score === null ? '미실시' : String(score))).join(' / ');
            const average = summary.average === null ? '—' : String(summary.average);
            const note = summary.executedCount > 0 && summary.executedCount < summary.scores.length ? ` (${summary.executedCount}회 실시 평균)` : '';
            return `${summary.label}: ${scores} → 평균 ${average}${note}`;
        })
        .join('\n');
}

function bimanualText(session: TestSession): string {
    const state = session.bimanual;
    if (!state) return '';
    const lines = COMPONENT_KEYS.map(key => {
        const spec = state.specification.components.find(item => item.key === key);
        if (!spec) return '';
        return `${spec.label}: ${state.attempt.result.components[key] ?? '—'} / ${spec.maximum}`;
    }).filter(Boolean);
    const recorded = state.attempt.result.recordedDurationMs;
    lines.push(`총합: ${totalCompleted(state.attempt.result)} / ${totalMaximum(state.specification)}`);
    if (recorded !== undefined) lines.push(`기록시간: ${Math.round(recorded / 1000)}초`);
    return lines.join('\n');
}

export function SummaryStep({ episode, sessions }: { episode: EvaluationEpisode; sessions: TestSession[] }) {
    if (!sessions.length) {
        return <p className="text-white/40 text-sm px-1">먼저 검사를 실시하세요.</p>;
    }

    return (
        <div className="space-y-4">
            <section className="glass-card !p-5">
                <h3 className="font-semibold text-white mb-2">회차 정보</h3>
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                        <dt className="text-white/50">평가일</dt>
                        <dd className="text-white/80">{episode.evaluationDate || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-white/50">우세손</dt>
                        <dd className="text-white/80">{DOMINANT_HAND_LABELS[episode.dominantHand]}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-white/50">직업평가사</dt>
                        <dd className="text-white/80">{episode.evaluator || '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                        <dt className="text-white/50">평가실시기관</dt>
                        <dd className="text-white/80">{episode.evaluationOrganization || '—'}</dd>
                    </div>
                </dl>
            </section>

            {sessions.map(session => {
                const plugin = getTestPlugin(session.testPluginId);
                const raw = session.bimanual ? bimanualText(session) : handFunctionText(session);
                const events = tallyEvents(session, session.bimanual ? session.bimanual.attempt.id : undefined);
                const observed = session.observations.filter(item => item.state === 'OBSERVED');
                const conditions = session.conditions.filter(item => item.state === 'OBSERVED');
                return (
                    <section key={session.id} className="glass-card !p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold text-white">{plugin.manifest.name}</h3>
                            <CopyButton text={raw} label="원자료 복사" />
                        </div>
                        <pre className="text-sm text-white/80 whitespace-pre-wrap font-sans bg-black/20 rounded-xl p-4">{raw}</pre>

                        {session.bimanual === undefined && (
                            <p className="text-xs text-white/40">
                                조건 점수는 실시한 회차의 평균입니다(실시요강 부록1). 미실시한 회차는 평균에서 뺐습니다.
                            </p>
                        )}

                        {events.length > 0 && (
                            <div>
                                <p className="text-sm text-white/70 mb-2">기록된 사건</p>
                                <ul className="text-sm text-white/60 space-y-1">
                                    {events.map(item => (
                                        <li key={item.eventType}>
                                            · {item.label} {item.count}건
                                            {item.scoreEffect && (
                                                <span className="text-white/40">
                                                    {' '}
                                                    ({item.scoreEffect === 'INCLUDE' ? '수행량 포함' : '수행량 제외'})
                                                </span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {observed.length > 0 && (
                            <div>
                                <p className="text-sm text-white/70 mb-2">관찰된 행동</p>
                                <ul className="text-sm text-white/60 space-y-1">
                                    {observed.map(item => (
                                        <li key={item.id}>
                                            · {buildObservationNarrative(item)?.text ?? item.label}
                                            <span className="block text-xs text-white/35 pl-3">{observationSemanticDescription(item)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {conditions.length > 0 && (
                            <div>
                                <p className="text-sm text-white/70 mb-2">검사조건</p>
                                <p className="text-sm text-white/60">{conditions.map(item => item.label).join(' · ')}</p>
                            </div>
                        )}

                        {session.sessionNote && (
                            <div>
                                <p className="text-sm text-white/70 mb-1">검사 메모</p>
                                <p className="text-sm text-white/60 whitespace-pre-wrap">{session.sessionNote}</p>
                            </div>
                        )}
                    </section>
                );
            })}

            <p className="text-xs text-white/40 px-1">
                이 값을 공단 검사해석 프로그램에 입력하면 공식 결과지가 만들어집니다. 다음 단계에서 그 결과지를 가져와 해석·보고서에 씁니다.
            </p>
        </div>
    );
}
