/**
 * 해석 단계. 확정된 값에서 비교 패턴을 만들고, AI에게 해석 초안을 받아 평가사가 채택한다.
 * AI 제안은 항상 "제안" 상태로 저장되고, 품질 검사를 통과하지 못한 제안은 채택할 수 없다.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Pencil, Sparkles, X } from 'lucide-react';
import {
    CLAIM_TYPE_LABELS,
    acceptClaim,
    adoptedClaims,
    buildEvidenceSnapshot,
    buildInterpretationContext,
    claimText,
    createFailedRun,
    createInterpretationRun,
    editClaim,
    getTestPlugin,
    selectCurrentRun,
    rejectClaim,
    type EvaluationEpisode,
    type EvidenceSnapshot,
    type InterpretationClaim,
    type SourceDocumentRecord,
    type TestSession,
} from '../../../features/vocationalEvaluation';
import { requestInterpretation } from '../../../features/vocationalEvaluation/interpretation/request';
import { selectActiveSourceDocument } from '../../../features/vocationalEvaluation/sourceDocument/record';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { useAppToast } from '../../../components/Toast';

const READINESS_STYLES: Record<string, string> = {
    READY: 'text-emerald-200',
    PARTIAL: 'text-amber-200',
    BLOCKED: 'text-rose-200',
};

const QUALITY_LABELS: Record<string, string> = {
    VALID: '검사 통과',
    REVIEW_REQUIRED: '확인 필요',
    INVALID: '채택 불가',
};

export function InterpretationStep({
    episode,
    sessions,
    documents,
    onEpisodeChange,
    locked = false,
}: {
    episode: EvaluationEpisode;
    sessions: TestSession[];
    documents: SourceDocumentRecord[];
    onEpisodeChange: (next: EvaluationEpisode) => void;
    /** 보관된 회차는 읽기 전용 */
    locked?: boolean;
}) {
    const [sessionId, setSessionId] = useState(sessions[0]?.id ?? '');
    const [snapshot, setSnapshot] = useState<EvidenceSnapshot | null>(null);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<Record<string, string>>({});
    const confirm = useConfirm();
    const showToast = useAppToast();

    const session = sessions.find(item => item.id === sessionId) ?? sessions[0];
    // 확정됐고 대체되지 않은 최신 결과지 하나만 값의 출처로 쓴다.
    const document = selectActiveSourceDocument(documents, session?.id);

    const context = useMemo(
        () => buildInterpretationContext({ session, document, now: new Date().toISOString() }),
        [session, document],
    );

    useEffect(() => {
        let cancelled = false;
        if (!session) {
            setSnapshot(null);
            return;
        }
        void buildEvidenceSnapshot({
            testPluginId: session.testPluginId,
            canonicalFacts: context.canonicalFacts,
            conflictPaths: context.conflictPaths,
            session,
            hasOfficialDocument: context.hasOfficialDocument,
        }).then(next => {
            if (!cancelled) setSnapshot(next);
        });
        return () => {
            cancelled = true;
        };
    }, [session, context]);

    const run = selectCurrentRun(episode.interpretations, session?.id);
    const stale = Boolean(run && ((snapshot && run.evidenceHash !== snapshot.evidenceHash) || run.status === 'STALE') && run.status !== 'FAILED');

    // 근거가 달라진 실행은 화면 경고로 끝내지 않고 저장 상태를 STALE로 바꾼다 —
    // 보고서 단계가 이 상태를 보고 예전 문장을 제외한다.
    useEffect(() => {
        if (!snapshot || !session) return;
        const current = selectCurrentRun(episode.interpretations, session.id);
        if (current && current.status === 'CURRENT' && current.evidenceHash !== snapshot.evidenceHash) {
            onEpisodeChange({
                ...episode,
                interpretations: episode.interpretations.map(item =>
                    item.id === current.id ? { ...item, status: 'STALE' as const } : item,
                ),
            });
        }
    }, [snapshot, session, episode, onEpisodeChange]);

    const saveRun = (next: EvaluationEpisode['interpretations'][number]) => {
        onEpisodeChange({
            ...episode,
            interpretations: [...episode.interpretations.filter(item => item.id !== next.id), next],
        });
    };

    const updateClaim = (claimId: string, mutate: (claim: InterpretationClaim) => InterpretationClaim) => {
        if (!run) return;
        try {
            saveRun({ ...run, claims: run.claims.map(claim => (claim.id === claimId ? mutate(claim) : claim)) });
        } catch (error) {
            showToast(error instanceof Error ? error.message : '처리하지 못했습니다.', 'error');
        }
    };

    const handleRequest = async () => {
        if (!session || !snapshot) return;
        if (snapshot.readiness.status === 'BLOCKED') {
            showToast('먼저 검사 결과를 확인해 주세요.', 'error');
            return;
        }
        const ok = await confirm({
            title: 'AI에게 해석 초안을 받을까요?',
            message:
                '수치·비교 패턴·관찰 라벨만 보냅니다. 이름·연락처·메모·원본 파일은 보내지 않습니다. 받은 문장은 제안 상태로 저장되며 채택해야 문서에 들어갑니다.',
            confirmLabel: '요청',
        });
        if (!ok) return;
        setBusy(true);
        const now = new Date().toISOString();
        try {
            const outcome = await requestInterpretation(snapshot.package);
            const next = outcome.response
                ? createInterpretationRun({
                      testPluginId: session.testPluginId,
                      sessionId: session.id,
                      sourceDocumentId: document?.id,
                      evidenceHash: snapshot.evidenceHash,
                      readiness: snapshot.readiness,
                      model: outcome.model,
                      response: outcome.response,
                      pack: snapshot.package,
                      now,
                  })
                : createFailedRun({
                      testPluginId: session.testPluginId,
                      sessionId: session.id,
                      evidenceHash: snapshot.evidenceHash,
                      readiness: snapshot.readiness,
                      model: outcome.model,
                      reason: outcome.failureReason ?? '해석 제안을 받지 못했습니다.',
                      now,
                  });
            onEpisodeChange({
                ...episode,
                interpretations: [
                    // 다른 검사의 실행은 건드리지 않고, 같은 검사의 이전 CURRENT만 SUPERSEDED로 남긴다.
                    // 이력은 지우지 않는다 — 예전 제안·채택 기록이 근거로 남아야 한다.
                    ...episode.interpretations.map(item =>
                        item.sessionId === session.id && item.status === 'CURRENT'
                            ? { ...item, status: 'SUPERSEDED' as const }
                            : item,
                    ),
                    next,
                ],
            });
            if (next.status === 'FAILED') showToast(next.errorReason ?? '해석 제안을 받지 못했습니다.', 'error');
        } finally {
            setBusy(false);
        }
    };

    if (!sessions.length) {
        return <p className="text-white/40 text-sm px-1">먼저 검사를 실시하세요.</p>;
    }

    const adopted = adoptedClaims(run);

    return (
        <div className="space-y-4">
            {sessions.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    {sessions.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setSessionId(item.id)}
                            aria-pressed={item.id === session?.id}
                            className={`px-3 py-1.5 rounded-lg text-sm border ${
                                item.id === session?.id
                                    ? 'bg-primary-500/30 border-primary-400 text-white'
                                    : 'bg-white/5 border-white/10 text-white/60'
                            }`}
                        >
                            {getTestPlugin(item.testPluginId).manifest.shortName}
                        </button>
                    ))}
                </div>
            )}

            <section className="glass-card !p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-white">근거 확인</h3>
                    <span className="text-xs text-white/40">
                        {context.hasOfficialDocument ? '공식 결과지 기준' : '공식 결과지 미연결 — 앱 기록 기준'}
                    </span>
                </div>
                {snapshot ? (
                    <>
                        <p className={`text-sm ${READINESS_STYLES[snapshot.readiness.status]}`}>
                            {snapshot.readiness.message} ({snapshot.readiness.usableCoreFields}/{snapshot.readiness.totalCoreFields})
                        </p>
                        {snapshot.readiness.missing.length > 0 && (
                            <p className="text-xs text-white/40">확인 필요: {snapshot.readiness.missing.slice(0, 6).join(', ')}</p>
                        )}
                        {snapshot.package.unresolvedIssues.length > 0 && (
                            <p className="text-xs text-amber-200">
                                <AlertTriangle size={12} className="inline mr-1" />
                                {snapshot.package.unresolvedIssues.join(' · ')}
                            </p>
                        )}
                        <div>
                            <p className="text-sm text-white/70 mb-2">비교 패턴 {snapshot.patterns.length}건</p>
                            <ul className="text-xs text-white/55 space-y-1 max-h-48 overflow-auto">
                                {snapshot.patterns.map(pattern => (
                                    <li key={pattern.id}>· {pattern.label}</li>
                                ))}
                            </ul>
                        </div>
                    </>
                ) : (
                    <p className="text-sm text-white/50">
                        <Loader2 size={14} className="inline mr-1 animate-spin" /> 근거를 정리하는 중…
                    </p>
                )}
            </section>

            <section className="glass-card !p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="font-semibold text-white">AI 해석 제안</h3>
                        <p className="text-xs text-white/40 mt-1">
                            보내는 것은 수치·패턴·관찰 라벨뿐입니다. 제안은 채택해야 보고서에 들어갑니다.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn-primary !px-4 !py-2 text-sm"
                        disabled={locked || busy || !snapshot || snapshot.readiness.status === 'BLOCKED'}
                        onClick={() => void handleRequest()}
                    >
                        {busy ? (
                            <>
                                <Loader2 size={14} className="inline mr-1 animate-spin" /> 요청 중…
                            </>
                        ) : (
                            <>
                                <Sparkles size={14} className="inline mr-1" /> {run ? '다시 요청' : '해석 제안 받기'}
                            </>
                        )}
                    </button>
                </div>

                {stale && (
                    <p className="text-xs text-amber-200">
                        근거가 바뀌었습니다. 아래 제안은 예전 근거로 만든 것이라 **보고서에 들어가지 않습니다.** 다시 요청해 주세요.
                    </p>
                )}
                {run?.status === 'FAILED' && <p className="text-sm text-rose-200">{run.errorReason}</p>}

                {run && run.claims.length > 0 && (
                    <ul className="space-y-3">
                        {run.claims.map(claim => (
                            <li key={claim.id} className="glass rounded-xl p-4 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="badge">{CLAIM_TYPE_LABELS[claim.claimType]}</span>
                                    <span
                                        className={`text-xs ${
                                            claim.quality.status === 'INVALID'
                                                ? 'text-rose-300'
                                                : claim.quality.status === 'REVIEW_REQUIRED'
                                                  ? 'text-amber-300'
                                                  : 'text-emerald-300'
                                        }`}
                                    >
                                        {QUALITY_LABELS[claim.quality.status]}
                                    </span>
                                    {claim.status !== 'PENDING' && (
                                        <span className="text-xs text-white/50">
                                            {claim.status === 'ACCEPTED' ? '채택함' : claim.status === 'EDITED' ? '고쳐서 채택함' : '제외함'}
                                        </span>
                                    )}
                                </div>

                                {editing[claim.id] === undefined ? (
                                    <p className="text-sm text-white/80 whitespace-pre-wrap">{claimText(claim)}</p>
                                ) : (
                                    <textarea
                                        className="textarea-field"
                                        rows={3}
                                        aria-label="제안 수정"
                                        value={editing[claim.id]}
                                        onChange={event => setEditing({ ...editing, [claim.id]: event.target.value })}
                                    />
                                )}

                                {claim.quality.issues.length > 0 && (
                                    <ul className="text-xs text-amber-200 space-y-0.5">
                                        {claim.quality.issues.map(issue => (
                                            <li key={issue}>· {issue}</li>
                                        ))}
                                    </ul>
                                )}

                                <p className="text-xs text-white/35">근거: {claim.evidenceIds.join(', ')}</p>

                                <div className="flex flex-wrap gap-2">
                                    {editing[claim.id] === undefined ? (
                                        <>
                                            <button
                                                type="button"
                                                className="btn-secondary !px-3 !py-1.5 text-xs"
                                                disabled={locked || claim.quality.status === 'INVALID'}
                                                onClick={() =>
                                                    updateClaim(claim.id, item =>
                                                        acceptClaim(item, episode.evaluator || '평가사', new Date().toISOString()),
                                                    )
                                                }
                                            >
                                                <Check size={13} className="inline mr-1" /> 채택
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-ghost text-xs"
                                                disabled={locked}
                                                onClick={() => setEditing({ ...editing, [claim.id]: claimText(claim) })}
                                            >
                                                <Pencil size={13} className="inline mr-1" /> 고쳐서 채택
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-ghost text-xs"
                                                disabled={locked}
                                                onClick={() =>
                                                    updateClaim(claim.id, item =>
                                                        rejectClaim(item, episode.evaluator || '평가사', new Date().toISOString()),
                                                    )
                                                }
                                            >
                                                <X size={13} className="inline mr-1" /> 제외
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                className="btn-secondary !px-3 !py-1.5 text-xs"
                                                disabled={!snapshot}
                                                onClick={() => {
                                                    if (!snapshot) return;
                                                    updateClaim(claim.id, item =>
                                                        editClaim(
                                                            item,
                                                            editing[claim.id] ?? '',
                                                            episode.evaluator || '평가사',
                                                            new Date().toISOString(),
                                                            snapshot.package,
                                                        ),
                                                    );
                                                    const next = { ...editing };
                                                    delete next[claim.id];
                                                    setEditing(next);
                                                }}
                                            >
                                                저장하고 채택
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-ghost text-xs"
                                                onClick={() => {
                                                    const next = { ...editing };
                                                    delete next[claim.id];
                                                    setEditing(next);
                                                }}
                                            >
                                                취소
                                            </button>
                                        </>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                {!run && (
                    <p className="text-sm text-white/40">
                        아직 받은 제안이 없습니다. AI 없이 보고서를 직접 쓸 수도 있습니다.
                    </p>
                )}
            </section>

            {adopted.length > 0 && (
                <section className="glass-card !p-5">
                    <h3 className="font-semibold text-white mb-2">채택한 문장 {adopted.length}건</h3>
                    <ul className="text-sm text-white/70 space-y-2">
                        {adopted.map(claim => (
                            <li key={claim.id}>
                                <span className="text-xs text-white/40 block">{CLAIM_TYPE_LABELS[claim.claimType]}</span>
                                {claimText(claim)}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
