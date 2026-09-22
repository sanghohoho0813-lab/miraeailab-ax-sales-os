/**
 * AFTER — 미팅 종료 분석 + 가장 중요한 CTA [김상호 대표에게 2차 제안 요청].
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Printer, RefreshCw, Send, Pencil, CheckCircle2 } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { CaseStudy, Company, Handoff, Meeting } from '../types/domain'
import { Badge, Button, EvidenceBadge, LevelBadge, PageTitle, Section, Spinner, useToast } from '../components/ui'
import { CaseCard } from '../components/CaseCard'
import { AREA_LABEL, HANDOFF_STATUS_LABEL, LEVEL_KO, VALUE_AREA_LABEL, VALUE_AREA_ORDER } from '../content/labels'
import { guardText } from '../content/forbidden'
import { analyzeMeeting } from '../engine/analysis'
import { buildCustomerSafeEventPayload, buildHandoffPayload } from '../engine/handoffBuilder'
import { formatDate } from '../lib/util'

export default function MeetingResultPage() {
  const { user, repo } = useSession()
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [cases, setCases] = useState<CaseStudy[]>([])
  const [handoff, setHandoff] = useState<Handoff | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!meetingId) return
    let alive = true
    ;(async () => {
      const m = await repo.getMeeting(user, meetingId)
      if (!alive || !m) return
      const [c, cs, h] = await Promise.all([repo.getCompany(user, m.companyId), repo.listCases(user), repo.getHandoffByMeeting(user, m.id)])
      if (!alive) return
      setCompany(c)
      setCases(cs)
      setHandoff(h)
      if (!m.analysis && c) {
        const analyzed = await repo.updateMeeting(user, { ...m, status: m.status === 'live' || m.status === 'draft' ? 'analyzed' : m.status, analysis: analyzeMeeting(c, m, cs) })
        setMeeting(analyzed)
      } else setMeeting(m)
      document.title = `${c?.name ?? ''} 분석 · AX 미팅 가이드`
    })()
    return () => {
      alive = false
    }
  }, [meetingId, repo, user])

  const a = meeting?.analysis ?? null
  const similar = useMemo(() => (a ? a.similarCaseIds.map((id) => cases.find((c) => c.id === id)).filter((c): c is CaseStudy => Boolean(c)) : []), [a, cases])
  const hits = useMemo(() => (meeting ? guardText(`${meeting.keyQuote}\n${meeting.memo}`) : []), [meeting])

  if (!meeting || !company || !a) return <Spinner />

  async function reanalyze() {
    if (!meeting || !company) return
    const next = await repo.updateMeeting(user, { ...meeting, analysis: analyzeMeeting(company, meeting, cases) })
    setMeeting(next)
    toast.show('분석을 다시 만들었습니다. 원본 답변은 그대로입니다.', 'ok')
  }

  async function submit() {
    if (!meeting || !company || !meeting.analysis || busy) return
    setBusy(true)
    try {
      const payload = buildHandoffPayload(company, meeting, meeting.analysis, user, cases)
      const r = await repo.submitHandoff(user, meeting.id, payload, buildCustomerSafeEventPayload(payload))
      setHandoff(r.handoff)
      setMeeting({ ...meeting, status: 'submitted', handoffId: r.handoff.id })
      if (r.created) void repo.track(user, 'handoff_submitted', meeting.id, { handoffId: r.handoff.id })
      toast.show(r.created ? '✓ 미래AI랩 운영 OS 로 전달되었습니다.' : '이미 전달된 건입니다. 중복 등록하지 않았습니다.', 'ok')
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '전달하지 못했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const scopeTone = a.scopeLevel === 'C' ? 'accent' : a.scopeLevel === 'D' ? 'neutral' : 'info'

  return (
    <div className="space-y-5">
      <PageTitle title={`${company.name} · 1차 미팅 분석`} sub={`${formatDate(meeting.endedAt ?? meeting.updatedAt, true)} · 분석 v${a.version} · 원본 답변은 보존됩니다`} back={<Link to={`/companies/${company.id}`} className="t-sub text-ink-500 hover:underline">← {company.name}</Link>} />

      {/* CTA — 가장 중요한 기능 */}
      <Section title="김상호 대표에게 2차 제안 요청" sub="PDF 가 아니라 구조화 데이터로 운영 OS 에 바로 들어갑니다. 두 번 눌러도 한 번만 등록됩니다." className="border-accent-600 bg-accent-50/40">
        {handoff ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="inline-flex items-center gap-2 text-[1.1rem] font-bold text-ok-700">
              <CheckCircle2 aria-hidden="true" className="size-6" /> 미래AI랩 운영 OS 로 전달되었습니다.
            </p>
            <Badge tone={handoff.status === 'proposal_ready' ? 'ok' : 'info'}>{HANDOFF_STATUS_LABEL[handoff.status]}</Badge>
            <Link to={`/handoffs/${handoff.id}`} className="t-sub font-semibold text-accent-700 hover:underline">
              전달 내용 보기
            </Link>
          </div>
        ) : (
          <Button variant="primary" size="lg" className="w-full sm:w-auto" onClick={() => void submit()} disabled={busy} data-testid="submit-handoff">
            <Send aria-hidden="true" className="size-5" /> {busy ? '전달 중…' : '김상호 대표에게 2차 제안 요청'}
          </Button>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={`/meetings/${meeting.id}/report`} onClick={() => void repo.track(user, 'pdf_printed', meeting.id)}>
            <Button size="sm">
              <Printer aria-hidden="true" className="size-4" /> PDF 저장 (내부 리포트)
            </Button>
          </Link>
          <Button size="sm" onClick={() => void reanalyze()}>
            <RefreshCw aria-hidden="true" className="size-4" /> 분석 다시 하기
          </Button>
          {!handoff && (
            <Button size="sm" onClick={() => navigate(`/meetings/${meeting.id}/live`)}>
              <Pencil aria-hidden="true" className="size-4" /> 답변 수정
            </Button>
          )}
        </div>
      </Section>

      {/* 오늘의 AX 포인트 */}
      <div className="rounded-(--radius-card) bg-ink-900 px-5 py-4 text-white">
        <p className="t-meta font-bold tracking-wide text-accent-200">오늘의 AX 포인트</p>
        <p className="mt-1 text-[1.15rem] font-bold leading-snug">{a.todaysPoint}</p>
      </div>

      {/* 핵심 문제 TOP 3 */}
      <Section title="핵심 문제 TOP 3" sub="문제 → 발생하는 손실/기회 → AX 해결구조">
        {a.painPoints.length === 0 ? (
          <p className="t-body text-ink-500">강한 문제 신호가 없습니다. 추가 확인 질문으로 2차 미팅에서 채우세요.</p>
        ) : (
          <ol className="space-y-3">
            {a.painPoints.map((p) => (
              <li key={p.area} className="rounded-(--radius-control) border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-full bg-accent-600 text-[0.95rem] font-black text-white">{p.rank}</span>
                  <span className="text-[1.05rem] font-bold">{p.title}</span>
                  <EvidenceBadge status={p.status} />
                  <Badge>{AREA_LABEL[p.area]}</Badge>
                </div>
                <dl className="t-body mt-2 grid gap-1.5 sm:grid-cols-[6rem_1fr]">
                  <dt className="font-bold text-ink-500">↓ 손실/기회</dt>
                  <dd>{p.loss}</dd>
                  <dt className="font-bold text-ink-500">↓ AX 구조</dt>
                  <dd>{p.axStructure}</dd>
                  <dt className="font-bold text-ink-500">고객용 표현</dt>
                  <dd className="text-ink-700">{p.clientSafeTitle}</dd>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </Section>

      {/* 분리 평가 */}
      <Section title="프로젝트 범위 가설" sub="정확한 견적은 미래AI랩 Master 검토 후 확정합니다. 네 축을 하나의 점수로 합치지 않습니다.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-(--radius-control) bg-paper-2 p-3">
            <p className="t-meta font-bold text-ink-500">AX 필요도</p>
            <p className="mt-1 flex items-center gap-2 text-[1.05rem] font-bold">
              <LevelBadge level={a.axNeed} /> {LEVEL_KO[a.axNeed]}
            </p>
          </div>
          <div className="rounded-(--radius-control) bg-paper-2 p-3">
            <p className="t-meta font-bold text-ink-500">예상 구축범위</p>
            <p className="mt-1 flex items-center gap-2 text-[1.05rem] font-bold">
              <Badge tone={scopeTone}>LEVEL {a.scopeLevel}</Badge> {a.scopeLabel}
            </p>
          </div>
          <div className="rounded-(--radius-control) bg-paper-2 p-3">
            <p className="t-meta font-bold text-ink-500">실증 잠재력</p>
            <p className="mt-1 flex items-center gap-2 text-[1.05rem] font-bold">
              <LevelBadge level={a.validationPotential} /> {LEVEL_KO[a.validationPotential]}
            </p>
          </div>
          <div className="rounded-(--radius-control) bg-paper-2 p-3">
            <p className="t-meta font-bold text-ink-500">성장자금 활용 준비도</p>
            <p className="mt-1 flex items-center gap-2 text-[1.05rem] font-bold">
              <LevelBadge level={a.fundingReadiness} /> {LEVEL_KO[a.fundingReadiness]}
            </p>
            <p className="t-meta mt-1 text-ink-500">자금 때문에 AX 를 권하지 않습니다.</p>
          </div>
        </div>
        <p className="t-body mt-3 text-ink-700">{a.scopeReason}</p>
      </Section>

      {/* 추천 AX 구조 */}
      {a.recommendedStructure.length > 0 && (
        <Section title="추천 AX 구조" sub="기능부터 제안하지 않습니다.">
          <ul className="space-y-2">
            {a.recommendedStructure.map((s) => (
              <li key={s.problem} className="t-body rounded-(--radius-control) border border-line p-3">
                <span className="font-bold">{s.problem}</span>
                <span className="text-ink-500"> ↓ </span>
                {s.loss}
                <span className="text-ink-500"> ↓ </span>
                <span className="font-semibold text-accent-800">{s.structure}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 유사사례 */}
      <Section title="유사사례" sub="① 같은/가까운 업종 ② 문제구조가 비슷한 사례" action={<Link to="/cases" className="t-sub font-semibold text-accent-700 hover:underline">다른 사례 보기</Link>}>
        {similar.length === 0 ? (
          <p className="t-body text-ink-500">추천할 사례가 없습니다.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {similar.map((c) => (
              <CaseCard key={c.id} caseStudy={c} compact onOpen={() => void repo.track(user, 'case_opened', meeting.id, { caseId: c.id, from: 'result' })} />
            ))}
          </div>
        )}
      </Section>

      {/* 가치 가능 영역 */}
      <Section title="가치가 발생할 가능성이 높은 영역" sub="정확한 3년 가치금액은 Master OS 에서 만듭니다. 여기서는 가능성만 표시합니다.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {VALUE_AREA_ORDER.map((k) => (
            <li key={k} className="flex items-center justify-between rounded-(--radius-control) border border-line px-3 py-2.5">
              <span className="t-body font-semibold">{VALUE_AREA_LABEL[k]}</span>
              <LevelBadge level={a.valuePotential[k]} />
            </li>
          ))}
        </ul>
      </Section>

      {/* 추가 확인 */}
      <Section title="추가 확인이 필요한 정보" sub="2차 제안의 정확도를 높이기 위해 아래만 확인해 주세요. (최대 3개)">
        <ol className="t-body list-decimal space-y-1 pl-6">
          {a.followupQuestions.map((q) => (
            <li key={q} className="font-semibold">
              {q}
            </li>
          ))}
        </ol>
      </Section>

      {/* 다음 미팅 */}
      <div className="grid gap-5 md:grid-cols-2">
        <Section title="다음 미팅에서 강조할 내용">
          <ul className="t-body list-disc space-y-1 pl-5">
            {a.nextMeetingFocus.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Section>
        <Section title="절대 하면 안 될 표현" className="border-danger-600/30">
          <ul className="t-body list-disc space-y-1 pl-5 text-danger-700">
            {a.forbiddenReminders.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <Link to="/forbidden" className="t-sub mt-2 inline-block font-semibold text-accent-700 hover:underline">
            대체 문장 보기
          </Link>
        </Section>
      </div>

      {hits.length > 0 && (
        <div role="alert" className="rounded-(--radius-card) border border-danger-600/30 bg-danger-50 px-4 py-3">
          <p className="t-body font-bold text-danger-700">⚠ 기록한 문장에 표현 수정 권장 항목이 있습니다</p>
          <ul className="t-sub mt-1 space-y-1 text-ink-700">
            {hits.map((h) => (
              <li key={h.id}>
                "{h.phrase}" → 대체: <span className="font-semibold">{h.alternative}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 사실 / 추정 / 미확인 */}
      <Section title="사실 · 추정 · 미확인" sub="AI 가 추론한 값은 사실처럼 저장하거나 고객 문서에 노출하지 않습니다.">
        <div className="grid gap-4 md:grid-cols-3">
          {(
            [
              ['confirmed', a.confirmedFacts],
              ['assumed', a.assumptions],
              ['unknown', a.unknowns],
            ] as const
          ).map(([status, facts]) => (
            <div key={status}>
              <div className="mb-2">
                <EvidenceBadge status={status} />
              </div>
              {facts.length === 0 ? (
                <p className="t-sub text-ink-500">없음</p>
              ) : (
                <ul className="t-sub space-y-1">
                  {facts.map((f) => (
                    <li key={f.key} className="rounded-(--radius-control) bg-paper-2 px-2.5 py-1.5">
                      <span className="font-bold">{f.label}</span> · {f.value}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* 대표 발언 */}
      <Section title="대표 핵심발언">
        <blockquote className="t-body rounded-(--radius-control) border-l-4 border-accent-600 bg-paper-2 px-4 py-3 font-semibold">“{meeting.keyQuote}”</blockquote>
        {meeting.memo && <p className="t-sub mt-2 text-ink-500">내부 메모 · {meeting.memo}</p>}
      </Section>
    </div>
  )
}
