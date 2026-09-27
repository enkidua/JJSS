/**
 * ⑥ 결과 분석 — 기존 "결과분석기"와 같은 방식.
 *
 * 회차에 모인 자료(KEAD 기록·공식 결과지·행동관찰·분석지)를 자동으로 연결해
 * 기존 결과분석기 엔진(services/gemini analyzeTestResults)에 그대로 전달하고,
 * 완성된 결과 해석 초안을 받아 평가사가 다듬는다. 근거 문장을 하나씩 고르게 하지 않는다.
 * 여기서 다듬은 내용은 ⑦ 종합소견 자동 작성의 입력으로 그대로 쓰인다.
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Sparkles } from 'lucide-react';
import {
    analysisSourceHash,
    buildObservationNarrative,
    buildOpinionReference,
    analysisTitle,
    getTestPlugin,
    isResultAnalysisCurrent,
    selectActiveSourceDocument,
    type AnalysisDocumentRecord,
    type EvaluationEpisode,
    type SourceDocumentRecord,
    type TestSession,
} from '../../../features/vocationalEvaluation';
import { analyzeTestResults } from '../../../services/gemini';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { useAppToast } from '../../../components/Toast';
import { useDataStore } from '../../../store/dataStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { getSeekerKey } from '../../../utils/seeker';

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function ResultAnalysisSection({
    episode,
    sessions,
    documents,
    analyses,
    onEpisodeChange,
    locked = false,
}: {
    episode: EvaluationEpisode;
    sessions: TestSession[];
    documents: SourceDocumentRecord[];
    analyses: AnalysisDocumentRecord[];
    onEpisodeChange: (next: EvaluationEpisode) => void;
    locked?: boolean;
}) {
    const [busy, setBusy] = useState(false);
    const confirm = useConfirm();
    const showToast = useAppToast();
    const seekers = useDataStore(state => state.seekers);
    const hasAIKey = useSettingsStore(state =>
        state.settings.llmConfigs.some(config => config.provider === 'gemini' && config.apiKey.trim().length > 0),
    );
    const seeker = useMemo(
        () => seekers.find(item => getSeekerKey(item) === episode.seekerId) as Record<string, unknown> | undefined,
        [seekers, episode.seekerId],
    );

    // 자동으로 연결된 자료 목록 — 평가사가 무엇이 분석에 들어가는지 한눈에 본다.
    const materials = useMemo(() => {
        const items: Array<{ label: string; ok: boolean }> = [];
        for (const session of sessions) {
            const document = selectActiveSourceDocument(documents, session.id);
            items.push({
                label: `${getTestPlugin(session.testPluginId).manifest.shortName}${document ? ' + 공식 결과지' : ''}`,
                ok: true,
            });
        }
        const observationCount = sessions.reduce(
            (total, session) => total + session.observations.filter(item => buildObservationNarrative(item)).length,
            0,
        );
        if (observationCount) items.push({ label: `행동관찰 ${observationCount}건`, ok: true });
        for (const record of analyses) {
            if (record.extractionStatus === 'FAILED') continue;
            items.push({ label: analysisTitle(record), ok: true });
        }
        if (episode.disabilityHistory.trim() || episode.careerHistory.trim()) {
            items.push({ label: '① 기본정보(이력·경력)', ok: true });
        }
        return items;
    }, [sessions, documents, analyses, episode]);

    const profile = useMemo(
        () => ({
            birthDate: text(seeker?.birthDate),
            sex: text(seeker?.gender) || text(seeker?.sex),
            disability: [text(seeker?.disabilityType), text(seeker?.disabilityGrade)].filter(Boolean).join(' '),
            desiredJobs: [text(seeker?.desiredJob1), text(seeker?.desiredJob2)].filter(Boolean).join(', '),
        }),
        [seeker],
    );
    // 지금 자료 기준의 지문. 저장된 분석의 지문과 다르면 그 분석은 이전 자료 기준(STALE)이다.
    const currentHash = useMemo(
        () => analysisSourceHash({ episode, sessions, documents, analyses, profile }),
        [episode, sessions, documents, analyses, profile],
    );
    const stale = Boolean(episode.resultAnalysis) && !isResultAnalysisCurrent(episode.resultAnalysis, currentHash);

    const handleAnalyze = async () => {
        if (busy || locked) return;
        if (episode.resultAnalysis?.editedAt) {
            const ok = await confirm({
                title: '결과 분석을 새로 받을까요?',
                message: '직접 고치신 분석 내용이 새 분석으로 바뀝니다.',
                confirmLabel: '새로 분석',
            });
            if (!ok) return;
        }
        setBusy(true);
        try {
            const reference = buildOpinionReference({
                episode,
                sessions,
                documents,
                analyses,
                includeResultAnalysis: false,
                profile,
            });
            const result = await analyzeTestResults([], reference, { knownNames: [episode.seekerName, episode.evaluator] });
            onEpisodeChange({
                ...episode,
                resultAnalysis: { text: result, generatedAt: new Date().toISOString(), sourceHash: currentHash },
            });
            showToast('결과 분석 초안을 받았습니다. 검토하고 필요한 부분을 고쳐 주세요.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : '결과 분석을 받지 못했습니다.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handleEdit = (value: string) => {
        if (!episode.resultAnalysis) return;
        onEpisodeChange({
            ...episode,
            resultAnalysis: { ...episode.resultAnalysis, text: value, editedAt: new Date().toISOString() },
        });
    };

    return (
        <section className="glass-card !p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-semibold text-white">결과 분석</h3>
                    <p className="text-xs text-white/45 mt-1">
                        아래 자료를 자동으로 연결해 완성된 결과 해석을 받습니다. 고친 내용은 ⑦ 종합소견에 그대로 쓰입니다.
                    </p>
                </div>
                {!locked && (
                    <button type="button" className="btn-primary !px-4 !py-2 text-sm" disabled={busy} onClick={() => void handleAnalyze()}>
                        {busy ? <Loader2 size={14} className="inline mr-1 animate-spin" /> : <Sparkles size={14} className="inline mr-1" />}
                        {busy ? '분석 중…' : episode.resultAnalysis ? '다시 분석하기' : '결과 분석하기'}
                    </button>
                )}
            </div>
            <ul className="flex flex-wrap gap-2" aria-label="자동으로 연결된 자료">
                {materials.length ? (
                    materials.map(item => (
                        <li key={item.label} className="glass rounded-lg px-2.5 py-1 text-xs text-white/70 inline-flex items-center gap-1">
                            <Check size={11} className="text-emerald-300" /> {item.label}
                        </li>
                    ))
                ) : (
                    <li className="text-xs text-white/40">아직 연결할 자료가 없습니다. 먼저 검사·결과지·분석지를 채워 주세요.</li>
                )}
            </ul>
            <p className="text-[11px] text-white/35">
                이름·연락처는 가려서 보내고 원본 파일은 보내지 않습니다. 자료에 없는 수치·판단은 만들지 않도록 지시합니다.
            </p>
            {!hasAIKey && !locked && (
                <p className="text-xs text-amber-200/80">설정에서 Gemini API 키를 등록하면 결과 분석을 쓸 수 있습니다.</p>
            )}
            {stale && !busy && (
                <div className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2" role="status">
                    <p className="text-sm text-amber-100 inline-flex items-center gap-1.5">
                        <AlertTriangle size={14} />
                        평가자료가 변경되었습니다. 현재 결과 분석은 이전 자료를 기준으로 작성되었습니다.
                    </p>
                    {!locked && (
                        <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={() => void handleAnalyze()}>
                            다시 분석하기
                        </button>
                    )}
                </div>
            )}
            {episode.resultAnalysis && (
                <div className="space-y-1">
                    <textarea
                        className="textarea-field font-normal"
                        rows={14}
                        aria-label="결과 분석 내용"
                        disabled={locked || busy}
                        value={episode.resultAnalysis.text}
                        onChange={event => handleEdit(event.target.value)}
                    />
                    <p className="text-[11px] text-white/35">
                        AI 초안 {new Date(episode.resultAnalysis.generatedAt).toLocaleString('ko-KR')}
                        {episode.resultAnalysis.editedAt
                            ? ` · 평가사 수정 ${new Date(episode.resultAnalysis.editedAt).toLocaleString('ko-KR')}`
                            : ' · 반드시 검토·수정해 주세요'}
                    </p>
                </div>
            )}
        </section>
    );
}
