/**
 * AFTER — 미팅 종료 분석.
 *
 * 규칙
 *   - 문제 → 손실/기회 → AX 해결구조 순서로만 생성한다. 기능부터 제안하지 않는다.
 *   - AX 필요도 · 구축범위 · 실증 가능성 · 성장자금 활용 준비도는 따로 평가한다(하나의 점수로 합치지 않는다).
 *   - 정확한 견적·3년 가치금액은 만들지 않는다. "프로젝트 범위 가설" 과 LOW/MEDIUM/HIGH 까지만.
 *   - 모든 값에 근거 상태(✅ 확인 / 🟡 추정 / ⚪ 미확인)를 붙인다. AI 추론을 사실처럼 저장하지 않는다.
 *   - 원본 답변은 건드리지 않는다. 결과는 meeting.analysis 에 버전으로 쌓는다.
 */
import type {
  Analysis,
  Answer,
  CaseStudy,
  Company,
  EvidenceStatus,
  Fact,
  Level,
  Meeting,
  PainPoint,
  QuestionArea,
  ScopeLevel,
  ValueArea,
} from '../types/domain'
import { QUESTION_BY_ID, answerIntensity, optionLabel } from '../content/questions'
import { AREA_LABEL, HEADCOUNT_LABEL, INDUSTRY_LABEL, SCOPE_LABEL, TRADE_LABEL } from '../content/labels'
import { TODAYS_POINTS } from '../content/playbook'
import { recommendCases } from './caseMatcher'
import { nowIso } from '../lib/util'

/* ------------------------------------------------------------------ */
/* 영역별 문안 — INTERNAL / CLIENT SAFE / 손실 / 구조                    */
/* ------------------------------------------------------------------ */

export const AREA_COPY: Record<QuestionArea, { internal: string; clientSafe: string; loss: string; structure: string }> = {
  ceo_dependency: {
    internal: '대표 의존도 매우 높음 — 대표가 시스템 역할',
    clientSafe: '대표 중심으로 주요 확인·의사결정이 이루어지는 구조',
    loss: '대표가 자리를 비우면 흐름이 멈추고, 성장할수록 대표 확인업무가 함께 늘어난다',
    structure: '대표가 묻지 않아도 진행상황이 먼저 보이는 운영 현황판 + 예외(지연·누락)만 알림',
  },
  repetitive_work: {
    internal: '반복 입력 규모 큼 — 같은 정보를 여러 번 옮겨 적음',
    clientSafe: '같은 정보를 여러 곳에 입력하는 과정이 반복되는 구조',
    loss: '옮겨 적기 시간, 오타·누락, 거래량이 늘수록 반복도 함께 증가',
    structure: '한 번 입력 → 여러 곳에 자동 반영되는 업무 연결 구간(접수 → 작업 → 정산)',
  },
  info_scatter: {
    internal: '업무정보 분산 심각 — 엑셀·카톡·전화·수첩',
    clientSafe: '업무 정보가 여러 도구에 나뉘어 관리되는 구조',
    loss: '어디까지 됐는지 확인하는 일 자체가 업무가 되고, 도구 사이 빈 구간에서 실수 발생',
    structure: '건별 진행상태가 한 화면에 모이는 업무 DB + 역할별 화면',
  },
  current_system: {
    internal: 'ERP/POS 밖에서 엑셀·카톡으로 다시 관리 (기성 시스템 빈틈)',
    clientSafe: '기존 프로그램 밖에서 별도로 관리하는 업무가 있는 구조',
    loss: '시스템에 넣고도 다시 정리하는 이중 작업, 기성 프로그램에 없는 회사 고유 업무가 사람 손에 의존',
    structure: '기존 시스템은 유지하고, 그 밖의 고유 업무만 회사 전용 화면으로 연결',
  },
  customer_mgmt: {
    internal: '고객/거래처 관리가 담당자 기억·카톡에 의존',
    clientSafe: '고객·거래처 정보가 담당자별로 관리되는 구조',
    loss: '담당자가 바뀌면 관계·이력이 사라지고, 누구에게 언제 연락할지 판단 기준 부재',
    structure: '거래처 DB + 마지막 거래·다음 연락 시점이 보이는 고객 화면 (필요 시 고객포털)',
  },
  quote_order: {
    internal: '주문·견적이 전화·카톡에 분산',
    clientSafe: '주문·견적 요청이 여러 경로로 접수되는 구조',
    loss: '입력시간, 누락, 재주문 관리 어려움, 견적 보낸 뒤 후속 부재',
    structure: 'B2B 주문·견적 포털 + 주문 DB + 상태 알림',
  },
  repurchase: {
    internal: '재구매 시점 미관리 — 거래처가 먼저 연락해야 주문 시작',
    clientSafe: '재주문이 고객의 연락에 의존하는 구조',
    loss: '재구매 주기 사이의 매출 누수, 이탈 고객을 늦게 인지',
    structure: '거래 데이터 축적 → 재구매 시점 알림 → 먼저 제안하는 영업 Action',
  },
  hiring_burden: {
    internal: '성장 시 인건비 동반 증가 구조',
    clientSafe: '업무량이 늘면 인력 증원이 필요한 구조',
    loss: '주문이 늘수록 채용·교육 비용이 함께 증가, 사람을 더 뽑아도 반복 입력은 그대로',
    structure: '반복·확인 업무를 시스템이 맡아 같은 인원으로 처리량을 늘리는 구조',
  },
  growth_plan: {
    internal: '성장계획 적극 — 시스템 없이는 대표 병목 확대',
    clientSafe: '성장 계획에 맞는 운영 기반이 필요한 시점',
    loss: '규모 확대 시 지금의 수작업 구조가 그대로 커진다',
    structure: '성장 단계에 맞춰 확장 가능한 업무 DB 와 역할별 화면',
  },
  funding_interest: {
    internal: '정책자금/정부지원 관심 높음 (별도 평가 — AX 필요도와 합치지 않음)',
    clientSafe: '성장자금 활용에 관심이 있는 상태',
    loss: '실제 변화와 증거(Before/After)가 없으면 자금 설명력이 약하다',
    structure: '현장 문제 → 구축 → 실제 사용 → 데이터 축적 → 경영성과 → 정책금융·R&D·투자 설명력',
  },
  data_potential: {
    internal: '기록이 남지 않거나 흩어짐 — 데이터 자산화 안 됨',
    clientSafe: '업무 기록이 자산으로 쌓이지 않는 구조',
    loss: '감으로 내린 결정을 확인할 방법이 없고, 노하우가 회사에 남지 않는다',
    structure: '기록이 자연스럽게 쌓이는 입력 구조 → 회사 전용 대시보드 → (이후) AI 판단',
  },
  internal_owner: {
    internal: '내부 담당자 부재 — 정착 위험',
    clientSafe: '시스템을 함께 운영할 담당자 지정이 필요한 상태',
    loss: '구축보다 정착이 어렵다. 담당자가 없으면 만든 프로그램이 쓰이지 않는다',
    structure: '대표 + 겸임 담당자 1명으로 시작하는 최소 범위, 정착 후 확대',
  },
}

const PAIN_AREAS: QuestionArea[] = ['ceo_dependency', 'repetitive_work', 'info_scatter', 'current_system', 'customer_mgmt', 'quote_order', 'repurchase', 'hiring_burden', 'data_potential']

/* ------------------------------------------------------------------ */

interface AreaSignal {
  intensity: number | null
  status: EvidenceStatus
  answered: boolean
}

function levelOf(n: number | null): Level {
  if (n === null) return 'low'
  if (n >= 2) return 'high'
  if (n >= 1) return 'medium'
  return 'low'
}

function statusOf(a: Answer | undefined): EvidenceStatus {
  if (!a) return 'unknown'
  if (a.value === 'unknown') return 'unknown'
  return a.source === 'consultant' ? 'confirmed' : 'assumed'
}

/** 영역별 신호 — 같은 영역에 질문이 여럿이면 가장 강한 값 */
function areaSignals(meeting: Meeting): Record<QuestionArea, AreaSignal> {
  const out = {} as Record<QuestionArea, AreaSignal>
  for (const area of Object.keys(AREA_COPY) as QuestionArea[]) out[area] = { intensity: null, status: 'unknown', answered: false }
  for (const qid of meeting.questionIds) {
    const q = QUESTION_BY_ID[qid]
    const a = meeting.answers[qid]
    if (!q || !a) continue
    const n = answerIntensity(qid, a.value)
    const cur = out[q.area]
    const st = statusOf(a)
    if (n === null) {
      if (!cur.answered) out[q.area] = { intensity: null, status: st, answered: true }
      continue
    }
    if (cur.intensity === null || n > cur.intensity) out[q.area] = { intensity: n, status: st, answered: true }
  }
  return out
}

function answerOf(meeting: Meeting, qid: string): string | null {
  const a = meeting.answers[qid]
  return a && a.value !== 'unknown' ? a.value : null
}

/* ------------------------------------------------------------------ */

export function analyzeMeeting(company: Company, meeting: Meeting, cases: CaseStudy[]): Analysis {
  const sig = areaSignals(meeting)
  const g = (area: QuestionArea) => sig[area].intensity

  /* 1) 핵심 문제 TOP 3 — 강도 ≥ 2 인 영역, 동점은 정해진 우선순위 */
  const ranked = PAIN_AREAS.map((area, i) => ({ area, i, n: g(area) ?? -1 }))
    .filter((x) => x.n >= 2)
    .sort((x, y) => y.n - x.n || x.i - y.i)
  const painPoints: PainPoint[] = (ranked.length ? ranked : PAIN_AREAS.map((area, i) => ({ area, i, n: g(area) ?? -1 })).filter((x) => x.n >= 1).slice(0, 2))
    .slice(0, 3)
    .map((x, idx) => ({
      rank: idx + 1,
      area: x.area,
      title: AREA_COPY[x.area].internal,
      clientSafeTitle: AREA_COPY[x.area].clientSafe,
      loss: AREA_COPY[x.area].loss,
      axStructure: AREA_COPY[x.area].structure,
      status: sig[x.area].status,
    }))

  /* 2) 분리 평가 */
  const coreAvgVals = [g('ceo_dependency'), g('repetitive_work'), g('info_scatter')].filter((v): v is number => v !== null)
  const coreAvg = coreAvgVals.length ? coreAvgVals.reduce((a, b) => a + b, 0) / coreAvgVals.length : null
  const axNeed: Level = coreAvg === null ? 'low' : coreAvg >= 2 ? 'high' : coreAvg >= 1 ? 'medium' : 'low'

  const strongAreas = PAIN_AREAS.filter((a) => (g(a) ?? 0) >= 2)
  const connectionNeed = (g('info_scatter') ?? 0) >= 2 || ((g('quote_order') ?? 0) >= 2 && (g('customer_mgmt') ?? 0) >= 2) || (g('repetitive_work') ?? 0) >= 3
  const multiUser = company.headcount !== '1-5' && company.headcount !== 'unknown'
  const customerScreen = (g('quote_order') ?? 0) >= 2 || (g('customer_mgmt') ?? 0) >= 2 || (g('repurchase') ?? 0) >= 2
  const dataPotential = (g('data_potential') ?? 0) >= 2 || (g('repurchase') ?? 0) >= 2
  const owner = answerOf(meeting, 'internal_owner')
  const growth = answerOf(meeting, 'growth_plan')
  const funding = answerOf(meeting, 'funding_interest')

  let scopeLevel: ScopeLevel
  const reasons: string[] = []
  if (axNeed === 'low' && strongAreas.length <= 1) {
    scopeLevel = 'D'
    reasons.push('대표 의존도·반복업무·정보 분산 신호가 약하다')
  } else if (owner === 'none' && growth === 'steady' && strongAreas.length <= 2) {
    scopeLevel = 'D'
    reasons.push('함께 쓸 내부 담당자가 없고 현상 유지 계획이라 정착 위험이 크다')
  } else if (strongAreas.length >= 4 && connectionNeed && (multiUser || customerScreen)) {
    scopeLevel = 'C'
    reasons.push(`강한 문제 영역 ${strongAreas.length}개가 서로 연결돼 있고 ${multiUser ? '다수 직원이 사용' : '고객/거래처 접점 화면이 필요'}하다`)
  } else if (strongAreas.length <= 2 && !connectionNeed) {
    scopeLevel = 'A'
    reasons.push('반복업무가 한두 구간에 한정돼 있어 그 구간만 자동화해도 효과가 난다')
  } else {
    scopeLevel = 'B'
    reasons.push(`강한 문제 영역 ${strongAreas.length}개 — 가장 자주 끊기는 구간부터 부분 AX 로 시작할 수 있다`)
  }
  if (scopeLevel !== 'D' && owner === 'none') reasons.push('단, 내부 담당자가 없어 정착 계획을 먼저 세워야 한다')
  if (customerScreen && (company.tradeType === 'b2b' || company.tradeType === 'both')) reasons.push('거래처 접점(주문·견적·재구매)이 있어 고객포털 결합 가능성이 있다')

  const validationPotential: Level = owner === 'dedicated' ? 'high' : owner === 'partTime' ? 'medium' : owner === 'ceo' ? (company.headcount === '1-5' ? 'medium' : 'low') : owner === 'none' ? 'low' : 'medium'

  const fundingScore = (g('growth_plan') ?? 0) + (dataPotential ? 2 : 0) + ((g('funding_interest') ?? 0) >= 1 ? 1 : 0) + (funding === 'past' ? 1 : 0)
  const fundingReadiness: Level = fundingScore >= 5 ? 'high' : fundingScore >= 3 ? 'medium' : 'low'

  /* 3) 가치 발생 가능 영역 — LOW/MEDIUM/HIGH */
  const dataAns = answerOf(meeting, 'data_potential')
  const valuePotential: Record<ValueArea, Level> = {
    time_saving: levelOf(Math.max(g('repetitive_work') ?? -1, g('info_scatter') ?? -1) < 0 ? null : Math.max(g('repetitive_work') ?? 0, g('info_scatter') ?? 0)),
    hiring_avoidance: levelOf(g('hiring_burden')),
    revenue_leak: levelOf(Math.max(g('repurchase') ?? -1, g('quote_order') ?? -1) < 0 ? null : Math.max(g('repurchase') ?? 0, g('quote_order') ?? 0)),
    throughput: levelOf(Math.max(g('repetitive_work') ?? -1, g('quote_order') ?? -1) < 0 ? null : Math.max(g('repetitive_work') ?? 0, g('quote_order') ?? 0)),
    ceo_time: levelOf(g('ceo_dependency')),
    asset_building: dataAns === 'none' && (g('repetitive_work') ?? 0) >= 1 ? 'high' : dataAns === 'scattered' ? 'medium' : dataAns === 'usable' ? 'low' : 'medium',
    external_funding: fundingReadiness,
  }

  /* 4) 사실 / 추정 / 미확인 */
  const confirmedFacts: Fact[] = []
  const assumptions: Fact[] = []
  const unknowns: Fact[] = []
  confirmedFacts.push({ key: 'industry', label: '업종', value: INDUSTRY_LABEL[company.industry] + (company.industryNote ? ` (${company.industryNote})` : ''), status: 'confirmed', source: 'consultant' })
  ;(company.headcount === 'unknown' ? unknowns : confirmedFacts).push({ key: 'headcount', label: '인원', value: HEADCOUNT_LABEL[company.headcount], status: company.headcount === 'unknown' ? 'unknown' : 'confirmed', source: 'consultant' })
  ;(company.tradeType === 'unknown' ? unknowns : confirmedFacts).push({ key: 'tradeType', label: '거래형태', value: TRADE_LABEL[company.tradeType], status: company.tradeType === 'unknown' ? 'unknown' : 'confirmed', source: 'consultant' })
  for (const qid of meeting.questionIds) {
    const q = QUESTION_BY_ID[qid]
    if (!q) continue
    const a = meeting.answers[qid]
    if (!a || a.value === 'unknown') {
      unknowns.push({ key: qid, label: AREA_LABEL[q.area], value: meeting.skippedQuestionIds.includes(qid) ? '건너뜀' : '잘 모르겠음', status: 'unknown', source: 'consultant' })
      continue
    }
    const fact: Fact = { key: qid, label: AREA_LABEL[q.area], value: optionLabel(q, a.value), status: a.source === 'consultant' ? 'confirmed' : 'assumed', source: a.source === 'consultant' ? 'consultant' : 'diagnosis' }
    ;(fact.status === 'confirmed' ? confirmedFacts : assumptions).push(fact)
  }
  if (meeting.keyQuote.trim()) confirmedFacts.push({ key: 'keyQuote', label: '대표 핵심발언', value: meeting.keyQuote.trim(), status: 'confirmed', source: 'ceo_quote' })
  // 업종 가정 — 답이 없는 영역에만 AI/업종 추론을 표시한다 (사실처럼 저장하지 않는다)
  if (!sig.quote_order.answered && (company.industry === 'manufacturing' || company.industry === 'distribution')) {
    assumptions.push({ key: 'ind_quote', label: '견적/주문 (업종 가정)', value: '전화·카톡 접수 비중이 높은 업종', status: 'assumed', source: 'industry_assumption' })
  }
  if (!sig.customer_mgmt.answered && (company.industry === 'service' || company.industry === 'medical' || company.industry === 'food')) {
    assumptions.push({ key: 'ind_customer', label: '고객관리 (업종 가정)', value: '예약·재방문 관리가 매출에 직결되는 업종', status: 'assumed', source: 'industry_assumption' })
  }

  /* 5) 추가 확인 — 최대 3개 */
  const followups: string[] = []
  const pushF = (s: string) => {
    if (followups.length < 3 && !followups.includes(s)) followups.push(s)
  }
  if (company.headcount === 'unknown') pushF('직원수 (정규직 기준, 대략)')
  if (!answerOf(meeting, 'customer_mgmt') || !answerOf(meeting, 'quote_order')) pushF('거래처 수와 월 주문·건 수 (대략)')
  if (answerOf(meeting, 'hiring_burden') === 'yes' || !answerOf(meeting, 'hiring_burden')) pushF('향후 12개월 추가채용 계획 (인원)')
  if (!answerOf(meeting, 'internal_owner')) pushF('함께 쓸 내부 담당자 지정 가능 여부')
  if (!answerOf(meeting, 'current_system')) pushF('현재 사용 중인 프로그램 이름 (ERP/POS/회계)')
  if (!answerOf(meeting, 'data_potential')) pushF('현재 기록이 남는 곳 (엑셀 / ERP / 수기)')
  pushF('직원수 (정규직 기준, 대략)')
  pushF('거래처 수 (대략)')
  pushF('향후 12개월 추가채용 계획 (인원)')

  /* 6) 다음 미팅 강조 */
  const nextMeetingFocus: string[] = []
  for (const p of painPoints.slice(0, 2)) nextMeetingFocus.push(`${p.clientSafeTitle} → ${p.axStructure}`)
  if (scopeLevel === 'A') nextMeetingFocus.push('작게 시작하는 한 구간 자동화 범위와 기대 효과')
  if (scopeLevel === 'B') nextMeetingFocus.push('가장 자주 끊기는 구간부터 시작하는 부분 AX 범위')
  if (scopeLevel === 'C') nextMeetingFocus.push('업무·데이터·고객접점을 연결하는 Full AX 구조와 3년 Value Map')
  if (scopeLevel === 'D') nextMeetingFocus.push('지금은 구축보다 현재 도구 정리와 담당자 지정 — 다음 시점 재검토')
  if ((g('funding_interest') ?? 0) >= 1) nextMeetingFocus.push('성장자금은 별도로 — 실제 변화와 증거가 먼저라는 순서 설명')

  /* 7) 절대 하면 안 될 표현 */
  const forbiddenReminders = ['"정책자금 나오면 개발비 주시면 됩니다"', '"후불 가능합니다"', '"AX 하면 정책자금 받을 수 있습니다"', '"비슷한 회사가 5억 받았으니 대표님도 가능합니다"']
  if ((g('funding_interest') ?? 0) >= 2) forbiddenReminders.push('자금 관심이 높은 대표입니다 — 자금을 AX 의 이유로 만들지 마세요')

  /* 8) 오늘의 AX 포인트 — 딱 하나 */
  const unknownCount = unknowns.length
  const topArea = painPoints[0]?.area
  const point =
    (unknownCount >= 4 ? TODAYS_POINTS.find((p) => p.id === 'unknown_ok') : undefined) ??
    (topArea ? TODAYS_POINTS.find((p) => p.areas.includes(topArea)) : undefined) ??
    (answerOf(meeting, 'current_system') === 'partial' ? TODAYS_POINTS.find((p) => p.id === 'erp_outside') : undefined) ??
    TODAYS_POINTS[0]

  /* 9) 유사사례 */
  const rec = recommendCases(cases, company, painPoints.map((p) => p.area), { growthAnswer: growth, fundingInterest: (g('funding_interest') ?? 0) >= 1, areaLabel: (a) => AREA_LABEL[a] })
  // 컨설턴트가 미팅에 쓰기로 고른 사례(pinned)를 먼저, 그다음 추천 ①②
  const similarCaseIds = Array.from(new Set([...(company.pinnedCaseIds ?? []).filter((id) => cases.some((c) => c.id === id)), rec.primary?.caseStudy.id, rec.secondary?.caseStudy.id].filter((x): x is string => Boolean(x)))).slice(0, 3)

  /* 10) CLIENT SAFE 요약 */
  const clientSafeSummary = [
    ...painPoints.map((p) => `${p.clientSafeTitle}입니다. 이 구간을 연결하면 ${p.loss.split(',')[0]} 문제를 줄일 수 있습니다.`),
    scopeLevel === 'D' ? '지금은 새 시스템보다 현재 도구와 담당자 정리를 먼저 권합니다.' : `회사에 맞는 구축범위(${SCOPE_LABEL[scopeLevel]})와 정확한 견적은 2차 미팅에서 제안드립니다.`,
  ]

  return {
    version: (meeting.analysis?.version ?? 0) + 1,
    generatedAt: nowIso(),
    painPoints,
    axNeed,
    scopeLevel,
    scopeLabel: SCOPE_LABEL[scopeLevel],
    scopeReason: reasons.join('. ') + '.',
    validationPotential,
    fundingReadiness,
    valuePotential,
    similarCaseIds,
    confirmedFacts,
    assumptions,
    unknowns,
    followupQuestions: followups,
    nextMeetingFocus,
    forbiddenReminders,
    todaysPoint: point?.text ?? '',
    clientSafeSummary,
    recommendedStructure: painPoints.map((p) => ({ problem: p.clientSafeTitle, loss: p.loss, structure: p.axStructure })),
  }
}
