/**
 * 유사사례 추천 — 업종만으로 매칭하지 않는다.
 * 가중치: 업종(3/1) · 현재 문제구조(2×일치 수) · B2B/B2C(1) · 업무구조·AX 전환방식(1) · 기업규모↔금액구간(2) · 자금유형(1) · 검증(1)
 * 점수는 내부 정렬용이며 화면에는 % 나 점수 대신 자연어 이유 태그만 보여 준다.
 * 기본 추천 2개: ① 동일/가장 가까운 업종  ② 업종은 달라도 문제구조가 가장 비슷한 사례
 * reviewRequired(needs_review) 사례는 기본 추천에서 제외한다(마스터 검수 전).
 */
import type { CaseStudy, Company, QuestionArea } from '../types/domain'

const NEAR_INDUSTRY: Record<string, string[]> = {
  manufacturing: ['distribution', 'logistics'],
  distribution: ['logistics', 'manufacturing'],
  logistics: ['distribution', 'environment'],
  construction: ['environment', 'manufacturing'],
  environment: ['logistics', 'construction'],
  service: ['medical', 'food'],
  medical: ['service'],
  food: ['service', 'distribution'],
  other: [],
}

export interface CaseMatch {
  caseStudy: CaseStudy
  score: number
  whySimilar: string
  /** 자연어 이유 태그 (화면 표시용) */
  reasons: string[]
  /** 다른 점 (화면 표시용) */
  differences: string[]
}

export interface MatchOptions {
  growthAnswer?: string | null
  fundingInterest?: boolean
  areaLabel: (a: QuestionArea) => string
  /** 마스터 검수 화면 등에서 needs_review 사례까지 포함 */
  includeReviewRequired?: boolean
}

const SMALL_HEADCOUNT = new Set(['1-5', '6-10', '11-20'])
function bandRank(c: CaseStudy): number | null {
  const v = c.fundingAmountDisclosed
  if (v === null || v === undefined) return null
  if (v < 500_000_000) return 0
  if (v < 1_000_000_000) return 1
  if (v < 2_000_000_000) return 2
  return 3
}

export interface CaseRecommendation {
  primary: CaseMatch | null
  secondary: CaseMatch | null
  others: CaseMatch[]
}

function overlap(a: QuestionArea[], b: QuestionArea[]): QuestionArea[] {
  return a.filter((x) => b.includes(x))
}

function growthOf(company: Company, growthAnswer: string | null): CaseStudy['growthStage'] | null {
  if (growthAnswer === 'aggressive') return 'growing'
  if (growthAnswer === 'steady') return 'stable'
  if (company.headcount === '1-5') return 'early'
  return null
}

export function scoreCase(c: CaseStudy, company: Company, painAreas: QuestionArea[], opts: MatchOptions): CaseMatch {
  let score = 0
  const reasons: string[] = []
  const differences: string[] = []
  // 1) 업종
  if (c.industry === company.industry) {
    score += 3
    reasons.push('같은 업종')
  } else if (NEAR_INDUSTRY[company.industry]?.includes(c.industry)) {
    score += 1
    reasons.push('가까운 업종')
  } else {
    differences.push('업종이 다름 — 문제 구조로만 비교')
  }
  // 2) 문제 구조
  const ov = overlap(painAreas, c.problemAreas)
  score += ov.length * 2
  if (ov.length) reasons.push(`문제 구조 일치: ${ov.map(opts.areaLabel).join('·')}`)
  // 3) B2B / B2C
  if (company.tradeType !== 'unknown') {
    if (c.businessModel === company.tradeType || c.businessModel === 'both' || company.tradeType === 'both') {
      score += 1
      reasons.push('거래형태 유사')
    } else {
      differences.push(c.businessModel === 'b2c' ? '소비자 대상(B2C) 사례' : '기업 대상(B2B) 사례')
    }
  }
  // 4) 업무구조·AX 전환방식 — 관심사와 전환경로
  const wantsPortal = company.interests.includes('customer') || company.interests.includes('sales')
  const wantsInternal = company.interests.includes('efficiency')
  if ((wantsPortal && (c.axPath === 'customer_portal' || c.axPath === 'hybrid')) || (wantsInternal && (c.axPath === 'internal_ax' || c.axPath === 'hybrid'))) {
    score += 1
    reasons.push(wantsPortal && (c.axPath === 'customer_portal' || c.axPath === 'hybrid') ? '고객 접점 전환 방식' : '내부 업무 전환 방식')
  }
  // 5) 기업규모 ↔ 금액 구간 — 소규모 고객에게는 10억 미만 사례를 우선
  const rank = bandRank(c)
  if (SMALL_HEADCOUNT.has(company.headcount)) {
    if (rank === 0 || rank === 1) {
      score += 2
      reasons.push('10억 미만 현실적 규모')
    } else if (rank !== null && rank >= 3) {
      differences.push('20억 이상 큰 조달 — 방향만 참고')
    }
  }
  // 6) 성장단계
  const g = growthOf(company, opts.growthAnswer ?? null)
  if (g && c.growthStage === g) {
    score += 1
    reasons.push('성장단계 유사')
  }
  // 7) 자금유형 — 자금 관심이 있을 때만 정책·보증·R&D 사례에 가산
  const policyLike = c.fundingType === 'guarantee' || c.fundingType === 'policy_loan' || c.fundingType === 'gov_rnd' || c.fundingType === 'mixed' || c.fundingType === 'commercialization'
  if (opts.fundingInterest && policyLike) {
    score += 1
    reasons.push('정책·보증 자금 경로')
  } else if (c.fundingType === 'private_investment') {
    differences.push('민간투자 사례 — 정책자금과 경로가 다름')
  }
  // 8) 검증 상태
  if (c.verificationStatus === 'verified') score += 1
  // AX 전환 서술이 없는 자금·선정 레퍼런스는 자금 관심이 있을 때만 남긴다
  const thin = !c.axTransition && !c.internalAx && !c.aiFunction && !c.customerPortal
  if (thin) {
    score -= opts.fundingInterest ? 0 : 4
    if (opts.fundingInterest) reasons.push('자금유형 참고')
  }
  return { caseStudy: c, score, whySimilar: reasons.join(' · ') || '참고 사례', reasons, differences }
}

export function recommendCases(cases: CaseStudy[], company: Company, painAreas: QuestionArea[], opts: MatchOptions): CaseRecommendation {
  const scored = cases
    .filter((c) => c.verificationStatus !== 'draft')
    .filter((c) => opts.includeReviewRequired || (!c.reviewRequired && c.verificationStatus === 'verified'))
    .map((c) => scoreCase(c, company, painAreas, opts))
    .sort((a, b) => b.score - a.score)
  const sameIndustry = scored.filter((m) => m.caseStudy.industry === company.industry || NEAR_INDUSTRY[company.industry]?.includes(m.caseStudy.industry))
  const primary = sameIndustry[0] ?? scored[0] ?? null
  const secondary =
    scored.find((m) => m !== primary && m.caseStudy.industry !== company.industry && overlap(painAreas, m.caseStudy.problemAreas).length > 0) ??
    scored.find((m) => m !== primary) ??
    null
  const others = scored.filter((m) => m !== primary && m !== secondary)
  return { primary, secondary, others }
}
