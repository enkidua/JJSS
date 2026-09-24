/**
 * Electron preload가 노출하는 데이터 키 API (계약 C3).
 * main 프로세스가 Windows DPAPI(safeStorage)로 보호하는 32바이트 무작위 키를 base64로 돌려준다.
 * safeStorage를 쓸 수 없거나 키 파일을 복호화하지 못하면 null.
 * 브라우저 개발 모드에서는 window.jjssSecure 자체가 없다.
 */
export interface JjssSecureApi {
    getDataKey(): Promise<string | null>;
}

declare global {
    interface Window {
        jjssSecure?: JjssSecureApi;
    }
}
