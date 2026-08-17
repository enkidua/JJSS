import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Menu, X, Sparkles, Wand2, Users, LayoutDashboard, ChevronDown, DollarSign, Settings, Download, Upload, FileSearch, GraduationCap, Archive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { exportAllData, importAllData } from '../config/localDB';
import { saveJjssText, savedLocationMessage } from '../utils/jjssFileService';

const navItems = [
    { path: '/', label: '서비스 소개', icon: Home },
    { path: '/manage', label: '이용자 및 사업체 관리', icon: Users },
    { path: '/evaluation', label: '직업평가', icon: FileSearch },
    { path: '/training', label: '직업훈련', icon: GraduationCap },
    { path: '/workmate', label: '고용지원', icon: LayoutDashboard },
    { path: '/budget', label: '예산 관리', icon: DollarSign },
    { path: '/tools', label: '업무 지원 도구', icon: Wand2 },
    { path: '/infomate', label: '자료수집', icon: Archive },
    { path: '/settings', label: '설정', icon: Settings },
];

export default function Navbar() {
    const { profile } = useAuthStore();
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

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

    // 데이터 내보내기
    const handleExport = async () => {
        try {
            const json = await exportAllData();
            const result = await saveJjssText('backup', `JJSS_backup_${new Date().toISOString().split('T')[0]}.json`, json, 'application/json');
            if (result.canceled) alert(savedLocationMessage(result));
            setProfileOpen(false);
        } catch (err) {
            alert('데이터 내보내기 중 오류가 발생했습니다.');
        }
    };

    // 데이터 불러오기
    const handleImport = async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                if (window.confirm('기존 데이터가 불러온 데이터로 대체됩니다. 계속하시겠습니까?')) {
                    await importAllData(text);
                    window.location.reload();
                }
            } catch (err) {
                alert('데이터 불러오기 중 오류가 발생했습니다. 올바른 백업 파일인지 확인해주세요.');
            }
        };
        input.click();
        setProfileOpen(false);
    };

    return (
        <nav className="fixed top-0 left-0 right-0 z-40 glass-strong">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <Link to="/" className="flex items-center gap-2 sm:gap-3 group shrink-0">
                        <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.3)] relative overflow-hidden">
                            <div className="absolute inset-0 bg-white/20 blur-xl group-hover:bg-white/30 transition-all rounded-full" />
                            <Sparkles className="w-5 h-5 text-white relative z-10" />
                        </div>
                        <span className="text-lg sm:text-lg md:text-xl font-black gradient-text hidden sm:block whitespace-nowrap tracking-tight drop-shadow-sm shrink-0">직업재활지원시스템</span>
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
                                    className={`relative flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3 py-2 rounded-xl text-[13px] lg:text-sm font-medium whitespace-nowrap transition-all duration-200 ${isActive
                                        ? 'text-white bg-white/10 tab-active'
                                        : 'text-white/60 hover:text-white hover:bg-white/5'
                                        }`}
                                >
                                    <Icon className="w-4 h-4 shrink-0" />
                                    <span className="hidden xl:inline">{item.label}</span>
                                </Link>
                            );
                        })}
                    </div>

                    {/* Profile area */}
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-2 relative" ref={profileRef}>
                            <button
                                onClick={() => setProfileOpen(!profileOpen)}
                                className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-xl hover:bg-white/5 transition-colors whitespace-nowrap shrink-0"
                            >
                                <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 rounded-full bg-gradient-to-tr from-primary-600 to-accent-600 flex items-center justify-center text-white text-xs sm:text-sm font-bold shadow-lg">
                                    {profile?.displayName?.charAt(0) || 'U'}
                                </div>
                                <span className="text-sm font-bold text-white/90 hidden lg:inline max-w-[80px] xl:max-w-[120px] truncate">{profile?.displayName}</span>
                                <ChevronDown className="w-4 h-4 text-white/50 shrink-0" />
                            </button>

                            {/* Profile Dropdown */}
                            <AnimatePresence>
                                {profileOpen && (
                                    <motion.div
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
                                                <Settings className="w-4 h-4" /> API 설정
                                            </Link>
                                            <button
                                                onClick={handleExport}
                                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-left"
                                            >
                                                <Download className="w-4 h-4" /> 데이터 내보내기
                                            </button>
                                            <button
                                                onClick={handleImport}
                                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors text-left"
                                            >
                                                <Upload className="w-4 h-4" /> 데이터 불러오기
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Mobile toggle */}
                        <button className="md:hidden btn-ghost !p-2" onClick={() => setMobileOpen(!mobileOpen)}>
                            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Nav */}
            <AnimatePresence>
                {mobileOpen && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden glass-strong border-t border-white/10"
                    >
                        <div className="px-4 py-3 space-y-1">
                            {navItems.map((item) => {
                                const Icon = item.icon;
                                const isActive = location.pathname === item.path;
                                return (
                                    <Link
                                        key={item.path}
                                        to={item.path}
                                        onClick={() => setMobileOpen(false)}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${isActive ? 'text-white bg-white/10' : 'text-white/60 hover:text-white hover:bg-white/5'
                                            }`}
                                    >
                                        <Icon className="w-4 h-4" />
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </nav>
    );
}
