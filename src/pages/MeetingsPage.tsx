/**
 * 미팅 — 진행 흐름으로 본다. 고객 화면이 "찾기" 라면 여기는 "어디까지 왔나" 다.
 *
 * 묶음은 업무 상태 엔진(workStatus)이 정한다 — 홈의 "지금 할 일" 과 같은 판단이다.
 *   지금 할 일 → 다가오는 미팅 → 일정 미정 → 전달 완료
 * 예전에는 일정이 지났는데 기록이 없는 미팅이 "날짜 미정" 으로 들어갔다. 이제 "지난 미팅" 으로 할 일에 올라온다.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, Handoff, Meeting, PartnerMember } from '../types/domain'
import { HEADCOUNT_LABEL, INDUSTRY_LABEL } from '../content/labels'
import { displayIndustry } from '../content/industryText'
import { formatDate, relativeDay } from '../lib/util'
import { Badge, Button, DangerModal, EmptyState, FlatSection, PageTitle, SkeletonList, useToast } from '../components/ui'
import { asViewer, byUrgency, ownerOf, workItems, type WorkItem } from '../engine/workStatus'

type Group = 'todo' | 'upcoming' | 'prep' | 'sent'
const GROUPS: { key: Group; title: string; sub: string }[] = [
  { key: 'todo', title: '지금 할 일', sub: '급한 것부터 — 진행 중 · 2차 제안 요청 · 지난 미팅 · 오늘' },
  { key: 'upcoming', title: '다가오는 미팅', sub: '날짜순' },
  { key: 'prep', title: '일정 미정', sub: '미팅 일시를 넣으면 다가오는 미팅으로 올라옵니다' },
  { key: 'sent', title: '전달 완료', sub: '김상호 대표가 검토 중이거나 끝난 건' },
]
function groupOf(x: WorkItem): Group {
  if (x.todo) return 'todo'
  if (x.stage === 'upcoming') return 'upcoming'
  if (x.stage === 'submitted') return 'sent'
  return 'prep'
}

export default function MeetingsPage() {
  const { user, repo } = useSession()
  const toast = useToast()
  const [data, setData] = useState<{ companies: Company[]; meetings: Meeting[]; handoffs: Handoff[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [del, setDel] = useState<WorkItem | null>(null)
  const [busy, setBusy] = useState(false)
  /** 마스터는 모든 파트너의 미팅을 본다 — 줄마다 담당을 붙인다 */
  const [members, setMembers] = useState<PartnerMember[]>([])

  useEffect(() => {
    document.title = '미팅 · AX Partner OS'
    let alive = true
    Promise.all([repo.listCompanies(user), repo.listMeetings(user), repo.listHandoffs(user)])
      .then(([companies, meetings, handoffs]) => alive && setData({ companies, meetings, handoffs }))
      .catch(() => alive && setFailed(true))
    if (user.role === 'master') void repo.listMembers(user).then((ms) => alive && setMembers(ms)).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [repo, user])

  const groups = useMemo(() => {
    const g: Record<Group, WorkItem[]> = { todo: [], upcoming: [], prep: [], sent: [] }
    for (const x of data ? workItems(data.companies, data.meetings, data.handoffs) : []) g[groupOf(x)].push(asViewer(x, user.id))
    g.todo.sort(byUrgency)
    g.upcoming.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
    g.prep.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
    g.sent.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
    return g
  }, [data, user.id])
  const ownerName = (c: Company): string => (ownerOf(c) === user.id ? '' : (members.find((m) => m.profileId === ownerOf(c))?.displayName ?? ''))

  async function deleteDraft() {
    const m = del?.meeting
    if (!m) return
    setBusy(true)
    try {
      await repo.deleteMeeting(user, m.id)
      setData((cur) => (cur ? { ...cur, meetings: cur.meetings.filter((x) => x.id !== m.id) } : cur))
      toast.show('미팅 초안을 삭제했습니다.', 'ok')
      setDel(null)
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '삭제하지 못했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  const total = data?.companies.length ?? 0

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <PageTitle
        title="미팅"
        sub={data ? `${total}개 고객 · 지금 할 일 ${groups.todo.length}건` : undefined}
        action={
          <Link to="/companies/new">
            <Button variant="primary" size="lg" data-testid="cta-new-company">
              <Plus aria-hidden="true" className="size-5" /> 미팅 준비 시작
            </Button>
          </Link>
        }
      />
      {failed && <p className="t-body rounded-(--radius-card) bg-danger-50 px-5 py-4 font-semibold text-danger-700">미팅 목록을 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요.</p>}
      {!data && !failed && <SkeletonList rows={3} />}
      {data && total === 0 && (
        <EmptyState
          title="아직 준비한 미팅이 없습니다"
          body="회사 이름과 기본 구조만 넣으면 미팅 전략이 바로 만들어집니다. 3분이면 됩니다."
          action={
            <Link to="/companies/new">
              <Button variant="primary" size="lg">미팅 준비 시작</Button>
            </Link>
          }
        />
      )}
      {data &&
        GROUPS.filter((g) => groups[g.key].length > 0).map((g) => (
          <FlatSection key={g.key} title={g.title} sub={g.sub}>
            <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white" data-testid={`meeting-group-${g.key}`}>
              {groups[g.key].map((x) => (
                <MeetingRow key={x.company.id} x={x} owner={ownerName(x.company)} onDelete={() => setDel(x)} />
              ))}
            </ul>
          </FlatSection>
        ))}
      <DangerModal
        open={Boolean(del)}
        onClose={() => setDel(null)}
        title="미팅 초안을 삭제할까요?"
        impact={del?.meeting ? [`${del.company.name} · ${formatDate(del.meeting.createdAt, true)}`] : []}
        recoverable="이 작업은 되돌릴 수 없습니다. 고객 정보는 남고 미팅 기록만 지워집니다."
        confirmLabel="삭제"
        onConfirm={deleteDraft}
        busy={busy}
        testId="delete-draft-modal"
      />
    </div>
  )
}

function MeetingRow({ x, owner, onDelete }: { x: WorkItem; owner: string; onDelete: () => void }) {
  const c = x.company
  const industry = c.industryNote ? displayIndustry(c.industryNote) : c.industry === 'other' ? '업종 미확인' : INDUSTRY_LABEL[c.industry]
  const when = x.stage === 'upcoming' || x.stage === 'today' || x.stage === 'overdue' ? (c.meetingAt ? `${formatDate(c.meetingAt, true)} (${relativeDay(c.meetingAt)})` : '') : ''
  // 남의 초안은 지우지 않는다 — 담당 파트너가 정리한다
  const draft = x.meeting?.status === 'draft' && !owner
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5" data-testid="meeting-row" data-stage={x.stage}>
      <div className="min-w-0 flex-1 basis-[14rem]">
        <span className="flex flex-wrap items-center gap-2">
          <Link to={`/companies/${c.id}`} className="truncate text-[1.1rem] font-bold text-ink-900 hover:text-accent-700">
            {c.name}
          </Link>
          <Badge tone={x.tone}>{x.label}</Badge>
        </span>
        <p className={`t-sub ${x.todo ? 'text-ink-700' : 'truncate text-ink-500'}`}>{owner && <span className="font-semibold text-ink-700">{owner} · </span>}{x.todo ? x.reason : [industry, c.headcount !== 'unknown' ? HEADCOUNT_LABEL[c.headcount] : '', when].filter(Boolean).join(' · ')}</p>
      </div>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {draft && (
          <button type="button" onClick={onDelete} className="nav-item inline-flex size-10 items-center justify-center rounded-(--radius-control) text-ink-300 hover:bg-paper-2 hover:text-danger-700" aria-label="미팅 초안 삭제" data-testid="delete-draft">
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        )}
        <Link
          to={x.next.to}
          className={`btn inline-flex h-10 items-center rounded-(--radius-control) px-3 text-[0.92rem] font-semibold ${x.todo && x.rank <= 1 && !owner ? 'border border-accent-600 bg-accent-600 text-white hover:bg-accent-700' : 'border border-line-strong bg-white text-ink-900 hover:bg-paper-2'}`}
          data-testid="meeting-next"
        >
          {x.next.label}
        </Link>
      </span>
    </li>
  )
}
