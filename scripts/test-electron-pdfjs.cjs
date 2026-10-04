// 실제 Electron(앱과 같은 Chromium) 렌더러에서 앱이 쓰는 pdf.js 빌드로 PDF 글자를 읽을 수 있는지 확인한다.
// 실행: npx electron scripts/test-electron-pdfjs.cjs
//
// 왜 필요한가: pdf.js 기본(modern) 빌드는 최신 Chromium 전용 기능(Uint8Array.prototype.toHex 등)을 써서
// Electron 36(Chromium 136)에서는 문서를 열자마자 실패했다. 실패해도 앱은 "로컬 추출 불가"로 넘어갈 뿐이라
// 단위 테스트(Node)로는 드러나지 않았다. src/services/localPdfText.ts가 가리키는 빌드를 그대로 읽어 확인한다.
// 합성 PDF만 쓰며 네트워크·사용자 데이터에 접근하지 않는다.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const EXPECTED_TEXT = 'JJSS PDF CHECK 2026';

function appPdfJsPaths() {
    const source = fs.readFileSync(path.join(root, 'src', 'services', 'localPdfText.ts'), 'utf8');
    const globs = [...source.matchAll(/import\.meta\.glob<.*?>\('\/(node_modules\/pdfjs-dist\/[^']+)'/g)].map(match => match[1]);
    const library = globs.find(item => /\/pdf\.min\.mjs$/.test(item));
    const worker = globs.find(item => /\/pdf\.worker\.min\.mjs$/.test(item));
    if (!library || !worker) throw new Error('localPdfText.ts에서 pdf.js 경로를 찾지 못했습니다.');
    if (!/enableScripting:\s*false/.test(source)) throw new Error('localPdfText.ts가 enableScripting:false를 넘기지 않습니다.');
    return { library: path.join(root, library), worker: path.join(root, worker) };
}

function makePdf() {
    const stream = `BT /F1 18 Tf 20 80 Td (${EXPECTED_TEXT}) Tj ET`;
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let out = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach((body, index) => {
        offsets.push(out.length);
        out += `${index + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = out.length;
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(out, 'latin1');
}

app.whenReady().then(async () => {
    let exitCode = 1;
    const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'jjss-pdfjs-check-'));
    try {
        const { library, worker } = appPdfJsPaths();
        for (const file of [library, worker]) {
            if (!fs.existsSync(file)) throw new Error(`pdf.js 파일이 없습니다: ${path.relative(root, file)}`);
        }
        const html = `<!doctype html><meta charset="utf-8"><title>pending</title><script type="module">
try {
  globalThis.pdfjsWorker = await import(${JSON.stringify(pathToFileURL(worker).href)});
  const pdfjs = await import(${JSON.stringify(pathToFileURL(library).href)});
  const bytes = Uint8Array.from(atob(${JSON.stringify(makePdf().toString('base64'))}), c => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, enableScripting: false, disableFontFace: true, useSystemFonts: false, disableAutoFetch: true, disableStream: true, stopAtErrors: false }).promise;
  const content = await (await doc.getPage(1)).getTextContent();
  document.title = 'OK ' + pdfjs.version + '|' + content.items.map(item => item.str).join('');
} catch (error) {
  document.title = 'FAIL ' + (error && error.message || error);
}
</script>`;
        const file = path.join(dir, 'check.html');
        fs.writeFileSync(file, html);
        const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
        await win.loadFile(file);
        let title = 'pending';
        for (let i = 0; i < 150 && title === 'pending'; i += 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
            title = win.getTitle();
        }
        const label = `${path.relative(root, library).replace(/\\/g, '/')} on Electron ${process.versions.electron} (Chromium ${process.versions.chrome})`;
        if (title.startsWith('OK ') && title.endsWith(`|${EXPECTED_TEXT}`)) {
            console.log(`PASS pdf.js ${title.slice(3, title.indexOf('|'))} reads PDF text in the app renderer: ${label}`);
            exitCode = 0;
        } else {
            console.error(`FAIL pdf.js could not read the synthetic PDF: ${title} — ${label}`);
        }
    } catch (error) {
        console.error(`FAIL ${error && error.message ? error.message : error}`);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
        app.exit(exitCode);
    }
});
