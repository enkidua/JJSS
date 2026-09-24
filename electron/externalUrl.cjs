// 외부 링크는 암호화된 웹 주소(https)와 메일 쓰기(mailto: — 앱 하단 의견 보내기)만 허용한다.
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:']);

function getAllowedExternalUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || rawUrl.length > 4_096) return null;
    try {
        const parsed = new URL(rawUrl);
        if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null;
        if (parsed.protocol === 'https:' && (!parsed.hostname || parsed.username || parsed.password)) return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

module.exports = { getAllowedExternalUrl };
