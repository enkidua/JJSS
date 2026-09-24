/** 로컬(PC 시간대) 기준 YYYY-MM-DD. `toISOString()`은 UTC라 KST 오전 9시 전에는 전날이 되므로 쓰지 않습니다. */
export function localDateKey(date: Date = new Date()): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** 로컬 기준 YYYYMMDD (파일명용). */
export function localDateCompact(date: Date = new Date()): string {
    return localDateKey(date).replace(/-/g, '');
}

/** 'YYYY-MM-DD' 문자열을 로컬 자정 Date로 변환합니다. `new Date('YYYY-MM-DD')`는 UTC 자정으로 해석됩니다. */
export function parseLocalDate(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
}
