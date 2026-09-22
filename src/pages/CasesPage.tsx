/**
 * 실제 사례 탐색 — 검색 + 업종 칩 + 자금유형 + 문제 구조 필터, [추천 | 전체] 탭, compact 카드.
 * 추천은 고객 컨텍스트(?company=)가 있으면 매칭 엔진, 없으면 검수 완료 · 10억 미만 · 신규 검증 우선.
 * needs_review(검수 필요)는 기본 추천에서 빠지고 전체 목록에서 배지로 보인다. 마스터는 편집한다.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { CaseStudy, Company, FundingType, Industry, QuestionArea } from '../types/domain'
import { Badge, Button, EmptyState, Field, PageTitle, Sheet, SkeletonList, TextArea, TextInput, useToast } from '../components/ui'
import { CaseRow } from '../components/CaseRow'
import { AREA_LABEL, FUNDING_TYPE_LABEL, INDUSTRY_LABEL, INDUSTRY_ORDER } from '../content/labels'
import { CASE_STATS, RESEARCH_SOURCE } from '../content/cases'
import { recommendCases } from '../engine/caseMatcher'
import { planQuestions } from '../engine/questionSelector'
import { newId, nowIso } from '../lib/util'

const STATUS_LABEL: Record<CaseStudy['verificationStatus'], string> = { verified: '검수 완료', needs_review: '검수 필요', draft: '초안(비공개)' }
const FUNDING_FILTER: (FundingType | 'all')[] = ['all', 'private_investment', 'guarantee', 'policy_loan', 'gov_rnd', 'commercialization', 'mixed']
const PROBLEM_FILTER: QuestionArea[] = ['repetitive_work', 'info_scatter', 'current_system', 'ceo_dependency', 'customer_mgmt', 'quote_order', 'repurchase', 'hiring_burden', 'data_potential', 'growth_plan']
const PAGE = 24

function CaseEditor({ initial, onSave, onCancel }: { initial: CaseStudy; onSave: (c: CaseStudy) => Promise<void>; onCancel: () => void }) {
  const [c, setC] = useState<CaseStudy>(initial)
  const [busy, setBusy] = useState(false)
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
  const select = 'w-full rounded-(--radius-control) border border-line-strong bg-white px-4 py-3 text-[1rem]'
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await onSave(c)
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="회사명(공개 표기)">
          <TextInput value={c.companyName} onChange={(e) => setC({ ...c, companyName: e.target.value })} required />
        </Field>
        <Field label="검수 상태" hint="검수 완료로 바꾸면 파트너 기본 추천에 들어갑니다.">
          <select value={c.verificationStatus} onChange={(e) => setC({ ...c, verificationStatus: e.target.value as CaseStudy['verificationStatus'], reviewRequired: e.target.value !== 'verified' })} className={select}>
            {(Object.keys(STATUS_LABEL) as CaseStudy['verificationStatus'][]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="업종">
          <select value={c.industry} onChange={(e) => setC({ ...c, industry: e.target.value as Industry })} className={select}>
            {INDUSTRY_ORDER.map((i) => (
              <option key={i} value={i}>
                {INDUSTRY_LABEL[i]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="자금유형">
          <select value={c.fundingType} onChange={(e) => setC({ ...c, fundingType: e.target.value as FundingType })} className={select}>
            {(Object.keys(FUNDING_TYPE_LABEL) as FundingType[]).map((f) => (
              <option key={f} value={f}>
                {FUNDING_TYPE_LABEL[f]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="출처">
          <TextInput value={c.source} onChange={(e) => setC({ ...c, source: e.target.value })} />
        </Field>
        <Field label="원문 링크">
          <TextInput value={c.sourceUrl ?? ''} onChange={(e) => setC({ ...c, sourceUrl: e.target.value })} inputMode="url" />
        </Field>
      </div>
      <Field label="문제가 무엇이었나">
        <TextArea value={c.problem} onChange={(e) => setC({ ...c, problem: e.target.value })} />
      </Field>
      <Field label="어떻게 바뀌었나">
        <TextArea value={c.axTransition} onChange={(e) => setC({ ...c, axTransition: e.target.value })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="설명 포인트 (줄바꿈으로 구분)">
          <TextArea value={c.talkingPoints.join('\n')} onChange={(e) => setC({ ...c, talkingPoints: lines(e.target.value) })} />
        </Field>
        <Field label="다른 점 / 주의사항 (줄바꿈)">
          <TextArea value={c.caveats.join('\n')} onChange={(e) => setC({ ...c, caveats: lines(e.target.value) })} />
        </Field>
        <Field label="실제 공개금액 (원, 비우면 비공개)">
          <TextInput inputMode="numeric" value={c.fundingAmountDisclosed ?? ''} onChange={(e) => setC({ ...c, fundingAmountDisclosed: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} />
        </Field>
        <Field label="제도상 최대한도 (원, 비우면 별도 확인)">
          <TextInput inputMode="numeric" value={c.fundingProgramMax ?? ''} onChange={(e) => setC({ ...c, fundingProgramMax: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} />
        </Field>
      </div>
      <Field label="자금 메모">
        <TextInput value={c.fundingNote} onChange={(e) => setC({ ...c, fundingNote: e.target.value })} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>취소</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? '저장 중…' : '저장'}
        </Button>
      </div>
    </form>
  )
}

function blankCase(): CaseStudy {
  return {
    id: `case_${newId().slice(0, 8)}`,
    companyName: '',
    industry: 'manufacturing',
    subIndustry: '',
    businessModel: 'b2b',
    problem: '',
    beforeProcess: '',
    axTransition: '',
    internalAx: '',
    customerPortal: '',
    aiFunction: '',
    validation: '',
    axPath: 'internal_ax',
    growthStage: 'stable',
    talkingPoints: [],
    caveats: [],
    fundingType: 'unknown',
    fundingAmountDisclosed: null,
    fundingProgramMax: null,
    fundingNote: '',
    year: String(new Date().getFullYear()),
    source: '',
    sourceDate: nowIso().slice(0, 10),
    verificationStatus: 'draft',
    keywords: [],
    problemAreas: [],
    updatedAt: nowIso(),
    reviewRequired: true,
  }
}

export default function CasesPage() {
  const { user, repo } = useSession()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [cases, setCases] = useState<CaseStudy[] | null>(null)
  const [context, setContext] = useState<Company | null>(null)
  const [tab, setTab] = useState<'recommended' | 'all'>(params.get('tab') === 'all' ? 'all' : 'recommended')
  const [industry, setIndustry] = useState<Industry | 'all'>('all')
  const [funding, setFunding] = useState<FundingType | 'all'>('all')
  const [problem, setProblem] = useState<QuestionArea | 'all'>('all')
  const [under10, setUnder10] = useState(false)
  const [q, setQ] = useState(params.get('q') ?? '')
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<CaseStudy | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const companyId = params.get('company')

  useEffect(() => {
    document.title = '실제 사례 · AX Partner OS'
    let alive = true
    void repo.listCases(user).then((cs) => alive && setCases(cs))
    if (companyId) void repo.getCompany(user, companyId).then((c) => alive && setContext(c))
    return () => {
      alive = false
    }
  }, [repo, user, companyId])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (cases ?? []).filter(
      (c) =>
        (industry === 'all' || c.industry === industry) &&
        (funding === 'all' || c.fundingType === funding) &&
        (problem === 'all' || c.problemAreas.includes(problem)) &&
        (!under10 || (c.fundingAmountDisclosed !== null && c.fundingAmountDisclosed < 1_000_000_000)) &&
        (!s || [c.companyName, c.companyAlias, c.subIndustry, c.researchSection, c.problem, c.axTransition, c.oneLiner, ...c.keywords].filter(Boolean).join(' ').toLowerCase().includes(s)),
    )
  }, [cases, industry, funding, problem, under10, q])

  const recommended = useMemo(() => {
    if (!cases) return []
    if (context) {
      const areas = planQuestions(context).all.slice(0, 4).map((x) => x.area)
      const fundingInterest = context.interests.some((i) => i === 'policy_fund' || i === 'gov_support' || i === 'rnd' || i === 'venture')
      const rec = recommendCases(filtered, context, areas, { areaLabel: (a) => AREA_LABEL[a], fundingInterest })
      return [rec.primary, rec.secondary, ...rec.others].filter((m): m is NonNullable<typeof m> => Boolean(m)).slice(0, 12)
    }
    return filtered
      .filter((c) => c.verificationStatus === 'verified' && !c.reviewRequired && c.fundingAmountDisclosed !== null && c.fundingAmountDisclosed < 1_000_000_000)
      .sort((a, b) => Number(b.newlyVerified ?? false) - Number(a.newlyVerified ?? false) || (a.fundingAmountDisclosed ?? 0) - (b.fundingAmountDisclosed ?? 0))
      .slice(0, 12)
      .map((c) => ({ caseStudy: c, reasons: [c.newlyVerified ? '이번 리서치 신규 검증' : '검수 완료', '10억 미만 실제 공개금액'] }))
  }, [cases, context, filtered])

  const save = async (c: CaseStudy) => {
    const saved = await repo.saveCase(user, c)
    setCases((cur) => (cur ? (cur.some((x) => x.id === saved.id) ? cur.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...cur]) : [saved]))
    setEditing(null)
    toast.show('사례를 저장했습니다.', 'ok')
  }
  const detailTo = (c: CaseStudy) => `/cases/${c.id}${companyId ? `?company=${companyId}` : ''}`
  const activeFilters = [industry !== 'all', funding !== 'all', problem !== 'all', under10].filter(Boolean).length
  const chip = (on: boolean) => `nav-item tap shrink-0 rounded-full px-3.5 py-2 text-[0.95rem] font-bold ${on ? 'bg-ink-900 text-white' : 'border border-line bg-white text-ink-700 hover:bg-paper-2'}`

  return (
    <div className="mx-auto max-w-[1360px] space-y-5">
      <PageTitle
        title="실제 사례"
        sub={`${RESEARCH_SOURCE.title} 기반 ${CASE_STATS.total}건 · 검수 완료 ${CASE_STATS.verified} · 10억 미만 ${CASE_STATS.under10}`}
        action={
          user.role === 'master' ? (
            <Button onClick={() => setEditing(blankCase())}>사례 추가 (초안)</Button>
          ) : undefined
        }
      />
      {context && (
        <div className="flex flex-wrap items-center gap-2 rounded-(--radius-control) bg-accent-50 px-4 py-2.5">
          <span className="t-sub font-semibold text-accent-800">
            {context.name} 미팅 기준으로 추천 중 · {INDUSTRY_LABEL[context.industry]}
          </span>
          <Link to={`/companies/${context.id}`} className="t-sub font-semibold text-ink-700 underline">
            미팅 전략으로
          </Link>
        </div>
      )}

      {/* 검색 + 필터 */}
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search aria-hidden="true" className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-300" />
          <TextInput
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setLimit(PAGE)
            }}
            placeholder="회사명 · 키워드로 찾기 (예: 견적, 재고, 예약, 폐기물)"
            aria-label="사례 검색"
            className="pl-12"
            data-testid="case-search"
          />
        </div>
        <Button size="md" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog" data-testid="case-filters">
          <SlidersHorizontal aria-hidden="true" className="size-4" /> 자금 · 문제 필터{activeFilters > 0 && ` (${activeFilters})`}
        </Button>
      </div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="업종">
        {(['all', ...INDUSTRY_ORDER] as const).map((i) => (
          <button
            key={i}
            type="button"
            aria-pressed={industry === i}
            onClick={() => {
              setIndustry(i)
              setLimit(PAGE)
            }}
            className={chip(industry === i)}
            data-testid={`industry-${i}`}
          >
            {i === 'all' ? '전체 업종' : INDUSTRY_LABEL[i]}
          </button>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex items-center justify-between gap-3 border-b border-line">
        <div role="tablist" className="flex gap-1">
          {(
            [
              ['recommended', context ? '이 미팅에 추천' : '추천'],
              ['all', '전체'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              onClick={() => {
                setTab(k)
                setParams((p) => {
                  p.set('tab', k)
                  return p
                })
              }}
              className={`nav-item tap -mb-px border-b-[3px] px-3 py-2 text-[1.05rem] font-bold ${tab === k ? 'border-accent-600 text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900'}`}
              data-testid={`cases-tab-${k}`}
            >
              {label}
              <span className="tnum ml-1.5 t-meta text-ink-500">{k === 'all' ? filtered.length : recommended.length}</span>
            </button>
          ))}
        </div>
        <p className="t-meta hidden text-ink-500 sm:block">검수 필요 사례는 추천에서 빠집니다</p>
      </div>

      {!cases ? (
        <SkeletonList rows={4} />
      ) : tab === 'recommended' ? (
        recommended.length === 0 ? (
          <EmptyState title="조건에 맞는 추천 사례가 없습니다" body="필터를 풀거나 전체 탭에서 직접 찾아보세요." action={<Button onClick={() => setTab('all')}>전체 보기</Button>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recommended.map((m, i) => (
              <div key={m.caseStudy.id} className="reveal" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                <CaseRow c={m.caseStudy} reason={m.reasons.slice(0, 2).join(' · ')} to={detailTo(m.caseStudy)} onOpen={() => void repo.track(user, 'case_opened', null, { caseId: m.caseStudy.id, from: 'cases' })} />
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState title="검색 결과가 없습니다" body="검색어를 바꾸거나 필터를 풀어 보세요." />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.slice(0, limit).map((c) => (
              <div key={c.id} className="relative">
                <CaseRow c={c} to={detailTo(c)} onOpen={() => void repo.track(user, 'case_opened', null, { caseId: c.id, from: 'cases' })} />
                {user.role === 'master' && (
                  <button type="button" onClick={() => setEditing(c)} className="nav-item absolute top-3 right-3 rounded-full bg-paper-2 px-2.5 py-1 t-meta font-bold text-ink-700 hover:bg-line">
                    편집
                  </button>
                )}
              </div>
            ))}
          </div>
          {filtered.length > limit && (
            <div className="flex justify-center">
              <Button size="lg" onClick={() => setLimit((l) => l + PAGE)}>
                더 보기 ({filtered.length - limit}건 남음)
              </Button>
            </div>
          )}
        </>
      )}

      {/* 필터 시트 */}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="자금 · 문제 필터" testId="sheet-filters">
        <div className="space-y-5">
          <div>
            <p className="t-sub mb-2 font-bold text-ink-700">자금유형</p>
            <div className="flex flex-wrap gap-1.5">
              {FUNDING_FILTER.map((f) => (
                <button key={f} type="button" aria-pressed={funding === f} onClick={() => setFunding(f)} className={chip(funding === f)}>
                  {f === 'all' ? '전체' : FUNDING_TYPE_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="t-sub mb-2 font-bold text-ink-700">문제 구조</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={problem === 'all'} onClick={() => setProblem('all')} className={chip(problem === 'all')}>
                전체
              </button>
              {PROBLEM_FILTER.map((a) => (
                <button key={a} type="button" aria-pressed={problem === a} onClick={() => setProblem(a)} className={chip(problem === a)}>
                  {AREA_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3">
            <input type="checkbox" checked={under10} onChange={(e) => setUnder10(e.target.checked)} className="size-5 accent-accent-600" />
            <span className="t-body font-semibold">실제 공개금액 10억 미만만</span>
          </label>
          <div className="flex justify-between gap-2 border-t border-line pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setFunding('all')
                setProblem('all')
                setUnder10(false)
              }}
            >
              초기화
            </Button>
            <Button variant="primary" onClick={() => setFiltersOpen(false)}>
              적용 ({filtered.length}건)
            </Button>
          </div>
        </div>
      </Sheet>

      {/* 마스터 편집 */}
      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title="사례 편집 (마스터)" wide>
        {editing && <CaseEditor key={editing.id} initial={editing} onSave={save} onCancel={() => setEditing(null)} />}
      </Sheet>
      {user.role !== 'master' && cases && cases.some((c) => c.reviewRequired) && (
        <p className="t-meta text-ink-500">
          <Badge tone="warn">검수 필요</Badge> 표시는 리서치 파싱이 애매하거나 실제 수령액이 미공개인 사례입니다. 미팅에서 숫자로 쓰지 마세요.
        </p>
      )}
    </div>
  )
}
