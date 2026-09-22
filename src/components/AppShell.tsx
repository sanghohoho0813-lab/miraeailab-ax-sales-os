/**
 * 앱 셸 — PC 는 왼쪽 사이드바, 태블릿·모바일은 하단 내비게이션.
 * 현장에서 빠르게 누르는 것이 최우선이라 메뉴는 5개로 제한한다.
 */
import { NavLink, Outlet } from 'react-router-dom'
import { BookOpen, Building2, Home, Library, MoreHorizontal, Inbox, Users, ShieldAlert, MessageSquare, Settings } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { BrandLogo } from './BrandLogo'

const PARTNER_NAV = [
  { to: '/', label: '홈', icon: Home, end: true },
  { to: '/companies', label: '내 고객', icon: Building2 },
  { to: '/cases', label: '사례', icon: Library },
  { to: '/playbook', label: '플레이북', icon: BookOpen },
  { to: '/more', label: '더보기', icon: MoreHorizontal },
]

const SIDE_EXTRA = [
  { to: '/objections', label: '상황별 답변', icon: MessageSquare },
  { to: '/forbidden', label: '주의 표현', icon: ShieldAlert },
  { to: '/settings', label: '설정', icon: Settings },
]

const MASTER_NAV = [
  { to: '/master/inbox', label: '2차 제안 요청함', icon: Inbox },
  { to: '/master/partners', label: '파트너 관리', icon: Users },
]

export function AppShell() {
  const { user, mode } = useAuth()
  const isMaster = user?.role === 'master'
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `tap flex items-center gap-3 rounded-(--radius-control) px-3 py-2.5 text-[1rem] font-semibold transition-colors ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`

  return (
    <div className="min-h-dvh lg:flex">
      {/* 사이드바 (PC) */}
      <aside className="hidden w-64 shrink-0 flex-col bg-ink-900 px-4 py-5 text-white lg:flex">
        <BrandLogo tone="dark" subtitle="AX 미팅 가이드" />
        <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="주 메뉴">
          {PARTNER_NAV.filter((n) => n.to !== '/more').map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkClass}>
              <n.icon aria-hidden="true" className="size-5" /> {n.label}
            </NavLink>
          ))}
          {SIDE_EXTRA.map((n) => (
            <NavLink key={n.to} to={n.to} className={linkClass}>
              <n.icon aria-hidden="true" className="size-5" /> {n.label}
            </NavLink>
          ))}
          {isMaster && (
            <>
              <p className="t-meta mt-4 px-3 font-bold tracking-wider text-white/40">MASTER</p>
              {MASTER_NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className={linkClass}>
                  <n.icon aria-hidden="true" className="size-5" /> {n.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="truncate text-[0.95rem] font-semibold">{user?.name}</p>
          <p className="t-meta truncate text-white/50">
            {user?.email} · {user?.role === 'master' ? '마스터' : '파트너'}
            {mode === 'local' && ' · 데모'}
          </p>
        </div>
      </aside>

      {/* 본문 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3 lg:hidden">
          <BrandLogo subtitle="AX 미팅 가이드" compact />
          <span className="t-meta rounded-full bg-paper-2 px-2.5 py-1 font-bold text-ink-700">
            {user?.name} · {user?.role === 'master' ? '마스터' : '파트너'}
            {mode === 'local' && ' · 데모'}
          </span>
        </header>
        <main className="pb-safe-nav mx-auto w-full max-w-[980px] flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <Outlet />
        </main>
      </div>

      {/* 하단 내비 (태블릿·모바일) */}
      <nav aria-label="주 메뉴" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white lg:hidden">
        <ul className="grid grid-cols-5">
          {PARTNER_NAV.map((n) => (
            <li key={n.to}>
              <NavLink
                to={n.to}
                end={n.end}
                className={({ isActive }) => `flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.78rem] font-bold ${isActive ? 'text-accent-700' : 'text-ink-500'}`}
              >
                <n.icon aria-hidden="true" className="size-6" />
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
