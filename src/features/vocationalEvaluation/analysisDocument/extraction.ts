/**
 * 분석지 읽기. KEAD 결과지 읽기(sourceDocument/extraction.ts)와 같은 개인정보 처리 경로를 쓴다.
 *  - 글자가 들어 있는 PDF는 PC 안에서 글만 뽑아 비식별화한 뒤 보낸다. 원본은 보내지 않는다.
 *  - 스캔본·이미지는 기존 첨부 확인(동의 C) 절차를 그대로 따른다.
 *  - 이름·연락처·기관명은 옮기지 않도록 지시하고, 응답에 남아 있어도 guard가 자동 포함을 막는다.
 */
import { generateText, type AIFileData } from '../../../services/gemini';
import { fileToBase64 } from '../../../utils/file';
import { extractPdfTextLocally, isLocalPdfTextAvailable, isMeaningfulPdfText } from '../../../services/localPdfText';
import { ANALYSIS_AREA_LABELS, normalizeAnalysisExtraction, parseAnalysisJson, type AnalysisFinding } from './model';

export const ANALYSIS_PROMPT = `당신은 직업평가 검사 분석지(결과지)를 직업평가 보고서 초안 재료로 정리하는 도구입니다.

규칙
1. 문서에 **실제로 적힌 내용만** 옮깁니다. 새 해석·진단·판단을 만들지 마세요. 수치·등급·백분위·규준 표기는 인쇄된 그대로 씁니다.
2. 이름·생년월일·연락처·주소·기관명·평가자명은 옮기지 마세요.
3. 취업 가능/불가능, 직무 적합/부적합 같은 단정은 문서에 있어도 옮기지 마세요. 평가사가 직접 판단합니다.
4. 문장은 보고서에 그대로 넣을 수 있는 완성된 한국어 문장으로 정리합니다(개조식 원문은 문장으로 다듬되 내용은 더하지 않기).
5. 각 문장의 area는 다음 중 하나입니다:
${Object.entries(ANALYSIS_AREA_LABELS)
    .map(([key, label]) => `   - ${key}: ${label}`)
    .join('\n')}
6. 설명 없이 JSON 하나만 출력하세요:
{ "documentType": "ANALYSIS", "detectedTitle": "문서에 적힌 검사 이름", "findings": [{ "area": "psychological", "text": "..." }], "warnings": [] }`;

export interface AnalysisExtractionOutcome {
    detectedTitle: string;
    findings: AnalysisFinding[];
    warnings: string[];
    model: string;
    failureReason?: string;
    localTextAvailable: boolean;
    pageCount: number | null;
}

export async function readAnalysisDocument({ file, signal }: { file: File; signal?: AbortSignal }): Promise<AnalysisExtractionOutcome> {
    let pageCount: number | null = null;
    let localText: string | null = null;
    if (isLocalPdfTextAvailable() && file.type === 'application/pdf') {
        try {
            const local = await extractPdfTextLocally(new Uint8Array(await file.arrayBuffer()));
            pageCount = local?.pageCount ?? null;
            if (isMeaningfulPdfText(local)) localText = local.text;
        } catch {
            // 읽지 못하면 첨부 확인 경로로 넘어간다.
        }
    }
    // 글자가 있는 PDF는 원본 첨부를 만들지 않는다(글만 전송, 관문에서 비식별화).
    const attachment: AIFileData | undefined = localText
        ? undefined
        : { mimeType: file.type || 'application/pdf', data: await fileToBase64(file), name: file.name };
    const prompt = localText ? `${ANALYSIS_PROMPT}\n\n[분석지 글]\n${localText}` : ANALYSIS_PROMPT;
    const base = { model: 'gemini', localTextAvailable: localText !== null, pageCount };
    try {
        const response = await generateText('utilities', prompt, attachment, {
            signal,
            featureKey: 'vocational-evaluation-analysis',
            documentType: 've_analysis_document',
            requestLabel: '직업평가 분석지 읽기',
            disableCrossProviderFailover: true,
        });
        const normalized = normalizeAnalysisExtraction(parseAnalysisJson(response));
        if (!normalized) {
            return { ...base, detectedTitle: '', findings: [], warnings: [], failureReason: 'AI 응답에서 분석 내용을 읽지 못했습니다. 직접 입력으로 추가해 주세요.' };
        }
        return { ...base, ...normalized };
    } catch (error) {
        return {
            ...base,
            detectedTitle: '',
            findings: [],
            warnings: [],
            failureReason: error instanceof Error ? error.message : '분석지를 읽지 못했습니다.',
        };
    }
}
