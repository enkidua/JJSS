/**
 * 서류 내용을 한 번만 정의하고 DOCX(docx 라이브러리)와 HTML(PDF·미리보기)로 같은 모양을 그리기 위한
 * 중간 표현. 서식을 연도·기관별로 바꿀 때는 builders.ts의 블록 구성만 고치면 된다.
 *
 * 공식 서식을 그대로 옮겨야 하는 서류(지원고용 결과보고 등)를 위해 mm 단위 지정도 받는다.
 *  - 표: 열 폭(widthsMm)·행 높이(rowHeightsMm)·바깥선 굵기·글꼴
 *  - 문서: 쪽 여백(page.marginMm)·기본 글꼴
 * 지정하지 않으면 예전과 같이 본문 폭 비율(widths)·기본 여백(2cm)·맑은 고딕으로 그린다.
 */
import {
    AlignmentType,
    BorderStyle,
    Document,
    HeightRule,
    Packer,
    PageBreak,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    UnderlineType,
    VerticalAlign,
    WidthType,
} from 'docx';

export const DOC_FONT = '맑은 고딕';
/** A4 (twip) */
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const PAGE_MARGIN = 1134; // 2cm
export const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2; // 9638

/** 1mm = 56.6929 twip */
export const mmToTwip = (mm: number) => Math.round(mm * 56.6929);

export type Align = 'left' | 'center' | 'right';
export type VAlign = 'top' | 'center' | 'bottom';
/**
 * 글꼴 계열. 공식 서식 원본에 맞춰 고른다.
 *  - malgun: 맑은 고딕(기본)
 *  - gothic: 굴림 계열(공단 붙임 서식 표)
 *  - serif: 바탕 계열(결과보고·기타소득 지급내역서 본문)
 *  - headline: 굵은 고딕 제목
 */
export type FontKey = 'malgun' | 'gothic' | 'serif' | 'headline';

const DOCX_FONTS: Record<FontKey, string> = {
    malgun: '맑은 고딕',
    gothic: '굴림',
    serif: '바탕',
    headline: '맑은 고딕',
};
const HTML_FONTS: Record<FontKey, string> = {
    malgun: `'맑은 고딕', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif`,
    gothic: `'굴림', 'Gulim', '돋움', 'Dotum', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
    serif: `'바탕', 'Batang', 'BatangChe', 'AppleMyungjo', 'Nanum Myeongjo', 'Noto Serif KR', serif`,
    headline: `'HY헤드라인M', 'HYHeadLine-Medium', '맑은 고딕', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`,
};

export interface TextRunSpec {
    text: string;
    bold?: boolean;
    underline?: 'single' | 'double';
}

export interface CellSpec {
    text: string;
    colSpan?: number;
    rowSpan?: number;
    bold?: boolean;
    align?: Align;
    /** 세로 정렬(기본 가운데) */
    vAlign?: VAlign;
    /** 머리칸 음영 */
    shade?: boolean;
    /** pt 단위 글자 크기(기본은 표 fontSize) */
    size?: number;
    /** 이 칸만 다른 글꼴(예: 기타소득 지급내역서의 굵은 고딕 라벨) */
    font?: FontKey;
}

export type Cell = string | CellSpec;

export interface PageSpec {
    /** 쪽 여백(mm). 지정하지 않으면 사방 20mm */
    marginMm?: { top: number; right: number; bottom: number; left: number };
}

export type DocBlock =
    | {
        type: 'title';
        text: string;
        /** 일부만 밑줄·굵게 할 때(예: 회차 번호 빈칸) */
        runs?: TextRunSpec[];
        /** pt, 기본 16 */
        size?: number;
        align?: Align;
        /** 기본 굵게. 원본 서식이 보통 굵기면 false */
        bold?: boolean;
        underline?: 'single' | 'double';
        font?: FontKey;
        /** 제목 위·아래 간격(mm). 기본: 위 0, 아래 약 2mm */
        spaceBeforeMm?: number;
        spaceAfterMm?: number;
    }
    | {
        type: 'paragraph';
        text: string;
        runs?: TextRunSpec[];
        align?: Align;
        bold?: boolean;
        size?: number;
        /** twip(1/20pt). 예전 호출과 호환 */
        spaceBefore?: number;
        /** mm. spaceBefore보다 우선한다 */
        spaceBeforeMm?: number;
        spaceAfterMm?: number;
        font?: FontKey;
        /** 왼쪽 들여쓰기(mm) */
        indentMm?: number;
    }
    | {
        type: 'table';
        /** 열 너비 비율(합계를 본문 폭에 맞춰 늘리거나 줄인다) */
        widths: number[];
        /** 열 너비(mm). 주면 widths 대신 이 값을 그대로 쓰고 표를 가운데 둔다 */
        widthsMm?: number[];
        rows: Cell[][];
        /** 페이지마다 반복할 머리 행 수 */
        headerRows?: number;
        /** pt, 기본 10 */
        fontSize?: number;
        /** 행 최소 높이(twip) */
        minRowHeight?: number;
        /** 행별 최소 높이(mm). 내용이 길면 늘어난다 */
        rowHeightsMm?: Array<number | null | undefined>;
        /** 'none'이면 선 없는 배치용 표(서명란 정렬 등) */
        borders?: 'all' | 'none';
        /** 바깥선 굵기(pt). 기본 0.5 */
        outerBorderPt?: number;
        /** 안쪽 선 굵기(pt). 기본 0.5 */
        innerBorderPt?: number;
        font?: FontKey;
        /** 칸 안 여백(mm). 기본 좌우 1.4, 위아래 0.7 */
        paddingMm?: { x: number; y: number };
        /** 칸 안 줄 간격(1 = 한 줄). 기본 DOCX 1.15, HTML 1.35 */
        lineSpacing?: number;
    }
    | { type: 'spacer'; heightMm?: number }
    /** 쪽 나눔. 병합 칸이 쪽을 넘지 못하는 서식(훈련일지 등)을 원본처럼 쪽마다 나눌 때 쓴다 */
    | { type: 'pageBreak' };

export interface DocModel {
    title: string;
    blocks: DocBlock[];
    page?: PageSpec;
    /** 문서 기본 글꼴 */
    font?: FontKey;
}

const toSpec = (cell: Cell): CellSpec => (typeof cell === 'string' ? { text: cell } : cell);

function scaledWidths(widths: number[]): number[] {
    const total = widths.reduce((sum, w) => sum + w, 0) || 1;
    const scaled = widths.map(w => Math.floor((w / total) * CONTENT_WIDTH));
    scaled[scaled.length - 1] += CONTENT_WIDTH - scaled.reduce((sum, w) => sum + w, 0);
    return scaled;
}

/** 표 열 폭(twip). widthsMm가 있으면 그대로, 없으면 본문 폭 비율. */
function tableWidths(block: Extract<DocBlock, { type: 'table' }>): number[] {
    return block.widthsMm?.length ? block.widthsMm.map(mmToTwip) : scaledWidths(block.widths);
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

/** 셀이 표의 어느 바깥 가장자리에 닿는지 */
function edgesOf(rowIndex: number, rowCount: number, column: number, columnCount: number, spec: CellSpec) {
    const colSpan = Math.max(1, spec.colSpan || 1);
    const rowSpan = Math.max(1, spec.rowSpan || 1);
    return {
        top: rowIndex === 0,
        bottom: rowIndex + rowSpan >= rowCount,
        left: column === 0,
        right: column + colSpan >= columnCount,
    };
}

// ─── DOCX ───

const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const;
const V_ALIGN = { top: VerticalAlign.TOP, center: VerticalAlign.CENTER, bottom: VerticalAlign.BOTTOM } as const;
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
/** docx 선 굵기 단위는 1/8pt */
const border = (pt: number) => ({ style: BorderStyle.SINGLE, size: Math.max(2, Math.round(pt * 8)), color: '000000' });

// Word XML에 넣을 수 없는 제어문자 제거(탭·줄바꿈 허용)
const XML_INVALID_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const clean = (text: string) => String(text ?? '').replace(XML_INVALID_CHARS, '');

const UNDERLINE = { single: UnderlineType.SINGLE, double: UnderlineType.DOUBLE } as const;

function runsFor(text: string, runs: TextRunSpec[] | undefined): TextRunSpec[][] {
    // 줄 단위로 나눈 run 목록. runs가 없으면 text를 한 run으로 본다.
    const source = runs?.length ? runs : [{ text }];
    const lines: TextRunSpec[][] = [[]];
    for (const run of source) {
        const parts = clean(run.text).split(/\r?\n/);
        parts.forEach((part, index) => {
            if (index > 0) lines.push([]);
            if (part) lines[lines.length - 1].push({ ...run, text: part });
        });
    }
    return lines;
}

function textParagraphs(
    text: string,
    options: {
        align?: Align;
        bold?: boolean;
        size: number;
        spaceBefore?: number;
        spaceAfter?: number;
        font?: FontKey;
        runs?: TextRunSpec[];
        underline?: 'single' | 'double';
        indent?: number;
        line?: number;
    },
): Paragraph[] {
    const lines = runsFor(text, options.runs);
    const font = DOCX_FONTS[options.font ?? 'malgun'];
    return lines.map((line, index) => new Paragraph({
        alignment: ALIGN[options.align || 'left'],
        spacing: {
            before: index === 0 ? options.spaceBefore ?? 0 : 0,
            after: index === lines.length - 1 ? options.spaceAfter ?? 0 : 0,
            line: options.line ?? 276,
        },
        indent: options.indent ? { left: options.indent } : undefined,
        children: (line.length ? line : [{ text: '' }]).map(run => new TextRun({
            text: run.text,
            bold: run.bold ?? options.bold,
            size: options.size * 2,
            font,
            underline: (run.underline ?? options.underline) ? { type: UNDERLINE[(run.underline ?? options.underline) as 'single' | 'double'] } : undefined,
        })),
    }));
}

function renderDocxTable(block: Extract<DocBlock, { type: 'table' }>, defaultFont: FontKey): Table {
    const widths = tableWidths(block);
    const fontSize = block.fontSize ?? 10;
    const headerRows = block.headerRows ?? 0;
    const laidOut = layoutRows(block.rows, widths.length);
    const exact = Boolean(block.widthsMm?.length);
    const totalWidth = widths.reduce((sum, w) => sum + w, 0);
    const none = block.borders === 'none';
    const outer = border(block.outerBorderPt ?? 0.5);
    const inner = border(block.innerBorderPt ?? 0.5);
    const padX = mmToTwip(block.paddingMm?.x ?? 1.4);
    const padY = mmToTwip(block.paddingMm?.y ?? 0.7);
    return new Table({
        width: { size: exact ? totalWidth : CONTENT_WIDTH, type: WidthType.DXA },
        columnWidths: widths,
        layout: TableLayoutType.FIXED,
        alignment: exact ? AlignmentType.CENTER : undefined,
        rows: laidOut.map((row, rowIndex) => {
            const heightMm = block.rowHeightsMm?.[rowIndex];
            const height = heightMm ? mmToTwip(heightMm) : block.minRowHeight;
            return new TableRow({
                tableHeader: rowIndex < headerRows,
                cantSplit: true,
                height: height ? { value: height, rule: HeightRule.ATLEAST } : undefined,
                children: row.map(({ spec, column }) => {
                    const colSpan = Math.max(1, spec.colSpan || 1);
                    const width = widths.slice(column, column + colSpan).reduce((sum, w) => sum + w, 0);
                    const edge = edgesOf(rowIndex, laidOut.length, column, widths.length, spec);
                    const borders = none
                        ? { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER }
                        : {
                            top: edge.top ? outer : inner,
                            bottom: edge.bottom ? outer : inner,
                            left: edge.left ? outer : inner,
                            right: edge.right ? outer : inner,
                        };
                    return new TableCell({
                        columnSpan: colSpan > 1 ? colSpan : undefined,
                        rowSpan: spec.rowSpan && spec.rowSpan > 1 ? spec.rowSpan : undefined,
                        width: { size: width, type: WidthType.DXA },
                        verticalAlign: V_ALIGN[spec.vAlign || 'center'],
                        borders,
                        margins: { top: padY, bottom: padY, left: padX, right: padX },
                        shading: spec.shade ? { type: ShadingType.CLEAR, color: 'auto', fill: 'EDEDED' } : undefined,
                        children: textParagraphs(spec.text, {
                            align: spec.align || (spec.shade ? 'center' : 'left'),
                            bold: spec.bold ?? spec.shade,
                            size: spec.size ?? fontSize,
                            font: spec.font ?? block.font ?? defaultFont,
                            line: block.lineSpacing ? Math.round(240 * block.lineSpacing) : undefined,
                        }),
                    });
                }),
            });
        }),
    });
}

export function renderDocx(model: DocModel): Document {
    const defaultFont = model.font ?? 'malgun';
    const children: Array<Paragraph | Table> = [];
    for (const block of model.blocks) {
        if (block.type === 'title') {
            children.push(...textParagraphs(block.text, {
                align: block.align ?? 'center',
                bold: block.bold ?? true,
                size: block.size ?? 16,
                font: block.font ?? defaultFont,
                runs: block.runs,
                underline: block.underline,
                spaceBefore: block.spaceBeforeMm ? mmToTwip(block.spaceBeforeMm) : undefined,
                spaceAfter: block.spaceAfterMm !== undefined ? mmToTwip(block.spaceAfterMm) : undefined,
            }));
            if (block.spaceAfterMm === undefined) children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
        } else if (block.type === 'paragraph') {
            children.push(...textParagraphs(block.text, {
                align: block.align,
                bold: block.bold,
                size: block.size ?? 10,
                spaceBefore: block.spaceBeforeMm !== undefined ? mmToTwip(block.spaceBeforeMm) : block.spaceBefore,
                spaceAfter: block.spaceAfterMm !== undefined ? mmToTwip(block.spaceAfterMm) : undefined,
                font: block.font ?? defaultFont,
                runs: block.runs,
                indent: block.indentMm ? mmToTwip(block.indentMm) : undefined,
            }));
        } else if (block.type === 'pageBreak') {
            children.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: [new PageBreak()] }));
        } else if (block.type === 'spacer') {
            children.push(new Paragraph({
                spacing: block.heightMm ? { before: 0, after: 0, line: mmToTwip(block.heightMm), lineRule: 'exact' } : { after: 160 },
                children: [],
            }));
        } else {
            children.push(renderDocxTable(block, defaultFont));
        }
    }
    const docFont = DOCX_FONTS[defaultFont];
    const font = { ascii: docFont, eastAsia: docFont, hAnsi: docFont, cs: docFont };
    const margin = model.page?.marginMm;
    return new Document({
        title: model.title,
        creator: 'JJSS',
        styles: { default: { document: { run: { font, size: 20 } } } },
        sections: [{
            properties: {
                page: {
                    size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
                    margin: margin
                        ? { top: mmToTwip(margin.top), bottom: mmToTwip(margin.bottom), left: mmToTwip(margin.left), right: mmToTwip(margin.right) }
                        : { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
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

function htmlRuns(text: string, runs: TextRunSpec[] | undefined): string {
    if (!runs?.length) return htmlText(text);
    return runs.map(run => {
        const styles = [
            run.bold ? 'font-weight:bold' : '',
            run.underline === 'double' ? 'text-decoration:underline double' : run.underline ? 'text-decoration:underline' : '',
        ].filter(Boolean).join(';');
        return styles ? `<span style="${styles}">${htmlText(run.text)}</span>` : htmlText(run.text);
    }).join('');
}

const pt = (value: number) => `${Math.round(value * 100) / 100}pt`;

function renderHtmlTable(block: Extract<DocBlock, { type: 'table' }>, defaultFont: FontKey): string {
    const exact = Boolean(block.widthsMm?.length);
    const widths = tableWidths(block);
    const total = widths.reduce((sum, w) => sum + w, 0);
    const headerRows = block.headerRows ?? 0;
    const none = block.borders === 'none';
    const outer = block.outerBorderPt ?? 0.5;
    const inner = block.innerBorderPt ?? 0.5;
    const padX = block.paddingMm?.x ?? 1.4;
    const padY = block.paddingMm?.y ?? 0.7;
    const colgroup = exact
        ? `<colgroup>${(block.widthsMm as number[]).map(w => `<col style="width:${w}mm">`).join('')}</colgroup>`
        : `<colgroup>${widths.map(w => `<col style="width:${((w / CONTENT_WIDTH) * 100).toFixed(2)}%">`).join('')}</colgroup>`;
    const laidOut = layoutRows(block.rows, widths.length);
    const rowHtml = (row: Array<{ spec: CellSpec; column: number }>, rowIndex: number) => {
        const heightMm = block.rowHeightsMm?.[rowIndex];
        const heightTwip = heightMm ? undefined : block.minRowHeight;
        const trStyle = heightMm ? ` style="height:${heightMm}mm"` : heightTwip ? ` style="height:${pt(heightTwip / 20)}"` : '';
        return `<tr${trStyle}>${row.map(({ spec, column }) => {
            const attrs = [
                spec.colSpan && spec.colSpan > 1 ? ` colspan="${spec.colSpan}"` : '',
                spec.rowSpan && spec.rowSpan > 1 ? ` rowspan="${spec.rowSpan}"` : '',
            ].join('');
            const edge = edgesOf(rowIndex, laidOut.length, column, widths.length, spec);
            const side = (isEdge: boolean) => (none ? 'none' : `${pt(isEdge ? outer : inner)} solid #000`);
            const styles = [
                `text-align:${spec.align || (spec.shade ? 'center' : 'left')}`,
                `vertical-align:${spec.vAlign === 'top' ? 'top' : spec.vAlign === 'bottom' ? 'bottom' : 'middle'}`,
                spec.bold ?? spec.shade ? 'font-weight:bold' : '',
                spec.shade ? 'background:#ededed' : '',
                spec.size ? `font-size:${spec.size}pt` : '',
                spec.font ? `font-family:${HTML_FONTS[spec.font]}` : '',
                `border-top:${side(edge.top)}`,
                `border-bottom:${side(edge.bottom)}`,
                `border-left:${side(edge.left)}`,
                `border-right:${side(edge.right)}`,
                `padding:${padY}mm ${padX}mm`,
            ].filter(Boolean).join(';');
            return `<td${attrs} style="${styles}">${htmlText(spec.text)}</td>`;
        }).join('')}</tr>`;
    };
    const head = laidOut.slice(0, headerRows).map((row, index) => rowHtml(row, index)).join('');
    const body = laidOut.slice(headerRows).map((row, index) => rowHtml(row, index + headerRows)).join('');
    const style = [
        `font-size:${block.fontSize ?? 10}pt`,
        block.lineSpacing ? `line-height:${block.lineSpacing}` : '',
        `font-family:${HTML_FONTS[block.font ?? defaultFont]}`,
        exact ? `width:${Math.round((total / 56.6929) * 10) / 10}mm;margin-left:auto;margin-right:auto` : 'width:100%',
    ].filter(Boolean).join(';');
    return `<table style="${style}">${colgroup}${head ? `<thead>${head}</thead>` : ''}<tbody>${body}</tbody></table>`;
}

/** 표만 쓰는 단순 HTML 문서(인쇄용 A4). 스크립트·외부 리소스 없음. */
export function renderHtml(model: DocModel): string {
    const defaultFont = model.font ?? 'malgun';
    const margin = model.page?.marginMm ?? { top: 20, right: 20, bottom: 20, left: 20 };
    const body = model.blocks.map(block => {
        if (block.type === 'title') {
            const styles = [
                `text-align:${block.align ?? 'center'}`,
                `font-size:${block.size ?? 16}pt`,
                block.bold === false ? 'font-weight:normal' : '',
                `font-family:${HTML_FONTS[block.font ?? defaultFont]}`,
                block.underline === 'double' ? 'text-decoration:underline double' : block.underline ? 'text-decoration:underline' : '',
                block.spaceBeforeMm ? `margin-top:${block.spaceBeforeMm}mm` : '',
                `margin-bottom:${block.spaceAfterMm ?? 3.5}mm`,
            ].filter(Boolean).join(';');
            return `<h1 style="${styles}">${htmlRuns(block.text, block.runs)}</h1>`;
        }
        if (block.type === 'paragraph') {
            const before = block.spaceBeforeMm !== undefined
                ? `${block.spaceBeforeMm}mm`
                : block.spaceBefore ? `${Math.round(block.spaceBefore / 20)}pt` : '';
            const styles = [
                `text-align:${block.align || 'left'}`,
                block.bold ? 'font-weight:bold' : '',
                block.size ? `font-size:${block.size}pt` : '',
                block.font ? `font-family:${HTML_FONTS[block.font]}` : '',
                before ? `margin-top:${before}` : '',
                block.spaceAfterMm !== undefined ? `margin-bottom:${block.spaceAfterMm}mm` : '',
                block.indentMm ? `padding-left:${block.indentMm}mm` : '',
            ].filter(Boolean).join(';');
            return `<p style="${styles}">${htmlRuns(block.text, block.runs)}</p>`;
        }
        if (block.type === 'spacer') return block.heightMm ? `<div style="height:${block.heightMm}mm"></div>` : '<div class="spacer"></div>';
        if (block.type === 'pageBreak') return '<div class="page-break"></div>';
        return renderHtmlTable(block, defaultFont);
    }).join('\n');
    const pageMargin = `${margin.top}mm ${margin.right}mm ${margin.bottom}mm ${margin.left}mm`;
    return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(model.title)}</title>
<style>
@page { size: A4; margin: ${pageMargin}; }
body { font-family: ${HTML_FONTS[defaultFont]}; font-size: 10pt; color: #000; margin: 0; }
@media screen { body { width: 210mm; box-sizing: border-box; padding: ${pageMargin}; margin: 0 auto; background: #fff; } }
h1 { font-size: 16pt; text-align: center; margin: 0 0 10pt; }
p { margin: 0; line-height: 1.5; white-space: pre-wrap; }
h1 { white-space: pre-wrap; }
.page-break { break-after: page; page-break-after: always; height: 0; }
table { border-collapse: collapse; table-layout: fixed; margin: 0; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
table { line-height: 1.35; }
td { border: 1px solid #000; padding: 2pt 4pt; vertical-align: middle; word-break: keep-all; overflow-wrap: anywhere; line-height: inherit; white-space: pre-wrap; }
.spacer { height: 8pt; }
</style></head>
<body>
${body}
</body></html>`;
}
