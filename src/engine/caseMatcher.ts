/**
 * 유사사례 추천 — 업종만으로 매칭하지 않는다.
 * 매칭 요소: 업종 · 현재 문제(problemAreas) · B2B/B2C · AX 전환경로 · 성장단계 · 자금유형
 * 기본 추천 2개: ① 동일/가장 가까운 업종  ② 업종은 달라도 문제구조가 가장 비슷한 사례
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

export function scoreCase(
  c: CaseStudy,
  company: Company,
  painAreas: QuestionArea[],
  opts: { growthAnswer?: string | null; fundingInterest?: boolean; areaLabel: (a: QuestionArea) => string },
): CaseMatch {
  let score = 0
  const reasons: string[] = []
  if (c.industry === company.industry) {
    score += 3
    reasons.push('같은 업종')
  } else if (NEAR_INDUSTRY[company.industry]?.includes(c.industry)) {
    score += 1
    reasons.push('가까운 업종')
  }
  const ov = overlap(painAreas, c.problemAreas)
  score += ov.length * 2
  if (ov.length) reasons.push(`문제 구조 일치: ${ov.map(opts.areaLabel).join('·')}`)
  if (company.tradeType !== 'unknown' && (c.businessModel === company.tradeType || c.businessModel === 'both' || company.tradeType === 'both')) {
    score += 1
    reasons.push('거래형태 유사')
  }
  const g = growthOf(company, opts.growthAnswer ?? null)
  if (g && c.growthStage === g) {
    score += 1
    reasons.push('성장단계 유사')
  }
  if (c.verificationStatus === 'verified') score += 1
  // 자금 전용 사례(AX 구축이 아닌 것)는 자금 관심이 있을 때만 점수를 준다
  if (c.axPath === 'simple_automation' && c.internalAx === '') {
    score -= opts.fundingInterest ? 0 : 4
    if (opts.fundingInterest) reasons.push('자금유형 참고')
  }
  return { caseStudy: c, score, whySimilar: reasons.join(' · ') || '참고 사례' }
}

export function recommendCases(
  cases: CaseStudy[],
  company: Company,
  painAreas: QuestionArea[],
  opts: { growthAnswer?: string | null; fundingInterest?: boolean; areaLabel: (a: QuestionArea) => string },
): CaseRecommendation {
  const scored = cases
    .filter((c) => c.verificationStatus !== 'draft')
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
