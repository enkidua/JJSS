import type React from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Image as ImageIcon, Loader2, Search, Sparkles, UploadCloud, X } from 'lucide-react';
import type { JobOpening } from '../../types/matching';
import { ClientContextBox } from '../../components/ClientContextBox';
import { EmploymentResultPanel } from './EmploymentResultPanel';
import type { JobAnalysisForm, JobAnalysisPhoto } from './types';

export function JobAnalysisDocumentTab({
    jobs,
    selectedJobId,
    selectedJob,
    search,
    onSearch,
    onSelectJob,
    form,
    setForm,
    photos,
    addPhotos,
    removePhoto,
    result,
    setResult,
    busy,
    isGenerating,
    isRefining,
    isSaving,
    onGenerate,
    onRefine,
    onSave,
    onReset,
    contextSummary,
    contextLoading,
    contextDescription,
    contextDisabled,
    onLoadContext,
    onClearContext,
}: {
    jobs: JobOpening[];
    selectedJobId: string;
    selectedJob: JobOpening | null;
    search: string;
    onSearch: (value: string) => void;
    onSelectJob: (id: string) => void;
    form: JobAnalysisForm;
    setForm: React.Dispatch<React.SetStateAction<JobAnalysisForm>>;
    photos: JobAnalysisPhoto[];
    addPhotos: (files: FileList | null) => void;
    removePhoto: (photoId: string) => void;
    result: string;
    setResult: (value: string) => void;
    busy: boolean;
    isGenerating: boolean;
    isRefining: boolean;
    isSaving: boolean;
    onGenerate: () => void;
    onRefine: () => void;
    onSave: () => void;
    onReset: () => void;
    contextSummary: string;
    contextLoading: boolean;
    contextDescription?: string;
    contextDisabled?: boolean;
    onLoadContext: () => void;
    onClearContext: () => void;
}) {
    const query = search.trim().toLowerCase();
    const filteredJobs = jobs.filter(job => {
        if (!query) return true;
        return [
            job.companyName,
            job.jobRole,
            job.location,
            job.jobDescription,
            job.requirements,
            job.accommodations,
            job.hiringStatus,
            job.contactPerson,
        ].some(value => String(value || '').toLowerCase().includes(query));
    }).slice(0, 20);

    const summaryItems = selectedJob ? [
        ['회사명', selectedJob.companyName],
        ['직무', selectedJob.jobRole],
        ['근무지역', selectedJob.location],
        ['근무시간', selectedJob.workHours],
        ['급여', selectedJob.salary],
        ['모집장애유형', selectedJob.reqDisabilityType],
        ['모집 중경증', selectedJob.reqSeverity],
        ['모집인원', selectedJob.openingsCount ? `${selectedJob.openingsCount}명` : '확인 필요'],
        ['채용상태', selectedJob.hiringStatus],
        ['담당자', selectedJob.contactPerson],
        ['연락처', selectedJob.contactPhone],
    ] : [];

    return (
        <motion.div
            key="job-analysis"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="w-full max-w-7xl grid grid-cols-1 xl:grid-cols-2 gap-6"
        >
            <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
                <div className="flex items-start gap-3 mb-6">
                    <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <Briefcase className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white">직무분석지 작성</h2>
                        <p className="text-white/40 text-sm mt-1">사업체/구인정보, 사진, 보완 메모를 바탕으로 직무분석지를 작성합니다.</p>
                    </div>
                </div>

                <ClientContextBox
                    summary={contextSummary}
                    loading={contextLoading}
                    onLoad={onLoadContext}
                    onClear={onClearContext}
                    description={contextDescription}
                    disabled={contextDisabled}
                    className="mb-5"
                />

                <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 mb-5">
                    <div className="flex items-center justify-between gap-3 mb-4">
                        <div>
                            <h3 className="font-black text-white">사업체/구인정보 선택</h3>
                            <p className="text-xs text-white/40 mt-1">선택한 정보가 직무분석지 프롬프트에 자동 반영됩니다.</p>
                        </div>
                        <span className="text-[11px] text-white/40">{jobs.length}건</span>
                    </div>
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                        <input
                            value={search}
                            onChange={e => onSearch(e.target.value)}
                            className="input-field !pl-10"
                            placeholder="사업체명, 직무, 지역, 직무내용으로 검색"
                            aria-label="사업체/구인정보 검색"
                        />
                    </div>
                    <select value={selectedJobId} onChange={e => onSelectJob(e.target.value)} disabled={busy} className="input-field disabled:opacity-60" aria-label="사업체/구인정보 선택">
                        <option value="">사업체/구인정보 선택 안 함</option>
                        {filteredJobs.map(job => (
                            <option key={job.id || `${job.companyName}-${job.jobRole}`} value={job.id || ''}>
                                {job.companyName || '사업체명 없음'} / {job.jobRole || '직무 미정'}{job.location ? ` / ${job.location}` : ''}
                            </option>
                        ))}
                    </select>
                    {selectedJob && (
                        <div className="mt-4 space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {summaryItems.map(([label, value]) => (
                                    <div key={label} className="rounded-2xl bg-black/20 border border-white/10 p-3">
                                        <p className="text-[11px] text-white/35 mb-1">{label}</p>
                                        <p className="text-sm text-white/85 leading-relaxed">{value || '확인 필요'}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <JobTextSummary label="직무내용" value={selectedJob.jobDescription} />
                                <JobTextSummary label="요구조건" value={selectedJob.requirements} />
                                <JobTextSummary label="배려사항" value={selectedJob.accommodations} />
                            </div>
                        </div>
                    )}
                    {!selectedJob && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="block">
                                <span className="block text-sm font-medium text-white/70 mb-1.5">직접 입력 사업체명</span>
                                <input value={form.companyName} onChange={e => setForm(prev => ({ ...prev, companyName: e.target.value }))} className="input-field" placeholder="사업체명" />
                            </label>
                            <label className="block">
                                <span className="block text-sm font-medium text-white/70 mb-1.5">직접 입력 직무명</span>
                                <input value={form.jobRole} onChange={e => setForm(prev => ({ ...prev, jobRole: e.target.value }))} className="input-field" placeholder="예: 물품정리, 사무보조" />
                            </label>
                        </div>
                    )}
                </section>

                <section className="rounded-3xl border border-dashed border-white/15 bg-white/[0.025] p-5 mb-5">
                    <label className="flex flex-col items-center justify-center gap-3 text-center cursor-pointer">
                        <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={event => {
                                addPhotos(event.target.files);
                                event.currentTarget.value = '';
                            }}
                        />
                        <UploadCloud className="w-8 h-8 text-emerald-300" />
                        <div>
                            <p className="text-white font-bold">사업체 사진 여러 장 업로드</p>
                            <p className="text-xs text-white/40 mt-1">작업환경 분석에만 사용하고 사진 파일 자체는 저장하지 않습니다.</p>
                        </div>
                    </label>
                    {photos.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                            {photos.map(photo => (
                                <div key={photo.id} className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/25">
                                    <img src={photo.previewUrl} alt={photo.file.name} className="w-full h-28 object-cover" />
                                    <button type="button" onClick={() => removePhoto(photo.id)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-white hover:bg-red-500" title="사진 제거" aria-label={`${photo.file.name} 사진 제거`}>
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                    <p className="px-2 py-1.5 text-[11px] text-white/60 truncate flex items-center gap-1">
                                        <ImageIcon className="w-3 h-3 shrink-0" />
                                        {photo.file.name}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <div className="space-y-4">
                    <label className="block">
                        <span className="block text-sm font-medium text-white/70 mb-1.5">간략 사업체/직무 특성</span>
                        <textarea value={form.traits} onChange={e => setForm(prev => ({ ...prev, traits: e.target.value }))} className="textarea-field !min-h-[110px] text-sm leading-relaxed" placeholder="사진으로 보이는 작업환경, 물품 이동, 협력작업, 작업 순서, 발달장애인 근로 시 고려사항을 적어주세요." />
                    </label>
                    <label className="block">
                        <span className="block text-sm font-medium text-white/70 mb-1.5">사업주 면담 내용</span>
                        <textarea value={form.interviewNotes} onChange={e => setForm(prev => ({ ...prev, interviewNotes: e.target.value }))} className="textarea-field !min-h-[110px] text-sm leading-relaxed" placeholder="직무조정, 향후 고용계획, 대체 직무 가능성, 사업체 요청사항 등을 적어주세요." />
                    </label>
                    <label className="block">
                        <span className="block text-sm font-medium text-white/70 mb-1.5">추가 확인사항</span>
                        <textarea value={form.environment} onChange={e => setForm(prev => ({ ...prev, environment: e.target.value }))} className="textarea-field !min-h-[90px] text-sm leading-relaxed" placeholder="현장 방문 후 추가로 확인한 작업환경, 안전, 동선, 도구, 배치 관련 사항을 적어주세요." />
                    </label>
                </div>

                <button type="button" onClick={onGenerate} disabled={busy} className="btn-primary w-full mt-5 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    직무분석지 생성
                </button>
            </div>

            <EmploymentResultPanel
                description="저장하면 사업체별 직무분석지로 보관됩니다. 사진 파일 자체는 저장하지 않습니다."
                result={result}
                setResult={setResult}
                placeholder="AI가 작성한 직무분석지가 여기에 표시됩니다."
                busy={busy}
                isGenerating={isGenerating}
                isRefining={isRefining}
                isSaving={isSaving}
                onRefine={onRefine}
                onSave={onSave}
                onReset={onReset}
            />
        </motion.div>
    );
}

function JobTextSummary({ label, value }: { label: string; value?: string }) {
    return (
        <div className="rounded-2xl bg-black/20 border border-white/10 p-3 min-h-[118px]">
            <p className="text-[11px] text-white/35 mb-2">{label}</p>
            <p className="text-sm text-white/75 leading-relaxed whitespace-pre-wrap">{value?.trim() || '확인 필요'}</p>
        </div>
    );
}
