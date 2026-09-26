/**
 * 검사 분석지(결과지) 기록 — KEAD 손기능·양손협응 외의 모든 평가 자료.
 * (직업흥미검사, 사회적응도 CISA-2, MDS, 수용어휘력검사, 신체능력 측정표 등)
 *
 * 목적: 분석지 여러 장을 넣으면 문서에 적힌 내용이 **보고서 영역별 문장**으로 정리되어,
 * ⑦ 보고서에서 해당 섹션(심리진단·사회진단 등)에 자동으로 들어간다. 소견서 작성의 재료다.
 *
 * 원칙
 *  - 문서에 적힌 내용만 옮긴다. 새 해석·진단·판단을 만들지 않는다.
 *  - 취업 가능·직무 적합 같은 단정 표현은 자동으로 제외 표시한다(평가사 판단 영역).
 *  - AI 없이도 쓸 수 있다: 직접 입력(MANUAL)으로 같은 기록을 만든다.
 *  - 저장은 기존 caseDocuments 문서(암호화)로 한다. 새 store를 만들지 않는다.
 */
import { createId } from '../ids';
import type { ISODateTime } from '../model/types';

export const VE_ANALYSIS_DOCUMENT_VERSION = 1 as const;

/** 보고서 영역. REPORT_SECTIONS의 id + 요약 초안 칸(강점·제한점·추천) */
export const ANALYSIS_AREAS = [
    'disability',
    'career',
    'living',
    'social',
    'physical',
    'psychological',
    'vocational',
    'strength',
    'limitation',
    'recommendation',
] as const;
export type AnalysisArea = (typeof ANALYSIS_AREAS)[number];

export const ANALYSIS_AREA_LABELS: Record<AnalysisArea, string> = {
    disability: '장애 및 진단이력',
    career: '교육훈련 및 직업경력',
    living: '생활적응능력',
    social: '사회진단(행동관찰 포함)',
    physical: '신체적 능력',
    psychological: '심리진단',
    vocational: '직업진단',
    strength: '직업적 강점(요약)',
    limitation: '제한점·고려사항(요약)',
    recommendation: '추천 직무·프로그램(요약)',
};

/** 분류를 알 수 없는 문장이 떨어지는 곳. 평가사가 영역을 바꿔 주면 된다. */
export const ANALYSIS_FALLBACK_AREA: AnalysisArea = 'social';

export interface AnalysisFinding {
    id: string;
    area: AnalysisArea;
    /** 보고서에 그대로 넣을 수 있는 완성 문장 */
    text: string;
    /** 보고서 자동 조립에 넣을지. 차단(blocked)된 문장은 항상 false */
    included: boolean;
    /** 자동 제외 사유(취업 단정·개인 식별정보 등). 있으면 included를 켤 수 없다 */
    blocked?: string;
}

export interface AnalysisDocumentRecord {
    version: number;
    id: string;
    episodeId: string;
    seekerId: string;
    seekerName: string;
    /** 화면에만 쓰는 파일 이름. 외부로 보내지 않는다. 직접 입력이면 빈 문자열 */
    fileName: string;
    fileSize: number;
    sha256: string;
    pageCount: number | null;
    /** 문서에 적힌 검사 이름 */
    detectedTitle?: string;
    source: 'AI' | 'MANUAL';
    extractionStatus: 'SUCCEEDED' | 'FAILED';
    model?: string;
    extractedAt?: ISODateTime;
    failureReason?: string;
    findings: AnalysisFinding[];
    warnings: string[];
    createdAt?: ISODateTime;
    updatedAt?: ISODateTime;
}

const MAX_FINDINGS = 60;
const MAX_TEXT = 600;
const MAX_TITLE = 120;

/**
 * 자동 포함을 막아야 하는 문장인지. 막는 것은 두 갈래다:
 *  - 취업·고용·직무 적합 단정: 평가사만 판단할 수 있는 내용이라 자동으로 옮기지 않는다.
 *  - 연락처·주민등록번호 형태: 분석지에 인쇄돼 있더라도 보고서 초안에 자동으로 넣지 않는다.
 * 문장 자체는 남겨 두고 사유를 표시한다 — 무엇이 걸러졌는지 평가사가 볼 수 있어야 한다.
 */
export function analysisGuardIssue(text: string): string | null {
    const normalized = text.normalize('NFKC');
    if (/(취업|고용|채용).{0,12}(가능|불가능|어렵|힘들)|직무.{0,12}(적합|부적합)|(채용|배치)\s*(을|를)?\s*(추천|권고)/.test(normalized)) {
        return '취업·직무 적합 단정은 평가사가 직접 판단해 적습니다.';
    }
    if (/\d{2,3}\s*-\s*\d{3,4}\s*-\s*\d{4}|\d{6}\s*-\s*[1-8]\d{6}/.test(normalized)) {
        return '연락처·주민등록번호 형태가 있어 자동으로 넣지 않습니다.';
    }
    return null;
}

export function createAnalysisFinding(area: AnalysisArea, text: string): AnalysisFinding {
    const trimmed = text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    const blocked = trimmed ? analysisGuardIssue(trimmed) : null;
    return {
        id: createId('vefind'),
        area,
        text: trimmed,
        included: !blocked && trimmed.length > 0,
        ...(blocked ? { blocked } : {}),
    };
}

export function createAnalysisDocument(input: {
    episodeId: string;
    seekerId: string;
    seekerName: string;
    fileName?: string;
    fileSize?: number;
    sha256?: string;
    pageCount?: number | null;
    source: 'AI' | 'MANUAL';
}): AnalysisDocumentRecord {
    const now = new Date().toISOString();
    return {
        version: VE_ANALYSIS_DOCUMENT_VERSION,
        id: createId('veanalysis'),
        episodeId: input.episodeId,
        seekerId: input.seekerId,
        seekerName: input.seekerName,
        fileName: input.fileName ?? '',
        fileSize: input.fileSize ?? 0,
        sha256: input.sha256 ?? '',
        pageCount: input.pageCount ?? null,
        source: input.source,
        extractionStatus: 'SUCCEEDED',
        findings: [],
        warnings: [],
        createdAt: now,
        updatedAt: now,
    };
}

/* ── AI 응답 정리 ─────────────────────────────────────────────── */

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

function normalizeArea(value: unknown, warnings: string[]): AnalysisArea {
    const area = str(value).trim();
    if ((ANALYSIS_AREAS as readonly string[]).includes(area)) return area as AnalysisArea;
    if (area) warnings.push(`분류를 알 수 없는 영역(${area.slice(0, 20)})은 "${ANALYSIS_AREA_LABELS[ANALYSIS_FALLBACK_AREA]}"에 두었습니다.`);
    return ANALYSIS_FALLBACK_AREA;
}

/** AI 응답(JSON)을 기록으로 정리한다. 문장이 하나도 없으면 null. */
export function normalizeAnalysisExtraction(raw: unknown): {
    detectedTitle: string;
    findings: AnalysisFinding[];
    warnings: string[];
} | null {
    if (!raw || typeof raw !== 'object') return null;
    const source = raw as Record<string, unknown>;
    const warnings = Array.isArray(source.warnings) ? source.warnings.map(str).filter(Boolean).slice(0, 10) : [];
    const rawFindings = Array.isArray(source.findings) ? source.findings : [];
    const findings: AnalysisFinding[] = [];
    for (const item of rawFindings.slice(0, MAX_FINDINGS)) {
        if (!item || typeof item !== 'object') continue;
        const entry = item as Record<string, unknown>;
        const text = str(entry.text).replace(/\s+/g, ' ').trim();
        if (!text) continue;
        findings.push(createAnalysisFinding(normalizeArea(entry.area, warnings), text));
    }
    if (!findings.length) return null;
    return { detectedTitle: str(source.detectedTitle).trim().slice(0, MAX_TITLE), findings, warnings };
}

/** 코드 펜스가 붙어 와도 JSON을 꺼낸다(결과지 파서와 같은 관용). */
export function parseAnalysisJson(body: string): unknown | null {
    const text = String(body ?? '').trim();
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
    const candidate = (fenced ? fenced[1] : text).trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(candidate.slice(start, end + 1));
    } catch {
        return null;
    }
}

/* ── 저장 직렬화 ─────────────────────────────────────────────── */

export function normalizeAnalysisDocument(value: AnalysisDocumentRecord): AnalysisDocumentRecord {
    const warnings = Array.isArray(value.warnings) ? value.warnings.map(str).filter(Boolean).slice(0, 10) : [];
    const findings = (Array.isArray(value.findings) ? value.findings : [])
        .slice(0, MAX_FINDINGS)
        .map(finding => {
            const text = str(finding.text).slice(0, MAX_TEXT);
            const blocked = analysisGuardIssue(text) ?? undefined;
            return {
                id: str(finding.id) || createId('vefind'),
                area: (ANALYSIS_AREAS as readonly string[]).includes(finding.area) ? finding.area : ANALYSIS_FALLBACK_AREA,
                text,
                // 차단 사유가 있으면 저장본을 고쳐도 자동 포함으로 되살아나지 않는다.
                included: Boolean(finding.included) && !blocked && text.length > 0,
                ...(blocked ? { blocked } : {}),
            } satisfies AnalysisFinding;
        })
        .filter(finding => finding.text.length > 0);
    return {
        ...value,
        version: VE_ANALYSIS_DOCUMENT_VERSION,
        seekerName: str(value.seekerName),
        fileName: str(value.fileName),
        detectedTitle: value.detectedTitle ? str(value.detectedTitle).slice(0, MAX_TITLE) : undefined,
        source: value.source === 'MANUAL' ? 'MANUAL' : 'AI',
        extractionStatus: value.extractionStatus === 'FAILED' ? 'FAILED' : 'SUCCEEDED',
        findings,
        warnings,
    };
}

export function serializeAnalysisDocument(value: AnalysisDocumentRecord): string {
    return JSON.stringify(normalizeAnalysisDocument(value));
}

export function parseAnalysisDocument(content: string): { ok: true; record: AnalysisDocumentRecord } | { ok: false; error: string } {
    try {
        const parsed = JSON.parse(content) as AnalysisDocumentRecord;
        if (!parsed || typeof parsed !== 'object') return { ok: false, error: '형식이 아닙니다.' };
        if (parsed.version !== VE_ANALYSIS_DOCUMENT_VERSION) return { ok: false, error: `지원하지 않는 버전(${String(parsed.version)})` };
        if (!parsed.id || !parsed.episodeId) return { ok: false, error: '필수 값이 없습니다.' };
        return { ok: true, record: normalizeAnalysisDocument(parsed) };
    } catch {
        return { ok: false, error: 'JSON을 읽지 못했습니다.' };
    }
}

/** 분석지 제목(화면·보고서 출처 표시용) */
export function analysisTitle(record: Pick<AnalysisDocumentRecord, 'detectedTitle' | 'fileName' | 'source'>): string {
    return record.detectedTitle || record.fileName || (record.source === 'MANUAL' ? '직접 입력 분석지' : '분석지');
}
