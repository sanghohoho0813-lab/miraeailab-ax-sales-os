import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, Meeting } from '../types/domain'
import { Button, EmptyState, PageTitle, Badge, Spinner, TextInput } from '../components/ui'
import { INDUSTRY_LABEL, HEADCOUNT_LABEL, MEETING_STATUS_LABEL } from '../content/labels'
import { formatDate } from '../lib/util'

export default function CompaniesPage() {
  const { user, repo } = useSession()
  const [companies, setCompanies] = useState<Company[] | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [q, setQ] = useState('')

  useEffect(() => {
    document.title = '내 고객 · AX 미팅 가이드'
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

  if (!companies) return <Spinner />
  const latestMeeting = (companyId: string) => meetings.find((m) => m.companyId === companyId)

  return (
    <div>
      <PageTitle
        title="내 고객"
        sub={user.role === 'master' ? '모든 파트너의 업체가 보입니다.' : '내가 등록하거나 담당하는 업체'}
        action={
          <Link to="/companies/new">
            <Button variant="primary">
              <Plus aria-hidden="true" className="size-5" /> 신규 업체
            </Button>
          </Link>
        }
      />
      <div className="relative mb-4">
        <Search aria-hidden="true" className="absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-300" />
        <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사명으로 찾기" aria-label="회사명 검색" className="pl-12" />
      </div>
      {list.length === 0 ? (
        <EmptyState title="업체가 없습니다" body={q ? '검색어를 바꿔 보세요.' : '신규 업체를 등록해 시작하세요.'} />
      ) : (
        <ul className="divide-y divide-line rounded-(--radius-card) border border-line bg-white">
          {list.map((c) => {
            const m = latestMeeting(c.id)
            return (
              <li key={c.id}>
                <Link to={`/companies/${c.id}`} className="tap flex items-center gap-3 px-4 py-4 hover:bg-paper-2">
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
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
