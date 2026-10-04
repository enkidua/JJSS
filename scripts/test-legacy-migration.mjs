// Synthetic migration failure tests; no real storage or API access.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/services/legacyMigration.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/import \* as localDB from ['"]\.\.\/config\/localDB['"];?/, 'const localDB = globalThis.__jjssMigrationTestDb;');
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
try {
    let instance = 0;
    for (const scenario of ['success', 'read-failure', 'delete-failure', 'changed', 'verify-failure']) {
        const key = 'jjss:vocational-evaluation-history';
        const raw = JSON.stringify([{ id: 'synthetic-1', content: 'synthetic history' }]);
        const replacement = JSON.stringify([{ id: 'synthetic-2', content: 'new synthetic history' }]);
        const storage = new Map([[key, raw]]);
        const docs = new Map();
        Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
            getItem(name) {
                if (scenario === 'read-failure') throw new Error('synthetic read failure');
                return storage.get(name) ?? null;
            },
            removeItem(name) {
                if (scenario === 'delete-failure') throw new Error('synthetic delete failure');
                storage.delete(name);
            },
        } });
        globalThis.__jjssMigrationTestDb = {
            query: async () => [...docs.values()],
            addDoc: async (_store, doc) => { docs.set(doc.id, doc); },
            verifyEncryptedField: async (_store, id, field, expected) => {
                if (scenario === 'changed') storage.set(key, replacement);
                return scenario !== 'verify-failure' && docs.get(id)?.[field] === expected;
            },
        };
        const url = 'data:text/javascript;base64,' + Buffer.from(compiled + `\n// ${instance++}`).toString('base64');
        const { runLegacyMigration } = await import(url);
        const first = runLegacyMigration();
        assert.equal(runLegacyMigration(), first, 'Concurrent migration shares one operation');
        const result = await first;
        assert.equal(result.keptLegacy, scenario !== 'success', scenario);
        if (scenario === 'success') {
            assert.equal(storage.has(key), false);
            assert.equal(docs.size, 1);
            assert.equal((await runLegacyMigration()).migrated, 0);
        } else {
            assert.equal(storage.get(key), scenario === 'changed' ? replacement : raw);
            assert.ok(result.reason, scenario);
        }
        console.log('PASS legacy migration ' + scenario);
    }
} finally {
    delete globalThis.__jjssMigrationTestDb;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
}
