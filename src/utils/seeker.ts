interface SeekerLike { id?: string | number | null; seekerId?: string | number | null; name?: string | null }

/**
 * 이용자 식별 키. id → seekerId 순으로 사용합니다.
 * 이름은 동명이인 혼입 위험이 있어 기본적으로 쓰지 않으며, 과거 문서 호환이 꼭 필요할 때만 allowNameFallback을 켭니다.
 */
export function getSeekerKey(seeker: SeekerLike | null | undefined, options: { allowNameFallback?: boolean } = {}): string {
    if (!seeker) return '';
    const key = seeker.id ?? seeker.seekerId;
    if (key !== undefined && key !== null && String(key).trim()) return String(key);
    return options.allowNameFallback && seeker.name ? String(seeker.name) : '';
}

/** 두 이용자가 같은 사람인지 식별자로만 비교합니다(이름 비교 없음). */
export function isSameSeeker(a: SeekerLike | null | undefined, b: SeekerLike | null | undefined): boolean {
    const aKeys = [a?.id, a?.seekerId].filter(v => v !== undefined && v !== null && String(v).trim()).map(String);
    const bKeys = [b?.id, b?.seekerId].filter(v => v !== undefined && v !== null && String(v).trim()).map(String);
    return aKeys.some(key => bKeys.includes(key));
}
