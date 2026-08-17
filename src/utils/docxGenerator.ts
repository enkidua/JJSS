import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from 'docx';
import { saveJjssBlob } from './jjssFileService';

/**
 * Markdown 텍스트를 구조화된 섹션으로 파싱합니다.
 */
function parseReportSections(text: string) {
  const sections = [];
  const lines = text.split('\n');
  let currentSection: any = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    // 번호 + 제목 패턴 매칭 (## 1. 직업적 강점, 1. 직업적 강점 등)
    const sectionMatch = line.match(/^(?:#{1,3}\s*)?(\d+)\.\s*(.+)/);
    
    if (sectionMatch) {
      if (currentSection) {
        sections.push({
          number: currentSection.number,
          title: currentSection.title,
          content: currentContent.join('\n').trim(),
        });
      }
      currentSection = {
        number: sectionMatch[1],
        title: sectionMatch[2].replace(/\*+/g, '').trim(),
      };
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentSection) {
    sections.push({
      number: currentSection.number,
      title: currentSection.title,
      content: currentContent.join('\n').trim(),
    });
  }

  return sections;
}

/**
 * 텍스트 라인을 Word 문서의 Paragraph로 변환합니다.
 */
function contentToParagraphs(content: string) {
  const paragraphs = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 마크다운 볼드(**text**) 제거
    const cleanText = trimmed
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^[-•]\s*/, '• ')
      .replace(/^\|.*\|$/, (match) => match.replace(/\|/g, ' | ').trim());

    // 소제목 감지 (볼드 텍스트로 시작하는 경우)
    const subheadingMatch = trimmed.match(/^\*\*(.*?)\*\*/);
    
    if (subheadingMatch && trimmed.startsWith('**')) {
      const restText = trimmed.replace(/^\*\*(.*?)\*\*\s*:?\s*/, '');
      
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

  // 각 섹션 추가
  for (const section of sections) {
    // 섹션 제목
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
        children: [
          new TextRun({
            text: `${section.number}. ${section.title}`,
            bold: true,
            size: 26,
            font: 'Malgun Gothic',
            color: '1e40af',
          }),
        ],
      })
    );

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
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return saveJjssBlob('vocational-evaluation', `직업평가_종합보고서_${dateStr}.docx`, blob);
}
