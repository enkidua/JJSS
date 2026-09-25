/**
 * 근거 패키지 만들기. VE Assist `application/interpretationEvidenceService.ts` 이식(저장소 의존 제거).
 *
 * 밖으로 나가는 것은 **수치·라벨·의미 태그**뿐이다. 이름·연락처·파일 이름·자유 메모는 넣지 않는다.
 * 근거 ID는 `fact_0`, `event_*`처럼 의미 없는 값으로 바꿔 보낸다.
 */
import { getTestPlugin } from '../tests/registry';
import {
    observationDomain,
    observationSemanticDescription,
    observationSemanticTags,
    observationStateLabels,
} from '../observations/labels';
import { buildPatterns, factLabel } from './patterns';
import { interpretationReadiness } from './readiness';
import { hashEvidencePackage, type EvidencePackage, type EvidenceReference, type EvidenceSnapshot, type InterpretationEvidence } from './types';
import type { CanonicalFact } from '../sourceDocument/types';
import type { TestSession } from '../model/types';

const CONDITION_LABELS: Record<string, string> = {
    STANDARD_PROCEDURE: '표준 절차',
    ADDITIONAL_INSTRUCTION: '추가 안내',
    ADDITIONAL_DEMONSTRATION: '추가 시범',
    BREAK: '휴식',
    EXTERNAL_DISTRACTION: '외부 방해',
    PAIN: '통증',
    FATIGUE: '피로',
    ASSISTIVE_DEVICE: '보조기기 사용',
    ENVIRONMENT_CHANGE: '환경 변경',
    INTERRUPTION_RESUME: '중단 후 재개',
    OTHER: '기타 조건',
};

/** 결과지 원문 라벨은 그대로 보내지 않고 안전한 글자만 남긴다. */
function safeSourceLabel(value?: string): string | undefined {
    if (!value) return undefined;
    const normalized = value
        .normalize('NFKC')
        .replace(/[^가-힣A-Za-z0-9%().·/_\- ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return normalized.slice(0, 80) || undefined;
}

export interface EvidenceInput {
    testPluginId: string;
    canonicalFacts: CanonicalFact[];
    conflictPaths: string[];
    session?: TestSession;
    /** 공식 결과지를 연결하지 않았으면 false */
    hasOfficialDocument: boolean;
}

export async function buildEvidenceSnapshot(input: EvidenceInput): Promise<EvidenceSnapshot> {
    const plugin = getTestPlugin(input.testPluginId);
    const patterns = buildPatterns(input.testPluginId, input.canonicalFacts);
    const references: EvidenceReference[] = [];
    const factAliases = new Map<string, string>();

    const verifiedFacts: InterpretationEvidence[] = input.canonicalFacts
        .filter(fact => typeof fact.selectedFact.value === 'number' && Number.isFinite(fact.selectedFact.value))
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((canonical, index) => {
            const id = `fact_${index}`;
            const fact = canonical.selectedFact;
            factAliases.set(fact.id, id);
            const localSourceLabel = safeSourceLabel(fact.provenance?.sourceLabel);
            const label = canonical.path.startsWith('norms.') && localSourceLabel ? localSourceLabel : factLabel(canonical.path);
            references.push({
                id,
                label,
                origin: fact.origin,
                value: fact.value as number,
                sourceIds: [fact.id],
                pageNumber: fact.provenance?.pageNumber,
                sourceLabel: localSourceLabel,
                sourceDocumentId: fact.provenance?.documentId,
                revision: fact.revision,
                resolutionStatus: canonical.resolutionStatus,
            });
            return {
                id,
                type: 'SOURCE_FACT' as const,
                label,
                value: fact.value as number,
                description: canonical.path.startsWith('norms.')
                    ? '공식 결과지에 인쇄된 규준값. 다른 값으로 바꾸거나 순위로 환산하지 않는다.'
                    : canonical.path,
            };
        });

    const derivedFacts: InterpretationEvidence[] = patterns
        .filter(pattern => pattern.evidenceFactIds.every(id => factAliases.has(id)))
        .map(pattern => {
            references.push({
                id: pattern.id,
                label: pattern.label,
                origin: `LOCAL_RULE ${pattern.ruleId} v${pattern.ruleVersion}`,
                value: pattern.value,
                sourceIds: pattern.evidenceFactIds,
            });
            return {
                id: pattern.id,
                type: 'DERIVED_FACT' as const,
                label: pattern.label,
                value: pattern.value,
                semanticType: pattern.patternType,
                description: pattern.comparison
                    ? `${pattern.comparison.higherCondition} / ${pattern.comparison.lowerCondition} / 차이 ${pattern.comparison.displayDifference}`
                    : undefined,
            };
        });

    const observations: InterpretationEvidence[] = [];
    const events: InterpretationEvidence[] = [];
    const conditions: InterpretationEvidence[] = [];
    const session = input.session;

    if (session) {
        for (const definition of plugin.events) {
            const matching = session.events.filter(
                event =>
                    event.eventType === definition.type &&
                    !event.excludedAt &&
                    (!session.bimanual || event.attemptId === session.bimanual.attempt.id),
            );
            if (!matching.length) continue;
            const id = `event_${definition.type}`;
            const counts = new Map<string, number>();
            for (const event of matching) {
                const trial = session.trials.find(item => item.id === event.trialId);
                const context = trial?.label ?? (session.bimanual ? '양손협응 수행' : '검사 전반');
                counts.set(context, (counts.get(context) ?? 0) + 1);
            }
            const contexts = [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => ({ label, count }));
            events.push({
                id,
                type: 'EVENT',
                label: `${definition.label} 기록 횟수`,
                value: matching.length,
                description: '검사 중 기록된 사건이며 진단이나 인과관계가 아닙니다.',
                semanticType: 'EVALUATION_EVENT',
                eventType: definition.type,
                semanticTags: [definition.type],
                contexts,
            });
            references.push({
                id,
                label: definition.label,
                origin: 'EVALUATION_EVENT',
                value: matching.length,
                sourceIds: matching.map(event => event.id).sort(),
            });
        }

        const sortedObservations = session.observations
            .filter(
                observation =>
                    observation.candidateDecision !== 'EXCLUDED' &&
                    plugin.observations.some(definition => definition.id === observation.definitionId),
            )
            .sort((a, b) => a.definitionId.localeCompare(b.definitionId) || a.id.localeCompare(b.id));
        for (const [index, observation] of sortedObservations.entries()) {
            const definition = plugin.observations.find(item => item.id === observation.definitionId);
            const label = definition?.label ?? observation.label;
            const id = `observation_${index}`;
            observations.push({
                id,
                type: 'OBSERVATION',
                label,
                value: observationStateLabels[observation.state],
                description: observationSemanticDescription(observation),
                semanticType: 'EVALUATOR_OBSERVATION',
                observationDefinitionId: observation.definitionId,
                observationDomain: observationDomain(observation.definitionId),
                semanticTags: observationSemanticTags(observation),
            });
            references.push({
                id,
                label,
                origin: 'EVALUATOR_OBSERVATION',
                value: observationStateLabels[observation.state],
                sourceIds: [observation.id, ...(observation.evidenceEventIds ?? [])],
            });
        }

        for (const [index, condition] of [...session.conditions]
            .sort((a, b) => a.conditionType.localeCompare(b.conditionType))
            .entries()) {
            const id = `condition_${index}`;
            const label = condition.label || CONDITION_LABELS[condition.conditionType] || '검사 조건';
            conditions.push({
                id,
                type: 'SESSION_CONDITION',
                label,
                value: observationStateLabels[condition.state],
                conditionType: condition.conditionType,
                state: condition.state,
                description: `검사 당시 조건: ${label} · 상태: ${observationStateLabels[condition.state]}`,
                semanticType: 'SESSION_CONDITION',
                semanticTags: [condition.conditionType, `status:${condition.state.toLowerCase()}`],
            });
            references.push({
                id,
                label,
                origin: 'SESSION_CONDITION',
                value: observationStateLabels[condition.state],
                sourceIds: [condition.id],
            });
        }
    }

    const readiness = interpretationReadiness(input.testPluginId, input.canonicalFacts, input.conflictPaths);
    const pack: EvidencePackage = {
        testType: input.testPluginId,
        testDescription: plugin.manifest.description,
        verifiedFacts,
        derivedFacts,
        observations,
        events,
        conditions,
        unresolvedIssues: input.conflictPaths.map(path => `값 불일치: ${factLabel(path)}`),
        constraints: [
            '제공된 근거만 사용한다. 개인정보와 원본 파일은 전송하지 않았다.',
            '검사조건에서의 수행은 실제 직무능력의 증명이 아니다.',
            '확인하지 못함·해당 없음은 "문제 없음"이 아니다.',
            '관찰과 점수 사이의 인과관계를 추론하지 않는다.',
            '규준 계산·백분위 변환·직업 적합 및 취업 가능 판정을 하지 않는다.',
            ...(input.hasOfficialDocument
                ? ['규준값은 공단 공식 결과지에 인쇄된 값이며 다시 계산하거나 순위로 바꾸지 않는다.']
                : ['공식 결과지를 연결하지 않았다. 규준·백분위에 관한 서술을 하지 않는다.']),
            ...(readiness.status === 'PARTIAL'
                ? ['일부 결과가 확인되지 않았으므로 확인된 자료만 기술하고 자료 제한을 함께 적는다.']
                : []),
            ...(input.testPluginId === 'kead-bimanual'
                ? [
                      '기록시간은 전체 조립 완료시간이 아니다.',
                      '기록시간이나 수행량으로 전체 완료를 추론하지 않는다.',
                  ]
                : []),
        ],
    };

    return {
        package: pack,
        references,
        patterns,
        readiness,
        evidenceHash: await hashEvidencePackage(pack),
    };
}
