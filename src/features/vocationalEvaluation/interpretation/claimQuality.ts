/**
 * AI 제안 품질 검사. VE Assist `src/domain/claimQuality.ts`를 **규칙을 완화하지 않고** 이식했다.
 *
 * INVALID이면 채택할 수 없고, REVIEW_REQUIRED이면 평가사가 확인해야 한다.
 * 막는 것: 진단·취업 가능·직무 적합 단정, 백분위·순위 생성, 근거에 없는 수치,
 * 검사조건만으로 능력 추론, 미평가를 문제없음으로 확대, 기록시간으로 전체 완료 추론.
 */
import { allEvidence, type AiClaim, type EvidencePackage, type InterpretationEvidence, type QualityResult } from './types';

const CAUTIOUS = /추가.{0,8}확인|확인할 필요|여부를 확인|참고|고려|가능성/;

const observed = (evidence: InterpretationEvidence) =>
    evidence.type === 'EVENT' ||
    (evidence.type === 'OBSERVATION' && (evidence.semanticTags ?? []).includes('status:observed'));

const hasTag = (items: InterpretationEvidence[], ...tags: string[]) =>
    items.some(item => (item.semanticTags ?? []).some(tag => tags.includes(tag)));

export function validateClaim(
    claim: Pick<AiClaim, 'text' | 'evidenceIds' | 'claimType'>,
    pack: EvidencePackage,
): QualityResult {
    const issues: string[] = [];
    const evidence = allEvidence(pack);
    const selected = evidence.filter(item => claim.evidenceIds.includes(item.id));
    let invalid = false;
    const reject = (message: string) => {
        invalid = true;
        issues.push(message);
    };

    if (!claim.evidenceIds.length || selected.length !== new Set(claim.evidenceIds).size) {
        reject('현재 근거에 없는 근거 ID');
    }
    const text = claim.text.normalize('NFKC');
    const source = selected.filter(item => item.type === 'SOURCE_FACT');
    const derived = selected.filter(item => item.type === 'DERIVED_FACT');
    const behavioral = selected.filter(observed);

    if (
        ['RESULT_DESCRIPTION', 'RELATIVE_STRENGTH'].includes(claim.claimType) &&
        !selected.some(item => item.type === 'SOURCE_FACT' || item.type === 'DERIVED_FACT')
    ) {
        reject('결과 설명을 뒷받침하는 측정값·비교 근거 없음');
    }
    if (claim.claimType === 'RELATIVE_STRENGTH' && !derived.length && source.length < 2) {
        reject('상대적 강점에는 비교 패턴 또는 비교 가능한 측정값 2개 이상이 필요함');
    }
    if (claim.claimType === 'SUPPORT_NEED') {
        if (/지원(이|은|가)?\s*(필요|요구)|도움(이|은|가)?\s*필요/.test(text) && !CAUTIOUS.test(text)) {
            reject('지원 필요를 단정하지 말고 추가 확인 수준으로 표현해야 함');
        }
        if (!behavioral.length && !(derived.length && CAUTIOUS.test(text))) {
            reject('지원 고려에는 관찰·사건 또는 신중한 추가 확인 표현과 비교 패턴이 필요함');
        }
    }
    if (claim.claimType === 'VOCATIONAL_CONSIDERATION') {
        if (
            !selected.some(
                item =>
                    item.type === 'DERIVED_FACT' ||
                    observed(item) ||
                    item.type === 'SESSION_CONDITION' ||
                    item.semanticType === 'INTERPRETATION_LIMITATION',
            )
        ) {
            reject('직무 고려사항을 뒷받침하는 패턴·행동관찰·검사조건·제한 근거 없음');
        }
        if (!CAUTIOUS.test(text)) issues.push('직무 고려사항은 추가 확인·참고·고려 수준의 표현 필요');
    }
    if (
        claim.claimType === 'LIMITATION' &&
        !selected.some(
            item =>
                item.type === 'SESSION_CONDITION' ||
                item.type === 'TEST_METADATA' ||
                item.semanticType === 'INTERPRETATION_LIMITATION',
        )
    ) {
        issues.push('검사조건 또는 자료 제한 근거를 함께 확인해 주세요.');
    }

    const conditions = selected.filter(item => item.type === 'SESSION_CONDITION');
    if (
        conditions.length &&
        /능력.{0,12}(낮|저하|부족|저조|떨어|향상)|지시\s*이해.{0,12}(낮|저하|부족|어려)|지원.{0,8}효과|수행.{0,8}(개선|향상)/.test(
            text,
        )
    ) {
        reject('검사조건만으로 능력 수준·지원 효과를 추론할 수 없음');
    }
    // 정규식은 방어선의 한 겹일 뿐 완전하지 않다. 표현을 바꾼 우회가 확인되면 여기에 패턴을 추가하고
    // 회귀 테스트(test-ve-workbench)에 그 문장을 남긴다.
    if (
        /(취업|고용|채용).{0,12}(가능|불가능|어렵|힘들)|직무.{0,12}(적합|부적합)|(조립|포장|생산|제조|사무|물류|청소|배송|서비스|가공)\s*(원|직|직무|업무|작업|라인)[^.]{0,10}(적합|추천|권장|우선\s*고려|알맞|맞겠)|(주의력|집중력)\s*(장애|결핍)|(결핍|장애|증후군|과잉행동|저하증|우울|불안)[가-힣\s]{0,6}의심|진단|정상\s*범위|정상(적인|인)?\s*(수준|범위)|정상으로\s*(볼|판단|보인)|정상이(다|라)|비정상/.test(
            text,
        )
    ) {
        reject('진단 또는 직업 적합·취업 가능 단정');
    }
    if (
        /(상위|하위)\s*([0-9]+|[일이삼사오육칠팔구십백]+)\s*(%|퍼센트|프로)|(상|하)위권|백분위|퍼센타일|percentile/i.test(
            text,
        )
    ) {
        reject('규준 순위·백분위를 새로 만들 수 없음');
    }
    if (/(25개|전체|모든).{0,16}(완료|조립)|완료.{0,10}(25개|전체)/.test(text) && pack.testType === 'kead-bimanual') {
        reject('기록시간·수행량으로 전체 완료 추론');
    }
    if (/때문에|원인|기인|로 인해|으로 인해/.test(text)) issues.push('근거로 확인되지 않은 인과관계 검토 필요');
    if (/반드시|확실히|문제가 없|정상이다|뛰어나|현저히|임상적으로|유의미/.test(text)) issues.push('단정적 표현 검토 필요');

    const behavior =
        /주의분산|주의집중|재안내|반복설명|자가수정|스스로 수정|떨어뜨|한 손 중심|통증|피로|관찰되/.test(text);
    const conditionDescription =
        claim.claimType === 'LIMITATION' &&
        conditions.some(
            item =>
                item.state === 'OBSERVED' &&
                ((item.conditionType === 'PAIN' && /통증/.test(text)) ||
                    (item.conditionType === 'FATIGUE' && /피로/.test(text))),
        );
    if (behavior && !behavioral.length && !conditionDescription) {
        reject('실제 행동을 뒷받침하는 관찰·사건 근거 없음');
    }

    const tagPolicies: Array<[RegExp, string[]]> = [
        [/주의분산|주의집중/, ['ATTENTION_DISTRACTION', 'common.attention']],
        [/재안내|반복설명/, ['REPEATED_INSTRUCTION', 'assistance:verbal_prompt', 'common.instruction']],
        [/자가수정|스스로 수정/, ['SELF_CORRECTION', 'common.self_correction', 'bimanual.self_correction']],
        [/떨어뜨/, ['DROPPED_PIN', 'DROPPED_COMPONENT', 'hand.dropped_pin', 'bimanual.dropped_component']],
        [/한 손 중심/, ['ONE_HAND_DOMINANT', 'bimanual.one_hand_focus']],
        [/통증/, ['PAIN', 'common.pain']],
        [/피로/, ['FATIGUE', 'common.fatigue']],
    ];
    for (const [expression, tags] of tagPolicies) {
        if (expression.test(text) && !hasTag(behavioral, ...tags)) {
            reject('인용한 근거와 행동 표현 불일치');
        }
    }
    if (
        selected.some(
            item =>
                item.type === 'OBSERVATION' &&
                (item.semanticTags ?? []).some(tag => ['status:not_assessed', 'status:not_applicable'].includes(tag)),
        ) &&
        /문제.{0,4}없|어려움.{0,4}없|양호/.test(text)
    ) {
        reject('미평가 상태를 문제 없음으로 확대');
    }

    const available = selected
        .flatMap(
            item =>
                `${JSON.stringify(item.value)} ${item.label} ${item.description ?? ''}`.match(/\d+(?:\.\d+)?/g) ?? [],
        )
        .map(Number);
    for (const raw of text.match(/\d+(?:\.\d+)?/g) ?? []) {
        if (!available.some(value => Math.abs(value - Number(raw)) < 0.0005)) {
            reject(`인용 근거에 없는 수치: ${raw}`);
        }
    }

    return {
        status: invalid ? 'INVALID' : issues.length ? 'REVIEW_REQUIRED' : 'VALID',
        issues: [...new Set(issues)],
    };
}
