/**
 * 직업평가보고서 출력(DOCX·HTML). 지원고용 서류와 같은 블록 렌더러를 함께 쓴다.
 * 파일 이름에는 이용자 이름을 넣지 않는다.
 */
import { renderDocx, renderHtml, type Cell, type DocBlock, type DocModel } from '../../docx/blocks';
import { EPISODE_NEED_KEYS, EPISODE_NEED_LABELS } from '../model/episode';
import { EVALUATION_VENUE_LABELS } from '../model/types';
import type { EvaluationReport, ReportResultTable, ReportSection } from './model';

const NOT_ENTERED = '';

function sectionText(section: ReportSection): string[] {
    const lines = section.paragraphs.filter(item => item.included && item.text.trim()).map(item => item.text.trim());
    const evaluator = section.evaluatorText.trim();
    if (evaluator) lines.push(evaluator);
    return lines;
}

/**
 * 결과표에 실제 측정값이 하나라도 있는지. 머리 행을 뺀 나머지가 전부 "미실시"·"—"·빈칸·0 분모뿐이면
 * 내용이 없는 표이므로 출력하지 않는다(빈 표가 여러 장 나오는 것을 막는다).
 */
function hasMeasuredValue(table: ReportResultTable): boolean {
    return table.rows.slice(1).some(row =>
        row.slice(1).some(cell => {
            const value = String(cell ?? '').trim();
            return value !== '' && value !== '—' && value !== '미실시';
        }),
    );
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

    // 번호는 실제로 출력하는 항목에만 붙인다(빈 항목을 건너뛰어도 번호가 이어지게).
    let sectionNumber = 0;
    const heading = (title: string) => {
        sectionNumber += 1;
        blocks.push({ type: 'spacer' });
        blocks.push({ type: 'paragraph', text: `${sectionNumber}. ${title}`, bold: true });
    };

    // 평가목적이 비어 있으면 "—" 한 줄짜리 항목을 만들지 않는다(공식 문서 품질).
    if (report.purpose.trim()) {
        heading('평가목적');
        blocks.push({ type: 'paragraph', text: report.purpose.trim() });
    }

    // 실제로 사용한 평가도구만 출력한다. 미실시 영역의 빈 행은 넣지 않는다.
    const usedTools = report.tools.filter(row => row.tool.trim());
    if (usedTools.length) {
        heading('평가 도구(방법)');
        blocks.push({
            type: 'table',
            widths: [40, 60],
            headerRows: 1,
            rows: [
                [
                    { text: '평가영역', shade: true, bold: true, align: 'center' },
                    { text: '평가도구', shade: true, bold: true, align: 'center' },
                ],
                ...usedTools.map(row => [row.area, row.tool] as Cell[]),
            ],
        });
    }

    // 종합소견은 표(칸)로 나누지 않고 소제목 + 문단으로 흘려 쓴다 — 긴 소견문이 상자에 갇혀
    // 읽기 어렵다는 현장 의견을 반영했다. 내용이 없는 항목은 건너뛴다.
    heading('종합소견 및 직업재활방향');
    const goalLines = [
        report.summary.goalSelf.trim() ? `- 당사자: ${report.summary.goalSelf.trim()}` : '',
        report.summary.goalGuardian.trim() ? `- 보호자/지원자: ${report.summary.goalGuardian.trim()}` : '',
    ]
        .filter(Boolean)
        .join('\n');
    const opinionParts: Array<[string, string]> = [
        ['직업수준', report.summary.vocationalLevel.trim()],
        ['직업목표(당사자 및 보호자/지원자)', goalLines],
        ['직업적 강점', report.summary.strengths.trim()],
        ['직업적 제한점(고려사항)', report.summary.limitations.trim()],
        ['지원이 필요한 사항', report.summary.supportNeeds.trim()],
        ['적합(추천) 직무 및 권고 프로그램', report.summary.recommendation.trim()],
        ['추천직무 세부정보', report.summary.recommendedPrograms.trim()],
        ['종합소견', report.summary.overallOpinion.trim()],
    ];
    const filledParts = opinionParts.filter(([, value]) => value);
    if (filledParts.length) {
        for (const [label, value] of filledParts) {
            blocks.push({ type: 'paragraph', text: `[${label}]`, bold: true, spaceBefore: 160 });
            blocks.push({ type: 'paragraph', text: value });
        }
    } else {
        blocks.push({ type: 'paragraph', text: '—' });
    }

    const detailed = report.sections.filter(section => sectionText(section).length);
    if (detailed.length) {
        heading('평가 상세');
        for (const section of detailed) {
            blocks.push({ type: 'paragraph', text: section.title, bold: true, spaceBefore: 120 });
            for (const line of sectionText(section)) blocks.push({ type: 'paragraph', text: line });
        }
    }

    // 내용이 하나도 없는(전부 "미실시"·"—") 결과표는 출력하지 않는다.
    const resultTables = report.resultTables.filter(hasMeasuredValue);
    if (resultTables.length) {
        heading('검사 결과');
        for (const table of resultTables) {
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
