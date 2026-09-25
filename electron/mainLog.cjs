// 메인 프로세스 오류 기록(userData/logs/main.log).
// 개인정보가 섞일 수 있는 오류 메시지·파일 경로·입력 내용은 남기지 않는다.
// 오류 이름·코드와 사용자 폴더 이름을 가린 호출 위치(stack frame)만 기록한다.
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_LOG_BYTES = 1024 * 1024;
const MAX_STACK_FRAMES = 12;
let logFilePath = '';
let appVersion = '';

function safeToken(value, fallback) {
    return typeof value === 'string' && /^[a-z0-9._-]{1,80}$/i.test(value) ? value : fallback;
}

function maskUserFolders(line) {
    let masked = line;
    const home = os.homedir();
    if (home) {
        masked = masked.split(home).join('~').split(home.replace(/\\/g, '/')).join('~');
    }
    return masked.replace(/([\\/])Users([\\/])[^\\/]+/gi, '$1Users$2~');
}

function sanitizeStack(stack) {
    if (typeof stack !== 'string') return undefined;
    const frames = stack
        .split('\n')
        .filter(line => /^\s+at /.test(line))
        .slice(0, MAX_STACK_FRAMES)
        .map(line => maskUserFolders(line.trim()).slice(0, 300));
    return frames.length ? frames : undefined;
}

function describeError(error) {
    return {
        errorName: safeToken(error?.name, 'Error'),
        errorCode: safeToken(error?.code, undefined),
        stack: sanitizeStack(error?.stack),
    };
}

function initMainLog(app) {
    try {
        logFilePath = path.join(app.getPath('userData'), 'logs', 'main.log');
        appVersion = safeToken(app.getVersion(), '');
    } catch {
        logFilePath = '';
    }
}

function rotateIfNeeded() {
    try {
        if (fs.statSync(logFilePath).size > MAX_LOG_BYTES) {
            fs.renameSync(logFilePath, logFilePath.replace(/\.log$/, '.old.log'));
        }
    } catch {
        // 파일이 아직 없으면 그대로 진행한다.
    }
}

// 기록할 수 있는 값: 숫자·참/거짓·짧은 분류 문자열(영문·숫자·._-), 정리된 호출 위치(stack).
// 그 밖의 문자열(오류 메시지·프롬프트·이름·경로 등)과 객체는 기록하지 않는다.
function sanitizeDetails(details) {
    const safe = {};
    if (!details || typeof details !== 'object') return safe;
    for (const [key, value] of Object.entries(details)) {
        if (!/^[a-z][a-z0-9_]{0,40}$/i.test(key) || value === undefined) continue;
        if (key === 'stack' && Array.isArray(value)) {
            safe.stack = value
                .filter(line => typeof line === 'string')
                .slice(0, MAX_STACK_FRAMES)
                .map(line => maskUserFolders(line).slice(0, 300));
        } else if (typeof value === 'number' && Number.isFinite(value)) {
            safe[key] = value;
        } else if (typeof value === 'boolean') {
            safe[key] = value;
        } else if (typeof value === 'string') {
            safe[key] = safeToken(value, '[redacted]');
        }
    }
    return safe;
}

function logMainEvent(level, event, details = {}) {
    if (!logFilePath) return;
    try {
        fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
        rotateIfNeeded();
        const entry = {
            time: new Date().toISOString(),
            level: safeToken(level, 'info'),
            event: safeToken(event, 'event'),
            version: appVersion || undefined,
            ...sanitizeDetails(details),
        };
        fs.appendFileSync(logFilePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch {
        // 기록 실패가 앱 동작을 막지 않도록 무시한다.
    }
}

function logMainError(event, error) {
    logMainEvent('error', event, describeError(error));
}

module.exports = { initMainLog, logMainError, logMainEvent, safeToken };
