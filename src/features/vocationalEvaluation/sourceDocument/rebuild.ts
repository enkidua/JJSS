/**
 * 검토 값이 바뀔 때마다 사실·충돌을 다시 만든다.
 * 평가사가 이미 고른 쪽은 **값이 그대로일 때만** 유지한다 —
 * 값이 달라졌으면 다시 확인하게 해야 하기 때문이다.
 */
import { buildDirectFacts, buildPdfFacts, createResolutions } from './facts';
import type { FactResolution, ReviewField, SourceFact } from './types';
import type { TestSession } from '../model/types';

export interface RebuildInput {
    fields: ReviewField[];
    session?: TestSession;
    documentId: string;
    now: string;
    previousFacts: SourceFact[];
    previousResolutions: FactResolution[];
}

export function rebuildFactsAndResolutions(input: RebuildInput): {
    facts: SourceFact[];
    resolutions: FactResolution[];
} {
    const directFacts = input.session ? buildDirectFacts(input.session, input.now) : [];
    const pdfFacts = buildPdfFacts(input.fields, input.documentId, input.now);
    const facts = [...directFacts, ...pdfFacts];
    const resolutions = createResolutions(input.fields, directFacts, pdfFacts, input.now);

    const previousById = new Map(input.previousFacts.map(fact => [fact.id, fact]));
    const previousChoice = new Map<string, SourceFact>();
    for (const resolution of input.previousResolutions) {
        if (resolution.status !== 'RESOLVED' || !resolution.selectedFactId) continue;
        const chosen = previousById.get(resolution.selectedFactId);
        if (chosen) previousChoice.set(resolution.path, chosen);
    }

    return {
        facts,
        resolutions: resolutions.map(resolution => {
            if (resolution.status !== 'CONFLICT') return resolution;
            const chosen = previousChoice.get(resolution.path);
            if (!chosen) return resolution;
            const match = resolution.candidateFactIds
                .map(id => facts.find(fact => fact.id === id))
                .find(fact => fact && fact.origin === chosen.origin && fact.value === chosen.value);
            if (!match) return resolution;
            const previous = input.previousResolutions.find(item => item.path === resolution.path);
            return {
                ...resolution,
                status: 'RESOLVED' as const,
                selectedFactId: match.id,
                resolvedBy: previous?.resolvedBy,
                resolvedAt: previous?.resolvedAt,
            };
        }),
    };
}
