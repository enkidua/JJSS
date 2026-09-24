import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Check, AlertTriangle, Shield } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';
import { AI_MODEL_CATALOG_UPDATED_AT, DEFAULT_AI_MODEL_LABELS } from '../config/aiModels';
import { getEncryptionKeyKind } from '../config/crypto';
import AiModelSection from '../components/settings/AiModelSection';
import FailoverSection from '../components/settings/FailoverSection';
import ApiKeySection from '../components/settings/ApiKeySection';
import BackupSection from '../components/settings/BackupSection';

const SECTION_LINKS: Array<[id: string, label: string]> = [
    ['ai-model', 'AI 모델'],
    ['ai-failover', '비용·자동 전환'],
    ['api-keys', 'API 키'],
    ['files-backup', '파일·백업'],
];

function focusSection(id: string) {
    const section = document.getElementById(id);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({ block: 'start', behavior: 'auto' });
}

export default function Settings() {
    const loadSettings = useSettingsStore(state => state.loadSettings);
    const loaded = useSettingsStore(state => state.loaded);
    const error = useSettingsStore(state => state.error);
    const recoveryNotice = useSettingsStore(state => state.recoveryNotice);
    const location = useLocation();
    const [saved, setSaved] = useState(false);
    const [keyKind, setKeyKind] = useState<'data-key' | 'installation' | null>(null);
    const savedTimerRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (!loaded) void loadSettings();
    }, [loaded, loadSettings]);

    useEffect(() => {
        let active = true;
        getEncryptionKeyKind()
            .then(kind => { if (active) setKeyKind(kind); })
            .catch(() => undefined);
        return () => { active = false; };
    }, []);

    // 다른 화면에서 특정 섹션으로 보내면(#/settings#files-backup 또는 state.focusSection) 해당 섹션으로 이동한다.
    useEffect(() => {
        const stateTarget = (location.state as { focusSection?: unknown } | null)?.focusSection;
        const target = typeof stateTarget === 'string' ? stateTarget : location.hash.replace(/^#/, '');
        if (!SECTION_LINKS.some(([id]) => id === target)) return;
        // 화면 전환 시 맨 위로 올리는 처리가 끝난 뒤 이동한다.
        const timer = window.setTimeout(() => focusSection(target), 150);
        return () => window.clearTimeout(timer);
    }, [location.state, location.hash, location.key]);

    useEffect(() => () => window.clearTimeout(savedTimerRef.current), []);

    const flashSaved = useCallback(() => {
        setSaved(true);
        window.clearTimeout(savedTimerRef.current);
        savedTimerRef.current = window.setTimeout(() => setSaved(false), 2000);
    }, []);

    return (
        <div className="min-h-screen py-8 px-4">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-10"
                >
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 mb-4">
                        <SettingsIcon className="w-4 h-4 text-primary-400" />
                        <span className="text-sm text-primary-300 font-medium">시스템 설정</span>
                    </div>
                    <h1 className="section-title mb-3">시스템 설정</h1>
                    <p className="text-white/50 text-lg">AI, 비용 보호, 파일 저장 위치와 백업을 한곳에서 관리하세요</p>
                </motion.div>

                <nav aria-label="설정 항목 바로가기" className="sticky top-20 z-20 mb-8 overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/85 p-2 shadow-xl backdrop-blur-xl">
                    <div className="flex min-w-max gap-2">
                        {SECTION_LINKS.map(([id, label]) => (
                            <button key={id} type="button" onClick={() => focusSection(id)} className="rounded-xl px-4 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">{label}</button>
                        ))}
                    </div>
                </nav>

                {/* 보안 안내 */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass-card !p-5 mb-8 flex items-start gap-3"
                >
                    <Shield className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-white/80 text-sm font-medium mb-1">로컬 저장과 암호화</p>
                        <p className="text-white/50 text-xs leading-relaxed">
                            API 키와 이용자의 주요 개인정보(이름·연락처·주소·상담 문서 등)는 저장할 때 AES-GCM 256비트로 암호화하여 이 컴퓨터(IndexedDB)에만 보관합니다.
                            API 키와 입력한 내용은 AI 기능을 사용할 때 해당 AI 제공업체(Google·OpenAI·Anthropic)로만 전송되며, 그 밖의 서버로는 전송되지 않습니다.
                        </p>
                        {keyKind && (
                            <p className="mt-1 text-white/50 text-xs leading-relaxed">
                                {keyKind === 'data-key'
                                    ? '암호화 키는 Windows 사용자 계정 보호 기능(DPAPI)으로 보관됩니다. 다른 PC로 옮길 때는 백업 파일을 사용해 주세요.'
                                    : '현재 실행 환경에서는 Windows 보안 저장소를 사용할 수 없어 기본 암호화 방식을 사용합니다.'}
                            </p>
                        )}
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12 }}
                    className="glass-card !p-5 mb-8 flex items-start gap-3"
                >
                    <AlertTriangle className="w-5 h-5 text-amber-300 mt-0.5 shrink-0" />
                    <div className="text-xs leading-relaxed text-white/55">
                        <p className="text-white/80 text-sm font-medium mb-2">비용·사용 한도 안내</p>
                        <p>일반 문서 생성은 비용 부담이 낮은 편입니다. 이미지 생성, PDF/이미지 분석, OCR 반복 실행은 사용 한도를 더 많이 쓸 수 있습니다.</p>
                        <p className="mt-1">신규 설정의 기본 모델: {Object.values(DEFAULT_AI_MODEL_LABELS).join(' / ')}. 기존에 저장한 모델 선택은 유지됩니다.</p>
                        <p className="mt-1">모델 목록 확인일: {AI_MODEL_CATALOG_UPDATED_AT}. 자동 전환은 기본적으로 꺼져 있으며, 사용자가 허용한 비용 정책과 제공업체 범위 안에서만 최대 3회 시도합니다. 고비용 최신 모델은 직접 선택한 경우에만 사용합니다. 계정별 모델 접근 권한과 요금은 제공업체에서 확인하세요.</p>
                        <p className="mt-1">추론 수준을 높이면 응답이 느려지고 사고 토큰 사용량이 늘 수 있습니다. 실제 비용은 제공업체의 사용량과 요금 정책을 확인하세요.</p>
                    </div>
                </motion.div>

                {/* 불러오기 오류·복구 안내 */}
                {(error || recoveryNotice) && (
                    <motion.div
                        role={error ? 'alert' : 'status'}
                        aria-live={error ? 'assertive' : 'polite'}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-start gap-2"
                    >
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{error || recoveryNotice}</span>
                    </motion.div>
                )}

                {/* 저장 완료 알림 */}
                {saved && (
                    <motion.div
                        role="status"
                        aria-live="polite"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center gap-2"
                    >
                        <Check className="w-4 h-4" />
                        설정이 저장되었습니다.
                    </motion.div>
                )}

                <AiModelSection onSaved={flashSaved} />
                <FailoverSection onSaved={flashSaved} />
                <ApiKeySection onSaved={flashSaved} />
                <BackupSection />
            </div>
        </div>
    );
}
