/** 검사 플러그인 계약. VE Assist `src/vocational-tests/types.ts`에서 zod·보고서 어댑터를 뺀 형태. */
import type { EventDefinition, ObservationDefinition, TrialDescriptor } from '../model/types';
import type { PartSpecification } from '../model/bimanualTypes';

export interface TestManifest {
    id: string;
    name: string;
    shortName: string;
    version: string;
    description: string;
    durationSeconds: number;
    /** 화면에 그대로 띄우는 제한시간 근거 문구 */
    durationNote: string;
    workflowKind: 'TRIAL' | 'PART_COUNT';
    /** 실시 화면 상단에 띄우는 절차 안내 */
    procedureNote: string;
    partSpecification?: PartSpecification;
}

export interface TestPlugin {
    manifest: TestManifest;
    createTrials: (durationSeconds?: number) => TrialDescriptor[];
    observations: ObservationDefinition[];
    events: EventDefinition[];
}
