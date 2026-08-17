const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'http:']);

function getAllowedExternalUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl);
        return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null;
    } catch {
        return null;
    }
}

module.exports = { getAllowedExternalUrl };
