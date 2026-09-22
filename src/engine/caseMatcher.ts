/**
 * 유사사례 추천 V2 — 업종만으로 매칭하지 않는다. Vector DB·임베딩 없이 규칙 + 키워드 + 가중치로 371건을 고른다.
 * 가중치: 업종(3/1) · 현재 문제구조(2×일치 수) · B2B/B2C(1) · 업무구조·AX 전환방식(1) · 기업규모↔금액구간(2) · 자금유형(1) · 검증(1)
 *   + V2: 세부업종·제품 키워드(최대 2) · 성장추이→성장단계(1) · 인증(연구소·벤처)↔R&D·사업화 자금경로(1) · 고객접점 필요↔포털 전환(1)
 * 점수는 내부 정렬용이며 화면에는 % 나 점수 대신 자연어 이유 태그만 보여 준다.
 * 기본 추천 3개: ① 동일/가장 가까운 업종  ② 업종은 달라도 문제구조가 가장 비슷한 사례  ③ 전환경로(AX Path)가 가장 가까운 사례
 * reviewRequired(needs_review) 사례는 기본 추천에서 제외한다(마스터 검수 전).
 */
import type { CaseStudy, Company, QuestionArea } from '../types/domain'

/** PDF·음성 프로필에서 오는 추가 신호 (모두 선택) */
export interface ProfileSignals {
  subIndustry?: string | null
  /** 주요 제품·서비스 */
  keywords?: string[]
  revenueTrend?: 'up' | 'down' | 'flat' | null
  yearsInBusiness?: number | null
  certifications?: string[]
}

const STOP = new Set(['제조업', '제조', '서비스업', '서비스', '주식회사', '기타', '부품', '및', '등', '업', '기업', '회사'])
export function tokens(...parts: (string | null | undefined)[]): string[] {
  const out = new Set<string>()
  for (const p of parts) {
    if (!p) continue
    for (const t of p.split(/[^가-힣A-Za-z0-9]+/)) {
      const w = t.trim()
      if (w.length >= 2 && !STOP.has(w) && !/^\d+$/.test(w)) out.add(w)
    }
  }
  return [...out]
}

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
  /** V2 — PDF·음성 프로필 신호 */
  profile?: ProfileSignals
  /** V2 — 거래처 접점 화면이 필요한 구조(B2B + 견적·주문/거래처 관리 문제) */
  customerTouchpoint?: boolean
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

export type MatchKind = 'industry' | 'problem' | 'path'
export const MATCH_KIND_LABEL: Record<MatchKind, string> = { industry: '업종이 가까운 사례', problem: '문제구조가 가까운 사례', path: '전환경로가 가까운 사례' }

export interface CaseRecommendation {
  primary: CaseMatch | null
  secondary: CaseMatch | null
  /** V2 — 전환경로(AX Path)가 가장 가까운 사례 */
  tertiary: CaseMatch | null
  others: CaseMatch[]
}

function overlap(a: QuestionArea[], b: QuestionArea[]): QuestionArea[] {
  return a.filter((x) => b.includes(x))
}

function growthOf(company: Company, growthAnswer: string | null, profile?: ProfileSignals): CaseStudy['growthStage'] | null {
  if (growthAnswer === 'aggressive') return 'growing'
  if (growthAnswer === 'steady') return 'stable'
  if (profile?.revenueTrend === 'up') return 'growing'
  if (profile?.yearsInBusiness !== null && profile?.yearsInBusiness !== undefined && profile.yearsInBusiness <= 3) return 'early'
  if (profile?.revenueTrend === 'flat' && (profile.yearsInBusiness ?? 0) >= 10) return 'stable'
  if (company.headcount === '1-5') return 'early'
  return null
}

function desiredPath(company: Company, opts: MatchOptions): CaseStudy['axPath'][] {
  const wantsPortal = opts.customerTouchpoint || company.interests.includes('customer') || company.interests.includes('sales')
  const wantsInternal = company.interests.includes('efficiency')
  if (wantsPortal && wantsInternal) return ['hybrid', 'customer_portal', 'internal_ax']
  if (wantsPortal) return ['customer_portal', 'hybrid']
  if (company.headcount === '1-5') return ['simple_automation', 'internal_ax']
  return ['internal_ax', 'hybrid']
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
  // 6) 성장단계 — 미팅 답변 > PDF 매출추이·업력 > 인원
  const g = growthOf(company, opts.growthAnswer ?? null, opts.profile)
  if (g && c.growthStage === g) {
    score += 1
    reasons.push(opts.profile?.revenueTrend === 'up' && !opts.growthAnswer ? '성장 추이 유사 (매출 증가)' : '성장단계 유사')
  }
  // V2-a) 세부업종·제품 키워드
  if (opts.profile) {
    const mine = tokens(opts.profile.subIndustry, ...(opts.profile.keywords ?? []))
    const theirs = tokens(c.subIndustry, c.oneLiner, ...(c.keywords ?? []))
    const hits = mine.filter((t) => theirs.some((u) => u.includes(t) || t.includes(u)))
    if (hits.length) {
      score += Math.min(2, hits.length)
      reasons.push(`세부업종·제품 유사: ${hits.slice(0, 2).join('·')}`)
    }
    // V2-b) 인증(연구소·벤처) ↔ R&D·사업화 자금 경로
    const techCert = (opts.profile.certifications ?? []).some((x) => /연구소|전담부서|벤처|이노비즈/.test(x))
    if (techCert && (c.fundingType === 'gov_rnd' || c.fundingType === 'commercialization' || c.fundingType === 'mixed')) {
      score += 1
      reasons.push('기술 인증 기업의 R&D·사업화 경로')
    }
  }
  // V2-c) 고객 접점 필요 ↔ 포털 전환
  if (opts.customerTouchpoint && (c.axPath === 'customer_portal' || c.axPath === 'hybrid')) {
    score += 1
    if (!reasons.includes('고객 접점 전환 방식')) reasons.push('거래처 접점 화면이 필요한 구조')
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
  const paths = desiredPath(company, opts)
  const tertiary =
    scored.find((m) => m !== primary && m !== secondary && paths.includes(m.caseStudy.axPath) && m.reasons.length >= 2) ??
    scored.find((m) => m !== primary && m !== secondary && paths.includes(m.caseStudy.axPath)) ??
    scored.find((m) => m !== primary && m !== secondary) ??
    null
  if (tertiary && !tertiary.reasons.some((r) => /전환 방식|접점/.test(r))) tertiary.reasons.push(tertiary.caseStudy.axPath === 'customer_portal' || tertiary.caseStudy.axPath === 'hybrid' ? '고객 접점 전환 방식' : tertiary.caseStudy.axPath === 'simple_automation' ? '작게 시작한 자동화 방식' : '내부 업무 전환 방식')
  const others = scored.filter((m) => m !== primary && m !== secondary && m !== tertiary)
  return { primary, secondary, tertiary, others }
}
