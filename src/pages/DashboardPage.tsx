/**
 * 홈 — 첫 화면에는 인사 · 실시간 시계 · 오늘 미팅 N건 · [미팅 준비 시작] 하나만.
 * 그 아래 오늘 미팅 / 2차 제안 요청 대기 / 최근 상담. KPI 카드 나열 없음.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, Send } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, Handoff, Meeting } from '../types/domain'
import { Button, Badge, FlatSection, SkeletonList, useCountUp } from '../components/ui'
import { INDUSTRY_LABEL, HANDOFF_STATUS_LABEL, MEETING_STATUS_LABEL } from '../content/labels'
import { formatDate, relativeDay } from '../lib/util'

function sameDay(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false
  const d = new Date(iso)
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

export default function DashboardPage() {
  const { user, repo } = useSession()
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [handoffs, setHandoffs] = useState<Handoff[]>([])

  useEffect(() => {
    document.title = '홈 · AX Partner OS'
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

  const today = useMemo(() => {
    const now = new Date()
    return (companies ?? []).filter((c) => sameDay(c.meetingAt, now)).sort((a, b) => (a.meetingAt! > b.meetingAt! ? 1 : -1))
  }, [companies])
  const waiting = useMemo(() => handoffs.filter((h) => h.status !== 'proposal_ready').slice(0, 5), [handoffs])
  const recent = useMemo(() => meetings.filter((m) => m.status === 'analyzed' || m.status === 'submitted').slice(0, 5), [meetings])
  const companyName = (id: string) => companies?.find((c) => c.id === id)?.name ?? '업체'
  const todayCount = useCountUp(today.length)

  return (
    <div className="mx-auto max-w-[1200px] space-y-10">
      {/* 첫 화면 */}
      <section className="reveal">
        {/* 날짜·요일·시각은 글로벌 헤더가 어느 폭에서나 보여 준다 — 홈에서 한 번 더 크게 쓰면 첫 화면만 길어진다 */}
        <h1 className="t-page">
          안녕하세요, {user.name}
          {user.title ? ` ${user.title}` : ''}님
        </h1>
        <p className="t-body mt-3 text-ink-700">
          오늘 예정된 미팅{' '}
          <strong className="text-[1.25rem] font-black text-accent-700" data-testid="today-count">
            {companies ? todayCount : '–'}건
          </strong>
          {waiting.length > 0 && (
            <>
              {' '}
              · 2차 제안 요청 대기 <strong className="font-black">{waiting.length}건</strong>
            </>
          )}
        </p>
        <div className="mt-6">
          <Link to="/companies/new">
            <Button variant="primary" size="lg" className="w-full sm:w-auto sm:min-w-[260px]" data-testid="cta-new-company">
              미팅 준비 시작
            </Button>
          </Link>
        </div>
      </section>

      {!companies ? (
        <SkeletonList rows={2} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <FlatSection title="오늘 미팅" sub="미팅 5분 전에 전략을 다시 봅니다">
            {today.length === 0 ? (
              <p className="rounded-(--radius-card) border border-dashed border-line-strong bg-white px-5 py-6 t-body text-ink-500">오늘 예정된 미팅이 없습니다. 미팅 일시를 넣으면 여기에 올라옵니다.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
                {today.map((c) => (
                  <li key={c.id}>
                    <Link to={`/companies/${c.id}`} className="nav-item tap flex items-center gap-3 px-4 py-3.5 hover:bg-paper-2">
                      <CalendarClock aria-hidden="true" className="size-6 shrink-0 text-accent-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[1.08rem] font-bold">{c.name}</span>
                        <span className="t-sub block text-ink-500">
                          {INDUSTRY_LABEL[c.industry]} · {formatDate(c.meetingAt, true)}
                          {c.diagnosis && ' · 사전진단 있음'}
                        </span>
                      </span>
                      <ArrowRight aria-hidden="true" className="size-5 text-ink-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </FlatSection>

          <FlatSection title="2차 제안 요청 대기" sub="김상호 대표가 검토 중인 요청">
            {waiting.length === 0 ? (
              <p className="rounded-(--radius-card) border border-dashed border-line-strong bg-white px-5 py-6 t-body text-ink-500">대기 중인 요청이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
                {waiting.map((h) => (
                  <li key={h.id}>
                    <Link to={`/handoffs/${h.id}`} className="nav-item tap flex items-center gap-3 px-4 py-3.5 hover:bg-paper-2">
                      <Send aria-hidden="true" className="size-5 shrink-0 text-ink-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[1.08rem] font-bold">{h.payload.company?.name ?? companyName(h.companyId)}</span>
                        <span className="t-sub block text-ink-500">{formatDate(h.submittedAt ?? h.updatedAt, true)}</span>
                      </span>
                      <Badge tone={h.status === 'reviewing' ? 'info' : 'neutral'}>{HANDOFF_STATUS_LABEL[h.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </FlatSection>
        </div>
      )}

      {companies && recent.length > 0 && (
        <FlatSection title="최근 상담" sub="분석까지 마쳤거나 전달한 미팅">
          <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
            {recent.map((m) => (
              <li key={m.id}>
                <Link to={m.status === 'submitted' && m.handoffId ? `/handoffs/${m.handoffId}` : `/meetings/${m.id}/result`} className="nav-item tap flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-paper-2">
                  <span className="min-w-0">
                    <span className="block text-[1.05rem] font-bold">{companyName(m.companyId)}</span>
                    <span className="t-sub text-ink-500">
                      {formatDate(m.endedAt ?? m.updatedAt, true)} ({relativeDay(m.endedAt ?? m.updatedAt)})
                    </span>
                  </span>
                  <Badge tone={m.status === 'submitted' ? 'ok' : 'info'}>{MEETING_STATUS_LABEL[m.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </FlatSection>
      )}
    </div>
  )
}
