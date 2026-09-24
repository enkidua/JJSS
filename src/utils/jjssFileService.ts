import type {
    JjssFileCategory,
    JjssFolderKey,
    JjssPaths,
    JjssSaveResult,
    LegacyImportPreview,
    LegacyImportResult,
} from '../types/jjssFiles';

export const JJSS_FILE_SAVED_EVENT = 'jjss-file-saved';

function browserDownload(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    try {
        anchor.click();
    } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_500);
    }
}

function announceSaved(result: JjssSaveResult, category: JjssFileCategory, fileName: string) {
    if (result.canceled || result.error) return;
    window.dispatchEvent(new CustomEvent(JJSS_FILE_SAVED_EVENT, {
        detail: { category, fileName, filePath: result.filePath, openToken: result.openToken, browserFallback: result.browserFallback },
    }));
}

const IPC_ERROR_PREFIX = /^Error invoking remote method '[^']*':\s*(?:\w*Error:\s*)?/;

/** Electron IPC 오류의 "Error invoking remote method '…': Error:" 접두어를 떼어 사용자에게 보여 줄 문장만 남긴다. */
export function cleanIpcErrorMessage(message: string): string {
    return message.replace(IPC_ERROR_PREFIX, '').trim();
}

/** 파일 서비스(IPC) 호출을 감싸 오류 메시지를 정리한다. */
async function callFileService<T>(invoke: () => Promise<T>, fallbackMessage: string): Promise<T> {
    try {
        return await invoke();
    } catch (error) {
        const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
        const cleaned = cleanIpcErrorMessage(raw);
        // 한국어 안내가 아닌 내부 오류 문구(영문 시스템 메시지 등)는 그대로 보여 주지 않는다.
        throw new Error(/[가-힣]/.test(cleaned) ? cleaned : fallbackMessage);
    }
}

function throwSaveError(error?: string): never {
    if (error === 'invalid-extension') throw new Error('선택한 파일 확장자가 올바르지 않습니다.');
    throw new Error('파일을 저장하지 못했습니다.');
}

export async function saveJjssBlob(category: JjssFileCategory, fileName: string, blob: Blob): Promise<JjssSaveResult> {
    if (!blob.size) throw new Error('저장할 파일이 비어 있습니다.');
    let result: JjssSaveResult;
    if (window.jjssFiles) {
        const api = window.jjssFiles;
        const data = new Uint8Array(await blob.arrayBuffer());
        result = await callFileService(() => api.saveFile({ category, fileName, data }), '파일을 저장하지 못했습니다.');
        if (result.error) throwSaveError(result.error);
    } else {
        browserDownload(blob, fileName);
        result = { canceled: false, browserFallback: true, category };
    }
    announceSaved(result, category, fileName);
    return result;
}

export function saveJjssText(category: JjssFileCategory, fileName: string, value: string, mimeType = 'text/plain;charset=utf-8') {
    return saveJjssBlob(category, fileName, new Blob([value], { type: mimeType }));
}

export async function saveJjssDataUrl(category: 'image', fileName: string, dataUrl: string) {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error('이미지 데이터를 읽지 못했습니다.');
    return saveJjssBlob(category, fileName, await response.blob());
}

export async function saveJjssPdf(category: JjssFileCategory, fileName: string, html: string): Promise<JjssSaveResult | null> {
    const api = window.jjssFiles;
    if (!api) return null;
    const result = await callFileService(() => api.savePdf({ category, fileName, html }), 'PDF 파일을 저장하지 못했습니다.');
    if (result.error) throwSaveError(result.error);
    announceSaved(result, category, fileName);
    return result;
}

export async function getJjssPaths(): Promise<JjssPaths | null> {
    const api = window.jjssFiles;
    if (!api) return null;
    return callFileService(() => api.getPaths(), 'JJSS 문서 폴더를 준비하지 못했습니다.');
}

export async function openJjssFolder(folderKey: JjssFolderKey) {
    const api = window.jjssFiles;
    if (!api) throw new Error('폴더 열기는 Windows 설치형 JJSS에서 사용할 수 있습니다.');
    return callFileService(() => api.openFolder(folderKey), '폴더를 열지 못했습니다.');
}

export async function openSavedDirectory(openToken: string) {
    const api = window.jjssFiles;
    if (!api) throw new Error('저장 폴더 열기는 Windows 설치형 JJSS에서 사용할 수 있습니다.');
    return callFileService(() => api.openSavedDirectory(openToken), '저장 폴더를 열지 못했습니다.');
}

export async function chooseLegacyImportFolder(includeSubfolders = true): Promise<LegacyImportPreview> {
    const api = window.jjssFiles;
    if (!api) throw new Error('기존 문서 가져오기는 Windows 설치형 JJSS에서 사용할 수 있습니다.');
    return callFileService(() => api.chooseImportFolder({ includeSubfolders }), '기존 JJSS 문서 폴더를 확인하지 못했습니다.');
}

export async function importLegacyDocuments(token: string, mode: 'copy' | 'move'): Promise<LegacyImportResult> {
    const api = window.jjssFiles;
    if (!api) throw new Error('기존 문서 가져오기는 Windows 설치형 JJSS에서 사용할 수 있습니다.');
    return callFileService(() => api.importLegacyDocuments({ token, mode }), '기존 JJSS 문서를 가져오지 못했습니다. 원본 파일은 유지됩니다.');
}

export function savedLocationMessage(result: JjssSaveResult, browserMessage = '브라우저 다운로드를 시작했습니다.') {
    if (result.canceled) return '저장이 취소되었습니다.';
    return result.filePath ? `저장 완료\n${result.filePath}` : browserMessage;
}
