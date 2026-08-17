/**
 * API 키 암호화/복호화 유틸리티
 * Web Crypto API를 사용한 AES-GCM 256비트 암호화
 * 
 * - 최초 실행 시 생성된 고유 ID(Installation ID)로 파생된 키 사용
 * - 머신 하드웨어 변경, Electron 업데이트에도 키가 유지됨
 * - 외부에서 IndexedDB를 열어도 API 키를 읽을 수 없음
 */

const APP_SEED = 'JJSS-Desktop-Secure-2026';

// 최초 실행 시 생성한 고유 ID — localStorage에 영구 저장됨
// 이전 방식(navigator.userAgent 등)은 Electron 업데이트/모니터 변경 시 바뀔 수 있어 불안정
const INSTALLATION_ID_KEY = 'jjss-installation-id';

/**
 * 설치 고유 ID 획득 (최초 1회 생성 후 영구 보존)
 * 이 값이 삭제되면 기존 암호화된 키를 복호화할 수 없으므로 주의
 */
function getInstallationId(): string {
    let id = localStorage.getItem(INSTALLATION_ID_KEY);
    if (!id) {
        // 최초 실행: 랜덤 UUID + 현재 타임스탬프로 고유 ID 생성
        const randomPart = crypto.getRandomValues(new Uint8Array(32));
        const hexString = Array.from(randomPart, b => b.toString(16).padStart(2, '0')).join('');
        id = `inst-${hexString}-${Date.now()}`;
        localStorage.setItem(INSTALLATION_ID_KEY, id);
    }
    return id;
}

/**
 * [마이그레이션 호환] 이전 방식의 머신 지문 기반 시드 생성
 * Electron 버전이 바뀌면 값이 달라질 수 있어 불안정함
 */
function getLegacyMachineFingerprint(): string {
    const nav = navigator;
    const parts = [
        nav.userAgent,
        nav.language,
        nav.hardwareConcurrency?.toString() || '0',
        screen.colorDepth?.toString() || '0',
        screen.width?.toString() || '0',
        screen.height?.toString() || '0',
        Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    ];
    return parts.join('|');
}

// 문자열 → ArrayBuffer (Web Crypto API 호환)
function strToBytes(str: string): ArrayBuffer {
    return new TextEncoder().encode(str).buffer as ArrayBuffer;
}

// AES-GCM 키 파생 (PBKDF2 → AES-GCM)
async function deriveKeyFromSeed(seed: string): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        strToBytes(seed),
        'PBKDF2',
        false,
        ['deriveKey'],
    );
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

/** 현재 방식 키 파생 (안정적인 Installation ID 기반) */
async function deriveKey(): Promise<CryptoKey> {
    const seed = APP_SEED + '::' + getInstallationId();
    return deriveKeyFromSeed(seed);
}

/** 이전 방식 키 파생 (마이그레이션용) */
async function deriveLegacyKey(): Promise<CryptoKey> {
    const seed = APP_SEED + '::' + getLegacyMachineFingerprint();
    return deriveKeyFromSeed(seed);
}

/**
 * 평문 → 암호문 (Base64 인코딩)
 * 반환 형식: "iv_base64.ciphertext_base64"
 */
export async function encrypt(plaintext: string): Promise<string> {
    if (!plaintext) return '';
    const key = await deriveKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
        key,
        encoded.buffer as ArrayBuffer,
    );
    const ivB64 = btoa(String.fromCharCode(...iv));
    const ctB64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuffer)));
    return `${ivB64}.${ctB64}`;
}

/**
 * 암호문 → 평문 복호화
 * 
 * 복호화 전략:
 * 1. 현재 키(Installation ID 기반)로 시도
 * 2. 실패 시 레거시 키(머신 지문 기반)로 재시도 (마이그레이션)
 * 3. 레거시 복호화 성공 시 현재 키로 재암호화하여 자동 마이그레이션
 * 4. 모두 실패 시 빈 문자열 반환 (사용자에게 재입력 요청 유도)
 */
export async function decryptWithStatus(ciphertext: string): Promise<{ value: string; ok: boolean; encrypted: boolean }> {
    if (!ciphertext) return { value: '', ok: true, encrypted: false };
    // 이전에 암호화되지 않은 평문(마이그레이션용)
    // API 키 자체에 점(.)이 포함될 수 있으므로 형식 검증 없이 복호화를 시도하지 않음
    if (!isEncrypted(ciphertext)) return { value: ciphertext, ok: true, encrypted: false };

    // 1단계: 현재 키로 복호화 시도
    try {
        const key = await deriveKey();
        const [ivB64, ctB64] = ciphertext.split('.');
        const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
        const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
        const plainBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
            key,
            ct.buffer as ArrayBuffer,
        );
        return { value: new TextDecoder().decode(plainBuffer), ok: true, encrypted: true };
    } catch {
        // 현재 키로 실패 — 레거시 시도
    }

    // 2단계: 레거시 키(이전 머신 지문 기반)로 복호화 시도
    try {
        const legacyKey = await deriveLegacyKey();
        const [ivB64, ctB64] = ciphertext.split('.');
        const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
        const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
        const plainBuffer = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
            legacyKey,
            ct.buffer as ArrayBuffer,
        );
        const plaintext = new TextDecoder().decode(plainBuffer);
        // ✅ 레거시 복호화 성공 — 새 키로 자동 재암호화는 상위 로직에서 처리
        return { value: plaintext, ok: true, encrypted: true };
    } catch {
        // 레거시 키도 실패
    }

    // 3단계: 모든 복호화 실패 — 빈 문자열 반환 (키 재입력 유도)
    // ⚠️ 암호문을 그대로 반환하면 API 키 위치에 쓰레기값이 들어가므로 빈 값 반환
    console.warn('[Crypto] 복호화 실패: API 키를 다시 입력해 주세요.');
    return { value: '', ok: false, encrypted: true };
}

export async function decrypt(ciphertext: string): Promise<string> {
    const result = await decryptWithStatus(ciphertext);
    return result.value;
}

/**
 * 값이 암호화된 형식인지 판별
 */
export function isEncrypted(value: string): boolean {
    if (!value) return false;
    // "base64.base64" 패턴
    const parts = value.split('.');
    if (parts.length !== 2) return false;
    try {
        atob(parts[0]);
        atob(parts[1]);
        return true;
    } catch {
        return false;
    }
}
