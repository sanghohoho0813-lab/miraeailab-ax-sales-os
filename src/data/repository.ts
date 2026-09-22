/**
 * 저장소 인터페이스 — UI 는 이것만 쓴다. local(localStorage) / supabase 두 구현이 있다.
 * 모든 메서드는 "현재 로그인한 사용자" 기준으로 동작한다(권한은 supabase 에서는 RLS·RPC 가 강제).
 */
import type {
  AuditEvent,
  CaseStudy,
  Company,
  CompanyDeletePreview,
  CompanyProfile,
  CreateCompanyInput,
  CreateProfileInput,
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

  /* 회사 — ACTIVE → ARCHIVED(휴지통) → RESTORE / PERMANENT DELETE(안전 RPC). 직접 DELETE 없음 */
  listCompanies(user: CurrentUser): Promise<Company[]>
  listArchivedCompanies(user: CurrentUser): Promise<Company[]>
  getCompany(user: CurrentUser, id: string): Promise<Company | null>
  createCompany(user: CurrentUser, input: CreateCompanyInput): Promise<Company>
  updateCompany(user: CurrentUser, company: Company): Promise<Company>
  archiveCompany(user: CurrentUser, id: string): Promise<void>
  restoreCompany(user: CurrentUser, id: string): Promise<void>
  /** 영구삭제 전 영향 범위·가능 여부 */
  previewCompanyDelete(user: CurrentUser, id: string): Promise<CompanyDeletePreview>
  /** 회사명을 그대로 입력해야 한다. 전달 이력이 있으면 DB 가 거부한다 */
  deleteCompanyPermanent(user: CurrentUser, id: string, confirmName: string): Promise<void>
  /** 회사명·연락처가 비슷한 기존 고객 (중복 등록 안내용, 휴지통 포함) */
  findSimilarCompanies(user: CurrentUser, name: string, phone: string): Promise<Company[]>
  /** 마스터 전용 — 담당 재배정 (작성자는 유지) */
  assignCompany(user: CurrentUser, companyId: string, profileId: string | null): Promise<Company>

  /* 회사 프로필 — PDF·음성·수동 입력에서 구조화한 스냅샷 (이력). 원본 PDF 는 저장하지 않는다 */
  listProfiles(user: CurrentUser, companyId: string): Promise<CompanyProfile[]>
  createProfile(user: CurrentUser, input: CreateProfileInput): Promise<CompanyProfile>
  /** 잘못 추출된 값 제외/수정 — 행을 지우지 않고 facts·evidence 만 고친다 */
  updateProfile(user: CurrentUser, profileId: string, patch: { facts: CompanyProfile['facts']; evidence: CompanyProfile['evidence'] }): Promise<CompanyProfile>

  /* 미팅 */
  listMeetings(user: CurrentUser, companyId?: string): Promise<Meeting[]>
  getMeeting(user: CurrentUser, id: string): Promise<Meeting | null>
  createMeeting(user: CurrentUser, companyId: string, questionIds: string[], prefilled: Meeting['answers']): Promise<Meeting>
  updateMeeting(user: CurrentUser, meeting: Meeting): Promise<Meeting>
  /** live → cancelled */
  cancelMeeting(user: CurrentUser, id: string): Promise<Meeting>
  /** draft/cancelled 는 담당자, analyzed 는 마스터, submitted 는 불가 */
  deleteMeeting(user: CurrentUser, id: string): Promise<void>

  /* 운영 OS 전달 */
  getHandoffByMeeting(user: CurrentUser, meetingId: string): Promise<Handoff | null>
  getHandoff(user: CurrentUser, id: string): Promise<Handoff | null>
  listHandoffs(user: CurrentUser): Promise<Handoff[]>
  submitHandoff(user: CurrentUser, meetingId: string, payload: HandoffPayload, customerSafe: Record<string, unknown>): Promise<HandoffSubmitResult>
  /** 철회 — 운영 OS 이벤트도 함께 보류(ignored) 된다. proposal_ready 는 거부 */
  withdrawHandoff(user: CurrentUser, id: string, reason: string): Promise<Handoff>
  archiveHandoff(user: CurrentUser, id: string, archived: boolean): Promise<Handoff>

  /* 사례 */
  listCases(user: CurrentUser): Promise<CaseStudy[]>
  saveCase(user: CurrentUser, caseStudy: CaseStudy): Promise<CaseStudy>
  /** 마스터 검수 — verified / needs_review(보류) */
  reviewCase(user: CurrentUser, id: string, status: CaseStudy['verificationStatus'], note?: string): Promise<CaseStudy>

  /* 감사 로그 (마스터) */
  listAudit(user: CurrentUser, limit?: number): Promise<AuditEvent[]>

  /* 사전진단 */
  lookupDiagnosis(user: CurrentUser, companyName: string, phone: string): Promise<DiagnosisSnapshot | null>

  /* 사용률 이벤트 */
  track(user: CurrentUser, eventType: UsageEventType, meetingId: string | null, payload?: Record<string, unknown>): Promise<void>
  listUsage(user: CurrentUser, meetingId?: string): Promise<UsageEvent[]>

  /* 파트너 관리 (Master) — 이메일은 Auth 소유라 여기서 바꾸지 않는다 */
  listMembers(user: CurrentUser): Promise<PartnerMember[]>
  addMember(user: CurrentUser, email: string, displayName: string, role: 'partner' | 'master'): Promise<PartnerMember>
  updateMember(user: CurrentUser, profileId: string, patch: { displayName: string; title: string; role: 'partner' | 'master'; active: boolean }): Promise<PartnerMember>
  setMemberActive(user: CurrentUser, profileId: string, active: boolean): Promise<void>
}
