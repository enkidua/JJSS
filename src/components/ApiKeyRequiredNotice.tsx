import { useEffect, useState } from 'react';
import { AlertTriangle, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AIProvider } from '../config/aiModels';
import {
    API_KEY_REQUIRED_EVENT,
    apiKeyRequiredMessage,
    type ApiKeyRequiredDetail,
} from '../utils/apiKeyPrompt';
import { API_KEY_REJECTED_EVENT, type ApiKeyRejectedDetail } from '../services/apiKeyRejection';
import { useDialogFocus } from '../hooks/useDialogFocus';

type NoticeState =
    | { kind: 'required'; provider?: AIProvider }
    | { kind: 'rejected'; message: string };

/**
 * API 키 안내창.
 * - 키가 없을 때(required): 설정에서 키를 넣으라고 안내한다.
 * - 키가 거부됐을 때(rejected): 어느 칸의 키가 왜 거부됐는지(다른 제공업체 키 형식 등) 알리고 설정의 API 키 칸으로 보낸다.
 */
export default function ApiKeyRequiredNotice() {
    const navigate = useNavigate();
    const [notice, setNotice] = useState<NoticeState | null>(null);

    useEffect(() => {
        const handleRequiredKey = (event: Event) => {
            const detail = (event as CustomEvent<ApiKeyRequiredDetail>).detail;
            setNotice({ kind: 'required', provider: detail?.provider });
        };
        const handleRejectedKey = (event: Event) => {
            const detail = (event as CustomEvent<ApiKeyRejectedDetail>).detail;
            if (detail?.message) setNotice({ kind: 'rejected', message: detail.message });
        };
        window.addEventListener(API_KEY_REQUIRED_EVENT, handleRequiredKey);
        window.addEventListener(API_KEY_REJECTED_EVENT, handleRejectedKey);
        return () => {
            window.removeEventListener(API_KEY_REQUIRED_EVENT, handleRequiredKey);
            window.removeEventListener(API_KEY_REJECTED_EVENT, handleRejectedKey);
        };
    }, []);

    const visible = notice !== null;
    const dialogRef = useDialogFocus(visible, () => setNotice(null));

    if (!notice) return null;

    const title = notice.kind === 'rejected' ? 'API 키가 거부되었습니다' : 'API 키 설정이 필요합니다';
    const message = notice.kind === 'rejected' ? notice.message : apiKeyRequiredMessage(notice.provider);

    return (
        <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/65 p-4">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="api-key-required-title"
                aria-describedby="api-key-required-desc"
                tabIndex={-1}
                className="glass-card w-full max-w-md p-6! shadow-2xl focus:outline-hidden"
            >
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
                        <AlertTriangle className="h-5 w-5 text-amber-300" />
                    </div>
                    <h2 id="api-key-required-title" className="text-lg font-bold text-white">{title}</h2>
                </div>
                <p id="api-key-required-desc" className="whitespace-pre-line text-sm leading-relaxed text-white/70">
                    {message}
                </p>
                <div className="mt-6 flex justify-end gap-2">
                    <button type="button" className="btn-ghost px-4! py-2!" onClick={() => setNotice(null)}>
                        {notice.kind === 'rejected' ? '닫기' : '취소'}
                    </button>
                    <button
                        type="button"
                        className="btn-primary px-4! py-2! flex items-center gap-2"
                        onClick={() => {
                            setNotice(null);
                            navigate('/settings', { state: { focusSection: 'api-keys' } });
                        }}
                    >
                        <Settings className="h-4 w-4" /> 설정의 API 키로 이동
                    </button>
                </div>
            </div>
        </div>
    );
}
