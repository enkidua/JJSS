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

console.log('Windows 코드서명 환경변수와 로컬 인증서 경로 확인을 완료했습니다.');
