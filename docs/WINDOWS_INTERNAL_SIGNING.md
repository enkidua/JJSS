# JJSS Windows 내부 테스트용 코드서명

JJSS의 내부 테스트용 Windows 서명 빌드는 인증서나 비밀번호를 저장소에 보관하지 않습니다.

## 준비

- 현재 내부 테스트용 PFX는 `%USERPROFILE%\Documents\JJSS-CodeSigning.pfx`에 보관하며 프로젝트 안으로 복사하지 않습니다.
- PFX와 비밀번호는 공유하거나 Git에 커밋하지 않습니다.
- 다른 내부 테스트 PC에는 개인키가 없는 CER만 전달하고, 해당 PC가 이 테스트 인증서를 신뢰하도록 별도로 설치합니다.
- 자체 서명 인증서는 내부 테스트용이며, 공개 배포용 공인 인증서의 SmartScreen 평판을 대신하지 않습니다.

### PFX가 아직 없을 때 1회 생성

별도 프로그램 없이 Windows PowerShell의 기본 인증서 명령으로 내부 테스트 인증서를 만들 수 있습니다. 아래 명령은 프로젝트 밖에 PFX와 공개 CER를 만들며 비밀번호를 화면에 평문으로 표시하지 않습니다.

```powershell
$certDir = Join-Path $env:USERPROFILE "Documents"

$cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject "CN=JJSS Internal Test Code Signing" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA `
    -KeyLength 3072 `
    -HashAlgorithm SHA256 `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(3)

$pfxPassword = Read-Host "새 PFX 비밀번호" -AsSecureString
Export-PfxCertificate `
    -Cert $cert `
    -FilePath (Join-Path $certDir "JJSS-CodeSigning.pfx") `
    -Password $pfxPassword
Export-Certificate `
    -Cert $cert `
    -FilePath (Join-Path $certDir "JJSS-CodeSigning.cer")
```

이 인증서를 신뢰할 내부 테스트 PC에만 CER를 `현재 사용자/신뢰할 수 있는 루트 인증 기관`과 `현재 사용자/신뢰할 수 있는 게시자`로 가져옵니다. PFX는 다른 PC에 전달하지 않습니다.

## 빌드

현재 PowerShell 세션에 `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`를 설정한 뒤 실행합니다.

```powershell
$env:WIN_CSC_LINK = Join-Path $env:USERPROFILE "Documents\JJSS-CodeSigning.pfx"
$securePassword = Read-Host "PFX 비밀번호" -AsSecureString
$env:WIN_CSC_KEY_PASSWORD = [Net.NetworkCredential]::new('', $securePassword).Password
try {
    npm run electron:build:win:signed
} finally {
    Remove-Item Env:WIN_CSC_LINK -ErrorAction SilentlyContinue
    Remove-Item Env:WIN_CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
}
```

서명 환경변수가 없거나 로컬 인증서 경로가 잘못되면 Vite/Electron 빌드를 시작하기 전에 중단됩니다. 비밀번호와 PFX 내용은 로그에 출력하지 않습니다.

## 서명 확인

```powershell
Get-AuthenticodeSignature ".\release\JJSS Setup 2.3.0.exe" |
Format-List Status,StatusMessage,SignerCertificate
```

다른 PC에서 자체 서명 설치본을 검증할 때는 먼저 CER의 발급자와 지문을 별도 경로로 확인한 후 신뢰 저장소에 설치합니다.

## 업데이트 검증은 인증서 지문을 고정합니다

설치된 앱은 내려받은 업데이트 설치파일의 서명이 **유효**하고, 서명자 CN이 `JJSS`이며, 인증서 **지문(SHA-1)이 `electron/updater.cjs`의 `ALLOWED_SIGNER_THUMBPRINTS`에 있을 때만** 설치합니다(electron-updater 기본 검증은 CN만 보고, 검증 도구(PowerShell)가 실패하면 통과시키므로 직접 검증으로 바꿨습니다. 검증 도구 실패는 거부입니다). `npm run electron:build:win:signed`의 사전 점검(`scripts/check-win-signing.cjs`)이 PFX의 지문이 그 목록에 있는지 확인하므로, 목록에 없는 인증서로는 빌드가 시작되지 않습니다.

**인증서를 갱신할 때 순서(지키지 않으면 기존 설치본이 업데이트를 영영 받지 못합니다):**

1. 새 PFX를 만들고 지문을 확인합니다. `powershell -c "(Get-PfxCertificate .\새인증서.pfx).Thumbprint"`
2. `ALLOWED_SIGNER_THUMBPRINTS`에 **새 지문을 추가**(옛 지문은 남김)한 버전을 **옛 인증서로** 서명해 배포하고, 모든 PC가 그 버전으로 올라간 것을 확인합니다.
3. 그다음 버전부터 새 인증서로 서명합니다. 옛 인증서가 만료·폐기되면 목록에서 옛 지문을 지웁니다.
4. 새 CER을 각 PC의 신뢰 저장소에 넣는 일(`docs/google-workspace-auto-install.md`)도 2번과 함께 합니다.

PFX 파일은 OneDrive 등 동기화 폴더가 아닌 곳(관리자 PC의 로컬 폴더나 별도 보관 매체)에 두고, 비밀번호와 따로 보관하세요. PFX가 유출되면 그 지문으로 서명한 어떤 설치파일도 모든 PC가 받아들입니다.

## 별도 설치가 필요한지

- electron-builder 서명에는 별도 Windows SDK가 필수는 아닙니다. 프로젝트가 사용하는 electron-builder가 Windows 서명 도구를 내려받아 사용합니다.
- 서명 도구 압축 해제 중 심볼릭 링크 권한 오류가 나면 Windows 개발자 모드를 켜거나 관리자 권한 PowerShell에서 빌드해야 합니다.
- Windows SDK의 Signing Tools는 `signtool.exe`로 직접 진단할 때만 선택 사항입니다. 서명 확인만 할 때는 기본 PowerShell의 `Get-AuthenticodeSignature`로 충분합니다.
