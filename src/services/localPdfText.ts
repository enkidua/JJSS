/**
 * PDF 글자를 PC 안에서만 추출한다(외부 전송 없음).
 *
 * - pdf.js(`pdfjs-dist`)가 설치되어 있으면 사용하고, 없거나 읽지 못하면 null을 돌려준다.
 *   이 경우 호출한 쪽은 원본 전송 확인(동의 C)을 받거나 요청을 멈춘다. 자동으로 원본을 보내지 않는다.
 * - pdf.js는 Vite의 import.meta.glob으로 "있을 때만" 묶는다. 패키지가 없으면 빈 목록이 되어 빌드·타입 검사가 그대로 통과한다.
 * - 작업자는 별도 Worker 없이 같은 창에서 실행한다(파일 경로·외부 스크립트 불필요).
 */

interface PdfTextItem {
    str?: string;
    hasEOL?: boolean;
}

interface PdfPageProxy {
    getTextContent(): Promise<{ items: PdfTextItem[] }>;
    cleanup?: () => void;
}

interface PdfDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPageProxy>;
    destroy(): Promise<void>;
}

interface PdfJsModule {
    getDocument(source: Record<string, unknown>): { promise: Promise<PdfDocumentProxy>; destroy?: () => Promise<void> };
}

export interface LocalPdfTextResult {
    text: string;
    pageCount: number;
    /** 실제로 읽어 본 쪽 수(쪽 수·글자 수 한도 때문에 전체보다 적을 수 있음) */
    checkedPageCount: number;
    /** 글자를 충분히 읽은 쪽 수 */
    textPageCount: number;
    truncated: boolean;
}

const MAX_PAGES = 200;
const MAX_TEXT_CHARS = 200_000;
const MIN_PAGE_CHARS = 20;

// 설치되어 있을 때만 묶인다(없으면 빈 객체). 경로는 pdfjs-dist 4.x/5.x 배포 구조 기준.
const PDFJS_LOADERS = import.meta.glob<PdfJsModule>('/node_modules/pdfjs-dist/build/pdf.min.mjs', { exhaustive: true });
const PDFJS_WORKER_LOADERS = import.meta.glob<Record<string, unknown>>('/node_modules/pdfjs-dist/build/pdf.worker.min.mjs', { exhaustive: true });

let pdfjsPromise: Promise<PdfJsModule | null> | null = null;

async function loadPdfJs(): Promise<PdfJsModule | null> {
    const loadPdf = Object.values(PDFJS_LOADERS)[0];
    const loadWorker = Object.values(PDFJS_WORKER_LOADERS)[0];
    if (!loadPdf || !loadWorker) return null;
    if (!pdfjsPromise) {
        pdfjsPromise = (async () => {
            try {
                // 같은 창에서 실행하는 "가짜 worker" 모드: pdf.js가 globalThis.pdfjsWorker를 먼저 확인한다.
                const worker = await loadWorker();
                (globalThis as Record<string, unknown>).pdfjsWorker = worker;
                const pdfjs = await loadPdf();
                return typeof pdfjs?.getDocument === 'function' ? pdfjs : null;
            } catch {
                return null;
            }
        })();
    }
    return pdfjsPromise;
}

/** 로컬 PDF 추출 기능을 쓸 수 있는지(설치 여부). 화면 안내용. */
export function isLocalPdfTextAvailable(): boolean {
    return Object.keys(PDFJS_LOADERS).length > 0 && Object.keys(PDFJS_WORKER_LOADERS).length > 0;
}

/** PDF 바이트에서 글자를 추출한다. 실패하거나 pdf.js가 없으면 null. 오류 내용은 기록하지 않는다. */
export async function extractPdfTextLocally(bytes: Uint8Array): Promise<LocalPdfTextResult | null> {
    if (!bytes?.length) return null;
    const pdfjs = await loadPdfJs();
    if (!pdfjs) return null;
    let documentProxy: PdfDocumentProxy | null = null;
    try {
        const task = pdfjs.getDocument({
            // pdf.js가 버퍼를 넘겨받아 비우므로 복사본을 준다.
            data: bytes.slice(),
            isEvalSupported: false,
            disableFontFace: true,
            useSystemFonts: false,
            disableAutoFetch: true,
            disableStream: true,
            stopAtErrors: false,
        });
        documentProxy = await task.promise;
        const pageCount = Math.max(0, Number(documentProxy.numPages) || 0);
        const pages: string[] = [];
        let textPageCount = 0;
        let length = 0;
        let truncated = pageCount > MAX_PAGES;
        for (let pageNumber = 1; pageNumber <= Math.min(pageCount, MAX_PAGES); pageNumber += 1) {
            const page = await documentProxy.getPage(pageNumber);
            const content = await page.getTextContent();
            const pageText = content.items
                .map(item => `${typeof item.str === 'string' ? item.str : ''}${item.hasEOL ? '\n' : ''}`)
                .join('')
                .replace(/[ \t]+\n/g, '\n')
                .trim();
            page.cleanup?.();
            if (pageText.replace(/\s+/g, '').length >= MIN_PAGE_CHARS) textPageCount += 1;
            pages.push(pageText);
            length += pageText.length;
            if (length > MAX_TEXT_CHARS) {
                truncated = true;
                break;
            }
        }
        const text = pages.join('\n\n').slice(0, MAX_TEXT_CHARS);
        return { text, pageCount, checkedPageCount: pages.length, textPageCount, truncated };
    } catch {
        return null;
    } finally {
        documentProxy?.destroy().catch(() => undefined);
    }
}

/**
 * 추출한 글이 "텍스트 PDF"로 볼 만큼 충분한지 판단한다.
 * 스캔본(이미지)·글꼴 문제로 글자가 깨진 PDF는 false → 원본 전송 확인 대상.
 */
export function isMeaningfulPdfText(result: LocalPdfTextResult | null | undefined): result is LocalPdfTextResult {
    if (!result || !result.pageCount) return false;
    const compact = result.text.replace(/\s+/g, '');
    if (compact.length < 40) return false;
    const readable = (compact.match(/[가-힣A-Za-z0-9]/g) || []).length;
    if (readable / compact.length < 0.5) return false;
    const broken = (compact.match(/[\uFFFD\uE000-\uF8FF]/g) || []).length;
    if (broken / compact.length > 0.05) return false;
    const checkedPages = Math.max(1, result.checkedPageCount);
    // 대부분의 쪽(80% 이상)에서 글자가 나와야 한다. 스캔한 쪽이 많으면 글만 보내면 내용이 빠진다.
    return result.textPageCount / checkedPages >= 0.8;
}
