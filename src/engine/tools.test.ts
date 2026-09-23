/**
 * 기업분석 도구 — 명부 집계(개인정보 경계 포함) · 서류 상태 · 정책자금 기관.
 * 명부 테스트의 핵심은 숫자가 아니라 **주민번호가 어디에도 남지 않는다** 는 것이다.
 */
import { describe, expect, it } from 'vitest'
import { extractEmployment } from './docParser/rules'
import { parseCompanyDocument } from './docParser'
import { documentStatus, missingRequired, toolStatus } from './documents'
import { reviewEmployment } from './employment'
import { recommendInstitutions, hasPublicFunding } from './policyFund'
import { CASE_SEED } from '../content/cases'
import { emptyFacts } from './profile'
import type { Company, CompanyProfile, TextDoc } from '../types/domain'
import type { TextDoc as Doc } from './docParser/types'

/**
 * 기준 시각을 고정한다. 픽스처(insurance-roster.pdf)의 날짜는 2025년이라 이 시점 기준으로
 * 최근 12개월 창이 실제로 열린다 — 창을 넘나드는 경계를 테스트가 실제로 밟는다.
 */
const NOW = new Date(2025, 8, 1) // 2025-09-01
const T = '2026-09-22T01:00:00.000Z'

/**
 * e2e/fixtures/insurance-roster.pdf 를 브라우저(pdf.js + itemsToLines)가 실제로 만들어 내는 줄 그대로다.
 * 직접 지어낸 줄(공백 두 칸)로 테스트했더니 정규식이 우연히 통과해 주민번호가 날짜 파싱을 망가뜨리는 버그를 놓쳤다.
 * 실제 출력으로 고정해 둔다.
 */
const ROSTER_LINES = [
  '사업장가입자 명부',
  '사업장명 : 가상정밀기계',
  '성명 주민등록번호 자격취득일 자격상실일',
  '홍가상 900101-1234567 2019-03-04',
  '김가상 880505-2345678 2021-07-15',
  '이가상 950212-1456789 2025-02-03',
  '박가상 010909-3567890 2025-06-10',
  '최가상 870303-1678901 2018-11-20 2025-04-30',
  '정가상 930808-2789012 2024-01-08',
  '국민연금 건강보험 고용보험 산재보험',
]
const doc = (lines: string[]): Doc => ({ pages: [{ page: 1, lines }], pageCount: 1, textChars: lines.join('').length, hasTextLayer: true, sha256: 'x' })

function company(over: Partial<Company> = {}): Company {
  return { id: 'c1', consultantId: 'u1', name: '가상정밀기계', industry: 'manufacturing', industryNote: '', headcount: '11-20', tradeType: 'b2b', interests: ['efficiency'], representativeName: '', phone: '', meetingAt: null, diagnosis: null, memo: '', archivedAt: null, createdAt: T, updatedAt: T, ...over }
}
function profile(over: Partial<CompanyProfile> = {}): CompanyProfile {
  return { id: 'p1', companyId: 'c1', sourceType: 'pdf', sourceName: '기업정보 보고서', sourceFileName: 'a.pdf', sourceHash: 'h', pageCount: 3, facts: emptyFacts(), evidence: [], parser: { adapter: 'generic', version: '1.0', textChars: 100, warnings: [] }, createdBy: 'u1', createdAt: T, ...over }
}

describe('4대보험 명부 — 집계만, 개인정보는 남기지 않는다', () => {
  const { employment, evidence } = extractEmployment(doc(ROSTER_LINES), NOW)

  it('가입자 수 · 최근 1년 입사 · 퇴사를 센다 (주민번호를 날짜로 착각하지 않는다)', () => {
    expect(employment.datedRows).toBe(6)
    expect(employment.insured).toBe(5) // 6행 - 상실 1명
    expect(employment.joined12m).toBe(2) // 2025-02-03, 2025-06-10
    expect(employment.left12m).toBe(1) // 2025-04-30
  })

  it('주민번호가 근거에도 값에도 남지 않는다', () => {
    const dump = JSON.stringify({ employment, evidence })
    expect(dump).not.toMatch(/\d{6}\s*-\s*[1-8]\d{6}/)
    for (const name of ['홍가상', '김가상', '이가상', '박가상', '최가상', '정가상']) expect(dump).not.toContain(name)
    for (const e of evidence) expect(e.sourceText).toContain('개인정보는 저장하지 않음')
  })

  it('파서 진입점에서도 명부로 인식하고 같은 경계를 지킨다', () => {
    const parsed = parseCompanyDocument(doc(ROSTER_LINES) as unknown as TextDoc, NOW)
    expect(parsed.adapter).toBe('insurance_roster')
    expect(parsed.docKind).toBe('4대보험 가입자 명부')
    expect(parsed.facts.employment?.insured).toBe(5)
    expect(JSON.stringify(parsed)).not.toMatch(/\d{6}\s*-\s*[1-8]\d{6}/)
    expect(parsed.warnings.some((w) => w.includes('개인정보'))).toBe(true)
  })

  it('명부가 없으면 고용지원금 검토는 사실을 지어내지 않는다', () => {
    const r = reviewEmployment(company(), null)
    expect(r.facts).toBeNull()
    expect(r.checks).toHaveLength(0)
    expect(r.missing).toContain('4대보험 가입자 명부')
  })

  it('명부가 있으면 확인할 제도를 좁혀 주되 금액은 계산하지 않는다', () => {
    const facts = { ...emptyFacts(), employment }
    const r = reviewEmployment(company(), profile({ facts }))
    expect(r.headline).toContain('가입자 5명')
    expect(r.checks.length).toBeGreaterThan(0)
    // 판정 규칙이 없다는 것을 구조로 드러낸다
    for (const c of r.checks) expect(c.rule).toBeNull()
    expect(r.caution).toContain('금액은 계산하지 않습니다')
    // 금액 모양(숫자+원 / 숫자+만원)이 어디에도 없어야 한다 — 근거 없는 숫자를 화면에 띄우지 않는다
    expect(JSON.stringify(r)).not.toMatch(/\d[\d,]*\s*(만\s*)?원/)
  })
})

describe('서류 상태 — 없는 것이 드러난다', () => {
  it('프로필이 없으면 필수 서류가 전부 미비로 나온다', () => {
    const docs = documentStatus([])
    expect(docs).toHaveLength(5)
    expect(docs.every((d) => !d.have)).toBe(true)
    const missing = missingRequired(docs)
    expect(missing.map((d) => d.key).sort()).toEqual(['company_report', 'insurance_roster'])
  })

  it('명부를 올리면 고용지원금 도구가 열린다', () => {
    const docs = documentStatus([profile({ sourceName: '4대보험 가입자 명부' })])
    const tools = toolStatus(docs)
    const emp = tools.find((t) => t.spec.id === 'employment_subsidy')!
    expect(emp.ready).toBe(true)
    const report = tools.find((t) => t.spec.id === 'company_report')!
    expect(report.ready).toBe(false)
    expect(report.missing[0].key).toBe('company_report')
  })

  it('서류가 없어도 정책자금 도구는 막히지 않는다', () => {
    const tools = toolStatus(documentStatus([]))
    expect(tools.find((t) => t.spec.id === 'policy_fund')!.ready).toBe(true)
  })
})

describe('정책자금 유력 기관 — 사례에 적힌 기관만', () => {
  it('민간투자만 있는 사례는 세지 않는다', () => {
    const onlyPrivate = CASE_SEED.filter((c) => !hasPublicFunding(c))
    expect(onlyPrivate.length).toBeGreaterThan(0)
    const r = recommendInstitutions(onlyPrivate, company())
    expect(r.institutions).toHaveLength(0)
    expect(r.pool).toBe('none')
  })

  it('같은 업종에서 기관과 근거 사례를 찾는다', () => {
    const r = recommendInstitutions(CASE_SEED, company({ industry: 'manufacturing' }))
    expect(r.institutions.length).toBeGreaterThan(0)
    for (const i of r.institutions) {
      expect(i.count).toBeGreaterThan(0)
      expect(i.cases.length).toBeGreaterThan(0)
      expect(i.cases.length).toBeLessThanOrEqual(3)
    }
  })

  it('업력이 길면 창업기업 전용 프로그램이 섞여 있다고 경고한다', () => {
    const r = recommendInstitutions(CASE_SEED, company({ industry: 'manufacturing' }), { yearsInBusiness: 14 })
    expect(r.cautions.some((c) => c.includes('창업 초기'))).toBe(true)
  })

  it('요건·한도를 판정하지 않는다고 항상 말한다', () => {
    const r = recommendInstitutions(CASE_SEED, company())
    expect(r.cautions.some((c) => c.includes('신청 자격'))).toBe(true)
  })

  it('업종·업력·근로자 수가 비면 먼저 채우라고 알려 준다', () => {
    const r = recommendInstitutions(CASE_SEED, company({ industry: 'other', industryNote: '', headcount: 'unknown' }))
    expect(r.missing.length).toBe(3)
  })
})
