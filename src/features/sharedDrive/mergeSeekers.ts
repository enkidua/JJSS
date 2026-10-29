/**
 * 같은 사람으로 보이는 이용자 합치기(사용자가 고른 경우에만).
 * - 남길 이용자(target)를 정하면 다른 이용자에 연결된 사례 기록의 이용자 연결을 target으로 옮긴 뒤 다른 이용자를 지운다.
 *   직업평가 회차·지원고용 회차처럼 내용(JSON) 안에도 seekerId를 두는 문서는 안쪽 값도 같이 바꾼다
 *   (안 바꾸면 그 문서를 다음에 저장할 때 원래 이용자 id로 되돌아간다).
 * - 옮기고도 어딘가에 지울 이용자 id가 남아 있으면(다른 기능의 연결) 그 이용자는 지우지 않고 알린다.
 * - 모든 쓰기는 앱 저장(origin 'app')이므로 공유 저장소로 전파된다.
 */
import { deleteDoc, getAll, updateDoc } from '../../config/localDB';
import type { CaseDocument } from '../../types/caseDocument';

export interface MergeResult {
    movedDocuments: number;
    removedSeekers: string[];
    keptBecauseReferenced: string[];
}

export interface MergeCandidate {
    id: string;
    name: string;
    seekerId: string;
    phone: string;
    createdAt: string;
    documentCount: number;
}

interface SeekerLike {
    id: string;
    name?: string;
    seekerId?: string;
    phone?: string;
    createdAt?: { seconds?: number } | string;
}

function createdLabel(value: SeekerLike['createdAt']): string {
    const seconds = typeof value === 'object' && value ? Number(value.seconds) : NaN;
    const date = Number.isFinite(seconds) ? new Date(seconds * 1000) : typeof value === 'string' ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString('ko-KR') : '';
}

/** 합치기 화면에 보여 줄 후보 정보(전화·등록일·기록 수) */
export async function describeMergeCandidates(seekerIds: string[]): Promise<MergeCandidate[]> {
    const seekers = await getAll<SeekerLike>('seekers');
    const documents = await getAll<CaseDocument & { id: string }>('caseDocuments');
    return seekerIds.map(id => {
        const seeker = seekers.find(item => item.id === id);
        return {
            id,
            name: String(seeker?.name ?? ''),
            seekerId: String(seeker?.seekerId ?? ''),
            phone: String(seeker?.phone ?? ''),
            createdAt: createdLabel(seeker?.createdAt),
            documentCount: documents.filter(doc => doc.seekerId === id).length,
        };
    });
}

/** 문서 내용이 JSON이고 seekerId가 source면 target으로 바꾼 내용을 돌려준다. 아니면 null. */
function rewriteContent(content: unknown, sourceId: string, targetId: string, targetName: string): string | null {
    if (typeof content !== 'string' || !content.includes(sourceId)) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const object = parsed as Record<string, unknown>;
    if (object.seekerId !== sourceId) return null;
    object.seekerId = targetId;
    if (typeof object.seekerName === 'string' && targetName) object.seekerName = targetName;
    return JSON.stringify(object);
}

export async function mergeSeekers(targetId: string, sourceIds: string[]): Promise<MergeResult> {
    const seekers = await getAll<SeekerLike>('seekers');
    const target = seekers.find(item => item.id === targetId);
    if (!target) throw new Error('남길 이용자를 찾지 못했습니다.');
    const targetName = String(target.name || '');
    const sources = sourceIds.filter(id => id !== targetId && seekers.some(item => item.id === id));
    const documents = await getAll<CaseDocument & { id: string }>('caseDocuments');
    const result: MergeResult = { movedDocuments: 0, removedSeekers: [], keptBecauseReferenced: [] };
    for (const sourceId of sources) {
        for (const doc of documents.filter(item => item.seekerId === sourceId)) {
            const content = rewriteContent(doc.content, sourceId, targetId, targetName);
            const patch: Partial<CaseDocument> = { seekerId: targetId, seekerName: targetName || doc.seekerName };
            if (content !== null) patch.content = content;
            await updateDoc<CaseDocument>('caseDocuments', doc.id, patch);
            doc.seekerId = targetId;
            doc.seekerName = patch.seekerName as string;
            if (content !== null) doc.content = content;
            result.movedDocuments += 1;
        }
        // 옮긴 뒤에도 다른 곳에서 이 id를 가리키면(옮기지 못한 연결) 이용자는 남겨 둔다.
        const stillReferenced = documents.some(item => JSON.stringify(item).includes(sourceId));
        if (stillReferenced) {
            result.keptBecauseReferenced.push(sourceId);
            continue;
        }
        await deleteDoc('seekers', sourceId);
        result.removedSeekers.push(sourceId);
    }
    return result;
}
