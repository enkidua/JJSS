import { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, RefreshCw, X } from 'lucide-react';
import { useAppUpdates } from '../hooks/useAppUpdates';

const DISMISS_KEY = 'jjss:update-dismissed-version';

function readDismissed(): string {
    try {
        return sessionStorage.getItem(DISMISS_KEY) || '';
    } catch {
        return '';
    }
}

/**
 * 화면 아래 업데이트 알림. 새 버전이 있을 때만 보인다.
 * - "나중에"를 누르면 이번 실행 동안 같은 버전은 다시 띄우지 않는다.
 * - 설치는 "지금 다시 시작"을 누를 때만(저장하지 않은 내용이 있으면 기존 종료 확인창이 먼저 뜬다).
 * - macOS(서명·공증 전)는 내려받기 페이지만 연다.
 */
export default function UpdateNotice() {
    const { available, status, busy, run } = useAppUpdates();
    const [dismissed, setDismissed] = useState(readDismissed);

    useEffect(() => {
        try {
            if (dismissed) sessionStorage.setItem(DISMISS_KEY, dismissed);
        } catch {
            // 다시 띄워도 기능에는 문제없다.
        }
    }, [dismissed]);

    if (!available || !status) return null;
    const { phase, availableVersion, percent, manualOnly, message } = status;
    const visible = phase === 'downloading' || phase === 'downloaded' || phase === 'installing'
        || (phase === 'available' && dismissed !== availableVersion);
    if (!visible) return null;

    return (
        <div role="status" aria-live="polite" data-testid="update-notice" className="fixed bottom-4 left-4 z-9997 w-[min(92vw,26rem)] rounded-2xl border border-primary-400/30 bg-slate-950/95 p-4 text-sm text-white shadow-2xl backdrop-blur-xl">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/20">
                    {phase === 'downloading' || phase === 'installing'
                        ? <Loader2 className="h-4 w-4 animate-spin text-primary-200" />
                        : <Download className="h-4 w-4 text-primary-200" />}
                </div>
                <div className="flex-1">
                    {phase === 'available' && (
                        <>
                            <p className="font-semibold">새 버전 {availableVersion}이 있습니다.</p>
                            <p className="mt-1 text-xs text-white/60">
                                {manualOnly
                                    ? '이 Mac에서는 자동 설치를 지원하지 않습니다. 내려받기 페이지에서 새 DMG를 받아 설치해 주세요. 저장된 자료는 그대로 남습니다.'
                                    : '지금 받아 두면 다음에 다시 시작할 때 설치됩니다. 저장된 자료는 그대로 남고, 설치 직전에 이 PC에 사본도 만듭니다.'}
                            </p>
                            {message && <p className="mt-1 text-xs text-amber-200">{message}</p>}
                            <div className="mt-3 flex flex-wrap gap-2">
                                {manualOnly ? (
                                    <button type="button" disabled={busy} onClick={() => void run('openDownloadPage')} className="btn-primary px-3! py-1.5! text-xs inline-flex items-center gap-1.5">
                                        <ExternalLink className="h-3.5 w-3.5" /> 내려받기 페이지 열기
                                    </button>
                                ) : (
                                    <button type="button" disabled={busy} onClick={() => void run('download')} className="btn-primary px-3! py-1.5! text-xs">
                                        지금 받기
                                    </button>
                                )}
                                <button type="button" onClick={() => setDismissed(availableVersion)} className="btn-ghost px-3! py-1.5! text-xs">나중에</button>
                            </div>
                        </>
                    )}
                    {phase === 'downloading' && (
                        <>
                            <p className="font-semibold">새 버전 {availableVersion}을 받는 중입니다.</p>
                            <div className="mt-2 h-1.5 w-full rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? 0} aria-label="업데이트 내려받기 진행률">
                                <div className="h-1.5 rounded-full bg-primary-400 transition-all" style={{ width: `${percent ?? 0}%` }} />
                            </div>
                            <p className="mt-1 text-xs text-white/50">{percent ?? 0}% · 계속 작업해도 됩니다.</p>
                        </>
                    )}
                    {phase === 'downloaded' && (
                        <>
                            <p className="font-semibold">새 버전 {availableVersion}을 설치할 준비가 됐습니다.</p>
                            <p className="mt-1 text-xs text-white/60">다시 시작하면 설치됩니다. 지금 하지 않으면 JJSS를 끌 때 설치됩니다.</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" disabled={busy} onClick={() => void run('install')} className="btn-primary px-3! py-1.5! text-xs inline-flex items-center gap-1.5">
                                    <RefreshCw className="h-3.5 w-3.5" /> 지금 다시 시작
                                </button>
                            </div>
                        </>
                    )}
                    {phase === 'installing' && <p className="font-semibold">설치를 위해 종료하는 중입니다…</p>}
                </div>
                {phase === 'available' && (
                    <button type="button" aria-label="업데이트 알림 닫기" onClick={() => setDismissed(availableVersion)} className="text-white/40 hover:text-white/80">
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
