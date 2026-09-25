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
        await page.getByRole('button', { name: '6. 출력', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: '결과보고 DOCX 저장', exact: true }).count(), 1, 'DOCX save button exists');
        await page.getByText('출력할 수 없습니다', { exact: false }).waitFor();
        await page.getByRole('button', { name: '회차 저장', exact: true }).click();
        await page.getByText('회차를 저장했습니다.').waitFor();
        await page.getByText('저장하지 않은 변경 있음').waitFor({ state: 'hidden' });
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
        await page.locator('#ve-seeker').selectOption('ux-ve-seeker');
        await page.getByRole('button', { name: '새 평가 회차', exact: true }).click();
        await page.getByRole('heading', { name: '우세손 판정' }).waitFor();
        for (const question of ['글씨를 쓸 때 어느 손을 사용합니까?', '공을 던질 때 어느 손을 사용합니까?', '젓가락질을 할 때 어느 손을 사용합니까?']) {
            await page.getByRole('group', { name: question }).getByRole('button', { name: '오른손' }).click();
        }
        await page.locator('.badge', { hasText: '오른손' }).first().waitFor();
        await page.getByRole('button', { name: '② 검사 실시', exact: true }).click();
        await page.getByRole('button', { name: /KEAD 손기능 작업표본검사/ }).click();
        await page.getByText('실시요강 기준 조건당 30초').first().waitFor();
        await page.getByRole('button', { name: /검사 시작/ }).click();
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
        await page.getByRole('button', { name: '⑦ 보고서', exact: true }).click();
        await page.getByRole('button', { name: '보고서 만들기', exact: true }).click();
        await page.getByRole('heading', { name: '종합소견 및 직업재활방향' }).waitFor();
        await page.getByText('KEAD 손기능 작업표본검사을(를) 실시요강 기준 조건당 30초 기준으로 실시했다.', { exact: false }).first().waitFor();
        await page.getByText('총합', { exact: false }).first().waitFor();
        assert.equal(await page.getByRole('button', { name: 'DOCX', exact: true }).count(), 1, 'DOCX export button exists');
        await page.getByLabel('평가목적').fill('검증용 평가목적');
        await page.getByRole('button', { name: '확정', exact: true }).click();
        await answerConfirm(page, true);
        await page.getByText('확정된 보고서입니다', { exact: false }).waitFor();
        assert.equal(await page.getByRole('button', { name: '새 버전', exact: true }).count(), 1, 'a confirmed report can only be changed as a new version');
        assert.equal(await page.getByLabel('평가목적').isDisabled(), true, 'confirmed report fields are locked');
        console.log('PASS vocational evaluation workbench: dominant hand, hand-function trial, skipped trial average, bimanual /25 denominators, report compose and confirm lock');

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
