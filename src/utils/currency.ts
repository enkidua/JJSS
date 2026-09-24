/** 쉼표·'원'·공백이 섞인 금액 문자열을 숫자로 변환합니다. 기본은 음수를 허용하지 않습니다. */
export function parseCurrencyInput(value: string, options: { allowNegative?: boolean } = {}): number {
    const text = String(value ?? '').trim();
    const negative = options.allowNegative === true && /^[-−(]/.test(text);
    const digits = text.replace(/[^\d]/g, '');
    const amount = Number(digits) || 0;
    return negative ? -amount : amount;
}

/** 입력칸 표시용: 1234567 → '1,234,567', 0/빈값 → ''. */
export function formatCurrencyInput(value: unknown): string {
    const numericValue = typeof value === 'number' ? value : parseCurrencyInput(String(value ?? ''), { allowNegative: true });
    return numericValue ? numericValue.toLocaleString('ko-KR') : '';
}

/** 숫자 또는 금액 문자열을 안전하게 숫자로 변환합니다(부호 허용, NaN → 0). */
export function toAmount(value: unknown, options: { allowNegative?: boolean } = { allowNegative: true }): number {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return 0;
        return options.allowNegative === false && value < 0 ? 0 : Math.round(value);
    }
    return parseCurrencyInput(String(value ?? ''), options);
}

/** 금액을 한글로 표기합니다. 예: 110000 → '십일만', 1500 → '천오백'. */
export function numberToKorean(input: number): string {
    let num = Math.floor(Math.abs(Number(input) || 0));
    if (num === 0) return '영';
    const units = ['', '만', '억', '조'];
    const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const subUnits = ['', '십', '백', '천'];
    let result = '';
    let unitIndex = 0;
    while (num > 0 && unitIndex < units.length) {
        const chunk = num % 10000;
        if (chunk > 0) {
            let chunkStr = '';
            let tempChunk = chunk;
            let subIndex = 0;
            while (tempChunk > 0) {
                const d = tempChunk % 10;
                if (d > 0) chunkStr = (d === 1 && subIndex > 0 ? '' : digits[d]) + subUnits[subIndex] + chunkStr;
                tempChunk = Math.floor(tempChunk / 10);
                subIndex++;
            }
            result = chunkStr + units[unitIndex] + result;
        }
        num = Math.floor(num / 10000);
        unitIndex++;
    }
    return (Number(input) < 0 ? '마이너스 ' : '') + result;
}
