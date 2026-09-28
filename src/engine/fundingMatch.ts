/**
 * 자금 조달 사례 추천 — 융자·보증 3 + 투자 2.
 *
 * 왜 융자를 앞에 두나: Partner 가 만나는 회사는 5~30명이다. 민간투자 사례만 늘어서면
 * "우리 얘기가 아니다" 로 끝난다. 실제로 상담에서 쓰이는 것은 보증서 받아 은행 대출로 간 사례다.
 *
 * 금액 규칙 (중소기업 눈높이)
 *   5억 이하 > 10억 이하 > 20억 이하 > 그 위. 같은 조건이면 "확보 금액" 이 "제도 한도" 를 이긴다.
 *   제도 한도(최대 ○억)를 실제 받은 돈처럼 보여 주지 않는다 — 카드마다 성격을 적는다.
 *
 * 업종 규칙
 *   같은 업종(Industry) 안에서 먼저 고르고, 원문 업종 표기("AI·세일즈 SaaS")가 겹치면 위로 올린다.
 *   같은 업종이 모자라도 타업종으로 본 목록을 채우지 않는다 — 대신 "비슷한 업종" 으로 따로 보여 준다.
 */
import type { CaseStudy, Company } from '../types/domain'
import { FUNDING_CASES, type FundingCase } from '../content/fundingCases'
import { keywordHits, tokens } from './caseMatcher'

export const LOAN_PICKS = 3
export const INVEST_PICKS = 2
export const NEARBY_PICKS = 3

/** 중소기업이 "우리 얘기" 로 받아들이는 구간 */
export type AmountBand = 'under5' | 'under10' | 'under20' | 'over20' | 'unknown'
export const AMOUNT_BAND_LABEL: Record<AmountBand, string> = {
  under5: '5억 이내',
  under10: '10억 이내',
  under20: '20억 이내',
  over20: '20억 초과',
  unknown: '금액 미공개',
}
export function amountBand(won: number | null): AmountBand {
  if (won === null) return 'unknown'
  if (won <= 500_000_000) return 'under5'
  if (won <= 1_000_000_000) return 'under10'
  if (won <= 2_000_000_000) return 'under20'
  return 'over20'
}
const BAND_SCORE: Record<AmountBand, number> = { under5: 5, under10: 4, under20: 2, over20: 0, unknown: 1 }

export interface FundingPick {
  kind: 'loan' | 'investment'
  id: string
  companyName: string
  industryText: string
  sameIndustry: boolean
  band: AmountBand
  /** 융자 사례일 때 */
  loan?: FundingCase
  /** 투자 사례일 때 — 기존 371건 사례 DB */
  investment?: CaseStudy
  /** 왜 이 사례인가 — 화면에 그대로 */
  why: string[]
  /** 같은 회사의 다른 조달 건 (한 회사가 5칸 중 두 칸을 먹지 않게 접어 둔다) */
  alsoRaised: string[]
  /** 원문 업종 표기가 몇 단어 겹쳤나 */
  hits: number
  score: number
}

export interface FundingPlan {
  /** 융자·보증 먼저, 그다음 투자 */
  picks: FundingPick[]
  /** 같은 업종이 모자랄 때 참고로 — 비슷한 업종 */
  nearby: FundingPick[]
  loanCount: number
  investCount: number
  cautions: string[]
  missing: string[]
}

/** 회사 쪽 업종 키워드 — 업종 메모·프로필 세부업종·제품 */
function companyWords(company: Company, subIndustry?: string | null, products?: string[]): string[] {
  return tokens(company.industryNote, subIndustry, ...(products ?? []))
}

function scoreLoan(c: FundingCase, company: Company, words: string[]): FundingPick {
  const why: string[] = []
  let score = 0
  const same = c.industry === company.industry && company.industry !== 'other'
  if (same) {
    score += 5
    why.push('같은 업종')
  }
  const hits = keywordHits(words, tokens(c.industryText))
  if (hits.length) {
    score += Math.min(6, hits.length * 3)
    why.push(`세부분야 비슷 (${hits.slice(0, 2).join('·')})`)
  }
  const band = amountBand(c.amountKrw)
  score += BAND_SCORE[band]
  if (band === 'under5' || band === 'under10') why.push(`${AMOUNT_BAND_LABEL[band]} 규모`)
  if (c.amountKind === 'disclosed') {
    score += 2
    why.push('확보 금액 공개')
  } else if (c.amountKind === 'planned') score += 1
  if (c.fundingForm === 'loan') {
    score += 1
    why.push('직접 융자')
  }
  if (c.year >= 2026) score += 1
  return { kind: 'loan', id: c.id, companyName: c.companyName, industryText: c.industryText, sameIndustry: same, band, loan: c, why, alsoRaised: [], hits: hits.length, score }
}

function scoreInvestment(c: CaseStudy, company: Company, words: string[]): FundingPick {
  const why: string[] = []
  let score = 0
  const same = c.industry === company.industry && company.industry !== 'other'
  if (same) {
    score += 5
    why.push('같은 업종')
  }
  const hits = keywordHits(words, tokens(c.subIndustry, c.oneLiner, ...(c.keywords ?? [])))
  if (hits.length) {
    score += Math.min(6, hits.length * 3)
    why.push(`세부분야 비슷 (${hits.slice(0, 2).join('·')})`)
  }
  const band = amountBand(c.fundingAmountDisclosed ?? null)
  score += BAND_SCORE[band]
  if (band === 'under5' || band === 'under10') why.push(`${AMOUNT_BAND_LABEL[band]} 규모`)
  return { kind: 'investment', id: c.id, companyName: c.companyName, industryText: c.subIndustry || c.researchSection || '', sameIndustry: same, band, investment: c, why, alsoRaised: [], hits: hits.length, score }
}

const byScore = (a: FundingPick, b: FundingPick) => b.score - a.score || a.companyName.localeCompare(b.companyName, 'ko')

/** 한 회사가 여러 번 조달한 경우 대표 1건만 남기고 나머지는 alsoRaised 로 접는다 */
function dedupeByCompany(list: FundingPick[]): FundingPick[] {
  const out: FundingPick[] = []
  const at = new Map<string, FundingPick>()
  for (const p of list) {
    const head = at.get(p.companyName)
    if (!head) {
      const copy = { ...p, alsoRaised: [...p.alsoRaised] }
      at.set(p.companyName, copy)
      out.push(copy)
      continue
    }
    const label = p.loan ? `${p.loan.program} ${p.loan.amountText}` : p.investment ? `민간투자 ${(p.investment.fundingAmountDisclosed ?? 0) / 100_000_000}억` : ''
    if (label && !head.alsoRaised.includes(label)) head.alsoRaised.push(label)
  }
  return out
}

export function planFunding(
  cases: CaseStudy[],
  company: Company,
  opts: { subIndustry?: string | null; products?: string[]; yearsInBusiness?: number | null } = {},
): FundingPlan {
  const words = companyWords(company, opts.subIndustry, opts.products)
  const known = company.industry !== 'other'

  // 융자·보증 — 같은 업종 안에서만 본 목록에 올린다
  const loansAll = FUNDING_CASES.map((c) => scoreLoan(c, company, words))
  const loansSame = loansAll.filter((p) => p.sameIndustry).sort(byScore)
  const loanPicks = dedupeByCompany(loansSame).slice(0, LOAN_PICKS)

  // 투자 — 기존 사례 DB 에서 검수된 것만
  const usable = cases.filter((c) => c.verificationStatus === 'verified' && !c.reviewRequired)
  const investAll = usable.map((c) => scoreInvestment(c, company, words))
  const investSame = investAll.filter((p) => p.sameIndustry).sort(byScore)
  const investPicks = dedupeByCompany(investSame).slice(0, INVEST_PICKS)

  /**
   * 사이드 "비슷한 사례" — 이 순서로 채운다.
   *   1) 같은 업종인데 본 목록 3+2 에 자리가 없어 밀린 것
   *   2) 타업종이지만 원문 업종 표기가 **두 단어 이상** 겹치는 것
   * (2) 에 두 단어를 요구하는 이유: "브랜드" 같은 흔한 한 단어로는 광고회사에 식품제조 사례가 올라온다.
   * 둘 다 없으면 비워 둔다 — 아무 업종이나 끌어오지 않는다.
   */
  const pickedNames = new Set([...loanPicks, ...investPicks].map((p) => p.companyName))
  const sameIndustryRest = [...loansSame, ...investSame].filter((p) => !pickedNames.has(p.companyName)).sort(byScore)
  const keywordNear = [...loansAll, ...investAll].filter((p) => !p.sameIndustry && p.hits >= 2).sort(byScore)
  const nearby = dedupeByCompany([...sameIndustryRest, ...keywordNear].filter((p) => !pickedNames.has(p.companyName) && p.industryText)).slice(0, NEARBY_PICKS)

  const cautions: string[] = []
  // 사이드 카드까지 센다 — 화면에 "제도 한도" 가 한 장이라도 떠 있으면 경고도 같이 떠야 한다
  const caps = [...loanPicks, ...investPicks, ...nearby].filter((p) => p.loan?.amountKind === 'program_cap')
  if (caps.length) cautions.push(`${caps.length}건은 선정 사실과 제도 공통 한도만 공개된 사례입니다. "최대 ○억" 은 그 회사가 실제로 받은 돈이 아닙니다.`)
  if (known && loansSame.length === 0) cautions.push('같은 업종에서 공개된 융자·보증 사례를 찾지 못했습니다. 아래 "비슷한 업종" 을 참고하되 창구가 다를 수 있습니다.')
  if (known && loansSame.length > 0 && loanPicks.every((p) => p.band === 'over20')) cautions.push('이 업종의 공개 사례가 20억 초과 구간에 몰려 있습니다. 규모가 다른 회사에는 그대로 인용하지 마세요.')
  if (!known) cautions.push('업종을 확인하면 같은 업종의 조달 사례를 골라 드립니다. 지금은 업종 정보가 없어 본 목록을 만들지 않았습니다.')
  cautions.push('이 사례들은 "실제로 이런 조달이 있었다" 는 기록이고, 신청 자격·한도·심사 기준이 아닙니다. 해당 연도 공고로 확인하세요.')

  const missing: string[] = []
  if (!known) missing.push('업종 — 기관별 창구가 업종으로 갈립니다')
  if (opts.yearsInBusiness === null || opts.yearsInBusiness === undefined) missing.push('업력 — 창업기업 프로그램 해당 여부가 갈립니다')
  if (company.headcount === 'unknown') missing.push('근로자 수 — 규모별 한도가 갈립니다')

  return { picks: [...loanPicks, ...investPicks], nearby, loanCount: loanPicks.length, investCount: investPicks.length, cautions, missing }
}
