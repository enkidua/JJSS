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
    const cleanedString = str.replace(/만원|월|연|,/gi, "").trim();

    if (cleanedString.includes("~")) {
        const parts = cleanedString.split("~").map(p => parseFloat(p.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            min = Math.min(parts[0], parts[1]);
            max = Math.max(parts[0], parts[1]);
        }
    } else {
        const num = parseFloat(cleanedString);
        if (!isNaN(num)) {
            min = num;
            max = num;
        }
    }
    return { type: 'VALUE', min, max };
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
    const overlap = Math.max(0, Math.min(jobP.max!, seekP.max!) - Math.max(jobP.min!, seekP.min!));
    if (overlap > 0) return { score: 2, comment: "시간대 부합" };
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

function calculateSkillBonus(jobRoleText: string, seekerRemarksText: string) {
    if (!jobRoleText || !seekerRemarksText) return { bonus: 0, comment: '' };

    let bonus = 0;
    let matchedSkills: string[] = [];
    const combinedText = (jobRoleText + ' ' + seekerRemarksText).toLowerCase();

    for (const skill in SKILL_KEYWORDS) {
        if (SKILL_KEYWORDS[skill].some(keyword => combinedText.includes(keyword))) {
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
        const skill = calculateSkillBonus(jobOpening.jobRole, seeker.notes);
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
