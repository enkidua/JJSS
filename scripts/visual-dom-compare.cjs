// 두 개발 서버(예: Tailwind 3 / Tailwind 4)에서 같은 화면을 열어 요소별 위치·크기를 비교한다.
//   node scripts/visual-dom-compare.cjs http://127.0.0.1:5179 http://127.0.0.1:5178 [/route ...]
// 같은 DOM 경로(태그+순번)의 요소끼리 높이·너비·세로 위치가 다른 것을 찾아, 처음 다른 요소부터 보여 준다.
// 합성 상태(빈 DB)로 열며 네트워크·실제 데이터·API 키를 쓰지 않는다.
const { chromium } = require('playwright');

const [baseA, baseB, ...routesArg] = process.argv.slice(2);
if (!baseA || !baseB) { console.error('usage: <serverA> <serverB> [routes...]'); process.exit(1); }
const ROUTES = routesArg.length ? routesArg : ['/', '/manage', '/overview', '/evaluation', '/training', '/workmate', '/budget', '/tools', '/infomate', '/settings'];

async function collect(context, base, route) {
    const page = await context.newPage();
    await page.goto(`${base}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const rects = await page.evaluate(() => {
        const out = [];
        const walk = (el, pathKey) => {
            const r = el.getBoundingClientRect();
            out.push({ key: pathKey, tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').slice(0, 140), x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height), text: (el.childElementCount === 0 ? (el.textContent || '').trim().slice(0, 30) : '') });
            let index = 0;
            for (const child of el.children) { walk(child, `${pathKey}/${child.tagName.toLowerCase()}[${index}]`); index += 1; }
        };
        walk(document.body, 'body');
        return out;
    });
    await page.close();
    return rects;
}

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('jjss:api-key-onboarding-v1', 'later'));
    for (const route of ROUTES) {
        const [a, b] = await Promise.all([collect(context, baseA, route), collect(context, baseB, route)]);
        const byKey = new Map(b.map(item => [item.key, item]));
        const mismatches = [];
        for (const item of a) {
            const other = byKey.get(item.key);
            if (!other) { mismatches.push({ ...item, note: 'B에 없음' }); continue; }
            const dh = other.h - item.h; const dw = other.w - item.w; const dy = other.y - item.y;
            if (Math.abs(dh) > 1 || Math.abs(dw) > 1) mismatches.push({ ...item, dh, dw, dy, clsB: other.cls });
        }
        const sizeA = a[0]; const sizeB = b[0];
        console.log(`\n=== ${route}  body ${sizeA.w}x${sizeA.h} → ${sizeB.w}x${sizeB.h}  요소 ${a.length}/${b.length}, 크기 다른 요소 ${mismatches.length}`);
        // 가장 깊은(자식) 요소 중 크기가 바뀐 것이 원인에 가깝다: 바뀐 요소 가운데 자식 중 바뀐 것이 없는 것만 보여 준다.
        const changedKeys = new Set(mismatches.map(m => m.key));
        const leafChanges = mismatches.filter(m => ![...changedKeys].some(k => k !== m.key && k.startsWith(`${m.key}/`)));
        for (const m of leafChanges.slice(0, 12)) {
            console.log(`  <${m.tag}> Δh=${m.dh ?? '?'} Δw=${m.dw ?? '?'} Δy=${m.dy ?? '?'}  h=${m.h}  "${m.text}"  class="${m.cls}"${m.clsB && m.clsB !== m.cls ? `\n      → "${m.clsB}"` : ''}`);
        }
        if (leafChanges.length > 12) console.log(`  … ${leafChanges.length - 12}개 더`);
    }
    await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
