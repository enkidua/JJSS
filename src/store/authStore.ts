import { create } from 'zustand';

/**
 * 로컬 전용 인증 스토어
 * Firebase 인증을 완전히 제거하고, 로그인 없이 로컬 사용자로 바로 사용합니다.
 */

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    organization: string;
    role: string;
    createdAt: any;
}

interface AuthState {
    user: { uid: string; email: string } | null;
    profile: UserProfile | null;
    loading: boolean;
    error: string | null;
    initialized: boolean;
    init: () => () => void;
    clearError: () => void;
}

// 로컬 사용자 프로필 (고정)
const LOCAL_USER = {
    uid: 'local-user',
    email: 'local@jjss.app',
};

const LOCAL_PROFILE: UserProfile = {
    uid: 'local-user',
    email: 'local@jjss.app',
    displayName: '직업재활 전문가',
    organization: '직업재활기관',
    role: 'admin',
    createdAt: { seconds: Math.floor(Date.now() / 1000) },
};

export const useAuthStore = create<AuthState>((set) => ({
    user: LOCAL_USER,
    profile: LOCAL_PROFILE,
    loading: false,
    error: null,
    initialized: true,

    init: () => {
        // 로컬 앱이므로 인증 초기화가 필요 없음 — 바로 사용 가능
        set({ user: LOCAL_USER, profile: LOCAL_PROFILE, initialized: true });
        return () => {}; // cleanup noop
    },

    clearError: () => set({ error: null }),
}));
