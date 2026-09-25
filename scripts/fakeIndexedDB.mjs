// 테스트용 최소 IndexedDB (src/config/localDB.ts가 쓰는 기능만): open/업그레이드, keyPath 'id' store,
// get/getAll/put/delete/clear, 트랜잭션 완료 이벤트. 저장값은 structuredClone으로 보관해 실제 디스크처럼 "원본"을 확인할 수 있다.

export function createFakeIndexedDB() {
    const databases = new Map(); // name -> { version, stores: Map<storeName, Map<id, value>> }
    let writes = 0; // 앱 코드가 실행한 put/delete/clear 수 (putRaw 제외)

    function later(fn) {
        setTimeout(fn, 0);
    }

    class FakeRequest {
        constructor() {
            this.result = undefined;
            this.error = null;
            this.onsuccess = null;
            this.onerror = null;
        }
    }

    class FakeTransaction {
        constructor(data) {
            this.data = data;
            this.pending = 0;
            this.done = false;
            this.error = null;
            this.oncomplete = null;
            this.onerror = null;
            this.onabort = null;
            // 요청이 하나도 없어도 완료 이벤트가 오도록 한다.
            this.pending += 1;
            later(() => this.finishRequest());
        }

        finishRequest() {
            this.pending -= 1;
            if (this.pending > 0 || this.done) return;
            later(() => {
                if (this.pending > 0 || this.done) return;
                this.done = true;
                this.oncomplete?.();
            });
        }

        request(run) {
            const request = new FakeRequest();
            this.pending += 1;
            later(() => {
                if (this.done) return;
                try {
                    request.result = run();
                    request.onsuccess?.({ target: request });
                } catch (error) {
                    request.error = error;
                    request.onerror?.({ target: request });
                }
                this.finishRequest();
            });
            return request;
        }

        objectStore(name) {
            const store = this.data.stores.get(name);
            if (!store) throw new Error(`fake store not found: ${name}`);
            return {
                get: id => this.request(() => (store.has(id) ? structuredClone(store.get(id)) : undefined)),
                getAll: () => this.request(() => [...store.values()].map(value => structuredClone(value))),
                put: value => this.request(() => {
                    writes += 1;
                    store.set(value.id, structuredClone(value));
                    return value.id;
                }),
                delete: id => this.request(() => { writes += 1; store.delete(id); }),
                clear: () => this.request(() => { writes += 1; store.clear(); }),
            };
        }

        abort() {
            if (this.done) return;
            this.done = true;
            later(() => this.onabort?.());
        }
    }

    function makeDb(name, data) {
        return {
            name,
            get version() { return data.version; },
            objectStoreNames: { contains: storeName => data.stores.has(storeName) },
            createObjectStore(storeName) {
                if (!data.stores.has(storeName)) data.stores.set(storeName, new Map());
            },
            transaction(storeName) {
                return new FakeTransaction(data);
            },
            close() {},
            onversionchange: null,
        };
    }

    const indexedDB = {
        open(name, version) {
            const request = new FakeRequest();
            request.onupgradeneeded = null;
            request.onblocked = null;
            later(() => {
                let data = databases.get(name);
                const requested = version ?? data?.version ?? 1;
                if (data && requested < data.version) {
                    request.error = Object.assign(new Error('VersionError'), { name: 'VersionError' });
                    request.onerror?.();
                    return;
                }
                if (!data) {
                    data = { version: 0, stores: new Map() };
                    databases.set(name, data);
                }
                const db = makeDb(name, data);
                request.result = db;
                if (requested > data.version) {
                    data.version = requested;
                    request.onupgradeneeded?.();
                }
                request.onsuccess?.();
            });
            return request;
        },
    };

    /** store의 원본 레코드(암호문 그대로) */
    function rawRecords(dbName, storeName) {
        const store = databases.get(dbName)?.stores.get(storeName);
        return store ? [...store.values()].map(value => structuredClone(value)) : [];
    }

    /** 원본 레코드를 직접 넣는다(이전 버전이 남긴 평문 데이터 흉내) */
    function putRaw(dbName, storeName, value) {
        let data = databases.get(dbName);
        if (!data) {
            data = { version: 0, stores: new Map() };
            databases.set(dbName, data);
        }
        if (!data.stores.has(storeName)) data.stores.set(storeName, new Map());
        data.stores.get(storeName).set(value.id, structuredClone(value));
    }

    /** 지금까지 앱 코드가 실행한 쓰기(put/delete/clear) 횟수 */
    function writeCount() {
        return writes;
    }

    return { indexedDB, rawRecords, putRaw, writeCount };
}
