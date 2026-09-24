import { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import {
    EVALUATION_GROUPS,
    evaluationTotals,
    type SupportedEmploymentCase,
    type SupportedEmploymentEvaluation,
} from '../../../features/supportedEmployment/model';
import { generateText } from '../../../services/gemini';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { useAppToast } from '../../../components/Toast';
import { buildOpinionPrompt, parseOpinionDraft } from './caseEditing';

interface Props {
    draft: SupportedEmploymentCase;
    onChange: (evaluation: SupportedEmploymentEvaluation) => void;
    /** 최신 소견 값을 기준으로 opinions만 바꾼다(AI 응답을 기다리는 동안 입력한 점수·소견을 잃지 않도록). */
    onOpinionsChange: (updater: (opinions: SupportedEmploymentEvaluation['opinions']) => SupportedEmploymentEvaluation['opinions']) => void;
    onBusyChange: (busy: boolean) => void;
}

const SCORES = [1, 2, 3, 4, 5];

/** 훈련생 종합 평가기록부(D-2 #4): 20개 항목 × 사전/현장 점수, 영역별 소견 4칸, 총점 자동 */
export function EvaluationSection({ draft, onChange, onOpinionsChange, onBusyChange }: Props) {
    const confirm = useConfirm();
    const showToast = useAppToast();
    const [generating, setGenerating] = useState(false);
    const requestRef = useRef(0);
    const evaluation = draft.evaluation;
    const totals = evaluationTotals(evaluation);
    // await 이후에는 렌더 당시의 evaluation이 오래된 값일 수 있으므로 최신 값을 ref로 본다.
    const latestOpinionsRef = useRef(evaluation.opinions);
    latestOpinionsRef.current = evaluation.opinions;

    useEffect(() => { onBusyChange(generating); }, [generating, onBusyChange]);
    // 다른 단계로 옮기거나 화면을 떠나면(회차를 바꾸면 편집 화면이 새로 그려집니다) 늦게 온 AI 응답을 버립니다.
    useEffect(() => () => { requestRef.current += 1; onBusyChange(false); }, [onBusyChange]);

    const setScore = (phase: 'pre' | 'field', index: number, value: string) => {
        const scores = [...evaluation[phase]];
        scores[index] = value ? Number(value) : null;
        onChange({ ...evaluation, [phase]: scores });
    };

    const handleDraft = async () => {
        if (generating) return;
        const request = ++requestRef.current;
        setGenerating(true);
        try {
            const text = await generateText('evaluation', buildOpinionPrompt(draft), undefined, {
                featureKey: 'workmate', documentType: 'supported-employment-opinion',
            });
            if (request !== requestRef.current) return;
            const parsed = parseOpinionDraft(text);
            const keys = EVALUATION_GROUPS.map(group => group.key).filter(key => parsed[key]);
            if (!keys.length) { showToast('AI 응답에서 영역별 소견을 찾지 못했습니다. 다시 시도해 주세요.', 'error'); return; }
            const overwriting = keys.filter(key => latestOpinionsRef.current[key].trim());
            if (overwriting.length) {
                const labels = EVALUATION_GROUPS.filter(group => overwriting.includes(group.key)).map(group => group.label).join(', ');
                const ok = await confirm({
                    title: '소견 덮어쓰기',
                    message: `이미 입력한 소견(${labels})이 AI 초안으로 바뀝니다. 계속할까요?`,
                    confirmLabel: '초안으로 바꾸기', cancelLabel: '취소', tone: 'danger',
                });
                if (!ok || request !== requestRef.current) return;
            }
            onOpinionsChange(current => {
                const opinions = { ...current };
                for (const key of keys) opinions[key] = parsed[key] || opinions[key];
                return opinions;
            });
            showToast('소견 초안을 채웠습니다. 내용을 확인한 뒤 저장해 주세요.', 'success');
        } catch (error) {
            if (request === requestRef.current) showToast(error instanceof Error ? error.message : 'AI 초안을 만들지 못했습니다.', 'error');
        } finally {
            if (request === requestRef.current) setGenerating(false);
        }
    };

    return <section className="glass-card !p-5" aria-labelledby="se-eval-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="se-eval-title" className="text-lg font-bold text-white">훈련생 종합 평가기록부</h3>
            <p className="text-sm text-white/80" aria-live="polite">
                총점 사전 {totals.pre}점 · 현장 {totals.field}점 (100점 만점)
                {(totals.missingPre || totals.missingField) ? <span className="text-amber-200"> · 미입력 사전 {totals.missingPre} / 현장 {totals.missingField}</span> : null}
            </p>
        </div>
        <p className="text-xs text-white/55 mt-1">점수는 1(매우 미흡)~5(매우 우수)입니다. 비워 둔 항목은 미입력으로 출력됩니다.</p>
        <div className="grid gap-4 mt-3 xl:grid-cols-2">
            {EVALUATION_GROUPS.map((group, groupIndex) => <fieldset key={group.key} className="rounded-xl border border-white/10 p-3">
                <legend className="px-1 text-sm font-bold text-white">{group.label}</legend>
                <table className="w-full text-sm">
                    <thead className="text-white/50 text-left"><tr>
                        <th scope="col" className="py-1 font-medium">항목</th>
                        <th scope="col" className="py-1 w-16 font-medium">사전</th>
                        <th scope="col" className="py-1 w-16 font-medium">현장</th>
                    </tr></thead>
                    <tbody>
                        {group.items.map((item, itemIndex) => {
                            const index = groupIndex * 5 + itemIndex;
                            return <tr key={item} className="border-t border-white/5">
                                <td className="py-1 pr-2 text-white/80">{item}</td>
                                {(['pre', 'field'] as const).map(phase => <td key={phase} className="py-1">
                                    <select aria-label={`${item} ${phase === 'pre' ? '사전' : '현장'} 점수`} className="input-field !py-1 !px-1 text-sm"
                                        value={evaluation[phase][index] ?? ''} onChange={e => setScore(phase, index, e.target.value)}>
                                        <option value="">-</option>
                                        {SCORES.map(score => <option key={score} value={score}>{score}</option>)}
                                    </select>
                                </td>)}
                            </tr>;
                        })}
                    </tbody>
                </table>
                <label className="block text-sm text-white/75 mt-2" htmlFor={`se-opinion-${group.key}`}>{group.label} 소견
                    <textarea id={`se-opinion-${group.key}`} className="textarea-field mt-1 text-sm" rows={3} maxLength={1000}
                        value={evaluation.opinions[group.key]}
                        onChange={e => onChange({ ...evaluation, opinions: { ...evaluation.opinions, [group.key]: e.target.value } })} />
                </label>
            </fieldset>)}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary !px-4 !py-2 text-sm flex items-center gap-2" onClick={() => void handleDraft()} disabled={generating} aria-busy={generating}>
                <Sparkles className="w-4 h-4" aria-hidden="true" /> {generating ? '소견 초안 작성 중...' : 'AI로 소견 초안'}
            </button>
            <span className="text-xs text-white/50">훈련일지 지도사항과 점수를 비식별화해 보내고, 결과는 칸에 채우기만 합니다(자동 저장하지 않음).</span>
        </div>
    </section>;
}
