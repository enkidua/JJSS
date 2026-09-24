import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Eye, EyeOff, Lock } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { MIN_BACKUP_PASSWORD_LENGTH } from '../config/crypto';

interface BackupPasswordDialogProps {
    /** export: 새 백업 비밀번호 설정 / restore: 암호화된 백업 비밀번호 입력 */
    mode: 'export' | 'restore';
    busy?: boolean;
    /** 복원 시 비밀번호 오류 등 */
    error?: string;
    fileName?: string;
    onSubmitPassword: (password: string) => void;
    /** 내보내기에서 평문 경고를 확인한 뒤 비밀번호 없이 저장 */
    onSkipPassword?: () => void;
    onCancel: () => void;
}

/**
 * 백업 비밀번호 입력 창 (Electron에서는 window.prompt를 쓸 수 없음).
 * Navbar 안(backdrop-filter가 있는 고정 요소)에서도 화면 전체를 덮도록 document.body에 그린다.
 */
export default function BackupPasswordDialog({
    mode,
    busy = false,
    error,
    fileName,
    onSubmitPassword,
    onSkipPassword,
    onCancel,
}: BackupPasswordDialogProps) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [step, setStep] = useState<'password' | 'plaintext-warning'>('password');
    const [plaintextAcknowledged, setPlaintextAcknowledged] = useState(false);
    const [validationError, setValidationError] = useState('');
    const dialogRef = useDialogFocus(true, () => {
        if (step === 'plaintext-warning') {
            setStep('password');
            return;
        }
        if (!busy) onCancel();
    });

    const isExport = mode === 'export';
    const titleId = 'backup-password-title';
    const descId = 'backup-password-desc';

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (busy) return;
        if (isExport) {
            if (password.length < MIN_BACKUP_PASSWORD_LENGTH) {
                setValidationError(`비밀번호는 ${MIN_BACKUP_PASSWORD_LENGTH}자 이상 입력해 주세요.`);
                return;
            }
            if (password !== confirmPassword) {
                setValidationError('비밀번호 확인이 일치하지 않습니다. 다시 입력해 주세요.');
                return;
            }
        } else if (!password) {
            setValidationError('백업을 만들 때 설정한 비밀번호를 입력해 주세요.');
            return;
        }
        setValidationError('');
        onSubmitPassword(password);
    };

    const shownError = validationError || error;

    const dialog = (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center overflow-y-auto bg-black/70 p-4"
            onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                tabIndex={-1}
                className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141731] p-6 shadow-2xl focus:outline-none"
            >
                {step === 'plaintext-warning' ? (
                    <div>
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-400" aria-hidden="true" />
                            <div>
                                <h2 id={titleId} className="text-lg font-bold text-white">비밀번호 없이 저장할까요?</h2>
                                <div id={descId} className="mt-2 space-y-2 text-sm leading-relaxed text-white/75">
                                    <p>비밀번호 없이 저장하면 <strong className="text-amber-200">이용자 이름, 연락처, 주소, 장애유형, 상담·사례 문서</strong> 같은 개인정보가 누구나 읽을 수 있는 형태(평문)로 파일에 그대로 저장됩니다.</p>
                                    <p>USB·메일·메신저로 옮기다 파일이 유출되면 개인정보가 그대로 노출됩니다. 가능하면 비밀번호를 설정해 주세요.</p>
                                </div>
                            </div>
                        </div>
                        <label className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-50">
                            <input
                                type="checkbox"
                                autoFocus
                                checked={plaintextAcknowledged}
                                onChange={event => setPlaintextAcknowledged(event.target.checked)}
                                className="mt-0.5 h-4 w-4 accent-amber-500"
                            />
                            <span>개인정보가 평문으로 저장된다는 것을 이해했으며, 비밀번호 없이 저장합니다.</span>
                        </label>
                        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setStep('password')} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10">
                                돌아가서 비밀번호 설정
                            </button>
                            <button
                                type="button"
                                disabled={!plaintextAcknowledged || busy}
                                onClick={() => onSkipPassword?.()}
                                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                비밀번호 없이 저장
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} noValidate>
                        <div className="flex items-start gap-3">
                            <Lock className="mt-0.5 h-6 w-6 shrink-0 text-emerald-300" aria-hidden="true" />
                            <div className="min-w-0">
                                <h2 id={titleId} className="text-lg font-bold text-white">
                                    {isExport ? '백업 파일 비밀번호 설정' : '백업 파일 비밀번호 입력'}
                                </h2>
                                <div id={descId} className="mt-2 space-y-1.5 text-sm leading-relaxed text-white/70">
                                    {isExport ? (
                                        <>
                                            <p>비밀번호를 설정하면 백업 파일이 암호화되어, 비밀번호를 모르는 사람은 내용을 볼 수 없습니다.</p>
                                            <p className="text-amber-200/90">비밀번호를 잊으면 이 백업을 복원할 수 없습니다. 안전한 곳에 적어 두세요.</p>
                                        </>
                                    ) : (
                                        <>
                                            <p>이 백업 파일은 비밀번호로 암호화되어 있습니다. 백업을 만들 때 설정한 비밀번호를 입력해 주세요.</p>
                                            {fileName && <p className="break-all text-xs text-white/45">파일: {fileName}</p>}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 space-y-3">
                            <div>
                                <label htmlFor="backup-password" className="mb-1.5 block text-sm font-medium text-white/75">
                                    비밀번호{isExport ? ` (${MIN_BACKUP_PASSWORD_LENGTH}자 이상)` : ''}
                                </label>
                                <div className="relative">
                                    <input
                                        id="backup-password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        autoComplete={isExport ? 'new-password' : 'current-password'}
                                        disabled={busy}
                                        onChange={event => { setPassword(event.target.value); setValidationError(''); }}
                                        className="input-field !pr-12 text-sm"
                                    />
                                    <button
                                        type="button"
                                        aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                                        onClick={() => setShowPassword(value => !value)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 hover:text-white/70"
                                    >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                            {isExport && (
                                <div>
                                    <label htmlFor="backup-password-confirm" className="mb-1.5 block text-sm font-medium text-white/75">비밀번호 확인</label>
                                    <input
                                        id="backup-password-confirm"
                                        type={showPassword ? 'text' : 'password'}
                                        value={confirmPassword}
                                        autoComplete="new-password"
                                        disabled={busy}
                                        onChange={event => { setConfirmPassword(event.target.value); setValidationError(''); }}
                                        className="input-field text-sm"
                                    />
                                </div>
                            )}
                        </div>

                        {shownError && (
                            <p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                {shownError}
                            </p>
                        )}

                        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                            <button type="button" disabled={busy} onClick={onCancel} className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40">
                                취소
                            </button>
                            {isExport && onSkipPassword && (
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => { setValidationError(''); setPlaintextAcknowledged(false); setStep('plaintext-warning'); }}
                                    className="rounded-lg border border-amber-400/30 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/10 disabled:opacity-40"
                                >
                                    비밀번호 없이 저장…
                                </button>
                            )}
                            <button type="submit" disabled={busy} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60">
                                {busy ? '확인 중…' : isExport ? '암호화하여 저장' : '확인'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );

    return typeof document === 'undefined' ? dialog : createPortal(dialog, document.body);
}
