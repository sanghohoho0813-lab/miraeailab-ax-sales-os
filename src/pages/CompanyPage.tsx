/**
 * BEFORE — 미팅 전 브리핑. 첫 화면은 짧게. [자세히 보기] 에서만 1문단.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Play, Pencil, RefreshCw } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Answer, CaseStudy, Company, Meeting } from '../types/domain'
import { Badge, Button, Disclosure, PageTitle, Section, Spinner, useToast } from '../components/ui'
import { CaseCard } from '../components/CaseCard'
import { AREA_LABEL, DIAGNOSIS_GRADE_LABEL, HEADCOUNT_LABEL, INDUSTRY_LABEL, INTEREST_LABEL, MEETING_STATUS_LABEL, TRADE_LABEL } from '../content/labels'
import { buildBriefing } from '../engine/briefing'
import { selectQuestions } from '../engine/questionSelector'
import { prefillFromDiagnosis } from '../engine/diagnosis'
import { recommendCases } from '../engine/caseMatcher'
import { formatDate, nowIso } from '../lib/util'

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
      document.title = `${c.name} · AX 미팅 가이드`
    })
    return () => {
      alive = false
    }
  }, [companyId, repo, user])

  const briefing = useMemo(() => (company ? buildBriefing(company) : null), [company])
  const questions = useMemo(() => (company ? selectQuestions(company) : []), [company])
  const rec = useMemo(() => {
    if (!company) return null
    // 미팅 전에는 관심사·업종 접근 체인을 문제 축으로 삼아 추천한다
    const areas = briefing?.chain.length ? questions.slice(0, 4).map((q) => q.area) : []
    return recommendCases(cases, company, areas, { areaLabel: (a) => AREA_LABEL[a] })
  }, [cases, company, briefing, questions])

  if (notFound) return <p className="t-body text-ink-500">업체를 찾을 수 없습니다.</p>
  if (!company || !briefing || !rec) return <Spinner />

  const liveMeeting = meetings.find((m) => m.status === 'live' || m.status === 'draft')

  async function startMeeting() {
    if (!company || busy) return
    setBusy(true)
    try {
      if (liveMeeting) return navigate(`/meetings/${liveMeeting.id}/live`)
      const prefilled: Record<string, Answer> = {}
      for (const q of questions) {
        const p = prefillFromDiagnosis(q, company.diagnosis)
        if (p) prefilled[q.id] = { questionId: q.id, value: p.value, source: 'diagnosis', at: nowIso() }
      }
      const m = await repo.createMeeting(
        user,
        company.id,
        questions.map((q) => q.id),
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

  return (
    <div className="space-y-5">
      <PageTitle
        title={company.name}
        back={<Link to="/companies" className="t-sub text-ink-500 hover:underline">← 내 고객</Link>}
        action={
          <Link to={`/companies/${company.id}/edit`}>
            <Button size="sm">
              <Pencil aria-hidden="true" className="size-4" /> 수정
            </Button>
          </Link>
        }
      />
      <div className="flex flex-wrap gap-1.5">
        <Badge>{INDUSTRY_LABEL[company.industry]}{company.industryNote ? ` · ${company.industryNote}` : ''}</Badge>
        <Badge>{HEADCOUNT_LABEL[company.headcount]}</Badge>
        <Badge>{TRADE_LABEL[company.tradeType]}</Badge>
        {company.interests.map((i) => (
          <Badge key={i} tone="accent">
            {INTEREST_LABEL[i]}
          </Badge>
        ))}
        {company.meetingAt && <Badge tone="info">미팅 {formatDate(company.meetingAt, true)}</Badge>}
      </div>

      {/* 오늘의 접근법 */}
      <Section title="오늘의 접근법" className="border-accent-200 bg-accent-50/40">
        <p className="t-meta font-bold tracking-wide text-accent-800">오늘 공략 포인트</p>
        <p className="mt-1 text-[1.15rem] font-bold leading-snug">{briefing.chain.join(' → ')}</p>
        <p className="t-meta mt-4 font-bold tracking-wide text-accent-800">오늘의 목표</p>
        <p className="t-body mt-1">{briefing.goal}</p>
        <p className="t-meta mt-4 font-bold tracking-wide text-accent-800">주의</p>
        <ul className="t-body mt-1 list-disc space-y-0.5 pl-5">
          {briefing.cautions.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="mt-3">
          <Disclosure label="자세히 보기">{briefing.detail}</Disclosure>
        </div>
      </Section>

      {/* 사전진단 */}
      <Section
        title="홈페이지 3분 AX Fit 사전진단"
        sub={d ? '대표님이 이미 체크한 내용입니다. 같은 질문을 다시 하지 마세요.' : '회사명 + 대표 연락처가 일치하면 자동으로 연결됩니다.'}
        action={
          !d && (
            <Button size="sm" onClick={() => void refreshDiagnosis()}>
              <RefreshCw aria-hidden="true" className="size-4" /> 다시 찾기
            </Button>
          )
        }
      >
        {d ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">AX Fit {d.grade ? DIAGNOSIS_GRADE_LABEL[d.grade] : '등급 미확인'}</Badge>
              {d.score !== null && <span className="t-sub text-ink-500">내부 지표 {d.score}/100</span>}
              {d.submittedAt && <span className="t-sub text-ink-500">· {formatDate(d.submittedAt)}</span>}
              <span className="t-meta text-ink-500">🟡 추정 — 미팅에서 확인하면 ✅ 로 바뀝니다</span>
            </div>
            {briefing.diagnosisLines.length > 0 && (
              <ul className="t-body mt-2 list-disc space-y-0.5 pl-5">
                {briefing.diagnosisLines.map((l) => (
                  <li key={l}>대표님이 사전진단에서 "{l}" 라고 체크했습니다.</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="t-body text-ink-500">연결된 사전진단이 없습니다.</p>
        )}
      </Section>

      {/* 추천 사례 */}
      <Section title="추천 사례" sub="① 같은/가까운 업종 ② 업종은 달라도 문제구조가 비슷한 사례" action={<Link to="/cases" className="t-sub font-semibold text-accent-700 hover:underline">다른 사례 보기</Link>}>
        <div className="grid gap-3 md:grid-cols-2">
          {[rec.primary, rec.secondary].filter((m): m is NonNullable<typeof m> => Boolean(m)).map((m) => (
            <CaseCard key={m.caseStudy.id} caseStudy={m.caseStudy} whySimilar={m.whySimilar} compact onOpen={() => void repo.track(user, 'case_opened', null, { caseId: m.caseStudy.id, from: 'brief' })} />
          ))}
        </div>
      </Section>

      {/* 미팅 시작 */}
      <Section title="오늘 물어볼 질문" sub={`${questions.length}개 — 업종·관심사에 맞춰 골랐습니다. 한 화면에 하나씩, 클릭으로 답합니다.`}>
        <ol className="t-body list-decimal space-y-1 pl-6">
          {questions.map((q) => (
            <li key={q.id}>
              {q.title}
              {prefillFromDiagnosis(q, d) && <Badge tone="warn">사전진단으로 미리 채움</Badge>}
            </li>
          ))}
        </ol>
        <div className="mt-4">
          <Button variant="primary" size="lg" className="w-full sm:w-auto" onClick={() => void startMeeting()} disabled={busy} data-testid="start-meeting">
            <Play aria-hidden="true" className="size-5" /> {liveMeeting ? '미팅 이어가기' : '미팅 시작'}
          </Button>
        </div>
      </Section>

      {meetings.length > 0 && (
        <Section title="미팅 기록">
          <ul className="divide-y divide-line">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link to={m.status === 'live' || m.status === 'draft' ? `/meetings/${m.id}/live` : `/meetings/${m.id}/result`} className="tap flex items-center justify-between gap-2 py-3 hover:bg-paper-2">
                  <span className="t-body">{formatDate(m.startedAt ?? m.createdAt, true)}</span>
                  <Badge tone={m.status === 'submitted' ? 'ok' : m.status === 'live' ? 'accent' : 'neutral'}>{MEETING_STATUS_LABEL[m.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  )
}
