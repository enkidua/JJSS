/**
 * Electron preload가 노출하는 데이터 키 API (계약 C3).
 * main 프로세스가 운영체제 보안 저장소(safeStorage: Windows DPAPI, macOS Keychain)로 보호하는
 * 32바이트 무작위 키를 base64로 돌려준다. safeStorage를 쓸 수 없거나 키 파일을 복호화하지 못하면 null.
 * 브라우저 개발 모드에서는 window.jjssSecure 자체가 없다.
 */
export interface JjssSecureStatus {
    /** safeStorage 암호화를 쓸 수 있는지 (Linux basic_text 백엔드는 false) */
    available: boolean;
    /** 패키징된 배포용 앱인지 (app.isPackaged) */
    packaged: boolean;
    /** process.platform ('win32' | 'darwin' | 'linux' …) */
    platform: string;
}

export interface JjssSecureApi {
    getDataKey(): Promise<string | null>;
    getStatus?(): Promise<JjssSecureStatus>;
}

declare global {
    interface Window {
        jjssSecure?: JjssSecureApi;
    }
}
