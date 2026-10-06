/**
 * 홈 — "지금 할 일" 이 먼저다.
 *
 * 예전 홈은 오늘 미팅 · 2차 제안 대기 · 최근 상담을 나란히 보여 줬다. 정작 Partner 가 해야 할 일 두 가지 —
 * 중단된 미팅과 "분석까지 끝났는데 2차 제안 요청을 안 보낸" 건 — 은 홈에 없거나 다른 목록에 섞여 있었다.
 * 이제 업무 상태 엔진(workStatus)이 고른 할 일을 급한 순서로 한 줄씩, 행동 버튼 하나와 함께 보여 준다.
 * 그 아래는 참고용: 다가오는 미팅, 2차 제안 진행 상황.
 *
 * 할 일은 "내 고객"(담당자 = 나) 것만이다. 마스터는 모든 고객을 볼 수 있지만, 파트너가 진행 중인 미팅을
 * 마스터의 할 일로 올리면 [이어서 진행] 이 남의 미팅을 연다. 마스터에게는 대신
 *   - 확인할 2차 제안 요청 (마스터의 본업)
 *   - 파트너 고객 중 하루 넘게 멈춘 건 (파트너에게 물어볼 것)
 * 을 따로 보여 준다.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, CheckCircle2, Send } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, Handoff, Meeting, PartnerMember } from '../types/domain'
import { Button, Badge, FlatSection, SkeletonList } from '../components/ui'
import { formatDate, relativeDay } from '../lib/util'
import { byUrgency, isStuck, ownerOf, pendingRequests, todoItems, workItems, type WorkItem } from '../engine/workStatus'

type Data = { companies: Company[]; meetings: Meeting[]; handoffs: Handoff[]; members: PartnerMember[] }

export default function DashboardPage() {
  const { user, repo } = useSession()
  const master = user.role === 'master'
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    document.title = '홈 · AX Partner OS'
    let alive = true
    Promise.all([repo.listCompanies(user), repo.listMeetings(user), repo.listHandoffs(user), master ? repo.listMembers(user).catch(() => [] as PartnerMember[]) : Promise.resolve([] as PartnerMember[])])
      .then(([companies, meetings, handoffs, members]) => alive && setData({ companies, meetings, handoffs, members }))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [repo, user, master])

  const items = useMemo(() => (data ? workItems(data.companies, data.meetings, data.handoffs) : []), [data])
  // 내 고객 — 재배정된 고객은 새 담당의 일이다
  const mine = useMemo(() => items.filter((x) => ownerOf(x.company) === user.id), [items, user.id])
  const todo = useMemo(() => todoItems(mine), [mine])
  const requests = useMemo(() => (master && data ? pendingRequests(data.handoffs) : []), [master, data])
  const stuck = useMemo(() => (master ? items.filter((x) => ownerOf(x.company) !== user.id && isStuck(x)).sort(byUrgency) : []), [master, items, user.id])
  const upcoming = useMemo(() => mine.filter((x) => x.stage === 'upcoming').sort((a, b) => (a.at ?? '').localeCompare(b.at ?? '')).slice(0, 5), [mine])
  const inReview = useMemo(() => mine.filter((x) => x.stage === 'submitted').sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 5), [mine])
  const todayCount = mine.filter((x) => x.stage === 'today').length
  const total = todo.length + requests.length

  const memberName = (id: string, fallback = '파트너') => {
    const m = data?.members.find((x) => x.profileId === id)
    return m ? `${m.displayName}${m.title ? ` ${m.title}` : ''}` : fallback
  }
  // 중단된 내 미팅이 가장 먼저(기억이 흐려진다), 그다음 확인할 요청, 나머지 내 할 일
  const liveFirst = todo.filter((x) => x.stage === 'live')
  const restTodo = todo.filter((x) => x.stage !== 'live')

  return (
    <div className="mx-auto max-w-[1100px] space-y-9">
      <section className="reveal flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-page">
            안녕하세요, {user.name}
            {user.title ? ` ${user.title}` : ''}님
          </h1>
          <p className="t-body mt-2 text-ink-700" data-testid="home-summary">
            {!data ? (
              '불러오는 중…'
            ) : master && requests.length ? (
              // 마스터 — 요청과 내 할 일을 나눠 센다 (합계를 따로 보여 주면 같은 건을 두 번 읽게 된다)
              <>
                확인할 요청 <strong className="text-[1.25rem] font-black text-accent-700" data-testid="todo-count">{requests.length}건</strong>
                {todo.length > 0 && <> · 내 할 일 <strong className="font-black">{todo.length}건</strong></>}
                {todayCount > 0 && <> · 오늘 미팅 <strong className="font-black">{todayCount}건</strong></>}
              </>
            ) : total ? (
              <>
                지금 할 일 <strong className="text-[1.25rem] font-black text-accent-700" data-testid="todo-count">{total}건</strong>
                {todayCount > 0 && <> · 오늘 미팅 <strong className="font-black">{todayCount}건</strong></>}
              </>
            ) : (
              '지금 처리할 일이 없습니다.'
            )}
          </p>
        </div>
        <Link to="/companies/new" className="w-full sm:w-auto">
          <Button variant="primary" size="lg" className="w-full sm:min-w-[220px]" data-testid="cta-new-company">
            미팅 준비 시작
          </Button>
        </Link>
      </section>

      {failed && <p className="t-body rounded-(--radius-card) bg-danger-50 px-5 py-4 font-semibold text-danger-700">목록을 불러오지 못했습니다. 연결을 확인하고 새로고침해 주세요.</p>}
      {!data && !failed && <SkeletonList rows={3} />}

      {data && (
        <FlatSection title="지금 할 일" sub="급한 것부터 — 버튼 하나로 바로 이어집니다">
          {total === 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-dashed border-line-strong bg-white px-5 py-6" data-testid="todo-empty">
              <CheckCircle2 aria-hidden="true" className="size-6 shrink-0 text-ok-700" />
              <p className="t-body min-w-0 flex-1 text-ink-700">
                {master ? '확인할 요청과 밀린 일이 없습니다.' : data.companies.length ? '밀린 일이 없습니다. 다음 미팅 일정을 넣어 두면 여기에 올라옵니다.' : '첫 고객을 등록하면 여기에 할 일이 쌓입니다.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white" data-testid="todo-list">
              {liveFirst.map((x) => (
                <TodoRow key={x.company.id} to={x.next.to} name={x.company.name} label={x.label} tone={x.tone} reason={x.reason} action={x.next.label} stage={x.stage} strong />
              ))}
              {requests.map((h) => (
                <TodoRow
                  key={h.id}
                  to={`/handoffs/${h.id}`}
                  name={h.payload.company?.name ?? '고객'}
                  label={h.status === 'received' ? '확인 중' : '새 요청'}
                  tone="accent"
                  reason={`${memberName(h.consultantId, h.payload.consultant?.name)} · ${relativeDay(h.submittedAt ?? h.createdAt)} 전달된 2차 제안 요청`}
                  action="요청 보기"
                  stage="request"
                  strong
                />
              ))}
              {restTodo.map((x) => (
                <TodoRow key={x.company.id} to={x.next.to} name={x.company.name} label={x.label} tone={x.tone} reason={x.reason} action={x.next.label} stage={x.stage} strong={x.rank <= 1} />
              ))}
            </ul>
          )}
        </FlatSection>
      )}

      {/* 마스터 — 파트너 고객 중 하루 넘게 멈춘 건. 평가가 아니라 "파트너에게 물어볼 것" 목록이다 */}
      {data && master && stuck.length > 0 && (
        <FlatSection
          title="파트너 고객 — 멈춘 건"
          sub="하루 넘게 진행이 없는 건만 — 담당 파트너에게 확인해 보세요"
          action={
            <Link to="/companies?f=todo" className="t-sub font-semibold text-accent-700 hover:underline">
              전체 보기
            </Link>
          }
        >
          <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white" data-testid="stuck-list">
            {stuck.slice(0, 5).map((x) => (
              <li key={x.company.id} data-testid="stuck-row" data-stage={x.stage}>
                <Link to={`/companies/${x.company.id}`} className="nav-item tap flex items-center gap-3 px-4 py-3.5 hover:bg-paper-2 sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[1.05rem] font-bold">{x.company.name}</span>
                      <Badge tone={x.tone}>{x.label}</Badge>
                    </span>
                    <span className="t-sub mt-0.5 block text-ink-700">
                      <span className="font-semibold">{memberName(ownerOf(x.company))}</span> · {x.reason}
                    </span>
                  </span>
                  <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
        </FlatSection>
      )}

      {data && (upcoming.length > 0 || inReview.length > 0) && (
        <div className="grid gap-8 lg:grid-cols-2">
          {upcoming.length > 0 && (
            <FlatSection title="다가오는 미팅" action={<Link to="/meetings" className="t-sub font-semibold text-accent-700 hover:underline">전체 보기</Link>}>
              <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
                {upcoming.map((x) => (
                  <li key={x.company.id}>
                    <Link to={x.next.to} className="nav-item tap flex items-center gap-3 px-4 py-3.5 hover:bg-paper-2">
                      <CalendarClock aria-hidden="true" className="size-5 shrink-0 text-ink-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[1.05rem] font-bold">{x.company.name}</span>
                        <span className="t-sub block text-ink-500">
                          {formatDate(x.company.meetingAt, true)} ({relativeDay(x.company.meetingAt)})
                        </span>
                      </span>
                      <ArrowRight aria-hidden="true" className="size-5 shrink-0 text-ink-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            </FlatSection>
          )}
          {inReview.length > 0 && (
            <FlatSection title="2차 제안 진행 상황" sub="김상호 대표가 검토 중인 요청">
              <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
                {inReview.map((x) => (
                  <li key={x.company.id}>
                    <Link to={x.next.to} className="nav-item tap flex items-center gap-3 px-4 py-3.5 hover:bg-paper-2">
                      <Send aria-hidden="true" className="size-5 shrink-0 text-ink-500" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[1.05rem] font-bold">{x.company.name}</span>
                        <span className="t-sub block text-ink-500">{x.at ? `${formatDate(x.at)} 전달 (${relativeDay(x.at)})` : ''}</span>
                      </span>
                      <Badge tone={x.tone}>{x.label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </FlatSection>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 할 일 한 줄 — 줄 전체가 다음 행동으로 가는 링크다(모바일에서 엄지로 어디를 눌러도 된다).
 * 오른쪽의 버튼 모양은 "무엇이 일어나는지" 를 알려 주는 표시이고 실제 요소는 링크 하나다.
 */
function TodoRow({ to, name, label, tone, reason, action, stage, strong }: { to: string; name: string; label: string; tone: WorkItem['tone']; reason: string; action: string; stage: string; strong: boolean }) {
  return (
    <li data-testid="todo-row" data-stage={stage}>
      <Link to={to} className="nav-item tap flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 hover:bg-paper-2 sm:px-5">
        <span className="min-w-0 flex-1 basis-[14rem]">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[1.1rem] font-bold">{name}</span>
            <Badge tone={tone}>{label}</Badge>
          </span>
          <span className="t-sub mt-0.5 block text-ink-700">{reason}</span>
        </span>
        <span className={`inline-flex h-11 shrink-0 items-center gap-1.5 rounded-(--radius-control) px-4 text-[0.98rem] font-semibold ${strong ? 'bg-accent-600 text-white' : 'border border-line-strong bg-white text-ink-900'}`} data-testid="todo-action">
          {action} <ArrowRight aria-hidden="true" className="size-4" />
        </span>
      </Link>
    </li>
  )
}
