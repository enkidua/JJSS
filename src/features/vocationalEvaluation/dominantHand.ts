/**
 * 우세손 판정. KEAD 작업표본검사 실시요강 표4-5(질문 3문항)·표4-6(평가용지 18문항) 기준.
 * 손기능 검사는 우세손·비우세손 조건으로 나뉘므로 이 판정이 먼저 끝나야 한다.
 *
 * 규칙
 *  - 질문 3문항이 모두 같은 손이면 그 손을 우세손으로 본다.
 *  - 갈리면 평가용지 18문항을 실시하고, **8개 이상 같은 손**이면 그 손으로 결정한다.
 *  - 양손잡이로 판정되면 **채점에서는 오른손을 우세손으로 간주**한다.
 */
import type { DominantHand } from './model/types';

export type HandAnswer = 'RIGHT' | 'LEFT' | 'EITHER' | null;

/** 표4-5 — 1차 질문 */
export const DOMINANT_HAND_QUESTIONS = [
    { id: 'writing', label: '글씨를 쓸 때 어느 손을 사용합니까?' },
    { id: 'throwing', label: '공을 던질 때 어느 손을 사용합니까?' },
    { id: 'chopsticks', label: '젓가락질을 할 때 어느 손을 사용합니까?' },
] as const;

/** 표4-6 — 평가용지 18문항 */
export const DOMINANT_HAND_FORM_ITEMS = [
    { id: 'write', label: '글씨 쓰기' },
    { id: 'throw', label: '공 던지기' },
    { id: 'racket', label: '라켓 잡기' },
    { id: 'match', label: '성냥 켜기' },
    { id: 'scissors', label: '가위질하기' },
    { id: 'sewing', label: '바느질하기' },
    { id: 'hammer', label: '망치질하기' },
    { id: 'toothbrush', label: '칫솔질하기' },
    { id: 'shovel', label: '삽질하기' },
    { id: 'card', label: '카드 돌리기' },
    { id: 'bottle', label: '병뚜껑 따기' },
    { id: 'draw', label: '그림 그리기' },
    { id: 'teaspoon', label: '티스푼 젓기' },
    { id: 'eraser', label: '지우개로 지우기' },
    { id: 'kick', label: '공 차기' },
    { id: 'bag', label: '가방 들기' },
    { id: 'shoe', label: '신발 신기' },
    { id: 'cup', label: '잔 들기' },
] as const;

/** 표4-6 — 한 손이 8개 이상이면 그 손으로 결정한다. */
export const DOMINANT_HAND_FORM_THRESHOLD = 8;

export interface DominantHandAssessment {
    /** 질문 3문항 응답 (문항 id → 손) */
    questions: Record<string, HandAnswer>;
    /** 평가용지 18문항 응답. 실시하지 않았으면 빈 객체 */
    form: Record<string, HandAnswer>;
    /** 평가사가 직접 지정한 결과. 있으면 이 값을 쓴다 */
    override?: DominantHand;
    /** 판정 근거 메모 */
    note?: string;
}

export function createDominantHandAssessment(): DominantHandAssessment {
    return { questions: {}, form: {} };
}

function tally(answers: Record<string, HandAnswer>, ids: readonly string[]): { right: number; left: number; either: number; answered: number } {
    let right = 0;
    let left = 0;
    let either = 0;
    for (const id of ids) {
        const answer = answers[id];
        if (answer === 'RIGHT') right += 1;
        else if (answer === 'LEFT') left += 1;
        else if (answer === 'EITHER') either += 1;
    }
    return { right, left, either, answered: right + left + either };
}

export interface DominantHandResult {
    hand: DominantHand;
    /** 어느 단계에서 결정했는지 */
    basis: 'QUESTIONS' | 'FORM' | 'OVERRIDE' | 'UNDECIDED';
    /** 화면·보고서에 그대로 쓰는 설명 */
    explanation: string;
    /** 평가용지 18문항을 실시해야 하는 상태인지 */
    needsForm: boolean;
    counts: { right: number; left: number; either: number; answered: number };
}

export function resolveDominantHand(assessment: DominantHandAssessment): DominantHandResult {
    const questionIds = DOMINANT_HAND_QUESTIONS.map(item => item.id);
    const formIds = DOMINANT_HAND_FORM_ITEMS.map(item => item.id);
    const questionCounts = tally(assessment.questions, questionIds);
    const formCounts = tally(assessment.form, formIds);

    if (assessment.override) {
        return {
            hand: assessment.override,
            basis: 'OVERRIDE',
            explanation: '평가사가 직접 지정했습니다.',
            needsForm: false,
            counts: formCounts.answered ? formCounts : questionCounts,
        };
    }

    // 1차: 질문 3문항이 모두 같은 손
    if (questionCounts.answered === questionIds.length) {
        if (questionCounts.right === questionIds.length) {
            return {
                hand: 'RIGHT',
                basis: 'QUESTIONS',
                explanation: '질문 3문항이 모두 오른손입니다.',
                needsForm: false,
                counts: questionCounts,
            };
        }
        if (questionCounts.left === questionIds.length) {
            return {
                hand: 'LEFT',
                basis: 'QUESTIONS',
                explanation: '질문 3문항이 모두 왼손입니다.',
                needsForm: false,
                counts: questionCounts,
            };
        }
    }

    // 2차: 평가용지 18문항 — 8개 이상 같은 손
    if (formCounts.answered) {
        const rightReached = formCounts.right >= DOMINANT_HAND_FORM_THRESHOLD;
        const leftReached = formCounts.left >= DOMINANT_HAND_FORM_THRESHOLD;
        if (rightReached && !leftReached) {
            return {
                hand: 'RIGHT',
                basis: 'FORM',
                explanation: `평가용지에서 오른손 ${formCounts.right}개로 기준(${DOMINANT_HAND_FORM_THRESHOLD}개)을 넘었습니다.`,
                needsForm: false,
                counts: formCounts,
            };
        }
        if (leftReached && !rightReached) {
            return {
                hand: 'LEFT',
                basis: 'FORM',
                explanation: `평가용지에서 왼손 ${formCounts.left}개로 기준(${DOMINANT_HAND_FORM_THRESHOLD}개)을 넘었습니다.`,
                needsForm: false,
                counts: formCounts,
            };
        }
        if (rightReached && leftReached) {
            return {
                hand: formCounts.right === formCounts.left ? 'AMBIDEXTROUS' : formCounts.right > formCounts.left ? 'RIGHT' : 'LEFT',
                basis: 'FORM',
                explanation:
                    formCounts.right === formCounts.left
                        ? `평가용지에서 양손이 ${formCounts.right}개로 같습니다. 양손잡이로 보고 채점은 오른손을 우세손으로 합니다.`
                        : `평가용지에서 ${formCounts.right > formCounts.left ? '오른손' : '왼손'}이 더 많습니다(오른손 ${formCounts.right} / 왼손 ${formCounts.left}).`,
                needsForm: false,
                counts: formCounts,
            };
        }
        if (formCounts.answered === formIds.length) {
            return {
                hand: 'AMBIDEXTROUS',
                basis: 'FORM',
                explanation: `평가용지에서 어느 손도 ${DOMINANT_HAND_FORM_THRESHOLD}개에 이르지 않았습니다(오른손 ${formCounts.right} / 왼손 ${formCounts.left}). 양손잡이로 보고 채점은 오른손을 우세손으로 합니다.`,
                needsForm: false,
                counts: formCounts,
            };
        }
        return {
            hand: 'UNKNOWN',
            basis: 'UNDECIDED',
            explanation: `평가용지 ${formCounts.answered}/${formIds.length}문항 응답. 남은 문항을 마저 확인하세요.`,
            needsForm: true,
            counts: formCounts,
        };
    }

    if (questionCounts.answered < questionIds.length) {
        return {
            hand: 'UNKNOWN',
            basis: 'UNDECIDED',
            explanation: '질문 3문항에 먼저 답해 주세요.',
            needsForm: false,
            counts: questionCounts,
        };
    }
    return {
        hand: 'UNKNOWN',
        basis: 'UNDECIDED',
        explanation: '질문 3문항이 갈렸습니다. 평가용지 18문항을 실시하세요.',
        needsForm: true,
        counts: questionCounts,
    };
}

/** 채점에 쓰는 손. 양손잡이는 실시요강에 따라 오른손으로 본다. */
export function scoringHand(hand: DominantHand): 'RIGHT' | 'LEFT' | null {
    if (hand === 'RIGHT' || hand === 'AMBIDEXTROUS') return 'RIGHT';
    if (hand === 'LEFT') return 'LEFT';
    return null;
}
