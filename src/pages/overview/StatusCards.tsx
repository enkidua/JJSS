import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, ClipboardCheck, Dumbbell } from 'lucide-react';
import type { Seeker } from '../../types/matching';
import { formatSupportedEmploymentLine, type EmploymentSummary, type EvaluationSummary, type TimelineTarget, type TrainingOverview } from '../../config/rehabOverview';

interface Props {
    seeker: Seeker;
    evaluation: EvaluationSummary;
    training: TrainingOverview | null;
    employment: EmploymentSummary;
}

function Row({ label, value }: { label: string; value: ReactNode }) {
    return <div className="flex justify-between gap-3 text-sm py-1 border-b border-white/5 last:border-0">
        <dt className="text-white/50 shrink-0">{label}</dt>
        <dd className="text-white/85 text-right break-words min-w-0">{value}</dd>
    </div>;
}

function Card({ title, icon, children, action, onAction }: { title: string; icon: ReactNode; children: ReactNode; action: string; onAction: () => void }) {
    return <article className="glass-card !p-5 flex flex-col">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">{icon}{title}</h3>
        <div className="flex-1 mt-3">{children}</div>
        <button type="button" className="btn-secondary !px-4 !py-2 text-sm mt-4 self-start" onClick={onAction}>{action}</button>
    </article>;
}

/** 직업평가·직업훈련·고용지원 상태 카드. 입력은 각 서비스 화면으로 이동해서 합니다. */
export function StatusCards({ seeker, evaluation, training, employment }: Props) {
    const navigate = useNavigate();
    const base: TimelineTarget['state'] = { seekerId: seeker.id || seeker.seekerId, seekerName: seeker.name };
    const go = (path: TimelineTarget['path'], extra: Partial<TimelineTarget['state']> = {}) =>
        navigate(path, { state: { ...base, ...extra } });
    const employed = seeker.status?.includes('취업') && !seeker.status.includes('구직');
    const supported = employment.supportedEmployment;
    const employmentTab = supported?.status === '진행중' ? 'supportedEmployment' : employment.checkCount > 0 ? 'adaptation' : 'pipeline';

    return <div className="grid gap-4 lg:grid-cols-3" aria-label="서비스별 상태">
        <Card title="직업평가" icon={<ClipboardCheck className="w-5 h-5 text-sky-300" aria-hidden="true" />}
            action="평가 화면에서 이어서 작성" onAction={() => go('/evaluation')}>
            <dl>
                <Row label="최근 평가일" value={evaluation.lastDate || '기록 없음'} />
                <Row label="평가 문서" value={`${evaluation.documentCount}건`} />
            </dl>
            {evaluation.lastOpinion.length > 0
                ? <div className="mt-2 text-sm text-white/70 break-words"><p className="text-white/45 text-xs">마지막 소견</p>{evaluation.lastOpinion.map((line, index) => <p key={index} className="line-clamp-2">{line}</p>)}</div>
                : <p className="mt-2 text-xs text-white/45">이 이용자와 연결된 평가 문서가 없습니다.</p>}
        </Card>

        <Card title="직업훈련" icon={<Dumbbell className="w-5 h-5 text-violet-300" aria-hidden="true" />}
            action="직업훈련 화면으로" onAction={() => go('/training', { tab: 'case' })}>
            {training ? <>
                <dl>
                    <Row label="배정 훈련실" value={`${training.room}${training.program ? ` · ${training.program}` : ''}`} />
                    <Row label="훈련기간" value={training.trainingPeriod || '미기록'} />
                    <Row label="출석률" value={training.attendanceRate === null ? '출석 기록 없음' : `${training.attendanceRate}% (${training.attendanceDays}일 기록)`} />
                    <Row label="최근 상담일" value={training.lastCounselingDate || '기록 없음'} />
                </dl>
                {training.planSummary.length > 0 && <div className="mt-2 text-sm text-white/70 break-words"><p className="text-white/45 text-xs">훈련계획 요약</p>{training.planSummary.map((line, index) => <p key={index} className="line-clamp-2">{line}</p>)}</div>}
            </> : <p className="text-sm text-white/50">훈련실 배정 기록이 없습니다.</p>}
        </Card>

        <Card title="고용지원" icon={<BriefcaseBusiness className="w-5 h-5 text-emerald-300" aria-hidden="true" />}
            action="고용지원 화면으로" onAction={() => go('/workmate', { tab: employmentTab })}>
            <dl>
                <Row label="지원고용" value={supported
                    ? <button type="button" className="text-accent-200 hover:underline text-right"
                        onClick={() => go('/workmate', { tab: 'supportedEmployment', documentId: supported.caseId })}>{formatSupportedEmploymentLine(supported)}</button>
                    : '회차 기록 없음'} />
                <Row label="매칭 의견" value={`${employment.matchingCount}건`} />
                <Row label="면접일지" value={`${employment.interviewCount}건`} />
                <Row label="직무 비교" value={`${employment.comparisonCount}건`} />
                <Row label="취업 상태" value={employed ? seeker.status : '취업 기록 없음'} />
                <Row label="최근 적응지원 점검" value={employment.lastCheckDate ? `${employment.lastCheckDate} (총 ${employment.checkCount}회)` : '기록 없음'} />
            </dl>
        </Card>
    </div>;
}
