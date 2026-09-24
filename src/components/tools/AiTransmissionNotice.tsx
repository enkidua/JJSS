import { Info } from 'lucide-react';

interface AiTransmissionNoticeProps {
    /** 기본 문구 대신 보여 줄 안내. */
    message?: string;
    className?: string;
}

const DEFAULT_MESSAGE = '입력한 내용은 AI 답변을 만들기 위해 외부 AI 서비스로 전송됩니다. 이름·연락처 등 일부 개인정보는 자동으로 가려서 보내지만 모두 걸러지지는 않으니, 꼭 필요한 내용만 입력해 주세요.';

/** AI가 사용자 입력을 외부로 보내는 화면에 붙이는 짧은 전송 안내. */
export function AiTransmissionNotice({ message = DEFAULT_MESSAGE, className = '' }: AiTransmissionNoticeProps) {
    return (
        <p className={`flex items-start gap-2 rounded-xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs leading-relaxed text-sky-100/80 ${className}`}>
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{message}</span>
        </p>
    );
}

export default AiTransmissionNotice;
