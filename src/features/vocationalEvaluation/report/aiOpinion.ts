/**
 * 결과분석기·종합소견서 공용 입력 조립 + 종합소견 항목 나누기.
 *
 * 평가 진행은 **입력자료 공급자**다: 회차에 모인 재료(기본정보·KEAD 기록·공식 결과지·관찰·분석지)를
 * 한 벌의 참고 내용으로 조립해, 기존 결과분석기 엔진(analyzeTestResults)과
 * 기존 종합소견서 엔진(generateReport)에 그대로 전달한다. 새 AI 엔진을 만들지 않는다.
 *
 * 이 모듈은 순수 함수만 둔다. 실제 AI 호출(services/gemini)은 화면 쪽에서 한다 —
 * 개인정보 관문(prepareAIOutboundText)은 두 엔진 안에서 그대로 적용된다.
 */
import { EPISODE_NEED_KEYS, EPISODE_NEED_LABELS, type EvaluationEpisode } from '../model/episode';
import { EVALUATION_VENUE_LABELS, type TestSession } from '../model/types';
import { buildObservationNarrative } from '../observations/narrative';
import { adoptedClaims, claimText, type InterpretationRun } from '../interpretation/run';
import { selectActiveSourceDocument } from '../sourceDocument/record';
import type { SourceDocumentRecord } from '../sourceDocument/types';
import { outboundAnalysisTitle, type AnalysisDocumentRecord } from '../analysisDocument/model';
import { getTestPlugin } from '../tests/registry';
import { buildResultNarrative } from './narrative';
import type { ReportSummary } from './model';

export interface OpinionReferenceInput {
    episode: EvaluationEpisode;
    sessions: TestSession[];
    documents: SourceDocumentRecord[];
    analyses?: AnalysisDocumentRecord[];
    /** 이용자 기본정보(구직자 관리에서 가져온 값). 이름은 AI 엔진의 knownNames로 가려진다. */
    profile?: { birthDate?: string; sex?: string; disability?: string; desiredJobs?: string };
    /**
     * ⑥ 결과 분석 본문을 참고 내용에 포함할지.
     * 종합소견(⑦) 입력이면 true(기본), 결과 분석 자체(⑥)의 입력이면 false.
     */
    includeResultAnalysis?: boolean;
    /**
     * 예전 claim 기반 AI 해석(채택 문장)을 포함할지. **기본 false** —
     * AI가 만든 문장이 다시 AI 입력이 되어 이중으로 영향을 주지 않게 한다.
     * (호환·고급 경로에서만 true로 켠다. claim 기록 자체는 보고서 조립에 그대로 남는다.)
     */
    includeLegacyClaims?: boolean;
}

/** AI에 보낼 참고 내용. 회차에 모인 확정 값·관찰·해석·분석지 문장을 항목별로 정리한다. */
export function buildOpinionReference(input: OpinionReferenceInput): string {
    const { episode, sessions, documents } = input;
    const lines: string[] = [];
    const section = (title: string, body: string[]) => {
        const kept = body.filter(item => item.trim());
        if (!kept.length) return;
        lines.push(`[${title}]`, ...kept, '');
    };

    section('평가 개요', [
        `- 이용자: ${episode.seekerName}${input.profile?.sex ? ` (${input.profile.sex}` : ''}${
            input.profile?.sex && input.profile?.birthDate ? `, 생년월일 ${input.profile.birthDate})` : input.profile?.sex ? ')' : ''
        }`,
        input.profile?.disability ? `- 장애유형/정도: ${input.profile.disability}` : '',
        `- 평가일: ${episode.evaluationDate || '미정'} · 평가유형: ${EVALUATION_VENUE_LABELS[episode.venue]}`,
        episode.evaluationOrganization ? `- 평가실시기관: ${episode.evaluationOrganization}` : '',
        episode.referralOrganization ? `- 의뢰요청기관: ${episode.referralOrganization}` : '',
        (() => {
            const needs = EPISODE_NEED_KEYS.filter(key => episode.needs[key]).map(key => EPISODE_NEED_LABELS[key]);
            return needs.length ? `- 평가 욕구: ${needs.join(', ')}` : '';
        })(),
        episode.purpose ? `- 평가목적: ${episode.purpose}` : '',
        input.profile?.desiredJobs ? `- 당사자 희망직종(이용자 등록 정보): ${input.profile.desiredJobs}` : '',
    ]);

    section('장애 및 진단이력', episode.disabilityHistory ? [episode.disabilityHistory] : []);
    section('교육훈련 및 직업경력', episode.careerHistory ? [episode.careerHistory] : []);

    for (const session of sessions) {
        const plugin = getTestPlugin(session.testPluginId);
        const document = selectActiveSourceDocument(documents, session.id);
        const narrative = buildResultNarrative(session, document);
        const observations = session.observations
            .map(item => buildObservationNarrative(item))
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .map(item => `- (행동관찰) ${item.text}`);
        section(`검사 결과 — ${plugin.manifest.name}`, [
            narrative.fromOfficialDocument ? '- 공식 결과지에서 확정한 값이다.' : '- 앱에 기록한 값이다(공식 결과지 미연결).',
            ...narrative.paragraphs.map(item => `- ${item.text}`),
            ...observations,
        ]);
    }

    if (input.includeLegacyClaims === true) {
        const claims = (episode.interpretations as InterpretationRun[]).flatMap(run => adoptedClaims(run)).map(claim => `- ${claimText(claim)}`);
        section('평가사가 채택한 해석 문장', claims);
    }

    // ⑥에서 만든(그리고 평가사가 고친) 결과 분석은 종합소견의 핵심 입력이다.
    if (input.includeResultAnalysis !== false && episode.resultAnalysis?.text.trim()) {
        section('검사 결과 분석(⑥ 결과 해석에서 작성·검토한 내용)', [episode.resultAnalysis.text.trim()]);
    }

    // 제목은 문서에서 읽은 검사 이름만 쓴다. 실제 파일 이름(이용자 이름·기관명이 들어 있을 수 있음)은 보내지 않는다.
    (input.analyses ?? []).forEach((record, index) => {
        const findings = record.findings
            .filter(finding => finding.included && !finding.blocked && finding.text.trim())
            .map(finding => `- ${finding.text.trim()}`);
        section(`그 밖의 검사 분석지 — ${outboundAnalysisTitle(record, index)}`, findings);
    });

    section('평가사 메모', episode.note ? [episode.note] : []);
    return lines.join('\n').trim();
}

/* ── ⑥ 결과 분석의 최신성(입력 자료 지문) ─────────────────────────── */

/**
 * 결과 분석 입력 자료의 지문. 분석을 만들 때 이 값을 함께 저장하고,
 * 이후 KEAD 원자료·공식 결과지·행동관찰·분석지·기본정보가 바뀌면 지문이 달라져
 * 저장된 분석이 **이전 자료 기준(STALE)** 임을 알 수 있다.
 *
 * 참고 내용 문자열 자체가 입력 자료의 스냅샷이므로 그 문자열을 해시한다
 * (⑥ 결과분석 본문과 legacy claim은 입력이 아니므로 제외하고 계산한다).
 * 보안용이 아니라 변경 감지용이다(report/model.ts의 지문과 같은 성격).
 */
export function analysisSourceHash(input: Omit<OpinionReferenceInput, 'includeResultAnalysis' | 'includeLegacyClaims'>): string {
    const content = buildOpinionReference({ ...input, includeResultAnalysis: false, includeLegacyClaims: false });
    let high = 0x811c9dc5;
    let low = 0x811c9dc5;
    for (let index = 0; index < content.length; index += 1) {
        const code = content.charCodeAt(index);
        high = Math.imul(high ^ code, 0x01000193) >>> 0;
        low = Math.imul(low ^ ((code << 5) | (code >>> 3)), 0x85ebca6b) >>> 0;
    }
    return `${high.toString(16).padStart(8, '0')}${low.toString(16).padStart(8, '0')}`;
}

/**
 * 저장된 결과 분석이 지금 자료 기준으로 유효한지.
 * 지문이 없으면(이전 형식) 보수적으로 STALE로 본다 — 오래된 분석을 조용히 쓰지 않는다.
 */
export function isResultAnalysisCurrent(
    analysis: { sourceHash?: string } | undefined,
    currentHash: string,
): boolean {
    return Boolean(analysis?.sourceHash && analysis.sourceHash === currentHash);
}

/* ── AI 출력(8개 항목) 나눠 담기 ─────────────────────────────────── */

export type OpinionFieldKey = Extract<
    keyof ReportSummary,
    'strengths' | 'limitations' | 'vocationalLevel' | 'supportNeeds' | 'recommendation' | 'recommendedPrograms' | 'overallOpinion'
>;

/** 항목 번호·제목 → 요약 칸. 제목이 조금 달라도 핵심 낱말로 알아본다. */
const OPINION_SECTIONS: ReadonlyArray<{ no: number; key: OpinionFieldKey | 'goals'; title: RegExp }> = [
    // 항목 본문 안의 번호 줄(예: "3. 지원고용 연계: …")을 새 항목으로 오인하지 않게, 제목은 항목 이름 그대로만 알아본다.
    { no: 1, key: 'strengths', title: /^직업적?\s*강\s*점/ },
    { no: 2, key: 'limitations', title: /^제한\s*점|^고려\s*사항/ },
    { no: 3, key: 'vocationalLevel', title: /^직업\s*수준/ },
    { no: 4, key: 'goals', title: /^직업\s*목표/ },
    { no: 5, key: 'supportNeeds', title: /^지원이?\s*필요한?\s*사항|^필요한\s*지원/ },
    // 제목 전체를 소진하도록 쓴다 — 일부만 맞으면 남은 제목 조각("프로그램", "정보")이 본문 첫 줄로 샌다.
    { no: 6, key: 'recommendation', title: /^추천\s*직무\s*및\s*권고\s*프로그램|^추천\s*직무\s*및\s*권고|^추천\s*직무.*프로그램$|^권고\s*프로그램/ },
    { no: 7, key: 'recommendedPrograms', title: /^추천\s*직무\s*세부\s*정보|^추천\s*직무\s*세부|세부\s*정보\s*$/ },
    { no: 8, key: 'overallOpinion', title: /^종합\s*소견/ },
];

export interface ParsedOpinion {
    /** 나눠 담은 칸(직업목표는 goalSelf·goalGuardian으로 갈라 담는다) */
    fields: Partial<ReportSummary>;
    /** 알아본 항목 수. 4개 미만이면 전문을 종합소견 칸에 그대로 담는다 */
    matchedSections: number;
}

const HEADER_PATTERN = /^\s*([1-9])\s*[.)]\s*(.*)$/;

function findSection(no: number, title: string): (typeof OPINION_SECTIONS)[number] | null {
    const byNumber = OPINION_SECTIONS.find(item => item.no === no);
    if (byNumber && (byNumber.title.test(title) || !title.trim())) return byNumber;
    // 번호가 밀렸어도 제목이 확실하면 제목을 믿는다.
    return OPINION_SECTIONS.find(item => item.title.test(title)) ?? byNumber ?? null;
}

/**
 * 직업목표 항목을 당사자/보호자 줄로 가른다. 못 가른 줄은 당사자 쪽에 둔다.
 * "당사자:"/"보호자:" 라벨은 떼어 낸다 — 칸 이름이 이미 그 역할을 하므로 남기면 라벨이 두 번 찍힌다.
 */
function splitGoals(body: string): { goalSelf: string; goalGuardian: string } {
    const self: string[] = [];
    const guardian: string[] = [];
    for (const line of body.split('\n')) {
        const trimmed = line.trim().replace(/^[-•]\s*/, '');
        if (!trimmed) continue;
        if (/^(보호자|지원자)/.test(trimmed)) {
            guardian.push(trimmed.replace(/^(?:보호자|지원자)(?:\s*[(/·]\s*(?:보호자|지원자)\s*\)?)?\s*[:：]?\s*/, ''));
        } else {
            self.push(trimmed.replace(/^당사자\s*[:：]?\s*/, ''));
        }
    }
    return { goalSelf: self.join('\n'), goalGuardian: guardian.join('\n') };
}

/**
 * 항목 제목 줄에서 제목 뒤에 붙은 본문을 떼어 낸다.
 * "1. 직업적 강점: 내용", "1) 직업적 강점 - 내용" 같은 형태에서 내용이 사라지면 안 된다.
 * 제목 자체에 붙은 괄호("직업목표(당사자 및 보호자/지원자 목표)")는 본문이 아니므로 함께 걷어 낸다.
 */
function sameLineBody(title: string, matched: RegExpExecArray): string {
    return title
        .slice(matched.index + matched[0].length)
        .replace(/^\s*\([^)]*\)/, '')
        .replace(/^[\s:：·\-–—~>]+/, '')
        .trim();
}

/** AI가 돌려준 8개 항목 글을 요약 칸으로 나눈다. 항목을 거의 못 알아보면 전문을 종합소견에 담는다. */
export function parseOpinionText(text: string): ParsedOpinion {
    const clean = text.replace(/\r\n/g, '\n').trim();
    const sections: Array<{ key: (typeof OPINION_SECTIONS)[number]['key']; body: string[] }> = [];
    let current: { key: (typeof OPINION_SECTIONS)[number]['key']; body: string[] } | null = null;

    for (const raw of clean.split('\n')) {
        // 마크다운을 쓰지 말라고 지시하지만, "### 1. 직업적 강점"처럼 붙여 보내도 알아본다.
        const line = raw.replace(/^\s*#{1,6}\s*/, '').replace(/^\s*\*\*(.*)\*\*\s*$/, '$1');
        const header = line.match(HEADER_PATTERN);
        const matched = header ? findSection(Number(header[1]), header[2]) : null;
        // 번호 줄이라도 소견 문장("1분 30초…")일 수 있어, 아는 제목일 때만 새 항목으로 본다.
        const titleMatch = matched && header ? matched.title.exec(header[2]) : null;
        if (matched && header && titleMatch) {
            current = { key: matched.key, body: [] };
            sections.push(current);
            // 제목과 내용이 한 줄에 붙어 온 경우("1. 직업적 강점: …") 내용을 버리지 않는다.
            const rest = sameLineBody(header[2], titleMatch);
            if (rest) current.body.push(rest);
            continue;
        }
        if (current) current.body.push(raw);
    }

    const fields: Partial<ReportSummary> = {};
    for (const item of sections) {
        const body = item.body.join('\n').trim();
        if (!body) continue;
        if (item.key === 'goals') {
            const goals = splitGoals(body);
            if (goals.goalSelf) fields.goalSelf = goals.goalSelf;
            if (goals.goalGuardian) fields.goalGuardian = goals.goalGuardian;
        } else {
            fields[item.key] = body;
        }
    }

    const matchedSections = sections.length;
    if (matchedSections < 4) {
        // 형식이 무너졌으면 내용을 잃지 않는 쪽을 고른다: 전문을 종합소견 칸에 담고 평가사가 나눈다.
        return { fields: clean ? { overallOpinion: clean } : {}, matchedSections };
    }
    return { fields, matchedSections };
}

/** 나눠 담은 칸을 요약에 덮어쓴다. AI가 채우지 못한 칸은 기존 값을 그대로 둔다. */
export function applyOpinion(summary: ReportSummary, parsed: ParsedOpinion): ReportSummary {
    return { ...summary, ...parsed.fields };
}
