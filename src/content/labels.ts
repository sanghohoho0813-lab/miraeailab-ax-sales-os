import type {
  Degree,
  EvidenceStatus,
  FundingType,
  Headcount,
  Industry,
  Interest,
  Level,
  QuestionArea,
  ScopeLevel,
  TradeType,
  ValueArea,
} from '../types/domain'

export const INDUSTRY_LABEL: Record<Industry, string> = {
  manufacturing: '제조',
  distribution: '유통',
  construction: '건설',
  service: '서비스',
  food: '외식',
  logistics: '물류',
  medical: '의료/웰니스',
  environment: '환경',
  other: '기타',
}
export const INDUSTRY_ORDER: Industry[] = ['manufacturing', 'distribution', 'construction', 'service', 'food', 'logistics', 'medical', 'environment', 'other']

export const HEADCOUNT_LABEL: Record<Headcount | 'unknown', string> = {
  '1-5': '1~5명',
  '6-10': '6~10명',
  '11-20': '11~20명',
  '21-30': '21~30명',
  '30+': '30명+',
  unknown: '잘 모르겠음',
}
export const HEADCOUNT_ORDER: (Headcount | 'unknown')[] = ['1-5', '6-10', '11-20', '21-30', '30+', 'unknown']

export const TRADE_LABEL: Record<TradeType | 'unknown', string> = {
  b2b: 'B2B',
  b2c: 'B2C',
  both: 'B2B + B2C',
  unknown: '잘 모르겠음',
}
export const TRADE_ORDER: (TradeType | 'unknown')[] = ['b2b', 'b2c', 'both', 'unknown']

export const INTEREST_LABEL: Record<Interest, string> = {
  efficiency: '업무효율',
  customer: '고객관리',
  sales: '매출',
  policy_fund: '정책자금',
  gov_support: '정부지원',
  rnd: 'R&D',
  venture: '벤처',
  unknown: '잘 모르겠음',
}
export const INTEREST_ORDER: Interest[] = ['efficiency', 'customer', 'sales', 'policy_fund', 'gov_support', 'rnd', 'venture', 'unknown']

export const DEGREE_OPTIONS: { value: Degree; label: string }[] = [
  { value: 'low', label: '낮음' },
  { value: 'mid', label: '보통' },
  { value: 'high', label: '높음' },
  { value: 'very_high', label: '매우 높음' },
  { value: 'unknown', label: '잘 모르겠음' },
]
export const DEGREE_LABEL: Record<Degree, string> = Object.fromEntries(DEGREE_OPTIONS.map((o) => [o.value, o.label])) as Record<Degree, string>

export const DEGREE_SCORE: Record<Degree, number | null> = { low: 0, mid: 1, high: 2, very_high: 3, unknown: null }

export const LEVEL_LABEL: Record<Level, string> = { low: 'LOW', medium: 'MEDIUM', high: 'HIGH' }
export const LEVEL_KO: Record<Level, string> = { low: '낮음', medium: '보통', high: '높음' }

export const SCOPE_LABEL: Record<ScopeLevel, string> = {
  A: '간단 자동화면 충분',
  B: '부분 AX 적합',
  C: 'Full AX 적합',
  D: '현재 AX 구축 비추천',
}

export const EVIDENCE_LABEL: Record<EvidenceStatus, { icon: string; label: string; desc: string }> = {
  confirmed: { icon: '✅', label: '확인', desc: '대표 또는 컨설턴트가 직접 확인' },
  assumed: { icon: '🟡', label: '추정', desc: '기업·업종 정보를 기반으로 추론' },
  unknown: { icon: '⚪', label: '미확인', desc: '추가 확인 필요' },
}

export const AREA_LABEL: Record<QuestionArea, string> = {
  ceo_dependency: '대표 의존도',
  repetitive_work: '반복업무',
  info_scatter: '업무정보 분산',
  current_system: '현재 시스템',
  customer_mgmt: '고객/거래처 관리',
  quote_order: '견적/주문/발주',
  repurchase: '재구매',
  hiring_burden: '추가채용 부담',
  growth_plan: '성장계획',
  funding_interest: '정책자금/정부지원 관심',
  data_potential: '데이터 축적 가능성',
  internal_owner: '내부 담당자',
}

export const VALUE_AREA_LABEL: Record<ValueArea, string> = {
  time_saving: '업무시간 절감',
  hiring_avoidance: '추가채용 억제',
  revenue_leak: '매출누수 감소',
  throughput: '처리량 증가',
  ceo_time: '대표시간 회수',
  asset_building: '기업자산화',
  external_funding: '외부성장자금 활용',
}
export const VALUE_AREA_ORDER: ValueArea[] = ['time_saving', 'hiring_avoidance', 'revenue_leak', 'throughput', 'ceo_time', 'asset_building', 'external_funding']

export const FUNDING_TYPE_LABEL: Record<FundingType, string> = {
  private_investment: '민간투자',
  guarantee: '보증부 자금',
  policy_loan: '정책융자',
  gov_rnd: '정부 R&D',
  commercialization: '사업화지원',
  employment_subsidy: '고용지원금',
  none: '자금조달 없음',
  unknown: '미확인',
}

export const HANDOFF_STATUS_LABEL: Record<string, string> = {
  draft: '전달 전',
  submitted: '전달됨',
  received: '운영 OS 수신',
  reviewing: '김상호 대표 검토 중',
  proposal_ready: '2차 제안 준비 완료',
}

export const MEETING_STATUS_LABEL: Record<string, string> = {
  draft: '미팅 전',
  live: '미팅 중',
  analyzed: '분석 완료',
  submitted: '전달 완료',
}

/** 홈페이지 3분 AX Fit 문항 라벨 — 사전진단 표시용 (homepage/src/data/businessDiagnosisQuestions.ts 와 동일 키) */
export const DIAGNOSIS_QUESTION_LABEL: Record<string, string> = {
  repeatInput: '같은 정보를 여러 곳에 반복 입력',
  askProgress: '대표가 진행상황을 직접 물어봐야 함',
  toolGaps: '엑셀·카톡·전화·ERP 사이에서 업무가 끊김',
  manualHandoff: '고객 요청·주문이 내부로 수동 전달',
  missDelay: '업무 누락·지연·재확인 반복',
  priorityByMemory: '우선순위가 담당자 기억에 의존',
  dataUnused: '데이터는 있지만 의사결정에 못 씀',
  ceoLoadGrows: '규모가 커질수록 대표 확인업무 증가',
  uniqueWork: '기성 ERP/POS/SaaS 로 안 되는 고유 업무',
  internalOwner: '함께 쓸 내부 담당자',
}
export const DIAGNOSIS_DEGREE_LABEL: Record<string, string> = {
  no: '아니다',
  sometimes: '가끔',
  often: '자주',
  always: '거의 항상',
  dedicated: '전담자 있음',
  partTime: '겸임자 있음',
  ceo: '대표가 직접',
  none: '아직 없음',
}
export const DIAGNOSIS_GRADE_LABEL: Record<string, string> = {
  NO_GO: '지금은 정비 먼저',
  LITE: '작게 시작',
  FULL: '전면 구축 후보',
  HIGH: '최우선 검토',
}
