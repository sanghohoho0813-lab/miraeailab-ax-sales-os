/**
 * 인증·권한 컨텍스트.
 *
 * supabase 모드: 미래AI랩 공용 Supabase Auth(홈페이지와 같은 계정). 로그인 후 partner_current_role() RPC 로
 *   partner / master / (없음) 을 판정한다. 파트너 등록은 마스터가 한다.
 * local 모드: 로그인 없이 역할만 고른다(시연·e2e).
 *
 * UI는 이 컨텍스트와 Repository 만 쓰고 Supabase SDK 를 직접 호출하지 않는다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { CurrentUser, PartnerRole } from '../types/domain'
import { getDataModeConfig } from '../data/dataMode'
import type { Repository } from '../data/repository'
import { LocalRepository, readLocalMember } from '../data/localRepository'

export type AuthStatus = 'loading' | 'config_error' | 'signed_out' | 'no_access' | 'ready'

interface AuthValue {
  status: AuthStatus
  mode: 'local' | 'supabase'
  configError: string | null
  user: CurrentUser | null
  repo: Repository
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
  /** local 모드 전용 — 역할 선택 로그인 */
  signInLocal: (role: PartnerRole) => void
  /** 파트너 정보(이름·호칭)를 다시 읽는다 — 마스터가 바꾼 뒤 */
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)
const LOCAL_ROLE_KEY = 'axpartner.local_role'

const LOCAL_USERS: Record<PartnerRole, CurrentUser> = {
  partner: { id: 'local-partner', email: 'partner@example.com', name: '곽주환', role: 'partner', title: '팀장' },
  master: { id: 'local-master', email: 'sanghohoho0813@gmail.com', name: '김상호', role: 'master', title: '대표' },
}

/** local 모드 시연·E2E — 'axpartner.local_profile_id' 가 있으면 그 파트너로 로그인한다 (두 번째 파트너 격리 확인용) */
const LOCAL_PROFILE_KEY = 'axpartner.local_profile_id'

/** local 모드: partner_members 흉내(localStorage)가 프로필 원천 */
function localUser(role: PartnerRole): CurrentUser {
  let base = LOCAL_USERS[role]
  try {
    const override = localStorage.getItem(LOCAL_PROFILE_KEY)
    if (role === 'partner' && override && override !== base.id) {
      const om = readLocalMember(override)
      if (om && om.role === 'partner') base = { id: om.profileId, email: om.email, name: om.displayName, role: 'partner', title: om.title }
    }
  } catch {
    /* noop */
  }
  const m = readLocalMember(base.id)
  return m ? { ...base, name: m.displayName || base.name, title: m.title ?? base.title } : base
}

function readLocalRole(): PartnerRole | null {
  try {
    const v = localStorage.getItem(LOCAL_ROLE_KEY)
    return v === 'partner' || v === 'master' ? v : null
  } catch {
    return null
  }
}

function mapAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (m.includes('email not confirmed')) return '이메일 인증이 필요합니다. 메일함을 확인해 주세요.'
  if (m.includes('rate limit') || m.includes('too many')) return '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
  return '로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const cfg = getDataModeConfig()
  const isLocal = cfg.mode === 'local'
  const [status, setStatus] = useState<AuthStatus>(() => (cfg.configError ? 'config_error' : isLocal ? (readLocalRole() ? 'ready' : 'signed_out') : 'loading'))
  const [user, setUser] = useState<CurrentUser | null>(() => (isLocal ? (readLocalRole() ? localUser(readLocalRole()!) : null) : null))
  const [repo, setRepo] = useState<Repository>(() => new LocalRepository())

  // supabase 모드 부트스트랩
  useEffect(() => {
    if (isLocal || cfg.configError) return
    let alive = true
    let unsub: (() => void) | undefined
    ;(async () => {
      const [{ getSupabaseClient }, { SupabaseRepository }] = await Promise.all([import('../data/supabaseClient'), import('../data/supabaseRepository')])
      const client = getSupabaseClient()
      if (!alive) return
      setRepo(new SupabaseRepository(client))
      const resolve = async (session: Session | null) => {
        if (!session?.user) {
          if (alive) {
            setUser(null)
            setStatus('signed_out')
          }
          return
        }
        const { data, error } = await client.rpc('partner_current_role')
        if (!alive) return
        const role = !error && (data === 'partner' || data === 'master') ? (data as PartnerRole) : null
        if (!role) {
          setUser({ id: session.user.id, email: session.user.email ?? '', name: '', role: 'partner' })
          setStatus('no_access')
          return
        }
        // Partner OS 안의 이름·호칭은 partner_members 가 원천(0005 partner_current_profile). 없으면 auth metadata → profiles 순으로 보조.
        const meta = (session.user.user_metadata ?? {}) as { name?: string; full_name?: string }
        let name = ''
        let title = ''
        try {
          const { data: prof } = await client.rpc('partner_current_profile')
          const pr = (prof ?? null) as { display_name?: string; title?: string } | null
          if (pr) {
            name = pr.display_name ?? ''
            title = pr.title ?? ''
          }
        } catch {
          /* 0005 미적용 환경 */
        }
        if (!name) name = meta.name ?? meta.full_name ?? ''
        if (!name) {
          try {
            const { data: p } = await client.from('profiles').select('name').eq('id', session.user.id).maybeSingle()
            if (p && typeof (p as { name?: unknown }).name === 'string') name = (p as { name: string }).name
          } catch {
            /* profiles 미조회 환경 */
          }
        }
        setUser({ id: session.user.id, email: session.user.email ?? '', name: name || (session.user.email ?? '').split('@')[0], role, title })
        setStatus('ready')
      }
      const { data } = await client.auth.getSession()
      await resolve(data.session)
      const sub = client.auth.onAuthStateChange((_e, s) => void resolve(s))
      unsub = () => sub.data.subscription.unsubscribe()
    })().catch(() => {
      if (alive) setStatus('config_error')
    })
    return () => {
      alive = false
      unsub?.()
    }
  }, [isLocal, cfg.configError])

  const signIn = useCallback(async (email: string, password: string) => {
    if (isLocal) return { ok: false, error: 'local 모드에서는 역할 선택으로 들어갑니다.' }
    const { getSupabaseClient } = await import('../data/supabaseClient')
    const { error } = await getSupabaseClient().auth.signInWithPassword({ email: email.trim(), password })
    if (error) return { ok: false, error: mapAuthError(error.message) }
    return { ok: true }
  }, [isLocal])

  const signOut = useCallback(async () => {
    if (isLocal) {
      try {
        localStorage.removeItem(LOCAL_ROLE_KEY)
      } catch {
        /* noop */
      }
      setUser(null)
      setStatus('signed_out')
      return
    }
    const { getSupabaseClient } = await import('../data/supabaseClient')
    await getSupabaseClient().auth.signOut()
    setUser(null)
    setStatus('signed_out')
  }, [isLocal])

  const signInLocal = useCallback(
    (role: PartnerRole) => {
      if (!isLocal) return
      try {
        localStorage.setItem(LOCAL_ROLE_KEY, role)
      } catch {
        /* noop */
      }
      setUser(localUser(role))
      setStatus('ready')
    },
    [isLocal],
  )

  const refreshProfile = useCallback(async () => {
    if (!user) return
    if (isLocal) {
      setUser(localUser(user.role))
      return
    }
    const { getSupabaseClient } = await import('../data/supabaseClient')
    const { data } = await getSupabaseClient().rpc('partner_current_profile')
    const pr = (data ?? null) as { display_name?: string; title?: string } | null
    if (pr) setUser({ ...user, name: pr.display_name || user.name, title: pr.title ?? '' })
  }, [isLocal, user])

  const value = useMemo<AuthValue>(
    () => ({ status, mode: cfg.mode, configError: cfg.configError, user, repo, signIn, signOut, signInLocal, refreshProfile }),
    [status, cfg.mode, cfg.configError, user, repo, signIn, signOut, signInLocal, refreshProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 사용할 수 있습니다.')
  return ctx
}

/** 로그인 완료 상태에서만 쓰는 도우미 — user 가 반드시 있다 */
export function useSession(): { user: CurrentUser; repo: Repository; mode: 'local' | 'supabase' } {
  const { user, repo, mode } = useAuth()
  if (!user) throw new Error('로그인이 필요합니다.')
  return { user, repo, mode }
}
