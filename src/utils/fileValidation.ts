const MIB = 1024 * 1024;

export const MAX_AI_DOCUMENT_BYTES = 20 * MIB;
export const MAX_STORED_IMAGE_BYTES = 5 * MIB;
export const MAX_TEXT_FILE_BYTES = 10 * MIB;

const IMAGE_EXTENSION = /\.(avif|bmp|gif|heic|heif|jpe?g|png|tiff?|webp)$/i;
const PDF_EXTENSION = /\.pdf$/i;
const TEXT_EXTENSION = /\.(csv|html?|json|md|txt|xml)$/i;

function validateBasicFile(file: File, maxBytes: number): string | null {
    if (file.size <= 0) return '내용이 없는 파일은 업로드할 수 없습니다.';
    if (file.size > maxBytes) return `파일 크기는 ${Math.floor(maxBytes / MIB)}MB 이하여야 합니다.`;
    return null;
}

export function getAiDocumentValidationError(file: File): string | null {
    const basicError = validateBasicFile(file, MAX_AI_DOCUMENT_BYTES);
    if (basicError) return basicError;

    const isImage = file.type.startsWith('image/') || (!file.type && IMAGE_EXTENSION.test(file.name));
    const isPdf = file.type === 'application/pdf' || (!file.type && PDF_EXTENSION.test(file.name));
    return isImage || isPdf ? null : '이미지 또는 PDF 파일만 업로드할 수 있습니다.';
}

export function getStoredImageValidationError(file: File): string | null {
    const basicError = validateBasicFile(file, MAX_STORED_IMAGE_BYTES);
    if (basicError) return basicError;
    return file.type.startsWith('image/') || (!file.type && IMAGE_EXTENSION.test(file.name))
        ? null
        : '이미지 파일만 업로드할 수 있습니다.';
}

export function getTextFileValidationError(file: File): string | null {
    const basicError = validateBasicFile(file, MAX_TEXT_FILE_BYTES);
    if (basicError) return basicError;
    const isText = file.type.startsWith('text/') || file.type === 'application/json' || TEXT_EXTENSION.test(file.name);
    return isText ? null : '지원되는 텍스트 파일만 업로드할 수 있습니다.';
}

export function getFileFingerprint(file: Pick<File, 'name' | 'size' | 'lastModified' | 'type'>): string {
    return [file.name, file.size, file.lastModified, file.type].join('::');
}
