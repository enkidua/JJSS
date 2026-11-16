/**
 * 자주 쓰는 도구(별표). 이 PC의 화면 설정으로만 둔다(개인정보 아님, 백업·공유 대상 아님).
 * 홈 화면과 업무 지원 도구 화면이 같은 목록을 본다.
 */
export const TOOL_FAVORITES_STORAGE_KEY = 'jjss:tool-favorites:v1';
export const TOOL_FAVORITES_EVENT = 'jjss:tool-favorites-changed';
export const MAX_TOOL_FAVORITES = 12;

export interface ToolFavorite {
    /** 내부 도구는 "tool:<id>", 바깥 도구는 "link:<주소>" */
    key: string;
    title: string;
    /** 바깥 도구의 주소(https만) */
    url?: string;
}

function isFavorite(value: unknown): value is ToolFavorite {
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    if (typeof item.key !== 'string' || typeof item.title !== 'string' || !item.key || item.key.length > 300 || item.title.length > 100) return false;
    if (item.url !== undefined && (typeof item.url !== 'string' || !/^https:\/\//.test(item.url))) return false;
    return item.key.startsWith('tool:') || (item.key.startsWith('link:') && typeof item.url === 'string');
}

export function readToolFavorites(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): ToolFavorite[] {
    try {
        const parsed = JSON.parse(storage?.getItem(TOOL_FAVORITES_STORAGE_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];
        const seen = new Set<string>();
        return parsed.filter(isFavorite).filter(item => !seen.has(item.key) && seen.add(item.key)).slice(0, MAX_TOOL_FAVORITES)
            .map(item => ({ key: item.key, title: item.title, ...(item.url ? { url: item.url } : {}) }));
    } catch {
        return [];
    }
}

/** 별표를 켜거나 끈 새 목록을 돌려준다(가득 차면 가장 오래된 것을 뺀다). */
export function toggleToolFavorite(current: readonly ToolFavorite[], favorite: ToolFavorite): ToolFavorite[] {
    if (current.some(item => item.key === favorite.key)) return current.filter(item => item.key !== favorite.key);
    return [...current, favorite].slice(-MAX_TOOL_FAVORITES);
}

export function writeToolFavorites(favorites: readonly ToolFavorite[], storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): void {
    try {
        storage?.setItem(TOOL_FAVORITES_STORAGE_KEY, JSON.stringify(favorites.filter(isFavorite).slice(0, MAX_TOOL_FAVORITES)));
    } catch {
        // 저장하지 못해도 이번 화면에서는 그대로 보인다.
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(TOOL_FAVORITES_EVENT));
}

/** 도구 검색: 띄어쓰기로 나눈 낱말이 모두 들어 있으면 맞는 것으로 본다(대소문자·공백 무시). */
export function matchesToolQuery(query: string, ...fields: Array<string | undefined>): boolean {
    const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const haystack = fields.filter(Boolean).join(' ').toLowerCase();
    const compact = haystack.replace(/\s+/g, '');
    return words.every(word => haystack.includes(word) || compact.includes(word));
}
