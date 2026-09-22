import { useState, useEffect, useRef } from 'react';
import type React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import {
    UserCheck, Briefcase, FileText,
    Sparkles, X, Loader2, Search, CheckCircle2,
    MapPin, DollarSign, Users2, ChevronRight,
    Trash2, Plus, RotateCcw, Copy, Save, Clock,
    ClipboardCheck, CalendarDays, ClipboardList, ShieldCheck, UploadCloud, Image as ImageIcon
} from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import { generateText } from '../services/gemini';
import { regenerateDocumentFromCurrent } from '../services/documentRegenerationService';
import { buildClientContextSummary, withClientContextPrompt } from '../services/clientContextService';
import { JobOpening, Seeker } from '../types/matching';
import { CaseDocument } from '../types/caseDocument';
import { useToast, ToastContainer } from '../components/Toast';
import { MatchingView } from '../components/MatchingView';
import { DocumentReviewTab } from '../components/DocumentReviewTab';
import { RehabPlanTemplatePreview } from '../components/RehabPlanTemplatePreview';
import { getFileFingerprint, getStoredImageValidationError } from '../utils/fileValidation';

// ─── 탭 정의 ───
type TabKey = 'pipeline' | 'matching' | 'interview' | 'jobAnalysis' | 'review';

// ─── 사례관리 단계 정의 ───
type CaseStep = 'select' | 'meeting' | 'plan' | 'followup' | 'done';
type CaseDocumentAction = 'meeting' | 'plan' | 'counseling' | 'evaluation';

type JobAnalysisPhoto = { id: string; file: File; previewUrl: string };

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function WorkMate() {
    const location = useLocation();
    const { seekers, jobs, loading: dbLoading, fetchCaseDocuments, addCaseDocument, deleteCaseDocument, updateCaseDocument } = useDataStore();
    const { toasts, showToast, removeToast } = useToast();
    const [activeTab, setActiveTab] = useState<TabKey>('pipeline');

    // ─── 공통 ───
    const [copied, setCopied] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    // ─── 사례관리 상태 ───
    const [caseSeeker, setCaseSeeker] = useState<Seeker | null>(null);
    const [caseStep, setCaseStep] = useState<CaseStep>('select');
    const [meetingText, setMeetingText] = useState('');
    const [planText, setPlanText] = useState('');
    const [counselText, setCounselText] = useState('');
    const [seekerSearch, setSeekerSearch] = useState('');
    const [showAllCaseSeekers, setShowAllCaseSeekers] = useState(false);

    // 사례관리: 각 단계별 사용자 입력 (단일 textarea)
    const [meetingInput, setMeetingInput] = useState('');
    const [planInput, setPlanInput] = useState('');
    const [counselInput, setCounselInput] = useState('');
    const [caseFollowUpHistory, setCaseFollowUpHistory] = useState<CaseDocument[]>([]);
    const [caseMeetingDoc, setCaseMeetingDoc] = useState<CaseDocument | null>(null);
    const [casePlanDoc, setCasePlanDoc] = useState<CaseDocument | null>(null);
    const [caseContextSummary, setCaseContextSummary] = useState('');
    const [caseContextLoading, setCaseContextLoading] = useState(false);
    const [savingCaseDocType, setSavingCaseDocType] = useState<CaseDocumentAction | null>(null);
    const caseDocSaveInFlightRef = useRef(false);
    const followUpSavedContentsRef = useRef<Record<string, string>>({});
    const caseSelectionRequestRef = useRef(0);

    // ─── 정기평가 상태 ───
    const [evalText, setEvalText] = useState('');
    const [evalInput, setEvalInput] = useState('');

    // ─── 고용지원 문서 상태 ───
    const [employmentSeekerId, setEmploymentSeekerId] = useState('');
    const [interviewDoc, setInterviewDoc] = useState<CaseDocument | null>(null);
    const [interviewForm, setInterviewForm] = useState({
        date: '',
        companyName: '',
        jobRole: '',
        participants: '',
        memo: '',
        seekerResponse: '',
        companyOpinion: '',
        supportPlan: '',
    });
    const [interviewText, setInterviewText] = useState('');
    const [jobAnalysisDoc, setJobAnalysisDoc] = useState<CaseDocument | null>(null);
    const [jobAnalysisJobId, setJobAnalysisJobId] = useState('');
    const [jobAnalysisJobSearch, setJobAnalysisJobSearch] = useState('');
    const [jobAnalysisForm, setJobAnalysisForm] = useState({
        companyName: '',
        jobRole: '',
        traits: '',
        interviewNotes: '',
        tasks: '',
        environment: '',
        abilities: '',
        risks: '',
        supports: '',
        suitableSeeker: '',
    });
    const [jobAnalysisText, setJobAnalysisText] = useState('');
    const [jobAnalysisPhotos, setJobAnalysisPhotos] = useState<JobAnalysisPhoto[]>([]);
    const jobAnalysisPhotosRef = useRef<JobAnalysisPhoto[]>([]);
    const [employmentGenerating, setEmploymentGenerating] = useState<'interview' | 'jobAnalysis' | 'interviewRefine' | 'jobAnalysisRefine' | null>(null);
    const [employmentContextSummary, setEmploymentContextSummary] = useState('');
    const [employmentContextLoading, setEmploymentContextLoading] = useState(false);

    const hasUnsavedCaseChanges = () => {
        const hasEditedSavedFollowUp = caseFollowUpHistory.some(document =>
            Boolean(document.id) && followUpSavedContentsRef.current[document.id!] !== document.content
        );
        const meetingChanged = meetingText.trim().length > 0 && meetingText !== (caseMeetingDoc?.content || '');
        const planChanged = planText.trim().length > 0 && planText !== (casePlanDoc?.content || '');

        return meetingChanged || planChanged || hasEditedSavedFollowUp ||
            Boolean(counselText.trim() || evalText.trim() || meetingInput.trim() || planInput.trim() || counselInput.trim() || evalInput.trim());
    };

    const confirmDiscardCaseChanges = (message: string) =>
        !hasUnsavedCaseChanges() || confirm(message);

    useEffect(() => {
        jobAnalysisPhotosRef.current = jobAnalysisPhotos;
    }, [jobAnalysisPhotos]);

    useEffect(() => () => {
        jobAnalysisPhotosRef.current.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
    }, []);

    // Navigation State 및 초기 데이터 로드 처리
    useEffect(() => {
        if (location.state && seekers.length > 0 && !caseSeeker) {
            const { tab, seekerName, step } = location.state as any;
            if (tab === 'pipeline' || tab === 'matching' || tab === 'interview' || tab === 'jobAnalysis' || tab === 'review') setActiveTab(tab);
            if (seekerName) {
                const found = seekers.find(s => s.name === seekerName);
                if (found) {
                    handleSelectCaseSeeker(found, step as CaseStep | undefined);
                }
            }
        }
    }, [location.state, seekers.length, caseSeeker]);

    const handleCopy = async (text: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        showToast('내용이 복사되었습니다.', 'success');
        setTimeout(() => setCopied(false), 2000);
    };

    // ─── 사례관리: 이용자 선택 ───
    const handleSelectCaseSeeker = async (s: Seeker, requestedStep?: CaseStep) => {
        if (caseDocSaveInFlightRef.current || isGenerating) { showToast('문서 처리가 끝난 뒤 이용자를 변경해 주세요.', 'info'); return; }
        if (caseSeeker && !confirmDiscardCaseChanges('저장하지 않은 작성 내용이 있습니다. 이용자를 변경하면 해당 내용이 사라집니다. 계속할까요?')) return;

        const requestId = ++caseSelectionRequestRef.current;
        setCaseSeeker(s);
        setCaseStep('meeting');
        setMeetingText(''); setPlanText(''); setCounselText(''); setEvalText('');
        setMeetingInput(''); setPlanInput(''); setCounselInput(''); setEvalInput('');
        setCaseFollowUpHistory([]);
        followUpSavedContentsRef.current = {};
        setCaseMeetingDoc(null);
        setCasePlanDoc(null);
        setCaseContextSummary('');
        // DB에서 해당 이용자의 문서 로드
        if (s.id || s.seekerId || s.name) {
            let docs: CaseDocument[] = [];
            try {
                docs = await fetchCaseDocuments(s);
            } catch (error: any) {
                if (requestId !== caseSelectionRequestRef.current) return;
                showToast(error?.message || '저장된 사례관리 문서를 불러오지 못했습니다.', 'error', 3500);
            }
            if (requestId !== caseSelectionRequestRef.current) return;
            const tabDocs = docs.filter(d => d.tab === 'case');
            const meetDoc = tabDocs.find(d => d.type === 'meeting');
            const planDoc = tabDocs.find(d => d.type === 'plan');
            if (meetDoc) { setCaseMeetingDoc(meetDoc); setMeetingText(meetDoc.content); }
            if (planDoc) { setCasePlanDoc(planDoc); setPlanText(planDoc.content); }
            // 사후관리 기록 (상담 및 평가)
            const followUpDocs = tabDocs.filter(d => d.type === 'counseling' || d.type === 'evaluation');
            setCaseFollowUpHistory(followUpDocs);
            const savedContents: Record<string, string> = {};
            followUpDocs.forEach(document => {
                if (document.id) savedContents[document.id] = document.content;
            });
            followUpSavedContentsRef.current = savedContents;

            // 요청된 특정 단계가 있으면 해당 단계로 직접 이동 (단독 작성 모드)
            if (requestedStep) {
                setCaseStep(requestedStep);
            } else {
                // 상태 진행 단계 자동 결정
                if (meetDoc && planDoc) {
                    setCaseStep('followup');
                } else if (meetDoc) {
                    setCaseStep('plan');
                } else {
                    setCaseStep('meeting');
                }
            }
        } else if (requestedStep) {
            setCaseStep(requestedStep);
        }
    };

    const buildSeekerContext = (s: Seeker) => `
[이용자 정보]
이름: ${s.name} / 나이: ${s.age}
장애유형: ${s.disabilityType} (${s.severity})
희망직종: ${s.desiredJob1}${s.desiredJob2 ? ` / ${s.desiredJob2}` : ''}
희망지역: ${s.desiredLocation} / 희망임금: ${s.desiredSalary}
특이사항: ${s.notes || '없음'}`;

    const selectedEmploymentSeeker = seekers.find(s => (s.id || s.seekerId || s.name) === employmentSeekerId) || null;
    const employmentSeekerKey = selectedEmploymentSeeker?.id || selectedEmploymentSeeker?.seekerId || selectedEmploymentSeeker?.name || '';
    const selectedJobAnalysisJob = jobs.find(job => job.id === jobAnalysisJobId) || null;

    const handleSelectJobAnalysisJob = (jobId: string) => {
        setJobAnalysisJobId(jobId);
        const job = jobs.find(item => item.id === jobId);
        if (!job) return;
        setJobAnalysisForm(prev => ({
            ...prev,
            companyName: job.companyName || '',
            jobRole: job.jobRole || '',
        }));
        setJobAnalysisDoc(null);
        setJobAnalysisText('');
    };

    const loadEmploymentDocs = async (seeker: Seeker) => {
        try {
            const docs = await fetchCaseDocuments(seeker);
            const employmentDocs = docs.filter(d => d.tab === 'employment');
            const interview = employmentDocs.find(d => d.type === 'interview_note' || d.type === 'employment_interview_note');
            setInterviewDoc(interview || null);
            setInterviewText(interview?.content || '');
        } catch (error: any) {
            showToast(error?.message || '고용지원 문서를 불러오지 못했습니다.', 'error', 3500);
        }
    };

    const handleSelectEmploymentSeeker = async (seekerId: string) => {
        setEmploymentSeekerId(seekerId);
        const seeker = seekers.find(s => (s.id || s.seekerId || s.name) === seekerId);
        setInterviewDoc(null);
        setInterviewText('');
        setJobAnalysisDoc(null);
        setJobAnalysisText('');
        if (seeker) await loadEmploymentDocs(seeker);
        setEmploymentContextSummary('');
    };

    const loadClientContext = async (target: 'case' | 'employment') => {
        const seeker = target === 'case' ? caseSeeker : selectedEmploymentSeeker;
        if (!seeker) {
            showToast('먼저 이용자를 선택해 주세요.', 'error', 2400);
            return;
        }
        const setLoading = target === 'case' ? setCaseContextLoading : setEmploymentContextLoading;
        const setSummary = target === 'case' ? setCaseContextSummary : setEmploymentContextSummary;
        setLoading(true);
        try {
            const result = await buildClientContextSummary(seeker, seekers);
            if (!result.hasRecords) {
                setSummary('');
                showToast(result.note || '불러올 최근 직업훈련·고용지원 기록이 없습니다.', 'info', 2800);
                return;
            }
            setSummary(result.summary);
            showToast(`최근 기록 참고자료를 불러왔습니다. 관련 문서 ${result.recordCount}건을 참고합니다.`, 'success', 2600);
        } catch (error: any) {
            showToast(error?.message || '최근 기록 참고자료를 불러오지 못했습니다. 현재 작성 내용은 유지됩니다.', 'error', 4000);
        } finally {
            setLoading(false);
        }
    };

    const buildInterviewPrompt = () => {
        const ctx = selectedEmploymentSeeker ? buildSeekerContext(selectedEmploymentSeeker) : '[이용자 정보]\n선택된 이용자 없음';
        return withClientContextPrompt(`${ctx}

[면접 기본 정보]
면접일: ${interviewForm.date || '확인 필요'}
사업체명: ${interviewForm.companyName || '확인 필요'}
직무: ${interviewForm.jobRole || '확인 필요'}
면접 참여자: ${interviewForm.participants || '확인 필요'}

[면접 내용]
${interviewForm.memo || '담당자 입력 없음'}

[당사자 반응]
${interviewForm.seekerResponse || '확인 필요'}

[사업체 의견]
${interviewForm.companyOpinion || '확인 필요'}

[후속 지원계획]
${interviewForm.supportPlan || '확인 필요'}

위 내용을 바탕으로 직업재활 고용지원 현장에서 바로 사용할 수 있는 [면접일지]를 작성해줘. 관찰 사실과 담당자 판단을 구분하고, 장애인을 존중하는 표현을 사용하며, 후속 지원계획을 구체적으로 정리해.`, employmentContextSummary);
    };

    const buildSelectedJobContext = () => {
        const job = selectedJobAnalysisJob;
        return `[선택한 사업체/구인정보]
회사명: ${job?.companyName || jobAnalysisForm.companyName || '확인 필요'}
직무: ${job?.jobRole || jobAnalysisForm.jobRole || '확인 필요'}
근무지역: ${job?.location || '확인 필요'}
근무시간: ${job?.workHours || '확인 필요'}
급여: ${job?.salary || '확인 필요'}
모집장애유형: ${job?.reqDisabilityType || '확인 필요'}
모집 중경증: ${job?.reqSeverity || '확인 필요'}
모집인원: ${job?.openingsCount || '확인 필요'}
직무내용: ${job?.jobDescription || '확인 필요'}
요구조건: ${job?.requirements || '확인 필요'}
배려사항: ${job?.accommodations || '확인 필요'}
채용상태: ${job?.hiringStatus || '확인 필요'}
담당자: ${job?.contactPerson || '확인 필요'}
연락처: ${job?.contactPhone || '확인 필요'}`;
    };

    const buildJobAnalysisPrompt = () => `${buildSelectedJobContext()}

[직무분석 기본 정보]
사업체명: ${selectedJobAnalysisJob?.companyName || jobAnalysisForm.companyName || '확인 필요'}
직무명: ${selectedJobAnalysisJob?.jobRole || jobAnalysisForm.jobRole || '확인 필요'}
사진 참고: ${jobAnalysisPhotos.length ? `${jobAnalysisPhotos.length}장 첨부됨 (${jobAnalysisPhotos.map(photo => photo.file.name).join(', ')})` : '첨부 사진 없음'}

[간략 사업체/직무 특성]
${jobAnalysisForm.traits || jobAnalysisForm.tasks || jobAnalysisForm.environment || '담당자 입력 없음'}

[사업주 면담 내용]
${jobAnalysisForm.interviewNotes || '확인 필요'}

[추가 참고 메모]
주요 과업: ${jobAnalysisForm.tasks || '확인 필요'}
작업환경: ${jobAnalysisForm.environment || '확인 필요'}
필요한 신체/인지/의사소통 능력: ${jobAnalysisForm.abilities || '확인 필요'}
위험요소: ${jobAnalysisForm.risks || '확인 필요'}
필요한 지원: ${jobAnalysisForm.supports || '확인 필요'}
적합 이용자 특성: ${jobAnalysisForm.suitableSeeker || '확인 필요'}

[사진 분석 지시]
첨부 사진이 있으면 작업환경, 동선, 도구, 사람의 움직임, 위험요소, 협력 필요성, 물품 이동 여부, 외부인 출입 가능성, 소음/조명/공간 제약을 관찰해 직무분석지에 반영해줘.
사진으로 확인하기 어려운 내용은 '확인 필요' 또는 '사업주 면담 필요'로 작성해.

[분량 및 누락 방지 지침]
- 아래 1~7번 항목은 절대 생략하지 말고 모두 작성
- 각 항목은 담당자가 현장에서 바로 확인하고 사용할 수 있을 정도로 충분한 분량으로 작성
- 특히 4. 세부과제는 작업 위치, 작업 순서, 사용 도구, 우세손/비우세손 사용, 속도, 주의사항, 위험요소, 확인 필요사항을 가능한 한 빠짐없이 단계별로 매우 자세히 작성
- 정보가 부족한 항목은 삭제하지 말고 '확인 필요' 또는 '사업주 면담 필요'로 남김
- 전체 직무분석지는 길어져도 중간 생략하지 말고, 짧은 요약으로 끝내지 않음

[문체 지침]
- 모든 응답은 한글로 작성
- 장애인을 존중하는 표현 사용
- 모든 문장은 음슴체, 개조식으로 작성
- '지도'나 '교육' 대신 가능한 경우 '지원' 표현 사용
- 전문성 있는 공공기관 문서로 작성
- 내용 축약하지 않음
- 어려운 용어, 차가운 문체, 외래어를 피하고 현장 실무자가 이해하기 쉽게 작성
- 능동태 사용
- '쌤' 표현은 '선생님'으로 변경
- '상태' 표현은 피하고 필요한 경우 '상황', '특성', '지원 필요사항'으로 작성

[반드시 포함할 출력 양식]
1. 물품입출고
- 빈도: 상/중/하
- 강도: 상/중/하
- 근로 시 조치사항

2. 외부인출입
- 빈도: 상/중/하
- 강도: 상/중/하
- 근로 시 조치사항

3. 협력작업
- 빈도: 상/중/하
- 강도: 상/중/하
- 근로 시 조치사항

4. 세부과제
- 직무 수행 방법을 모르는 사람이 보아도 수행 가능할 정도로 아주 상세하게 작성
- 우세손과 비우세손 사용 구분
- 작업 위치, 작업 순서, 사용 도구, 우세손/비우세손 사용, 속도, 주의사항, 위험요소, 확인 필요사항 작성
- 각 세부과제는 번호 목록으로 나누고, 필요한 경우 준비 단계, 수행 단계, 확인 단계, 정리 단계로 세분화
- 확인되지 않은 작업조건은 생략하지 말고 '확인 필요' 또는 '사업주 면담 필요'로 표시

5. 지식/기능
- 배근력, 허리굽히기, 의자 앉기, 쪼그려 앉기, 서기, 계단 오르기, 보행, 손가락 기민성, 눈손협응, 양손협응, 청력, 시력, 지시 이해, 쓰기, 읽기, 수세기, 수리능력, 금전관리, 시간개념, 크기변별, 형태변별, 색변별 등 필요한 기능을 가능한 많이 제시

6. 제공가능한 지원수준
- 발달장애인이 직무 수행 중 제한될 수 있는 부분 고려
- 사진, 표식, 순서카드, 반복 확인, 동료 지원, 작업 순서 단순화 등 현실적인 지원방식 포함

7. 사업주 면담
- 사업체 면담 내용 필수 포함
- 직무조정 관련 내용 포함
- 향후 고용계획 관련 내용 포함
- 수행이 어려울 경우 대체 직무 또는 다른 팀 이동 가능성 등 사업주 의견 포함

위 기준으로 직업재활 고용지원 담당자가 바로 활용할 수 있는 [직무분석지]를 작성해줘.`;

    const buildJobAnalysisImageData = async () => {
        return Promise.all(jobAnalysisPhotos.map(async photo => ({
            mimeType: photo.file.type || 'image/png',
            data: await fileToBase64(photo.file),
        })));
    };

    const generateEmploymentDoc = async (kind: 'interview' | 'jobAnalysis') => {
        setEmploymentGenerating(kind);
        try {
            let result = '';
            if (kind === 'jobAnalysis') {
                const hasTextInput = Object.values(jobAnalysisForm).some(value => String(value || '').trim());
                const hasJobInfo = !!selectedJobAnalysisJob;
                if (!hasJobInfo && !hasTextInput && jobAnalysisPhotos.length === 0) {
                    showToast('사업체/구인정보를 선택하거나 사진 또는 직무 특성을 입력해 주세요.', 'error', 2500);
                    return;
                }
                const imageData = await buildJobAnalysisImageData();
                result = await generateText('counseling', buildJobAnalysisPrompt(), imageData.length ? imageData : undefined, { featureKey: 'workmate', documentType: 'job-analysis' });
            } else {
                result = await generateText('counseling', buildInterviewPrompt(), undefined, { featureKey: 'workmate', documentType: 'interview-note' });
            }
            if (kind === 'interview') setInterviewText(result);
            if (kind === 'jobAnalysis') setJobAnalysisText(result);
            showToast(kind === 'interview' ? '면접일지 초안이 생성되었습니다.' : '직무분석지 초안이 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error?.message || 'AI 문서 생성 중 오류가 발생했습니다. 기존 작성 내용은 유지됩니다.', 'error', 4500);
        } finally {
            setEmploymentGenerating(null);
        }
    };

    const refineEmploymentDoc = async (kind: 'interview' | 'jobAnalysis') => {
        const currentContent = kind === 'interview' ? interviewText : jobAnalysisText;
        if (!currentContent.trim()) {
            showToast('먼저 보완할 내용을 작성하거나 생성해 주세요.', 'error', 2500);
            return;
        }
        setEmploymentGenerating(kind === 'interview' ? 'interviewRefine' : 'jobAnalysisRefine');
        try {
            const result = await regenerateDocumentFromCurrent('counseling', {
                documentTitle: kind === 'interview' ? '면접일지' : '직무분석지',
                currentContent,
                userContext: kind === 'interview' ? buildInterviewPrompt() : buildJobAnalysisPrompt(),
                contextSummary: employmentContextSummary,
                additionalInstruction: '현재 작성자가 수정한 표현과 의도를 유지하면서 직업재활 실무 문서 형식에 맞게 보완해 주세요. 관찰 사실과 판단을 구분하고, 가능한 경우 지도/교육보다 지원이라는 표현을 우선 사용해 주세요.',
            });
            if (kind === 'interview') setInterviewText(result);
            if (kind === 'jobAnalysis') setJobAnalysisText(result);
            showToast('현재 내용 기반 보완본이 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error?.message || '현재 내용 기반 보완 중 오류가 발생했습니다. 기존 작성 내용은 유지됩니다.', 'error', 4500);
        } finally {
            setEmploymentGenerating(null);
        }
    };

    const saveEmploymentDoc = async (kind: 'interview' | 'jobAnalysis') => {
        if (kind === 'interview' && (!selectedEmploymentSeeker || !employmentSeekerKey)) {
            showToast('먼저 이용자를 선택해 주세요.', 'error', 2500);
            return;
        }
        const content = kind === 'interview' ? interviewText : jobAnalysisText;
        if (!content.trim()) {
            showToast('저장할 내용이 없습니다.', 'error', 2200);
            return;
        }
        const currentDoc = kind === 'interview' ? interviewDoc : jobAnalysisDoc;
        const type = kind === 'interview' ? 'interview_note' : 'job_analysis';
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
            showToast('caseDocuments에 저장되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error?.message || '문서 저장 중 오류가 발생했습니다.', 'error', 4500);
        }
    };

    const addJobAnalysisPhotos = (files: FileList | null) => {
        if (!files) return;
        const imageFiles = Array.from(files).filter(file => !getStoredImageValidationError(file));
        if (imageFiles.length !== files.length) {
            const rejected = Array.from(files).find(file => getStoredImageValidationError(file));
            showToast(rejected ? `${rejected.name}: ${getStoredImageValidationError(rejected)}` : '이미지 파일만 업로드할 수 있습니다.', 'error', 3200);
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

    const generateCaseDoc = async (step: CaseDocumentAction) => {
        if (caseDocSaveInFlightRef.current || isGenerating) return;
        if (!caseSeeker) return;
        setIsGenerating(true);
        try {
            const ctx = buildSeekerContext(caseSeeker);
            if (step === 'meeting') {
                const prompt = withClientContextPrompt(`${ctx}\n\n--- 담당자가 입력한 사례회의 내용 ---\n${meetingInput || '(담당자 입력 없음)'}\n\n` +
                    `위 이용자 정보와 담당자가 입력한 모든 내용을 **단 하나도 누락하지 말고** 상세히 반영하여 전문적인 [사례회의록]을 작성해 줘. \n` +
                    `기존 틀(욕구 분석, 현재 상황, 논의 내용(발언자별), 결론)은 유지하되, **담당자가 입력한 모든 키워드와 논의 포인트가 문서에 빠짐없이 기록**되어야 해. \n` +
                    `각 항목은 매우 상세하고 논리적인 보고서 형식으로 서술하고, 전체적으로 정보의 밀도가 높고 풍부한 분량이 나오도록 구성해 주길 바라.`, caseContextSummary);
                const result = await generateText('case_meeting', prompt, undefined, { featureKey: 'workmate', documentType: 'case-meeting' });
                setMeetingText(result);
                if (caseSeeker?.id) {
                    try {
                        const newDoc = await addCaseDocument({ seekerId: caseSeeker.id || caseSeeker.seekerId || caseSeeker.name, seekerName: caseSeeker.name, type: 'meeting', content: result, tab: 'case' });
                        setCaseMeetingDoc(newDoc);
                    } catch {
                        showToast('사례회의록 초안은 생성됐지만 자동 저장하지 못했습니다. 작성 내용은 유지되므로 저장 버튼을 다시 눌러 주세요.', 'error', 4500);
                    }
                }
                setCaseStep('plan');
            } else if (step === 'plan') {
                const prev = meetingText ? `\n\n[사례회의 핵심 내용]\n${meetingText.substring(0, 800)}` : '';
                const prompt = withClientContextPrompt(`${ctx}${prev}\n\n--- 담당자가 입력한 재활계획 내용 ---\n${planInput || '(담당자 입력 없음)'}\n\n위 이용자 정보, 사례회의 내용, 담당자 입력을 모두 참고하여 [직업재활계획서]를 작성해 줘. 강점, 제한점, 종합소견, 직업목표, 장기목표, 단기목표, 수행방법을 포함해.`, caseContextSummary);
                const result = await generateText('rehab_plan', prompt, undefined, { featureKey: 'workmate', documentType: 'rehab-plan' });
                setPlanText(result);
                if (caseSeeker?.id) {
                    try {
                        const newDoc = await addCaseDocument({ seekerId: caseSeeker.id || caseSeeker.seekerId || caseSeeker.name, seekerName: caseSeeker.name, type: 'plan', content: result, tab: 'case' });
                        setCasePlanDoc(newDoc);
                    } catch {
                        showToast('직업재활계획서 초안은 생성됐지만 자동 저장하지 못했습니다. 작성 내용은 유지되므로 저장 버튼을 다시 눌러 주세요.', 'error', 4500);
                    }
                }
                setCaseStep('followup');
            } else if (step === 'counseling') {
                // ─── 직업재활계획서 참고 (사례관리 연속성의 핵심) ───
                let planContext = '';
                if (planText) {
                    planContext = `\n\n[직업재활계획서 - 사례관리 기준 문서]\n${planText.substring(0, 1200)}`;
                }

                // ─── 사례회의 요약 참고 ───
                let meetingContext = '';
                if (meetingText) {
                    meetingContext = `\n\n[사례회의 핵심 요약]\n${meetingText.substring(0, 400)}`;
                }

                // ─── 이전 상담일지/정기평가 참조 (토큰 최적화) ───
                let historyContext = '';
                const historyCount = caseFollowUpHistory.length;
                if (historyCount > 0) {
                    const HISTORY_THRESHOLD = 10;
                    const recentCount = historyCount > HISTORY_THRESHOLD ? 3 : historyCount;
                    const recentHistory = caseFollowUpHistory.slice(-recentCount);
                    const startIndex = historyCount - recentCount;

                    historyContext = `\n\n--- 이전 사후관리 기록 (총 ${historyCount}건 중 최근 ${recentCount}건) ---\n`;
                    historyContext += recentHistory.map((h, i) =>
                        `[${h.type === 'counseling' ? '상담' : '정기평가'}]\n${h.content}`
                    ).join('\n\n');

                    if (historyCount > HISTORY_THRESHOLD) {
                        historyContext += `\n\n※ 참고: 이전 ${historyCount - recentCount}건의 상담 기록이 더 있습니다. 위 최근 기록의 맥락을 이어서 작성해 주세요.`;
                    }
                }

                let prompt = `${ctx}${planContext}${meetingContext}${historyContext}\n\n--- 담당자가 입력한 상담 내용 ---\n${counselInput || '(담당자 입력 없음)'}\n\n`;
                prompt += '위 이용자 정보, 직업재활계획서의 목표와 수행방법, ';
                if (historyCount > 0) prompt += '이전 진행 경과, ';
                prompt += '담당자 입력을 모두 참고하여 사례관리의 연속성을 유지하는 [상담일지]를 작성해 줘.\n';
                prompt += `상담일시, 장소, 상담내용(재활계획 목표 대비 진전사항 포함), 향후 지원계획, 담당자를 포함해.`;
                prompt = withClientContextPrompt(prompt, caseContextSummary);
                const result = await generateText('counseling', prompt, undefined, { featureKey: 'workmate', documentType: 'counseling' });
                setCounselText(result);
                // 상담 완료 후에도 followup 상태 유지 (사용자가 직접 저장 버튼을 눌러야 DB에 저장됨)
            } else if (step === 'evaluation') {
                // ─── 정기평가: 직업재활계획 평가 + 재수립 ───
                let evalPrompt = `${ctx}`;

                // 직업재활계획서 전문 참조 (평가 대상)
                if (planText) {
                    evalPrompt += `\n\n[현행 직업재활계획서 - 평가 대상 문서]\n${planText}`;
                }

                // 사후관리 기록 (상담 및 평가) 참조
                const followUpCount = caseFollowUpHistory.length;
                if (followUpCount > 0) {
                    const recentLogs = followUpCount > 5 ? caseFollowUpHistory.slice(-5) : caseFollowUpHistory;
                    evalPrompt += `\n\n--- 최근 사후관리 히스토리 (최근 ${recentLogs.length}건) ---\n`;
                    evalPrompt += recentLogs.map(h => `[${h.type === 'counseling' ? '상담' : '정기평가'} 기록]\n${h.content}`).join('\n\n');
                }

                evalPrompt += `\n\n--- 담당자가 입력한 평가 내용 ---\n${evalInput || '(담당자 입력 없음)'}\n\n`;
                evalPrompt += `위 이용자 정보, 직업재활계획서, 상담일지 기록, 담당자 입력을 참고하여 [정기평가서]를 작성해 줘.\n`;
                evalPrompt += `다음 구성을 포함해:\n`;
                evalPrompt += `1. 평가 개요 (평가일, 평가 기간, 평가자)\n`;
                evalPrompt += `2. 직업재활계획 달성도 평가\n`;
                evalPrompt += `   - 장기목표 달성 여부 및 근거\n`;
                evalPrompt += `   - 단기목표별 달성 여부 (달성/부분달성/미달성) 및 구체적 근거\n`;
                evalPrompt += `   - 수행방법 이행 여부\n`;
                evalPrompt += `3. 종합 평가 의견\n`;
                evalPrompt += `4. 수정 직업재활계획서\n`;
                evalPrompt += `   - 수정 사유\n`;
                evalPrompt += `   - 새로운 직업목표 / 장기목표 / 단기목표 / 수행방법\n`;
                evalPrompt += `   - 향후 지원 방향\n`;

                const result = await generateText('evaluation', withClientContextPrompt(evalPrompt, caseContextSummary), undefined, { featureKey: 'workmate', documentType: 'evaluation' });
                setEvalText(result);
                // 평가 완료 후에도 유지 (사용자가 직접 저장 버튼을 눌러야 DB에 저장됨)
            }
        } catch (error: any) {
            showToast(error?.message || 'AI 생성 중 오류가 발생했습니다. 기존 작성 내용은 유지됩니다.', 'error', 7000);
        } finally {
            setIsGenerating(false);
        }
    };

    const refineCaseDoc = async (type: 'meeting' | 'plan' | 'counseling' | 'evaluation') => {
        if (caseDocSaveInFlightRef.current || isGenerating) return;
        if (!caseSeeker) return;
        const currentContent = type === 'meeting' ? meetingText : type === 'plan' ? planText : type === 'counseling' ? counselText : evalText;
        if (!currentContent.trim()) {
            showToast('먼저 보완할 내용을 작성하거나 생성해 주세요.', 'error', 2500);
            return;
        }
        if (!confirm('현재 작성칸 내용을 기준으로 보완본을 생성합니다. 기존 내용은 생성이 끝난 뒤에만 새 보완본으로 바뀝니다. 진행할까요?')) return;

        setIsGenerating(true);
        try {
            const ctx = buildSeekerContext(caseSeeker);
            const previousRecords = [
                meetingText && type !== 'meeting' ? `[사례회의록]\n${meetingText}` : '',
                planText && type !== 'plan' ? `[직업재활계획서]\n${planText}` : '',
                caseFollowUpHistory.length ? caseFollowUpHistory.slice(-5).map((doc, index) => `[최근 ${doc.type === 'counseling' ? '상담일지' : '정기평가'} ${index + 1}]\n${doc.content}`).join('\n\n') : '',
            ].filter(Boolean).join('\n\n');
            const titleMap = {
                meeting: '사례회의록',
                plan: '직업재활계획서',
                counseling: '상담일지',
                evaluation: '정기평가서',
            };
            const promptType = type === 'meeting' ? 'case_meeting' : type === 'plan' ? 'rehab_plan' : type;
            const result = await regenerateDocumentFromCurrent(promptType, {
                documentTitle: titleMap[type],
                currentContent,
                userContext: ctx,
                previousRecords,
                contextSummary: caseContextSummary,
                additionalInstruction: '사례관리의 연속성이 보이도록 하고, 담당자가 직접 수정한 표현은 우선 보존해 주세요.',
            });
            if (type === 'meeting') setMeetingText(result);
            if (type === 'plan') setPlanText(result);
            if (type === 'counseling') setCounselText(result);
            if (type === 'evaluation') setEvalText(result);
            showToast('현재 내용 기반 보완본이 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error?.message || '현재 내용 기반 보완 중 오류가 발생했습니다. 기존 작성 내용은 유지됩니다.', 'error', 4500);
        } finally {
            setIsGenerating(false);
        }
    };

    const resetCase = () => {
        if (caseDocSaveInFlightRef.current || isGenerating) { showToast('문서 처리가 끝난 뒤 이용자를 변경해 주세요.', 'info'); return; }
        if (!confirmDiscardCaseChanges('저장하지 않은 작성 내용이 있습니다. 이용자 선택 화면으로 돌아가면 해당 내용이 사라집니다. 계속할까요?')) return;

        caseSelectionRequestRef.current += 1;
        setCaseSeeker(null); setCaseStep('select');
        setMeetingText(''); setPlanText(''); setCounselText(''); setEvalText('');
        setMeetingInput(''); setPlanInput(''); setCounselInput(''); setEvalInput('');
        setCaseFollowUpHistory([]);
        followUpSavedContentsRef.current = {};
        setCaseMeetingDoc(null);
        setCasePlanDoc(null);
        setCaseContextSummary('');
    };

    // ─── 사례관리: 작성 모드 리셋 ───
    const triggerNewCounseling = () => {
        setCounselText('');
        setCounselInput('');
        setCaseStep('followup');
    };

    const triggerNewEvaluation = () => {
        setEvalText('');
        setEvalInput('');
        setCaseStep('followup');
    };

    // ─── 사례관리: 문서 삭제 ───
    const handleDeleteCaseDoc = async (docId: string, index?: number, type?: 'meeting' | 'plan' | 'counseling' | 'evaluation') => {
        if (caseDocSaveInFlightRef.current) return;
        if (!confirm('이 문서를 삭제하시겠습니까?')) return;

        // 삭제할 문서의 내용 확인 (상태 동기화를 위해)
        let deletedContent = '';
        if ((type === 'counseling' || type === 'evaluation') && index !== undefined) deletedContent = caseFollowUpHistory[index]?.content;

        try { await deleteCaseDocument(docId); }
        catch (error: any) { showToast(error?.message || '문서를 삭제하지 못했습니다.', 'error'); return; }

        if (type === 'meeting') {
            setCaseMeetingDoc(null); setMeetingText('');
        } else if (type === 'plan') {
            setCasePlanDoc(null); setPlanText('');
        } else if ((type === 'counseling' || type === 'evaluation') && index !== undefined) {
            setCaseFollowUpHistory(prev => prev.filter((_, i) => i !== index));
            delete followUpSavedContentsRef.current[docId];
            if (type === 'counseling' && counselText === deletedContent) setCounselText('');
            if (type === 'evaluation' && evalText === deletedContent) setEvalText('');
        }
    };

    const handleSaveDoc = async (docObj: CaseDocument | null, content: string, seekerId: string, seekerName: string, type: 'meeting' | 'plan' | 'counseling' | 'evaluation') => {
        if (!content.trim()) {
            showToast('저장할 내용이 없습니다.', 'error', 2200);
            return false;
        }
        if (caseDocSaveInFlightRef.current) return false;

        caseDocSaveInFlightRef.current = true;
        setSavingCaseDocType(type);
        try {
            if (docObj?.id) {
                await updateCaseDocument(docObj.id, content);
                showToast('저장되었습니다.', 'success', 2500);
                if (type === 'meeting') setCaseMeetingDoc({ ...docObj, content });
                if (type === 'plan') setCasePlanDoc({ ...docObj, content });
                if (type === 'counseling' || type === 'evaluation') {
                    setCaseFollowUpHistory(prev => prev.map(p => p.id === docObj.id ? { ...p, content } : p));
                    followUpSavedContentsRef.current[docObj.id] = content;
                }
            } else {
                const newDoc = await addCaseDocument({ seekerId, seekerName, type, content, tab: 'case' });
                showToast('새 문서로 저장되었습니다.', 'success', 2500);
                if (type === 'meeting') setCaseMeetingDoc(newDoc);
                if (type === 'plan') setCasePlanDoc(newDoc);
                if (type === 'counseling' || type === 'evaluation') {
                    setCaseFollowUpHistory(prev => [...prev, newDoc]);
                    if (newDoc.id) followUpSavedContentsRef.current[newDoc.id] = content;
                }
            }
            return true;
        } catch (error: any) {
            showToast(error?.message || '문서를 저장하지 못했습니다. 작성 내용은 유지됩니다.', 'error', 4500);
            return false;
        } finally {
            caseDocSaveInFlightRef.current = false;
            setSavingCaseDocType(null);
        }
    };

    const filteredSeekers = seekers.filter(s =>
        s.name?.includes(seekerSearch) || s.disabilityType?.includes(seekerSearch)
    );
    const displayCaseSeekers = (showAllCaseSeekers || seekerSearch) ? filteredSeekers : filteredSeekers.slice(0, 3);

    return (
        <div className="min-h-screen py-8 px-4 flex flex-col items-center">
            <ToastContainer toasts={toasts} removeToast={removeToast} />

            {/* ─── 헤더 ─── */}
            <div className="w-full max-w-7xl mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 mb-4">
                    <FileText className="w-4 h-4 text-primary-400" />
                    <span className="text-xs text-primary-300 font-bold uppercase tracking-wider">Case Management Pipeline</span>
                </div>
                <h1 className="text-4xl font-black text-white mb-2">고용지원</h1>
                <p className="text-white/40 text-lg">사례관리 문서, 구인구직 매칭, 면접일지, 직무분석지, 작성 내용 점검을 한 곳에서 관리합니다.</p>

                {/* 탭 전환 */}
                <div className="flex gap-2 mt-8 border-b border-white/5 pb-0 overflow-x-auto">
                    {[
                        { key: 'pipeline' as TabKey, label: '사례관리 문서 연속작성', icon: FileText },
                        { key: 'matching' as TabKey, label: 'AI 정밀 매칭', icon: Sparkles },
                        { key: 'interview' as TabKey, label: '면접일지 작성', icon: CalendarDays },
                        { key: 'jobAnalysis' as TabKey, label: '직무분석지 작성', icon: Briefcase },
                        { key: 'review' as TabKey, label: '작성 내용 점검', icon: ShieldCheck },
                    ].map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-5 py-3 text-sm font-black transition-all border-b-2 -mb-px relative flex items-center gap-2 whitespace-nowrap ${
                                    activeTab === tab.key ? 'border-primary-500 text-white' : 'border-transparent text-white/65 hover:text-white'
                                }`}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ══════════════════════════════════════════
                콘텐츠 영역
            ══════════════════════════════════════════ */}
            <AnimatePresence mode="wait">
                {activeTab === 'pipeline' ? (
                    <motion.div
                        key="pipeline"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                    >
                        {/* 이용자 선택 패널 */}
                        <div className="lg:col-span-3 glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="font-bold text-white text-lg flex items-center gap-2">
                                    <UserCheck className="w-5 h-5 text-accent-400" />
                                    이용자 선택
                                </h3>
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white/5 text-white/50 border border-white/10 uppercase tracking-widest">DB: {seekers.length}명</span>
                            </div>

                            <div className="relative mb-6">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                <input className="input-field !pl-10 !py-3 text-sm border-white/5 focus:border-accent-500/50" placeholder="성함 또는 장애유형 검색"
                                    value={seekerSearch} onChange={e => setSeekerSearch(e.target.value)} />
                            </div>

                            <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-2 custom-scrollbar">
                                {dbLoading ? (
                                    <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-white/20" /></div>
                                ) : displayCaseSeekers.length === 0 ? (
                                    <div className="text-center py-12 text-white/65 text-sm">
                                        <p>{seekerSearch.trim() ? '검색 조건에 맞는 이용자가 없습니다.' : '등록된 이용자가 없습니다.'}</p>
                                        {seekerSearch.trim() && <button type="button" onClick={() => setSeekerSearch('')} className="btn-secondary mt-3 !px-3 !py-2">검색 초기화</button>}
                                    </div>
                                ) : (
                                    displayCaseSeekers.map(s => (
                                        <motion.div
                                            key={s.id}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`${s.name} 선택`}
                                            aria-pressed={caseSeeker?.id === s.id}
                                            onKeyDown={event => {
                                                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void handleSelectCaseSeeker(s); }
                                            }}
                                            whileHover={{ x: 4 }}
                                            onClick={() => handleSelectCaseSeeker(s)}
                                            className={`p-4 rounded-2xl border cursor-pointer transition-all ${caseSeeker?.id === s.id
                                                ? 'bg-accent-500/20 border-accent-500 shadow-xl shadow-accent-500/10'
                                                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                                                }`}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-white font-bold">{s.name}</span>
                                                {caseSeeker?.id === s.id && <div className="w-2.5 h-2.5 rounded-full bg-accent-400 animate-pulse" />}
                                            </div>
                                            <div className="flex flex-wrap gap-2 mb-3">
                                                <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase ${s.status === '구직중' ? 'bg-green-500/20 text-green-300' : 'bg-blue-500/20 text-blue-300'}`}>{s.status}</span>
                                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-white/50">{s.disabilityType}</span>
                                            </div>
                                            <div className="text-white/30 text-[11px] font-medium flex items-center gap-2">
                                                <MapPin className="w-3 h-3" /> {s.desiredLocation}
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                                {seekers.length > 3 && !showAllCaseSeekers && !seekerSearch && (
                                    <button
                                        onClick={() => setShowAllCaseSeekers(true)}
                                        className="w-full py-3 text-xs text-accent-400 hover:text-white font-bold transition-colors border-t border-white/5 mt-2"
                                    >
                                        전체 이용자 보기
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* 문서 작성 파이프라인 */}
                        <div className="lg:col-span-9 space-y-6">
                            {!caseSeeker ? (
                                <div className="glass-strong rounded-[2.5rem] h-[600px] flex flex-col items-center justify-center border border-white/5 text-center p-12">
                                    <div className="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-8 relative">
                                        <Users2 className="w-10 h-10 text-white/10" />
                                        <div className="absolute inset-0 rounded-full border border-white/5 animate-ping opacity-40" />
                                    </div>
                                    <h4 className="text-2xl font-bold text-white mb-4">시작하려면 이용자를 선택하세요</h4>
                                    <p className="text-white/30 max-w-sm mx-auto leading-relaxed">
                                        왼쪽 명단에서 이용자를 선택하면 사례회의부터 계획 수립, 상담 기록까지 이어지는 AI 통합 워크플로우가 시작됩니다.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {/* 선택된 이용자 요약 카드 */}
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="glass-strong rounded-3xl p-8 border border-accent-500/30 bg-accent-500/5 relative overflow-hidden"
                                    >
                                        <div className="flex items-center justify-between relative z-10">
                                            <div className="flex items-center gap-6">
                                                <div className="w-16 h-16 rounded-2xl bg-accent-500/20 flex items-center justify-center text-accent-400 font-black text-2xl shadow-inner">
                                                    {caseSeeker.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-3 mb-1">
                                                        <h2 className="text-3xl font-black text-white">{caseSeeker.name}</h2>
                                                        <span className="text-sm font-bold text-accent-400/80 bg-accent-400/10 px-3 py-1 rounded-full">{caseSeeker.disabilityType} ({caseSeeker.severity})</span>
                                                    </div>
                                                    <p className="text-white/40 font-medium">희망직무: {caseSeeker.desiredJob1} / 지역: {caseSeeker.desiredLocation} / 연령: {caseSeeker.age}세</p>
                                                </div>
                                            </div>
                                            <button onClick={resetCase} className="btn-ghost !bg-white/5 border border-white/10 !px-5 !py-2.5 rounded-xl font-bold text-xs hover:bg-white/10">이용자 변경</button>
                                        </div>
                                        <div className="absolute top-0 right-0 p-8 opacity-5">
                                            <UserCheck className="w-40 h-40" />
                                        </div>
                                    </motion.div>

                                    <ClientContextBox
                                        summary={caseContextSummary}
                                        loading={caseContextLoading}
                                        onLoad={() => loadClientContext('case')}
                                        onClear={() => setCaseContextSummary('')}
                                    />

                                    {/* 단계 바로가기 탭 */}
                                    <div className="flex gap-2 px-2 flex-wrap">
                                        {([
                                            { key: 'meeting' as CaseStep, label: '사례회의', num: 1 },
                                            { key: 'plan' as CaseStep, label: '재활계획', num: 2 },
                                            { key: 'followup' as CaseStep, label: '사후관리 (상담 및 평가)', num: 3 },
                                        ] as const).map(({ key, label, num }, idx) => {
                                            const isStepActive = caseStep === key || (key === 'followup' && caseStep === 'done');
                                            const hasDone = (key === 'meeting' && Boolean(caseMeetingDoc) && caseMeetingDoc?.content === meetingText) ||
                                                (key === 'plan' && Boolean(casePlanDoc) && casePlanDoc?.content === planText) ||
                                                (key === 'followup' && caseFollowUpHistory.length > 0);
                                            const hasDraft = (key === 'meeting' && meetingText.trim().length > 0 && !hasDone) ||
                                                (key === 'plan' && planText.trim().length > 0 && !hasDone) ||
                                                (key === 'followup' && Boolean(counselText.trim() || evalText.trim()));
                                            return (
                                                <div key={key} className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setCaseStep(key)}
                                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isStepActive
                                                                ? 'bg-accent-500/20 text-accent-300 border border-accent-500/30'
                                                                : hasDraft
                                                                    ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20'
                                                                : hasDone
                                                                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20'
                                                                    : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60'
                                                            }`}
                                                    >
                                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${isStepActive ? 'bg-accent-500 text-white' : hasDraft ? 'bg-amber-500 text-white' : hasDone ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/30'
                                                            }`}>
                                                            {hasDone && !isStepActive ? '✓' : num}
                                                        </div>
                                                        {label}
                                                        {hasDraft ? <span className="text-[9px] font-black">저장 전</span> : hasDone ? <span className="text-[9px] font-black">저장됨</span> : null}
                                                    </button>
                                                    {idx < 2 && <ArrowRightIcon />}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* ── STEP 1: 사례회의록 ── */}
                                    <CaseStage
                                        title="STEP 1. 사례회의록 작성"
                                        description="사례회의 내용을 바탕으로 공식 회의록을 자동 생성합니다."
                                        isActive={caseStep === 'meeting'}
                                        isDone={meetingText.length > 0}
                                        isSaved={Boolean(caseMeetingDoc) && caseMeetingDoc?.content === meetingText}
                                        input={meetingInput}
                                        setInput={setMeetingInput}
                                        result={meetingText}
                                        setResult={setMeetingText}
                                        onGenerate={() => generateCaseDoc('meeting')}
                                        onRefine={() => refineCaseDoc('meeting')}
                                        isGenerating={isGenerating && caseStep === 'meeting'}
                                        isSaving={savingCaseDocType === 'meeting'}
                                        onSave={() => handleSaveDoc(caseMeetingDoc, meetingText, caseSeeker.id || caseSeeker.seekerId || caseSeeker.name, caseSeeker.name, 'meeting')}
                                        onCopy={() => handleCopy(meetingText)}
                                        onReset={() => {
                                            if (!confirm('사례회의록 작성 내용을 화면에서 비울까요? 이미 저장된 문서는 삭제되지 않습니다.')) return;
                                            setMeetingText(''); setCaseStep('meeting');
                                        }}
                                        placeholder="당사자/보호자 욕구, 현재 상황, 논의 내용을 입력하세요."
                                        onActivate={() => setCaseStep('meeting')}
                                    />

                                    {/* ── STEP 2: 직업재활계획서 ── */}
                                    <CaseStage
                                        title="STEP 2. 직업재활계획 수립"
                                        description="사례회의 내용을 연동하여 구체적인 목표와 수행방법을 수립합니다."
                                        isActive={caseStep === 'plan'}
                                        isDone={planText.length > 0}
                                        isSaved={Boolean(casePlanDoc) && casePlanDoc?.content === planText}
                                        input={planInput}
                                        setInput={setPlanInput}
                                        result={planText}
                                        setResult={setPlanText}
                                        onGenerate={() => generateCaseDoc('plan')}
                                        onRefine={() => refineCaseDoc('plan')}
                                        isGenerating={isGenerating && caseStep === 'plan'}
                                        isSaving={savingCaseDocType === 'plan'}
                                        onSave={() => handleSaveDoc(casePlanDoc, planText, caseSeeker.id || caseSeeker.seekerId || caseSeeker.name, caseSeeker.name, 'plan')}
                                        onCopy={() => handleCopy(planText)}
                                        onReset={() => {
                                            if (!confirm('직업재활계획서 작성 내용을 화면에서 비울까요? 이미 저장된 문서는 삭제되지 않습니다.')) return;
                                            setPlanText(''); setCaseStep('plan');
                                        }}
                                        isLocked={false}
                                        placeholder="강점, 제한점, 장/단기 목표에 대한 아이디어를 입력하세요."
                                        onActivate={() => setCaseStep('plan')}
                                    />

                                    {planText.trim() && (
                                        <RehabPlanTemplatePreview
                                            seeker={caseSeeker}
                                            planText={planText}
                                            meetingText={meetingText}
                                        />
                                    )}

                                    {/* ── STEP 3: 타임라인형 사후관리 (상담/평가) ── */}
                                    <FollowUpStage
                                        isActive={caseStep === 'followup'}
                                        onActivate={() => setCaseStep('followup')}
                                        history={caseFollowUpHistory}
                                        setHistory={setCaseFollowUpHistory}
                                        onDeleteHistory={handleDeleteCaseDoc}
                                        onSaveHistory={(document, content, type) => handleSaveDoc(
                                            document,
                                            content,
                                            caseSeeker.id || caseSeeker.seekerId || caseSeeker.name,
                                            caseSeeker.name,
                                            type,
                                        )}
                                        onCopyHistory={handleCopy}
                                        seeker={caseSeeker}

                                        counselInput={counselInput}
                                        setCounselInput={setCounselInput}
                                        counselText={counselText}
                                        setCounselText={setCounselText}
                                        onGenerateCounsel={() => generateCaseDoc('counseling')}
                                        onRefineCounsel={() => refineCaseDoc('counseling')}
                                        isGeneratingCounsel={isGenerating && caseStep === 'followup'} // generating state logic
                                        onSaveCounsel={() => handleSaveDoc(null, counselText, caseSeeker.id || caseSeeker.seekerId || caseSeeker.name, caseSeeker.name, 'counseling')}
                                        
                                        evalInput={evalInput}
                                        setEvalInput={setEvalInput}
                                        evalText={evalText}
                                        setEvalText={setEvalText}
                                        onGenerateEval={() => generateCaseDoc('evaluation')}
                                        onRefineEval={() => refineCaseDoc('evaluation')}
                                        isGeneratingEval={isGenerating && caseStep === 'followup'}
                                        onSaveEval={() => handleSaveDoc(null, evalText, caseSeeker.id || caseSeeker.seekerId || caseSeeker.name, caseSeeker.name, 'evaluation')}
                                        savingDocumentType={savingCaseDocType}

                                        planText={planText}
                                    />
                                </div>
                            )}
                        </div>
                    </motion.div>
                ) : activeTab === 'matching' ? (
                    <motion.div
                        key="matching"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="w-full max-w-7xl"
                    >
                        <MatchingView onBack={() => setActiveTab('pipeline')} />
                    </motion.div>
                ) : activeTab === 'interview' ? (
                    <EmploymentDocumentTab
                        key="interview"
                        title="면접일지 작성"
                        description="면접 과정, 당사자 반응, 사업체 의견, 후속 지원계획을 고용지원 면접일지 형식으로 정리합니다."
                        icon={<CalendarDays className="w-5 h-5 text-blue-300" />}
                        seekers={seekers}
                        selectedSeekerId={employmentSeekerId}
                        onSelectSeeker={handleSelectEmploymentSeeker}
                        fields={[
                            { label: '면접일', value: interviewForm.date, onChange: v => setInterviewForm(prev => ({ ...prev, date: v })), placeholder: '2026년 5월 8일' },
                            { label: '사업체명', value: interviewForm.companyName, onChange: v => setInterviewForm(prev => ({ ...prev, companyName: v })), placeholder: '사업체명' },
                            { label: '직무', value: interviewForm.jobRole, onChange: v => setInterviewForm(prev => ({ ...prev, jobRole: v })), placeholder: '예: 사무보조, 바리스타' },
                            { label: '면접 참여자', value: interviewForm.participants, onChange: v => setInterviewForm(prev => ({ ...prev, participants: v })), placeholder: '이용자, 업체 담당자, 복지관 담당자' },
                        ]}
                        textareas={[
                            { label: '면접 내용', value: interviewForm.memo, onChange: v => setInterviewForm(prev => ({ ...prev, memo: v })), placeholder: '질문/답변, 확인한 직무 내용, 면접 분위기 등을 적어주세요.' },
                            { label: '당사자 반응', value: interviewForm.seekerResponse, onChange: v => setInterviewForm(prev => ({ ...prev, seekerResponse: v })), placeholder: '관심, 부담, 이해도, 희망 여부 등을 적어주세요.' },
                            { label: '사업체 의견', value: interviewForm.companyOpinion, onChange: v => setInterviewForm(prev => ({ ...prev, companyOpinion: v })), placeholder: '사업체가 언급한 강점, 우려, 채용 가능성 등을 적어주세요.' },
                            { label: '후속 지원계획', value: interviewForm.supportPlan, onChange: v => setInterviewForm(prev => ({ ...prev, supportPlan: v })), placeholder: '추가 면접, 현장훈련, 직무조정, 보호자/기관 공유 계획 등을 적어주세요.' },
                        ]}
                        result={interviewText}
                        setResult={setInterviewText}
                        resultPlaceholder="AI가 작성한 면접일지가 여기에 표시됩니다."
                        isGenerating={employmentGenerating === 'interview'}
                        isRefining={employmentGenerating === 'interviewRefine'}
                        onGenerate={() => generateEmploymentDoc('interview')}
                        onRefine={() => refineEmploymentDoc('interview')}
                        onSave={() => saveEmploymentDoc('interview')}
                        onCopy={() => handleCopy(interviewText)}
                        onReset={() => setInterviewText('')}
                        contextSummary={employmentContextSummary}
                        contextLoading={employmentContextLoading}
                        onLoadContext={() => loadClientContext('employment')}
                        onClearContext={() => setEmploymentContextSummary('')}
                    />
                ) : activeTab === 'jobAnalysis' ? (
                    <JobAnalysisDocumentTab
                        key="job-analysis"
                        jobs={jobs}
                        selectedJobId={jobAnalysisJobId}
                        selectedJob={selectedJobAnalysisJob}
                        search={jobAnalysisJobSearch}
                        onSearch={setJobAnalysisJobSearch}
                        onSelectJob={handleSelectJobAnalysisJob}
                        form={jobAnalysisForm}
                        setForm={setJobAnalysisForm}
                        photos={jobAnalysisPhotos}
                        addPhotos={addJobAnalysisPhotos}
                        removePhoto={removeJobAnalysisPhoto}
                        result={jobAnalysisText}
                        setResult={setJobAnalysisText}
                        isGenerating={employmentGenerating === 'jobAnalysis'}
                        isRefining={employmentGenerating === 'jobAnalysisRefine'}
                        onGenerate={() => generateEmploymentDoc('jobAnalysis')}
                        onRefine={() => refineEmploymentDoc('jobAnalysis')}
                        onSave={() => saveEmploymentDoc('jobAnalysis')}
                        onCopy={() => handleCopy(jobAnalysisText)}
                        onReset={() => setJobAnalysisText('')}
                        contextSummary={employmentContextSummary}
                        contextLoading={employmentContextLoading}
                        onLoadContext={() => loadClientContext('employment')}
                        onClearContext={() => setEmploymentContextSummary('')}
                    />
                ) : (
                    <motion.div
                        key="review"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="w-full max-w-7xl"
                    >
                        <DocumentReviewTab />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ──────────────────────────────────────────────
// 내부 서브 컴포넌트
// ──────────────────────────────────────────────

function ClientContextBox({
    summary,
    loading,
    onLoad,
    onClear,
}: {
    summary: string;
    loading: boolean;
    onLoad: () => void;
    onClear: () => void;
}) {
    return (
        <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 mb-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <p className="text-sm font-black text-sky-100">통합 참고자료</p>
                    <p className="text-xs text-white/45 mt-1">버튼을 눌렀을 때만 같은 이용자의 최근 직업훈련 및 고용지원 기록을 프롬프트 참고자료로 포함합니다. 원본 문서는 수정하지 않습니다.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onLoad} disabled={loading} className="btn-secondary !py-2 flex items-center gap-2 text-sm">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                        최근 기록 참고
                    </button>
                    {summary && (
                        <button onClick={onClear} className="btn-ghost !bg-white/5 border border-white/10 !py-2 text-sm">
                            참고자료 제외
                        </button>
                    )}
                </div>
            </div>
            {summary && (
                <pre className="mt-4 max-h-56 overflow-y-auto rounded-2xl bg-black/25 border border-white/10 p-4 text-xs leading-relaxed text-white/70 whitespace-pre-wrap font-sans">
                    {summary}
                </pre>
            )}
        </div>
    );
}

function JobAnalysisDocumentTab({
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
    isGenerating,
    isRefining,
    onGenerate,
    onRefine,
    onSave,
    onCopy,
    onReset,
    contextSummary,
    contextLoading,
    onLoadContext,
    onClearContext,
}: {
    jobs: JobOpening[];
    selectedJobId: string;
    selectedJob: JobOpening | null;
    search: string;
    onSearch: (value: string) => void;
    onSelectJob: (id: string) => void;
    form: {
        companyName: string;
        jobRole: string;
        traits: string;
        interviewNotes: string;
        tasks: string;
        environment: string;
        abilities: string;
        risks: string;
        supports: string;
        suitableSeeker: string;
    };
    setForm: React.Dispatch<React.SetStateAction<{
        companyName: string;
        jobRole: string;
        traits: string;
        interviewNotes: string;
        tasks: string;
        environment: string;
        abilities: string;
        risks: string;
        supports: string;
        suitableSeeker: string;
    }>>;
    photos: JobAnalysisPhoto[];
    addPhotos: (files: FileList | null) => void;
    removePhoto: (photoId: string) => void;
    result: string;
    setResult: (value: string) => void;
    isGenerating: boolean;
    isRefining: boolean;
    onGenerate: () => void;
    onRefine: () => void;
    onSave: () => void;
    onCopy: () => void;
    onReset: () => void;
    contextSummary?: string;
    contextLoading?: boolean;
    onLoadContext?: () => void;
    onClearContext?: () => void;
}) {
    const hasResult = !!result.trim();
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

                {onLoadContext && (
                    <ClientContextBox
                        summary={contextSummary || ''}
                        loading={!!contextLoading}
                        onLoad={onLoadContext}
                        onClear={onClearContext || (() => {})}
                    />
                )}

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
                        />
                    </div>
                    <select value={selectedJobId} onChange={e => onSelectJob(e.target.value)} className="input-field">
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
                            <p className="text-xs text-white/40 mt-1">작업환경 분석에만 사용하고 사진 파일 자체는 DB에 저장하지 않습니다.</p>
                        </div>
                    </label>
                    {photos.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                            {photos.map(photo => (
                                <div key={photo.id} className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/25">
                                    <img src={photo.previewUrl} alt={photo.file.name} className="w-full h-28 object-cover" />
                                    <button type="button" onClick={() => removePhoto(photo.id)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/70 text-white hover:bg-red-500" title="사진 제거">
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

                <button onClick={onGenerate} disabled={isGenerating} className="btn-primary w-full mt-5 flex items-center justify-center gap-2">
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    직무분석지 생성
                </button>
            </div>

            <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl flex flex-col min-h-[720px]">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                    <div>
                        <h3 className="font-black text-white">작성 결과</h3>
                        <p className="text-xs text-white/35 mt-1">저장은 `caseDocuments`의 `job_analysis` 타입을 사용하며, 사진 파일 자체는 저장하지 않습니다.</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl bg-slate-900/70 border border-white/10 p-1.5">
                        <button onClick={onRefine} disabled={!hasResult || isRefining} className="p-2 rounded-xl text-amber-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" title="현재 내용 기반 보완">
                            {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        </button>
                        <button onClick={onSave} disabled={!hasResult} className="p-2 rounded-xl text-emerald-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" title="저장"><Save className="w-4 h-4" /></button>
                        <button onClick={onCopy} disabled={!hasResult} className="p-2 rounded-xl text-blue-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" title="복사"><Copy className="w-4 h-4" /></button>
                        <button onClick={onReset} disabled={!hasResult} className="p-2 rounded-xl text-rose-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" title="초기화"><RotateCcw className="w-4 h-4" /></button>
                    </div>
                </div>
                <textarea
                    value={result}
                    onChange={e => setResult(e.target.value)}
                    placeholder="AI가 작성한 직무분석지가 여기에 표시됩니다."
                    className="textarea-field !bg-black/30 border-white/10 flex-1 min-h-[580px] text-sm leading-relaxed resize-none"
                />
            </div>
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

function EmploymentDocumentTab({
    title,
    description,
    icon,
    seekers,
    selectedSeekerId,
    onSelectSeeker,
    fields,
    textareas,
    result,
    setResult,
    resultPlaceholder,
    isGenerating,
    isRefining,
    onGenerate,
    onRefine,
    onSave,
    onCopy,
    onReset,
    contextSummary,
    contextLoading,
    onLoadContext,
    onClearContext,
    extraContent,
}: {
    title: string;
    description: string;
    icon: React.ReactNode;
    seekers: Seeker[];
    selectedSeekerId: string;
    onSelectSeeker: (id: string) => void;
    fields: Array<{ label: string; value: string; onChange: (value: string) => void; placeholder: string }>;
    textareas: Array<{ label: string; value: string; onChange: (value: string) => void; placeholder: string }>;
    result: string;
    setResult: (value: string) => void;
    resultPlaceholder: string;
    isGenerating: boolean;
    isRefining: boolean;
    onGenerate: () => void;
    onRefine: () => void;
    onSave: () => void;
    onCopy: () => void;
    onReset: () => void;
    contextSummary?: string;
    contextLoading?: boolean;
    onLoadContext?: () => void;
    onClearContext?: () => void;
    extraContent?: React.ReactNode;
}) {
    const hasResult = !!result.trim();

    return (
        <motion.div
            key={title}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="w-full max-w-7xl grid grid-cols-1 xl:grid-cols-2 gap-6"
        >
            <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl">
                <div className="flex items-start gap-3 mb-6">
                    <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        {icon}
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white">{title}</h2>
                        <p className="text-white/40 text-sm mt-1">{description}</p>
                    </div>
                </div>

                <label className="block mb-5">
                    <span className="block text-sm font-medium text-white/70 mb-1.5">이용자 선택</span>
                    <select value={selectedSeekerId} onChange={e => onSelectSeeker(e.target.value)} className="input-field">
                        <option value="">이용자를 선택해 주세요</option>
                        {seekers.map(seeker => (
                            <option key={seeker.id || seeker.seekerId || seeker.name} value={seeker.id || seeker.seekerId || seeker.name}>
                                {seeker.name} {seeker.disabilityType ? ` / ${seeker.disabilityType}` : ''}
                            </option>
                        ))}
                    </select>
                </label>

                {onLoadContext && (
                    <ClientContextBox
                        summary={contextSummary || ''}
                        loading={!!contextLoading}
                        onLoad={onLoadContext}
                        onClear={onClearContext || (() => {})}
                    />
                )}

                {extraContent && <div className="mb-5">{extraContent}</div>}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fields.map(field => (
                        <label key={field.label} className="block">
                            <span className="block text-sm font-medium text-white/70 mb-1.5">{field.label}</span>
                            <input value={field.value} onChange={e => field.onChange(e.target.value)} placeholder={field.placeholder} className="input-field" />
                        </label>
                    ))}
                </div>

                <div className="space-y-4 mt-4">
                    {textareas.map(field => (
                        <label key={field.label} className="block">
                            <span className="block text-sm font-medium text-white/70 mb-1.5">{field.label}</span>
                            <textarea value={field.value} onChange={e => field.onChange(e.target.value)} placeholder={field.placeholder} className="textarea-field !min-h-[110px] text-sm leading-relaxed" />
                        </label>
                    ))}
                </div>

                <button onClick={onGenerate} disabled={isGenerating} className="btn-primary w-full mt-5 flex items-center justify-center gap-2">
                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                    새 초안 생성
                </button>
            </div>

            <div className="glass-strong rounded-[2rem] p-6 border border-white/10 shadow-2xl flex flex-col min-h-[720px]">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                    <div>
                        <h3 className="font-black text-white">작성 결과</h3>
                        <p className="text-xs text-white/35 mt-1">생성 후 직접 수정할 수 있고, 저장은 기존 caseDocuments 흐름을 사용합니다.</p>
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl bg-slate-900/70 border border-white/10 p-1.5">
                        <button onClick={onRefine} disabled={!hasResult || isRefining} className="p-2 rounded-xl text-amber-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" title="현재 내용 기반 보완">
                            {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        </button>
                        <button onClick={onSave} disabled={!hasResult} className="p-2 rounded-xl text-emerald-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" title="저장"><Save className="w-4 h-4" /></button>
                        <button onClick={onCopy} disabled={!hasResult} className="p-2 rounded-xl text-blue-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" title="복사"><Copy className="w-4 h-4" /></button>
                        <button onClick={onReset} disabled={!hasResult} className="p-2 rounded-xl text-rose-300 hover:bg-white/10 disabled:opacity-35 disabled:cursor-not-allowed" title="초기화"><RotateCcw className="w-4 h-4" /></button>
                    </div>
                </div>
                <textarea
                    value={result}
                    onChange={e => setResult(e.target.value)}
                    placeholder={resultPlaceholder}
                    className="textarea-field !bg-black/30 border-white/10 flex-1 min-h-[580px] text-sm leading-relaxed resize-none"
                />
            </div>
        </motion.div>
    );
}

function ArrowRightIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-white/10">
            <polyline points="9 18 15 12 9 6" />
        </svg>
    );
}

interface CaseStageProps {
    title: string;
    description: string;
    isActive: boolean;
    isDone: boolean;
    isSaved: boolean;
    input: string;
    setInput: (v: string) => void;
    result: string;
    setResult: (v: string) => void;
    onGenerate: () => void;
    onRefine?: () => void;
    isGenerating: boolean;
    isSaving: boolean;
    onSave: () => void;
    onCopy: () => void;
    onReset: () => void;
    isLocked?: boolean;
    placeholder: string;
    onActivate: () => void;
}

function CaseStage({
    title, description, isActive, isDone, isSaved, input, setInput, result, setResult,
    onGenerate, onRefine, isGenerating, isSaving, onSave, onCopy, onReset, isLocked, placeholder, onActivate,
}: CaseStageProps) {
    if (isLocked) return (
        <div className="glass-strong rounded-3xl p-8 border border-white/5 opacity-30 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-xs font-bold">?</div>
                <div>
                    <h4 className="font-bold text-white/50">{title}</h4>
                    <p className="text-[11px] text-white/20">이전 단계를 먼저 완료해야 활성화됩니다.</p>
                </div>
            </div>
            <Search className="w-5 h-5 text-white/10" />
        </div>
    );

    return (
        <motion.div
            layout
            onClick={() => !isActive && onActivate()}
            className={`glass-strong rounded-[2rem] border transition-all overflow-hidden ${isSaved ? 'border-emerald-500/30 bg-emerald-500/5' : isActive ? 'border-accent-500/50 ring-1 ring-accent-500/20' : isDone ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/5'
                }`}
        >
            <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg ${isSaved ? 'bg-emerald-500 text-white' : isDone ? 'bg-amber-500 text-white' : 'bg-accent-500 text-white'
                            }`}>
                            {isSaved ? '✓' : title.charAt(5)}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="text-xl font-bold text-white">{title}</h4>
                                {isDone && (
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${isSaved ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                                        {isSaved ? '저장됨' : '저장 전 초안'}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-white/40 font-medium">{description}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {isDone && (
                            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                                {onRefine && (
                                    <button onClick={onRefine} disabled={isGenerating || isSaving} className="p-2 text-amber-300 hover:bg-amber-400/10 rounded-lg transition-colors disabled:opacity-40" title="현재 내용 기반 보완">
                                        {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    </button>
                                )}
                                <button onClick={onSave} disabled={isSaving} className="p-2 text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title={isSaving ? '저장 중' : '저장'}>
                                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                </button>
                                <button onClick={onCopy} className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="복사"><Copy className="w-4 h-4" /></button>
                                <button onClick={onReset} disabled={isSaving || isGenerating} className="p-2 text-red-400/60 hover:text-red-400 rounded-lg transition-colors disabled:opacity-40" title="초기화"><RotateCcw className="w-4 h-4" /></button>
                            </div>
                        )}
                        {isActive && !isDone && (
                            <button
                                onClick={onGenerate}
                                disabled={isGenerating}
                                className="btn-primary !px-6 !py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-xl shadow-accent-500/20"
                            >
                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                새 초안 생성
                            </button>
                        )}
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {isActive && !isDone ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="space-y-4"
                        >
                            <textarea
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                className="textarea-field !bg-black/40 border-white/5 !min-h-[160px] text-sm leading-relaxed"
                                placeholder={placeholder}
                            />
                            <p className="text-[11px] text-white/20 font-medium flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> 입력한 키워드를 바탕으로 전문적인 문서가 자동 구성됩니다.</p>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="space-y-4"
                        >
                            {result && (
                                <textarea
                                    value={result}
                                    onChange={e => setResult(e.target.value)}
                                    className={`textarea-field !min-h-[200px] !max-h-[400px] text-sm leading-relaxed font-sans ${isDone ? '!bg-transparent border-emerald-500/10' : '!bg-black/20'}`}
                                />
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

// ──────────────────────────────────────────────
// 통합 사후관리(상담/평가 타임라인) 컴포넌트
// ──────────────────────────────────────────────
interface FollowUpStageProps {
    isActive: boolean;
    onActivate: () => void;
    history: CaseDocument[];
    setHistory: React.Dispatch<React.SetStateAction<CaseDocument[]>>;
    onDeleteHistory: (id: string, idx: number, type: 'counseling'|'evaluation') => void;
    onSaveHistory: (h: CaseDocument, content: string, type: 'counseling'|'evaluation') => void;
    onCopyHistory: (text: string) => void;
    seeker: Seeker;

    counselInput: string;
    setCounselInput: (v: string) => void;
    counselText: string;
    setCounselText: (v: string) => void;
    onGenerateCounsel: () => void;
    onRefineCounsel?: () => void;
    isGeneratingCounsel: boolean;
    onSaveCounsel: () => Promise<boolean>;

    evalInput: string;
    setEvalInput: (v: string) => void;
    evalText: string;
    setEvalText: (v: string) => void;
    onGenerateEval: () => void;
    onRefineEval?: () => void;
    isGeneratingEval: boolean;
    onSaveEval: () => Promise<boolean>;
    savingDocumentType: CaseDocumentAction | null;

    planText: string;
}

function FollowUpStage({
    isActive, onActivate, history, setHistory, onDeleteHistory, onSaveHistory, onCopyHistory, seeker,
    counselInput, setCounselInput, counselText, setCounselText, onGenerateCounsel, isGeneratingCounsel, onSaveCounsel,
    onRefineCounsel,
    evalInput, setEvalInput, evalText, setEvalText, onGenerateEval, isGeneratingEval, onSaveEval,
    onRefineEval,
    planText, savingDocumentType
}: FollowUpStageProps) {
    const hasHistory = history.length > 0;
    const [writeMode, setWriteMode] = useState<'counseling'|'evaluation'>('counseling');
    const savingRef = useRef(false);
    const isSaving = savingDocumentType !== null;
    const saveDraft = async () => {
        if (savingRef.current || isSaving) return;
        savingRef.current = true;
        try {
            const counseling = Boolean(counselText);
            const saved = await (counseling ? onSaveCounsel() : onSaveEval());
            if (saved) {
                if (counseling) { setCounselText(''); setCounselInput(''); }
                else { setEvalText(''); setEvalInput(''); }
            }
        } finally { savingRef.current = false; }
    };

    return (
        <motion.div
            layout
            onClick={() => !isActive && onActivate()}
            className={`glass-strong rounded-[2rem] border transition-all overflow-hidden ${isActive
                    ? 'border-accent-500/50 ring-1 ring-accent-500/20 shadow-2xl shadow-accent-500/5'
                    : hasHistory
                        ? 'border-emerald-500/30 bg-emerald-500/5 cursor-pointer opacity-80 hover:opacity-100'
                        : 'border-white/5 opacity-60 hover:opacity-100 cursor-pointer'
                }`}
        >
            <div className="p-8">
                {/* 헤더 */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg ${isActive ? 'bg-accent-500 text-white' : hasHistory ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/30'
                            }`}>
                            {hasHistory ? '✓' : '3'}
                        </div>
                        <div>
                            <h4 className="text-xl font-bold text-white">STEP 3. 사후관리 (타임라인)</h4>
                            <p className="text-xs text-white/40 font-medium">
                                상담일지와 정기평가를 연속적으로 작성하고 전체 과정의 흐름을 파악합니다.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ─── 타임라인 히스토리 영역 ─── */}
                {hasHistory && (
                    <div className="space-y-4 mb-8">
                        <h5 className="text-[11px] font-black text-white/30 uppercase tracking-widest flex items-center gap-2 mb-4">
                            <Clock className="w-3 h-3" /> 진행 경과 요약 ({history.length}건)
                        </h5>
                        <div className="space-y-6 max-h-[720px] overflow-y-auto pr-3 custom-scrollbar border-l-2 border-white/5 pl-4 ml-2 relative">
                            {history.map((h, i) => {
                                const isCounsel = h.type === 'counseling';
                                return (
                                    <div key={h.id || i} className="relative">
                                        {/* 타임라인 점 */}
                                        <div className={`absolute -left-[23px] top-4 w-3 h-3 rounded-full border-4 border-[#12121a] ${isCounsel ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                        
                                        <div className={`p-5 sm:p-6 rounded-2xl border ${isCounsel ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
                                            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-4">
                                                <span className={`text-sm font-bold flex items-center gap-2 ${isCounsel ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {isCounsel ? <FileText className="w-3.5 h-3.5" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
                                                    {isCounsel ? '상담일지' : '정기평가'}
                                                    {h.createdAt && <span className="text-white/35 font-normal ml-1 text-xs">{new Date(typeof h.createdAt === 'object' && 'seconds' in h.createdAt ? h.createdAt.seconds * 1000 : h.createdAt).toLocaleDateString('ko-KR')}</span>}
                                                </span>
                                                <div className="flex gap-1.5">
                                                    <button disabled={isSaving} onClick={() => onSaveHistory(h, h.content, h.type as any)} className="p-2 rounded-lg text-emerald-300/70 hover:text-emerald-200 hover:bg-emerald-400/10 focus:outline-none focus:ring-2 focus:ring-emerald-300/40 transition-colors disabled:opacity-40" title="저장"><Save className="w-4 h-4" /></button>
                                                    <button onClick={() => onCopyHistory(h.content)} className="p-2 rounded-lg text-blue-300/70 hover:text-blue-200 hover:bg-blue-400/10 focus:outline-none focus:ring-2 focus:ring-blue-300/40 transition-colors" title="복사"><Copy className="w-4 h-4" /></button>
                                                    {h.id && <button onClick={() => onDeleteHistory(h.id!, i, h.type as any)} className="p-2 rounded-lg text-red-300/70 hover:text-red-200 hover:bg-red-400/10 focus:outline-none focus:ring-2 focus:ring-red-300/40 transition-colors" title="삭제"><Trash2 className="w-4 h-4" /></button>}
                                                </div>
                                            </div>
                                            <textarea
                                                value={h.content}
                                                readOnly={isSaving}
                                                onChange={e => {
                                                    const newContent = e.target.value;
                                                    setHistory(prev => prev.map(p => (p.id === h.id || (!p.id && p === h)) ? { ...p, content: newContent } : p));
                                                }}
                                                className="textarea-field !bg-black/20 !border-white/10 !p-5 rounded-2xl !min-h-[260px] sm:!min-h-[300px] !max-h-[520px] text-sm sm:text-[15px] leading-7 text-white/85 focus:ring-1 focus:ring-accent-500/50 resize-y custom-scrollbar"
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ─── 결과/작성 상태 표시 (방금 생성한 내용) ─── */}
                {(counselText || evalText) && (
                    <div className="mb-6 p-5 rounded-2xl bg-accent-500/10 border border-accent-500/30 shadow-lg shadow-accent-500/5">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-bold text-accent-300 flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5" /> {counselText ? '새 상담일지 생성결과' : '새 정기평가 생성결과'}
                            </span>
                            <div className="flex gap-1">
                                {counselText && onRefineCounsel && (
                                    <button onClick={onRefineCounsel} disabled={isGeneratingCounsel || isSaving} className="px-3 py-1 bg-white/10 text-white font-bold text-xs rounded-lg hover:bg-white/20 transition-colors flex items-center gap-1 disabled:opacity-50" title="현재 상담일지 내용을 기준으로 보완합니다.">
                                        {isGeneratingCounsel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} 현재 내용 기반 보완
                                    </button>
                                )}
                                {evalText && onRefineEval && (
                                    <button onClick={onRefineEval} disabled={isGeneratingEval || isSaving} className="px-3 py-1 bg-white/10 text-white font-bold text-xs rounded-lg hover:bg-white/20 transition-colors flex items-center gap-1 disabled:opacity-50" title="현재 정기평가 내용을 기준으로 보완합니다.">
                                        {isGeneratingEval ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} 현재 내용 기반 보완
                                    </button>
                                )}
                                <button onClick={() => void saveDraft()} disabled={isSaving || isGeneratingCounsel || isGeneratingEval} className="px-3 py-1 bg-accent-500 text-white font-bold text-xs rounded-lg hover:bg-accent-600 transition-colors shadow-md disabled:opacity-50">{isSaving ? '저장 중…' : '작성 완료(저장)'}</button>
                                <button disabled={isSaving} onClick={() => {
                                    if (window.confirm('저장하지 않은 초안을 닫으시겠습니까?')) counselText ? setCounselText('') : setEvalText('');
                                }} className="p-1.5 text-white/60 hover:text-red-400 transition-colors disabled:opacity-50" aria-label="초안 닫기" title="닫기"><X className="w-3.5 h-3.5" /></button>
                            </div>
                        </div>
                        <textarea
                            value={counselText || evalText}
                            readOnly={isSaving}
                            onChange={e => counselText ? setCounselText(e.target.value) : setEvalText(e.target.value)}
                            className="textarea-field !bg-black/30 border-accent-500/20 !min-h-[160px] !max-h-[400px] text-sm leading-relaxed font-sans resize-y"
                        />
                    </div>
                )}

                {/* ─── 단일화된 입력 영역 (활성 시에만 혹은 버튼 클릭 후 표시) ─── */}
                {isActive ? (!counselText && !evalText) && (
                    <div className="rounded-2xl border bg-black/20 border-white/10 overflow-hidden mt-6">
                        <div className="flex border-b border-white/5">
                            <button
                                onClick={() => setWriteMode('counseling')}
                                className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${writeMode === 'counseling' ? 'bg-emerald-500/10 text-emerald-400 border-b-2 border-emerald-500' : 'text-white/40 hover:bg-white/5'}`}
                            >
                                <FileText className="w-4 h-4" /> 상담일지 추가
                            </button>
                            <button
                                onClick={() => setWriteMode('evaluation')}
                                className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 transition-colors ${writeMode === 'evaluation' ? 'bg-amber-500/10 text-amber-400 border-b-2 border-amber-500' : 'text-white/40 hover:bg-white/5'}`}
                            >
                                <ClipboardCheck className="w-4 h-4" /> 정기평가 추가
                            </button>
                        </div>
                        
                        <div className="p-5">
                            {writeMode === 'evaluation' && !planText && (
                                <div className="mb-4 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-300 text-xs flex items-start gap-2">
                                    <ClipboardCheck className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>직업재활계획서가 아직 완성되지 않았습니다.<br/>정기평가는 계획서 연동이 중요하므로, STEP 2를 먼저 채워주시는 것을 권장합니다.</span>
                                </div>
                            )}

                            <textarea
                                value={writeMode === 'counseling' ? counselInput : evalInput}
                                onChange={e => writeMode === 'counseling' ? setCounselInput(e.target.value) : setEvalInput(e.target.value)}
                                className="textarea-field !bg-black/40 border-white/5 !min-h-[120px] text-sm leading-relaxed mb-4"
                                placeholder={writeMode === 'counseling' 
                                    ? "상담 일시, 장소, 주요 대화 내용 및 진전 피드백을 입력하세요. (이전 타임라인 흐름이 기록됩니다)" 
                                    : "평가 관점, 단기목표 달성에 대한 소견, 앞으로 변경이 필요한 계획 등을 자유롭게 입력하세요."}
                            />
                            
                            <div className="flex items-center justify-between">
                                <p className="text-[11px] text-white/20 font-medium flex items-center flex-1 pr-4 gap-1.5 leading-snug">
                                    <Sparkles className="w-3 h-3 shrink-0" /> 
                                    {writeMode === 'counseling' ? '이전 상담/평가 기록을 참조하여 자연스럽게 연속되는 문서로 정리됩니다.' : '기존 계획서와 상담 내역을 자동 분석하여 전문 평가 소견서를 도출합니다.'}
                                </p>
                                <button
                                    onClick={() => writeMode === 'counseling' ? onGenerateCounsel() : onGenerateEval()}
                                    disabled={writeMode === 'counseling' ? isGeneratingCounsel : isGeneratingEval}
                                    className={`btn-primary !px-5 !py-2.5 rounded-xl flex items-center gap-2 font-bold text-sm shadow-xl shrink-0 ${writeMode === 'counseling' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20' : 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20'}`}
                                >
                                    {(writeMode === 'counseling' ? isGeneratingCounsel : isGeneratingEval) 
                                        ? <Loader2 className="w-4 h-4 animate-spin" /> 
                                        : <Sparkles className="w-4 h-4" />}
                                    새 초안 생성
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={(e) => { e.stopPropagation(); onActivate(); }}
                        className="w-full mt-4 py-4 border border-dashed border-white/10 rounded-2xl text-white/30 text-xs font-bold hover:bg-white/5 hover:text-white/60 transition-all flex items-center justify-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> 새로운 사후관리 기록 (상담 / 평가) 추가하기
                    </button>
                )}
            </div>
        </motion.div>
    );
}
