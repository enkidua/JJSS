// 화면 훅(React)의 동시 실행·세션 보호가 빠지지 않았는지 소스 수준에서 확인한다.
// 이 훅들은 단위 실행 틀이 없어, 15차에서 고친 잠금·세션 규칙이 지워지면 여기서 알린다(합성 데이터·네트워크 없음).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// 사례관리: 저장 문서 조회 중에는 생성·저장을 막고, 늦게 온 AI 응답은 다른 이용자 화면에 넣지 않는다.
{
    const source = await read('src/pages/workmate/useCaseDocumentPipeline.ts');
    assert.match(source, /caseLoadingRef\.current = true;/);
    assert.match(source, /const caseLocked = \(\) => caseDocSaveInFlightRef\.current \|\| caseGeneratingRef\.current \|\| caseLoadingRef\.current;/);
    for (const action of ['generateCaseDoc', 'refineCaseDoc', 'resetCaseResult', 'deleteCaseDoc']) {
        const body = source.slice(source.indexOf(`const ${action} = async`), source.indexOf(`const ${action} = async`) + 400);
        assert.match(body, /caseLocked\(\)/, `${action}은 조회 중 잠금을 확인해야 합니다`);
    }
    assert.equal((source.match(/if \(stale\(\)\) return;/g) || []).length >= 5, true, '네 가지 생성 결과와 오류 모두 세션을 확인');
    assert.match(source, /저장된 회의록·계획서를 모르는 채로 작성을 시작하면/);
    const workmate = await read('src/pages/WorkMate.tsx');
    assert.match(workmate, /const caseBusy = isGenerating \|\| savingCaseDocType !== null \|\| pipeline\.caseLoading;/);
    console.log('PASS case pipeline locks generation/saving while loading and drops stale AI results');
}

// 직무분석지: 사업체를 바꾸면 이전 사업체 사진·관찰 입력을 비우고, 다시 저장할 때 사진 목록도 갱신한다.
{
    const source = await read('src/pages/workmate/useEmploymentDocuments.ts');
    const handler = source.slice(source.indexOf('const handleSelectJobAnalysisJob'), source.indexOf('const handleSelectEmploymentSeeker'));
    assert.match(handler, /hasAnyText\(jobAnalysisForm, \['companyName', 'jobRole'\]\) \|\| jobAnalysisPhotos\.length > 0/);
    assert.match(handler, /setJobAnalysisPhotos\(\[\]\);/);
    assert.match(handler, /URL\.revokeObjectURL/);
    assert.match(handler, /\.\.\.EMPTY_JOB_ANALYSIS_FORM,/);
    assert.match(source, /await updateCaseDocument\(currentDoc\.id, content, extra\);/);
    console.log('PASS job analysis clears previous employer photos/inputs and refreshes photo names on update');
}

// 일괄 등록: 중복은 건너뛰고, 원래 줄 번호로 알리며, 중간에 멈추면 저장 건수를 알린다.
{
    const source = await read('src/components/JobSeekerModal.tsx');
    assert.match(source, /planBulkRegistration\(parsedRows,/);
    assert.match(source, /splitBulkRegistrationLines\(bulkData\)/);
    assert.match(source, /const reportInterrupted = \(\) =>/);
    assert.equal((source.match(/reportInterrupted\(\); return;/g) || []).length, 3, '세션이 끝나는 세 지점 모두 저장 건수를 알림');
    assert.match(source, /\$\{row\.line\}번째 줄의 열 수가 부족합니다/);
    console.log('PASS bulk registration skips duplicates, reports original line numbers and interrupted saves');
}

// 기존 직업평가 탭: 분석·보완(소견서 작성·보완)은 같은 결과칸에서 한 번에 하나, 보완 중에는 결과칸을 잠근다.
{
    const source = await read('src/pages/VocationalEvaluation.tsx');
    for (const [ref, handlers] of [['analysisBusyRef', ['handleAnalyze', 'refineAnalysisResult', 'clearAnalyzer']], ['reportBusyRef', ['handleGenerateReport', 'refineReportResult', 'clearReport']]]) {
        for (const handler of handlers) {
            const body = source.slice(source.indexOf(`const ${handler} = async`), source.indexOf(`const ${handler} = async`) + 300);
            assert.match(body, new RegExp(`${ref}\\.current`), `${handler}은 ${ref}를 확인해야 합니다`);
        }
    }
    assert.match(source, /readOnly=\{isRefiningAnalysis\}/);
    assert.match(source, /readOnly=\{isRefiningReport\}/);
    assert.doesNotMatch(source, /setAnalyzerResult\(previous\)|setReportResult\(previous\)/, '실패 시 보완 시작 시점 값으로 되돌리지 않음');
    console.log('PASS legacy evaluation tab serializes analysis/refine per result field and locks it while refining');
}

// 직업훈련 자료를 읽는 다른 화면(현황판·지원 일정·AI 참고 내용)은 직업훈련 화면의 예약된 저장이 끝난 뒤 읽는다.
{
    for (const file of ['src/pages/overview/useSeekerOverview.ts', 'src/components/RehabDueBoard.tsx', 'src/services/clientContextService.ts']) {
        const source = await read(file);
        assert.match(source, /readTrainingStateAfterWrites<TrainingState>\(\)/, `${file}은 쓰기 큐를 거쳐 읽어야 합니다`);
        assert.doesNotMatch(source, /getById<TrainingState>\('trainingState'/, `${file}이 큐를 건너뛰고 직접 읽음`);
    }
    const hook = await read('src/pages/training/useTrainingState.ts');
    assert.match(hook, /return enqueueTrainingWrite\(run\);/);
    assert.match(hook, /await waitForTrainingWrites\(\);/);
    console.log('PASS training readers outside the training page wait for queued training writes');
}

// 복원이 실패하고 원복도 일부 실패하면(저장소가 섞임) 성공 때처럼 다시 불러올 때까지 쓰기를 막고 화면을 다시 불러온다.
{
    const db = await read('src/config/localDB.ts');
    assert.match(db, /throw Object\.assign\(restoreError, \{ storageMixed: rollbackErrors\.length > 0 \}\);/);
    assert.match(db, /if \(isRestoreStorageMixedError\(error\)\) sealedUntilReload = true;/);
    const backup = await read('src/hooks/useBackupActions.ts');
    assert.match(backup, /if \(isRestoreStorageMixedError\(error\)\) \{[\s\S]*?allowUnloadWithoutPrompt\(\);[\s\S]*?window\.location\.reload\(\)/);
    console.log('PASS mixed restore failure seals storage and reloads instead of continuing on pre-restore state');
}

// PDF 글자 추출: Electron 36에서 동작하는 legacy 빌드를 쓰고, PDF 안 스크립트는 실행하지 않는다.
{
    const pdf = await read('src/services/localPdfText.ts');
    assert.match(pdf, /'\/node_modules\/pdfjs-dist\/legacy\/build\/pdf\.min\.mjs'/);
    assert.match(pdf, /'\/node_modules\/pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs'/);
    assert.match(pdf, /enableScripting: false,/);
    assert.match(pdf, /isEvalSupported: false,/);
    console.log('PASS local PDF extraction uses the Electron-compatible legacy build with scripting disabled');
}
