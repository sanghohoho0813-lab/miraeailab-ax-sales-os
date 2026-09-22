/**
 * 미팅 — 오늘·예정·진행중·전달 완료를 한 목록으로. 카드 대신 compact list.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, Meeting } from '../types/domain'
import { HANDOFF_STATUS_LABEL, INDUSTRY_LABEL, HEADCOUNT_LABEL } from '../content/labels'
import { formatDate, relativeDay } from '../lib/util'
import { Badge, Button, DangerModal, EmptyState, FlatSection, PageTitle, SkeletonList, useToast } from '../components/ui'

type Row = { company: Company; meeting: Meeting | null }
type Bucket = 'today' | 'upcoming' | 'active' | 'done' | 'undated'

function bucketOf(r: Row): Bucket {
  const m = r.meeting
  if (m?.status === 'submitted') return 'done'
  if (m && (m.status === 'live' || m.status === 'analyzed')) return 'active'
  const at = r.company.meetingAt ? new Date(r.company.meetingAt) : null
  if (!at) return 'undated'
  const now = new Date()
  const same = at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth() && at.getDate() === now.getDate()
  if (same) return 'today'
  return at.getTime() > now.getTime() ? 'upcoming' : 'undated'
}

const BUCKET_LABEL: Record<Bucket, { title: string; sub: string }> = {
  today: { title: '오늘 미팅', sub: '준비 화면에서 전략을 확인하고 시작합니다' },
  upcoming: { title: '예정된 미팅', sub: '날짜순' },
  active: { title: '진행 중 · 분석 완료', sub: '마무리하거나 2차 제안 요청을 보냅니다' },
  undated: { title: '날짜 미정', sub: '미팅 일시를 넣으면 오늘·예정으로 올라옵니다' },
  done: { title: '전달 완료', sub: '김상호 대표의 운영 OS 에 전달된 건' },
}

function statusOf(r: Row): { label: string; tone: 'neutral' | 'accent' | 'ok' | 'info' | 'warn' } {
  const m = r.meeting
  if (!m) return { label: '준비', tone: 'neutral' }
  if (m.status === 'cancelled') return { label: '취소됨', tone: 'warn' }
  if (m.status === 'live') return { label: '진행 중', tone: 'accent' }
  if (m.status === 'analyzed') return { label: '분석 완료', tone: 'info' }
  if (m.status === 'submitted') return { label: HANDOFF_STATUS_LABEL.submitted ?? '전달 완료', tone: 'ok' }
  return { label: '초안', tone: 'neutral' }
}

function actionOf(r: Row): { to: string; label: string; primary: boolean } {
  const m = r.meeting
  if (m?.status === 'live') return { to: `/meetings/${m.id}/live`, label: '이어서 진행', primary: true }
  if (m?.status === 'analyzed') return { to: `/meetings/${m.id}/result`, label: '분석 · 2차 제안 요청', primary: true }
  if (m?.status === 'submitted' && m.handoffId) return { to: `/handoffs/${m.handoffId}`, label: '요청 상태 보기', primary: false }
  return { to: `/companies/${r.company.id}`, label: '미팅 전략 보기', primary: false }
}

export default function MeetingsPage() {
  const { user, repo } = useSession()
  const toast = useToast()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [del, setDel] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  async function deleteDraft() {
    if (!del?.meeting) return
    setBusy(true)
    try {
      await repo.deleteMeeting(user, del.meeting.id)
      setRows((cur) => (cur ?? []).map((r) => (r.company.id === del.company.id ? { ...r, meeting: null } : r)))
      toast.show('미팅 초안을 삭제했습니다.', 'ok')
      setDel(null)
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '삭제하지 못했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    document.title = '미팅 · AX Partner OS'
    let alive = true
    void Promise.all([repo.listCompanies(user), repo.listMeetings(user)]).then(([companies, meetings]) => {
      if (!alive) return
      const latest = new Map<string, Meeting>()
      for (const m of meetings) {
        const cur = latest.get(m.companyId)
        if (!cur || (m.updatedAt ?? '') > (cur.updatedAt ?? '')) latest.set(m.companyId, m)
      }
      setRows(companies.map((c) => ({ company: c, meeting: latest.get(c.id) ?? null })))
    })
    return () => {
      alive = false
    }
  }, [repo, user])

  const groups = useMemo(() => {
    const g: Record<Bucket, Row[]> = { today: [], upcoming: [], active: [], undated: [], done: [] }
    for (const r of rows ?? []) g[bucketOf(r)].push(r)
    const byDate = (a: Row, b: Row) => (a.company.meetingAt ?? '').localeCompare(b.company.meetingAt ?? '')
    g.today.sort(byDate)
    g.upcoming.sort(byDate)
    return g
  }, [rows])

  const order: Bucket[] = ['today', 'active', 'upcoming', 'undated', 'done']
  const total = rows?.length ?? 0

  return (
    <div className="mx-auto max-w-[1100px] space-y-8">
      <PageTitle
        title="미팅"
        sub={rows ? `${total}개 고객 · 오늘 ${groups.today.length}건` : undefined}
        action={
          <Link to="/companies/new">
            <Button variant="primary" size="lg" data-testid="cta-new-company">
              <Plus aria-hidden="true" className="size-5" /> 미팅 준비 시작
            </Button>
          </Link>
        }
      />
      {!rows && <SkeletonList rows={3} />}
      {rows && total === 0 && (
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
      {rows &&
        order
          .filter((b) => groups[b].length > 0)
          .map((b) => (
            <FlatSection key={b} title={BUCKET_LABEL[b].title} sub={BUCKET_LABEL[b].sub}>
              <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
                {groups[b].map((r) => {
                  const st = statusOf(r)
                  const act = actionOf(r)
                  return (
                    <li key={r.company.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <Link to={`/companies/${r.company.id}`} className="block truncate text-[1.1rem] font-bold text-ink-900 hover:text-accent-700">
                          {r.company.name}
                        </Link>
                        <p className="t-sub truncate text-ink-500">
                          {INDUSTRY_LABEL[r.company.industry]} · {HEADCOUNT_LABEL[r.company.headcount]}
                          {r.company.meetingAt && ` · ${formatDate(r.company.meetingAt, true)} (${relativeDay(r.company.meetingAt)})`}
                        </p>
                      </div>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {r.meeting && (r.meeting.status === 'draft' || r.meeting.status === 'cancelled') && (
                        <button type="button" onClick={() => setDel(r)} className="nav-item inline-flex size-9 items-center justify-center rounded-(--radius-control) text-ink-300 hover:bg-paper-2 hover:text-danger-700" aria-label="미팅 초안 삭제" data-testid="delete-draft">
                          <Trash2 aria-hidden="true" className="size-4" />
                        </button>
                      )}
                      <Link to={act.to} className="shrink-0">
                        <Button variant={act.primary ? 'primary' : 'secondary'} size="sm">
                          {act.label}
                        </Button>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </FlatSection>
          ))}
      <DangerModal
        open={Boolean(del)}
        onClose={() => setDel(null)}
        title="미팅 초안을 삭제할까요?"
        impact={del ? [`${del.company.name} · ${del.meeting ? formatDate(del.meeting.createdAt, true) : ''}`] : []}
        recoverable="이 작업은 되돌릴 수 없습니다. 고객 정보는 남고 미팅 기록만 지워집니다."
        confirmLabel="삭제"
        onConfirm={deleteDraft}
        busy={busy}
        testId="delete-draft-modal"
      />
    </div>
  )
}
