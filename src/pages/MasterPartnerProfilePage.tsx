/** MASTER — 파트너 상세: 상태·역할·등록일 · 담당 고객 · 진행 중 미팅 · 전달 요청 · 최근 활동 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, Handoff, Meeting, PartnerMember, UsageEvent } from '../types/domain'
import { Badge, FlatSection, PageTitle, SkeletonList, Stat } from '../components/ui'
import { HANDOFF_STATUS_LABEL, INDUSTRY_LABEL, MEETING_STATUS_LABEL } from '../content/labels'
import { formatDate, relativeDay } from '../lib/util'

const EVENT_LABEL: Record<string, string> = {
  meeting_started: '미팅 시작',
  meeting_ended: '미팅 마무리',
  question_answered: '질문 답변',
  question_skipped: '질문 건너뜀',
  question_hard: '어려워한 질문',
  tip_opened: '팁·코치 열람',
  case_opened: '사례 열람',
  playbook_opened: '플레이북 열람',
  handoff_submitted: '2차 제안 요청',
  pdf_printed: 'PDF 출력',
  analysis_generated: '분석 생성',
}

export default function MasterPartnerProfilePage() {
  const { user, repo } = useSession()
  const { profileId } = useParams()
  const [member, setMember] = useState<PartnerMember | null | undefined>(undefined)
  const [companies, setCompanies] = useState<Company[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [usage, setUsage] = useState<UsageEvent[]>([])

  useEffect(() => {
    document.title = '파트너 상세 · AX Partner OS'
    let alive = true
    void Promise.all([repo.listMembers(user), repo.listCompanies(user), repo.listMeetings(user), repo.listHandoffs(user), repo.listUsage(user)]).then(([ms, cs, mts, hs, us]) => {
      if (!alive) return
      setMember(ms.find((m) => m.profileId === profileId) ?? null)
      setCompanies(cs)
      setMeetings(mts)
      setHandoffs(hs)
      setUsage(us)
    })
    return () => {
      alive = false
    }
  }, [repo, user, profileId])

  const mine = useMemo(() => {
    const cs = companies.filter((c) => (c.assignedTo ?? c.consultantId) === profileId)
    const mts = meetings.filter((m) => m.consultantId === profileId)
    const hs = handoffs.filter((h) => h.consultantId === profileId)
    const us = usage.filter((u) => u.consultantId === profileId).slice(0, 12)
    return { cs, mts, hs, us }
  }, [companies, meetings, handoffs, usage, profileId])

  if (member === undefined) return <SkeletonList rows={3} />
  if (!member) return <p className="t-body text-ink-500">파트너를 찾을 수 없습니다.</p>
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? '고객'

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <PageTitle
        title={`${member.displayName}${member.title ? ` ${member.title}` : ''}`}
        sub={`${member.email} · 등록 ${formatDate(member.createdAt)}`}
        back={
          <Link to="/master/partners" className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
            <ArrowLeft aria-hidden="true" className="size-4" /> 파트너 관리
          </Link>
        }
      />
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={member.role === 'master' ? 'dark' : 'accent'}>{member.role === 'master' ? '마스터' : '파트너'}</Badge>
        <Badge tone={member.active ? 'ok' : 'danger'}>{member.active ? '활성' : '비활성'}</Badge>
      </div>
      <div className="grid gap-4 rounded-(--radius-card) border border-line bg-white p-5 sm:grid-cols-3">
        <Stat label="담당 고객" value={mine.cs.length} unit="곳" />
        <Stat label="진행 중 미팅" value={mine.mts.filter((m) => m.status === 'live' || m.status === 'analyzed').length} unit="건" hint={`전체 ${mine.mts.length}건`} />
        <Stat label="2차 제안 요청" value={mine.hs.filter((h) => h.status !== 'withdrawn').length} unit="건" hint={`철회 ${mine.hs.filter((h) => h.status === 'withdrawn').length}`} />
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <FlatSection title="담당 고객">
          {mine.cs.length === 0 ? (
            <p className="t-body text-ink-500">담당 고객이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
              {mine.cs.map((c) => (
                <li key={c.id}>
                  <Link to={`/companies/${c.id}`} className="nav-item tap flex items-center justify-between gap-2 px-4 py-3 hover:bg-paper-2">
                    <span className="min-w-0">
                      <span className="block font-bold">{c.name}</span>
                      <span className="t-sub text-ink-500">
                        {INDUSTRY_LABEL[c.industry]}
                        {c.assignedTo && c.assignedTo !== c.consultantId ? ' · 재배정' : ''}
                      </span>
                    </span>
                    {c.meetingAt && <span className="t-meta text-ink-500">{formatDate(c.meetingAt)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </FlatSection>
        <FlatSection title="전달 요청">
          {mine.hs.length === 0 ? (
            <p className="t-body text-ink-500">전달한 요청이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
              {mine.hs.map((h) => (
                <li key={h.id}>
                  <Link to={`/handoffs/${h.id}`} className="nav-item tap flex items-center justify-between gap-2 px-4 py-3 hover:bg-paper-2">
                    <span className="min-w-0">
                      <span className="block font-bold">{h.payload.company?.name ?? companyName(h.companyId)}</span>
                      <span className="t-sub text-ink-500">{formatDate(h.submittedAt ?? h.updatedAt, true)}</span>
                    </span>
                    <Badge tone={h.status === 'proposal_ready' ? 'ok' : h.status === 'withdrawn' ? 'warn' : 'info'}>{HANDOFF_STATUS_LABEL[h.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </FlatSection>
      </div>
      <FlatSection title="최근 활동" sub="partner_meeting_events — Partner OS 개선용 데이터입니다">
        {mine.us.length === 0 ? (
          <p className="t-body text-ink-500">아직 활동 기록이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
            {mine.us.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 t-sub">
                <span>
                  {EVENT_LABEL[u.eventType] ?? u.eventType}
                  {u.meetingId && ` · ${companyName(meetings.find((m) => m.id === u.meetingId)?.companyId ?? '')}`}
                </span>
                <span className="text-ink-500">
                  {formatDate(u.createdAt, true)} ({relativeDay(u.createdAt)})
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="t-meta mt-2 text-ink-500">미팅 기록: {mine.mts.map((m) => MEETING_STATUS_LABEL[m.status]).join(', ') || '없음'}</p>
      </FlatSection>
    </div>
  )
}
