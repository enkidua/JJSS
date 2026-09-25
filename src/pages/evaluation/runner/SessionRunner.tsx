/**
 * 검사 실시 화면. 손기능(21시행)과 다차원 양손협응(1회 측정)을 함께 다룬다.
 * 앱은 실시요강에 따라 시행한 결과를 기록만 하고, 실물 검사 도구나 공단 프로그램을 대체하지 않는다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CircleSlash, Pause, Play, RotateCcw, Save, Square } from 'lucide-react';
import {
    COMPONENT_KEYS,
    conditionSummaries,
    currentMeasurement,
    getTestPlugin,
    totalCompleted,
    totalMaximum,
    validateSession,
    type EvaluationEventType,
    type TestSession,
} from '../../../features/vocationalEvaluation';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { useAppToast } from '../../../components/Toast';
import { useSessionRunner } from '../useSessionRunner';
import { EventQuickActions } from './EventQuickActions';
import { ScoreControl } from './ScoreControl';
import { TimerDisplay } from './TimerDisplay';
import { TrialRail } from './TrialRail';

export function SessionRunner({
    session: initial,
    evaluator,
    onSaved,
    onClose,
}: {
    session: TestSession;
    evaluator: string;
    onSaved?: (session: TestSession) => void;
    onClose: () => void;
}) {
    const runner = useSessionRunner(initial, onSaved);
    const { session } = runner;
    const plugin = getTestPlugin(session.testPluginId);
    const confirm = useConfirm();
    const showToast = useAppToast();
    const [skipOpen, setSkipOpen] = useState(false);
    const [skipReason, setSkipReason] = useState('');
    const errorShownRef = useRef('');

    const measurement = currentMeasurement(session);
    const trial = session.trials.find(item => item.id === session.currentTrialId);
    const editable = session.status === 'IN_PROGRESS';
    const issues = useMemo(() => validateSession(session), [session]);

    useEffect(() => {
        if (runner.lastError && runner.lastError !== errorShownRef.current) {
            errorShownRef.current = runner.lastError;
            showToast(runner.lastError, 'error');
            runner.clearError();
        }
    }, [runner, showToast]);

    /* 키보드 우선 조작 — 입력란·다이얼로그 위에서는 가로채지 않는다. */
    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.repeat || event.isComposing || !editable) return;
            const target = event.target as HTMLElement | null;
            const editing = target?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="alertdialog"]');
            const status = currentMeasurement(session).status;
            const shortcut = plugin.events.find(item => item.shortcut === event.key);
            if (shortcut && !editing && ['RUNNING', 'PAUSED', 'FINISHED'].includes(status)) {
                event.preventDefault();
                runner.addEvent(shortcut.type);
                return;
            }
            if (event.ctrlKey && event.key.toLowerCase() === 'z' && !editing) {
                event.preventDefault();
                runner.undoEvent();
                return;
            }
            if (editing) {
                // 수행량 입력란에서 Enter를 누르면 확정으로 이어 간다.
                if (
                    event.key === 'Enter' &&
                    !session.bimanual &&
                    target?.matches('input[aria-label="수행량"]') &&
                    status === 'FINISHED' &&
                    trial?.score !== undefined
                ) {
                    event.preventDefault();
                    runner.confirmTrial();
                }
                return;
            }
            const activating = target?.closest('button,a[href],summary,[role="button"]');
            if ((event.code === 'Space' || event.key === 'Enter') && activating) return;
            if (event.code === 'Space') {
                event.preventDefault();
                if (status === 'RUNNING') runner.pause();
                else if (status === 'READY' || status === 'PAUSED') runner.start();
            } else if (event.key === 'Escape' && status === 'RUNNING') {
                event.preventDefault();
                runner.pause();
            } else if (event.key === 'Enter' && !session.bimanual && status === 'FINISHED' && trial?.score !== undefined) {
                event.preventDefault();
                runner.confirmTrial();
            } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !session.bimanual) {
                if (['PAUSED', 'FINISHED'].includes(status)) {
                    event.preventDefault();
                    runner.adjustScore(event.key === 'ArrowUp' ? 1 : -1);
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [editable, plugin.events, runner, session, trial?.score]);

    const handleConfirmSession = async () => {
        if (issues.length) {
            showToast('아직 정리되지 않은 시행이 있습니다.', 'error');
            return;
        }
        const ok = await confirm({
            title: '검사 기록을 확정할까요?',
            message: '확정하면 이 검사의 수행량과 기록이 잠깁니다. 필요하면 다시 열 수 있습니다.',
            confirmLabel: '확정',
        });
        if (!ok) return;
        runner.confirmWholeSession(evaluator || '평가사');
        showToast('검사 기록을 확정했습니다.', 'success');
    };

    const handleReopen = async () => {
        const ok = await confirm({
            title: '기록을 다시 열까요?',
            message: '확정을 풀고 수정할 수 있게 합니다. 이미 만든 보고서에는 영향을 주지 않습니다.',
        });
        if (ok) runner.reopen();
    };

    const bimanualState = session.bimanual;
    const saveLabel =
        runner.saveState === 'SAVING' ? '저장 중…' : runner.saveState === 'ERROR' ? '저장 실패' : '저장됨';

    return (
        <div className="space-y-4">
            <header className="glass-card !p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-lg font-bold text-white">{plugin.manifest.name}</h3>
                        <p className="text-sm text-white/50 mt-1">{plugin.manifest.durationNote}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span
                            className={`text-xs px-2 py-1 rounded-lg ${
                                runner.saveState === 'ERROR' ? 'bg-rose-500/20 text-rose-200' : 'bg-white/10 text-white/60'
                            }`}
                        >
                            <Save size={12} className="inline mr-1" />
                            {saveLabel}
                        </span>
                        <button
                            type="button"
                            className="btn-secondary !px-4 !py-2 text-sm"
                            onClick={async () => {
                                // 메모처럼 지연 저장 중인 내용을 끝내고 나간다.
                                await runner.flushSave();
                                onClose();
                            }}
                        >
                            목록으로
                        </button>
                    </div>
                </div>
                <p className="text-xs text-white/40 mt-3">{plugin.manifest.procedureNote}</p>
                {runner.saveState === 'ERROR' && <p className="text-xs text-rose-300 mt-2">{runner.saveError}</p>}
            </header>

            {session.status === 'COMPLETED' && (
                <div className="glass rounded-xl p-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-emerald-200">
                        확정된 기록입니다{session.confirmedBy ? ` · 확정자 ${session.confirmedBy}` : ''}.
                    </p>
                    <button type="button" className="btn-secondary !px-4 !py-2 text-sm" onClick={handleReopen}>
                        다시 열기
                    </button>
                </div>
            )}

            {session.status === 'PAUSED' && (
                <div className="glass rounded-xl p-4 flex items-center justify-between gap-3">
                    <p className="text-sm text-amber-200">
                        {session.recoveryReason === 'CRASH'
                            ? '앱이 예기치 않게 종료되어 진행 중이던 측정을 중단으로 남겼습니다. 해당 시행은 다시 실시하세요.'
                            : '검사를 일시정지했습니다.'}
                    </p>
                    <button type="button" className="btn-primary !px-4 !py-2 text-sm" onClick={runner.resume}>
                        재개
                    </button>
                </div>
            )}

            {session.failedAt && (
                <div className="glass rounded-xl p-4 border-rose-400/30">
                    <p className="text-sm text-rose-200">
                        <AlertTriangle size={14} className="inline mr-1" />
                        중단이 3회 이상 있었습니다. 실시요강에 따르면 검사를 중지하고 실패로 봅니다. 계속할지 평가사가 판단하세요.
                    </p>
                </div>
            )}

            {session.reinstructionCount > 2 && (
                <div className="glass rounded-xl p-4 border-amber-400/30">
                    <p className="text-sm text-amber-200">
                        재설명이 {session.reinstructionCount}회입니다. 실시요강은 재설명을 2회로 한정합니다.
                    </p>
                </div>
            )}

            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
                <section className="glass-card !p-5 space-y-5">
                    {bimanualState ? (
                        <>
                            <div className="text-center">
                                <p className="text-sm text-white/50">조립 측정 · 1회</p>
                                <TimerDisplay
                                    remainingMs={runner.remainingMs}
                                    durationSeconds={bimanualState.attempt.durationSeconds}
                                    status={bimanualState.attempt.status}
                                />
                            </div>
                            <div className="flex flex-wrap justify-center gap-2">
                                {bimanualState.attempt.status === 'READY' && (
                                    <button type="button" className="btn-primary" onClick={runner.start} disabled={!editable}>
                                        <Play size={16} className="inline mr-1" /> 측정 시작
                                    </button>
                                )}
                                {bimanualState.attempt.status === 'RUNNING' && (
                                    <>
                                        <button type="button" className="btn-secondary" onClick={runner.pause}>
                                            <Pause size={16} className="inline mr-1" /> 일시정지
                                        </button>
                                        <button type="button" className="btn-secondary" onClick={runner.finish}>
                                            <Square size={14} className="inline mr-1" /> 측정 종료
                                        </button>
                                    </>
                                )}
                                {bimanualState.attempt.status === 'PAUSED' && (
                                    <>
                                        <button type="button" className="btn-primary" onClick={runner.start}>
                                            <Play size={16} className="inline mr-1" /> 계속 측정
                                        </button>
                                        <button type="button" className="btn-secondary" onClick={runner.finish}>
                                            <Square size={14} className="inline mr-1" /> 측정 종료
                                        </button>
                                    </>
                                )}
                                {['FINISHED', 'INTERRUPTED'].includes(bimanualState.attempt.status) && editable && (
                                    <button type="button" className="btn-secondary" onClick={runner.restartMeasurement}>
                                        <RotateCcw size={14} className="inline mr-1" /> 다시 측정
                                    </button>
                                )}
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-white/80">부품별 수행량</h4>
                                    <span className="text-sm text-white/60 tabular-nums">
                                        총합 {totalCompleted(bimanualState.attempt.result)} / {totalMaximum(bimanualState.specification)}
                                    </span>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    {COMPONENT_KEYS.map(key => {
                                        const spec = bimanualState.specification.components.find(item => item.key === key);
                                        if (!spec) return null;
                                        return (
                                            <div key={key} className="flex items-center justify-between gap-2 glass rounded-xl px-3 py-2">
                                                <span className="text-sm text-white/70">{spec.label}</span>
                                                <ScoreControl
                                                    label={spec.label}
                                                    score={bimanualState.attempt.result.components[key]}
                                                    max={spec.maximum}
                                                    disabled={!editable || !['FINISHED', 'CONFIRMED'].includes(bimanualState.attempt.status)}
                                                    onChange={value => runner.setComponent(key, value)}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                                <p className="text-xs text-white/40 mt-3">
                                    분모는 실시요강 부록2 기준입니다(판만 1, 나머지 4 — 총 {totalMaximum(bimanualState.specification)}).
                                    기록시간이 다 찼다고 해서 전부 조립한 것으로 보지 않습니다.
                                </p>
                            </div>
                        </>
                    ) : trial ? (
                        <>
                            <div className="text-center">
                                <p className="text-sm text-white/50">
                                    {trial.label} · 전체 {trial.sequence}/{session.trials.length}
                                </p>
                                <TimerDisplay
                                    remainingMs={runner.remainingMs}
                                    durationSeconds={trial.durationSeconds}
                                    status={trial.status}
                                />
                            </div>

                            {['PAUSED', 'FINISHED', 'CONFIRMED'].includes(trial.status) && (
                                <div className="flex flex-col items-center gap-2">
                                    <ScoreControl
                                        score={trial.score}
                                        autoFocus={trial.status === 'FINISHED'}
                                        disabled={!editable}
                                        onChange={value => runner.updateScore(value)}
                                    />
                                    <p className="text-xs text-white/40">제한시간 안에 꽂은 핀의 개수입니다. 0도 직접 확인해 입력하세요.</p>
                                </div>
                            )}

                            <div className="flex flex-wrap justify-center gap-2">
                                {trial.status === 'READY' && (
                                    <button type="button" className="btn-primary" onClick={runner.start} disabled={!editable}>
                                        <Play size={16} className="inline mr-1" /> 검사 시작 <kbd className="ml-1 text-[10px]">Space</kbd>
                                    </button>
                                )}
                                {trial.status === 'RUNNING' && (
                                    <>
                                        <button type="button" className="btn-secondary" onClick={runner.pause}>
                                            <Pause size={16} className="inline mr-1" /> 일시정지
                                        </button>
                                        <button type="button" className="btn-secondary" onClick={runner.finish}>
                                            <Square size={14} className="inline mr-1" /> 측정 종료
                                        </button>
                                        <button type="button" className="btn-ghost" onClick={runner.interrupt}>
                                            중단
                                        </button>
                                    </>
                                )}
                                {trial.status === 'PAUSED' && (
                                    <>
                                        <button type="button" className="btn-primary" onClick={runner.start}>
                                            <Play size={16} className="inline mr-1" /> 계속 측정
                                        </button>
                                        <button type="button" className="btn-secondary" onClick={runner.finish}>
                                            <Square size={14} className="inline mr-1" /> 측정 종료
                                        </button>
                                    </>
                                )}
                                {trial.status === 'FINISHED' && (
                                    <>
                                        <button
                                            type="button"
                                            className="btn-primary"
                                            disabled={trial.score === undefined || !editable}
                                            onClick={runner.confirmTrial}
                                        >
                                            <Check size={16} className="inline mr-1" /> 이 시행 확정 <kbd className="ml-1 text-[10px]">Enter</kbd>
                                        </button>
                                        <button type="button" className="btn-secondary" onClick={runner.restartMeasurement}>
                                            <RotateCcw size={14} className="inline mr-1" /> 다시 측정
                                        </button>
                                    </>
                                )}
                                {trial.status === 'INTERRUPTED' && (
                                    <button type="button" className="btn-primary" onClick={runner.restartMeasurement}>
                                        <RotateCcw size={14} className="inline mr-1" /> 다시 실시
                                    </button>
                                )}
                                {trial.trialNumber > 1 && !['CONFIRMED', 'SKIPPED'].includes(trial.status) && editable && (
                                    <button type="button" className="btn-ghost" onClick={() => setSkipOpen(true)}>
                                        <CircleSlash size={14} className="inline mr-1" /> 미실시로 두기
                                    </button>
                                )}
                            </div>

                            {skipOpen && (
                                <div className="glass rounded-xl p-4 space-y-2">
                                    <label htmlFor="ve-skip-reason" className="text-sm text-white/70">
                                        미실시 사유 (실시요강은 3회가 원칙이므로 사유를 남깁니다)
                                    </label>
                                    <input
                                        id="ve-skip-reason"
                                        className="input-field"
                                        value={skipReason}
                                        onChange={event => setSkipReason(event.target.value)}
                                        placeholder="예: 피로 호소로 2차 미실시"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="btn-primary !px-4 !py-2 text-sm"
                                            onClick={() => {
                                                runner.skip(skipReason);
                                                setSkipReason('');
                                                setSkipOpen(false);
                                            }}
                                        >
                                            미실시로 저장
                                        </button>
                                        <button
                                            type="button"
                                            className="btn-secondary !px-4 !py-2 text-sm"
                                            onClick={() => {
                                                setSkipOpen(false);
                                                setSkipReason('');
                                            }}
                                        >
                                            취소
                                        </button>
                                    </div>
                                </div>
                            )}

                            {trial.skipReason && <p className="text-xs text-white/40 text-center">미실시 사유: {trial.skipReason}</p>}

                            <div>
                                <label htmlFor="ve-trial-memo" className="text-sm text-white/70">
                                    이 시행 메모 (선택)
                                </label>
                                <textarea
                                    id="ve-trial-memo"
                                    className="textarea-field mt-1"
                                    rows={2}
                                    maxLength={1000}
                                    disabled={!editable}
                                    value={trial.memo}
                                    onChange={event => runner.updateMemo(event.target.value)}
                                    placeholder="직접 확인한 사실을 짧게 기록하세요."
                                />
                            </div>
                        </>
                    ) : (
                        <p className="text-white/50">시행 정보를 불러오지 못했습니다.</p>
                    )}

                    <EventQuickActions
                        session={session}
                        disabled={!editable || !['RUNNING', 'PAUSED', 'FINISHED'].includes(measurement.status)}
                        onRecord={(type: EvaluationEventType) => runner.addEvent(type)}
                        onUndo={runner.undoEvent}
                    />
                </section>

                <aside className="space-y-3">
                    {!bimanualState && <TrialRail session={session} onSelect={runner.selectTrial} />}
                    {bimanualState && bimanualState.previousAttempts.length > 0 && (
                        <div className="glass rounded-xl p-3">
                            <p className="text-sm text-white/70 mb-1">이전 측정 {bimanualState.previousAttempts.length}회</p>
                            <p className="text-xs text-white/40">재실시 기록은 지우지 않고 함께 남습니다.</p>
                        </div>
                    )}

                    <div className="glass rounded-xl p-3">
                        <label htmlFor="ve-session-note" className="text-sm text-white/70">
                            검사 메모
                        </label>
                        <textarea
                            id="ve-session-note"
                            className="textarea-field mt-1"
                            rows={3}
                            maxLength={2000}
                            disabled={!editable}
                            value={session.sessionNote}
                            onChange={event => runner.updateSessionNote(event.target.value)}
                            placeholder="검사 환경, 보조기기, 특이사항 등"
                        />
                    </div>

                    <div className="glass rounded-xl p-3 space-y-2">
                        <p className="text-sm text-white/70">확정 전 확인</p>
                        {issues.length === 0 ? (
                            <p className="text-xs text-emerald-200">모든 시행이 정리되었습니다.</p>
                        ) : (
                            <ul className="text-xs text-amber-200 space-y-1 max-h-40 overflow-auto">
                                {issues.slice(0, 8).map(issue => (
                                    <li key={issue.id}>· {issue.message}</li>
                                ))}
                                {issues.length > 8 && <li className="text-white/40">외 {issues.length - 8}건</li>}
                            </ul>
                        )}
                        {session.status !== 'COMPLETED' && (
                            <button
                                type="button"
                                className="btn-primary w-full !py-2 text-sm"
                                disabled={issues.length > 0}
                                onClick={handleConfirmSession}
                            >
                                검사 기록 확정
                            </button>
                        )}
                    </div>

                    {!bimanualState && (
                        <div className="glass rounded-xl p-3">
                            <p className="text-sm text-white/70 mb-2">조건별 결과</p>
                            <table className="w-full text-xs">
                                <tbody>
                                    {conditionSummaries(session).map(summary => (
                                        <tr key={summary.key} className="border-b border-white/5 last:border-0">
                                            <td className="py-1 text-white/60">{summary.label}</td>
                                            <td className="py-1 text-right tabular-nums text-white/80">
                                                {summary.average === null ? '—' : summary.average}
                                                {summary.executedCount > 0 && summary.executedCount < 3 && (
                                                    <span className="text-white/40"> ({summary.executedCount}회)</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
