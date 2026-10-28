/**
 * 공유 드라이브 보안 점검. 켤 때·동기화 시작 때·하루 한 번 다시 확인한다.
 * "차단"이 하나라도 있으면 동기화를 켜지 않거나 멈춘다.
 */
import type { DriveSecurityFacts } from './types';

export type SecurityLevel = 'pass' | 'warn' | 'block';

export interface SecurityCheck {
    id: string;
    level: SecurityLevel;
    title: string;
    detail: string;
}

export interface SecurityReport {
    checks: SecurityCheck[];
    blocked: boolean;
    warnings: number;
}

function domainOf(email: string | undefined): string {
    const value = String(email || '').toLowerCase().trim();
    const at = value.lastIndexOf('@');
    return at >= 0 ? value.slice(at + 1) : '';
}

export function evaluateDriveSecurity(facts: DriveSecurityFacts, orgDomain: string): SecurityReport {
    const domain = orgDomain.toLowerCase().trim();
    const checks: SecurityCheck[] = [];
    const add = (id: string, level: SecurityLevel, title: string, detail: string) => checks.push({ id, level, title, detail });

    add('account-domain', domainOf(facts.accountEmail) === domain ? 'pass' : 'block',
        '기관 계정으로 로그인',
        domainOf(facts.accountEmail) === domain ? `${facts.accountEmail}` : `로그인한 계정(${facts.accountEmail || '알 수 없음'})이 기관 도메인(${domain})이 아닙니다.`);

    add('shared-drive', facts.isSharedDrive ? 'pass' : 'block',
        '공유 드라이브 사용',
        facts.isSharedDrive ? `"${facts.driveName}" 공유 드라이브` : '개인 "내 드라이브"가 아니라 기관 공유 드라이브를 골라 주세요. 공유 드라이브는 파일이 기관 소유라 퇴사해도 남습니다.');

    add('member', facts.accountIsMember ? 'pass' : 'block',
        '이 계정이 공유 드라이브 구성원',
        facts.accountIsMember ? '구성원입니다.' : '이 계정은 공유 드라이브 구성원이 아닙니다. 관리자에게 구성원 추가를 요청해 주세요.');

    if (facts.permissionsVisible === false) {
        add('members-visible', 'warn',
            '구성원 목록 확인',
            '이 계정은 공유 드라이브 구성원 목록을 볼 권한이 없어 링크 공유·기관 밖 구성원을 확인하지 못했습니다. 공유 드라이브 관리자 계정으로 한 번 점검해 주세요.');
    }

    const anyone = facts.permissions.filter(permission => permission.type === 'anyone');
    add('no-link-sharing', anyone.length ? 'block' : 'pass',
        '링크 공유(누구나) 꺼짐',
        anyone.length ? '"링크가 있는 모든 사용자" 공유가 켜져 있습니다. 공유 드라이브 설정에서 꺼 주세요.' : '꺼져 있습니다.');

    const outsideMembers = facts.permissions.filter(permission =>
        (permission.type === 'user' || permission.type === 'group') && domainOf(permission.emailAddress) && domainOf(permission.emailAddress) !== domain);
    add('no-external-members', outsideMembers.length ? 'block' : 'pass',
        '기관 밖 구성원 없음',
        outsideMembers.length ? `기관 도메인 밖 계정 ${outsideMembers.length}개가 구성원입니다. 관리자에게 제거를 요청해 주세요.` : '모두 기관 도메인 계정입니다.');

    const otherDomains = facts.permissions.filter(permission => permission.type === 'domain' && String(permission.domain || '').toLowerCase() !== domain);
    const ownDomain = facts.permissions.filter(permission => permission.type === 'domain' && String(permission.domain || '').toLowerCase() === domain);
    add('no-domain-wide', otherDomains.length ? 'block' : ownDomain.length ? 'warn' : 'pass',
        '도메인 전체 공유 없음',
        otherDomains.length
            ? '다른 도메인 전체에 공유되어 있습니다.'
            : ownDomain.length
                ? '기관 도메인 전체에 공유되어 있습니다. 사례관리 담당 그룹만 구성원으로 두는 것을 권장합니다.'
                : '특정 구성원·그룹에만 공유되어 있습니다.');

    const r = facts.restrictions || {};
    add('domain-users-only', r.domainUsersOnly ? 'pass' : 'warn',
        '기관 계정만 접근(도메인 사용자 전용)',
        r.domainUsersOnly ? '켜져 있습니다.' : '공유 드라이브 설정 "조직 외부 사용자 접근 허용"을 꺼 주세요.');
    add('members-only', r.driveMembersOnly ? 'pass' : 'warn',
        '구성원이 아닌 사람에게 파일 공유 금지',
        r.driveMembersOnly ? '켜져 있습니다.' : '공유 드라이브 설정 "구성원이 아닌 사용자에게 파일 공유 허용"을 꺼 주세요.');
    add('copy-restricted', r.copyRequiresWriterPermission ? 'pass' : 'warn',
        '보기 권한자의 다운로드·인쇄·복사 제한',
        r.copyRequiresWriterPermission ? '켜져 있습니다.' : '공유 드라이브 설정에서 "뷰어·댓글 작성자의 다운로드·인쇄·복사"를 꺼 주세요(파일이 암호화되어 있어도 권장).');

    return {
        checks,
        blocked: checks.some(check => check.level === 'block'),
        warnings: checks.filter(check => check.level === 'warn').length,
    };
}

/** 하루 한 번 다시 점검할 때가 되었는가 */
export function securityCheckDue(lastCheckedAt: string | undefined, now = Date.now()): boolean {
    if (!lastCheckedAt) return true;
    const last = Date.parse(lastCheckedAt);
    return !Number.isFinite(last) || now - last >= 24 * 60 * 60 * 1000;
}
