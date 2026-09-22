import { motion } from 'framer-motion';
import { Sparkles, ArrowRight, LayoutDashboard, Wand2, UserCheck, Building2, FileSearch, GraduationCap, DollarSign, Archive } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDataStore } from '../store/dataStore';

const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.1, duration: 0.6, ease: 'easeOut' },
    }),
};

const features = [
    {
        icon: UserCheck,
        title: '이용자 및 사업체 관리',
        desc: '이용자·사업체·구인 정보를 등록하고 수정하며, 직업평가·훈련·고용지원에서 불러와 사용합니다.',
        color: 'from-emerald-500 to-teal-600',
        path: '/manage',
    },
    {
        icon: LayoutDashboard,
        title: '직업재활 현황판',
        desc: '이용자별 후속 일정, 목표 변화와 작성된 사례문서를 한곳에서 확인합니다.',
        color: 'from-teal-500 to-cyan-600',
        path: '/overview',
    },
    {
        icon: FileSearch,
        title: '직업평가',
        desc: 'PDF·이미지·텍스트 검사 결과를 분석하고, 직업평가 종합소견서를 작성·보완합니다.',
        color: 'from-blue-500 to-cyan-600',
        path: '/evaluation',
    },
    {
        icon: GraduationCap,
        title: '직업훈련',
        desc: '훈련실, 훈련생 배정, 출석, 훈련상황/진도, 계획·상담일지·평가·공유 기록을 관리합니다.',
        color: 'from-violet-500 to-indigo-600',
        path: '/training',
    },
    {
        icon: LayoutDashboard,
        title: '고용지원',
        desc: '사례문서 연속작성, AI 정밀 매칭, 면접일지, 직무분석지, 작성 내용 점검을 지원합니다.',
        color: 'from-purple-500 to-pink-600',
        path: '/workmate',
    },
    {
        icon: DollarSign,
        title: '예산 관리',
        desc: '지출 등록, 영수증 OCR 입력 보조, 지출 목록 관리, 선택 항목 기반 지출품의서를 지원합니다.',
        color: 'from-sky-500 to-blue-600',
        path: '/budget',
    },
    {
        icon: Wand2,
        title: '업무 지원 도구',
        desc: '문서 OCR, 개인정보 비식별화, 홍보물/일정표 생성, 데이터 시각화, 위기대응 도구를 제공합니다.',
        color: 'from-amber-500 to-orange-600',
        path: '/tools',
    },
    {
        icon: Archive,
        title: '자료수집',
        desc: '기관 홈페이지, 서적, 유튜브, 블로그 등 직업재활 관련 자료를 모아 검색하고 관리합니다.',
        color: 'from-rose-500 to-orange-500',
        path: '/infomate',
    },
];

export default function Home() {
    const { seekers, jobs } = useDataStore();

    return (
        <div className="min-h-screen">
            {/* Hero Section */}
            <section className="relative overflow-hidden py-20 md:py-32 px-4">
                {/* Background decoration */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-600/20 rounded-full blur-3xl" />
                    <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-600/20 rounded-full blur-3xl" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary-500/5 rounded-full blur-3xl" />
                </div>

                <div className="relative max-w-5xl mx-auto text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6 }}
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 mb-8">
                            <Sparkles className="w-4 h-4 text-primary-400" />
                            <span className="text-sm text-primary-300 font-medium">AI 기반 직업재활 지원 시스템</span>
                        </div>
                    </motion.div>

                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.1 }}
                        className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight mb-6"
                    >
                        <span className="text-white">장애인 취업알선 및</span>
                        <br />
                        <span className="gradient-text">직업재활 지원 시스템</span>
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed"
                    >
                        사회복지·직업재활 현장에서 바로 쓰는 업무지원 시스템입니다.
                        <br className="hidden md:block" />
                        이용자 관리부터 직업평가, 훈련, 고용지원, 예산, 업무도구까지 한 곳에서 관리하세요.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="flex flex-col sm:flex-row items-center justify-center gap-4"
                    >
                        <Link to="/manage" className="btn-primary flex items-center gap-2 text-base !px-8 !py-4">
                            시작하기
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                        <button 
                            onClick={() => {
                                const el = document.getElementById('features');
                                if (el) el.scrollIntoView({ behavior: 'smooth' });
                            }} 
                            className="btn-secondary flex items-center gap-2 text-base"
                        >
                            기능 살펴보기
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* 등록 현황 카드 */}
            <section className="px-4 pb-10">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                    >
                        <div className="glass-card !p-6 flex items-center gap-5 group hover:border-accent-500/30 transition-all">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-accent-500/20 group-hover:scale-110 transition-transform">
                                <UserCheck className="w-7 h-7 text-white" />
                            </div>
                            <div>
                                <p className="text-white/40 text-sm font-medium">등록 이용자 (장애인)</p>
                                <p className="text-3xl font-black text-white mt-0.5">
                                    {seekers.length}<span className="text-base font-medium text-white/50 ml-1">명</span>
                                </p>
                            </div>
                        </div>
                        <div className="glass-card !p-6 flex items-center gap-5 group hover:border-primary-500/30 transition-all">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-blue-500 flex items-center justify-center shadow-lg shadow-primary-500/20 group-hover:scale-110 transition-transform">
                                <Building2 className="w-7 h-7 text-white" />
                            </div>
                            <div>
                                <p className="text-white/40 text-sm font-medium">등록 사업체</p>
                                <p className="text-3xl font-black text-white mt-0.5">
                                    {jobs.length}<span className="text-base font-medium text-white/50 ml-1">개</span>
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* Info Banner */}
            <section className="px-4 pb-16">
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="glass-card !p-8 text-center"
                    >
                        <p className="text-white/70 leading-relaxed text-base">
                            이 서비스는 <span className="text-primary-400 font-semibold">사회복지 기관의 직업재활 업무</span>를 실제 기록과 데이터 중심으로 돕기 위해 정리되었습니다.
                            <br className="hidden md:block" />
                            이용자·사업체 정보, 사례문서, 훈련기록, 예산 지출, 업무도구가 서로 끊기지 않게 이어지도록 구성했습니다.
                        </p>
                    </motion.div>
                </div>
            </section>

            {/* Features */}
            <section id="features" className="px-4 pb-24">
                <div className="max-w-6xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="text-center mb-16"
                    >
                        <h2 className="section-title mb-4">주요 기능</h2>
                        <p className="text-white/50 text-lg">현재 연결되어 실제 사용할 수 있는 핵심 기능입니다.</p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {features.map((feature, i) => {
                            const Icon = feature.icon;
                            return (
                                <motion.div
                                    key={feature.title}
                                    custom={i}
                                    variants={fadeUp}
                                    initial="hidden"
                                    whileInView="visible"
                                    viewport={{ once: true }}
                                    className="glass-card group"
                                >
                                    <Link to={feature.path} className="block h-full">
                                        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                                            <Icon className="w-6 h-6 text-white" />
                                        </div>
                                        <div className="flex items-start justify-between gap-3">
                                            <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
                                            <ArrowRight className="w-4 h-4 text-white/25 group-hover:text-white/60 transition-colors shrink-0 mt-1" />
                                        </div>
                                        <p className="text-white/50 text-sm leading-relaxed">{feature.desc}</p>
                                    </Link>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-white/5 py-8 px-4">
                <div className="max-w-6xl mx-auto text-center">
                    <p className="text-white/30 text-sm">
                        © 2026 직업재활지원시스템 — 사회복지 기관 업무지원 및 직업재활 기록 관리 시스템.
                    </p>
                </div>
            </footer>
        </div>
    );
}
