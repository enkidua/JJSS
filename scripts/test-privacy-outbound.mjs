// 외부 AI 전송 payload 개인정보 검사(test:privacy-outbound).
// 실제 서비스 모듈(gemini.ts, ocr.ts, aiPrivacyGateway.ts, anonymizer.ts …)을 그대로 변환해 실행하고,
// Gemini SDK·fetch(OpenAI/Anthropic/Vision)만 가짜로 바꿔 "실제로 나가려던 요청 본문"을 가로채 검사한다.
// 실제 API 키·네트워크는 사용하지 않는다. 모든 개인정보는 합성 데이터다.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const toUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

// ── 1. 모듈 로더: 상대 경로 import를 재귀적으로 변환하고, 지정한 모듈만 가짜로 바꾼다. ─────────────
const stubs = new Map();
const cache = new Map();

async function exists(path) {
    try { return (await stat(path)).isFile(); } catch { return false; }
}

async function resolveSource(fromFile, specifier) {
    const base = resolve(dirname(fromFile), specifier);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')]) {
        if (await exists(candidate)) return candidate;
    }
    throw new Error(`cannot resolve ${specifier} from ${fromFile}`);
}

async function loadModule(file, transform = code => code) {
    const key = resolve(file);
    if (stubs.has(key)) return stubs.get(key);
    if (cache.has(key)) return cache.get(key);
    const source = await readFile(key, 'utf8');
    let code = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
        fileName: key,
    }).outputText;
    code = transform(code.replace(/import\.meta\.env\.DEV/g, 'false'));
    const specifiers = [...new Set([...code.matchAll(/(?:\bfrom\s*|\bimport\s*)['"]([^'"]+)['"]/g)].map(match => match[1]))];
    for (const specifier of specifiers) {
        let url;
        if (stubs.has(specifier)) url = stubs.get(specifier);
        else if (specifier.startsWith('.')) url = await loadModule(await resolveSource(key, specifier));
        else throw new Error(`unexpected package import "${specifier}" in ${key} (add a stub)`);
        code = code.split(`'${specifier}'`).join(`'${url}'`).split(`"${specifier}"`).join(`"${url}"`);
    }
    const url = toUrl(code);
    cache.set(key, url);
    return url;
}

const src = path => resolve(root, 'src', path);

// ── 2. 가짜 제공업체와 환경 ─────────────────────────────────────────────────────────────
const outbound = [];        // 외부로 나가려던 모든 요청 { provider, kind, payload }
let geminiResponder = () => ({ text: 'Gemini 응답', candidates: [{ finishReason: 'STOP' }] });
let fetchResponder = () => ({ status: 200, body: {} });
globalThis.__privacyTest = {
    recordGemini(kind, payload) {
        outbound.push({ provider: 'gemini', kind, payload });
        return geminiResponder(payload, kind);
    },
};

stubs.set('@google/genai', toUrl(`
    export class GoogleGenAI {
        constructor() {
            this.models = {
                generateContent: async request => {
                    const result = globalThis.__privacyTest.recordGemini('generateContent', request);
                    if (result instanceof Error) throw result;
                    return result;
                },
                get: async () => ({ displayName: 'stub' }),
            };
            this.files = {
                upload: async request => { globalThis.__privacyTest.recordGemini('files.upload', request); return { name: 'files/stub', uri: 'stub://file' }; },
                delete: async () => ({}),
            };
        }
    }
    export const ThinkingLevel = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' };
    export const Type = { OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER', ARRAY: 'ARRAY' };
`));

let settings;
let seekers = [];
let jobs = [];
let caseDocuments = [];
let storeInitialized = true;
globalThis.__privacyJobs = () => jobs;
globalThis.__privacyCaseDocuments = () => caseDocuments;
globalThis.__privacyInitialized = () => storeInitialized;
stubs.set(src('store/settingsStore.ts'), toUrl(`export const useSettingsStore = { getState: () => ({ settings: globalThis.__privacySettings() }) };`));
stubs.set(src('store/dataStore.ts'), toUrl(`export const useDataStore = { getState: () => ({ seekers: globalThis.__privacySeekers(), jobs: globalThis.__privacyJobs(), caseDocuments: globalThis.__privacyCaseDocuments(), initialized: globalThis.__privacyInitialized() }) };`));
globalThis.__privacySettings = () => settings;
globalThis.__privacySeekers = () => seekers;
stubs.set(src('utils/file.ts'), toUrl(`
    export async function fileToBase64(file) { return Buffer.from(await file.arrayBuffer()).toString('base64'); }
    export async function fileToDataUrl(file) { return 'data:' + file.type + ';base64,' + await fileToBase64(file); }
    export function estimateBase64Size(n) { return Math.ceil(n / 3) * 4; }
`));

// 실제 localPdfText 모듈(pdf.js가 없는 환경: import.meta.glob → 빈 목록). 설치 여부와 관계없이 이 테스트는 결정적으로 동작한다.
const realPdfUrl = await loadModule(src('services/localPdfText.ts'), code => code.replace(/import\.meta\.glob(?:<[^>]*>)?\([^)]*\)/g, '({})'));
const realPdf = await import(realPdfUrl);
// 테스트용 PDF: "%PDF-TEXT:" 로 시작하면 글자가 있는 PDF로 보고 그 글을 돌려준다(그 밖은 스캔본 취급).
stubs.set(src('services/localPdfText.ts'), toUrl(`
    export { isMeaningfulPdfText, isLocalPdfTextAvailable } from '${realPdfUrl}';
    export async function extractPdfTextLocally(bytes) {
        const text = Buffer.from(bytes).toString('utf8');
        if (!text.startsWith('%PDF-TEXT:')) return null;
        return { text: text.slice(10), pageCount: 1, checkedPageCount: 1, textPageCount: 1, truncated: false };
    }
`));

const windowTarget = new EventTarget();
globalThis.window = windowTarget;

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
    const provider = String(url).includes('openai') ? 'openai'
        : String(url).includes('anthropic') ? 'anthropic'
            : String(url).includes('vision.googleapis') ? 'vision' : 'unknown';
    assert.notEqual(provider, 'unknown', `unexpected network request: ${url}`);
    const payload = JSON.parse(init.body || '{}');
    outbound.push({ provider, kind: 'fetch', payload, headers: init.headers });
    const { status = 200, body = {} } = fetchResponder(provider, payload) || {};
    return { ok: status >= 200 && status < 300, status, json: async () => body };
};

const gemini = await import(await loadModule(src('services/gemini.ts')));
const ocr = await import(await loadModule(src('services/ocr.ts')));
const gateway = await import(await loadModule(src('services/aiPrivacyGateway.ts')));
const knownNames = await import(await loadModule(src('services/knownNames.ts')));
const consent = await import(await loadModule(src('services/attachmentConsent.ts')));
const safety = await import(await loadModule(src('services/aiRequestSafety.ts')));

// ── 3. 합성 개인정보와 검사 도우미 ────────────────────────────────────────────────────────
const PII = ['홍가람', '010-1234-5678', '900101-1234567', 'test@example.com', '1990-01-01', '월드컵로 123'];
const HEALTH = ['행복정신건강의학과의원', '김민준', '2020.03.02'];
const SAMPLE = [
    '이름: 홍가람',
    '연락처: 010-1234-5678',
    '주민등록번호: 900101-1234567',
    '이메일: test@example.com',
    '생년월일: 1990-01-01',
    '주소: 서울특별시 마포구 월드컵로 123',
    '장애유형: 지적장애 중증',
    '진료: 행복정신건강의학과의원 김민준 전문의, 진단일: 2020.03.02',
    '상담 내용: 홍가람 님은 바리스타 직무를 희망함. 홍가람 이용자는 오전 근무를 선호함.',
].join('\n');

function serialize(value) {
    return JSON.stringify(value, (key, item) => {
        if (key === 'abortSignal' || key === 'signal') return undefined;
        if (typeof Blob !== 'undefined' && item instanceof Blob) return `[Blob ${item.size}]`;
        return item;
    });
}

function assertClean(entries, label, extra = []) {
    assert.ok(entries.length > 0, `${label}: no outbound request captured`);
    for (const entry of entries) {
        const text = serialize(entry.payload);
        for (const value of [...PII, ...extra]) {
            assert.equal(text.includes(value), false, `${label}: "${value}" leaked to ${entry.provider}`);
        }
        assert.equal(text.includes('JJSS-MESSAGE-BOUNDARY'), false, `${label}: boundary marker leaked`);
    }
}

function firstToken(entries, category = '이름') {
    const match = serialize(entries.map(entry => entry.payload)).match(new RegExp(`⟦${category}\\d+⟧`));
    return match?.[0] || '';
}

const consentLog = [];
// null = 확인창 없음(기본 거절), true/false = 사용자 선택, 함수 = 요청마다 다른 선택
let consentDecision = null;
windowTarget.addEventListener(consent.ATTACHMENT_SEND_CONSENT_EVENT, event => {
    if (consentDecision === null) return; // 화면이 없는 상황 흉내 → handled=false → 자동 거절
    event.detail.handled = true;
    consentLog.push({ provider: event.detail.provider, message: consent.attachmentSendConsentMessage(event.detail.provider), note: event.detail.note });
    event.detail.resolve(typeof consentDecision === 'function' ? consentDecision(event.detail) : consentDecision);
});

function baseSettings(selectedProvider, failover = {}) {
    return {
        selectedProvider,
        visionApiKey: '',
        aiFailover: failover,
        llmConfigs: [
            { provider: 'gemini', apiKey: 'synthetic-gemini-key', model: 'gemini-3.5-flash-lite', reasoningLevel: 'auto' },
            { provider: 'openai', apiKey: 'synthetic-openai-key', model: 'gpt-5.6-luna', reasoningLevel: 'auto' },
            { provider: 'anthropic', apiKey: 'synthetic-anthropic-key', model: 'claude-sonnet-5', reasoningLevel: 'auto' },
        ],
    };
}
const CROSS_PROVIDER_FAILOVER = { enabled: true, allowCrossProvider: true, crossProviderConsentConfirmed: true, usagePolicy: 'economy' };

let passed = 0;
async function test(name, run) {
    outbound.length = 0;
    consentLog.length = 0;
    consentDecision = null;
    seekers = [];
    safety.__resetAIRequestSafetyForTests();
    geminiResponder = payload => {
        const token = firstToken([{ payload }]);
        return { text: `${token || '이용자'} 님 결과 정리`, candidates: [{ finishReason: 'STOP' }] };
    };
    fetchResponder = () => ({ status: 200, body: {} });
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
}

const history = [
    { role: 'user', content: '지난번 상담: 홍가람 010-1234-5678, test@example.com' },
    { role: 'model', content: '홍가람 님 상담 내용을 확인했습니다.' },
];

// ── 4. 텍스트 요청: 제공업체별 실제 payload 검사 + 로컬 복원 ────────────────────────────────
await test('Gemini(SDK) 텍스트·이전 대화 payload에 직접식별정보가 없고, 응답은 PC에서 원래 이름으로 복원', async () => {
    settings = baseSettings('gemini');
    const result = await gemini.generateText('counseling', SAMPLE, undefined, { history, featureKey: 'privacy-test', documentType: 'gemini' });
    assertClean(outbound, 'gemini', HEALTH);
    const payload = serialize(outbound[0].payload);
    assert.match(payload, /⟦이름\d+⟧/);
    assert.match(payload, /지적장애 중증/, '장애유형·중증도는 업무상 필요해 유지');
    assert.match(payload, /정신건강의학과의원/, '진료과·기관 종류는 유지');
    assert.equal(outbound[0].payload.contents.length, 3, '이전 대화 2개 + 현재 입력');
    assert.ok(result.includes('홍가람'), 'restored locally');
    assert.equal(result.includes('⟦'), false);
});

await test('OpenAI(fetch) 텍스트·이전 대화 payload 검사 + 로컬 복원(키는 헤더에만)', async () => {
    settings = baseSettings('openai');
    fetchResponder = (_provider, payload) => ({ status: 200, body: { choices: [{ finish_reason: 'stop', message: { content: `${firstToken([{ payload }])} 님 결과` } }] } });
    const result = await gemini.generateText('counseling', SAMPLE, undefined, { history, featureKey: 'privacy-test', documentType: 'openai' });
    assertClean(outbound, 'openai', HEALTH);
    assert.equal(outbound[0].provider, 'openai');
    assert.equal(outbound[0].payload.messages.length, 4, 'system + history 2 + user');
    assert.equal(serialize(outbound[0].payload).includes('synthetic-openai-key'), false);
    assert.ok(result.includes('홍가람'));
});

await test('Anthropic(fetch) 텍스트·이전 대화 payload 검사 + 로컬 복원', async () => {
    settings = baseSettings('anthropic');
    fetchResponder = (_provider, payload) => ({ status: 200, body: { stop_reason: 'end_turn', content: [{ type: 'text', text: `${firstToken([{ payload }])} 님 결과` }] } });
    const result = await gemini.generateText('case_meeting', SAMPLE, undefined, { history, featureKey: 'privacy-test', documentType: 'anthropic' });
    assertClean(outbound, 'anthropic', HEALTH);
    assert.equal(outbound[0].provider, 'anthropic');
    assert.ok(result.includes('홍가람'));
});

await test('텍스트 요청의 다른 제공업체 자동 전환(설정 허용 시)도 같은 비식별화 payload만 보냄', async () => {
    settings = baseSettings('gemini', CROSS_PROVIDER_FAILOVER);
    geminiResponder = () => Object.assign(new Error('service unavailable'), { status: 503 });
    fetchResponder = (_provider, payload) => ({ status: 200, body: { choices: [{ finish_reason: 'stop', message: { content: `${firstToken([{ payload }])} 확인` } }] } });
    const result = await gemini.generateText('counseling', SAMPLE, undefined, { featureKey: 'privacy-test', documentType: 'failover' });
    assert.deepEqual(outbound.map(entry => entry.provider), ['gemini', 'openai']);
    assertClean(outbound, 'text failover', HEALTH);
    assert.ok(result.includes('홍가람'));
});

await test('요청 관련 knownNames(훈련생·직무지도원)만 추가로 가림: 라벨 없는 이름도 전송되지 않음', async () => {
    settings = baseSettings('gemini');
    const text = '오늘 도하윤 훈련생이 작업을 마침. 지도원 서지안이 기록함.';
    await gemini.generateText('evaluation', text, undefined, { featureKey: 'privacy-test', documentType: 'known', knownNames: ['도하윤', '서지안'] });
    assertClean(outbound, 'knownNames', ['도하윤', '서지안']);
    // 이용자 사전(seekers)도 기존처럼 사용
    outbound.length = 0;
    safety.__resetAIRequestSafetyForTests();
    seekers = [{ name: '문가온' }];
    await gemini.generateText('evaluation', '문가온 참여 기록 정리', undefined, { featureKey: 'privacy-test', documentType: 'seekers' });
    assertClean(outbound, 'seekers', ['문가온']);
});

// ── 5. 이미지 생성 프롬프트 ─────────────────────────────────────────────────────────────
await test('이미지 생성 프롬프트 비식별화: 원문·토큰 모두 없이 자리표시만 보내고 결과에 이름을 되돌리지 않음', async () => {
    settings = baseSettings('gemini');
    geminiResponder = () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { data: 'aW1n', mimeType: 'image/png' } }] } }] });
    const result = await gemini.generateImage(`${SAMPLE}\n위 이용자 홍가람 님 취업 축하 포스터`, 'custom', 'nanobanana2', { knownNames: ['홍가람'] });
    assertClean(outbound, 'image prompt', HEALTH);
    const payload = serialize(outbound[0].payload);
    assert.equal(payload.includes('⟦'), false, 'token shapes must not be drawn in the image');
    assert.match(payload, /○○○/);
    assert.deepEqual(result, { imageBase64: 'aW1n', mimeType: 'image/png' });
});

// ── 6. 첨부: 텍스트 PDF는 로컬 추출 글만, 이미지·스캔본은 동의 C 없이는 전송 금지 ─────────────────
const textPdfBase64 = Buffer.from(`%PDF-TEXT:${SAMPLE}`).toString('base64');
const imageBase64 = Buffer.from('synthetic-image-bytes 홍가람 010-1234-5678').toString('base64');

await test('텍스트 PDF(문서 질의응답): 원본 없이 PC에서 추출·비식별화한 글만 전송, 확인창 없음, 파일 이름도 가림', async () => {
    settings = baseSettings('gemini');
    const result = await gemini.generateText('summary', '홍가람 님 목표를 요약해 줘', [{ mimeType: 'application/pdf', data: textPdfBase64, name: '홍가람_계획서.pdf' }], { featureKey: 'privacy-test', documentType: 'pdf' });
    assert.equal(consentLog.length, 0, 'no consent needed for local text');
    assertClean(outbound, 'pdf text', HEALTH);
    const payload = serialize(outbound[0].payload);
    assert.equal(payload.includes('inlineData'), false, 'original PDF must not be sent');
    assert.equal(payload.includes(textPdfBase64.slice(0, 40)), false);
    assert.match(payload, /첨부 문서에서 PC 안에서 추출한 글/);
    assert.ok(result.includes('홍가람'));
});

await test('직업평가 분석·종합보고서: 텍스트 PDF는 글만, 원본 업로드·inlineData 없음', async () => {
    settings = baseSettings('gemini');
    const pdf = new File([`%PDF-TEXT:${SAMPLE}`], '홍가람_검사결과.pdf', { type: 'application/pdf' });
    const analysis = await gemini.analyzeTestResults([pdf], '관찰 메모: 홍가람 님 집중 양호. 연락처 010-1234-5678');
    safety.__resetAIRequestSafetyForTests();
    const report = await gemini.generateReport('참고: 홍가람 님 900101-1234567', [pdf]);
    assert.equal(consentLog.length, 0);
    assert.equal(outbound.length, 2);
    assertClean(outbound, 'vocational pdf', HEALTH);
    assert.equal(outbound.some(entry => entry.kind === 'files.upload' || serialize(entry.payload).includes('inlineData')), false);
    assert.ok(analysis.includes('홍가람') && report.includes('홍가람'));
});

await test('문서 OCR: 텍스트 PDF는 PC 안에서만 읽고 네트워크 요청 0건', async () => {
    settings = { ...baseSettings('gemini'), visionApiKey: 'synthetic-vision-key' };
    const pdf = new File([`%PDF-TEXT:${SAMPLE}`], 'scan.pdf', { type: 'application/pdf' });
    const text = await ocr.performOCR(pdf);
    assert.equal(outbound.length, 0);
    assert.equal(consentLog.length, 0);
    assert.ok(text.includes('홍가람'), 'local OCR result stays on the PC');
});

await test('이미지 첨부: 확인창이 없거나(기본) 취소하면 전송하지 않음(Gemini·Vision 모두 0건)', async () => {
    settings = { ...baseSettings('gemini'), visionApiKey: 'synthetic-vision-key' };
    const image = new File([Buffer.from('synthetic-image')], '홍가람.png', { type: 'image/png' });
    const scanned = new File([Buffer.from('%PDF-1.7 scanned')], 'scan.pdf', { type: 'application/pdf' });
    for (const decision of [null, false]) {
        consentDecision = decision;
        const denied = error => error.code === consent.ATTACHMENT_CONSENT_DENIED_CODE;
        await assert.rejects(gemini.generateText('summary', '질문', [{ mimeType: 'image/png', data: imageBase64, name: 'a.png' }], { featureKey: 'privacy-test', documentType: `img-${decision}` }), denied);
        await assert.rejects(gemini.analyzeTestResults([image], ''), denied);
        await assert.rejects(gemini.generateReport('참고', [scanned]), denied);
        await assert.rejects(ocr.performOCR(image), denied);
        await assert.rejects(ocr.performOCR(scanned), denied);
    }
    assert.equal(outbound.length, 0, 'nothing may leave without consent C');
});

await test('동의 C 문구·제공업체 이름, 동의 A/B와 별개(자동 전환 허용 설정이어도 매번 확인)', async () => {
    assert.equal(consent.attachmentSendConsentMessage('gemini'), '이 파일은 이미지/PDF 원본이 Google Gemini로 전송됩니다. 파일에 이름, 연락처 등 개인정보가 포함되어 있는지 확인해 주세요.');
    assert.match(consent.attachmentSendConsentMessage('vision'), /Google Cloud Vision으로 전송됩니다/);
    settings = baseSettings('gemini', CROSS_PROVIDER_FAILOVER);
    consentDecision = true;
    await gemini.generateText('summary', '사진 설명', [{ mimeType: 'image/png', data: imageBase64 }], { featureKey: 'privacy-test', documentType: 'consent-1' });
    safety.__resetAIRequestSafetyForTests();
    await gemini.generateText('summary', '사진 설명 2', [{ mimeType: 'image/png', data: imageBase64 }], { featureKey: 'privacy-test', documentType: 'consent-2' });
    assert.equal(consentLog.length, 2, 'asked once per request');
    assert.ok(consentLog.every(entry => entry.provider === 'gemini'));
    // 승인한 원본만 inlineData로 나가고, 사용자가 쓴 글은 여전히 비식별화된다.
    assert.equal(outbound.filter(entry => serialize(entry.payload).includes('inlineData')).length, 2);
});

await test('첨부 요청은 제공업체 자동 전환 없음: Gemini 실패 시 OpenAI/Anthropic 호출 0건', async () => {
    settings = baseSettings('gemini', CROSS_PROVIDER_FAILOVER);
    consentDecision = true;
    geminiResponder = () => Object.assign(new Error('service unavailable'), { status: 503 });
    await assert.rejects(gemini.generateText('summary', '홍가람 사진 설명', [{ mimeType: 'image/png', data: imageBase64 }], { featureKey: 'privacy-test', documentType: 'attach-failover' }));
    assert.deepEqual(outbound.map(entry => entry.provider), ['gemini']);
    // 텍스트 PDF로 바뀐 첨부 요청도 전환하지 않는다.
    outbound.length = 0;
    safety.__resetAIRequestSafetyForTests();
    await assert.rejects(gemini.generateText('summary', '요약', [{ mimeType: 'application/pdf', data: textPdfBase64 }], { featureKey: 'privacy-test', documentType: 'pdf-failover' }));
    assert.deepEqual(outbound.map(entry => entry.provider), ['gemini']);
});

await test('OCR 이미지: Vision 승인 후 실패해도 Gemini로 자동 전환하지 않고, 별도 확인(동의 C)을 다시 받음', async () => {
    settings = { ...baseSettings('gemini'), visionApiKey: 'synthetic-vision-key' };
    const image = new File([Buffer.from('synthetic-image')], 'photo.png', { type: 'image/png' });
    fetchResponder = () => ({ status: 403, body: { error: { status: 'PERMISSION_DENIED', message: 'denied' } } });
    let decisions = [true, false];
    consentDecision = () => decisions.shift() ?? false;
    await assert.rejects(ocr.performOCR(image), error => error.code === consent.ATTACHMENT_CONSENT_DENIED_CODE);
    assert.deepEqual(consentLog.map(entry => entry.provider), ['vision', 'gemini']);
    assert.match(consentLog[1].note, /Vision|읽지|권한/);
    assert.deepEqual(outbound.map(entry => entry.provider), ['vision'], 'Gemini must not be called after refusal');
    // 두 번째 확인도 승인하면 Gemini 요청 1회만 추가된다.
    outbound.length = 0;
    consentLog.length = 0;
    safety.__resetAIRequestSafetyForTests();
    decisions = [true, true];
    geminiResponder = () => ({ text: '인식된 글자', candidates: [{ finishReason: 'STOP' }] });
    assert.equal(await ocr.performOCR(image), '인식된 글자');
    assert.deepEqual(outbound.map(entry => entry.provider), ['vision', 'gemini']);
});

await test('우회 차단: 확인을 거치지 않은 파일은 Gemini 파일 part로 만들 수 없음', async () => {
    const image = new File([Buffer.from('x')], 'x.png', { type: 'image/png' });
    const client = gemini.createGoogleAIClient('synthetic-gemini-key');
    await assert.rejects(gemini.buildGeminiFileParts(client, [image], []), error => error.code === 'AI_ATTACHMENT_NOT_APPROVED');
    assert.equal(outbound.length, 0);
});

await test('영수증 AI 정리: OCR 글의 개인정보는 가려서 보내고 결과 항목만 복원', async () => {
    settings = baseSettings('gemini');
    geminiResponder = payload => {
        const token = firstToken([{ payload }]);
        return { text: JSON.stringify({ vendor: `${token} 상점`, items: [{ description: '커피', amount: 4500 }] }), candidates: [{ finishReason: 'STOP' }] };
    };
    const parsed = await ocr.smartParseItemizedReceiptWithAI(`가맹점: 행복상점\n구매자 성명: 홍가람\n전화 010-1234-5678\n커피 4,500원`);
    assertClean(outbound, 'receipt');
    assert.equal(parsed.vendor, '홍가람 상점');
});

await test('pdf.js가 없으면 로컬 추출은 null → 원본 전송 확인 대상(자동 전송 없음)', async () => {
    assert.equal(realPdf.isLocalPdfTextAvailable(), false);
    assert.equal(await realPdf.extractPdfTextLocally(new Uint8Array([37, 80, 68, 70])), null);
    assert.equal(realPdf.isMeaningfulPdfText({ text: '가'.repeat(100), pageCount: 1, checkedPageCount: 1, textPageCount: 1, truncated: false }), true);
    assert.equal(realPdf.isMeaningfulPdfText({ text: '�'.repeat(100), pageCount: 1, checkedPageCount: 1, textPageCount: 1, truncated: false }), false);
    assert.equal(realPdf.isMeaningfulPdfText({ text: '가'.repeat(100), pageCount: 10, checkedPageCount: 10, textPageCount: 2, truncated: false }), false, 'mostly scanned');
});

await test('gateway: 이전 대화·추가 글·현재 입력이 같은 토큰을 쓰고 매핑은 반환값에만 존재', async () => {
    seekers = [];
    const prepared = gateway.prepareAIOutboundText('홍가람 님 목표', { history: [{ role: 'user', content: '이름: 홍가람' }], extraSegments: ['문서: 홍가람 010-1234-5678'] });
    const token = Object.keys(prepared.mapping).find(key => prepared.mapping[key] === '홍가람');
    assert.ok(token);
    for (const part of [prepared.text, prepared.history[0].content, prepared.extraSegments[0]]) {
        assert.ok(part.includes(token));
        for (const value of PII) assert.equal(part.includes(value), false);
    }
    assert.equal(gateway.restoreAIResponse(`${token} 님`, prepared.mapping), '홍가람 님');
});


await test('이름 사전: 이용자·사업체 담당자·지원고용 관계자까지 모은다', async () => {
    seekers = [{ name: '가온해' }];
    jobs = [{ contactPerson: '나래솔', managerName: '다온빛' }];
    caseDocuments = [
        {
            type: 'supported_employment',
            seekerName: '라온별',
            content: JSON.stringify({ seekerName: '라온별', coach: { name: '마루한' }, staffName: '바다찬' }),
        },
    ];
    const names = knownNames.collectKnownNames(['사랑결']);
    for (const expected of ['가온해', '나래솔', '다온빛', '라온별', '마루한', '바다찬', '사랑결']) {
        assert.ok(names.includes(expected), `사전에 없음: ${expected}`);
    }
    // 이름 칸에 들어가는 비-이름 값은 사전에 넣지 않는다(문장이 망가지지 않게).
    jobs = [{ contactPerson: '미정' }];
    assert.equal(knownNames.collectKnownNames().includes('미정'), false);
    jobs = [];
    caseDocuments = [];
});

await test('자유 문장 속 보호자·담당자 이름도 사전에 있으면 가려진다', async () => {
    seekers = [{ name: '가온해' }];
    jobs = [{ contactPerson: '나래솔' }];
    const prepared = gateway.prepareAIOutboundText('가온해와 어머니 하늘채가 상담에 참여했고 나래솔이 협의하기로 함.', {
        knownNames: ['하늘채'],
    });
    for (const name of ['가온해', '나래솔', '하늘채']) {
        assert.equal(prepared.text.includes(name), false, `가려지지 않음: ${name}`);
    }
    jobs = [];
});

await test('이름 사전이 준비되지 않으면 개인정보 요청을 보내지 않는다(fail-closed)', async () => {
    storeInitialized = false;
    assert.equal(knownNames.isKnownNamesReady(), false);
    // 개인정보가 섞일 수 있는 요청은 막는다.
    assert.throws(() => gemini.assertKnownNamesReady('counseling'), /개인정보를 가릴 준비/);
    assert.throws(() => gemini.assertKnownNamesReady('evaluation'), /개인정보를 가릴 준비/);
    // 앱이 만든 문구 계열(홍보·블로그 등)은 막지 않는다.
    gemini.assertKnownNamesReady('blog');
    gemini.assertKnownNamesReady('promo');
    storeInitialized = true;
    gemini.assertKnownNamesReady('counseling');
});

await test('첨부 문서 글에 실제 파일 이름이 들어가지 않는다', async () => {
    const segment = gateway.formatDocumentSegment(
        { name: '가온해_병원_평가지_20260925.pdf', text: '검사 결과 본문', note: '앞부분만 사용했습니다.' },
        0,
    );
    assert.equal(segment.includes('가온해'), false);
    assert.equal(segment.includes('.pdf'), false);
    assert.ok(segment.includes('첨부문서 1'));
    assert.ok(segment.includes('검사 결과 본문'));
});

globalThis.fetch = originalFetch;
console.log(`privacy outbound tests passed (${passed}) — mock providers only, no network, synthetic data.`);
