// 비식별화(anonymizer) 단위 테스트. 모든 이름·번호는 합성 데이터이며 네트워크를 사용하지 않는다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const sourceUrl = new URL('../src/utils/anonymizer.ts', import.meta.url);
const compiled = ts.transpileModule(await readFile(sourceUrl, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: sourceUrl.pathname,
}).outputText;
const { anonymizeText, deanonymizeText } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

let passed = 0;
function test(name, run) {
    run();
    passed += 1;
    console.log(`PASS ${name}`);
}

test('기존 호출 형태(인자 1개)와 반환 형태 유지', () => {
    const result = anonymizeText('이름: 가나다 연락처 010-1111-2222');
    assert.equal(typeof result.maskedText, 'string');
    assert.equal(typeof result.mapping, 'object');
    assert.ok(Array.isArray(result.items));
    assert.deepEqual(anonymizeText(''), { maskedText: '', mapping: {}, items: [] });
});

test('라벨 이름과 본문 반복 등장 이름을 같은 고유 토큰으로 치환', () => {
    const { maskedText, mapping } = anonymizeText('이름: 홍가람\n홍가람 님은 성실하게 참여함. 홍가람이 먼저 인사함.');
    assert.equal(maskedText.includes('홍가람'), false);
    const tokens = Object.keys(mapping);
    assert.equal(tokens.length, 1);
    assert.match(tokens[0], /^⟦이름\d+⟧$/);
    assert.equal(mapping[tokens[0]], '홍가람');
    assert.equal(maskedText.split(tokens[0]).length - 1, 3);
});

test('knownNames: 라벨 없는 본문 이름, 보호자·담당자 이름도 치환', () => {
    const text = '오늘 박소라 이용자와 상담함. 보호자 최은결 씨가 동행함. 담당 윤다온 선생님이 기록함.';
    const { maskedText, mapping } = anonymizeText(text, { knownNames: ['박소라', '최은결', '윤다온'] });
    for (const name of ['박소라', '최은결', '윤다온']) assert.equal(maskedText.includes(name), false, name);
    assert.equal(Object.keys(mapping).length, 3);
    assert.equal(deanonymizeText(maskedText, mapping), text);
});

test('부분 이름 안전: "김수"가 "김수현"을 바꾸지 않고, 긴 이름을 먼저 치환', () => {
    const text = '김수현 님과 김수가 함께 옴. 김수는 먼저 퇴근함.';
    const { maskedText, mapping } = anonymizeText(text, { knownNames: ['김수', '김수현'] });
    const tokenOf = name => Object.keys(mapping).find(token => mapping[token] === name);
    assert.ok(tokenOf('김수현'));
    assert.ok(tokenOf('김수'));
    assert.equal(maskedText.includes('김수'), false);
    assert.equal(deanonymizeText(maskedText, mapping), text);

    const onlyShort = anonymizeText('김수현이라는 이름표를 붙임. 김수현정 카페.', { knownNames: ['김수'] });
    assert.equal(onlyShort.maskedText, '김수현이라는 이름표를 붙임. 김수현정 카페.');
    assert.deepEqual(onlyShort.mapping, {});
});

test('나이: "나이: 32세", "35세 남성", "32살"을 10년 단위로 일반화', () => {
    assert.equal(anonymizeText('나이: 32세').maskedText, '나이: 30대');
    assert.equal(anonymizeText('35세 남성 구직자').maskedText, '30대 남성 구직자');
    assert.equal(anonymizeText('올해 32살이 됨').maskedText, '올해 30대이 됨');
    assert.equal(anonymizeText('나이: 47').maskedText, '나이: 40대');
    assert.equal(anonymizeText('만 29세의 이용자').maskedText, '20대의 이용자');
});

test('나이 오탐 방지: 세대·세기·기준 연령·금액은 그대로', () => {
    for (const text of ['3세대 가족', '21세기 일자리', '만 65세 이상 대상', '18세 미만 제외', '세금 32만원']) {
        assert.equal(anonymizeText(text).maskedText, text, text);
    }
});

test('일반화한 나이·주소는 mapping에 넣지 않고 복원하지 않음', () => {
    const { maskedText, mapping, items } = anonymizeText('나이: 32세, 주소: 서울특별시 마포구 아현동 123-4');
    assert.equal(maskedText, '나이: 30대, 주소: 서울특별시 마포구');
    assert.deepEqual(mapping, {});
    assert.ok(items.some(item => item.category === '나이' && item.restorable === false));
    assert.ok(items.some(item => item.category === '주소' && item.original.includes('아현동') && item.restorable === false));
});

test('deanonymize가 AI가 쓴 "30대", "마포구" 같은 일반 표현을 바꾸지 않음', () => {
    const { mapping } = anonymizeText('이름: 한도윤, 나이: 32세, 주소: 서울특별시 마포구 아현동 12');
    const aiOutput = '⟦이름1⟧ 님은 30대 이용자로 서울특별시 마포구 소재 사업체를 희망함. 마포구 인근 30대 동료와 협업 가능.';
    const restored = deanonymizeText(aiOutput, mapping);
    assert.equal(restored, '한도윤 님은 30대 이용자로 서울특별시 마포구 소재 사업체를 희망함. 마포구 인근 30대 동료와 협업 가능.');
    // 예전 형식의 매핑(일반 명사 키)이 들어와도 토큰이 아니면 무시한다.
    assert.equal(deanonymizeText('30대 이용자, 마포구 소재', { '30대': '32세', '서울특별시 마포구': '서울특별시 마포구 아현동 12' }), '30대 이용자, 마포구 소재');
});

test('deanonymize: 토큰 안 공백·유사 괄호 허용, 모르는 토큰은 유지, 한 번만 치환', () => {
    const mapping = { '⟦이름1⟧': '⟦이름2⟧', '⟦이름2⟧': '서하늘' };
    assert.equal(deanonymizeText('⟦ 이름1 ⟧ / 〚이름2〛 / ⟦이름9⟧', mapping), '⟦이름2⟧ / 서하늘 / ⟦이름9⟧');
});

test('주민등록번호: 하이픈 유무, 뒷자리 1~4', () => {
    const { maskedText, mapping } = anonymizeText('주민번호 900101-1234567, 붙여쓰기 9001012234567');
    assert.equal(maskedText.includes('900101'), false);
    assert.equal(Object.values(mapping).filter(value => value.startsWith('900101')).length, 2);
});

test('외국인등록번호: 뒷자리 5~8 및 일부 가림 형식', () => {
    const { maskedText, mapping } = anonymizeText('외국인등록번호 850315-5123456 / 850315-6****** / 8503157123456');
    assert.equal(/\d{6}/.test(maskedText), false, maskedText);
    assert.equal(Object.keys(mapping).length, 3);
    assert.ok(Object.keys(mapping).every(token => token.startsWith('⟦주민번호')));
});

test('날짜로 불가능한 13자리 숫자는 주민번호로 보지 않음', () => {
    assert.equal(anonymizeText('문서번호 9913451234567').maskedText, '문서번호 9913451234567');
});

test('전화번호·이메일·생년월일 토큰화와 정확한 복원', () => {
    const text = '연락처 010-1234-5678, 집 (02) 123-4567, 메일 sample.user@example.org, 생년월일: 1990.01.02';
    const { maskedText, mapping } = anonymizeText(text);
    for (const value of ['010-1234-5678', '123-4567', 'sample.user@example.org', '1990.01.02']) {
        assert.equal(maskedText.includes(value), false, value);
    }
    assert.ok(Object.keys(mapping).some(token => token.startsWith('⟦전화')));
    assert.ok(Object.keys(mapping).some(token => token.startsWith('⟦이메일')));
    assert.ok(Object.keys(mapping).some(token => token.startsWith('⟦생년월일')));
    assert.equal(deanonymizeText(maskedText, mapping), text);
});

test('주소: 도로명·동 상세 주소를 시·군·구까지 줄임', () => {
    assert.equal(anonymizeText('경기도 수원시 팔달구 인계동 1122 행복아파트 101동 1203호 거주').maskedText, '경기도 수원시 팔달구 거주');
    assert.equal(anonymizeText('서울 마포구 월드컵로 12길 34에서 출근').maskedText, '서울 마포구에서 출근');
    assert.equal(anonymizeText('마포구 월드컵로 123 근처').maskedText, '마포구 근처');
    assert.equal(anonymizeText('희망지역: 서울 마포구').maskedText, '희망지역: 서울 마포구');
});

test('주소 오탐 방지: 일반 문장은 바꾸지 않음', () => {
    for (const text of ['친구 집으로 2번 방문함', '실시 사무실로 1회 방문', '연구 도로 3건']) {
        assert.equal(anonymizeText(text).maskedText, text, text);
    }
});

test('호칭·역할 탐지: "김철수 님", "이도훈 이용자"; 직함·일반 단어는 제외', () => {
    const { maskedText } = anonymizeText('정하윤 님과 이도훈 이용자가 참석함. 김선생님, 박팀장님, 선생님, 고객님, 장애인 이용자.');
    assert.equal(maskedText.includes('정하윤'), false);
    assert.equal(maskedText.includes('이도훈'), false);
    for (const word of ['김선생님', '박팀장님', '선생님', '고객님', '장애인 이용자']) assert.ok(maskedText.includes(word), word);
});

test('쌍점 없이 칸만 띄운 이름 칸(공단 결과지 서식)도 가리고, 본문 반복 등장까지 함께 가린다', () => {
    // 공단 작업표본검사 결과지를 글로 옮기면 "이 름: 홍길동"이 아니라 "이 름 홍길동"이 된다.
    const sheet = [
        '이 름 서하람 성 별 남성 생년월일 1988.01.02 나 이 만 38세',
        '소 속 장애인복지관 장애유형 지체장애 우세손 왼손 검사일 2026.09.06',
        '평가사 도경한 담당기관',
        '( 서하람 )님은 1분 30초동안 ( 20 )개를 조립하였고',
    ].join(String.fromCharCode(10));
    const { maskedText } = anonymizeText(sheet);
    assert.equal(maskedText.includes('서하람'), false, '이름 칸 값이 남았다');
    assert.equal(maskedText.includes('도경한'), false, '평가사 이름이 남았다');
    // 괄호 안에 다시 나오는 이름도 같이 가려야 한다(본문 반복 등장).
    assert.equal((maskedText.match(/⟦이름\d+⟧/g) || []).length >= 3, true, '본문 반복 등장 이름이 남았다');
    // 검사에 필요한 값은 그대로 둔다.
    for (const keep of ['남성', '지체장애', '왼손', '2026.09.06', '1분 30초', '20']) {
        assert.ok(maskedText.includes(keep), keep);
    }
});

test('쌍점 없는 이름 칸 오탐 방지: 값이 아닌 일반 낱말은 가리지 않는다', () => {
    const text = '이름 확인이 필요합니다. 성명 미상으로 접수됨. 평가사 소견 작성 예정. 이름표시 방식 협의.';
    assert.equal(anonymizeText(text).maskedText, text);
});

test('이미 가린 토큰은 다시 가리지 않고, 기존 토큰 번호와 충돌하지 않음', () => {
    const first = anonymizeText('이름: 문가온 010-2222-3333');
    const second = anonymizeText(first.maskedText, { knownNames: ['문가온'] });
    assert.equal(second.maskedText, first.maskedText);
    assert.deepEqual(second.mapping, {});

    const withExisting = anonymizeText('⟦이름1⟧ 문서 참고. 이름: 도하람');
    const newToken = Object.keys(withExisting.mapping)[0];
    assert.notEqual(newToken, '⟦이름1⟧');
    assert.equal(withExisting.mapping[newToken], '도하람');
    assert.equal(deanonymizeText(withExisting.maskedText, withExisting.mapping), '⟦이름1⟧ 문서 참고. 이름: 도하람');
});

test('장애유형·일반 업무 문장은 그대로 유지', () => {
    const text = '지적장애 중증, 바리스타 직무 희망. 출퇴근 지원 필요.';
    assert.equal(anonymizeText(text).maskedText, text);
});

test('건강정보 최소화: 의료기관 고유 이름·의사 이름·진단/입원일은 토큰, 진료과·장애유형은 유지, 복원 가능', () => {
    const text = '행복정신건강의학과의원에서 김민준 전문의에게 2020년 3월 진단받음. 진단일: 2020.03.02, 2021.05.01 입원. 지적장애 중증.';
    const { maskedText, mapping } = anonymizeText(text);
    for (const value of ['행복', '김민준', '2020년 3월', '2020.03.02', '2021.05.01']) assert.equal(maskedText.includes(value), false, value);
    for (const kept of ['정신건강의학과의원', '전문의', '진단받음', '입원', '지적장애 중증']) assert.ok(maskedText.includes(kept), kept);
    assert.ok(Object.keys(mapping).some(token => token.startsWith('⟦의료기관')));
    assert.ok(Object.keys(mapping).some(token => token.startsWith('⟦진단일')));
    assert.equal(deanonymizeText(maskedText, mapping), text);
    assert.match(anonymizeText('주치의: 박서연').maskedText, /^주치의: ⟦이름\d+⟧$/);
});

test('건강정보 오탐 방지: 일반 의료 표현과 진료과 이름은 그대로', () => {
    for (const text of ['요양병원 입원 경험 있음', '대학병원 외래 진료', '동네 의원 방문', '정신건강의학과 진료 중', '정신과 전문의 소견서 참고', '국회의원 선거', '의사소통 지원 필요', '2022년 입사']) {
        assert.equal(anonymizeText(text).maskedText, text, text);
    }
});

console.log(`anonymizer tests passed (${passed}) — synthetic data only, no network.`);
