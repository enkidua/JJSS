import type { AIProvider } from './aiModels';

/**
 * 실제로 요청을 보낼 AI 제공업체 정하기.
 *
 * 설정의 "기본 AI"로 고른 제공업체에 쓸 수 있는 키가 없으면(예: Gemini 키만 넣고 ChatGPT를 고른 경우)
 * 예전에는 "API 키가 필요합니다"로 멈췄다. 사용자가 직접 등록한 키가 다른 제공업체에 있으면 그쪽으로 보낸다.
 * 이미지·스캔 문서처럼 원본 파일을 보내야 하는 요청은 Gemini만 지원하므로 Gemini 키가 있으면 Gemini로 보낸다.
 *
 * - selected:    고른 제공업체 그대로
 * - no-key:      고른 제공업체에 쓸 수 있는 키가 없어 키가 등록된 다른 제공업체로
 * - attachments: 원본 파일 분석은 Gemini만 지원해 Gemini로
 */
export type AIProviderRouteReason = 'selected' | 'no-key' | 'attachments';

export interface AIProviderRoute {
    provider: AIProvider;
    reason: AIProviderRouteReason;
}

export interface ResolveAIProviderRouteInput {
    selectedProvider: AIProvider;
    /** 형식이 맞는 키가 등록된 제공업체(다른 제공업체 형식의 키가 든 칸은 빼고) */
    usableProviders: readonly AIProvider[];
    /** 키가 없을 때 대신 쓸 순서(자동 전환 설정의 제공업체 순서) */
    providerOrder?: readonly AIProvider[];
    /** 원본 파일(이미지·스캔 PDF)을 보내야 하는 요청인가 */
    requiresRawFiles?: boolean;
}

const DEFAULT_ORDER: readonly AIProvider[] = ['gemini', 'openai', 'anthropic'];

/** 원본 파일(이미지·스캔 PDF)을 받을 수 있는 제공업체 */
export const RAW_FILE_PROVIDER: AIProvider = 'gemini';

/** 보낼 곳이 없으면 null(등록된 키가 없거나, 원본 파일이 필요한데 Gemini 키가 없음). */
export function resolveAIProviderRoute(input: ResolveAIProviderRouteInput): AIProviderRoute | null {
    const usable = new Set(input.usableProviders);
    if (input.requiresRawFiles) {
        if (!usable.has(RAW_FILE_PROVIDER)) return null;
        return { provider: RAW_FILE_PROVIDER, reason: input.selectedProvider === RAW_FILE_PROVIDER ? 'selected' : 'attachments' };
    }
    if (usable.has(input.selectedProvider)) return { provider: input.selectedProvider, reason: 'selected' };
    const order = [...(input.providerOrder ?? []), ...DEFAULT_ORDER];
    const fallback = order.find(provider => usable.has(provider));
    return fallback ? { provider: fallback, reason: 'no-key' } : null;
}
