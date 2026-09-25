/** 검사 실시 단계. 회차에 검사를 추가하고 실시 화면을 연다. */
import { useState } from 'react';
import { ChevronRight, ClipboardList, Plus, Trash2 } from 'lucide-react';
import {
    conditionSummaries,
    createTestSession,
    getTestPlugin,
    listTestPlugins,
    totalCompleted,
    totalMaximum,
    type EvaluationEpisode,
    type SourceDocumentRecord,
    type TestSession,
} from '../../../features/vocationalEvaluation';
import { deleteSession, saveSession } from '../../../features/vocationalEvaluation/storage';
import { useConfirm } from '../../../components/common/ConfirmProvider';
import { useAppToast } from '../../../components/Toast';
import { SessionRunner } from '../runner/SessionRunner';

const STATUS_LABELS: Record<string, string> = {
    DRAFT: '준비',
    IN_PROGRESS: '진행 중',
    PAUSED: '일시정지',
    REVIEW: '검토',
    COMPLETED: '확정',
    CANCELLED: '취소',
};

function SessionSummary({ session }: { session: TestSession }) {
    if (session.bimanual) {
        return (
            <span className="tabular-nums">
                총합 {totalCompleted(session.bimanual.attempt.result)} / {totalMaximum(session.bimanual.specification)}
            </span>
        );
    }
    const summaries = conditionSummaries(session);
    const done = summaries.filter(item => item.executedCount > 0).length;
    return (
        <span className="tabular-nums">
            {done}/{summaries.length} 조건 기록
        </span>
    );
}

export function TestStep({
    episode,
    sessions,
    onEpisodeChange,
    onSessionsChange,
    documents = [],
    locked = false,
}: {
    episode: EvaluationEpisode;
    sessions: TestSession[];
    onEpisodeChange: (next: EvaluationEpisode) => void;
    onSessionsChange: (next: TestSession[]) => void;
    documents?: SourceDocumentRecord[];
    locked?: boolean;
}) {
    const [openId, setOpenId] = useState<string | null>(null);
    const confirm = useConfirm();
    const showToast = useAppToast();

    const open = sessions.find(item => item.id === openId);

    const addSession = async (pluginId: string) => {
        const created = createTestSession({
            episodeId: episode.id,
            seekerId: episode.seekerId,
            seekerName: episode.seekerName,
            testPluginId: pluginId,
            now: new Date().toISOString(),
        });
        try {
            const saved = await saveSession(created);
            onSessionsChange([...sessions, saved]);
            onEpisodeChange({
                ...episode,
                sessionIds: [...episode.sessionIds, saved.id],
                status: episode.status === 'DRAFT' ? 'IN_PROGRESS' : episode.status,
            });
            setOpenId(saved.id);
        } catch (error) {
            showToast(error instanceof Error ? error.message : '검사를 만들지 못했습니다.', 'error');
        }
    };

    const removeSession = async (session: TestSession) => {
        // 결과지·해석이 이 검사를 근거로 삼고 있으면 지우지 않는다(보고서에 근거 없는 문장이 남는 것을 막는다).
        const linkedDocuments = documents.filter(item => item.sessionId === session.id);
        const linkedRuns = episode.interpretations.filter(item => item.sessionId === session.id);
        if (linkedDocuments.length || linkedRuns.length) {
            const reasons = [
                linkedDocuments.length ? `공식 결과지 ${linkedDocuments.length}건` : '',
                linkedRuns.length ? `해석 기록 ${linkedRuns.length}건` : '',
            ].filter(Boolean);
            showToast(`이 검사에 연결된 ${reasons.join(' · ')}이(가) 있어 삭제할 수 없습니다. 먼저 정리해 주세요.`, 'error');
            return;
        }
        const ok = await confirm({
            title: '검사 기록을 삭제할까요?',
            message: '이 검사에 기록한 수행량·사건·관찰이 모두 사라집니다. 되돌릴 수 없습니다.',
            tone: 'danger',
            confirmLabel: '삭제',
        });
        if (!ok) return;
        try {
            await deleteSession(session.id);
            onSessionsChange(sessions.filter(item => item.id !== session.id));
            onEpisodeChange({ ...episode, sessionIds: episode.sessionIds.filter(id => id !== session.id) });
            if (openId === session.id) setOpenId(null);
            showToast('검사 기록을 삭제했습니다.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : '삭제하지 못했습니다.', 'error');
        }
    };

    if (open) {
        return (
            <SessionRunner
                key={open.id}
                session={open}
                evaluator={episode.evaluator}
                onClose={() => setOpenId(null)}
                onSaved={saved => onSessionsChange(sessions.map(item => (item.id === saved.id ? saved : item)))}
            />
        );
    }

    return (
        <div className="space-y-4">
            <section className="glass-card !p-5">
                <h3 className="font-semibold text-white mb-1">검사 추가</h3>
                <p className="text-xs text-white/40 mb-4">
                    실시요강에 따라 시행한 결과를 기록합니다. 앱이 실물 검사 도구나 공단 프로그램을 대체하지 않습니다.
                </p>
                <div className="grid md:grid-cols-2 gap-3">
                    {listTestPlugins().map(plugin => (
                        <button
                            key={plugin.manifest.id}
                            type="button"
                            disabled={locked}
                            onClick={() => addSession(plugin.manifest.id)}
                            className="glass rounded-xl p-4 text-left hover:bg-white/10 transition-all"
                        >
                            <span className="flex items-center gap-2 text-white font-medium">
                                <Plus size={16} /> {plugin.manifest.name}
                            </span>
                            <span className="block text-xs text-white/40 mt-1">{plugin.manifest.durationNote}</span>
                            <span className="block text-xs text-white/40">{plugin.manifest.description}</span>
                        </button>
                    ))}
                </div>
            </section>

            <section className="space-y-2">
                {sessions.length === 0 ? (
                    <p className="text-white/40 text-sm px-1">아직 실시한 검사가 없습니다.</p>
                ) : (
                    sessions.map(session => {
                        const plugin = getTestPlugin(session.testPluginId);
                        return (
                            <div key={session.id} className="glass rounded-xl p-4 flex items-center justify-between gap-3">
                                <button type="button" className="flex-1 text-left" onClick={() => setOpenId(session.id)}>
                                    <span className="flex items-center gap-2 text-white">
                                        <ClipboardList size={16} className="text-white/40" />
                                        {plugin.manifest.name}
                                    </span>
                                    <span className="block text-xs text-white/40 mt-1">
                                        {STATUS_LABELS[session.status] ?? session.status} · <SessionSummary session={session} />
                                        {session.confirmedAt ? ` · 확정 ${session.confirmedAt.slice(0, 10)}` : ''}
                                    </span>
                                </button>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        className="btn-ghost"
                                        disabled={locked}
                                        onClick={() => removeSession(session)}
                                        aria-label="검사 기록 삭제"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                    <button type="button" className="btn-ghost" onClick={() => setOpenId(session.id)} aria-label="열기">
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </section>
        </div>
    );
}
