import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { Briefcase, CalendarDays, FileText, HandCoins, HeartHandshake, ShieldCheck, Sparkles, UserCheck, Users2 } from 'lucide-react';
import { useDataStore } from '../store/dataStore';
import type { Seeker } from '../types/matching';
import { useToast } from '../components/Toast';
import { ClientContextBox } from '../components/ClientContextBox';
import { MatchingView } from '../components/MatchingView';
import { DocumentReviewTab } from '../components/DocumentReviewTab';
import { RehabPlanTemplatePreview } from '../components/RehabPlanTemplatePreview';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';
import { getSeekerKey, isSameSeeker } from '../utils/seeker';
import { useCaseDocumentPipeline } from './workmate/useCaseDocumentPipeline';
import { useEmploymentDocuments } from './workmate/useEmploymentDocuments';
import { CaseSeekerPicker } from './workmate/CaseSeekerPicker';
import { CaseStage, CaseStepNav } from './workmate/CaseStage';
import { FollowUpStage } from './workmate/FollowUpStage';
import { EmploymentDocumentTab } from './workmate/EmploymentDocumentTab';
import { JobAnalysisDocumentTab } from './workmate/JobAnalysisDocumentTab';
import { WorkflowPanel } from './workmate/WorkflowPanel';
import { WorkflowSeekerSection } from './workmate/WorkflowSeekerSection';
import { EmploymentCheckSection } from './workmate/EmploymentCheckSection';
import { JobComparisonSection } from './workmate/JobComparisonSection';
import { SupportedEmploymentTab, type SupportedEmploymentRequest } from './workmate/supportedEmployment/SupportedEmploymentTab';
import { isTabKey, type CaseStep, type FollowUpMode, type TabKey, type WorkMateNavigationState } from './workmate/types';

// 탭 목록(표시 순서). 새 탭은 types.ts의 TAB_KEYS, 이 목록, 아래 renderTab()의 case에 한 줄씩 추가합니다.
const TABS: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
    { key: 'pipeline', label: '사례관리 문서 연속작성', icon: FileText },
    { key: 'matching', label: 'AI 정밀 매칭', icon: Sparkles },
    { key: 'interview', label: '면접일지 작성', icon: CalendarDays },
    { key: 'jobAnalysis', label: '직무분석지 작성', icon: Briefcase },
    { key: 'adaptation', label: '적응지원', icon: HeartHandshake },
    { key: 'supportedEmployment', label: '지원고용 관리', icon: HandCoins },
    { key: 'review', label: '작성 내용 점검', icon: ShieldCheck },
];

/** 현황 기록 폼(후속 일정·목표·당사자 확인·적응지원·직무 비교)이 있는 탭. 탭을 떠나면 폼이 사라지므로 확인합니다. */
const WORKFLOW_FORM_TABS: TabKey[] = ['pipeline', 'matching', 'adaptation'];
const WORKFLOW_DISCARD_MESSAGE = '저장하지 않은 기록 입력이 있습니다.\n계속하면 입력한 내용이 사라집니다. 계속할까요?';

const UNSAVED_MESSAGE = '저장하지 않은 내용이나 진행 중인 AI 작업이 있습니다.\n이 화면을 떠나면 작성한 내용이 사라집니다. 계속할까요?';

function normalizeRequestedStep(step?: string): { step?: CaseStep; followUpMode?: FollowUpMode; openWorkflowPanel?: boolean } {
    if (step === 'meeting' || step === 'plan' || step === 'followup') return { step };
    if (step === 'counseling' || step === 'evaluation') return { step: 'followup', followUpMode: step };
    if (step === 'workflow') return { step: 'followup', openWorkflowPanel: true };
    return {};
}

/** 넘겨받은 이용자 찾기: seekerId(식별자) 우선, 이름은 같은 이름이 한 명뿐일 때만(이전 호출 호환). */
function findNavigationSeeker(state: WorkMateNavigationState, seekers: Seeker[]): Seeker | 'ambiguous' | null {
    if (state.seekerId) {
        const key = String(state.seekerId);
        return seekers.find(seeker => isSameSeeker(seeker, { id: key, seekerId: key })) || null;
    }
    if (state.seekerName) {
        const matches = seekers.filter(seeker => seeker.name === state.seekerName);
        if (matches.length === 1) return matches[0];
        return matches.length > 1 ? 'ambiguous' : null;
    }
    return null;
}

export default function WorkMate() {
    const location = useLocation();
    const navigate = useNavigate();
    const { seekers, jobs, loading: dbLoading, initialized } = useDataStore();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<TabKey>('pipeline');
    const [matchingDirty, setMatchingDirty] = useState(false);
    const [reviewDirty, setReviewDirty] = useState(false);
    // 지원고용 관리 탭: 회차 편집 중 미저장·저장/출력/AI 작업 중 여부
    const [supportedDirty, setSupportedDirty] = useState(false);
    const [supportedRequest, setSupportedRequest] = useState<SupportedEmploymentRequest | null>(null);
    // 현황 기록 폼(패널·적응지원·직무 비교)은 한 번에 하나만 화면에 있으므로 미저장 상태도 하나로 관리합니다.
    const [workflowDirty, setWorkflowDirty] = useState(false);
    const [workflowPanelOpen, setWorkflowPanelOpen] = useState(false);
    // 적응지원 탭과 매칭 탭 하단 직무 비교가 함께 쓰는 이용자
    const [workflowSeekerKey, setWorkflowSeekerKey] = useState('');

    const pipeline = useCaseDocumentPipeline();
    const employment = useEmploymentDocuments();
    const {
        caseSeeker, caseStep, setCaseStep,
        meetingText, setMeetingText, planText, setPlanText,
        counselText, setCounselText, evalText, setEvalText,
        meetingInput, setMeetingInput, planInput, setPlanInput,
        counselInput, setCounselInput, evalInput, setEvalInput,
        caseMeetingDoc, casePlanDoc, caseFollowUpHistory,
        caseGenerating, isGenerating, savingCaseDocType,
    } = pipeline;

    // 페이지 전체 미저장 여부(다른 메뉴로 이동할 때 확인). 하위 화면은 onDirtyChange로 알려 줍니다.
    const hasUnsavedChanges = pipeline.hasUnsavedCaseChanges
        || employment.isInterviewDirty
        || employment.isJobAnalysisDirty
        || matchingDirty
        || reviewDirty
        || supportedDirty
        || workflowDirty
        || isGenerating
        || employment.employmentBusy;
    const { confirmDiscard } = useUnsavedGuard(hasUnsavedChanges, UNSAVED_MESSAGE);

    // 탭 전환: 사례관리·면접일지·직무분석지 작성 내용은 이 페이지가 보관하므로 탭을 옮겨도 유지됩니다.
    // 매칭·작성 내용 점검 탭과 현황 기록 폼(후속 일정·목표·당사자 확인·적응지원·직무 비교)은 탭을 떠나면 사라지므로 그때만 확인합니다.
    const handleTabChange = async (next: TabKey) => {
        if (next === activeTab) return;
        const leavingDirtyChild = (activeTab === 'matching' && matchingDirty) || (activeTab === 'review' && reviewDirty)
            || (activeTab === 'supportedEmployment' && supportedDirty)
            || (WORKFLOW_FORM_TABS.includes(activeTab) && workflowDirty);
        if (leavingDirtyChild && !(await confirmDiscard('이 탭에서 작성한 내용은 저장되지 않았습니다.\n다른 탭으로 이동하면 사라집니다. 계속할까요?'))) return;
        if (activeTab === 'matching') setMatchingDirty(false);
        if (activeTab === 'review') setReviewDirty(false);
        if (activeTab === 'supportedEmployment') setSupportedDirty(false);
        setActiveTab(next);
    };

    // 사례관리 이용자가 정해지면 적응지원·직무 비교의 기본 이용자로도 씁니다(이미 고른 이용자는 유지).
    useEffect(() => {
        if (caseSeeker) setWorkflowSeekerKey(current => current || getSeekerKey(caseSeeker));
    }, [caseSeeker]);

    const guardWorkflowDraft = async () => !workflowDirty || confirmDiscard(WORKFLOW_DISCARD_MESSAGE);
    const handleSelectCaseSeeker = async (seeker: Seeker) => {
        if (caseSeeker && !isSameSeeker(caseSeeker, seeker) && !(await guardWorkflowDraft())) return;
        await pipeline.selectCaseSeeker(seeker);
    };
    const handleResetCase = async () => {
        if (!(await guardWorkflowDraft())) return;
        await pipeline.resetCase();
    };
    const handleWorkflowSeekerChange = async (seekerKey: string) => {
        if (seekerKey === workflowSeekerKey || !(await guardWorkflowDraft())) return;
        setWorkflowSeekerKey(seekerKey);
    };

    // 다른 화면에서 넘겨받은 state는 한 번만 쓰고 기록에서 지웁니다.
    // (지우지 않으면 "이용자 변경"을 눌러도 같은 이용자가 다시 선택됩니다.)
    const consumedNavigationKeyRef = useRef<string | null>(null);
    useEffect(() => {
        const state = location.state as WorkMateNavigationState | null;
        if (!state || consumedNavigationKeyRef.current === location.key) return;
        const wantsSeeker = Boolean(state.seekerId || state.seekerName);
        if (wantsSeeker && !initialized && seekers.length === 0) return; // 이용자 목록을 불러올 때까지 기다립니다.
        consumedNavigationKeyRef.current = location.key;
        navigate(`${location.pathname}${location.search}`, { replace: true, state: null });

        const tab = isTabKey(state.tab) ? state.tab : undefined;
        if (tab) setActiveTab(tab);
        if (tab === 'supportedEmployment') {
            // 지원고용 관리: 회차 ID가 있으면 그 회차를 열고, 이용자만 있으면 목록을 그 이용자로 거릅니다.
            const found = wantsSeeker ? findNavigationSeeker(state, seekers) : null;
            setSupportedRequest({
                key: location.key,
                caseId: state.documentId,
                seekerId: found && found !== 'ambiguous' ? getSeekerKey(found) : undefined,
            });
            return;
        }
        if (!wantsSeeker) return;
        const target = findNavigationSeeker(state, seekers);
        if (target === 'ambiguous') {
            showToast('같은 이름의 이용자가 여러 명 있어 자동으로 선택하지 않았습니다. 목록에서 직접 선택해 주세요.', 'info', 4000);
            return;
        }
        if (!target) {
            showToast('넘겨받은 이용자를 찾지 못했습니다. 목록에서 직접 선택해 주세요.', 'info', 3500);
            return;
        }
        setWorkflowSeekerKey(getSeekerKey(target));
        if (tab === 'interview') {
            void employment.handleSelectEmploymentSeeker(getSeekerKey(target));
            return;
        }
        if (tab === 'adaptation') return;
        const requested = normalizeRequestedStep(state.step);
        if (requested.followUpMode) pipeline.setFollowUpMode(requested.followUpMode);
        if (requested.openWorkflowPanel) setWorkflowPanelOpen(true);
        void pipeline.selectCaseSeeker(target, requested.step);
    }, [location.key, location.state, initialized, seekers]);

    const meetingSaved = Boolean(caseMeetingDoc) && caseMeetingDoc?.content === meetingText;
    const planSaved = Boolean(casePlanDoc) && casePlanDoc?.content === planText;
    const caseBusy = isGenerating || savingCaseDocType !== null;
    const { selectedEmploymentSeeker, employmentContext } = employment;

    // 탭 본문. 새 탭을 추가하면 여기에 case 하나를 더합니다(빠뜨리면 타입 검사에서 알려 줍니다).
    const renderTab = (tab: TabKey): ReactNode => {
        switch (tab) {
            case 'pipeline': return (
                    <motion.div
                        key="pipeline"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
                    >
                        <CaseSeekerPicker
                            seekers={seekers}
                            loading={dbLoading}
                            selectedSeeker={caseSeeker}
                            onSelect={seeker => void handleSelectCaseSeeker(seeker)}
                        />

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
                                            <button type="button" onClick={() => void handleResetCase()} className="btn-ghost !bg-white/5 border border-white/10 !px-5 !py-2.5 rounded-xl font-bold text-xs hover:bg-white/10">이용자 변경</button>
                                        </div>
                                        <div className="absolute top-0 right-0 p-8 opacity-5">
                                            <UserCheck className="w-40 h-40" />
                                        </div>
                                    </motion.div>

                                    <ClientContextBox
                                        summary={pipeline.caseContext.summary}
                                        loading={pipeline.caseContext.loading}
                                        onLoad={() => void pipeline.caseContext.load()}
                                        onClear={pipeline.caseContext.clear}
                                        className="mb-5"
                                    />

                                    {/* 단계 바로가기 탭 */}
                                    <CaseStepNav
                                        caseStep={caseStep}
                                        onStepChange={setCaseStep}
                                        saved={{ meeting: meetingSaved, plan: planSaved, followup: caseFollowUpHistory.length > 0 }}
                                        draft={{
                                            meeting: meetingText.trim().length > 0 && !meetingSaved,
                                            plan: planText.trim().length > 0 && !planSaved,
                                            followup: Boolean(counselText.trim() || evalText.trim()),
                                        }}
                                    />

                                    {/* ── STEP 1: 사례회의록 ── */}
                                    <CaseStage
                                        title="STEP 1. 사례회의록 작성"
                                        description="사례회의 내용을 바탕으로 공식 회의록을 자동 생성합니다."
                                        isActive={caseStep === 'meeting'}
                                        isDone={meetingText.length > 0}
                                        isSaved={meetingSaved}
                                        input={meetingInput}
                                        setInput={setMeetingInput}
                                        result={meetingText}
                                        setResult={setMeetingText}
                                        onGenerate={() => void pipeline.generateCaseDoc('meeting')}
                                        onRefine={() => void pipeline.refineCaseDoc('meeting')}
                                        isGenerating={caseGenerating === 'meeting'}
                                        isBusy={caseBusy}
                                        isSaving={savingCaseDocType === 'meeting'}
                                        onSave={() => void pipeline.saveCaseDoc(caseMeetingDoc, meetingText, 'meeting')}
                                        onReset={() => void pipeline.resetCaseResult('meeting')}
                                        placeholder="당사자/보호자 욕구, 현재 상황, 논의 내용을 입력하세요."
                                        onActivate={() => setCaseStep('meeting')}
                                    />

                                    {/* ── STEP 2: 직업재활계획서 ── */}
                                    <CaseStage
                                        title="STEP 2. 직업재활계획 수립"
                                        description="사례회의 내용을 연동하여 구체적인 목표와 수행방법을 수립합니다."
                                        isActive={caseStep === 'plan'}
                                        isDone={planText.length > 0}
                                        isSaved={planSaved}
                                        input={planInput}
                                        setInput={setPlanInput}
                                        result={planText}
                                        setResult={setPlanText}
                                        onGenerate={() => void pipeline.generateCaseDoc('plan')}
                                        onRefine={() => void pipeline.refineCaseDoc('plan')}
                                        isGenerating={caseGenerating === 'plan'}
                                        isBusy={caseBusy}
                                        isSaving={savingCaseDocType === 'plan'}
                                        onSave={() => void pipeline.saveCaseDoc(casePlanDoc, planText, 'plan')}
                                        onReset={() => void pipeline.resetCaseResult('plan')}
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
                                        setHistory={pipeline.setCaseFollowUpHistory}
                                        onDeleteHistory={(id, type) => void pipeline.deleteCaseDoc(id, type)}
                                        onSaveHistory={(document, content, type) => void pipeline.saveCaseDoc(document, content, type)}
                                        writeMode={pipeline.followUpMode}
                                        setWriteMode={pipeline.setFollowUpMode}
                                        isBusy={isGenerating}

                                        counselInput={counselInput}
                                        setCounselInput={setCounselInput}
                                        counselText={counselText}
                                        setCounselText={setCounselText}
                                        onGenerateCounsel={() => void pipeline.generateCaseDoc('counseling')}
                                        onRefineCounsel={() => void pipeline.refineCaseDoc('counseling')}
                                        isGeneratingCounsel={caseGenerating === 'counseling'}
                                        onSaveCounsel={() => pipeline.saveCaseDoc(null, counselText, 'counseling')}

                                        evalInput={evalInput}
                                        setEvalInput={setEvalInput}
                                        evalText={evalText}
                                        setEvalText={setEvalText}
                                        onGenerateEval={() => void pipeline.generateCaseDoc('evaluation')}
                                        onRefineEval={() => void pipeline.refineCaseDoc('evaluation')}
                                        isGeneratingEval={caseGenerating === 'evaluation'}
                                        onSaveEval={() => pipeline.saveCaseDoc(null, evalText, 'evaluation')}
                                        savingDocumentType={savingCaseDocType}

                                        planText={planText}
                                    />

                                    {/* ── 후속 일정·목표 변화·당사자 확인(현황판에서 옮김) ── */}
                                    <WorkflowPanel
                                        key={getSeekerKey(caseSeeker)}
                                        seeker={caseSeeker}
                                        open={workflowPanelOpen}
                                        onToggle={() => setWorkflowPanelOpen(current => !current)}
                                        onDirtyChange={setWorkflowDirty}
                                    />
                                </div>
                            )}
                        </div>
                    </motion.div>
            );
            case 'matching': return (
                    <motion.div
                        key="matching"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="w-full max-w-7xl"
                    >
                        <MatchingView onBack={() => void handleTabChange('pipeline')} onDirtyChange={setMatchingDirty} />
                        {/* ── 직무 요구–지원 필요 비교(현황판에서 옮김) ── */}
                        <WorkflowSeekerSection
                            id="comparison-seeker"
                            label="직무 비교 이용자"
                            className="mt-8"
                            seekers={seekers}
                            seekerKey={workflowSeekerKey}
                            onSeekerChange={key => void handleWorkflowSeekerChange(key)}
                            onDirtyChange={setWorkflowDirty}
                        >
                            {(seeker, record) => <JobComparisonSection seeker={seeker} jobs={jobs} record={record} onDirtyChange={setWorkflowDirty} />}
                        </WorkflowSeekerSection>
                    </motion.div>
            );
            case 'interview': return (
                    <EmploymentDocumentTab
                        key="interview"
                        title="면접일지 작성"
                        description="면접 과정, 당사자 반응, 사업체 의견, 후속 지원계획을 고용지원 면접일지 형식으로 정리합니다."
                        icon={<CalendarDays className="w-5 h-5 text-blue-300" />}
                        seekers={employment.employmentSeekerOptions}
                        selectedSeekerId={employment.employmentSeekerId}
                        onSelectSeeker={seekerKey => void employment.handleSelectEmploymentSeeker(seekerKey)}
                        fields={[
                            { label: '면접일', value: employment.interviewForm.date, onChange: v => employment.setInterviewForm(prev => ({ ...prev, date: v })), placeholder: '2026년 5월 8일' },
                            { label: '사업체명', value: employment.interviewForm.companyName, onChange: v => employment.setInterviewForm(prev => ({ ...prev, companyName: v })), placeholder: '사업체명' },
                            { label: '직무', value: employment.interviewForm.jobRole, onChange: v => employment.setInterviewForm(prev => ({ ...prev, jobRole: v })), placeholder: '예: 사무보조, 바리스타' },
                            { label: '면접 참여자', value: employment.interviewForm.participants, onChange: v => employment.setInterviewForm(prev => ({ ...prev, participants: v })), placeholder: '이용자, 업체 담당자, 복지관 담당자' },
                        ]}
                        textareas={[
                            { label: '면접 내용', value: employment.interviewForm.memo, onChange: v => employment.setInterviewForm(prev => ({ ...prev, memo: v })), placeholder: '질문/답변, 확인한 직무 내용, 면접 분위기 등을 적어주세요.' },
                            { label: '당사자 반응', value: employment.interviewForm.seekerResponse, onChange: v => employment.setInterviewForm(prev => ({ ...prev, seekerResponse: v })), placeholder: '관심, 부담, 이해도, 희망 여부 등을 적어주세요.' },
                            { label: '사업체 의견', value: employment.interviewForm.companyOpinion, onChange: v => employment.setInterviewForm(prev => ({ ...prev, companyOpinion: v })), placeholder: '사업체가 언급한 강점, 우려, 채용 가능성 등을 적어주세요.' },
                            { label: '후속 지원계획', value: employment.interviewForm.supportPlan, onChange: v => employment.setInterviewForm(prev => ({ ...prev, supportPlan: v })), placeholder: '추가 면접, 현장훈련, 직무조정, 보호자/기관 공유 계획 등을 적어주세요.' },
                        ]}
                        result={employment.interviewText}
                        setResult={employment.setInterviewText}
                        resultPlaceholder="AI가 작성한 면접일지가 여기에 표시됩니다."
                        busy={employment.employmentBusy}
                        isGenerating={employment.employmentGenerating === 'interview'}
                        isRefining={employment.employmentGenerating === 'interviewRefine'}
                        isSaving={employment.employmentSaving === 'interview'}
                        onGenerate={() => void employment.generateEmploymentDoc('interview')}
                        onRefine={() => void employment.refineEmploymentDoc('interview')}
                        onSave={() => void employment.saveEmploymentDoc('interview')}
                        onReset={() => void employment.resetEmploymentResult('interview')}
                        contextSummary={employmentContext.summary}
                        contextLoading={employmentContext.loading}
                        onLoadContext={() => void employmentContext.load()}
                        onClearContext={employmentContext.clear}
                    />
            );
            case 'jobAnalysis': return (
                    <JobAnalysisDocumentTab
                        key="job-analysis"
                        jobs={employment.jobs}
                        selectedJobId={employment.jobAnalysisJobId}
                        selectedJob={employment.selectedJobAnalysisJob}
                        search={employment.jobAnalysisJobSearch}
                        onSearch={employment.setJobAnalysisJobSearch}
                        onSelectJob={jobId => void employment.handleSelectJobAnalysisJob(jobId)}
                        form={employment.jobAnalysisForm}
                        setForm={employment.setJobAnalysisForm}
                        photos={employment.jobAnalysisPhotos}
                        addPhotos={employment.addJobAnalysisPhotos}
                        removePhoto={employment.removeJobAnalysisPhoto}
                        result={employment.jobAnalysisText}
                        setResult={employment.setJobAnalysisText}
                        busy={employment.employmentBusy}
                        isGenerating={employment.employmentGenerating === 'jobAnalysis'}
                        isRefining={employment.employmentGenerating === 'jobAnalysisRefine'}
                        isSaving={employment.employmentSaving === 'jobAnalysis'}
                        onGenerate={() => void employment.generateEmploymentDoc('jobAnalysis')}
                        onRefine={() => void employment.refineEmploymentDoc('jobAnalysis')}
                        onSave={() => void employment.saveEmploymentDoc('jobAnalysis')}
                        onReset={() => void employment.resetEmploymentResult('jobAnalysis')}
                        contextSummary={employmentContext.summary}
                        contextLoading={employmentContext.loading}
                        contextDescription={selectedEmploymentSeeker
                            ? `면접일지 작성 탭에서 선택한 ${selectedEmploymentSeeker.name} 님의 최근 직업훈련·고용지원 기록을 직무분석지 보완 시 참고자료로 포함합니다. 원본 문서는 수정하지 않습니다.`
                            : '면접일지 작성 탭에서 이용자를 선택하면, 그 이용자의 최근 기록을 직무분석지 보완 시 참고자료로 포함할 수 있습니다.'}
                        contextDisabled={!selectedEmploymentSeeker}
                        onLoadContext={() => void employmentContext.load()}
                        onClearContext={employmentContext.clear}
                    />
            );
            case 'adaptation': return (
                    <motion.div
                        key="adaptation"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="w-full max-w-7xl"
                    >
                        <WorkflowSeekerSection
                            id="adaptation-seeker"
                            label="적응지원 이용자"
                            seekers={seekers}
                            seekerKey={workflowSeekerKey}
                            onSeekerChange={key => void handleWorkflowSeekerChange(key)}
                            onDirtyChange={setWorkflowDirty}
                        >
                            {(_seeker, record) => <EmploymentCheckSection record={record} onDirtyChange={setWorkflowDirty} />}
                        </WorkflowSeekerSection>
                    </motion.div>
            );
            case 'supportedEmployment': return (
                    <motion.div
                        key="supportedEmployment"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="w-full max-w-7xl"
                    >
                        <SupportedEmploymentTab seekers={seekers} jobs={jobs} request={supportedRequest} onDirtyChange={setSupportedDirty} />
                    </motion.div>
            );
            case 'review': return (
                    <motion.div
                        key="review"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="w-full max-w-7xl"
                    >
                        <DocumentReviewTab onDirtyChange={setReviewDirty} />
                    </motion.div>
            );
            default: { const unknownTab: never = tab; return unknownTab; }
        }
    };

    return (
        <div className="min-h-screen py-8 px-4 flex flex-col items-center">
            {/* ─── 헤더 ─── */}
            <div className="w-full max-w-7xl mb-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-500/10 border border-primary-500/20 mb-4">
                    <FileText className="w-4 h-4 text-primary-400" />
                    <span className="text-xs text-primary-300 font-bold uppercase tracking-wider">Case Management Pipeline</span>
                </div>
                <h1 className="text-4xl font-black text-white mb-2">고용지원</h1>
                <p className="text-white/40 text-lg">사례관리 문서, 구인구직 매칭, 면접일지, 직무분석지, 취업 후 적응지원, 지원고용 결과보고, 작성 내용 점검을 한 곳에서 관리합니다.</p>

                {/* 탭 전환 */}
                <div className="flex gap-2 mt-8 border-b border-white/5 pb-0 overflow-x-auto">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                aria-pressed={activeTab === tab.key}
                                onClick={() => void handleTabChange(tab.key)}
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
            <AnimatePresence mode="wait" initial={false}>
                {renderTab(activeTab)}
            </AnimatePresence>
        </div>
    );
}
