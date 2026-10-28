/**
 * Electron preload가 노출하는 자동 업데이트 API(electron/updater.cjs).
 * 상태에는 버전·진행률·안내문만 있고 경로·개인정보는 없다. 브라우저 개발 모드에는 window.jjssUpdates가 없다.
 */
export type JjssUpdatePhase =
    | 'disabled'
    | 'idle'
    | 'checking'
    | 'up-to-date'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'installing'
    | 'error';

export interface JjssUpdateStatus {
    phase: JjssUpdatePhase;
    currentVersion: string;
    availableVersion: string;
    percent: number | null;
    /** macOS 등: 자동 설치 없이 내려받기 페이지만 안내 */
    manualOnly: boolean;
    lastCheckedAt: string;
    message: string;
}

export interface JjssUpdatesApi {
    getStatus(): Promise<JjssUpdateStatus>;
    check(): Promise<JjssUpdateStatus>;
    download(): Promise<JjssUpdateStatus>;
    install(): Promise<JjssUpdateStatus>;
    openDownloadPage(): Promise<boolean>;
    onStatus(callback: (status: JjssUpdateStatus) => void): () => void;
}

declare global {
    interface Window {
        jjssUpdates?: JjssUpdatesApi;
    }
}
