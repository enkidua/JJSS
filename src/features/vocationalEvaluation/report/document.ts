/**
 * 직업평가보고서 출력(DOCX·HTML). 지원고용 서류와 같은 블록 렌더러를 함께 쓴다.
 * 파일 이름에는 이용자 이름을 넣지 않는다.
 */
import { renderDocx, renderHtml, type Cell, type DocBlock, type DocModel } from '../../docx/blocks';
import { EPISODE_NEED_KEYS, EPISODE_NEED_LABELS } from '../model/episode';
import { EVALUATION_VENUE_LABELS } from '../model/types';
import type { EvaluationReport, ReportSection } from './model';

const NOT_ENTERED = '';

function sectionText(section: ReportSection): string[] {
    const lines = section.paragraphs.filter(item => item.included && item.text.trim()).map(item => item.text.trim());
    const evaluator = section.evaluatorText.trim();
    if (evaluator) lines.push(evaluator);
    return lines;
}

function needsLine(report: EvaluationReport): string {
    const checked = EPISODE_NEED_KEYS.filter(key => report.header.needs[key]).map(key => EPISODE_NEED_LABELS[key]);
    return checked.length ? checked.join(' · ') : '해당 없음';
}

export function buildReportDocModel(report: EvaluationReport): DocModel {
    const blocks: DocBlock[] = [];
    blocks.push({ type: 'title', text: '직업평가보고서' });

    blocks.push({
        type: 'table',
        widths: [18, 32, 18, 32],
        rows: [
            [
                { text: '평가실시기관', shade: true, bold: true },
                report.header.evaluationOrganization || NOT_ENTERED,
                { text: '의뢰요청기관', shade: true, bold: true },
                report.header.referralOrganization || NOT_ENTERED,
            ],
            [
                { text: '평가일', shade: true, bold: true },
                report.header.evaluationDate || NOT_ENTERED,
                { text: '평가유형', shade: true, bold: true },
                EVALUATION_VENUE_LABELS[report.header.venue],
            ],
            [
                { text: '성명', shade: true, bold: true },
                report.header.seekerName || NOT_ENTERED,
                { text: '생년월일', shade: true, bold: true },
                report.header.birthDate || NOT_ENTERED,
            ],
            [
                { text: '연락처', shade: true, bold: true },
                report.header.contact || NOT_ENTERED,
                { text: '거주지', shade: true, bold: true },
                report.header.address || NOT_ENTERED,
            ],
            [
                { text: '장애유형/정도', shade: true, bold: true },
                report.header.disability || NOT_ENTERED,
                { text: '성별', shade: true, bold: true },
                report.header.sex || NOT_ENTERED,
            ],
            [{ text: '욕구', shade: true, bold: true }, { text: needsLine(report), colSpan: 3 }],
        ],
    });

    blocks.push({ type: 'spacer' });
    blocks.push({ type: 'paragraph', text: '1. 평가목적', bold: true });
    blocks.push({ type: 'paragraph', text: report.purpose || '—' });

    blocks.push({ type: 'spacer' });
    blocks.push({ type: 'paragraph', text: '2. 평가 도구(방법)', bold: true });
    blocks.push({
        type: 'table',
        widths: [40, 60],
        headerRows: 1,
        rows: [
            [
                { text: '평가영역', shade: true, bold: true, align: 'center' },
                { text: '평가도구', shade: true, bold: true, align: 'center' },
            ],
            ...report.tools.map(row => [row.area, row.tool || '—'] as Cell[]),
        ],
    });

    blocks.push({ type: 'spacer' });
    blocks.push({ type: 'paragraph', text: '3. 종합소견 및 직업재활방향', bold: true });
    blocks.push({
        type: 'table',
        widths: [20, 80],
        rows: [
            [{ text: '직업수준', shade: true, bold: true }, report.summary.vocationalLevel || '—'],
            [{ text: '직업목표(당사자)', shade: true, bold: true }, report.summary.goalSelf || '—'],
            [{ text: '직업목표(보호자·지원자)', shade: true, bold: true }, report.summary.goalGuardian || '—'],
            [{ text: '직업적 강점', shade: true, bold: true }, report.summary.strengths || '—'],
            [{ text: '제한점·고려사항', shade: true, bold: true }, report.summary.limitations || '—'],
            [{ text: '추천', shade: true, bold: true }, report.summary.recommendation || '—'],
            [{ text: '추천직무·프로그램', shade: true, bold: true }, report.summary.recommendedPrograms || '—'],
        ],
    });

    const detailed = report.sections.filter(section => sectionText(section).length);
    if (detailed.length) {
        blocks.push({ type: 'spacer' });
        blocks.push({ type: 'paragraph', text: '4. 평가 상세', bold: true });
        for (const section of detailed) {
            blocks.push({ type: 'paragraph', text: section.title, bold: true, spaceBefore: 120 });
            for (const line of sectionText(section)) blocks.push({ type: 'paragraph', text: line });
        }
    }

    if (report.resultTables.length) {
        blocks.push({ type: 'spacer' });
        blocks.push({ type: 'paragraph', text: '5. 검사 결과', bold: true });
        for (const table of report.resultTables) {
            blocks.push({ type: 'paragraph', text: table.title, bold: true, spaceBefore: 120 });
            const columns = Math.max(...table.rows.map(row => row.length), 1);
            blocks.push({
                type: 'table',
                widths: Array.from({ length: columns }, (_, index) => (index === 0 ? 30 : 70 / Math.max(1, columns - 1))),
                headerRows: 1,
                rows: table.rows.map((row, rowIndex) =>
                    row.map(cell =>
                        rowIndex === 0
                            ? ({ text: cell, shade: true, bold: true, align: 'center' } as Cell)
                            : ({ text: cell, align: rowIndex === 0 ? 'center' : 'left' } as Cell),
                    ),
                ),
            });
            if (table.note) blocks.push({ type: 'paragraph', text: table.note, size: 9 });
        }
    }

    blocks.push({ type: 'spacer' });
    blocks.push({ type: 'paragraph', text: `작성일: ${report.writtenOn || '—'}`, align: 'right' });
    blocks.push({ type: 'paragraph', text: `직업평가사: ${report.evaluator || ''} (서명)`, align: 'right' });

    return { title: '직업평가보고서', blocks };
}

export function buildReportDocx(report: EvaluationReport) {
    return renderDocx(buildReportDocModel(report));
}

export function buildReportHtml(report: EvaluationReport): string {
    return renderHtml(buildReportDocModel(report));
}

/** 파일 이름에 이용자 이름을 넣지 않는다. */
export function reportFileName(report: EvaluationReport, extension: 'docx' | 'pdf'): string {
    const date = (report.header.evaluationDate || report.writtenOn || '').replace(/-/g, '');
    return `직업평가보고서_${date || '날짜미정'}_v${report.reportVersion}.${extension}`;
}
