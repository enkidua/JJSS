import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Hash, Type, Search, ArrowLeft, GitCompare, CopyMinus, AlignLeft, 
    ArrowDownUp, Code2, Link, Binary, FileJson, Palette, Calculator, 
    Braces, Asterisk, Eye, Globe, Fingerprint, Shuffle, FileText, ShieldCheck, X, Copy, Check,
    Upload, FileUp, Download
} from 'lucide-react';
import { getTextFileValidationError } from '../utils/fileValidation';
import { saveJjssText, savedLocationMessage } from '../utils/jjssFileService';

interface UtilitiesViewProps {
    onBack: () => void;
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
    { id: 'color', title: '색상 코드 변환', desc: 'HEX, RGB, HSL 색상 코드 간 변환합니다', icon: Palette, bg: 'bg-fuchsia-500' },
    { id: 'numKor', title: '숫자 → 한글 변환', desc: '숫자를 한글 표기로 변환합니다', icon: Calculator, bg: 'bg-red-500' },
    { id: 'json', title: 'JSON 포맷터', desc: 'JSON 데이터를 포맷팅, 압축, 검증합니다', icon: Braces, bg: 'bg-green-500' },
    { id: 'regex', title: '정규식 테스터', desc: '정규표현식을 테스트하고 매칭 결과를 봅니다', icon: Asterisk, bg: 'bg-rose-500' },
    { id: 'md', title: '마크다운 미리보기', desc: '마크다운 텍스트를 HTML로 렌더링합니다', icon: Eye, bg: 'bg-violet-500' },
    { id: 'slug', title: '슬러그 생성기', desc: 'URL 친화적인 슬러그를 자동 생성합니다', icon: Globe, bg: 'bg-blue-600' },
    { id: 'hash', title: '해시 생성기', desc: 'SHA-1, SHA-256 등의 해시를 생성합니다', icon: Fingerprint, bg: 'bg-slate-600' },
    { id: 'random', title: '랜덤 문자열 생성', desc: '안전한 랜덤 문자열과 비밀번호를 생성합니다', icon: Shuffle, bg: 'bg-cyan-500' },
    { id: 'lorem', title: 'Lorem Ipsum 생성', desc: '필요한 만큼 플레이스홀더 텍스트를 생성', icon: FileText, bg: 'bg-lime-500' },
    { id: 'mask', title: '개인정보 마스킹', desc: '전화번호, 이메일 등 개인정보를 마스킹합니다', icon: ShieldCheck, bg: 'bg-emerald-600' },
];

export function UtilitiesView({ onBack }: UtilitiesViewProps) {
    const [selectedUtil, setSelectedUtil] = useState<any | null>(null);
    const [input, setInput] = useState('');
    const [input2, setInput2] = useState('');
    const [findStr, setFindStr] = useState('');
    const [replaceStr, setReplaceStr] = useState('');
    const [output, setOutput] = useState('');
    const [copied, setCopied] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCopy = () => {
        navigator.clipboard.writeText(output);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
        let file: File | undefined;
        if ('files' in e.target && (e.target as any).files) {
            file = (e.target as any).files[0];
        } else if ('dataTransfer' in e && (e as any).dataTransfer.files) {
            file = (e as any).dataTransfer.files[0];
        }

        if (file) {
            const validationError = getTextFileValidationError(file);
            if (validationError) {
                setOutput(validationError);
                setIsDragging(false);
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                setInput(event.target?.result as string);
            };
            reader.onerror = () => setOutput('파일을 읽지 못했습니다.');
            reader.readAsText(file);
        }
        setIsDragging(false);
    };

    const processText = async () => {
        if (!selectedUtil || !input) return;
        const id = selectedUtil.id;
        let res = '';
        try {
            switch(id) {
                case 'count':
                    const chars = input.length;
                    const charNoSpace = input.replace(/\s/g, '').length;
                    const words = input.trim().split(/\s+/).filter(x => x).length;
                    const lines = input.split('\n').filter(x => x).length;
                    const byteLen = new TextEncoder().encode(input).length;
                    res = `[결과 리포트]\n- 글자수 (공백 포함): ${chars.toLocaleString()}자\n- 글자수 (공백 제외): ${charNoSpace.toLocaleString()}자\n- 단어 수: ${words.toLocaleString()}개\n- 줄 수: ${lines.toLocaleString()}줄\n- 바이트: ${byteLen.toLocaleString()} bytes\n- 예상 읽기 시간: ${Math.ceil(words / 200)}분`;
                    break;
                case 'case':
                    const upper = input.toUpperCase();
                    const lower = input.toLowerCase();
                    const title = input.split(' ').map(s => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '').join(' ');
                    res = `[대문자]\n${upper}\n\n[소문자]\n${lower}\n\n[타이틀 케이스]\n${title}`;
                    break;
                case 'find':
                    if (!findStr) throw new Error('찾을 단어를 입력해주세요.');
                    res = input.split(findStr).join(replaceStr);
                    break;
                case 'diff':
                    const lines1 = input.split('\n');
                    const lines2 = input2.split('\n');
                    const maxLines = Math.max(lines1.length, lines2.length);
                    let diffRes = '[줄 단위 비교 결과]\n';
                    for (let i = 0; i < maxLines; i++) {
                        const l1 = lines1[i] || '';
                        const l2 = lines2[i] || '';
                        if (l1 !== l2) {
                            diffRes += `[Line ${i+1}] 차이 발생:\n- 원본: ${l1}\n+ 변경: ${l2}\n\n`;
                        }
                    }
                    res = diffRes === '[줄 단위 비교 결과]\n' ? '두 텍스트가 완벽히 일치합니다.' : diffRes;
                    break;
                case 'dedup':
                    res = Array.from(new Set(input.split('\n'))).join('\n');
                    break;
                case 'space':
                    res = input.split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(x => x).join('\n');
                    break;
                case 'sort':
                    res = input.split('\n').sort((a,b) => a.localeCompare(b, 'ko')).join('\n');
                    break;
                case 'html':
                    res = input.replace(/<[^>]*>?/gm, '');
                    break;
                case 'url':
                    res = `[인코딩]\n${encodeURIComponent(input)}\n\n[디코딩]\n${decodeURIComponent(input)}`;
                    break;
                case 'base64':
                    res = `[인코딩]\n${btoa(encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))))}\n\n[디코딩]\n${decodeURIComponent(Array.prototype.map.call(atob(input), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))}`;
                    break;
                case 'csvjson':
                    if (input.trim().startsWith('[') || input.trim().startsWith('{')) {
                        const arr = JSON.parse(input);
                        const items = Array.isArray(arr) ? arr : [arr];
                        const headers = Object.keys(items[0]);
                        res = [headers.join(','), ...items.map((item: any) => headers.map(h => JSON.stringify(item[h])).join(','))].join('\n');
                    } else {
                        const lines = input.trim().split('\n');
                        const headers = lines[0].split(',').map(h => h.trim());
                        const arr = lines.slice(1).map(line => {
                            const values = line.split(',').map(v => v.trim());
                            return headers.reduce((obj: any, header, i) => {
                                let val: any = values[i];
                                if (!isNaN(Number(val))) val = Number(val);
                                obj[header] = val;
                                return obj;
                            }, {});
                        });
                        res = JSON.stringify(arr, null, 2);
                    }
                    break;
                case 'color':
                    const hexToRgb = (hex: string) => {
                        const r = parseInt(hex.slice(1, 3), 16);
                        const g = parseInt(hex.slice(3, 5), 16);
                        const b = parseInt(hex.slice(5, 7), 16);
                        return `rgb(${r}, ${g}, ${b})`;
                    };
                    if (input.startsWith('#')) {
                        res = `HEX: ${input}\nRGB: ${hexToRgb(input)}`;
                    } else {
                        res = "HEX 코드(#ffffff)를 입력하면 RGB로 변환합니다.";
                    }
                    break;
                case 'numKor':
                    const units = ['', '십', '백', '천', '만', '십만', '백만', '천만', '억', '십억', '백억', '천억', '조'];
                    const nums = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
                    const num = input.replace(/[^0-9]/g, '');
                    if (!num) throw new Error('숫자를 입력해 주세요.');
                    let kor = '';
                    for (let i = 0; i < num.length; i++) {
                        const n = parseInt(num[num.length - 1 - i]);
                        if (n > 0) kor = nums[n] + units[i] + kor;
                    }
                    res = `입력: ${Number(num).toLocaleString()}\n한글: ${kor || '영'}`;
                    break;
                case 'json':
                    res = JSON.stringify(JSON.parse(input), null, 2);
                    break;
                case 'regex':
                    if (!findStr) throw new Error('정규표현식을 입력해 주세요.');
                    const re = new RegExp(findStr, 'g');
                    const matches = [...input.matchAll(re)];
                    res = `[매칭 결과: ${matches.length}건]\n` + matches.map((m, i) => `${i+1}: ${m[0]} (Index: ${m.index})`).join('\n');
                    break;
                case 'md':
                    const mdToHtml = (md: string) => md
                        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                        .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
                        .replace(/\*(.*)\*/gim, '<i>$1</i>')
                        .replace(/^- (.*$)/gim, '<li>$1</li>');
                    res = `[HTML 변환 결과]\n${mdToHtml(input)}`;
                    break;
                case 'slug':
                    res = input.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                    break;
                case 'hash':
                    const msgBuffer = new TextEncoder().encode(input);
                    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    res = `SHA-256:\n${hashArray.map(b => b.toString(16).padStart(2, '0')).join('')}`;
                    break;
                case 'random':
                    const len = parseInt(input) || 16;
                    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
                    res = Array.from({length: len}, () => charset[Math.floor(Math.random() * charset.length)]).join('');
                    break;
                case 'lorem':
                    const pCount = parseInt(input) || 3;
                    const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. ";
                    res = Array.from({length: pCount}, () => lorem).join('\n\n');
                    break;
                case 'mask':
                    res = input
                        .replace(/\d{2,3}-\d{3,4}-\d{4}/g, '***-****-****') // 전화번호
                        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '***@***.***') // 이메일
                        .replace(/\d{6}-\d{7}/g, '******-*******') // 주민번호
                        .replace(/([가-힣]{1})[가-힣]{1,2}/g, '$1**'); // 이름 마스킹
                    break;
                default:
                    res = '적용 완료:\n' + input;
            }
            setOutput(res);
        } catch(e: any) {
            setOutput('오류가 발생했습니다: ' + e.message);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-6xl mx-auto pb-16"
        >
            <button
                onClick={onBack}
                className="btn-ghost flex items-center gap-2 mb-6 text-sm text-white/50 hover:text-white transition-colors"
            >
                <ArrowLeft className="w-4 h-4" /> 도구 목록으로 돌아가기
            </button>

            <div className="glass-strong rounded-[2rem] shadow-2xl p-8 lg:p-12 border border-white/10">
                <div className="mb-10">
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        만능 텍스트 유틸리티
                        <span className="text-[14px] uppercase font-black px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 tracking-wider h-fit">PRO</span>
                    </h1>
                    <p className="text-white/50 mt-2">21가지 필수 텍스트 도구를 한곳에서 관리하세요. 모든 처리는 브라우저에서 안전하게 이루어집니다.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {UTILS.map((tool) => (
                        <div 
                            key={tool.id} 
                            onClick={() => {
                                setSelectedUtil(tool);
                                setInput('');
                                setInput2('');
                                setOutput('');
                            }}
                            className="flex items-start gap-4 p-5 rounded-2xl border border-white/5 hover:border-emerald-500/30 hover:shadow-lg transition-all cursor-pointer group bg-white/5 hover:bg-white/10"
                        >
                            <div className={`${tool.bg} w-12 h-12 flex items-center justify-center rounded-xl shrink-0 text-white shadow-sm group-hover:scale-105 transition-transform`}>
                                <tool.icon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-white mb-1">{tool.title}</h3>
                                <p className="text-xs text-white/50 leading-snug">{tool.desc}</p>
                            </div>
                        </div>
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
                            initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 10 }}
                            className="bg-[#1e293b] border border-white/10 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="flex items-center justify-between p-5 border-b border-white/10 bg-white/5">
                                <div className="flex items-center gap-3">
                                    <div className={`${selectedUtil.bg} w-10 h-10 flex items-center justify-center rounded-lg text-white`}>
                                        <selectedUtil.icon className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-bold text-white">{selectedUtil.title}</h2>
                                </div>
                                <button onClick={() => setSelectedUtil(null)} className="p-2 text-white/40 hover:bg-white/10 rounded-full transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                                <div className="flex flex-col gap-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-bold text-white/70">입력 텍스트</label>
                                        <div className="flex gap-2">
                                            <input 
                                                type="file" 
                                                ref={fileInputRef} 
                                                className="hidden" 
                                                onChange={handleFileUpload}
                                                accept=".txt,.csv,.json,.md,.html,.xml"
                                            />
                                            <button 
                                                onClick={() => fileInputRef.current?.click()}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg border border-white/10 transition-all text-xs font-bold"
                                            >
                                                <FileUp className="w-3.5 h-3.5" /> 파일 불러오기
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div 
                                        className={`relative group rounded-xl transition-all ${isDragging ? 'ring-2 ring-emerald-500 bg-emerald-500/10' : ''}`}
                                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                        onDragLeave={() => setIsDragging(false)}
                                        onDrop={(e) => { e.preventDefault(); handleFileUpload(e); }}
                                    >
                                        <textarea 
                                            value={input}
                                            onChange={e => setInput(e.target.value)}
                                            className="w-full h-40 p-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500 focus:bg-white/10 transition-colors resize-none relative z-10"
                                            placeholder="이곳에 텍스트를 붙여넣거나 파일을 드래그하세요..."
                                        />
                                        {isDragging && (
                                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none bg-emerald-500/10 backdrop-blur-[2px] rounded-xl border-2 border-dashed border-emerald-500">
                                                <Upload className="w-10 h-10 text-emerald-400 mb-2 animate-bounce" />
                                                <span className="text-emerald-400 font-bold">파일을 놓아서 텍스트 추출</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {selectedUtil.id === 'find' && (
                                    <div className="flex gap-4">
                                        <input type="text" placeholder="찾을 단어" value={findStr} onChange={e=>setFindStr(e.target.value)} className="flex-1 p-3 bg-white/5 border-white/10 border text-white rounded-xl outline-none focus:border-emerald-500 transition-colors" />
                                        <input type="text" placeholder="바꿀 단어" value={replaceStr} onChange={e=>setReplaceStr(e.target.value)} className="flex-1 p-3 bg-white/5 border-white/10 border text-white rounded-xl outline-none focus:border-emerald-500 transition-colors" />
                                    </div>
                                )}
                                
                                {selectedUtil.id === 'diff' && (
                                    <div className="flex flex-col gap-2">
                                        <label className="text-sm font-bold text-white/70">비교할 텍스트 (Target)</label>
                                        <textarea 
                                            value={input2}
                                            onChange={e => setInput2(e.target.value)}
                                            className="w-full h-40 p-4 bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-emerald-500 focus:bg-white/10 transition-colors resize-none"
                                            placeholder="비교할 원본 텍스트를 넣으세요..."
                                        />
                                    </div>
                                )}

                                <div className="flex justify-center">
                                    <button 
                                        onClick={processText}
                                        className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-bold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-500/20"
                                    >
                                        실행하기
                                    </button>
                                </div>

                                <div className="flex flex-col gap-2 relative">
                                    <div className="flex justify-between items-end">
                                        <label className="text-sm font-bold text-white/70">결과 출력</label>
                                        <div className="flex gap-2">
                                            <button onClick={handleCopy} className="text-emerald-400 hover:bg-emerald-400/10 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors">
                                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                                {copied ? '복사됨!' : '결과 복사'}
                                            </button>
                                            {output && (
                                                <button 
                                                    onClick={async () => {
                                                        try {
                                                            const saved = await saveJjssText('utility', `result_${selectedUtil.id}.txt`, output);
                                                            if (saved.canceled) alert(savedLocationMessage(saved));
                                                        } catch (error: any) {
                                                            alert(error?.message || '업무지원 결과를 저장하지 못했습니다.');
                                                        }
                                                    }}
                                                    className="text-blue-400 hover:bg-blue-400/10 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors"
                                                >
                                                    <Download className="w-4 h-4" /> 파일 저장
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <textarea 
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
        </motion.div>
    );
}
