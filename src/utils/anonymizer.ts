/**
 * 개인정보 비식별화(마스킹) 및 재식별화(복원) 유틸리티
 *
 * - 복원이 필요한 값(이름, 전화번호, 주민·외국인등록번호, 이메일, 생년월일)은 `⟦이름1⟧`처럼
 *   일반 글에 나오지 않는 고유 토큰으로 바꾸고, mapping에는 이 토큰만 담는다.
 * - 의료기관 이름(예: "행복정신건강의학과"의 "행복")과 진단·입원일 같은 건강 관련 날짜도 토큰으로 가린다.
 *   진료과·기관 종류(병원/의원/정신건강의학과)와 장애유형·장애 정도는 업무에 필요하므로 남긴다.
 * - 나이(32세 → 30대)와 상세 주소(→ 시·군·구까지)는 일반화만 하고 복원하지 않는다.
 *   AI가 쓴 "30대 이용자", "마포구 소재" 같은 일반 표현이 원문 값으로 바뀌는 일을 막기 위해서다.
 * - 이미 토큰으로 가린 부분(⟦…⟧)은 다시 건드리지 않는다. 같은 글을 두 번 가려도 안전하다.
 */

export interface AnonymizeOptions {
  /** 이용자·보호자·담당자 등 이미 알고 있는 이름 목록. 라벨이 없어도 본문 어디서든 이름 단위로 가린다. */
  knownNames?: string[];
}

export type AnonymizedCategory = '이름' | '전화' | '주민번호' | '이메일' | '생년월일' | '진단일' | '의료기관' | '나이' | '주소';

export interface AnonymizedItem {
  category: AnonymizedCategory;
  original: string;
  masked: string;
  /** true면 mapping에 들어 있어 deanonymizeText로 복원된다. 나이·주소는 일반화만 하므로 false. */
  restorable: boolean;
}

export interface AnonymizeResult {
  maskedText: string;
  /** 토큰 → 원문. deanonymizeText에 그대로 넘긴다. */
  mapping: Record<string, string>;
  /** 화면 표시용 치환 목록(복원하지 않는 일반화 항목 포함). */
  items: AnonymizedItem[];
}

const TOKEN_OPEN = '⟦';
const TOKEN_CLOSE = '⟧';
const TOKEN_SPLIT_PATTERN = /(⟦[^⟦⟧]*⟧)/;
const TOKEN_KEY_PATTERN = /^⟦[^⟦⟧\s]+⟧$/;
const EXISTING_TOKEN_PATTERN = /⟦([^⟦⟧\d\s]+)(\d+)⟧/g;

// 이름 뒤에 붙어도 "같은 이름"으로 보는 조사·호칭. 이 목록에 없는 한글이 바로 이어지면
// 더 긴 다른 단어(예: "김수" 뒤의 "김수현")로 보고 치환하지 않는다.
const NAME_FOLLOWERS = [
  '님', '씨', '은', '는', '이', '가', '을', '를', '의', '와', '과', '도', '만', '에게', '에', '께', '한테',
  '으로', '로', '랑', '하고', '부터', '까지', '보다', '처럼', '이다', '입니다', '이며', '이고', '였', '측',
  '선생', '팀장', '과장', '대리', '주임', '사원', '직원', '군', '양', '학생', '보호자', '이용자', '당사자',
  '어머니', '아버지', '어머님', '아버님', '훈련생', '참여자',
];
const NAME_FOLLOWER_PATTERN = NAME_FOLLOWERS.slice().sort((a, b) => b.length - a.length).join('|');

const COMMON_SURNAMES = new Set(Array.from(
  '김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예경봉',
));

// 이름처럼 보이지만 사람 이름이 아닌 흔한 낱말(라벨·호칭 탐지 오탐 방지)
const NAME_STOPWORDS = new Set([
  '이사장', '이용자', '위원장', '신청자', '지원자', '구직자', '조합원', '기관장', '주무관', '도우미', '연구원',
  '민원인', '장애인', '사용자', '사회자', '진행자', '발표자', '강연자', '참가자', '참석자', '수강생', '훈련생',
  '교육생', '봉사자', '후원자', '방문자', '신규자', '관리자', '대표자', '책임자', '보호자', '당사자', '상담자',
  '운영자', '작성자', '담당자', '부원장', '부회장', '고령자', '근로자', '참여자', '대상자', '내담자',
  '미정', '없음', '본인', '해당', '미기재', '미입력', '확인', '필요', '확인필요', '담당', '팀장', '직원',
  '어머니', '아버지', '부모', '보호', '이용', '대상', '기관', '센터', '복지관', '작성', '상담', '가족',
  // 의료 관련 일반 낱말(의사 이름 탐지 오탐 방지)
  '소견서', '진단서', '의견서', '처방전', '진료비', '정신과', '신경과', '소아과', '재활과', '한의사', '전문의',
  '주치의', '담당의', '진료의', '수련의', '전공의', '간호사', '치료사', '상담의', '의사', '소견', '진료',
]);

// "김선생님", "박팀장님"처럼 성+직함은 사람 이름으로 보지 않는다.
const TITLE_SUFFIXES = new Set([
  '선생', '팀장', '과장', '대리', '부장', '사장', '원장', '실장', '주임', '기사', '강사', '반장', '소장', '관장',
  '국장', '차장', '위원', '교수', '박사', '회장', '이사', '대표', '작가', '기자', '목사', '신부', '의사', '간호',
  '여사', '선배', '후배', '주무', '계장', '담임', '총무', '코치', '감독', '대장', '조장', '사원', '직원', '고객',
  '군수', '시장', '구청', '의원', '변호', '세무', '노무', '원생', '학생', '센터', '복지',
]);

const NAME_LABEL_PATTERN = /(?:이\s?름|성\s?명|성함|이용자명|대상자명|내담자명|참여자명|훈련생명|보호자\s?성명|보호자명|담당자명|작성자|상담자|상담사|담당자|보호자|사례관리자|이용자|대상자|내담자|참여자|훈련생|구직자|당사자|주치의|담당의|담당\s?의사|진료의|의사명|의사|전문의)\s*[:：]\s*([가-힣]{2,8})/g;
/**
 * 쌍점 없이 칸만 띄우는 서식용 이름 칸("이 름   홍길동  성 별  남성").
 * 공단 작업표본검사 결과지처럼 표를 글로 옮기면 쌍점이 사라져 위 패턴이 놓친다.
 *
 * 쌍점이 없으면 뒤에 오는 말이 값인지 확신할 수 없으므로 두 가지로 범위를 좁힌다.
 *  - 이름 칸임이 분명한 머리말만 쓴다("담당자", "보호자"처럼 문장에도 흔히 쓰는 말은 넣지 않는다).
 *  - 성씨로 시작하는 값만 이름으로 본다(아래 detectedNames 수집부에서 확인).
 * 한글 세 글자를 무조건 이름으로 보지 않는다.
 */
const NAME_FIELD_LABEL_PATTERN =
  /(?:이\s?름|성\s?명|성함|이용자명|대상자명|내담자명|참여자명|훈련생명|보호자\s?성명|보호자명|담당자명|의사명|평가사|평가자|검사자)(?:\s*[:：]\s*|\s+)([가-힣]{2,8})/g;
const HONORIFIC_NAME_PATTERN = /(?<![가-힣])([가-힣]{3})\s?(?:님|씨)/g;
const ROLE_NAME_PATTERN = /(?<![가-힣])([가-힣]{3})\s(?:이용자|보호자|당사자|훈련생|참여자|구직자|근로자|팀장|과장|대리|주임|선생님|사원|직원|원장|실장|부장|사장|대표|사회복지사|직업재활사|상담사|복지사)/g;
// 의사 이름: "홍길동 전문의", "홍길동 의사", "홍길동 주치의", "홍길동 교수님"
const DOCTOR_NAME_PATTERN = /(?<![가-힣])([가-힣]{3})\s?(?:전문의|주치의|담당의|의사(?!소통|결정|표현|표시)|교수|원장)/g;

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 주민등록번호·외국인등록번호: 앞 6자리는 날짜로 검증, 뒷자리 첫 숫자 1~8, 하이픈 선택, 일부 * 가림 허용
const RRN_PATTERN = /(?<![\d*])(\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))\s*-?\s*([1-8][\d*]{6})(?![\d*])/g;
const BIRTH_DATE_PATTERN = /((?:생년월일|생일|출생일)\s*[:：]?\s*)(\d{4}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}\s*일?|\d{2}\s*[.\-/]\s*\d{1,2}\s*[.\-/]\s*\d{1,2}|\d{8}(?!\d)|\d{6}(?!\d))/g;
// 진단·확진·발병·수술·입원·퇴원 날짜: "진단일: 2020.03.02", "2020년 3월 진단"
const HEALTH_DATE_VALUE = String.raw`\d{4}\s*[.\-/년]\s*\d{1,2}(?:\s*[.\-/월]\s*(?:\d{1,2}\s*일?)?)?|\d{4}\s*년`;
const HEALTH_EVENT = '(?:진단|확진|발병|수술|입원|퇴원)';
const LABELED_HEALTH_DATE_PATTERN = new RegExp(String.raw`(${HEALTH_EVENT}\s?(?:일자|일|날짜|시기|연월일)\s*[:：]?\s*)(${HEALTH_DATE_VALUE})`, 'g');
const DATED_HEALTH_EVENT_PATTERN = new RegExp(String.raw`(?<![\d])(${HEALTH_DATE_VALUE})(?=\s*(?:에|경|쯤)?\s*${HEALTH_EVENT})`, 'g');

// 의료기관 이름: 고유한 앞부분만 가리고 기관 종류(병원·의원·정신건강의학과 등)는 남긴다.
const MEDICAL_SUFFIX = '(?:대학교병원|대학병원|종합병원|요양병원|재활병원|정신병원|어린이병원|한방병원|병원|한의원|치과의원|치과병원|정신건강의학과의원|정신건강의학과|신경정신과의원|신경정신과|정신과의원|재활의학과의원|소아청소년과의원|의원|클리닉|보건소|정신건강복지센터)';
const MEDICAL_INSTITUTION_PATTERN = new RegExp(`(?<![가-힣A-Za-z0-9])([가-힣A-Za-z0-9]{2,15})(${MEDICAL_SUFFIX})`, 'g');
// 기관 이름이 아닌 일반 표현(예: "대학병원", "요양병원", "동네 의원", "국회의원")은 그대로 둔다.
const GENERIC_MEDICAL_PREFIXES = new Set([
  '대학', '대학교', '종합', '요양', '재활', '정신', '개인', '동네', '인근', '근처', '해당', '지역', '다른', '같은',
  '담당', '협력', '지정', '전문', '대형', '일반', '소아', '한방', '치과', '동물', '주변', '가까운', '이전', '기존',
  '현재', '상급', '국립', '시립', '도립', '구립', '공공', '민간', '거점', '관할', '여러', '어느', '협약', '연계',
  '입원', '외래', '주치', '부속', '대학부속', '정신건강', '국회', '지방', '광역', '기초', '다니는', '다니던', '큰',
  '작은', '대형종합', '상급종합', '1차', '2차', '3차', '각', '타', '본', '모', '의료', '치료', '진료', '방문',
]);

const MEDICAL_DEPARTMENT_TAIL = /(?:정신건강의학과|신경정신과|정신과|재활의학과|소아청소년과|가정의학과|신경과|내과|정형외과|신경외과|외과|이비인후과|안과|피부과|비뇨의학과|산부인과)$/;

const PHONE_PATTERN = /(?<![\d-])\(?(?:\+82[-.\s]?0?|0)(?:1[016789]|2|[3-6][1-5]|70|50\d?|80)\)?[-.\s]?\d{3,4}[-.\s]?\d{4}(?![\d-])/g;

// 나이: "32세", "35세 남성", "나이: 32세", "만 32세", "32살". "3세대", "21세기", "65세 이상" 같은 표현은 제외.
const AGE_UNIT_PATTERN = /(?<!\d)(?:만\s*)?(\d{1,2})\s*(?:세|살)(?!\s*(?:이상|이하|미만|초과|부터|까지))(?=$|[^가-힣]|[의로인이와과가는도에때쯤])/g;
const AGE_LABEL_PATTERN = /((?:나이|연령)\s*[:：]?\s*)(?:만\s*)?(\d{1,2})(?![\d.])(?!\s*(?:세|살|대|년|개월|월|일|시|명|%|점|회|kg|cm))/g;

const PROVINCE = '(?:서울(?:특별시|시)?|부산(?:광역시|시)?|대구(?:광역시|시)?|인천(?:광역시|시)?|광주(?:광역시|시)?|대전(?:광역시|시)?|울산(?:광역시|시)?|세종(?:특별자치시|시)?|제주(?:특별자치도|도)?|경기도?|강원(?:특별자치도|도)?|충청북도|충청남도|충북|충남|전라북도|전북(?:특별자치도)?|전라남도|전남|경상북도|경상남도|경북|경남)';
const ADDRESS_DETAIL = '(?:\\s+[가-힣\\d·.-]*[가-힣\\d](?:동|읍|면|리|로|길|가)(?:\\s*(?:산\\s*)?\\d+(?:-\\d+)?(?:\\s*(?:번길|번지|길))?)?)+(?:\\s*\\d+(?:-\\d+)?)?';
const ADDRESS_UNIT = '(?:\\s*,?\\s*[가-힣A-Za-z\\d]*(?:아파트|빌라|맨션|오피스텔|타운|하이츠|빌딩|주택))?(?:\\s*\\d+\\s*동)?(?:\\s*\\d+\\s*호)?(?:\\s*\\([가-힣\\d\\s,.-]*\\))?';
const ADDRESS_PATTERN = new RegExp(`(?<![가-힣])(${PROVINCE})\\s+([가-힣]{1,6}(?:시|군|구))(\\s+[가-힣]{1,6}구)?${ADDRESS_DETAIL}${ADDRESS_UNIT}`, 'g');
// 시·도 없이 "마포구 월드컵로 123"처럼 시작하는 주소(오탐을 줄이기 위해 구·군 + 도로/동 + 번지 숫자까지 있어야 함)
const DISTRICT_ADDRESS_PATTERN = new RegExp(`(?<![가-힣])([가-힣]{2,4}(?:구|군))((?:\\s+[가-힣\\d·.-]*[가-힣\\d](?:동|읍|면|리|로|길))+\\s*(?:산\\s*)?\\d+(?:-\\d+)?(?:\\s*(?:번길|길)\\s*\\d+(?:-\\d+)?)?(?:(?![\\d가-힣])|\\s*번지))${ADDRESS_UNIT}`, 'g');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 이미 가린 토큰(⟦…⟧)을 제외한 부분에만 변환을 적용한다. */
function mapOutsideTokens(text: string, transform: (segment: string) => string): string {
  return text
    .split(TOKEN_SPLIT_PATTERN)
    .map((part, index) => (index % 2 === 1 ? part : transform(part)))
    .join('');
}

function trailingSpace(value: string): string {
  return value.match(/\s*$/)?.[0] || '';
}

function ageBand(value: string): string {
  const age = Number.parseInt(value, 10);
  if (!Number.isFinite(age) || age < 10) return '10대 미만';
  return `${Math.floor(age / 10) * 10}대`;
}

function cleanLabeledName(raw: string): string | null {
  let name = raw;
  for (const suffix of ['입니다', '이며', '이고', '에게', '께서', '이다']) {
    if (name.length - suffix.length >= 2 && name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
      break;
    }
  }
  if (name.length >= 3 && /[님씨]$/.test(name)) name = name.slice(0, -1);
  if (name.length >= 4 && /[은는이가을를의와과도께]$/.test(name)) name = name.slice(0, -1);
  if (name.length < 2 || name.length > 4) return null;
  if (NAME_STOPWORDS.has(name)) return null;
  return name;
}

function looksLikePersonName(candidate: string): boolean {
  if (candidate.length !== 3) return false;
  if (!COMMON_SURNAMES.has(candidate[0])) return false;
  if (NAME_STOPWORDS.has(candidate)) return false;
  if (TITLE_SUFFIXES.has(candidate.slice(1))) return false;
  if (/[의을를에께와과도로는]$/.test(candidate)) return false;
  return true;
}

function normalizeKnownNames(names: unknown): string[] {
  if (!Array.isArray(names)) return [];
  const unique = new Set<string>();
  for (const value of names) {
    if (typeof value !== 'string') continue;
    const name = value.replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 30) continue;
    if (name.includes(TOKEN_OPEN) || name.includes(TOKEN_CLOSE)) continue;
    if (NAME_STOPWORDS.has(name)) continue;
    unique.add(name);
  }
  return [...unique];
}

export function anonymizeText(text: string, options: AnonymizeOptions = {}): AnonymizeResult {
  const mapping: Record<string, string> = {};
  const items: AnonymizedItem[] = [];
  if (!text || typeof text !== 'string') return { maskedText: text, mapping, items };

  // 입력에 이미 들어 있는 토큰 번호는 새 토큰에 쓰지 않는다(충돌 방지).
  const reservedTokens = new Set<string>(text.match(EXISTING_TOKEN_PATTERN) || []);
  const counters: Record<string, number> = {};
  const tokenByOriginal = new Map<string, string>();
  const generalizedSeen = new Set<string>();

  const tokenFor = (category: AnonymizedCategory, original: string): string => {
    const key = `${category}\u0000${original}`;
    const existing = tokenByOriginal.get(key);
    if (existing) return existing;
    let token = '';
    do {
      counters[category] = (counters[category] || 0) + 1;
      token = `${TOKEN_OPEN}${category}${counters[category]}${TOKEN_CLOSE}`;
    } while (reservedTokens.has(token) || mapping[token] !== undefined);
    tokenByOriginal.set(key, token);
    mapping[token] = original;
    items.push({ category, original, masked: token, restorable: true });
    return token;
  };

  const recordGeneralized = (category: AnonymizedCategory, original: string, masked: string) => {
    const key = `${category}\u0000${original}\u0000${masked}`;
    if (generalizedSeen.has(key) || original === masked) return;
    generalizedSeen.add(key);
    items.push({ category, original, masked, restorable: false });
  };

  let maskedText = text;

  // 1. 이메일
  maskedText = mapOutsideTokens(maskedText, segment => segment.replace(EMAIL_PATTERN, match => tokenFor('이메일', match)));

  // 2. 주민등록번호·외국인등록번호(전화번호보다 먼저 처리)
  maskedText = mapOutsideTokens(maskedText, segment => segment.replace(RRN_PATTERN, match => tokenFor('주민번호', match.trim())));

  // 3. 생년월일(라벨이 있을 때)
  maskedText = mapOutsideTokens(maskedText, segment => segment.replace(BIRTH_DATE_PATTERN, (_match, label: string, value: string) => (
    `${label}${tokenFor('생년월일', value.trim())}`
  )));

  // 3-1. 진단·입원 등 건강 관련 날짜
  maskedText = mapOutsideTokens(maskedText, segment => segment
    .replace(LABELED_HEALTH_DATE_PATTERN, (_match, label: string, value: string) => `${label}${tokenFor('진단일', value.trim())}${trailingSpace(value)}`)
    .replace(DATED_HEALTH_EVENT_PATTERN, (match: string) => `${tokenFor('진단일', match.trim())}${trailingSpace(match)}`));

  // 4. 전화번호
  maskedText = mapOutsideTokens(maskedText, segment => segment.replace(PHONE_PATTERN, match => tokenFor('전화', match)));

  // 5. 주소: 시·군·구까지 남기고 상세 주소는 지운다(복원하지 않음).
  maskedText = mapOutsideTokens(maskedText, segment => segment
    .replace(ADDRESS_PATTERN, (match: string, province: string, district: string, subDistrict?: string) => {
      const simplified = `${province} ${district}${subDistrict || ''}`;
      recordGeneralized('주소', match.trim(), simplified);
      return simplified;
    })
    .replace(DISTRICT_ADDRESS_PATTERN, (match: string, district: string) => {
      recordGeneralized('주소', match.trim(), district);
      return district;
    }));

  // 5-1. 의료기관 이름(고유한 앞부분만 토큰으로)
  maskedText = mapOutsideTokens(maskedText, segment => segment.replace(
    MEDICAL_INSTITUTION_PATTERN,
    (match: string, prefix: string, suffix: string) => {
      // "행복정신건강의학과의원"처럼 앞부분에 진료과가 붙어 있으면 진료과는 남기고 고유한 이름만 가린다.
      const department = prefix.match(MEDICAL_DEPARTMENT_TAIL);
      const namePart = department ? prefix.slice(0, -department[0].length) : prefix;
      const kept = department ? department[0] : '';
      if (!namePart || GENERIC_MEDICAL_PREFIXES.has(namePart) || /^\d+$/.test(namePart)) return match;
      return `${tokenFor('의료기관', namePart)}${kept}${suffix}`;
    },
  ));

  // 6. 나이: 10년 단위로 일반화(복원하지 않음).
  maskedText = mapOutsideTokens(maskedText, segment => segment
    .replace(AGE_UNIT_PATTERN, (match: string, age: string) => {
      const band = ageBand(age);
      recordGeneralized('나이', match.trim(), band);
      return band;
    })
    .replace(AGE_LABEL_PATTERN, (match: string, label: string, age: string) => {
      const band = ageBand(age);
      recordGeneralized('나이', match.slice(label.length).trim(), band);
      return `${label}${band}`;
    }));

  // 7. 이름: 알려진 이름 + 라벨("이름:", "보호자:") + 호칭("김철수 님") + 역할("김철수 이용자")
  const detectedNames = new Set<string>(normalizeKnownNames(options.knownNames));
  mapOutsideTokens(maskedText, segment => {
    for (const match of segment.matchAll(NAME_LABEL_PATTERN)) {
      const name = cleanLabeledName(match[1]);
      if (name) detectedNames.add(name);
    }
    for (const match of segment.matchAll(NAME_FIELD_LABEL_PATTERN)) {
      const name = cleanLabeledName(match[1]);
      // 쌍점이 있으면 값이 분명하다. 없으면 성씨로 시작하는 값만 이름으로 본다.
      if (!name) continue;
      if (/[:：]/.test(match[0]) || COMMON_SURNAMES.has(name[0])) detectedNames.add(name);
    }
    for (const pattern of [HONORIFIC_NAME_PATTERN, ROLE_NAME_PATTERN, DOCTOR_NAME_PATTERN]) {
      for (const match of segment.matchAll(pattern)) {
        if (looksLikePersonName(match[1])) detectedNames.add(match[1]);
      }
    }
    return segment;
  });

  const namesInText = [...detectedNames]
    .filter(name => maskedText.includes(name))
    .sort((a, b) => b.length - a.length);
  if (namesInText.length) {
    const namePattern = new RegExp(
      `(?<![가-힣A-Za-z0-9])(${namesInText.map(escapeRegExp).join('|')})(?=$|[^가-힣A-Za-z0-9]|(?:${NAME_FOLLOWER_PATTERN}))`,
      'g',
    );
    maskedText = mapOutsideTokens(maskedText, segment => segment.replace(namePattern, (name: string) => tokenFor('이름', name)));
  }

  // 장애유형(예: 지적장애, 자폐성장애)과 장애 정도, 진료과·기관 종류는 업무에 필요하므로 변환하지 않는다.
  return { maskedText, mapping, items };
}

function normalizeTokenKey(value: string): string {
  return value.replace(/[〚]/g, TOKEN_OPEN).replace(/[〛]/g, TOKEN_CLOSE).replace(/\s+/g, '');
}

/**
 * anonymizeText가 만든 고유 토큰(⟦…⟧)만 원문으로 되돌린다.
 * "30대", "서울특별시 마포구"처럼 토큰 모양이 아닌 키는 무시하므로, 일반화한 나이·주소나
 * AI가 새로 쓴 일반 표현은 바뀌지 않는다. 한 번에 치환하므로 복원된 글이 다시 치환되지도 않는다.
 */
export function deanonymizeText(text: string, mapping: Record<string, string>): string {
  if (!text || !mapping || typeof mapping !== 'object') return text;
  const lookup = new Map<string, string>();
  for (const [token, original] of Object.entries(mapping)) {
    if (typeof original !== 'string') continue;
    const key = normalizeTokenKey(token);
    if (TOKEN_KEY_PATTERN.test(key)) lookup.set(key, original);
  }
  if (!lookup.size) return text;
  return text.replace(/[⟦〚]\s*([^⟦⟧〚〛]{1,30}?)\s*[⟧〛]/g, (match: string) => lookup.get(normalizeTokenKey(match)) ?? match);
}
