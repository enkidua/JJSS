const fs = require('node:fs');
const path = require('node:path');
const { fileURLToPath } = require('node:url');

const signingLink = process.env.WIN_CSC_LINK?.trim();
const signingPassword = process.env.WIN_CSC_KEY_PASSWORD?.trim();

function fail(message) {
    console.error(message);
    process.exit(1);
}

if (!signingLink || !signingPassword) {
    fail([
        'Windows 코드서명 환경변수가 설정되지 않았습니다.',
        'WIN_CSC_LINK와 WIN_CSC_KEY_PASSWORD를 설정한 뒤 다시 실행해 주세요.',
    ].join('\n'));
}

let localCertificatePath = null;
if (/^file:/i.test(signingLink)) {
    try {
        localCertificatePath = fileURLToPath(signingLink);
    } catch {
        fail('WIN_CSC_LINK의 로컬 인증서 경로 형식이 올바르지 않습니다.');
    }
} else if (!/^(https?:|data:)/i.test(signingLink)
    && (path.isAbsolute(signingLink)
        || /^[.]{1,2}[\\/]/.test(signingLink)
        || /[\\/]/.test(signingLink)
        || /\.(pfx|p12)$/i.test(signingLink))) {
    localCertificatePath = path.resolve(signingLink);
}

if (localCertificatePath && !fs.existsSync(localCertificatePath)) {
    fail('WIN_CSC_LINK가 가리키는 로컬 코드서명 인증서 파일을 찾을 수 없습니다.');
}

// 설치본의 업데이트 검증은 인증서 지문을 고정한다(electron/updater.cjs ALLOWED_SIGNER_THUMBPRINTS).
// 목록에 없는 인증서로 서명하면 기존 설치본이 그 업데이트를 거부하므로 빌드 전에 막는다.
if (localCertificatePath && process.platform === 'win32') {
    const { execFileSync } = require('node:child_process');
    const { ALLOWED_SIGNER_THUMBPRINTS } = require('../electron/updater.cjs');
    const script = [
        "$ErrorActionPreference = 'Stop'",
        "$cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new([System.Environment]::GetEnvironmentVariable('JJSS_PFX_PATH'), [System.Environment]::GetEnvironmentVariable('WIN_CSC_KEY_PASSWORD'))",
        '$cert.Thumbprint',
    ].join('; ');
    let thumbprint = '';
    try {
        thumbprint = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-InputFormat', 'None', '-Command', script], {
            env: { ...process.env, JJSS_PFX_PATH: localCertificatePath },
            encoding: 'utf8',
            windowsHide: true,
            timeout: 30_000,
        }).trim().toUpperCase();
    } catch (error) {
        fail(`코드서명 인증서의 지문을 읽지 못했습니다: ${String(error?.message || error).slice(0, 200)}`);
    }
    if (!ALLOWED_SIGNER_THUMBPRINTS.map(value => value.toUpperCase()).includes(thumbprint)) {
        fail([
            `코드서명 인증서 지문(${thumbprint})이 electron/updater.cjs의 ALLOWED_SIGNER_THUMBPRINTS에 없습니다.`,
            '이 인증서로 서명한 설치파일은 기존 설치본이 업데이트로 받아들이지 않습니다. 인증서를 갱신했다면 docs/WINDOWS_INTERNAL_SIGNING.md의 갱신 절차를 따라 주세요.',
        ].join('\n'));
    }
    console.log(`코드서명 인증서 지문이 업데이트 검증 목록에 있습니다(${thumbprint.slice(0, 8)}…).`);
}

console.log('Windows 코드서명 환경변수와 로컬 인증서 경로 확인을 완료했습니다.');
