import { conditionSummaries, type TestSession, type Trial } from '../../../features/vocationalEvaluation';

const STATUS_STYLES: Record<string, string> = {
    PENDING: 'bg-white/5 border-white/10 text-white/40',
    READY: 'bg-white/10 border-white/20 text-white/80',
    RUNNING: 'bg-primary-500/30 border-primary-400 text-white',
    PAUSED: 'bg-amber-500/20 border-amber-400/40 text-amber-100',
    INTERRUPTED: 'bg-rose-500/20 border-rose-400/40 text-rose-100',
    FINISHED: 'bg-white/10 border-primary-400/50 text-white',
    CONFIRMED: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100',
    SKIPPED: 'bg-white/5 border-white/10 text-white/30 line-through',
};

/** 21시행을 조건별로 묶어 보여 준다. 조건 점수는 실시한 회차의 평균이다. */
export function TrialRail({
    session,
    onSelect,
}: {
    session: TestSession;
    onSelect: (trialId: string) => void;
}) {
    const summaries = conditionSummaries(session);
    const byCondition = new Map<string, Trial[]>();
    for (const trial of session.trials) {
        const key = `${trial.size}.${trial.handMode}`;
        byCondition.set(key, [...(byCondition.get(key) ?? []), trial]);
    }
    return (
        <div className="space-y-2">
            {summaries.map(summary => {
                const trials = (byCondition.get(summary.key) ?? []).sort((a, b) => a.trialNumber - b.trialNumber);
                return (
                    <div key={summary.key} className="glass rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-sm text-white/80">{summary.label}</span>
                            <span className="text-sm tabular-nums text-white/60">
                                {summary.average === null ? '—' : `평균 ${summary.average}`}
                                {summary.executedCount > 0 && summary.executedCount < trials.length && (
                                    <span className="text-white/40"> ({summary.executedCount}회 실시)</span>
                                )}
                            </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {trials.map(trial => (
                                <button
                                    key={trial.id}
                                    type="button"
                                    onClick={() => onSelect(trial.id)}
                                    aria-current={trial.id === session.currentTrialId}
                                    className={`px-2 py-2 rounded-lg border text-xs transition-all ${STATUS_STYLES[trial.status] ?? ''} ${
                                        trial.id === session.currentTrialId ? 'ring-2 ring-primary-400' : ''
                                    }`}
                                >
                                    <span className="block">{trial.trialNumber}차</span>
                                    <span className="block font-bold tabular-nums text-base">
                                        {trial.status === 'SKIPPED' ? '미실시' : (trial.score ?? '—')}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
