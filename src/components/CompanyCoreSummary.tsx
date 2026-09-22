/**
 * 1차 미팅용 핵심 요약 — 업종 · 근로자 · 최근 매출 · 업력, 그리고 회사명(+대표자).
 *
 * 왜 넷뿐인가: 기업인증·특허·주소·신용등급·자산·부채는 2차 제안과 Master 분석에 쓰는 정보다.
 * Partner 가 미팅 직전에 훑어야 하는 것은 "어떤 회사인가" 뿐이고, 그건 이 네 가지로 충분하다.
 * 나머지 값은 지우지 않고 [추출정보 전체보기] 안에 남겨 둔다.
 */
import type { ReactNode } from 'react'
import type { Company, CompanyProfile } from '../types/domain'
import { coreSummary } from '../engine/profile'

export function CompanyCoreSummary({
  company,
  profile,
  title,
  action,
  compact = false,
}: {
  company: Pick<Company, 'name' | 'industry' | 'industryNote' | 'headcount' | 'representativeName'>
  profile: CompanyProfile | null
  /** 회사명 대신 쓸 제목 (기본은 회사명) */
  title?: ReactNode
  /** 오른쪽 위 작은 동작 ([수정] 등) */
  action?: ReactNode
  compact?: boolean
}) {
  const c = coreSummary(company, profile)
  const items = [
    { key: 'industry', label: '업종', value: c.industry },
    { key: 'headcount', label: '근로자', value: c.headcount },
    { key: 'revenue', label: '최근 매출', value: c.revenue },
    { key: 'years', label: '업력', value: c.years },
  ].filter((x) => x.value)

  return (
    <section className={`rounded-(--radius-card) border border-line bg-white ${compact ? 'p-4' : 'p-5 sm:p-6'}`} data-testid="core-summary">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className={compact ? 'text-[1.25rem] font-black leading-tight' : 'text-[1.5rem] font-black leading-tight sm:text-[1.7rem]'} data-testid="core-name">
            {title ?? company.name}
          </h2>
          {c.representativeName && (
            <p className="t-sub mt-0.5 text-ink-500" data-testid="core-rep">
              {c.representativeName} 대표
            </p>
          )}
        </div>
        {action}
      </div>
      {items.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {items.map((x) => (
            <div key={x.key} data-testid="core-item" data-key={x.key}>
              <dt className="t-meta font-bold tracking-wide text-ink-500">{x.label}</dt>
              <dd className="mt-0.5 text-[1.1rem] font-bold break-keep">{x.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}
