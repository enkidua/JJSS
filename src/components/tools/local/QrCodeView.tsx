import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, QrCode, ShieldCheck } from 'lucide-react';
import { ToolPageShell } from '../ToolPageShell';
import { useReportDirty } from '../useReportDirty';
import { CopyButton } from '../../common/CopyButton';
import { useAppToast } from '../../Toast';
import { saveJjssBlob, savedLocationMessage } from '../../../utils/jjssFileService';
import { buildQrMatrix, drawQrToCanvas, normalizeQrText, qrMatrixToSvg, type QrErrorLevel } from '../../../features/tools/qrCode';
import { safeBaseName } from '../../../features/tools/pdfTools';

interface LocalToolProps {
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

const LEVELS: Array<{ id: QrErrorLevel; label: string }> = [
    { id: 'M', label: '보통(권장)' },
    { id: 'Q', label: '높음(인쇄물이 구겨지거나 가려질 때)' },
    { id: 'H', label: '가장 높음' },
    { id: 'L', label: '낮음(긴 글을 담을 때)' },
];

/** QR 코드 만들기: 링크나 글을 QR로 바꿔 PNG로 저장한다. 이 PC 안에서만 만든다. */
export function QrCodeView({ onBack, onDirtyChange }: LocalToolProps) {
    const showToast = useAppToast();
    const [text, setText] = useState('');
    const [caption, setCaption] = useState('');
    const [level, setLevel] = useState<QrErrorLevel>('M');
    const [saving, setSaving] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useReportDirty(Boolean(text.trim()), onDirtyChange);

    const value = normalizeQrText(text);
    const { matrix, error } = useMemo(() => {
        if (!value) return { matrix: null, error: '' };
        try {
            return { matrix: buildQrMatrix(value, level), error: '' };
        } catch (caught) {
            return { matrix: null, error: caught instanceof Error ? caught.message : 'QR 코드를 만들지 못했습니다.' };
        }
    }, [value, level]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !matrix) return;
        try {
            drawQrToCanvas(canvas, matrix, { pixelSize: 320 });
        } catch {
            // 미리보기를 그리지 못해도 저장은 따로 시도한다.
        }
    }, [matrix]);

    const savePng = async () => {
        if (!matrix || saving) return;
        setSaving(true);
        try {
            // 저장용은 인쇄해도 선명하게 크게 그리고, 설명 글이 있으면 아래에 넣는다.
            const qrCanvas = document.createElement('canvas');
            drawQrToCanvas(qrCanvas, matrix, { pixelSize: 1024 });
            const label = caption.trim();
            const output = document.createElement('canvas');
            const captionHeight = label ? 120 : 0;
            output.width = qrCanvas.width;
            output.height = qrCanvas.height + captionHeight;
            const context = output.getContext('2d');
            if (!context) throw new Error('QR 코드를 그리지 못했습니다.');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, output.width, output.height);
            context.drawImage(qrCanvas, 0, 0);
            if (label) {
                context.fillStyle = '#000000';
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                let fontSize = 56;
                do {
                    context.font = `700 ${fontSize}px "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
                    fontSize -= 4;
                } while (context.measureText(label).width > output.width - 80 && fontSize > 20);
                context.fillText(label, output.width / 2, qrCanvas.height + captionHeight / 2 - 10);
            }
            const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('QR 코드 이미지를 만들지 못했습니다.');
            const result = await saveJjssBlob('image', `QR_${safeBaseName(label || 'code', 'code')}.png`, blob);
            showToast(savedLocationMessage(result), result.canceled ? 'info' : 'success');
        } catch (caught) {
            showToast(caught instanceof Error && caught.message ? caught.message : 'QR 코드를 저장하지 못했습니다.', 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <ToolPageShell
            onBack={onBack}
            className="w-full max-w-4xl mx-auto"
            title="QR 코드 만들기"
            description="설문·신청서·안내 링크를 QR 코드로 바꿔 홍보물과 안내문에 넣습니다"
            icon={QrCode}
            iconGradient="from-slate-500 to-slate-700"
        >
            <div className="glass-strong rounded-2xl p-6 border border-white/10">
                <p className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-50/90">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>QR 코드는 이 PC 안에서 만듭니다. 입력한 링크와 글을 어디에도 보내지 않습니다. 이름·연락처 같은 개인정보는 QR 코드에 직접 넣지 마세요(QR을 찍으면 누구나 읽을 수 있습니다).</span>
                </p>
                <div className="grid gap-6 md:grid-cols-[1fr_340px]">
                    <div className="space-y-4">
                        <label className="block text-sm font-medium text-white/70">
                            링크 또는 글
                            <textarea
                                className="input-field mt-1.5 min-h-[120px]"
                                rows={4}
                                placeholder="예: https://forms.gle/…  (설문·신청서·지도 링크 등)"
                                value={text}
                                onChange={event => setText(event.target.value)}
                                aria-describedby="qr-help"
                            />
                            <span id="qr-help" className={`mt-1 block text-xs ${error ? 'text-rose-300' : 'text-white/45'}`} role={error ? 'alert' : undefined}>
                                {error || 'www.로 시작하면 https://를 붙여 줍니다. 링크가 길수록 무늬가 촘촘해지니, 긴 링크는 짧게 줄여 넣으면 잘 읽힙니다.'}
                            </span>
                        </label>
                        <label className="block text-sm font-medium text-white/70">
                            QR 아래에 넣을 설명 (선택)
                            <input className="input-field mt-1.5" maxLength={40} placeholder="예: 만족도 조사 참여하기" value={caption} onChange={event => setCaption(event.target.value)} />
                        </label>
                        <label className="block text-sm font-medium text-white/70">
                            오류 복원 수준
                            <select className="input-field mt-1.5" value={level} onChange={event => setLevel(event.target.value as QrErrorLevel)}>
                                {LEVELS.map(item => <option key={item.id} value={item.id} className="bg-slate-900">{item.label}</option>)}
                            </select>
                        </label>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                        <div className="flex h-[340px] w-full max-w-[340px] items-center justify-center rounded-2xl border border-white/10 bg-white p-2" data-testid="qr-preview" data-ready={matrix ? 'true' : 'false'}>
                            {matrix
                                ? <canvas ref={canvasRef} role="img" aria-label="만든 QR 코드 미리보기" className="h-auto max-h-full w-auto max-w-full" />
                                : <p className="px-6 text-center text-sm text-slate-500">링크나 글을 입력하면 여기에 QR 코드가 나타납니다.</p>}
                        </div>
                        {caption.trim() && matrix && <p className="text-center text-sm font-bold text-white/80">{caption.trim()}</p>}
                        <div className="flex flex-wrap justify-center gap-2">
                            <button type="button" onClick={() => void savePng()} disabled={!matrix || saving} className="btn-primary inline-flex items-center gap-2 px-5! py-2.5! disabled:opacity-50">
                                <Download className="h-4 w-4" /> {saving ? '저장 중…' : 'PNG로 저장'}
                            </button>
                            {matrix && <CopyButton text={qrMatrixToSvg(matrix)} label="SVG 복사" />}
                        </div>
                        <p className="text-center text-xs text-white/40">인쇄 전 휴대폰 카메라로 한 번 찍어 확인해 보세요.</p>
                    </div>
                </div>
            </div>
        </ToolPageShell>
    );
}

export default QrCodeView;
