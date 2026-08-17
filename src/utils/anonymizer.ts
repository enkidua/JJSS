/**
 * 개인정보 비식별화(마스킹) 및 재식별화(복원) 유틸리티
 */

export interface AnonymizeResult {
  maskedText: string;
  mapping: Record<string, string>;
}

export function anonymizeText(text: string): AnonymizeResult {
  const mapping: Record<string, string> = {};
  if (!text) return { maskedText: text, mapping };

  let maskedText = text;

  // 1. 이름 추출 및 치환 (이름: 홍길동 -> 이름: 김가명)
  // 이름이나 성명 뒤에 오는 2~4글자 한글을 이름으로 간주
  const nameIndicatorPattern = /(?:이름|성명)\s*:\s*([가-힣]{2,4})/g;
  let nameMatch;
  const namesFound = new Set<string>();
  while ((nameMatch = nameIndicatorPattern.exec(maskedText)) !== null) {
    namesFound.add(nameMatch[1]);
  }
  
  const aliasLastNames = ["김", "이", "박", "최", "정"];
  let nameCounter = 0;
  namesFound.forEach(name => {
    // 김가명, 이가명 등으로 치환
    const alias = aliasLastNames[nameCounter % aliasLastNames.length] + '가명' + (nameCounter >= aliasLastNames.length ? (Math.floor(nameCounter/aliasLastNames.length)+1) : '');
    mapping[alias] = name;
    // 해당 이름이 등장하는 모든 곳을 가명으로 치환
    maskedText = maskedText.split(name).join(alias);
    nameCounter++;
  });

  // 2. 나이 변환 (32세 -> 30대)
  const safeAgePattern = /(?:나이|연령)\s*:\s*([1-9][0-9]?)\b|([1-9][0-9]?)세\b/g;
  maskedText = maskedText.replace(safeAgePattern, (match, p1, p2) => {
    const exactAge = p1 || p2;
    const decade = Math.floor(parseInt(exactAge) / 10) * 10;
    const alias = `${decade}대`;
    
    // 원래 데이터가 '32'면 '32'로, '32세'면 '32세'로 복원되도록 하되
    // 출력 결과에서는 30대 -> 32세 가 되도록 매핑
    if (!mapping[alias]) {
      mapping[alias] = exactAge + (match.includes('세') ? '세' : ''); 
    }
    return match.replace(exactAge, alias).replace('세', '');
  });

  // 3. 주소 변환 (상세주소 가리고 시군구까지만 남기기)
  // 예: 서울특별시 마포구 아현동 123 -> 서울특별시 마포구
  const addressPattern = /(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|[가-힣]{2,4}도)\s+([가-힣]{2,5}[시군구])\s+([가-힣\d\s-]+?[동읍면리대로길]\s*[\d-]*)/g;
  maskedText = maskedText.replace(addressPattern, (match, p1, p2, p3) => {
    const simplified = `${p1} ${p2}`; 
    mapping[simplified] = match.trim();
    return simplified;
  });

  // 4. 전화번호 변환 (임의의 번호 010-0000-000X 로 설정)
  let phoneCounter = 1;
  const phonePattern = /\b(0[1-9][0-9]?)[-.\s]?([0-9]{3,4})[-.\s]?([0-9]{4})\b/g;
  maskedText = maskedText.replace(phonePattern, (match) => {
    const alias = `010-0000-${String(phoneCounter++).padStart(4, '0')}`;
    mapping[alias] = match;
    return alias;
  });

  // 5. 주민등록번호 변환 (YYMMDD-NNNNNNN 정밀 패턴)
  let ssnCounter = 1;
  const ssnPattern = /\b(\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]))\s*[-]\s*([1-4]\d{6})\b/g;
  maskedText = maskedText.replace(ssnPattern, (match) => {
    const alias = `000000-${String(ssnCounter++).padStart(7, '0')}`;
    mapping[alias] = match;
    return alias;
  });

  // 6. 이메일 변환
  let emailCounter = 1;
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  maskedText = maskedText.replace(emailPattern, (match) => {
    const alias = `user${emailCounter++}@example.com`;
    mapping[alias] = match;
    return alias;
  });

  // 장애유형(예: 지적장애, 자폐성장애)과 등급 등은 변환 안함

  return { maskedText, mapping };
}

export function deanonymizeText(text: string, mapping: Record<string, string>): string {
  if (!text || !mapping || Object.keys(mapping).length === 0) return text;
  
  let result = text;
  
  // 길이가 긴 alias부터 치환해야 부분 매칭으로 인한 복원 오류 방지 (예: 김가명11, 김가명1)
  const sortedAliases = Object.keys(mapping).sort((a, b) => b.length - a.length);

  for (const alias of sortedAliases) {
    const original = mapping[alias];
    const escapedMasked = alias.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    result = result.replace(new RegExp(escapedMasked, 'g'), original);
  }
  return result;
}
