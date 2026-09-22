import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { THEMES, useTheme } from '../lib/theme'
import { DEVICE_VIEWS, useDeviceView } from '../lib/deviceView'
import { Button, PageTitle, Section, Badge } from '../components/ui'
import { resetLocalStore } from '../data/localRepository'

export default function SettingsPage() {
  const { user, mode, signOut, signInLocal } = useAuth()
  const { theme, setTheme } = useTheme()
  const { view, setView, isDesktop } = useDeviceView()
  const navigate = useNavigate()
  useEffect(() => {
    document.title = '설정 · AX Partner OS'
  }, [])
  return (
    <div className="mx-auto max-w-[880px] space-y-5">
      <PageTitle title="설정" sub="테마와 화면 보기는 이 브라우저에만 저장됩니다." />
      <Section title="테마" sub="기본은 Pure White · 미래AI랩. 테마는 사이드바·주 색·선택·KPI 강조만 바꿉니다.">
        <div role="radiogroup" aria-label="테마" className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {THEMES.map((t) => {
            const on = theme === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                data-testid={`theme-${t.id}`}
                onClick={() => setTheme(t.id)}
                className={`choice tap flex items-center gap-3 rounded-(--radius-control) border-2 px-3 py-3 text-left ${on ? 'border-accent-600 bg-accent-50' : 'border-line bg-white hover:border-accent-200'}`}
              >
                <span aria-hidden="true" className="flex shrink-0 overflow-hidden rounded-[8px] border border-line">
                  <span className="block h-9 w-5" style={{ background: t.swatch.side }} />
                  <span className="block h-9 w-9 bg-white" />
                  <span className="block h-9 w-3" style={{ background: t.swatch.accent }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[1rem] font-bold leading-tight">{t.label}</span>
                  <span className="t-meta block text-ink-500">{t.desc}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Section>
      {isDesktop && (
        <Section title="화면 보기 (Device View)" sub="PC 에서 미팅 화면을 폰 크기로 함께 확인할 때 씁니다. 헤더에서도 바꿀 수 있습니다.">
          <div role="radiogroup" aria-label="Device View" className="grid gap-2.5 sm:grid-cols-3">
            {DEVICE_VIEWS.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={view === d.id}
                onClick={() => setView(d.id)}
                className={`choice tap rounded-(--radius-control) border-2 px-4 py-3 text-left ${view === d.id ? 'border-accent-600 bg-accent-50' : 'border-line bg-white hover:border-accent-200'}`}
              >
                <span className="block text-[1rem] font-bold">{d.label}</span>
                <span className="t-meta block text-ink-500">{d.hint}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
      <Section title="내 정보">
        <dl className="t-body grid gap-1 sm:grid-cols-[8rem_1fr]">
          <dt className="font-bold text-ink-500">이름</dt>
          <dd>{user?.name}</dd>
          <dt className="font-bold text-ink-500">이메일</dt>
          <dd>{user?.email}</dd>
          <dt className="font-bold text-ink-500">역할</dt>
          <dd>
            <Badge tone={user?.role === 'master' ? 'dark' : 'accent'}>{user?.role === 'master' ? '마스터 (미래AI랩)' : '파트너 (컨설턴트)'}</Badge>
          </dd>
          <dt className="font-bold text-ink-500">데이터</dt>
          <dd>{mode === 'local' ? '브라우저 데모 (localStorage)' : '미래AI랩 공용 Supabase (홈페이지·운영 OS 와 같은 프로젝트)'}</dd>
        </dl>
        <p className="t-sub mt-3 text-ink-500">
          파트너에게는 본인이 등록하거나 담당하는 업체·미팅·사례·플레이북만 보입니다. 운영 OS 전체 정보와 내부 가격 전략은 노출되지 않습니다.
        </p>
      </Section>
      {user?.role === 'master' && (
        <Section title="마스터 메뉴">
          <div className="flex flex-wrap gap-2">
            <Link to="/master/inbox">
              <Button>2차 제안 요청함</Button>
            </Link>
            <Link to="/master/partners">
              <Button>파트너 관리</Button>
            </Link>
            <Link to="/cases">
              <Button>사례 DB 관리</Button>
            </Link>
          </div>
        </Section>
      )}
      {mode === 'local' && (
        <Section title="데모 도구" sub="브라우저에만 저장됩니다.">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => signInLocal(user?.role === 'master' ? 'partner' : 'master')}>{user?.role === 'master' ? '파트너로 전환' : '마스터로 전환'}</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm('데모 데이터를 모두 지울까요?')) {
                  resetLocalStore()
                  navigate('/')
                }
              }}
            >
              데모 데이터 초기화
            </Button>
          </div>
        </Section>
      )}
      <Section title="로그아웃">
        <Button variant="secondary" onClick={() => void signOut().then(() => navigate('/login'))}>
          로그아웃
        </Button>
      </Section>
    </div>
  )
}
