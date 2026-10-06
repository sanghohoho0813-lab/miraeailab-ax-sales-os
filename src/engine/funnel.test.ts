import { describe, expect, it } from 'vitest'
import { funnel, rate } from './funnel'
import type { Company, Handoff, Meeting } from '../types/domain'

const c = (id: string, over: Partial<Company> = {}) => ({ id, consultantId: 'u1', name: id, outcome: null, ...over }) as Company
const m = (companyId: string, status: Meeting['status']) => ({ id: `m-${companyId}-${status}`, companyId, status }) as Meeting
const h = (companyId: string, status: Handoff['status']) => ({ id: `h-${companyId}`, companyId, status }) as Handoff

describe('1차 미팅 → 계약 전환', () => {
  it('고객 단위로 센다 — 같은 고객의 미팅 두 번은 한 번', () => {
    const f = funnel([c('a'), c('b')], [m('a', 'analyzed'), m('a', 'submitted'), m('b', 'live')], [])
    expect(f.met).toBe(1)
  })

  it('요청은 철회 제외, 제안 준비완료 · 계약 · 보류 · 무산과 무산 사유(많은 순)', () => {
    const companies = [
      c('a', { outcome: { kind: 'won', at: 'x' } }),
      c('b', { outcome: { kind: 'lost', at: 'x', reason: 'budget' } }),
      c('d', { outcome: { kind: 'lost', at: 'x', reason: 'budget' } }),
      c('e', { outcome: { kind: 'lost', at: 'x', reason: 'timing' } }),
      c('f', { outcome: { kind: 'hold', at: 'x' } }),
      c('g'),
    ]
    const meetings = companies.map((x) => m(x.id, 'submitted'))
    const handoffs = [h('a', 'proposal_ready'), h('b', 'reviewing'), h('d', 'withdrawn'), h('e', 'submitted')]
    const f = funnel(companies, meetings, handoffs)
    expect(f).toMatchObject({ met: 6, requested: 3, ready: 1, won: 1, hold: 1, lost: 3 })
    expect(f.lostReasons).toEqual([
      { reason: 'budget', count: 2 },
      { reason: 'timing', count: 1 },
    ])
  })

  it('보관(목록에 없는) 고객의 미팅·요청은 세지 않는다', () => {
    const f = funnel([c('a')], [m('a', 'analyzed'), m('gone', 'analyzed')], [h('gone', 'proposal_ready')])
    expect(f.met).toBe(1)
    expect(f.ready).toBe(0)
  })

  it('비율은 1차 미팅 마무리 대비, 분모 0 이면 0', () => {
    expect(rate(1, 4)).toBe(25)
    expect(rate(3, 0)).toBe(0)
  })
})
