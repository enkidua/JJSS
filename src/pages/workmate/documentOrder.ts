// ─── 고용지원(WorkMate) 화면의 저장 문서 순서·선택 규칙(React 없음) ───
// scripts/test-workmate-prompts.mjs에서 검증합니다.
import type { CaseDocument } from '../../types/caseDocument';

/** 저장 시각을 초 단위 숫자로. 형식이 섞여 있어도({ seconds }·ISO 문자열·숫자) 같은 기준으로 비교한다. 없으면 0 */
export function documentTimeSeconds(value: unknown): number {
    if (!value) return 0;
    if (typeof value === 'object' && typeof (value as { seconds?: unknown }).seconds === 'number') return (value as { seconds: number }).seconds;
    if (typeof value === 'string') { const time = new Date(value).getTime() / 1000; return Number.isFinite(time) ? time : 0; }
    if (typeof value === 'number') return value;
    return 0;
}

// ─── 사후관리 기록(상담일지·정기평가) ───

/**
 * 사후관리 기록을 작성일 순(오래된 것 → 최근 것)으로 맞춘다.
 * 저장소 조회 결과는 최신순으로 오는데, 프롬프트는 "배열의 끝이 최근"이라고 보고 끝에서 N건을 고르기 때문에
 * 그대로 넘기면 기록이 N건을 넘을 때 가장 오래된 기록이 "최근"이라는 이름으로 AI에 전달된다.
 * 작성일이 같으면 받은 순서를 유지한다(정렬은 안정 정렬).
 */
export function sortFollowUpsOldestFirst<T extends { createdAt?: unknown }>(history: T[]): T[] {
    return [...history].sort((a, b) => documentTimeSeconds(a.createdAt) - documentTimeSeconds(b.createdAt));
}

/** 가장 최근 기록 count건(오래된 것 → 최근 것 순). 넘겨받은 배열의 순서와 상관없이 작성일로 고른다. */
export function pickRecentFollowUps<T extends { createdAt?: unknown }>(history: T[], count: number): T[] {
    return count > 0 ? sortFollowUpsOldestFirst(history).slice(-count) : [];
}

// ─── 직무분석지 ───

type JobAnalysisDocLike = Pick<CaseDocument, 'id' | 'type' | 'jobId' | 'companyName' | 'jobRole' | 'createdAt' | 'updatedAt'>;

const lastSavedSeconds = (doc: { createdAt?: unknown; updatedAt?: unknown }) =>
    documentTimeSeconds(doc.updatedAt) || documentTimeSeconds(doc.createdAt);

/**
 * 저장된 직무분석지 중 지금 고른 사업체의 것만, 최근에 저장한 것부터.
 * jobId가 비어 있으면 등록된 사업체 없이 "직접 입력"으로 저장한 직무분석지(jobId 없음)만 돌려준다.
 * 이렇게 골라 다시 열어야 저장을 눌렀을 때 같은 문서를 고치게 되고, 열 때마다 새 문서가 하나씩 늘지 않는다.
 */
export function selectJobAnalysisDocs<T extends JobAnalysisDocLike>(docs: readonly T[], jobId: string): T[] {
    return docs
        .filter(doc => doc.type === 'job_analysis' && Boolean(doc.id) && (jobId ? doc.jobId === jobId : !doc.jobId))
        .sort((a, b) => lastSavedSeconds(b) - lastSavedSeconds(a));
}

const pad = (value: number) => String(value).padStart(2, '0');

/** 저장된 직무분석지 고르기 목록에 보이는 이름: "사업체 / 직무 · 2026-09-23 저장" */
export function jobAnalysisDocLabel(doc: JobAnalysisDocLike): string {
    const seconds = lastSavedSeconds(doc);
    const date = seconds ? new Date(seconds * 1000) : null;
    const dateText = date ? ` · ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 저장` : '';
    return `${doc.companyName || '사업체 미지정'} / ${doc.jobRole || '직무 미지정'}${dateText}`;
}
