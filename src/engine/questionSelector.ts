/**
 * 질문 선택 — 모든 업체에 같은 20문항을 던지지 않는다.
 * Core 4~5 + Adaptive 2~4, 최대 9개. 업종·거래형태·관심사·사전진단에 따라 고른다.
 * 정책자금 질문은 대표가 관심을 보인 경우에만 넣는다(먼저 꺼내지 않는다).
 * 홈페이지 3분 AX Fit 에서 이미 답한 항목은 LIVE 에서 다시 묻지 않고(prefilled) 분석에는 🟡 추정으로 들어간다.
 */
import type { Company, Question } from '../types/domain'
import { QUESTIONS } from '../content/questions'
import { prefillFromDiagnosis } from './diagnosis'

/**
 * Core 4 + Adaptive 최대 2 (필요하면 7번째까지). 보통 5~6개.
 *
 * 첫 아웃바운드 미팅에서 20문항을 던지지 않는다. 대표가 말을 이어가게 만드는 최소 질문만 남긴다.
 *   1. 대표 의존도
 *   2. 반복업무 / 정보분산 중 하나 (사전진단·업종으로 더 맞는 쪽)
 *   3. 고객·거래처 관리
 *   4. 현재 시스템(업무 빈틈)
 * Adaptive: 업종 특화 1개, 성장 시 추가채용 부담 1개.
 * 내부 담당자 질문은 구축 가능성이 보인 뒤에 물어도 늦지 않으므로 Core 에서 뺐다.
 * 정책자금 질문은 대표가 먼저 관심을 보인 경우에만 마지막에 붙인다.
 */
const CORE_FIXED = ['ceo_dependency', 'customer_mgmt', 'current_system']
const MAX = 7
const MIN = 5

export interface QuestionPlan {
  /** LIVE 에서 실제로 묻는 질문 */
  ask: Question[]
  /** 사전진단으로 이미 답이 있어 건너뛰는 질문 (분석에는 추정으로 포함) */
  prefilled: { question: Question; value: string; note: string }[]
  /** 미팅에 저장할 전체 질문 id (ask + prefilled, 우선순위 순) */
  all: Question[]
}

export function planQuestions(company: Company): QuestionPlan {
  const all = selectQuestions(company)
  const prefilled: QuestionPlan['prefilled'] = []
  const ask: Question[] = []
  for (const q of all) {
    const p = prefillFromDiagnosis(q, company.diagnosis)
    if (p) prefilled.push({ question: q, value: p.value, note: p.note })
    else ask.push(q)
  }
  return { ask, prefilled, all }
}

export function selectQuestions(company: Company): Question[] {
  const picked = new Map<string, Question>()
  const byId = new Map(QUESTIONS.map((q) => [q.id, q]))
  const add = (id: string) => {
    const q = byId.get(id)
    if (q && !picked.has(id)) picked.set(id, q)
  }

  // 1) Core 4 — 대표 의존도 · (반복업무|정보분산) · 고객관리 · 현재 시스템
  add('ceo_dependency')
  add(pickFlowQuestion(company))
  add('customer_mgmt')
  add('current_system')

  // 2) Adaptive 1 — 업종 특화 (있으면 하나만)
  const industryQ = QUESTIONS.filter((q) => q.industries?.includes(company.industry) && !picked.has(q.id) && q.id !== 'quote_order').sort((a, b) => a.priority - b.priority)[0]
  // B2B 는 견적·주문 흐름이 업종 특화보다 먼저다
  const b2b = company.tradeType === 'b2b' || company.tradeType === 'both'
  if (b2b) add('quote_order')
  else if (industryQ) add(industryQ.id)

  // 3) Adaptive 2 — 성장 시 추가채용 부담
  if (picked.size < MAX - 1) add('hiring_burden')

  // 4) 대표가 자금에 관심을 보인 경우에만 (먼저 꺼내지 않는다)
  if (company.interests.some((i) => i === 'policy_fund' || i === 'gov_support' || i === 'rnd' || i === 'venture') && picked.size < MAX) add('funding_interest')

  let list = [...picked.values()].sort((a, b) => a.priority - b.priority)

  // 5) 너무 적으면 채우고(최소 5), 너무 많으면 뒤에서 뺀다(최대 7)
  if (list.length < MIN) {
    for (const id of ['growth_plan', 'repurchase', 'data_potential', 'internal_owner']) {
      if (list.length >= MIN) break
      add(id)
      list = [...picked.values()].sort((a, b) => a.priority - b.priority)
    }
  }
  if (list.length > MAX) {
    const protectedIds = new Set([...CORE_FIXED, pickFlowQuestion(company)])
    for (const id of ['data_potential', 'repurchase', 'growth_plan', 'internal_owner', 'hiring_burden']) {
      if (list.length <= MAX) break
      if (protectedIds.has(id)) continue
      list = list.filter((q) => q.id !== id)
    }
    list = list.slice(0, MAX)
  }
  return list
}

/** 반복업무와 정보분산 중 이 회사에 더 맞는 쪽 하나 — 둘 다 묻지 않는다 */
export function pickFlowQuestion(company: Company): string {
  const a = company.diagnosis?.answers ?? {}
  const rank: Record<string, number> = { no: 0, sometimes: 1, often: 2, always: 3 }
  const repeat = rank[a.repeatInput ?? ''] ?? -1
  const scatter = Math.max(rank[a.toolGaps ?? ''] ?? -1, rank[a.priorityByMemory ?? ''] ?? -1)
  if (repeat >= 0 || scatter >= 0) return repeat >= scatter ? 'repetitive_work' : 'info_scatter'
  // 사전진단이 없으면 업종 기본값 — 제조·유통·물류는 반복 입력, 나머지는 정보 분산이 먼저 걸린다
  return company.industry === 'manufacturing' || company.industry === 'distribution' || company.industry === 'logistics' ? 'repetitive_work' : 'info_scatter'
}
