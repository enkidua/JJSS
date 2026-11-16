/**
 * 서명 등록부(참석자 서명부): 명단을 넣고 한 화면에서 차례로 서명을 받아 PDF로 저장한다.
 * 서명 그림은 저장하지 않는다 — 화면을 닫으면 사라지고, 만든 PDF에만 남는다.
 */

export interface SignSheetInfo {
    title: string;
    /** 일시(자유 입력: "2026. 11. 16.(월) 14:00~16:00") */
    when: string;
    place: string;
    /** 주관(기관·부서) */
    host: string;
    /** 비고 칸 제목을 바꿀 때(기본 "소속") */
    affiliationLabel?: string;
}

export interface SignSheetRow {
    name: string;
    affiliation: string;
    /** 서명 그림(PNG data URL). 없으면 빈 칸(종이에 직접 서명) */
    signature?: string;
}

/** 등록부 한 쪽에 들어가는 줄 수(A4, 서명 칸 높이 기준) */
export const SIGN_SHEET_ROWS_PER_PAGE = 20;

/** 서명 그림으로 받아들이는 형식: 이 화면의 캔버스가 만든 PNG data URL만(바깥 주소·다른 형식은 넣지 않는다). */
export function isSignatureDataUrl(value: unknown): value is string {
    return typeof value === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) && value.length < 400_000;
}

function escapeHtml(value: string): string {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 붙여 넣은 명단(한 줄에 한 사람, "소속<탭 또는 쉼표>이름" 또는 "이름")을 줄 목록으로 */
export function parseSignSheetRows(text: string): SignSheetRow[] {
    return String(text ?? '')
        .split(/\r?\n/)
        .map(line => line.replace(/^\s*\d+\s*[.)]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 300)
        .map(line => {
            const cells = line.split(/\t|,|;/).map(cell => cell.trim()).filter(Boolean);
            if (cells.length >= 2) return { affiliation: cells[0], name: cells.slice(1).join(' ') };
            return { affiliation: '', name: cells[0] ?? line };
        });
}

/**
 * 인쇄용 HTML(스크립트 없음, 바깥 자원 없음). 빈 줄을 채워 쪽마다 줄 수를 맞춘다.
 * extraBlankRows: 명단에 없는 사람이 종이에 적을 빈 줄 수.
 */
export function buildSignSheetHtml(info: SignSheetInfo, rows: readonly SignSheetRow[], options: { extraBlankRows?: number } = {}): string {
    const affiliationLabel = info.affiliationLabel?.trim() || '소속';
    const blanks = Math.max(0, Math.min(100, Math.floor(options.extraBlankRows ?? 0)));
    const all: SignSheetRow[] = [...rows, ...Array.from({ length: blanks }, () => ({ name: '', affiliation: '' }))];
    // 마지막 쪽을 빈 줄로 채워 표가 쪽 끝까지 이어지게 한다.
    const remainder = all.length % SIGN_SHEET_ROWS_PER_PAGE;
    if (all.length === 0 || remainder !== 0) {
        const fill = all.length === 0 ? SIGN_SHEET_ROWS_PER_PAGE : SIGN_SHEET_ROWS_PER_PAGE - remainder;
        for (let index = 0; index < fill; index += 1) all.push({ name: '', affiliation: '' });
    }
    const pages: string[] = [];
    for (let start = 0; start < all.length; start += SIGN_SHEET_ROWS_PER_PAGE) {
        const body = all.slice(start, start + SIGN_SHEET_ROWS_PER_PAGE).map((row, offset) => {
            const signature = isSignatureDataUrl(row.signature) ? `<img src="${row.signature}" alt="서명">` : '';
            return `<tr><td class="no">${start + offset + 1}</td><td>${escapeHtml(row.affiliation)}</td><td class="name">${escapeHtml(row.name)}</td><td class="sign">${signature}</td></tr>`;
        }).join('');
        pages.push(`<section class="page">
<h1>${escapeHtml(info.title || '참석자 등록부')}</h1>
<table class="meta"><tbody>
<tr><th>일 시</th><td>${escapeHtml(info.when)}</td><th>장 소</th><td>${escapeHtml(info.place)}</td></tr>
<tr><th>주 관</th><td colspan="3">${escapeHtml(info.host)}</td></tr>
</tbody></table>
<table class="list"><thead><tr><th class="no">번호</th><th>${escapeHtml(affiliationLabel)}</th><th class="name">성 명</th><th class="sign">서 명</th></tr></thead><tbody>${body}</tbody></table>
<p class="foot">${pages.length + 1} / ${Math.ceil(all.length / SIGN_SHEET_ROWS_PER_PAGE)}</p>
</section>`);
    }
    return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><title>${escapeHtml(info.title || '참석자 등록부')}</title><style>
@page { size: A4 portrait; margin: 14mm 14mm 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; }
.page { page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
h1 { margin: 0 0 6mm; text-align: center; font-size: 20pt; letter-spacing: 2pt; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { border: 0.4mm solid #000; padding: 1.2mm 2mm; font-size: 10.5pt; text-align: center; overflow: hidden; word-break: break-all; }
th { background: #eee; font-weight: 700; }
.meta { margin-bottom: 4mm; }
.meta th { width: 18%; }
.meta td { text-align: left; }
.list tr { height: 10.6mm; break-inside: avoid; page-break-inside: avoid; }
.list .no { width: 11%; }
.list .name { width: 24%; }
.list .sign { width: 33%; padding: 0.4mm; }
.list .sign img { display: block; margin: 0 auto; max-width: 100%; height: 9.2mm; object-fit: contain; }
.foot { margin: 2mm 0 0; text-align: center; font-size: 9pt; color: #444; }
</style></head><body>${pages.join('\n')}</body></html>`;
}
