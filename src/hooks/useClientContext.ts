import { useCallback, useEffect, useRef, useState } from 'react';
import { buildClientContextSummary } from '../services/clientContextService';
import { useToast } from '../components/Toast';
import type { Seeker } from '../types/matching';
import { getSeekerKey } from '../utils/seeker';

export interface UseClientContextOptions {
    /** 이용자가 선택되지 않은 상태에서 불러오기를 눌렀을 때의 안내 문구 */
    missingSeekerMessage?: string;
}

export interface ClientContextState {
    summary: string;
    loading: boolean;
    /** 같은 이용자의 최근 직업훈련·고용지원 기록을 참고자료로 불러옵니다. */
    load: () => Promise<void>;
    /** 참고자료를 비웁니다(진행 중인 불러오기 결과도 버립니다). */
    clear: () => void;
}

/**
 * 같은 이용자의 최근 직업훈련·고용지원 기록을 "통합 참고자료"로 불러오는 공용 훅.
 * (고용지원·직업훈련 화면 공용)
 *
 * - 버튼을 눌렀을 때만 불러옵니다. 원본 문서는 수정하지 않습니다.
 * - 이용자가 바뀌면 참고자료를 자동으로 비우고, 늦게 도착한 이전 이용자의 결과는 버립니다.
 */
export function useClientContext(
    seeker: Seeker | null | undefined,
    allSeekers: Seeker[],
    options: UseClientContextOptions = {},
): ClientContextState {
    const { showToast } = useToast();
    const [summary, setSummary] = useState('');
    const [loading, setLoading] = useState(false);
    const requestRef = useRef(0);
    const seekerRef = useRef(seeker);
    const allSeekersRef = useRef(allSeekers);
    seekerRef.current = seeker;
    allSeekersRef.current = allSeekers;
    const missingSeekerMessage = options.missingSeekerMessage || '먼저 이용자를 선택해 주세요.';

    // "다른 사람으로 바뀌었는지"만 판단하는 변경 감지용 키입니다(문서 매칭에는 쓰지 않음).
    const changeKey = getSeekerKey(seeker, { allowNameFallback: true });

    useEffect(() => {
        requestRef.current += 1;
        setSummary('');
        setLoading(false);
    }, [changeKey]);

    const clear = useCallback(() => {
        requestRef.current += 1;
        setSummary('');
        setLoading(false);
    }, []);

    const load = useCallback(async () => {
        const target = seekerRef.current;
        if (!target) {
            showToast(missingSeekerMessage, 'error');
            return;
        }
        const requestId = ++requestRef.current;
        setLoading(true);
        try {
            const result = await buildClientContextSummary(target, allSeekersRef.current);
            if (requestId !== requestRef.current) return;
            if (!result.hasRecords) {
                setSummary('');
                showToast(result.note || '불러올 최근 직업훈련·고용지원 기록이 없습니다.', 'info', 2800);
                return;
            }
            setSummary(result.summary);
            showToast(
                result.recordCount > 0
                    ? `최근 기록 참고자료를 불러왔습니다. 관련 문서 ${result.recordCount}건을 참고합니다.`
                    : '최근 기록 참고자료를 불러왔습니다.',
                'success',
                2600,
            );
        } catch (error: any) {
            if (requestId !== requestRef.current) return;
            showToast(error?.message || '최근 기록 참고자료를 불러오지 못했습니다. 현재 작성 내용은 유지됩니다.', 'error');
        } finally {
            if (requestId === requestRef.current) setLoading(false);
        }
    }, [missingSeekerMessage, showToast]);

    return { summary, loading, load, clear };
}
