import { useEffect, useRef, useState } from 'react';
import { useDataStore } from '../../store/dataStore';
import { generateText } from '../../services/gemini';
import { regenerateDocumentFromCurrent } from '../../services/documentRegenerationService';
import type { CaseDocument } from '../../types/caseDocument';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/common/ConfirmProvider';
import { useClientContext } from '../../hooks/useClientContext';
import { getFileFingerprint, getStoredImageValidationError } from '../../utils/fileValidation';
import { fileToBase64 } from '../../utils/file';
import { getSeekerKey } from '../../utils/seeker';
import { buildInterviewPrompt, buildJobAnalysisPrompt, EMPLOYMENT_REFINE_INSTRUCTION } from './workmatePrompts';
import {
    EMPTY_INTERVIEW_FORM,
    EMPTY_JOB_ANALYSIS_FORM,
    hasAnyText,
    type EmploymentKind,
    type EmploymentTask,
    type InterviewForm,
    type JobAnalysisForm,
    type JobAnalysisPhoto,
} from './types';

/**
 * 면접일지·직무분석지 작성 상태와 동작.
 * - 생성·보완·저장은 한 번에 하나만 실행합니다(연타·동시 실행으로 서로 덮어쓰거나 중복 저장되지 않도록).
 * - 이용자는 식별자(id → seekerId)로만 찾습니다. 이름으로 찾지 않습니다.
 */
export function useEmploymentDocuments() {
    const { seekers, jobs, fetchCaseDocuments, addCaseDocument, updateCaseDocument } = useDataStore();
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [employmentSeekerId, setEmploymentSeekerId] = useState('');
    const [interviewDoc, setInterviewDoc] = useState<CaseDocument | null>(null);
    const [interviewForm, setInterviewForm] = useState<InterviewForm>(EMPTY_INTERVIEW_FORM);
    const [interviewText, setInterviewText] = useState('');
    const [jobAnalysisDoc, setJobAnalysisDoc] = useState<CaseDocument | null>(null);
    const [jobAnalysisJobId, setJobAnalysisJobId] = useState('');
    const [jobAnalysisJobSearch, setJobAnalysisJobSearch] = useState('');
    const [jobAnalysisForm, setJobAnalysisForm] = useState<JobAnalysisForm>(EMPTY_JOB_ANALYSIS_FORM);
    const [jobAnalysisText, setJobAnalysisText] = useState('');
    const [jobAnalysisPhotos, setJobAnalysisPhotos] = useState<JobAnalysisPhoto[]>([]);
    const jobAnalysisPhotosRef = useRef<JobAnalysisPhoto[]>([]);
    const [employmentGenerating, setEmploymentGenerating] = useState<EmploymentTask | null>(null);
    const [employmentSaving, setEmploymentSaving] = useState<EmploymentKind | null>(null);
    // 생성·보완·저장 중 하나라도 진행 중이면 true (같은 렌더 안의 연타까지 막기 위해 ref 사용)
    const employmentBusyRef = useRef(false);
    // 이용자를 바꿀 때마다 증가. 늦게 도착한 이전 이용자의 결과를 버리는 데 사용합니다.
    const employmentSelectionRequestRef = useRef(0);
    const employmentBusy = employmentGenerating !== null || employmentSaving !== null;

    const selectedEmploymentSeeker = employmentSeekerId
        ? seekers.find(s => getSeekerKey(s) === employmentSeekerId) || null
        : null;
    const employmentSeekerOptions = seekers.filter(seeker => getSeekerKey(seeker));
    const employmentContext = useClientContext(selectedEmploymentSeeker, seekers);
    const employmentContextSummary = employmentContext.summary;
    const selectedJobAnalysisJob = jobs.find(job => job.id === jobAnalysisJobId) || null;

    const isInterviewDirty = (interviewText.trim().length > 0 && interviewText !== (interviewDoc?.content || ''))
        || (!interviewText.trim() && hasAnyText(interviewForm));
    const isJobAnalysisDirty = (jobAnalysisText.trim().length > 0 && jobAnalysisText !== (jobAnalysisDoc?.content || ''))
        || (!jobAnalysisText.trim() && (hasAnyText(jobAnalysisForm, ['companyName', 'jobRole']) || jobAnalysisPhotos.length > 0));

    useEffect(() => {
        jobAnalysisPhotosRef.current = jobAnalysisPhotos;
    }, [jobAnalysisPhotos]);

    useEffect(() => () => {
        jobAnalysisPhotosRef.current.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
    }, []);

    const currentInterviewPrompt = () => buildInterviewPrompt(selectedEmploymentSeeker, interviewForm, employmentContextSummary);
    const currentJobAnalysisPrompt = () => buildJobAnalysisPrompt(selectedJobAnalysisJob, jobAnalysisForm, jobAnalysisPhotos.map(photo => photo.file.name));

    const handleSelectJobAnalysisJob = async (jobId: string) => {
        if (employmentBusyRef.current) { showToast('진행 중인 문서 작업이 끝난 뒤 사업체를 변경해 주세요.', 'info'); return; }
        if (jobId === jobAnalysisJobId) return;
        if (jobAnalysisText.trim() && jobAnalysisText !== (jobAnalysisDoc?.content || '')) {
            const ok = await confirm({
                title: '저장하지 않은 직무분석지',
                message: '사업체를 바꾸면 저장하지 않은 직무분석지 작성 결과가 사라집니다. 되돌릴 수 없습니다. 계속할까요?',
                confirmLabel: '버리고 변경',
                cancelLabel: '취소',
                tone: 'danger',
            });
            if (!ok) return;
        }
        setJobAnalysisJobId(jobId);
        setJobAnalysisDoc(null);
        setJobAnalysisText('');
        const job = jobs.find(item => item.id === jobId);
        if (!job) return;
        setJobAnalysisForm(prev => ({
            ...prev,
            companyName: job.companyName || '',
            jobRole: job.jobRole || '',
        }));
    };

    const handleSelectEmploymentSeeker = async (seekerKey: string) => {
        if (employmentBusyRef.current) { showToast('진행 중인 문서 작업이 끝난 뒤 이용자를 변경해 주세요.', 'info'); return; }
        if (seekerKey === employmentSeekerId) return;
        if (isInterviewDirty) {
            const ok = await confirm({
                title: '저장하지 않은 면접일지',
                message: '이용자를 바꾸면 입력한 면접 내용과 저장하지 않은 면접일지 작성 결과가 사라집니다. 되돌릴 수 없습니다. 계속할까요?',
                confirmLabel: '버리고 변경',
                cancelLabel: '취소',
                tone: 'danger',
            });
            if (!ok) return;
        }
        const requestId = ++employmentSelectionRequestRef.current;
        setEmploymentSeekerId(seekerKey);
        setInterviewDoc(null);
        setInterviewText('');
        setInterviewForm(EMPTY_INTERVIEW_FORM);
        // 직무분석지는 사업체 기준 문서라 이용자를 바꿔도 유지합니다.
        const seeker = seekers.find(s => getSeekerKey(s) === seekerKey);
        if (!seeker) return;
        try {
            // 문서 매칭은 fetchCaseDocuments가 식별자로 합니다(이름으로만 저장된 옛 문서는 같은 이름이 한 명뿐일 때만 읽음).
            const docs = await fetchCaseDocuments(seeker);
            if (requestId !== employmentSelectionRequestRef.current) return;
            const employmentDocs = docs.filter(d => d.tab === 'employment');
            const interview = employmentDocs.find(d => d.type === 'interview_note' || d.type === 'employment_interview_note');
            setInterviewDoc(interview || null);
            setInterviewText(interview?.content || '');
        } catch (error: any) {
            if (requestId !== employmentSelectionRequestRef.current) return;
            showToast(error?.message || '고용지원 문서를 불러오지 못했습니다.', 'error');
        }
    };

    const buildJobAnalysisImageData = async () => {
        return Promise.all(jobAnalysisPhotos.map(async photo => ({
            mimeType: photo.file.type || 'image/png',
            data: await fileToBase64(photo.file),
        })));
    };

    const generateEmploymentDoc = async (kind: EmploymentKind) => {
        if (employmentBusyRef.current) return;
        if (kind === 'jobAnalysis') {
            const hasTextInput = Object.values(jobAnalysisForm).some(value => String(value || '').trim());
            if (!selectedJobAnalysisJob && !hasTextInput && jobAnalysisPhotos.length === 0) {
                showToast('사업체/구인정보를 선택하거나 사진 또는 직무 특성을 입력해 주세요.', 'error');
                return;
            }
        }
        employmentBusyRef.current = true;
        setEmploymentGenerating(kind);
        const requestId = employmentSelectionRequestRef.current;
        try {
            let result = '';
            if (kind === 'jobAnalysis') {
                const imageData = await buildJobAnalysisImageData();
                result = await generateText('counseling', currentJobAnalysisPrompt(), imageData.length ? imageData : undefined, { featureKey: 'workmate', documentType: 'job-analysis' });
            } else {
                result = await generateText('counseling', currentInterviewPrompt(), undefined, { featureKey: 'workmate', documentType: 'interview-note' });
            }
            if (kind === 'interview' && requestId !== employmentSelectionRequestRef.current) {
                showToast('이용자가 바뀌어 이전 이용자의 면접일지 생성 결과는 반영하지 않았습니다.', 'info', 3500);
                return;
            }
            // 새 초안은 불러온 문서의 수정본이 아니므로 연결을 끊어, 저장하면 새 문서로 만들어지게 합니다(기존 문서 보존).
            const hadLoadedDoc = Boolean((kind === 'interview' ? interviewDoc : jobAnalysisDoc)?.id);
            if (kind === 'interview') { setInterviewText(result); setInterviewDoc(null); }
            if (kind === 'jobAnalysis') { setJobAnalysisText(result); setJobAnalysisDoc(null); }
            const label = kind === 'interview' ? '면접일지' : '직무분석지';
            showToast(hadLoadedDoc
                ? `${label} 초안이 생성되었습니다. 저장하면 새 ${label}로 저장되고 기존 문서는 그대로 남습니다.`
                : `${label} 초안이 생성되었습니다.`, 'success', hadLoadedDoc ? 4000 : 2500);
        } catch (error: any) {
            showToast(error?.message || 'AI 문서 생성 중 오류가 발생했습니다. 기존 작성 내용은 유지됩니다.', 'error');
        } finally {
            employmentBusyRef.current = false;
            setEmploymentGenerating(null);
        }
    };

    const refineEmploymentDoc = async (kind: EmploymentKind) => {
        if (employmentBusyRef.current) return;
        const currentContent = kind === 'interview' ? interviewText : jobAnalysisText;
        if (!currentContent.trim()) {
            showToast('먼저 보완할 내용을 작성하거나 생성해 주세요.', 'error');
            return;
        }
        employmentBusyRef.current = true;
        setEmploymentGenerating(kind === 'interview' ? 'interviewRefine' : 'jobAnalysisRefine');
        const requestId = employmentSelectionRequestRef.current;
        try {
            const result = await regenerateDocumentFromCurrent('counseling', {
                documentTitle: kind === 'interview' ? '면접일지' : '직무분석지',
                currentContent,
                userContext: kind === 'interview' ? currentInterviewPrompt() : currentJobAnalysisPrompt(),
                contextSummary: employmentContextSummary,
                additionalInstruction: EMPLOYMENT_REFINE_INSTRUCTION,
            });
            if (kind === 'interview' && requestId !== employmentSelectionRequestRef.current) {
                showToast('이용자가 바뀌어 이전 이용자의 보완 결과는 반영하지 않았습니다.', 'info', 3500);
                return;
            }
            if (kind === 'interview') setInterviewText(result);
            if (kind === 'jobAnalysis') setJobAnalysisText(result);
            showToast('현재 내용 기반 보완본이 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error?.message || '현재 내용 기반 보완 중 오류가 발생했습니다. 기존 작성 내용은 유지됩니다.', 'error');
        } finally {
            employmentBusyRef.current = false;
            setEmploymentGenerating(null);
        }
    };

    const saveEmploymentDoc = async (kind: EmploymentKind) => {
        // 저장 연타로 같은 문서가 두 번 만들어지지 않도록 진행 중이면 무시합니다.
        if (employmentBusyRef.current) return;
        const employmentSeekerKey = getSeekerKey(selectedEmploymentSeeker);
        if (kind === 'interview' && (!selectedEmploymentSeeker || !employmentSeekerKey)) {
            showToast('먼저 이용자를 선택해 주세요.', 'error');
            return;
        }
        const content = kind === 'interview' ? interviewText : jobAnalysisText;
        if (!content.trim()) {
            showToast('저장할 내용이 없습니다.', 'error');
            return;
        }
        const currentDoc = kind === 'interview' ? interviewDoc : jobAnalysisDoc;
        const type = kind === 'interview' ? 'interview_note' : 'job_analysis';
        employmentBusyRef.current = true;
        setEmploymentSaving(kind);
        try {
            if (currentDoc?.id) {
                await updateCaseDocument(currentDoc.id, content);
                const updated = { ...currentDoc, content };
                if (kind === 'interview') setInterviewDoc(updated);
                if (kind === 'jobAnalysis') setJobAnalysisDoc(updated);
            } else {
                const companyName = kind === 'interview' ? interviewForm.companyName : (selectedJobAnalysisJob?.companyName || jobAnalysisForm.companyName || '사업체 미지정');
                const jobRole = kind === 'interview' ? interviewForm.jobRole : (selectedJobAnalysisJob?.jobRole || jobAnalysisForm.jobRole || '직무 미지정');
                const saved = await addCaseDocument({
                    seekerId: kind === 'interview' ? employmentSeekerKey : (selectedJobAnalysisJob?.id || `job-analysis-${companyName}-${jobRole}`),
                    seekerName: kind === 'interview' ? selectedEmploymentSeeker!.name : companyName,
                    type,
                    content,
                    tab: 'employment',
                    source: kind === 'interview' ? 'employment' : 'job_analysis',
                    jobId: kind === 'jobAnalysis' ? (selectedJobAnalysisJob?.id || '') : undefined,
                    companyName,
                    jobRole,
                    location: kind === 'jobAnalysis' ? (selectedJobAnalysisJob?.location || '') : undefined,
                    photoFileNames: kind === 'jobAnalysis' ? jobAnalysisPhotos.map(photo => photo.file.name) : undefined,
                    photoCount: kind === 'jobAnalysis' ? jobAnalysisPhotos.length : undefined,
                });
                if (kind === 'interview') setInterviewDoc(saved);
                if (kind === 'jobAnalysis') setJobAnalysisDoc(saved);
            }
            showToast(kind === 'interview' ? '면접일지를 저장했습니다.' : '직무분석지를 저장했습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error?.message || '문서 저장 중 오류가 발생했습니다. 작성 내용은 유지됩니다.', 'error');
        } finally {
            employmentBusyRef.current = false;
            setEmploymentSaving(null);
        }
    };

    const resetEmploymentResult = async (kind: EmploymentKind) => {
        if (employmentBusyRef.current) return;
        const label = kind === 'interview' ? '면접일지' : '직무분석지';
        const text = kind === 'interview' ? interviewText : jobAnalysisText;
        const loadedDoc = kind === 'interview' ? interviewDoc : jobAnalysisDoc;
        const savedContent = loadedDoc?.content || '';
        const unsaved = text.trim().length > 0 && text !== savedContent;
        const afterClear = loadedDoc?.id
            ? `이미 저장된 ${label}는 삭제되지 않고 그대로 남으며, 비운 뒤 새로 작성해 저장하면 새 ${label}로 저장됩니다.`
            : '비운 뒤 새로 작성해 저장하면 새 문서로 저장됩니다.';
        const ok = await confirm({
            title: `${label} 작성 결과 비우기`,
            message: unsaved
                ? `저장하지 않은 ${label} 작성 결과가 사라지고 되돌릴 수 없습니다.
${afterClear}
비울까요?`
                : `${label} 작성 결과를 화면에서 비울까요?
${afterClear}`,
            confirmLabel: '비우기',
            cancelLabel: '취소',
            tone: 'danger',
        });
        if (!ok) return;
        // 불러온 문서와의 연결을 끊습니다. 이후 저장은 기존 문서를 덮어쓰지 않고 새 문서를 만듭니다.
        if (kind === 'interview') { setInterviewText(''); setInterviewDoc(null); }
        else { setJobAnalysisText(''); setJobAnalysisDoc(null); }
    };

    const addJobAnalysisPhotos = (files: FileList | null) => {
        if (!files) return;
        const imageFiles = Array.from(files).filter(file => !getStoredImageValidationError(file));
        if (imageFiles.length !== files.length) {
            const rejected = Array.from(files).find(file => getStoredImageValidationError(file));
            showToast(rejected ? `${rejected.name}: ${getStoredImageValidationError(rejected)}` : '이미지 파일만 업로드할 수 있습니다.', 'error');
        }
        setJobAnalysisPhotos(prev => {
            const existing = new Set(prev.map(photo => getFileFingerprint(photo.file)));
            const nextPhotos = imageFiles
                .filter(file => !existing.has(getFileFingerprint(file)))
                .map(file => ({
                    id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
                    file,
                    previewUrl: URL.createObjectURL(file),
                }));
            return [...prev, ...nextPhotos];
        });
    };

    const removeJobAnalysisPhoto = (photoId: string) => {
        setJobAnalysisPhotos(prev => {
            const target = prev.find(photo => photo.id === photoId);
            if (target) URL.revokeObjectURL(target.previewUrl);
            return prev.filter(photo => photo.id !== photoId);
        });
    };

    return {
        jobs,
        // 면접일지
        employmentSeekerId,
        employmentSeekerOptions,
        selectedEmploymentSeeker,
        interviewForm,
        setInterviewForm,
        interviewText,
        setInterviewText,
        isInterviewDirty,
        handleSelectEmploymentSeeker,
        // 직무분석지
        jobAnalysisJobId,
        selectedJobAnalysisJob,
        jobAnalysisJobSearch,
        setJobAnalysisJobSearch,
        jobAnalysisForm,
        setJobAnalysisForm,
        jobAnalysisText,
        setJobAnalysisText,
        jobAnalysisPhotos,
        addJobAnalysisPhotos,
        removeJobAnalysisPhoto,
        isJobAnalysisDirty,
        handleSelectJobAnalysisJob,
        // 공용
        employmentContext,
        employmentGenerating,
        employmentSaving,
        employmentBusy,
        generateEmploymentDoc,
        refineEmploymentDoc,
        saveEmploymentDoc,
        resetEmploymentResult,
    };
}

export type EmploymentDocumentsState = ReturnType<typeof useEmploymentDocuments>;
