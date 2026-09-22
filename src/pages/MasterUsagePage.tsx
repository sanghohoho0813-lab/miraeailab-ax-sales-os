/** MASTER — 사용 데이터: Partner OS 개선용. 미팅 10건 미만이면 패턴을 보여 주지 않는다(개별 성과평가처럼 보이지 않게). */
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../lib/auth'
import type { CaseStudy, Handoff, Meeting, UsageEvent } from '../types/domain'
import { FlatSection, PageTitle, SkeletonList, Stat } from '../components/ui'
import { QUESTION_BY_ID } from '../content/questions'
import { PLAYBOOK } from '../content/playbook'

const MIN_MEETINGS = 10

function topCounts(items: string[], n = 5): { key: string; count: number }[] {
  const m = new Map<string, number>()
  for (const k of items) m.set(k, (m.get(k) ?? 0) + 1)
  return [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

export default function MasterUsagePage() {
  const { user, repo } = useSession()
  const [usage, setUsage] = useState<UsageEvent[] | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [cases, setCases] = useState<CaseStudy[]>([])
  useEffect(() => {
    document.title = '사용 데이터 · AX Partner OS'
    void Promise.all([repo.listUsage(user), repo.listMeetings(user), repo.listHandoffs(user), repo.listCases(user)]).then(([u, m, h, c]) => {
      setUsage(u)
      setMeetings(m)
      setHandoffs(h)
      setCases(c)
    })
  }, [repo, user])

  const stats = useMemo(() => {
    const done = meetings.filter((m) => m.status === 'analyzed' || m.status === 'submitted')
    const durations = done.filter((m) => m.startedAt && m.endedAt).map((m) => (new Date(m.endedAt!).getTime() - new Date(m.startedAt!).getTime()) / 60000).filter((x) => x > 0 && x < 300)
    const avgMin = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0
    const avgQ = done.length ? Math.round(done.reduce((a, m) => a + m.questionIds.length, 0) / done.length) : 0
    const u = usage ?? []
    const skipped = topCounts(u.filter((e) => e.eventType === 'question_skipped').map((e) => String(e.payload.questionId ?? '')))
    const hard = topCounts(u.filter((e) => e.eventType === 'question_hard').map((e) => String(e.payload.questionId ?? '')))
    const openedCases = topCounts(u.filter((e) => e.eventType === 'case_opened').map((e) => String(e.payload.caseId ?? '')))
    const playbook = topCounts(u.filter((e) => e.eventType === 'playbook_opened').map((e) => String(e.payload.sectionId ?? '')))
    const submitted = handoffs.filter((h) => h.status !== 'withdrawn').length
    return { done: done.length, avgMin, avgQ, skipped, hard, openedCases, playbook, submitted, ratio: done.length ? Math.round((submitted / done.length) * 100) : 0 }
  }, [usage, meetings, handoffs])

  if (!usage) return <SkeletonList rows={3} />
  const qTitle = (id: string) => QUESTION_BY_ID[id]?.title ?? id
  const caseName = (id: string) => cases.find((c) => c.id === id)?.companyName ?? id
  const sectionTitle = (id: string) => PLAYBOOK.find((s) => s.id === id)?.title ?? id

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <PageTitle title="사용 데이터" sub="Partner OS 개선용 — 개별 파트너 평가가 아니라 어떤 질문·사례·설명이 현장에서 통하는지 보는 자료입니다." />
      <div className="grid gap-4 rounded-(--radius-card) border border-line bg-white p-5 sm:grid-cols-4">
        <Stat label="마무리한 미팅" value={stats.done} unit="건" />
        <Stat label="평균 미팅 시간" value={stats.avgMin} unit="분" hint="시작~마무리" />
        <Stat label="평균 질문 수" value={stats.avgQ} unit="개" />
        <Stat label="미팅 → 2차 제안 요청" value={stats.ratio} unit="%" hint={`${stats.submitted}건 전달`} />
      </div>
      {stats.done < MIN_MEETINGS ? (
        <div className="rounded-(--radius-card) border border-dashed border-line-strong bg-white px-5 py-8 text-center" data-testid="usage-gate">
          <p className="t-section">아직 학습 데이터가 충분하지 않습니다.</p>
          <p className="t-body mt-1 text-ink-500">
            {MIN_MEETINGS}건 이후부터 패턴을 보여드립니다. (지금 {stats.done}건)
          </p>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2" data-testid="usage-patterns">
          <FlatSection title="건너뛴 질문 TOP" sub="많이 건너뛰면 문구를 바꿀 신호">
            <ol className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
              {stats.skipped.length === 0 && <li className="px-4 py-3 t-sub text-ink-500">없음</li>}
              {stats.skipped.map((x) => (
                <li key={x.key} className="flex justify-between gap-3 px-4 py-2.5 t-sub">
                  <span className="min-w-0 flex-1 truncate">{qTitle(x.key)}</span>
                  <b className="tnum">{x.count}</b>
                </li>
              ))}
            </ol>
          </FlatSection>
          <FlatSection title="답하기 어려워한 질문 TOP">
            <ol className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
              {stats.hard.length === 0 && <li className="px-4 py-3 t-sub text-ink-500">없음</li>}
              {stats.hard.map((x) => (
                <li key={x.key} className="flex justify-between gap-3 px-4 py-2.5 t-sub">
                  <span className="min-w-0 flex-1 truncate">{qTitle(x.key)}</span>
                  <b className="tnum">{x.count}</b>
                </li>
              ))}
            </ol>
          </FlatSection>
          <FlatSection title="가장 많이 본 사례">
            <ol className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
              {stats.openedCases.length === 0 && <li className="px-4 py-3 t-sub text-ink-500">없음</li>}
              {stats.openedCases.map((x) => (
                <li key={x.key} className="flex justify-between gap-3 px-4 py-2.5 t-sub">
                  <span className="min-w-0 flex-1 truncate">{caseName(x.key)}</span>
                  <b className="tnum">{x.count}</b>
                </li>
              ))}
            </ol>
          </FlatSection>
          <FlatSection title="가장 많이 연 플레이북">
            <ol className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
              {stats.playbook.length === 0 && <li className="px-4 py-3 t-sub text-ink-500">없음</li>}
              {stats.playbook.map((x) => (
                <li key={x.key} className="flex justify-between gap-3 px-4 py-2.5 t-sub">
                  <span className="min-w-0 flex-1 truncate">{sectionTitle(x.key)}</span>
                  <b className="tnum">{x.count}</b>
                </li>
              ))}
            </ol>
          </FlatSection>
        </div>
      )}
    </div>
  )
}
