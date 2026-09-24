import { useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import type { Seeker } from '../../types/matching';
import type { RehabGoal } from '../../config/rehabWorkflow';

/** 목표별 최근 변화 1줄 + 기록 수·마지막 날짜(읽기 전용). 기록은 고용지원 화면에서 합니다. */
export function GoalProgress({ seeker, goals }: { seeker: Seeker; goals: RehabGoal[] }) {
    const navigate = useNavigate();
    return <section className="glass-card !p-5" aria-labelledby="goal-progress-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="goal-progress-title" className="text-xl font-bold text-white flex items-center gap-2"><Target className="w-5 h-5 text-violet-300" aria-hidden="true" /> 목표 진행 현황</h2>
            <button type="button" className="btn-secondary !px-3 !py-1.5 text-sm"
                onClick={() => navigate('/workmate', { state: { seekerId: seeker.id || seeker.seekerId, seekerName: seeker.name, tab: 'pipeline', step: 'workflow' } })}>
                목표 기록하기
            </button>
        </div>
        {goals.length === 0
            ? <p className="text-sm text-white/50 mt-4">추적 중인 목표가 없습니다.</p>
            : <ul className="mt-4 space-y-3">{goals.map(goal => {
                const history = [...goal.checkIns].sort((a, b) => b.date.localeCompare(a.date));
                const latest = history[0];
                return <li key={goal.id} className="rounded-xl bg-white/5 border border-white/10 p-3 text-sm">
                    <p className="font-semibold text-white break-words">{goal.title}</p>
                    <p className="text-white/60 break-words mt-1">출발점 {goal.baseline} → 목표 {goal.target}</p>
                    <p className="text-violet-200 break-words mt-1">{latest
                        ? <><time dateTime={latest.date}>{latest.date}</time> · {latest.currentLevel ? `현재 ${latest.currentLevel} · ` : ''}{latest.note}</>
                        : '기록된 변화가 없습니다.'}</p>
                    <p className="text-xs text-white/45 mt-1">변화 기록 {history.length}건{latest ? ` · 마지막 ${latest.date}` : ''}</p>
                </li>;
            })}</ul>}
    </section>;
}
