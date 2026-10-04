import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import ts from 'typescript';
import './test-legacy-migration.mjs';
import './test-confirm-queue.mjs';
import './test-electron-startup.cjs';
import './test-connection-timeout.mjs';
import './test-data-store-order.mjs';
import './test-evaluation-save-queue.mjs';
import './test-training-save-order.mjs';
import './test-before-unload.mjs';
import './test-client-context-lifetime.mjs';
import './test-bulk-registration.mjs';
import './test-settings-store.mjs';
import './test-workflow-guards.mjs';

const packageConfig = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
assert.match(packageConfig.scripts['electron:build:mac'], /--config\.afterPack=\.\/scripts\/sign-mac-adhoc\.cjs/);
assert.equal(packageConfig.scripts['electron:build:mac-m1'], 'npm run electron:build:mac');
console.log('PASS local mac build and alias retain the verified signing hook');

const dateSource = await readFile(new URL('../src/utils/date.ts', import.meta.url), 'utf8');
const dateModule = ts.transpileModule(dateSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { parseLocalDate, localDateKey, storedTimestampToIso } = await import(`data:text/javascript;base64,${Buffer.from(dateModule).toString('base64')}`);
for (const value of [undefined, null, {}, { seconds: null }, { seconds: NaN }, { seconds: Infinity }, { seconds: 1e30 }, { seconds: -1e30 }, { seconds: 'broken' }]) {
    assert.equal(storedTimestampToIso(value), undefined, 'invalid stored time must not throw during document listing');
}
assert.equal(storedTimestampToIso({ seconds: 0 }), '1970-01-01T00:00:00.000Z');
assert.equal(storedTimestampToIso({ seconds: '1700000000' }), '2023-11-14T22:13:20.000Z');
console.log('PASS malformed document timestamps cannot throw RangeError');
for (const value of ['2026-02-29', '2026-02-31', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', 'not-a-date']) {
    assert.equal(parseLocalDate(value), null, `Impossible date must not roll over: ${value}`);
}
for (const value of ['2024-02-29', '2026-09-30', '2000-02-29']) {
    assert.equal(localDateKey(parseLocalDate(value)), value);
    assert.equal(parseLocalDate(value).getHours(), 0);
}
assert.equal(parseLocalDate('0099-01-01').getFullYear(), 99);
assert.equal(localDateKey(parseLocalDate(' 2026-09-30 ')), '2026-09-30');
console.log('PASS local calendar parsing rejects overflow dates and preserves valid leap days');

// 예산 화면은 src/pages/budget/* 로 나뉘었으므로 페이지와 하위 파일을 함께 검사합니다.
const budgetDir = new URL('../src/pages/budget/', import.meta.url);
const budgetFiles = (await readdir(budgetDir)).filter(name => /\.(ts|tsx)$/.test(name));
const budgetSource = [
    await readFile(new URL('../src/pages/BudgetManagement.tsx', import.meta.url), 'utf8'),
    ...(await Promise.all(budgetFiles.map(name => readFile(new URL(name, budgetDir), 'utf8')))),
].join(String.fromCharCode(10));
const toolsSource = await readFile(new URL('../src/pages/AITools.tsx', import.meta.url), 'utf8');
const exportSource = await readFile(new URL('../src/utils/localDocumentExport.ts', import.meta.url), 'utf8');
const previewSource = await readFile(new URL('../src/components/RehabPlanTemplatePreview.tsx', import.meta.url), 'utf8');
const fileServiceSource = await readFile(new URL('../electron/fileService.cjs', import.meta.url), 'utf8');
const cssSource = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');
const previewCssSource = await readFile(new URL('../src/components/RehabPlanTemplatePreview.css', import.meta.url), 'utf8');
const previewComponentSource = await readFile(new URL('../src/components/RehabPlanTemplatePreview.tsx', import.meta.url), 'utf8');
const preloadSource = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const saveNoticeSource = await readFile(new URL('../src/components/JjssFileSaveNotice.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(budgetSource, /setForm\(\{\s*\.\.\.form,/);
assert.doesNotMatch(budgetSource, /setProjectForm\(\{\s*\.\.\.projectForm,/);
assert.doesNotMatch(budgetSource, /setDocForm\(\{\s*\.\.\.docForm,/);
// 검사 대상이 실제로 존재하는지 확인해 빈 검사가 되지 않게 합니다.
assert.match(budgetSource, /setForm\(prev\s*=>/);
assert.match(budgetSource, /setProjectForm\(prev\s*=>/);

let state = { name: '', memo: '' };
const updates = [
    previous => ({ ...previous, name: 'A' }),
    previous => ({ ...previous, memo: 'B' }),
    previous => ({ ...previous, name: 'AB' }),
];
for (const update of updates) state = update(state);
assert.deepEqual(state, { name: 'AB', memo: 'B' });
console.log('PASS budget functional updater preserves batched fields');

assert.match(toolsSource, /}, \[activeTool\?\.id\]\);/);
assert.doesNotMatch(toolsSource, /}, \[activeTool\]\);/);
assert.match(toolsSource, /key=\{field\.key\}/);
assert.doesNotMatch(toolsSource, /key=\{(?:JSON\.stringify\(toolForm\)|Date\.now\(\)|field\.value)\}/);
console.log('PASS tool form resets only when stable tool id changes');

for (const stage of ['prepare', 'serialize', 'svg-render', 'primary-canvas', 'primary-blob', 'fallback-start', 'fallback-canvas', 'fallback-blob', 'save-dialog', 'ipc-transfer', 'file-write', 'complete']) {
    assert.ok(exportSource.includes(`'${stage}'`), `missing PNG stage: ${stage}`);
}
assert.match(previewSource, /if \(result\?\.canceled\) return;/);
assert.match(previewSource, /if \(result\.canceled\) return;/);
assert.match(fileServiceSource, /lastSaveDirectories\.get\(category\)/);
assert.match(fileServiceSource, /path\.resolve\(path\.normalize\(result\.filePath\)\)/);
assert.match(fileServiceSource, /verifyWrittenFile/);
assert.doesNotMatch(fileServiceSource.match(/async function chooseSavePath[\s\S]*?\n}/)?.[0] || '', /isPathInside|outside-jjss-root/);
console.log('PASS PNG stages, cancel handling, free normalized paths, and write verification');

assert.match(cssSource, /select option[\s\S]*?color: #f8fafc/);
assert.match(cssSource, /select option:checked[\s\S]*?background-color: #5b21b6/);
assert.match(cssSource, /\[role='option'\]\[aria-selected='true'\]/);
console.log('PASS native and custom dropdown contrast rules');

assert.match(fileServiceSource, /file-save-preferences\.json/);
assert.match(fileServiceSource, /preferredDrive \|\| 'D:\\\\'/);
assert.match(fileServiceSource, /fsp\.access\(driveRoot, fs\.constants\.W_OK\)/);
assert.match(fileServiceSource, /path\.join\(app\.getPath\('documents'\), 'JJSS'\)/);
assert.doesNotMatch(fileServiceSource, /C:\\\\Users\\\\[A-Za-z0-9._-]+/);
assert.match(fileServiceSource, /lastSaveDirectories: Object\.fromEntries/);
assert.match(fileServiceSource, /existingSuggestedDirectory/);
assert.match(fileServiceSource, /registerSavedDirectory\(destination\.filePath\)/);
assert.match(preloadSource, /openSavedDirectory: openToken/);
assert.doesNotMatch(preloadSource, /openSavedDirectory: (?:filePath|directoryPath|path)/);
assert.match(saveNoticeSource, /openSavedDirectory\(saved\.openToken!/);
assert.doesNotMatch(saveNoticeSource, /openJjssFolder\(saved\.category\)/);
console.log('PASS persisted save folders and token-scoped actual-folder opening');

assert.match(previewCssSource, /--rehab-goal-label-width: 39mm/);
assert.match(previewCssSource, /rehab-plan-goal-col-long \{ width: var\(--rehab-goal-label-width\)/);
assert.match(previewComponentSource, /<col className="rehab-plan-goal-col-long"/);
assert.match(previewCssSource, /\.rehab-plan-form-table \.rehab-plan-col-section \{ width: 11mm; \}/);
assert.match(previewCssSource, /\.rehab-plan-form-table \.rehab-plan-col-label \{ width: 28mm; \}/);
console.log('PASS vocational-goal 11mm + 28mm boundary matches 39mm long-term-goal column');
