/**
 * 보고서 자동 조립. 확정된 값·행동관찰·채택한 해석 문장만 모은다.
 * 자동 문단은 평가사가 하나씩 뺄 수 있고, 빼면 출력에 들어가지 않는다.
 */
import { COMPONENT_KEYS } from '../model/bimanualTypes';
import { buildObservationNarrative } from '../observations/narrative';
import { conditionSummaries } from '../session';
import { getTestPlugin } from '../tests/registry';
import { CLAIM_TYPE_LABELS } from '../interpretation/types';
import { adoptedClaims, claimText, type InterpretationRun } from '../interpretation/run';
import { totalMaximum } from '../bimanual';
import { isOfficialDocumentUsable, selectActiveSourceDocument } from '../sourceDocument/record';
import type { EvaluationEpisode } from '../model/episode';
import type { TestSession } from '../model/types';
import type { SourceDocumentRecord } from '../sourceDocument/types';
import type { ReportParagraph, ReportResultTable, ReportSection } from './model';

function paragraph(id: string, text: string, origin: ReportParagraph['origin'], sourceLabel?: string): ReportParagraph {
    return { id, origin, text, included: true, sourceLabel };
}

/** 결과지에서 확정한 값이 있으면 그 값을, 없으면 앱 기록을 쓴다. 미확정 결과지는 쓰지 않는다. */
function officialValue(document: SourceDocumentRecord | undefined, path: string): string | number | null {
    if (!isOfficialDocumentUsable(document)) return null;
    const resolution = document.resolutions.find(item => item.path === path);
    if (!resolution || resolution.status === 'CONFLICT' || !resolution.selectedFactId) return null;
    return document.facts.find(fact => fact.id === resolution.selectedFactId)?.value ?? null;
}

export function buildHandFunctionTable(
    session: TestSession,
    document?: SourceDocumentRecord,
): ReportResultTable {
    const rows: string[][] = [['조건', '1회', '2회', '3회', '평균']];
    let partial = false;
    for (const summary of conditionSummaries(session)) {
        const cells = summary.scores.map((score, index) => {
            const official = officialValue(document, `trials.${summary.size}.${summary.handMode}.${index + 1}`);
            if (official !== null) return String(official);
            return score === null ? '미실시' : String(score);
        });
        if (summary.executedCount > 0 && summary.executedCount < summary.scores.length) partial = true;
        const officialAverage = officialValue(document, `trials.${summary.size}.${summary.handMode}.reportedAverage`);
        rows.push([
            summary.label,
            ...cells,
            officialAverage !== null ? String(officialAverage) : summary.average === null ? '—' : String(summary.average),
        ]);
    }
    const notes = [
        isOfficialDocumentUsable(document) ? '공식 결과지에서 확인한 값입니다.' : '앱에서 기록한 값입니다(공식 결과지 미연결).',
        partial ? '미실시한 회차는 평균에서 제외했습니다.' : '',
    ].filter(Boolean);
    return { title: '손기능 작업표본검사 결과', rows, note: notes.join(' ') };
}

export function buildBimanualTable(session: TestSession, document?: SourceDocumentRecord): ReportResultTable {
    const state = session.bimanual;
    const rows: string[][] = [['부품', '수행량', '분모']];
    if (!state) return { title: '다차원 양손협응 검사 결과', rows };
    const usable = isOfficialDocumentUsable(document);
    // 총합은 따로 계산하지 않고 **표에 표시한 값의 합**으로 낸다 — 세부 항목과 총합의 출처가 갈리지 않게.
    let displayedTotal: number | null = 0;
    for (const component of state.specification.components) {
        const official = officialValue(document, `bimanual.components.${component.key}`);
        const value = official !== null ? official : state.attempt.result.components[component.key];
        rows.push([component.label, value === undefined ? '—' : String(value), String(component.maximum)]);
        if (typeof value === 'number' && displayedTotal !== null) displayedTotal += value;
        else displayedTotal = null;
    }
    rows.push(['총합', displayedTotal === null ? '—' : String(displayedTotal), String(totalMaximum(state.specification))]);
    const officialDuration = officialValue(document, 'bimanual.recordedDurationMs');
    const duration = typeof officialDuration === 'number' ? officialDuration : state.attempt.result.recordedDurationMs;
    const notes = [
        duration !== undefined ? `기록시간 ${Math.round(duration / 1000)}초.` : '',
        '기록시간은 전체 조립 완료를 뜻하지 않습니다.',
        usable ? '공식 결과지에서 확인한 값입니다.' : '앱에서 기록한 값입니다(공식 결과지 미연결).',
    ].filter(Boolean);
    return { title: '다차원 양손협응 검사 결과', rows, note: notes.join(' ') };
}

/** 결과지에 인쇄된 규준 값을 그대로 옮긴 표. 앱이 계산한 값이 아니다. */
export function buildNormTable(document: SourceDocumentRecord): ReportResultTable | null {
    const norms = document.reviewFields.filter(field => field.path.startsWith('norms.') && field.status !== 'REJECTED');
    if (!norms.length) return null;
    return {
        title: '공식 결과지 규준 표기값',
        rows: [['항목', '값'], ...norms.map(field => [field.label, field.extracted.value === null ? '—' : String(field.extracted.value)])],
        note: '공단 검사해석 프로그램이 산출해 결과지에 인쇄한 값입니다. 앱이 계산하지 않았습니다.',
    };
}

export function buildResultTables(sessions: TestSession[], documents: SourceDocumentRecord[]): ReportResultTable[] {
    const tables: ReportResultTable[] = [];
    for (const session of sessions) {
        const document = selectActiveSourceDocument(documents, session.id);
        tables.push(session.bimanual ? buildBimanualTable(session, document) : buildHandFunctionTable(session, document));
        if (document) {
            const norms = buildNormTable(document);
            if (norms) tables.push(norms);
        }
    }
    return tables;
}

export interface ComposeInput {
    episode: EvaluationEpisode;
    sessions: TestSession[];
    documents: SourceDocumentRecord[];
}

/** 섹션별 자동 문단. 이미 있던 평가사 서술과 제외 표시는 유지한다. */
export function composeSections(input: ComposeInput, previous: ReportSection[]): ReportSection[] {
    const auto = new Map<string, ReportParagraph[]>();
    const push = (sectionId: string, item: ReportParagraph) => {
        auto.set(sectionId, [...(auto.get(sectionId) ?? []), item]);
    };

    // 사회진단: 관찰된 행동만 문장으로 만든다.
    for (const session of input.sessions) {
        const shortName = getTestPlugin(session.testPluginId).manifest.shortName;
        for (const observation of session.observations) {
            const narrative = buildObservationNarrative(observation);
            if (!narrative) continue;
            push('social', paragraph(`obs:${observation.id}`, narrative.text, 'AUTO', `${shortName} 행동관찰`));
        }
        const conditions = session.conditions.filter(condition => condition.state === 'OBSERVED');
        if (conditions.length) {
            push(
                'social',
                paragraph(
                    `cond:${session.id}`,
                    `${shortName} 검사 당시 조건: ${conditions.map(condition => condition.label).join(', ')}.`,
                    'AUTO',
                    '검사조건',
                ),
            );
        }
    }

    // 직업진단: 실시한 검사와 자료 출처를 적는다.
    for (const session of input.sessions) {
        const plugin = getTestPlugin(session.testPluginId);
        const document = selectActiveSourceDocument(input.documents, session.id);
        const source = document ? '공식 결과지에서 확인한 값을 사용했다' : '공식 결과지를 연결하지 않아 앱에 기록한 값을 사용했다';
        const skipped = session.bimanual
            ? ''
            : conditionSummaries(session)
                  .filter(summary => summary.executedCount > 0 && summary.executedCount < summary.scores.length)
                  .map(summary => `${summary.label} ${summary.executedCount}회 실시`)
                  .join(', ');
        push(
            'vocational',
            paragraph(
                `test:${session.id}`,
                `${plugin.manifest.name}을(를) ${plugin.manifest.durationNote} 기준으로 실시했다. ${source}.${
                    skipped ? ` 일부 조건은 회차를 줄여 실시했다(${skipped}).` : ''
                }`,
                'AUTO',
                plugin.manifest.shortName,
            ),
        );
    }

    // 직업진단: 채택한 해석 문장
    for (const run of input.episode.interpretations) {
        for (const claim of adoptedClaims(run as InterpretationRun)) {
            push(
                'vocational',
                paragraph(`claim:${claim.id}`, claimText(claim), 'AI_CLAIM', `해석 · ${CLAIM_TYPE_LABELS[claim.claimType]}`),
            );
        }
    }

    return previous.map(section => {
        const generated = auto.get(section.id) ?? [];
        const kept = new Map(section.paragraphs.map(item => [item.id, item]));
        return {
            ...section,
            paragraphs: generated.map(item => {
                const before = kept.get(item.id);
                return before ? { ...item, included: before.included } : item;
            }),
        };
    });
}

/** 평가도구 표에 이번에 실시한 KEAD 검사를 채워 넣는다. 비어 있는 칸만 채운다. */
export function fillToolRows(
    tools: Array<{ area: string; tool: string }>,
    sessions: TestSession[],
): Array<{ area: string; tool: string }> {
    const hand = sessions.find(session => session.testPluginId === 'kead-hand-function');
    const bimanual = sessions.find(session => session.testPluginId === 'kead-bimanual');
    return tools.map(row => {
        if (row.tool.trim()) return row;
        if (hand && row.area.includes('손기능')) return { ...row, tool: getTestPlugin(hand.testPluginId).manifest.name };
        if (bimanual && row.area.includes('작업활동')) return { ...row, tool: getTestPlugin(bimanual.testPluginId).manifest.name };
        return row;
    });
}

export const REPORT_COMPONENT_KEYS = COMPONENT_KEYS;
