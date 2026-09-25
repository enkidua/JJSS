/**
 * 개인정보가 들어 있을 수 있는 원본 PDF·이미지를 외부 AI로 보내기 전의 "원본 파일 전송" 확인(동의 C).
 *
 * - AI 텍스트 사용 안내(동의 A), 다른 제공업체 자동 전환 설정(동의 B)과는 별개이며, 요청마다 따로 묻는다.
 * - 확인창을 띄울 화면이 없거나(테스트·백그라운드) 사용자가 닫으면 "보내지 않음"으로 끝낸다(기본값 = 취소).
 * - 확인창에는 파일 이름만 PC 화면에 보여 주며, 이 모듈은 파일 내용을 다루지 않는다.
 */

export type AttachmentUploadProvider = 'gemini' | 'vision';

export const ATTACHMENT_PROVIDER_LABELS: Record<AttachmentUploadProvider, string> = {
    gemini: 'Google Gemini',
    vision: 'Google Cloud Vision',
};

export const ATTACHMENT_SEND_CONSENT_EVENT = 'jjss:attachment-send-consent';

export interface AttachmentSendConsentDetail {
    provider: AttachmentUploadProvider;
    providerLabel: string;
    /** 화면에만 보여 줄 파일 이름(외부로 보내지 않음). */
    fileNames: string[];
    /** 추가 안내(예: Vision에서 읽지 못해 Gemini로 다시 보내는 경우). */
    note?: string;
    /** 확인창이 요청을 받았으면 true로 바꾼다. 받는 화면이 없으면 요청은 자동으로 거절된다. */
    handled: boolean;
    resolve: (approved: boolean) => void;
}

/** 확인창 본문(명세 문구). 제공업체 이름에 맞춰 조사(로/으로)를 붙인다. */
export function attachmentSendConsentMessage(provider: AttachmentUploadProvider): string {
    const label = ATTACHMENT_PROVIDER_LABELS[provider];
    const particle = provider === 'vision' ? '으로' : '로';
    return `이 파일은 이미지/PDF 원본이 ${label}${particle} 전송됩니다. 파일에 이름, 연락처 등 개인정보가 포함되어 있는지 확인해 주세요.`;
}

export const ATTACHMENT_CONSENT_DENIED_CODE = 'AI_ATTACHMENT_CONSENT_DENIED';

export function createAttachmentConsentDeniedError(): Error {
    return Object.assign(
        new Error('원본 파일을 보내지 않아 요청을 진행하지 않았습니다. 파일의 개인정보를 확인한 뒤 다시 시도하거나, 필요한 내용을 글로 입력해 주세요.'),
        { code: ATTACHMENT_CONSENT_DENIED_CODE },
    );
}

export function isAttachmentConsentDenied(error: unknown): boolean {
    return (error as { code?: unknown } | null)?.code === ATTACHMENT_CONSENT_DENIED_CODE;
}

/**
 * 원본 파일 전송 여부를 사용자에게 묻는다. 승인하면 true.
 * 화면(확인창)이 없거나 오류가 나면 false — 자동으로 보내는 경우는 없다.
 */
export function requestAttachmentSendConsent(input: {
    provider: AttachmentUploadProvider;
    fileNames: string[];
    note?: string;
}): Promise<boolean> {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof CustomEvent !== 'function') {
        return Promise.resolve(false);
    }
    return new Promise<boolean>(resolve => {
        let settled = false;
        const finish = (approved: boolean) => {
            if (settled) return;
            settled = true;
            resolve(approved === true);
        };
        const detail: AttachmentSendConsentDetail = {
            provider: input.provider,
            providerLabel: ATTACHMENT_PROVIDER_LABELS[input.provider],
            fileNames: input.fileNames.map(name => String(name || '').slice(0, 120)).filter(Boolean),
            note: input.note,
            handled: false,
            resolve: finish,
        };
        try {
            window.dispatchEvent(new CustomEvent<AttachmentSendConsentDetail>(ATTACHMENT_SEND_CONSENT_EVENT, { detail }));
        } catch {
            finish(false);
            return;
        }
        if (!detail.handled) finish(false);
    });
}
