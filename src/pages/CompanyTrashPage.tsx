/**
 * 고객 휴지통 — 보관된 고객. 복구 또는 영구 삭제(2단계: 영향 범위 → 회사명 입력).
 * 운영 OS 에 전달된 요청이 있는 고객은 DB 가 영구 삭제를 거부한다 — 화면은 그 이유를 그대로 보여 준다.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Company, CompanyDeletePreview, Handoff, Meeting, PartnerMember } from '../types/domain'
import { Badge, Button, DangerModal, EmptyState, PageTitle, SkeletonList, useToast } from '../components/ui'
import { INDUSTRY_LABEL } from '../content/labels'
import { formatDate } from '../lib/util'

export default function CompanyTrashPage() {
  const { user, repo } = useSession()
  const toast = useToast()
  const [list, setList] = useState<Company[] | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [handoffs, setHandoffs] = useState<Handoff[]>([])
  const [members, setMembers] = useState<PartnerMember[]>([])
  const [target, setTarget] = useState<{ company: Company; preview: CompanyDeletePreview } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [c, m, h] = await Promise.all([repo.listArchivedCompanies(user), repo.listMeetings(user), repo.listHandoffs(user)])
    setList(c)
    setMeetings(m)
    setHandoffs(h)
    if (user.role === 'master') setMembers(await repo.listMembers(user).catch(() => []))
  }
  useEffect(() => {
    document.title = '고객 휴지통 · AX Partner OS'
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, user])

  const partnerName = (id: string) => members.find((m) => m.profileId === id)?.displayName ?? (id === user.id ? user.name : '담당 파트너')

  async function restore(c: Company) {
    await repo.restoreCompany(user, c.id)
    toast.show(`${c.name}을(를) 복구했습니다.`, 'ok')
    await load()
  }
  async function openDelete(c: Company) {
    try {
      const preview = await repo.previewCompanyDelete(user, c.id)
      setTarget({ company: c, preview })
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '확인하지 못했습니다.', 'danger')
    }
  }
  async function confirmDelete(typedName: string) {
    if (!target) return
    setBusy(true)
    try {
      await repo.deleteCompanyPermanent(user, target.company.id, typedName)
      toast.show(`${target.company.name}을(를) 영구 삭제했습니다.`, 'ok')
      setTarget(null)
      await load()
    } catch (cause) {
      toast.show(cause instanceof Error ? cause.message : '삭제하지 못했습니다.', 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageTitle title="고객 휴지통" sub="목록과 미팅에서는 숨겨지지만 언제든 복구할 수 있습니다. 영구 삭제는 되돌릴 수 없습니다." back={<Link to="/companies" className="t-sub inline-flex items-center gap-1 text-ink-500 hover:text-ink-900"><ArrowLeft aria-hidden="true" className="size-4" /> 고객</Link>} />
      {!list ? (
        <SkeletonList rows={2} />
      ) : list.length === 0 ? (
        <EmptyState title="휴지통이 비어 있습니다" body="고객 상세의 [휴지통으로 이동] 으로 보관한 고객이 여기에 모입니다." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white" data-testid="trash-list">
          {list.map((c) => {
            const mc = meetings.filter((m) => m.companyId === c.id).length
            const transmitted = handoffs.some((h) => h.companyId === c.id && h.customerEventId)
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5" data-testid="trash-row">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[1.1rem] font-bold text-ink-900">{c.name}</p>
                  <p className="t-sub truncate text-ink-500">
                    {INDUSTRY_LABEL[c.industry]} · 담당 {partnerName(c.assignedTo ?? c.consultantId)} · 보관 {formatDate(c.archivedAt, true)} · 미팅 {mc}건
                  </p>
                </div>
                {transmitted ? <Badge tone="info">운영 OS 전달 이력</Badge> : <Badge>전달 없음</Badge>}
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => void restore(c)} data-testid="restore">
                    <RotateCcw aria-hidden="true" className="size-4" /> 복구
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void openDelete(c)} data-testid="delete-permanent">
                    <Trash2 aria-hidden="true" className="size-4" /> 영구 삭제
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <DangerModal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={`${target?.company.name ?? ''} 영구 삭제`}
        impact={
          target
            ? [
                `미팅 ${target.preview.meetings}건 (분석 완료 ${target.preview.analyzed}건)`,
                `2차 제안 요청 ${target.preview.handoffs}건${target.preview.transmitted > 0 ? ` · 운영 OS 전달 이력 ${target.preview.transmitted}건` : ''}`,
                `사용 이벤트 ${target.preview.usageEvents}건`,
              ]
            : []
        }
        recoverable={target?.preview.canDelete ? '이 작업은 되돌릴 수 없습니다.' : (target?.preview.reason ?? '영구 삭제할 수 없습니다.')}
        confirmLabel="영구 삭제"
        typedConfirm={target?.preview.canDelete ? target.company.name : undefined}
        onConfirm={() => {
          const typed = (document.querySelector('[data-testid="danger-typed"]') as HTMLInputElement | null)?.value ?? ''
          return confirmDelete(typed)
        }}
        busy={busy}
        confirmDisabled={Boolean(target && !target.preview.canDelete)}
        testId="delete-modal"
      >
        {target && !target.preview.canDelete && (
          <p className="t-sub text-ink-700">
            대신 <b>보관 상태로 두거나</b> 2차 제안 요청을 <b>철회</b>한 뒤 다시 시도하세요.
            {target.preview.requiresMaster && user.role !== 'master' && ' 운영 OS 전달 이력이 있는 고객은 마스터만 삭제할 수 있습니다.'}
          </p>
        )}
      </DangerModal>
    </div>
  )
}
