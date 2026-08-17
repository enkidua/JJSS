import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Cloud, Shield, Users, Car,
  Clock, FileCheck, Receipt, Mail, CalendarCheck,
  ClipboardList, Package, Calendar, Megaphone,
  Download, ExternalLink, CheckCircle2, Sparkles,
  Loader2, Check, AlertCircle, FolderOpen, Code2,
  Copy, Save, Trash2, ChevronDown
} from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.6, ease: 'easeOut' },
  }),
};

const modules = [
  { icon: Clock, label: '출퇴근 관리', desc: '종사자 근무기록 자동화', color: '#10b981' },
  { icon: Car, label: '차량 운행일지', desc: '차량별 운행기록 관리', color: '#6366f1' },
  { icon: FileCheck, label: '전자결재', desc: '기안·결재 전 과정 전자화', color: '#f59e0b' },
  { icon: Receipt, label: '세출총괄표', desc: '관·항·목·세목 자동생성', color: '#ec4899' },
  { icon: CalendarCheck, label: '연차·휴가 관리', desc: '휴가 신청 및 현황 관리', color: '#8b5cf6' },
  { icon: Mail, label: '이메일 발송', desc: '자동 이메일 발송 시스템', color: '#06b6d4' },
  { icon: ClipboardList, label: '프로그램 출석부', desc: '프로그램 참여 출결 관리', color: '#14b8a6' },
  { icon: Package, label: '자산 관리', desc: '비품·물품 등록 및 관리', color: '#ef4444' },
  { icon: Megaphone, label: '공지사항', desc: '전 직원 공지 발송·관리', color: '#f97316' },
  { icon: Calendar, label: '일정 관리', desc: '캘린더 통합 일정 관리', color: '#84cc16' },
  { icon: Users, label: '직원 관리', desc: '인사정보 통합 관리', color: '#a855f7' },
  { icon: Shield, label: '보안 관리', desc: '접근 권한 및 보안 설정', color: '#64748b' },
];

const steps = [
  { num: '01', title: '내 Drive에 DB 만들기', desc: '설치자 계정의 Google Drive에서 새 스프레드시트를 만들고 Apps Script를 엽니다.' },
  { num: '02', title: '코드 붙여넣기', desc: '복사 도우미에서 Code.gs, setup.gs, Index.html을 각각 복사해 Apps Script에 넣습니다.' },
  { num: '03', title: '웹앱 배포', desc: '실행 주체는 나, 액세스는 기관 상황에 맞게 설정하고 웹앱 URL을 복사합니다.' },
  { num: '04', title: '원클릭 초기화', desc: '배포된 업무시스템에 접속해 시스템 설정에서 데이터베이스 시트를 한 번에 만듭니다.' },
];

// 실제 설치에 사용하는 구글 드라이브 폴더와 배포된 Apps Script 웹앱 URL입니다.
const DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1nId08ISxtRhcC7tp0hkq35sQtKb9YGKB';
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwjeEQ_q31MZWfddKE6nZiVRkqJmnt2sOdHueccZolHGn7QNcQ7YoxjKRIt45TbGHD28w/exec';
const COPY_HELPER_URL = `${window.location.origin}/welfare-system-app/copy_helper.html`;
const LOCAL_DEV_URL = 'http://127.0.0.1:3001';
const LINK_STORAGE_KEY = 'jjss-welfare-system-links';

type SystemLink = {
  id: string;
  name: string;
  url: string;
  createdAt: string;
};

const defaultLinks: SystemLink[] = [
  {
    id: 'default',
    name: '내 업무시스템',
    url: GAS_WEB_APP_URL,
    createdAt: new Date().toISOString(),
  },
];

function normalizeSystemUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

function loadSystemLinks(): SystemLink[] {
  try {
    const saved = window.localStorage.getItem(LINK_STORAGE_KEY);
    if (!saved) return defaultLinks;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : defaultLinks;
  } catch {
    return defaultLinks;
  }
}

function createLinkId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `link-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function WelfareLauncher() {
  const [installState, setInstallState] = useState<'idle' | 'installing' | 'done' | 'error'>('idle');
  const [links, setLinks] = useState<SystemLink[]>(loadSystemLinks);
  const [selectedLinkId, setSelectedLinkId] = useState(() => loadSystemLinks()[0]?.id || 'default');
  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [linkMessage, setLinkMessage] = useState('');
  const [showExternalLinkForm, setShowExternalLinkForm] = useState(false);

  const selectedLink = links.find((link) => link.id === selectedLinkId) || links[0] || defaultLinks[0];

  const saveLinks = (nextLinks: SystemLink[]) => {
    setLinks(nextLinks);
    window.localStorage.setItem(LINK_STORAGE_KEY, JSON.stringify(nextLinks));
  };

  const handleInstall = () => {
    setInstallState('installing');

    window.open(DRIVE_FOLDER_URL, '_blank');
    window.open(COPY_HELPER_URL, '_blank');

    setTimeout(() => {
      setInstallState('done');
    }, 2000);
  };

  const handleAccessSystem = () => {
    window.open(selectedLink.url, '_blank');
  };

  const handleCreateAccessLink = async () => {
    const shareText = selectedLink.url;
    try {
      await navigator.clipboard.writeText(shareText);
      setLinkMessage('선택한 업무시스템 접속링크를 복사했습니다. 직원에게 그대로 전달하면 됩니다.');
    } catch {
      setLinkMessage('브라우저 보안 설정 때문에 자동 복사는 실패했습니다. 아래 저장된 링크를 선택해 전달해 주세요.');
    }
  };

  const handleSaveExternalLink = () => {
    const url = normalizeSystemUrl(newLinkUrl);
    if (!url || !newLinkName.trim()) {
      setLinkMessage('기관명과 업무시스템 URL을 모두 입력해 주세요.');
      return;
    }

    try {
      new URL(url);
    } catch {
      setLinkMessage('URL 형식이 올바르지 않습니다. https://script.google.com/.../exec 형태로 입력해 주세요.');
      return;
    }

    const nextLink: SystemLink = {
      id: createLinkId(),
      name: newLinkName.trim(),
      url,
      createdAt: new Date().toISOString(),
    };
    const nextLinks = [nextLink, ...links];
    saveLinks(nextLinks);
    setSelectedLinkId(nextLink.id);
    setNewLinkName('');
    setNewLinkUrl('');
    setLinkMessage('다른 기관/사용자의 업무시스템 접속링크를 저장했습니다.');
  };

  const handleRemoveLink = (id: string) => {
    const nextLinks = links.filter((link) => link.id !== id);
    saveLinks(nextLinks.length > 0 ? nextLinks : defaultLinks);
    if (selectedLinkId === id) {
      setSelectedLinkId((nextLinks[0] || defaultLinks[0]).id);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-28 px-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-violet-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-8">
              <Cloud className="w-4 h-4 text-emerald-400" />
              <span className="text-sm text-emerald-300 font-medium">Google Workspace 기반 협업 시스템</span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight mb-6"
          >
            <span className="text-white">복지관</span>
            <br />
            <span className="gradient-text" style={{ backgroundImage: 'linear-gradient(135deg, #6ee7b7, #818cf8)' }}>
              업무지원 인트라넷
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            구글 드라이브에 설치되는 올인원 업무 시스템.
            <br className="hidden md:block" />
            차량, 인사, 회계, 결재까지 모든 업무를 하나의 플랫폼에서 처리하세요.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            {/* 설치 버튼 */}
            <button
              onClick={handleInstall}
              disabled={installState === 'installing'}
              className="btn-primary flex items-center gap-2 text-base !px-8 !py-4"
              style={{ 
                background: installState === 'done' 
                  ? 'linear-gradient(135deg, #059669, #10b981)' 
                  : 'linear-gradient(135deg, #059669, #10b981)',
                opacity: installState === 'installing' ? 0.7 : 1,
              }}
            >
              <AnimatePresence mode="wait">
                {installState === 'idle' && (
                  <motion.span key="idle" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Download className="w-5 h-5" />
                    설치 자료 열기
                  </motion.span>
                )}
                {installState === 'installing' && (
                  <motion.span key="installing" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    설치 중...
                  </motion.span>
                )}
                {installState === 'done' && (
                  <motion.span key="done" className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <Check className="w-5 h-5" />
                    설치 완료!
                  </motion.span>
                )}
              </AnimatePresence>
            </button>

            {/* 접속 버튼 */}
            <button
              onClick={handleAccessSystem}
              className="btn-secondary flex items-center gap-2 text-base"
            >
              업무시스템 접속하기
              <ExternalLink className="w-4 h-4" />
            </button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.38 }}
            className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <button
              onClick={handleCreateAccessLink}
              className="btn-secondary flex items-center gap-2 text-sm !px-5 !py-3"
            >
              <Copy className="w-4 h-4" />
              업무시스템 접속링크 만들기
            </button>
            <button
              onClick={() => setShowExternalLinkForm((value) => !value)}
              className="btn-secondary flex items-center gap-2 text-sm !px-5 !py-3"
            >
              <ExternalLink className="w-4 h-4" />
              외부 업무시스템 접속하기
              <ChevronDown className={`w-4 h-4 transition-transform ${showExternalLinkForm ? 'rotate-180' : ''}`} />
            </button>
          </motion.div>

          <AnimatePresence>
            {showExternalLinkForm && (
              <motion.div
                initial={{ opacity: 0, y: 10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 10, height: 0 }}
                className="mt-4 max-w-2xl mx-auto overflow-hidden"
              >
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr_auto] gap-3">
                    <input
                      value={newLinkName}
                      onChange={(event) => setNewLinkName(event.target.value)}
                      placeholder="기관명"
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-white text-sm outline-none"
                    />
                    <input
                      value={newLinkUrl}
                      onChange={(event) => setNewLinkUrl(event.target.value)}
                      placeholder="업무시스템 URL"
                      className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2.5 text-white text-sm outline-none"
                    />
                    <button onClick={handleSaveExternalLink} className="btn-primary flex items-center justify-center gap-2 text-sm !px-4 !py-2.5">
                      <Save size={15} />
                      저장
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    {links.map((link) => (
                      <button
                        key={link.id}
                        onClick={() => setSelectedLinkId(link.id)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${selectedLink.id === link.id ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' : 'border-white/10 bg-white/[0.03] text-white/45'}`}
                      >
                        {link.name}
                        {link.id !== 'default' && (
                          <span
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRemoveLink(link.id);
                            }}
                            className="text-white/35 hover:text-rose-300"
                          >
                            <Trash2 size={12} />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 설치 완료 후 안내 */}
          <AnimatePresence>
            {installState === 'done' && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-6 inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
              >
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span className="text-sm text-emerald-300">
                  Drive 폴더와 코드 복사 도우미를 열었습니다. 배포 URL이 나오면 아래 외부 업무시스템 접속하기에 저장해 주세요.
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {linkMessage && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-200 text-sm"
              >
                <CheckCircle2 size={15} />
                {linkMessage}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* 설치 링크 */}
      <section className="px-4 pb-12">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: FolderOpen, title: '1. 설치자 Drive 열기', desc: '설치자 계정에 업무 데이터베이스 스프레드시트를 만듭니다.', url: DRIVE_FOLDER_URL },
            { icon: Code2, title: '2. Apps Script 코드 복사', desc: 'Code.gs, setup.gs, Index.html을 순서대로 복사합니다.', url: COPY_HELPER_URL },
            { icon: ExternalLink, title: '3. 저장된 업무시스템 접속', desc: '배포 URL을 저장한 뒤 기관 업무시스템으로 접속합니다.', url: selectedLink.url },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <motion.a
                key={item.title}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="glass-card !p-5 block no-underline"
              >
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <Icon size={20} className="text-emerald-300" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-base mb-1">{item.title}</h3>
                    <p className="text-white/50 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              </motion.a>
            );
          })}
        </div>
        <p className="max-w-5xl mx-auto mt-4 text-xs text-white/35">
          로컬 개발용 주소: {LOCAL_DEV_URL} (개발 서버가 켜져 있을 때만 열립니다)
        </p>
      </section>

      {/* How it works */}
      <section className="px-4 pb-20">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="section-title mb-3">이렇게 시작합니다</h2>
            <p className="text-white/40 text-lg">반자동 설치와 원클릭 초기화로 설치자 계정의 Google Drive에서 운영합니다</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.num}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="glass-card text-center"
              >
                <div className="text-3xl font-black text-white/10 mb-3">{step.num}</div>
                <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-4 pb-24">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="section-title mb-3">탑재 모듈</h2>
            <p className="text-white/40 text-lg">복지관 업무의 모든 것을 하나의 시스템으로</p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {modules.map((mod, i) => {
              const Icon = mod.icon;
              return (
                <motion.div
                  key={mod.label}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="glass-card group cursor-default text-center !p-5"
                >
                  <div
                    className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center group-hover:scale-110 transition-transform"
                    style={{ background: `${mod.color}20` }}
                  >
                    <Icon size={22} style={{ color: mod.color }} />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">{mod.label}</h3>
                  <p className="text-white/40 text-xs">{mod.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Banner */}
      <section className="px-4 pb-20">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-card !p-8"
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">왜 구글 워크스페이스 기반인가요?</h3>
                <p className="text-white/45 text-sm">별도 서버 비용 없이 구글 드라이브가 서버 역할을 합니다.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                '추가 서버 비용 ₩0 — 구글 드라이브가 서버',
                '기존 구글 계정으로 즉시 로그인',
                '구글 시트로 데이터 직접 확인·수정 가능',
                '구글 캘린더·메일과 실시간 연동',
                '모바일에서도 언제 어디서나 접속',
                '자동 백업 및 버전 관리 내장',
              ].map((benefit, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-white/65">
                  <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                  {benefit}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
