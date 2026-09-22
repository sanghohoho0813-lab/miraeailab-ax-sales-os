/** MASTER — 파트너가 보낸 2차 제안 요청 목록. 운영 OS 이벤트함과 같은 건이 여기에도 보인다. */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { useSession } from '../lib/auth'
import type { Handoff } from '../types/domain'
import { Badge, EmptyState, PageTitle, SkeletonList } from '../components/ui'
import { HANDOFF_STATUS_LABEL, INDUSTRY_LABEL, LEVEL_KO } from '../content/labels'
import { getDataModeConfig } from '../data/dataMode'
import { formatDate } from '../lib/util'

export default function MasterInboxPage() {
  const { user, repo } = useSession()
  const [list, setList] = useState<Handoff[] | null>(null)
  useEffect(() => {
    document.title = '2차 제안 요청함 · AX Partner OS'
    repo.listHandoffs(user).then(setList)
  }, [repo, user])
  if (!list) return <SkeletonList rows={3} />
  const opsUrl = getDataModeConfig().opsOsUrl
  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <PageTitle
        title="2차 제안 요청함"
        sub="파트너가 1차 미팅을 마치고 보낸 구조화 패킷. 운영 OS 이벤트함(customer_events)에도 같은 건이 등록됩니다."
        action={
          opsUrl ? (
            <a href={`${opsUrl.replace(/\/$/, '')}/ops/inbox`} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-(--radius-control) border border-line-strong bg-white px-4 font-semibold hover:bg-paper-2">
              <ExternalLink aria-hidden="true" className="size-4" /> 운영 OS 열기
            </a>
          ) : undefined
        }
      />
      {list.length === 0 ? (
        <EmptyState title="아직 전달된 요청이 없습니다" />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
          {list.map((h) => (
            <li key={h.id}>
              <Link to={`/handoffs/${h.id}`} className="nav-item tap flex flex-wrap items-center gap-3 px-4 py-4 hover:bg-paper-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[1.05rem] font-bold">{h.payload.company?.name}</span>
                  <span className="t-sub block text-ink-500">
                    담당 {h.payload.consultant?.name} · 미팅 {formatDate(h.payload.meetingDate)} · {h.payload.company ? INDUSTRY_LABEL[h.payload.company.industry] : ''}
                  </span>
                  <span className="t-sub block text-ink-700">
                    AX 필요도 {h.payload.recommendedAxScope ? LEVEL_KO[h.payload.recommendedAxScope.axNeed] : '-'} · 예상 구축 LEVEL {h.payload.recommendedAxScope?.scopeLevel} · 핵심 문제 {h.payload.painPoints?.map((p) => p.clientSafeTitle).join(', ')} · 추가 확인 {h.payload.followupQuestions?.length ?? 0}건
                  </span>
                </span>
                <Badge tone={h.status === 'proposal_ready' ? 'ok' : h.status === 'reviewing' ? 'info' : 'accent'}>{HANDOFF_STATUS_LABEL[h.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
