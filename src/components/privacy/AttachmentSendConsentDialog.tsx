import { useEffect, useRef, useState } from 'react';
import { FileWarning } from 'lucide-react';
import {
    ATTACHMENT_SEND_CONSENT_EVENT,
    attachmentSendConsentMessage,
    type AttachmentSendConsentDetail,
} from '../../services/attachmentConsent';
import { useDialogFocus } from '../../hooks/useDialogFocus';

interface PendingRequest extends AttachmentSendConsentDetail {
    id: number;
}

/**
 * 원본 PDF·이미지 전송 확인창(동의 C).
 * - AI 사용 안내나 자동 전환 설정과 별개로, 원본 파일을 보내는 요청마다 묻는다.
 * - 기본 동작은 [취소]: Esc·바깥 닫기·화면 이동 모두 "보내지 않음"으로 끝난다.
 * - 요청이 겹치면 순서대로 묻는다.
 */
export default function AttachmentSendConsentDialog() {
    const [queue, setQueue] = useState<PendingRequest[]>([]);
    const queueRef = useRef<PendingRequest[]>([]);
    const counterRef = useRef(0);
    const current = queue[0];

    const updateQueue = (next: PendingRequest[]) => {
        queueRef.current = next;
        setQueue(next);
    };

    useEffect(() => {
        const handleRequest = (event: Event) => {
            const detail = (event as CustomEvent<AttachmentSendConsentDetail>).detail;
            if (!detail || typeof detail.resolve !== 'function') return;
            detail.handled = true;
            counterRef.current += 1;
            updateQueue([...queueRef.current, { ...detail, id: counterRef.current }]);
        };
        window.addEventListener(ATTACHMENT_SEND_CONSENT_EVENT, handleRequest);
        return () => {
            window.removeEventListener(ATTACHMENT_SEND_CONSENT_EVENT, handleRequest);
            const pending = queueRef.current;
            queueRef.current = [];
            pending.forEach(request => request.resolve(false));
        };
    }, []);

    const finish = (approved: boolean) => {
        const [head, ...rest] = queueRef.current;
        if (!head) return;
        updateQueue(rest);
        head.resolve(approved);
    };

    const dialogRef = useDialogFocus(Boolean(current), () => finish(false));

    if (!current) return null;

    const fileLabel = current.fileNames.length > 3
        ? `${current.fileNames.slice(0, 3).join(', ')} 외 ${current.fileNames.length - 3}개`
        : current.fileNames.join(', ');

    return (
        <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/70 p-4">
            <div
                key={current.id}
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="attachment-consent-title"
                aria-describedby="attachment-consent-desc"
                tabIndex={-1}
                className="glass-card w-full max-w-lg !p-6 shadow-2xl focus:outline-none"
            >
                <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20">
                        <FileWarning className="h-5 w-5 text-rose-300" />
                    </div>
                    <div>
                        <h2 id="attachment-consent-title" className="text-lg font-bold text-white">원본 파일 전송 확인</h2>
                        {fileLabel && <p className="mt-1 break-all text-xs text-white/50">{fileLabel}</p>}
                    </div>
                </div>
                <div id="attachment-consent-desc" className="space-y-2 text-sm leading-relaxed text-white/75">
                    {current.note && <p className="text-amber-100/90">{current.note}</p>}
                    <p className="font-semibold text-white">{attachmentSendConsentMessage(current.provider)}</p>
                    <p className="text-xs text-white/50">
                        글자를 PC에서 추출할 수 없는 스캔본·이미지는 원본 그대로 보내야 분석할 수 있으며, 원본 안의 개인정보는 자동으로 가려지지 않습니다.
                        보내지 않으려면 [취소]를 누르고 필요한 내용을 글로 입력해 주세요.
                    </p>
                </div>
                {queue.length > 1 && (
                    <p className="mt-2 text-xs text-white/45">확인을 기다리는 다른 요청이 {queue.length - 1}건 더 있습니다.</p>
                )}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    {/* 처음 초점은 DOM 첫 버튼인 [취소]에 놓인다(기본값 = 보내지 않음). */}
                    <button type="button" className="btn-primary !px-4 !py-2" onClick={() => finish(false)}>취소</button>
                    <button type="button" className="btn-ghost !px-4 !py-2 !text-rose-200" onClick={() => finish(true)}>원본 파일 전송</button>
                </div>
            </div>
        </div>
    );
}
