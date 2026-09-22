import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Button, PageTitle, Section, Badge } from '../components/ui'
import { resetLocalStore } from '../data/localRepository'

export default function SettingsPage() {
  const { user, mode, signOut, signInLocal } = useAuth()
  const navigate = useNavigate()
  useEffect(() => {
    document.title = '설정 · AX 미팅 가이드'
  }, [])
  return (
    <div className="space-y-4">
      <PageTitle title="설정 · 프로필" />
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
