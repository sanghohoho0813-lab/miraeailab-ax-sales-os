/**
 * 사례 카드 — 미팅 전에 읽을 것은 네 줄뿐이다.
 *   회사명 / 세부업종 · 무엇을 바꿨는가 한 줄 · 왜 이 고객과 비슷한가 한 줄 · [사례 보기]
 * 문제 서술·자금 금액·연도는 카드에서 빼거나 아주 작게 둔다. 상세는 [사례 보기] 안에 있다.
 */
import { Link } from 'react-router-dom'
import type { CaseStudy } from '../types/domain'
import { FUNDING_TYPE_LABEL } from '../content/labels'
import { formatEok, needsSourceRecheck } from '../content/caseText'
import { Badge } from './ui'

export function CaseRow({ c, reason, onOpen, ctaLabel = '사례 보기', to }: { c: CaseStudy; reason?: string; onOpen?: () => void; ctaLabel?: string; to?: string }) {
  const amount = c.fundingAmountDisclosed !== null && c.fundingAmountDisclosed !== undefined ? formatEok(c.fundingAmountDisclosed) : null
  const changed = c.axTransition || c.internalAx || c.customerPortal || c.aiFunction || c.problem
  return (
    <article className="lift flex h-full flex-col rounded-(--radius-card) border border-line bg-white p-4" data-testid="case-row">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[1.1rem] font-bold leading-tight text-ink-900">{c.companyName}</h3>
        <span className="t-meta text-ink-500">{c.subIndustry || c.researchSection}</span>
        {c.reviewRequired && <Badge tone="warn">검수 필요</Badge>}
        {!c.reviewRequired && needsSourceRecheck(c) && <Badge tone="warn">출처 재확인</Badge>}
      </div>
      {changed && <p className="t-sub mt-2 line-clamp-2 text-ink-900">{changed}</p>}
      {reason && <p className="t-meta mt-2 font-semibold text-accent-800">{reason}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <p className="t-meta text-ink-500">
          {FUNDING_TYPE_LABEL[c.fundingType]}
          {amount && ` ${amount}`}
          {c.year && ` · ${c.year}`}
        </p>
        <Link to={to ?? `/cases/${c.id}`} onClick={onOpen} className="btn inline-flex h-10 items-center rounded-(--radius-control) border border-line-strong bg-white px-3 text-[0.92rem] font-semibold text-ink-900 hover:bg-paper-2">
          {ctaLabel}
        </Link>
      </div>
    </article>
  )
}
