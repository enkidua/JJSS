// 저장 데이터(디스크 raw IndexedDB) 평문 개인정보 검사 — 로컬 Vite 개발 서버와 Playwright(msedge)가 필요하다.
// 실행: JJSS_TEST_URL=http://127.0.0.1:5178 node scripts/test-data-at-rest.cjs
// 합성 데이터만 사용하며 외부 네트워크 요청은 모두 막는다. 브라우저 개발 모드라 jjssSecure가 없으므로 enc:v1 암호화가 쓰인다(평문은 안 됨).
const assert = require('node:assert/strict');
const { chromium } = require(process.env.JJSS_PLAYWRIGHT_PATH || 'playwright');
const base = process.env.JJSS_TEST_URL || 'http://127.0.0.1:5178';

const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const FORBIDDEN = [
    '홍가람',
    '010-1234-5678',
    '서울특별시 마포구 월드컵로 123',
    '월드컵로 123',
    '취업상담 합성 내용',
    '합성 개인정보 테스트',
    '900101-1234567',
    PHOTO,
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    'AIzaSy-synthetic-data-at-rest',
];

async function main() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    try {
        const context = await browser.newContext();
        await context.addInitScript(() => localStorage.setItem('jjss:api-key-onboarding-v1', 'later'));
        await context.route('**/*', route => {
            if (new URL(route.request().url()).origin !== new URL(base).origin) return route.abort();
            return route.continue();
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base);
        await page.locator('h1').waitFor();

        // 1) 앱 저장 API로 합성 데이터를 저장한다.
        const ids = await page.evaluate(async photo => {
            const { useDataStore } = await import('/src/store/dataStore.ts');
            const { useSettingsStore } = await import('/src/store/settingsStore.ts');
            const localDB = await import('/src/config/localDB.ts');
            const store = useDataStore.getState();
            await store.fetchData(true);
            await store.addSeeker({
                status: '구직중', seekerId: '900101-1234567', name: '홍가람', age: 36, birthDate: '1990-01-01',
                address: '서울특별시 마포구 월드컵로 123', phone: '010-1234-5678', disabilityType: '지적장애', severity: '중증',
                desiredJob1: '사무보조', desiredJob2: '', desiredSalary: '200만원', desiredWorkHours: '주 5일', desiredLocation: '마포구',
                recommendingAgency: '합성기관', notes: '취업상담 합성 내용',
            });
            const seeker = useDataStore.getState().seekers.find(item => item.name === '홍가람');
            const doc = await store.addCaseDocument({
                seekerId: seeker.id, seekerName: '홍가람', type: 'counseling', tab: 'case',
                content: '취업상담 합성 내용 — 홍가람 010-1234-5678', title: '홍가람 상담일지', location: '서울특별시 마포구 월드컵로 123',
            });
            await store.addJob({
                counselDate: '2026-09-24', companyName: '합성상사', location: '마포구', reqDisabilityType: '무관', reqSeverity: '무관',
                openingsCount: 1, jobRole: '사무보조', salary: '200만원', workHours: '주 5일', contactPerson: '홍가람', contactPhone: '010-1234-5678',
            });
            const job = useDataStore.getState().jobs.find(item => item.companyName === '합성상사');
            await store.addExpense({
                date: '2026-09-24', category: '교통비', budgetItem: '현장훈련', description: '홍가람 교통비', quantity: 1, unitPrice: 1000,
                supplyAmount: 1000, vat: 0, amount: 1000, vendor: '홍가람', vendorBizNo: '', paymentMethod: '현금', cardType: '', cardLastFour: '', approvalNo: '',
                notes: '합성 개인정보 테스트',
            });
            await localDB.addDoc('trainingState', {
                id: 'work-training',
                rooms: [{ id: 'room-1', name: '합성 훈련실', teacher: '담당', program: '사무', year: '2026',
                    trainees: [{ id: 'trainee-1', seekerId: seeker.id, name: '홍가람', gender: '여', memo: '합성 개인정보 테스트', score: 3, photoDataUrl: photo }] }],
                attendanceBook: { '2026-09-24': { 'trainee-1': '출석' } },
                progressYear: '2026',
                progressBook: { 'trainee-1': { '2026-09': { social: { checked: true, note: '취업상담 합성 내용' } } } },
                trainingRecords: { 'trainee-1': { counselingMemo: '취업상담 합성 내용', evaluation: '홍가람 평가' } },
                manager: '홍가람',
                updatedAt: localDB.localTimestamp(),
            });
            await useSettingsStore.getState().loadSettings();
            await useSettingsStore.getState().updateApiKey('gemini', 'AIzaSy-synthetic-data-at-rest');
            return { seekerId: seeker.id, docId: doc.id, jobId: job.id };
        }, PHOTO);
        assert.ok(ids.seekerId && ids.docId && ids.jobId, '합성 데이터 저장');
        console.log('PASS 앱 저장 API로 합성 이용자·사례문서·사업체·지출·직업훈련·API 키 저장');

        // 2) 앱 코드를 거치지 않고 raw IndexedDB와 localStorage를 그대로 읽는다.
        const raw = await page.evaluate(() => new Promise((resolve, reject) => {
            const request = indexedDB.open('JJSS_LOCAL_DB');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const names = Array.from(db.objectStoreNames);
                const tx = db.transaction(names, 'readonly');
                const dump = {};
                for (const name of names) {
                    const getAll = tx.objectStore(name).getAll();
                    getAll.onsuccess = () => { dump[name] = getAll.result; };
                }
                tx.oncomplete = () => {
                    db.close();
                    const local = {};
                    for (let index = 0; index < localStorage.length; index += 1) {
                        const key = localStorage.key(index);
                        local[key] = localStorage.getItem(key);
                    }
                    resolve({ dump, local });
                };
                tx.onerror = () => reject(tx.error);
            };
        }));
        const rawText = JSON.stringify(raw.dump);
        for (const text of FORBIDDEN) {
            assert.equal(rawText.includes(text), false, `raw IndexedDB에 평문 "${text.slice(0, 40)}"가 있으면 안 됨`);
        }
        const localText = JSON.stringify(raw.local);
        for (const text of FORBIDDEN) {
            assert.equal(localText.includes(text), false, `localStorage에 평문 "${text.slice(0, 40)}"가 있으면 안 됨`);
        }
        const rawTraining = raw.dump.trainingState.find(item => item.id === 'work-training');
        assert.match(rawTraining.rooms, /^enc:v[12]:/, '훈련실·훈련생 전체가 암호문');
        assert.match(rawTraining.trainingRecords, /^enc:v[12]:/);
        assert.match(rawTraining.attendanceBook, /^enc:v[12]:/);
        assert.match(rawTraining.manager, /^enc:v[12]:/);
        const rawJob = raw.dump.jobs.find(item => item.id === ids.jobId);
        assert.match(rawJob.contactPerson, /^enc:v[12]:/);
        assert.match(rawJob.contactPhone, /^enc:v[12]:/);
        assert.equal(rawJob.companyName, '합성상사', '회사명은 평문 유지(개인정보 아님)');
        const rawSeeker = raw.dump.seekers.find(item => item.id === ids.seekerId);
        for (const field of ['name', 'seekerId', 'phone', 'address', 'birthDate', 'age', 'disabilityType', 'severity', 'desiredSalary', 'desiredLocation', 'status', 'notes', 'recommendingAgency']) {
            assert.match(String(rawSeeker[field]), /^enc:v[12]:/, `이용자 ${field} 암호화`);
        }
        const rawDoc = raw.dump.caseDocuments.find(item => item.id === ids.docId);
        for (const field of ['seekerId', 'seekerName', 'content', 'title', 'location']) {
            assert.match(String(rawDoc[field]), /^enc:v[12]:/, `사례문서 ${field} 암호화`);
        }
        assert.equal(rawDoc.type, 'counseling', '문서 종류는 평문(목록 분류용)');
        const rawSettings = raw.dump.settings.find(item => item.id === 'app-settings');
        const gemini = rawSettings.llmConfigs.find(config => config.provider === 'gemini');
        assert.equal(gemini.apiKey, '', 'API 키 평문 저장 없음');
        assert.match(gemini.apiKeyEncrypted, /^enc:v[12]:/);
        console.log('PASS raw IndexedDB·localStorage에 합성 개인정보·사진·API 키 평문 없음');

        // 3) 앱 API로 다시 읽으면 원래 값으로 복원된다.
        const restored = await page.evaluate(async ({ seekerId, docId, jobId }) => {
            const localDB = await import('/src/config/localDB.ts');
            const seeker = await localDB.getById('seekers', seekerId);
            const doc = await localDB.getById('caseDocuments', docId);
            const job = await localDB.getById('jobs', jobId);
            const training = await localDB.getById('trainingState', 'work-training');
            const expenses = await localDB.getAll('expenses');
            const { json } = await localDB.createBackupJson();
            return { seeker, doc, job, training, expense: expenses.find(item => item.vendor === '홍가람'), backupHasKey: json.includes('AIzaSy-synthetic-data-at-rest') };
        }, ids);
        assert.equal(restored.seeker.name, '홍가람');
        assert.equal(restored.seeker.phone, '010-1234-5678');
        assert.equal(restored.seeker.address, '서울특별시 마포구 월드컵로 123');
        assert.equal(restored.seeker.age, 36, '숫자 필드도 원래 형식으로 복원');
        assert.equal(restored.seeker.notes, '취업상담 합성 내용');
        assert.equal(restored.doc.content, '취업상담 합성 내용 — 홍가람 010-1234-5678');
        assert.equal(restored.doc.seekerId, ids.seekerId, '사례문서 이용자 연결 유지');
        assert.equal(restored.job.contactPerson, '홍가람');
        assert.equal(restored.job.contactPhone, '010-1234-5678');
        const trainee = restored.training.rooms[0].trainees[0];
        assert.deepEqual({ name: trainee.name, memo: trainee.memo, photo: trainee.photoDataUrl }, { name: '홍가람', memo: '합성 개인정보 테스트', photo: PHOTO });
        assert.equal(restored.training.attendanceBook['2026-09-24']['trainee-1'], '출석');
        assert.equal(restored.training.trainingRecords['trainee-1'].counselingMemo, '취업상담 합성 내용');
        assert.equal(restored.training.manager, '홍가람');
        assert.ok(restored.expense, '지출 거래처 복원');
        assert.equal(restored.expense.amount, 1000, '금액은 평문 숫자 그대로');
        assert.equal(restored.backupHasKey, false, '백업 JSON에 API 키 없음');
        console.log('PASS 앱 API로 읽으면 이용자·사례문서·담당자·훈련생·사진·지출 원문 복원, 백업에 API 키 없음');

        // 4) 이전 버전이 남긴 평문 trainingState도 읽히고, 다음 정상 저장에서 암호화된다.
        const legacy = await page.evaluate(async () => {
            const localDB = await import('/src/config/localDB.ts');
            await new Promise((resolve, reject) => {
                const request = indexedDB.open('JJSS_LOCAL_DB');
                request.onsuccess = () => {
                    const db = request.result;
                    const tx = db.transaction('trainingState', 'readwrite');
                    tx.objectStore('trainingState').put({ id: 'legacy-training', rooms: [{ id: 'r', trainees: [{ id: 't', name: '홍가람', memo: '합성 개인정보 테스트' }] }], progressYear: '2025' });
                    tx.oncomplete = () => { db.close(); resolve(); };
                    tx.onerror = () => reject(tx.error);
                };
                request.onerror = () => reject(request.error);
            });
            const before = await localDB.getById('trainingState', 'legacy-training');
            await localDB.addDoc('trainingState', { ...before, updatedAt: localDB.localTimestamp() });
            const rawAfter = await new Promise((resolve, reject) => {
                const request = indexedDB.open('JJSS_LOCAL_DB');
                request.onsuccess = () => {
                    const db = request.result;
                    const get = db.transaction('trainingState').objectStore('trainingState').get('legacy-training');
                    get.onsuccess = () => { db.close(); resolve(get.result); };
                    get.onerror = () => reject(get.error);
                };
                request.onerror = () => reject(request.error);
            });
            const after = await localDB.getById('trainingState', 'legacy-training');
            await localDB.deleteDoc('trainingState', 'legacy-training');
            return { beforeName: before.rooms[0].trainees[0].name, rawAfter: JSON.stringify(rawAfter), afterName: after.rooms[0].trainees[0].name };
        });
        assert.equal(legacy.beforeName, '홍가람', '기존 평문 훈련 기록 읽기 호환');
        assert.equal(legacy.rawAfter.includes('홍가람'), false, '다음 저장에서 암호화로 migration');
        assert.equal(legacy.afterName, '홍가람', 'migration 후에도 원문 유지');
        console.log('PASS 기존 평문 trainingState 읽기 호환 + 다음 저장에서 암호화 migration');

        // 5) 수정하지 않는 오래된 평문 레코드도 앱을 다시 시작하면 백그라운드 migration으로 암호화된다.
        const LEGACY_IDS = { seeker: 'legacy-plain-seeker', job: 'legacy-plain-job', doc: 'legacy-plain-doc', training: 'legacy-plain-training' };
        await page.evaluate(({ ids: legacyIds, photo }) => new Promise((resolve, reject) => {
            const request = indexedDB.open('JJSS_LOCAL_DB');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(['seekers', 'jobs', 'caseDocuments', 'trainingState'], 'readwrite');
                tx.objectStore('seekers').put({ id: legacyIds.seeker, name: '홍가람', phone: '010-1234-5678', address: '서울특별시 마포구 월드컵로 123', age: 36, notes: '취업상담 합성 내용', organization: '기관' });
                tx.objectStore('jobs').put({ id: legacyIds.job, companyName: '이전상사', jobRole: '사무보조', contactPerson: '홍가람', contactPhone: '010-1234-5678' });
                tx.objectStore('caseDocuments').put({ id: legacyIds.doc, type: 'counseling', tab: 'case', seekerId: legacyIds.seeker, seekerName: '홍가람', content: '취업상담 합성 내용' });
                tx.objectStore('trainingState').put({ id: legacyIds.training, rooms: [{ id: 'r', trainees: [{ id: 't', name: '홍가람', memo: '합성 개인정보 테스트', photoDataUrl: photo }] }], progressYear: '2024' });
                tx.oncomplete = () => { db.close(); resolve(); };
                tx.onerror = () => reject(tx.error);
            };
        }), { ids: LEGACY_IDS, photo: PHOTO });

        const readLegacyRaw = () => page.evaluate(legacyIds => new Promise((resolve, reject) => {
            const request = indexedDB.open('JJSS_LOCAL_DB');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const tx = db.transaction(['seekers', 'jobs', 'caseDocuments', 'trainingState'], 'readonly');
                const out = {};
                const pairs = [['seekers', legacyIds.seeker], ['jobs', legacyIds.job], ['caseDocuments', legacyIds.doc], ['trainingState', legacyIds.training]];
                for (const [storeName, id] of pairs) {
                    const get = tx.objectStore(storeName).get(id);
                    get.onsuccess = () => { out[storeName] = get.result; };
                }
                tx.oncomplete = () => {
                    db.close();
                    resolve({ records: out, marker: localStorage.getItem('jjss:at-rest-migration') });
                };
                tx.onerror = () => reject(tx.error);
            };
        }), LEGACY_IDS);

        const seeded = await readLegacyRaw();
        assert.equal(JSON.stringify(seeded.records).includes('홍가람'), true, '재시작 전에는 평문 레코드가 있음(테스트 전제)');

        await page.reload();
        await page.locator('h1').waitFor();
        let migrated = null;
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
            const current = await readLegacyRaw();
            if (!FORBIDDEN.some(text => JSON.stringify(current.records).includes(text))) {
                migrated = current;
                break;
            }
            await page.waitForTimeout(250);
        }
        assert.ok(migrated, '재시작 후 백그라운드 migration이 평문 레코드를 암호화해야 함');
        const migratedText = JSON.stringify(migrated.records);
        for (const text of FORBIDDEN) {
            assert.equal(migratedText.includes(text), false, `migration 후 raw에 평문 "${text.slice(0, 40)}"가 있으면 안 됨`);
        }
        for (const field of ['name', 'phone', 'address', 'age', 'notes']) assert.match(String(migrated.records.seekers[field]), /^enc:v[12]:/, `오래된 이용자 ${field} 암호화`);
        assert.equal(migrated.records.seekers.organization, '기관');
        assert.match(migrated.records.jobs.contactPerson, /^enc:v[12]:/);
        assert.equal(migrated.records.jobs.companyName, '이전상사');
        assert.match(migrated.records.caseDocuments.content, /^enc:v[12]:/);
        assert.match(migrated.records.trainingState.rooms, /^enc:v[12]:/);
        assert.equal(migrated.records.trainingState.progressYear, '2024');
        // 완료 표지는 바로 뒤에 기록되므로 잠시 기다린다.
        let marker = migrated.marker;
        for (let attempt = 0; attempt < 20 && !marker; attempt += 1) {
            await page.waitForTimeout(100);
            marker = (await readLegacyRaw()).marker;
        }
        const parsedMarker = JSON.parse(marker || 'null');
        assert.ok(parsedMarker && parsedMarker.version >= 1 && typeof parsedMarker.completedAt === 'string', '비민감 완료 표지 기록');
        assert.equal(FORBIDDEN.some(text => (marker || '').includes(text)), false);

        const afterMigration = await page.evaluate(async legacyIds => {
            const localDB = await import('/src/config/localDB.ts');
            const seeker = await localDB.getById('seekers', legacyIds.seeker);
            const job = await localDB.getById('jobs', legacyIds.job);
            const doc = await localDB.getById('caseDocuments', legacyIds.doc);
            const training = await localDB.getById('trainingState', legacyIds.training);
            await localDB.deleteDoc('seekers', legacyIds.seeker);
            await localDB.deleteDoc('jobs', legacyIds.job);
            await localDB.deleteDoc('caseDocuments', legacyIds.doc);
            await localDB.deleteDoc('trainingState', legacyIds.training);
            return {
                seeker: { name: seeker.name, phone: seeker.phone, address: seeker.address, age: seeker.age, notes: seeker.notes },
                job: { contactPerson: job.contactPerson, contactPhone: job.contactPhone },
                content: doc.content,
                trainee: training.rooms[0].trainees[0],
            };
        }, LEGACY_IDS);
        assert.deepEqual(afterMigration.seeker, { name: '홍가람', phone: '010-1234-5678', address: '서울특별시 마포구 월드컵로 123', age: 36, notes: '취업상담 합성 내용' });
        assert.deepEqual(afterMigration.job, { contactPerson: '홍가람', contactPhone: '010-1234-5678' });
        assert.equal(afterMigration.content, '취업상담 합성 내용');
        assert.deepEqual({ name: afterMigration.trainee.name, memo: afterMigration.trainee.memo, photo: afterMigration.trainee.photoDataUrl }, { name: '홍가람', memo: '합성 개인정보 테스트', photo: PHOTO });
        console.log('PASS 수정하지 않은 평문 레코드도 재시작 후 백그라운드 migration으로 암호화, 앱 API로 원문 복원');

        assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
        console.log('PASS test-data-at-rest 전체');
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
