import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { mapRehabPlanFormData } from '../src/utils/rehabPlanMapper.ts';
import { getRehabPlanExportWarnings } from '../src/utils/rehabPlanReview.ts';

const seeker = {
    id: 'synthetic-seeker-001',
    seekerId: 'synthetic-seeker-001',
    name: '검증용이용자',
    disabilityType: '지적장애',
    severity: '중증',
    birthDate: '1996.01.02',
    address: '검증용 주소',
    phone: '010-0000-0000',
    notes: '',
};

const fixtures = [
    {
        name: 'A 제목과 항목 구분이 명확한 계획서',
        plan: `직업목표: 검증용 직무에 안정적으로 취업 유지
장기목표: 직무 절차를 독립적으로 수행
단기목표: 3개월 안에 핵심 절차 습득
서비스 기간: 2026.08~2026.11
수행방법/담당자: 주 1회 현장훈련 / 검증담당자
강점: 반복 학습에 성실히 참여함
고려사항: 짧고 구체적인 안내가 필요함
결과 및 지원방향: 단계별 직무훈련을 지원함`,
        meeting: `사례회의 일시: 2026.08.14 10:00
장소: 검증용 상담실
목적: 직업재활계획 수립
논의 내용: 합성 정보만 사용하여 지원방향을 논의함
결론: 단계별 훈련을 진행함`,
        expected: {
            vocationalGoal: '검증용 직무에 안정적으로 취업 유지',
            longTermGoal: '직무 절차를 독립적으로 수행',
            shortTermGoal: '3개월 안에 핵심 절차 습득',
            servicePeriod: '2026.08~2026.11',
            methodsAndStaff: '주 1회 현장훈련 / 검증담당자',
            strengths: '반복 학습에 성실히 참여함',
            considerations: '짧고 구체적인 안내가 필요함',
            supportDirection: '단계별 직무훈련을 지원함',
        },
    },
    {
        name: 'B 개조식 계획서',
        plan: `■ 직업목표
검증용 사무보조 직무 유지
■ 장기목표
● 문서 분류를 스스로 수행
■ 단기목표
● 분류 기준표에 따라 10건 처리
■ 서비스 기간
● 2026.09~2026.12
■ 수행방법
● 기준표 확인 및 반복 실습 / 검증담당자
■ 강점
● 출석 성실함
■ 제한점
● 복합 지시는 나누어 제시 필요
■ 종합소견
● 시각자료를 활용해 현장 적응 지원`,
        meeting: `■ 일시: 2026.08.14 11:00
■ 장소: 검증용 회의실
■ 목적: 개조식 계획 검토
■ 내용
합성 사례의 목표와 수행방법을 검토함
■ 결론
반복 실습을 지원함`,
        expected: {
            vocationalGoal: '검증용 사무보조 직무 유지',
            longTermGoal: '문서 분류를 스스로 수행',
            shortTermGoal: '분류 기준표에 따라 10건 처리',
            servicePeriod: '2026.09~2026.12',
            methodsAndStaff: '기준표 확인 및 반복 실습 / 검증담당자',
            strengths: '● 출석 성실함',
            considerations: '● 복합 지시는 나누어 제시 필요',
            supportDirection: '● 시각자료를 활용해 현장 적응 지원',
        },
    },
    {
        name: 'C 긴 문장 중심 계획서',
        plan: `### **직업목표**: 검증용 환경에서 맡은 업무를 이해하고 장기간 안정적으로 수행하는 것을 목표로 함
### **장기목표**: 반복적인 현장 경험을 바탕으로 작업 순서를 기억하고 필요한 경우 담당자에게 확인하면서 전체 공정을 수행함
### **단기목표**: 안내문을 확인한 뒤 준비, 실행, 정리의 세 단계로 나누어 업무를 수행하고 완료 여부를 점검함
### **서비스 기간**: 2026.08.14~2027.02.13
### **수행방법/담당자**: 긴 설명은 짧은 문장으로 나누어 제공하고 매주 수행 결과를 함께 검토함 / 검증담당자
### **강점**: 새로운 과제를 시작하면 끝까지 참여하려는 태도가 있으며 익숙한 절차는 안정적으로 반복함
### **고려사항**: 여러 지시가 동시에 제시되면 혼란이 생길 수 있어 우선순위를 명확히 안내할 필요가 있음
### **결과 및 지원방향**: 실제 작업환경에서 단계별 실습과 확인 질문 연습을 병행하여 독립 수행 범위를 점진적으로 확대함`,
        meeting: `### **사례회의 일시**: 2026.08.14 13:00
### **장소**: 검증용 회의실
### **목적**: 긴 문장 계획 검토
### **논의 내용**: 합성 이용자의 강점과 고려사항을 바탕으로 실제 업무 흐름에 맞춘 반복 훈련이 필요하다는 의견을 정리함
### **결론**: 주 단위로 수행 결과를 점검하고 다음 목표를 조정하기로 함`,
        expected: {
            vocationalGoal: '검증용 환경에서 맡은 업무를 이해하고 장기간 안정적으로 수행하는 것을 목표로 함',
            longTermGoal: '반복적인 현장 경험을 바탕으로 작업 순서를 기억하고 필요한 경우 담당자에게 확인하면서 전체 공정을 수행함',
            shortTermGoal: '안내문을 확인한 뒤 준비, 실행, 정리의 세 단계로 나누어 업무를 수행하고 완료 여부를 점검함',
            servicePeriod: '2026.08.14~2027.02.13',
            methodsAndStaff: '긴 설명은 짧은 문장으로 나누어 제공하고 매주 수행 결과를 함께 검토함 / 검증담당자',
            strengths: '새로운 과제를 시작하면 끝까지 참여하려는 태도가 있으며 익숙한 절차는 안정적으로 반복함',
            considerations: '여러 지시가 동시에 제시되면 혼란이 생길 수 있어 우선순위를 명확히 안내할 필요가 있음',
            supportDirection: '실제 작업환경에서 단계별 실습과 확인 질문 연습을 병행하여 독립 수행 범위를 점진적으로 확대함',
        },
    },
];

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`${label}: expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)}`);
    }
}

let passed = 0;
for (const fixture of fixtures) {
    try {
        const result = mapRehabPlanFormData(seeker, fixture.plan, fixture.meeting);
        assertEqual(result.client.name, '검증용이용자', `${fixture.name} client.name`);
        assertEqual(result.client.birthDate, '1996.01.02', `${fixture.name} client.birthDate`);
        assertEqual(result.client.address, '검증용 주소', `${fixture.name} client.address`);
        assertEqual(result.client.phone, '010-0000-0000', `${fixture.name} client.phone`);
        assertEqual(result.vocationalGoal, fixture.expected.vocationalGoal, `${fixture.name} vocationalGoal`);
        assertEqual(result.goals[0]?.longTermGoal, fixture.expected.longTermGoal, `${fixture.name} longTermGoal`);
        assertEqual(result.goals[0]?.shortTermGoal, fixture.expected.shortTermGoal, `${fixture.name} shortTermGoal`);
        assertEqual(result.goals[0]?.servicePeriod, fixture.expected.servicePeriod, `${fixture.name} servicePeriod`);
        assertEqual(result.goals[0]?.methodsAndStaff, fixture.expected.methodsAndStaff, `${fixture.name} methodsAndStaff`);
        assertEqual(result.strengths, fixture.expected.strengths, `${fixture.name} strengths`);
        assertEqual(result.considerations, fixture.expected.considerations, `${fixture.name} considerations`);
        assertEqual(result.supportDirection, fixture.expected.supportDirection, `${fixture.name} supportDirection`);
        passed += 1;
        console.log(`PASS ${fixture.name}`);
    } catch (error) {
        console.error(`FAIL ${fixture.name}: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    }
}

console.log(`PASS ${passed}/${fixtures.length}`);
if (passed !== fixtures.length) process.exit(1);

const complete = mapRehabPlanFormData(seeker, fixtures[0].plan, fixtures[0].meeting);
complete.goals = complete.goals.map(goal => ({ ...goal, achieved: true }));
complete.footer.staff = '검증담당자';
assertEqual(getRehabPlanExportWarnings(complete).length, 0, 'complete export warnings');

const missing = {
    ...complete,
    client: { ...complete.client, birthDate: '' },
    goals: complete.goals.map(goal => ({ ...goal, achieved: null })),
};
const warnings = getRehabPlanExportWarnings(missing);
if (!warnings.some(warning => warning.includes('생년월일')) || !warnings.some(warning => warning.includes('목표달성여부'))) {
    throw new Error(`출력 전 누락 경고가 예상과 다릅니다: ${JSON.stringify(warnings)}`);
}
console.log('PASS 출력 전 누락 경고');

// ─── DOCX 출력: 사례회의 결론 포함(C-12), 치환 패턴·제어문자 안전(C-14) ───
const require = createRequire(import.meta.url);
const jszipUrl = pathToFileURL(require.resolve('jszip')).href;
const JSZip = (await import(jszipUrl)).default;
const fileServiceStubUrl = `data:text/javascript;base64,${Buffer.from('export async function saveJjssBlob() { throw new Error("테스트에서는 저장하지 않습니다."); }').toString('base64')}`;
const docxSourceUrl = new URL('../src/utils/rehabPlanDocx.ts', import.meta.url);
const docxCompiled = ts.transpileModule(await readFile(docxSourceUrl, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: docxSourceUrl.pathname,
}).outputText
    .replace(/from ['"]jszip['"]/g, `from ${JSON.stringify(jszipUrl)}`)
    .replace(/from ['"]\.\/jjssFileService['"]/g, `from ${JSON.stringify(fileServiceStubUrl)}`);
const { createRehabPlanDocxBlob, buildCaseMeetingContentForDocx } = await import(`data:text/javascript;base64,${Buffer.from(docxCompiled).toString('base64')}`);
const template = await readFile(new URL('../public/templates/rehab-plan-template.docx', import.meta.url));

async function renderDocumentXml(formData) {
    const blob = await createRehabPlanDocxBlob(formData, template);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    return zip.file('word/document.xml').async('string');
}

function countOccurrences(text, needle) {
    return text.split(needle).length - 1;
}

assertEqual(buildCaseMeetingContentForDocx({ content: '', conclusion: '훈련 진행' }), '결론: 훈련 진행', 'conclusion only');
assertEqual(buildCaseMeetingContentForDocx({ content: '논의함', conclusion: '' }), '논의함', 'no conclusion');
assertEqual(buildCaseMeetingContentForDocx({ content: '논의함', conclusion: '훈련 진행' }), '논의함\n\n결론: 훈련 진행', 'content + conclusion');

const conclusionFixtures = [
    { name: 'A', meeting: fixtures[0].meeting, plan: fixtures[0].plan, expected: '결론: 단계별 훈련을 진행함' },
    { name: 'B', meeting: fixtures[1].meeting, plan: fixtures[1].plan, expected: '결론: 반복 실습을 지원함' },
    { name: 'C', meeting: fixtures[2].meeting, plan: fixtures[2].plan, expected: '결론: 주 단위로 수행 결과를 점검하고 다음 목표를 조정하기로 함' },
];
for (const fixture of conclusionFixtures) {
    const formData = mapRehabPlanFormData(seeker, fixture.plan, fixture.meeting);
    const xml = await renderDocumentXml(formData);
    assertEqual(countOccurrences(xml, fixture.expected), 1, `${fixture.name} DOCX 사례회의 결론 출력`);
}
console.log('PASS DOCX 사례회의 결론 출력 (A/B/C)');

// 논의 내용 제목 없이 결론이 이미 내용에 들어 있는 회의록은 결론을 두 번 넣지 않는다.
const inlineMeeting = `사례회의 일시: 2026.08.20 10:00
장소: 검증용 상담실
목적: 중복 방지 검증
결론: 주 1회 현장 점검을 진행함`;
const inlineData = mapRehabPlanFormData(seeker, fixtures[0].plan, inlineMeeting);
assertEqual(inlineData.caseMeeting.conclusion, '주 1회 현장 점검을 진행함', 'inline conclusion extracted');
const inlineXml = await renderDocumentXml(inlineData);
assertEqual(countOccurrences(inlineXml, '주 1회 현장 점검을 진행함'), 1, '결론 중복 방지');
console.log('PASS DOCX 결론 중복 방지');

// 사용자 입력의 "$&", "$1"이 치환 패턴으로 해석되지 않고, XML에 넣을 수 없는 제어문자는 제거된다.
const unsafeData = mapRehabPlanFormData(seeker, fixtures[0].plan, fixtures[0].meeting);
unsafeData.caseMeeting.purpose = '비용 $& 확인 $1 $$ <검토> & 제어\u0001문자\u000B끝';
const unsafeXml = await renderDocumentXml(unsafeData);
if (!unsafeXml.includes('비용 $&amp; 확인 $1 $$ &lt;검토&gt; &amp; 제어문자끝')) {
    throw new Error('치환 패턴 또는 XML 이스케이프가 예상과 다릅니다.');
}
if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(unsafeXml)) throw new Error('XML에 제어문자가 남아 있습니다.');
if (unsafeXml.includes('{{')) throw new Error('치환되지 않은 필드가 남아 있습니다.');
console.log('PASS DOCX 치환 패턴($&)·제어문자 안전 처리');
