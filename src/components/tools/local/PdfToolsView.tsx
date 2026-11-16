import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileStack, Images, Loader2, RotateCw, Scissors, ShieldCheck, Trash2 } from 'lucide-react';
import { ToolPageShell } from '../ToolPageShell';
import { useReportDirty } from '../useReportDirty';
import { FileDropZone } from '../../common/FileDropZone';
import { useAppToast } from '../../Toast';
import { saveJjssBlob, savedLocationMessage } from '../../../utils/jjssFileService';
import { parsePageRanges, describePages } from '../../../features/tools/pageRanges';
import {
    MAX_PDF_INPUT_BYTES, countPdfPages, extractPdfPages, imagesToPdf, mergePdfs, safeBaseName,
    type PageRotation, type PdfImage,
} from '../../../features/tools/pdfTools';

interface LocalToolProps {
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

type Mode = 'merge' | 'extract' | 'images';

interface PickedFile {
    id: string;
    file: File;
    /** PDF 쪽수(읽는 중이면 null, 읽지 못하면 오류 글) */
    pages: number | null;
    error?: string;
}

const MODES: Array<{ id: Mode; label: string; icon: typeof FileStack; description: string }> = [
    { id: 'merge', label: 'PDF 합치기', icon: FileStack, description: '여러 PDF를 넣은 순서대로 하나로 합칩니다.' },
    { id: 'extract', label: '쪽 뽑기·돌리기', icon: Scissors, description: 'PDF에서 필요한 쪽만 새 파일로 저장합니다. 쪽을 돌릴 수도 있습니다.' },
    { id: 'images', label: '사진 → PDF', icon: Images, description: '사진·스캔 이미지 여러 장을 한 PDF로 묶습니다(한 장에 한 쪽).' },
];

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/bmp,image/gif';
const MAX_IMAGE_SIDE = 2400;

let nextId = 1;
const newId = () => `local-file-${nextId++}`;

const isPdf = (file: File) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
const isImage = (file: File) => /^image\/(png|jpeg|webp|bmp|gif)$/.test(file.type);
const formatSize = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`);

/** 사진을 JPEG로 바꾼다(휴대폰 사진의 방향을 바로잡고, 너무 큰 사진은 줄여 PDF가 지나치게 커지지 않게). */
async function imageToJpeg(file: File): Promise<PdfImage> {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas');
        // 투명한 PNG가 검게 나오지 않게 흰 바탕을 먼저 칠한다.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
        if (!blob) throw new Error('encode');
        return { bytes: new Uint8Array(await blob.arrayBuffer()), type: 'image/jpeg' };
    } finally {
        bitmap.close();
    }
}

/** PDF·이미지 도구: 합치기, 쪽 뽑기·돌리기, 사진을 PDF로. 모두 이 PC 안에서 처리한다. */
export function PdfToolsView({ onBack, onDirtyChange }: LocalToolProps) {
    const showToast = useAppToast();
    const [mode, setMode] = useState<Mode>('merge');
    const [files, setFiles] = useState<PickedFile[]>([]);
    const [ranges, setRanges] = useState('');
    const [rotation, setRotation] = useState<PageRotation>(0);
    const [imagePage, setImagePage] = useState<'a4' | 'fit'>('a4');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const aliveRef = useRef(true);
    useEffect(() => {
        // 개발 실행(StrictMode)에서는 effect가 한 번 정리됐다가 다시 실행된다. 다시 실행될 때 살아 있음으로 되돌린다.
        aliveRef.current = true;
        return () => { aliveRef.current = false; };
    }, []);

    useReportDirty(files.length > 0 || busy, onDirtyChange);

    const switchMode = (next: Mode) => {
        if (busy || next === mode) return;
        setMode(next);
        setFiles([]);
        setRanges('');
        setRotation(0);
        setError('');
    };

    const addFiles = (incoming: File[]) => {
        setError('');
        const accepted = incoming.filter(file => (mode === 'images' ? isImage(file) : isPdf(file)));
        if (accepted.length < incoming.length) {
            setError(mode === 'images' ? 'PNG·JPG·WEBP·BMP·GIF 이미지만 넣을 수 있습니다.' : 'PDF 파일만 넣을 수 있습니다.');
        }
        const base = mode === 'extract' ? [] : files;
        const picked = (mode === 'extract' ? accepted.slice(0, 1) : accepted).map(file => ({ id: newId(), file, pages: mode === 'images' ? 1 : null as number | null }));
        const total = [...base, ...picked].reduce((sum, item) => sum + item.file.size, 0);
        if (total > MAX_PDF_INPUT_BYTES) {
            setError('한 번에 다룰 수 있는 크기(합계 200MB)를 넘었습니다. 파일을 나누어 넣어 주세요.');
            return;
        }
        setFiles([...base, ...picked]);
        if (mode === 'extract') setRanges('');
        // 쪽수는 넣은 뒤에 읽는다(큰 파일도 목록에 바로 보이게).
        if (mode !== 'images') {
            for (const item of picked) {
                void (async () => {
                    let pages: number | null = null;
                    let message: string | undefined;
                    try {
                        pages = await countPdfPages(new Uint8Array(await item.file.arrayBuffer()), item.file.name);
                    } catch (caught) {
                        message = caught instanceof Error ? caught.message : 'PDF를 읽지 못했습니다.';
                    }
                    if (!aliveRef.current) return;
                    setFiles(current => current.map(entry => (entry.id === item.id ? { ...entry, pages, error: message } : entry)));
                })();
            }
        }
    };

    const move = (index: number, delta: number) => {
        setFiles(current => {
            const target = index + delta;
            if (target < 0 || target >= current.length) return current;
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const save = async (bytes: Uint8Array, fileName: string) => {
        const result = await saveJjssBlob('utility', fileName, new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
        if (!aliveRef.current) return;
        showToast(savedLocationMessage(result), result.canceled ? 'info' : 'success');
    };

    const run = async () => {
        if (busy) return;
        setError('');
        const broken = files.find(item => item.error);
        if (broken) {
            setError(broken.error || 'PDF를 읽지 못했습니다.');
            return;
        }
        setBusy(true);
        try {
            if (mode === 'merge') {
                if (files.length < 2) throw new Error('합칠 PDF를 두 개 이상 넣어 주세요.');
                const inputs = await Promise.all(files.map(async item => ({ name: item.file.name, bytes: new Uint8Array(await item.file.arrayBuffer()) })));
                await save(await mergePdfs(inputs), `${safeBaseName(files[0].file.name)}_합본.pdf`);
            } else if (mode === 'extract') {
                const source = files[0];
                if (!source) throw new Error('PDF 파일을 먼저 넣어 주세요.');
                if (!source.pages) throw new Error('PDF 쪽수를 읽는 중입니다. 잠시 후 다시 눌러 주세요.');
                const pages = parsePageRanges(ranges.trim() || `1-${source.pages}`, source.pages);
                const bytes = await extractPdfPages(new Uint8Array(await source.file.arrayBuffer()), pages, { rotation, fileLabel: source.file.name });
                const suffix = ranges.trim() ? `_${describePages(pages).replace(/[, ]+/g, '_').slice(0, 40)}쪽` : '_돌림';
                await save(bytes, `${safeBaseName(source.file.name)}${suffix}.pdf`);
            } else {
                if (!files.length) throw new Error('PDF로 만들 사진을 넣어 주세요.');
                const images: PdfImage[] = [];
                for (const [index, item] of files.entries()) {
                    try {
                        images.push(await imageToJpeg(item.file));
                    } catch {
                        throw new Error(`${index + 1}번째 사진(${item.file.name})을 읽지 못했습니다. 다른 형식으로 저장한 뒤 다시 넣어 주세요.`);
                    }
                }
                await save(await imagesToPdf(images, { page: imagePage }), `${safeBaseName(files[0].file.name)}_묶음.pdf`);
            }
        } catch (caught) {
            if (aliveRef.current) setError(caught instanceof Error && caught.message ? caught.message : '처리하지 못했습니다. 원본 파일은 그대로입니다.');
        } finally {
            if (aliveRef.current) setBusy(false);
        }
    };

    const current = MODES.find(item => item.id === mode)!;
    const totalPages = files.reduce((sum, item) => sum + (item.pages ?? 0), 0);
    const extractSource = mode === 'extract' ? files[0] : undefined;
    let rangePreview = '';
    if (extractSource?.pages && ranges.trim()) {
        try {
            rangePreview = `${parsePageRanges(ranges, extractSource.pages).length}쪽을 뽑습니다.`;
        } catch (caught) {
            rangePreview = caught instanceof Error ? caught.message : '';
        }
    }
    const canRun = mode === 'merge' ? files.length >= 2 : files.length >= 1;

    return (
        <ToolPageShell
            onBack={onBack}
            className="w-full max-w-4xl mx-auto"
            title="PDF·이미지 도구"
            description="합치기, 필요한 쪽만 뽑기, 사진을 PDF로 묶기"
            icon={FileStack}
            iconGradient="from-sky-500 to-indigo-600"
        >
            <div className="glass-strong rounded-2xl p-6 border border-white/10 space-y-5">
                <p className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-50/90">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>모든 처리는 이 PC 안에서 합니다. 파일을 인터넷으로 보내지 않으며 API 키도 필요 없습니다. 원본 파일은 바뀌지 않고, 결과는 새 파일로 저장합니다.</span>
                </p>

                <div role="tablist" aria-label="PDF 도구 종류" className="flex flex-wrap gap-2">
                    {MODES.map(item => {
                        const Icon = item.icon;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                role="tab"
                                aria-selected={mode === item.id}
                                disabled={busy}
                                onClick={() => switchMode(item.id)}
                                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${mode === item.id ? 'border-sky-400/50 bg-sky-500/20 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:text-white'}`}
                            >
                                <Icon className="h-4 w-4" /> {item.label}
                            </button>
                        );
                    })}
                </div>
                <p className="text-sm text-white/60">{current.description}</p>

                <FileDropZone
                    accept={mode === 'images' ? IMAGE_ACCEPT : 'application/pdf,.pdf'}
                    multiple={mode !== 'extract'}
                    disabled={busy}
                    onFiles={addFiles}
                    ariaLabel={mode === 'images' ? '사진 파일 선택' : 'PDF 파일 선택'}
                >
                    <p className="text-sm text-white/70">{mode === 'images' ? '사진을 여기에 끌어다 놓거나 눌러서 고르세요' : mode === 'extract' ? 'PDF 한 개를 끌어다 놓거나 눌러서 고르세요' : 'PDF 여러 개를 끌어다 놓거나 눌러서 고르세요'}</p>
                    <p className="mt-1 text-xs text-white/40">{mode === 'images' ? 'PNG·JPG·WEBP·BMP·GIF' : 'PDF'} · 합계 200MB까지</p>
                </FileDropZone>

                {files.length > 0 && (
                    <ul className="space-y-2" aria-label="넣은 파일">
                        {files.map((item, index) => (
                            <li key={item.id} data-testid="local-tool-file" className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm">
                                <span className="w-6 text-center text-xs text-white/40">{index + 1}</span>
                                <span className="min-w-0 flex-1 truncate text-white/85" title={item.file.name}>{item.file.name}</span>
                                <span className={`text-xs ${item.error ? 'text-rose-300' : 'text-white/45'}`}>
                                    {item.error ? '읽지 못함' : mode === 'images' ? formatSize(item.file.size) : item.pages === null ? '쪽수 확인 중…' : `${item.pages}쪽 · ${formatSize(item.file.size)}`}
                                </span>
                                {mode !== 'extract' && (
                                    <>
                                        <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={`${item.file.name} 위로`} className="rounded-lg p-1 text-white/50 hover:text-white disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                                        <button type="button" disabled={busy || index === files.length - 1} onClick={() => move(index, 1)} aria-label={`${item.file.name} 아래로`} className="rounded-lg p-1 text-white/50 hover:text-white disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                                    </>
                                )}
                                <button type="button" disabled={busy} onClick={() => setFiles(list => list.filter(entry => entry.id !== item.id))} aria-label={`${item.file.name} 빼기`} className="rounded-lg p-1 text-white/50 hover:text-rose-300 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                            </li>
                        ))}
                    </ul>
                )}

                {mode === 'merge' && files.length > 0 && (
                    <p className="text-xs text-white/50">위에서 아래 순서로 합칩니다. 화살표로 순서를 바꿀 수 있습니다{totalPages ? ` · 합치면 ${totalPages}쪽` : ''}.</p>
                )}

                {mode === 'extract' && extractSource && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm text-white/70">
                            뽑을 쪽 {extractSource.pages ? <span className="text-white/40">(전체 {extractSource.pages}쪽)</span> : null}
                            <input
                                className="input-field mt-1.5"
                                placeholder="예: 1-3, 5, 8-  (비우면 전체)"
                                value={ranges}
                                onChange={event => setRanges(event.target.value)}
                                disabled={busy}
                                aria-describedby="pdf-range-help"
                            />
                            <span id="pdf-range-help" className="mt-1 block text-xs text-white/45">{rangePreview || '쉼표로 여러 범위를 적습니다. "8-"은 8쪽부터 끝까지, 적은 순서대로 저장됩니다.'}</span>
                        </label>
                        <label className="block text-sm text-white/70">
                            <span className="inline-flex items-center gap-1.5"><RotateCw className="h-3.5 w-3.5" /> 쪽 돌리기</span>
                            <select className="input-field mt-1.5" value={rotation} onChange={event => setRotation(Number(event.target.value) as PageRotation)} disabled={busy}>
                                <option value={0} className="bg-slate-900">돌리지 않음</option>
                                <option value={90} className="bg-slate-900">오른쪽으로 90°</option>
                                <option value={180} className="bg-slate-900">180°(뒤집기)</option>
                                <option value={270} className="bg-slate-900">왼쪽으로 90°</option>
                            </select>
                        </label>
                    </div>
                )}

                {mode === 'images' && files.length > 0 && (
                    <label className="block text-sm text-white/70 sm:max-w-xs">
                        용지
                        <select className="input-field mt-1.5" value={imagePage} onChange={event => setImagePage(event.target.value as 'a4' | 'fit')} disabled={busy}>
                            <option value="a4" className="bg-slate-900">A4에 맞추기(인쇄·결재 첨부용)</option>
                            <option value="fit" className="bg-slate-900">사진 크기 그대로</option>
                        </select>
                    </label>
                )}

                {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

                <button type="button" onClick={() => void run()} disabled={busy || !canRun} className="btn-primary w-full flex items-center justify-center gap-2 py-3.5! disabled:opacity-50">
                    {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> 만드는 중…</> : mode === 'merge' ? '합쳐서 저장' : mode === 'extract' ? '새 PDF로 저장' : 'PDF로 묶어 저장'}
                </button>
            </div>
        </ToolPageShell>
    );
}

export default PdfToolsView;
