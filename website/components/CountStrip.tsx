const items = [
  { value: 3, label: 'AI 제공업체 선택' },
  { value: 6, label: '직업재활 업무 단계' },
  { value: 3, label: '계획서 출력 형식' },
];

/**
 * 서버 렌더링 결과에 실제 숫자를 그대로 출력한다(검색엔진·JS 미실행 환경 대응).
 * 등장 효과는 `.reveal`의 CSS 스크롤 애니메이션만 사용한다.
 */
export function CountStrip() {
  return (
    <div className="count-strip reveal">
      {items.map((item) => (
        <div key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
