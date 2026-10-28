// 자동 업데이트 실제 확인(Windows, 서명된 빌드 필요): 패키징된 앱이 로컬 업데이트 피드에서
//   ① 새 버전을 찾고 ② 내려받아 ③ sha512와 서명(CN=JJSS)을 확인한 뒤 "설치 준비됨"이 되는지,
//   그리고 서명이 다른 설치파일은 거부하는지 확인한다. 실제 설치(UAC)는 하지 않는다.
//
// 실행: npm run electron:build:win:signed 후  node scripts/test-update-e2e.cjs
//
// 격리: release/win-unpacked를 임시 폴더로 복사하고 그 사본의 resources/app-update.yml만 로컬 피드로 바꾼다.
// 앱은 --user-data-dir로 임시 사용자 폴더를 쓰며, 실제 사용자 데이터 폴더가 바뀌지 않았는지 끝에 확인한다.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const release = path.join(root, 'release');
const pkg = require(path.join(root, 'package.json'));

function sha512(file) {
    return crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64');
}

function startFeed(files) {
    const server = http.createServer((request, response) => {
        const name = decodeURIComponent(new URL(request.url, 'http://x').pathname.slice(1));
        const entry = files[name];
        if (!entry) { response.writeHead(404); response.end(); return; }
        const body = typeof entry === 'string' ? Buffer.from(entry) : fs.readFileSync(entry.file);
        response.writeHead(200, { 'Content-Length': body.length });
        response.end(body);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function realUserDataStamp() {
    const dir = path.join(process.env.APPDATA || '', pkg.name);
    try {
        return fs.statSync(dir).mtimeMs;
    } catch {
        return null;
    }
}

async function runScenario({ name, installerFile, expectPhase, expectMessage }) {
    const nextVersion = pkg.version.replace(/(\d+)$/, value => String(Number(value) + 1));
    const installerName = `JJSS-Setup-${nextVersion}.exe`;
    const latestYml = [
        `version: ${nextVersion}`,
        'files:',
        `  - url: ${installerName}`,
        `    sha512: ${sha512(installerFile)}`,
        `    size: ${fs.statSync(installerFile).size}`,
        `path: ${installerName}`,
        `sha512: ${sha512(installerFile)}`,
        `releaseDate: '${new Date().toISOString()}'`,
        '',
    ].join('\n');
    const server = await startFeed({ 'latest.yml': latestYml, [installerName]: { file: installerFile } });
    const feedUrl = `http://127.0.0.1:${server.address().port}`;
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jjss-update-e2e-'));
    const appDir = path.join(work, 'app');
    const userData = path.join(work, 'user-data');
    let application;
    try {
        fs.cpSync(path.join(release, 'win-unpacked'), appDir, { recursive: true });
        const updateYmlPath = path.join(appDir, 'resources', 'app-update.yml');
        const original = fs.readFileSync(updateYmlPath, 'utf8');
        const publisher = /publisherName:\s*\n?\s*-?\s*(.+)/.exec(original)?.[1]?.trim();
        assert.ok(publisher, '서명 빌드의 app-update.yml에 publisherName이 있어야 함(서명 검증 근거)');
        fs.writeFileSync(updateYmlPath, `provider: generic\nurl: ${feedUrl}\nupdaterCacheDirName: jjss-updater-e2e\npublisherName:\n  - ${publisher}\n`);
        application = await _electron.launch({
            executablePath: path.join(appDir, `${pkg.build.win.executableName}.exe`),
            args: [`--user-data-dir=${userData}`],
            env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
            timeout: 30000,
        });
        const page = await application.firstWindow();
        await page.waitForFunction(() => Boolean(window.jjssUpdates), null, { timeout: 30000 });
        const checked = await page.evaluate(() => window.jjssUpdates.check());
        assert.equal(checked.phase, 'available', `${name}: 새 버전 ${nextVersion}을 찾아야 함 (받은 상태 ${JSON.stringify(checked)})`);
        assert.equal(checked.availableVersion, nextVersion);
        const downloaded = await page.evaluate(() => window.jjssUpdates.download());
        assert.equal(downloaded.phase, expectPhase, `${name}: ${JSON.stringify(downloaded)}`);
        if (expectMessage) assert.match(downloaded.message, expectMessage);
        const userDataPath = await application.evaluate(({ app }) => app.getPath('userData'));
        assert.equal(path.resolve(userDataPath), path.resolve(userData), '테스트 앱은 임시 사용자 폴더만 사용');
        console.log(`PASS ${name}: found ${nextVersion} → ${downloaded.phase}${downloaded.message ? ` (${downloaded.message})` : ''}`);
    } finally {
        await application?.close().catch(() => undefined);
        server.close();
        fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    }
}

(async () => {
    assert.equal(process.platform, 'win32', 'Windows에서 실행');
    const installer = path.join(release, `JJSS-Setup-${pkg.version}.exe`);
    assert.ok(fs.existsSync(installer), `서명된 설치파일이 필요합니다: ${installer}`);
    assert.ok(fs.existsSync(path.join(release, 'win-unpacked', 'resources', 'app-update.yml')), 'release/win-unpacked가 필요합니다(서명 빌드 직후 실행)');
    const before = realUserDataStamp();
    await runScenario({ name: '같은 서명(CN=JJSS)의 새 버전', installerFile: installer, expectPhase: 'downloaded' });
    // 다른 서명자의 실행 파일(Node.js — OpenJS Foundation 서명)을 새 버전처럼 내보내면 설치 준비가 되면 안 된다.
    await runScenario({ name: '다른 서명자의 설치파일', installerFile: process.execPath, expectPhase: 'available', expectMessage: /서명을 확인하지 못해 설치하지 않았습니다/ });
    assert.equal(realUserDataStamp(), before, '실제 사용자 데이터 폴더는 건드리지 않음');
    console.log('update e2e passed — local feed only, no install performed.');
})().catch(error => {
    console.error(error);
    process.exit(1);
});
