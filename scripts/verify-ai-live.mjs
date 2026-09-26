// 실제 API 키로 AI 경로를 한 번 검증한다(테스트가 아니라 점검 도구).
//
//   GEMINI_API_KEY="..." npm run verify:ai-live
//   GEMINI_API_KEY="..." npm run verify:ai-live -- "결과지.pdf" "분석지.pdf"
//
// 실제 서비스 모듈(gemini.ts / aiPrivacyGateway.ts / sourceDocument / analysisDocument)을 그대로 실행하고,
// Gemini SDK만 가로채 "나가려던 요청 본문"을 검사한 뒤 그대로 진짜 API로 보낸다.
//   ① 공단 결과지 → readSourceDocument
//   ② 그 밖의 분석지 → readAnalysisDocument
// 키는 환경변수로만 쓰고 어디에도 저장하지 않는다. 나가려던 본문은 OS 임시폴더에 남겨 눈으로 확인할 수 있다.
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NL = String.fromCharCode(10);
const REAL_FETCH = globalThis.fetch;
const KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const DEFAULT_SHEET = path.join(process.env.USERPROFILE || '', 'OneDrive', '바탕 화면', 'https-hub.kead.or.kr2.pdf');
const DEFAULT_ANALYSIS = path.join(process.env.USERPROFILE || '', 'OneDrive', '바탕 화면', '직업평가보고서 예시1.pdf');
const [sheetPath = DEFAULT_SHEET, analysisPath = DEFAULT_ANALYSIS] = process.argv.slice(2);

if (!KEY) {
    console.error('GEMINI_API_KEY 환경변수가 없습니다.');
    console.error('  예: GEMINI_API_KEY="키" npm run verify:ai-live');
    process.exit(2);
}

/* ── TS 모듈 로더: 실제 .mjs 파일로 옮겨 적고 파일 URL로 불러온다 ───── */
const outDir = await mkdtemp(path.join(tmpdir(), 'jjss-ai-live-'));
const stubs = new Map();
const cache = new Map();
const exists = async p => { try { return (await stat(p)).isFile(); } catch { return false; } };
const emit = async (code, tag) => {
    const file = path.join(outDir, `${tag}_${createHash('sha1').update(code).digest('hex').slice(0, 8)}.mjs`);
    await writeFile(file, code, 'utf8');
    return pathToFileURL(file).href;
};
async function resolveSource(fromFile, specifier) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.resolve(base, 'index.ts')]) {
        if (await exists(candidate)) return candidate;
    }
    throw new Error(`cannot resolve ${specifier} from ${fromFile}`);
}
async function loadModule(file, transform = code => code) {
    const key = path.resolve(file);
    if (stubs.has(key)) return stubs.get(key);
    if (cache.has(key)) return cache.get(key);
    const target = path.join(outDir, `${path.basename(key).replace(/\W+/g, '_')}_${createHash('sha1').update(key).digest('hex').slice(0, 8)}.mjs`);
    const url = pathToFileURL(target).href;
    cache.set(key, url);
    let code = ts.transpileModule(await readFile(key, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
        fileName: key,
    }).outputText;
    code = transform(code.replace(/import\.meta\.env\.DEV/g, 'false'));
    for (const specifier of [...new Set([...code.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)].map(m => m[1]))]) {
        let to;
        if (stubs.has(specifier)) to = stubs.get(specifier);
        else if (specifier.startsWith('.')) to = await loadModule(await resolveSource(key, specifier));
        else throw new Error(`unexpected package import "${specifier}" in ${key}`);
        code = code.split(`'${specifier}'`).join(`'${to}'`).split(`"${specifier}"`).join(`"${to}"`);
    }
    await writeFile(target, code, 'utf8');
    return url;
}
const src = p => path.resolve(root, 'src', p);

/* ── Gemini SDK 가로채기: 본문을 담아 두고 실제 API로 전달 ─────────── */
const outbound = [];
let liveError = null;
globalThis.__live = {
    async record(kind, payload) {
        outbound.push({ kind, payload });
        const patched = globalThis.fetch;
        globalThis.fetch = REAL_FETCH;
        try {
            const mod = await import(pathToFileURL(path.resolve(root, 'node_modules/@google/genai/dist/node/index.mjs')).href);
            const ai = new mod.GoogleGenAI({ apiKey: KEY });
            return await ai.models.generateContent(payload);
        } catch (error) {
            liveError = error;
            return new Error(error && error.message ? error.message : String(error));
        } finally {
            globalThis.fetch = patched;
        }
    },
};
stubs.set('@google/genai', await emit([
    'export class GoogleGenAI {',
    '  constructor() {',
    '    this.models = { generateContent: async r => { const x = await globalThis.__live.record("generateContent", r); if (x instanceof Error) throw x; return x; }, get: async () => ({ displayName: "stub" }) };',
    '    this.files = { upload: async r => { globalThis.__live.record("files.upload", r); return { name: "files/stub", uri: "stub://file" }; }, delete: async () => ({}) };',
    '  }',
    '}',
    'export const ThinkingLevel = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" };',
    'export const Type = { OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER", ARRAY: "ARRAY" };',
].join(NL), 'genai'));

/* ── 화면(스토어·파일) 대체 ────────────────────────────────────── */
let settings;
globalThis.__store = { seekers: () => [], jobs: () => [], docs: () => [], init: () => true, settings: () => settings };
stubs.set(src('store/settingsStore.ts'), await emit('export const useSettingsStore = { getState: () => ({ settings: globalThis.__store.settings() }) };', 'settingsStore'));
stubs.set(src('store/dataStore.ts'), await emit('export const useDataStore = { getState: () => ({ seekers: globalThis.__store.seekers(), jobs: globalThis.__store.jobs(), caseDocuments: globalThis.__store.docs(), initialized: globalThis.__store.init() }) };', 'dataStore'));
stubs.set(src('utils/file.ts'), await emit([
    'export async function fileToBase64(f) { return Buffer.from(await f.arrayBuffer()).toString("base64"); }',
    'export async function fileToDataUrl(f) { return "data:" + f.type + ";base64," + await fileToBase64(f); }',
    'export function estimateBase64Size(n) { return Math.ceil(n / 3) * 4; }',
].join(NL), 'fileUtil'));

/* ── localPdfText: 실제 pdf.js로 PC 안에서 글자 추출 ──────────────── */
const realPdfUrl = await loadModule(src('services/localPdfText.ts'), c => c.replace(/import\.meta\.glob(?:<[^>]*>)?\([^)]*\)/g, '({})'));
const pdfjsUrl = pathToFileURL(path.resolve(root, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
stubs.set(src('services/localPdfText.ts'), await emit([
    `import * as pdfjs from '${pdfjsUrl}';`,
    `export { isMeaningfulPdfText } from '${realPdfUrl}';`,
    'export function isLocalPdfTextAvailable() { return true; }',
    'export async function extractPdfTextLocally(bytes) {',
    '  const NL = String.fromCharCode(10);',
    '  const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, disableAutoFetch: true, disableStream: true, stopAtErrors: false }).promise;',
    '  const pageCount = doc.numPages; const pages = []; let textPageCount = 0;',
    '  for (let n = 1; n <= pageCount; n += 1) {',
    '    const page = await doc.getPage(n); const content = await page.getTextContent();',
    '    const t = content.items.map(i => (typeof i.str === "string" ? i.str : "") + (i.hasEOL ? NL : "")).join("").trim();',
    '    if (page.cleanup) page.cleanup();',
    '    if (t.replace(/\\s+/g, "").length >= 20) textPageCount += 1;',
    '    pages.push(t);',
    '  }',
    '  await doc.destroy().catch(() => undefined);',
    '  return { text: pages.join(NL + NL), pageCount, checkedPageCount: pages.length, textPageCount, truncated: false };',
    '}',
].join(NL), 'localPdfText'));

globalThis.window = new EventTarget();
globalThis.fetch = async url => { throw new Error(`예상치 못한 네트워크 요청: ${url}`); };

const sourceExtraction = await import(await loadModule(src('features/vocationalEvaluation/sourceDocument/extraction.ts')));
const analysisExtraction = await import(await loadModule(src('features/vocationalEvaluation/analysisDocument/extraction.ts')));
const analysisModel = await import(await loadModule(src('features/vocationalEvaluation/analysisDocument/model.ts')));
const valueLimits = await import(await loadModule(src('features/vocationalEvaluation/sourceDocument/valueLimits.ts')));
const safety = await import(await loadModule(src('services/aiRequestSafety.ts')));

settings = {
    selectedProvider: 'gemini', visionApiKey: '', aiFailover: {}, staffName: '',
    llmConfigs: [{ provider: 'gemini', apiKey: KEY, model: MODEL, reasoningLevel: 'auto' }],
};

/* ── 점검 도우미 ──────────────────────────────────────────────── */
const mask = v => (v == null ? '' : String(v).replace(/[0-9가-힣A-Za-z]/g, '*'));
const dumpOf = () => JSON.stringify(outbound, (k, v) => (k === 'abortSignal' || k === 'signal' ? undefined : v));
let problems = 0;

function check(ok, label, detail = '') {
    if (!ok) problems += 1;
    console.log(`  ${ok ? 'OK  ' : '!!  '}${label}${detail ? ` — ${detail}` : ''}`);
}

/** 나가려던 본문에 사람 이름이 남았는지. 붙여 쓴 형태와 자간을 벌린 형태를 함께 본다. */
function nameLeaked(body, name) {
    const spaced = [...name].map(ch => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[ \\t]?');
    return new RegExp(spaced).test(body);
}

function privacySection(body, names) {
    console.log(`  본문 ${body.length.toLocaleString()}바이트`);
    check(!outbound.some(o => o.kind === 'files.upload') && !/"inlineData"|"fileData"/.test(body), '원본 PDF를 보내지 않음');
    for (const name of names) check(!nameLeaked(body, name), `이름이 가려짐 (${mask(name)})`);
    check(!/\d{2,3}-\d{3,4}-\d{4}/.test(body), '연락처 형태 없음');
    check(!/\d{6}\s*-\s*[1-8]\d{6}/.test(body), '주민등록번호 형태 없음');
    const tokens = [...new Set([...body.matchAll(/⟦[^⟧]{1,20}⟧/g)].map(m => m[0]))];
    console.log(`      비식별 토큰: ${tokens.length ? tokens.join(' ') : '없음'}`);
}

async function saveBody(name, body) {
    const file = path.join(outDir, name);
    await writeFile(file, body, 'utf8');
    return file;
}

/* ── ① 공식 결과지 ─────────────────────────────────────────────── */
console.log(`=== ① 공식 결과지 — 실제 Gemini 호출 (${MODEL}) ===`);
console.log(`파일: ${path.basename(sheetPath)}`);
let sheetBodyFile = '';
try {
    const bytes = await readFile(sheetPath);
    const file = new File([bytes], 'sheet.pdf', { type: 'application/pdf' });
    const started = Date.now();
    const outcome = await sourceExtraction.readSourceDocument({ file });
    const body = dumpOf();
    sheetBodyFile = await saveBody('outbound-source.json', body);
    console.log(`  로컬 글자 추출: ${outcome.localTextAvailable ? 'TRUE' : 'FALSE'} · ${outcome.pageCount}쪽 · ${((Date.now() - started) / 1000).toFixed(1)}초`);
    console.log(`  로컬 생년월일 : ${outcome.localBirthDate ? `찾음(${mask(outcome.localBirthDate)})` : '없음'}`);
    privacySection(body, ['홍길동', '김정훈']);
    if (liveError) check(false, '실제 호출', liveError.message.slice(0, 200));
    check(Boolean(outcome.result), 'AI 응답 파싱', outcome.failureReason || '');
    if (outcome.result) {
        const value = s => (s && s.value !== null && s.value !== undefined ? s.value : '—');
        console.log(`  documentType  : ${outcome.result.documentType}`);
        console.log(`  제목          : ${outcome.result.detectedTitle}`);
        check(!('evaluator' in outcome.result.test), '평가사 이름 칸이 스키마에 없음');
        if (outcome.result.documentType === 'KEAD_BIMANUAL') {
            const p = outcome.result.performance;
            const parts = ['cylinder', 'largeBolt', 'largeNut', 'smallBolt', 'smallNut', 'plate', 'fixingPin'];
            console.log(`  완성소요시간   : ${value(p.recordedDuration)}`);
            console.log(`  부품 수행량    : ${parts.map(k => value(p.components[k])).join(' ')}`);
            console.log(`  총 수행량/도구수: ${value(p.reportedTotalCompleted)} / ${value(p.reportedTotalTools)}`);
            console.log(`  규준 표기값    : ${outcome.result.norms.map(n => `${n.sourceLabel}=${value(n.sourceValue)}`).join(', ') || '없음'}`);
            for (const [factPath, v] of [
                ['bimanual.reportedTotalCompleted', p.reportedTotalCompleted?.value],
                ['bimanual.reportedTotalTools', p.reportedTotalTools?.value],
                ['bimanual.componentDenominators.plate', p.componentDenominators.plate?.value],
                ['bimanual.recordedDurationMs', p.recordedDuration?.value],
            ]) {
                if (v === null || v === undefined) continue;
                const issue = valueLimits.factValueIssue(factPath, v);
                console.log(`      범위검사 ${factPath} = ${JSON.stringify(v)} → ${issue ? `${issue.severity}: ${issue.message}` : 'OK'}`);
                if (issue && issue.severity === 'ERROR') problems += 1;
            }
        }
    }
} catch (error) {
    check(false, '결과지 점검 실패', error instanceof Error ? error.message : String(error));
}

/* ── ② 분석지 ─────────────────────────────────────────────────── */
console.log(`${NL}=== ② 분석지 — 실제 Gemini 호출 (${MODEL}) ===`);
console.log(`파일: ${path.basename(analysisPath)}`);
let analysisBodyFile = '';
try {
    outbound.length = 0;
    liveError = null;
    safety.__resetAIRequestSafetyForTests?.();
    const bytes = await readFile(analysisPath);
    const file = new File([bytes], 'analysis.pdf', { type: 'application/pdf' });
    const started = Date.now();
    const outcome = await analysisExtraction.readAnalysisDocument({ file });
    const body = dumpOf();
    analysisBodyFile = await saveBody('outbound-analysis.json', body);
    console.log(`  로컬 글자 추출: ${outcome.localTextAvailable ? 'TRUE' : 'FALSE'} · ${outcome.pageCount}쪽 · ${((Date.now() - started) / 1000).toFixed(1)}초`);
    privacySection(body, ['이지영', '김경은', '이은정']);
    if (liveError) check(false, '실제 호출', liveError.message.slice(0, 200));
    check(!outcome.failureReason, 'AI 응답 파싱', outcome.failureReason || '');
    if (!outcome.failureReason) {
        console.log(`  제목          : ${outcome.detectedTitle || '(없음)'}`);
        console.log(`  정리한 문장    : ${outcome.findings.length}개`);
        const byArea = new Map();
        for (const finding of outcome.findings) byArea.set(finding.area, [...(byArea.get(finding.area) ?? []), finding]);
        for (const [area, list] of byArea) {
            console.log(`${NL}  [${analysisModel.ANALYSIS_AREA_LABELS[area]}] ${list.length}개`);
            for (const finding of list) {
                console.log(`    ${finding.included ? '✓' : '✗'} ${finding.text}${finding.blocked ? `   ← 자동제외: ${finding.blocked}` : ''}`);
            }
        }
        const leaks = outcome.findings.filter(f => ['이지영', '김경은', '이은정'].some(n => nameLeaked(f.text, n)));
        check(leaks.length === 0, '정리된 문장에 사람 이름 없음', leaks.length ? `${leaks.length}개` : '');
        if (outcome.warnings.length) console.log(`  경고: ${outcome.warnings.join(' / ')}`);
    }
} catch (error) {
    check(false, '분석지 점검 실패', error instanceof Error ? error.message : String(error));
}

console.log(`${NL}나가려던 본문:${NL}  ${sheetBodyFile}${NL}  ${analysisBodyFile}`);
console.log(problems === 0 ? `${NL}실제 AI 경로 점검 PASS` : `${NL}실제 AI 경로 점검 FAIL (${problems}건)`);
process.exit(problems === 0 ? 0 : 1);
