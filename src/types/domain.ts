/**
 * 미래AI랩 AX Partner OS — 도메인 타입.
 *
 * 세 역할을 잇는다.
 *   CUSTOMER  홈페이지 3분 AX Fit 진단 (business_diagnosis_leads / sessions)
 *   PARTNER   이 앱 — 미팅 준비 → 1차 상담(클릭) → 분석 → 운영 OS 전달
 *   MASTER    운영 OS(MIRAE AI LAB OS) — customer_events 이벤트함 → 2차 제안
 *
 * 원칙
 *   - 현장 원본(answers / keyQuote / memo)은 절대 덮어쓰지 않는다. 분석은 별도 필드(analysis)에 버전으로 쌓인다.
 *   - 모든 판단값은 근거 상태(confirmed / assumed / unknown)를 함께 가진다.
 *   - INTERNAL(내부 표현)과 CLIENT SAFE(고객에게 보여도 되는 표현)를 분리한다.
 */

/* ------------------------------------------------------------------ */
/* 회사 기본 정보 — 전부 클릭형                                         */
/* ------------------------------------------------------------------ */

export type Industry =
  | 'manufacturing'
  | 'distribution'
  | 'construction'
  | 'service'
  | 'food'
  | 'logistics'
  | 'medical'
  | 'environment'
  | 'other'

export type Headcount = '1-5' | '6-10' | '11-20' | '21-30' | '30+'

export type TradeType = 'b2b' | 'b2c' | 'both'

export type Interest =
  | 'efficiency'
  | 'customer'
  | 'sales'
  | 'policy_fund'
  | 'gov_support'
  | 'rnd'
  | 'venture'
  | 'unknown'

/** 홈페이지 3분 AX Fit 사전진단 스냅샷 (있을 때만) — 개인정보 없이 신호만 */
export interface DiagnosisSnapshot {
  leadId: string
  grade: 'NO_GO' | 'LITE' | 'FULL' | 'HIGH' | null
  score: number | null
  /** 원 답변(questionId → 값) — repeatInput / askProgress / … / internalOwner */
  answers: Record<string, string>
  submittedAt: string | null
  /** 어떻게 찾았는지 (assigned: 마스터가 배정 / matched: 회사명+연락처 일치 / manual: 직접 입력) */
  matchedBy: 'assigned' | 'matched' | 'manual'
}

export interface Company {
  id: string
  consultantId: string
  name: string
  industry: Industry
  /** 업종이 '기타'일 때 한 줄 */
  industryNote: string
  headcount: Headcount | 'unknown'
  tradeType: TradeType | 'unknown'
  interests: Interest[]
  /** 대표자 이름·연락처 — 선택. 사전진단 매칭에만 사용 */
  representativeName: string
  phone: string
  /** 예정 미팅 일시 (ISO) */
  meetingAt: string | null
  diagnosis: DiagnosisSnapshot | null
  memo: string
  /** 미팅에 쓰기로 고른 사례 id (사례 상세의 "이 사례를 미팅에 사용") */
  pinnedCaseIds?: string[]
  /** 현재 담당 파트너(재배정). null 이면 consultantId(원 작성자). 과거 미팅·전달의 작성자는 덮어쓰지 않는다 */
  assignedTo?: string | null
  /** 항목별 입력 출처 — 정보가 충돌할 때 무엇이 원본인지 (manual / pdf / voice / website_diagnosis / master_edit) */
  fieldSources?: FieldSources
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

/** 업체 정보가 어디서 왔는가 */
export type ProfileSource = 'manual' | 'pdf' | 'voice' | 'website_diagnosis' | 'master_edit'
export type CompanyFieldKey = 'name' | 'representativeName' | 'phone' | 'industry' | 'headcount' | 'tradeType' | 'interests' | 'meetingAt' | 'memo'
export type FieldSources = Partial<Record<CompanyFieldKey, ProfileSource>>

export interface CreateCompanyInput {
  name: string
  industry: Industry
  industryNote?: string
  headcount: Headcount | 'unknown'
  tradeType: TradeType | 'unknown'
  interests: Interest[]
  representativeName?: string
  phone?: string
  meetingAt?: string | null
  memo?: string
  fieldSources?: FieldSources
}

/* ------------------------------------------------------------------ */
/* 회사 프로필 — PDF·음성·수동 입력에서 구조화한 확장 정보 + 근거          */
/* ------------------------------------------------------------------ */

/** 추출된 값 하나 — 값·상태·출처·페이지·원문을 함께 가진다. 확인되지 않은 값은 confirmed 로 저장하지 않는다 */
export interface EvidenceField {
  key: string
  label: string
  value: string | number | null
  /** 화면 표시용 (예: '14명', '12억 3,000만 원') */
  display: string
  status: EvidenceStatus
  source: ProfileSource
  sourcePage: number | null
  /** 근거가 된 원문 한 줄 (개인정보 패턴은 제거된 상태) */
  sourceText: string
  /** 사용자가 "이 정보 사용 안 함" 으로 제외 */
  removed?: boolean
}

export interface FinancialYear {
  year: number
  revenue: number | null
  operatingProfit: number | null
  netIncome: number | null
  assets: number | null
  liabilities: number | null
  equity: number | null
}

/** 문서에서 구조화한 사실 — 문서에 실제로 있는 항목만 채운다 (없으면 null / []) */
export interface ProfileFacts {
  companyName: string | null
  representativeName: string | null
  phone: string | null
  address: string | null
  /** YYYY-MM-DD 또는 YYYY-MM 또는 YYYY */
  foundedAt: string | null
  yearsInBusiness: number | null
  industryText: string | null
  /** 표준산업분류 코드 (예: C28) */
  industryCode: string | null
  industry: Industry | null
  subIndustry: string | null
  headcount: number | null
  headcountBand: Headcount | null
  tradeType: TradeType | null
  products: string[]
  certifications: string[]
  patents: number | null
  /** 신용 관련 공개 정보 (등급 문구 그대로) */
  creditNote: string | null
  financials: FinancialYear[]
  growth: { revenueTrend: 'up' | 'down' | 'flat' | null; revenueGrowthPct: number | null; latestYear: number | null }
  notes: string[]
}

export interface CompanyProfile {
  id: string
  companyId: string
  sourceType: ProfileSource
  /** 문서 종류 (예: '크레탑 기업정보', '회사소개서', '음성 입력') */
  sourceName: string
  sourceFileName: string
  /** 파일 SHA-256 — 같은 문서를 두 번 올렸는지 확인용. 원본은 저장하지 않는다 */
  sourceHash: string
  pageCount: number
  facts: ProfileFacts
  evidence: EvidenceField[]
  parser: { adapter: string; version: string; textChars: number; warnings: string[] }
  createdBy: string
  createdAt: string
}

export interface CreateProfileInput {
  companyId: string
  sourceType: ProfileSource
  sourceName: string
  sourceFileName: string
  sourceHash: string
  pageCount: number
  facts: ProfileFacts
  evidence: EvidenceField[]
  parser: CompanyProfile['parser']
}

/* ------------------------------------------------------------------ */
/* 질문 (WHY / SAY / CLICK)                                             */
/* ------------------------------------------------------------------ */

export type QuestionArea =
  | 'ceo_dependency'
  | 'repetitive_work'
  | 'info_scatter'
  | 'current_system'
  | 'customer_mgmt'
  | 'quote_order'
  | 'repurchase'
  | 'hiring_burden'
  | 'growth_plan'
  | 'funding_interest'
  | 'data_potential'
  | 'internal_owner'

/** 정도 선택 — 5개 큰 버튼 */
export type Degree = 'low' | 'mid' | 'high' | 'very_high' | 'unknown'

export interface QuestionOption {
  value: string
  label: string
  /** 선택지 아래 짧은 힌트 */
  hint?: string
}

export interface Question {
  id: string
  area: QuestionArea
  /** 화면 제목(짧게) */
  title: string
  /** SAY — 고객에게 실제로 이렇게 말한다 */
  say: string
  /** WHY — 왜 이 질문을 하는가 (컨설턴트용) */
  why: string
  options: QuestionOption[]
  /** 이 업종에 우선 노출 (비우면 공통) */
  industries?: Industry[]
  /** 이 관심사에 우선 노출 */
  interests?: Interest[]
  /** B2B 전용 / B2C 전용 */
  tradeTypes?: TradeType[]
  /** 홈페이지 3분 AX Fit 답변으로 미리 채울 수 있는 경우: 진단 questionId 목록 */
  diagnosisKeys?: string[]
  /** 선택 우선순위(작을수록 먼저) */
  priority: number
}

/* ------------------------------------------------------------------ */
/* 미팅                                                                  */
/* ------------------------------------------------------------------ */

export type MeetingStatus = 'draft' | 'live' | 'analyzed' | 'submitted' | 'cancelled'

export type AnswerSource = 'consultant' | 'diagnosis'

export interface Answer {
  questionId: string
  value: string
  source: AnswerSource
  at: string
}

/** 근거 상태 — ✅ 확인 / 🟡 추정 / ⚪ 미확인 */
export type EvidenceStatus = 'confirmed' | 'assumed' | 'unknown'

export interface Fact {
  key: string
  label: string
  value: string
  status: EvidenceStatus
  /** 어디서 왔나 */
  source: 'consultant' | 'diagnosis' | 'ceo_quote' | 'ai_inference' | 'industry_assumption'
}

export type Level = 'low' | 'medium' | 'high'

/** 프로젝트 범위 가설 — 정확한 견적이 아니다 */
export type ScopeLevel = 'A' | 'B' | 'C' | 'D'

export type ValueArea =
  | 'time_saving'
  | 'hiring_avoidance'
  | 'revenue_leak'
  | 'throughput'
  | 'ceo_time'
  | 'asset_building'
  | 'external_funding'

export interface PainPoint {
  rank: number
  area: QuestionArea
  /** INTERNAL 표현 */
  title: string
  /** CLIENT SAFE 표현 */
  clientSafeTitle: string
  /** 발생하는 손실/기회 */
  loss: string
  /** AX 해결구조 (문제 → 손실 → 구조 순서 강제) */
  axStructure: string
  status: EvidenceStatus
}

export interface Analysis {
  version: number
  generatedAt: string
  painPoints: PainPoint[]
  /** 분리 평가 — 하나의 점수로 합치지 않는다 */
  axNeed: Level
  scopeLevel: ScopeLevel
  scopeLabel: string
  scopeReason: string
  validationPotential: Level
  fundingReadiness: Level
  valuePotential: Record<ValueArea, Level>
  similarCaseIds: string[]
  confirmedFacts: Fact[]
  assumptions: Fact[]
  unknowns: Fact[]
  /** 최대 3개 */
  followupQuestions: string[]
  nextMeetingFocus: string[]
  forbiddenReminders: string[]
  todaysPoint: string
  /** 고객 문서에 넣어도 되는 문장 */
  clientSafeSummary: string[]
  /** 추천 AX 구조 (문제 → 손실 → 구조) */
  recommendedStructure: { problem: string; loss: string; structure: string }[]
}

export interface Meeting {
  id: string
  companyId: string
  consultantId: string
  status: MeetingStatus
  /** 이 미팅에서 쓰기로 고른 질문 순서 */
  questionIds: string[]
  /** 원본 답변 — AI가 덮어쓰지 않는다 */
  answers: Record<string, Answer>
  skippedQuestionIds: string[]
  /** 대표가 답하기 어려워한 질문 */
  hardQuestionIds: string[]
  /** 대표가 직접 한 중요한 말 (필수 자유입력 1개) */
  keyQuote: string
  /** 기타 메모 (선택) */
  memo: string
  analysis: Analysis | null
  handoffId: string | null
  startedAt: string | null
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* 운영 OS 전달 (Handoff)                                               */
/* ------------------------------------------------------------------ */

export type HandoffStatus = 'draft' | 'submitted' | 'received' | 'reviewing' | 'proposal_ready' | 'withdrawn'

/** 운영 OS로 넘기는 구조화 데이터 — PDF가 아니라 이것이 본체다 */
export interface HandoffPayload {
  version: 1
  company: {
    name: string
    industry: Industry
    industryNote: string
    headcount: Headcount | 'unknown'
    tradeType: TradeType | 'unknown'
    interests: Interest[]
    representativeName: string
    phone: string
  }
  consultant: { id: string; name: string; email: string }
  meetingDate: string
  diagnosis: DiagnosisSnapshot | null
  answers: { questionId: string; area: QuestionArea; question: string; answer: string; answerLabel: string; source: AnswerSource }[]
  keyQuotes: string[]
  confirmedFacts: Fact[]
  assumptions: Fact[]
  unknownItems: Fact[]
  painPoints: PainPoint[]
  recommendedAxScope: {
    axNeed: Level
    scopeLevel: ScopeLevel
    scopeLabel: string
    scopeReason: string
    validationPotential: Level
    fundingReadiness: Level
    structure: { problem: string; loss: string; structure: string }[]
  }
  similarCases: { id: string; companyName: string; whySimilar: string }[]
  valuePotential: Record<ValueArea, Level>
  fundingInterest: { interested: boolean; note: string }
  followupQuestions: string[]
  internalNotes: string
  clientSafeSummary: string[]
  usage: { durationSec: number | null; skipped: number; hard: number }
}

export interface Handoff {
  id: string
  meetingId: string
  companyId: string
  consultantId: string
  status: HandoffStatus
  payload: HandoffPayload
  /** 운영 OS customer_events.id — 전달 성공의 증거 */
  customerEventId: string | null
  /** 운영 OS에서 연결한 고객사 id (있으면) */
  operationsClientId: string | null
  submittedAt: string | null
  receivedAt: string | null
  /** 철회 (Partner) ↔ 운영 OS 이벤트 ignored — 양쪽이 같은 진실 */
  withdrawnAt?: string | null
  withdrawReason?: string
  /** 기록 보존 + 목록에서 숨김 */
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* 사례 DB                                                               */
/* ------------------------------------------------------------------ */

export type FundingType =
  | 'private_investment'
  | 'guarantee'
  | 'policy_loan'
  | 'gov_rnd'
  | 'commercialization'
  | 'employment_subsidy'
  /** 혼합조달 — 민간투자 + 보증/정책기관 참여 등 두 가지 이상이 결합된 경우 */
  | 'mixed'
  | 'none'
  | 'unknown'

export type CaseVerification = 'verified' | 'needs_review' | 'draft'

export type AxPath = 'internal_ax' | 'customer_portal' | 'hybrid' | 'simple_automation'

export type GrowthStage = 'early' | 'growing' | 'stable' | 'scaling'

export interface CaseStudy {
  id: string
  companyName: string
  industry: Industry
  subIndustry: string
  businessModel: TradeType
  /** 문제가 무엇이었나 */
  problem: string
  beforeProcess: string
  /** 어떻게 바뀌었나 */
  axTransition: string
  internalAx: string
  customerPortal: string
  aiFunction: string
  /** 실증 */
  validation: string
  axPath: AxPath
  growthStage: GrowthStage
  /** 이 고객에게 설명할 포인트 */
  talkingPoints: string[]
  /** 다른 점 / 주의사항 */
  caveats: string[]
  fundingType: FundingType
  /** 실제 공개금액 (원, 없으면 null) */
  fundingAmountDisclosed: number | null
  /** 제도상 최대한도 (원, 없으면 null) — 실제 금액과 반드시 분리 */
  fundingProgramMax: number | null
  fundingNote: string
  year: string
  source: string
  sourceDate: string
  verificationStatus: CaseVerification
  keywords: string[]
  /** 문제 구조 태그 — 업종이 달라도 문제가 비슷한 사례를 찾기 위한 축 */
  problemAreas: QuestionArea[]
  updatedAt: string
  /* ---- 리서치 사례 메타 (PDF 파싱, 모두 선택 필드 — 마스터 수기 사례는 비어 있어도 된다) ---- */
  /** 괄호 안 별칭 (예: 커넥트링(플래그픽) → 플래그픽) */
  companyAlias?: string
  /** 원문 보기 링크 */
  sourceUrl?: string
  /** 리서치 PDF 페이지 */
  researchPage?: number
  /** 업종별 전체 사례 섹션(9분류) */
  researchSection?: string
  /** 10억 미만 특별 인덱스 분류(17분류) */
  researchCategory?: string
  /** 파싱 결과가 애매하거나 실제 수령액이 미공개 → 기본 추천 제외 */
  reviewRequired?: boolean
  reviewReasons?: string[]
  /** 리서치의 AX 등급 A/B/C (A: AX·플랫폼·데이터 전환형, B: 현장 자동화·로봇·디바이스형, C: 제품·브랜드 사업화형) */
  axGrade?: '' | 'A' | 'B' | 'C'
  /** 이번 업데이트에서 새로 검증된 사례(●) */
  newlyVerified?: boolean
  /** 금액 원문 표기 (예: '최대 40 억', '누적 402 억') */
  amountRaw?: string
  /** 실제 공개금액 구간 */
  amountBand?: string
  /** 자금형태 원문 (예: '민간투자 + 신보 참여') */
  fundingForm?: string
  fundingClasses?: FundingType[]
  /** 자금 연결 과정 서술 */
  fundingLink?: string
  /** 마지막 검수 시각 — 180일이 지난 정책·제도 사례는 "출처 재확인 권장" */
  lastVerifiedAt?: string | null
  reviewNote?: string
  /** 리서치 원문 서술 전체 */
  narrative?: string
  narrativeKind?: 'template_A' | 'template_B' | 'template_C' | 'flow' | 'free' | 'none'
  /** 한 줄 요약 (무엇을 만든 회사인가) */
  oneLiner?: string
  /** 정책금융 섹션에 함께 실린 서술 */
  policyNarratives?: string[]
  policyForms?: string[]
  policyPrograms?: string[]
}

/* ------------------------------------------------------------------ */
/* 사용률 이벤트 — 최소                                                  */
/* ------------------------------------------------------------------ */

export type UsageEventType =
  | 'meeting_started'
  | 'question_answered'
  | 'question_skipped'
  | 'question_hard'
  | 'tip_opened'
  | 'case_opened'
  | 'playbook_opened'
  | 'meeting_ended'
  | 'analysis_generated'
  | 'handoff_submitted'
  | 'pdf_printed'
  /* 지능형 등록 (0006) */
  | 'pdf_uploaded'
  | 'pdf_parsed'
  | 'pdf_confirmed'
  | 'pdf_failed'
  | 'voice_intake_used'
  | 'strategy_generated'
  | 'case_auto_matched'
  | 'company_duplicate_detected'
  | 'profile_corrected'

export interface UsageEvent {
  id: string
  meetingId: string | null
  consultantId: string
  eventType: UsageEventType
  payload: Record<string, unknown>
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* 파트너 (권한)                                                          */
/* ------------------------------------------------------------------ */

export type PartnerRole = 'partner' | 'master'

export interface PartnerMember {
  profileId: string
  email: string
  displayName: string
  /** 호칭 (팀장, 대표 …) */
  title: string
  role: PartnerRole
  active: boolean
  createdAt: string
}

/** 마스터 조회용 감사 기록 — 누가 언제 무엇을 어떻게 바꿨는지 */
export interface AuditEvent {
  id: string
  actorId: string | null
  actorName: string
  action: string
  targetType: string
  targetId: string
  detail: Record<string, unknown>
  createdAt: string
}

/** 영구삭제 전 영향 범위 (DB 가 최종 판정) */
export interface CompanyDeletePreview {
  name: string
  meetings: number
  analyzed: number
  handoffs: number
  activeHandoffs: number
  transmitted: number
  usageEvents: number
  canDelete: boolean
  reason: string | null
  requiresMaster: boolean
}

export interface CurrentUser {
  id: string
  email: string
  name: string
  role: PartnerRole
  /** 호칭 (예: 팀장, 대표) — 있으면 인사말에 붙인다 */
  title?: string
}
