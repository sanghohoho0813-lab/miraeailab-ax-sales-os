/**
 * 1차 미팅 → 계약 전환 — 마스터가 "어디서 줄어드는가" 를 보는 숫자.
 *
 * 고객(회사) 단위로 센다. 한 고객과 미팅을 두 번 했다고 두 번 세지 않는다.
 * 단계는 엄격한 포함 관계가 아니다(제안 없이 바로 계약한 고객도 계약에 센다) — 비율은 모두 "1차 미팅 마무리" 대비다.
 * 파트너별로 나누지 않는다 — 사용 데이터 화면의 원칙(개별 평가가 아니라 설명·제안을 고치는 자료)을 지킨다.
 */
import type { Company, Handoff, LostReason, Meeting } from '../types/domain'

export interface Funnel {
  /** 1차 미팅을 마무리(분석 완료 이상)한 고객 */
  met: number
  /** 2차 제안 요청을 보낸 고객 (철회 제외) */
  requested: number
  /** 2차 제안이 준비된 고객 */
  ready: number
  won: number
  hold: number
  lost: number
  /** 무산 사유 — 많은 순 */
  lostReasons: { reason: LostReason; count: number }[]
}

export function funnel(companies: Company[], meetings: Meeting[], handoffs: Handoff[]): Funnel {
  const ids = new Set(companies.map((c) => c.id))
  const met = new Set(meetings.filter((m) => ids.has(m.companyId) && (m.status === 'analyzed' || m.status === 'submitted')).map((m) => m.companyId))
  const requested = new Set(handoffs.filter((h) => ids.has(h.companyId) && h.status !== 'withdrawn' && h.status !== 'draft').map((h) => h.companyId))
  const ready = new Set(handoffs.filter((h) => ids.has(h.companyId) && h.status === 'proposal_ready').map((h) => h.companyId))
  const kinds = { won: 0, hold: 0, lost: 0 }
  const reasons = new Map<LostReason, number>()
  for (const c of companies) {
    const o = c.outcome
    if (!o) continue
    kinds[o.kind] += 1
    if (o.kind === 'lost' && o.reason) reasons.set(o.reason, (reasons.get(o.reason) ?? 0) + 1)
  }
  return {
    met: met.size,
    requested: requested.size,
    ready: ready.size,
    ...kinds,
    lostReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  }
}

/** 1차 미팅 마무리 대비 비율(%) — 분모가 0 이면 0 */
export function rate(n: number, of: number): number {
  return of ? Math.round((n / of) * 100) : 0
}
