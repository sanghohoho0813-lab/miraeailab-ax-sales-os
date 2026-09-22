import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, CalendarClock, Send, ArrowRight } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, Handoff, Meeting } from '../types/domain'
import { Button, EmptyState, PageTitle, Section, Badge, Spinner } from '../components/ui'
import { INDUSTRY_LABEL, HANDOFF_STATUS_LABEL, MEETING_STATUS_LABEL } from '../content/labels'
import { formatDate, relativeDay } from '../lib/util'

/** oxlint purity 규칙용 — 렌더 밖에서 읽는 현재 시각 */
function nowMs(): number {
  return Date.now()
}

export default function DashboardPage() {
  const { user, repo } = useSession()
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [handoffs, setHandoffs] = useState<Handoff[]>([])

  useEffect(() => {
    document.title = '홈 · AX 미팅 가이드'
    let alive = true
    ;(async () => {
      const [c, m, h] = await Promise.all([repo.listCompanies(user), repo.listMeetings(user), repo.listHandoffs(user)])
      if (!alive) return
      setCompanies(c)
      setMeetings(m)
      setHandoffs(h)
    })()
    return () => {
      alive = false
    }
  }, [repo, user])

  if (!companies) return <Spinner />

  // 렌더 시점 기준 — 3시간 전까지의 미팅은 아직 '오늘 미팅' 으로 둔다
  const now = nowMs()
  const upcoming = companies
    .filter((c) => c.meetingAt && new Date(c.meetingAt).getTime() > now - 3 * 3600_000)
    .sort((a, b) => (a.meetingAt! > b.meetingAt! ? 1 : -1))
    .slice(0, 5)
  const inProgress = meetings.filter((m) => m.status === 'live' || m.status === 'analyzed').slice(0, 5)
  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? '업체'
  const recentHandoffs = handoffs.slice(0, 5)

  return (
    <div className="space-y-5">
      <PageTitle
        title={`${user.name ? `${user.name}님, ` : ''}오늘 미팅 준비되셨나요?`}
        sub="업체 등록 → 미팅 전 브리핑 → 클릭형 1차 미팅 → 분석 → 김상호 대표에게 전달"
        action={
          <Link to="/companies/new">
            <Button variant="primary" size="lg" data-testid="cta-new-company">
              <Plus aria-hidden="true" className="size-5" /> 신규 업체 등록
            </Button>
          </Link>
        }
      />

      <Section title="오늘·다가오는 미팅" sub="미팅 5분 전, 업체를 열어 브리핑을 확인하세요.">
        {upcoming.length === 0 ? (
          <EmptyState title="예정된 미팅이 없습니다" body="업체를 등록할 때 미팅 일시를 넣으면 여기에 보입니다." />
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((c) => (
              <li key={c.id}>
                <Link to={`/companies/${c.id}`} className="tap flex items-center gap-3 py-3 hover:bg-paper-2">
                  <CalendarClock aria-hidden="true" className="size-6 shrink-0 text-accent-700" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1.05rem] font-bold">{c.name}</span>
                    <span className="t-sub block text-ink-500">
                      {INDUSTRY_LABEL[c.industry]} · {formatDate(c.meetingAt, true)} ({relativeDay(c.meetingAt)})
                      {c.diagnosis && ' · 사전진단 있음'}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-5 text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="진행 중인 미팅" sub="미팅 중이거나 분석까지 마친 건">
          {inProgress.length === 0 ? (
            <p className="t-body text-ink-500">진행 중인 미팅이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-line">
              {inProgress.map((m) => (
                <li key={m.id}>
                  <Link to={m.status === 'live' ? `/meetings/${m.id}/live` : `/meetings/${m.id}/result`} className="tap flex items-center justify-between gap-2 py-3 hover:bg-paper-2">
                    <span className="min-w-0">
                      <span className="block font-bold">{companyName(m.companyId)}</span>
                      <span className="t-sub text-ink-500">{formatDate(m.updatedAt, true)}</span>
                    </span>
                    <Badge tone={m.status === 'live' ? 'accent' : 'info'}>{MEETING_STATUS_LABEL[m.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="운영 OS 전달 상태" sub="김상호 대표에게 보낸 2차 제안 요청">
          {recentHandoffs.length === 0 ? (
            <p className="t-body text-ink-500">아직 전달한 건이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-line">
              {recentHandoffs.map((h) => (
                <li key={h.id}>
                  <Link to={`/handoffs/${h.id}`} className="tap flex items-center justify-between gap-2 py-3 hover:bg-paper-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Send aria-hidden="true" className="size-5 shrink-0 text-ink-500" />
                      <span className="min-w-0">
                        <span className="block font-bold">{h.payload.company?.name ?? companyName(h.companyId)}</span>
                        <span className="t-sub text-ink-500">{formatDate(h.submittedAt ?? h.updatedAt, true)}</span>
                      </span>
                    </span>
                    <Badge tone={h.status === 'proposal_ready' ? 'ok' : h.status === 'reviewing' ? 'info' : 'neutral'}>{HANDOFF_STATUS_LABEL[h.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {companies.length === 0 && (
        <EmptyState
          title="첫 업체를 등록해 보세요"
          body="회사명 하나와 클릭 몇 번이면 끝납니다. 아는 정보가 없으면 '잘 모르겠음' 을 고르면 됩니다."
          action={
            <Link to="/companies/new">
              <Button variant="primary" size="lg">
                신규 업체 등록
              </Button>
            </Link>
          }
        />
      )}
    </div>
  )
}
