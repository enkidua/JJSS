// 실제 배포 번들(dist/)을 검사한다.
// 소스 테스트가 모두 통과해도 production 빌드에서만 드러나는 문제가 있다(CSP 주입, 개발 설정 유출 등).
// 사용: npm run build 뒤에 node scripts/check-production-build.mjs
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');

let failures = 0;
function check(ok, label, detail = '') {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`);
    if (!ok) failures += 1;
}

try {
    await stat(distDir);
} catch {
    console.error('dist 폴더가 없습니다. 먼저 npm run build를 실행하세요.');
    process.exit(1);
}

const indexPath = path.join(distDir, 'index.html');
const indexHtml = await readFile(indexPath, 'utf8');

/* ── CSP ─────────────────────────────────────────────────────── */

const cspMatch = /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*content=["']([^"']+)["']/i.exec(indexHtml);
check(Boolean(cspMatch), '배포 index.html에 CSP 메타 태그가 있음');

/** HTML 속성 안의 값은 &#39; 같은 엔티티로 들어 있어 그대로 비교하면 어긋난다. */
function decodeHtmlEntities(value) {
    return value
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

if (cspMatch) {
    const csp = decodeHtmlEntities(cspMatch[1]);
    const directive = name => {
        const found = csp.split(';').map(part => part.trim()).find(part => part.startsWith(`${name} `));
        return found ? found.slice(name.length + 1).trim() : '';
    };
    // script-src에 unsafe-eval이 들어가면 번들된 코드가 임의 문자열을 실행할 수 있다.
    check(!/unsafe-eval/i.test(csp), 'CSP에 unsafe-eval 없음');
    check(directive('object-src') === "'none'", "object-src 'none'", directive('object-src'));
    check(directive('base-uri') === "'self'", "base-uri 'self'", directive('base-uri'));
    check(directive('form-action') === "'none'", "form-action 'none'", directive('form-action'));
    check(directive('default-src').includes("'self'"), "default-src에 'self' 포함", directive('default-src'));
    // connect-src는 AI 제공업체만 허용해야 한다. 와일드카드가 들어가면 어디로든 보낼 수 있다.
    const connect = directive('connect-src');
    check(connect.length > 0 && !/(^|\s)\*(\s|$)/.test(connect), 'connect-src에 와일드카드 없음', connect);
}

/* ── 개발 설정 유출 ───────────────────────────────────────────── */

async function collect(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await collect(full)));
        else out.push(full);
    }
    return out;
}

const bundleFiles = (await collect(distDir)).filter(file => file.endsWith('.js'));
let sourceMapCount = 0;
let localhostHits = [];
for (const file of (await collect(distDir))) {
    if (file.endsWith('.map')) sourceMapCount += 1;
}
for (const file of bundleFiles) {
    const content = await readFile(file, 'utf8');
    if (/https?:\/\/localhost|127\.0\.0\.1:\d+/.test(content)) localhostHits.push(path.relative(distDir, file));
}
check(sourceMapCount === 0, '배포본에 소스맵 없음', sourceMapCount ? `${sourceMapCount}개` : '');
check(localhostHits.length === 0, '배포본에 개발 서버 주소 없음', localhostHits.join(', '));

/* ── 비밀값 ──────────────────────────────────────────────────── */

const SECRETS = [
    ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
    ['OpenAI key', /\bsk-[A-Za-z0-9]{20,}/],
    ['Anthropic key', /\bsk-ant-[A-Za-z0-9-]{20,}/],
    ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const secretHits = [];
for (const file of bundleFiles) {
    const content = await readFile(file, 'utf8');
    for (const [label, pattern] of SECRETS) {
        if (pattern.test(content)) secretHits.push(`${label} (${path.relative(distDir, file)})`);
    }
}
check(secretHits.length === 0, '배포본에 API 키·개인키 없음', secretHits.join(', '));

/* ── Electron 진입점 ─────────────────────────────────────────── */

const mainSource = await readFile(path.join(root, 'electron', 'main.cjs'), 'utf8');
check(/nodeIntegration:\s*false/.test(mainSource), 'nodeIntegration=false');
check(/contextIsolation:\s*true/.test(mainSource), 'contextIsolation=true');
check(/sandbox:\s*true/.test(mainSource), 'sandbox=true');
check(/webviewTag:\s*false/.test(mainSource), 'webviewTag=false');

console.log(failures === 0 ? '\n배포 번들 검증 PASS' : `\n배포 번들 검증 FAIL (${failures}건)`);
process.exit(failures === 0 ? 0 : 1);
