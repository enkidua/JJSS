// 릴리스 검증용 파일을 만든다: 지원고용 서류 5종 샘플(DOCX·HTML), 앱에 복원할 합성 백업 JSON,
// 설치 파일 SHA-256, 수동 점검표. 모든 이름·계좌·연락처는 합성 데이터다(실존 인물·기관 아님).
// 사용: node scripts/make-verification-samples.mjs  → release/verification-<버전>/
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { Packer } from 'docx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const outRoot = path.join(root, 'release', `verification-${version}`);
const featureDir = path.join(root, 'src', 'features', 'supportedEmployment');
const cacheDir = path.join(root, 'node_modules', '.cache', 'make-verification-samples');

async function collect(dir) {
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...await collect(full));
        else if (entry.name.endsWith('.ts') && !(dir === featureDir && ['storage.ts', 'index.ts'].includes(entry.name))) files.push(full);
    }
    return files;
}

async function transpile(sourcePath) {
    const relative = path.relative(path.join(root, 'src'), sourcePath);
    const target = path.join(cacheDir, relative).replace(/\.ts$/, '.mjs');
    const output = ts.transpileModule(await readFile(sourcePath, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        fileName: sourcePath,
    }).outputText.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, '$1$2.mjs$3');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, output, 'utf8');
}

function sha256(file) {
    return new Promise((resolve, reject) => {
        const hash = createHash('sha256');
        createReadStream(file).on('data', chunk => hash.update(chunk)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
    });
}

await rm(cacheDir, { recursive: true, force: true });
for (const file of [...await collect(featureDir), path.join(root, 'src', 'utils', 'date.ts')]) await transpile(file);
const load = relative => import(pathToFileURL(path.join(cacheDir, 'features', 'supportedEmployment', relative)).href);
const model = await load('model.mjs');
const { generateTrainingDays, syncDailyLogs, buildCoachTimesheetFromLogs } = await load('schedule.mjs');
const { calculatePayments, formatWon } = await load('calc.mjs');
const docs = await load('docs/index.mjs');

// ── 합성 회차: 첨부 서류(14차)와 같은 기간·일수 구성, 이름·계좌는 가상 ──
const SEEKER_ID = 'verify-seeker-1';
const JOB_ID = 'verify-job-1';
const c = model.createEmptyCase({
    round: 14,
    seekerId: SEEKER_ID,
    seekerName: '검증훈련생',
    jobId: JOB_ID,
    employerName: '(주)검증상사',
    jobTitle: '고체 화장품 생산·가공·포장',
    plannedCount: 1,
    period: { start: '2026-07-27', end: '2026-08-18', plannedEnd: '2026-08-18' },
    preTrainingDays: 1,
    coach: { name: '검증지도원', type: '내부', phone: '010-0000-1001', bank: '가상은행', account: '000-0000-0001' },
    traineePayee: { bank: '가상은행', account: '000-0000-0002', phone: '010-0000-1002' },
    employerPayee: { bank: '가상은행', account: '000-0000-0003', phone: '02-000-1003' },
});
const days = generateTrainingDays(c.period.start, c.period.end, { preTrainingDays: c.preTrainingDays, extraClosedDates: c.extraClosedDates });
c.dailyLogs = syncDailyLogs(days, [], { start: '13:30', end: '18:00', task: '가공 및 포장', commuteGuidance: true })
    .map(log => ({ ...log, performanceHours: '4h', note: '비닐에 비누 포장 및 비누상자를 접는 작업' }));
c.coachTimesheet = buildCoachTimesheetFromLogs(c.dailyLogs);
const preScores = [5, 5, 5, 5, 5, 3, 3, 4, 4, 3, 3, 3, 4, 3, 5, 4, 4, 3, 4, 4];
const fieldScores = [5, 5, 5, 5, 5, 4, 5, 5, 5, 4, 4, 4, 5, 4, 4, 5, 4, 4, 5, 5];
c.evaluation = {
    pre: preScores,
    field: fieldScores,
    opinions: {
        attitude: '결근·지각·조퇴 없이 근무 태도가 우수하며 외모를 단정히 유지함.',
        relations: '동료와 인사하며 출근하고 의사소통에 어려움이 없음.',
        workAttitude: '일에 대한 열정이 높고 지적 이후 개선되는 모습이 보임.',
        performance: '집중력이 좋고 도구를 잘 다루며 작업량이 점차 늘어남.',
    },
};
c.result = { completed: true, employed: true, employmentDate: '2026-08-19', note: '' };
c.status = '취업';
c.documentOptions = { organizationName: '검증 직업재활기관', staffName: '검증담당자', coachDaysBasis: 'scheduled' };

const payments = calculatePayments(c);
const expected = { total: 1250100, items: [560000, 290100, 400000] };
const actualItems = payments.items.map(item => item.amount);
if (payments.total !== expected.total || actualItems.join() !== expected.items.join()) {
    throw new Error(`금액 검증 실패: ${actualItems.join('/')} = ${payments.total} (기대 ${expected.items.join('/')} = ${expected.total})`);
}

await rm(outRoot, { recursive: true, force: true });
const samplesDir = path.join(outRoot, '01_지원고용_서류샘플');
await mkdir(samplesDir, { recursive: true });
const docOptions = { organizationName: '검증 직업재활기관', staffName: '검증담당자', documentDate: '2026-08-19' };
for (const meta of docs.SUPPORTED_EMPLOYMENT_DOCUMENTS) {
    const document = docs.buildDocument(meta.kind, c, docOptions);
    const buffer = await Packer.toBuffer(document);
    await writeFile(path.join(samplesDir, docs.buildDocumentFileName(meta.kind, c, { numbered: true, date: '2026-08-19' })), buffer);
    await writeFile(path.join(samplesDir, docs.buildDocumentFileName(meta.kind, c, { numbered: true, date: '2026-08-19', extension: 'html' })), docs.buildHtmlPreview(c, meta.kind, docOptions), 'utf8');
}

// ── 합성 백업: 설정 > 파일·백업 > 복원으로 불러와 화면 흐름을 확인 ──
const ts0 = { seconds: Math.floor(new Date('2026-09-01T09:00:00+09:00').getTime() / 1000) };
const backup = {
    seekers: [
        { id: SEEKER_ID, seekerId: 'V-0001', status: '취업', name: '검증훈련생', age: 24, disabilityType: '지적장애', severity: '중증', desiredJob1: '포장', desiredJob2: '제조 보조', desiredSalary: '최저임금 이상', desiredWorkHours: '오후', desiredLocation: '서울 동부', recommendingAgency: '검증 복지관', notes: '검증용 합성 데이터', organization: '직업재활기관', createdAt: ts0, updatedAt: ts0 },
        { id: 'verify-seeker-2', seekerId: 'V-0002', status: '구직중', name: '검증구직자', age: 31, disabilityType: '자폐성장애', severity: '중증', desiredJob1: '우편실 물류', desiredJob2: '사내 미화', desiredSalary: '협의', desiredWorkHours: '주간', desiredLocation: '경기 남부', recommendingAgency: '검증 센터', notes: '검증용 합성 데이터', organization: '직업재활기관', createdAt: ts0, updatedAt: ts0 },
    ],
    jobs: [
        { id: JOB_ID, counselDate: '2026-07-01', companyName: '(주)검증상사', location: '서울 동부', reqDisabilityType: '무관', reqSeverity: '무관', openingsCount: 1, jobRole: '고체 화장품 생산·가공·포장', salary: '최저임금', workHours: '13:30~18:00', hiringStatus: '채용완료', contactPerson: '검증채용담당', contactPhone: '02-000-1003', organization: '직업재활기관', createdAt: ts0, updatedAt: ts0 },
    ],
    caseDocuments: [
        { id: 'verify-se-case-14', seekerId: SEEKER_ID, seekerName: '검증훈련생', type: 'supported_employment', tab: 'employment', source: 'employment', content: model.serializeCase(c), organization: '직업재활기관', createdAt: ts0, updatedAt: ts0 },
        { id: 'verify-counsel-1', seekerId: SEEKER_ID, seekerName: '검증훈련생', type: 'counseling', tab: 'case', source: 'case', content: '[검증용] 초기 상담: 포장 직무 희망, 오후 근무 선호.', organization: '직업재활기관', createdAt: ts0, updatedAt: ts0 },
    ],
    expenses: [],
    resources: [],
    posts: [],
    comments: [],
    trainingState: [],
    budgetProjects: [
        {
            id: 'verify-budget-se-2026', name: '2026 지원고용 사업(검증용)', totalBudget: 10000000, period: '2026',
            budgetItems: [
                { id: 'verify-item-1', name: '훈련수당', amount: 4000000 },
                { id: 'verify-item-2', name: '사업주보조금', amount: 3000000 },
                { id: 'verify-item-3', name: '직무지도원수당', amount: 3000000 },
            ],
            createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z',
        },
    ],
};
const backupDir = path.join(outRoot, '02_복원용_합성백업');
await mkdir(backupDir, { recursive: true });
await writeFile(path.join(backupDir, 'JJSS_검증용_합성백업.json'), JSON.stringify(backup, null, 2), 'utf8');

// ── 설치 파일 해시 ──
const releaseDir = path.join(root, 'release');
const installers = (await readdir(releaseDir)).filter(name => name.includes(version) && /\.(exe|dmg|zip)$/i.test(name));
const hashLines = [];
for (const name of installers) {
    const file = path.join(releaseDir, name);
    const { size } = await stat(file);
    hashLines.push(`${await sha256(file)}  ${name}  (${size.toLocaleString('en-US')} bytes)`);
}
await writeFile(path.join(outRoot, 'SHA256SUMS.txt'), (hashLines.length ? hashLines.join('\n') : '(설치 파일을 찾지 못했습니다. 빌드 후 다시 실행하세요.)') + '\n', 'utf8');

// ── 점검표 ──
const holidaysExcluded = [];
for (let d = new Date(2026, 6, 27); d <= new Date(2026, 7, 18); d.setDate(d.getDate() + 1)) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (d.getDay() !== 0 && d.getDay() !== 6 && !days.some(day => day.date === key)) holidaysExcluded.push(key);
}
const checklist = `# JJSS ${version} 검증 점검표

이 폴더의 모든 이름·계좌·연락처는 **합성 데이터**입니다. 실제 업무 데이터가 있는 PC에서는 복원하기 전에 반드시 현재 데이터를 백업하세요(복원은 기존 데이터를 덮어씁니다). 가능하면 검증 전용 PC나 새 Windows 계정에서 진행하세요.

## 0. 설치 파일 확인
- [ ] \`SHA256SUMS.txt\`의 값과 설치 파일 해시가 같다. PowerShell: \`Get-FileHash ".\\JJSS Setup ${version}.exe" -Algorithm SHA256\`
- [ ] 설치 시 "Windows의 PC 보호" 창이 뜨면 [추가 정보] → [실행]으로 진행된다(코드서명 없는 빌드).
- [ ] 기존 3.0.0이 설치된 PC에서 덮어 설치해도 이용자·사례문서·API 키가 그대로 남는다.

## 1. 지원고용 서류 샘플 (01_지원고용_서류샘플)
기준: 2026-07-27 ~ 2026-08-18, 사전훈련 1일. 주말과 공휴일(${holidaysExcluded.join(', ') || '없음'})을 빼면 훈련일은 ${days.length}일(사전 ${days.filter(d => d.phase === '사전').length}일, 현장 ${days.filter(d => d.phase === '현장').length}일)입니다.
- [ ] 한글·Word에서 DOCX 5종이 모두 열리고 표가 A4 한 장 폭 안에 들어간다.
- [ ] 결과보고: 훈련수당 ${formatWon(actualItems[0])}원 / 사업주보조금 ${formatWon(actualItems[1])}원 / 직무지도원 ${formatWon(actualItems[2])}원 / 계 ${formatWon(payments.total)}원.
- [ ] 지급명세서: 열 순서가 구분 / 성명(사업장명) / 수령인(송금계좌번호) / 연락처 / 지급명세 / 금액이고, 계산식이 "35,000원 × 16일" 형식이다.
- [ ] 훈련일지: 16행, 8/17(대체공휴일)이 없다. 페이지가 넘어가면 머리행이 반복된다.
- [ ] 종합 평가기록부: 20개 항목 문구가 공식 서식과 같고 총점이 사전 79 / 현장 92다.
- [ ] 직무지도원 출근부: 주 단위 격자에 날짜별 시간이 채워져 있다.
- [ ] 같은 이름의 HTML 파일을 브라우저로 열었을 때 PDF 저장용 미리보기가 DOCX와 같은 내용이다.

## 2. 앱 안에서 확인 (02_복원용_합성백업을 복원한 뒤)
- [ ] 설정 → 파일·백업 → 복원에서 \`JJSS_검증용_합성백업.json\`을 불러온다(비밀번호 없는 평문 백업이라 경고가 뜨는 것이 정상).
- [ ] 직업재활 현황판: "검증훈련생"을 고르면 단계 배지가 "취업", 고용지원 카드에 "지원고용 14차"가 보인다. 입력 칸은 "현재 상황 정리" 메모 하나뿐이다.
- [ ] 고용지원 → 지원고용 관리: 14차 회차가 계 1,250,100원으로 보이고, 출력 탭에서 "결과보고 4종 묶음"이 ZIP 파일 하나로 저장된다.
- [ ] 수료/취업 상태에서 예산 사업 "2026 지원고용 사업(검증용)"을 골라 지출 초안 3건을 만들면, 예산 관리에 [초안] 지출 3건이 생기고 다시 눌러도 중복되지 않는다.
- [ ] 예산 관리 → 정합성 점검·집계 화면이 열리고 합계가 지출 목록과 같다.
- [ ] 메뉴를 빠르게 오가도 화면이 번쩍이지 않는다(앱 실행 후 몇 초 뒤).
- [ ] 직업평가·직업훈련·고용지원에서 작성 중에 다른 메뉴를 누르면 "저장하지 않은 내용" 확인창이 뜬다.
- [ ] 업무 지원 도구 → 개인정보 비식별화: "이 컴퓨터에서 처리" 결과가 인터넷 연결 없이도 나온다.

## 3. 검증 후 정리
- [ ] 검증 전 만들어 둔 실제 데이터 백업으로 다시 복원하거나, 검증용 계정을 삭제한다.
`;
await writeFile(path.join(outRoot, '검증_점검표.md'), checklist, 'utf8');
await rm(cacheDir, { recursive: true, force: true });

console.log(`검증용 파일을 만들었습니다: ${path.relative(root, outRoot)}`);
console.log(`- 서류 샘플 ${docs.SUPPORTED_EMPLOYMENT_DOCUMENTS.length}종(DOCX+HTML), 금액 ${actualItems.join(' / ')} = ${payments.total}`);
console.log(`- 합성 백업 1개, SHA256 ${hashLines.length}건, 점검표 1개`);
