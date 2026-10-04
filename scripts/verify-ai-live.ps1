# 실제 API 키로 AI 경로를 한 번 점검한다.
#
#   PowerShell에서:  .\scripts\verify-ai-live.ps1
#
# 키는 화면에 보이지 않게 입력받고, 이 프로세스가 끝나면 환경변수에서 지운다.
# 파일·git에 키를 남기지 않는다.
param(
    [string]$SheetPath = (Join-Path $env:USERPROFILE 'OneDrive\바탕 화면\https-hub.kead.or.kr2.pdf'),
    [string]$AnalysisPath = (Join-Path $env:USERPROFILE 'OneDrive\바탕 화면\직업평가보고서 예시1.pdf')
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host ''
Write-Host 'JJSS — 실제 AI 경로 점검' -ForegroundColor Cyan
Write-Host '키는 화면에 표시되지 않으며 파일에 저장되지 않습니다.' -ForegroundColor DarkGray
Write-Host ''

$secure = Read-Host 'Gemini API 키를 붙여넣고 Enter' -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
)

if (-not $plain) {
    Write-Host '키를 입력하지 않아 중단합니다.' -ForegroundColor Yellow
    exit 2
}

try {
    $env:GEMINI_API_KEY = $plain
    node scripts/verify-ai-live.mjs $SheetPath $AnalysisPath
    $code = $LASTEXITCODE
} finally {
    # 키를 환경변수와 메모리에서 지운다.
    Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
    $plain = $null
    [GC]::Collect()
}

exit $code
