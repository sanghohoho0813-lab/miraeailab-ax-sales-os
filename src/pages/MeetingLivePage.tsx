/**
 * LIVE MEETING — 포커스 모드. 헤더 "회사명 / LIVE MEETING / 3 / 7", 한 화면 한 질문, 큰 선택지.
 * [왜 묻나요?] [이렇게 말하세요] 는 바텀시트. 떠 있는 [대표 핵심말 기록](음성 입력)과 [코치](상황별 핵심 답변 + 다음 질문).
 * 사전진단으로 이미 답한 질문은 묻지 않고(🟡 추정으로 분석에 포함) 필요하면 시트에서 확인·수정한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, LifeBuoy, Mic, MicOff, SkipForward, Quote, X } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { CaseStudy, Company, Meeting } from '../types/domain'
import { Badge, Button, ChoiceGrid, SaveStatusPill, Sheet, SkeletonList, TextArea, useToast } from '../components/ui'
import { SaveQueue, clearDraft, readDraft, type SaveStatus } from '../lib/saveQueue'
import { QUESTION_BY_ID } from '../content/questions'
import { PRICING_GUIDE, DEFERRED_GUIDE, FUNDING_GUIDE } from '../content/pricing'
import { guardText } from '../content/forbidden'
import { coachFor } from '../content/coach'
import { analyzeMeeting } from '../engine/analysis'
import { nowIso } from '../lib/util'
import { optionLabel } from '../content/questions'

import { getSpeechRecognition as getSpeech, type SpeechRecognitionLike } from '../lib/speech'

type SheetKind = null | 'say' | 'quote' | 'coach' | 'prefilled'
type CoachTab = 'now' | 'price' | 'deferred' | 'funding'

export default function MeetingLivePage() {
  const { user, repo } = useSession()
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [cases, setCases] = useState<CaseStudy[]>([])
  const [index, setIndex] = useState(0)
  const [sheet, setSheet] = useState<SheetKind>(null)
  const [coachTab, setCoachTab] = useState<CoachTab>('now')
  const [listening, setListening] = useState(false)
  const [ending, setEnding] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const meetingRef = useRef<Meeting | null>(null)
  const queueRef = useRef<SaveQueue<Meeting> | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [savePending, setSavePending] = useState(false)
  useEffect(() => {
    meetingRef.current = meeting
  }, [meeting])

  // 직렬 저장기 — 빠르게 눌러도 마지막 상태가 남고, 실패하면 기기에 임시 저장 + online 복귀 시 재시도
  useEffect(() => {
    if (!meetingId) return
    const q = new SaveQueue<Meeting>({
      draftKey: `axpartner.draft.meeting.${meetingId}`,
      save: async (m) => {
        await repo.updateMeeting(user, m)
      },
      onStatus: (st, info) => {
        setSaveStatus(st)
        setSavePending(info.pending)
      },
    })
    queueRef.current = q
    return () => {
      void q.flush()
      q.dispose()
      queueRef.current = null
    }
  }, [meetingId, repo, user])

  // 저장 대기 중에 나가면 경고 — 임시 저장본은 이미 기기에 있다
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const q = queueRef.current
      if (q && q.pending) {
        void q.flush()
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  useEffect(() => {
    if (!meetingId) return
    let alive = true
    ;(async () => {
      const m = await repo.getMeeting(user, meetingId)
      if (!alive || !m) return
      const [c, cs] = await Promise.all([repo.getCompany(user, m.companyId), repo.listCases(user)])
      if (!alive) return
      setCases(cs)
      setCompany(c)
      let cur = m
      // 기기 임시 저장본이 서버보다 새로우면(끊긴 채 답했던 경우) 그것을 살려서 다시 저장한다
      const draft = readDraft<Meeting>(`axpartner.draft.meeting.${m.id}`)
      if (draft && !draft.synced && draft.state.id === m.id && draft.savedAt > (m.updatedAt ?? '') && m.status !== 'submitted') {
        cur = { ...draft.state, status: draft.state.status === 'draft' ? 'live' : draft.state.status }
        toast.show('기기에 임시 저장된 답변을 복구했습니다. 다시 저장합니다.', 'ok')
        queueRef.current?.push(cur)
      } else if (m.status === 'draft') {
        cur = await repo.updateMeeting(user, { ...m, status: 'live', startedAt: nowIso() })
        void repo.track(user, 'meeting_started', m.id, { questionCount: m.questionIds.length })
      }
      setMeeting(cur)
      const live = cur.questionIds.filter((qid) => cur.answers[qid]?.source !== 'diagnosis')
      const firstOpen = live.findIndex((qid) => !cur.answers[qid] && !cur.skippedQuestionIds.includes(qid))
      setIndex(firstOpen < 0 ? live.length : firstOpen)
      document.title = `${c?.name ?? '미팅'} · LIVE MEETING`
    })()
    return () => {
      alive = false
    }
  }, [meetingId, repo, user, toast])

  /** LIVE 에서 실제로 묻는 질문 — 사전진단으로 채워진 것은 제외 */
  const liveIds = useMemo(() => (meeting ? meeting.questionIds.filter((qid) => meeting.answers[qid]?.source !== 'diagnosis') : []), [meeting])
  const prefilledIds = useMemo(() => (meeting ? meeting.questionIds.filter((qid) => meeting.answers[qid]?.source === 'diagnosis') : []), [meeting])
  const total = liveIds.length
  const isFinal = index >= total
  const qid = !isFinal ? liveIds[index] : null
  const question = qid ? QUESTION_BY_ID[qid] : null
  const answer = qid && meeting ? meeting.answers[qid] : undefined
  const coach = useMemo(() => (meeting ? coachFor(meeting.answers, qid) : { now: [], common: [] }), [meeting, qid])

  const persist = useCallback((next: Meeting) => {
    setMeeting(next)
    queueRef.current?.push(next)
  }, [])

  function setAnswer(targetId: string, value: string) {
    if (!meeting) return
    const next: Meeting = {
      ...meeting,
      answers: { ...meeting.answers, [targetId]: { questionId: targetId, value, source: 'consultant', at: nowIso() } },
      skippedQuestionIds: meeting.skippedQuestionIds.filter((x) => x !== targetId),
    }
    persist(next)
    void repo.track(user, 'question_answered', meeting.id, { questionId: targetId, value })
  }
  function choose(value: string) {
    if (!qid) return
    setAnswer(qid, value)
    setIndex((i) => i + 1)
  }
  function skip() {
    if (!meeting || !qid) return
    const next: Meeting = { ...meeting, skippedQuestionIds: Array.from(new Set([...meeting.skippedQuestionIds, qid])) }
    persist(next)
    void repo.track(user, 'question_skipped', meeting.id, { questionId: qid })
    setIndex((i) => i + 1)
  }
  function toggleHard() {
    if (!meeting || !qid) return
    const has = meeting.hardQuestionIds.includes(qid)
    const next: Meeting = { ...meeting, hardQuestionIds: has ? meeting.hardQuestionIds.filter((x) => x !== qid) : [...meeting.hardQuestionIds, qid] }
    persist(next)
    if (!has) void repo.track(user, 'question_hard', meeting.id, { questionId: qid })
  }
  function openSheet(kind: Exclude<SheetKind, null>, tab?: CoachTab) {
    setSheet(kind)
    if (tab) setCoachTab(tab)
    if (meeting && (kind === 'say' || kind === 'coach')) void repo.track(user, 'tip_opened', meeting.id, { kind, questionId: qid })
  }
  const closeSheet = useCallback(() => setSheet(null), [])

  function toggleMic() {
    if (listening) {
      recRef.current?.stop()
      setListening(false)
      return
    }
    const Ctor = getSpeech()
    if (!Ctor) return toast.show('이 브라우저는 음성입력을 지원하지 않습니다. 직접 입력해 주세요.')
    const rec = new Ctor()
    rec.lang = 'ko-KR'
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (e) => {
      const text = Array.from({ length: e.results.length }, (_, i) => e.results[i][0]?.transcript ?? '').join(' ').trim()
      const m = meetingRef.current
      if (text && m) persist({ ...m, keyQuote: `${m.keyQuote ? m.keyQuote + ' ' : ''}${text}` })
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  async function endMeeting() {
    if (!meeting || !company || ending) return
    if (!meeting.keyQuote.trim()) return toast.show('대표가 직접 한 중요한 말을 한 줄이라도 적어 주세요.', 'danger')
    setEnding(true)
    try {
      // 대기 중인 저장을 먼저 밀어 넣는다 — 안 되면 마무리도 하지 않는다
      const flushed = await queueRef.current?.flush()
      if (flushed === false) {
        toast.show('아직 저장되지 않은 답변이 있습니다. 연결을 확인한 뒤 다시 눌러 주세요. (기기에 임시 저장됨)', 'danger')
        return
      }
      const ended: Meeting = { ...meeting, endedAt: meeting.endedAt ?? nowIso() }
      const analysis = analyzeMeeting(company, ended, cases)
      const saved = await repo.updateMeeting(user, { ...ended, status: 'analyzed', analysis })
      clearDraft(`axpartner.draft.meeting.${meeting.id}`)
      void repo.track(user, 'meeting_ended', saved.id, { answered: Object.keys(saved.answers).length, skipped: saved.skippedQuestionIds.length, hard: saved.hardQuestionIds.length })
      void repo.track(user, 'analysis_generated', saved.id, { version: analysis.version, scope: analysis.scopeLevel })
      navigate(`/meetings/${saved.id}/result`, { replace: true })
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '분석하지 못했습니다.', 'danger')
    } finally {
      setEnding(false)
    }
  }

  if (!meeting || !company) return <SkeletonList rows={2} />
  const quoteHits = guardText(meeting.keyQuote + '\n' + meeting.memo)
  const answeredCount = liveIds.filter((id) => meeting.answers[id]?.source === 'consultant').length
  const progress = Math.round(((isFinal ? total : index) / Math.max(1, total)) * 100)

  return (
    <div className="mx-auto max-w-[820px] pb-36 sm:pb-28">
      {/* 포커스 헤더 */}
      <div className="sticky top-0 z-30 -mx-4 border-b border-line bg-white/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <Link to={`/companies/${company.id}`} className="nav-item t-sub inline-flex shrink-0 items-center gap-1 rounded-(--radius-control) px-1 py-1 whitespace-nowrap text-ink-500 hover:text-ink-900" aria-label="미팅 전략으로 나가기">
            <X aria-hidden="true" className="size-5" /> <span className="hidden sm:inline">나가기</span>
          </Link>
          <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap sm:gap-3" data-testid="live-header">
            <span className="min-w-0 truncate text-[1rem] font-bold text-ink-900 sm:text-[1.05rem]">{company.name}</span>
            <span className="text-ink-300" aria-hidden="true">
              /
            </span>
            <span className="t-meta shrink-0 font-black tracking-[0.1em] text-accent-700">LIVE MEETING</span>
            <span className="text-ink-300" aria-hidden="true">
              /
            </span>
            <span className="tnum t-sub shrink-0 font-bold text-ink-700" aria-live="polite" data-testid="live-progress">
              {isFinal ? '마무리' : `${index + 1} / ${total}`}
            </span>
          </div>
          <span className="shrink-0">
            <SaveStatusPill status={saveStatus} pending={savePending} />
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="h-full bg-accent-600 transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {!isFinal && question ? (
        <div key={question.id} className="reveal pt-6 sm:pt-10">
          <p className="t-meta font-bold tracking-wide text-accent-700">
            {index + 1}번 질문{prefilledIds.length > 0 && index === 0 && ` · 사전진단으로 ${prefilledIds.length}개는 건너뜁니다`}
          </p>
          <h1 className="t-question mt-2" data-testid="live-question">
            {question.title}
          </h1>

          <div className="mt-6">
            <ChoiceGrid columns={2} ariaLabel={question.title} options={question.options} value={answer?.source === 'consultant' ? answer.value : null} onChange={choose} />
          </div>

          {/* 선택지를 누르면 저장하고 바로 다음 질문으로 간다 — [다음] 버튼은 두지 않는다 */}
          <div className="mt-4">
            <button type="button" onClick={() => openSheet('say')} className="nav-item t-sub rounded-(--radius-control) px-1 py-1 font-semibold text-accent-700 hover:underline" data-testid="open-say">
              어떻게 물어보지?
            </button>
          </div>

          <div className="mt-6 flex items-center justify-between gap-2 border-t border-line pt-3">
            <Button size="sm" variant="ghost" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0} data-testid="prev">
              <ChevronLeft aria-hidden="true" className="size-4" /> 이전
            </Button>
            <Button size="sm" variant="ghost" onClick={skip} data-testid="skip">
              건너뛰기 <SkipForward aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="reveal pt-6 sm:pt-10">
          <p className="t-meta font-bold tracking-wide text-accent-700">마무리</p>
          <h1 className="t-question mt-2">대표가 직접 한 중요한 말</h1>
          <p className="t-body mt-2 text-ink-500">예: "내가 하루만 빠져도 직원들이 계속 전화해요." — 이 문장이 2차 제안의 첫 줄이 됩니다. 필수 자유입력은 이것 하나입니다.</p>
          <div className="mt-4 flex items-start gap-2">
            <TextArea value={meeting.keyQuote} onChange={(e) => persist({ ...meeting, keyQuote: e.target.value })} placeholder="대표님 말을 그대로 적어 주세요" data-testid="key-quote" />
            <Button variant={listening ? 'danger' : 'secondary'} size="lg" onClick={toggleMic} aria-pressed={listening} aria-label="음성으로 입력" className="shrink-0">
              {listening ? <MicOff aria-hidden="true" className="size-5" /> : <Mic aria-hidden="true" className="size-5" />}
            </Button>
          </div>
          <div className="mt-4">
            <TextArea value={meeting.memo} onChange={(e) => persist({ ...meeting, memo: e.target.value })} placeholder="기타 메모 (선택) — 내부용, 고객 문서에는 노출되지 않습니다" className="min-h-20" aria-label="기타 메모" />
          </div>
          {quoteHits.length > 0 && (
            <div role="alert" className="mt-3 rounded-r-(--radius-control) border-l-4 border-danger-600 bg-danger-50 px-4 py-3">
              <p className="t-body font-bold text-danger-700">⚠ 표현 수정 권장</p>
              <ul className="t-sub mt-1 space-y-1 text-ink-700">
                {quoteHits.map((h) => (
                  <li key={h.id}>
                    "{h.phrase}" — {h.why} <span className="font-semibold text-ink-900">대체: {h.alternative}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              답변 {answeredCount}/{total}
            </Badge>
            {prefilledIds.length > 0 && (
              <button type="button" onClick={() => openSheet('prefilled')} className="nav-item tap inline-flex items-center rounded-full bg-warn-50 px-3 py-1 t-meta font-bold text-warn-700 hover:bg-warn-50/70">
                🟡 사전진단 {prefilledIds.length} · 확인하기
              </button>
            )}
            {meeting.skippedQuestionIds.length > 0 && <Badge tone="warn">건너뜀 {meeting.skippedQuestionIds.length}</Badge>}
            {meeting.hardQuestionIds.length > 0 && <Badge tone="warn">어려워함 {meeting.hardQuestionIds.length}</Badge>}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-5">
            <Button size="sm" variant="ghost" onClick={() => setIndex(Math.max(0, total - 1))}>
              <ChevronLeft aria-hidden="true" className="size-4" /> 질문으로
            </Button>
            <Button variant="primary" size="lg" onClick={() => void endMeeting()} disabled={ending} data-testid="end-meeting">
              {ending ? '분석 중…' : '미팅 마무리'}
            </Button>
          </div>
        </div>
      )}

      {/* 떠 있는 버튼 — 모바일은 하단 바, PC 는 오른쪽 아래 */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 flex items-center justify-end gap-2 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:inset-x-auto sm:right-6 sm:bottom-6 sm:flex-col sm:items-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        {!isFinal && (
          <button type="button" onClick={() => openSheet('quote')} data-testid="open-quote" className="btn inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-accent-600 px-4 py-3 text-[0.95rem] font-bold text-white shadow-(--shadow-float) hover:bg-accent-700 sm:flex-none" aria-haspopup="dialog">
            <Quote aria-hidden="true" className="size-5" /> 대표 핵심말 기록
            {meeting.keyQuote.trim() && <span className="ml-1 inline-flex size-2 rounded-full bg-white" aria-label="기록 있음" />}
          </button>
        )}
        <button type="button" onClick={() => openSheet('coach', 'now')} data-testid="open-coach" className="btn inline-flex items-center justify-center gap-2 rounded-full border border-line-strong bg-white px-4 py-3 text-[0.95rem] font-bold text-ink-700 shadow-(--shadow-float) hover:bg-paper-2" aria-haspopup="dialog">
          <LifeBuoy aria-hidden="true" className="size-5" /> 코치{coach.now.length > 0 && <span className="tnum ml-0.5 rounded-full bg-accent-600 px-1.5 text-[0.75rem] text-white">{coach.now.length}</span>}
        </button>
      </div>

      {/* 시트 — 이렇게 말하세요 (왜 묻는지와 "답하기 어려워함" 도 여기 안에) */}
      <Sheet open={sheet === 'say'} onClose={closeSheet} title="어떻게 물어보지?" testId="sheet-say">
        <p className="text-[1.15rem] font-semibold leading-relaxed text-ink-900">"{question?.say}"</p>
        <p className="t-sub mt-3 text-ink-500">정확한 숫자를 캐묻지 않습니다. 방향과 강도를 먼저 듣고, 선택지에서 고릅니다.</p>
        {question && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button size="sm" variant={meeting.hardQuestionIds.includes(question.id) ? 'dark' : 'ghost'} onClick={toggleHard} aria-pressed={meeting.hardQuestionIds.includes(question.id)} data-testid="hard">
              대표가 답하기 어려워함
            </Button>
          </div>
        )}
        <details className="mt-3" onToggle={(e) => e.currentTarget.open && meeting && void repo.track(user, 'tip_opened', meeting.id, { kind: 'why', questionId: qid })}>
          <summary className="t-sub cursor-pointer font-semibold text-accent-700" data-testid="open-why">
            왜 묻나요?
          </summary>
          <p className="t-body mt-2 text-ink-900" data-testid="why-body">
            {question?.why}
          </p>
        </details>
      </Sheet>

      {/* 시트 — 대표 핵심말 기록 */}
      <Sheet open={sheet === 'quote'} onClose={closeSheet} title="대표 핵심말 기록" testId="sheet-quote">
        <p className="t-sub text-ink-500">대표님이 직접 한 말을 그대로. 음성 버튼을 누르고 말하면 받아 적습니다. 마무리 화면에서 다시 고칠 수 있습니다.</p>
        <div className="mt-3 flex items-start gap-2">
          <TextArea value={meeting.keyQuote} onChange={(e) => persist({ ...meeting, keyQuote: e.target.value })} placeholder='예: "내가 하루만 빠져도 직원들이 계속 전화해요"' data-testid="quote-input" />
          <Button variant={listening ? 'danger' : 'secondary'} size="lg" onClick={toggleMic} aria-pressed={listening} aria-label="음성으로 입력" className="shrink-0" data-testid="mic">
            {listening ? <MicOff aria-hidden="true" className="size-5" /> : <Mic aria-hidden="true" className="size-5" />}
          </Button>
        </div>
        {quoteHits.length > 0 && (
          <p role="alert" className="t-sub mt-3 rounded-(--radius-control) bg-danger-50 px-3 py-2 font-semibold text-danger-700">
            ⚠ 표현 수정 권장: {quoteHits.map((h) => `"${h.phrase}"`).join(', ')}
          </p>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={closeSheet}>
            저장하고 계속
          </Button>
        </div>
      </Sheet>

      {/* 시트 — 사전진단으로 채운 항목 확인 */}
      <Sheet open={sheet === 'prefilled'} onClose={closeSheet} title="사전진단으로 미리 채운 항목" testId="sheet-prefilled">
        <p className="t-sub text-ink-500">홈페이지 3분 AX Fit 에서 대표님이 체크한 값입니다. 미팅에서 다르게 확인했다면 여기서 고칩니다. 그대로 두면 분석에 🟡 추정으로 들어갑니다.</p>
        <ul className="mt-3 space-y-4">
          {prefilledIds.map((id) => {
            const q = QUESTION_BY_ID[id]
            const a = meeting.answers[id]
            if (!q) return null
            return (
              <li key={id}>
                <p className="t-body font-bold">{q.title}</p>
                <p className="t-meta text-warn-700">🟡 {optionLabel(q, a?.value ?? '')}</p>
                <div className="mt-2">
                  <ChoiceGrid columns={2} ariaLabel={q.title} options={q.options} value={a?.source === 'consultant' ? a.value : null} onChange={(v) => setAnswer(id, v)} />
                </div>
              </li>
            )
          })}
        </ul>
      </Sheet>

      {/* 시트 — Contextual Sales Coach */}
      <Sheet open={sheet === 'coach'} onClose={closeSheet} title="세일즈 코치" wide testId="sheet-coach">
        <div className="mb-4 flex flex-wrap gap-1.5">
          {(
            [
              ['now', '지금 상황'],
              ['price', '가격'],
              ['deferred', '후불'],
              ['funding', '정책자금'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setCoachTab(k)} aria-pressed={coachTab === k} className={`nav-item tap rounded-full px-3.5 py-1.5 text-[0.95rem] font-bold ${coachTab === k ? 'bg-ink-900 text-white' : 'bg-paper-2 text-ink-700 hover:bg-line'}`}>
              {label}
            </button>
          ))}
        </div>
        {coachTab === 'now' && (
          <div className="space-y-5">
            {coach.now.length > 0 && (
              <div>
                <p className="t-meta font-black tracking-wide text-accent-800">지금 흐름에서 나올 만한 상황</p>
                <ul className="mt-2 space-y-2.5">
                  {coach.now.map((t) => (
                    <li key={t.id} className="rounded-r-(--radius-control) border-l-4 border-accent-600 bg-accent-50/60 px-4 py-3" data-testid="coach-now">
                      <p className="t-meta font-bold text-ink-500">
                        {t.situation}
                        {t.because && <span className="ml-1 text-accent-800">· {t.because}</span>}
                      </p>
                      <p className="t-body mt-1 font-semibold text-ink-900">{t.answer}</p>
                      <p className="t-sub mt-1 text-accent-800">다음 질문: {t.next}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="t-meta font-black tracking-wide text-ink-500">자주 나오는 상황</p>
              <ul className="mt-2 divide-y divide-line rounded-(--radius-control) border border-line">
                {coach.common.map((t) => (
                  <li key={t.id} className="px-4 py-3">
                    <p className="t-meta font-bold text-ink-500">{t.situation}</p>
                    <p className="t-body mt-0.5 font-semibold">{t.answer}</p>
                    <p className="t-sub mt-0.5 text-accent-800">다음 질문: {t.next}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {coachTab === 'price' && (
          <div className="space-y-3">
            <p className="t-section">{PRICING_GUIDE.title}</p>
            <p className="t-body rounded-(--radius-control) bg-paper-2 p-3 font-semibold">{PRICING_GUIDE.script}</p>
            <ul className="t-sub list-disc space-y-0.5 pl-5 text-ink-700">
              {PRICING_GUIDE.rules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}
        {coachTab === 'deferred' && (
          <div className="space-y-3">
            <p className="t-section">{DEFERRED_GUIDE.title}</p>
            <p className="t-body rounded-(--radius-control) bg-paper-2 p-3 font-semibold">{DEFERRED_GUIDE.script}</p>
            <p className="t-sub text-ink-700">{DEFERRED_GUIDE.principle}</p>
            <p className="t-sub text-danger-700">먼저 꺼내지 않는 말: {DEFERRED_GUIDE.doNotSayFirst.map((s) => `"${s}"`).join(' · ')}</p>
          </div>
        )}
        {coachTab === 'funding' && (
          <div className="space-y-3">
            <p className="t-section">{FUNDING_GUIDE.title}</p>
            <p className="t-body font-semibold">{FUNDING_GUIDE.flow.join(' → ')}</p>
            <p className="t-body rounded-(--radius-control) bg-paper-2 p-3 font-semibold">{FUNDING_GUIDE.script}</p>
            <p className="t-sub text-ink-700">{FUNDING_GUIDE.principle}</p>
            <p className="t-meta text-ink-500">{FUNDING_GUIDE.disclaimer}</p>
          </div>
        )}
      </Sheet>
    </div>
  )
}
