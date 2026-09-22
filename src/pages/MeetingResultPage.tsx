/**
 * AFTER — 요약이 먼저. 오늘 확인한 핵심 01/02/03 (HIGH/MEDIUM) → 추천 범위 → [분석 자세히 보기].
 * 그 다음 가장 강한 CTA [김상호 대표에게 2차 제안 요청] → 로딩 → 성공 모션 → 상태.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Printer, RefreshCw, Send, Pencil, CheckCircle2, ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { CaseStudy, Company, Handoff, Meeting, QuestionArea } from '../types/domain'
import { AccentStrip, Badge, Button, EvidenceBadge, FlatSection, Insight, LevelBadge, Section, SkeletonList, useToast } from '../components/ui'
import { CaseRow } from '../components/CaseRow'
import { AREA_LABEL, HANDOFF_STATUS_LABEL, LEVEL_KO, VALUE_AREA_LABEL, VALUE_AREA_ORDER } from '../content/labels'
import { QUESTIONS } from '../content/questions'
import { guardText } from '../content/forbidden'
import { analyzeMeeting } from '../engine/analysis'
import { buildCustomerSafeEventPayload, buildHandoffPayload } from '../engine/handoffBuilder'
import { formatDate } from '../lib/util'

function intensityOf(area: QuestionArea, meeting: Meeting): 'high' | 'medium' {
  const ids = QUESTIONS.filter((q) => q.area === area).map((q) => q.id)
  const strong = ids.some((id) => {
    const v = meeting.answers[id]?.value
    return v === 'very_high' || v === 'high' || v === 'none' || v === 'partial'
  })
  return strong ? 'high' : 'medium'
}

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
  const [justSent, setJustSent] = useState(false)
  const [detail, setDetail] = useState(false)

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
      document.title = `${c?.name ?? ''} 미팅 분석 · AX Partner OS`
    })()
    return () => {
      alive = false
    }
  }, [meetingId, repo, user])

  const a = meeting?.analysis ?? null
  const similar = useMemo(() => (a ? a.similarCaseIds.map((id) => cases.find((c) => c.id === id)).filter((c): c is CaseStudy => Boolean(c)) : []), [a, cases])
  const hits = useMemo(() => (meeting ? guardText(`${meeting.keyQuote}\n${meeting.memo}`) : []), [meeting])

  if (!meeting || !company || !a) return <SkeletonList rows={3} />

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
      setJustSent(r.created)
      if (r.created) void repo.track(user, 'handoff_submitted', meeting.id, { handoffId: r.handoff.id })
      if (!r.created) toast.show('이미 전달된 건입니다. 중복 등록하지 않았습니다.', 'ok')
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '전달하지 못했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const scopeTone = a.scopeLevel === 'C' ? 'accent' : a.scopeLevel === 'D' ? 'neutral' : 'info'
  const top = a.painPoints.slice(0, 3)

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      {/* 요약 */}
      <section className="reveal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to={`/companies/${company.id}`} className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
            <ArrowLeft aria-hidden="true" className="size-4" /> {company.name} 미팅 전략
          </Link>
          <span className="t-meta text-ink-500">
            {formatDate(meeting.endedAt ?? meeting.updatedAt, true)} · 분석 v{a.version}
          </span>
        </div>
        <h1 className="t-page mt-3">오늘 확인한 핵심</h1>
        {top.length === 0 ? (
          <p className="t-body mt-3 rounded-(--radius-card) border border-dashed border-line-strong bg-white px-5 py-6 text-ink-500">강한 문제 신호가 없습니다. 추가 확인 질문으로 2차 미팅에서 채우세요.</p>
        ) : (
          <ol className="mt-5 grid gap-3 md:grid-cols-3" aria-label="핵심 문제">
            {top.map((p, i) => {
              const lvl = intensityOf(p.area, meeting)
              return (
                <li key={p.area} className="reveal rounded-(--radius-card) border border-line bg-white p-5" style={{ animationDelay: `${i * 60}ms` }} data-testid="core-finding">
                  <div className="flex items-center justify-between">
                    <span className="tnum t-meta font-black tracking-[0.15em] text-accent-700">0{i + 1}</span>
                    <LevelBadge level={lvl} />
                  </div>
                  <p className="mt-2 text-[1.15rem] font-bold leading-snug">{p.title}</p>
                  <p className="t-sub mt-2 text-ink-700">{p.loss}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <EvidenceBadge status={p.status} />
                    <Badge>{AREA_LABEL[p.area]}</Badge>
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        <div className="mt-6 grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <Insight>{a.todaysPoint}</Insight>
          <div className="rounded-(--radius-card) border border-line bg-white p-5">
            <p className="t-meta font-black tracking-wide text-ink-500">추천 범위</p>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[1.15rem] font-bold">
              <Badge tone={scopeTone}>LEVEL {a.scopeLevel}</Badge> {a.scopeLabel}
            </p>
            <p className="t-sub mt-2 text-ink-700">{a.scopeReason}</p>
            <p className="t-meta mt-2 text-ink-500">AX 필요도 {LEVEL_KO[a.axNeed]} · 실증 {LEVEL_KO[a.validationPotential]} · 자금 준비 {LEVEL_KO[a.fundingReadiness]} — 네 축을 합치지 않습니다.</p>
          </div>
        </div>

        <div className="mt-4">
          <Button variant="ghost" onClick={() => setDetail((v) => !v)} aria-expanded={detail} data-testid="toggle-detail">
            {detail ? <ChevronUp aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />} 분석 자세히 보기
          </Button>
        </div>
      </section>

      {/* CTA */}
      <section className={`rounded-(--radius-card) border-2 p-5 sm:p-7 ${handoff && handoff.status !== 'withdrawn' ? 'border-ok-600/40 bg-ok-50/50' : 'border-accent-600 bg-accent-50/50'}`} data-testid="handoff-cta">
        {handoff && handoff.status === 'withdrawn' ? (
          <div>
            <p className="t-section text-warn-700" data-testid="handoff-withdrawn">철회된 2차 제안 요청</p>
            <p className="t-sub mt-1 text-ink-700">
              {handoff.withdrawnAt && `${formatDate(handoff.withdrawnAt, true)} 철회`}
              {handoff.withdrawReason && ` · ${handoff.withdrawReason}`} — 운영 OS 에서도 보류로 표시됩니다. 다시 전달하면 같은 요청이 다시 열립니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" size="lg" onClick={() => void submit()} disabled={busy} data-testid="submit-handoff">
                <Send aria-hidden="true" className="size-5" /> {busy ? '전달 중…' : '다시 전달'}
              </Button>
              <Link to={`/handoffs/${handoff.id}`} className="t-sub self-center font-semibold text-accent-700 hover:underline" data-testid="handoff-link">
                전달 내용 · 상태 보기
              </Link>
            </div>
          </div>
        ) : handoff ? (
          <div className={justSent ? 'pop' : ''}>
            <p className="inline-flex items-center gap-2 text-[1.35rem] font-black text-ok-700" data-testid="handoff-success">
              <CheckCircle2 aria-hidden="true" className="size-8" /> 미래AI랩 운영 OS에 전달되었습니다.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Badge tone={handoff.status === 'proposal_ready' ? 'ok' : 'info'}>{HANDOFF_STATUS_LABEL[handoff.status]}</Badge>
              <span className="t-sub text-ink-700">김상호 대표가 검토 후 2차 제안을 준비합니다. 두 번 눌러도 한 번만 등록됩니다.</span>
              <Link to={`/handoffs/${handoff.id}`} className="t-sub font-semibold text-accent-700 hover:underline" data-testid="handoff-link">
                전달 내용 · 상태 보기
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <p className="t-section">김상호 대표에게 2차 제안 요청</p>
            <p className="t-sub mt-1 text-ink-700">PDF 가 아니라 구조화 데이터로 운영 OS 에 바로 들어갑니다. 두 번 눌러도 한 번만 등록됩니다.</p>
            <Button variant="primary" size="lg" className="mt-4 w-full sm:w-auto sm:min-w-[320px]" onClick={() => void submit()} disabled={busy} data-testid="submit-handoff">
              {busy ? (
                <>
                  <span aria-hidden className="size-5 animate-spin rounded-full border-[3px] border-white border-t-transparent" /> 전달 중…
                </>
              ) : (
                <>
                  <Send aria-hidden="true" className="size-5" /> 김상호 대표에게 2차 제안 요청
                </>
              )}
            </Button>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to={`/meetings/${meeting.id}/report`} onClick={() => void repo.track(user, 'pdf_printed', meeting.id)}>
            <Button size="sm">
              <Printer aria-hidden="true" className="size-4" /> PDF 리포트
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
      </section>

      {hits.length > 0 && (
        <AccentStrip label="⚠ 기록한 문장에 표현 수정 권장 항목" tone="warn">
          <ul className="space-y-1">
            {hits.map((h) => (
              <li key={h.id}>
                "{h.phrase}" → 대체: <span className="font-semibold">{h.alternative}</span>
              </li>
            ))}
          </ul>
        </AccentStrip>
      )}

      {/* 상세 */}
      {detail && (
        <div className="reveal space-y-8" data-testid="analysis-detail">
          <Section title="핵심 문제 TOP 3" sub="문제 → 발생하는 손실/기회 → AX 해결구조">
            <ol className="space-y-3">
              {a.painPoints.map((p) => (
                <li key={p.area} className="rounded-(--radius-control) border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-full bg-accent-600 text-[0.95rem] font-black text-white">{p.rank}</span>
                    <span className="text-[1.05rem] font-bold">{p.title}</span>
                    <EvidenceBadge status={p.status} />
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
          </Section>

          <Section title="프로젝트 범위 가설" sub="정확한 견적은 미래AI랩 Master 검토 후 확정합니다. 네 축을 하나의 점수로 합치지 않습니다.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ['AX 필요도', a.axNeed],
                  ['실증 잠재력', a.validationPotential],
                  ['성장자금 활용 준비도', a.fundingReadiness],
                ] as const
              ).map(([label, lvl]) => (
                <div key={label} className="rounded-(--radius-control) bg-paper-2 p-3">
                  <p className="t-meta font-bold text-ink-500">{label}</p>
                  <p className="mt-1 flex items-center gap-2 text-[1.05rem] font-bold">
                    <LevelBadge level={lvl} /> {LEVEL_KO[lvl]}
                  </p>
                </div>
              ))}
              <div className="rounded-(--radius-control) bg-paper-2 p-3">
                <p className="t-meta font-bold text-ink-500">예상 구축범위</p>
                <p className="mt-1 flex items-center gap-2 text-[1.05rem] font-bold">
                  <Badge tone={scopeTone}>LEVEL {a.scopeLevel}</Badge> {a.scopeLabel}
                </p>
              </div>
            </div>
            <p className="t-meta mt-3 text-ink-500">자금 때문에 AX 를 권하지 않습니다.</p>
          </Section>

          {a.recommendedStructure.length > 0 && (
            <FlatSection title="추천 AX 구조" sub="기능부터 제안하지 않습니다.">
              <ul className="space-y-2">
                {a.recommendedStructure.map((s) => (
                  <li key={s.problem} className="grid gap-1 rounded-(--radius-card) border border-line bg-white p-4 sm:grid-cols-3">
                    <span className="font-bold">{s.problem}</span>
                    <span className="text-ink-700">↓ {s.loss}</span>
                    <span className="font-semibold text-accent-800">↓ {s.structure}</span>
                  </li>
                ))}
              </ul>
            </FlatSection>
          )}

          <FlatSection title="추천 연구사례" sub="📌 내가 고른 사례 → ① 같은/가까운 업종 → ② 문제구조가 비슷한 사례" action={<Link to={`/cases?company=${company.id}`} className="t-sub font-semibold text-accent-700 hover:underline">다른 사례 보기</Link>}>
            {similar.length === 0 ? (
              <p className="t-body text-ink-500">추천할 사례가 없습니다.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {similar.map((c) => (
                  <CaseRow key={c.id} c={c} to={`/cases/${c.id}?company=${company.id}`} onOpen={() => void repo.track(user, 'case_opened', meeting.id, { caseId: c.id, from: 'result' })} />
                ))}
              </div>
            )}
          </FlatSection>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="가치가 발생할 가능성이 높은 영역" sub="정확한 3년 가치금액은 Master OS 에서 만듭니다.">
              <ul className="space-y-1.5">
                {VALUE_AREA_ORDER.map((k) => (
                  <li key={k} className="flex items-center justify-between rounded-(--radius-control) border border-line px-3 py-2">
                    <span className="t-body font-semibold">{VALUE_AREA_LABEL[k]}</span>
                    <LevelBadge level={a.valuePotential[k]} />
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="추가 확인이 필요한 정보" sub="2차 제안의 정확도를 높이기 위해 아래만 확인해 주세요. (최대 3개)">
              <ol className="t-body list-decimal space-y-1.5 pl-6">
                {a.followupQuestions.map((q) => (
                  <li key={q} className="font-semibold">
                    {q}
                  </li>
                ))}
              </ol>
              <p className="t-meta mt-4 font-bold text-ink-500">다음 미팅에서 강조할 내용</p>
              <ul className="t-sub mt-1 list-disc space-y-0.5 pl-5">
                {a.nextMeetingFocus.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </Section>
          </div>

          <AccentStrip label="절대 하면 안 될 표현" tone="warn">
            <ul className="space-y-1 text-danger-700">
              {a.forbiddenReminders.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <Link to="/playbook?tab=forbidden" className="t-sub mt-2 inline-block font-semibold text-accent-700 hover:underline">
              대체 문장 보기
            </Link>
          </AccentStrip>

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

          <Section title="대표 핵심발언">
            <blockquote className="t-body rounded-r-(--radius-control) border-l-4 border-accent-600 bg-paper-2 px-4 py-3 font-semibold">“{meeting.keyQuote}”</blockquote>
            {meeting.memo && <p className="t-sub mt-2 text-ink-500">내부 메모 · {meeting.memo}</p>}
          </Section>
        </div>
      )}
    </div>
  )
}
