import { useRef, useState } from 'react';
import { useDataStore } from '../../store/dataStore';
import { generateText } from '../../services/gemini';
import { regenerateDocumentFromCurrent } from '../../services/documentRegenerationService';
import type { CaseDocument } from '../../types/caseDocument';
import type { Seeker } from '../../types/matching';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/common/ConfirmProvider';
import { useClientContext } from '../../hooks/useClientContext';
import { getSeekerKey, isSameSeeker } from '../../utils/seeker';
import {
    buildCaseMeetingPrompt,
    buildCasePreviousRecords,
    buildCounselingPrompt,
    buildEvaluationPrompt,
    buildRehabPlanPrompt,
    buildSeekerContext,
    CASE_DOCUMENT_TITLES,
    CASE_REFINE_INSTRUCTION,
    getCasePromptType,
} from './workmatePrompts';
import type { CaseDocumentAction, CaseStep, FollowUpMode } from './types';

/**
 * 사례관리 문서 연속작성(사례회의록 → 직업재활계획서 → 상담일지·정기평가) 상태와 동작.
 * - AI 생성·보완과 저장은 한 번에 하나만 실행합니다.
 * - 이용자는 식별자(id → seekerId)로만 비교합니다.
 */
export function useCaseDocumentPipeline() {
    const { seekers, fetchCaseDocuments, addCaseDocument, deleteCaseDocument, updateCaseDocument } = useDataStore();
    const { showToast } = useToast();
    const confirm = useConfirm();

    const [caseGenerating, setCaseGenerating] = useState<CaseDocumentAction | null>(null);
    const caseGeneratingRef = useRef(false);
    const isGenerating = caseGenerating !== null;
    const [caseSeeker, setCaseSeeker] = useState<Seeker | null>(null);
    const [caseStep, setCaseStep] = useState<CaseStep>('select');
    const [meetingText, setMeetingText] = useState('');
    const [planText, setPlanText] = useState('');
    const [counselText, setCounselText] = useState('');
    const [evalText, setEvalText] = useState('');
    const [followUpMode, setFollowUpMode] = useState<FollowUpMode>('counseling');

    // 각 단계별 사용자 입력 (단일 textarea)
    const [meetingInput, setMeetingInput] = useState('');
    const [planInput, setPlanInput] = useState('');
    const [counselInput, setCounselInput] = useState('');
    const [evalInput, setEvalInput] = useState('');
    const [caseFollowUpHistory, setCaseFollowUpHistory] = useState<CaseDocument[]>([]);
    const [caseMeetingDoc, setCaseMeetingDoc] = useState<CaseDocument | null>(null);
    const [casePlanDoc, setCasePlanDoc] = useState<CaseDocument | null>(null);
    const caseContext = useClientContext(caseSeeker, seekers);
    const caseContextSummary = caseContext.summary;
    const [savingCaseDocType, setSavingCaseDocType] = useState<CaseDocumentAction | null>(null);
    const caseDocSaveInFlightRef = useRef(false);
    const followUpSavedContentsRef = useRef<Record<string, string>>({});
    const caseSelectionRequestRef = useRef(0);

    const hasEditedSavedFollowUp = caseFollowUpHistory.some(document =>
        Boolean(document.id) && followUpSavedContentsRef.current[document.id!] !== document.content
    );
    const meetingChanged = meetingText.trim().length > 0 && meetingText !== (caseMeetingDoc?.content || '');
    const planChanged = planText.trim().length > 0 && planText !== (casePlanDoc?.content || '');
    // 사례회의·계획 입력칸은 초안이 생성되면 결과로 반영되므로, 결과가 없을 때만 미저장으로 봅니다.
    const meetingInputPending = !meetingText.trim() && meetingInput.trim().length > 0;
    const planInputPending = !planText.trim() && planInput.trim().length > 0;
    const hasUnsavedCaseChanges = meetingChanged || planChanged || hasEditedSavedFollowUp || meetingInputPending || planInputPending ||
        Boolean(counselText.trim() || evalText.trim() || counselInput.trim() || evalInput.trim());

    const confirmDiscardCaseChanges = async (message: string) =>
        !hasUnsavedCaseChanges || confirm({ title: '저장하지 않은 내용', message, confirmLabel: '버리고 계속', cancelLabel: '취소', tone: 'danger' });

    const clearCaseState = () => {
        setMeetingText(''); setPlanText(''); setCounselText(''); setEvalText('');
        setMeetingInput(''); setPlanInput(''); setCounselInput(''); setEvalInput('');
        setCaseFollowUpHistory([]);
        followUpSavedContentsRef.current = {};
        setCaseMeetingDoc(null);
        setCasePlanDoc(null);
    };

    // ─── 이용자 선택 ───
    const selectCaseSeeker = async (s: Seeker, requestedStep?: CaseStep) => {
        if (caseDocSaveInFlightRef.current || caseGeneratingRef.current) { showToast('문서 처리가 끝난 뒤 이용자를 변경해 주세요.', 'info'); return; }
        if (caseSeeker && isSameSeeker(caseSeeker, s) && !requestedStep) return;
        if (caseSeeker && !(await confirmDiscardCaseChanges('저장하지 않은 작성 내용이 있습니다. 이용자를 변경하면 해당 내용이 사라집니다. 계속할까요?'))) return;

        const requestId = ++caseSelectionRequestRef.current;
        setCaseSeeker(s);
        setCaseStep('meeting');
        clearCaseState();
        // 문서 매칭은 fetchCaseDocuments가 식별자로 합니다.
        // 이름으로만 저장된 옛 문서는 같은 이름의 이용자가 한 명뿐일 때만 읽습니다(dataStore 호환 규칙).
        let docs: CaseDocument[] = [];
        try {
            docs = await fetchCaseDocuments(s);
        } catch (error: any) {
            if (requestId !== caseSelectionRequestRef.current) return;
            showToast(error?.message || '저장된 사례관리 문서를 불러오지 못했습니다.', 'error');
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
        } else if (meetDoc && planDoc) {
            setCaseStep('followup');
        } else if (meetDoc) {
            setCaseStep('plan');
        } else {
            setCaseStep('meeting');
        }
    };

    const resetCase = async () => {
        if (caseDocSaveInFlightRef.current || caseGeneratingRef.current) { showToast('문서 처리가 끝난 뒤 이용자를 변경해 주세요.', 'info'); return; }
        if (!(await confirmDiscardCaseChanges('저장하지 않은 작성 내용이 있습니다. 이용자 선택 화면으로 돌아가면 해당 내용이 사라집니다. 계속할까요?'))) return;

        caseSelectionRequestRef.current += 1;
        setCaseSeeker(null);
        setCaseStep('select');
        clearCaseState();
    };

    /**
     * 생성된 사례회의록·계획서 자동 저장.
     * 이미 저장된 문서가 있으면 새로 만들지 않고 그 문서를 갱신합니다(초기화 후 재생성 시 중복 방지).
     */
    const persistGeneratedCaseDoc = async (type: 'meeting' | 'plan', content: string, seeker: Seeker) => {
        const seekerKey = getSeekerKey(seeker);
        if (!seekerKey) return;
        const existing = type === 'meeting' ? caseMeetingDoc : casePlanDoc;
        const setDoc = type === 'meeting' ? setCaseMeetingDoc : setCasePlanDoc;
        try {
            if (existing?.id) {
                await updateCaseDocument(existing.id, content);
                setDoc({ ...existing, content });
            } else {
                const newDoc = await addCaseDocument({ seekerId: seekerKey, seekerName: seeker.name, type, content, tab: 'case' });
                setDoc(newDoc);
            }
        } catch {
            showToast(`${CASE_DOCUMENT_TITLES[type]} 초안은 생성됐지만 자동 저장하지 못했습니다. 작성 내용은 유지되므로 저장 버튼을 다시 눌러 주세요.`, 'error');
        }
    };

    const generateCaseDoc = async (step: CaseDocumentAction) => {
        if (caseDocSaveInFlightRef.current || caseGeneratingRef.current) return;
        if (!caseSeeker) return;
        caseGeneratingRef.current = true;
        setCaseGenerating(step);
        try {
            if (step === 'meeting') {
                const prompt = buildCaseMeetingPrompt(caseSeeker, meetingInput, caseContextSummary);
                const result = await generateText('case_meeting', prompt, undefined, { featureKey: 'workmate', documentType: 'case-meeting' });
                setMeetingText(result);
                await persistGeneratedCaseDoc('meeting', result, caseSeeker);
                setCaseStep('plan');
            } else if (step === 'plan') {
                const prompt = buildRehabPlanPrompt(caseSeeker, meetingText, planInput, caseContextSummary);
                const result = await generateText('rehab_plan', prompt, undefined, { featureKey: 'workmate', documentType: 'rehab-plan' });
                setPlanText(result);
                await persistGeneratedCaseDoc('plan', result, caseSeeker);
                setCaseStep('followup');
            } else if (step === 'counseling') {
                const prompt = buildCounselingPrompt({
                    seeker: caseSeeker,
                    planText,
                    meetingText,
                    history: caseFollowUpHistory,
                    counselInput,
                    contextSummary: caseContextSummary,
                });
                const result = await generateText('counseling', prompt, undefined, { featureKey: 'workmate', documentType: 'counseling' });
                setCounselText(result);
                // 상담 완료 후에도 followup 상태 유지 (사용자가 직접 저장 버튼을 눌러야 DB에 저장됨)
            } else if (step === 'evaluation') {
                const prompt = buildEvaluationPrompt({
                    seeker: caseSeeker,
                    planText,
                    history: caseFollowUpHistory,
                    evalInput,
                    contextSummary: caseContextSummary,
                });
                const result = await generateText('evaluation', prompt, undefined, { featureKey: 'workmate', documentType: 'evaluation' });
                setEvalText(result);
                // 평가 완료 후에도 유지 (사용자가 직접 저장 버튼을 눌러야 DB에 저장됨)
            }
        } catch (error: any) {
            showToast(error?.message || 'AI 생성 중 오류가 발생했습니다. 기존 작성 내용은 유지됩니다.', 'error', 7000);
        } finally {
            caseGeneratingRef.current = false;
            setCaseGenerating(null);
        }
    };

    // 보완은 성공했을 때만 작성칸을 바꾸므로(실패 시 기존 내용 유지) 확인창 없이 바로 실행합니다.
    const refineCaseDoc = async (type: CaseDocumentAction) => {
        if (caseDocSaveInFlightRef.current || caseGeneratingRef.current) return;
        if (!caseSeeker) return;
        const currentContent = type === 'meeting' ? meetingText : type === 'plan' ? planText : type === 'counseling' ? counselText : evalText;
        if (!currentContent.trim()) {
            showToast('먼저 보완할 내용을 작성하거나 생성해 주세요.', 'error');
            return;
        }

        caseGeneratingRef.current = true;
        setCaseGenerating(type);
        try {
            const result = await regenerateDocumentFromCurrent(getCasePromptType(type), {
                documentTitle: CASE_DOCUMENT_TITLES[type],
                currentContent,
                userContext: buildSeekerContext(caseSeeker),
                previousRecords: buildCasePreviousRecords(type, meetingText, planText, caseFollowUpHistory),
                contextSummary: caseContextSummary,
                additionalInstruction: CASE_REFINE_INSTRUCTION,
            });
            if (type === 'meeting') setMeetingText(result);
            if (type === 'plan') setPlanText(result);
            if (type === 'counseling') setCounselText(result);
            if (type === 'evaluation') setEvalText(result);
            showToast('현재 내용 기반 보완본이 생성되었습니다.', 'success', 2500);
        } catch (error: any) {
            showToast(error?.message || '현재 내용 기반 보완 중 오류가 발생했습니다. 기존 작성 내용은 유지됩니다.', 'error');
        } finally {
            caseGeneratingRef.current = false;
            setCaseGenerating(null);
        }
    };

    /** 사례회의록·계획서 작성칸 비우기(저장된 문서는 지우지 않음) */
    const resetCaseResult = async (type: 'meeting' | 'plan') => {
        if (caseDocSaveInFlightRef.current || caseGeneratingRef.current) return;
        const label = CASE_DOCUMENT_TITLES[type];
        const ok = await confirm({
            title: `${label} 작성 내용 비우기`,
            message: `${label} 작성 내용을 화면에서 비울까요?\n이미 저장된 문서는 삭제되지 않지만, 다시 생성하면 저장된 ${label}이(가) 새 내용으로 바뀝니다.`,
            confirmLabel: '비우기',
            cancelLabel: '취소',
            tone: 'danger',
        });
        if (!ok) return;
        if (type === 'meeting') { setMeetingText(''); setCaseStep('meeting'); }
        else { setPlanText(''); setCaseStep('plan'); }
    };

    // ─── 문서 삭제 ───
    const deleteCaseDoc = async (docId: string, type: CaseDocumentAction) => {
        if (caseDocSaveInFlightRef.current || caseGeneratingRef.current) return;
        const ok = await confirm({
            title: '문서 삭제',
            message: '이 문서를 삭제할까요? 삭제한 문서는 되돌릴 수 없습니다.',
            confirmLabel: '삭제',
            cancelLabel: '취소',
            tone: 'danger',
        });
        if (!ok) return;

        // 삭제할 문서의 내용 확인 (상태 동기화를 위해)
        const deletedContent = caseFollowUpHistory.find(document => document.id === docId)?.content;

        try { await deleteCaseDocument(docId); }
        catch (error: any) { showToast(error?.message || '문서를 삭제하지 못했습니다.', 'error'); return; }

        if (type === 'meeting') {
            setCaseMeetingDoc(null); setMeetingText('');
        } else if (type === 'plan') {
            setCasePlanDoc(null); setPlanText('');
        } else {
            setCaseFollowUpHistory(prev => prev.filter(document => document.id !== docId));
            delete followUpSavedContentsRef.current[docId];
            if (type === 'counseling' && counselText === deletedContent) setCounselText('');
            if (type === 'evaluation' && evalText === deletedContent) setEvalText('');
        }
    };

    const saveCaseDoc = async (docObj: CaseDocument | null, content: string, type: CaseDocumentAction) => {
        if (!content.trim()) {
            showToast('저장할 내용이 없습니다.', 'error');
            return false;
        }
        if (caseDocSaveInFlightRef.current || caseGeneratingRef.current) return false;
        const seekerKey = getSeekerKey(caseSeeker);
        if (!docObj?.id && (!caseSeeker || !seekerKey)) {
            showToast('이용자 식별 정보가 없어 저장하지 못했습니다. 이용자를 다시 선택해 주세요.', 'error');
            return false;
        }

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
                const newDoc = await addCaseDocument({ seekerId: seekerKey, seekerName: caseSeeker!.name, type, content, tab: 'case' });
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
            showToast(error?.message || '문서를 저장하지 못했습니다. 작성 내용은 유지됩니다.', 'error');
            return false;
        } finally {
            caseDocSaveInFlightRef.current = false;
            setSavingCaseDocType(null);
        }
    };

    return {
        caseSeeker,
        caseStep,
        setCaseStep,
        meetingText, setMeetingText,
        planText, setPlanText,
        counselText, setCounselText,
        evalText, setEvalText,
        meetingInput, setMeetingInput,
        planInput, setPlanInput,
        counselInput, setCounselInput,
        evalInput, setEvalInput,
        followUpMode, setFollowUpMode,
        caseFollowUpHistory, setCaseFollowUpHistory,
        caseMeetingDoc,
        casePlanDoc,
        caseContext,
        caseGenerating,
        isGenerating,
        savingCaseDocType,
        hasUnsavedCaseChanges,
        selectCaseSeeker,
        resetCase,
        resetCaseResult,
        generateCaseDoc,
        refineCaseDoc,
        deleteCaseDoc,
        saveCaseDoc,
    };
}

export type CaseDocumentPipelineState = ReturnType<typeof useCaseDocumentPipeline>;
