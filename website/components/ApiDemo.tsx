'use client';

import { useState } from 'react';

export function ApiDemo() {
  const [connected, setConnected] = useState(false);

  return (
    <div className="api-demo" aria-label="API Key 설정 설명용 화면">
      <div className="demo-window-bar"><span /><span /><span /><strong>설정 · AI 서비스</strong></div>
      <div className="demo-provider">
        <div className="demo-provider-head"><span className="demo-provider-icon">✦</span><div><strong>Google Gemini</strong><small>처음 시작할 때 안내하는 선택지</small></div><i>선택됨</i></div>
        <label>API Key</label>
        <div className="demo-key" aria-label="마스킹된 예시 API Key">AIza••••••••••••••••••••••</div>
        <button type="button" onClick={() => setConnected(true)} disabled={connected}>
          {connected ? '✓ 연결 확인 예시 완료' : '연결 확인 예시'}
        </button>
      </div>
      <p><span aria-hidden="true">ⓘ</span> 설명용 화면입니다. 실제 Key를 입력받거나 저장·전송하지 않습니다.</p>
    </div>
  );
}
