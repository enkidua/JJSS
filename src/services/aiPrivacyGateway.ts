/**
 * 외부 AI로 나가는 모든 글·첨부파일이 거치는 개인정보 관문(Privacy Gateway).
 *
 * 1) 글: 원문 → 로컬 비식별화(anonymizeText) → 외부 전송. 이전 대화(history)도 같은 매핑으로 함께 가린다.
 *    응답의 토큰(⟦이름1⟧ 등)은 PC 안에서만 restoreAIResponse로 되돌린다. 매핑(mapping)은 외부로 보내지 않는다.
 * 2) 첨부: PDF는 먼저 PC 안에서 글자를 추출해, 충분하면 원본 대신 "비식별화한 글"만 보낸다.
 *    스캔본·이미지처럼 글자를 추출할 수 없는 원본은 자동으로 보내지 않고, 요청마다 원본 전송 확인(동의 C)을 받는다.
 * 3) 이미지 생성 프롬프트: 비식별화한 뒤 토큰 대신 "○○○" 같은 자리표시로 바꿔 보내고, 결과에 실제 이름을 되돌려 넣지 않는다.
 *
 * 제공업체(Gemini/OpenAI/Anthropic/Vision)가 바뀌어도 같은 규칙을 쓴다.
 */
import { anonymizeText, deanonymizeText } from '../utils/anonymizer';
import { collectKnownNames } from './knownNames';
import { extractPdfTextLocally, isMeaningfulPdfText } from './localPdfText';
import {
    createAttachmentConsentDeniedError,
    requestAttachmentSendConsent,
    type AttachmentUploadProvider,
} from './attachmentConsent';

export type ExtraKnownNames = Array<string | null | undefined>;

export interface PrepareOutboundTextOptions<T extends { content: string }> {
    /** 이 요청과 관련 있는 추가 이름(예: 선택한 훈련생, 직무지도원, 담당자). 앱 전체 이름을 넣지 않는다. */
    knownNames?: ExtraKnownNames;
    /** 이전 대화. 현재 입력과 같은 매핑으로 비식별화한다. */
    history?: T[];
    /** 현재 입력 뒤에 함께 보낼 추가 글(예: PC 안에서 추출한 PDF 글). 같은 매핑을 쓴다. */
    extraSegments?: string[];
}

export interface PreparedOutboundText<T extends { content: string }> {
    /** 외부로 보낼 비식별화된 현재 입력 */
    text: string;
    /** 외부로 보낼 비식별화된 이전 대화 */
    history: T[];
    /** 외부로 보낼 비식별화된 추가 글(extraSegments와 같은 순서) */
    extraSegments: string[];
    /** 토큰 → 원문. PC 안에서 응답 복원에만 쓰고 절대 외부로 보내지 않는다. */
    mapping: Record<string, string>;
}

const SEGMENT_BOUNDARY = '\n⟦JJSS-MESSAGE-BOUNDARY⟧\n';

/** 비식별화에 쓸 이름 사전: 기존 사전(이용자·사업체 담당자) + 이 요청과 관련 있는 이름. */
export function resolveOutboundKnownNames(extra: ExtraKnownNames = []): string[] {
    return collectKnownNames(extra);
}

/**
 * 여러 글을 한 번에 비식별화해 같은 사람에게 같은 토큰을 쓰게 한다.
 * 경계 표시는 토큰 모양이라 비식별화 과정에서 바뀌지 않는다.
 */
function anonymizeSegments(segments: string[], knownNames: string[]): { segments: string[]; mapping: Record<string, string> } | null {
    const { maskedText, mapping } = anonymizeText(segments.join(SEGMENT_BOUNDARY), { knownNames });
    const parts = maskedText.split(SEGMENT_BOUNDARY);
    return parts.length === segments.length ? { segments: parts, mapping } : null;
}

/** 외부 AI로 보낼 글을 준비한다(모든 텍스트 요청의 공통 입구). */
export function prepareAIOutboundText<T extends { content: string }>(
    text: string,
    options: PrepareOutboundTextOptions<T> = {},
): PreparedOutboundText<T> {
    const knownNames = resolveOutboundKnownNames(options.knownNames);
    const history = options.history || [];
    const extras = (options.extraSegments || []).map(segment => String(segment ?? ''));
    const input = String(text ?? '');
    const combined = anonymizeSegments([...extras, ...history.map(message => String(message.content ?? '')), input], knownNames);
    if (combined) {
        const maskedExtras = combined.segments.slice(0, extras.length);
        const maskedHistory = combined.segments.slice(extras.length, extras.length + history.length);
        return {
            text: combined.segments[combined.segments.length - 1],
            history: history.map((message, index) => ({ ...message, content: maskedHistory[index] })),
            extraSegments: maskedExtras,
            mapping: combined.mapping,
        };
    }
    // 입력에 경계 문자열이 들어 있는 극히 드문 경우: 이전 대화는 빼고, 추가 글과 현재 입력만 따로 가린다.
    const fallback = anonymizeSegments([...extras, input], knownNames);
    if (fallback) {
        return {
            text: fallback.segments[fallback.segments.length - 1],
            history: [],
            extraSegments: fallback.segments.slice(0, extras.length),
            mapping: fallback.mapping,
        };
    }
    const single = anonymizeText([...extras, input].join('\n\n'), { knownNames });
    return { text: single.maskedText, history: [], extraSegments: [], mapping: single.mapping };
}

/** AI 응답의 토큰만 PC 안에서 원문으로 되돌린다. 일반화한 나이·주소는 복원하지 않는다. */
export function restoreAIResponse(text: string, mapping: Record<string, string>): string {
    return deanonymizeText(text, mapping);
}

const IMAGE_PLACEHOLDERS: Record<string, string> = {
    이름: '○○○',
    전화: '(연락처)',
    이메일: '(이메일)',
    주민번호: '(비공개)',
    생년월일: '(생년월일)',
    진단일: '(날짜)',
    의료기관: '○○',
};

/**
 * 이미지 생성 프롬프트용 비식별화. 토큰 모양(⟦이름1⟧)이 그림 속 글자로 찍히지 않도록 일반 자리표시로 바꾸고,
 * 매핑은 돌려주지 않는다(결과 이미지에 실제 이름을 자동으로 넣지 않음).
 */
export function prepareImagePrompt(prompt: string, knownNames: ExtraKnownNames = []): string {
    const { maskedText } = anonymizeText(String(prompt ?? ''), { knownNames: resolveOutboundKnownNames(knownNames) });
    return maskedText.replace(/⟦([^⟦⟧\d\s]+)\d+⟧/g, (_match, category: string) => IMAGE_PLACEHOLDERS[category] || '○○');
}

// ──────────────────────────────────────────────
// 첨부파일
// ──────────────────────────────────────────────

export interface ExtractedAttachmentText {
    name: string;
    text: string;
    note?: string;
}

export interface PreparedAttachments<T> {
    /** PC 안에서 추출한 PDF 글(아직 비식별화 전 — 반드시 prepareAIOutboundText의 extraSegments로 넘긴다). */
    documentTexts: ExtractedAttachmentText[];
    /** 사용자가 원본 전송을 승인한 파일(이미지·스캔 PDF). 승인하지 않으면 이 함수가 오류를 던진다. */
    rawFiles: T[];
}

export interface AttachmentAccessor<T> {
    name: (file: T, index: number) => string;
    mimeType: (file: T) => string;
    readBytes: (file: T) => Promise<Uint8Array | null>;
}

// 원본 전송 확인(동의 C)을 거친 첨부만 외부 요청에 넣을 수 있게 한다(우회 경로 차단).
const approvedAttachments = new WeakSet<object>();

/** 동의 C를 받은(또는 받은 파일에서 만든) 첨부 객체를 표시한다. */
export function markAttachmentApproved<T>(file: T): T {
    if (file && typeof file === 'object') approvedAttachments.add(file as unknown as object);
    return file;
}

/** 외부로 원본을 보내기 직전에 호출한다. 확인을 거치지 않은 첨부면 요청을 멈춘다. */
export function assertAttachmentApproved(file: unknown): void {
    if (!file || typeof file !== 'object' || !approvedAttachments.has(file)) {
        throw Object.assign(new Error('원본 파일 전송 확인을 거치지 않은 첨부는 보낼 수 없습니다. 다시 시도해 주세요.'), {
            code: 'AI_ATTACHMENT_NOT_APPROVED',
        });
    }
}

export function isPdfAttachment(mimeType: string, name = ''): boolean {
    return mimeType === 'application/pdf' || /\.pdf$/i.test(name);
}

/** 한 파일이 텍스트 PDF면 PC 안에서 추출한 글을 돌려준다. 스캔본·이미지·실패는 null. */
export async function extractLocalDocumentText<T>(file: T, index: number, accessor: AttachmentAccessor<T>): Promise<ExtractedAttachmentText | null> {
    const name = accessor.name(file, index) || `첨부${index + 1}`;
    if (!isPdfAttachment(accessor.mimeType(file), name)) return null;
    let bytes: Uint8Array | null = null;
    try {
        bytes = await accessor.readBytes(file);
    } catch {
        return null;
    }
    if (!bytes) return null;
    const result = await extractPdfTextLocally(bytes);
    if (!isMeaningfulPdfText(result)) return null;
    const skipped = result.checkedPageCount - result.textPageCount;
    const notes = [
        skipped > 0 ? `${result.checkedPageCount}쪽 중 ${skipped}쪽은 글자를 추출하지 못해 빠졌습니다.` : '',
        result.truncated ? '분량이 많아 앞부분만 사용했습니다.' : '',
    ].filter(Boolean);
    return { name, text: result.text, note: notes.join(' ') || undefined };
}

/**
 * 첨부파일을 외부 AI로 보낼 형태로 나눈다.
 * - 텍스트 PDF → documentTexts(원본은 보내지 않음)
 * - 이미지·스캔 PDF → 원본 전송 확인(동의 C). 승인하면 rawFiles, 취소하면 오류(요청 전체 중단).
 * 확인창은 네트워크 요청·작업 시간 제한이 시작되기 전에 띄운다.
 */
export async function prepareAttachmentsForAI<T>(
    files: T[],
    provider: AttachmentUploadProvider,
    accessor: AttachmentAccessor<T>,
): Promise<PreparedAttachments<T>> {
    const documentTexts: ExtractedAttachmentText[] = [];
    const rawFiles: T[] = [];
    const rawNames: string[] = [];
    for (const [index, file] of files.entries()) {
        const extracted = await extractLocalDocumentText(file, index, accessor);
        if (extracted) {
            documentTexts.push(extracted);
        } else {
            rawFiles.push(file);
            rawNames.push(accessor.name(file, index) || `첨부${index + 1}`);
        }
    }
    if (rawFiles.length) {
        const approved = await requestAttachmentSendConsent({ provider, fileNames: rawNames });
        if (!approved) throw createAttachmentConsentDeniedError();
        rawFiles.forEach(markAttachmentApproved);
    }
    return { documentTexts, rawFiles };
}

/**
 * 추출한 문서 글을 외부 전송용 한 덩어리로 만든다.
 * **실제 파일 이름은 넣지 않는다** — 파일명에 이용자 이름·기관명이 들어가는 일이 잦다.
 * 화면에서는 원래 이름을 그대로 보여 주고, 밖으로는 "첨부문서 n"만 나간다.
 */
export function formatDocumentSegment(document: ExtractedAttachmentText, index = 0): string {
    return [`(첨부문서 ${index + 1})`, document.note ? `(참고: ${document.note})` : '', document.text]
        .filter(Boolean)
        .join('\n');
}

export function base64ToBytes(base64: string): Uint8Array | null {
    try {
        const binary = atob(String(base64 || ''));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    } catch {
        return null;
    }
}

export const BASE64_ATTACHMENT_ACCESSOR: AttachmentAccessor<{ mimeType: string; data: string; name?: string }> = {
    name: (file, index) => file.name || `첨부${index + 1}`,
    mimeType: file => file.mimeType,
    readBytes: async file => base64ToBytes(file.data),
};

export const FILE_ATTACHMENT_ACCESSOR: AttachmentAccessor<File> = {
    name: (file, index) => file.name || `첨부${index + 1}`,
    mimeType: file => file.type,
    readBytes: async file => new Uint8Array(await file.arrayBuffer()),
};
