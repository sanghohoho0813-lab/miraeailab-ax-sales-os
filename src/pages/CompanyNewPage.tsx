/**
 * 30초 빠른 등록 (3단계) + 고객 정보 수정.
 *   STEP 1 회사명(필수) · 대표자(텍스트/음성) · 연락처(입력/음성/나중에/모름)
 *   STEP 2 업종 · 인원 · 거래형태 (클릭)
 *   STEP 3 관심사 (클릭) · 미팅 일시 (지금/오늘/내일 Quick) → 저장하면 전략이 자동으로 만들어진다.
 * 선택 항목은 [지우기] 로 비울 수 있고, 선택형은 "잘 모르겠음" 으로 되돌릴 수 있다. null/unknown 은 정상 상태다.
 * 음성 초안은 확인 뒤에만 폼에 들어오고, DB 저장은 [저장] 에서만.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, Mic, X } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, FieldSources, Headcount, Industry, Interest, ProfileSource, TradeType } from '../types/domain'
import { Button, ChoiceGrid, Field, Sheet, TextArea, TextInput, useToast, SkeletonList } from '../components/ui'
import { HEADCOUNT_LABEL, HEADCOUNT_ORDER, INDUSTRY_LABEL, INDUSTRY_ORDER, INTEREST_EXTRA, INTEREST_HINT, INTEREST_LABEL, INTEREST_PRIMARY, TRADE_HINT, TRADE_LABEL, TRADE_ORDER } from '../content/labels'
import { MeetingTimePicker, meetingTimeFromIso, resolveMeetingTime, type MeetingTimeValue } from '../components/MeetingTimePicker'
import { VoiceButton, VoiceIntakeSheet, speechSupported, type VoiceApply } from '../components/VoiceIntake'
import { normalizePhoneText } from '../engine/docParser/korean'
import { formatDate } from '../lib/util'

const STEPS = [
  { key: 'company', label: '회사', title: '어느 회사를 만나시나요?', sub: '회사명만 정확하면 됩니다. 대표자·연락처는 나중에 넣어도 됩니다.' },
  { key: 'structure', label: '기본 구조', title: '회사의 기본 구조를 골라 주세요', sub: '모르면 "잘 모르겠음". 미팅에서 확인하면 됩니다.' },
  { key: 'interest', label: '관심사 · 일시', title: '대표님의 관심사와 미팅 시각', sub: '저장하면 오늘의 접근 전략 · 실제 사례 · 질문 · 멘트가 바로 만들어집니다.' },
] as const

type PhoneMode = 'input' | 'later' | 'unknown'

export default function CompanyNewPage() {
  const { user, repo } = useSession()
  const { companyId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const editing = Boolean(companyId)
  const [existing, setExisting] = useState<Company | null>(null)
  const [loaded, setLoaded] = useState(!editing)
  const [step, setStep] = useState(0)

  const [name, setName] = useState('')
  const [industry, setIndustry] = useState<Industry | null>(null)
  const [industryNote, setIndustryNote] = useState('')
  const [headcount, setHeadcount] = useState<Headcount | 'unknown' | null>(null)
  const [tradeType, setTradeType] = useState<TradeType | 'unknown' | null>(null)
  const [interests, setInterests] = useState<Interest[]>([])
  const [representativeName, setRep] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneMode, setPhoneMode] = useState<PhoneMode>('input')
  const [meetingTime, setMeetingTime] = useState<MeetingTimeValue>({ mode: 'now' })
  const [memo, setMemo] = useState('')
  const [sources, setSources] = useState<FieldSources>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [similar, setSimilar] = useState<Company[] | null>(null)
  const [dupChecked, setDupChecked] = useState('')
  const [voiceOpen, setVoiceOpen] = useState(false)

  const mark = (key: keyof FieldSources, src: ProfileSource = user.role === 'master' && editing ? 'master_edit' : 'manual') => setSources((s) => ({ ...s, [key]: src }))

  useEffect(() => {
    document.title = `${editing ? '고객 정보 수정' : '30초 빠른 등록'} · AX Partner OS`
    if (!companyId) return
    let alive = true
    repo.getCompany(user, companyId).then((c) => {
      if (!alive || !c) return
      setExisting(c)
      setName(c.name)
      setIndustry(c.industry)
      setIndustryNote(c.industryNote)
      setHeadcount(c.headcount)
      setTradeType(c.tradeType)
      setInterests(c.interests)
      setRep(c.representativeName)
      setPhone(c.phone)
      setPhoneMode(c.phone ? 'input' : 'later')
      setMeetingTime(meetingTimeFromIso(c.meetingAt))
      setMemo(c.memo)
      setSources(c.fieldSources ?? {})
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [companyId, repo, user, editing])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  const toggleInterest = (v: Interest) => {
    mark('interests')
    setInterests((cur) => {
      if (v === 'unknown') return cur.includes('unknown') ? [] : ['unknown']
      const next = cur.filter((x) => x !== 'unknown')
      return next.includes(v) ? next.filter((x) => x !== v) : [...next, v]
    })
  }

  const stepError = useMemo(() => {
    if (step === 0 && !name.trim()) return '회사명을 입력해 주세요.'
    if (step === 1) {
      if (!industry) return '업종을 골라 주세요. 모르면 "기타" 를 고르세요.'
      if (!headcount) return '인원을 골라 주세요. 모르면 "잘 모르겠음" 을 고르세요.'
      if (!tradeType) return '거래형태를 골라 주세요. 모르면 "잘 모르겠음" 을 고르세요.'
    }
    return ''
  }, [step, name, industry, headcount, tradeType])

  function next() {
    if (stepError) return setError(stepError)
    setError('')
    const key = `${name.trim()}|${phone.trim()}`
    if (step === 0 && !editing && dupChecked !== key) {
      void repo.findSimilarCompanies(user, name, phone).then((list) => {
        setDupChecked(key)
        if (list.length > 0) {
          setSimilar(list)
          void repo.track(user, 'company_duplicate_detected', null, { count: list.length, from: 'quick' })
        } else setStep(1)
      })
      return
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }
  function back() {
    setError('')
    setStep((s) => Math.max(0, s - 1))
  }

  function applyVoice(v: VoiceApply) {
    if (v.companyName) {
      setName(v.companyName)
      mark('name', 'voice')
    }
    if (v.representativeName) {
      setRep(v.representativeName)
      mark('representativeName', 'voice')
    }
    if (v.phone) {
      setPhone(v.phone)
      setPhoneMode('input')
      mark('phone', 'voice')
    }
    if (v.headcount) {
      setHeadcount(v.headcount)
      mark('headcount', 'voice')
    }
    if (v.industry) {
      setIndustry(v.industry)
      mark('industry', 'voice')
    }
    if (v.tradeType) {
      setTradeType(v.tradeType)
      mark('tradeType', 'voice')
    }
    if (v.meetingAt) {
      setMeetingTime({ mode: 'custom', iso: v.meetingAt })
      mark('meetingAt', 'voice')
    }
    if (v.interests?.length) {
      setInterests(v.interests)
      mark('interests', 'voice')
    }
    toast.show('음성 초안을 폼에 채웠습니다. 확인 후 다음으로 넘어가세요.', 'ok')
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    if (step < STEPS.length - 1) return next()
    if (!industry || !headcount || !tradeType) return setStep(1)
    setError('')
    setBusy(true)
    try {
      const meetingAt = resolveMeetingTime(meetingTime)
      const fieldSources: FieldSources = { ...sources }
      if (!fieldSources.name) fieldSources.name = 'manual'
      if (meetingAt && !fieldSources.meetingAt) fieldSources.meetingAt = 'manual'
      const input = {
        name: name.trim(),
        industry,
        industryNote,
        headcount,
        tradeType,
        interests: interests.length ? interests : (['unknown'] as Interest[]),
        representativeName: representativeName.trim(),
        phone: phoneMode === 'input' ? phone.trim() : '',
        meetingAt,
        memo,
        fieldSources,
      }
      let company: Company
      if (existing) {
        company = await repo.updateCompany(user, { ...existing, ...input, industryNote: input.industryNote ?? '', memo: input.memo ?? '' })
      } else {
        company = await repo.createCompany(user, input)
      }
      if (!company.diagnosis) {
        try {
          const diag = await repo.lookupDiagnosis(user, company.name, company.phone)
          if (diag) {
            company = await repo.updateCompany(user, { ...company, diagnosis: diag, fieldSources: { ...company.fieldSources, interests: company.fieldSources?.interests ?? 'website_diagnosis' } })
            toast.show('홈페이지 3분 AX Fit 사전진단을 찾아 연결했습니다.', 'ok')
          }
        } catch {
          /* 진단 조회 실패는 등록을 막지 않는다 */
        }
      }
      navigate(`/companies/${company.id}`, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <SkeletonList rows={2} />
  const cur = STEPS[step]
  const last = step === STEPS.length - 1
  const clearBtn = (onClick: () => void, testId: string) => (
    <button type="button" onClick={onClick} className="tap inline-flex items-center gap-1 rounded-(--radius-control) px-2 t-sub font-semibold text-ink-500 hover:text-danger-700" data-testid={testId}>
      <X aria-hidden="true" className="size-4" /> 지우기
    </button>
  )

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && !last) {
          e.preventDefault()
          next()
        }
      }}
      className="mx-auto max-w-[760px] pb-6 sm:pb-0"
    >
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <Link to={editing ? `/companies/${companyId}` : '/companies/new'} className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
            <ArrowLeft aria-hidden="true" className="size-4" /> {editing ? '미팅 전략으로' : '가져오기 방법'}
          </Link>
          <span className="tnum t-sub font-bold text-ink-700" data-testid="prep-progress">
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <ol className="mt-3 grid grid-cols-3 gap-1.5" aria-label="준비 단계">
          {STEPS.map((s, i) => (
            <li key={s.key} className="min-w-0">
              <div className={`h-1.5 rounded-full transition-colors duration-200 ${i <= step ? 'bg-accent-600' : 'bg-line'}`} aria-hidden="true" />
              <p className={`t-meta mt-1.5 truncate font-bold ${i === step ? 'text-ink-900' : i < step ? 'text-accent-700' : 'text-ink-300'}`}>
                {i < step ? <Check aria-hidden="true" className="mr-0.5 inline size-3.5" /> : null}
                {s.label}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <div key={cur.key} className="reveal">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="t-page">{cur.title}</h1>
            <p className="t-body mt-2 text-ink-500">{cur.sub}</p>
          </div>
          {!editing && step === 0 && speechSupported() && (
            <Button onClick={() => setVoiceOpen(true)} data-testid="voice-all" className="w-full sm:w-auto">
              <Mic aria-hidden="true" className="size-5" /> 음성으로 한 번에 입력
            </Button>
          )}
        </div>

        {step === 0 && (
          <div className="mt-6 space-y-5">
            <Field label="회사명">
              <div className="flex gap-2">
                <TextInput value={name} onChange={(e) => {
                  setName(e.target.value)
                  mark('name')
                }} placeholder="예: ABC산업" autoFocus required data-testid="company-name" className="text-[1.2rem]" />
                <VoiceButton label="회사명 말하기" onText={(t) => {
                  setName(t.replace(/\s/g, '').replace(/(주식회사|㈜)/g, ''))
                  mark('name', 'voice')
                }} testId="voice-name" />
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="대표자 이름" optional>
                <div className="flex gap-2">
                  <TextInput value={representativeName} onChange={(e) => {
                    setRep(e.target.value)
                    mark('representativeName')
                  }} autoComplete="off" data-testid="company-rep" />
                  <VoiceButton label="대표자 말하기" onText={(t) => {
                    const m = t.match(/([가-힣]{2,4})\s*(?:대표|사장|원장)?/)
                    setRep(m ? m[1] : t.trim())
                    mark('representativeName', 'voice')
                  }} testId="voice-rep" />
                </div>
                {representativeName && clearBtn(() => setRep(''), 'clear-rep')}
              </Field>
              <Field label="대표 연락처" optional hint="홈페이지 3분 AX Fit 을 한 대표라면 같은 번호로 사전진단이 연결됩니다.">
                {phoneMode === 'input' ? (
                  <div className="flex gap-2">
                    <TextInput value={phone} onChange={(e) => {
                      setPhone(e.target.value)
                      mark('phone')
                    }} inputMode="tel" placeholder="010-0000-0000" data-testid="company-phone" />
                    <VoiceButton label="연락처 말하기" onText={(t) => {
                      const p = normalizePhoneText(t)
                      if (p) {
                        setPhone(p)
                        mark('phone', 'voice')
                      } else toast.show('번호를 알아듣지 못했습니다. 다시 말하거나 직접 입력해 주세요.', 'danger')
                    }} testId="voice-phone" />
                  </div>
                ) : (
                  <p className="tap flex items-center rounded-(--radius-control) border border-dashed border-line-strong px-4 t-sub text-ink-500" data-testid="phone-skipped">
                    {phoneMode === 'later' ? '나중에 입력' : '연락처 모름'} — 미팅 준비는 그대로 진행됩니다
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(['input', 'later', 'unknown'] as PhoneMode[]).map((m) => (
                    <button key={m} type="button" onClick={() => {
                      setPhoneMode(m)
                      if (m !== 'input') setPhone('')
                    }} aria-pressed={phoneMode === m} data-testid={`phone-mode-${m}`} className={`tap rounded-full border px-3 t-meta font-bold ${phoneMode === m ? 'border-accent-600 bg-accent-50 text-ink-900' : 'border-line bg-white text-ink-500'}`}>
                      {m === 'input' ? '연락처 입력' : m === 'later' ? '나중에' : '모름'}
                    </button>
                  ))}
                  {phoneMode === 'input' && phone && clearBtn(() => setPhone(''), 'clear-phone')}
                </div>
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6 space-y-7">
            <div>
              <p className="t-section mb-2.5">업종</p>
              <ChoiceGrid columns={3} ariaLabel="업종" options={INDUSTRY_ORDER.map((v) => ({ value: v, label: INDUSTRY_LABEL[v] }))} value={industry} onChange={(v) => {
                setIndustry(v)
                mark('industry')
              }} />
              {industry === 'other' && (
                <div className="mt-3">
                  <TextInput value={industryNote} onChange={(e) => setIndustryNote(e.target.value)} placeholder="업종을 한 줄로 (선택)" aria-label="업종 메모" />
                </div>
              )}
            </div>
            <div>
              <p className="t-section mb-2.5">인원</p>
              <ChoiceGrid columns={3} ariaLabel="인원" options={HEADCOUNT_ORDER.map((v) => ({ value: v, label: HEADCOUNT_LABEL[v] }))} value={headcount} onChange={(v) => {
                setHeadcount(v)
                mark('headcount')
              }} />
            </div>
            <div>
              <p className="t-section mb-2.5">거래형태</p>
              <ChoiceGrid columns={2} ariaLabel="거래형태" options={TRADE_ORDER.map((v) => ({ value: v, label: TRADE_LABEL[v], hint: TRADE_HINT[v] }))} value={tradeType} onChange={(v) => {
                setTradeType(v)
                mark('tradeType')
              }} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-7">
            <div>
              <p className="t-section mb-2.5">대표님이 요즘 가장 신경 쓰는 것</p>
              <ChoiceGrid columns={2} multi ariaLabel="대표 관심사" options={INTEREST_PRIMARY.map((v) => ({ value: v, label: INTEREST_LABEL[v], hint: INTEREST_HINT[v] }))} value={interests} onChange={toggleInterest} />
              <details className="mt-3 group" data-testid="interest-more">
                <summary className="tap t-sub inline-flex cursor-pointer list-none items-center gap-1 font-semibold text-ink-500 hover:text-ink-900">
                  <span aria-hidden="true" className="transition-transform group-open:rotate-90">▸</span> 그 밖의 관심사 <span className="t-meta font-medium">선택</span>
                </summary>
                <div className="mt-2.5">
                  <ChoiceGrid columns={3} multi ariaLabel="그 밖의 관심사" options={INTEREST_EXTRA.map((v) => ({ value: v, label: INTEREST_LABEL[v], hint: INTEREST_HINT[v] }))} value={interests} onChange={toggleInterest} />
                  <p className="t-meta mt-2 text-ink-500">자금 관심은 기록만 해 둡니다. 미팅에서 먼저 꺼내지 않습니다.</p>
                </div>
              </details>
            </div>
            <div>
              <p className="t-section mb-2.5">미팅 일시</p>
              <MeetingTimePicker value={meetingTime} onChange={(v) => {
                setMeetingTime(v)
                mark('meetingAt')
              }} />
            </div>
            <Field label="메모" optional hint="소개 경로, 참고사항. 내부용입니다.">
              <TextArea value={memo} onChange={(e) => setMemo(e.target.value)} className="min-h-20" data-testid="company-memo" />
              {memo && clearBtn(() => setMemo(''), 'clear-memo')}
            </Field>
            <div className="rounded-(--radius-card) border border-line bg-white p-4 sm:p-5">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[9rem_1fr]">
                <dt className="t-sub font-bold text-ink-500">회사</dt>
                <dd className="text-[1.1rem] font-bold">{name}</dd>
                <dt className="t-sub font-bold text-ink-500">기본 구조</dt>
                <dd className="t-body">
                  {industry ? INDUSTRY_LABEL[industry] : '-'}
                  {industryNote ? ` · ${industryNote}` : ''} · {headcount ? HEADCOUNT_LABEL[headcount] : '-'} · {tradeType ? TRADE_LABEL[tradeType] : '-'}
                </dd>
                {(representativeName || (phoneMode === 'input' && phone)) && (
                  <>
                    <dt className="t-sub font-bold text-ink-500">대표</dt>
                    <dd className="t-body">
                      {representativeName}
                      {representativeName && phoneMode === 'input' && phone ? ' · ' : ''}
                      {phoneMode === 'input' ? phone : ''}
                    </dd>
                  </>
                )}
                <dt className="t-sub font-bold text-ink-500">미팅</dt>
                <dd className="t-body">{meetingTime.mode === 'now' ? '오늘 · 지금 (저장 시각)' : meetingTime.mode === 'custom' ? formatDate(meetingTime.iso, true) : '없음'}</dd>
              </dl>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-(--radius-control) bg-danger-50 px-4 py-3 t-body font-semibold text-danger-700">
          {error}
        </p>
      )}

      <Sheet open={Boolean(similar)} onClose={() => setSimilar(null)} title="비슷한 고객이 이미 있습니다" testId="dup-sheet">
        <p className="t-body text-ink-700">
          <b>{name}</b>{phone ? ` · ${phone}` : ''} 와(과) 비슷한 고객입니다. 같은 회사라면 기존 고객을 여세요.
        </p>
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-(--radius-control) border border-line">
          {(similar ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">
                  {c.name}
                  {c.archivedAt && <span className="ml-2 t-meta font-bold text-warn-700">휴지통</span>}
                </span>
                <span className="t-meta block text-ink-500">
                  {c.phone || '연락처 없음'} · 등록 {formatDate(c.createdAt)}
                  {c.meetingAt && ` · 미팅 ${formatDate(c.meetingAt)}`}
                </span>
              </span>
              <Link to={c.archivedAt ? '/companies/trash' : `/companies/${c.id}`} className="btn inline-flex h-10 items-center rounded-(--radius-control) border border-line-strong bg-white px-3 t-sub font-semibold hover:bg-paper-2" data-testid="open-existing">
                {c.archivedAt ? '휴지통 열기' : '기존 고객 열기'}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="primary"
            onClick={() => {
              setSimilar(null)
              setStep(1)
            }}
            data-testid="register-anyway"
          >
            그래도 새로 등록
          </Button>
        </div>
      </Sheet>

      <VoiceIntakeSheet open={voiceOpen} onClose={() => setVoiceOpen(false)} onApply={applyVoice} onUsed={() => void repo.track(user, 'voice_intake_used', null, { from: 'quick' })} />

      {/* 하단 고정 CTA — 한 손으로 */}
      <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-30 -mx-4 mt-6 border-t border-line bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:mt-8 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-3 sm:border-t sm:border-line sm:pt-5">
          <Button size="md" onClick={back} disabled={step === 0 || busy} data-testid="prep-back">
            <ArrowLeft aria-hidden="true" className="size-4" /> 이전
          </Button>
          {last ? (
            <Button key="save" type="submit" variant="primary" size="lg" disabled={busy} data-testid="company-save" className="flex-1 sm:flex-none">
              {busy ? '저장 중…' : editing ? '저장하고 전략 보기' : '미팅 전략 만들기'}
            </Button>
          ) : (
            <Button key="next" type="button" variant="primary" size="lg" onClick={next} data-testid="prep-next" className="flex-1 sm:flex-none">
              다음 <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
