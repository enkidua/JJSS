/**
 * 지원고용 회차 저장소. 새 IndexedDB store를 만들지 않고(D-7 #1) caseDocuments에
 * type 'supported_employment' 문서 하나에 회차 전체를 JSON으로 저장한다.
 * content·seekerName은 localDB의 SENSITIVE_FIELDS라 저장 시 암호화된다(계좌·연락처 포함).
 *
 * 참고: zustand dataStore의 caseDocuments 목록은 여기서 갱신하지 않는다.
 * 현황판 타임라인 등에 바로 보여야 하면 저장 후 화면에서 fetchCaseDocuments()를 다시 부른다.
 */
import { addDoc, deleteDoc, generateId, getById, localTimestamp, query } from '../../config/localDB';
import type { CaseDocument } from '../../types/caseDocument';
import { normalizeCase, parseCase, serializeCase, type SupportedEmploymentCase } from './model';

export { parseCase, serializeCase } from './model';

export const SUPPORTED_EMPLOYMENT_DOC_TYPE = 'supported_employment' as const;

const isCaseDocument = (doc: CaseDocument) => doc.type === SUPPORTED_EMPLOYMENT_DOC_TYPE;

function timestampToIso(value: unknown): string | undefined {
    const seconds = value && typeof value === 'object' ? Number((value as { seconds?: unknown }).seconds) : NaN;
    return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : undefined;
}

function documentToCase(doc: CaseDocument): SupportedEmploymentCase | null {
    const parsed = parseCase(doc.content);
    if (!parsed.ok) {
        // 내용(개인정보)은 로그에 남기지 않는다.
        console.warn('[supportedEmployment] 회차 문서를 읽지 못했습니다.', { id: doc.id, reason: parsed.error });
        return null;
    }
    return {
        ...parsed.case,
        id: doc.id || parsed.case.id,
        createdAt: parsed.case.createdAt || timestampToIso(doc.createdAt),
        updatedAt: parsed.case.updatedAt || timestampToIso(doc.updatedAt),
    };
}

function sortCases(cases: SupportedEmploymentCase[]): SupportedEmploymentCase[] {
    return cases.sort((a, b) =>
        (b.period.start || '').localeCompare(a.period.start || '')
        || b.round - a.round
        || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

/** 모든 회차(최근 시작일 순). 읽을 수 없는 문서는 건너뛴다. */
export async function listCases(): Promise<SupportedEmploymentCase[]> {
    const docs = await query<CaseDocument>('caseDocuments', isCaseDocument);
    return sortCases(docs.map(documentToCase).filter((item): item is SupportedEmploymentCase => item !== null));
}

export async function listCasesForSeeker(seekerId: string): Promise<SupportedEmploymentCase[]> {
    if (!seekerId) return [];
    const docs = await query<CaseDocument>('caseDocuments', doc => isCaseDocument(doc) && doc.seekerId === seekerId);
    return sortCases(docs.map(documentToCase).filter((item): item is SupportedEmploymentCase => item !== null));
}

export async function getCase(id: string): Promise<SupportedEmploymentCase | null> {
    if (!id) return null;
    const doc = await getById<CaseDocument>('caseDocuments', id);
    if (!doc || !isCaseDocument(doc)) return null;
    return documentToCase(doc);
}

/** 새 회차면 id를 만들어 추가, 기존 회차면 교체. 저장된 회차(id·updatedAt 포함)를 돌려준다. */
export async function saveCase(value: SupportedEmploymentCase): Promise<SupportedEmploymentCase> {
    const now = new Date().toISOString();
    const existing = value.id ? await getById<CaseDocument>('caseDocuments', value.id) : undefined;
    if (existing && !isCaseDocument(existing)) {
        throw new Error('같은 ID의 다른 문서가 있어 회차를 저장하지 못했습니다.');
    }
    const id = existing?.id || value.id || generateId();
    const toSave = normalizeCase({ ...value, id, createdAt: value.createdAt || now, updatedAt: now });
    const doc: CaseDocument = {
        ...(existing || {}),
        id,
        seekerId: toSave.seekerId,
        seekerName: toSave.seekerName,
        type: SUPPORTED_EMPLOYMENT_DOC_TYPE,
        content: serializeCase(toSave),
        tab: 'employment',
        source: 'employment',
        organization: existing?.organization || '직업재활기관',
        jobId: toSave.jobId || undefined,
        companyName: toSave.employerName || undefined,
        jobRole: toSave.jobTitle || undefined,
        // 목록 표시용 제목에는 이용자 이름을 넣지 않는다.
        title: `지원고용 ${toSave.round}차`,
        createdAt: existing?.createdAt || localTimestamp(),
        updatedAt: localTimestamp(),
    };
    // addDoc은 같은 id가 있으면 문서 전체를 교체한다.
    await addDoc<CaseDocument>('caseDocuments', doc);
    return toSave;
}

export async function deleteCase(id: string): Promise<void> {
    if (!id) return;
    const doc = await getById<CaseDocument>('caseDocuments', id);
    if (!doc) return;
    if (!isCaseDocument(doc)) throw new Error('지원고용 회차 문서가 아니어서 삭제하지 않았습니다.');
    await deleteDoc('caseDocuments', id);
}
