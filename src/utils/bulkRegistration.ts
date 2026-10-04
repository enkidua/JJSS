/** 엑셀 TSV에서 앞/뒤의 탭도 빈 열이므로 전체 문자열을 trim하지 않는다. */
export function splitBulkRegistrationRows(text: string): string[] {
    return splitBulkRegistrationLines(text).map(row => row.text);
}

export interface BulkRegistrationLine {
    /** 붙여넣은 글의 원래 줄 번호(1부터). 빈 줄을 건너뛰어도 사용자가 본 줄 번호로 알려 주기 위해 남긴다. */
    line: number;
    text: string;
}

/** 빈 줄은 빼되, 각 행이 붙여넣은 글의 몇 번째 줄이었는지 함께 돌려준다. */
export function splitBulkRegistrationLines(text: string): BulkRegistrationLine[] {
    return text
        .split(/\r\n|\n|\r/)
        .map((row, index) => ({ line: index + 1, text: row }))
        .filter(row => row.text.trim() !== '');
}

function normalizeKeyPart(value: unknown): string {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 같은 등록인지 판단하는 열쇠.
 * 이용자: 이름 + 관리번호(관리번호가 다르면 같은 이름이어도 다른 사람). 사업체: 회사명 + 직무.
 */
export function bulkRegistrationKey(type: 'job' | 'seeker', item: Record<string, unknown>): string {
    return type === 'job'
        ? `job:${normalizeKeyPart(item.companyName)}|${normalizeKeyPart(item.jobRole)}`
        : `seeker:${normalizeKeyPart(item.name)}|${normalizeKeyPart(item.seekerId)}`;
}

export interface BulkDuplicatePlan<T> {
    /** 저장할 행 */
    toSave: T[];
    /** 이미 등록된 항목과 같은 행의 줄 번호 */
    existingLines: number[];
    /** 붙여넣은 내용 안에서 앞 행과 겹치는 행의 줄 번호 */
    repeatedLines: number[];
}

/** 이미 등록된 항목·같은 붙여넣기 안의 중복을 건너뛴다(다시 붙여넣어 같은 사람이 두 번 등록되지 않게). */
export function planBulkRegistration<T extends { line: number; key: string }>(rows: readonly T[], existingKeys: Iterable<string>): BulkDuplicatePlan<T> {
    const existing = new Set(existingKeys);
    const seen = new Set<string>();
    const toSave: T[] = [];
    const existingLines: number[] = [];
    const repeatedLines: number[] = [];
    for (const row of rows) {
        if (existing.has(row.key)) existingLines.push(row.line);
        else if (seen.has(row.key)) repeatedLines.push(row.line);
        else {
            seen.add(row.key);
            toSave.push(row);
        }
    }
    return { toSave, existingLines, repeatedLines };
}

/** 줄 번호 목록을 짧게 보여 준다. 예: "3, 7, 12번째 줄 외 4개" */
export function formatLineList(lines: readonly number[], limit = 8): string {
    if (!lines.length) return '';
    const shown = lines.slice(0, limit).join(', ');
    return lines.length > limit ? `${shown}번째 줄 외 ${lines.length - limit}개` : `${shown}번째 줄`;
}
