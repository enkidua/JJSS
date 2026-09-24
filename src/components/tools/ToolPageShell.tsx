import type { ComponentType, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

interface ToolPageShellProps {
    /** 뒤로 버튼 동작. 이탈 확인은 부모 페이지(useUnsavedGuard의 confirmDiscard)가 담당합니다. */
    onBack: () => void;
    /** 뒤로 버튼 문구. 기본값은 표준 용어 "도구 목록으로". */
    backLabel?: string;
    /** 뒤로 버튼 줄 오른쪽에 둘 버튼들(복사·저장 등). */
    actions?: ReactNode;
    /** 간단한 머리글. 화면마다 고유한 머리글이 있으면 생략하고 children에 둡니다. */
    title?: ReactNode;
    description?: ReactNode;
    icon?: ComponentType<{ className?: string }>;
    iconGradient?: string;
    /** 바깥 래퍼 너비·여백 클래스. */
    className?: string;
    children: ReactNode;
}

/** 업무 지원 도구 하위 화면의 공통 틀: 등장 애니메이션 + 뒤로 버튼 + (선택) 머리글. */
export function ToolPageShell({
    onBack,
    backLabel = '도구 목록으로',
    actions,
    title,
    description,
    icon: Icon,
    iconGradient = 'from-blue-500 to-cyan-500',
    className = 'w-full max-w-6xl mx-auto',
    children,
}: ToolPageShellProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={className}
        >
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="btn-ghost flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {backLabel}
                </button>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
            {title && (
                <div className="mb-6 flex items-center gap-4">
                    {Icon && (
                        <div className={`w-12 h-12 shrink-0 rounded-2xl bg-gradient-to-br ${iconGradient} flex items-center justify-center shadow-lg`}>
                            <Icon className="w-6 h-6 text-white" />
                        </div>
                    )}
                    <div>
                        <h2 className="text-2xl font-black text-white">{title}</h2>
                        {description && <p className="text-white/50 text-sm mt-1">{description}</p>}
                    </div>
                </div>
            )}
            {children}
        </motion.div>
    );
}

export default ToolPageShell;
