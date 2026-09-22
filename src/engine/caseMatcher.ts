/**
 * 유사사례 추천 V3 — FILTER → SCORE.
 *
 * 순서가 바뀌었다. 예전에는 371건 전체를 점수화한 뒤 위에서 잘랐기 때문에
 * 광고회사에 화훼·외식 사례가 올라오는 일이 있었다. 이제는 먼저 Pool 을 업종으로 좁히고,
 * 그 안에서만 세부업종·문제구조·전환방식을 점수화한다.
 *
 * Pool 우선순위
 *   1. 같은 업종 (industry 일치) — 기본
 *   2. 같은 업종이 하나도 없을 때만 인접업종 (아주 좁게 정의, 제조↔유통↔물류 정도)
 *   3. 업종이 '기타' 이면 세부업종·제품 키워드가 실제로 겹치는 사례만
 *
 * 규칙
 *   - 기본 추천은 최대 5개. 억지로 채우지 않는다. 0개면 "사례 없음" 이 정답이다.
 *   - 조달 규모 조합: 5개 중 10억 이내 사례를 3개 이상(있는 만큼), 수십억(20억 이상) 조달 사례는 최대 2개.
 *     Partner 가 만나는 회사는 5~30명이다. 수십억 조달 사례만 늘어서면 "우리 얘기가 아니다" 가 된다.
 *     이 조합은 같은 업종 Pool 안에서만 맞춘다 — 규모를 맞추려고 타업종을 끌어오지 않는다.
 *   - 인접업종·키워드로 고른 사례는 fallback 으로 분리해서 돌려주고, 화면에 그 사실을 표시한다.
 *   - reviewRequired(검수 전) 사례는 기본 추천에서 제외한다.
 *   - 점수는 내부 정렬용이며 화면에는 자연어 이유만 보여 준다.
 */
import type { CaseStudy, Company, Industry, QuestionArea } from '../types/domain'

/** PDF·음성 프로필에서 오는 추가 신호 (모두 선택) */
export interface ProfileSignals {
  subIndustry?: string | null
  /** 주요 제품·서비스 */
  keywords?: string[]
  revenueTrend?: 'up' | 'down' | 'flat' | null
  yearsInBusiness?: number | null
  certifications?: string[]
}

const STOP = new Set(['제조업', '제조', '서비스업', '서비스', '주식회사', '기타', '부품', '및', '등', '업', '기업', '회사', '전문', '일반', '관련', '사업', '기반'])

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

/**
 * 인접업종 — 아주 좁게. 예전 service → medical/food 매핑은 광고회사에 병원·외식 사례를 붙였기 때문에 지웠다.
 * 서비스·의료·외식·건설·환경은 인접업종 fallback 을 쓰지 않는다(업종 안에서 찾거나, 없으면 없다고 말한다).
 */
const NEAR_INDUSTRY: Record<Industry, Industry[]> = {
  manufacturing: ['distribution'],
  distribution: ['logistics', 'manufacturing'],
  logistics: ['distribution'],
  construction: [],
  environment: [],
  service: [],
  medical: [],
  food: [],
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
  /** 이 사례가 어떤 이유로 뽑혔나 */
  kind: MatchKind
  kindLabel: string
}

export type MatchKind = 'sub_industry' | 'industry' | 'near'
export const MATCH_KIND_LABEL: Record<MatchKind, string> = {
  sub_industry: '같은 업종 · 세부분야도 비슷',
  industry: '같은 업종',
  near: '업무구조 참고 사례',
}

export interface MatchOptions {
  growthAnswer?: string | null
  fundingInterest?: boolean
  areaLabel: (a: QuestionArea) => string
  /** 마스터 검수 화면 등에서 needs_review 사례까지 포함 */
  includeReviewRequired?: boolean
  /** PDF·음성 프로필 신호 */
  profile?: ProfileSignals
  /** 거래처 접점 화면이 필요한 구조(B2B + 견적·주문/거래처 관리 문제) */
  customerTouchpoint?: boolean
  /** 기본 추천 개수 (기본 5) */
  limit?: number
}

/** 조달 규모 구간 — 카드 배지와 추천 조합에 같이 쓴다 */
export type FundingScale = 'small' | 'mid' | 'large' | 'undisclosed'
export const FUNDING_SCALE_LABEL: Record<FundingScale, string> = { small: '10억 이내', mid: '10~20억', large: '수십억 조달', undisclosed: '규모 미공개' }
export function fundingScale(c: CaseStudy): FundingScale {
  const v = c.fundingAmountDisclosed
  if (v === null || v === undefined) return 'undisclosed'
  if (v < 1_000_000_000) return 'small'
  if (v < 2_000_000_000) return 'mid'
  return 'large'
}
/** 기본 추천 5개의 규모 조합 */
export const PICK_LIMIT = 5
export const SMALL_MIN = 3
export const LARGE_MAX = 2

export interface CaseRecommendation {
  /** 기본 추천 — 동종업계 안에서만, 최대 5개(10억 이내 ≥3 · 수십억 ≤2, 있는 만큼). 없으면 빈 배열 */
  picks: CaseMatch[]
  /** 동종업계 사례가 하나도 없을 때만 1개. 화면에 "동종업계 사례가 없어…" 를 반드시 표시한다 */
  fallback: CaseMatch | null
  /** 같은 Pool 안의 나머지 (사례 탐색 화면용) */
  others: CaseMatch[]
  /** 어떤 Pool 로 골랐는가 */
  pool: 'industry' | 'near' | 'keyword' | 'none'
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

/** 회사 쪽 세부업종 키워드 — 업종 메모·프로필 세부업종·제품 */
export function companyKeywords(company: Company, profile?: ProfileSignals): string[] {
  return tokens(company.industryNote, profile?.subIndustry, ...(profile?.keywords ?? []))
}

/** 사례 쪽 세부업종 키워드 */
export function caseKeywords(c: CaseStudy): string[] {
  return tokens(c.subIndustry, c.oneLiner, c.researchSection, ...(c.keywords ?? []))
}

/** 세부업종 겹침 — 두 글자 이상 토큰이 서로 포함관계면 일치로 본다 */
export function keywordHits(mine: string[], theirs: string[]): string[] {
  return mine.filter((t) => theirs.some((u) => u === t || u.includes(t) || t.includes(u)))
}

/** 추천에 올릴 수 있는 사례인가 (검수·전환 서술) */
function eligible(c: CaseStudy, opts: MatchOptions): boolean {
  if (c.verificationStatus === 'draft') return false
  if (!opts.includeReviewRequired && (c.reviewRequired || c.verificationStatus !== 'verified')) return false
  // AX 전환 서술이 없는 자금·선정 레퍼런스는 "실제 사례" 로 보여 줄 내용이 없다
  const thin = !c.axTransition && !c.internalAx && !c.aiFunction && !c.customerPortal
  if (thin && !opts.fundingInterest) return false
  return true
}

/** Pool 안에서의 점수 — 업종은 이미 필터로 걸렀으므로 세부업종·문제구조·전환방식만 본다 */
export function scoreCase(c: CaseStudy, company: Company, painAreas: QuestionArea[], opts: MatchOptions): CaseMatch {
  let score = 0
  const reasons: string[] = []
  const differences: string[] = []
  const sameIndustry = c.industry === company.industry

  // 1) 세부업종·제품 키워드 (Pool 안에서 가장 큰 가중치)
  const mine = companyKeywords(company, opts.profile)
  const hits = keywordHits(mine, caseKeywords(c))
  if (hits.length) {
    score += Math.min(6, hits.length * 3)
    reasons.push(`세부분야 비슷 (${hits.slice(0, 2).join('·')})`)
  }

  // 2) 같은 업종
  if (sameIndustry) {
    score += 3
    reasons.push('같은 업종')
  } else {
    differences.push('업종이 다릅니다 — 업무구조만 참고하세요')
  }

  // 3) 문제 구조
  const ov = overlap(painAreas, c.problemAreas)
  score += ov.length * 2
  if (ov.length) reasons.push(`같은 문제 구조 (${ov.map(opts.areaLabel).join('·')})`)

  // 4) 거래형태
  if (company.tradeType !== 'unknown') {
    if (c.businessModel === company.tradeType || c.businessModel === 'both' || company.tradeType === 'both') {
      score += 1
      reasons.push('거래형태 비슷')
    } else {
      differences.push(c.businessModel === 'b2c' ? '소비자 대상(B2C) 사례입니다' : '기업 대상(B2B) 사례입니다')
    }
  }

  // 5) 전환 방식 — 관심사·접점 필요
  const wantsPortal = opts.customerTouchpoint || company.interests.includes('customer') || company.interests.includes('sales')
  const wantsInternal = company.interests.includes('efficiency')
  if (wantsPortal && (c.axPath === 'customer_portal' || c.axPath === 'hybrid')) {
    score += 1
    reasons.push('고객 접점을 바꾼 방식')
  } else if (wantsInternal && (c.axPath === 'internal_ax' || c.axPath === 'hybrid')) {
    score += 1
    reasons.push('내부 업무를 바꾼 방식')
  }

  // 6) 기업규모 ↔ 금액 구간 — 소규모 고객에게는 10억 미만 사례를 우선
  const rank = bandRank(c)
  if (SMALL_HEADCOUNT.has(company.headcount)) {
    if (rank === 0 || rank === 1) {
      score += 2
      reasons.push('10억 미만 현실적 규모')
    } else if (rank !== null && rank >= 3) {
      differences.push('20억 이상 큰 조달 — 방향만 참고하세요')
    }
  }

  // 7) 성장단계
  const g = growthOf(company, opts.growthAnswer ?? null, opts.profile)
  if (g && c.growthStage === g) {
    score += 1
    reasons.push(opts.profile?.revenueTrend === 'up' && !opts.growthAnswer ? '성장 추이 비슷' : '성장단계 비슷')
  }

  // 8) 자금 관심이 있을 때만 정책·보증·R&D 경로 가산
  const policyLike = c.fundingType === 'guarantee' || c.fundingType === 'policy_loan' || c.fundingType === 'gov_rnd' || c.fundingType === 'mixed' || c.fundingType === 'commercialization'
  if (opts.fundingInterest && policyLike) {
    score += 1
    reasons.push('정책·보증 자금 경로')
  } else if (c.fundingType === 'private_investment') {
    differences.push('민간투자 사례 — 정책자금과 경로가 다릅니다')
  }

  const kind: MatchKind = hits.length && sameIndustry ? 'sub_industry' : sameIndustry ? 'industry' : 'near'
  return { caseStudy: c, score, whySimilar: reasons.join(' · ') || '참고 사례', reasons, differences, kind, kindLabel: MATCH_KIND_LABEL[kind] }
}

/**
 * FILTER → SCORE.
 * 동종업계 사례가 있으면 타업종 사례는 기본 추천에 절대 올라오지 않는다.
 */
export function recommendCases(cases: CaseStudy[], company: Company, painAreas: QuestionArea[], opts: MatchOptions): CaseRecommendation {
  const limit = opts.limit ?? PICK_LIMIT
  const usable = cases.filter((c) => eligible(c, opts))

  // 1) 같은 업종 Pool
  let pool: CaseStudy[] = company.industry === 'other' ? [] : usable.filter((c) => c.industry === company.industry)
  let poolKind: CaseRecommendation['pool'] = pool.length ? 'industry' : 'none'

  // 2) 같은 업종이 없을 때만 — 인접업종(아주 좁음) 또는 키워드가 실제로 겹치는 사례
  if (!pool.length) {
    const near = NEAR_INDUSTRY[company.industry] ?? []
    const nearPool = near.length ? usable.filter((c) => near.includes(c.industry)) : []
    if (nearPool.length) {
      pool = nearPool
      poolKind = 'near'
    } else {
      const mine = companyKeywords(company, opts.profile)
      const keywordPool = mine.length ? usable.filter((c) => keywordHits(mine, caseKeywords(c)).length > 0) : []
      pool = keywordPool
      poolKind = keywordPool.length ? 'keyword' : 'none'
    }
  }

  const scored = pool
    .map((c) => scoreCase(c, company, painAreas, opts))
    .sort((a, b) => b.score - a.score || a.caseStudy.companyName.localeCompare(b.caseStudy.companyName, 'ko'))

  if (poolKind === 'industry') {
    const picks = composePicks(scored, limit)
    return { picks, fallback: null, others: scored.filter((m) => !picks.includes(m)), pool: 'industry' }
  }

  // 동종업계가 없을 때 — 최대 1개만, 그리고 화면에서 "동종업계 사례 없음" 을 반드시 말한다
  const fb = scored[0] ?? null
  if (fb) fb.kind = 'near'
  if (fb) fb.kindLabel = MATCH_KIND_LABEL.near
  return { picks: [], fallback: fb, others: scored.slice(1), pool: fb ? poolKind : 'none' }
}

/**
 * 점수순 목록에서 규모 조합을 맞춰 고른다.
 *   1) 10억 이내 사례를 점수순으로 SMALL_MIN 개까지 먼저 확보한다(있는 만큼 — 없으면 억지로 채우지 않는다)
 *   2) 남은 자리는 점수순으로 채우되 수십억(20억 이상) 사례는 LARGE_MAX 개까지만
 *   3) 화면 순서는 10억 이내를 앞으로, 그 안에서는 점수순
 *
 * (3) 은 처음에 "순서는 점수순" 이었는데, 화면이 5개 중 3개만 펼치게 되면서 바꿨다.
 * 먼저 보이는 3개에 10억 이내가 1개뿐이면 "5개 중 3개는 10억 이내" 라는 규칙이 화면에 없는 것과 같다.
 * 5~30명 회사 대표 앞에서는 "가장 비슷한 사례" 보다 "우리 규모 얘기" 가 먼저 와야 설득이 된다.
 */
export function composePicks(scored: CaseMatch[], limit = PICK_LIMIT): CaseMatch[] {
  const picked = new Set<CaseMatch>()
  for (const m of scored) {
    if (picked.size >= Math.min(SMALL_MIN, limit)) break
    if (fundingScale(m.caseStudy) === 'small') picked.add(m)
  }
  let large = 0
  for (const m of scored) {
    if (picked.size >= limit) break
    if (picked.has(m)) continue
    if (fundingScale(m.caseStudy) === 'large') {
      if (large >= LARGE_MAX) continue
      large++
    }
    picked.add(m)
  }
  // 점수순을 유지한 채 10억 이내를 앞으로 (stable) — 앞에서 3개만 펼쳐도 규칙이 보인다
  const chosen = scored.filter((m) => picked.has(m))
  return [...chosen.filter((m) => fundingScale(m.caseStudy) === 'small'), ...chosen.filter((m) => fundingScale(m.caseStudy) !== 'small')]
}

/** 화면에 뿌릴 사례 목록 (기본 추천 + fallback). 억지로 채우지 않는다 */
export function shownCases(rec: CaseRecommendation): CaseMatch[] {
  return rec.picks.length ? rec.picks : rec.fallback ? [rec.fallback] : []
}
