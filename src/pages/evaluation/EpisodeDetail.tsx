/** 평가 회차 상세. 단계 레일을 따라 기본정보 → 검사 실시 → 행동관찰 → 원자료 요약으로 진행한다. */
import { useCallback, useRef, useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import {
    EPISODE_STATUS_LABELS,
    type EpisodeStatus,
    type EvaluationEpisode,
    type EvaluationReport,
    type SourceDocumentRecord,
    type TestSession,
} from '../../features/vocationalEvaluation';
import { saveEpisode } from '../../features/vocationalEvaluation/storage';
import { useAppToast } from '../../components/Toast';
import { useSaveQueue } from './useSaveQueue';
import { BasicInfoStep } from './steps/BasicInfoStep';
import { ObservationStep } from './steps/ObservationStep';
import { InterpretationStep } from './steps/InterpretationStep';
import { ReportStep } from './steps/ReportStep';
import { SourceDocumentStep } from './steps/SourceDocumentStep';
import { SummaryStep } from './steps/SummaryStep';
import { TestStep } from './steps/TestStep';

const STEPS = [
    { id: 'basic', label: '① 기본정보' },
    { id: 'tests', label: '② 검사 실시' },
    { id: 'observation', label: '③ 행동관찰' },
    { id: 'summary', label: '④ 원자료 요약' },
    { id: 'source', label: '⑤ 결과지 가져오기' },
    { id: 'interpretation', label: '⑥ 해석' },
    { id: 'report', label: '⑦ 보고서' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

const SAVE_DEBOUNCE_MS = 650;

export function EpisodeDetail({
    episode: initial,
    sessions: initialSessions,
    sourceDocuments: initialSourceDocuments,
    reports: initialReports,
    onBack,
    onEpisodeSaved,
}: {
    episode: EvaluationEpisode;
    sessions: TestSession[];
    sourceDocuments: SourceDocumentRecord[];
    reports: EvaluationReport[];
    onBack: () => void;
    onEpisodeSaved: (episode: EvaluationEpisode) => void;
}) {
    const [episode, setEpisode] = useState(initial);
    const [sessions, setSessions] = useState(initialSessions);
    const [sourceDocuments, setSourceDocuments] = useState(initialSourceDocuments);
    const [reports, setReports] = useState(initialReports);
    const [step, setStep] = useState<StepId>('basic');
    const showToast = useAppToast();
    const savedRef = useRef(onEpisodeSaved);
    savedRef.current = onEpisodeSaved;

    // 저장은 큐로 한 줄로 세우고, 지연 저장은 화면을 떠날 때 반드시 흘려보낸다.
    const queue = useSaveQueue<EvaluationEpisode>(
        async next => {
            const saved = await saveEpisode(next);
            savedRef.current(saved);
        },
        message => showToast(message, 'error'),
    );
    const saving = queue.saveState === 'SAVING';

    const updateEpisode = useCallback(
        (next: EvaluationEpisode) => {
            setEpisode(next);
            queue.saveDebounced(next, SAVE_DEBOUNCE_MS);
        },
        [queue],
    );

    const leave = useCallback(async () => {
        await queue.flush();
        onBack();
    }, [queue, onBack]);

    const locked = episode.status === 'ARCHIVED';

    return (
        <div className="space-y-4">
            <header className="glass-card !p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <button type="button" className="btn-ghost" onClick={() => void leave()} aria-label="회차 목록으로">
                            <ArrowLeft size={18} />
                        </button>
                        <div>
                            <h2 className="text-lg font-bold text-white">{episode.title}</h2>
                            <p className="text-xs text-white/40">
                                {episode.seekerName || '이용자 미연결'} · {episode.evaluationDate || '평가일 미입력'}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {saving && (
                            <span className="text-xs text-white/50">
                                <Save size={12} className="inline mr-1" /> 저장 중…
                            </span>
                        )}
                        <select
                            className="input-field !w-auto !py-2 text-sm"
                            aria-label="회차 상태"
                            value={episode.status}
                            onChange={event => updateEpisode({ ...episode, status: event.target.value as EpisodeStatus })}
                        >
                            {Object.entries(EPISODE_STATUS_LABELS).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </header>

            {locked && (
                <p className="glass rounded-xl p-3 text-sm text-white/60">
                    보관된 회차입니다. 모든 단계가 읽기 전용입니다. 상단 상태를 바꾸면 다시 수정할 수 있습니다.
                </p>
            )}

            <nav className="flex flex-wrap gap-2" aria-label="평가 단계">
                {STEPS.map(item => (
                    <button
                        key={item.id}
                        type="button"
                        aria-current={step === item.id}
                        onClick={() => {
                            void queue.flush();
                            setStep(item.id);
                        }}
                        className={`px-4 py-2 rounded-xl text-sm border transition-all ${
                            step === item.id
                                ? 'bg-primary-500/30 border-primary-400 text-white'
                                : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>

            {step === 'basic' && <BasicInfoStep episode={episode} onChange={updateEpisode} disabled={locked} />}
            {step === 'tests' && (
                <TestStep
                    episode={episode}
                    sessions={sessions}
                    onEpisodeChange={updateEpisode}
                    onSessionsChange={setSessions}
                    documents={sourceDocuments}
                    locked={locked}
                />
            )}
            {step === 'observation' && (
                <ObservationStep sessions={sessions} onSessionsChange={setSessions} locked={locked} />
            )}
            {step === 'summary' && <SummaryStep episode={episode} sessions={sessions} />}
            {step === 'interpretation' && (
                <InterpretationStep
                    episode={episode}
                    sessions={sessions}
                    documents={sourceDocuments}
                    onEpisodeChange={updateEpisode}
                    locked={locked}
                />
            )}
            {step === 'report' && (
                <ReportStep
                    episode={episode}
                    sessions={sessions}
                    documents={sourceDocuments}
                    reports={reports}
                    onReportsChange={setReports}
                    onEpisodeChange={updateEpisode}
                    locked={locked}
                />
            )}
            {step === 'source' && (
                <SourceDocumentStep
                    episode={episode}
                    sessions={sessions}
                    documents={sourceDocuments}
                    onDocumentsChange={setSourceDocuments}
                    locked={locked}
                />
            )}
        </div>
    );
}
