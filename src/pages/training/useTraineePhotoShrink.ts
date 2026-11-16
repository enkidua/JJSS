import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { TrainingRoom } from './trainingModel';
import { needsPhotoShrink, shouldReplaceStoredPhoto, shrinkPhotoDataUrl } from './trainingPhoto';

/**
 * 예전 방식(원본 크기 그대로)으로 저장된 훈련생 사진을 화면을 막지 않고 한 번씩 줄입니다.
 * - 불러오기가 끝난 뒤(ready)에만 동작하고, 줄인 결과는 setRooms로 넣어 평소 자동 저장 경로로 보관됩니다.
 * - 줄이지 못한 사진은 그대로 둡니다(사진을 지우지 않음). 같은 사진은 화면에 머무는 동안 다시 시도하지 않습니다.
 * - 여러 장이어도 저장은 한 번만 일어나도록 결과를 모아서 한 번에 반영합니다.
 */
export function useTraineePhotoShrink(
    rooms: TrainingRoom[],
    setRooms: Dispatch<SetStateAction<TrainingRoom[]>>,
    ready: boolean,
) {
    // 원본 문자열(수 MB)을 붙잡아 두지 않도록 '훈련생 ID + 길이'만 기억합니다.
    const attemptedRef = useRef(new Set<string>());
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (!ready) return;
        const targets: { traineeId: string; original: string }[] = [];
        for (const room of rooms) {
            for (const trainee of room.trainees || []) {
                const photo = trainee.photoDataUrl;
                if (!photo || !needsPhotoShrink(photo)) continue;
                const key = `${trainee.id}:${photo.length}`;
                if (attemptedRef.current.has(key)) continue;
                attemptedRef.current.add(key);
                targets.push({ traineeId: trainee.id, original: photo });
            }
        }
        if (targets.length === 0) return;

        void (async () => {
            const results: { traineeId: string; original: string; shrunk: string }[] = [];
            for (const target of targets) {
                try {
                    const shrunk = await shrinkPhotoDataUrl(target.original);
                    if (shouldReplaceStoredPhoto(target.original, shrunk)) results.push({ ...target, shrunk });
                } catch {
                    // 읽을 수 없는 형식이면 기존 사진을 그대로 둡니다.
                }
            }
            if (!mountedRef.current || results.length === 0) return;
            setRooms(prev => {
                let changed = false;
                const next = prev.map(room => {
                    let roomChanged = false;
                    const trainees = (room.trainees || []).map(trainee => {
                        // 줄이는 동안 사용자가 사진을 바꿨다면(원본과 다르면) 덮어쓰지 않습니다.
                        const hit = results.find(item => item.traineeId === trainee.id && item.original === trainee.photoDataUrl);
                        if (!hit) return trainee;
                        roomChanged = true;
                        return { ...trainee, photoDataUrl: hit.shrunk };
                    });
                    if (!roomChanged) return room;
                    changed = true;
                    return { ...room, trainees };
                });
                return changed ? next : prev;
            });
        })();
    }, [rooms, ready, setRooms]);
}
