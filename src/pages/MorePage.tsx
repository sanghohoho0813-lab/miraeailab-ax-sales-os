import { Link } from 'react-router-dom'
import { BookOpen, MessageSquare, Settings, ShieldAlert, Inbox, Users, ChevronRight, CalendarClock, Trash2, BarChart3, ClipboardList } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { PageTitle } from '../components/ui'

export default function MorePage() {
  const { user } = useAuth()
  const items = [
    { to: '/meetings', label: '미팅', desc: '오늘·예정·진행 중·전달 완료', icon: CalendarClock, hue: 'text-accent-600' },
    { to: '/playbook', label: 'AX 플레이북', desc: '영업 원칙 · 상황별 답변 · 주의 표현', icon: BookOpen, hue: 'text-know-600' },
    { to: '/playbook?tab=objections', label: '상황별 답변', desc: '"ERP 있는데요" "얼마예요" — 핵심 답변 1문장 + 다음 질문', icon: MessageSquare, hue: 'text-know-600' },
    { to: '/playbook?tab=forbidden', label: '주의 표현', desc: '절대 하지 말아야 할 말과 대체 문장', icon: ShieldAlert, hue: 'text-know-600' },
    { to: '/companies/trash', label: '고객 휴지통', desc: '보관한 고객 복구 · 영구 삭제', icon: Trash2, hue: 'text-ink-500' },
    { to: '/settings', label: '설정 · 프로필', desc: '테마, 화면 보기, 내 정보, 로그아웃', icon: Settings, hue: 'text-ink-500' },
    ...(user?.role === 'master'
      ? [
          { to: '/master/inbox', label: '2차 제안 요청함 (마스터)', desc: '파트너가 전달한 1차 미팅 패킷', icon: Inbox, hue: 'text-accent-600' },
          { to: '/master/partners', label: '파트너 관리 (마스터)', desc: '파트너 등록·수정·활성화', icon: Users, hue: 'text-accent-600' },
          { to: '/master/usage', label: '사용 데이터 (마스터)', desc: '미팅 수 · 건너뛴 질문 · 많이 본 사례', icon: BarChart3, hue: 'text-accent-600' },
          { to: '/master/audit', label: '변경 기록 (마스터)', desc: '삭제·철회·파트너 수정 기록', icon: ClipboardList, hue: 'text-accent-600' },
        ]
      : []),
  ]
  return (
    <div className="mx-auto max-w-[760px]">
      <PageTitle title="더보기" />
      <ul className="divide-y divide-line overflow-hidden rounded-(--radius-card) border border-line bg-white">
        {items.map((it) => (
          <li key={it.to}>
            <Link to={it.to} className="nav-item tap flex items-center gap-3 px-4 py-4 hover:bg-paper-2">
              <it.icon aria-hidden="true" className={`size-6 shrink-0 ${it.hue}`} />
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
