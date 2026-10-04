// 화면 모양 비교 도구(배포 전 UI 라이브러리 교체 확인용). 합성 상태로 각 메뉴를 열어 화면을 찍고, 두 묶음의 픽셀 차이를 잰다.
//   node scripts/visual-snapshot.cjs shoot <이름>         → release/visual/<이름>/*.png
//   node scripts/visual-snapshot.cjs diff <이름A> <이름B>  → 화면별 차이 비율과 diff 이미지(release/visual/diff-<A>-<B>/)
// 개발 서버(http://127.0.0.1:5178)가 떠 있어야 한다. 네트워크·실제 데이터·API 키를 쓰지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:5178/#';
const ROUTES = ['/', '/manage', '/overview', '/evaluation', '/training', '/workmate', '/budget', '/tools', '/infomate', '/settings', '/missing-route'];
const OUT_ROOT = path.resolve(__dirname, '..', 'release', 'visual');

function fileName(route) {
    return `${route === '/' ? 'home' : route.slice(1).replace(/\//g, '_')}.png`;
}

async function shoot(name) {
    const outDir = path.join(OUT_ROOT, name);
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
    await context.addInitScript(() => {
        localStorage.setItem('jjss:api-key-onboarding-v1', 'later');
        // 날짜가 드러나는 칸은 두 묶음을 같은 날 찍으므로 그대로 둔다. 애니메이션만 끈다.
        const style = document.createElement('style');
        style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }';
        document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    });
    const page = await context.newPage();
    for (const route of ROUTES) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(outDir, fileName(route)), fullPage: true, animations: 'disabled' });
        console.log(`shot ${route} → ${path.relative(process.cwd(), path.join(outDir, fileName(route)))}`);
    }
    await browser.close();
}

async function diff(a, b) {
    const dirA = path.join(OUT_ROOT, a);
    const dirB = path.join(OUT_ROOT, b);
    const outDir = path.join(OUT_ROOT, `diff-${a}-${b}`);
    fs.mkdirSync(outDir, { recursive: true });
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const rows = [];
    for (const route of ROUTES) {
        const file = fileName(route);
        const pa = path.join(dirA, file);
        const pb = path.join(dirB, file);
        if (!fs.existsSync(pa) || !fs.existsSync(pb)) { rows.push({ route, missing: true }); continue; }
        const result = await page.evaluate(async ([da, db]) => {
            const load = src => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
            const [ia, ib] = await Promise.all([load(da), load(db)]);
            const width = Math.max(ia.width, ib.width);
            const height = Math.max(ia.height, ib.height);
            const draw = img => { const c = document.createElement('canvas'); c.width = width; c.height = height; const ctx = c.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, width, height); };
            const A = draw(ia).data;
            const B = draw(ib).data;
            const out = document.createElement('canvas'); out.width = width; out.height = height;
            const octx = out.getContext('2d');
            const o = octx.createImageData(width, height);
            let changed = 0; let minX = width, minY = height, maxX = -1, maxY = -1;
            for (let i = 0; i < A.length; i += 4) {
                const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
                const p = i / 4; const x = p % width; const y = (p - x) / width;
                if (d > 48) {
                    changed += 1; o.data[i] = 255; o.data[i + 1] = 0; o.data[i + 2] = 64; o.data[i + 3] = 255;
                    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
                } else {
                    const g = Math.round((B[i] + B[i + 1] + B[i + 2]) / 3 * 0.35 + 40);
                    o.data[i] = g; o.data[i + 1] = g; o.data[i + 2] = g; o.data[i + 3] = 255;
                }
            }
            octx.putImageData(o, 0, 0);
            return { width, height, sizeA: [ia.width, ia.height], sizeB: [ib.width, ib.height], changed, total: width * height, bbox: maxX < 0 ? null : [minX, minY, maxX, maxY], png: out.toDataURL('image/png') };
        }, [`data:image/png;base64,${fs.readFileSync(pa).toString('base64')}`, `data:image/png;base64,${fs.readFileSync(pb).toString('base64')}`]);
        fs.writeFileSync(path.join(outDir, file), Buffer.from(result.png.split(',')[1], 'base64'));
        rows.push({ route, pct: (result.changed / result.total * 100), changed: result.changed, sizeA: result.sizeA, sizeB: result.sizeB, bbox: result.bbox });
    }
    await browser.close();
    for (const row of rows) {
        if (row.missing) { console.log(`${row.route.padEnd(16)} (파일 없음)`); continue; }
        const size = row.sizeA.join('x') === row.sizeB.join('x') ? row.sizeA.join('x') : `${row.sizeA.join('x')} → ${row.sizeB.join('x')}`;
        console.log(`${row.route.padEnd(16)} 차이 ${row.pct.toFixed(2).padStart(6)}%  (${row.changed}px, ${size})${row.bbox ? ` 범위 x${row.bbox[0]}-${row.bbox[2]} y${row.bbox[1]}-${row.bbox[3]}` : ''}`);
    }
    console.log(`diff 이미지: ${path.relative(process.cwd(), outDir)}`);
}

const [mode, ...args] = process.argv.slice(2);
(mode === 'shoot' && args[0] ? shoot(args[0]) : mode === 'diff' && args[1] ? diff(args[0], args[1]) : Promise.reject(new Error('usage: shoot <name> | diff <a> <b>')))
    .catch(error => { console.error(error); process.exit(1); });
