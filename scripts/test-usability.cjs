// Run with a local Vite server and Playwright installed (or JJSS_PLAYWRIGHT_PATH).
// Uses a fresh browser context, synthetic records, and no external API requests.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.JJSS_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JJSS_TEST_URL || 'http://127.0.0.1:5178';

// 앱 안의 확인창(ConfirmProvider, role="alertdialog")에 응답합니다. 버튼 순서: [취소, 확인].
async function answerConfirm(page, accept) {
    const dialog = page.getByRole('alertdialog');
    await dialog.waitFor();
    await dialog.getByRole('button').nth(accept ? 1 : 0).click();
    await dialog.waitFor({ state: 'hidden' });
}

// 현황 기록(JSON)에 "현재 상황 정리" 메모가 저장되어 있는지 확인합니다.
const hasSavedNote = content => Boolean(JSON.parse(content).situationNote?.text);

async function cancelNativeReload(page) {
    await page.evaluate(() => { window.uxReloadMarker = 'same-document'; });
    const prompt = page.waitForEvent('dialog', { predicate: dialog => dialog.type() === 'beforeunload', timeout: 5000 });
    const reload = page.reload({ timeout: 5000 }).catch(() => undefined);
    const dialog = await prompt;
    await dialog.dismiss();
    await reload;
    assert.equal(await page.evaluate(() => window.uxReloadMarker), 'same-document', 'cancelled reload must retain the original document');
}

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
        await context.route('**/src/services/ocr.ts', route => route.fulfill({
            contentType: 'application/javascript',
            body: "export * from '/src/services/ocr.ts?ux-original'; import { performOCR as originalOCR } from '/src/services/ocr.ts?ux-original'; export async function performOCR(file, options) { if (!window.uxMockRegistrationOcr) return originalOCR(file, options); options?.signal?.addEventListener('abort', () => { window.uxOcrAborts++; }, { once: true }); return new Promise((resolve, reject) => window.uxOcrRequests.push({ resolve, reject })); } export function parseSeekerFromOCR(text) { return { name: text }; }",
        }));
        await context.route('**/src/features/vocationalEvaluation/storage.ts', route => route.fulfill({
            contentType: 'application/javascript',
            body: "export * from '/src/features/vocationalEvaluation/storage.ts?ux-original'; import { saveEpisode as originalSaveEpisode, listEpisodesForSeeker as originalListEpisodes, listReportsForEpisode as originalListReports } from '/src/features/vocationalEvaluation/storage.ts?ux-original'; export async function saveEpisode(value) { if (window.uxFailEpisodeSave) throw new Error('합성 평가 저장 실패'); if (window.uxHoldCreate) { window.uxCreateCalls++; await new Promise(resolve => { window.uxReleaseCreate = resolve; }); } return originalSaveEpisode(value); } export async function listEpisodesForSeeker(key) { if (window.uxDelaySeeker === key) await new Promise(resolve => { window.uxResolveSeekerList = resolve; }); return originalListEpisodes(key); } export async function listReportsForEpisode(id) { const result = await originalListReports(id); window.uxLastReportsEpisode = id; return result; }",
        }));
        const page = await context.newPage();
        await context.route('**/src/config/localDB.ts', route => route.fulfill({
            contentType: 'application/javascript',
            body: "export * from '/src/config/localDB.ts?ux-training-original'; import { addDoc as originalAddDoc } from '/src/config/localDB.ts?ux-training-original'; export async function addDoc(store, value) { if (store === 'seekers' && window.uxHoldRegistration) { window.uxRegistrationCalls++; await new Promise(resolve => { window.uxReleaseRegistration = resolve; }); if (window.uxFailRegistrationWrite) throw new Error('합성 등록 저장 실패'); } if (store === 'trainingState') { if (window.uxFailTrainingWrite) throw new Error('합성 훈련 저장 실패'); if (window.uxHoldTrainingWrite) await new Promise(resolve => { window.uxReleaseTrainingWrite = resolve; }); } return originalAddDoc(store, value); }",
        }));
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

        // API 키를 엉뚱한 칸에 넣으면(OpenAI 칸에 Gemini 키) 입력 즉시 알려 주고, 한 번에 알맞은 칸으로 옮긴다.
        // 기본 AI(Gemini)의 키가 없으면 맨 위 경고가 보인다. 외부 요청은 이 테스트에서 모두 막혀 있다.
        const syntheticGoogleKey = `AIzaSy${'X'.repeat(33)}`;
        await page.getByTestId('selected-provider-key-warning').waitFor();
        await page.locator('#api-key-openai').fill(`  "${syntheticGoogleKey}"  `);
        const formatWarning = page.getByTestId('key-format-openai');
        await formatWarning.waitFor();
        assert.match(await formatWarning.innerText(), /Google\(Gemini·Vision\) 키 형식입니다\. OpenAI 칸에 넣으면 동작하지 않습니다/);
        assert.equal(await page.locator('#api-key-openai').getAttribute('aria-invalid'), 'true');
        // 저장하지 않은 잘못된 키로 연결 확인을 누르면 요청 없이 원인을 알려 준다.
        await page.getByRole('button', { name: 'OpenAI 연결 확인', exact: true }).click();
        await page.getByText('OpenAI 칸의 키를 확인하지 않았습니다.', { exact: false }).waitFor();
        await formatWarning.getByRole('button', { name: 'Google Gemini 칸으로 옮기기' }).click();
        await page.waitForFunction(key => document.querySelector('#api-key-gemini')?.value === key && document.querySelector('#api-key-openai')?.value === '', syntheticGoogleKey);
        await page.getByText('키를 Google Gemini 칸으로 옮겨 저장했습니다.', { exact: false }).first().waitFor();
        assert.equal(await page.getByTestId('key-format-openai').count(), 0, '옮긴 뒤 OpenAI 칸 경고가 사라진다');
        // 옮긴 키는 저장되고(새로고침 뒤에도 남음), 자동 연결 확인은 외부 요청이 막혀 네트워크 오류로 끝난다(키 실패로 기록하지 않음).
        await page.getByTestId('key-status-gemini').waitFor();
        await page.reload();
        await page.locator('#api-key-gemini').waitFor();
        assert.equal(await page.locator('#api-key-gemini').inputValue(), syntheticGoogleKey);
        assert.equal(await page.locator('#api-key-openai').inputValue(), '');
        assert.equal(await page.getByTestId('key-status-gemini').getAttribute('data-state'), 'unchecked', '네트워크 오류는 "실패"로 남기지 않는다');
        assert.equal(await page.getByTestId('selected-provider-key-warning').count(), 0, '기본 AI 키가 생기면 경고가 사라진다');
        // 테스트 뒤 정리: 다른 시나리오에 영향을 주지 않게 키를 지운다.
        await page.locator('#api-key-gemini').fill('');
        await page.locator('#api-key-gemini').press('Enter');
        await page.getByTestId('selected-provider-key-warning').waitFor();
        console.log('PASS API key typed into the wrong provider slot is flagged instantly and moved to the right slot');

        await page.evaluate(() => { location.hash = '/infomate'; });
        await page.getByRole('button', { name: '새 리소스 추가' }).click();
        await page.getByLabel('제목', { exact: true }).fill('검증용 합성 자료');
        await page.getByLabel('메모', { exact: true }).fill('한글 입력 유지');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'resource-memo');
        await cancelNativeReload(page);
        assert.equal(await page.getByLabel('메모', { exact: true }).inputValue(), '한글 입력 유지');
        await page.locator('nav a[href="#/manage"]').evaluate(link => link.click());
        await answerConfirm(page, false);
        assert.equal(new URL(page.url()).hash, '#/infomate');
        assert.equal(await page.getByLabel('메모', { exact: true }).inputValue(), '한글 입력 유지');
        await page.getByRole('button', { name: '자료 편집 창 닫기' }).click();
        await answerConfirm(page, false);
        assert.equal(await page.getByLabel('메모', { exact: true }).inputValue(), '한글 입력 유지');
        await page.keyboard.press('Escape');
        await answerConfirm(page, true);
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        console.log('PASS resource typing retains focus and dismissal protects draft');

        await page.evaluate(() => { location.hash = '/manage'; });
        await page.getByRole('button', { name: '이용자 등록', exact: true }).click();
        await page.getByLabel('구직자 이름').fill('검증용 합성 이용자');
        await cancelNativeReload(page);
        assert.equal(await page.getByLabel('구직자 이름').inputValue(), '검증용 합성 이용자');
        await page.keyboard.press('Escape');
        // 확인창 위에서 Esc를 눌러도 확인창만 닫히고, 아래 창의 확인이 다시 쌓이지 않아야 합니다.
        await page.getByRole('alertdialog').waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('alertdialog').count(), 0);
        assert.equal(await page.getByLabel('구직자 이름').inputValue(), '검증용 합성 이용자');
        await page.keyboard.press('Escape');
        await answerConfirm(page, true);
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.getByLabel('이용자 검색').fill('일치하지않는합성검색어');
        await page.getByRole('button', { name: '검색 초기화' }).click();
        assert.equal(await page.getByLabel('이용자 검색').inputValue(), '');
        console.log('PASS registration draft guard and empty-search reset');
        let unexpectedReloadPrompt = false;
        const onCleanReload = dialog => { unexpectedReloadPrompt = true; void dialog.dismiss(); };
        page.on('dialog', onCleanReload);
        await page.reload({ timeout: 10000 });
        page.off('dialog', onCleanReload);
        assert.equal(unexpectedReloadPrompt, false, 'closing the registration modal must remove its native reload guard');
        console.log('PASS native reload cancellation preserves resource/registration drafts; clean reload has no prompt');

        await page.getByRole('button', { name: '이용자 등록', exact: true }).click();
        await page.getByLabel('구직자 이름').fill('합성 중복등록 방지');
        await page.evaluate(() => { window.uxHoldRegistration = true; window.uxRegistrationCalls = 0; window.uxFailRegistrationWrite = true; });
        await page.getByRole('dialog').locator('form').evaluate(form => {
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
        await page.waitForFunction(() => typeof window.uxReleaseRegistration === 'function');
        assert.equal(await page.evaluate(() => window.uxRegistrationCalls), 1, 'same-tick submit must start only one write');
        assert.equal(await page.getByLabel('구직자 이름').isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: '엑셀 일괄 등록', exact: true }).isDisabled(), true);
        await page.getByRole('button', { name: '등록 창 닫기', exact: true }).click();
        assert.equal(await page.getByRole('dialog').count(), 1, 'pending write must retain the registration form');
        await page.evaluate(() => window.uxReleaseRegistration());
        await page.getByText('저장 중 오류가 발생했습니다. 입력한 내용은 유지됩니다.', { exact: true }).waitFor();
        assert.equal(await page.getByLabel('구직자 이름').inputValue(), '합성 중복등록 방지');
        await page.evaluate(() => { window.uxHoldRegistration = false; window.uxFailRegistrationWrite = false; });
        await page.getByRole('button', { name: '저장하기', exact: true }).click();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        assert.equal(await page.evaluate(async () => {
            const db = await import('/src/config/localDB.ts?ux-training-original');
            return (await db.getAll('seekers')).filter(item => item.name === '합성 중복등록 방지').length;
        }), 1);
        console.log('PASS repeated registration submits one write; pending fields/modes locked; failed draft retry saves one record');

        await page.getByRole('button', { name: '이용자 등록', exact: true }).click();
        await page.getByLabel('구직자 이름').fill('합성 이전 창 저장');
        await page.evaluate(() => { window.uxHoldRegistration = true; window.uxRegistrationCalls = 0; window.uxReleaseRegistration = null; });
        await page.getByRole('button', { name: '저장하기', exact: true }).click();
        await page.waitForFunction(() => typeof window.uxReleaseRegistration === 'function');
        // Force a parent-driven prop change on the same modal instance while its first save is pending.
        await page.getByRole('button', { name: '사업체 등록', exact: true }).evaluate(button => button.click());
        await page.getByRole('heading', { name: '새 구인공고(사업체) 등록', exact: true }).waitFor();
        await page.evaluate(() => { window.uxHoldRegistration = false; window.uxReleaseRegistration(); });
        await page.waitForFunction(async () => {
            const db = await import('/src/config/localDB.ts?ux-training-original');
            return (await db.getAll('seekers')).some(item => item.name === '합성 이전 창 저장');
        });
        await page.getByLabel(/^회사명/).fill('합성 새 창 유지');
        assert.equal(await page.getByRole('dialog').count(), 1, 'previous save success must not close the replacement form');
        await page.getByRole('button', { name: '등록 창 닫기', exact: true }).click();
        await answerConfirm(page, true);
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        console.log('PASS pending registration completes in DB without closing a replacement modal session');

        await page.evaluate(() => { window.uxMockRegistrationOcr = true; window.uxOcrRequests = []; window.uxOcrAborts = 0; });
        const selectOcrFile = async () => {
            await page.getByRole('button', { name: 'OCR 스캔 등록', exact: true }).click();
            await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({
                name: 'synthetic.png', mimeType: 'image/png',
                buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS0AAAAASUVORK5CYII=', 'base64'),
            });
        };
        await page.getByRole('button', { name: '이용자 등록', exact: true }).click();
        await selectOcrFile();
        await page.getByRole('button', { name: '선택한 파일 OCR 분석', exact: true }).evaluate(button => { button.click(); button.click(); });
        await page.waitForFunction(() => window.uxOcrRequests.length === 1);
        await page.locator('nav a[href="#/budget"]').evaluate(link => link.click());
        await answerConfirm(page, false);
        assert.equal(await page.getByText('글자 인식 중...', { exact: true }).count(), 1);
        await page.locator('nav a[href="#/budget"]').evaluate(link => link.click());
        await answerConfirm(page, true);
        await page.waitForFunction(() => location.hash === '#/budget' && window.uxOcrAborts === 1);
        await page.locator('nav a[href="#/manage"]').click();
        await page.getByRole('button', { name: '이용자 등록', exact: true }).click();
        await selectOcrFile();
        await page.getByRole('button', { name: '선택한 파일 OCR 분석', exact: true }).click();
        await page.waitForFunction(() => window.uxOcrRequests.length === 2);
        await page.evaluate(async () => {
            window.uxOcrRequests[0].resolve('합성 이전 OCR 결과');
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        assert.equal(await page.getByText('글자 인식 중...', { exact: true }).count(), 1, 'old result must not clear the current OCR busy state');
        assert.equal(await page.getByLabel('구직자 이름').count(), 0, 'old result must not open a filled form in the new session');
        await page.evaluate(() => window.uxOcrRequests[1].resolve('합성 현재 OCR 결과'));
        await page.getByLabel('구직자 이름').waitFor();
        assert.equal(await page.getByLabel('구직자 이름').inputValue(), '합성 현재 OCR 결과');
        await page.getByRole('button', { name: '등록 창 닫기', exact: true }).click();
        await answerConfirm(page, true);
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.evaluate(() => { window.uxMockRegistrationOcr = false; });
        console.log('PASS registration route guard, single OCR start, abort on leave and stale OCR isolation across reentry');

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

        await page.getByRole('button', { name: '면접일지 작성', exact: true }).click();
        await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            useDataStore.setState({ fetchCaseDocuments: () => new Promise(resolve => { window.uxResolveInterview = resolve; }) });
        });
        await page.getByRole('combobox').selectOption('ux-seeker');
        await page.getByText('저장된 면접일지를 불러오는 중입니다.').waitFor();
        assert.equal(await page.getByLabel('면접일', { exact: true }).isDisabled(), true);
        assert.equal(await page.getByPlaceholder('AI가 작성한 면접일지가 여기에 표시됩니다.').evaluate(el => el.readOnly), true);
        assert.equal(await page.getByRole('button', { name: '새 초안 생성', exact: true }).isDisabled(), true);
        await page.evaluate(() => {
            window.uxResolveInterview([{ id: 'ux-interview', tab: 'employment', type: 'interview_note', content: '합성 저장 면접일지' }]);
            delete window.uxResolveInterview;
        });
        await page.getByText('저장된 면접일지를 불러오는 중입니다.').waitFor({ state: 'hidden' });
        assert.equal(await page.getByPlaceholder('AI가 작성한 면접일지가 여기에 표시됩니다.').inputValue(), '합성 저장 면접일지');
        assert.equal(await page.getByLabel('면접일', { exact: true }).isEnabled(), true);
        console.log('PASS interview loading protects edits and generation until the selected document arrives');

        await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            window.__uxWorkflow = { docs: [] };
            useDataStore.setState({
                seekers: [{ id: 'ux-seeker', name: '합성 검증 이용자', seekerId: 'UX-1', disabilityType: '지적장애', status: '구직중' }],
                jobs: [{ id: 'ux-job', companyName: '합성 사업체', jobRole: '사무보조', location: '서울', workHours: '오전', salary: '협의', requirements: '조용한 환경', accommodations: '출근 시간 조정' }],
                fetchCaseDocuments: async () => window.__uxWorkflow.docs,
                addCaseDocument: async () => { throw new Error('검증용 현황 저장 실패'); },
                updateCaseDocument: async (id, content) => {
                    window.__uxWorkflow.docs = window.__uxWorkflow.docs.map(doc => doc.id === id ? { ...doc, content } : doc);
                },
            });
            location.hash = '/overview?seekerId=ux-seeker';
        });
        // 현황판은 읽기 전용: 입력 칸 없이 단계·카드·다음 할 일만 보이고, "일정 추가·편집"은 고용지원 화면으로 넘깁니다.
        await page.getByRole('heading', { name: '직업재활 현황판' }).waitFor();
        await page.getByText('평가 · 현재').waitFor();
        await page.getByText('가까운 미완료 일정이 없습니다.').waitFor();
        assert.equal(await page.getByRole('textbox', { name: '할 일' }).count(), 0, 'overview has no follow-up input form');
        await page.getByRole('button', { name: '일정 추가·편집' }).click();
        await page.getByRole('heading', { name: '고용지원', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: /후속 일정·목표·당사자 확인/ }).getAttribute('aria-expanded'), 'true', 'panel opens when requested from overview');
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
        await page.getByLabel('현재 수준').fill('혼자 3회 수행');
        await page.getByLabel('합성 출근 준비 관찰 근거').fill('한 단계 진행');
        await page.getByRole('button', { name: '변화 기록' }).click();
        await page.getByText('목표 변화 기록을 저장했습니다.').waitFor();
        await page.getByLabel('계획의 쉬운 말 요약').fill('내가 원하는 일을 준비해요.');
        await page.getByLabel('내가 원하는 목표').fill('사무 일을 해보고 싶어요.');
        await page.getByLabel('확인 상태').selectOption('agreed');
        await page.getByLabel('확인일').fill('2026-09-23');
        await page.getByLabel('확인 방법·상황').fill('대면 상담에서 직접 확인');
        await page.getByRole('button', { name: '참여 기록 저장' }).click();
        await page.getByText('당사자 참여 기록을 저장했습니다.').waitFor();
        await page.getByLabel('계획의 쉬운 말 요약').fill('내가 원하는 일을 천천히 준비해요.');
        assert.equal(await page.getByLabel('확인 상태').inputValue(), 'not_reviewed', 'edited plan must revoke stale agreement status');
        await page.getByRole('button', { name: '참여 기록 저장' }).click();
        await page.getByText('당사자 참여 기록을 저장했습니다.').waitFor();
        // 저장하지 않은 기록 입력이 있으면 탭을 옮기기 전에 확인합니다.
        await page.getByLabel('할 일').fill('저장 전 입력');
        await page.getByRole('button', { name: '적응지원', exact: true }).click();
        await answerConfirm(page, false);
        assert.equal(await page.getByRole('button', { name: '적응지원', exact: true }).getAttribute('aria-pressed'), 'false');
        assert.equal(await page.getByLabel('할 일').inputValue(), '저장 전 입력');
        await page.getByLabel('할 일').fill('');
        await page.getByRole('button', { name: '적응지원', exact: true }).click();
        assert.equal(await page.getByLabel('적응지원 이용자').inputValue(), 'ux-seeker', 'adaptation tab keeps the handed-over seeker');
        await page.getByLabel('점검일', { exact: true }).fill('2026-09-29');
        await page.getByLabel('근무 유지 상태').fill('근무 유지');
        await page.getByLabel('당사자 만족도·의견').fill('업무에 만족');
        await page.getByLabel('다음 점검일(선택)').fill('2026-09-30');
        await page.getByRole('button', { name: '적응지원 기록 저장' }).click();
        await page.getByText('취업 후 적응지원 기록을 저장했습니다.').waitFor();
        await page.getByRole('button', { name: '사례관리 문서 연속작성', exact: true }).click();
        await page.getByText('취업 후 적응지원 후속 점검').waitFor();
        await page.getByRole('button', { name: 'AI 정밀 매칭', exact: true }).click();
        assert.equal(await page.getByLabel('직무 비교 이용자').inputValue(), 'ux-seeker');
        await page.getByLabel('비교할 사업체·직무').selectOption('ux-job');
        await page.getByLabel('이동·지역 필요한 지원').fill('출근 경로 확인');
        await page.getByLabel('종합 조정 방향').fill('사업체와 조정 협의');
        await page.getByRole('button', { name: '비교 기록 저장' }).click();
        await page.getByText('직무 비교 기록을 저장했습니다.').waitFor();
        console.log('PASS WorkMate follow-up task, goal, participant, adaptation and job comparison forms save to the workflow record; stale agreement resets; tab switch guards drafts');

        await page.evaluate(() => { location.hash = '/manage'; });
        await page.getByRole('heading', { name: '이용자 및 사업체 관리' }).waitFor();
        await page.getByRole('button', { name: '현황판', exact: true }).click();
        await page.getByLabel('이용자 선택').selectOption('ux-seeker');
        await page.getByText('적응지원 · 현재').waitFor();
        await page.getByText('합성 후속 상담').waitFor();
        await page.getByText('한 단계 진행').waitFor();
        await page.getByRole('button', { name: /직무 비교.*합성 사업체 · 사무보조/ }).waitFor();
        await page.getByRole('button', { name: /적응지원 점검.*근무 유지/ }).waitFor();
        await page.getByLabel('합성 후속 상담 완료 표시').click();
        await page.getByText('완료로 표시했습니다.', { exact: false }).waitFor();
        await page.getByLabel('합성 후속 상담 완료 표시').waitFor({ state: 'detached' });
        await page.getByLabel('현재 상황 정리 메모').fill('저장 전 메모');
        await page.getByLabel('이용자 선택').selectOption('');
        await answerConfirm(page, false);
        assert.equal(await page.getByLabel('이용자 선택').inputValue(), 'ux-seeker');
        assert.equal(await page.getByLabel('현재 상황 정리 메모').inputValue(), '저장 전 메모');
        await page.getByRole('button', { name: 'AI로 요약 초안 만들기' }).click();
        await answerConfirm(page, true);
        await page.waitForFunction(() => document.getElementById('situation-note')?.value === '검증용 합성 상담 초안');
        assert.equal(hasSavedNote(await page.evaluate(() => window.__uxWorkflow.docs[0].content)), false, 'AI draft is never saved automatically');
        await page.getByRole('button', { name: '저장', exact: true }).click();
        await page.getByText('현재 상황 정리를 저장했습니다.').waitFor();
        await page.getByText('마지막 저장:', { exact: false }).waitFor();
        assert.equal(hasSavedNote(await page.evaluate(() => window.__uxWorkflow.docs[0].content)), true);
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
        await page.getByRole('button', { name: '목표 기록하기' }).click();
        await page.getByRole('heading', { name: '고용지원', exact: true }).waitFor();
        await page.getByText('한 단계 진행').waitFor();
        await page.getByText('완료한 일정 1건').waitFor();
        assert.equal(await page.getByLabel('확인 상태').inputValue(), 'not_reviewed');
        await page.getByRole('button', { name: 'AI 정밀 매칭', exact: true }).click();
        await page.locator('#job-comparison-history details summary').first().click();
        await page.getByText('조정 방향: 사업체와 조정 협의').waitFor();
        console.log('PASS read-only overview shows stage, timeline, goals and due tasks; completion toggle, note guard, AI draft without auto-save, and moved-form history reloads');

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
                const job = await db.addDoc('jobs', { companyName: '합성 직무분석 사업체', jobRole: '포장', organization: '검증용' });
                await db.addDoc('caseDocuments', { seekerId: job.id, seekerName: '합성 직무분석 사업체', jobId: job.id,
                    type: 'job_analysis', tab: 'employment', content: '합성 직무분석 내용', organization: '검증용' });
                await db.addDoc('caseDocuments', { seekerId: seeker.id, seekerName: '합성 저장 이용자', jobId: job.id,
                    type: 'matching_opinion', tab: 'employment', content: '합성 매칭 의견', organization: '검증용' });
                await useDataStore.getState().fetchData(true);
                location.hash = `/overview?seekerId=${seeker.id}`;
                return { seekerId: seeker.id, jobId: job.id };
            });
            await persistencePage.getByText('지원고용 · 현재').waitFor();
            await persistencePage.getByRole('button', { name: '고용지원 화면으로' }).click();
            await persistencePage.getByRole('heading', { name: '고용지원', exact: true }).waitFor();
            await persistencePage.getByRole('button', { name: 'AI 정밀 매칭', exact: true }).click();
            await persistencePage.getByLabel('비교할 사업체·직무').selectOption(savedId.jobId);
            await persistencePage.getByText('연결된 매칭 의견·직무분석 2건').waitFor();
            await persistencePage.getByText('저장된 직무분석').click();
            await persistencePage.getByText('합성 직무분석 내용').waitFor();
            await persistencePage.getByRole('button', { name: '사례관리 문서 연속작성', exact: true }).click();
            await persistencePage.getByRole('button', { name: /후속 일정·목표·당사자 확인/ }).click();
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
            await persistencePage.evaluate(() => { location.hash = '/overview'; });
            await persistencePage.getByRole('heading', { name: '전체 이용자 후속 일정' }).waitFor();
            await persistencePage.reload();
            // 전체 일정판: 요약 4칸과 기한 지난 일정. 이용자 이름은 저장 안 한 입력 확인을 거치는 버튼입니다.
            await persistencePage.getByLabel('전체 요약').getByText('등록 이용자').waitFor();
            await persistencePage.getByRole('button', { name: '합성 저장 이용자' }).first().click();
            await persistencePage.waitForFunction(id => location.hash === `#/overview?seekerId=${id}`, savedId.seekerId);
            await persistencePage.getByText('합성 암호화 일정').first().waitFor();
            console.log('PASS actual IndexedDB workflow persistence, encrypted content at rest, and due-board summary navigation');
        } finally { await persistenceContext.close(); }

        // 지원고용 관리: 합성 회차(2026-07-27~2026-08-18, 사전 1일)의 훈련일 자동 생성·수당 계산·출력 버튼·저장
        await page.getByRole('heading', { name: '고용지원', exact: true }).waitFor();
        await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            localStorage.setItem('jjss:budget-projects', JSON.stringify([{ id: 'ux-se-budget', name: '합성 지원고용 예산', totalBudget: 5000000, period: '2026', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]));
            useDataStore.setState(state => ({
                seekers: [...state.seekers, { id: 'ux-se-seeker', name: '합성 지원고용 이용자', seekerId: 'UX-SE' }],
                jobs: [...state.jobs, { id: 'ux-se-job', companyName: '합성 지원고용 사업체', jobRole: '진열' }],
            }));
        });
        await page.getByRole('button', { name: '지원고용 관리', exact: true }).click();
        await page.getByRole('heading', { name: '지원고용 회차' }).waitFor();
        await page.getByRole('button', { name: '새 회차', exact: true }).click();
        await page.locator('#se-seeker').selectOption('ux-se-seeker');
        await page.locator('#se-job').selectOption('ux-se-job');
        assert.equal(await page.locator('#se-employer').inputValue(), '합성 지원고용 사업체');
        await page.locator('#se-start').fill('2026-07-27');
        await page.locator('#se-end').fill('2026-08-18');
        assert.equal(await page.locator('#se-pre-days').inputValue(), '1');
        await page.getByTestId('se-training-days').getByText('훈련일 16일 (사전 1일 · 현장 15일)').waitFor();
        await page.getByText('2026-08-17 대체공휴일(광복절)').waitFor();
        assert.equal((await page.getByTestId('se-payment-total').innerText()).trim(), '1,250,100원', 'payment card shows the synthetic total');
        await page.getByRole('button', { name: '2. 훈련일지', exact: true }).click();
        assert.equal(await page.getByLabel('2026-07-27 출결').count(), 1);
        await page.getByText('하루 기록 도우미', { exact: false }).click();
        const recording = page.locator('details').filter({ has: page.locator('summary', { hasText: '하루 기록 도우미' }) });
        await recording.getByLabel('기록 날짜').selectOption('2026-07-27');
        await recording.getByLabel('수행과제', { exact: true }).fill('합성 분류작업');
        await recording.getByLabel('수행정도 · 측정시간', { exact: true }).fill('30분 10개');
        await recording.getByLabel('평가 및 지도사항', { exact: true }).fill('합성 관찰 기록');
        assert.equal(await recording.getByLabel('기록 날짜').inputValue(), '2026-07-27');
        assert.equal(await page.getByLabel('2026-07-27 평가 및 지도사항', { exact: true }).inputValue(), '합성 관찰 기록');
        await recording.getByRole('button', { name: '기존 기록 뒤에 작성 틀 추가' }).click();
        const recordedNote = await recording.getByLabel('평가 및 지도사항', { exact: true }).inputValue();
        assert.ok(recordedNote.startsWith('합성 관찰 기록\n\n[관찰'));
        await recording.getByRole('button', { name: '기존 기록 뒤에 작성 틀 추가' }).click();
        assert.equal(await recording.getByLabel('평가 및 지도사항', { exact: true }).inputValue(), recordedNote);
        await recording.getByLabel('평가 및 지도사항', { exact: true }).fill('가'.repeat(1000));
        await recording.getByRole('button', { name: '기존 기록 뒤에 작성 틀 추가' }).click();
        assert.equal((await recording.getByLabel('평가 및 지도사항', { exact: true }).inputValue()).length, 1000);
        assert.ok((await recording.getByRole('status').innerText()).includes('초과'));
        await recording.getByLabel('평가 및 지도사항', { exact: true }).fill(recordedNote);
        await page.getByLabel('2026-07-28 수행과제', { exact: true }).fill('유지할 과제');
        await page.getByRole('button', { name: '2026-07-28 행에 이전 행 내용 복사' }).click();
        await answerConfirm(page, false);
        assert.equal(await page.getByLabel('2026-07-28 수행과제', { exact: true }).inputValue(), '유지할 과제');
        console.log('PASS daily recording helper: shared form, stable date, preserved notes, duplicate/overflow protection and copy cancellation');
        await page.getByRole('button', { name: '6. 출력', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: '결과보고 DOCX 저장', exact: true }).count(), 1, 'DOCX save button exists');
        await page.getByText('출력할 수 없습니다', { exact: false }).waitFor();
        await page.getByRole('button', { name: '회차 저장', exact: true }).click();
        await page.getByText('회차를 저장했습니다.').waitFor();
        await page.getByText('저장하지 않은 변경 있음').waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: '5. 결과 확정·예산', exact: true }).click();
        await page.locator('#se-budget-project').selectOption('ux-se-budget');
        await page.locator('#se-status').selectOption('수료');
        const expenseCountBefore = await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            window.uxOriginalFetchExpenses = useDataStore.getState().fetchExpenses;
            const count = useDataStore.getState().expenses.length;
            useDataStore.setState({ fetchExpenses: async () => { throw new Error('synthetic expense read failure'); } });
            return count;
        });
        await page.getByRole('button', { name: '회차 저장', exact: true }).click();
        await page.getByText('기존 지출을 확인하지 못해 초안을 만들지 않았습니다.', { exact: false }).waitFor();
        assert.equal(await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            const count = useDataStore.getState().expenses.length;
            useDataStore.setState({ fetchExpenses: window.uxOriginalFetchExpenses });
            delete window.uxOriginalFetchExpenses;
            return count;
        }), expenseCountBefore);
        await page.getByRole('button', { name: '지출 초안 만들기', exact: true }).click();
        await answerConfirm(page, true);
        await page.getByText('연결된 지출 3건', { exact: true }).waitFor();
        assert.equal(await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            return useDataStore.getState().expenses.filter(item => item.projectId === 'ux-se-budget').length;
        }), 3);
        console.log('PASS supported employment expense read failure creates nothing; successful retry links three drafts');
        await page.getByRole('button', { name: '목록으로', exact: true }).click();
        await page.getByRole('cell', { name: '1,250,100', exact: true }).waitFor();
        console.log('PASS supported employment round: training days skip the substitute holiday, payment card 1,250,100원, DOCX button, save and list');

        // 직업평가 워크벤치: 회차 생성 → 우세손 판정 → 손기능 1시행 확정 → 2차 미실시 → 다차원 분모(판 /1)
        await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            useDataStore.setState(state => ({
                seekers: [...state.seekers, { id: 'ux-ve-seeker', name: '합성 평가 이용자', seekerId: 'UX-VE' }],
            }));
        });
        await page.evaluate(() => { location.hash = '/evaluation'; });
        await page.getByRole('button', { name: '평가 진행', exact: true }).click();
        // 이용자 검색: 이름·ID로 좁히고, 한 명으로 좁혀지면 자동 선택된다.
        await page.locator('#ve-seeker-search').fill('UX-VE');
        await page.waitForFunction(() => document.getElementById('ve-seeker')?.value === 'ux-ve-seeker');
        await page.evaluate(async () => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            const { createEpisode } = await import('/src/features/vocationalEvaluation/index.ts');
            const { saveEpisode } = await import('/src/features/vocationalEvaluation/storage.ts');
            const episode = await saveEpisode({ ...createEpisode({ seekerId: 'ux-ve-seeker', seekerName: '합성 평가 이용자' }), title: '지연 응답 A 회차' });
            window.uxDelayedEpisodeId = episode.id;
            useDataStore.setState(state => ({ seekers: [...state.seekers, { id: 'ux-ve-second', name: '합성 B 이용자' }] }));
            window.uxDelaySeeker = 'ux-ve-seeker';
        });
        await page.locator('#ve-seeker-search').fill('');
        await page.locator('#ve-seeker').selectOption('');
        await page.locator('#ve-seeker').selectOption('ux-ve-seeker');
        await page.waitForFunction(() => typeof window.uxResolveSeekerList === 'function');
        await page.locator('#ve-seeker').selectOption('ux-ve-second');
        await page.getByText('불러오는 중…', { exact: false }).waitFor({ state: 'hidden' });
        await page.evaluate(() => { window.uxLastReportsEpisode = ''; window.uxDelaySeeker = ''; window.uxResolveSeekerList(); delete window.uxResolveSeekerList; });
        await page.waitForFunction(() => window.uxLastReportsEpisode === window.uxDelayedEpisodeId);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.getByText('지연 응답 A 회차', { exact: true }).count(), 0, 'late A query must not display A episodes under B');
        assert.equal(await page.locator('#ve-seeker').inputValue(), 'ux-ve-second');
        await page.locator('#ve-seeker').selectOption('ux-ve-seeker');
        await page.getByText('지연 응답 A 회차', { exact: true }).waitFor();
        console.log('PASS delayed evaluation episode query cannot replace the new seeker list');
        await page.evaluate(() => { window.uxHoldCreate = true; window.uxCreateCalls = 0; });
        await page.getByRole('button', { name: '새 평가 회차', exact: true }).evaluate(button => { button.click(); button.click(); });
        await page.waitForFunction(() => typeof window.uxReleaseCreate === 'function');
        assert.equal(await page.evaluate(() => window.uxCreateCalls), 1);
        await page.evaluate(() => { window.uxHoldCreate = false; window.uxReleaseCreate(); delete window.uxReleaseCreate; });
        await page.getByRole('heading', { name: '우세손 판정' }).waitFor();
        console.log('PASS repeated evaluation creation submits one storage write');
        await page.evaluate(() => { window.uxFailEpisodeSave = true; });
        await page.locator('#ve-purpose').fill('실패 시 유지할 평가목적');
        await page.getByText('저장되지 않은 변경이 있습니다.', { exact: false }).waitFor();
        await page.getByRole('button', { name: '회차 목록으로', exact: true }).click();
        await page.getByText('저장되지 않은 변경이 있습니다.', { exact: false }).waitFor();
        assert.equal(await page.locator('#ve-purpose').inputValue(), '실패 시 유지할 평가목적');
        assert.equal(await page.getByRole('button', { name: '회차 목록으로', exact: true }).count(), 1);
        await page.getByRole('button', { name: '결과분석기', exact: true }).click();
        await answerConfirm(page, false);
        assert.equal(await page.locator('#ve-purpose').inputValue(), '실패 시 유지할 평가목적');
        await page.locator('nav[aria-label="주요 메뉴"] a[href="#/budget"]').click();
        await answerConfirm(page, false);
        assert.equal(new URL(page.url()).hash, '#/evaluation');
        assert.equal(await page.locator('#ve-purpose').inputValue(), '실패 시 유지할 평가목적');
        await page.evaluate(() => { window.uxFailEpisodeSave = false; });
        await page.getByRole('button', { name: '저장 다시 시도', exact: true }).click();
        await page.getByText('저장되지 않은 변경이 있습니다.', { exact: false }).waitFor({ state: 'hidden' });
        assert.equal(await page.locator('#ve-purpose').inputValue(), '실패 시 유지할 평가목적');
        console.log('PASS evaluation failed flush retains the editor/draft; explicit retry succeeds');
        for (const question of ['글씨를 쓸 때 어느 손을 사용합니까?', '공을 던질 때 어느 손을 사용합니까?', '젓가락질을 할 때 어느 손을 사용합니까?']) {
            await page.getByRole('group', { name: question }).getByRole('button', { name: '오른손' }).click();
        }
        await page.locator('.badge', { hasText: '오른손' }).first().waitFor();
        // ① 기본정보에 한 번만 적으면 보고서 머리 정보·평가 상세로 자동으로 들어간다.
        await page.locator('#ve-purpose').fill('검증용 평가목적');
        await page.locator('#ve-disability-history').fill('지적장애 정도가 심한 장애로 2019년 등록되었다.');
        await page.getByRole('button', { name: '② 검사 실시', exact: true }).click();
        await page.getByRole('button', { name: /KEAD 손기능 작업표본검사/ }).click();
        await page.getByText('실시요강 기준 조건당 30초').first().waitFor();
        await page.getByRole('button', { name: /검사 시작/ }).click();
        // 회귀: 측정 중 렌더마다 타이머 기준점이 지워져 30초에서 멈추던 문제. 실제로 줄어들고 저장이 끝나야 한다.
        await page.waitForFunction(() => /00:2[0-8]/.test(document.querySelector('main')?.innerText || ''), null, { timeout: 5000 });
        await page.getByText('저장됨', { exact: true }).first().waitFor({ timeout: 5000 });
        assert.equal(await page.getByRole('button', { name: '제한시간 종료 알림음 끄기' }).count(), 1, 'time-up chime toggle is available');
        // 오류 기록 단축키: 조합키 하나(Ctrl)+F키가 기본이고, 맨 F키도 인정. Alt 조합은 무시(Alt+F4=창 닫기).
        await page.getByText('Ctrl+F1~F12', { exact: false }).first().waitFor(); // 화면에 조합키 안내 표시
        await page.getByRole('button', { name: /핀 떨어뜨림/ }).getByText('Ctrl+F1', { exact: true }).waitFor(); // 버튼마다 키 배지
        await page.keyboard.press('Control+F1');
        await page.getByRole('button', { name: /핀 떨어뜨림/ }).getByText('1', { exact: true }).waitFor();
        await page.keyboard.press('F9');
        await page.getByRole('button', { name: /주의분산/ }).getByText('1', { exact: true }).waitFor();
        await page.keyboard.press('Alt+F5');
        assert.equal(await page.getByRole('button', { name: /핀 방향 오류/ }).getByText('1', { exact: true }).count(), 0, 'Alt combo must not record');
        await page.getByRole('button', { name: /측정 종료/ }).click();
        await page.getByRole('spinbutton', { name: '수행량' }).fill('12');
        await page.getByRole('button', { name: /이 시행 확정/ }).click();
        await page.getByText('평균 12').first().waitFor();
        await page.getByRole('button', { name: '미실시로 두기' }).click();
        await page.locator('#ve-skip-reason').fill('검증용 미실시 사유');
        await page.getByRole('button', { name: '미실시로 저장', exact: true }).click();
        await page.getByText('(1회 실시)').first().waitFor();
        assert.equal(await page.getByRole('button', { name: '검사 기록 확정', exact: true }).isDisabled(), true, 'unfinished trials block confirmation');
        await page.getByRole('button', { name: '목록으로', exact: true }).click();
        await page.getByRole('button', { name: /KEAD 다차원 양손협응 작업표본검사/ }).click();
        await page.getByText('실시요강 기준 제한시간 1분 30초, 1회 실시').first().waitFor();
        await page.getByRole('button', { name: /측정 시작/ }).click();
        await page.getByRole('button', { name: /측정 종료/ }).click();
        await page.getByText('총합 0 / 25').first().waitFor();
        const plate = page.getByRole('spinbutton', { name: '판' });
        await plate.fill('5');
        assert.equal(await plate.inputValue(), '1', 'plate is capped at the 실시요강 denominator of 1');
        await page.getByText('총합 1 / 25').first().waitFor();
        await page.getByRole('button', { name: '목록으로', exact: true }).click();
        await page.getByRole('button', { name: '④ 원자료 요약', exact: true }).click();
        await page.getByText('소형핀 · 우세손: 12 / 미실시 / 미실시 → 평균 12 (1회 실시 평균)').waitFor();
        // ⑤ 분석지 직접 입력: AI 없이 문장을 추가하면 ⑦ 보고서 초안 재료가 된다.
        await page.getByRole('button', { name: '⑤ 결과지·분석지', exact: true }).click();
        await page.getByRole('heading', { name: '그 밖의 검사 분석지' }).waitFor();
        await page.getByRole('button', { name: /직접 입력/ }).click();
        await page.getByLabel('보고서 영역').first().selectOption('psychological');
        await page.getByLabel('분석지 문장').first().fill('수용어휘력 검사 결과 등가연령 6세 0개월~6세 5개월로 표기되어 있다.');
        // ⑥ 결과 해석: 기존 결과분석기 방식의 "결과 분석" 카드가 자료를 자동으로 연결한다.
        await page.getByRole('button', { name: '⑥ 해석', exact: true }).click();
        await page.getByRole('heading', { name: '결과 분석', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: '결과 분석하기', exact: true }).count(), 1, 'one-click analysis CTA exists');
        await page.getByLabel('자동으로 연결된 자료').getByText('양손협응', { exact: false }).waitFor(); // 자동 연결 자료 표시
        // 기존 claim/근거 UI는 기본으로 접혀 있어야 한다(주 흐름은 위의 결과 분석).
        assert.equal(await page.getByRole('heading', { name: '근거 확인' }).count(), 0, 'legacy evidence UI is collapsed by default');
        const legacyToggle = page.getByRole('button', { name: /세부 근거/ });
        assert.equal(await legacyToggle.getAttribute('aria-expanded'), 'false');
        await legacyToggle.click();
        await page.getByRole('heading', { name: '근거 확인' }).waitFor(); // 펼치면 그대로 쓸 수 있다
        await legacyToggle.click();
        await page.getByRole('button', { name: '⑦ 보고서', exact: true }).click();
        // 재료 요약: 분석지 1건이 집계된다.
        await page.getByText('⑤ 분석지', { exact: true }).waitFor();
        await page.getByText('1건 · 문장 1개', { exact: false }).waitFor();
        // ⑥ 결과 분석 재료 상태가 표시된다(없으면 ⑦ 자동 작성이 내부 실행한다는 안내).
        await page.getByText('없음 — 자동 작성 시 내부 실행', { exact: false }).waitFor();
        await page.getByRole('button', { name: '보고서 초안 만들기', exact: true }).click();
        await page.getByRole('heading', { name: '종합소견 및 직업재활방향' }).waitFor();
        // 머리 정보·평가목적은 ①에서 자동으로 들어온다(보고서에서 다시 입력하지 않는다).
        await page.getByRole('heading', { name: '머리 정보 · 평가목적' }).waitFor();
        await page.getByText('검증용 평가목적', { exact: false }).first().waitFor();
        await page.getByText('합성 평가 이용자', { exact: false }).first().waitFor();
        // ①의 장애·진단이력이 평가 상세에 자동 문단으로 들어온다.
        await page.getByText('2019년 등록되었다', { exact: false }).first().waitFor();
        // 평가 도구 표는 실시한 KEAD 검사로 자동으로 채워진다.
        assert.equal(
            await page.getByLabel('직업진단(손기능) 평가도구').inputValue(),
            'KEAD 손기능 작업표본검사',
            'tool table auto-filled from sessions',
        );
        // 분석지 문장이 심리진단 섹션에 자동 배치된다.
        await page.getByText('수용어휘력 검사 결과 등가연령', { exact: false }).first().waitFor();
        // AI 종합소견: 버튼이 있고, 키가 없으면 그 사실을 안내한다(테스트 환경에는 키가 없다).
        assert.equal(await page.getByRole('button', { name: 'AI 종합소견 초안 쓰기', exact: true }).count(), 1, 'AI opinion button exists');
        await page.getByText('Gemini API 키를 등록하면', { exact: false }).first().waitFor();
        // 평가하지 않은 영역은 숨겨져 있고, 필요할 때만 추가한다.
        await page.getByText('평가한 영역 추가', { exact: false }).waitFor();
        await page.getByRole('button', { name: /생활적응능력/ }).click();
        await page.getByRole('heading', { name: '생활적응능력' }).waitFor();
        await page.getByText('KEAD 손기능 작업표본검사을(를) 실시했다.', { exact: false }).first().waitFor();
        await page.getByText('총합', { exact: false }).first().waitFor();
        assert.equal(await page.getByRole('button', { name: 'DOCX', exact: true }).count(), 1, 'DOCX export button exists');
        await page.getByLabel('종합소견', { exact: true }).fill('검증용 종합소견');
        await page.getByRole('button', { name: '확정', exact: true }).click();
        await answerConfirm(page, true);
        await page.getByText('확정된 보고서입니다', { exact: false }).waitFor();
        assert.equal(await page.getByRole('button', { name: '새 버전', exact: true }).count(), 1, 'a confirmed report can only be changed as a new version');
        assert.equal(await page.locator('#ve-summary-overallOpinion').isDisabled(), true, 'confirmed report fields are locked');
        console.log('PASS vocational evaluation workbench: dominant hand, auto header/tools, AI opinion entry, conditional detail sections, confirm lock');

        await page.locator('nav a[href="#/training"]').click();
        await page.getByLabel('훈련실명', { exact: true }).waitFor();
        await page.evaluate(() => { window.uxHoldTrainingWrite = true; });
        await page.getByLabel('훈련실명', { exact: true }).fill('합성 저장 대기 훈련실');
        await page.waitForFunction(() => typeof window.uxReleaseTrainingWrite === 'function');
        await page.locator('nav a[href="#/budget"]').click();
        await answerConfirm(page, false);
        assert.equal(await page.getByLabel('훈련실명', { exact: true }).inputValue(), '합성 저장 대기 훈련실');
        await page.locator('nav a[href="#/budget"]').click();
        await answerConfirm(page, true);
        await page.waitForFunction(() => location.hash === '#/budget');
        await page.locator('nav a[href="#/training"]').click();
        await page.getByText('저장된 직업훈련 자료를 불러오는 중입니다.', { exact: true }).waitFor();
        assert.equal(await page.getByLabel('훈련실명', { exact: true }).count(), 0, 'reentry must not expose the previous persisted snapshot');
        await page.evaluate(() => { window.uxHoldTrainingWrite = false; window.uxReleaseTrainingWrite(); });
        await page.getByLabel('훈련실명', { exact: true }).waitFor();
        assert.equal(await page.getByLabel('훈련실명', { exact: true }).inputValue(), '합성 저장 대기 훈련실');
        await page.evaluate(() => { window.uxFailTrainingWrite = true; });
        await page.getByLabel('담당교사', { exact: true }).fill('합성 저장 실패 보존');
        await page.getByText('직업훈련 자료를 저장하지 못했습니다.', { exact: false }).first().waitFor();
        await page.locator('nav a[href="#/budget"]').click();
        await answerConfirm(page, false);
        assert.equal(await page.getByLabel('담당교사', { exact: true }).inputValue(), '합성 저장 실패 보존');
        await page.evaluate(() => { window.uxFailTrainingWrite = false; });
        await page.getByRole('button', { name: '훈련자료 지금 저장', exact: true }).click();
        await page.getByText('직업훈련 자료를 저장했습니다.', { exact: true }).waitFor();
        console.log('PASS training pending-write navigation guard, reentry flush ordering, and failed-save draft retry');

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
        // 공유 저장소: 데스크톱 기능(window.jjssDrive)이 없으면 섹션이 없고, 있으면 마법사로 켤 수 있다(가짜 드라이브, 네트워크 없음).
        await page.evaluate(() => { location.hash = '/settings'; });
        await page.locator('#ai-model').waitFor();
        assert.equal(await page.locator('#shared-drive').count(), 0, '브라우저 실행에는 공유 저장소 섹션이 없음');
        const driveContext = await browser.newContext({ viewport: { width: 1100, height: 850 } });
        try {
            await driveContext.addInitScript(() => {
                localStorage.setItem('jjss:api-key-onboarding-v1', 'later');
                const files = new Map();
                const log = [];
                let nextId = 1;
                const status = { configured: false, domain: '', clientIdHint: '', accountEmail: '', signedIn: false, driveId: '', driveName: '', enabled: false, hasOrgKey: false, secureStorage: true };
                let orgKey = null;
                const ok = value => Promise.resolve({ ok: true, value });
                const snap = file => ({ id: file.id, name: file.name, appProperties: { ...file.appProperties } });
                const merge = (target, patch) => { for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete target[k]; else target[k] = String(v); } };
                window.uxDriveFiles = files;
                window.uxDriveCalls = [];
                const track = (name, fn) => (...args) => { window.uxDriveCalls.push(name); return fn(...args); };
                window.jjssDrive = {
                    getStatus: track('getStatus', () => ok({ ...status })),
                    configure: track('configure', input => { Object.assign(status, { configured: true, domain: input.domain.toLowerCase(), clientIdHint: 'test…' }); return ok({ ...status }); }),
                    signIn: track('signIn', () => { Object.assign(status, { signedIn: true, accountEmail: `kim@${status.domain}` }); return ok({ ...status }); }),
                    signOut: track('signOut', () => { Object.assign(status, { signedIn: false, enabled: false, driveId: '', hasOrgKey: false }); orgKey = null; return ok({ ...status }); }),
                    listSharedDrives: track('listSharedDrives', () => ok([{ id: 'drive-test-0001', name: '합성 사례관리 드라이브' }])),
                    selectDrive: track('selectDrive', id => { Object.assign(status, { driveId: id, driveName: '합성 사례관리 드라이브' }); return ok({ ...status }); }),
                    securityFacts: track('securityFacts', () => ok({ isSharedDrive: true, driveName: '합성 사례관리 드라이브', accountEmail: status.accountEmail, accountIsMember: true, restrictions: { domainUsersOnly: true, driveMembersOnly: true, copyRequiresWriterPermission: true }, permissions: [{ type: 'group', emailAddress: `team@${status.domain}` }], permissionsVisible: true })),
                    listRecords: track('listRecords', () => ok({ files: [...files.values()].filter(f => f.appProperties.jjssKind === 'record').map(snap) })),
                    getStartPageToken: track('getStartPageToken', () => ok(String(log.length + 1))),
                    listChanges: track('listChanges', token => ok({ changes: log.slice(Number(token) - 1).map(id => ({ fileId: id, removed: false, file: { ...snap(files.get(id)), trashed: false } })), newStartPageToken: String(log.length + 1) })),
                    getFile: track('getFile', id => ok(files.has(id) ? snap(files.get(id)) : null)),
                    download: track('download', id => ok(new Uint8Array(files.get(id).content))),
                    upload: track('upload', input => {
                        if (input.folder !== 'meta') window.uxDriveCalls.push('upload-record');
                        let file = input.fileId ? files.get(input.fileId) : null;
                        if (!file) { file = { id: `file${nextId++}`, name: input.name, folder: input.folder, appProperties: {}, content: new Uint8Array() }; files.set(file.id, file); }
                        merge(file.appProperties, input.appProperties);
                        file.content = new Uint8Array(input.content);
                        log.push(file.id);
                        return ok(snap(file));
                    }),
                    setProperties: track('setProperties', (id, props) => { merge(files.get(id).appProperties, props); log.push(id); return ok(undefined); }),
                    findMeta: track('findMeta', name => { const file = [...files.values()].find(f => f.folder === 'meta' && f.name === name); return ok(file ? snap(file) : null); }),
                    setOrgKey: track('setOrgKey', value => { orgKey = value; status.hasOrgKey = true; return ok({ ...status }); }),
                    getOrgKey: track('getOrgKey', () => ok(orgKey)),
                    setPendingOrgKey: track('setPendingOrgKey', value => { window.uxPendingOrgKey = value; return ok({ ...status }); }),
                    getPendingOrgKey: track('getPendingOrgKey', () => ok(window.uxPendingOrgKey ?? null)),
                    setEnabled: track('setEnabled', enabled => { status.enabled = Boolean(enabled); return ok({ ...status }); }),
                    backupLocalData: track('backupLocalData', () => ok({ copied: true })),
                };
            });
            await driveContext.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
            const drivePage = await driveContext.newPage();
            drivePage.on('pageerror', error => errors.push(error.message));
            await drivePage.goto(base);
            await drivePage.locator('h1').waitFor();
            await drivePage.evaluate(async () => {
                const db = await import('/src/config/localDB.ts');
                await db.addDoc('seekers', { name: '합성공유이용자', seekerId: 'UX-SHARED', phone: '010-0000-1111', organization: '검증용' });
                location.hash = '/settings';
            });
            await drivePage.locator('#shared-drive').waitFor();
            const callsBeforeSetup = await drivePage.evaluate(() => window.uxDriveCalls.filter(name => name !== 'getStatus').length);
            assert.equal(callsBeforeSetup, 0, '꺼진 상태: 상태 확인 외 요청 0건');
            assert.equal(await drivePage.getByTestId('shared-drive-chip').count(), 0, '꺼져 있으면 상태 표시 없음');
            const driveSection = drivePage.locator('#shared-drive');
            await driveSection.getByTestId('shared-drive-start-setup').click();
            await driveSection.getByRole('button', { name: '설정 시작' }).waitFor();
            assert.equal(await driveSection.getByRole('button', { name: '설정 시작' }).isDisabled(), true, '동의 전에는 시작 불가');
            await driveSection.getByLabel(/개인정보 처리방침에 따라/).check();
            await driveSection.getByRole('button', { name: '설정 시작' }).click();
            await driveSection.getByLabel('기관 도메인').fill('example-org.org');
            await driveSection.getByLabel('OAuth 클라이언트 ID').fill('1234-abc.apps.googleusercontent.com');
            await driveSection.getByLabel('OAuth 클라이언트 보안 비밀').fill('synthetic-secret');
            await driveSection.getByRole('button', { name: '저장' }).click();
            await driveSection.getByRole('button', { name: '구글 로그인' }).click();
            await driveSection.getByRole('button', { name: '공유 드라이브 목록 불러오기' }).click();
            await driveSection.getByRole('button', { name: '합성 사례관리 드라이브' }).click();
            await driveSection.getByRole('button', { name: '보안 점검' }).click();
            await driveSection.getByTestId('shared-drive-security').waitFor();
            assert.equal(await driveSection.getByTestId('shared-drive-security').getAttribute('data-blocked'), 'false');
            await driveSection.getByRole('button', { name: '다음' }).click();
            await driveSection.getByRole('button', { name: '새 기관 키 만들기' }).click();
            const code = (await driveSection.getByTestId('org-key-code').textContent()).trim();
            assert.match(code, /^([0-9A-Z]{4}-){6}[0-9A-Z]{4}$/);
            assert.equal(await driveSection.getByRole('button', { name: '이 키로 시작' }).isDisabled(), true, '코드 확인 전에는 진행 불가');
            await driveSection.getByLabel(/마지막 4자/).fill(code.slice(-4).toLowerCase());
            await driveSection.getByRole('button', { name: '이 키로 시작' }).click();
            await driveSection.getByRole('button', { name: /사본을 만든 뒤 올리기 시작/ }).click();
            await driveSection.getByTestId('initial-sync-result').getByText(/확인 완료/).waitFor();
            const driveDump = await drivePage.evaluate(() => [...window.uxDriveFiles.values()].map(file => ({ props: JSON.stringify(file.appProperties), name: file.name, text: new TextDecoder('utf-8', { fatal: false }).decode(file.content) })));
            assert.ok(driveDump.some(file => file.props.includes('"jjssKind":"record"')), '기록이 올라감');
            for (const file of driveDump) {
                for (const secretText of ['합성공유이용자', '010-0000-1111', 'UX-SHARED']) {
                    assert.equal(file.props.includes(secretText) || file.name.includes(secretText) || file.text.includes(secretText), false, `드라이브에 평문 없음: ${secretText}`);
                }
            }
            assert.ok(await drivePage.evaluate(() => window.uxDriveCalls.indexOf('backupLocalData') >= 0 && window.uxDriveCalls.indexOf('backupLocalData') < window.uxDriveCalls.indexOf('upload-record')), '기록을 올리기 전에 이 PC 사본');
            await driveSection.getByRole('button', { name: '공유 저장소 켜기' }).click();
            await driveSection.getByTestId('shared-drive-phase').waitFor();
            await drivePage.waitForFunction(() => document.querySelector('[data-testid="shared-drive-phase"]')?.getAttribute('data-phase') === 'idle');
            await drivePage.getByTestId('shared-drive-chip').waitFor();
            // 켠 직후 첫 동기화("동기화 중")가 끝나면 "최신"이 된다.
            await drivePage.waitForFunction(() => /공유 저장소 최신/.test(document.querySelector('[data-testid="shared-drive-chip"]')?.textContent || ''), undefined, { timeout: 15000 });
            // 켠 뒤 화면에서 저장하면 몇 초 뒤 자동으로 올라간다.
            const before = await drivePage.evaluate(() => window.uxDriveCalls.filter(name => name === 'upload').length);
            await drivePage.evaluate(async () => {
                const db = await import('/src/config/localDB.ts');
                await db.addDoc('seekers', { name: '합성공유이용자2', seekerId: 'UX-SHARED-2', organization: '검증용' });
            });
            await drivePage.waitForFunction(count => window.uxDriveCalls.filter(name => name === 'upload').length > count, before, { timeout: 15000 });
            // 다른 PC가 같은 이용자를 편집 중이라고 표시해 두면, 이용자 수정 창(직업평가·지원고용 회차 밖의 편집기)에도 안내가 뜨고 편집 중으로 등록된다.
            const sharedSeekerFileId = await drivePage.evaluate(async () => {
                const file = [...window.uxDriveFiles.values()].find(item => item.appProperties.jjssKind === 'record' && item.appProperties.store === 'seekers' && item.name.includes('seekers-'));
                await window.jjssDrive.setProperties(file.id, { editingBy: 'park@example-org.org', editingSince: new Date().toISOString() });
                return file.id;
            });
            await driveSection.getByRole('button', { name: '지금 동기화' }).click();
            await drivePage.waitForFunction(() => document.querySelector('[data-testid="shared-drive-phase"]')?.getAttribute('data-phase') === 'idle');
            await drivePage.evaluate(() => { location.hash = '/manage'; });
            await drivePage.getByRole('heading', { name: '이용자 및 사업체 관리' }).waitFor();
            // 이 시나리오는 이용자를 화면이 아니라 저장소에 직접 넣었으므로, 받은 변경 알림으로 화면 목록을 다시 읽게 한다.
            await drivePage.evaluate(() => window.dispatchEvent(new CustomEvent('jjss:shared-drive-applied', { detail: { count: 1, deleted: 0 } })));
            await drivePage.getByRole('button', { name: '합성공유이용자 정보 수정', exact: true }).click();
            await drivePage.getByRole('heading', { name: '이용자 정보 수정', exact: true }).waitFor();
            await drivePage.getByTestId('shared-drive-editing').waitFor({ timeout: 10000 });
            assert.match(await drivePage.getByTestId('shared-drive-editing').textContent(), /park@example-org\.org 님이 다른 PC에서 이 기록을 편집 중/);
            // 이 PC도 "편집 중"을 드라이브에 찍는다(열어 둔 사이 도착한 수정은 덮어쓰지 않고 충돌로 남기는 근거).
            await drivePage.waitForFunction(id => window.uxDriveFiles.get(id)?.appProperties.editingBy === 'kim@example-org.org', sharedSeekerFileId, { timeout: 10000 });
            assert.deepEqual(errors, [], 'no uncaught runtime errors in shared drive flow');
            console.log('PASS shared drive: hidden in browser build, zero requests while off, guided setup with security check, org key confirmation, backup-then-encrypted upload, live sync after enabling, editing notice in seeker edit modal');
        } finally {
            await driveContext.close();
        }
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
