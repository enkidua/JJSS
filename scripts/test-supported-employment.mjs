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
    // 근로자의 날(5/1): 사업체 유급휴일이라 훈련 제외일. 금요일이라 대체공휴일 대상도 아니어야 한다.
    assert.equal(holidays.getHolidayName('2026-05-01'), '근로자의 날');
    assert.equal(holidays.getHolidayName('2025-05-01'), '근로자의 날');
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

// 서식은 기관 제출 원본("지원고용 결과보고 서류모음" — 공단 붙임 서식 스캔본)을 그대로 따른다.
// 칸 이름·순서뿐 아니라 열 폭(mm → twip)과 쪽 여백까지 원본 기준으로 검사한다.
const twip = mm => Math.round(mm * 56.6929);
/** document.xml의 글자만 문단 단위로 모은다(칸 안 줄바꿈은 문단이 나뉜다). */
function docText(xml) {
    return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
        .map(match => [...match[0].matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map(t => t[1]).join(''))
        .join('\n');
}
function gridCols(xml) {
    return [...xml.matchAll(/<w:tblGrid>([\s\S]*?)<\/w:tblGrid>/g)].map(grid => [...grid[1].matchAll(/w:w="(\d+)"/g)].map(m => Number(m[1])));
}
function pageMargins(xml) {
    const m = /<w:pgMar ([^>]*)\/>/.exec(xml);
    const get = name => Number(new RegExp(`w:${name}="(\\d+)"`).exec(m[1])[1]);
    return { left: get('left'), right: get('right') };
}
const closeTo = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 2, `${label}: ${actual} ≠ ${expected}`);

await test('서식 원본 폭: 7종 모두 원본에서 잰 열 폭(mm)을 그대로 쓰고 좌우 여백이 같다', async () => {
    const expected = {
        resultReport: [[28.7, 25.0, 32.8, 24.8, 25.5, 23.2], [16.5, 15.5, 12.3, 12.5, 13.4, 17.1, 18.0, 17.5, 17.5, 19.7], [53.4, 53.3, 53.3]],
        paymentStatement: [[15.8, 20.2, 30.7, 38.2, 18.1, 29.2]],
        trainingLog: [[16.9, 45.2, 26.7, 25.3, 22.1, 25.5], [6.7, 10.3, 16.5, 22.9, 18.2, 25.3, 14.8, 47.0]],
        evaluationRecord: [[9.5, 7.7, 18.7, 47.4, 11.0, 11.7, 10.4, 43.4]],
        coachTimesheet: [[34.8, 47.8, 30.0, 46.1], [18.3, 20.3, 20.0, 20.1, 20.0, 19.9, 20.0, 20.1]],
        safetyChecklist: [[39.6, 39.4, 39.4, 40.1], [13.5, 109.7, 35.0], [158.2]],
        otherIncomeStatement: [[26.9, 56.8, 27.9, 55.9]],
    };
    for (const item of docs.SUPPORTED_EMPLOYMENT_DOCUMENTS) {
        const xml = await documentXml(docs.buildDocument(item.kind, case16));
        const grids = gridCols(xml);
        for (const [index, widths] of expected[item.kind].entries()) {
            assert.ok(grids[index], `${item.kind} 표 ${index + 1} 없음`);
            assert.deepEqual(grids[index], widths.map(twip), `${item.kind} 표 ${index + 1} 열 폭`);
        }
        const margins = pageMargins(xml);
        closeTo(margins.left, margins.right, `${item.kind} 좌우 여백`);
        const widest = Math.max(...expected[item.kind].map(widths => widths.reduce((a, b) => a + b, 0)));
        assert.ok(twip(210) - margins.left - margins.right >= twip(widest) - 5, `${item.kind}: 본문 폭이 원본 표보다 좁음`);
    }
});

await test('DOCX ① 결과보고 (원본: 훈련개요 6칸·훈련결과 2단 머리·수당지급내역 3칸)', async () => {
    const xml = await documentXml(docs.buildResultReport(scored, { staffName: '담당테스트', organizationName: '가상기관' }));
    const text = docText(xml);
    for (const value of ['14', '차 지원고용 결과보고', '1. 훈련개요', '2. 훈련결과', '3. 수당지급내역', '※ 지원고용수당 지급명세서 첨부', TRAINEE, EMPLOYER]) {
        assert.ok(text.includes(value), value);
    }
    const order = ['사업체명', '훈련직무', '훈련기간', '계획인원', '수료인원', '취업인원'].map(label => text.indexOf(label));
    assert.deepEqual([...order].sort((a, b) => a - b), order, '훈련개요 열 순서');
    for (const value of ['훈련일수', '수당지급내역', '실제\n종료일', '사전\n훈련', '현장\n훈련', '사업주\n보조금', '취업일자\n(예정일)', '총 지급액(세전)']) {
        assert.ok(text.includes(value), value);
    }
    for (const value of ['1,250,100원', '560,000원', '290,100원', '400,000원', '사전훈련: 1일\n현장훈련: 15일', '현장훈련: 15일']) {
        assert.ok(text.includes(value), value);
    }
    assert.ok(xml.includes('w:gridSpan w:val="4"'), '훈련일수 4칸 병합');
    assert.ok(xml.includes('바탕'), '원본 본문 글꼴(바탕)');
    assert.equal(text.includes('담당테스트'), false, '원본 결과보고에는 서명란이 없다');
});

await test('DOCX ② [붙임 28] 지원고용 수당 지급명세서 (원본 열 순서)', async () => {
    const xml = await documentXml(docs.buildPaymentStatement(case15));
    const text = docText(xml);
    // 제목("…지급명세서")과 섞이지 않게 표 머리 행부터 찾는다.
    const table = text.slice(text.indexOf('(단위 : 원)'));
    const order = ['구분', '성    명', '연락처', '지급명세', '금  액', '수령인'].map(label => table.indexOf(label));
    assert.ok(order.every(index => index >= 0), '열 제목 누락');
    assert.deepEqual([...order].sort((a, b) => a - b), order, '열 순서: 구분 | 성명(사업장명) | 연락처 | 지급명세 | 금액 | 수령인(송금계좌번호)');
    for (const value of ['[붙임 28] 지원고용 수당 지급명세서', '지원고용 수당 지급명세서', '(단위 : 원)', '훈련\n수당', '사업주\n보조금', '직무지도\n원 수당', '525,000', '270,760', '375,000', '1,170,760', '사전+현장훈련\n35,000원 * 15일', '19,340원 * 14일', '가상은행\n000-00-000003', EMPLOYER]) {
        assert.ok(text.includes(value), value);
    }
    assert.ok(xml.includes('w:w="11906"') && xml.includes('w:h="16838"'), 'A4');
});

await test('DOCX ③ 지원고용 훈련일지 (원본 머리표 3줄·8칸 일지·쪽마다 머리행)', async () => {
    const xml = await documentXml(docs.buildTrainingLog(case16, { staffName: '담당테스트', employerContactName: '업체테스트' }));
    const text = docText(xml);
    for (const value of ['지원고용 훈련일지', '훈련생명', '직무지도원\n성명', '직무지도\n시간', '직무지도원\n구분', '직무지도\n일수', '1:多 지도여부', '주휴수당 등', '평가 및 지도사항', '수행정도\n(측정시\n간)', '출퇴근\n지도 및\n휴게시간\n지도 여부', '7/20', '8/10', '위와 같이 실시하였음을 확인함', '지도사항 16', '16일', '6h']) {
        assert.ok(text.includes(value), value);
    }
    assert.ok(text.includes('사\n전\n훈\n련') && text.includes('현\n장\n훈\n련'), '구분 칸 세로쓰기');
    for (const value of ['(공단/위탁기관) 담당자:', '업체담당자:', '직무지도원:', '담당테스트', '업체테스트', '(서명 또는 인)']) {
        assert.ok(text.includes(value), value);
    }
    assert.ok(xml.includes('<w:tblHeader/>') || xml.includes('<w:tblHeader'), '반복 머리행');
});

await test('훈련일지는 쪽마다 표를 나누고, 쪽마다 머리행과 구분 칸을 다시 그린다', async () => {
    const model3 = docs.buildHtmlPreview(case16, 'trainingLog');
    const breaks = (model3.match(/class="page-break"/g) || []).length;
    assert.ok(breaks >= 1, '16일 일지는 두 쪽 이상');
    assert.equal((model3.match(/평가 및 지도사항/g) || []).length, breaks + 1, '쪽마다 머리행');
});

await test('훈련일지 직무지도일수: coachDaysBasis(훈련일/출석일)와 일치', async () => {
    const c = structuredClone(case16);
    c.dailyLogs[0].attendance = '결석'; // 사전
    c.dailyLogs[5].attendance = '결석'; // 현장
    assert.ok(docText(await documentXml(docs.buildTrainingLog(c))).split('\n').includes('16일'));
    const attended = docText(await documentXml(docs.buildTrainingLog(c, { coachDaysBasis: 'attended' }))).split('\n');
    assert.ok(attended.includes('14일'));
    assert.equal(attended.includes('16일'), false);
});

await test('DOCX ④ 훈련생 종합 평가기록부 (원본: 영역 세로쓰기·20항목·총점·비고)', async () => {
    const xml = await documentXml(docs.buildEvaluationRecord(scored, { staffName: '담당테스트' }));
    const text = docText(xml);
    for (const group of model.EVALUATION_GROUPS) {
        assert.ok(text.includes([...group.label].join('\n')), group.label);
        for (const item of group.items) assert.ok(text.includes(item), item);
    }
    for (const value of ['지원고용 훈련생 종합 평가기록부', '훈련생명', '사업체명', '훈련기간', '평 가 소 견', '총 점(만점 100점)', '※ 항목별 점수채점 : 우수 5점, 양호 4점, 보통 3점, 미흡 2점, 불량 1점', '60', '80', '직무지도원:', '(위탁기관) 담당자:', '담당테스트', '출근 시간을 잘 지킴']) {
        assert.ok(text.includes(value), value);
    }
});

await test('DOCX ⑤ [붙임 19] 직무지도원 출근부 (원본: 머리표 5줄·주간 근무상황표)', async () => {
    const xml = await documentXml(docs.buildCoachTimesheet(case16, { branchName: '가상지사', staffName: '담당테스트', employerContactName: '업체테스트' }));
    const text = docText(xml);
    for (const value of ['[붙임 19] 직무지도원 출근부', '가상지사 직무지도원 출근부', '배치사업체명', '지도기간', '지도일수 및 시간\n(주휴미포함)', '총 16일,   총 96h', '일반 지도시간\n(1:1 지도시간)', '1:多 지도시간\n(2인 이상)', '연장 지도시간\n(1:1 지도시간)', '※ 주휴수당은 위탁기관 담당자가 작성', '■ 근무상황표', '일자', '총\n지도시간', '1:多 지도', '7/20', '09:00 ~\n15:00\n6(h)', '위와 같이 근무(출근) 하였음을 확인함', '공단/위탁기관 담당자:', '사업체담당자:', COACH]) {
        assert.ok(text.includes(value), value);
    }
    for (const day of ['월', '화', '수', '목', '금', '토', '일']) assert.ok(text.split('\n').includes(day), day);
    assert.ok(text.split('\n').includes('/'), '기간 밖 날짜는 / 로 표시');
});

await test('DOCX ⑥ [붙임 41] 현장훈련 안전체크리스트 (원본 문구 33항목)', async () => {
    const xml = await documentXml(docs.buildSafetyChecklist(case16, { staffName: '담당테스트' }));
    const text = docText(xml);
    const { SAFETY_CHECKLIST } = await load('docs/builders.mjs');
    assert.equal(SAFETY_CHECKLIST.reduce((total, group) => total + group.items.length, 0), 33);
    for (const group of SAFETY_CHECKLIST) for (const item of group.items) assert.ok(text.includes(item), item);
    for (const value of ['[붙임 41] 지원고용 현장훈련 안전체크리스트', '점검 담당자', '점검일', '업체명', '지원고용 훈련기간', '□양호   □개선필요', '□ 개선필요에 대한 조치사항 기입', '담당테스트', EMPLOYER]) {
        assert.ok(text.includes(value), value);
    }
    assert.ok(xml.includes('w:u w:val="single"'), '안내문 밑줄');
});

await test('DOCX ⑦ 기타소득 지급내역서 (주민등록번호는 앱이 채우지 않는다)', async () => {
    const xml = await documentXml(docs.buildOtherIncomeStatement(case16, { organizationName: '가상기관' }));
    const text = docText(xml);
    for (const value of ['(별지 제37-4호 서식)', '기타소득 지급내역서', '□ 건명: 제14차 중증장애인지원고용 직무지도원 수당지급', '□ 지급대상자 정보', '주민등록번호', '소속기관', '가상기관', '지급은행', '000-00-000001', '400,000원', '위 지급대상자 본인은 상기 내역을 이해하고', '(서명 또는 인)', COACH]) {
        assert.ok(text.includes(value), value);
    }
    assert.equal(/\d{6}-[1-8]\d{6}/.test(text), false, '주민등록번호 형식 값이 들어가면 안 된다');
    assert.ok(xml.includes('w:u w:val="double"'), '제목 이중 밑줄');
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
