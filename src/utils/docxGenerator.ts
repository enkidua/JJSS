import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { saveJjssBlob } from './jjssFileService';
import { localDateCompact } from './date';

// Word XML에 넣을 수 없는 제어문자·짝 없는 서로게이트 (탭·줄바꿈은 허용)
const XML_INVALID_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function sanitizeText(value: string) {
  return value.replace(XML_INVALID_CHARS, '');
}

interface ReportSection {
  /** 번호 제목이 없는 서문(첫 번호 제목 앞 본문, 또는 제목이 전혀 없는 보고서)은 number/title이 없다. */
  number?: string;
  title?: string;
  content: string;
}

// 섹션 제목으로 보는 줄: "## 1. 제목"(# 1~3개) 또는 줄 전체가 굵은 번호 제목 "**1. 제목**"
// 본문 안의 일반 번호 목록("1. 내용")은 제목으로 보지 않는다.
const MARKDOWN_NUMBERED_HEADING = /^\s*#{1,3}\s*(?:\*\*)?\s*(\d+)\.\s*(.+?)\s*$/;
const BOLD_NUMBERED_HEADING = /^\s*\*\*\s*(\d+)\.\s*(.+?)\s*\*\*\s*:?\s*$/;

function matchSectionHeading(line: string): { number: string; title: string } | null {
  const match = line.match(MARKDOWN_NUMBERED_HEADING) || line.match(BOLD_NUMBERED_HEADING);
  if (!match) return null;
  const title = match[2].replace(/\*+/g, '').replace(/:\s*$/, '').trim();
  return title ? { number: match[1], title } : null;
}

/**
 * Markdown 텍스트를 구조화된 섹션으로 파싱합니다.
 * 첫 번호 제목 앞의 본문과, 번호 제목이 하나도 없는 보고서의 본문도 버리지 않습니다.
 */
function parseReportSections(text: string): ReportSection[] {
  const sections: ReportSection[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let current: ReportSection = { content: '' };
  let currentContent: string[] = [];

  const flush = () => {
    const content = currentContent.join('\n').trim();
    if (current.title || content) sections.push({ ...current, content });
  };

  for (const line of lines) {
    const heading = matchSectionHeading(line);
    if (heading) {
      flush();
      current = { number: heading.number, title: heading.title, content: '' };
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  flush();

  return sections;
}

/**
 * 텍스트 라인을 Word 문서의 Paragraph로 변환합니다.
 */
function contentToParagraphs(content: string) {
  const paragraphs = [];
  const lines = sanitizeText(content).split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 번호 없는 마크다운 제목(### 소제목)은 굵은 소제목으로 표시
    const markdownHeading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (markdownHeading) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 240, after: 100 },
          children: [
            new TextRun({
              text: markdownHeading[1].replace(/\*+/g, '').trim(),
              bold: true,
              size: 22,
              font: 'Malgun Gothic',
            }),
          ],
        })
      );
      continue;
    }

    // 마크다운 볼드(**text**) 제거
    const cleanText = trimmed
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^[-•]\s*/, '• ')
      .replace(/^\|.*\|$/, (match) => match.replace(/\|/g, ' | ').trim());

    // 소제목 감지 (볼드 텍스트로 시작하는 경우)
    const subheadingMatch = trimmed.match(/^\*\*(.*?)\*\*/);

    if (subheadingMatch && trimmed.startsWith('**')) {
      const restText = trimmed.replace(/^\*\*(.*?)\*\*\s*:?\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1');

      paragraphs.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: subheadingMatch[1] + (restText ? ': ' : ''),
              bold: true,
              size: 22,
              font: 'Malgun Gothic',
            }),
            ...(restText ? [new TextRun({
              text: restText,
              size: 22,
              font: 'Malgun Gothic',
            })] : []),
          ],
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 80, after: 80 },
          children: [
            new TextRun({
              text: cleanText,
              size: 22,
              font: 'Malgun Gothic',
            }),
          ],
        })
      );
    }
  }

  return paragraphs;
}

/**
 * 보고서 내용을 Word(.docx) 파일로 다운로드합니다.
 */
export async function downloadAsDocx(reportText: string) {
  const sections = parseReportSections(reportText);

  const children: any[] = [
    // 제목
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: '종합소견 및 직업재활방향',
          bold: true,
          size: 32,
          font: 'Malgun Gothic',
        }),
      ],
    }),
    // 구분선
    new Paragraph({
      border: {
        bottom: {
          color: '2563EB',
          size: 3,
          style: BorderStyle.SINGLE,
          space: 1,
        },
      },
      spacing: { after: 300 },
      children: [],
    }),
  ];

  // 각 섹션 추가 (서문 섹션은 제목 없이 본문만)
  for (const section of sections) {
    if (section.title) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
          children: [
            new TextRun({
              text: sanitizeText(`${section.number}. ${section.title}`),
              bold: true,
              size: 26,
              font: 'Malgun Gothic',
              color: '1e40af',
            }),
          ],
        })
      );
    }

    // 섹션 내용
    const contentParagraphs = contentToParagraphs(section.content);
    children.push(...contentParagraphs);
  }

  // 푸터
  children.push(
    new Paragraph({
      spacing: { before: 600 },
      border: {
        top: {
          color: 'e2e8f0',
          size: 1,
          style: BorderStyle.SINGLE,
          space: 1,
        },
      },
      children: [],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: `작성일: ${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          size: 20,
          font: 'Malgun Gothic',
          color: '64748b',
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return saveJjssBlob('vocational-evaluation', `직업평가_종합보고서_${localDateCompact()}.docx`, blob);
}
