// 지원고용 계산·공휴일·서류 생성 단위 테스트 (계획서 D-6).
// 모든 이름·계좌·연락처는 합성 데이터이며 네트워크·IndexedDB를 사용하지 않는다.
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import JSZip from 'jszip';
import { Packer } from 'docx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureDir = path.join(root, 'src', 'features', 'supportedEmployment');
// node_modules 아래에 두어야 트랜스파일한 파일에서 'docx'를 찾을 수 있다.
const outDir = path.join(root, 'node_modules', '.cache', 'test-supported-employment');

// storage.ts·index.ts는 IndexedDB(localDB)를 쓰므로 제외한다. 직렬화는 model.ts에서 검사한다.
const SKIP = new Set(['storage.ts', 'index.ts']);

async function collect(dir) {
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...await collect(full));
        else if (entry.name.endsWith('.ts') && !(dir === featureDir && SKIP.has(entry.name))) files.push(full);
    }
    return files;
}

async function transpile(sourcePath) {
    const relative = path.relative(path.join(root, 'src'), sourcePath);
    const target = path.join(outDir, relative).replace(/\.ts$/, '.mjs');
    const output = ts.transpileModule(await readFile(sourcePath, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
        fileName: sourcePath,
    }).outputText.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, '$1$2.mjs$3');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, output, 'utf8');
}

await rm(outDir, { recursive: true, force: true });
for (const file of [...await collect(featureDir), path.join(root, 'src', 'utils', 'date.ts'), path.join(root, 'src', 'features', 'docx', 'blocks.ts')]) await transpile(file);

const load = relative => import(pathToFileURL(path.join(outDir, 'features', 'supportedEmployment', relative)).href);
const model = await load('model.mjs');
const { getDefaultRates } = await load('rates.mjs');
const holidays = await load('holidays.mjs');
const { generateTrainingDays, syncDailyLogs, buildCoachTimesheetFromLogs, timeRangeHours } = await load('schedule.mjs');
const { summarizeAttendance } = await load('attendance.mjs');
const { calculatePayments, formatWon } = await load('calc.mjs');
const docs = await load('docs/index.mjs');

let passed = 0;
async function test(name, run) {
    await run();
    passed += 1;
    console.log(`PASS ${name}`);
}

const TRAINEE = '가상훈련생';
const EMPLOYER = '테스트상사';
const COACH = '예시지도원';

function makeCase({ start, end, preTrainingDays = 1, round = 14 }) {
    const c = model.createEmptyCase({
        round,
        seekerId: 'seeker-test-1',
        seekerName: TRAINEE,
        jobId: 'job-test-1',
        employerName: EMPLOYER,
        jobTitle: '물류 포장 보조',
        period: { start, end, plannedEnd: end },
        preTrainingDays,
        coach: { name: COACH, type: '외부', phone: '010-0000-0001', bank: '가상은행', account: '000-00-000001' },
        traineePayee: { bank: '가상은행', account: '000-00-000002', phone: '010-0000-0002' },
        employerPayee: { bank: '가상은행', account: '000-00-000003', phone: '02-000-0003' },
    });
    const days = generateTrainingDays(start, end, { preTrainingDays, extraClosedDates: c.extraClosedDates });
    c.dailyLogs = syncDailyLogs(days, [], { start: '09:00', end: '15:00', task: '상품 분류·포장', commuteGuidance: true })
        .map((log, index) => ({ ...log, performanceHours: '80% / 30분', note: `지도사항 ${index + 1}` }));
    c.coachTimesheet = buildCoachTimesheetFromLogs(c.dailyLogs);
    return c;
}

// 사전 1일 + 현장 15일 (2026-07-20 월 ~ 2026-08-10 월, 주말 제외 16일)
const case16 = makeCase({ start: '2026-07-20', end: '2026-08-10' });
// 사전 1일 + 현장 14일 (~ 2026-08-07 금, 15일)
const case15 = makeCase({ start: '2026-07-20', end: '2026-08-07', round: 15 });

await test('기본 단가: 2026 값, 표에 없는 연도는 최근 연도 값으로 대체', () => {
    assert.deepEqual(getDefaultRates(2026), { year: 2026, trainingAllowance: 35000, employerSubsidy: 19340, coachAllowance: 25000 });
    assert.equal(getDefaultRates(2029).trainingAllowance, 35000);
    assert.equal(getDefaultRates(2029).year, 2029);
    assert.equal(case16.rates.employerSubsidy, 19340);
});

await test('수당 계산: 사전1 + 현장15 → 560,000 / 290,100 / 400,000 = 1,250,100', () => {
    assert.equal(case16.dailyLogs.length, 16);
    const result = calculatePayments(case16);
    assert.deepEqual(result.items.map(item => item.amount), [560000, 290100, 400000]);
    assert.equal(result.total, 1250100);
    assert.deepEqual(result.items.map(item => item.formula), ['35,000원 × 16일', '19,340원 × 15일', '25,000원 × 16일']);
    assert.equal(result.coach.hours, 96);
});

await test('수당 계산: 사전1 + 현장14 → 525,000 / 270,760 / 375,000 = 1,170,760', () => {
    const result = calculatePayments(case15);
    assert.deepEqual(result.items.map(item => item.amount), [525000, 270760, 375000]);
    assert.equal(result.total, 1170760);
    assert.equal(formatWon(result.total), '1,170,760');
});

await test('출결: 지각·조퇴 4회 → 결석 1회 환산 + 1회 잔여, 현장 일수에서 먼저 차감', () => {
    const c = structuredClone(case16);
    for (const index of [3, 5, 7]) c.dailyLogs[index].attendance = '지각';
    c.dailyLogs[9].attendance = '조퇴';
    const summary = summarizeAttendance(c.dailyLogs);
    assert.equal(summary.lateOrEarlyCount, 4);
    assert.equal(summary.convertedAbsences, 1);
    assert.equal(summary.remainderLateOrEarly, 1);
    assert.equal(summary.paidPreDays, 1);
    assert.equal(summary.paidFieldDays, 14);
    const result = calculatePayments(c);
    assert.deepEqual(result.items.map(item => item.amount), [525000, 270760, 400000]);
    // 2회는 환산 없음
    const two = structuredClone(case16);
    two.dailyLogs[3].attendance = '지각';
    two.dailyLogs[4].attendance = '조퇴';
    assert.equal(summarizeAttendance(two.dailyLogs).convertedAbsences, 0);
    assert.equal(calculatePayments(two).total, 1250100);
});

await test('출결: 결석일은 미지급, 직무지도원수당은 기본(훈련일 기준) 유지·attended 옵션이면 제외', () => {
    const c = structuredClone(case16);
    c.dailyLogs[0].attendance = '결석'; // 사전
    c.dailyLogs[5].attendance = '결석'; // 현장
    const result = calculatePayments(c);
    assert.deepEqual(result.items.map(item => item.days), [14, 14, 16]);
    assert.deepEqual(calculatePayments(c, { coachDaysBasis: 'attended' }).items.map(item => item.days), [14, 14, 14]);
});

await test('공휴일 2026: 설·추석 연휴, 대체공휴일(3·1절·부처님오신날·광복절·개천절)', () => {
    const list = holidays.listHolidays(2026);
    const dates = new Set(list.map(item => item.date));
    for (const date of ['2026-02-16', '2026-02-17', '2026-02-18', '2026-09-24', '2026-09-25', '2026-09-26', '2026-05-24']) {
        assert.ok(dates.has(date), date);
    }
    const substitutes = list.filter(item => item.substitute).map(item => item.date);
    assert.deepEqual(substitutes, ['2026-03-02', '2026-05-25', '2026-08-17', '2026-10-05']);
    // 추석 연휴 마지막 날이 토요일이어도 설·추석은 대체공휴일 없음
    assert.equal(holidays.isHoliday('2026-09-28'), false);
    assert.equal(holidays.getHolidayName('2026-09-25'), '추석');
    assert.ok(holidays.getHolidayName('2026-08-17').startsWith('대체공휴일'));
});

await test('대체공휴일: 겹침(2025 어린이날=부처님오신날, 2028 추석=개천절)·일요일 연휴', () => {
    const subs = year => holidays.listHolidays(year).filter(item => item.substitute).map(item => item.date);
    assert.deepEqual(subs(2025), ['2025-03-03', '2025-05-06', '2025-10-08']);
    assert.ok(subs(2024).includes('2024-02-12'));
    assert.ok(subs(2024).includes('2024-05-06'));
    assert.ok(subs(2027).includes('2027-02-09'));
    assert.ok(subs(2028).includes('2028-10-05'));
    assert.ok(subs(2029).includes('2029-09-24'));
    assert.ok(subs(2030).includes('2030-02-05'));
    // 신정·현충일은 대체 없음 (2028-01-01 토, 2027-06-06 일)
    assert.equal(holidays.isHoliday('2028-01-03'), false);
    assert.equal(holidays.isHoliday('2027-06-07'), false);
    assert.equal(holidays.isHoliday('2026-06-03', ['2026-06-03']), true);
});

await test('제헌절: 2026년부터 공휴일(대체공휴일 적용), 2025년 이전은 평일', () => {
    assert.equal(holidays.getHolidayName('2026-07-17'), '제헌절');
    assert.equal(holidays.isWorkingDay('2026-07-17'), false);
    const july2026 = generateTrainingDays('2026-07-13', '2026-07-24');
    assert.equal(july2026.some(day => day.date === '2026-07-17'), false);
    assert.equal(july2026.length, 9);
    // 2027-07-17 토요일 → 다음 첫 평일 2027-07-19(월) 대체공휴일
    assert.ok(holidays.getHolidayName('2027-07-19').startsWith('대체공휴일(제헌절)'));
    assert.equal(holidays.isWorkingDay('2027-07-19'), false);
    assert.equal(holidays.isHoliday('2025-07-17'), false);
    assert.equal(holidays.isHoliday('2024-07-17'), false);
    assert.equal(holidays.listHolidays(2025).some(item => item.name.includes('제헌절')), false);
});

await test('음력 공휴일 표 밖 연도: 누락 연도 안내 + 출력 전 체크리스트 경고', () => {
    assert.deepEqual(holidays.yearsMissingLunarHolidayData('2030-12-01', '2031-01-31'), [2031]);
    assert.deepEqual(holidays.yearsMissingLunarHolidayData('2026-07-20', '2026-08-10'), []);
    assert.equal(holidays.lunarHolidayDataWarning('', ''), '');
    const future = structuredClone(case16);
    future.period = { start: '2031-01-06', end: '2031-02-14', plannedEnd: '' };
    assert.ok(model.validateCase(future).some(issue => issue.field === 'period' && issue.message.includes('2031년 음력 공휴일')));
    assert.equal(model.validateCase(case16).some(issue => issue.message.includes('음력 공휴일')), false);
});

await test('음력 공휴일 표가 Intl 단기(dangi) 달력과 일치 (지원되는 환경에서만)', () => {
    let formatter;
    try {
        formatter = new Intl.DateTimeFormat('ko-KR-u-ca-dangi', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' });
    } catch {
        console.log('  (Intl dangi 달력 미지원 — 건너뜀)');
        return;
    }
    const lunar = date => {
        const [y, m, d] = date.split('-').map(Number);
        const parts = formatter.formatToParts(new Date(Date.UTC(y, m - 1, d, 3)));
        return `${parts.find(p => p.type === 'month').value.replace(/\D/g, '')}-${parts.find(p => p.type === 'day').value.replace(/\D/g, '')}`;
    };
    for (const [year, row] of Object.entries(holidays.LUNAR_HOLIDAYS)) {
        assert.equal(lunar(row.seollal), '1-1', `${year} 설날`);
        assert.equal(lunar(row.buddha), '4-8', `${year} 부처님오신날`);
        assert.equal(lunar(row.chuseok), '8-15', `${year} 추석`);
    }
});

await test('훈련일 생성: 주말·공휴일·기관 휴무 제외, 앞 N일은 사전', () => {
    const days = generateTrainingDays('2026-08-10', '2026-08-21', { preTrainingDays: 2 });
    assert.deepEqual(days.map(day => day.date), [
        '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14',
        '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
    ]);
    assert.deepEqual(days.slice(0, 3).map(day => day.phase), ['사전', '사전', '현장']);
    const closed = generateTrainingDays('2026-08-10', '2026-08-21', { extraClosedDates: ['2026-08-12'] });
    assert.equal(closed.length, 8);
    assert.equal(closed.some(day => day.date === '2026-08-12'), false);
    assert.deepEqual(generateTrainingDays('2026-08-21', '2026-08-10'), []);
    assert.equal(timeRangeHours('09:00', '15:30'), 6.5);
    assert.equal(timeRangeHours('15:00', '09:00'), 0);
});

await test('직렬화: serialize → parse 왕복, 버전·형식 검사', () => {
    const c = structuredClone(case16);
    c.evaluation.pre[0] = 4;
    c.evaluation.field[19] = 5;
    const parsed = model.parseCase(model.serializeCase(c));
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.case, model.normalizeCase(c));
    assert.equal(parsed.case.evaluation.pre[0], 4);
    assert.equal(parsed.case.evaluation.pre[1], null);
    assert.equal(model.parseCase('not json').ok, false);
    assert.equal(model.parseCase('').ok, false);
    assert.equal(model.parseCase(JSON.stringify({ version: 2 })).ok, false);
    assert.equal(model.parseCase(JSON.stringify({ foo: 1 })).ok, false);
    const partial = model.parseCase(JSON.stringify({ version: 1, round: 3, evaluation: { pre: [9, 3] } }));
    assert.equal(partial.ok, true);
    assert.equal(partial.case.evaluation.pre.length, 20);
    assert.equal(partial.case.evaluation.pre[0], null);
    assert.equal(partial.case.evaluation.pre[1], 3);
    assert.equal(partial.case.rates.trainingAllowance > 0, true);
});

await test('출력 전 체크리스트: 계좌 누락·결석·평가 미입력 안내', () => {
    const c = structuredClone(case16);
    c.traineePayee.account = '';
    c.dailyLogs[4].attendance = '결석';
    const messages = model.validateCase(c).map(issue => issue.message);
    assert.ok(messages.some(m => m.includes('훈련생 송금계좌')));
    assert.ok(messages.some(m => m.includes('결석 1일')));
    assert.ok(messages.some(m => m.includes('사전 점수 20개')));
    assert.ok(messages.some(m => m.includes('서명')));
    assert.equal(model.validateCase(case16).some(issue => issue.message.includes('계좌')), false);
});

await test('다음 회차 복사: 계좌·지도원 유지, 일지·평가는 비움', () => {
    const next = model.copyCaseForNextRound(case16);
    assert.equal(next.round, 15);
    assert.equal(next.coach.account, case16.coach.account);
    assert.equal(next.dailyLogs.length, 0);
    assert.equal(next.id, '');
});

async function documentXml(doc) {
    const buffer = await Packer.toBuffer(doc);
    const zip = await JSZip.loadAsync(buffer);
    const file = zip.file('word/document.xml');
    assert.ok(file, 'word/document.xml 없음');
    return file.async('string');
}

const scored = structuredClone(case16);
scored.evaluation.pre = Array.from({ length: 20 }, () => 3);
scored.evaluation.field = Array.from({ length: 20 }, () => 4);
scored.evaluation.opinions.attitude = '출근 시간을 잘 지킴';

await test('DOCX ① 결과보고', async () => {
    const xml = await documentXml(docs.buildResultReport(scored, { staffName: '담당테스트', organizationName: '가상기관' }));
    for (const text of ['지원고용 훈련 결과보고', '훈련 개요', '수당 지급 내역', '1,250,100', '560,000', '290,100', '400,000', '사전 60점', '현장 80점', '맑은 고딕', TRAINEE]) {
        assert.ok(xml.includes(text), text);
    }
});

await test('DOCX ② 지원고용 수당 지급명세서 (열 순서 별지 제9호)', async () => {
    const xml = await documentXml(docs.buildPaymentStatement(case15));
    const order = ['구분', '성명(사업장명)', '수령인(송금계좌번호)', '연락처', '지급명세', '금액'].map(label => xml.indexOf(`>${label}<`));
    assert.ok(order.every(index => index >= 0), '열 제목 누락');
    assert.deepEqual([...order].sort((a, b) => a - b), order, '열 순서');
    for (const text of ['지원고용 수당 지급명세서', '(단위 : 원)', '훈련수당', '사업주보조금', '직무지도원수당', '525,000', '270,760', '375,000', '1,170,760', '35,000원 × 15일', '000-00-000003', EMPLOYER]) {
        assert.ok(xml.includes(text), text);
    }
    assert.ok(xml.includes('w:w="11906"') && xml.includes('w:h="16838"'), 'A4');
});

await test('DOCX ③ 지원고용 훈련일지 (반복 머리행·일자별 행)', async () => {
    const xml = await documentXml(docs.buildTrainingLog(case16));
    for (const text of ['지원고용 훈련일지', '직무지도원 성명', '직무지도시간', '직무지도원 구분', '직무지도일수', '1:多 지도여부', '주휴수당', '평가 및 지도사항', '수행정도', '07.20(월)', '08.10(월)', '위와 같이 실시하였음을 확인함', '지도사항 16', '16일']) {
        assert.ok(xml.includes(text), text);
    }
    assert.ok(xml.includes('<w:tblHeader/>') || xml.includes('<w:tblHeader'), '반복 머리행');
});

await test('훈련일지 직무지도일수 내역: coachDaysBasis(훈련일/출석일)와 일치', async () => {
    const c = structuredClone(case16);
    c.dailyLogs[0].attendance = '결석'; // 사전
    c.dailyLogs[5].attendance = '결석'; // 현장
    assert.ok((await documentXml(docs.buildTrainingLog(c))).includes('16일 (사전 1일, 현장 15일)'));
    const attended = await documentXml(docs.buildTrainingLog(c, { coachDaysBasis: 'attended' }));
    assert.ok(attended.includes('14일 (출석 기준: 사전 0일, 현장 14일)'));
    assert.equal(attended.includes('16일 (사전'), false);
});

await test('DOCX ④ 훈련생 종합 평가기록부 (20항목 문구·총점·비고)', async () => {
    const xml = await documentXml(docs.buildEvaluationRecord(scored));
    for (const group of model.EVALUATION_GROUPS) {
        assert.ok(xml.includes(group.label), group.label);
        for (const item of group.items) assert.ok(xml.includes(item), item);
    }
    for (const text of ['지원고용 훈련생 종합 평가기록부', '총점(만점 100점)', '※ 항목별 점수채점 : 우수 5점, 양호 4점, 보통 3점, 미흡 2점, 불량 1점', '>60<', '>80<', '(위탁기관) 담당자', '출근 시간을 잘 지킴']) {
        assert.ok(xml.includes(text), text);
    }
});

await test('DOCX ⑤ 직무지도원 출근부 (주간 격자)', async () => {
    const xml = await documentXml(docs.buildCoachTimesheet(case16));
    for (const text of ['직무지도원 출근부', '배치사업체명', '지도기간', '지도일수 및 시간', '16일 / 96시간', '1:多 지도시간', '연장 지도시간', '1주차', '4주차', '07.20', '30시간', '위와 같이 근무하였음을 확인함', COACH]) {
        assert.ok(xml.includes(text), text);
    }
    for (const day of ['월', '화', '수', '목', '금', '토', '일']) assert.ok(xml.includes(`>${day}<`), day);
});

await test('HTML 미리보기·파일명(이용자 이름 미포함)', () => {
    const risky = structuredClone(case16);
    risky.seekerName = '<b>가상</b>';
    const html = docs.buildHtmlPreview(risky, 'paymentStatement');
    assert.ok(html.startsWith('<!doctype html>'));
    assert.ok(html.includes('1,250,100'));
    assert.ok(html.includes('&lt;b&gt;가상&lt;/b&gt;'));
    assert.equal(html.includes('<script'), false);
    for (const item of docs.SUPPORTED_EMPLOYMENT_DOCUMENTS) {
        assert.ok(docs.buildHtmlPreview(case16, item.kind).includes('</table>'), item.kind);
    }
    const c = { round: 14, period: { start: '2026-07-20', end: '2026-08-19', plannedEnd: '' } };
    assert.equal(docs.buildDocumentFileName('resultReport', c), '지원고용_결과보고_14차_2026-08-19.docx');
    assert.equal(docs.buildDocumentFileName('coachTimesheet', c, { extension: 'pdf', numbered: true }), '05_지원고용_직무지도원출근부_14차_2026-08-19.pdf');
    for (const item of docs.SUPPORTED_EMPLOYMENT_DOCUMENTS) {
        assert.equal(docs.buildDocumentFileName(item.kind, case16).includes(TRAINEE), false);
    }
});

await rm(outDir, { recursive: true, force: true });
console.log(`\n${passed}개 테스트 통과`);
