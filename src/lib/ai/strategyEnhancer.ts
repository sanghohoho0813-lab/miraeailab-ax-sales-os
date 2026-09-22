/**
 * AI 보강 어댑터 — 선택 기능. 핵심 전략(strategy.ts)은 결정적 규칙으로 이미 완성돼 있고,
 * 이 어댑터는 문장을 다듬는 역할만 한다. 없어도, 실패해도 제품은 그대로 동작한다(Fail Soft).
 *
 * 보안·비용 원칙
 *   - 브라우저에 AI API Secret 을 두지 않는다. VITE_* 에는 "서버 엔드포인트 URL" 만 둔다 (VITE_AI_ENHANCER_URL).
 *   - 서버(Supabase Edge Function 또는 기존 백엔드)가 로그인 토큰을 검증하고 Provider 를 호출한다.
 *   - 입력은 구조화된 사실(confirmed/assumed/unknown 구분 유지) + 선택된 사례 + 승인된 플레이북 문장뿐이다. 임의 사실 생성 금지.
 *   - 같은 입력(해시)이면 다시 부르지 않는다 — 결과는 기기에 캐시된다. 정보가 바뀌어 해시가 달라질 때만 [전략 다시 생성].
 */
import type { Strategy } from '../../engine/strategy'

export interface GroundedStrategyInput {
  hash: string
  company: { name: string; industry: string; headcount: string; tradeType: string; interests: string[] }
  /** 확인/추정/미확인 구분이 붙은 사실 */
  facts: { label: string; value: string; status: 'confirmed' | 'assumed' | 'unknown' }[]
  hypotheses: { text: string; basis: string; question: string }[]
  focus: string[]
  cases: { companyName: string; industry: string; problem: string; whySimilar: string }[]
  /** 승인된 플레이북 문장 — 이 범위 안에서만 다듬는다 */
  approvedScripts: { key: string; say: string; next: string }[]
  forbidden: string[]
}

export interface EnhancedText {
  approach?: string
  scripts?: { key: string; say: string; next: string }[]
  generatedAt: string
  model?: string
}

export interface StrategyEnhancer {
  readonly id: string
  readonly available: boolean
  enhance(input: GroundedStrategyInput): Promise<EnhancedText | null>
}

const CACHE_KEY = 'axpartner.ai.strategy'

function readCache(): Record<string, EnhancedText> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, EnhancedText>
  } catch {
    return {}
  }
}
function writeCache(v: Record<string, EnhancedText>): void {
  try {
    const keys = Object.keys(v)
    const trimmed = keys.length > 50 ? Object.fromEntries(keys.slice(-50).map((k) => [k, v[k]])) : v
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed))
  } catch {
    /* ignore */
  }
}

/** 기본 — AI 없음. 항상 null (결정적 전략만 사용) */
export const noopEnhancer: StrategyEnhancer = { id: 'none', available: false, enhance: async () => null }

/** 서버 엔드포인트 호출 — 토큰은 호출 측이 넣는다 (Supabase 세션). 해시 캐시. */
export function createHttpEnhancer(url: string, getToken: () => Promise<string | null>): StrategyEnhancer {
  return {
    id: 'http',
    available: true,
    async enhance(input) {
      const cache = readCache()
      if (cache[input.hash]) return cache[input.hash]
      try {
        const token = await getToken()
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(input),
        })
        if (!res.ok) return null
        const data = (await res.json()) as EnhancedText
        if (!data || typeof data !== 'object') return null
        const out: EnhancedText = { ...data, generatedAt: data.generatedAt ?? new Date().toISOString() }
        writeCache({ ...cache, [input.hash]: out })
        return out
      } catch {
        return null
      }
    },
  }
}

export function createEnhancer(getToken: () => Promise<string | null>): StrategyEnhancer {
  const url = (import.meta.env.VITE_AI_ENHANCER_URL as string | undefined)?.trim()
  if (!url) return noopEnhancer
  return createHttpEnhancer(url, getToken)
}

/** 전략 → 근거 있는 입력만 추린다 (내부 메모·원문 스니펫은 보내지 않는다) */
export function groundedInput(strategy: Strategy, company: { name: string; industry: string; headcount: string; tradeType: string; interests: string[] }, hash: string): GroundedStrategyInput {
  return {
    hash,
    company,
    facts: strategy.sources.map((s) => ({ label: s.label, value: s.value, status: s.status })),
    hypotheses: strategy.hypotheses.map((h) => ({ text: h.text, basis: h.basis, question: h.question })),
    focus: strategy.focus.map((f) => f.title),
    cases: strategy.cases.map((c) => ({ companyName: c.caseStudy.companyName, industry: c.caseStudy.industry, problem: c.caseStudy.problem, whySimilar: c.whySimilar })),
    approvedScripts: strategy.scripts.map((s) => ({ key: s.key, say: s.say, next: s.next })),
    forbidden: strategy.forbidden,
  }
}
