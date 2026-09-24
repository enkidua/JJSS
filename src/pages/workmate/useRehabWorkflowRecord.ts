import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataStore } from '../../store/dataStore';
import type { CaseDocument } from '../../types/caseDocument';
import type { Seeker } from '../../types/matching';
import { getSeekerKey } from '../../utils/seeker';
import { EMPTY_REHAB_WORKFLOW, parseRehabWorkflow, type RehabWorkflowData } from '../../config/rehabWorkflow';

export type SaveWorkflow = (next: RehabWorkflowData, success: string) => Promise<boolean>;

export interface RehabWorkflowRecord {
    workflow: RehabWorkflowData;
    /** 현황 기록을 뺀 나머지 사례문서(계획서 연결 등 참고용) */
    documents: CaseDocument[];
    loading: boolean;
    saving: boolean;
    /** 저장된 기록의 형식을 읽을 수 없음. 덮어쓰지 않도록 저장을 막습니다. */
    corrupt: boolean;
    loadFailed: boolean;
    error: string;
    notice: string;
    /** 입력 폼을 잠가야 하는 상태(이용자 없음·불러오는 중·저장 중·손상·불러오기 실패) */
    unavailable: boolean;
    save: SaveWorkflow;
    reload: () => void;
    clearNotice: () => void;
}

export const CORRUPT_MESSAGE = '현황 기록 형식을 읽을 수 없습니다. 기존 기록을 덮어쓰지 않았습니다. 백업을 확인해 주세요.';
export const LOAD_FAILED_MESSAGE = '이용자 기록을 불러오지 못했습니다. 기존 기록은 지우지 않았습니다. 아래 "다시 불러오기"를 눌러 주세요.';

/**
 * 이용자 한 명의 현황 기록(type 'workflow' 사례문서)을 읽고 저장하는 훅.
 * 현황판(/overview)과 고용지원의 후속 일정·목표·적응지원·직무 비교 폼이 같은 기록을 이 훅으로 공유합니다.
 * - 요청 순번으로 늦게 도착한 이전 이용자의 응답을 버립니다.
 * - 저장은 한 번에 하나만 진행합니다.
 */
export function useRehabWorkflowRecord(seeker: Seeker | null | undefined): RehabWorkflowRecord {
    const fetchCaseDocuments = useDataStore(state => state.fetchCaseDocuments);
    const addCaseDocument = useDataStore(state => state.addCaseDocument);
    const updateCaseDocument = useDataStore(state => state.updateCaseDocument);
    const [workflow, setWorkflow] = useState<RehabWorkflowData>(EMPTY_REHAB_WORKFLOW);
    const [workflowDocId, setWorkflowDocId] = useState<string | null>(null);
    const [documents, setDocuments] = useState<CaseDocument[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [corrupt, setCorrupt] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [reloadKey, setReloadKey] = useState(0);
    const sequence = useRef(0);
    const savingRef = useRef(false);
    const seekerKey = getSeekerKey(seeker);

    useEffect(() => {
        const request = ++sequence.current;
        setWorkflow(EMPTY_REHAB_WORKFLOW);
        setWorkflowDocId(null);
        setDocuments([]);
        setError('');
        setNotice('');
        setCorrupt(false);
        setLoadFailed(false);
        if (!seeker || !seekerKey) { setLoading(false); return; }
        setLoading(true);
        fetchCaseDocuments(seeker).then(docs => {
            if (request !== sequence.current) return;
            const saved = docs.find(doc => doc.type === 'workflow');
            if (saved) {
                const parsed = parseRehabWorkflow(saved.content);
                if (!parsed) {
                    setCorrupt(true);
                    setError(CORRUPT_MESSAGE);
                } else {
                    setWorkflow(parsed);
                    setWorkflowDocId(saved.id || null);
                }
            }
            setDocuments(docs.filter(doc => doc.type !== 'workflow'));
        }).catch(() => {
            if (request !== sequence.current) return;
            setLoadFailed(true);
            setError(LOAD_FAILED_MESSAGE);
        }).finally(() => {
            if (request === sequence.current) setLoading(false);
        });
        return () => { sequence.current++; };
    }, [seekerKey, fetchCaseDocuments, reloadKey]);

    const save: SaveWorkflow = useCallback(async (next, success) => {
        if (!seeker || !seekerKey || loading || corrupt || loadFailed || savingRef.current) return false;
        savingRef.current = true;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            const content = JSON.stringify(next);
            if (workflowDocId) {
                await updateCaseDocument(workflowDocId, content);
            } else {
                const saved = await addCaseDocument({ seekerId: seekerKey, seekerName: seeker.name, type: 'workflow', tab: 'case', content, source: 'case' });
                if (!saved.id) throw new Error('저장된 기록의 ID를 확인할 수 없습니다.');
                setWorkflowDocId(saved.id);
            }
            setWorkflow(next);
            setNotice(success);
            return true;
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '저장하지 못했습니다. 입력 내용은 유지됩니다.');
            return false;
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }, [seeker, seekerKey, loading, corrupt, loadFailed, workflowDocId, addCaseDocument, updateCaseDocument]);

    return {
        workflow, documents, loading, saving, corrupt, loadFailed, error, notice,
        unavailable: !seeker || loading || saving || corrupt || loadFailed,
        save,
        reload: useCallback(() => setReloadKey(current => current + 1), []),
        clearNotice: useCallback(() => setNotice(''), []),
    };
}
