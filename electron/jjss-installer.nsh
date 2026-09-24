!macro customCheckAppRunning
  retryJjssProcessCheck:
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "JJSS가 실행 중입니다.$\r$\nJJSS 창을 정상적으로 종료한 뒤 [다시 시도]를 눌러 주세요.$\r$\n$\r$\nJJSS 창이 보이지 않는다면 이 컴퓨터의 다른 Windows 계정에서 JJSS가 실행 중일 수 있습니다.$\r$\n이 경우 컴퓨터를 다시 시작한 뒤 설치해 주세요." /SD IDCANCEL IDRETRY retryJjssProcessCheck
    Quit
  ${endIf}
!macroend
