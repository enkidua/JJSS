import { toAmount } from '../../utils/currency';
import type { ReceiptParseResult } from '../../services/ocr';

/** 입력칸에 넣을 양수 금액. 음수·0·빈값은 undefined(부호를 잃고 양수로 바뀌지 않게 부호를 먼저 해석). */
function toPositiveAmount(value: unknown): number | undefined {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const parsed = toAmount(value, { allowNegative: true });
    return parsed > 0 ? parsed : undefined;
}

export interface ReceiptAmountPlan {
    quantity: number;
    unitPrice: number;
    supplyAmount: number;
    vat: number;
    amount: number;
    /** 영수증에서 읽지 못해 비워 둔 칸(사용자 안내용) */
    missing: string[];
}

/**
 * 영수증에서 읽은 금액으로 수량·단가·공급가액·부가세·합계를 한 벌로 맞춘다.
 * 총액만 읽었을 때 이전 입력의 공급가액·부가세·단가가 남으면 합계와 맞지 않는 지출이 저장되므로,
 * 읽지 못한 칸은 비우고(0) 읽은 값에서 확실히 나오는 값만 채운다. 과세 여부는 추측하지 않는다(면세 영수증).
 * 총액을 읽지 못하면 null — 금액 칸은 건드리지 않는다.
 */
export function planReceiptAmounts(values: Pick<ReceiptParseResult, 'quantity' | 'unitPrice' | 'supplyAmount' | 'vat' | 'amount'>): ReceiptAmountPlan | null {
    const quantity = toPositiveAmount(values.quantity);
    const unitPrice = toPositiveAmount(values.unitPrice);
    let supplyAmount = toPositiveAmount(values.supplyAmount);
    let vat = toPositiveAmount(values.vat);
    let amount = toPositiveAmount(values.amount);
    if (!amount && quantity && unitPrice) amount = quantity * unitPrice;
    if (!amount) return null;
    if (supplyAmount && !vat && supplyAmount <= amount) vat = amount - supplyAmount;
    else if (!supplyAmount && vat && vat < amount) supplyAmount = amount - vat;
    const missing: string[] = [];
    if (!supplyAmount) missing.push('공급가액');
    if (vat === undefined) missing.push('부가세');
    let nextQuantity = quantity;
    let nextUnitPrice = unitPrice;
    if (!nextQuantity && !nextUnitPrice) {
        nextQuantity = 1;
        nextUnitPrice = supplyAmount;
    } else if (nextQuantity && !nextUnitPrice) {
        nextUnitPrice = supplyAmount && supplyAmount % nextQuantity === 0 ? supplyAmount / nextQuantity : undefined;
    } else if (!nextQuantity && nextUnitPrice) {
        nextQuantity = supplyAmount && supplyAmount % nextUnitPrice === 0 ? supplyAmount / nextUnitPrice : 1;
    }
    if (!nextUnitPrice) missing.push('단가');
    return {
        quantity: nextQuantity || 1,
        unitPrice: nextUnitPrice || 0,
        supplyAmount: supplyAmount || 0,
        vat: vat || 0,
        amount,
        missing,
    };
}
