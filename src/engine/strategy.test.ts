import { describe, expect, it } from 'vitest'
import { buildHypotheses, buildStrategy, strategyHash } from './strategy'
import { recommendCases } from './caseMatcher'
import { CASE_SEED } from '../content/cases'
import { AREA_LABEL } from '../content/labels'
import { emptyFacts } from './profile'
import type { Company, CompanyProfile } from '../types/domain'

const T = '2026-09-22T01:00:00.000Z'
function company(over: Partial<Company> = {}): Company {
  return { id: 'c1', consultantId: 'u1', name: '테스트정밀', industry: 'manufacturing', industryNote: '', headcount: '11-20', tradeType: 'b2b', interests: ['efficiency'], representativeName: '', phone: '', meetingAt: null, diagnosis: null, memo: '', archivedAt: null, createdAt: T, updatedAt: T, fieldSources: { headcount: 'pdf', tradeType: 'pdf' }, ...over }
}
function profile(over: Partial<CompanyProfile['facts']> = {}): CompanyProfile {
  const facts = { ...emptyFacts(), companyName: '테스트정밀', headcount: 14, headcountBand: '11-20' as const, industry: 'manufacturing' as const, subIndustry: '자동차 부품 제조업', products: ['정밀 절삭 부품', '브래킷', '금형'], certifications: ['벤처기업', '기업부설연구소'], tradeType: 'b2b' as const, yearsInBusiness: 14, financials: [{ year: 2024, revenue: 9_540_000_000, operatingProfit: null, netIncome: null, assets: null, liabilities: null, equity: null }, { year: 2025, revenue: 11_230_000_000, operatingProfit: null, netIncome: null, assets: null, liabilities: null, equity: null }], growth: { revenueTrend: 'up' as const, revenueGrowthPct: 18, latestYear: 2025 }, notes: ['비고 : 견적은 대표가 직접 산출, 발주는 전화·팩스 접수'], ...over }
  return {
    id: 'p1',
    companyId: 'c1',
    sourceType: 'pdf',
    sourceName: '기업정보 보고서',
    sourceFileName: 'x.pdf',
    sourceHash: 'h',
    pageCount: 4,
    facts,
    evidence: [
      { key: 'headcount', label: '직원수', value: 14, display: '14명', status: 'confirmed', source: 'pdf', sourcePage: 2, sourceText: '종업원수 : 14명' },
      { key: 'revenueTrend', label: '최근 매출 추이', value: 'up', display: '매출 증가 (18%)', status: 'confirmed', source: 'pdf', sourcePage: 3, sourceText: '' },
      { key: 'certifications', label: '인증·확인', value: '벤처기업, 기업부설연구소', display: '벤처기업, 기업부설연구소', status: 'confirmed', source: 'pdf', sourcePage: 2, sourceText: '' },
      { key: 'products', label: '주요 제품·서비스', value: '', display: '', status: 'confirmed', source: 'pdf', sourcePage: 2, sourceText: '' },
      { key: 'tradeType', label: '거래형태', value: 'b2b', display: 'B2B 추정', status: 'assumed', source: 'pdf', sourcePage: 4, sourceText: '' },
    ],
    parser: { adapter: 'generic', version: '1.0', textChars: 900, warnings: [] },
    createdBy: 'u1',
    createdAt: T,
  }
}

describe('Strategy Autopilot', () => {
  it('문서 사실 → 가설(🟡) → 질문. 성장했다고 "엉망" 이라 단정하지 않는다', () => {
    const hyps = buildHypotheses(company(), profile())
    const growth = hyps.find((h) => h.id === 'growth_load')!
    expect(growth.status).toBe('assumed')
    expect(growth.text).toContain('가능성')
    expect(growth.basis).toContain('PDF 3p')
    expect(growth.question).toContain('관리 인력')
    expect(hyps.every((h) => h.status === 'assumed')).toBe(true)
    expect(hyps.length).toBeLessThanOrEqual(4)
  })
  it('한 번에 만들어진다 — 접근법 2문장·TOP3·질문 5~7·방향·범위 가설·동종업계 사례 ≤2·이유·멘트·금지·추가정보 ≤3', () => {
    const s = buildStrategy({ company: company(), profile: profile(), cases: CASE_SEED, now: T })
    expect(s.approach.length).toBeGreaterThan(30)
    // 접근법은 2~3문장, 150자 안팎 — 근거 숫자는 [왜 이렇게 판단했나요?] 안으로 보낸다
    expect(s.approach.length).toBeLessThanOrEqual(170)
    expect(s.approach.split('. ').length).toBeLessThanOrEqual(3)
    expect(s.approach).not.toMatch(/이\(가\)|을\(를\)|은\(는\)/)
    expect(s.focus).toHaveLength(3)
    expect(s.questions.length).toBeGreaterThanOrEqual(5)
    expect(s.questions.length).toBeLessThanOrEqual(7)
    expect(s.axDirection).toBeTruthy()
    expect(['A', 'B', 'C', 'D']).toContain(s.scope.level)
    expect(s.scope.status).toBe('assumed')
    expect(s.cases.length).toBeGreaterThan(0)
    expect(s.cases.length).toBeLessThanOrEqual(2)
    for (const c of s.cases) {
      expect(c.reasons.length).toBeGreaterThan(0)
      expect(c.caseStudy.reviewRequired).not.toBe(true)
      expect(c.caseStudy.verificationStatus).toBe('verified')
      // 동종업계 안에서만 고른다
      expect(c.caseStudy.industry).toBe('manufacturing')
    }
    expect(s.caseNotice).toBe('')
    expect(s.scripts.map((x) => x.key)).toEqual(expect.arrayContaining(['opening', 'price', 'case', 'closing']))
    for (const sc of s.scripts) {
      expect(sc.say.split(/[.!?。]\s/).length).toBeLessThanOrEqual(3)
      expect(sc.next).toMatch(/\?$|나요|까요|인가요/)
    }
    expect(s.forbidden.some((x) => x.includes('후불'))).toBe(true)
    expect(s.forbidden.some((x) => x.includes('매출'))).toBe(true)
    expect(s.missingInfo.length).toBeLessThanOrEqual(3)
    // 기업인증은 1차 미팅 가설·요약에 쓰지 않는다 (2차 제안·Master 분석용)
    expect(s.hypotheses.some((h) => /연구소|벤처|이노비즈|인증/.test(h.text))).toBe(false)
    expect(s.confidence.level).toBe('high')
    expect(s.sources.find((x) => x.label === '인원')?.where).toBe('PDF 2p')
    expect(s.sources.find((x) => x.label === '거래형태')?.status).toBe('assumed')
  })
  it('정보가 적으면 충분도 낮음, 추가 확인 항목에 인원·거래형태가 먼저', () => {
    const s = buildStrategy({ company: company({ headcount: 'unknown', tradeType: 'unknown', interests: ['unknown'], fieldSources: {} }), profile: null, cases: CASE_SEED, now: T })
    expect(s.confidence.level).toBe('low')
    expect(s.missingInfo[0]).toContain('직원수')
    expect(s.missingInfo[1]).toContain('거래형태')
    expect(s.hypotheses).toHaveLength(0)
    expect(s.cases.length).toBeLessThanOrEqual(2)
    expect(s.sources.filter((x) => x.status === 'unknown').length).toBeGreaterThanOrEqual(2)
  })
  it('사전진단 NO_GO 면 범위 가설 D', () => {
    const s = buildStrategy({ company: company({ diagnosis: { leadId: 'l', grade: 'NO_GO', score: 20, answers: { repeatInput: 'no' }, submittedAt: T, matchedBy: 'matched' } }), profile: null, cases: CASE_SEED, now: T })
    expect(s.scope.level).toBe('D')
  })
  it('수정하면 해시가 바뀐다 (같은 입력은 같은 해시)', async () => {
    const a = await strategyHash(company(), profile(), ['x'])
    const b = await strategyHash(company(), profile(), ['x'])
    const c = await strategyHash(company({ headcount: '21-30' }), profile(), ['x'])
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('Case Matcher — Pool 안에서의 점수', () => {
  it('프로필 세부업종·제품이 겹치면 같은 업종 안에서 위로 올라간다', () => {
    const rec = recommendCases(CASE_SEED, company(), ['ceo_dependency', 'quote_order', 'customer_mgmt'], {
      areaLabel: (a) => AREA_LABEL[a],
      fundingInterest: true,
      customerTouchpoint: true,
      profile: { subIndustry: '자동차 부품 제조업', keywords: ['정밀 절삭 부품', '금형'], revenueTrend: 'up', yearsInBusiness: 14, certifications: ['벤처기업', '기업부설연구소'] },
    })
    expect(rec.pool).toBe('industry')
    expect(rec.picks.length).toBeGreaterThan(0)
    expect(rec.picks.length).toBeLessThanOrEqual(2)
    for (const m of rec.picks) expect(m.caseStudy.industry).toBe('manufacturing')
    const allReasons = rec.picks.flatMap((m) => m.reasons)
    expect(allReasons.some((r) => /세부분야|같은 업종|문제 구조|성장|규모/.test(r))).toBe(true)
  })
})
