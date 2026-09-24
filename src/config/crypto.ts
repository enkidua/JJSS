/**
 * 로컬 데이터·API 키 암호화 (Web Crypto AES-GCM 256비트)
 *
 * 저장 형식
 * - `enc:v2:<iv>.<암호문>` Windows DPAPI(Electron safeStorage)로 보호되는 데이터 키로 암호화
 * - `enc:v1:<iv>.<암호문>` 데이터 키를 쓸 수 없을 때(브라우저 개발 모드 등) APP_SEED + 설치 ID 파생 키로 암호화
 * - `<iv>.<암호문>`        이전 버전 형식(접두어 없음). 설치 ID 키 → 머신 지문 키 순서로 복호화
 * 암호문 형식이 아닌 값은 평문으로 그대로 읽는다(다음 저장 때 암호화).
 *
 * 백업 파일 비밀번호 암호화(PBKDF2-SHA256 → AES-GCM 봉투 형식)도 이 파일에 있다.
 */

const APP_SEED = 'JJSS-Desktop-Secure-2026';

// 최초 실행 시 생성한 고유 ID — localStorage에 영구 저장됨 (v1·이전 형식 키 재료)
const INSTALLATION_ID_KEY = 'jjss-installation-id';

export const CIPHER_PREFIX_V2 = 'enc:v2:';
export const CIPHER_PREFIX_V1 = 'enc:v1:';

const AES_IV_BYTES = 12;
const AES_TAG_BYTES = 16;
const DATA_KEY_BYTES = 32;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export type CipherScheme = 'v2' | 'v1' | 'legacy';

export interface DecryptResult {
    /** 복호화된 값. 실패하면 '' (암호문을 화면에 보여 주지 않는다) */
    value: string;
    /** false면 복호화 실패 — 저장된 원본은 지우지 말고 복구 안내가 필요하다 */
    ok: boolean;
    /** 저장값이 암호문 형식이었는지 */
    encrypted: boolean;
    scheme?: CipherScheme;
    /** 현재 키가 아닌 키(이전 형식·v1)로 복호화됨 → 다음 저장 때 현재 키로 다시 암호화 */
    needsReEncrypt: boolean;
    /** v2 암호문인데 이 PC에서 데이터 키를 불러오지 못함 (백업 복원 안내 필요) */
    dataKeyUnavailable: boolean;
}

// ─── 바이트/문자열 변환 ───

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function strToBytes(str: string): ArrayBuffer {
    return toArrayBuffer(new TextEncoder().encode(str));
}

/** 큰 데이터도 호출 스택 한도에 걸리지 않도록 나눠서 base64로 변환한다. */
function bytesToBase64(bytes: Uint8Array): string {
    const CHUNK = 0x8000;
    let binary = '';
    for (let index = 0; index < bytes.length; index += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
    }
    return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array | null {
    if (!value || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) return null;
    try {
        const binary = atob(value);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        return bytes;
    } catch {
        return null;
    }
}

interface CipherPayload {
    iv: Uint8Array;
    ct: Uint8Array;
}

/** "iv.암호문" 형식 검사: iv는 정확히 12바이트, 암호문은 인증 태그를 포함해 16바이트 이상 */
function parseCipherPayload(payload: string): CipherPayload | null {
    const parts = payload.split('.');
    if (parts.length !== 2) return null;
    const iv = base64ToBytes(parts[0]);
    if (!iv || iv.length !== AES_IV_BYTES) return null;
    const ct = base64ToBytes(parts[1]);
    if (!ct || ct.length < AES_TAG_BYTES) return null;
    return { iv, ct };
}

function parseStoredCipher(value: string): (CipherPayload & { scheme: CipherScheme }) | null {
    if (value.startsWith(CIPHER_PREFIX_V2)) {
        const payload = parseCipherPayload(value.slice(CIPHER_PREFIX_V2.length));
        return payload && { ...payload, scheme: 'v2' };
    }
    if (value.startsWith(CIPHER_PREFIX_V1)) {
        const payload = parseCipherPayload(value.slice(CIPHER_PREFIX_V1.length));
        return payload && { ...payload, scheme: 'v1' };
    }
    const payload = parseCipherPayload(value);
    return payload && { ...payload, scheme: 'legacy' };
}

/**
 * 값이 암호문 형식인지 판별한다.
 * `enc:v2:`/`enc:v1:` 접두어가 있거나, 이전 형식(iv 12바이트 + 암호문 16바이트 이상)과 정확히 일치할 때만 true.
 * '2024.0001', 'Kim123' 같은 일반 값은 암호문으로 보지 않는다.
 */
export function isEncrypted(value: unknown): boolean {
    return typeof value === 'string' && value.length > 0 && parseStoredCipher(value) !== null;
}

// ─── 키 관리 (모듈 범위 캐시: 호출마다 PBKDF2를 반복하지 않는다) ───

function readInstallationId(): string | null {
    return localStorage.getItem(INSTALLATION_ID_KEY);
}

/**
 * 설치 고유 ID 획득 (최초 1회 생성 후 영구 보존)
 * 이 값이 삭제되면 v1·이전 형식 암호문을 복호화할 수 없으므로 주의
 */
function getOrCreateInstallationId(): string {
    let id = readInstallationId();
    if (!id) {
        const randomPart = crypto.getRandomValues(new Uint8Array(32));
        const hexString = Array.from(randomPart, b => b.toString(16).padStart(2, '0')).join('');
        id = `inst-${hexString}-${Date.now()}`;
        localStorage.setItem(INSTALLATION_ID_KEY, id);
    }
    return id;
}

/**
 * [마이그레이션 호환] 이전 방식의 머신 지문 기반 시드
 * Electron 버전이 바뀌면 값이 달라질 수 있어 복호화 전용으로만 사용한다.
 */
function getLegacyMachineFingerprint(): string {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    const scr = typeof screen !== 'undefined' ? screen : undefined;
    const parts = [
        nav?.userAgent,
        nav?.language,
        nav?.hardwareConcurrency?.toString() || '0',
        scr?.colorDepth?.toString() || '0',
        scr?.width?.toString() || '0',
        scr?.height?.toString() || '0',
        Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    ];
    return parts.join('|');
}

// AES-GCM 키 파생 (PBKDF2 → AES-GCM) — v1·이전 형식과 동일한 파라미터를 유지해야 한다.
async function deriveKeyFromSeed(seed: string): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey('raw', strToBytes(seed), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: strToBytes('JJSS-salt-v1'),
            iterations: 100_000,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

let dataKeyPromise: Promise<CryptoKey | null> | null = null;
let installationKeyCache: { id: string; key: Promise<CryptoKey> } | null = null;
let legacyKeyPromise: Promise<CryptoKey> | null = null;

async function loadDataKey(): Promise<{ key: CryptoKey | null; retry: boolean }> {
    const api = typeof window !== 'undefined' ? window.jjssSecure : undefined;
    if (!api || typeof api.getDataKey !== 'function') return { key: null, retry: false };

    let encoded: string | null;
    try {
        encoded = await api.getDataKey();
    } catch {
        // IPC 자체가 실패한 경우에는 다음 호출에서 다시 시도한다.
        return { key: null, retry: true };
    }
    const raw = typeof encoded === 'string' ? base64ToBytes(encoded.trim()) : null;
    if (!raw || raw.length !== DATA_KEY_BYTES) return { key: null, retry: false };
    try {
        const key = await crypto.subtle.importKey('raw', toArrayBuffer(raw), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
        return { key, retry: false };
    } catch {
        return { key: null, retry: false };
    }
}

/** DPAPI로 보호되는 데이터 키 (없으면 null). 앱 실행 중 한 번만 불러온다. */
function getDataKey(): Promise<CryptoKey | null> {
    if (!dataKeyPromise) {
        const pending = loadDataKey();
        const keyPromise = pending.then(result => result.key);
        dataKeyPromise = keyPromise;
        void pending.then(result => {
            if (result.retry && dataKeyPromise === keyPromise) dataKeyPromise = null;
        });
    }
    return dataKeyPromise;
}

/** v1·이전 형식 키 (APP_SEED + 설치 ID). create=false면 설치 ID가 없을 때 null. */
function getInstallationKey(create: true): Promise<CryptoKey>;
function getInstallationKey(create: false): Promise<CryptoKey | null>;
async function getInstallationKey(create: boolean): Promise<CryptoKey | null> {
    const id = create ? getOrCreateInstallationId() : readInstallationId();
    if (!id) return null;
    if (!installationKeyCache || installationKeyCache.id !== id) {
        const key = deriveKeyFromSeed(`${APP_SEED}::${id}`);
        installationKeyCache = { id, key };
        key.catch(() => {
            if (installationKeyCache?.key === key) installationKeyCache = null;
        });
    }
    return installationKeyCache.key;
}

function getLegacyKey(): Promise<CryptoKey> {
    if (!legacyKeyPromise) {
        const key = deriveKeyFromSeed(`${APP_SEED}::${getLegacyMachineFingerprint()}`);
        legacyKeyPromise = key;
        key.catch(() => {
            if (legacyKeyPromise === key) legacyKeyPromise = null;
        });
    }
    return legacyKeyPromise;
}

/** 현재 새 값을 암호화할 때 쓰는 키 종류 (설정 화면 안내용) */
export async function getEncryptionKeyKind(): Promise<'data-key' | 'installation'> {
    return (await getDataKey()) ? 'data-key' : 'installation';
}

// ─── 암호화 / 복호화 ───

async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<CipherPayload> {
    const iv = crypto.getRandomValues(new Uint8Array(AES_IV_BYTES));
    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(iv) },
        key,
        strToBytes(plaintext),
    );
    return { iv, ct: new Uint8Array(cipherBuffer) };
}

async function aesDecrypt(key: CryptoKey | null, payload: CipherPayload): Promise<string | null> {
    if (!key) return null;
    try {
        const plainBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: toArrayBuffer(payload.iv) },
            key,
            toArrayBuffer(payload.ct),
        );
        return new TextDecoder().decode(plainBuffer);
    } catch {
        return null;
    }
}

/**
 * 평문 → 암호문
 * 데이터 키가 있으면 `enc:v2:`, 없으면(브라우저 개발 모드 등) `enc:v1:` 형식으로 저장한다.
 */
export async function encrypt(plaintext: string): Promise<string> {
    if (!plaintext) return '';
    const dataKey = await getDataKey();
    const prefix = dataKey ? CIPHER_PREFIX_V2 : CIPHER_PREFIX_V1;
    const key = dataKey || await getInstallationKey(true);
    const { iv, ct } = await aesEncrypt(key, plaintext);
    return `${prefix}${bytesToBase64(iv)}.${bytesToBase64(ct)}`;
}

function plainResult(value: string): DecryptResult {
    return { value, ok: true, encrypted: false, needsReEncrypt: false, dataKeyUnavailable: false };
}

function failedResult(scheme: CipherScheme, dataKeyUnavailable = false): DecryptResult {
    return { value: '', ok: false, encrypted: true, scheme, needsReEncrypt: false, dataKeyUnavailable };
}

/**
 * 암호문 → 평문 복호화
 *
 * - `enc:v2:` 데이터 키로 복호화. 데이터 키가 없으면 실패(dataKeyUnavailable)
 * - `enc:v1:` 설치 ID 키로 복호화. 데이터 키가 있으면 다음 저장 때 v2로 다시 암호화
 * - 접두어 없는 이전 형식: 설치 ID 키 → 머신 지문 키 순서로 시도, 성공하면 다시 암호화 대상
 * - 암호문 형식이 아니면 평문 그대로 반환
 * 실패하면 빈 문자열과 ok=false를 반환한다(암호문을 화면에 보여 주지 않음).
 */
export async function decryptWithStatus(ciphertext: string): Promise<DecryptResult> {
    if (!ciphertext) return plainResult('');
    const parsed = parseStoredCipher(ciphertext);
    if (!parsed) return plainResult(ciphertext);

    const dataKey = await getDataKey();

    if (parsed.scheme === 'v2') {
        if (!dataKey) return failedResult('v2', true);
        const plain = await aesDecrypt(dataKey, parsed);
        if (plain === null) return failedResult('v2');
        return { value: plain, ok: true, encrypted: true, scheme: 'v2', needsReEncrypt: false, dataKeyUnavailable: false };
    }

    if (parsed.scheme === 'v1') {
        const plain = await aesDecrypt(await getInstallationKey(false), parsed);
        if (plain === null) return failedResult('v1');
        return { value: plain, ok: true, encrypted: true, scheme: 'v1', needsReEncrypt: Boolean(dataKey), dataKeyUnavailable: false };
    }

    let plain = await aesDecrypt(await getInstallationKey(false), parsed);
    if (plain === null) plain = await aesDecrypt(await getLegacyKey().catch(() => null), parsed);
    if (plain === null) return failedResult('legacy');
    return { value: plain, ok: true, encrypted: true, scheme: 'legacy', needsReEncrypt: true, dataKeyUnavailable: false };
}

export async function decrypt(ciphertext: string): Promise<string> {
    const result = await decryptWithStatus(ciphertext);
    return result.value;
}

// ─── 백업 파일 비밀번호 암호화 ───

export const ENCRYPTED_BACKUP_FORMAT = 'jjss-backup-encrypted';
export const BACKUP_PBKDF2_ITERATIONS = 310_000;
export const MIN_BACKUP_PASSWORD_LENGTH = 8;
const BACKUP_SALT_BYTES = 16;
const MIN_ACCEPTED_ITERATIONS = 100_000;
const MAX_ACCEPTED_ITERATIONS = 10_000_000;

export interface EncryptedBackupEnvelope {
    format: typeof ENCRYPTED_BACKUP_FORMAT;
    version: 1;
    kdf: 'PBKDF2-SHA256';
    iterations: number;
    salt: string;
    iv: string;
    ciphertext: string;
}

function normalizePassword(password: string): string {
    return password.normalize('NFC');
}

async function deriveBackupKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey('raw', strToBytes(normalizePassword(password)), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: toArrayBuffer(salt), iterations, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

/** 백업 JSON 문자열을 비밀번호로 암호화한 봉투(JSON 문자열)를 만든다. */
export async function encryptBackupPayload(plaintext: string, password: string): Promise<string> {
    if (normalizePassword(password).length < MIN_BACKUP_PASSWORD_LENGTH) {
        throw new Error(`백업 비밀번호는 ${MIN_BACKUP_PASSWORD_LENGTH}자 이상이어야 합니다.`);
    }
    const salt = crypto.getRandomValues(new Uint8Array(BACKUP_SALT_BYTES));
    const key = await deriveBackupKey(password, salt, BACKUP_PBKDF2_ITERATIONS);
    const { iv, ct } = await aesEncrypt(key, plaintext);
    const envelope: EncryptedBackupEnvelope = {
        format: ENCRYPTED_BACKUP_FORMAT,
        version: 1,
        kdf: 'PBKDF2-SHA256',
        iterations: BACKUP_PBKDF2_ITERATIONS,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(ct),
    };
    return JSON.stringify(envelope, null, 2);
}

/**
 * 암호화된 백업 봉투인지 확인한다.
 * 일반(평문) 백업이면 null, 암호화 봉투인데 형식이 깨졌으면 오류를 던진다.
 */
export function parseEncryptedBackupEnvelope(text: string): EncryptedBackupEnvelope | null {
    const trimmed = text.trimStart();
    if (!trimmed.startsWith('{') || !trimmed.includes(ENCRYPTED_BACKUP_FORMAT)) return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (value.format !== ENCRYPTED_BACKUP_FORMAT) return null;

    const invalid = () => new Error('암호화된 백업 파일의 형식이 올바르지 않습니다. 파일이 손상되었을 수 있습니다.');
    if (value.version !== 1) {
        throw new Error('이 프로그램 버전에서 지원하지 않는 암호화 백업 형식입니다. JJSS를 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.');
    }
    if (value.kdf !== 'PBKDF2-SHA256'
        || typeof value.iterations !== 'number'
        || !Number.isInteger(value.iterations)
        || value.iterations < MIN_ACCEPTED_ITERATIONS
        || value.iterations > MAX_ACCEPTED_ITERATIONS
        || typeof value.salt !== 'string'
        || typeof value.iv !== 'string'
        || typeof value.ciphertext !== 'string') {
        throw invalid();
    }
    const salt = base64ToBytes(value.salt);
    const iv = base64ToBytes(value.iv);
    const ct = base64ToBytes(value.ciphertext);
    if (!salt || salt.length < 8 || !iv || iv.length !== AES_IV_BYTES || !ct || ct.length < AES_TAG_BYTES) {
        throw invalid();
    }
    return {
        format: ENCRYPTED_BACKUP_FORMAT,
        version: 1,
        kdf: 'PBKDF2-SHA256',
        iterations: value.iterations,
        salt: value.salt,
        iv: value.iv,
        ciphertext: value.ciphertext,
    };
}

/** 암호화된 백업 봉투를 비밀번호로 풀어 원래 백업 JSON 문자열을 돌려준다. */
export async function decryptBackupPayload(envelope: EncryptedBackupEnvelope, password: string): Promise<string> {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const ct = base64ToBytes(envelope.ciphertext);
    if (!salt || !iv || !ct) throw new Error('암호화된 백업 파일의 형식이 올바르지 않습니다.');
    if (!password) throw new Error('백업 비밀번호를 입력해 주세요.');
    const key = await deriveBackupKey(password, salt, envelope.iterations);
    const plain = await aesDecrypt(key, { iv, ct });
    if (plain === null) {
        throw new Error('비밀번호가 맞지 않거나 백업 파일이 손상되었습니다. 비밀번호를 다시 확인해 주세요.');
    }
    return plain;
}
