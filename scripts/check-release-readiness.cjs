const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const EXPECTED_APP_ID = 'com.jjss.desktop';
const EXPECTED_PRODUCT_NAME = 'JJSS';
const EXPECTED_WINDOWS_EXECUTABLE = 'JJSS-Pro';
const PRIVATE_CERT_EXTENSIONS = new Set(['.pfx', '.p12', '.pem', '.key']);
const SKIP_SCAN_DIRECTORIES = new Set(['.git', 'node_modules']);
// 이 두 파일이 없으면 빌드는 성공해도 Tailwind가 적용되지 않아 화면 스타일이 전부 깨진다.
const REQUIRED_BUILD_FILES = ['tailwind.config.cjs', 'postcss.config.cjs', 'index.html', 'vite.config.ts'];
const NODE_BUILTIN_MODULES = new Set(require('node:module').builtinModules);

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, relativePath), 'utf8'));
}

function runGit(args) {
    const result = spawnSync('git', args, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        windowsHide: true,
    });
    if (result.status !== 0) {
        throw new Error('Git 상태를 확인하지 못했습니다. Git 저장소에서 다시 실행해 주세요.');
    }
    return result.stdout.replace(/\r/g, '');
}

function findPrivateCertificates(directory, found = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && SKIP_SCAN_DIRECTORIES.has(entry.name)) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            findPrivateCertificates(absolutePath, found);
        } else if (PRIVATE_CERT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            found.push(path.relative(PROJECT_ROOT, absolutePath).replace(/\\/g, '/'));
        }
    }
    return found;
}

function isSensitiveTrackedPath(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const baseName = path.posix.basename(normalized).toLowerCase();
    return baseName === '.env'
        || baseName.startsWith('.env.')
        || PRIVATE_CERT_EXTENSIONS.has(path.extname(baseName))
        || /(^|\/)(secrets?|credentials)(\.[^/]+)?$/i.test(normalized)
        || /(^|\/)service-account[^/]*\.json$/i.test(normalized);
}

function findElectronRuntimeRequires() {
    const electronDirectory = path.join(PROJECT_ROOT, 'electron');
    const required = new Set();
    for (const entry of fs.readdirSync(electronDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !/\.(c?js|mjs)$/.test(entry.name)) continue;
        const source = fs.readFileSync(path.join(electronDirectory, entry.name), 'utf8');
        for (const match of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
            const specifier = match[1];
            if (specifier.startsWith('.') || specifier.startsWith('node:') || specifier === 'electron') continue;
            const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
            if (!NODE_BUILTIN_MODULES.has(packageName)) required.add(packageName);
        }
    }
    return required;
}

function isGitIgnored(relativePath) {
    const result = spawnSync('git', ['check-ignore', '-q', '--', relativePath], { cwd: PROJECT_ROOT, windowsHide: true });
    return result.status === 0;
}

const checks = [];
function check(label, passed, detail) {
    checks.push({ label, passed, detail });
}
function warn(label, detail) {
    checks.push({ label, passed: true, warning: true, detail });
}

try {
    const packageJson = readJson('package.json');
    const packageLock = readJson('package-lock.json');
    const version = typeof packageJson.version === 'string' ? packageJson.version.trim() : '';
    const lockRootVersion = packageLock.packages?.['']?.version;
    const build = packageJson.build || {};
    const nsis = build.nsis || {};
    const win = build.win || {};
    const scripts = packageJson.scripts || {};

    check('package.json version', /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version), version || '없음');
    check('package-lock version 일치', packageLock.version === version && lockRootVersion === version, `package=${version || '없음'}, lock=${packageLock.version || '없음'}, root=${lockRootVersion || '없음'}`);
    check('appId 유지', build.appId === EXPECTED_APP_ID, build.appId || '없음');
    check('productName 유지', build.productName === EXPECTED_PRODUCT_NAME, build.productName || '없음');
    check('기존 Windows 실행파일명 유지', win.executableName === EXPECTED_WINDOWS_EXECUTABLE, win.executableName || '없음');
    check('기존 per-machine 설치 범위 유지', nsis.perMachine === true, `perMachine=${String(nsis.perMachine)}`);
    check('안전한 NSIS 실행 검사 연결', nsis.include === 'electron/jjss-installer.nsh', nsis.include || '없음');
    check('앱 데이터 삭제 비활성', nsis.deleteAppDataOnUninstall !== true, `deleteAppDataOnUninstall=${String(nsis.deleteAppDataOnUninstall)}`);
    check('signed build 사전검사 연결', typeof scripts['electron:build:win:signed'] === 'string' && scripts['electron:build:win:signed'].includes('check-win-signing.cjs'), scripts['electron:build:win:signed'] ? '연결됨' : '없음');

    const missingBuildFiles = REQUIRED_BUILD_FILES.filter(file => !fs.existsSync(path.join(PROJECT_ROOT, file)));
    check('빌드 설정 파일 존재(Tailwind·PostCSS 포함)', missingBuildFiles.length === 0, missingBuildFiles.length ? `누락: ${missingBuildFiles.join(', ')}` : REQUIRED_BUILD_FILES.join(', '));

    const iconReferences = [['win.icon', win.icon], ['mac.icon', build.mac?.icon], ['dmg.icon', build.dmg?.icon]]
        .filter(([, value]) => typeof value === 'string');
    const missingIcons = iconReferences.filter(([, value]) => !fs.existsSync(path.join(PROJECT_ROOT, value)));
    check('Windows 앱 아이콘 지정', typeof win.icon === 'string', win.icon || '없음(기본 Electron 아이콘)');
    check('아이콘 파일 존재', missingIcons.length === 0, missingIcons.length ? missingIcons.map(([key, value]) => `${key}=${value}`).join(', ') : iconReferences.map(([key, value]) => `${key}=${value}`).join(', ') || '지정 없음');
    for (const iconPath of new Set(iconReferences.map(([, value]) => value))) {
        if (isGitIgnored(iconPath)) {
            warn('아이콘 파일이 .gitignore에 걸림', `${iconPath} — 새로 받은 저장소에서 빠지면 빌드가 실패합니다. .gitignore의 "build/"를 "build/*"로 바꾸고 "!${iconPath}"를 추가하세요`);
        }
    }

    check('자동 업데이트 게시 설정 없음', build.publish === null, `publish=${JSON.stringify(build.publish)}`);

    const electronRequires = findElectronRuntimeRequires();
    const runtimeDependencies = Object.keys(packageJson.dependencies || {});
    const bundledOnlyDependencies = runtimeDependencies.filter(name => !electronRequires.has(name));
    const missingRuntimeDependencies = [...electronRequires].filter(name => !runtimeDependencies.includes(name));
    check('설치 파일에 불필요한 node_modules 없음', bundledOnlyDependencies.length === 0, bundledOnlyDependencies.length ? `Vite가 번들하므로 devDependencies로 옮길 것: ${bundledOnlyDependencies.join(', ')}` : `dependencies=${runtimeDependencies.length}개`);
    check('Electron 메인 프로세스 의존성 선언', missingRuntimeDependencies.length === 0, missingRuntimeDependencies.length ? `dependencies에 필요: ${missingRuntimeDependencies.join(', ')}` : 'Electron·Node 내장 모듈만 사용');

    const privateCertificates = findPrivateCertificates(PROJECT_ROOT);
    check('프로젝트 내부 개인 인증서 없음', privateCertificates.length === 0, privateCertificates.length ? privateCertificates.join(', ') : '없음');

    const trackedFiles = runGit(['ls-files']).split('\n').filter(Boolean);
    const trackedSensitiveFiles = trackedFiles.filter(isSensitiveTrackedPath);
    check('Git 추적 민감 파일 없음', trackedSensitiveFiles.length === 0, trackedSensitiveFiles.length ? trackedSensitiveFiles.join(', ') : '없음');

    const statusLines = runGit(['status', '--porcelain', '--untracked-files=all']).split('\n').filter(Boolean);
    const generatedChanges = statusLines.filter(line => {
        const filePath = line.slice(3).replace(/^"|"$/g, '').replace(/\\/g, '/');
        return /^(release|dist|node_modules)\//.test(filePath);
    });
    check('생성 디렉터리 Git 변경 없음', generatedChanges.length === 0, generatedChanges.length ? `${generatedChanges.length}개 변경 발견` : '없음');
} catch (error) {
    check('검증 스크립트 실행', false, error instanceof Error ? error.message : '알 수 없는 오류');
}

for (const item of checks) {
    const status = item.warning ? 'WARN' : item.passed ? 'PASS' : 'FAIL';
    console.log(`${status} ${item.label}: ${item.detail}`);
}

const failed = checks.filter(item => !item.passed);
if (failed.length) {
    console.error(`\n릴리즈 준비 검증 실패: ${failed.length}개 항목을 확인해 주세요.`);
    process.exit(1);
}

console.log('\n릴리즈 준비 검증 PASS');
