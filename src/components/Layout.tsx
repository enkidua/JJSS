import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Navbar from './Navbar';
import { useDataStore } from '../store/dataStore';
import { useSettingsStore } from '../store/settingsStore';
import { safeErrorMetadata } from '../utils/safeError';
import { DATA_RECOVERY_EVENT, getDataRecoveryStatus, type DataRecoveryStatus } from '../config/localDB';
import JjssFileSaveNotice from './JjssFileSaveNotice';
import ApiKeyOnboarding from './ApiKeyOnboarding';
import ApiKeyRequiredNotice from './ApiKeyRequiredNotice';
import PremiumUseConfirmDialog from './PremiumUseConfirmDialog';
import AIUsageNotice from './AIUsageNotice';
import { cancelActiveAIRequestJobs } from '../services/aiRequestSafety';

const PAGE_TITLES: Record<string, string> = {
    '/': '서비스 소개',
    '/manage': '이용자 및 사업체 관리',
    '/overview': '직업재활 현황판',
    '/evaluation': '직업평가',
    '/training': '직업훈련',
    '/workmate': '고용지원',
    '/budget': '예산 관리',
    '/tools': '업무 지원 도구',
    '/infomate': '자료수집',
    '/settings': '설정',
};

function dataRecoveryMessage(status: DataRecoveryStatus): string {
    return status.dataKeyUnavailable
        ? '이 PC의 보안 키를 불러오지 못해 암호화된 이용자 정보 일부를 표시할 수 없습니다. 다른 PC나 다른 Windows 사용자 계정으로 데이터를 옮긴 경우 생길 수 있습니다. 저장된 원본은 지우지 않았습니다. 설정 > 파일·백업에서 백업 파일로 복원해 주세요.'
        : '암호화된 이용자 정보 일부를 읽지 못해 빈 칸으로 표시했습니다. 저장된 원본은 지우지 않았습니다. 내용이 비어 있다면 설정 > 파일·백업에서 최근 백업 파일로 복원해 주세요.';
}

function getInitialLoadIssues() {
    const dataState = useDataStore.getState();
    const settingsState = useSettingsStore.getState();
    return [
        !dataState.initialized && dataState.error ? dataState.error : '',
        settingsState.error || '',
    ].filter(Boolean);
}

export default function Layout() {
    const fetchData = useDataStore(state => state.fetchData);
    const loadSettings = useSettingsStore(state => state.loadSettings);
    const location = useLocation();
    const navigate = useNavigate();
    const [loadIssues, setLoadIssues] = useState<string[]>([]);
    const [dataRecovery, setDataRecovery] = useState<DataRecoveryStatus | null>(null);
    const [dataRecoveryDismissed, setDataRecoveryDismissed] = useState(false);

    useEffect(() => {
        // 암호화된 개인정보를 읽지 못했을 때(보안 키 없음 등) 복구 안내를 띄운다.
        const showRecovery = (event: Event) => {
            setDataRecovery((event as CustomEvent<DataRecoveryStatus>).detail || getDataRecoveryStatus());
            setDataRecoveryDismissed(false);
        };
        window.addEventListener(DATA_RECOVERY_EVENT, showRecovery);
        const current = getDataRecoveryStatus();
        if (current.unreadableCount > 0) setDataRecovery(current);
        return () => window.removeEventListener(DATA_RECOVERY_EVENT, showRecovery);
    }, []);
    const [retrying, setRetrying] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    useEffect(() => {
        // 앱 초기 데이터 및 설정 동기 로드
        const init = async () => {
            try {
                const results = await Promise.allSettled([loadSettings(), fetchData()]);
                const issues = getInitialLoadIssues();
                if (results.some(result => result.status === 'rejected') && issues.length === 0) {
                    issues.push('초기 데이터를 불러오는 중 예상하지 못한 오류가 발생했습니다.');
                }
                setLoadIssues(issues);
            } catch (error) {
                console.error('Initial Load Error:', safeErrorMetadata(error, 'initial-load'));
                setLoadIssues(['초기 데이터를 불러오지 못했습니다. 아래 버튼으로 다시 시도해 주세요.']);
            } finally {
                setInitialLoading(false);
            }
        };
        void init();
    }, [fetchData, loadSettings]); // 앱 생명주기 동안 한 번만 실행

    useEffect(() => {
        const pageTitle = PAGE_TITLES[location.pathname] || '페이지를 찾을 수 없음';
        document.title = `${pageTitle} | JJSS`;
        const frameId = window.requestAnimationFrame(() => {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            if (!document.querySelector('[aria-modal="true"]')) document.getElementById('main-content')?.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(frameId);
    }, [location.pathname]);

    useEffect(() => () => {
        // 화면을 벗어난 작업은 취소하며, 취소된 Job은 다음 Provider로 전환하지 않습니다.
        cancelActiveAIRequestJobs();
    }, [location.pathname]);

    const retryInitialLoad = async () => {
        setRetrying(true);
        try {
            const results = await Promise.allSettled([loadSettings(), fetchData(true)]);
            const issues = getInitialLoadIssues();
            if (results.some(result => result.status === 'rejected') && issues.length === 0) {
                issues.push('초기 데이터를 불러오는 중 예상하지 못한 오류가 발생했습니다.');
            }
            setLoadIssues(issues);
        } catch (error) {
            console.error('Initial Load Retry Error:', safeErrorMetadata(error, 'initial-load-retry'));
            setLoadIssues(['데이터와 설정을 다시 불러오지 못했습니다. 앱을 재실행한 후 다시 확인해 주세요.']);
        } finally {
            setRetrying(false);
        }
    };

    const focusMainContent = () => {
        const main = document.getElementById('main-content');
        main?.focus();
        main?.scrollIntoView({ block: 'start' });
    };

    return (
        <div className="min-h-screen bg-gradient-dark flex flex-col">
            <a
                href="#main-content"
                onClick={(event) => {
                    // HashRouter 주소를 유지하면서 본문으로 이동합니다.
                    event.preventDefault();
                    focusMainContent();
                }}
                className="fixed left-3 top-2 z-[10000] -translate-y-20 rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-xl transition-transform focus:translate-y-0"
            >
                본문으로 건너뛰기
            </a>
            <Navbar />
            <ApiKeyOnboarding />
            <ApiKeyRequiredNotice />
            <PremiumUseConfirmDialog />
            {/* 오른쪽 아래 알림은 한 곳에 위아래로 쌓아 서로 겹치지 않게 한다. */}
            <div className="pointer-events-none fixed bottom-4 right-4 z-[9998] flex w-[min(92vw,32rem)] flex-col items-end gap-3">
                <AIUsageNotice />
                <JjssFileSaveNotice />
            </div>
            <main id="main-content" tabIndex={-1} className="pt-16 flex-1 relative focus:outline-none">
                {initialLoading && <p role="status" className="mx-auto max-w-7xl px-6 py-3 text-sm text-white/70">저장된 데이터와 설정을 불러오는 중입니다…</p>}
                {loadIssues.length > 0 && (
                    <section
                        role="alert"
                        aria-live="assertive"
                        className="mx-auto mt-4 flex w-[min(92%,80rem)] flex-col gap-3 rounded-xl border border-amber-400/40 bg-amber-950/80 px-4 py-3 text-sm text-amber-50 shadow-lg sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div>
                            <p className="font-bold">데이터 또는 설정을 불러오지 못했습니다.</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-100/90">
                                {loadIssues.map(issue => <li key={issue}>{issue}</li>)}
                            </ul>
                        </div>
                        <button
                            type="button"
                            onClick={() => void retryInitialLoad()}
                            disabled={retrying}
                            className="shrink-0 rounded-lg border border-amber-200/40 bg-amber-300/15 px-4 py-2 font-bold text-amber-50 hover:bg-amber-300/25 disabled:cursor-wait disabled:opacity-60"
                        >
                            {retrying ? '다시 불러오는 중…' : '다시 시도'}
                        </button>
                    </section>
                )}
                {dataRecovery && !dataRecoveryDismissed && (
                    <section
                        role="alert"
                        className="mx-auto mt-4 flex w-[min(92%,80rem)] flex-col gap-3 rounded-xl border border-amber-400/40 bg-amber-950/80 px-4 py-3 text-sm text-amber-50 shadow-lg sm:flex-row sm:items-center sm:justify-between"
                    >
                        <div>
                            <p className="font-bold">저장된 개인정보 일부를 읽지 못했습니다.</p>
                            <p className="mt-1 text-xs leading-relaxed text-amber-100/90">{dataRecoveryMessage(dataRecovery)}</p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                            <button
                                type="button"
                                onClick={() => navigate('/settings#files-backup')}
                                className="rounded-lg border border-amber-200/40 bg-amber-300/15 px-4 py-2 font-bold text-amber-50 hover:bg-amber-300/25"
                            >
                                백업·복원 설정으로
                            </button>
                            <button
                                type="button"
                                onClick={() => setDataRecoveryDismissed(true)}
                                className="rounded-lg px-3 py-2 text-amber-100/80 hover:bg-white/10"
                            >
                                닫기
                            </button>
                        </div>
                    </section>
                )}
                <Outlet />
            </main>
            {/* Global Footer */}
            <footer className="w-full relative z-10 py-10 mt-auto border-t border-white/5 bg-black/20">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col items-center text-center space-y-3">
                        <p className="text-white/50 text-sm font-medium tracking-wide">
                            Built by <span className="text-white font-bold tracking-widest uppercase">Jang-Go</span>
                        </p>
                        <p className="text-white/40 text-xs sm:text-sm max-w-lg leading-relaxed">
                            사용 중 느끼신 불편한 점, <br className="sm:hidden" />
                            혹은 <strong className="text-emerald-400/80">추가되었으면 하는 기능이나 아이디어</strong>가 있으신가요?<br />
                            어떤 의견이든 언제나 환영합니다. 자유롭게 메일로 의견을 남겨주세요!
                        </p>
                        <a 
                            href="mailto:enkidua@naver.com" 
                            className="inline-flex items-center gap-2 px-4 py-2 mt-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 text-blue-400 hover:text-blue-300 transition-all font-mono text-sm shadow-sm"
                        >
                            <span>✉️</span> enkidua@naver.com
                        </a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
