/**
 * 직업평가 워크벤치 저장소.
 * 새 IndexedDB store를 만들지 않고 caseDocuments에 JSON 문서로 저장한다(계획서 §6).
 * caseDocuments는 최소 메타데이터(id·종류·탭·시각)를 뺀 필드가 localDB에서 암호화되므로
 * 회차·세션 JSON(이름·수행량·메모 포함)도 암호화되어 저장된다.
 *
 * zustand dataStore의 caseDocuments 목록은 여기서 갱신하지 않는다.
 * 현황판 타임라인 등에 바로 보여야 하면 저장 후 화면에서 fetchCaseDocuments()를 다시 부른다.
 */
import { addDoc, deleteDoc, getById, localTimestamp, query } from '../../config/localDB';
import type { CaseDocument } from '../../types/caseDocument';
import { normalizeEpisode, parseEpisode, serializeEpisode, type EvaluationEpisode } from './model/episode';
import { normalizeSession, parseSession, serializeSession } from './model/sessionSerialization';
import { normalizeReport, parseReport, serializeReport } from './report/serialization';
import { normalizeSourceDocument, parseSourceDocument, serializeSourceDocument } from './sourceDocument/record';
import { findTestPlugin } from './tests/registry';
import type { EvaluationReport } from './report/model';
import type { SourceDocumentRecord } from './sourceDocument/types';
import type { TestSession } from './model/types';

export const VE_EPISODE_DOC_TYPE = 've_episode' as const;
export const VE_SESSION_DOC_TYPE = 've_session' as const;
export const VE_SOURCE_DOCUMENT_DOC_TYPE = 've_source_document' as const;
export const VE_REPORT_DOC_TYPE = 've_report' as const;

const ORGANIZATION = '직업재활기관';

function timestampToIso(value: unknown): string | undefined {
    const seconds = value && typeof value === 'object' ? Number((value as { seconds?: unknown }).seconds) : NaN;
    return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : undefined;
}

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

/** 회차와 그 회차에 속한 검사 세션을 함께 지운다. */
export async function deleteEpisode(id: string): Promise<void> {
    if (!id) return;
    const doc = await getById<CaseDocument>('caseDocuments', id);
    if (!doc) return;
    if (doc.type !== VE_EPISODE_DOC_TYPE) throw new Error('평가 회차 문서가 아니어서 삭제하지 않았습니다.');
    for (const session of await listSessionsForEpisode(id)) {
        await deleteDoc('caseDocuments', session.id);
    }
    for (const sourceDocument of await listSourceDocumentsForEpisode(id)) {
        await deleteDoc('caseDocuments', sourceDocument.id);
    }
    for (const report of await listReportsForEpisode(id)) {
        await deleteDoc('caseDocuments', report.id);
    }
    await deleteDoc('caseDocuments', id);
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

export async function saveReport(value: EvaluationReport): Promise<EvaluationReport> {
    const now = new Date().toISOString();
    const existing = value.id ? await getById<CaseDocument>('caseDocuments', value.id) : undefined;
    if (existing && existing.type !== VE_REPORT_DOC_TYPE) {
        throw new Error('같은 ID의 다른 문서가 있어 보고서를 저장하지 못했습니다.');
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
