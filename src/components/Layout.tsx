import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import { useDataStore } from '../store/dataStore';
import { useSettingsStore } from '../store/settingsStore';
import { safeErrorMetadata } from '../utils/safeError';
import JjssFileSaveNotice from './JjssFileSaveNotice';
import ApiKeyOnboarding from './ApiKeyOnboarding';
import ApiKeyRequiredNotice from './ApiKeyRequiredNotice';
import PremiumUseConfirmDialog from './PremiumUseConfirmDialog';
import AIUsageNotice from './AIUsageNotice';
import { cancelActiveAIRequestJobs } from '../services/aiRequestSafety';

export default function Layout() {
    const { fetchData } = useDataStore();
    const { loadSettings } = useSettingsStore();
    const location = useLocation();

    useEffect(() => {
        // 앱 초기 데이터 및 설정 동기 로드
        const init = async () => {
            try {
                await loadSettings();
                await fetchData();
            } catch (error) {
                console.error('Initial Load Error:', safeErrorMetadata(error, 'initial-load'));
            }
        };
        init();
    }, []); // 앱 생명주기 동안 한 번만 실행

    useEffect(() => () => {
        // 화면을 벗어난 작업은 취소하며, 취소된 Job은 다음 Provider로 전환하지 않습니다.
        cancelActiveAIRequestJobs();
    }, [location.pathname]);

    return (
        <div className="min-h-screen bg-gradient-dark flex flex-col">
            <Navbar />
            <JjssFileSaveNotice />
            <ApiKeyOnboarding />
            <ApiKeyRequiredNotice />
            <PremiumUseConfirmDialog />
            <AIUsageNotice />
            <main className="pt-16 flex-1 relative">
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
