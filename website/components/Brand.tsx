import Link from 'next/link';

/** 헤더·푸터에서 함께 쓰는 JJSS 로고 링크 */
export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="JJSS 홈">
      <span className="brand-mark" aria-hidden="true">J</span>
      <span className="brand-copy">
        <strong>JJSS</strong>
        <small>직업재활 업무지원 시스템</small>
      </span>
    </Link>
  );
}
