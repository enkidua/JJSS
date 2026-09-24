import { useEffect, useState } from 'react';
import { BriefcaseBusiness } from 'lucide-react';
import * as localDB from '../../config/localDB';
import type { JobOpening, Seeker } from '../../types/matching';
import type { CaseDocument } from '../../types/caseDocument';
import { localDateKey, type JobComparison } from '../../config/rehabWorkflow';
import type { RehabWorkflowRecord } from './useRehabWorkflowRecord';

type ComparisonKey = keyof JobComparison['supportNeeds'];

const COMPARISON_ROWS: Array<{ key: ComparisonKey; label: string }> = [
    { key: 'role', label: '직무' }, { key: 'hours', label: '근무시간' },
    { key: 'commute', label: '이동·지역' }, { key: 'environment', label: '작업환경' },
    { key: 'preferences', label: '보수·선호' },
];

const emptyNeeds = (): JobComparison['supportNeeds'] => ({ role: '', hours: '', commute: '', environment: '', preferences: '' });

interface Props {
    seeker: Seeker;
    jobs: JobOpening[];
    record: RehabWorkflowRecord;
    onDirtyChange: (dirty: boolean) => void;
}

/** 직무 요구–지원 필요 비교(이전 현황판에서 옮김). 현황 기록(RehabWorkflowData.jobComparisons)에 저장합니다. */
export function JobComparisonSection({ seeker, jobs, record, onDirtyChange }: Props) {
    const { workflow, documents, save, unavailable } = record;
    const [jobId, setJobId] = useState('');
    const [needs, setNeeds] = useState<JobComparison['supportNeeds']>(emptyNeeds);
    const [adjustment, setAdjustment] = useState('');
    const [error, setError] = useState('');
    const [jobAnalysisDocs, setJobAnalysisDocs] = useState<CaseDocument[]>([]);
    const [analysisLoadError, setAnalysisLoadError] = useState(false);
    const selectedJob = jobs.find(job => job.id === jobId);
    const relatedDocuments = [
        ...documents.filter(doc => doc.jobId === jobId && (doc.type === 'matching_opinion' || doc.type === 'employment_matching')),
        ...jobAnalysisDocs,
    ];
    const jobSnapshot: JobComparison['jobSnapshot'] = selectedJob ? {
        role: selectedJob.jobRole || '-', hours: selectedJob.workHours || '-',
        commute: selectedJob.location || '-',
        environment: [selectedJob.requirements, selectedJob.accommodations].filter(Boolean).join(' / ') || '-',
        preferences: selectedJob.salary || '-',
    } : { role: '-', hours: '-', commute: '-', environment: '-', preferences: '-' };
    const seekerSnapshot: JobComparison['jobSnapshot'] = {
        role: [seeker.desiredJob1, seeker.desiredJob2].filter(Boolean).join(' / ') || '-',
        hours: seeker.desiredWorkHours || '-', commute: seeker.desiredLocation || '-',
        environment: '직접 확인 필요', preferences: seeker.desiredSalary || '-',
    };

    useEffect(() => {
        onDirtyChange(Object.values(needs).some(value => !!value.trim()) || !!adjustment.trim());
    }, [needs, adjustment, onDirtyChange]);

    useEffect(() => {
        let cancelled = false;
        setJobAnalysisDocs([]);
        setAnalysisLoadError(false);
        if (!jobId) return;
        localDB.query<CaseDocument>('caseDocuments', doc => doc.type === 'job_analysis' && doc.jobId === jobId)
            .then(docs => { if (!cancelled) setJobAnalysisDocs(docs); })
            .catch(() => { if (!cancelled) setAnalysisLoadError(true); });
        return () => { cancelled = true; };
    }, [jobId]);

    return <section aria-labelledby="comparison-title">
        <h3 id="comparison-title" className="text-xl font-bold text-white flex items-center gap-2"><BriefcaseBusiness className="w-5 h-5 text-sky-300" aria-hidden="true" /> 직무 요구–지원 필요 비교</h3>
        <p className="text-sm text-white/55 mt-1 mb-4">등록된 사업체 정보를 기준으로 비교합니다. 빈 이용자 정보는 추정하지 않고 확인 필요로 표시합니다.</p>
        <label htmlFor="comparison-job" className="block text-sm text-white/75 mb-2">비교할 사업체·직무</label>
        <select id="comparison-job" className="input-field" value={jobId} onChange={e => setJobId(e.target.value)} disabled={unavailable}>
            <option value="">사업체를 선택하세요</option>
            {jobs.filter(job => job.id).map(job => <option key={job.id} value={job.id}>{job.companyName} · {job.jobRole}</option>)}
        </select>
        {jobs.length === 0 && <p className="text-sm text-white/50 mt-2">등록된 사업체가 없습니다. 이용자·사업체 관리에서 먼저 등록해 주세요.</p>}
        {selectedJob && <div className="mt-3 text-sm">
            <p className="text-white/60">연결된 매칭 의견·직무분석 {relatedDocuments.length}건 (사업체 ID가 일치하는 기록만 표시)</p>
            {analysisLoadError && <p role="alert" className="text-red-200">직무분석 기록을 불러오지 못했습니다. 기존 기록은 유지됩니다.</p>}
            {relatedDocuments.map(doc => <details key={doc.id} className="rounded-lg border border-white/10 bg-white/5 p-3 mt-2">
                <summary className="cursor-pointer text-accent-200">{doc.type === 'job_analysis' ? '저장된 직무분석' : '저장된 매칭 의견'}</summary>
                <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-white/70">{doc.content}</p>
            </details>)}
        </div>}
        {selectedJob && <form onSubmit={async event => {
            event.preventDefault();
            if (!Object.values(needs).some(value => value.trim()) && !adjustment.trim()) {
                setError('필요한 지원 또는 조정 방향을 한 항목 이상 입력해 주세요.'); return;
            }
            setError('');
            const entry: JobComparison = {
                id: crypto.randomUUID(), date: localDateKey(), jobId: selectedJob.id || '',
                jobLabel: `${selectedJob.companyName} · ${selectedJob.jobRole}`, jobSnapshot,
                supportNeeds: { ...needs }, adjustment: adjustment.trim(),
            };
            if (await save({ ...workflow, jobComparisons: [entry, ...workflow.jobComparisons] }, '직무 비교 기록을 저장했습니다.')) {
                setNeeds(emptyNeeds()); setAdjustment('');
            }
        }}>
            <div className="overflow-x-auto mt-4"><table className="w-full min-w-[680px] text-sm text-left border-collapse">
                <caption className="sr-only">이용자 희망, 사업체 요구, 필요한 지원 비교</caption>
                <thead><tr className="text-white/60 border-b border-white/15"><th className="p-2">항목</th><th className="p-2">이용자 희망·현황</th><th className="p-2">사업체 요구·조건</th><th className="p-2">필요한 지원·조정</th></tr></thead>
                <tbody>{COMPARISON_ROWS.map(row => <tr key={row.key} className="border-b border-white/10 align-top">
                    <th scope="row" className="p-2 text-white/80">{row.label}</th>
                    <td className="p-2 text-white/65 break-words max-w-48">{seekerSnapshot[row.key]}</td>
                    <td className="p-2 text-white/65 break-words max-w-48">{jobSnapshot[row.key]}</td>
                    <td className="p-2"><label className="sr-only" htmlFor={`need-${row.key}`}>{row.label} 필요한 지원</label><input id={`need-${row.key}`} className="input-field !py-2" value={needs[row.key]} onChange={e => setNeeds(current => ({ ...current, [row.key]: e.target.value }))} maxLength={300} placeholder="직접 확인한 지원 필요" disabled={unavailable} /></td>
                </tr>)}</tbody>
            </table></div>
            <label className="block text-sm text-white/75 mt-4">종합 조정 방향<textarea className="textarea-field mt-1" rows={2} value={adjustment} onChange={e => setAdjustment(e.target.value)} maxLength={800} placeholder="사업체와 확인할 조정 사항, 담당자·후속 조치" disabled={unavailable} /></label>
            <button type="submit" className="btn-primary !px-4 !py-2 mt-3" disabled={unavailable}>비교 기록 저장</button>
        </form>}
        {error && <p role="alert" className="text-sm text-red-300 mt-2">{error}</p>}
        {workflow.jobComparisons.length > 0 && <div id="job-comparison-history" className="mt-5 space-y-2"><h4 className="font-semibold text-white">이전 비교 기록</h4>{workflow.jobComparisons.map(entry => <details key={entry.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <summary className="cursor-pointer text-white/80">{entry.date} · {entry.jobLabel}</summary>
            <div className="grid sm:grid-cols-2 gap-2 mt-3 text-sm">{COMPARISON_ROWS.map(row => <div key={row.key}><p className="text-white/50">{row.label} · 사업체 조건</p><p className="text-white/75 break-words">{entry.jobSnapshot[row.key]}</p><p className="text-accent-200 break-words">지원 필요: {entry.supportNeeds[row.key] || '미기록'}</p></div>)}</div>
            <p className="text-sm text-white/80 mt-3 whitespace-pre-wrap break-words">조정 방향: {entry.adjustment || '미기록'}</p>
        </details>)}</div>}
    </section>;
}
