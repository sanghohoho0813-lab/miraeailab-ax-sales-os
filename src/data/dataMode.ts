/**
 * 데이터 모드 — local(브라우저 데모) vs supabase(미래AI랩 공용 프로젝트).
 * 운영 OS(AX-MVP-Factory-OS/src/data/dataMode.ts)와 같은 규칙: 환경변수로만 결정하고,
 * 불완전하면 조용히 local 로 바꾸지 않고 설정 오류로 보고한다. anon 자리에 비밀 키가 오면 차단한다.
 */
export type DataMode = 'local' | 'supabase'

export interface DataModeConfig {
  mode: DataMode
  supabaseUrl: string
  supabaseAnonKey: string
  opsOsUrl: string
  configError: string | null
  missingKeys: string[]
}

function readEnv(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

export function looksLikeServiceRoleKey(key: string): boolean {
  try {
    const parts = key.split('.')
    if (parts.length !== 3) return false
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

export function looksLikeSecretApiKey(key: string): boolean {
  return key.trim().startsWith('sb_secret_')
}

export function resolveDataModeConfig(): DataModeConfig {
  const rawMode = readEnv('VITE_DATA_MODE').toLowerCase()
  const supabaseUrl = readEnv('VITE_SUPABASE_URL')
  const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY')
  const opsOsUrl = readEnv('VITE_OPS_OS_URL')
  const mode: DataMode = rawMode === 'supabase' ? 'supabase' : 'local'
  const missingKeys: string[] = []
  let configError: string | null = null
  if (rawMode && rawMode !== 'local' && rawMode !== 'supabase') configError = 'VITE_DATA_MODE 값은 local 또는 supabase 여야 합니다.'
  if (mode === 'supabase') {
    if (!supabaseUrl) missingKeys.push('VITE_SUPABASE_URL')
    if (!supabaseAnonKey) missingKeys.push('VITE_SUPABASE_ANON_KEY')
    if (missingKeys.length) configError = '클라우드 모드(supabase)에 필요한 환경변수가 없습니다.'
    else if (!/^https:\/\//.test(supabaseUrl) || /\/dashboard\//.test(supabaseUrl)) configError = 'VITE_SUPABASE_URL 은 https://<ref>.supabase.co 형식의 API 주소여야 합니다.'
    else if (looksLikeServiceRoleKey(supabaseAnonKey) || looksLikeSecretApiKey(supabaseAnonKey)) configError = 'VITE_SUPABASE_ANON_KEY 자리에 비밀 키(service_role / sb_secret_)가 들어있습니다. 브라우저에는 공개 키만 사용하세요.'
  }
  return { mode, supabaseUrl, supabaseAnonKey, opsOsUrl, configError, missingKeys }
}

let cached: DataModeConfig | null = null
export function getDataModeConfig(): DataModeConfig {
  if (!cached) cached = resolveDataModeConfig()
  return cached
}
