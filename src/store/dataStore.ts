import { create } from 'zustand';
import * as localDB from '../config/localDB';
import { Seeker, JobOpening } from '../types/matching';
import { CaseDocument } from '../types/caseDocument';
import { Expense } from '../types/budget';
import { safeErrorMetadata } from '../utils/safeError';
import { isSecureStorageUnavailableError } from '../config/crypto';

interface DataState {
    seekers: Seeker[];
    jobs: JobOpening[];
    caseDocuments: CaseDocument[];
    expenses: Expense[];
    loading: boolean;
    initialized: boolean;
    error: string | null;
    fetchData: (force?: boolean) => Promise<void>;
    addSeeker: (seeker: Omit<Seeker, 'id' | 'organization' | 'createdAt'>) => Promise<void>;
    addJob: (job: Omit<JobOpening, 'id' | 'organization' | 'createdAt'>) => Promise<void>;
    updateSeeker: (id: string, data: Partial<Seeker>) => Promise<void>;
    updateJob: (id: string, data: Partial<JobOpening>) => Promise<void>;
    deleteSeeker: (id: string) => Promise<void>;
    deleteJob: (id: string) => Promise<void>;
    fetchCaseDocuments: (seeker: string | Seeker) => Promise<CaseDocument[]>;
    addCaseDocument: (doc: Omit<CaseDocument, 'id' | 'organization' | 'createdAt'>) => Promise<CaseDocument>;
    updateCaseDocument: (id: string, content: string) => Promise<void>;
    saveMatchingOpinion: (doc: {
        seekerId: string;
        seekerName: string;
        jobId: string;
        companyName: string;
        jobRole: string;
        content: string;
    }) => Promise<CaseDocument>;
    deleteCaseDocument: (id: string) => Promise<void>;
    /**
     * 이용자에게 연결된 사례문서만 삭제한다(이용자는 남긴다).
     * 이용자까지 함께 지울 때는 반드시 `deleteSeekerWithDocuments`를 쓴다 —
     * 이 함수 뒤에 `deleteSeeker`를 따로 부르면 중간 실패 시 문서만 사라진다.
     */
    deleteCaseDocumentsForSeeker: (seekerId: string) => Promise<number>;
    /** 이용자와 연결 사례문서를 한 트랜잭션에서 함께 삭제한다(중간 실패로 문서만 사라지는 일이 없다). */
    deleteSeekerWithDocuments: (seekerId: string) => Promise<number>;
    // 예산 관리
    fetchExpenses: () => Promise<Expense[]>;
    addExpense: (expense: Omit<Expense, 'id' | 'organization' | 'createdAt' | 'createdBy'>) => Promise<Expense>;
    updateExpense: (id: string, data: Partial<Expense>) => Promise<void>;
    deleteExpense: (id: string) => Promise<void>;
}

/** 보안 저장소를 쓸 수 없어 저장을 막은 경우에는 그 안내를, 아니면 기본 문구를 보여 준다. */
function storageErrorMessage(error: unknown, fallback: string): string {
    return isSecureStorageUnavailableError(error) ? error.message : fallback;
}

function addLookupKey(keys: Set<string>, value: unknown) {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (text) keys.add(text);
}

function getPrimarySeekerKeys(seeker: string | Seeker, seekers: Seeker[] = []): Set<string> {
    const keys = new Set<string>();
    if (typeof seeker === 'string') {
        const matched = seekers.find(item => item.id === seeker || item.seekerId === seeker);
        if (matched) {
            addLookupKey(keys, matched.id);
            addLookupKey(keys, matched.seekerId);
        } else {
            addLookupKey(keys, seeker);
        }
        return keys;
    }

    addLookupKey(keys, seeker.id);
    addLookupKey(keys, seeker.seekerId);
    return keys;
}

function getCaseDocumentPrimaryKeys(doc: Record<string, any>): Set<string> {
    const keys = new Set<string>();
    addLookupKey(keys, doc.seekerId);
    addLookupKey(keys, doc.clientId);
    addLookupKey(keys, doc.userId);
    addLookupKey(keys, doc.traineeId);
    return keys;
}

function getSeekerName(seeker: string | Seeker, seekers: Seeker[] = []): string {
    if (typeof seeker !== 'string') return seeker.name || '';
    const matched = seekers.find(item => item.id === seeker || item.seekerId === seeker);
    return matched?.name || '';
}

function isUniqueSeekerName(name: string, seekers: Seeker[]): boolean {
    if (!name) return false;
    return seekers.filter(item => item.name === name).length === 1;
}

function getCaseDocumentNames(doc: Record<string, any>): Set<string> {
    const names = new Set<string>();
    addLookupKey(names, doc.seekerName);
    addLookupKey(names, doc.clientName);
    addLookupKey(names, doc.name);
    return names;
}

function getCanonicalSeekerId(seeker: Seeker): string {
    return seeker.id || seeker.seekerId || '';
}

function resolveCaseDocumentSeeker(doc: CaseDocument, seekers: Seeker[]): Seeker | null {
    const docPrimaryKeys = getCaseDocumentPrimaryKeys(doc as any);
    if (docPrimaryKeys.size > 0) {
        const primaryMatch = seekers.find(seeker => {
            const seekerKeys = getPrimarySeekerKeys(seeker);
            return [...docPrimaryKeys].some(key => seekerKeys.has(key));
        });
        if (primaryMatch) return primaryMatch;
    }

    const docNames = getCaseDocumentNames(doc as any);
    if (docNames.size === 0) return null;
    const matches = seekers.filter(seeker => docNames.has(seeker.name));
    return matches.length === 1 ? matches[0] : null;
}

/**
 * 한 이용자에게 연결된 사례문서 ID를 모은다.
 * 문서 목록(fetchCaseDocuments)에 보이던 것과 같은 기준을 쓴다 — 지우는 범위와 보이는 범위가 달라지면 안 된다.
 */
async function collectSeekerDocumentIds(seekerId: string, seekers: Seeker[]): Promise<string[]> {
    const seekerKeys = getPrimarySeekerKeys(seekerId, seekers);
    const matchedSeeker = seekers.find(item => item.id === seekerId || item.seekerId === seekerId);
    const seekerName = matchedSeeker?.name || '';
    const allowNameFallback = Boolean(matchedSeeker) && isUniqueSeekerName(seekerName, seekers);
    const docs = await localDB.query<CaseDocument>('caseDocuments', (d) => {
        const docKeys = getCaseDocumentPrimaryKeys(d as any);
        if ([...docKeys].some(key => seekerKeys.has(key))) return true;
        if (!allowNameFallback || docKeys.size > 0) return false;
        return getCaseDocumentNames(d as any).has(seekerName);
    });
    return docs.map(doc => doc.id).filter((id): id is string => Boolean(id));
}

async function migrateCaseDocumentSeekerIds(seekers: Seeker[]) {
    if (seekers.length === 0) return;
    const docs = await localDB.getAll<CaseDocument>('caseDocuments');
    await Promise.all(docs.map(async (doc) => {
        if (!doc.id) return;
        const matched = resolveCaseDocumentSeeker(doc, seekers);
        if (!matched) return;
        const canonicalSeekerId = getCanonicalSeekerId(matched);
        if (!canonicalSeekerId || doc.seekerId === canonicalSeekerId) return;
        await localDB.updateDoc<CaseDocument>('caseDocuments', doc.id, {
            seekerId: canonicalSeekerId,
            seekerName: doc.seekerName || matched.name,
        } as Partial<CaseDocument>);
    }));
}

export const useDataStore = create<DataState>()((set, get) => ({
    seekers: [],
    jobs: [],
    caseDocuments: [],
    expenses: [],
    loading: false,
    initialized: false,
    error: null,

    fetchData: async (force = false) => {
        if (get().initialized && !force) return;
        
        set({ loading: true, error: null });
        try {
            const seekers = await localDB.getAll<Seeker>('seekers');
            const jobs = await localDB.getAll<JobOpening>('jobs');
            set({ seekers, jobs, loading: false, initialized: true });
            try {
                await migrateCaseDocumentSeekerIds(seekers);
            } catch (migrationError) {
                console.warn('[DataStore] 사례문서 식별자 보강 마이그레이션 실패:', safeErrorMetadata(migrationError, 'case-document-id-migration'));
            }
        } catch (error: any) {
            console.error('Error fetching data:', safeErrorMetadata(error, 'data-fetch'));
            set({ error: '데이터를 불러오는 중 오류가 발생했습니다.', loading: false });
        }
    },

    addSeeker: async (seekerData) => {
        set({ loading: true, error: null });
        try {
            const newSeeker = {
                ...seekerData,
                organization: '직업재활기관',
                createdAt: localDB.localTimestamp() as any,
            };
            const saved = await localDB.addDoc<Seeker>('seekers', newSeeker as Seeker);
            set({
                seekers: [...get().seekers, saved],
                loading: false,
            });
        } catch (error: any) {
            console.error('Add Seeker Error:', safeErrorMetadata(error, 'seeker-add'));
            set({ error: storageErrorMessage(error, '구직자 등록 중 오류가 발생했습니다.'), loading: false });
            throw error;
        }
    },


    addJob: async (jobData) => {
        set({ loading: true, error: null });
        try {
            const newJob = {
                ...jobData,
                organization: '직업재활기관',
                createdAt: localDB.localTimestamp() as any,
            };
            const saved = await localDB.addDoc<JobOpening>('jobs', newJob as JobOpening);
            set({
                jobs: [...get().jobs, saved],
                loading: false,
            });
        } catch (error: any) {
            console.error('Add Job Error:', safeErrorMetadata(error, 'job-add'));
            set({ error: storageErrorMessage(error, '구인공고 등록 중 오류가 발생했습니다.'), loading: false });
            throw error;
        }
    },

    updateSeeker: async (id: string, data: Partial<Seeker>) => {
        if (!id) throw new Error('수정할 이용자 ID가 없습니다.');
        set({ loading: true, error: null });
        try {
            const current = get().seekers.find(seeker => seeker.id === id);
            if (!current) throw new Error('수정할 이용자 정보를 찾을 수 없습니다.');
            const protectedData = {
                ...data,
                id,
                organization: current.organization || '직업재활기관',
                createdAt: current.createdAt,
                updatedAt: localDB.localTimestamp() as any,
            } as Partial<Seeker>;
            await localDB.updateDoc<Seeker>('seekers', id, protectedData);
            set({
                seekers: get().seekers.map(seeker => seeker.id === id ? { ...seeker, ...protectedData } as Seeker : seeker),
                loading: false,
            });
        } catch (error: any) {
            console.error('Update Seeker Error:', safeErrorMetadata(error, 'seeker-update'));
            const message = storageErrorMessage(error, '이용자 정보 수정 중 오류가 발생했습니다.');
            set({ error: message, loading: false });
            throw new Error(message);
        }
    },

    updateJob: async (id: string, data: Partial<JobOpening>) => {
        if (!id) throw new Error('수정할 사업체/구인 ID가 없습니다.');
        set({ loading: true, error: null });
        try {
            const current = get().jobs.find(job => job.id === id);
            if (!current) throw new Error('수정할 사업체/구인 정보를 찾을 수 없습니다.');
            const protectedData = {
                ...data,
                id,
                organization: current.organization || '직업재활기관',
                createdAt: current.createdAt,
                updatedAt: localDB.localTimestamp() as any,
            } as Partial<JobOpening>;
            await localDB.updateDoc<JobOpening>('jobs', id, protectedData);
            set({
                jobs: get().jobs.map(job => job.id === id ? { ...job, ...protectedData } as JobOpening : job),
                loading: false,
            });
        } catch (error: any) {
            console.error('Update Job Error:', safeErrorMetadata(error, 'job-update'));
            const message = storageErrorMessage(error, '사업체/구인 정보 수정 중 오류가 발생했습니다.');
            set({ error: message, loading: false });
            throw new Error(message);
        }
    },

    deleteSeeker: async (id: string) => {
        try {
            await localDB.deleteDoc('seekers', id);
            set({ seekers: get().seekers.filter(s => s.id !== id) });
        } catch (error: any) {
            console.error('Delete Seeker Error:', safeErrorMetadata(error, 'seeker-delete'));
            const message = '이용자 삭제 중 오류가 발생했습니다.';
            set({ error: message });
            throw new Error(message);
        }
    },

    deleteJob: async (id: string) => {
        try {
            await localDB.deleteDoc('jobs', id);
            set({ jobs: get().jobs.filter(j => j.id !== id) });
        } catch (error: any) {
            console.error('Delete Job Error:', safeErrorMetadata(error, 'job-delete'));
            const message = '사업체 삭제 중 오류가 발생했습니다.';
            set({ error: message });
            throw new Error(message);
        }
    },

    fetchCaseDocuments: async (seeker: string | Seeker) => {
        try {
            const seekers = get().seekers;
            const seekerKeys = getPrimarySeekerKeys(seeker, seekers);
            const seekerName = getSeekerName(seeker, seekers);
            const allowNameFallback = isUniqueSeekerName(seekerName, seekers);
            const docs = await localDB.query<CaseDocument>('caseDocuments', (d) => {
                const docKeys = getCaseDocumentPrimaryKeys(d as any);
                const primaryMatched = [...docKeys].some(key => seekerKeys.has(key));
                if (primaryMatched) return true;
                if (!allowNameFallback) return false;
                const docNames = getCaseDocumentNames(d as any);
                return docKeys.size === 0 && docNames.has(seekerName);
            });
            // 클라이언트 사이드 정렬 (createdAt 기준 내림차순)
            docs.sort((a, b) => {
                const getTime = (ts: any): number => {
                    if (!ts) return 0;
                    if (ts.seconds) return ts.seconds;
                    if (typeof ts === 'string') return new Date(ts).getTime() / 1000;
                    if (typeof ts === 'number') return ts;
                    return 0;
                };
                return getTime(b.createdAt) - getTime(a.createdAt);
            });
            set({ caseDocuments: docs });
            return docs;
        } catch (error: any) {
            console.error('[fetchCaseDocuments] Error:', safeErrorMetadata(error, 'case-document-fetch'));
            const message = '문서를 불러오는 중 오류가 발생했습니다. 기존 데이터는 삭제하지 않았습니다.';
            set({ error: message });
            throw new Error(message);
        }
    },

    addCaseDocument: async (docData) => {
        try {
            const newDoc = {
                ...docData,
                organization: '직업재활기관',
                createdAt: localDB.localTimestamp(),
            };
            const saved = await localDB.addDoc<CaseDocument>('caseDocuments', newDoc as CaseDocument);
            set({ caseDocuments: [saved, ...get().caseDocuments] });
            return saved;
        } catch (error: any) {
            console.error('[addCaseDocument] Error:', safeErrorMetadata(error, 'case-document-add'));
            const message = storageErrorMessage(error, '문서 저장 중 오류가 발생했습니다.');
            set({ error: message });
            throw new Error(error?.message || message);
        }
    },

    updateCaseDocument: async (id: string, content: string) => {
        try {
            const updatedAt = localDB.localTimestamp();
            await localDB.updateDoc('caseDocuments', id, { content, updatedAt } as any);
            set(state => ({
                caseDocuments: state.caseDocuments.map(d =>
                    d.id === id ? { ...d, content, updatedAt } : d
                )
            }));
        } catch (error: any) {
            console.error('Update CaseDocument Error:', safeErrorMetadata(error, 'case-document-update'));
            const message = storageErrorMessage(error, '문서 수정 중 오류가 발생했습니다.');
            set({ error: message });
            throw new Error(error?.message || message);
        }
    },

    saveMatchingOpinion: async (docData) => {
        try {
            const now = localDB.localTimestamp();
            const existing = await localDB.query<CaseDocument>('caseDocuments', (doc) => {
                const candidate = doc as any;
                const legacyJobMatched = !candidate.jobId
                    && candidate.companyName === docData.companyName
                    && candidate.jobRole === docData.jobRole;
                return candidate.source === 'matching'
                    && candidate.type === 'matching_opinion'
                    && candidate.seekerId === docData.seekerId
                    && (candidate.jobId === docData.jobId || legacyJobMatched);
            });

            if (existing[0]?.id) {
                const updated: Partial<CaseDocument> = {
                    content: docData.content,
                    seekerName: docData.seekerName,
                    companyName: docData.companyName,
                    jobRole: docData.jobRole,
                    jobId: docData.jobId,
                    updatedAt: now,
                };
                await localDB.updateDoc<CaseDocument>('caseDocuments', existing[0].id, updated);
                const saved = { ...existing[0], ...updated } as CaseDocument;
                set(state => ({
                    caseDocuments: state.caseDocuments.some(d => d.id === saved.id)
                        ? state.caseDocuments.map(d => d.id === saved.id ? saved : d)
                        : [saved, ...state.caseDocuments],
                }));
                return saved;
            }

            const newDoc: CaseDocument = {
                seekerId: docData.seekerId,
                seekerName: docData.seekerName,
                type: 'matching_opinion',
                content: docData.content,
                tab: 'employment',
                organization: '직업재활기관',
                createdAt: now,
                updatedAt: now,
                source: 'matching',
                jobId: docData.jobId,
                companyName: docData.companyName,
                jobRole: docData.jobRole,
            };
            const saved = await localDB.addDoc<CaseDocument>('caseDocuments', newDoc);
            set({ caseDocuments: [saved, ...get().caseDocuments] });
            return saved;
        } catch (error: any) {
            console.error('[saveMatchingOpinion] Error:', safeErrorMetadata(error, 'matching-opinion-save'));
            const message = storageErrorMessage(error, '매칭 의견 저장 중 오류가 발생했습니다.');
            set({ error: message });
            throw new Error(error?.message || message);
        }
    },

    deleteCaseDocument: async (id: string) => {
        try {
            await localDB.deleteDoc('caseDocuments', id);
            set({ caseDocuments: get().caseDocuments.filter(d => d.id !== id) });
        } catch (error: any) {
            console.error('Delete CaseDocument Error:', safeErrorMetadata(error, 'case-document-delete'));
            const message = '문서 삭제 중 오류가 발생했습니다.';
            set({ error: message });
            throw new Error(message);
        }
    },

    deleteSeekerWithDocuments: async (seekerId: string) => {
        if (!seekerId) throw new Error('삭제할 이용자 ID가 없습니다.');
        try {
            const ids = await collectSeekerDocumentIds(seekerId, get().seekers);
            await localDB.deleteSeekerWithDocuments(seekerId, ids);
            const deleted = new Set(ids);
            set(state => ({
                seekers: state.seekers.filter(item => item.id !== seekerId),
                caseDocuments: state.caseDocuments.filter(doc => !doc.id || !deleted.has(doc.id)),
            }));
            return ids.length;
        } catch (error: any) {
            console.error('Delete Seeker With Documents Error:', safeErrorMetadata(error, 'seeker-delete-cascade'));
            const message =
                error?.message || '이용자와 사례문서를 삭제하는 중 오류가 발생했습니다. 아무것도 삭제하지 않았습니다.';
            set({ error: message });
            throw new Error(message);
        }
    },

    deleteCaseDocumentsForSeeker: async (seekerId: string) => {
        if (!seekerId) throw new Error('삭제할 이용자 ID가 없습니다.');
        try {
            const ids = await collectSeekerDocumentIds(seekerId, get().seekers);
            await localDB.deleteDocs('caseDocuments', ids);
            const deleted = new Set(ids);
            set(state => ({ caseDocuments: state.caseDocuments.filter(d => !d.id || !deleted.has(d.id)) }));
            return ids.length;
        } catch (error: any) {
            console.error('Delete Seeker CaseDocuments Error:', safeErrorMetadata(error, 'case-document-bulk-delete'));
            const message = '이용자의 문서를 삭제하는 중 오류가 발생했습니다. 문서는 삭제되지 않았습니다.';
            set({ error: message });
            throw new Error(message);
        }
    },

    // ── 예산 관리 ──

    fetchExpenses: async () => {
        try {
            const expenses = await localDB.getAll<Expense>('expenses');
            expenses.sort((a, b) => {
                const ta = (a.createdAt as any)?.seconds || 0;
                const tb = (b.createdAt as any)?.seconds || 0;
                return tb - ta;
            });
            set({ expenses });
            return expenses;
        } catch (error: any) {
            console.error('Fetch Expenses Error:', safeErrorMetadata(error, 'expense-fetch'));
            const message = '지출 내역을 불러오는 중 오류가 발생했습니다.';
            set({ error: message });
            throw new Error(message);
        }
    },

    addExpense: async (expenseData) => {
        try {
            const newExpense = {
                ...expenseData,
                organization: '직업재활기관',
                createdBy: 'local-user',
                createdAt: localDB.localTimestamp(),
            };
            const saved = await localDB.addDoc<Expense>('expenses', newExpense as Expense);
            set({ expenses: [saved, ...get().expenses] });
            return saved;
        } catch (error: any) {
            console.error('Add Expense Error:', safeErrorMetadata(error, 'expense-add'));
            const message = storageErrorMessage(error, '지출 내역 저장 중 오류가 발생했습니다.');
            set({ error: message });
            throw new Error(error?.message || message);
        }
    },

    updateExpense: async (id: string, data: Partial<Expense>) => {
        try {
            await localDB.updateDoc('expenses', id, data);
            set(state => ({
                expenses: state.expenses.map(e =>
                    e.id === id ? { ...e, ...data } : e
                )
            }));
        } catch (error: any) {
            console.error('Update Expense Error:', safeErrorMetadata(error, 'expense-update'));
            const message = storageErrorMessage(error, '지출 내역 수정 중 오류가 발생했습니다.');
            set({ error: message });
            throw new Error(error?.message || message);
        }
    },

    deleteExpense: async (id: string) => {
        try {
            await localDB.deleteDoc('expenses', id);
            set({ expenses: get().expenses.filter(e => e.id !== id) });
        } catch (error: any) {
            console.error('Delete Expense Error:', safeErrorMetadata(error, 'expense-delete'));
            const message = '지출 내역 삭제 중 오류가 발생했습니다.';
            set({ error: message });
            throw new Error(message);
        }
    },
}));

// (자동 로드 코드 제거됨 - Layout 컴포넌트에서 초기화 제어)

// ─── 저장 데이터 일괄 재암호화 (앱 시작 후 백그라운드) ───

const AT_REST_MIGRATION_DELAY_MS = 1_500;
let atRestMigrationStarted: Promise<localDB.AtRestMigrationResult | null> | null = null;

/**
 * 초기 화면을 띄운 뒤 백그라운드에서 한 번, 수정되지 않은 오래된 레코드까지 현재 형식으로 다시 암호화한다.
 * 화면 표시를 막지 않으며, 실패해도 기존 데이터는 그대로이고 다음 실행 때 다시 시도한다.
 * 값은 복호화하면 같으므로 메모리 상태를 다시 불러올 필요가 없다.
 * 로그에는 개수·상태 같은 메타데이터만 남긴다(개인정보·암호문 없음).
 */
export function startAtRestMigration(delayMs = AT_REST_MIGRATION_DELAY_MS): Promise<localDB.AtRestMigrationResult | null> {
    if (atRestMigrationStarted) return atRestMigrationStarted;
    atRestMigrationStarted = new Promise<void>(resolve => setTimeout(resolve, delayMs))
        .then(() => localDB.migrateAtRestEncryption())
        .then(result => {
            const summary = {
                status: result.status,
                ...(result.reason ? { reason: result.reason } : {}),
                ...(result.scheme ? { scheme: result.scheme } : {}),
                scanned: result.scanned,
                updatedRecords: result.updatedRecords,
                convertedFields: result.convertedFields,
                unreadableFields: result.unreadableFields,
                failedRecords: result.failedRecords,
            };
            if (result.status === 'failed') {
                console.info('[DataStore] 저장 데이터 암호화 점검을 마치지 못했습니다. 기존 데이터는 그대로이며 다음 실행 때 다시 시도합니다.', {
                    ...summary,
                    ...(result.error ? { error: safeErrorMetadata(result.error, 'at-rest-migration') } : {}),
                });
            } else if (result.updatedRecords > 0 || result.unreadableFields > 0) {
                console.info('[DataStore] 저장 데이터 암호화 점검 완료', summary);
            }
            return result;
        })
        .catch(error => {
            console.info('[DataStore] 저장 데이터 암호화 점검을 마치지 못했습니다. 다음 실행 때 다시 시도합니다.', safeErrorMetadata(error, 'at-rest-migration'));
            return null;
        });
    return atRestMigrationStarted;
}
