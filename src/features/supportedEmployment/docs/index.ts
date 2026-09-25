/**
 * 지원고용 결과보고 서류 5종: DOCX(Document) 빌더와 PDF·미리보기용 HTML.
 * 저장은 화면에서: `saveJjssBlob('case-management', buildDocumentFileName(kind, c), await packDocument(doc))`,
 * PDF는 `saveJjssPdf('case-management', buildDocumentFileName(kind, c, { extension: 'pdf' }), buildHtmlPreview(c, kind))`.
 */
import type { Document } from 'docx';
import type { SupportedEmploymentCase } from '../model';
import { packDocument, renderDocx, renderHtml } from '../../docx/blocks';
import {
    buildDocumentFileName,
    coachTimesheetModel,
    documentModel,
    evaluationRecordModel,
    paymentStatementModel,
    resultReportModel,
    SUPPORTED_EMPLOYMENT_DOCUMENTS,
    trainingLogModel,
    type DocumentOptions,
    type SupportedEmploymentDocumentKind,
} from './builders';

export { buildDocumentFileName, packDocument, SUPPORTED_EMPLOYMENT_DOCUMENTS };
export type { DocumentOptions, SupportedEmploymentDocumentKind };

export function buildResultReport(c: SupportedEmploymentCase, options?: DocumentOptions): Document {
    return renderDocx(resultReportModel(c, options));
}

export function buildPaymentStatement(c: SupportedEmploymentCase, options?: DocumentOptions): Document {
    return renderDocx(paymentStatementModel(c, options));
}

export function buildTrainingLog(c: SupportedEmploymentCase, options?: DocumentOptions): Document {
    return renderDocx(trainingLogModel(c, options));
}

export function buildEvaluationRecord(c: SupportedEmploymentCase, options?: DocumentOptions): Document {
    return renderDocx(evaluationRecordModel(c, options));
}

export function buildCoachTimesheet(c: SupportedEmploymentCase, options?: DocumentOptions): Document {
    return renderDocx(coachTimesheetModel(c, options));
}

export function buildDocument(kind: SupportedEmploymentDocumentKind, c: SupportedEmploymentCase, options?: DocumentOptions): Document {
    return renderDocx(documentModel(kind, c, options));
}

/** 표만 쓰는 A4 인쇄용 HTML 문서 전체(<!doctype html>…). savePdf와 화면 미리보기(iframe srcdoc)에 쓴다. */
export function buildHtmlPreview(c: SupportedEmploymentCase, kind: SupportedEmploymentDocumentKind, options?: DocumentOptions): string {
    return renderHtml(documentModel(kind, c, options));
}
