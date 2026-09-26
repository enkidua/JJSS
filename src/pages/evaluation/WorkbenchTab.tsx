/**
 * 직업평가 "평가 진행" 탭. 이용자를 고르고 평가 회차를 만들어 검사를 실시한다.
 * 기존 결과분석기·종합 소견서·저장 문서 탭은 그대로 둔다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronRight, FlaskConical, Loader2, Plus, Trash2 } from 'lucide-react';
import {
    EPISODE_STATUS_LABELS,
    createEpisode,
    type AnalysisDocumentRecord,
    type EvaluationEpisode,
    type EvaluationReport,
    type SourceDocumentRecord,
    type TestSession,
} from '../../features/vocationalEvaluation';
import {
    deleteEpisode,
    listAnalysisDocumentsForEpisode,
    listEpisodesForSeeker,
    listSessionsForEpisode,
    listReportsForEpisode,
    listSourceDocumentsForEpisode,
    saveEpisode,
} from '../../features/vocationalEvaluation/storage';
import { useConfirm } from '../../components/common/ConfirmProvider';
import { useAppToast } from '../../components/Toast';
import { useDataStore } from '../../store/dataStore';
import { localDateKey } from '../../utils/date';
import { getSeekerKey } from '../../utils/seeker';
import { EpisodeDetail } from './EpisodeDetail';

export function WorkbenchTab({
    seekerKey,
    onSeekerChange,
}: {
    seekerKey: string;
    onSeekerChange: (key: string) => void;
}) {
    const seekers = useDataStore(state => state.seekers);
    const [seekerQuery, setSeekerQuery] = useState('');
    const [episodes, setEpisodes] = useState<EvaluationEpisode[]>([]);
    const [sessionsByEpisode, setSessionsByEpisode] = useState<Record<string, TestSession[]>>({});
    const [documentsByEpisode, setDocumentsByEpisode] = useState<Record<string, SourceDocumentRecord[]>>({});
    const [analysesByEpisode, setAnalysesByEpisode] = useState<Record<string, AnalysisDocumentRecord[]>>({});
    const [reportsByEpisode, setReportsByEpisode] = useState<Record<string, EvaluationReport[]>>({});
    const [openId, setOpenId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const confirm = useConfirm();
    const showToast = useAppToast();

    const seeker = useMemo(
        () => seekers.find(item => getSeekerKey(item) === seekerKey) ?? null,
        [seekers, seekerKey],
    );

    /**
     * 이름·이용자 ID로 좁힌 목록(현황판의 "이용자 찾기"와 같은 방식).
     * 이미 고른 이용자는 검색어와 상관없이 목록에 남겨 선택이 풀리지 않게 한다.
     */
    const filteredSeekers = useMemo(() => {
        const query = seekerQuery.replace(/\s+/g, '').toLowerCase();
        if (!query) return seekers;
        return seekers.filter(item => {
            if (getSeekerKey(item) === seekerKey) return true;
            const name = String(item.name ?? '').replace(/\s+/g, '').toLowerCase();
            const id = String((item as { seekerId?: unknown }).seekerId ?? '').replace(/\s+/g, '').toLowerCase();
            return name.includes(query) || id.includes(query);
        });
    }, [seekers, seekerQuery, seekerKey]);

    // 검색 결과가 한 명으로 좁혀지면 바로 선택해 준다(엔터·클릭 없이).
    useEffect(() => {
        if (!seekerQuery.trim() || filteredSeekers.length !== 1) return;
        const key = getSeekerKey(filteredSeekers[0]);
        if (key !== seekerKey) onSeekerChange(key);
    }, [filteredSeekers, seekerQuery, seekerKey, onSeekerChange]);

    const reload = useCallback(async () => {
        if (!seekerKey) {
            setEpisodes([]);
            return;
        }
        setLoading(true);
        try {
            const list = await listEpisodesForSeeker(seekerKey);
            setEpisodes(list);
            const entries = await Promise.all(
                list.map(async episode => [episode.id, await listSessionsForEpisode(episode.id)] as const),
            );
            setSessionsByEpisode(Object.fromEntries(entries));
            const documentEntries = await Promise.all(
                list.map(async episode => [episode.id, await listSourceDocumentsForEpisode(episode.id)] as const),
            );
            setDocumentsByEpisode(Object.fromEntries(documentEntries));
            const analysisEntries = await Promise.all(
                list.map(async episode => [episode.id, await listAnalysisDocumentsForEpisode(episode.id)] as const),
            );
            setAnalysesByEpisode(Object.fromEntries(analysisEntries));
            const reportEntries = await Promise.all(
                list.map(async episode => [episode.id, await listReportsForEpisode(episode.id)] as const),
            );
            setReportsByEpisode(Object.fromEntries(reportEntries));
        } catch (error) {
            showToast(error instanceof Error ? error.message : '평가 회차를 불러오지 못했습니다.', 'error');
        } finally {
            setLoading(false);
        }
    }, [seekerKey, showToast]);

    useEffect(() => {
        void reload();
    }, [reload]);

    const openEpisode = episodes.find(item => item.id === openId);

    const handleCreate = async () => {
        if (!seeker) {
            showToast('먼저 이용자를 선택하세요.', 'error');
            return;
        }
        const created = createEpisode({
            seekerId: seekerKey,
            seekerName: seeker.name ?? '',
            evaluationDate: localDateKey(),
        });
        try {
            // 바로 저장해 둔다 — 아무것도 고치지 않고 나가도 회차가 사라지지 않게.
            const saved = await saveEpisode(created);
            setEpisodes([saved, ...episodes]);
            setSessionsByEpisode({ ...sessionsByEpisode, [saved.id]: [] });
            setDocumentsByEpisode({ ...documentsByEpisode, [saved.id]: [] });
            setReportsByEpisode({ ...reportsByEpisode, [saved.id]: [] });
            setOpenId(saved.id);
        } catch (error) {
            showToast(error instanceof Error ? error.message : '평가 회차를 만들지 못했습니다.', 'error');
        }
    };

    const handleDelete = async (episode: EvaluationEpisode) => {
        const ok = await confirm({
            title: '평가 회차를 삭제할까요?',
            message: '이 회차의 검사 기록·행동관찰이 함께 사라집니다. 되돌릴 수 없습니다.',
            tone: 'danger',
            confirmLabel: '삭제',
        });
        if (!ok) return;
        try {
            await deleteEpisode(episode.id);
            setEpisodes(episodes.filter(item => item.id !== episode.id));
            showToast('평가 회차를 삭제했습니다.', 'success');
        } catch (error) {
            showToast(error instanceof Error ? error.message : '삭제하지 못했습니다.', 'error');
        }
    };

    if (openEpisode) {
        return (
            <EpisodeDetail
                key={openEpisode.id}
                episode={openEpisode}
                sessions={sessionsByEpisode[openEpisode.id] ?? []}
                sourceDocuments={documentsByEpisode[openEpisode.id] ?? []}
                analysisDocuments={analysesByEpisode[openEpisode.id] ?? []}
                reports={reportsByEpisode[openEpisode.id] ?? []}
                onBack={() => {
                    setOpenId(null);
                    void reload();
                }}
                onEpisodeSaved={saved => setEpisodes(current => current.map(item => (item.id === saved.id ? saved : item)))}
            />
        );
    }

    return (
        <div className="space-y-4">
            <section className="glass-card !p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="flex-1 min-w-[200px]">
                        <label htmlFor="ve-seeker-search" className="text-sm text-white/60">
                            이용자 찾기
                        </label>
                        <input
                            id="ve-seeker-search"
                            type="search"
                            className="input-field mt-1"
                            placeholder="이름 또는 이용자 ID로 검색"
                            value={seekerQuery}
                            onChange={event => setSeekerQuery(event.target.value)}
                        />
                    </div>
                    <div className="flex-1 min-w-[220px]">
                        <label htmlFor="ve-seeker" className="text-sm text-white/60">
                            이용자 선택{seekerQuery.trim() ? ` (검색 결과 ${filteredSeekers.length}명)` : ''}
                        </label>
                        <select
                            id="ve-seeker"
                            className="input-field mt-1"
                            value={seekerKey}
                            onChange={event => onSeekerChange(event.target.value)}
                        >
                            <option value="">이용자를 선택하세요</option>
                            {filteredSeekers.map(item => (
                                <option key={getSeekerKey(item)} value={getSeekerKey(item)}>
                                    {item.name}
                                    {(item as { seekerId?: string }).seekerId ? ` · ${(item as { seekerId?: string }).seekerId}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <button type="button" className="btn-primary" onClick={handleCreate} disabled={!seeker}>
                        <Plus size={16} className="inline mr-1" /> 새 평가 회차
                    </button>
                </div>
                <p className="text-xs text-white/40 mt-3">
                    검사 실시 과정을 기록하고 원자료를 정리합니다. 백분위 해석은 공단 검사해석 프로그램이 만든 공식 결과지를 따릅니다.
                </p>
            </section>

            {loading ? (
                <p className="text-white/50 text-sm px-1">
                    <Loader2 size={14} className="inline mr-1 animate-spin" /> 불러오는 중…
                </p>
            ) : !seekerKey ? (
                <p className="text-white/40 text-sm px-1">이용자를 선택하면 평가 회차를 볼 수 있습니다.</p>
            ) : episodes.length === 0 ? (
                <p className="text-white/40 text-sm px-1">아직 평가 회차가 없습니다. "새 평가 회차"로 시작하세요.</p>
            ) : (
                <ul className="space-y-2">
                    {episodes.map(episode => {
                        const sessions = sessionsByEpisode[episode.id] ?? [];
                        return (
                            <li key={episode.id} className="glass rounded-xl p-4 flex items-center justify-between gap-3">
                                <button type="button" className="flex-1 text-left" onClick={() => setOpenId(episode.id)}>
                                    <span className="text-white font-medium">{episode.title}</span>
                                    <span className="block text-xs text-white/40 mt-1">
                                        <CalendarDays size={12} className="inline mr-1" />
                                        {episode.evaluationDate || '평가일 미입력'} · {EPISODE_STATUS_LABELS[episode.status]}
                                        {sessions.length > 0 && (
                                            <>
                                                {' · '}
                                                <FlaskConical size={12} className="inline mr-1" />
                                                검사 {sessions.length}건
                                            </>
                                        )}
                                    </span>
                                </button>
                                <div className="flex items-center gap-1">
                                    <button type="button" className="btn-ghost" onClick={() => handleDelete(episode)} aria-label="회차 삭제">
                                        <Trash2 size={16} />
                                    </button>
                                    <button type="button" className="btn-ghost" onClick={() => setOpenId(episode.id)} aria-label="회차 열기">
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
