/** MASTER — 변경 기록(partner_audit_events): 누가 · 언제 · 무엇을 · 어떻게. 위험 작업과 마스터 작업만 기록한다. */
import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../lib/auth'
import type { AuditEvent } from '../types/domain'
import { Badge, EmptyState, PageTitle, SkeletonList, TextInput } from '../components/ui'
import { formatDate } from '../lib/util'

const ACTION_LABEL: Record<string, { label: string; tone: 'neutral' | 'warn' | 'danger' | 'ok' | 'info' }> = {
  company_archived: { label: '고객 휴지통 이동', tone: 'warn' },
  company_restored: { label: '고객 복구', tone: 'ok' },
  company_deleted: { label: '고객 영구 삭제', tone: 'danger' },
  company_reassigned: { label: '담당 재배정', tone: 'info' },
  meeting_cancelled: { label: '미팅 취소', tone: 'warn' },
  meeting_deleted: { label: '미팅 삭제', tone: 'danger' },
  handoff_submitted: { label: '2차 제안 요청 전달', tone: 'ok' },
  handoff_resubmitted: { label: '2차 제안 요청 재전달', tone: 'ok' },
  handoff_withdrawn: { label: '2차 제안 요청 철회', tone: 'warn' },
  handoff_archived: { label: '요청 보관', tone: 'neutral' },
  handoff_unarchived: { label: '요청 보관 해제', tone: 'neutral' },
  partner_added: { label: '파트너 등록', tone: 'ok' },
  partner_updated: { label: '파트너 정보 수정', tone: 'info' },
  partner_activated: { label: '파트너 활성화', tone: 'ok' },
  partner_deactivated: { label: '파트너 비활성화', tone: 'danger' },
  case_reviewed: { label: '사례 검수', tone: 'info' },
}

function summarize(e: AuditEvent): string {
  const d = e.detail as Record<string, unknown>
  const name = typeof d.name === 'string' ? d.name : typeof d.company === 'string' ? d.company : ''
  if (e.action === 'partner_updated' || e.action === 'partner_activated' || e.action === 'partner_deactivated') {
    const b = (d.before ?? {}) as Record<string, unknown>
    const a = (d.after ?? {}) as Record<string, unknown>
    const changes = ['display_name', 'displayName', 'title', 'role', 'active'].filter((k) => k in a && a[k] !== b[k]).map((k) => `${k}: ${String(b[k] ?? '')} → ${String(a[k] ?? '')}`)
    return changes.join(' · ') || '변경 없음'
  }
  if (e.action === 'case_reviewed') return `${name} → ${String(d.status ?? '')}${d.note ? ` (${String(d.note)})` : ''}`
  if (e.action === 'handoff_withdrawn') return `사유: ${String(d.reason ?? '') || '없음'}`
  if (e.action === 'company_deleted') return `${name} · 미팅 ${String(d.meetings ?? 0)}건 · 요청 ${String(d.handoffs ?? 0)}건`
  return name
}

export default function MasterAuditPage() {
  const { user, repo } = useSession()
  const [list, setList] = useState<AuditEvent[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => {
    document.title = '변경 기록 · AX Partner OS'
    repo.listAudit(user, 300).then(setList).catch(() => setList([]))
  }, [repo, user])
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (list ?? []).filter((e) => !s || `${e.actorName} ${ACTION_LABEL[e.action]?.label ?? e.action} ${summarize(e)} ${e.targetId}`.toLowerCase().includes(s))
  }, [list, q])
  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageTitle title="변경 기록" sub="위험 작업(삭제·철회·비활성화)과 마스터 작업(재배정·검수)만 기록합니다. 클라이언트는 이 기록을 쓸 수 없습니다." />
      <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 작업 · 대상으로 찾기" aria-label="기록 검색" />
      {!list ? (
        <SkeletonList rows={3} />
      ) : filtered.length === 0 ? (
        <EmptyState title="기록이 없습니다" body="고객 보관·삭제, 요청 철회, 파트너 수정 같은 작업이 생기면 여기에 남습니다." />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white" data-testid="audit-list">
          {filtered.map((e) => {
            const a = ACTION_LABEL[e.action] ?? { label: e.action, tone: 'neutral' as const }
            return (
              <li key={e.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3" data-testid="audit-row">
                <span className="tnum t-meta w-[9.5rem] shrink-0 text-ink-500">{formatDate(e.createdAt, true)}</span>
                <Badge tone={a.tone}>{a.label}</Badge>
                <span className="min-w-0 flex-1 t-sub">
                  <b>{e.actorName || '알 수 없음'}</b> · {summarize(e)}
                  <span className="ml-2 t-meta text-ink-300">
                    {e.targetType}:{e.targetId.slice(0, 8)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
