/**
 * BEFORE — Strategy Autopilot 화면. 정보가 확정되면 자동으로 "오늘 이렇게 접근하세요" 가 만들어진다 (버튼 없음).
 * 첫 화면: 접근법 한 문단 → 오늘 공략 TOP 3 → [미팅 시작]. 아래에 실제 사례 2~3개(펼침), 질문·말하는 법·주의사항·근거는 접어서.
 * 기업자료(PDF·음성 스냅샷) 섹션에서 값을 제외/수정하면 사례·질문·전략이 즉시 다시 계산된다.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Play, Pencil, RefreshCw, ArrowLeft, Trash2, UserCog, XCircle, FileText, ChevronDown, ChevronUp, Sparkles } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Answer, CaseStudy, Company, CompanyProfile, EvidenceField, Meeting, PartnerMember } from '../types/domain'
import { AccentStrip, Badge, Button, DangerModal, EvidenceBadge, FlatSection, Insight, Sheet, SkeletonList, useToast } from '../components/ui'
import { CaseRow } from '../components/CaseRow'
import { EvidenceList } from '../components/EvidenceList'
import { DIAGNOSIS_GRADE_LABEL, HEADCOUNT_LABEL, INDUSTRY_LABEL, INTEREST_LABEL, MEETING_STATUS_LABEL, TRADE_LABEL } from '../content/labels'
import { buildStrategy, strategyHash, profileSummary, type Strategy } from '../engine/strategy'
import { applyEvidence, latestProfile } from '../engine/profile'
import { createEnhancer, groundedInput, type EnhancedText } from '../lib/ai/strategyEnhancer'
import { formatDate, nowIso, relativeDay } from '../lib/util'

function whenLabel(iso: string | null): string {
  if (!iso) return ''
  const r = relativeDay(iso)
  return r ? `${r} ` : ''
}

/** 접었다 펴는 구역 — 기본 열림 여부 지정 */
function Fold({ label, count, defaultOpen = false, testId, children }: { label: string; count?: number; defaultOpen?: boolean; testId?: string; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-(--radius-card) border border-line bg-white" data-testid={testId} data-open={open}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="tap flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5">
        <span className="t-section">
          {label}
          {typeof count === 'number' && <span className="tnum ml-2 text-accent-700">{count}</span>}
        </span>
        {open ? <ChevronUp aria-hidden="true" className="size-5 text-ink-500" /> : <ChevronDown aria-hidden="true" className="size-5 text-ink-500" />}
      </button>
      {open && <div className="rise border-t border-line px-4 py-4 sm:px-5">{children}</div>}
    </section>
  )
}

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
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState<CompanyProfile | null>(null)
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
      document.title = `${c.name} 미팅 전략 · AX Partner OS`
    })
    if (user.role === 'master') void repo.listMembers(user).then((ms) => alive && setMembers(ms)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [companyId, repo, user])

  const profile = useMemo(() => latestProfile(profiles), [profiles])
  const strategy: Strategy | null = useMemo(() => (company && cases.length ? buildStrategy({ company, profile, cases }) : null), [company, profile, cases])

  // 같은 입력이면 같은 해시 — 전략 생성 이벤트는 해시당 한 번만, AI 보강 결과도 해시로 재사용
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
          void repo.track(user, 'case_auto_matched', null, { companyId: company.id, caseIds: strategy.cases.map((c) => c.caseStudy.id), kinds: strategy.cases.map((c) => c.kind) })
        }
      } catch {
        /* ignore */
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
      toast.show(`${c.name}을(를) 휴지통으로 이동했습니다.`, 'ok', { label: '되돌리기', onClick: async () => repo.restoreCompany(user, c.id) })
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
    const key = keys[0]
    try {
      const next = await repo.updateProfile(user, p.id, { facts: applyEvidence(p.facts, evidence), evidence })
      setProfiles((cur) => cur.map((x) => (x.id === next.id ? next : x)))
      setProfileOpen(next)
      void repo.track(user, 'profile_corrected', null, { key, action: removed ? 'removed' : 'restored', from: 'strategy' })
      toast.show(removed ? '이 정보를 사용하지 않습니다. 전략을 다시 계산했습니다.' : '정보를 되돌렸습니다.', 'ok')
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '수정하지 못했습니다.', 'danger')
    }
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

  async function refreshDiagnosis() {
    if (!company) return
    const d = await repo.lookupDiagnosis(user, company.name, company.phone)
    if (!d) return toast.show('일치하는 사전진단이 없습니다. 회사명과 대표 연락처를 확인해 주세요.')
    const next = await repo.updateCompany(user, { ...company, diagnosis: d })
    setCompany(next)
    toast.show('사전진단을 연결했습니다.', 'ok')
  }

  const d = company.diagnosis
  const pinned = (company.pinnedCaseIds ?? []).map((id) => cases.find((c) => c.id === id)).filter((c): c is CaseStudy => Boolean(c))
  const recs = strategy.cases.filter((m) => !pinned.some((p) => p.id === m.caseStudy.id))
  const approach = enhanced && enhanced.hash === hash && enhanced.approach ? enhanced.approach : strategy.approach
  const staleEnhanced = enhanced !== null && enhanced.hash !== hash
  const summary = profileSummary(profile)

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      {/* 전략 — 첫 화면 */}
      <section className="reveal">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/companies" className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
            <ArrowLeft aria-hidden="true" className="size-4" /> 고객
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <Link to={`/companies/${company.id}/pdf`} className="t-sub inline-flex items-center gap-1 font-semibold text-ink-500 hover:text-ink-900" data-testid="add-pdf">
              <FileText aria-hidden="true" className="size-4" /> PDF 추가
            </Link>
            <Link to={`/companies/${company.id}/edit`} className="t-sub inline-flex items-center gap-1 font-semibold text-ink-500 hover:text-ink-900">
              <Pencil aria-hidden="true" className="size-4" /> 정보 수정
            </Link>
            <button type="button" onClick={() => setArchiveOpen(true)} className="t-sub inline-flex items-center gap-1 font-semibold text-ink-500 hover:text-danger-700" data-testid="archive-company">
              <Trash2 aria-hidden="true" className="size-4" /> 휴지통으로 이동
            </button>
          </div>
        </div>
        {user.role === 'master' && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-(--radius-control) bg-paper-2 px-3 py-2" data-testid="assign-row">
            <UserCog aria-hidden="true" className="size-4 text-ink-500" />
            <span className="t-sub font-bold text-ink-700">담당 컨설턴트</span>
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
        )}
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
          {summary && <Badge tone="ok">📄 {summary}</Badge>}
        </div>

        <div className="mt-5">
          <Insight>
            <span data-testid="strategy-approach">{approach}</span>
            {enhanced && enhanced.hash === hash && enhanced.approach && (
              <span className="t-meta ml-2 text-ink-500">
                <Sparkles aria-hidden="true" className="inline size-3.5" /> AI 다듬음
              </span>
            )}
          </Insight>
        </div>

        <ol className="mt-6 grid gap-3 md:grid-cols-3" aria-label="오늘 공략 포인트">
          {strategy.focus.map((f, i) => (
            <li key={f.area} className="reveal rounded-(--radius-card) border border-line bg-white p-5" style={{ animationDelay: `${i * 60}ms` }} data-testid="focus-item" data-area={f.area}>
              <div className="flex items-center justify-between gap-2">
                <span className="tnum inline-flex size-9 items-center justify-center rounded-full bg-accent-600 text-[1.05rem] font-black text-white" aria-hidden="true">
                  {i + 1}
                </span>
                <EvidenceBadge status={f.status} />
              </div>
              <p className="mt-3 text-[1.15rem] font-bold leading-snug">{f.title}</p>
              <p className="t-sub mt-1 text-ink-500">{f.why}</p>
            </li>
          ))}
        </ol>
        <p className="t-meta mt-2 font-bold tracking-wide text-accent-800">오늘 공략 포인트 {strategy.focus.length}가지</p>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button variant="primary" size="lg" className="w-full sm:w-auto sm:min-w-[240px]" onClick={() => void startMeeting()} disabled={busy} data-testid="start-meeting">
            <Play aria-hidden="true" className="size-5" /> {liveMeeting ? '미팅 이어가기' : '미팅 시작'}
          </Button>
          <span className="t-sub text-ink-500">
            질문 {strategy.questions.length}개{strategy.prefilled.length > 0 && ` · 사전진단으로 ${strategy.prefilled.length}개 건너뜀`}
          </span>
          <button type="button" onClick={() => setSourcesOpen(true)} className="t-sub inline-flex items-center gap-1 font-semibold text-accent-700 hover:underline" data-testid="open-sources">
            왜 이렇게 판단했나요?
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="strategy-confidence" data-level={strategy.confidence.level}>
          <Badge tone={strategy.confidence.level === 'high' ? 'ok' : strategy.confidence.level === 'medium' ? 'info' : 'warn'}>정보 충분도 {strategy.confidence.label}</Badge>
          <span className="t-meta text-ink-500">
            PDF {strategy.confidence.pdf ? '완료' : '없음'} · 사전진단 {strategy.confidence.diagnosis ? '있음' : '없음'} · 미확인 핵심정보 {strategy.confidence.unknownCore}개
          </span>
          {enhancer.available && (
            <Button size="sm" onClick={() => void enhance()} disabled={enhancing || (enhanced !== null && !staleEnhanced)} data-testid="enhance">
              <Sparkles aria-hidden="true" className="size-4" /> {enhancing ? 'AI 다듬는 중…' : staleEnhanced ? '전략 다시 생성' : enhanced ? 'AI 문장 적용됨' : 'AI로 문장 다듬기'}
            </Button>
          )}
        </div>
      </section>

      {/* 접어서 제공 — 실제 사례는 기본 펼침 */}
      <div className="space-y-3">
        <Fold label="이 미팅에 쓸 실제 사례" count={pinned.length + recs.length} defaultOpen testId="fold-cases">
          <p className="t-sub mb-3 text-ink-500">① 업종이 가까운 사례 ② 문제구조가 가까운 사례 ③ 전환경로가 가까운 사례 — 리서치 원문 기반. 금액은 마지막에.</p>
          {pinned.length + recs.length === 0 ? (
            <p className="rounded-(--radius-card) border border-dashed border-line-strong bg-white px-5 py-6 t-body text-ink-500">검수된 사례 중 맞는 것이 없습니다. 사례 탐색에서 직접 찾아보세요.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pinned.map((c) => (
                <CaseRow key={c.id} c={c} reason="📌 내가 고른 사례" to={`/cases/${c.id}?company=${company.id}`} onOpen={() => void repo.track(user, 'case_opened', null, { caseId: c.id, from: 'brief' })} />
              ))}
              {recs.map((m) => (
                <div key={m.caseStudy.id} data-testid="strategy-case" data-kind={m.kind}>
                  <p className="t-meta mb-1 font-bold tracking-wide text-accent-800">{m.kindLabel}</p>
                  <CaseRow c={m.caseStudy} reason={`왜 추천했나요? ${m.reasons.slice(0, 3).join(' · ')}`} to={`/cases/${m.caseStudy.id}?company=${company.id}`} onOpen={() => void repo.track(user, 'case_opened', null, { caseId: m.caseStudy.id, from: 'brief' })} />
                </div>
              ))}
            </div>
          )}
          <div className="mt-3">
            <Link to={`/cases?company=${company.id}`} className="t-sub font-semibold text-accent-700 hover:underline">
              사례 더 찾기
            </Link>
          </div>
        </Fold>

        <Fold label="오늘 꼭 물어볼 질문" count={strategy.questions.length} testId="fold-questions">
          <ol className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
            {strategy.questions.map((q, i) => (
              <li key={q.id} className="flex gap-3 px-4 py-2.5">
                <span className="tnum t-sub w-6 shrink-0 font-black text-accent-700">{i + 1}</span>
                <span className="min-w-0">
                  <span className="t-body block">{q.title}</span>
                  <span className="t-meta block text-ink-500">"{q.say}"</span>
                </span>
              </li>
            ))}
            {strategy.prefilled.map((p) => (
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
          {strategy.hypotheses.length > 0 && (
            <div className="mt-4">
              <p className="t-meta font-black tracking-wide text-ink-500">문서에서 읽은 가설 → 확인할 질문</p>
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
        </Fold>

        <Fold label="고객에게 이렇게 말하세요" testId="fold-scripts">
          <ul className="space-y-3">
            {strategy.scripts.map((s) => {
              const say = enhanced && enhanced.hash === hash ? enhanced.scripts?.find((x) => x.key === s.key)?.say ?? s.say : s.say
              return (
                <li key={s.key} className="rounded-(--radius-card) border border-line bg-white p-4" data-testid="script" data-key={s.key}>
                  <p className="t-meta font-black tracking-wide text-accent-800">{s.title}</p>
                  <p className="t-body mt-1.5 font-semibold">"{say}"</p>
                  <p className="t-sub mt-1.5 text-ink-500">다음 질문 → "{s.next}"</p>
                </li>
              )
            })}
          </ul>
          <div className="mt-4">
            <p className="t-meta font-black tracking-wide text-ink-500">예상 AX 방향 · 범위 가설</p>
            <p className="t-body mt-1">{strategy.axDirection}</p>
            <p className="t-sub mt-1 text-ink-700">
              <Badge tone="warn">🟡 가설</Badge> {strategy.scope.label} — {strategy.scope.reason}. 정확한 범위는 미팅 답변으로 정합니다.
            </p>
          </div>
        </Fold>

        <Fold label="주의할 표현 · 먼저 하지 말아야 할 말" testId="fold-forbidden">
          <AccentStrip label="절대 먼저 하지 마세요" tone="warn">
            <ul className="space-y-1">
              {strategy.forbidden.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </AccentStrip>
          <div className="mt-3">
            <p className="t-meta font-black tracking-wide text-ink-500">오늘의 주의</p>
            <ul className="t-body mt-1 list-disc space-y-1 pl-5">
              {strategy.briefing.cautions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div className="mt-3">
            <p className="t-meta font-black tracking-wide text-ink-500">2차 제안에 필요한 추가정보</p>
            <ul className="t-body mt-1 list-disc space-y-1 pl-5">
              {strategy.missingInfo.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <details className="mt-3">
            <summary className="t-sub cursor-pointer font-semibold text-accent-700">업종 배경 자세히 보기</summary>
            <p className="t-body mt-2 text-ink-700">{strategy.briefing.detail}</p>
          </details>
        </Fold>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* 기업자료 */}
        <FlatSection
          title="기업자료"
          sub={profiles.length ? '원본 PDF 는 저장하지 않고 추출한 값과 근거만 보관합니다' : 'PDF 를 올리면 재무·인증·성장 정보가 전략에 반영됩니다'}
          action={
            <Link to={`/companies/${company.id}/pdf`} className="t-sub font-semibold text-accent-700 hover:underline">
              PDF 추가
            </Link>
          }
        >
          {profiles.length === 0 ? (
            <p className="rounded-(--radius-card) border border-dashed border-line-strong bg-white px-5 py-6 t-body text-ink-500">아직 기업자료가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white" data-testid="profile-list">
              {profiles.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-3" data-testid="profile-row">
                  <FileText aria-hidden="true" className="size-5 shrink-0 text-accent-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">
                      {p.sourceName} {p.sourceType === 'pdf' && p.pageCount > 0 ? `· ${p.pageCount}쪽` : ''}
                    </span>
                    <span className="t-meta block text-ink-500">
                      {formatDate(p.createdAt, true)} · {p.evidence.filter((e) => !e.removed).length}개 항목 · 분석완료{p.sourceType === 'pdf' ? ' · 원본 저장 안 함' : ''}
                      {p === profile ? ' · 전략에 사용 중' : ''}
                    </span>
                  </span>
                  <Button size="sm" onClick={() => setProfileOpen(p)} data-testid="open-profile">
                    추출정보 보기
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </FlatSection>

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
                {strategy.briefing.diagnosisLines.length > 0 && (
                  <ul className="t-body mt-3 list-disc space-y-1 pl-5">
                    {strategy.briefing.diagnosisLines.map((l) => (
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
      </div>

      {meetings.length > 0 && (
        <FlatSection title="미팅 기록" sub="상태에 따라 할 수 있는 일이 다릅니다 — 전달된 미팅은 요청을 철회해야 지울 수 있습니다">
          <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
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
                      <XCircle aria-hidden="true" className="size-4" /> 미팅 취소
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
        </FlatSection>
      )}

      {/* 왜 이렇게 판단했나요? */}
      <Sheet open={sourcesOpen} onClose={() => setSourcesOpen(false)} title="왜 이렇게 판단했나요?" testId="strategy-sources">
        <p className="t-sub text-ink-500">전략에 쓰인 값과 출처입니다. ✅ 확인 / 🟡 추정 / ⚪ 미확인 — 미확인은 미팅에서 채웁니다.</p>
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
        {strategy.hypotheses.length > 0 && (
          <div className="mt-4">
            <p className="t-meta font-black tracking-wide text-ink-500">가설 (문서 → 가설 → 질문)</p>
            <ul className="t-sub mt-1 list-disc space-y-1 pl-5 text-ink-700">
              {strategy.hypotheses.map((h) => (
                <li key={h.id}>
                  {h.text} — {h.basis}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Sheet>

      {/* 추출정보 보기 — 항목 제외/되돌리기 → 즉시 재계산 */}
      <Sheet open={Boolean(profileOpen)} onClose={() => setProfileOpen(null)} title={profileOpen ? `${profileOpen.sourceName} · 추출정보` : ''} wide testId="profile-sheet">
        {profileOpen && (
          <div>
            <p className="t-sub text-ink-500">
              {profileOpen.sourceFileName || '파일명 없음'} · {formatDate(profileOpen.createdAt, true)} · 파서 {profileOpen.parser.adapter} {profileOpen.parser.version} · 원본 PDF 는 저장하지 않았습니다
            </p>
            {profileOpen.parser.warnings.length > 0 && (
              <ul className="t-meta mt-2 space-y-0.5 rounded-(--radius-control) bg-warn-50 px-3 py-2 text-warn-700">
                {profileOpen.parser.warnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
            <div className="mt-3" data-testid="profile-evidence-list">
              <EvidenceList evidence={profileOpen.evidence} compact onRemove={(key) => void toggleEvidence(profileOpen, [key], true)} onRestore={(key) => void toggleEvidence(profileOpen, [key], false)} />
            </div>
          </div>
        )}
      </Sheet>

      <DangerModal
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        title={`${company.name}을(를) 휴지통으로 이동할까요?`}
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
