import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser, FileSignature, PenLine, Printer, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { ToolPageShell } from '../ToolPageShell';
import { useReportDirty } from '../useReportDirty';
import { useAppToast } from '../../Toast';
import { useConfirm } from '../../common/ConfirmProvider';
import { useDialogFocus } from '../../../hooks/useDialogFocus';
import { saveJjssPdf, savedLocationMessage } from '../../../utils/jjssFileService';
import { localDateKey } from '../../../utils/date';
import { buildSignSheetHtml, parseSignSheetRows, type SignSheetRow } from '../../../features/tools/signSheet';
import { safeBaseName } from '../../../features/tools/pdfTools';
import { useTrainingRoster } from './useRoster';

interface LocalToolProps {
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

interface Row extends SignSheetRow {
    id: string;
}

let nextRowId = 1;
const newRowId = () => `sign-row-${nextRowId++}`;

const PAD_WIDTH = 640;
const PAD_HEIGHT = 240;

/** 서명 입력창: 마우스·터치·펜으로 서명을 받는다. 확인을 누르면 PNG(data URL)로 돌려준다. */
function SignaturePad({ name, onDone, onCancel }: { name: string; onDone: (dataUrl: string) => void; onCancel: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const lastRef = useRef<{ x: number; y: number } | null>(null);
    const [hasInk, setHasInk] = useState(false);
    const dialogRef = useDialogFocus(true, onCancel);

    const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current!;
        const bounds = canvas.getBoundingClientRect();
        return { x: ((event.clientX - bounds.left) / bounds.width) * canvas.width, y: ((event.clientY - bounds.top) / bounds.height) * canvas.height };
    };
    const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        event.preventDefault();
        canvasRef.current?.setPointerCapture?.(event.pointerId);
        drawingRef.current = true;
        lastRef.current = point(event);
    };
    const moveTo = (event: ReactPointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current) return;
        const context = canvasRef.current?.getContext('2d');
        const last = lastRef.current;
        if (!context || !last) return;
        const next = point(event);
        context.strokeStyle = '#111111';
        context.lineWidth = 4;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        context.moveTo(last.x, last.y);
        context.lineTo(next.x, next.y);
        context.stroke();
        lastRef.current = next;
        setHasInk(true);
    };
    const end = () => {
        drawingRef.current = false;
        lastRef.current = null;
    };
    const clear = () => {
        const canvas = canvasRef.current;
        canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
        setHasInk(false);
    };
    const confirm = () => {
        const canvas = canvasRef.current;
        if (!canvas || !hasInk) return;
        onDone(canvas.toDataURL('image/png'));
    };

    return (
        <div className="fixed inset-0 z-110 flex items-center justify-center bg-black/70 p-4">
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="sign-pad-title" tabIndex={-1} className="glass-card w-full max-w-2xl p-6! focus:outline-hidden">
                <h3 id="sign-pad-title" className="text-lg font-bold text-white">{name || '참석자'} 님 서명</h3>
                <p className="mt-1 text-xs text-white/50">아래 흰 칸에 마우스·손가락·펜으로 서명해 주세요.</p>
                <canvas
                    ref={canvasRef}
                    width={PAD_WIDTH}
                    height={PAD_HEIGHT}
                    data-testid="signature-pad"
                    aria-label="서명 칸"
                    className="mt-4 w-full touch-none rounded-xl border-2 border-dashed border-slate-400 bg-white"
                    style={{ aspectRatio: `${PAD_WIDTH} / ${PAD_HEIGHT}` }}
                    onPointerDown={start}
                    onPointerMove={moveTo}
                    onPointerUp={end}
                    onPointerCancel={end}
                    onPointerLeave={end}
                />
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={clear} disabled={!hasInk} className="btn-ghost inline-flex items-center gap-1.5 px-3! py-2! text-sm disabled:opacity-40"><Eraser className="h-4 w-4" /> 다시 쓰기</button>
                    <button type="button" onClick={onCancel} className="btn-secondary px-4! py-2! text-sm">취소</button>
                    <button type="button" onClick={confirm} disabled={!hasInk} className="btn-primary px-5! py-2! text-sm disabled:opacity-50">서명 완료</button>
                </div>
            </div>
        </div>
    );
}

/** 브라우저(개발 실행)에서는 인쇄 창으로 대신한다. 설치형에서는 PDF 저장 창이 뜬다. */
function printInFrame(html: string): boolean {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: '0', opacity: '0', pointerEvents: 'none' });
    document.body.appendChild(frame);
    const frameDocument = frame.contentDocument;
    const frameWindow = frame.contentWindow;
    if (!frameDocument || !frameWindow) {
        frame.remove();
        return false;
    }
    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();
    const cleanup = () => frame.remove();
    frameWindow.addEventListener('afterprint', cleanup, { once: true });
    window.setTimeout(cleanup, 60_000);
    window.setTimeout(() => {
        frameWindow.focus();
        frameWindow.print();
    }, 200);
    return true;
}

/** 서명 등록부: 명단을 넣고 한 화면에서 차례로 서명을 받아 등록부 PDF로 저장한다. 서명은 저장하지 않는다. */
export function SignSheetView({ onBack, onDirtyChange }: LocalToolProps) {
    const showToast = useAppToast();
    const confirm = useConfirm();
    const { rooms } = useTrainingRoster();
    const [title, setTitle] = useState('');
    const [when, setWhen] = useState('');
    const [place, setPlace] = useState('');
    const [host, setHost] = useState('');
    const [rosterText, setRosterText] = useState('');
    const [rows, setRows] = useState<Row[]>([]);
    const [blankRows, setBlankRows] = useState(0);
    const [signingId, setSigningId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const aliveRef = useRef(true);
    useEffect(() => {
        // 개발 실행(StrictMode)에서는 effect가 한 번 정리됐다가 다시 실행된다. 다시 실행될 때 살아 있음으로 되돌린다.
        aliveRef.current = true;
        return () => { aliveRef.current = false; };
    }, []);

    const signedCount = rows.filter(row => row.signature).length;
    useReportDirty(rows.length > 0 || Boolean(rosterText.trim() || title.trim()), onDirtyChange);

    const applyRoster = async () => {
        const parsed = parseSignSheetRows(rosterText);
        if (!parsed.length) {
            showToast('명단을 한 줄에 한 명씩 적어 주세요.', 'info');
            return;
        }
        if (signedCount > 0) {
            const ok = await confirm({
                title: '명단 다시 만들기',
                message: `이미 받은 서명 ${signedCount}건이 지워집니다. 명단을 다시 만들까요?`,
                confirmLabel: '다시 만들기', cancelLabel: '취소', tone: 'danger',
            });
            if (!ok) return;
        }
        setRows(parsed.map(row => ({ ...row, id: newRowId() })));
    };

    const addRow = () => setRows(current => [...current, { id: newRowId(), name: '', affiliation: '' }]);
    const updateRow = (id: string, patch: Partial<SignSheetRow>) => setRows(current => current.map(row => (row.id === id ? { ...row, ...patch } : row)));
    const removeRow = (id: string) => setRows(current => current.filter(row => row.id !== id));

    const savePdf = async () => {
        if (saving) return;
        setSaving(true);
        try {
            const html = buildSignSheetHtml({ title: title.trim() || '참석자 등록부', when: when.trim(), place: place.trim(), host: host.trim() }, rows, { extraBlankRows: blankRows });
            const result = await saveJjssPdf('utility', `${safeBaseName(title, '참석자 등록부')}_${localDateKey()}.pdf`, html);
            if (!aliveRef.current) return;
            if (result) showToast(savedLocationMessage(result), result.canceled ? 'info' : 'success');
            else if (!printInFrame(html)) showToast('인쇄 문서를 준비하지 못했습니다. 받은 서명은 화면에 남아 있습니다.', 'error');
        } catch (caught) {
            if (aliveRef.current) showToast(caught instanceof Error && caught.message ? `${caught.message} 받은 서명은 화면에 남아 있습니다.` : '등록부를 저장하지 못했습니다. 받은 서명은 화면에 남아 있습니다.', 'error');
        } finally {
            if (aliveRef.current) setSaving(false);
        }
    };

    const signingRow = rows.find(row => row.id === signingId) ?? null;

    return (
        <ToolPageShell
            onBack={onBack}
            className="w-full max-w-4xl mx-auto"
            title="서명 등록부"
            description="교육·회의·프로그램 참석자 서명을 한 화면에서 받아 등록부 PDF로 저장합니다"
            icon={FileSignature}
            iconGradient="from-teal-500 to-emerald-600"
        >
            <div className="glass-strong rounded-2xl p-6 border border-white/10 space-y-6">
                <p className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-50/90">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>서명은 이 화면에만 있다가 등록부 PDF에 담깁니다. 프로그램 안에 따로 저장하지 않으며, 화면을 닫으면 사라집니다. PDF로 저장한 뒤 닫아 주세요.</span>
                </p>

                <section aria-label="등록부 정보" className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-white/70 sm:col-span-2">
                        제목
                        <input className="input-field mt-1.5" placeholder="예: 2026년 4분기 직무교육 참석자 등록부" value={title} onChange={event => setTitle(event.target.value)} maxLength={80} />
                    </label>
                    <label className="block text-sm font-medium text-white/70">
                        일시
                        <input className="input-field mt-1.5" placeholder="예: 2026. 11. 16.(월) 14:00~16:00" value={when} onChange={event => setWhen(event.target.value)} maxLength={60} />
                    </label>
                    <label className="block text-sm font-medium text-white/70">
                        장소
                        <input className="input-field mt-1.5" placeholder="예: 3층 교육실" value={place} onChange={event => setPlace(event.target.value)} maxLength={60} />
                    </label>
                    <label className="block text-sm font-medium text-white/70 sm:col-span-2">
                        주관
                        <input className="input-field mt-1.5" placeholder="예: 고용지원팀" value={host} onChange={event => setHost(event.target.value)} maxLength={60} />
                    </label>
                </section>

                <section aria-label="명단" className="space-y-2">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                        <label htmlFor="sign-roster" className="text-sm font-medium text-white/70">명단 붙여 넣기</label>
                        {rooms.length > 0 && (
                            <label className="text-xs text-white/50">
                                <span className="sr-only">훈련실 명단 불러오기</span>
                                <select
                                    className="input-field py-1.5! text-xs"
                                    value=""
                                    onChange={event => {
                                        const room = rooms.find(item => item.id === event.target.value);
                                        if (room) setRosterText(room.trainees.join('\n'));
                                    }}
                                >
                                    <option value="" className="bg-slate-900">직업훈련 훈련실에서 불러오기…</option>
                                    {rooms.map(room => <option key={room.id} value={room.id} className="bg-slate-900">{room.name} ({room.trainees.length}명)</option>)}
                                </select>
                            </label>
                        )}
                    </div>
                    <textarea
                        id="sign-roster"
                        className="input-field min-h-[110px]"
                        rows={4}
                        placeholder={'한 줄에 한 명씩. 소속이 있으면 "소속, 이름"으로 적습니다.\n예: 고용지원팀, 김합성\n      이합성'}
                        value={rosterText}
                        onChange={event => setRosterText(event.target.value)}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => void applyRoster()} className="btn-secondary px-4! py-2! text-sm">명단 만들기</button>
                        <button type="button" onClick={addRow} className="btn-ghost inline-flex items-center gap-1.5 px-3! py-2! text-sm"><UserPlus className="h-4 w-4" /> 한 줄 추가</button>
                        <label className="ml-auto text-xs text-white/55">
                            종이에 적을 빈 줄
                            <input className="input-field ml-2 inline-block w-20 py-1.5! text-xs" type="number" min={0} max={100} value={blankRows} onChange={event => setBlankRows(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} />
                        </label>
                    </div>
                </section>

                {rows.length > 0 && (
                    <section aria-label="서명 받기" className="space-y-2">
                        <p className="text-sm text-white/70">서명 <b className="text-white">{signedCount}</b> / {rows.length}명</p>
                        <ul className="space-y-2">
                            {rows.map((row, index) => (
                                <li key={row.id} data-testid="sign-row" className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                                    <span className="w-6 text-center text-xs text-white/40">{index + 1}</span>
                                    <input className="input-field w-32 py-1.5! text-sm" aria-label={`${index + 1}번 소속`} placeholder="소속" value={row.affiliation} onChange={event => updateRow(row.id, { affiliation: event.target.value })} maxLength={30} />
                                    <input className="input-field min-w-0 flex-1 py-1.5! text-sm" aria-label={`${index + 1}번 성명`} placeholder="성명" value={row.name} onChange={event => updateRow(row.id, { name: event.target.value })} maxLength={30} />
                                    {row.signature
                                        ? <img src={row.signature} alt={`${row.name || `${index + 1}번`} 서명`} className="h-9 w-28 rounded-md bg-white object-contain" />
                                        : <span className="w-28 text-center text-xs text-white/35">서명 전</span>}
                                    <button type="button" onClick={() => setSigningId(row.id)} className="btn-secondary inline-flex items-center gap-1.5 px-3! py-1.5! text-xs">
                                        <PenLine className="h-3.5 w-3.5" /> {row.signature ? '다시 서명' : '서명'}
                                    </button>
                                    <button type="button" onClick={() => removeRow(row.id)} aria-label={`${row.name || `${index + 1}번`} 줄 지우기`} className="rounded-lg p-1.5 text-white/45 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                <button type="button" onClick={() => void savePdf()} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2 py-3.5! disabled:opacity-50">
                    <Printer className="h-5 w-5" /> {saving ? '만드는 중…' : rows.length ? '등록부 PDF로 저장' : '빈 등록부 PDF로 저장(종이 서명용)'}
                </button>
            </div>

            {signingRow && (
                <SignaturePad
                    name={signingRow.name}
                    onCancel={() => setSigningId(null)}
                    onDone={dataUrl => {
                        updateRow(signingRow.id, { signature: dataUrl });
                        setSigningId(null);
                    }}
                />
            )}
        </ToolPageShell>
    );
}

export default SignSheetView;
