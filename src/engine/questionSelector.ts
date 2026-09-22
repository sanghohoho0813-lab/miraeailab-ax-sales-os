/**
 * 질문 선택 — 모든 업체에 같은 20문항을 던지지 않는다.
 * 업종·거래형태·관심사·사전진단에 따라 5~10개를 고른다.
 * 정책자금 질문은 대표가 관심을 보인 경우에만 넣는다(먼저 꺼내지 않는다).
 */
import type { Company, Question } from '../types/domain'
import { QUESTIONS } from '../content/questions'

const CORE: string[] = ['ceo_dependency', 'repetitive_work', 'info_scatter', 'current_system', 'internal_owner']
const MAX = 10
const MIN = 5

export function selectQuestions(company: Company): Question[] {
  const picked = new Map<string, Question>()
  const byId = new Map(QUESTIONS.map((q) => [q.id, q]))
  const add = (id: string) => {
    const q = byId.get(id)
    if (q && !picked.has(id)) picked.set(id, q)
  }

  // 1) 핵심 5개
  CORE.forEach(add)

  // 2) 업종 특화 (최대 2개)
  QUESTIONS.filter((q) => q.industries?.includes(company.industry) && !CORE.includes(q.id) && q.id !== 'quote_order')
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 2)
    .forEach((q) => add(q.id))

  // 3) 거래형태·관심사에 따른 접점 질문
  const b2b = company.tradeType === 'b2b' || company.tradeType === 'both' || company.tradeType === 'unknown'
  if (b2b) add('quote_order')
  add('customer_mgmt')
  if (company.interests.includes('sales') || company.interests.includes('customer') || company.tradeType === 'b2c' || company.tradeType === 'both') add('repurchase')

  // 4) 성장·채용
  add('hiring_burden')
  add('growth_plan')

  // 5) 데이터 — 효율 관심 또는 11명 이상
  if (company.interests.includes('efficiency') || company.headcount === '11-20' || company.headcount === '21-30' || company.headcount === '30+') add('data_potential')

  // 6) 자금 — 대표가 관심을 보인 경우에만
  if (company.interests.some((i) => i === 'policy_fund' || i === 'gov_support' || i === 'rnd' || i === 'venture')) add('funding_interest')

  // 7) 상한 — 겹치는 접점 질문부터 뺀다 (핵심·업종 특화·대표가 관심을 보인 자금 질문은 보호)
  let list = [...picked.values()].sort((a, b) => a.priority - b.priority)
  if (list.length > MAX) {
    const protectedIds = new Set([...CORE, ...list.filter((q) => q.industries?.includes(company.industry)).map((q) => q.id), ...(picked.has('funding_interest') ? ['funding_interest'] : [])])
    const dropOrder = ['data_potential', picked.has('quote_order') ? 'customer_mgmt' : 'repurchase', 'repurchase', 'hiring_burden', 'growth_plan', 'customer_mgmt', 'quote_order']
    for (const id of dropOrder) {
      if (list.length <= MAX) break
      if (protectedIds.has(id)) continue
      list = list.filter((q) => q.id !== id)
    }
  }
  if (list.length < MIN) {
    QUESTIONS.filter((q) => !picked.has(q.id) && !q.industries).sort((a, b) => a.priority - b.priority).slice(0, MIN - list.length).forEach((q) => list.push(q))
  }
  return list.sort((a, b) => a.priority - b.priority)
}
