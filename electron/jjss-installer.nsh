!macro customCheckAppRunning
  retryJjssProcessCheck:
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "JJSS가 실행 중입니다.$\r$\nJJSS 창을 정상적으로 종료한 뒤 다시 시도를 눌러 주세요." /SD IDCANCEL IDRETRY retryJjssProcessCheck
    Quit
  ${endIf}
!macroend
