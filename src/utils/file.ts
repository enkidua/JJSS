/** File → data URL(`data:<mime>;base64,...`). */
export function fileToDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('파일을 읽지 못했습니다.'));
        reader.readAsDataURL(file);
    });
}

/** File → 순수 base64 문자열(data URL 접두어 제외). */
export async function fileToBase64(file: Blob): Promise<string> {
    const dataUrl = await fileToDataUrl(file);
    return dataUrl.split(',')[1] || '';
}

/** base64 인코딩 후 크기(바이트) 추정치. */
export function estimateBase64Size(byteLength: number): number {
    return Math.ceil(byteLength / 3) * 4;
}
