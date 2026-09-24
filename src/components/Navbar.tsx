import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Menu, X, Sparkles, Wand2, Users, LayoutDashboard, ChevronDown, DollarSign, Settings, Download, Upload, FileSearch, GraduationCap, Archive, ClipboardList } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { useBackupActions } from '../hooks/useBackupActions';
import { preloadPage } from '../pagePreload';

const navItems = [
    { path: '/', label: '서비스 소개', shortLabel: '홈', icon: Home },
    { path: '/manage', label: '이용자 및 사업체 관리', shortLabel: '이용자·사업체', icon: Users },
    { path: '/overview', label: '직업재활 현황판', shortLabel: '현황판', icon: ClipboardList },
    { path: '/evaluation', label: '직업평가', icon: FileSearch },
    { path: '/training', label: '직업훈련', icon: GraduationCap },
    { path: '/workmate', label: '고용지원', icon: LayoutDashboard },
    { path: '/budget', label: '예산 관리', shortLabel: '예산', icon: DollarSign },
    { path: '/tools', label: '업무 지원 도구', shortLabel: '업무 도구', icon: Wand2 },
    { path: '/infomate', label: '자료수집', icon: Archive },
    { path: '/settings', label: '설정', icon: Settings },
];

export default function Navbar() {
    const { profile } = useAuthStore();
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);
    const profileButtonRef = useRef<HTMLButtonElement>(null);
    const mobileButtonRef = useRef<HTMLButtonElement>(null);
    const { startExport, chooseRestoreFile, busy: backupBusy, backupDialog } = useBackupActions();

    const closeMobileMenu = (restoreFocus = false) => {
        setMobileOpen(false);
        if (restoreFocus) {
            window.requestAnimationFrame(() => mobileButtonRef.current?.focus());
        }
    };

    // 드롭다운 외부 클릭 시 닫기
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setProfileOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // 키보드로 메뉴를 닫으면 메뉴를 열었던 버튼으로 포커스를 돌려줍니다.
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (profileOpen) {
                setProfileOpen(false);
                window.requestAnimationFrame(() => profileButtonRef.current?.focus());
            } else if (mobileOpen) {
                closeMobileMenu(true);
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [mobileOpen, profileOpen]);

    useEffect(() => {
        setMobileOpen(false);
        setProfileOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!mobileOpen) return;
        const media = window.matchMedia('(min-width: 768px)');
        const closeOnDesktop = () => { if (media.matches) setMobileOpen(false); };
        media.addEventListener('change', closeOnDesktop);
        closeOnDesktop();
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
            media.removeEventListener('change', closeOnDesktop);
        };
    }, [mobileOpen]);

    // 데이터 내보내기·불러오기 (설정 화면과 같은 공용 동작)
    const handleExport = () => {
        setProfileOpen(false);
        startExport();
    };

    const handleImport = () => {
        setProfileOpen(false);
        chooseRestoreFile();
    };

    return (
        <nav aria-label="주요 메뉴" className="fixed top-0 left-0 right-0 z-40 glass-strong">
            <div className="relative z-30 max-w-7xl 2xl:max-w-[90rem] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link to="/" aria-label="JJSS 서비스 소개로 이동" className="flex items-center gap-2 sm:gap-3 group shrink-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.3)] relative overflow-hidden">
                            <div className="absolute inset-0 bg-white/20 blur-xl group-hover:bg-white/30 transition-all rounded-full" />
                            <Sparkles className="w-5 h-5 text-white relative z-10" />
                        </div>
                        <span className="text-xl font-black gradient-text hidden sm:block whitespace-nowrap tracking-tight shrink-0"><span className="2xl:hidden">JJSS</span><span className="hidden 2xl:inline">직업재활지원시스템</span></span>
                    </Link>

                    {/* Desktop Nav */}
                    <div className="hidden md:flex items-center gap-1 overflow-visible">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.path;
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    onClick={() => setMobileOpen(false)}
                                    onMouseEnter={() => void preloadPage(item.path)}
                                    onFocus={() => void preloadPage(item.path)}
                                    aria-label={item.label}
                                    aria-current={isActive ? 'page' : undefined}
                                    className={`group/nav-item relative flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap transition-all duration-200 ${isActive
                                        ? 'text-white bg-white/10 tab-active'
                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <Icon aria-hidden="true" className="w-4 h-4 shrink-0" />
                                    <span className="hidden xl:inline">{item.shortLabel || item.label}</span>
                                    <span
                                        aria-hidden="true"
                                        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-lg border border-white/15 bg-slate-950/95 px-2.5 py-1.5 text-xs font-semibold text-white opacity-0 shadow-xl transition-opacity group-hover/nav-item:opacity-100 group-focus-visible/nav-item:opacity-100"
                                    >
                                        {item.label}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Profile area */}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-2 relative" ref={profileRef}>
                            <button
                                ref={profileButtonRef}
                                type="button"
                                aria-label={`${profile?.displayName || '사용자'} 메뉴`}
                                aria-expanded={profileOpen}
                                aria-controls="profile-menu"
                                onClick={() => {
                                    setProfileOpen(!profileOpen);
                                    setMobileOpen(false);
                                }}
                                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
                            >
                                <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-full bg-gradient-to-tr from-primary-600 to-accent-600 flex items-center justify-center text-white text-xs sm:text-sm font-bold shadow-lg">
                                    {profile?.displayName?.charAt(0) || 'U'}
                                </div>
                                <span className="text-sm font-bold text-white/90 hidden lg:inline max-w-[80px] xl:max-w-[120px] truncate">{profile?.displayName}</span>
                                <ChevronDown aria-hidden="true" className={`w-4 h-4 text-white/50 shrink-0 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Profile Dropdown */}
                            <AnimatePresence>
                                {profileOpen && (
                                    <motion.div
                                        id="profile-menu"
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        transition={{ duration: 0.15 }}
                                        className="absolute right-0 top-full mt-2 w-64 glass-strong rounded-2xl border border-white/10 shadow-2xl overflow-hidden py-2"
                                    >
                                        <div className="px-5 py-3 border-b border-white/10 bg-white/5">
                                            <p className="text-white font-bold">{profile?.displayName}</p>
                                            <div className="mt-2 text-xs font-semibold px-2 py-1 bg-accent-500/20 text-accent-300 rounded-md inline-block">
                                                로컬 전용 모드
                                            </div>
                                        </div>

                                        <div className="p-2 flex flex-col gap-1 text-sm font-medium">
                                            <Link
                                                to="/settings"
                                                onClick={() => setProfileOpen(false)}
                                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-left"
                                            >
                                                <Settings aria-hidden="true" className="w-4 h-4" /> 시스템 설정
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={handleExport}
                                                disabled={backupBusy}
                                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-left disabled:opacity-50"
                                            >
                                                <Download aria-hidden="true" className="w-4 h-4" /> 데이터 내보내기
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleImport}
                                                disabled={backupBusy}
                                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-left disabled:opacity-50"
                                            >
                                                <Upload aria-hidden="true" className="w-4 h-4" /> 데이터 불러오기
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Mobile toggle */}
                        <button
                            ref={mobileButtonRef}
                            type="button"
                            aria-label={mobileOpen ? '모바일 메뉴 닫기' : '모바일 메뉴 열기'}
                            aria-expanded={mobileOpen}
                            aria-controls="mobile-navigation"
                            className="md:hidden btn-ghost !p-2"
                            onClick={() => {
                                setMobileOpen(!mobileOpen);
                                setProfileOpen(false);
                            }}
                        >
                            {mobileOpen ? <X aria-hidden="true" className="w-5 h-5" /> : <Menu aria-hidden="true" className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Nav */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            aria-hidden="true"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => closeMobileMenu(true)}
                            className="fixed inset-0 top-16 z-10 bg-black/60 md:hidden"
                        />
                        <motion.div
                            id="mobile-navigation"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="relative z-20 max-h-[calc(100vh-4rem)] overflow-y-auto overscroll-contain border-t border-white/10 glass-strong md:hidden"
                        >
                            <div className="px-4 py-3 space-y-1">
                                {navItems.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = location.pathname === item.path;
                                    return (
                                        <Link
                                            key={item.path}
                                            to={item.path}
                                            aria-current={isActive ? 'page' : undefined}
                                            onClick={() => closeMobileMenu(false)}
                                            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'
                                                }`}
                                        >
                                            <Icon aria-hidden="true" className="w-4 h-4" />
                                            {item.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            {backupDialog}
        </nav>
    );
}
