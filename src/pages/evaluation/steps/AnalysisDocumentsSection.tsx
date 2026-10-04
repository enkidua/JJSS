/**
 * 그 밖의 검사 분석지(흥미검사·사회적응도·심리검사 등) 모으기.
 * PDF를 넣으면 문서에 적힌 내용이 보고서 영역별 문장으로 정리되고, ⑦ 보고서 초안에 자동으로 들어간다.
 * AI 없이도 "직접 입력"으로 같은 기록을 만들 수 있다.
 */
import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { FilePlus2, Loader2, PenLine, Plus, Trash2 } from 'lucide-react';
import {
    ANALYSIS_AREAS,
    ANALYSIS_AREA_LABELS,
    ANALYSIS_FALLBACK_AREA,
    analysisTitle,
    createAnalysisDocument,
    createAnalysisFinding,
    type AnalysisArea,
    type AnalysisDocumentRecord,
    type EvaluationEpisode,
} from '../../../features/vocationalEvaluation';
import { readAnalysisDocument } from '../../../features/vocationalEvaluation/analysisDocument/extraction';
import { sha256Hex } from '../../../features/vocationalEvaluation/sourceDocument/extraction';
import { deleteAnalysisDocument, saveAnalysisDocument } from '../../../features/vocationalEvaluation/storage';
import { FileDropZone } from '../../../components/common/FileDropZone';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { useAppToast } from '../../../components/Toast';
import { useKeyedSaveQueue } from '../useKeyedSaveQueue';

const EDIT_SAVE_DEBOUNCE_MS = 500;

export function AnalysisDocumentsSection({
    episode,
    analyses,
    onAnalysesChange,
    locked = false,
}: {
    episode: EvaluationEpisode;
    analyses: AnalysisDocumentRecord[];
    /** 목록 갱신. 함수형 갱신을 쓴다 — 여러 장을 차례로 읽는 동안 다른 기록을 고쳐도 서로 지우지 않게 */
    onAnalysesChange: Dispatch<SetStateAction<AnalysisDocumentRecord[]>>;
    locked?: boolean;
}) {
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const confirm = useConfirm();
    const showToast = useAppToast();
    // 기록마다 저장을 한 줄로 세운다(글자 입력마다 저장이 겹쳐 예전 글자가 최신을 덮지 않게).
    // 진행 중·실패 상태는 페이지의 이동·창 닫기 보호에 잡힌다.
    const queue = useKeyedSaveQueue<AnalysisDocumentRecord>(
        saveAnalysisDocument,
        message => showToast(message || '분석지 기록을 저장하지 못했습니다.', 'error'),
    );

    // 최신 목록. 렌더 사이(파일을 차례로 읽는 동안 등)에 바뀐 값도 바로 보이도록 갱신할 때 함께 고친다.
    const analysesRef = useRef(analyses);
    analysesRef.current = analyses;

    /** 최신 목록에서 이 기록만 고친다(기다리는 동안 바뀐 다른 기록은 그대로). */
    const persist = (id: string, mutate: (current: AnalysisDocumentRecord) => AnalysisDocumentRecord, debounce = false) => {
        const base = analysesRef.current.find(item => item.id === id);
        if (!base) return;
        const value = mutate(base);
        analysesRef.current = analysesRef.current.map(item => (item.id === id ? value : item));
        onAnalysesChange(current => current.map(item => (item.id === id ? value : item)));
        if (debounce) queue.saveDebounced(id, value, EDIT_SAVE_DEBOUNCE_MS);
        else void queue.save(id, value);
    };

    const append = async (record: AnalysisDocumentRecord) => {
        analysesRef.current = [...analysesRef.current, record];
        onAnalysesChange(current => [...current, record]);
        await queue.save(record.id, record);
    };

    const handleFiles = async (files: File[]) => {
        if (!files.length || busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        try {
            // 여러 장을 한 번에 넣어도 한 장씩 차례로 읽는다(요청 한도·개인정보 관문은 기존 규칙 그대로).
            for (const file of files) {
                const outcome = await readAnalysisDocument({ file });
                const record: AnalysisDocumentRecord = {
                    ...createAnalysisDocument({
                        episodeId: episode.id,
                        seekerId: episode.seekerId,
                        seekerName: episode.seekerName,
                        fileName: file.name,
                        fileSize: file.size,
                        sha256: await sha256Hex(file),
                        pageCount: outcome.pageCount,
                        source: 'AI',
                    }),
                    detectedTitle: outcome.detectedTitle || undefined,
                    model: outcome.model,
                    extractedAt: new Date().toISOString(),
                    extractionStatus: outcome.failureReason ? 'FAILED' : 'SUCCEEDED',
                    failureReason: outcome.failureReason,
                    findings: outcome.findings,
                    warnings: outcome.warnings,
                };
                await append(record);
                if (outcome.failureReason) showToast(`${file.name}: ${outcome.failureReason}`, 'error');
                else showToast(`${analysisTitle(record)} — ${outcome.findings.length}개 문장으로 정리했습니다.`, 'success');
            }
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const handleManual = async () => {
        const record = createAnalysisDocument({
            episodeId: episode.id,
            seekerId: episode.seekerId,
            seekerName: episode.seekerName,
            source: 'MANUAL',
        });
        await append({ ...record, detectedTitle: '직접 입력 분석지', findings: [createAnalysisFinding(ANALYSIS_FALLBACK_AREA, '')] });
    };

    const handleDelete = async (record: AnalysisDocumentRecord) => {
        const ok = await confirm({
            title: '분석지 기록을 삭제할까요?',
            message: `"${analysisTitle(record)}"의 정리 문장이 함께 삭제됩니다. 이미 만든 보고서에는 영향이 없습니다.`,
            confirmLabel: '삭제',
        });
        if (!ok) return;
        try {
            await deleteAnalysisDocument(record.id);
            onAnalysesChange(current => current.filter(item => item.id !== record.id));
        } catch (error) {
            showToast(error instanceof Error ? error.message : '삭제하지 못했습니다.', 'error');
        }
    };

    const updateFinding = (record: AnalysisDocumentRecord, findingId: string, patch: { area?: AnalysisArea; text?: string; included?: boolean }) => {
        // 글자 입력은 잠깐 모았다가 저장하고, 체크·영역 변경은 바로 저장한다.
        persist(record.id, current => ({
            ...current,
            findings: current.findings.map(finding => {
                if (finding.id !== findingId) return finding;
                const next = { ...finding, ...patch };
                // 본문을 고치면 차단 여부를 다시 판정한다(normalize가 저장 시 한 번 더 확인한다).
                if (patch.text !== undefined) {
                    const fresh = createAnalysisFinding(next.area, patch.text);
                    // 빈 문장에 처음 글을 채우면 포함으로 켠다. 이미 글이 있던 문장은 평가사의 포함/제외 선택을 지킨다.
                    const included = fresh.blocked ? false : finding.text.trim() ? next.included : fresh.included;
                    return { ...fresh, id: finding.id, included };
                }
                return next;
            }),
        }), patch.text !== undefined);
    };

    return (
        <section className="glass-card p-5! space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-semibold text-white">그 밖의 검사 분석지</h3>
                    <p className="text-xs text-white/45 mt-1">
                        직업흥미검사·사회적응도(CISA-2)·심리검사·신체능력 측정표 등 어떤 분석지든 넣으세요. 문서에 적힌
                        내용이 보고서 영역별 문장으로 정리되어 ⑦ 보고서 초안에 자동으로 들어갑니다.
                    </p>
                </div>
                <button type="button" className="btn-secondary px-3! py-2! text-sm" disabled={locked} onClick={() => void handleManual()}>
                    <PenLine size={14} className="inline mr-1" /> 직접 입력
                </button>
            </div>
            {!locked && (
                <FileDropZone
                    accept="application/pdf"
                    multiple
                    disabled={busy}
                    onFiles={files => void handleFiles(files)}
                    ariaLabel="분석지 PDF 선택"
                    className="glass rounded-xl p-6 text-center cursor-pointer border border-dashed border-white/20 hover:bg-white/10 transition-all"
                    activeClassName="bg-white/10 border-primary-400"
                >
                    <span className="text-sm text-white/60 inline-flex items-center gap-2">
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />}
                        {busy ? '분석지를 읽는 중…' : '분석지 PDF를 끌어다 놓거나 눌러서 선택하세요 (여러 장 가능)'}
                    </span>
                </FileDropZone>
            )}
            <p className="text-[11px] text-white/35">
                글자가 있는 PDF는 PC 안에서 글만 뽑아 이름을 가린 뒤 보내고 원본은 보내지 않습니다. 취업 가능·직무 적합 같은
                단정 표현은 자동으로 제외 표시됩니다(평가사 판단 영역).
            </p>

            {analyses.map(record => (
                <div key={record.id} className="glass rounded-xl p-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <p className="text-sm font-semibold text-white/85">{analysisTitle(record)}</p>
                            <p className="text-[11px] text-white/35">
                                {record.source === 'MANUAL' ? '직접 입력' : record.fileName}
                                {record.extractionStatus === 'FAILED' ? ' · 읽기 실패' : ` · 문장 ${record.findings.length}개`}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="btn-secondary px-2.5! py-1.5! text-xs"
                                disabled={locked}
                                onClick={() =>
                                    persist(record.id, current => ({
                                        ...current,
                                        findings: [...current.findings, createAnalysisFinding(ANALYSIS_FALLBACK_AREA, '')],
                                    }))
                                }
                            >
                                <Plus size={12} className="inline mr-1" /> 문장 추가
                            </button>
                            <button type="button" className="btn-ghost px-2! py-1.5! text-xs" disabled={locked} aria-label={`${analysisTitle(record)} 삭제`} onClick={() => void handleDelete(record)}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                    {record.failureReason && <p className="text-xs text-rose-200">{record.failureReason}</p>}
                    {record.warnings.map((warning, index) => (
                        <p key={index} className="text-xs text-amber-200/80">
                            {warning}
                        </p>
                    ))}
                    <ul className="space-y-2">
                        {record.findings.map(finding => (
                            <li key={finding.id} className="flex flex-wrap items-start gap-2">
                                <input
                                    type="checkbox"
                                    className="mt-2.5"
                                    checked={finding.included}
                                    disabled={locked || Boolean(finding.blocked)}
                                    aria-label="보고서에 포함"
                                    title={finding.blocked ?? '보고서 초안에 포함'}
                                    onChange={event => updateFinding(record, finding.id, { included: event.target.checked })}
                                />
                                <select
                                    className="input-field w-44! py-1.5! text-xs"
                                    value={finding.area}
                                    disabled={locked}
                                    aria-label="보고서 영역"
                                    onChange={event => updateFinding(record, finding.id, { area: event.target.value as AnalysisArea })}
                                >
                                    {ANALYSIS_AREAS.map(area => (
                                        <option key={area} value={area}>
                                            {ANALYSIS_AREA_LABELS[area]}
                                        </option>
                                    ))}
                                </select>
                                <div className="flex-1 min-w-[220px]">
                                    <textarea
                                        className="textarea-field py-1.5! text-sm"
                                        rows={2}
                                        value={finding.text}
                                        disabled={locked}
                                        aria-label="분석지 문장"
                                        placeholder="분석지에 적힌 내용을 문장으로"
                                        onChange={event => updateFinding(record, finding.id, { text: event.target.value })}
                                    />
                                    {finding.blocked && <p className="text-[11px] text-amber-200/80 mt-0.5">자동 제외: {finding.blocked}</p>}
                                </div>
                                <button
                                    type="button"
                                    className="btn-ghost px-2! py-1.5! text-xs mt-1"
                                    disabled={locked}
                                    aria-label="문장 삭제"
                                    onClick={() =>
                                        persist(record.id, current => ({
                                            ...current,
                                            findings: current.findings.filter(item => item.id !== finding.id),
                                        }))
                                    }
                                >
                                    <Trash2 size={13} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </section>
    );
}
