/**
 * local 모드 저장소 — 브라우저 localStorage. 로그인 없이 시연·e2e 용.
 * 운영 OS 이벤트함은 'axpartner.customer_events' 로 흉내 낸다(같은 meeting 은 한 번만 등록 — idempotent).
 */
import type {
  CaseStudy,
  Company,
  CreateCompanyInput,
  CurrentUser,
  DiagnosisSnapshot,
  Handoff,
  HandoffPayload,
  Meeting,
  PartnerMember,
  UsageEvent,
  UsageEventType,
} from '../types/domain'
import type { HandoffSubmitResult, Repository } from './repository'
import { CASE_SEED } from '../content/cases'
import { newId, nowIso, normalizePhone } from '../lib/util'

const KEYS = {
  companies: 'axpartner.companies',
  meetings: 'axpartner.meetings',
  handoffs: 'axpartner.handoffs',
  cases: 'axpartner.cases',
  events: 'axpartner.usage_events',
  members: 'axpartner.members',
  customerEvents: 'axpartner.customer_events',
  diagnosisFixtures: 'axpartner.diagnosis_fixtures',
} as const

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 저장 불가 환경 — 세션 내 상태만 유지 */
  }
}

/** 시연용 사전진단 픽스처 — 홈페이지 3분 AX Fit 을 마친 회사 (회사명 + 전화 뒷자리로 매칭) */
const DIAGNOSIS_FIXTURES: { companyName: string; phone: string; snapshot: Omit<DiagnosisSnapshot, 'matchedBy'> }[] = [
  {
    companyName: 'ABC산업',
    phone: '01012345678',
    snapshot: {
      leadId: 'demo-lead-abc',
      grade: 'HIGH',
      score: 80,
      answers: { repeatInput: 'always', askProgress: 'always', toolGaps: 'often', manualHandoff: 'often', missDelay: 'sometimes', priorityByMemory: 'often', dataUnused: 'often', ceoLoadGrows: 'always', uniqueWork: 'often', internalOwner: 'partTime' },
      submittedAt: '2026-09-15T02:10:00.000Z',
    },
  },
]

function isMaster(user: CurrentUser): boolean {
  return user.role === 'master'
}

export class LocalRepository implements Repository {
  readonly mode = 'local' as const

  private companies(): Company[] {
    return read<Company[]>(KEYS.companies, [])
  }
  private meetings(): Meeting[] {
    return read<Meeting[]>(KEYS.meetings, [])
  }
  private handoffs(): Handoff[] {
    return read<Handoff[]>(KEYS.handoffs, [])
  }

  async listCompanies(user: CurrentUser): Promise<Company[]> {
    return this.companies()
      .filter((c) => !c.archivedAt && (isMaster(user) || c.consultantId === user.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async getCompany(user: CurrentUser, id: string): Promise<Company | null> {
    const c = this.companies().find((x) => x.id === id) ?? null
    if (!c) return null
    return isMaster(user) || c.consultantId === user.id ? c : null
  }
  async createCompany(user: CurrentUser, input: CreateCompanyInput): Promise<Company> {
    const now = nowIso()
    const company: Company = {
      id: newId(),
      consultantId: user.id,
      name: input.name.trim(),
      industry: input.industry,
      industryNote: input.industryNote?.trim() ?? '',
      headcount: input.headcount,
      tradeType: input.tradeType,
      interests: input.interests,
      representativeName: input.representativeName?.trim() ?? '',
      phone: input.phone?.trim() ?? '',
      meetingAt: input.meetingAt ?? null,
      diagnosis: null,
      memo: input.memo?.trim() ?? '',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    write(KEYS.companies, [company, ...this.companies()])
    return company
  }
  async updateCompany(_user: CurrentUser, company: Company): Promise<Company> {
    const next = { ...company, updatedAt: nowIso() }
    write(KEYS.companies, this.companies().map((c) => (c.id === next.id ? next : c)))
    return next
  }
  async archiveCompany(_user: CurrentUser, id: string): Promise<void> {
    write(KEYS.companies, this.companies().map((c) => (c.id === id ? { ...c, archivedAt: nowIso() } : c)))
  }

  async listMeetings(user: CurrentUser, companyId?: string): Promise<Meeting[]> {
    return this.meetings()
      .filter((m) => (isMaster(user) || m.consultantId === user.id) && (!companyId || m.companyId === companyId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async getMeeting(user: CurrentUser, id: string): Promise<Meeting | null> {
    const m = this.meetings().find((x) => x.id === id) ?? null
    if (!m) return null
    return isMaster(user) || m.consultantId === user.id ? m : null
  }
  async createMeeting(user: CurrentUser, companyId: string, questionIds: string[], prefilled: Meeting['answers']): Promise<Meeting> {
    const now = nowIso()
    const meeting: Meeting = {
      id: newId(),
      companyId,
      consultantId: user.id,
      status: 'draft',
      questionIds,
      answers: prefilled,
      skippedQuestionIds: [],
      hardQuestionIds: [],
      keyQuote: '',
      memo: '',
      analysis: null,
      handoffId: null,
      startedAt: null,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    write(KEYS.meetings, [meeting, ...this.meetings()])
    return meeting
  }
  async updateMeeting(_user: CurrentUser, meeting: Meeting): Promise<Meeting> {
    const next = { ...meeting, updatedAt: nowIso() }
    write(KEYS.meetings, this.meetings().map((m) => (m.id === next.id ? next : m)))
    return next
  }

  async getHandoffByMeeting(user: CurrentUser, meetingId: string): Promise<Handoff | null> {
    const h = this.handoffs().find((x) => x.meetingId === meetingId) ?? null
    return h && (isMaster(user) || h.consultantId === user.id) ? h : null
  }
  async getHandoff(user: CurrentUser, id: string): Promise<Handoff | null> {
    const h = this.handoffs().find((x) => x.id === id) ?? null
    return h && (isMaster(user) || h.consultantId === user.id) ? h : null
  }
  async listHandoffs(user: CurrentUser): Promise<Handoff[]> {
    return this.handoffs()
      .filter((h) => isMaster(user) || h.consultantId === user.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async submitHandoff(user: CurrentUser, meetingId: string, payload: HandoffPayload, customerSafe: Record<string, unknown>): Promise<HandoffSubmitResult> {
    const meeting = this.meetings().find((m) => m.id === meetingId)
    if (!meeting) throw new Error('미팅을 찾을 수 없습니다.')
    if (meeting.consultantId !== user.id && !isMaster(user)) throw new Error('이 미팅을 전달할 권한이 없습니다.')
    const existing = this.handoffs().find((h) => h.meetingId === meetingId)
    if (existing && existing.customerEventId) return { handoff: existing, created: false }

    // 운영 OS 이벤트함 흉내 — dedupe_key = partner_handoff:<handoff id>:ax_proposal_requested
    const now = nowIso()
    const handoffId = existing?.id ?? newId()
    const dedupeKey = `partner_handoff:${handoffId}:ax_proposal_requested`
    const customerEvents = read<{ id: string; dedupeKey: string; payload: Record<string, unknown>; createdAt: string }[]>(KEYS.customerEvents, [])
    let event = customerEvents.find((e) => e.dedupeKey === dedupeKey)
    if (!event) {
      event = { id: newId(), dedupeKey, payload: customerSafe, createdAt: now }
      write(KEYS.customerEvents, [event, ...customerEvents])
    }
    const handoff: Handoff = {
      id: handoffId,
      meetingId,
      companyId: meeting.companyId,
      consultantId: meeting.consultantId,
      status: 'received',
      payload,
      customerEventId: event.id,
      operationsClientId: null,
      submittedAt: existing?.submittedAt ?? now,
      receivedAt: now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    write(KEYS.handoffs, existing ? this.handoffs().map((h) => (h.id === handoff.id ? handoff : h)) : [handoff, ...this.handoffs()])
    write(KEYS.meetings, this.meetings().map((m) => (m.id === meetingId ? { ...m, status: 'submitted' as const, handoffId: handoff.id, updatedAt: now } : m)))
    return { handoff, created: true }
  }

  async listCases(user: CurrentUser): Promise<CaseStudy[]> {
    const stored = read<CaseStudy[] | null>(KEYS.cases, null)
    const all = stored ?? CASE_SEED
    return isMaster(user) ? all : all.filter((c) => c.verificationStatus !== 'draft')
  }
  async saveCase(user: CurrentUser, caseStudy: CaseStudy): Promise<CaseStudy> {
    if (!isMaster(user)) throw new Error('사례 DB 는 마스터만 수정할 수 있습니다.')
    const all = read<CaseStudy[] | null>(KEYS.cases, null) ?? CASE_SEED
    const next = { ...caseStudy, updatedAt: nowIso() }
    const exists = all.some((c) => c.id === next.id)
    write(KEYS.cases, exists ? all.map((c) => (c.id === next.id ? next : c)) : [next, ...all])
    return next
  }

  async lookupDiagnosis(_user: CurrentUser, companyName: string, phone: string): Promise<DiagnosisSnapshot | null> {
    const name = companyName.replace(/\s/g, '')
    const digits = normalizePhone(phone)
    const fixtures = [...read<typeof DIAGNOSIS_FIXTURES>(KEYS.diagnosisFixtures, []), ...DIAGNOSIS_FIXTURES]
    const hit = fixtures.find((f) => f.companyName.replace(/\s/g, '') === name && (!digits || normalizePhone(f.phone) === digits))
    return hit ? { ...hit.snapshot, matchedBy: 'matched' } : null
  }

  async track(user: CurrentUser, eventType: UsageEventType, meetingId: string | null, payload: Record<string, unknown> = {}): Promise<void> {
    const events = read<UsageEvent[]>(KEYS.events, [])
    events.unshift({ id: newId(), meetingId, consultantId: user.id, eventType, payload, createdAt: nowIso() })
    write(KEYS.events, events.slice(0, 2000))
  }
  async listUsage(user: CurrentUser, meetingId?: string): Promise<UsageEvent[]> {
    return read<UsageEvent[]>(KEYS.events, []).filter((e) => (isMaster(user) || e.consultantId === user.id) && (!meetingId || e.meetingId === meetingId))
  }

  async listMembers(user: CurrentUser): Promise<PartnerMember[]> {
    if (!isMaster(user)) throw new Error('마스터만 볼 수 있습니다.')
    return read<PartnerMember[]>(KEYS.members, [
      { profileId: 'local-master', email: 'sanghohoho0813@gmail.com', displayName: '김상호', role: 'master', active: true, createdAt: '2026-09-01T00:00:00.000Z' },
      { profileId: 'local-partner', email: 'partner@example.com', displayName: '곽주환', role: 'partner', active: true, createdAt: '2026-09-01T00:00:00.000Z' },
    ])
  }
  async addMember(user: CurrentUser, email: string, displayName: string, role: 'partner' | 'master'): Promise<PartnerMember> {
    const members = await this.listMembers(user)
    const m: PartnerMember = { profileId: newId(), email: email.trim(), displayName: displayName.trim(), role, active: true, createdAt: nowIso() }
    write(KEYS.members, [...members, m])
    return m
  }
  async setMemberActive(user: CurrentUser, profileId: string, active: boolean): Promise<void> {
    const members = await this.listMembers(user)
    write(KEYS.members, members.map((m) => (m.profileId === profileId ? { ...m, active } : m)))
  }
}

/** e2e·시연용 — 저장소 초기화 */
export function resetLocalStore(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k))
}
