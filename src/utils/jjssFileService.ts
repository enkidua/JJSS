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

function throwSaveError(error?: string): never {
    if (error === 'invalid-extension') throw new Error('선택한 파일 확장자가 올바르지 않습니다.');
    throw new Error('파일을 저장하지 못했습니다.');
}

export async function saveJjssBlob(category: JjssFileCategory, fileName: string, blob: Blob): Promise<JjssSaveResult> {
    if (!blob.size) throw new Error('저장할 파일이 비어 있습니다.');
    let result: JjssSaveResult;
    if (window.jjssFiles) {
        result = await window.jjssFiles.saveFile({ category, fileName, data: new Uint8Array(await blob.arrayBuffer()) });
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
    if (!window.jjssFiles) return null;
    const result = await window.jjssFiles.savePdf({ category, fileName, html });
    if (result.error) throwSaveError(result.error);
    announceSaved(result, category, fileName);
    return result;
}

export function getJjssPaths(): Promise<JjssPaths | null> {
    return window.jjssFiles ? window.jjssFiles.getPaths() : Promise.resolve(null);
}

export function openJjssFolder(folderKey: JjssFolderKey) {
    if (!window.jjssFiles) throw new Error('폴더 열기는 Windows 설치형 JJSS에서 사용할 수 있습니다.');
    return window.jjssFiles.openFolder(folderKey);
}

export function openSavedDirectory(openToken: string) {
    if (!window.jjssFiles) throw new Error('저장 폴더 열기는 Windows 설치형 JJSS에서 사용할 수 있습니다.');
    return window.jjssFiles.openSavedDirectory(openToken);
}

export function chooseLegacyImportFolder(includeSubfolders = true): Promise<LegacyImportPreview> {
    if (!window.jjssFiles) throw new Error('기존 문서 가져오기는 Windows 설치형 JJSS에서 사용할 수 있습니다.');
    return window.jjssFiles.chooseImportFolder({ includeSubfolders });
}

export function importLegacyDocuments(token: string, mode: 'copy' | 'move'): Promise<LegacyImportResult> {
    if (!window.jjssFiles) throw new Error('기존 문서 가져오기는 Windows 설치형 JJSS에서 사용할 수 있습니다.');
    return window.jjssFiles.importLegacyDocuments({ token, mode });
}

export function savedLocationMessage(result: JjssSaveResult, browserMessage = '브라우저 다운로드를 시작했습니다.') {
    if (result.canceled) return '저장이 취소되었습니다.';
    return result.filePath ? `저장 완료\n${result.filePath}` : browserMessage;
}
