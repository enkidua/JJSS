/**
 * 렌더러 쪽 드라이브 접근. 실제 요청은 main 프로세스(electron/googleDrive.cjs)가 하고, 여기서는 결과를 풀어
 * 오류를 SharedDriveError로 바꾼다. 브라우저(개발 서버)에는 window.jjssDrive가 없으므로 기능이 보이지 않는다.
 */
import type { DriveApi, FolderKey } from './types';

export class SharedDriveError extends Error {
    constructor(message: string, readonly code: string, readonly status?: number) {
        super(message);
    }
}

export function getDriveBridge(): JjssDriveBridge | null {
    return typeof window !== 'undefined' && window.jjssDrive ? window.jjssDrive : null;
}

export async function unwrap<T>(pending: Promise<JjssDriveResult<T>>): Promise<T> {
    const result = await pending;
    if (result && result.ok) return result.value;
    const error = result && !result.ok ? result.error : { message: '공유 저장소 요청을 처리하지 못했습니다.', code: 'DRIVE_ERROR' };
    throw new SharedDriveError(error.message, error.code, error.status);
}

/** 동기화 엔진이 쓰는 DriveApi(main 프로세스 IPC) */
export function createDriveClient(bridge: JjssDriveBridge): DriveApi {
    return {
        listRecords: pageToken => unwrap(bridge.listRecords(pageToken)),
        getStartPageToken: () => unwrap(bridge.getStartPageToken()),
        listChanges: pageToken => unwrap(bridge.listChanges(pageToken)),
        getFile: fileId => unwrap(bridge.getFile(fileId)),
        download: async fileId => new Uint8Array(await unwrap(bridge.download(fileId))),
        upload: input => unwrap(bridge.upload({ ...input, folder: input.folder as FolderKey })),
        setProperties: (fileId, properties) => unwrap(bridge.setProperties(fileId, properties)),
        findMeta: name => unwrap(bridge.findMeta(name)),
    };
}

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
