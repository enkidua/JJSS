/**
 * 공단 공식 결과지 읽기.
 *
 * 개인정보 처리
 *  - 글자가 들어 있는 PDF는 `generateText`가 PC 안에서 글만 뽑아 비식별화한 뒤 보낸다. 원본은 보내지 않는다.
 *  - 스캔본·이미지는 기존 첨부 확인(동의 C) 절차를 그대로 따른다. 확인 없이는 보내지 않는다.
 *  - 이름은 읽지 않는다. 프롬프트에서 이름 칸을 비우라고 지시하고, 스키마에도 이름 필드가 없다.
 *  - 재시도·제공업체 전환 규칙은 기존 안전장치를 그대로 쓴다(추가 재시도 없음).
 */
import { generateText, type AIFileData } from '../../../services/gemini';
import { fileToBase64 } from '../../../utils/file';
import { extractPdfTextLocally, isLocalPdfTextAvailable, isMeaningfulPdfText } from '../../../services/localPdfText';
import { SOURCE_DOCUMENT_PROMPT } from './prompt';
import { parseExtractionJson, VE_EXTRACTION_SCHEMA_VERSION, VE_EXTRACTOR_VERSION } from './schema';
import type { ExtractionResult } from './types';

export interface ExtractionRequest {
    file: File;
    signal?: AbortSignal;
}

export interface ExtractionOutcome {
    result: ExtractionResult | null;
    model: string;
    /** 읽지 못했을 때 화면에 보여 줄 사유 */
    failureReason?: string;
    /** PC 안에서 글자를 읽어 낼 수 있었는지. false면 원본 전송 확인이 필요한 문서다 */
    localTextAvailable: boolean;
    /** PC 안에서만 찾은 생년월일(본인 확인용). 외부로 보내지 않는다 */
    localBirthDate?: string | null;
    pageCount: number | null;
}

/**
 * 결과지 글에서 생년월일을 **PC 안에서만** 찾는다.
 * 본인 확인(다른 사람의 결과지인지)에 쓰고, 이 값은 외부로 보내지 않는다.
 */
function findBirthDateLocally(text: string): string | null {
    const match =
        /(19|20)\d{2}\s*[-./년]\s*\d{1,2}\s*[-./월]\s*\d{1,2}/.exec(text) ?? /\d{6}\s*[-–]\s*\d/.exec(text);
    return match ? match[0].trim() : null;
}

export async function readSourceDocument({ file, signal }: ExtractionRequest): Promise<ExtractionOutcome> {
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
    const localTextAvailable = localText !== null;
    const localBirthDate = localText ? findBirthDateLocally(localText) : null;

    /**
     * 글자가 들어 있는 PDF는 **원본 첨부를 아예 만들지 않는다.**
     * 뽑아낸 글만 요청 본문에 넣어 보내고(본문은 관문에서 비식별화된다), 원본 바이트는 이 함수를 떠나지 않는다.
     * 스캔본처럼 글을 뽑지 못한 경우에만 원본을 첨부하고, 그때는 기존 확인 절차(동의 C)가 뜬다.
     */
    const attachment: AIFileData | undefined = localText
        ? undefined
        : { mimeType: file.type || 'application/pdf', data: await fileToBase64(file), name: file.name };
    const prompt = localText ? `${SOURCE_DOCUMENT_PROMPT}

[결과지 글]
${localText}` : SOURCE_DOCUMENT_PROMPT;

    try {
        const response = await generateText('utilities', prompt, attachment, {
            signal,
            featureKey: 'vocational-evaluation',
            documentType: 've_source_document',
            requestLabel: '직업평가 결과지 읽기',
            disableCrossProviderFailover: true,
        });
        const result = parseExtractionJson(response, 'gemini');
        return {
            result,
            model: result?.extractionMetadata.model ?? 'gemini',
            failureReason: result ? undefined : 'AI 응답에서 결과지 내용을 읽지 못했습니다. 값을 직접 입력해 주세요.',
            localTextAvailable,
            localBirthDate,
            pageCount,
        };
    } catch (error) {
        return {
            result: null,
            model: 'gemini',
            failureReason: error instanceof Error ? error.message : '결과지를 읽지 못했습니다.',
            localTextAvailable,
            localBirthDate,
            pageCount,
        };
    }
}

/** 파일 지문. 같은 결과지를 두 번 넣었는지 확인하는 데 쓴다. */
export async function sha256Hex(file: File): Promise<string> {
    if (!globalThis.crypto?.subtle) return '';
    const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export const EXTRACTOR_INFO = {
    extractorVersion: VE_EXTRACTOR_VERSION,
    schemaVersion: VE_EXTRACTION_SCHEMA_VERSION,
};
