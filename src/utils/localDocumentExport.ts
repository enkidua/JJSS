import { saveJjssBlob, saveJjssPdf } from './jjssFileService';

type PngExportStage =
    | 'prepare' | 'serialize' | 'svg-render' | 'primary-canvas' | 'primary-blob'
    | 'fallback-start' | 'fallback-canvas' | 'fallback-blob'
    | 'save-dialog' | 'ipc-transfer' | 'file-write' | 'complete';

type PngExportMetrics = {
    width: number;
    height: number;
    exportWidth: number;
    exportHeight: number;
    scale: number;
};

const PNG_MAX_DIMENSION = 16_384;
const PNG_MAX_PIXELS = 64_000_000;
const PNG_MIN_READABLE_SCALE = 0.25;
const PNG_MAX_SCALE = 2;

function nextPaint(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function safeExportErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    return message.replace(/blob:[^\s)]+/gi, 'blob:[redacted]').slice(0, 160);
}

function reportPngExportStage(stage: PngExportStage, metrics: Partial<PngExportMetrics>, error?: unknown) {
    if (!import.meta.env.DEV) return;
    console.debug('rehab-plan-png-export', {
        stage,
        width: metrics.width || 0,
        height: metrics.height || 0,
        exportWidth: metrics.exportWidth || 0,
        exportHeight: metrics.exportHeight || 0,
        ...(error ? {
            errorName: error instanceof Error ? error.name : 'Error',
            errorMessage: safeExportErrorMessage(error),
        } : {}),
    });
}

function inlineComputedStyles(source: Element, target: Element) {
    const computed = window.getComputedStyle(source);
    const targetElement = target as HTMLElement;
    for (let index = 0; index < computed.length; index += 1) {
        const property = computed.item(index);
        targetElement.style.setProperty(property, computed.getPropertyValue(property), computed.getPropertyPriority(property));
    }

    const sourceChildren = Array.from(source.children);
    const targetChildren = Array.from(target.children);
    sourceChildren.forEach((child, index) => {
        if (targetChildren[index]) inlineComputedStyles(child, targetChildren[index]);
    });
}

function cloneForExport(element: HTMLElement): HTMLElement {
    const clone = element.cloneNode(true) as HTMLElement;
    inlineComputedStyles(element, clone);
    clone.style.margin = '0';
    clone.style.boxShadow = 'none';
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    return clone;
}

function escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPrintableHtml(clone: HTMLElement, documentTitle: string) {
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'"><title>${escapeHtml(documentTitle)}</title><style>
        @page { size: A4 portrait; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .rehab-plan-title-row,
        .rehab-plan-approval-table tr,
        .rehab-plan-form-table tr:not(.rehab-plan-breakable-row),
        .rehab-plan-goal-table thead,
        .rehab-plan-footer-table tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
        }
        .rehab-plan-breakable-row,
        .rehab-plan-breakable-row > td,
        .rehab-plan-breakable-row > th {
            break-inside: auto !important;
            page-break-inside: auto !important;
        }
    </style></head><body>${clone.outerHTML}</body></html>`;
}

function getPngExportMetrics(element: HTMLElement): PngExportMetrics {
    const bounds = element.getBoundingClientRect();
    const width = Math.ceil(Math.max(element.scrollWidth, bounds.width));
    const height = Math.ceil(Math.max(element.scrollHeight, bounds.height));
    if (!width || !height) throw new Error('이미지로 저장할 미리보기 영역을 찾지 못했습니다.');

    const scale = Math.min(
        PNG_MAX_SCALE,
        PNG_MAX_DIMENSION / Math.max(width, height),
        Math.sqrt(PNG_MAX_PIXELS / (width * height)),
    );
    if (!Number.isFinite(scale) || scale < PNG_MIN_READABLE_SCALE) {
        throw new Error('문서가 너무 길어 한 장의 PNG로 안전하게 저장할 수 없습니다. PDF 저장 기능을 이용해 주세요.');
    }

    const exportWidth = Math.max(1, Math.floor(width * scale));
    const exportHeight = Math.max(1, Math.floor(height * scale));
    if (exportWidth > PNG_MAX_DIMENSION
        || exportHeight > PNG_MAX_DIMENSION
        || exportWidth * exportHeight > PNG_MAX_PIXELS) {
        throw new Error('문서가 너무 길어 한 장의 PNG로 안전하게 저장할 수 없습니다. PDF 저장 기능을 이용해 주세요.');
    }
    return { width, height, exportWidth, exportHeight, scale };
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (!blob || blob.size === 0 || blob.type !== 'image/png') {
                reject(new Error('PNG 파일을 만들지 못했습니다.'));
                return;
            }
            resolve(blob);
        }, 'image/png');
    });
}

function loadSvgImage(svgUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        const timeoutId = window.setTimeout(() => {
            image.src = '';
            reject(new Error('미리보기 이미지 렌더링 시간이 초과되었습니다.'));
        }, 15_000);
        image.onload = () => {
            window.clearTimeout(timeoutId);
            resolve(image);
        };
        image.onerror = () => {
            window.clearTimeout(timeoutId);
            reject(new Error('미리보기 이미지를 렌더링하지 못했습니다.'));
        };
        image.src = svgUrl;
    });
}

async function renderWithSvgForeignObject(element: HTMLElement, metrics: PngExportMetrics): Promise<Blob> {
    let stage: PngExportStage = 'serialize';
    let svgUrl: string | null = null;
    try {
        const clone = cloneForExport(element);
        clone.style.width = `${metrics.width}px`;
        clone.style.height = `${metrics.height}px`;
        const serialized = new XMLSerializer().serializeToString(clone);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.exportWidth}" height="${metrics.exportHeight}" viewBox="0 0 ${metrics.width} ${metrics.height}"><foreignObject x="0" y="0" width="100%" height="100%">${serialized}</foreignObject></svg>`;
        const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        svgUrl = URL.createObjectURL(svgBlob);

        stage = 'svg-render';
        const image = await loadSvgImage(svgUrl);
        stage = 'primary-canvas';
        const canvas = document.createElement('canvas');
        canvas.width = metrics.exportWidth;
        canvas.height = metrics.exportHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('PNG 생성에 필요한 캔버스를 만들지 못했습니다.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, metrics.exportWidth, metrics.exportHeight);
        context.drawImage(image, 0, 0, metrics.exportWidth, metrics.exportHeight);

        stage = 'primary-blob';
        return await canvasToPngBlob(canvas);
    } catch (error) {
        reportPngExportStage(stage, metrics, error);
        throw error;
    } finally {
        if (svgUrl) URL.revokeObjectURL(svgUrl);
    }
}

async function renderWithHtml2Canvas(element: HTMLElement, metrics: PngExportMetrics): Promise<Blob> {
    reportPngExportStage('fallback-start', metrics);
    try {
        const { default: html2canvas } = await import('html2canvas');
        const canvas = await html2canvas(element, {
            backgroundColor: '#ffffff',
            scale: metrics.scale,
            useCORS: true,
            logging: false,
            imageTimeout: 15_000,
            removeContainer: true,
            width: metrics.width,
            height: metrics.height,
            windowWidth: Math.max(document.documentElement.clientWidth, metrics.width),
            windowHeight: Math.max(document.documentElement.clientHeight, metrics.height),
        });
        reportPngExportStage('fallback-canvas', metrics);
        if (!canvas.width || !canvas.height
            || canvas.width > PNG_MAX_DIMENSION
            || canvas.height > PNG_MAX_DIMENSION
            || canvas.width * canvas.height > PNG_MAX_PIXELS) {
            throw new Error('fallback 캔버스 크기가 안전 제한을 초과했습니다.');
        }
        const blob = await canvasToPngBlob(canvas);
        reportPngExportStage('fallback-blob', metrics);
        return blob;
    } catch (error) {
        reportPngExportStage('fallback-blob', metrics, error);
        throw error;
    }
}

export async function printElementAsPdf(element: HTMLElement, documentTitle: string) {
    await document.fonts?.ready;
    const clone = cloneForExport(element);
    clone.style.width = '210mm';
    clone.style.minHeight = '297mm';
    const printableHtml = buildPrintableHtml(clone, documentTitle);
    const nativeResult = await saveJjssPdf('rehab-plan', `${documentTitle}.pdf`, printableHtml);
    if (nativeResult) return nativeResult;

    const frame = document.createElement('iframe');
    frame.title = '직업재활계획서 PDF 출력';
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, {
        position: 'fixed',
        right: '0',
        bottom: '0',
        width: '1px',
        height: '1px',
        border: '0',
        opacity: '0',
        pointerEvents: 'none',
    });
    document.body.appendChild(frame);

    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (!frameDocument || !frameWindow) {
        frame.remove();
        throw new Error('PDF 출력 창을 준비하지 못했습니다.');
    }

    frameDocument.open();
    frameDocument.write(printableHtml.replace(clone.outerHTML, ''));
    frameDocument.close();
    frameDocument.title = documentTitle;
    frameDocument.body.appendChild(frameDocument.adoptNode(clone));

    try {
        await nextPaint();
        frameWindow.focus();
        frameWindow.print();
    } finally {
        frame.remove();
    }
    return undefined;
}

export async function downloadElementAsPng(element: HTMLElement, fileName: string) {
    let metrics: PngExportMetrics;
    try {
        if (!element.classList.contains('rehab-plan-document')) {
            throw new Error('직업재활계획서 문서 영역을 찾지 못했습니다.');
        }
        await document.fonts?.ready;
        await nextPaint();
        metrics = getPngExportMetrics(element);
    } catch (error) {
        reportPngExportStage('prepare', {}, error);
        throw error;
    }

    let pngBlob: Blob;
    try {
        pngBlob = await renderWithSvgForeignObject(element, metrics);
    } catch {
        try {
            pngBlob = await renderWithHtml2Canvas(element, metrics);
        } catch {
            throw new Error('이미지 저장에 실패했습니다. 기존 직업재활계획서 내용은 유지됩니다. PDF 저장 기능을 이용하거나 다시 시도해 주세요.');
        }
    }

    try {
        reportPngExportStage('save-dialog', metrics);
        const result = await saveJjssBlob('rehab-plan', fileName, pngBlob);
        if (!result.canceled) reportPngExportStage('complete', metrics);
        return result;
    } catch (error) {
        reportPngExportStage('ipc-transfer', metrics, error);
        throw error instanceof Error
            ? error
            : new Error('이미지 저장에 실패했습니다. 기존 직업재활계획서 내용은 유지됩니다. PDF 저장 기능을 이용하거나 다시 시도해 주세요.');
    }
}
