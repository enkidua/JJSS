import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, LogIn, ShieldAlert, ShieldCheck, Upload } from 'lucide-react';
import { createDriveClient, getDriveBridge, unwrap, bytesToBase64 } from '../../../features/sharedDrive/driveClient';
import { SyncEngine, KEY_CHECK_META_NAME, type InitialSyncResult, type SyncProgress, type VerifyResult } from '../../../features/sharedDrive/engine';
import { deriveOrgKey, formatOrgKeyCode, generateOrgSecret, parseOrgKeyCode } from '../../../features/sharedDrive/orgKey';
import { evaluateDriveSecurity, type SecurityReport } from '../../../features/sharedDrive/security';
import { IndexedDbSyncState } from '../../../features/sharedDrive/syncState';
import { conflictCodec, localDbAdapter } from '../../../features/sharedDrive/localAdapter';
import { getSharedDriveController, SHARED_DRIVE_APPLIED_EVENT } from '../../../features/sharedDrive/controller';
import { SHARED_DRIVE_RESTORE_PAUSE_KEY } from '../../../config/localDB';
import { useBeforeUnloadGuard } from '../../../hooks/useBeforeUnloadGuard';
import SecurityReportView from './SecurityReportView';

type Step = 'guide' | 'admin' | 'sign-in' | 'drive' | 'security' | 'key' | 'upload' | 'done';
const STEPS: Array<[Step, string]> = [
    ['guide', '안내'],
    ['admin', '관리자 설정'],
    ['sign-in', '로그인'],
    ['drive', '공유 드라이브'],
    ['security', '보안 점검'],
    ['key', '기관 키'],
    ['upload', '기존 자료 올리기'],
];

const PHASE_LABEL: Record<SyncProgress['phase'], string> = {
    listing: '드라이브 목록 확인',
    uploading: '이 PC 자료 올리는 중',
    downloading: '드라이브 자료 받는 중',
    verifying: '올린 자료 확인 중',
    rotating: '기관 키 바꾸는 중',
};

function nextStepFor(status: JjssDriveStatus | null, consented: boolean): Step {
    if (!consented) return 'guide';
    if (!status?.configured) return 'admin';
    if (!status.signedIn) return 'sign-in';
    if (!status.driveId) return 'drive';
    return 'security';
}

interface Props {
    status: JjssDriveStatus | null;
    onStatus: (status: JjssDriveStatus) => void;
    onFinished: () => void;
}

/** 공유 저장소 처음 설정(꺼짐 → 켜짐). 단계마다 앞 단계가 끝나야 넘어간다. */
export default function SharedDriveSetup({ status, onStatus, onFinished }: Props) {
    const bridge = getDriveBridge()!;
    const [consented, setConsented] = useState(false);
    const [step, setStep] = useState<Step>('guide');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [admin, setAdmin] = useState({ domain: status?.domain || '', clientId: '', clientSecret: '' });
    const [drives, setDrives] = useState<Array<{ id: string; name: string }> | null>(null);
    const [security, setSecurity] = useState<SecurityReport | null>(null);
    const [keyCheckExists, setKeyCheckExists] = useState<boolean>(false);
    const [newCode, setNewCode] = useState('');
    const [newSecret, setNewSecret] = useState<Uint8Array | null>(null);
    const [confirmTail, setConfirmTail] = useState('');
    const [codeInput, setCodeInput] = useState('');
    const [secret, setSecret] = useState<Uint8Array | null>(null);
    const [summary, setSummary] = useState<Awaited<ReturnType<SyncEngine['summarizeLocal']>> | null>(null);
    const [progress, setProgress] = useState<SyncProgress | null>(null);
    const [result, setResult] = useState<InitialSyncResult | null>(null);
    const [verify, setVerify] = useState<VerifyResult | null>(null);
    const [uploading, setUploading] = useState(false);

    // 올리는 동안 창을 닫거나 새로 고치면 올리기가 끊긴다(다시 누르면 이어서 하지만 알려 준다).
    useBeforeUnloadGuard(uploading);

    useEffect(() => {
        if (step !== 'guide' && step !== 'key' && step !== 'upload' && step !== 'done') setStep(nextStepFor(status, consented));
        // 상태가 바뀔 때만 다음 단계로 옮긴다(키·올리기 단계는 화면 안에서 진행).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status?.configured, status?.signedIn, status?.driveId]);

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError('');
        try {
            await action();
        } catch (caught) {
            setError(String((caught as Error)?.message || '처리하지 못했습니다.'));
        } finally {
            setBusy(false);
        }
    };

    const stepIndex = STEPS.findIndex(([id]) => id === step);

    const makeEngine = async (orgSecret: Uint8Array) => {
        const key = await deriveOrgKey(orgSecret);
        const state = new IndexedDbSyncState(conflictCodec);
        // 백업을 복원한 뒤(동기화 멈춤 표지)나 다른 드라이브·다른 키의 상태가 남아 있으면 비우고 처음부터 맞춘다.
        // 옛 상태를 그대로 쓰면 복원본(옛 내용)이 "마지막으로 맞춘 뒤 고친 것"으로 보여 드라이브의 최신 내용을 충돌 없이 덮는다.
        let pausedAfterRestore = false;
        try { pausedAfterRestore = Boolean(window.localStorage.getItem(SHARED_DRIVE_RESTORE_PAUSE_KEY)); } catch { /* 표지를 못 읽으면 남은 상태로 진행 */ }
        const meta = await state.getMeta();
        if (pausedAfterRestore || (meta.driveId && meta.driveId !== status?.driveId) || (meta.keyId && meta.keyId !== key.keyId)) await state.clearAll();
        await state.setMeta({ driveId: status?.driveId, keyId: key.keyId });
        return new SyncEngine({
            drive: createDriveClient(bridge),
            local: localDbAdapter,
            state,
            key,
            accountEmail: status?.accountEmail || '',
            onProgress: setProgress,
        });
    };

    /** 키 단계로 넘어가기 직전: 드라이브에 키 확인 표식이 있는지 본다(있으면 코드를 입력해야 한다). */
    const enterKeyStep = async () => {
        setKeyCheckExists(Boolean(await unwrap(bridge.findMeta(KEY_CHECK_META_NAME))));
        setStep('key');
    };

    /** 키를 정한 뒤: 올리기 단계로. 새 키 비밀은 더 들고 있지 않는다. */
    const finishKeyStep = async (orgSecret: Uint8Array, engine: SyncEngine) => {
        setSecret(orgSecret);
        setNewSecret(null);
        setNewCode('');
        setConfirmTail('');
        setCodeInput('');
        setSummary(await engine.summarizeLocal());
        setStep('upload');
    };

    const runInitialSync = async (engine: SyncEngine) => {
        setUploading(true);
        try {
            const synced = await engine.initialSync();
            setResult(synced);
            if (synced.downloaded > 0) window.dispatchEvent(new CustomEvent(SHARED_DRIVE_APPLIED_EVENT, { detail: { count: synced.downloaded } }));
            setVerify(await engine.verifyAgainstRemote());
        } finally {
            setUploading(false);
        }
    };

    const tailOk = useMemo(() => newCode && confirmTail.trim().toUpperCase() === newCode.slice(-4), [newCode, confirmTail]);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <ol className="flex flex-wrap gap-1.5 text-[11px]" aria-label="설정 단계">
                    {STEPS.map(([id, label], index) => (
                        <li key={id} aria-current={index === stepIndex ? 'step' : undefined} className={`rounded-full px-2.5 py-1 ${index === stepIndex ? 'bg-sky-500/25 text-sky-100' : index < stepIndex ? 'bg-emerald-500/15 text-emerald-200' : 'bg-white/5 text-white/40'}`}>
                            {index + 1}. {label}
                        </li>
                    ))}
                </ol>
                {step !== 'done' && (
                    <button type="button" disabled={busy || uploading} onClick={onFinished} className="text-xs text-white/50 underline disabled:opacity-40">설정 그만두기</button>
                )}
            </div>

            {error && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-100">{error}</p>}

            {step === 'guide' && (
                <div className="space-y-3 text-sm leading-relaxed text-white/75">
                    <p className="font-semibold text-white">켜기 전에 꼭 읽어 주세요</p>
                    <ul className="list-disc space-y-1.5 pl-5 text-xs text-white/65">
                        <li><b className="text-white/85">무엇을 올리나:</b> 이용자 정보와 사례관리 기록(상담·직업평가·지원고용 문서 등). 직업훈련·예산·설정·API 키·사진 첨부는 올리지 않습니다.</li>
                        <li><b className="text-white/85">어디에:</b> 기관 Google Workspace의 <b>공유 드라이브</b> 한 곳. 개인 "내 드라이브"는 쓸 수 없습니다.</li>
                        <li><b className="text-white/85">어떻게 보호하나:</b> 이 PC에서 <b>기관 키</b>로 암호화한 뒤 올립니다. 구글과 드라이브 관리자도 내용을 읽을 수 없고, 기관 키를 가진 JJSS만 엽니다. 파일 이름·속성에는 이름·연락처를 넣지 않습니다.</li>
                        <li><b className="text-white/85">누가 쓰나:</b> 기관 도메인 계정으로 로그인하고 공유 드라이브 구성원인 직원만. 기관 키 코드는 메일·메신저로 보내지 말고 직접 전달하세요.</li>
                        <li><b className="text-white/85">관리자가 먼저 할 일:</b> 공유 드라이브 만들기 → 사례관리 담당 그룹만 구성원으로 추가 → 공유 드라이브 설정에서 "조직 외부 사용자 접근 허용", "구성원이 아닌 사용자에게 파일 공유 허용", "뷰어의 다운로드·인쇄·복사"를 끄기 → 기관 내부용 OAuth 클라이언트(데스크톱 앱) 만들기. 자세한 순서는 관리자 안내서(JJSS 저장소의 docs/SHARED_DRIVE_SETUP.md)에 있습니다.</li>
                        <li><b className="text-white/85">끄면:</b> 이 PC 자료는 그대로이고 드라이브와 주고받기만 멈춥니다. 시작 전에 이 PC 자료 사본을 자동으로 만듭니다(설정 → 파일·백업에서 .jjss 백업도 한 번 만들어 두기를 권장합니다).</li>
                    </ul>
                    <label className="flex items-start gap-2 text-xs text-white/80">
                        <input type="checkbox" checked={consented} onChange={event => setConsented(event.target.checked)} className="mt-0.5" />
                        기관의 개인정보 처리방침에 따라 공유 드라이브에 사례관리 기록을 보관하는 것이 허용되었고, 위 보안 설정을 확인했습니다.
                    </label>
                    <button type="button" disabled={!consented} onClick={() => setStep(nextStepFor(status, true))} className="btn-primary px-4! py-2! text-sm disabled:opacity-50">설정 시작</button>
                </div>
            )}

            {step === 'admin' && (
                <form
                    className="space-y-3"
                    onSubmit={event => {
                        event.preventDefault();
                        void run(async () => {
                            try {
                                const next = await unwrap(bridge.configure(admin));
                                onStatus(next);
                                setStep(nextStepFor(next, true));
                            } finally {
                                setAdmin(current => ({ ...current, clientSecret: '' }));
                            }
                        });
                    }}
                >
                    <p className="text-xs text-white/60">관리자에게 받은 값을 넣어 주세요. 보안 비밀은 이 PC의 운영체제 보안 저장소에 암호화해 둡니다.</p>
                    <label className="block text-xs text-white/70">기관 도메인
                        <input className="input-field mt-1 w-full" placeholder="example.org" value={admin.domain} onChange={event => setAdmin({ ...admin, domain: event.target.value })} autoComplete="off" />
                    </label>
                    <label className="block text-xs text-white/70">OAuth 클라이언트 ID
                        <input className="input-field mt-1 w-full" placeholder="….apps.googleusercontent.com" value={admin.clientId} onChange={event => setAdmin({ ...admin, clientId: event.target.value })} autoComplete="off" />
                    </label>
                    <label className="block text-xs text-white/70">OAuth 클라이언트 보안 비밀
                        <input type="password" className="input-field mt-1 w-full" value={admin.clientSecret} onChange={event => setAdmin({ ...admin, clientSecret: event.target.value })} autoComplete="off" />
                    </label>
                    <button type="submit" disabled={busy} className="btn-primary px-4! py-2! text-sm disabled:opacity-50">저장</button>
                </form>
            )}

            {step === 'sign-in' && (
                <div className="space-y-3 text-sm text-white/75">
                    <p>기관 계정(@{status?.domain})으로 로그인합니다. 브라우저 창이 열리면 로그인하고 권한을 허용한 뒤 JJSS로 돌아오세요.</p>
                    <p className="text-xs text-white/50">드라이브 전체 권한을 요청하지만, JJSS는 다음 단계에서 고르는 공유 드라이브 하나에만 접근합니다(개인 내 드라이브·다른 공유 드라이브는 읽지 않음).</p>
                    <button type="button" disabled={busy} onClick={() => void run(async () => onStatus(await unwrap(bridge.signIn())))} className="btn-primary px-4! py-2! text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                        <LogIn className="h-4 w-4" /> {busy ? '브라우저에서 로그인하는 중…' : '구글 로그인'}
                    </button>
                    <button type="button" onClick={() => setStep('admin')} className="ml-2 text-xs text-white/50 underline">관리자 설정 고치기</button>
                </div>
            )}

            {step === 'drive' && (
                <div className="space-y-3 text-sm text-white/75">
                    <p>{status?.accountEmail} 계정으로 로그인했습니다. 사례관리를 함께 쓸 공유 드라이브를 고르세요.</p>
                    {!drives && <button type="button" disabled={busy} onClick={() => void run(async () => setDrives(await unwrap(bridge.listSharedDrives())))} className="btn-secondary px-3! py-2! text-xs">공유 드라이브 목록 불러오기</button>}
                    {drives && drives.length === 0 && <p className="text-xs text-amber-200">이 계정이 구성원인 공유 드라이브가 없습니다. 관리자에게 구성원 추가를 요청해 주세요.</p>}
                    {drives && drives.length > 0 && (
                        <ul className="space-y-1.5">
                            {drives.map(drive => (
                                <li key={drive.id}>
                                    <button type="button" disabled={busy} onClick={() => void run(async () => onStatus(await unwrap(bridge.selectDrive(drive.id))))} className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white hover:bg-white/10">
                                        {drive.name}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <button type="button" disabled={busy} onClick={() => void run(async () => { onStatus(await unwrap(bridge.signOut())); setDrives(null); })} className="text-xs text-white/50 underline">다른 계정으로 로그인</button>
                </div>
            )}

            {step === 'security' && (
                <div className="space-y-3 text-sm text-white/75">
                    <p>"{status?.driveName}" 공유 드라이브의 보안 설정을 확인합니다. 막힌 항목이 있으면 켤 수 없습니다.</p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => void run(async () => {
                            const facts = await unwrap(bridge.securityFacts());
                            setSecurity(evaluateDriveSecurity(facts, status?.domain || ''));
                        })} className="btn-secondary px-3! py-2! text-xs inline-flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5" /> {security ? '다시 점검' : '보안 점검'}
                        </button>
                        <button type="button" disabled={busy} onClick={() => { setSecurity(null); setDrives(null); setStep('drive'); }} className="text-xs text-white/50 underline">다른 드라이브 고르기</button>
                    </div>
                    {security && <SecurityReportView report={security} />}
                    {security && !security.blocked && (
                        <button type="button" disabled={busy} onClick={() => void run(enterKeyStep)} className="btn-primary px-4! py-2! text-sm">다음</button>
                    )}
                    {security?.blocked && <p className="flex items-center gap-1.5 text-xs text-rose-200"><ShieldAlert className="h-4 w-4" /> 관리자에게 막힌 항목을 고쳐 달라고 요청한 뒤 다시 점검해 주세요.</p>}
                </div>
            )}

            {step === 'key' && (
                <div className="space-y-4 text-sm text-white/75">
                    {keyCheckExists ? (
                        <p>이 공유 드라이브는 이미 다른 PC에서 쓰고 있습니다. 관리자에게 받은 <b>기관 키 코드</b>(4자씩 7묶음)를 넣어 주세요.</p>
                    ) : (
                        <p>이 공유 드라이브를 처음 쓰는 PC입니다. 새 기관 키를 만들고 코드를 안전한 곳(종이·기관 보안 금고)에 적어 두세요. 다른 직원 PC에는 이 코드를 직접 알려 줍니다. <b>코드를 잃으면 드라이브 자료를 열 수 없습니다.</b></p>
                    )}
                    {!keyCheckExists && !newCode && (
                        <button type="button" disabled={busy} onClick={() => void run(async () => {
                            const generated = generateOrgSecret();
                            setNewSecret(generated);
                            setNewCode(await formatOrgKeyCode(generated));
                        })} className="btn-primary px-4! py-2! text-sm inline-flex items-center gap-1.5"><KeyRound className="h-4 w-4" /> 새 기관 키 만들기</button>
                    )}
                    {newCode && (
                        <div className="space-y-2 rounded-xl border border-amber-300/30 bg-amber-500/10 p-3">
                            <p className="text-xs text-amber-100">기관 키 코드 — 지금 적어 두세요. 이 화면을 닫으면 다시 볼 수 없습니다(설정에서 관리자만 다시 확인 가능).</p>
                            <p data-testid="org-key-code" className="select-all font-mono text-lg tracking-wider text-white">{newCode}</p>
                            <label className="block text-xs text-white/70">적어 둔 코드의 마지막 4자를 입력해 확인
                                <input className="input-field mt-1 w-40 font-mono uppercase" maxLength={4} value={confirmTail} onChange={event => setConfirmTail(event.target.value)} />
                            </label>
                            <button type="button" disabled={!tailOk || busy} onClick={() => void run(async () => {
                                // 그사이 다른 PC가 먼저 키를 만들었으면 덮어쓰지 않는다.
                                if (await unwrap(bridge.findMeta(KEY_CHECK_META_NAME))) {
                                    setKeyCheckExists(true);
                                    setNewCode('');
                                    setNewSecret(null);
                                    throw new Error('그사이 다른 PC가 이 공유 드라이브의 기관 키를 먼저 만들었습니다. 관리자에게 코드를 받아 입력해 주세요.');
                                }
                                // 표식은 없는데 기록이 있으면(표식이 지워짐) 새 키로는 그 기록을 열 수 없다. 확인을 받는다.
                                const existing = await unwrap(bridge.listRecords());
                                if (existing.files.length > 0 && !window.confirm(`이 드라이브에 이미 기록 ${existing.files.length}건${existing.nextPageToken ? ' 이상' : ''}이 있지만 기관 키 확인 표식이 없습니다. 새 키를 만들면 그 기록은 열 수 없어 격리됩니다. 관리자에게 기존 코드를 확인하는 편이 안전합니다. 그래도 새 키로 시작할까요?`)) return;
                                await unwrap(bridge.setOrgKey(bytesToBase64(newSecret!)));
                                const engine = await makeEngine(newSecret!);
                                await engine.ensureKeyCheck();
                                await finishKeyStep(newSecret!, engine);
                            })} className="btn-primary px-4! py-2! text-sm disabled:opacity-50">이 키로 시작</button>
                        </div>
                    )}
                    {keyCheckExists && (
                        <form className="space-y-2" onSubmit={event => {
                            event.preventDefault();
                            void run(async () => {
                                const parsed = await parseOrgKeyCode(codeInput);
                                const engine = await makeEngine(parsed);
                                const ok = await engine.verifyOrgKey();
                                if (ok !== true) throw new Error('입력한 기관 키 코드가 이 공유 드라이브의 키와 맞지 않습니다.');
                                await unwrap(bridge.setOrgKey(bytesToBase64(parsed)));
                                await finishKeyStep(parsed, engine);
                            });
                        }}>
                            <input aria-label="기관 키 코드" className="input-field w-full font-mono uppercase tracking-wider" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" value={codeInput} onChange={event => setCodeInput(event.target.value)} autoComplete="off" />
                            <button type="submit" disabled={busy || !codeInput.trim()} className="btn-primary px-4! py-2! text-sm disabled:opacity-50">확인</button>
                        </form>
                    )}
                </div>
            )}

            {step === 'upload' && summary && (
                <div className="space-y-3 text-sm text-white/75">
                    <p className="font-semibold text-white">이 PC에 쌓인 자료를 공유 드라이브에 올리고, 드라이브에 있는 자료를 받아 합칩니다.</p>
                    <ul className="grid grid-cols-2 gap-2 text-xs">
                        <li className="rounded-xl bg-white/5 p-2">이용자 <b className="text-white">{summary.counts.seekers.toLocaleString()}</b>명</li>
                        <li className="rounded-xl bg-white/5 p-2">사례 기록 <b className="text-white">{summary.counts.caseDocuments.toLocaleString()}</b>건</li>
                    </ul>
                    {summary.unreadable.length > 0 && <p className="text-xs text-amber-200">이 PC에서 읽지 못한 기록 {summary.unreadable.length}건은 올리지 않습니다(깨진 내용을 퍼뜨리지 않게). 데이터 복구 안내를 먼저 확인하세요.</p>}
                    <p className="text-xs text-white/50">같은 기록이 드라이브에도 있으면 내용이 같을 때 연결하고, 다르면 "충돌"로 남겨 직접 고르게 합니다. 자동으로 덮어쓰지 않습니다. 올리는 동안 다른 화면으로 가지 말고, 중간에 끊겨도 다시 누르면 이어서 합니다.</p>
                    {!result && (
                        <button type="button" disabled={busy} onClick={() => void run(async () => {
                            const backup = await unwrap(bridge.backupLocalData());
                            if (!backup.copied) throw new Error('이 PC 저장소의 사본을 만들지 못해 올리기를 시작하지 않았습니다. 잠시 후 다시 시도해 주세요.');
                            await runInitialSync(await makeEngine(secret!));
                        })} className="btn-primary px-4! py-2! text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
                            <Upload className="h-4 w-4" /> {busy ? '진행 중…' : '이 PC 사본을 만든 뒤 올리기 시작'}
                        </button>
                    )}
                    {progress && busy && (
                        <div aria-live="polite" className="text-xs text-white/70">
                            {PHASE_LABEL[progress.phase]} {progress.total ? `${progress.done.toLocaleString()} / ${progress.total.toLocaleString()}` : ''}
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-sky-400" style={{ width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 5}%` }} /></div>
                        </div>
                    )}
                    {result && (
                        <div data-testid="initial-sync-result" className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                            <p>올림 {result.uploaded.toLocaleString()} · 받음 {result.downloaded.toLocaleString()} · 이미 같음 {result.linked.toLocaleString()}</p>
                            {result.conflicts > 0 && <p className="text-amber-200">내용이 다른 기록 {result.conflicts}건 — 켠 뒤 "충돌" 목록에서 고르세요.</p>}
                            {result.duplicates.length > 0 && <p className="text-amber-200">같은 사람으로 보이는 이용자 {result.duplicates.length}묶음 — 켠 뒤 확인하세요.</p>}
                            {result.quarantined.length > 0 && <p className="text-amber-200">열지 못한 드라이브 파일 {result.quarantined.length}건은 받지 않았습니다(관리자 확인).</p>}
                            {verify && (verify.ok
                                ? <p className="flex items-center gap-1 text-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" /> 확인 완료: 이 PC 기록 {verify.checked.toLocaleString()}건이 드라이브와 같습니다.</p>
                                : <p className="text-amber-200">확인: 빠진 기록 {verify.missing.length}건, 내용이 다른 기록 {verify.mismatched.length}건. 다시 올리기를 누르면 이어서 올리고, 켜면 남은 것도 자동으로 올라갑니다.</p>)}
                        </div>
                    )}
                    {result && verify && !verify.ok && (
                        <button type="button" disabled={busy} onClick={() => void run(async () => runInitialSync(await makeEngine(secret!)))} className="btn-secondary px-3! py-2! text-xs">다시 올리기</button>
                    )}
                    {result && (
                        <button type="button" disabled={busy} onClick={() => void run(async () => {
                            onStatus(await unwrap(bridge.setEnabled(true)));
                            try { window.localStorage.removeItem(SHARED_DRIVE_RESTORE_PAUSE_KEY); } catch { /* 표지가 없어도 된다 */ }
                            setStep('done');
                            onFinished();
                            // 켜면 제어부가 올리지 못한 기록(검증에서 빠진 것·그사이 고친 것)을 찾아 마저 올린다.
                            await getSharedDriveController()?.start();
                        })} className="btn-primary px-4! py-2! text-sm">공유 저장소 켜기</button>
                    )}
                </div>
            )}
        </div>
    );
}
