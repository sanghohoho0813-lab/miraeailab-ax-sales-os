import { describe, expect, it } from 'vitest'
import { asViewer, byUrgency, filterOf, isStuck, latestMeetings, matchCompany, ownerOf, pendingRequests, sortItems, todoItems, workItem, workItems } from './workStatus'
import type { Company, Handoff, Meeting } from '../types/domain'

const NOW = new Date(2026, 9, 6, 10, 0) // 2026-10-06 10:00
const iso = (y: number, mo: number, d: number, h = 9) => new Date(y, mo - 1, d, h).toISOString()

function company(over: Partial<Company> = {}): Company {
  return { id: 'c1', consultantId: 'u1', name: 'ABC산업', industry: 'manufacturing', industryNote: '', headcount: '11-20', tradeType: 'b2b', interests: [], representativeName: '', phone: '', meetingAt: null, diagnosis: null, memo: '', archivedAt: null, createdAt: iso(2026, 9, 1), updatedAt: iso(2026, 9, 1), ...over }
}
function meeting(over: Partial<Meeting> = {}): Meeting {
  return { id: 'm1', companyId: 'c1', consultantId: 'u1', status: 'live', questionIds: [], answers: {}, keyQuote: '', memo: '', startedAt: iso(2026, 10, 1), endedAt: null, analysis: null, handoffId: null, createdAt: iso(2026, 10, 1), updatedAt: iso(2026, 10, 1), ...over } as Meeting
}
function handoff(over: Partial<Handoff> = {}): Handoff {
  return { id: 'h1', meetingId: 'm1', companyId: 'c1', consultantId: 'u1', status: 'submitted', payload: {} as Handoff['payload'], customerEventId: null, operationsClientId: null, submittedAt: iso(2026, 10, 2), receivedAt: null, createdAt: iso(2026, 10, 2), updatedAt: iso(2026, 10, 2), ...over }
}

describe('업무 상태 — 고객마다 다음 행동 하나', () => {
  it('진행 중인 미팅은 이어서 진행이 다음 행동이고 가장 급하다', () => {
    const w = workItem(company(), meeting({ status: 'live' }), null, NOW)
    expect(w.stage).toBe('live')
    expect(w.next).toEqual({ to: '/meetings/m1/live', label: '이어서 진행' })
    expect(w.todo).toBe(true)
    expect(w.rank).toBe(0)
  })

  it('시작만 하고 나간 미팅(draft)도 이어서 진행이다', () => {
    expect(workItem(company(), meeting({ status: 'draft' }), null, NOW).stage).toBe('live')
  })

  it('분석이 끝났으면 다음 행동은 새 미팅이 아니라 2차 제안 요청이다', () => {
    const w = workItem(company(), meeting({ status: 'analyzed', endedAt: iso(2026, 10, 3) }), null, NOW)
    expect(w.stage).toBe('analyzed')
    expect(w.next).toEqual({ to: '/meetings/m1/result', label: '2차 제안 요청' })
    expect(w.todo).toBe(true)
  })

  it('철회한 요청은 다시 보낼 일로 잡힌다', () => {
    const w = workItem(company(), meeting({ status: 'analyzed' }), handoff({ status: 'withdrawn' }), NOW)
    expect(w.stage).toBe('analyzed')
    expect(w.reason).toContain('다시 보내')
  })

  it('전달 후 검토 중이면 할 일이 아니다 — 상태만 보여 준다', () => {
    const w = workItem(company(), meeting({ status: 'submitted' }), handoff({ status: 'reviewing' }), NOW)
    expect(w.stage).toBe('submitted')
    expect(w.label).toBe('2차 제안 준비중')
    expect(w.todo).toBe(false)
    expect(w.next.to).toBe('/handoffs/h1')
  })

  it('2차 제안이 준비되면 다시 할 일이 된다 — 2차 미팅을 잡을 차례', () => {
    const w = workItem(company(), meeting({ status: 'submitted' }), handoff({ status: 'proposal_ready' }), NOW)
    expect(w.stage).toBe('proposal_ready')
    expect(w.todo).toBe(true)
    // 다음 행동은 "제안 확인" 이 아니라 2차 미팅 일정 — 고객 화면에서 일정 시트가 바로 열린다
    expect(w.next).toEqual({ to: '/companies/c1?schedule=1', label: '2차 미팅 일정 잡기' })
  })

  it('전달 뒤에 새 미팅 일정이 잡히면 그 일정이 다음 할 일이다', () => {
    const c = company({ meetingAt: iso(2026, 10, 6, 15) })
    const w = workItem(c, meeting({ status: 'submitted', endedAt: iso(2026, 10, 1) }), handoff({ status: 'proposal_ready' }), NOW)
    expect(w.stage).toBe('today')
  })

  it('일정이 지났는데 미팅 기록이 없으면 "날짜 미정" 이 아니라 지난 미팅이다', () => {
    const w = workItem(company({ meetingAt: iso(2026, 10, 2, 14) }), null, null, NOW)
    expect(w.stage).toBe('overdue')
    expect(w.reason).toContain('4일 전')
    expect(w.todo).toBe(true)
  })

  it('오늘·예정·미정을 나눈다', () => {
    expect(workItem(company({ meetingAt: iso(2026, 10, 6, 15) }), null, null, NOW).stage).toBe('today')
    // 오늘 아침에 잡혔던 미팅이 지났어도 오늘 안이면 아직 "오늘"
    expect(workItem(company({ meetingAt: iso(2026, 10, 6, 8) }), null, null, NOW).stage).toBe('today')
    expect(workItem(company({ meetingAt: iso(2026, 10, 7, 15) }), null, null, NOW).reason).toBe('내일 15:00 미팅')
    expect(workItem(company({ meetingAt: iso(2026, 10, 20) }), null, null, NOW).stage).toBe('upcoming')
    expect(workItem(company(), null, null, NOW).stage).toBe('prep')
  })

  it('취소된 미팅은 최신 미팅으로 보지 않는다', () => {
    const m = latestMeetings([meeting({ id: 'a', status: 'analyzed', updatedAt: iso(2026, 10, 1) }), meeting({ id: 'b', status: 'cancelled', updatedAt: iso(2026, 10, 5) })])
    expect(m.get('c1')?.id).toBe('a')
  })

  it('최신 미팅은 목록 순서와 무관하게 갱신 시각으로 고른다', () => {
    const m = latestMeetings([meeting({ id: 'old', updatedAt: iso(2026, 9, 1) }), meeting({ id: 'new', updatedAt: iso(2026, 10, 5) }), meeting({ id: 'mid', updatedAt: iso(2026, 9, 20) })])
    expect(m.get('c1')?.id).toBe('new')
  })

  it('할 일 큐 — 진행 중 → 미전달 분석 → 제안 준비 → 지난 미팅 → 오늘 순, 예정·준비·검토 대기는 빠진다', () => {
    const cs = [
      company({ id: 'today', name: '오늘', meetingAt: iso(2026, 10, 6, 15) }),
      company({ id: 'up', name: '예정', meetingAt: iso(2026, 10, 20) }),
      company({ id: 'over', name: '지난', meetingAt: iso(2026, 10, 1) }),
      company({ id: 'ana', name: '분석' }),
      company({ id: 'live', name: '진행' }),
      company({ id: 'prep', name: '준비' }),
      company({ id: 'sub', name: '검토' }),
      company({ id: 'ready', name: '제안' }),
    ]
    const ms = [
      meeting({ id: 'm-ana', companyId: 'ana', status: 'analyzed' }),
      meeting({ id: 'm-live', companyId: 'live', status: 'live' }),
      meeting({ id: 'm-sub', companyId: 'sub', status: 'submitted' }),
      meeting({ id: 'm-ready', companyId: 'ready', status: 'submitted' }),
    ]
    const hs = [handoff({ id: 'h-sub', meetingId: 'm-sub', status: 'reviewing' }), handoff({ id: 'h-ready', meetingId: 'm-ready', status: 'proposal_ready' })]
    const q = todoItems(workItems(cs, ms, hs, NOW))
    expect(q.map((x) => x.company.name)).toEqual(['진행', '분석', '제안', '지난', '오늘'])
  })

  it('같은 단계 안에서는 오래 묵은 것이 먼저다', () => {
    const a = workItem(company({ id: 'a' }), meeting({ id: 'ma', companyId: 'a', status: 'analyzed', endedAt: iso(2026, 10, 4) }), null, NOW)
    const b = workItem(company({ id: 'b' }), meeting({ id: 'mb', companyId: 'b', status: 'analyzed', endedAt: iso(2026, 9, 28) }), null, NOW)
    expect([a, b].sort(byUrgency).map((x) => x.company.id)).toEqual(['b', 'a'])
  })

  it('보관된 요청은 무시한다', () => {
    const items = workItems([company()], [meeting({ status: 'submitted' })], [handoff({ status: 'proposal_ready', archivedAt: iso(2026, 10, 3) })], NOW)
    expect(items[0].stage).toBe('submitted')
    expect(items[0].handoff).toBeNull()
  })
})

describe('고객 찾기 — 기억하는 방식 그대로', () => {
  const c = company({ name: '에이비씨 산업', representativeName: '김철수', phone: '010-1234-5678', industryNote: '(10차) 자동차부품 제조업', memo: '박세무사 소개' })

  it('회사명은 띄어쓰기를 무시한다', () => {
    expect(matchCompany(c, '에이비씨산업')).toBe('name')
    expect(matchCompany(c, '비씨 산')).toBe('name')
  })
  it('대표자 이름으로 찾는다', () => expect(matchCompany(c, '김철수')).toBe('rep'))
  it('전화번호는 하이픈·공백을 무시하고 뒷자리로도 찾는다', () => {
    expect(matchCompany(c, '5678')).toBe('phone')
    expect(matchCompany(c, '1234 5678')).toBe('phone')
    expect(matchCompany(c, '010-1234')).toBe('phone')
  })
  it('두 자리 숫자로는 전화번호를 찾지 않는다 — 우연히 걸리는 것을 막는다', () => expect(matchCompany(c, '56')).toBeNull())
  it('업종 메모와 메모(소개 경로)로도 찾는다', () => {
    expect(matchCompany(c, '자동차')).toBe('industry')
    expect(matchCompany(c, '세무사')).toBe('memo')
  })
  it('없으면 null', () => expect(matchCompany(c, '없는회사')).toBeNull())
})

describe('고객 정렬', () => {
  const a = workItem(company({ id: 'a', name: '나라', meetingAt: iso(2026, 10, 20), updatedAt: iso(2026, 9, 1) }), null, null, NOW)
  const b = workItem(company({ id: 'b', name: '가나', meetingAt: null, updatedAt: iso(2026, 10, 5) }), null, null, NOW)
  const c = workItem(company({ id: 'c', name: '다라', meetingAt: iso(2026, 10, 8), updatedAt: iso(2026, 9, 2) }), meeting({ companyId: 'c', status: 'analyzed', updatedAt: iso(2026, 10, 6) }), null, NOW)

  it('최근 활동순 — 미팅을 진행한 것도 활동이다', () => expect(sortItems([a, b, c], 'recent').map((x) => x.company.id)).toEqual(['c', 'b', 'a']))
  it('미팅 일시순 — 가까운 날짜부터, 일정 없는 고객은 뒤로', () => expect(sortItems([a, b, c], 'meeting').map((x) => x.company.id)).toEqual(['c', 'a', 'b']))
  it('이름순 — 가나다', () => expect(sortItems([a, b, c], 'name').map((x) => x.company.name)).toEqual(['가나', '나라', '다라']))
  it('상태 묶음 — 할 일 / 예정·준비 / 전달 완료', () => {
    expect(filterOf(c)).toBe('todo')
    expect(filterOf(a)).toBe('planned')
    expect(filterOf(workItem(company(), meeting({ status: 'submitted' }), handoff(), NOW))).toBe('sent')
  })
})

describe('마스터 홈 — 누구의 일인가', () => {
  it('담당자는 재배정된 사람, 없으면 등록한 사람', () => {
    expect(ownerOf(company())).toBe('u1')
    expect(ownerOf(company({ assignedTo: 'u2' }))).toBe('u2')
    expect(ownerOf(company({ assignedTo: null }))).toBe('u1')
  })

  it('파트너의 방금 시작한 미팅·방금 끝난 분석은 멈춘 것이 아니다 — 하루가 넘어야 마스터에게 올라온다', () => {
    const fresh = workItem(company(), meeting({ status: 'live', updatedAt: iso(2026, 10, 6, 9) }), null, NOW)
    const stale = workItem(company(), meeting({ status: 'live', updatedAt: iso(2026, 10, 4, 9) }), null, NOW)
    const analyzedFresh = workItem(company(), meeting({ status: 'analyzed', endedAt: iso(2026, 10, 6, 8) }), null, NOW)
    const analyzedStale = workItem(company(), meeting({ status: 'analyzed', endedAt: iso(2026, 10, 3, 8) }), null, NOW)
    expect(isStuck(fresh, NOW)).toBe(false)
    expect(isStuck(stale, NOW)).toBe(true)
    expect(isStuck(analyzedFresh, NOW)).toBe(false)
    expect(isStuck(analyzedStale, NOW)).toBe(true)
  })

  it('지난 미팅은 바로 멈춘 것, 오늘·예정·전달 완료는 아니다', () => {
    expect(isStuck(workItem(company({ meetingAt: iso(2026, 10, 2, 14) }), null, null, NOW), NOW)).toBe(true)
    expect(isStuck(workItem(company({ meetingAt: iso(2026, 10, 6, 15) }), null, null, NOW), NOW)).toBe(false)
    expect(isStuck(workItem(company({ meetingAt: iso(2026, 10, 9, 15) }), null, null, NOW), NOW)).toBe(false)
    expect(isStuck(workItem(company(), meeting({ status: 'submitted' }), handoff({ status: 'reviewing' }), NOW), NOW)).toBe(false)
  })

  it('확인할 요청 — 전달됨·확인 중만, 오래된 것부터. 철회·보관·작성 중·준비완료는 뺀다', () => {
    const list = pendingRequests([
      handoff({ id: 'new2', status: 'submitted', submittedAt: iso(2026, 10, 5) }),
      handoff({ id: 'new1', status: 'submitted', submittedAt: iso(2026, 10, 3) }),
      handoff({ id: 'recv', status: 'received', submittedAt: iso(2026, 10, 4) }),
      handoff({ id: 'rev', status: 'reviewing' }),
      handoff({ id: 'ready', status: 'proposal_ready' }),
      handoff({ id: 'wd', status: 'withdrawn' }),
      handoff({ id: 'arc', status: 'submitted', archivedAt: iso(2026, 10, 5) }),
    ])
    expect(list.map((h) => h.id)).toEqual(['new1', 'recv', 'new2'])
  })

  it('남의 고객이면 다음 행동은 [고객 보기] — 파트너의 미팅을 목록에서 이어 쓰지 않는다', () => {
    const x = workItem(company({ consultantId: 'u2' }), meeting({ status: 'live' }), null, NOW)
    expect(asViewer(x, 'u2').next.label).toBe('이어서 진행')
    expect(asViewer(x, 'master').next).toEqual({ to: '/companies/c1', label: '고객 보기' })
    expect(asViewer(x, 'master').stage).toBe('live')
  })
})

describe('2차 미팅 · 딜 결과', () => {
  const sent = () => meeting({ status: 'submitted', endedAt: iso(2026, 10, 1), updatedAt: iso(2026, 10, 1) })

  it('2차 제안 요청 뒤에 잡힌 미팅은 2차 미팅 — 오늘이면 준비, 지나면 결과 기록이 할 일', () => {
    const today = workItem(company({ meetingAt: iso(2026, 10, 6, 15) }), sent(), handoff({ status: 'proposal_ready' }), NOW)
    expect(today.stage).toBe('today')
    expect(today.round2).toBe(true)
    expect(today.label).toBe('오늘 2차 미팅')
    expect(today.next.label).toBe('2차 미팅 준비')
    const past = workItem(company({ meetingAt: iso(2026, 10, 4, 15) }), sent(), handoff({ status: 'proposal_ready' }), NOW)
    expect(past.stage).toBe('overdue')
    expect(past.reason).toBe('2일 전 2차 미팅 결과가 기록되지 않았습니다')
    expect(past.next).toEqual({ to: '/companies/c1?outcome=1', label: '결과 기록' })
    // 1차 미팅은 2차가 아니다
    expect(workItem(company({ meetingAt: iso(2026, 10, 6, 15) }), null, null, NOW).round2).toBe(false)
  })

  it('계약·무산은 할 일이 아니고 "결과" 로 모인다', () => {
    const won = workItem(company({ outcome: { kind: 'won', at: iso(2026, 10, 5) } }), sent(), handoff({ status: 'proposal_ready' }), NOW)
    expect(won.stage).toBe('won')
    expect(won.reason).toBe('10.5 계약')
    expect(won.todo).toBe(false)
    expect(filterOf(won)).toBe('closed')
    const lost = workItem(company({ outcome: { kind: 'lost', at: iso(2026, 10, 5), reason: 'budget' } }), sent(), null, NOW)
    expect(lost.reason).toBe('10.5 무산 · 예산 부족')
  })

  it('1차 분석 뒤 대표가 거절했으면 — 무산을 기록하면 "2차 제안 요청" 할 일에서 빠진다', () => {
    const analyzed = meeting({ status: 'analyzed', endedAt: iso(2026, 10, 2), updatedAt: iso(2026, 10, 2) })
    expect(workItem(company(), analyzed, null, NOW).stage).toBe('analyzed')
    const x = workItem(company({ outcome: { kind: 'lost', at: iso(2026, 10, 3), reason: 'no_need' } }), analyzed, null, NOW)
    expect(x.stage).toBe('lost')
    expect(x.todo).toBe(false)
  })

  it('보류 — 재연락일 전에는 조용히, 그날이 되면 할 일 "연락하기"', () => {
    const later = workItem(company({ outcome: { kind: 'hold', at: iso(2026, 10, 1), followUpAt: iso(2026, 10, 20) } }), sent(), null, NOW)
    expect(later.stage).toBe('hold')
    expect(later.reason).toBe('10.20 재연락')
    expect(later.todo).toBe(false)
    expect(filterOf(later)).toBe('closed')
    const due = workItem(company({ outcome: { kind: 'hold', at: iso(2026, 10, 2), followUpAt: iso(2026, 10, 6, 8) } }), sent(), null, NOW)
    expect(due.stage).toBe('followup')
    expect(due.todo).toBe(true)
    expect(due.next.label).toBe('연락하기')
    expect(due.reason).toBe('보류 고객 — 오늘 다시 연락할 날입니다')
    const late = workItem(company({ outcome: { kind: 'hold', at: iso(2026, 10, 2), followUpAt: iso(2026, 10, 3) } }), sent(), null, NOW)
    expect(late.reason).toBe('보류 고객 — 3일 전에 다시 연락하기로 했습니다')
  })

  it('보류 뒤에 미팅을 다시 잡으면 그 일정이, 새 미팅을 시작하면 그 미팅이 다음 할 일이다', () => {
    const hold = { kind: 'hold' as const, at: iso(2026, 10, 2), followUpAt: iso(2026, 10, 20) }
    const scheduled = workItem(company({ outcome: hold, meetingAt: iso(2026, 10, 6, 15) }), sent(), null, NOW)
    expect(scheduled.stage).toBe('today')
    const restarted = workItem(company({ outcome: hold }), meeting({ status: 'live', updatedAt: iso(2026, 10, 5) }), null, NOW)
    expect(restarted.stage).toBe('live')
    // 계약 뒤에 잡힌 일정은 계약을 덮지 않는다 (계약은 계약이다)
    const won = workItem(company({ outcome: { kind: 'won', at: iso(2026, 10, 2) }, meetingAt: iso(2026, 10, 9, 10) }), sent(), null, NOW)
    expect(won.stage).toBe('won')
  })

  it('할 일 순서 — 오늘 미팅 다음이 재연락', () => {
    const items = [
      workItem(company({ id: 'f', outcome: { kind: 'hold', at: iso(2026, 9, 1), followUpAt: iso(2026, 10, 6, 8) } }), null, null, NOW),
      workItem(company({ id: 't', meetingAt: iso(2026, 10, 6, 15) }), null, null, NOW),
    ]
    expect(todoItems(items).map((x) => x.stage)).toEqual(['today', 'followup'])
  })
})
