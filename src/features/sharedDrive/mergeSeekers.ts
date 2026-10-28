/**
 * 같은 사람으로 보이는 이용자 합치기(사용자가 고른 경우에만).
 * - 남길 이용자(target)를 정하면 다른 이용자에 연결된 사례 기록의 이용자 연결만 target으로 옮긴 뒤 다른 이용자를 지운다.
 * - 기록 내용 안에 지울 이용자 id가 남아 있으면(다른 기능의 연결) 지우지 않고 알린다 — 연결이 끊기지 않게.
 * - 모든 쓰기는 앱 저장(origin 'app')이므로 공유 저장소로 전파된다.
 */
import { deleteDoc, getAll, updateDoc } from '../../config/localDB';
import type { CaseDocument } from '../../types/caseDocument';

export interface MergeResult {
    movedDocuments: number;
    removedSeekers: string[];
    keptBecauseReferenced: string[];
}

interface SeekerLike {
    id: string;
    name?: string;
    seekerId?: string;
}

export async function mergeSeekers(targetId: string, sourceIds: string[]): Promise<MergeResult> {
    const seekers = await getAll<SeekerLike>('seekers');
    const target = seekers.find(item => item.id === targetId);
    if (!target) throw new Error('남길 이용자를 찾지 못했습니다.');
    const sources = sourceIds.filter(id => id !== targetId);
    const documents = await getAll<CaseDocument & { id: string }>('caseDocuments');
    const result: MergeResult = { movedDocuments: 0, removedSeekers: [], keptBecauseReferenced: [] };
    for (const sourceId of sources) {
        for (const doc of documents.filter(item => item.seekerId === sourceId)) {
            await updateDoc<CaseDocument>('caseDocuments', doc.id, { seekerId: targetId, seekerName: String(target.name || doc.seekerName || '') });
            doc.seekerId = targetId;
            result.movedDocuments += 1;
        }
        const stillReferenced = documents.some(item => item.seekerId !== targetId && JSON.stringify(item).includes(sourceId))
            || documents.some(item => typeof item.content === 'string' && item.content.includes(sourceId));
        if (stillReferenced) {
            result.keptBecauseReferenced.push(sourceId);
            continue;
        }
        await deleteDoc('seekers', sourceId);
        result.removedSeekers.push(sourceId);
    }
    return result;
}
