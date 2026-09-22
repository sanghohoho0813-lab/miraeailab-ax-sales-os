/**
 * 실제 사례 DB — 유일한 원천: "미래AI랩 AX·플랫폼 자금조달 사례 종합리서치 (2026.09.04)" PDF.
 *
 * 생성 경로: PDF 텍스트·링크 추출 → 표 구조 파싱(10억 미만 특별 인덱스 · 정책금융 섹션 · 금액대별 인덱스 · 업종별 전체 사례 · TIPS 선정 레퍼런스)
 *           → 정규화(research-cases.json) → 이 파일에서 CaseStudy 로 조립.
 * 원칙
 *   - 사례를 임의로 만들지 않는다. 모든 행은 PDF 의 기업명·자금형태·금액·연도·원문 링크를 가진다.
 *   - 실제 공개금액(fundingAmountDisclosed)과 제도상 최대한도(fundingProgramMax)를 반드시 분리한다.
 *   - 파싱이 애매하거나 실제 수령액이 미공개인 행은 reviewRequired = true(needs_review) 로 두고 기본 추천에서 제외한다.
 *   - 기존 컨설팅 고객사(비원미래·정통대왕쑥뜸원·KPJK·태강지엘텍·하나인사이트·선진산업)는 포함하지 않는다.
 *   - 영업 설명·주의 문장은 사실 필드에서만 조립한다(caseText.ts).
 */
import type { CaseStudy } from '../types/domain'
import raw from './research-cases.json'
import { caseCaveats, caseTalkingPoints } from './caseText'

const T = '2026-09-22T00:00:00.000Z'

export { CASE_DISCLAIMER } from './caseText'

export const RESEARCH_SOURCE = {
  title: '미래AI랩 AX·플랫폼 자금조달 사례 종합리서치',
  edition: '50대 가독성 강화 · 중진공 AX 정책 업데이트 · 최종 2026.09.04',
  parsedAt: '2026-09-22',
}

type RawCase = Omit<CaseStudy, 'talkingPoints' | 'caveats' | 'updatedAt'>

export const CASE_SEED: CaseStudy[] = (raw as unknown as RawCase[]).map((r) => {
  const base = { ...r, talkingPoints: [] as string[], caveats: [] as string[], updatedAt: T } as CaseStudy
  base.talkingPoints = caseTalkingPoints(base)
  base.caveats = caseCaveats(base)
  return base
})

export const CASE_STATS = {
  total: CASE_SEED.length,
  verified: CASE_SEED.filter((c) => c.verificationStatus === 'verified').length,
  reviewRequired: CASE_SEED.filter((c) => c.reviewRequired).length,
  under10: CASE_SEED.filter((c) => c.fundingAmountDisclosed !== null && c.fundingAmountDisclosed < 1_000_000_000).length,
  under10Verified: CASE_SEED.filter((c) => c.verificationStatus === 'verified' && c.fundingAmountDisclosed !== null && c.fundingAmountDisclosed < 1_000_000_000).length,
  newlyVerified: CASE_SEED.filter((c) => c.newlyVerified).length,
}
