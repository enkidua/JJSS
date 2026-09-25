import { useEffect, useState } from 'react';
import { CheckCircle2, FolderOpen, X } from 'lucide-react';
import { JJSS_FILE_SAVED_EVENT, openSavedDirectory } from '../utils/jjssFileService';
import type { JjssFileCategory } from '../types/jjssFiles';
import { useAppToast } from './Toast';

interface SavedFileDetail {
    category: JjssFileCategory;
    fileName: string;
    filePath?: string;
    openToken?: string;
    browserFallback?: boolean;
}

export default function JjssFileSaveNotice() {
    const [saved, setSaved] = useState<SavedFileDetail | null>(null);
    const showToast = useAppToast();

    useEffect(() => {
        let timeoutId: number | undefined;
        const onSaved = (event: Event) => {
            setSaved((event as CustomEvent<SavedFileDetail>).detail);
            if (timeoutId) window.clearTimeout(timeoutId);
            timeoutId = window.setTimeout(() => setSaved(null), 12_000);
        };
        window.addEventListener(JJSS_FILE_SAVED_EVENT, onSaved);
        return () => {
            window.removeEventListener(JJSS_FILE_SAVED_EVENT, onSaved);
            if (timeoutId) window.clearTimeout(timeoutId);
        };
    }, []);

    if (!saved) return null;
    return (
        <div role="status" aria-atomic="true" className="pointer-events-auto w-full rounded-2xl border border-emerald-400/30 bg-[#11162b]/95 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div className="min-w-0 flex-1">
                    <p className="font-bold text-white">{saved.browserFallback ? '다운로드 시작' : '저장 완료'}</p>
                    <p className="mt-1 break-all text-xs leading-relaxed text-white/60">{saved.filePath || saved.fileName}</p>
                    {saved.category !== 'backup' && (
                        // 내보낸 문서(PDF·DOCX·PNG·CSV 등)는 암호화되지 않은 일반 파일이다.
                        <p className="mt-2 text-xs leading-relaxed text-amber-200/90">내보낸 문서에는 개인정보가 포함될 수 있습니다. 기관의 보안 폴더 또는 암호화된 저장장소에 보관해 주세요.</p>
                    )}
                    {saved.filePath && saved.openToken && (
                        <button
                            type="button"
                            onClick={() => void openSavedDirectory(saved.openToken!).catch(() => {
                                showToast('실제 저장된 파일의 폴더를 열지 못했습니다. 파일이 이동되었는지 확인해 주세요.', 'error');
                            })}
                            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25"
                        >
                            <FolderOpen className="h-4 w-4" /> 폴더 열기
                        </button>
                    )}
                </div>
                <button type="button" aria-label="저장 알림 닫기" onClick={() => setSaved(null)} className="rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white">
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
