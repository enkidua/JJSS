// 훈련생 사진 축소 규칙.
// 사진은 훈련실 자료(rooms) 안에 data URL로 함께 저장됩니다. 원본 크기 그대로 넣으면
// 자동 저장 때마다 수 MB를 다시 쓰고, 백업 파일이 저장 한도(100MB)를 넘을 수 있어
// 명단 표시용 크기(긴 변 256px, JPEG)로 줄여서만 보관합니다.
// 이 파일은 다른 모듈을 import하지 않습니다(scripts/test-training-photo.mjs가 단독으로 불러 검사).

/** 저장하는 사진의 긴 변 최대 길이(px). 명단에는 48px로만 보이므로 256px이면 충분합니다. */
export const TRAINEE_PHOTO_MAX_EDGE = 256;
export const TRAINEE_PHOTO_JPEG_QUALITY = 0.85;
/** 이 길이(문자 수)를 넘는 저장 사진은 예전 방식(원본 그대로)으로 저장된 것으로 보고 다시 줄입니다. */
export const TRAINEE_PHOTO_SHRINK_THRESHOLD_CHARS = 200 * 1024;

const IMAGE_DATA_URL_PREFIX = 'data:image/';
const JPEG_DATA_URL_PREFIX = 'data:image/jpeg';
const UNTYPED_DATA_URL_PREFIX = 'data:application/octet-stream';

export function isImageDataUrl(value: unknown): value is string {
    return typeof value === 'string' && value.startsWith(IMAGE_DATA_URL_PREFIX);
}

/** 이미 저장된 사진을 다시 줄여야 하는지. http 주소 등 data URL이 아닌 값은 건드리지 않습니다. */
export function needsPhotoShrink(dataUrl: unknown): boolean {
    return isImageDataUrl(dataUrl) && dataUrl.length > TRAINEE_PHOTO_SHRINK_THRESHOLD_CHARS;
}

/** 비율을 유지한 축소 크기. 작은 사진은 키우지 않습니다. 크기를 알 수 없으면 null. */
export function computePhotoTargetSize(
    width: number,
    height: number,
    maxEdge: number = TRAINEE_PHOTO_MAX_EDGE,
): { width: number; height: number } | null {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    if (!Number.isFinite(maxEdge) || maxEdge <= 0) return null;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

/**
 * 저장된 사진을 줄인 결과로 바꿔도 되는지.
 * 줄인 결과가 JPEG가 아니거나 원본보다 작지 않으면 원본을 그대로 둡니다(사진을 잃지 않기 위함).
 */
export function shouldReplaceStoredPhoto(original: string, shrunk: unknown): shrunk is string {
    return typeof shrunk === 'string' && shrunk.startsWith(JPEG_DATA_URL_PREFIX) && shrunk.length < original.length;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('사진을 열지 못했습니다.'));
        image.src = dataUrl;
    });
}

/**
 * 사진 data URL을 긴 변 256px JPEG data URL로 줄입니다.
 * 브라우저가 읽지 못하는 형식(HEIC 등)이거나 캔버스를 쓸 수 없으면 오류를 던집니다.
 * 호출한 쪽은 실패 시 원본을 저장하지 말고(새 업로드) 또는 기존 사진을 그대로 두어야(저장된 사진) 합니다.
 */
export async function shrinkPhotoDataUrl(dataUrl: string): Promise<string> {
    // 파일 종류를 알려 주지 않는 사진(확장자만 있는 파일)은 'application/octet-stream'으로 읽히므로 함께 받습니다.
    // 실제로 사진인지는 아래 디코딩에서 가려집니다.
    const source: unknown = dataUrl;
    const decodable = typeof source === 'string'
        && (source.startsWith(IMAGE_DATA_URL_PREFIX) || source.startsWith(UNTYPED_DATA_URL_PREFIX));
    if (!decodable) throw new Error('사진 파일이 아닙니다.');
    const image = await loadImage(dataUrl);
    const size = computePhotoTargetSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
    if (!size) throw new Error('사진 크기를 확인하지 못했습니다.');
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('사진을 줄일 수 없습니다.');
    // JPEG에는 투명이 없어 투명 배경(PNG 등)이 검게 나오지 않도록 흰색을 먼저 칠합니다.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image, 0, 0, size.width, size.height);
    const result = canvas.toDataURL('image/jpeg', TRAINEE_PHOTO_JPEG_QUALITY);
    if (typeof result !== 'string' || !result.startsWith(JPEG_DATA_URL_PREFIX)) throw new Error('사진을 줄일 수 없습니다.');
    return result;
}
