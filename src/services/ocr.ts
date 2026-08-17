/**
 * OCR 서비스 - Google Cloud Vision API를 활용한 이미지 텍스트 추출
 * 
 * ✅ Vision API REST 엔드포인트를 직접 호출합니다 (API 키 방식).
 * 프록시 서버 없이 클라이언트에서 직접 호출 가능합니다.
 */

import { useSettingsStore } from '../store/settingsStore';
import { GEMINI_MAX_OUTPUT_TOKENS, normalizeGeminiTextModel } from './gemini';
import { getAiDocumentValidationError } from '../utils/fileValidation';
import { safeErrorMetadata } from '../utils/safeError';
import { apiKeyRequiredMessage, notifyApiKeyRequired } from '../utils/apiKeyPrompt';
import {
    beginAIRequestJob,
    createAIRequestFingerprint,
    isAIRequestAbort,
} from './aiRequestSafety';

const OCR_FAILURE_BLOCK_THRESHOLD = 3;
const OCR_FAILURE_BLOCK_MS = 30_000;
const OCR_REPEATED_FAILURE_MESSAGE = '동일 기능에서 오류가 반복되어 잠시 후 다시 시도해 주세요. 모델명, API 키, quota를 확인해 주세요.';
const ocrFailures = new Map<string, { count: number; blockedUntil: number }>();

function safeOcrErrorMetadata(error: any) {
    return safeErrorMetadata(error);
}

function assertOcrAvailable() {
    const now = Date.now();
    const failureState = ocrFailures.get('ocr');
    if (failureState?.blockedUntil && failureState.blockedUntil > now) {
        throw new Error(OCR_REPEATED_FAILURE_MESSAGE);
    }
}

function recordOcrSuccess() {
    ocrFailures.delete('ocr');
}

function recordOcrFailure() {
    const current = ocrFailures.get('ocr');
    const count = (current?.count || 0) + 1;
    ocrFailures.set('ocr', {
        count,
        blockedUntil: count >= OCR_FAILURE_BLOCK_THRESHOLD ? Date.now() + OCR_FAILURE_BLOCK_MS : 0,
    });
}

// 이미지 파일을 Base64로 변환
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// fallback 헬퍼: Gemini API를 사용하여 텍스트 추출 (PDF 완벽 지원)
async function extractTextWithGemini(file: File, geminiApiKey: string, base64Data: string, signal?: AbortSignal): Promise<string> {
    const { settings } = useSettingsStore.getState();
    const geminiConfig = settings.llmConfigs.find(c => c.provider === 'gemini');
    const model = normalizeGeminiTextModel(geminiConfig?.model);
    const mimeType = file.type || 'image/png';
    const requestBody = {
        contents: [
            {
                parts: [
                    { text: "이 문서에 있는 텍스트를 모두 빠짐없이 추출해줘. 중간에 생략하지 말고, 디자인 요소 설명하지 말고 오직 글씨만 순서대로 기재해줘." },
                    {
                        inlineData: {
                            mimeType,
                            data: base64Data
                        }
                    }
                ]
            }
        ],
        generationConfig: {
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        },
    };

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal,
        }
    );

    if (!response.ok) {
        throw new Error(`Gemini OCR 요청에 실패했습니다. (HTTP ${response.status})`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('텍스트를 인식할 수 없습니다.');
    return text.trim();
}

// Vision API를 통한 OCR 실행 (REST API 직접 호출) + Gemini Fallback
export async function performOCR(file: File, options?: { signal?: AbortSignal }): Promise<string> {
    const validationError = getAiDocumentValidationError(file);
    if (validationError) throw new Error(validationError);
    const { settings } = useSettingsStore.getState();
    const visionApiKey = settings.visionApiKey;
    const geminiConfig = settings.llmConfigs.find(c => c.provider === 'gemini');
    const geminiApiKey = geminiConfig?.apiKey;
    
    // 두 API 키 모두 없는 경우 에러 처리
    if (!visionApiKey && !geminiApiKey) {
        notifyApiKeyRequired();
        throw new Error(
            'OCR 기능을 사용하려면 Vision API 키 또는 Google Gemini API 키가 필요합니다.\n\n' +
            '설정에서 사용할 서비스의 API 키를 입력해 주세요.'
        );
    }

    assertOcrAvailable();
    const model = normalizeGeminiTextModel(geminiConfig?.model);
    const job = beginAIRequestJob({
        featureKey: 'ocr:document',
        requestFingerprint: createAIRequestFingerprint({ size: file.size, type: file.type, lastModified: file.lastModified }),
        signal: options?.signal,
    });

    try {

        const base64Data = await fileToBase64(file);
        const isPDF = file.type === 'application/pdf';

        // PDF인 경우 Vision API가 직접 지원하지 않으므로 즉시 Gemini로 전환합니다.
        if (isPDF) {
            if (!geminiApiKey) {
                notifyApiKeyRequired('gemini');
                throw new Error(`PDF 문서 분석에는 ${apiKeyRequiredMessage('gemini')}`);
            }
            console.info('PDF OCR은 Gemini API로 텍스트 추출을 시도합니다.');
            job.beginAttempt('gemini', model);
            const text = await extractTextWithGemini(file, geminiApiKey, base64Data, job.signal);
            job.assertActive();
            job.finish('completed');
            recordOcrSuccess();
            return text;
        }

        // 이미지 OCR 호출 순서: Vision API 키가 있으면 Vision API를 먼저 시도하고, 실패 시 Gemini API 키가 있을 때만 fallback합니다.
        if (visionApiKey) {
            const requestBody = {
                requests: [
                    {
                        image: { content: base64Data },
                        features: [{ type: 'TEXT_DETECTION', maxResults: 10 }],
                        imageContext: { languageHints: ['ko', 'en'] },
                    },
                ],
            };

            try {
                job.beginAttempt('vision', 'text-detection');
                const response = await fetch(
                    `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody),
                        signal: job.signal,
                    }
                );

                if (!response.ok) {
                    // 권한 오류이거나 잘못된 형식이면 예외 발생시켜서 Gemini fallback으로 넘어가게 함
                    throw new Error(`Vision API 실패: HTTP ${response.status}`);
                }

                const data = await response.json();
                const annotations = data.responses?.[0]?.textAnnotations;
                
                if (annotations && annotations.length > 0) {
                    job.assertActive();
                    job.finish('completed');
                    recordOcrSuccess();
                    return annotations[0].description || '';
                }
            } catch (error: any) {
                console.warn('Vision API 실패, Gemini fallback을 1회 시도합니다:', safeOcrErrorMetadata(error));
                // Vision API 실패 시, Gemini API 키가 있다면 아래에서 이어서 시도
            }
        }

        // Vision API가 없었거나 실패했을 경우 Gemini를 최대 1회 호출합니다.
        if (geminiApiKey) {
            try {
                job.beginAttempt('gemini', model);
                const text = await extractTextWithGemini(file, geminiApiKey, base64Data, job.signal);
                job.assertActive();
                job.finish('completed');
                recordOcrSuccess();
                return text;
            } catch (error: any) {
                throw new Error(`대체 수단(Gemini) 실패:\n${error.message}`);
            }
        }

        throw new Error('문서 분석에 실패했습니다. Vision API 또는 Gemini API 설정을 확인해주세요.');
    } catch (error) {
        job.finish(job.cancelled || isAIRequestAbort(error) ? 'cancelled' : 'failed');
        if (job.cancelled || isAIRequestAbort(error)) throw error;
        recordOcrFailure();
        throw error;
    }
}

// ─── 헬퍼: 줄 단위로 키워드 뒤 값을 찾는 함수 ───
function findValueAfterKeyword(lines: string[], keywords: string[]): string | null {
    for (const line of lines) {
        for (const kw of keywords) {
            const idx = line.indexOf(kw);
            if (idx >= 0) {
                let rest = line.substring(idx + kw.length).replace(/^[\s:：]+/, '').trim();
                if (rest) return rest;
            }
        }
    }
    return null;
}

// ─── 헬퍼: 생년월일에서 나이 계산 ───
function birthDateToAge(dateStr: string): string | null {
    let year: number | null = null;
    
    const fullMatch = dateStr.match(/(\d{4})\s*[-./년]\s*(\d{1,2})/);
    if (fullMatch) {
        year = parseInt(fullMatch[1]);
    } else {
        const shortMatch = dateStr.match(/^(\d{2})(\d{2})(\d{2})/);
        if (shortMatch) {
            const yy = parseInt(shortMatch[1]);
            year = yy >= 40 ? 1900 + yy : 2000 + yy;
        }
    }
    
    if (year && year > 1930 && year < 2020) {
        const age = new Date().getFullYear() - year;
        return age.toString();
    }
    return null;
}

// ─── OCR 결과에서 이용자 정보 추출 (정밀 파싱) ───
export function parseSeekerFromOCR(text: string): Partial<{
    name: string;
    age: string;
    disabilityType: string;
    severity: string;
    desiredJob1: string;
    desiredJob2: string;
    desiredSalary: string;
    desiredWorkHours: string;
    desiredLocation: string;
    recommendingAgency: string;
    notes: string;
    seekerId: string;
    status: string;
}> {
    const result: Record<string, string> = {};
    
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const fullText = lines.join(' ');
    
    // ── 1. 이름/성명 ──
    const nameKws = ['성명', '이름', '성 명', '이 름', '이용자명', '이용자 명', '대상자명', '대상자 명'];
    const nameVal = findValueAfterKeyword(lines, nameKws);
    if (nameVal) {
        const nameMatch = nameVal.match(/^([가-힣]{2,4})/);
        if (nameMatch) result.name = nameMatch[1];
        else result.name = nameVal.split(/\s/)[0];
    }
    
    // ── 2. 나이/연령/생년월일 ──
    const ageKws = ['나이', '연령', '나 이', '연 령'];
    const ageVal = findValueAfterKeyword(lines, ageKws);
    if (ageVal) {
        const ageNum = ageVal.match(/(\d{1,3})\s*세?/);
        if (ageNum) result.age = ageNum[1];
    }
    if (!result.age) {
        const birthKws = ['생년월일', '생년 월일', '생년', '생 년 월 일'];
        const birthVal = findValueAfterKeyword(lines, birthKws);
        if (birthVal) {
            const computed = birthDateToAge(birthVal);
            if (computed) result.age = computed;
        }
    }
    if (!result.age) {
        const idMatch = fullText.match(/(\d{6})\s*[-]\s*[\d*]{7}/);
        if (idMatch) {
            const computed = birthDateToAge(idMatch[1]);
            if (computed) result.age = computed;
        }
    }
    
    // ── 3. 장애유형/장애종류 ──
    const disTypeKws = ['장애유형', '장애종류', '장애 유형', '장애 종류', '장 애 유 형'];
    const disTypeVal = findValueAfterKeyword(lines, disTypeKws);
    if (disTypeVal) {
        result.disabilityType = disTypeVal.replace(/\d+급/, '').replace(/[()（）\[\]]/g, '').trim().split(/\s{2,}/)[0];
    }
    if (!result.disabilityType) {
        const knownTypes = ['지적장애', '자폐성장애', '정신장애', '지체장애', '시각장애', '청각장애', '뇌병변장애', '발달장애', '언어장애', '신장장애', '심장장애', '간장애', '안면장애', '장루·요루장애', '호흡기장애', '뇌전증장애'];
        for (const t of knownTypes) {
            if (fullText.includes(t)) {
                result.disabilityType = t;
                break;
            }
        }
    }
    
    // ── 4. 중증/경증 여부 ──
    const sevKws = ['중경증', '중·경증', '장애정도', '장애 정도', '장 애 정 도', '장애등급', '장애 등급'];
    const sevVal = findValueAfterKeyword(lines, sevKws);
    if (sevVal) {
        if (sevVal.includes('중증') || sevVal.includes('심한')) result.severity = '중증';
        else if (sevVal.includes('경증') || sevVal.includes('심하지')) result.severity = '경증';
        else result.severity = sevVal.split(/\s/)[0];
    }
    if (!result.severity) {
        if (fullText.includes('중증') || fullText.includes('심한 장애')) result.severity = '중증';
        else if (fullText.includes('경증') || fullText.includes('심하지 않은')) result.severity = '경증';
    }
    if (!result.severity) {
        const gradeMatch = fullText.match(/(\d)\s*급/);
        if (gradeMatch) {
            const grade = parseInt(gradeMatch[1]);
            result.severity = grade <= 3 ? '중증' : '경증';
        }
    }
    
    // ── 5. 희망직종 ──
    const jobKws = ['희망직종', '희망 직종', '원하는 직종', '희망 직무', '희망직무', '취업 희망'];
    const jobVal = findValueAfterKeyword(lines, jobKws);
    if (jobVal) {
        const jobSplit = jobVal.split(/[,·/、]/).map(s => s.trim()).filter(Boolean);
        if (jobSplit[0]) result.desiredJob1 = jobSplit[0];
        if (jobSplit[1]) result.desiredJob2 = jobSplit[1];
    }
    
    // ── 6. 희망임금/급여 ──
    const salaryKws = ['희망임금', '희망 임금', '희망급여', '희망 급여', '원하는 급여', '희망 월급'];
    const salaryVal = findValueAfterKeyword(lines, salaryKws);
    if (salaryVal) {
        result.desiredSalary = salaryVal.split(/\s{2,}/)[0];
    }
    
    // ── 7. 희망근무시간 ──
    const hoursKws = ['희망근무시간', '희망 근무시간', '근무시간', '희망 근무 시간', '근무 시간'];
    const hoursVal = findValueAfterKeyword(lines, hoursKws);
    if (hoursVal) {
        result.desiredWorkHours = hoursVal.split(/\s{2,}/)[0];
    }
    
    // ── 8. 희망지역/거주지/주소 ──
    const locKws = ['희망지역', '희망 지역', '근무희망지역', '거주지', '거주 지역', '주소', '주 소'];
    const locVal = findValueAfterKeyword(lines, locKws);
    if (locVal) {
        result.desiredLocation = locVal.split(/\s{3,}/)[0];
        if (result.desiredLocation.length > 30) {
            const shortAddr = result.desiredLocation.match(/(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)\S*\s*\S*(?:시|구|군)/);
            if (shortAddr) result.desiredLocation = shortAddr[0].trim();
        }
    }
    
    // ── 9. 추천/의뢰기관 ──
    const agencyKws = ['추천기관', '추천 기관', '의뢰기관', '의뢰 기관', '연계기관', '소속기관', '의 뢰 기 관'];
    const agencyVal = findValueAfterKeyword(lines, agencyKws);
    if (agencyVal) {
        result.recommendingAgency = agencyVal.split(/\s{2,}/)[0];
    }
    
    // ── 10. 비고/특이사항/특기사항 ──
    const notesKws = ['비고', '특이사항', '특기사항', '메모', '비 고', '특이 사항'];
    const notesVal = findValueAfterKeyword(lines, notesKws);
    if (notesVal) {
        result.notes = notesVal;
    }
    
    // ── 직업상담 접수 양식 전용 패턴 추가 ──
    if (!result.disabilityType) {
        const categoryLine = lines.find(l => l.includes('구분') && (l.includes('장애') || l.includes('발달')));
        if (categoryLine) {
            const afterKw = categoryLine.substring(categoryLine.indexOf('구분') + 2).replace(/^[\s:：]+/, '').trim();
            if (afterKw) result.disabilityType = afterKw.split(/\s{2,}/)[0];
        }
    }
    
    // 개인정보 보호: 프로덕션에서 파싱 결과를 콘솔에 출력하지 않음
    return result;
}

// ─── OCR 결과에서 영수증 정보 추출 (공공기관 예산 지출 항목 포함) ───
export type ReceiptParseResult = Partial<{
    date: string;
    vendor: string;
    vendorBizNo: string;
    amount: number;
    quantity: number;
    unitPrice: number;
    supplyAmount: number;
    vat: number;
    description: string;
    paymentMethod: string;
    cardType: string;
    cardLastFour: string;
    approvalNo: string;
}>;

export function parseReceiptFromOCR(text: string): ReceiptParseResult {
    const result: Record<string, any> = {};
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    const fullText = lines.join(' ');
    
    // ── 1. 날짜 추출 ──
    const datePatterns = [
        /승인일[시자]?\s*[:\s]?\s*(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/,
        /거래일[시자]?\s*[:\s]?\s*(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})/,
        /(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/,
        /(\d{4})(\d{2})(\d{2})\d{4,6}/,
    ];
    for (const pattern of datePatterns) {
        const dateMatch = text.match(pattern);
        if (dateMatch) {
            const y = dateMatch[1], m = dateMatch[2], d = dateMatch[3];
            if (parseInt(y) >= 2020 && parseInt(y) <= 2030 && parseInt(m) >= 1 && parseInt(m) <= 12) {
                result.date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                break;
            }
        }
    }
    
    // ── 2. 금액 추출 ──
    const amountPatterns = [
        /\[?승인\s*금액\]?\s*[:\s]?\s*([\d,]+)/,
        /합\s*계\s*금?\s*액?\s*[:\s]?\s*([\d,]+)/,
        /총\s*액\s*[:\s]?\s*([\d,]+)/,
        /결제\s*금액\s*[:\s]?\s*([\d,]+)/,
        /총\s*결제\s*[:\s]?\s*([\d,]+)/,
        /\[?판매\s*금액\]?\s*[:\s]?\s*([\d,]+)/,
        /거래\s*금액\s*[:\s]?\s*([\d,]+)/,
    ];
    
    for (const pattern of amountPatterns) {
        const amountMatch = fullText.match(pattern);
        if (amountMatch) {
            const numStr = amountMatch[1].replace(/,/g, '');
            const parsed = parseInt(numStr, 10);
            if (parsed > 0 && parsed < 100000000) {
                result.amount = parsed;
                break;
            }
        }
    }
    
    if (!result.amount) {
        const wonPatterns = fullText.match(/([\d,]+)\s*원/g);
        if (wonPatterns) {
            const amounts = wonPatterns
                .map(m => parseInt(m.replace(/[^0-9]/g, ''), 10))
                .filter(a => a >= 100 && a <= 50000000);
            if (amounts.length > 0) {
                result.amount = Math.max(...amounts);
            }
        }
    }
    
    if (!result.amount) {
        const allAmounts: number[] = [];
        for (const line of lines) {
            if (line.match(/카드\s*번호|전화|팩스|FAX|사업자.*번호|TEL|승인\s*번호/i)) continue;
            const nums = line.match(/[\d,]{3,8}/g);
            if (nums) {
                for (const n of nums) {
                    const val = parseInt(n.replace(/,/g, ''), 10);
                    if (val >= 100 && val <= 50000000 && n.replace(/,/g, '').length <= 8) {
                        allAmounts.push(val);
                    }
                }
            }
        }
        if (allAmounts.length > 0) result.amount = Math.max(...allAmounts);
    }
    
    // ── 3. 부가세 / 공급가액 추출 ──
    const vatMatch = fullText.match(/\[?부\s*(?:가\s*)?[세가]\s*(?:액)?\]?\s*[:\s]?\s*([\d,]+)/);
    if (vatMatch) {
        const val = parseInt(vatMatch[1].replace(/,/g, ''), 10);
        if (val > 0 && val < 50000000) result.vat = val;
    }
    
    const supplyMatch = fullText.match(/\[?공급\s*(?:가\s*)?액\]?\s*[:\s]?\s*([\d,]+)/);
    if (supplyMatch) {
        const val = parseInt(supplyMatch[1].replace(/,/g, ''), 10);
        if (val > 0 && val < 100000000) result.supplyAmount = val;
    }
    
    // 공급가액/부가세는 영수증에 명시된 숫자만 사용한다.
    // amount만 있는 경우 부가세를 임의 계산하지 않는다.
    
    // ── 4. 가맹점/상호명 추출 ──
    const vendorPatterns = [
        /가맹점\s*[명:]?\s*[:\s]?\s*(.+?)(?:\n|$)/,
        /상\s*호\s*[명:]?\s*[:\s]?\s*(.+?)(?:\n|$)/,
        /업\s*체\s*명?\s*[:\s]?\s*(.+?)(?:\n|$)/,
        /매장\s*[명:]?\s*[:\s]?\s*(.+?)(?:\n|$)/,
    ];
    for (const pattern of vendorPatterns) {
        const match = text.match(pattern);
        if (match) {
            let vendor = match[1].trim()
                .replace(/^명\s*[:：]\s*/, '')
                .replace(/^[:\s]+/, '')
                .trim();
            if (vendor.length > 0 && vendor.length < 50) {
                result.vendor = vendor;
                break;
            }
        }
    }
    if (!result.vendor) {
        const storeLine = lines.find(l => l.includes('매입사') || l.includes('가맹점'));
        if (storeLine) {
            const after = storeLine.replace(/.*(?:매입사|가맹점)\s*[:\]]\s*/, '').trim().split(/\s{2,}/)[0];
            if (after && after.length < 30) result.vendor = after;
        }
    }
    
    // ── 5. 사업자등록번호 추출 ──
    const bizNoMatch = fullText.match(/사업자\s*(?:등록)?\s*(?:번호)?\s*[:\s]?\s*(\d{3})\s*[-]?\s*(\d{2})\s*[-]?\s*(\d{5})/);
    if (bizNoMatch) {
        result.vendorBizNo = `${bizNoMatch[1]}-${bizNoMatch[2]}-${bizNoMatch[3]}`;
    }
    
    // ── 6. 카드 정보 추출 ──
    const cardTypes = ['신한카드', '삼성카드', 'KB국민카드', '현대카드', '롯데카드', 'NH농협카드', 'BC카드', '하나카드', '우리카드', '씨티카드'];
    for (const ct of cardTypes) {
        if (fullText.includes(ct)) {
            result.cardType = ct;
            break;
        }
    }
    if (!result.cardType) {
        const cardTypeMatch = fullText.match(/\[?카드\s*종류\]?\s*[:\s]?\s*([^\s\[\]]+)/);
        if (cardTypeMatch) result.cardType = cardTypeMatch[1].trim();
    }
    if (!result.cardType) {
        if (fullText.includes('신용')) result.cardType = '신용카드';
        else if (fullText.includes('체크')) result.cardType = '체크카드';
    }
    
    const cardNoMatch = fullText.match(/\[?카드\s*(?:번호)?\]?\s*[:\s]?\s*(\d{4})\s*[-*]?\s*(\d{2,4}|\*{2,4})\s*[-*]?\s*(\*{2,4}|\d{2,4})\s*[-*]?\s*(\d{4})/);
    if (cardNoMatch) {
        result.cardLastFour = cardNoMatch[4];
    } else {
        const altCardMatch = fullText.match(/(\d{4})\s*[-]\s*\d{2,4}\s*[-]\s*[*\d]{2,4}\s*[-]\s*(\d{4})/);
        if (altCardMatch) result.cardLastFour = altCardMatch[2];
    }
    
    // ── 7. 승인번호 추출 ──
    const approvalMatch = fullText.match(/\[?승인\s*번호\]?\s*[:\s]?\s*(\d{6,10})/);
    if (approvalMatch) {
        result.approvalNo = approvalMatch[1];
    }
    
    // ── 8. 품명/내용 추출 ──
    const descKws = ['품명', '품 명', '상품명', '품목', '내역'];
    for (const kw of descKws) {
        const descLine = lines.find(l => l.includes(kw));
        if (descLine) {
            const after = descLine.substring(descLine.indexOf(kw) + kw.length).replace(/^[\s:：]+/, '').trim();
            if (after) {
                result.description = after.split(/\s{3,}/)[0];
                break;
            }
        }
    }
    
    // ── 9. 결제 방법 ──
    if (text.includes('카드') || text.includes('CARD') || text.includes('신용') || text.includes('체크')) {
        result.paymentMethod = '카드';
    } else if (text.includes('현금') || text.includes('CASH')) {
        result.paymentMethod = '현금';
    } else if (text.includes('계좌') || text.includes('이체')) {
        result.paymentMethod = '계좌이체';
    }
    
    return result;
}

// ─── Gemini AI를 활용한 아이템별 정밀 영수증 파싱 (다중 항목 대응) ───
export interface ReceiptItem {
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    supplyAmount?: number;
    vat?: number;
}

export interface ItemizedReceiptParseResult extends ReceiptParseResult {
    items: ReceiptItem[];
}

export async function smartParseItemizedReceiptWithAI(ocrText: string, options?: { signal?: AbortSignal }): Promise<ItemizedReceiptParseResult> {
    const { settings } = useSettingsStore.getState();
    const geminiConfig = settings.llmConfigs.find(c => c.provider === 'gemini');
    const geminiApiKey = geminiConfig?.apiKey;
    const model = normalizeGeminiTextModel(geminiConfig?.model);
    
    if (!geminiApiKey) {
        const simple = parseReceiptFromOCR(ocrText);
        return { ...simple, items: [] };
    }

    assertOcrAvailable();
    const job = beginAIRequestJob({
        featureKey: 'ocr:receipt-parse',
        requestFingerprint: createAIRequestFingerprint({ text: ocrText, model }),
        signal: options?.signal,
    });
    
    try {
        const requestBody = {
            contents: [
                {
                    parts: [
                        {
                            text: `다음은 영수증 OCR 텍스트입니다. 영수증 전체 정보와 영수증에 기재된 개별 상품 내역(items)을 모두 추출하여 반드시 JSON 형식으로만 응답해 주세요.

중요: 금액은 영수증에 실제로 기재된 숫자만 사용하세요. 절대로 임의로 계산하거나 추정하지 마세요.
- 공급가액과 부가세가 영수증에 명시되어 있으면 그 값을 그대로 사용
- 명시되어 있지 않으면 해당 필드를 null로 설정 (임의로 계산하지 말 것)
                            
추출 항목:
- date: 거래일자 (YYYY-MM-DD)
- vendor: 상호명
- vendorBizNo: 사업자번호
- amount: 총 합계 금액 (영수증 기재값)
- supplyAmount: 총 공급가액 (영수증에 기재된 경우만, 없으면 null)
- vat: 총 부가세 (영수증에 기재된 경우만, 없으면 null)
- paymentMethod: 결제방법 (카드/현금/계좌이체)
- items: 개별 품목 리스트 (Array)
    - description: 품명
    - quantity: 수량 (없으면 1)
    - unitPrice: 단가
    - amount: 금액 (영수증 기재값)
    - supplyAmount: 공급가액 (영수증에 기재된 경우만, 없으면 null)
    - vat: 부가세 (영수증에 기재된 경우만, 없으면 null)

다른 설명 없이 JSON만 출력하세요.

영수증 텍스트:
${ocrText}`
                        }
                    ]
                }
            ],
            generationConfig: {
                maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
            },
        };
        
        job.beginAttempt('gemini', model);
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: job.signal,
            }
        );
        
        if (!response.ok) throw new Error('AI 분석 실패');
        
        const data = await response.json();
        const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = aiText.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, aiText];
        const result = JSON.parse(jsonMatch[1].trim());
        
        job.assertActive();
        job.finish('completed');
        return {
            ...result,
            items: Array.isArray(result.items) ? result.items : []
        };
    } catch (error) {
        job.finish(job.cancelled || isAIRequestAbort(error) ? 'cancelled' : 'failed');
        if (job.cancelled || isAIRequestAbort(error)) throw error;
        console.error('Itemized parsing error:', safeOcrErrorMetadata(error));
        const simple = parseReceiptFromOCR(ocrText);
        return { ...simple, items: [] };
    }
}
