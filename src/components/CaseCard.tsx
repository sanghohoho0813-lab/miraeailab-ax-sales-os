/**
 * 사례 카드 — 금액을 맨 위에 두지 않는다.
 * 순서: 회사명 → 문제 → 어떻게 바뀌었나 → 왜 비슷한가 → 설명 포인트 → 다른 점/주의 → 자금조달 결과(맨 아래 + 고지)
 */
import { useState } from 'react'
import type { CaseStudy } from '../types/domain'
import { Badge, Button } from './ui'
import { FUNDING_TYPE_LABEL, INDUSTRY_LABEL } from '../content/labels'
import { CASE_DISCLAIMER } from '../content/cases'
import { formatKrw } from '../lib/util'

export function CaseCard({ caseStudy: c, whySimilar, compact = false, onOpen, footer }: { caseStudy: CaseStudy; whySimilar?: string; compact?: boolean; onOpen?: () => void; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(!compact)
  const isPattern = c.verificationStatus === 'needs_review'
  return (
    <article className="rounded-(--radius-card) border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral">{INDUSTRY_LABEL[c.industry]}</Badge>
        {c.subIndustry && <span className="t-meta text-ink-500">{c.subIndustry}</span>}
        {isPattern && <Badge tone="warn">업종 패턴 · 검수 필요</Badge>}
        {c.verificationStatus === 'draft' && <Badge tone="danger">초안</Badge>}
      </div>
      <h3 className="t-section mt-1.5">{c.companyName}</h3>

      <dl className="mt-3 space-y-3">
        <div>
          <dt className="t-meta font-bold tracking-wide text-ink-500">문제가 무엇이었나</dt>
          <dd className="t-body mt-0.5">{c.problem}</dd>
        </div>
        {(open || !compact) && (
          <div>
            <dt className="t-meta font-bold tracking-wide text-ink-500">어떻게 바뀌었나</dt>
            <dd className="t-body mt-0.5">{c.axTransition}</dd>
          </div>
        )}
        {whySimilar && (
          <div className="rounded-(--radius-control) bg-accent-50 px-3 py-2">
            <dt className="t-meta font-bold tracking-wide text-accent-800">왜 이 고객과 비슷한가</dt>
            <dd className="t-body mt-0.5 text-ink-900">{whySimilar}</dd>
          </div>
        )}
        {open && (
          <>
            {c.talkingPoints.length > 0 && (
              <div>
                <dt className="t-meta font-bold tracking-wide text-ink-500">이 고객에게 설명할 포인트</dt>
                <dd className="mt-0.5">
                  <ul className="t-body list-disc space-y-0.5 pl-5">
                    {c.talkingPoints.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {c.caveats.length > 0 && (
              <div>
                <dt className="t-meta font-bold tracking-wide text-ink-500">다른 점 / 주의사항</dt>
                <dd className="mt-0.5">
                  <ul className="t-body list-disc space-y-0.5 pl-5 text-ink-700">
                    {c.caveats.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
            {(c.internalAx || c.customerPortal || c.aiFunction || c.validation) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {c.internalAx && (
                  <div>
                    <dt className="t-meta font-bold tracking-wide text-ink-500">내부 AX</dt>
                    <dd className="t-sub mt-0.5">{c.internalAx}</dd>
                  </div>
                )}
                {c.customerPortal && (
                  <div>
                    <dt className="t-meta font-bold tracking-wide text-ink-500">고객 포털</dt>
                    <dd className="t-sub mt-0.5">{c.customerPortal}</dd>
                  </div>
                )}
                {c.aiFunction && (
                  <div>
                    <dt className="t-meta font-bold tracking-wide text-ink-500">AI 기능</dt>
                    <dd className="t-sub mt-0.5">{c.aiFunction}</dd>
                  </div>
                )}
                {c.validation && (
                  <div>
                    <dt className="t-meta font-bold tracking-wide text-ink-500">실증</dt>
                    <dd className="t-sub mt-0.5">{c.validation}</dd>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-(--radius-control) border border-line bg-paper px-3 py-2.5">
              <dt className="t-meta font-bold tracking-wide text-ink-500">자금조달 결과</dt>
              <dd className="t-body mt-0.5">
                <span className="font-bold">{FUNDING_TYPE_LABEL[c.fundingType]}</span>
                {c.fundingType !== 'none' && c.fundingType !== 'unknown' && (
                  <>
                    {' · '}실제 공개금액 <span className="font-bold">{formatKrw(c.fundingAmountDisclosed)}</span>
                    {' · '}제도상 최대한도 <span className="font-bold">{c.fundingProgramMax === null ? '별도 확인' : formatKrw(c.fundingProgramMax)}</span>
                  </>
                )}
                {c.fundingNote && <span className="t-sub block text-ink-500">{c.fundingNote}</span>}
              </dd>
              <p className="t-meta mt-1.5 text-ink-500">{CASE_DISCLAIMER}</p>
            </div>
            <p className="t-meta text-ink-300">
              출처: {c.source} · {c.sourceDate} · {c.year}
            </p>
          </>
        )}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {compact && (
          <Button
            size="sm"
            onClick={() => {
              setOpen((v) => !v)
              if (!open) onOpen?.()
            }}
          >
            {open ? '접기' : '자세히'}
          </Button>
        )}
        {footer}
      </div>
    </article>
  )
}
