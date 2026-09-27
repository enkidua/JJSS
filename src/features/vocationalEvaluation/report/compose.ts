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
import { analysisTitle, type AnalysisDocumentRecord, type AnalysisArea } from '../analysisDocument/model';
import type { ReportParagraph, ReportResultTable, ReportSection, ReportSummary } from './model';
import { buildResultNarrative } from './narrative';

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
    /** 그 밖의 검사 분석지(흥미검사·사회적응도·심리검사 등). 없으면 빈 배열로 취급 */
    analyses?: AnalysisDocumentRecord[];
}

/** 분석지에서 보고서 자동 조립에 쓸 문장만(포함 표시 + 차단 없음) */
function usableFindings(analyses: AnalysisDocumentRecord[] | undefined, areas: AnalysisArea[]) {
    return (analyses ?? [])
        .filter(record => record.extractionStatus === 'SUCCEEDED')
        .flatMap(record =>
            record.findings
                .filter(finding => finding.included && !finding.blocked && areas.includes(finding.area))
                .map(finding => ({ record, finding })),
        );
}

/** 섹션별 자동 문단. 이미 있던 평가사 서술과 제외 표시는 유지한다. */
export function composeSections(input: ComposeInput, previous: ReportSection[]): ReportSection[] {
    const auto = new Map<string, ReportParagraph[]>();
    const push = (sectionId: string, item: ReportParagraph) => {
        auto.set(sectionId, [...(auto.get(sectionId) ?? []), item]);
    };

    // 장애·진단이력과 교육·직업경력은 ① 기본정보에서 한 번만 적으면 보고서에 자동으로 들어간다.
    if (input.episode.disabilityHistory?.trim()) {
        push('disability', paragraph('episode:disability', input.episode.disabilityHistory.trim(), 'AUTO', '① 기본정보'));
    }
    if (input.episode.careerHistory?.trim()) {
        push('career', paragraph('episode:career', input.episode.careerHistory.trim(), 'AUTO', '① 기본정보'));
    }

    // 직업진단: 실시한 검사를 적는다.
    for (const session of input.sessions) {
        const plugin = getTestPlugin(session.testPluginId);
        const document = selectActiveSourceDocument(input.documents, session.id);

        // 만들다 만 세션(값·관찰·사건이 하나도 없음)은 "실시했다" 문장을 만들지 않는다 —
        // 같은 검사를 여러 번 만들었다 지우지 않은 회차에서 실시 문장이 반복 출력되는 것을 막는다.
        const narrativeProbe = buildResultNarrative(session, document);
        const hasObservation = session.observations.some(observation => buildObservationNarrative(observation));
        const hasCondition = session.conditions.some(condition => condition.state === 'OBSERVED');
        const hasEvent = session.events.some(event => !event.excludedAt);
        if (!narrativeProbe.paragraphs.length && !hasObservation && !hasCondition && !hasEvent) continue;
        // 실시 사실만 한 줄로 적는다. 값의 출처(공식 결과지/앱 기록)와 실시요강 조건은 소견 본문이 아니라
        // 검사 결과표 아래 "자료 출처" 주석에 한 번만 나온다(report/compose.ts의 표 note).
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
                `${plugin.manifest.name}을(를) 실시했다.${skipped ? ` 일부 조건은 회차를 줄여 실시했다(${skipped}).` : ''}`,
                'AUTO',
                plugin.manifest.shortName,
            ),
        );
        // 결과지(없으면 앱 기록)의 값을 해석한 초안. 평가사는 고치거나 뺄 수 있다.
        const narrative = narrativeProbe;
        const label = `${plugin.manifest.shortName} 결과 해석${narrative.fromOfficialDocument ? ' · 공식 결과지' : ' · 앱 기록'}`;
        for (const item of narrative.paragraphs) {
            push('vocational', paragraph(`result:${session.id}:${item.key}`, item.text, 'AUTO', label));
        }

        // KEAD 검사 중의 행동관찰은 검사 상황의 기록이므로 **직업진단** 영역에 넣는다.
        // 검사 관찰만으로 "사회진단" 항목을 만들지 않는다 — 사회진단은 사회적응도검사 등 해당 평가가 있을 때만 채워진다.
        const shortName = plugin.manifest.shortName;
        for (const observation of session.observations) {
            const observed = buildObservationNarrative(observation);
            if (!observed) continue;
            push('vocational', paragraph(`obs:${observation.id}`, observed.text, 'AUTO', `${shortName} 행동관찰`));
        }
        const conditions = session.conditions.filter(condition => condition.state === 'OBSERVED');
        if (conditions.length) {
            push(
                'vocational',
                paragraph(
                    `cond:${session.id}`,
                    `${shortName} 검사 당시 조건: ${conditions.map(condition => condition.label).join(', ')}.`,
                    'AUTO',
                    '검사조건',
                ),
            );
        }
    }

    // 분석지: 문서에 적힌 내용을 보고서 영역 그대로 배치한다(심리진단·사회진단 등).
    for (const { record, finding } of usableFindings(input.analyses, ['disability', 'career', 'living', 'social', 'physical', 'psychological', 'vocational'])) {
        push(finding.area, paragraph(`analysis:${record.id}:${finding.id}`, finding.text, 'AUTO', `분석지 · ${analysisTitle(record)}`));
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

/** 분석지 제목으로 평가영역을 알아보는 규칙. 첫 번째로 맞는 영역에 넣는다. */
const TOOL_AREA_MATCHERS: ReadonlyArray<{ area: RegExp; title: RegExp }> = [
    { area: /사회진단/, title: /사회적응|CISA|사회성숙|바인랜드|적응행동/i },
    { area: /신체적 능력/, title: /신체|체력|악력|근력|지구력|보행/ },
    { area: /인지·언어/, title: /지능|웩슬러|WAIS|WISC|인지|언어|어휘|기초학습/i },
    { area: /정서 및 성격/, title: /정서|성격|MMPI|우울|불안|HTP|SCT|문장완성|그림검사/i },
    { area: /직업흥미/, title: /흥미|VISIT/i },
    { area: /직업준비/, title: /직업준비|취업준비|구직|MDS|ERS/i },
    // 손기능·작업활동 검사지를 분석지로 넣는 기관도 있다(Grooved Pegboard, GATB, Micro-Tower, Work Activities 등).
    { area: /손기능/, title: /손기능|Grooved|Pegboard|GATB|Micro-?Tower|퍼듀|Purdue/i },
    { area: /작업활동/, title: /작업활동|Work\s*Activit|양손협응/i },
];

/**
 * 평가도구 표를 자동으로 채운다: 이번에 실시한 KEAD 검사 + 넣은 분석지의 검사 이름.
 * 평가사가 이미 쓴 칸은 건드리지 않고, 같은 영역에 분석지가 여럿이면 쉼표로 잇는다.
 */
export function fillToolRows(
    tools: Array<{ area: string; tool: string }>,
    sessions: TestSession[],
    analyses?: AnalysisDocumentRecord[],
): Array<{ area: string; tool: string }> {
    const hand = sessions.find(session => session.testPluginId === 'kead-hand-function');
    const bimanual = sessions.find(session => session.testPluginId === 'kead-bimanual');
    const byArea = new Map<number, string[]>();
    // 영역을 알아보지 못한 분석지도 표에서 사라지면 안 된다 — "기타 평가자료" 행으로 남긴다.
    // (여기 제목은 로컬 출력용이라 파일 이름을 써도 된다. AI 전송 제목은 outboundAnalysisTitle이 따로 맡는다.)
    const unmatched: string[] = [];
    for (const record of analyses ?? []) {
        if (record.extractionStatus === 'FAILED') continue;
        const title = (record.detectedTitle ?? '').trim() || analysisTitle(record);
        if (!title) continue;
        const index = TOOL_AREA_MATCHERS.findIndex(matcher => matcher.title.test(title));
        const list = index >= 0 ? (byArea.get(index) ?? []) : unmatched;
        if (!list.includes(title)) list.push(title);
        if (index >= 0) byArea.set(index, list);
    }
    const filled = tools.map(row => {
        if (row.tool.trim()) return row;
        if (hand && row.area.includes('손기능')) return { ...row, tool: getTestPlugin(hand.testPluginId).manifest.name };
        if (bimanual && row.area.includes('작업활동')) return { ...row, tool: getTestPlugin(bimanual.testPluginId).manifest.name };
        const matched = TOOL_AREA_MATCHERS.findIndex(matcher => matcher.area.test(row.area));
        const titles = matched >= 0 ? byArea.get(matched) : undefined;
        if (titles?.length) return { ...row, tool: titles.join(', ') };
        return row;
    });
    const missing = unmatched.filter(title => !filled.some(row => row.tool.includes(title)));
    if (!missing.length) return filled;
    const existingIndex = filled.findIndex(row => row.area === '기타 평가자료');
    if (existingIndex >= 0) {
        return filled.map((row, index) =>
            index === existingIndex ? { ...row, tool: [row.tool, ...missing].filter(Boolean).join(', ') } : row,
        );
    }
    return [...filled, { area: '기타 평가자료', tool: missing.join(', ') }];
}

export const REPORT_COMPONENT_KEYS = COMPONENT_KEYS;

/**
 * 요약의 "직업적 강점"·"제한점·고려사항"이 비어 있으면 결과 해석에서 초안을 채운다.
 * 평가사가 이미 쓴 칸은 건드리지 않는다. 직업수준·추천 직무는 판단이 필요하므로 채우지 않는다.
 */
export function composeSummaryDraft(input: ComposeInput, summary: ReportSummary): ReportSummary {
    const strengths: string[] = [];
    const limitations: string[] = [];
    for (const session of input.sessions) {
        const narrative = buildResultNarrative(session, selectActiveSourceDocument(input.documents, session.id));
        strengths.push(...narrative.strengths);
        limitations.push(...narrative.limitations);
    }
    strengths.push(...usableFindings(input.analyses, ['strength']).map(({ finding }) => finding.text));
    limitations.push(...usableFindings(input.analyses, ['limitation']).map(({ finding }) => finding.text));
    const recommendations = usableFindings(input.analyses, ['recommendation']).map(({ finding }) => finding.text);
    return {
        ...summary,
        strengths: summary.strengths.trim() ? summary.strengths : strengths.join('\n'),
        limitations: summary.limitations.trim() ? summary.limitations : limitations.join('\n'),
        recommendedPrograms: summary.recommendedPrograms.trim() ? summary.recommendedPrograms : recommendations.join('\n'),
    };
}
