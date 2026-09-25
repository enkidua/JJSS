/** 회차 기본정보. 보고서 머리 부분(평가실시기관·의뢰요청기관·평가유형·욕구 체크)과 같은 항목을 쓴다. */
import {
    EPISODE_NEED_KEYS,
    EPISODE_NEED_LABELS,
    EVALUATION_VENUE_LABELS,
    type EvaluationEpisode,
    type EvaluationVenue,
} from '../../../features/vocationalEvaluation';
import { DominantHandCard } from './DominantHandCard';

export function BasicInfoStep({
    episode,
    onChange,
    disabled,
}: {
    episode: EvaluationEpisode;
    onChange: (next: EvaluationEpisode) => void;
    disabled?: boolean;
}) {
    const field = <K extends keyof EvaluationEpisode>(key: K, value: EvaluationEpisode[K]) =>
        onChange({ ...episode, [key]: value });

    return (
        <div className="space-y-4">
            <section className="glass-card !p-5 space-y-4">
                <h3 className="font-semibold text-white">기본정보</h3>
                <div className="grid md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="ve-title" className="text-sm text-white/60">
                            회차 제목
                        </label>
                        <input
                            id="ve-title"
                            className="input-field mt-1"
                            disabled={disabled}
                            value={episode.title}
                            onChange={event => field('title', event.target.value)}
                            placeholder="예: 2026년 상반기 직업평가"
                        />
                    </div>
                    <div>
                        <label htmlFor="ve-date" className="text-sm text-white/60">
                            평가일
                        </label>
                        <input
                            id="ve-date"
                            type="date"
                            className="input-field mt-1"
                            disabled={disabled}
                            value={episode.evaluationDate}
                            onChange={event => field('evaluationDate', event.target.value)}
                        />
                    </div>
                    <div>
                        <label htmlFor="ve-org" className="text-sm text-white/60">
                            평가실시기관
                        </label>
                        <input
                            id="ve-org"
                            className="input-field mt-1"
                            disabled={disabled}
                            value={episode.evaluationOrganization}
                            onChange={event => field('evaluationOrganization', event.target.value)}
                        />
                    </div>
                    <div>
                        <label htmlFor="ve-referral" className="text-sm text-white/60">
                            의뢰요청기관
                        </label>
                        <input
                            id="ve-referral"
                            className="input-field mt-1"
                            disabled={disabled}
                            value={episode.referralOrganization}
                            onChange={event => field('referralOrganization', event.target.value)}
                        />
                    </div>
                    <div>
                        <label htmlFor="ve-venue" className="text-sm text-white/60">
                            평가유형
                        </label>
                        <select
                            id="ve-venue"
                            className="input-field mt-1"
                            disabled={disabled}
                            value={episode.venue}
                            onChange={event => field('venue', event.target.value as EvaluationVenue)}
                        >
                            {Object.entries(EVALUATION_VENUE_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="ve-evaluator" className="text-sm text-white/60">
                            직업평가사
                        </label>
                        <input
                            id="ve-evaluator"
                            className="input-field mt-1"
                            disabled={disabled}
                            value={episode.evaluator}
                            onChange={event => field('evaluator', event.target.value)}
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="ve-purpose" className="text-sm text-white/60">
                        평가목적
                    </label>
                    <textarea
                        id="ve-purpose"
                        className="textarea-field mt-1"
                        rows={3}
                        disabled={disabled}
                        value={episode.purpose}
                        onChange={event => field('purpose', event.target.value)}
                        placeholder="의뢰 사유와 이번 평가로 확인하려는 것"
                    />
                </div>

                <div>
                    <p className="text-sm text-white/60 mb-2">욕구</p>
                    <div className="flex flex-wrap gap-2">
                        {EPISODE_NEED_KEYS.map(key => (
                            <button
                                key={key}
                                type="button"
                                disabled={disabled}
                                aria-pressed={episode.needs[key]}
                                onClick={() => onChange({ ...episode, needs: { ...episode.needs, [key]: !episode.needs[key] } })}
                                className={`px-3 py-1.5 rounded-lg text-sm border transition-all ${
                                    episode.needs[key]
                                        ? 'bg-primary-500/30 border-primary-400 text-white'
                                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                }`}
                            >
                                {EPISODE_NEED_LABELS[key]}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <DominantHandCard
                assessment={episode.dominantHandAssessment}
                disabled={disabled}
                onChange={next => onChange({ ...episode, dominantHandAssessment: next })}
            />
        </div>
    );
}
