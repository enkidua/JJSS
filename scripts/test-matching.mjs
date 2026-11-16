// AI 정밀 매칭 점수(src/services/matching.ts) 단위 테스트.
// 근무시간 단일 값 비교, 임금 단위(만원/원) 환산, 역량 보너스(구인·구직 양쪽 확인 + 부정 표현 제외)를 확인한다.
// 모든 이름·사업체는 합성 데이터다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const transpile = (text) => ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const toDataUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const source = await readFile(new URL('../src/services/matching.ts', import.meta.url), 'utf8');
const { matchCandidates } = await import(toDataUrl(transpile(source)));

const baseJob = {
    id: 'job-1', companyName: '합성 사업체', jobRole: '사무보조', reqSeverity: '무관', reqDisabilityType: '무관',
    salary: '250만원', location: '서울시 강남구', workHours: '40시간',
};
const baseSeeker = {
    id: 'seeker-1', name: '합성 구직자', status: '구직중', desiredJob1: '사무보조', desiredJob2: '', severity: '경증', disabilityType: '지체',
    desiredSalary: '200만원', desiredLocation: '서울시 강남구', desiredWorkHours: '40시간', notes: '',
};
const match = (job = {}, seeker = {}) => matchCandidates({ ...baseJob, ...job }, [{ ...baseSeeker, ...seeker }])[0];
const hours = (jobHours, seekerHours) => match({ workHours: jobHours }, { desiredWorkHours: seekerHours }).details.workHours;
const salary = (jobSalary, seekerSalary) => match({ salary: jobSalary }, { desiredSalary: seekerSalary }).details.salary;
const skills = (job, notes) => {
    const line = match(job, { notes }).combinedComment.split('\n').find(text => text.includes('역량(')) || '';
    return /역량\(([^)]*)\)/.exec(line)?.[1] || '';
};

// ─── (a) 근무시간 ───
assert.deepEqual(hours('40시간', '40시간'), { score: 2, comment: '시간대 부합' }, 'the same single value is a match');
assert.deepEqual(hours('40시간', '30시간'), { score: 0, comment: '시간대 불일치' });
assert.deepEqual(hours('20~40시간', '30시간'), { score: 2, comment: '시간대 부합' }, 'a single value inside the other range is a match');
assert.deepEqual(hours('30시간', '20~40시간'), { score: 2, comment: '시간대 부합' });
assert.deepEqual(hours('20~40시간', '40시간'), { score: 2, comment: '시간대 부합' }, 'a single value at the edge of the range is a match');
assert.deepEqual(hours('20~30시간', '40시간'), { score: 0, comment: '시간대 불일치' });
assert.deepEqual(hours('20~30시간', '25~40시간'), { score: 2, comment: '시간대 부합' }, 'overlapping ranges still match');
assert.deepEqual(hours('20~30시간', '30~40시간'), { score: 0, comment: '시간대 불일치' }, 'ranges that only touch are still a mismatch');
assert.deepEqual(hours('20~30시간', '35~40시간'), { score: 0, comment: '시간대 불일치' });
assert.deepEqual(hours('40시간', '협의'), { score: 2, comment: '협의 가능' });
assert.deepEqual(hours('', '40시간'), { score: 2, comment: '협의 가능' });
assert.deepEqual(hours('20~시간', '20시간'), { score: 2, comment: '시간대 부합' }, 'a range without a readable end is read as its start value');
console.log('PASS work hours: equal or contained single values match, real mismatches still score 0');

// ─── (b) 임금 단위 ───
assert.deepEqual(salary('250만원', '200만원'), { score: 2, comment: '희망 임금 충족' });
assert.deepEqual(salary('250만원', '2,000,000원'), { score: 2, comment: '희망 임금 충족' }, '만원 and 원 are compared in the same unit');
assert.deepEqual(salary('2,500,000원', '200만원'), { score: 2, comment: '희망 임금 충족' });
assert.deepEqual(salary('2500000', '2000000'), { score: 2, comment: '희망 임금 충족' });
assert.deepEqual(salary('250', '2,000,000원'), { score: 2, comment: '희망 임금 충족' }, 'a bare small number is still read as 만원');
assert.deepEqual(salary('200만원', '2,400,000원'), { score: 1, comment: '희망 임금의 80% 이상' });
assert.deepEqual(salary('2,000,000원', '300만원'), { score: 0, comment: '희망 임금과 차이 큼' });
assert.deepEqual(salary('150만원', '3,000,000원'), { score: 0, comment: '희망 임금과 차이 큼' });
assert.deepEqual(salary('200~250만원', '2,300,000원'), { score: 2, comment: '희망 임금 충족' }, 'ranges use the same unit for both ends');
assert.deepEqual(salary('2,000,000~2,500,000원', '230만원'), { score: 2, comment: '희망 임금 충족' });
assert.deepEqual(salary('월 250만원', '월 200만원'), { score: 2, comment: '희망 임금 충족' });
assert.deepEqual(salary('면접 후 협의', '2,000,000원'), { score: 2, comment: '협의 가능성 높음' });
assert.deepEqual(salary('250만원', ''), { score: 2, comment: '협의 가능성 높음' });
// 시급·일급으로 보이는 금액은 월 임금과 견주지 않는다(예전에는 10030 ≥ 200으로 "충족"이 나왔다).
assert.deepEqual(salary('10,030원', '200만원'), { score: 0.5, comment: '정보 부족' });
assert.deepEqual(salary('250만원', '10,030원'), { score: 0.5, comment: '정보 부족' });
console.log('PASS salary: 만원/원 units are normalised before comparing, hourly-looking amounts are not compared with monthly pay');

// ─── (c) 역량 보너스 ───
assert.equal(skills({}, '컴퓨터 활용 가능, 엑셀 기초'), '사무능력', 'office job + office skill in the remarks earns the bonus');
assert.equal(skills({}, '컴퓨터 사용 어려움'), '', 'a negated skill is not a skill');
assert.equal(skills({}, '엑셀 못함'), '');
assert.equal(skills({}, '컴퓨터 사용 불가'), '');
assert.equal(skills({}, '문서작성 경험 없음'), '');
assert.equal(skills({}, '컴퓨터 사용에 문제 없음'), '사무능력', '"문제 없음" is not a negation of the skill');
assert.equal(skills({}, '컴퓨터 가능하나 장시간 근무는 어려움'), '사무능력', 'a negation in the next clause does not cancel the skill');
assert.equal(skills({}, '포토샵은 어려움, 엑셀 가능'), '사무능력', 'one usable keyword of the group is enough');
assert.equal(skills({}, '보호자와 상담 후 결정'), '', 'a keyword of a skill the job does not ask for earns nothing');
assert.equal(skills({ jobRole: '포장' }, '컴퓨터 활용 가능'), '', 'the job side must ask for the skill too');
assert.equal(skills({ jobRole: '고객 상담' }, '성실함, 출퇴근 독립 가능'), '', 'a job title with a keyword does not give every seeker the bonus');
assert.equal(skills({ jobRole: '고객 상담' }, '전화 응대 경험 있음'), '고객응대');
assert.equal(skills({ jobRole: '고객 상담' }, '전화 응대 어려움'), '');
assert.equal(skills({ jobRole: '포장', requirements: '엑셀로 재고 입력' }, '엑셀 가능'), '사무능력', 'requirements text counts as the job side');
assert.equal(skills({ jobRole: '포장', jobDescription: '카페 음료 제조 보조' }, '바리스타 자격증 있음'), '바리스타', 'job description counts as the job side');
assert.equal(skills({ jobRole: '사무보조' }, 'oa 자격증 보유'), '사무능력', 'keywords are matched without regard to letter case');
assert.equal(skills({}, ''), '');
// 보너스는 점수에도 그대로 반영된다(부정 표현이면 보너스 없음).
const able = match({}, { notes: '컴퓨터 활용 가능' });
const unable = match({}, { notes: '컴퓨터 사용 어려움' });
assert.equal(Number((able.synergyBonus - unable.synergyBonus).toFixed(3)), 0.1);
assert.equal(Number((able.totalScore - unable.totalScore).toFixed(3)), 0.1);
console.log('PASS skill bonus: needs the skill on both the job and the seeker side, and ignores negated remarks');

// ─── 기존 동작 유지: 취업·서비스 제한 제외, 점수순 10명 ───
const many = Array.from({ length: 12 }, (_, index) => ({ ...baseSeeker, id: `s${index}`, desiredJob1: index < 3 ? '사무보조' : '생산' }));
const ranked = matchCandidates(baseJob, [...many, { ...baseSeeker, id: 'employed', status: '취업' }, { ...baseSeeker, id: 'limited', status: '서비스 제한' }]);
assert.equal(ranked.length, 10);
assert.equal(ranked.some(item => item.seeker.id === 'employed' || item.seeker.id === 'limited'), false);
assert.deepEqual(ranked.slice(0, 3).map(item => item.seeker.id).sort(), ['s0', 's1', 's2']);
assert.ok(ranked.every((item, index) => index === 0 || ranked[index - 1].totalScore >= item.totalScore));
console.log('PASS ranking: employed/limited seekers are excluded and the top ten are returned in score order');
