import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Button, TextInput, Field } from '../components/ui'
import { BrandLogo } from '../components/BrandLogo'

function sanitizeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return '/'
  return raw.slice(0, 300)
}

export default function LoginPage() {
  const { status, mode, configError, signIn, signInLocal, signOut, user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = sanitizeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = '로그인 · AX Partner OS'
  }, [])

  if (status === 'ready') return <Navigate to={next} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const r = await signIn(email, password)
    setBusy(false)
    if (!r.ok) setError(r.error ?? '로그인하지 못했습니다.')
    else navigate(next, { replace: true })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-[460px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo size="lg" />
          <p className="t-body mt-3 text-ink-500">미팅 5분 전에 열고, 1차 미팅을 진행하고, 버튼 한 번으로 김상호 대표의 운영 OS에 전달합니다.</p>
        </div>

        {status === 'config_error' && (
          <div role="alert" className="mb-4 rounded-(--radius-card) border border-danger-600/30 bg-danger-50 px-4 py-3 t-body text-danger-700">
            설정 오류: {configError ?? '환경변수를 확인해 주세요.'}
          </div>
        )}

        {status === 'no_access' && (
          <div role="alert" className="mb-4 rounded-(--radius-card) border border-warn-600/30 bg-warn-50 px-4 py-3 t-body text-warn-700">
            <p className="font-bold">파트너 등록이 아직 안 된 계정입니다{user?.email ? ` (${user.email})` : ''}.</p>
            <p className="mt-1">미래AI랩 마스터가 파트너로 등록하면 바로 사용할 수 있습니다.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void signOut()}>
              다른 계정으로 로그인
            </Button>
          </div>
        )}

        <div className="rounded-(--radius-card) border border-line bg-white p-6 sm:p-7">
          {mode === 'local' ? (
            <div>
              <p className="t-section">데모 모드 — 역할을 골라 들어가세요</p>
              <p className="t-sub mt-1 text-ink-500">브라우저에만 저장됩니다. 실제 운영은 supabase 모드에서 미래AI랩 계정으로 로그인합니다.</p>
              <div className="mt-4 grid gap-2.5">
                <Button variant="primary" size="lg" onClick={() => signInLocal('partner')} data-testid="login-partner">
                  파트너(컨설턴트)로 시작
                </Button>
                <Button variant="dark" size="lg" onClick={() => signInLocal('master')} data-testid="login-master">
                  마스터(미래AI랩)로 시작
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <Field label="이메일">
                <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="miraeailab.com 에 가입한 이메일" required />
              </Field>
              <Field label="비밀번호">
                <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </Field>
              {error && (
                <p role="alert" className="rounded-(--radius-control) bg-danger-50 px-3 py-2 t-sub font-semibold text-danger-700">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || status === 'config_error'}>
                {busy ? '로그인 중…' : '로그인'}
              </Button>
              <p className="t-sub text-center text-ink-500">
                계정은 미래AI랩 홈페이지(miraeailab.com)와 같습니다. 계정이 없으면 홈페이지에서 먼저 가입해 주세요.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
