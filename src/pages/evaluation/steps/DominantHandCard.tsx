/**
 * 우세손 판정 카드. 실시요강 표4-5(질문 3문항) → 표4-6(평가용지 18문항) 순서를 그대로 따른다.
 * 손기능 검사가 우세손·비우세손 조건으로 나뉘므로 검사 전에 끝내야 한다.
 */
import {
    DOMINANT_HAND_FORM_ITEMS,
    DOMINANT_HAND_FORM_THRESHOLD,
    DOMINANT_HAND_QUESTIONS,
    DOMINANT_HAND_LABELS,
    resolveDominantHand,
    type DominantHand,
    type DominantHandAssessment,
    type HandAnswer,
} from '../../../features/vocationalEvaluation';

const ANSWER_OPTIONS: Array<{ value: HandAnswer; label: string }> = [
    { value: 'RIGHT', label: '오른손' },
    { value: 'LEFT', label: '왼손' },
    { value: 'EITHER', label: '양손/무관' },
];

function AnswerRow({
    label,
    value,
    onChange,
    disabled,
}: {
    label: string;
    value: HandAnswer;
    onChange: (next: HandAnswer) => void;
    disabled?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5 last:border-0">
            <span className="text-sm text-white/70">{label}</span>
            <div className="flex gap-1 shrink-0" role="group" aria-label={label}>
                {ANSWER_OPTIONS.map(option => (
                    <button
                        key={String(option.value)}
                        type="button"
                        disabled={disabled}
                        aria-pressed={value === option.value}
                        onClick={() => onChange(value === option.value ? null : option.value)}
                        className={`px-2.5 py-1 rounded-lg text-xs border transition-all ${
                            value === option.value
                                ? 'bg-primary-500/30 border-primary-400 text-white'
                                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function DominantHandCard({
    assessment,
    onChange,
    disabled,
}: {
    assessment: DominantHandAssessment;
    onChange: (next: DominantHandAssessment) => void;
    disabled?: boolean;
}) {
    const result = resolveDominantHand(assessment);
    const formStarted = Object.keys(assessment.form).length > 0;
    const showForm = result.needsForm || formStarted;

    return (
        <section className="glass-card !p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold text-white">우세손 판정</h3>
                <span className="badge">{DOMINANT_HAND_LABELS[result.hand]}</span>
            </div>
            <p className="text-xs text-white/40">{result.explanation}</p>

            <div>
                <p className="text-sm text-white/70 mb-1">질문 3문항</p>
                {DOMINANT_HAND_QUESTIONS.map(question => (
                    <AnswerRow
                        key={question.id}
                        label={question.label}
                        value={assessment.questions[question.id] ?? null}
                        disabled={disabled}
                        onChange={next =>
                            onChange({ ...assessment, questions: { ...assessment.questions, [question.id]: next } })
                        }
                    />
                ))}
            </div>

            {showForm && (
                <div>
                    <p className="text-sm text-white/70 mb-1">
                        평가용지 18문항 — 한 손이 {DOMINANT_HAND_FORM_THRESHOLD}개 이상이면 그 손으로 결정합니다
                    </p>
                    <div className="max-h-72 overflow-auto pr-1">
                        {DOMINANT_HAND_FORM_ITEMS.map(item => (
                            <AnswerRow
                                key={item.id}
                                label={item.label}
                                value={assessment.form[item.id] ?? null}
                                disabled={disabled}
                                onChange={next => onChange({ ...assessment, form: { ...assessment.form, [item.id]: next } })}
                            />
                        ))}
                    </div>
                    <p className="text-xs text-white/40 mt-2">
                        오른손 {result.counts.right} · 왼손 {result.counts.left} · 양손/무관 {result.counts.either}
                    </p>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="ve-hand-override" className="text-sm text-white/60">
                    평가사 직접 지정
                </label>
                <select
                    id="ve-hand-override"
                    className="input-field !w-auto !py-2"
                    disabled={disabled}
                    value={assessment.override ?? ''}
                    onChange={event =>
                        onChange({
                            ...assessment,
                            override: event.target.value ? (event.target.value as DominantHand) : undefined,
                        })
                    }
                >
                    <option value="">사용 안 함</option>
                    <option value="RIGHT">오른손</option>
                    <option value="LEFT">왼손</option>
                    <option value="AMBIDEXTROUS">양손잡이</option>
                </select>
                {result.hand === 'AMBIDEXTROUS' && (
                    <span className="text-xs text-white/40">양손잡이는 채점에서 오른손을 우세손으로 봅니다.</span>
                )}
            </div>

            <div>
                <label htmlFor="ve-hand-note" className="text-sm text-white/60">
                    판정 메모
                </label>
                <input
                    id="ve-hand-note"
                    className="input-field mt-1"
                    disabled={disabled}
                    value={assessment.note ?? ''}
                    onChange={event => onChange({ ...assessment, note: event.target.value })}
                    placeholder="예: 왼손 사용 이력 있음"
                />
            </div>
        </section>
    );
}
