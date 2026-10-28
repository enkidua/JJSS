/**
 * 실제 AI 요청이 "API 키가 거부됨"으로 실패했을 때의 공통 처리.
 * - 그 칸의 키 상태를 "실패"로 기록해 설정 화면에 표지를 남긴다.
 * - 화면에 "키가 거부되었습니다" 안내창을 띄우도록 알린다(같은 제공업체는 30초에 한 번).
 * - 키 형식이 칸과 맞지 않으면(OpenAI 칸에 Gemini 키 등) 그 원인을 함께 알려 준다.
 *
 * 키 원문은 기록하지 않는다(지문만). 오류 원문(제공업체 메시지)도 화면에 내보내지 않는다.
 */
import type { AIProvider } from '../config/aiModels';
import { API_KEY_SLOT_LABELS, checkKeyFormatForSlot, type ApiKeySlot } from '../config/apiKeyFormat';
import { classifyAIFailoverReason } from './aiErrorClassification';
import { recordApiKeyStatus } from './apiKeyStatus';

export const API_KEY_REJECTED_EVENT = 'jjss:api-key-rejected';

export interface ApiKeyRejectedDetail {
    slot: ApiKeySlot;
    message: string;
}

const lastNotified = new Map<ApiKeySlot, number>();
const NOTIFY_INTERVAL_MS = 30_000;

/** 오류가 키 거부(인증 실패)인가 */
export function isApiKeyRejection(error: unknown): boolean {
    const candidate = error as { reason?: unknown } | null;
    if (candidate?.reason === 'api-key') return true;
    return classifyAIFailoverReason(error) === 'authError';
}

/** 키 거부 안내문: 어느 칸의 키인지, 형식이 맞는지, 다음에 할 일 */
export function apiKeyRejectionMessage(slot: ApiKeySlot, key: string): string {
    const label = API_KEY_SLOT_LABELS[slot];
    const verdict = checkKeyFormatForSlot(slot, key);
    if (verdict.status === 'mismatch') {
        return `${label} 칸의 API 키가 거부되었습니다. ${verdict.message} 설정 → API 키에서 "${API_KEY_SLOT_LABELS[verdict.suggestedSlot]} 칸으로 옮기기"를 눌러 주세요.`;
    }
    if (verdict.status === 'unknown') {
        return `${label} 칸의 API 키가 거부되었습니다. ${verdict.message}`;
    }
    return `${label} 칸의 API 키가 거부되었습니다. 키가 만료·삭제되었거나 다른 계정의 키일 수 있습니다. 설정 → API 키에서 새로 발급한 키를 넣고 "연결 확인"을 눌러 주세요.`;
}

/**
 * 키 거부라면 상태를 기록하고 안내를 띄운다. 키 거부가 아니면 아무것도 하지 않는다.
 * @returns 키 거부였으면 사용자용 안내문, 아니면 null
 */
export function reportApiKeyRejection(provider: AIProvider | 'vision', key: string, error: unknown): string | null {
    if (!isApiKeyRejection(error)) return null;
    const slot = provider as ApiKeySlot;
    const message = apiKeyRejectionMessage(slot, key);
    void recordApiKeyStatus(slot, key, 'failed', message, 'request').catch(() => undefined);
    const now = Date.now();
    if (typeof window !== 'undefined' && now - (lastNotified.get(slot) ?? 0) > NOTIFY_INTERVAL_MS) {
        lastNotified.set(slot, now);
        window.dispatchEvent(new CustomEvent<ApiKeyRejectedDetail>(API_KEY_REJECTED_EVENT, { detail: { slot, message } }));
    }
    return message;
}
