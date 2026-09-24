/**
 * 서류 내용을 한 번만 정의하고 DOCX(docx 라이브러리)와 HTML(PDF·미리보기)로 같은 모양을 그리기 위한
 * 중간 표현. 서식을 연도·기관별로 바꿀 때는 builders.ts의 블록 구성만 고치면 된다.
 */
import {
    AlignmentType,
    BorderStyle,
    Document,
    HeightRule,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
} from 'docx';

export const DOC_FONT = '맑은 고딕';
/** A4 (twip) */
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const PAGE_MARGIN = 1134; // 2cm
export const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2; // 9638

export type Align = 'left' | 'center' | 'right';

export interface CellSpec {
    text: string;
    colSpan?: number;
    rowSpan?: number;
    bold?: boolean;
    align?: Align;
    /** 머리칸 음영 */
    shade?: boolean;
    /** pt 단위 글자 크기(기본은 표 fontSize) */
    size?: number;
}

export type Cell = string | CellSpec;

export type DocBlock =
    | { type: 'title'; text: string }
    | { type: 'paragraph'; text: string; align?: Align; bold?: boolean; size?: number; spaceBefore?: number }
    | {
        type: 'table';
        /** 열 너비 비율(합계를 본문 폭에 맞춰 늘리거나 줄인다) */
        widths: number[];
        rows: Cell[][];
        /** 페이지마다 반복할 머리 행 수 */
        headerRows?: number;
        /** pt, 기본 10 */
        fontSize?: number;
        /** 행 최소 높이(twip) */
        minRowHeight?: number;
    }
    | { type: 'spacer' };

export interface DocModel {
    title: string;
    blocks: DocBlock[];
}

const toSpec = (cell: Cell): CellSpec => (typeof cell === 'string' ? { text: cell } : cell);

function scaledWidths(widths: number[]): number[] {
    const total = widths.reduce((sum, w) => sum + w, 0) || 1;
    const scaled = widths.map(w => Math.floor((w / total) * CONTENT_WIDTH));
    scaled[scaled.length - 1] += CONTENT_WIDTH - scaled.reduce((sum, w) => sum + w, 0);
    return scaled;
}

/**
 * 각 셀이 차지하는 시작 열을 계산한다(위 행의 rowSpan이 차지한 칸은 건너뜀).
 * docx·HTML 모두 rowSpan 아래 칸은 자동으로 비워지므로 rows에는 그 칸을 넣지 않는다.
 */
function layoutRows(rows: Cell[][], columnCount: number): Array<Array<{ spec: CellSpec; column: number }>> {
    const occupied: boolean[][] = [];
    return rows.map((row, rowIndex) => {
        occupied[rowIndex] = occupied[rowIndex] || [];
        let column = 0;
        return row.map(cell => {
            const spec = toSpec(cell);
            while (occupied[rowIndex][column]) column += 1;
            const start = column;
            const colSpan = Math.max(1, spec.colSpan || 1);
            const rowSpan = Math.max(1, spec.rowSpan || 1);
            for (let r = 0; r < rowSpan; r += 1) {
                occupied[rowIndex + r] = occupied[rowIndex + r] || [];
                for (let c = 0; c < colSpan; c += 1) occupied[rowIndex + r][start + c] = true;
            }
            column = Math.min(columnCount, start + colSpan);
            return { spec, column: start };
        });
    });
}

// ─── DOCX ───

const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const;
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

// Word XML에 넣을 수 없는 제어문자 제거(탭·줄바꿈 허용)
const XML_INVALID_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const clean = (text: string) => String(text ?? '').replace(XML_INVALID_CHARS, '');

function textParagraphs(text: string, options: { align?: Align; bold?: boolean; size: number; spaceBefore?: number }): Paragraph[] {
    const lines = clean(text).split(/\r?\n/);
    return lines.map((line, index) => new Paragraph({
        alignment: ALIGN[options.align || 'left'],
        spacing: { before: index === 0 ? options.spaceBefore ?? 0 : 0, after: 0, line: 276 },
        children: [new TextRun({ text: line, bold: options.bold, size: options.size * 2, font: DOC_FONT })],
    }));
}

function renderDocxTable(block: Extract<DocBlock, { type: 'table' }>): Table {
    const widths = scaledWidths(block.widths);
    const fontSize = block.fontSize ?? 10;
    const headerRows = block.headerRows ?? 0;
    const laidOut = layoutRows(block.rows, widths.length);
    return new Table({
        width: { size: CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: widths,
        layout: TableLayoutType.FIXED,
        rows: laidOut.map((row, rowIndex) => new TableRow({
            tableHeader: rowIndex < headerRows,
            cantSplit: true,
            height: block.minRowHeight ? { value: block.minRowHeight, rule: HeightRule.ATLEAST } : undefined,
            children: row.map(({ spec, column }) => {
                const colSpan = Math.max(1, spec.colSpan || 1);
                const width = widths.slice(column, column + colSpan).reduce((sum, w) => sum + w, 0);
                return new TableCell({
                    columnSpan: colSpan > 1 ? colSpan : undefined,
                    rowSpan: spec.rowSpan && spec.rowSpan > 1 ? spec.rowSpan : undefined,
                    width: { size: width, type: WidthType.DXA },
                    verticalAlign: VerticalAlign.CENTER,
                    borders: CELL_BORDERS,
                    margins: { top: 40, bottom: 40, left: 80, right: 80 },
                    shading: spec.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EDEDED' } : undefined,
                    children: textParagraphs(spec.text, {
                        align: spec.align || (spec.shade ? 'center' : 'left'),
                        bold: spec.bold ?? spec.shade,
                        size: spec.size ?? fontSize,
                    }),
                });
            }),
        })),
    });
}

export function renderDocx(model: DocModel): Document {
    const children: Array<Paragraph | Table> = [];
    for (const block of model.blocks) {
        if (block.type === 'title') {
            children.push(...textParagraphs(block.text, { align: 'center', bold: true, size: 16 }));
            children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
        } else if (block.type === 'paragraph') {
            children.push(...textParagraphs(block.text, {
                align: block.align,
                bold: block.bold,
                size: block.size ?? 10,
                spaceBefore: block.spaceBefore,
            }));
        } else if (block.type === 'spacer') {
            children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));
        } else {
            children.push(renderDocxTable(block));
        }
    }
    const font = { ascii: DOC_FONT, eastAsia: DOC_FONT, hAnsi: DOC_FONT, cs: DOC_FONT };
    return new Document({
        title: model.title,
        creator: 'JJSS',
        styles: { default: { document: { run: { font, size: 20 } } } },
        sections: [{
            properties: {
                page: {
                    size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
                    margin: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
                },
            },
            children,
        }],
    });
}

/** 브라우저(렌더러)에서 저장용 Blob 만들기. Node 테스트에서는 Packer.toBuffer를 직접 쓴다. */
export function packDocument(doc: Document): Promise<Blob> {
    return Packer.toBlob(doc);
}

// ─── HTML (savePdf·미리보기) ───

export function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const htmlText = (text: string) => escapeHtml(clean(text)).replace(/\r?\n/g, '<br>');

function renderHtmlTable(block: Extract<DocBlock, { type: 'table' }>): string {
    const widths = scaledWidths(block.widths);
    const headerRows = block.headerRows ?? 0;
    const colgroup = `<colgroup>${widths.map(w => `<col style="width:${((w / CONTENT_WIDTH) * 100).toFixed(2)}%">`).join('')}</colgroup>`;
    const rowHtml = (row: Cell[]) => `<tr>${row.map(cell => {
        const spec = toSpec(cell);
        const attrs = [
            spec.colSpan && spec.colSpan > 1 ? ` colspan="${spec.colSpan}"` : '',
            spec.rowSpan && spec.rowSpan > 1 ? ` rowspan="${spec.rowSpan}"` : '',
        ].join('');
        const styles = [
            `text-align:${spec.align || (spec.shade ? 'center' : 'left')}`,
            spec.bold ?? spec.shade ? 'font-weight:bold' : '',
            spec.shade ? 'background:#ededed' : '',
            spec.size ? `font-size:${spec.size}pt` : '',
        ].filter(Boolean).join(';');
        return `<td${attrs} style="${styles}">${htmlText(spec.text)}</td>`;
    }).join('')}</tr>`;
    const head = block.rows.slice(0, headerRows).map(rowHtml).join('');
    const body = block.rows.slice(headerRows).map(rowHtml).join('');
    const style = `font-size:${block.fontSize ?? 10}pt`;
    return `<table style="${style}">${colgroup}${head ? `<thead>${head}</thead>` : ''}<tbody>${body}</tbody></table>`;
}

/** 표만 쓰는 단순 HTML 문서(인쇄용 A4). 스크립트·외부 리소스 없음. */
export function renderHtml(model: DocModel): string {
    const body = model.blocks.map(block => {
        if (block.type === 'title') return `<h1>${htmlText(block.text)}</h1>`;
        if (block.type === 'paragraph') {
            const styles = [
                `text-align:${block.align || 'left'}`,
                block.bold ? 'font-weight:bold' : '',
                block.size ? `font-size:${block.size}pt` : '',
                block.spaceBefore ? `margin-top:${Math.round(block.spaceBefore / 20)}pt` : '',
            ].filter(Boolean).join(';');
            return `<p style="${styles}">${htmlText(block.text)}</p>`;
        }
        if (block.type === 'spacer') return '<div class="spacer"></div>';
        return renderHtmlTable(block);
    }).join('\n');
    return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(model.title)}</title>
<style>
@page { size: A4; margin: 20mm; }
body { font-family: '${DOC_FONT}', 'Malgun Gothic', sans-serif; font-size: 10pt; color: #000; margin: 0; }
h1 { font-size: 16pt; text-align: center; margin: 0 0 10pt; }
p { margin: 0; line-height: 1.5; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
td { border: 1px solid #000; padding: 2pt 4pt; vertical-align: middle; word-break: keep-all; overflow-wrap: anywhere; }
.spacer { height: 8pt; }
</style></head>
<body>
${body}
</body></html>`;
}
