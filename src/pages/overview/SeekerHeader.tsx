import { UserRound } from 'lucide-react';
import type { Seeker } from '../../types/matching';
import { REHAB_STAGES, type RehabStage } from '../../config/rehabOverview';
import { timestampDateKey } from '../../config/rehabWorkflow';

interface Props {
    seeker: Seeker;
    stage: RehabStage;
}

/** 이용자 머리글 + 현재 단계 배지(기록 존재 여부로 자동 판정) */
export function SeekerHeader({ seeker, stage }: Props) {
    const currentIndex = REHAB_STAGES.indexOf(stage);
    const registeredAt = timestampDateKey(seeker.createdAt);
    return <section className="glass-card !p-5" aria-labelledby="overview-seeker-name">
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-accent-500/20 flex items-center justify-center text-accent-300 shrink-0">
                    <UserRound className="w-6 h-6" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <h2 id="overview-seeker-name" className="text-2xl font-black text-white break-words">{seeker.name}</h2>
                    <p className="text-sm text-white/60 mt-1 break-words">
                        {[seeker.disabilityType && `${seeker.disabilityType}${seeker.severity ? ` (${seeker.severity})` : ''}`,
                            `등록일 ${registeredAt || '기록 없음'}`,
                            seeker.status && `현재 상황 ${seeker.status}`,
                            seeker.recommendingAgency && `추천기관 ${seeker.recommendingAgency}`,
                        ].filter(Boolean).join(' · ')}
                    </p>
                </div>
            </div>
            <p className="text-xs text-white/45 self-center">단계는 저장된 문서·기록으로 자동 판정합니다.</p>
        </div>
        <ol className="flex flex-wrap items-center gap-2 mt-4" aria-label={`현재 단계: ${stage}`}>
            {REHAB_STAGES.map((item, index) => {
                const state = index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo';
                return <li key={item} className="flex items-center gap-2">
                    <span aria-current={state === 'current' ? 'step' : undefined} className={`rounded-full px-3 py-1 text-sm font-bold border ${
                        state === 'current' ? 'bg-accent-500/25 border-accent-400/60 text-white'
                            : state === 'done' ? 'bg-white/10 border-white/15 text-white/70' : 'border-white/10 text-white/40'}`}>
                        {item}{state === 'current' ? ' · 현재' : ''}
                    </span>
                    {index < REHAB_STAGES.length - 1 && <span className="text-white/30" aria-hidden="true">→</span>}
                </li>;
            })}
        </ol>
    </section>;
}
