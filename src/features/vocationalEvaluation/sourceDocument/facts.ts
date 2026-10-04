/**
 * 값의 출처를 나눠 두고 충돌을 해결한다. VE Assist `documentImport.ts`의 Fact 부분 이식.
 *
 * - `DIRECT_ENTRY`: 앱이 검사 실시 중 기록한 값
 * - `OFFICIAL_PDF`: 공단 공식 결과지에서 읽은 값
 * 둘이 다르면 CONFLICT로 남고, 평가사가 하나를 고르기 전에는 해석에 쓰이지 않는다.
 */
import { COMPONENT_KEYS } from '../model/bimanualTypes';
import { createId } from '../ids';
import { conditionSummaries } from '../session';
import type { TestSession } from '../model/types';
import type { CanonicalFact, FactResolution, ReviewField, SourceFact } from './types';

export function buildDirectFacts(session: TestSession, recordedAt: string): SourceFact[] {
    const facts: SourceFact[] = [];
    const add = (path: string, value: string | number | null, unit?: string) => {
        if (value === null || value === undefined) return;
        facts.push({
            id: createId('vefact'),
            origin: 'DIRECT_ENTRY',
            path,
            value,
            unit,
            recordedAt,
            revision: session.revision,
        });
    };

    if (session.bimanual) {
        const result = session.bimanual.attempt.result;
        for (const key of COMPONENT_KEYS) add(`bimanual.components.${key}`, result.components[key] ?? null, '개');
        if (result.recordedDurationMs !== undefined) add('bimanual.recordedDurationMs', result.recordedDurationMs, 'ms');
        if (COMPONENT_KEYS.every(key => result.components[key] !== undefined)) {
            add(
                'bimanual.reportedTotalCompleted',
                COMPONENT_KEYS.reduce((sum, key) => sum + (result.components[key] ?? 0), 0),
                '개',
            );
        }
        for (const component of session.bimanual.specification.components) {
            add(`bimanual.componentDenominators.${component.key}`, component.maximum, '개');
        }
        return facts;
    }

    for (const trial of session.trials) {
        if (trial.status === 'SKIPPED' || trial.score === undefined) continue;
        add(`trials.${trial.size}.${trial.handMode}.${trial.trialNumber}`, trial.score, '개');
    }
    for (const summary of conditionSummaries(session)) {
        if (summary.average === null) continue;
        add(`trials.${summary.size}.${summary.handMode}.reportedAverage`, summary.average, '개');
    }
    return facts;
}

/** 검토를 마친 결과지 값에서 사실을 만든다. 제외(REJECTED)한 값과 빈 값은 만들지 않는다. */
export function buildPdfFacts(fields: ReviewField[], documentId: string, recordedAt: string): SourceFact[] {
    return fields
        .filter(field => field.status !== 'REJECTED' && field.extracted.value !== null)
        .map(field => ({
            id: createId('vefact'),
            origin: 'OFFICIAL_PDF' as const,
            path: field.path,
            value: field.extracted.value,
            provenance: {
                documentId,
                pageNumber: field.extracted.pageNumber ?? undefined,
                sourceLabel: field.extracted.sourceLabel ?? field.label,
                sourceText: field.extracted.rawText ?? undefined,
            },
            recordedAt,
            revision: 1,
        }));
}

export function createResolutions(
    fields: ReviewField[],
    directFacts: SourceFact[],
    pdfFacts: SourceFact[],
    createdAt: string,
): FactResolution[] {
    const acceptedPaths = new Set(
        fields.filter(field => field.status !== 'REJECTED' && field.extracted.value !== null).map(field => field.path),
    );
    const paths = new Set([
        ...directFacts.map(fact => fact.path),
        ...pdfFacts.filter(fact => acceptedPaths.has(fact.path)).map(fact => fact.path),
    ]);
    return [...paths].map(path => {
        const direct = [...directFacts]
            .sort((a, b) => b.revision - a.revision || b.recordedAt.localeCompare(a.recordedAt))
            .find(fact => fact.path === path);
        const pdf = pdfFacts.find(fact => fact.path === path && acceptedPaths.has(path));
        const candidateFactIds = [direct?.id, pdf?.id].filter((id): id is string => Boolean(id));
        if (direct && pdf && direct.value !== pdf.value) {
            return { id: createId('veres'), path, candidateFactIds, status: 'CONFLICT' as const, createdAt };
        }
        const selected = pdf ?? direct;
        return {
            id: createId('veres'),
            path,
            candidateFactIds,
            selectedFactId: selected?.id,
            status: direct && pdf ? ('MATCHED' as const) : ('SINGLE_SOURCE' as const),
            createdAt,
        };
    });
}

export function resolveFactConflict(
    resolution: FactResolution,
    selectedFactId: string,
    by: string,
    at: string,
): FactResolution {
    if (resolution.status !== 'CONFLICT' || !resolution.candidateFactIds.includes(selectedFactId)) {
        throw new Error('충돌 후보 중 하나를 선택해야 합니다.');
    }
    return { ...resolution, status: 'RESOLVED', selectedFactId, resolvedBy: by, resolvedAt: at };
}

/** 해석·보고서가 쓸 수 있는 확정값만 돌려준다. 미해결 충돌은 빠진다. */
export function resolveCanonicalFacts(facts: SourceFact[], resolutions: FactResolution[]): CanonicalFact[] {
    const byId = new Map(facts.map(fact => [fact.id, fact]));
    const latest = new Map<string, FactResolution>();
    for (const resolution of [...resolutions].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        latest.set(resolution.path, resolution);
    }
    return [...latest.values()]
        .filter(resolution => resolution.selectedFactId && resolution.status !== 'CONFLICT')
        .flatMap(resolution => {
            const selected = byId.get(resolution.selectedFactId as string);
            if (!selected) return [];
            return [
                {
                    path: resolution.path,
                    selectedFact: selected,
                    resolutionStatus: resolution.status,
                    allSources: resolution.candidateFactIds
                        .map(id => byId.get(id))
                        .filter((fact): fact is SourceFact => Boolean(fact)),
                },
            ];
        });
}

export function conflictPaths(resolutions: FactResolution[]): string[] {
    return resolutions.filter(resolution => resolution.status === 'CONFLICT').map(resolution => resolution.path);
}
