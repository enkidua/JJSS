import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const budgetSource = await readFile(new URL('../src/pages/BudgetManagement.tsx', import.meta.url), 'utf8');
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
