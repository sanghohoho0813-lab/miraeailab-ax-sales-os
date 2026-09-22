/**
 * BEFORE — 업체 등록. 입력은 회사명 하나, 나머지는 전부 클릭. 아는 정보가 없으면 '잘 모르겠음'.
 * 저장 시 홈페이지 3분 AX Fit 사전진단(회사명 + 연락처 일치)을 찾아 붙인다.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useSession } from '../lib/auth'
import type { Company, Headcount, Industry, Interest, TradeType } from '../types/domain'
import { Button, ChoiceGrid, Field, PageTitle, Section, TextArea, TextInput, useToast, Spinner } from '../components/ui'
import { HEADCOUNT_LABEL, HEADCOUNT_ORDER, INDUSTRY_LABEL, INDUSTRY_ORDER, INTEREST_LABEL, INTEREST_ORDER, TRADE_LABEL, TRADE_ORDER } from '../content/labels'
import { isoToLocalInput, localInputToIso } from '../lib/util'

export default function CompanyNewPage() {
  const { user, repo } = useSession()
  const { companyId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const editing = Boolean(companyId)
  const [existing, setExisting] = useState<Company | null>(null)
  const [loaded, setLoaded] = useState(!editing)

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

  useEffect(() => {
    document.title = `${editing ? '업체 수정' : '신규 업체 등록'} · AX 미팅 가이드`
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

  const toggleInterest = (v: Interest) => {
    setInterests((cur) => {
      if (v === 'unknown') return cur.includes('unknown') ? [] : ['unknown']
      const next = cur.filter((x) => x !== 'unknown')
      return next.includes(v) ? next.filter((x) => x !== v) : [...next, v]
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) return setError('회사명을 입력해 주세요.')
    if (!industry) return setError('업종을 골라 주세요. 모르면 "기타" 를 고르세요.')
    if (!headcount) return setError('인원을 골라 주세요. 모르면 "잘 모르겠음" 을 고르세요.')
    if (!tradeType) return setError('거래형태를 골라 주세요. 모르면 "잘 모르겠음" 을 고르세요.')
    setError('')
    setBusy(true)
    try {
      const input = {
        name,
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
      // 홈페이지 사전진단 연동 — 회사명(+연락처) 일치 시 같은 질문을 다시 하지 않도록 붙인다
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

  if (!loaded) return <Spinner />

  return (
    <form onSubmit={submit} className="space-y-5">
      <PageTitle title={editing ? '업체 정보 수정' : '신규 업체 등록'} sub="아는 정보가 없으면 '잘 모르겠음' 을 고르세요. 억지로 추측하지 않아도 됩니다." back={<Link to={editing ? `/companies/${companyId}` : '/'} className="t-sub text-ink-500 hover:underline">← 돌아가기</Link>} />

      <Section title="회사명">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="예: ABC산업" autoFocus required data-testid="company-name" />
      </Section>

      <Section title="업종">
        <ChoiceGrid columns={3} ariaLabel="업종" options={INDUSTRY_ORDER.map((v) => ({ value: v, label: INDUSTRY_LABEL[v] }))} value={industry} onChange={setIndustry} />
        {industry === 'other' && (
          <div className="mt-3">
            <TextInput value={industryNote} onChange={(e) => setIndustryNote(e.target.value)} placeholder="업종을 한 줄로 (선택)" aria-label="업종 메모" />
          </div>
        )}
      </Section>

      <Section title="인원">
        <ChoiceGrid columns={3} ariaLabel="인원" options={HEADCOUNT_ORDER.map((v) => ({ value: v, label: HEADCOUNT_LABEL[v] }))} value={headcount} onChange={setHeadcount} />
      </Section>

      <Section title="거래형태">
        <ChoiceGrid columns={2} ariaLabel="거래형태" options={TRADE_ORDER.map((v) => ({ value: v, label: TRADE_LABEL[v] }))} value={tradeType} onChange={setTradeType} />
      </Section>

      <Section title="현재 대표 관심사" sub="여러 개 고를 수 있습니다.">
        <ChoiceGrid columns={3} multi ariaLabel="대표 관심사" options={INTEREST_ORDER.map((v) => ({ value: v, label: INTEREST_LABEL[v] }))} value={interests} onChange={toggleInterest} />
      </Section>

      <Section title="선택 정보" sub="사전진단 연동(회사명 + 연락처)과 미팅 일정에만 씁니다.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="대표자 이름" optional>
            <TextInput value={representativeName} onChange={(e) => setRep(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="대표 연락처" optional hint="홈페이지 3분 AX Fit 을 한 대표라면 같은 번호로 사전진단이 연결됩니다.">
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="010-0000-0000" data-testid="company-phone" />
          </Field>
          <Field label="미팅 일시" optional>
            <TextInput type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} />
          </Field>
          <Field label="메모" optional>
            <TextArea value={memo} onChange={(e) => setMemo(e.target.value)} className="min-h-14" placeholder="소개 경로, 참고사항" />
          </Field>
        </div>
      </Section>

      {error && (
        <p role="alert" className="rounded-(--radius-control) bg-danger-50 px-4 py-3 t-body font-semibold text-danger-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit" variant="primary" size="lg" disabled={busy} data-testid="company-save">
          {busy ? '저장 중…' : editing ? '저장' : '등록하고 브리핑 보기'}
        </Button>
      </div>
    </form>
  )
}
