import { useMemo, useState } from 'react';
import { AlertTriangle, Lock, X } from 'lucide-react';
import type { SupportedEmploymentCase, SupportedEmploymentPayee } from '../../../features/supportedEmployment/model';
import type { JobOpening, Seeker } from '../../../types/matching';
import { getSeekerKey } from '../../../utils/seeker';
import { formatCurrencyInput, parseCurrencyInput } from '../../../utils/currency';
import { lunarHolidayDataWarning } from '../../../features/supportedEmployment/holidays';
import { listExcludedWeekdays } from './caseEditing';

export type CaseUpdater = (updater: (current: SupportedEmploymentCase) => SupportedEmploymentCase) => void;
export type SchedulePatch = Partial<Pick<SupportedEmploymentCase, 'period' | 'preTrainingDays' | 'extraClosedDates'>>;

interface Props {
    draft: SupportedEmploymentCase;
    update: CaseUpdater;
    applySchedule: (patch: SchedulePatch) => void;
    seekers: Seeker[];
    jobs: JobOpening[];
    /** 다른 회차(이전 지도원 불러오기) */
    otherCases: SupportedEmploymentCase[];
}

const label = 'text-sm text-white/75';

function PayeeFields({ title, idPrefix, value, onChange }: {
    title: string; idPrefix: string; value: SupportedEmploymentPayee; onChange: (next: SupportedEmploymentPayee) => void;
}) {
    return <fieldset className="rounded-xl border border-white/10 p-3">
        <legend className="px-1 text-sm font-bold text-white">{title}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
            <label className={label} htmlFor={`${idPrefix}-bank`}>은행<input id={`${idPrefix}-bank`} className="input-field mt-1" value={value.bank} maxLength={30}
                onChange={e => onChange({ ...value, bank: e.target.value })} /></label>
            <label className={label} htmlFor={`${idPrefix}-account`}>계좌번호<input id={`${idPrefix}-account`} className="input-field mt-1" value={value.account} maxLength={40}
                inputMode="numeric" autoComplete="off" onChange={e => onChange({ ...value, account: e.target.value })} /></label>
            <label className={label} htmlFor={`${idPrefix}-phone`}>연락처<input id={`${idPrefix}-phone`} className="input-field mt-1" value={value.phone} maxLength={30}
                inputMode="tel" autoComplete="off" onChange={e => onChange({ ...value, phone: e.target.value })} /></label>
        </div>
    </fieldset>;
}

/** 기본정보·직무지도원·수령 계좌·단가(D-2 #2) */
export function BasicInfoSection({ draft, update, applySchedule, seekers, jobs, otherCases }: Props) {
    const [closedInput, setClosedInput] = useState('');
    const excluded = useMemo(() => listExcludedWeekdays(draft.period.start, draft.period.end, draft.extraClosedDates),
        [draft.period.start, draft.period.end, draft.extraClosedDates]);
    const holidayDataWarning = useMemo(() => lunarHolidayDataWarning(draft.period.start, draft.period.end),
        [draft.period.start, draft.period.end]);
    const previousCoaches = useMemo(() => {
        const seen = new Map<string, SupportedEmploymentCase['coach']>();
        for (const item of otherCases) {
            const name = item.coach.name.trim();
            if (name && !seen.has(name)) seen.set(name, item.coach);
        }
        return [...seen.values()];
    }, [otherCases]);
    const selectedSeekerMissing = draft.seekerId && !seekers.some(seeker => getSeekerKey(seeker) === draft.seekerId);
    const selectedJobMissing = draft.jobId && !jobs.some(job => job.id === draft.jobId);

    const addClosedDate = () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(closedInput) || draft.extraClosedDates.includes(closedInput)) return;
        applySchedule({ extraClosedDates: [...draft.extraClosedDates, closedInput].sort() });
        setClosedInput('');
    };

    return <div className="space-y-5">
        <section aria-labelledby="se-basic-title" className="glass-card !p-5">
            <h3 id="se-basic-title" className="text-lg font-bold text-white">기본정보</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-3">
                <label className={label} htmlFor="se-round">회차
                    <input id="se-round" type="number" min={1} className="input-field mt-1" value={draft.round || ''}
                        onChange={e => update(c => ({ ...c, round: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
                </label>
                <label className={label} htmlFor="se-seeker">이용자
                    <select id="se-seeker" className="input-field mt-1" value={draft.seekerId}
                        onChange={e => {
                            const seeker = seekers.find(item => getSeekerKey(item) === e.target.value);
                            update(c => ({ ...c, seekerId: e.target.value, seekerName: seeker?.name || '' }));
                        }}>
                        <option value="">이용자 선택</option>
                        {selectedSeekerMissing && <option value={draft.seekerId}>{draft.seekerName || '등록되지 않은 이용자'}</option>}
                        {seekers.map(seeker => <option key={getSeekerKey(seeker)} value={getSeekerKey(seeker)}>{seeker.name}{seeker.seekerId ? ` (${seeker.seekerId})` : ''}</option>)}
                    </select>
                </label>
                <label className={label} htmlFor="se-job">사업체(구인정보)
                    <select id="se-job" className="input-field mt-1" value={draft.jobId}
                        onChange={e => {
                            const job = jobs.find(item => item.id === e.target.value);
                            update(c => ({
                                ...c, jobId: e.target.value,
                                employerName: job?.companyName || c.employerName,
                                jobTitle: c.jobTitle || job?.jobRole || '',
                            }));
                        }}>
                        <option value="">사업체 선택(없으면 아래에 직접 입력)</option>
                        {selectedJobMissing && <option value={draft.jobId}>{draft.employerName || '등록되지 않은 사업체'}</option>}
                        {jobs.map(job => <option key={job.id} value={job.id}>{job.companyName}{job.jobRole ? ` · ${job.jobRole}` : ''}</option>)}
                    </select>
                </label>
                <label className={label} htmlFor="se-employer">사업체명
                    <input id="se-employer" className="input-field mt-1" value={draft.employerName} maxLength={80}
                        onChange={e => update(c => ({ ...c, employerName: e.target.value }))} />
                </label>
                <label className={label} htmlFor="se-job-title">훈련직무
                    <input id="se-job-title" className="input-field mt-1" value={draft.jobTitle} maxLength={80} placeholder="예: 매장 진열, 사무보조"
                        onChange={e => update(c => ({ ...c, jobTitle: e.target.value }))} />
                </label>
                <label className={label} htmlFor="se-planned-count">계획인원
                    <input id="se-planned-count" type="number" min={0} className="input-field mt-1" value={draft.plannedCount}
                        onChange={e => update(c => ({ ...c, plannedCount: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
                </label>
            </div>

            <h4 className="text-base font-bold text-white mt-5">훈련기간</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-2">
                <label className={label} htmlFor="se-start">시작일
                    <input id="se-start" type="date" className="input-field mt-1" value={draft.period.start}
                        onChange={e => applySchedule({ period: { ...draft.period, start: e.target.value } })} />
                </label>
                <label className={label} htmlFor="se-end">종료일
                    <input id="se-end" type="date" className="input-field mt-1" value={draft.period.end} min={draft.period.start || undefined}
                        onChange={e => applySchedule({ period: { ...draft.period, end: e.target.value } })} />
                </label>
                <label className={label} htmlFor="se-pre-days">사전훈련 일수
                    <input id="se-pre-days" type="number" min={0} max={30} className="input-field mt-1" value={draft.preTrainingDays}
                        onChange={e => applySchedule({ preTrainingDays: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
                </label>
                <label className={label} htmlFor="se-planned-end">종료 예정일(선택)
                    <input id="se-planned-end" type="date" className="input-field mt-1" value={draft.period.plannedEnd}
                        onChange={e => update(c => ({ ...c, period: { ...c.period, plannedEnd: e.target.value } }))} />
                </label>
            </div>
            <p className="text-xs text-white/55 mt-2">
                시작·종료일을 고르면 주말·공휴일(대체공휴일 포함)·기관 휴무일을 뺀 훈련일이 자동으로 만들어집니다. 앞의 사전훈련 일수만큼은 사전훈련, 나머지는 현장훈련입니다.
            </p>
            {draft.period.start && draft.period.end && <p className="text-sm text-white/80 mt-2" data-testid="se-training-days">
                훈련일 {draft.dailyLogs.length}일 (사전 {draft.dailyLogs.filter(log => log.phase === '사전').length}일 · 현장 {draft.dailyLogs.filter(log => log.phase === '현장').length}일)
            </p>}
            {holidayDataWarning && <p role="alert" data-testid="se-holiday-data-warning"
                className="mt-2 flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{holidayDataWarning}</span>
            </p>}
            {excluded.length > 0 && <div className="mt-2">
                <p className="text-xs text-white/55">주말 외에 제외된 날</p>
                <ul className="flex flex-wrap gap-2 mt-1">
                    {excluded.map(item => <li key={item.date} className="rounded-full bg-amber-500/15 text-amber-100 px-2 py-0.5 text-xs">
                        {item.date} {item.reason}
                    </li>)}
                </ul>
            </div>}
            <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className={label} htmlFor="se-closed-date">기관 휴무일 추가
                    <input id="se-closed-date" type="date" className="input-field mt-1" value={closedInput}
                        min={draft.period.start || undefined} max={draft.period.end || undefined}
                        onChange={e => setClosedInput(e.target.value)} />
                </label>
                <button type="button" className="btn-secondary !px-3 !py-2 text-sm" onClick={addClosedDate} disabled={!closedInput}>휴무일 추가</button>
                {draft.extraClosedDates.map(date => <span key={date} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1 text-xs text-white/80">
                    {date}
                    <button type="button" aria-label={`${date} 휴무일 삭제`} className="hover:text-red-200"
                        onClick={() => applySchedule({ extraClosedDates: draft.extraClosedDates.filter(item => item !== date) })}>
                        <X className="w-3 h-3" aria-hidden="true" />
                    </button>
                </span>)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 mt-4">
                <label className="text-sm text-white/75 flex items-center gap-2">
                    <input type="checkbox" checked={draft.oneToManyGuidance}
                        onChange={e => update(c => ({ ...c, oneToManyGuidance: e.target.checked }))} />
                    1:多 지도(훈련일지·출근부 머리 정보)
                </label>
                <label className={label} htmlFor="se-weekly">주휴수당 표기
                    <input id="se-weekly" className="input-field mt-1" value={draft.weeklyHolidayAllowance} maxLength={30}
                        onChange={e => update(c => ({ ...c, weeklyHolidayAllowance: e.target.value }))} />
                </label>
            </div>
        </section>

        <section aria-labelledby="se-coach-title" className="glass-card !p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="se-coach-title" className="text-lg font-bold text-white">직무지도원</h3>
                {previousCoaches.length > 0 && <label className="text-sm text-white/70 flex items-center gap-2" htmlFor="se-coach-import">
                    이전 지도원 불러오기
                    <select id="se-coach-import" className="input-field !w-auto" value=""
                        onChange={e => {
                            const coach = previousCoaches.find(item => item.name === e.target.value);
                            if (coach) update(c => ({ ...c, coach: { ...coach } }));
                        }}>
                        <option value="">선택</option>
                        {previousCoaches.map(coach => <option key={coach.name} value={coach.name}>{coach.name} ({coach.type})</option>)}
                    </select>
                </label>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 mt-3">
                <label className={label} htmlFor="se-coach-name">성명
                    <input id="se-coach-name" className="input-field mt-1" value={draft.coach.name} maxLength={30}
                        onChange={e => update(c => ({ ...c, coach: { ...c.coach, name: e.target.value } }))} />
                </label>
                <label className={label} htmlFor="se-coach-type">구분
                    <select id="se-coach-type" className="input-field mt-1" value={draft.coach.type}
                        onChange={e => update(c => ({ ...c, coach: { ...c.coach, type: e.target.value === '외부' ? '외부' : '내부' } }))}>
                        <option value="내부">내부</option>
                        <option value="외부">외부</option>
                    </select>
                </label>
            </div>
            <div className="mt-3">
                <PayeeFields title="직무지도원 계좌·연락처" idPrefix="se-coach" value={draft.coach}
                    onChange={next => update(c => ({ ...c, coach: { ...c.coach, ...next } }))} />
            </div>
        </section>

        <section aria-labelledby="se-payee-title" className="glass-card !p-5">
            <h3 id="se-payee-title" className="text-lg font-bold text-white">수령 계좌</h3>
            <p className="text-xs text-white/55 mt-1 flex items-center gap-1"><Lock className="w-3.5 h-3.5" aria-hidden="true" /> 계좌번호는 이 PC에 암호화되어 저장됩니다.</p>
            <div className="grid gap-3 mt-3">
                <PayeeFields title="훈련생(훈련수당)" idPrefix="se-trainee" value={draft.traineePayee}
                    onChange={next => update(c => ({ ...c, traineePayee: next }))} />
                <PayeeFields title="사업체(사업주보조금)" idPrefix="se-employer-payee" value={draft.employerPayee}
                    onChange={next => update(c => ({ ...c, employerPayee: next }))} />
            </div>
        </section>

        <section aria-labelledby="se-rates-title" className="glass-card !p-5">
            <h3 id="se-rates-title" className="text-lg font-bold text-white">단가 ({draft.rates.year}년 기준)</h3>
            <p className="text-xs text-white/55 mt-1">회차를 만들 때의 기본 단가를 복사해 둡니다. 나중에 단가표가 바뀌어도 이 회차 서류는 바뀌지 않습니다.</p>
            <div className="grid gap-3 sm:grid-cols-3 mt-3">
                {([
                    ['trainingAllowance', '훈련수당(원/일)'],
                    ['employerSubsidy', '사업주보조금(원/일)'],
                    ['coachAllowance', '직무지도원수당(원/일)'],
                ] as const).map(([key, text]) => <label key={key} className={label} htmlFor={`se-rate-${key}`}>{text}
                    <input id={`se-rate-${key}`} className="input-field mt-1" inputMode="numeric" value={formatCurrencyInput(draft.rates[key])}
                        onChange={e => update(c => ({ ...c, rates: { ...c.rates, [key]: parseCurrencyInput(e.target.value) } }))} />
                </label>)}
            </div>
        </section>
    </div>;
}
