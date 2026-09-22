/**
 * 앱 셸 — 세 단계 반응형.
 *   <1024   : 상단 바 + 하단 내비 5개 (모바일·태블릿)
 *   1024~1279: Compact Desktop — 72px 아이콘 레일 (본문이 갑자기 272px 줄지 않는다)
 *   ≥1280   : 그룹 사이드바 272px (WORK / KNOWLEDGE / SYSTEM / MASTER)
 * 글로벌 헤더: 라우트 제목 · 실시간 시계 · Device View · 사용자. 우선순위(제목 > 시간 > 사용자)에 따라 컨테이너 폭 기준으로 축약한다.
 * Device View: Mobile = 390px 가상 뷰포트, PC+Mobile = 1280px + 390px 두 가상 뷰포트를 scale 해서 나란히(≥1440 에서만).
 * LIVE MEETING 은 포커스 모드(레일만).
 */
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom'
import { BookOpen, Building2, CalendarClock, Home, Library, MoreHorizontal, Inbox, Users, Settings, Monitor, Smartphone, Columns2, ClipboardList, BarChart3, type LucideIcon } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { DEVICE_VIEWS, DUAL_MIN_WIDTH, VIRTUAL_MOBILE_WIDTH, VIRTUAL_PC_WIDTH, useDeviceView, type DeviceView } from '../lib/deviceView'
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
    { to: '/master/usage', label: '사용 데이터', icon: BarChart3 },
    { to: '/master/audit', label: '변경 기록', icon: ClipboardList },
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

/**
 * 글로벌 시계 — 어떤 폭에서도 날짜를 숨기지 않는다.
 *
 * 미팅은 "언제" 가 기록의 전부다. 390px 에서 시각만 보이면 Partner 가 오늘이 며칠인지 앱 밖에서 확인해야 한다.
 * 좁으면 두 줄(2026.09.22 화 / 22:15:34), 넓으면 한 줄(2026.09.22 화요일 · 22:15:34)로 접는다.
 * 타이머는 useClock() 하나만 쓴다 — 화면마다 새 setInterval 을 만들지 않는다.
 */
function Clock() {
  const c = useClock()
  return (
    <time
      data-testid="live-clock"
      className="tnum flex shrink-0 flex-col items-end leading-tight whitespace-nowrap text-ink-700 @3xl/header:flex-row @3xl/header:items-baseline @3xl/header:gap-2"
      aria-live="off"
      title={`${c.date} ${c.weekday}`}
    >
      <span className="t-meta font-bold text-ink-500" data-testid="clock-date">
        {c.date} <span className="@3xl/header:hidden">{c.weekdayShort}</span>
        <span className="hidden @3xl/header:inline">{c.weekday}</span>
      </span>
      <span aria-hidden="true" className="hidden text-ink-300 @3xl/header:inline">
        ·
      </span>
      <span className="text-[1rem] font-bold text-ink-900 @3xl/header:text-[1.05rem]" data-testid="clock-time">
        {c.time}
      </span>
    </time>
  )
}

function DeviceSwitch() {
  const { view, setView, dualAllowed, width } = useDeviceView()
  return (
    <div role="radiogroup" aria-label="Device View" data-testid="device-switch" className="hidden items-center rounded-(--radius-control) border border-line bg-paper-2 p-0.5 lg:inline-flex">
      {DEVICE_VIEWS.map((d) => {
        const Icon = DEVICE_ICON[d.id]
        const on = view === d.id
        const disabled = d.id === 'dual' && !dualAllowed
        return (
          <button
            key={d.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={disabled}
            title={disabled ? `PC+Mobile 동시보기는 ${DUAL_MIN_WIDTH}px 이상에서 사용할 수 있습니다 (지금 ${width}px)` : d.hint}
            onClick={() => (disabled ? undefined : setView(d.id))}
            data-testid={`device-${d.id}`}
            className={`nav-item inline-flex h-9 items-center gap-1.5 rounded-[9px] px-2.5 t-meta font-bold ${on && !disabled ? 'bg-white text-ink-900 shadow-(--shadow-card)' : disabled ? 'cursor-not-allowed text-ink-300' : 'text-ink-500 hover:text-ink-900'}`}
          >
            <Icon aria-hidden="true" className="size-4" />
            <span className="hidden @3xl/header:inline">{d.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function UserChip() {
  const { user, mode } = useAuth()
  return (
    <Link to="/settings" className="nav-item inline-flex min-w-0 items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-1 hover:bg-paper-2 @xl/header:pr-3" aria-label="설정 · 프로필" title={`${user?.name ?? ''} · ${user?.role === 'master' ? '마스터' : '파트너'}`}>
      <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-[0.9rem] font-black text-accent-800">
        {user?.name?.slice(0, 1) ?? '?'}
      </span>
      <span className="hidden min-w-0 @xl/header:block">
        <span className="block truncate text-[0.95rem] font-bold leading-tight" data-testid="user-chip-name">
          {user?.name}
          {user?.title ? ` ${user.title}` : ''}
        </span>
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
    <aside className="sticky top-0 hidden h-dvh w-[272px] shrink-0 flex-col border-r border-side-line bg-side px-4 py-6 text-side-fg xl:flex" aria-label="사이드바" data-testid="sidebar-full">
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
        <p className="truncate text-[0.98rem] font-semibold">
          {user?.name}
          {user?.title ? ` ${user.title}` : ''}
        </p>
        <p className="t-meta truncate text-side-muted">{user?.email}</p>
      </div>
    </aside>
  )
}

/** 1024~1279: 아이콘 레일 — 그룹 구분선 + 툴팁(title) */
function Rail() {
  const { user } = useAuth()
  const { meta } = useTheme()
  const groups = [WORK, KNOWLEDGE, SYSTEM, ...(user?.role === 'master' ? [MASTER] : [])]
  return (
    <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col items-center border-r border-side-line bg-side py-4 text-side-fg lg:flex xl:hidden" aria-label="사이드바 (축소)" data-testid="sidebar-rail">
      <Link to="/" aria-label="홈" className="mb-3 flex size-11 items-center justify-center">
        <img src={meta.sideDark ? '/brand/mirae-ai-lab-logo-light.png' : '/brand/mirae-ai-lab-logo-transparent.png'} alt="미래AI랩" className="h-7 w-auto object-contain" />
      </Link>
      <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto" aria-label="주 메뉴">
        {groups.map((g, gi) => (
          <div key={g.label} className={`flex flex-col items-center gap-1 ${gi > 0 ? 'mt-2 border-t border-side-line pt-2' : ''}`}>
            {g.items.map((n) => {
              const hue = meta.sideDark ? 'text-current' : g.hue === 'accent' ? 'text-accent-600' : g.hue === 'know' ? 'text-know-600' : 'text-ink-500'
              return (
                <NavLink key={n.to} to={n.to} end={n.end} title={n.label} aria-label={n.label} className={({ isActive }) => `nav-item flex size-11 items-center justify-center rounded-(--radius-control) ${isActive ? 'bg-side-active text-side-active-fg' : 'text-side-muted hover:bg-side-hover hover:text-side-fg'}`}>
                  {({ isActive }) => <n.icon aria-hidden="true" className={`size-[22px] ${isActive ? 'text-current' : hue}`} />}
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>
      <span aria-hidden="true" className="mt-2 inline-flex size-9 items-center justify-center rounded-full bg-accent-100 text-[0.9rem] font-black text-accent-800" title={user?.name}>
        {user?.name?.slice(0, 1)}
      </span>
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
    <header className="@container/header sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-white/95 px-4 py-2.5 backdrop-blur sm:px-6 lg:px-6 lg:py-3 xl:px-8">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="hidden shrink-0 min-[420px]:inline lg:hidden">
          <BrandLogo size="sm" subtitle={null} />
        </span>
        <p className="min-w-0 flex-1 truncate text-[1.1rem] font-bold text-ink-900 lg:text-[1.35rem]" data-testid="route-title">
          {title}
        </p>
      </div>
      <div className="flex min-w-0 shrink items-center gap-2 sm:gap-3 lg:gap-4">
        <Clock />
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
      {focus ? (
        <FocusRail />
      ) : (
        <>
          <Rail />
          <Sidebar />
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {!focus && <Header title={title} showDevice={showDevice} />}
        <main
          key={location.pathname}
          className={`route-enter mx-auto w-full min-w-0 flex-1 ${focus ? 'max-w-[1100px] px-4 py-3 sm:px-6 lg:py-5' : 'pb-safe-nav max-w-[1560px] px-4 py-4 sm:px-6 sm:py-6 lg:px-6 lg:py-7 xl:px-8 2xl:px-9'}`}
        >
          <Outlet />
        </main>
      </div>
      {!focus && <BottomNav />}
    </div>
  )
}

/** Mobile / PC+Mobile 스테이지 — 부모는 크롬(상단 바)만 그리고 화면은 가상 뷰포트 iframe 이 그린다 */
function PreviewStage({ dual }: { dual: boolean }) {
  return (
    <div className="flex h-dvh flex-col bg-paper-2" data-testid={dual ? 'dual-view' : 'mobile-view'}>
      <div className="@container/header flex items-center justify-between gap-3 border-b border-line bg-white px-6 py-2.5">
        <BrandLogo size="sm" />
        <div className="flex items-center gap-4">
          <Clock />
          <DeviceSwitch />
          <UserChip />
        </div>
      </div>
      {dual ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,67fr)_minmax(0,33fr)] gap-6 px-6 py-5">
          <div className="min-h-0 min-w-0">
            <p className="t-meta mb-2 font-bold text-ink-500">PC · {VIRTUAL_PC_WIDTH}px 가상 뷰포트 (scale)</p>
            <div className="h-[calc(100%-1.75rem)] min-h-0">
              <DeviceFrame kind="pc" width={VIRTUAL_PC_WIDTH} height={860} fit="both" />
            </div>
          </div>
          <div className="min-h-0 min-w-0">
            <p className="t-meta mb-2 font-bold text-ink-500">Mobile · {VIRTUAL_MOBILE_WIDTH}px · 같은 화면 · 같은 데이터</p>
            <div className="h-[calc(100%-1.75rem)] min-h-0">
              <DeviceFrame kind="mobile" width={VIRTUAL_MOBILE_WIDTH} height={844} fit="both" />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto px-6 py-6">
          <div className="h-full w-[410px] max-w-full">
            <DeviceFrame kind="mobile" width={VIRTUAL_MOBILE_WIDTH} height={844} fit="both" />
          </div>
        </div>
      )}
    </div>
  )
}

export function AppShell() {
  const location = useLocation()
  const { effectiveView, isDesktop, isFrame } = useDeviceView()
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
  if (showDevice && effectiveView === 'mobile') return <PreviewStage dual={false} />
  if (showDevice && effectiveView === 'dual') return <PreviewStage dual />
  return <ShellFrame focus={focus} showDevice={showDevice} />
}
