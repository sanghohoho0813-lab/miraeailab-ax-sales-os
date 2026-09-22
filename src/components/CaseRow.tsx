/**
 * 사례 compact 카드 — 기업명 / 업종 / 문제 1줄 / 전환 1줄 / 자금유형 + 실제 공개금액 / [사례 보기]
 */
import { Link } from 'react-router-dom'
import type { CaseStudy } from '../types/domain'
import { FUNDING_TYPE_LABEL } from '../content/labels'
import { formatEok, needsSourceRecheck } from '../content/caseText'
import { Badge } from './ui'

export function CaseRow({ c, reason, onOpen, ctaLabel = '사례 보기', to }: { c: CaseStudy; reason?: string; onOpen?: () => void; ctaLabel?: string; to?: string }) {
  const amount = c.fundingAmountDisclosed !== null && c.fundingAmountDisclosed !== undefined ? formatEok(c.fundingAmountDisclosed) : null
  const limit = c.fundingProgramMax !== null && c.fundingProgramMax !== undefined ? formatEok(c.fundingProgramMax) : null
  return (
    <article className="lift flex h-full flex-col rounded-(--radius-card) border border-line bg-white p-4 sm:p-5" data-testid="case-row">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[1.15rem] font-bold leading-tight text-ink-900">{c.companyName}</h3>
        <span className="t-meta text-ink-500">{c.subIndustry || c.researchSection}</span>
        {c.newlyVerified && <Badge tone="info">신규 검증</Badge>}
        {c.reviewRequired && <Badge tone="warn">검수 필요</Badge>}
        {!c.reviewRequired && needsSourceRecheck(c) && <Badge tone="warn">출처 재확인 권장</Badge>}
      </div>
      {reason && <p className="t-meta mt-1.5 font-semibold text-accent-800">{reason}</p>}
      <dl className="mt-3 space-y-1.5">
        {c.problem && (
          <div className="flex gap-2">
            <dt className="t-meta w-9 shrink-0 pt-0.5 font-black tracking-wide text-ink-500">문제</dt>
            <dd className="t-sub line-clamp-2 text-ink-900">{c.problem}</dd>
          </div>
        )}
        {c.axTransition && (
          <div className="flex gap-2">
            <dt className="t-meta w-9 shrink-0 pt-0.5 font-black tracking-wide text-ink-500">전환</dt>
            <dd className="t-sub line-clamp-2 text-ink-900">{c.axTransition}</dd>
          </div>
        )}
      </dl>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 pt-3">
        <p className="t-sub text-ink-700">
          <span className="font-semibold">{FUNDING_TYPE_LABEL[c.fundingType]}</span>
          {amount && <span className="ml-1.5 font-bold text-ink-900">{amount}</span>}
          {!amount && limit && <span className="ml-1.5 text-ink-500">제도 한도 {limit}</span>}
          {c.year && <span className="ml-1.5 text-ink-500">· {c.year}</span>}
        </p>
        <Link to={to ?? `/cases/${c.id}`} onClick={onOpen} className="btn inline-flex h-10 items-center rounded-(--radius-control) border border-line-strong bg-white px-3 text-[0.92rem] font-semibold text-ink-900 hover:bg-paper-2">
          {ctaLabel}
        </Link>
      </div>
    </article>
  )
}
