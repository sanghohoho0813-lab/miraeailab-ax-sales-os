/**
 * 업무 상태 — 고객 한 곳마다 "지금 어느 단계이고, 다음에 무엇을 하면 되는가" 를 한 번에 계산한다.
 *
 * 왜 따로 두나: 홈·고객·미팅·전략 화면이 같은 질문("이 고객 다음에 뭐 하지?")에 제각각 답하고 있었다.
 * 그 결과 분석까지 끝난 고객을 다시 열면 주 버튼이 "미팅 시작" 이라, 2차 제안 요청 대신 새 미팅이 생겼다.
 * 판단을 한 곳에 모으면 어느 화면에서 보든 같은 다음 행동이 나온다.
 *
 * 우선순위(작을수록 급함) — 돈과 신뢰에 가까운 것부터
 *   0 진행 중        중단된 미팅. 기억이 흐려지기 전에 마무리해야 한다
 *   1 분석 완료      2차 제안 요청을 아직 안 보냈다 (철회 후 다시 보낼 것도 여기)
 *   2 제안 준비완료  김상호 대표가 2차 제안을 준비했다 — 2차 미팅을 잡을 차례
 *   3 지난 미팅      일정이 지났는데 기록이 없다 (했는데 안 남겼거나, 미뤄졌거나)
 *   4 오늘 미팅
 *   5 재연락        보류한 고객의 다시 연락할 날이 됐다
 *   ── 여기까지가 "지금 할 일" ──
 *   6 예정 · 7 준비(일정 미정) · 8 전달 완료(검토 대기) · 9 보류 · 10 계약 · 11 무산
 *
 * 2차 미팅 — 2차 제안 요청을 보낸 뒤에 잡힌 미팅. 이때 할 일은 1차 질문을 다시 돌리는 것이 아니라 **결과 기록**이다.
 * 딜 결과(company.outcome) — 계약 · 보류 · 무산. 결과를 기록한 뒤에 새 미팅이 생기면 그쪽이 다음 할 일이다.
 */
import type { Company, Handoff, Meeting } from '../types/domain'
import { HANDOFF_STATUS_LABEL, LOST_REASON_LABEL } from '../content/labels'

export type Stage = 'live' | 'analyzed' | 'proposal_ready' | 'overdue' | 'today' | 'followup' | 'upcoming' | 'prep' | 'submitted' | 'hold' | 'won' | 'lost'
export type Tone = 'neutral' | 'accent' | 'ok' | 'info' | 'warn'

export interface WorkItem {
  company: Company
  /** 가장 최근 미팅 (취소된 것은 제외) */
  meeting: Meeting | null
  /** 그 미팅의 2차 제안 요청 */
  handoff: Handoff | null
  stage: Stage
  /** 상태 배지 */
  label: string
  tone: Tone
  /** 왜 지금 이 행동인가 — 한 줄 */
  reason: string
  /** 다음 행동 하나 */
  next: { to: string; label: string }
  /** "지금 할 일" 인가 */
  todo: boolean
  rank: number
  /** 정렬 기준 시각 (미팅 일시 또는 마지막 활동) */
  at: string | null
  /** 2차 제안 요청 뒤에 잡힌 미팅인가 — 이때 할 일은 결과 기록이다 */
  round2: boolean
}

const STAGE_RANK: Record<Stage, number> = { live: 0, analyzed: 1, proposal_ready: 2, overdue: 3, today: 4, followup: 5, upcoming: 6, prep: 7, submitted: 8, hold: 9, won: 10, lost: 11 }
export const STAGE_LABEL: Record<Stage, string> = {
  live: '미팅 중',
  analyzed: '분석 완료',
  proposal_ready: '제안 준비완료',
  overdue: '지난 미팅',
  today: '오늘 미팅',
  followup: '재연락',
  upcoming: '예정',
  prep: '준비',
  submitted: '전달 완료',
  hold: '보류',
  won: '계약',
  lost: '무산',
}
const STAGE_TONE: Record<Stage, Tone> = { live: 'accent', analyzed: 'info', proposal_ready: 'ok', overdue: 'warn', today: 'accent', followup: 'warn', upcoming: 'neutral', prep: 'neutral', submitted: 'ok', hold: 'neutral', won: 'ok', lost: 'neutral' }

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
function daysBetween(iso: string, now: Date): number {
  return Math.round((startOfDay(new Date(iso)) - startOfDay(now)) / 86_400_000)
}
function md(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}.${d.getDate()}`
}
function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 고객별 최신 미팅 (취소 제외). 목록은 어떤 순서로 와도 된다 */
export function latestMeetings(meetings: Meeting[]): Map<string, Meeting> {
  const out = new Map<string, Meeting>()
  for (const m of meetings) {
    if (m.status === 'cancelled') continue
    const cur = out.get(m.companyId)
    if (!cur || m.updatedAt > cur.updatedAt) out.set(m.companyId, m)
  }
  return out
}

export function workItem(company: Company, meeting: Meeting | null, handoff: Handoff | null, now = new Date()): WorkItem {
  const id = company.id
  const strategy = `/companies/${id}`
  let stage: Stage
  let label: string | null = null
  let reason = ''
  let next = { to: strategy, label: '전략 보기' }
  let at: string | null = company.meetingAt
  let round2 = false

  // 결과(계약·보류·무산)는 그 뒤에 미팅 활동이 없을 때만 다음 할 일을 정한다 — 결과 뒤에 새 미팅을 했으면 그쪽이 먼저다
  const o = company.outcome ?? null
  const outcomeRules = Boolean(o) && !(meeting && o && meeting.updatedAt > o.at)
  // 보류 뒤에 미팅 일정을 다시 잡았으면 그 일정이 다음 할 일이다
  const holdScheduled = Boolean(o && o.kind === 'hold' && company.meetingAt && company.meetingAt > o.at)
  // 전달 뒤에 새 미팅 일정이 잡혔으면 그 일정이 다음 할 일이다 (2차 미팅)
  const scheduledAfter = Boolean(meeting && company.meetingAt && meeting.status === 'submitted' && company.meetingAt > (meeting.endedAt ?? meeting.updatedAt))

  /** 일정 기준 단계 — 지난 · 오늘 · 예정 (2차 미팅이면 결과 기록으로 이어진다) */
  const byDate = (meetingAt: string, second: boolean) => {
    round2 = second
    const d = daysBetween(meetingAt, now)
    const what = second ? '2차 미팅' : '미팅'
    if (d < 0) {
      stage = 'overdue'
      if (second) {
        label = '지난 2차 미팅'
        reason = `${-d}일 전 2차 미팅 결과가 기록되지 않았습니다`
        next = { to: `${strategy}?outcome=1`, label: '결과 기록' }
      } else {
        reason = `${-d}일 전 미팅이 기록되지 않았습니다 — 기록하거나 일정을 바꾸세요`
        next = { to: strategy, label: '미팅 기록' }
      }
    } else if (d === 0) {
      stage = 'today'
      if (second) label = '오늘 2차 미팅'
      reason = `오늘 ${hhmm(meetingAt)} ${what}`
      next = { to: strategy, label: second ? '2차 미팅 준비' : '전략 보고 시작' }
    } else {
      stage = 'upcoming'
      if (second) label = '2차 미팅 예정'
      reason = d === 1 ? `내일 ${hhmm(meetingAt)} ${what}` : `${d}일 후 ${what}`
    }
  }

  if (meeting && (meeting.status === 'live' || meeting.status === 'draft') && !outcomeRules) {
    stage = 'live'
    reason = '중단된 미팅입니다 — 기억이 흐려지기 전에 마무리하세요'
    next = { to: `/meetings/${meeting.id}/live`, label: '이어서 진행' }
    at = meeting.updatedAt
  } else if (meeting && meeting.status === 'analyzed' && !outcomeRules) {
    stage = 'analyzed'
    reason = handoff?.status === 'withdrawn' ? '철회한 요청입니다 — 고쳐서 다시 보내세요' : '2차 제안 요청을 아직 보내지 않았습니다'
    next = { to: `/meetings/${meeting.id}/result`, label: '2차 제안 요청' }
    at = meeting.endedAt ?? meeting.updatedAt
  } else if (o && outcomeRules && !holdScheduled) {
    at = o.at
    if (o.kind === 'won') {
      stage = 'won'
      reason = `${md(o.at)} 계약`
    } else if (o.kind === 'lost') {
      stage = 'lost'
      reason = `${md(o.at)} 무산${o.reason ? ` · ${LOST_REASON_LABEL[o.reason]}` : ''}`
    } else if (o.followUpAt && daysBetween(o.followUpAt, now) <= 0) {
      stage = 'followup'
      const d = -daysBetween(o.followUpAt, now)
      reason = d === 0 ? '보류 고객 — 오늘 다시 연락할 날입니다' : `보류 고객 — ${d}일 전에 다시 연락하기로 했습니다`
      next = { to: strategy, label: '연락하기' }
      at = o.followUpAt
    } else {
      stage = 'hold'
      reason = o.followUpAt ? `${md(o.followUpAt)} 재연락` : '재연락일 없음'
      at = o.followUpAt ?? o.at
    }
  } else if (o && outcomeRules && holdScheduled && company.meetingAt) {
    byDate(company.meetingAt, false)
  } else if (meeting && meeting.status === 'submitted' && handoff?.status === 'proposal_ready' && !scheduledAfter) {
    stage = 'proposal_ready'
    reason = '2차 제안이 준비됐습니다 — 2차 미팅 일정을 잡으세요'
    // 제안 내용은 김상호 대표가 직접 전한다 — 파트너가 할 일은 2차 미팅 일정이다. 고객 화면에서 일정 시트가 바로 열린다
    next = { to: `${strategy}?schedule=1`, label: '2차 미팅 일정 잡기' }
    at = handoff.updatedAt
  } else if (meeting && meeting.status === 'submitted' && !scheduledAfter) {
    stage = 'submitted'
    reason = '김상호 대표가 검토 중입니다'
    next = handoff ? { to: `/handoffs/${handoff.id}`, label: '요청 상태' } : { to: strategy, label: '전략 보기' }
    at = handoff?.submittedAt ?? meeting.endedAt ?? meeting.updatedAt
  } else if (!company.meetingAt) {
    stage = 'prep'
    reason = '미팅 일시가 아직 없습니다'
    at = company.updatedAt
  } else {
    byDate(company.meetingAt, scheduledAfter)
  }

  const finalStage = stage!
  const finalLabel = label ?? (finalStage === 'submitted' && handoff ? (HANDOFF_STATUS_LABEL[handoff.status] ?? STAGE_LABEL.submitted) : STAGE_LABEL[finalStage])
  const rank = STAGE_RANK[finalStage]
  return { company, meeting, handoff, stage: finalStage, label: finalLabel, tone: STAGE_TONE[finalStage], reason, next, todo: rank <= STAGE_RANK.followup, rank, at, round2 }
}

export function workItems(companies: Company[], meetings: Meeting[], handoffs: Handoff[], now = new Date()): WorkItem[] {
  const latest = latestMeetings(meetings)
  const byMeeting = new Map<string, Handoff>()
  for (const h of handoffs) {
    if (h.archivedAt) continue
    const cur = byMeeting.get(h.meetingId)
    if (!cur || h.updatedAt > cur.updatedAt) byMeeting.set(h.meetingId, h)
  }
  return companies.map((c) => {
    const m = latest.get(c.id) ?? null
    return workItem(c, m, m ? (byMeeting.get(m.id) ?? null) : null, now)
  })
}

/**
 * "지금 할 일" 정렬 — 단계 우선순위, 같은 단계 안에서는 시각이 이른 것부터.
 * 오늘 미팅은 이른 시각이 먼저 오고, 나머지는 오래 묵은 것이 먼저 온다(먼저 처리해야 하니까).
 */
export function byUrgency(a: WorkItem, b: WorkItem): number {
  return a.rank - b.rank || (a.at ?? '').localeCompare(b.at ?? '')
}

export function todoItems(items: WorkItem[]): WorkItem[] {
  return items.filter((x) => x.todo).sort(byUrgency)
}

/* ------------------------------------------------------------------ */
/* 고객 찾기 — 컨설턴트가 기억하는 방식 그대로                           */
/* ------------------------------------------------------------------ */

const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase()
const digits = (s: string) => s.replace(/\D/g, '')

/**
 * 회사명만으로는 못 찾는다. 컨설턴트는 "김 대표네", "010-1234 그 번호", "소개해 준 세무사" 로 기억한다.
 * 회사명 · 대표자 · 연락처(숫자만, 하이픈 무시) · 업종 메모 · 메모를 본다.
 * 반환값은 어디서 걸렸는지 — 목록에서 그 근거(대표자·연락처)를 함께 보여 주기 위해서다.
 */
export function matchCompany(c: Company, query: string): 'name' | 'rep' | 'phone' | 'industry' | 'memo' | null {
  const q = squash(query)
  if (!q) return 'name'
  if (squash(c.name).includes(q)) return 'name'
  if (c.representativeName && squash(c.representativeName).includes(q)) return 'rep'
  const qd = digits(query)
  if (qd.length >= 3 && digits(c.phone).includes(qd)) return 'phone'
  if (c.industryNote && squash(c.industryNote).includes(q)) return 'industry'
  if (c.memo && squash(c.memo).includes(q)) return 'memo'
  return null
}

export type CompanyFilter = 'all' | 'todo' | 'planned' | 'sent' | 'closed'
export type CompanySort = 'recent' | 'meeting' | 'name'

export function filterOf(x: WorkItem): Exclude<CompanyFilter, 'all'> {
  if (x.todo) return 'todo'
  if (x.stage === 'submitted') return 'sent'
  // 결과를 기록한 고객(계약·보류·무산)은 한곳에 — 보류 고객의 재연락일이 되면 "할 일" 로 옮겨 간다
  if (x.stage === 'won' || x.stage === 'lost' || x.stage === 'hold') return 'closed'
  return 'planned'
}

/** 마지막으로 손댄 시각 — 고객 정보 수정과 미팅 진행 중 늦은 쪽 */
export function lastActivity(x: WorkItem): string {
  const m = x.meeting?.updatedAt ?? ''
  return m > x.company.updatedAt ? m : x.company.updatedAt
}

export function sortItems(list: WorkItem[], sort: CompanySort): WorkItem[] {
  const out = [...list]
  if (sort === 'name') return out.sort((a, b) => a.company.name.localeCompare(b.company.name, 'ko'))
  if (sort === 'meeting')
    // 일정 있는 고객을 가까운 날짜부터, 일정 없는 고객은 뒤로
    return out.sort((a, b) => {
      const am = a.company.meetingAt
      const bm = b.company.meetingAt
      if (am && bm) return am.localeCompare(bm)
      if (am) return -1
      if (bm) return 1
      return lastActivity(b).localeCompare(lastActivity(a))
    })
  return out.sort((a, b) => lastActivity(b).localeCompare(lastActivity(a)))
}

/* ------------------------------------------------------------------ */
/* 누구의 일인가 — 마스터 홈                                             */
/* ------------------------------------------------------------------ */

/** 고객의 담당자 — 재배정됐으면 새 담당, 아니면 처음 등록한 사람 */
export function ownerOf(c: Company): string {
  return c.assignedTo || c.consultantId
}

const DAY = 86_400_000

/**
 * 파트너 고객 중 마스터가 챙길 건 — 하루 넘게 멈춘 것만.
 * 방금 시작한 미팅 · 방금 끝난 분석은 파트너가 처리하는 중이다. 마스터 화면에 올리면 소음이 된다.
 * 지난 미팅은 그 자체로 멈춘 것이다.
 */
export function isStuck(x: WorkItem, now = new Date()): boolean {
  if (x.stage === 'overdue') return true
  if (x.stage !== 'live' && x.stage !== 'analyzed' && x.stage !== 'proposal_ready') return false
  return Boolean(x.at) && now.getTime() - new Date(x.at as string).getTime() > DAY
}

/** 마스터가 확인할 새 2차 제안 요청 — 전달됨 · 확인 중. 철회 · 보관 · 이미 작성 중인 것은 뺀다. 오래된 것부터 */
export function pendingRequests(handoffs: Handoff[]): Handoff[] {
  return handoffs
    .filter((h) => !h.archivedAt && (h.status === 'submitted' || h.status === 'received'))
    .sort((a, b) => (a.submittedAt ?? a.createdAt).localeCompare(b.submittedAt ?? b.createdAt))
}

/**
 * 보는 사람 기준의 다음 행동 — 남(파트너)의 고객이면 [이어서 진행]·[2차 제안 요청] 대신 [고객 보기].
 * 마스터가 목록에서 버튼 하나로 파트너의 미팅을 이어 쓰거나 대신 전달하지 않게 한다.
 */
export function asViewer(x: WorkItem, viewerId: string): WorkItem {
  if (ownerOf(x.company) === viewerId) return x
  return { ...x, next: { to: `/companies/${x.company.id}`, label: '고객 보기' } }
}
