import { useEffect, useState } from 'react';
import { AlertTriangle, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { AIProvider } from '../config/aiModels';
import {
    API_KEY_REQUIRED_EVENT,
    apiKeyRequiredMessage,
    type ApiKeyRequiredDetail,
} from '../utils/apiKeyPrompt';
import { useDialogFocus } from '../hooks/useDialogFocus';

export default function ApiKeyRequiredNotice() {
    const navigate = useNavigate();
    const [provider, setProvider] = useState<AIProvider | undefined>();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const handleRequiredKey = (event: Event) => {
            const detail = (event as CustomEvent<ApiKeyRequiredDetail>).detail;
            setProvider(detail?.provider);
            setVisible(true);
        };
        window.addEventListener(API_KEY_REQUIRED_EVENT, handleRequiredKey);
        return () => window.removeEventListener(API_KEY_REQUIRED_EVENT, handleRequiredKey);
    }, []);

    const dialogRef = useDialogFocus(visible, () => setVisible(false));

    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-4">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="api-key-required-title"
                aria-describedby="api-key-required-desc"
                tabIndex={-1}
                className="glass-card w-full max-w-md !p-6 shadow-2xl focus:outline-none"
            >
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20">
                        <AlertTriangle className="h-5 w-5 text-amber-300" />
                    </div>
                    <h2 id="api-key-required-title" className="text-lg font-bold text-white">API 키 설정이 필요합니다</h2>
                </div>
                <p id="api-key-required-desc" className="whitespace-pre-line text-sm leading-relaxed text-white/70">
                    {apiKeyRequiredMessage(provider)}
                </p>
                <div className="mt-6 flex justify-end gap-2">
                    <button type="button" className="btn-ghost !px-4 !py-2" onClick={() => setVisible(false)}>
                        취소
                    </button>
                    <button
                        type="button"
                        className="btn-primary !px-4 !py-2 flex items-center gap-2"
                        onClick={() => {
                            setVisible(false);
                            navigate('/settings');
                        }}
                    >
                        <Settings className="h-4 w-4" /> 설정으로 이동
                    </button>
                </div>
            </div>
        </div>
    );
}
