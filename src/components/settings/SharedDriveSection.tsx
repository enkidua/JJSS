import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Cloud } from 'lucide-react';
import { getDriveBridge, unwrap } from '../../features/sharedDrive/driveClient';
import SharedDriveSetup from './sharedDrive/SharedDriveSetup';
import SharedDriveStatus from './sharedDrive/SharedDriveStatus';

/**
 * 설정 "공유 저장소(기관 드라이브)" 섹션. 기본은 꺼짐. 데스크톱 앱에서만 보인다.
 * 상태 확인(get-status)은 main 프로세스의 설정 파일만 읽고 구글에 요청하지 않는다.
 */
export default function SharedDriveSection() {
    const bridge = getDriveBridge();
    const [status, setStatus] = useState<JjssDriveStatus | null>(null);
    const [setupOpen, setSetupOpen] = useState(false);

    useEffect(() => {
        if (!bridge) return;
        let active = true;
        unwrap(bridge.getStatus()).then(value => { if (active) setStatus(value); }).catch(() => undefined);
        return () => { active = false; };
    }, [bridge]);

    if (!bridge) return null;
    const enabled = Boolean(status?.enabled);

    return (
        <motion.section
            id="shared-drive"
            tabIndex={-1}
            aria-labelledby="shared-drive-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-6! mt-8 scroll-mt-40"
        >
            <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-sky-600">
                    <Cloud className="h-5 w-5 text-white" />
                </div>
                <div>
                    <h3 id="shared-drive-title" className="font-bold text-white">공유 저장소 (기관 드라이브)</h3>
                    <p className="text-xs text-white/40">사례관리 기록을 기관 공유 드라이브에 암호화해 두고 여러 직원 PC가 함께 씁니다. 선택 기능 · 기본 꺼짐</p>
                </div>
            </div>
            {enabled && status ? (
                <SharedDriveStatus status={status} onStatus={setStatus} />
            ) : setupOpen ? (
                <SharedDriveSetup status={status} onStatus={setStatus} onFinished={() => setSetupOpen(false)} />
            ) : (
                <div className="space-y-3 text-sm text-white/70">
                    <p>꺼져 있습니다. 끈 상태에서는 구글에 아무 요청도 보내지 않고, 모든 자료는 이 PC에만 있습니다.</p>
                    <button type="button" data-testid="shared-drive-start-setup" onClick={() => setSetupOpen(true)} className="btn-primary px-4! py-2! text-sm">공유 저장소 설정하기</button>
                </div>
            )}
        </motion.section>
    );
}
