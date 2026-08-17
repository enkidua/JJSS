import { useRef } from 'react';
import { motion } from 'framer-motion';
import { Printer, X } from 'lucide-react';
import { ExpenseDocumentData } from '../types/budget';
import { saveJjssPdf, savedLocationMessage } from '../utils/jjssFileService';

interface ExpenseDocumentProps {
    data: ExpenseDocumentData;
    onClose: () => void;
}

function numberToKorean(num: number): string {
    const units = ['', '만', '억'];
    const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const subUnits = ['', '십', '백', '천'];
    
    if (num === 0) return '영';
    
    let result = '';
    let unitIndex = 0;
    
    while (num > 0) {
        const chunk = num % 10000;
        if (chunk > 0) {
            let chunkStr = '';
            let tempChunk = chunk;
            let subIndex = 0;
            while (tempChunk > 0) {
                const d = tempChunk % 10;
                if (d > 0) {
                    chunkStr = (d === 1 && subIndex > 0 ? '' : digits[d]) + subUnits[subIndex] + chunkStr;
                }
                tempChunk = Math.floor(tempChunk / 10);
                subIndex++;
            }
            result = chunkStr + units[unitIndex] + result;
        }
        num = Math.floor(num / 10000);
        unitIndex++;
    }
    
    return '금' + result + '원';
}

function formatCurrency(amount: number): string {
    return amount.toLocaleString('ko-KR');
}

function getToday(): string {
    const now = new Date();
    return `${now.getFullYear()}년 ${String(now.getMonth() + 1).padStart(2, '0')}월 ${String(now.getDate()).padStart(2, '0')}일`;
}

export default function ExpenseDocument({ data, onClose }: ExpenseDocumentProps) {
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = async () => {
        let printFrame: HTMLIFrameElement | null = null;
        try {
            const printContent = printRef.current;
            if (!printContent) {
                alert('인쇄할 문서를 찾지 못했습니다. 미리보기를 다시 열어주세요.');
                return;
            }

            const printableHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
                <title>지출품의서</title>
                <style>
                    @page { size: A4; margin: 15mm; }
                    body { font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; margin: 0; padding: 20px; color: #000; }
                    .document { max-width: 210mm; margin: 0 auto; }
                    .header { text-align: center; font-size: 24px; font-weight: bold; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 3px solid #000; color: #000; }
                    .field-row { display: flex; margin-bottom: 10px; font-size: 15px; line-height: 1.8; color: #000; }
                    .field-label { width: 90px; font-weight: 700; flex-shrink: 0; }
                    .field-value { flex: 1; border-bottom: 1px solid #ddd; padding-left: 5px; }
                    .body-text { font-size: 15px; line-height: 2; margin: 25px 0; color: #000; min-height: 80px; }
                    .detail-label { font-weight: 700; margin-top: 15px; margin-bottom: 8px; font-size: 15px; color: #000; }
                    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                    th, td { border: 1px solid #000; padding: 10px 12px; text-align: center; font-size: 14px; color: #000; }
                    th { background: #f2f2f2; font-weight: 700; }
                    td.right { text-align: right; }
                    .total-row td { font-weight: 800; background: #fafafa; border-top: 2px solid #000; }
                    .footer-info { margin-top: 25px; font-size: 14px; line-height: 1.8; color: #000; }
                    .seal-section { display: flex; gap: 10px; margin-top: 50px; padding-top: 20px; border-top: 2px solid #000; font-size: 14px; justify-content: flex-end; }
                    .seal-item { text-align: center; width: 80px; border: 1px solid #000; padding: 5px; }
                    .seal-label { font-size: 12px; color: #000; margin-bottom: 5px; padding-bottom: 3px; border-bottom: 1px solid #ddd; font-weight: 600; }
                    .seal-name { font-weight: 700; font-size: 15px; color: #000; min-height: 35px; display: flex; align-items: center; justify-content: center; }
                    .doc-info { margin-top: 40px; font-size: 13px; color: #333; border-top: 1px solid #000; padding-top: 15px; }
                </style>
            </head>
            <body>${printContent.innerHTML}</body>
            </html>`;

            const fileDate = new Date().toISOString().slice(0, 10);
            const nativeResult = await saveJjssPdf('budget', `지출품의서_${fileDate}.pdf`, printableHtml);
            if (nativeResult) {
                if (nativeResult.canceled) alert(savedLocationMessage(nativeResult));
                return;
            }

            printFrame = document.createElement('iframe');
            printFrame.title = '지출품의서 인쇄';
            printFrame.setAttribute('aria-hidden', 'true');
            Object.assign(printFrame.style, {
                position: 'fixed',
                right: '0',
                bottom: '0',
                width: '1px',
                height: '1px',
                border: '0',
                opacity: '0',
                pointerEvents: 'none',
            });
            document.body.appendChild(printFrame);

            const printDocument = printFrame.contentDocument;
            const printWindow = printFrame.contentWindow;
            if (!printDocument || !printWindow) {
                printFrame.remove();
                printFrame = null;
                alert('인쇄 문서를 준비하지 못했습니다. 원본 지출 내역은 유지됩니다.');
                return;
            }

            printDocument.open();
            printDocument.write(printableHtml);
            printDocument.close();
            printDocument.title = `지출품의서 - ${data.title || '지출 품의'}`;
            const cleanup = () => {
                printFrame?.remove();
                printFrame = null;
            };
            printWindow.onafterprint = cleanup;
            alert('인쇄/PDF 저장 창을 준비했습니다. 저장에 실패해도 원본 지출 내역은 유지됩니다.');
            setTimeout(() => {
                try {
                    printWindow.focus();
                    printWindow.print();
                    setTimeout(cleanup, 1000);
                } catch {
                    alert('인쇄/PDF 저장을 시작하지 못했습니다. 원본 지출 내역은 유지됩니다.');
                    cleanup();
                }
            }, 300);
        } catch {
            printFrame?.remove();
            alert('지출품의서 출력 중 오류가 발생했습니다. 원본 지출 내역은 유지됩니다.');
        }
    };

    const today = getToday();
    const totalAmount = data.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    // 카테고리별 그룹
    const categories = [...new Set(data.expenses.map(e => e.category || '기타'))];
    const categoryTotals = categories.map(cat => ({
        category: cat,
        items: data.expenses.filter(e => (e.category || '기타') === cat),
        total: data.expenses.filter(e => (e.category || '기타') === cat).reduce((s, e) => s + (e.amount || 0), 0),
    }));

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* 툴바 */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-100 border-b">
                    <span className="text-gray-700 font-medium">지출품의서 미리보기</span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrint}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                        >
                            <Printer className="w-4 h-4" />
                            인쇄 / 저장
                        </button>
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-200 transition text-gray-500">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
                    <div ref={printRef} className="document bg-white p-10 rounded shadow-sm mx-auto" style={{ maxWidth: '210mm', fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif", color: '#000' }}>
                        {/* 센터명 */}
                        <div className="header" style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold', marginBottom: '30px', paddingBottom: '15px', borderBottom: '3px solid #000', color: '#000' }}>
                            {data.centerName || '○○ 센터'}
                        </div>

                        {/* 수신/경유/제목 */}
                        <div style={{ marginBottom: '25px', fontSize: '15px', lineHeight: '1.8', color: '#000' }}>
                            <div className="field-row" style={{ display: 'flex', marginBottom: '10px' }}>
                                <span className="field-label" style={{ width: '90px', fontWeight: 700, flexShrink: 0 }}>수신</span>
                                <span className="field-value" style={{ flex: 1, borderBottom: '1px solid #eee' }}>내부결재</span>
                            </div>
                            <div className="field-row" style={{ display: 'flex', marginBottom: '10px' }}>
                                <span className="field-label" style={{ width: '90px', fontWeight: 700, flexShrink: 0 }}>(경유)</span>
                                <span className="field-value" style={{ flex: 1, borderBottom: '1px solid #eee' }}></span>
                            </div>
                            <div className="field-row" style={{ display: 'flex', marginBottom: '10px' }}>
                                <span className="field-label" style={{ width: '90px', fontWeight: 700, flexShrink: 0 }}>제목</span>
                                <span className="field-value" style={{ flex: 1, fontWeight: 700, borderBottom: '1px solid #eee' }}>{data.title || '지출 품의'}</span>
                            </div>
                        </div>

                        {/* 본문 */}
                        <div className="body-text" style={{ fontSize: '15px', lineHeight: '2', margin: '20px 0', color: '#000', minHeight: '60px' }}>
                            {data.purpose || '아래와 같이 지출하고자 합니다.'}
                        </div>

                        {/* 세부 내역 */}
                        <div style={{ fontSize: '15px', lineHeight: '1.8', color: '#000' }}>
                            <div className="detail-label" style={{ fontWeight: 700, marginTop: '15px', marginBottom: '8px' }}>
                                가. 건　　명 : {data.title}
                            </div>
                            <div className="detail-label" style={{ fontWeight: 700, marginBottom: '8px' }}>
                                나. 지출금액 : {formatCurrency(totalAmount)}원({numberToKorean(totalAmount)})
                            </div>
                            <div className="detail-label" style={{ fontWeight: 700, marginBottom: '8px' }}>
                                다. 산출내역
                            </div>
                        </div>

                        {/* 테이블 */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '15px 0' }}>
                            <thead>
                                <tr>
                                    <th style={{ border: '1px solid #000', padding: '10px 12px', background: '#f2f2f2', fontWeight: 700, fontSize: '14px', color: '#000' }}>구분</th>
                                    <th style={{ border: '1px solid #000', padding: '10px 12px', background: '#f2f2f2', fontWeight: 700, fontSize: '14px', color: '#000' }}>사업명</th>
                                    <th style={{ border: '1px solid #000', padding: '10px 12px', background: '#f2f2f2', fontWeight: 700, fontSize: '14px', color: '#000' }}>품명/내용</th>
                                    <th style={{ border: '1px solid #000', padding: '10px 12px', background: '#f2f2f2', fontWeight: 700, fontSize: '14px', color: '#000' }}>거래처</th>
                                    <th style={{ border: '1px solid #000', padding: '10px 12px', background: '#f2f2f2', fontWeight: 700, fontSize: '14px', color: '#000' }}>금액(원)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.expenses.map((e, i) => (
                                    <tr key={i}>
                                        <td style={{ border: '1px solid #000', padding: '10px 12px', textAlign: 'center', fontSize: '14px', color: '#000' }}>{e.category || '기타'}</td>
                                        <td style={{ border: '1px solid #000', padding: '10px 12px', textAlign: 'center', fontSize: '14px', color: '#000' }}>{e.projectName || '사업 미지정'}</td>
                                        <td style={{ border: '1px solid #000', padding: '10px 12px', textAlign: 'center', fontSize: '14px', color: '#000' }}>{e.description}</td>
                                        <td style={{ border: '1px solid #000', padding: '10px 12px', textAlign: 'center', fontSize: '14px', color: '#000' }}>{e.vendor || '-'}</td>
                                        <td style={{ border: '1px solid #000', padding: '10px 12px', textAlign: 'right', fontSize: '14px', color: '#000' }}>{formatCurrency(e.amount)}</td>
                                    </tr>
                                ))}
                                <tr className="total-row">
                                    <td colSpan={4} style={{ border: '1px solid #000', padding: '10px 12px', textAlign: 'center', fontWeight: 800, fontSize: '15px', background: '#fafafa', color: '#000' }}>합계</td>
                                    <td style={{ border: '1px solid #000', padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: '15px', background: '#fafafa', color: '#000' }}>{formatCurrency(totalAmount)}</td>
                                </tr>
                            </tbody>
                        </table>

                        {/* 하단 정보 */}
                        <div className="footer-info" style={{ marginTop: '25px', fontSize: '14px', lineHeight: '1.8', color: '#000' }}>
                            <p>라. 지출방법 : 개인별 계좌로 입금 조치</p>
                            <p>마. 예산과목 : {categories.join(', ')}</p>
                        </div>

                        {/* 결재란 */}
                        <div className="seal-section" style={{ display: 'flex', gap: '15px', marginTop: '50px', paddingTop: '20px', borderTop: '2px solid #000', fontSize: '15px', justifyContent: 'flex-end' }}>
                            {data.approvers.map((app, idx) => (
                                <div key={idx} className="seal-item" style={{ textAlign: 'center', width: '85px', border: '1px solid #000', padding: '5px' }}>
                                    <div className="seal-label" style={{ fontSize: '12px', color: '#000', marginBottom: '8px', paddingBottom: '4px', borderBottom: '1px solid #ddd', fontWeight: 600 }}>{app.title}</div>
                                    <div className="seal-name" style={{ fontWeight: 700, fontSize: '15px', color: '#000', minHeight: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {app.name || '　'}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* 시행/주소/전화 */}
                        <div className="doc-info" style={{ marginTop: '40px', fontSize: '13px', color: '#333', borderTop: '2px solid #000', paddingTop: '15px' }}>
                            <div>시행일자: {today}</div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
