import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Hash, Type, Search, GitCompare, CopyMinus, AlignLeft,
    ArrowDownUp, Code2, Link, Binary, FileJson, Palette, Calculator,
    Braces, Asterisk, Eye, Globe, Fingerprint, Shuffle, FileText, ShieldCheck, X,
    FileUp, Download
} from 'lucide-react';
import { getTextFileValidationError } from '../utils/fileValidation';
import { saveJjssText } from '../utils/jjssFileService';
import { anonymizeText } from '../utils/anonymizer';
import { collectKnownNames } from '../services/knownNames';
import { numberToKorean } from '../utils/currency';
import { CopyButton } from './common/CopyButton';
import { FileDropZone } from './common/FileDropZone';
import { useConfirm } from './common/ConfirmProvider';
import { useToast } from './Toast';
import { ToolPageShell } from './tools/ToolPageShell';
import { useReportDirty } from './tools/useReportDirty';

interface UtilitiesViewProps {
    onBack: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

const UTILS = [
    { id: 'count', title: '글자수 세기', desc: '글자, 단어, 문장, 읽기 시간 등을 카운트합니다', icon: Hash, bg: 'bg-blue-500' },
    { id: 'case', title: '대소문자 변환', desc: '대문자, 소문자, 타이틀 케이스 등으로 변환', icon: Type, bg: 'bg-orange-500' },
    { id: 'find', title: '찾기 & 바꾸기', desc: '특정 텍스트 문자열을 찾아 바꿉니다', icon: Search, bg: 'bg-purple-500' },
    { id: 'diff', title: '텍스트 비교', desc: '두 텍스트를 비교하고 차이점을 시각화합니다', icon: GitCompare, bg: 'bg-teal-500' },
    { id: 'dedup', title: '중복 줄 제거', desc: '텍스트에서 중복된 줄을 제거합니다', icon: CopyMinus, bg: 'bg-orange-500' },
    { id: 'space', title: '공백 정리', desc: '불필요한 공백과 빈 줄을 제거합니다', icon: AlignLeft, bg: 'bg-slate-500' },
    { id: 'sort', title: '줄 정렬', desc: '텍스트 줄을 오름차순 또는 내림차순으로 정렬', icon: ArrowDownUp, bg: 'bg-emerald-500' },
    { id: 'html', title: 'HTML 태그 제거', desc: 'HTML 태그를 제거하고 순수 텍스트를 추출', icon: Code2, bg: 'bg-pink-500' },
    { id: 'url', title: 'URL 인코딩/디코딩', desc: 'URL 문자열을 인코딩하고 디코딩합니다', icon: Link, bg: 'bg-cyan-500' },
    { id: 'base64', title: 'Base64 인코딩/디코딩', desc: 'Base64 문자열을 인코딩하고 디코딩합니다', icon: Binary, bg: 'bg-indigo-500' },
    { id: 'csvjson', title: 'CSV ↔ JSON 변환', desc: 'CSV와 JSON 형식 간 변환합니다', icon: FileJson, bg: 'bg-yellow-500' },
    { id: 'color', title: '색상 코드 변환', desc: 'HEX 색상 코드를 RGB로 변환합니다', icon: Palette, bg: 'bg-fuchsia-500' },
    { id: 'numKor', title: '숫자 → 한글 변환', desc: '숫자를 한글 표기로 변환합니다', icon: Calculator, bg: 'bg-red-500' },
    { id: 'json', title: 'JSON 포맷터', desc: 'JSON 데이터를 포맷팅, 압축, 검증합니다', icon: Braces, bg: 'bg-green-500' },
    { id: 'regex', title: '정규식 테스터', desc: '정규표현식을 테스트하고 매칭 결과를 봅니다', icon: Asterisk, bg: 'bg-rose-500' },
    { id: 'md', title: '마크다운 미리보기', desc: '마크다운 텍스트를 HTML로 렌더링합니다', icon: Eye, bg: 'bg-violet-500' },
    { id: 'slug', title: '슬러그 생성기', desc: 'URL 친화적인 슬러그를 자동 생성합니다', icon: Globe, bg: 'bg-blue-600' },
    { id: 'hash', title: '해시 생성기', desc: 'SHA-256 해시를 생성합니다', icon: Fingerprint, bg: 'bg-slate-600' },
    { id: 'random', title: '랜덤 문자열 생성', desc: '안전한 랜덤 문자열과 비밀번호를 생성합니다', icon: Shuffle, bg: 'bg-cyan-500' },
    { id: 'lorem', title: 'Lorem Ipsum 생성', desc: '필요한 만큼 플레이스홀더 텍스트를 생성', icon: FileText, bg: 'bg-lime-500' },
    { id: 'mask', title: '개인정보 마스킹', desc: '전화번호, 이메일, 주민번호, "이름:" 뒤의 이름 등을 가립니다', icon: ShieldCheck, bg: 'bg-emerald-600' },
] as const;

type UtilityTool = typeof UTILS[number];

/** 입력칸 대신 "개수"만 받는 도구: 입력이 비어 있어도 기본값으로 실행합니다. */
const OPTIONAL_INPUT_TOOLS = new Set<UtilityTool['id']>(['random', 'lorem']);
const RANDOM_CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
const MAX_REGEX_MATCHES = 500;

function errorMessage(error: unknown) {
    return error instanceof Error && error.message ? error.message : '알 수 없는 오류';
}

/** crypto.getRandomValues로 치우침 없이 문자를 고릅니다. */
function secureRandomString(length: number) {
    const limit = Math.floor(0x100000000 / RANDOM_CHARSET.length) * RANDOM_CHARSET.length;
    const result: string[] = [];
    const buffer = new Uint32Array(length * 2);
    while (result.length < length) {
        crypto.getRandomValues(buffer);
        for (const value of buffer) {
            if (value >= limit) continue;
            result.push(RANDOM_CHARSET[value % RANDOM_CHARSET.length]);
            if (result.length >= length) break;
        }
    }
    return result.join('');
}

function encodeBase64(text: string) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
}

function decodeBase64(text: string) {
    const binary = atob(text.trim());
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function UtilitiesView({ onBack, onDirtyChange }: UtilitiesViewProps) {
    const { showToast } = useToast();
    const confirm = useConfirm();
    const [selectedUtil, setSelectedUtil] = useState<UtilityTool | null>(null);
    const [input, setInput] = useState('');
    const [input2, setInput2] = useState('');
    const [findStr, setFindStr] = useState('');
    const [replaceStr, setReplaceStr] = useState('');
    const [output, setOutput] = useState('');

    const hasContent = Boolean(input.trim() || input2.trim() || output);
    useReportDirty(Boolean(selectedUtil) && hasContent, onDirtyChange);

    const openTool = (tool: UtilityTool) => {
        setSelectedUtil(tool);
        setInput('');
        setInput2('');
        setFindStr('');
        setReplaceStr('');
        setOutput('');
    };

    const closeTool = async () => {
        if (hasContent && !(await confirm({
            title: '도구 닫기',
            message: '입력한 내용과 결과가 사라집니다. 닫을까요?',
            confirmLabel: '닫기',
            cancelLabel: '계속 사용',
            tone: 'danger',
        }))) return;
        setSelectedUtil(null);
    };

    const handleFiles = (files: File[]) => {
        const file = files[0];
        if (!file) return;
        const validationError = getTextFileValidationError(file);
        if (validationError) {
            showToast(validationError, 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => setInput(String(reader.result ?? ''));
        reader.onerror = () => showToast('파일을 읽지 못했습니다.', 'error');
        reader.readAsText(file);
    };

    const processText = async () => {
        if (!selectedUtil) return;
        const id = selectedUtil.id;
        if (!input && !OPTIONAL_INPUT_TOOLS.has(id)) {
            setOutput('처리할 텍스트를 먼저 입력해 주세요.');
            return;
        }
        let res = '';
        try {
            switch (id) {
                case 'count': {
                    const chars = input.length;
                    const charNoSpace = input.replace(/\s/g, '').length;
                    const words = input.trim().split(/\s+/).filter(x => x).length;
                    const lines = input.split('\n').filter(x => x).length;
                    const byteLen = new TextEncoder().encode(input).length;
                    res = `[결과 리포트]\n- 글자수 (공백 포함): ${chars.toLocaleString()}자\n- 글자수 (공백 제외): ${charNoSpace.toLocaleString()}자\n- 단어 수: ${words.toLocaleString()}개\n- 줄 수: ${lines.toLocaleString()}줄\n- 바이트: ${byteLen.toLocaleString()} bytes\n- 예상 읽기 시간: ${Math.ceil(words / 200)}분`;
                    break;
                }
                case 'case': {
                    const title = input.split(' ').map(s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '').join(' ');
                    res = `[대문자]\n${input.toUpperCase()}\n\n[소문자]\n${input.toLowerCase()}\n\n[타이틀 케이스]\n${title}`;
                    break;
                }
                case 'find':
                    if (!findStr) throw new Error('찾을 단어를 입력해주세요.');
                    res = input.split(findStr).join(replaceStr);
                    break;
                case 'diff': {
                    const lines1 = input.split('\n');
                    const lines2 = input2.split('\n');
                    const maxLines = Math.max(lines1.length, lines2.length);
                    let diffRes = '';
                    for (let i = 0; i < maxLines; i++) {
                        const l1 = lines1[i] || '';
                        const l2 = lines2[i] || '';
                        if (l1 !== l2) diffRes += `[${i + 1}번째 줄] 차이 발생:\n- 원본: ${l1}\n+ 변경: ${l2}\n\n`;
                    }
                    res = diffRes ? `[줄 단위 비교 결과]\n${diffRes}` : '두 텍스트가 완벽히 일치합니다.';
                    break;
                }
                case 'dedup':
                    res = Array.from(new Set(input.split('\n'))).join('\n');
                    break;
                case 'space':
                    res = input.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(x => x).join('\n');
                    break;
                case 'sort':
                    res = input.split('\n').sort((a, b) => a.localeCompare(b, 'ko')).join('\n');
                    break;
                case 'html':
                    res = input.replace(/<[^>]*>?/gm, '');
                    break;
                case 'url': {
                    // 인코딩과 디코딩을 따로 처리해, 디코딩이 실패해도 인코딩 결과는 보여 줍니다.
                    let decoded: string;
                    try {
                        decoded = decodeURIComponent(input);
                    } catch {
                        decoded = '(디코딩할 수 없는 형식입니다. %XX 형태가 올바른지 확인해 주세요.)';
                    }
                    res = `[인코딩]\n${encodeURIComponent(input)}\n\n[디코딩]\n${decoded}`;
                    break;
                }
                case 'base64': {
                    let decoded: string;
                    try {
                        decoded = decodeBase64(input);
                    } catch {
                        decoded = '(Base64 형식이 아니어서 디코딩할 수 없습니다.)';
                    }
                    res = `[인코딩]\n${encodeBase64(input)}\n\n[디코딩]\n${decoded}`;
                    break;
                }
                case 'csvjson':
                    if (input.trim().startsWith('[') || input.trim().startsWith('{')) {
                        const arr = JSON.parse(input);
                        const items = Array.isArray(arr) ? arr : [arr];
                        if (!items.length || typeof items[0] !== 'object' || items[0] === null) throw new Error('변환할 JSON 객체가 없습니다.');
                        const headers = Object.keys(items[0]);
                        res = [headers.join(','), ...items.map((item: Record<string, unknown>) => headers.map(h => JSON.stringify(item[h] ?? '')).join(','))].join('\n');
                    } else {
                        const lines = input.trim().split('\n');
                        const headers = lines[0].split(',').map(h => h.trim());
                        const arr = lines.slice(1).map(line => {
                            const values = line.split(',').map(v => v.trim());
                            return headers.reduce<Record<string, string | number>>((obj, header, i) => {
                                const val = values[i] ?? '';
                                obj[header] = val !== '' && !isNaN(Number(val)) ? Number(val) : val;
                                return obj;
                            }, {});
                        });
                        res = JSON.stringify(arr, null, 2);
                    }
                    break;
                case 'color': {
                    const hex = input.trim();
                    const match = hex.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
                    if (!match) throw new Error('HEX 색상 코드(예: #ffffff 또는 #fff)를 입력해 주세요.');
                    const full = match[1].length === 3 ? match[1].split('').map(c => c + c).join('') : match[1];
                    const r = parseInt(full.slice(0, 2), 16);
                    const g = parseInt(full.slice(2, 4), 16);
                    const b = parseInt(full.slice(4, 6), 16);
                    res = `HEX: #${full.toLowerCase()}\nRGB: rgb(${r}, ${g}, ${b})`;
                    break;
                }
                case 'numKor': {
                    const digits = input.replace(/[^0-9]/g, '');
                    if (!digits) throw new Error('숫자를 입력해 주세요.');
                    const value = Number(digits);
                    if (!Number.isSafeInteger(value) || value >= 1e16) throw new Error('9천조 미만의 숫자만 변환할 수 있습니다.');
                    res = `입력: ${value.toLocaleString('ko-KR')}\n한글: ${numberToKorean(value)}`;
                    break;
                }
                case 'json':
                    res = JSON.stringify(JSON.parse(input), null, 2);
                    break;
                case 'regex': {
                    if (!findStr) throw new Error('정규표현식을 입력해 주세요.');
                    let re: RegExp;
                    try {
                        re = new RegExp(findStr, 'g');
                    } catch {
                        throw new Error('정규표현식 형식이 올바르지 않습니다.');
                    }
                    const matches = [...input.matchAll(re)];
                    const shown = matches.slice(0, MAX_REGEX_MATCHES);
                    res = `[매칭 결과: ${matches.length}건]\n` + shown.map((m, i) => `${i + 1}: ${m[0]} (위치: ${m.index})`).join('\n')
                        + (matches.length > MAX_REGEX_MATCHES ? `\n... 외 ${matches.length - MAX_REGEX_MATCHES}건` : '');
                    break;
                }
                case 'md': {
                    const mdToHtml = (md: string) => md
                        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                        .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
                        .replace(/\*(.*)\*/gim, '<i>$1</i>')
                        .replace(/^- (.*$)/gim, '<li>$1</li>');
                    res = `[HTML 변환 결과]\n${mdToHtml(input)}`;
                    break;
                }
                case 'slug':
                    res = input.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                    break;
                case 'hash': {
                    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
                    res = `SHA-256:\n${Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')}`;
                    break;
                }
                case 'random': {
                    const len = Math.min(256, Math.max(4, parseInt(input, 10) || 16));
                    res = secureRandomString(len);
                    break;
                }
                case 'lorem': {
                    const pCount = Math.min(50, Math.max(1, parseInt(input, 10) || 3));
                    const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. ';
                    res = Array.from({ length: pCount }, () => lorem).join('\n\n');
                    break;
                }
                case 'mask': {
                    // 모든 한글 단어를 가리던 규칙 대신 공용 비식별화 유틸을 사용합니다(로컬 처리, 외부 전송 없음).
                    const { maskedText } = anonymizeText(input, { knownNames: collectKnownNames() });
                    res = `${maskedText}\n\n※ 자동 마스킹은 전화번호·주민번호·이메일·"이름:" 뒤의 이름 등 정해진 형식만 찾습니다. 결과를 꼭 확인해 주세요.`;
                    break;
                }
            }
            setOutput(res);
        } catch (e: unknown) {
            setOutput('오류가 발생했습니다: ' + errorMessage(e));
        }
    };

    const saveOutput = async () => {
        if (!selectedUtil || !output) return;
        try {
            const saved = await saveJjssText('utility', `result_${selectedUtil.id}.txt`, output);
            if (saved.canceled) showToast('저장이 취소되었습니다.', 'info');
        } catch (error: unknown) {
            showToast(error instanceof Error && error.message ? error.message : '업무지원 결과를 저장하지 못했습니다.', 'error');
        }
    };

    const inputPlaceholder = selectedUtil?.id === 'random'
        ? '만들 글자 수를 숫자로 입력하세요. (비워 두면 16자)'
        : selectedUtil?.id === 'lorem'
            ? '만들 문단 수를 숫자로 입력하세요. (비워 두면 3문단)'
            : '이곳에 텍스트를 붙여넣거나, 위의 "파일 불러오기"로 파일을 여세요.';

    return (
        <ToolPageShell onBack={onBack} className="w-full max-w-6xl mx-auto pb-16">
            <div className="glass-strong rounded-[2rem] shadow-2xl p-8 lg:p-12 border border-white/10">
                <div className="mb-10">
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        만능 텍스트 유틸리티
                        <span className="text-[14px] uppercase font-black px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 tracking-wider h-fit">PRO</span>
                    </h1>
                    <p className="text-white/50 mt-2">{UTILS.length}가지 필수 텍스트 도구를 한곳에서 관리하세요. 모든 처리는 이 컴퓨터 안에서만 이루어지며 외부로 전송되지 않습니다.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {UTILS.map((tool) => (
                        <button
                            type="button"
                            key={tool.id}
                            onClick={() => openTool(tool)}
                            className="text-left flex items-start gap-4 p-5 rounded-2xl border border-white/5 hover:border-emerald-500/30 hover:shadow-lg transition-all cursor-pointer group bg-white/5 hover:bg-white/10"
                        >
                            <div className={`${tool.bg} w-12 h-12 flex items-center justify-center rounded-xl shrink-0 text-white shadow-sm group-hover:scale-105 transition-transform`}>
                                <tool.icon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-white mb-1">{tool.title}</h3>
                                <p className="text-xs text-white/50 leading-snug">{tool.desc}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Modal */}
            <AnimatePresence>
                {selectedUtil && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="utility-dialog-title"
                            initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="bg-[#1e293b] border border-white/10 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={`${selectedUtil.bg} w-10 h-10 flex items-center justify-center rounded-lg text-white`}>
                                        <selectedUtil.icon className="w-5 h-5" />
                                    </div>
                                    <h2 id="utility-dialog-title" className="text-xl font-bold text-white">{selectedUtil.title}</h2>
                                </div>
                                <button type="button" aria-label="도구 닫기" onClick={() => void closeTool()} className="p-2 text-white/40 hover:bg-white/10 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <label htmlFor="utility-input" className="text-sm font-bold text-white/70">
                                            {selectedUtil.id === 'random' || selectedUtil.id === 'lorem' ? '개수 입력' : '입력 텍스트'}
                                        </label>
                                        <FileDropZone
                                            accept=".txt,.csv,.json,.md,.html,.xml"
                                            onFiles={handleFiles}
                                            ariaLabel="텍스트 파일 불러오기"
                                            className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg border border-dashed border-white/20 transition-all text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                                            activeClassName="border-emerald-400 bg-emerald-500/10 text-emerald-200"
                                        >
                                            <FileUp className="w-3.5 h-3.5" aria-hidden="true" /> 파일 불러오기 (끌어다 놓아도 됩니다)
                                        </FileDropZone>
                                    </div>

                                    <textarea
                                        id="utility-input"
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        className="w-full h-40 p-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500 focus:bg-white/10 transition-colors resize-none"
                                        placeholder={inputPlaceholder}
                                    />
                                </div>

                                {selectedUtil.id === 'find' && (
                                    <div className="flex gap-4">
                                        <input type="text" aria-label="찾을 단어" placeholder="찾을 단어" value={findStr} onChange={e => setFindStr(e.target.value)} className="flex-1 p-3 bg-white/5 border-white/10 border text-white rounded-xl outline-none focus:border-emerald-500 transition-colors" />
                                        <input type="text" aria-label="바꿀 단어" placeholder="바꿀 단어" value={replaceStr} onChange={e => setReplaceStr(e.target.value)} className="flex-1 p-3 bg-white/5 border-white/10 border text-white rounded-xl outline-none focus:border-emerald-500 transition-colors" />
                                    </div>
                                )}

                                {selectedUtil.id === 'regex' && (
                                    <div className="flex flex-col gap-2">
                                        <label htmlFor="utility-regex" className="text-sm font-bold text-white/70">정규표현식</label>
                                        <input
                                            id="utility-regex"
                                            type="text"
                                            placeholder="예: \d{3}-\d{4}"
                                            value={findStr}
                                            onChange={e => setFindStr(e.target.value)}
                                            className="p-3 bg-white/5 border-white/10 border text-white rounded-xl outline-none focus:border-emerald-500 transition-colors font-mono"
                                        />
                                    </div>
                                )}

                                {selectedUtil.id === 'diff' && (
                                    <div className="flex flex-col gap-2">
                                        <label htmlFor="utility-input2" className="text-sm font-bold text-white/70">비교할 텍스트</label>
                                        <textarea
                                            id="utility-input2"
                                            value={input2}
                                            onChange={e => setInput2(e.target.value)}
                                            className="w-full h-40 p-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500 focus:bg-white/10 transition-colors resize-none"
                                            placeholder="비교할 텍스트를 넣으세요..."
                                        />
                                    </div>
                                )}

                                <div className="flex justify-center">
                                    <button
                                        type="button"
                                        onClick={() => void processText()}
                                        className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-500/20"
                                    >
                                        실행하기
                                    </button>
                                </div>

                                <div className="flex flex-col gap-2 relative">
                                    <div className="flex justify-between items-end">
                                        <label htmlFor="utility-output" className="text-sm font-bold text-white/70">결과 출력</label>
                                        <div className="flex gap-2">
                                            <CopyButton
                                                text={output}
                                                className="text-emerald-400 hover:bg-emerald-400/10 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors"
                                            />
                                            {output && (
                                                <button
                                                    type="button"
                                                    onClick={() => void saveOutput()}
                                                    className="text-blue-400 hover:bg-blue-400/10 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors"
                                                >
                                                    <Download className="w-4 h-4" /> 파일로 저장
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <textarea
                                        id="utility-output"
                                        readOnly
                                        value={output}
                                        className="w-full h-48 p-4 bg-black/20 border border-white/10 shadow-inner rounded-xl outline-none resize-none text-white/90 font-mono text-sm leading-relaxed"
                                        placeholder="실행 결과가 이곳에 나타납니다."
                                    />
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </ToolPageShell>
    );
}
