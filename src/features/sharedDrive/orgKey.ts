/**
 * 기관 키(공유 저장소 종단간 암호화).
 *
 * - 기관 키는 128비트 무작위 비밀이다. 사람이 옮겨 적을 수 있게 "기관 키 코드"(Crockford Base32 26자 + 확인용 2자,
 *   4자씩 묶음)로 보여 준다. 메일·메신저로 보내지 않고 직접 전달한다.
 * - 실제 암호화 키는 HKDF-SHA256으로 만든 AES-256-GCM 키, 내용 지문용 HMAC-SHA256 키 두 개다.
 * - 레코드 암호문은 "JJSS1" + IV(12바이트) + AES-GCM 암호문. 추가 인증 데이터(AAD)에 레코드 id와 키 id를 넣어
 *   드라이브에서 파일 내용을 다른 레코드로 바꿔치기하면 복호화가 실패하게 한다.
 * - 구글에는 기관 키·파생 키 어느 것도 올라가지 않는다.
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MAGIC = new TextEncoder().encode('JJSS1');
const KEY_CHECK_TEXT = 'jjss-shared-drive-key-check-v1';

export interface OrgKey {
    /** 키 식별자(공개해도 되는 지문 16자). 드라이브 파일 속성에 남겨 어느 키로 암호화했는지 표시한다. */
    keyId: string;
    encryptKey: CryptoKey;
    hmacKey: CryptoKey;
}

function toBase32(bytes: Uint8Array): string {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += CROCKFORD[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) output += CROCKFORD[(value << (5 - bits)) & 31];
    return output;
}

function fromBase32(text: string): Uint8Array {
    let bits = 0;
    let value = 0;
    const output: number[] = [];
    for (const char of text) {
        const index = CROCKFORD.indexOf(char);
        if (index < 0) throw new Error('기관 키 코드에 쓸 수 없는 글자가 있습니다.');
        value = (value << 5) | index;
        bits += 5;
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return new Uint8Array(output);
}

/** Web Crypto가 받는 ArrayBuffer 기반 바이트로 맞춘다(SharedArrayBuffer 등 다른 버퍼면 복사). */
function own(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
    return new Uint8Array(bytes);
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', own(bytes)));
}

function concat(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }
    return output;
}

function hex(bytes: Uint8Array): string {
    return Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function checksum(secret: Uint8Array): Promise<string> {
    const digest = await sha256(concat(new TextEncoder().encode('jjss-org-key-code'), secret));
    return toBase32(digest.slice(0, 2)).slice(0, 2);
}

/** 새 기관 키 비밀(128비트) */
export function generateOrgSecret(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(16));
}

/** 비밀 → 사람이 옮겨 적는 코드("XXXX-XXXX-…", 28자) */
export async function formatOrgKeyCode(secret: Uint8Array): Promise<string> {
    if (secret.length !== 16) throw new Error('기관 키 길이가 올바르지 않습니다.');
    const body = toBase32(secret) + await checksum(secret);
    return body.match(/.{1,4}/g)!.join('-');
}

/**
 * 사람이 입력한 코드 → 비밀. 대소문자·공백·하이픈은 무시하고, 헷갈리는 글자(O→0, I·L→1)는 바로잡는다.
 * 확인용 2자가 맞지 않으면 오타로 보고 거부한다.
 */
export async function parseOrgKeyCode(code: string): Promise<Uint8Array> {
    const normalized = String(code ?? '')
        .toUpperCase()
        .replace(/[\s-]/g, '')
        .replace(/O/g, '0')
        .replace(/[IL]/g, '1');
    if (normalized.length !== 28) throw new Error('기관 키 코드는 28자(4자씩 7묶음)입니다. 빠진 글자가 없는지 확인해 주세요.');
    const secret = fromBase32(normalized.slice(0, 26)).slice(0, 16);
    if (normalized.slice(26) !== await checksum(secret)) {
        throw new Error('기관 키 코드가 맞지 않습니다. 오타가 없는지 확인해 주세요.');
    }
    return secret;
}

/** 비밀에서 암호화·지문 키를 만든다. */
export async function deriveOrgKey(secret: Uint8Array): Promise<OrgKey> {
    const base = await crypto.subtle.importKey('raw', own(secret), 'HKDF', false, ['deriveKey']);
    const salt = new TextEncoder().encode('jjss-shared-drive-v1');
    const encryptKey = await crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('record-aes-gcm') },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
    const hmacKey = await crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('content-hmac') },
        base,
        { name: 'HMAC', hash: 'SHA-256', length: 256 },
        false,
        ['sign'],
    );
    const keyId = hex((await sha256(concat(new TextEncoder().encode('jjss-key-id'), secret))).slice(0, 8));
    return { keyId, encryptKey, hmacKey };
}

function aad(recordId: string, keyId: string): Uint8Array<ArrayBuffer> {
    return new TextEncoder().encode(`jjss-record|${recordId}|${keyId}`);
}

/** 레코드(평문 객체) → 드라이브에 올릴 암호문 */
export async function encryptRecord(key: OrgKey, recordId: string, record: unknown): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(record));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(recordId, key.keyId) }, key.encryptKey, own(plain)));
    return concat(MAGIC, iv, cipher);
}

/** 드라이브 암호문 → 레코드. 키가 다르거나 다른 레코드의 내용이면 실패한다. */
export async function decryptRecord<T = unknown>(key: OrgKey, recordId: string, data: Uint8Array): Promise<T> {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (bytes.length < MAGIC.length + 12 + 16 || !MAGIC.every((byte, index) => bytes[index] === byte)) {
        throw new Error('공유 저장소 파일 형식이 올바르지 않습니다.');
    }
    const iv = own(bytes.slice(MAGIC.length, MAGIC.length + 12));
    const cipher = own(bytes.slice(MAGIC.length + 12));
    let plain: ArrayBuffer;
    try {
        plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(recordId, key.keyId) }, key.encryptKey, cipher);
    } catch {
        throw Object.assign(new Error('공유 저장소 파일을 이 기관 키로 열지 못했습니다.'), { code: 'SHARED_DRIVE_DECRYPT_FAILED' });
    }
    return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/**
 * 내용 지문(HMAC-SHA256 앞 32자). 드라이브 속성에 남겨 "내용이 같은지"를 내려받지 않고 비교한다.
 * 기관 키가 없으면 계산할 수 없으므로 지문으로 내용을 추측할 수 없다.
 */
export async function contentHash(key: OrgKey, record: unknown): Promise<string> {
    const signature = await crypto.subtle.sign('HMAC', key.hmacKey, new TextEncoder().encode(stableStringify(record)));
    return hex(new Uint8Array(signature).slice(0, 16));
}

/** 키가 맞는지 확인하는 표식(드라이브 _meta에 둔다) */
export async function createKeyCheck(key: OrgKey): Promise<Uint8Array> {
    return encryptRecord(key, '_meta:key-check', { purpose: KEY_CHECK_TEXT });
}

export async function verifyKeyCheck(key: OrgKey, data: Uint8Array): Promise<boolean> {
    try {
        const value = await decryptRecord<{ purpose?: string }>(key, '_meta:key-check', data);
        return value?.purpose === KEY_CHECK_TEXT;
    } catch {
        return false;
    }
}

/** 키 순서와 무관한 JSON(지문 비교용) */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([name, item]) => `${JSON.stringify(name)}:${stableStringify(item)}`).join(',')}}`;
}
