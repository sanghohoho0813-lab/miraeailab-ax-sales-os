import { describe, expect, it } from 'vitest'
import { analyzeMeeting } from './analysis'
import { selectQuestions } from './questionSelector'
import { buildBriefing } from './briefing'
import { prefillFromDiagnosis } from './diagnosis'
import { recommendCases } from './caseMatcher'
import { buildHandoffPayload, buildCustomerSafeEventPayload } from './handoffBuilder'
import { guardText } from '../content/forbidden'
import { CASE_SEED } from '../content/cases'
import { QUESTION_BY_ID } from '../content/questions'
import { AREA_LABEL } from '../content/labels'
import type { Company, CurrentUser, Meeting } from '../types/domain'

const T = '2026-09-22T01:00:00.000Z'
const user: CurrentUser = { id: 'u1', email: 'p@example.com', name: '곽주환', role: 'partner' }

function company(over: Partial<Company> = {}): Company {
  return {
    id: 'c1',
    consultantId: 'u1',
    name: 'ABC산업',
    industry: 'manufacturing',
    industryNote: '',
    headcount: '11-20',
    tradeType: 'b2b',
    interests: ['efficiency'],
    representativeName: '',
    phone: '',
    meetingAt: null,
    diagnosis: null,
    memo: '',
    archivedAt: null,
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

function meeting(c: Company, values: Record<string, string>, over: Partial<Meeting> = {}): Meeting {
  const qs = selectQuestions(c)
  const answers: Meeting['answers'] = {}
  for (const q of qs) if (values[q.id]) answers[q.id] = { questionId: q.id, value: values[q.id], source: 'consultant', at: T }
  return {
    id: 'm1',
    companyId: c.id,
    consultantId: 'u1',
    status: 'analyzed',
    questionIds: qs.map((q) => q.id),
    answers,
    skippedQuestionIds: [],
    hardQuestionIds: [],
    keyQuote: '내가 하루만 빠져도 직원들이 계속 전화해요.',
    memo: '',
    analysis: null,
    handoffId: null,
    startedAt: T,
    endedAt: '2026-09-22T01:30:00.000Z',
    createdAt: T,
    updatedAt: T,
    ...over,
  }
}

describe('질문 선택', () => {
  it('5~10개를 고르고 핵심 5개를 항상 포함한다', () => {
    for (const ind of ['manufacturing', 'distribution', 'construction', 'service', 'food', 'logistics', 'medical', 'environment', 'other'] as const) {
      const qs = selectQuestions(company({ industry: ind, tradeType: 'both', interests: ['efficiency', 'sales', 'policy_fund'] }))
      expect(qs.length).toBeGreaterThanOrEqual(5)
      expect(qs.length).toBeLessThanOrEqual(10)
      for (const core of ['ceo_dependency', 'repetitive_work', 'info_scatter', 'current_system', 'internal_owner']) expect(qs.map((q) => q.id)).toContain(core)
      expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length)
    }
  })
  it('정책자금 질문은 대표가 관심을 보인 경우에만 넣는다', () => {
    expect(selectQuestions(company({ interests: ['efficiency'] })).map((q) => q.id)).not.toContain('funding_interest')
    expect(selectQuestions(company({ interests: ['policy_fund'] })).map((q) => q.id)).toContain('funding_interest')
  })
  it('B2C 업체에는 견적/주문(B2B) 질문을 넣지 않는다', () => {
    expect(selectQuestions(company({ industry: 'food', tradeType: 'b2c' })).map((q) => q.id)).not.toContain('quote_order')
  })
})

describe('사전진단 미리채움', () => {
  const diag = { leadId: 'l', grade: 'HIGH' as const, score: 80, answers: { askProgress: 'always', ceoLoadGrows: 'often', uniqueWork: 'often', internalOwner: 'partTime', dataUnused: 'no' }, submittedAt: T, matchedBy: 'matched' as const }
  it('정도형 질문은 평균 강도로 채운다', () => {
    const p = prefillFromDiagnosis(QUESTION_BY_ID.ceo_dependency, diag)
    expect(p?.value).toBe('very_high')
    expect(p?.note).toContain('사전진단')
  })
  it('현재 시스템은 고유업무 신호가 강할 때만 partial 로 채운다', () => {
    expect(prefillFromDiagnosis(QUESTION_BY_ID.current_system, diag)?.value).toBe('partial')
    expect(prefillFromDiagnosis(QUESTION_BY_ID.data_potential, diag)).toBeNull()
  })
  it('내부 담당자는 그대로 매핑한다', () => {
    expect(prefillFromDiagnosis(QUESTION_BY_ID.internal_owner, diag)?.value).toBe('partTime')
  })
})

describe('분석 엔진', () => {
  it('강한 신호가 많고 연결 필요·다수 사용이면 LEVEL C (Full AX)', () => {
    const c = company()
    const m = meeting(c, { ceo_dependency: 'very_high', repetitive_work: 'high', info_scatter: 'very_high', current_system: 'partial', customer_mgmt: 'memory', quote_order: 'phone_chat', hiring_burden: 'yes', growth_plan: 'aggressive', internal_owner: 'dedicated', data_potential: 'scattered', mfg_process: 'high' })
    const a = analyzeMeeting(c, m, CASE_SEED)
    expect(a.scopeLevel).toBe('C')
    expect(a.axNeed).toBe('high')
    expect(a.painPoints.length).toBe(3)
    expect(a.painPoints[0].area).toBe('ceo_dependency')
    expect(a.validationPotential).toBe('high')
    expect(a.followupQuestions.length).toBeLessThanOrEqual(3)
    expect(a.followupQuestions.length).toBeGreaterThan(0)
    expect(a.similarCaseIds.length).toBeGreaterThan(0)
    expect(a.similarCaseIds.length).toBeLessThanOrEqual(2)
    expect(a.confirmedFacts.some((f) => f.source === 'ceo_quote')).toBe(true)
    expect(a.recommendedStructure[0]).toHaveProperty('problem')
    expect(a.recommendedStructure[0]).toHaveProperty('loss')
    expect(a.recommendedStructure[0]).toHaveProperty('structure')
  })
  it('신호가 약하면 LEVEL D (지금은 비추천)', () => {
    const c = company({ headcount: '1-5' })
    const m = meeting(c, { ceo_dependency: 'low', repetitive_work: 'low', info_scatter: 'low', current_system: 'covered', internal_owner: 'none', growth_plan: 'steady' })
    const a = analyzeMeeting(c, m, CASE_SEED)
    expect(a.scopeLevel).toBe('D')
    expect(a.axNeed).toBe('low')
  })
  it('반복업무가 한 구간에 한정되면 LEVEL A (간단 자동화)', () => {
    const c = company({ headcount: '6-10', tradeType: 'b2c', industry: 'service', interests: ['efficiency'] })
    const m = meeting(c, { ceo_dependency: 'mid', repetitive_work: 'high', info_scatter: 'low', current_system: 'covered', customer_mgmt: 'system', internal_owner: 'partTime', growth_plan: 'steady', hiring_burden: 'no', svc_booking: 'low', med_followup: 'low' })
    const a = analyzeMeeting(c, m, CASE_SEED)
    expect(a.scopeLevel).toBe('A')
  })
  it('자금 관심은 AX 필요도와 분리되고 절대표현 알림에 반영된다', () => {
    const c = company({ interests: ['policy_fund'] })
    const m = meeting(c, { ceo_dependency: 'low', repetitive_work: 'low', info_scatter: 'low', funding_interest: 'high', growth_plan: 'aggressive', internal_owner: 'ceo' })
    const a = analyzeMeeting(c, m, CASE_SEED)
    expect(a.axNeed).toBe('low')
    expect(a.fundingReadiness).not.toBe('low')
    expect(a.forbiddenReminders.some((s) => s.includes('자금'))).toBe(true)
  })
  it('사전진단으로만 채운 답은 추정(assumed)으로, 잘 모르겠음은 미확인으로 분류한다', () => {
    const c = company()
    const m = meeting(c, { ceo_dependency: 'high', repetitive_work: 'unknown' })
    m.answers.info_scatter = { questionId: 'info_scatter', value: 'very_high', source: 'diagnosis', at: T }
    const a = analyzeMeeting(c, m, CASE_SEED)
    expect(a.assumptions.some((f) => f.key === 'info_scatter' && f.status === 'assumed')).toBe(true)
    expect(a.unknowns.some((f) => f.key === 'repetitive_work')).toBe(true)
    expect(a.confirmedFacts.some((f) => f.key === 'ceo_dependency')).toBe(true)
  })
  it('원본 답변을 바꾸지 않는다', () => {
    const c = company()
    const m = meeting(c, { ceo_dependency: 'high' })
    const before = JSON.stringify(m.answers)
    analyzeMeeting(c, m, CASE_SEED)
    expect(JSON.stringify(m.answers)).toBe(before)
  })
})

describe('유사사례 추천', () => {
  it('①은 같은/가까운 업종, ②는 다른 업종의 문제구조 사례', () => {
    const c = company({ industry: 'manufacturing' })
    const rec = recommendCases(CASE_SEED, c, ['quote_order', 'repurchase'], { areaLabel: (a) => AREA_LABEL[a] })
    expect(rec.primary?.caseStudy.industry).toBe('manufacturing')
    expect(rec.secondary?.caseStudy.industry).not.toBe('manufacturing')
    expect(rec.secondary?.whySimilar).toContain('문제 구조')
  })
  it('자금 관심이 없으면 AX 전환 서술이 없는 자금·선정 레퍼런스를 위로 올리지 않는다', () => {
    const c = company({ industry: 'construction' })
    const rec = recommendCases(CASE_SEED, c, ['info_scatter'], { areaLabel: (a) => AREA_LABEL[a], fundingInterest: false })
    expect(rec.primary).not.toBeNull()
    expect(rec.primary?.caseStudy.axTransition.length).toBeGreaterThan(0)
    expect(rec.primary?.caseStudy.reviewRequired).toBeFalsy()
    expect(rec.primary?.caseStudy.fundingForm?.startsWith('TIPS 선정')).toBeFalsy()
  })
  it('검수 필요(needs_review) 사례는 기본 추천에서 빠지고, 옵션을 켜면 포함된다', () => {
    const c = company({ industry: 'manufacturing' })
    const base = recommendCases(CASE_SEED, c, ['repetitive_work'], { areaLabel: (a) => AREA_LABEL[a] })
    expect([base.primary, base.secondary, ...base.others].every((m) => !m || m.caseStudy.verificationStatus === 'verified')).toBe(true)
    const all = recommendCases(CASE_SEED, c, ['repetitive_work'], { areaLabel: (a) => AREA_LABEL[a], includeReviewRequired: true })
    expect(all.others.length).toBeGreaterThan(base.others.length)
  })
  it('소규모 고객에게는 10억 미만 사례가 먼저 온다', () => {
    const c = company({ industry: 'food', headcount: '6-10' })
    const rec = recommendCases(CASE_SEED, c, ['customer_mgmt'], { areaLabel: (a) => AREA_LABEL[a] })
    expect(rec.primary?.caseStudy.fundingAmountDisclosed ?? 0).toBeLessThan(1_000_000_000)
    expect(rec.primary?.reasons).toContain('10억 미만 현실적 규모')
  })
})

describe('표현 가드', () => {
  it('금지 표현을 찾고 대체 문장을 준다', () => {
    const hits = guardText('정책자금 나오면 개발비 주시면 됩니다. 후불 가능합니다.')
    expect(hits.map((h) => h.id)).toEqual(expect.arrayContaining(['pay_after_fund', 'deferred_ok']))
    expect(hits[0].alternative.length).toBeGreaterThan(10)
  })
  it('안전한 문장은 통과한다', () => {
    expect(guardText('초기 부담을 낮출 수 있는 정산방식도 있어서 구축범위가 정해진 뒤 함께 안내드릴 수 있습니다.')).toEqual([])
    expect(guardText('')).toEqual([])
  })
})

describe('브리핑·전달 패킷', () => {
  it('브리핑은 짧은 체인 + 목표 + 주의를 만든다', () => {
    const b = buildBriefing(company({ interests: ['policy_fund'] }))
    expect(b.chain.length).toBe(3)
    expect(b.cautions.some((s) => s.includes('자금'))).toBe(true)
    expect(b.detail.length).toBeGreaterThan(50)
  })
  it('전달 패킷은 INTERNAL 과 CLIENT SAFE 를 분리하고 이벤트 payload 에 내부 메모를 넣지 않는다', () => {
    const c = company()
    const m = meeting(c, { ceo_dependency: 'very_high', repetitive_work: 'high', info_scatter: 'high', internal_owner: 'partTime' }, { memo: '수임료 협상 여지 있음 — 내부' })
    const a = analyzeMeeting(c, m, CASE_SEED)
    const p = buildHandoffPayload(c, m, a, user, CASE_SEED)
    expect(p.internalNotes).toContain('내부')
    expect(p.clientSafeSummary.join(' ')).not.toContain('매우 높음')
    expect(p.clientSafeSummary.join(' ')).not.toContain('매우 많음')
    expect(p.answers.length).toBe(m.questionIds.length)
    expect(p.usage.durationSec).toBe(1800)
    const safe = buildCustomerSafeEventPayload(p)
    expect(JSON.stringify(safe)).not.toContain('수임료')
    expect(safe.company_name).toBe('ABC산업')
    expect(safe.scope_level).toBe(a.scopeLevel)
  })
})
