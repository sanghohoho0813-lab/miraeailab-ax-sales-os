/**
 * BEFORE — 미팅 전략 화면. "내일 ABC산업은 이렇게 접근하세요" → 공략 포인트 3개 → 오늘 목표 → 주의 → [미팅 시작].
 * 긴 설명은 [자세히 보기] 아래. 그 아래 사전진단 · 추천 사례 2개 · 오늘 질문 · 미팅 기록.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Play, Pencil, RefreshCw, ArrowLeft } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Answer, CaseStudy, Company, Meeting } from '../types/domain'
import { AccentStrip, Badge, Button, Disclosure, FlatSection, Insight, SkeletonList, useToast } from '../components/ui'
import { CaseRow } from '../components/CaseRow'
import { AREA_LABEL, DIAGNOSIS_GRADE_LABEL, HEADCOUNT_LABEL, INDUSTRY_LABEL, INTEREST_LABEL, MEETING_STATUS_LABEL, TRADE_LABEL } from '../content/labels'
import { buildBriefing } from '../engine/briefing'
import { planQuestions } from '../engine/questionSelector'
import { recommendCases } from '../engine/caseMatcher'
import { formatDate, nowIso, relativeDay } from '../lib/util'

function whenLabel(iso: string | null): string {
  if (!iso) return ''
  const r = relativeDay(iso)
  return r ? `${r} ` : ''
}

export default function CompanyPage() {
  const { user, repo } = useSession()
  const { companyId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [company, setCompany] = useState<Company | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [cases, setCases] = useState<CaseStudy[]>([])
  const [busy, setBusy] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!companyId) return
    let alive = true
    Promise.all([repo.getCompany(user, companyId), repo.listMeetings(user, companyId), repo.listCases(user)]).then(([c, m, cs]) => {
      if (!alive) return
      if (!c) return setNotFound(true)
      setCompany(c)
      setMeetings(m)
      setCases(cs)
      document.title = `${c.name} 미팅 전략 · AX Partner OS`
    })
    return () => {
      alive = false
    }
  }, [companyId, repo, user])

  const briefing = useMemo(() => (company ? buildBriefing(company) : null), [company])
  const plan = useMemo(() => (company ? planQuestions(company) : null), [company])
  const rec = useMemo(() => {
    if (!company || !plan) return null
    const areas = plan.all.slice(0, 4).map((q) => q.area)
    const fundingInterest = company.interests.some((i) => i === 'policy_fund' || i === 'gov_support' || i === 'rnd' || i === 'venture')
    return recommendCases(cases, company, areas, { areaLabel: (a) => AREA_LABEL[a], fundingInterest })
  }, [cases, company, plan])

  if (notFound) return <p className="t-body text-ink-500">업체를 찾을 수 없습니다.</p>
  if (!company || !briefing || !rec || !plan) return <SkeletonList rows={3} />

  const liveMeeting = meetings.find((m) => m.status === 'live' || m.status === 'draft')

  async function startMeeting() {
    if (!company || !plan || busy) return
    setBusy(true)
    try {
      if (liveMeeting) return navigate(`/meetings/${liveMeeting.id}/live`)
      const prefilled: Record<string, Answer> = {}
      for (const p of plan.prefilled) prefilled[p.question.id] = { questionId: p.question.id, value: p.value, source: 'diagnosis', at: nowIso() }
      const m = await repo.createMeeting(
        user,
        company.id,
        plan.all.map((q) => q.id),
        prefilled,
      )
      navigate(`/meetings/${m.id}/live`)
    } finally {
      setBusy(false)
    }
  }

  async function refreshDiagnosis() {
    if (!company) return
    const d = await repo.lookupDiagnosis(user, company.name, company.phone)
    if (!d) return toast.show('일치하는 사전진단이 없습니다. 회사명과 대표 연락처를 확인해 주세요.')
    const next = await repo.updateCompany(user, { ...company, diagnosis: d })
    setCompany(next)
    toast.show('사전진단을 연결했습니다.', 'ok')
  }

  const d = company.diagnosis
  const recs = [rec.primary, rec.secondary].filter((m): m is NonNullable<typeof m> => Boolean(m))

  return (
    <div className="mx-auto max-w-[1100px] space-y-10">
      {/* 전략 — 첫 화면 */}
      <section className="reveal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/companies" className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
            <ArrowLeft aria-hidden="true" className="size-4" /> 고객
          </Link>
          <Link to={`/companies/${company.id}/edit`} className="t-sub inline-flex items-center gap-1 font-semibold text-ink-500 hover:text-ink-900">
            <Pencil aria-hidden="true" className="size-4" /> 정보 수정
          </Link>
        </div>
        <h1 className="t-page mt-3" data-testid="strategy-title">
          {whenLabel(company.meetingAt)}
          {company.name}은 이렇게 접근하세요
        </h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>
            {INDUSTRY_LABEL[company.industry]}
            {company.industryNote ? ` · ${company.industryNote}` : ''}
          </Badge>
          <Badge>{HEADCOUNT_LABEL[company.headcount]}</Badge>
          <Badge>{TRADE_LABEL[company.tradeType]}</Badge>
          {company.interests.map((i) => (
            <Badge key={i} tone="accent">
              {INTEREST_LABEL[i]}
            </Badge>
          ))}
          {company.meetingAt && <Badge tone="info">미팅 {formatDate(company.meetingAt, true)}</Badge>}
        </div>

        <ol className="mt-7 grid gap-3 md:grid-cols-3" aria-label="오늘 공략 포인트">
          {briefing.chain.map((c, i) => (
            <li key={c} className="reveal rounded-(--radius-card) border border-line bg-white p-5" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="tnum inline-flex size-9 items-center justify-center rounded-full bg-accent-600 text-[1.05rem] font-black text-white" aria-hidden="true">
                {i + 1}
              </span>
              <p className="mt-3 text-[1.15rem] font-bold leading-snug">{c}</p>
            </li>
          ))}
        </ol>
        <p className="t-meta mt-2 font-bold tracking-wide text-accent-800">오늘 공략 포인트 {briefing.chain.length}가지</p>

        <div className="mt-6 grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <Insight>{briefing.goal}</Insight>
          <AccentStrip label="주의" tone="warn">
            <ul className="space-y-1">
              {briefing.cautions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </AccentStrip>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button variant="primary" size="lg" className="w-full sm:w-auto sm:min-w-[240px]" onClick={() => void startMeeting()} disabled={busy} data-testid="start-meeting">
            <Play aria-hidden="true" className="size-5" /> {liveMeeting ? '미팅 이어가기' : '미팅 시작'}
          </Button>
          <span className="t-sub text-ink-500">
            질문 {plan.ask.length}개{plan.prefilled.length > 0 && ` · 사전진단으로 ${plan.prefilled.length}개 건너뜀`}
          </span>
        </div>
        <div className="mt-4">
          <Disclosure label="자세히 보기">{briefing.detail}</Disclosure>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* 사전진단 */}
        <FlatSection
          title="홈페이지 3분 AX Fit 사전진단"
          sub={d ? '대표님이 이미 체크한 내용 — 같은 질문을 다시 하지 않습니다' : '회사명 + 대표 연락처가 일치하면 자동 연결'}
          action={
            !d && (
              <Button size="sm" onClick={() => void refreshDiagnosis()}>
                <RefreshCw aria-hidden="true" className="size-4" /> 다시 찾기
              </Button>
            )
          }
        >
          <div className="rounded-(--radius-card) border border-line bg-white p-4 sm:p-5">
            {d ? (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">AX Fit {d.grade ? DIAGNOSIS_GRADE_LABEL[d.grade] : '등급 미확인'}</Badge>
                  {d.submittedAt && <span className="t-sub text-ink-500">{formatDate(d.submittedAt)}</span>}
                  <span className="t-meta text-ink-500">🟡 추정 — 미팅에서 확인하면 ✅</span>
                </div>
                {briefing.diagnosisLines.length > 0 && (
                  <ul className="t-body mt-3 list-disc space-y-1 pl-5">
                    {briefing.diagnosisLines.map((l) => (
                      <li key={l}>"{l}" 라고 체크했습니다.</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="t-body text-ink-500">연결된 사전진단이 없습니다. 미팅에서 처음부터 확인합니다.</p>
            )}
          </div>
        </FlatSection>

        {/* 오늘 질문 */}
        <FlatSection title="오늘 물어볼 질문" sub={`${plan.ask.length}개 — 업종·관심사에 맞춰 골랐습니다. 한 화면에 하나씩, 클릭으로 답합니다.`}>
          <ol className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
            {plan.ask.map((q, i) => (
              <li key={q.id} className="flex gap-3 px-4 py-2.5">
                <span className="tnum t-sub w-6 shrink-0 font-black text-accent-700">{i + 1}</span>
                <span className="t-body">{q.title}</span>
              </li>
            ))}
            {plan.prefilled.map((p) => (
              <li key={p.question.id} className="flex gap-3 bg-paper px-4 py-2.5">
                <span className="w-6 shrink-0" aria-hidden="true">
                  🟡
                </span>
                <span className="t-sub text-ink-500">
                  {p.question.title} <span className="font-semibold">— 사전진단으로 미리 채움</span>
                </span>
              </li>
            ))}
          </ol>
        </FlatSection>
      </div>

      {/* 추천 사례 */}
      <FlatSection title="이 미팅에 쓸 실제 사례" sub="① 같은/가까운 업종 ② 업종은 달라도 문제구조가 비슷한 사례 — 리서치 원문 기반" action={<Link to="/cases" className="t-sub font-semibold text-accent-700 hover:underline">사례 더 찾기</Link>}>
        {recs.length === 0 ? (
          <p className="rounded-(--radius-card) border border-dashed border-line-strong bg-white px-5 py-6 t-body text-ink-500">검수된 사례 중 맞는 것이 없습니다. 사례 탐색에서 직접 찾아보세요.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {recs.map((m) => (
              <CaseRow key={m.caseStudy.id} c={m.caseStudy} reason={m.reasons.slice(0, 2).join(' · ')} onOpen={() => void repo.track(user, 'case_opened', null, { caseId: m.caseStudy.id, from: 'brief' })} />
            ))}
          </div>
        )}
      </FlatSection>

      {meetings.length > 0 && (
        <FlatSection title="미팅 기록">
          <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link to={m.status === 'live' || m.status === 'draft' ? `/meetings/${m.id}/live` : m.status === 'submitted' && m.handoffId ? `/handoffs/${m.handoffId}` : `/meetings/${m.id}/result`} className="nav-item tap flex items-center justify-between gap-2 px-4 py-3 hover:bg-paper-2">
                  <span className="t-body">{formatDate(m.startedAt ?? m.createdAt, true)}</span>
                  <Badge tone={m.status === 'submitted' ? 'ok' : m.status === 'live' ? 'accent' : 'neutral'}>{MEETING_STATUS_LABEL[m.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </FlatSection>
      )}
    </div>
  )
}
