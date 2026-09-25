/**
 * 보고서 단계. 자동 조립 문단과 평가사 직접 서술을 함께 쓰고, 확정하면 잠근다.
 * AI가 전혀 없어도 직접 서술만으로 보고서를 완결할 수 있다.
 */
import { useCallback, useMemo, useState } from 'react';
import { FileDown, FileText, Lock, Plus, RefreshCw } from 'lucide-react';
import {
    buildResultTables,
    composeSections,
    confirmReport,
    createNextVersion,
    createReport,
    fillToolRows,
    isLocked,
    type EvaluationEpisode,
    type EvaluationReport,
    type SourceDocumentRecord,
    type TestSession,
} from '../../../features/vocationalEvaluation';
import { buildReportDocx, buildReportHtml, reportFileName } from '../../../features/vocationalEvaluation/report/document';
import { refreshRunStaleness } from '../../../features/vocationalEvaluation/interpretation/staleness';
import { packDocument } from '../../../features/docx/blocks';
import { saveReport } from '../../../features/vocationalEvaluation/storage';
import { saveJjssBlob, saveJjssPdf, savedLocationMessage } from '../../../utils/jjssFileService';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { useAppToast } from '../../../components/Toast';
import { useDataStore } from '../../../store/dataStore';
import { useSaveQueue } from '../useSaveQueue';
import { localDateKey } from '../../../utils/date';
import { getSeekerKey } from '../../../utils/seeker';

const SAVE_DEBOUNCE_MS = 650;

export function ReportStep({
    episode,
    sessions,
    documents,
    reports,
    onReportsChange,
    onEpisodeChange,
    locked: episodeLocked = false,
}: {
    episode: EvaluationEpisode;
    sessions: TestSession[];
    documents: SourceDocumentRecord[];
    reports: EvaluationReport[];
    onReportsChange: (next: EvaluationReport[]) => void;
    onEpisodeChange: (next: EvaluationEpisode) => void;
    /** 회차가 보관(ARCHIVED) 상태면 보고서도 읽기 전용이다 */
    locked?: boolean;
}) {
    const seekers = useDataStore(state => state.seekers);
    const [activeId, setActiveId] = useState<string | null>(reports[reports.length - 1]?.id ?? null);
    const [busy, setBusy] = useState(false);
    const [previewHtml, setPreviewHtml] = useState('');
    const confirm = useConfirm();
    const showToast = useAppToast();

    const report = reports.find(item => item.id === activeId) ?? reports[reports.length - 1] ?? null;
    const seeker = useMemo(
        () => seekers.find(item => getSeekerKey(item) === episode.seekerId) as Record<string, unknown> | undefined,
        [seekers, episode.seekerId],
    );

    const queue = useSaveQueue<EvaluationReport>(
        async next => {
            await saveReport(next);
        },
        message => showToast(message, 'error'),
    );
    const update = useCallback(
        (next: EvaluationReport) => {
            onReportsChange(reports.map(item => (item.id === next.id ? next : item)));
            queue.saveDebounced(next, SAVE_DEBOUNCE_MS);
        },
        [onReportsChange, queue, reports],
    );

    const text = (value: unknown) => (typeof value === 'string' ? value : '');

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
                  header: {
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
                  },
                  purpose: episode.purpose,
              });
        const composed: EvaluationReport = {
            ...base,
            tools: fillToolRows(base.tools, sessions),
            sections: composeSections({ episode: currentEpisode, sessions, documents }, base.sections),
            resultTables: buildResultTables(sessions, documents),
        };
        try {
            const saved = await saveReport(composed);
            onReportsChange([...reports, saved]);
            setActiveId(saved.id);
        } catch (error) {
            showToast(error instanceof Error ? error.message : '보고서를 만들지 못했습니다.', 'error');
        }
    };

    const handleRecompose = async () => {
        if (!report || isLocked(report)) return;
        const currentEpisode = await freshEpisode();
        update({
            ...report,
            tools: fillToolRows(report.tools, sessions),
            sections: composeSections({ episode: currentEpisode, sessions, documents }, report.sections),
            resultTables: buildResultTables(sessions, documents),
        });
        showToast('자동 문단과 결과표를 다시 만들었습니다.', 'success');
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
            onReportsChange(reports.map(item => (item.id === confirmed.id ? confirmed : item)));
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
                    회차 정보·검사 결과·채택한 해석 문장을 모아 보고서 초안을 만듭니다. 만든 뒤에도 모든 항목을 직접 고칠 수 있습니다.
                </p>
                <button type="button" className="btn-primary" onClick={() => void handleCreate()} disabled={episodeLocked}>
                    <Plus size={16} className="inline mr-1" /> 보고서 만들기
                </button>
            </div>
        );
    }

    const locked = isLocked(report) || episodeLocked;

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
                            <RefreshCw size={14} className="inline mr-1" /> 자동 문단 새로 만들기
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
                <h3 className="font-semibold text-white">머리 정보</h3>
                <div className="grid md:grid-cols-2 gap-3">
                    {(
                        [
                            ['evaluationOrganization', '평가실시기관'],
                            ['referralOrganization', '의뢰요청기관'],
                            ['evaluationDate', '평가일'],
                            ['seekerName', '성명'],
                            ['birthDate', '생년월일'],
                            ['contact', '연락처'],
                            ['address', '거주지'],
                            ['disability', '장애유형/정도'],
                            ['sex', '성별'],
                        ] as const
                    ).map(([key, label]) => (
                        <div key={key}>
                            <label htmlFor={`ve-report-${key}`} className="text-sm text-white/60">
                                {label}
                            </label>
                            <input
                                id={`ve-report-${key}`}
                                className="input-field mt-1"
                                disabled={locked}
                                value={report.header[key]}
                                onChange={event => update({ ...report, header: { ...report.header, [key]: event.target.value } })}
                            />
                        </div>
                    ))}
                </div>
            </section>

            <section className="glass-card !p-5 space-y-3">
                <h3 className="font-semibold text-white">평가목적</h3>
                <textarea
                    className="textarea-field"
                    rows={3}
                    aria-label="평가목적"
                    disabled={locked}
                    value={report.purpose}
                    onChange={event => update({ ...report, purpose: event.target.value })}
                />
            </section>

            <section className="glass-card !p-5 space-y-3">
                <h3 className="font-semibold text-white">평가 도구(방법)</h3>
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
                <h3 className="font-semibold text-white">종합소견 및 직업재활방향</h3>
                {(
                    [
                        ['vocationalLevel', '직업수준'],
                        ['goalSelf', '직업목표(당사자)'],
                        ['goalGuardian', '직업목표(보호자·지원자)'],
                        ['strengths', '직업적 강점'],
                        ['limitations', '제한점·고려사항'],
                        ['recommendation', '추천(적합 추천 직무 및 사유)'],
                        ['recommendedPrograms', '추천직무·프로그램'],
                    ] as const
                ).map(([key, label]) => (
                    <div key={key}>
                        <label htmlFor={`ve-summary-${key}`} className="text-sm text-white/60">
                            {label}
                        </label>
                        <textarea
                            id={`ve-summary-${key}`}
                            className="textarea-field mt-1"
                            rows={2}
                            disabled={locked}
                            value={report.summary[key]}
                            onChange={event => update({ ...report, summary: { ...report.summary, [key]: event.target.value } })}
                        />
                    </div>
                ))}
            </section>

            <section className="glass-card !p-5 space-y-4">
                <h3 className="font-semibold text-white">평가 상세</h3>
                {report.sections.map(section => (
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
