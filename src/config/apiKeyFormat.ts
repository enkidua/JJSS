/**
 * API 키 형식 판별(네트워크 없음). 입력 칸과 실제 키의 제공업체가 맞지 않는 실수
 * (예: OpenAI 칸에 Gemini 키 "AIza…")를 입력하는 순간 알려 주기 위한 순수 함수 모음이다.
 *
 * 형식만 본다. 키가 실제로 유효한지는 연결 확인(connectionCheck)이 판단한다.
 * Gemini 키와 Vision 키는 둘 다 Google Cloud 키(AIza…)라 형식으로는 구분할 수 없다.
 */

export type ApiKeySlot = 'gemini' | 'openai' | 'anthropic' | 'vision';
export type KeyFamily = 'google' | 'openai' | 'anthropic';

export const API_KEY_SLOT_LABELS: Record<ApiKeySlot, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic Claude',
    vision: 'Google Cloud Vision',
};

const FAMILY_LABELS: Record<KeyFamily, string> = {
    google: 'Google(Gemini·Vision)',
    openai: 'OpenAI',
    anthropic: 'Anthropic Claude',
};

const SLOT_FAMILY: Record<ApiKeySlot, KeyFamily> = {
    gemini: 'google',
    vision: 'google',
    openai: 'openai',
    anthropic: 'anthropic',
};

export interface NormalizedKeyInput {
    value: string;
    /** 사용자에게 알릴 정리 내용(예: "앞뒤 따옴표를 지웠습니다") */
    notes: string[];
}

/**
 * 붙여 넣을 때 흔히 딸려 오는 것을 지운다: 앞뒤·중간 공백과 줄바꿈, 감싼 따옴표,
 * "Bearer "·"Authorization:"·"x-api-key:"·"OPENAI_API_KEY=" 같은 접두어.
 */
export function normalizeApiKeyInput(raw: string): NormalizedKeyInput {
    const notes: string[] = [];
    let value = String(raw ?? '');
    const strip = (pattern: RegExp, note: string) => {
        const next = value.replace(pattern, '');
        if (next !== value) {
            notes.push(note);
            value = next;
        }
    };
    // 앞뒤 공백·줄바꿈은 흔하므로 알리지 않고 지운다.
    value = value.trim();
    strip(/^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*KEY\s*=\s*/i, '"이름=값" 형식의 앞부분을 지웠습니다.');
    strip(/^(?:authorization\s*:\s*)?bearer\s+/i, '"Bearer" 접두어를 지웠습니다.');
    strip(/^(?:x-api-key|x-goog-api-key|api[-_ ]?key)\s*:\s*/i, '헤더 이름 접두어를 지웠습니다.');
    strip(/^['"`“”‘’]+|['"`“”‘’,;]+$/g, '키를 감싼 따옴표·쉼표를 지웠습니다.');
    strip(/\s+/g, '키 중간의 공백·줄바꿈을 지웠습니다.');
    return { value, notes };
}

/** 키 모양으로 제공업체를 추정한다. 모르면 null. */
export function detectKeyFamily(key: string): KeyFamily | null {
    const value = String(key ?? '').trim();
    if (!value) return null;
    if (/^AIza[0-9A-Za-z_-]{30,}$/.test(value)) return 'google';
    if (/^sk-ant-[0-9A-Za-z_-]{20,}$/.test(value)) return 'anthropic';
    if (/^sk-(?:proj-|svcacct-|admin-|None-)?[0-9A-Za-z_-]{20,}$/.test(value)) return 'openai';
    return null;
}

export type KeyFormatVerdict =
    | { status: 'empty' }
    | { status: 'ok'; family: KeyFamily }
    /** 다른 제공업체의 키 형식 — 이 칸에서는 동작하지 않는다. */
    | { status: 'mismatch'; family: KeyFamily; suggestedSlot: ApiKeySlot; message: string }
    /** 어느 제공업체 형식과도 맞지 않는다(잘림·일부만 복사 등). 저장은 막지 않는다. */
    | { status: 'unknown'; message: string };

/**
 * 다른 제공업체 형식의 키는 이 칸에서 쓰지 않는다(요청에 실어 보내면 그 비밀값이 엉뚱한 서비스로 나간다).
 * 저장은 막지 않되(사용자가 옮기거나 고칠 수 있게) 전송 직전에는 반드시 이 검사를 거친다.
 */
export function isKeyUsableForSlot(slot: ApiKeySlot, key: string): boolean {
    const verdict = checkKeyFormatForSlot(slot, key);
    return verdict.status !== 'empty' && verdict.status !== 'mismatch';
}

/** 전송 직전 검사: 다른 제공업체 형식이면 보내지 않고 안내 오류를 던진다. */
export function assertKeyUsableForSlot(slot: ApiKeySlot, key: string): void {
    const verdict = checkKeyFormatForSlot(slot, key);
    if (verdict.status === 'mismatch') {
        throw Object.assign(new Error(`${verdict.message} 설정 → API 키에서 ${API_KEY_SLOT_LABELS[verdict.suggestedSlot]} 칸으로 옮겨 주세요.`), { code: 'API_KEY_SLOT_MISMATCH', slot, suggestedSlot: verdict.suggestedSlot });
    }
}

/** 이 칸(slot)에 이 키를 넣는 것이 형식상 맞는지 판정한다. */
export function checkKeyFormatForSlot(slot: ApiKeySlot, key: string): KeyFormatVerdict {
    const value = String(key ?? '').trim();
    if (!value) return { status: 'empty' };
    const family = detectKeyFamily(value);
    if (!family) {
        return {
            status: 'unknown',
            message: `${API_KEY_SLOT_LABELS[slot]} 키 형식과 다릅니다. 발급받은 키 전체를 복사했는지(앞뒤가 잘리지 않았는지) 확인해 주세요.`,
        };
    }
    if (family === SLOT_FAMILY[slot]) return { status: 'ok', family };
    const suggestedSlot: ApiKeySlot = family === 'google' ? 'gemini' : family;
    return {
        status: 'mismatch',
        family,
        suggestedSlot,
        message: `이 키는 ${FAMILY_LABELS[family]} 키 형식입니다. ${API_KEY_SLOT_LABELS[slot]} 칸에 넣으면 동작하지 않습니다.`,
    };
}

/** 칸에 맞는 키 형식 안내(입력 칸 아래 도움말). */
export const API_KEY_FORMAT_HINTS: Record<ApiKeySlot, string> = {
    gemini: 'Google AI Studio 키는 "AIza"로 시작합니다.',
    vision: 'Google Cloud 키는 "AIza"로 시작합니다.',
    openai: 'OpenAI 키는 "sk-" 또는 "sk-proj-"로 시작합니다.',
    anthropic: 'Claude 키는 "sk-ant-"로 시작합니다.',
};
