/**
 * BEFORE — 미팅 전략. 한 화면에서 끝난다.
 *
 * 첫 화면에 보이는 것: 회사 핵심 4가지 → 오늘 확인할 3가지 → 동종업계 사례 최대 2개 → [미팅 시작].
 * 질문 목록·멘트·가설·주의표현·기업자료·미팅기록은 전부 접어 둔다. 미팅 전에 읽어야 할 글은 없다.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Play, Pencil, ArrowLeft, Trash2, UserCog, XCircle, FileText, MessageSquareQuote, ListChecks, Settings2, Sparkles, RefreshCw } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Answer, CaseStudy, Company, CompanyProfile, EvidenceField, Meeting, PartnerMember } from '../types/domain'
import { AccentStrip, Badge, Button, DangerModal, EvidenceBadge, Sheet, SkeletonList, useToast } from '../components/ui'
import { CaseRow } from '../components/CaseRow'
import { CompanyCoreSummary } from '../components/CompanyCoreSummary'
import { EvidenceList } from '../components/EvidenceList'
import { DIAGNOSIS_GRADE_LABEL, MEETING_STATUS_LABEL } from '../content/labels'
import { buildStrategy, strategyHash, type Strategy } from '../engine/strategy'
import { applyEvidence, latestProfile } from '../engine/profile'
import { createEnhancer, groundedInput, type EnhancedText } from '../lib/ai/strategyEnhancer'
import { josa } from '../content/korean'
import { formatDate, nowIso, relativeDay } from '../lib/util'

type SheetKind = null | 'detail' | 'tips' | 'docs' | 'sources'

export default function CompanyPage() {
  const { user, repo, mode } = useSession()
  const { companyId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [company, setCompany] = useState<Company | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [cases, setCases] = useState<CaseStudy[]>([])
  const [profiles, setProfiles] = useState<CompanyProfile[]>([])
  const [busy, setBusy] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [members, setMembers] = useState<PartnerMember[]>([])
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [meetingAction, setMeetingAction] = useState<{ meeting: Meeting; kind: 'delete' | 'cancel' } | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [openProfile, setOpenProfile] = useState<CompanyProfile | null>(null)
  const [hash, setHash] = useState('')
  const [enhanced, setEnhanced] = useState<(EnhancedText & { hash: string }) | null>(null)
  const [enhancing, setEnhancing] = useState(false)

  useEffect(() => {
    if (!companyId) return
    let alive = true
    Promise.all([repo.getCompany(user, companyId), repo.listMeetings(user, companyId), repo.listCases(user), repo.listProfiles(user, companyId)]).then(([c, m, cs, ps]) => {
      if (!alive) return
      if (!c) return setNotFound(true)
      setCompany(c)
      setMeetings(m)
      setCases(cs)
      setProfiles(ps)
      setOpenProfile(ps[0] ?? null)
      document.title = `${c.name} 미팅 전략 · AX Partner OS`
    })
    if (user.role === 'master') void repo.listMembers(user).then((ms) => alive && setMembers(ms)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [companyId, repo, user])

  const profile = useMemo(() => latestProfile(profiles), [profiles])
  const strategy: Strategy | null = useMemo(() => (company && cases.length ? buildStrategy({ company, profile, cases }) : null), [company, profile, cases])

  // 같은 입력이면 같은 해시 — 전략 생성 이벤트는 해시당 한 번만
  useEffect(() => {
    if (!company || !strategy) return
    let alive = true
    void strategyHash(company, profile, strategy.cases.map((c) => c.caseStudy.id)).then((h) => {
      if (!alive) return
      setHash(h)
      const key = `axpartner.strategy.tracked.${company.id}`
      try {
        if (sessionStorage.getItem(key) !== h) {
          sessionStorage.setItem(key, h)
          void repo.track(user, 'strategy_generated', null, { companyId: company.id, hash: h.slice(0, 12), confidence: strategy.confidence.level, pdf: strategy.confidence.pdf, hypotheses: strategy.hypotheses.length })
          void repo.track(user, 'case_auto_matched', null, { companyId: company.id, caseIds: strategy.cases.map((c) => c.caseStudy.id), kinds: strategy.cases.map((c) => c.kind), fallback: Boolean(strategy.caseNotice) })
        }
      } catch {
        /* 세션 저장이 막힌 환경에서도 전략은 그대로 보인다 */
      }
    })
    return () => {
      alive = false
    }
  }, [company, profile, strategy, repo, user])

  const enhancer = useMemo(
    () =>
      createEnhancer(async () => {
        if (mode !== 'supabase') return null
        const { getSupabaseClient } = await import('../data/supabaseClient')
        const { data } = await getSupabaseClient().auth.getSession()
        return data.session?.access_token ?? null
      }),
    [mode],
  )
  async function enhance() {
    if (!company || !strategy || !hash || !enhancer.available) return
    setEnhancing(true)
    try {
      const out = await enhancer.enhance(groundedInput(strategy, { name: company.name, industry: company.industry, headcount: company.headcount, tradeType: company.tradeType, interests: company.interests }, hash))
      if (out) setEnhanced({ ...out, hash })
      else toast.show('AI 보강을 사용할 수 없습니다. 기본 전략은 그대로 쓸 수 있습니다.')
    } finally {
      setEnhancing(false)
    }
  }

  async function archive() {
    if (!company) return
    setActionBusy(true)
    try {
      await repo.archiveCompany(user, company.id)
      const c = company
      toast.show(`${c.name}${josa(c.name, '을/를')} 휴지통으로 이동했습니다.`, 'ok', { label: '되돌리기', onClick: async () => repo.restoreCompany(user, c.id) })
      navigate('/companies')
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '보관하지 못했습니다.', 'danger')
    } finally {
      setActionBusy(false)
      setArchiveOpen(false)
    }
  }
  async function reassign(profileId: string) {
    if (!company) return
    try {
      const next = await repo.assignCompany(user, company.id, profileId || null)
      setCompany(next)
      toast.show('담당 파트너를 바꿨습니다. 과거 미팅의 작성자는 그대로입니다.', 'ok')
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '바꾸지 못했습니다.', 'danger')
    }
  }
  async function runMeetingAction() {
    if (!meetingAction) return
    setActionBusy(true)
    try {
      if (meetingAction.kind === 'cancel') {
        const m = await repo.cancelMeeting(user, meetingAction.meeting.id)
        setMeetings((cur) => cur.map((x) => (x.id === m.id ? m : x)))
        toast.show('미팅을 취소했습니다. 기록은 남아 있고 삭제할 수 있습니다.', 'ok')
      } else {
        await repo.deleteMeeting(user, meetingAction.meeting.id)
        setMeetings((cur) => cur.filter((x) => x.id !== meetingAction.meeting.id))
        toast.show('미팅을 삭제했습니다.', 'ok')
      }
      setMeetingAction(null)
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '처리하지 못했습니다.', 'danger')
    } finally {
      setActionBusy(false)
    }
  }
  /** 기업자료 항목 제외/되돌리기 — 저장 즉시 사례·질문·전략이 다시 계산된다 */
  async function toggleEvidence(p: CompanyProfile, keys: string[], removed: boolean) {
    const evidence: EvidenceField[] = p.evidence.map((e) => (keys.includes(e.key) ? { ...e, removed } : e))
    try {
      const next = await repo.updateProfile(user, p.id, { facts: applyEvidence(p.facts, evidence), evidence })
      setProfiles((cur) => cur.map((x) => (x.id === next.id ? next : x)))
      setOpenProfile(next)
      void repo.track(user, 'profile_corrected', null, { key: keys[0], action: removed ? 'removed' : 'restored', from: 'strategy' })
      toast.show(removed ? '이 정보를 빼고 전략을 다시 계산했습니다.' : '정보를 되돌렸습니다.', 'ok')
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '수정하지 못했습니다.', 'danger')
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

  if (notFound) return <p className="t-body text-ink-500">업체를 찾을 수 없습니다.</p>
  if (!company || !strategy) return <SkeletonList rows={3} />

  const liveMeeting = meetings.find((m) => m.status === 'live' || m.status === 'draft')

  async function startMeeting() {
    if (!company || !strategy || busy) return
    setBusy(true)
    try {
      if (liveMeeting) return navigate(`/meetings/${liveMeeting.id}/live`)
      const prefilled: Record<string, Answer> = {}
      for (const p of strategy.prefilled) prefilled[p.question.id] = { questionId: p.question.id, value: p.value, source: 'diagnosis', at: nowIso() }
      const m = await repo.createMeeting(user, company.id, strategy.questionIds, prefilled)
      navigate(`/meetings/${m.id}/live`)
    } finally {
      setBusy(false)
    }
  }

  const d = company.diagnosis
  const pinned = (company.pinnedCaseIds ?? []).map((id) => cases.find((c) => c.id === id)).filter((c): c is CaseStudy => Boolean(c))
  const recs = strategy.cases.filter((m) => !pinned.some((p) => p.id === m.caseStudy.id))
  const shown = [...pinned.map((c) => ({ caseStudy: c, reason: '📌 내가 고른 사례' })), ...recs.map((m) => ({ caseStudy: m.caseStudy, reason: m.reasons.slice(0, 2).join(' · ') }))].slice(0, 2)
  const approach = enhanced && enhanced.hash === hash && enhanced.approach ? enhanced.approach : strategy.approach
  const when = company.meetingAt ? `${relativeDay(company.meetingAt)} ${formatDate(company.meetingAt, true).slice(-5)}` : ''

  return (
    <div className="mx-auto max-w-[900px] space-y-6 pb-8">
      {/* 상단 — 뒤로 / 정보 수정 / 휴지통 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/companies" className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
          <ArrowLeft aria-hidden="true" className="size-4" /> 고객
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Link to={`/companies/${company.id}/edit`} className="t-sub inline-flex items-center gap-1 font-semibold text-ink-500 hover:text-ink-900">
            <Pencil aria-hidden="true" className="size-4" /> 정보 수정
          </Link>
          <button type="button" onClick={() => setArchiveOpen(true)} className="t-sub inline-flex items-center gap-1 font-semibold text-ink-500 hover:text-danger-700" data-testid="archive-company">
            <Trash2 aria-hidden="true" className="size-4" /> 휴지통
          </button>
        </div>
      </div>

      {/* 1) 어떤 회사인가 — 핵심 4가지 */}
      <CompanyCoreSummary
        company={company}
        profile={profile}
        // 업종·근로자 수는 여기서도 바로 고칠 수 있어야 한다 — 빈 칸을 보여 주기만 하고 길을 막지 않는다
        fillable={['industry', 'headcount']}
        onFill={() => navigate(`/companies/${company.id}/edit`)}
        title={
          <span data-testid="strategy-title">
            {company.name}
            {when && <span className="ml-2 align-middle t-sub font-bold text-accent-700">미팅 {when}</span>}
          </span>
        }
      />

      {/* 2) 오늘은 이 3가지만 */}
      <section className="reveal">
        <h2 className="t-section">오늘은 이 3가지만 확인하세요</h2>
        <ol className="mt-3 divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white md:grid md:grid-cols-3 md:divide-y-0 md:divide-x" aria-label="오늘 확인할 것">
          {strategy.focus.map((f, i) => (
            <li key={f.area} className="flex items-center gap-3 px-4 py-3 md:flex-col md:items-start md:gap-2 md:py-4" data-testid="focus-item" data-area={f.area}>
              <span className="tnum inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-600 text-[0.9rem] font-black text-white" aria-hidden="true">
                {i + 1}
              </span>
              <p className="text-[1.08rem] font-bold leading-snug break-keep">{f.title}</p>
            </li>
          ))}
        </ol>
        <p className="t-sub mt-3 text-ink-700" data-testid="strategy-approach">
          {approach}
          {enhanced && enhanced.hash === hash && enhanced.approach && (
            <span className="t-meta ml-2 text-ink-500">
              <Sparkles aria-hidden="true" className="inline size-3.5" /> AI 다듬음
            </span>
          )}
        </p>
      </section>

      {/* 3) 오늘 참고할 실제 사례 — 최대 2개, 동종업계 안에서만 */}
      <section className="reveal">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="t-section">오늘 참고할 실제 사례</h2>
          <Link to={`/cases?company=${company.id}`} className="t-sub font-semibold text-accent-700 hover:underline">
            사례 더 찾기
          </Link>
        </div>
        {strategy.caseNotice && shown.length > 0 && (
          <p className="t-sub mt-2 rounded-(--radius-control) bg-warn-50 px-4 py-2.5 font-semibold text-warn-700" data-testid="case-notice">
            {strategy.caseNotice}
          </p>
        )}
        {shown.length === 0 ? (
          <p className="mt-3 rounded-(--radius-card) border border-dashed border-line-strong bg-white px-5 py-5 t-body text-ink-500" data-testid="case-empty">
            {strategy.caseNotice || '같은 업종에서 검수된 사례가 아직 없습니다. 사례 없이 진행하고, 필요하면 사례 탐색에서 직접 고르세요.'}
          </p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {shown.map((x) => (
              <CaseRow key={x.caseStudy.id} c={x.caseStudy} reason={x.reason} to={`/cases/${x.caseStudy.id}?company=${company.id}`} onOpen={() => void repo.track(user, 'case_opened', null, { caseId: x.caseStudy.id, from: 'brief' })} />
            ))}
          </div>
        )}
      </section>

      {/* 4) 미팅 시작 */}
      <section className="reveal">
        <Button variant="primary" size="lg" className="w-full sm:w-auto sm:min-w-[260px]" onClick={() => void startMeeting()} disabled={busy} data-testid="start-meeting">
          <Play aria-hidden="true" className="size-5" /> {liveMeeting ? '미팅 이어가기' : '미팅 시작'}
        </Button>
        <p className="t-sub mt-2 text-ink-500" data-testid="question-count">
          오늘 질문 {strategy.questions.length}개 준비됨
          {strategy.prefilled.length > 0 && ` · 사전진단으로 ${strategy.prefilled.length}개는 건너뜁니다`}
        </p>
      </section>

      {/* 5) 더보기 — 기본은 닫혀 있다 */}
      <section className="flex flex-wrap gap-2 border-t border-line pt-5">
        <Button size="sm" onClick={() => setSheet('detail')} data-testid="open-detail">
          <ListChecks aria-hidden="true" className="size-4" /> 상세 전략
        </Button>
        <Button size="sm" onClick={() => setSheet('tips')} data-testid="open-tips">
          <MessageSquareQuote aria-hidden="true" className="size-4" /> 영업 팁
        </Button>
        <Button size="sm" onClick={() => setSheet('docs')} data-testid="open-docs">
          <Settings2 aria-hidden="true" className="size-4" /> 기업자료 · 관리
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setSheet('sources')} data-testid="open-sources">
          왜 이렇게 판단했나요?
        </Button>
      </section>

      {/* ── 시트: 상세 전략 ── */}
      <Sheet open={sheet === 'detail'} onClose={() => setSheet(null)} title="상세 전략" wide testId="sheet-detail">
        <div className="space-y-5">
          <div>
            <p className="t-meta font-black tracking-wide text-ink-500">예상 AX 방향</p>
            <p className="t-body mt-1">{strategy.axDirection}</p>
            <p className="t-sub mt-2 text-ink-700">
              <Badge tone="warn">🟡 가설</Badge> {strategy.scope.label} — {strategy.scope.reason}. 정확한 범위는 미팅 답변으로 정합니다.
            </p>
          </div>
          {strategy.hypotheses.length > 0 && (
            <div>
              <p className="t-meta font-black tracking-wide text-ink-500">기업자료에서 읽은 가설 → 확인할 질문</p>
              <ul className="mt-2 space-y-2">
                {strategy.hypotheses.map((h) => (
                  <li key={h.id} className="rounded-(--radius-control) bg-paper-2 px-4 py-3" data-testid="hypothesis">
                    <p className="t-body font-semibold">
                      🟡 {h.text} <span className="t-meta font-medium text-ink-500">— {h.basis}</span>
                    </p>
                    <p className="t-sub mt-1 text-ink-700">→ "{h.question}"</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="t-meta font-black tracking-wide text-ink-500">2차 제안에 필요한 추가정보</p>
            <ul className="t-body mt-1 list-disc space-y-1 pl-5">
              {strategy.missingInfo.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <details>
            <summary className="t-sub cursor-pointer font-semibold text-accent-700">업종 배경 자세히 보기</summary>
            <p className="t-body mt-2 text-ink-700">{strategy.briefing.detail}</p>
          </details>
          {enhancer.available && (
            <Button size="sm" onClick={() => void enhance()} disabled={enhancing || (enhanced !== null && enhanced.hash === hash)} data-testid="enhance">
              <Sparkles aria-hidden="true" className="size-4" /> {enhancing ? 'AI 다듬는 중…' : enhanced && enhanced.hash !== hash ? '전략 다시 생성' : enhanced ? 'AI 문장 적용됨' : 'AI로 문장 다듬기'}
            </Button>
          )}
        </div>
      </Sheet>

      {/* ── 시트: 영업 팁 ── */}
      <Sheet open={sheet === 'tips'} onClose={() => setSheet(null)} title="영업 팁" wide testId="sheet-tips">
        <ul className="space-y-3">
          {strategy.scripts.map((s) => {
            const say = enhanced && enhanced.hash === hash ? (enhanced.scripts?.find((x) => x.key === s.key)?.say ?? s.say) : s.say
            return (
              <li key={s.key} className="rounded-(--radius-card) border border-line bg-white p-4" data-testid="script" data-key={s.key}>
                <p className="t-meta font-black tracking-wide text-accent-800">{s.title}</p>
                <p className="t-body mt-1.5 font-semibold">"{say}"</p>
                <p className="t-sub mt-1.5 text-ink-500">다음 질문 → "{s.next}"</p>
              </li>
            )
          })}
        </ul>
        <div className="mt-5">
          <AccentStrip label="먼저 하지 마세요" tone="warn">
            <ul className="space-y-1">
              {strategy.forbidden.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </AccentStrip>
        </div>
        <div className="mt-4">
          <p className="t-meta font-black tracking-wide text-ink-500">오늘의 주의</p>
          <ul className="t-body mt-1 list-disc space-y-1 pl-5">
            {strategy.briefing.cautions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </Sheet>

      {/* ── 시트: 기업자료 · 관리 ── */}
      <Sheet open={sheet === 'docs'} onClose={() => setSheet(null)} title="기업자료 · 관리" wide testId="sheet-docs">
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="t-section">기업자료</p>
              <Link to={`/companies/${company.id}/pdf`} className="t-sub font-semibold text-accent-700 hover:underline" data-testid="add-pdf">
                PDF 추가
              </Link>
            </div>
            {profiles.length === 0 ? (
              <p className="mt-2 t-sub text-ink-500">아직 기업자료가 없습니다. PDF를 올리면 재무·인증 정보가 전략에 반영됩니다.</p>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white" data-testid="profile-list">
                  {profiles.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => setOpenProfile(p)} className={`tap flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper-2 ${openProfile?.id === p.id ? 'bg-accent-50' : ''}`} data-testid="profile-row">
                        <FileText aria-hidden="true" className="size-5 shrink-0 text-accent-600" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold">
                            {p.sourceName}
                            {p.sourceType === 'pdf' && p.pageCount > 0 ? ` · ${p.pageCount}쪽` : ''}
                          </span>
                          <span className="t-meta block text-ink-500">
                            {formatDate(p.createdAt, true)} · {p.evidence.filter((e) => !e.removed).length}개 항목
                            {p.id === profile?.id ? ' · 전략에 사용 중' : ''}
                            {p.sourceType === 'pdf' ? ' · 원본 저장 안 함' : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {openProfile && (
                  <div className="mt-3" data-testid="profile-evidence-list">
                    <EvidenceList evidence={openProfile.evidence} compact onRemove={(key) => void toggleEvidence(openProfile, [key], true)} onRestore={(key) => void toggleEvidence(openProfile, [key], false)} />
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="t-section">홈페이지 3분 AX Fit 사전진단</p>
              {!d && (
                <Button size="sm" onClick={() => void refreshDiagnosis()}>
                  <RefreshCw aria-hidden="true" className="size-4" /> 다시 찾기
                </Button>
              )}
            </div>
            {d ? (
              <div className="mt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">AX Fit {d.grade ? DIAGNOSIS_GRADE_LABEL[d.grade] : '등급 미확인'}</Badge>
                  {d.submittedAt && <span className="t-sub text-ink-500">{formatDate(d.submittedAt)}</span>}
                  <span className="t-meta text-ink-500">🟡 추정 — 미팅에서 확인하면 ✅</span>
                </div>
                {strategy.briefing.diagnosisLines.length > 0 && (
                  <ul className="t-body mt-2 list-disc space-y-1 pl-5">
                    {strategy.briefing.diagnosisLines.map((l) => (
                      <li key={l}>"{l}" 라고 체크했습니다.</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="mt-2 t-sub text-ink-500">연결된 사전진단이 없습니다. 미팅에서 처음부터 확인합니다.</p>
            )}
          </div>

          {user.role === 'master' && (
            <div data-testid="assign-row">
              <p className="t-section">담당 컨설턴트</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <UserCog aria-hidden="true" className="size-4 text-ink-500" />
                <select value={company.assignedTo ?? company.consultantId} onChange={(e) => void reassign(e.target.value === company.consultantId ? '' : e.target.value)} className="rounded-(--radius-control) border border-line-strong bg-white px-3 py-1.5 t-sub font-semibold" aria-label="담당 컨설턴트 변경" data-testid="assign-select">
                  {[...members.filter((m) => m.active)].map((m) => (
                    <option key={m.profileId} value={m.profileId}>
                      {m.displayName}
                      {m.title ? ` ${m.title}` : ''}
                      {m.profileId === company.consultantId ? ' (등록자)' : ''}
                    </option>
                  ))}
                  {!members.some((m) => m.profileId === company.consultantId) && <option value={company.consultantId}>등록자</option>}
                </select>
                <span className="t-meta text-ink-500">과거 미팅·전달의 작성자는 바뀌지 않습니다</span>
              </div>
            </div>
          )}

          <div>
            <p className="t-section">미팅 기록</p>
            {meetings.length === 0 ? (
              <p className="mt-2 t-sub text-ink-500">아직 미팅 기록이 없습니다.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
                {meetings.map((m) => {
                  const to = m.status === 'live' || m.status === 'draft' ? `/meetings/${m.id}/live` : m.status === 'submitted' && m.handoffId ? `/handoffs/${m.handoffId}` : m.status === 'cancelled' ? null : `/meetings/${m.id}/result`
                  const canDelete = m.status === 'draft' || m.status === 'cancelled' || (m.status === 'analyzed' && user.role === 'master')
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5" data-testid="meeting-row" data-status={m.status}>
                      {to ? (
                        <Link to={to} className="nav-item t-body min-w-0 flex-1 rounded-(--radius-control) px-1 py-1 hover:text-accent-700">
                          {formatDate(m.startedAt ?? m.createdAt, true)}
                        </Link>
                      ) : (
                        <span className="t-body min-w-0 flex-1 px-1 py-1 text-ink-500">{formatDate(m.startedAt ?? m.createdAt, true)}</span>
                      )}
                      <Badge tone={m.status === 'submitted' ? 'ok' : m.status === 'live' ? 'accent' : m.status === 'cancelled' ? 'warn' : 'neutral'}>{MEETING_STATUS_LABEL[m.status]}</Badge>
                      {m.status === 'live' && (
                        <Button size="sm" variant="ghost" onClick={() => setMeetingAction({ meeting: m, kind: 'cancel' })} data-testid="cancel-meeting">
                          <XCircle aria-hidden="true" className="size-4" /> 취소
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="ghost" onClick={() => setMeetingAction({ meeting: m, kind: 'delete' })} data-testid="delete-meeting">
                          <Trash2 aria-hidden="true" className="size-4" /> 삭제
                        </Button>
                      )}
                      {m.status === 'analyzed' && user.role !== 'master' && <span className="t-meta text-ink-500">삭제는 마스터 확인 필요</span>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </Sheet>

      {/* ── 시트: 근거 ── */}
      <Sheet open={sheet === 'sources'} onClose={() => setSheet(null)} title="왜 이렇게 판단했나요?" testId="strategy-sources">
        <div className="flex flex-wrap items-center gap-2" data-testid="strategy-confidence" data-level={strategy.confidence.level}>
          <Badge tone={strategy.confidence.level === 'high' ? 'ok' : strategy.confidence.level === 'medium' ? 'info' : 'warn'}>정보 충분도 {strategy.confidence.label}</Badge>
          <span className="t-meta text-ink-500">
            PDF {strategy.confidence.pdf ? '완료' : '없음'} · 사전진단 {strategy.confidence.diagnosis ? '있음' : '없음'} · 미확인 핵심정보 {strategy.confidence.unknownCore}개
          </span>
        </div>
        <p className="t-sub mt-3 text-ink-500">전략에 쓰인 값과 출처입니다. ✅ 확인 / 🟡 추정 / ⚪ 미확인 — 미확인은 미팅에서 채웁니다.</p>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
          {strategy.sources.map((s, i) => (
            <li key={`${s.label}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5" data-testid="source-row">
              <span className="t-sub w-28 shrink-0 font-bold text-ink-500">{s.label}</span>
              <span className="min-w-0 flex-1 font-bold">{s.value}</span>
              <EvidenceBadge status={s.status} />
              <span className="t-meta text-ink-500">{s.where}</span>
            </li>
          ))}
        </ul>
      </Sheet>

      <DangerModal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={`${company.name}${josa(company.name, '을/를')} 휴지통으로 이동할까요?`}
        impact={profiles.length ? [`기업자료 ${profiles.length}건도 함께 숨겨집니다`] : []}
        recoverable="고객 목록과 미팅 목록에서는 숨겨지지만 휴지통에서 언제든 복구할 수 있습니다. 영구 삭제는 휴지통에서 따로 합니다."
        confirmLabel="휴지통으로 이동"
        tone="warn"
        onConfirm={archive}
        busy={actionBusy}
        testId="archive-modal"
      />
      <DangerModal
        open={Boolean(meetingAction)}
        onClose={() => setMeetingAction(null)}
        title={meetingAction?.kind === 'cancel' ? '이 미팅을 취소할까요?' : '이 미팅을 삭제할까요?'}
        impact={meetingAction ? [`${formatDate(meetingAction.meeting.startedAt ?? meetingAction.meeting.createdAt, true)} 미팅 · 답변 ${Object.keys(meetingAction.meeting.answers).length}개`] : []}
        recoverable={meetingAction?.kind === 'cancel' ? '취소된 미팅은 기록으로 남고, 그 뒤에 삭제할 수 있습니다.' : '이 작업은 되돌릴 수 없습니다. 답변과 사용 기록이 함께 지워집니다.'}
        confirmLabel={meetingAction?.kind === 'cancel' ? '미팅 취소' : '삭제'}
        tone={meetingAction?.kind === 'cancel' ? 'warn' : 'danger'}
        onConfirm={runMeetingAction}
        busy={actionBusy}
        testId="meeting-modal"
      />
    </div>
  )
}
