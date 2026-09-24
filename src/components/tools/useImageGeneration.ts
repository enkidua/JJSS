import { useCallback, useEffect, useRef, useState } from 'react';
import { generateImage, type GeminiImageAspectRatio } from '../../services/gemini';

/** 내부 모델 선택 id(화면에는 "이미지 생성(Gemini)"으로만 표시). */
const IMAGE_MODEL_SELECTION = 'nanobanana2';

export interface GeneratedImage {
    /** 어떤 템플릿으로 만든 결과인지. 다른 템플릿 화면에 잘못 표시되지 않게 합니다. */
    templateId: string;
    image: string;
}

/**
 * 홍보물·일정표 이미지 생성 공통 훅.
 * - 새 이미지가 성공했을 때만 기존 결과를 교체합니다(실패해도 이미 비용을 낸 결과는 유지).
 * - cancel()은 AbortController로 요청을 중단하고, 화면을 벗어나면 자동으로 중단합니다.
 */
export function useImageGeneration() {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<GeneratedImage | null>(null);
    const [error, setError] = useState('');
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => () => controllerRef.current?.abort(), []);

    const generate = useCallback(async (templateId: string, prompt: string, options: { aspectRatio?: GeminiImageAspectRatio } = {}): Promise<boolean> => {
        if (controllerRef.current) return false;
        const controller = new AbortController();
        controllerRef.current = controller;
        setIsLoading(true);
        setError('');
        let succeeded = false;
        let failureMessage = '';
        try {
            const response = await generateImage(prompt, 'custom', IMAGE_MODEL_SELECTION, { signal: controller.signal, aspectRatio: options.aspectRatio });
            if (!controller.signal.aborted) {
                setResult({ templateId, image: `data:${response.mimeType};base64,${response.imageBase64}` });
                succeeded = true;
            }
        } catch (caught: unknown) {
            failureMessage = caught instanceof Error && caught.message ? caught.message : '이미지 생성 중 오류가 발생했습니다.';
        } finally {
            if (controllerRef.current === controller) {
                controllerRef.current = null;
                setIsLoading(false);
            }
        }
        if (!succeeded && failureMessage && !controller.signal.aborted) setError(failureMessage);
        return succeeded;
    }, []);

    const cancel = useCallback(() => {
        const controller = controllerRef.current;
        if (!controller) return;
        controllerRef.current = null;
        controller.abort();
        setIsLoading(false);
    }, []);

    const clearResult = useCallback(() => {
        setResult(null);
        setError('');
    }, []);

    return { isLoading, result, error, setError, generate, cancel, clearResult };
}
