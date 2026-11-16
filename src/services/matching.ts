import { Seeker, JobOpening, MatchResult, MatchDetails } from '../types/matching';

const ANY = "무관";
const NEGOTIABLE = "협의가능";

const SKILL_KEYWORDS: Record<string, string[]> = {
    '사무능력': ['컴퓨터', 'OA', '엑셀', '워드', '한글', '문서작성'],
    '디자인': ['포토샵', '일러스트', '디자인', '영상편집'],
    '바리스타': ['바리스타', '커피', '음료제조', '핸드드립'],
    '고객응대': ['상담', 'CS', '고객응대', '서비스', '전화']
};

const WEIGHTS_OFFICE = { JOB_ROLE: 0.40, SEVERITY: 0.15, SALARY: 0.20, LOCATION: 0.10, DISABILITY: 0.10, WORK_HOURS: 0.05 };
const WEIGHTS_FIELD = { JOB_ROLE: 0.30, SEVERITY: 0.25, SALARY: 0.15, LOCATION: 0.20, DISABILITY: 0.05, WORK_HOURS: 0.05 };

function parseCommaSeparated(text: string | null | undefined): string[] {
    if (!text) return [];
    return text.split(',').map(item => item.trim()).filter(Boolean);
}

function normalizeDisabilityTypeName(name: string | null | undefined): string {
    if (!name) return "";
    let normalized = name.trim().replace(/\s+/g, "");
    if (normalized.endsWith("장애")) {
        normalized = normalized.slice(0, -2);
    }
    return normalized;
}

function getSimpleStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    if (s1 === s2) return 1;
    if (s1.includes(s2) || s2.includes(s1)) return 0.7;
    return 0;
}

function parseDetailedLocation(locationString: string | null | undefined): Array<{ province: string | null, district: string | null }> {
    if (!locationString) return [];
    if (locationString.includes('재택')) return [{ province: '재택', district: '재택' }];
    const locations = parseCommaSeparated(locationString);
    const parsed: Array<{ province: string | null, district: string | null }> = [];
    const provinces = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

    locations.forEach(loc => {
        const parts = loc.trim().split(/\s+/);
        let province: string | null = null;
        let district: string | null = null;
        if (parts.length > 0) {
            const potentialProvince = provinces.find(p => parts[0].startsWith(p));
            if (potentialProvince) {
                province = potentialProvince;
                if (parts.length > 1) {
                    district = parts[1].replace(/(시|군|구)$/, '');
                }
            } else {
                province = '서울';
                district = parts[0].replace(/(시|군|구)$/, '');
            }
            parsed.push({ province, district });
        }
    });
    return parsed;
}

function parseSalary(salaryString: string | null | undefined) {
    if (!salaryString || salaryString.trim() === "") return { type: ANY, min: null, max: null };
    const str = salaryString.trim();
    if (str.includes("협의") || str.includes("결정")) return { type: NEGOTIABLE, min: null, max: null };
    if (str.includes("0원 이상")) return { type: ANY, min: 0, max: null };

    let min: number | null = null;
    let max: number | null = null;

    if (str.includes("~")) {
        const parts = str.split("~").map(parseSalaryAmount);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            min = Math.min(parts[0], parts[1]);
            max = Math.max(parts[0], parts[1]);
        }
    } else {
        const num = parseSalaryAmount(str);
        if (!isNaN(num)) {
            min = num;
            max = num;
        }
    }
    return { type: 'VALUE', min, max };
}

/**
 * 금액 한 토막을 "만원" 단위 숫자로 바꾼다.
 * 구인정보는 "250만원", 구직자는 "2,000,000원"처럼 단위가 섞여 들어오는데, 숫자만 떼어 비교하면 250과 2000000을 견주게 된다.
 * '만'이 붙어 있으면 만원 단위, 없는데 10만 이상이면 원 단위 월 임금으로 보고 만원으로 환산한다(단위 없는 "250"은 예전처럼 만원).
 * "10,030원"처럼 10만 원에 못 미치는 원 단위 금액은 시급·일급으로 보이므로 월 임금과 견주지 않는다(NaN → "정보 부족").
 */
function parseSalaryAmount(part: string): number {
    const hasManUnit = part.includes('만');
    const hasWonUnit = part.includes('원');
    const num = parseFloat(part.replace(/만원|만|월|연|,/gi, "").trim());
    if (isNaN(num)) return NaN;
    if (hasManUnit) return num;
    if (num >= 100000) return num / 10000;
    if (hasWonUnit || num >= 10000) return NaN;
    return num;
}

function parseWorkHours(hoursString: string | null | undefined) {
    if (!hoursString || hoursString.trim() === "" || hoursString.includes('협의')) return { min: null, max: null };
    const str = hoursString.trim().replace(/시간/g, '');
    if (str.includes('~')) {
        const parts = str.split('~');
        return { min: parseFloat(parts[0]), max: parseFloat(parts[1]) };
    } else {
        const h = parseFloat(str);
        return { min: h, max: h };
    }
}

function calculateDisabilityScore(jobDisabilityReq: string, seekerDisabilityType: string) {
    const mainJobReqs = parseCommaSeparated(jobDisabilityReq);
    const normalizedSeekerType = normalizeDisabilityTypeName(seekerDisabilityType);

    function parseDisabilityType(s: string) { return s.trim().replace(/\s*\(.*\)/, ""); }

    if (mainJobReqs.length === 0 || mainJobReqs.some(r => normalizeDisabilityTypeName(parseDisabilityType(r)) === normalizeDisabilityTypeName(ANY)))
        return { score: 2, comment: "모집유형 '무관'으로 적합" };

    if (!normalizedSeekerType) return { score: 0, comment: "구직자 정보 없음" };

    const matchFound = mainJobReqs.some(mainReq => {
        const typePartFromJob = parseDisabilityType(mainReq);
        const orTypesNormalized = typePartFromJob.split('/').map(t => normalizeDisabilityTypeName(t.trim())).filter(Boolean);
        return orTypesNormalized.some(nt => nt === normalizedSeekerType);
    });

    if (matchFound) return { score: 2, comment: "요구 유형과 일치" };
    return { score: 0, comment: `불일치 (요구: ${jobDisabilityReq})` };
}

function calculateSeverityMatchScore(jobSeverityReq: string, seekerSeverity: string) {
    const req = jobSeverityReq ? jobSeverityReq.trim() : ANY;
    const seek = seekerSeverity ? seekerSeverity.trim() : null;

    if (req === ANY) return { score: 2, comment: "조건 '무관'" };
    if (!seek) return { score: 0.5, comment: "구직자 정보 없음" };
    if (req === seek) return { score: 2, comment: "완전 일치" };
    if (req.includes("중증") && seek === "경증") return { score: 1, comment: "중증 요구에 경증 지원" };
    return { score: 0, comment: `불일치 (요구: ${req})` };
}

function calculateJobRoleScore(jobRolesRaw: string, seekerJob1: string, seekerJob2: string) {
    const jobRoles = parseCommaSeparated(jobRolesRaw);
    const seekerJobs = [seekerJob1, seekerJob2].filter(Boolean).map(String);

    if (jobRoles.length === 0) return { score: 1, comment: "회사 직무 정보 없음" };
    if (seekerJobs.length === 0) return { score: 0.5, comment: "구직자 희망 직종 없음" };

    let bestScore = 0;
    for (const sJob of seekerJobs) {
        for (const jRole of jobRoles) {
            const similarity = getSimpleStringSimilarity(sJob, jRole);
            if (similarity === 1) return { score: 2, comment: `완전 일치 (${sJob})` };
            if (similarity > bestScore) bestScore = similarity;
        }
    }
    if (bestScore > 0) return { score: 1.5, comment: "부분 일치" };
    return { score: 0, comment: "불일치" };
}

function calculateSalaryScore(jobSalaryRaw: string, seekerSalaryRaw: string) {
    const jobP = parseSalary(jobSalaryRaw);
    const seekP = parseSalary(seekerSalaryRaw);

    if (jobP.type === NEGOTIABLE || seekP.type === ANY || jobP.type === ANY) return { score: 2, comment: "협의 가능성 높음" };
    if (jobP.min === null || seekP.min === null) return { score: 0.5, comment: "정보 부족" };
    if (jobP.max! >= seekP.min!) return { score: 2, comment: "희망 임금 충족" };
    if (jobP.max! >= seekP.min! * 0.8) return { score: 1, comment: "희망 임금의 80% 이상" };
    return { score: 0, comment: "희망 임금과 차이 큼" };
}

function calculateWorkHoursScore(jobHoursRaw: string, seekerHoursRaw: string) {
    const jobP = parseWorkHours(jobHoursRaw);
    const seekP = parseWorkHours(seekerHoursRaw);

    if (!jobP.min || !seekP.min) return { score: 2, comment: "협의 가능" };
    // 끝 값을 읽지 못한 범위("9~")는 시작 값 하나로 본다.
    const jobMax = Number.isFinite(jobP.max) ? jobP.max! : jobP.min;
    const seekMax = Number.isFinite(seekP.max) ? seekP.max! : seekP.min;
    const low = Math.max(jobP.min, seekP.min);
    const high = Math.min(jobMax, seekMax);
    // "40시간"처럼 값 하나만 적은 쪽은 폭이 0이라 겹치는 길이로는 항상 0이 나온다.
    // 한쪽이라도 단일 값이면 그 값이 상대 범위 안에 들어가는지(같은 값 포함)로 판단한다.
    const singleValue = jobP.min === jobMax || seekP.min === seekMax;
    if (singleValue ? high >= low : high - low > 0) return { score: 2, comment: "시간대 부합" };
    return { score: 0, comment: "시간대 불일치" };
}

function calculateLocationScore(jobLocationsRaw: string, seekerLocationsRaw: string) {
    const jobLocations = parseDetailedLocation(jobLocationsRaw);
    const seekerLocations = parseDetailedLocation(seekerLocationsRaw);

    if (seekerLocations.some(l => l.province === '재택') || jobLocations.some(l => l.province === '재택')) {
        if (jobLocations.some(l => l.province === '재택') && seekerLocations.some(l => l.province === '재택'))
            return { score: 2, comment: "재택근무 일치" };
        else
            return { score: 1, comment: "한쪽 재택근무 희망" };
    }

    if (jobLocations.length === 0 || seekerLocations.length === 0) return { score: 0.5, comment: "지역 정보 부족" };

    let bestScore = 0;
    let bestComment = "불일치";
    for (const sLoc of seekerLocations) {
        for (const jLoc of jobLocations) {
            if (sLoc.province === jLoc.province) {
                if (sLoc.district && jLoc.district && sLoc.district === jLoc.district) {
                    return { score: 2, comment: `완전 일치 (${sLoc.province} ${sLoc.district})` };
                }
                if (bestScore < 1) {
                    bestScore = 1;
                    bestComment = `부분 일치 (${sLoc.province})`;
                }
            }
        }
    }
    return { score: bestScore, comment: bestComment };
}

function calculateSynergyScore(details: MatchDetails, jobOpening: JobOpening, seeker: Seeker) {
    let bonus = 0;
    let comments: string[] = [];
    const jr = String(jobOpening.jobRole || '');
    const disType = normalizeDisabilityTypeName(seeker.disabilityType || '');
    const severity = String(seeker.severity || '');

    if (jr.includes('재택') && ['지체', '뇌병변'].includes(disType)) {
        bonus += 0.3; comments.push("재택근무&장애유형");
    }
    if (jr.includes('사무') && severity === '경증') {
        bonus += 0.1; comments.push("사무직&경증");
    }
    if (details.jobRole.score === 2 && details.salary.score === 2) {
        bonus += 0.15; comments.push("핵심희망(직무/임금)");
    }
    return { bonus, comment: comments.join(', ') };
}

/** 구인정보 쪽에서 그 역량을 요구한다고 볼 직무 낱말(직무명에는 "엑셀" 같은 도구 이름이 잘 나오지 않는다). */
const SKILL_JOB_HINTS: Record<string, string[]> = {
    '사무능력': ['사무', '행정', '전산'],
    '디자인': ['디자인'],
    '바리스타': ['바리스타', '카페', '커피'],
    '고객응대': ['고객', '응대', '상담', '안내', '접수'],
};

/** 키워드 바로 뒤에 붙어 "못 한다"는 뜻을 만드는 말 */
const SKILL_NEGATIONS = ['어려', '어렵', '불가', '못함', '못 함', '못하', '못 하', '못한', '없음', '없다', '없어', '없는', '안됨', '안 됨', '미숙', '서툴', '서툼', '부족', '힘들', '힘듦', '곤란', '제한'];
/** "문제 없음", "어려움 없음"은 부정어가 들어 있어도 할 수 있다는 뜻이다 */
const NO_PROBLEM = /(문제|지장|무리|어려움|불편|제한)\s*(이|은|는|도)?\s*없/;
/** 여기서 문장(절)이 끊기므로 그 뒤의 부정어는 이 키워드에 대한 말이 아니다 */
const CLAUSE_BREAK = /[.,;!?\n/·()]|지만|는데|(?:하나|으나|이나|며)(?=\s)/;

/**
 * 구직자 비고에 그 역량이 "할 수 있다"는 뜻으로 적혀 있는지.
 * "컴퓨터 사용 어려움"처럼 키워드 바로 뒤에 부정어가 붙으면 역량으로 치지 않는다.
 * 같은 묶음의 키워드가 한 번이라도 부정 없이 나오면 인정한다("엑셀 가능, 포토샵은 어려움").
 */
function seekerHasSkill(seekerText: string, keywords: string[]): boolean {
    return keywords.some(keyword => {
        let from = 0;
        for (;;) {
            const at = seekerText.indexOf(keyword, from);
            if (at < 0) return false;
            const after = seekerText.slice(at + keyword.length, at + keyword.length + 12).split(CLAUSE_BREAK)[0];
            if (NO_PROBLEM.test(after) || !SKILL_NEGATIONS.some(word => after.includes(word))) return true;
            from = at + keyword.length;
        }
    });
}

function calculateSkillBonus(jobText: string, seekerRemarksText: string) {
    if (!jobText || !seekerRemarksText) return { bonus: 0, comment: '' };

    let bonus = 0;
    let matchedSkills: string[] = [];
    // 구인정보와 구직자 비고를 한 덩어리로 합쳐 찾으면, 직무명에 "상담"이 들어간 구인에는 비고가 있는 모든 구직자가 보너스를 받고
    // 비고의 "컴퓨터 사용 어려움"도 사무능력으로 잡힌다. 그래서 구인 쪽이 그 역량을 요구하고, 구직자 쪽에 그 역량이 있을 때만 준다.
    const jobSide = jobText.toLowerCase();
    const seekerSide = seekerRemarksText.toLowerCase();

    for (const skill in SKILL_KEYWORDS) {
        const keywords = SKILL_KEYWORDS[skill].map(keyword => keyword.toLowerCase());
        const jobRequires = [...keywords, ...(SKILL_JOB_HINTS[skill] || [])].some(keyword => jobSide.includes(keyword));
        if (jobRequires && seekerHasSkill(seekerSide, keywords)) {
            bonus += 0.1;
            matchedSkills.push(skill);
        }
    }
    return { bonus: Math.min(bonus, 0.3), comment: matchedSkills.join(', ') };
}

export function matchCandidates(jobOpening: JobOpening, seekersList: Seeker[]): MatchResult[] {
    const matchedCandidates: MatchResult[] = [];
    const jobRoleKeywords = String(jobOpening.jobRole || '').toLowerCase();

    let currentWeights = WEIGHTS_OFFICE;
    let weightProfileName = "사무직";

    if (jobRoleKeywords.includes('생산') || jobRoleKeywords.includes('현장') || jobRoleKeywords.includes('미화') || jobRoleKeywords.includes('조리')) {
        currentWeights = WEIGHTS_FIELD;
        weightProfileName = "현장직";
    }

    seekersList.forEach(seeker => {
        // 필터링: 활동 중인 구직자만 (취업, 서비스 제한 제외)
        const status = String(seeker.status || '').trim();
        if (['취업', '서비스 제한', '서비스제한'].includes(status)) return;

        const details: MatchDetails = {
            jobRole: calculateJobRoleScore(jobOpening.jobRole, seeker.desiredJob1, seeker.desiredJob2),
            severity: calculateSeverityMatchScore(jobOpening.reqSeverity, seeker.severity),
            salary: calculateSalaryScore(jobOpening.salary, seeker.desiredSalary),
            location: calculateLocationScore(jobOpening.location, seeker.desiredLocation),
            disability: calculateDisabilityScore(jobOpening.reqDisabilityType, seeker.disabilityType),
            workHours: calculateWorkHoursScore(jobOpening.workHours, seeker.desiredWorkHours)
        };

        const synergy = calculateSynergyScore(details, jobOpening, seeker);
        // 구인 쪽 요구는 직무명뿐 아니라 직무내용·요구조건에도 적혀 있다.
        const jobSkillText = [jobOpening.jobRole, jobOpening.jobDescription, jobOpening.requirements].filter(Boolean).join(' ');
        const skill = calculateSkillBonus(jobSkillText, seeker.notes);
        synergy.bonus += skill.bonus;
        if (skill.comment) synergy.comment = [synergy.comment, `역량(${skill.comment})`].filter(Boolean).join(' | ');

        let penaltyFactor = 1.0;
        let penaltyComments: string[] = [];
        const isDisabilityStrict = jobOpening.reqDisabilityType && !String(jobOpening.reqDisabilityType).includes(ANY);
        const isSeverityStrict = jobOpening.reqSeverity && !String(jobOpening.reqSeverity).includes(ANY);

        if (isDisabilityStrict && details.disability.score === 0) {
            penaltyFactor *= 0.3; penaltyComments.push("필수 장애유형 불일치");
        }
        if (isSeverityStrict && details.severity.score === 0) {
            penaltyFactor *= 0.5; penaltyComments.push("필수 장애정도 불일치");
        }

        const baseScore =
            (details.jobRole.score * currentWeights.JOB_ROLE) +
            (details.severity.score * currentWeights.SEVERITY) +
            (details.salary.score * currentWeights.SALARY) +
            (details.location.score * currentWeights.LOCATION) +
            (details.disability.score * currentWeights.DISABILITY) +
            (details.workHours.score * currentWeights.WORK_HOURS);

        const penalizedBaseScore = baseScore * penaltyFactor;
        const totalScore = penalizedBaseScore + synergy.bonus;

        let combinedComment = `[가중치 프로필: ${weightProfileName}]\n`;
        if (penaltyComments.length > 0) { combinedComment += `[페널티 적용: ${penaltyComments.join(', ')}]\n`; }
        if (synergy.comment) { combinedComment += `[시너지/역량: ${synergy.comment}]\n`; }
        combinedComment += `구직자 비고: ${seeker.notes || '없음'}`;

        matchedCandidates.push({
            seeker,
            job: jobOpening,
            totalScore: parseFloat(totalScore.toFixed(3)),
            baseScore: parseFloat(baseScore.toFixed(3)),
            synergyBonus: synergy.bonus,
            details,
            combinedComment
        });
    });

    matchedCandidates.sort((a, b) => b.totalScore - a.totalScore);
    return matchedCandidates.slice(0, 10);
}
