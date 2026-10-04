// 직업평가 저장소(src/features/vocationalEvaluation/storage.ts) 테스트 — 합성 메모리 DB, 네트워크 없음.
//  - 회차 삭제는 읽기 실패한 하위 문서까지 한 번에(한 트랜잭션) 지운다(암호화 개인정보 문서 잔존 방지).
//  - 확정된 보고서를 확정 전 사본으로 덮어쓰지 못한다.
//  - 읽지 못한 보고서가 있어도 저장된 최고 버전 번호를 알려 준다(새 버전 번호 중복 방지).
import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureDir = path.join(root, 'src', 'features', 'vocationalEvaluation');
const outDir = path.join(root, 'node_modules', '.cache', 'test-ve-storage');
const SKIP = new Set(['index.ts', 'sourceDocument/extraction.ts', 'interpretation/request.ts', 'analysisDocument/extraction.ts']);

async function collect(dir) {
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await collect(full)));
        else if (entry.name.endsWith('.ts') && !SKIP.has(path.relative(featureDir, full).split(path.sep).join('/'))) files.push(full);
    }
    return files;
}
async function transpile(sourcePath) {
    const relative = path.relative(path.join(root, 'src'), sourcePath);
    const target = path.join(outDir, relative).replace(/\.ts$/, '.mjs');
    const output = ts
        .transpileModule(await readFile(sourcePath, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
            fileName: sourcePath,
        })
        .outputText.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, '$1$2.mjs$3');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, output, 'utf8');
}

await rm(outDir, { recursive: true, force: true });
for (const file of [...(await collect(featureDir)), path.join(root, 'src', 'utils', 'date.ts')]) await transpile(file);
// 합성 localDB: 메모리 Map. deleteDocs는 한 번에 적용(원자성 흉내), 호출 기록을 남긴다.
await mkdir(path.join(outDir, 'config'), { recursive: true });
await writeFile(path.join(outDir, 'config', 'localDB.mjs'), `
    const db = globalThis.__veStorageDB;
    export const localTimestamp = () => ({ seconds: 1 });
    export async function getById(store, id) { return db.records.has(id) ? structuredClone(db.records.get(id)) : undefined; }
    export async function query(store, filter) { return [...db.records.values()].map(item => structuredClone(item)).filter(filter); }
    export async function addDoc(store, doc) { db.records.set(doc.id, structuredClone(doc)); db.calls.push(['addDoc', doc.id]); return doc; }
    export async function deleteDoc(store, id) { db.records.delete(id); db.calls.push(['deleteDoc', id]); }
    export async function deleteDocs(store, ids) { for (const id of ids) db.records.delete(id); db.calls.push(['deleteDocs', [...ids]]); }
`, 'utf8');

globalThis.__veStorageDB = { records: new Map(), calls: [] };
const db = globalThis.__veStorageDB;
const load = relative => import(pathToFileURL(path.join(outDir, 'features', 'vocationalEvaluation', relative)).href);
const storage = await load('storage.mjs');
const reportModel = await load('report/model.mjs');
const episodeModel = await load('model/episode.mjs');

let checks = 0;
async function check(name, fn) {
    await fn();
    checks += 1;
    console.log(`  ok  ${name}`);
}

const warn = console.warn;
console.warn = () => undefined;
try {
    await check('회차 삭제: 읽기 실패한 하위 문서까지 한 번에 지우고, 다른 회차 문서는 남긴다', async () => {
        db.records.clear();
        db.calls.length = 0;
        const episode = await storage.saveEpisode(episodeModel.createEpisode({ seekerId: 's1', seekerName: '합성이용자', evaluationDate: '2026-10-01' }));
        const other = await storage.saveEpisode(episodeModel.createEpisode({ seekerId: 's1', seekerName: '합성이용자', evaluationDate: '2026-10-02' }));
        const report = reportModel.createReport({ episodeId: episode.id, seekerId: 's1', seekerName: '합성이용자', header: {}, writtenOn: '2026-10-01' });
        await storage.saveReport(report);
        // 지문이 맞지 않아 엄격하게는 읽히지 않는 확정 보고서(목록에서 빠지는 문서)
        db.records.set('broken-report', {
            id: 'broken-report', type: 've_report',
            content: JSON.stringify({ ...report, id: 'broken-report', reportVersion: 4, confirmedAt: '2026-10-01T00:00:00Z', contentHash: 'tampered' }),
        });
        // 형식이 맞지 않는 세션 문서
        db.records.set('broken-session', { id: 'broken-session', type: 've_session', content: JSON.stringify({ episodeId: episode.id, version: 999 }) });
        // 다른 회차 소속 문서
        db.records.set('other-session', { id: 'other-session', type: 've_session', content: JSON.stringify({ episodeId: other.id }) });
        // 다른 이용자의, 본문을 읽지 못하는 문서(이 회차 것이 아니므로 삭제를 막지 않고, 지우지도 않는다)
        db.records.set('unknown', { id: 'unknown', type: 've_analysis_document', seekerId: 's2', content: '' });

        const listed = await storage.listReportsForEpisode(episode.id);
        assert.equal(listed.length, 1, '지문이 맞지 않는 보고서는 목록에서 빠진다(이 테스트의 전제)');
        assert.equal(await storage.maxStoredReportVersion(episode.id), 4, '목록에서 빠진 보고서의 버전도 센다');

        await storage.deleteEpisode(episode.id);
        const deletes = db.calls.filter(([kind]) => kind.startsWith('delete'));
        assert.equal(deletes.length, 1, '하위 문서를 하나씩이 아니라 한 번에 지운다');
        assert.equal(deletes[0][0], 'deleteDocs');
        for (const id of [episode.id, report.id, 'broken-report', 'broken-session']) {
            assert.equal(db.records.has(id), false, `남으면 안 되는 문서: ${id}`);
        }
        assert.equal(db.records.has(other.id), true, '다른 회차는 그대로');
        assert.equal(db.records.has('other-session'), true, '다른 회차의 하위 문서는 그대로');
        assert.equal(db.records.has('unknown'), true, '다른 이용자의 읽지 못한 문서는 지우지 않는다');
    });

    await check('회차 삭제: 이 이용자의 하위 문서를 읽지 못하면(보안 키 문제) 아무것도 지우지 않는다', async () => {
        db.records.clear();
        db.calls.length = 0;
        const episode = await storage.saveEpisode(episodeModel.createEpisode({ seekerId: 's1', seekerName: '합성이용자', evaluationDate: '2026-10-01' }));
        db.records.set('unreadable', { id: 'unreadable', type: 've_report', seekerId: 's1', content: '' });
        db.records.set('unreadable-owner', { id: 'unreadable-owner', type: 've_session', seekerId: '', content: '' });
        await assert.rejects(storage.deleteEpisode(episode.id), /2건을 읽지 못해 회차를 삭제하지 않았습니다/);
        assert.equal(db.calls.filter(([kind]) => kind.startsWith('delete')).length, 0, '지우지 않는다');
        assert.equal(db.records.has(episode.id), true);
    });

    await check('확정된 보고서는 확정 전 사본·다른 내용으로 덮어쓸 수 없다', async () => {
        db.records.clear();
        const report = reportModel.createReport({ episodeId: 'ep1', seekerId: 's1', seekerName: '합성이용자', header: {}, writtenOn: '2026-10-01' });
        await storage.saveReport(report);
        const confirmed = reportModel.confirmReport(await storage.saveReport({ ...report, purpose: '확정 전 목적' }), '합성평가사', '2026-10-01T09:00:00Z');
        await storage.saveReport(confirmed);
        // 같은 확정본을 다시 저장하는 것은 된다(확정 직후 저장 큐가 같은 값을 한 번 더 보낼 수 있다).
        await storage.saveReport(confirmed);
        // 화면에 남은 확정 전 사본(늦게 도착한 자동 저장)
        await assert.rejects(storage.saveReport({ ...report, purpose: '늦게 도착한 수정' }), /확정된 보고서는 고칠 수 없습니다/);
        const stored = JSON.parse(db.records.get(report.id).content);
        assert.equal(stored.confirmedAt, confirmed.confirmedAt, '확정 상태가 유지된다');
        assert.equal(stored.purpose, '확정 전 목적');
        // 새 버전은 다른 id라 저장된다.
        const next = reportModel.createNextVersion(confirmed, '2026-10-02T09:00:00Z', '2026-10-02');
        await storage.saveReport(next);
        assert.equal(next.writtenOn, '2026-10-02', '새 버전 작성일은 새로 정한다');
        assert.equal(next.aiOpinionAt, undefined, '새 버전은 AI 초안 표시를 물려받지 않는다');
    });
} finally {
    console.warn = warn;
}

console.log(`\n직업평가 저장소 테스트 ${checks}건 통과`);
