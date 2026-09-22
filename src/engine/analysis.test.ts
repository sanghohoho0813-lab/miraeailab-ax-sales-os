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

/** 질문 선택과 무관하게 분석 엔진을 검증할 때 — 질문 id 와 답을 함께 붙인다 */
function withExtra(m: Meeting, id: string, value: string, source: 'consultant' | 'diagnosis' = 'consultant'): Meeting {
  return { ...m, questionIds: [...m.questionIds, id], answers: { ...m.answers, [id]: { questionId: id, value, source, at: T } } }
}

describe('질문 선택', () => {
  it('5~7개만 고른다 — Core 4(대표 의존도·업무 흐름·고객관리·현재 시스템) + Adaptive 최대 2', () => {
    for (const ind of ['manufacturing', 'distribution', 'construction', 'service', 'food', 'logistics', 'medical', 'environment', 'other'] as const) {
      const qs = selectQuestions(company({ industry: ind, tradeType: 'both', interests: ['efficiency', 'sales', 'policy_fund'] }))
      const ids = qs.map((q) => q.id)
      expect(qs.length, `${ind} 질문 수`).toBeGreaterThanOrEqual(5)
      expect(qs.length, `${ind} 질문 수`).toBeLessThanOrEqual(7)
      for (const core of ['ceo_dependency', 'customer_mgmt', 'current_system']) expect(ids, ind).toContain(core)
      // 반복업무와 정보분산은 둘 중 하나만 묻는다
      expect(ids.filter((x) => x === 'repetitive_work' || x === 'info_scatter')).toHaveLength(1)
      expect(new Set(ids).size).toBe(qs.length)
    }
  })
  it('내부 담당자 질문은 첫 미팅 Core 에서 뺀다', () => {
    expect(selectQuestions(company({ interests: ['efficiency'] })).map((q) => q.id)).not.toContain('internal_owner')
  })
  it('업무 흐름 질문 — 사전진단이 있으면 더 강한 쪽, 없으면 업종 기본값', () => {
    const withDiag = company({ industry: 'service', diagnosis: { leadId: 'l', grade: 'HIGH', score: 80, answers: { repeatInput: 'always', toolGaps: 'no' }, submittedAt: T, matchedBy: 'matched' } })
    expect(selectQuestions(withDiag).map((q) => q.id)).toContain('repetitive_work')
    expect(selectQuestions(company({ industry: 'manufacturing' })).map((q) => q.id)).toContain('repetitive_work')
    expect(selectQuestions(company({ industry: 'service' })).map((q) => q.id)).toContain('info_scatter')
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
    const base = meeting(c, { ceo_dependency: 'very_high', repetitive_work: 'high', current_system: 'partial', customer_mgmt: 'memory', quote_order: 'phone_chat', hiring_burden: 'yes' })
    const m = withExtra(withExtra(base, 'internal_owner', 'dedicated'), 'growth_plan', 'aggressive')
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
    const c = company({ headcount: '6-10', tradeType: 'b2c', industry: 'manufacturing', interests: ['efficiency'] })
    const m = meeting(c, { ceo_dependency: 'mid', repetitive_work: 'high', current_system: 'covered', customer_mgmt: 'system', hiring_burden: 'no', mfg_process: 'low' })
    const a = analyzeMeeting(c, m, CASE_SEED)
    expect(a.scopeLevel).toBe('A')
  })
  it('자금 관심은 AX 필요도와 분리되고 절대표현 알림에 반영된다', () => {
    const c = company({ interests: ['policy_fund'] })
    const base = meeting(c, { ceo_dependency: 'low', repetitive_work: 'low', current_system: 'covered', customer_mgmt: 'system', funding_interest: 'high' })
    const m = withExtra(withExtra(base, 'growth_plan', 'aggressive'), 'data_potential', 'none')
    const a = analyzeMeeting(c, m, CASE_SEED)
    expect(a.axNeed).toBe('low')
    expect(a.fundingReadiness).not.toBe('low')
    expect(a.forbiddenReminders.some((s) => s.includes('자금'))).toBe(true)
  })
  it('사전진단으로만 채운 답은 추정(assumed)으로, 잘 모르겠음은 미확인으로 분류한다', () => {
    const c = company()
    const base = meeting(c, { ceo_dependency: 'high', repetitive_work: 'unknown' })
    const m = withExtra(base, 'info_scatter', 'very_high', 'diagnosis')
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

describe('유사사례 추천 — 동종업계 우선', () => {
  const label = (a: Parameters<typeof AREA_LABEL.__proto__.valueOf>[0] extends never ? never : keyof typeof AREA_LABEL) => AREA_LABEL[a]

  it('같은 업종 사례가 있으면 다른 업종은 기본 추천에 올라오지 않는다', () => {
    for (const ind of ['manufacturing', 'service', 'food', 'medical', 'construction', 'environment', 'distribution'] as const) {
      const c = company({ industry: ind })
      const rec = recommendCases(CASE_SEED, c, ['quote_order', 'customer_mgmt'], { areaLabel: label })
      expect(rec.pool, ind).toBe('industry')
      expect(rec.picks.length, ind).toBeGreaterThan(0)
      expect(rec.picks.length, ind).toBeLessThanOrEqual(2)
      expect(rec.fallback, ind).toBeNull()
      for (const m of rec.picks) expect(m.caseStudy.industry, `${ind} 추천에 타업종 혼입`).toBe(ind)
    }
  })

  it('광고·마케팅 회사에는 광고·마케팅·콘텐츠 쪽 사례가 오고 화훼·외식 사례는 오지 않는다', () => {
    const c = company({ industry: 'service', industryNote: '광고·마케팅·크리에이티브', headcount: '1-5', tradeType: 'b2b', interests: ['sales', 'customer'] })
    const rec = recommendCases(CASE_SEED, c, ['customer_mgmt', 'repurchase'], {
      areaLabel: label,
      profile: { subIndustry: '광고·마케팅 서비스', keywords: ['광고', '마케팅', '콘텐츠', '디자인'] },
    })
    expect(rec.picks.length).toBeGreaterThan(0)
    for (const m of rec.picks) {
      expect(m.caseStudy.industry).toBe('service')
      expect(/농업|화훼|스마트팜|외식|프랜차이즈|식품/.test(`${m.caseStudy.subIndustry} ${m.caseStudy.researchSection}`)).toBe(false)
    }
    // 세부분야가 겹치면 그 이유가 카드에 나온다
    expect(rec.picks.some((m) => m.kind === 'sub_industry' || m.reasons.some((r) => r.includes('세부분야')))).toBe(true)
  })

  it('억지로 3개를 채우지 않는다 — 최대 2개', () => {
    const c = company({ industry: 'manufacturing' })
    const rec = recommendCases(CASE_SEED, c, ['repetitive_work'], { areaLabel: label })
    expect(rec.picks.length).toBeLessThanOrEqual(2)
  })

  it('같은 업종에 검수된 사례가 없으면 0개 또는 참고 사례 1개만, 그리고 참고라고 표시된다', () => {
    const onlyFood = CASE_SEED.filter((x) => x.industry === 'food')
    const c = company({ industry: 'medical' })
    const rec = recommendCases(onlyFood, c, ['customer_mgmt'], { areaLabel: label })
    expect(rec.picks).toHaveLength(0)
    expect(rec.pool).not.toBe('industry')
    if (rec.fallback) {
      expect(rec.fallback.kind).toBe('near')
      expect(rec.fallback.kindLabel).toContain('참고')
    }
    // 의료는 인접업종 fallback 을 쓰지 않으므로 키워드가 겹치지 않으면 아무것도 주지 않는다
    const nothing = recommendCases(onlyFood, company({ industry: 'medical', industryNote: '' }), [], { areaLabel: label })
    expect(nothing.picks).toHaveLength(0)
  })

  it('자금 관심이 없으면 AX 전환 서술이 없는 자금·선정 레퍼런스는 추천하지 않는다', () => {
    const c = company({ industry: 'construction' })
    const rec = recommendCases(CASE_SEED, c, ['info_scatter'], { areaLabel: label, fundingInterest: false })
    expect(rec.picks.length).toBeGreaterThan(0)
    for (const m of rec.picks) {
      expect(m.caseStudy.axTransition.length).toBeGreaterThan(0)
      expect(m.caseStudy.reviewRequired).toBeFalsy()
    }
  })

  it('검수 필요(needs_review) 사례는 기본 추천에서 빠지고, 옵션을 켜면 포함된다', () => {
    const c = company({ industry: 'manufacturing' })
    const base = recommendCases(CASE_SEED, c, ['repetitive_work'], { areaLabel: label })
    expect([...base.picks, ...base.others].every((m) => m.caseStudy.verificationStatus === 'verified')).toBe(true)
    const all = recommendCases(CASE_SEED, c, ['repetitive_work'], { areaLabel: label, includeReviewRequired: true })
    expect(all.others.length).toBeGreaterThan(base.others.length)
  })

  it('소규모 고객에게는 10억 미만 사례가 먼저 온다', () => {
    const c = company({ industry: 'food', headcount: '6-10' })
    const rec = recommendCases(CASE_SEED, c, ['customer_mgmt'], { areaLabel: label })
    expect(rec.picks[0]?.caseStudy.fundingAmountDisclosed ?? 0).toBeLessThan(1_000_000_000)
    expect(rec.picks[0]?.reasons).toContain('10억 미만 현실적 규모')
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
