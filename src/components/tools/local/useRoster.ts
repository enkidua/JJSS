import { useCallback, useEffect, useRef, useState } from 'react';
import * as localDB from '../../../config/localDB';
import { TRAINING_STATE_ID } from '../../../services/trainingNamesCache';

export interface RosterRoom {
    id: string;
    name: string;
    trainees: string[];
}

/** 저장된 직업훈련 자료에서 훈련실별 훈련생 이름만 뽑는다(구조가 달라도 깨지지 않게 방어적으로). */
export function extractRosterRooms(state: unknown): RosterRoom[] {
    const rooms = (state as { rooms?: unknown } | null | undefined)?.rooms;
    if (!Array.isArray(rooms)) return [];
    return rooms.flatMap((room, index) => {
        if (!room || typeof room !== 'object') return [];
        const item = room as { id?: unknown; name?: unknown; trainees?: unknown };
        const trainees = (Array.isArray(item.trainees) ? item.trainees : [])
            .map(trainee => (trainee && typeof trainee === 'object' ? String((trainee as { name?: unknown }).name ?? '').trim() : ''))
            .filter(Boolean);
        if (!trainees.length) return [];
        return [{ id: String(item.id ?? index), name: String(item.name ?? '').trim() || `훈련실 ${index + 1}`, trainees }];
    });
}

/**
 * 직업훈련의 훈련실 명단을 읽어 온다(읽기만 한다 — 직업훈련 자료를 바꾸지 않는다).
 * 읽지 못하면 빈 목록(명단은 직접 입력하면 된다).
 */
export function useTrainingRoster() {
    const [rooms, setRooms] = useState<RosterRoom[]>([]);
    const [loaded, setLoaded] = useState(false);
    const aliveRef = useRef(true);

    const reload = useCallback(async () => {
        let next: RosterRoom[] = [];
        try {
            next = extractRosterRooms(await localDB.getById('trainingState', TRAINING_STATE_ID));
        } catch {
            next = [];
        }
        if (!aliveRef.current) return;
        setRooms(next);
        setLoaded(true);
    }, []);

    useEffect(() => {
        aliveRef.current = true;
        void reload();
        return () => { aliveRef.current = false; };
    }, [reload]);

    return { rooms, loaded, reload };
}
