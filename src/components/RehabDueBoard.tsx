import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import * as localDB from '../config/localDB';
import { getDueBoardSummary, getDueFollowUps, SUPPORTED_EMPLOYMENT_TYPE, type TrainingState } from '../config/rehabOverview';
import { useLocalToday } from '../pages/overview/useLocalToday';
import type { CaseDocument } from '../types/caseDocument';
import type { Seeker } from '../types/matching';

const categoryLabels: Record<string, string> = {
    counseling: '후속 상담', reevaluation: '재평가', employment: '취업 후 점검', other: '기타',
};

interface Props {
    seekers: Seeker[];
    /** 이용자 이름을 누르면 호출합니다. 부모 화면이 저장 안 된 입력 확인을 거쳐 이동합니다. */
    onSelect: (seekerId: string) => void;
}

/** 이용자를 고르기 전 화면: 전체 요약 4칸 + 기한이 가까운 후속 일정 목록 */
export default function RehabDueBoard({ seekers, onSelect }: Props) {
    const [docs, setDocs] = useState<CaseDocument[]>([]);
    const [supportedDocs, setSupportedDocs] = useState<CaseDocument[]>([]);
    const [training, setTraining] = useState<TrainingState | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const today = useLocalToday();

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        Promise.all([
            localDB.getAll<CaseDocument>('caseDocuments'),
            // 훈련 기록을 읽지 못해도 일정 목록은 보여 줍니다(훈련 중 인원만 0으로 표시).
            localDB.getById<TrainingState>('trainingState', 'work-training').catch(() => undefined),
        ]).then(([items, trainingState]) => {
            if (cancelled) return;
            setDocs(items.filter(doc => doc.type === 'workflow'));
            setSupportedDocs(items.filter(doc => doc.type === SUPPORTED_EMPLOYMENT_TYPE));
            setTraining(trainingState);
        }).catch(() => {
            if (!cancelled) setError(true);
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });
        return () => { cancelled = true; };
    }, []);

    const { items: due, unreadable } = useMemo(() => getDueFollowUps(docs, seekers, today), [docs, seekers, today]);
    const summary = useMemo(() => getDueBoardSummary(seekers, docs, training, today, supportedDocs), [seekers, docs, training, today, supportedDocs]);
    const overdue = due.filter(item => item.timing === 'overdue').length;
    const tiles: Array<[label: string, count: number, unit: string]> = [
        ['등록 이용자', summary.registered, '명'], ['훈련 중', summary.inTraining, '명'],
        ['지원고용 진행 중', summary.supportedEmployment, '명'], ['이번 주(7일 이내) 일정', summary.dueThisWeek, '건'],
    ];
    return <>
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4" aria-label="전체 요약">
        {tiles.map(([label, count, unit]) => <div key={label} className="glass-card !p-4">
            <p className="text-sm text-white/60">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{loading || error ? '-' : `${count}${unit}`}</p>
        </div>)}
    </div>
    <section className="glass-card !p-5" aria-labelledby="all-due-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="all-due-title" className="text-lg font-bold text-white">전체 이용자 후속 일정</h2>
            {!loading && !error && <span className="text-sm text-white/60">기한 지남 {overdue}건 · 오늘~7일 이내 {due.length - overdue}건</span>}
        </div>
        <p className="text-xs text-white/50 mt-1">담당자가 기록한 일정만 표시합니다. 자동 알림이나 자동 평가를 수행하지 않습니다.</p>
        {loading ? <p role="status" className="text-sm text-white/50 mt-3">일정을 불러오는 중...</p>
            : error ? <p role="alert" className="text-sm text-red-200 mt-3">전체 일정을 불러오지 못했습니다. 이용자별 기록은 그대로 유지됩니다.</p>
                : due.length === 0 ? <p className="text-sm text-white/50 mt-3">7일 이내 또는 기한이 지난 미완료 일정이 없습니다.</p>
                    : <ul className="grid gap-2 mt-3 sm:grid-cols-2">{due.slice(0, 20).map(item => <li key={`${item.seekerId}-${item.task.id}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                        <button type="button" onClick={() => onSelect(item.seekerId)} className="text-accent-200 hover:underline font-semibold text-left">{item.seekerName}</button>
                        <span className={`ml-2 ${item.timing === 'overdue' ? 'text-red-200' : 'text-amber-200'}`}>{item.task.dueDate}{item.timing === 'overdue' ? ' · 기한 지남' : ''}</span>
                        <p className="text-white/80 break-words mt-1">{categoryLabels[item.task.category || 'other']} · {item.task.title}</p>
                    </li>)}</ul>}
        {due.length > 20 && <p className="text-xs text-white/50 mt-2">가까운 일정 20건을 표시합니다. 전체 기록은 이용자별 현황에서 확인해 주세요.</p>}
        {!loading && !error && unreadable > 0 && <p role="alert" className="text-xs text-amber-200 mt-2">
            읽을 수 없는 기록 {unreadable}건은 일정에서 빠졌습니다. 기존 기록은 지우지 않았습니다.{' '}
            <Link to={{ pathname: '/settings', hash: 'files-backup' }} className="underline">설정 &gt; 파일·백업</Link>에서 백업을 확인해 주세요.
        </p>}
    </section>
    </>;
}
