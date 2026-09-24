/**
 * 텍스트를 클립보드에 복사합니다. 성공 여부를 반환하며 예외를 던지지 않습니다.
 * Clipboard API가 막힌 환경(포커스 없음, 권한 거부)에서는 textarea + execCommand로 대체합니다.
 */
export async function copyText(text: string): Promise<boolean> {
    if (!text) return false;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // fallback below
    }
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        textarea.remove();
        return ok;
    } catch {
        return false;
    }
}
