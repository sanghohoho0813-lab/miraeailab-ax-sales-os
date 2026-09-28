/**
 * 고객 도구 — 기업정보 분석 · 고용지원금 검토 · 정책자금 유력 기관.
 *
 * 화면의 순서가 곧 원칙이다.
 *   1) 서류가 먼저 보인다. 없는 서류는 눈에 띄게, 그 자리에서 올릴 수 있게.
 *   2) 도구는 서류가 없다고 막지 않는다. "무엇이 없어서 무엇을 못 하는지" 를 말한다(R6 검증 계약).
 *   3) 결과에는 한계를 같이 적는다. 금액·요건을 지어내지 않는다.
 *
 * 미팅 전략 화면(CompanyPage)과 분리한 이유: 그 화면은 "미팅 직전 30초" 용이다.
 * 기업분석은 미팅 전후에 따로 하는 일이라 섞으면 준비 화면이 다시 길어진다.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Upload, FileText, Check, AlertTriangle, Landmark, Users, ChevronRight } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { CaseStudy, Company, CompanyProfile } from '../types/domain'
import { Badge, Button, EmptyState, FlatSection, PageTitle, SkeletonList } from '../components/ui'
import { latestProfile } from '../engine/profile'
import { documentStatus, missingRequired, toolStatus, type DocStatus } from '../engine/documents'
import { reviewEmployment } from '../engine/employment'
import { recommendInstitutions } from '../engine/policyFund'
import { AMOUNT_BAND_LABEL, planFunding, type FundingPick } from '../engine/fundingMatch'
import { AMOUNT_KIND_LABEL, AMOUNT_KIND_NOTE, FUNDING_FORM_LABEL } from '../content/fundingCases'
import { formatDate } from '../lib/util'
import { TOOL_SPECS } from '../content/documents'

const TOOL_ICON = { company_report: FileText, employment_subsidy: Users, policy_fund: Landmark }

export default function CompanyToolsPage() {
  const { user, repo } = useSession()
  const { companyId } = useParams()
  const navigate = useNavigate()
  const [company, setCompany] = useState<Company | null>(null)
  const [profiles, setProfiles] = useState<CompanyProfile[] | null>(null)
  const [cases, setCases] = useState<CaseStudy[]>([])

  useEffect(() => {
    document.title = '기업분석 도구 · AX Partner OS'
    if (!companyId) return
    let alive = true
    void Promise.all([repo.getCompany(user, companyId), repo.listProfiles(user, companyId), repo.listCases(user)]).then(([c, p, cs]) => {
      if (!alive) return
      setCompany(c)
      setProfiles(p)
      setCases(cs)
    })
    return () => {
      alive = false
    }
  }, [companyId, repo, user])

  const docs = useMemo(() => documentStatus(profiles ?? []), [profiles])
  const tools = useMemo(() => toolStatus(docs), [docs])
  const missing = useMemo(() => missingRequired(docs), [docs])
  const profile = useMemo(() => latestProfile(profiles ?? []), [profiles])
  const employment = useMemo(() => (company ? reviewEmployment(company, profile) : null), [company, profile])
  const fund = useMemo(() => (company ? recommendInstitutions(cases, company, { yearsInBusiness: profile?.facts.yearsInBusiness ?? null }) : null), [cases, company, profile])
  const plan = useMemo(
    () => (company ? planFunding(cases, company, { subIndustry: profile?.facts.subIndustry, products: profile?.facts.products, yearsInBusiness: profile?.facts.yearsInBusiness ?? null }) : null),
    [cases, company, profile],
  )

  if (!profiles || !company) return <SkeletonList rows={4} />

  const upload = () => navigate(`/companies/${company.id}/pdf`)

  return (
    <div className="mx-auto max-w-[900px] space-y-8 pb-8">
      <PageTitle
        title="기업분석 도구"
        sub={`${company.name} — 서류를 올리면 분석이 붙습니다. 원본 파일은 저장하지 않습니다.`}
        back={
          <Link to={`/companies/${company.id}`} className="t-sub mb-1 inline-flex items-center gap-1 text-ink-500 hover:text-ink-900">
            <ArrowLeft aria-hidden="true" className="size-4" /> 미팅 전략으로
          </Link>
        }
      />

      {/* 1) 서류 — 없는 것이 먼저 보인다 */}
      <FlatSection title="서류" sub="분석에 쓰는 서류입니다. 브라우저에서 읽고 원본은 저장하지 않습니다">
        {missing.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-(--radius-card) border-2 border-warn-600/40 bg-warn-50 px-4 py-3" data-testid="missing-banner">
            <AlertTriangle aria-hidden="true" className="size-6 shrink-0 text-warn-700" />
            <p className="t-body min-w-0 flex-1 font-bold text-warn-700">
              아직 올라오지 않은 서류 {missing.length}건 — {missing.map((d) => d.label.split(' (')[0]).join(' · ')}
            </p>
            <Button variant="primary" onClick={upload} data-testid="upload-from-banner">
              <Upload aria-hidden="true" className="size-4" /> 서류 올리기
            </Button>
          </div>
        )}
        <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
          {docs.map((d) => (
            <DocRow key={d.key} doc={d} onUpload={upload} />
          ))}
        </ul>
      </FlatSection>

      {/* 2) 도구 */}
      <FlatSection title="도구" sub="서류가 없어도 눌러 볼 수 있습니다. 무엇이 없어서 무엇을 못 하는지 알려 드립니다">
        <div className="grid gap-3 md:grid-cols-3">
          {tools.map((t) => {
            const Icon = TOOL_ICON[t.spec.id]
            return (
              <a
                key={t.spec.id}
                href={`#tool-${t.spec.id}`}
                className="lift flex flex-col rounded-(--radius-card) border border-line bg-white p-4 hover:border-accent-200"
                data-testid="tool-card"
                data-tool={t.spec.id}
                data-ready={t.ready}
              >
                <span className="flex items-center gap-2">
                  <Icon aria-hidden="true" className="size-5 text-accent-600" />
                  <span className="text-[1.05rem] font-bold">{t.spec.label}</span>
                </span>
                <span className="t-sub mt-2 flex-1 text-ink-500">{t.spec.does}</span>
                <span className="mt-3">
                  {t.ready ? <Badge tone="ok">바로 가능</Badge> : <Badge tone="warn">{t.missing.map((d) => d.label.split(' (')[0]).join(' · ')} 필요</Badge>}
                </span>
              </a>
            )
          })}
        </div>
      </FlatSection>

      {/* 3) 기업정보 분석 */}
      <ToolSection id="company_report" tools={tools} onUpload={upload}>
        {profile ? (
          <div className="rounded-(--radius-card) border border-line bg-white p-5">
            <p className="t-body font-bold">{profile.sourceName} — {profile.pageCount}쪽에서 {profile.evidence.filter((e) => !e.removed).length}개 항목을 읽었습니다.</p>
            <p className="t-sub mt-1 text-ink-500">업로드 {formatDate(profile.createdAt)} · 원본 저장 안 함</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to={`/companies/${company.id}`}>
                <Button size="sm">미팅 전략에서 보기</Button>
              </Link>
              <Button size="sm" onClick={upload}>
                <Upload aria-hidden="true" className="size-4" /> 다른 서류 올리기
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState title="아직 올린 기업정보 서류가 없습니다" body="크레탑·신용정보·회사소개서 PDF 를 올리면 업종·재무·인증을 읽어 고객 정보를 채웁니다." action={<Button variant="primary" onClick={upload}><Upload aria-hidden="true" className="size-4" /> 서류 올리기</Button>} />
        )}
      </ToolSection>

      {/* 4) 고용지원금 */}
      <ToolSection id="employment_subsidy" tools={tools} onUpload={upload}>
        {employment && (employment.facts ? (
          <div className="space-y-3" data-testid="employment-result">
            <p className="text-[1.15rem] font-bold" data-testid="employment-headline">{employment.headline}</p>
            <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
              {employment.checks.map((c) => (
                <li key={c.id} className="px-4 py-3" data-testid="subsidy-check">
                  <p className="font-bold">{c.label}</p>
                  <p className="t-sub mt-0.5 text-accent-800">{c.because}</p>
                  <ul className="t-sub mt-2 list-disc space-y-1 pl-5 text-ink-700">
                    {c.verify.map((v) => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
            <p className="t-sub rounded-(--radius-control) bg-warn-50 px-4 py-3 font-semibold text-warn-700">{employment.caution}</p>
            {employment.missing.length > 0 && <p className="t-sub text-ink-500">직접 확인: {employment.missing.join(' · ')}</p>}
          </div>
        ) : (
          <EmptyState title="4대보험 가입자 명부가 필요합니다" body={employment.headline} action={<Button variant="primary" onClick={upload}><Upload aria-hidden="true" className="size-4" /> 명부 올리기</Button>} />
        ))}
      </ToolSection>

      {/* 5) 정책자금 — 조달 사례가 먼저, 기관 요약은 그 아래 */}
      <ToolSection id="policy_fund" tools={tools} onUpload={upload}>
        {plan && (
          <div className="space-y-4" data-testid="funding-plan">
            <p className="t-sub text-ink-500">
              같은 업종에서 <b>융자·보증 {plan.loanCount}건 + 투자 {plan.investCount}건</b>을 골랐습니다. 금액이 작은 실제 조달부터 보여 드립니다.
            </p>
            {plan.picks.length === 0 ? (
              <EmptyState title="같은 업종의 조달 사례를 찾지 못했습니다" body="업종을 확인하면 골라 드립니다. 억지로 다른 업종 사례를 붙이지 않습니다." />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {plan.picks.map((x) => (
                  <FundCard key={`${x.kind}-${x.id}`} p={x} companyId={company.id} />
                ))}
              </ul>
            )}
            {plan.nearby.length > 0 && (
              <div>
                <p className="t-section mb-2">비슷한 사례도 참고하세요</p>
                <ul className="grid gap-3 md:grid-cols-3">
                  {plan.nearby.map((x) => (
                    <FundCard key={`n-${x.kind}-${x.id}`} p={x} companyId={company.id} compact />
                  ))}
                </ul>
              </div>
            )}
            <ul className="t-sub space-y-1.5 rounded-(--radius-control) bg-warn-50 px-4 py-3 font-semibold text-warn-700" data-testid="funding-cautions">
              {plan.cautions.map((c) => (
                <li key={c}>⚠ {c}</li>
              ))}
            </ul>
            {plan.missing.length > 0 && (
              <p className="t-sub text-ink-500">
                먼저 채우면 정확해집니다: {plan.missing.join(' · ')} ·{' '}
                <Link to={`/companies/${company.id}/edit`} className="font-semibold text-accent-700 underline">
                  정보 수정
                </Link>
              </p>
            )}
          </div>
        )}
        {fund && (
          <div className="mt-6 space-y-3" data-testid="fund-result">
            <p className="t-section">이 업종에 자주 나오는 기관</p>
            {fund.institutions.length === 0 ? (
              <EmptyState title="사례에서 확인된 기관이 없습니다" body="이 업종에서 공공·정책 자금 기관이 적힌 검수 사례를 찾지 못했습니다. 억지로 기관을 붙이지 않습니다." />
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
                {fund.institutions.map((i) => (
                  <li key={i.code} className="px-4 py-3" data-testid="institution-row" data-code={i.code}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[1.05rem] font-bold">{i.label}</p>
                      <span className="t-meta font-bold text-accent-800">사례 {i.count}건</span>
                    </div>
                    <p className="t-sub mt-0.5 text-ink-500">{i.note}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {i.cases.map((c) => (
                        <Link key={c.id} to={`/cases/${c.id}?company=${company.id}`} className="t-meta inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 font-semibold text-ink-700 hover:border-accent-600 hover:text-accent-700">
                          {c.companyName} <ChevronRight aria-hidden="true" className="size-3" />
                        </Link>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </ToolSection>
    </div>
  )
}

/**
 * 조달 사례 한 장. 금액 옆에 성격(확보 금액 / 지원 예정 / 제도 한도)을 반드시 붙인다 —
 * "최대 40억" 을 그 회사가 받은 돈으로 읽으면 대표 앞에서 틀린 말을 하게 된다.
 */
function FundCard({ p, companyId, compact = false }: { p: FundingPick; companyId: string; compact?: boolean }) {
  const loan = p.loan
  const inv = p.investment
  const kindTone = p.kind === 'loan' ? 'ok' : 'info'
  return (
    <li className="flex flex-col rounded-(--radius-card) border border-line bg-white p-4" data-testid="fund-card" data-kind={p.kind} data-band={p.band}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone={kindTone}>{loan ? FUNDING_FORM_LABEL[loan.fundingForm] : '투자'}</Badge>
        <span className="text-[1.05rem] font-bold">{p.companyName}</span>
        <Badge tone={p.band === 'under5' || p.band === 'under10' ? 'ok' : 'neutral'}>{AMOUNT_BAND_LABEL[p.band]}</Badge>
      </div>
      <p className="t-meta mt-0.5 text-ink-500">{p.industryText}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-[1.1rem] font-black">
        {loan ? loan.amountText : `${(inv?.fundingAmountDisclosed ?? 0) / 100_000_000}억`}
        {loan && (
          <span className={`t-meta font-bold ${loan.amountKind === 'program_cap' ? 'text-warn-700' : 'text-ok-700'}`}>{AMOUNT_KIND_LABEL[loan.amountKind]}</span>
        )}
      </p>
      {/* 긴 설명은 오해가 생기는 "제도 한도" 에만 붙인다 — 나머지는 배지로 충분하다 */}
      {loan?.amountKind === 'program_cap' && <p className="t-meta mt-1 font-bold text-warn-700">{AMOUNT_KIND_NOTE.program_cap}</p>}
      {loan && (
        <p className="t-meta mt-1 text-ink-700">
          {loan.institutionLabel} · {loan.program} · {loan.year}
        </p>
      )}
      {inv && <p className="t-meta mt-1 text-ink-700">민간투자 · {inv.year}</p>}
      {!compact && p.why.length > 0 && <p className="t-meta mt-2 font-semibold text-accent-800">{p.why.join(' · ')}</p>}
      {p.alsoRaised.length > 0 && <p className="t-meta mt-1 text-ink-500">같은 회사 다른 조달: {p.alsoRaised.join(' / ')}</p>}
      {inv && (
        <Link to={`/cases/${inv.id}?company=${companyId}`} className="t-meta mt-auto pt-3 font-semibold text-accent-700 hover:underline">
          사례 보기 →
        </Link>
      )}
    </li>
  )
}

function DocRow({ doc, onUpload }: { doc: DocStatus; onUpload: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-testid="doc-row" data-key={doc.key} data-have={doc.have}>
      <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ${doc.have ? 'bg-ok-50 text-ok-700' : doc.required ? 'bg-warn-50 text-warn-700' : 'bg-paper-2 text-ink-300'}`} aria-hidden="true">
        {doc.have ? <Check className="size-4" /> : doc.required ? <AlertTriangle className="size-4" /> : <Upload className="size-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={doc.have || !doc.required ? 'font-bold' : 'font-bold text-warn-700'}>{doc.label}</span>
          {!doc.have && doc.required && <Badge tone="warn">필요</Badge>}
          {doc.sensitive && <Badge tone="info">집계만 저장</Badge>}
        </span>
        <span className="t-meta block text-ink-500">
          {doc.reads} · {doc.usedBy}
        </span>
      </span>
      {doc.have ? (
        <span className="t-meta font-semibold text-ok-700">{doc.uploadedAt ? `${formatDate(doc.uploadedAt)} 올림` : '올림'}</span>
      ) : (
        <Button size="sm" onClick={onUpload} data-testid="doc-upload">
          <Upload aria-hidden="true" className="size-4" /> 올리기
        </Button>
      )}
    </li>
  )
}

function ToolSection({ id, tools, onUpload, children }: { id: string; tools: ReturnType<typeof toolStatus>; onUpload: () => void; children: ReactNode }) {
  const t = tools.find((x) => x.spec.id === id)!
  const spec = TOOL_SPECS.find((s) => s.id === id)!
  return (
    <section id={`tool-${id}`} className="scroll-mt-20" data-testid="tool-section" data-tool={id}>
      <FlatSection title={spec.label} sub={spec.does}>
        {!t.ready && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-(--radius-control) border border-warn-600/40 bg-warn-50 px-4 py-3">
            <AlertTriangle aria-hidden="true" className="size-5 shrink-0 text-warn-700" />
            <p className="t-sub min-w-0 flex-1 font-bold text-warn-700">{t.missing.map((d) => d.label.split(' (')[0]).join(' · ')} 서류가 없어 결과를 낼 수 없습니다.</p>
            <Button size="sm" variant="primary" onClick={onUpload}>
              올리기
            </Button>
          </div>
        )}
        {children}
      </FlatSection>
    </section>
  )
}
