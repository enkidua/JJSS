// Run with a local Vite server and Playwright installed (or JJSS_PLAYWRIGHT_PATH).
// Uses a fresh browser context, synthetic records, and no external API requests.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.JJSS_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JJSS_TEST_URL || 'http://127.0.0.1:5178';

async function main() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1100, height: 850 } });
        await context.addInitScript(() => localStorage.setItem('jjss:api-key-onboarding-v1', 'later'));
        await context.route('**/*', async route => {
            if (new URL(route.request().url()).origin !== new URL(base).origin) return route.abort();
            return route.continue();
        });
        await context.route('**/src/services/gemini.ts', route => route.fulfill({
            contentType: 'application/javascript',
            body: "export * from '/src/services/gemini.ts?ux-original'; export async function generateText() { return '검증용 합성 상담 초안'; }",
        }));
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base);
        await page.locator('h1').waitFor();
        assert.equal(await page.locator('nav[aria-label="주요 메뉴"]').evaluate(el => getComputedStyle(el).position), 'fixed', 'Tailwind layout must be compiled');
        assert.equal(await page.locator('nav[aria-label="주요 메뉴"] a[aria-label="직업평가"]').count(), 1);
        for (const width of [768, 1100, 1280, 1440, 1920]) {
            await page.setViewportSize({ width, height: 850 });
            assert.equal(await page.locator('nav[aria-label="주요 메뉴"]').evaluate(nav =>
                Array.from(nav.querySelectorAll('a, button')).filter(el => el.getClientRects().length && getComputedStyle(el).display !== 'none')
                    .every(el => { const box = el.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; })), true, `navigation must fit at ${width}px`);
        }
        await page.setViewportSize({ width: 1100, height: 850 });
        for (const path of ['/manage', '/overview', '/evaluation', '/training', '/workmate', '/budget', '/tools', '/infomate', '/settings']) {
            await page.evaluate(path => { location.hash = path; }, path);
            await page.waitForFunction(path => document.title.endsWith('| JJSS') && location.hash === '#' + path, path);
            await page.locator('h1').waitFor();
        }
        console.log('PASS all ten routes and compiled navigation styles');
        await page.getByRole('button', { name: '파일·백업', exact: true }).click();
        assert.equal(new URL(page.url()).hash, '#/settings');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'files-backup');
        console.log('PASS settings section navigation preserves HashRouter route and focuses section');

        assert.equal(await page.locator('#model-gemini').inputValue(), 'gemini-3.5-flash-lite');
        assert.equal(await page.locator('#model-openai').inputValue(), 'gpt-5.6-luna');
        assert.equal(await page.locator('#model-anthropic option[value="claude-fable-5-1"]').count(), 1);
        assert.equal(await page.locator('#reasoning-gemini').inputValue(), 'medium');
        assert.equal(await page.locator('#reasoning-openai').inputValue(), 'medium');
        await page.locator('#reasoning-openai').selectOption('high');
        await page.waitForFunction(() => document.querySelector('#reasoning-openai')?.value === 'high' && !document.querySelector('#reasoning-openai')?.disabled);
        await page.reload();
        await page.locator('#reasoning-openai').waitFor();
        assert.equal(await page.locator('#reasoning-openai').inputValue(), 'high');
        await page.locator('#model-openai').selectOption('gpt-6-astra');
        await page.waitForFunction(() => document.querySelector('#model-openai')?.value === 'gpt-6-astra' && !document.querySelector('#model-openai')?.disabled);
        await page.locator('#model-openai').selectOption('gpt-5.6-terra');
        await page.waitForFunction(() => document.querySelector('#model-openai')?.value === 'gpt-5.6-terra' && !document.querySelector('#model-openai')?.disabled);
        console.log('PASS latest model defaults and retained previous model selection');

        await page.evaluate(() => { location.hash = '/infomate'; });
        await page.getByRole('button', { name: '새 리소스 추가' }).click();
        await page.getByLabel('제목', { exact: true }).fill('검증용 합성 자료');
        await page.getByLabel('메모', { exact: true }).fill('한글 입력 유지');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'resource-memo');
        page.once('dialog', dialog => dialog.dismiss());
        await page.getByRole('button', { name: '자료 편집 창 닫기' }).click();
        assert.equal(await page.getByLabel('메모', { exact: true }).inputValue(), '한글 입력 유지');
        page.once('dialog', dialog => dialog.accept());
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        console.log('PASS resource typing retains focus and dismissal protects draft');

        await page.evaluate(() => { location.hash = '/manage'; });
        await page.getByRole('button', { name: '이용자 등록', exact: true }).click();
        await page.getByLabel('구직자 이름').fill('검증용 합성 이용자');
        page.once('dialog', dialog => dialog.dismiss());
        await page.keyboard.press('Escape');
        assert.equal(await page.getByLabel('구직자 이름').inputValue(), '검증용 합성 이용자');
        page.once('dialog', dialog => dialog.accept());
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.getByLabel('이용자 검색').fill('일치하지않는합성검색어');
        await page.getByRole('button', { name: '검색 초기화' }).click();
        assert.equal(await page.getByLabel('이용자 검색').inputValue(), '');
        console.log('PASS registration draft guard and empty-search reset');

        await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            const expenses = [
                { id: 'ux-a', date: '2026-01-01', description: '합성지출A', amount: 1000, vendor: '테스트', category: '사업비', paymentMethod: '현금' },
                { id: 'ux-b', date: '2026-01-02', description: '합성지출B', amount: 2000, vendor: '테스트', category: '사업비', paymentMethod: '현금' },
            ];
            useDataStore.setState({ expenses, fetchExpenses: async () => expenses });
            location.hash = '/budget';
        });
        await page.getByRole('checkbox', { name: /합성지출A/ }).check();
        await page.locator('input[placeholder*="검색"]').fill('합성지출B');
        await page.getByText('다른 필터', { exact: false }).first().waitFor();
        assert.match(await page.locator('main').innerText(), /다른 필터[\s\S]*1건/);
        await page.getByRole('button', { name: '전체 선택 해제', exact: true }).first().click();
        console.log('PASS hidden budget selections remain visible in selection summary');

        await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            useDataStore.setState({ seekers: [{ id: 'ux-seeker', name: '합성 검증 이용자', seekerId: 'UX-1' }],
                fetchCaseDocuments: async () => [],
                addCaseDocument: async () => { throw new Error('검증용 저장 실패'); },
            });
            location.hash = '/workmate';
        });
        await page.getByText('합성 검증 이용자', { exact: true }).first().click();
        await page.getByRole('button', { name: /사후관리 \(상담 및 평가\)/ }).click();
        await page.getByPlaceholder(/상담 일시, 장소/).fill('검증용 상담 입력');
        await page.getByRole('button', { name: '새 초안 생성', exact: true }).last().click();
        await page.getByRole('button', { name: '작성 완료(저장)', exact: true }).click();
        await page.getByText('검증용 저장 실패', { exact: true }).waitFor();
        assert.equal(await page.locator('textarea').evaluateAll(nodes => nodes.some(node => node.value === '검증용 합성 상담 초안')), true);
        await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            useDataStore.setState({ addCaseDocument: async doc => ({ ...doc, id: 'ux-saved-doc', createdAt: { seconds: 1 } }) });
        });
        await page.getByRole('button', { name: '작성 완료(저장)', exact: true }).click();
        await page.getByRole('button', { name: '작성 완료(저장)', exact: true }).waitFor({ state: 'hidden' });
        assert.equal(await page.locator('textarea').evaluateAll(nodes => nodes.some(node => node.value === '검증용 합성 상담 초안')), true, 'saved history must retain content');
        console.log('PASS follow-up save failure retains draft and successful retry preserves history');

        await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            window.__uxWorkflow = { docs: [] };
            useDataStore.setState({
                seekers: [{ id: 'ux-seeker', name: '합성 검증 이용자', seekerId: 'UX-1' }],
                fetchCaseDocuments: async () => window.__uxWorkflow.docs,
                addCaseDocument: async () => { throw new Error('검증용 현황 저장 실패'); },
                updateCaseDocument: async (id, content) => {
                    window.__uxWorkflow.docs = window.__uxWorkflow.docs.map(doc => doc.id === id ? { ...doc, content } : doc);
                },
            });
            location.hash = '/overview?seekerId=ux-seeker';
        });
        await page.getByRole('heading', { name: '직업재활 현황판' }).waitFor();
        await page.getByLabel('할 일').fill('합성 후속 상담');
        await page.getByLabel('예정일').fill('2026-09-23');
        await page.getByRole('button', { name: '일정 추가' }).click();
        await page.getByText('검증용 현황 저장 실패').waitFor();
        assert.equal(await page.getByLabel('할 일').inputValue(), '합성 후속 상담');
        await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            useDataStore.setState({ addCaseDocument: async doc => {
                const saved = { ...doc, id: 'ux-workflow', createdAt: { seconds: 1 } };
                window.__uxWorkflow.docs = [saved];
                return saved;
            } });
        });
        await page.getByRole('button', { name: '일정 추가' }).click();
        await page.getByText('후속 일정을 저장했습니다.').waitFor();
        await page.getByLabel('목표명').fill('합성 출근 준비');
        await page.getByLabel('출발점').fill('도움 필요');
        await page.getByLabel('목표 상태').fill('독립 수행');
        await page.getByRole('button', { name: '목표 추가' }).click();
        await page.getByLabel('합성 출근 준비 변화 기록').fill('한 단계 진행');
        await page.getByRole('button', { name: '변화 기록' }).click();
        await page.getByText('목표 변화 기록을 저장했습니다.').waitFor();
        if (process.env.JJSS_UX_SCREENSHOTS === '1') {
            const fs = require('node:fs/promises');
            const path = require('node:path');
            const directory = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'jjss-workflow-preview-'));
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.screenshot({ path: path.join(directory, 'workflow-desktop.png'), fullPage: true });
            await page.setViewportSize({ width: 390, height: 700 });
            await page.screenshot({ path: path.join(directory, 'workflow-mobile.png'), fullPage: true });
            await page.setViewportSize({ width: 1100, height: 850 });
            console.log('Workflow visual previews: ' + directory);
        }
        await page.evaluate(() => { location.hash = '/manage'; });
        await page.getByRole('heading', { name: '이용자 및 사업체 관리' }).waitFor();
        await page.getByRole('button', { name: '현황판', exact: true }).click();
        await page.getByLabel('이용자 선택').selectOption('ux-seeker');
        await page.getByText('합성 후속 상담').waitFor();
        await page.getByText('한 단계 진행').waitFor();
        console.log('PASS workflow failed save retains input and task/goal history reloads from case documents');

        const persistenceContext = await browser.newContext({ viewport: { width: 1100, height: 850 } });
        try {
            await persistenceContext.addInitScript(() => localStorage.setItem('jjss:api-key-onboarding-v1', 'later'));
            await persistenceContext.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
            const persistencePage = await persistenceContext.newPage();
            await persistencePage.goto(base);
            const savedId = await persistencePage.evaluate(async () => {
                const db = await import('/src/config/localDB.ts');
                const { useDataStore } = await import('/src/store/dataStore.ts');
                const seeker = await db.addDoc('seekers', { name: '합성 저장 이용자', seekerId: 'UX-PERSIST', organization: '검증용' });
                await useDataStore.getState().fetchData(true);
                location.hash = `/overview?seekerId=${seeker.id}`;
                return seeker.id;
            });
            await persistencePage.getByLabel('할 일').fill('합성 암호화 일정');
            await persistencePage.getByLabel('예정일').fill('2026-09-23');
            await persistencePage.getByRole('button', { name: '일정 추가' }).click();
            await persistencePage.getByText('후속 일정을 저장했습니다.').waitFor();
            const raw = await persistencePage.evaluate(async () => {
                const request = indexedDB.open('JJSS_LOCAL_DB');
                const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
                return new Promise((resolve, reject) => {
                    const tx = db.transaction('caseDocuments', 'readonly');
                    const query = tx.objectStore('caseDocuments').getAll();
                    query.onsuccess = () => resolve(query.result.find(doc => doc.type === 'workflow')?.content);
                    query.onerror = () => reject(query.error);
                });
            });
            assert.equal(typeof raw, 'string');
            assert.equal(raw.includes('합성 암호화 일정'), false, 'workflow content must be encrypted at rest');
            await persistencePage.reload();
            await persistencePage.getByText('합성 암호화 일정').waitFor();
            assert.equal(new URL(persistencePage.url()).hash, `#/overview?seekerId=${savedId}`);
            console.log('PASS actual IndexedDB workflow persistence and encrypted content at rest');
        } finally { await persistenceContext.close(); }

        await page.setViewportSize({ width: 390, height: 600 });
        await page.getByRole('button', { name: '모바일 메뉴 열기' }).click();
        await page.locator('#mobile-navigation').waitFor();
        assert.equal(await page.locator('#mobile-navigation').evaluate(el => getComputedStyle(el).overflowY), 'auto');
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('button', { name: '모바일 메뉴 열기' }).getAttribute('aria-expanded'), 'false');
        await page.evaluate(() => { location.hash = '/unknown-ux-test'; });
        await page.getByRole('heading', { name: '페이지를 찾을 수 없습니다' }).waitFor();
        assert.deepEqual(errors, [], 'no uncaught browser runtime errors');
        console.log('PASS mobile menu, unknown-route recovery, and no uncaught runtime errors');
        if (process.env.JJSS_UX_SCREENSHOTS === '1') {
            const fs = require('node:fs/promises');
            const path = require('node:path');
            const directory = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'jjss-ux-preview-'));
            await page.setViewportSize({ width: 1440, height: 1000 });
            await page.evaluate(() => { location.hash = '/settings'; });
            await page.getByRole('heading', { name: '시스템 설정', exact: true }).waitFor();
            await page.waitForFunction(() => getComputedStyle(document.getElementById('ai-model')).opacity === '1');
            await page.screenshot({ path: path.join(directory, 'settings-desktop.png') });
            await page.setViewportSize({ width: 390, height: 700 });
            await page.getByRole('button', { name: '모바일 메뉴 열기' }).click();
            await page.locator('#mobile-navigation').waitFor();
            await page.waitForFunction(() => getComputedStyle(document.getElementById('mobile-navigation')).opacity === '1' && document.getElementById('mobile-navigation').getBoundingClientRect().height > 400);
            await page.screenshot({ path: path.join(directory, 'navigation-mobile.png') });
            console.log('Visual previews: ' + directory);
        }
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
