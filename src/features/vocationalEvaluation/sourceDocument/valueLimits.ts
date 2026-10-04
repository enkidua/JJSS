/**
 * 결과지 값의 허용 범위. AI 추출 직후·평가사가 고칠 때·확정 직전(차단 오류) 모두 이 검사를 거친다.
 * 범위는 실시요강이 정한 것만 강제한다:
 *  - 손기능 수행량: 핀이 크기별 40개이므로 0~40 정수
 *  - 다차원 부품: 수행량은 실시요강 분모(판 1, 나머지 4) 이내 정수, 총합 0~25
 *  - 다차원 분모: 결과지가 찍어 준 값이므로 1~4 정수면 받아들이고, 실시요강과 다르면 경고만 한다
 *  - 완성소요시간: 0~90초(1분 30초), "1분 20초" 같은 한글 표기 허용
 * 규준 표기값은 서식에 따라 다를 수 있어 0~100을 벗어나면 경고만 한다.
 */
import { bimanualPartSpecification, BIMANUAL_DURATION_SECONDS } from '../tests/keadBimanual';
import { parseKoreanDuration } from './review';

/** 요강 표2-1 — 핀은 크기별 40개다. 한 시행에서 이보다 많이 꽂을 수 없다. */
export const HAND_FUNCTION_MAX_SCORE = 40;

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export interface FactValueIssue {
    severity: 'ERROR' | 'WARNING';
    message: string;
}

/** null(빈 값)은 여기서 다루지 않는다 — 빈 값 처리는 MISSING_REQUIRED_VALUE가 맡는다. */
export function factValueIssue(path: string, value: string | number | null): FactValueIssue | null {
    if (value === null) return null;

    if (/^trials\.[A-Z_]+\.[A-Z_]+\.[123]$/.test(path)) {
        if (!isInt(value) || value < 0 || value > HAND_FUNCTION_MAX_SCORE) {
            return { severity: 'ERROR', message: `수행량은 0~${HAND_FUNCTION_MAX_SCORE} 정수여야 합니다(핀 ${HAND_FUNCTION_MAX_SCORE}개).` };
        }
        return null;
    }
    if (/^trials\..+\.reportedAverage$/.test(path)) {
        if (!isNumber(value) || value < 0 || value > HAND_FUNCTION_MAX_SCORE) {
            return { severity: 'ERROR', message: `평균은 0~${HAND_FUNCTION_MAX_SCORE} 범위의 숫자여야 합니다.` };
        }
        return null;
    }
    if (path.startsWith('bimanual.components.')) {
        const key = path.split('.')[2];
        const maximum = bimanualPartSpecification.components.find(component => component.key === key)?.maximum ?? 4;
        if (!isInt(value) || value < 0 || value > maximum) {
            return { severity: 'ERROR', message: `수행량은 0~${maximum} 정수여야 합니다(실시요강 분모).` };
        }
        return null;
    }
    if (path.startsWith('bimanual.componentDenominators.')) {
        const key = path.split('.')[2];
        const official = bimanualPartSpecification.components.find(component => component.key === key)?.maximum;
        const printedLimit = Math.max(...bimanualPartSpecification.components.map(component => component.maximum));
        if (!isInt(value) || value < 1 || value > printedLimit) {
            return { severity: 'ERROR', message: `분모는 1~${printedLimit} 정수여야 합니다(실시요강 부품 수).` };
        }
        // 공단 결과지는 부품 칸 분모를 모두 "/4"로 찍는다. 판은 실시요강상 1개뿐이어서
        // 인쇄된 분모 합계(28)와 인쇄된 총 도구수(25)가 어긋난다. 결과지를 그대로 옮긴 값이므로
        // 확정을 막지 않고, 평가사가 대조하도록 안내만 한다(총 도구수 25는 아래에서 그대로 강제한다).
        if (official !== undefined && value !== official) {
            return {
                severity: 'WARNING',
                message: `결과지에 인쇄된 분모(${value})가 실시요강 값(${official})과 다릅니다. 총 도구수 ${bimanualPartSpecification.reportedTotal} 기준으로 확인해 주세요.`,
            };
        }
        return null;
    }
    if (path === 'bimanual.reportedTotalCompleted') {
        if (!isInt(value) || value < 0 || value > bimanualPartSpecification.reportedTotal) {
            return { severity: 'ERROR', message: `총 수행량은 0~${bimanualPartSpecification.reportedTotal} 정수여야 합니다.` };
        }
        return null;
    }
    if (path === 'bimanual.reportedTotalTools') {
        if (value !== bimanualPartSpecification.reportedTotal) {
            return { severity: 'ERROR', message: `총 도구수는 실시요강 값(${bimanualPartSpecification.reportedTotal})이어야 합니다.` };
        }
        return null;
    }
    if (path === 'bimanual.recordedDurationMs') {
        const limit = BIMANUAL_DURATION_SECONDS * 1000;
        const ms = typeof value === 'string' ? parseKoreanDuration(value) : value;
        if (ms === null || !isNumber(ms) || ms < 0 || ms > limit) {
            return { severity: 'ERROR', message: `완성소요시간은 0초~${BIMANUAL_DURATION_SECONDS}초 범위여야 합니다.` };
        }
        return null;
    }
    if (path.startsWith('norms.')) {
        if (!isNumber(value)) {
            return { severity: 'WARNING', message: '규준 표기값이 숫자가 아닙니다. 결과지와 대조해 주세요.' };
        }
        if (value < 0 || value > 100) {
            return { severity: 'WARNING', message: '규준 표기값이 0~100을 벗어납니다. 결과지와 대조해 주세요.' };
        }
        return null;
    }
    return null;
}
