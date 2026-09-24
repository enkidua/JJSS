import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type PageModule = { default: ComponentType<any> };
type Loader = () => Promise<PageModule>;

const loaders = new Map<string, Loader>();
const loaded = new Map<string, Promise<PageModule>>();

/** 경로별로 한 번만 불러오는 lazy 페이지. 미리 불러오기(preloadPage)와 같은 Promise를 공유합니다. */
export function lazyPage(path: string, loader: Loader): LazyExoticComponent<ComponentType<any>> {
    loaders.set(path, loader);
    return lazy(() => preloadPage(path)!);
}

/** 해당 경로의 페이지 파일을 지금 내려받습니다. 이미 받았으면 같은 Promise를 돌려줍니다. */
export function preloadPage(path: string): Promise<PageModule> | undefined {
    const loader = loaders.get(path);
    if (!loader) return undefined;
    let promise = loaded.get(path);
    if (!promise) {
        promise = loader().catch(error => {
            // 실패한 파일은 다음 시도에서 다시 받을 수 있게 캐시에서 뺍니다.
            loaded.delete(path);
            throw error;
        });
        loaded.set(path, promise);
    }
    return promise;
}

/** 첫 화면이 그려진 뒤 유휴 시간에 모든 페이지 파일을 순서대로 미리 받아, 메뉴 전환 때 로딩 문구가 보이지 않게 합니다. */
export function preloadAllPagesWhenIdle(): void {
    const paths = [...loaders.keys()];
    const schedule = (fn: () => void) => {
        const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
        if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 2000 });
        else window.setTimeout(fn, 600);
    };
    const next = () => {
        const path = paths.shift();
        if (!path) return;
        void preloadPage(path)?.catch(() => undefined).finally(() => schedule(next));
    };
    schedule(next);
}
