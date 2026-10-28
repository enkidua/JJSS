import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import { useSharedDriveStore, getSharedDriveController, type SharedDrivePhase } from '../../../features/sharedDrive/controller';
import { bytesToBase64, getDriveBridge, unwrap } from '../../../features/sharedDrive/driveClient';
import { deriveOrgKey, formatOrgKeyCode, generateOrgSecret, parseOrgKeyCode } from '../../../features/sharedDrive/orgKey';
import type { ConflictEntry } from '../../../features/sharedDrive/types';
import type { SeekerDuplicateGroup } from '../../../features/sharedDrive/engine';
import { mergeSeekers } from '../../../features/sharedDrive/mergeSeekers';
import { base64ToBytes } from '../../../features/sharedDrive/driveClient';
import { useDataStore } from '../../../store/dataStore';
import SecurityReportView from './SecurityReportView';

const PHASE_TEXT: Record<SharedDrivePhase, string> = {
    unavailable: '',
    off: '꺼져 있습니다.',
    starting: '연결하는 중…',
    idle: '동기화 중(대기).',
    syncing: '주고받는 중…',
    'paused-restore': '백업 복원 뒤 멈춰 있습니다.',
    'needs-key': '기관 키 코드가 필요합니다.',
    blocked: '보안 점검에서 막혀 멈춰 있습니다.',
    error: '문제가 생겼습니다.',
};

function formatTime(iso: string): string {
    const date = new Date(iso);
    if (!iso || Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function describeRecord(rid: string, value: unknown): string {
    if (!value || typeof value !== 'object') return '삭제됨';
    const record = value as Record<string, unknown>;
    if (rid.startsWith('seekers:')) return [record.name, record.seekerId, record.phone].filter(Boolean).join(' · ') || '이용자';
    const text = String(record.title || record.type || '기록');
    const content = typeof record.content === 'string' ? record.content.replace(/\s+/g, ' ').slice(0, 160) : '';
    return `${text}${content ? ` — ${content}${String(record.content).length > 160 ? '…' : ''}` : ''}`;
}

export default function SharedDriveStatus({ status, onStatus }: { status: JjssDriveStatus; onStatus: (status: JjssDriveStatus) => void }) {
    const view = useSharedDriveStore();
    const controller = getSharedDriveController();
    const bridge = getDriveBridge()!;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [conflicts, setConflicts] = useState<ConflictEntry[]>([]);
    const [quarantined, setQuarantined] = useState<string[]>([]);
    const [duplicates, setDuplicates] = useState<SeekerDuplicateGroup[]>([]);
    const [codeInput, setCodeInput] = useState('');
    const [shownCode, setShownCode] = useState('');
    const [rotation, setRotation] = useState<{ secret: Uint8Array; code: string } | null>(null);

    const reloadLists = useCallback(async () => {
        const engine = controller?.syncEngine;
        if (!engine) return;
        setConflicts(await engine.conflicts().catch(() => []));
        setQuarantined(await engine.quarantined().catch(() => []));
        setDuplicates(await engine.findSeekerDuplicates().catch(() => []));
    }, [controller]);

    useEffect(() => {
        void reloadLists();
    }, [reloadLists, view.conflicts, view.quarantined, view.lastSyncAt, view.phase]);

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await action();
            await controller?.refreshCounts();
            await reloadLists();
        } catch (caught) {
            setError(String((caught as Error)?.message || '처리하지 못했습니다.'));
        } finally {
            setBusy(false);
        }
    };

    const engine = controller?.syncEngine ?? null;

    return (
        <div className="space-y-4 text-sm text-white/75">
            <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div className="rounded-xl bg-white/5 p-2"><dt className="text-white/45">상태</dt><dd data-testid="shared-drive-phase" data-phase={view.phase} className="text-white">{PHASE_TEXT[view.phase]}{view.offline ? ' (인터넷 연결 없음 — 다시 연결되면 이어서 올립니다)' : ''}</dd></div>
                <div className="rounded-xl bg-white/5 p-2"><dt className="text-white/45">계정 · 공유 드라이브</dt><dd className="text-white">{status.accountEmail} · {status.driveName}</dd></div>
                <div className="rounded-xl bg-white/5 p-2"><dt className="text-white/45">마지막 받기</dt><dd className="text-white">{formatTime(view.lastSyncAt)}</dd></div>
                <div className="rounded-xl bg-white/5 p-2"><dt className="text-white/45">올릴 변경 · 충돌 · 격리</dt><dd className="text-white">{view.pending} · {view.conflicts} · {view.quarantined}</dd></div>
            </dl>
            {view.message && <p className="text-xs text-amber-200">{view.message}</p>}
            {view.keyCheckTampered && <p className="text-xs text-rose-200">드라이브의 기관 키 확인 표식이 바뀌었습니다(기관 키 교체 증명 없음). 누군가 드라이브 파일을 고쳤을 수 있으니 관리자에게 알리세요. 동기화는 계속하며 열 수 없는 파일은 받지 않습니다.</p>}
            {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">{error}</p>}
            {notice && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">{notice}</p>}

            <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || view.phase === 'syncing'} onClick={() => void run(async () => { await controller?.syncNow(); })} className="btn-secondary px-3! py-2! text-xs inline-flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> 지금 동기화</button>
                <button type="button" disabled={busy} onClick={() => void run(async () => {
                    const passed = await controller?.checkSecurity(true);
                    if (passed && view.phase === 'blocked') await controller?.start();
                })} className="btn-secondary px-3! py-2! text-xs inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> 보안 다시 점검</button>
                <button type="button" disabled={busy} onClick={() => void run(async () => {
                    controller?.stop();
                    onStatus(await unwrap(bridge.setEnabled(false)));
                    useSharedDriveStore.setState({ phase: 'off', message: '' });
                })} className="btn-secondary px-3! py-2! text-xs">끄기</button>
                <button type="button" disabled={busy} onClick={() => {
                    if (!window.confirm('로그아웃하면 이 PC의 구글 로그인과 기관 키를 지우고 공유 저장소를 끕니다. 이 PC 자료는 그대로입니다. 계속할까요?')) return;
                    void run(async () => {
                        controller?.stop();
                        onStatus(await unwrap(bridge.signOut()));
                        useSharedDriveStore.setState({ phase: 'off', message: '' });
                    });
                }} className="btn-secondary px-3! py-2! text-xs">로그아웃</button>
            </div>

            {view.security && <details className="text-xs"><summary className="cursor-pointer text-white/60">보안 점검 결과</summary><div className="mt-2"><SecurityReportView report={view.security} /></div></details>}

            {view.phase === 'paused-restore' && (
                <div className="space-y-2 rounded-xl border border-amber-300/30 bg-amber-500/10 p-3 text-xs">
                    <p className="text-amber-100">백업을 복원했습니다. 공유 드라이브와 어느 쪽을 기준으로 맞출까요? 어느 쪽이든 먼저 이 PC 자료 사본을 만듭니다.</p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => {
                            if (!window.confirm('이 PC의 복원본으로 공유 드라이브의 같은 기록을 덮습니다. 다른 직원이 그사이 고친 내용도 복원본으로 바뀝니다. 계속할까요?')) return;
                            void run(async () => { await controller?.resolveRestore('local'); setNotice('복원본 기준으로 맞췄습니다.'); });
                        }} className="btn-secondary px-3! py-2! text-xs">이 PC 복원본으로 드라이브 덮기</button>
                        <button type="button" disabled={busy} onClick={() => void run(async () => { await controller?.resolveRestore('drive'); setNotice('드라이브 기준으로 맞췄습니다. 드라이브에 없던 복원본 기록은 지우지 않고 올렸습니다.'); })} className="btn-primary px-3! py-2! text-xs">드라이브 것으로 이 PC 덮기</button>
                    </div>
                </div>
            )}

            {view.phase === 'needs-key' && (
                <form className="space-y-2 rounded-xl border border-sky-300/30 bg-sky-500/10 p-3 text-xs" onSubmit={event => {
                    event.preventDefault();
                    void run(async () => {
                        const secret = await parseOrgKeyCode(codeInput);
                        const key = await deriveOrgKey(secret);
                        if (engine) await engine.adoptKey(key);
                        else if ((await controller?.verifyKey(key)) !== true) throw new Error('입력한 기관 키 코드가 공유 드라이브의 키와 맞지 않습니다.');
                        await unwrap(bridge.setOrgKey(bytesToBase64(secret)));
                        setCodeInput('');
                        await controller?.start();
                        setNotice('새 기관 키로 이어서 동기화합니다.');
                    });
                }}>
                    <p className="text-sky-100">관리자에게 받은 새 기관 키 코드를 넣어 주세요.</p>
                    <input className="input-field w-full font-mono uppercase tracking-wider" value={codeInput} onChange={event => setCodeInput(event.target.value)} autoComplete="off" />
                    <button type="submit" disabled={busy || !codeInput.trim()} className="btn-primary px-3! py-2! text-xs">확인</button>
                </form>
            )}

            {conflicts.length > 0 && (
                <section aria-label="충돌" className="space-y-2">
                    <p className="text-xs font-semibold text-white">다른 PC와 내용이 다른 기록 {conflicts.length}건</p>
                    {conflicts.map(conflict => (
                        <div key={conflict.rid} data-testid="shared-drive-conflict" className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                            <div className="grid gap-2 sm:grid-cols-2">
                                <div><p className="text-white/45">이 PC</p><p className="text-white/85 break-all">{describeRecord(conflict.rid, conflict.local)}</p></div>
                                <div><p className="text-white/45">드라이브({conflict.remoteUpdatedBy || '알 수 없음'}, {formatTime(conflict.remoteUpdatedAt)})</p><p className="text-white/85 break-all">{describeRecord(conflict.rid, conflict.remote)}</p></div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" disabled={busy || !engine} onClick={() => void run(async () => { await engine!.resolveConflict(conflict.rid, 'keep-local'); await controller?.syncNow(); })} className="btn-secondary px-3! py-1.5! text-xs">이 PC 것으로</button>
                                <button type="button" disabled={busy || !engine} onClick={() => void run(async () => { await engine!.resolveConflict(conflict.rid, 'take-remote'); await useDataStore.getState().fetchData(true); })} className="btn-secondary px-3! py-1.5! text-xs">드라이브 것으로</button>
                            </div>
                        </div>
                    ))}
                </section>
            )}

            {quarantined.length > 0 && (
                <section aria-label="격리" className="space-y-2 text-xs">
                    <p className="font-semibold text-white">열지 못해 받지 않은 드라이브 파일 {quarantined.length}건</p>
                    <p className="text-white/55">기관 키로 열리지 않거나 파일 속성이 내용과 맞지 않는 파일입니다(손상 또는 누군가 드라이브에서 직접 고침). 관리자와 확인한 뒤, 이 PC 기록이 맞으면 다시 쓰세요.</p>
                    {quarantined.slice(0, 50).map(rid => (
                        <div key={rid} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
                            <span className="font-mono text-white/70">{rid}</span>
                            <button type="button" disabled={busy || !engine} onClick={() => void run(async () => {
                                const outcome = await engine!.restoreQuarantined(rid);
                                setNotice(outcome === 'restored' ? '이 PC 기록으로 다시 썼습니다.' : '이 PC에 기록이 없어 목록에서만 뺐습니다.');
                            })} className="btn-secondary px-2.5! py-1! text-xs">이 PC 기록으로 다시 쓰기</button>
                        </div>
                    ))}
                </section>
            )}

            {duplicates.length > 0 && (
                <section aria-label="같은 사람으로 보이는 이용자" className="space-y-2 text-xs">
                    <p className="font-semibold text-white">같은 사람으로 보이는 이용자 {duplicates.length}묶음</p>
                    <p className="text-white/55">이름과 관리번호가 같습니다. 같은 사람이면 남길 이용자를 골라 합치세요(다른 이용자의 사례 기록이 옮겨집니다). 다른 사람이면 그대로 두면 됩니다.</p>
                    {duplicates.map(group => (
                        <div key={group.key} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
                            <span className="text-white/85">{group.label}</span>
                            {group.seekerIds.map(id => (
                                <button key={id} type="button" disabled={busy} onClick={() => {
                                    if (!window.confirm(`"${group.label}" ${group.seekerIds.length}명을 하나로 합칩니다. 남길 이용자: ${id.slice(0, 8)}… 계속할까요?`)) return;
                                    void run(async () => {
                                        const merged = await mergeSeekers(id, group.seekerIds);
                                        await useDataStore.getState().fetchData(true);
                                        setNotice(`합쳤습니다: 기록 ${merged.movedDocuments}건 이동, 이용자 ${merged.removedSeekers.length}명 정리${merged.keptBecauseReferenced.length ? `, 다른 기록이 가리키고 있어 남겨 둔 이용자 ${merged.keptBecauseReferenced.length}명` : ''}.`);
                                    });
                                }} className="btn-secondary px-2.5! py-1! text-xs">{id.slice(0, 8)}… 남기고 합치기</button>
                            ))}
                        </div>
                    ))}
                </section>
            )}

            <details className="text-xs">
                <summary className="cursor-pointer text-white/60">관리자: 기관 키</summary>
                <div className="mt-2 space-y-2">
                    <button type="button" disabled={busy} onClick={() => {
                        if (!window.confirm('기관 키 코드를 화면에 표시합니다. 주변에 다른 사람이 없는지 확인하세요.')) return;
                        void run(async () => {
                            const base64 = await unwrap(bridge.getOrgKey());
                            setShownCode(base64 ? await formatOrgKeyCode(base64ToBytes(base64)) : '');
                        });
                    }} className="btn-secondary px-3! py-1.5! text-xs inline-flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> 기관 키 코드 보기</button>
                    {shownCode && <p className="select-all font-mono text-base tracking-wider text-white">{shownCode}</p>}
                    <p className="text-white/50">직원이 퇴사했거나 코드가 새어 나갔으면 기관 키를 바꾸세요. 드라이브의 모든 기록을 새 키로 다시 암호화하고, 다른 PC는 새 코드를 넣어야 이어서 씁니다.</p>
                    {!rotation && (
                        <button type="button" disabled={busy || !engine || view.pending > 0 || view.conflicts > 0} onClick={() => void run(async () => {
                            const secret = generateOrgSecret();
                            setRotation({ secret, code: await formatOrgKeyCode(secret) });
                        })} className="btn-secondary px-3! py-1.5! text-xs">기관 키 바꾸기…</button>
                    )}
                    {rotation && (
                        <div className="space-y-2 rounded-xl border border-amber-300/30 bg-amber-500/10 p-3">
                            <p className="text-amber-100">새 기관 키 코드(적어 두세요):</p>
                            <p className="select-all font-mono text-base tracking-wider text-white">{rotation.code}</p>
                            <button type="button" disabled={busy} onClick={() => void run(async () => {
                                const key = await deriveOrgKey(rotation.secret);
                                const outcome = await engine!.rotateKey(key);
                                await unwrap(bridge.setOrgKey(bytesToBase64(rotation.secret)));
                                setRotation(null);
                                setNotice(`기관 키를 바꿨습니다. 기록 ${outcome.rewritten}건을 다시 암호화했습니다${outcome.skipped.length ? ` (열지 못해 건너뛴 파일 ${outcome.skipped.length}건)` : ''}. 다른 PC에 새 코드를 알려 주세요.`);
                                await controller?.start();
                            })} className="btn-primary px-3! py-1.5! text-xs">새 키로 바꾸기</button>
                            <button type="button" disabled={busy} onClick={() => setRotation(null)} className="ml-2 text-white/60 underline">취소</button>
                        </div>
                    )}
                </div>
            </details>
        </div>
    );
}
