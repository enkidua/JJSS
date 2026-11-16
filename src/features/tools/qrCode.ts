/**
 * QR 코드 만들기(이 PC 안에서만 — 링크를 어디에도 보내지 않는다).
 * qrcode-generator로 무늬를 만들고, 화면·저장용 SVG/캔버스는 여기서 그린다.
 */
import qrcode from 'qrcode-generator';

export type QrErrorLevel = 'L' | 'M' | 'Q' | 'H';

/** QR에 담을 수 있는 글 길이(바이트). 너무 길면 무늬가 촘촘해져 인쇄물에서 잘 읽히지 않는다. */
export const MAX_QR_BYTES = 1200;

/** QR 무늬(true = 검은 칸). 한글은 UTF-8로 담는다. */
export function buildQrMatrix(text: string, level: QrErrorLevel = 'M'): boolean[][] {
    const value = String(text ?? '').trim();
    if (!value) throw new Error('QR 코드로 만들 링크나 글을 입력해 주세요.');
    const bytes = new TextEncoder().encode(value);
    if (bytes.length > MAX_QR_BYTES) throw new Error('QR 코드에 담기에는 글이 너무 깁니다. 링크만 넣거나 내용을 줄여 주세요.');
    // 바이트를 한 글자씩의 문자열로 바꿔 넣는다(라이브러리의 전역 인코딩 설정을 건드리지 않고 UTF-8로 담기 위해).
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const code = qrcode(0, level);
    try {
        code.addData(binary, 'Byte');
        code.make();
    } catch {
        throw new Error('QR 코드에 담기에는 글이 너무 깁니다. 링크만 넣거나 내용을 줄여 주세요.');
    }
    const size = code.getModuleCount();
    return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => code.isDark(row, col)));
}

/** QR 무늬를 SVG 글로(인쇄물·문서에 넣기 좋게 벡터로). margin은 둘레 흰 칸 수(읽히려면 4칸 권장). */
export function qrMatrixToSvg(matrix: readonly boolean[][], options: { margin?: number; dark?: string; light?: string } = {}): string {
    const margin = Math.max(0, Math.floor(options.margin ?? 4));
    const size = matrix.length + margin * 2;
    const dark = options.dark ?? '#000000';
    const light = options.light ?? '#ffffff';
    const parts: string[] = [];
    matrix.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
            if (!row[x]) { x += 1; continue; }
            let end = x;
            while (end + 1 < row.length && row[end + 1]) end += 1;
            parts.push(`M${x + margin} ${y + margin}h${end - x + 1}v1h-${end - x + 1}z`);
            x = end + 1;
        }
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path fill="${dark}" d="${parts.join('')}"/></svg>`;
}

/** 캔버스에 그린다(PNG 저장·미리보기용). pixelSize는 한 변의 대략적인 픽셀 수. */
export function drawQrToCanvas(canvas: HTMLCanvasElement, matrix: readonly boolean[][], options: { pixelSize?: number; margin?: number } = {}): void {
    const margin = Math.max(0, Math.floor(options.margin ?? 4));
    const cells = matrix.length + margin * 2;
    const cell = Math.max(1, Math.floor((options.pixelSize ?? 600) / cells));
    canvas.width = cells * cell;
    canvas.height = cells * cell;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('QR 코드를 그리지 못했습니다.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000000';
    matrix.forEach((row, y) => row.forEach((dark, x) => {
        if (dark) context.fillRect((x + margin) * cell, (y + margin) * cell, cell, cell);
    }));
}

/** 입력이 링크처럼 보이면 그대로, "www."로 시작하면 https://를 붙여 준다. 그 밖의 글은 그대로 담는다. */
export function normalizeQrText(text: string): string {
    const value = String(text ?? '').trim();
    return /^www\./i.test(value) ? `https://${value}` : value;
}
