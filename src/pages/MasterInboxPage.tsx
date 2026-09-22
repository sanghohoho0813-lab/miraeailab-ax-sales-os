/** MASTER — 2차 제안 요청함. 상태 카운트 · 검색(회사명/파트너) · 필터(파트너/기간/AX 필요도/범위) · 정렬 · 행 액션. 운영 OS의 2차 제안 기능은 중복 구현하지 않는다. */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ExternalLink, Search } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Handoff, PartnerMember } from '../types/domain'
import { Badge, Button, EmptyState, PageTitle, SkeletonList, TextInput, useToast } from '../components/ui'
import { HANDOFF_STATUS_LABEL, INDUSTRY_LABEL, LEVEL_KO } from '../content/labels'
import { getDataModeConfig } from '../data/dataMode'
import { formatDate } from '../lib/util'

type Bucket = 'all' | 'new' | 'reviewing' | 'done' | 'withdrawn' | 'archived'
const BUCKETS: { id: Bucket; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'new', label: '신규' },
  { id: 'reviewing', label: '2차 제안 준비중' },
  { id: 'done', label: '완료' },
  { id: 'withdrawn', label: '철회' },
  { id: 'archived', label: '보관' },
]
function bucketOf(h: Handoff): Bucket {
  if (h.archivedAt) return 'archived'
  if (h.status === 'withdrawn') return 'withdrawn'
  if (h.status === 'proposal_ready') return 'done'
  if (h.status === 'reviewing') return 'reviewing'
  return 'new'
}
const select = 'rounded-(--radius-control) border border-line-strong bg-white px-3 py-2 t-sub font-semibold'

export default function MasterInboxPage() {
  const { user, repo } = useSession()
  const toast = useToast()
  const [list, setList] = useState<Handoff[] | null>(null)
  const [members, setMembers] = useState<PartnerMember[]>([])
  const [bucket, setBucket] = useState<Bucket>('all')
  const [q, setQ] = useState('')
  const [partner, setPartner] = useState('all')
  const [period, setPeriod] = useState<'all' | '7' | '30'>('all')
  const [need, setNeed] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [scope, setScope] = useState<'all' | 'A' | 'B' | 'C' | 'D'>('all')
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest')
  useEffect(() => {
    document.title = '2차 제안 요청함 · AX Partner OS'
    repo.listHandoffs(user).then(setList)
    repo.listMembers(user).then(setMembers).catch(() => undefined)
  }, [repo, user])
  const opsUrl = getDataModeConfig().opsOsUrl
  const partnerName = (h: Handoff) => h.payload.consultant?.name ?? members.find((m) => m.profileId === h.consultantId)?.displayName ?? '파트너'

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { all: 0, new: 0, reviewing: 0, done: 0, withdrawn: 0, archived: 0 }
    for (const h of list ?? []) {
      c.all += 1
      c[bucketOf(h)] += 1
    }
    return c
  }, [list])
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const since = period === 'all' ? 0 : Date.now() - Number(period) * 86400_000
    return (list ?? [])
      .filter((h) => (bucket === 'all' ? !h.archivedAt : bucketOf(h) === bucket))
      .filter((h) => !s || `${h.payload.company?.name ?? ''} ${partnerName(h)}`.toLowerCase().includes(s))
      .filter((h) => partner === 'all' || h.consultantId === partner)
      .filter((h) => !since || new Date(h.submittedAt ?? h.updatedAt).getTime() >= since)
      .filter((h) => need === 'all' || h.payload.recommendedAxScope?.axNeed === need)
      .filter((h) => scope === 'all' || h.payload.recommendedAxScope?.scopeLevel === scope)
      .sort((a, b) => {
        const ta = a.submittedAt ?? a.updatedAt
        const tb = b.submittedAt ?? b.updatedAt
        return sort === 'newest' ? tb.localeCompare(ta) : ta.localeCompare(tb)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, bucket, q, partner, period, need, scope, sort, members])

  async function archive(h: Handoff) {
    try {
      const next = await repo.archiveHandoff(user, h.id, !h.archivedAt)
      setList((cur) => (cur ?? []).map((x) => (x.id === next.id ? next : x)))
      toast.show(next.archivedAt ? '요청을 보관했습니다.' : '보관을 해제했습니다.', 'ok')
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '처리하지 못했습니다.', 'danger')
    }
  }

  return (
    <div className="mx-auto max-w-[1360px] space-y-5">
      <PageTitle
        title="2차 제안 요청함"
        sub="파트너가 1차 미팅을 마치고 보낸 구조화 패킷. 운영 OS 이벤트함(customer_events)에도 같은 건이 등록됩니다. 2차 제안 작성은 운영 OS에서 합니다."
        action={
          opsUrl ? (
            <a href={`${opsUrl.replace(/\/$/, '')}/ops/inbox`} target="_blank" rel="noreferrer" className="btn inline-flex h-12 items-center gap-2 rounded-(--radius-control) border border-line-strong bg-white px-4 font-semibold hover:bg-paper-2">
              <ExternalLink aria-hidden="true" className="size-4" /> 운영 OS 열기
            </a>
          ) : undefined
        }
      />
      <div role="tablist" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        {BUCKETS.map((b) => (
          <button key={b.id} role="tab" type="button" aria-selected={bucket === b.id} onClick={() => setBucket(b.id)} data-testid={`inbox-tab-${b.id}`} className={`nav-item tap shrink-0 rounded-full px-3.5 py-2 text-[0.95rem] font-bold ${bucket === b.id ? 'bg-ink-900 text-white' : 'border border-line bg-white text-ink-700 hover:bg-paper-2'}`}>
            {b.label} <span className="tnum ml-1 opacity-70">{counts[b.id]}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search aria-hidden="true" className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-300" />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사명 · 파트너로 찾기" aria-label="요청 검색" className="pl-12" data-testid="inbox-search" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={partner} onChange={(e) => setPartner(e.target.value)} className={select} aria-label="담당 파트너" data-testid="inbox-partner">
            <option value="all">모든 파트너</option>
            {members.map((m) => (
              <option key={m.profileId} value={m.profileId}>
                {m.displayName}
              </option>
            ))}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} className={select} aria-label="기간">
            <option value="all">전체 기간</option>
            <option value="7">최근 7일</option>
            <option value="30">최근 30일</option>
          </select>
          <select value={need} onChange={(e) => setNeed(e.target.value as typeof need)} className={select} aria-label="AX 필요도">
            <option value="all">AX 필요도 전체</option>
            <option value="high">높음</option>
            <option value="medium">보통</option>
            <option value="low">낮음</option>
          </select>
          <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className={select} aria-label="범위">
            <option value="all">범위 전체</option>
            {(['A', 'B', 'C', 'D'] as const).map((l) => (
              <option key={l} value={l}>
                LEVEL {l}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={select} aria-label="정렬" data-testid="inbox-sort">
            <option value="newest">최신 요청</option>
            <option value="oldest">오래된 요청</option>
          </select>
        </div>
      </div>
      {!list ? (
        <SkeletonList rows={3} />
      ) : filtered.length === 0 ? (
        <EmptyState title="조건에 맞는 요청이 없습니다" body={counts.all === 0 ? '파트너가 2차 제안 요청을 보내면 여기에 보입니다.' : '탭이나 필터를 바꿔 보세요.'} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white" data-testid="inbox-list">
          {filtered.map((h) => (
            <li key={h.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-4 sm:px-5" data-testid="inbox-row">
              <div className="min-w-0 flex-1">
                <Link to={`/handoffs/${h.id}`} className="block text-[1.1rem] font-bold text-ink-900 hover:text-accent-700">
                  {h.payload.company?.name}
                </Link>
                <p className="t-sub text-ink-500">
                  담당 {partnerName(h)} · 미팅 {formatDate(h.payload.meetingDate)} · 요청 {formatDate(h.submittedAt ?? h.updatedAt, true)} · {h.payload.company ? INDUSTRY_LABEL[h.payload.company.industry] : ''}
                </p>
                <p className="t-sub text-ink-700">
                  AX 필요도 {h.payload.recommendedAxScope ? LEVEL_KO[h.payload.recommendedAxScope.axNeed] : '-'} · LEVEL {h.payload.recommendedAxScope?.scopeLevel} · 핵심 {h.payload.painPoints?.slice(0, 2).map((p) => p.clientSafeTitle).join(', ')} · 추가 확인 {h.payload.followupQuestions?.length ?? 0}건
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {opsUrl && h.customerEventId && (
                    <a href={`${opsUrl.replace(/\/$/, '')}/ops/inbox/handoff/${h.id}`} target="_blank" rel="noreferrer" className="btn inline-flex h-9 items-center gap-1 rounded-(--radius-control) border border-line-strong bg-white px-3 t-meta font-bold hover:bg-paper-2">
                      <ExternalLink aria-hidden="true" className="size-3.5" /> 운영 OS 열기
                    </a>
                  )}
                  <Link to={`/companies/${h.companyId}`} className="btn inline-flex h-9 items-center rounded-(--radius-control) border border-line-strong bg-white px-3 t-meta font-bold hover:bg-paper-2">
                    고객 열기
                  </Link>
                  <Link to={`/meetings/${h.meetingId}/result`} className="btn inline-flex h-9 items-center rounded-(--radius-control) border border-line-strong bg-white px-3 t-meta font-bold hover:bg-paper-2">
                    미팅 원본
                  </Link>
                  <Link to={`/meetings/${h.meetingId}/report`} className="btn inline-flex h-9 items-center rounded-(--radius-control) border border-line-strong bg-white px-3 t-meta font-bold hover:bg-paper-2">
                    PDF
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => void archive(h)} data-testid="inbox-archive">
                    <Archive aria-hidden="true" className="size-4" /> {h.archivedAt ? '보관 해제' : '요청 보관'}
                  </Button>
                </div>
              </div>
              <Badge tone={h.status === 'proposal_ready' ? 'ok' : h.status === 'reviewing' ? 'info' : h.status === 'withdrawn' ? 'warn' : 'accent'}>{HANDOFF_STATUS_LABEL[h.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
