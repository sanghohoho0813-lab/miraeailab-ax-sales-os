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
import { planFunding } from './fundingMatch'
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

describe('자금 조달 사례 — 융자 먼저, 중소기업 규모 먼저', () => {
  const co = (industry: Company['industry'], over: Partial<Company> = {}) => company({ industry, ...over })

  it('업종마다 융자·보증 3 + 투자 2 로 채운다', () => {
    for (const ind of ['manufacturing', 'service', 'food', 'medical', 'distribution', 'logistics', 'construction', 'environment'] as const) {
      const p = planFunding(CASE_SEED, co(ind))
      expect(p.loanCount, ind).toBe(3)
      expect(p.investCount, ind).toBe(2)
      expect(p.picks.slice(0, 3).every((x) => x.kind === 'loan'), `${ind}: 융자가 먼저 와야 한다`).toBe(true)
      for (const x of p.picks) expect(x.sameIndustry, `${ind}: 본 목록에 타업종 혼입`).toBe(true)
    }
  })

  it('한 회사가 본 목록의 두 칸을 먹지 않는다 — 다른 조달 건은 접어 둔다', () => {
    const p = planFunding(CASE_SEED, co('manufacturing'))
    const names = p.picks.map((x) => x.companyName)
    expect(new Set(names).size).toBe(names.length)
    // 퓨리언스는 기보 5억·중진공 3억·퍼스트펭귄 20억 세 건이 있다 → 한 장에 접힌다
    const puri = p.picks.find((x) => x.companyName === '퓨리언스')!
    expect(puri.alsoRaised.length).toBeGreaterThan(0)
  })

  it('5~30명 회사 눈높이 — 20억 초과만 늘어서지 않는다', () => {
    for (const ind of ['manufacturing', 'service', 'food', 'medical', 'environment'] as const) {
      const p = planFunding(CASE_SEED, co(ind))
      const small = p.picks.filter((x) => x.band === 'under5' || x.band === 'under10').length
      expect(small, `${ind}: 10억 이내 사례가 3건 미만`).toBeGreaterThanOrEqual(3)
    }
  })

  it('"최대 ○억" 을 실제 받은 돈처럼 다루지 않는다', () => {
    const p = planFunding(CASE_SEED, co('food'))
    const caps = p.picks.filter((x) => x.loan?.amountKind === 'program_cap')
    if (caps.length) expect(p.cautions.some((c) => c.includes('실제로 받은 돈이 아닙니다'))).toBe(true)
    // 제도 한도 사례는 "확보" 로 표시되지 않는다
    for (const x of caps) expect(x.why).not.toContain('확보 금액 공개')
  })

  it('세부업종이 들어오면(크레탑 업로드) 같은 세부분야가 위로 올라온다', () => {
    const p = planFunding(CASE_SEED, co('manufacturing'), { subIndustry: '반도체 검사장비 제조', products: ['웨이퍼 검사'] })
    expect(p.picks[0].companyName).toBe('퓨리언스')
    expect(p.picks[0].industryText).toContain('반도체')
  })

  it('사이드 "비슷한 사례" 는 흔한 한 단어로 타업종을 끌어오지 않는다', () => {
    const p = planFunding(CASE_SEED, co('service'), { subIndustry: '광고·마케팅 콘텐츠', products: ['브랜드 콘텐츠'] })
    for (const x of p.nearby) {
      if (!x.sameIndustry) expect(x.hits, `${x.companyName}: 한 단어로 올라옴`).toBeGreaterThanOrEqual(2)
      expect(x.industryText).not.toBe('')
    }
  })

  it('업종을 모르면 본 목록을 만들지 않고 이유를 말한다', () => {
    const p = planFunding(CASE_SEED, co('other', { industryNote: '' }))
    expect(p.picks).toHaveLength(0)
    expect(p.cautions.some((c) => c.includes('업종을 확인하면'))).toBe(true)
  })

  it('신청 자격이 아니라는 것을 항상 말한다', () => {
    const p = planFunding(CASE_SEED, co('manufacturing'))
    expect(p.cautions.some((c) => c.includes('신청 자격'))).toBe(true)
  })
})
