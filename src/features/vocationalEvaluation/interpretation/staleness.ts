/**
 * 저장된 해석 실행이 지금 근거와 맞는지 다시 계산해 STALE로 표시한다.
 * 해석 화면을 열 때와 보고서를 조립하기 직전에 호출한다 —
 * 원자료를 고친 뒤 해석 화면을 건너뛰고 보고서로 가도 예전 문장이 살아남지 않게 한다.
 */
import { buildEvidenceSnapshot } from './evidence';
import { buildInterpretationContext } from './context';
import { selectActiveSourceDocument } from '../sourceDocument/record';
import type { EvaluationEpisode } from '../model/episode';
import type { SourceDocumentRecord } from '../sourceDocument/types';
import type { TestSession } from '../model/types';

export interface StalenessRefreshResult {
    episode: EvaluationEpisode;
    /** 하나라도 STALE로 바뀌었으면 true — 호출한 쪽이 저장해야 한다 */
    changed: boolean;
}

export async function refreshRunStaleness(
    episode: EvaluationEpisode,
    sessions: TestSession[],
    documents: SourceDocumentRecord[],
): Promise<StalenessRefreshResult> {
    let changed = false;
    const runs = await Promise.all(
        episode.interpretations.map(async run => {
            if (run.status !== 'CURRENT' || !run.sessionId) return run;
            const session = sessions.find(item => item.id === run.sessionId);
            if (!session) {
                changed = true;
                return { ...run, status: 'STALE' as const };
            }
            const document = selectActiveSourceDocument(documents, session.id);
            const context = buildInterpretationContext({ session, document, now: new Date().toISOString() });
            const snapshot = await buildEvidenceSnapshot({
                testPluginId: session.testPluginId,
                canonicalFacts: context.canonicalFacts,
                conflictPaths: context.conflictPaths,
                session,
                hasOfficialDocument: context.hasOfficialDocument,
            });
            if (snapshot.evidenceHash === run.evidenceHash) return run;
            changed = true;
            return { ...run, status: 'STALE' as const };
        }),
    );
    return { episode: changed ? { ...episode, interpretations: runs } : episode, changed };
}
