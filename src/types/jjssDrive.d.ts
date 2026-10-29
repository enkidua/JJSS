// Electron preload(electron/preload.cjs)가 노출하는 공유 저장소 기능. 결과는 { ok, value } | { ok: false, error }.
type JjssDriveResult<T> = { ok: true; value: T } | { ok: false; error: { message: string; code: string; status?: number } };

interface JjssDriveStatus {
    /** api: 구글 로그인(기관 OAuth 클라이언트), folder: 구글 드라이브(데스크톱)가 PC에 붙인 공유 드라이브 폴더 */
    mode: 'api' | 'folder';
    /** 폴더 방식에서 고른 폴더(그 밖에는 빈 값) */
    folderPath: string;
    configured: boolean;
    domain: string;
    clientIdHint: string;
    accountEmail: string;
    signedIn: boolean;
    driveId: string;
    driveName: string;
    enabled: boolean;
    hasOrgKey: boolean;
    secureStorage: boolean;
}

interface JjssDriveBridge {
    getStatus(): Promise<JjssDriveResult<JjssDriveStatus>>;
    setMode(mode: 'api' | 'folder'): Promise<JjssDriveResult<JjssDriveStatus>>;
    configure(input: { clientId: string; clientSecret: string; domain: string }): Promise<JjssDriveResult<JjssDriveStatus>>;
    configureFolder(input: { domain: string; email: string }): Promise<JjssDriveResult<JjssDriveStatus>>;
    chooseFolder(): Promise<JjssDriveResult<JjssDriveStatus>>;
    inspectFolder(): Promise<JjssDriveResult<{ folderPath: string; isSharedDrive: boolean; isMyDrive: boolean; isGoogleDrive: boolean; driveName: string; accountEmail: string } | null>>;
    signIn(): Promise<JjssDriveResult<JjssDriveStatus>>;
    signOut(): Promise<JjssDriveResult<JjssDriveStatus>>;
    listSharedDrives(): Promise<JjssDriveResult<Array<{ id: string; name: string }>>>;
    selectDrive(driveId: string): Promise<JjssDriveResult<JjssDriveStatus>>;
    securityFacts(): Promise<JjssDriveResult<import('../features/sharedDrive/types').DriveSecurityFacts>>;
    listRecords(pageToken?: string): Promise<JjssDriveResult<{ files: import('../features/sharedDrive/types').RemoteFile[]; nextPageToken?: string }>>;
    getStartPageToken(): Promise<JjssDriveResult<string>>;
    listChanges(pageToken: string): Promise<JjssDriveResult<{ changes: import('../features/sharedDrive/types').DriveChange[]; nextPageToken?: string; newStartPageToken?: string }>>;
    getFile(fileId: string): Promise<JjssDriveResult<import('../features/sharedDrive/types').RemoteFile | null>>;
    download(fileId: string): Promise<JjssDriveResult<Uint8Array>>;
    upload(input: { fileId?: string; folder: string; name: string; appProperties: Record<string, string>; content: Uint8Array }): Promise<JjssDriveResult<import('../features/sharedDrive/types').RemoteFile>>;
    setProperties(fileId: string, appProperties: Record<string, string | null>): Promise<JjssDriveResult<void>>;
    findMeta(name: string): Promise<JjssDriveResult<import('../features/sharedDrive/types').RemoteFile | null>>;
    setOrgKey(base64: string): Promise<JjssDriveResult<JjssDriveStatus>>;
    getOrgKey(): Promise<JjssDriveResult<string | null>>;
    setPendingOrgKey(base64: string | null): Promise<JjssDriveResult<JjssDriveStatus>>;
    getPendingOrgKey(): Promise<JjssDriveResult<string | null>>;
    setEnabled(enabled: boolean): Promise<JjssDriveResult<JjssDriveStatus>>;
    backupLocalData(): Promise<JjssDriveResult<{ copied: boolean }>>;
}

interface Window {
    jjssDrive?: JjssDriveBridge;
}
