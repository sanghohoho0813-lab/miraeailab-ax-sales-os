/**
 * Strategy Autopilot — 회사 기본정보 + 프로필(PDF·음성) + 사전진단 + 371 사례로 "오늘의 접근" 을 한 번에 만든다.
 *
 * 규칙
 *   - 결정적(pure). 유료 AI 없이도 전부 동작한다. AI는 문장 고도화 어댑터로만 붙는다(lib/ai).
 *   - 문서 사실 → 가설(🟡) → 질문 으로 연결한다. 문서만 보고 AX 필요성을 확정하지 않는다.
 *   - 모든 판단에 근거(sources)를 붙인다 — "왜 이렇게 판단했나요?" 에서 그대로 보여 준다.
 *   - 문장은 짧게: 상황별 핵심 답변 1~2문장 + 다음 질문 1개.
 */
import type { CaseStudy, Company, CompanyProfile, EvidenceStatus, Question, QuestionArea, ScopeLevel } from '../types/domain'
import { AREA_LABEL, HEADCOUNT_LABEL, INDUSTRY_LABEL, INTEREST_LABEL, SCOPE_LABEL, TRADE_LABEL } from '../content/labels'
import { FORBIDDEN } from '../content/forbidden'
import { FUNDING_GUIDE } from '../content/pricing'
import { AREA_COPY } from './analysis'
import { buildBriefing, type Briefing } from './briefing'
import { recommendCases, shownCases, type CaseMatch } from './caseMatcher'
import { diagnosisHighlights } from './diagnosis'
import { planQuestions, type QuestionPlan } from './questionSelector'
import { activeEvidence, coreSummaryLine, evidenceLine } from './profile'
import { joinWithWa } from '../content/korean'
import { sha256Hex, stableStringify } from '../lib/hash'

export interface Hypothesis {
  id: string
  /** "성장에 따라 관리업무 부담이 늘고 있을 가능성" */
  text: string
  /** 근거 — "매출 2025년 +18% (PDF 3p)" */
  basis: string
  status: 'assumed'
  /** 확인할 질문 */
  question: string
  area: QuestionArea
}

export interface StrategyScript {
  key: 'opening' | 'price' | 'case' | 'funding' | 'closing'
  title: string
  say: string
  next: string
}

export interface StrategySource {
  label: string
  value: string
  status: EvidenceStatus
  /** "PDF 8p" / "사업내용 기반 추정" / "아직 미확인" */
  where: string
}

/** 사례 카드 — 추천 이유(kind/kindLabel)는 matcher 가 붙인다 */
export type StrategyCase = CaseMatch

export interface Strategy {
  version: 1
  generatedAt: string
  /** 오늘의 한 문단 접근법 */
  approach: string
  /** 오늘 가장 먼저 건드릴 문제 TOP 3 */
  focus: { area: QuestionArea; title: string; why: string; status: EvidenceStatus }[]
  /** 오늘 반드시 확인할 질문 5~8 */
  questions: Question[]
  prefilled: QuestionPlan['prefilled']
  /** 미팅에 저장할 전체 질문 id (ask + prefilled) */
  questionIds: string[]
  axDirection: string
  scope: { level: ScopeLevel; label: string; reason: string; status: 'assumed' }
  cases: StrategyCase[]
  /** 동종업계 사례가 없어 참고 사례를 보여 줄 때의 안내 (없으면 빈 문자열) */
  caseNotice: string
  scripts: StrategyScript[]
  /** 절대 먼저 하지 말아야 할 말 */
  forbidden: string[]
  /** 2차 제안에 필요한 추가정보 (최대 3) */
  missingInfo: string[]
  hypotheses: Hypothesis[]
  confidence: { level: 'high' | 'medium' | 'low'; label: string; pdf: boolean; diagnosis: boolean; unknownCore: number; facts: number }
  sources: StrategySource[]
  briefing: Briefing
}

export interface StrategyInput {
  company: Company
  profile: CompanyProfile | null
  cases: CaseStudy[]
  now?: string
}

const OPENING: Record<string, string> = {
  manufacturing: '대표님, 오늘 당장 뭘 구축하자는 얘기보다 지금 회사에서 견적이나 작업 진행을 사람이 반복해서 확인하고 있는 일이 어디인지 몇 가지만 먼저 보고 싶습니다.',
  distribution: '대표님, 오늘은 시스템 얘기보다 주문이 들어와서 출고·정산까지 가는 동안 사람이 다시 확인하는 구간이 어디인지만 먼저 보고 싶습니다.',
  construction: '대표님, 오늘은 현장에서 있었던 일이 청구와 보고까지 어떻게 넘어가는지, 그 사이에서 사람이 옮겨 적는 일이 어디인지만 먼저 보고 싶습니다.',
  service: '대표님, 오늘은 예약이나 문의가 들어와서 재방문으로 이어지기까지 누가 무엇을 기억하고 있는지만 먼저 보고 싶습니다.',
  food: '대표님, 오늘은 POS 밖에서 준비량이나 단체 문의를 어떻게 정하고 계신지, 그 부분만 먼저 여쭤보고 싶습니다.',
  logistics: '대표님, 오늘은 주문·배차·정산 사이에서 확인 전화가 몇 번이나 오가는지, 그 구간만 먼저 보고 싶습니다.',
  medical: '원장님, 오늘은 예약과 재방문 관리가 누구 기억에 있는지, 그 부분만 먼저 여쭤보고 싶습니다.',
  environment: '대표님, 오늘은 현장 작업이 청구서까지 가는 동안 몇 번을 옮겨 적는지, 그 구간만 먼저 보고 싶습니다.',
  other: '대표님, 오늘 당장 뭘 구축하자는 얘기보다 지금 회사에서 사람이 반복해서 확인하고 있는 일이 어디인지 몇 가지만 먼저 보고 싶습니다.',
}

function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

/** 문서·사전진단 사실 → 가설(🟡) → 질문 */
export function buildHypotheses(company: Company, profile: CompanyProfile | null): Hypothesis[] {
  const out: Hypothesis[] = []
  const f = profile?.facts
  const active = new Set(activeEvidence(profile).map((e) => e.key))
  const page = (key: string) => {
    const e = activeEvidence(profile).find((x) => x.key === key)
    return e?.sourcePage ? ` (PDF ${e.sourcePage}p)` : e ? ` (${e.source === 'voice' ? '음성' : 'PDF'})` : ''
  }
  if (f?.growth.revenueTrend === 'up' && (f.growth.revenueGrowthPct ?? 0) >= 10 && active.has('revenueTrend')) {
    out.push({ id: 'growth_load', text: '성장에 따라 관리업무 부담이 함께 늘고 있을 가능성', basis: `매출 ${f.growth.latestYear}년 +${f.growth.revenueGrowthPct}%${page('revenueTrend')}`, status: 'assumed', question: '매출이 늘면서 관리 인력이나 확인 업무도 같이 늘고 있나요?', area: 'hiring_burden' })
  }
  if (f?.growth.revenueTrend === 'down' && active.has('revenueTrend')) {
    out.push({ id: 'growth_down', text: '매출이 줄어 신규 투자보다 새는 곳(재구매·누락)을 먼저 막고 싶을 가능성', basis: `매출 ${f.growth.latestYear}년 ${f.growth.revenueGrowthPct}%${page('revenueTrend')}`, status: 'assumed', question: '기존 거래처의 재주문이 예전보다 줄었다고 느끼시나요?', area: 'repurchase' })
  }
  if (f?.headcount !== null && f?.headcount !== undefined && f.headcount >= 8 && active.has('headcount') && (company.industry === 'manufacturing' || company.industry === 'distribution' || company.industry === 'logistics')) {
    out.push({ id: 'ceo_check', text: `직원 ${f.headcount}명 규모에서 대표 확인 없이 돌아가는 구간이 적을 가능성`, basis: `직원수 ${f.headcount}명${page('headcount')}`, status: 'assumed', question: '대표님 확인 없이는 못 나가는 일이 하루에 몇 건쯤 되나요?', area: 'ceo_dependency' })
  }
  // 기업인증(연구소·벤처·이노비즈)은 2차 제안·정책자금 쪽 정보다. 1차 미팅 공략 포인트로 쓰지 않는다.
  if ((f?.tradeType === 'b2b' || f?.tradeType === 'both' || company.tradeType === 'b2b' || company.tradeType === 'both') && (f?.products.length ?? 0) >= 2) {
    out.push({ id: 'quote_manual', text: '제품이 여러 가지라 견적·주문이 사람 손을 타는 구간이 있을 가능성', basis: `주요 제품 ${f!.products.slice(0, 3).join(', ')}${page('products')}`, status: 'assumed', question: '견적 요청이 오면 누가, 어디에서, 어떻게 계산하나요?', area: 'quote_order' })
  }
  if (f?.yearsInBusiness !== null && f?.yearsInBusiness !== undefined && f.yearsInBusiness >= 10 && f.growth.revenueTrend !== 'up' && (active.has('yearsInBusiness') || active.has('foundedAt'))) {
    out.push({ id: 'legacy_tools', text: '업력이 길어 기존 방식(엑셀·수기)이 굳어 있을 가능성 — 도구 정리부터 확인', basis: `업력 ${f.yearsInBusiness}년${page('yearsInBusiness') || page('foundedAt')}`, status: 'assumed', question: '지금 쓰는 프로그램 밖에서 엑셀이나 카톡으로 다시 관리하는 일이 있나요?', area: 'current_system' })
  }
  if (f?.notes.some((n) => /전화|팩스|카톡/.test(n))) {
    out.push({ id: 'order_channel', text: '주문·발주가 전화·팩스로 들어와 입력·누락 손실이 있을 가능성', basis: `기업자료 비고: "${f.notes.find((n) => /전화|팩스|카톡/.test(n))?.slice(0, 40)}"`, status: 'assumed', question: '주문이 전화로 오면 그다음에 누가 어디에 정리하나요?', area: 'quote_order' })
  }
  for (const h of diagnosisHighlights(company.diagnosis, 2)) {
    const area: QuestionArea = h.key === 'askProgress' || h.key === 'ceoLoadGrows' ? 'ceo_dependency' : h.key === 'repeatInput' ? 'repetitive_work' : h.key === 'toolGaps' || h.key === 'priorityByMemory' ? 'info_scatter' : h.key === 'manualHandoff' ? 'customer_mgmt' : h.key === 'dataUnused' ? 'data_potential' : h.key === 'uniqueWork' ? 'current_system' : 'repetitive_work'
    if (out.some((x) => x.area === area)) continue
    out.push({ id: `diag_${h.key}`, text: `사전진단에서 "${h.label}" 항목을 ${h.degree} 로 체크했습니다 — 실제 장면을 확인할 가치가 있습니다`, basis: '홈페이지 3분 AX Fit', status: 'assumed', question: `"${h.label}" 이라고 체크하셨는데, 실제로 어떤 장면에서 그런가요?`, area })
  }
  return out.slice(0, 4)
}

function scopeHypothesis(company: Company, profile: CompanyProfile | null, hyps: Hypothesis[]): Strategy['scope'] {
  const g = company.diagnosis?.grade
  let level: ScopeLevel
  let reason: string
  if (g === 'NO_GO') {
    level = 'D'
    reason = '사전진단이 "지금은 정비 먼저" — 구축보다 현재 도구 정리와 담당자 지정을 먼저 이야기한다'
  } else if (company.headcount === '1-5') {
    level = 'A'
    reason = '소규모(1~5명) — 반복 구간 하나를 자동화해도 체감이 크다. 미팅에서 연결 필요성이 보이면 B 로 올린다'
  } else if (g === 'HIGH' || (hyps.length >= 3 && (company.tradeType === 'b2b' || company.tradeType === 'both'))) {
    level = 'C'
    reason = g === 'HIGH' ? '사전진단 "최우선 검토" — 업무·데이터·거래처 접점이 함께 걸려 있을 가능성' : '문서에서 읽힌 가설이 여러 영역에 걸쳐 있고 거래처 접점이 있다'
  } else if (g === 'FULL' || g === 'LITE' || hyps.length >= 1) {
    level = 'B'
    reason = '가장 자주 끊기는 구간부터 부분 AX로 시작할 수 있다'
  } else {
    level = 'B'
    reason = '정보가 적어 부분 AX를 기본 가설로 둔다 — 미팅 답변으로 A/C 를 가른다'
  }
  const pf = profile?.facts
  if (pf?.growth.revenueTrend === 'up' && level === 'B') reason += '. 매출이 늘고 있어 확장 가능한 구조를 염두에 둔다'
  return { level, label: SCOPE_LABEL[level], reason, status: 'assumed' }
}

function buildSources(company: Company, profile: CompanyProfile | null, focus: Strategy['focus']): StrategySource[] {
  const src = company.fieldSources ?? {}
  const whereOf = (key: keyof NonNullable<Company['fieldSources']>, evidenceKey?: string): string => {
    const e = evidenceKey ? activeEvidence(profile).find((x) => x.key === evidenceKey) : undefined
    if (e) return e.source === 'pdf' ? `PDF${e.sourcePage ? ` ${e.sourcePage}p` : ''}` : e.source === 'voice' ? '음성 입력' : '직접 입력'
    const s = src[key]
    return s === 'pdf' ? 'PDF' : s === 'voice' ? '음성 입력' : s === 'website_diagnosis' ? '홈페이지 사전진단' : s === 'master_edit' ? '마스터 수정' : '직접 입력'
  }
  const out: StrategySource[] = []
  out.push({ label: '업종', value: INDUSTRY_LABEL[company.industry] + (company.industryNote ? ` (${company.industryNote})` : ''), status: 'confirmed', where: whereOf('industry', 'industry') })
  out.push(company.headcount === 'unknown' ? { label: '인원', value: '잘 모르겠음', status: 'unknown', where: '아직 미확인' } : { label: '인원', value: HEADCOUNT_LABEL[company.headcount], status: 'confirmed', where: whereOf('headcount', 'headcount') })
  out.push(company.tradeType === 'unknown' ? { label: '거래형태', value: '잘 모르겠음', status: 'unknown', where: '아직 미확인' } : { label: '거래형태', value: TRADE_LABEL[company.tradeType], status: activeEvidence(profile).find((x) => x.key === 'tradeType')?.status === 'assumed' && src.tradeType === 'pdf' ? 'assumed' : 'confirmed', where: src.tradeType === 'pdf' ? '사업내용 기반 추정' : whereOf('tradeType') })
  out.push({ label: '관심사', value: company.interests.map((i) => INTEREST_LABEL[i]).join(' · ') || '미확인', status: company.interests.length && !company.interests.includes('unknown') ? 'confirmed' : 'unknown', where: company.interests.length && !company.interests.includes('unknown') ? whereOf('interests') : '아직 미확인' })
  for (const e of activeEvidence(profile)) {
    if (['companyName', 'phone', 'address', 'industryCode', 'industry', 'headcount', 'tradeType'].includes(e.key)) continue
    if (e.key.startsWith('fin_') && !e.key.startsWith('fin_revenue_')) continue
    out.push({ label: e.label, value: e.display, status: e.status, where: evidenceLine(e).split(' — ')[1] ?? '' })
  }
  if (company.diagnosis) out.push({ label: '사전진단', value: `AX Fit ${company.diagnosis.grade ?? '등급 미확인'}`, status: 'assumed', where: '홈페이지 3분 AX Fit' })
  for (const fpt of focus) if (fpt.status === 'unknown') out.push({ label: fpt.title, value: '미팅에서 확인', status: 'unknown', where: '아직 미확인' })
  return out
}

export function buildStrategy(input: StrategyInput): Strategy {
  const { company, profile, cases } = input
  const generatedAt = input.now ?? new Date().toISOString()
  const hypotheses = buildHypotheses(company, profile)
  const briefing = buildBriefing(company, { profile })
  const diagAreas = new Set(hypotheses.filter((h) => h.id.startsWith('diag_')).map((h) => h.area))
  const docAreas = hypotheses.filter((h) => !h.id.startsWith('diag_')).map((h) => h.area)

  // TOP 3 — 업종 체인 앞 2개는 유지하고, 문서 가설 영역이 있으면 3번째 자리에 올린다. 미팅 전이므로 확인된 문제는 없다: 사전진단·문서 근거가 있으면 🟡, 아니면 ⚪
  const order = uniq([...briefing.chainAreas.slice(0, 2), ...docAreas, ...briefing.chainAreas]).slice(0, 3)
  const focus: Strategy['focus'] = order.map((area) => {
    const idx = briefing.chainAreas.indexOf(area)
    const hyp = hypotheses.find((h) => h.area === area)
    return {
      area,
      title: idx >= 0 ? briefing.chain[idx] : AREA_LABEL[area],
      why: hyp ? `${hyp.text} — ${hyp.basis}` : AREA_COPY[area].loss,
      status: hyp || diagAreas.has(area) ? 'assumed' : 'unknown',
    }
  })

  // 질문 5~8 — 공략 영역·가설 영역 질문을 앞으로
  const plan = planQuestions(company)
  const priorityAreas = uniq([...focus.map((f) => f.area), ...hypotheses.map((h) => h.area)])
  const rank = (q: Question) => {
    const i = priorityAreas.indexOf(q.area)
    return i < 0 ? 99 : i
  }
  const questions = [...plan.ask].sort((a, b) => rank(a) - rank(b) || a.priority - b.priority).slice(0, 8)

  // 범위 가설 · AX 방향
  const scope = scopeHypothesis(company, profile, hypotheses)
  const axDirection = focus.length ? `${AREA_COPY[focus[0].area].structure}${focus[1] ? ` → ${AREA_COPY[focus[1].area].structure}` : ''}` : AREA_COPY.ceo_dependency.structure

  // 사례 3 — ① 업종 ② 문제구조 ③ 전환경로
  const fundingInterest = company.interests.some((i) => i === 'policy_fund' || i === 'gov_support' || i === 'rnd' || i === 'venture')
  const customerTouchpoint = (company.tradeType === 'b2b' || company.tradeType === 'both') && focus.some((f) => f.area === 'quote_order' || f.area === 'customer_mgmt' || f.area === 'repurchase')
  const rec = recommendCases(cases, company, focus.map((f) => f.area), {
    limit: 2,
    areaLabel: (a) => AREA_LABEL[a],
    fundingInterest,
    customerTouchpoint,
    profile: profile ? { subIndustry: profile.facts.subIndustry, keywords: profile.facts.products, revenueTrend: profile.facts.growth.revenueTrend, yearsInBusiness: profile.facts.yearsInBusiness, certifications: profile.facts.certifications } : undefined,
  })
  // 동종업계 안에서만 고른다. 없으면 억지로 채우지 않고 참고 사례 1개 + 안내를 보여 준다
  const picked: StrategyCase[] = shownCases(rec)
  const caseNotice = rec.picks.length === 0 && rec.fallback ? '동종업계 사례가 없어 업무구조가 비슷한 사례를 참고로 보여드립니다.' : ''

  // 멘트 — 상황별 1~2문장 + 다음 질문 1개
  const primaryCase = picked[0]?.caseStudy
  const scripts: StrategyScript[] = [
    { key: 'opening', title: 'OPENING', say: OPENING[company.industry] ?? OPENING.other, next: questions[0]?.say ?? '대표님이 자리를 비우시면 멈추는 일이 있나요?' },
    { key: 'price', title: 'PRICE — "얼마예요?"', say: '단순 자동화로 충분하면 수백만 원 수준에서도 끝날 수 있습니다. 전체 업무와 고객 접점까지 연결해야 하면 범위가 달라지기 때문에, 오늘 내용을 가지고 정확히 다시 설계해 드립니다.', next: '지금 가장 자주 끊기는 구간 하나만 꼽으면 어디인가요?' },
    {
      key: 'case',
      title: 'CASE — 사례를 꺼낼 때',
      say: primaryCase ? `${primaryCase.industry === company.industry ? '같은 업종' : '비슷한 문제 구조'}에서 ${primaryCase.problem ? primaryCase.problem.split(/[.。]/)[0].slice(0, 40) : '이런 업무'} 를 데이터화한 실제 사례가 있습니다. 회사와 다른 점도 함께 말씀드리겠습니다.` : '같은 업종에서 이런 업무를 데이터화한 실제 사례가 있습니다.',
      next: '대표님 회사에서는 이 장면이 어디에서 제일 자주 생기나요?',
    },
  ]
  if (fundingInterest) scripts.push({ key: 'funding', title: 'FUNDING — 자금 이야기가 나오면', say: FUNDING_GUIDE.script, next: '자금보다 먼저, 지금 회사에서 기록이 남지 않는 업무가 어디인가요?' })
  scripts.push({ key: 'closing', title: 'CLOSING', say: '오늘 말씀해 주신 내용을 정리해서 회사에 맞는 구축 범위와 순서를 2차 제안으로 다시 가져오겠습니다.', next: '2차 제안 때 함께 보실 내부 담당자를 한 분 정해 주실 수 있을까요?' })

  // 절대 먼저 하지 말아야 할 말
  const forbidden = FORBIDDEN.slice(0, 4).map((f) => `"${f.phrase}"`)
  if (fundingInterest) forbidden.push('자금을 AX의 이유로 만들지 마세요 — 자금은 결과입니다')
  if (profile?.facts.financials.length) forbidden.push('"자료 보니 매출이 …" — 대표가 먼저 말하기 전에 재무 숫자를 꺼내지 마세요')
  if (profile?.facts.growth.revenueTrend === 'up') forbidden.push('"매출이 늘어서 업무가 엉망이시죠" — 단정하지 말고 질문으로 확인하세요')

  // 2차 제안에 필요한 추가정보 ≤ 3
  const missing: string[] = []
  const push = (s: string) => {
    if (missing.length < 3 && !missing.includes(s)) missing.push(s)
  }
  if (company.headcount === 'unknown') push('직원수 (정규직 기준, 대략)')
  if (company.tradeType === 'unknown') push('거래형태 (B2B / B2C) 와 거래처 수')
  if (!company.diagnosis) push('현재 사용 중인 프로그램 이름 (ERP / POS / 회계)')
  push('함께 쓸 내부 담당자 지정 가능 여부')
  push('거래처 수와 월 주문·건 수 (대략)')
  push('향후 12개월 추가채용 계획 (인원)')

  // 정보 충분도 — 고객 앞에서는 점수화하지 않는다 (내부 표시)
  const unknownCore = [company.headcount === 'unknown', company.tradeType === 'unknown', company.interests.length === 0 || company.interests.includes('unknown'), company.industry === 'other' && !company.industryNote].filter(Boolean).length
  const facts = activeEvidence(profile).filter((e) => e.status === 'confirmed').length + (3 - Math.min(3, unknownCore))
  const pdf = profile?.sourceType === 'pdf'
  const level: Strategy['confidence']['level'] = pdf && unknownCore <= 1 ? 'high' : company.diagnosis || unknownCore <= 1 || (profile && unknownCore <= 2) ? 'medium' : 'low'
  const confidence = { level, label: level === 'high' ? '높음' : level === 'medium' ? '보통' : '낮음', pdf: Boolean(pdf), diagnosis: Boolean(company.diagnosis), unknownCore, facts }

  // 한 문단 접근법 — 2문장, 150자 안팎. 근거 숫자는 [왜 이렇게 판단했나요?] 안으로 보낸다
  const lead = hypotheses[0]
  const first = `오늘은 AI 자체를 설명하기보다 ${joinWithWa(focus.slice(0, 2).map((f) => f.title))}부터 확인하세요.`
  const second = lead ? `"${lead.question}" 처럼 실제 장면을 물어보는 것이 첫 번째 목표입니다.` : '실제로 불편한 지점을 찾는 것이 첫 번째 목표입니다.'
  const approach = `${first} ${second}`

  return {
    version: 1,
    generatedAt,
    approach,
    focus,
    questions,
    prefilled: plan.prefilled,
    questionIds: plan.all.map((q) => q.id),
    axDirection,
    scope,
    cases: picked,
    caseNotice,
    scripts,
    forbidden,
    missingInfo: missing,
    hypotheses,
    confidence,
    sources: buildSources(company, profile, focus),
    briefing,
  }
}

/** 같은 입력이면 같은 해시 — AI 보강 결과 재사용·"전략 다시 생성" 표시에 쓴다 */
export async function strategyHash(company: Company, profile: CompanyProfile | null, caseIds: string[]): Promise<string> {
  const core = {
    name: company.name,
    industry: company.industry,
    industryNote: company.industryNote,
    headcount: company.headcount,
    tradeType: company.tradeType,
    interests: [...company.interests].sort(),
    diagnosis: company.diagnosis ? { grade: company.diagnosis.grade, answers: company.diagnosis.answers } : null,
    profile: profile ? { facts: profile.facts, evidence: activeEvidence(profile).map((e) => [e.key, e.value, e.status]) } : null,
    caseIds: [...caseIds].sort(),
  }
  return sha256Hex(stableStringify(core))
}

/**
 * 전략 화면 배지용 한 줄 — 업종 · 근로자 · 최근 매출 · 업력.
 * 기업인증(이노비즈·벤처 등)은 여기에 넣지 않는다. 1차 미팅에서 먼저 꺼낼 정보가 아니다.
 */
export function profileSummary(company: Parameters<typeof coreSummaryLine>[0], profile: CompanyProfile | null): string {
  return coreSummaryLine(company, profile)
}
