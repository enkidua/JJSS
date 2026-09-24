export type JjssFileCategory =
    | 'backup'
    | 'rehab-plan'
    | 'vocational-evaluation'
    | 'case-management'
    | 'budget'
    | 'minutes'
    | 'utility'
    | 'image'
    | 'other';

export type JjssFolderKey = 'root' | 'documents' | JjssFileCategory;

export interface JjssPaths {
    root: string;
    appData: string;
    backup: string;
    documents: string;
    categories: Record<JjssFileCategory, string>;
}

export interface JjssSaveResult {
    canceled: boolean;
    filePath?: string;
    openToken?: string;
    category?: JjssFileCategory;
    error?: 'invalid-extension' | string;
    browserFallback?: boolean;
}

export interface LegacyImportPreview {
    canceled: boolean;
    error?: string;
    token?: string;
    sourceFolder?: string;
    includeSubfolders?: boolean;
    total?: number;
    /** 최대 개수(maxFiles)에 도달해 목록이 잘렸는지 */
    truncated?: boolean;
    maxFiles?: number;
    /** 읽을 수 없어 건너뛴 하위 폴더·파일 수 */
    skippedDirectories?: number;
    skippedFiles?: number;
    summary?: Partial<Record<JjssFileCategory, number>>;
    files?: Array<{ name: string; category: JjssFileCategory; size: number; relativePath?: string }>;
}

export interface LegacyImportResultItem {
    name: string;
    category: JjssFileCategory;
    /** 성공한 파일: 저장된 파일 이름과 원본 삭제 여부 */
    savedName?: string;
    sourceDeleted?: boolean;
    relativePath?: string;
    /** 실패한 파일: 실패 표시와 사유 */
    failed?: boolean;
    reason?: string;
    /** 성공했지만 알릴 내용(예: 이동 모드에서 원본을 지우지 못함) */
    warning?: string;
}

export interface LegacyImportResult {
    /** 지금까지(재시도 포함) 가져온 파일 수 */
    imported: number;
    /** 이번 시도에서 실패한 파일 수 */
    failed?: number;
    /** 같은 token으로 실패한 파일만 다시 시도할 수 있는지 */
    retryAvailable?: boolean;
    mode: 'copy' | 'move';
    results: LegacyImportResultItem[];
}

export interface JjssFilesApi {
    getPaths(): Promise<JjssPaths>;
    saveFile(input: { category: JjssFileCategory; fileName: string; data: Uint8Array }): Promise<JjssSaveResult>;
    savePdf(input: { category: JjssFileCategory; fileName: string; html: string }): Promise<JjssSaveResult>;
    openFolder(folderKey: JjssFolderKey): Promise<{ opened: boolean }>;
    openSavedDirectory(openToken: string): Promise<{ opened: boolean }>;
    chooseImportFolder(input?: { includeSubfolders?: boolean }): Promise<LegacyImportPreview>;
    importLegacyDocuments(input: { token: string; mode: 'copy' | 'move' }): Promise<LegacyImportResult>;
}

declare global {
    interface Window {
        jjssFiles?: JjssFilesApi;
    }
}
