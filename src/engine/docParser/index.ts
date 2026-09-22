/**
 * 문서 파서 진입점 — TextDoc(줄 단위) → ParsedDocument(facts + 근거 + 경고).
 * 순서: 텍스트 레이어 → 라벨/표 규칙 → (선택) AI 보강 어댑터. OCR 은 텍스트가 전혀 없을 때만 별도 fallback 이며 이 모듈에 없다.
 * 결정적(deterministic) — 같은 문서면 같은 결과. 유료 AI 없이도 전부 동작한다.
 */
import type { CreateCompanyInput, Headcount, Industry, Interest, ProfileFacts, TradeType } from '../../types/domain'
import { docKindOf, pickAdapter } from './adapters'
import { extractFacts } from './rules'
import type { ParsedDocument, TextDoc } from './types'

export type { ParsedDocument, TextDoc, TextPage } from './types'

/** 페이지당 평균 글자 수가 이보다 적으면 텍스트 레이어가 없는(스캔) 문서로 본다 */
export const MIN_CHARS_PER_PAGE = 40

export function hasUsableText(doc: TextDoc): boolean {
  if (doc.pageCount === 0) return false
  return doc.textChars / doc.pageCount >= MIN_CHARS_PER_PAGE || doc.textChars >= 400
}

export function parseCompanyDocument(doc: TextDoc): ParsedDocument {
  const adapter = pickAdapter(doc)
  const { facts, evidence, warnings } = extractFacts(doc, adapter.aliases ?? {})
  if (!hasUsableText(doc)) warnings.unshift('텍스트 레이어가 거의 없습니다 (스캔 문서일 수 있음). 읽은 값이 적으면 직접 30초 등록을 권합니다.')
  if (adapter.id === 'cretop') warnings.push('크레탑 전용 규칙은 실제 샘플로 검증되기 전이라 일반 규칙과 같은 방식으로 읽었습니다. 값을 확인해 주세요.')
  return { adapter: adapter.id, version: adapter.version, docKind: docKindOf(doc, adapter), facts, evidence, warnings, textChars: doc.textChars }
}

/** facts → 등록 폼 초안 (모르면 unknown — 자동 확정하지 않는다) */
export function factsToCompanyDraft(facts: ProfileFacts): Pick<CreateCompanyInput, 'name' | 'industry' | 'industryNote' | 'headcount' | 'tradeType' | 'interests' | 'representativeName' | 'phone'> {
  const industry: Industry = facts.industry ?? 'other'
  const headcount: Headcount | 'unknown' = facts.headcountBand ?? 'unknown'
  const tradeType: TradeType | 'unknown' = facts.tradeType ?? 'unknown'
  const interests: Interest[] = []
  if (facts.certifications.some((c) => /연구소|전담부서/.test(c))) interests.push('rnd')
  if (facts.certifications.some((c) => /벤처/.test(c))) interests.push('venture')
  return {
    name: facts.companyName ?? '',
    industry,
    industryNote: industry === 'other' && facts.industryText ? facts.industryText : '',
    headcount,
    tradeType,
    interests,
    representativeName: facts.representativeName ?? '',
    phone: facts.phone ?? '',
  }
}
