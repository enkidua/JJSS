/**
 * 해석에 쓸 확정값 모으기.
 * 공식 결과지를 연결했으면 그 문서의 사실·충돌 해결 결과를 쓰고,
 * 연결하지 않았으면 앱이 기록한 값만으로 진행한다(계획서 §2-3).
 */
import { buildDirectFacts, conflictPaths, createResolutions, resolveCanonicalFacts } from '../sourceDocument/facts';
import { isOfficialDocumentUsable } from '../sourceDocument/record';
import type { SourceDocumentRecord, CanonicalFact } from '../sourceDocument/types';
import type { TestSession } from '../model/types';

export interface InterpretationContext {
    canonicalFacts: CanonicalFact[];
    conflictPaths: string[];
    hasOfficialDocument: boolean;
}

export function buildInterpretationContext(input: {
    session?: TestSession;
    document?: SourceDocumentRecord;
    now: string;
}): InterpretationContext {
    // 평가사가 확정하지 않은 결과지는 값의 출처로 쓰지 않는다(읽기 성공만으로는 부족).
    if (isOfficialDocumentUsable(input.document)) {
        return {
            canonicalFacts: resolveCanonicalFacts(input.document.facts, input.document.resolutions),
            conflictPaths: conflictPaths(input.document.resolutions),
            hasOfficialDocument: true,
        };
    }
    if (!input.session) return { canonicalFacts: [], conflictPaths: [], hasOfficialDocument: false };
    const directFacts = buildDirectFacts(input.session, input.now);
    const resolutions = createResolutions([], directFacts, [], input.now);
    return {
        canonicalFacts: resolveCanonicalFacts(directFacts, resolutions),
        conflictPaths: [],
        hasOfficialDocument: false,
    };
}
