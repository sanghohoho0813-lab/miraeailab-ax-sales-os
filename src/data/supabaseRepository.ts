/**
 * supabase 모드 저장소 — 미래AI랩 공용 프로젝트(mirae-ai-lab)의 partner_* 테이블과 RPC.
 * 브라우저는 anon 키 + 로그인 세션만 쓴다. 권한은 RLS·SECURITY DEFINER RPC 가 강제한다.
 * 계약 원문: supabase/migrations/20260922000001_partner_os.sql · 20260922000002_partner_os_bridge.sql
 */
import type { SupabaseClient } from '@supabase/supabase-js'
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

type Row = Record<string, unknown>
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const obj = <T,>(v: unknown, d: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : d)

function companyFromRow(r: Row): Company {
  return {
    id: str(r.id),
    consultantId: str(r.consultant_id),
    name: str(r.name),
    industry: str(r.industry, 'other') as Company['industry'],
    industryNote: str(r.industry_note),
    headcount: str(r.headcount, 'unknown') as Company['headcount'],
    tradeType: str(r.trade_type, 'unknown') as Company['tradeType'],
    interests: arr(r.interests) as Company['interests'],
    representativeName: str(r.representative_name),
    phone: str(r.phone),
    meetingAt: strOrNull(r.meeting_at),
    diagnosis: r.diagnosis && typeof r.diagnosis === 'object' ? (r.diagnosis as DiagnosisSnapshot) : null,
    memo: str(r.memo),
    archivedAt: strOrNull(r.archived_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  }
}
function companyToRow(c: Company): Row {
  return {
    name: c.name,
    industry: c.industry,
    industry_note: c.industryNote,
    headcount: c.headcount,
    trade_type: c.tradeType,
    interests: c.interests,
    representative_name: c.representativeName,
    phone: c.phone,
    meeting_at: c.meetingAt,
    diagnosis: c.diagnosis,
    memo: c.memo,
    archived_at: c.archivedAt,
  }
}
function meetingFromRow(r: Row): Meeting {
  return {
    id: str(r.id),
    companyId: str(r.company_id),
    consultantId: str(r.consultant_id),
    status: str(r.status, 'draft') as Meeting['status'],
    questionIds: arr(r.question_ids),
    answers: obj<Meeting['answers']>(r.answers, {}),
    skippedQuestionIds: arr(r.skipped_question_ids),
    hardQuestionIds: arr(r.hard_question_ids),
    keyQuote: str(r.key_quote),
    memo: str(r.memo),
    analysis: r.analysis && typeof r.analysis === 'object' ? (r.analysis as Meeting['analysis']) : null,
    handoffId: strOrNull(r.handoff_id),
    startedAt: strOrNull(r.started_at),
    endedAt: strOrNull(r.ended_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  }
}
function meetingToRow(m: Meeting): Row {
  return {
    status: m.status,
    question_ids: m.questionIds,
    answers: m.answers,
    skipped_question_ids: m.skippedQuestionIds,
    hard_question_ids: m.hardQuestionIds,
    key_quote: m.keyQuote,
    memo: m.memo,
    analysis: m.analysis,
    started_at: m.startedAt,
    ended_at: m.endedAt,
  }
}
function handoffFromRow(r: Row): Handoff {
  return {
    id: str(r.id),
    meetingId: str(r.meeting_id),
    companyId: str(r.company_id),
    consultantId: str(r.consultant_id),
    status: str(r.status, 'draft') as Handoff['status'],
    payload: obj<HandoffPayload>(r.payload, {} as HandoffPayload),
    customerEventId: strOrNull(r.customer_event_id),
    operationsClientId: strOrNull(r.operations_client_id),
    submittedAt: strOrNull(r.submitted_at),
    receivedAt: strOrNull(r.received_at),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  }
}
function caseFromRow(r: Row): CaseStudy {
  const p = obj<Partial<CaseStudy>>(r.payload, {})
  return {
    id: str(r.id),
    companyName: str(r.company_name),
    industry: str(r.industry, 'other') as CaseStudy['industry'],
    subIndustry: str(r.sub_industry),
    businessModel: str(r.business_model, 'b2b') as CaseStudy['businessModel'],
    problem: p.problem ?? '',
    beforeProcess: p.beforeProcess ?? '',
    axTransition: p.axTransition ?? '',
    internalAx: p.internalAx ?? '',
    customerPortal: p.customerPortal ?? '',
    aiFunction: p.aiFunction ?? '',
    validation: p.validation ?? '',
    axPath: str(r.ax_path, 'internal_ax') as CaseStudy['axPath'],
    growthStage: str(r.growth_stage, 'stable') as CaseStudy['growthStage'],
    talkingPoints: p.talkingPoints ?? [],
    caveats: p.caveats ?? [],
    fundingType: str(r.funding_type, 'unknown') as CaseStudy['fundingType'],
    fundingAmountDisclosed: typeof r.funding_amount_disclosed === 'number' ? r.funding_amount_disclosed : r.funding_amount_disclosed ? Number(r.funding_amount_disclosed) : null,
    fundingProgramMax: typeof r.funding_program_max === 'number' ? r.funding_program_max : r.funding_program_max ? Number(r.funding_program_max) : null,
    fundingNote: p.fundingNote ?? '',
    year: str(r.year),
    source: str(r.source),
    sourceDate: str(r.source_date),
    verificationStatus: str(r.verification_status, 'draft') as CaseStudy['verificationStatus'],
    keywords: arr(r.keywords),
    problemAreas: arr(r.problem_areas) as CaseStudy['problemAreas'],
    updatedAt: str(r.updated_at),
  }
}
function caseToRow(c: CaseStudy): Row {
  return {
    id: c.id,
    company_name: c.companyName,
    industry: c.industry,
    sub_industry: c.subIndustry,
    business_model: c.businessModel,
    ax_path: c.axPath,
    growth_stage: c.growthStage,
    funding_type: c.fundingType,
    funding_amount_disclosed: c.fundingAmountDisclosed,
    funding_program_max: c.fundingProgramMax,
    year: c.year,
    source: c.source,
    source_date: c.sourceDate,
    verification_status: c.verificationStatus,
    keywords: c.keywords,
    problem_areas: c.problemAreas,
    payload: {
      problem: c.problem,
      beforeProcess: c.beforeProcess,
      axTransition: c.axTransition,
      internalAx: c.internalAx,
      customerPortal: c.customerPortal,
      aiFunction: c.aiFunction,
      validation: c.validation,
      talkingPoints: c.talkingPoints,
      caveats: c.caveats,
      fundingNote: c.fundingNote,
    },
  }
}
function memberFromRow(r: Row): PartnerMember {
  return {
    profileId: str(r.profile_id),
    email: str(r.email),
    displayName: str(r.display_name),
    role: str(r.role, 'partner') as PartnerMember['role'],
    active: r.active === true,
    createdAt: str(r.created_at),
  }
}

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message ? `${fallback} (${error.message})` : fallback)
}

export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const
  private readonly client: SupabaseClient
  constructor(client: SupabaseClient) {
    this.client = client
  }

  async listCompanies(): Promise<Company[]> {
    const { data, error } = await this.client.from('partner_companies').select('*').is('archived_at', null).order('updated_at', { ascending: false })
    if (error) fail(error, '업체 목록을 불러오지 못했습니다.')
    return (data ?? []).map((r) => companyFromRow(r as Row))
  }
  async getCompany(_u: CurrentUser, id: string): Promise<Company | null> {
    const { data, error } = await this.client.from('partner_companies').select('*').eq('id', id).maybeSingle()
    if (error) fail(error, '업체를 불러오지 못했습니다.')
    return data ? companyFromRow(data as Row) : null
  }
  async createCompany(user: CurrentUser, input: CreateCompanyInput): Promise<Company> {
    const row = {
      consultant_id: user.id,
      name: input.name.trim(),
      industry: input.industry,
      industry_note: input.industryNote?.trim() ?? '',
      headcount: input.headcount,
      trade_type: input.tradeType,
      interests: input.interests,
      representative_name: input.representativeName?.trim() ?? '',
      phone: input.phone?.trim() ?? '',
      meeting_at: input.meetingAt ?? null,
      memo: input.memo?.trim() ?? '',
    }
    const { data, error } = await this.client.from('partner_companies').insert(row).select('*').single()
    if (error) fail(error, '업체를 등록하지 못했습니다.')
    return companyFromRow(data as Row)
  }
  async updateCompany(_u: CurrentUser, company: Company): Promise<Company> {
    const { data, error } = await this.client.from('partner_companies').update(companyToRow(company)).eq('id', company.id).select('*').single()
    if (error) fail(error, '업체를 저장하지 못했습니다.')
    return companyFromRow(data as Row)
  }
  async archiveCompany(_u: CurrentUser, id: string): Promise<void> {
    const { error } = await this.client.from('partner_companies').update({ archived_at: new Date().toISOString() }).eq('id', id)
    if (error) fail(error, '업체를 보관하지 못했습니다.')
  }

  async listMeetings(_u: CurrentUser, companyId?: string): Promise<Meeting[]> {
    let q = this.client.from('partner_meetings').select('*').order('updated_at', { ascending: false })
    if (companyId) q = q.eq('company_id', companyId)
    const { data, error } = await q
    if (error) fail(error, '미팅 목록을 불러오지 못했습니다.')
    return (data ?? []).map((r) => meetingFromRow(r as Row))
  }
  async getMeeting(_u: CurrentUser, id: string): Promise<Meeting | null> {
    const { data, error } = await this.client.from('partner_meetings').select('*').eq('id', id).maybeSingle()
    if (error) fail(error, '미팅을 불러오지 못했습니다.')
    return data ? meetingFromRow(data as Row) : null
  }
  async createMeeting(user: CurrentUser, companyId: string, questionIds: string[], prefilled: Meeting['answers']): Promise<Meeting> {
    const { data, error } = await this.client
      .from('partner_meetings')
      .insert({ company_id: companyId, consultant_id: user.id, status: 'draft', question_ids: questionIds, answers: prefilled })
      .select('*')
      .single()
    if (error) fail(error, '미팅을 만들지 못했습니다.')
    return meetingFromRow(data as Row)
  }
  async updateMeeting(_u: CurrentUser, meeting: Meeting): Promise<Meeting> {
    const { data, error } = await this.client.from('partner_meetings').update(meetingToRow(meeting)).eq('id', meeting.id).select('*').single()
    if (error) fail(error, '미팅을 저장하지 못했습니다.')
    return meetingFromRow(data as Row)
  }

  async getHandoffByMeeting(_u: CurrentUser, meetingId: string): Promise<Handoff | null> {
    const { data, error } = await this.client.from('partner_handoffs').select('*').eq('meeting_id', meetingId).maybeSingle()
    if (error) fail(error, '전달 상태를 불러오지 못했습니다.')
    return data ? handoffFromRow(data as Row) : null
  }
  async getHandoff(_u: CurrentUser, id: string): Promise<Handoff | null> {
    const { data, error } = await this.client.from('partner_handoffs').select('*').eq('id', id).maybeSingle()
    if (error) fail(error, '전달 내역을 불러오지 못했습니다.')
    return data ? handoffFromRow(data as Row) : null
  }
  async listHandoffs(): Promise<Handoff[]> {
    const { data, error } = await this.client.from('partner_handoffs').select('*').order('updated_at', { ascending: false })
    if (error) fail(error, '전달 내역을 불러오지 못했습니다.')
    return (data ?? []).map((r) => handoffFromRow(r as Row))
  }
  /** SECURITY DEFINER RPC — 소유권 검증 · meeting_id 기준 idempotent · customer_events 발행 */
  async submitHandoff(_u: CurrentUser, meetingId: string, payload: HandoffPayload, customerSafe: Record<string, unknown>): Promise<HandoffSubmitResult> {
    const { data, error } = await this.client.rpc('partner_submit_handoff', { p_meeting_id: meetingId, p_payload: payload, p_customer_safe: customerSafe })
    if (error) fail(error, '운영 OS 로 전달하지 못했습니다.')
    const r = data as Row
    return { handoff: handoffFromRow(obj<Row>(r.handoff, {})), created: r.created === true }
  }

  async listCases(): Promise<CaseStudy[]> {
    const { data, error } = await this.client.from('partner_cases').select('*').order('updated_at', { ascending: false })
    if (error) fail(error, '사례를 불러오지 못했습니다.')
    const rows = (data ?? []).map((r) => caseFromRow(r as Row))
    // 시드가 아직 들어가지 않은 환경에서는 코드에 있는 시드를 읽기 전용으로 보여 준다
    return rows.length ? rows : CASE_SEED
  }
  async saveCase(_u: CurrentUser, caseStudy: CaseStudy): Promise<CaseStudy> {
    const { data, error } = await this.client.from('partner_cases').upsert(caseToRow(caseStudy), { onConflict: 'id' }).select('*').single()
    if (error) fail(error, '사례를 저장하지 못했습니다.')
    return caseFromRow(data as Row)
  }

  async lookupDiagnosis(_u: CurrentUser, companyName: string, phone: string): Promise<DiagnosisSnapshot | null> {
    const { data, error } = await this.client.rpc('partner_lookup_diagnosis', { p_company_name: companyName, p_phone: phone })
    if (error) {
      // 홈페이지 진단 테이블이 없는 환경(READY) — 조용히 없음 처리
      if (/could not find the function|does not exist|PGRST202/i.test(error.message ?? '')) return null
      fail(error, '사전진단을 조회하지 못했습니다.')
    }
    if (!data || typeof data !== 'object') return null
    const d = data as Row
    return {
      leadId: str(d.lead_id),
      grade: (strOrNull(d.grade) as DiagnosisSnapshot['grade']) ?? null,
      score: typeof d.score === 'number' ? d.score : null,
      answers: obj<Record<string, string>>(d.answers, {}),
      submittedAt: strOrNull(d.submitted_at),
      matchedBy: (str(d.matched_by, 'matched') as DiagnosisSnapshot['matchedBy']) ?? 'matched',
    }
  }

  async track(user: CurrentUser, eventType: UsageEventType, meetingId: string | null, payload: Record<string, unknown> = {}): Promise<void> {
    const { error } = await this.client.from('partner_meeting_events').insert({ meeting_id: meetingId, consultant_id: user.id, event_type: eventType, payload })
    if (error) console.warn('[usage] 기록 실패', error.message)
  }
  async listUsage(_u: CurrentUser, meetingId?: string): Promise<UsageEvent[]> {
    let q = this.client.from('partner_meeting_events').select('*').order('created_at', { ascending: false }).limit(500)
    if (meetingId) q = q.eq('meeting_id', meetingId)
    const { data, error } = await q
    if (error) fail(error, '사용 기록을 불러오지 못했습니다.')
    return (data ?? []).map((r) => {
      const row = r as Row
      return { id: str(row.id), meetingId: strOrNull(row.meeting_id), consultantId: str(row.consultant_id), eventType: str(row.event_type) as UsageEventType, payload: obj<Record<string, unknown>>(row.payload, {}), createdAt: str(row.created_at) }
    })
  }

  async listMembers(): Promise<PartnerMember[]> {
    const { data, error } = await this.client.from('partner_members').select('*').order('created_at', { ascending: true })
    if (error) fail(error, '파트너 목록을 불러오지 못했습니다.')
    return (data ?? []).map((r) => memberFromRow(r as Row))
  }
  async addMember(_u: CurrentUser, email: string, displayName: string, role: 'partner' | 'master'): Promise<PartnerMember> {
    const { data, error } = await this.client.rpc('partner_add_member', { p_email: email.trim(), p_display_name: displayName.trim(), p_role: role })
    if (error) fail(error, '파트너를 추가하지 못했습니다.')
    return memberFromRow(data as Row)
  }
  async setMemberActive(_u: CurrentUser, profileId: string, active: boolean): Promise<void> {
    const { error } = await this.client.from('partner_members').update({ active }).eq('profile_id', profileId)
    if (error) fail(error, '파트너 상태를 바꾸지 못했습니다.')
  }
}
