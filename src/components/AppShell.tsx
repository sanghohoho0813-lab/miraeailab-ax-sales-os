/**
 * 앱 셸 — PC: 그룹 사이드바(272px) + 글로벌 헤더(라우트 제목 · 실시간 시계 · Device View · 사용자).
 *          태블릿·모바일: 상단 바 + 하단 내비 5개. LIVE MEETING 은 포커스 모드(사이드바 최소화).
 * Device View [PC][Mobile][PC+Mobile] 은 같은 라우트를 390px 폰 프레임으로 함께 보여 준다.
 */
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { BookOpen, Building2, CalendarClock, Home, Library, MoreHorizontal, Inbox, Users, Settings, Monitor, Smartphone, Columns2, type LucideIcon } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { DEVICE_VIEWS, useDeviceView, type DeviceView } from '../lib/deviceView'
import { useClock } from '../lib/clock'
import { routeTitle } from '../content/routeTitles'
import { BrandLogo } from './BrandLogo'
import { DeviceFrame, FrameSync } from './DeviceFrame'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}
interface NavGroupDef {
  label: string
  hue: 'accent' | 'know' | 'neutral'
  items: NavItem[]
}

const WORK: NavGroupDef = {
  label: 'WORK',
  hue: 'accent',
  items: [
    { to: '/', label: '홈', icon: Home, end: true },
    { to: '/meetings', label: '미팅', icon: CalendarClock },
    { to: '/companies', label: '고객', icon: Building2 },
  ],
}
const KNOWLEDGE: NavGroupDef = {
  label: 'KNOWLEDGE',
  hue: 'know',
  items: [
    { to: '/cases', label: '실제 사례', icon: Library },
    { to: '/playbook', label: 'AX 플레이북', icon: BookOpen },
  ],
}
const SYSTEM: NavGroupDef = { label: 'SYSTEM', hue: 'neutral', items: [{ to: '/settings', label: '설정', icon: Settings }] }
const MASTER: NavGroupDef = {
  label: 'MASTER',
  hue: 'accent',
  items: [
    { to: '/master/inbox', label: '2차 제안 요청함', icon: Inbox },
    { to: '/master/partners', label: '파트너 관리', icon: Users },
  ],
}
const BOTTOM: NavItem[] = [
  { to: '/', label: '홈', icon: Home, end: true },
  { to: '/meetings', label: '미팅', icon: CalendarClock },
  { to: '/companies', label: '고객', icon: Building2 },
  { to: '/cases', label: '사례', icon: Library },
  { to: '/more', label: '더보기', icon: MoreHorizontal },
]
const DEVICE_ICON: Record<DeviceView, LucideIcon> = { pc: Monitor, mobile: Smartphone, dual: Columns2 }

function Clock({ compact = false }: { compact?: boolean }) {
  const c = useClock()
  return (
    <time data-testid="live-clock" className="tnum inline-flex items-baseline gap-2 whitespace-nowrap text-ink-700" aria-live="off">
      {!compact && (
        <span className="t-sub hidden font-semibold md:inline">
          {c.date} {c.weekday}
        </span>
      )}
      <span className="text-[1.05rem] font-bold text-ink-900">{c.time}</span>
    </time>
  )
}

function DeviceSwitch() {
  const { view, setView } = useDeviceView()
  return (
    <div role="radiogroup" aria-label="Device View" data-testid="device-switch" className="hidden items-center rounded-(--radius-control) border border-line bg-paper-2 p-0.5 lg:inline-flex">
      {DEVICE_VIEWS.map((d) => {
        const Icon = DEVICE_ICON[d.id]
        const on = view === d.id
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={on}
            title={d.hint}
            onClick={() => setView(d.id)}
            data-testid={`device-${d.id}`}
            className={`nav-item inline-flex h-9 items-center gap-1.5 rounded-[9px] px-2.5 t-meta font-bold ${on ? 'bg-white text-ink-900 shadow-(--shadow-card)' : 'text-ink-500 hover:text-ink-900'}`}
          >
            <Icon aria-hidden="true" className="size-4" /> {d.label}
          </button>
        )
      })}
    </div>
  )
}

function UserChip() {
  const { user, mode } = useAuth()
  return (
    <Link to="/settings" className="nav-item inline-flex max-w-[40vw] items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3 hover:bg-paper-2 lg:max-w-none" aria-label="설정 · 프로필">
      <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-full bg-accent-100 text-[0.9rem] font-black text-accent-800">
        {user?.name?.slice(0, 1) ?? '?'}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[0.95rem] font-bold leading-tight">{user?.name}</span>
        <span className="t-meta block truncate leading-tight text-ink-500">
          {user?.role === 'master' ? '마스터' : '파트너'}
          {mode === 'local' && ' · 데모'}
        </span>
      </span>
    </Link>
  )
}

function NavGroup({ group, sideDark }: { group: NavGroupDef; sideDark: boolean }) {
  const hue = sideDark ? 'text-current' : group.hue === 'accent' ? 'text-accent-600' : group.hue === 'know' ? 'text-know-600' : 'text-ink-500'
  return (
    <div>
      <p className="t-meta mb-1.5 px-3 font-black tracking-[0.12em] text-side-muted">{group.label}</p>
      <ul className="flex flex-col gap-0.5">
        {group.items.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `nav-item tap flex items-center gap-3 rounded-(--radius-control) px-3 py-2.5 text-[1.02rem] font-semibold ${isActive ? 'bg-side-active text-side-active-fg' : 'text-side-muted hover:bg-side-hover hover:text-side-fg'}`
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon aria-hidden="true" className={`size-[22px] shrink-0 ${isActive ? 'text-current' : hue}`} />
                  {n.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Sidebar() {
  const { user } = useAuth()
  const { meta } = useTheme()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[272px] shrink-0 flex-col border-r border-side-line bg-side px-4 py-6 text-side-fg lg:flex" aria-label="사이드바">
      <div className="px-2">
        <BrandLogo tone={meta.sideDark ? 'dark' : 'light'} size="lg" />
      </div>
      <nav className="mt-8 flex flex-1 flex-col gap-6 overflow-y-auto" aria-label="주 메뉴">
        <NavGroup group={WORK} sideDark={meta.sideDark} />
        <NavGroup group={KNOWLEDGE} sideDark={meta.sideDark} />
        <NavGroup group={SYSTEM} sideDark={meta.sideDark} />
        {user?.role === 'master' && <NavGroup group={MASTER} sideDark={meta.sideDark} />}
      </nav>
      <div className="mt-4 border-t border-side-line px-3 pt-4">
        <p className="truncate text-[0.98rem] font-semibold">{user?.name}</p>
        <p className="t-meta truncate text-side-muted">{user?.email}</p>
      </div>
    </aside>
  )
}

function FocusRail() {
  const { meta } = useTheme()
  return (
    <aside className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col items-center border-r border-side-line bg-side py-5 lg:flex" aria-label="포커스 모드">
      <Link to="/" aria-label="홈으로" className="nav-item flex size-11 items-center justify-center rounded-(--radius-control) hover:bg-side-hover">
        <Home aria-hidden="true" className={`size-6 ${meta.sideDark ? 'text-white' : 'text-accent-600'}`} />
      </Link>
      <span className="mt-6 [writing-mode:vertical-rl] t-meta font-black tracking-[0.2em] text-side-muted">LIVE MEETING</span>
    </aside>
  )
}

function Header({ title, showDevice }: { title: string; showDevice: boolean }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-8 lg:py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="lg:hidden">
          <BrandLogo size="sm" subtitle={null} />
        </span>
        <h1 className="truncate text-[1.1rem] font-bold text-ink-900 lg:text-[1.35rem]" data-testid="route-title">
          {title}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4">
        <span className="hidden sm:inline-flex">
          <Clock />
        </span>
        <span className="sm:hidden">
          <Clock compact />
        </span>
        {showDevice && <DeviceSwitch />}
        <UserChip />
      </div>
    </header>
  )
}

function BottomNav() {
  return (
    <nav aria-label="주 메뉴" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white lg:hidden">
      <ul className="grid grid-cols-5">
        {BOTTOM.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav-item flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.8rem] font-bold ${isActive ? 'text-accent-700' : 'text-ink-500'}`}
            >
              {({ isActive }) => (
                <>
                  <span className={`inline-flex h-7 w-12 items-center justify-center rounded-full ${isActive ? 'bg-accent-50' : ''}`}>
                    <n.icon aria-hidden="true" className="size-6" />
                  </span>
                  {n.label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function ShellFrame({ focus, showDevice }: { focus: boolean; showDevice: boolean }) {
  const location = useLocation()
  const title = routeTitle(location.pathname)
  return (
    <div className="min-h-dvh lg:flex">
      {focus ? <FocusRail /> : <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        {!focus && <Header title={title} showDevice={showDevice} />}
        <main
          key={location.pathname}
          className={`route-enter mx-auto w-full min-w-0 flex-1 ${focus ? 'max-w-[1100px] px-4 py-3 sm:px-6 lg:py-5' : 'pb-safe-nav max-w-[1560px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-7 xl:px-9'}`}
        >
          <Outlet />
        </main>
      </div>
      {!focus && <BottomNav />}
    </div>
  )
}

function MobileStage() {
  return (
    <div className="flex min-h-dvh flex-col bg-paper-2">
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-2.5">
        <BrandLogo size="sm" />
        <div className="flex items-center gap-4">
          <Clock />
          <DeviceSwitch />
          <UserChip />
        </div>
      </div>
      <div className="flex flex-1 items-start justify-center py-8">
        <DeviceFrame />
      </div>
    </div>
  )
}

export function AppShell() {
  const location = useLocation()
  const { view, isDesktop, isFrame } = useDeviceView()
  const focus = /^\/meetings\/[^/]+\/live/.test(location.pathname)
  const showDevice = isDesktop && !isFrame

  if (isFrame) {
    return (
      <>
        <FrameSync />
        <ShellFrame focus={focus} showDevice={false} />
      </>
    )
  }
  if (showDevice && view === 'mobile') return <MobileStage />
  if (showDevice && view === 'dual') {
    return (
      <div className="flex min-h-dvh" data-testid="dual-view">
        <div className="min-w-0 flex-[0_0_67%]">
          <ShellFrame focus={focus} showDevice />
        </div>
        <aside className="sticky top-0 flex h-dvh flex-[0_0_33%] flex-col items-center justify-center border-l border-line bg-paper-2 px-3" aria-label="모바일 미리보기">
          <DeviceFrame />
          <p className="t-meta mt-3 text-ink-500">Mobile 390px · 같은 화면 · 같은 데이터</p>
        </aside>
      </div>
    )
  }
  return <ShellFrame focus={focus} showDevice={showDevice} />
}
