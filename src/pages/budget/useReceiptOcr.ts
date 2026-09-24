import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Expense } from '../../types/budget';
import {
    performOCR,
    parseReceiptFromOCR,
    smartParseItemizedReceiptWithAI,
    type ItemizedReceiptParseResult,
    type ReceiptItem,
    type ReceiptParseResult,
} from '../../services/ocr';
import { toAmount } from '../../utils/currency';
import { parseLocalDate } from '../../utils/date';

export type ReceiptApplyMode = 'parsed' | 'firstItem' | 'allItems';

interface ReceiptSource {
    fileName: string;
    rawText: string;
}

/** 입력칸에 넣을 양수 금액. 음수·0·빈값은 undefined(부호를 잃고 양수로 바뀌지 않게 부호를 먼저 해석). */
function toPositiveAmount(value: unknown): number | undefined {
    if (value === undefined || value === null || String(value).trim() === '') return undefined;
    const parsed = toAmount(value, { allowNegative: true });
    return parsed > 0 ? parsed : undefined;
}

/** 할인·취소처럼 음수인 품목도 합계에 반영합니다. */
function toSignedAmount(value: unknown): number {
    return toAmount(value, { allowNegative: true });
}

function cleanLastFour(value?: string) {
    if (!value) return '';
    const digits = value.replace(/\D/g, '');
    return digits.slice(-4);
}

export function buildReceiptItemsSummary(items: ReceiptItem[] = []) {
    if (!items.length) return '';
    return items.map(item => `${item.description} ${toSignedAmount(item.amount).toLocaleString()}원`).join(', ');
}

/** OCR 결과를 기존 입력값 위에 덮어씁니다. OCR에 없는 칸(사업·세부 항목 등)은 그대로 둡니다. */
function mergeReceiptIntoForm(
    prev: Partial<Expense>,
    parsed: ReceiptParseResult & { items?: ReceiptItem[] },
    mode: ReceiptApplyMode,
    source: ReceiptSource,
): Partial<Expense> {
    const items = parsed.items || [];
    let nextParsed: ReceiptParseResult = { ...parsed };
    let notesExtra = '';

    if (mode === 'firstItem' && items[0]) {
        const item = items[0];
        nextParsed = {
            ...parsed,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            supplyAmount: item.supplyAmount,
            vat: item.vat,
            amount: item.amount,
        };
        notesExtra = `OCR 품목 선택: 첫 번째 품목(${item.description})`;
    } else if (mode === 'allItems' && items.length) {
        const amount = items.reduce((sum, item) => sum + toSignedAmount(item.amount), 0);
        const allHaveSupply = items.every(item => toSignedAmount(item.supplyAmount) !== 0);
        const allHaveVat = items.every(item => toSignedAmount(item.vat) !== 0);
        const supplyTotal = items.reduce((sum, item) => sum + toSignedAmount(item.supplyAmount), 0);
        const vatTotal = items.reduce((sum, item) => sum + toSignedAmount(item.vat), 0);
        nextParsed = {
            ...parsed,
            description: items.map(item => item.description).filter(Boolean).join(', '),
            quantity: items.length,
            amount: amount > 0 ? amount : parsed.amount,
            supplyAmount: allHaveSupply && supplyTotal > 0 ? supplyTotal : parsed.supplyAmount,
            vat: allHaveVat && vatTotal > 0 ? vatTotal : parsed.vat,
        };
        notesExtra = `OCR 전체 품목 합계 적용: ${buildReceiptItemsSummary(items)}`;
    } else if (items.length) {
        notesExtra = `OCR 품목 요약: ${buildReceiptItemsSummary(items)}`;
    }

    const next: Partial<Expense> = { ...prev };
    const setTextIfPresent = (key: 'vendor' | 'vendorBizNo' | 'description' | 'paymentMethod' | 'cardType' | 'approvalNo', value: string | undefined) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') next[key] = value;
    };

    if (nextParsed.date && parseLocalDate(nextParsed.date)) next.date = nextParsed.date;
    setTextIfPresent('vendor', nextParsed.vendor);
    setTextIfPresent('vendorBizNo', nextParsed.vendorBizNo);
    setTextIfPresent('description', nextParsed.description);
    setTextIfPresent('paymentMethod', nextParsed.paymentMethod);
    setTextIfPresent('cardType', nextParsed.cardType);
    const lastFour = cleanLastFour(nextParsed.cardLastFour);
    if (lastFour) next.cardLastFour = lastFour;
    setTextIfPresent('approvalNo', nextParsed.approvalNo);

    const quantity = toPositiveAmount(nextParsed.quantity);
    const unitPrice = toPositiveAmount(nextParsed.unitPrice);
    const supplyAmount = toPositiveAmount(nextParsed.supplyAmount);
    const vat = toPositiveAmount(nextParsed.vat);
    let amount = toPositiveAmount(nextParsed.amount);
    if (!amount && quantity && unitPrice) amount = quantity * unitPrice;

    if (quantity) next.quantity = quantity;
    if (unitPrice) next.unitPrice = unitPrice;
    if (supplyAmount) next.supplyAmount = supplyAmount;
    if (vat) next.vat = vat;
    if (amount) next.amount = amount;

    const existingNotes = (prev.notes || '')
        .split('\n')
        .filter(line => line && !line.startsWith('OCR 파일명:') && !line.startsWith('OCR 품목') && !line.startsWith('OCR 전체') && !line.startsWith('OCR 원문 일부:'))
        .join('\n');
    const fileNote = source.fileName ? `OCR 파일명: ${source.fileName}` : '';
    const rawNote = source.rawText ? `OCR 원문 일부: ${source.rawText.replace(/\s+/g, ' ').slice(0, 180)}` : '';
    const noteParts = [existingNotes, fileNote, notesExtra, rawNote].filter(Boolean);
    if (noteParts.length) next.notes = Array.from(new Set(noteParts)).join('\n');
    return next;
}

/** 영수증 OCR 보조 입력. 결과는 자동 저장하지 않고 입력칸에만 채웁니다. */
export function useReceiptOcr(setForm: Dispatch<SetStateAction<Partial<Expense>>>, onApplied?: () => void) {
    const [ocrFile, setOcrFile] = useState<File | null>(null);
    const [ocrLoading, setOcrLoading] = useState(false);
    const [ocrRawText, setOcrRawText] = useState('');
    const [ocrSourceName, setOcrSourceName] = useState('');
    const [ocrMessage, setOcrMessage] = useState('');
    const [ocrError, setOcrError] = useState('');
    const [showOcrRaw, setShowOcrRaw] = useState(false);
    const [ocrParsed, setOcrParsed] = useState<ItemizedReceiptParseResult | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // 화면을 떠나면 진행 중인 OCR 요청을 취소합니다.
    useEffect(() => () => abortRef.current?.abort(), []);

    const selectOcrFile = (file: File | null) => {
        setOcrFile(file);
        setOcrError('');
        setOcrMessage('');
    };

    const applyOcrResult = (parsed: ReceiptParseResult & { items?: ReceiptItem[] }, mode: ReceiptApplyMode, source: ReceiptSource) => {
        setForm(prev => mergeReceiptIntoForm(prev, parsed, mode, source));
        setOcrMessage('OCR 결과를 입력칸에 반영했습니다. 저장 전 내용을 확인해 주세요.');
        onApplied?.();
    };

    /** 이미 읽은 영수증에서 품목 적용 방식을 바꿉니다. */
    const applyOcrItems = (mode: ReceiptApplyMode) => {
        if (!ocrParsed) return;
        applyOcrResult(ocrParsed, mode, { fileName: ocrSourceName, rawText: ocrRawText });
    };

    const runOcr = async () => {
        if (ocrLoading) return;
        if (!ocrFile) {
            setOcrError('OCR을 실행할 JPG, PNG 또는 PDF 파일을 선택해 주세요.');
            return;
        }
        const file = ocrFile;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setOcrLoading(true);
        setOcrError('');
        setOcrMessage('');
        try {
            const rawText = await performOCR(file, { signal: controller.signal });
            if (controller.signal.aborted) return;
            setOcrRawText(rawText);
            setOcrSourceName(file.name);
            if (!rawText.trim()) throw new Error('OCR 결과에서 텍스트를 찾지 못했습니다.');

            let parsed: ItemizedReceiptParseResult;
            try {
                parsed = await smartParseItemizedReceiptWithAI(rawText, { signal: controller.signal });
            } catch {
                parsed = { ...parseReceiptFromOCR(rawText), items: [] };
            }
            if (controller.signal.aborted) return;
            if (!parsed || Object.keys(parsed).length === 0) parsed = { ...parseReceiptFromOCR(rawText), items: [] };
            setOcrParsed(parsed);
            // 방금 읽은 원문을 직접 넘깁니다(상태값은 다음 렌더에야 바뀌므로 이전 원문이 메모에 들어가던 문제).
            applyOcrResult(parsed, parsed.items?.length ? 'allItems' : 'parsed', { fileName: file.name, rawText });
        } catch (error: any) {
            if (controller.signal.aborted) return;
            // OCR 결과는 마지막 단계에서만 입력칸에 반영되므로 되돌릴 것이 없습니다.
            // (폼 전체를 이전 값으로 되돌리면 OCR 중에 입력한 내용까지 사라집니다.)
            const message = error?.message || 'OCR 처리 중 오류가 발생했습니다.';
            setOcrError(message.includes('API 키') || message.includes('키가 필요')
                ? 'OCR 기능을 사용하려면 설정에서 Vision API 키 또는 Gemini API 키를 입력해 주세요.'
                : `${message} 작성 중인 지출 내용은 유지됩니다.`);
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
                setOcrLoading(false);
            }
        }
    };

    return {
        ocrFile,
        ocrLoading,
        ocrRawText,
        ocrMessage,
        ocrError,
        showOcrRaw,
        ocrParsed,
        hasOcrInput: Boolean(ocrFile || ocrRawText || ocrParsed),
        selectOcrFile,
        toggleOcrRaw: () => setShowOcrRaw(prev => !prev),
        runOcr,
        applyOcrItems,
    };
}
