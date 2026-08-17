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
    summary?: Partial<Record<JjssFileCategory, number>>;
    files?: Array<{ name: string; category: JjssFileCategory; size: number; relativePath?: string }>;
}

export interface LegacyImportResult {
    imported: number;
    mode: 'copy' | 'move';
    results: Array<{ name: string; savedName: string; category: JjssFileCategory; sourceDeleted: boolean }>;
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
