import { motion } from 'framer-motion';
import { Download, ExternalLink, RefreshCw } from 'lucide-react';
import { useAppUpdates } from '../../hooks/useAppUpdates';

function formatTime(iso: string): string {
    const date = new Date(iso);
    if (!iso || Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const PHASE_TEXT: Record<string, string> = {
    disabled: '개발 실행에서는 업데이트를 확인하지 않습니다.',
    idle: '아직 확인하지 않았습니다. 앱을 켜고 잠시 뒤, 그리고 6시간마다 자동으로 확인합니다.',
    checking: '업데이트를 확인하는 중입니다…',
    'up-to-date': '최신 버전을 쓰고 있습니다.',
    available: '새 버전이 있습니다.',
    downloading: '새 버전을 받는 중입니다.',
    downloaded: '새 버전을 설치할 준비가 됐습니다. 다시 시작하면 설치됩니다.',
    installing: '설치를 위해 종료하는 중입니다.',
    error: '업데이트를 확인하지 못했습니다.',
};

/** 설정 "업데이트" 섹션: 현재 버전, 마지막 확인, 지금 확인·받기·설치 */
export default function UpdateSection() {
    const { available, status, busy, run } = useAppUpdates();
    if (!available) return null;
    const phase = status?.phase ?? 'idle';
    return (
        <motion.section
            id="app-update"
            tabIndex={-1}
            aria-labelledby="app-update-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6! mt-8 scroll-mt-40"
        >
            <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-linear-to-br from-sky-500 to-indigo-600 flex items-center justify-center">
                    <Download className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h3 id="app-update-title" className="text-white font-bold">업데이트</h3>
                    <p className="text-white/40 text-xs">현재 버전 {status?.currentVersion || '—'}</p>
                </div>
            </div>
            <p data-testid="update-phase" data-phase={phase} className="text-sm text-white/75">
                {phase === 'available' || phase === 'downloading' || phase === 'downloaded'
                    ? `${PHASE_TEXT[phase]} (${status?.availableVersion})`
                    : PHASE_TEXT[phase] || ''}
                {phase === 'downloading' && status?.percent !== null ? ` ${status?.percent}%` : ''}
            </p>
            {status?.message && <p className="mt-1 text-xs text-amber-200">{status.message}</p>}
            {status?.lastCheckedAt && <p className="mt-1 text-xs text-white/40">마지막 확인: {formatTime(status.lastCheckedAt)}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy || phase === 'checking' || phase === 'disabled'} onClick={() => void run('check')} className="btn-secondary px-3! py-2! text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                    <RefreshCw className="h-3.5 w-3.5" /> 지금 확인
                </button>
                {phase === 'available' && !status?.manualOnly && (
                    <button type="button" disabled={busy} onClick={() => void run('download')} className="btn-primary px-3! py-2! text-xs">새 버전 받기</button>
                )}
                {phase === 'available' && status?.manualOnly && (
                    <button type="button" disabled={busy} onClick={() => void run('openDownloadPage')} className="btn-primary px-3! py-2! text-xs inline-flex items-center gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5" /> 내려받기 페이지 열기
                    </button>
                )}
                {phase === 'downloaded' && (
                    <button type="button" disabled={busy} onClick={() => void run('install')} className="btn-primary px-3! py-2! text-xs">지금 다시 시작해 설치</button>
                )}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-white/45">
                업데이트 확인은 GitHub에 지금 버전과 운영체제만 보냅니다. 업무 자료와 API 키는 보내지 않습니다.
                {status?.manualOnly
                    ? ' 이 Mac에서는 Apple 개발자 서명 전까지 자동 설치를 하지 않고 내려받기 페이지를 안내합니다.'
                    : ' 내려받은 설치파일은 지금 앱과 같은 서명(JJSS)이어야 설치되며, 설치 직전에 이 PC의 저장소 사본을 만듭니다.'}
            </p>
        </motion.section>
    );
}
