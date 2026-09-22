/**
 * 저장소 인터페이스 — UI 는 이것만 쓴다. local(localStorage) / supabase 두 구현이 있다.
 * 모든 메서드는 "현재 로그인한 사용자" 기준으로 동작한다(권한은 supabase 에서는 RLS·RPC 가 강제).
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

export interface HandoffSubmitResult {
  handoff: Handoff
  /** 이번 호출로 새로 등록됐는지 (false = 이미 등록돼 있어 그대로 돌려줌) */
  created: boolean
}

export interface Repository {
  readonly mode: 'local' | 'supabase'

  /* 회사 */
  listCompanies(user: CurrentUser): Promise<Company[]>
  getCompany(user: CurrentUser, id: string): Promise<Company | null>
  createCompany(user: CurrentUser, input: CreateCompanyInput): Promise<Company>
  updateCompany(user: CurrentUser, company: Company): Promise<Company>
  archiveCompany(user: CurrentUser, id: string): Promise<void>

  /* 미팅 */
  listMeetings(user: CurrentUser, companyId?: string): Promise<Meeting[]>
  getMeeting(user: CurrentUser, id: string): Promise<Meeting | null>
  createMeeting(user: CurrentUser, companyId: string, questionIds: string[], prefilled: Meeting['answers']): Promise<Meeting>
  updateMeeting(user: CurrentUser, meeting: Meeting): Promise<Meeting>

  /* 운영 OS 전달 */
  getHandoffByMeeting(user: CurrentUser, meetingId: string): Promise<Handoff | null>
  getHandoff(user: CurrentUser, id: string): Promise<Handoff | null>
  listHandoffs(user: CurrentUser): Promise<Handoff[]>
  submitHandoff(user: CurrentUser, meetingId: string, payload: HandoffPayload, customerSafe: Record<string, unknown>): Promise<HandoffSubmitResult>

  /* 사례 */
  listCases(user: CurrentUser): Promise<CaseStudy[]>
  saveCase(user: CurrentUser, caseStudy: CaseStudy): Promise<CaseStudy>

  /* 사전진단 */
  lookupDiagnosis(user: CurrentUser, companyName: string, phone: string): Promise<DiagnosisSnapshot | null>

  /* 사용률 이벤트 */
  track(user: CurrentUser, eventType: UsageEventType, meetingId: string | null, payload?: Record<string, unknown>): Promise<void>
  listUsage(user: CurrentUser, meetingId?: string): Promise<UsageEvent[]>

  /* 파트너 관리 (Master) */
  listMembers(user: CurrentUser): Promise<PartnerMember[]>
  addMember(user: CurrentUser, email: string, displayName: string, role: 'partner' | 'master'): Promise<PartnerMember>
  setMemberActive(user: CurrentUser, profileId: string, active: boolean): Promise<void>
}
