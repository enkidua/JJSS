/**
 * 보고서 단계 — 소견서를 "쓰는" 곳이 아니라 "다듬는" 곳이 되게 한다.
 *
 *  - 머리 정보·평가목적: ① 기본정보와 이용자 정보에서 자동으로 가져온다(여기서 다시 입력하지 않는다).
 *  - 평가 도구: 실시한 KEAD 검사와 ⑤에서 넣은 분석지 제목으로 자동으로 채운다.
 *  - 종합소견 및 직업재활방향: 모인 재료를 정리해 AI가 항목별 초안을 쓰고, 평가사가 다듬는다.
 *  - AI가 전혀 없어도 직접 서술만으로 보고서를 완결할 수 있다.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { FileDown, FileText, Lock, PencilLine, Plus, RefreshCw, Sparkles } from 'lucide-react';
import {
    analysisSourceHash,
    applyOpinion,
    buildOpinionReference,
    isResultAnalysisCurrent,
    buildResultTables,
    composeSections,
    composeSummaryDraft,
    confirmReport,
    createNextVersion,
    createReport,
    fillToolRows,
    isLocked,
    adoptedClaims,
    buildObservationNarrative,
    parseOpinionText,
    selectCurrentRun,
    EVALUATION_VENUE_LABELS,
    EPISODE_NEED_KEYS,
    EPISODE_NEED_LABELS,
    type AnalysisDocumentRecord,
    type EvaluationEpisode,
    type EvaluationReport,
    type InterpretationRun,
    type ReportHeader,
    type SourceDocumentRecord,
    type TestSession,
} from '../../../features/vocationalEvaluation';
import { buildReportDocx, buildReportHtml, reportFileName } from '../../../features/vocationalEvaluation/report/document';
import { refreshRunStaleness } from '../../../features/vocationalEvaluation/interpretation/staleness';
import { packDocument } from '../../../features/docx/blocks';
import { saveReport } from '../../../features/vocationalEvaluation/storage';
import { analyzeTestResults, generateReport } from '../../../services/gemini';
import { saveJjssBlob, saveJjssPdf, savedLocationMessage } from '../../../utils/jjssFileService';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { useAppToast } from '../../../components/Toast';
import { useDataStore } from '../../../store/dataStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { useSaveQueue } from '../useSaveQueue';
import { localDateKey } from '../../../utils/date';
import { getSeekerKey } from '../../../utils/seeker';

const SAVE_DEBOUNCE_MS = 650;

/** 종합소견 칸(서식 순서). AI 초안이 이 칸들로 나뉘어 들어간다. */
const OPINION_FIELDS = [
    ['vocationalLevel', '직업수준', 2],
    ['goalSelf', '직업목표(당사자)', 2],
    ['goalGuardian', '직업목표(보호자·지원자)', 2],
    ['strengths', '직업적 강점', 4],
    ['limitations', '제한점·고려사항', 4],
    ['supportNeeds', '지원이 필요한 사항', 5],
    ['recommendation', '추천직무 및 권고프로그램', 4],
    ['recommendedPrograms', '추천직무 세부정보', 4],
    ['overallOpinion', '종합소견', 5],
] as const;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** 머리 정보를 ① 기본정보(회차)와 이용자 정보에서 만든다. 보고서에서 다시 입력하지 않는다. */
function buildHeaderFrom(episode: EvaluationEpisode, seeker: Record<string, unknown> | undefined): ReportHeader {
    return {
        evaluationOrganization: episode.evaluationOrganization,
        referralOrganization: episode.referralOrganization,
        evaluationDate: episode.evaluationDate,
        venue: episode.venue,
        seekerName: episode.seekerName,
        birthDate: text(seeker?.birthDate),
        contact: text(seeker?.phone) || text(seeker?.contact),
        address: text(seeker?.address),
        disability: [text(seeker?.disabilityType), text(seeker?.disabilityGrade)].filter(Boolean).join(' '),
        sex: text(seeker?.gender) || text(seeker?.sex),
        needs: episode.needs,
    };
}

export function ReportStep({
    episode,
    sessions,
    documents,
    analyses,
    reports,
    onReportsChange,
    onEpisodeChange,
    onGoToBasic,
    locked: episodeLocked = false,
}: {
    episode: EvaluationEpisode;
    sessions: TestSession[];
    documents: SourceDocumentRecord[];
    analyses: AnalysisDocumentRecord[];
    reports: EvaluationReport[];
    onReportsChange: (next: EvaluationReport[]) => void;
    onEpisodeChange: (next: EvaluationEpisode) => void;
    /** 머리 정보를 고치러 ① 기본정보로 이동 */
    onGoToBasic?: () => void;
    /** 회차가 보관(ARCHIVED) 상태면 보고서도 읽기 전용이다 */
    locked?: boolean;
}) {
    const seekers = useDataStore(state => state.seekers);
    const hasAIKey = useSettingsStore(state =>
        state.settings.llmConfigs.some(config => config.provider === 'gemini' && config.apiKey.trim().length > 0),
    );
    const [activeId, setActiveId] = useState<string | null>(reports[reports.length - 1]?.id ?? null);
    const [busy, setBusy] = useState(false);
    // 종합소견 자동 작성 단계: ⑥을 건너뛰었으면 결과 분석부터 내부 실행한다.
    const [opinionStage, setOpinionStage] = useState<null | 'analysis' | 'opinion'>(null);
    const opinionBusy = opinionStage !== null;
    const [previewHtml, setPreviewHtml] = useState('');
    const [revealedSections, setRevealedSections] = useState<string[]>([]);
    const confirm = useConfirm();
    const showToast = useAppToast();

    const report = reports.find(item => item.id === activeId) ?? reports[reports.length - 1] ?? null;
    const seeker = useMemo(
        () => seekers.find(item => getSeekerKey(item) === episode.seekerId) as Record<string, unknown> | undefined,
        [seekers, episode.seekerId],
    );
    const profile = useMemo(
        () => ({
            birthDate: text(seeker?.birthDate),
            sex: text(seeker?.gender) || text(seeker?.sex),
            disability: [text(seeker?.disabilityType), text(seeker?.disabilityGrade)].filter(Boolean).join(' '),
            desiredJobs: [text(seeker?.desiredJob1), text(seeker?.desiredJob2)].filter(Boolean).join(', '),
        }),
        [seeker],
    );
    // ⑥ 결과 분석의 최신성 판정에 쓰는 "지금 자료" 지문
    const currentAnalysisHash = useMemo(
        () => analysisSourceHash({ episode, sessions, documents, analyses, profile }),
        [episode, sessions, documents, analyses, profile],
    );

    // AI 응답을 기다리는 사이 평가사가 다른 칸을 고칠 수 있어, 적용은 항상 최신 상태 위에 한다.
    // ref는 렌더가 아니라 **커밋 시점에 함께** 갱신한다 — 새 보고서를 저장한 직후 렌더 전에
    // AI 자동 작성이 시작돼도(경쟁 조건) 방금 저장한 보고서를 반드시 찾을 수 있어야 한다.
    const reportsRef = useRef(reports);
    reportsRef.current = reports;
    const commitReports = useCallback(
        (next: EvaluationReport[]) => {
            reportsRef.current = next;
            onReportsChange(next);
        },
        [onReportsChange],
    );

    const queue = useSaveQueue<EvaluationReport>(
        async next => {
            await saveReport(next);
        },
        message => showToast(message, 'error'),
    );
    const update = useCallback(
        (next: EvaluationReport) => {
            commitReports(reportsRef.current.map(item => (item.id === next.id ? next : item)));
            queue.saveDebounced(next, SAVE_DEBOUNCE_MS);
        },
        [commitReports, queue],
    );

    // 보고서 재료 요약: 무엇이 모였고 무엇이 비었는지 만들기 전에 한눈에 보여 준다.
    const materials = useMemo(() => {
        const confirmedSheets = documents.filter(item => item.confirmedAt && !item.supersededAt).length;
        const findingCount = analyses.reduce(
            (total, record) => total + record.findings.filter(finding => finding.included && !finding.blocked).length,
            0,
        );
        const observationCount = sessions.reduce(
            (total, session) => total + session.observations.filter(item => buildObservationNarrative(item)).length,
            0,
        );
        const adoptedCount = sessions.reduce(
            (total, session) => total + adoptedClaims(selectCurrentRun(episode.interpretations as InterpretationRun[], session.id)).length,
            0,
        );
        return [
            { label: '② 검사 실시', value: sessions.length ? `${sessions.length}건` : '없음', ok: sessions.length > 0 },
            { label: '⑤ 공식 결과지(확정)', value: confirmedSheets ? `${confirmedSheets}건` : '없음', ok: confirmedSheets > 0 },
            {
                label: '⑤ 분석지',
                value: analyses.length ? `${analyses.length}건 · 문장 ${findingCount}개` : '없음',
                ok: analyses.length > 0,
            },
            { label: '③ 행동관찰', value: observationCount ? `${observationCount}개` : '없음', ok: observationCount > 0 },
            { label: '⑥ 채택한 해석', value: adoptedCount ? `${adoptedCount}문장` : '없음', ok: adoptedCount > 0 },
            {
                label: '⑥ 결과 분석',
                value: !episode.resultAnalysis?.text.trim()
                    ? '없음 — 자동 작성 시 내부 실행'
                    : isResultAnalysisCurrent(episode.resultAnalysis, currentAnalysisHash)
                      ? '있음'
                      : '자료 변경됨 — 자동 작성 시 다시 분석',
                ok: isResultAnalysisCurrent(episode.resultAnalysis, currentAnalysisHash),
            },
        ];
    }, [documents, analyses, sessions, episode.interpretations, episode.resultAnalysis, currentAnalysisHash]);

    /**
     * 보고서를 조립하기 전에 해석 실행의 근거가 아직 유효한지 다시 계산한다.
     * 원자료를 고친 뒤 해석 화면을 거치지 않고 바로 보고서로 와도 예전 문장이 빠지게 한다.
     */
    const freshEpisode = async (): Promise<EvaluationEpisode> => {
        try {
            const refreshed = await refreshRunStaleness(episode, sessions, documents);
            if (refreshed.changed) onEpisodeChange(refreshed.episode);
            return refreshed.episode;
        } catch {
            return episode;
        }
    };

    /** 종합소견 초안을 AI가 쓴다. 재료를 정리해 보내고, 8개 항목을 칸별로 나눠 담는다. */
    // target은 보고서 **객체**로 받는다 — 저장 직후 state/ref 반영 타이밍에 기대지 않고,
    // 자동 작성이 조용히 생략되는 일이 없게 한다(ref에 아직 없으면 받은 객체를 그대로 쓴다).
    const generateOpinion = async (targetReport: EvaluationReport, { auto }: { auto: boolean }) => {
        if (opinionBusy) return;
        if (!hasAIKey) {
            if (!auto) showToast('설정에서 Gemini API 키를 등록하면 종합소견 초안을 자동으로 씁니다.', 'info');
            return;
        }
        const target = reportsRef.current.find(item => item.id === targetReport.id) ?? targetReport;
        if (isLocked(target) || episodeLocked) return;
        if (!auto && OPINION_FIELDS.some(([key]) => target.summary[key].trim())) {
            const ok = await confirm({
                title: 'AI 초안으로 바꿀까요?',
                message: '지금 종합소견 칸에 있는 내용을 AI가 새로 쓴 초안으로 바꿉니다. 자동 초안이 아닌 직접 쓰신 내용도 함께 바뀝니다.',
                confirmLabel: '새로 쓰기',
            });
            if (!ok) return;
        }
        const knownNames = [episode.seekerName, episode.evaluator];
        // ⑥ 결과 분석의 최신성: 자료 지문이 지금 자료와 다르면 STALE — 조용히 쓰지 않는다.
        const currentHash = currentAnalysisHash;
        const savedAnalysis = episode.resultAnalysis?.text.trim() ? episode.resultAnalysis : undefined;
        const analysisIsCurrent = isResultAnalysisCurrent(savedAnalysis, currentHash);
        if (savedAnalysis && !analysisIsCurrent && savedAnalysis.editedAt) {
            // 평가사가 직접 고친 분석은 묻지 않고 덮어쓰지 않는다.
            const ok = await confirm({
                title: '평가자료가 변경되었습니다',
                message:
                    '직접 고치신 ⑥ 결과 분석은 이전 자료를 기준으로 작성되었습니다. 최신 자료로 다시 분석해 종합소견에 사용할까요? (기존에 고치신 내용은 새 분석으로 바뀝니다)',
                confirmLabel: '다시 분석해 사용',
            });
            if (!ok) {
                showToast('⑥ 결과 해석에서 결과 분석을 확인한 뒤 다시 시도해 주세요.', 'info');
                return;
            }
        }
        try {
            // CURRENT면 그대로 쓰고, 없거나 STALE이면 최신 자료로 결과 분석을 다시 만든다.
            let episodeForOpinion = analysisIsCurrent ? episode : { ...episode, resultAnalysis: undefined };
            if (!analysisIsCurrent) {
                setOpinionStage('analysis');
                try {
                    const analysisReference = buildOpinionReference({
                        episode,
                        sessions,
                        documents,
                        analyses,
                        profile,
                        includeResultAnalysis: false,
                    });
                    const analysisText = await analyzeTestResults([], analysisReference, { knownNames });
                    episodeForOpinion = {
                        ...episode,
                        resultAnalysis: { text: analysisText, generatedAt: new Date().toISOString(), sourceHash: currentHash },
                    };
                    onEpisodeChange(episodeForOpinion); // ⑥에서도 볼 수 있게 회차에 저장한다.
                } catch {
                    // 결과 분석이 실패해도 종합소견은 원자료만으로 계속 진행한다(STALE 분석은 쓰지 않는다).
                }
            }
            setOpinionStage('opinion');
            const reference = buildOpinionReference({ episode: episodeForOpinion, sessions, documents, analyses, profile });
            const raw = await generateReport(reference, [], { knownNames });
            const parsed = parseOpinionText(raw);
            if (!Object.keys(parsed.fields).length) throw new Error('AI 응답에서 소견 항목을 읽지 못했습니다. 다시 시도해 주세요.');
            const latest = reportsRef.current.find(item => item.id === targetReport.id) ?? target;
            if (isLocked(latest)) return;
            update({ ...latest, summary: applyOpinion(latest.summary, parsed), aiOpinionAt: new Date().toISOString() });
            showToast(
                parsed.matchedSections >= 4
                    ? '종합소견 초안을 칸별로 채웠습니다. 반드시 검토하고 다듬어 주세요.'
                    : 'AI 응답 형식이 달라 전문을 "종합소견" 칸에 담았습니다. 칸을 나눠 정리해 주세요.',
                'success',
            );
        } catch (error) {
            showToast(error instanceof Error ? error.message : '종합소견 초안을 만들지 못했습니다.', 'error');
        } finally {
            setOpinionStage(null);
        }
    };

    const handleCreate = async () => {
        const currentEpisode = await freshEpisode();
        const previous = reports[reports.length - 1];
        const base = previous
            ? createNextVersion(previous, new Date().toISOString())
            : createReport({
                  episodeId: episode.id,
                  seekerId: episode.seekerId,
                  seekerName: episode.seekerName,
                  writtenOn: localDateKey(),
                  evaluator: episode.evaluator,
                  header: buildHeaderFrom(episode, seeker),
                  purpose: episode.purpose,
              });
        const composed: EvaluationReport = {
            ...base,
            header: buildHeaderFrom(episode, seeker),
            purpose: episode.purpose,
            evaluator: episode.evaluator || base.evaluator,
            tools: fillToolRows(base.tools, sessions, analyses),
            sections: composeSections({ episode: currentEpisode, sessions, documents, analyses }, base.sections),
            summary: composeSummaryDraft({ episode: currentEpisode, sessions, documents, analyses }, base.summary),
            resultTables: buildResultTables(sessions, documents),
        };
        try {
            const saved = await saveReport(composed);
            // ref를 먼저(동기) 갱신한 뒤 AI 자동 작성을 시작한다 — 렌더 전에 시작돼도 새 보고서를 찾는다.
            commitReports([...reportsRef.current, saved]);
            setActiveId(saved.id);
            // 종합소견은 AI가 초안을 쓴다(키가 있을 때). 실패해도 규칙 기반 초안이 남아 있다.
            void generateOpinion(saved, { auto: true });
        } catch (error) {
            showToast(error instanceof Error ? error.message : '보고서를 만들지 못했습니다.', 'error');
        }
    };

    const handleRecompose = async () => {
        if (!report || isLocked(report)) return;
        const currentEpisode = await freshEpisode();
        update({
            ...report,
            header: buildHeaderFrom(episode, seeker),
            purpose: episode.purpose,
            evaluator: episode.evaluator || report.evaluator,
            tools: fillToolRows(report.tools, sessions, analyses),
            sections: composeSections({ episode: currentEpisode, sessions, documents, analyses }, report.sections),
            summary: composeSummaryDraft({ episode: currentEpisode, sessions, documents, analyses }, report.summary),
            resultTables: buildResultTables(sessions, documents),
        });
        showToast('머리 정보·평가 도구·자동 문단·결과표를 다시 가져왔습니다.', 'success');
    };

    const handleConfirm = async () => {
        if (!report) return;
        const ok = await confirm({
            title: '보고서를 확정할까요?',
            message: '확정하면 내용이 잠깁니다. 이후 원자료가 바뀌어도 이 보고서의 출력은 변하지 않습니다. 고치려면 새 버전을 만드세요.',
            confirmLabel: '확정',
        });
        if (!ok) return;
        // 대기 중인 수정을 먼저 저장한 뒤 확정한다 — 확정 직전 편집이 빠지지 않게.
        await queue.flush();
        try {
            const confirmed = confirmReport(report, episode.evaluator || '평가사', new Date().toISOString());
            commitReports(reportsRef.current.map(item => (item.id === confirmed.id ? confirmed : item)));
            queue.save(confirmed);
            await queue.flush();
            showToast('보고서를 확정했습니다.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : '확정하지 못했습니다.', 'error');
        }
    };

    const handleDocx = async () => {
        if (!report) return;
        await queue.flush();
        setBusy(true);
        try {
            const blob = await packDocument(buildReportDocx(report));
            const result = await saveJjssBlob('case-management', reportFileName(report, 'docx'), blob);
            if (result.canceled) showToast('저장을 취소했습니다.', 'info');
            else showToast(savedLocationMessage(result), 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'DOCX를 저장하지 못했습니다.', 'error');
        } finally {
            setBusy(false);
        }
    };

    const handlePdf = async () => {
        if (!report) return;
        await queue.flush();
        setBusy(true);
        try {
            const html = buildReportHtml(report);
            const result = await saveJjssPdf('case-management', reportFileName(report, 'pdf'), html);
            if (!result) {
                setPreviewHtml(html);
                showToast('PDF 저장은 Windows 설치형 JJSS에서 쓸 수 있습니다. 아래 미리보기를 확인해 주세요.', 'info');
                return;
            }
            if (result.canceled) showToast('저장을 취소했습니다.', 'info');
            else showToast(savedLocationMessage(result), 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : 'PDF를 저장하지 못했습니다.', 'error');
        } finally {
            setBusy(false);
        }
    };

    if (!report) {
        return (
            <div className="glass-card !p-5 space-y-3">
                <h3 className="font-semibold text-white">직업평가보고서</h3>
                <p className="text-sm text-white/50">
                    아래 재료(검사 기록·결과지·분석지·관찰·해석)를 모아 보고서 초안을 한 번에 만듭니다. 머리 정보와 평가
                    도구는 자동으로 채워지고, <strong className="text-white/75">종합소견 및 직업재활방향은 AI가 초안을 씁니다</strong>
                    &nbsp;— 평가사는 검토하고 다듬기만 하면 됩니다.
                </p>
                <ul className="grid sm:grid-cols-2 gap-2" aria-label="보고서 재료">
                    {materials.map(item => (
                        <li key={item.label} className={`glass rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-2 ${item.ok ? 'text-white/75' : 'text-white/40'}`}>
                            <span>{item.label}</span>
                            <span className={item.ok ? 'text-emerald-200' : ''}>{item.value}</span>
                        </li>
                    ))}
                </ul>
                <button type="button" className="btn-primary" onClick={() => void handleCreate()} disabled={episodeLocked}>
                    <Plus size={16} className="inline mr-1" /> 보고서 초안 만들기
                </button>
                {!hasAIKey && (
                    <p className="text-xs text-amber-200/80">
                        Gemini API 키가 없어 종합소견은 규칙 기반 초안만 채워집니다. 설정에서 키를 등록하면 소견 초안을 AI가
                        씁니다.
                    </p>
                )}
                <p className="text-xs text-white/40">
                    재료를 나중에 더 채웠다면 보고서 화면의 <strong>자동 내용 새로 가져오기</strong>로 다시 반영할 수 있습니다.
                </p>
            </div>
        );
    }

    const locked = isLocked(report) || episodeLocked;
    const needsLine = EPISODE_NEED_KEYS.filter(key => report.header.needs[key])
        .map(key => EPISODE_NEED_LABELS[key])
        .join(' · ');
    const headerItems: Array<[string, string]> = [
        ['평가실시기관', report.header.evaluationOrganization],
        ['의뢰요청기관', report.header.referralOrganization],
        ['평가일', report.header.evaluationDate],
        ['평가유형', EVALUATION_VENUE_LABELS[report.header.venue]],
        ['성명', report.header.seekerName],
        ['생년월일', report.header.birthDate],
        ['연락처', report.header.contact],
        ['거주지', report.header.address],
        ['장애유형/정도', report.header.disability],
        ['성별', report.header.sex],
        ['욕구', needsLine],
    ];
    const visibleSections = report.sections.filter(
        section => section.paragraphs.length > 0 || section.evaluatorText.trim() || revealedSections.includes(section.id),
    );
    const hiddenSections = report.sections.filter(section => !visibleSections.includes(section));

    return (
        <div className="space-y-4">
            <header className="glass-card !p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    {reports.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveId(item.id)}
                            aria-pressed={item.id === report.id}
                            className={`px-3 py-1.5 rounded-lg text-sm border ${
                                item.id === report.id
                                    ? 'bg-primary-500/30 border-primary-400 text-white'
                                    : 'bg-white/5 border-white/10 text-white/60'
                            }`}
                        >
                            v{item.reportVersion}
                            {item.confirmedAt ? ' · 확정' : ''}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {!locked && (
                        <button type="button" className="btn-secondary !px-4 !py-2 text-sm" onClick={() => void handleRecompose()}>
                            <RefreshCw size={14} className="inline mr-1" /> 자동 내용 새로 가져오기
                        </button>
                    )}
                    {!locked ? (
                        <button type="button" className="btn-primary !px-4 !py-2 text-sm" onClick={() => void handleConfirm()}>
                            <Lock size={14} className="inline mr-1" /> 확정
                        </button>
                    ) : (
                        <button type="button" className="btn-secondary !px-4 !py-2 text-sm" onClick={() => void handleCreate()}>
                            <Plus size={14} className="inline mr-1" /> 새 버전
                        </button>
                    )}
                    <button type="button" className="btn-secondary !px-4 !py-2 text-sm" disabled={busy} onClick={() => void handleDocx()}>
                        <FileDown size={14} className="inline mr-1" /> DOCX
                    </button>
                    <button type="button" className="btn-secondary !px-4 !py-2 text-sm" disabled={busy} onClick={() => void handlePdf()}>
                        <FileText size={14} className="inline mr-1" /> PDF
                    </button>
                </div>
            </header>

            {locked && (
                <p className="text-sm text-emerald-200 px-1">
                    확정된 보고서입니다{report.confirmedBy ? ` · 확정자 ${report.confirmedBy}` : ''}. 고치려면 새 버전을 만드세요.
                </p>
            )}

            <section className="glass-card !p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-white">머리 정보 · 평가목적</h3>
                    {!locked && (
                        <button type="button" className="btn-secondary !px-3 !py-1.5 text-xs" onClick={onGoToBasic}>
                            <PencilLine size={12} className="inline mr-1" /> ① 기본정보에서 고치기
                        </button>
                    )}
                </div>
                <p className="text-xs text-white/40">
                    ① 기본정보와 이용자 정보에서 자동으로 가져옵니다. 고친 뒤에는 <strong>자동 내용 새로 가져오기</strong>를
                    누르세요.
                </p>
                <dl className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                    {headerItems.map(([label, value]) => (
                        <div key={label} className="flex items-baseline gap-2 text-sm">
                            <dt className="text-white/45 shrink-0 w-24">{label}</dt>
                            <dd className="text-white/80">{value || '—'}</dd>
                        </div>
                    ))}
                </dl>
                <div className="glass rounded-lg px-3 py-2">
                    <p className="text-xs text-white/45 mb-1">평가목적</p>
                    <p className="text-sm text-white/80 whitespace-pre-wrap">{report.purpose || '—'}</p>
                </div>
            </section>

            <section className="glass-card !p-5 space-y-3">
                <h3 className="font-semibold text-white">평가 도구(방법)</h3>
                <p className="text-xs text-white/40">
                    실시한 KEAD 검사와 ⑤에서 넣은 분석지 제목으로 자동으로 채웁니다. 필요하면 직접 고치세요.
                </p>
                <div className="space-y-2">
                    {report.tools.map((row, index) => (
                        <div key={`${row.area}-${index}`} className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-white/60 w-48 shrink-0">{row.area}</span>
                            <input
                                className="input-field flex-1 !py-2"
                                aria-label={`${row.area} 평가도구`}
                                disabled={locked}
                                value={row.tool}
                                onChange={event =>
                                    update({
                                        ...report,
                                        tools: report.tools.map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, tool: event.target.value } : item,
                                        ),
                                    })
                                }
                            />
                        </div>
                    ))}
                </div>
            </section>

            <section className="glass-card !p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-white">종합소견 및 직업재활방향</h3>
                    {!locked && (
                        <button
                            type="button"
                            className="btn-primary !px-3 !py-2 text-sm"
                            disabled={opinionBusy}
                            onClick={() => void generateOpinion(report, { auto: false })}
                        >
                            <Sparkles size={14} className="inline mr-1" />
                            {opinionBusy ? '초안 작성 중…' : 'AI 종합소견 초안 쓰기'}
                        </button>
                    )}
                </div>
                {opinionBusy && (
                    <p className="text-sm text-primary-200/90" role="status">
                        {opinionStage === 'analysis'
                            ? '⑥ 결과 분석을 먼저 만들고 있습니다(건너뛰신 단계를 자동으로 수행)…'
                            : '검사 결과·⑥ 결과 분석·분석지·관찰 기록을 정리해 소견 초안을 쓰고 있습니다…'}
                    </p>
                )}
                {report.aiOpinionAt && !opinionBusy && (
                    <p className="text-xs text-amber-200/80">
                        AI가 {new Date(report.aiOpinionAt).toLocaleString('ko-KR')}에 쓴 초안이 들어 있습니다. 반드시 검토하고
                        평가사 판단으로 다듬어 주세요.
                    </p>
                )}
                {!hasAIKey && !locked && (
                    <p className="text-xs text-white/40">Gemini API 키를 등록하면 아래 칸의 초안을 AI가 씁니다.</p>
                )}
                {OPINION_FIELDS.map(([key, label, rows]) => (
                    <div key={key}>
                        <label htmlFor={`ve-summary-${key}`} className="text-sm text-white/60">
                            {label}
                        </label>
                        <textarea
                            id={`ve-summary-${key}`}
                            className="textarea-field mt-1"
                            rows={rows}
                            disabled={locked || opinionBusy}
                            value={report.summary[key]}
                            onChange={event => update({ ...report, summary: { ...report.summary, [key]: event.target.value } })}
                        />
                    </div>
                ))}
            </section>

            <section className="glass-card !p-5 space-y-4">
                <h3 className="font-semibold text-white">평가 상세</h3>
                <p className="text-xs text-white/40">
                    장애·진단이력과 교육훈련·직업경력은 ① 기본정보에서, 나머지는 검사·분석지·관찰에서 자동으로 들어옵니다.
                    평가한 영역만 표시되고, 내용이 없는 영역은 출력에서도 빠집니다.
                </p>
                {visibleSections.map(section => (
                    <div key={section.id} className="glass rounded-xl p-4 space-y-2">
                        <h4 className="text-sm font-semibold text-white/80">{section.title}</h4>
                        {section.paragraphs.length > 0 && (
                            <ul className="space-y-1">
                                {section.paragraphs.map(item => (
                                    <li key={item.id} className="flex items-start gap-2">
                                        <input
                                            type="checkbox"
                                            className="mt-1"
                                            disabled={locked}
                                            checked={item.included}
                                            aria-label={`${item.text.slice(0, 20)} 포함`}
                                            onChange={event =>
                                                update({
                                                    ...report,
                                                    sections: report.sections.map(current =>
                                                        current.id === section.id
                                                            ? {
                                                                  ...current,
                                                                  paragraphs: current.paragraphs.map(paragraph =>
                                                                      paragraph.id === item.id
                                                                          ? { ...paragraph, included: event.target.checked }
                                                                          : paragraph,
                                                                  ),
                                                              }
                                                            : current,
                                                    ),
                                                })
                                            }
                                        />
                                        <span className={`text-sm ${item.included ? 'text-white/75' : 'text-white/35 line-through'}`}>
                                            {item.text}
                                            {item.sourceLabel && <span className="block text-[11px] text-white/35">{item.sourceLabel}</span>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <textarea
                            className="textarea-field"
                            rows={3}
                            aria-label={`${section.title} 직접 서술`}
                            placeholder="평가사가 직접 쓰는 내용"
                            disabled={locked}
                            value={section.evaluatorText}
                            onChange={event =>
                                update({
                                    ...report,
                                    sections: report.sections.map(current =>
                                        current.id === section.id ? { ...current, evaluatorText: event.target.value } : current,
                                    ),
                                })
                            }
                        />
                    </div>
                ))}
                {!locked && hiddenSections.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-white/40">평가한 영역 추가:</span>
                        {hiddenSections.map(section => (
                            <button
                                key={section.id}
                                type="button"
                                className="btn-secondary !px-3 !py-1.5 text-xs"
                                onClick={() => setRevealedSections(current => [...current, section.id])}
                            >
                                <Plus size={12} className="inline mr-1" />
                                {section.title}
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {report.resultTables.length > 0 && (
                <section className="glass-card !p-5 space-y-4">
                    <h3 className="font-semibold text-white">검사 결과</h3>
                    {report.resultTables.map((table, tableIndex) => (
                        <div key={`${table.title}-${tableIndex}`}>
                            <p className="text-sm text-white/70 mb-2">{table.title}</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <tbody>
                                        {table.rows.map((row, rowIndex) => (
                                            // 같은 내용의 행·칸이 있을 수 있어(예: '미실시' 두 칸) 위치를 key로 쓴다.
                                            <tr key={`row-${rowIndex}`} className="border-b border-white/5 last:border-0">
                                                {row.map((cell, cellIndex) => (
                                                    <td
                                                        key={`cell-${cellIndex}`}
                                                        className={`py-1.5 pr-3 ${rowIndex === 0 ? 'text-white/50 text-xs' : 'text-white/75'}`}
                                                    >
                                                        {cell}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {table.note && <p className="text-xs text-white/40 mt-1">{table.note}</p>}
                        </div>
                    ))}
                </section>
            )}

            {previewHtml && (
                <section className="glass-card !p-3">
                    <iframe title="보고서 미리보기" srcDoc={previewHtml} className="w-full h-[600px] bg-white rounded-xl" />
                </section>
            )}
        </div>
    );
}
