import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Trash2 } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, Meeting } from '../types/domain'
import { Button, EmptyState, PageTitle, Badge, SkeletonList, TextInput, useToast } from '../components/ui'
import { INDUSTRY_LABEL, HEADCOUNT_LABEL, MEETING_STATUS_LABEL } from '../content/labels'
import { formatDate } from '../lib/util'

export default function CompaniesPage() {
  const { user, repo } = useSession()
  const toast = useToast()
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [q, setQ] = useState('')

  useEffect(() => {
    document.title = '고객 · AX Partner OS'
    let alive = true
    Promise.all([repo.listCompanies(user), repo.listMeetings(user)]).then(([c, m]) => {
      if (!alive) return
      setCompanies(c)
      setMeetings(m)
    })
    return () => {
      alive = false
    }
  }, [repo, user])

  const list = useMemo(() => {
    const s = q.trim().replace(/\s/g, '').toLowerCase()
    return (companies ?? []).filter((c) => !s || c.name.replace(/\s/g, '').toLowerCase().includes(s))
  }, [companies, q])

  if (!companies) return <SkeletonList rows={3} />
  const latestMeeting = (companyId: string) => meetings.find((m) => m.companyId === companyId)
  async function archive(c: Company) {
    await repo.archiveCompany(user, c.id)
    setCompanies((cur) => (cur ?? []).filter((x) => x.id !== c.id))
    toast.show(`${c.name}을(를) 휴지통으로 이동했습니다.`, 'ok', {
      label: '되돌리기',
      onClick: async () => {
        await repo.restoreCompany(user, c.id)
        setCompanies((cur) => [c, ...(cur ?? [])])
      },
    })
  }

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageTitle
        title="고객"
        sub={user.role === 'master' ? '모든 파트너의 업체가 보입니다.' : '내가 등록하거나 담당하는 업체'}
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
      <div className="relative mb-4">
        <Search aria-hidden="true" className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-300" />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사명으로 찾기" aria-label="회사명 검색" className="pl-12" />
      </div>
      {list.length === 0 ? (
        <EmptyState
          title={q ? '검색 결과가 없습니다' : '아직 고객이 없습니다'}
          body={q ? '검색어를 바꿔 보세요.' : '미팅 준비를 시작하면 여기에 고객이 쌓입니다.'}
          action={
            !q && (
              <Link to="/companies/new">
                <Button variant="primary" size="lg">미팅 준비 시작</Button>
              </Link>
            )
          }
        />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
          {list.map((c) => {
            const m = latestMeeting(c.id)
            return (
              <li key={c.id} className="flex items-center gap-2 pr-3" data-testid="company-row">
                <Link to={`/companies/${c.id}`} className="nav-item tap flex min-w-0 flex-1 items-center gap-3 px-4 py-4 hover:bg-paper-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1.05rem] font-bold">{c.name}</span>
                    <span className="t-sub block text-ink-500">
                      {INDUSTRY_LABEL[c.industry]} · {HEADCOUNT_LABEL[c.headcount]}
                      {c.meetingAt && ` · 미팅 ${formatDate(c.meetingAt, true)}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {c.diagnosis && <Badge tone="info">사전진단</Badge>}
                    {m && <Badge tone={m.status === 'submitted' ? 'ok' : m.status === 'live' ? 'accent' : 'neutral'}>{MEETING_STATUS_LABEL[m.status]}</Badge>}
                  </span>
                </Link>
                <button type="button" onClick={() => void archive(c)} title="휴지통으로 이동" aria-label={`${c.name} 휴지통으로 이동`} className="nav-item inline-flex size-10 shrink-0 items-center justify-center rounded-(--radius-control) text-ink-300 hover:bg-paper-2 hover:text-danger-700" data-testid="archive-company">
                  <Trash2 aria-hidden="true" className="size-5" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
