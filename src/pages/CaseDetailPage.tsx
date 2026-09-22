/**
 * 사례 상세 — PROBLEM → TRANSFORMATION → DATA → PROOF → FUNDING 흐름.
 * 고객 컨텍스트(?company=)가 있으면 "왜 비슷한가 / 다른 점" 을 자연어 태그로 보여 주고, [이 사례를 미팅에 사용] 으로 고정한다.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Pin, PinOff } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { CaseStudy, Company } from '../types/domain'
import { AccentStrip, Badge, Button, Disclosure, FlatSection, SkeletonList, useToast } from '../components/ui'
import { AREA_LABEL, FUNDING_TYPE_LABEL, INDUSTRY_LABEL } from '../content/labels'
import { AX_GRADE_LABEL, CASE_DISCLAIMER, TRANSITION_PATH, caseSimilarityTags, formatEok } from '../content/caseText'
import { scoreCase } from '../engine/caseMatcher'
import { planQuestions } from '../engine/questionSelector'

const STEPS = [
  { key: 'problem', label: 'PROBLEM', ko: '문제' },
  { key: 'transformation', label: 'TRANSFORMATION', ko: '전환' },
  { key: 'data', label: 'DATA', ko: '데이터·AI' },
  { key: 'proof', label: 'PROOF', ko: '실증' },
  { key: 'funding', label: 'FUNDING', ko: '자금' },
] as const

export default function CaseDetailPage() {
  const { user, repo } = useSession()
  const { caseId } = useParams()
  const [params] = useSearchParams()
  const toast = useToast()
  const companyId = params.get('company')
  const [c, setC] = useState<CaseStudy | null | undefined>(undefined)
  const [company, setCompany] = useState<Company | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void repo.listCases(user).then((cs) => {
      if (!alive) return
      const found = cs.find((x) => x.id === caseId) ?? null
      setC(found)
      if (found) {
        document.title = `${found.companyName} · 실제 사례 · AX Partner OS`
        void repo.track(user, 'case_opened', null, { caseId: found.id, from: 'detail' })
      }
    })
    if (companyId) void repo.getCompany(user, companyId).then((co) => alive && setCompany(co))
    return () => {
      alive = false
    }
  }, [repo, user, caseId, companyId])

  const match = useMemo(() => {
    if (!c || !company) return null
    const areas = planQuestions(company).all.slice(0, 4).map((x) => x.area)
    const fundingInterest = company.interests.some((i) => i === 'policy_fund' || i === 'gov_support' || i === 'rnd' || i === 'venture')
    return scoreCase(c, company, areas, { areaLabel: (a) => AREA_LABEL[a], fundingInterest })
  }, [c, company])

  if (c === undefined) return <SkeletonList rows={3} />
  if (!c) return <p className="t-body text-ink-500">사례를 찾을 수 없습니다.</p>

  const pinned = Boolean(company?.pinnedCaseIds?.includes(c.id))
  async function togglePin() {
    if (!company || !c || busy) return
    setBusy(true)
    try {
      const ids = company.pinnedCaseIds ?? []
      const next = pinned ? ids.filter((x) => x !== c.id) : [...ids, c.id].slice(-3)
      const saved = await repo.updateCompany(user, { ...company, pinnedCaseIds: next })
      setCompany(saved)
      toast.show(pinned ? '미팅 사례에서 뺐습니다.' : `${company.name} 미팅에 이 사례를 넣었습니다.`, 'ok')
      void repo.track(user, 'case_opened', null, { caseId: c.id, from: pinned ? 'unpin' : 'pin' })
    } finally {
      setBusy(false)
    }
  }

  const amount = c.fundingAmountDisclosed !== null && c.fundingAmountDisclosed !== undefined ? formatEok(c.fundingAmountDisclosed) : null
  const limit = c.fundingProgramMax !== null && c.fundingProgramMax !== undefined ? formatEok(c.fundingProgramMax) : null
  const dataBits = [c.internalAx && `데이터: ${c.internalAx}`, c.aiFunction && `AI·자동화: ${c.aiFunction}`, c.customerPortal && `고객 접점: ${c.customerPortal}`].filter(Boolean) as string[]
  const flow: Record<(typeof STEPS)[number]['key'], string[]> = {
    problem: [c.problem, c.beforeProcess].filter(Boolean),
    transformation: [c.axTransition].filter(Boolean),
    data: dataBits,
    proof: [c.validation].filter(Boolean),
    funding: [
      `${FUNDING_TYPE_LABEL[c.fundingType]}${c.fundingForm ? ` (${c.fundingForm})` : ''}`,
      amount ? `실제 공개금액 ${amount}${c.year ? ` · ${c.year}` : ''}` : limit ? `제도상 한도 ${limit} (실제 수령액 미공개)` : '금액 미공개',
      c.fundingLink ?? '',
    ].filter(Boolean),
  }
  const tags = caseSimilarityTags(c, (a) => AREA_LABEL[a])
  const path = c.researchCategory ? TRANSITION_PATH[c.researchCategory] : undefined

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/cases${companyId ? `?company=${companyId}` : ''}`} className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
          <ArrowLeft aria-hidden="true" className="size-4" /> 사례 목록
        </Link>
        {c.sourceUrl && (
          <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener" className="t-sub inline-flex items-center gap-1 font-semibold text-accent-700 hover:underline">
            원문 보기 <ExternalLink aria-hidden="true" className="size-4" />
          </a>
        )}
      </div>

      <header className="reveal">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{INDUSTRY_LABEL[c.industry]}</Badge>
          {c.subIndustry && <Badge>{c.subIndustry}</Badge>}
          {c.axGrade && <Badge tone="info">{AX_GRADE_LABEL[c.axGrade]}</Badge>}
          {c.newlyVerified && <Badge tone="info">신규 검증</Badge>}
          <Badge tone={c.verificationStatus === 'verified' ? 'ok' : 'warn'}>{c.verificationStatus === 'verified' ? '검수 완료' : '검수 필요'}</Badge>
        </div>
        <h1 className="t-page mt-3" data-testid="case-title">
          {c.companyName}
          {c.companyAlias && <span className="ml-2 text-[1.1rem] font-semibold text-ink-500">({c.companyAlias})</span>}
        </h1>
        {c.oneLiner && <p className="t-body mt-2 text-ink-700">{c.oneLiner}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {company ? (
            <Button variant={pinned ? 'dark' : 'primary'} size="lg" onClick={() => void togglePin()} disabled={busy} data-testid="use-case">
              {pinned ? <PinOff aria-hidden="true" className="size-5" /> : <Pin aria-hidden="true" className="size-5" />}
              {pinned ? '미팅에서 빼기' : '이 사례를 미팅에 사용'}
            </Button>
          ) : (
            <Link to="/companies">
              <Button variant="primary" size="lg">
                <Pin aria-hidden="true" className="size-5" /> 이 사례를 미팅에 사용
              </Button>
            </Link>
          )}
          {company && (
            <span className="t-sub text-ink-500">
              {company.name} 미팅 전략에 표시됩니다{pinned && ' · 사용 중'} ·{' '}
              <Link to={`/companies/${company.id}`} className="font-semibold text-accent-700 underline">
                미팅 전략으로
              </Link>
            </span>
          )}
        </div>
      </header>

      {/* 흐름 */}
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="사례 흐름">
        {STEPS.map((s, i) => {
          const items = flow[s.key]
          return (
            <li key={s.key} className="reveal relative flex min-h-[9rem] flex-col rounded-(--radius-card) border border-line bg-white p-4" style={{ animationDelay: `${i * 50}ms` }} data-testid={`flow-${s.key}`}>
              <p className="text-[0.78rem] font-black tracking-[0.06em] text-accent-700">
                {i + 1}. {s.label}
              </p>
              <p className="t-sub font-bold text-ink-500">{s.ko}</p>
              {items.length === 0 ? (
                <p className="t-sub mt-2 text-ink-300">확인된 내용 없음</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {items.map((t) => (
                    <li key={t} className="t-sub leading-snug text-ink-900">
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className="absolute top-1/2 -right-3 hidden -translate-y-1/2 text-ink-300 xl:block">
                  →
                </span>
              )}
            </li>
          )
        })}
      </ol>

      <div className="grid gap-6 lg:grid-cols-2">
        <FlatSection title={company ? `왜 ${company.name}과 비슷한가` : '이런 고객에게 맞습니다'}>
          <div className="rounded-(--radius-card) border border-line bg-white p-4 sm:p-5">
            <div className="flex flex-wrap gap-1.5" data-testid="reason-tags">
              {(match ? match.reasons : tags).map((t) => (
                <Badge key={t} tone="accent">
                  {t}
                </Badge>
              ))}
              {match && match.reasons.length === 0 && <span className="t-sub text-ink-500">겹치는 조건이 적습니다. 방향만 참고하세요.</span>}
            </div>
            {match && match.differences.length > 0 && (
              <div className="mt-4">
                <p className="t-meta font-black tracking-wide text-ink-500">다른 점</p>
                <ul className="t-sub mt-1 list-disc space-y-0.5 pl-5 text-ink-700">
                  {match.differences.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {!match && (
              <p className="t-meta mt-3 text-ink-500">미팅 전략 화면에서 열면 그 고객 기준으로 "왜 비슷한가 / 다른 점" 이 계산됩니다.</p>
            )}
          </div>
        </FlatSection>
        <FlatSection title="영업에서 이렇게 설명">
          <ol className="space-y-2 rounded-(--radius-card) border border-line bg-white p-4 sm:p-5">
            {c.talkingPoints.map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="tnum t-sub shrink-0 font-black text-accent-700">{i + 1}</span>
                <span className="t-body">{t}</span>
              </li>
            ))}
          </ol>
        </FlatSection>
      </div>

      <AccentStrip label="주의" tone="warn">
        <ul className="space-y-1">
          {c.caveats.map((t) => (
            <li key={t}>{t}</li>
          ))}
          <li>{CASE_DISCLAIMER}</li>
        </ul>
      </AccentStrip>

      {path && (
        <FlatSection title="이 업종의 AX/SW 전환 경로" sub="리서치 인덱스의 업종별 흐름 — 우리 고객이 지금 어디쯤인지 짚을 때 씁니다">
          <p className="rounded-(--radius-card) border border-line bg-white px-4 py-3 t-body font-semibold text-ink-900">{path}</p>
        </FlatSection>
      )}

      <div className="space-y-3">
        {(c.narrative || (c.policyNarratives && c.policyNarratives.length > 0)) && (
          <Disclosure label="자세히 보기 (리서치 원문 서술)">
            <div className="space-y-3">
              {c.narrative && <p>{c.narrative}</p>}
              {c.policyNarratives?.map((n) => (
                <p key={n} className="border-l-2 border-line pl-3 text-ink-700">
                  {n}
                </p>
              ))}
              <p className="t-meta text-ink-500">
                출처: {c.source}
                {c.sourceUrl && (
                  <>
                    {' '}
                    ·{' '}
                    <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener" className="underline">
                      원문 링크
                    </a>
                  </>
                )}{' '}
                · 리서치 p.{c.researchPage}
                {c.amountRaw && ` · 금액 원문 "${c.amountRaw}"`}
              </p>
            </div>
          </Disclosure>
        )}
        {c.reviewReasons && c.reviewReasons.length > 0 && (
          <p className="t-meta text-warn-700">검수 필요 사유: {c.reviewReasons.join(' · ')}</p>
        )}
      </div>
    </div>
  )
}
