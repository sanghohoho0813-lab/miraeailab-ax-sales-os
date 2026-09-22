/**
 * LIVE — 한 화면 한 질문. CLICK 이 주인공. WHY/SAY 는 접어 둔다. 95% 클릭 입력.
 * 마지막 화면만 자유입력 1개(대표가 직접 한 중요한 말) + 선택 메모.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, LifeBuoy, Mic, MicOff, SkipForward, X } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { CaseStudy, Company, Meeting } from '../types/domain'
import { Badge, Button, ChoiceGrid, Disclosure, Spinner, TextArea, useToast } from '../components/ui'
import { QUESTION_BY_ID } from '../content/questions'
import { OBJECTIONS } from '../content/objections'
import { PRICING_GUIDE, DEFERRED_GUIDE, FUNDING_GUIDE } from '../content/pricing'
import { guardText } from '../content/forbidden'
import { prefillFromDiagnosis, diagnosisHint } from '../engine/diagnosis'
import { analyzeMeeting } from '../engine/analysis'
import { nowIso } from '../lib/util'

type SpeechRecognitionLike = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void }
function getSpeech(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export default function MeetingLivePage() {
  const { user, repo } = useSession()
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [cases, setCases] = useState<CaseStudy[]>([])
  const [index, setIndex] = useState(0)
  const [help, setHelp] = useState<null | 'objections' | 'price' | 'deferred' | 'funding'>(null)
  const [listening, setListening] = useState(false)
  const [ending, setEnding] = useState(false)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const saveTimer = useRef<number | null>(null)

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
      if (m.status === 'draft') {
        const started = await repo.updateMeeting(user, { ...m, status: 'live', startedAt: nowIso() })
        void repo.track(user, 'meeting_started', m.id, { questionCount: m.questionIds.length })
        setMeeting(started)
      } else {
        setMeeting(m)
      }
      // 답한 첫 미응답 질문으로 이동
      const firstOpen = m.questionIds.findIndex((qid) => !m.answers[qid] || m.answers[qid].source === 'diagnosis')
      setIndex(firstOpen < 0 ? m.questionIds.length : firstOpen)
      document.title = `${c?.name ?? '미팅'} · 미팅 중`
    })()
    return () => {
      alive = false
    }
  }, [meetingId, repo, user])

  const total = meeting?.questionIds.length ?? 0
  const isFinal = index >= total
  const qid = !isFinal && meeting ? meeting.questionIds[index] : null
  const question = qid ? QUESTION_BY_ID[qid] : null
  const answer = qid && meeting ? meeting.answers[qid] : undefined
  const prefill = useMemo(() => (question && company ? prefillFromDiagnosis(question, company.diagnosis) : null), [question, company])
  const hint = useMemo(() => (question && company && !prefill ? diagnosisHint(question, company.diagnosis) : null), [question, company, prefill])

  const persist = useCallback(
    (next: Meeting) => {
      setMeeting(next)
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        repo.updateMeeting(user, next).catch(() => toast.show('저장하지 못했습니다. 연결을 확인해 주세요.', 'danger'))
      }, 250)
    },
    [repo, user, toast],
  )

  function choose(value: string) {
    if (!meeting || !qid) return
    const next: Meeting = {
      ...meeting,
      answers: { ...meeting.answers, [qid]: { questionId: qid, value, source: 'consultant', at: nowIso() } },
      skippedQuestionIds: meeting.skippedQuestionIds.filter((x) => x !== qid),
    }
    persist(next)
    void repo.track(user, 'question_answered', meeting.id, { questionId: qid, value, prefilled: Boolean(prefill) })
    setIndex((i) => i + 1)
  }
  function confirmPrefill() {
    if (!answer) return
    choose(answer.value)
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
  function openHelp(kind: NonNullable<typeof help>) {
    setHelp(kind)
    if (meeting) void repo.track(user, 'tip_opened', meeting.id, { kind, questionId: qid })
  }

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
      if (text && meeting) persist({ ...meeting, keyQuote: `${meeting.keyQuote ? meeting.keyQuote + ' ' : ''}${text}` })
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
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      const ended: Meeting = { ...meeting, endedAt: meeting.endedAt ?? nowIso() }
      const analysis = analyzeMeeting(company, ended, cases)
      const saved = await repo.updateMeeting(user, { ...ended, status: 'analyzed', analysis })
      void repo.track(user, 'meeting_ended', saved.id, { answered: Object.keys(saved.answers).length, skipped: saved.skippedQuestionIds.length, hard: saved.hardQuestionIds.length })
      void repo.track(user, 'analysis_generated', saved.id, { version: analysis.version, scope: analysis.scopeLevel })
      navigate(`/meetings/${saved.id}/result`, { replace: true })
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '분석하지 못했습니다.', 'danger')
    } finally {
      setEnding(false)
    }
  }

  if (!meeting || !company) return <Spinner />
  const quoteHits = guardText(meeting.keyQuote + '\n' + meeting.memo)
  const answeredCount = meeting.questionIds.filter((id) => meeting.answers[id]?.source === 'consultant').length

  return (
    <div className="mx-auto max-w-[720px]">
      {/* 상단 — 진행 */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link to={`/companies/${company.id}`} className="t-sub text-ink-500 hover:underline">
          ← {company.name}
        </Link>
        <span className="t-sub font-bold text-ink-700" aria-live="polite">
          {isFinal ? '마무리' : `${index + 1} / ${total}`}
        </span>
      </div>
      <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="h-full bg-accent-600 transition-[width]" style={{ width: `${Math.round(((isFinal ? total : index) / Math.max(1, total)) * 100)}%` }} />
      </div>

      {!isFinal && question ? (
        <div key={question.id} className="rise">
          <p className="t-meta font-bold tracking-wide text-accent-700">{index + 1}번 질문</p>
          <h1 className="t-question mt-1">{question.title}</h1>

          {prefill && answer?.source === 'diagnosis' && (
            <div className="mt-3 rounded-(--radius-control) border border-warn-600/30 bg-warn-50 px-4 py-3">
              <p className="t-body font-semibold text-warn-700">🟡 {prefill.note}</p>
              <p className="t-sub mt-1 text-ink-700">같은 질문을 다시 하지 말고, "실제로 어떤 장면에서 그런가요?" 로 여세요. 맞으면 그대로 확인, 다르면 아래에서 다시 고르세요.</p>
              <Button variant="dark" size="md" className="mt-2" onClick={confirmPrefill} data-testid="confirm-prefill">
                그대로 확인 ✅
              </Button>
            </div>
          )}
          {hint && <p className="t-sub mt-2 rounded-(--radius-control) bg-paper-2 px-3 py-2 text-ink-700">{hint}</p>}

          <div className="mt-4">
            <ChoiceGrid columns={2} ariaLabel={question.title} options={question.options} value={answer?.source === 'consultant' ? answer.value : null} onChange={choose} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Disclosure label="왜 묻나요?" onOpen={() => openHelp('objections' as never)}>
              {question.why}
            </Disclosure>
            <Disclosure label="어떻게 말하나요?">{question.say}</Disclosure>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
            <Button size="sm" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              <ChevronLeft aria-hidden="true" className="size-4" /> 이전
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={meeting.hardQuestionIds.includes(question.id) ? 'dark' : 'ghost'} onClick={toggleHard} aria-pressed={meeting.hardQuestionIds.includes(question.id)}>
                대표가 답하기 어려워함
              </Button>
              <Button size="sm" onClick={skip} data-testid="skip">
                <SkipForward aria-hidden="true" className="size-4" /> 건너뛰기
              </Button>
              <Button size="sm" onClick={() => setIndex((i) => i + 1)}>
                다음 <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rise">
          <p className="t-meta font-bold tracking-wide text-accent-700">마무리</p>
          <h1 className="t-question mt-1">대표가 직접 한 중요한 말</h1>
          <p className="t-body mt-1 text-ink-500">예: "내가 하루만 빠져도 직원들이 계속 전화해요." — 이 문장이 2차 제안의 첫 줄이 됩니다. 필수 자유입력은 이것 하나입니다.</p>
          <div className="mt-3 flex items-start gap-2">
            <TextArea value={meeting.keyQuote} onChange={(e) => persist({ ...meeting, keyQuote: e.target.value })} placeholder="대표님 말을 그대로 적어 주세요" data-testid="key-quote" />
            <Button variant={listening ? 'danger' : 'secondary'} size="lg" onClick={toggleMic} aria-pressed={listening} aria-label="음성으로 입력" className="shrink-0">
              {listening ? <MicOff aria-hidden="true" className="size-5" /> : <Mic aria-hidden="true" className="size-5" />}
            </Button>
          </div>
          <div className="mt-4">
            <Disclosure label="기타 메모 (선택)">
              <TextArea value={meeting.memo} onChange={(e) => persist({ ...meeting, memo: e.target.value })} placeholder="내부 메모 — 고객 문서에는 노출되지 않습니다" />
            </Disclosure>
          </div>
          {quoteHits.length > 0 && (
            <div role="alert" className="mt-3 rounded-(--radius-control) border border-danger-600/30 bg-danger-50 px-4 py-3">
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
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="neutral">답변 {answeredCount}/{total}</Badge>
            {meeting.skippedQuestionIds.length > 0 && <Badge tone="warn">건너뜀 {meeting.skippedQuestionIds.length}</Badge>}
            {meeting.hardQuestionIds.length > 0 && <Badge tone="warn">어려워함 {meeting.hardQuestionIds.length}</Badge>}
          </div>
          <div className="mt-6 flex flex-wrap justify-between gap-2 border-t border-line pt-4">
            <Button size="sm" onClick={() => setIndex(Math.max(0, total - 1))}>
              <ChevronLeft aria-hidden="true" className="size-4" /> 질문으로
            </Button>
            <Button variant="primary" size="lg" onClick={() => void endMeeting()} disabled={ending} data-testid="end-meeting">
              {ending ? '분석 중…' : '미팅 종료 · 분석하기'}
            </Button>
          </div>
        </div>
      )}

      {/* 도움말 — 상황별 답변 / 가격 / 후불 / 자금 */}
      <button type="button" onClick={() => openHelp('objections')} className="tap fixed right-4 bottom-24 z-40 inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-3 text-[0.95rem] font-bold text-white shadow-(--shadow-float) lg:bottom-8" aria-haspopup="dialog">
        <LifeBuoy aria-hidden="true" className="size-5" /> 도움말
      </button>
      {help && (
        <div role="dialog" aria-modal="true" aria-label="미팅 도움말" className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 lg:items-center" onClick={() => setHelp(null)}>
          <div className="rise max-h-[85vh] w-full max-w-[720px] overflow-y-auto rounded-t-(--radius-card) bg-white p-5 lg:rounded-(--radius-card)" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['objections', '상황별 답변'],
                    ['price', '가격'],
                    ['deferred', '후불'],
                    ['funding', '정책자금'],
                  ] as const
                ).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => openHelp(k)} aria-pressed={help === k} className={`tap rounded-full px-3 py-1.5 text-[0.95rem] font-bold ${help === k ? 'bg-ink-900 text-white' : 'bg-paper-2 text-ink-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setHelp(null)} aria-label="닫기" className="tap rounded-full p-2 hover:bg-paper-2">
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            {help === 'objections' && (
              <ul className="space-y-3">
                {OBJECTIONS.map((o) => (
                  <li key={o.id} className="rounded-(--radius-control) border border-line p-3">
                    <p className="t-meta font-bold text-ink-500">고객: "{o.customerSays}"</p>
                    <p className="t-body mt-1 font-semibold">{o.answer}</p>
                    <p className="t-sub mt-1 text-accent-800">다음 질문: {o.nextQuestion}</p>
                  </li>
                ))}
              </ul>
            )}
            {help === 'price' && (
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
            {help === 'deferred' && (
              <div className="space-y-3">
                <p className="t-section">{DEFERRED_GUIDE.title}</p>
                <p className="t-body rounded-(--radius-control) bg-paper-2 p-3 font-semibold">{DEFERRED_GUIDE.script}</p>
                <p className="t-sub text-ink-700">{DEFERRED_GUIDE.principle}</p>
                <p className="t-sub text-danger-700">먼저 꺼내지 않는 말: {DEFERRED_GUIDE.doNotSayFirst.map((s) => `"${s}"`).join(' · ')}</p>
              </div>
            )}
            {help === 'funding' && (
              <div className="space-y-3">
                <p className="t-section">{FUNDING_GUIDE.title}</p>
                <p className="t-body font-semibold">{FUNDING_GUIDE.flow.join(' → ')}</p>
                <p className="t-body rounded-(--radius-control) bg-paper-2 p-3 font-semibold">{FUNDING_GUIDE.script}</p>
                <p className="t-sub text-ink-700">{FUNDING_GUIDE.principle}</p>
                <p className="t-meta text-ink-500">{FUNDING_GUIDE.disclaimer}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
