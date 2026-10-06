/**
 * 고객 — 찾고, 다음 행동으로 바로 간다.
 *
 * 고객이 수십 명을 넘으면 "회사명으로 찾기" 하나로는 부족하다. 컨설턴트는 대표자 이름이나 전화번호 뒷자리로 기억한다.
 *   - 검색: 회사명 · 대표자 · 연락처(하이픈 무시) · 업종 메모 · 메모
 *   - 상태: 전체 / 할 일 / 예정·준비 / 전달 완료 (건수 표시)
 *   - 정렬: 최근 활동 / 미팅 일시 / 이름
 *   - 검색어·상태·정렬은 주소에 남는다 — 고객을 열었다가 뒤로 와도 보던 목록 그대로다.
 *   - 줄마다 다음 행동 버튼 하나 (업무 상태 엔진이 고른다 — 홈·미팅과 같은 판단)
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, Plus, Search, Trash2, X } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, Handoff, Meeting, PartnerMember } from '../types/domain'
import { Button, EmptyState, PageTitle, Badge, SkeletonList, TextInput, useToast } from '../components/ui'
import { INDUSTRY_LABEL, HEADCOUNT_LABEL } from '../content/labels'
import { displayIndustry } from '../content/industryText'
import { josa } from '../content/korean'
import { relativeDay } from '../lib/util'
import { asViewer, filterOf, matchCompany, ownerOf, sortItems, workItems, type CompanyFilter, type CompanySort, type WorkItem } from '../engine/workStatus'

const FILTERS: { key: CompanyFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'todo', label: '할 일' },
  { key: 'planned', label: '예정·준비' },
  { key: 'sent', label: '전달 완료' },
]
const SORTS: { key: CompanySort; label: string }[] = [
  { key: 'recent', label: '최근 활동순' },
  { key: 'meeting', label: '미팅 일시순' },
  { key: 'name', label: '이름순' },
]

function industryText(c: Company): string {
  if (c.industryNote) return displayIndustry(c.industryNote)
  return c.industry === 'other' ? '업종 미확인' : INDUSTRY_LABEL[c.industry]
}

export default function CompaniesPage() {
  const { user, repo } = useSession()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<{ companies: Company[]; meetings: Meeting[]; handoffs: Handoff[] } | null>(null)
  const [failed, setFailed] = useState(false)
  /** 마스터는 모든 파트너의 고객을 본다 — 줄마다 담당을 붙인다 */
  const [members, setMembers] = useState<PartnerMember[]>([])

  const q = params.get('q') ?? ''
  const filter = (FILTERS.some((f) => f.key === params.get('f')) ? params.get('f') : 'all') as CompanyFilter
  const sort = (SORTS.some((s) => s.key === params.get('sort')) ? params.get('sort') : 'recent') as CompanySort
  // 기준은 지금 주소창이다 — setParams 의 콜백 인자는 직전 렌더의 값이라, 상태를 누르고 곧바로 정렬을 바꾸면 상태가 사라졌다
  const setParam = (key: string, value: string, fallback: string) => {
    const n = new URLSearchParams(window.location.search)
    if (!value || value === fallback) n.delete(key)
    else n.set(key, value)
    setParams(n, { replace: true })
  }

  useEffect(() => {
    document.title = '고객 · AX Partner OS'
    let alive = true
    Promise.all([repo.listCompanies(user), repo.listMeetings(user), repo.listHandoffs(user)])
      .then(([companies, meetings, handoffs]) => alive && setData({ companies, meetings, handoffs }))
      .catch(() => alive && setFailed(true))
    if (user.role === 'master') void repo.listMembers(user).then((ms) => alive && setMembers(ms)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [repo, user])

  const items = useMemo(() => (data ? workItems(data.companies, data.meetings, data.handoffs).map((x) => asViewer(x, user.id)) : []), [data, user.id])
  const matched = useMemo(() => items.map((x) => ({ x, hit: matchCompany(x.company, q) })).filter((r) => r.hit), [items, q])
  const counts = useMemo(() => {
    const c: Record<CompanyFilter, number> = { all: matched.length, todo: 0, planned: 0, sent: 0 }
    for (const r of matched) c[filterOf(r.x)]++
    return c
  }, [matched])
  const list = useMemo(() => {
    const rows = matched.filter((r) => filter === 'all' || filterOf(r.x) === filter)
    const order = sortItems(
      rows.map((r) => r.x),
      sort,
    )
    const hitOf = new Map(rows.map((r) => [r.x.company.id, r.hit]))
    return order.map((x) => ({ x, hit: hitOf.get(x.company.id) ?? 'name' }))
  }, [matched, filter, sort])

  async function archive(c: Company) {
    try {
      await repo.archiveCompany(user, c.id)
    } catch (cause) {
      return toast.show(cause instanceof Error ? cause.message : '휴지통으로 옮기지 못했습니다.', 'danger')
    }
    setData((cur) => (cur ? { ...cur, companies: cur.companies.filter((x) => x.id !== c.id) } : cur))
    toast.show(`${c.name}${josa(c.name, '을/를')} 휴지통으로 이동했습니다.`, 'ok', {
      label: '되돌리기',
      onClick: async () => {
        await repo.restoreCompany(user, c.id)
        setData((cur) => (cur ? { ...cur, companies: [c, ...cur.companies] } : cur))
      },
    })
  }

  const total = data?.companies.length ?? 0
  const ownerName = (c: Company): string => {
    if (user.role !== 'master' || ownerOf(c) === user.id) return ''
    return members.find((m) => m.profileId === ownerOf(c))?.displayName ?? ''
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageTitle
        title="고객"
        sub={data ? `${total}곳${user.role === 'master' ? ' · 모든 파트너' : ''}` : undefined}
        action={
          <>
            <Link to="/companies/trash" className="btn inline-flex h-12 items-center gap-2 rounded-(--radius-control) border border-line-strong bg-white px-4 font-semibold text-ink-700 hover:bg-paper-2" data-testid="open-trash">
              <Trash2 aria-hidden="true" className="size-4" /> 휴지통
            </Link>
            <Link to="/companies/new">
              <Button variant="primary" size="lg">
                <Plus aria-hidden="true" className="size-5" /> 미팅 준비 시작
              </Button>
            </Link>
          </>
        }
      />

      {failed && <p className="t-body mb-4 rounded-(--radius-card) bg-danger-50 px-5 py-4 font-semibold text-danger-700">고객 목록을 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요.</p>}
      {!data && !failed && <SkeletonList rows={4} />}

      {data && total > 0 && (
        <div className="mb-4 space-y-3">
          <div className="relative">
            <Search aria-hidden="true" className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-300" />
            <TextInput
              value={q}
              onChange={(e) => setParam('q', e.target.value, '')}
              placeholder="회사명 · 대표자 · 전화번호"
              aria-label="고객 검색"
              className="pl-12 pr-12"
              data-testid="company-search"
              type="search"
              enterKeyHint="search"
            />
            {q && (
              <button type="button" onClick={() => setParam('q', '', '')} aria-label="검색어 지우기" className="absolute top-1/2 right-2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-500 hover:bg-paper-2">
                <X aria-hidden="true" className="size-5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* contents — 칩과 정렬이 한 흐름으로 줄바꿈된다(폰에서 정렬이 혼자 한 줄을 차지하지 않는다) */}
            <div role="radiogroup" aria-label="상태" className="contents">
              {FILTERS.map((f) => {
                const on = filter === f.key
                return (
                  <button
                    key={f.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setParam('f', f.key, 'all')}
                    className={`tap inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[0.95rem] font-semibold ${on ? 'border-accent-600 bg-accent-50 text-accent-800' : 'border-line-strong bg-white text-ink-700 hover:bg-paper-2'}`}
                    data-testid={`filter-${f.key}`}
                  >
                    {f.label}
                    <span className={`tnum ${on ? 'text-accent-700' : 'text-ink-500'}`}>{counts[f.key]}</span>
                  </button>
                )
              })}
            </div>
            <label className="ml-auto inline-flex items-center gap-2">
              <span className="sr-only">정렬</span>
              <select
                value={sort}
                onChange={(e) => setParam('sort', e.target.value, 'recent')}
                className="h-10 rounded-(--radius-control) border border-line-strong bg-white px-3 text-[0.95rem] font-semibold text-ink-700"
                data-testid="company-sort"
              >
                {SORTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {data && (list.length === 0 ? (
        <EmptyState
          title={total === 0 ? '아직 고객이 없습니다' : q ? `"${q}" 에 맞는 고객이 없습니다` : '이 상태의 고객이 없습니다'}
          body={total === 0 ? '미팅 준비를 시작하면 여기에 고객이 쌓입니다.' : q ? '회사명 · 대표자 이름 · 전화번호 뒷자리로도 찾을 수 있습니다.' : '다른 상태를 골라 보세요.'}
          action={
            total === 0 ? (
              <Link to="/companies/new">
                <Button variant="primary" size="lg">미팅 준비 시작</Button>
              </Link>
            ) : (
              <Button onClick={() => setParams({}, { replace: true })}>전체 보기</Button>
            )
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white" data-testid="company-list">
          {list.map(({ x, hit }) => (
            <CompanyRow key={x.company.id} x={x} hit={hit} owner={ownerName(x.company)} onArchive={() => void archive(x.company)} />
          ))}
        </ul>
      ))}
    </div>
  )
}

/** 목록용 짧은 미팅 일시 — "10.9 (3일 후)" */
function shortMeeting(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : `미팅 ${d.getMonth() + 1}.${d.getDate()} (${relativeDay(iso)})`
}

function CompanyRow({ x, hit, owner, onArchive }: { x: WorkItem; hit: string; owner: string; onArchive: () => void }) {
  const c = x.company
  // 폰에서는 뒤가 잘린다 — 고객을 알아보는 데 쓰는 것(미팅 일시 · 대표자 · 찾은 번호)을 앞에 둔다
  const sub = [owner ? `담당 ${owner}` : '', c.meetingAt ? shortMeeting(c.meetingAt) : '', c.representativeName ? `${c.representativeName} 대표` : '', hit === 'phone' ? c.phone : '', industryText(c), c.headcount !== 'unknown' ? HEADCOUNT_LABEL[c.headcount] : '']
    .filter(Boolean)
    .join(' · ')
  // 다음 행동이 "전략 보기" 뿐이면 줄을 누르는 것과 같다 — 버튼을 따로 두지 않는다(폰에서 줄 높이가 두 배가 됐다)
  const showNext = x.todo || x.next.to !== `/companies/${c.id}`
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pr-3 pl-1 sm:flex-nowrap" data-testid="company-row" data-stage={x.stage}>
      <Link to={`/companies/${c.id}`} className="nav-item tap flex min-w-0 flex-1 basis-[15rem] flex-col rounded-(--radius-control) px-3 py-1 hover:bg-paper-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-[1.08rem] font-bold">{c.name}</span>
          <Badge tone={x.tone}>{x.label}</Badge>
          {c.diagnosis && <Badge tone="info">사전진단</Badge>}
        </span>
        <span className="t-sub mt-0.5 truncate text-ink-500">{sub}</span>
      </Link>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {showNext && (
          <Link
            to={x.next.to}
            className={`btn inline-flex h-10 items-center gap-1 rounded-(--radius-control) px-3 text-[0.92rem] font-semibold ${x.todo && x.rank <= 1 && !owner ? 'border border-accent-600 bg-accent-600 text-white hover:bg-accent-700' : 'border border-line-strong bg-white text-ink-900 hover:bg-paper-2'}`}
            data-testid="company-next"
          >
            {x.next.label} <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
        <button type="button" onClick={onArchive} title="휴지통으로 이동" aria-label={`${c.name} 휴지통으로 이동`} className="nav-item inline-flex size-10 items-center justify-center rounded-(--radius-control) text-ink-300 hover:bg-paper-2 hover:text-danger-700" data-testid="archive-company">
          <Trash2 aria-hidden="true" className="size-5" />
        </button>
      </span>
    </li>
  )
}
