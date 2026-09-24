import { useEffect, useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { localDateKey, type EmploymentCheck, type RehabWorkflowData } from '../../config/rehabWorkflow';
import type { RehabWorkflowRecord } from './useRehabWorkflowRecord';

type EmploymentDraft = Omit<EmploymentCheck, 'id'>;

const emptyEmployment = (): EmploymentDraft => ({
    date: localDateKey(), retention: '', commute: '', adaptation: '', satisfaction: '',
    employerOpinion: '', supportAction: '', outcome: '', nextDate: '',
});

interface Props {
    record: RehabWorkflowRecord;
    onDirtyChange: (dirty: boolean) => void;
}

/** 취업 후 적응지원 점검(이전 현황판에서 옮김). 현황 기록(RehabWorkflowData.employmentChecks)에 저장합니다. */
export function EmploymentCheckSection({ record, onDirtyChange }: Props) {
    const { workflow, save, unavailable } = record;
    const [employment, setEmployment] = useState<EmploymentDraft>(emptyEmployment);
    const [error, setError] = useState('');

    useEffect(() => {
        onDirtyChange(Object.entries(employment).some(([key, value]) => key !== 'date' && !!value?.trim())
            || employment.date !== localDateKey());
    }, [employment, onDirtyChange]);

    const setField = (key: keyof EmploymentDraft, value: string) => setEmployment(current => ({ ...current, [key]: value }));

    return <section aria-labelledby="employment-title">
        <h3 id="employment-title" className="text-xl font-bold text-white flex items-center gap-2"><HeartHandshake className="w-5 h-5 text-emerald-300" aria-hidden="true" /> 취업 후 적응지원 점검</h3>
        <p className="text-sm text-white/55 mt-1 mb-4">취업 여부와 관계없이 상담 내용을 기록할 수 있습니다. 당사자·사업체 의견은 각각 확인한 내용만 적어 주세요.</p>
        <form onSubmit={async event => {
            event.preventDefault();
            const meaningful = [employment.retention, employment.commute, employment.adaptation, employment.satisfaction,
                employment.employerOpinion, employment.supportAction, employment.outcome].some(value => value.trim());
            if (!meaningful) { setError('점검 내용을 한 항목 이상 입력해 주세요.'); return; }
            if (employment.nextDate && employment.nextDate < employment.date) {
                setError('다음 점검일은 점검일과 같거나 그 이후 날짜로 선택해 주세요.'); return;
            }
            setError('');
            const entry: EmploymentCheck = { ...employment, id: crypto.randomUUID() };
            const next: RehabWorkflowData = {
                ...workflow,
                employmentChecks: [entry, ...workflow.employmentChecks],
                tasks: employment.nextDate ? [...workflow.tasks, {
                    id: crypto.randomUUID(), title: '취업 후 적응지원 후속 점검',
                    dueDate: employment.nextDate, done: false, category: 'employment',
                }] : workflow.tasks,
            };
            if (await save(next, '취업 후 적응지원 기록을 저장했습니다.')) setEmployment(emptyEmployment());
        }} className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-white/75">점검일<input type="date" className="input-field mt-1" value={employment.date} onChange={e => setField('date', e.target.value)} required disabled={unavailable} /></label>
            <label className="text-sm text-white/75">근무 유지 상태<input className="input-field mt-1" value={employment.retention} onChange={e => setField('retention', e.target.value)} maxLength={150} placeholder="예: 근무 유지, 휴직, 확인 필요" disabled={unavailable} /></label>
            <label className="text-sm text-white/75">출퇴근·이동<input className="input-field mt-1" value={employment.commute} onChange={e => setField('commute', e.target.value)} maxLength={300} placeholder="확인한 출퇴근 상황" disabled={unavailable} /></label>
            <label className="text-sm text-white/75">직무·환경 적응<input className="input-field mt-1" value={employment.adaptation} onChange={e => setField('adaptation', e.target.value)} maxLength={300} placeholder="확인한 업무 적응 상황" disabled={unavailable} /></label>
            <label className="text-sm text-white/75">당사자 만족도·의견<input className="input-field mt-1" value={employment.satisfaction} onChange={e => setField('satisfaction', e.target.value)} maxLength={300} placeholder="당사자가 직접 말한 내용" disabled={unavailable} /></label>
            <label className="text-sm text-white/75">사업체 의견<input className="input-field mt-1" value={employment.employerOpinion} onChange={e => setField('employerOpinion', e.target.value)} maxLength={300} placeholder="사업체에서 직접 확인한 내용" disabled={unavailable} /></label>
            <label className="text-sm text-white/75">실시한 지원 조치<textarea className="textarea-field mt-1" value={employment.supportAction} onChange={e => setField('supportAction', e.target.value)} maxLength={800} rows={2} placeholder="누가 어떤 지원을 했는지" disabled={unavailable} /></label>
            <label className="text-sm text-white/75">조치 후 결과<textarea className="textarea-field mt-1" value={employment.outcome} onChange={e => setField('outcome', e.target.value)} maxLength={800} rows={2} placeholder="확인된 변화 또는 확인 필요 사항" disabled={unavailable} /></label>
            <label className="text-sm text-white/75">다음 점검일(선택)<input type="date" className="input-field mt-1" value={employment.nextDate || ''} min={employment.date || undefined} onChange={e => setField('nextDate', e.target.value)} disabled={unavailable} /></label>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                <button type="submit" className="btn-primary !px-4 !py-2" disabled={unavailable}>적응지원 기록 저장</button>
                <span className="text-xs text-white/50">다음 점검일을 지정하면 후속 일정에도 추가됩니다.</span>
            </div>
        </form>
        {error && <p role="alert" className="text-sm text-red-300 mt-2">{error}</p>}
        <div className="mt-5 space-y-3">
            {workflow.employmentChecks.length === 0 && <p className="text-sm text-white/50">아직 취업 후 적응지원 기록이 없습니다.</p>}
            {workflow.employmentChecks.map(entry => <details key={entry.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <summary className="cursor-pointer text-white font-medium">{entry.date} · {entry.retention || '적응지원 점검'}</summary>
                <dl className="grid sm:grid-cols-2 gap-2 text-sm mt-3">{[
                    ['출퇴근·이동', entry.commute], ['직무·환경 적응', entry.adaptation],
                    ['당사자 의견', entry.satisfaction], ['사업체 의견', entry.employerOpinion],
                    ['지원 조치', entry.supportAction], ['조치 결과', entry.outcome],
                    ['다음 점검일', entry.nextDate],
                ].map(([label, value]) => <div key={label}><dt className="text-white/45">{label}</dt><dd className="text-white/80 break-words whitespace-pre-wrap">{value || '-'}</dd></div>)}</dl>
            </details>)}
        </div>
    </section>;
}
