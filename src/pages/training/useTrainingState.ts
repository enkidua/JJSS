import { useCallback, useEffect, useRef, useState } from 'react';
import * as localDB from '../../config/localDB';
import { safeErrorMetadata } from '../../utils/safeError';
import {
    initialRooms,
    sanitizeTrainingRecords,
    sanitizeTrainingRooms,
    type AttendanceBook,
    type ProgressBook,
    type ShowToast,
    type TrainingRecordBook,
    type TrainingRoom,
    type TrainingSaveStatus,
} from './trainingModel';

const TRAINING_STATE_ID = 'work-training';
const AUTOSAVE_DELAY_MS = 500;
const AUTOSAVE_ERROR_TOAST_INTERVAL_MS = 15000;

interface PersistedTrainingState {
    id: string;
    rooms: TrainingRoom[];
    attendanceBook: AttendanceBook;
    progressYear: string;
    progressBook: ProgressBook;
    trainingRecords: TrainingRecordBook;
    /** 문서에 들어갈 담당자 이름(선택). 이전 버전 저장 데이터에는 없습니다. */
    manager?: string;
    updatedAt: { seconds: number };
}

type TrainingLoadState = 'loading' | 'ready' | 'failed';
type SaveReason = 'auto' | 'manual' | 'flush';

interface TrainingSnapshot {
    rooms: TrainingRoom[];
    attendanceBook: AttendanceBook;
    progressYear: string;
    progressBook: ProgressBook;
    trainingRecords: TrainingRecordBook;
    manager: string;
}

interface UseTrainingStateOptions {
    showToast: ShowToast;
    defaultYear: string;
    /** 저장된 자료를 불러온 직후 한 번 호출됩니다(첫 훈련실·훈련생 선택용). */
    onLoaded?: (rooms: TrainingRoom[]) => void;
}

/**
 * 직업훈련 화면의 저장 상태를 관리합니다.
 * - 변경 0.5초 뒤 자동 저장, 실패하면 오류 알림과 저장 상태 표시
 * - saveNow(): 즉시 저장하고 실제 결과를 돌려줌
 * - 화면을 떠날 때(unmount)·창을 닫을 때 대기 중인 변경을 바로 저장
 * - 불러오기에 실패하면 기존 자료를 덮어쓰지 않도록 자동 저장을 멈춤
 */
export function useTrainingState({ showToast, defaultYear, onLoaded }: UseTrainingStateOptions) {
    const [rooms, setRooms] = useState<TrainingRoom[]>(initialRooms);
    const [attendanceBook, setAttendanceBook] = useState<AttendanceBook>({});
    const [progressYear, setProgressYear] = useState(defaultYear);
    const [progressBook, setProgressBook] = useState<ProgressBook>({});
    const [trainingRecords, setTrainingRecords] = useState<TrainingRecordBook>({});
    const [manager, setManager] = useState('');
    const [loadState, setLoadState] = useState<TrainingLoadState>('loading');
    const [saveStatus, setSaveStatus] = useState<TrainingSaveStatus>('idle');
    const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

    const latestRef = useRef<TrainingSnapshot>({ rooms, attendanceBook, progressYear, progressBook, trainingRecords, manager });
    latestRef.current = { rooms, attendanceBook, progressYear, progressBook, trainingRecords, manager };
    const loadStateRef = useRef<TrainingLoadState>(loadState);
    loadStateRef.current = loadState;
    const showToastRef = useRef(showToast);
    showToastRef.current = showToast;
    const onLoadedRef = useRef(onLoaded);
    onLoadedRef.current = onLoaded;
    const defaultYearRef = useRef(defaultYear);
    defaultYearRef.current = defaultYear;

    const timerRef = useRef<number | undefined>(undefined);
    const queueRef = useRef<Promise<unknown>>(Promise.resolve());
    const changeVersionRef = useRef(0);
    const savedVersionRef = useRef(0);
    const skipNextChangeRef = useRef(false);
    const mountedRef = useRef(true);
    const lastErrorToastRef = useRef(0);
    const loadRequestRef = useRef(0);

    const persist = useCallback((reason: SaveReason): Promise<boolean> => {
        window.clearTimeout(timerRef.current);
        const run = async () => {
            const version = changeVersionRef.current;
            const snapshot = latestRef.current;
            if (mountedRef.current) setSaveStatus('saving');
            try {
                await localDB.addDoc<PersistedTrainingState>('trainingState', {
                    id: TRAINING_STATE_ID,
                    ...snapshot,
                    updatedAt: localDB.localTimestamp(),
                });
                savedVersionRef.current = Math.max(savedVersionRef.current, version);
                if (mountedRef.current) {
                    setLastSavedAt(new Date());
                    setSaveStatus(savedVersionRef.current >= changeVersionRef.current ? 'saved' : 'pending');
                }
                return true;
            } catch (error) {
                console.error('[WorkTraining] 훈련 데이터 저장 실패:', safeErrorMetadata(error, 'training-state-save'));
                if (mountedRef.current) setSaveStatus('error');
                const now = Date.now();
                if (reason !== 'auto' || now - lastErrorToastRef.current > AUTOSAVE_ERROR_TOAST_INTERVAL_MS) {
                    lastErrorToastRef.current = now;
                    showToastRef.current(
                        reason === 'flush'
                            ? '직업훈련 자료의 마지막 변경 내용을 저장하지 못했습니다. 직업훈련 화면에 다시 들어가 내용을 확인해 주세요.'
                            : '직업훈련 자료를 저장하지 못했습니다. 잠시 후 [저장] 버튼을 다시 눌러 주세요.',
                        'error',
                    );
                }
                return false;
            }
        };
        const next = queueRef.current.then(run, run);
        queueRef.current = next.catch(() => undefined);
        return next;
    }, []);
    const persistRef = useRef(persist);
    persistRef.current = persist;

    const load = useCallback(async () => {
        const requestId = ++loadRequestRef.current;
        window.clearTimeout(timerRef.current);
        setLoadState('loading');
        try {
            const saved = await localDB.getById<PersistedTrainingState>('trainingState', TRAINING_STATE_ID);
            if (requestId !== loadRequestRef.current || !mountedRef.current) return;
            let nextRooms = initialRooms;
            if (saved) {
                nextRooms = sanitizeTrainingRooms(saved.rooms?.length ? saved.rooms : initialRooms);
                setRooms(nextRooms);
                setAttendanceBook(saved.attendanceBook || {});
                setProgressYear(saved.progressYear || defaultYearRef.current);
                setProgressBook(saved.progressBook || {});
                setTrainingRecords(sanitizeTrainingRecords(saved.trainingRecords || {}));
                setManager(typeof saved.manager === 'string' ? saved.manager : '');
            }
            // 방금 불러온 값은 변경으로 보지 않습니다.
            skipNextChangeRef.current = true;
            changeVersionRef.current = 0;
            savedVersionRef.current = 0;
            setSaveStatus('idle');
            setLoadState('ready');
            if (saved) onLoadedRef.current?.(nextRooms);
        } catch (error) {
            if (requestId !== loadRequestRef.current || !mountedRef.current) return;
            console.error('[WorkTraining] 훈련 데이터 로드 실패:', safeErrorMetadata(error, 'training-state-load'));
            setLoadState('failed');
            showToastRef.current('저장된 직업훈련 자료를 불러오지 못했습니다. 기존 자료를 보호하기 위해 편집과 자동 저장을 멈췄습니다.', 'error');
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        void load();
        const flushIfDirty = () => {
            if (loadStateRef.current !== 'ready') return;
            if (savedVersionRef.current >= changeVersionRef.current) return;
            void persistRef.current('flush');
        };
        window.addEventListener('beforeunload', flushIfDirty);
        return () => {
            window.removeEventListener('beforeunload', flushIfDirty);
            mountedRef.current = false;
            loadRequestRef.current += 1;
            window.clearTimeout(timerRef.current);
            // 입력 직후 다른 메뉴로 이동해도 마지막 입력이 사라지지 않도록 즉시 저장합니다.
            flushIfDirty();
        };
    }, [load]);

    useEffect(() => {
        if (loadState !== 'ready') return;
        if (skipNextChangeRef.current) {
            skipNextChangeRef.current = false;
            return;
        }
        changeVersionRef.current += 1;
        setSaveStatus('pending');
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            void persistRef.current('auto');
        }, AUTOSAVE_DELAY_MS);
    }, [rooms, attendanceBook, progressYear, progressBook, trainingRecords, manager, loadState]);

    const saveNow = useCallback(async () => {
        if (loadStateRef.current !== 'ready') {
            showToastRef.current(
                loadStateRef.current === 'loading'
                    ? '저장된 자료를 불러오는 중입니다. 잠시 후 다시 눌러 주세요.'
                    : '저장된 자료를 불러오지 못해 저장할 수 없습니다. [다시 불러오기]를 먼저 눌러 주세요.',
                'error',
            );
            return false;
        }
        return persist('manual');
    }, [persist]);

    return {
        rooms,
        setRooms,
        attendanceBook,
        setAttendanceBook,
        progressYear,
        setProgressYear,
        progressBook,
        setProgressBook,
        trainingRecords,
        setTrainingRecords,
        manager,
        setManager,
        loadState,
        reload: load,
        saveStatus,
        lastSavedAt,
        saveNow,
    };
}
