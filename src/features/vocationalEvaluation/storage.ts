/**
 * 직업평가 워크벤치 저장소.
 * 새 IndexedDB store를 만들지 않고 caseDocuments에 JSON 문서로 저장한다(계획서 §6).
 * caseDocuments는 최소 메타데이터(id·종류·탭·시각)를 뺀 필드가 localDB에서 암호화되므로
 * 회차·세션 JSON(이름·수행량·메모 포함)도 암호화되어 저장된다.
 *
 * zustand dataStore의 caseDocuments 목록은 여기서 갱신하지 않는다.
 * 현황판 타임라인 등에 바로 보여야 하면 저장 후 화면에서 fetchCaseDocuments()를 다시 부른다.
 */
import { addDoc, deleteDoc, deleteDocs, getById, localTimestamp, query } from '../../config/localDB';
import type { CaseDocument } from '../../types/caseDocument';
import { storedTimestampToIso as timestampToIso } from '../../utils/date';
import { normalizeEpisode, parseEpisode, serializeEpisode, type EvaluationEpisode } from './model/episode';
import { normalizeSession, parseSession, serializeSession } from './model/sessionSerialization';
import { normalizeReport, parseReport, serializeReport } from './report/serialization';
import { normalizeSourceDocument, parseSourceDocument, serializeSourceDocument } from './sourceDocument/record';
import {
    normalizeAnalysisDocument,
    parseAnalysisDocument,
    serializeAnalysisDocument,
    type AnalysisDocumentRecord,
} from './analysisDocument/model';
import { findTestPlugin } from './tests/registry';
import type { EvaluationReport } from './report/model';
import type { SourceDocumentRecord } from './sourceDocument/types';
import type { TestSession } from './model/types';

export const VE_EPISODE_DOC_TYPE = 've_episode' as const;
export const VE_SESSION_DOC_TYPE = 've_session' as const;
export const VE_SOURCE_DOCUMENT_DOC_TYPE = 've_source_document' as const;
export const VE_REPORT_DOC_TYPE = 've_report' as const;
export const VE_ANALYSIS_DOC_TYPE = 've_analysis_document' as const;

const ORGANIZATION = '직업재활기관';

/* ── 평가 회차 ─────────────────────────────────────────────────── */

function documentToEpisode(doc: CaseDocument): EvaluationEpisode | null {
    const parsed = parseEpisode(doc.content);
    if (!parsed.ok) {
        // 내용(개인정보)은 로그에 남기지 않는다.
        console.warn('[vocationalEvaluation] 평가 회차 문서를 읽지 못했습니다.', { id: doc.id, reason: parsed.error });
        return null;
    }
    return {
        ...parsed.episode,
        id: doc.id || parsed.episode.id,
        createdAt: parsed.episode.createdAt || timestampToIso(doc.createdAt),
        updatedAt: parsed.episode.updatedAt || timestampToIso(doc.updatedAt),
    };
}

function sortEpisodes(episodes: EvaluationEpisode[]): EvaluationEpisode[] {
    return episodes.sort(
        (a, b) =>
            (b.evaluationDate || '').localeCompare(a.evaluationDate || '') ||
            (b.updatedAt || '').localeCompare(a.updatedAt || ''),
    );
}

export async function listEpisodes(): Promise<EvaluationEpisode[]> {
    const docs = await query<CaseDocument>('caseDocuments', doc => doc.type === VE_EPISODE_DOC_TYPE);
    return sortEpisodes(docs.map(documentToEpisode).filter((item): item is EvaluationEpisode => item !== null));
}

export async function listEpisodesForSeeker(seekerId: string): Promise<EvaluationEpisode[]> {
    if (!seekerId) return [];
    const docs = await query<CaseDocument>(
        'caseDocuments',
        doc => doc.type === VE_EPISODE_DOC_TYPE && doc.seekerId === seekerId,
    );
    return sortEpisodes(docs.map(documentToEpisode).filter((item): item is EvaluationEpisode => item !== null));
}

export async function getEpisode(id: string): Promise<EvaluationEpisode | null> {
    if (!id) return null;
    const doc = await getById<CaseDocument>('caseDocuments', id);
    if (!doc || doc.type !== VE_EPISODE_DOC_TYPE) return null;
    return documentToEpisode(doc);
}

export async function saveEpisode(value: EvaluationEpisode): Promise<EvaluationEpisode> {
    const now = new Date().toISOString();
    const existing = value.id ? await getById<CaseDocument>('caseDocuments', value.id) : undefined;
    if (existing && existing.type !== VE_EPISODE_DOC_TYPE) {
        throw new Error('같은 ID의 다른 문서가 있어 평가 회차를 저장하지 못했습니다.');
    }
    const toSave = normalizeEpisode({ ...value, createdAt: value.createdAt || now, updatedAt: now });
    const doc: CaseDocument = {
        ...(existing || {}),
        id: toSave.id,
        seekerId: toSave.seekerId,
        seekerName: toSave.seekerName,
        type: VE_EPISODE_DOC_TYPE,
        content: serializeEpisode(toSave),
        tab: 'case',
        source: 'evaluation',
        organization: existing?.organization || ORGANIZATION,
        // 목록 표시용 제목에는 이용자 이름을 넣지 않는다.
        title: toSave.title,
        createdAt: existing?.createdAt || localTimestamp(),
        updatedAt: localTimestamp(),
    };
    await addDoc<CaseDocument>('caseDocuments', doc);
    return toSave;
}

const VE_CHILD_DOC_TYPES = new Set<string>([
    VE_SESSION_DOC_TYPE,
    VE_SOURCE_DOCUMENT_DOC_TYPE,
    VE_ANALYSIS_DOC_TYPE,
    VE_REPORT_DOC_TYPE,
]);

/**
 * 문서 본문(JSON)에서 소속 회차 id만 관대하게 읽는다. 형식 검사·지문 검사는 하지 않는다 —
 * 엄격하게 읽다 실패한 문서(지문이 맞지 않는 보고서, 버전이 다른 분석지 등)도 소속은 알아내야
 * 회차를 지울 때 함께 지울 수 있다(남기면 암호화된 개인정보 문서가 영구히 남는다).
 */
function looseEpisodeId(content: unknown): string | null {
    if (typeof content !== 'string' || !content) return null;
    try {
        const parsed = JSON.parse(content) as { episodeId?: unknown };
        return typeof parsed?.episodeId === 'string' && parsed.episodeId ? parsed.episodeId : null;
    } catch {
        return null;
    }
}

/** 회차에 속한 하위 문서(세션·결과지·분석지·보고서) id 전부 — 읽기 실패한 문서 포함 */
async function childDocumentIdsForEpisode(episodeId: string, seekerId?: string): Promise<{ ids: string[]; unknownOwnerCount: number }> {
    const docs = await query<CaseDocument>('caseDocuments', doc => VE_CHILD_DOC_TYPES.has(String(doc.type)));
    const ids = docs.filter(doc => looseEpisodeId(doc.content) === episodeId).map(doc => doc.id).filter(Boolean) as string[];
    // 본문을 읽지 못해 어느 회차 것인지 모르는 하위 문서. 이 이용자 것이거나 이용자도 읽지 못했으면 이 회차 것일 수 있다.
    const unknownOwnerCount = docs.filter(doc =>
        looseEpisodeId(doc.content) === null && (!doc.seekerId || !seekerId || doc.seekerId === seekerId),
    ).length;
    return { ids, unknownOwnerCount };
}

/**
 * 회차에 저장된 보고서 중 가장 높은 버전 번호(읽기 실패한 보고서 포함).
 * 화면 목록에서 빠진 보고서가 있어도 새 버전 번호가 겹치지 않게 한다.
 */
export async function maxStoredReportVersion(episodeId: string): Promise<number> {
    if (!episodeId) return 0;
    const docs = await query<CaseDocument>('caseDocuments', doc => doc.type === VE_REPORT_DOC_TYPE);
    let max = 0;
    for (const doc of docs) {
        if (typeof doc.content !== 'string') continue;
        try {
            const parsed = JSON.parse(doc.content) as { episodeId?: unknown; reportVersion?: unknown };
            if (parsed?.episodeId !== episodeId) continue;
            const version = Number(parsed.reportVersion);
            if (Number.isFinite(version) && version > max) max = Math.floor(version);
        } catch {
            // 본문을 읽지 못한 문서는 버전을 알 수 없다.
        }
    }
    return max;
}

/**
 * 회차와 그 회차에 속한 하위 문서를 **한 번에(한 트랜잭션)** 지운다.
 * 하나씩 지우다 중간에 실패하면 회차만 남고 일부 기록이 사라진 어중간한 상태가 되므로, 전부 지우거나 하나도 지우지 않는다.
 */
export async function deleteEpisode(id: string): Promise<void> {
    if (!id) return;
    const doc = await getById<CaseDocument>('caseDocuments', id);
    if (!doc) return;
    if (doc.type !== VE_EPISODE_DOC_TYPE) throw new Error('평가 회차 문서가 아니어서 삭제하지 않았습니다.');
    const { ids: childIds, unknownOwnerCount } = await childDocumentIdsForEpisode(id, doc.seekerId);
    // 읽지 못한 하위 문서가 이 회차 것일 수 있으면 지우지 않는다. 회차만 지우면 그 문서는 어느 화면에서도
    // 보이지 않는 개인정보로 남는다(보안 키 복구 뒤 다시 지우면 함께 지워진다).
    if (unknownOwnerCount > 0) {
        throw new Error(`이 이용자의 평가 기록 ${unknownOwnerCount}건을 읽지 못해 회차를 삭제하지 않았습니다. 보안 키를 복구한 뒤 다시 삭제해 주세요.`);
    }
    await deleteDocs('caseDocuments', [...new Set([...childIds, id])]);
}

/* ── 검사 세션 ─────────────────────────────────────────────────── */

function documentToSession(doc: CaseDocument): TestSession | null {
    const parsed = parseSession(doc.content);
    if (!parsed.ok) {
        console.warn('[vocationalEvaluation] 검사 세션 문서를 읽지 못했습니다.', { id: doc.id, reason: parsed.error });
        return null;
    }
    return { ...parsed.session, id: doc.id || parsed.session.id };
}

export async function listSessionsForEpisode(episodeId: string): Promise<TestSession[]> {
    if (!episodeId) return [];
    const docs = await query<CaseDocument>('caseDocuments', doc => doc.type === VE_SESSION_DOC_TYPE);
    return docs
        .map(documentToSession)
        .filter((item): item is TestSession => item !== null && item.episodeId === episodeId)
        .sort((a, b) => (a.startedAt || '').localeCompare(b.startedAt || ''));
}

export async function getSession(id: string): Promise<TestSession | null> {
    if (!id) return null;
    const doc = await getById<CaseDocument>('caseDocuments', id);
    if (!doc || doc.type !== VE_SESSION_DOC_TYPE) return null;
    return documentToSession(doc);
}

export async function saveSession(value: TestSession): Promise<TestSession> {
    const existing = value.id ? await getById<CaseDocument>('caseDocuments', value.id) : undefined;
    if (existing && existing.type !== VE_SESSION_DOC_TYPE) {
        throw new Error('같은 ID의 다른 문서가 있어 검사 세션을 저장하지 못했습니다.');
    }
    // 저장 요청이 엇갈려 도착해도 예전 상태가 최신을 덮지 않게 한다(revision 비교).
    if (existing) {
        const stored = parseSession(existing.content);
        if (stored.ok && stored.session.revision > value.revision) {
            throw new Error('더 최신 검사 기록이 이미 저장되어 있습니다. 화면을 새로 고친 뒤 다시 시도해 주세요.');
        }
    }
    const toSave = normalizeSession(value);
    const testName = findTestPlugin(toSave.testPluginId)?.manifest.shortName ?? '검사';
    const doc: CaseDocument = {
        ...(existing || {}),
        id: toSave.id,
        seekerId: toSave.seekerId,
        seekerName: toSave.seekerName,
        type: VE_SESSION_DOC_TYPE,
        content: serializeSession(toSave),
        tab: 'case',
        source: 'evaluation',
        organization: existing?.organization || ORGANIZATION,
        title: `${testName} 검사 기록`,
        createdAt: existing?.createdAt || localTimestamp(),
        updatedAt: localTimestamp(),
    };
    await addDoc<CaseDocument>('caseDocuments', doc);
    return toSave;
}

export async function deleteSession(id: string): Promise<void> {
    if (!id) return;
    const doc = await getById<CaseDocument>('caseDocuments', id);
    if (!doc) return;
    if (doc.type !== VE_SESSION_DOC_TYPE) throw new Error('검사 세션 문서가 아니어서 삭제하지 않았습니다.');
    await deleteDoc('caseDocuments', id);
}

/* ── 공식 결과지 ───────────────────────────────────────────────── */

function documentToSourceDocument(doc: CaseDocument): SourceDocumentRecord | null {
    const parsed = parseSourceDocument(doc.content);
    if (!parsed.ok) {
        console.warn('[vocationalEvaluation] 결과지 기록을 읽지 못했습니다.', { id: doc.id, reason: parsed.error });
        return null;
    }
    return { ...parsed.document, id: doc.id || parsed.document.id };
}

export async function listSourceDocumentsForEpisode(episodeId: string): Promise<SourceDocumentRecord[]> {
    if (!episodeId) return [];
    const docs = await query<CaseDocument>('caseDocuments', doc => doc.type === VE_SOURCE_DOCUMENT_DOC_TYPE);
    return docs
        .map(documentToSourceDocument)
        .filter((item): item is SourceDocumentRecord => item !== null && item.episodeId === episodeId)
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export async function saveSourceDocument(value: SourceDocumentRecord): Promise<SourceDocumentRecord> {
    const now = new Date().toISOString();
    const existing = value.id ? await getById<CaseDocument>('caseDocuments', value.id) : undefined;
    if (existing && existing.type !== VE_SOURCE_DOCUMENT_DOC_TYPE) {
        throw new Error('같은 ID의 다른 문서가 있어 결과지 기록을 저장하지 못했습니다.');
    }
    const toSave = normalizeSourceDocument({ ...value, createdAt: value.createdAt || now, updatedAt: now });
    const doc: CaseDocument = {
        ...(existing || {}),
        id: toSave.id,
        seekerId: toSave.seekerId,
        seekerName: toSave.seekerName,
        type: VE_SOURCE_DOCUMENT_DOC_TYPE,
        content: serializeSourceDocument(toSave),
        tab: 'case',
        source: 'evaluation',
        organization: existing?.organization || ORGANIZATION,
        title: '공식 결과지 확인값',
        createdAt: existing?.createdAt || localTimestamp(),
        updatedAt: localTimestamp(),
    };
    await addDoc<CaseDocument>('caseDocuments', doc);
    return toSave;
}

export async function deleteSourceDocument(id: string): Promise<void> {
    if (!id) return;
    const doc = await getById<CaseDocument>('caseDocuments', id);
    if (!doc) return;
    if (doc.type !== VE_SOURCE_DOCUMENT_DOC_TYPE) throw new Error('결과지 기록 문서가 아니어서 삭제하지 않았습니다.');
    await deleteDoc('caseDocuments', id);
}

/* ── 분석지(그 밖의 검사 결과지) ─────────────────────────────── */

function documentToAnalysis(doc: CaseDocument): AnalysisDocumentRecord | null {
    const parsed = parseAnalysisDocument(doc.content);
    if (!parsed.ok) {
        console.warn('[vocationalEvaluation] 분석지 기록을 읽지 못했습니다.', { id: doc.id, reason: parsed.error });
        return null;
    }
    return { ...parsed.record, id: doc.id || parsed.record.id };
}

export async function listAnalysisDocumentsForEpisode(episodeId: string): Promise<AnalysisDocumentRecord[]> {
    if (!episodeId) return [];
    const docs = await query<CaseDocument>('caseDocuments', doc => doc.type === VE_ANALYSIS_DOC_TYPE);
    return docs
        .map(documentToAnalysis)
        .filter((item): item is AnalysisDocumentRecord => item !== null && item.episodeId === episodeId)
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

export async function saveAnalysisDocument(value: AnalysisDocumentRecord): Promise<AnalysisDocumentRecord> {
    const now = new Date().toISOString();
    const existing = value.id ? await getById<CaseDocument>('caseDocuments', value.id) : undefined;
    if (existing && existing.type !== VE_ANALYSIS_DOC_TYPE) {
        throw new Error('같은 ID의 다른 문서가 있어 분석지 기록을 저장하지 못했습니다.');
    }
    const toSave = normalizeAnalysisDocument({ ...value, createdAt: value.createdAt || now, updatedAt: now });
    const doc: CaseDocument = {
        ...(existing || {}),
        id: toSave.id,
        seekerId: toSave.seekerId,
        seekerName: toSave.seekerName,
        type: VE_ANALYSIS_DOC_TYPE,
        content: serializeAnalysisDocument(toSave),
        tab: 'case',
        source: 'evaluation',
        organization: existing?.organization || ORGANIZATION,
        title: '검사 분석지 정리',
        createdAt: existing?.createdAt || localTimestamp(),
        updatedAt: localTimestamp(),
    };
    await addDoc<CaseDocument>('caseDocuments', doc);
    return toSave;
}

export async function deleteAnalysisDocument(id: string): Promise<void> {
    if (!id) return;
    const doc = await getById<CaseDocument>('caseDocuments', id);
    if (!doc) return;
    if (doc.type !== VE_ANALYSIS_DOC_TYPE) throw new Error('분석지 기록 문서가 아니어서 삭제하지 않았습니다.');
    await deleteDoc('caseDocuments', id);
}

/* ── 보고서 ───────────────────────────────────────────────────── */

function documentToReport(doc: CaseDocument): EvaluationReport | null {
    const parsed = parseReport(doc.content);
    if (!parsed.ok) {
        console.warn('[vocationalEvaluation] 보고서를 읽지 못했습니다.', { id: doc.id, reason: parsed.error });
        return null;
    }
    return { ...parsed.report, id: doc.id || parsed.report.id };
}

export async function listReportsForEpisode(episodeId: string): Promise<EvaluationReport[]> {
    if (!episodeId) return [];
    const docs = await query<CaseDocument>('caseDocuments', doc => doc.type === VE_REPORT_DOC_TYPE);
    return docs
        .map(documentToReport)
        .filter((item): item is EvaluationReport => item !== null && item.episodeId === episodeId)
        .sort((a, b) => a.reportVersion - b.reportVersion);
}

/** 저장된 보고서 본문에서 확정 정보만 관대하게 읽는다(지문이 맞지 않아 엄격한 복원이 실패하는 문서 포함). */
function looseConfirmation(content: unknown): { confirmedAt?: string; contentHash?: string } | null {
    if (typeof content !== 'string' || !content) return null;
    try {
        const parsed = JSON.parse(content) as { confirmedAt?: unknown; contentHash?: unknown };
        return {
            confirmedAt: typeof parsed?.confirmedAt === 'string' && parsed.confirmedAt ? parsed.confirmedAt : undefined,
            contentHash: typeof parsed?.contentHash === 'string' && parsed.contentHash ? parsed.contentHash : undefined,
        };
    } catch {
        return null;
    }
}

export async function saveReport(value: EvaluationReport): Promise<EvaluationReport> {
    const now = new Date().toISOString();
    const existing = value.id ? await getById<CaseDocument>('caseDocuments', value.id) : undefined;
    if (existing && existing.type !== VE_REPORT_DOC_TYPE) {
        throw new Error('같은 ID의 다른 문서가 있어 보고서를 저장하지 못했습니다.');
    }
    // 이미 확정된 보고서는 같은 확정본(같은 지문)으로만 다시 저장할 수 있다. 화면에 남은 확정 전 사본이나
    // 늦게 도착한 자동 저장이 확정본을 미확정본으로 바꾸면, 확정 후 출력이 바뀌지 않는다는 약속이 깨진다.
    const stored = existing ? looseConfirmation(existing.content) : null;
    if (stored?.confirmedAt) {
        const sameConfirmed = value.confirmedAt === stored.confirmedAt && value.contentHash === stored.contentHash;
        if (!sameConfirmed) throw new Error('확정된 보고서는 고칠 수 없습니다. 새 버전을 만들어 주세요.');
    }
    const toSave = normalizeReport({ ...value, createdAt: value.createdAt || now, updatedAt: now });
    const doc: CaseDocument = {
        ...(existing || {}),
        id: toSave.id,
        seekerId: toSave.seekerId,
        seekerName: toSave.seekerName,
        type: VE_REPORT_DOC_TYPE,
        content: serializeReport(toSave),
        tab: 'case',
        source: 'evaluation',
        organization: existing?.organization || ORGANIZATION,
        // 목록 표시용 제목에는 이용자 이름을 넣지 않는다.
        title: `직업평가보고서 v${toSave.reportVersion}`,
        createdAt: existing?.createdAt || localTimestamp(),
        updatedAt: localTimestamp(),
    };
    await addDoc<CaseDocument>('caseDocuments', doc);
    return toSave;
}

export async function deleteReport(id: string): Promise<void> {
    if (!id) return;
    const doc = await getById<CaseDocument>('caseDocuments', id);
    if (!doc) return;
    if (doc.type !== VE_REPORT_DOC_TYPE) throw new Error('보고서 문서가 아니어서 삭제하지 않았습니다.');
    await deleteDoc('caseDocuments', id);
}
