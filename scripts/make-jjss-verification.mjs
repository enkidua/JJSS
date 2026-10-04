// JJSS 전체를 다른 AI가 검증할 수 있도록 자료를 만든다.
// 이전 패키지(ve-verification)는 직업평가 워크벤치만 담아 localDB 암호화·AI 게이트웨이를 독립 검증할 수 없었다.
// 이 패키지는 **앱 전체 소스와 실행 가능한 테스트**를 담는다.
//
// 넣지 않는 것: node_modules, dist, release, .git, .env, 인증서·키 파일, 실제 업무 데이터.
// 사용: node scripts/make-jjss-verification.mjs  → release/jjss-verification-<버전>/ (+ .zip)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const NEWLINE = String.fromCharCode(10);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const outRoot = path.join(root, 'release', `jjss-verification-${pkg.version}`);
const appDir = path.join(outRoot, 'app');

/** 복사할 것 — 검증자가 그대로 `npm ci && npm run test:all` 할 수 있는 구성 */
const COPY_DIRS = ['src', 'electron', 'scripts', 'docs', 'public'];
const COPY_FILES = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'vite.config.ts',
    'tailwind.config.cjs',
    'postcss.config.cjs',
    'eslint.config.js',
    'index.html',
    '.gitignore',
    'README.md',
    'CLAUDE.md',
];

/**
 * 이름만으로 제외.
 * `public/templates`는 문서 배경 이미지(수십 MB)라 코드 검증에 쓰이지 않아 목록만 남기고 뺀다.
 */
const EXCLUDED_NAMES = new Set(['node_modules', 'dist', 'release', '.git', '.env', 'vision_key.json', 'templates']);
const EXCLUDED_PATTERN = /\.(pem|key|p12|pfx|crt|cer)$|^\.env|vision_key|credential|secret/i;

/** 복사한 내용에서 이 패턴이 보이면 자료를 만들지 않는다 */
const SECRET_PATTERNS = [
    { label: 'Google API key', re: /AIza[0-9A-Za-z_-]{30,}/ },
    { label: 'OpenAI key', re: /\bsk-[A-Za-z0-9]{20,}/ },
    { label: 'Anthropic key', re: /\bsk-ant-[A-Za-z0-9-]{20,}/ },
    { label: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { label: 'service account json', re: /"type"\s*:\s*"service_account"/ },
];

async function walk(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (EXCLUDED_NAMES.has(entry.name) || EXCLUDED_PATTERN.test(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(full)));
        else out.push(full);
    }
    return out;
}

await rm(outRoot, { recursive: true, force: true });
await mkdir(appDir, { recursive: true });

for (const dir of COPY_DIRS) {
    const source = path.join(root, dir);
    try {
        await stat(source);
    } catch {
        continue;
    }
    await cp(source, path.join(appDir, dir), {
        recursive: true,
        filter: src => {
            const name = path.basename(src);
            return !EXCLUDED_NAMES.has(name) && !EXCLUDED_PATTERN.test(name);
        },
    });
}
for (const file of COPY_FILES) {
    try {
        await cp(path.join(root, file), path.join(appDir, file));
    } catch {
        // 없는 파일은 건너뛴다.
    }
}

/* ── 비밀값 스캔 (하나라도 걸리면 중단) ───────────────────────── */

const copied = await walk(appDir);
const secretHits = [];
for (const file of copied) {
    if (/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|zip|docx|pdf)$/i.test(file)) continue;
    const content = await readFile(file, 'utf8').catch(() => '');
    for (const pattern of SECRET_PATTERNS) {
        if (pattern.re.test(content)) {
            secretHits.push(`${pattern.label}: ${path.relative(outRoot, file).split(path.sep).join('/')}`);
        }
    }
}
if (secretHits.length) {
    await rm(outRoot, { recursive: true, force: true });
    throw new Error(`비밀값으로 보이는 내용이 있어 자료를 만들지 않았습니다:\n- ${secretHits.join('\n- ')}`);
}

/* ── 테스트 실행 ─────────────────────────────────────────────── */

await mkdir(path.join(outRoot, 'test-results'), { recursive: true });
let testOutput;
let testPassed = true;
try {
    testOutput = execFileSync('npm', ['run', 'test:all'], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 40 * 1024 * 1024,
        shell: process.platform === 'win32',
    });
} catch (error) {
    testPassed = false;
    testOutput = `${error.stdout ?? ''}\n${error.stderr ?? ''}`;
}
await writeFile(path.join(outRoot, 'test-results', 'test-all.txt'), testOutput, 'utf8');
if (!testPassed) {
    throw new Error('test:all이 실패해 검증 자료를 만들지 않았습니다. test-results/test-all.txt를 확인하세요.');
}

/* ── 문서 ────────────────────────────────────────────────────── */

const srcFiles = (await walk(path.join(appDir, 'src'))).map(file =>
    path.relative(appDir, file).split(path.sep).join('/'),
);
const electronFiles = (await walk(path.join(appDir, 'electron'))).map(file =>
    path.relative(appDir, file).split(path.sep).join('/'),
);
/**
 * "포함된 검사" 목록은 이름이 test:로 시작한다고 나열하지 않고,
 * **실제로 test:all / verify:release가 호출하는 것**만 뽑는다.
 * 문서와 실제 실행이 어긋나면 검증 자체가 의미를 잃는다.
 */
function scriptsCalledBy(scriptName) {
    const command = pkg.scripts[scriptName] ?? '';
    return command
        .split('&&')
        .map(part => part.trim())
        .filter(part => part.startsWith('npm run '))
        .map(part => part.replace('npm run ', '').trim());
}

const testAllSteps = scriptsCalledBy('test:all');
const releaseSteps = scriptsCalledBy('verify:release').flatMap(step =>
    step === 'test:all' ? [step, ...testAllSteps] : [step],
);
const testScripts = [...new Set([...testAllSteps, ...releaseSteps])]
    .filter(name => name !== 'test:all')
    .map(name => ({ name, command: pkg.scripts[name] ?? '' }));

/**
 * 검사 건수는 문서에 적어 두지 않고 **방금 실행한 출력에서 읽는다**.
 * 손으로 적어 둔 숫자는 검사가 늘어나면 바로 어긋나, 문서의 신뢰를 떨어뜨린다.
 */
function countFromOutput(pattern, fallback) {
    const match = testOutput.match(pattern);
    return match ? `${match[1]}건` : fallback;
}
const veCheckCount = countFromOutput(/직업평가 워크벤치 테스트 (\d+)건 통과/, '');
const veCheckNote = veCheckCount ? ` (${veCheckCount})` : '';

const brief = `# JJSS 전체 검증 요청 (버전 ${pkg.version})

이 폴더는 **JJSS 앱 전체**를 다른 AI가 검증할 수 있도록 만든 자료입니다.
앞서 드린 \`ve-verification\` 패키지는 직업평가 워크벤치만 담아
"localDB 암호화 구현이 없어 독립 검증 불가", "gemini 구현이 없어 원본 PDF 전송 여부 확정 불가"라는 지적을 받았습니다.
**이번에는 앱 소스 전체와 실행 가능한 테스트를 담았습니다.**

- 실제 업무 데이터는 들어 있지 않습니다. 테스트·샘플의 이름·연락처·계좌는 모두 합성 값입니다.
- API 키, 인증서, \`.env\`, 서비스 계정 파일은 제외했고 **비밀값 패턴 스캔을 통과**해야만 이 자료가 만들어집니다.

---

## 1. 이 앱이 무엇인가

**JJSS(직업재활업무시스템)** — 장애인 직업재활 실무자가 쓰는 Windows·macOS 데스크톱 앱(Electron + React).
이용자 상담·직업평가·직업훈련·고용지원·예산을 한 곳에서 관리합니다.

**설계상 가장 중요한 두 가지**

1. **데이터는 서버가 아니라 이 PC에만** 저장됩니다(IndexedDB + 필드 단위 암호화).
2. **AI로 나가는 것은 비식별화된 업무 내용뿐**이며, 파일 원본은 사용자가 매번 확인해야 나갑니다.

---

## 2. 검증해 주셨으면 하는 것 (우선순위)

### A. 저장 데이터 암호화 (이전에 검증 불가였던 부분)
- \`app/src/config/localDB.ts\` — IndexedDB 저장·조회, 필드 단위 암호화 정책(\`SENSITIVE_POLICY\`)
- \`app/src/config/crypto.ts\` — AES-GCM, 키 파생
- \`app/electron/dataKey.cjs\` — OS 보안 저장소(Windows DPAPI / macOS Keychain) 봉투 암호화
- 확인 부탁: 어떤 필드가 평문으로 남는지, 설치본에서 키를 못 얻을 때 정말 쓰기를 막는지(fail-closed),
  복호화 실패 시 기존 데이터를 지우지 않는지, 백업 암호화(PBKDF2 310,000회 + AES-GCM)가 올바른지.
- 실행 가능한 검사: \`npm run test:secure-key\`, \`npm run test:crypto\`, \`npm run test:at-rest-migration\`

### B. 외부 AI 전송 경로 (원본 파일이 정말 안 나가는가)
- \`app/src/services/gemini.ts\` — 모든 텍스트·파일 요청이 지나는 곳
- \`app/src/services/aiPrivacyGateway.ts\` — 비식별화 관문, 첨부 처리(\`prepareAttachmentsForAI\`)
- \`app/src/services/attachmentConsent.ts\` — 원본 전송 확인(동의 C)
- \`app/src/services/localPdfText.ts\` — PC 안에서만 하는 PDF 글자 추출
- \`app/src/services/ocr.ts\` — Vision/Gemini OCR
- 확인 부탁: 텍스트 PDF의 **원본 바이트가 요청에 실릴 수 있는 경로**가 남아 있는지,
  확인(동의) 없이 원본이 나가는 우회가 있는지, 비식별화 매핑이 밖으로 나가지 않는지.
- **이번에 고친 곳을 특히 봐 주세요:** \`app/src/utils/anonymizer.ts\`의 \`NAME_FIELD_LABEL_PATTERN\`.
  쌍점 없는 이름 칸(\`이 름  홍길동\`, \`평가사 김정훈\`)을 가리되, 쌍점이 없으면 성씨로 시작하는 값만 이름으로 봅니다.
  (1) 표 서식의 이름이 여전히 새는 형태가 있는지, (2) 반대로 일반 문장("이름 확인", "평가사 소견")을 잘못 가리는지 두 방향 모두 확인 부탁드립니다.
  드문 성·외국식 이름은 사전(\`knownNames\`)에 없으면 이 규칙으로는 가려지지 않습니다(알려진 한계).
- 실행 가능한 검사: \`npm run test:privacy-outbound\`(가짜 제공업체가 실제 요청 본문을 가로채 검사), \`npm run test:anonymizer\`, \`npm run test:ai-safety\`

### C. AI 비용·재시도 안전장치
- \`app/src/services/gemini.ts\`의 요청 계획(\`buildAIRequestPlan\`)과 한도
- 고정값: 작업당 최대 3회, 제공업체당 1회, 자동 재시도 0회, 첨부 요청은 제공업체 전환 금지
- 확인 부탁: 이 한도를 우회할 수 있는 경로가 있는지, 파일 선택만으로 API가 호출되는지.
- 실행 가능한 검사: \`npm run test:ai-safety\`, \`npm run test:ai-api\`

### D. 직업평가 워크벤치 (새로 만든 기능)
- \`app/src/features/vocationalEvaluation/\`, \`app/src/pages/evaluation/\`
- 자세한 검증 항목은 \`vocational-evaluation-review.md\`에 따로 적었습니다.
- 실행 가능한 검사: \`npm run test:ve-workbench\`${veCheckNote}

### E. 기존 업무 기능
- 지원고용 수당 계산·서류(\`app/src/features/supportedEmployment/\`) — \`npm run test:supported-employment\`
- 예산 관리 정합성(\`app/src/pages/budget/\`) — \`npm run test:budget-calc\`
- 직업재활 현황판·워크플로 — \`npm run test:rehab-workflow\`, \`npm run test:rehab-plan-mapper\`

### F. Electron 주 프로세스
- \`app/electron/\` — 파일 저장 경로 제한, 프리로드 노출 API, 보안 설정
- 확인 부탁: 렌더러에 과하게 노출된 기능이 있는지, 임의 경로 쓰기가 가능한지.
- 실행 가능한 검사: \`npm run test:file-service\`, \`npm run test:runtime-safety\`

---

## 3. 이 자료를 만들 때 실제로 통과한 것

\`npm run test:all\`을 실행해 **전부 통과**한 뒤에만 이 폴더가 만들어집니다.
\`test:all\`은 빠른 코드 검사이고, 브라우저 검사와 배포 빌드까지 포함한 전체 검증은 \`npm run verify:release\`입니다.
출력은 \`test-results/test-all.txt\`에 그대로 담았습니다.

포함된 검사(${testScripts.length}종):

${testScripts.map(item => `- \`${item.name}\``).join('\n')}

추가로 \`npm run typecheck\`(TypeScript strict, 미사용 변수 포함)가 같은 명령에 들어 있습니다.

---

## 4. 직접 돌려 보는 법

\`\`\`bash
cd app
npm ci
npm run test:all
\`\`\`

- Node.js 22 이상이 필요합니다.
- 네트워크·API 키 없이 돌아갑니다(모든 AI 검사는 가짜 제공업체를 씁니다).
- \`test:all\`은 브라우저가 필요 없는 빠른 검사입니다.
- 브라우저 검사(\`test:data-at-rest\`, \`test:usability\`)와 배포 빌드 검증까지 한 번에 하려면
  \`npm run verify:release\`를 실행하세요(시간이 더 걸리고 Playwright·Electron이 필요합니다).

---

## 5. 폴더 구성

| 경로 | 내용 |
|---|---|
| \`00-review-request.md\` | 이 문서 |
| \`architecture.md\` | 구조와 데이터 흐름, 파일 목록 |
| \`privacy-and-security.md\` | 개인정보·보안 점검 항목 |
| \`vocational-evaluation-review.md\` | 직업평가 워크벤치 검증 항목 |
| \`known-limitations.md\` | 아직 확인하지 못한 것 |
| \`app/\` | **앱 소스 전체** (실제 저장소 구조 그대로, 바로 실행 가능) |
| \`test-results/test-all.txt\` | 전체 테스트 실행 결과 |
| \`SHA256SUMS.txt\` | 모든 파일 지문 (ASCII 경로) |

> 파일명은 \`sha256sum -c\`가 인코딩 문제 없이 확인할 수 있도록 ASCII로 지었습니다.
> 앱 소스 안의 한글 파일명은 없습니다.
`;

const architecture = `# 구조와 파일 목록

버전 ${pkg.version} · Electron ${pkg.devDependencies.electron} · React ${pkg.devDependencies.react} · Vite ${pkg.devDependencies.vite}

## 데이터 흐름

\`\`\`
사용자 입력
   ↓
React 화면 (src/pages, src/components)
   ↓
zustand 스토어 (src/store)
   ↓
localDB (src/config/localDB.ts)   ── 필드 단위 암호화 (src/config/crypto.ts)
   ↓
IndexedDB  "JJSS_LOCAL_DB"        ── 키는 OS 보안 저장소로 봉인 (electron/dataKey.cjs)


AI 기능
   ↓
services/gemini.ts  generateText()
   ↓
aiPrivacyGateway.prepareAIOutboundText()   ── 이름·연락처·생년월일 등 비식별화
aiPrivacyGateway.prepareAttachmentsForAI() ── 텍스트 PDF는 글만, 그 외는 동의 C
   ↓
외부 제공업체 (Gemini / OpenAI / Anthropic / Vision)
   ↓
restoreAIResponse()  ── PC 안에서만 이름 복원
\`\`\`

## 주요 디렉터리

| 경로 | 역할 |
|---|---|
| \`app/src/config/\` | IndexedDB 저장소, 암호화, 앱 설정 |
| \`app/src/services/\` | AI 호출, 비식별화 관문, OCR, PDF 로컬 추출, 파일 저장 |
| \`app/src/features/\` | 업무 도메인 로직(직업평가, 지원고용, 문서 렌더러) |
| \`app/src/pages/\` | 화면 |
| \`app/src/store/\` | 전역 상태 |
| \`app/electron/\` | Electron 주 프로세스·프리로드·데이터 키·파일 서비스 |
| \`app/scripts/\` | 테스트·검증 스크립트 |
| \`app/docs/\` | 설계·감사 문서 |

## 소스 파일 (${srcFiles.length}개)

<details><summary>펼치기</summary>

${srcFiles.map(file => `- \`${file}\``).join('\n')}

</details>

## Electron (${electronFiles.length}개)

${electronFiles.map(file => `- \`${file}\``).join('\n')}
`;

const privacy = `# 개인정보·보안 검증 항목

앱이 주장하는 내용과 그것을 확인할 코드 위치를 함께 적었습니다.
**주장이 코드와 다르면 그 자체가 결함입니다.**

## 1. 저장

| 주장 | 확인할 곳 |
|---|---|
| 데이터는 서버가 아니라 PC에만 저장된다 | \`src/config/localDB.ts\` 전체. 네트워크 호출이 없어야 함 |
| 사람을 알아볼 수 있는 필드는 암호화한다 | \`localDB.ts\`의 \`SENSITIVE_POLICY\` — \`allExcept\`에 남는 평문 필드가 적절한지 |
| 키는 OS 보안 저장소로 봉인한다 | \`electron/dataKey.cjs\`, \`src/config/crypto.ts\` |
| 설치본은 키를 못 얻으면 새 개인정보 저장을 막는다 | \`crypto.ts\`의 fail-closed 경로 |
| 복호화 실패 시 기존 데이터를 지우지 않는다 | \`localDB.ts\`의 \`DataDecryptError\` 처리 |
| 백업은 비밀번호로 암호화한다(PBKDF2 310,000 + AES-GCM) | \`localDB.ts\`의 \`createBackupJson\` / \`importAllData\` |

실행: \`npm run test:secure-key\`, \`npm run test:crypto\`, \`npm run test:at-rest-migration\`

## 2. 외부 전송

| 주장 | 확인할 곳 |
|---|---|
| 모든 텍스트 요청은 비식별화 관문을 지난다 | \`services/gemini.ts\` \`generateText\` → \`prepareAIOutboundText\` |
| 글자가 있는 PDF는 글만 보내고 원본은 보내지 않는다 | \`aiPrivacyGateway.prepareAttachmentsForAI\`, \`features/vocationalEvaluation/sourceDocument/extraction.ts\` |
| 스캔본·이미지 원본은 매번 확인 후에만 보낸다 | \`services/attachmentConsent.ts\`, \`assertAttachmentApproved\` |
| 첨부가 있는 요청은 제공업체를 자동 전환하지 않는다 | \`gemini.ts\` \`lockAttachmentRequestPlan\` |
| 비식별화 대응표는 외부로 나가지 않는다 | \`aiPrivacyGateway.ts\` \`restoreAIResponse\` |
| 이미지 생성 프롬프트도 가려서 보낸다 | \`prepareImagePrompt\` |

실행: \`npm run test:privacy-outbound\`, \`npm run test:anonymizer\`, \`npm run test:ai-safety\`

**특히 찾아 주셨으면 하는 것:** 관문을 거치지 않고 외부로 나가는 경로, 확인 없이 원본이 실리는 우회.

## 3. AI 비용 안전장치 (변경 금지 대상)

\`\`\`
MAX_ATTEMPTS_PER_JOB = 3
MAX_ATTEMPTS_PER_PROVIDER_PER_JOB = 1
MAX_AUTOMATIC_RETRIES = 0
\`\`\`

- 같은 제공업체 재시도 금지, 제공업체 재방문 금지, 첨부 요청 전환 금지, 파일 선택만으로 호출 금지.
- 확인할 곳: \`gemini.ts\`의 \`buildAIRequestPlan\`, \`beginAIRequestJob\`, \`executeAIRequestPlan\`

실행: \`npm run test:ai-safety\`, \`npm run test:ai-api\`

## 4. 문구와 코드의 일치

앱은 과장된 보안 문구를 쓰지 않기로 했습니다. 아래 표현이 코드나 화면에 있으면 결함입니다.

- "개인정보가 외부로 전혀 나가지 않습니다"
- "100% 안전합니다"
- "완벽한 비식별화입니다"
- "해킹할 수 없습니다"

관련 문서: \`app/docs/PRIVACY_SECURITY.md\`, \`app/docs/PRIVACY_OUTBOUND_AUDIT.md\`, \`app/docs/PRIVACY_STORAGE_AUDIT.md\`
`;

const veReview = `# 직업평가 워크벤치 검증 항목

\`app/src/features/vocationalEvaluation/\` + \`app/src/pages/evaluation/\`

## 무엇을 하는 기능인가

한국장애인고용공단(KEAD) 작업표본검사 2종의 실시 과정을 기록하고,
공단 프로그램이 만든 **공식 결과지를 읽어** 해석·보고서로 잇습니다.
**앱은 백분위를 계산하지 않습니다.**

## 앞선 적대적 검증에서 지적받아 고친 것

아래는 외부 검토에서 실제로 재현된 우회이고, 모두 고친 뒤 회귀 테스트를 남겼습니다.
**고친 것이 충분한지, 새 우회가 있는지 봐 주세요.**

| 지적 | 조치 | 확인할 곳 |
|---|---|---|
| 확정하지 않은 결과지 값이 해석에 들어감 | \`isOfficialDocumentUsable()\` 공통 관문 — \`SUCCEEDED\` + \`confirmedAt\` + 미대체 | \`sourceDocument/record.ts\` |
| 결과지를 여러 개 올리면 임의의 것이 선택됨 | \`selectActiveSourceDocument()\` — 최신 확정본 하나 | 〃 |
| INVALID 문장을 "고쳐서 채택"으로 우회 | \`editClaim()\`이 수정 문장을 다시 \`validateClaim()\` | \`interpretation/run.ts\` |
| STALE 해석이 보고서에 남음 | \`adoptedClaims()\`가 \`CURRENT\`만 허용 + 보고서 조립 전 재계산 | \`interpretation/run.ts\`, \`interpretation/staleness.ts\` |
| 다른 검사의 해석까지 STALE 처리되는 버그 | 같은 검사의 이전 실행만 \`SUPERSEDED\` | \`pages/evaluation/steps/InterpretationStep.tsx\` |
| 재요청하면 이전 AI 기록이 삭제됨 | 이력 보존(\`SUPERSEDED\`) | 〃 |
| 결과표에 공식값과 앱값이 섞임 | 총합·기록시간도 표에 표시한 값과 같은 출처 | \`report/compose.ts\` |
| 금지 표현 필터 우회("고용될 가능성", "정상적인 수준", "상위 십 퍼센트") | 패턴 보강 + 회귀 테스트 | \`interpretation/claimQuality.ts\` |
| 생년월일 대조가 실제 화면에서 작동 안 함 | 이용자 등록 정보와 PC에서 읽은 값을 검증기에 전달 | \`steps/SourceDocumentStep.tsx\` |
| 결과지 값 범위 검증 없음(음수·999999·문자열) | \`factValueIssue()\` — 검사 규격 기반 범위 | \`sourceDocument/valueLimits.ts\` |
| 저장 JSON을 고치면 검사 규격이 바뀜 | 복원 시 실시요강 값으로 강제 | \`model/sessionSerialization.ts\` |
| 저장 순서 경쟁조건 | 저장 큐 + \`revision\` 비교로 역행 저장 거부 | \`pages/evaluation/useSaveQueue.ts\`, \`storage.ts\` |
| debounce 때문에 마지막 수정 유실 | 화면 이탈·확정·출력 전 \`flush()\` | 〃 |
| 보관(ARCHIVED)인데 수정 가능 | 모든 단계에 \`locked\` 전달 | \`pages/evaluation/EpisodeDetail.tsx\` |
| 확정 보고서 지문 제거 우회 | \`confirmedAt\`이면 \`contentHash\` 필수 | \`report/serialization.ts\` |
| 텍스트 PDF인데 원본 첨부 생성 | 글을 읽었으면 **원본 첨부를 만들지 않음** | \`sourceDocument/extraction.ts\` |

## KEAD 실시요강 기준값

| 항목 | 코드의 값 | 확인할 곳 |
|---|---|---|
| 손기능 조건 | 7조건(소는 양손 포함) | \`tests/keadHandFunction.ts\` |
| 손기능 제한시간 | 조건당 30초 | 〃 |
| 손기능 시행 | 조건당 3회(총 21) | 〃 |
| 다차원 제한시간 | 1분 30초, 1회 | \`tests/keadBimanual.ts\` |
| 다차원 분모 | 판 1, 나머지 4 → **합계 25** | 〃 |
| 우세손 판정 | 질문 3문항 → 평가용지 18문항, 8개 이상 | \`dominantHand.ts\` |

실행: \`npm run test:ve-workbench\`${veCheckNote}

## 이번에 바꾼 곳 — 작성 엔진 통합(평가 진행 → 기존 결과분석기·종합소견서)

평가사가 "빈 칸이 너무 많고 분절적"이라고 해서 구조를 이렇게 통합했습니다:
**평가 진행(①~⑤)은 입력자료 공급자**이고, ⑥은 기존 결과분석기 엔진(\`services/gemini.ts\`의 \`analyzeTestResults\`),
⑦은 기존 종합소견서 엔진(\`generateReport\`)을 **복사 없이 그대로 재사용**하며, 출력만 새 결과보고서 양식을 씁니다.
새 코드라 특히 봐 주셨으면 합니다.

| 바뀐 내용 | 확인할 곳 |
|---|---|
| 공용 입력 조립기: 회차 자료(기본정보·KEAD·공식 결과지·관찰·분석지)를 두 엔진의 참고 내용으로 조립 | \`report/aiOpinion.ts\`의 \`buildOpinionReference\` (새 파일) |
| ⑥ "결과 분석" 카드: 자료 자동 연결 → 완성 해석 → 평가사 수정 → 회차에 저장 | \`pages/evaluation/steps/ResultAnalysisSection.tsx\`, \`model/episode.ts\`의 \`resultAnalysis\` |
| ⑥→⑦ 자동 전달: 수정된 결과 분석이 종합소견 입력에 그대로 들어가고, ⑥을 건너뛰면 ⑦이 분석 엔진을 내부 실행 | \`steps/ReportStep.tsx\`의 \`generateOpinion\` |
| 종합소견 8개 항목을 AI가 쓰고 칸별로 나눠 담음 | \`report/aiOpinion.ts\`의 \`parseOpinionText\` |
| 머리 정보·평가목적을 보고서에서 입력하지 않고 회차·이용자 정보에서 가져옴 | \`steps/ReportStep.tsx\`의 \`buildHeaderFrom\` |
| 장애·진단이력, 교육훈련·직업경력을 회차에 한 번만 입력 | \`model/episode.ts\`, \`steps/BasicInfoStep.tsx\`, \`report/compose.ts\` |
| 평가도구 표를 분석지 제목으로 자동 분류 | \`report/compose.ts\`의 \`TOOL_AREA_MATCHERS\`·\`fillToolRows\` |
| KEAD 검사 중 행동관찰은 사회진단이 아니라 직업진단 영역으로 | \`report/compose.ts\`의 \`composeSections\` |
| 프롬프트의 발달장애인 전제 제거(모든 장애유형) + 자료에 없는 수치·판단 생성 금지 블록 | \`services/gemini.ts\`의 \`analyzeTestResults\`·\`generateReport\` 프롬프트 |
| 요약에 칸 2개 추가(지원이 필요한 사항·종합소견) | \`report/model.ts\`, \`report/serialization.ts\`, \`report/document.ts\` |

기존 결과분석기·종합소견서 탭의 독립 사용은 그대로 동작해야 합니다(함수 서명 불변) — 깨진 곳이 보이면 그 자체가 결함입니다.

### 안정화(적대검증 지적사항) 수정

| 지적 | 조치 | 확인할 곳 |
|---|---|---|
| 새 보고서 저장 직후 AI 자동작성이 state 반영 전 실행돼 조용히 생략될 수 있음 | ref를 커밋 시점에 동기 갱신(\`commitReports\`) + \`generateOpinion\`이 ID가 아닌 **보고서 객체**를 받음 | \`steps/ReportStep.tsx\` |
| KEAD 값·결과지를 고쳐도 예전 결과분석이 그대로 쓰임 | 입력 자료 지문(\`analysisSourceHash\`)을 분석과 함께 저장하고, 어긋나면 STALE로 보아 다시 분석 | \`report/aiOpinion.ts\`, \`model/episode.ts\` |
| 실제 파일 이름(이용자명·기관명 포함)이 AI로 나갈 수 있음 | 전송용 제목 함수 분리(\`outboundAnalysisTitle\`) — 검사명만 쓰고 없으면 "추가 평가자료 N" | \`analysisDocument/model.ts\` |
| PDF 분류 실패 문장이 "사회진단"으로 들어감 | \`unclassified\`(분류 필요) 영역 신설, 기본 미포함·자동 배치 안 함 | 〃 |
| 검사명을 못 읽은 분석지가 평가도구 표에서 사라짐 | "기타 평가자료" 행으로 남김 | \`report/compose.ts\` |
| AI가 만든 문장이 다시 AI 입력이 되는 이중 영향 | legacy claim을 참고 내용에서 **기본 제외**(\`includeLegacyClaims\`) | \`report/aiOpinion.ts\` |
| 읽지 못한 암호화 항목을 빈 칸으로 채운 백업이 정상 파일로 나감 | \`BackupIncompleteError\`로 **fail-closed** | \`config/localDB.ts\`, \`hooks/useBackupActions.ts\` |
| 이관 미완료인데 "복원 완료" 표시 | 이관 결과를 확인해 미완료 사실을 알림 | \`hooks/useBackupActions.ts\` |
| 근로자의 날(5/1) 훈련일 제외 누락 | 고정 공휴일 표에 추가(대체공휴일 없음) | \`features/supportedEmployment/holidays.ts\` |

### 소견 품질 개선 — **이번에 가장 중요한 변경**

실제 생성된 보고서가 "대중교통 확인되지 않음 / 앉아 있기 확인되지 않음 / 대인관계 확인되지 않음 …"처럼
**미확인 항목 나열**로 채워져, 평가사가 대부분을 지우고 다시 써야 하는 문서가 되었습니다.
원인은 프롬프트에 있던 "자료에 없으면 '확인되지 않아 추가 면담 필요'로 적으라"는 지시였습니다.

새 원칙: **없는 사실은 만들지 않되, 없는 항목을 일일이 열거하지도 않는다.**
평가하지 않은 영역은 쓰지 않고, 꼭 필요한 미확인 사항만 마지막에 최대 3개로 모읍니다.

| 바뀐 내용 | 확인할 곳 |
|---|---|
| 두 엔진 프롬프트의 작성 철학 교체(방어 문구 금지, 적극적 해석, 고정 예시 anchor 제거) | \`services/gemini.ts\` |
| 결과분석기를 7개 점검표 → 검사결과 해석 6+1 구성으로 | 〃 \`analyzeTestResults\` |
| 실제 기관 보고서의 작성 방식 이식(근거 붙은 개조식, 지원사항의 관찰→필요성→방법→기대 문단, 기관 어조) | 〃 |
| \`20/25\`를 "완료"로 읽히게 하던 "완성소요시간" 표기 수정 + 미완료 사실 명시 | \`report/narrative.ts\` |
| 검사방법·자료출처 설명을 소견 본문에서 빼고 결과표 주석에만 한 번 | \`report/compose.ts\`, \`report/narrative.ts\` |
| 빈 평가목적·미실시 평가영역 행·전부 미실시 결과표 출력 안 함 | \`report/document.ts\` |
| 종합소견을 표(9칸)가 아니라 소제목+문단으로 출력(긴 소견이 상자에 갇히는 문제) | 〃 |
| 목표 라벨 중복·제목 꼬리 유출 파서 수정 | \`report/aiOpinion.ts\`의 \`parseOpinionText\`·\`splitGoals\` |

**이 부분을 특히 적대적으로 봐 주세요:** 방어 문구를 줄이는 방향이 반대로
**근거 없는 단정이나 환각을 허용하게 되지 않았는지.** 안전장치(공식 결과지 수치만 인용,
임의 백분위 계산 금지, 취업·직무 적합 단정 금지)는 그대로 두었다고 주장하지만, 실제로 그러한지 확인 부탁드립니다.

확인 부탁드리는 점:

1. **AI로 나가는 참고 내용에 무엇이 실리는가** — \`buildOpinionReference()\`가 만드는 글에
   포함 해제한 문장·차단된 문장·주민등록번호 형태가 섞여 나가지 않는지.
   이름은 \`generateReport(..., { knownNames })\`로 비식별화 관문을 거치게 했는데, 충분한지.
2. **AI 응답을 칸으로 나누는 \`parseOpinionText()\`** — 항목 본문 안의 번호 줄("3. 지원고용 연계: …")을
   새 항목으로 잘못 끊지 않는지, 형식이 무너졌을 때 내용을 잃지 않는지(4개 미만이면 전문을 종합소견 칸에 담습니다).
3. **확정본 호환** — 요약에 칸을 추가했는데도 **이전 버전에서 확정한 보고서의 \`contentHash\`가 그대로 맞아야** 합니다.
   \`hashReportContent()\`는 새 칸이 비어 있으면 지문에서 빼는 방식으로 이를 맞췄습니다.
   이 방식이 "확정본을 몰래 고치는" 우회를 열지 않는지는 저희도 양방향으로 확인했습니다
   (확정 후 빈 칸을 채우는 것, 채워진 칸을 비우는 것 모두 저장·복원이 막힙니다 —
   회귀 테스트 \`새 칸을 지문에서 빼는 방식이 확정본 수정 우회를 열지 않는다\`).
   **다른 우회가 남아 있는지 봐 주세요.**
`;

const limitations = `# 아직 확인하지 못한 것

정직하게 적습니다. 검증하실 때 참고해 주세요.

1. **실제 결과지 PDF는 네트워크 직전까지만 돌려 봤습니다.**
   공단 다차원 양손협응 결과지(데모 데이터) 한 장으로 \`readSourceDocument\` 전체 경로를 실행해
   "실제로 나가려던 요청 본문"을 검사했습니다. 그 결과 라벨에 쌍점이 없는 서식(\`이 름  홍길동\`)에서
   이용자·평가사 이름이 그대로 나가던 결함을 찾아 고쳤고, 판 분모(결과지 \`/4\`, 실시요강 1)가
   확정을 막던 문제도 경고로 바꿨습니다. **실제 Gemini 응답으로 파싱·검증까지 이어지는 것은 API 키가 필요해 못 봤습니다.**

2. **AI 품질 검사는 정규식 기반입니다.**
   의미가 같은데 표현만 바꾼 우회를 완전히 막지는 못합니다.
   앞선 검증에서 뚫린 문장은 막고 회귀 테스트로 남겼지만, 새로운 우회는 가능합니다.

3. **보고서 \`contentHash\`는 실수 방지용입니다.**
   FNV 해시이며 암호학적 서명이 아닙니다. 의도적 위변조 방지가 목적이라면 다른 수단이 필요합니다.

4. **화면 검사는 \`test:all\`에 없습니다.**
   개발 서버와 Playwright가 필요해 따로 돌려야 합니다(\`npm run test:usability\`).

5. **AI 소견 품질 개선은 실제 응답으로 확인하지 못했습니다. — 이번 회차에서 가장 큰 공백입니다.**
   방어 문구("확인되지 않아 추가 면담 필요") 양산을 막고 적극적 해석을 유도하도록 두 엔진의
   프롬프트를 크게 고쳤지만, **합성 데이터로는 프롬프트 문구의 존재 여부만 검사할 수 있습니다.**
   실제 Gemini 응답이 의도대로 바뀌었는지, 반대로 근거 없는 단정이 늘지는 않았는지는 확인하지 못했습니다.
   검증하실 때 이 부분을 가장 의심해 주세요.

6. **macOS 빌드는 서명·공증 전입니다.**
   Windows 설치 파일은 코드서명합니다(check-win-signing.cjs가 사전 검사).
   인증서와 비밀번호는 이 자료에 들어 있지 않습니다.

7. **쉬운 설명(당사자용)과 현황판 연동은 아직 만들지 않았습니다.**

8. **UI 정보구조 개선 제안을 아직 반영하지 않았습니다.**
   상위 메뉴 정리, 단계 통합, 다음 할 일 안내 등은 검토 중입니다.
`;

const howTo = `# 실행 방법

\`\`\`bash
cd app
npm ci
npm run test:all      # 타입 검사 + 전체 테스트
\`\`\`

## 개별 검사

\`\`\`bash
npm run typecheck                 # TypeScript strict
${testScripts.map(item => `npm run ${item.name}`.padEnd(34) + `# ${item.command.replace('node scripts/', '')}`).join('\n')}
\`\`\`

## 화면 검사 (선택)

터미널 두 개가 필요합니다.

\`\`\`bash
npm run dev                       # 1번 터미널
npm run test:usability            # 2번 터미널
\`\`\`

## 앱 실행

\`\`\`bash
npm run electron:dev
\`\`\`

Node.js 22 이상이 필요합니다. 네트워크와 API 키 없이 모든 테스트가 돌아갑니다.
`;

await writeFile(path.join(outRoot, '00-review-request.md'), brief, 'utf8');
await writeFile(path.join(outRoot, 'architecture.md'), architecture, 'utf8');
await writeFile(path.join(outRoot, 'privacy-and-security.md'), privacy, 'utf8');
await writeFile(path.join(outRoot, 'vocational-evaluation-review.md'), veReview, 'utf8');
await writeFile(path.join(outRoot, 'known-limitations.md'), limitations, 'utf8');
await writeFile(path.join(outRoot, 'HOW-TO-RUN.md'), howTo, 'utf8');

// 뺀 이미지 자산은 목록만 남겨 둔다(검증에는 필요 없지만 무엇이 빠졌는지 알 수 있게).
const templateDir = path.join(root, 'public', 'templates');
let templateNote = '이 폴더는 없습니다.';
try {
    const names = (await readdir(templateDir)).sort();
    templateNote = names.map(name => '- `public/templates/' + name + '`').join(NEWLINE);
} catch {
    // 폴더가 없으면 그대로 둔다.
}
await writeFile(
    path.join(outRoot, 'excluded-assets.md'),
    [
        '# 자료에서 뺀 파일',
        '',
        '문서 배경 이미지입니다. 코드 검증에 쓰이지 않고 수십 MB라 뺐습니다.',
        '동작 확인이 필요하면 원본 저장소에서 같은 경로로 넣으면 됩니다.',
        '',
        templateNote,
        '',
        '그 밖에 뺀 것: `node_modules`, `dist`, `release`, `.git`, `.env`, 인증서·키 파일, 서비스 계정 파일.',
        '',
    ].join(NEWLINE),
    'utf8',
);

/* ── 지문 + 묶음 ─────────────────────────────────────────────── */

const produced = (await walk(outRoot)).sort();
const nonAscii = produced.filter(file => /[^\x20-\x7E]/.test(path.relative(outRoot, file)));
const sums = await Promise.all(
    produced.map(async file => {
        const hash = createHash('sha256').update(await readFile(file)).digest('hex');
        return `${hash}  ${path.relative(outRoot, file).split(path.sep).join('/')}`;
    }),
);
await writeFile(path.join(outRoot, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`, 'utf8');

const zip = new JSZip();
for (const file of produced) {
    zip.file(path.relative(outRoot, file).split(path.sep).join('/'), await readFile(file));
}
zip.file('SHA256SUMS.txt', `${sums.join('\n')}\n`);
const zipPath = path.join(root, 'release', `jjss-verification-${pkg.version}.zip`);
await writeFile(zipPath, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));

console.log(`전체 검증 자료를 만들었습니다: ${path.relative(root, outRoot)}`);
console.log(`- 묶음 파일: ${path.relative(root, zipPath)}`);
console.log(`- 소스 ${srcFiles.length}개 + Electron ${electronFiles.length}개, 파일 ${produced.length + 1}개`);
console.log(`- 비밀값 패턴 0건, test:all 통과, 검사 ${testScripts.length}종 포함`);
console.log(`- 한글 파일명 ${nonAscii.length}개(0이어야 sha256sum -c가 깨지지 않음)`);
