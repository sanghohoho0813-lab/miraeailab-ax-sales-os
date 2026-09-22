/**
 * BEFORE — 미팅 준비 4단계: 회사 → 기본구조 → 관심사 → 준비완료. 입력은 회사명 하나, 나머지는 클릭.
 * 저장 시 홈페이지 3분 AX Fit 사전진단(회사명 + 연락처 일치)을 찾아 붙이고, 바로 미팅 전략 화면으로 간다.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, Headcount, Industry, Interest, TradeType } from '../types/domain'
import { Button, ChoiceGrid, Field, Sheet, TextArea, TextInput, useToast, SkeletonList } from '../components/ui'
import { HEADCOUNT_LABEL, HEADCOUNT_ORDER, INDUSTRY_LABEL, INDUSTRY_ORDER, INTEREST_LABEL, INTEREST_ORDER, TRADE_LABEL, TRADE_ORDER } from '../content/labels'
import { formatDate, isoToLocalInput, localInputToIso } from '../lib/util'

const STEPS = [
  { key: 'company', label: '회사', title: '어느 회사를 만나시나요?', sub: '회사명만 정확하면 됩니다. 연락처는 홈페이지 3분 AX Fit 사전진단을 찾는 데만 씁니다.' },
  { key: 'structure', label: '기본 구조', title: '회사의 기본 구조를 골라 주세요', sub: '모르면 "잘 모르겠음". 미팅에서 확인하면 됩니다.' },
  { key: 'interest', label: '관심사', title: '대표님이 지금 관심 있는 것은?', sub: '여러 개 골라도 됩니다. 정책자금 관심은 여기서만 표시하고, 미팅에서 먼저 꺼내지 않습니다.' },
  { key: 'ready', label: '준비 완료', title: '이대로 미팅 전략을 만들까요?', sub: '저장하면 오늘 공략 포인트 · 추천 사례 · 질문이 바로 만들어집니다.' },
] as const

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
  const [meetingAt, setMeetingAt] = useState('')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [similar, setSimilar] = useState<Company[] | null>(null)
  const [dupChecked, setDupChecked] = useState('')

  useEffect(() => {
    document.title = `${editing ? '고객 정보 수정' : '미팅 준비'} · AX Partner OS`
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
      setMeetingAt(isoToLocalInput(c.meetingAt))
      setMemo(c.memo)
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
    // 1단계 → 2단계: 비슷한 고객이 이미 있으면 먼저 알려 준다 (막지는 않는다)
    const key = `${name.trim()}|${phone.trim()}`
    if (step === 0 && !editing && dupChecked !== key) {
      void repo.findSimilarCompanies(user, name, phone).then((list) => {
        setDupChecked(key)
        if (list.length > 0) setSimilar(list)
        else setStep(1)
      })
      return
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }
  function back() {
    setError('')
    setStep((s) => Math.max(0, s - 1))
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    if (step < STEPS.length - 1) return next()
    if (!industry || !headcount || !tradeType) return setStep(1)
    setError('')
    setBusy(true)
    try {
      const input = {
        name: name.trim(),
        industry,
        industryNote,
        headcount,
        tradeType,
        interests: interests.length ? interests : (['unknown'] as Interest[]),
        representativeName,
        phone,
        meetingAt: localInputToIso(meetingAt),
        memo,
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
            company = await repo.updateCompany(user, { ...company, diagnosis: diag })
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

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && !last) {
          e.preventDefault()
          next()
        }
      }}
      className="mx-auto max-w-[760px]"
    >
      {/* 진행 */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <Link to={editing ? `/companies/${companyId}` : '/'} className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
            <ArrowLeft aria-hidden="true" className="size-4" /> {editing ? '미팅 전략으로' : '홈으로'}
          </Link>
          <span className="tnum t-sub font-bold text-ink-700" data-testid="prep-progress">
            {step + 1} / {STEPS.length}
          </span>
        </div>
        <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="준비 단계">
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
        <h1 className="t-page">{cur.title}</h1>
        <p className="t-body mt-2 text-ink-500">{cur.sub}</p>

        {step === 0 && (
          <div className="mt-6 space-y-5">
            <Field label="회사명">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="예: ABC산업" autoFocus required data-testid="company-name" className="text-[1.2rem]" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="대표자 이름" optional>
                <TextInput value={representativeName} onChange={(e) => setRep(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="대표 연락처" optional hint="홈페이지 3분 AX Fit 을 한 대표라면 같은 번호로 사전진단이 연결됩니다.">
                <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="010-0000-0000" data-testid="company-phone" />
              </Field>
              <Field label="미팅 일시" optional hint="넣으면 홈 · 미팅 목록에 오늘/예정으로 올라옵니다.">
                <TextInput type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} data-testid="company-meeting-at" />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="mt-6 space-y-7">
            <div>
              <p className="t-section mb-2.5">업종</p>
              <ChoiceGrid columns={3} ariaLabel="업종" options={INDUSTRY_ORDER.map((v) => ({ value: v, label: INDUSTRY_LABEL[v] }))} value={industry} onChange={setIndustry} />
              {industry === 'other' && (
                <div className="mt-3">
                  <TextInput value={industryNote} onChange={(e) => setIndustryNote(e.target.value)} placeholder="업종을 한 줄로 (선택)" aria-label="업종 메모" />
                </div>
              )}
            </div>
            <div>
              <p className="t-section mb-2.5">인원</p>
              <ChoiceGrid columns={3} ariaLabel="인원" options={HEADCOUNT_ORDER.map((v) => ({ value: v, label: HEADCOUNT_LABEL[v] }))} value={headcount} onChange={setHeadcount} />
            </div>
            <div>
              <p className="t-section mb-2.5">거래형태</p>
              <ChoiceGrid columns={2} ariaLabel="거래형태" options={TRADE_ORDER.map((v) => ({ value: v, label: TRADE_LABEL[v] }))} value={tradeType} onChange={setTradeType} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="mt-6 space-y-6">
            <ChoiceGrid columns={3} multi ariaLabel="대표 관심사" options={INTEREST_ORDER.map((v) => ({ value: v, label: INTEREST_LABEL[v] }))} value={interests} onChange={toggleInterest} />
            <Field label="메모" optional hint="소개 경로, 참고사항. 내부용입니다.">
              <TextArea value={memo} onChange={(e) => setMemo(e.target.value)} className="min-h-20" />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="mt-6 rounded-(--radius-card) border border-line bg-white p-5 sm:p-6">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[9rem_1fr]">
              <dt className="t-sub font-bold text-ink-500">회사</dt>
              <dd className="text-[1.15rem] font-bold">{name}</dd>
              <dt className="t-sub font-bold text-ink-500">기본 구조</dt>
              <dd className="t-body">
                {industry ? INDUSTRY_LABEL[industry] : '-'}
                {industryNote ? ` · ${industryNote}` : ''} · {headcount ? HEADCOUNT_LABEL[headcount] : '-'} · {tradeType ? TRADE_LABEL[tradeType] : '-'}
              </dd>
              <dt className="t-sub font-bold text-ink-500">관심사</dt>
              <dd className="t-body">{(interests.length ? interests : ['unknown']).map((i) => INTEREST_LABEL[i as Interest]).join(' · ')}</dd>
              {(representativeName || phone) && (
                <>
                  <dt className="t-sub font-bold text-ink-500">대표</dt>
                  <dd className="t-body">
                    {representativeName}
                    {representativeName && phone ? ' · ' : ''}
                    {phone}
                  </dd>
                </>
              )}
              {meetingAt && (
                <>
                  <dt className="t-sub font-bold text-ink-500">미팅 일시</dt>
                  <dd className="t-body">{meetingAt.replace('T', ' ')}</dd>
                </>
              )}
            </dl>
            <p className="t-sub mt-4 text-ink-500">틀린 곳이 있으면 이전으로 돌아가 고치면 됩니다. 저장 후에도 수정할 수 있습니다.</p>
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

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Button size="md" onClick={back} disabled={step === 0 || busy} data-testid="prep-back">
          <ArrowLeft aria-hidden="true" className="size-4" /> 이전
        </Button>
        {last ? (
          <Button key="save" type="submit" variant="primary" size="lg" disabled={busy} data-testid="company-save">
            {busy ? '저장 중…' : editing ? '저장하고 전략 보기' : '미팅 전략 만들기'}
          </Button>
        ) : (
          <Button key="next" type="button" variant="primary" size="lg" onClick={next} data-testid="prep-next">
            다음 <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>
    </form>
  )
}
