/**
 * 공식 결과지 가져오기 단계.
 * 공단 검사해석 프로그램이 만든 결과지를 읽어 확인하고, 앱 기록과 다른 값은 평가사가 고른다.
 * 앱은 백분위를 계산하지 않고 결과지에 인쇄된 값만 저장한다(계획서 §2).
 */
import { useMemo, useState } from 'react';
import { AlertTriangle, Check, FileCheck2, Loader2, Trash2, X } from 'lucide-react';
import {
    acknowledgeIssue,
    flattenExtraction,
    getTestPlugin,
    isBlockingIssue,
    issueActionPolicy,
    recalculateReviewFields,
    revalidateReview,
    validateExtraction,
    type EvaluationEpisode,
    type ReviewField,
    type ReviewIssue,
    type SourceDocumentRecord,
    type SupportedExtraction,
    type TestSession,
} from '../../../features/vocationalEvaluation';
import { createSourceDocument, extractionOf } from '../../../features/vocationalEvaluation/sourceDocument/record';
import { rebuildFactsAndResolutions } from '../../../features/vocationalEvaluation/sourceDocument/rebuild';
import { resolveFactConflict } from '../../../features/vocationalEvaluation/sourceDocument/facts';
import { documentTypeToPluginId } from '../../../features/vocationalEvaluation/sourceDocument/types';
import { readSourceDocument, sha256Hex } from '../../../features/vocationalEvaluation/sourceDocument/extraction';
import { deleteSourceDocument, saveSourceDocument } from '../../../features/vocationalEvaluation/storage';
import { FileDropZone } from '../../../components/common/FileDropZone';
import { useDataStore } from '../../../store/dataStore';
import { getSeekerKey } from '../../../utils/seeker';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { useAppToast } from '../../../components/Toast';

const SEVERITY_STYLES: Record<string, string> = {
    ERROR: 'border-rose-400/40 text-rose-200',
    WARNING: 'border-amber-400/40 text-amber-200',
    INFO: 'border-white/15 text-white/60',
};

function isNormPath(path: string): boolean {
    return path.startsWith('norms.');
}

export function SourceDocumentStep({
    episode,
    sessions,
    documents,
    onDocumentsChange,
    locked = false,
}: {
    episode: EvaluationEpisode;
    sessions: TestSession[];
    documents: SourceDocumentRecord[];
    onDocumentsChange: (next: SourceDocumentRecord[]) => void;
    /** 보관된 회차는 읽기 전용 */
    locked?: boolean;
}) {
    const [busy, setBusy] = useState(false);
    const [activeId, setActiveId] = useState<string | null>(documents[0]?.id ?? null);
    const seekers = useDataStore(state => state.seekers);
    // 이용자 등록 정보의 생년월일. 결과지의 생년월일과 대조해 "다른 사람의 결과지" 실수를 잡는다.
    const seekerBirthDate = useMemo(() => {
        const seeker = seekers.find(item => getSeekerKey(item) === episode.seekerId) as { birthDate?: unknown } | undefined;
        return typeof seeker?.birthDate === 'string' ? seeker.birthDate : undefined;
    }, [seekers, episode.seekerId]);
    const [reasonDraft, setReasonDraft] = useState<Record<string, string>>({});
    const confirm = useConfirm();
    const showToast = useAppToast();

    const active = documents.find(item => item.id === activeId) ?? documents[0] ?? null;
    const linkedSession = useMemo(
        () => sessions.find(item => item.id === active?.sessionId),
        [sessions, active?.sessionId],
    );

    const persist = async (next: SourceDocumentRecord) => {
        onDocumentsChange(documents.map(item => (item.id === next.id ? next : item)));
        try {
            await saveSourceDocument(next);
        } catch (error) {
            showToast(error instanceof Error ? error.message : '결과지 기록을 저장하지 못했습니다.', 'error');
        }
    };

    const handleFiles = async (files: File[]) => {
        const file = files[0];
        if (!file) return;
        setBusy(true);
        try {
            const outcome = await readSourceDocument({ file });
            const sha256 = await sha256Hex(file);
            const pluginId = outcome.result ? documentTypeToPluginId(outcome.result.documentType) : null;
            const session = sessions.find(item => item.testPluginId === pluginId);
            let record = createSourceDocument({
                episodeId: episode.id,
                seekerId: episode.seekerId,
                seekerName: episode.seekerName,
                sessionId: session?.id,
                fileName: file.name,
                fileSize: file.size,
                sha256,
                pageCount: outcome.pageCount,
            });

            if (!outcome.result || outcome.result.documentType === 'UNSUPPORTED_OR_UNKNOWN') {
                record = {
                    ...record,
                    extractionStatus: 'FAILED',
                    model: outcome.model,
                    extractedAt: new Date().toISOString(),
                    failureReason:
                        outcome.failureReason ??
                        '지원하는 KEAD 결과지로 읽지 못했습니다. 손기능 또는 다차원 양손협응 결과지인지 확인해 주세요.',
                    detectedTitle: outcome.result?.detectedTitle ?? undefined,
                };
            } else {
                const extraction = outcome.result as SupportedExtraction;
                const now = new Date().toISOString();
                const fields = flattenExtraction(extraction, session);
                const issues = validateExtraction(
                    // 결과지의 생년월일은 AI가 아니라 PC에서 읽은 값을 쓴다(외부로 보내지 않는 값).
                    { ...extraction, participant: { ...extraction.participant, birthDate: outcome.localBirthDate ?? null } },
                    {
                        documentId: record.id,
                        session,
                        dominantHand: episode.dominantHand,
                        birthDate: seekerBirthDate,
                    },
                );
                const { facts, resolutions } = rebuildFactsAndResolutions({
                    fields,
                    session,
                    documentId: record.id,
                    now,
                    previousFacts: [],
                    previousResolutions: [],
                });
                record = {
                    ...record,
                    documentType: extraction.documentType,
                    extractionStatus: 'SUCCEEDED',
                    model: outcome.model,
                    extractedAt: now,
                    detectedTitle: extraction.detectedTitle,
                    reportedSummary: extraction.reportedSummary ?? undefined,
                    evaluatorComment: extraction.evaluatorComment ?? undefined,
                    extraction,
                    reviewFields: fields,
                    issues,
                    facts,
                    resolutions,
                };
            }

            const saved = await saveSourceDocument(record);
            onDocumentsChange([...documents, saved]);
            setActiveId(saved.id);
            if (saved.extractionStatus === 'FAILED') {
                showToast('결과지를 읽지 못했습니다. 값을 직접 확인해 주세요.', 'error');
            }
        } catch (error) {
            showToast(error instanceof Error ? error.message : '결과지를 처리하지 못했습니다.', 'error');
        } finally {
            setBusy(false);
        }
    };

    /** 값을 고치면 대조 결과·확인할 점·사실을 모두 다시 계산한다. 이미 확인 처리한 문제는 유지된다. */
    const updateFields = (document: SourceDocumentRecord, fields: ReviewField[]) => {
        const now = new Date().toISOString();
        const extraction = extractionOf(document);
        const reviewed = extraction
            ? revalidateReview(extraction, fields, document.issues, {
                  documentId: document.id,
                  session: linkedSession,
                  dominantHand: episode.dominantHand,
                  birthDate: seekerBirthDate,
              })
            : { fields: recalculateReviewFields(fields), issues: document.issues };
        const { facts, resolutions } = rebuildFactsAndResolutions({
            fields: reviewed.fields,
            session: linkedSession,
            documentId: document.id,
            now,
            previousFacts: document.facts,
            previousResolutions: document.resolutions,
        });
        void persist({ ...document, reviewFields: reviewed.fields, issues: reviewed.issues, facts, resolutions });
    };

    const setFieldValue = (document: SourceDocumentRecord, path: string, raw: string) => {
        const parsed = raw.trim() === '' ? null : Number.isNaN(Number(raw)) ? raw.trim() : Number(raw);
        updateFields(
            document,
            document.reviewFields.map(field =>
                field.path === path ? { ...field, extracted: { ...field.extracted, value: parsed } } : field,
            ),
        );
    };

    const setFieldStatus = (document: SourceDocumentRecord, path: string, status: 'VERIFIED' | 'REJECTED' | 'EXTRACTED') => {
        updateFields(
            document,
            document.reviewFields.map(field => (field.path === path ? { ...field, status } : field)),
        );
    };

    const acknowledge = (document: SourceDocumentRecord, issue: ReviewIssue) => {
        try {
            const next = acknowledgeIssue(issue, {
                by: episode.evaluator || '평가사',
                at: new Date().toISOString(),
                reason: reasonDraft[issue.id] ?? '',
            });
            void persist({
                ...document,
                issues: document.issues.map(item => (item.id === issue.id ? next : item)),
            });
        } catch (error) {
            showToast(error instanceof Error ? error.message : '확인 처리하지 못했습니다.', 'error');
        }
    };

    const chooseFact = (document: SourceDocumentRecord, path: string, factId: string) => {
        try {
            const resolution = document.resolutions.find(item => item.path === path);
            if (!resolution) return;
            const next = resolveFactConflict(resolution, factId, episode.evaluator || '평가사', new Date().toISOString());
            void persist({
                ...document,
                resolutions: document.resolutions.map(item => (item.path === path ? next : item)),
            });
        } catch (error) {
            showToast(error instanceof Error ? error.message : '선택하지 못했습니다.', 'error');
        }
    };

    const confirmDocument = async (document: SourceDocumentRecord) => {
        const ok = await confirm({
            title: '결과지 값을 확정할까요?',
            message: '확정한 값이 해석과 보고서의 근거가 됩니다. 나중에 다시 열 수 있습니다.',
            confirmLabel: '확정',
        });
        if (!ok) return;
        const at = new Date().toISOString();
        // 같은 검사의 이전 확정본은 지우지 않고 "대체됨"으로 남긴다 — 해석·보고서는 최신 하나만 쓴다.
        const superseded = documents.map(item =>
            item.id !== document.id && item.sessionId === document.sessionId && item.confirmedAt && !item.supersededAt
                ? { ...item, supersededAt: at }
                : item,
        );
        const confirmedDocument: SourceDocumentRecord = {
            ...document,
            confirmedAt: at,
            confirmedBy: episode.evaluator || '평가사',
        };
        const next = superseded.map(item => (item.id === confirmedDocument.id ? confirmedDocument : item));
        onDocumentsChange(next);
        try {
            for (const item of next) {
                if (item.id === confirmedDocument.id || item.supersededAt === at) await saveSourceDocument(item);
            }
        } catch (error) {
            showToast(error instanceof Error ? error.message : '결과지 기록을 저장하지 못했습니다.', 'error');
        }
    };

    const removeDocument = async (document: SourceDocumentRecord) => {
        // 확정된 결과지는 해석·보고서의 근거이므로 지우지 않는다. 새 결과지를 확정하면 자동으로 대체된다.
        if (document.confirmedAt && !document.supersededAt) {
            showToast('확정한 결과지는 삭제할 수 없습니다. 새 결과지를 가져와 확정하면 이 결과지는 대체됩니다.', 'error');
            return;
        }
        const ok = await confirm({
            title: '결과지 기록을 삭제할까요?',
            message: '읽어 둔 값과 확인 내용이 사라집니다. PDF 원본은 앱에 저장되어 있지 않습니다.',
            tone: 'danger',
            confirmLabel: '삭제',
        });
        if (!ok) return;
        try {
            await deleteSourceDocument(document.id);
            onDocumentsChange(documents.filter(item => item.id !== document.id));
            if (activeId === document.id) setActiveId(null);
        } catch (error) {
            showToast(error instanceof Error ? error.message : '삭제하지 못했습니다.', 'error');
        }
    };

    const blocking = active?.issues.filter(isBlockingIssue) ?? [];
    const conflicts = active?.resolutions.filter(item => item.status === 'CONFLICT') ?? [];
    const normFields = active?.reviewFields.filter(field => isNormPath(field.path)) ?? [];
    const valueFields = active?.reviewFields.filter(field => !isNormPath(field.path)) ?? [];

    return (
        <div className="space-y-4">
            <section className="glass-card !p-5 space-y-3">
                <h3 className="font-semibold text-white">공식 결과지 가져오기</h3>
                <p className="text-xs text-white/40">
                    공단 검사해석 프로그램이 만든 결과지 PDF를 넣으면 인쇄된 값을 읽어 옵니다. 앱은 백분위를 계산하지 않습니다.
                    글자가 들어 있는 PDF는 PC 안에서 글만 뽑아 비식별화한 뒤 보내고, 원본은 보내지 않습니다. 스캔본은 전송 전에 따로 확인합니다.
                </p>
                <FileDropZone
                    accept="application/pdf"
                    multiple={false}
                    disabled={busy || locked}
                    onFiles={files => void handleFiles(files)}
                    ariaLabel="공식 결과지 PDF 선택"
                    className="glass rounded-xl p-6 text-center cursor-pointer border border-dashed border-white/20 hover:bg-white/10 transition-all"
                    activeClassName="bg-white/10 border-primary-400"
                >
                    <span className="text-sm text-white/60">
                        {busy ? '읽는 중…' : '결과지 PDF를 끌어다 놓거나 눌러서 선택하세요'}
                    </span>
                </FileDropZone>
                {busy && (
                    <p className="text-sm text-white/50">
                        <Loader2 size={14} className="inline mr-1 animate-spin" /> 결과지를 읽고 있습니다.
                    </p>
                )}
            </section>

            {documents.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    {documents.map(item => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setActiveId(item.id)}
                            aria-pressed={item.id === active?.id}
                            className={`px-3 py-1.5 rounded-lg text-sm border ${
                                item.id === active?.id
                                    ? 'bg-primary-500/30 border-primary-400 text-white'
                                    : 'bg-white/5 border-white/10 text-white/60'
                            }`}
                        >
                            {item.documentType === 'KEAD_BIMANUAL' ? '양손협응 결과지' : item.documentType === 'KEAD_HAND_FUNCTION' ? '손기능 결과지' : '확인 필요'}
                        </button>
                    ))}
                </div>
            )}

            {!active ? (
                <p className="text-white/40 text-sm px-1">
                    아직 가져온 결과지가 없습니다. 결과지 없이도 앱 기록만으로 다음 단계를 진행할 수 있습니다.
                </p>
            ) : (
                <>
                    <section className="glass-card !p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="font-semibold text-white">{active.detectedTitle || active.fileName}</h3>
                                <p className="text-xs text-white/40 mt-1">
                                    {active.extractionStatus === 'SUCCEEDED' ? '읽음' : '읽지 못함'}
                                    {active.pageCount ? ` · ${active.pageCount}쪽` : ''}
                                    {linkedSession ? ` · ${getTestPlugin(linkedSession.testPluginId).manifest.shortName} 기록과 대조` : ' · 대조할 앱 기록 없음'}
                                    {active.confirmedAt ? ` · 확정 ${active.confirmedAt.slice(0, 10)}` : ''}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {!active.confirmedAt && active.extractionStatus === 'SUCCEEDED' && (
                                    <button
                                        type="button"
                                        className="btn-primary !px-4 !py-2 text-sm"
                                        disabled={blocking.length > 0 || conflicts.length > 0}
                                        onClick={() => void confirmDocument(active)}
                                    >
                                        <FileCheck2 size={14} className="inline mr-1" /> 값 확정
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className="btn-ghost"
                                    disabled={locked}
                                    onClick={() => void removeDocument(active)}
                                    aria-label="결과지 기록 삭제"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                        {active.failureReason && <p className="text-sm text-rose-200">{active.failureReason}</p>}
                        {!active.confirmedAt && active.extractionStatus === 'SUCCEEDED' && (
                            <p className="text-xs text-amber-200">
                                아직 확정하지 않은 결과지입니다. <strong>값 확정</strong>을 눌러야 해석과 보고서에서 이 값이 쓰입니다.
                            </p>
                        )}
                        {active.reportedSummary && (
                            <p className="text-xs text-white/50">
                                결과지에 적힌 소견: {active.reportedSummary}
                            </p>
                        )}
                    </section>

                    {active.issues.length > 0 && (
                        <section className="glass-card !p-5 space-y-2">
                            <h4 className="font-semibold text-white">확인할 점</h4>
                            {active.issues.map(issue => {
                                const policy = issueActionPolicy(issue);
                                return (
                                    <div key={issue.id} className={`glass rounded-xl p-3 border ${SEVERITY_STYLES[issue.severity]}`}>
                                        <p className="text-sm">
                                            <AlertTriangle size={14} className="inline mr-1" />
                                            {issue.message}
                                        </p>
                                        {issue.status !== 'OPEN' ? (
                                            <p className="text-xs text-white/40 mt-1">
                                                확인함{issue.resolvedBy ? ` · ${issue.resolvedBy}` : ''}
                                                {issue.resolutionReason ? ` · ${issue.resolutionReason}` : ''}
                                            </p>
                                        ) : policy === 'FIELD_ACTION' ? (
                                            <p className="text-xs text-white/40 mt-1">아래 표에서 값을 채우거나 제외해야 해제됩니다.</p>
                                        ) : (
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                {policy === 'STRONG_ACKNOWLEDGE' && (
                                                    <input
                                                        className="input-field !py-1.5 text-sm flex-1 min-w-[200px]"
                                                        placeholder="같은 사람의 결과지가 맞는지 확인한 근거"
                                                        value={reasonDraft[issue.id] ?? ''}
                                                        onChange={event => setReasonDraft({ ...reasonDraft, [issue.id]: event.target.value })}
                                                    />
                                                )}
                                                <button
                                                    type="button"
                                                    className="btn-secondary !px-3 !py-1.5 text-xs"
                                                    onClick={() => acknowledge(active, issue)}
                                                >
                                                    확인함으로 표시
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </section>
                    )}

                    {conflicts.length > 0 && (
                        <section className="glass-card !p-5 space-y-2">
                            <h4 className="font-semibold text-white">앱 기록과 결과지가 다릅니다</h4>
                            <p className="text-xs text-white/40">어느 값을 쓸지 고르기 전에는 해석에 들어가지 않습니다.</p>
                            {conflicts.map(resolution => {
                                const candidates = resolution.candidateFactIds
                                    .map(id => active.facts.find(fact => fact.id === id))
                                    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));
                                const label = active.reviewFields.find(field => field.path === resolution.path)?.label ?? resolution.path;
                                return (
                                    <div key={resolution.id} className="glass rounded-xl p-3">
                                        <p className="text-sm text-white/80">{label}</p>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {candidates.map(fact => (
                                                <button
                                                    key={fact.id}
                                                    type="button"
                                                    className="btn-secondary !px-3 !py-1.5 text-xs"
                                                    onClick={() => chooseFact(active, resolution.path, fact.id)}
                                                >
                                                    {fact.origin === 'OFFICIAL_PDF' ? '결과지' : '앱 기록'} {String(fact.value)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </section>
                    )}

                    {valueFields.length > 0 && (
                        <section className="glass-card !p-5">
                            <h4 className="font-semibold text-white mb-3">읽어 온 값</h4>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-white/40 text-xs">
                                            <th className="text-left py-2">항목</th>
                                            <th className="text-left py-2">결과지 값</th>
                                            <th className="text-left py-2">앱 기록</th>
                                            <th className="text-left py-2">처리</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {valueFields.map(field => (
                                            <tr key={field.path} className="border-t border-white/5">
                                                <td className="py-2 text-white/70">{field.label}</td>
                                                <td className="py-2">
                                                    <input
                                                        className="input-field !py-1.5 !w-28 text-sm"
                                                        aria-label={`${field.label} 결과지 값`}
                                                        value={field.extracted.value === null ? '' : String(field.extracted.value)}
                                                        disabled={Boolean(active.confirmedAt)}
                                                        onChange={event => setFieldValue(active, field.path, event.target.value)}
                                                    />
                                                </td>
                                                <td className="py-2 text-white/50 tabular-nums">
                                                    {field.directValue === undefined || field.directValue === null ? '—' : String(field.directValue)}
                                                    {field.comparison === 'CONFLICT' && <span className="text-amber-300 ml-1">다름</span>}
                                                    {field.comparison === 'MATCHED' && <span className="text-emerald-300 ml-1">일치</span>}
                                                </td>
                                                <td className="py-2">
                                                    {active.confirmedAt ? (
                                                        <span className="text-xs text-white/40">{field.status}</span>
                                                    ) : (
                                                        <div className="flex gap-1">
                                                            <button
                                                                type="button"
                                                                className="btn-ghost !px-2 !py-1 text-xs"
                                                                aria-label={`${field.label} 확인함`}
                                                                onClick={() => setFieldStatus(active, field.path, field.status === 'VERIFIED' ? 'EXTRACTED' : 'VERIFIED')}
                                                            >
                                                                <Check size={14} className={field.status === 'VERIFIED' ? 'text-emerald-300' : ''} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn-ghost !px-2 !py-1 text-xs"
                                                                aria-label={`${field.label} 제외`}
                                                                onClick={() => setFieldStatus(active, field.path, field.status === 'REJECTED' ? 'EXTRACTED' : 'REJECTED')}
                                                            >
                                                                <X size={14} className={field.status === 'REJECTED' ? 'text-rose-300' : ''} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {normFields.length > 0 && (
                        <section className="glass-card !p-5">
                            <h4 className="font-semibold text-white mb-1">결과지에 인쇄된 규준 값</h4>
                            <p className="text-xs text-white/40 mb-3">
                                공단 프로그램이 산출한 값입니다. 앱은 이 값을 계산하지 않고 그대로 씁니다.
                            </p>
                            <ul className="text-sm text-white/70 space-y-1">
                                {normFields.map(field => (
                                    <li key={field.path} className="flex justify-between gap-3 border-b border-white/5 py-1 last:border-0">
                                        <span>{field.label}</span>
                                        <span className="tabular-nums text-white/80">
                                            {field.extracted.value === null ? '—' : String(field.extracted.value)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
