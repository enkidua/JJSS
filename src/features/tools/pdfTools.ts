/**
 * PDF·이미지 도구(이 PC 안에서만 처리 — 파일을 어디에도 올리지 않는다).
 * pdf-lib로 합치기·쪽 뽑기·돌리기·이미지 묶기를 한다.
 */
import { PDFDocument, degrees } from 'pdf-lib';

/** 저장 상한(파일 서비스의 100MB보다 조금 작게) */
export const MAX_PDF_OUTPUT_BYTES = 95 * 1024 * 1024;
/** 한 번에 다루는 입력 합계 상한 */
export const MAX_PDF_INPUT_BYTES = 200 * 1024 * 1024;

export type PageRotation = 0 | 90 | 180 | 270;

function pdfError(error: unknown, fileLabel: string): Error {
    const text = String((error as Error)?.message || '');
    if (/encrypt/i.test(text)) return new Error(`${fileLabel}: 암호가 걸린 PDF는 다룰 수 없습니다. 암호를 푼 뒤 다시 시도해 주세요.`);
    return new Error(`${fileLabel}: PDF를 읽지 못했습니다. 파일이 손상되지 않았는지 확인해 주세요.`);
}

async function loadPdf(bytes: Uint8Array, fileLabel: string): Promise<PDFDocument> {
    try {
        return await PDFDocument.load(bytes);
    } catch (error) {
        throw pdfError(error, fileLabel);
    }
}

function assertOutputSize(bytes: Uint8Array): Uint8Array {
    if (bytes.length > MAX_PDF_OUTPUT_BYTES) throw new Error('만든 PDF가 너무 큽니다(95MB 초과). 파일을 나누어 다시 시도해 주세요.');
    return bytes;
}

/** PDF의 쪽수 */
export async function countPdfPages(bytes: Uint8Array, fileLabel = 'PDF'): Promise<number> {
    return (await loadPdf(bytes, fileLabel)).getPageCount();
}

/** 여러 PDF를 순서대로 하나로 합친다. */
export async function mergePdfs(files: Array<{ name: string; bytes: Uint8Array }>): Promise<Uint8Array> {
    if (files.length < 2) throw new Error('합칠 PDF를 두 개 이상 넣어 주세요.');
    const output = await PDFDocument.create();
    for (const file of files) {
        const source = await loadPdf(file.bytes, file.name);
        const pages = await output.copyPages(source, source.getPageIndices());
        pages.forEach(page => output.addPage(page));
    }
    return assertOutputSize(await output.save());
}

/** 고른 쪽만 새 PDF로 만든다(순서는 pageIndexes 그대로). rotation을 주면 뽑은 쪽을 그만큼 더 돌린다. */
export async function extractPdfPages(bytes: Uint8Array, pageIndexes: readonly number[], options: { rotation?: PageRotation; fileLabel?: string } = {}): Promise<Uint8Array> {
    if (!pageIndexes.length) throw new Error('뽑을 쪽이 없습니다.');
    const source = await loadPdf(bytes, options.fileLabel ?? 'PDF');
    const total = source.getPageCount();
    if (pageIndexes.some(index => !Number.isInteger(index) || index < 0 || index >= total)) throw new Error(`이 PDF는 ${total}쪽까지 있습니다.`);
    const output = await PDFDocument.create();
    const pages = await output.copyPages(source, [...pageIndexes]);
    for (const page of pages) {
        if (options.rotation) page.setRotation(degrees((page.getRotation().angle + options.rotation) % 360));
        output.addPage(page);
    }
    return assertOutputSize(await output.save());
}

export interface PdfImage {
    /** JPEG 또는 PNG 바이트 */
    bytes: Uint8Array;
    type: 'image/jpeg' | 'image/png';
}

/** A4(포인트) */
const A4 = { width: 595.28, height: 841.89 };

/**
 * 이미지 여러 장을 한 PDF로 묶는다(한 장에 한 쪽).
 * - a4: A4 용지에 여백을 두고 비율을 지켜 맞춘다(가로로 긴 사진은 가로 용지).
 * - fit: 이미지 크기 그대로 한 쪽으로 만든다.
 */
export async function imagesToPdf(images: readonly PdfImage[], options: { page?: 'a4' | 'fit'; marginPt?: number } = {}): Promise<Uint8Array> {
    if (!images.length) throw new Error('PDF로 만들 이미지를 넣어 주세요.');
    const output = await PDFDocument.create();
    const margin = Math.max(0, options.marginPt ?? 24);
    for (const [index, image] of images.entries()) {
        let embedded;
        try {
            embedded = image.type === 'image/png' ? await output.embedPng(image.bytes) : await output.embedJpg(image.bytes);
        } catch {
            throw new Error(`${index + 1}번째 이미지를 읽지 못했습니다.`);
        }
        if (options.page === 'fit') {
            const page = output.addPage([embedded.width, embedded.height]);
            page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
            continue;
        }
        const landscape = embedded.width > embedded.height;
        const pageWidth = landscape ? A4.height : A4.width;
        const pageHeight = landscape ? A4.width : A4.height;
        const scale = Math.min((pageWidth - margin * 2) / embedded.width, (pageHeight - margin * 2) / embedded.height);
        const width = embedded.width * scale;
        const height = embedded.height * scale;
        const page = output.addPage([pageWidth, pageHeight]);
        page.drawImage(embedded, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
    }
    return assertOutputSize(await output.save());
}

/** 저장할 파일 이름에서 쓸 수 없는 글자를 뺀다(확장자 제외한 이름). */
export function safeBaseName(name: string, fallback = '문서'): string {
    const base = String(name ?? '').replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\.+/g, '.').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
    return (base || fallback).slice(0, 80);
}
