import { forwardRef, useEffect, useId, useState, type HTMLAttributes } from 'react';

export const EMPTY_SEEKER_FORM = {
    status: '구직중', seekerId: '', name: '', age: '', disabilityType: '',
    severity: '', desiredJob1: '', desiredJob2: '', desiredSalary: '',
    desiredWorkHours: '', desiredLocation: '', recommendingAgency: '', notes: ''
};

export type SeekerFormData = typeof EMPTY_SEEKER_FORM;

interface ComposingInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
    inputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
    required?: boolean;
}

/** 한글 조합 중에는 부모 상태를 갱신하지 않아 글자가 끊기지 않는 입력칸. */
export const ComposingInput = forwardRef<HTMLInputElement, ComposingInputProps>(function ComposingInput(
    { label, value, onChange, placeholder, type = 'text', inputMode, required = false },
    ref
) {
    const inputId = useId();
    const [draftValue, setDraftValue] = useState(String(value ?? ''));
    const [isComposing, setIsComposing] = useState(false);

    useEffect(() => {
        if (!isComposing) {
            setDraftValue(String(value ?? ''));
        }
    }, [value, isComposing]);

    return (
        <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-white/70 mb-1.5">{label} {required && <span className="text-red-400">*</span>}</label>
            <input
                id={inputId}
                ref={ref}
                type={type}
                inputMode={inputMode}
                placeholder={placeholder}
                value={draftValue}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={(e) => {
                    const nextValue = e.currentTarget.value;
                    setIsComposing(false);
                    setDraftValue(nextValue);
                    onChange(nextValue);
                }}
                onChange={(e) => {
                    const nextValue = e.target.value;
                    setDraftValue(nextValue);
                    if (!isComposing) {
                        onChange(nextValue);
                    }
                }}
                required={required}
                className="input-field"
            />
        </div>
    );
});

interface ComposingTextAreaProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}

export function ComposingTextArea({ label, value, onChange, placeholder }: ComposingTextAreaProps) {
    const [draftValue, setDraftValue] = useState(String(value ?? ''));
    const [isComposing, setIsComposing] = useState(false);

    useEffect(() => {
        if (!isComposing) {
            setDraftValue(String(value ?? ''));
        }
    }, [value, isComposing]);

    return (
        <label className="block">
            <span className="block text-sm font-medium text-white/70 mb-1.5">{label}</span>
            <textarea
                value={draftValue}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={(e) => {
                    const nextValue = e.currentTarget.value;
                    setIsComposing(false);
                    setDraftValue(nextValue);
                    onChange(nextValue);
                }}
                onChange={(e) => {
                    const nextValue = e.target.value;
                    setDraftValue(nextValue);
                    if (!isComposing) {
                        onChange(nextValue);
                    }
                }}
                className="textarea-field text-sm leading-relaxed"
                rows={3}
                placeholder={placeholder}
            />
        </label>
    );
}

interface SeekerFormFieldsProps {
    value: SeekerFormData;
    onChange: (patch: Partial<SeekerFormData>) => void;
}

/**
 * 이용자(구직자) 입력 항목 묶음. 직접 입력과 OCR 결과 확인 화면이 같은 항목을 씁니다.
 * 나이는 OCR 결과("30세" 등)도 지워지지 않도록 숫자 전용 입력칸 대신 숫자 키패드 힌트만 줍니다.
 */
export function SeekerFormFields({ value, onChange }: SeekerFormFieldsProps) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ComposingInput label="구직자 이름" value={value.name} onChange={v => onChange({ name: v })} placeholder="홍길동" required />
            <ComposingInput label="구직자 ID" value={value.seekerId} onChange={v => onChange({ seekerId: v })} placeholder="S-001" />
            <ComposingInput label="현재 상황" value={value.status} onChange={v => onChange({ status: v })} placeholder="구직중/취업/대기중" />
            <ComposingInput label="나이" value={value.age} onChange={v => onChange({ age: v })} inputMode="numeric" placeholder="30" />
            <ComposingInput label="장애유형" value={value.disabilityType} onChange={v => onChange({ disabilityType: v })} placeholder="지적장애" />
            <ComposingInput label="중경증여부" value={value.severity} onChange={v => onChange({ severity: v })} placeholder="중증 또는 경증" />
            <ComposingInput label="희망지역" value={value.desiredLocation} onChange={v => onChange({ desiredLocation: v })} placeholder="서울시" />
            <ComposingInput label="희망직종 1" value={value.desiredJob1} onChange={v => onChange({ desiredJob1: v })} placeholder="바리스타" />
            <ComposingInput label="희망직종 2 (선택)" value={value.desiredJob2} onChange={v => onChange({ desiredJob2: v })} />
            <ComposingInput label="희망임금" value={value.desiredSalary} onChange={v => onChange({ desiredSalary: v })} placeholder="200만원" />
            <ComposingInput label="추천기관" value={value.recommendingAgency} onChange={v => onChange({ recommendingAgency: v })} placeholder="추천한 기관명" />
            <ComposingInput label="희망 근무시간" value={value.desiredWorkHours} onChange={v => onChange({ desiredWorkHours: v })} placeholder="30시간" />
            <div className="sm:col-span-2">
                <ComposingTextArea label="비고 (강점, 제한점 등)" value={value.notes} onChange={v => onChange({ notes: v })} placeholder="엑셀 활용 가능, 대인관계 우수 등" />
            </div>
        </div>
    );
}

export default SeekerFormFields;
