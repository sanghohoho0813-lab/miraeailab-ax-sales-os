import { Link } from 'react-router-dom'
import { MessageSquare, Settings, ShieldAlert, Inbox, Users, ChevronRight } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { PageTitle } from '../components/ui'

export default function MorePage() {
  const { user } = useAuth()
  const items = [
    { to: '/objections', label: '상황별 답변', desc: '"ERP 있는데요" "얼마예요" — 핵심 답변 1문장 + 다음 질문', icon: MessageSquare },
    { to: '/forbidden', label: '주의 표현', desc: '절대 하지 말아야 할 말과 대체 문장', icon: ShieldAlert },
    { to: '/settings', label: '설정 · 프로필', desc: '내 정보, 데이터 모드, 로그아웃', icon: Settings },
    ...(user?.role === 'master'
      ? [
          { to: '/master/inbox', label: '2차 제안 요청함 (마스터)', desc: '파트너가 전달한 1차 미팅 패킷', icon: Inbox },
          { to: '/master/partners', label: '파트너 관리 (마스터)', desc: '파트너 등록·활성화', icon: Users },
        ]
      : []),
  ]
  return (
    <div>
      <PageTitle title="더보기" />
      <ul className="divide-y divide-line rounded-(--radius-card) border border-line bg-white">
        {items.map((it) => (
          <li key={it.to}>
            <Link to={it.to} className="tap flex items-center gap-3 px-4 py-4 hover:bg-paper-2">
              <it.icon aria-hidden="true" className="size-6 shrink-0 text-accent-700" />
              <span className="min-w-0 flex-1">
                <span className="block text-[1.05rem] font-bold">{it.label}</span>
                <span className="t-sub block text-ink-500">{it.desc}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 text-ink-300" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
