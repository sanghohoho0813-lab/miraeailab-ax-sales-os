/**
 * local 모드 저장소 — 브라우저 localStorage. 로그인 없이 시연·e2e 용.
 * 운영 OS 이벤트함은 'axpartner.customer_events' 로 흉내 낸다(같은 meeting 은 한 번만 등록 — idempotent).
 */
/** 사례 시드는 크기가 커서(리서치 371건) 필요할 때만 청크로 불러온다 */
async function loadCaseSeed(): Promise<CaseStudy[]> {
  const mod = await import('../content/cases')
  return mod.CASE_SEED
}

import type {
  AuditEvent,
  CaseStudy,
  Company,
  CompanyDeletePreview,
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
  audit: 'axpartner.audit_events',
} as const

type LocalCustomerEvent = { id: string; dedupeKey: string; payload: Record<string, unknown>; createdAt: string; status?: 'new' | 'linked' | 'in_progress' | 'resolved' | 'ignored' }

const DEFAULT_MEMBERS: PartnerMember[] = [
  { profileId: 'local-master', email: 'sanghohoho0813@gmail.com', displayName: '김상호', title: '대표', role: 'master', active: true, createdAt: '2026-09-01T00:00:00.000Z' },
  { profileId: 'local-partner', email: 'partner@example.com', displayName: '곽주환', title: '팀장', role: 'partner', active: true, createdAt: '2026-09-01T00:00:00.000Z' },
]

/** local 모드 프로필 원천 — 마스터가 이름·호칭을 바꾸면 새로고침 후 인사말에 반영된다 (supabase 의 partner_current_profile 과 같은 역할) */
export function readLocalMember(profileId: string): PartnerMember | null {
  return read<PartnerMember[]>(KEYS.members, DEFAULT_MEMBERS).find((m) => m.profileId === profileId) ?? null
}

const normName = (s: string) => s.replace(/\s/g, '').toLowerCase()

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

  private canManage(user: CurrentUser, c: Company): boolean {
    return isMaster(user) || c.consultantId === user.id || c.assignedTo === user.id
  }
  private audit(user: CurrentUser, action: string, targetType: string, targetId: string, detail: Record<string, unknown> = {}): void {
    const events = read<AuditEvent[]>(KEYS.audit, [])
    events.unshift({ id: newId(), actorId: user.id, actorName: user.name, action, targetType, targetId, detail, createdAt: nowIso() })
    write(KEYS.audit, events.slice(0, 2000))
  }

  async listCompanies(user: CurrentUser): Promise<Company[]> {
    return this.companies()
      .filter((c) => !c.archivedAt && this.canManage(user, c))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async listArchivedCompanies(user: CurrentUser): Promise<Company[]> {
    return this.companies()
      .filter((c) => Boolean(c.archivedAt) && this.canManage(user, c))
      .sort((a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? ''))
  }
  async getCompany(user: CurrentUser, id: string): Promise<Company | null> {
    const c = this.companies().find((x) => x.id === id) ?? null
    if (!c) return null
    return this.canManage(user, c) ? c : null
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
      pinnedCaseIds: [],
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    write(KEYS.companies, [company, ...this.companies()])
    return company
  }
  async updateCompany(user: CurrentUser, company: Company): Promise<Company> {
    const cur = this.companies().find((c) => c.id === company.id)
    if (cur && !isMaster(user) && (cur.consultantId !== company.consultantId || (cur.assignedTo ?? null) !== (company.assignedTo ?? null))) {
      throw new Error('담당 파트너 변경은 마스터만 할 수 있습니다.')
    }
    const next = { ...company, updatedAt: nowIso() }
    write(KEYS.companies, this.companies().map((c) => (c.id === next.id ? next : c)))
    return next
  }
  async archiveCompany(user: CurrentUser, id: string): Promise<void> {
    const c = await this.getCompany(user, id)
    if (!c) throw new Error('이 고객을 보관할 권한이 없습니다.')
    write(KEYS.companies, this.companies().map((x) => (x.id === id ? { ...x, archivedAt: x.archivedAt ?? nowIso() } : x)))
    this.audit(user, 'company_archived', 'company', id, { name: c.name })
  }
  async restoreCompany(user: CurrentUser, id: string): Promise<void> {
    const c = await this.getCompany(user, id)
    if (!c) throw new Error('이 고객을 복구할 권한이 없습니다.')
    write(KEYS.companies, this.companies().map((x) => (x.id === id ? { ...x, archivedAt: null } : x)))
    this.audit(user, 'company_restored', 'company', id, { name: c.name })
  }
  /** DB(0005) partner_company_delete_preview 와 같은 규칙 */
  async previewCompanyDelete(user: CurrentUser, id: string): Promise<CompanyDeletePreview> {
    const c = await this.getCompany(user, id)
    if (!c) throw new Error('권한이 없습니다.')
    const meetings = this.meetings().filter((m) => m.companyId === id)
    const handoffs = this.handoffs().filter((h) => h.companyId === id)
    const activeHandoffs = handoffs.filter((h) => ['submitted', 'received', 'reviewing', 'proposal_ready'].includes(h.status)).length
    const transmitted = handoffs.filter((h) => h.customerEventId).length
    const usageEvents = read<UsageEvent[]>(KEYS.events, []).filter((e) => e.meetingId && meetings.some((m) => m.id === e.meetingId)).length
    let canDelete = true
    let reason: string | null = null
    if (!c.archivedAt) {
      canDelete = false
      reason = '먼저 휴지통으로 이동해야 영구 삭제할 수 있습니다.'
    }
    if (activeHandoffs > 0) {
      canDelete = false
      reason = '운영 OS 에 전달된 2차 제안 요청이 있습니다. 먼저 요청을 철회하거나 고객을 보관 상태로 두세요.'
    }
    if (canDelete && transmitted > 0 && !isMaster(user)) {
      canDelete = false
      reason = '운영 OS 에 전달된 이력이 있는 고객은 마스터만 영구 삭제할 수 있습니다.'
    }
    return { name: c.name, meetings: meetings.length, analyzed: meetings.filter((m) => m.status === 'analyzed' || m.status === 'submitted').length, handoffs: handoffs.length, activeHandoffs, transmitted, usageEvents, canDelete, reason, requiresMaster: transmitted > 0 }
  }
  async deleteCompanyPermanent(user: CurrentUser, id: string, confirmName: string): Promise<void> {
    const c = await this.getCompany(user, id)
    if (!c) throw new Error('이 고객을 삭제할 권한이 없습니다.')
    if (normName(confirmName) !== normName(c.name)) throw new Error('회사명이 일치하지 않습니다.')
    const prev = await this.previewCompanyDelete(user, id)
    if (!prev.canDelete) throw new Error(prev.reason ?? '영구 삭제할 수 없습니다.')
    // 운영 OS 쪽 이벤트(철회된 것)에 삭제 사실을 남긴다
    const handoffs = this.handoffs().filter((h) => h.companyId === id)
    const evs = read<LocalCustomerEvent[]>(KEYS.customerEvents, [])
    write(
      KEYS.customerEvents,
      evs.map((e) => (handoffs.some((h) => h.customerEventId === e.id) ? { ...e, status: 'ignored' as const, payload: { ...e.payload, partner_record_deleted: true, deleted_at: nowIso() } } : e)),
    )
    const meetingIds = new Set(this.meetings().filter((m) => m.companyId === id).map((m) => m.id))
    write(KEYS.companies, this.companies().filter((x) => x.id !== id))
    write(KEYS.meetings, this.meetings().filter((m) => m.companyId !== id))
    write(KEYS.handoffs, this.handoffs().filter((h) => h.companyId !== id))
    write(KEYS.events, read<UsageEvent[]>(KEYS.events, []).filter((e) => !e.meetingId || !meetingIds.has(e.meetingId)))
    this.audit(user, 'company_deleted', 'company', id, { ...prev })
  }
  async findSimilarCompanies(user: CurrentUser, name: string, phone: string): Promise<Company[]> {
    const n = normName(name)
    const digits = normalizePhone(phone)
    if (n.length < 2 && !digits) return []
    return this.companies().filter((c) => this.canManage(user, c) && ((n.length >= 2 && (normName(c.name).includes(n) || n.includes(normName(c.name)))) || (digits.length >= 8 && normalizePhone(c.phone) === digits)))
  }
  async assignCompany(user: CurrentUser, companyId: string, profileId: string | null): Promise<Company> {
    if (!isMaster(user)) throw new Error('담당 재배정은 마스터만 할 수 있습니다.')
    const c = this.companies().find((x) => x.id === companyId)
    if (!c) throw new Error('고객을 찾을 수 없습니다.')
    if (profileId && !(await this.listMembers(user)).some((m) => m.profileId === profileId && m.active)) throw new Error('활성 파트너가 아닙니다.')
    const next = { ...c, assignedTo: profileId, updatedAt: nowIso() }
    write(KEYS.companies, this.companies().map((x) => (x.id === companyId ? next : x)))
    this.audit(user, 'company_reassigned', 'company', companyId, { from: c.assignedTo ?? c.consultantId, to: profileId, name: c.name })
    return next
  }

  private canSeeMeeting(user: CurrentUser, m: Meeting): boolean {
    if (isMaster(user) || m.consultantId === user.id) return true
    const c = this.companies().find((x) => x.id === m.companyId)
    return Boolean(c && c.assignedTo === user.id)
  }
  async listMeetings(user: CurrentUser, companyId?: string): Promise<Meeting[]> {
    return this.meetings()
      .filter((m) => this.canSeeMeeting(user, m) && (!companyId || m.companyId === companyId))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async getMeeting(user: CurrentUser, id: string): Promise<Meeting | null> {
    const m = this.meetings().find((x) => x.id === id) ?? null
    if (!m) return null
    return this.canSeeMeeting(user, m) ? m : null
  }
  async cancelMeeting(user: CurrentUser, id: string): Promise<Meeting> {
    const m = await this.getMeeting(user, id)
    if (!m) throw new Error('미팅을 찾을 수 없습니다.')
    if (m.status !== 'draft' && m.status !== 'live') throw new Error('진행 중인 미팅만 취소할 수 있습니다.')
    const next: Meeting = { ...m, status: 'cancelled', endedAt: m.endedAt ?? nowIso(), updatedAt: nowIso() }
    write(KEYS.meetings, this.meetings().map((x) => (x.id === id ? next : x)))
    this.audit(user, 'meeting_cancelled', 'meeting', id, { companyId: m.companyId })
    return next
  }
  async deleteMeeting(user: CurrentUser, id: string): Promise<void> {
    const m = await this.getMeeting(user, id)
    if (!m) throw new Error('미팅을 찾을 수 없습니다.')
    if (m.status === 'submitted') throw new Error('운영 OS 에 전달된 미팅은 삭제할 수 없습니다. 전달 요청을 먼저 철회하세요.')
    if (m.status === 'live') throw new Error('진행 중인 미팅은 먼저 취소해야 삭제할 수 있습니다.')
    if (m.status === 'analyzed' && !isMaster(user)) throw new Error('분석이 끝난 미팅 삭제는 마스터 확인이 필요합니다.')
    if (this.handoffs().some((h) => h.meetingId === id && (h.customerEventId || ['submitted', 'received', 'reviewing', 'proposal_ready'].includes(h.status)))) {
      throw new Error('운영 OS 에 전달된 이력이 있는 미팅은 삭제할 수 없습니다.')
    }
    write(KEYS.meetings, this.meetings().filter((x) => x.id !== id))
    write(KEYS.handoffs, this.handoffs().filter((h) => h.meetingId !== id))
    write(KEYS.events, read<UsageEvent[]>(KEYS.events, []).filter((e) => e.meetingId !== id))
    this.audit(user, 'meeting_deleted', 'meeting', id, { companyId: m.companyId, status: m.status })
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
    // e2e 전용 훅 — 네트워크 단절(저장 실패)을 흉내 낸다. supabase 모드에는 없다.
    if (read<boolean>('axpartner.test.failSaves', false)) throw new Error('offline (test hook)')
    const next = { ...meeting, updatedAt: nowIso() }
    write(KEYS.meetings, this.meetings().map((m) => (m.id === next.id ? next : m)))
    return next
  }

  private canSeeHandoff(user: CurrentUser, h: Handoff): boolean {
    if (isMaster(user) || h.consultantId === user.id) return true
    const c = this.companies().find((x) => x.id === h.companyId)
    return Boolean(c && c.assignedTo === user.id)
  }
  async getHandoffByMeeting(user: CurrentUser, meetingId: string): Promise<Handoff | null> {
    const h = this.handoffs().find((x) => x.meetingId === meetingId) ?? null
    return h && this.canSeeHandoff(user, h) ? h : null
  }
  async getHandoff(user: CurrentUser, id: string): Promise<Handoff | null> {
    const h = this.handoffs().find((x) => x.id === id) ?? null
    return h && this.canSeeHandoff(user, h) ? h : null
  }
  async listHandoffs(user: CurrentUser): Promise<Handoff[]> {
    return this.handoffs()
      .filter((h) => this.canSeeHandoff(user, h))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async submitHandoff(user: CurrentUser, meetingId: string, payload: HandoffPayload, customerSafe: Record<string, unknown>): Promise<HandoffSubmitResult> {
    const meeting = this.meetings().find((m) => m.id === meetingId)
    if (!meeting) throw new Error('미팅을 찾을 수 없습니다.')
    if (!this.canSeeMeeting(user, meeting)) throw new Error('이 미팅을 전달할 권한이 없습니다.')
    const existing = this.handoffs().find((h) => h.meetingId === meetingId)
    const now = nowIso()
    // 철회된 요청의 재전달 — 같은 이벤트를 다시 연다(new). 새 이벤트를 만들지 않는다
    if (existing && existing.status === 'withdrawn') {
      const evs = read<LocalCustomerEvent[]>(KEYS.customerEvents, [])
      write(KEYS.customerEvents, evs.map((e) => (e.id === existing.customerEventId ? { ...e, status: 'new' as const, payload: { ...customerSafe, handoff_id: existing.id, meeting_id: meetingId, resubmitted: true } } : e)))
      const handoff: Handoff = { ...existing, status: existing.customerEventId ? 'received' : 'submitted', payload, withdrawnAt: null, withdrawReason: '', submittedAt: now, receivedAt: existing.customerEventId ? now : existing.receivedAt, updatedAt: now }
      write(KEYS.handoffs, this.handoffs().map((h) => (h.id === handoff.id ? handoff : h)))
      write(KEYS.meetings, this.meetings().map((m) => (m.id === meetingId ? { ...m, status: 'submitted' as const, handoffId: handoff.id, updatedAt: now } : m)))
      this.audit(user, 'handoff_resubmitted', 'handoff', handoff.id, { companyId: handoff.companyId })
      return { handoff, created: true }
    }
    if (existing && existing.customerEventId) return { handoff: existing, created: false }

    // 운영 OS 이벤트함 흉내 — dedupe_key = partner_handoff:<handoff id>:ax_proposal_requested
    const handoffId = existing?.id ?? newId()
    const dedupeKey = `partner_handoff:${handoffId}:ax_proposal_requested`
    const customerEvents = read<LocalCustomerEvent[]>(KEYS.customerEvents, [])
    let event = customerEvents.find((e) => e.dedupeKey === dedupeKey)
    if (!event) {
      event = { id: newId(), dedupeKey, payload: customerSafe, createdAt: now, status: 'new' }
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
    this.audit(user, 'handoff_submitted', 'handoff', handoff.id, { companyId: handoff.companyId })
    return { handoff, created: true }
  }
  async withdrawHandoff(user: CurrentUser, id: string, reason: string): Promise<Handoff> {
    const h = await this.getHandoff(user, id)
    if (!h) throw new Error('전달 요청을 찾을 수 없습니다.')
    if (h.status === 'withdrawn') return h
    if (h.status === 'proposal_ready') throw new Error('2차 제안이 준비된 요청은 철회할 수 없습니다. 보관만 할 수 있습니다.')
    const now = nowIso()
    const next: Handoff = { ...h, status: 'withdrawn', withdrawnAt: now, withdrawReason: reason, updatedAt: now }
    write(KEYS.handoffs, this.handoffs().map((x) => (x.id === id ? next : x)))
    // 운영 OS 이벤트함 흉내 — 같은 진실: ignored + 사유
    const evs = read<LocalCustomerEvent[]>(KEYS.customerEvents, [])
    write(KEYS.customerEvents, evs.map((e) => (e.id === h.customerEventId ? { ...e, status: 'ignored' as const, payload: { ...e.payload, withdrawn: true, withdrawn_at: now, withdraw_reason: reason } } : e)))
    write(KEYS.meetings, this.meetings().map((m) => (m.id === h.meetingId && m.status === 'submitted' ? { ...m, status: 'analyzed' as const, updatedAt: now } : m)))
    this.audit(user, 'handoff_withdrawn', 'handoff', id, { companyId: h.companyId, reason })
    return next
  }
  async archiveHandoff(user: CurrentUser, id: string, archived: boolean): Promise<Handoff> {
    const h = await this.getHandoff(user, id)
    if (!h) throw new Error('전달 요청을 찾을 수 없습니다.')
    const next: Handoff = { ...h, archivedAt: archived ? (h.archivedAt ?? nowIso()) : null, updatedAt: nowIso() }
    write(KEYS.handoffs, this.handoffs().map((x) => (x.id === id ? next : x)))
    this.audit(user, archived ? 'handoff_archived' : 'handoff_unarchived', 'handoff', id, { companyId: h.companyId })
    return next
  }

  async listCases(user: CurrentUser): Promise<CaseStudy[]> {
    const stored = read<CaseStudy[] | null>(KEYS.cases, null)
    const all = stored ?? (await loadCaseSeed())
    return isMaster(user) ? all : all.filter((c) => c.verificationStatus !== 'draft')
  }
  async saveCase(user: CurrentUser, caseStudy: CaseStudy): Promise<CaseStudy> {
    if (!isMaster(user)) throw new Error('사례 DB 는 마스터만 수정할 수 있습니다.')
    const all = read<CaseStudy[] | null>(KEYS.cases, null) ?? (await loadCaseSeed())
    const next = { ...caseStudy, updatedAt: nowIso() }
    const exists = all.some((c) => c.id === next.id)
    write(KEYS.cases, exists ? all.map((c) => (c.id === next.id ? next : c)) : [next, ...all])
    return next
  }

  async reviewCase(user: CurrentUser, id: string, status: CaseStudy['verificationStatus'], note = ''): Promise<CaseStudy> {
    if (!isMaster(user)) throw new Error('사례 검수는 마스터만 할 수 있습니다.')
    const all = read<CaseStudy[] | null>(KEYS.cases, null) ?? (await loadCaseSeed())
    const cur = all.find((c) => c.id === id)
    if (!cur) throw new Error('사례를 찾을 수 없습니다.')
    const next: CaseStudy = { ...cur, verificationStatus: status, reviewRequired: status !== 'verified', reviewNote: note, lastVerifiedAt: status === 'verified' ? nowIso() : cur.lastVerifiedAt ?? null, updatedAt: nowIso() }
    write(KEYS.cases, all.map((c) => (c.id === id ? next : c)))
    this.audit(user, 'case_reviewed', 'case', id, { status, note, company: cur.companyName })
    return next
  }
  async listAudit(user: CurrentUser, limit = 200): Promise<AuditEvent[]> {
    if (!isMaster(user)) throw new Error('감사 로그는 마스터만 볼 수 있습니다.')
    return read<AuditEvent[]>(KEYS.audit, []).slice(0, limit)
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
    return read<PartnerMember[]>(KEYS.members, DEFAULT_MEMBERS).map((m) => ({ ...m, title: m.title ?? '' }))
  }
  async addMember(user: CurrentUser, email: string, displayName: string, role: 'partner' | 'master'): Promise<PartnerMember> {
    const members = await this.listMembers(user)
    const m: PartnerMember = { profileId: newId(), email: email.trim(), displayName: displayName.trim(), title: '', role, active: true, createdAt: nowIso() }
    write(KEYS.members, [...members, m])
    this.audit(user, 'partner_added', 'partner', m.profileId, { email: m.email, role })
    return m
  }
  /** DB(0005) partner_update_member + 마지막 마스터 트리거와 같은 규칙 */
  async updateMember(user: CurrentUser, profileId: string, patch: { displayName: string; title: string; role: 'partner' | 'master'; active: boolean }): Promise<PartnerMember> {
    if (!isMaster(user)) throw new Error('마스터만 파트너 정보를 수정할 수 있습니다.')
    const members = await this.listMembers(user)
    const old = members.find((m) => m.profileId === profileId)
    if (!old) throw new Error('파트너를 찾을 수 없습니다.')
    if (profileId === user.id && (!patch.active || (old.role === 'master' && patch.role !== 'master'))) throw new Error('본인 계정은 비활성화하거나 강등할 수 없습니다.')
    if (old.role === 'master' && old.active && (patch.role !== 'master' || !patch.active)) {
      const others = members.filter((m) => m.role === 'master' && m.active && m.profileId !== profileId).length
      if (others === 0) throw new Error('마지막 활성 마스터는 비활성화하거나 강등할 수 없습니다.')
    }
    const next: PartnerMember = { ...old, displayName: patch.displayName.trim() || old.displayName, title: patch.title.trim(), role: patch.role, active: patch.active }
    write(KEYS.members, members.map((m) => (m.profileId === profileId ? next : m)))
    this.audit(user, !old.active && patch.active ? 'partner_activated' : old.active && !patch.active ? 'partner_deactivated' : 'partner_updated', 'partner', profileId, {
      before: { displayName: old.displayName, title: old.title, role: old.role, active: old.active },
      after: { displayName: next.displayName, title: next.title, role: next.role, active: next.active },
    })
    return next
  }
  async setMemberActive(user: CurrentUser, profileId: string, active: boolean): Promise<void> {
    const members = await this.listMembers(user)
    const m = members.find((x) => x.profileId === profileId)
    if (!m) throw new Error('파트너를 찾을 수 없습니다.')
    await this.updateMember(user, profileId, { displayName: m.displayName, title: m.title, role: m.role, active })
  }
}

/** e2e·시연용 — 저장소 초기화 */
export function resetLocalStore(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k))
}
