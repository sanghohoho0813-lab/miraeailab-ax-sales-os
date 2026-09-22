/**
 * 1차 미팅용 핵심 요약 — 업종 · 근로자 수 · 최근 매출 · 업력, 그리고 회사명(+대표자).
 *
 * 왜 넷뿐인가: 기업인증·특허·주소·신용등급·자산·부채는 2차 제안과 Master 분석에 쓰는 정보다.
 * Partner 가 미팅 직전에 훑어야 하는 것은 "어떤 회사인가" 뿐이고, 그건 이 네 가지로 충분하다.
 * 나머지 값은 지우지 않고 [추출정보 전체보기] 안에 남겨 둔다.
 *
 * 값이 없다고 칸을 숨기지 않는다. 숨기면 "무엇을 모르는지" 를 모르게 되고,
 * 나중에 저장 단계에서 "업종을 골라 주세요" 같은 벽을 만나게 된다.
 * 빈 칸은 "미확인" 으로 보여 주고, onFill 이 있으면 그 자리에서 바로 채울 수 있게 한다.
 */
import type { ReactNode } from 'react'
import type { Company, CompanyProfile } from '../types/domain'
import { coreSummary } from '../engine/profile'

export type CoreSlotKey = 'industry' | 'headcount' | 'revenue' | 'years'

const SLOTS: { key: CoreSlotKey; label: string; verb: string }[] = [
  { key: 'industry', label: '업종', verb: '선택' },
  { key: 'headcount', label: '근로자 수', verb: '선택' },
  { key: 'revenue', label: '최근 매출', verb: '입력' },
  { key: 'years', label: '업력', verb: '입력' },
]

export function CompanyCoreSummary({
  company,
  profile,
  title,
  action,
  compact = false,
  onFill,
  fillable,
}: {
  company: Pick<Company, 'name' | 'industry' | 'industryNote' | 'headcount' | 'representativeName'>
  profile: CompanyProfile | null
  /** 회사명 대신 쓸 제목 (기본은 회사명) */
  title?: ReactNode
  /** 오른쪽 위 작은 동작 ([수정] 등) */
  action?: ReactNode
  compact?: boolean
  /** 빈 칸을 그 자리에서 채우게 한다. 없으면 "미확인" 만 보여 준다 */
  onFill?: (key: CoreSlotKey) => void
  /** onFill 을 붙일 슬롯 (기본 전부) */
  fillable?: CoreSlotKey[]
}) {
  const c = coreSummary(company, profile)
  const value: Record<CoreSlotKey, string> = { industry: c.industry, headcount: c.headcount, revenue: c.revenue, years: c.years }

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
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {SLOTS.map((s) => {
          const v = value[s.key]
          const canFill = Boolean(onFill) && (!fillable || fillable.includes(s.key))
          return (
            <div key={s.key} data-testid="core-item" data-key={s.key} data-state={v ? 'filled' : 'unknown'}>
              <dt className="t-meta font-bold tracking-wide text-ink-500">{s.label}</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                {v ? (
                  <span className="text-[1.1rem] font-bold break-keep">{v}</span>
                ) : (
                  <>
                    <span className="text-[1.1rem] font-bold text-ink-300">미확인</span>
                    {canFill && (
                      <button
                        type="button"
                        onClick={() => onFill?.(s.key)}
                        className="tap t-sub inline-flex h-9 shrink-0 cursor-pointer items-center rounded-(--radius-control) border border-accent-600 px-3 font-bold text-accent-700 hover:bg-accent-50"
                        data-testid="core-fill"
                        data-key={s.key}
                      >
                        {s.verb}
                      </button>
                    )}
                  </>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}
